import {cardLookup} from './shop-search.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function shopLinks(shops,number){
  return `<details class="shop-search-links"><summary>各店舗で ${esc(number)} を探す</summary><p class="detail-note">リンクを開くと店舗サイトへ移動します。自動取得が停止中の店舗も手動で確認できます。</p><div>${shops.map(s=>{
    const lookup=cardLookup(s,number);
    return `<a href="${esc(lookup?.url||s.origin)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(s.name)}<small>${lookup?.label||'店舗トップ'}${s.enabled?'':'・自動取得停止中'}</small></a>`;
  }).join('')}</div></details>`;
}
