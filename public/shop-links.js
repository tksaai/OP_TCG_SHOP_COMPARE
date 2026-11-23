import {cardLookup} from './shop-search.js';
import {isFresh} from './compare.js';
import {observedTime,offerTable} from './offer-view.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function shopPriceRows(shops,number,data,now=Date.now()){
  const policy=data?.policy||{staleAfterHours:36};
  return shops.map(shop=>{
    const offers=(data?.offers||[]).filter(o=>o.number===number&&o.shopId===shop.id);
    const normal=offers.filter(o=>o.verified&&o.key===`${number}:normal:ja:standard`&&o.variant==='normal'&&o.condition==='standard'&&o.language==='ja');
    const rank=o=>isFresh(o,policy,now)?(o.stock==='in'?0:o.stock==='out'?1:2):3;
    normal.sort((a,b)=>rank(a)-rank(b)||(rank(a)===3?b.observedAt.localeCompare(a.observedAt):a.price-b.price)||b.observedAt.localeCompare(a.observedAt));
    const offer=normal[0],report=data?.lookupStatus?.find(r=>r.number===number&&r.shopId===shop.id);
    const status=offer?null:!shop.enabled?'自動取得停止中':offers.length?'通常版は未取得':report?.status==='not_found'?'確認時の検索結果なし':report?.status==='pending'?'取得待ち':'未取得';
    return {shop,offer,fresh:offer?isFresh(offer,policy,now):false,status,offers,report};
  });
}
export function shopLinks(shops,number,data,{open=false}={}){
  const rows=shopPriceRows(shops,number,data);
  const extra=rows.filter(r=>r.offers.some(o=>o.id!==r.offer?.id));
  return `<details class="shop-search-links" ${open?'open':''}><summary>各店舗で ${esc(number)} を探す・価格を見る</summary><p class="detail-note">保存済みの通常版価格を店舗ごとに表示。在庫ありを優先し、売り切れ・古い価格は参考として表示します。税込・送料別。検索操作では店舗へのアクセスは発生せず、価格は定期収集で更新します。</p><table class="offer-table"><thead><tr><th scope="col">店舗</th><th scope="col">価格・在庫</th><th scope="col">取得日<span class="offer-unit">日本時間</span></th></tr></thead><tbody>${rows.map(({shop:s,offer:o,fresh,status,report})=>{
    const lookup=cardLookup(s,number);
    const stock=o?.stock==='in'?'在庫あり':o?.stock==='out'?'売り切れ・参考価格':'在庫未確認・参考価格';
    return `<tr><th scope="row">${esc(s.name)}<a class="lookup-store-link" href="${esc(lookup?.url||s.origin)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${lookup?.label||'店舗トップ'}</a>${s.enabled?'':'<span class="offer-status">自動取得停止中</span>'}</th><td>${o?`<a class="amount ${fresh?'':'stale'}" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">¥${o.price.toLocaleString('ja-JP')}</a><span class="offer-status">${stock}</span>${fresh?'':'<span class="offer-stale-note">期限切れ・参考価格</span>'}`:`<span class="offer-muted">${status}</span>`}</td><td>${observedTime(o?.observedAt)}${!o&&report?.observedAt?`<span class="offer-status">検索確認日</span>${observedTime(report.observedAt)}`:''}</td></tr>`;
  }).join('')}</tbody></table>${extra.length?`<details class="lookup-products"><summary>ほかの掲載商品・パラレル・状態違いを確認</summary><p class="detail-note">版や状態が異なる商品を含みます。上の通常版価格とは分けて表示しています。</p>${offerTable(extra.flatMap(r=>r.offers.filter(o=>o.id!==r.offer?.id).map(offer=>({shop:r.shop,offer,fresh:isFresh(offer,data.policy)}))),{showTitle:true})}</details>`:''}</details>`;
}
