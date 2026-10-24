const { test, expect } = require('@playwright/test');
const S = require('../../progression.js');
const D = require('../../game-data.js');
const PROFILE = 'shijing-profile-v1', SESSION = 'shijing-active-session';
const nearWin = (mode='journey') => ({ current:mode==='daily'?S.dailyIndex(S.dayKey(),D.TOTAL_LEVELS):0,size:4,pieces:[1,0,...Array.from({length:14},(_,i)=>i+2)],moves:2,seconds:20,hints:2,mode,date:S.dayKey(),dailyPool:D.TOTAL_LEVELS,bonus:0 });
async function seed(page, values) {
  await page.addInitScript(entries => { if (!sessionStorage.getItem('test-seeded')) { for (const [key,value] of Object.entries(entries)) localStorage.setItem(key,JSON.stringify(value)); sessionStorage.setItem('test-seeded','yes'); } }, values);
}
async function begin(page) { await page.goto('/'); await expect(page.locator('#dailyModeButton')).toBeVisible(); }
async function solveNearWin(page) { await page.locator('#continueButton').click(); await page.locator('.tile').nth(0).click(); await page.locator('.tile').nth(1).click(); await expect(page.locator('#winOverlay')).toBeVisible(); }
test.beforeEach(async ({page}) => { page._errors=[];page.on('pageerror',error=>page._errors.push(error.message)); });
test.afterEach(async ({page}) => { expect(page._errors).toEqual([]); });

test('lobby, metadata and responsive layout are complete',async({page},info)=>{
  test.setTimeout(90000);
  await begin(page);
  await expect(page).toHaveTitle(/免費線上風景拼圖/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://lian0123.github.io/puzzle-game/');
  const schema=await page.locator('script[type="application/ld+json"]').textContent();expect(JSON.parse(schema)['@type']).toBe('VideoGame');
  await expect(page.locator('.mode-card')).toHaveCount(3);await expect(page.locator('.checkin-day')).toHaveCount(7);await expect(page.locator('.map-node')).toHaveCount(20);
  await expect(page.locator('.map-node:not(:disabled)')).toHaveCount(1);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
  await page.setViewportSize(info.project.name==='mobile'?{width:390,height:844}:{width:1440,height:1000});
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`qa/${info.project.name}-lobby.png`,fullPage:true,animations:'disabled',scale:'css'});
});
test('daily supply can only be claimed once and survives reload',async({page})=>{
  await begin(page);await expect(page.locator('#supplyBadge')).toBeVisible();await page.locator('#checkinButton').click();await expect(page.locator('#supplyBadge')).toBeHidden();await expect(page.locator('#balanceDisplay')).toHaveText('140');
  await expect(page.locator('#checkinButton')).toBeDisabled();await page.reload();await expect(page.locator('#balanceDisplay')).toHaveText('140');await expect(page.locator('#checkinButton')).toBeDisabled();
});
test('seventh day bonus, streak and lifetime badge are visible',async({page})=>{
  const profile=S.fresh(),date=new Date();date.setDate(date.getDate()-1);profile.lastCheckIn=S.dayKey(date);profile.streak=6;profile.bestStreak=6;
  await seed(page,{[PROFILE]:profile});await begin(page);await page.locator('#checkinButton').click();await expect(page.locator('#balanceDisplay')).toHaveText('200');
  await page.locator('#collectionButton').click();await expect(page.locator('.badge.earned')).toContainText('七日拾光');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),PROFILE);expect(saved.inventory.compass).toBe(3);
});
test('shop exchanges inventory without spending more than balance',async({page})=>{
  await begin(page);await page.locator('#shopButton').click();await page.locator('[data-buy="compass"]').click();
  await expect(page.locator('#balanceDisplay')).toHaveText('60');await expect(page.locator('.shop-item').first()).toContainText('背包中有 3 個');
  await page.locator('[data-buy="compass"]').click();await expect(page.locator('#balanceDisplay')).toHaveText('0');for (const button of await page.locator('[data-buy]').all()) await expect(button).toBeDisabled();
});
test('daily quests claim once and preserve rewards',async({page})=>{
  const profile=S.fresh();profile.quests.wins=1;profile.quests.swaps=30;
  await seed(page,{[PROFILE]:profile});await begin(page);await page.locator('[data-quest="wins"]').click();await expect(page.locator('#balanceDisplay')).toHaveText('150');
  await expect(page.locator('[data-quest="wins"]')).toBeDisabled();await page.locator('[data-quest="swaps"]').click();await expect(page.locator('#balanceDisplay')).toHaveText('175');
  await page.reload();await expect(page.locator('[data-quest="wins"]')).toBeDisabled();
});
test('journey accepts tile clicks, hints, undo and saves exact board',async({page},info)=>{
  await begin(page);await page.locator('#continueButton').click();await expect(page.locator('.tile')).toHaveCount(16);
  const before=await page.evaluate(()=>[...pieces]);await page.locator('.tile').nth(0).click();await page.locator('.tile').nth(1).click();await expect(page.locator('#movesDisplay')).toHaveText('1');
  await page.locator('#undoTool').click();expect(await page.evaluate(()=>[...pieces])).toEqual(before);await expect(page.locator('#movesDisplay')).toHaveText('2');await expect(page.locator('#undoTool')).toBeDisabled();
  await page.locator('#hintButton').click();await expect(page.locator('#hintCount')).toHaveText('1');await page.locator('#hintButton').click();await expect(page.locator('#hintButton')).toBeDisabled();
  await page.screenshot({path:`qa/${info.project.name}-game.png`,animations:'disabled',scale:'css'});
  await page.locator('#closeButton').click();await expect(page.locator('#continueButton')).toContainText('繼續');await page.reload();await page.locator('#continueButton').click();expect(await page.evaluate(()=>[...pieces])).toEqual(before);await expect(page.locator('#movesDisplay')).toHaveText('2');
});
test('touch drag exchanges distant tiles',async({page})=>{
  await begin(page);await page.locator('#continueButton').click();const before=await page.evaluate(()=>[...pieces]);
  const a=await page.locator('.tile').nth(0).boundingBox(),b=await page.locator('.tile').nth(15).boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator('#movesDisplay')).toHaveText('1');const after=await page.evaluate(()=>[...pieces]);expect(after[0]).toBe(before[15]);expect(after[15]).toBe(before[0]);
});
test('keyboard swaps cannot wrap across a row',async({page})=>{
  await begin(page);await page.locator('#continueButton').click();await page.locator('.tile').nth(3).focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#movesDisplay')).toHaveText('0');
  await page.keyboard.press('ArrowDown');await expect(page.locator('#movesDisplay')).toHaveText('1');
});
test('difficulty changes protect the board without a reset button',async({page})=>{
  await begin(page);await page.locator('#continueButton').click();const before=await page.evaluate(()=>[...pieces]);await page.locator('[data-size="5"]').click();await expect(page.locator('#confirmDialog')).toBeVisible();
  await page.locator('#confirmCancel').click();expect(await page.evaluate(()=>[...pieces])).toEqual(before);await page.locator('[data-size="5"]').click();await page.locator('#confirmAccept').click();await expect(page.locator('.tile')).toHaveCount(25);
  await expect(page.locator('#shuffleButton')).toHaveCount(0);await page.locator('[data-size="6"]').click();await page.keyboard.press('Escape');await expect(page.locator('.tile')).toHaveCount(25);expect(await page.evaluate(()=>paused)).toBeFalsy();
});
test('pause and full reference image stop clock and resume safely',async({page})=>{
  await page.clock.install();await begin(page);await page.locator('#continueButton').click();await page.clock.fastForward(5000);expect(await page.evaluate(()=>seconds)).toBeGreaterThanOrEqual(5);
  await page.locator('#pauseButton').click();const pausedTime=await page.locator('#timeDisplay').textContent();await page.clock.fastForward(30000);await expect(page.locator('#timeDisplay')).toHaveText(pausedTime);await page.locator('#resumeButton').click();
  await page.locator('#previewButton').click();await expect(page.locator('.reference-image')).toBeVisible();const previewSeconds=await page.evaluate(()=>seconds),previewTime=await page.locator('#timeDisplay').textContent();await page.clock.fastForward(10000);await expect(page.locator('#timeDisplay')).toHaveText(previewTime);await page.locator('#featureClose').click();await expect.poll(()=>page.evaluate(()=>paused)).toBeFalsy();await page.clock.fastForward(2000);expect(await page.evaluate(()=>seconds)).toBeGreaterThanOrEqual(previewSeconds+2);
});
test('journey win unlocks next level, grants rewards and enters collection',async({page},info)=>{
  await seed(page,{[SESSION]:nearWin()});await begin(page);await solveNearWin(page);await expect(page.locator('#winReward')).toContainText('45');
  await page.screenshot({path:`qa/${info.project.name}-win.png`,animations:'disabled',scale:'css'});
  await page.locator('#galleryButton').click();await expect(page.locator('#balanceDisplay')).toHaveText('165');await expect(page.locator('.map-node:not(:disabled)')).toHaveCount(2);await expect(page.locator('[data-quest="wins"]')).toBeEnabled();
  await page.locator('#collectionButton').click();await expect(page.locator('.album-card')).toHaveCount(1);await expect(page.locator('.album-card img')).toHaveAttribute('alt',/晨霧山谷/);
});
test('compass completes final pair and consumes exactly one item',async({page})=>{
  await seed(page,{[SESSION]:nearWin()});await begin(page);await page.locator('#continueButton').click();await page.locator('#compassTool').click();await expect(page.locator('#winOverlay')).toBeVisible();
  const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),PROFILE);expect(state.inventory.compass).toBe(1);expect(state.balance).toBe(165);
});
test('replaying a completed level cannot duplicate the first win reward',async({page})=>{
  const profile=S.fresh();profile.rewards=['journey:0:4'];await seed(page,{[PROFILE]:profile,[SESSION]:nearWin(),'shijing-records':{'0-4':{time:30,moves:20}}});await begin(page);await solveNearWin(page);await expect(page.locator('#winReward')).toContainText('已領取');
  await page.locator('#galleryButton').click();await expect(page.locator('#balanceDisplay')).toHaveText('120');
});
test('daily mode is deterministic, resumes and never unlocks journey',async({page})=>{
  await begin(page);await page.locator('#dailyModeButton').click();const original=await page.evaluate(()=>[...pieces]);await expect(page.locator('[data-size="5"]')).toBeDisabled();await expect(page.locator('#shuffleButton')).toHaveCount(0);await page.locator('#closeButton').click();await page.locator('#dailyModeButton').click();await page.locator('#confirmAccept').click();expect(await page.evaluate(()=>[...pieces])).toEqual(original);
  await page.locator('#closeButton').click();await expect(page.locator('#continueButton')).toContainText('每日一景');await page.locator('#continueButton').click();expect(await page.evaluate(()=>[...pieces])).toEqual(original);
});
test('daily win grants 80 and makes daily quest claimable without journey unlock',async({page})=>{
  await seed(page,{[SESSION]:nearWin('daily')});await begin(page);await solveNearWin(page);await expect(page.locator('#winReward')).toContainText('80');await page.locator('#galleryButton').click();
  await expect(page.locator('.map-node:not(:disabled)')).toHaveCount(1);await expect(page.locator('[data-quest="daily"]')).toBeEnabled();await expect(page.locator('#balanceDisplay')).toHaveText('200');
});
test('sprint countdown, sandglass and timeout restart operate correctly',async({page})=>{
  const frozenTime=Date.now()+60000;await page.clock.install({time:frozenTime-1000});await page.clock.pauseAt(frozenTime);await begin(page);await page.locator('#sprintModeButton').click();await expect(page.locator('#timeDisplay')).toHaveText('03:00');await page.locator('#freezeTool').click();await expect(page.locator('#timeDisplay')).toHaveText('03:30');await expect(page.locator('#freezeTool')).toBeDisabled();
  await page.clock.fastForward(211000);await expect(page.locator('#pauseTitle')).toContainText('時間到了');expect(await page.evaluate(key=>localStorage.getItem(key),SESSION)).toBeNull();
  await page.locator('#resumeButton').click();await expect(page.locator('#timeDisplay')).toHaveText('03:00');await expect(page.locator('#pauseButton')).toBeEnabled();await expect(page.locator('#freezeTool')).toBeDisabled();
});
test('zen shows no timer, disables sprint tool and preserves mode on resume',async({page})=>{
  await begin(page);await page.locator('#zenModeButton').click();await expect(page.locator('#timeDisplay')).toHaveText('∞');await expect(page.locator('#freezeTool')).toBeDisabled();await page.locator('#closeButton').click();await page.reload();await page.locator('#continueButton').click();await expect(page.locator('#gameModeBadge')).toHaveText('禪意時光');
});
test('settings persist and reduced motion is respected',async({page})=>{
  await begin(page);await page.locator('#settingsButton').click();await page.locator('[data-setting="motion"]').click();await page.locator('[data-setting="sound"]').click();await page.locator('#featureClose').click();
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-motion','off');await expect(page.locator('#soundButton')).toHaveAttribute('aria-pressed','false');
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.floating-piece').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
test('corrupt saves recover and valid legacy progress is kept',async({page})=>{
  await seed(page,{[PROFILE]:{version:1,balance:-5},[SESSION]:{current:0,size:4,pieces:Array(16).fill(0)},'shijing-records':{'0-4':{time:25,moves:10},'1-4':{time:-1,moves:0}}});
  await begin(page);await expect(page.locator('#balanceDisplay')).toHaveText('120');await expect(page.locator('#levelProgress')).toHaveText('已完成 1 / 500 關');await page.locator('#continueButton').click();await expect(page.locator('#gameTitle')).toHaveText('蔚藍海岸');
});
test('opening another mode protects the saved board',async({page})=>{
  await begin(page);await page.locator('#continueButton').click();const original=await page.evaluate(()=>[...pieces]);await page.locator('#closeButton').click();await page.locator('#dailyModeButton').click();await expect(page.locator('#confirmDialog')).toBeVisible();await page.locator('#confirmCancel').click();await page.locator('#continueButton').click();expect(await page.evaluate(()=>[...pieces])).toEqual(original);
});
test('final landscape completes all 500 levels and safely returns to first scene',async({page})=>{
  const records=Object.fromEntries(Array.from({length:499},(_,index)=>[`${index}-4`,{time:60,moves:20}]));
  await seed(page,{'shijing-records':records,[SESSION]:{...nearWin(),current:499}});await begin(page);await solveNearWin(page);
  await expect(page.locator('#winText')).toContainText('全部 500 關');await expect(page.locator('#nextButton')).toHaveText('重玩第一關 →');
  await page.locator('#galleryButton').click();await expect(page.locator('#levelProgress')).toHaveText('已完成 500 / 500 關');await expect(page.locator('.map-node.completed')).toHaveCount(20);
  await page.locator('#continueButton').click();await expect(page.locator('#gameTitle')).toHaveText('晨霧山谷');
});
test.describe('offline cache',()=>{
test.use({serviceWorkers:'allow'});
test('world art can be saved once and played without a network connection',async({page,context})=>{
  test.setTimeout(90000);const records=Object.fromEntries(Array.from({length:400},(_,i)=>[`${i}-4`,{time:60,moves:20}]));await seed(page,{'shijing-records':records});await begin(page);
  await expect(page.locator('#offlineStatus')).toContainText('✓ 遊戲已離線準備',{timeout:45000});await page.locator('[data-world="4"]').click();await page.locator('#downloadWorldButton').click();
  await expect(page.locator('#offlineStatus')).toContainText('外星世界離線圖片已保存：100 / 100',{timeout:45000});
  expect(await page.evaluate(async()=>{const cache=await caches.open('shijing-v14');return Boolean(await cache.match(new URL('./assets/landscape-401.jpg',location.href).href)&&await cache.match(new URL('./assets/landscape-500.jpg',location.href).href)&&await cache.match(new URL('./assets/landscape-300.jpg',location.href).href))})).toBeTruthy();
  await page.reload();await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.locator('#continueButton').click();await expect(page.locator('#gameTitle')).toHaveText('雙日沙丘');await expect(page.locator('.tile')).toHaveCount(16);
  const width=await page.locator('.tile').first().evaluate(async tile=>{const image=new Image();image.src=tile.style.backgroundImage.slice(5,-2);await image.decode();return image.naturalWidth;});expect(width).toBe(1024);await context.setOffline(false);
});

});

test('world portals show locked fantasy routes without exposing puzzle art',async({page})=>{
  await begin(page);await expect(page.locator('.world-card')).toHaveCount(5);await expect(page.locator('.chapter-tab')).toHaveCount(5);
  await page.locator('[data-world="1"]').click();await expect(page.locator('.chapter-tab')).toHaveCount(5);await expect(page.locator('#mapChapterTitle')).toHaveText('浮空花園');
  await expect(page.locator('.map-node:not(:disabled)')).toHaveCount(0);await expect(page.locator('[data-level="100"]')).toHaveAccessibleName(/尚未解鎖/);
  for(const selector of ['#mapShell','.world-card[data-world="1"]','.chapter-tab[data-chapter="5"]','.chapter-tab[data-chapter="6"]'])expect(await page.locator(selector).evaluate(el=>el.getAttribute('style'))).not.toContain('landscape-1');
  await page.locator('[data-chapter="6"]').click();await expect(page.locator('#mapChapterTitle')).toHaveText('月光精靈森');await expect(page.locator('[data-level="139"]')).toBeDisabled();
  await page.locator('#mapJumpButton').click();await expect(page.locator('#mapChapterTitle')).toHaveText('晨光啟程');await expect(page.locator('.chapter-tab')).toHaveCount(5);
});
test('stage 100 opens fantasy world; stage 120 opens moonlight forest',async({page})=>{
  const records=Object.fromEntries(Array.from({length:99},(_,i)=>[`${i}-4`,{time:60,moves:20}]));
  await seed(page,{'shijing-records':records,[SESSION]:{...nearWin(),current:99}});await begin(page);await solveNearWin(page);
  await expect(page.locator('#winMilestone')).toContainText('幻想世界已解鎖');await expect(page.locator('#nextButton')).toHaveText('前往幻想世界 →');
  await page.locator('#nextButton').click();await expect(page.locator('#gameTitle')).toHaveText('浮空花庭');await expect(page.locator('#gameLevelTag')).toHaveText('STAGE 101 / 500');
  await page.locator('#closeButton').click();await expect(page.locator('#playerLevel')).toHaveText('LV. 11');await expect(page.locator('#chapterStat')).toHaveText('5 / 25');await expect(page.locator('.world-card[data-world="1"]')).toHaveAttribute('aria-pressed','true');
  await page.evaluate(({session,key})=>{localStorage.setItem('shijing-records',JSON.stringify(Object.fromEntries(Array.from({length:119},(_,i)=>[`${i}-4`,{time:60,moves:20}]))));localStorage.setItem(key,JSON.stringify(session));},{session:{...nearWin(),current:119},key:SESSION});
  await page.reload();await solveNearWin(page);await expect(page.locator('#nextButton')).toHaveText('進入月光精靈森 →');await page.locator('#nextButton').click();await expect(page.locator('#gameTitle')).toHaveText('月光林門');await expect(page.locator('#gameLevelTag')).toContainText('121');
});
test('all 200 new stages open with distinct decoded art and compatible saves',async({page},info)=>{
  test.setTimeout(600000);
  const records=Object.fromEntries(Array.from({length:300},(_,i)=>[`${i}-4`,{time:60,moves:20}]));
  const profile=S.fresh();profile.settings.motion=false;
  await seed(page,{'shijing-records':records,[PROFILE]:profile});await begin(page);await expect(page.locator('#levelProgress')).toHaveText('已完成 300 / 500 關');await expect(page.locator('#playerLevel')).toHaveText('LV. 31');
  const files=new Set();
  for(let index=300;index<500;index++){
    const world=Math.floor(index/100),chapter=Math.floor(index/20);
    if(index%20===0){await page.locator(`[data-world="${world}"]`).click();await page.locator(`[data-chapter="${chapter}"]`).click();}
    await page.locator(`[data-level="${index}"]`).click();await expect(page.locator('#gameTitle')).toHaveText(D.scenes[index].title);await expect(page.locator('.tile')).toHaveCount(16);
    const art=await page.locator('.tile').first().evaluate(async tile=>{const url=tile.style.backgroundImage.slice(5,-2);const image=new Image();image.src=url;await image.decode();return {url,width:image.naturalWidth,height:image.naturalHeight};});
    expect(art.width).toBe(1024);expect(art.height).toBe(1024);expect(art.url).toContain(D.scenes[index].url);files.add(art.url);
    if(index===400)await page.screenshot({path:`qa/${info.project.name}-alien-game.png`,animations:'disabled',scale:'css'});
    await page.locator('#closeButton').click();const session=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SESSION);expect(session.current).toBe(index);expect(S.permutation(session.pieces,4)).toBeTruthy();
    await page.evaluate(key=>localStorage.removeItem(key),SESSION);
  }
  expect(files.size).toBe(200);await page.locator('#collectionButton').click();await expect(page.locator('.album-card')).toHaveCount(300);await expect(page.locator('.badge.earned').filter({hasText:'古風雅客'})).toBeVisible();
});
test('fantasy map renders unlocked stage 101 and hides later scenes',async({page},info)=>{
  const records=Object.fromEntries(Array.from({length:100},(_,i)=>[`${i}-4`,{time:60,moves:20}]));
  await seed(page,{'shijing-records':records});await begin(page);await expect(page.locator('#mapChapterTitle')).toHaveText('浮空花園');await expect(page.locator('.map-node:not(:disabled)')).toHaveCount(1);
  await expect(page.locator('[data-level="100"]')).toHaveAccessibleName(/浮空花庭/);await expect(page.locator('[data-level="101"]')).toHaveAccessibleName(/尚未解鎖/);await expect(page.locator('#heroStageTitle')).toContainText('101 · 浮空花庭');
  await page.locator('#adventureSection').scrollIntoViewIfNeeded();await page.screenshot({path:`qa/${info.project.name}-fantasy-map.png`,fullPage:true,animations:'disabled',scale:'css'});
});
test('legacy daily save resumes its original image and cannot earn twice after expansion',async({page})=>{
  const date=S.dayKey(),oldIndex=S.dailyIndex(date,100),profile=S.fresh();profile.rewards=[`daily:${date}:${oldIndex}:4`];
  const legacy={...nearWin('daily'),current:oldIndex};delete legacy.dailyPool;
  await seed(page,{[SESSION]:legacy,[PROFILE]:profile});await begin(page);await page.locator('#continueButton').click();await expect(page.locator('#gameTitle')).toHaveText(D.scenes[oldIndex].title);await page.locator('#closeButton').click();await page.reload();await solveNearWin(page);await expect(page.locator('#winReward')).toContainText('已領取');
  await expect(page.locator('#nextButton')).toHaveText('挑戰今日一景 →');await page.locator('#nextButton').click();await expect(page.locator('#gameTitle')).toHaveText(D.scenes[S.dailyIndex(date,D.TOTAL_LEVELS)].title);
  const newBoard=await page.evaluate(()=>[...pieces]);await page.locator('#closeButton').click();await expect(page.locator('#dailyTag')).toHaveText('今日已完成 ✓');await expect(page.locator('#balanceDisplay')).toHaveText('120');
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SESSION);expect(stored.dailyPool).toBe(500);expect(S.normalizeSession(stored,500)).not.toBeNull();await page.reload();await page.locator('#continueButton').click();expect(await page.evaluate(()=>[...pieces])).toEqual(newBoard);
});
test('mobile shortcuts open supplies and collection and hide during a puzzle',async({page},info)=>{
  await begin(page);if(info.project.name!=='mobile'){await expect(page.locator('.mobile-game-nav')).toBeHidden();return;}
  await expect(page.locator('.mobile-game-nav')).toBeVisible();await page.locator('#mobileShopButton').click();await expect(page.locator('#featureTitle')).toHaveText('旅途補給站');await page.locator('#featureClose').click();
  await page.locator('#mobileCollectionButton').click();await expect(page.locator('#featureTitle')).toHaveText('我的風景收藏');await page.locator('#featureClose').click();await page.locator('#continueButton').click();await expect(page.locator('.mobile-game-nav')).toBeHidden();
  await page.locator('#closeButton').click();await expect(page.locator('.mobile-game-nav')).toBeVisible();await page.locator('#supplyJumpButton').click();await expect(page.locator('#checkinButton')).toBeInViewport();
});

test.describe('offline upgrade',()=>{
  test.use({serviceWorkers:'allow'});
test('v14 reuses v13 art, keeps existing progress and removes only obsolete app caches',async({page})=>{
    test.setTimeout(90000);
    await page.route('**/upgrade-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Upgrade fixture</title>'}));await page.goto('/upgrade-test');
    await page.evaluate(async()=>{
      const url=new URL('/assets/landscape-01.jpg',location.href),response=await fetch(url),headers=new Headers(response.headers);headers.set('x-shijing-cache-source','v13');
      const old=await caches.open('shijing-v13');await old.put(url,new Response(await response.blob(),{status:200,headers}));await caches.open('other-app-preserve');
      localStorage.setItem('shijing-records',JSON.stringify(Object.fromEntries(Array.from({length:140},(_,i)=>[`${i}-4`,{time:60,moves:20}]))));
    });
    await begin(page);await expect(page.locator('#offlineStatus')).toContainText('✓ 遊戲已離線準備',{timeout:60000});
    const result=await page.evaluate(async()=>({keys:await caches.keys(),source:(await(await caches.open('shijing-v14')).match(new URL('/assets/landscape-01.jpg',location.href))).headers.get('x-shijing-cache-source')}));
    expect(result.source).toBe('v13');expect(result.keys).not.toContain('shijing-v13');expect(result.keys).toContain('other-app-preserve');
    await expect(page.locator('#levelProgress')).toHaveText('已完成 140 / 500 關');await expect(page.locator('#heroStageTitle')).toContainText('141 · 水晶之門');
  });
});


test('past daily completion opens today challenge and preserves a valid new session',async({page})=>{
  const date=new Date();date.setDate(date.getDate()-1);const yesterday=S.dayKey(date),today=S.dayKey();
  await seed(page,{[SESSION]:{...nearWin('daily'),date:yesterday,current:S.dailyIndex(yesterday,500)}});await begin(page);await solveNearWin(page);
  await expect(page.locator('#winReward')).toContainText('該日首勝獎勵');await expect(page.locator('#nextButton')).toHaveText('挑戰今日一景 →');await page.locator('#nextButton').click();
  await expect(page.locator('#gameTitle')).toHaveText(D.scenes[S.dailyIndex(today,500)].title);const puzzle=await page.evaluate(()=>[...pieces]);await page.locator('#closeButton').click();
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SESSION);expect(stored.date).toBe(today);expect(stored.current).toBe(S.dailyIndex(today,500));expect(S.normalizeSession(stored,500)).not.toBeNull();
  await expect(page.locator('[data-quest="daily"]')).toBeDisabled();await expect(page.locator('#balanceDisplay')).toHaveText('200');await page.reload();await page.locator('#continueButton').click();expect(await page.evaluate(()=>[...pieces])).toEqual(puzzle);
});

for(const index of [139,159,179,199,219,239,259,279,299,319,339,359,379,399,419,439,459,479])test(`route boundary after stage ${index+1} unlocks the correct next scene`,async({page})=>{
  const records=Object.fromEntries(Array.from({length:index},(_,i)=>[`${i}-4`,{time:60,moves:20}]));
  await seed(page,{'shijing-records':records,[SESSION]:{...nearWin(),current:index}});await begin(page);await solveNearWin(page);
  const next=D.scenes[index+1];
  if(index===199||index===299||index===399){const world=D.worlds[D.scenes[index+1].worldId];await expect(page.locator('#winMilestone')).toContainText(`${world.title}已解鎖`);await expect(page.locator('#nextButton')).toHaveText(`前往${world.title} →`);}
  else await expect(page.locator('#nextButton')).toHaveText(`進入${D.chapters[next.chapter].title} →`);
  await page.locator('#nextButton').click();await expect(page.locator('#gameTitle')).toHaveText(next.title);await page.locator('#closeButton').click();await expect(page.locator('.world-card.active')).toHaveAttribute('data-world',String(next.worldId));await expect(page.locator('.map-node.current')).toHaveAttribute('data-level',String(index+1));
});

test('legacy 140-stage collection keeps the earned fantasy pioneer badge',async({page})=>{
  const records=Object.fromEntries(Array.from({length:140},(_,i)=>[`${i}-4`,{time:60,moves:20}]));
  await seed(page,{'shijing-records':records});await begin(page);await expect(page.locator('#heroStageTitle')).toContainText('141 · 水晶之門');await page.locator('#collectionButton').click();await expect(page.locator('.badge.earned').filter({hasText:'幻想先鋒'})).toBeVisible();await expect(page.locator('.album-card')).toHaveCount(140);
});
