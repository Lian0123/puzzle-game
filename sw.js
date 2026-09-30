// Increment CACHE and VERSION whenever the app shell or bundled assets change.
const CACHE='shijing-v9';
const VERSION='9';
const sceneImages=Array.from({length:100},(_,i)=>`./assets/landscape-${String(i+1).padStart(2,'0')}.jpg`);
const assets=['./','./index.html','./style.css','./map.css','./script.js','./manifest.webmanifest',`./sw.js?v=${VERSION}`,'./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png',...sceneImages];
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
  const request=event.request,url=new URL(request.url);
  const appShell=request.mode==='navigate'||/\/(index\.html|script\.js|style\.css|map\.css|manifest\.webmanifest|sw\.js)$/.test(url.pathname);
  if(appShell){
    event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
      return response;
    }).catch(()=>caches.match(request).then(cached=>cached||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
