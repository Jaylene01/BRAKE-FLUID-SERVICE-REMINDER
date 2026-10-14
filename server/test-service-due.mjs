import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('public/index.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function num('),html.indexOf('function toast('));
const derive=html.slice(html.indexOf('function derive('),html.indexOf('\nfunction render(){'));
const context=vm.createContext({Date});
vm.runInContext(helpers+'\nvar DEF={intervalKm:40000};\n'+derive,context);
for(const [date,months,want] of [['2026-10-14',12,'14/10/2027'],['2026-01-31',1,'28/02/2026'],['2024-01-31',1,'29/02/2024'],['2024-02-29',12,'28/02/2025'],['2026-12-31',2,'28/02/2027'],['2026-10-14',18,'14/04/2028']]) {
  assert.equal(context.fmt(context.addMonthsClamped(date,months)),want);
}
for(const months of [undefined,null,0,-1,1.5,1201,NaN]) assert.equal(context.addMonthsClamped('2026-10-14',months),null);
assert.equal(context.addMonthsClamped('2026-02-30',1),null);
assert.equal(context.derive({serviceDate:'2026-10-14',mileage:89872,intervalKm:40000,months:12}).nextKm,129872);
// Exercise actual API handlers with a simulated database; no real DB connection.
const handlers={},calls=[];
const express=()=>({use(){},get(){},post(p,f){handlers.post=f;},put(p,f){handlers.put=f;},delete(){},listen(){}});
express.json=()=>()=>{};express.static=()=>()=>{};
const pool={connect:async()=>({query:async()=>{},release(){}}),query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id:'fake',months:params?.[5]??18}]};}};
const backend=vm.createContext({require:n=>n==='express'?express:n==='pg'?{Pool:class {constructor(){return pool;}}}:n==='path'?{}:n==='crypto'?{}:{},__dirname:'.',process:{env:{DATABASE_URL:'test.railway.internal'}},console:{log(){},error(){}},Buffer});
// Provide only the harmless path API required by static registration.
backend.require=(n)=>n==='express'?express:n==='pg'?{Pool:class {constructor(){return pool;}}}:n==='path'?{join:(...s)=>s.join('/')}:{};
vm.runInContext(readFileSync(new URL('server.js',import.meta.url),'utf8'),backend);
function response(){return {code:200,status(c){this.code=c;return this;},json(v){this.body=v;return this;}};}
for(const invalid of [-1,1.5,'12months','',true,1201]) {const r=response();await handlers.post({body:{months:invalid}},r);assert.equal(r.code,400);}
let r=response();await handlers.post({body:{}},r);assert.equal(calls.at(-1).params[6],0);
r=response();await handlers.put({body:{months:18},params:{id:'fake'}},r);assert.equal(calls.at(-1).params[5],18);
r=response();await handlers.put({body:{},params:{id:'fake'}},r);assert.equal(calls.at(-1).params[5],null);assert.match(calls.at(-1).sql,/months=COALESCE\(\$6, months\)/);
r=response();await handlers.put({body:{months:0},params:{id:'fake'}},r);assert.equal(calls.at(-1).params[5],0);
console.log('Service due calculations and API compatibility checks passed');
