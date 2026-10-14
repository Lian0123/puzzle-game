const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const root=resolve(__dirname,'..');
const read=file=>readFileSync(resolve(root,file),'utf8');
test('300 unique landscapes belong to fifteen routes and three consistent worlds',()=>{
  const D=require('../game-data.js');assert.equal(D.TOTAL_LEVELS,300);assert.equal(D.scenes.length,300);assert.equal(D.chapters.length,15);assert.equal(D.worlds.length,3);
  assert.equal(new Set(D.scenes.map(scene=>scene.title)).size,300);assert.equal(new Set(D.scenes.map(scene=>scene.url)).size,300);
  D.scenes.forEach((scene,index)=>{assert.equal(scene.index,index);assert.equal(scene.chapter,Math.floor(index/20));assert.equal(D.chapters[scene.chapter].worldId,scene.worldId);const world=D.worlds[scene.worldId];assert.ok(index>=world.start&&index<world.end);});
  const art=JSON.parse(read('assets/level-art-manifest.json'));assert.equal(art.length,200);assert.equal(new Set(art.map(entry=>entry.prompt)).size,200);
  art.forEach((entry,index)=>{assert.equal(entry.level,101+index);assert.equal(entry.file,D.scenes[100+index].url.replace('assets/',''));assert.equal(entry.tool,'built-in image_gen');});
});
test('all shell resources and 300 bundled landscapes exist',()=>{
  const html=read('index.html');
  for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!/^(https?:|data:)/.test(match[1]))assert.ok(existsSync(resolve(root,match[1])),match[1]);
  const hashes=new Set();
  for(let i=1;i<=300;i++){const path=resolve(root,`assets/landscape-${String(i).padStart(2,'0')}.jpg`);assert.ok(existsSync(path));hashes.add(createHash('sha256').update(readFileSync(path)).digest('hex'));}
  assert.equal(hashes.size,300,'Every stage has distinct artwork');
  const manifest=JSON.parse(read('manifest.webmanifest'));assert.equal(manifest.lang,'zh-Hant');
  for(const icon of manifest.icons)assert.ok(existsSync(resolve(root,icon.src)));
});
test('SEO URLs, readable page content and JSON-LD agree',()=>{
  const html=read('index.html'),url='https://lian0123.github.io/puzzle-game/';
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema.url,url);assert.equal(schema.isAccessibleForFree,true);assert.equal(schema.inLanguage,'zh-Hant');
  assert.ok(html.includes(`rel="canonical" href="${url}"`));assert.ok(html.includes(`property="og:url" content="${url}"`));
  assert.ok(read('sitemap.xml').includes(`<loc>${url}</loc>`));assert.ok(read('robots.txt').includes(`${url}sitemap.xml`));
  assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.ok(html.includes('每日簽到'));assert.ok(html.includes('不同裝置不會同步'));
});
test('service worker release and new offline shell are synchronized',()=>{
  const sw=read('sw.js'),version=sw.match(/const VERSION='(\d+)'/)[1];
  assert.ok(sw.includes(`const CACHE='shijing-v${version}'`));assert.ok(read('script.js').includes(`./sw.js?v=${version}`));
  assert.ok(read('script.js').includes(`event.data?.version!=='${version}'`));
  for(const file of ['game-data.js','adventure.css','progression.js','polish.css','script.js','map.css','style.css','index.html'])assert.ok(sw.includes(`'./${file}'`));
  assert.ok(sw.includes("request.mode==='navigate'?caches.match('./index.html'):Response.error()"));
});
