// Development-only: reuses already fetched pages so validation does not fetch shops again.
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {atomicJson} from './lib/http.mjs';
import {parsePage} from './lib/adapters.mjs';
const config=JSON.parse(await readFile('config/shops.json','utf8'));
const entries=[
 ['cardrush','cardrush.html','/product-list'],['cardrush','cardrush-op17.html','/product-group/134'],
 ['yuyutei','yuyutei-op17.html','/sell/opc/s/op17'],
 ['fullahead','fullahead.html','/shopbrand/onepiece/'],['fullahead','fullahead-op17.html','/shopbrand/opc-op17/'],
 ['raftel','raftel.html','/product-list'],['raftel','raftel-op17.html','/product-list/372'],
 ['mercard','mercard.html','/product-list'],['mercard','mercard-op17.html','/product-group/75'],
 ['samurai','samurai.html','/product-list/346'],['samurai','samurai-op17.html','/product-list/686'],
 ['onehappy','onehappy.html','/'],['onehappy','onehappy-op17.html','/view/category/ct689']
];
const state={hosts:{},pages:{}},pages={},queues={};
for(const shop of config.shops.filter(s=>s.enabled)) {
  const file=`research/${shop.id}-robots.txt`, bytes=await readFile(file), s=await stat(file);
  const body=['fullahead','onehappy'].includes(shop.id)?'':bytes.toString('utf8');
  const url=`${shop.origin}/robots.txt`, checkedAt=s.mtimeMs;
  state.pages[url]={checkedAt};state.hosts[shop.origin]={windowStart:checkedAt,count:5,last:checkedAt,cooldown:0};
  await atomicJson(`.cache/http/${createHash('sha256').update(url).digest('hex')}.json`,{body,status:body?200:404,url,checkedAt});
  queues[shop.id]=shop.seeds.map(s=>new URL(s,shop.origin).href);
}
for(const [shopId,file,pathname] of entries) {
  const shop=config.shops.find(s=>s.id===shopId), url=new URL(pathname,shop.origin).href;
  const bytes=await readFile(`research/${file}`),s=await stat(`research/${file}`);
  const body=new TextDecoder(shopId==='fullahead'?'euc-jp':'utf-8').decode(bytes), checkedAt=s.mtimeMs;
  const parsed=parsePage(shop,body,url);
  console.log(shopId,file,parsed.offers.length,parsed.nextPages.length,parsed.offers[0]);
  if(!parsed.offers.length) continue;
  state.pages[url]={checkedAt}; state.hosts[shop.origin].last=Math.max(state.hosts[shop.origin].last,checkedAt);
  pages[url]={shopId,observedAt:new Date(checkedAt).toISOString(),offers:parsed.offers};
  queues[shopId]=[...new Set([...queues[shopId],...parsed.nextPages])];
  await atomicJson(`.cache/http/${createHash('sha256').update(url).digest('hex')}.json`,{body,status:200,url,checkedAt});
}
await atomicJson('.cache/http/http.json',state);await atomicJson('.cache/collected-pages.json',pages);await atomicJson('.cache/queues.json',queues);
