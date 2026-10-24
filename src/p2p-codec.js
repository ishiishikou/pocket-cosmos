// This is an offline signaling envelope; no server receives the offer or answer.
const PREFIX = 'pc1.';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_CODE = 6000;
const MAX_JSON = 14000;
function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64url(text) {
  if (!/^[\w-]+$/.test(text)) throw Error('接続コードが正しくありません');
  const bytes = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4));
  return Uint8Array.from(bytes, x => x.charCodeAt(0));
}
async function streamBytes(data, stream, limit) {
  const reader = new Blob([data]).stream().pipeThrough(stream).getReader();
  const chunks = []; let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw Error('接続コードが大きすぎます'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(total); let offset = 0;
  for (const bytes of chunks) { out.set(bytes, offset); offset += bytes.length; }
  return out;
}
export async function packSignal({type, sdp}, id) {
  if (!['offer', 'answer'].includes(type) || typeof sdp !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw Error('接続情報を作成できません');
  const raw = encoder.encode(JSON.stringify({v: 1, type, id, sdp}));
  if (raw.length > MAX_JSON) throw Error('接続情報が大きすぎます');
  const bytes = await streamBytes(raw, new CompressionStream('deflate'), MAX_CODE);
  const code = PREFIX + b64url(bytes);
  if (code.length > MAX_CODE) throw Error('接続情報が長すぎます');
  return code;
}
export async function unpackSignal(input, expectedType) {
  let code = String(input || '').trim();
  // Also accept links using a hash fragment, without transmitting signals to a server.
  if (code.startsWith('https://')) {
    const url = new URL(code);
    code = new URLSearchParams(url.hash.slice(1)).get('signal') || '';
  }
  if (!code.startsWith(PREFIX) || code.length > MAX_CODE) throw Error('Pocket Cosmosの接続コードではありません');
  const bytes = unb64url(code.slice(PREFIX.length));
  const plain = await streamBytes(bytes, new DecompressionStream('deflate'), MAX_JSON);
  let signal;
  try { signal = JSON.parse(decoder.decode(plain)); } catch { throw Error('接続コードを読み取れません'); }
  if (signal?.v !== 1 || signal?.type !== expectedType || !/^[a-f0-9]{24}$/.test(signal?.id) ||
      typeof signal?.sdp !== 'string' || signal.sdp.length > MAX_JSON ||
      !signal.sdp.startsWith('v=0\r\n') || !signal.sdp.includes('a=fingerprint:')) {
    throw Error('接続コードの種類または内容が不正です');
  }
  return {type: signal.type, sdp: signal.sdp, id: signal.id};
}
export async function waitForIce(pc, timeoutMs = 8000) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise(resolve => {
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete' || pc.signalingState === 'closed') done(); };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check); check();
  });
}
export const createId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2, '0')).join('');
