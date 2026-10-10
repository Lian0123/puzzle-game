/* Shared, deterministic progression rules. Browser storage is managed by script.js. */
(function (root) {
  'use strict';
  const ITEMS = {
    compass: { name: '歸位羅盤', icon: '⌖', cost: 60, description: '自動將一塊拼圖放回正確位置。' },
    undo: { name: '時光回溯', icon: '↶', cost: 25, description: '撤銷最近一次交換，步數仍會累計。' },
    freeze: { name: '時間沙漏', icon: '◷', cost: 40, description: '限時衝刺增加 30 秒。' }
  };
  const QUESTS = [
    { id: 'wins', goal: 1, reward: 30, title: '收集一片風景', description: '完成任意一局拼圖' },
    { id: 'swaps', goal: 30, reward: 25, title: '讓靈感流動', description: '累計交換 30 次' },
    { id: 'daily', goal: 1, reward: 50, title: '今日的獨家風景', description: '完成今日每日挑戰' }
  ];
  const integer = (value, fallback = 0, max = 10000000) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fallback;
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function dayNumber(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
    const value = Date.parse(`${key}T00:00:00Z`);
    return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === key ? value / 86400000 : NaN;
  }
  function fresh(today = dayKey()) {
    return { version: 1, balance: 120, inventory: { compass: 2, undo: 3, freeze: 1 }, lastCheckIn: '', streak: 0, bestStreak: 0, totalWins: 0, rewards: [], quests: { date: today, wins: 0, swaps: 0, daily: 0, claimed: [] }, settings: { sound: true, motion: true } };
  }
  function normalize(raw, today = dayKey()) {
    const base = fresh(today);
    if (!raw || typeof raw !== 'object' || raw.version !== 1) return base;
    base.balance = integer(raw.balance, 120);
    for (const id of Object.keys(ITEMS)) base.inventory[id] = integer(raw.inventory?.[id], base.inventory[id], 999);
    base.lastCheckIn = Number.isFinite(dayNumber(raw.lastCheckIn)) ? raw.lastCheckIn : '';
    base.streak = integer(raw.streak, 0, 100000);
    base.bestStreak = Math.max(base.streak, integer(raw.bestStreak, 0, 100000));
    base.totalWins = integer(raw.totalWins);
    base.rewards = Array.isArray(raw.rewards) ? [...new Set(raw.rewards.filter(x => typeof x === 'string' && x.length < 100))] : [];
    base.settings = { sound: raw.settings?.sound !== false, motion: raw.settings?.motion !== false };
    if (raw.quests?.date === today) {
      for (const quest of QUESTS) base.quests[quest.id] = integer(raw.quests[quest.id]);
      base.quests.claimed = Array.isArray(raw.quests.claimed) ? [...new Set(raw.quests.claimed.filter(id => QUESTS.some(q => q.id === id)))] : [];
    }
    return base;
  }
  function checkIn(state, today = dayKey()) {
    if (!Number.isFinite(dayNumber(today)) || (state.lastCheckIn && today <= state.lastCheckIn)) return null;
    state.streak = dayNumber(today) - dayNumber(state.lastCheckIn) === 1 ? state.streak + 1 : 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    const day = (state.streak - 1) % 7 + 1;
    const reward = [20, 25, 30, 35, 40, 50, 80][day - 1];
    state.lastCheckIn = today;
    state.balance += reward;
    if (day === 7) state.inventory.compass = Math.min(999, state.inventory.compass + 1);
    return { day, reward, bonus: day === 7 };
  }
  function purchase(state, id) {
    const item = ITEMS[id];
    if (!item || state.balance < item.cost || state.inventory[id] >= 999) return false;
    state.balance -= item.cost;
    state.inventory[id]++;
    return true;
  }
  function consume(state, id) {
    if (!ITEMS[id] || state.inventory[id] <= 0) return false;
    state.inventory[id]--;
    return true;
  }
  function claimQuest(state, id) {
    const quest = QUESTS.find(q => q.id === id);
    if (!quest || state.quests[id] < quest.goal || state.quests.claimed.includes(id)) return 0;
    state.quests.claimed.push(id);
    state.balance += quest.reward;
    return quest.reward;
  }
  function recordWin(state, { mode, index, size, stars, date = dayKey() }, today = dayKey()) {
    const rewardKey = mode === 'journey' ? `journey:${index}:${size}` : `${mode}:${date}:${index}:${size}`;
    state.totalWins++;
    state.quests.wins++;
    if (mode === 'daily' && date === today) state.quests.daily++;
    // Expanding the daily image pool must not issue a second reward on the same date.
    if (state.rewards.includes(rewardKey) || (mode === 'daily' && state.rewards.some(key => key.startsWith(`daily:${date}:`)))) return 0;
    const reward = mode === 'daily' ? 80 : mode === 'sprint' ? 65 : mode === 'zen' ? 15 : 30 + Math.min(3, Math.max(1, stars)) * 5;
    state.balance += reward;
    state.rewards.push(rewardKey);
    return reward;
  }
  function hash(value) {
    let result = 2166136261;
    for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); }
    return result >>> 0;
  }
  function dailyIndex(date, count = 100) { return hash(`shijing:${date}`) % count; }
  function makePuzzle(size, seed) {
    let value = seed === undefined ? Math.floor(Math.random() * 4294967296) : hash(String(seed));
    const random = () => { value = (value + 0x6D2B79F5) >>> 0; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pieces = Array.from({ length: size * size }, (_, i) => i);
    for (let i = pieces.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pieces[i], pieces[j]] = [pieces[j], pieces[i]]; }
    if (pieces.every((piece, i) => piece === i)) [pieces[0], pieces[1]] = [pieces[1], pieces[0]];
    return pieces;
  }
  function permutation(pieces, size) {
    return Array.isArray(pieces) && pieces.length === size * size && pieces.every(p => Number.isInteger(p) && p >= 0 && p < pieces.length) && new Set(pieces).size === pieces.length;
  }
  function normalizeSession(raw, count = 100) {
    if (!raw || !Number.isInteger(raw.current) || raw.current < 0 || raw.current >= count || ![4, 5, 6].includes(raw.size) || !permutation(raw.pieces, raw.size)) return null;
    const mode = raw.mode || 'journey';
    if (!['journey', 'daily', 'sprint', 'zen'].includes(mode) || (['daily', 'sprint'].includes(mode) && raw.size !== 4)) return null;
    // v1 sessions used a 100-image pool. Keep their landscape stable after expansion.
    const dailyPool = raw.dailyPool === undefined ? 100 : integer(raw.dailyPool, 0, count);
    if (mode === 'daily' && (!dailyPool || !Number.isFinite(dayNumber(raw.date)) || raw.current !== dailyIndex(raw.date, dailyPool))) return null;
    if (raw.moves !== integer(raw.moves) || raw.seconds !== integer(raw.seconds) || raw.hints !== integer(raw.hints, 2, 2)) return null;
    if (raw.pieces.every((p, i) => p === i)) return null;
    return { current: raw.current, size: raw.size, pieces: [...raw.pieces], moves: raw.moves, seconds: raw.seconds, hints: raw.hints, mode, dailyPool, date: Number.isFinite(dayNumber(raw.date)) ? raw.date : dayKey(), bonus: integer(raw.bonus, 0, 30000), lastSwap: permutation(raw.lastSwap, raw.size) ? [...raw.lastSwap] : null };
  }
  const api = { ITEMS, QUESTS, dayKey, dayNumber, fresh, normalize, checkIn, purchase, consume, claimQuest, recordWin, hash, dailyIndex, makePuzzle, permutation, normalizeSession };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shijing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
