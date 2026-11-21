import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect} from './collect.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
    const u=new URL(req.url,'http://localhost');const relative=decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file=path.resolve(ROOT,relative||'index.html');
    if(!file.startsWith(ROOT+path.sep)||relative.split(/[\\/]/).some(p=>p.startsWith('.'))){res.writeHead(403);return res.end();}
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':file.endsWith('.json')?'no-cache':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.PORT)||4173;server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
if(process.argv.includes('--auto')){
  let running=false;
  const refresh=async()=>{if(running)return;running=true;try{await collect();}catch(e){console.error(e.message);}finally{running=false;}};
  const dataPath=path.join(ROOT,'data/prices.json');
  const info=await stat(dataPath).catch(()=>null);
  if(!info || Date.now()-info.mtimeMs>12*3600000)refresh();
  setInterval(refresh,12*3600000);console.log('自動収集: 起動中12時間ごと / 1店最大5一覧 / 24時間20リクエストまで');
}
