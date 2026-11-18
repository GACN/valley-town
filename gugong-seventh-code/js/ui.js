// ui.js —— HUD、面板（证据/任务/人物/地图/线索板/日志/菜单）、对话、结局
import { el, cnNum, fmtTime, clamp } from './util.js';

const PANELS = ['case', 'quests', 'people', 'map', 'board', 'puzzle', 'log', 'menu'];

export class UI {
  constructor(game) {
    this.game = game;
    this.data = game.data;
    this.state = game.state;
    this.listeners = {};
    this.openPanelName = null;
    this.selectedClues = [];
    this._build();
    this.state.on('clue', c => { this.toast(`获得证据：${c.name}`, 'clue'); this.audio('pickup'); });
    this.state.on('chapter', ch => { if (ch) this.showChapterIntro(ch); });
    this.state.on('step', ({ step }) => { this.toast(`· ${step.text}`, 'step'); this.refreshTracker(); });
    this.state.on('questDone', q => { this.toast(`任务完成：${q.title}`, 'quest'); this.refreshTracker(); });
    this.state.on('trust', ({ npcId, delta }) => {
      if (Math.abs(delta) >= 3) this.toast(`${this.data.npcById[npcId]?.name || npcId} 的信任 ${delta > 0 ? '+' : ''}${delta}`, 'trust');
    });
    this.state.on('log', () => { if (this.openPanelName === 'log') this.renderLog(); });
  }

  audio(kind) { this.game.audio && this.game.audio[kind] && this.game.audio[kind](); }
  on(e, fn) { (this.listeners[e] ||= []).push(fn); }
  emit(e, p) { (this.listeners[e] || []).forEach(f => f(p)); }

  _build() {
    const app = document.getElementById('app');
    // HUD
    this.hud = el('div', 'hud');
    app.appendChild(this.hud);

    this.topbar = el('div', 'topbar');
    this.topbar.innerHTML = `<div class="tb-left"><span id="hudChapter">第一章</span><span class="sep">·</span><span id="hudChapterName">雨夜宫门</span></div>
      <div class="tb-right"><span id="hudClock">08:00</span><span class="sep">·</span><span id="hudWeather">晴</span></div>`;
    this.hud.appendChild(this.topbar);

    this.tracker = el('div', 'tracker'); this.hud.appendChild(this.tracker);
    this.toastBox = el('div', 'toasts'); this.hud.appendChild(this.toastBox);
    this.subtitle = el('div', 'subtitle'); this.hud.appendChild(this.subtitle);
    this.prompt = el('div', 'prompt'); this.prompt.style.display = 'none'; this.hud.appendChild(this.prompt);
    this.crosshair = el('div', 'crosshair'); this.hud.appendChild(this.crosshair);

    // 触屏控件
    this.joy = el('div', 'joystick'); this.joy.innerHTML = `<div class="joy-knob"></div>`;
    this.hud.appendChild(this.joy);
    this.lookZone = el('div', 'lookzone'); this.hud.appendChild(this.lookZone);

    this.btns = el('div', 'actionbtns');
    const mkBtn = (id, label, cls = '') => {
      const b = el('button', 'abtn ' + cls, label); b.id = id; this.btns.appendChild(b); return b;
    };
    this.btnUse = mkBtn('btnUse', '调查');
    this.btnTalk = mkBtn('btnTalk', '交谈');
    this.btnRun = mkBtn('btnRun', '疾行', 'small');
    this.btnPanel = mkBtn('btnPanel', '卷宗', 'small');
    this.btnMenu = mkBtn('btnMenu', '菜单', 'small');
    this.btnUse.style.display = 'none';
    this.btnTalk.style.display = 'none';
    this.hud.appendChild(this.btns);

    const nav = el('div', 'navbar');
    [['case', '证据'], ['quests', '任务'], ['people', '人物'], ['board', '推理'], ['puzzle', '推演'], ['map', '地图'], ['log', '日志']].forEach(([k, t]) => {
      const b = el('button', 'nb', t); b.onclick = () => this.togglePanel(k); nav.appendChild(b);
    });
    this.hud.appendChild(nav);
    this.navbar = nav;

    // 面板容器
    this.overlay = el('div', 'overlay'); this.overlay.style.display = 'none';
    this.panelTitle = el('div', 'ptitle');
    this.panelBody = el('div', 'pbody');
    this.panelClose = el('button', 'pclose', '✕');
    this.panelClose.onclick = () => this.closePanel();
    this.overlay.appendChild(this.panelTitle);
    this.overlay.appendChild(this.panelClose);
    this.overlay.appendChild(this.panelBody);
    app.appendChild(this.overlay);

    // 对话
    this.dlg = el('div', 'dialogue'); this.dlg.style.display = 'none';
    this.dlg.innerHTML = `<div class="dname"><b></b><i></i></div><div class="dtext"></div><div class="dchoices" id="dlgChoices"></div>`;
    app.appendChild(this.dlg);

    // 章节卡
    this.chapterCard = el('div', 'chaptercard'); this.chapterCard.style.display = 'none';
    app.appendChild(this.chapterCard);

    // 结局
    this.endingEl = el('div', 'ending'); this.endingEl.style.display = 'none';
    app.appendChild(this.endingEl);

    // 载入
    this.loadingEl = document.getElementById('loading');

    // 底部提示（键盘）
    this.hint = el('div', 'keyhint',
      'W/A/S/D 移动 · Shift 疾行 · 鼠标拖动看 · E 调查/交谈 · 1-4 选择 · J 任务 · E 键面板冲突用按钮');
    this.hud.appendChild(this.hint);
  }

  setClock(hour, weather) {
    const w = { clear: '晴', rain: '雨', snow: '雪', fog: '雾' }[weather] || '晴';
    const c = document.getElementById('hudClock'); if (c) c.textContent = fmtTime(hour);
    const ww = document.getElementById('hudWeather'); if (ww) ww.textContent = w;
  }

  setChapter(n, name) {
    const c = document.getElementById('hudChapter'); if (c) c.textContent = '第' + cnNum(n) + '章';
    const c2 = document.getElementById('hudChapterName'); if (c2) c2.textContent = name || '';
  }

  toast(text, kind = 'info') {
    const t = el('div', 'toast ' + kind, text);
    this.toastBox.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 600); }, 3200);
    while (this.toastBox.children.length > 5) this.toastBox.firstChild.remove();
  }

  sub(text, ms = 4200) {
    this.subtitle.textContent = text;
    this.subtitle.classList.add('show');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => this.subtitle.classList.remove('show'), ms);
  }

  showPrompt(text, kind = 'use') {
    this.prompt.textContent = text;
    this.prompt.style.display = 'block';
    if (kind === 'talk') { this.btnTalk.textContent = '交谈'; this.btnTalk.style.display = 'block'; this.btnUse.style.display = 'none'; }
    else { this.btnUse.textContent = text.replace(/^\[[^\]]+\]\s*/, '') || '调查'; this.btnUse.style.display = 'block'; this.btnTalk.style.display = 'none'; }
  }
  hidePrompt() {
    this.prompt.style.display = 'none';
    this.btnUse.style.display = 'none';
    this.btnTalk.style.display = 'none';
  }

  showDialogue({ name, title, trust, text, onDone }) {
    this.dlg.style.display = 'block';
    this.dlg.querySelector('.dname b').textContent = name;
    this.dlg.querySelector('.dname i').textContent = `${title || ''}　信任 ${Math.round(trust)}`;
    const tx = this.dlg.querySelector('.dtext');
    const ch = document.getElementById('dlgChoices');
    ch.innerHTML = '';
    tx.textContent = '';
    let i = 0;
    const full = text || '';
    clearInterval(this._typer);
    this._typer = setInterval(() => {
      i += 2;
      tx.textContent = full.slice(0, i);
      if (i >= full.length) { clearInterval(this._typer); onDone && onDone(); }
    }, 16);
    tx.onclick = () => { clearInterval(this._typer); tx.textContent = full; onDone && onDone(); };
  }

  showChoices(list) {
    const ch = document.getElementById('dlgChoices');
    ch.innerHTML = '';
    list.forEach((c, i) => {
      const b = el('button', 'choice');
      b.innerHTML = `<span class="ck">${c.key}</span><span>${c.label}</span>`;
      b.onclick = () => { this.audio('click'); c.act(); };
      ch.appendChild(b);
    });
    if (this.game.isMobile) {
      // 手机上滚到可见
      ch.scrollTop = 0;
    }
  }

  hideDialogue() { this.dlg.style.display = 'none'; }

  showChapterIntro(ch) {
    this.chapterCard.innerHTML = `<div class="cc-num">第${cnNum(ch.n)}章</div>
      <div class="cc-title">${ch.title}</div>
      <div class="cc-sub">${ch.subtitle || ''}</div>
      <div class="cc-intro">${(ch.intro || '').replace(/\n/g, '<br>')}</div>
      <div class="cc-hint">点击继续</div>`;
    this.chapterCard.style.display = 'flex';
    this.chapterCard.onclick = () => { this.chapterCard.style.display = 'none'; this.audio('click'); };
    this.setChapter(ch.n, ch.title);
    this.audio('bell');
  }

  // ---------- 任务追踪 ----------
  refreshTracker() {
    const st = this.state;
    const main = st.data.quests.filter(q => q.type === 'main' && q.chapter === st.chapter && !st.questState(q.id).done);
    const side = st.data.quests.filter(q => q.type === 'side' && q.chapter <= st.chapter && !st.questState(q.id).done).slice(0, 3);
    const rows = [];
    const mk = (q, tag) => {
      const { done, total } = st.questProgress(q.id);
      const steps = (q.steps || []).filter(s => st.isStepVisible(s) && !st.questState(q.id).steps[s.id]).slice(0, 2);
      rows.push(`<div class="tq"><div class="tqh"><span class="tag ${tag}">${tag === 'main' ? '主线' : '支线'}</span>
        <b>${q.title}</b><span class="prog">${done}/${total}</span></div>
        ${steps.map(s => `<div class="tqs">· ${s.text}</div>`).join('')}</div>`);
    };
    main.slice(0, 2).forEach(q => mk(q, 'main'));
    side.forEach(q => mk(q, 'side'));
    this.tracker.innerHTML = rows.join('') || '<div class="tq empty">暂无任务</div>';
  }

  // ---------- 面板 ----------
  togglePanel(name) {
    if (this.openPanelName === name) this.closePanel();
    else this.openPanel(name);
  }

  openPanel(name) {
    this.openPanelName = name;
    this.overlay.style.display = 'flex';
    this.audio('click');
    const T = { case: '证据卷宗', quests: '任务', people: '人物', map: '宫城地图', board: '线索关联板', puzzle: '现场重建', log: '调查日志', menu: '菜单' };
    this.panelTitle.textContent = T[name] || name;
    this.panelBody.innerHTML = '';
    this['render_' + name] && this['render_' + name]();
  }

  closePanel() {
    this.openPanelName = null;
    this.overlay.style.display = 'none';
  }

  render_case() {
    const st = this.state;
    const byCh = {};
    st.clues.forEach(id => {
      const c = this.data.clueById[id]; if (!c) return;
      (byCh[c.chapter] ||= []).push(c);
    });
    const body = this.panelBody;
    body.innerHTML = `<div class="pmeta">已收证据 ${st.clues.length} 条 · 推理 ${st.deductions.size} 条 · 第七码 ${st.codes.size}/7</div>`;
    const codes = el('div', 'codeline');
    for (let i = 1; i <= 7; i++) {
      const d = el('span', 'codechip' + (st.codes.has(i) ? ' on' : ''), '第' + cnNum(i) + '码');
      codes.appendChild(d);
    }
    body.appendChild(codes);
    Object.keys(byCh).sort((a, b) => a - b).forEach(ch => {
      const h = el('div', 'ph', `第${cnNum(+ch)}章 · ${byCh[ch].length} 条`);
      body.appendChild(h);
      const grid = el('div', 'cluegrid');
      byCh[ch].forEach(c => {
        const card = el('div', 'ccard ' + (c.kind === 'code' ? 'code' : ''));
        card.innerHTML = `<div class="cn">${c.name}</div><div class="ck">${{ physical: '物证', document: '文书', testimony: '证词', scene: '痕迹', code: '第七码' }[c.kind] || ''}</div>
          <div class="cd">${c.desc || ''}</div>`;
        card.onclick = () => this.showClueDetail(c);
        grid.appendChild(card);
      });
      body.appendChild(grid);
    });
    if (!st.clues.length) body.innerHTML += '<div class="empty">尚无证据。靠近发光处调查。</div>';
  }

  showClueDetail(c) {
    const box = el('div', 'detail');
    const a = this.data.anchors[c.anchor];
    box.innerHTML = `<h4>${c.name}</h4><div class="dtag">${a ? a.name : ''} · 第${cnNum(c.chapter)}章</div>
      <p>${c.detail || c.desc || ''}</p>
      ${(c.implies || []).length ? `<div class="dimply">可推及：${(c.implies || []).map(i => this.data.clueById[i]?.name || i).join('、')}</div>` : ''}
      <div class="dclose">收起</div>`;
    box.querySelector('.dclose').onclick = () => box.remove();
    this.panelBody.prepend(box);
  }

  render_quests() {
    const st = this.state;
    const body = this.panelBody;
    const cat = (title, list, tag) => {
      const h = el('div', 'ph', title); body.appendChild(h);
      if (!list.length) { body.appendChild(el('div', 'empty', '无')); return; }
      list.forEach(q => {
        const { done, total } = st.questProgress(q.id);
        const qs = st.questState(q.id);
        const card = el('div', 'qcard' + (qs.done ? ' done' : ''));
        card.innerHTML = `<div class="qh"><span class="tag ${tag}">${tag === 'main' ? '主线' : '支线'}</span>
          <b>${q.title}</b><span class="prog">${done}/${total}</span></div>
          <div class="qsum">${q.summary || ''}</div>
          <div class="qsteps">${(q.steps || []).filter(s => st.isStepVisible(s)).map(s => `
            <div class="qs${qs.steps[s.id] ? ' ok' : ''}">${qs.steps[s.id] ? '✓' : '○'} ${s.text}
            ${s.hint && !qs.steps[s.id] ? `<span class="hint">${s.hint}</span>` : ''}</div>`).join('')}</div>`;
        body.appendChild(card);
      });
    };
    cat(`第${cnNum(st.chapter)}章主线`, this.data.quests.filter(q => q.type === 'main' && q.chapter === st.chapter), 'main');
    cat('此前未完成主线', this.data.quests.filter(q => q.type === 'main' && q.chapter < st.chapter && !st.questState(q.id).done), 'main');
    cat('支线', this.data.quests.filter(q => q.type === 'side' && q.chapter <= st.chapter), 'side');
    cat('未解锁（更后章节）', this.data.quests.filter(q => q.chapter > st.chapter).slice(0, 6), 'lock');
  }

  render_people() {
    const st = this.state, body = this.panelBody;
    const met = new Set([...st.flags].filter(f => f.startsWith('met_')).map(f => f.slice(4)));
    const cards = this.data.npcs.map(n => {
      const t = st.trustOf(n.id);
      const known = (n.knows || []).filter((_, i) => t >= 30 + i * 15);
      const hid = t >= 75 ? (n.hides || []) : [];
      return `<div class="pcard">
        <div class="ph-top"><b>${n.name}</b><span>${n.title || ''}</span></div>
        <div class="trustbar"><i style="width:${clamp(t, 0, 100)}%"></i><em>信任 ${Math.round(t)}</em></div>
        <div class="pfact">${known.map(k => `· ${k}`).join('<br>') || '· 还不了解他'}</div>
        ${hid.length ? `<div class="psec">信任后得知：${hid.map(h => '· ' + h).join('<br>')}</div>` : ''}
        <div class="ploc">${n.schedule ? '行踪：' + n.schedule.map(s => `${s.from}-${s.to}时 ${this.data.anchors[s.anchor]?.name || ''}`).join('｜') : ''}</div>
      </div>`;
    });
    body.innerHTML = `<div class="pmeta">宫中人物 ${this.data.npcs.length} 人</div>` + cards.join('');
  }

  render_map() {
    const st = this.state, body = this.panelBody;
    const meta = this.game.data.grid;
    const size = Math.min(window.innerWidth - 60, window.innerHeight - 220);
    body.innerHTML = `<div class="mapwrap" style="width:${size}px;height:${size * (meta.ny / meta.nx)}px">
      <img src="data/minimap.png" style="width:100%;height:100%">
      <div class="pmark" id="pmark"></div>
    </div><div class="maplegend">灰=可走 · 橙=建筑 · 蓝=水　｜　当前：<span id="mapwhere"></span></div>`;
    this.updateMapMarker();
  }

  updateMapMarker() {
    const mark = document.getElementById('pmark');
    if (!mark) return;
    const g = this.game.data.grid, p = this.game.player.pos;
    const x = (p.x - g.x0) / g.step / g.nx * 100;
    const y = (1 - (p.y - g.y0) / g.step / g.ny) * 100;
    mark.style.left = x + '%'; mark.style.top = y + '%';
    const where = document.getElementById('mapwhere');
    if (where) where.textContent = this.game.currentPlaceName || `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`;
  }

  render_board() {
    const st = this.state, body = this.panelBody;
    this.selectedClues = this.selectedClues.filter(id => st.clueSet.has(id));
    body.innerHTML = `<div class="pmeta">选两条证据建立关联。关联成立会写入推理，用于第十三章的完整证据链。</div>
      <div class="boardwrap"><div class="blist" id="blist"></div>
      <div class="bpanel"><div class="bsel" id="bsel">未选</div><button class="bbtn" id="blink">建立关联</button>
      <div class="bresult" id="bresult"></div>
      <div class="bdone">已成立推理 ${st.deductions.size} 条</div></div></div>`;
    const list = document.getElementById('blist');
    const names = { physical: '物证', document: '文书', testimony: '证词', scene: '痕迹', code: '码' };
    st.clues.forEach(id => {
      const c = this.data.clueById[id]; if (!c) return;
      const chip = el('div', 'bchip' + (this.selectedClues.includes(id) ? ' sel' : ''));
      chip.innerHTML = `<span class="bk">${names[c.kind] || ''}</span>${c.name}`;
      chip.onclick = () => {
        const i = this.selectedClues.indexOf(id);
        if (i >= 0) this.selectedClues.splice(i, 1);
        else { this.selectedClues.push(id); if (this.selectedClues.length > 2) this.selectedClues.shift(); }
        this.render_board();
      };
      list.appendChild(chip);
    });
    const sel = document.getElementById('bsel');
    sel.innerHTML = this.selectedClues.map(id => this.data.clueById[id]?.name).join('　＋　') || '未选';
    document.getElementById('blink').onclick = () => {
      const res = document.getElementById('bresult');
      if (this.selectedClues.length < 2) { res.textContent = '要选两条证据。'; return; }
      const ok = st.addDeduction(this.selectedClues[0], this.selectedClues[1]);
      if (ok) {
        res.innerHTML = `<b class="ok">关联成立。</b><br>${this.data.clueById[this.selectedClues[0]].name} ↔ ${this.data.clueById[this.selectedClues[1]].name} 已写入推理链。`;
        this.audio('pickup');
        this.selectedClues = [];
        this.render_board();
      } else {
        res.innerHTML = `<b class="bad">关联不成立。</b><br>这两条证据之间没有可指认的矛盾。换一条试试。`;
        this.audio('click', 220);
      }
    };
  }

  render_puzzle() {
    const st = this.state, body = this.panelBody;
    const puzzles = this.data.puzzles || [];
    if (!puzzles.length) { body.innerHTML = '<div class="empty">暂无需要重建的现场。</div>'; return; }
    const pz = puzzles[0];
    const prog = st.puzzles[pz.id] || (st.puzzles[pz.id] = { placement: {}, solved: false });
    if (!this._selEvent) this._selEvent = null;
    const placed = new Set(Object.keys(prog.placement).filter(k => prog.placement[k]));
    const slotMap = {};
    for (const [eid, sid] of Object.entries(prog.placement)) if (sid) (slotMap[sid] ||= []).push(eid);

    body.innerHTML = `<div class="pmeta">${pz.subtitle || ''}</div>
      <div class="tlwrap">
        <div class="tlslots">${pz.slots.map(sl => `
          <div class="tlrow" data-slot="${sl.id}">
            <div class="tlclock">${sl.label}<em>${sl.clock}</em></div>
            <div class="tlevents">${(slotMap[sl.id] || []).map(eid => {
              const ev = pz.events.find(e => e.id === eid);
              return `<span class="tlchip" data-ev="${eid}">${ev ? ev.label : eid}</span>`;
            }).join('') || '<span class="tlempty">—</span>'}</div>
          </div>`).join('')}
        </div>
        <div class="tlpoolwrap">
          <div class="tlpooltitle">待归位的事件（点一条，再点上面的时段）</div>
          <div class="tlpool">${pz.events.filter(e => !placed.has(e.id)).map(e => `
            <div class="tlchip pool" data-ev="${e.id}">${e.label}</div>`).join('') || '<div class="tlempty">全部已归位</div>'}
          </div>
          <button class="bbtn" id="tlCheck">推演这一夜</button>
          <div class="bresult" id="tlResult">${prog.solved ? '已推演成立：' + (pz.solveText || '') : ''}</div>
        </div>
      </div>`;

    const save = () => { st.puzzles[pz.id] = prog; st.dirty = true; };
    body.querySelectorAll('.tlchip').forEach(chip => {
      chip.onclick = (e) => {
        const eid = chip.dataset.ev;
        if (chip.classList.contains('pool')) {
          this._selEvent = this._selEvent === eid ? null : eid;
          body.querySelectorAll('.tlchip').forEach(c => c.classList.toggle('sel', c.dataset.ev === this._selEvent && c.classList.contains('pool')));
          return;
        }
        // 从时段里取下
        for (const k of Object.keys(prog.placement)) if (prog.placement[k] === chip.parentElement.parentElement.dataset.slot && k === eid) delete prog.placement[k];
        save(); this.render_puzzle();
      };
    });
    body.querySelectorAll('.tlrow').forEach(row => {
      row.onclick = (e) => {
        if (!this._selEvent) { this.toast('先点下面待归位的一条事件'); return; }
        // 一条事件只能在一个时段
        prog.placement[this._selEvent] = row.dataset.slot;
        this._selEvent = null;
        save(); this.render_puzzle();
      };
    });
    const btn = body.querySelector('#tlCheck');
    if (btn) btn.onclick = () => {
      const wrong = pz.events.filter(e => prog.placement[e.id] && prog.placement[e.id] !== e.slot);
      const unplaced = pz.events.filter(e => !prog.placement[e.id]);
      const res = body.querySelector('#tlResult');
      if (unplaced.length) { res.innerHTML = `<b class="bad">还有 ${unplaced.length} 件没归位。</b>`; return; }
      if (wrong.length) {
        res.innerHTML = `<b class="bad">${wrong.length} 处对不上。</b><br>${pz.failText || ''}`;
        this.audio('click', 220);
        return;
      }
      prog.solved = true; save();
      this.state.applyAll(pz.onSolve || []);
      this.state.notifyQuest({ kind: 'puzzle', puzzle: pz.id });
      res.innerHTML = `<b class="ok">推演成立。</b><br>${pz.solveText || ''}`;
      this.audio('pickup');
      this.toast('现场重建：时间线成立', 'quest');
      this.render_puzzle();
    };
  }

  render_log() {
    const st = this.state;
    this.panelBody.innerHTML = `<div class="pmeta">最近 ${Math.min(st.log.length, 80)} 条</div>` +
      st.log.slice(0, 80).map(l => `<div class="logline"><span>${fmtTime(l.t)}</span>${l.text}</div>`).join('');
  }

  render_menu() {
    const g = this.game, st = this.state, body = this.panelBody;
    body.innerHTML = `
      <div class="mrow"><label>画质</label><div class="mbtns" id="qbtns">
        ${['high', 'medium', 'low'].map(q => `<button data-q="${q}" class="${g.world.qualityName === q ? 'on' : ''}">${{ high: '高', medium: '中', low: '低' }[q]}</button>`).join('')}
      </div></div>
      <div class="mrow"><label>天气</label><div class="mbtns" id="wbtns">
        ${[['clear', '晴'], ['rain', '雨'], ['snow', '雪'], ['fog', '雾']].map(([k, t]) => `<button data-w="${k}" class="${st.weather === k ? 'on' : ''}">${t}</button>`).join('')}
      </div></div>
      <div class="mrow"><label>时刻</label><div class="mbtns" id="tbtns">
        ${[['清晨', 6.5], ['正午', 12], ['黄昏', 17.5], ['夜', 21]].map(([t, h]) => `<button data-h="${h}">${t}</button>`).join('')}
      </div></div>
      <div class="mrow"><label>存档</label><div class="mbtns">
        <button id="save1">存档到 1 号</button><button id="load1">读取 1 号</button>
        <button id="loadAuto">读取自动存档</button></div></div>
      <div class="mrow"><label>进度</label><div class="minfo">
        第${cnNum(st.chapter)}章 · 证据 ${st.clues.length} · 推理 ${st.deductions.size} · 七码 ${st.codes.size}/7
        · 游玩 ${Math.floor(st.playtime / 60)} 分钟</div></div>
      <div class="mrow"><label>帮助</label><div class="minfo">
        W/A/S/D 或摇杆移动；拖右半屏转视角；E 调查/交谈；Shift 疾行；J 任务 K 人物 B 推理 M 地图 V 证据；
        数字键 1-4 选对话项；Esc 关闭面板。</div></div>
      <div class="mrow"><label>重新开始</label><div class="mbtns"><button id="restart" class="danger">清空进度重开</button></div></div>`;
    body.querySelectorAll('#qbtns button').forEach(b => b.onclick = () => { g.setQuality(b.dataset.q); this.render_menu(); });
    body.querySelectorAll('#wbtns button').forEach(b => b.onclick = () => { g.setWeather(b.dataset.w); this.render_menu(); });
    body.querySelectorAll('#tbtns button').forEach(b => b.onclick = () => { g.setHour(+b.dataset.h); this.render_menu(); });
    body.querySelector('#save1').onclick = () => { st.save('slot1'); this.toast('已存档'); };
    body.querySelector('#load1').onclick = () => { g.loadGame('slot1'); };
    body.querySelector('#loadAuto').onclick = () => { g.loadGame('auto'); };
    body.querySelector('#restart').onclick = () => { if (confirm('清空当前进度重新开始？')) { localStorage.clear(); location.reload(); } };
  }

  showEnding(ending, stats) {
    const e = this.data.endings[ending] || { title: '结局', text: '迷雾未散。' };
    this.endingEl.innerHTML = `<div class="endbox">
      <div class="endkicker">${e.kicker || '结局'}</div>
      <h2>${e.title || ''}</h2>
      <div class="endtext">${(e.text || '').replace(/\n/g, '<br>')}</div>
      <div class="endstats">${stats}</div>
      <div class="endbtns"><button id="endContinue">继续留在宫中</button><button id="endNew">重新开始</button></div>
    </div>`;
    this.endingEl.style.display = 'flex';
    document.getElementById('endContinue').onclick = () => { this.endingEl.style.display = 'none'; };
    document.getElementById('endNew').onclick = () => { localStorage.clear(); location.reload(); };
  }

  accuse(target) {
    this.game.resolveAccusation(target);
  }

  hideLoading() { if (this.loadingEl) this.loadingEl.style.display = 'none'; }

  setLoadingText(t) {
    if (!this.loadingEl) return;
    const n = this.loadingEl.querySelector('.ltext');
    if (n) n.textContent = t;
  }
}
