import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDbCatalog,DB_ROOT} from './lib/db-catalog.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function syncDbCatalog({local=null}={}){
  const load=async name=>{
    if(local)return JSON.parse(await readFile(path.resolve(local,name),'utf8'));
    const response=await fetch(`${DB_ROOT}/${name}`,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'OPCardCompare/1.0 DB catalog sync'}});
    if(!response.ok)throw new Error(`OP_TCG_DB ${name}: HTTP ${response.status}`);
    return response.json();
  };
  const previous=JSON.parse(await readFile(path.join(ROOT,'public/data/catalog.json'),'utf8'));
  const [cards,manifest,master]=await Promise.all(['cards.json','image-manifest.json','series-master.json'].map(load));
  const {catalog,info}=buildDbCatalog(cards,manifest,master,previous);
  const oldCount=Object.values(previous).filter(c=>c.db).length;
  if(info.sourceCards<100||oldCount&&info.sourceCards<oldCount*.9)throw new Error('DBリストが大幅に減少したため前回の検索対象を保持します');
  info.syncedAt=new Date().toISOString();info.manifestGeneratedAt=manifest.generatedAt||null;
  await mkdir(path.join(ROOT,'public/data'),{recursive:true});
  await writeFile(path.join(ROOT,'public/data/catalog.json'),JSON.stringify(catalog));
  await writeFile(path.join(ROOT,'public/data/catalog-info.json'),JSON.stringify(info,null,2)+'\n');
  console.log(`OP_TCG_DB: ${info.sourceCards} cards, ${info.series.length} series (${info.excludedCards} DON/unresolved identifiers excluded)`);
  return info;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  syncDbCatalog({local:process.argv.find(a=>a.startsWith('--local='))?.slice(8)}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
