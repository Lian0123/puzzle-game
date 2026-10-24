// Increment CACHE and VERSION whenever the app shell or bundled assets change.
importScripts('./game-data.js');
const CACHE='shijing-v14';
const VERSION='14';
const sceneImages=self.ShijingData.scenes.map(scene=>`./${scene.url}`);
const shell=['./','./index.html','./style.css','./map.css','./polish.css','./adventure.css','./game-data.js','./progression.js','./script.js','./manifest.webmanifest',`./sw.js?v=${VERSION}`,'./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
async function broadcast(message){const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});clients.forEach(client=>client.postMessage({...message,version:VERSION}));}
async function prepareOffline(){
  const cache=await caches.open(CACHE);
  await cache.addAll(shell);
  // Carry forward already downloaded art. New worlds remain on demand to keep first install small.
  const oldCaches=(await caches.keys()).filter(key=>key.startsWith('shijing-')&&key!==CACHE);
  let next=0,done=0;
  const worker=async()=>{while(next<sceneImages.length){
    const path=sceneImages[next++],url=new URL(path,self.registration.scope).href;
    if(!await cache.match(url))for(const key of oldCaches){const cached=await(await caches.open(key)).match(url);if(cached){await cache.put(url,cached);break;}}
    done++;if(done%25===0||done===sceneImages.length)await broadcast({type:'OFFLINE_PROGRESS',done,total:sceneImages.length});
  }};
  await Promise.all(Array.from({length:4},worker));
  await self.skipWaiting();
}
async function downloadWorld(worldId){
  const world=self.ShijingData.worlds.find(item=>item.id===worldId);
  if(!world)return;
  const images=self.ShijingData.scenes.filter(scene=>scene.worldId===worldId).map(scene=>`./${scene.url}`);
  const cache=await caches.open(CACHE);let next=0,done=0,failed=0;
  const worker=async()=>{while(next<images.length){
    const path=images[next++],url=new URL(path,self.registration.scope).href;
    try{if(!await cache.match(url)){const response=await fetch(url);if(!response.ok)throw new Error('image download failed');await cache.put(url,response);}done++;}
    catch{failed++;}
    if((done+failed)%5===0||done+failed===images.length)await broadcast({type:'OFFLINE_PROGRESS',worldId,done:done+failed,total:images.length});
  }};
  await Promise.all(Array.from({length:4},worker));
  await broadcast({type:'OFFLINE_WORLD_STATUS',worldId,done,total:images.length,failed});
}
self.addEventListener('install',event=>{event.waitUntil(prepareOffline());});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('shijing-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
  if(event.data?.type==='DOWNLOAD_WORLD'){
    const worldId=event.data.worldId;
    if(Number.isInteger(worldId))event.waitUntil(downloadWorld(worldId));
    return;
  }
  if(event.data?.type!=='CHECK_OFFLINE')return;
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    const shellEntries=await Promise.all(shell.map(path=>cache.match(new URL(path,self.registration.scope).href)));
    const imageEntries=await Promise.all(sceneImages.map(path=>cache.match(new URL(path,self.registration.scope).href)));
    event.source?.postMessage({type:'OFFLINE_STATUS',ready:shellEntries.every(Boolean),cachedImages:imageEntries.filter(Boolean).length,totalImages:sceneImages.length,version:VERSION});
  }));
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
