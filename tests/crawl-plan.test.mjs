import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPage,listKey,mergeQueue,nextPage,addDiscovered} from '../scripts/lib/crawl-plan.mjs';
import {parsePage} from '../scripts/lib/adapters.mjs';
test('new series seeds run before existing long queues',()=>{
  const old=Array.from({length:30},(_,i)=>`https://example.com/old?page=${i+2}`);
  const q=mergeQueue(old,['https://example.com/op18']);
  assert.equal(nextPage(q,new Set()),'https://example.com/op18');
});
test('targeted collection follows new pages in the same run and resumes later',()=>{
  const root='https://example.com/op18',old='https://example.com/op17';
  const q=mergeQueue([old],[root]),seen=new Set();
  assert.equal(nextPage(q,seen,[root]),root);
  addDiscovered(q,[root+'?page=4',root+'?page=2',root+'?page=3']);
  assert.equal(nextPage(q,seen,[root]),root+'?page=2');
  assert.equal(nextPage(q,seen,[root]),root+'?page=3');
  assert.equal(nextPage(q,new Set(),[root]),root+'?page=4');
  assert.ok(q.includes(old));
});
test('pagination normalizes first page while preserving list and search boundaries',()=>{
  assert.equal(canonicalPage('https://example.com/x?page=1'),'https://example.com/x');
  assert.equal(listKey('https://example.com/shopbrand/op18/page2/recommend/'),listKey('https://example.com/shopbrand/op18/'));
  assert.notEqual(listKey('https://example.com/x?keyword=a&page=2'),listKey('https://example.com/x?keyword=b'));
  const shop={adapter:'cart'},root='https://example.com/product-group/143';
  const html='<a href="?page=2">2</a><a href="?page=3">3</a><a href="?page=2&keyword=foo">別検索</a><a href="https://other.example/?page=2">別店</a>';
  assert.deepEqual(parsePage(shop,html,root).nextPages,[root+'?page=2',root+'?page=3']);
});
