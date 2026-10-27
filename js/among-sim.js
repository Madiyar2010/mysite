// Логика «Найди предателя» в стиле Among Us (работает только у хоста).
import { shuffle, clamp, pick, rnd, giveAwards } from './util.js';
import { AMAPS, TASKS, SAB, collide, lineOfSight, roomAtPos, applyMapText, solidTile } from './amap.js';

export const DEFAULT_OPTS = {
  map: 'station', maxPlayers: 10, impostors: 1, confirm: true, meetings: 1, meetCd: 15, discuss: 30, vote: 60, anon: false,
  speed: 1, crewVision: 1, impVision: 1.5, killCd: 25, killDist: 1, visualTasks: true, taskBar: 'always',
  common: 1, long: 1, short: 3, engineer: 0, scientist: 0, sheriff: 0, angel: 0, shapeshifter: 0, detective: 0, guard: 0, jester: 0, amBots: 0, voice: true
};
const BOT_SAY = ['Я делал задание', 'Это не я!', 'Кто был рядом?', 'Подозрительно…', 'Пропустим голосование', 'Давайте подумаем', 'Я вам верю'];
export const BASE = { speed: 4.6, vision: 7, killDist: [1.5, 2.1, 2.9] };
export const A_ANIM = { idle: 0, walk: 1, melee: 3, die: 5, interact: 6, yes: 7, no: 8 };
export const FLAG = { alive: 1, vent: 2, scan: 4, busy: 8 };
const R = 0.42, INTRO = 6.5, EJECT = 8, DOOR_TIME = 10, DOOR_CD = 25, SAB_CD = 30;

export class AmongSim {
  constructor(io, { roster, opts }) {
    this.io = io;
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.map = AMAPS[this.opts.map] || AMAPS.station;
    applyMapText(this.map);
    const o = this.opts, n = roster.length;
    const ids = shuffle(roster.map(r => r.pid));
    const nImp = clamp(o.impostors, 1, Math.max(1, Math.floor((n - 1) / 2)));
    const imps = ids.slice(0, nImp), crew = ids.slice(nImp);
    // дополнительные роли
    const sub = {};
    const give = (list, role, k) => { for (let i = 0; i < k; i++) { const c = list.find(id => !sub[id]); if (c) sub[c] = role; } };
    const crewSh = shuffle(crew);
    give(crewSh, 'sheriff', o.sheriff); give(crewSh, 'engineer', o.engineer); give(crewSh, 'scientist', o.scientist); give(crewSh, 'angel', o.angel);
    give(crewSh, 'detective', o.detective); give(crewSh, 'guard', o.guard); if (crew.length >= 3) give(crewSh, 'jester', o.jester);
    give(shuffle(imps), 'shapeshifter', o.shapeshifter);
    // задания
    const commons = this.pickTasks('common', o.common);
    this.ps = new Map();
    roster.forEach((r, i) => {
      const sp = this.map.spawns[i % this.map.spawns.length];
      const tasks = sub[r.pid] === 'jester' ? [] : [...commons, ...this.pickTasks('long', o.long), ...this.pickTasks('short', o.short)].map(id => this.makeTask(id));
      this.ps.set(r.pid, { id: r.pid, name: r.name, x: sp.x, z: sp.z, rot: 0, vx: 0, vz: 0, anim: 0, animN: 0, animT: 0,
        alive: true, role: imps.includes(r.pid) ? 'impostor' : 'crew', sub: sub[r.pid] || null, tasks, kills: 0, done: 0,
        killCd: 10, meetLeft: o.meetings, inVent: null, ventT: 0, ventCd: 0, shiftAs: null, shiftT: 0, shiftCd: 10, protectT: 0, angelCd: 0,
        busy: null, inp: { mx: 0, mz: 0 }, left: false, deadAt: 0, bot: !!r.bot, guardUsed: false, shield: false, ai: { path: [], goal: null, t: 0, busyT: 0, stuckT: 0, lx: sp.x, lz: sp.z, side: 0 } });
    });
    this.bodies = [];
    this.sab = null; this.sabCd = 15; this.doors = new Map(); this.doorCd = {};
    this.phase = 'intro'; this.phaseT = INTRO; this.meetCdT = 10;
    this.fx = []; this.lastProg = 0; this.log = []; this.t0 = performance.now();
    for (const p of this.ps.values()) this.sendRole(p);
    this.sendT = 0; this.meT = 0; this.last = performance.now();
    this.iv = setInterval(() => this.tick(), 33);
  }
  stop() { clearInterval(this.iv); }
  pickTasks(kind, k) { return shuffle(Object.keys(TASKS).filter(id => TASKS[id].kind === kind)).slice(0, k); }
  makeTask(id) {
    const t = TASKS[id];
    let steps;
    if (t.steps) steps = t.steps.map(s => Array.isArray(s) ? pick(s) : s);
    else if (t.where) steps = [pick(t.where)];
    else steps = [id];
    return { id, steps, step: 0 };
  }
  mates(p) { return p.role === 'impostor' ? [...this.ps.values()].filter(o => o.role === 'impostor' && o.id !== p.id).map(o => o.id) : []; }
  sendRole(p) { this.io.sendTo(p.id, { t: 'role', role: p.role, sub: p.sub, mates: this.mates(p), tasks: p.tasks, opts: this.opts, alive: p.alive }); }
  onJoin(pid) { const p = this.ps.get(pid); if (!p) return; p.left = false; this.sendRole(p); if (this.phase === 'meeting') this.io.sendTo(pid, this.meetMsg()); }
  onLeave(pid) {
    const p = this.ps.get(pid); if (!p) return;
    p.left = true; p.inVent = null; p.leftAt = performance.now();
    // ждём 30 секунд: вдруг просто пропала связь и игрок вернётся
    if (p.alive) this.ev('msg', `${p.name} потерял связь…`);
  }
  dropLeft() {
    for (const p of this.ps.values()) if (p.left && p.alive && performance.now() - p.leftAt > 30000) { p.alive = false; this.ev('msg', `${p.name} вышел из игры`); this.checkWin(); }
  }
  ev(...a) { this.fx.push(a); }
  near(p, x, z, d) { return Math.hypot(p.x - x, p.z - z) <= d; }
  closed() { const s = new Set(); const now = performance.now(); for (const [i, t] of this.doors) if (t > now) s.add(i); return s; }
  progress() {
    let total = 0, done = 0;
    for (const p of this.ps.values()) if (p.role === 'crew') for (const t of p.tasks) { total += t.steps.length; done += Math.min(t.step, t.steps.length); }
    return total ? done / total : 0;
  }
  setAnim(p, a, t) { p.anim = a; p.animN = (p.animN + 1) & 7; p.animT = t; }

  // ---------- сообщения ----------
  onMsg(pid, m) {
    const p = this.ps.get(pid); if (!p) return;
    const play = this.phase === 'play';
    switch (m.t) {
      case 'i': p.inp.mx = clamp(+m.mx || 0, -1, 1); p.inp.mz = clamp(+m.mz || 0, -1, 1); break;
      case 'kill': if (play) this.tryKill(p, m.target); break;
      case 'report': if (play) this.tryReport(p); break;
      case 'button': if (play) this.tryButton(p); break;
      case 'vent': if (play) this.tryVent(p, m.a, m.to); break;
      case 'sab': if (play) this.trySab(p, m.type); break;
      case 'sabdoor': if (play) this.tryDoor(p, m.room); break;
      case 'fix': if (play) this.tryFix(p, m.st); break;
      case 'hold': if (play) this.holdFix(p, m.st, !!m.v); break;
      case 'task': if (play) this.tryTask(p, m.st); break;
      case 'busy': p.busy = m.st || null; if (p.busy) this.setAnim(p, A_ANIM.interact, 0.5); break;
      case 'shift': if (play) this.tryShift(p, m.target); break;
      case 'protect': if (play) this.tryProtect(p, m.target); break;
      case 'talk': if ((this.phase === 'meeting' || this.phase === 'eject') && p.alive) this.io.broadcast({ t: 'talk', pid, v: !!m.v }); break;
      case 'emo': if (play && p.alive && p.animT <= 0) this.setAnim(p, m.v ? A_ANIM.yes : A_ANIM.no, 1.5); break;
      case 'chat': {
        if (this.phase !== 'meeting' && this.phase !== 'eject') return;
        const text = String(m.text || '').slice(0, 140).trim(); if (!text) return;
        const msg = { t: 'chat', pid, text, ghost: !p.alive };
        if (p.alive) this.io.broadcast(msg); else for (const o of this.ps.values()) if (!o.alive) this.io.sendTo(o.id, msg);
        break;
      }
      case 'vote': {
        if (this.phase !== 'meeting' || this.meetStage !== 'vote' || !p.alive || this.votes.has(pid)) return;
        const t = m.target === 'skip' ? 'skip' : (this.ps.get(m.target) && this.ps.get(m.target).alive ? m.target : null);
        if (!t) return;
        this.votes.set(pid, t);
        this.io.broadcast({ t: 'voted', pid });
        if (this.votes.size >= [...this.ps.values()].filter(o => o.alive).length) this.phaseT = Math.min(this.phaseT, 1.5);
        break;
      }
    }
  }
  canKillNow(p) { return p.alive && !p.inVent && p.killCd <= 0 && (p.role === 'impostor' || p.sub === 'sheriff'); }
  tryKill(p, targetId) {
    if (!this.canKillNow(p)) return;
    const range = BASE.killDist[this.opts.killDist] || 2.1, closed = this.closed();
    let t = this.ps.get(targetId);
    const ok = o => o && o !== p && o.alive && !o.inVent && !o.left && (p.role !== 'impostor' || o.role !== 'impostor') && this.near(p, o.x, o.z, range + 0.3) && lineOfSight(this.map, p.x, p.z, o.x, o.z, closed);
    if (!ok(t)) { t = null; let bd = 99; for (const o of this.ps.values()) if (ok(o)) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; t = o; } } }
    if (!t) return;
    p.killCd = this.opts.killCd;
    if (t.protectT > 0) { this.ev('shield', +t.x.toFixed(2), +t.z.toFixed(2)); this.io.sendTo(p.id, { t: 'toast', text: 'Цель под защитой ангела!' }); p.killCd = 10; return; }
    if (t.shield) { t.shield = false; this.ev('shield', +t.x.toFixed(2), +t.z.toFixed(2)); this.io.sendTo(p.id, { t: 'toast', text: 'Цель под щитом стражника!' }); this.io.sendTo(t.id, { t: 'toast', text: 'Щит стражника спас тебя!' }); p.killCd = 10; return; }
    if (p.sub === 'sheriff' && t.role !== 'impostor') { this.note(`Шериф ${p.name} ошибся`, 'kill'); this.die(p, p, true); this.ev('msg', `Шериф ошибся…`); this.checkWin(); return; }
    this.die(t, p);
    this.note(`${p.name} выбил ${t.name}`, 'kill');
    if (p.role === 'impostor') { p.x = t.x; p.z = t.z; }
    p.kills++;
    this.setAnim(p, A_ANIM.melee, 0.4);
    this.checkWin();
  }
  die(t, killer, self) {
    t.alive = false; t.busy = null; t.inVent = null; t.deadAt = performance.now();
    this.bodies.push({ pid: t.id, x: +t.x.toFixed(2), z: +t.z.toFixed(2), rot: t.rot });
    this.ev('kill', +t.x.toFixed(2), +t.z.toFixed(2), t.id);
    const as = killer.shiftAs || killer.id;
    this.io.sendTo(t.id, { t: 'killed', by: self ? null : as, sheriff: !!self });
  }
  tryReport(p) {
    if (!p.alive || p.inVent) return;
    const closed = this.closed();
    const b = this.bodies.find(b => this.near(p, b.x, b.z, 3) && lineOfSight(this.map, p.x, p.z, b.x, b.z, closed));
    if (b) this.startMeeting('body', p.id, b.pid);
  }
  tryButton(p) {
    const bt = this.map.stations.button;
    if (!p.alive || p.inVent || p.meetLeft <= 0 || this.meetCdT > 0 || (this.sab && SAB[this.sab.type].critical)) return;
    if (!this.near(p, bt.x, bt.z, 2.6)) return;
    p.meetLeft--;
    this.startMeeting('button', p.id, null);
  }
  tryVent(p, a, to) {
    const can = p.alive && (p.role === 'impostor' || p.sub === 'engineer');
    if (!can) return;
    if (a === 'enter') {
      if (p.inVent || (p.sub === 'engineer' && p.ventCd > 0)) return;
      const v = this.map.vents.find(v => this.near(p, v.x, v.z, 1.6)); if (!v) return;
      p.inVent = v.id; p.x = v.x; p.z = v.z; p.vx = p.vz = 0; p.busy = null; p.ventT = 0;
      this.ev('vent', v.x, v.z, 1);
    } else if (a === 'move' && p.inVent) {
      const cur = this.map.vents.find(v => v.id === p.inVent);
      if (!cur.to.includes(to)) return;
      const v = this.map.vents.find(x => x.id === to); p.inVent = v.id; p.x = v.x; p.z = v.z;
    } else if (a === 'exit' && p.inVent) this.exitVent(p);
  }
  exitVent(p) { const v = this.map.vents.find(x => x.id === p.inVent); p.inVent = null; if (p.sub === 'engineer') p.ventCd = 20; if (v) this.ev('vent', v.x, v.z, 0); }
  trySab(p, type) {
    if (p.role !== 'impostor' || this.sab || this.sabCd > 0 || !SAB[type]) return;
    if (type !== 'lights' && type !== 'comms' && !SAB[type].critical) return;
    this.sab = { type, t: SAB[type].critical || 0, done: new Set(), holds: new Map() };
    this.ev('sab', type);
  }
  tryDoor(p, room) {
    if (p.role !== 'impostor') return;
    if ((this.doorCd[room] || 0) > 0 || (this.sab && SAB[this.sab.type].critical)) return;
    const until = performance.now() + DOOR_TIME * 1000;
    let any = false;
    this.map.doors.forEach((d, i) => { if (d.room === room) { this.doors.set(i, until); any = true; } });
    if (!any) return;
    this.doorCd[room] = DOOR_CD;
    this.ev('doors', room, 1);
    // выталкиваем игроков из закрывшихся проёмов
    const closed = this.closed();
    for (const o of this.ps.values()) if (o.alive && !o.inVent) { const q = { x: o.x, z: o.z }; collide(this.map, q, R, closed); o.x = q.x; o.z = q.z; }
  }
  tryFix(p, st) {
    if (!this.sab || !p.alive) return;
    const s = SAB[this.sab.type];
    if (!s.fix.includes(st) || s.both) return;
    const stn = this.map.stations[st]; if (!stn || !this.near(p, stn.x, stn.z, 3)) return;
    this.sab.done.add(st);
    if (s.fix.every(f => this.sab.done.has(f))) this.clearSab();
  }
  holdFix(p, st, v) {
    if (!this.sab || this.sab.type !== 'reactor' || !p.alive) return;
    const stn = this.map.stations[st]; if (!stn || !SAB.reactor.fix.includes(st)) return;
    if (v && this.near(p, stn.x, stn.z, 3)) this.sab.holds.set(st, p.id); else if (this.sab.holds.get(st) === p.id) this.sab.holds.delete(st);
  }
  clearSab() { if (!this.sab) return; this.ev('sabfix', this.sab.type); this.sab = null; this.sabCd = SAB_CD; }
  tryTask(p, st) {
    if (p.role !== 'crew') return;
    const stn = this.map.stations[st]; if (!stn || !this.near(p, stn.x, stn.z, 3.2)) return;
    const task = p.tasks.find(t => t.step < t.steps.length && t.steps[t.step] === st);
    if (!task) return;
    task.step++;
    if (task.step >= task.steps.length) p.done++;
    this.io.sendTo(p.id, { t: 'taskok', tasks: p.tasks, st });
    this.checkWin();
  }
  tryShift(p, target) {
    if (p.sub !== 'shapeshifter' || !p.alive) return;
    if (p.shiftAs) { p.shiftAs = null; p.shiftT = 0; p.shiftCd = 30; this.ev('shift', +p.x.toFixed(2), +p.z.toFixed(2)); return; }
    if (p.shiftCd > 0) return;
    const t = this.ps.get(target); if (!t || t === p) return;
    p.shiftAs = t.id; p.shiftT = 20;
    this.ev('shift', +p.x.toFixed(2), +p.z.toFixed(2));
  }
  tryProtect(p, target) {
    if (p.sub === 'guard') {
      if (!p.alive || p.guardUsed) return;
      const t = this.ps.get(target); if (!t || !t.alive) return;
      t.shield = true; p.guardUsed = true;
      this.io.sendTo(p.id, { t: 'toast', text: `${t.name} под щитом до первого нападения` });
      return;
    }
    if (p.sub !== 'angel' || p.alive || p.angelCd > 0) return;
    const t = this.ps.get(target); if (!t || !t.alive) return;
    t.protectT = 10; p.angelCd = 30;
    this.io.sendTo(p.id, { t: 'toast', text: `${t.name} под защитой 10 секунд` });
  }

  // ---------- собрание ----------
  startMeeting(reason, by, body) {
    this.phase = 'meeting';
    this.meetStage = this.opts.discuss > 0 ? 'discuss' : 'vote';
    this.phaseT = this.meetStage === 'discuss' ? this.opts.discuss : this.opts.vote;
    this.votes = new Map();
    this.meeting = { reason, by, body };
    const byP = this.ps.get(by); this.note(reason === 'body' ? `${byP ? byP.name : '?'} нашёл выбитого — собрание` : `${byP ? byP.name : '?'} созвал собрание`, 'meet');
    for (const p of this.ps.values()) if (p.bot) { p.ai.voteT = rnd(2, 6); p.ai.said = false; }
    this.bodies = [];
    if (this.sab && !SAB[this.sab.type].critical) { /* свет и связь остаются */ } else if (this.sab) this.sab = null;
    this.doors.clear();
    this.lastProg = this.progress();
    let i = 0;
    const bt = this.map.stations.button;
    for (const p of this.ps.values()) {
      if (p.inVent) p.inVent = null;
      p.busy = null; p.vx = p.vz = 0; p.inp.mx = p.inp.mz = 0;
      if (p.shiftAs) { p.shiftAs = null; p.shiftCd = 30; }
      const sp = this.map.spawns[i++ % this.map.spawns.length];
      p.x = sp.x; p.z = sp.z; p.rot = Math.atan2(bt.x - p.x, bt.z - p.z);
    }
    this.io.broadcast(this.meetMsg());
    this.sendState();
  }
  meetMsg() {
    return { t: 'meet', reason: this.meeting.reason, by: this.meeting.by, body: this.meeting.body, stage: this.meetStage, left: this.phaseT,
      disc: this.opts.discuss, vote: this.opts.vote, alive: [...this.ps.values()].map(p => [p.id, p.alive ? 1 : 0]), voted: [...this.votes.keys()] };
  }
  endMeeting() {
    const tally = new Map();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) || 0) + 1);
    let best = null, bc = 0, tie = false;
    for (const [t, c] of tally) { if (c > bc) { best = t; bc = c; tie = false; } else if (c === bc) tie = true; }
    const ejected = best && best !== 'skip' && !tie ? best : null;
    let wasImp = null;
    if (ejected) { const p = this.ps.get(ejected); p.alive = false; wasImp = p.role === 'impostor'; this.note(`Выгнали ${p.name}${wasImp ? ' — это был предатель!' : ''}`, 'eject'); if (p.sub === 'jester') this.pendingWin = { win: 'jester', text: `Шутник ${p.name} добился своего — его выгнали! Победил Шутник!` }; }
    else this.note(tie ? 'Голоса разделились — никого не выгнали' : 'Решили никого не выгонять', 'eject');
    const left = [...this.ps.values()].filter(p => p.alive && p.role === 'impostor').length;
    const votes = this.opts.anon ? [...this.votes.values()].map(t => ['?', t]) : [...this.votes];
    this.io.broadcast({ t: 'voteres', votes, ejected, wasImp: this.opts.confirm ? wasImp : null, tie, impLeft: this.opts.confirm ? left : null, skip: tally.get('skip') || 0 });
    this.phase = 'eject'; this.phaseT = EJECT;
  }
  note(text, kind) { const s = Math.round((performance.now() - this.t0) / 1000); this.log.push([Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), text, kind]); }
  checkWin() {
    if (this.phase === 'over' || (this.pendingWin && this.pendingWin.win === 'jester')) return;
    const all = [...this.ps.values()];
    const imp = all.filter(p => p.alive && p.role === 'impostor').length;
    const crew = all.filter(p => p.alive && p.role === 'crew').length;
    let win = null, text = '';
    if (imp === 0) { win = 'crew'; text = 'Предатели пойманы! Команда победила!'; }
    else if (imp >= crew) { win = 'impostor'; text = 'Предатели захватили станцию!'; }
    else if (this.progress() >= 1) { win = 'crew'; text = 'Все задания выполнены! Команда победила!'; }
    if (!win) return;
    if (this.phase === 'eject' && this.phaseT > 0.1) { this.pendingWin = { win, text }; return; }
    this.finish(win, text);
  }
  finish(win, text) {
    this.phase = 'over';
    this.sendState();
    const rows = [...this.ps.values()].map(p => {
      const w = win === 'jester' ? p.sub === 'jester' : p.role === win && p.sub !== 'jester';
      const coins = p.sub === 'jester' ? 10 + (w ? 30 : 0) : p.role === 'crew' ? 10 + p.done * 2 + (w ? 20 : 0) : 10 + p.kills * 4 + (w ? 30 : 0);
      return { pid: p.id, name: p.name, bot: p.bot, role: p.role, sub: p.sub, win: w, tasks: p.done, kills: p.kills, alive: p.alive, coins: p.bot ? 0 : coins, pts: coins };
    }).sort((a, b) => (b.win - a.win) || (b.coins - a.coins));
    giveAwards(rows, [
      { name: 'Трудяга', icon: 'task', ok: r => r.role === 'crew' && r.tasks > 0, score: r => r.tasks },
      { name: 'Хитрый предатель', icon: 'impostor', ok: r => r.role === 'impostor', score: r => r.kills + (r.win ? 5 : 0) },
      { name: 'Выживший', icon: 'heart', ok: r => r.alive, score: r => r.tasks }
    ]);
    for (const r of rows) r.pts = r.coins;
    // сценка в конце: кто был предателем и как шла игра
    this.io.broadcast({ t: 'reveal', win, text, imps: [...this.ps.values()].filter(p => p.role === 'impostor').map(p => [p.id, p.kills]), jester: ([...this.ps.values()].find(p => p.sub === 'jester') || {}).id || null, log: this.log.slice(-8) });
    setTimeout(() => this.io.end({ mode: 'traitor', winText: text, win, rows }), 5200);
  }

  // ---------- боты ----------
  // путь по клеткам карты (поиск в ширину), двери учитываются
  botPath(p, gx, gz, closed, noFurn) {
    const m = this.map, [sx, sy] = m.toTile(p.x, p.z), [tx, ty] = m.toTile(gx, gz), GW = m.GW;
    if (sx === tx && sy === ty) return [{ x: gx, z: gz }];
    // клетки, занятые мебелью (столы, ящики), боты обходят
    if (!m.botBlock) { m.botBlock = new Uint8Array(GW * m.GH); for (let y = 0; y < m.GH; y++) for (let x = 0; x < GW; x++) { const cx = m.W(x), cz = m.Z(y); if (m.solids.some(o => Math.abs(cx - o.x) < o.hw + 0.55 && Math.abs(cz - o.z) < o.hd + 0.55)) m.botBlock[y * GW + x] = 1; } }
    const prev = new Int32Array(GW * m.GH).fill(-1), start = sy * GW + sx, goal = ty * GW + tx, q = [start]; prev[start] = start;
    while (q.length) {
      const c = q.shift(); if (c === goal) break;
      const x = c % GW, y = (c / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * GW + nx;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= m.GH || prev[n] >= 0) continue;
        if (n !== goal && p.alive && (solidTile(m, nx, ny, closed) || (!noFurn && m.botBlock[n]))) continue;
        prev[n] = c; q.push(n);
      }
    }
    if (prev[goal] < 0) { if (!noFurn) return this.botPath(p, gx, gz, closed, true); return null; }
    const path = []; for (let c = goal; c !== start; c = prev[c]) path.push({ x: m.W(c % GW), z: m.Z((c / GW) | 0) });
    path.reverse(); path[path.length - 1] = { x: gx, z: gz };
    return path;
  }
  // прямой путь свободен от стен и мебели?
  clearLine(p, b, closed) {
    const m = this.map, L = Math.hypot(b.x - p.x, b.z - p.z), n = Math.ceil(L / 0.4);
    for (let i = 1; i <= n; i++) {
      const x = p.x + (b.x - p.x) * i / n, z = p.z + (b.z - p.z) * i / n, [tx, ty] = m.toTile(x, z);
      if (solidTile(m, tx, ty, closed) && p.alive) return false;
      if (m.solids.some(o => Math.abs(x - o.x) < o.hw + 0.5 && Math.abs(z - o.z) < o.hd + 0.5)) return false;
    }
    return true;
  }
  botGo(p, gx, gz, closed, dt) {
    const ai = p.ai;
    if (!ai.goal || Math.hypot(ai.goal.x - gx, ai.goal.z - gz) > 0.5 || ai.t <= 0) { ai.goal = { x: gx, z: gz }; ai.path = this.botPath(p, gx, gz, closed) || []; ai.t = 2.5; }
    ai.t -= dt;
    while (ai.path.length > 1 && Math.hypot(ai.path[0].x - p.x, ai.path[0].z - p.z) < 0.7) ai.path.shift();
    // срезаем углы, если следующую точку видно
    if (ai.path.length > 1 && this.clearLine(p, ai.path[1], closed)) ai.path.shift();
    const n = ai.path[0]; if (!n) { p.inp.mx = p.inp.mz = 0; return true; }
    const dx = n.x - p.x, dz = n.z - p.z, L = Math.hypot(dx, dz);
    if (L < 0.3 && ai.path.length <= 1) { p.inp.mx = p.inp.mz = 0; return true; }
    // застрял — шаг в сторону
    ai.stuckT += dt;
    if (ai.stuckT > 1.2) { const moved = Math.hypot(p.x - ai.lx, p.z - ai.lz); ai.stuckT = 0; ai.lx = p.x; ai.lz = p.z; if (moved < 0.4) { ai.side = 0.7; ai.sx = rnd(-1, 1); ai.sz = rnd(-1, 1); ai.t = 0; } }
    if (ai.side > 0) { ai.side -= dt; p.inp.mx = ai.sx; p.inp.mz = ai.sz; return false; }
    p.inp.mx = dx / L; p.inp.mz = dz / L;
    return false;
  }
  botThink(p, dt, closed) {
    const ai = p.ai;
    if (ai.busyT > 0) { ai.busyT -= dt; p.inp.mx = p.inp.mz = 0; if (ai.busyT <= 0) { if (p.busy && p.busy !== 'fake') this.tryTask(p, p.busy); p.busy = null; } return; }
    const imp = p.role === 'impostor';
    // увидел выбитого — сообщает
    if (p.alive && !imp && this.bodies.length) {
      const b = this.bodies.find(b => this.near(p, b.x, b.z, 5) && lineOfSight(this.map, p.x, p.z, b.x, b.z, closed));
      if (b) { if (!this.near(p, b.x, b.z, 2.6)) { this.botGo(p, b.x, b.z, closed, dt); return; } p.inp.mx = p.inp.mz = 0; ai.reportT = (ai.reportT ?? rnd(0.5, 1.4)) - dt; if (ai.reportT <= 0) { ai.reportT = null; this.tryReport(p); } return; }
    }
    // авария: экипаж бежит чинить
    if (this.sab && p.alive && !imp) {
      const S = SAB[this.sab.type], idx = [...this.ps.values()].filter(o => o.bot && o.alive && o.role === 'crew').indexOf(p), st = S.fix[idx % S.fix.length];
      const stn = this.map.stations[st];
      if (stn && (S.critical || idx === 0)) {
        if (this.near(p, stn.x, stn.z, 2.4)) { p.inp.mx = p.inp.mz = 0; if (this.sab.type === 'reactor') this.holdFix(p, st, true); else this.tryFix(p, st); return; }
        this.botGo(p, stn.x, stn.z, closed, dt); return;
      }
    } else if (this.sab === null && p.ai.holding) p.ai.holding = null;
    if (imp && p.alive) {
      // предатель: ищет того, кто один
      if (p.killCd <= 0) {
        const range = BASE.killDist[this.opts.killDist] || 2.1;
        const others = [...this.ps.values()].filter(o => o.alive && !o.inVent && !o.left && o.role !== 'impostor');
        const lone = others.filter(o => this.near(p, o.x, o.z, 10) && lineOfSight(this.map, p.x, p.z, o.x, o.z, closed) && !others.some(w => w !== o && this.near(w, o.x, o.z, 9) && lineOfSight(this.map, w.x, w.z, o.x, o.z, closed)));
        const t = lone.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
        if (t) { if (this.near(p, t.x, t.z, range)) { this.tryKill(p, t.id); ai.goal = null; ai.wander = null; return; } this.botGo(p, t.x, t.z, closed, dt); return; }
      }
      if (!this.sab && this.sabCd <= 0 && Math.random() < dt * 0.04) this.trySab(p, pick(['lights', 'comms', 'lights']));
      // делает вид, что выполняет задания
      if (!ai.wander) { const st = pick(Object.values(this.map.stations).filter(s => s.id !== 'button')); ai.wander = st; }
      if (this.near(p, ai.wander.x, ai.wander.z, 2.2) || this.botGo(p, ai.wander.x, ai.wander.z, closed, dt)) { ai.wander = null; ai.busyT = rnd(1.5, 3.5); p.busy = 'fake'; }
      return;
    }
    if (imp) { p.inp.mx = p.inp.mz = 0; return; }
    // экипаж (и призраки экипажа): следующее задание
    const task = p.tasks.find(t => t.step < t.steps.length);
    if (!task) { if (!ai.idle) ai.idle = pick(Object.values(this.map.stations)); if (this.near(p, ai.idle.x, ai.idle.z, 2.5) || this.botGo(p, ai.idle.x, ai.idle.z, closed, dt)) ai.idle = null; return; }
    const st = task.steps[task.step], stn = this.map.stations[st];
    if (!stn) { task.step++; return; }
    if (this.near(p, stn.x, stn.z, 2.4)) { p.inp.mx = p.inp.mz = 0; p.busy = st; ai.busyT = rnd(2, 4.5); this.setAnim(p, A_ANIM.interact, 0.5); return; }
    this.botGo(p, stn.x, stn.z, closed, dt);
  }
  botMeeting(dt) {
    for (const p of this.ps.values()) {
      if (!p.bot || !p.alive) continue;
      const ai = p.ai;
      if (!ai.said && Math.random() < dt * 0.3) { ai.said = true; if (Math.random() < 0.6) this.io.broadcast({ t: 'chat', pid: p.id, text: pick(BOT_SAY), ghost: false }); }
      if (this.meetStage !== 'vote' || this.votes.has(p.id)) continue;
      ai.voteT -= dt; if (ai.voteT > 0) continue;
      const alive = [...this.ps.values()].filter(o => o.alive && o !== p && (p.role !== 'impostor' || o.role !== 'impostor'));
      const t = Math.random() < 0.45 || !alive.length ? 'skip' : pick(alive).id;
      this.onMsg(p.id, { t: 'vote', target: t });
    }
  }

  // ---------- цикл ----------
  tick() {
    const now = performance.now(), dt = Math.min(0.06, (now - this.last) / 1000); this.last = now;
    if (this.phase === 'over') return;
    this.phaseT -= dt;
    this.dropLeft();
    if (this.phase === 'intro' && this.phaseT <= 0) { this.phase = 'play'; this.sendState(); }
    if (this.phase === 'meeting') this.botMeeting(dt);
    if (this.phase === 'meeting' && this.phaseT <= 0) {
      if (this.meetStage === 'discuss') { this.meetStage = 'vote'; this.phaseT = this.opts.vote; this.io.broadcast({ t: 'votenow', left: this.phaseT }); }
      else this.endMeeting();
    } else if (this.phase === 'eject' && this.phaseT <= 0) {
      this.phase = 'play'; this.meetCdT = this.opts.meetCd;
      for (const p of this.ps.values()) { p.killCd = Math.max(p.killCd, this.opts.killCd); p.ventCd = 0; }
      this.sabCd = Math.max(this.sabCd, 10);
      this.sendState();
      if (this.pendingWin) { const w = this.pendingWin; this.pendingWin = null; this.finish(w.win, w.text); return; }
      this.checkWin();
    }
    if (this.phase === 'play') {
      this.meetCdT -= dt; this.sabCd -= dt;
      for (const k in this.doorCd) this.doorCd[k] -= dt;
      for (const [i, t] of this.doors) if (t <= now) { this.doors.delete(i); }
      if (this.sab) {
        const s = SAB[this.sab.type];
        if (s.critical) {
          this.sab.t -= dt;
          if (this.sab.type === 'reactor' && s.fix.every(f => this.sab.holds.has(f))) { this.clearSab(); }
          else if (this.sab.t <= 0) { this.finish('impostor', this.sab.type === 'reactor' ? 'Реактор взорвался! Предатели победили!' : 'Кислород закончился! Предатели победили!'); return; }
        }
      }
      const closed = this.closed();
      for (const p of this.ps.values()) if (p.bot && !p.inVent) this.botThink(p, dt, closed);
      for (const p of this.ps.values()) {
        p.killCd -= dt; p.ventCd -= dt; p.shiftCd -= dt; p.angelCd -= dt; p.protectT -= dt;
        if (p.animT > 0) p.animT -= dt;
        if (p.shiftAs) { p.shiftT -= dt; if (p.shiftT <= 0) { p.shiftAs = null; p.shiftCd = 30; this.ev('shift', +p.x.toFixed(2), +p.z.toFixed(2)); } }
        if (p.inVent) { if (p.sub === 'engineer') { p.ventT += dt; if (p.ventT > 15) this.exitVent(p); } continue; }
        const ghost = !p.alive;
        let mx = p.inp.mx, mz = p.inp.mz;
        if (p.busy || p.left) { mx = 0; mz = 0; }
        const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
        const sp = BASE.speed * this.opts.speed * (ghost ? 1.2 : 1), k = Math.min(1, dt * 12);
        p.vx += (mx * sp - p.vx) * k; p.vz += (mz * sp - p.vz) * k;
        p.x += p.vx * dt; p.z += p.vz * dt;
        if (!ghost) { const q = { x: p.x, z: p.z }; collide(this.map, q, R, closed); p.x = q.x; p.z = q.z; }
        p.x = clamp(p.x, -this.map.width / 2 + 1, this.map.width / 2 - 1); p.z = clamp(p.z, -this.map.depth / 2 + 1, this.map.depth / 2 - 1);
        if (l > 0.1 && p.animT <= 0) p.rot = Math.atan2(mx, mz);
        if (p.animT <= 0) p.anim = Math.hypot(p.vx, p.vz) > 0.5 ? A_ANIM.walk : (p.busy ? A_ANIM.interact : A_ANIM.idle);
      }
    }
    this.sendT += dt; this.meT += dt;
    if (this.sendT >= 0.066) { this.sendT = 0; this.sendState(); }
  }
  sendState() {
    const o = this.opts;
    let prog = this.progress();
    if (o.taskBar === 'meetings') prog = this.lastProg; else if (o.taskBar === 'never') prog = -1;
    const closed = [...this.closed()];
    const s = this.sab ? { type: this.sab.type, t: Math.max(0, +this.sab.t.toFixed(1)), done: [...this.sab.done], holds: [...this.sab.holds.keys()] } : null;
    this.io.broadcast({ t: 'as', ph: this.phase, tl: Math.max(0, +this.phaseT.toFixed(1)),
      e: [...this.ps.values()].filter(p => !p.left).map(p => {
        let fl = 0; if (p.alive) fl |= FLAG.alive; if (p.inVent) fl |= FLAG.vent; if (p.busy === 'scan' && p.role === 'crew' && o.visualTasks && p.alive) fl |= FLAG.scan; if (p.busy) fl |= FLAG.busy;
        return [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.rot.toFixed(2), p.anim | (p.animN << 4), fl, p.shiftAs || ''];
      }),
      b: this.bodies.map(b => [b.pid, b.x, b.z, b.rot]), prog: +prog.toFixed(3), sab: s, doors: closed,
      mcd: Math.max(0, +this.meetCdT.toFixed(1)), scd: Math.max(0, +this.sabCd.toFixed(1)), fx: this.fx });
    this.fx = [];
    for (const p of this.ps.values()) {
      if (p.left || p.bot) continue;
      const me = { t: 'me', kill: Math.max(0, +p.killCd.toFixed(1)), vent: p.inVent, ventT: +p.ventT.toFixed(1), ventCd: Math.max(0, +p.ventCd.toFixed(1)),
        shift: p.shiftAs, shiftT: +Math.max(0, p.shiftT).toFixed(1), shiftCd: Math.max(0, +p.shiftCd.toFixed(1)), angelCd: Math.max(0, +p.angelCd.toFixed(1)), meetLeft: p.meetLeft, guardUsed: p.guardUsed };
      if (p.role === 'impostor') me.doorCd = Object.fromEntries(Object.entries(this.doorCd).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(0)]));
      this.io.sendTo(p.id, me);
    }
  }
}
