const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'dist'),source=path.join(root,'public');
if(path.dirname(dest)!==root||path.basename(dest)!=='dist')throw Error('Destino inválido.');
fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
fs.copyFileSync(path.join(source,'index.html'),path.join(dest,'index.html'));
fs.cpSync(source,path.join(dest,'assets'),{recursive:true,filter:p=>!path.basename(p).startsWith('.')&&path.basename(p)!=='index.html'});
console.log('Páginas e assets preparados; nenhum arquivo privado foi publicado.');
