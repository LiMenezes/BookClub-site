function fail(message, status=400){const e=new Error(message);e.status=status;throw e;}
function text(v,min=0,max=1000){if(typeof v!=='string')fail('Texto inválido.');const s=v.trim();if(s.length<min||s.length>max)fail(`Use entre ${min} e ${max} caracteres.`);return s;}
function integer(v,min=1,max=Number.MAX_SAFE_INTEGER){const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)fail('Número inválido.');return n;}
function date(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('Data inválida.');return v;}
function url(v,image=false){if(!v)return '';if(image&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<1500000)return v;let u;try{u=new URL(v);}catch{fail('Endereço inválido.');}if(u.protocol!=='https:'||u.username||u.password||v.length>2048)fail('Use um endereço HTTPS válido.');return u.href;}
function isbn(v){const s=String(v||'').replace(/[\s-]/g,'').toUpperCase();if(!s)return '';if(/^\d{9}[\dX]$/.test(s)&&[...s].reduce((a,c,i)=>a+(c==='X'?10:Number(c))*(10-i),0)%11===0)return s;if(/^\d{13}$/.test(s)&&[...s].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0)%10===0)return s;fail('ISBN inválido. Confira os 10 ou 13 dígitos.');}
function normalize(v){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function password(v){if(typeof v!=='string'||v.length<10||Buffer.byteLength(v)>72)fail('A senha precisa de 10 caracteres e no máximo 72 bytes.');return v;}
function similar(a,b){a=normalize(a);b=normalize(b);if(a===b)return true;if(a.length<8||b.length<8||Math.abs(a.length-b.length)>3)return false;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}return prev[b.length]/Math.max(a.length,b.length)<=.08;}
module.exports={fail,text,integer,date,url,isbn,normalize,password,similar};
