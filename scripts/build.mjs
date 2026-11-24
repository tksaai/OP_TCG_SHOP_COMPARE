import {mkdir,readFile,writeFile,cp,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async(f,def)=>{try{return JSON.parse(await readFile(f,'utf8'));}catch(e){if(e.code==='ENOENT')return def;throw e;}};
const data=await read(path.join(ROOT,'public/data/prices.json'),null);if(!data)throw new Error('先に価格を収集してください');
const catalog=await read(path.join(ROOT,'public/data/catalog.json'),{});
const manifest=await read(path.join(ROOT,'../image-manifest.json'),{cards:{}});
await mkdir(path.join(ROOT,'public/images'),{recursive:true});
for(const number of new Set(data.offers.map(o=>o.number))){
  const image=manifest.cards[number]?.find(i=>i.variantIndex===0);
  if(image){const source=path.resolve(ROOT,'..',image.path);if(source.startsWith(path.resolve(ROOT,'../CardsWebP')+path.sep)){try{await access(source);await copyFile(source,path.join(ROOT,'public/images',`${number}.webp`));catalog[number]||={name:number};catalog[number].image=`images/${number}.webp`;}catch{}}}
}
await writeFile(path.join(ROOT,'public/data/catalog.json'),JSON.stringify(catalog));
await mkdir(path.join(ROOT,'dist'),{recursive:true});await cp(path.join(ROOT,'public'),path.join(ROOT,'dist'),{recursive:true});
console.log(`Built dist: ${data.offers.length} offers, ${Object.keys(catalog).length} card records`);
