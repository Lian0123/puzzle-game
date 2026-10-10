// Increment CACHE and VERSION whenever the app shell or bundled assets change.
importScripts('./game-data.js');
const CACHE='shijing-v12';
const VERSION='12';
const sceneImages=self.ShijingData.scenes.map(scene=>`./${scene.url}`);
const shell=['./','./index.html','./style.css','./map.css','./polish.css','./adventure.css','./game-data.js','./progression.js','./script.js','./manifest.webmanifest',`./sw.js?v=${VERSION}`,'./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const assets=[...shell,...sceneImages];
async function broadcast(message){const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});clients.forEach(client=>client.postMessage({...message,version:VERSION}));}
async function prepareOffline(){
  const cache=await caches.open(CACHE);
  await cache.addAll(shell);
  // Reuse bundled images from earlier releases, then fetch new artwork in small batches.
  const oldCaches=(await caches.keys()).filter(key=>key.startsWith('shijing-')&&key!==CACHE);
  let next=0,done=0;
  const worker=async()=>{while(next<sceneImages.length){
    const path=sceneImages[next++],url=new URL(path,self.registration.scope).href;
    let cached=await cache.match(url);
    if(!cached)for(const key of oldCaches){cached=await(await caches.open(key)).match(url);if(cached)break;}
    if(cached)await cache.put(url,cached);else await cache.add(url);
    done++;if(done%5===0||done===sceneImages.length)await broadcast({type:'OFFLINE_PROGRESS',done,total:sceneImages.length});
  }};
  await Promise.all(Array.from({length:4},worker));
  await self.skipWaiting();
}
self.addEventListener('install',event=>{event.waitUntil(prepareOffline());});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('shijing-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
    .then(()=>broadcast({type:'OFFLINE_STATUS',ready:true})));
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='CHECK_OFFLINE')return;
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(assets.map(path=>cache.match(new URL(path,self.registration.scope).href))))
    .then(entries=>event.source?.postMessage({type:'OFFLINE_STATUS',ready:entries.every(Boolean),version:VERSION})));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const request=event.request,url=new URL(request.url);
  const appShell=request.mode==='navigate'||/\/(index\.html|game-data\.js|progression\.js|script\.js|style\.css|map\.css|polish\.css|adventure\.css|manifest\.webmanifest|sw\.js)$/.test(url.pathname);
  if(appShell){
    event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
      return response;
    }).catch(()=>caches.match(request).then(cached=>cached||(request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
