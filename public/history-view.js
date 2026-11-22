import {validateHistory,trendsFor} from './history.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>`¥${n.toLocaleString('ja-JP')}`;
const stamp=t=>new Intl.DateTimeFormat('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'}).format(new Date(t));
const palette=['#1261a0','#00866a','#b36b00','#9a48a8','#c14964','#546aa5','#7d6b48','#188390','#6c7516'];
let pending;
export function resetHistoryCache(){pending=null;}
async function load(){if(!pending)pending=fetch('data/history.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw new Error('価格履歴を読み込めませんでした');return validateHistory(await r.json());}).catch(e=>{pending=null;throw e;});return pending;}
export async function mountHistory(container,group,shops,policy,{imported=false}={}){
  container.innerHTML='<h3>価格推移</h3><p class="detail-note">保存済みの履歴を読み込んでいます…</p>';
  try{
    const history=await load();if(!container.isConnected)return;
    const ids=[...new Set(Object.values(history.products).filter(p=>p.key===group.key).map(p=>p.shopId))];
    container.innerHTML=`<div class="history-heading"><h3>店舗別の価格推移</h3><div class="history-controls"><label>期間<select data-history-range><option value="7">7日</option><option value="30" selected>30日</option><option value="90">90日</option><option value="all">全期間</option></select></label><label>ショップ<select data-history-shop><option value="">すべて</option>${shops.filter(s=>ids.includes(s.id)).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label></div></div><p class="detail-note">取得時点の税込販売価格・送料別。グラフはその時点で確認できた店舗ごとの在庫あり最安値です。未取得の過去は補完しません。${imported?'取込JSONの過去履歴は含まれていません。':''}</p><div data-history-chart></div><div data-history-records></div>`;
    const draw=()=>{
      const days=container.querySelector('[data-history-range]').value,now=Date.now();
      const data=trendsFor(history,group.key,{from:days==='all'?-Infinity:now-Number(days)*86400000,to:now,shopId:container.querySelector('[data-history-shop]').value,staleAfterHours:policy.staleAfterHours});
      container.querySelector('[data-history-chart]').innerHTML=chart(data,shops);
      container.querySelector('[data-history-records]').innerHTML=`<details class="history-records"><summary>取得履歴 ${data.records.length}件（在庫なし・不明も含む）</summary><div class="audit-scroll"><table class="audit-table"><thead><tr><th>確認日時 JST</th><th>ショップ</th><th>価格</th><th>在庫</th></tr></thead><tbody>${data.records.map(r=>`<tr><td>${stamp(r.time)}</td><td>${esc(shops.find(s=>s.id===r.shopId)?.name||r.shopId)}</td><td>${money(r.price)}</td><td>${r.stock==='in'?'あり':r.stock==='out'?'なし':'不明'}</td></tr>`).join('')}</tbody></table></div></details>`;
    };
    container.querySelectorAll('select').forEach(s=>s.addEventListener('change',draw));draw();
  }catch(e){if(container.isConnected)container.innerHTML=`<h3>価格推移</h3><p class="detail-note">${esc(e.message)}。保存データの再読込をお試しください。</p>`;}
}
function chart(data,shops){
  const values=data.series.flatMap(l=>l.points.filter(p=>p.price!==null));
  if(!values.length)return '<div class="history-empty">この期間の在庫あり価格の履歴はありません。</div>';
  const allTimes=data.series.flatMap(l=>l.points.map(p=>p.time));
  let xmin=Math.min(...allTimes),xmax=Math.max(...allTimes),ymin=Math.min(...values.map(p=>p.price)),ymax=Math.max(...values.map(p=>p.price));
  const single=xmin===xmax;if(single){xmin-=3600000;xmax+=3600000;}
  const pad=Math.max(10,(ymax-ymin)*.15);ymin=Math.max(0,ymin-pad);ymax+=pad;
  const x=t=>70+(t-xmin)/(xmax-xmin)*600,y=p=>210-(p-ymin)/(ymax-ymin)*180;
  let svg='<svg class="history-chart" viewBox="0 0 700 270" role="img" aria-label="店舗別の取得時点の在庫あり最安値の推移">';
  for(let i=0;i<=3;i++){const price=ymin+(ymax-ymin)*i/3,Y=y(price);svg+=`<line x1="70" x2="670" y1="${Y}" y2="${Y}" stroke="#dce4eb"/><text x="62" y="${Y+4}" text-anchor="end">${money(Math.round(price))}</text>`;}
  for(const t of single?[values[0].time]:[xmin,(xmin+xmax)/2,xmax])svg+=`<text x="${x(t)}" y="240" text-anchor="middle">${stamp(t)}</text>`;
  const legends=[];
  for(const line of data.series){
    const index=shops.findIndex(s=>s.id===line.shopId),color=palette[(Math.max(0,index))%palette.length],name=shops[index]?.name||line.shopId;
    let d='',previous=null;
    for(const p of line.points){
      if(p.price===null){previous=null;continue;}
      const cmd=previous&&p.time-previous.time<=data.ttl?'L':'M';d+=`${cmd}${x(p.time).toFixed(2)},${y(p.price).toFixed(2)} `;previous=p;
    }
    svg+=`<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>`;
    for(const p of line.points.filter(p=>p.price!==null))svg+=`<circle cx="${x(p.time)}" cy="${y(p.price)}" r="4" fill="${color}" stroke="white" stroke-width="1.5"><title>${esc(name)} ${stamp(p.time)} ${money(p.price)}</title></circle>`;
    legends.push(`<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="${color}"/></svg>${esc(name)}</span>`);
  }
  svg+='</svg>';
  return `<p class="history-count">${values.length}点の在庫あり記録${values.length===1?' · 2回目の取得から線で表示します':''}</p>${svg}<div class="history-legend">${legends.join('')}</div><p class="detail-note">点が実際の取得時刻です。線は記録の間を結んだもので、その間の価格を保証しません。在庫切れや長い未取得期間では線をつなぎません。</p>`;
}
