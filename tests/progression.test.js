const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../progression.js');
const today = '2026-10-04';
test('new players receive starter supplies; corrupt data recovers safely', () => {
  const state = S.fresh(today);
  assert.equal(state.balance, 120);
  assert.deepEqual(state.inventory, { compass: 2, undo: 3, freeze: 1 });
  for (const raw of [null, [], 'bad', {version:9}]) assert.deepEqual(S.normalize(raw,today),state);
  const damaged = S.normalize({version:1,balance:-10,inventory:{compass:-1,undo:Infinity,freeze:0},lastCheckIn:'2026-99-99',streak:'7'},today);
  assert.equal(damaged.balance,120); assert.equal(damaged.inventory.freeze,0);assert.equal(damaged.lastCheckIn,'');
});
test('local calendar day and leap dates are validated', () => {
  assert.equal(S.dayKey(new Date(2026,9,4,23,59)),today);
  assert.ok(Number.isFinite(S.dayNumber('2028-02-29')));
  assert.ok(Number.isNaN(S.dayNumber('2026-02-29')));
  assert.equal(S.dayNumber('2026-10-05')-S.dayNumber(today),1);
});
test('sign-in rewards are issued once and reject backdated claims', () => {
  const state=S.fresh(today);assert.deepEqual(S.checkIn(state,today),{day:1,reward:20,bonus:false});
  assert.equal(state.balance,140);assert.equal(S.checkIn(state,today),null);assert.equal(S.checkIn(state,'2026-10-03'),null);
  assert.equal(state.balance,140);assert.equal(state.streak,1);
});
test('seven consecutive days give a bonus; skipped day restarts but keeps badge', () => {
  const state=S.fresh(today);
  for(let i=4;i<=10;i++)S.checkIn(state,`2026-10-${String(i).padStart(2,'0')}`);
  assert.equal(state.balance,400);assert.equal(state.inventory.compass,3);assert.equal(state.streak,7);
  assert.deepEqual(S.checkIn(state,'2026-10-12'),{day:1,reward:20,bonus:false});assert.equal(state.bestStreak,7);
});
test('reward cycle repeats after day seven', () => {
  const state=S.fresh(today);for(let i=4;i<=11;i++)S.checkIn(state,`2026-10-${String(i).padStart(2,'0')}`);
  assert.equal(state.streak,8);assert.equal(state.balance,420);assert.equal(state.inventory.compass,3);
});
test('store checks funds, inventory caps and invalid item IDs', () => {
  const state=S.fresh(today);assert.equal(S.purchase(state,'compass'),true);assert.equal(state.balance,60);
  assert.equal(S.purchase(state,'compass'),true);assert.equal(state.balance,0);assert.equal(S.purchase(state,'undo'),false);
  assert.equal(S.purchase(state,'nope'),false);assert.equal(S.consume(state,'nope'),false);
  state.inventory.freeze=0;assert.equal(S.consume(state,'freeze'),false);
  assert.equal(S.consume(state,'undo'),true);assert.equal(state.inventory.undo,2);
  state.balance=100;state.inventory.undo=999;assert.equal(S.purchase(state,'undo'),false);
});
test('quests require their target, can be claimed once, reset at midnight', () => {
  const state=S.fresh(today);assert.equal(S.claimQuest(state,'wins'),0);state.quests.wins=1;
  assert.equal(S.claimQuest(state,'wins'),30);assert.equal(S.claimQuest(state,'wins'),0);
  assert.equal(S.normalize(state,today).quests.claimed.length,1);
  const tomorrow=S.normalize(state,'2026-10-05');assert.equal(tomorrow.quests.wins,0);assert.deepEqual(tomorrow.quests.claimed,[]);assert.equal(tomorrow.balance,150);
});
test('journey rewards are lifetime per landscape and difficulty', () => {
  const state=S.fresh(today), win={mode:'journey',index:0,size:4,stars:3,date:today};
  assert.equal(S.recordWin(state,win,today),45);assert.equal(S.recordWin(state,win,today),0);
  assert.equal(S.recordWin(state,{...win,date:'2026-10-05'},'2026-10-05'),0);
  assert.equal(S.recordWin(state,{...win,size:5},today),45);assert.equal(state.totalWins,4);
});
test('special mode rewards are daily and old daily sessions do not complete today quest', () => {
  const state=S.fresh(today), win={mode:'daily',index:7,size:4,stars:3,date:today};
  assert.equal(S.recordWin(state,win,today),80);assert.equal(S.recordWin(state,win,today),0);assert.equal(state.quests.daily,2);
  assert.equal(S.recordWin(state,{...win,date:'2026-10-03'},today),80);assert.equal(state.quests.daily,2);
  assert.equal(S.recordWin(state,{...win,mode:'sprint'},today),65);assert.equal(S.recordWin(state,{...win,mode:'zen'},today),15);
});
test('daily board is deterministic, date-specific, valid and never solved', () => {
  const a=S.makePuzzle(4,`daily:${today}`);assert.deepEqual(a,S.makePuzzle(4,`daily:${today}`));
  assert.notDeepEqual(a,S.makePuzzle(4,'daily:2026-10-05'));
  for(const size of [4,5,6])for(let i=0;i<800;i++){const puzzle=S.makePuzzle(size,i);assert.ok(S.permutation(puzzle,size));assert.ok(puzzle.some((p,j)=>p!==j));}
  assert.equal(S.dailyIndex(today),S.dailyIndex(today));assert.ok(S.dailyIndex(today)>=0&&S.dailyIndex(today)<100);
});
test('legacy session migrates to journey, preserves all existing puzzle data', () => {
  const old={current:0,size:4,pieces:S.makePuzzle(4,1),moves:4,seconds:40,hints:1};
  const session=S.normalizeSession(old);assert.equal(session.mode,'journey');assert.deepEqual(session.pieces,old.pieces);assert.equal(session.bonus,0);assert.equal(session.lastSwap,null);
});
test('sessions reject malformed boards, counters, modes and solved states', () => {
  const valid={current:0,size:4,pieces:S.makePuzzle(4,1),moves:4,seconds:40,hints:1};
  for(const change of [{current:100},{current:-1},{size:7},{moves:-1},{seconds:'40'},{hints:3},{pieces:Array(16).fill(0)},{pieces:Array.from({length:16},(_,i)=>i)},{mode:'cheat'},{mode:'daily',size:5,pieces:S.makePuzzle(5,1)}])assert.equal(S.normalizeSession({...valid,...change}),null);
  const sprint=S.normalizeSession({...valid,mode:'sprint',bonus:30,lastSwap:S.makePuzzle(4,2)});assert.equal(sprint.bonus,30);assert.equal(sprint.lastSwap.length,16);
  assert.equal(S.normalizeSession({...valid,mode:'daily',date:'2026-13-01'}),null);
  assert.ok(S.normalizeSession({...valid,mode:'daily',date:today,current:S.dailyIndex(today)}));
});
test('expansion preserves legacy daily sessions and validates the new daily pool',()=>{
  const legacy={current:S.dailyIndex(today,100),size:4,pieces:S.makePuzzle(4,1),moves:4,seconds:40,hints:1,mode:'daily',date:today};
  const restored=S.normalizeSession(legacy,140);assert.ok(restored);assert.equal(restored.dailyPool,100);assert.deepEqual(restored.pieces,legacy.pieces);
  assert.ok(S.normalizeSession({...legacy,current:S.dailyIndex(today,140),dailyPool:140},140));
  for(const pool of [0,141,-1,'140'])assert.equal(S.normalizeSession({...legacy,dailyPool:pool},140),null);
  const state=S.fresh(today);
  assert.equal(S.recordWin(state,{mode:'daily',index:legacy.current,size:4,stars:3,date:today},today),80);
  assert.equal(S.recordWin(state,{mode:'daily',index:(legacy.current+1)%140,size:4,stars:3,date:today},today),0);
  assert.equal(state.balance,200);
});
test('new stages 301 through 800 persist in all difficulties while stage 801 is rejected',()=>{
  for(let current=300;current<800;current++)for(const size of [4,5,6]){
    const raw={current,size,pieces:S.makePuzzle(size,current),moves:3,seconds:30,hints:2};
    assert.equal(S.normalizeSession(raw,800).current,current);
  }
  assert.equal(S.normalizeSession({current:800,size:4,pieces:S.makePuzzle(4,1),moves:0,seconds:0,hints:2},800),null);
});
test('legacy daily pools remain valid after the 800-level expansion',()=>{
  for(const pool of [140,300,500,600,700]){
    const legacy={current:S.dailyIndex(today,pool),dailyPool:pool,size:4,pieces:S.makePuzzle(4,1),moves:4,seconds:40,hints:1,mode:'daily',date:today};
    const restored=S.normalizeSession(legacy,800);assert.ok(restored);assert.equal(restored.dailyPool,pool);assert.deepEqual(restored.pieces,legacy.pieces);
  }
});
