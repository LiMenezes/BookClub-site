function productionConfig(env){
 const errors=[];
 if(env.DB_DRIVER!=='postgres')errors.push('DB_DRIVER precisa ser postgres.');
 if(!env.DATABASE_URL)errors.push('Configure DATABASE_URL.');
 let origin;try{origin=new URL(env.APP_ORIGIN);}catch{}
 if(!origin||origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN||origin.username||origin.password)errors.push('APP_ORIGIN precisa ser a origem HTTPS, sem caminho nem barra final.');
 if(!env.SMTP_HOST&&!env.RESEND_API_KEY&&!env.BREVO_API_KEY)errors.push('Configure SMTP, BREVO_API_KEY ou RESEND_API_KEY.');
 if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test((env.MAIL_FROM||'').match(/<([^<>]+)>/)?.[1]||env.MAIL_FROM||''))errors.push('Configure MAIL_FROM com o remetente validado pelo provedor.');
 if(env.REQUIRE_EMAIL==='false')errors.push('Em produção a confirmação de e-mail é obrigatória.');
 if(!/^[a-z][a-z0-9_]{0,40}$/.test(env.DB_SCHEMA||'bookclub'))errors.push('Nome de schema inválido.');
 return errors;
}
module.exports={productionConfig};
