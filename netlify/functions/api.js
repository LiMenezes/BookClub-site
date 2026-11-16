const {netlifyHandler}=require('../../backend/netlify-handler');
const {createApp}=require('../../backend/server');
exports.handler=netlifyHandler(()=>createApp({env:{...process.env,SERVERLESS:'true',DB_POOL_MAX:process.env.DB_POOL_MAX||'2'}}));
