// dialogue.js —— 对话引擎（分支、条件、效果、打字机）
import { el } from './util.js';

export class Dialogue {
  constructor(data, state, ui) {
    this.data = data; this.state = state; this.ui = ui;
    this.active = false;
    this.npcId = null;
    this.tree = null;
    this.node = null;
    this.typing = null;
    this.fullText = '';
  }

  hasTree(npcId) { return !!this.data.trees[npcId]; }

  start(npcId) {
    const npc = this.data.npcById[npcId];
    if (!npc) return false;
    this.npcId = npcId;
    this.active = true;
    const tree = this.data.trees[npcId];
    if (tree && tree.nodes[tree.start]) {
      this.tree = tree;
      this.goto(tree.start);
    } else {
      // 无对话树：用短句池
      this.tree = null;
      const lines = npc.lines || {};
      const pool = [...(lines.greet || []), ...(lines.idle || [])];
      const text = pool.length ? pool[Math.floor(Math.random() * pool.length)] : `${npc.name}看了你一眼，没有开口。`;
      this.node = { who: npcId, text, choices: [] };
      this.render();
    }
    this.state.notifyQuest({ kind: 'npc', npc: npcId });
    return true;
  }

  goto(id) {
    const nd = this.tree.nodes[id];
    if (!nd) { this.close(); return; }
    this.node = nd;
    if (nd.effects) this.state.applyAll(nd.effects);
    this.render();
    if (nd.goto) {
      // 自动跳转
      setTimeout(() => { if (this.active && this.node === nd) this.goto(nd.goto); }, 30);
    }
  }

  render() {
    const ui = this.ui;
    const nd = this.node;
    const npc = this.data.npcById[nd.who] || this.data.npcById[this.npcId];
    ui.showDialogue({
      name: npc ? npc.name : '？',
      title: npc ? npc.title : '',
      trust: this.state.trustOf(this.npcId),
      text: nd.text || '',
      onDone: () => this.renderChoices(),
    });
    this.fullText = nd.text || '';
  }

  renderChoices() {
    const nd = this.node;
    const choices = (nd.choices || []).filter(c => this.state.evalAll(c.if));
    const list = choices.map((c, i) => ({
      label: c.text,
      key: String(i + 1),
      act: () => {
        this.state.applyAll(c.effects);
        if (c.accuse) { this.ui.accuse(c.accuse); return; }
        if (c.goto) this.goto(c.goto);
        else this.close();
      },
    }));
    list.push({ label: '（拱手离开）', key: '0', act: () => this.close() });
    this.ui.showChoices(list);
  }

  close() {
    this.active = false;
    this.npcId = null; this.tree = null; this.node = null;
    this.ui.hideDialogue();
    this.ui.emit && this.ui.emit('dialogueEnd');
  }

  pick(i) {
    const btns = document.querySelectorAll('#dlgChoices .choice');
    if (btns[i]) btns[i].click();
  }
}
