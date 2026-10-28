const crypto=require('node:crypto');
function mailConfigured(env){return !!(env.RESEND_API_KEY||env.BREVO_API_KEY||env.SMTP_HOST);}
function sender(env){const raw=env.MAIL_FROM||'';const m=raw.match(/^(.*?)\s*<([^<>]+)>$/);return m?{name:m[1].trim()||'BookClub',email:m[2].trim()}:{name:'BookClub',email:raw.trim()};}
async function sendMail(mail,env=process.env,{fetchImpl=fetch}={}){
 let url,headers,body;
 if(env.BREVO_API_KEY){url='https://api.brevo.com/v3/smtp/email';headers={'api-key':env.BREVO_API_KEY};body={sender:sender(env),to:[{email:mail.to}],subject:mail.subject,textContent:mail.text};}
 else if(env.RESEND_API_KEY){url='https://api.resend.com/emails';headers={Authorization:'Bearer '+env.RESEND_API_KEY,'Idempotency-Key':crypto.createHash('sha256').update(mail.to+'\n'+mail.subject+'\n'+mail.text).digest('hex')};body={from:env.MAIL_FROM,to:[mail.to],subject:mail.subject,text:mail.text};}
 if(url){const r=await fetchImpl(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('O serviço de e-mail recusou a mensagem (HTTP '+r.status+').');return;}
 if(env.SMTP_HOST){const transport=require('nodemailer').createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_PORT==='465',connectionTimeout:10000,socketTimeout:15000,auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}:undefined});await transport.sendMail(mail);return;}
 throw new Error('Configure o envio de e-mail no servidor.');
}
module.exports={mailConfigured,sendMail,sender};
