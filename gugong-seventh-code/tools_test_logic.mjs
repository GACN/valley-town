// 逻辑自检（Node，不需要 WebGL）：走格碰撞、锚点可站性、状态机、任务/条件语法
import fs from 'fs';
import path from 'path';
import { Player } from './js/player.js';
import { GameState } from './js/state.js';

const ROOT = import.meta.dirname;
const D = p => path.join(ROOT, 'data', p);
const J = p => JSON.parse(fs.readFileSync(D(p), 'utf8'));

const walkMeta = J('walk_meta.json');
const passages = J('passages.json').passages;
const anchors = J('anchors.json');
const hBuf = fs.readFileSync(D('height.bin'));
const bBuf = fs.readFileSync(D('blocked.bin'));
const grid = {
  meta: walkMeta, nx: walkMeta.nx, ny: walkMeta.ny, step: walkMeta.step,
  x0: walkMeta.x0, y0: walkMeta.y0,
  height: new Uint16Array(hBuf.buffer, hBuf.byteOffset, hBuf.length / 2),
  blocked: new Uint8Array(bBuf.buffer, bBuf.byteOffset, bBuf.length),
};

let fail = 0;
const ok = (cond, msg) => { if (!cond) { console.log('FAIL ' + msg); fail++; } };
const info = (msg) => console.log('  · ' + msg);

// ---------- 1. 玩家碰撞 ----------
const stubWorld = { camera: { position: { set() {} }, rotation: { set() {} } } };
const p = new Player(stubWorld, grid, passages, anchors.wumen_in.pos);

// 所有锚点都能站
let badAnchors = [];
for (const [id, a] of Object.entries(anchors)) {
  if (!p.canStand(a.pos[0], a.pos[1])) badAnchors.push(id);
}
ok(badAnchors.length === 0, `锚点不可站: ${badAnchors.join(',')}`);
info(`${Object.keys(anchors).length} 个锚点全部可站`);

// 关键地面高度
const heights = {
  广场: p.floorAt(0, -300), 三台月台: p.floorAt(0, -22), 内廷台基: p.floorAt(0, 250),
  御花园: p.floorAt(0, 400), 午门台: p.floorAt(0, -409),
};
console.log('  高度采样:', Object.entries(heights).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  '));
ok(Math.abs(heights.广场) < 0.3, '广场高度应为 0 附近');
ok(Math.abs(heights.三台月台 - 8.13) < 0.4, '太和殿月台应为 8.13');

// 宫殿本体应不可站（实心外壳）
ok(!p.canStand(0, 0), '太和殿内部应不可站（殿内走室内场景）');
ok(!p.canStand(0, 232), '乾清宫内部应不可站');

// 城墙阻挡：从墙内侧往墙外走
p.setSpawn(60, -390, 0); p.yaw = Math.PI; // 面朝南，城墙非门洞处
const beforeX = p.pos.y;
for (let i = 0; i < 90; i++) p.update(1 / 30, { fwd: 1, strafe: 0, run: true, lookX: 0, lookY: 0 });
ok(p.pos.y > -420, `不应穿出南墙，实际 y=${p.pos.y.toFixed(1)}`); const wallStop = p.pos.y.toFixed(1);

// 走上三台南面缓坡（ramp_santai_s 在 x=0, y=-140..-112）
p.setSpawn(0, -150, 0); p.yaw = 0; // 面朝北（上三台）
for (let i = 0; i < 260; i++) p.update(1 / 30, { fwd: 1, strafe: 0, run: true, lookX: 0, lookY: 0 });
ok(p.pos.z > 6, `应能沿坡走上三台，实际 z=${p.pos.z.toFixed(2)} y=${p.pos.y.toFixed(1)}`);
info(`上坡测试：z=${p.pos.z.toFixed(2)} y=${p.pos.y.toFixed(1)}`);

// 从宫门门洞穿出到午门外
p.setSpawn(0, -380, 0); p.yaw = Math.PI; // 面朝南（出午门）
for (let i = 0; i < 300; i++) p.update(1 / 30, { fwd: 1, strafe: 0, run: true, lookX: 0, lookY: 0 });
ok(p.pos.y < -400, `应能穿午门门洞，实际 y=${p.pos.y.toFixed(1)}`);
info(`穿门测试：y=${p.pos.y.toFixed(1)}（南墙阻挡于 y=${wallStop}）`);

// ---------- 2. 状态机 ----------
const npcDoc = J('content_npcs.json');
const clueDoc = fs.existsSync(D('content_clues.json')) ? J('content_clues.json') : { clues: [] };
const extraDoc = fs.existsSync(D('content_clues_extra.json')) ? J('content_clues_extra.json') : { clues: [] };
clueDoc.clues = [...clueDoc.clues, ...extraDoc.clues];
const chA = J('content_chapters_a.json'), chB = J('content_chapters_b.json');
const qA = J('content_quests_a.json'), qB = J('content_quests_b.json'), qS = J('content_quests_side.json');
const dA = fs.existsSync(D('content_dialogue_a.json')) ? J('content_dialogue_a.json') : { trees: {} };
const dB = fs.existsSync(D('content_dialogue_b.json')) ? J('content_dialogue_b.json') : { trees: {} };
const ints = J('content_interiors.json');

const quests = [...qA.quests, ...qB.quests, ...qS.quests];
const data = {
  chapters: [...chA.chapters, ...chB.chapters].sort((a, b) => a.n - b.n),
  quests, questById: Object.fromEntries(quests.map(q => [q.id, q])),
  npcs: npcDoc.npcs, npcById: Object.fromEntries(npcDoc.npcs.map(n => [n.id, n])),
  clues: clueDoc.clues, clueById: Object.fromEntries(clueDoc.clues.map(c => [c.id, c])),
  trees: { ...dA.trees, ...dB.trees },
  interiors: ints.interiors, interiorById: Object.fromEntries(ints.interiors.map(i => [i.id, i])),
  anchors,
};

const st = new GameState(data);
// 条件与效果
ok(st.evalCond('chapter>=1'), 'chapter>=1');
ok(!st.evalCond('flag:nope'), 'flag 不存在应为 false');
st.applyEffect('flag:test_a');
ok(st.evalCond('flag:test_a'), 'flag 写入后应成立');
st.applyEffect('trust:han_yan+15');
ok(st.evalCond('trust:han_yan>=25'), '信任加成后条件成立');
st.applyEffect('chapter:3');
ok(st.chapter === 3, '章节推进');
st.applyEffect('code:1'); st.applyEffect('code:2');
ok(st.codes.size === 2, '第七码计数');

// 任务推进：走完第一章所有步骤（模拟事件）
let simulated = 0;
for (const q of data.quests.filter(x => x.chapter === 1)) {
  for (const s of q.steps) {
    if (s.requires && !st.evalAll(s.requires)) continue;
    const at = s.at || {};
    if (at.kind === 'anchor') st.checkAnchorSteps({ x: data.anchors[at.anchor].pos[0], y: data.anchors[at.anchor].pos[1] });
    else if (at.kind === 'npc') st.notifyQuest({ kind: 'npc', npc: at.npc });
    else if (at.kind === 'interior') st.notifyQuest({ kind: 'interior', interior: at.interior });
    else if (at.kind === 'clue' && data.clueById[at.clue]) st.addClue(at.clue);
    else if (at.kind === 'deduce') st.notifyQuest({ kind: 'deduce' });
    simulated++;
  }
}
info(`模拟推送第一章 ${simulated} 步；已完成任务 ${Object.values(st.quests).filter(q => q.done).length} 个`);

// 存档往返
const dump = JSON.parse(JSON.stringify(st.serialize()));
const st2 = new GameState(data); st2.deserialize(dump);
ok(st2.chapter === st.chapter && st2.codes.size === st.codes.size && st2.clues.length === st.clues.length, '存档往返一致');
info('存档/读档往返正常');

console.log(fail === 0 ? 'LOGIC_OK' : `LOGIC_FAIL ${fail}`);
process.exit(fail ? 1 : 0);
