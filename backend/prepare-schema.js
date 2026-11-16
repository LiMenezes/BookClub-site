const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
async function prepareSchema(db,after=async()=>{}){
 const files=['schema.sql','migrate.sql'].map(file=>fs.readFileSync(path.join(__dirname,file),'utf8'));
 const version=crypto.createHash('sha256').update(files.join('\n')).digest('hex');
 return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(817235)');
  await tx.query('CREATE TABLE IF NOT EXISTS schema_releases(id TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  if((await tx.query('SELECT id FROM schema_releases WHERE id=$1',[version])).rows.length)return false;
  for(const contents of files){if(tx.exec)await tx.exec(contents);else for(const sql of contents.split(';').map(s=>s.trim()).filter(Boolean))await tx.query(sql);}
  await after(tx);await tx.query('INSERT INTO schema_releases(id) VALUES($1)',[version]);return true;
 });
}
module.exports={prepareSchema};
