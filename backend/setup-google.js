const fs=require('node:fs'),path=require('node:path'),dotenv=require('dotenv');
function configure(file,root=path.join(__dirname,'..')){
 if(!file)throw Error('Use: npm run setup:google -- "C:/caminho/client_secret.json". Baixe a credencial de aplicativo Web no Google Cloud.');
 const client=JSON.parse(fs.readFileSync(path.resolve(file),'utf8')).web;
 if(!client?.client_id?.endsWith('.apps.googleusercontent.com')||!client.client_secret)throw Error('Selecione o JSON de uma credencial OAuth do tipo Aplicativo da Web.');
 const target=path.join(root,'.env'),old=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'',env=dotenv.parse(old);
 if(env.NODE_ENV==='production')throw Error('Configure credenciais de produção no painel seguro da hospedagem.');
 const origin=env.APP_ORIGIN||'http://localhost:3000';const callback=origin+'/api/auth/oauth/google/callback';
 if(!(client.redirect_uris||[]).includes(callback))throw Error('Adicione este URI de redirecionamento no Google Cloud antes de continuar: '+callback);
 let output=old;for(const [key,value]of Object.entries({GOOGLE_CLIENT_ID:client.client_id,GOOGLE_CLIENT_SECRET:client.client_secret,APP_ORIGIN:origin})){const line=key+'='+JSON.stringify(value);const re=new RegExp('^'+key+'=.*$','gm');output=re.test(output)?output.replace(re,()=>line):output.replace(/\s*$/,'')+'\n'+line+'\n';}
 fs.writeFileSync(target,output,{mode:0o600});return callback;
}
if(require.main===module){try{const callback=configure(process.argv[2]);console.log('Google configurado no .env local. Reinicie com npm start. Retorno autorizado: '+callback);}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={configure};
