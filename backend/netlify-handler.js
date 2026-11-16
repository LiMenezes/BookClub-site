const serverless=require('serverless-http');
const {serverlessApp}=require('./serverless');
function netlifyHandler(factory){
 const invoke=serverless(serverlessApp(factory));
 return async(event,context)=>{
  context.callbackWaitsForEmptyEventLoop=false;
  const prefix='/.netlify/functions/api';
  const path=event.path===prefix?'/api':event.path?.startsWith(prefix+'/')?'/api'+event.path.slice(prefix.length):event.path;
  return invoke({...event,path},context);
 };
}
module.exports={netlifyHandler};
