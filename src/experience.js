import { COLORS, SYMBOLS } from './protocol.js';
export function createExperience({ emit = () => false } = {}) {
  const $ = id => document.getElementById(id);
  const root = $('universe'), canvas = $('sky'), ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const friends = [...document.querySelectorAll('.friend')];
  const familyButtons = [...document.querySelectorAll('.family-star')];
  const colors = ['#f5bd9e', '#f6dfa9', '#a9d6c9', '#b8c9ef', '#e3bce3'];
  const notes = [293.665, 329.628, 369.994, 440, 493.883, 587.33, 659.255, 739.989];
  let phase = 'welcome', awake = new Set(), lit = new Set();
  let width = 1, height = 1, dpr = 1, stars = [], particles = [], ink = [], rings = [];
  let soundEnabled = false, audio = null, master = null, lastNote = 0, noteIndex = 0;
  let lastFrame = 0, elapsed = 0, drawCount = 0, active = new Map(), completeTimer = null;
  let whaleTimer = null, running = true, raf = null, hiddenAt = 0;
  let playerSlot = null, voices = 0;
  const remoteHeads = new Map();
  const melodyTimers = new Set();

  const animal = (kind) => {
    const shade = ['#eab19b','#eeddb7','#a6cfc1'][kind];
    const ears = kind === 0
      ? '<path d="M26 48L18 12Q43 15 48 39M72 39Q82 13 101 13L95 55" fill="#e8a18b"/><path d="M29 37L26 22L42 38M80 38L96 23L91 43" fill="#f8dcc0"/>'
      : kind === 1
      ? '<ellipse cx="43" cy="24" rx="12" ry="26" transform="rotate(-9 43 24)" fill="#eeddb7"/><ellipse cx="76" cy="23" rx="11" ry="27" transform="rotate(11 76 23)" fill="#eeddb7"/><ellipse cx="43" cy="23" rx="5" ry="16" fill="#dfb8ac"/><ellipse cx="76" cy="23" rx="4" ry="17" fill="#dfb8ac"/>'
      : '<circle cx="29" cy="35" r="17" fill="#91bdaf"/><circle cx="91" cy="35" r="17" fill="#91bdaf"/><circle cx="29" cy="35" r="9" fill="#cce3ce"/><circle cx="91" cy="35" r="9" fill="#cce3ce"/>';
    return `<svg viewBox="0 0 120 135" aria-hidden="true"><ellipse cx="60" cy="125" rx="31" ry="5" fill="#080e2022"/><ellipse cx="60" cy="100" rx="29" ry="30" fill="${shade}"/><ellipse cx="60" cy="105" rx="18" ry="20" fill="#f6e8cb"/><ellipse cx="37" cy="121" rx="13" ry="8" fill="${shade}"/><ellipse cx="83" cy="121" rx="13" ry="8" fill="${shade}"/>${ears}<ellipse cx="60" cy="62" rx="43" ry="35" fill="${shade}"/>${kind===0?'<path d="M19 62Q38 50 59 75Q82 49 101 61Q97 91 60 95Q26 91 19 62" fill="#f7e8cf"/>':'<ellipse cx="60" cy="77" rx="23" ry="14" fill="#f7e8cf"/>'}<g class="closed-eyes" fill="none" stroke="#4b4644" stroke-width="2.8" stroke-linecap="round"><path d="M35 61q7 6 14 0M72 61q7 6 14 0"/></g><g class="open-eyes" fill="#3e4243"><ellipse cx="42" cy="61" rx="3.7" ry="5.3"/><ellipse cx="79" cy="61" rx="3.7" ry="5.3"/><circle cx="43" cy="59" r="1.2" fill="#fff7e5"/><circle cx="80" cy="59" r="1.2" fill="#fff7e5"/></g><ellipse cx="60" cy="73" rx="4" ry="3" fill="#5e5350"/><path d="M60 76v4m-6-1q6 7 12 0" fill="none" stroke="#705952" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="30" cy="75" rx="7" ry="4" fill="#e7a8a2" opacity=".65"/><ellipse cx="91" cy="75" rx="7" ry="4" fill="#e7a8a2" opacity=".65"/><path d="M35 93Q60 103 85 93" fill="none" stroke="${['#c68276','#a6b6cb','#7ba99c'][kind]}" stroke-width="5"/><path d="M61 97v13" stroke="${['#c68276','#a6b6cb','#7ba99c'][kind]}" stroke-width="6"/></svg>`;
  };
  friends.forEach((b,i) => b.querySelector('.critter').innerHTML = animal(i));

  function resize() {
    const rect = root.getBoundingClientRect();
    width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    let seed = 271828;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    stars = Array.from({length:width < 600 ? 105 : 190},()=>({x:rand(),y:rand(),r:.3+rand()*1.25,a:.16+rand()*.55,p:rand()*6.28}));
  }
  new ResizeObserver(resize).observe(root);
  resize();

  function ensureAudio() {
    if (!soundEnabled) return;
    try {
      if (!audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) {soundEnabled = false; updateSound(); return;}
        audio = new Audio(); master = audio.createGain(); master.gain.value = .15; master.connect(audio.destination);
      }
      if(audio.state === 'suspended' || audio.state === 'interrupted') audio.resume().catch(() => {});
    } catch (_) {soundEnabled=false;updateSound();}
  }
  function tone(freq, delay=0, length=.9, gain=.35) {
    if(!soundEnabled) return;
    ensureAudio();
    if(!audio || !master || audio.state !== 'running' || voices >= 32) return;
    voices++;
    canvas.dataset.notesPlayed = String(Number(canvas.dataset.notesPlayed || 0) + 1);
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator(), amp=audio.createGain();
    osc.type='sine';osc.frequency.value=freq;
    amp.gain.setValueAtTime(.0001,t);amp.gain.exponentialRampToValueAtTime(gain,t+.018);amp.gain.exponentialRampToValueAtTime(.0001,t+length);
    osc.connect(amp);amp.connect(master);osc.start(t);osc.stop(t+length+.03);
    osc.onended=()=>{voices--;osc.disconnect();amp.disconnect();};
  }
  function playNote(index, delay=0) {tone(notes[index%8],delay,.7,.26);tone(notes[(index+2)%8],delay+.08,.65,.10);}
  function chime(index=0) {if(!emit({t:'note',n:index%8}))playNote(index);}
  function melody() { [0,2,3,4,5,4,3,2,0].forEach((n,i)=>{const timer=setTimeout(()=>{melodyTimers.delete(timer);chime(n);},i*220);melodyTimers.add(timer);}); }
  function updateSound(){
    $('sound').setAttribute('aria-pressed',String(soundEnabled));
    $('sound').setAttribute('aria-label',soundEnabled?'音をオフにする':'音をオンにする');
    $('sound-text').textContent=soundEnabled?'音 ON':'音 OFF';
  }
  $('sound').addEventListener('click',()=>{
    if(soundEnabled && audio && audio.state!=='running'){unlock();return;}
    soundEnabled=!soundEnabled; updateSound();
    if(soundEnabled){ensureAudio();chime(0);}else if(audio && master){master.gain.cancelScheduledValues(audio.currentTime);master.gain.setValueAtTime(0,audio.currentTime);}
    if(soundEnabled && master)master.gain.setValueAtTime(.15,audio.currentTime);
  });

  const center = el => {const r=el.getBoundingClientRect(), b=root.getBoundingClientRect();return {x:(r.left+r.width/2-b.left)/width,y:(r.top+r.height/2-b.top)/height};};
  function sparkle(x,y,n=20,color=colors[noteIndex%colors.length]) {
    for(let i=0;i<(reduceMotion?Math.min(n,5):n);i++){
      const angle=Math.random()*Math.PI*2, speed=14+Math.random()*75;
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-12,life:1.3+Math.random()*.9,age:0,r:1+Math.random()*2.4,c:color});
    }
    if(particles.length>300)particles.splice(0,particles.length-300);
    rings.push({x,y,age:0});if(rings.length>15)rings.shift();
  }
  function starShape(x,y,r,color,alpha=1) {
    ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();
    ctx.moveTo(0,-r);ctx.quadraticCurveTo(r*.22,-r*.22,r,0);ctx.quadraticCurveTo(r*.22,r*.22,0,r);ctx.quadraticCurveTo(-r*.22,r*.22,-r,0);ctx.quadraticCurveTo(-r*.22,-r*.22,0,-r);ctx.fill();ctx.restore();
  }
  function addInk(x,y,join=false,pointerGroup=null) {
    const prev = ink.at(-1); const group = pointerGroup ?? (join && prev ? prev.group : ++strokeGroup);
    ink.push({x,y,age:0,c:playerSlot===null?colors[(noteIndex++)%colors.length]:COLORS[playerSlot],group,r:1.5+Math.random()*2.5});
    if(ink.length>1200)ink.splice(0,ink.length-1200);
    canvas.dataset.points = String(Number(canvas.dataset.points || 0) + 1);
    emit({t:'point',x,y,s:String(group)});
    drawCount++;
    if(drawCount===12){$('status').textContent='わあ。きみだけの ほしのみち！'; sailWhale();}
    const now=performance.now();
    if(now-lastNote>140){chime(Math.max(0,Math.min(7,Math.floor((1-y)*8))));lastNote=now;}
    sparkle(x,y,join?2:14,colors[noteIndex%colors.length]);
  }
  let strokeGroup=0;
  canvas.addEventListener('pointerdown',e=>{
    if(phase!=='draw'&&phase!=='free')return;
    e.preventDefault();ensureAudio();canvas.setPointerCapture(e.pointerId);
    const r=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-r.left)/width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/height));
    const group=(++strokeGroup).toString(36)+'-'+Math.floor(performance.now()).toString(36);active.set(e.pointerId,{x,y,group});addInk(x,y,false,group);
  });
  canvas.addEventListener('pointermove',e=>{
    const p=active.get(e.pointerId);if(!p)return;e.preventDefault();
    const r=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-r.left)/width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/height));
    if(Math.hypot((x-p.x)*width,(y-p.y)*height)<13)return;
    addInk(x,y,true,p.group);p.x=x;p.y=y;
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,e=>active.delete(e.pointerId)));

  function animate(t) {
    if(!running)return;
    const dt=Math.min((t-(lastFrame||t))/1000,.04);lastFrame=t;elapsed+=dt;
    ctx.clearRect(0,0,width,height);
    stars.forEach(s=>{
      const opacity=s.a*(reduceMotion?1:(.77+.23*Math.sin(elapsed*.65+s.p)));
      ctx.globalAlpha=opacity;ctx.fillStyle='#e8e2d8';ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,Math.PI*2);ctx.fill();
    });ctx.globalAlpha=1;
    if(phase==='family'){
      const halo=ctx.createRadialGradient(width*.5,height*.62,0,width*.5,height*.62,width*.6);
      halo.addColorStop(0,'#b68e4820');halo.addColorStop(1,'#b68e4800');ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
    }
    const strokeEnds=new Map();
    ink.forEach((p,i)=>{
      p.age+=dt;const a=Math.max(0,1-p.age/48);
      if(strokeEnds.has(p.group)){const prev=strokeEnds.get(p.group);ctx.beginPath();ctx.moveTo(prev.x*width,prev.y*height);ctx.lineTo(p.x*width,p.y*height);ctx.strokeStyle=p.c;ctx.globalAlpha=a*.32;ctx.lineWidth=1;ctx.stroke();}
      starShape(p.x*width,p.y*height,p.r,p.c,a*.85);strokeEnds.set(p.group,p);
    });ink=ink.filter(p=>p.age<48);ctx.globalAlpha=1;
    particles.forEach(p=>{
      p.age+=dt; if(!reduceMotion){p.x+=p.vx*dt/width;p.y+=p.vy*dt/height;p.vy+=12*dt;}
      starShape(p.x*width,p.y*height,p.r,p.c,Math.max(0,1-p.age/p.life));
    });particles=particles.filter(p=>p.age<p.life);
    rings.forEach(r=>{
      r.age+=dt;ctx.strokeStyle='#f0dcb5';ctx.globalAlpha=Math.max(0,.22*(1-r.age/1.2));ctx.lineWidth=1;ctx.beginPath();ctx.arc(r.x*width,r.y*height,reduceMotion?20:9+r.age*39,0,Math.PI*2);ctx.stroke();
    });rings=rings.filter(r=>r.age<1.2);ctx.globalAlpha=1;
    for(const [id,head] of remoteHeads){if(t-head.time>2500){head.el.remove();remoteHeads.delete(id);}}
    if(phase==='ending'){
      const points=width<600?[[.28,.58],[.5,.52],[.72,.58],[.63,.68],[.37,.68]]:[[.37,.59],[.5,.52],[.63,.59],[.58,.7],[.42,.7]];
      ctx.strokeStyle='#f8dfab';ctx.globalAlpha=.38;ctx.lineWidth=1;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*width,y*height):ctx.moveTo(x*width,y*height));ctx.closePath();ctx.stroke();ctx.globalAlpha=1;
      points.forEach(([x,y],i)=>{
        const glow=ctx.createRadialGradient(x*width,y*height,1,x*width,y*height,24);glow.addColorStop(0,'#f9dda952');glow.addColorStop(1,'#f9dda900');ctx.fillStyle=glow;ctx.fillRect(x*width-24,y*height-24,48,48);
        starShape(x*width,y*height,reduceMotion?6:6+Math.sin(elapsed+i)*1.3,'#ffe8ba');
      });
    }
    raf=requestAnimationFrame(animate);
  }
  raf=requestAnimationFrame(animate);

  function setPhase(next) {
    phase=next;root.dataset.phase=next;active.clear();
    $('welcome').hidden=next!=='welcome';$('journey').hidden=['welcome','ending'].includes(next);$('ending').hidden=next!=='ending';
    $('friends').hidden=next==='family';$('family').hidden=next!=='family';$('free-tools').hidden=next!=='free';
    $('restart').hidden=next==='welcome';$('add-star').hidden=next!=='draw';$('next').hidden=true;
    $('chapter-dots').hidden=next==='free';
    $('whale').hidden=true;$('whale').classList.remove('sailing');
    $('status').textContent='';$('footer-label').textContent=next==='welcome'?'MADE WITH CURIOSITY & A LITTLE MAGIC':'A LITTLE UNIVERSE, A MOMENT TOGETHER';
    const chapter={wake:0,draw:1,family:2}[next];
    [...$('chapter-dots').children].forEach((e,i)=>e.classList.toggle('on',i===chapter));
    if(next!=='welcome'){
      const target=next==='ending'?$('ending-title'):$('chapter-title');
      target.focus({preventScroll:true});
      target.classList.remove('enter');void target.offsetWidth;target.classList.add('enter');
    }
  }
  function unlock() { soundEnabled=true;updateSound();ensureAudio();if(audio&&master)master.gain.setValueAtTime(.15,audio.currentTime); }
  function start() {
    unlock();setPhase('wake');
    $('chapter-kicker').textContent='01 / めざめ';$('chapter-title').innerHTML='ほしの なかに、<br>だれか いる。';
    $('chapter-hint').textContent='まあるい ほしを、さわってみて。';
    $('status').textContent='ゆっくりで、だいじょうぶ。';
    chime(0);
  }
  $('start').addEventListener('click',start);
  const friendNames=['きつね','うさぎ','くま'];
  const greetings=['おはよう。いっしょに あそぼ！','ぴょん。うちゅうに とどくかな？','くまも、つれていって。'];
  friends.forEach((button,i)=>button.addEventListener('click',()=>{
    ensureAudio();const p=center(button);sparkle(p.x,p.y,32,colors[i]);chime(i*2);
    button.classList.remove('popped');void button.offsetWidth;button.classList.add('popped');
    if(phase==='wake'){
      awake.add(i);button.classList.add('awake');button.setAttribute('aria-pressed','true');button.setAttribute('aria-label',friendNames[i]+'とあそぶ');button.querySelector('.friend-name').textContent=friendNames[i];
      $('status').textContent=greetings[i];
      if(awake.size===3){$('chapter-title').innerHTML='みんな、<br>おはよう。';$('status').textContent='3にんで、うちゅうに しゅっぱつ！';$('next').hidden=false;$('next').innerHTML='ほしの みちを つくる <span aria-hidden="true">↗</span>';}
    }else if(phase==='draw'||phase==='free'){
      $('status').textContent=['きらきら、みつけた！','ぴょーん。ほしまで ひとっとび。','すてきな みちが できたね。'][i];
      for(let j=0;j<6;j++)addInk(.25+Math.random()*.5,.38+Math.random()*.22,false);
    }
  }));

  function drawChapter() {
    setPhase('draw');$('chapter-kicker').textContent='02 / ほしのおえかき';$('chapter-title').innerHTML='ゆびの さきに、<br>ほしの みち。';$('chapter-hint').textContent='すきなところを、なぞってみて。';
    $('status').textContent='ぽん、と さわるだけでも いいよ。';$('next').hidden=false;$('next').innerHTML='みんなで ひかろう <span aria-hidden="true">↗</span>';
  }
  function familyChapter() {
    setPhase('family');ink=[];$('chapter-kicker').textContent='03 / いっしょに';$('chapter-title').innerHTML='みんなの ほしを、<br>つなげよう。';$('chapter-hint').textContent='5つの ほしを、ひとつずつ さわってね。';
    $('status').textContent='ひとりで さわっても、いっしょに さわっても。';chime(3);
  }
  $('next').addEventListener('click',()=>{if(phase==='wake')drawChapter();else if(phase==='draw')familyChapter();});
  $('add-star').addEventListener('click',()=>{ensureAudio();for(let i=0;i<4;i++)addInk(.15+Math.random()*.7,.38+Math.random()*.25,false);});
  function lightFamily(button,i) {
    if(phase!=='family'||lit.has(i))return;
    lit.add(i);button.setAttribute('aria-pressed','true');const p=center(button);sparkle(p.x,p.y,32,colors[i]);chime(i);
    $('status').textContent='ひとつ、また ひとつ。あったかい ひかり。';
    if(lit.size===5){
      $('family').classList.add('complete');$('chapter-title').innerHTML='つながった。';$('chapter-hint').textContent='この ほしぞらの なまえは……';$('status').textContent='';melody();
      completeTimer=setTimeout(showEnding,2400);
    }
  }
  familyButtons.forEach((button,i)=>{
    button.addEventListener('pointerdown',e=>{if(e.button===0)lightFamily(button,i);});
    button.addEventListener('click',()=>lightFamily(button,i));
  });
  function showEnding() {
    clearTimeout(completeTimer);setPhase('ending');ink=[];
    for(let i=0;i<7;i++)sparkle(.2+Math.random()*.6,.4+Math.random()*.35,16,colors[i%5]);
  }
  function sailWhale() {
    clearTimeout(whaleTimer);$('whale').hidden=false;$('whale').classList.remove('sailing');void $('whale').offsetWidth;$('whale').classList.add('sailing');
    whaleTimer=setTimeout(()=>{$('whale').hidden=true;$('whale').classList.remove('sailing');},8000);
  }
  function freePlay() {
    setPhase('free');$('chapter-kicker').textContent='AFTER THE LITTLE JOURNEY';$('chapter-title').innerHTML='うちゅうの つづき、<br>どうぞ。';$('chapter-hint').textContent='なぞって、さわって。じゆうに あそぼう。';friends.forEach(b=>b.classList.add('awake'));sailWhale();
  }
  $('free-play').addEventListener('click',freePlay);
  $('quick-play').addEventListener('click',()=>{unlock();freePlay();});
  $('comet').addEventListener('click',()=>{sailWhale();chime(2);emit({t:'whale'});});
  $('finish').addEventListener('click',showEnding);
  $('letter-open').addEventListener('click',()=>{$('letter').showModal();});
  $('letter-close').addEventListener('click',()=>{$('letter').close();});
  $('letter').addEventListener('click',e=>{if(e.target===$('letter')){const r=$('letter').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('letter').close();}});
  $('restart').addEventListener('click',()=>{
    clearTimeout(completeTimer);clearTimeout(whaleTimer);for(const t of melodyTimers)clearTimeout(t);melodyTimers.clear();awake.clear();lit.clear();ink=[];particles=[];rings=[];drawCount=0;
    friends.forEach((b,i)=>{b.classList.remove('awake','popped');b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',friendNames[i]+'のほしを起こす');b.querySelector('.friend-name').textContent='…？';});
    familyButtons.forEach(b=>b.setAttribute('aria-pressed','false'));$('family').classList.remove('complete');setPhase('welcome');$('start').focus({preventScroll:true});
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){running=false;cancelAnimationFrame(raf);active.clear();hiddenAt=performance.now();if(audio)audio.suspend().catch(()=>{});}
    else {if(soundEnabled && audio && audio.state!=='running')$('sound-text').textContent='♪ タップで再開';running=true;lastFrame=0;if(performance.now()-hiddenAt>60000){particles=[];rings=[];}raf=requestAnimationFrame(animate);}
  });

  root.addEventListener('selectstart', e => e.preventDefault());
  root.addEventListener('contextmenu', e => e.preventDefault());
  root.addEventListener('dragstart', e => e.preventDefault());
  return {
    unlock, freePlay,
    setSlot(slot) { playerSlot=slot; },
    setLocalNames(names) {
      familyButtons.forEach((b,i)=>b.lastElementChild.textContent=names[i]);
      document.querySelector('.family-names').textContent=names.join('・');
    },
    receive(message, self, delay) {
      for(const e of message.events) {
        if(e.t==='note') {if(!document.hidden)playNote(e.n,delay);continue;}
        if(message.id===self)continue;
        if(e.t==='whale'){sailWhale();continue;}
        if(e.t==='point') {
          const color=COLORS[message.slot];
          ink.push({x:e.x,y:e.y,age:0,c:color,group:message.id+':'+e.s,r:2.8});
          if(ink.length>1200)ink.splice(0,ink.length-1200);
          sparkle(e.x,e.y,2,color);
          canvas.dataset.remotePoints=String(Number(canvas.dataset.remotePoints||0)+1);
          let head=remoteHeads.get(message.id);
          if(!head){const el=document.createElement('span');el.className='visitor';el.textContent=SYMBOLS[message.slot];$('visitors').append(el);head={el};remoteHeads.set(message.id,head);}
          head.time=performance.now();head.el.style.left=(e.x*100)+'%';head.el.style.top=(e.y*100)+'%';
        }
      }
    }
  };
}
