const {normalize}=require('./validation');
const DAY=86400000;
const THEMES=[
 {genre:'Terror',subtitle:'Histórias para ler com a luz acesa.',titles:['Carrie','Drácula','Frankenstein','O Iluminado','A assombração da casa da colina','O exorcista','Coraline']},
 {genre:'Romance',subtitle:'Encontros que ficam depois da última página.',titles:['Orgulho e preconceito','Jane Eyre','Persuasão','Razão e sensibilidade','O morro dos ventos uivantes','A hipótese do amor','Vermelho branco e sangue azul']},
 {genre:'Suspense',subtitle:'Só mais um capítulo para descobrir.',titles:['E não sobrou nenhum','Assassinato no Expresso do Oriente','A paciente silenciosa','Garota exemplar','A empregada','O homem de giz','O assassinato de Roger Ackroyd']},
 {genre:'Fantasia',subtitle:'Uma porta para outros mundos.',titles:['O Hobbit','O nome do vento','O último desejo','A viagem do peregrino da alvorada','O oceano no fim do caminho','A sociedade do anel','O castelo animado']},
 {genre:'Ficção científica',subtitle:'Novos mundos. Grandes perguntas.',titles:['Duna','Fundação','Eu robô','Fahrenheit 451','O guia do mochileiro das galáxias','O fim da infância','A mão esquerda da escuridão']}
];
function calendar(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=t=>parts.find(p=>p.type===t).value;
 const date=`${get('year')}-${get('month')}-${get('day')}`,stamp=Date.parse(date+'T00:00:00Z'),weekday=(new Date(stamp).getUTCDay()+6)%7,monday=stamp-weekday*DAY,epoch=Date.parse('2026-11-09T00:00:00Z'),week=Math.floor((monday-epoch)/(7*DAY));
 const theme=THEMES[((week%THEMES.length)+THEMES.length)%THEMES.length];return {date,weekStart:new Date(monday).toISOString().slice(0,10),dayIndex:weekday,...theme};
}
const identity=b=>normalize(b.title)+'|'+normalize(b.author);
function createDiscovery({db,catalog,now=()=>new Date()}){
 let pending=null,pendingDate='';
 async function select(c){
  const stored=(await db.query('SELECT book,genre FROM discovery_days WHERE day=$1',[c.date])).rows[0];
  if(stored)return {...c,book:stored.book,genre:stored.genre};
  const history=(await db.query('SELECT book FROM discovery_days WHERE day >= $1 AND day < $2',[c.weekStart,c.date])).rows;const seen=new Set(history.map(r=>identity(r.book)));
  const local=(await db.query('SELECT id,title,author,genre,year,pages,publisher,synopsis,cover_url,isbn FROM books WHERE genre=$1 ORDER BY id',[c.genre])).rows.filter(b=>!seen.has(identity(b)));
  let book=local.find(b=>normalize(b.title)===normalize(c.titles[c.dayIndex]));
  if(!book&&local.length)book=local[(c.dayIndex)%local.length];
  if(!book){
   for(let i=0;i<3&&!book;i++){
    const title=c.titles[(c.dayIndex+i)%7];try{const results=await catalog.search(title);book=results.find(b=>normalize(b.title)===normalize(title)&&!seen.has(identity(b))&&b.cover_url&&b.synopsis);if(book)book={...book,genre:c.genre};}catch{}
   }
  }
  if(!book)return {...c,book:null};
  // As descobertas são sugestões, não cadastros automáticos na biblioteca.
  await db.query('INSERT INTO discovery_days(day,week_start,genre,book) VALUES($1,$2,$3,$4) ON CONFLICT(day) DO NOTHING',[c.date,c.weekStart,c.genre,JSON.stringify(book)]);
  return {...c,...(await db.query('SELECT book,genre FROM discovery_days WHERE day=$1',[c.date])).rows[0]};
 }
 return {get(){const c=calendar(now());if(pending&&pendingDate===c.date)return pending;pendingDate=c.date;pending=select(c).finally(()=>{pending=null;});return pending;}};
}
module.exports={calendar,createDiscovery,identity,THEMES};
