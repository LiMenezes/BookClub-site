const path=require('node:path');
const fs=require('node:fs');
function schemaName(env){const schema=env.DB_SCHEMA||'bookclub';if(!/^[a-z][a-z0-9_]{0,40}$/.test(schema))throw new Error('DB_SCHEMA inválido.');return schema;}
async function openDatabase(env=process.env){
 if(env.DB_DRIVER==='pglite'){
  if(env.NODE_ENV==='production')throw new Error('Use PostgreSQL gerenciado em produção.');
  const {PGlite}=require('@electric-sql/pglite');const dir=env.DATA_DIR||path.join(__dirname,'..','data','postgres-local');if(dir!=='memory://')fs.mkdirSync(dir,{recursive:true});
  const pg=new PGlite(dir);await pg.waitReady;const wrap=db=>({query:async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  return {...wrap(pg),exec:sql=>pg.exec(sql),transaction:fn=>pg.transaction(tx=>fn(wrap(tx))),close:()=>pg.close(),harden:async()=>{}};
 }
 if(!env.DATABASE_URL)throw new Error('Configure DATABASE_URL ou use npm run local.');
 const schema=schemaName(env),{Pool}=require('pg');let connectionString=env.DATABASE_URL,ssl;
 if(env.DB_SSL==='verify'||env.NODE_ENV==='production'){
  const url=new URL(connectionString);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);connectionString=url.href;
  ssl={rejectUnauthorized:true,...(env.DB_SSL_CA?{ca:env.DB_SSL_CA.replace(/\\n/g,'\n')}:{})};
 }
 const pool=new Pool({connectionString,ssl,max:Math.max(1,Math.min(10,Number(env.DB_POOL_MAX)||5)),connectionTimeoutMillis:8000,idleTimeoutMillis:30000,statement_timeout:15000,options:`-c search_path=${schema},pg_catalog`});
 pool.on('error',()=>console.error('Conexão ociosa com o banco interrompida.'));
 try{await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);await pool.query(`REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC`);}catch(e){await pool.end();throw e;}
 return {query:(sql,p)=>pool.query(sql,p),exec:sql=>pool.query(sql),close:()=>pool.end(),schema,
  harden:async()=>{
   await pool.query(`REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM PUBLIC`);
   await pool.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA "${schema}" FROM PUBLIC`);
   const roles=await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')");
   for(const {rolname}of roles.rows){await pool.query(`REVOKE ALL ON SCHEMA "${schema}" FROM "${rolname}"`);await pool.query(`REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM "${rolname}"`);await pool.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA "${schema}" FROM "${rolname}"`);}
  },transaction:async fn=>{const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 };
}
module.exports={openDatabase,schemaName};
