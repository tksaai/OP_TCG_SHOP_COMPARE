import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readJson,atomicJson} from './lib/http.mjs';
import {auditCoverage} from './lib/coverage.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function audit({quiet=false}={}){
  const read=(p,f)=>readJson(path.join(ROOT,p),f);
  const [config,catalog,pages,snapshot,http]=await Promise.all([read('config/shops.json'),read('config/series-catalog.json'),read('.cache/collected-pages.json',{}),read('public/data/prices.json'),read('.cache/http/http.json',{pages:{}})]);
  const htmlByUrl={};
  for(const url of new Set([...Object.keys(pages),...Object.keys(http.pages).filter(u=>!u.endsWith('/robots.txt'))])){
    const c=await read(`.cache/http/${createHash('sha256').update(url).digest('hex')}.json`,null);if(c?.body)htmlByUrl[url]=c.body;
  }
  const report=auditCoverage({config,catalog,pages,snapshot,htmlByUrl});
  await atomicJson(path.join(ROOT,'public/data/coverage.json'),report);
  if(!quiet){console.log(JSON.stringify(report.summary,null,2));for(const s of report.series)if(s.registeredShops)console.log(`${s.id}: 登録 ${s.registeredShops}店 / 既知ページ収集 ${s.knownPagesCoveredShops}店 / 保存商品 ${s.offers}件`);}
  if(!report.summary.allSeriesCheckPassed){if(!quiet)console.error('全弾収集チェック: FAIL（不足あり。詳細: public/data/coverage.json）');if(process.argv.includes('--strict'))process.exitCode=1;}
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))audit().catch(e=>{console.error(e);process.exitCode=2;});
