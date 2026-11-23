const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tokyo'});
const clock=new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Tokyo'});
export function priceSourceNote(offer){return offer?.priceSource==='embedded-reference'?'<span class="offer-stale-note">店舗画面では非表示の参考価格（商品データ内の値）</span>':'';}
export function observedTime(value){
  if(!value)return '<span class="offer-muted">—</span>';
  const time=new Date(value);
  return `<time class="offer-date" datetime="${esc(time.toISOString())}"><span>${day.format(time)}</span><span>${clock.format(time)} JST</span></time>`;
}
export function offerTable(entries,{showTitle=false}={}){
  return `<table class="offer-table"><thead><tr><th scope="col">店舗</th><th scope="col">価格<span class="offer-unit">税込・送料別</span></th><th scope="col">取得日<span class="offer-unit">日本時間</span></th></tr></thead><tbody>${entries.map(({shop,offer,fresh=false,lowest=false})=>{
    if(!offer)return `<tr><th scope="row">${esc(shop.name)}</th><td><span class="offer-muted">${shop.enabled?'未取得':'取得停止中'}</span></td><td><span class="offer-muted">—</span></td></tr>`;
    const stock=offer.stock==='in'?'在庫あり':offer.stock==='out'?'在庫なし':'在庫未確認';
    return `<tr class="${lowest?'offer-best':''}"><th scope="row">${esc(shop.name)}${showTitle?`<span class="offer-product-name">${esc(offer.title)} ${esc(offer.model)}</span>`:''}</th><td><a class="amount ${fresh?'':'stale'}" href="${esc(offer.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${esc(offer.title)}の商品ページを見る">¥${offer.price.toLocaleString('ja-JP')}</a><span class="offer-status">${stock}${lowest?' · 最安':''}</span>${priceSourceNote(offer)}${fresh?'':'<span class="offer-stale-note">期限切れ・参考価格</span>'}</td><td>${observedTime(offer.observedAt)}${offer.manual?'<span class="offer-status">手動取込</span>':''}</td></tr>`;
  }).join('')}</tbody></table>`;
}
