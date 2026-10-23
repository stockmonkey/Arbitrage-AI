// Run: node tests/run-tests.js
const assert = require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const data=new Map();
const ctx={Response,Date,Math,JSON,Promise,performance,console,
  localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},
  setInterval:()=>0,setTimeout:()=>0,
  AndroidData:{hasKey:()=>false,saveKey:()=>true,clearKey:()=>{}}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/mobile-api.js'),'utf8'),ctx);
const e=ctx.__arbMobileTest;
const now=Date.now();
const q=(venue,bid,ask,currency='USD',stamp=now)=>({symbol:'EUR/USD',asset_class:'Forex',currency,venue,bid,ask,bid_size:100000,ask_size:100000,timestamp_ms:stamp});
const profile=e.snapshot().virtual.profile;
assert.equal(profile.risk_tolerance,3);
assert.equal(e.snapshot().live_execution_available,false);
const c=e.candidate(q('SIM-A',1.0847,1.0849),q('SIM-B',1.0851,1.0853),{starting_balance:10000,paper_pnl:0});
assert.ok(c&&c.net_bps>0&&c.estimated_usd>0,'valid synthetic spread');
assert.ok(e.candidate(q('SIM-A',1.0847,1.0849,'JPY'),q('SIM-B',1.0851,1.0853,'JPY'),{starting_balance:10000,paper_pnl:0}),'cross-currency quote conversion supported');
assert.equal(e.candidate(q('SIM-A',1.0847,1.0849,'USD',now-100000),q('SIM-B',1.0851,1.0853),{starting_balance:10000,paper_pnl:0}),null,'stale quote excluded');
assert.equal(e.candidate(q('SIM-A',1.0847,1.0849),q('SIM-A',1.0851,1.0853),{starting_balance:10000,paper_pnl:0}),null,'same venue excluded');
const stubAccount={starting_balance:0,paper_pnl:0};
assert.equal(e.candidate(q('SIM-A',1.0847,1.0849),q('SIM-B',1.0851,1.0853),stubAccount),null,'no funding means no paper opportunity');
(async()=>{
  await e.request('/api/accounts',{operation:'create',name:'Forex Research',balance:5000000});
  assert.equal(e.snapshot().virtual.accounts.length,2);
  const newAccount=e.snapshot().virtual.accounts[1];
  assert.equal(newAccount.starting_balance,5000000);
  await e.request('/api/accounts',{operation:'select',id:newAccount.id});
  await e.request('/api/accounts',{operation:'edit',id:newAccount.id,name:'Large demo',balance:999999999});
  assert.equal(e.snapshot().virtual.accounts.find(a=>a.id===newAccount.id).starting_balance,999999999);
  await e.request('/api/profile',{profile:{...profile,max_allocation_pct:10}});
  assert.equal(e.snapshot().virtual.profile.max_allocation_pct,10);
  await assert.rejects(e.request('/api/risk',{risk:{max_notional_usd:-1}}));
  await e.request('/api/action',{action:'kill'});
  assert.equal(e.snapshot().running,false);
  assert.equal(e.snapshot().kill_switch,true);
  await assert.rejects(e.request('/api/action',{action:'start'}),'kill prevents restart');
  await e.request('/api/action',{action:'clear_kill'});
  await e.request('/api/action',{action:'start'});
  for(let i=0;i<100;i++)e.step();
  assert.ok(e.snapshot().quotes.length===186,'62 instruments, 3 synthetic venues');
  assert.ok(e.snapshot().stats.symbols===62);
  assert.ok(e.snapshot().stats.detected>=0);
  assert.equal(e.snapshot().participant_count,1200);
  assert.equal(Object.keys(e.snapshot().market_labels).length,62);
  assert.ok(Number.isFinite(e.snapshot().stats.median_calc_ms));
  await e.request('/api/news/refresh',{});
  assert.equal(e.snapshot().research.stories.length,0,'no fabricated news');
  const result=await e.request('/api/analyst/run',{question:'How to hedge currency risk?'});
  assert.equal(result.result.model_used,false,'rules-based not misrepresented as an LLM');
  assert.match(result.result.text,/NO(T|T AN) LLM|NOT AN LLM/);
  assert.ok(data.has('arbitrageai_android_v05_state'),'local state saved');
  console.log('PASS: 17 Android local simulator/permissions/finance logic assertions');
})().catch(e=>{console.error(e);process.exitCode=1;});
