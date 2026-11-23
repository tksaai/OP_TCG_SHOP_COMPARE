import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {begin,finish,reserve,validateCheckpoint} from '../scripts/automation-state.mjs';
import {atomicJson,PoliteClient} from '../scripts/lib/http.mjs';

const fixture=()=>({schemaVersion:1,savedAt:new Date().toISOString(),lease:null,files:{
  '.cache/http/http.json':{hosts:{},pages:{}},'.cache/collected-pages.json':{},'.cache/queues.json':{},
  'public/data/prices.json':{offers:[{id:'preserved'}]},'public/data/history.json':{products:[]},'public/data/coverage.json':{summary:{}}
}});
test('interrupted lease blocks a new run until 26 hours and corrupt state fails closed',()=>{
  const now=Date.now(),state=reserve(fixture(),'first',now);
  assert.throws(()=>reserve(state,'next',now+25*3600000),/未完了/);
  assert.equal(reserve(state,'next',now+26*3600000).lease.runId,'next');
  delete state.files['.cache/http/http.json'];assert.throws(()=>validateCheckpoint(state),/状態がありません/);
});
test('durable counters override an older cache; finishing saves partial progress and history',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'op-ci-'));
  try{
    const state=fixture();state.files['.cache/http/http.json'].hosts['https://example.com']={count:7};
    await atomicJson(path.join(root,'_collector-state/state.json'),state);
    await atomicJson(path.join(root,'.cache/http/http.json'),{hosts:{},pages:{}});
    await begin(root,'42');
    const current=JSON.parse(await readFile(path.join(root,'.cache/http/http.json'),'utf8'));
    assert.equal(current.hosts['https://example.com'].count,7);
    current.hosts['https://example.com'].count=8;
    await atomicJson(path.join(root,'.cache/http/http.json'),current);
    await assert.rejects(finish(root,'other'),/所有者/);
    await finish(root,'42');
    const saved=JSON.parse(await readFile(path.join(root,'_collector-state/state.json'),'utf8'));
    assert.equal(saved.lease,null);assert.equal(saved.files['.cache/http/http.json'].hosts['https://example.com'].count,8);
    assert.equal(saved.files['public/data/prices.json'].offers[0].id,'preserved');
  }finally{await rm(root,{recursive:true,force:true});}
});
const policy={cacheTtlHours:12,minIntervalMs:10000,maxRequestsPerShopPerDay:2,timeoutMs:1000};
test('three-hour schedule revalidates after three hours while preserving the daily budget',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'op-ci-three-hour-'));let now=Date.now(),calls=0;
  const options={now:()=>now,fetch:async(_url,opt)=>{
    calls++;if(calls===1)return new Response('saved',{headers:{etag:'version-1'}});
    assert.equal(opt.headers['If-None-Match'],'version-1');return new Response(null,{status:304});
  }};
  try{
    const client=await new PoliteClient(root,{...policy,cacheTtlHours:3},options).init();
    await client.get('https://example.com/list');
    now+=3*3600000-1;await client.get('https://example.com/list');assert.equal(calls,1);
    now+=1;const next=await new PoliteClient(root,{...policy,cacheTtlHours:3},options).init();
    const result=await next.get('https://example.com/list');
    assert.equal(calls,2);assert.equal(result.body,'saved');assert.equal(result.checkedAt,now);
    await assert.rejects(next.get('https://example.com/another'),/上限/);assert.equal(calls,2);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('evicted body cache never causes an early request; no conditional header without body',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'op-ci-http-'));let now=Date.now(),calls=0;
  try{
    await atomicJson(path.join(root,'http.json'),{hosts:{},pages:{'https://example.com/list':{checkedAt:now,etag:'old'}}});
    const client=await new PoliteClient(root,policy,{now:()=>now,fetch:async(_url,opt)=>{calls++;assert.equal(opt.headers['If-None-Match'],undefined);return new Response('ok');}}).init();
    await assert.rejects(client.get('https://example.com/list'),/本文キャッシュ/);assert.equal(calls,0);
    now+=13*3600000;await client.get('https://example.com/list');assert.equal(calls,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('rolling budget survives a new runner and does not reset at a fixed window boundary',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'op-ci-limit-'));let now=Date.now(),calls=0;
  const options={now:()=>now,sleep:async ms=>{now+=ms;},fetch:async()=>{calls++;return new Response('ok');}};
  try{
    const client=await new PoliteClient(root,policy,options).init();
    await client.get('https://example.com/a');now+=23*3600000;await client.get('https://example.com/b');
    now+=2*3600000;const restored=await new PoliteClient(root,policy,options).init();
    await restored.get('https://example.com/c');await assert.rejects(restored.get('https://example.com/d'),/上限/);
    assert.equal(calls,3);
  }finally{await rm(root,{recursive:true,force:true});}
});
