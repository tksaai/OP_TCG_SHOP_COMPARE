import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {atomicJson} from './lib/http.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const FILES=['.cache/http/http.json','.cache/collected-pages.json','.cache/queues.json','public/data/prices.json','public/data/history.json','public/data/coverage.json'];
const read=async file=>JSON.parse(await readFile(file,'utf8'));
export function validateCheckpoint(state){
  if(state?.schemaVersion!==1 || !state.files || !Number.isFinite(Date.parse(state.savedAt)))throw new Error('収集チェックポイントが不正です。初期化せず停止します');
  for(const file of FILES)if(!state.files[file] || typeof state.files[file]!=='object')throw new Error(`収集状態がありません: ${file}`);
  const http=state.files[FILES[0]];
  if(!http.hosts || !http.pages)throw new Error('HTTP制限状態がありません');
  if(state.lease && (!Number.isFinite(Date.parse(state.lease.until)) || !state.lease.runId))throw new Error('収集ロックが不正です');
  return state;
}
export function reserve(state,runId,now=Date.now()){
  validateCheckpoint(state);
  if(state.lease && Date.parse(state.lease.until)>now)throw new Error(`前回の収集が未完了です。安全のため ${state.lease.until} まで停止します`);
  // A job lasts at most 45 minutes. After an interrupted job, 26h exceeds
  // its last possible request plus the full 24h per-host budget window.
  return {...state,lease:{runId,until:new Date(now+26*3600000).toISOString()}};
}
export async function capture(root=ROOT){
  const files={};for(const file of FILES)files[file]=await read(path.join(root,file));
  return validateCheckpoint({schemaVersion:1,savedAt:new Date().toISOString(),lease:null,files});
}
export async function begin(root=ROOT,runId=process.env.GITHUB_RUN_ID){
  if(!runId)throw new Error('GITHUB_RUN_IDが必要です');
  const file=path.join(root,'_collector-state/state.json');
  const state=reserve(await read(file),runId);
  for(const name of FILES)await atomicJson(path.join(root,name),state.files[name]);
  await atomicJson(file,state);
}
export async function finish(root=ROOT,runId=process.env.GITHUB_RUN_ID){
  const file=path.join(root,'_collector-state/state.json');
  const state=validateCheckpoint(await read(file));
  if(!runId || state.lease?.runId!==runId)throw new Error('収集ロックの所有者が一致しません');
  await atomicJson(file,await capture(root));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const command=process.argv[2];
  const action=command==='begin'?begin:command==='finish'?finish:command==='seed'?async()=>atomicJson(path.join(ROOT,'_collector-state/state.json'),await capture()):null;
  if(!action)throw new Error('begin / finish / seed を指定してください');
  await action();
}
