const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../backend/server');

test('Arrobas: exclusividade atual, prazo e preservação da conta',async t=>{
 const app=await createApp({env:{DB_DRIVER:'pglite',DATA_DIR:'memory://'},mailSink:()=>{}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,cookie,method=body?'POST':'GET')=>{
  const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-BookClub-Client':'web',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
 const edit=(account,body)=>request('/profile',body,account.cookie,'PUT');
 let a,b;
 try{
  a=await request('/auth/register',{name:'Leitora Google',username:'leitor_aleatorio_longo',email:'username-a@example.test',password:'teste-seguro-2026'});
  b=await request('/auth/register',{name:'Outra Leitora',username:'nome_ocupado',email:'username-b@example.test',password:'teste-seguro-2026'});
  assert.equal(a.status,201);assert.equal(b.status,201);
  await t.test('rejeita formato inválido e nomes em uso sem gastar a primeira troca',async()=>{
   for(const username of ['ab','nome com espaço','álicia','a'.repeat(41),'@'])assert.equal((await edit(a,{username})).status,400);
   assert.equal((await edit(a,{username:'NOME_OCUPADO'})).status,409);
   assert.equal((await request('/auth/me',undefined,a.cookie)).data.username_changed_at,null);
  });
  await t.test('primeira troca é livre, normaliza @ e conserva ID, sessão e dados',async()=>{
   const result=await edit(a,{username:'@Ana.Leitora',bio:'Minha bio'});assert.equal(result.status,200);
   assert.equal(result.data.username,'ana.leitora');assert.equal(result.data.id,a.data.user.id);assert.equal(result.data.bio,'Minha bio');
   assert.ok(result.data.username_changed_at);assert.equal(Date.parse(result.data.username_change_available_at)-Date.parse(result.data.username_changed_at),10*86400000);
   assert.equal((await request('/auth/login',{identifier:'ana.leitora',password:'teste-seguro-2026'})).status,200);
   assert.equal((await request('/auth/login',{identifier:'leitor_aleatorio_longo',password:'teste-seguro-2026'})).status,401);
  });
  await t.test('nome antigo fica disponível imediatamente para outra conta',async()=>{
   const result=await edit(b,{username:'leitor_aleatorio_longo'});assert.equal(result.status,200);
   assert.equal(result.data.username,'leitor_aleatorio_longo');
   const duplicate=await request('/auth/register',{name:'Terceira',username:'ANA.LEITORA',email:'username-c@example.test',password:'teste-seguro-2026'});assert.equal(duplicate.status,409);
  });
  await t.test('bloqueia nova troca por 10 dias, permite editar outros dados e não reinicia o prazo',async()=>{
   const before=(await request('/auth/me',undefined,a.cookie)).data;
   assert.equal((await edit(a,{username:'ana.livros',name:'Não deve salvar'})).status,409);
   const result=await edit(a,{username:'ANA.LEITORA',name:'Ana',bio:'Bio atualizada'});assert.equal(result.status,200);
   assert.equal(result.data.username_change_available_at,before.username_change_available_at);
   assert.equal(result.data.name,'Ana');
   assert.equal((await edit(a,{bio:'Outra bio'})).status,200);
   assert.equal((await request('/users/'+a.data.user.id,undefined,b.cookie)).data.username_change_available_at,undefined,'Prazo só é visível ao dono');
  });
  await t.test('libera depois do prazo e impede duas trocas simultâneas na mesma conta',async()=>{
   await app.locals.db.query("UPDATE users SET username_changed_at=NOW()-INTERVAL '10 days 1 second' WHERE id=$1",[a.data.user.id]);
   const results=await Promise.all([edit(a,{username:'ana.livros'}),edit(a,{username:'ana.biblioteca'})]);
   assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
   await app.locals.db.query("UPDATE users SET username_changed_at=NOW()-INTERVAL '10 days 1 second' WHERE id=$1",[b.data.user.id]);
   assert.equal((await edit(b,{username:'ana.leitora'})).status,200,'O @ anterior não fica reservado no histórico');
  });
  await t.test('duas contas disputando o mesmo @ não criam duplicata',async()=>{
   await app.locals.db.query("UPDATE users SET username_changed_at=NOW()-INTERVAL '11 days'");
   const results=await Promise.all([edit(a,{username:'mesmo.nome'}),edit(b,{username:'mesmo.nome'})]);
   assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
   assert.equal((await app.locals.db.query("SELECT COUNT(*)::int n FROM users WHERE lower(username)='mesmo.nome'")).rows[0].n,1);
  });
 }finally{await new Promise(r=>server.close(r));await app.locals.close();}
});
