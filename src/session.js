import { PROTOCOL, cleanBatch, validRoom, validToken } from './protocol.js';

const storage = {
  get() { try { return JSON.parse(sessionStorage.getItem('cosmos-session')); } catch { return null; } },
  set(value) { try { if(value) sessionStorage.setItem('cosmos-session',JSON.stringify(value)); else sessionStorage.removeItem('cosmos-session'); } catch {} }
};
export class CosmosSession {
  constructor(handlers = {}) {
    this.h = handlers; this.ws = null; this.state = 'solo'; this.seq = 0; this.offset = 0;
    this.queue = []; this.attempt = 0; this.generation = 0; this.session = storage.get(); this.lastPong = Date.now();
    if(this.session && (!validRoom(this.session.room)||!validToken(this.session.resume))) { this.session=null;storage.set(null); }
    this.timer = setInterval(()=>this.flush(),40);
    this.pinger = setInterval(()=>this.ping(),10000);
    window.addEventListener('online',()=>this.reconnectNow());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.reconnectNow();else this.queue=[];});
  }
  update(state, detail) {this.state=state;this.h.state?.(state,detail);}
  async create() {
    this.stop(); this.update('connecting');
    try {
      const response = await fetch('./api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('create');
      this.session=await response.json();storage.set(this.session);this.connect();
    } catch {this.update('error','宇宙をつくれませんでした。少し待って、もういちど。');}
  }
  join(room,key) {this.stop();this.session={room,invite:key};storage.set(null);this.connect();}
  resume() {if(this.session?.resume)this.connect();}
  connect() {
    clearTimeout(this.retry);if(!this.session)return;
    const generation=++this.generation;
    const url=new URL('./socket',location.href);url.hash='';url.search='';url.protocol=location.protocol==='https:'?'wss:':'ws:';
    this.update('connecting');this.queue=[];
    const ws=new WebSocket(url);this.ws=ws;
    ws.onopen=()=>{
      if(generation!==this.generation)return;
      this.lastPong=Date.now();
      this.send({t:'hello',v:PROTOCOL,room:this.session.room,kind:this.session.resume?'resume':'invite',key:this.session.resume||this.session.invite});
    };
    ws.onmessage=e=>{
      if(generation!==this.generation)return;
      let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.t==='joined') {
        this.session={...this.session,memberId:m.id,resume:m.resume||this.session.resume,host:m.host};storage.set(this.session);
        this.id=m.id;this.seq=0;this.attempt=0;this.offset=m.now-Date.now();this.update('joined');this.h.joined?.(m);this.ping();return;
      }
      if(m.t==='waiting')return this.update('waiting',m.code);
      if(m.t==='roster')return this.h.roster?.(m);
      if(m.t==='requests')return this.h.requests?.(m.requests);
      if(m.t==='pong') {
        const rtt=Date.now()-m.at;if(rtt>=0&&rtt<2000)this.offset=m.now-(m.at+Date.now())/2;
        this.lastPong=Date.now();return;
      }
      if(m.t==='batch' && Number.isInteger(m.slot) && m.slot>=0 && m.slot<8 && typeof m.id==='string' && cleanBatch(m.events) && Number.isFinite(m.at)) {
        // Never replay delayed sound on foreground/resume. Live drawing can continue immediately.
        const late=Date.now()+this.offset-m.at;
        if(late>600)m.events=m.events.filter(e=>e.t!=='note');
        this.h.events?.(m,this.id,Math.max(0,Math.min(.5,(m.at-Date.now()-this.offset)/1000)));return;
      }
      if(['error','ended','denied'].includes(m.t)) {
        this.stop();this.session=null;storage.set(null);this.h.roster?.({members:[],locked:false});
        this.update('error',m.t==='denied'?'今回は参加できませんでした。おとなと確認してね。':'この宇宙はおやすみ中です。新しい宇宙をつくってね。');
      }
    };
    ws.onclose=()=>{
      if(generation!==this.generation||!this.session)return;
      this.queue=[];this.update('reconnecting');
      const wait=Math.min(15000,500*2**this.attempt++)+Math.random()*300;
      this.retry=setTimeout(()=>this.connect(),wait);
    };
    ws.onerror=()=>{};
  }
  reconnectNow() {
    if(!this.session)return;
    if(this.ws?.readyState===WebSocket.OPEN && Date.now()-this.lastPong<25000)this.ping();
    else {this.generation++;this.ws?.close();this.connect();}
  }
  ping() {
    if(this.state==='joined') {
      if(Date.now()-this.lastPong>35000){this.reconnectNow();return;}
      this.send({t:'ping',at:Date.now()});
    }
  }
  send(data) {if(this.ws?.readyState===WebSocket.OPEN){this.ws.send(JSON.stringify(data));return true;}return false;}
  emit(e) {
    if(this.state!=='joined'||this.ws?.readyState!==WebSocket.OPEN||this.ws.bufferedAmount>32768)return false;
    if(this.queue.length>=16)this.flush();
    this.queue.push(e);return true;
  }
  flush() {
    if(this.queue.length && this.state==='joined')this.send({t:'batch',seq:this.seq++,events:this.queue.splice(0,16)});
    else this.queue=[];
  }
  stop() {this.generation++;clearTimeout(this.retry);this.ws?.close();this.ws=null;this.queue=[];}
  leave() {this.send({t:this.session?.host?'close':'leave'});this.stop();this.session=null;storage.set(null);this.h.roster?.({members:[],locked:false});this.update('solo');}
  inviteURL() {if(!this.session?.invite)return '';const url=new URL(location.href);url.hash=`room=${this.session.room}&key=${this.session.invite}`;url.search='';return url.href;}
}
