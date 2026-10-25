// Логика арены (работает только у хоста): движение, бои, боты, монстры, режимы.
import { CLASSES, AURAS, TEAM_COLORS, TEAM_NAMES, rnd, pick, shuffle, clamp, angDiff } from './util.js';
import { MAPS, pushOut, pointBlocked, lineClear } from './maps.js';

export const MONSTERS = {
  skeleton: { model: 'grave/character-skeleton', name: 'Скелет', hp: 55, speed: 3.4, dmg: 9, range: 1.4, cd: 1.0, scale: 1, pts: 1 },
  zombie: { model: 'grave/character-zombie', name: 'Зомби', hp: 120, speed: 2.3, dmg: 15, range: 1.5, cd: 1.3, scale: 1.15, pts: 2 },
  vampire: { model: 'grave/character-vampire', name: 'Вампир', hp: 80, speed: 4.7, dmg: 11, range: 1.4, cd: 0.8, scale: 1, pts: 2 },
  ghost: { model: 'grave/character-ghost', name: 'Призрак', hp: 50, speed: 2.8, dmg: 12, range: 9, cd: 1.9, scale: 1, pts: 2, ranged: true },
  boss: { model: 'grave/character-keeper', name: 'Хранитель склепа', hp: 1500, speed: 2.7, dmg: 26, range: 2.8, cd: 1.5, scale: 2.6, pts: 25, boss: true }
};
export const ANIM = { idle: 0, walk: 1, run: 2, melee: 3, shoot: 4, die: 5, interact: 6, yes: 7, no: 8, cast: 9, kick: 10 };
const R = 0.45;
const FL = { dead: 1, invis: 2, shield: 4, prot: 8, boost: 16 };

export function auraColor(id) { const a = AURAS.find(x => x.id === id); return a && a.color && a.color !== 'rainbow' ? a.color : (a && a.color === 'rainbow' ? '#ff6bd6' : null); }

export class ArenaSim {
  constructor(io, { mode, roster }) {
    this.io = io; this.mode = mode; this.map = MAPS.arena;
    this.ents = new Map(); this.projs = []; this.fx = []; this.pid = 0; this.mid = 0;
    this.t = -3.5; this.over = false;
    this.limit = { ffa: 180, tdm: 240, ctf: 300, pve: 0 }[mode];
    this.goal = { tdm: 15, ctf: 3 }[mode] || 0;
    this.teamScore = [0, 0];
    this.team = mode === 'tdm' || mode === 'ctf';
    this.roster = roster;
    roster.forEach((p, i) => this.addPlayer(p, i));
    if (mode === 'ctf') this.flags = this.map.bases.map(b => ({ team: b.team, hx: b.x, hz: b.z, x: b.x, z: b.z, carrier: null, home: true, dropT: 0 }));
    if (mode === 'pve') { this.wave = 0; this.waveT = 3; this.queue = []; this.spawnT = 0; this.bossId = null; }
    this.sendT = 0;
    this.last = performance.now();
    this.iv = setInterval(() => this.tick(), 33);
  }
  stop() { clearInterval(this.iv); }

  // ---------- игроки ----------
  addPlayer(p, i) {
    const c = CLASSES[p.cls] || CLASSES.knight;
    const e = { id: p.pid, k: p.pid, isPlayer: true, isBot: !!p.bot, team: p.team ?? -1, cls: p.cls, aura: auraColor(p.aura), name: p.name,
      x: 0, z: 0, rot: 0, vx: 0, vz: 0, hp: c.hp, maxhp: c.hp, speed: c.speed, dead: false, respawnT: 0,
      atkCd: 0, supCd: 2, anim: 0, animN: 0, animT: 0, inp: { mx: 0, mz: 0, ax: 0, az: 1, atk: 0, sup: 0, emo: 0 }, lastSup: 0, lastEmo: 0,
      dashT: 0, shieldT: 0, invisT: 0, protT: 2, kills: 0, deaths: 0, dmg: 0, pts: 0, caps: 0, left: false, botT: 0, strafe: Math.random() < 0.5 ? 1 : -1 };
    this.ents.set(e.id, e);
    this.placeSpawn(e, i);
    return e;
  }
  addLate(p) { const e = this.addPlayer(p, null); this.placeSpawn(e, null); e.protT = 2; return e; }
  placeSpawn(e, i) {
    const m = this.map;
    let list = this.mode === 'pve' ? m.pveSpawns : this.team ? m.teamSpawns[e.team] : m.spawnsFFA;
    let best = list[i != null ? i % list.length : 0];
    if (i == null) {
      // самая безопасная точка — подальше от врагов
      let bestD = -1;
      for (const s of shuffle(list)) {
        let dmin = 99;
        for (const o of this.ents.values()) if (o !== e && !o.dead && this.enemies(e, o)) dmin = Math.min(dmin, Math.hypot(o.x - s.x, o.z - s.z));
        if (dmin > bestD) { bestD = dmin; best = s; }
      }
    }
    e.x = best.x + rnd(-0.3, 0.3); e.z = best.z + rnd(-0.3, 0.3);
    e.rot = this.team ? (e.team === 0 ? Math.PI / 2 : -Math.PI / 2) : Math.atan2(-e.x, -e.z);
  }
  enemies(a, b) {
    if (a === b) return false;
    if (this.mode === 'pve') return a.isPlayer !== b.isPlayer;
    if (!a.isPlayer || !b.isPlayer) return true;
    if (this.team) return a.team !== b.team;
    return true;
  }
  input(pid, m) {
    const e = this.ents.get(pid); if (!e || e.isBot) return;
    const i = e.inp;
    i.mx = clamp(+m.mx || 0, -1, 1); i.mz = clamp(+m.mz || 0, -1, 1);
    if (m.ax != null) { const l = Math.hypot(m.ax, m.az) || 1; i.ax = m.ax / l; i.az = m.az / l; }
    i.atk = m.atk ? 1 : 0;
    if (m.sup != null) i.sup = m.sup | 0;
    if (m.emo != null) i.emo = m.emo | 0;
  }
  onMsg(pid, m) { if (m.t === 'i') this.input(pid, m); }
  onLeave(pid) { const e = this.ents.get(pid); if (e) { e.left = true; e.inp.mx = e.inp.mz = 0; e.inp.atk = 0; this.dropFlag(e); } }
  onJoin(pid) { const e = this.ents.get(pid); if (e) e.left = false; }

  // ---------- эффекты ----------
  ev(...a) { this.fx.push(a); }
  setAnim(e, code, t) { e.anim = code; e.animN = (e.animN + 1) & 7; e.animT = t; }

  // ---------- урон ----------
  damage(t, amount, src, opts = {}) {
    if (t.dead || t.protT > 0 || this.over) return;
    if (t.shieldT > 0) amount *= 0.45;
    amount = Math.round(amount);
    t.hp -= amount;
    if (src) src.dmg += amount;
    this.ev('hit', +t.x.toFixed(2), +t.z.toFixed(2), amount, t.id, opts.crit ? 1 : 0);
    if (opts.kx) { t.vx += opts.kx; t.vz += opts.kz; }
    if (t.hp <= 0) this.kill(t, src);
  }
  heal(t, n) { if (t.dead) return; t.hp = Math.min(t.maxhp, t.hp + n); this.ev('hn', +t.x.toFixed(2), +t.z.toFixed(2), n); }
  kill(t, src) {
    t.dead = true; t.hp = 0; t.deaths = (t.deaths || 0) + 1;
    this.setAnim(t, ANIM.die, 99);
    this.dropFlag(t);
    this.ev('die', +t.x.toFixed(2), +t.z.toFixed(2), t.id);
    if (t.isPlayer) {
      t.respawnT = this.mode === 'pve' ? 7 : 3.5;
      if (src && src.isPlayer && src !== t) { src.kills++; src.pts += 1; if (this.mode === 'tdm') this.teamScore[src.team]++; }
      this.ev('kill', src ? src.name : '', t.name, src && src.isPlayer ? this.colorOf(src) : '#ff5d6c', this.colorOf(t));
    } else {
      t.removeT = 2.5;
      const mt = MONSTERS[t.mtype];
      if (src && src.isPlayer) { src.kills++; src.pts += mt.pts; }
      if (mt.boss) this.ev('msg', '🏆 Хранитель склепа повержен!');
    }
  }
  colorOf(e) { return this.team ? TEAM_COLORS[e.team] : '#ffd166'; }

  // ---------- атаки ----------
  attack(e) {
    const c = CLASSES[e.cls]; const a = c.atk;
    const ang = Math.atan2(e.inp.ax, e.inp.az);
    e.rot = ang;
    const crit = e.invisT > 0;
    if (crit) e.invisT = 0;
    if (a.type === 'melee') {
      this.setAnim(e, ANIM.melee, 0.3);
      this.ev('sl', +e.x.toFixed(2), +e.z.toFixed(2), +ang.toFixed(2), e.aura || c.color, a.range);
      for (const o of this.ents.values()) {
        if (o.dead || !this.enemies(e, o)) continue;
        const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz);
        const reach = a.range + (o.big || 0);
        if (d < reach && Math.abs(angDiff(Math.atan2(dx, dz), ang)) < a.arc / 2 + 0.25) {
          this.damage(o, a.dmg * (crit ? 2 : 1), e, { kx: dx / (d || 1) * 4, kz: dz / (d || 1) * 4, crit });
        }
      }
    } else {
      this.setAnim(e, e.cls === 'mage' ? ANIM.cast : ANIM.shoot, 0.35);
      this.shoot(e, a.type, ang, a.speed, a.dmg * (crit ? 2 : 1), a.range, a.radius);
    }
  }
  shoot(e, type, ang, speed, dmg, range, radius) {
    const dx = Math.sin(ang), dz = Math.cos(ang);
    this.projs.push({ id: ++this.pid, type, owner: e.id, x: e.x + dx * 0.6, z: e.z + dz * 0.6, vx: dx * speed, vz: dz * speed, dmg, life: range / speed, radius: radius || 0, color: e.aura || null, src: e });
  }
  superPower(e) {
    const c = CLASSES[e.cls];
    e.supCd = c.sup.cd;
    const ang = Math.atan2(e.inp.ax, e.inp.az);
    e.rot = ang;
    if (e.cls === 'knight') {
      e.dashT = 0.28; e.dashA = ang; e.shieldT = 2; e.dashHit = new Set();
      this.setAnim(e, ANIM.kick, 0.3);
      this.ev('dash', +e.x.toFixed(2), +e.z.toFixed(2), e.aura || c.color);
    } else if (e.cls === 'archer') {
      for (let i = -2; i <= 2; i++) this.shoot(e, 'arrow', ang + i * 0.16, c.atk.speed, c.atk.dmg, c.atk.range);
      this.setAnim(e, ANIM.shoot, 0.35);
    } else if (e.cls === 'mage') {
      this.setAnim(e, ANIM.cast, 0.5);
      this.ev('heal', +e.x.toFixed(2), +e.z.toFixed(2), 4.5);
      for (const o of this.ents.values()) {
        if (o.dead || !o.isPlayer) continue;
        if ((o === e || (!this.enemies(e, o) && this.mode !== 'ffa')) && Math.hypot(o.x - e.x, o.z - e.z) < 4.5) this.heal(o, 50);
      }
    } else if (e.cls === 'ninja') {
      const x0 = e.x, z0 = e.z;
      let step = 0;
      for (let s = 0.25; s <= 6; s += 0.25) { if (pointBlocked(this.map.obs, x0 + Math.sin(ang) * s, z0 + Math.cos(ang) * s, R)) break; step = s; }
      e.x += Math.sin(ang) * step; e.z += Math.cos(ang) * step;
      e.invisT = 2.5;
      this.ev('blink', +x0.toFixed(2), +z0.toFixed(2), +e.x.toFixed(2), +e.z.toFixed(2), e.aura || c.color);
    }
  }

  // ---------- боты ----------
  botThink(e, dt) {
    const i = e.inp, c = CLASSES[e.cls];
    e.botT -= dt;
    let goal = null, target = null, bestD = 99;
    for (const o of this.ents.values()) {
      if (o.dead || !this.enemies(e, o) || o.invisT > 0) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < bestD) { bestD = d; target = o; }
    }
    if (this.mode === 'ctf') {
      const my = this.flags[e.team], en = this.flags[1 - e.team];
      if (en.carrier === e.id) goal = { x: my.hx, z: my.hz };
      else if (!my.home && !my.carrier) goal = my;
      else if (!en.carrier) goal = en;
      else if (my.carrier) { const c2 = this.ents.get(my.carrier); if (c2) { goal = c2; target = c2; bestD = Math.hypot(c2.x - e.x, c2.z - e.z); } }
      if (target && bestD > 7 && goal) target = null;
    }
    const ranged = c.atk.type !== 'melee';
    const want = ranged ? 8 : 1.2;
    let mx = 0, mz = 0;
    if (target) {
      const dx = target.x - e.x, dz = target.z - e.z, d = bestD || 1;
      const clear = lineClear(this.map.obs, e.x, e.z, target.x, target.z);
      if (d > want + 1 || !clear) { mx = dx / d; mz = dz / d; }
      else if (ranged && d < want - 2.5) { mx = -dx / d; mz = -dz / d; }
      if (ranged || d < 4) { mx += -dz / d * 0.6 * e.strafe; mz += dx / d * 0.6 * e.strafe; }
      if (e.botT <= 0) { e.botT = rnd(1, 2.5); e.strafe *= -1; }
      const err = rnd(-0.12, 0.12);
      const aa = Math.atan2(dx, dz) + err;
      i.ax = Math.sin(aa); i.az = Math.cos(aa);
      const reach = ranged ? c.atk.range * 0.9 : c.atk.range + 0.2;
      i.atk = clear && d < reach ? 1 : 0;
      if (e.supCd <= 0 && clear && Math.random() < dt * 1.5) {
        if ((e.cls === 'knight' && d < 6) || (e.cls === 'archer' && d < 12) || (e.cls === 'ninja' && d < 7) || (e.cls === 'mage' && e.hp < e.maxhp * 0.6)) i.sup++;
      }
    } else {
      i.atk = 0;
      if (goal) { const dx = goal.x - e.x, dz = goal.z - e.z, d = Math.hypot(dx, dz) || 1; mx = dx / d; mz = dz / d; }
      else { if (!e.wander || e.botT <= 0) { e.wander = { x: rnd(-15, 15), z: rnd(-10, 10) }; e.botT = rnd(2, 4); } const dx = e.wander.x - e.x, dz = e.wander.z - e.z, d = Math.hypot(dx, dz) || 1; mx = dx / d; mz = dz / d; }
    }
    if (goal && target && this.mode === 'ctf') { const dx = goal.x - e.x, dz = goal.z - e.z, d = Math.hypot(dx, dz) || 1; mx = mx * 0.4 + dx / d; mz = mz * 0.4 + dz / d; }
    const st = this.steer(e, mx, mz);
    i.mx = st[0]; i.mz = st[1];
  }
  // обход препятствий: если впереди стена — пробуем свернуть
  steer(e, mx, mz) {
    const l = Math.hypot(mx, mz); if (l < 0.01) return [0, 0];
    mx /= l; mz /= l;
    const look = 1.2;
    if (!pointBlocked(this.map.obs, e.x + mx * look, e.z + mz * look, R)) return [mx, mz];
    const base = Math.atan2(mx, mz);
    for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = base + off * (e.strafe || 1);
      if (!pointBlocked(this.map.obs, e.x + Math.sin(a) * look, e.z + Math.cos(a) * look, R)) return [Math.sin(a), Math.cos(a)];
    }
    return [mx, mz];
  }

  // ---------- монстры ----------
  spawnMonster(type, at) {
    const m = MONSTERS[type];
    const g = at || pick(this.map.monsterGates);
    const id = 'm' + (++this.mid);
    const hpMul = type === 'boss' ? (0.6 + 0.25 * this.humanCount()) : 1;
    const e = { id, k: 'm:' + type, isPlayer: false, mtype: type, team: 9, x: g.x + rnd(-1, 1), z: g.z + rnd(-1, 1), rot: 0, vx: 0, vz: 0,
      hp: Math.round(m.hp * hpMul), maxhp: Math.round(m.hp * hpMul), speed: m.speed, dead: false, atkCd: rnd(0.5, 1.5), supCd: 0, anim: 0, animN: 0, animT: 0,
      protT: 0.5, shieldT: 0, invisT: 0, dashT: 0, big: m.boss ? 1.2 : 0, aiT: 0, strafe: Math.random() < 0.5 ? 1 : -1, slamT: 6, summonT: 14, volleyT: 9, inp: {} };
    this.ents.set(id, e);
    if (m.boss) { this.bossId = id; this.ev('msg', '💀 Появился Хранитель склепа!'); }
    return e;
  }
  humanCount() { let n = 0; for (const e of this.ents.values()) if (e.isPlayer && !e.left) n++; return Math.max(1, n); }
  monsterThink(e, dt) {
    const m = MONSTERS[e.mtype];
    let target = null, bd = 99;
    for (const o of this.ents.values()) if (o.isPlayer && !o.dead && !o.left) {
      let d = Math.hypot(o.x - e.x, o.z - e.z); if (o.invisT > 0) d += 8;
      if (d < bd) { bd = d; target = o; }
    }
    let mx = 0, mz = 0;
    if (target) {
      const dx = target.x - e.x, dz = target.z - e.z, d = bd || 1;
      const want = m.ranged ? 7 : m.range * 0.8 + (e.big || 0);
      if (d > want) { mx = dx / d; mz = dz / d; } else if (m.ranged && d < 4) { mx = -dx / d; mz = -dz / d; }
      e.rot = Math.atan2(dx, dz);
      if (e.atkCd <= 0 && e.animT <= 0) {
        if (m.ranged && d < m.range && lineClear(this.map.obs, e.x, e.z, target.x, target.z)) {
          e.atkCd = m.cd; this.setAnim(e, ANIM.shoot, 0.4);
          this.projs.push({ id: ++this.pid, type: 'orb', owner: e.id, x: e.x, z: e.z, vx: dx / d * 8, vz: dz / d * 8, dmg: m.dmg, life: 1.6, radius: 0, src: e });
        } else if (!m.ranged && d < m.range + (e.big || 0)) {
          e.atkCd = m.cd; this.setAnim(e, ANIM.melee, 0.4);
          this.damage(target, m.dmg, e, { kx: dx / d * 3, kz: dz / d * 3 });
        }
      }
      if (m.boss) this.bossThink(e, dt, target);
    }
    const st = this.steer(e, mx, mz);
    return st;
  }
  bossThink(e, dt, target) {
    const enraged = e.hp < e.maxhp / 2;
    e.slamT -= dt; e.summonT -= dt; e.volleyT -= dt;
    if (e.slamT <= 0 && !e.slamAt) { e.slamT = enraged ? 4.5 : 6.5; e.slamAt = { x: e.x, z: e.z, t: 1.1 }; this.ev('tele', +e.x.toFixed(2), +e.z.toFixed(2), 4.2, 1.1); this.setAnim(e, ANIM.cast, 1.1); }
    if (e.slamAt) {
      e.slamAt.t -= dt;
      if (e.slamAt.t <= 0) {
        this.ev('boom', +e.slamAt.x.toFixed(2), +e.slamAt.z.toFixed(2), 4.2, '#ff3355'); this.ev('shake', 1);
        for (const o of this.ents.values()) if (o.isPlayer && !o.dead) { const dx = o.x - e.slamAt.x, dz = o.z - e.slamAt.z, d = Math.hypot(dx, dz); if (d < 4.2) this.damage(o, 32, e, { kx: dx / (d || 1) * 9, kz: dz / (d || 1) * 9 }); }
        e.slamAt = null;
      }
    }
    if (e.summonT <= 0) { e.summonT = enraged ? 11 : 15; for (let i = 0; i < 3; i++) this.spawnMonster('skeleton', { x: e.x + rnd(-2, 2), z: e.z + rnd(-2, 2) }); this.ev('msg', '💀 Хранитель призвал скелетов!'); }
    if (enraged && e.volleyT <= 0) { e.volleyT = 7; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this.projs.push({ id: ++this.pid, type: 'bossorb', owner: e.id, x: e.x, z: e.z, vx: Math.sin(a) * 7, vz: Math.cos(a) * 7, dmg: 18, life: 2.4, radius: 0, src: e }); } }
    e.speed = enraged ? 3.4 : 2.7;
  }
  waveList(n) {
    const pc = this.humanCount();
    const L = [];
    const add = (t, k) => { for (let i = 0; i < k; i++) L.push(t); };
    if (n === 1) add('skeleton', 4 + pc);
    else if (n === 2) { add('skeleton', 4 + pc); add('zombie', 2 + (pc >> 1)); }
    else if (n === 3) { add('skeleton', 4); add('vampire', 2 + (pc >> 1)); add('ghost', 2); }
    else if (n === 4) { add('zombie', 3); add('vampire', 3); add('ghost', 2 + (pc >> 1)); add('skeleton', pc); }
    else if (n === 5) { add('skeleton', 5); add('zombie', 3); add('vampire', 3); add('ghost', 3); }
    else if (n === 6) { add('skeleton', 3); return ['boss', ...L]; }
    return shuffle(L);
  }

  // ---------- флаги ----------
  dropFlag(e) {
    if (!this.flags) return;
    for (const f of this.flags) if (f.carrier === e.id) { f.carrier = null; f.x = e.x; f.z = e.z; f.home = false; f.dropT = 15; this.ev('msg', `🚩 ${e.name} потерял флаг!`); }
  }
  flagTick(dt) {
    for (const f of this.flags) {
      if (f.carrier) { const c = this.ents.get(f.carrier); if (c) { f.x = c.x; f.z = c.z; } continue; }
      if (!f.home) { f.dropT -= dt; if (f.dropT <= 0) { f.home = true; f.x = f.hx; f.z = f.hz; this.ev('msg', `🚩 Флаг команды «${TEAM_NAMES[f.team]}» вернулся на базу`); } }
      for (const e of this.ents.values()) {
        if (!e.isPlayer || e.dead || e.left) continue;
        if (Math.hypot(e.x - f.x, e.z - f.z) > 1.3) continue;
        if (e.team !== f.team) { f.carrier = e.id; f.home = false; this.ev('msg', `🚩 ${e.name} схватил флаг!`); break; }
        else if (!f.home) { f.home = true; f.x = f.hx; f.z = f.hz; e.pts += 1; this.ev('msg', `🛡️ ${e.name} вернул свой флаг`); break; }
      }
    }
    for (const f of this.flags) {
      if (!f.carrier) continue;
      const c = this.ents.get(f.carrier), own = this.flags[c.team];
      if (own.home && Math.hypot(c.x - own.hx, c.z - own.hz) < 2.2) {
        this.teamScore[c.team]++; c.caps++; c.pts += 3;
        f.carrier = null; f.home = true; f.x = f.hx; f.z = f.hz;
        this.ev('cap', c.team, c.name); this.ev('shake', 0.5);
      }
    }
  }

  // ---------- основной цикл ----------
  tick() {
    const now = performance.now(), dt = Math.min(0.06, (now - this.last) / 1000); this.last = now;
    if (this.over) return;
    this.t += dt;
    const playing = this.t >= 0;
    for (const e of this.ents.values()) {
      if (e.dead) {
        if (e.isPlayer && playing) { e.respawnT -= dt; if (e.respawnT <= 0 && !e.left && !this.pveLost) this.respawn(e); }
        else if (!e.isPlayer) { e.removeT -= dt; if (e.removeT <= 0) this.ents.delete(e.id); }
        continue;
      }
      e.atkCd -= dt; e.supCd -= dt; e.shieldT -= dt; e.invisT -= dt; e.protT -= dt;
      if (e.animT > 0) { e.animT -= dt; }
      let mx = 0, mz = 0, speed = e.speed;
      if (e.isPlayer) {
        if (!playing || e.left) { e.inp.atk = 0; }
        if (e.isBot && playing) this.botThink(e, dt);
        mx = playing ? e.inp.mx : 0; mz = playing ? e.inp.mz : 0;
        if (playing && e.inp.atk && e.atkCd <= 0 && e.dashT <= 0) { e.atkCd = CLASSES[e.cls].atk.cd; this.attack(e); }
        if (playing && e.inp.sup !== e.lastSup) { e.lastSup = e.inp.sup; if (e.supCd <= 0) this.superPower(e); }
        if (e.inp.emo !== e.lastEmo) { e.lastEmo = e.inp.emo; if (e.animT <= 0) this.setAnim(e, e.inp.emo % 2 ? ANIM.yes : ANIM.no, 1.6); }
        if (this.flags && this.flags.some(f => f.carrier === e.id)) speed *= 0.85;
      } else if (playing) {
        [mx, mz] = this.monsterThink(e, dt);
      }
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      const k = Math.min(1, dt * 10);
      if (e.dashT > 0) {
        e.dashT -= dt;
        e.vx = Math.sin(e.dashA) * 19; e.vz = Math.cos(e.dashA) * 19;
        for (const o of this.ents.values()) if (!o.dead && this.enemies(e, o) && !e.dashHit.has(o.id) && Math.hypot(o.x - e.x, o.z - e.z) < 1.4 + (o.big || 0)) {
          e.dashHit.add(o.id); this.damage(o, 24, e, { kx: Math.sin(e.dashA) * 10, kz: Math.cos(e.dashA) * 10 });
        }
      } else {
        e.vx += (mx * speed - e.vx) * k; e.vz += (mz * speed - e.vz) * k;
      }
      e.x += e.vx * dt; e.z += e.vz * dt;
      const p = { x: e.x, z: e.z }; pushOut(this.map.obs, p, R + (e.big || 0) * 0.5); e.x = p.x; e.z = p.z;
      e.x = clamp(e.x, -this.map.W + 1, this.map.W - 1); e.z = clamp(e.z, -this.map.D + 1, this.map.D - 1);
      if (e.isPlayer && e.animT <= 0 && ml > 0.1 && !(e.inp.atk)) e.rot = Math.atan2(mx, mz);
      else if (e.isPlayer && e.inp.atk) e.rot = Math.atan2(e.inp.ax, e.inp.az);
      if (e.animT <= 0) { const sp = Math.hypot(e.vx, e.vz); const a = sp > speed * 0.85 && speed > 5.5 ? ANIM.run : sp > 0.5 ? ANIM.walk : ANIM.idle; if (a !== e.anim) { e.anim = a; } }
    }
    // столкновения тел
    const arr = [...this.ents.values()].filter(e => !e.dead);
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01, min = R * 2 + (a.big || 0) * 0.6 + (b.big || 0) * 0.6;
      if (d < min) { const push = (min - d) / 2, nx = dx / d, nz = dz / d, wa = a.big ? 0.1 : 1, wb = b.big ? 0.1 : 1; a.x -= nx * push * wa; a.z -= nz * push * wa; b.x += nx * push * wb; b.z += nz * push * wb; }
    }
    // снаряды
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
      let hit = p.life <= 0 || pointBlocked(this.map.obs, p.x, p.z, 0.05);
      let victim = null;
      if (!hit) for (const o of this.ents.values()) {
        if (o.dead || o.id === p.owner || !this.enemies(p.src, o)) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < 0.55 + (o.big || 0)) { hit = true; victim = o; break; }
      }
      if (!hit) continue;
      this.projs.splice(i, 1);
      if (p.type === 'fireball') {
        this.ev('boom', +p.x.toFixed(2), +p.z.toFixed(2), p.radius, p.color || '#ff8a3d');
        for (const o of this.ents.values()) {
          if (o.dead || !this.enemies(p.src, o)) continue;
          const d = Math.hypot(o.x - p.x, o.z - p.z);
          if (d < p.radius + (o.big || 0)) this.damage(o, o === victim ? p.dmg : p.dmg * 0.7, p.src, { kx: (o.x - p.x) / (d || 1) * 3, kz: (o.z - p.z) / (d || 1) * 3 });
        }
      } else if (victim) {
        this.damage(victim, p.dmg, p.src, { kx: p.vx * 0.12, kz: p.vz * 0.12 });
      } else this.ev('puff', +p.x.toFixed(2), +p.z.toFixed(2));
    }
    if (playing && this.flags) this.flagTick(dt);
    if (playing && this.mode === 'pve') this.waveTick(dt);
    this.checkEnd();
    this.sendT += dt;
    if (this.sendT >= 0.05) { this.sendT = 0; this.io.broadcast(this.snapshot()); this.fx = []; }
  }
  respawn(e) {
    e.dead = false; e.hp = e.maxhp; e.protT = 1.8; e.anim = 0; e.animT = 0; e.vx = e.vz = 0; e.supCd = Math.max(e.supCd, 1);
    this.placeSpawn(e, null);
    this.ev('spawn', +e.x.toFixed(2), +e.z.toFixed(2));
  }
  waveTick(dt) {
    let alive = 0; for (const e of this.ents.values()) if (!e.isPlayer && !e.dead) alive++;
    if (this.queue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 0.7; this.spawnMonster(this.queue.shift()); }
    } else if (alive === 0) {
      if (this.wave >= 6) return;
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.wave++; this.queue = this.waveList(this.wave); this.waveT = 6;
        this.ev('msg', this.wave === 6 ? '⚠️ Финальная волна: БОСС!' : `🌊 Волна ${this.wave} из 6`);
        for (const e of this.ents.values()) if (e.isPlayer && !e.dead) this.heal(e, 40);
      }
    }
    // поражение — все игроки выбиты одновременно
    const humans = [...this.ents.values()].filter(e => e.isPlayer && !e.left);
    if (humans.length && humans.every(e => e.dead)) this.pveLost = true;
  }
  checkEnd() {
    if (this.t < 0) return;
    let end = false, winText = '', winners = new Set();
    const players = [...this.ents.values()].filter(e => e.isPlayer);
    const timeUp = this.limit && this.t >= this.limit;
    if (this.mode === 'ffa') {
      if (timeUp) { end = true; const best = Math.max(...players.map(p => p.kills)); players.filter(p => p.kills === best).forEach(p => winners.add(p.id)); winText = `Победил ${players.filter(p => winners.has(p.id)).map(p => p.name).join(' и ')}!`; }
    } else if (this.mode === 'tdm' || this.mode === 'ctf') {
      const [a, b] = this.teamScore;
      if (a >= this.goal || b >= this.goal || timeUp) {
        end = true;
        if (a === b) { winText = 'Ничья!'; }
        else { const w = a > b ? 0 : 1; players.filter(p => p.team === w).forEach(p => winners.add(p.id)); winText = `Победили ${TEAM_NAMES[w]}!`; }
      }
    } else if (this.mode === 'pve') {
      const boss = this.bossId && this.ents.get(this.bossId);
      if (this.wave >= 6 && this.bossId && (!boss || boss.dead) && !this.queue.length) { end = true; players.forEach(p => winners.add(p.id)); winText = 'Монстры побеждены! Вы — герои! 🏆'; }
      else if (this.pveLost) { end = true; winText = `Монстры победили на волне ${this.wave}… Попробуйте ещё!`; }
    }
    if (!end) return;
    this.over = true;
    this.io.broadcast(this.snapshot());
    const rows = players.map(p => {
      const win = winners.has(p.id);
      let coins = 10 + p.kills * 2 + (win ? 15 : 0) + (p.caps || 0) * 4;
      if (this.mode === 'pve') coins = 10 + p.kills + (win ? 25 : 0) + this.wave * 2;
      return { pid: p.id, name: p.name, bot: p.isBot, team: p.team, kills: p.kills, deaths: p.deaths, pts: p.pts, caps: p.caps, win, coins: p.isBot ? 0 : coins };
    });
    rows.sort((a, b) => (b.win - a.win) || (b.pts - a.pts) || (b.kills - a.kills));
    setTimeout(() => this.io.end({ mode: this.mode, winText, rows, teamScore: this.teamScore, wave: this.wave }), 1800);
  }
  snapshot() {
    const e = [];
    for (const x of this.ents.values()) {
      if (x.left && x.isPlayer) continue;
      let fl = 0;
      if (x.dead) fl |= FL.dead; if (x.invisT > 0) fl |= FL.invis; if (x.shieldT > 0) fl |= FL.shield; if (x.protT > 0) fl |= FL.prot;
      e.push([x.id, x.k, +x.x.toFixed(2), +x.z.toFixed(2), +x.rot.toFixed(2), x.anim | (x.animN << 4), Math.max(0, Math.round(x.hp)), x.maxhp, fl, x.isPlayer ? Math.max(0, +x.supCd.toFixed(1)) : 0, x.isPlayer && x.dead ? Math.max(0, +x.respawnT.toFixed(1)) : 0]);
    }
    const s = { t: 's', ph: this.t < 0 ? 'count' : 'play', c: this.t < 0 ? Math.ceil(-this.t) : 0, tl: this.limit ? Math.max(0, this.limit - this.t) : -1,
      e, p: this.projs.map(p => [p.id, p.type, +p.x.toFixed(2), +p.z.toFixed(2), +p.vx.toFixed(1), +p.vz.toFixed(1), p.color]), fx: this.fx };
    if (this.team) s.ts = this.teamScore;
    if (this.flags) s.fl = this.flags.map(f => [f.team, +f.x.toFixed(2), +f.z.toFixed(2), f.carrier || '']);
    if (this.mode === 'pve') { const boss = this.bossId && this.ents.get(this.bossId); s.wave = this.wave; s.left = this.queue.length + [...this.ents.values()].filter(x => !x.isPlayer && !x.dead).length; if (boss && !boss.dead) s.boss = [boss.hp, boss.maxhp]; }
    if (!this.sbT || this.t - this.sbT > 0.5) { this.sbT = this.t; s.sb = [...this.ents.values()].filter(x => x.isPlayer).map(x => [x.id, x.kills, x.deaths, x.pts]); }
    return s;
  }
}
