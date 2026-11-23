import {parseSimDeck,priceDeck} from './deck-price.js';
import {observedTime} from './offer-view.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=n=>n===null?'算出不可':`¥${n.toLocaleString('ja-JP')}`;

export function mountDeck(container,getData){
  container.innerHTML=`<div class="deck-input-panel"><h2>OPTCGSimのデッキから価格を計算</h2><p>OPTCGSimでコピーしたデッキを貼り付けてください。リーダーを含め、入力したカードの枚数分を計算します。</p><label for="deckText">デッキテキスト</label><textarea id="deckText" rows="8" maxlength="16000" spellcheck="false" placeholder="1xOP01-001&#10;4xOP01-016&#10;4xST01-012" aria-describedby="deckFormat"></textarea><p id="deckFormat" class="detail-note">1行ごとに「枚数xカード番号」。作成途中のデッキも計算できます。デッキの構築制限は判定しません。</p><div class="deck-actions"><label>購入先<select id="deckShop"><option value="">全店舗から安い順に組み合わせる</option></select></label><button id="deckCalculate" class="secondary" type="button">デッキ価格を計算</button><button id="deckSample" class="text-button" type="button">サンプル（9枚）</button></div><p class="detail-note">照合済みの日本語通常版・36時間以内の在庫あり価格を使用。税込・送料別です。在庫数がある商品はその枚数まで割り当て、枚数不明は参考計算として表示します。購入時の在庫・購入制限は商品ページでご確認ください。貼り付けた内容は送信せず、保存済み価格だけで計算します。</p></div><p id="deckError" class="error" role="alert" hidden></p><div id="deckResult" aria-live="polite"></div>`;
  const input=container.querySelector('#deckText'),shopSelect=container.querySelector('#deckShop'),result=container.querySelector('#deckResult'),error=container.querySelector('#deckError');
  let parsed=null;
  const calculate=()=>{
    error.hidden=true;
    try{
      const {data,catalog}=getData();if(!data)throw new Error('価格データの読み込み後に、もう一度計算してください。');
      parsed=parseSimDeck(input.value);
      const quote=priceDeck(parsed,data,{shopId:shopSelect.value});
      const name=id=>data.shops.find(s=>s.id===id)?.name||id;
      const shopQuotes=data.shops.map(shop=>({shop,quote:priceDeck(parsed,data,{shopId:shop.id})}));
      shopQuotes.sort((a,b)=>a.quote.missingQuantity-b.quote.missingQuantity||(a.quote.subtotal??Infinity)-(b.quote.subtotal??Infinity));
      result.innerHTML=`<section class="deck-summary" aria-label="計算結果"><div><p>${quote.total!==null?'全枚数の参考合計':'価格が見つかった分の小計'}</p><strong>${yen(quote.subtotal)}</strong><span>${esc(shopSelect.value?name(shopSelect.value):'複数店舗の組み合わせ')}・送料別</span></div><div><p>価格を算出できた枚数</p><strong>${quote.pricedQuantity}<small> / ${quote.quantity} 枚</small></strong><span>${parsed.length}種類${quote.missingQuantity?`・未算出 ${quote.missingQuantity}枚`:''}</span></div></section>${quote.missingQuantity?'<p class="deck-warning">価格未取得や在庫不足のカードがあるため、デッキ全体の合計ではありません。未算出分を0円として扱っていません。</p>':''}${quote.quantityUnconfirmed?'<p class="deck-warning">在庫枚数が不明の商品を含む参考計算です。必要枚数を購入できることは保証されません。</p>':''}<details class="deck-store-comparison"><summary>1店舗で購入する場合の参考価格</summary><div class="deck-store-grid">${shopQuotes.map(({shop,quote:q})=>`<div><strong>${esc(shop.name)}</strong><span>${q.total===null?'算出分の小計':'全枚数の参考合計'}：${yen(q.subtotal)}</span><small>${q.pricedQuantity} / ${q.quantity}枚${q.quantityUnconfirmed?'・在庫枚数未確認を含む':''}</small></div>`).join('')}</div></details><h2 class="deck-breakdown-heading">カード別の内訳</h2>${quote.rows.map(row=>`<article class="comparison-card"><header class="comparison-card-heading"><div><div class="card-number">${esc(row.number)} · ${row.quantity}枚</div><h3 class="deck-card-name">${esc(catalog[row.number]?.name||row.number)}</h3></div><div class="card-price-summary"><span>${row.missingQuantity?'算出分の小計':'カード小計'}</span><strong>${yen(row.subtotal)}</strong></div></header>${row.allocations.length?`<table class="offer-table"><thead><tr><th scope="col">店舗</th><th scope="col">単価 × 枚数<span class="offer-unit">小計</span></th><th scope="col">取得日<span class="offer-unit">日本時間</span></th></tr></thead><tbody>${row.allocations.map(a=>`<tr><th scope="row">${esc(name(a.offer.shopId))}<span class="offer-status">${a.quantityUnconfirmed?'在庫枚数未確認':`取得時在庫 ${a.offer.stockQuantity}枚`}</span></th><td><a href="${esc(a.offer.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${yen(a.offer.price)} × ${a.quantity}枚</a><strong class="deck-line-subtotal">${yen(a.subtotal)}</strong></td><td>${observedTime(a.offer.observedAt)}</td></tr>`).join('')}</tbody></table>`:''}${row.missingQuantity?`<p class="deck-missing">未算出 ${row.missingQuantity}枚：${esc(row.reason)}。</p>`:''}</article>`).join('')}`;
    }catch(e){parsed=null;result.innerHTML='';error.textContent=e.message;error.hidden=false;}
  };
  container.querySelector('#deckCalculate').addEventListener('click',calculate);
  container.querySelector('#deckSample').addEventListener('click',()=>{input.value='1xOP01-001\n4xOP01-016\n4xST01-012';calculate();});
  input.addEventListener('input',()=>{parsed=null;error.hidden=true;result.innerHTML='<p class="detail-note">入力を変更しました。「デッキ価格を計算」で再計算してください。</p>';});
  shopSelect.addEventListener('change',()=>{if(input.value.trim())calculate();});
  return {refresh(){
    const {data}=getData();if(!data)return;
    const selected=shopSelect.value;
    shopSelect.innerHTML='<option value="">全店舗から安い順に組み合わせる</option>'+data.shops.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    shopSelect.value=data.shops.some(s=>s.id===selected)?selected:'';
    if(parsed)calculate();
  }};
}
