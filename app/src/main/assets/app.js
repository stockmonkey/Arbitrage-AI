/* ArbitrageAI local frontend. Synthetic scanner data and live reference prices
   are intentionally NEVER combined. No trade submission client exists. */
'use strict';
const $ = id => document.getElementById(id);
let state = null, currentView = 'overview', marketFilter = 'All', riskInitialized = false;
let chartLoaded = false, toastTimer, profileInitialized = false, accountFormDigest = '', newsDigest = '', newsLoaded = false;

const ICONS = {
 sparkle:'<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 chart:'<path d="M3 3v18h18"/><path d="M7 16v-5m5 5V7m5 9V4"/>',
 zap:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
 wallet:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M7 6V4a1 1 0 0 1 1-1h10"/>',
 trending:'<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
 shield:'<path d="m12 22-1-.5C5 18 4 14 4 9V5l8-3 8 3v4c0 5-1 9-7 12.5L12 22Z"/><path d="m9 12 2 2 4-4"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.5 1.2-2 3.4-1.9-.7a9 9 0 0 1-2 1.2L14.8 22H9.2l-.3-1.8a9 9 0 0 1-2-1.2l-1.9.7-2-3.4 1.5-1.2a9 9 0 0 1 0-2.3L3 11.5l2-3.4 1.9.7a9 9 0 0 1 2-1.2L9.2 6h5.6l.3 1.8a9 9 0 0 1 2 1.2l1.9-.7 2 3.4-1.5 1.2a9 9 0 0 1 0 2.3Z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<path d="m5 12 5 5L20 7"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 alert:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
};
function icon(name) { return `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.info}</svg>`; }
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
function safe(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(n){return '$'+Number(n || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function num(n,d=2){return Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});}
function px(n){return num(n, n >= 10 ? 2 : 5);}
function ago(seconds){let m=Math.floor(seconds/60),s=seconds%60;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+':'+String(s).padStart(2,'0');}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('shown');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('shown'),4000);}
async function api(path, payload){let opts={cache:'no-store'};if(payload !== undefined){opts.method='POST';opts.headers={'Content-Type':'application/json'};opts.body=JSON.stringify(payload);}let res=await fetch(path,opts);let data=await res.json();if(!res.ok)throw Error(data.error||'Local server error');return data;}
function displayError(msg){const box=$('error-banner');box.textContent=msg;box.hidden=!msg;}
function setView(name){if(!$("view-"+name))return;currentView=name;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+name));document.querySelectorAll('.nav-button').forEach(el=>el.classList.toggle('selected',el.dataset.view===name));let titles={overview:'Good '+daypart()+'.',markets:'Markets',opportunities:'Opportunities',paper:'Paper activity',performance:'Performance',risk:'Risk controls',settings:'Settings',accounts:'Virtual accounts',analyst:'AI Analyst'};let subtitles={overview:'Your local arbitrage agent is monitoring simulated markets.',markets:'Track simulated venue quotes and provider reference prices.',opportunities:'Synthetic price discrepancies, filtered through risk checks.',paper:'Review signals and agent events with no real orders.',performance:'Measure Python calculation speed and modeled outcomes.',risk:'Configure independent thresholds for the paper detector.',settings:'Configure optional feeds and local preferences.',accounts:'Control the virtual balances used in paper simulations.',analyst:'Event-aware research with risk-aware scenario analysis.'};$('page-title').textContent=titles[name];$('page-subtitle').textContent=subtitles[name];if(state)render(state);if(name==='analyst'&&!newsLoaded)refreshNews();window.scrollTo({top:0,behavior:'instant'});}
function daypart(){let h=new Date().getHours();return h<12?'morning':h<18?'afternoon':'evening';}
function drawPnl(history){const chart=$('pnl-chart');const pts=history.length>1?history:[0,0];const w=760,h=230,p=12;let min=Math.min(...pts,0),max=Math.max(...pts,0);let span=Math.max(.05,max-min);max+=span*.14;min-=span*.07;function point(v,i){return [p+(i/(pts.length-1))*(w-p*2),h-p-(v-min)/(max-min)*(h-p*2)];}let pairs=pts.map(point);let d=pairs.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');let area=d+` L ${(w-p).toFixed(1)} ${h-p} L ${p} ${h-p} Z`;let grids=[.1,.35,.6,.85].map(f=>`<line x1="0" x2="760" y1="${h*f}" y2="${h*f}" stroke="#edf2ed" stroke-width="1"/>`).join('');chart.innerHTML=`<defs><linearGradient id="softGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21aa65" stop-opacity=".16"/><stop offset="1" stop-color="#21aa65" stop-opacity=".00"/></linearGradient></defs>${grids}<path d="${area}" fill="url(#softGreen)"/><path d="${d}" stroke="#169d59" stroke-width="2.7" fill="none" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${pairs[pairs.length-1][0]}" cy="${pairs[pairs.length-1][1]}" r="4" fill="#158e52"/>`;}
function drawBars(bars){let max=Math.max(1,...bars.map(x=>x.detected));$('activity-bars').innerHTML=bars.length?bars.map(b=>`<div class="bar-set" title="${safe(b.label)}: ${b.detected} detections, ${b.signals} signals"><span class="bar" style="height:${Math.max(2,100*b.detected/max)}%"></span><span class="bar signal" style="height:${Math.max(2,100*b.signals/max)}%"></span></div>`).join(''):'<div class="chart-help">Waiting for simulated scans</div>';}
function statusPill(status){return status==='Paper signal'?'<span class="pill pill-paper">Paper signal</span>':'<span class="pill pill-detected">Detected</span>';}
function opportunityRow(c,small){if(small)return `<tr><td><strong>${safe(c.symbol)}</strong></td><td>${safe(c.buy_venue)} → ${safe(c.sell_venue)}</td><td class="positive">+${num(c.net_bps,2)} bps</td><td>${statusPill(c.status)}</td></tr>`;return `<tr><td>${safe(c.at)}</td><td><strong>${safe(c.symbol)}</strong></td><td>${safe(c.asset_class)}</td><td>${px(c.buy_ask)}</td><td>${px(c.sell_bid)}</td><td class="positive">+${num(c.net_bps,2)} bps</td><td class="positive">${money(c.estimated_usd)}</td><td>${statusPill(c.status)}</td></tr>`;}
function emptyRow(cols,text){return `<tr><td colspan="${cols}" style="text-align:center;padding:29px;color:#94a198">${safe(text)}</td></tr>`;}
function activityRow(evt){const t=new Date(evt.at);const time=Number.isNaN(t.getTime())?'':t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});const klass=evt.kind==='signal'?'':evt.kind==='risk'?' danger':' other';const symbol=evt.kind==='signal'?'trending':evt.kind==='risk'?'alert':'info';return `<div class="activity-item"><span class="activity-icon${klass}">${icon(symbol)}</span><span class="activity-time">${safe(time)}</span><span class="activity-message">${safe(evt.message)}</span><span class="activity-extra">${evt.estimated_usd!==undefined?'+'+money(evt.estimated_usd):safe(evt.route||'')}</span></div>`;}
function groupedMarkets(quotes,filter,limit){const map=new Map();for(const q of quotes){if(filter!=='All'&&q.asset_class!==filter)continue;if(!map.has(q.symbol))map.set(q.symbol,{symbol:q.symbol,name:q.name||q.symbol,asset_class:q.asset_class,venues:[]});map.get(q.symbol).venues.push(q);}return [...map.values()].slice(0,limit).map(q=>`<tr><td><strong>${safe(q.symbol)}</strong><div class="instrument-name">${safe(q.name)}</div></td><td>${safe(q.asset_class)}</td>${[0,1,2].map(i=>`<td>${q.venues[i]?`${safe(q.venues[i].venue)}: ${px(q.venues[i].bid)} / ${px(q.venues[i].ask)}`:'—'}</td>`).join('')}<td><span class="pill pill-sim">Synthetic</span></td></tr>`).join('');}
// Independent local watchlist; Google Finance is a user-initiated research link, not a quote API.
const WATCH_KEY='arbitrageai_market_watchlist_v1';
let watched=new Set();
try {const stored=JSON.parse(localStorage.getItem(WATCH_KEY)||'[]');if(Array.isArray(stored))watched=new Set(stored.filter(x=>typeof x==='string').slice(0,200));}catch(_e){}
function marketCatalog(quotes){const map=new Map();for(const q of quotes||[]){if(!map.has(q.symbol))map.set(q.symbol,{symbol:q.symbol,name:q.name||q.symbol,type:q.asset_class,venues:new Set(),quotes:[]});map.get(q.symbol).venues.add(q.venue);map.get(q.symbol).quotes.push(q);}return [...map.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.symbol.localeCompare(b.symbol));}
function financeUrl(item){const sym=item.symbol.replace('/','');const q=item.type==='Forex'?item.symbol:item.symbol;return 'https://www.google.com/finance/search?q='+encodeURIComponent(q);}
function instrumentCard(item){const yes=watched.has(item.symbol);return `<div class="instrument-card"><div class="instrument-detail"><strong>${safe(item.symbol)}</strong><span>${safe(item.name)}</span><small>${safe(item.type)} · ${item.venues.size} simulated venues</small><div class="venue-quote-list">${item.quotes.map(q=>`<span><b>${safe(q.venue)}</b> ${px(q.bid)} / ${px(q.ask)}</span>`).join('')}</div></div><div class="instrument-actions"><button type="button" class="watch-toggle" data-watch="${safe(item.symbol)}" aria-pressed="${yes}" aria-label="${yes?'Remove':'Add'} ${safe(item.symbol)} ${yes?'from':'to'} watchlist">${yes?'★ Saved':'☆ Watch'}</button><a class="finance-link" href="${safe(financeUrl(item))}" target="_blank" rel="noopener noreferrer" aria-label="Research ${safe(item.symbol)} on Google Finance">Google Finance ↗</a></div></div>`;}
function renderMarketDirectory(quotes){const catalog=marketCatalog(quotes);const term=($('instrument-search')?.value||'').trim().toLowerCase();const filtered=catalog.filter(x=>(marketFilter==='All'||x.type===marketFilter)&&(x.symbol+' '+x.name+' '+x.type).toLowerCase().includes(term));$('instrument-directory').innerHTML=filtered.map(instrumentCard).join('')||'<p class="empty-explain">No matching instruments.</p>';$('my-watchlist').innerHTML=catalog.filter(x=>watched.has(x.symbol)).map(instrumentCard).join('')||'<p class="empty-explain">No favorites yet. Tap ☆ Watch next to an instrument.</p>';$('watchlist-count').textContent=watched.size+' saved';if($('ai-watchlist-summary'))$('ai-watchlist-summary').textContent=[...watched].join(', ')||'None yet';const venues=new Map();for(const q of quotes||[]){if(!venues.has(q.venue))venues.set(q.venue,{name:q.venue,count:0,classes:new Set()});const v=venues.get(q.venue);v.count++;v.classes.add(q.asset_class);} $('broker-directory').innerHTML=[...venues.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(v=>`<div class="instrument-card"><div class="instrument-detail"><strong>${safe(v.name)}</strong><span>${[...v.classes].map(safe).join(' / ')} · ${v.count} instrument quotes</span><small>Simulated only · no broker account connected</small></div></div>`).join('');}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-watch]');if(!btn)return;const symbol=btn.dataset.watch;if(watched.has(symbol))watched.delete(symbol);else watched.add(symbol);try{localStorage.setItem(WATCH_KEY,JSON.stringify([...watched]));}catch(_e){toast('Watchlist could not be saved on this device.');}if(state)renderMarketDirectory(state.quotes);});
$('instrument-search')?.addEventListener('input',()=>{if(state)renderMarketDirectory(state.quotes);});
$('watchlist-clear')?.addEventListener('click',()=>{watched.clear();try{localStorage.setItem(WATCH_KEY,'[]');}catch(_e){}if(state)renderMarketDirectory(state.quotes);});
$('ai-watchlist-prompt')?.addEventListener('click',()=>{const symbols=[...watched];$('analyst-question').value=symbols.length?'Analyze these watchlist instruments: '+symbols.join(', ')+'. Discuss exposure, plausible macro risks, correlations, and hedging hypotheses. Do not claim live Google Finance prices or current news without retrieved evidence.':'Explain how to build a diversified Forex and equities watchlist, including market risks.';$('analyst-question').focus();});
function render(s){state=s;const st=s.stats;const dot=$('agent-dot');dot.className='status-dot'+(s.kill_switch?' danger':!s.running?' off':'');$('agent-label').textContent=s.kill_switch?'Kill switch engaged':s.running?'Agent running':'Agent paused';$('side-symbols').textContent=st.symbols;$('side-uptime').textContent=ago(st.uptime_seconds);
$('action-toggle').textContent=s.running?'Pause agent':'Resume agent';$('action-toggle').disabled=s.kill_switch;
$('m-pnl').textContent=money((s.virtual.accounts.find(a=>a.id===s.virtual.active_id)||{paper_pnl:0}).paper_pnl);$('overview-account-name').textContent=(s.virtual.accounts.find(a=>a.id===s.virtual.active_id)||{name:'No account'}).name;$('chart-total').textContent=money(st.modeled_pnl_usd);$('m-detected').textContent=num(st.detected,0);$('m-signals').textContent=num(st.paper_signals,0);$('m-latency').textContent=num(st.median_calc_ms,4)+' ms';
$('p-median').textContent=num(st.median_calc_ms,4)+' ms';$('p-p95').textContent=num(st.p95_calc_ms,4)+' ms';$('p-total').textContent=money(st.modeled_pnl_usd);$('p-signals').textContent=String(st.paper_signals);
drawPnl(s.history);drawBars(s.bars);
$('overview-opportunities').innerHTML=s.opportunities.length?s.opportunities.slice(0,5).map(x=>opportunityRow(x,true)).join(''):emptyRow(4,'No matching synthetic quotes yet');
$('all-opportunities').innerHTML=s.opportunities.length?s.opportunities.map(x=>opportunityRow(x,false)).join(''):emptyRow(8,'No candidates found at current risk thresholds');
$('overview-activity').innerHTML=s.activity.length?s.activity.slice(0,5).map(activityRow).join(''):'<p class="panel-subtitle">Scanning…</p>';
$('full-activity').innerHTML=s.activity.length?s.activity.map(activityRow).join(''):'<p class="panel-subtitle">No session events</p>';
$('overview-markets').innerHTML=groupedMarkets(s.quotes,'All',6);
renderMarketDirectory(s.quotes);
$('risk-state').innerHTML=`<span class="status-dot${s.kill_switch?' danger':''}"></span>${s.kill_switch?'Trading stopped by kill switch':'No real trading; simulation '+(s.running?'active':'paused')}`;
$('kill-button').hidden=s.kill_switch;$('clear-kill-button').hidden=!s.kill_switch;
renderVirtual(s.virtual);renderResearch(s.research,s.virtual);renderTVAlerts(s.tradingview_alerts);
if(!riskInitialized){for(let [k,v] of Object.entries(s.risk)){const el=document.querySelector(`#risk-form [name="${k}"]`);if(el)el.value=v;}riskInitialized=true;}
if(!profileInitialized){for(let [k,v] of Object.entries(s.virtual.profile)){const el=document.querySelector(`#profile-form [name="${k}"]`);if(el)el.value=String(v);}profileInitialized=true;}
$('key-status').textContent=s.live.has_api_key?'Key stored':'Not connected';$('key-status').classList.toggle('on',s.live.has_api_key);
const latest=s.live.prices||[];$('live-prices').innerHTML=latest.length?latest.map(q=>`<tr><td><strong>${safe(q.symbol)}</strong></td><td>${px(q.price)}</td><td>${safe(q.source)}</td><td>${new Date(q.fetched_at*1000).toLocaleTimeString()}</td><td>Reference only</td></tr>`).join(''):emptyRow(5,'No provider prices loaded');
if(s.live.last_refreshed){$('live-message').textContent=`Latest manual refresh: ${new Date(s.live.last_refreshed*1000).toLocaleString()}. Data timing depends on the selected provider and subscription.${s.live.errors.length?' Some requests failed: '+s.live.errors.join('; '):''}`;}
else $('live-message').textContent=s.live.has_api_key?'API key configured. Click “Refresh provider prices” to request the latest available references.':'Add an Alpha Vantage or Twelve Data key in Settings to load reference prices.';
$('refresh-live').disabled=!s.live.has_api_key || s.live.wait_seconds>0;$('refresh-live').textContent=s.live.wait_seconds>0?`Refresh in ${s.live.wait_seconds}s`:'Refresh provider prices';
}
async function update(){try{const s=await api('/api/state');displayError('');render(s);}catch(e){displayError('Could not load the on-device simulator: '+e.message);}}
async function perform(action){try{await api('/api/action',{action});await update();toast(action==='kill'?'Kill switch engaged':action==='reset'?'Session counters reset':action==='clear_kill'?'Kill switch cleared':'Agent '+(action==='start'?'running':'paused'));}catch(e){toast(e.message);}}
function startChart(){
 const container=$('tv-container');
 container.innerHTML='<div style="padding:24px;text-align:center"><strong>TradingView chart</strong><p class="small-paragraph">Opens TradingView in your phone browser. TradingView widget prices are not available to the arbitrage scanner.</p><a href="https://www.tradingview.com/symbols/EURUSD/" target="_blank" rel="noopener noreferrer" class="btn btn-black">Open EUR/USD on TradingView ↗</a></div>';
 $('load-chart').textContent='Chart ready';$('load-chart').disabled=true;
}

document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));
document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.go)));
document.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('click',()=>{marketFilter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===el));if(state)render(state);}));
$('action-toggle').addEventListener('click',()=>state&&perform(state.running?'pause':'start'));
$('reset-button').addEventListener('click',()=>{if(confirm('Reset simulated session totals? Accounts remain unchanged.'))perform('reset');});
$('kill-button').addEventListener('click',()=>perform('kill'));
$('clear-kill-button').addEventListener('click',()=>perform('clear_kill'));
$('load-chart').addEventListener('click',startChart);
$('risk-form').addEventListener('submit',async e=>{e.preventDefault();const obj={};for(const el of e.target.querySelectorAll('input[name]'))obj[el.name]=Number(el.value);try{await api('/api/risk',{risk:obj});$('risk-feedback').textContent='Saved locally';toast('Risk controls saved');await update();}catch(err){$('risk-feedback').textContent=err.message;}});
$('key-form').addEventListener('submit',async e=>{e.preventDefault();const val=$('api-key').value.trim();if(!val){toast('Enter an API key first');return;}try{await api('/api/key',{key:val,provider:$('key-provider').value});$('api-key').value='';$('key-feedback').textContent='Key saved locally with user-only permissions';toast('Reference feed key stored');await update();}catch(err){$('key-feedback').textContent=err.message;}});
$('clear-key').addEventListener('click',async()=>{if(!confirm('Remove the selected provider key?'))return;try{await api('/api/key',{action:'clear',provider:$('key-provider').value});toast('Selected provider key removed');$('key-feedback').textContent='Key removed';await update();}catch(err){toast(err.message);}});
async function refreshProviderPrices(silent=false){
 const button=$('refresh-live');button.disabled=true;button.textContent='Requesting prices…';
 try {const result=await api('/api/live/refresh',{});await update();if(!silent)toast(result.live.errors.length?'Some provider requests failed; see Markets.':'Provider prices refreshed. Reference data only.');}
 catch(err){toast(err.message);await update();}
}
$('refresh-live').addEventListener('click',()=>refreshProviderPrices());
// Voluntary one-minute polling. Disabled by default to avoid surprise API charges.
setInterval(()=>{if($('auto-live').checked && state && state.live.has_api_key && state.live.wait_seconds===0)refreshProviderPrices(true);},60000);

function accountRows(v){return v.accounts.map(a=>`<div class="account-row${a.id===v.active_id?' active-account':''}" data-account="${safe(a.id)}">
 <span class="account-avatar">${safe(a.name.slice(0,1).toUpperCase())}</span><div class="account-main"><div class="account-row-head"><strong>${safe(a.name)}</strong>${a.id===v.active_id?'<span class="pill pill-paper">Active</span>':''}</div><span class="account-meta">Starting ${money(a.starting_balance)} · Model P&amp;L ${money(a.paper_pnl)} · Equity ${money(a.equity)}</span><div class="account-edit-line"><label>Account name<input class="account-name" maxlength="48" value="${safe(a.name)}"></label><label>Starting USD<input class="account-balance" type="number" min="0" max="1000000000" step="0.01" value="${a.starting_balance}"></label><button class="btn btn-outline" data-account-save="${safe(a.id)}">Save balance</button>${a.id!==v.active_id?`<button class="btn btn-outline" data-account-select="${safe(a.id)}">Set active</button>`:''}<button class="subtle-link" data-account-reset="${safe(a.id)}">Reset P&amp;L</button>${v.accounts.length>1?`<button class="subtle-link account-remove" data-account-delete="${safe(a.id)}">Remove</button>`:''}</div></div>
 </div>`).join('');}
function renderVirtual(v){
 const active=v.accounts.find(a=>a.id===v.active_id); if(!active)return;
 $('accounts-starting').textContent=money(v.accounts.reduce((sum,a)=>sum+a.starting_balance,0));
 $('accounts-equity').textContent=money(active.equity);
 $('accounts-cap').textContent=money(Math.max(0,active.equity)*v.profile.max_allocation_pct/100);
 // Avoid resetting edited input values every scan; refresh only when identity or starting balance changes.
 const digest=JSON.stringify(v.accounts.map(a=>[a.id,a.name,a.starting_balance,a.paper_pnl,v.active_id]));
 if(accountFormDigest!==digest){
    const editing=document.activeElement?.closest?.('.account-list');
    if(!editing){$('account-list').innerHTML=accountRows(v);$('settings-account-list').innerHTML=accountRows(v);accountFormDigest=digest;}
 }
}
function renderResearch(r,v){
 const a=v.accounts.find(x=>x.id===v.active_id);if(!a)return;
 $('analyst-profile-summary').innerHTML=`<div class="risk-summary-line"><span>Active portfolio</span><strong>${safe(a.name)}</strong></div><div class="risk-summary-line"><span>Risk tolerance</span><strong>${num(v.profile.risk_tolerance,0)} / 5</strong></div><div class="risk-summary-line"><span>Max tolerable drawdown</span><strong>${num(v.profile.max_drawdown_pct,1)}%</strong></div><div class="risk-summary-line"><span>Time horizon</span><strong>${num(v.profile.horizon_days,0)} days</strong></div><div class="risk-summary-line"><span>Paper allocation limit</span><strong>${num(v.profile.max_allocation_pct,1)}%</strong></div><div class="risk-summary-line"><span>Leverage preference</span><strong>${v.profile.leverage_allowed?'Yes':'No'}</strong></div>`;
 const digest=JSON.stringify([r.stories,r.last_checked,r.errors]);
 if(newsDigest!==digest){
  $('news-list').innerHTML=r.stories.length?r.stories.slice(0,12).map(x=>`<div class="news-item"><div class="news-meta">${safe(x.source)} · ${new Date(x.published_at).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div><a href="${safe(x.url)}" target="_blank" rel="noopener noreferrer">${safe(x.headline)}</a><div class="news-tags">${x.topics.length?x.topics.map(t=>`<span>${safe(t)}</span>`).join(''):'<span>Unclassified headline</span>'}</div></div>`).join(''):'<p class="empty-explain">No verified recent articles loaded. Click Refresh; feed failure or no matching dates may explain the empty list.</p>';
  const when=r.last_checked?new Date(r.last_checked).toLocaleString():'Never';
  $('news-status').textContent='Checked: '+when+'. '+r.stories.length+' headlines within 72h. '+(r.errors.length?'Source errors: '+r.errors.join('; '):'Topic tags are keyword-based, not confirmed market significance.');
  newsDigest=digest;
 }
 $('news-refresh').disabled=r.refresh_wait_seconds>0;
}
function renderTVAlerts(alerts){$('tv-alert-list').innerHTML=alerts?.length?alerts.map(a=>`<div class="tv-alert-line"><strong>${safe(a.title)}</strong><span>${safe(a.symbol)} · ${safe(a.direction)} · imported ${new Date(a.received_at*1000).toLocaleTimeString()}</span></div>`).join(''):'<p class="panel-disclaimer">No imported TradingView alerts. Alerts are kept in memory for this session and are never automatically traded.</p>';}
async function refreshNews(){
 const b=$('news-refresh');b.disabled=true;b.textContent='Checking…';
 try {await api('/api/news/refresh',{});newsLoaded=true;await update();toast('News check completed. Examine timestamps and sources.');}
 catch(e){toast('News refresh: '+e.message);}
 finally{b.textContent='Refresh';}
}
$('news-refresh').addEventListener('click',refreshNews);
$('account-create-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/accounts',{operation:'create',name:$('new-account-name').value,balance:Number($('new-account-balance').value)});$('new-account-name').value='';await update();toast('Virtual account created');}catch(err){toast(err.message);}});
async function onAccountClick(e){
 const b=e.target.closest('[data-account-save],[data-account-select],[data-account-delete],[data-account-reset]');if(!b)return;
 const row=b.closest('[data-account]');const id=row?.dataset.account;
 if(!id)return;
 let payload={id};
 if(b.hasAttribute('data-account-save'))payload={...payload,operation:'edit',name:row.querySelector('.account-name').value,balance:Number(row.querySelector('.account-balance').value)};
 if(b.hasAttribute('data-account-select'))payload.operation='select';
 if(b.hasAttribute('data-account-reset')){if(!confirm('Reset modeled paper P&L for this virtual account?'))return;payload.operation='reset_pnl';}
 if(b.hasAttribute('data-account-delete')){if(!confirm('Delete this virtual portfolio and its modeled paper P&L? This cannot be undone.'))return;payload.operation='delete';}
 try{await api('/api/accounts',payload);b.blur();accountFormDigest='';await update();toast('Virtual account updated');}catch(err){toast(err.message);}
}
$('account-list').addEventListener('click',onAccountClick);$('settings-account-list').addEventListener('click',onAccountClick);
$('profile-form').addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(e.target);const profile={risk_tolerance:Number(form.get('risk_tolerance')),max_drawdown_pct:Number(form.get('max_drawdown_pct')),max_allocation_pct:Number(form.get('max_allocation_pct')),horizon_days:Number(form.get('horizon_days')),leverage_allowed:form.get('leverage_allowed')==='true',focus:form.get('focus')};try{await api('/api/profile',{profile});$('profile-feedback').textContent='Saved';await update();toast('Risk profile saved');}catch(err){$('profile-feedback').textContent=err.message;}});
$('tv-alert-form').addEventListener('submit',async e=>{e.preventDefault();let raw=$('tv-alert-text').value.trim();let obj;try{if(raw.startsWith('{')){obj=JSON.parse(raw);obj={title:String(obj.title||obj.message||'TradingView alert'),symbol:String(obj.symbol||obj.ticker||''),direction:String(obj.direction||'')};}else obj={title:raw,symbol:'',direction:''};await api('/api/tv/import',obj);$('tv-alert-text').value='';await update();toast('Alert imported for research — not trading');}catch(err){toast('Import failed: '+err.message);}});
for(const b of document.querySelectorAll('[data-prompt]'))b.addEventListener('click',()=>{$('analyst-question').value=b.dataset.prompt;$('analyst-question').focus();});
try{if(localStorage.getItem('arbitrageai_ollama_model'))$('ollama-model').value=localStorage.getItem('arbitrageai_ollama_model');}catch(e){}
$('ollama-save').addEventListener('click',()=>{const val=$('ollama-model').value.trim();if(!/^[A-Za-z0-9_.:-]{1,70}$/.test(val)){toast('Invalid Ollama model name');return;}try{localStorage.setItem('arbitrageai_ollama_model',val);}catch(e){}toast('Preferred local model saved in this app window');});
$('analyst-form').addEventListener('submit',async e=>{e.preventDefault();const btn=$('analyst-run');btn.disabled=true;btn.textContent='Researching…';$('analyst-output').textContent='Analyzing news and account preferences. Local models can be slow on Intel hardware…';try{const result=await api('/api/analyst/run',{question:$('analyst-question').value.trim(),model:$('ollama-model').value.trim()||'llama3.2:3b'});$('analyst-output').textContent=result.result.text;$('analysis-source').textContent=result.result.provider;toast(result.result.model_used?'Local Ollama report generated':'Rules-based research output — Ollama unavailable');}catch(err){$('analyst-output').textContent='Analysis unavailable: '+err.message;}finally{btn.disabled=false;btn.textContent='Analyze ↗';}});

update();setInterval(update,1500);

// v0.6 side analyst and simulation instrumentation
(function(){const bubble=document.getElementById('analyst-bubble'),backdrop=document.getElementById('analyst-backdrop'),drawer=document.getElementById('view-analyst');function toggle(force){const open=typeof force==='boolean'?force:!drawer.classList.contains('active');drawer.classList.toggle('active',open);backdrop.hidden=!open;bubble.setAttribute('aria-expanded',String(open));bubble.innerHTML=open?'✕ <span>Close</span>':'✦ <span>AI</span>';}bubble.addEventListener('click',()=>toggle());backdrop.addEventListener('click',()=>toggle(false));document.addEventListener('keydown',e=>{if(e.key==='Escape')toggle(false)});const target=document.getElementById('competition-results'),brokers=document.getElementById('broker-network');setInterval(()=>{if(typeof state==='undefined'||!state)return;const s=state;const c=s.competition||{};target.textContent=`Our wins: ${c.our_wins||0} · Rival wins: ${c.rival_wins||0} · Lost races: ${c.missed||0} · Partial fills: ${c.partial||0}`;brokers.textContent=(s.venues||[]).map(v=>`${v.id} (${v.asset}, ${v.latency}ms, ${v.fee}bps)`).join('  ·  ')+` · ${s.participant_count||0} synthetic participants`;},1200);})();

$('key-provider')?.addEventListener('change',async()=>{try{await api('/api/provider',{provider:$('key-provider').value});await update();}catch(e){toast(e.message);}});
