const {test}=require('node:test'),assert=require('node:assert/strict');
const {calendar,createDiscovery,identity}=require('../backend/discovery');
test('Descobertas respeitam meia-noite de Brasília, segunda-feira e ciclo de gêneros',()=>{
 const sunday=calendar(new Date('2026-11-16T02:59:59Z')),monday=calendar(new Date('2026-11-16T03:00:00Z'));
 assert.equal(sunday.date,'2026-11-15');assert.equal(sunday.genre,'Terror');assert.equal(sunday.dayIndex,6);assert.equal(monday.date,'2026-11-16');assert.equal(monday.genre,'Romance');assert.equal(monday.dayIndex,0);
 assert.equal(calendar(new Date('2026-11-23T12:00:00Z')).genre,'Suspense');assert.equal(calendar(new Date('2026-12-14T12:00:00Z')).genre,'Terror');
});
test('Uma indicação diária persistente, sete livros distintos, reutilizando o catálogo existente',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'}),app=await createApp({db,env:{DB_DRIVER:'pglite'}});
 try{for(let i=0;i<7;i++)await db.query('INSERT INTO books(title,author,genre,cover_url) VALUES($1,$2,$3,$4)',['História '+i,'Autora','Terror','https://example.test/cover.jpg']);let now=new Date('2026-11-09T12:00:00Z');const select=createDiscovery({db,catalog:{search:async()=>{throw Error('offline');}},now:()=>now}),seen=new Set();
 for(let i=0;i<7;i++){now=new Date(Date.UTC(2026,10,9+i,12));const a=await select.get(),again=await select.get();assert.equal(a.genre,'Terror');assert.equal(identity(a.book),identity(again.book));assert.ok(!seen.has(identity(a.book)));seen.add(identity(a.book));}
 const restarted=createDiscovery({db,catalog:{search:async()=>[]},now:()=>now});assert.equal(identity((await restarted.get()).book),identity((await select.get()).book));assert.equal((await db.query('SELECT count(*)::int n FROM books')).rows[0].n,7);
 }finally{await app.locals.close();}
});
test('Catálogo externo cadastra a descoberta uma vez e não altera a estante pessoal',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'}),app=await createApp({db,env:{DB_DRIVER:'pglite'}});let calls=0;
 try{const d=createDiscovery({db,now:()=>new Date('2026-11-09T12:00:00Z'),catalog:{search:async title=>{calls++;return[{title,author:'Autora',language:'pt-BR',synopsis:'Sinopse de teste',cover_url:'https://example.test/capa.jpg'}];}}});const values=await Promise.all(Array.from({length:8},()=>d.get()));assert.equal(calls,1);assert.equal(new Set(values.map(x=>identity(x.book))).size,1);assert.equal((await db.query('SELECT count(*)::int n FROM books')).rows[0].n,1);assert.ok(values.every(x=>x.book.id));assert.equal(values[0].book.created_by,null);assert.equal(values[0].book.verified,false);assert.equal((await db.query('SELECT count(*)::int n FROM shelves')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM discovery_days')).rows[0].n,1);
 }finally{await app.locals.close();}
});
test('Página inicial considera notas reais e não revela avaliações de perfis privados',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'}),app=await createApp({db,env:{DB_DRIVER:'pglite'}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/api/home')).status,401);const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-BookClub-Client':'web'},body:JSON.stringify({name:'Leitor',username:'discovery_qa',email:'discovery@example.test',password:'test-only-password'})});const cookie=response.headers.get('set-cookie').split(';')[0];const publicUser=(await db.query("INSERT INTO users(name,username,email,password_hash) VALUES('Publico','public_qa','public@example.test','unused') RETURNING id")).rows[0].id,privateUser=(await db.query("INSERT INTO users(name,username,email,password_hash,is_private) VALUES('Privado','private_qa','private@example.test','unused',TRUE) RETURNING id")).rows[0].id;const b=(await db.query("INSERT INTO books(title,author) VALUES('Livro avaliado','Autora') RETURNING id")).rows[0].id;await db.query('INSERT INTO reviews(user_id,book_id,rating,content) VALUES($1,$2,3,$3),($4,$2,5,$3)',[publicUser,b,'Resenha de teste',privateUser]);const data=await fetch(base+'/api/home',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(Number(data.rated[0].rating),3);assert.equal(data.rated[0].review_count,1);assert.equal(data.latest.length,1);
 }finally{await new Promise(r=>server.close(r));await app.locals.close();}
});


test('Descoberta antiga sem ID é cadastrada sem nova consulta externa',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'}),app=await createApp({db,env:{DB_DRIVER:'pglite'}});
 try{const book={title:'Carrie',author:'Stephen King',genre:'Terror',cover_url:'https://example.test/carrie.jpg',synopsis:'Sinopse disponível'};await db.query('INSERT INTO discovery_days(day,week_start,genre,book) VALUES($1,$2,$3,$4)',['2026-11-09','2026-11-09','Terror',JSON.stringify(book)]);const d=createDiscovery({db,now:()=>new Date('2026-11-09T12:00:00Z'),catalog:{search:async()=>{throw Error('Não deve consultar');}}});const a=await d.get(),b=await d.get();assert.ok(a.book.id);assert.equal(a.book.id,b.book.id);assert.equal((await db.query('SELECT book FROM discovery_days')).rows[0].book.id,a.book.id);assert.equal((await db.query('SELECT count(*)::int n FROM books')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM shelves')).rows[0].n,0);
 }finally{await app.locals.close();}
});

test('Descoberta reutiliza ISBN existente e preserva correções da comunidade',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'}),app=await createApp({db,env:{DB_DRIVER:'pglite'}});
 try{const old=(await db.query("INSERT INTO books(title,author,genre,isbn,synopsis,cover_url,verified) VALUES('Carrie: a estranha','Stephen King','Suspense','9788532530783','Texto revisado','https://example.test/real.jpg',TRUE) RETURNING *")).rows[0];const d=createDiscovery({db,now:()=>new Date('2026-11-09T12:00:00Z'),catalog:{search:async title=>[{title,author:'Stephen King',isbn:old.isbn,synopsis:'Texto externo',cover_url:'https://example.test/external.jpg'}]}});const a=await d.get();assert.equal(a.book.id,old.id);assert.equal(a.book.synopsis,'Texto revisado');assert.equal(a.book.genre,'Suspense');assert.equal(a.book.verified,true);assert.equal((await db.query('SELECT count(*)::int n FROM books')).rows[0].n,1);
 }finally{await app.locals.close();}
});

test('Instâncias diferentes escolhem um só destaque e cadastram apenas o vencedor',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'}),app=await createApp({db,env:{DB_DRIVER:'pglite'}});let calls=0;
 try{const factory=()=>createDiscovery({db,now:()=>new Date('2026-11-09T12:00:00Z'),catalog:{search:async title=>[{title,author:'Autora '+(++calls),synopsis:'Sinopse',cover_url:'https://example.test/cover.jpg'}]}});const values=await Promise.all([factory().get(),factory().get()]);assert.equal(values[0].book.id,values[1].book.id);assert.equal((await db.query('SELECT count(*)::int n FROM books')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM discovery_days')).rows[0].n,1);
 }finally{await app.locals.close();}
});
