import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBatch, cleanEvent, validRoom, validToken } from '../src/protocol.js';
test('normalizes coordinates and drops unexpected fields before relay',()=>{
  assert.deepEqual(cleanEvent({t:'point',x:.123456,y:1,s:'abc-1',name:'not-to-be-relayed',script:'<script>'}),{t:'point',x:.1235,y:1,s:'abc-1'});
  assert.deepEqual(cleanEvent({t:'note',n:7,frequency:99999}),{t:'note',n:7});
});
test('rejects malformed, unbounded and amplified event payloads',()=>{
  for(const x of [NaN,Infinity,-.1,1.1,'0'])assert.equal(cleanEvent({t:'point',x,y:.5,s:'a'}),null);
  for(const e of [{t:'point',x:0,y:0,s:'<script>'},{t:'note',n:8},{t:'note',n:-1},{t:'eval',code:'x'},null])assert.equal(cleanEvent(e),null);
  assert.equal(cleanBatch([]),null);assert.equal(cleanBatch(Array(17).fill({t:'whale'})),null);assert.equal(cleanBatch(Array(4).fill({t:'note',n:1})),null);
  assert.equal(validRoom('a'.repeat(24)),true);assert.equal(validRoom('../secret'),false);assert.equal(validToken('a'.repeat(43)),true);assert.equal(validToken('1234'),false);
});
