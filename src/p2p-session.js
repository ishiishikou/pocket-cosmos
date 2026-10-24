import { packSignal, unpackSignal, waitForIce, createId } from './p2p-codec.js';
import { cleanBatch } from './protocol.js';

// Two-phone, no STUN/TURN/HTTP signaling. Browser ICE host candidates only.
export class LocalPeer {
  constructor({ onState = () => {}, onMessage = () => {} } = {}) {
    this.onState = onState; this.onMessage = onMessage;
    this.pc = null; this.channel = null; this.role = null;
    this.id = null; this.state = 'idle'; this.seq = 0;
    this.lastReceived = -1;
  }
  stateChange(state, detail = '') {
    this.state = state; this.onState(state, detail);
  }
  reset() {
    if (this.channel) { this.channel.onmessage = null; this.channel.onclose = null; this.channel.onopen = null; }
    if (this.pc) { this.pc.onconnectionstatechange = null; this.pc.ondatachannel = null; this.pc.close(); }
    this.pc = null; this.channel = null; this.id = null; this.role = null;
    this.seq = 0; this.lastReceived = -1; this.stateChange('idle');
  }
  setup(role, id) {
    this.reset(); this.id = id; this.role = role;
    const pc = new RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all' });
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected') this.stateChange('connected');
      else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') this.stateChange('disconnected', '直接通信が切れました。新しい接続コードでやり直してください。');
    };
    pc.ondatachannel = e => this.attach(e.channel);
    if (role === 'host') this.attach(pc.createDataChannel('cosmos', {ordered: true}));
    return pc;
  }
  attach(channel) {
    this.channel = channel;
    channel.onopen = () => this.stateChange('connected');
    channel.onclose = () => { if (this.state === 'connected') this.stateChange('disconnected', '通信が終了しました'); };
    channel.onerror = () => this.stateChange('disconnected', '通信に問題が発生しました');
    channel.onmessage = e => {
      if (typeof e.data !== 'string' || e.data.length > 3000) return;
      let packet;
      try { packet = JSON.parse(e.data); } catch { return; }
      if (packet?.v !== 1 || packet.t !== 'batch' || !Number.isSafeInteger(packet.seq) ||
          packet.seq <= this.lastReceived || !cleanBatch(packet.events)) return;
      this.lastReceived = packet.seq;
      this.onMessage(packet.events);
    };
  }
  async createOffer() {
    const id = createId(), pc = this.setup('host', id);
    this.stateChange('preparing');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    if (this.pc !== pc) throw Error('接続作成が中断されました');
    const code = await packSignal(pc.localDescription, id);
    this.stateChange('offer');
    return code;
  }
  async answerOffer(code) {
    const offer = await unpackSignal(code, 'offer');
    const pc = this.setup('guest', offer.id);
    this.stateChange('preparing');
    await pc.setRemoteDescription({type: 'offer', sdp: offer.sdp});
    await pc.setLocalDescription(await pc.createAnswer());
    await waitForIce(pc);
    if (this.pc !== pc) throw Error('接続作成が中断されました');
    const answer = await packSignal(pc.localDescription, offer.id);
    this.stateChange('answer');
    return answer;
  }
  async acceptAnswer(code) {
    if (!this.pc || this.role !== 'host' || this.state !== 'offer') throw Error('先に親の接続コードを作成してください');
    const answer = await unpackSignal(code, 'answer');
    if (answer.id !== this.id) throw Error('別の宇宙への返事です。作り直してください');
    this.stateChange('connecting');
    await this.pc.setRemoteDescription({type: 'answer', sdp: answer.sdp});
  }
  emit(event) {
    const channel = this.channel;
    if (this.state !== 'connected' || !channel || channel.readyState !== 'open' ||
        channel.bufferedAmount > 32000 || !cleanBatch([event])) return false;
    channel.send(JSON.stringify({v: 1, t: 'batch', seq: this.seq++, events: [event]}));
    // Local notes must sound immediately, never await a round trip.
    return event.t !== 'note';
  }
}
