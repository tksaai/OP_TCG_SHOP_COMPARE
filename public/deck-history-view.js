import {loadHistory,historyChart} from './history-view.js';
import {deckTrend,historySelections} from './deck-history.js';
import {observedTime} from './offer-view.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n===null?'算出不可':`¥${n.toLocaleString('ja-JP')}`;

export function deckHistoryRecords(data){
  return `<details class="history-records"><summary>参考合計の算出履歴 ${data.records.length}件</summary><div class="audit-scroll"><table class="audit-table"><thead><tr><th scope="col">算出時点（日本時間）</th><th scope="col">参考合計</th><th scope="col">価格を確認できた枚数</th></tr></thead><tbody>${data.records.map(r=>`<tr><th scope="row">${observedTime(r.time)}</th><td>${money(r.price)}${r.price===null&&r.subtotal!==null?`<small>確認できた分のみ：${money(r.subtotal)}</small>`:''}</td><td>${r.pricedQuantity} / ${data.quantity} 枚${r.missing.length?`<small>履歴不足・在庫なし：${r.missing.map(esc).join('、')}</small>`:''}</td></tr>`).join('')}</tbody></table></div></details>`;
}

export async function mountDeckHistory(container,entries,snapshot,{shopId='',selectedOffers={},imported=false}={}){
  container.innerHTML='<p class="detail-note">保存済みの履歴を読み込んでいます…</p>';
  const selectedProducts=historySelections(snapshot,selectedOffers);
  try{
    const history=await loadHistory();if(!container.isConnected)return;
    container.innerHTML=`<div class="history-controls"><label>期間<select data-history-range><option value="7">7日</option><option value="30" selected>30日</option><option value="90">90日</option><option value="all">全期間</option></select></label><label>購入先<select data-history-shop><option value="">全店舗の最安単価を組み合わせる</option>${snapshot.shops.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label></div><p class="detail-note">入力中のデッキ ${entries.reduce((n,e)=>n+e.quantity,0)}枚について、各時点で36時間以内に取得した在庫あり最安単価 × 必要枚数の参考合計です。過去の在庫枚数は保存していないため、全枚数を購入できる見積もりではありません。現在の在庫枚数確認済み商品の絞り込みは適用しません。税込・送料別。</p><p class="detail-note">${Object.keys(selectedProducts).length?'手動選択したカードは、その商品・店舗の履歴だけを使います。':'自動選択は日本語通常版のみです。'} 売り切れ参考価格は含めません。全種類の有効な履歴が揃わない時点は算出不可とし、未取得分を0円や現在の価格で補完しません。${imported?'取込JSONの過去履歴は含みません。配信済みの履歴だけを使います。':''}</p><div data-history-chart></div><div data-history-records></div>`;
    const shop=container.querySelector('[data-history-shop]');shop.value=snapshot.shops.some(s=>s.id===shopId)?shopId:'';
    const draw=()=>{
      const days=container.querySelector('[data-history-range]').value,now=Date.now();
      const data=deckTrend(history,entries,{from:days==='all'?-Infinity:now-Number(days)*86400000,to:now,shopId:shop.value,selectedProducts});
      container.querySelector('[data-history-chart]').innerHTML=historyChart(data,[{id:'deck',name:'デッキ参考合計'}],{
        label:'デッキの単価と必要枚数から算出した参考合計の推移',
        empty:'この期間に全種類の有効な在庫あり履歴が揃う時点はありません。カード別の「価格推移」では、取得できた履歴を確認できます。',
        countLabel:'点の参考合計',
        note:'点はカード価格の取得を反映して合計を算出した時刻です。各カードの取得時刻は異なります。線は記録を結んだもので、その間の価格を保証しません。履歴不足・在庫切れ・期限切れでは線をつなぎません。'
      });
      container.querySelector('[data-history-records]').innerHTML=deckHistoryRecords(data);
    };
    container.querySelectorAll('select').forEach(s=>s.addEventListener('change',draw));draw();
  }catch(e){if(container.isConnected)container.innerHTML=`<p class="detail-note">${esc(e.message)}。保存データの再読込をお試しください。</p>`;}
}
