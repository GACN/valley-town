// data.js —— 数据加载与合并
const J = async (p) => {
  const r = await fetch(p, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${p} ${r.status}`);
  return r.json();
};

const BIN = async (p) => {
  const r = await fetch(p, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${p} ${r.status}`);
  return r.arrayBuffer();
};

export async function loadAll(onStep) {
  const step = (t) => onStep && onStep(t);

  step('读取地图索引');
  const [regions, walkMeta, anchors, passages] = await Promise.all([
    J('data/regions.json'), J('data/walk_meta.json'),
    J('data/anchors.json'), J('data/passages.json'),
  ]);

  step('读取可行走网格');
  const [hBuf, bBuf] = await Promise.all([BIN('data/height.bin'), BIN('data/blocked.bin')]);
  const grid = {
    meta: walkMeta,
    height: new Uint16Array(hBuf),
    blocked: new Uint8Array(bBuf),
    nx: walkMeta.nx, ny: walkMeta.ny,
    step: walkMeta.step, x0: walkMeta.x0, y0: walkMeta.y0,
  };

  step('读取剧情数据');
  const safe = async (p, fb) => { try { return await J(p); } catch (e) { console.warn('[data] 缺失', p); return fb; } };
  const [npcDoc, clueDoc, chA, chB, qA, qB, qS, dA, dB, intDoc, endings] = await Promise.all([
    safe('data/content_npcs.json', { npcs: [] }),
    safe('data/content_clues.json', { clues: [] }),
    safe('data/content_chapters_a.json', { chapters: [] }),
    safe('data/content_chapters_b.json', { chapters: [] }),
    safe('data/content_quests_a.json', { quests: [] }),
    safe('data/content_quests_b.json', { quests: [] }),
    safe('data/content_quests_side.json', { quests: [] }),
    safe('data/content_dialogue_a.json', { trees: {} }),
    safe('data/content_dialogue_b.json', { trees: {} }),
    safe('data/content_interiors.json', { interiors: [] }),
    safe('data/endings.json', { endings: {} }),
  ]);
  const autoClues = await safe('data/content_clues_auto.json', { clues: [], remap: {} });
  const extraClues = await safe('data/content_clues_extra.json', { clues: [] });
  const namedDed = await safe('data/deductions_named.json', { named: [] });
  const timeline = await safe('data/timeline.json', { puzzles: [] });

  const chapters = [...(chA.chapters || []), ...(chB.chapters || [])].sort((a, b) => a.n - b.n);
  const quests = [...(qA.quests || []), ...(qB.quests || []), ...(qS.quests || [])];
  const questById = Object.fromEntries(quests.map(q => [q.id, q]));
  const npcs = npcDoc.npcs || [];
  const npcById = Object.fromEntries(npcs.map(n => [n.id, n]));
  // 合并顺序：正式线索 → 自动占位 → 补充线索（补充线索优先，避免被占位覆盖）
  const clueMap = new Map();
  for (const c of [...(clueDoc.clues || []), ...(autoClues.clues || []), ...(extraClues.clues || [])]) clueMap.set(c.id, c);
  const clues = [...clueMap.values()];
  const clueById = Object.fromEntries(clues.map(c => [c.id, c]));

  // 线索引用对齐：把 remap 里的旧 id 改写成已有线索 id
  const remap = autoClues.remap || {};
  const fixClueId = (id) => remap[id] || id;
  const fixGrant = (g) => (typeof g === 'string' && g.startsWith('clue:') && remap[g.slice(5)]) ? 'clue:' + remap[g.slice(5)] : g;
  const fixCond = (c) => (typeof c === 'string' && c.startsWith('has_clue:') && remap[c.slice(9)]) ? 'has_clue:' + remap[c.slice(9)] : c;
  for (const q of quests) {
    for (const st of q.steps || []) {
      if (st.at && st.at.kind === 'clue') st.at.clue = fixClueId(st.at.clue);
      if (st.grants) st.grants = st.grants.map(fixGrant);
      if (st.requires) st.requires = st.requires.map(fixCond);
    }
  }
  for (const trees of [dA.trees || {}, dB.trees || {}]) {
    for (const tree of Object.values(trees)) {
      for (const nd of Object.values(tree.nodes || {})) {
        if (nd.effects) nd.effects = nd.effects.map(fixGrant);
        for (const ch of nd.choices || []) {
          if (ch.effects) ch.effects = ch.effects.map(fixGrant);
          if (ch.if) ch.if = ch.if.map(fixCond);
        }
      }
    }
  }
  const trees = { ...(dA.trees || {}), ...(dB.trees || {}) };
  const interiors = intDoc.interiors || [];
  const interiorById = Object.fromEntries(interiors.map(i => [i.id, i]));

  // 推断关系（线索关联板用）
  const implies = {};
  for (const c of clues) implies[c.id] = (c.implies || []).filter(id => clueById[id]);

  console.log(`[data] 章节${chapters.length} 任务${quests.length} 线索${clues.length} NPC${npcs.length} 对话树${Object.keys(trees).length} 室内${interiors.length}`);

  return {
    regions, anchors, passages, grid, chapters, quests, questById, npcs, npcById,
    clues, clueById, trees, interiors, interiorById, endings: endings.endings || {}, implies,
    namedDeductions: namedDed.named || [],
    puzzles: timeline.puzzles || [],
  };
}
