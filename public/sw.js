const CACHE='pocket-cosmos-p2p-v1';
const APP=['./','./index.html','./app.js','./style.css','./p2p.css','./assets/cosmos.webp','./assets/planet.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(APP)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate') {
    event.respondWith(fetch(event.request).then(resp=>{
      if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}
      return resp;
    }).catch(()=>caches.match('./index.html')));
  } else {
    event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
  }
});
