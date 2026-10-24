import test from 'node:test';
import assert from 'node:assert/strict';
import { packSignal, unpackSignal, createId } from '../src/p2p-codec.js';

const id='b'.repeat(24);
const sdp='v=0\r\no=- 123 4 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=fingerprint:sha-256 AB:12\r\n';
test('offline signaling: compressed offer/answer roundtrip', async()=>{
  for(const type of ['offer','answer']){
    const code=await packSignal({type,sdp},id);
    assert.match(code,/^pc1\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(await unpackSignal(code,type),{type,sdp,id});
    await assert.rejects(unpackSignal(code,type==='offer'?'answer':'offer'));
  }
});
test('offline signaling: identity random and type mismatches rejected',async()=>{
  assert.match(createId(),/^[a-f0-9]{24}$/);
  assert.notEqual(createId(),createId());
  await assert.rejects(unpackSignal('wrong','offer'));
  await assert.rejects(unpackSignal('pc1.AAAA','offer'));
  await assert.rejects(packSignal({type:'offer',sdp},'x'));
  await assert.rejects(packSignal({type:'offer',sdp:'a'.repeat(15000)},id));
});
