const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const serverless=require('serverless-http');
const {serverlessApp}=require('../backend/serverless');
const event=path=>({httpMethod:'GET',path,headers:{},queryStringParameters:{},requestContext:{identity:{sourceIp:'127.0.0.1'}},body:null,isBase64Encoded:false});
test('Serverless: inicialização concorrente única e nova tentativa após falha',async()=>{
 let starts=0;const app=serverlessApp(async()=>{starts++;await new Promise(r=>setTimeout(r,10));if(starts===1)throw Error('private-database-password');const inner=express();inner.get('/api/health',(q,s)=>s.json({ok:true}));return inner;});const invoke=serverless(app);
 const failed=await Promise.all([invoke(event('/api/health'),{}),invoke(event('/api/health'),{})]);assert.equal(starts,1);assert.ok(failed.every(r=>r.statusCode===503&&!r.body.includes('private-database-password')));
 const ok=await invoke(event('/api/health'),{});assert.equal(ok.statusCode,200);assert.equal(starts,2);await invoke(event('/api/health'),{});assert.equal(starts,2);
});
test('Serverless: reabrir o banco preserva dados e não reaplica migrações',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'});let app;
 try{app=await createApp({db,env:{DB_DRIVER:'pglite'}});await db.query("INSERT INTO users(name,username,email,password_hash) VALUES('Teste','teste','teste@example.test','only-test')");const first=(await db.query('SELECT applied_at FROM schema_releases')).rows[0].applied_at;app.locals.stopEvents();
 const other=await createApp({db,env:{DB_DRIVER:'pglite'}});assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,1);assert.equal(String((await db.query('SELECT applied_at FROM schema_releases')).rows[0].applied_at),String(first));other.locals.stopEvents();await other.locals.close();app=null;
 }finally{if(app)await app.locals.close();}
});
test('Serverless: tentativas de login limitadas entre instâncias',async()=>{
 const {openDatabase}=require('../backend/db'),{createApp}=require('../backend/server');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'});const env={DB_DRIVER:'pglite',SERVERLESS:'true'};let a,b;
 try{a=await createApp({db,env});b=await createApp({db,env});const x=serverless(a),y=serverless(b);assert.equal(JSON.parse((await x(event('/api/config'),{})).body).realtime,'poll');
 for(let i=0;i<20;i++){const r=await (i%2?x:y)(event('/api/auth/me'),{});assert.equal(r.statusCode,401);}
 const blocked=await x(event('/api/auth/me'),{});assert.equal(blocked.statusCode,429);assert.ok(Number(blocked.headers['retry-after'])>=1);
 }finally{a?.locals.stopEvents();b?.locals.stopEvents();if(a)await a.locals.close();else await db.close();}
});
test('Netlify: adaptador preserva caminho, query e cookie seguro',async()=>{
 const inner=express();inner.get('/api/auth/oauth/google/callback',(req,res)=>{res.cookie('bc_session','test-only',{httpOnly:true,secure:true,sameSite:'lax',path:'/'});res.redirect('/#home');});const {netlifyHandler}=require('../backend/netlify-handler');const invoke=netlifyHandler(()=>inner);
 const direct=await invoke(event('/.netlify/functions/api/auth/oauth/google/callback'),{});assert.equal(direct.statusCode,302);
 const r=await invoke(event('/api/auth/oauth/google/callback'),{});assert.equal(r.statusCode,302);assert.equal(r.headers.location,'/#home');assert.match(r.headers['set-cookie']||(r.multiValueHeaders?.['set-cookie']||[]).join(';'),/HttpOnly/);assert.match(r.headers['set-cookie']||(r.multiValueHeaders?.['set-cookie']||[]).join(';'),/Secure/);
});

test('Migração: uma falha de proteção não grava a versão nem confirma tabelas parciais',async()=>{
 const {openDatabase}=require('../backend/db'),{prepareSchema}=require('../backend/prepare-schema');const db=await openDatabase({DB_DRIVER:'pglite',DATA_DIR:'memory://'});
 try{await assert.rejects(()=>prepareSchema(db,async()=>{throw Error('hardening failed');}),/hardening failed/);assert.equal((await db.query("SELECT to_regclass('users') name")).rows[0].name,null);await prepareSchema(db);assert.equal((await db.query('SELECT count(*)::int n FROM schema_releases')).rows[0].n,1);}finally{await db.close();}
});
