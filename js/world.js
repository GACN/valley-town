/* world.js —— 山谷小镇：地形 / 河流 / 石桥 / 道路 / 可进入的房屋 / 森林 / 风车 */
(function () {
  'use strict';
  const VW = (window.VW = window.VW || {});
  const THREE = window.THREE;

  // ---------------- 数学 ----------------
  VW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  VW.lerp = (a, b, t) => a + (b - a) * t;
  VW.smoothstep = (e0, e1, x) => {
    const t = VW.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function h2(i, j, s) {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 144665);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function noise2(x, y, s) {
    s = s | 0;
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = h2(i, j, s), b = h2(i + 1, j, s), c = h2(i, j + 1, s), d = h2(i + 1, j + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  VW.noise2 = noise2;
  VW.rng = function (a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------------- 地形函数（渲染与碰撞共用） ----------------
  VW.WATER = 0.45;
  VW.RIVER = (z) => Math.sin(z * 0.017) * 9 + Math.sin(z * 0.037 + 1.7) * 3.0;

  VW.groundH = function (x, z) {
    const ax = Math.abs(x) - 45;
    const wallT = Math.max(0, ax);
    const wall = Math.pow(wallT / 110, 2.0) * 115 * (0.7 + 0.5 * noise2(x * 0.009 + 7, z * 0.009 + 3, 11));
    const hills = (noise2(x * 0.02 + 11, z * 0.02 + 5, 21) - 0.5) * 7.5 +
                  (noise2(x * 0.055 + 2, z * 0.055 + 9, 31) - 0.5) * 2.4;
    let h = 2.6 + hills * 0.6 + wall;

    // 谷底镇区压平
    const dx = x - 14, dz = z - 2;
    const dist = Math.sqrt(dx * dx * 0.82 + dz * dz * 0.5);
    const flat = 1 - VW.smoothstep(30, 58, dist);
    h = VW.lerp(h, 2.0, flat * 0.93);

    // 河床
    const d = Math.abs(x - VW.RIVER(z));
    const w = 6.0 + 1.8 * noise2(z * 0.03, 3.3, 41);
    h -= Math.exp(-Math.pow(d / w, 2)) * 5.5;
    return h;
  };

  // 石桥：横跨河道，沿 x 方向
  const BRIDGE = { z: 2, zc: 2.0, halfZ: 3.1, x0: -18, x1: 18, deckBase: 2.35 };
  VW.BRIDGE = BRIDGE;
  VW.deckY = function (x) {
    const t = VW.clamp((x - BRIDGE.x0) / (BRIDGE.x1 - BRIDGE.x0), 0, 1);
    return BRIDGE.deckBase + Math.sin(t * Math.PI) * 1.15;
  };
  VW.onBridge = (x, z) => x > BRIDGE.x0 && x < BRIDGE.x1 && Math.abs(z - BRIDGE.zc) < BRIDGE.halfZ - 0.35;

  VW.build = function (scene) {
    const W = { houses: [], windmills: [], chimneys: [], lamps: [], colliders: [], meshes: 0 };
    const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0.02 }, o || {}));
    const matPool = {};
    const mat = (key, c, o) => (matPool[key] = matPool[key] || M(c, o));

    // -------- 地形 --------
    const LITE = !!VW.LITE;
    const SK = VW.SKIP || new Set();
    const SIZE = 300, SEG = LITE ? 96 : 190;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color(0x4f6b34), grassB = new THREE.Color(0x74914a);
    const rock = new THREE.Color(0x77736a), sand = new THREE.Color(0xa2916a), dirt = new THREE.Color(0x8a7550);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = VW.groundH(x, z);
      pos.setY(i, y);
      // 坡度估算
      const e = 1.2;
      const slope = Math.min(1, (Math.abs(VW.groundH(x + e, z) - y) + Math.abs(VW.groundH(x, z + e) - y)) / e * 0.55);
      const n = noise2(x * 0.12, z * 0.12, 5);
      c.copy(grassA).lerp(grassB, n);
      if (y < VW.WATER + 1.15) c.lerp(sand, VW.smoothstep(VW.WATER + 1.15, VW.WATER - 0.6, y) * 0.9);
      if (slope > 0.34) c.lerp(rock, VW.smoothstep(0.34, 0.78, slope));
      if (y > 42) c.lerp(new THREE.Color(0xd9dde0), VW.smoothstep(42, 78, y) * 0.85);
      // 镇区踩出来的土色
      const dd = Math.hypot(x - 22, z - 4);
      if (dd < 34) c.lerp(dirt, (1 - dd / 34) * 0.22);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    if (!SK.has('terrain')) scene.add(terrain);
    W.terrain = terrain; W.meshes++;

    // -------- 河水 --------
    const wgeo = new THREE.PlaneGeometry(26, 300, LITE ? 10 : 26, LITE ? 40 : 120);
    wgeo.rotateX(-Math.PI / 2);
    const wp = wgeo.attributes.position;
    for (let i = 0; i < wp.count; i++) wp.setX(i, wp.getX(i) + VW.RIVER(wp.getZ(i)));
    wp.needsUpdate = true;
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime; varying vec2 vUv; varying float vW;
        void main(){ vUv=uv; vec3 p=position;
          float w = sin(p.z*0.7 + uTime*1.7)*0.05 + sin(p.x*0.9 - uTime*1.2)*0.04;
          p.y += w; vW = w;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv; varying float vW;
        void main(){
          float r = sin(vUv.y*260.0 + uTime*2.2 + sin(vUv.x*50.0)*1.4);
          float r2 = sin(vUv.y*90.0 - uTime*1.1 + vUv.x*12.0);
          float k = 0.5 + 0.25*r + 0.25*r2;
          vec3 deep = vec3(0.10,0.24,0.30), shal = vec3(0.30,0.55,0.62);
          vec3 col = mix(deep, shal, clamp(k*0.9+0.15,0.0,1.0));
          col += vW*0.6;
          gl_FragColor = vec4(col, 0.86); }`
    });
    const water = new THREE.Mesh(wgeo, waterMat);
    water.position.y = VW.WATER;
    water.name = 'water';
    if (!SK.has('water')) scene.add(water);
    W.water = water; W.meshes++;

    // -------- 石桥 --------
    const bridge = new THREE.Group();
    const stone = mat('stone', 0x9a9182, { roughness: 0.95 });
    const wood = mat('wood', 0x7a5b3c, { roughness: 0.9 });
    const roofMat = mat('roof', 0x5c4438, { roughness: 0.85 });
    const deckSeg = LITE ? 12 : 34, dw = 6.4;
    for (let i = 0; i < deckSeg; i++) {
      const xa = VW.lerp(BRIDGE.x0, BRIDGE.x1, i / deckSeg);
      const xb = VW.lerp(BRIDGE.x0, BRIDGE.x1, (i + 1) / deckSeg);
      const ya = VW.deckY(xa), yb = VW.deckY(xb);
      const len = Math.hypot(xb - xa, yb - ya);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.34, dw), stone);
      slab.position.set((xa + xb) / 2, (ya + yb) / 2 - 0.17, BRIDGE.zc);
      slab.rotation.z = Math.atan2(yb - ya, xb - xa);
      slab.castShadow = true; slab.receiveShadow = true;
      bridge.add(slab);
    }
    // 桥拱与桥墩
    const arch = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.85, 8, 26, Math.PI), stone);
    arch.position.set(0, VW.WATER + 0.4, BRIDGE.zc);
    arch.rotation.z = Math.PI;
    bridge.add(arch);
    for (const px of [-8.5, 8.5]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6, dw - 0.6), stone);
      pier.position.set(px, VW.WATER - 0.4, BRIDGE.zc);
      bridge.add(pier);
    }
    // 栏杆
    for (const sz of [-1, 1]) {
      for (let i = 0; i < deckSeg; i += 1) {
        const xa = VW.lerp(BRIDGE.x0, BRIDGE.x1, i / deckSeg);
        const xb = VW.lerp(BRIDGE.x0, BRIDGE.x1, (i + 1) / deckSeg);
        const ya = VW.deckY(xa) + 0.9, yb = VW.deckY(xb) + 0.9;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(xb - xa, yb - ya) * 1.02, 0.16, 0.16), stone);
        rail.position.set((xa + xb) / 2, (ya + yb) / 2, BRIDGE.zc + sz * (dw / 2 - 0.2));
        rail.rotation.z = Math.atan2(yb - ya, xb - xa);
        bridge.add(rail);
        if (i % 2 === 0) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.0, 0.26), stone);
          post.position.set(xa, ya - 0.02, BRIDGE.zc + sz * (dw / 2 - 0.2));
          bridge.add(post);
        }
      }
    }
    bridge.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (!SK.has('bridge')) scene.add(bridge);
    W.bridge = bridge; W.meshes += 40;

    // -------- 道路 --------
    function ribbon(points, width, color, yOff) {
      const g = new THREE.BufferGeometry();
      const verts = [], idx = [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
        let dx = next[0] - prev[0], dz = next[1] - prev[1];
        const L = Math.hypot(dx, dz) || 1;
        const nx = -dz / L, nz = dx / L;
        for (const s of [-1, 1]) {
          const x = p[0] + nx * width * 0.5 * s, z = p[1] + nz * width * 0.5 * s;
          verts.push(x, VW.groundH(x, z) + (yOff || 0.07), z);
        }
        if (i > 0) {
          const a = (i - 1) * 2, b = a + 1, cc = i * 2, d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat('road' + color, color, { roughness: 1 }));
      m.receiveShadow = true;
      scene.add(m);
      W.meshes++;
      return m;
    }
    function line(x0, z0, x1, z1, steps, wob) {
      const out = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        out.push([VW.lerp(x0, x1, t) + Math.sin(t * 7 + x0) * wob, VW.lerp(z0, z1, t)]);
      }
      return out;
    }
    ribbon(line(24, -95, 24, 95, 60, 1.4), 7, 0x8b7c5e);
    ribbon(line(-26, -80, -26, 80, 50, 1.2), 6, 0x8b7c5e);
    ribbon(line(-44, 2, -19, 2, 10, 0.4), 6, 0x8b7c5e);
    ribbon(line(19, 2, 46, 2, 12, 0.4), 6, 0x8b7c5e);
    // 从主路到河畔渔屋的小径
    ribbon(line(24, 46, 15, 58, 14, 0.8), 3.4, 0x9d8a63);

    // -------- 房屋（可进入） --------
    function house(cfg) {
      const { x, z, rot, name, job, color, w = 8.4, d = 7.2, h = 3.15 } = cfg;
      const g = new THREE.Group();
      const baseY = Math.max(VW.groundH(x, z), VW.groundH(x + w / 2, z + d / 2), VW.groundH(x - w / 2, z - d / 2));
      g.position.set(x, baseY, z);
      g.rotation.y = rot;

      const wallMat = mat('wall' + color, color, { roughness: 0.95 });
      const trimMat = mat('trim', 0x6b4f36, { roughness: 0.9 });
      const t = 0.3, doorW = 1.7;
      const floorMat = mat('floor', 0x9a7a52, { roughness: 0.95 });

      // 地板
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), floorMat);
      floor.position.y = 0.11; floor.receiveShadow = true; g.add(floor);

      // 墙体：靠门一面(+z)留门洞
      const mk = (bw, bh, bd, px, py, pz) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wallMat);
        m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
      };
      const sideH = h;
      mk(t, sideH, d, -w / 2 + t / 2, sideH / 2, 0);
      mk(t, sideH, d, w / 2 - t / 2, sideH / 2, 0);
      mk(w, sideH, t, 0, sideH / 2, -d / 2 + t / 2);
      const gapSide = w / 2 - doorW / 2;
      mk(gapSide * 2 - t * 2, sideH, t, -(doorW / 2 + gapSide / 2 - t / 2), sideH / 2, d / 2 - t / 2);
      mk(gapSide * 2 - t * 2, sideH, t, (doorW / 2 + gapSide / 2 - t / 2), sideH / 2, d / 2 - t / 2);
      mk(doorW + 0.5, sideH - 2.15, t, 0, 2.15 + (sideH - 2.15) / 2, d / 2 - t / 2); // 门楣

      // 门框
      for (const sx of [-1, 1]) {
        const fm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.36), trimMat);
        fm.position.set(sx * (doorW / 2 + 0.06), 1.1, d / 2 + 0.06); g.add(fm);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.4, 0.16, 0.36), trimMat);
      lintel.position.set(0, 2.26, d / 2 + 0.06); g.add(lintel);

      // 屋顶（双坡）
      const roofH = 2.2, over = 0.7;
      for (const s of [-1, 1]) {
        const slopeLen = Math.hypot(w / 2 + over, roofH);
        const r = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.26, d + over * 2), roofMat);
        r.position.set(s * (w / 4 + over / 4), h + roofH / 2 - 0.1, 0);
        r.rotation.z = -s * Math.atan2(roofH, w / 2 + over);
        r.castShadow = true; r.receiveShadow = true; g.add(r);
      }
      // 山墙
      for (const s of [-1, 1]) {
        const sh = new THREE.Shape();
        sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, roofH); sh.lineTo(-w / 2, 0);
        const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false });
        const gm = new THREE.Mesh(gg, wallMat);
        gm.position.set(0, h, s * (d / 2 - 0.3)); g.add(gm);
      }

      // 窗
      const winMat = new THREE.MeshStandardMaterial({ color: 0x2b3a42, emissive: 0xffcf87, emissiveIntensity: 0, roughness: 0.4 });
      for (const wx of [-w / 4 - 0.4, w / 4 + 0.4]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.12), winMat);
        win.position.set(wx, 1.9, -d / 2 - 0.02); g.add(win);
        const sf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.1), trimMat);
        sf.position.set(wx, 1.9, -d / 2 + 0.02); g.add(sf);
      }
      for (const s of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 1.0), winMat);
        win.position.set(s * (w / 2 + 0.02), 1.9, 0.4); g.add(win);
      }

      // 烟囱
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.1, 0.8), mat('brick', 0x7d5347));
      ch.position.set(w * 0.28, h + roofH * 0.75, -d * 0.2);
      ch.castShadow = true; g.add(ch);
      W.chimneys.push(new THREE.Vector3(x + Math.cos(rot) * w * 0.28 + Math.sin(rot) * d * 0.2, baseY + h + roofH * 0.75 + 1.0, z - Math.sin(rot) * w * 0.28 + Math.cos(rot) * d * 0.2));

      // 室内家具
      const wood = mat('wood', 0x7a5b3c, { roughness: 0.9 });
      const cloth = mat('cloth' + color, 0xcfc3a8, { roughness: 1 });
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.1), wood);
      table.position.set(-w * 0.18, 0.78, -d * 0.18); g.add(table);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.76, 0.12), wood);
        leg.position.set(-w * 0.18 + sx * 0.8, 0.38, -d * 0.18 + sz * 0.42); g.add(leg);
      }
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 2.2), cloth);
      bed.position.set(w / 2 - 1.3, 0.32, d / 2 - 1.5); bed.castShadow = true; g.add(bed);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), mat('pillow', 0xf2ece0));
      pillow.position.set(w / 2 - 1.3, 0.62, d / 2 - 2.35); g.add(pillow);
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - 1.4, 0.18, 0.4), wood);
      shelf.position.set(0, 1.9, -d / 2 + 0.35); g.add(shelf);
      for (let i = 0; i < 5; i++) {
        const bk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.28), mat('bk' + (i % 3), [0x8d3b2f, 0x2f5a8d, 0x3d7a4a][i % 3]));
        bk.position.set(-w / 2 + 0.9 + i * 0.25, 2.2, -d / 2 + 0.35); g.add(bk);
      }
      // 壁炉 + 火光
      const fp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.5), mat('brick', 0x7d5347));
      fp.position.set(-w / 2 + 1.0, 0.7, -d / 2 + 0.45); g.add(fp);
      const fire = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.12), new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff6a1a, emissiveIntensity: 1.6 }));
      fire.position.set(-w / 2 + 1.0, 0.42, -d / 2 + 0.72); g.add(fire);
      // 地毯
      const rug = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 2.0), mat('rug' + color, 0x8a5a4a));
      rug.position.set(0.4, 0.24, 0.3); g.add(rug);
      // 吊灯
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffcd82, emissiveIntensity: 1.4 }));
      lamp.position.set(0, h - 0.75, 0); g.add(lamp);
      W.lamps.push(lamp);

      if (!SK.has('houses')) scene.add(g);
      W.meshes += 26;
      const H = {
        name, job, group: g, x, z, rot, w, d, h, baseY, doorW,
        winMat, fire,
        floorY: baseY + 0.22,
        inside(p) {
          const dx = p.x - x, dz = p.z - z;
          const lx = dx * Math.cos(rot) - dz * Math.sin(rot);
          const lz = dx * Math.sin(rot) + dz * Math.cos(rot);
          return Math.abs(lx) < w / 2 - 0.3 && Math.abs(lz) < d / 2 - 0.3;
        },
        // 门口世界坐标（门朝 +z 本地）
        door: new THREE.Vector3(x + Math.sin(rot) * (d / 2 + 1.6), baseY, z + Math.cos(rot) * (d / 2 + 1.6)),
        center: new THREE.Vector3(x, baseY, z)
      };
      W.houses.push(H);
      return H;
    }

    const housesCfg = [
      { x: 34, z: -30, rot: -Math.PI / 2, name: '艾拉的面包房', job: '面包师', color: 0xd9c9a8 },
      { x: 34, z: -12, rot: -Math.PI / 2, name: '皮特的铁匠铺', job: '铁匠', color: 0xc9b79a },
      { x: 34, z: 20, rot: -Math.PI / 2, name: '克拉拉的家', job: '医生', color: 0xdfd6c0 },
      { x: 34, z: 36, rot: -Math.PI / 2, name: '奥托的钟表铺', job: '钟表匠', color: 0xd2c0a2 },
      { x: 20, z: -24, rot: Math.PI / 2, name: '老汤姆的木工房', job: '木匠', color: 0xcdbb99 },
      { x: 20, z: -6, rot: Math.PI / 2, name: '苏菲的家', job: '教师', color: 0xe3d8c2 },
      { x: 20, z: 26, rot: Math.PI / 2, name: '米拉的磨坊屋', job: '磨坊主', color: 0xd6c5a4 },
      { x: 20, z: 42, rot: Math.PI / 2, name: '玛尔塔的酒馆', job: '酒馆老板', color: 0xc2a985 },
      { x: -32, z: -26, rot: Math.PI / 2, name: '汉斯的农舍', job: '农夫', color: 0xd0bd9c },
      { x: -32, z: -8, rot: Math.PI / 2, name: '妮娜的花房', job: '花匠', color: 0xdccfb4 },
      { x: -32, z: 18, rot: Math.PI / 2, name: '尤里的牧屋', job: '牧羊人', color: 0xcbb795 },
      { x: -32, z: 34, rot: Math.PI / 2, name: '卢卡斯的渔屋', job: '渔夫', color: 0xbfae8e }
    ];
    housesCfg.forEach(house);

    // -------- 广场：井 / 摊位 / 长椅 / 路灯 --------
    const plazaG = new THREE.Group();
    const px = 36, pz = 4;
    const py = VW.groundH(px, pz);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.2, 40), mat('plaza', 0x8f8266, { roughness: 1 }));
    ring.position.set(px, py + 0.08, pz); ring.receiveShadow = true; plazaG.add(ring);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 1.1, 16), stone);
    well.position.set(px, py + 0.6, pz); plazaG.add(well);
    const wellTop = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 6, 16), stone);
    wellTop.position.set(px, py + 1.15, pz); wellTop.rotation.x = Math.PI / 2; plazaG.add(wellTop);
    for (const [sx, sz, ang] of [[-4.5, -5, 0.4], [4.5, 5.5, -0.6], [-5, 5, 1.1], [5, -5.5, 2.2]]) {
      const stall = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.7), mat('stall', 0xb2603f));
      top.position.y = 2.0; top.castShadow = true; stall.add(top);
      for (const cx of [-1.2, 1.2]) for (const cz of [-0.75, 0.75]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.1), wood);
        leg.position.set(cx, 1.0, cz); stall.add(leg);
      }
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.2), mat('crate', 0xc89a5b));
      crate.position.y = 0.5; stall.add(crate);
      stall.position.set(px + sx, py, pz + sz); stall.rotation.y = ang; plazaG.add(stall);
    }
    for (const [sx, sz, ang] of [[-8, -3, 0.2], [8, 3, 3.4]]) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), wood);
      seat.position.y = 0.55; seat.castShadow = true; bench.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), wood);
      back.position.set(0, 0.85, -0.2); bench.add(back);
      for (const lx of [-1.0, 1.0]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.42), wood);
        l.position.set(lx, 0.28, 0); bench.add(l);
      }
      bench.position.set(px + sx, py, pz + sz); bench.rotation.y = ang; plazaG.add(bench);
    }
    // 路灯
    const lampPositions = [[24, -34], [24, -8], [24, 24], [24, 48], [-26, -20], [-26, 14], [36, -7], [36, 15], [4, -20], [4, 20]];
    for (const [lx, lz] of lampPositions) {
      const ly = VW.groundH(lx, lz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.2, 8), mat('pole', 0x3b3730));
      pole.position.set(lx, ly + 2.1, lz); pole.castShadow = true; plazaG.add(pole);
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd28a, emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), bulbMat);
      bulb.position.set(lx, ly + 4.15, lz); plazaG.add(bulb);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.35, 8), mat('pole', 0x3b3730));
      cap.position.set(lx, ly + 4.45, lz); plazaG.add(cap);
      W.lamps.push({ mesh: bulb, mat: bulbMat });
    }
    if (!SK.has('plaza')) scene.add(plazaG);
    W.meshes += 40;

    // -------- 森林 --------
    const rnd = VW.rng(20261117);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    const leafGeo = new THREE.ConeGeometry(1.5, 4.2, 7);
    leafGeo.translate(0, 3.6, 0);
    const trunkMat = mat('trunk', 0x4b3627);
    const leafMats = [mat('leaf1', 0x2f5426), mat('leaf2', 0x3b6530), mat('leaf3', 0x27472a)];
    const maxTrees = LITE ? 160 : 620;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, maxTrees);
    const leafInst = [0, 1, 2].map(i => new THREE.InstancedMesh(leafGeo, leafMats[i], Math.ceil(maxTrees / 3) + 20));
    const dummy = new THREE.Object3D();
    const leafCount = [0, 0, 0];
    let treeN = 0;
    for (let i = 0; i < (LITE ? 1400 : 5200) && treeN < maxTrees; i++) {
      const x = (rnd() * 2 - 1) * 140, z = (rnd() * 2 - 1) * 145;
      const y = VW.groundH(x, z);
      if (y < VW.WATER + 1.0 || y > 62) continue;
      const dTown = Math.hypot(x - 20, z - 4);
      if (dTown < 46) continue;
      if (Math.abs(x - VW.RIVER(z)) < 11) continue;
      const e = 1.5;
      const slope = Math.abs(VW.groundH(x + e, z) - y) / e;
      if (slope > 0.85) continue;
      const dens = 0.35 + 0.65 * noise2(x * 0.03, z * 0.03, 77);
      if (rnd() > dens) continue;
      const s = 0.7 + rnd() * 0.85;
      dummy.position.set(x, y - 0.1, z);
      dummy.rotation.y = rnd() * Math.PI * 2;
      dummy.scale.set(s, s * (0.85 + rnd() * 0.4), s);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(treeN, dummy.matrix);
      const k = treeN % 3;
      leafInst[k].setMatrixAt(leafCount[k]++, dummy.matrix);
      treeN++;
    }
    trunkInst.count = treeN;
    trunkInst.castShadow = true; trunkInst.receiveShadow = true;
    if (!SK.has('trees')) scene.add(trunkInst);
    leafInst.forEach((m, i) => { m.count = leafCount[i]; m.castShadow = true; if (!SK.has('trees')) scene.add(m); });
    W.treeCount = treeN; W.meshes += 4;

    // -------- 风车 --------
    for (const [wx, wz, bw] of [[78, -18, 0.9], [86, 46, 1.1], [-78, -54, 1.0], [-74, 28, 0.85]]) {
      const wy = VW.groundH(wx, wz);
      const g = new THREE.Group();
      g.position.set(wx, wy, wz);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 12, 10), mat('millWall', 0xe0d6bd, { roughness: 0.95 }));
      tower.position.y = 6; tower.castShadow = true; tower.receiveShadow = true; g.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.6, 10), roofMat);
      cap.position.y = 13.1; cap.castShadow = true; g.add(cap);
      const balcony = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.25, 12), wood);
      balcony.position.y = 8.4; g.add(balcony);
      const hub = new THREE.Group();
      hub.position.set(0, 12.6, 2.6);
      for (let b = 0; b < 4; b++) {
        const blade = new THREE.Group();
        const spar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 9.4, 0.18), wood);
        spar.position.y = 4.7; spar.castShadow = true; blade.add(spar);
        const sail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 7.4, 0.06), mat('sail', 0xece2cb, { roughness: 1 }));
        sail.position.set(0.85, 5.0, 0.05); blade.add(sail);
        blade.rotation.z = (b * Math.PI) / 2;
        hub.add(blade);
      }
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8), wood);
      axle.rotation.x = Math.PI / 2; hub.add(axle);
      g.add(hub);
      if (!SK.has('wind')) scene.add(g);
      W.windmills.push({ group: g, hub, speed: bw });
      W.meshes += 9;
    }

    // -------- 农田与草垛（让西岸有生活气） --------
    for (let i = 0; i < 4; i++) {
      const fx = -46, fz = -22 + i * 16;
      const fy = VW.groundH(fx, fz);
      const field = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 11), mat('field' + i, i % 2 ? 0x7d7a3c : 0x8a7c46, { roughness: 1 }));
      field.position.set(fx, fy + 0.06, fz); field.receiveShadow = true; scene.add(field);
      for (let r = 0; r < 8; r++) {
        const row = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 0.5), mat('crop', 0x6f6a2c));
        row.position.set(fx, fy + 0.25, fz - 4.5 + r * 1.3); scene.add(row);
      }
    }
    W.meshes += 40;

    return W;
  };

  // ---------------- 碰撞 ----------------
  // 返回修正后的位置（房屋墙体 + 桥栏杆）
  VW.collide = function (x, z) {
    const out = { x, z, hit: false };
    // 房屋墙（只检查附近的）
    for (const H of W_HOUSES) {
      const dx = out.x - H.x, dz = out.z - H.z;
      if (Math.abs(dx) > 14 || Math.abs(dz) > 14) continue;
      const cr = Math.cos(H.rot), sr = Math.sin(H.rot);
      let lx = dx * cr - dz * sr;
      let lz = dx * sr + dz * cr;
      const hw = H.w / 2, hd = H.d / 2, tw = 0.34, r = 0.34;
      const inX = Math.abs(lx) < hw + r, inZ = Math.abs(lz) < hd + r;
      // 门洞：本地 +z 面 |lx| < doorW/2
      const doorGap = Math.abs(lx) < H.doorW / 2 + 0.1;
      if (inX && Math.abs(lz - hd) < tw + r && Math.abs(lx) > H.doorW / 2) {
        lz = hd + tw + r; out.hit = true;       // 推到屋外
      } else if (inX && Math.abs(lz + hd) < tw + r) {
        lz = -hd - tw - r; out.hit = true;
      } else if (inZ && Math.abs(lx - hw) < tw + r) {
        lx = hw + tw + r; out.hit = true;
      } else if (inZ && Math.abs(lx + hw) < tw + r) {
        lx = -hw - tw - r; out.hit = true;
      }
      if (out.hit) {
        out.x = H.x + (lx * cr + lz * sr);
        out.z = H.z + (-lx * sr + lz * cr);
      }
    }
    // 桥栏杆
    if (out.x > BRIDGE.x0 && out.x < BRIDGE.x1) {
      const edge = BRIDGE.halfZ - 0.45;
      const dz = out.z - BRIDGE.zc;
      if (Math.abs(dz) > edge && Math.abs(dz) < edge + 0.5 && VW.deckY(out.x) > VW.groundH(out.x, out.z) - 0.2) {
        out.z = BRIDGE.zc + Math.sign(dz) * edge;
        out.hit = true;
      }
    }
    return out;
  };
  let W_HOUSES = [];
  VW.setHouses = (arr) => { W_HOUSES = arr; };

  // 站立高度：地形 / 桥面
  VW.standY = function (x, z) {
    const g = VW.groundH(x, z);
    if (VW.onBridge(x, z)) return Math.max(g, VW.deckY(x) + 0.06);
    return g;
  };
})();