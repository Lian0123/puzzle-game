const { scenes, chapters, worlds, CHAPTER_SIZE, TOTAL_LEVELS } = window.ShijingData;
const mapPositions = Array.from({length:CHAPTER_SIZE},(_,index)=>{
  const row=Math.floor(index/4),column=index%4;
  return {x:(row%2?[86,62,38,14]:[14,38,62,86])[column],y:12+row*19};
});

const $ = id => document.getElementById(id);
const gallery = $('galleryGrid');
const chapterNav = $('chapterNav');
const board = $('board');
let current = 0, size = 4, pieces = [], moves = 0, seconds = 0, hints = 2, selected = -1, timer = null, playing = false, soundOn = true, gesture = null, ghost = null, ignoreClick = false, gameHistoryActive = false, backNoticeTimer = null;
let selectedChapter = null;
let selectedWorld = 0, dailyPool = TOTAL_LEVELS;
let deferredInstallPrompt = null;
let downloadingWorld = null;
const S = window.Shijing;
const profileKey = 'shijing-profile-v1';
const activeSessionKey = 'shijing-active-session';
const baseUrl = `${location.pathname}${location.search}`;
let mode = 'journey', sessionDate = S.dayKey(), bonus = 0, lastSwap = null, paused = false, timerMark = 0, returnFocus = null, featureReturnFocus = null, pendingAction = null, confirmWasPaused = false, toastTimer = null, storageWarning = false;
function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
let profile = S.normalize(readJSON(profileKey, null));
const saved = {};
function refreshRecords() {
  const raw = readJSON('shijing-records', {});
  for (const key of Object.keys(saved)) delete saved[key];
  if (raw && typeof raw === 'object') for (const [key, record] of Object.entries(raw)) {
    if (/^(0|[1-9]\d*)-[456]$/.test(key) && Number(key.split('-')[0]) < TOTAL_LEVELS && record && Number.isSafeInteger(record.time) && record.time >= 0 && Number.isSafeInteger(record.moves) && record.moves >= 0) saved[key] = record;
  }
}
refreshRecords();
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { if (!storageWarning) { storageWarning = true; toast('瀏覽器儲存空間不足，這次進度可能無法保留。'); } return false; }
}
function refreshProfile() { profile = S.normalize(readJSON(profileKey, profile)); }
function saveProfile() { persist(profileKey, profile); }
function saveRecords() { persist('shijing-records', saved); }
function saveActiveSession() { if (playing) persist(activeSessionKey, {current,size,pieces,moves,seconds,hints,mode,date:sessionDate,dailyPool,bonus,lastSwap}); }
function clearActiveSession() { try { localStorage.removeItem(activeSessionKey); } catch {} }
function readActiveSession() { const session = S.normalizeSession(readJSON(activeSessionKey, null), TOTAL_LEVELS); if (session && session.mode !== 'daily' && session.current > nextLevel() && !isCompleted(session.current)) return null; return session; }
function toast(message) { const element = $('toast'); element.textContent = message; element.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; }, 3400); }
function applySettings() { soundOn = profile.settings.sound; $('soundButton').setAttribute('aria-pressed', String(soundOn)); $('soundButton').querySelector('span').textContent = soundOn ? '音效開' : '音效關'; document.documentElement.dataset.motion = profile.settings.motion ? 'on' : 'off'; }
function renderPlayerHUD() {
  const done = scenes.filter(scene => isCompleted(scene.index)).length;
  const complete = done === TOTAL_LEVELS, experience = complete ? 1000 : done % 10 * 100;
  $('playerLevel').textContent = `LV. ${String(Math.floor(done / 10) + 1).padStart(2,'0')}`;
  $('playerRank').textContent = done >= 500 ? '群星旅者 · 五百幅風景都在心裡' : done >= 400 ? '星際行者 · 穿越星門抵達遠方' : done >= 300 ? '原初探索者 · 走過世界最初的風景' : done >= 200 ? '古風行者 · 宮闕與山水等你收藏' : done >= 100 ? '跨界旅人 · 新世界等你探索' : done >= 20 ? '山海收藏家 · 旅程越來越精彩' : '初見旅人 · 旅程從這裡開始';
  $('journeyXP').textContent = `${experience.toLocaleString('zh-TW')} / 1,000 旅途經驗`;
  $('nextRankText').textContent = complete ? `${TOTAL_LEVELS} 幅風景全收藏 · 旅人等級已滿` : `再完成 ${10-done%10} 個新關卡，提升旅人等級`;
  $('xpFill').style.width = `${experience / 10}%`;
  $('collectionStat').innerHTML = `${done} <small>/ ${TOTAL_LEVELS}</small>`;
  $('chapterStat').innerHTML = `${chapters.filter((_,i)=>scenes.slice(i*CHAPTER_SIZE,(i+1)*CHAPTER_SIZE).every(scene=>isCompleted(scene.index))).length} <small>/ ${chapters.length}</small>`;
  $('supplyBadge').hidden = profile.lastCheckIn >= S.dayKey();
  const scene = scenes[nextLevel()], chapter = chapters[scene.chapter];
  $('heroStageTitle').textContent = `${String(scene.index+1).padStart(3,'0')} · ${scene.title}`;
  $('heroStageWorld').textContent = `${worlds[scene.worldId].title} · ${chapter.title}`;
  document.querySelector('.hero-landscape').src = scene.url;
  document.querySelector('.scene-caption > span').textContent = `${String(scene.index+1).padStart(3,'0')} / ${TOTAL_LEVELS}`;
  document.querySelector('.scene-caption > strong').textContent = scene.title;
  document.querySelectorAll('.floating-piece').forEach(piece=>piece.style.backgroundImage=`url('${scene.url}')`);
}
function renderWorldNav() {
  const next = nextLevel();
  $('worldNav').innerHTML = worlds.map(world => {
    const done = scenes.slice(world.start,world.end).filter(scene=>isCompleted(scene.index)).length;
    const unlocked = world.start <= next || done > 0, total = world.end-world.start;
    return `<button class="world-card ${selectedWorld===world.id?'active':''} ${unlocked?'':'locked'}" data-world="${world.id}" type="button" aria-pressed="${selectedWorld===world.id}" aria-label="${world.title}，第 ${world.start+1} 到 ${world.end} 關，已完成 ${done} 關${unlocked?'':`，完成前 ${world.start} 關後解鎖`}" style="--world-image:${unlocked?`url('${scenes[world.start].url}')`:'linear-gradient(135deg,#63588a,#242745)'}"><span class="world-card-icon" aria-hidden="true">${world.icon}</span><span class="world-card-copy"><small>WORLD ${String(world.id+1).padStart(2,'0')} · ${world.start+1}—${world.end}</small><strong>${world.title}</strong><span>${world.description}</span><span class="world-completion"><i style="width:${done/total*100}%"></i></span></span><span class="world-lock">${!unlocked?`完成 ${world.start} 關解鎖`:done===total?'全數完成 ✓':selectedWorld===world.id?'正在探索 ✦':'進入世界 ↗'}</span></button>`;
  }).join('');
  const world=worlds[selectedWorld],done=scenes.slice(world.start,world.end).filter(scene=>isCompleted(scene.index)).length;
  $('worldProgressText').textContent=`${world.title} · ${done} / ${world.end-world.start}`;
  const downloadButton=$('downloadWorldButton');
  downloadButton.textContent=downloadingWorld===world.id?`正在保存 ${world.title}…`:`保存${world.title}離線圖片`;
  downloadButton.disabled=downloadingWorld===world.id;
}
function renderLobby() {
  refreshProfile(); applySettings();renderPlayerHUD();
  $('balanceDisplay').textContent = profile.balance.toLocaleString('zh-TW');
  const today = S.dayKey(), claimed = profile.lastCheckIn >= today;
  const continuous = S.dayNumber(today) - S.dayNumber(profile.lastCheckIn) <= 1;
  const streak = continuous ? profile.streak : 0;
  const activeDay = claimed ? (Math.max(1, streak) - 1) % 7 : streak % 7;
  $('streakText').textContent = streak ? `已連續簽到 ${streak} 天${claimed ? '，明天再來拾光。' : '，今天的補給等你領取。'}` : '每日補給，為旅程存一點星光。';
  $('checkinDays').innerHTML = [20,25,30,35,40,50,80].map((reward, i) => `<div class="checkin-day ${i < activeDay || (claimed && i === activeDay) ? 'done' : ''} ${i === activeDay ? 'today' : ''}"><span>DAY ${i+1}</span><strong>${i < activeDay || (claimed && i === activeDay) ? '✓' : '✦'}</strong><small>${reward}${i === 6 ? '＋⌖' : ''}</small></div>`).join('');
  $('checkinButton').disabled = claimed;
  $('checkinButton').innerHTML = claimed ? '今日補給已領取 <span>明天見 ✧</span>' : `領取今日補給 <span>＋${[20,25,30,35,40,50,80][activeDay]} ✦</span>`;
  const dailyScene = scenes[S.dailyIndex(today, TOTAL_LEVELS)];
  const dailyDone = profile.rewards.some(key=>key.startsWith(`daily:${today}:`));
  $('dailyTag').textContent = dailyDone ? '今日已完成 ✓' : `${today.slice(5).replace('-', ' / ')} · 每日更新`;
  $('dailyModeText').textContent = `今日風景：${dailyScene.title}。同一份拼圖新挑戰。`;
  $('dailyModeButton').querySelector('.mode-art').style.backgroundImage = `linear-gradient(0deg,#09281d,transparent),url('${dailyScene.url}')`;
  $('questDate').textContent = `${today.slice(5).replace('-', ' / ')} · 當地午夜更新`;
  $('questGrid').innerHTML = S.QUESTS.map(quest => {
    const value = Math.min(quest.goal, profile.quests[quest.id]), done = profile.quests.claimed.includes(quest.id);
    return `<article class="quest-card"><div><h3>${quest.title}</h3><p>${quest.description}</p></div><span>＋${quest.reward} ✦</span><div class="quest-bottom"><div class="quest-progress" aria-hidden="true"><i style="width:${value/quest.goal*100}%"></i></div><small>${value} / ${quest.goal}</small><button class="quest-claim" data-quest="${quest.id}" type="button" ${done || value < quest.goal ? 'disabled' : ''}>${done ? '已領取 ✓' : value >= quest.goal ? '領取' : '進行中'}</button></div></article>`;
  }).join('');
  updateTools();
}
function checkIn() { refreshProfile(); const result = S.checkIn(profile); if (!result) return renderLobby(); saveProfile(); renderLobby(); playTone(780); toast(`簽到成功！＋${result.reward} 星砂${result.bonus ? '，另獲歸位羅盤 ×1' : ''}`); }
function openFeature(kind) {
  const dialog = $('featureDialog');
  if (!dialog.open) featureReturnFocus = document.activeElement;
  const titles = {preview:['THE ORIGINAL VIEW','看看完整的風景'],shop:['TRAVEL SUPPLIES','旅途補給站'],collection:['MEMORIES TO KEEP','我的風景收藏'],settings:['MAKE YOURSELF AT HOME','你的遊戲設定'],guide:['A GUIDE TO YOUR JOURNEY','從一片風景開始']};
  const [kicker, title] = titles[kind]; dialog.dataset.kind = kind; $('featureKicker').textContent = kicker; $('featureTitle').textContent = title;
  refreshProfile();
  if (kind === 'preview') $('featureContent').innerHTML = `<img class="reference-image" src="${scenes[current].url}" width="1024" height="1024" alt="${scenes[current].title}的完整拼圖原圖"><p class="dialog-note">${scenes[current].title} · ${scenes[current].subtitle}。查看原圖時遊戲會暫停。</p>`;
  if (kind === 'shop') $('featureContent').innerHTML = `<div class="shop-balance">✦ ${profile.balance.toLocaleString('zh-TW')} 星砂 <small> · 旅程的每一點收穫</small></div>${Object.entries(S.ITEMS).map(([id,item]) => `<div class="shop-item"><span class="shop-item-icon" aria-hidden="true">${item.icon}</span><div class="shop-item-copy"><h3>${item.name}</h3><p>${item.description}</p><small>背包中有 ${profile.inventory[id]} 個</small></div><button data-buy="${id}" type="button" ${profile.balance < item.cost || profile.inventory[id] >= 999 ? 'disabled' : ''}>${item.cost} ✦ 兌換</button></div>`).join('')}<p class="dialog-note">星砂由簽到、每日任務與完成拼圖獲得，沒有付費購買。道具使用後扣除，不會因切換拼圖而退還。新旅人已獲得 120 星砂與入門道具。</p>`;
  if (kind === 'collection') {
    const collected = scenes.filter(scene => isCompleted(scene.index));
    const badges = [{icon:'✧',name:'第一片風景',earned:collected.length>=1},{icon:'❖',name:'山海收藏家',earned:collected.length>=20},{icon:'☀',name:'七日拾光',earned:profile.bestStreak>=7},{icon:'✦',name:'百景旅人',earned:collected.length>=100},{icon:'♧',name:'幻想先鋒',earned:scenes.slice(100,140).every(scene=>isCompleted(scene.index))},{icon:'⌂',name:'古風雅客',earned:scenes.slice(200,300).every(scene=>isCompleted(scene.index))},{icon:'☼',name:'原初行者',earned:scenes.slice(300,400).every(scene=>isCompleted(scene.index))},{icon:'✧',name:'星際旅人',earned:scenes.slice(400,500).every(scene=>isCompleted(scene.index))}];
    $('featureContent').innerHTML = `<div class="album-stats"><span>風景 ${collected.length} / ${TOTAL_LEVELS}</span><span>累計完成 ${profile.totalWins} 局</span></div><div class="badge-grid">${badges.map(b => `<div class="badge ${b.earned ? 'earned' : ''}" aria-label="${b.name}，${b.earned ? '已獲得' : '未獲得'}"><strong aria-hidden="true">${b.icon}</strong>${b.name}</div>`).join('')}</div>${collected.length ? `<div class="album-grid">${collected.map(scene => `<figure class="album-card"><img src="${scene.url}" alt="${scene.title}，${scene.subtitle}" loading="lazy" width="256" height="256"><figcaption>${String(scene.index+1).padStart(2,'0')} · ${scene.title}</figcaption></figure>`).join('')}</div>` : '<div class="empty-album"><span>▧</span><p>完成旅程模式第一關，<br>收藏你的第一幅風景。</p></div>'}<p class="dialog-note">旅程模式會收藏風景、解鎖下一關。特殊模式另有獎勵，不影響旅程解鎖。</p>`;
  }
  if (kind === 'settings') $('featureContent').innerHTML = `<div class="setting-row"><div><strong>遊戲音效</strong><small>交換、提示與完成時的輕柔音效</small></div><button class="toggle-button" data-setting="sound" aria-pressed="${profile.settings.sound}" type="button">${profile.settings.sound?'開啟':'關閉'}</button></div><div class="setting-row"><div><strong>畫面動態</strong><small>浮動風景、交換動畫與完成彩紙</small></div><button class="toggle-button" data-setting="motion" aria-pressed="${profile.settings.motion}" type="button">${profile.settings.motion?'開啟':'關閉'}</button></div><p class="dialog-note">會自動尊重裝置的「減少動態」偏好。進度保存在目前瀏覽器；清除網站資料會移除進度，不同裝置不會同步。</p>`;
  if (kind === 'guide') $('featureContent').innerHTML = `<ol class="guide-steps"><li><strong>從一幅風景出發。</strong><br>旅程模式共有 ${TOTAL_LEVELS} 關，完成後解鎖下一站。</li><li><strong>交換，讓風景歸位。</strong><br>拖曳到另一塊，或依序點兩塊即可交換。鍵盤方向鍵可交換相鄰方塊。</li><li><strong>需要靈感？看看原圖。</strong><br>每局兩次免費提示。手機可點下方「原圖」查看；歸位羅盤會自動歸位一塊。</li><li><strong>每天都有新的小確幸。</strong><br>簽到與任務可領星砂，再到補給站兌換道具。限時衝刺只有 180 秒，時間沙漏可增加 30 秒。</li></ol><p class="dialog-note">遊戲中可暫停；切換到其他應用程式時會自動暫停。退出遊戲會保存盤面，下次從「繼續」接著玩。</p>`;
  if (!dialog.open) dialog.showModal();
}
function updateTools() {
  for (const id of Object.keys(S.ITEMS)) { const button = $(`${id}Tool`); button.querySelector('b').textContent = profile.inventory[id]; button.disabled = !playing || paused || profile.inventory[id] <= 0 || (id === 'undo' && !lastSwap) || (id === 'freeze' && mode !== 'sprint'); }
}
function useTool(id) {
  tickTimer();
  if (!playing || paused || (id === 'undo' && !lastSwap) || (id === 'freeze' && mode !== 'sprint')) return;
  refreshProfile();
  if (!S.consume(profile,id)) { toast('這個道具用完了，可以到補給站兌換。'); return updateTools(); }
  saveProfile();
  if (id === 'compass') { const target = pieces.findIndex((p,i)=>p!==i); const from = pieces.indexOf(target); swap(target,from); toast('羅盤為你找回一片風景。'); }
  if (id === 'undo') { pieces = [...lastSwap]; lastSwap = null; moves++; selected = -1; renderBoard(); updateStats(); saveActiveSession(); playTone(350); toast('已回到上一次交換之前。'); }
  if (id === 'freeze') { bonus += 30; updateStats(); saveActiveSession(); playTone(800); toast('時間沙漏：剩餘時間增加 30 秒。'); }
  updateTools();
}
function celebrate() { if (!profile.settings.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return; const holder = $('celebration'); holder.replaceChildren(); for (let i=0;i<32;i++) { const piece=document.createElement('i'); piece.className='confetti'; piece.style.left=`${Math.random()*100}%`; piece.style.background=['#d9efb2','#f7b99e','#a8d8bd','#f0dda1'][i%4]; piece.style.animationDelay=`${Math.random()*.5}s`; piece.style.setProperty('--drift',`${Math.random()*160-80}px`); holder.append(piece); } setTimeout(()=>holder.replaceChildren(),3300); }
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function playTone(freq=480){if(!soundOn)return;try{const context=new (window.AudioContext||window.webkitAudioContext)(),o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.setValueAtTime(freq,context.currentTime);o.frequency.exponentialRampToValueAtTime(freq*1.25,context.currentTime+.08);g.gain.setValueAtTime(.035,context.currentTime);g.gain.exponentialRampToValueAtTime(.001,context.currentTime+.13);o.connect(g).connect(context.destination);o.start();o.stop(context.currentTime+.14);o.onended=()=>context.close()}catch{}}
function isCompleted(index){return Object.keys(saved).some(key=>key.startsWith(`${index}-`))}
function nextLevel(){const index=scenes.findIndex(scene=>!isCompleted(scene.index));return index<0?0:index}
function mapPath(count){return mapPositions.slice(0,count).map(({x,y},index)=>`${index?'L':'M'} ${x*10} ${y*7}`).join(' ')}
function renderChapterNav(){
  const fragment=document.createDocumentFragment();
  const next=nextLevel();
  chapters.forEach((chapter,index)=>{
    if(chapter.worldId!==selectedWorld)return;
    const start=index*CHAPTER_SIZE,end=Math.min(start+CHAPTER_SIZE,TOTAL_LEVELS);
    const done=scenes.slice(start,end).filter(scene=>isCompleted(scene.index)).length;
    const button=document.createElement('button');
    button.type='button';button.className='chapter-tab';button.dataset.chapter=index;
    button.classList.toggle('active',index===selectedChapter);
    button.setAttribute('aria-pressed',String(index===selectedChapter));
    button.setAttribute('aria-label',`第 ${index+1} 條路線：${chapter.title}，第 ${start+1} 到 ${end} 關，已完成 ${done} 關`);
    const unlocked=done>0||start<=next;
    button.classList.toggle('locked',!unlocked);
    button.style.setProperty('--portal-image',unlocked?`url("${scenes[start].url}")`:'linear-gradient(145deg,#607a83,#213e53 65%,#142d42)');
    button.style.setProperty('--portal-progress',`${done/(end-start)*100}%`);
    const dots=Array.from({length:5},(_,step)=>`<i class="${done>=(step+1)*4?'filled':''}"></i>`).join('');
    button.innerHTML=`<span class="chapter-portal"><span class="chapter-portal-glow" aria-hidden="true"></span><span class="chapter-portal-icon" aria-hidden="true">${chapter.icon}</span><span class="chapter-portal-index" aria-hidden="true">${String(index+1).padStart(2,'0')}</span></span><span class="chapter-portal-dots" aria-hidden="true">${dots}</span><span class="chapter-tab-label">${chapter.title}</span>`;
    fragment.append(button);
  });
  chapterNav.replaceChildren(fragment);
}
function centerSelectedChapter(){
  const tab=chapterNav.querySelector(`[data-chapter="${selectedChapter}"]`);
  if(!tab)return;
  chapterNav.scrollLeft+=tab.getBoundingClientRect().left-chapterNav.getBoundingClientRect().left-(chapterNav.clientWidth-tab.clientWidth)/2;
}
function renderChapterMap(next){
  const chapter=chapters[selectedChapter],start=selectedChapter*CHAPTER_SIZE;
  const chapterScenes=scenes.slice(start,start+CHAPTER_SIZE);
  const done=chapterScenes.filter(scene=>isCompleted(scene.index)).length;
  const activeChapter=Math.floor(next/CHAPTER_SIZE);
  const world=worlds[chapter.worldId];
  $('mapShell').dataset.theme=chapter.theme;$('mapShell').dataset.world=world.theme;
  $('worldEyebrow').textContent=`✦ ${world.label} · ${String(world.start+1).padStart(3,'0')}—${world.end}`;
  $('mapShell').style.setProperty('--map-image',done>0||start<=next?`url("${chapterScenes[0].url}")`:'linear-gradient(145deg,#98a8aa,#36576c)');
  $('mapChapterNumber').textContent=`${String(world.chapters.indexOf(selectedChapter)+1).padStart(2,'0')} / ${String(world.chapters.length).padStart(2,'0')}`;
  $('mapChapterProgress').textContent=`已完成 ${done} / ${chapterScenes.length} 關`;
  $('mapChapterIcon').textContent=chapter.icon;
  $('mapChapterTitle').textContent=chapter.title;
  $('mapChapterDescription').textContent=chapter.description;
  $('mapChapterStatus').textContent=done===chapterScenes.length?'本章全數完成':selectedChapter===activeChapter?`第 ${next+1} 關 · ${scenes[next].title}`:selectedChapter>activeChapter?`先完成第 ${next+1} 關，開啟新路線`:'回來探索已解鎖的風景';
  $('mapJumpButton').hidden=selectedChapter===activeChapter;
  $('mapTrailBase').setAttribute('d',mapPath(chapterScenes.length));
  let trailDone=0;
  while(trailDone<chapterScenes.length&&isCompleted(chapterScenes[trailDone].index))trailDone++;
  $('mapTrailDone').setAttribute('d',mapPath(trailDone));
  const fragment=document.createDocumentFragment();
  chapterScenes.forEach((scene,index)=>{
    const completed=isCompleted(scene.index),unlocked=completed||scene.index<=next;
    const node=document.createElement('button');
    node.type='button';node.className='map-node';node.dataset.level=scene.index;
    node.classList.toggle('completed',completed);
    node.classList.toggle('current',scene.index===next&&!completed);
    node.classList.toggle('locked',!unlocked);
    node.classList.toggle('milestone',(index+1)%5===0);
    node.disabled=!unlocked;
    node.style.setProperty('--x',`${mapPositions[index].x}%`);
    node.style.setProperty('--y',`${mapPositions[index].y}%`);
    node.style.setProperty('--order',index);
    node.setAttribute('aria-label',`第 ${scene.index+1} 關：${unlocked?scene.title:'尚未解鎖'}${completed?'，已完成':''}`);
    node.innerHTML=`<span class="map-node-face"><span class="map-node-number">${String(scene.index+1).padStart(2,'0')}</span><span class="map-node-symbol" aria-hidden="true">${completed?'✓':scene.index===next?'✦':'⌑'}</span></span><span class="map-node-name">${unlocked?scene.title:'神秘風景'}</span>`;
    if(unlocked)node.addEventListener('click',()=>openGame(scene.index));
    fragment.append(node);
  });
  gallery.replaceChildren(fragment);
}
function renderGallery(){
  const next=nextLevel(),done=scenes.filter(scene=>isCompleted(scene.index)).length,session=readActiveSession();
  if(selectedChapter===null)selectedChapter=Math.floor(next/CHAPTER_SIZE);
  selectedWorld=chapters[selectedChapter].worldId;renderWorldNav();
  $('levelProgress').textContent=`已完成 ${done} / ${TOTAL_LEVELS} 關`;
  $('progressFill').style.width=`${done/TOTAL_LEVELS*100}%`;
  $('levelCount').textContent=`共 ${TOTAL_LEVELS} 關`;
  $('continueButton').innerHTML=session?`繼續${session.mode==='journey'?`第 ${session.current+1} 關`:{daily:'每日一景',sprint:'限時衝刺',zen:'禪意時光'}[session.mode]} <span>→</span>`:done===TOTAL_LEVELS?`重玩第 1 關 <span>→</span>`:`開始第 ${next+1} 關 <span>→</span>`;
  renderChapterNav();renderChapterMap(next);centerSelectedChapter();renderLobby();
}
chapterNav.addEventListener('click',event=>{
  const button=event.target.closest('button[data-chapter]');
  if(!button)return;
  selectedChapter=Number(button.dataset.chapter);
  renderChapterNav();renderChapterMap(nextLevel());
  centerSelectedChapter();
  chapterNav.querySelector(`[data-chapter="${selectedChapter}"]`)?.focus({preventScroll:true});
});
$('mapJumpButton').addEventListener('click',()=>{selectedChapter=Math.floor(nextLevel()/CHAPTER_SIZE);renderGallery();gallery.querySelector('.map-node.current')?.focus()});
function tickTimer() {
  if (!playing || paused) return;
  const now = performance.now(), elapsed = Math.floor((now - timerMark)/1000);
  if (elapsed > 0) { seconds += elapsed; timerMark += elapsed*1000; updateStats(); saveActiveSession(); }
  if (mode === 'sprint' && seconds >= 180 + bonus) timeUp();
}
function startTimer() { clearInterval(timer); timerMark = performance.now(); timer = setInterval(tickTimer, 200); }
function shuffle() { pieces = S.makePuzzle(size, mode === 'daily' ? `daily:${sessionDate}` : undefined); moves=0;seconds=0;hints=2;bonus=0;lastSwap=null;selected=-1;paused=false;playing=true;$('pauseButton').disabled=false;startTimer();renderBoard();updateStats();updateBest();saveActiveSession(); }
function enterGameHistory(){if(gameHistoryActive)return;try{history.pushState({shijingGame:true},'',`${baseUrl}#game`);gameHistoryActive=true}catch{}}
function leaveGameHistory(){if(!gameHistoryActive)return;try{history.replaceState(null,'',baseUrl)}catch{}gameHistoryActive=false}
function showBackNotice(){const notice=$('backNotice');notice.hidden=false;clearTimeout(backNoticeTimer);backNoticeTimer=setTimeout(()=>{notice.hidden=true},2400)}
function setHomeInert(value) { document.body.classList.toggle('game-is-open',value);document.querySelectorAll('body > header, body > main, body > footer, .skip-link, .mobile-game-nav').forEach(element => { element.inert = value; }); }
function setupGame() {
  $('gameTitle').textContent=scenes[current].title;$('gameLevelTag').textContent=`STAGE ${String(current+1).padStart(3,'0')} / ${TOTAL_LEVELS}`;
  $('previewImage').style.backgroundImage=`url('${scenes[current].url}')`;
  $('gameOverlay').hidden=false;$('gameOverlay').inert=false;$('winOverlay').hidden=true;document.body.style.overflow='hidden';setHomeInert(true);
  const labels={journey:['旅程模式','完成風景，解鎖下一站'],daily:['每日一景',`${sessionDate} · 完成獎勵 80 星砂`],sprint:['限時衝刺','180 秒內拼回風景'],zen:['禪意時光','深呼吸，照自己的步調']};
  $('gameModeBadge').textContent=labels[mode][0];$('modeDescription').textContent=labels[mode][1];
  $('timeDisplay').parentElement.querySelector('span').textContent=mode==='sprint'?'剩餘時間':mode==='zen'?'慢慢來':'時間';
  document.querySelectorAll('#difficulty button').forEach(button=>{const active=Number(button.dataset.size)===size;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.disabled=['daily','sprint'].includes(mode)});
  $('gameOverlay').querySelector('.game-shell').inert=false;
  $('pauseButton').disabled=false;
}
function openGame(index, nextMode='journey', force=false) {
  if (!force && $('gameOverlay').hidden && readActiveSession()) { confirmRestart(()=>openGame(index,nextMode,true),'開始新的旅程？','目前保存的盤面會被新遊戲取代。已使用的道具不會退還。'); return; }
  if ($('gameOverlay').hidden) { returnFocus=document.activeElement; enterGameHistory(); }
  clearActiveSession(); current=index;mode=nextMode;sessionDate=S.dayKey();size=['daily','sprint'].includes(mode)?4:size;
  dailyPool=TOTAL_LEVELS;setupGame();shuffle();$('pauseButton').focus();
}
function resumeGame(session) { returnFocus=document.activeElement; current=session.current;size=session.size;pieces=[...session.pieces];moves=session.moves;seconds=session.seconds;hints=session.hints;mode=session.mode;sessionDate=session.date;dailyPool=session.dailyPool;bonus=session.bonus;lastSwap=session.lastSwap;selected=-1;paused=false;playing=true;setupGame();renderBoard();updateStats();updateBest();startTimer();enterGameHistory();$('pauseButton').focus(); if (mode==='sprint' && seconds>=180+bonus) timeUp(); }
function closeGame() { saveActiveSession();playing=false;paused=false;clearInterval(timer);gesture=null;clearGhost();clearDragMarks();for (const id of ['pauseDialog','confirmDialog','featureDialog']) if ($(id).open) $(id).close();$('gameOverlay').hidden=true;$('winOverlay').hidden=true;document.body.style.overflow='';setHomeInert(false);leaveGameHistory();renderGallery();(returnFocus?.isConnected?returnFocus:$('continueButton')).focus({preventScroll:true}); }
function setDifficulty(n) { size=n; setupGame(); shuffle(); }
function pauseGame() { if (!playing || paused) return; tickTimer(); if (!playing) return; paused=true; gesture=null;clearGhost();clearDragMarks();saveActiveSession(); updateTools();$('pauseKicker').textContent='TAKE A BREATH';$('pauseTitle').textContent='旅程暫停中';$('pauseText').textContent='休息一下，風景會在這裡等你。';$('resumeButton').textContent='繼續拼圖 →';$('pauseDialog').dataset.expired='false';$('pauseDialog').showModal(); }
function resumePaused() { if ($('pauseDialog').dataset.expired==='true') { $('pauseDialog').close(); shuffle(); return; } $('pauseDialog').close();paused=false;timerMark=performance.now();updateTools();$('pauseButton').focus(); }
function timeUp() { seconds=180+bonus;playing=false;paused=false;clearInterval(timer);clearActiveSession();updateStats();$('pauseButton').disabled=true;$('pauseKicker').textContent='A NEW TRY, A NEW CHANCE';$('pauseTitle').textContent='時間到了，再試一次？';$('pauseText').textContent='這次沒能在時間內完成。換個思路，下次一定能走得更遠。';$('resumeButton').textContent='重新挑戰 →';$('pauseDialog').dataset.expired='true'; if ($('confirmDialog').open) $('confirmDialog').close(); if ($('featureDialog').open) $('featureDialog').close(); if (!$('pauseDialog').open) $('pauseDialog').showModal(); }
function confirmRestart(action, title='切換到新的拼圖？', text='目前盤面會被新拼圖取代，已使用的道具不會退還。') { confirmWasPaused=paused; if (playing && !paused) { tickTimer(); if (!playing) return; paused=true;saveActiveSession(); } pendingAction=action;$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmDialog').showModal(); }
function finishConfirm(accept) { $('confirmDialog').close(); const action=pendingAction;pendingAction=null; if (accept) { paused=false;action?.(); } else { paused=confirmWasPaused;timerMark=performance.now(); } updateTools(); }
function renderBoard(){board.style.gridTemplateColumns=`repeat(${size},1fr)`;board.innerHTML='';const url=scenes[current].url;pieces.forEach((piece,index)=>{const tile=document.createElement('button');tile.className='tile'+(piece===index?' correct':'')+(selected===index?' selected':'');tile.type='button';tile.dataset.index=index;tile.setAttribute('aria-label',`第 ${Math.floor(index/size)+1} 列，第 ${index%size+1} 行的方塊`);tile.style.backgroundImage=`url('${url}')`;tile.style.backgroundSize=`${size*100}% ${size*100}%`;tile.style.backgroundPosition=`${(piece%size)/(size-1)*100}% ${Math.floor(piece/size)/(size-1)*100}%`;board.append(tile)})}
function adjacent(a,b){return Math.abs(Math.floor(a/size)-Math.floor(b/size))+Math.abs(a%size-b%size)===1}
function swap(a,b){tickTimer();if(!playing||paused||a===b||a<0||b<0||a>=pieces.length||b>=pieces.length)return;lastSwap=[...pieces];const beforeCorrect=pieces.map((p,i)=>p===i);[pieces[a],pieces[b]]=[pieces[b],pieces[a]];moves++;selected=-1;refreshProfile();profile.quests.swaps++;saveProfile();playTone(400+Math.random()*100);renderBoard();for(const index of [a,b])board.children[index]?.classList.add(pieces[index]===index&&!beforeCorrect[index]?'just-correct':'just-swapped');updateStats();if(pieces.every((p,i)=>p===i))win();else saveActiveSession()}
function updateStats() { const percent=Math.round(pieces.filter((p,i)=>p===i).length/pieces.length*100);$('boardProgressFill').style.width=`${percent}%`;$('boardProgressPercent').textContent=`${percent}%`; $('timeDisplay').textContent=mode==='zen'?'∞':formatTime(mode==='sprint'?Math.max(0,180+bonus-seconds):seconds);$('timeDisplay').parentElement.classList.toggle('urgent',mode==='sprint' && 180+bonus-seconds<=30);$('movesDisplay').textContent=moves;$('progressDisplay').textContent=`${pieces.filter((p,i)=>p===i).length}/${pieces.length}`;$('hintCount').textContent=hints;$('hintButton').disabled=!playing||paused||hints<=0;updateTools(); }
function updateBest() { const record=mode==='journey'?saved[`${current}-${size}`]:null;$('bestLine').textContent=record?`個人最佳：${formatTime(record.time)} · ${record.moves} 步`:mode==='journey'?'完成旅程模式，收藏這幅風景。':mode==='daily'?'同日同盤面 · 首次完成獎勵 80 星砂':mode==='sprint'?'時間沙漏可增加 30 秒。':'不用趕路，風景一直都在。'; }
function win() {
  playing=false;paused=false;clearInterval(timer);clearActiveSession();
  const target=size*size*2,scene=scenes[current],starCount=moves<=target?3:moves<=target*2?2:1;
  if(mode==='journey') { refreshRecords();const key=`${current}-${size}`,previous=saved[key];if(!previous||seconds<previous.time||(seconds===previous.time&&moves<previous.moves)){saved[key]={time:seconds,moves};saveRecords()}selectedChapter=Math.floor(nextLevel()/CHAPTER_SIZE); }
  refreshProfile(); const reward=S.recordWin(profile,{mode,index:current,size,stars:starCount,date:sessionDate});saveProfile();
  $('winImage').style.backgroundImage=`url('${scene.url}')`;$('winImage').setAttribute('aria-label',`完成的拼圖：${scene.title}`);
  $('winText').textContent=`「${scene.title}」已完整歸位。${mode==='journey'?(current<scenes.length-1?'下一關已解鎖，新的風景等你收藏。':`恭喜完成全部 ${TOTAL_LEVELS} 關！`):mode==='daily'?(sessionDate===S.dayKey()?'今日的風景，已收進心裡。明天還有新的挑戰。':'這一天的風景已完成，還可以挑戰今日的一景。'):'帶著這份專注，繼續下一段旅程。'}`;
  $('winTime').textContent=mode==='zen'?'自在時光':formatTime(seconds);$('winMoves').textContent=moves;$('winStars').textContent='★'.repeat(starCount)+'☆'.repeat(3-starCount);
  $('winReward').textContent=reward?`✦ ＋${reward} 星砂 · ${mode==='journey'?'首次完成獎勵':mode==='daily'&&sessionDate!==S.dayKey()?'該日首勝獎勵':'今日首勝獎勵'}`:'✧ 已領取首勝獎勵，每一次重玩都值得。';
  const world=worlds[scene.worldId],nextWorld=worlds[scene.worldId+1],route=chapters[scene.chapter],nextRoute=chapters[scene.chapter+1];
  $('winMilestone').hidden=mode!=='journey'||(current+1)%CHAPTER_SIZE!==0;
  $('winMilestone').textContent=current+1===world.end?`${world.icon} ${world.title}完成 · ${nextWorld?`${nextWorld.title}已解鎖`:`${TOTAL_LEVELS} 幅風景全收藏`}`:`✦ ${route.title} · 路線完成`;
  $('nextButton').textContent=mode==='journey'?(current===TOTAL_LEVELS-1?'重玩第一關 →':current+1===world.end&&nextWorld?`前往${nextWorld.title} →`:(current+1)%CHAPTER_SIZE===0&&nextRoute?`進入${nextRoute.title} →`:'下一關 →'):mode==='daily'?(sessionDate===S.dayKey()&&dailyPool===TOTAL_LEVELS?'再拼一次 →':'挑戰今日一景 →'):mode==='sprint'?'再挑戰一次 →':'另一幅風景 →';
  $('gameOverlay').inert=true;$('gameOverlay').querySelector('.game-shell').inert=true;$('winOverlay').hidden=false;updateTools();playTone(660);celebrate();$('nextButton').focus();
}
function showHint(){if(!playing||paused||hints<=0)return;const misplaced=pieces.map((p,i)=>p===i?-1:i).filter(i=>i>=0);if(!misplaced.length)return;const from=misplaced[Math.floor(Math.random()*misplaced.length)],to=pieces[from];hints--;updateStats();saveActiveSession();const cells=board.children;cells[from]?.classList.add('hinted');cells[to]?.classList.add('hinted');setTimeout(()=>{cells[from]?.classList.remove('hinted');cells[to]?.classList.remove('hinted')},2500);playTone(760)}
function tileAtPoint(x,y){const rect=board.getBoundingClientRect();if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)return -1;const col=Math.min(size-1,Math.floor((x-rect.left)/rect.width*size)),row=Math.min(size-1,Math.floor((y-rect.top)/rect.height*size));return row*size+col}
function clearDragMarks(){board.querySelectorAll('.dragging,.drop-target').forEach(tile=>tile.classList.remove('dragging','drop-target'))}
function clearGhost(){ghost?.remove();ghost=null}
board.addEventListener('pointerdown',e=>{const tile=e.target.closest('.tile');if(!tile||!playing||paused)return;gesture={index:Number(tile.dataset.index),x:e.clientX,y:e.clientY,pointerId:e.pointerId};tile.setPointerCapture?.(e.pointerId)});
board.addEventListener('pointermove',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.hypot(dx,dy)<12)return;if(!ghost){const tile=board.children[gesture.index],rect=tile.getBoundingClientRect();ghost=tile.cloneNode();ghost.className='drag-ghost';ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;document.body.append(ghost)}ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;clearDragMarks();board.children[gesture.index]?.classList.add('dragging');const target=tileAtPoint(e.clientX,e.clientY);if(target>=0&&target!==gesture.index)board.children[target]?.classList.add('drop-target')});
board.addEventListener('pointerup',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;const {index,x,y}=gesture;gesture=null;clearDragMarks();clearGhost();if(Math.hypot(e.clientX-x,e.clientY-y)<18)return;ignoreClick=true;setTimeout(()=>ignoreClick=false,50);swap(index,tileAtPoint(e.clientX,e.clientY))});
board.addEventListener('pointercancel',()=>{gesture=null;clearDragMarks();clearGhost()});
board.addEventListener('click',e=>{if(ignoreClick||!playing||paused)return;const tile=e.target.closest('.tile');if(!tile)return;const index=Number(tile.dataset.index);if(selected>=0&&selected!==index){swap(selected,index)}else{selected=selected===index?-1:index;renderBoard();if(selected>=0)board.children[selected]?.focus()}});
board.addEventListener('keydown',e=>{if(!playing||paused)return;const tile=e.target.closest('.tile');if(!tile)return;const index=Number(tile.dataset.index);const delta={ArrowUp:-size,ArrowDown:size,ArrowLeft:-1,ArrowRight:1}[e.key];if(delta===undefined)return;e.preventDefault();const target=index+delta;if(target>=0&&target<pieces.length&&adjacent(index,target)){swap(index,target);board.children[target]?.focus()}});
document.querySelectorAll('#difficulty button').forEach(button=>button.addEventListener('click',()=>{const n=Number(button.dataset.size);if(n!==size && !['daily','sprint'].includes(mode))confirmRestart(()=>setDifficulty(n),'換個難度，重新出發？','目前盤面會被新的難度取代。已使用的道具不會退還。')}));
$('continueButton').addEventListener('click',()=>{const session=readActiveSession();session?resumeGame(session):openGame(nextLevel())});
$('hintButton').addEventListener('click',showHint);
$('previewButton').addEventListener('click',()=>{if(!playing)return;tickTimer();if(!playing)return;paused=true;saveActiveSession();updateTools();openFeature('preview')});
for(const id of ['closeButton','backButton','galleryButton','pauseHomeButton'])$(id).addEventListener('click',closeGame);
$('pauseButton').addEventListener('click',pauseGame);$('resumeButton').addEventListener('click',resumePaused);
$('pauseDialog').addEventListener('cancel',event=>{event.preventDefault(); if($('pauseDialog').dataset.expired!=='true')resumePaused();});
$('confirmAccept').addEventListener('click',()=>finishConfirm(true));$('confirmCancel').addEventListener('click',()=>finishConfirm(false));$('confirmDialog').addEventListener('cancel',event=>{event.preventDefault();finishConfirm(false)});
$('nextButton').addEventListener('click',()=>{const unlockedCount=scenes.every(scene=>isCompleted(scene.index))?TOTAL_LEVELS:nextLevel()+1;openGame(mode==='journey'?(current+1)%TOTAL_LEVELS:mode==='zen'?(current+1)%unlockedCount:mode==='daily'?S.dailyIndex(S.dayKey(),TOTAL_LEVELS):current,mode,true)});
$('soundButton').addEventListener('click',()=>{refreshProfile();profile.settings.sound=!profile.settings.sound;saveProfile();applySettings()});
$('checkinButton').addEventListener('click',checkIn);
$('dailyModeButton').addEventListener('click',()=>openGame(S.dailyIndex(S.dayKey(),TOTAL_LEVELS),'daily'));
$('sprintModeButton').addEventListener('click',()=>openGame(nextLevel(),'sprint'));
$('zenModeButton').addEventListener('click',()=>openGame(nextLevel(),'zen'));
for(const [id,kind] of [['walletButton','shop'],['shopButton','shop'],['collectionButton','collection'],['settingsButton','settings'],['guideButton','guide'],['mobileShopButton','shop'],['mobileCollectionButton','collection']])$(id).addEventListener('click',()=>openFeature(kind));
$('worldNav').addEventListener('click',event=>{
  const button=event.target.closest('[data-world]');if(!button)return;
  selectedWorld=Number(button.dataset.world);const world=worlds[selectedWorld],active=Math.floor(nextLevel()/CHAPTER_SIZE);
  selectedChapter=world.chapters.includes(active)?active:world.chapters[0];renderGallery();
  $('worldNav').querySelector(`[data-world="${selectedWorld}"]`)?.focus({preventScroll:true});
});
$('downloadWorldButton').addEventListener('click',async()=>{
  if(!('serviceWorker'in navigator)){toast('此瀏覽器不支援離線圖片保存。');return;}
  const worldId=selectedWorld;downloadingWorld=worldId;renderWorldNav();
  try{const registration=await navigator.serviceWorker.ready;(navigator.serviceWorker.controller||registration.active)?.postMessage({type:'DOWNLOAD_WORLD',worldId});}
  catch{downloadingWorld=null;renderWorldNav();toast('離線圖片保存未完成，請保持連線後再試。');}
});
$('fantasyPromoButton').addEventListener('click',()=>{const active=Math.floor(nextLevel()/CHAPTER_SIZE);selectedChapter=worlds[worlds.length-1].chapters.includes(active)?active:worlds[worlds.length-1].chapters[0];renderGallery();$('adventureSection').scrollIntoView({behavior:profile.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});$('worldNav').querySelector(`[data-world="${worlds.length-1}"]`)?.focus({preventScroll:true});});
$('supplyJumpButton').addEventListener('click',()=>{$('supplySection').scrollIntoView({behavior:profile.settings.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});$('checkinButton').focus({preventScroll:true});});
if('IntersectionObserver' in window){
  const sectionObserver=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      document.querySelectorAll('.lobby-nav a,.mobile-game-nav a').forEach(link=>{const active=link.getAttribute('href')===`#${entry.target.id}`;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
      $('supplyJumpButton').classList.toggle('active',entry.target.id==='supplySection');
    }
  },{rootMargin:'-15% 0px -65% 0px'});
  for(const id of ['adventureSection','supplySection','modesSection','questsSection'])sectionObserver.observe($(id));
}
$('featureClose').addEventListener('click',()=>$('featureDialog').close());
$('featureDialog').addEventListener('click',event=>{if(event.target===$('featureDialog'))$('featureDialog').close()});
$('featureDialog').addEventListener('close',()=>{if(playing&&paused&&!$('pauseDialog').open&&!$('confirmDialog').open){paused=false;timerMark=performance.now();updateTools()}featureReturnFocus?.focus({preventScroll:true})});
$('featureContent').addEventListener('click',event=>{const buy=event.target.closest('[data-buy]'),setting=event.target.closest('[data-setting]');if(buy){refreshProfile();if(S.purchase(profile,buy.dataset.buy)){saveProfile();renderLobby();openFeature('shop');toast(`已兌換${S.ITEMS[buy.dataset.buy].name} ×1`);$('featureContent').querySelector(`[data-buy="${buy.dataset.buy}"]`)?.focus()}else toast('星砂不足，先完成任務或拼圖吧。')}if(setting){refreshProfile();profile.settings[setting.dataset.setting]=!profile.settings[setting.dataset.setting];saveProfile();applySettings();openFeature('settings');$('featureContent').querySelector(`[data-setting="${setting.dataset.setting}"]`)?.focus()}});
$('questGrid').addEventListener('click',event=>{const button=event.target.closest('[data-quest]');if(!button)return;refreshProfile();const reward=S.claimQuest(profile,button.dataset.quest);if(reward){saveProfile();renderLobby();toast(`任務獎勵：＋${reward} 星砂`);playTone(740)}});
for(const id of Object.keys(S.ITEMS))$(`${id}Tool`).addEventListener('click',()=>useTool(id));
window.addEventListener('popstate',()=>{if($('gameOverlay').hidden)return;try{history.pushState({shijingGame:true},'',`${baseUrl}#game`);gameHistoryActive=true}catch{}showBackNotice()});
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(event.key==='Escape'&&!$('gameOverlay').hidden){event.preventDefault();if(!$('winOverlay').hidden)closeGame();else pauseGame()}
  if(event.key==='Tab'&&!$('gameOverlay').hidden){const root=$('winOverlay').hidden?$('gameOverlay'):$('winOverlay');const focusable=[...root.querySelectorAll('button:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseGame();saveActiveSession()}else renderLobby()});
window.addEventListener('pagehide',saveActiveSession);
window.addEventListener('storage',()=>{refreshRecords();renderGallery();if(playing)toast('另一個分頁更新了進度與補給。')});
// Refresh daily rewards when the local date rolls over while the lobby is open.
setInterval(()=>{if(profile.quests.date!==S.dayKey())renderLobby()},30000);
function isInstalled(){return window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true}
function showInstallGuide(){const apple=/iphone|ipad|ipod/i.test(navigator.userAgent)||(/macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);const android=/android/i.test(navigator.userAgent);$('installInstructions').textContent=apple?'請先關閉此說明，再於 Safari 點「分享」→「加入主畫面」→「加入」。':android?'請先關閉此說明，再於 Chrome 點右上角「⋮」，選「安裝應用程式」或「加到主畫面」。':'請先關閉此說明，再使用 Chrome 或 Edge 網址列的安裝圖示，或從瀏覽器選單選擇安裝。';$('installDialog').showModal()}
$('installButton').addEventListener('click',async()=>{if(!deferredInstallPrompt){showInstallGuide();return}deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null});$('installClose').addEventListener('click',()=>$('installDialog').close());$('installDialog').addEventListener('click',e=>{if(e.target===$('installDialog'))$('installDialog').close()});window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e});window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;$('installButton').hidden=true});if(isInstalled())$('installButton').hidden=true;
renderGallery();
if('serviceWorker'in navigator){
  const hadController=Boolean(navigator.serviceWorker.controller);
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController||refreshing)return;
    refreshing=true;
    window.location.reload();
  });
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.version!=='14')return;
    if(event.data?.type==='OFFLINE_STATUS')$('offlineStatus').textContent=event.data.ready?`✓ 遊戲已離線準備 · ${event.data.cachedImages} / ${TOTAL_LEVELS} 幅風景已保存；可另存各世界圖片。`:'正在準備離線遊戲介面，請保持連線。';
    if(event.data?.type==='OFFLINE_PROGRESS')$('offlineStatus').textContent=event.data.worldId===undefined?`正在沿用既有離線風景：${event.data.done} / ${event.data.total}`:`正在保存${worlds[event.data.worldId]?.title||'世界'}離線圖片：${event.data.done} / ${event.data.total}`;
    if(event.data?.type==='OFFLINE_WORLD_STATUS'){
      if(event.data.worldId===downloadingWorld){downloadingWorld=null;renderWorldNav();}
      $('offlineStatus').textContent=event.data.failed?`離線圖片已保存 ${event.data.done} / ${event.data.total} 幅，${event.data.failed} 幅下次連線時可再試。`:`✓ ${worlds[event.data.worldId]?.title||'世界'}離線圖片已保存：${event.data.done} / ${event.data.total}`;
    }
  });
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=14',{updateViaCache:'none'})
    .then(registration=>{
      const observe=worker=>worker?.addEventListener('statechange',()=>{if(worker.state==='redundant')$('offlineStatus').textContent='離線準備未完成，連線後重新開啟遊戲即可再試。';});
      observe(registration.installing);registration.addEventListener('updatefound',()=>observe(registration.installing));
      return registration.update().catch(()=>{}).then(()=>navigator.serviceWorker.ready);
    })
    .then(registration=>registration.active?.postMessage({type:'CHECK_OFFLINE'}))
    .catch(()=>$('offlineStatus').textContent='此瀏覽器無法啟用離線快取。'));
}else $('offlineStatus').textContent='此瀏覽器不支援離線快取。';
