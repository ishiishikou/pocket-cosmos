import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { createExperience } from './experience.js';
import { LocalPeer } from './p2p-session.js';

const $ = id => document.getElementById(id);
const defaults = ['きつね','うさぎ','くま','ことり','くじら'];
const safeNames = list => defaults.map((name,i) => typeof list?.[i] === 'string'
  ? list[i].replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0,16) || name : name);
let names;
try { names = safeNames(JSON.parse(localStorage.getItem('cosmos-names'))); }
catch { names = [...defaults]; }
let peer;
const experience = createExperience({emit:event => peer?.emit(event) ?? false});
experience.setLocalNames(names);
const room = $('room-dialog');
room.innerHTML = [
  '<button id="p2p-close" class="close-button" type="button" aria-label="設定を閉じる">×</button>',
  '<p class="eyebrow">DIRECT FAMILY UNIVERSE</p>',
  '<h2 id="room-title">おなじ宇宙で、あそぼう。</h2>',
  '<p class="privacy-note">サーバーなし・近くのiPhone 2台でつながる実験モード。ネットはアプリの読込だけに使います。</p>',
  '<p id="connection-status" role="status" aria-live="polite">どちらのiPhoneからはじめる？</p>',
  '<div id="p2p-actions">',
  '<button id="p2p-host" type="button" class="primary">① おとなが宇宙をつくる</button>',
  '<button id="p2p-guest" type="button" class="secondary p2p-wide">① こどもが参加する</button></div>',
  '<div id="p2p-signal" hidden><p id="p2p-instruction"></p>',
  '<canvas id="p2p-qr" aria-label="接続情報のQRコード"></canvas>',
  '<textarea id="p2p-outgoing" readonly rows="3" aria-label="このiPhoneが作った接続コード"></textarea>',
  '<button id="p2p-copy" type="button" class="secondary p2p-wide">このコードをコピー</button>',
  '<div class="p2p-separator">↓ 相手のiPhoneのコードを受け取る ↓</div></div>',
  '<div id="p2p-import" hidden><button id="p2p-scan" type="button" class="primary">QRコードを読み取る</button>',
  '<div id="p2p-camera" hidden><video id="p2p-video" muted playsinline autoplay></video>',
  '<button id="p2p-cancel-scan" type="button" class="secondary p2p-wide">カメラを閉じる</button></div>',
  '<label for="p2p-incoming">QRが読めない場合は相手のコードを貼り付け</label>',
  '<textarea id="p2p-incoming" rows="3" placeholder="pc1.から始まるコード" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>',
  '<button id="p2p-apply" type="button" class="secondary p2p-wide">貼り付けたコードを使う</button></div>',
  '<div id="p2p-connected" hidden><strong class="p2p-online">✦ 直接つながった！</strong>',
  '<p>家族の画面を閉じて、自由になぞってみてね。音は各iPhoneから鳴ります。</p></div>',
  '<button id="p2p-reset" type="button" class="text-button p2p-wide" hidden>接続をやり直す</button>',
  '<details id="local-settings"><summary>このiPhoneの、ほしのなまえ</summary>',
  '<p>名前はこの端末の中にだけ保存され、通信しません。</p><form id="names-form">',
  '<div id="name-fields"></div><button class="secondary" type="submit">なまえを保存</button></form></details>',
  '<p class="privacy-note">接続コードには端末のネットワーク候補が含まれます。近くの相手にだけ見せてください。直接接続できないWi-Fiやテザリング環境もあります。</p>'
].join('');
const status = message => $('connection-status').textContent=message;
let scanStream, scanToken=0, busy=false, role=null;
function closeScanner() {
  ++scanToken;
  if(scanStream){for(const track of scanStream.getTracks())track.stop();scanStream=null;}
  $('p2p-video').srcObject=null;$('p2p-camera').hidden=true;
}
function resetUI() {
  closeScanner();peer.reset();role=null;busy=false;
  $('p2p-actions').hidden=false;
  $('p2p-signal').hidden=true;$('p2p-import').hidden=true;
  $('p2p-connected').hidden=true;$('p2p-reset').hidden=true;
  $('p2p-incoming').value='';$('p2p-outgoing').value='';
  $('crew-bar').replaceChildren();$('universe').dataset.connection='solo';
  status('どちらのiPhoneからはじめる？');
}
function showConnected(){
  closeScanner();
  $('p2p-actions').hidden=true;$('p2p-import').hidden=true;$('p2p-signal').hidden=true;
  $('p2p-connected').hidden=false;$('p2p-reset').hidden=false;
  $('universe').dataset.connection='joined';$('crew-bar').replaceChildren();
  for(const [symbol,label] of [['🦊','じぶん'],['🐰','相手']]){
    const el=document.createElement('span');el.className='crew-member';
    el.textContent=symbol;el.setAttribute('aria-label',label);$('crew-bar').append(el);
  }
  experience.setSlot(role==='host'?0:1);
  experience.freePlay();
  status('直接接続中（通信サーバーは使っていません）');
  room.close();
}
peer = new LocalPeer({
  onState(state,detail){
    if(state==='connected')showConnected();
    if(state==='disconnected'){
      status(detail||'接続が切れました');$('p2p-reset').hidden=false;
      $('universe').dataset.connection='error';
      if(!room.open)room.showModal();
    }
  },
  onMessage(events){ experience.receive({events,id:'other-phone',slot:role==='host'?1:0},null,0.035); }
});
async function showCode(code,message){
  $('p2p-outgoing').value=code;$('p2p-instruction').textContent=message;
  $('p2p-signal').hidden=false;
  try{
    await QRCode.toCanvas($('p2p-qr'),code,{errorCorrectionLevel:'L',margin:2,width:320});
    $('p2p-qr').hidden=false;
  }catch{
    $('p2p-qr').hidden=true;
    status('この接続情報はQRに収まりません。コピーして相手に渡してください。');
  }
}
async function startHost(){
  if(busy)return;
  experience.unlock(); // iOS Web Audio must be enabled in an explicit user gesture.
  busy=true;role='host';$('p2p-actions').hidden=true;$('p2p-reset').hidden=false;
  status('親の接続コードを作っています…');
  try{
    const code=await peer.createOffer();
    await showCode(code,'② こどものiPhoneで「QRコードを読み取る」を押して、このコードを読み取ります。');
    $('p2p-import').hidden=false;
    status('子どものiPhoneに表示された「返事のQR」を読み取ってください。');
  }catch(e){status('作成できませんでした: '+e.message);}
  finally{busy=false;}
}
function startGuest(){
  if(busy)return;
  experience.unlock();
  role='guest';$('p2p-actions').hidden=true;$('p2p-reset').hidden=false;
  $('p2p-import').hidden=false;status('② 親のiPhoneにあるQRコードを読み取ってください。');
}
async function processIncoming(code){
  if(busy||!role)return;
  busy=true;closeScanner();status('接続情報を処理しています…');
  try{
    if(role==='guest'){
      const answer=await peer.answerOffer(code);
      await showCode(answer,'③ 親のiPhoneで、この「返事のQR」を読み取ってください。');
      $('p2p-import').hidden=true;
      status('親のiPhoneが返事を読み取るとつながります。');
    }else{
      await peer.acceptAnswer(code);
      $('p2p-import').hidden=true;$('p2p-signal').hidden=true;
      status('相手のiPhoneとの直接接続を待っています…');
      const pc=peer.pc;
      setTimeout(()=>{
        if(peer.pc===pc&&peer.state!=='connected'){
          status('接続できません。同じWi-Fiに接続して、もう一度やり直してください。');
          $('p2p-reset').hidden=false;
        }
      },15000);
    }
  }catch(e){status('読み取れませんでした: '+e.message);$('p2p-import').hidden=false;}
  finally{busy=false;}
}
async function startScanner(){
  if(scanStream||!role||busy)return;
  if(!navigator.mediaDevices?.getUserMedia){
    status('カメラが使えません。HTTPSで開くか、コードを貼り付けてください。');return;
  }
  try{
    scanStream=await navigator.mediaDevices.getUserMedia({
      audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}
    });
    const video=$('p2p-video');$('p2p-camera').hidden=false;
    video.srcObject=scanStream;await video.play();
    const token=++scanToken,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    async function scan(){
      if(token!==scanToken||!scanStream)return;
      if(video.readyState>=2&&video.videoWidth>0){
        const w=560,h=Math.max(1,Math.round(w*video.videoHeight/video.videoWidth));
        canvas.width=w;canvas.height=h;ctx.drawImage(video,0,0,w,h);
        const frame=ctx.getImageData(0,0,w,h);
        const decoded=jsQR(frame.data,w,h,{inversionAttempts:'dontInvert'});
        if(decoded?.data?.startsWith('pc1.')){
          $('p2p-incoming').value=decoded.data;await processIncoming(decoded.data);return;
        }
      }
      setTimeout(scan,180);
    }
    scan();
  }catch{closeScanner();status('カメラを開始できません。Safariの許可を確認するかコードを貼り付けてください。');}
}
$('together').onclick=()=>room.showModal();
$('approval-notice').hidden=true;
$('p2p-close').onclick=()=>{closeScanner();room.close();};
$('p2p-host').onclick=startHost;$('p2p-guest').onclick=startGuest;
$('p2p-reset').onclick=resetUI;$('p2p-scan').onclick=startScanner;
$('p2p-cancel-scan').onclick=closeScanner;
$('p2p-apply').onclick=()=>processIncoming($('p2p-incoming').value);
$('p2p-copy').onclick=async()=>{
  try{await navigator.clipboard.writeText($('p2p-outgoing').value);status('コピーしました。相手のiPhoneに渡してください。');}
  catch{$('p2p-outgoing').focus();$('p2p-outgoing').select();status('長押ししてコピーしてください。');}
};
names.forEach((name,i)=>{
  const label=document.createElement('label');label.textContent=['🦊','🐰','🐻','🐥','🐳'][i]+' のほし';
  const input=document.createElement('input');input.id='star-name-'+i;input.maxLength=16;
  input.value=name;input.autocomplete='off';label.append(input);$('name-fields').append(label);
});
$('names-form').onsubmit=e=>{
  e.preventDefault();names=safeNames(defaults.map((_,i)=>$('star-name-'+i).value));
  experience.setLocalNames(names);
  try{localStorage.setItem('cosmos-names',JSON.stringify(names));}catch{}
  status('この端末だけに名前を保存しました。');
};
window.addEventListener('pagehide',closeScanner);
if('serviceWorker' in navigator&&location.protocol==='https:'){
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
}
