import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createCosmosServer } from '../server/app.js';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(t,options={}){
  const app=createCosmosServer(options);app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  t.after(()=>app.close());
  async function peer(originHeader=origin){
    const ws=new WebSocket(origin.replace('http','ws')+'/socket',{headers:{Origin:originHeader}});
    const messages=[];const listeners=new Set();
    ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);for(const l of listeners)l();});
    await once(ws,'open');
    return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:predicate=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{listeners.delete(check);reject(Error('Timeout waiting for message'));},2500);
      function check(){const i=messages.findIndex(predicate);if(i>=0){clearTimeout(timer);listeners.delete(check);resolve(messages.splice(i,1)[0]);}}
      listeners.add(check);check();
    })};
  }
  async function create(){const r=await fetch(origin+'/api/rooms',{method:'POST',headers:{Origin:origin}});assert.equal(r.status,201);return r.json();}
  async function host(){const room=await create(),p=await peer();p.send({t:'hello',v:1,room:room.room,key:room.resume,kind:'resume'});const joined=await p.wait(m=>m.t==='joined');return {room,p,joined};}
  async function guest(h){const p=await peer();p.send({t:'hello',v:1,room:h.room.room,key:h.room.invite,kind:'invite'});const waiting=await p.wait(m=>m.t==='waiting');const requests=await h.p.wait(m=>m.t==='requests'&&m.requests.some(r=>r.code===waiting.code));const id=requests.requests.find(r=>r.code===waiting.code).id;h.p.send({t:'approve',id});return {p,joined:await p.wait(m=>m.t==='joined')};}
  return {app,origin,peer,create,host,guest};
}
test('two approved clients relay both directions with stable colors and scheduled notes',async t=>{
  const f=await fixture(t),h=await f.host(),g=await f.guest(h);
  assert.equal(h.joined.slot,0);assert.equal(g.joined.slot,1);
  h.p.send({t:'batch',seq:0,events:[{t:'point',x:.12,y:.65,s:'h'},{t:'note',n:3}]});
  const m=await g.p.wait(m=>m.t==='batch');assert.equal(m.id,h.joined.id);assert.deepEqual(m.events,[{t:'point',x:.12,y:.65,s:'h'},{t:'note',n:3}]);assert.ok(Math.abs(m.at-Date.now()-120)<500);
  g.p.send({t:'batch',seq:0,events:[{t:'point',x:.75,y:.3,s:'g'},{t:'note',n:6}]});
  const back=await h.p.wait(m=>m.t==='batch'&&m.id===g.joined.id);assert.equal(back.slot,1);assert.equal(back.events[1].n,6);
});
test('invite holders cannot see or draw until parent approves; wrong secrets are rejected',async t=>{
  const f=await fixture(t),h=await f.host(),p=await f.peer();
  p.send({t:'hello',v:1,room:h.room.room,key:h.room.invite,kind:'invite'});await p.wait(m=>m.t==='waiting');
  p.send({t:'batch',seq:0,events:[{t:'point',x:0,y:0,s:'attack'}]});
  h.p.send({t:'batch',seq:0,events:[{t:'point',x:1,y:1,s:'secret'}]});await pause(50);
  assert.equal(p.messages.some(m=>m.t==='batch'),false);assert.equal(h.p.messages.some(m=>m.t==='batch'&&m.events[0]?.s==='attack'),false);
  const stranger=await f.peer();stranger.send({t:'hello',v:1,room:h.room.room,key:'a'.repeat(43),kind:'invite'});assert.equal((await stranger.wait(m=>m.t==='error')).code,'unavailable');
});
test('simultaneous strokes stay distinct and duplicate sequence is ignored',async t=>{
  const f=await fixture(t),h=await f.host(),g=await f.guest(h);
  h.p.send({t:'batch',seq:2,events:[{t:'point',x:.1,y:.2,s:'same'}]});g.p.send({t:'batch',seq:2,events:[{t:'point',x:.8,y:.9,s:'same'}]});
  const a=await h.p.wait(m=>m.t==='batch'&&m.id===h.joined.id),b=await h.p.wait(m=>m.t==='batch'&&m.id===g.joined.id);
  assert.notEqual(a.id,b.id);assert.notEqual(a.slot,b.slot);
  g.p.send({t:'batch',seq:2,events:[{t:'point',x:0,y:0,s:'duplicate'}]});await pause(40);assert.equal(h.p.messages.some(m=>m.t==='batch'&&m.events[0].s==='duplicate'),false);
});
test('reconnect retains identity, needs resume secret and does not replay old audio',async t=>{
  const f=await fixture(t),h=await f.host(),g=await f.guest(h);
  g.p.ws.close();await once(g.p.ws,'close');
  const p=await f.peer();p.send({t:'hello',v:1,room:h.room.room,key:g.joined.resume,kind:'resume'});
  const resumed=await p.wait(m=>m.t==='joined');assert.equal(resumed.id,g.joined.id);assert.equal(resumed.slot,g.joined.slot);assert.equal(p.messages.some(m=>m.t==='batch'),false);
  p.send({t:'batch',seq:0,events:[{t:'note',n:2}]});await h.p.wait(m=>m.t==='batch'&&m.id===resumed.id);
});
test('only host can lock, admit, remove or close; locked room blocks new invites',async t=>{
  const f=await fixture(t),h=await f.host(),g=await f.guest(h);
  g.p.send({t:'close'});g.p.send({t:'lock',locked:true});await pause(30);
  const extra=await f.guest(h);assert.equal(extra.joined.slot,2);
  h.p.send({t:'lock',locked:true});await h.p.wait(m=>m.t==='roster'&&m.locked);
  const blocked=await f.peer();blocked.send({t:'hello',v:1,room:h.room.room,key:h.room.invite,kind:'invite'});await blocked.wait(m=>m.t==='error');
  h.p.send({t:'remove',id:g.joined.id});await g.p.wait(m=>m.t==='ended'&&m.reason==='removed');
  const removed=await f.peer();removed.send({t:'hello',v:1,room:h.room.room,key:g.joined.resume,kind:'resume'});await removed.wait(m=>m.t==='error');
  h.p.send({t:'close'});await extra.p.wait(m=>m.t==='ended');
});
test('room isolation, server validation and no personal data relay',async t=>{
  const f=await fixture(t),a=await f.host(),b=await f.host(),g=await f.guest(a);
  g.p.send({t:'batch',seq:0,name:'private',events:[{t:'point',x:.5,y:.5,s:'good',name:'private'}]});
  const m=await a.p.wait(m=>m.t==='batch');assert.equal(JSON.stringify(m).includes('private'),false);
  await pause(20);assert.equal(b.p.messages.some(m=>m.t==='batch'),false);
  g.p.send({t:'batch',seq:1,events:[{t:'point',x:999,y:0,s:'bad'}]});await pause(20);assert.equal(a.p.messages.some(m=>m.t==='batch'&&m.seq===1),false);
});
test('expired rooms and stale resume secrets become unusable',async t=>{
  let time=Date.now();const f=await fixture(t,{now:()=>time}),h=await f.host();time+=6*3600000+1;f.app.reap();await h.p.wait(m=>m.t==='ended'&&m.reason==='expired');
  const p=await f.peer();p.send({t:'hello',v:1,room:h.room.room,key:h.room.resume,kind:'resume'});await p.wait(m=>m.t==='error');
});
test('same-origin protection, room cap and security headers',async t=>{
  const f=await fixture(t,{maxRooms:1});
  const bad=await fetch(f.origin+'/api/rooms',{method:'POST',headers:{Origin:'https://example.invalid'}});assert.equal(bad.status,403);
  await f.create();const full=await fetch(f.origin+'/api/rooms',{method:'POST',headers:{Origin:f.origin}});assert.equal(full.status,429);
  const health=await fetch(f.origin+'/healthz');assert.equal(health.status,200);assert.equal(health.headers.get('referrer-policy'),'no-referrer');assert.ok(health.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await fetch(f.origin+'/.git/config')).status,404);
  const ws=new WebSocket(f.origin.replace('http','ws')+'/socket',{headers:{Origin:'https://example.invalid'}});const [error]=await once(ws,'error');assert.match(error.message,/403/);
});
