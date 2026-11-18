// world.js —— 场景、光照、天空、天气、分区流式加载、授权通道道具
import * as THREE from '../vendor/three/three.module.js';
import { mergeGeometries } from '../vendor/three/utils/BufferGeometryUtils.js';

const QUALITY = {
  high:   { dpr: 2.0, shadow: 2048, shadowR: 110, fogFar: 780, rain: 5200, loadR: 260, unloadR: 360 },
  medium: { dpr: 1.5, shadow: 1024, shadowR: 80,  fogFar: 620, rain: 3200, loadR: 210, unloadR: 300 },
  low:    { dpr: 1.0, shadow: 0,    shadowR: 60,  fogFar: 460, rain: 1500, loadR: 160, unloadR: 240 },
};

export class World {
  constructor(canvas, data) {
    this.data = data;
    this.canvas = canvas;
    const qp = new URLSearchParams(location.search).get('q');
    this.quality = QUALITY[qp] || QUALITY.medium;
    this.qualityName = QUALITY[qp] ? qp : 'medium';
    this.regions = {};       // id -> {group, state}
    this.loadQueue = [];
    this.clock = new THREE.Clock();
    this.timeOfDay = 8.5;    // 0-24
    this.weather = 'clear';
    this.props = new THREE.Group();
    this.gateLeaves = [];    // 可开的门

    const NOGL = /[?&]nogl=1/.test(location.search);
    this.renderer = NOGL ? {
      setPixelRatio() {}, setSize() {}, render() {}, dispose() {},
      shadowMap: { enabled: false, type: 0 },
      info: { render: { calls: 0, triangles: 0 }, memory: {}, programs: [] },
      getContext: () => null, outputColorSpace: 0, toneMapping: 0, toneMappingExposure: 1,
    } : new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
      preserveDrawingBuffer: /[?&]pdb=1/.test(location.search),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.dpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8a94a6, 120, this.quality.fogFar);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.15, 1200);
    this.camera.rotation.order = 'YXZ';

    this._setupLights();
    this._setupSky();
    this._setupWeather();
    this.scene.add(this.props);
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    this.quality = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.dpr));
    this.renderer.shadowMap.enabled = this.quality.shadow > 0;
    if (this.sun) {
      this.sun.castShadow = this.quality.shadow > 0;
      if (this.sun.castShadow) {
        this.sun.shadow.mapSize.set(this.quality.shadow, this.quality.shadow);
        const r = this.quality.shadowR;
        const c = this.sun.shadow.camera;
        c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 420;
        c.updateProjectionMatrix();
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
    }
    this.scene.fog.far = this.quality.fogFar;
    this._resize();
  }

  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0xbcd3ea, 0x4a3a30, 0.65);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffe6c0, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const r = this.quality.shadowR;
    const c = this.sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.35;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.ambient = new THREE.AmbientLight(0x30363f, 0.5);
    this.scene.add(this.ambient);
  }

  _setupSky() {
    const geo = new THREE.SphereGeometry(900, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2a4a72) },
        bottom: { value: new THREE.Color(0xcfd8e3) },
        horizon: { value: new THREE.Color(0xe8d9bf) },
      },
      vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon; varying vec3 vW;
        void main(){
          float h = normalize(vW).y;
          vec3 c = mix(horizon, top, pow(clamp(h,0.,1.),0.55));
          c = mix(c, bottom, clamp(-h*2.2,0.,1.));
          gl_FragColor = vec4(c,1.);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _setupWeather() {
    // 雨
    const rainGeo = new THREE.BufferGeometry();
    const N = 5200;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 60;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      vel[i] = 26 + Math.random() * 22;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainVel = vel;
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
      color: 0xaecbe0, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
    }));
    this.rain.visible = false; this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // 雪
    const snowGeo = new THREE.BufferGeometry();
    const M = 2600;
    const sp = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 110;
      sp[i * 3 + 1] = Math.random() * 40;
      sp[i * 3 + 2] = (Math.random() - 0.5) * 110;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.16, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    this.snow.visible = false; this.snow.frustumCulled = false;
    this.scene.add(this.snow);

    // 星
    const starGeo = new THREE.BufferGeometry();
    const K = 700, ssp = new Float32Array(K * 3);
    for (let i = 0; i < K; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.9);
      const R = 850;
      ssp[i * 3] = R * Math.sin(ph) * Math.cos(th);
      ssp[i * 3 + 1] = R * Math.cos(ph) + 40;
      ssp[i * 3 + 2] = R * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(ssp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xdfe9ff, size: 1.6, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  // ---------- 分区加载 ----------
  async loadRegion(id, loader) {
    if (!this.renderer.getContext || this.renderer.getContext()) { /* GL 正常 */ } else { this.regions[id] = { state: 'loaded-skip' }; return; }
    if (this.regions[id] && this.regions[id].state !== 'unloaded') return;
    const meta = this.data.regions[id];
    if (!meta) return;
    const entry = this.regions[id] || (this.regions[id] = { state: 'unloaded' });
    if (entry.state === 'loading') return;
    entry.state = 'loading';
    try {
      const gltf = await loader.loadAsync(meta.file);
      const g = gltf.scene;
      g.name = id;
      g.traverse(o => {
        if (o.isMesh) {
          // 超大地块（含 14km 地面）不投影，只接收，避免污染阴影贴图
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          const rad = o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : 0;
          o.castShadow = rad < 420;
          o.receiveShadow = true;
          o.frustumCulled = true;
          const m = o.material;
          if (m) {
            m.side = THREE.FrontSide;
            m.envMapIntensity = 0.6;
            const n = m.name || '';
            if (n.includes('琉璃') || n.includes('瓦')) { m.roughness = 0.55; m.metalness = 0.08; }
            else if (n.includes('鎏金')) { m.roughness = 0.32; m.metalness = 0.85; }
            else if (n.includes('汉白玉')) { m.roughness = 0.62; m.metalness = 0.02; }
            else if (n.includes('水面')) { m.roughness = 0.08; m.metalness = 0.35; m.transparent = true; m.opacity = 0.9; }
            else if (n.includes('朱红')) { m.roughness = 0.7; m.metalness = 0.02; }
            else if (n.includes('青砖')) { m.roughness = 0.86; m.metalness = 0.0; }
            else if (n.includes('青绿')) { m.roughness = 0.62; m.metalness = 0.03; }
            else if (n.includes('树')) { m.roughness = 0.9; }
          }
        }
      });
      entry.group = g; entry.state = 'loaded';
      this.scene.add(g);
    } catch (e) {
      console.warn('[world] 分区加载失败', id, e);
      entry.state = 'unloaded';
    }
  }

  unloadRegion(id) {
    const e = this.regions[id];
    if (!e || !e.group) return;
    this.scene.remove(e.group);
    e.group.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); } });
    e.group = null; e.state = 'unloaded';
  }

  // 根据玩家位置更新分区
  updateStreaming(px, py, loader) {
    const R = this.quality.loadR, RU = this.quality.unloadR;
    for (const [id, meta] of Object.entries(this.data.regions)) {
      const b = meta.bbox;
      const dx = Math.max(b[0][0] - px, 0, px - b[1][0]);
      const dy = Math.max(b[0][1] - py, 0, py - b[1][1]);
      const d = Math.hypot(dx, dy);
      const e = this.regions[id];
      if (d < R) {
        if (!e || e.state === 'unloaded') { if (this.loadQueue.length < 3 && !this.loadQueue.includes(id)) this.loadQueue.push(id); }
      } else if (d > RU && e && e.state === 'loaded' && id !== 'r00_world') {
        this.unloadRegion(id);
      }
    }
    // 串行加载，避免手机瞬卡
    if (this.loadQueue.length) {
      const id = this.loadQueue.shift();
      this.loadRegion(id, loader);
    }
  }

  // ---------- 时间 / 天气 ----------
  setTimeOfDay(h) {
    this.timeOfDay = ((h % 24) + 24) % 24;
    const t = this.timeOfDay;
    // 关键色
    const p = {
      night: { top: 0x0a1424, hor: 0x1a2740, sun: 0x9fb6d8, sunI: 0.18, hemi: 0.16, amb: 0.42, fog: 0x0d1522 },
      dawn:  { top: 0x3a4a6a, hor: 0xd9a878, sun: 0xffb877, sunI: 1.1, hemi: 0.4, amb: 0.5, fog: 0x8a7d70 },
      day:   { top: 0x2f5b8c, hor: 0xdfe6ec, sun: 0xfff2d8, sunI: 2.35, hemi: 0.72, amb: 0.5, fog: 0x9aa8b8 },
      dusk:  { top: 0x2a3350, hor: 0xe08a5a, sun: 0xff9d55, sunI: 1.3, hemi: 0.38, amb: 0.5, fog: 0x8c7a6c },
    };
    const mix3 = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
    let A, B, k;
    if (t < 4.5) { A = p.night; B = p.night; k = 0; }
    else if (t < 6.5) { A = p.night; B = p.dawn; k = (t - 4.5) / 2; }
    else if (t < 8.5) { A = p.dawn; B = p.day; k = (t - 6.5) / 2; }
    else if (t < 16.5) { A = p.day; B = p.day; k = 0; }
    else if (t < 18.5) { A = p.day; B = p.dusk; k = (t - 16.5) / 2; }
    else if (t < 20.5) { A = p.dusk; B = p.night; k = (t - 18.5) / 2; }
    else { A = p.night; B = p.night; k = 0; }

    this.sky.material.uniforms.top.value.copy(mix3(A.top, B.top, k));
    this.sky.material.uniforms.horizon.value.copy(mix3(A.hor, B.hor, k));
    this.sky.material.uniforms.bottom.value.copy(mix3(A.fog, B.fog, k));
    this.sun.color.copy(mix3(A.sun, B.sun, k));
    this.sun.intensity = A.sunI + (B.sunI - A.sunI) * k;
    this.hemi.intensity = A.hemi + (B.hemi - A.hemi) * k;
    this.ambient.intensity = A.amb + (B.amb - A.amb) * k;
    this.scene.fog.color.copy(mix3(A.fog, B.fog, k));
    this.baseFogColor = this.scene.fog.color.clone();

    const iN = (t < 5.5 || t > 19.5) ? 1 : 0;
    this.stars.material.opacity = iN * 0.9;

    // 太阳方位
    const ang = ((t - 6) / 24) * Math.PI * 2;
    this.sunDir = new THREE.Vector3(Math.cos(ang) * 0.6, Math.max(0.12, Math.sin(ang)), Math.sin(ang) * 0.55).normalize();
    // 灯笼在夜里自发光的开关由 UI 控制
    this.nightFactor = (t > 18.5 || t < 6.5) ? 1 : 0;
  }

  setWeather(w) {
    this.weather = w;
    this.rain.visible = (w === 'rain');
    this.snow.visible = (w === 'snow');
    if (w === 'rain') { this.scene.fog.near = 40; this.scene.fog.far = this.quality.fogFar * 0.55; }
    else if (w === 'snow') { this.scene.fog.near = 30; this.scene.fog.far = this.quality.fogFar * 0.45; }
    else if (w === 'fog') { this.scene.fog.near = 12; this.scene.fog.far = Math.min(220, this.quality.fogFar * 0.35); }
    else { this.scene.fog.near = 120; this.scene.fog.far = this.quality.fogFar; }
    this.emitWeather && this.emitWeather(w);
  }

  updateWeatherParticles(dt, px, py, pz) {
    if (this.rain.visible) {
      const arr = this.rain.geometry.attributes.position.array;
      const v = this.rainVel;
      for (let i = 0; i < v.length; i++) {
        arr[i * 3 + 1] -= v[i] * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 45 + Math.random() * 15;
          arr[i * 3] = (Math.random() - 0.5) * 110;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 110;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.position.set(px, pz, -py);
    }
    if (this.snow.visible) {
      const arr = this.snow.geometry.attributes.position.array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3 + 1] -= (1.1 + (i % 7) * 0.12) * dt;
        arr[i * 3] += Math.sin(performance.now() * 0.0004 + i) * 0.3 * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 34;
          arr[i * 3] = (Math.random() - 0.5) * 100;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 100;
        }
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
      this.snow.position.set(px, pz, -py);
    }
  }

  updateSun(px, py, pz) {
    const dir = this.sunDir || new THREE.Vector3(0.4, 0.8, 0.3);
    this.sun.position.set(px + dir.x * 180, pz + dir.y * 220, -py + dir.z * 180);
    this.sunTarget.position.set(px, pz, -py);
    this.sky.position.set(px, 0, -py);
    this.stars.position.set(px, 0, -py);
  }

  // ---------- 授权通道道具（补梯/门洞/院门） ----------
  buildPassages(passages, stoneMat, woodMat, darkMat) {
    const g = this.props;
    for (const p of passages) {
      const [x0, y0, x1, y1] = p.rect;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const w = Math.abs(x1 - x0), d = Math.abs(y1 - y0);
      if (p.prop === 'stone_stairs') {
        // 合并成一个几何体：一段楼梯只占 1 个 draw call
        const steps = Math.max(4, Math.round(Math.abs(p.h1 - p.h0) / 0.42));
        const along = p.axis === 'x' ? w : d;
        const rise = (p.h1 - p.h0) / steps;
        const run = along / steps;
        const geos = [];
        for (let i = 0; i < steps; i++) {
          const sx = p.axis === 'x' ? run : w;
          const sy = p.axis === 'x' ? d : run;
          const off = p.axis === 'x' ? (x0 + run * (i + 0.5)) : (y0 + run * (i + 0.5));
          const gg = new THREE.BoxGeometry(sx, Math.abs(rise) + 0.02, sy);
          gg.translate(p.axis === 'x' ? off : cx, p.h0 + rise * (i + 1) / 2, -(p.axis === 'x' ? cy : off));
          geos.push(gg);
        }
        const merged = mergeGeometries(geos, false);
        geos.forEach(x => x.dispose());
        if (merged) {
          const m = new THREE.Mesh(merged, stoneMat);
          m.castShadow = true; m.receiveShadow = true;
          g.add(m);
        }
      } else if (p.prop === 'wood_ladder') {
        const hgt = Math.abs(p.h1 - p.h0);
        const railGeo = new THREE.BoxGeometry(0.12, hgt, 0.12);
        for (const dx of [-w / 2 + 0.4, w / 2 - 0.4]) {
          const rail = new THREE.Mesh(railGeo, woodMat);
          rail.position.set(cx + dx, Math.min(p.h0, p.h1) + hgt / 2, -cy);
          rail.castShadow = true;
          g.add(rail);
        }
        const n = Math.round(hgt / 0.4);
        for (let i = 1; i < n; i++) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.07, 0.1), woodMat);
          rung.position.set(cx, Math.min(p.h0, p.h1) + (hgt / n) * i, -cy);
          g.add(rung);
        }
      } else if (p.prop === 'gate_tunnel') {
        // 门洞：两侧墙 + 拱顶 + 地面
        const H = 7.2, TH = 1.2;
        const depth = d, width = 9;
        const mk = (sx, sy, sz, px, py, pz) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), darkMat);
          m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
        };
        // 侧墙（沿 y 方向）
        mk(TH, H, depth, cx - width / 2 - TH / 2, H / 2, -cy);
        mk(TH, H, depth, cx + width / 2 + TH / 2, H / 2, -cy);
        // 顶（拱形近似：中间高二层）
        mk(width + TH * 2, 0.6, depth, cx, H + 0.3, -cy);
        mk(width * 0.66, 1.0, depth, cx, H + 1.0, -cy);
        // 门框（南面）
        const fr = new THREE.Mesh(new THREE.BoxGeometry(width + 2.4, H + 2.2, 0.5), stoneMat);
        fr.position.set(cx, (H + 2.2) / 2, -(cy - depth / 2 + 0.25));
        g.add(fr);
        const hole = new THREE.Mesh(new THREE.BoxGeometry(width, H - 0.6, 0.6), darkMat);
        hole.position.set(cx, (H - 0.6) / 2 + 0.3, -(cy - depth / 2 + 0.3));
        g.add(hole);
      } else if (p.prop === 'wood_gate') {
        const H = 5.0, W = Math.min(14, w);
        const post = new THREE.BoxGeometry(0.5, H, 0.5);
        for (const dx of [-W / 2, W / 2]) {
          const m = new THREE.Mesh(post, woodMat);
          m.position.set(cx + dx, H / 2, -cy); m.castShadow = true; g.add(m);
        }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.7, 0.7), woodMat);
        lintel.position.set(cx, H + 0.2, -cy); g.add(lintel);
        // 双扇门
        for (const s of [-1, 1]) {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.1, H - 0.4, 0.18), woodMat);
          leaf.position.set(cx + s * W / 4, (H - 0.4) / 2, -cy);
          leaf.userData.openRot = s * Math.PI * 0.62;
          leaf.userData.closedX = leaf.position.x;
          this.gateLeaves.push(leaf);
          g.add(leaf);
        }
      }
    }
  }

  // 门开关（视觉）
  setGatesOpen(open) {
    for (const leaf of this.gateLeaves) {
      const target = open ? 1 : 0;
      leaf.userData.t = target;
    }
  }

  updateGates(dt) {
    for (const leaf of this.gateLeaves) {
      const t = leaf.userData.t ?? 0;
      leaf.rotation.y += ((t ? leaf.userData.openRot : 0) - leaf.rotation.y) * Math.min(1, dt * 6);
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

export function makeMaterials() {
  return {
    stone: new THREE.MeshStandardMaterial({ color: 0xcfc9be, roughness: 0.72, metalness: 0.02 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b2a22, roughness: 0.72, metalness: 0.03 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x3a211a, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 0.95, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.9 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: 0.85, side: THREE.DoubleSide }),
  };
}
