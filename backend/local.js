// A local persistent PostgreSQL instance in WASM. Production must use DATABASE_URL.
process.env.DB_DRIVER='pglite';
require('./server').createApp().then(app=>{
 const port=Number(process.env.PORT||3000);
 const server=app.listen(port,'127.0.0.1',()=>{
  console.log(`BookClub 2.6.0 em http://localhost:${port}`);
  console.log('Pasta: '+require('node:path').resolve(__dirname,'..'));
  console.log('Login Google: '+(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET?'configurado':'não configurado'));
 });
 server.on('error',async error=>{console.error(error.code==='EADDRINUSE'?`A porta ${port} já está ocupada. Encerre o BookClub antigo com Ctrl+C no terminal em que ele está rodando e execute npm start novamente.`:'Não foi possível iniciar o servidor: '+error.message);await app.locals.close();process.exitCode=1;});
 let stopping=false;
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{
  if(stopping)return;stopping=true;app.locals.stopEvents();
  const deadline=setTimeout(()=>{server.closeAllConnections();process.exit(1);},10000);deadline.unref();
  server.close(async()=>{await app.locals.close();clearTimeout(deadline);process.exit(0);});
 });
}).catch(e=>{console.error(e);process.exit(1);});
