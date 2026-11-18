// player.js —— 第一人称控制器（键盘 + 触屏），走格碰撞、台基/楼梯/城墙高度
import { clamp, lerp } from './util.js';

export class Player {
  constructor(world, grid, passages, spawn) {
    this.world = world;
    this.grid = grid;
    this.passages = passages;
    this.pos = { x: spawn[0], y: spawn[1], z: spawn[2] || 0 };
    this.yaw = Math.PI;      // 面向南（进入宫门后先看广场）→ 实际开局朝北，见 main
    this.pitch = -0.03;
    this.vel = { x: 0, y: 0 };
    this.eye = 1.66;
    this.radius = 0.45;
    this.stepMax = 2.35;     // 可跨越的最大台阶（米）
    this.speedWalk = 3.3;
    this.speedRun = 6.0;
    this.bob = 0; this.bobT = 0;
    this.onFootstep = null;
    this.walkDist = 0;
    this.blockedFlag = false;
    this.lookSensitivity = 0.0026;
    this.inInterior = false;
    this._rampCache = passages.filter(p => p.type === 'ramp');
  }

  setSpawn(x, y, z, yaw) {
    this.pos = { x, y, z: z || 0 }; this.yaw = yaw ?? this.yaw; this.vel = { x: 0, y: 0 };
  }

  // ---------- 网格查询 ----------
  _cell(x, y) {
    const g = this.grid;
    const i = Math.floor((x - g.x0) / g.step), j = Math.floor((y - g.y0) / g.step);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return -1;
    return j * g.nx + i;
  }

  _passageAt(x, y) {
    for (const p of this.passages) {
      const [x0, y0, x1, y1] = p.rect;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return p;
    }
    return null;
  }

  floorAt(x, y) {
    const p = this._passageAt(x, y);
    if (p) {
      if (p.type === 'portal') return p.h;
      const [x0, y0, x1, y1] = p.rect;
      let t = p.axis === 'x' ? (x - x0) / Math.max(1e-6, x1 - x0) : (y - y0) / Math.max(1e-6, y1 - y0);
      t = clamp(t, 0, 1);
      return p.h0 + (p.h1 - p.h0) * t;
    }
    const k = this._cell(x, y);
    if (k < 0) return 0;
    return this.grid.height[k] / 100;
  }

  blockedAt(x, y) {
    const p = this._passageAt(x, y);
    if (p) return false;
    const k = this._cell(x, y);
    if (k < 0) return true;
    return this.grid.blocked[k] !== 0;
  }

  canStand(x, y) {
    const r = this.radius;
    if (this.blockedAt(x, y)) return false;
    // 半径采样（8 点，避免卡墙角）
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) {
      if (this.blockedAt(x + dx, y + dy)) return false;
    }
    return true;
  }

  // ---------- 更新 ----------
  update(dt, input) {
    if (dt > 0.1) dt = 0.1;
    // 视角
    this.yaw -= input.lookX * this.lookSensitivity;
    this.pitch = clamp(this.pitch - input.lookY * this.lookSensitivity, -1.35, 1.32);

    // 期望速度（地图坐标）
    const f = input.fwd, s = input.strafe;
    let mx = -Math.sin(this.yaw) * f + Math.cos(this.yaw) * s;
    let my = Math.cos(this.yaw) * f + Math.sin(this.yaw) * s;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const run = input.run ? this.speedRun : this.speedWalk;
    const targetVx = mx * run, targetVy = my * run;
    const accel = len > 0 ? 12 : 16;
    this.vel.x = lerp(this.vel.x, targetVx, Math.min(1, dt * accel));
    this.vel.y = lerp(this.vel.y, targetVy, Math.min(1, dt * accel));

    let nx = this.pos.x + this.vel.x * dt;
    let ny = this.pos.y + this.vel.y * dt;

    const curFloor = this.floorAt(this.pos.x, this.pos.y);
    const tryMove = (tx, ty) => {
      if (!this.canStand(tx, ty)) return false;
      const fh = this.floorAt(tx, ty);
      if (fh - this.pos.z > this.stepMax) return false;       // 上不去
      if (this.pos.z - fh > 6.0) return false;                 // 不会掉下深坑
      return true;
    };

    if (!tryMove(nx, ny)) {
      // 分轴滑动
      if (tryMove(nx, this.pos.y)) { ny = this.pos.y; }
      else if (tryMove(this.pos.x, ny)) { nx = this.pos.x; }
      else { nx = this.pos.x; ny = this.pos.y; this.vel.x *= 0.4; this.vel.y *= 0.4; }
    }
    const moved = Math.hypot(nx - this.pos.x, ny - this.pos.y);
    this.pos.x = nx; this.pos.y = ny;

    // 贴地（有坡度时平滑）
    const fh = this.floorAt(this.pos.x, this.pos.y);
    const dz = fh - this.pos.z;
    if (Math.abs(dz) < 0.02) this.pos.z = fh;
    else this.pos.z += clamp(dz, -9 * dt, 7 * dt);

    // 呼吸/步伐
    const spd = Math.hypot(this.vel.x, this.vel.y);
    this.walkDist += spd * dt;
    if (spd > 0.4) {
      this.bobT += dt * (input.run ? 11 : 8);
      this.bob = Math.sin(this.bobT) * (input.run ? 0.055 : 0.032);
      if (this.walkDist > (input.run ? 2.1 : 1.65)) {
        this.walkDist = 0;
        this.onFootstep && this.onFootstep(input.run);
      }
    } else {
      this.bobT = 0;
      this.bob = lerp(this.bob, Math.sin(performance.now() * 0.0016) * 0.008, dt * 2);
    }
    return moved;
  }

  // 相机跟随
  syncCamera() {
    const cam = this.world.camera;
    cam.position.set(this.pos.x, this.pos.z + this.eye + this.bob, -this.pos.y);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bobT * 0.5) * 0.006, 'YXZ');
  }

  // 用于交互的方向
  getForward() {
    return { x: -Math.sin(this.yaw), y: Math.cos(this.yaw), z: Math.sin(this.pitch) };
  }
}
