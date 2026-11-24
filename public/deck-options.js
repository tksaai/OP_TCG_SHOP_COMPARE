import {isFresh} from './compare.js';
import {observedTime,priceSourceNote} from './offer-view.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderDeckOptions(row,data,{open=false,now=Date.now()}={}){
  const offers=[...new Map(data.offers.filter(o=>o.number===row.number).map(o=>[o.id,o])).values()];
  offers.sort((a,b)=>(a.stock==='in'?0:1)-(b.stock==='in'?0:1)||a.price-b.price||a.id.localeCompare(b.id));
  if(!offers.length)return '<p class="detail-note deck-option-note">この型番の他の掲載商品も未取得です。</p>';
  const shopName=id=>data.shops.find(s=>s.id===id)?.name||id;
  return `<details class="deck-options" data-options-for="${esc(row.number)}" ${open||row.selectedOfferId||row.missingQuantity?'open':''}><summary>他の掲載商品から選ぶ（${offers.length}件）</summary><p class="detail-note">通常版が未掲載の場合などに、使用する商品を1つ選べます。選択した商品・店舗で計算し、在庫数を超える分は未算出になります。パラレル・状態・言語は商品名とリンク先をご確認ください。選択はこの画面内だけに保持します。</p><label class="deck-offer-choice"><input type="radio" name="deck-offer-${esc(row.number)}" data-deck-number="${esc(row.number)}" value="" ${row.selectedOfferId?'':'checked'}><span><strong>通常版から自動選択</strong><span>購入先の設定に従って、通常版の価格を比較します。</span></span></label>${offers.map(o=>{
    const fresh=isFresh(o,data.policy,now),selectable=fresh&&['in','out'].includes(o.stock);
    const stock=o.stock==='out'?'売り切れ・参考価格のみ':o.stock==='in'?(Number.isSafeInteger(o.stockQuantity)?`在庫 ${o.stockQuantity}枚`:'在庫あり・枚数未確認'):'在庫未確認・選択不可';
    return `<div class="deck-offer-option"><label class="deck-offer-choice"><input type="radio" name="deck-offer-${esc(row.number)}" data-deck-number="${esc(row.number)}" value="${esc(o.id)}" ${row.selectedOfferId===o.id?'checked':''} ${selectable?'':'disabled'}><span><strong>${esc(shopName(o.shopId))} · ¥${o.price.toLocaleString('ja-JP')}</strong><span>${esc(o.title)}</span><span>${stock}${fresh?'':'・期限切れのため選択不可'}</span>${priceSourceNote(o)}</span></label><div class="deck-offer-meta">${observedTime(o.observedAt)}<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">商品を見る</a></div></div>`;
  }).join('')}</details>`;
}
