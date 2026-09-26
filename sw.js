const CACHE='shijing-v4';
const sceneImages=Array.from({length:20},(_,i)=>`./assets/landscape-${String(i+1).padStart(2,'0')}.jpg`);
const assets=['./','./index.html','./style.css','./script.js','./manifest.webmanifest','./sw.js','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png',...sceneImages];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(assets)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('shijing-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
    .then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true}))
    .then(clients=>clients.forEach(client=>client.postMessage({type:'OFFLINE_STATUS',ready:true}))));
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='CHECK_OFFLINE')return;
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(assets.map(path=>cache.match(new URL(path,self.registration.scope).href))))
    .then(entries=>event.source?.postMessage({type:'OFFLINE_STATUS',ready:entries.every(Boolean)})));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  })));
});
