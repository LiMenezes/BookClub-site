require('dotenv').config({path:require('node:path').join(__dirname,'..','.env'),quiet:true});
const express=require('express');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const bcrypt=require('bcryptjs');
const {openDatabase}=require('./db');
const V=require('./validation');
const {mailConfigured,sendMail}=require('./mailer');
const {productionConfig}=require('./config');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const today=()=>new Date().toISOString().slice(0,10);
const cookie=(req,key)=>String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).find(x=>x[0]===key)?.[1];

async function createApp({db,env=process.env,mailSink}={}){
 if(env.NODE_ENV==='production'){const errors=productionConfig(env);if(errors.length)throw new Error(errors.join(' '));}
 db ||= await openDatabase(env);
 await db.transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(817235)');
   // Both schema files are migration inputs, never publicly served.
   if(tx.query) {for(const file of ['schema.sql','migrate.sql']){
     const statements=fs.readFileSync(path.join(__dirname,file),'utf8').split(';').map(s=>s.trim()).filter(Boolean);
     for(const sql of statements)await tx.query(sql);
   }}
 });
 if(db.harden)await db.harden();
 const app=express();app.disable('x-powered-by');if(env.TRUST_PROXY)app.set('trust proxy',V.integer(env.TRUST_PROXY,1,3));
 const prod=env.NODE_ENV==='production';
 const origin=env.APP_ORIGIN||`http://localhost:${env.PORT||3000}`;

 const secure=prod;
 app.use((req,res,next)=>{
   res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY',
     'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'Permissions-Policy':'camera=(self), microphone=(), geolocation=()'});
   if(prod)res.set('Strict-Transport-Security','max-age=31536000');
   if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');
   if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
     if(req.headers['x-bookclub-client']!=='web')return res.status(403).json({error:'Solicitação não autorizada.'});
     if(req.headers.origin&&req.headers.origin!==origin)return res.status(403).json({error:'Origem não autorizada.'});
   }next();
 });
 app.use(express.json({limit:'4mb'}));
 app.use((req,res,next)=>{if(req.body!==undefined&&(typeof req.body!=='object'||req.body===null||Array.isArray(req.body)))return res.status(400).json({error:'Envie um objeto JSON válido.'});req.body ||= {};next();});
 const eventResponses=new Set();
 const updates=new (require('node:events').EventEmitter)();updates.setMaxListeners(500);
 app.use('/api',(req,res,next)=>{if(['POST','PUT','DELETE','PATCH'].includes(req.method))res.on('finish',()=>{if(res.statusCode<400)updates.emit('change');});next();});
 const limits=new Map();
 const limiter=(limit,ms)=> (req,res,next)=>{const k=req.ip+':'+req.path;const now=Date.now();let x=limits.get(k);if(!x||x.until<now)x={n:0,until:now+ms};x.n++;limits.set(k,x);if(x.n>limit){res.set('Retry-After',String(Math.ceil((x.until-now)/1000)));return res.status(429).json({error:'Muitas tentativas. Tente novamente em alguns minutos.'});}next();};
 const cleanTimer=setInterval(()=>{for(const [k,v]of limits)if(v.until<Date.now())limits.delete(k);},60000);cleanTimer.unref();
 app.use('/api',limiter(240,60000));app.use('/api/auth',limiter(20,60000));
 const q=(sql,p=[])=>db.query(sql,p);
 const one=async(sql,p=[])=> (await q(sql,p)).rows[0];
 const publicUser=u=>({id:u.id,name:u.name,username:u.username,avatar:u.avatar,banner:u.banner,bio:u.bio,is_private:u.is_private,links:u.links,favorites:u.favorites,created_at:u.created_at});
 const ownUser=u=>({...publicUser(u),email:u.email,email_verified:u.email_verified,reading_goal:u.reading_goal,is_admin:u.is_admin});
 const auth=async(req,res,next)=>{
   const token=cookie(req,'bc_session');
   const u=token&&await one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>NOW()',[hash(token)]);
   if(!u)return res.status(401).json({error:'Entre na sua conta para continuar.'});req.user=u;next();
 };
 const session=async(res,u)=>{const token=random();await q("INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",[hash(token),u.id]);res.cookie('bc_session',token,{httpOnly:true,secure,sameSite:'lax',maxAge:7*86400000,path:'/'});};
 const visible=(alias,viewer)=>`(${alias}.id=${viewer} OR NOT ${alias}.is_private OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${viewer} AND f.following_id=${alias}.id AND f.approved))`;
 const canSee=async(viewer,id)=>!!await one(`SELECT id FROM users u WHERE u.id=$2 AND ${visible('u','$1')}`,[viewer,id]);
 const requireProfile=async(viewer,id)=>{const u=await one('SELECT * FROM users WHERE id=$1',[id]);if(!u)V.fail('Perfil não encontrado.',404);if(!await canSee(viewer,id))V.fail('Este perfil é privado. Solicite para seguir.',403);return u;};
 const review=async(viewer,id)=>{const r=await one(`SELECT r.*,b.title,u.name FROM reviews r JOIN users u ON u.id=r.user_id JOIN books b ON b.id=r.book_id WHERE r.id=$2 AND ${visible('u','$1')}`,[viewer,id]);if(!r)V.fail('Resenha não encontrada.',404);return r;};
 const list=async(viewer,id,owner=false)=>{const l=await one(`SELECT l.* FROM lists l JOIN users u ON u.id=l.user_id WHERE l.id=$2 AND (l.user_id=$1 OR (l.is_public AND ${visible('u','$1')}))`,[viewer,id]);if(!l)V.fail('Lista não encontrada.',404);if(owner&&String(l.user_id)!==String(viewer))V.fail('Esta lista pertence a outra pessoa.',403);return l;};
 const notify=async(tx,user,actor,kind,content,reviewId=null)=>{if(String(user)!==String(actor))await tx.query('INSERT INTO notifications(user_id,actor_id,kind,content,review_id) VALUES($1,$2,$3,$4,$5)',[user,actor,kind,content,reviewId]);};
 const verified=async(req,res,next)=>{if((prod||env.REQUIRE_EMAIL==='true')&&!req.user.email_verified)return res.status(403).json({error:'Confirme seu e-mail para publicar.'});next();};
 const sendToken=async(u,kind)=>{
   const token=random();await q("INSERT INTO auth_tokens(id,user_id,kind,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour')",[hash(token),u.id,kind]);
   const link=origin+'/#'+(kind==='reset'?'reset':'verify')+'?token='+encodeURIComponent(token);
   const mail={from:env.MAIL_FROM||'BookClub <nao-responda@localhost>',to:u.email,subject:kind==='reset'?'Redefina sua senha do BookClub':'Confirme seu e-mail no BookClub',text:`Olá, ${u.name}.\n\n${link}\n\nEste link expira em uma hora. Se você não solicitou, ignore este e-mail.`};
   if(mailSink)await mailSink(mail);
   else if(mailConfigured(env))await sendMail(mail,env);
   else V.fail('Envio de e-mail não configurado no servidor.',503);
 };
 app.get('/api/config',(req,res)=>res.json({email:!!(mailConfigured(env)||mailSink),oauth:{google:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),github:!!(env.GITHUB_CLIENT_ID&&env.GITHUB_CLIENT_SECRET)},local:env.DB_DRIVER==='pglite'}));
 app.get('/api/health',async(req,res)=>{await q('SELECT 1');res.json({ok:true});});
 app.post('/api/auth/register',async(req,res)=>{
   const name=V.text(req.body.name,2,120),username=V.text(req.body.username,3,40).toLowerCase().replace(/^@/,'');
   if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username))V.fail('Use de 3 a 40 letras, números, ponto, hífen ou sublinhado no usuário.');
   const email=V.text(req.body.email,3,255).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))V.fail('E-mail inválido.');
   const password=V.password(req.body.password);
   const u=await one('INSERT INTO users(name,username,email,password_hash) VALUES($1,$2,$3,$4) RETURNING *',[name,username,email,await bcrypt.hash(password,12)]);
   await session(res,u);let emailSent=false;if(mailConfigured(env)||mailSink)try{await sendToken(u,'verify');emailSent=true;}catch(e){console.error('Falha no envio de confirmação:',e.message);}
   res.status(201).json({user:ownUser(u),emailSent});
 });
 app.post('/api/auth/login',async(req,res)=>{const id=V.text(req.body.identifier,1,255).replace(/^@/,'');const u=await one('SELECT * FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($1)',[id]);const ok=await bcrypt.compare(String(req.body.password||''),u?.password_hash||'$2b$12$IB0NtzZ.3uQDCuMqKO3X9e/8IoLp.dS6IXc5q1cUS9sXWH97D55lq');if(!u||!ok)V.fail('E-mail/usuário ou senha inválidos.',401);await session(res,u);res.json({user:ownUser(u)});});
 app.post('/api/auth/logout',async(req,res)=>{const t=cookie(req,'bc_session');if(t)await q('DELETE FROM sessions WHERE id=$1',[hash(t)]);res.clearCookie('bc_session',{path:'/',httpOnly:true,secure,sameSite:'lax'});res.json({ok:true});});
 app.get('/api/auth/me',auth,(req,res)=>res.json(ownUser(req.user)));
 app.get('/api/events',auth,(req,res)=>{eventResponses.add(res);res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders();res.write('retry: 10000\n\n');
   const change=()=>res.write('event: change\ndata: {}\n\n');updates.on('change',change);
   const timer=setInterval(async()=>{try{const valid=await one('SELECT 1 FROM sessions WHERE id=$1 AND expires_at>NOW()',[hash(cookie(req,'bc_session')||'')]);if(!valid)return res.end();res.write(': heartbeat\n\n');}catch{res.end();}},25000);
   req.on('close',()=>{clearInterval(timer);updates.off('change',change);eventResponses.delete(res);});
 });
 app.post('/api/auth/forgot',async(req,res)=>{if(!mailConfigured(env)&&!mailSink)V.fail('Recuperação por e-mail indisponível até configurar o envio.',503);const email=V.text(req.body.email,3,255);const u=await one('SELECT * FROM users WHERE lower(email)=lower($1)',[email]);if(u)await sendToken(u,'reset');res.json({message:'Se o e-mail estiver cadastrado, você receberá um link de recuperação.'});});
 app.post('/api/auth/resend',auth,async(req,res)=>{if(req.user.email_verified)return res.json({ok:true});await sendToken(req.user,'verify');res.json({ok:true});});
 app.post('/api/auth/verify',async(req,res)=>{await db.transaction(async tx=>{const r=await tx.query("DELETE FROM auth_tokens WHERE id=$1 AND kind='verify' AND expires_at>NOW() RETURNING user_id",[hash(V.text(req.body.token,20,100))]);if(!r.rows.length)V.fail('Link inválido ou expirado.');await tx.query('UPDATE users SET email_verified=TRUE WHERE id=$1',[r.rows[0].user_id]);});res.json({ok:true});});
 app.post('/api/auth/reset',async(req,res)=>{const password=V.password(req.body.password);await db.transaction(async tx=>{const r=await tx.query("DELETE FROM auth_tokens WHERE id=$1 AND kind='reset' AND expires_at>NOW() RETURNING user_id",[hash(V.text(req.body.token,20,100))]);if(!r.rows.length)V.fail('Link inválido ou expirado.');const id=r.rows[0].user_id;await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(password,12),id]);await tx.query('DELETE FROM sessions WHERE user_id=$1',[id]);await tx.query("DELETE FROM auth_tokens WHERE user_id=$1 AND kind='reset'",[id]);});res.json({ok:true});});
 app.put('/api/profile',auth,async(req,res)=>{
   const b=req.body,u=req.user;const name=V.text(b.name??u.name,2,120),bio=V.text(b.bio??u.bio??'',0,1000);
   const links=b.links??u.links,favorites=b.favorites??u.favorites;if(!Array.isArray(links)||links.length>5||!Array.isArray(favorites)||favorites.length>4)V.fail('Use até cinco links e quatro favoritos.');
   const fav=[...new Set(favorites.map(x=>V.integer(x)))];for(const id of fav)if(!await one('SELECT id FROM books WHERE id=$1',[id]))V.fail('Livro favorito não encontrado.');
   if(b.is_private!==undefined&&typeof b.is_private!=='boolean')V.fail('Privacidade inválida.');
   const result=await one('UPDATE users SET name=$1,bio=$2,avatar=$3,banner=$4,is_private=$5,links=$6,favorites=$7 WHERE id=$8 RETURNING *',[name,bio,V.url(b.avatar??u.avatar,true),V.url(b.banner??u.banner,true),b.is_private??u.is_private,JSON.stringify(links.map(x=>V.url(x))),JSON.stringify(fav),u.id]);
   if(u.is_private&&!result.is_private)await q('UPDATE follows SET approved=TRUE WHERE following_id=$1',[u.id]);res.json(ownUser(result));
 });
 app.get('/api/users/search',auth,async(req,res)=>{const s='%'+V.text(String(req.query.q||''),0,100)+'%';res.json((await q(`SELECT u.id,u.name,u.username,u.avatar,u.bio,u.is_private,EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=u.id AND f.approved) following FROM users u WHERE (u.name ILIKE $1 OR u.username ILIKE $1) AND u.id<>$2 ORDER BY u.name LIMIT 40`,[s,req.user.id])).rows);});
 app.get('/api/users/suggestions',auth,async(req,res)=>{res.json((await q(`SELECT u.id,u.name,u.username,u.avatar,COUNT(s.book_id)::int common_books FROM users u LEFT JOIN shelves s ON s.user_id=u.id AND s.book_id IN (SELECT book_id FROM shelves WHERE user_id=$1) WHERE u.id<>$1 AND NOT u.is_private AND NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id) GROUP BY u.id ORDER BY common_books DESC,u.name LIMIT 8`,[req.user.id])).rows);});
 app.get('/api/users/:id',auth,async(req,res)=>{const id=V.integer(req.params.id);const u=await one('SELECT * FROM users WHERE id=$1',[id]);if(!u)V.fail('Perfil não encontrado.',404);const f=await one('SELECT approved FROM follows WHERE follower_id=$1 AND following_id=$2',[req.user.id,id]);const can=await canSee(req.user.id,id);const counts=await one('SELECT (SELECT COUNT(*) FROM follows WHERE following_id=$1 AND approved)::int followers,(SELECT COUNT(*) FROM follows WHERE follower_id=$1 AND approved)::int following',[id]);const favorites=can?(await q('SELECT * FROM books WHERE id=ANY($1::bigint[])',[u.favorites])).rows:[];res.json({...publicUser(u),bio:can?u.bio:'',links:can?u.links:[],favorites,can_view:can,relationship:f?(f.approved?'following':'pending'):'none',...counts});});
 app.put('/api/users/:id/follow',auth,async(req,res)=>{const id=V.integer(req.params.id);if(String(id)===String(req.user.id))V.fail('Você não pode seguir a si mesma.');const u=await one('SELECT * FROM users WHERE id=$1',[id]);if(!u)V.fail('Perfil não encontrado.',404);if(typeof req.body.follow!=='boolean')V.fail('Escolha seguir ou deixar de seguir.');await db.transaction(async tx=>{if(req.body.follow){const r=await tx.query('INSERT INTO follows(follower_id,following_id,approved) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',[req.user.id,id,!u.is_private]);if(r.rows.length)await notify(tx,id,req.user.id,'follow',`${req.user.name} ${u.is_private?'solicitou seguir você':'começou a seguir você'}.`);}else await tx.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2',[req.user.id,id]);});res.json({relationship:req.body.follow?(u.is_private?'pending':'following'):'none'});});
 app.get('/api/follow-requests',auth,async(req,res)=>res.json((await q('SELECT u.id,u.name,u.username,u.avatar FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=$1 AND NOT f.approved',[req.user.id])).rows));
 app.put('/api/follow-requests/:id',auth,async(req,res)=>{if(req.body.approve)await q('UPDATE follows SET approved=TRUE WHERE follower_id=$1 AND following_id=$2',[V.integer(req.params.id),req.user.id]);else await q('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2 AND NOT approved',[V.integer(req.params.id),req.user.id]);res.json({ok:true});});
 for(const type of ['followers','following'])app.get('/api/users/:id/'+type,auth,async(req,res)=>{const id=V.integer(req.params.id);await requireProfile(req.user.id,id);res.json((await q(`SELECT u.id,u.name,u.username,u.avatar FROM follows f JOIN users u ON u.id=f.${type==='followers'?'follower_id':'following_id'} WHERE f.${type==='followers'?'following_id':'follower_id'}=$1 AND f.approved ORDER BY u.name LIMIT 100`,[id])).rows);});

 const bookColumns=`b.*,COALESCE((SELECT round(avg(r.rating),1) FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.book_id=b.id AND ${visible('u','$1')}),0) rating`;
 app.get('/api/books',auth,async(req,res)=>{const s='%'+V.text(String(req.query.q||''),0,150)+'%';const genre=String(req.query.genre||'');res.json((await q(`SELECT ${bookColumns} FROM books b WHERE (b.title ILIKE $2 OR b.author ILIKE $2 OR b.isbn ILIKE $2) AND ($3='' OR b.genre ILIKE $3) ORDER BY b.created_at DESC LIMIT 100`,[req.user.id,s,genre?'%'+genre+'%':''])).rows);});
 app.get('/api/books/:id',auth,async(req,res)=>{const b=await one(`SELECT ${bookColumns} FROM books b WHERE b.id=$2`,[req.user.id,V.integer(req.params.id)]);if(!b)V.fail('Livro não encontrado.',404);res.json(b);});
 app.post('/api/books',auth,verified,async(req,res)=>{
   const b=req.body,title=V.text(b.title,1,300),author=V.text(b.author,1,300),isbn=V.isbn(b.isbn),key=V.normalize(title)+'|'+V.normalize(author);
   const old=await one('SELECT * FROM books WHERE dedupe_key=$1 OR (lower(title)=lower($2) AND lower(author)=lower($3)) OR ($4<>\'\' AND isbn=$4)',[key,title,author,isbn]);if(old)return res.json({...old,existing:true});
   const candidates=(await q('SELECT * FROM books WHERE author ILIKE $1 ORDER BY created_at DESC LIMIT 1000',['%'+author.split(' ').at(-1)+'%'])).rows;
   const near=candidates.find(x=>V.similar(x.title,title)&&V.similar(x.author,author));if(near)return res.json({...near,existing:true});
   // User supplied provider IDs do not confer verified status.
   const created=await one('INSERT INTO books(title,author,genre,year,pages,synopsis,cover_url,isbn,dedupe_key,created_by,verified,publisher) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11) RETURNING *',[title,author,V.text(b.genre||'Geral',1,120),V.text(String(b.year||'').slice(0,20),0,20),b.pages?V.integer(b.pages,1,100000):null,V.text(b.synopsis||'',0,12000),V.url(b.cover_url,true),isbn||null,key,req.user.id,V.text(b.publisher||'',0,300)]);res.status(201).json(created);
 });
 const external=async(url,options={})=>{const r=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});if(!r.ok)V.fail('O catálogo externo está indisponível. Tente novamente.',502);return r.json();};
 app.get('/api/catalog/details',auth,async(req,res)=>{const key=String(req.query.key||'');if(!/^\/works\/OL\d+W$/.test(key))V.fail('Referência de obra inválida.');const d=await external('https://openlibrary.org'+key+'.json');res.json({synopsis:(typeof d.description==='string'?d.description:d.description?.value||'').slice(0,12000)});});
 app.get('/api/catalog',auth,async(req,res)=>{const term=V.text(String(req.query.q||''),2,150);if(req.query.isbn)V.isbn(term);const provider=req.query.provider==='google'?'google':'openlibrary';
   if(provider==='google'){const d=await external('https://www.googleapis.com/books/v1/volumes?q='+encodeURIComponent(req.query.isbn?'isbn:'+term:term)+'&maxResults=20'+(env.GOOGLE_BOOKS_API_KEY?'&key='+encodeURIComponent(env.GOOGLE_BOOKS_API_KEY):''));return res.json((d.items||[]).map(x=>{const v=x.volumeInfo||{};return {title:v.title,publisher:v.publisher||'',author:(v.authors||[]).join(', ')||'Autor não informado',genre:v.categories?.[0]||'Geral',year:v.publishedDate||'',pages:v.pageCount||null,synopsis:v.description||'',cover_url:(v.imageLinks?.thumbnail||'').replace('http:','https:'),isbn:(v.industryIdentifiers||[]).find(x=>x.type==='ISBN_13')?.identifier||''};}));}
   if(req.query.isbn){const code=V.isbn(term);const data=await external('https://openlibrary.org/api/books?bibkeys='+encodeURIComponent('ISBN:'+code)+'&jscmd=data&format=json');const x=data['ISBN:'+code];return res.json(x?[{title:x.title,author:(x.authors||[]).map(a=>a.name).join(', ')||'Autor não informado',publisher:(x.publishers||[]).map(a=>a.name).join(', ').slice(0,300),year:x.publish_date||'',pages:x.number_of_pages||null,genre:x.subjects?.[0]?.name?.slice(0,120)||'Geral',cover_url:x.cover?.large||x.cover?.medium||'',isbn:code,synopsis:x.excerpts?.[0]?.text?.slice(0,12000)||''}]:[]);}
   const d=await external('https://openlibrary.org/search.json?'+(req.query.isbn?'isbn=':'q=')+encodeURIComponent(term)+'&limit=20&fields=key,title,author_name,first_publish_year,number_of_pages_median,isbn,cover_i,subject,publisher');res.json((d.docs||[]).map(x=>({title:x.title,external_key:x.key,publisher:(x.publisher||[])[0]?.slice(0,300)||'',author:(x.author_name||[]).join(', ')||'Autor não informado',year:String(x.first_publish_year||''),pages:x.number_of_pages_median||null,genre:x.subject?.[0]?.slice(0,120)||'Geral',cover_url:x.cover_i?'https://covers.openlibrary.org/b/id/'+x.cover_i+'-M.jpg':'',isbn:(x.isbn||[]).find(s=>{try{return V.isbn(s);}catch{return false;}})||'',synopsis:''})));
 });
 app.post('/api/books/:id/report',auth,verified,async(req,res)=>{await q('INSERT INTO reports(user_id,book_id,reason) VALUES($1,$2,$3)',[req.user.id,V.integer(req.params.id),V.text(req.body.reason,5,1000)]);res.status(201).json({ok:true});});
 app.get('/api/shelf',auth,async(req,res)=>{const id=req.query.user?V.integer(req.query.user):req.user.id;await requireProfile(req.user.id,id);res.json((await q('SELECT s.*,b.title,b.author,b.cover_url,b.pages,b.genre FROM shelves s JOIN books b ON b.id=s.book_id WHERE s.user_id=$1 ORDER BY s.updated_at DESC',[id])).rows);});
 app.put('/api/shelf/:id',auth,verified,async(req,res)=>{
   const id=V.integer(req.params.id),b=req.body;if(!['lendo','quero-ler','lido','abandonado','pausado'].includes(b.status))V.fail('Estado de leitura inválido.');
   const book=await one('SELECT * FROM books WHERE id=$1',[id]);if(!book)V.fail('Livro não encontrado.',404);const old=await one('SELECT * FROM shelves WHERE user_id=$1 AND book_id=$2',[req.user.id,id]);
   const page=b.current_page===undefined?Number(old?.current_page||0):V.integer(b.current_page,0,100000);if(book.pages&&page>book.pages)V.fail('A página atual supera o total do livro.');
   const progress=b.status==='lido'?100:book.pages?Math.round(page/book.pages*100):V.integer(b.progress??old?.progress??0,0,100);
   const tags=b.tags??old?.tags??[];if(!Array.isArray(tags)||tags.length>20)V.fail('Use até 20 etiquetas.');const cleanTags=[...new Set(tags.map(x=>V.text(x,1,40)))];
   const start=b.started_on?V.date(b.started_on):old?.started_on?new Date(old.started_on).toISOString().slice(0,10):null,finish=b.status==='lido'?(b.finished_on?V.date(b.finished_on):today()):null;
   if(finish&&(finish>today()||(start&&String(start).slice(0,10)>finish)))V.fail('As datas de leitura não são válidas.');
   const row=await db.transaction(async tx=>{await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);const previous=(await tx.query('SELECT status FROM shelves WHERE user_id=$1 AND book_id=$2',[req.user.id,id])).rows[0];
     const r=await tx.query('INSERT INTO shelves(user_id,book_id,status,progress,current_page,tags,started_on,finished_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,book_id) DO UPDATE SET status=EXCLUDED.status,progress=EXCLUDED.progress,current_page=EXCLUDED.current_page,tags=EXCLUDED.tags,started_on=EXCLUDED.started_on,finished_on=EXCLUDED.finished_on,updated_at=NOW() RETURNING *',[req.user.id,id,b.status,progress,page,JSON.stringify(cleanTags),start,finish]);
     if(b.status==='lido'&&previous?.status!=='lido')await tx.query('INSERT INTO reading_history(user_id,book_id,started_on,finished_on) VALUES($1,$2,$3,$4)',[req.user.id,id,start,finish]);
     else if(b.status==='lido'&&previous?.status==='lido')await tx.query('UPDATE reading_history SET started_on=$1,finished_on=$2 WHERE id=(SELECT id FROM reading_history WHERE user_id=$3 AND book_id=$4 ORDER BY id DESC LIMIT 1)',[start,finish,req.user.id,id]);
     if(previous?.status!==b.status)await tx.query('INSERT INTO activities(user_id,book_id,kind,content) VALUES($1,$2,$3,$4)',[req.user.id,id,'shelf',`${req.user.name} marcou ${book.title} como ${b.status}.`]);
     const achieved=await tx.query('UPDATE goals g SET reached=TRUE WHERE g.user_id=$1 AND NOT g.reached AND (SELECT COUNT(*) FROM reading_history h WHERE h.user_id=g.user_id AND h.finished_on BETWEEN g.starts_on AND g.ends_on)>=g.target RETURNING g.name',[req.user.id]);
     for(const goal of achieved.rows){await tx.query('INSERT INTO activities(user_id,kind,content) VALUES($1,$2,$3)',[req.user.id,'goal',`${req.user.name} concluiu a meta ${goal.name}!`]);await tx.query('INSERT INTO notifications(user_id,kind,content) VALUES($1,$2,$3)',[req.user.id,'goal',`Você concluiu a meta ${goal.name}!`]);}
     return r.rows[0];});res.json(row);
 });
 app.delete('/api/shelf/:id',auth,async(req,res)=>{await q('DELETE FROM shelves WHERE user_id=$1 AND book_id=$2',[req.user.id,V.integer(req.params.id)]);res.json({ok:true});});
 app.get('/api/history',auth,async(req,res)=>res.json((await q('SELECT h.*,b.title,b.author,b.pages,b.genre FROM reading_history h JOIN books b ON b.id=h.book_id WHERE h.user_id=$1 ORDER BY h.finished_on DESC',[req.user.id])).rows));
 app.delete('/api/history/:id',auth,async(req,res)=>{await q('DELETE FROM reading_history WHERE id=$1 AND user_id=$2',[V.integer(req.params.id),req.user.id]);res.json({ok:true});});
 app.get('/api/reviews',auth,async(req,res)=>{
   const user=req.query.user?V.integer(req.query.user):null,book=req.query.book?V.integer(req.query.book):null;
   const offset=V.integer(req.query.offset||0,0,100000);
   res.json((await q(`SELECT r.*,u.name,u.username,u.avatar,b.title,b.author,b.cover_url,(SELECT COUNT(*) FROM review_likes l WHERE l.review_id=r.id)::int likes,(SELECT COUNT(*) FROM comments c JOIN users cu ON cu.id=c.user_id WHERE c.review_id=r.id AND ${visible('cu','$1')})::int comments,EXISTS(SELECT 1 FROM review_likes l WHERE l.review_id=r.id AND l.user_id=$1) liked FROM reviews r JOIN users u ON u.id=r.user_id JOIN books b ON b.id=r.book_id WHERE ${visible('u','$1')} AND ($2::bigint IS NULL OR u.id=$2) AND ($3::bigint IS NULL OR b.id=$3) AND ($4=FALSE OR u.id=$1 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id AND f.approved)) ORDER BY r.created_at DESC,r.id DESC LIMIT 30 OFFSET $5`,[req.user.id,user,book,req.query.following==='true',offset])).rows);
 });
 app.post('/api/reviews',auth,verified,async(req,res)=>{const b=req.body,book=V.integer(b.book_id),rating=Number(b.rating);if(!Number.isFinite(rating)||rating<0.5||rating>5||rating*2!==Math.floor(rating*2))V.fail('Escolha uma nota entre 0,5 e 5, em intervalos de meia estrela.');const content=V.text(b.content,1,15000);const row=await one('INSERT INTO reviews(user_id,book_id,rating,content,spoiler) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,book_id) DO UPDATE SET rating=EXCLUDED.rating,content=EXCLUDED.content,spoiler=EXCLUDED.spoiler,updated_at=NOW() RETURNING *',[req.user.id,book,rating,content,b.spoiler===true]);res.status(201).json(row);});
 app.delete('/api/reviews/:id',auth,async(req,res)=>{await q('DELETE FROM reviews WHERE id=$1 AND user_id=$2',[V.integer(req.params.id),req.user.id]);res.json({ok:true});});
 app.put('/api/reviews/:id/like',auth,verified,async(req,res)=>{const id=V.integer(req.params.id),r=await review(req.user.id,id);if(typeof req.body.liked!=='boolean')V.fail('Curtida inválida.');await db.transaction(async tx=>{if(req.body.liked){const inserted=await tx.query('INSERT INTO review_likes(review_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *',[id,req.user.id]);if(inserted.rows.length)await notify(tx,r.user_id,req.user.id,'like',`${req.user.name} curtiu sua resenha de ${r.title}.`,id);}else await tx.query('DELETE FROM review_likes WHERE review_id=$1 AND user_id=$2',[id,req.user.id]);});res.json({liked:req.body.liked});});
 app.get('/api/reviews/:id/comments',auth,async(req,res)=>{const id=V.integer(req.params.id);await review(req.user.id,id);res.json((await q(`SELECT c.*,u.name,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.review_id=$2 AND ${visible('u','$1')} ORDER BY c.created_at LIMIT 100`,[req.user.id,id])).rows);});
 app.post('/api/reviews/:id/comments',auth,verified,async(req,res)=>{const id=V.integer(req.params.id),r=await review(req.user.id,id),content=V.text(req.body.content,1,2000);await db.transaction(async tx=>{await tx.query('INSERT INTO comments(review_id,user_id,content) VALUES($1,$2,$3)',[id,req.user.id,content]);await notify(tx,r.user_id,req.user.id,'comment',`${req.user.name} comentou sua resenha de ${r.title}.`,id);});res.status(201).json({ok:true});});
 app.delete('/api/comments/:id',auth,async(req,res)=>{await q('DELETE FROM comments WHERE id=$1 AND user_id=$2',[V.integer(req.params.id),req.user.id]);res.json({ok:true});});
 app.get('/api/activities',auth,async(req,res)=>res.json((await q(`SELECT a.*,u.name,u.username FROM activities a JOIN users u ON u.id=a.user_id WHERE ${visible('u','$1')} AND (u.id=$1 OR EXISTS(SELECT 1 FROM follows f WHERE f.following_id=u.id AND f.follower_id=$1 AND f.approved)) ORDER BY a.created_at DESC LIMIT 30`,[req.user.id])).rows));
 app.get('/api/lists',auth,async(req,res)=>{const user=req.query.user?V.integer(req.query.user):null;res.json((await q(`SELECT l.*,u.name author,u.username,COUNT(lb.book_id)::int book_count,(SELECT COUNT(*) FROM list_likes ll WHERE ll.list_id=l.id)::int likes FROM lists l JOIN users u ON u.id=l.user_id LEFT JOIN list_books lb ON lb.list_id=l.id WHERE (l.user_id=$1 OR (l.is_public AND ${visible('u','$1')})) AND ($2::bigint IS NULL OR l.user_id=$2) GROUP BY l.id,u.id ORDER BY l.created_at DESC LIMIT 100`,[req.user.id,user])).rows);});
 const listInput=b=>({name:V.text(b.name,1,120),description:V.text(b.description||'',0,2000),is_public:b.is_public!==false,cover_url:V.url(b.cover_url,true)});
 app.post('/api/lists',auth,verified,async(req,res)=>{const b=listInput(req.body);res.status(201).json(await one('INSERT INTO lists(user_id,name,description,is_public,cover_url) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.id,b.name,b.description,b.is_public,b.cover_url]));});
 app.get('/api/lists/:id',auth,async(req,res)=>{const id=V.integer(req.params.id),l=await list(req.user.id,id);const sort=req.query.sort;const order=sort==='rating'?'rating DESC,b.title':sort==='date'?'b.created_at DESC':'lb.position,b.title';const books=(await q(`SELECT ${bookColumns},lb.position FROM list_books lb JOIN books b ON b.id=lb.book_id WHERE lb.list_id=$2 ORDER BY ${order}`,[req.user.id,id])).rows;res.json({...l,books,liked:!!await one('SELECT 1 FROM list_likes WHERE list_id=$1 AND user_id=$2',[id,req.user.id])});});
 app.put('/api/lists/:id',auth,verified,async(req,res)=>{const id=V.integer(req.params.id);await list(req.user.id,id,true);const b=listInput(req.body);res.json(await one('UPDATE lists SET name=$1,description=$2,is_public=$3,cover_url=$4 WHERE id=$5 RETURNING *',[b.name,b.description,b.is_public,b.cover_url,id]));});
 app.delete('/api/lists/:id',auth,async(req,res)=>{const id=V.integer(req.params.id);await list(req.user.id,id,true);await q('DELETE FROM lists WHERE id=$1',[id]);res.json({ok:true});});
 app.put('/api/lists/:id/books',auth,verified,async(req,res)=>{const id=V.integer(req.params.id);await list(req.user.id,id,true);if(!Array.isArray(req.body.book_ids)||req.body.book_ids.length>500)V.fail('Lista inválida. Use até 500 livros.');const ids=[...new Set(req.body.book_ids.map(x=>V.integer(x)))];await db.transaction(async tx=>{await tx.query('SELECT id FROM lists WHERE id=$1 FOR UPDATE',[id]);await tx.query('DELETE FROM list_books WHERE list_id=$1',[id]);for(let i=0;i<ids.length;i++)await tx.query('INSERT INTO list_books(list_id,book_id,position) VALUES($1,$2,$3)',[id,ids[i],i]);});res.json({ok:true});});
 app.put('/api/lists/:id/like',auth,verified,async(req,res)=>{const id=V.integer(req.params.id);await list(req.user.id,id);if(req.body.liked)await q('INSERT INTO list_likes(list_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,req.user.id]);else await q('DELETE FROM list_likes WHERE list_id=$1 AND user_id=$2',[id,req.user.id]);res.json({ok:true});});
 app.get('/api/goals',auth,async(req,res)=>res.json((await q('SELECT g.*,COUNT(h.id)::int completed FROM goals g LEFT JOIN reading_history h ON h.user_id=g.user_id AND h.finished_on BETWEEN g.starts_on AND g.ends_on WHERE g.user_id=$1 GROUP BY g.id ORDER BY g.ends_on',[req.user.id])).rows));
 app.post('/api/goals',auth,verified,async(req,res)=>{const b=req.body,start=V.date(b.starts_on),end=V.date(b.ends_on);if(end<start)V.fail('A data final precisa ser posterior à inicial.');res.status(201).json(await one('INSERT INTO goals(user_id,name,target,starts_on,ends_on) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.id,V.text(b.name,1,120),V.integer(b.target,1,10000),start,end]));});
 app.delete('/api/goals/:id',auth,async(req,res)=>{await q('DELETE FROM goals WHERE id=$1 AND user_id=$2',[V.integer(req.params.id),req.user.id]);res.json({ok:true});});
 app.get('/api/stats',auth,async(req,res)=>{const start=V.date(req.query.start||new Date().getFullYear()+'-01-01'),end=V.date(req.query.end||new Date().getFullYear()+'-12-31');if(end<start)V.fail('Período inválido.');const history=(await q('SELECT h.*,b.title,b.author,b.genre,b.pages FROM reading_history h JOIN books b ON b.id=h.book_id WHERE h.user_id=$1 AND h.finished_on BETWEEN $2 AND $3 ORDER BY h.finished_on DESC',[req.user.id,start,end])).rows;const ratings=await one('SELECT round(avg(rating),2) average FROM reviews WHERE user_id=$1',[req.user.id]);const genres={},authors={};for(const h of history){genres[h.genre]=(genres[h.genre]||0)+1;authors[h.author]=(authors[h.author]||0)+1;}res.json({read:history.length,pages:history.reduce((n,h)=>n+Number(h.pages||0),0),average:ratings.average,genres,authors,history,achievements:[...(history.length>=1?['Primeira leitura']:[]),...(history.length>=10?['Dez histórias']:[])]});});
 app.get('/api/notifications',auth,async(req,res)=>{res.json((await q('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id])).rows);});
 app.put('/api/notifications/read',auth,async(req,res)=>{await q('UPDATE notifications SET is_read=TRUE WHERE user_id=$1',[req.user.id]);res.json({ok:true});});
 app.get('/api/export',auth,async(req,res)=>{const user=req.user.id,entries={profile:ownUser(req.user),exported_at:new Date().toISOString()};for(const table of ['shelves','reading_history','reviews','lists','goals','quotes'])entries[table]=(await q(`SELECT * FROM ${table} WHERE user_id=$1`,[user])).rows;entries.list_books=(await q('SELECT lb.* FROM list_books lb JOIN lists l ON l.id=lb.list_id WHERE l.user_id=$1',[user])).rows;entries.books=(await q('SELECT DISTINCT b.* FROM books b WHERE b.id IN(SELECT book_id FROM shelves WHERE user_id=$1 UNION SELECT book_id FROM reviews WHERE user_id=$1 UNION SELECT lb.book_id FROM list_books lb JOIN lists l ON l.id=lb.list_id WHERE l.user_id=$1)',[user])).rows;res.set('Content-Disposition','attachment; filename="bookclub-backup.json"');res.json(entries);});
 app.get('/api/quotes',auth,async(req,res)=>res.json((await q('SELECT q.*,b.title FROM quotes q JOIN books b ON b.id=q.book_id WHERE q.user_id=$1 ORDER BY q.created_at DESC',[req.user.id])).rows));
 app.post('/api/quotes',auth,verified,async(req,res)=>{res.status(201).json(await one('INSERT INTO quotes(user_id,book_id,text,page) VALUES($1,$2,$3,$4) RETURNING *',[req.user.id,V.integer(req.body.book_id),V.text(req.body.text,1,5000),req.body.page?V.integer(req.body.page):null]));});
 app.delete('/api/quotes/:id',auth,async(req,res)=>{await q('DELETE FROM quotes WHERE id=$1 AND user_id=$2',[V.integer(req.params.id),req.user.id]);res.json({ok:true});});

 const admin=(req,res,next)=>{if(!req.user.is_admin)return res.status(403).json({error:'Apenas moderadores podem acessar esta área.'});next();};
 app.get('/api/moderation',auth,admin,async(req,res)=>{res.json({books:(await q('SELECT b.*,u.username FROM books b LEFT JOIN users u ON u.id=b.created_by WHERE NOT b.verified ORDER BY b.created_at LIMIT 100')).rows,reports:(await q("SELECT r.*,b.title,u.username FROM reports r LEFT JOIN books b ON b.id=r.book_id JOIN users u ON u.id=r.user_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 100")).rows});});
 app.put('/api/moderation/books/:id',auth,admin,async(req,res)=>{const verified=req.body.verified;if(typeof verified!=='boolean')V.fail('Escolha aprovar ou retirar verificação.');await q('UPDATE books SET verified=$1 WHERE id=$2',[verified,V.integer(req.params.id)]);res.json({ok:true});});
 app.put('/api/moderation/reports/:id',auth,admin,async(req,res)=>{await q("UPDATE reports SET status='reviewed' WHERE id=$1",[V.integer(req.params.id)]);res.json({ok:true});});
 // OAuth identity is linked by provider subject, never by an unverified e-mail match.
 app.get('/api/auth/oauth/:provider',async(req,res)=>{
   const p=req.params.provider;if(!['google','github'].includes(p))V.fail('Provedor inválido.');const id=env[p.toUpperCase()+'_CLIENT_ID'];if(!id||!env[p.toUpperCase()+'_CLIENT_SECRET'])V.fail('Login social ainda não configurado.',503);
   const state=random(),verifier=random();await q("INSERT INTO oauth_states(id,provider,verifier,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')",[hash(state),p,verifier]);res.cookie('bc_oauth',state,{httpOnly:true,secure,sameSite:'lax',maxAge:600000,path:'/api/auth/oauth'});
   const url=new URL(p==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://github.com/login/oauth/authorize');const params={client_id:id,redirect_uri:origin+'/api/auth/oauth/'+p+'/callback',state,scope:p==='google'?'openid email profile':'read:user user:email',response_type:'code',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'};Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));res.redirect(url.href);
 });
 app.get('/api/auth/oauth/:provider/callback',async(req,res)=>{
   const p=req.params.provider,state=String(req.query.state||''),browser=cookie(req,'bc_oauth');if(!['google','github'].includes(p)||!browser||browser!==state)V.fail('Estado de login inválido. Recomece a entrada.');
   const s=await one('DELETE FROM oauth_states WHERE id=$1 AND provider=$2 AND expires_at>NOW() RETURNING *',[hash(state),p]);if(!s)V.fail('Login expirado.');res.clearCookie('bc_oauth',{path:'/api/auth/oauth'});
   const tokens=await external(p==='google'?'https://oauth2.googleapis.com/token':'https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({client_id:env[p.toUpperCase()+'_CLIENT_ID'],client_secret:env[p.toUpperCase()+'_CLIENT_SECRET'],code:String(req.query.code||''),redirect_uri:origin+'/api/auth/oauth/'+p+'/callback',grant_type:'authorization_code',code_verifier:s.verifier})});if(!tokens.access_token)V.fail('Não foi possível validar o login social.');
   const headers={Authorization:'Bearer '+tokens.access_token,Accept:'application/json','User-Agent':'BookClub'};const profile=await external(p==='google'?'https://openidconnect.googleapis.com/v1/userinfo':'https://api.github.com/user',{headers});
   let email=profile.email,valid=profile.email_verified;if(p==='github'){const emails=await external('https://api.github.com/user/emails',{headers});email=emails.find(e=>e.primary&&e.verified)?.email;valid=!!email;}if(!email||!valid)V.fail('O provedor precisa fornecer um e-mail confirmado.');
   let u=await one('SELECT u.* FROM oauth_accounts a JOIN users u ON u.id=a.user_id WHERE a.provider=$1 AND a.subject=$2',[p,String(profile.sub||profile.id)]);
   if(!u){if(await one('SELECT id FROM users WHERE lower(email)=lower($1)',[email]))V.fail('Já existe uma conta com esse e-mail. Entre usando sua senha.');u=await db.transaction(async tx=>{const r=await tx.query('INSERT INTO users(name,username,email,password_hash,email_verified) VALUES($1,$2,$3,$4,TRUE) RETURNING *',[String(profile.name||profile.login||'Leitor').slice(0,120),'leitor_'+random().slice(0,12).toLowerCase(),email,await bcrypt.hash(random(),12)]);await tx.query('INSERT INTO oauth_accounts(provider,subject,user_id) VALUES($1,$2,$3)',[p,String(profile.sub||profile.id),r.rows[0].id]);return r.rows[0];});}
   await session(res,u);res.redirect('/#home');
 });
 app.use('/api',(req,res)=>res.status(404).json({error:'Recurso não encontrado.'}));
 // Explicit allowlist: .env, SQL, backups, server code and database files are inaccessible.
 app.use('/assets',express.static(path.join(__dirname,'..','public'),{dotfiles:'deny',index:false}));
 const legacy=['/src/home/home.html','/src/auth/login.html','/src/shelf/estante.html','/src/profile/perfil.html','/src/discover/descobrir.html','/src/lists/listas.html','/src/reviews/resenhas.html','/src/create/criar.html','/src/book/detalhes.html'];
 const hashes=['home','login','shelf','profile','search','lists','reviews','create','book'];
 legacy.forEach((route,i)=>app.get(route,(req,res)=>res.redirect('/#'+hashes[i]+(req.query.id?'?id='+encodeURIComponent(req.query.id):''))));
 app.get('/favicon.ico',(req,res)=>res.status(204).end());
 app.get(['/', '/index.html'],(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));
 app.use((req,res)=>res.status(404).send('Página não encontrada.'));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);let status=err.status||500,message=err.message;if(err.code==='23505'){status=409;message='Já existe um cadastro com esses dados.';}else if(['23503','23514','22P02','22001','22003'].includes(err.code)){status=400;message='Dados inválidos ou registro não encontrado.';}else if(status>=500){console.error(err);message='Não foi possível concluir a operação. Tente novamente.';}res.status(status).json({error:message});});
 app.locals.db=db;app.locals.stopEvents=()=>{for(const res of eventResponses)res.end();};app.locals.close=async()=>{app.locals.stopEvents();clearInterval(cleanTimer);await db.close();};return app;
}
if(require.main===module)createApp().then(app=>{
 const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1'),()=>console.log(`BookClub em http://localhost:${process.env.PORT||3000}`));
 let stopping=false;for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{if(stopping)return;stopping=true;app.locals.stopEvents();const deadline=setTimeout(()=>{server.closeAllConnections();process.exit(1);},20000);deadline.unref();server.close(async()=>{await app.locals.close();clearTimeout(deadline);process.exit(0);});});
}).catch(e=>{console.error('Falha ao iniciar:',e.message);process.exit(1);});
module.exports={createApp};
