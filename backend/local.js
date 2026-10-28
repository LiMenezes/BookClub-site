// A local persistent PostgreSQL instance in WASM. Production must use DATABASE_URL.
process.env.DB_DRIVER='pglite';
require('./server').createApp().then(app=>{
 const port=Number(process.env.PORT||3000);
 const server=app.listen(port,'127.0.0.1',()=>console.log(`BookClub em http://localhost:${port} (PostgreSQL local persistente)`));
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(async()=>{await app.locals.close();process.exit(0);}));
}).catch(e=>{console.error(e);process.exit(1);});
