/* main.js —— 渲染、光照、天气、输入、HUD */
(function () {
  'use strict';
  const VW = window.VW;
  const THREE = window.THREE;
  const $ = (id) => document.getElementById(id);

  const Q = new URLSearchParams(location.search);
  const LOWQ = Q.get('q') === 'low';
  const LITE = Q.get('lite') === '1';
  VW.LITE = LITE;
  VW.SKIP = new Set((Q.get('skip') || '').split(',').filter(Boolean));
  const canvas = $('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOWQ, powerPreference: 'high-performance' });
    if (renderer.getContext().isContextLost()) throw new Error('context lost on init');
  } catch (e) { fatal(e.message || 'unknown error'); return; }
  renderer.setPixelRatio(LOWQ ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !LOWQ;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  function fatal(msg) {
    const el = document.getElementById('loading');
    if (el) {
      el.classList.remove('hide');
      el.innerHTML = '<div style="max-width:520px;padding:0 24px;text-align:center;line-height:1.9;font-size:13px">' +
        '<div style="letter-spacing:.4em;opacity:.6;margin-bottom:12px">WEBGL 不可用</div>' +
        '这台设备的浏览器没能创建 WebGL2 上下文，山谷没法生长。<br>' +
        '换 Chrome / Edge，或在设置里打开「硬件加速」再试。<br>' +
        '<span style="opacity:.5;font-size:11px">' + msg + '</span></div>';
    }
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.15, 900);
  scene.fog = new THREE.FogExp2(0xbcd6e3, 0.0032);

  // ---------- 光 ----------
  const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x4a4432, 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0009;
  scene.add(sun); scene.add(sun.target);
  const playerLamp = new THREE.PointLight(0xffd9a0, 0.0, 16, 2);
  scene.add(playerLamp);

  // ---------- 世界 ----------
  const world = VW.build(scene);
  const car = VW.Car.create(scene);
  VW.Life.init(scene, world, car);
  const player = VW.Player.init(scene, camera);

  // ---------- 云 ----------
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 1, transparent: true, opacity: 0.62, depthWrite: false });
  const crnd = VW.rng(77);
  for (let i = 0; i < (LITE ? 0 : 14); i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), cloudMat);
    const s = 12 + crnd() * 22;
    c.scale.set(s, s * 0.28, s * 0.7);
    c.position.set((crnd() - 0.5) * 380, 78 + crnd() * 30, (crnd() - 0.5) * 380);
    clouds.add(c);
  }
  scene.add(clouds);

  // ---------- 天气粒子 ----------
  const RAIN_N = VW.LITE ? 300 : 2600, SNOW_N = VW.LITE ? 200 : 1600;
  function makePoints(n, size, color, opacity) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 70;
      p[i * 3 + 1] = Math.random() * 32;
      p[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.visible = false;
    scene.add(pts);
    return pts;
  }
  const rain = makePoints(RAIN_N, 0.09, 0xbfd8e8, 0.85);
  rain.material.sizeAttenuation = true;
  const snow = makePoints(SNOW_N, 0.22, 0xffffff, 0.9);

  // ---------- 炊烟 ----------
  const smokeGeo = new THREE.BufferGeometry();
  const smokeN = Math.max(1, world.chimneys.length * (VW.LITE ? 2 : 12));
  const smokePos = new Float32Array(smokeN * 3);
  const smokeSeed = [];
  for (let i = 0; i < smokeN; i++) {
    const c = world.chimneys[i % world.chimneys.length] || new THREE.Vector3(0, 10, 0);
    const t = Math.random();
    smokePos[i * 3] = c.x + (Math.random() - 0.5) * 0.4;
    smokePos[i * 3 + 1] = c.y + t * 7;
    smokePos[i * 3 + 2] = c.z + (Math.random() - 0.5) * 0.4;
    smokeSeed.push({ base: c.clone(), t, speed: 0.5 + Math.random() * 0.6, sway: Math.random() * 6.28 });
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokeMat = new THREE.PointsMaterial({ color: 0xdfdcd4, size: 0.75, transparent: true, opacity: 0.4, depthWrite: false });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  scene.add(smoke);

  // ---------- 天气与光照 ----------
  const WEATHER = {
    clear: { fog: 0.0032, fogColor: 0xbcd6e3, sun: 1.35, hemi: 0.65, sky: null },
    rain: { fog: 0.011, fogColor: 0x6d7d88, sun: 0.42, hemi: 0.45, sky: 0x66757f },
    fog: { fog: 0.024, fogColor: 0xa9b4b8, sun: 0.5, hemi: 0.55, sky: 0xa9b4b8 },
    snow: { fog: 0.014, fogColor: 0xc9d4da, sun: 0.7, hemi: 0.7, sky: 0xbfcbd2 }
  };
  const SkyNight = new THREE.Color(0x0a1424), SkyDawn = new THREE.Color(0xd08a5e),
        SkyDay = new THREE.Color(0x9dc6e6), SkyDusk = new THREE.Color(0xb96a45);
  let weather = Q.get('weather') || 'clear';
  let shadowsOn = !LOWQ;

  function skyColor(hour) {
    const c = new THREE.Color();
    if (hour < 4.5) c.copy(SkyNight);
    else if (hour < 7) c.copy(SkyNight).lerp(SkyDawn, VW.smoothstep(4.5, 7, hour));
    else if (hour < 9) c.copy(SkyDawn).lerp(SkyDay, VW.smoothstep(7, 9, hour));
    else if (hour < 16.5) c.copy(SkyDay);
    else if (hour < 19) c.copy(SkyDay).lerp(SkyDusk, VW.smoothstep(16.5, 19, hour));
    else if (hour < 21) c.copy(SkyDusk).lerp(SkyNight, VW.smoothstep(19, 21, hour));
    else c.copy(SkyNight);
    return c;
  }

  function applyWeather(now) {
    const w = WEATHER[weather] || WEATHER.clear;
    const hour = VW.Life.dayTime;
    const day = VW.clamp(Math.sin(((hour - 6) / 12) * Math.PI), 0, 1);
    const sky = skyColor(hour);
    if (w.sky) sky.lerp(new THREE.Color(w.sky), 0.55);
    scene.background = sky;
    scene.fog.color.copy(sky);
    scene.fog.density = w.fog * (1 + (1 - day) * 0.5);

    // 太阳位置
    const ang = ((hour - 6) / 12) * Math.PI;
    const tgt = player ? player.pos : new THREE.Vector3(20, 0, 4);
    sun.position.set(tgt.x + Math.cos(ang) * 90, Math.max(6, Math.sin(ang) * 95), tgt.z - 55);
    sun.target.position.set(tgt.x, 0, tgt.z);
    sun.intensity = w.sun * (0.12 + day * 0.95);
    sun.color.setHSL(0.09, 0.35, 0.52 + day * 0.16 + (1 - day) * 0.1);
    hemi.intensity = w.hemi * (0.22 + day * 0.9);
    hemi.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.35);

    rain.visible = weather === 'rain';
    snow.visible = weather === 'snow';
    cloudMat.opacity = weather === 'clear' ? 0.62 : 0.42;
    cloudMat.color.set(weather === 'clear' ? 0xf4f8fb : 0xd9e2e8);

    // 窗灯、路灯、壁炉
    const night = VW.smoothstep(17.5, 20.5, hour) + (1 - VW.smoothstep(4.5, 6.5, hour));
    const lampK = VW.clamp(night, 0, 1) * (weather === 'clear' ? 1 : 1.25);
    for (const H of VW.Life.houses) {
      H.winMat.emissiveIntensity = lampK * 0.9;
      if (H.fire) H.fire.material.emissiveIntensity = 1.2 + lampK * 1.2;
    }
    for (const l of world.lamps) {
      if (l.mat) l.mat.emissiveIntensity = lampK * 1.8;
      else if (l.isMesh) l.material.emissiveIntensity = lampK * 1.8;
    }
    smokeMat.opacity = weather === 'rain' ? 0.18 : 0.4;
    if (player) playerLamp.intensity = VW.Player.standInside ? 0.55 + lampK * 0.6 : 0;
  }

  // ---------- 输入 ----------
  const keys = Object.create(null);
  const input = { forward: false, back: false, left: false, right: false, run: false, brake: false };
  let lookDrag = null;
  const touchMove = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyC') { VW.CINE.playing ? VW.CINE.stop() : VW.CINE.play(); }
    if (e.code === 'Escape') VW.CINE.stop();
    if (e.code === 'Digit1') setWeather('clear');
    if (e.code === 'Digit2') setWeather('rain');
    if (e.code === 'Digit3') setWeather('fog');
    if (e.code === 'Digit4') setWeather('snow');
    if (e.code === 'KeyT') VW.Life.timeScale = VW.Life.timeScale > 0.2 ? 1 / 18 : 0.35;
    if (e.code === 'KeyN') VW.Life.dayTime = VW.Life.dayTime > 6 && VW.Life.dayTime < 19 ? 20.6 : 8.4;
    if (e.code === 'KeyG') { shadowsOn = !shadowsOn; renderer.shadowMap.enabled = shadowsOn; scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; }); }
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.clientX > window.innerWidth * 0.42 && !isMobileUI(e)) {
      lookDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (lookDrag && e.pointerId === lookDrag.id) {
      const dx = e.clientX - lookDrag.x, dy = e.clientY - lookDrag.y;
      lookDrag.x = e.clientX; lookDrag.y = e.clientY;
      player.yaw -= dx * 0.0032;
      player.pitch = VW.clamp(player.pitch - dy * 0.0028, -1.1, 0.9);
    }
    if (touchMove.active && e.pointerId === touchMove.id) {
      touchMove.dx = VW.clamp((e.clientX - touchMove.ox) / 60, -1, 1);
      touchMove.dy = VW.clamp((e.clientY - touchMove.oy) / 60, -1, 1);
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (lookDrag && e.pointerId === lookDrag.id) lookDrag = null;
    if (touchMove.active && e.pointerId === touchMove.id) { touchMove.active = false; touchMove.dx = 0; touchMove.dy = 0; joyBase.style.display = 'none'; }
  });
  function isMobileUI(e) { return e.target && e.target.closest && e.target.closest('.ui'); }

  // 虚拟摇杆
  const joyBase = $('joy'), joyKnob = $('joyknob');
  const leftZone = $('leftzone');
  leftZone.addEventListener('pointerdown', (e) => {
    touchMove.active = true; touchMove.id = e.pointerId; touchMove.ox = e.clientX; touchMove.oy = e.clientY;
    joyBase.style.display = 'block';
    joyBase.style.left = (e.clientX - 62) + 'px';
    joyBase.style.top = (e.clientY - 62) + 'px';
    joyKnob.style.transform = 'translate(0,0)';
    e.preventDefault();
  });
  leftZone.addEventListener('pointermove', (e) => {
    if (!touchMove.active || e.pointerId !== touchMove.id) return;
    const dx = VW.clamp(e.clientX - touchMove.ox, -55, 55), dy = VW.clamp(e.clientY - touchMove.oy, -55, 55);
    joyKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    touchMove.dx = dx / 55; touchMove.dy = dy / 55;
    e.preventDefault();
  });
  leftZone.addEventListener('pointerup', () => { touchMove.active = false; touchMove.dx = 0; touchMove.dy = 0; joyBase.style.display = 'none'; });
  leftZone.addEventListener('pointercancel', () => { touchMove.active = false; touchMove.dx = 0; touchMove.dy = 0; joyBase.style.display = 'none'; });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- 交互 ----------
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = '1'; toastT = 2.4; }

  function setWeather(w) { weather = w; VW.Life.weather = w; toast('天气：' + ({ clear: '晴', rain: '小雨', fog: '大雾', snow: '雪' }[w])); updateButtons(); }

  function interact() {
    if (VW.Player.inCar) {
      VW.Player.inCar = false;
      player.pos.set(car.pos.x + 2.4, VW.standY(car.pos.x + 2.4, car.pos.z) + 1.62, car.pos.z);
      toast('下车');
      return;
    }
    const dCar = Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z);
    if (dCar < 4.2) { VW.Player.inCar = true; toast('上车 · W/S 油门刹车 A/D 转向'); return; }
    // 门
    for (const H of VW.Life.houses) {
      const d = Math.hypot(player.pos.x - H.door.x, player.pos.z - H.door.z);
      if (d < 3.4) { toast(H.name + ' · ' + H.job + '（可以直接推门进去）'); return; }
    }
    const n = VW.Life.nearby(player.pos.x, player.pos.z, 5);
    if (n) { n.chat = VW.Life.pick(['你好啊，城里来的？', '今天天气不错。', '进屋坐坐吧。', '风车一转，面粉就够吃了。']); n.chatT = 4; toast(n.name + '：' + n.chat); return; }
    toast('附近没有可以互动的东西');
  }

  // ---------- HUD ----------
  const residentList = $('residents');
  let hudT = 0;
  function updateHUD(dt) {
    hudT += dt;
    if (hudT < 0.45) return;
    hudT = 0;
    const h = VW.Life.dayTime;
    const hh = String(Math.floor(h)).padStart(2, '0');
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    $('clock').textContent = hh + ':' + mm;
    $('weathernow').textContent = ({ clear: '晴', rain: '小雨', fog: '大雾', snow: '雪' }[weather]);
    $('fps').textContent = fpsVal;
    $('dayno').textContent = VW.Life.dayNo || 1;
    const near = VW.Life.nearby(player.pos.x, player.pos.z, 6.5);
    $('hint').textContent = VW.Player.inCar
      ? '驾驶中 · W/S 油门刹车 · A/D 转向 · E 下车'
      : (near ? near.name + '（' + near.job + '）：' + (near.chatT > 0 ? near.chat : '正在' + near.label) : 'W A S D 走动 · 拖拽画面转头 · E 互动');
    residentList.innerHTML = VW.Life.snapshot().slice(0, 12).map(r =>
      '<li><b>' + r.name + '</b><span class="job">' + r.job + '</span><em>' + r.label + '</em>' +
      (r.chat ? '<i>' + r.chat + '</i>' : '') + '</li>').join('');
    if (toastT > 0) { toastT -= 0.45; if (toastT <= 0) $('toast').style.opacity = '0'; }
    // 状态导出（给自动化验收用）
    $('appstate').textContent = JSON.stringify(state());
  }

  function state() {
    const inside = VW.Player.standInside;
    return {
      ok: true, hour: +VW.Life.dayTime.toFixed(2), weather, cine: VW.CINE.playing, cineT: +VW.CINE.t.toFixed(1),
      pos: [+player.pos.x.toFixed(1), +player.pos.y.toFixed(1), +player.pos.z.toFixed(1)],
      inCar: VW.Player.inCar, car: [+car.pos.x.toFixed(1), +car.pos.z.toFixed(1), +car.speed.toFixed(1)],
      inside: inside ? inside.name : null,
      houses: VW.Life.houses.length, npcs: VW.Life.npcs.length, trees: world.treeCount,
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles, fps: fpsVal,
      glLost: renderer.getContext().isContextLost(),
      npcStates: VW.Life.npcs.slice(0, 4).map(n => n.name + ':' + n.state)
    };
  }

  function updateButtons() {
    document.querySelectorAll('[data-weather]').forEach(b => b.classList.toggle('on', b.dataset.weather === weather));
    document.querySelectorAll('[data-act]').forEach(b => b.classList.toggle('on', b.dataset.act === 'cine' && VW.CINE.playing));
  }
  document.querySelectorAll('[data-weather]').forEach(b => b.addEventListener('click', () => setWeather(b.dataset.weather)));
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'interact') interact();
    if (a === 'cine') { VW.CINE.playing ? VW.CINE.stop() : VW.CINE.play(); updateButtons(); }
    if (a === 'time') { VW.Life.dayTime = VW.Life.dayTime > 6 && VW.Life.dayTime < 19 ? 20.6 : 8.4; }
    if (a === 'fast') { VW.Life.timeScale = VW.Life.timeScale > 0.2 ? 1 / 18 : 0.35; toast('时间流速切换'); }
  }));

  // ---------- 循环 ----------
  let last = performance.now(), fpsVal = 60, acc = 0, frames = 0;
  const clock = new THREE.Clock();

  function frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frames++; acc += dt;
    if (acc > 0.6) { fpsVal = Math.round(frames / acc); frames = 0; acc = 0; }

    // 键鼠合并成 input
    const kf = keys.KeyW || keys.ArrowUp, kb = keys.KeyS || keys.ArrowDown;
    const kl = keys.KeyA || keys.ArrowLeft, kr = keys.KeyD || keys.ArrowRight;
    input.forward = !!(kf || touchMove.dy < -0.35);
    input.back = !!(kb || touchMove.dy > 0.35);
    input.left = !!(kl || touchMove.dx < -0.35);
    input.right = !!(kr || touchMove.dx > 0.35);
    input.run = !!(keys.ShiftLeft || keys.ShiftRight);
    input.brake = !!keys.Space;
    if (VW.debug && VW.debug.force) Object.assign(input, VW.debug.force);

    const cineOn = VW.CINE.playing;
    // 时间与居民
    VW.Life.update(dt);

    if (cineOn) {
      const beat = VW.CINE.update(dt, camera);
      if (beat) {
        weather = beat.weather; VW.Life.weather = beat.weather;
        VW.Life.dayTime = beat.hour + VW.CINE.t * 0.002;  // 片子里的时间跟着走
      }
      $('cinebar').style.display = 'block';
      $('cinelabel').textContent = VW.CINE.shotLabel(VW.CINE.t);
      $('cinetime').textContent = '0:' + String(Math.floor(VW.CINE.t)).padStart(2, '0') + ' / 1:00';
      $('cinefill').style.width = (VW.CINE.t / VW.CINE.duration * 100) + '%';
      if (!VW.CINE.playing) { $('cinebar').style.display = 'none'; }
    } else {
      $('cinebar').style.display = 'none';
      // 行走 / 开车
      if (VW.Player.inCar) {
        VW.Car.update(car, dt, input);
        const back = 9.5, up = 4.0;
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        const want = new THREE.Vector3(car.pos.x - fx * back, car.pos.y + up, car.pos.z - fz * back);
        camera.position.lerp(want, Math.min(1, dt * 4.5));
        camera.lookAt(car.pos.x + fx * 4, car.pos.y + 1.5, car.pos.z + fz * 4);
        camera.fov += (58 - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      } else if (!VW.Player.frozen) {
        VW.Player.update(dt, input);
        VW.Player.applyCamera(camera);
        if (keys.KeyQ) player.yaw += dt * 1.4;
        if (keys.KeyR) player.yaw -= dt * 1.4;
      }
    }

    // 光照/天气每帧（便宜）
    applyWeather(now);

    // 风车
    for (const w of world.windmills) w.hub.rotation.z += dt * w.speed * 0.9;

    // 河面
    if (world.water && world.water.material.uniforms) world.water.material.uniforms.uTime.value += dt;

    // 云飘
    clouds.position.x += dt * 1.6;
    if (clouds.position.x > 120) clouds.position.x = -120;

    // 天气粒子跟随相机
    const camPos = camera.position;
    function stepPoints(pts, n, speed, drift) {
      const arr = pts.geometry.attributes.position.array;
      for (let i = 0; i < n; i++) {
        arr[i * 3 + 1] -= speed * dt;
        arr[i * 3] += drift * dt;
        if (arr[i * 3 + 1] < -3) {
          arr[i * 3 + 1] = 30 + Math.random() * 6;
          arr[i * 3] = camPos.x + (Math.random() - 0.5) * 60;
          arr[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * 60;
        }
      }
      // 跟随相机（把超出范围的粒子拉回来）
      pts.position.set(0, 0, 0);
      pts.geometry.attributes.position.needsUpdate = true;
    }
    if (rain.visible) stepPoints(rain, RAIN_N, 34, 1.2);
    if (snow.visible) stepPoints(snow, SNOW_N, 3.4, 0.6);

    // 炊烟
    if (smoke.visible) {
      const arr = smokeGeo.attributes.position.array;
      for (let i = 0; i < smokeN; i++) {
        const s = smokeSeed[i];
        s.t += dt * 0.11 * s.speed;
        if (s.t > 1) s.t = 0;
        arr[i * 3] = s.base.x + Math.sin(s.sway + s.t * 5) * s.t * 1.8;
        arr[i * 3 + 1] = s.base.y + s.t * 9;
        arr[i * 3 + 2] = s.base.z + Math.cos(s.sway + s.t * 3) * s.t * 1.4;
      }
      smokeGeo.attributes.position.needsUpdate = true;
    }

    // 玩家灯（屋内/夜间）
    playerLamp.position.set(camera.position.x, camera.position.y + 1.1, camera.position.z);

    // 路面阴影跟随
    sun.target.updateMatrixWorld();

    updateHUD(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (Q.get('hour')) VW.Life.dayTime = parseFloat(Q.get('hour'));
  if (Q.get('ct') != null) {
    const t = parseFloat(Q.get('ct'));
    const s = VW.CINE.sample(t);
    camera.position.set(s.p[0], s.p[1], s.p[2]);
    camera.fov = s.fov; camera.updateProjectionMatrix();
    camera.lookAt(s.l[0], s.l[1], s.l[2]);
    VW.Player.frozen = true;
  }
  applyWeather(0);
  updateButtons();
  $('loading').classList.add('hide');
  requestAnimationFrame(frame);

  // ---------- 调试 / 验收接口 ----------
  VW.debug = {
    state,
    teleport(x, z, yaw) {
      player.pos.x = x; player.pos.z = z;
      if (yaw != null) player.yaw = yaw;
      player.pos.y = VW.standY(x, z) + 1.62;
      VW.Player.inCar = false;
    },
    teleportCar(x, z, heading) { car.pos.set(x, VW.standY(x, z), z); if (heading != null) car.heading = heading; VW.Car.place(car); },
    enterCar() { VW.Player.inCar = true; },
    weather: setWeather,
    setHour(h) { VW.Life.dayTime = h; },
    playCine() { VW.CINE.play(); },
    stopCine() { VW.CINE.stop(); },
    houses: () => VW.Life.houses.map(h => ({ name: h.name, x: h.x, z: h.z, door: [+h.door.x.toFixed(1), +h.door.z.toFixed(1)] })),
    camera: () => ({ p: camera.position.toArray().map(v => +v.toFixed(1)), fov: +camera.fov.toFixed(1) }),
    snapshot() { renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
    // 离屏渲染 + 回读：绕过无头环境 READ 默认帧缓冲被清空的问题
    snapRT(w) {
      w = w || 640;
      const h = Math.round(w / Math.max(0.2, camera.aspect));
      if (!this._rt) this._rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
      renderer.setRenderTarget(this._rt);
      renderer.render(scene, camera);
      const buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(this._rt, 0, 0, w, h, buf);
      renderer.setRenderTarget(null);
      let sum = 0, mx = 0, nz = 0;
      for (let i = 0; i < buf.length; i += 4) {
        const v = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
        sum += v; if (v > mx) mx = v; if (v > 8) nz++;
      }
      this._stats = { mean: +(sum / (w * h)).toFixed(1), max: mx, lit: +(nz / (w * h) * 100).toFixed(1) };
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const ctx = c2.getContext('2d');
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      ctx.putImageData(img, 0, 0);
      return c2.toDataURL('image/png');
    },
    stats() { return this._stats || null; },
    input,
    force: null,
    look(yaw, pitch) { player.yaw = yaw; if (pitch != null) player.pitch = pitch; }
  };
  window.__valley = VW;
})();