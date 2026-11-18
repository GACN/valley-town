// npc.js —— NPC 实体：程序化人物、日程走位、寻路、交谈判定
import * as THREE from '../vendor/three/three.module.js';
import { clamp, lerp, hashStr, rng } from './util.js';

const SKIN = 0xd9b08c;

function makeLabel(text, color = '#f2e6cf') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,16,0.55)';
  g.fillRect(0, 0, 512, 128);
  g.font = 'bold 54px "Noto Serif SC", serif';
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(2.6, 0.65, 1);
  return sp;
}

export class NPC {
  constructor(def, data, scene, grid, player) {
    this.def = def;
    this.data = data;
    this.grid = grid;
    this.player = player;
    this.trust = def.trust0 ?? 20;

    const a = data.anchors[def.anchor] || Object.values(data.anchors)[0];
    this.home = a ? { x: a.pos[0], y: a.pos[1], z: a.pos[2] } : { x: 0, y: 0, z: 0 };
    this.pos = { ...this.home };
    this.target = null;
    this.path = null;
    this.pathIdx = 0;
    this.stuckT = 0;
    this.speed = 1.25 + (hashStr(def.id) % 100) / 300;
    this.facing = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.walkPhase = 0;
    this.nextThink = 0;
    this.talking = false;
    this.visible = false;

    this.group = new THREE.Group();
    this.group.name = 'npc_' + def.id;
    this._build();
    scene.add(this.group);
    this.label = makeLabel(def.name);
    this.label.position.set(0, 2.15, 0);
    this.group.add(this.label);
  }

  _build() {
    const robe = new THREE.Color(this.def.robe || '#3a3a44');
    const accent = new THREE.Color(this.def.accent || '#c9a227');
    const r = rng(hashStr(this.def.id));
    const tall = 1.66 + r() * 0.14;

    const robeMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.82 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45, metalness: 0.3 });
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.75 });

    // 长袍（下摆宽、上身收）
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.46, tall * 0.62, 10, 1, true), robeMat);
    skirt.position.y = tall * 0.31;
    skirt.castShadow = true;
    this.group.add(skirt);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.26, tall * 0.3, 10), robeMat);
    torso.position.y = tall * 0.72;
    torso.castShadow = true;
    this.group.add(torso);

    // 腰带
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.1, 10), accentMat);
    belt.position.y = tall * 0.58;
    this.group.add(belt);

    // 交领
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.16, 10, 1, true), accentMat);
    collar.position.y = tall * 0.86;
    this.group.add(collar);

    // 头
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), skinMat);
    head.position.y = tall * 0.985;
    head.castShadow = true;
    this.group.add(head);

    // 发/冠
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    hair.position.y = tall * 0.995;
    this.group.add(hair);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.16, 0.1, 10), hairMat);
    cap.position.y = tall * 1.075;
    this.group.add(cap);

    // 手臂
    const armGeo = new THREE.BoxGeometry(0.1, tall * 0.34, 0.1);
    this.armL = new THREE.Mesh(armGeo, robeMat);
    this.armL.position.set(-0.26, tall * 0.74, 0);
    this.armL.castShadow = true;
    this.armR = this.armL.clone();
    this.armR.position.x = 0.26;
    this.group.add(this.armL, this.armR);

    this.height = tall;
    this.group.position.set(this.pos.x, this.pos.z, -this.pos.y);
  }

  // 依据日程算出当前应该在哪
  scheduledAnchor(hour) {
    const sched = this.def.schedule || [];
    for (const s of sched) {
      if (hour >= s.from && hour < s.to) return s;
    }
    return sched.length ? sched[sched.length - 1] : null;
  }

  think(hour) {
    const s = this.scheduledAnchor(hour);
    if (!s) return;
    const a = this.data.anchors[s.anchor];
    if (!a) return;
    const tx = a.pos[0], ty = a.pos[1];
    if (!this.target || Math.hypot(this.target.x - tx, this.target.y - ty) > 6) {
      this.target = { x: tx, y: ty, z: a.pos[2], label: s.label };
      this.path = null;
      this.stuckT = 0;
    }
  }

  // 简易寻路：直线优先，受阻则 BFS
  planPath() {
    const g = this.grid;
    const toCell = (x, y) => [Math.floor((x - g.x0) / g.step), Math.floor((y - g.y0) / g.step)];
    const [si, sj] = toCell(this.pos.x, this.pos.y);
    const [ti, tj] = toCell(this.target.x, this.target.y);
    if (si === ti && sj === tj) { this.path = null; return; }
    const key = (i, j) => j * g.nx + i;
    const prev = new Map();
    const q = [key(si, sj)];
    prev.set(key(si, sj), -1);
    let head = 0, found = false, iter = 0;
    while (head < q.length && iter++ < 60000) {
      const k = q[head++];
      const i = k % g.nx, j = (k - i) / g.nx;
      if (i === ti && j === tj) { found = true; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const kk = key(ii, jj);
        if (prev.has(kk) || g.blocked[kk] !== 0) continue;
        prev.set(kk, k);
        q.push(kk);
      }
    }
    if (!found) { this.path = null; return; }
    // 回溯并抽稀
    const cells = [];
    let cur = key(ti, tj);
    while (cur !== -1) { cells.push(cur); cur = prev.get(cur); }
    cells.reverse();
    const pts = [];
    for (let idx = 0; idx < cells.length; idx += 3) {
      const k = cells[idx]; const i = k % g.nx, j = (k - i) / g.nx;
      pts.push({ x: g.x0 + (i + 0.5) * g.step, y: g.y0 + (j + 0.5) * g.step });
    }
    pts.push({ x: this.target.x, y: this.target.y });
    this.path = pts; this.pathIdx = 0;
  }

  update(dt, hour, playerPos, paused) {
    // 远距离不模拟（性能），但仍占位
    const dx = this.pos.x - playerPos.x, dy = this.pos.y - playerPos.y;
    const dist = Math.hypot(dx, dy);
    this.visible = dist < 170;
    this.group.visible = this.visible;
    if (this.label) this.label.visible = dist < 26;
    if (!this.visible) return;

    this.trust = this.def.id ? this.trust : this.trust;

    // 每 4 秒重算目的地
    this.nextThink -= dt;
    if (this.nextThink <= 0) { this.nextThink = 3.5 + Math.random(); this.think(hour); }

    if (paused || this.talking) {
      this.walkPhase += dt * 1.2;
      this._animate(0);
      // 面向玩家
      if (this.talking) {
        this.facing = Math.atan2(playerPos.x - this.pos.x, playerPos.y - this.pos.y);
      }
      this._place();
      return;
    }

    if (!this.target) { this._place(); return; }
    const dTarget = Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.y);
    if (dTarget < 1.2) { this._animate(0); this._place(); return; }

    if (dist > 120) {
      // 远处直接归位，省算力
      this.pos.x = this.target.x; this.pos.y = this.target.y;
      this._place(); return;
    }

    if (!this.path) this.planPath();
    let aim;
    if (this.path && this.pathIdx < this.path.length) {
      aim = this.path[this.pathIdx];
      if (Math.hypot(aim.x - this.pos.x, aim.y - this.pos.y) < 1.4) {
        this.pathIdx++;
        aim = this.path[this.pathIdx] || this.target;
      }
    } else aim = this.target;

    let vx = aim.x - this.pos.x, vy = aim.y - this.pos.y;
    const l = Math.hypot(vx, vy) || 1;
    vx /= l; vy /= l;
    const step = this.speed * dt;
    let nx = this.pos.x + vx * step, ny = this.pos.y + vy * step;

    const g = this.grid;
    const blocked = (x, y) => {
      const i = Math.floor((x - g.x0) / g.step), j = Math.floor((y - g.y0) / g.step);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return true;
      return g.blocked[j * g.nx + i] !== 0;
    };
    if (blocked(nx, ny)) {
      // 侧向脱困
      const px = -vy, py = vx;
      if (!blocked(this.pos.x + px * step * 1.5, this.pos.y + py * step * 1.5)) { nx = this.pos.x + px * step * 1.5; ny = this.pos.y + py * step * 1.5; }
      else if (!blocked(this.pos.x - px * step * 1.5, this.pos.y - py * step * 1.5)) { nx = this.pos.x - px * step * 1.5; ny = this.pos.y - py * step * 1.5; }
      else { this.path = null; this.stuckT += dt; nx = this.pos.x; ny = this.pos.y; }
    }
    if (this.stuckT > 2.5) { this.stuckT = 0; this.path = null; this.target = null; }

    this.pos.x = nx; this.pos.y = ny;
    // 高度
    const i = Math.floor((nx - g.x0) / g.step), j = Math.floor((ny - g.y0) / g.step);
    if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) {
      const fh = g.height[j * g.nx + i] / 100;
      this.pos.z = Math.abs(fh - this.pos.z) > 2.5 ? this.pos.z : lerp(this.pos.z, fh, Math.min(1, dt * 8));
    }
    this.facing = Math.atan2(vx, vy);
    this.walkPhase += dt * 7.5;
    this._animate(1);
    this._place();
  }

  _animate(moving) {
    const sw = Math.sin(this.walkPhase) * (moving ? 0.55 : 0.05);
    if (this.armL) this.armL.rotation.x = sw;
    if (this.armR) this.armR.rotation.x = -sw;
  }

  _place() {
    this.group.position.set(this.pos.x, this.pos.z, -this.pos.y);
    this.group.rotation.y = -this.facing + Math.PI;
  }

  distanceTo(p) { return Math.hypot(this.pos.x - p.x, this.pos.y - p.y); }
}
