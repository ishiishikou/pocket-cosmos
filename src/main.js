import QRCode from 'qrcode';
import { createExperience } from './experience.js';
import { CosmosSession } from './session.js';
import { ANIMALS, SYMBOLS, COLORS, validRoom, validToken } from './protocol.js';

const $=id=>document.getElementById(id);
const defaults=['きつね','うさぎ','くま','ことり','くじら'];
const normalizeNames = names => defaults.map((fallback,i)=>typeof names?.[i]==='string' ? names[i].replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16)||fallback : fallback);
let names;try{names=normalizeNames(JSON.parse(localStorage.getItem('cosmos-names')));}catch{names=[...defaults];}
let session;
const experience=createExperience({emit:e=>session?.emit(e)||false});
experience.setLocalNames(names);
let host=false,locked=false;
let invitation=null;
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('room')||fragment.has('key')) {
  if(validRoom(fragment.get('room'))&&validToken(fragment.get('key')))invitation={room:fragment.get('room'),key:fragment.get('key')};
  // The invite capability never travels in an HTTP URL, referrer or analytics.
  history.replaceState(null,'',location.pathname+location.search);
}
function roomUI(state,detail) {
  if(state==='error')invitation=null;
  const labels={solo:'ひとりでも、みんなでも。',connecting:'宇宙につないでいます…',joined:'つながった！同じ宇宙であそぼう。',waiting:`あいことばの番号は ${detail}。`,reconnecting:'つなぎなおしています。ひとりのおえかきは続けられるよ。',error:detail};
  $('connection-status').textContent=labels[state]||state;
  $('universe').dataset.connection=state;
  const live=['joined','waiting','connecting','reconnecting'].includes(state);
  $('create-panel').hidden=live||!!invitation;
  $('join-panel').hidden=!invitation||live;
  $('waiting-panel').hidden=state!=='waiting';
  if(state==='waiting')$('waiting-code').textContent=detail;
  $('leave-room').hidden=!live;
  $('invite-panel').hidden=!(host&&session?.session?.invite&&['joined','reconnecting'].includes(state));
  $('host-controls').hidden=!(host&&state==='joined');
  $('crew-bar').classList.toggle('reconnecting',state==='reconnecting');
  if(['error','solo'].includes(state)) {host=false;experience.setSlot(null);$('approval-notice').hidden=true;$('requests').replaceChildren();}
}
function renderRoster(m) {
  locked=m.locked;
  $('lock-room').setAttribute('aria-pressed',String(locked));
  $('lock-room').textContent=locked?'🔒 新しい参加を受け付ける':'🔓 新しい参加を止める';
  $('crew-bar').replaceChildren();$('member-controls').replaceChildren();
  for(const person of m.members) {
    const chip=document.createElement('span');chip.className='crew-member';chip.style.setProperty('--crew-color',COLORS[person.slot]);
    chip.classList.toggle('offline',!person.online);chip.dataset.member=person.id;
    chip.textContent=SYMBOLS[person.slot];chip.title=`${ANIMALS[person.slot]}${person.id===session.id?'（じぶん）':''}${person.online?'':'（おやすみ）'}`;chip.setAttribute('aria-label',chip.title);$('crew-bar').append(chip);
    if(host&&!person.host) {const b=document.createElement('button');b.type='button';b.className='text-button';b.textContent=`${SYMBOLS[person.slot]} ${ANIMALS[person.slot]}を退出させる`;b.onclick=()=>session.send({t:'remove',id:person.id});$('member-controls').append(b);}
  }
  $('crew-bar').setAttribute('aria-label',`参加中 ${m.members.filter(x=>x.online).length}人。色と動物で見分けられます。`);
}
session=new CosmosSession({
  state:roomUI,
  joined(m) {
    host=m.host;invitation=null;experience.setSlot(m.slot);experience.freePlay();roomUI('joined');
    $('leave-room').textContent=host?'この宇宙をおしまいにする':'この宇宙からでる';
    if(host) {const url=session.inviteURL();$('invite-url').value=url;QRCode.toCanvas($('invite-qr'),url,{width:200,margin:2,errorCorrectionLevel:'M'}).catch(()=>{$('invite-qr').hidden=true;});}
    else $('room-dialog').close();
  },
  roster:renderRoster,
  requests(requests) {
    $('requests').replaceChildren();$('approval-notice').hidden=requests.length===0;
    $('approval-notice').textContent=`✦ ${requests.length}人が まっているよ`;
    for(const request of requests) {
      const row=document.createElement('div');row.className='join-request';
      const label=document.createElement('p');label.textContent=`番号 ${request.code} の端末。家族の画面と同じ？`;row.append(label);
      const ok=document.createElement('button');ok.type='button';ok.className='primary compact';ok.textContent=`${request.code} の参加をOK`;ok.onclick=()=>session.send({t:'approve',id:request.id});
      const no=document.createElement('button');no.type='button';no.className='text-button';no.textContent='参加をことわる';no.onclick=()=>session.send({t:'deny',id:request.id});row.append(ok,no);$('requests').append(row);
    }
  },
  events:(m,id,delay)=>experience.receive(m,id,delay)
});
function openRoom() {roomUI(session.state);$('room-dialog').showModal();}
$('together').onclick=openRoom;$('approval-notice').onclick=openRoom;
$('room-close').onclick=()=>$('room-dialog').close();
$('create-room').onclick=()=>{experience.unlock();experience.freePlay();session.create();};
$('join-start').onclick=()=>{experience.unlock();experience.freePlay();session.join(invitation.room,invitation.key);};
$('leave-room').onclick=()=>{session.leave();invitation=null;roomUI('solo');};
$('lock-room').onclick=()=>session.send({t:'lock',locked:!locked});
$('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText(session.inviteURL());$('connection-status').textContent='招待をコピーしました。家族にだけ渡してね。';}catch{$('invite-url').focus();$('invite-url').select();$('connection-status').textContent='リンクを長押ししてコピーしてね。';}};
$('share-room').onclick=async()=>{if(navigator.share){try{await navigator.share({title:'いっしょに、ゆびさき宇宙旅行',url:session.inviteURL()});}catch{}}else $('copy-room').click();};
names.forEach((name,i)=>{const label=document.createElement('label');label.textContent=`${SYMBOLS[i]} のほし`;const input=document.createElement('input');input.id=`star-name-${i}`;input.maxLength=16;input.value=name;input.autocomplete='off';input.setAttribute('aria-label',`${ANIMALS[i]}のほしの名前`);label.append(input);$('name-fields').append(label);});
function saveNames(next){names=normalizeNames(next);experience.setLocalNames(names);names.forEach((name,i)=>$(`star-name-${i}`).value=name);try{localStorage.setItem('cosmos-names',JSON.stringify(names));$('connection-status').textContent='このiPhoneに、なまえを保存しました。';}catch{$('connection-status').textContent='この画面だけで、なまえを使います。';}}
$('names-form').onsubmit=e=>{e.preventDefault();saveNames(defaults.map((_,i)=>$(`star-name-${i}`).value));};
$('reset-names').onclick=()=>saveNames(defaults);
if(invitation){openRoom();}else if(session.session?.resume){session.resume();}
