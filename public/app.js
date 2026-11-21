import {normalise,isFresh,bestOffers,groupOffers,validateSnapshot} from './compare.js';
const $=s=>document.querySelector(s), escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=n=>`¥${n.toLocaleString('ja-JP')}`;
const date=s=>s?new Intl.DateTimeFormat('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(new Date(s)):'未取得';
const state={data:null,catalog:{},groups:[],selected:new Set(),favorites:new Set(),view:'compare',page:1,filtered:[],size:20,imported:false};
try{state.favorites=new Set(JSON.parse(localStorage.getItem('op-compare-favorites')||'[]'));}catch{}
let toastTimer;
function toast(t){$('#toast').textContent=t;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4000);}
function showError(message){$('#errorBox').hidden=false;$('#errorBox').textContent=message;}
function setData(data){
  state.data=validateSnapshot(data);state.groups=groupOffers(data,state.catalog);
  state.selected=new Set(data.shops.map(s=>s.id));state.page=1;
  $('#updatedAt').textContent=`${state.imported?'取込データ':'保存データ'}：${date(data.generatedAt)} JST`;
  $('#edition').innerHTML='<option value="">すべてのシリーズ</option>'+[...new Set(state.groups.map(g=>g.edition))].sort().reverse().map(s=>`<option value="${escape(s)}">${escape(s)}</option>`).join('');
  renderChips();renderSummary();renderShops();render();
}
async function load(){
  $('#errorBox').hidden=true;$('#reloadButton').disabled=true;
  try{
    const [response,catalog]=await Promise.all([fetch('data/prices.json',{cache:'no-cache'}),fetch('data/catalog.json').then(r=>r.ok?r.json():{}).catch(()=>({}))]);
    if(!response.ok)throw new Error('価格ファイルを読み込めません');state.catalog=catalog;
    const data=await response.json();state.imported=false;setData(data);
  }catch(e){showError(`データの読み込みに失敗しました。再読込をお試しください。${e.message}`);$('#resultCount').textContent='読み込みエラー';}
  finally{$('#reloadButton').disabled=false;}
}
function renderChips(){
  $('#shopFilters').innerHTML=state.data.shops.map(s=>`<button class="shop-chip ${s.enabled?'':'paused'}" data-shop="${escape(s.id)}" aria-pressed="${state.selected.has(s.id)}" title="${escape(s.note)}">${escape(s.name)}${s.enabled?'':'（停止）'}</button>`).join('');
}
function renderSummary(){
  const d=state.data,active=d.shops.filter(s=>d.offers.some(o=>o.shopId===s.id&&isFresh(o,d.policy))).length;
  const comparable=state.groups.filter(g=>g.verified && bestOffers(g.offers,d.policy).length>=2).length;
  const fresh=d.offers.filter(o=>isFresh(o,d.policy)).length;
  $('#summary').innerHTML=`<div class="summary-card"><p>販売価格の収集ショップ</p><strong>${active}</strong><small>/ ${d.shops.length} 店</small><span class="hint">${d.shops.filter(s=>!s.enabled).length}店は取得停止中</span></div><div class="summary-card"><p>収集済みの商品</p><strong>${d.offers.length.toLocaleString()}</strong><small>件</small><span class="hint">${fresh.toLocaleString()}件が36時間以内</span></div><div class="summary-card"><p>在庫あり・2店以上で比較</p><strong>${comparable}</strong><small>種類</small><span class="hint">通常版を照合</span></div>`;
  $('#favoriteCount').textContent=state.favorites.size;
}
function renderShops(){
  $('#shopCards').innerHTML=state.data.shops.map(s=>{
    const offers=state.data.offers.filter(o=>o.shopId===s.id),fresh=offers.filter(o=>isFresh(o,state.data.policy)).length;
    const status=!s.enabled?'停止中':fresh?'収集済み':'更新待ち';
    return `<article class="shop-status-card"><span class="status-pill ${!s.enabled?'paused':!fresh||s.status==='partial'?'partial':''}">${status}</span><h3>${escape(s.name)}</h3><p><strong>${offers.length.toLocaleString()}件</strong>の販売商品 / 36時間以内 ${fresh}件<br>最終確認：${date(s.lastCheckedAt)} JST</p><p>${escape(s.message||s.note)}<br>収集待ち一覧：${s.queuedPages||0}ページ</p><a href="${escape(s.origin)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">ショップを開く</a></article>`;
  }).join('');
}
function offersFor(g){return g.offers.filter(o=>state.selected.has(o.shopId));}
function render(){
  if(!state.data)return;
  const q=normalise($('#search').value),terms=q.split(/[,、]/).filter(Boolean),edition=$('#edition').value,variant=$('#variant').value;
  const rows=state.groups.filter(g=>{
    const offers=offersFor(g);if(!offers.length)return false;
    if(state.view==='favorites'&&!state.favorites.has(g.key))return false;
    if(edition&&g.edition!==edition)return false;
    if(variant==='normal'&&(!g.verified||g.variant!=='normal'))return false;
    if(variant==='parallel'&&g.variant==='normal'&&g.verified)return false;
    if(terms.length&&!terms.every(t=>normalise(`${g.name} ${g.number} ${g.offers.map(o=>o.title).join(' ')}`).includes(t)))return false;
    const best=bestOffers(offers,state.data.policy);
    if($('#stockOnly').checked&&!best.length)return false;
    if($('#comparableOnly').checked&&(!g.verified||best.length<2))return false;
    return true;
  }).map(g=>{const offers=offersFor(g),best=bestOffers(offers,state.data.policy);return {...g,selectedOffers:offers,best,min:best[0]?.price??Infinity,gap:best.length>1?best.at(-1).price-best[0].price:0};});
  const sort=$('#sort').value;
  rows.sort((a,b)=>(sort==='low'?a.min-b.min:sort==='gap'?b.gap-a.gap:sort==='number'?0:b.best.length-a.best.length)||a.number.localeCompare(b.number)||a.key.localeCompare(b.key));
  state.filtered=rows;const count=rows.length,pages=Math.max(1,Math.ceil(count/state.size));state.page=Math.min(state.page,pages);
  $('#resultCount').textContent=`${count.toLocaleString()} 件`;
  $('#coverage').textContent=`${state.data.scope} 36時間を超えた価格は最安値の対象外です。${variant!=='normal'?'「版・状態を要確認」は店舗をまたいで自動比較しません。':''}`;
  const shops=state.data.shops.filter(s=>state.selected.has(s.id));
  $('#results').innerHTML=count?`<table><thead><tr><th scope="col">カード</th><th scope="col">在庫あり最安</th>${shops.map(s=>`<th scope="col">${escape(s.name)}</th>`).join('')}</tr></thead><tbody>${rows.slice((state.page-1)*state.size,state.page*state.size).map(g=>row(g,shops)).join('')}</tbody></table>`:`<div class="empty"><strong>${state.selected.size?'該当するカードがありません':'比較するショップを選んでください'}</strong><p>${state.view==='favorites'?'カード横の☆を押すと、ここに保存できます。<br>':'検索条件を減らすか、「在庫あり」を外してお試しください。<br>'}取得していないカードや古い価格は、最安値として表示しません。</p></div>`;
  $('#pageInfo').textContent=`${count?((state.page-1)*state.size+1):0}–${Math.min(state.page*state.size,count)} / ${count} 件`;
  $('#prevButton').disabled=state.page<=1;$('#nextButton').disabled=state.page>=pages;
}
function shopCell(g,s,mobile=false){
  const list=g.selectedOffers.filter(o=>o.shopId===s.id),best=g.best.find(o=>o.shopId===s.id);
  const o=best||[...list].sort((a,b)=>b.observedAt.localeCompare(a.observedAt))[0];
  const lowest=best&&best.price===g.min;
  if(mobile){if(!best)return '';return `<a class="mobile-offer ${lowest?'best':''}" href="${escape(best.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(s.name)}<b>${yen(best.price)}</b></a>`;}
  if(!o)return `<td class="price-cell desktop-price"><span class="unavailable">—</span><span class="stock">${s.enabled?'未取得':'取得停止中'}</span></td>`;
  const fresh=isFresh(o,state.data.policy),stock=o.stock==='out'?'在庫なし':o.stock==='unknown'?'在庫未確認':'在庫あり';
  return `<td class="price-cell desktop-price ${lowest?'best':''}"><a class="amount ${!fresh?'stale':''}" href="${escape(o.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${escape(o.title)} / 確認 ${date(o.observedAt)} JST">${yen(o.price)}</a><span class="stock">${fresh?stock:'期限切れ・参考価格'}</span></td>`;
}
function row(g,shops){
  const image=g.verified&&g.variant==='normal'&&g.meta.image?`<img class="thumb" src="${escape(g.meta.image)}" alt="${escape(g.name)} 通常版" loading="lazy" width="46" height="65">`:`<span class="thumb no-image">${escape(g.edition)}<br>${g.verified?'CARD':'版確認'}</span>`;
  return `<tr><td><div class="product">${image}<div class="card-info"><div class="card-number">${escape(g.number)}${g.meta.rarity?` ・ ${escape(g.meta.rarity)}`:''}</div><button class="card-title" data-detail="${escape(g.key)}">${escape(g.name)}</button><span class="card-tag ${g.verified?'':'warn'}">${g.verified?'通常版':'版・状態を要確認'}</span></div><button class="favorite ${state.favorites.has(g.key)?'on':''}" data-favorite="${escape(g.key)}" aria-label="${escape(g.name)}をお気に入り${state.favorites.has(g.key)?'から削除':'に追加'}" aria-pressed="${state.favorites.has(g.key)}">${state.favorites.has(g.key)?'★':'☆'}</button></div></td><td class="lowest">${g.best.length?`<span class="amount">${yen(g.min)}</span><span class="stock">${g.best.length}店で在庫あり</span>${g.gap?`<span class="gap">最大 ${yen(g.gap)} の差</span>`:''}`:'<span class="unavailable">比較対象なし</span>'}</td>${shops.map(s=>shopCell(g,s)).join('')}<td class="mobile-offers">${shops.map(s=>shopCell(g,s,true)).join('')||'<span class="unavailable">現在の在庫あり価格はありません。カード名から参考価格を確認できます。</span>'}</td></tr>`;
}
function detail(key){
  const g=state.groups.find(g=>g.key===key);if(!g)return;
  $('#detailHeading').innerHTML=`<span class="card-number">${escape(g.number)} / ${g.verified?'通常版':'版・状態を要確認'}</span><h2>${escape(g.name)}</h2>`;
  const offers=[...g.offers].sort((a,b)=>a.price-b.price);
  $('#detailBody').innerHTML=`<p class="detail-note">${g.verified?'同じ通常版として照合した商品です。':'同一の版か確認できないため、この商品は他店の最安値と合算していません。商品名・イラスト・状態をリンク先でご確認ください。'}<br>価格は税込・送料別。価格や在庫は確認後に変わることがあります。</p>${offers.map(o=>{
    const s=state.data.shops.find(s=>s.id===o.shopId),fresh=isFresh(o,state.data.policy);
    return `<article class="detail-offer"><div><strong>${escape(s.name)}</strong><div class="offer-title">${escape(o.title)} ${escape(o.model)}</div><small>${o.stock==='in'?'在庫あり':o.stock==='out'?'在庫なし':'在庫未確認'} · ${date(o.observedAt)} JST 確認${fresh?'':' · 期限切れ（最安値対象外）'}${o.manual?' · 手動取込':''}</small></div><div><a class="amount" href="${escape(o.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${yen(o.price)}</a><small>商品ページを見る</small></div></article>`;
  }).join('')}`;
  $('#detailDialog').showModal();
}
function setView(view){state.view=view;state.page=1;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#compareView').hidden=view==='shops';$('#shopsView').hidden=view!=='shops';$('#pageTitle').textContent=view==='favorites'?'気になるカードを、まとめて。':view==='shops'?'価格データの出どころ。':'欲しいカードを、いい価格で。';render();}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.view)setView(b.dataset.view);
  if(b.dataset.shop){state.selected.has(b.dataset.shop)?state.selected.delete(b.dataset.shop):state.selected.add(b.dataset.shop);state.page=1;renderChips();render();}
  if(b.dataset.detail)detail(b.dataset.detail);
  if(b.dataset.favorite){const k=b.dataset.favorite;state.favorites.has(k)?state.favorites.delete(k):state.favorites.add(k);try{localStorage.setItem('op-compare-favorites',JSON.stringify([...state.favorites]));}catch{toast('お気に入りはこの画面を開いている間のみ保存されます');}renderSummary();render();}
  if(b.dataset.close)document.getElementById(b.dataset.close).close();
});
for(const id of ['edition','variant','sort','stockOnly','comparableOnly'])$('#'+id).addEventListener('change',()=>{state.page=1;render();});
$('#search').addEventListener('input',()=>{state.page=1;render();});
$('#resetButton').addEventListener('click',()=>{$('#search').value='';$('#edition').value='';$('#variant').value='normal';$('#sort').value='shops';$('#stockOnly').checked=true;$('#comparableOnly').checked=false;state.selected=new Set(state.data.shops.map(s=>s.id));state.page=1;renderChips();render();});
$('#prevButton').addEventListener('click',()=>{state.page--;render();});$('#nextButton').addEventListener('click',()=>{state.page++;render();});
$('#reloadButton').addEventListener('click',()=>{load();});$('#clearImport').addEventListener('click',load);
$('#policyButton').addEventListener('click',()=>$('#policyDialog').showModal());
$('#csvButton').addEventListener('click',()=>{
  if(!state.data)return;const lines=[['型番','カード名','比較区分','ショップ','販売価格（税込）','在庫','確認日時','URL']];
  for(const g of state.filtered)for(const o of g.selectedOffers)lines.push([g.number,g.name,g.verified?'通常版':'要確認',state.data.shops.find(s=>s.id===o.shopId).name,o.price,o.stock,o.observedAt,o.url]);
  const safe=v=>`"${String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;
  const blob=new Blob(['\uFEFF'+lines.map(l=>l.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});download(blob,'onepiece-shop-prices.csv');
});
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('#importFile').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>30*1024*1024)throw new Error('30MB以下のJSONファイルを選んでください');const data=validateSnapshot(JSON.parse(await file.text()));state.imported=true;setData(data);toast(`${data.offers.length}件の価格データを取り込みました`);}catch(err){toast(`取り込み失敗：${err.message}`);}finally{e.target.value='';}
});
load();
// Age out offers even when the tab remains open overnight. No shop network requests.
setInterval(()=>{if(state.data){renderSummary();renderShops();render();}},60000);
