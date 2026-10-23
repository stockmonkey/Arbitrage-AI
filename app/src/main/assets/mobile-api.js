/* ArbitrageAI Android: entirely local paper engine and compatible API adapter.
   Intentionally NO brokerage order routes, account connections, or live arbitrage feed.
   Quotes and P&L are synthetic and do not indicate tradable opportunities.
*/
(function (global) {
'use strict';
const STORE = 'arbitrageai_android_v05_state';
const VENUES=[{id:'FX-ALPHA',asset:'Forex',latency:12,fee:.2},{id:'FX-BETA',asset:'Forex',latency:35,fee:.3},{id:'FX-GAMMA',asset:'Forex',latency:75,fee:.15},{id:'EQ-ALPHA',asset:'Stocks',latency:18,fee:.25},{id:'EQ-BETA',asset:'Stocks',latency:48,fee:.2},{id:'EQ-GAMMA',asset:'Stocks',latency:90,fee:.3}];
// Participant archetypes approximate market-making, momentum, mean-reversion and latency arbitrage.
// Population is simulated locally; no actual investors or broker activity is represented.
const PARTICIPANT_COUNT=1200;
const RIVALS=Array.from({length:PARTICIPANT_COUNT},(_,i)=>{
  const strategy=['market-maker','momentum','mean-reversion','latency-arbitrage','passive-rebalance'][i%5];
  const tier=i%20;
  return {id:i+1,name:'Simulated participant '+(i+1),strategy,venue_index:i%6,
    compute: tier===0?0.35:2+(i*37%180),network:tier===0?0.8:3+(i*23%110),
    participation: strategy==='latency-arbitrage'?.24:strategy==='market-maker'?.08:.025,
    order_fraction:.002+(i*13%45)/1000};
});
const nowISO = () => new Date().toISOString();
const num = (x, fallback=0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
const valid = (v,a,b,name) => {
  if (typeof v!=='number'||!Number.isFinite(v)||v<a||v>b) throw Error(name+' must be from '+a+' to '+b);
  return v;
};
const rnd = (x,n=5) => Number(x.toFixed(n));
const RISK = {min_net_edge_bps:1.0,fee_per_side_bps:0.2,slippage_total_bps:0.4,
  max_notional_usd:250000,paper_notional_usd:2500,max_quote_age_ms:1500,
  cooldown_seconds:12,max_paper_signals:100000};
const BOUNDS = {min_net_edge_bps:[0,100],fee_per_side_bps:[0,100],slippage_total_bps:[0,100],
  max_notional_usd:[1,100000000],paper_notional_usd:[1,100000000],max_quote_age_ms:[1,60000],
  cooldown_seconds:[0,3600],max_paper_signals:[1,1000000]};
const PROFILE = {risk_tolerance:3,max_drawdown_pct:10,max_allocation_pct:25,horizon_days:30,leverage_allowed:false,focus:'Both'};
// Indicative reference levels are fictional starting points, NOT historical/current quotes.
// All FX instruments use USD as quote currency for consistent USD-denominated P&L.
const FX=[
 ['EUR/USD','Euro / US Dollar',1.085],['GBP/USD','British Pound / US Dollar',1.301],
 ['AUD/USD','Australian Dollar / US Dollar',.665],['NZD/USD','New Zealand Dollar / US Dollar',.605],
 ['USD/CAD','US Dollar / Canadian Dollar',1.375],['USD/JPY','US Dollar / Japanese Yen',151.2],
 ['USD/CHF','US Dollar / Swiss Franc',.885],['USD/SEK','US Dollar / Swedish Krona',10.45],
 ['USD/NOK','US Dollar / Norwegian Krone',10.7],['USD/DKK','US Dollar / Danish Krone',6.85],
 ['USD/SGD','US Dollar / Singapore Dollar',1.35],['USD/MXN','US Dollar / Mexican Peso',18.4]
];
const EQUITIES=[
 ['AAPL','Apple'],['MSFT','Microsoft'],['NVDA','NVIDIA'],['AMZN','Amazon'],['GOOGL','Alphabet Class A'],
 ['GOOG','Alphabet Class C'],['META','Meta Platforms'],['TSLA','Tesla'],['BRK.B','Berkshire Hathaway Class B'],
 ['JPM','JPMorgan Chase'],['V','Visa'],['MA','Mastercard'],['WMT','Walmart'],['COST','Costco Wholesale'],
 ['HD','Home Depot'],['PG','Procter & Gamble'],['KO','Coca-Cola'],['PEP','PepsiCo'],['MCD','McDonald’s'],
 ['DIS','Walt Disney'],['NFLX','Netflix'],['AMD','Advanced Micro Devices'],['INTC','Intel'],['QCOM','Qualcomm'],
 ['AVGO','Broadcom'],['ORCL','Oracle'],['CRM','Salesforce'],['ADBE','Adobe'],['CSCO','Cisco Systems'],
 ['IBM','International Business Machines'],['UBER','Uber Technologies'],['ABNB','Airbnb'],['PYPL','PayPal'],
 ['SQ','Block Inc.'],['SHOP','Shopify Class A'],['BA','Boeing'],['CAT','Caterpillar'],['GE','GE Aerospace'],
 ['HON','Honeywell'],['UPS','United Parcel Service'],['FDX','FedEx'],['XOM','Exxon Mobil'],['CVX','Chevron'],
 ['COP','ConocoPhillips'],['JNJ','Johnson & Johnson'],['PFE','Pfizer'],['MRK','Merck & Co.'],
 ['UNH','UnitedHealth Group'],['ABBV','AbbVie'],['TMO','Thermo Fisher Scientific']
];
const MARKETS=[...FX.map(([ticker,name,price])=>[ticker,'Forex',ticker.split('/')[1],price,100000,name]),
 ...EQUITIES.map(([ticker,name],i)=>[ticker,'Stocks','USD',Number((35+(i*43.71)%470).toFixed(2)),300+(i%8)*250,name])];
const MARKET_INFO=Object.fromEntries(MARKETS.map(m=>[m[0],m[5]]));
const account = (name='Demo portfolio',amount=10000) => ({id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,9),name,starting_balance:amount,paper_pnl:0});
const initialAccount=account();
const defaults=()=>({
  running:true,kill_switch:false,risk:{...RISK},
  virtual:{accounts:[initialAccount],active_id:initialAccount.id,profile:{...PROFILE}},
  stats:{modeled_pnl_usd:0,detected:0,paper_signals:0,median_calc_ms:0,p95_calc_ms:0,uptime_seconds:0,symbols:MARKETS.length},
  quotes:[],opportunities:[],activity:[],history:[0,0],bars:[],tradingview_alerts:[],
  research:{stories:[],errors:['Android offline edition: live global news not connected.'],last_checked:null,refresh_wait_seconds:0},
  live:{prices:[],errors:[],last_refreshed:null,wait_seconds:0,has_api_key:false},
  prices:MARKETS.map(m=>m[3]), lastSignal:{},startedAt:Date.now(),lastScan:0,last_tick:null,latencies:[],competition:{rival_wins:0,our_wins:0,missed:0,partial:0}
});
let s=defaults();
try {
  const raw=localStorage.getItem(STORE);
  if(raw){
    const saved=JSON.parse(raw);
    if(saved?.virtual?.accounts?.length && saved.virtual.accounts.length<=40) {
      s={...s,...saved,risk:{...RISK,...saved.risk},virtual:{...saved.virtual,profile:{...PROFILE,...saved.virtual.profile}}};
      s.running=false; // require user to resume on each app launch
      s.kill_switch=Boolean(saved.kill_switch);
      s.startedAt=Date.now();
      s.lastSignal={};
      s.lastScan=0;
    }
  }
} catch (e) { console.warn('Saved state unavailable',e); }
if(!Array.isArray(s.prices)||s.prices.length!==MARKETS.length)s.prices=MARKETS.map(m=>m[3]);
s.stats.symbols=MARKETS.length;
s.competition=s.competition||{rival_wins:0,our_wins:0,missed:0,partial:0};
s.live.has_api_key=Boolean(global.AndroidData?.hasKey?.());
function save() {
  // Do not persist API keys or save transient quote streams as credentials.
  try {localStorage.setItem(STORE,JSON.stringify({...s,quotes:[],latencies:s.latencies.slice(-100)}));}
  catch(e){console.warn('Local save failed:',e);}
}
function event(kind,message,more={}){
  s.activity.unshift({at:nowISO(),kind,message,...more});
  s.activity.length=Math.min(s.activity.length,100);
}
function accounts(){
  const rows=s.virtual.accounts.map(a=>({...a,equity:rnd(a.starting_balance+a.paper_pnl,2)}));
  return {...s.virtual,accounts:rows};
}
function currentAccount(){return s.virtual.accounts.find(a=>a.id===s.virtual.active_id);}
function makeQuotes(){
  const quotes=[];
  for(let i=0;i<MARKETS.length;i++){
    const [symbol,asset_class,currency,,depth,name]=MARKETS[i];
    s.prices[i]*=1+(Math.random()-.5)*(asset_class==='Forex'?.00010:.00075);
    for(const broker of VENUES.filter(v=>v.asset===asset_class)) {
      const venue=broker.id;
      const center=s.prices[i]*(1+(Math.random()-.5)*.00048);
      const half=center*(asset_class==='Forex'?.35:1.2+Math.random()*1.4)/10000;
      quotes.push({symbol,name,asset_class,currency,venue,bid:rnd(center-half,6),ask:rnd(center+half,6),bid_size:depth,ask_size:depth,broker_latency_ms:broker.latency,broker_fee_bps:broker.fee,source:'SYNTHETIC',timestamp_ms:Date.now()});
    }
  }
  return quotes;
}
function candidate(buy,sell,active,config=s.risk,stamp=Date.now()) {
  if(buy.symbol!==sell.symbol||buy.venue===sell.venue||buy.asset_class!==sell.asset_class||buy.currency!==sell.currency)return null;
  if(![buy.bid,buy.ask,sell.bid,sell.ask,buy.ask_size,sell.bid_size].every(x=>Number.isFinite(x)&&x>0))return null;
  if(buy.bid>buy.ask||sell.bid>sell.ask)return null;
  const age=Math.max(stamp-buy.timestamp_ms,stamp-sell.timestamp_ms);
  if(age<0||age>config.max_quote_age_ms)return null;
  const gross=(sell.bid-buy.ask)/buy.ask*10000;
  const costs=2*config.fee_per_side_bps+config.slippage_total_bps;
  const net=gross-costs;
  if(net<config.min_net_edge_bps)return null;
  const allowed=active?clamp((active.starting_balance+active.paper_pnl)*s.virtual.profile.max_allocation_pct/100,0,config.max_notional_usd):0;
  const target=Math.min(config.paper_notional_usd,config.max_notional_usd,allowed);
  const fxToUSD=buy.asset_class==='Forex'&&buy.currency!=='USD'?1/buy.ask:1;
  const quantity=Math.min(target/(buy.ask*fxToUSD),buy.ask_size,sell.bid_size);
  if(quantity<=0)return null;
  const notional=buy.ask*quantity*fxToUSD;
  const profit=(sell.bid-buy.ask)*quantity*fxToUSD-notional*costs/10000;
  if(profit<=0)return null;
  return {symbol:buy.symbol,asset_class:buy.asset_class,buy_venue:buy.venue,sell_venue:sell.venue,
    buy_ask:buy.ask,sell_bid:sell.bid,gross_bps:rnd(gross,3),net_bps:rnd(net,3),
    quantity:rnd(quantity,6),notional_usd:rnd(notional,2),estimated_usd:rnd(profit,5),age_ms:age};
}
function initialDepthFor(buy,sell){return Math.min(buy?.ask_size||0,sell?.bid_size||0);}
function step(){
  if(!s.running||s.kill_switch)return;
  const started=performance.now();
  const t=Date.now();
  s.quotes=makeQuotes();
  const acc=currentAccount();
  const found=[];
  for(const buy of s.quotes) for(const sell of s.quotes) {
    const c=candidate(buy,sell,acc);
    if(c) found.push(c);
  }
  const elapsed=performance.now()-started; // actual elapsed scan duration, subject to platform timer resolution
  s.latencies.push(elapsed);
  if(s.latencies.length>200)s.latencies.shift();
  let signals=0;
  s.stats.detected+=found.length;
  const time=new Date().toLocaleTimeString('en-US',{hour12:false});
  found.sort((a,b)=>b.net_bps-a.net_bps);
  for(const c of found){
    c.at=time;c.status='Detected';
    const key=[c.symbol,c.buy_venue,c.sell_venue].join('/');
    if(t-(s.lastSignal[key]||0)>=s.risk.cooldown_seconds*1000 && s.stats.paper_signals<s.risk.max_paper_signals && c.notional_usd<=s.risk.max_notional_usd){
      s.lastSignal[key]=t;c.account_id=acc?.id||null;
      const buyQuote=s.quotes.find(q=>q.symbol===c.symbol&&q.venue===c.buy_venue);
      const sellQuote=s.quotes.find(q=>q.symbol===c.symbol&&q.venue===c.sell_venue);
      const routeLatency=Math.max(buyQuote?.broker_latency_ms||0,sellQuote?.broker_latency_ms||0);
      const ourArrival=elapsed+routeLatency;
      // Each participant can be active on a given instrument. Their arrival and
      // volume compete for the same limited displayed depth (not fabricated trades).
      const seed=c.symbol.split('').reduce((n,ch)=>n*31+ch.charCodeAt(0),17);
      const eligible=RIVALS.filter(r=>((r.id*73+seed+Math.floor(t/1000))%101+101)%101<r.participation*100);
      const competitors=eligible.map(r=>({arrival:r.compute+r.network+routeLatency*.45,
        quantity:initialDepthFor(buyQuote,sellQuote)*r.order_fraction,
        strategy:r.strategy})).sort((x,y)=>x.arrival-y.arrival);
      const faster=competitors.filter(r=>r.arrival<ourArrival);
      const initialDepth=initialDepthFor(buyQuote,sellQuote);
      const remaining=Math.max(0,initialDepth-faster.reduce((total,r)=>total+r.quantity,0));
      const fillRatio=Math.min(1,remaining/Math.max(c.quantity,1e-9));
      // Adverse selection: price edge erodes with elapsed time, faster participants
      // and momentum activity. Execution may fail despite a positive quoted spread.
      const momentum=faster.filter(r=>r.strategy==='momentum').length;
      const decay=Math.exp(-ourArrival/(c.asset_class==='Forex'?180:450)-momentum*.008);
      c.competitors_ahead=faster.length;c.simulated_arrival_ms=rnd(ourArrival,3);
      c.fill_ratio=rnd(fillRatio*decay,4);
      c.estimated_usd=rnd(c.estimated_usd*c.fill_ratio,5);
      if(c.fill_ratio<=0||c.estimated_usd<=0){c.status='Lost race';s.competition.missed++;continue;}
      c.status=c.fill_ratio<.999?'Partial paper fill':'Paper signal';
      if(faster.length)s.competition.rival_wins++;else s.competition.our_wins++;
      if(c.fill_ratio<.999)s.competition.partial++;
      acc.paper_pnl+=c.estimated_usd;
      s.stats.modeled_pnl_usd+=c.estimated_usd;
      s.stats.paper_signals++;signals++;
      event('signal','Paper signal: '+c.symbol,{estimated_usd:c.estimated_usd,route:c.buy_venue+' → '+c.sell_venue});
    }
    s.opportunities.unshift(c);
  }
  s.opportunities=s.opportunities.slice(0,45);
  if(!signals&&found.length)event('scan',found.length+' candidate(s) checked; no new paper signal');
  s.history.push(rnd(s.stats.modeled_pnl_usd,5));if(s.history.length>50)s.history.shift();
  s.bars.push({label:time,detected:found.length,signals});if(s.bars.length>22)s.bars.shift();
  s.lastScan=t;s.last_tick=nowISO();
  save();
}
function stats(){
  const arr=[...s.latencies].sort((a,b)=>a-b);
  return {...s.stats,
    median_calc_ms:rnd(arr.length?(arr[Math.floor((arr.length-1)/2)]+arr[Math.floor(arr.length/2)])/2:0,4),
    p95_calc_ms:rnd(arr.length?arr[Math.min(arr.length-1,Math.ceil(arr.length*.95)-1)]:0,4),
    uptime_seconds:Math.max(0,Math.round((Date.now()-s.startedAt)/1000))};
}
function snapshot(){
  const live={...s.live};
  live.wait_seconds=Math.max(0,Math.ceil(((s.live.refresh_allowed_at||0)-Date.now())/1000));
  return {mode:'ANDROID SYNTHETIC / PAPER ONLY',running:s.running,kill_switch:s.kill_switch,live_execution_available:false,
    risk:{...s.risk},stats:stats(),quotes:[...s.quotes],opportunities:[...s.opportunities].reverse(),
    activity:[...s.activity],history:[...s.history],bars:[...s.bars],last_tick:s.last_tick,
    virtual:accounts(),venues:VENUES,competitors:RIVALS.slice(0,20),participant_count:PARTICIPANT_COUNT,market_labels:MARKET_INFO,competition:s.competition,research:{...s.research},tradingview_alerts:[...s.tradingview_alerts],live};
}
function withAccount(id){const a=s.virtual.accounts.find(a=>a.id===id);if(!a)throw Error('Account not found');return a;}
function profileSave(p){
  if(!p||Object.keys(PROFILE).some(k=>!(k in p)))throw Error('Incomplete risk profile');
  if(!Number.isInteger(p.risk_tolerance))throw Error('Risk tolerance must be a whole number');
  if(!Number.isInteger(p.horizon_days))throw Error('Horizon must be a whole number');
  valid(p.risk_tolerance,1,5,'Risk tolerance');valid(p.horizon_days,1,3650,'Horizon');
  valid(p.max_drawdown_pct,.1,100,'Drawdown');valid(p.max_allocation_pct,.1,100,'Allocation');
  if(typeof p.leverage_allowed!=='boolean'||!['Both','Forex','Stocks'].includes(p.focus))throw Error('Invalid profile');
  s.virtual.profile={...p};
}
function accountsAction(d){
  switch(d.operation){
    case 'create': {
      if(s.virtual.accounts.length>=40)throw Error('Maximum 40 virtual accounts');
      const name=String(d.name||'').trim();if(!name||name.length>48)throw Error('Enter a name (1–48 characters)');
      valid(d.balance,0,1e9,'Starting balance');s.virtual.accounts.push(account(name,d.balance));break;
    }
    case 'edit': {
      const a=withAccount(d.id);const name=String(d.name||'').trim();if(!name||name.length>48)throw Error('Invalid name');
      valid(d.balance,0,1e9,'Starting balance');a.name=name;a.starting_balance=d.balance;break;
    }
    case 'select':withAccount(d.id);s.virtual.active_id=d.id;break;
    case 'delete':{
      if(s.virtual.accounts.length===1)throw Error('At least one account required');
      withAccount(d.id);s.virtual.accounts=s.virtual.accounts.filter(a=>a.id!==d.id);
      if(s.virtual.active_id===d.id)s.virtual.active_id=s.virtual.accounts[0].id;break;
    }
    case 'reset_pnl':withAccount(d.id).paper_pnl=0;break;
    default:throw Error('Unknown account action');
  }
}
function riskSave(r){
  if(!r||Object.keys(RISK).length!==Object.keys(r).length)throw Error('Incomplete risk configuration');
  for(const k of Object.keys(RISK)) {
    if(!(k in r))throw Error('Missing risk control '+k);
    const [low,high]=BOUNDS[k];valid(r[k],low,high,k);
  }
  if(!Number.isInteger(r.max_paper_signals))throw Error('Max signals must be whole number');
  if(r.paper_notional_usd>r.max_notional_usd)throw Error('Paper notional exceeds cap');
  s.risk={...r};
}
function analystAnswer(question){
  const a=currentAccount(),p=s.virtual.profile;
  const exposure=Math.max(0,a.starting_balance+a.paper_pnl)*p.max_allocation_pct/100;
  const caution=p.risk_tolerance<=2?'Conservative':p.risk_tolerance===3?'Moderate':'Aggressive research';
  const focus=question?('Question: '+String(question).slice(0,350)):'General review';
  const response=[
    'ANDROID OFFLINE RESEARCH FRAMEWORK — NOT AN LLM OR A LIVE NEWS ANALYSIS',
    '',focus,'',
    'Account: '+a.name+'; modeled equity $'+(a.starting_balance+a.paper_pnl).toFixed(2)+'.',
    'Profile: '+caution+'; risk '+p.risk_tolerance+'/5; max drawdown '+p.max_drawdown_pct+'%; paper allocation '+p.max_allocation_pct+'%; horizon '+p.horizon_days+' days.',
    'Maximum paper capital allocated to one idea: $'+exposure.toFixed(2)+'. Leverage scenarios: '+(p.leverage_allowed?'allowed for research':'excluded')+'.',
    '',
    'Potential hedges to INVESTIGATE (not orders):',
    '• If you hold USD assets but spend in CAD, quantify USD/CAD currency exposure and compare the costs of a partial CAD hedge.',
    '• For broad equity exposure, compare reducing position concentration versus index put protection; option premiums, spreads, expiries and correlation can dominate results.',
    '• For Forex, compare a smaller position and a predefined stop scenario before considering an offsetting currency leg, which may introduce basis and carry risk.',
    '',
    'Global-event checklist: verify primary news sources and publication times; identify affected currencies, rates, energy, safe-haven demand and the relevant trading sessions. The Android app has NOT retrieved current headlines.',
    'Conditional trade research: write an entry trigger, executable quote source, invalidation level, costs, position size, maximum loss, and exit conditions. Do not treat synthetic quote crossings as trade signals.',
    '',
    'This is a locally generated rules-based outline. It is not current financial advice; no live market quotes, actual positions, news feed or broker execution were consulted.'
  ];
  return {text:response.join('\n'),provider:'Android offline rules-based research (no LLM)',model_used:false};
}
let pricePromise=null;
global.__mobileOnPrices=function(json){
  if(!pricePromise)return;
  const {resolve,reject}=pricePromise;pricePromise=null;
  try{const result=JSON.parse(json);s.live.prices=result.prices||[];s.live.errors=result.errors||[];s.live.last_refreshed=Math.floor(Date.now()/1000);s.live.refresh_allowed_at=Date.now()+30000;save();resolve({...s.live});}
  catch(e){reject(e);}
};
function referenceRefresh(){
  if(!s.live.has_api_key)throw Error('Add a provider API key first');
  if(Date.now()<num(s.live.refresh_allowed_at))throw Error('Please wait at least 30 seconds between refreshes');
  if(!global.AndroidData?.refreshPrices)throw Error('Provider network bridge unavailable');
  if(pricePromise)throw Error('A price refresh is already in progress');
  return new Promise((resolve,reject)=>{
    pricePromise={resolve,reject};
    global.AndroidData.refreshPrices();
    setTimeout(()=>{if(pricePromise){pricePromise=null;reject(Error('Provider response timed out'));}},45000);
  });
}
async function request(path,d){
  switch(path){
    case '/api/state':return snapshot();
    case '/api/accounts':accountsAction(d||{});break;
    case '/api/profile':profileSave(d.profile);break;
    case '/api/risk':riskSave(d.risk);event('risk','Risk settings updated');break;
    case '/api/action':{
      const a=d.action;
      if(a==='pause')s.running=false;
      else if(a==='start'){if(s.kill_switch)throw Error('Clear the kill switch first');s.running=true;}
      else if(a==='kill'){s.running=false;s.kill_switch=true;event('risk','Kill switch engaged');}
      else if(a==='clear_kill'){s.kill_switch=false;event('risk','Kill switch cleared; simulator remains paused');}
      else if(a==='reset'){s.running=false;s.stats={...defaults().stats};s.opportunities=[];s.history=[0,0];s.bars=[];s.latencies=[];s.competition={rival_wins:0,our_wins:0,missed:0,partial:0};event('system','Simulated session totals reset');}
      else throw Error('Unknown simulator action');
      break;
    }
    case '/api/tv/import':{
      const title=String(d.title||'').trim();if(!title||title.length>250)throw Error('Invalid alert');
      s.tradingview_alerts.unshift({title,symbol:String(d.symbol||'').slice(0,45),direction:String(d.direction||'').slice(0,45),received_at:Math.round(Date.now()/1000),origin:'Manual entry'});
      s.tradingview_alerts=s.tradingview_alerts.slice(0,50);break;
    }
    case '/api/provider':{
      if(!global.AndroidData?.selectProvider?.(d.provider))throw Error('Invalid provider');
      s.live.has_api_key=Boolean(global.AndroidData.hasKey());s.live.prices=[];s.live.errors=[];
      break;
    }
    case '/api/key':{
      if(!global.AndroidData)throw Error('Android key storage unavailable');
      if(d.provider && !global.AndroidData.selectProvider(d.provider))throw Error('Invalid provider');
      if(d.action==='clear'){global.AndroidData.clearKey();s.live.has_api_key=false;s.live.prices=[];}
      else {const text=String(d.key||'');if(!/^[A-Za-z0-9_-]{6,128}$/.test(text))throw Error('Invalid provider API key');
        if(!global.AndroidData.saveKey(text))throw Error('Could not save key');s.live.has_api_key=true;}
      break;
    }
    case '/api/live/refresh':return {ok:true,live:await referenceRefresh()};
    case '/api/news/refresh':
      s.research.last_checked=nowISO();s.research.stories=[];
      s.research.errors=['Live news retrieval is not implemented in the standalone Android edition.'];
      return {ok:true,research:{...s.research}};
    case '/api/analyst/run':return {ok:true,result:analystAnswer(d?.question||'')};
    default:throw Error('Unknown local API: '+path);
  }
  save();return {ok:true};
}
const nativeFetch=global.fetch?.bind(global);
global.fetch=function(url,opts={}){
  if(typeof url==='string' && url.startsWith('/api/')){
    let payload;
    try{payload=opts.body?JSON.parse(opts.body):undefined;}catch(e){return Promise.resolve(new Response(JSON.stringify({error:'Invalid request'}),{status:400,headers:{'Content-Type':'application/json'}}));}
    return Promise.resolve().then(()=>request(url,payload)).then(result=>new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}}))
      .catch(err=>new Response(JSON.stringify({error:String(err.message||err)}),{status:400,headers:{'Content-Type':'application/json'}}));
  }
  return nativeFetch(url,opts);
};
setInterval(step,1250);
// Exposed only to offline unit tests; never to real brokerage services.
global.__arbMobileTest = {candidate,step,snapshot,request,setState(next){s=next;},defaults};
})(window);
