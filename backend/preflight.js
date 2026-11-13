require('dotenv').config({path:require('node:path').join(__dirname,'..','.env'),quiet:true});
const {productionConfig}=require('./config');
const {openDatabase}=require('./db');
async function preflight(env=process.env){const errors=productionConfig({...env,NODE_ENV:'production'});if(errors.length){console.error('Configuração pendente:\n'+errors.map(x=>' - '+x).join('\n'));return false;}const db=await openDatabase({...env,NODE_ENV:'production'});try{await db.query('SELECT 1');console.log('Configuração e conexão TLS com PostgreSQL verificadas. Nenhum e-mail enviado.');return true;}finally{await db.close();}}
if(require.main===module)preflight().then(ok=>{if(!ok)process.exitCode=1;}).catch(()=>{console.error('Não foi possível validar a conexão. Confira as credenciais e o certificado no ambiente da hospedagem.');process.exitCode=1;});
module.exports={preflight};
