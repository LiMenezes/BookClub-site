const express=require('express');
function serverlessApp(factory){
 const outer=express();let pending;
 outer.use(async(req,res,next)=>{
  try{if(!pending)pending=Promise.resolve().then(factory).catch(e=>{pending=null;throw e;});const app=await pending;app(req,res,next);}
  catch{res.set('Cache-Control','no-store');res.status(503).json({error:'O clube está temporariamente indisponível. Tente novamente em instantes.'});}
 });return outer;
}
module.exports={serverlessApp};
