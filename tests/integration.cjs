const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../backend/server');

test('BookClub: autenticação, privacidade e jornadas com PostgreSQL real embutido',async t=>{
 const outbox=[];
 const app=await createApp({env:{DB_DRIVER:'pglite',DATA_DIR:'memory://',APP_ORIGIN:'http://localhost:3188'},mailSink:mail=>outbox.push(mail)});
 const server=app.listen(3188,'127.0.0.1');
 const request=async(path,{cookie,method='GET',body,origin,client=true}={})=>{
   const headers={'Content-Type':'application/json'};if(client)headers['X-BookClub-Client']='web';if(cookie)headers.Cookie=cookie;if(origin)headers.Origin=origin;
   const r=await fetch('http://127.0.0.1:3188'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
   const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
   return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
 };
 const call=async(path,cookie,body,method=body?'POST':'GET',status=200)=>{const r=await request('/api'+path,{cookie,body,method});assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
 try{
 let alice,bob,privateList,book,review;
 await t.test('bloqueia segredos e chamadas sem autenticação/CSRF',async()=>{
   for(const p of ['/.env','/backend/server.js','/backend/schema.sql','/data/postgres-local/PG_VERSION','/package.json'])assert.equal((await request(p)).status,404);
   assert.equal((await request('/api/shelf')).status,401);
   assert.equal((await request('/api/auth/register',{method:'POST',body:{},client:false})).status,403);
   assert.equal((await request('/api/auth/register',{method:'POST',body:{},origin:'https://malicious.example'})).status,403);
 });
 await t.test('valida cadastro, cookies e unicidade',async()=>{
   assert.equal((await request('/api/auth/register',{method:'POST',body:{name:'A',email:'x',username:'a',password:'1'}})).status,400);
   alice=await request('/api/auth/register',{method:'POST',body:{name:'Alice Teste',username:'alice_test',email:'alice@example.test',password:'leitura-segura-123'}});
   assert.equal(alice.status,201);assert.match(alice.headers.get('set-cookie'),/HttpOnly/);assert.match(alice.headers.get('set-cookie'),/SameSite=Lax/);assert.equal(alice.data.user.password_hash,undefined);assert.equal(outbox.length,1);
   bob=await request('/api/auth/register',{method:'POST',body:{name:'Bia Teste',username:'bia_test',email:'bia@example.test',password:'leitura-segura-123'}});assert.equal(bob.status,201);
   assert.equal((await request('/api/auth/register',{method:'POST',body:{name:'Outra',username:'ALICE_TEST',email:'other@example.test',password:'leitura-segura-123'}})).status,409);
   const invalid=await request('/api/auth/login',{method:'POST',body:{identifier:'alice_test',password:'senha errada'}});assert.equal(invalid.status,401);
   const login=await request('/api/auth/login',{method:'POST',body:{identifier:'alice_test',password:'leitura-segura-123'}});assert.equal(login.status,200);
 });
 await t.test('cadastro de livro: ISBN, duplicatas e valores inválidos',async()=>{
   await call('/books',alice.cookie,{title:'Duna',author:'Frank Herbert',isbn:'1234567890123'},'POST',400);
   book=await call('/books',alice.cookie,{title:'Duna',author:'Frank Herbert',isbn:'9780441172719',pages:412,genre:'Ficção científica',synopsis:'Uma história no deserto.'},'POST',201);
   const duplicate=await call('/books',alice.cookie,{title:' DUNA ',author:'Frank Herbert',isbn:'9780441172719'});assert.equal(duplicate.id,book.id);assert.equal(duplicate.existing,true);
   await call('/books',alice.cookie,{title:'Malicioso',author:'Teste',cover_url:'javascript:alert(1)'},'POST',400);
   await call('/books/999999',alice.cookie,undefined,'GET',404);
 });
 await t.test('estante: progresso, tags, conclusão idempotente, releitura e metas',async()=>{
   await call('/shelf/'+book.id,alice.cookie,{status:'lendo',current_page:500},'PUT',400);
   const shelf=await call('/shelf/'+book.id,alice.cookie,{status:'lendo',current_page:206,tags:['favorito'],started_on:'2026-01-01'},'PUT');assert.equal(shelf.progress,50);
   const year=new Date().getFullYear();await call('/goals',alice.cookie,{name:'Meu ano',target:2,starts_on:year+'-01-01',ends_on:year+'-12-31'},'POST',201);
   await call('/shelf/'+book.id,alice.cookie,{status:'lido'},'PUT');await call('/shelf/'+book.id,alice.cookie,{status:'lido'},'PUT');assert.equal((await call('/history',alice.cookie)).length,1);
   await call('/shelf/'+book.id,alice.cookie,{status:'lendo',current_page:0},'PUT');await call('/shelf/'+book.id,alice.cookie,{status:'lido'},'PUT');assert.equal((await call('/history',alice.cookie)).length,2);
   const goals=await call('/goals',alice.cookie);assert.equal(goals[0].completed,2);const stats=await call('/stats',alice.cookie);assert.equal(stats.read,2);assert.equal(stats.pages,824);
   await call('/shelf/'+book.id,alice.cookie,{status:'pausado'},'PUT');
 });
 await t.test('resenha: meia estrela, spoiler, curtida idempotente e comentário',async()=>{
   await call('/reviews',alice.cookie,{book_id:book.id,rating:4.3,content:'Bom.'},'POST',400);
   review=await call('/reviews',alice.cookie,{book_id:book.id,rating:4.5,content:'Uma resenha com spoiler.',spoiler:true},'POST',201);
   await call('/reviews/'+review.id+'/like',bob.cookie,{liked:true},'PUT');await call('/reviews/'+review.id+'/like',bob.cookie,{liked:true},'PUT');
   const rows=await call('/reviews',bob.cookie);assert.equal(rows[0].likes,1);assert.equal(rows[0].spoiler,true);
   await call('/reviews/'+review.id+'/comments',bob.cookie,{content:'<img src=x onerror=alert(1)>'},'POST',201);
   const comments=await call('/reviews/'+review.id+'/comments',alice.cookie);assert.equal(comments.length,1);
   const notifications=await call('/notifications',alice.cookie);assert.equal(notifications.filter(n=>['like','comment'].includes(n.kind)).length,2);
 });
 await t.test('privacidade: listas, resenhas, seguidores e aprovações no servidor',async()=>{
   privateList=await call('/lists',alice.cookie,{name:'Só minha',description:'Pessoal',is_public:false},'POST',201);
   await call('/lists/'+privateList.id,bob.cookie,undefined,'GET',404);
   await call('/lists/'+privateList.id+'/books',bob.cookie,{book_ids:[book.id]},'PUT',404);
   await call('/lists/'+privateList.id+'/books',alice.cookie,{book_ids:[book.id]},'PUT');assert.equal((await call('/lists/'+privateList.id,alice.cookie)).books.length,1);
   await call('/profile',alice.cookie,{is_private:true},'PUT');await call('/shelf?user='+alice.data.user.id,bob.cookie,undefined,'GET',403);
   assert.equal((await call('/reviews',bob.cookie)).length,0);await call('/reviews/'+review.id+'/comments',bob.cookie,undefined,'GET',404);
   const follow=await call('/users/'+alice.data.user.id+'/follow',bob.cookie,{follow:true},'PUT');assert.equal(follow.relationship,'pending');
   assert.equal((await call('/follow-requests',alice.cookie)).length,1);
   await call('/follow-requests/'+bob.data.user.id,alice.cookie,{approve:true},'PUT');assert.equal((await call('/reviews',bob.cookie)).length,1);
   await call('/lists/'+privateList.id,bob.cookie,undefined,'GET',404);
   await call('/users/'+alice.data.user.id+'/follow',bob.cookie,{follow:false},'PUT');assert.equal((await call('/reviews',bob.cookie)).length,0);
 });
 await t.test('listas: ordenação transacional, rollback e validação de propriedade',async()=>{
   await call('/lists/'+privateList.id+'/books',alice.cookie,{book_ids:[book.id,999999]},'PUT',400);
   const l=await call('/lists/'+privateList.id,alice.cookie);assert.equal(l.books.length,1);
 });
 await t.test('exportação pessoal, confirmação e recuperação com token único',async()=>{
   const exportData=await call('/export',alice.cookie);assert.equal(exportData.profile.email,'alice@example.test');assert.equal(exportData.profile.password_hash,undefined);assert.equal(exportData.lists.length,1);
   const token=new URL(outbox[0].text.split('\n\n')[1]).hash.split('token=')[1];await call('/auth/verify',null,{token});await call('/auth/verify',null,{token},'POST',400);
   await call('/auth/forgot',null,{email:'alice@example.test'});const reset=new URL(outbox.at(-1).text.split('\n\n')[1]).hash.split('token=')[1];await call('/auth/reset',null,{token:reset,password:'nova-senha-segura-456'});
   await call('/auth/me',alice.cookie,undefined,'GET',401);await call('/auth/reset',null,{token:reset,password:'outra-senha-segura'},'POST',400);
   const login=await request('/api/auth/login',{method:'POST',body:{identifier:'alice_test',password:'nova-senha-segura-456'}});assert.equal(login.status,200);
   await call('/auth/logout',login.cookie,{});await call('/auth/me',login.cookie,undefined,'GET',401);
 });
 await t.test('moderação não pode ser acessada nem concedida por conta comum',async()=>{
   await call('/moderation',bob.cookie,undefined,'GET',403);
   const profile=await call('/profile',bob.cookie,{is_admin:true},'PUT');assert.equal(profile.is_admin,false);
   await call('/moderation/books/'+book.id,bob.cookie,{verified:true},'PUT',403);
   await app.locals.db.query('UPDATE users SET is_admin=TRUE WHERE id=$1',[bob.data.user.id]);
   const queue=await call('/moderation',bob.cookie);assert.equal(queue.books.length,1);
   await call('/moderation/books/'+book.id,bob.cookie,{verified:true},'PUT');assert.equal((await call('/books/'+book.id,bob.cookie)).verified,true);
 });
 await t.test('redireciona endereços antigos e não expõe conteúdo executável',async()=>{
   const r=await request('/src/book/detalhes.html?id='+book.id);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/#book?id='+book.id);
   const root=await request('/');assert.equal(root.status,200);assert.match(root.headers.get('content-security-policy'),/script-src 'self'/);
 });
 }finally{await new Promise(resolve=>server.close(resolve));await app.locals.close();}
});

test('Migração preserva dados antigos e PostgreSQL local sobrevive a reinício',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path');
 const {openDatabase}=require('../backend/db');
 const base=path.resolve('test-results');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'postgres-'));
 const env={DB_DRIVER:'pglite',DATA_DIR:dir,APP_ORIGIN:'http://localhost:3189'};
 let db,app;
 try{
   db=await openDatabase(env);await db.exec(await fs.readFile(path.join(__dirname,'..','backend','schema.sql'),'utf8'));
   await db.query("INSERT INTO users(name,username,email,password_hash) VALUES('Usuária anterior','anterior','anterior@example.test','hash-anterior')");await db.close();db=null;
   app=await createApp({env});const u=(await app.locals.db.query("SELECT name,is_private,is_admin FROM users WHERE username='anterior'")).rows[0];assert.equal(u.name,'Usuária anterior');assert.equal(u.is_private,false);assert.equal(u.is_admin,false);
   await app.locals.db.query("INSERT INTO books(title,author) VALUES('Livro persistente','Autora')");await app.locals.close();app=null;
   app=await createApp({env});assert.equal((await app.locals.db.query("SELECT title FROM books WHERE title='Livro persistente'")).rows.length,1);
 }finally{if(app)await app.locals.close();if(db)await db.close();const target=path.resolve(dir);assert.ok(target.startsWith(base+path.sep));await fs.rm(target,{recursive:true,force:true});}
});
