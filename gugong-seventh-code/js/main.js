// main.js —— 组装：世界 / 玩家 / NPC / 交互 / 室内 / 任务 / 结局
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { loadAll } from './data.js';
import { World, makeMaterials } from './world.js';
import { Player } from './player.js';
import { NPC } from './npc.js';
import { Interior } from './interior.js';
import { Dialogue } from './dialogue.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { GameState } from './state.js';
import { el, clamp, cnNum, fmtTime, dist2 } from './util.js';

const INTERIOR_ENTRANCE = {
  thd_hall: 'taihedian_yuetai', zbd_hall: 'zhonghedian', bhd_hall: 'baohedian',
  qqg_hall: 'qianqinggong', kng_hall: 'kunninggong', thm_hall: 'taihemen',
  qqm_hall: 'qianqingmen', wumen_tower: 'wumen_in', tower_ne: 'tower_ne', tower_nw: 'tower_nw',
  archive_ruins: 'wb_yxd', secret_passage: 'neiting_west_street', tcm_hall: 'wb_fxd',
  barracks: 'corr_east',
};

class Game {
  constructor() {
    this.isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.keys = {};
    this.input = { fwd: 0, strafe: 0, run: false, lookX: 0, lookY: 0 };
    this.lookAccum = { x: 0, y: 0 };
    this.paused = false;
    this.timeScale = 1;
    this.nearTarget = null;
    this.pois = [];
    this.interiorMarkers = [];
    this.currentPlaceName = '';
    this._lastAutosave = 0;
    this._frame = 0;
    this._fpsT = 0; this._fpsN = 0; this.fps = 0;
  }

  async boot() {
    const loading = document.getElementById('loading');
    const setL = t => { const n = loading?.querySelector('.ltext'); if (n) n.textContent = t; };

    setL('读取数据');
    window.__game = this; window.__game.THREE = THREE;
    this.data = await loadAll(setL);
    this.state = new GameState(this.data);
    this.audio = new Audio();

    setL('建立宫城');
    this.world = new World(document.getElementById('view'), this.data);
    this.mats = makeMaterials();
    this.world.setQuality(new URLSearchParams(location.search).get('q') || (this.isMobile ? 'medium' : 'high'));
    this.world.buildPassages(this.data.passages.passages, this.mats.stone, this.mats.wood, this.mats.dark);
    this.world.setWeather('clear');
    this.world.setTimeOfDay(8.2);

    // 音频必须在用户手势里初始化（手机浏览器策略）
    const kickAudio = () => {
      this.audio.init(); this.audio.resume(); this.audio.setWeather(this.state.weather);
      window.removeEventListener('pointerdown', kickAudio);
      window.removeEventListener('keydown', kickAudio);
    };
    window.addEventListener('pointerdown', kickAudio, { passive: true });
    window.addEventListener('keydown', kickAudio);

    this.loader = new GLTFLoader();
    // 预载必要分区
    await Promise.all(['r00_world', 'r01_wumen', 'r02_taihemen'].map(id => this.world.loadRegion(id, this.loader)));

    setL('安置人物');
    const spawnA = this.data.anchors[this.data.passages.spawn] || this.data.anchors.wumen_out || Object.values(this.data.anchors)[0];
    this.player = new Player(this.world, this.data.grid, this.data.passages.passages, spawnA.pos);
    this.player.yaw = 0; // 面向北，宫门在身后
    this.player.onFootstep = (run) => this.audio.footstep(run);

    this.npcs = this.data.npcs.map(def => new NPC(def, this.data, this.world.scene, this.data.grid, this.player));

    this.interior = new Interior(this.data, this.state);
    this.ui = new UI(this);
    this.dialogue = new Dialogue(this.data, this.state, this.ui);

    // 任务里 grants ending:xxx 时也弹出结局画面
    this.state.on('ending', (e) => {
      const stats = `证据 ${this.state.clues.length} 条 · 推理 ${this.state.deductions.size} 条 · 第七码 ${this.state.codes.size}/7`;
      setTimeout(() => this.ui.showEnding(e, stats), 400);
    });

    this.buildPois();
    this.buildInteriorMarkers();
    this.bindInput();
    this.bindButtons();

    // 先跑渲染循环（继续存档的对话框也能看到背后的宫城）
    this.loop();
    this.world.updateStreaming(this.player.pos.x, this.player.pos.y, this.loader);

    // 开局
    const auto = GameState.read('auto');
    const saved = GameState.read('slot1');
    const cont = (auto && !auto.endings) || saved;
    if (cont) {
      const which = saved ? 'slot1' : 'auto';
      const ok = await this.askContinue(which);
      if (ok) { this.loadGame(which, true); }
      else { this.startNew(); }
    } else {
      this.startNew();
    }

    this.ui.hideLoading();

    // 自动存档
    setInterval(() => {
      if (!this.paused) { this.state.autosave(); }
    }, 45000);

    window.__game = this;
    window.__game.THREE = THREE;
    console.log('[game] ready');
  }

  askContinue(which) {
    return new Promise(resolve => {
      const box = el('div', 'contbox');
      const d = GameState.read(which);
      const when = d?.savedAt ? new Date(d.savedAt).toLocaleString('zh-CN') : '';
      box.innerHTML = `<div class="cb-title">宫阙疑云：第七码</div>
        <div class="cb-sub">有存档：第${cnNum(d?.chapter || 1)}章 · ${when}</div>
        <div class="cb-btns"><button id="cbCont">继续调查</button><button id="cbNew">重新开始</button></div>`;
      document.getElementById('app').appendChild(box);
      box.querySelector('#cbCont').onclick = () => { box.remove(); resolve(true); };
      box.querySelector('#cbNew').onclick = () => { box.remove(); resolve(false); };
    });
  }

  startNew() {
    this.state.reset();
    this.pois.forEach(p => p.taken = false);
    this.updatePoiPool();
    const ch = this.data.chapters.find(c => c.n === 1);
    if (ch) {
      this.ui.setChapter(1, ch.title);
      setTimeout(() => this.ui.showChapterIntro(ch), 700);
    }
    this.ui.refreshTracker();
    this.ui.sub('暴雨刚停。午门内的石板还湿着，有人替你把宫门留了一道缝。', 7000);
    this.state.addLog('受监察使裴景衡之邀，进入宫城调查档案官林照月之死。');
  }

  // ---------- POI ----------
  findStand(x, y) {
    for (let r = 0; r < 40; r += 1.5) {
      const n = Math.max(1, Math.round(r / 1.5) * 6);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (this.player.canStand(px, py)) return { x: px, y: py, z: this.player.floorAt(px, py) };
      }
    }
    return { x, y, z: this.player.floorAt(x, y) };
  }

  buildPois() {
    // 只存数据，网格按需从对象池里取（128 条线索全建网格会白烧 200+ draw call）
    for (const c of this.data.clues) {
      if (c.interior) continue;                 // 室内线索由 interior 管
      const a = this.data.anchors[c.anchor];
      if (!a) continue;
      const p = this.findStand(a.pos[0] + (Math.random() - 0.5) * 6, a.pos[1] + (Math.random() - 0.5) * 6);
      this.pois.push({ clue: c, pos: p, taken: false });
    }
    // 对象池
    const geo = new THREE.OctahedronGeometry(0.16, 0);
    const ring = new THREE.RingGeometry(0.35, 0.5, 18);
    this.poiPool = [];
    for (let i = 0; i < 22; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.9 }));
      const halo = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
      halo.rotation.x = -Math.PI / 2;
      mesh.visible = false; halo.visible = false;
      this.world.scene.add(mesh); this.world.scene.add(halo);
      this.poiPool.push({ mesh, halo, poi: null });
    }
    console.log('[poi]', this.pois.length);
  }

  updatePoiPool() {
    const px = this.player.pos.x, py = this.player.pos.y;
    const cand = [];
    for (const p of this.pois) {
      if (p.taken) continue;
      if (p.clue.chapter > this.state.chapter + 1) continue;
      const d = dist2(px, py, p.pos.x, p.pos.y);
      if (d < 90) cand.push({ p, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const n = Math.min(this.poiPool.length, cand.length);
    const tsec = performance.now() * 0.001;
    for (let i = 0; i < this.poiPool.length; i++) {
      const slot = this.poiPool[i];
      if (i < n) {
        const { p } = cand[i];
        slot.poi = p;
        slot.mesh.visible = true; slot.halo.visible = true;
        slot.mesh.material.color.setHex(p.clue.kind === 'code' ? 0xffd27a : 0x8fd0ff);
        slot.mesh.rotation.y += 0.05;
        slot.mesh.position.set(p.pos.x, p.pos.z + 1.05 + Math.sin(tsec * 2 + p.pos.x) * 0.09, -p.pos.y);
        slot.halo.position.set(p.pos.x, p.pos.z + 0.06, -p.pos.y);
        slot.halo.scale.setScalar(1 + Math.sin(tsec * 2.2) * 0.1);
      } else {
        slot.poi = null;
        slot.mesh.visible = false; slot.halo.visible = false;
      }
    }
  }

  buildInteriorMarkers() {
    for (const it of this.data.interiors) {
      const anchorId = INTERIOR_ENTRANCE[it.id];
      const a = this.data.anchors[anchorId];
      if (!a) continue;
      const p = this.findStand(a.pos[0] + (it.id.length % 3 - 1) * 5, a.pos[1] - 7);
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.65 }));
      m.rotation.x = Math.PI / 2;
      m.position.y = 0.06;
      g.add(m);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
        new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.25 }));
      pillar.position.y = 1.1;
      g.add(pillar);
      g.position.set(p.x, p.z, -p.y);
      this.world.scene.add(g);
      this.interiorMarkers.push({ interior: it, pos: p, group: g });
    }
    console.log('[interior]', this.interiorMarkers.length);
  }

  // ---------- 输入 ----------
  bindInput() {
    const canvas = document.getElementById('view');
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'Escape') {
        if (this.ui.openPanelName) this.ui.closePanel();
        else if (this.interior.active) this.exitInterior();
        else this.ui.openPanel('menu');
      }
      if (e.key.toLowerCase() === 'e' && !this.dialogue.active) this.interact();
      if (this.dialogue.active && /^[1-9]$/.test(e.key)) this.dialogue.pick(+e.key - 1);
      if (e.key.toLowerCase() === 'j') this.ui.togglePanel('quests');
      if (e.key.toLowerCase() === 'v') this.ui.togglePanel('case');
      if (e.key.toLowerCase() === 'k') this.ui.togglePanel('people');
      if (e.key.toLowerCase() === 'b') this.ui.togglePanel('board');
      if (e.key.toLowerCase() === 'm') this.ui.togglePanel('map');
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });

    // 鼠标拖动看视角
    let drag = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') { drag = true; lx = e.clientX; ly = e.clientY; } });
    window.addEventListener('pointermove', e => {
      if (!drag) return;
      this.lookAccum.x += (e.clientX - lx) * 1.2;
      this.lookAccum.y += (e.clientY - ly) * 1.2;
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('pointerup', () => drag = false);

    // 触屏：左摇杆 + 右半屏划视角
    const joy = document.querySelector('.joystick');
    const knob = joy.querySelector('.joy-knob');
    let joyId = null, jx = 0, jy = 0, joyR = 52;
    const joyStart = (e) => {
      const r = joy.getBoundingClientRect();
      jx = r.left + r.width / 2; jy = r.top + r.height / 2; joyR = r.width * 0.42;
      joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
    };
    joy.addEventListener('pointerdown', e => { joyStart(e); e.preventDefault(); });
    joy.addEventListener('pointermove', e => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - jx, dy = e.clientY - jy;
      const d = Math.hypot(dx, dy);
      if (d > joyR) { dx = dx / d * joyR; dy = dy / d * joyR; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.input.fwd = -dy / joyR;
      this.input.strafe = dx / joyR;
      this.input.run = Math.hypot(dx, dy) / joyR > 0.85;
      e.preventDefault();
    });
    const joyEnd = e => {
      if (e.pointerId !== joyId) return;
      joyId = null; this.input.fwd = 0; this.input.strafe = 0; this.input.run = false;
      knob.style.transform = 'translate(-50%,-50%)';
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    const zone = document.querySelector('.lookzone');
    let lookId = null, lx2 = 0, ly2 = 0;
    zone.addEventListener('pointerdown', e => { lookId = e.pointerId; lx2 = e.clientX; ly2 = e.clientY; });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== lookId) return;
      this.lookAccum.x += (e.clientX - lx2) * 1.45;
      this.lookAccum.y += (e.clientY - ly2) * 1.45;
      lx2 = e.clientX; ly2 = e.clientY;
      e.preventDefault();
    });
    const lookEnd = e => { if (e.pointerId === lookId) lookId = null; };
    zone.addEventListener('pointerup', lookEnd);
    zone.addEventListener('pointercancel', lookEnd);

    // 按钮
    document.getElementById('btnUse').onclick = () => this.interact();
    document.getElementById('btnTalk').onclick = () => this.interact();
    document.getElementById('btnPanel').onclick = () => this.ui.togglePanel('case');
    document.getElementById('btnMenu').onclick = () => this.ui.togglePanel('menu');
    document.getElementById('btnRun').onclick = () => {
      this.touchRun = !this.touchRun;
      document.getElementById('btnRun').classList.toggle('on', this.touchRun);
    };
  }

  bindButtons() { }

  // ---------- 交互 ----------
  interact() {
    if (this.dialogue.active) return;
    if (this.interior.active) {
      const poi = this.interior.nearestPoi(this.world.camera.position, this.player.getForward());
      if (poi) {
        poi.taken = true;
        poi.marker.visible = false; poi.halo.visible = false;
        if (poi.clue && this.data.clueById[poi.clue]) this.state.addClue(poi.clue);
        this.ui.sub(poi.text || poi.name, 6500);
        this.state.addLog(`查看：${poi.name}${poi.text ? '——' + poi.text : ''}`);
        return;
      }
      this.exitInterior();
      return;
    }
    const t = this.nearTarget;
    if (!t) return;
    if (t.type === 'npc') {
      const npc = t.npc;
      npc.talking = true;
      this.paused = true;
      this.dialogue.start(npc.def.id);
      this.state.flags.add('met_' + npc.def.id);
      this.ui.on('dialogueEnd', () => { npc.talking = false; this.paused = false; });
    } else if (t.type === 'poi') {
      const p = t.poi;
      p.taken = true;
      this.state.addClue(p.clue.id);
      const c = p.clue;
      this.ui.sub(`${c.name}：${c.detail || c.desc}`, 8000);
    } else if (t.type === 'interior') {
      this.enterInterior(t.entry.interior.id);
    } else if (t.type === 'puzzle') {
      this.ui.openPanel('puzzle');
    } else if (t.type === 'gate') {
      this.openGate(t.gate);
    }
  }

  openGate(g) {
    this.state.flags.add('flag:gate_' + g.id);
    this.world.setGatesOpen(true);
    this.ui.sub('门轴在雨里发出很长的一声。', 3000);
    this.audio.click(240);
  }

  enterInterior(id) {
    const spec = this.data.interiorById[id];
    if (!spec) return;
    const ok = this.interior.build(id);
    if (!ok) { this.ui.sub('这里进不去。', 2400); return; }
    this.returnPos = { ...this.player.pos, yaw: this.player.yaw, pitch: this.player.pitch };
    this.interior.active = true;
    this.player.inInterior = true;
    this.state.notifyQuest({ kind: 'interior', interior: id });
    this.ui.sub(`进入 ${spec.name}`, 3200);
    this.interiorPlayerYaw = 0;
  }

  exitInterior() {
    this.interior.active = false;
    this.player.inInterior = false;
    if (this.returnPos) {
      this.player.pos.x = this.returnPos.x; this.player.pos.y = this.returnPos.y - 2;
      this.player.pos.z = this.returnPos.z;
      this.player.yaw = this.returnPos.yaw;
      this.player.pitch = this.returnPos.pitch;
      // 确保站在可走处
      if (!this.player.canStand(this.player.pos.x, this.player.pos.y)) {
        const p = this.findStand(this.player.pos.x, this.player.pos.y);
        this.player.pos.x = p.x; this.player.pos.y = p.y; this.player.pos.z = p.z;
      }
    }
    this.ui.hidePrompt();
  }

  // ---------- 主循环 ----------
  loop() {
    const clock = new THREE.Clock();
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      this.frame(dt);
    };
    tick();
  }

  frame(dt) {
    this._frame++;
    if (this.dialogue.active || this.ui.openPanelName) {
      // 面板/对话时不移动，但世界仍渲染
      this.player.syncCamera();
      if (this.interior.active) this.world.camera.position.set(this.interior.playerPos.x, this.interior.playerPos.z, -this.interior.playerPos.y);
      this.render();
      return;
    }

    // 输入汇总
    const inp = { ...this.input, lookX: 0, lookY: 0 };
    if (this.keys['w'] || this.keys['arrowup']) inp.fwd += 1;
    if (this.keys['s'] || this.keys['arrowdown']) inp.fwd -= 1;
    if (this.keys['a'] || this.keys['arrowleft']) inp.strafe -= 1;
    if (this.keys['d'] || this.keys['arrowright']) inp.strafe += 1;
    inp.run = this.keys['shift'] || this.touchRun || this.input.run;
    inp.lookX = this.lookAccum.x; inp.lookY = this.lookAccum.y;
    this.lookAccum.x = 0; this.lookAccum.y = 0;

    if (this.interior.active) {
      this.player.yaw -= inp.lookX * this.player.lookSensitivity;
      this.player.pitch = clamp(this.player.pitch - inp.lookY * this.player.lookSensitivity, -1.3, 1.3);
      this.interior.move(dt, inp, this.player.yaw);
      const ip = this.interior.playerPos;
      this.world.camera.position.set(ip.x, ip.z, -ip.y);
      this.world.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
      const poi = this.interior.nearestPoi(this.world.camera.position, this.player.getForward());
      if (poi) this.ui.showPrompt(`[E] ${poi.name}`);
      else this.ui.showPrompt('[E] 离开这里');
    } else {
      this.player.update(dt, inp);
      this.player.syncCamera();
    }

    // 时间推进（1 游戏小时 ≈ 90 秒）
    this.state.playtime += dt;
    const prevHour = this.state.hour;
    this.state.hour = (this.state.hour + dt / 90) % 24;
    if (Math.floor(this.state.hour) !== Math.floor(prevHour)) {
      this.ui.setClock(this.state.hour, this.state.weather);
    }
    this.world.setTimeOfDay(this.state.hour);
    this.world.updateSun(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.world.updateWeatherParticles(dt, this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.world.updateGates(dt);
    this.world.updateStreaming(this.player.pos.x, this.player.pos.y, this.loader);

    // NPC
    for (const n of this.npcs) n.update(dt, this.state.hour, this.player.pos, false);

    // 任务：锚点判定
    if (this._frame % 12 === 0) {
      this.state.checkAnchorSteps(this.player.pos);
      this.updateNearTarget();
      this.ui.refreshTracker();
      this.ui.setClock(this.state.hour, this.state.weather);
    }

    // POI 对象池刷新
    if (this._frame % 10 === 0) this.updatePoiPool();
    for (const m of this.interiorMarkers) {
      const near = dist2(this.player.pos.x, this.player.pos.y, m.pos.x, m.pos.y) < 120;
      m.group.visible = near;
      if (near) m.group.rotation.y += dt * 0.6;
    }

    // 区域名
    if (this._frame % 30 === 0) this.currentPlaceName = this.placeName();

    this.render();
  }

  placeName() {
    let best = null, bd = 1e9;
    for (const a of Object.values(this.data.anchors)) {
      const d = dist2(this.player.pos.x, this.player.pos.y, a.pos[0], a.pos[1]);
      if (d < bd) { bd = d; best = a; }
    }
    if (best && bd < 60) return best.name;
    return '紫禁城';
  }

  updateNearTarget() {
    if (this.interior.active) return;
    const px = this.player.pos.x, py = this.player.pos.y;
    const fwd = this.player.getForward();
    let best = null, bestScore = 1e9;
    const consider = (t, x, y, maxD) => {
      const d = dist2(px, py, x, y);
      if (d > maxD) return;
      const dx = (x - px) / (d || 1), dy = (y - py) / (d || 1);
      const dot = dx * fwd.x + dy * fwd.y;
      if (dot < 0.15) return;
      const score = d * 1.0 - dot * 2.2;
      if (score < bestScore) { bestScore = score; best = t; }
    };
    for (const p of this.pois) {
      if (p.taken) continue;
      if (p.clue.chapter > this.state.chapter + 1) continue;
      consider({ type: 'poi', poi: p }, p.pos.x, p.pos.y, 5.2);
    }
    for (const n of this.npcs) {
      if (!n.visible) continue;
      consider({ type: 'npc', npc: n }, n.pos.x, n.pos.y, 6.0);
    }
    for (const m of this.interiorMarkers) {
      // 室内入口让位给人与证据：同样距离时优先 NPC/证据
      const d0 = dist2(px, py, m.pos.x, m.pos.y);
      if (d0 > 7.5) continue;
      const dx = (m.pos.x - px) / (d0 || 1), dy = (m.pos.y - py) / (d0 || 1);
      const dot = dx * fwd.x + dy * fwd.y;
      if (dot < 0.15) continue;
      const score = d0 - dot * 2.2 + 4.0;
      if (score < bestScore) { bestScore = score; best = { type: 'interior', entry: m }; }
    }
    // 现场重建：当前有可见的 puzzle 步骤且离它指定的锚点够近
    for (const q of this.state.availableQuests()) {
      for (const st of q.steps || []) {
        const at = st.at || {};
        if (at.kind !== 'puzzle') continue;
        if (this.state.isStepDone(q.id, st.id) || !this.state.isStepVisible(st)) continue;
        const a = this.data.anchors[at.anchor || 'tower_ne'];
        if (!a) continue;
        const d = dist2(px, py, a.pos[0], a.pos[1]);
        if (d <= (at.radius || 18)) {
          const score = d - 6;
          if (score < bestScore) { bestScore = score; best = { type: 'puzzle', puzzle: at.puzzle, quest: q, step: st }; }
        }
      }
    }

    this.nearTarget = best;
    if (!best) { this.ui.hidePrompt(); return; }
    if (best.type === 'poi') this.ui.showPrompt(`[调查] ${best.poi.clue.name}`);
    else if (best.type === 'npc') this.ui.showPrompt(`[交谈] ${best.npc.def.name}`, 'talk');
    else if (best.type === 'interior') this.ui.showPrompt(`[进入] ${best.entry.interior.name}`);
    else if (best.type === 'puzzle') this.ui.showPrompt('[推演] 重建那一夜的时间线');
  }

  render() {
    if (this.interior.active) this.world.renderer.render(this.interior.scene, this.world.camera);
    else this.world.renderer.render(this.world.scene, this.world.camera);
  }

  // ---------- 设置 ----------
  setQuality(q) { this.world.setQuality(q); this.ui.toast('画质：' + { high: '高', medium: '中', low: '低' }[q]); }
  setWeather(w) { this.state.weather = w; this.world.setWeather(w); this.audio.setWeather(w); this.ui.setClock(this.state.hour, w); }
  setHour(h) { this.state.hour = h; this.world.setTimeOfDay(h); this.ui.setClock(h, this.state.weather); }

  loadGame(slot, silent) {
    const d = GameState.read(slot);
    if (!d) { this.ui.toast('没有可读的存档'); return; }
    this.state.deserialize(d);
    const ch = this.data.chapters.find(c => c.n === this.state.chapter);
    if (ch) this.ui.setChapter(ch.n, ch.title);
    this.world.setWeather(this.state.weather);
    this.audio.setWeather(this.state.weather);
    this.world.setTimeOfDay(this.state.hour);
    this.ui.refreshTracker();
    this.ui.closePanel();
    this.pois.forEach(p => { if (this.state.clueSet.has(p.clue.id)) p.taken = true; });
    this.updatePoiPool();
    if (!silent) this.ui.toast('已读取存档');
  }

  // ---------- 结局 ----------
  resolveAccusation(target) {
    const st = this.state;
    const ded = st.deductions.size;
    const ahengOk = st.flags.has('flag:a_heng_saved') || st.flags.has('flag:aheng_alive');
    let ending = 'wrong';

    if (target === 'deal' || st.flags.has('flag:deal_struck')) {
      ending = 'deal';
    } else if (target === 'pei_jingheng' || target === 'meng_huai') {
      // 主使与动手者：证据够才算真相；条件极全且护住证人 → 隐藏结局
      const hiddenOk = st.codes.size >= 7 && ded >= 8 && ahengOk && st.trustOf('shen_yanqiu') >= 60;
      const truthOk = st.codes.size >= 7 && ded >= 6;
      ending = hiddenOk ? 'hidden' : (truthOk ? 'truth' : 'wrong');
    } else if (target === 'shen_heling') {
      // 只抓旧案主谋、没接上现案 → 旧案能翻，雨夜这条线断
      ending = st.codes.size >= 7 && ded >= 6 ? 'truth' : 'wrong';
    } else if (target === 'su_weian' || target === 'cui_shen') {
      ending = 'wrong';   // 抓了替罪/从犯，主使仍在上头
    } else {
      ending = 'wrong';   // 韩砚
    }
    if (st.flags.has('flag:path_hidden') && st.codes.size >= 7 && ahengOk) {
      if (ending === 'truth') ending = 'hidden';
    }

    st.ending = ending;
    st.addLog(`你在众人面前指认了 ${this.data.npcById[target]?.name || target}。`);
    st.applyEffect('ending:' + ending);
    const stats = `指认：${this.data.npcById[target]?.name || target} · 证据 ${st.clues.length} 条 · 推理 ${ded} 条 · 第七码 ${st.codes.size}/7 · 游玩 ${Math.floor(st.playtime / 60)} 分钟`;
    this.ui.showEnding(ending, stats);
    st.autosave();
    console.log('[ending]', ending, 'target=', target);
  }

  // 调试
  probe() {
    const rc = new THREE.Raycaster();
    const cam = this.world.camera;
    const down = new THREE.Vector3(0, -1, 0);
    rc.set(cam.position, down);
    const hitDown = rc.intersectObjects(this.world.scene.children, true).slice(0, 3)
      .map(h => ({ d: +h.distance.toFixed(2), n: h.object.parent?.name || '' }));
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    rc.set(cam.position, fwd);
    const hitFwd = rc.intersectObjects(this.world.scene.children, true).slice(0, 3)
      .map(h => ({ d: +h.distance.toFixed(1), n: h.object.parent?.name || '' }));
    let meshes = 0, tris = 0;
    this.world.scene.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; if (g?.index) tris += g.index.count / 3; else if (g?.attributes?.position) tris += g.attributes.position.count / 3; } });
    return {
      pos: [+this.player.pos.x.toFixed(1), +this.player.pos.y.toFixed(1), +this.player.pos.z.toFixed(2)],
      cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(2), +cam.position.z.toFixed(1)],
      meshes, tris: Math.round(tris), hitDown, hitFwd,
      regionsLoaded: Object.keys(this.world.regions).filter(k => this.world.regions[k].state === 'loaded'),
      near: this.nearTarget ? this.nearTarget.type : null,
      pois: this.pois.length, npcs: this.npcs.length,
    };
  }

  teleport(x, y) {
    const p = this.findStand(x, y);
    this.player.pos.x = p.x; this.player.pos.y = p.y; this.player.pos.z = p.z;
    this.ui.toast(`传送到 ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`);
  }
  giveClue(id) { this.state.addClue(id); }
  setChapter(n) { this.state.setChapter(n); const ch = this.data.chapters.find(c => c.n === n); if (ch) this.ui.showChapterIntro(ch); }
}

const game = new Game();
game.boot().catch(e => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.innerHTML = `<div class="lerr">载入失败：${e.message}<br><span>检查控制台</span></div>`;
});
