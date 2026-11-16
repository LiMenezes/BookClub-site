const V=require('./validation');
const {normalize}=V;
const {genre:canonicalGenre}=require('./genres');
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
 async function catalogBook(tx,book){
  if(book.id&&/^\d+$/.test(String(book.id))){const row=(await tx.query('SELECT * FROM books WHERE id=$1',[book.id])).rows[0];if(row)return row;}
  const title=V.text(book.title,1,300),author=V.text(book.author,1,300),isbn=V.isbn(book.isbn),key=identity({title,author});
  const existing=async()=>{
   const exact=(await tx.query("SELECT * FROM books WHERE dedupe_key=$1 OR (lower(title)=lower($2) AND lower(author)=lower($3)) OR ($4<>'' AND isbn=$4) ORDER BY id LIMIT 1",[key,title,author,isbn])).rows[0];
   if(exact)return exact;
   const candidates=(await tx.query('SELECT * FROM books WHERE author ILIKE $1 ORDER BY id LIMIT 1000',['%'+author.split(' ').at(-1)+'%'])).rows;
   return candidates.find(b=>V.similar(b.title,title)&&V.similar(b.author,author));
  };
  const old=await existing();if(old)return old;
  const row=(await tx.query('INSERT INTO books(title,author,genre,year,pages,synopsis,cover_url,isbn,dedupe_key,created_by,verified,publisher) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,FALSE,$10) ON CONFLICT DO NOTHING RETURNING *',[title,author,canonicalGenre(book.genre),V.text(String(book.year||'').slice(0,20),0,20),book.pages?V.integer(book.pages,1,100000):null,V.text(book.synopsis||'',0,12000),V.url(book.cover_url,true),isbn||null,key,V.text(book.publisher||'',0,300)])).rows[0];
  const saved=row||await existing();if(!saved)throw Error('Não foi possível cadastrar a descoberta.');return saved;
 }
 async function publish(c,book){
  return db.transaction(async tx=>{
   // The day has one winner across serverless instances; only its book is imported.
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['discovery:'+c.date]);
   const stored=(await tx.query('SELECT book,genre FROM discovery_days WHERE day=$1 FOR UPDATE',[c.date])).rows[0];
   const saved=await catalogBook(tx,stored?.book||book);
   if(stored)await tx.query('UPDATE discovery_days SET book=$1 WHERE day=$2',[JSON.stringify(saved),c.date]);
   else await tx.query('INSERT INTO discovery_days(day,week_start,genre,book) VALUES($1,$2,$3,$4)',[c.date,c.weekStart,c.genre,JSON.stringify(saved)]);
   return {...c,genre:stored?.genre||c.genre,book:saved};
  });
 }
 async function select(c){
  const stored=(await db.query('SELECT book,genre FROM discovery_days WHERE day=$1',[c.date])).rows[0];
  if(stored){if(stored.book.id){const current=(await db.query('SELECT * FROM books WHERE id=$1',[stored.book.id])).rows[0];if(current)return {...c,book:current,genre:stored.genre};}return publish(c,stored.book);}
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
  // Register in the shared catalog, never in a reader's personal shelf.
  return publish(c,book);
 }
 return {get(){const c=calendar(now());if(pending&&pendingDate===c.date)return pending;pendingDate=c.date;pending=select(c).finally(()=>{pending=null;});return pending;}};
}
module.exports={calendar,createDiscovery,identity,THEMES};
