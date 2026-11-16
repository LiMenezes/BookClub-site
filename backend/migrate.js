require('dotenv').config({quiet:true});
const {createApp}=require('./server');
createApp().then(async app=>{await app.locals.close();console.log('Schema BookClub preparado.');}).catch(()=>{console.error('Falha ao preparar o banco. Confira a configuração privada.');process.exitCode=1;});
