// Import only observations already saved in this tool's own Git snapshots.
// No shop requests, no synthetic historical prices.
import {execFileSync} from 'node:child_process';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {readJson,atomicJson} from './lib/http.mjs';
import {mergeHistory} from './lib/price-history.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=await readJson(path.join(ROOT,'config/shops.json'));
const overrides=await readJson(path.join(ROOT,'config/identity-overrides.json'),{});
let history=await readJson(path.join(ROOT,'public/data/history.json'),null);
const commits=execFileSync('git',['log','--reverse','--format=%H','--','public/data/prices.json'],{cwd:ROOT,encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);
for(const commit of commits){
  if(!/^[0-9a-f]{40}$/.test(commit))throw new Error('Invalid revision');
  const raw=execFileSync('git',['show',`${commit}:public/data/prices.json`],{cwd:ROOT,encoding:'utf8',maxBuffer:80*1024*1024});
  history=mergeHistory(history,JSON.parse(raw),config,overrides);
}
history=mergeHistory(history,await readJson(path.join(ROOT,'public/data/prices.json')),config,overrides);
await atomicJson(path.join(ROOT,'public/data/history.json'),history);
console.log(`保存履歴 ${commits.length}版から復元: ${Object.keys(history.products).length}商品 / ${Object.values(history.products).reduce((n,p)=>n+p.points.length,0)}観測点 / ${history.firstObservedAt}〜${history.lastObservedAt}`);
