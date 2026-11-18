// 全流程推演（Node，不依赖浏览器）：检查 14 章的任务链能否走通、对话树是否可达、结局是否可触发
import fs from 'fs';
import path from 'path';
import { GameState } from './js/state.js';

const D = p => path.join(import.meta.dirname, 'data', p);
const J = p => JSON.parse(fs.readFileSync(D(p), 'utf8'));
const has = p => fs.existsSync(D(p));

const anchors = J('anchors.json');
const npcDoc = J('content_npcs.json');
const clueDoc = has('content_clues.json') ? J('content_clues.json') : { clues: [] };
const chA = J('content_chapters_a.json'), chB = J('content_chapters_b.json');
const qA = J('content_quests_a.json'), qB = J('content_quests_b.json'), qS = J('content_quests_side.json');
const dA = has('content_dialogue_a.json') ? J('content_dialogue_a.json') : { trees: {} };
const dB = has('content_dialogue_b.json') ? J('content_dialogue_b.json') : { trees: {} };
const ints = J('content_interiors.json');
const namedDed = fs.existsSync(D('deductions_named.json')) ? J('deductions_named.json') : { named: [] };
const extraClues = has('content_clues_extra.json') ? J('content_clues_extra.json') : { clues: [] };

const quests = [...qA.quests, ...qB.quests, ...qS.quests];
const data = {
  chapters: [...chA.chapters, ...chB.chapters].sort((a, b) => a.n - b.n),
  quests, questById: Object.fromEntries(quests.map(q => [q.id, q])),
  npcs: npcDoc.npcs, npcById: Object.fromEntries(npcDoc.npcs.map(n => [n.id, n])),
  clues: [...clueDoc.clues, ...extraClues.clues],
  clueById: Object.fromEntries([...clueDoc.clues, ...extraClues.clues].map(c => [c.id, c])),
  namedDeductions: namedDed.named || [],
  puzzles: (has('timeline.json') ? J('timeline.json').puzzles : []),
  trees: { ...dA.trees, ...dB.trees },
  interiors: ints.interiors, interiorById: Object.fromEntries(ints.interiors.map(i => [i.id, i])),
  anchors, implies: {},
};
for (const c of data.clues) data.implies[c.id] = (c.implies || []).filter(i => data.clueById[i]);

const st = new GameState(data);
let stuck = [];
let done = 0;

// 逐章推进：反复扫所有可见步骤，直到没有新进展
for (let ch = 1; ch <= 14; ch++) {
  st.setChapter(ch);
  let progressed = true, guard = 0;
  while (progressed && guard++ < 60) {
    progressed = false;
    // 先把当前持有的线索里能成立的关联都连起来（模拟玩家在推理板上操作）
    for (const a of st.clues) for (const b of (data.implies[a] || [])) {
      if (st.clueSet.has(b) && st.addDeduction(a, b)) progressed = true;
    }
    st.checkNamedDeductions();
    for (const q of data.quests) {
      if (q.chapter !== ch) continue;
      const qs = st.questState(q.id);
      if (qs.done) continue;
      for (const s of q.steps || []) {
        if (qs.steps[s.id]) continue;
        if (!st.isStepVisible(s)) continue;
        // 按 at.kind 模拟"玩家真的完成了"这件事
        const at = s.at || {};
        if (at.kind === 'clue' && at.clue && !data.clueById[at.clue]) { stuck.push(`${q.id}/${s.id}: 目标线索不存在 ${at.clue}`); continue; }
        if (at.kind === 'npc' && at.npc && !data.npcById[at.npc]) { stuck.push(`${q.id}/${s.id}: 目标 NPC 不存在 ${at.npc}`); continue; }
        if (at.kind === 'interior' && at.interior && !data.interiorById[at.interior]) { stuck.push(`${q.id}/${s.id}: 目标室内不存在 ${at.interior}`); continue; }
        if (at.kind === 'anchor' && at.anchor && !anchors[at.anchor]) { stuck.push(`${q.id}/${s.id}: 目标锚点不存在 ${at.anchor}`); continue; }
        st.completeStep(q, s);
        progressed = true;
        done++;
      }
    }
  }
  const chq = data.quests.filter(q => q.chapter === ch);
  const unfinished = chq.filter(q => !st.questState(q.id).done);
  console.log(`第 ${String(ch).padStart(2)} 章：任务 ${chq.length} 个，完成 ${chq.length - unfinished.length}` +
    (unfinished.length ? `，未完成 ${unfinished.map(q => q.id).join(',')}` : ''));
}

console.log('');
console.log('累计完成步骤', done, '｜ 证据', st.clues.length, '｜ 第七码', st.codes.size, '｜ 推理', st.deductions.size, '｜ 章节', st.chapter);

// 结局可触发性：检查 grants 里出现 ending:* 的任务
const endings = new Set();
for (const q of data.quests) for (const s of q.steps || []) for (const g of s.grants || []) {
  if (String(g).startsWith('ending:')) endings.add(String(g).slice(7));
}
console.log('任务里可触发的结局：', [...endings].join(', ') || '（无）');

// 对话树可达性
let dlgIssues = [];
for (const [npc, tree] of Object.entries(data.trees)) {
  const seen = new Set();
  const q = [tree.start];
  while (q.length) {
    const id = q.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const nd = tree.nodes[id];
    if (!nd) { dlgIssues.push(`${npc}: goto 指向不存在节点 ${id}`); continue; }
    for (const c of nd.choices || []) if (c.goto) q.push(c.goto);
    if (nd.goto) q.push(nd.goto);
  }
  const all = Object.keys(tree.nodes || {});
  const unreach = all.filter(k => !seen.has(k));
  if (unreach.length) dlgIssues.push(`${npc}: ${unreach.length} 个节点不可达（${unreach.slice(0, 3).join(',')}）`);
}

// 线索引用完整性
const dangling = new Set();
for (const q of data.quests) for (const s of q.steps || []) {
  for (const g of s.grants || []) if (String(g).startsWith('clue:') && !data.clueById[String(g).slice(5)]) dangling.add(String(g).slice(5));
  const at = s.at || {};
  if (at.kind === 'clue' && at.clue && !data.clueById[at.clue]) dangling.add(at.clue);
}
for (const [npc, tree] of Object.entries(data.trees)) {
  for (const nd of Object.values(tree.nodes || {})) {
    for (const eff of nd.effects || []) if (String(eff).startsWith('clue:') && !data.clueById[String(eff).slice(5)]) dangling.add(String(eff).slice(5));
    for (const c of nd.choices || []) for (const eff of c.effects || []) if (String(eff).startsWith('clue:') && !data.clueById[String(eff).slice(5)]) dangling.add(String(eff).slice(5));
  }
}

console.log('');
if (stuck.length) { console.log('卡住的步骤：'); stuck.slice(0, 12).forEach(s => console.log('  ' + s)); }
else console.log('任务链：无卡死步骤');
if (dlgIssues.length) { console.log('对话树问题：'); dlgIssues.slice(0, 12).forEach(s => console.log('  ' + s)); }
else console.log('对话树：全部节点可达');
console.log(`悬空线索引用 ${dangling.size} 个` + (dangling.size ? '：' + [...dangling].slice(0, 14).join(', ') : ''));

process.exit(stuck.length ? 1 : 0);
