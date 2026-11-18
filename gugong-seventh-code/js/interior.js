// interior.js —— 殿宇室内场景（独立 scene，第一人称短距探索 + 可调查点）
import * as THREE from '../vendor/three/three.module.js';
import { clamp } from './util.js';

const PALETTE = {
  imperial: { floor: 0x2a211c, wall: 0x5a201a, ceil: 0x241a14, col: 0x7a2b21, light: 0xffcf8a },
  gate:     { floor: 0x33302c, wall: 0x6b2a22, ceil: 0x2a2420, col: 0x7a2b21, light: 0xffc887 },
  tower:    { floor: 0x3a3128, wall: 0x5f2a22, ceil: 0x2a221c, col: 0x6f2a20, light: 0xffc06a },
  ruin:     { floor: 0x1b1815, wall: 0x2c2622, ceil: 0x140f0c, col: 0x3a2c22, light: 0xffa860 },
  tunnel:   { floor: 0x1d1c1a, wall: 0x2a2a28, ceil: 0x151412, col: 0x333330, light: 0xffb070 },
  medical:  { floor: 0x3a322a, wall: 0x6b4630, ceil: 0x2a241c, col: 0x5a3a26, light: 0xffe0b0 },
  military: { floor: 0x2c2a26, wall: 0x4a3a30, ceil: 0x221e1a, col: 0x5a3a2a, light: 0xffcf9a },
};

export class Interior {
  constructor(data, state) {
    this.data = data;
    this.state = state;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0a09, 0.018);
    this.group = null;
    this.spec = null;
    this.active = false;
    this.pois = [];
    this.playerPos = { x: 0, y: 0, z: 1.66 };
    this.onExit = null;
  }

  _mat(color, rough = 0.85, metal = 0.0, emissive) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 1.0 : 0 });
  }

  clear() {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); } });
      this.group = null;
    }
    this.pois = [];
  }

  build(specId) {
    const spec = this.data.interiorById[specId];
    if (!spec) return false;
    this.clear();
    this.spec = spec;
    const P = PALETTE[spec.style] || PALETTE.imperial;
    const W = spec.w || 20, D = spec.d || 12, H = spec.h || 6;
    const g = new THREE.Group();
    this.group = g;
    this.scene.add(g);

    // 地面 / 天花 / 四壁
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), this._mat(P.floor, 0.9));
    floor.position.y = -0.1; floor.receiveShadow = true; g.add(floor);

    const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), this._mat(P.ceil, 0.95));
    ceil.position.y = H; g.add(ceil);

    const wallMat = this._mat(P.wall, 0.88);
    const mkWall = (w, h, px, py, pz, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), wallMat);
      m.position.set(px, py, pz); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
    };
    mkWall(W, H, 0, H / 2, -D / 2);
    mkWall(W, H, 0, H / 2, D / 2);
    mkWall(D, H, -W / 2, H / 2, 0, Math.PI / 2);
    mkWall(D, H, W / 2, H / 2, 0, Math.PI / 2);

    // 门（南墙开口暗示）
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, H * 0.72, 0.12), this._mat(0x2a1b14, 0.8));
    door.position.set(0, H * 0.36, D / 2 - 0.22); g.add(door);
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.0, H * 0.66),
      new THREE.MeshBasicMaterial({ color: 0x8fb4d8, transparent: true, opacity: 0.10, side: THREE.DoubleSide }));
    doorGlow.position.set(0, H * 0.36, D / 2 - 0.3); g.add(doorGlow);

    // 柱
    const colMat = this._mat(P.col, 0.7);
    const colCount = Math.max(2, Math.round(W / 6));
    for (const side of [-1, 1]) {
      for (let i = 0; i < colCount; i++) {
        const x = -W / 2 + (W / (colCount - 1 || 1)) * i;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, H, 10), colMat);
        col.position.set(x, H / 2, side * (D / 2 - 1.6));
        col.castShadow = true; g.add(col);
      }
    }

    // 陈设
    for (const p of spec.props || []) this._prop(p, W, D, H, P);

    // 光
    const amb = new THREE.AmbientLight(0x5a4a3a, 0.55);
    g.add(amb);
    const key = new THREE.PointLight(P.light, 1.15, Math.max(W, D) * 1.4, 1.6);
    key.position.set(0, H * 0.8, 0);
    g.add(key);
    for (const [x, z] of [[-W / 3, -D / 3], [W / 3, -D / 3], [-W / 3, D / 3], [W / 3, D / 3]]) {
      const l = new THREE.PointLight(P.light, 0.55, 16, 2);
      l.position.set(x, H * 0.62, z);
      g.add(l);
    }

    // 可调查点（规格里的 + 内容数据里指定了这个室内、但规格没列的线索）
    this.pois = [];
    const extra = this._extraPois(spec);
    for (const poi of [...(spec.pois || []), ...extra]) {
      const [px, py, pz] = poi.pos;
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85 }));
      marker.position.set(px, py, pz);
      g.add(marker);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 16),
        new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
      halo.position.set(px, py, pz); halo.rotation.x = -Math.PI / 2;
      g.add(halo);
      const already = poi.clue && this.state && this.state.clueSet.has(poi.clue);
      if (already) { marker.visible = false; halo.visible = false; }
      this.pois.push({ ...poi, marker, halo, taken: !!already });
    }

    this.bounds = { W, D, H };
    // 出生点：门口内侧
    this.playerPos = { x: 0, y: 0, z: 1.66 };
    this.spawn = { x: 0, y: 0, z: 1.66 };
    return true;
  }

  // 内容数据里 clue.interior === 本场景、但规格没给点位的，补几个可调查点
  _extraPois(spec) {
    const out = [];
    if (!this.data || !this.data.clues) return out;
    const listed = new Set((spec.pois || []).map(p => p.clue).filter(Boolean));
    const W = spec.w || 20, D = spec.d || 12, H = spec.h || 6;
    let i = 0;
    for (const c of this.data.clues) {
      if (c.interior !== spec.id || listed.has(c.id)) continue;
      const k = i++;
      const x = (-W / 2 + 2.5) + ((k * 2.7) % Math.max(1, W - 5));
      const z = (-D / 2 + 2.5) + ((k * 1.9) % Math.max(1, D - 5));
      out.push({ id: 'auto_' + c.id, name: c.name, pos: [+x.toFixed(1), 1.15, +z.toFixed(1)], clue: c.id, text: c.detail || c.desc });
    }
    return out;
  }

  _prop(key, W, D, H, P) {
    const g = this.group;
    const [name, arg] = String(key).split(':');
    const n = parseInt(arg || '0', 10);
    const woodMat = this._mat(0x4a2e22, 0.82);
    const goldMat = this._mat(0xc9a227, 0.32, 0.85);
    const darkMat = this._mat(0x241a14, 0.9);
    const paperMat = this._mat(0xd8cbaa, 0.85);

    if (name === 'dragon_throne') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 2.6), goldMat);
      base.position.set(0, 0.5, -D / 2 + 3.4); g.add(base);
      const back = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.2, 0.4), goldMat);
      back.position.set(0, 2.2, -D / 2 + 2.2); g.add(back);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.5), this._mat(0x7a1f18, 0.7));
      seat.position.set(0, 1.2, -D / 2 + 3.3); g.add(seat);
      for (const s of [-1, 1]) {
        const dragon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), goldMat);
        dragon.position.set(s * 3.2, 1.7, -D / 2 + 2.6); g.add(dragon);
      }
      const l = new THREE.PointLight(0xffd27a, 1.0, 14, 2);
      l.position.set(0, 3.4, -D / 2 + 3); g.add(l);
    } else if (name === 'columns_row') {
      const cnt = n || 4;
      for (const side of [-1, 1]) {
        for (let i = 0; i < cnt; i++) {
          const x = -W / 2 + 2 + (W - 4) * (cnt === 1 ? 0.5 : i / (cnt - 1));
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, H, 10), this._mat(0x7a2b21, 0.7));
          col.position.set(x, H / 2, side * (D / 4));
          g.add(col);
        }
      }
    } else if (name === 'screen') {
      const s = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 0.18), woodMat);
      s.position.set(W / 2 - 3, 1.3, -D / 2 + 2.2); g.add(s);
      for (let i = 0; i < 4; i++) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), paperMat);
        panel.position.set(W / 2 - 3 - 1.65 + i * 1.1, 1.3, -D / 2 + 2.3); g.add(panel);
      }
    } else if (name === 'braziers') {
      for (const [x, z] of [[-W / 2 + 3, D / 2 - 3], [W / 2 - 3, D / 2 - 3]]) {
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.3, 0.55, 12), this._mat(0x6b5a3a, 0.6, 0.6));
        bowl.position.set(x, 0.9, z); g.add(bowl);
        const fire = new THREE.PointLight(0xff8a3a, 1.2, 12, 2);
        fire.position.set(x, 1.4, z); g.add(fire);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8),
          new THREE.MeshBasicMaterial({ color: 0xffa63a, transparent: true, opacity: 0.85 }));
        flame.position.set(x, 1.35, z); g.add(flame);
      }
    } else if (name === 'desk') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.1), woodMat);
      top.position.set(-W / 2 + 4, 0.86, D / 2 - 3.4); g.add(top);
      for (const [dx, dz] of [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.86, 0.1), darkMat);
        leg.position.set(-W / 2 + 4 + dx, 0.43, D / 2 - 3.4 + dz); g.add(leg);
      }
      for (let i = 0; i < 3; i++) {
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), paperMat);
        paper.rotation.x = -Math.PI / 2; paper.rotation.z = Math.random() * 0.6;
        paper.position.set(-W / 2 + 3.6 + i * 0.5, 0.93, D / 2 - 3.4 + (i - 1) * 0.16);
        g.add(paper);
      }
    } else if (name === 'archive_shelf') {
      const rows = Math.max(2, Math.round(W / 6));
      for (let r = 0; r < rows; r++) {
        const x = -W / 2 + 3 + r * ((W - 6) / Math.max(1, rows - 1));
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.2, H * 0.62, 0.7), woodMat);
        shelf.position.set(x, H * 0.31, -D / 2 + 1.6); g.add(shelf);
        for (let s = 0; s < 4; s++) {
          const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6), paperMat);
          scroll.rotation.z = Math.PI / 2;
          scroll.position.set(x - 1.1 + s * 0.72, H * 0.16 + (s % 2) * 0.34, -D / 2 + 1.2);
          g.add(scroll);
        }
      }
    } else if (name === 'bed') {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 4.0), woodMat);
      plat.position.set(W / 2 - 3, 0.25, -D / 2 + 4); g.add(plat);
      const quilt = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 3.6), this._mat(0x6a2a44, 0.85));
      quilt.position.set(W / 2 - 3, 0.66, -D / 2 + 4); g.add(quilt);
    } else if (name === 'altar') {
      const alt = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.4), goldMat);
      alt.position.set(0, 0.6, -D / 2 + 3); g.add(alt);
      const fig = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 10), this._mat(0x8a6b2a, 0.5, 0.6));
      fig.position.set(0, 2.3, -D / 2 + 3); g.add(fig);
      const l = new THREE.PointLight(0xffcf8a, 0.9, 12, 2);
      l.position.set(0, 2.6, -D / 2 + 3.4); g.add(l);
    } else if (name === 'banners') {
      for (const x of [-W / 4, 0, W / 4]) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, H * 0.55),
          new THREE.MeshStandardMaterial({ color: 0x8a1f18, roughness: 0.9, side: THREE.DoubleSide }));
        b.position.set(x, H * 0.6, -D / 2 + 0.5); g.add(b);
      }
    } else if (name === 'chests') {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.7), woodMat);
        c.position.set(-W / 2 + 2.4 + i * 1.3, 0.35, D / 2 - 1.6); g.add(c);
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 0.72), goldMat);
        band.position.set(-W / 2 + 2.4 + i * 1.3, 0.5, D / 2 - 1.6); g.add(band);
      }
    } else if (name === 'lantern_row') {
      const cnt = Math.max(2, Math.round(W / 5));
      for (let i = 0; i < cnt; i++) {
        const x = -W / 2 + (W / (cnt - 1 || 1)) * i;
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xff7a35, emissiveIntensity: 0.9, roughness: 0.7 }));
        body.position.set(x, H - 1.1, 0); g.add(body);
        const l = new THREE.PointLight(0xff9a52, 0.8, 10, 2);
        l.position.set(x, H - 1.1, 0); g.add(l);
      }
    } else if (name === 'map_table') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 2.2), woodMat);
      top.position.set(0, 0.9, 0); g.add(top);
      const map = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), this._mat(0xd9c9a0, 0.9));
      map.rotation.x = -Math.PI / 2; map.position.set(0, 0.99, 0); g.add(map);
    } else if (name === 'medicine_cabinet') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, H * 0.6, 0.8), woodMat);
      cab.position.set(0, H * 0.3, -D / 2 + 1.7); g.add(cab);
      for (let i = 0; i < 8; i++) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.06), this._mat(0x3a2a1e, 0.85));
        d.position.set(-W * 0.3 + (i % 4) * 0.9, H * 0.18 + Math.floor(i / 4) * 0.34, -D / 2 + 1.28);
        g.add(d);
      }
    } else if (name === 'weapon_rack') {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 0.5), woodMat);
      rack.position.set(W / 2 - 4, 1.1, -D / 2 + 1.6); g.add(rack);
      for (let i = 0; i < 5; i++) {
        const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 6), darkMat);
        spear.position.set(W / 2 - 5.6 + i * 0.8, 1.5, -D / 2 + 1.6); g.add(spear);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), this._mat(0x9aa3ab, 0.35, 0.8));
        tip.position.set(W / 2 - 5.6 + i * 0.8, 3.2, -D / 2 + 1.6); g.add(tip);
      }
    } else if (name === 'well') {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.0, 14), this._mat(0x6b665e, 0.9));
      ring.position.set(-W / 2 + 4, 0.5, D / 2 - 4); g.add(ring);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14), new THREE.MeshBasicMaterial({ color: 0x05060a }));
      hole.rotation.x = -Math.PI / 2; hole.position.set(-W / 2 + 4, 0.02, D / 2 - 4); g.add(hole);
    } else if (name === 'stone_coffin') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 3.2), this._mat(0x7a7a72, 0.9));
      box.position.set(0, 0.5, D / 4); g.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 3.4), this._mat(0x8a8a80, 0.9));
      lid.position.set(0, 1.1, D / 4); g.add(lid);
    } else if (name === 'scroll_rack') {
      for (let r = 0; r < 2; r++) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.1, 0.6), woodMat);
        rack.position.set(-W / 4 + r * W / 2, 1.2 + r * 0.7, D / 4); g.add(rack);
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6), paperMat);
          s.rotation.x = Math.PI / 2;
          s.position.set(-W / 4 + r * W / 2 - 2 + i * 0.9, 1.3 + r * 0.7, D / 4);
          g.add(s);
        }
      }
    }
  }

  // 室内移动（盒子范围限制）
  move(dt, input, yaw) {
    const B = this.bounds || { W: 20, D: 12 };
    const f = input.fwd, s = input.strafe;
    let mx = -Math.sin(yaw) * f + Math.cos(yaw) * s;
    let my = Math.cos(yaw) * f + Math.sin(yaw) * s;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const spd = input.run ? 4.6 : 2.6;
    this.playerPos.x = clamp(this.playerPos.x + mx * spd * dt, -B.W / 2 + 1.2, B.W / 2 - 1.2);
    this.playerPos.y = clamp(this.playerPos.y + my * spd * dt, -B.D / 2 + 1.2, B.D / 2 - 1.2);
    this.playerPos.z = 1.66;
  }

  // 找最近可调查点
  nearestPoi(camPos, camDir) {
    let best = null, bestScore = Infinity;
    for (const p of this.pois) {
      if (p.taken) continue;
      const dx = p.marker.position.x - camPos.x;
      const dy = p.marker.position.y - camPos.y;
      const dz = p.marker.position.z - camPos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 3.4) continue;
      const dot = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / (d || 1);
      if (dot < 0.25) continue;
      const score = d - dot * 1.2;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
}
