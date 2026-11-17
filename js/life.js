/* life.js —— 时间、居民日程、第一人称行走、开车、运镜脚本播放 */
(function () {
  'use strict';
  const VW = window.VW;
  const THREE = window.THREE;

  // ---------- 居民 ----------
  const ROLES = [
    { name: '艾拉', job: '面包师', color: 0xd8a24a, home: 0, work: [34, -30], spot: [37, 6] },
    { name: '皮特', job: '铁匠', color: 0x8a5a3a, home: 1, work: [30, -16], spot: [40, 10] },
    { name: '克拉拉', job: '医生', color: 0x7fa8bf, home: 2, work: [36, 22], spot: [32, 0] },
    { name: '奥托', job: '钟表匠', color: 0xb8a06a, home: 3, work: [34, 33], spot: [38, 12] },
    { name: '老汤姆', job: '木匠', color: 0x9c7b52, home: 4, work: [17, -30], spot: [26, -14] },
    { name: '苏菲', job: '教师', color: 0x88b07a, home: 5, work: [17, 6], spot: [30, 2] },
    { name: '米拉', job: '磨坊主', color: 0xc9b17e, home: 6, work: [74, -16], spot: [34, 6] },
    { name: '玛尔塔', job: '酒馆老板', color: 0xa8654f, home: 7, work: [20, 40], spot: [26, 30] },
    { name: '汉斯', job: '农夫', color: 0x7f8f4a, home: 8, work: [-46, -22], spot: [-26, -14] },
    { name: '妮娜', job: '花匠', color: 0xc07f9c, home: 9, work: [-40, -4], spot: [-26, 4] },
    { name: '尤里', job: '牧羊人', color: 0x6f7f8f, home: 10, work: [-52, 24], spot: [-22, 20] },
    { name: '卢卡斯', job: '渔夫', color: 0x5f8fa0, home: 11, work: [-6, 58], spot: [-12, 50] }
  ];

  const CHATTER = {
    work:   ['今天的活儿不少。', '手别停，天黑前得做完。', '这门手艺，急不得。', '再打两锤就成形了。'],
    eat:    ['面包还是热的好吃。', '给我留一块。', '这汤咸了点。', '坐下一起吃。'],
    shelter:['檐下先躲一会儿。', '雨打在身上真冷。', '这雨要下到什么时候。'],
    home:   ['炉子还温着。', '该收拾一下屋子了。', '窗外的风车转得慢。'],
    sleep:  ['……（睡着了）'],
    tavern: ['再来一杯。', '听说北边的路修好了。', '这镇上就没变过。'],
    talk:   ['你也在这儿？', '最近怎么样。', '有阵子没见了。', '借个火。'],
    visit:  ['在忙什么呢？', '路过，进来坐坐。', '你家烟囱冒烟了。'],
    wander: ['河水又涨了一点。', '今天的云走得快。', '风里有雨的味道。', '该给窗台换花了。']
  };

  // 性格：怕雨 / 合群 / 好奇。没写的人按名字 hash 生成，保证每次进镇一样
  const OVERRIDE = {
    '老汤姆': { rain: 0.15, social: 0.35, curious: 0.2 },
    '皮特':   { rain: 0.2,  social: 0.5,  curious: 0.1 },
    '玛尔塔': { rain: 0.3,  social: 1.0,  curious: 0.3 },
    '妮娜':   { rain: 0.9,  social: 0.75, curious: 0.85 },
    '卢卡斯': { rain: 0.95, social: 0.3,  curious: 0.6 },
    '克拉拉': { rain: 0.7,  social: 0.45, curious: 0.55 }
  };
  function hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }


  VW.Life = {
    dayTime: 8.2,
    timeScale: 1 / 18,           // 1 秒 = 1/18 小时（一天约 7 分钟）
    npcs: [],
    weather: 'clear',

    init(scene, world, car) {
      this.world = world;
      this.car = car;
      this.clock = 0;
      VW.setHouses(world.houses);
      this.houses = world.houses;
      const bodyGeo = new THREE.CylinderGeometry(0.26, 0.34, 1.15, 8);
      const headGeo = new THREE.SphereGeometry(0.21, 10, 8);
      const legGeo = new THREE.BoxGeometry(0.15, 0.6, 0.17);
      const armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.15);
      const hatGeo = new THREE.ConeGeometry(0.3, 0.22, 10);

      ROLES.forEach((r, i) => {
        const g = new THREE.Group();
        const skin = new THREE.MeshStandardMaterial({ color: 0xe3bd9a, roughness: 0.9 });
        const cloth = new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.95 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x33302c, roughness: 1 });
        const torso = new THREE.Mesh(bodyGeo, cloth); torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
        const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.92; head.castShadow = true; g.add(head);
        const hat = new THREE.Mesh(hatGeo, dark); hat.position.y = 2.13; g.add(hat);
        const legs = [], arms = [];
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(legGeo, dark); leg.position.set(s * 0.16, 0.32, 0); g.add(leg); legs.push(leg);
          const arm = new THREE.Mesh(armGeo, cloth); arm.position.set(s * 0.36, 1.2, 0); g.add(arm); arms.push(arm);
        }
        // 名牌
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 64;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = 'rgba(14,22,30,0.0)'; ctx.fillRect(0, 0, 256, 64);
        ctx.font = 'bold 34px "Noto Sans SC", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(r.name + ' · ' + r.job, 130, 34);
        ctx.fillStyle = '#fdf6e6'; ctx.fillText(r.name + ' · ' + r.job, 128, 32);
        const tex = new THREE.CanvasTexture(cv);
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        tag.scale.set(3.2, 0.8, 1); tag.position.y = 2.75; g.add(tag);

        const H = this.houses[r.home];
        const start = H ? new THREE.Vector3(H.x, H.baseY, H.z) : new THREE.Vector3(0, 2, 0);
        g.position.copy(start);
        if (!(VW.SKIP && VW.SKIP.has('npcs'))) scene.add(g);

        this.npcs.push({
          ...r, group: g, legs, arms, tag,
          pos: start.clone(), heading: 0, speed: 1.15 + (i % 4) * 0.08,
          route: [], state: 'home', animT: Math.random() * 6, chat: '', chatT: 0,
          traits: (() => { const o = OVERRIDE[r.name] || {}; return {
            rain: o.rain != null ? o.rain : 0.15 + hash01(r.name + 'r') * 0.75,
            social: o.social != null ? o.social : 0.25 + hash01(r.name + 's') * 0.6,
            curious: o.curious != null ? o.curious : 0.2 + hash01(r.name + 'c') * 0.7
          }; })(),
          needs: { hungry: 0.15 + hash01(r.name + 'h') * 0.35, tired: 0.1 + hash01(r.name + 't') * 0.25,
                   lonely: 0.2 + hash01(r.name + 'l') * 0.4, dry: 1 },
          thinkNo: 0, thinkAt: 0, thinkEvery: 2.0 + hash01(r.name + 'k') * 1.8,
          action: null, chatCool: 0,
          eatHome: { x: r.spot[0] < 0 ? -24 : 36, z: 4 },
          shift: { s: 7.9 + hash01(r.name + 's1') * 1.3, e: 16.6 + hash01(r.name + 'e1') * 1.8 },
          meal: 11.6 + hash01(r.name + 'm1') * 1.7,
          mealEve: 18.1 + hash01(r.name + 'm2') * 1.0,
          friendIdx: (i + 3 + (i % 2)) % ROLES.length,
          pOff: { x: (hash01(r.name + 'px') - 0.5) * 12, z: (hash01(r.name + 'pz') - 0.5) * 10 },
          homePos: H ? new THREE.Vector3(H.x, H.baseY, H.z) : start.clone(),
          inside: !!H
        });
      });

      // 每人先想一次，再错开"思考节拍"
      this.npcs.forEach(n => {
        this.think(n, this.dayTime);
        n.thinkAt = this.clock + hash01(n.name) * 2.2;
      });
      return this;
    },

    // ---------- 行为 AI：需求 + 性格 + 当下打分（纯本地，无联网） ----------
    // 每人四个需求（饿 / 累 / 想说话 / 干爽）+ 三个性格（怕雨 / 合群 / 好奇）。
    // 每 2~4 秒重算"现在该干什么"，选分数最高的执行。天气、时辰、身边站着谁都会改分数。

    think(n, hour) {
      if (n.detour) { n.detour = false; return; }   // 刚从墙里蹭出来，这一轮别再顶回去
      const wet = (this.weather === 'rain' || this.weather === 'snow');
      const T = n.traits, N = n.needs;
      const night = (hour >= 21.6 || hour < 6.2);
      const cands = [];
      const push = (kind, score, label, target, house) => {
        if (score > 0.08) cands.push({ kind, score, label, target, house: house || null });
      };

      // 1) 本分活儿：时段驱动，累了打折，怕雨的人下雨干不下去
      const tavernKeeper = n.job === '酒馆老板';
      const sh = n.shift;
      let s = 0;
      if (hour >= sh.s - 0.4 && hour < sh.s) s = 0.85;
      else if (hour >= sh.s && hour < sh.e) s = 1.16 - Math.abs(hour - (sh.s + sh.e) / 2) * 0.03;
      if (tavernKeeper && hour >= 18.6 && hour < 23.4) s = Math.max(s, 1.3);
      s *= 0.85 + (1 - N.tired) * 0.3;
      if (wet && T.rain > 0.55 && !tavernKeeper) s *= 0.5;
      const wkHouse = this.houseNear(n.work[0], n.work[1], 7.5);
      const workT = wkHouse ? new THREE.Vector3(wkHouse.door.x, 0, wkHouse.door.z) : this.pt(n.work);
      push('work', s, n.job + '中', workT, null);

      // 2) 吃饭：晴在广场吃，下雨就躲进酒馆吃（这条是打分器自己选出来的，不是写死的）
      const meal = 0.62 * Math.exp(-Math.pow(hour - n.meal, 2) / 0.55)
                 + 0.3 * Math.exp(-Math.pow(hour - n.mealEve, 2) / 0.8);
      const eatS = (Math.max(0, N.hungry - 0.28) * 2.8 + meal)
        * (wet ? 0.72 : 1) * ((hour > 22 || hour < 6.4) ? 0.25 : 1);
      if (wet) push('eat', eatS, '在酒馆吃饭', new THREE.Vector3(20, 0, 42), this.houses[7] || null);
      else push('eat', eatS, '在广场吃饭', this.plazaSpot(n), null);

      // 3) 躲雨：越怕雨、身上越湿越急
      if (wet) push('shelter', 0.45 + T.rain * 1.05 + (1 - N.dry) * 0.95, '躲雨', this.nearestEave(n), null);

      // 4) 回家：夜里必回，白天累了回去歇
      const homeH = this.houses[n.home] || null;
      let homeS = night ? 1.2 + N.tired * 0.95 : N.tired * 1.05;
      if (hour > 18.8 && hour < 22.6) homeS = Math.max(homeS, (1 - T.social) * 0.85 + N.tired * 0.35 + 0.08);
      push('home', homeS, night ? '回家睡觉' : '回家歇会儿',
        new THREE.Vector3(n.homePos.x, 0, n.homePos.z), homeH);

      // 5) 天黑后想热闹的人去酒馆
      if (!tavernKeeper && hour > Math.max(18.2, sh.e - 0.6) && hour < 22.8)
        push('tavern', 0.25 + T.social * 0.75 + N.lonely * 0.6 - this.crowdAt('tavern') * 0.07,
          '去酒馆', this.tavernDoor(), this.houses[7] || null);

      // 5b) 串门：合群的人下班后去朋友家坐坐
      const fr = this.friendOf(n);
      if (fr && hour > Math.max(17.8, sh.e - 0.4) && hour < 21.8 && T.social > 0.5)
        push('visit', 0.4 + T.social * 0.55 + N.lonely * 0.6, '去' + fr.name + '家串门',
          new THREE.Vector3(this.houses[fr.home].door.x, 0, this.houses[fr.home].door.z), null);

      // 6) 碰上谁就聊两句
      const f = this.nearestNpc(n, 7.5);
      const talkOk = !(n.talkUntil && this.clock < n.talkUntil);
      if (f && talkOk) push('talk', N.lonely * 1.15 + T.social * 0.55, '和' + f.name + '说话',
        new THREE.Vector3(f.pos.x, 0, f.pos.z), null);

      // 7) 闲逛：没别的事就这么干
      push('wander', 0.3 + T.curious * 0.42 + N.lonely * 0.22, '闲逛', this.wanderSpot(n), null);

      // 加个体噪声（别让 12 个人同时干一件事）+ 惯性（正在做的事加一点分，看起来连贯）
      let best = null;
      for (const c of cands) {
        c.score *= 0.86 + hash01(n.name + n.thinkNo) * 0.3;
        if (n.action && n.action.kind === c.kind) c.score += 0.22;
        if (!best || c.score > best.score) best = c;
      }
      n.thinkNo++;
      const prevKind = n.action && n.action.kind;
      n.action = best;
      n.state = best.kind === 'home' ? (night ? 'sleep' : 'home') : best.kind;
      n.label = best.label;
      n.wantIndoor = !!best.house;
      const moved = !n.route.length || this.distTo(n, best.target) > 6;
      if (prevKind !== best.kind || moved) this.setTarget(n, best.target, best.house);
      if (best.kind === 'talk' && prevKind !== 'talk') n.talkUntil = this.clock + 0.05 + Math.random() * 0.05;
      if (prevKind !== best.kind && Math.random() < 0.7) this.say(n, best.kind);
    },

    distTo(n, t) { return Math.hypot(t.x - n.pos.x, t.z - n.pos.z); },

    crowdAt(state) { let k = 0; for (const o of this.npcs) if (o.state === state) k++; return k; },

    friendOf(n) {
      const o = this.npcs[n.friendIdx];
      return (o && o !== n) ? o : (this.npcs.find(x => x !== n) || null);
    },

    // 某个坐标是不是落在谁家墙里（是就返回那栋房子）
    houseNear(x, z, r) {
      for (const H of this.houses) {
        if (!H.door) continue;
        if (Math.abs(x - H.x) < H.w / 2 + 0.6 && Math.abs(z - H.z) < H.d / 2 + 0.6) return H;
      }
      return null;
    },

    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

    pt(a) { return new THREE.Vector3(a[0], 0, a[1]); },

    nearestNpc(n, r) {
      let best = null, bd = r;
      for (const o of this.npcs) {
        if (o === n) continue;
        const d = Math.hypot(o.pos.x - n.pos.x, o.pos.z - n.pos.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    },

    nearestEave(n) {
      let best = null, bd = 1e9;
      for (const H of this.houses) {
        if (!H.door) continue;
        const d = Math.hypot(H.door.x - n.pos.x, H.door.z - n.pos.z);
        if (d < bd) { bd = d; best = H; }
      }
      return best ? new THREE.Vector3(best.door.x, 0, best.door.z) : this.plazaSpot(n);
    },

    tavernDoor() {
      const H = this.houses[7];
      return H && H.door ? new THREE.Vector3(H.door.x, 0, H.door.z) : new THREE.Vector3(20, 0, 45);
    },

    plazaSpot(n) {
      const b = n.eatHome || { x: 36, z: 4 };
      return new THREE.Vector3(b.x + n.pOff.x * 0.7, 0, b.z + n.pOff.z * 0.7);
    },

    // 随机找个能站的地方：不下河、不上山脊、不出镇
    wanderSpot(n) {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 5 + Math.random() * 16;
        const x = VW.clamp(n.spot[0] + Math.cos(a) * r, -62, 92);
        const z = VW.clamp(n.spot[1] + Math.sin(a) * r, -58, 74);
        if (Math.abs(x - VW.RIVER(z)) < 9) continue;
        if (VW.groundH(x, z) < VW.WATER + 1.3) continue;
        return new THREE.Vector3(x, 0, z);
      }
      return new THREE.Vector3(n.spot[0], 0, n.spot[1]);
    },

    // 说话：按状态挑一句，偶尔串天气/时辰/对方名字
    say(n, kind, other) {
      const wet = (this.weather === 'rain' || this.weather === 'snow');
      const h = this.dayTime;
      const pool = [];
      if (wet) pool.push('这雨说下就下。', '檐下先站会儿吧。', '我得晾干才回得去。');
      if (h > 18 && h < 23) pool.push('天黑得早了。', '晚上去玛尔塔那儿坐坐？');
      if (h > 6 && h < 10) pool.push('早上好。', '河水今天凉。');
      const byKind = CHATTER[kind] || CHATTER.wander;
      const line = (Math.random() < 0.45 && pool.length) ? this.pick(pool) : this.pick(byKind);
      n.chat = other ? (other.name + '，' + line) : line;
      n.chatT = 5;
    },

    // 路线：先过桥（如果对岸），再穿自家门洞，最后到目的地
    setTarget(n, t, house) {
      const route = [];
      const sameBank = Math.sign(n.pos.x - VW.RIVER(n.pos.z)) === Math.sign(t.x - VW.RIVER(t.z));
      if (!sameBank) {
        const side = Math.sign(n.pos.x - VW.RIVER(n.pos.z)) || 1;
        route.push(new THREE.Vector3(side * 17, 0, VW.BRIDGE.zc));
        route.push(new THREE.Vector3(-side * 17, 0, VW.BRIDGE.zc));
      }
      if (house && house.door) route.push(new THREE.Vector3(house.door.x, 0, house.door.z));
      route.push(new THREE.Vector3(t.x, 0, t.z));
      n.route = route;
    },

    update(dt) {
      const dtH = dt * this.timeScale;              // 这一帧过了多少"游戏小时"
      this.clock += dtH;
      this.dayTime = (this.dayTime + dtH) % 24;
      if (this._lastH != null && this.dayTime < this._lastH - 12) this.dayNo = (this.dayNo || 1) + 1;
      this._lastH = this.dayTime;
      const h = this.dayTime;
      const wet = (this.weather === 'rain' || this.weather === 'snow');
      const pl = (VW.Player && VW.Player.pos) || null;
      const car = this.car;

      for (const n of this.npcs) {
        // 需求随时间漂移
        const N = n.needs;
        N.hungry = VW.clamp(N.hungry + dtH * 0.09, 0, 1);
        const working = n.state === 'work';
        N.tired = VW.clamp(N.tired + dtH * (working ? 0.14 : 0.05) - (n.state === 'sleep' ? dtH * 0.55 : 0), 0, 1);
        const social = (n.state === 'talk' || n.state === 'tavern');
        N.lonely = VW.clamp(N.lonely + dtH * (social ? -0.6 : 0.1), 0, 1);
        const sheltered = n.wantIndoor || n.state === 'shelter';
        N.dry = VW.clamp(N.dry + dtH * (wet && !sheltered ? -1.0 : 0.4), 0, 1);

        // 重新想一次
        if (this.clock >= n.thinkAt) {
          n.thinkAt = this.clock + n.thinkEvery;
          this.think(n, h);
        }

        const target = n.route[0];
        if (target) {
          const dx = target.x - n.pos.x, dz = target.z - n.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.1) { n.route.shift(); }
          else {
            const sp = n.speed * (n.state === 'wander' ? 1.1 : 1);
            const step = Math.min(dist, sp * dt);
            let nx = n.pos.x + (dx / dist) * step;
            let nz = n.pos.z + (dz / dist) * step;
            // 让开人
            if (pl) {
              const pdx = nx - pl.x, pdz = nz - pl.z, pd = Math.hypot(pdx, pdz);
              if (pd < 1.25 && pd > 0.01) { nx = pl.x + (pdx / pd) * 1.25; nz = pl.z + (pdz / pd) * 1.25; }
            }
            // 让开车
            if (car && car.speed > 0.8) {
              const cdx = nx - car.pos.x, cdz = nz - car.pos.z, cd = Math.hypot(cdx, cdz);
              if (cd < 3.2 && cd > 0.01) { nx = car.pos.x + (cdx / cd) * 3.2; nz = car.pos.z + (cdz / cd) * 3.2; }
            }
            const lastT = n.route[n.route.length - 1];
            const dLast = Math.hypot(lastT.x - nx, lastT.z - nz);
            const ox = n.pos.x, oz = n.pos.z;
            if (dLast > 7) {
              const c = VW.collide(nx, nz);
              if (Math.hypot(c.x - ox, c.z - oz) < step * 0.4) {
                // 撞墙了：贴着墙横着走，左右都试，走不动就换边
                const px = -dz / dist, pz = dx / dist;
                n.slideT = (n.slideT || 0) + dt;
                if (n.slideT > 0.9) { n.slideDir = -(n.slideDir || 1); n.slideT = 0; }
                let ok = false;
                for (const sd of [n.slideDir || 1, -(n.slideDir || 1)]) {
                  const c2 = VW.collide(ox + px * step * 1.5 * sd, oz + pz * step * 1.5 * sd);
                  if (Math.hypot(c2.x - ox, c2.z - oz) > step * 0.5) {
                    n.pos.x = c2.x; n.pos.z = c2.z; n.slideDir = sd; ok = true; break;
                  }
                }
                if (!ok) { n.pos.x = c.x; n.pos.z = c.z; }
              } else { n.pos.x = c.x; n.pos.z = c.z; n.slideT = 0; }
            }
            else { n.pos.x = nx; n.pos.z = nz; }
            // 真的走不动就别硬顶，扔掉路线重新想
            const moved = Math.hypot(n.pos.x - ox, n.pos.z - oz);
            if (moved < 0.02) { n.stuckT = (n.stuckT || 0) + dt; } else { n.stuckT = 0; }
            if (n.stuckT > 3.0) {
              const a = Math.random() * Math.PI * 2;
              n.route = [new THREE.Vector3(ox + Math.cos(a) * 7, 0, oz + Math.sin(a) * 7)];
              n.stuckT = 0; n.detour = true;
            }
            n.heading = Math.atan2(dx, dz);
            n.animT += dt * 7;
            const y = VW.standY(n.pos.x, n.pos.z);
            n.pos.y += (y - n.pos.y) * Math.min(1, dt * 8);
            n.group.position.copy(n.pos);
            n.group.rotation.y = n.heading;
            const sw = Math.sin(n.animT) * 0.5;
            n.legs[0].rotation.x = sw; n.legs[1].rotation.x = -sw;
            n.arms[0].rotation.x = -sw * 0.7; n.arms[1].rotation.x = sw * 0.7;
            n.group.position.y += Math.abs(Math.sin(n.animT)) * 0.045;
          }
        } else {
          this.idle(n, dt);
        }

        // 到了地方才真正"吃掉"饥饿 / 睡着才恢复体力
        if (!n.route.length) {
          if (n.state === 'eat') N.hungry = VW.clamp(N.hungry - dtH * 1.8, 0, 1);
          if (n.state === 'sleep') N.tired = VW.clamp(N.tired - dtH * 0.6, 0, 1);
        }

        // 玩家凑近：转头看你，站住就打个招呼
        if (pl) {
          const dp = Math.hypot(pl.x - n.pos.x, pl.z - n.pos.z);
          if (dp < 4.2 && n.state !== 'sleep') {
            const want = Math.atan2(pl.x - n.pos.x, pl.z - n.pos.z);
            let d = want - n.heading;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            n.heading += d * Math.min(1, dt * 3);
            n.group.rotation.y = n.heading;
          }
          n.chatCool = (n.chatCool || 0) - dt;
          if (dp < 2.6 && n.chatT <= 0 && n.chatCool <= 0 && n.state !== 'sleep') {
            n.chat = this.pick(['你好。', '城里来的？', '进来坐坐。', '今天风向不错。', '别踩那片花。']);
            n.chatT = 4; n.chatCool = 16;
          }
        }
      }
      for (const n of this.npcs) if (n.chatT > 0) n.chatT -= dt;
      return this;
    },

    // 站着的时候按状态摆手臂：干活在锤、吃饭在送嘴、躲雨抱着肩、睡觉不动
    idle(n, dt) {
      n.animT += dt * (n.state === 'work' ? 3.2 : 1.6);
      const y = VW.standY(n.pos.x, n.pos.z);
      n.pos.y += (y - n.pos.y) * Math.min(1, dt * 8);
      n.group.position.set(n.pos.x, n.pos.y, n.pos.z);
      n.legs[0].rotation.x = 0; n.legs[1].rotation.x = 0;
      const t = n.animT, k = n.state;
      let a0 = 0, a1 = 0;
      if (k === 'work') { a0 = -0.85 + Math.sin(t * 1.1) * 0.45; a1 = -0.7 + Math.sin(t * 1.1 + 2.1) * 0.4; }
      else if (k === 'eat') { a0 = -1.3 + Math.sin(t * 2.6) * 0.18; a1 = -0.45; }
      else if (k === 'talk') { a0 = -0.35 + Math.sin(t * 1.6) * 0.28; a1 = -0.28 + Math.sin(t * 1.6 + 1.4) * 0.24; }
      else if (k === 'shelter') { a0 = a1 = -1.15 + Math.sin(t * 9) * 0.03; }
      else if (k === 'sleep' || k === 'home') { a0 = a1 = 0.05; }
      else if (k === 'tavern') { a0 = -0.6 + Math.sin(t * 1.3) * 0.3; a1 = -0.5; }
      n.arms[0].rotation.x += (a0 - n.arms[0].rotation.x) * Math.min(1, dt * 6);
      n.arms[1].rotation.x += (a1 - n.arms[1].rotation.x) * Math.min(1, dt * 6);
    },

    // 玩家附近的居民报一句
    nearby(x, z, r) {
      let best = null, bd = r;
      for (const n of this.npcs) {
        const d = Math.hypot(n.pos.x - x, n.pos.z - z);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    },

    snapshot() {
      return this.npcs.map(n => ({ name: n.name, job: n.job, label: n.label, state: n.state, chat: n.chatT > 0 ? n.chat : '' }));
    }
  };

  // ---------- 汽车 ----------
  VW.Car = {
    create(scene) {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb43b32, roughness: 0.45, metalness: 0.25 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb2c4, roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.55 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 3.9), bodyMat);
      body.position.y = 0.72; body.castShadow = true; g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.62, 1.9), bodyMat);
      cabin.position.set(0, 1.26, -0.15); cabin.castShadow = true; g.add(cabin);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 1.7), glassMat);
      glass.position.set(0, 1.34, -0.15); g.add(glass);
      const wheels = [];
      const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
      wg.rotateZ(Math.PI / 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(wg, darkMat);
        w.position.set(sx * 0.95, 0.38, sz * 1.35); w.castShadow = true; g.add(w); wheels.push(w);
      }
      const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xfff0b0, emissiveIntensity: 0.5 });
      for (const sx of [-0.6, 0.6]) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lightMat);
        hl.position.set(sx, 0.82, 1.96); g.add(hl);
      }
      if (!(VW.SKIP && VW.SKIP.has('car'))) scene.add(g);
      const car = {
        group: g, wheels, lightMat, pos: new THREE.Vector3(26, 0, -6), heading: Math.PI, speed: 0, steer: 0, bob: 0,
        seat: new THREE.Vector3()
      };
      this.place(car);
      return car;
    },
    place(car) {
      const y = VW.standY(car.pos.x, car.pos.z);
      car.pos.y = y;
      car.group.position.set(car.pos.x, y, car.pos.z);
      car.group.rotation.y = car.heading;
    },
    update(car, dt, input) {
      const accel = 9.5, brake = 14, maxSpeed = 19;
      if (input.forward) car.speed += accel * dt;
      else if (input.back) car.speed -= brake * dt;
      else car.speed *= Math.pow(0.55, dt);
      if (input.brake) car.speed *= Math.pow(0.02, dt);
      car.speed = VW.clamp(car.speed, -6, maxSpeed);
      const steerRate = 1.9 * Math.min(1, Math.abs(car.speed) / 4 + 0.25);
      car.steer += ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * steerRate * dt;
      car.steer *= Math.pow(0.08, dt);
      car.heading += car.steer * dt * Math.min(1, Math.abs(car.speed) / 6) * Math.sign(car.speed || 1);

      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let nx = car.pos.x + fx * car.speed * dt;
      let nz = car.pos.z + fz * car.speed * dt;
      if (VW.onBridge(nx, nz) === false && VW.onBridge(car.pos.x, car.pos.z)) {
        // 桥上不要冲出栏杆
        const dz = nz - VW.BRIDGE.zc;
        if (Math.abs(dz) > VW.BRIDGE.halfZ - 0.8) nz = VW.BRIDGE.zc + Math.sign(dz) * (VW.BRIDGE.halfZ - 0.8);
      }
      const c = VW.collide(nx, nz);
      if (c.hit) car.speed *= 0.35;
      car.pos.x = c.x; car.pos.z = c.z;
      car.pos.x = VW.clamp(car.pos.x, -142, 142);
      car.pos.z = VW.clamp(car.pos.z, -142, 142);

      // 贴地 + 坡度姿态
      const yF = VW.standY(car.pos.x + fx * 1.5, car.pos.z + fz * 1.5);
      const yB = VW.standY(car.pos.x - fx * 1.5, car.pos.z - fz * 1.5);
      const y = (yF + yB) / 2;
      car.pos.y += (y - car.pos.y) * Math.min(1, dt * 9);
      const pitch = Math.atan2(yB - yF, 3.0);
      car.group.position.set(car.pos.x, car.pos.y, car.pos.z);
      car.group.rotation.set(pitch, car.heading, 0, 'YXZ');
      car.bob += dt * Math.abs(car.speed) * 0.4;
      car.group.position.y += Math.sin(car.bob) * 0.015 * Math.min(1, Math.abs(car.speed) / 6);
      car.wheels.forEach(w => (w.rotation.x -= car.speed * dt * 2.4));
      car.lightMat.emissiveIntensity = 0.4 + (VW.Life.dayTime > 18 || VW.Life.weather !== 'clear' ? 2.2 : 0);
      return car;
    }
  };

  // ---------- 玩家 ----------
  VW.Player = {
    init(scene, camera) {
      this.scene = scene; this.camera = camera;
      this.pos = new THREE.Vector3(28, 0, -18);
      this.yaw = 2.4; this.pitch = -0.04;
      this.vel = new THREE.Vector3();
      this.inCar = false;
      this.bob = 0;
      this.standInside = null;
      this.pos.y = VW.standY(this.pos.x, this.pos.z) + 1.62;
      return this;
    },
    eye() { return this.pos.y; },
    update(dt, input) {
      if (this.inCar) return;
      const speed = (input.run ? 6.2 : 3.1);
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = new THREE.Vector3();
      if (input.forward) move.add(fwd);
      if (input.back) move.sub(fwd);
      if (input.right) move.add(right);
      if (input.left) move.sub(right);
      if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
      this.vel.lerp(move, Math.min(1, dt * 10));
      let nx = this.pos.x + this.vel.x * dt;
      let nz = this.pos.z + this.vel.z * dt;
      const c = VW.collide(nx, nz);
      this.pos.x = VW.clamp(c.x, -140, 140);
      this.pos.z = VW.clamp(c.z, -140, 140);

      // 站在哪
      let gy = VW.standY(this.pos.x, this.pos.z);
      this.standInside = null;
      for (const H of VW.Life.houses) {
        if (Math.abs(this.pos.x - H.x) < 10 && Math.abs(this.pos.z - H.z) < 10 && H.inside(this.pos)) {
          gy = Math.max(gy, H.floorY); this.standInside = H; break;
        }
      }
      const targetY = gy + 1.62;
      this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 11);
      const moving = this.vel.length() > 0.4;
      this.bob += dt * (moving ? 9 : 0);
      this.vel.multiplyScalar(Math.pow(0.02, dt * 0.0));   // 保持（lerp 已处理）
      return moving;
    },
    applyCamera(cam) {
      if (this.inCar) return;
      const bobY = Math.sin(this.bob) * 0.035;
      cam.position.set(this.pos.x, this.pos.y + bobY, this.pos.z);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
  };

  // ---------- 运镜脚本（软件内预览，不渲染视频） ----------
  VW.CINE = {
    duration: 60,
    playing: false,
    t: 0,
    keys: [
      { t: 0.0, p: [10, 96, -168], l: [12, 14, -8], fov: 58 },
      { t: 7.0, p: [8, 34, -96], l: [12, 6, -12], fov: 55 },
      { t: 11.0, p: [3, 4.6, -58], l: [-2, 3.2, 6], fov: 52 },
      { t: 15.0, p: [2, 3.6, -30], l: [1, 3.0, 18], fov: 52 },
      { t: 18.5, p: [17, 5.0, 8.4], l: [-4, 3.6, 2], fov: 48 },
      { t: 22.0, p: [6, 4.6, 2.4], l: [-18, 3.2, 2], fov: 48 },
      { t: 26.0, p: [47, 8.5, 16], l: [36, 3.2, 4], fov: 50 },
      { t: 30.0, p: [37, 6.2, -9], l: [36, 2.8, 6], fov: 50 },
      { t: 33.5, p: [24.5, 4.2, -12], l: [33, 3.0, -12], fov: 46 },
      { t: 37.0, p: [30.5, 3.4, -12], l: [35, 2.7, -12], fov: 44 },
      { t: 40.5, p: [23, 3.4, -22], l: [31, 10, -14], fov: 55 },
      { t: 44.0, p: [30, 5.0, -34], l: [34, 6.2, -22], fov: 50 },
      { t: 47.5, p: [40, 26, -44], l: [64, 15, -16], fov: 32 },
      { t: 51.0, p: [30, 12, -12], l: [10, 4, 6], fov: 45 },
      { t: 55.0, p: [14, 5.2, 34], l: [22, 3.2, 8], fov: 48 },
      { t: 58.0, p: [8, 26, -52], l: [14, 6, 0], fov: 52 },
      { t: 60.0, p: [10, 62, -118], l: [13, 7, -2], fov: 58 }
    ],
    // 剧本化的天气/时间节拍
    beats: [
      { t: 0, weather: 'clear', hour: 8.4 },
      { t: 44, weather: 'clear', hour: 16.5 },
      { t: 51, weather: 'rain', hour: 17.6 },
      { t: 55, weather: 'fog', hour: 18.6 },
      { t: 58, weather: 'clear', hour: 20.2 }
    ],
    play() { this.playing = true; this.t = 0; },
    stop() { this.playing = false; },
    sample(t) {
      const k = this.keys;
      let i = 0;
      while (i < k.length - 2 && t > k[i + 1].t) i++;
      const a = k[i], b = k[i + 1] || k[i];
      const span = Math.max(0.0001, b.t - a.t);
      const u = VW.smoothstep(0, 1, VW.clamp((t - a.t) / span, 0, 1));
      const lerp3 = (p, q) => [VW.lerp(p[0], q[0], u), VW.lerp(p[1], q[1], u), VW.lerp(p[2], q[2], u)];
      return { p: lerp3(a.p, b.p), l: lerp3(a.l, b.l), fov: VW.lerp(a.fov, b.fov, u) };
    },
    beat(t) {
      let cur = this.beats[0];
      for (const b of this.beats) if (t >= b.t) cur = b;
      return cur;
    },
    shotLabel(t) {
      const labels = [
        [0, '01 谷口 · 大全景'], [7, '02 贴水面 · 顺河而下'], [15, '03 石桥 · 擦桥而过'],
        [22, '04 广场 · 半环绕'], [30, '05 推门 · 进屋'], [37, '06 街景 · 屋檐与烟囱'],
        [44, '07 山脊 · 风车剪影'], [51, '08 天色 · 转雨起雾'], [55, '09 河畔 · 灯火亮起'],
        [58, '10 收尾 · 谷口回望']
      ];
      let cur = labels[0][1];
      for (const [tt, s] of labels) if (t >= tt) cur = s;
      return cur;
    },
    update(dt, camera) {
      this.t += dt;
      if (this.t > this.duration) { this.playing = false; return null; }
      const s = this.sample(this.t);
      camera.position.set(s.p[0], s.p[1], s.p[2]);
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(s.l[0], s.l[1], s.l[2]);
      return this.beat(this.t);
    }
  };
})();