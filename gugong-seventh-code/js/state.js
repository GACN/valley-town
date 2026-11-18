// state.js —— 游戏状态：旗标/证据/信任/章节/任务进度/存档
import { clamp, cnNum } from './util.js';

const SAVE_KEY = 'gongque_v1_slot';
const AUTOSAVE = 'gongque_v1_auto';

export class GameState {
  constructor(data) {
    this.data = data;
    this.flags = new Set();
    this.clues = [];              // 按获取顺序
    this.clueSet = new Set();
    this.trust = {};              // npcId -> 0..100
    this.deductions = new Set();  // d_a__b
    this.codes = new Set();       // 第七码 1..7
    this.chapter = 1;
    this.ending = null;
    this.quests = {};             // questId -> {steps:{}, done:false}
    this.log = [];                // 调查日志
    this.hour = 8.0;             // 游戏时刻
    this.weather = 'clear';
    this.unlocked = new Set(['r01_wumen', 'r02_taihemen', 'r03_santai', 'r00_world']);
    this.playtime = 0;
    this.puzzles = {};          // id -> {placement:{eventId:slotId}, solved:false}
    this.listeners = {};
    this.dirty = false;
  }

  reset() {
    this.flags = new Set();
    this.clues = []; this.clueSet = new Set();
    this.trust = {}; this.deductions = new Set(); this.codes = new Set();
    this.chapter = 1; this.ending = null; this.quests = {}; this.log = [];
    this.hour = 8.0; this.weather = 'clear';
    this.unlocked = new Set(['r01_wumen', 'r02_taihemen', 'r03_santai', 'r00_world']);
    this.playtime = 0; this.puzzles = {}; this.dirty = true;
    this.emit('reset');
  }

  // ---------- 事件总线 ----------
  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, payload) { (this.listeners[evt] || []).forEach(f => { try { f(payload); } catch (e) { console.error(e); } }); }

  // ---------- 条件 / 效果 ----------
  evalCond(c) {
    if (!c) return true;
    c = String(c).trim();
    if (c.startsWith('flag:')) return this.flags.has(c.slice(5));
    if (c.startsWith('has_clue:')) return this.clueSet.has(c.slice(9));
    if (c.startsWith('trust:')) {
      const m = c.match(/^trust:([\w]+)>=(\d+)$/);
      return m ? (this.trust[m[1]] || 0) >= +m[2] : false;
    }
    if (c.startsWith('chapter>=')) return this.chapter >= +c.slice(9);
    if (c.startsWith('deduce:')) return this.deductions.has(c.slice(7));
    if (c.startsWith('code>=')) return this.codes.size >= +c.slice(6);
    if (c.startsWith('!')) return !this.evalCond(c.slice(1));
    return false;
  }

  evalAll(list) { return (list || []).every(c => this.evalCond(c)); }

  applyEffect(e) {
    if (!e) return;
    e = String(e).trim();
    if (e.startsWith('flag:')) { this.flags.add(e.slice(5)); this.emit('flag', e.slice(5)); }
    else if (e.startsWith('clue:')) this.addClue(e.slice(5));
    else if (e.startsWith('trust:')) {
      const m = e.match(/^trust:([\w]+)([+-])(\d+)$/);
      if (m) this.addTrust(m[1], (m[2] === '-' ? -1 : 1) * +m[3]);
    }
    else if (e.startsWith('unlock:')) { this.unlocked.add(e.slice(7)); this.emit('unlock', e.slice(7)); }
    else if (e.startsWith('chapter:')) this.setChapter(+e.slice(8));
    else if (e.startsWith('ending:')) { this.ending = e.slice(7); this.emit('ending', this.ending); }
    else if (e.startsWith('code:')) { this.codes.add(+e.slice(5)); this.emit('code', +e.slice(5)); this.checkNamedDeductions(); }
    this.dirty = true;
  }

  applyAll(list) { (list || []).forEach(e => this.applyEffect(e)); }

  // ---------- 证据 ----------
  addClue(id) {
    if (!id || this.clueSet.has(id)) return false;
    const c = this.data.clueById[id];
    if (!c) { console.warn('[clue] 未定义', id); return false; }
    this.clueSet.add(id); this.clues.push(id);
    this.addLog(`获得证据：${c.name}`);
    this.emit('clue', c);
    this.notifyQuest({ kind: 'clue', clue: id });
    return true;
  }

  addTrust(npcId, d) {
    const npc = this.data.npcById[npcId];
    const cur = this.trust[npcId] ?? (npc ? npc.trust0 : 20);
    this.trust[npcId] = clamp(cur + d, 0, 100);
    this.emit('trust', { npcId, value: this.trust[npcId], delta: d });
  }

  trustOf(npcId) { return this.trust[npcId] ?? (this.data.npcById[npcId]?.trust0 ?? 20); }

  addDeduction(a, b) {
    const key = 'd_' + [a, b].sort().join('__');
    if (this.deductions.has(key)) return false;
    const cA = this.data.clueById[a], cB = this.data.clueById[b];
    if (!cA || !cB) return false;
    const linked = (this.data.implies[a] || []).includes(b) || (this.data.implies[b] || []).includes(a);
    if (!linked) return false;
    this.deductions.add(key);
    this.addLog(`推理成立：${cA.name} → ${cB.name}`);
    this.emit('deduce', { key, a, b });
    this.notifyQuest({ kind: 'deduce', key });
    this.checkNamedDeductions();
    return true;
  }

  // 具名推理（d_chain 等）：证据组合或兜底条件成立即记入
  checkNamedDeductions() {
    const rules = (this.data.namedDeductions || []);
    for (const r of rules) {
      if (this.deductions.has(r.id)) continue;
      let hit = false;
      for (const pair of (r.any || [])) {
        if (pair.length !== 2) continue;
        const [a, b] = pair;
        if (!this.clueSet.has(a) || !this.clueSet.has(b)) continue;
        if (this.deductions.has('d_' + [a, b].sort().join('__'))) { hit = true; break; }
      }
      if (!hit && r.also_when) {
        const w = r.also_when;
        hit = this.codes.size >= (w.codes || 99) && this.deductions.size >= (w.deductions_min || 99);
      }
      if (hit) {
        this.deductions.add(r.id);
        this.addLog(`推理成立：${r.label || r.id}`);
        this.emit('deduce', { key: r.id, named: true });
        this.dirty = true;
      }
    }
  }

  addLog(text) {
    this.log.unshift({ t: this.hour, text });
    if (this.log.length > 200) this.log.pop();
    this.emit('log', text);
  }

  // ---------- 章节 ----------
  setChapter(n) {
    if (n <= this.chapter) return;
    this.chapter = n;
    const ch = this.data.chapters.find(c => c.n === n);
    (ch?.open_regions || []).forEach(r => this.unlocked.add(r));
    this.emit('chapter', ch);
  }

  // ---------- 任务 ----------
  questState(id) {
    return this.quests[id] || (this.quests[id] = { steps: {}, done: false });
  }

  isStepDone(qid, sid) { return !!this.quests[qid]?.steps?.[sid]; }

  isStepVisible(step) { return this.evalAll(step.requires); }

  availableQuests() {
    return this.data.quests.filter(q => (q.chapter || 1) <= this.chapter)
      .filter(q => !this.questState(q.id).done);
  }

  questProgress(qid) {
    const q = this.data.questById[qid]; if (!q) return { done: 0, total: 0 };
    const st = this.questState(qid);
    let done = 0, total = 0;
    for (const s of q.steps || []) {
      if (!this.isStepVisible(s)) continue;
      total++;
      if (st.steps[s.id]) done++;
    }
    return { done, total };
  }

  // 事件驱动的任务推进
  notifyQuest(ev) {
    let changed = false;
    for (const q of this.availableQuests()) {
      const st = this.questState(q.id);
      for (const s of q.steps || []) {
        if (st.steps[s.id]) continue;
        if (!this.isStepVisible(s)) continue;
        const at = s.at || {};
        let hit = false;
        if (ev.kind === 'clue' && at.kind === 'clue' && at.clue === ev.clue) hit = true;
        if (ev.kind === 'npc' && at.kind === 'npc' && at.npc === ev.npc) hit = true;
        if (ev.kind === 'interior' && at.kind === 'interior' && at.interior === ev.interior) hit = true;
        if (ev.kind === 'deduce' && at.kind === 'deduce') hit = true;
        if (ev.kind === 'puzzle' && at.kind === 'puzzle' && (!at.puzzle || at.puzzle === ev.puzzle)) hit = true;
        if (ev.kind === 'anchor' && at.kind === 'anchor') {
          // 由主循环就近判定
        }
        if (hit) { this.completeStep(q, s); changed = true; }
      }
    }
    return changed;
  }

  completeStep(q, step) {
    const st = this.questState(q.id);
    st.steps[step.id] = true;
    this.applyAll(step.grants);
    this.emit('step', { quest: q, step });
    // 整任务完成？
    const { done, total } = this.questProgress(q.id);
    if (total > 0 && done >= total) {
      st.done = true;
      this.applyAll(q.rewards ? (Array.isArray(q.rewards) ? q.rewards : []) : []);
      this.emit('questDone', q);
      this.addLog(`任务完成：${q.title}`);
      // 章节自动推进兜底
      const chQuests = this.data.quests.filter(x => x.type === 'main' && x.chapter === q.chapter);
      if (chQuests.length && chQuests.every(x => this.questState(x.id).done)) {
        this.setChapter(Math.min(14, q.chapter + 1));
      }
    }
    this.dirty = true;
  }

  checkAnchorSteps(pos) {
    for (const q of this.availableQuests()) {
      const st = this.questState(q.id);
      for (const s of q.steps || []) {
        if (st.steps[s.id]) continue;
        const at = s.at || {};
        if (at.kind !== 'anchor') continue;
        if (!this.isStepVisible(s)) continue;
        const a = this.data.anchors[at.anchor];
        if (!a) continue;
        const r = at.radius ?? 14;
        const dx = pos.x - a.pos[0], dy = pos.y - a.pos[1];
        if (dx * dx + dy * dy <= r * r) this.completeStep(q, s);
      }
    }
  }

  // ---------- 存档 ----------
  serialize() {
    return {
      v: 1, chapter: this.chapter, hour: this.hour, weather: this.weather,
      flags: [...this.flags], clues: this.clues, trust: this.trust, puzzles: this.puzzles,
      deductions: [...this.deductions], codes: [...this.codes], quests: this.quests,
      log: this.log.slice(0, 60), unlocked: [...this.unlocked], ending: this.ending,
      playtime: this.playtime, savedAt: Date.now(),
    };
  }

  deserialize(d) {
    if (!d) return;
    this.chapter = d.chapter || 1;
    this.hour = d.hour ?? 8; this.weather = d.weather || 'clear';
    this.flags = new Set(d.flags || []);
    this.clues = d.clues || []; this.clueSet = new Set(this.clues);
    this.trust = d.trust || {};
    this.deductions = new Set(d.deductions || []);
    this.codes = new Set(d.codes || []);
    this.quests = d.quests || {}; this.puzzles = d.puzzles || {};
    this.log = d.log || [];
    this.unlocked = new Set(d.unlocked || ['r01_wumen', 'r02_taiemen', 'r03_santai', 'r00_world']);
    this.ending = d.ending || null;
    this.playtime = d.playtime || 0;
    this.emit('loaded');
  }

  save(slot = 'slot1') {
    try {
      localStorage.setItem(SAVE_KEY + slot, JSON.stringify(this.serialize()));
      return true;
    } catch (e) { console.warn('存档失败', e); return false; }
  }

  autosave() {
    try { localStorage.setItem(AUTOSAVE, JSON.stringify(this.serialize())); } catch (e) {}
  }

  static read(slot = 'slot1') {
    try { const s = localStorage.getItem(SAVE_KEY + slot) || (slot === 'auto' ? localStorage.getItem(AUTOSAVE) : null); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  static hasSave(slot = 'slot1') { return !!GameState.read(slot); }
  static clear(slot = 'slot1') { localStorage.removeItem(SAVE_KEY + slot); }
  static hasAuto() { return !!localStorage.getItem(AUTOSAVE); }
}

export { cnNum };
