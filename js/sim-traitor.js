// Логика режима «Найди предателя» (работает у хоста).
import { shuffle, clamp, rnd } from './util.js';
import { MAPS, pushOut, roomAt } from './maps.js';

const R = 0.45;
export const T_ANIM = { idle: 0, walk: 1, melee: 3, die: 5, interact: 6, yes: 7, no: 8 };
export const VISION = { crew: 6.5, dark: 3.0, traitor: 9 };
const MEETING_TIME = 80, EJECT_TIME = 7, INTRO_TIME = 6, KILL_CD = 25, SAB_CD = 50, LIGHTS_TIME = 22;

export class TraitorSim {
  constructor(io, { roster, opts }) {
    this.io = io; this.map = MAPS.castle;
    this.opts = { traitors: 1, confirm: true, tasks: 5, ...opts };
    this.ps = new Map();
    const ids = shuffle(roster.map(r => r.pid));
    const nT = clamp(this.opts.traitors, 1, Math.max(1, Math.floor((roster.length - 1) / 2)));
    const traitors = new Set(ids.slice(0, nT));
    const stations = this.map.stations.map(s => s.id);
    roster.forEach((r, i) => {
      const sp = this.map.spawns[i % this.map.spawns.length];
      this.ps.set(r.pid, { id: r.pid, name: r.name, x: sp.x, z: sp.z, rot: 0, vx: 0, vz: 0, anim: 0, animN: 0, animT: 0,
        alive: true, role: traitors.has(r.pid) ? 'traitor' : 'crew', tasks: shuffle(stations).slice(0, this.opts.tasks), done: new Set(),
        killCd: 15, sabCd: 20, emerg: 1, kills: 0, inp: { mx: 0, mz: 0 }, seq: {}, left: false });
    });
    this.bodies = [];
    this.phase = 'intro'; this.phaseT = INTRO_TIME;
    this.lightsT = 0; this.meetCd = 10;
    this.chat = [];
    this.fx = [];
    for (const p of this.ps.values()) this.sendRole(p);
    this.sendT = 0; this.last = performance.now();
    this.iv = setInterval(() => this.tick(), 33);
  }
  stop() { clearInterval(this.iv); }
  sendRole(p) {
    const mates = [...this.ps.values()].filter(o => o.role === 'traitor' && o.id !== p.id).map(o => o.id);
    this.io.sendTo(p.id, { t: 'role', role: p.role, tasks: p.tasks, done: [...p.done], mates: p.role === 'traitor' ? mates : [], alive: p.alive });
  }
  onJoin(pid) { const p = this.ps.get(pid); if (p) { p.left = false; this.sendRole(p); if (this.phase === 'meeting') this.io.sendTo(pid, this.meetMsg()); } }
  onLeave(pid) {
    const p = this.ps.get(pid); if (!p) return;
    p.left = true;
    if (p.alive) { p.alive = false; this.ev('msg', `${p.name} вышел из игры`); }
    this.checkWin();
  }
  ev(...a) { this.fx.push(a); }
  crewTasks() {
    let total = 0, done = 0;
    for (const p of this.ps.values()) if (p.role === 'crew') { total += p.tasks.length; done += p.done.size; }
    return { total, done };
  }
  near(p, x, z, d) { return Math.hypot(p.x - x, p.z - z) <= d; }

  onMsg(pid, m) {
    const p = this.ps.get(pid); if (!p) return;
    switch (m.t) {
      case 'i': {
        p.inp.mx = clamp(+m.mx || 0, -1, 1); p.inp.mz = clamp(+m.mz || 0, -1, 1);
        const once = (k, fn) => { if (m[k] != null && m[k] !== p.seq[k]) { const first = p.seq[k] === undefined; p.seq[k] = m[k]; if (!first || m[k] > 0) fn(); } };
        if (this.phase !== 'play') { for (const k of ['kill', 'rep', 'em', 'sab', 'emo']) if (m[k] != null) p.seq[k] = m[k]; break; }
        once('kill', () => this.tryKill(p));
        once('rep', () => this.tryReport(p));
        once('em', () => this.tryEmergency(p));
        once('sab', () => this.trySabotage(p));
        once('emo', () => { if (p.animT <= 0) { p.anim = m.emo % 2 ? T_ANIM.yes : T_ANIM.no; p.animN = (p.animN + 1) & 7; p.animT = 1.5; } });
        break;
      }
      case 'task': {
        if (this.phase !== 'play') return;
        const st = this.map.stations.find(s => s.id === m.id);
        if (!st || !p.tasks.includes(st.id) || p.done.has(st.id) || !this.near(p, st.x, st.z, 3)) return;
        p.done.add(st.id);
        this.io.sendTo(p.id, { t: 'taskok', id: st.id, done: [...p.done] });
        this.checkWin();
        break;
      }
      case 'busy': p.busy = !!m.v; if (p.busy) { p.anim = T_ANIM.interact; p.animN = (p.animN + 1) & 7; p.animT = 0.6; } break;
      case 'chat': {
        if (this.phase !== 'meeting' && this.phase !== 'eject') return;
        const text = String(m.text || '').slice(0, 120).trim(); if (!text) return;
        const msg = { t: 'chat', pid, text, ghost: !p.alive };
        if (p.alive) this.io.broadcast(msg);
        else for (const o of this.ps.values()) if (!o.alive) this.io.sendTo(o.id, msg);
        break;
      }
      case 'vote': {
        if (this.phase !== 'meeting' || !p.alive || this.votes.has(pid)) return;
        const t = m.target === 'skip' ? 'skip' : (this.ps.get(m.target) && this.ps.get(m.target).alive ? m.target : null);
        if (!t) return;
        this.votes.set(pid, t);
        this.io.broadcast({ t: 'voted', pid });
        const aliveN = [...this.ps.values()].filter(o => o.alive).length;
        if (this.votes.size >= aliveN) this.phaseT = Math.min(this.phaseT, 2);
        break;
      }
    }
  }
  tryKill(p) {
    if (p.role !== 'traitor' || !p.alive || p.killCd > 0) return;
    let best = null, bd = 1.9;
    for (const o of this.ps.values()) if (o.alive && o.role !== 'traitor') { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = o; } }
    if (!best) return;
    best.alive = false; best.busy = false;
    this.bodies.push({ pid: best.id, x: best.x, z: best.z, rot: best.rot });
    p.killCd = KILL_CD; p.kills++;
    p.anim = T_ANIM.melee; p.animN = (p.animN + 1) & 7; p.animT = 0.4;
    p.rot = Math.atan2(best.x - p.x, best.z - p.z);
    this.ev('kd', +best.x.toFixed(2), +best.z.toFixed(2), best.id);
    this.io.sendTo(best.id, { t: 'youdied', by: p.id });
    this.checkWin();
  }
  tryReport(p) {
    if (!p.alive) return;
    const b = this.bodies.find(b => this.near(p, b.x, b.z, 2.8));
    if (b) this.startMeeting('body', p.id, b.pid);
  }
  tryEmergency(p) {
    if (!p.alive || p.emerg <= 0 || this.meetCd > 0) return;
    if (!this.near(p, this.map.meetingTable.x, this.map.meetingTable.z, 3.4)) return;
    p.emerg--;
    this.startMeeting('emergency', p.id, null);
  }
  trySabotage(p) {
    if (p.role !== 'traitor' || !p.alive || p.sabCd > 0) return;
    for (const o of this.ps.values()) if (o.role === 'traitor') o.sabCd = SAB_CD;
    this.lightsT = LIGHTS_TIME;
    this.ev('msg', '💡 Кто-то выключил свет в замке!');
  }
  startMeeting(reason, by, body) {
    this.phase = 'meeting'; this.phaseT = MEETING_TIME;
    this.votes = new Map();
    this.meeting = { reason, by, body };
    this.bodies = [];
    this.lightsT = 0;
    let i = 0;
    for (const p of this.ps.values()) {
      p.busy = false; p.vx = p.vz = 0; p.inp.mx = p.inp.mz = 0;
      const sp = this.map.spawns[i++ % this.map.spawns.length];
      p.x = sp.x; p.z = sp.z; p.rot = Math.atan2(this.map.meetingTable.x - p.x, this.map.meetingTable.z - p.z);
    }
    this.io.broadcast(this.meetMsg());
    this.sendState();
  }
  meetMsg() {
    return { t: 'meet', reason: this.meeting.reason, by: this.meeting.by, body: this.meeting.body, left: this.phaseT,
      alive: [...this.ps.values()].map(p => [p.id, p.alive ? 1 : 0]), voted: [...this.votes.keys()] };
  }
  endMeeting() {
    const tally = new Map();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) || 0) + 1);
    let best = null, bc = 0, tie = false;
    for (const [t, c] of tally) { if (c > bc) { best = t; bc = c; tie = false; } else if (c === bc) tie = true; }
    let ejected = null;
    if (best && best !== 'skip' && !tie) ejected = best;
    let wasTraitor = null;
    if (ejected) { const p = this.ps.get(ejected); p.alive = false; wasTraitor = p.role === 'traitor'; }
    const left = [...this.ps.values()].filter(p => p.alive && p.role === 'traitor').length;
    this.io.broadcast({ t: 'voteres', votes: [...this.votes], ejected, wasTraitor: this.opts.confirm ? wasTraitor : null, tie, traitorsLeft: this.opts.confirm ? left : null });
    this.phase = 'eject'; this.phaseT = EJECT_TIME;
  }
  checkWin() {
    if (this.phase === 'over') return;
    const all = [...this.ps.values()];
    const tAlive = all.filter(p => p.alive && p.role === 'traitor').length;
    const cAlive = all.filter(p => p.alive && p.role === 'crew').length;
    const { total, done } = this.crewTasks();
    let win = null, text = '';
    if (tAlive === 0) { win = 'crew'; text = 'Предатель пойман! Команда победила! 🎉'; }
    else if (tAlive >= cAlive) { win = 'traitor'; text = 'Предатель победил! 😈'; }
    else if (total > 0 && done >= total) { win = 'crew'; text = 'Все задания выполнены! Команда победила! 🎉'; }
    if (!win) return;
    // если ещё идёт показ голосования — закончим после него
    if (this.phase === 'eject' && this.phaseT > 0.1) { this.pendingWin = { win, text }; return; }
    this.finish(win, text);
  }
  finish(win, text) {
    this.phase = 'over';
    this.sendState();
    const rows = [...this.ps.values()].map(p => {
      const w = p.role === win;
      const coins = p.role === 'crew' ? 10 + p.done.size * 3 + (w ? 20 : 0) : 10 + p.kills * 4 + (w ? 30 : 0);
      return { pid: p.id, name: p.name, role: p.role, win: w, tasks: p.done.size, kills: p.kills, alive: p.alive, coins, pts: coins };
    }).sort((a, b) => (b.win - a.win) || (b.coins - a.coins));
    setTimeout(() => this.io.end({ mode: 'traitor', winText: text, win, rows }), 1500);
  }
  tick() {
    const now = performance.now(), dt = Math.min(0.06, (now - this.last) / 1000); this.last = now;
    if (this.phase === 'over') return;
    this.phaseT -= dt;
    if (this.phase === 'intro' && this.phaseT <= 0) { this.phase = 'play'; this.sendState(); }
    else if (this.phase === 'meeting' && this.phaseT <= 0) this.endMeeting();
    else if (this.phase === 'eject' && this.phaseT <= 0) {
      this.phase = 'play'; this.meetCd = 15;
      for (const p of this.ps.values()) p.killCd = Math.max(p.killCd, 15);
      this.sendState();
      if (this.pendingWin) { const w = this.pendingWin; this.pendingWin = null; this.finish(w.win, w.text); return; }
      this.checkWin();
    }
    if (this.phase === 'play') {
      this.lightsT -= dt; this.meetCd -= dt;
      for (const p of this.ps.values()) {
        p.killCd -= dt; p.sabCd -= dt; if (p.animT > 0) p.animT -= dt;
        const ghost = !p.alive;
        let mx = p.inp.mx, mz = p.inp.mz;
        if (p.busy || p.left) { mx = 0; mz = 0; }
        const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
        const sp = ghost ? 5.5 : 4.8, k = Math.min(1, dt * 10);
        p.vx += (mx * sp - p.vx) * k; p.vz += (mz * sp - p.vz) * k;
        p.x += p.vx * dt; p.z += p.vz * dt;
        if (!ghost) { const q = { x: p.x, z: p.z }; pushOut(this.map.obs, q, R); p.x = q.x; p.z = q.z; }
        p.x = clamp(p.x, -this.map.W + 0.8, this.map.W - 0.8); p.z = clamp(p.z, -this.map.D + 0.8, this.map.D - 0.8);
        if (l > 0.1 && p.animT <= 0) p.rot = Math.atan2(mx, mz);
        if (p.animT <= 0) p.anim = Math.hypot(p.vx, p.vz) > 0.5 ? T_ANIM.walk : (p.busy ? T_ANIM.interact : T_ANIM.idle);
      }
    }
    this.sendT += dt;
    if (this.sendT >= 0.066) { this.sendT = 0; this.sendState(); }
  }
  sendState() {
    const { total, done } = this.crewTasks();
    this.io.broadcast({ t: 'ts', ph: this.phase, tl: Math.max(0, this.phaseT),
      e: [...this.ps.values()].filter(p => !p.left).map(p => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.rot.toFixed(2), p.anim | (p.animN << 4), p.alive ? 1 : 0]),
      b: this.bodies.map(b => [b.pid, b.x, b.z, b.rot]), prog: total ? done / total : 0, dark: this.lightsT > 0 ? 1 : 0,
      em: [...this.ps.values()].map(p => [p.id, p.emerg]), mcd: Math.max(0, +this.meetCd.toFixed(1)), fx: this.fx });
    this.fx = [];
    for (const p of this.ps.values()) if (p.role === 'traitor' && !p.left) this.io.sendTo(p.id, { t: 'tcd', kill: Math.max(0, +p.killCd.toFixed(1)), sab: Math.max(0, +p.sabCd.toFixed(1)) });
  }
}
