// Логика шутера (только у хоста).
import { WEAPONS, GEAR, MONEY } from './weapons.js';
import { SMAPS, PH, movePlayer, updateDynamics, rayWorld, rayPlayer, los, navPath } from './smap.js';
import { TEAM_NAMES, shuffle, pick, rnd, clamp, giveAwards } from '../util.js';

export const S_MONSTERS = {
  skeleton: { model: 'grave/character-skeleton', name: 'Скелет', hp: 70, speed: 4.2, dmg: 12, range: 1.5, cd: 0.9, scale: 1.1, money: 100 },
  zombie: { model: 'grave/character-zombie', name: 'Зомби', hp: 150, speed: 3.0, dmg: 20, range: 1.6, cd: 1.2, scale: 1.25, money: 150 },
  vampire: { model: 'grave/character-vampire', name: 'Вампир', hp: 100, speed: 5.6, dmg: 14, range: 1.5, cd: 0.7, scale: 1.1, money: 150 },
  ghost: { model: 'grave/character-ghost', name: 'Призрак', hp: 60, speed: 3.4, dmg: 14, range: 16, cd: 1.6, scale: 1.1, money: 150, ranged: true },
  imp: { model: 'grave/character-skeleton', name: 'Бесёнок', hp: 35, speed: 6.6, dmg: 8, range: 1.2, cd: 0.6, scale: 0.7, money: 80 },
  bat: { model: 'grave/character-ghost', name: 'Летучий призрак', hp: 45, speed: 5.2, dmg: 10, range: 1.6, cd: 0.8, scale: 0.85, money: 110, hover: 1.4 },
  boss: { model: 'grave/character-keeper', name: 'Хранитель склепа', hp: 2600, speed: 3.6, dmg: 35, range: 3, cd: 1.4, scale: 2.6, money: 1000, boss: true }
};
export const SHOOT_DEFAULTS = { pveDiff: 1, ff: false, teamSize: 0, smap: 'warehouse', match: 'timed', rounds: 5, roundTime: 90, timeLimit: 300, bots: 0, botLevel: 1 };
const FL = { dead: 1, prot: 2, mark: 4, armor: 8, slow: 16, carry: 32, reload: 64, scoped: 128, crouch: 256 };
const WIDX = Object.keys(WEAPONS);

export class ShooterSim {
  constructor(io, { mode, roster, opts }) {
    this.io = io; this.mode = mode;
    this.opts = { ...SHOOT_DEFAULTS, ...opts };
    if (mode === 'ctf' || mode === 'pve') this.opts.match = 'timed';
    this.rounds = this.opts.match === 'rounds';
    this.team = mode === 'tdm' || mode === 'ctf';
    this.map = SMAPS[this.opts.smap] || SMAPS.warehouse;
    this.ps = new Map(); this.mons = new Map(); this.projs = []; this.fx = [];
    this.pid = 0; this.mid = 0; this.t = 0; this.round = 0; this.teamScore = [0, 0]; this.score = new Map();
    this.wave = 0; this.goal = { tdm: 20, ctf: 3 }[mode] || 0;
    this.lives = [15, 8, 3][this.opts.pveDiff ?? 1] ?? 8;
    roster.forEach(r => this.addPlayer(r));
    if (mode === 'ctf') this.flags = this.map.flags.map(f => ({ team: f.team, hx: f.x, hz: f.z, x: f.x, y: 0, z: f.z, carrier: null, home: true, dropT: 0 }));
    this.over = false;
    this.startRound(true);
    this.last = performance.now(); this.sendT = 0; this.meT = 0;
    this.iv = setInterval(() => this.tick(), 33);
  }
  stop() { clearInterval(this.iv); }
  ev(...a) { this.fx.push(a); }

  // ---------- игроки ----------
  addPlayer(r) {
    const p = { id: r.pid, name: r.name, team: r.team ?? 0, bot: !!r.bot, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, ground: true,
      alive: true, hp: 100, armor: 0, money: this.rounds ? MONEY.start : MONEY.startTimed, slot1: null, slot2: 'pistol', nades: 0, medkit: 0, cur: 'pistol',
      ammo: {}, lastFire: 0, reloadUntil: 0, slowUntil: 0, freezeUntil: 0, markUntil: 0, protUntil: 0, kills: 0, deaths: 0, pts: 0, caps: 0,
      anim: 0, animN: 0, respawnT: 0, left: false, lastPos: 0, ai: { t: 0, path: null, pathT: 0, react: 0, strafe: 1, aimErr: 0 }, buyWindow: 0, moverHit: 0 };
    this.giveAmmo(p, 'pistol');
    this.ps.set(p.id, p);
    return p;
  }
  addLate(r) { const p = this.addPlayer(r); if (this.rounds && this.phase === 'play') { p.alive = false; } else this.spawn(p); return p; }
  giveAmmo(p, w) { const W = WEAPONS[w]; if (W && W.mag) p.ammo[w] = [W.mag, W.reserve]; }
  enemies(a, b) {
    if (a === b) return false;
    if (this.mode === 'pve') return !!a.mon !== !!b.mon;
    if (a.mon || b.mon) return true;
    if (this.team) return a.team !== b.team;
    return true;
  }
  // можно ли ранить: враги всегда, свои — только если хост включил «Урон по своим»
  canHurt(a, b) { return this.enemies(a, b) || (!!this.opts.ff && this.team && a !== b && !a.mon && !b.mon); }
  // точка появления: подальше от врагов и там, где враг её не видит
  spawnPoint(p) {
    const m = this.map;
    const own = this.team ? m.spawnsTeam[p.team] : this.mode === 'pve' ? m.spawnsTeam[0].concat(m.spawnsTeam[1]) : m.spawnsFFA;
    const foes = [...this.ps.values()].filter(o => o !== p && o.alive && !o.left && this.enemies(p, o)).concat([...this.mons.values()].filter(o => o.alive));
    const score = s => {
      let dmin = 99, seen = false;
      for (const o of foes) {
        const d = Math.hypot(o.x - s.x, o.z - s.z); dmin = Math.min(dmin, d);
        if (!seen && d < 45 && los(m, { x: o.x, y: o.y + 1.5, z: o.z }, { x: s.x, y: 1.4, z: s.z })) seen = true;
      }
      for (const o of this.ps.values()) if (o !== p && o.alive && Math.hypot(o.x - s.x, o.z - s.z) < 1) dmin -= 5;
      return Math.min(dmin, 40) - (seen ? 30 : 0) + Math.random();
    };
    let best = own[0], bs = -1e9;
    for (const s of own) { const v = score(s); if (v > bs) { bs = v; best = s; } }
    // в командах: если вся своя база под прицелом — появляемся в безопасном месте карты
    if (this.team && bs < 8 && m.spawnsFFA) for (const s of m.spawnsFFA) { const v = score(s) - 4; if (v > bs) { bs = v; best = s; } }
    return best;
  }
  spawn(p) {
    const s = this.spawnPoint(p);
    Object.assign(p, { x: s.x, y: 0, z: s.z, yaw: s.yaw, pitch: 0, vx: 0, vy: 0, vz: 0, alive: true, hp: 100, protUntil: this.t + 3, slowUntil: 0, freezeUntil: 0, reloadUntil: 0, buyWindow: this.t + 10 });
    for (const w of [p.slot1, p.slot2]) if (w) this.giveAmmo(p, w);
    p.cur = p.slot1 || p.slot2;
    if (!p.bot) this.io.sendTo(p.id, { t: 'spawn', x: s.x, y: 0, z: s.z, yaw: s.yaw });
    p.ai.path = null;
  }

  // ---------- раунды ----------
  startRound(first) {
    this.round++;
    this.phase = 'buy'; this.phaseT = 20; this.buyReady = new Set();
    this.roundKills = new Map();
    if (this.rounds || first) for (const p of this.ps.values()) if (!p.left) this.spawn(p);
    if (this.mode === 'pve' && !first) for (const p of this.ps.values()) if (!p.left && !p.alive) this.spawn(p);
    for (const p of this.ps.values()) if (p.bot) this.botBuy(p);
    this.projs = [];
    if (this.flags) for (const f of this.flags) Object.assign(f, { x: f.hx, z: f.hz, y: 0, carrier: null, home: true });
    if (this.mode === 'pve') { this.wave++; this.queue = this.waveList(this.wave); this.spawnT = 0; }
    else { this.mons.clear(); this.hazT = null; }
    this.ev('round', this.round, this.mode === 'pve' ? this.wave : 0);
  }
  endRound(winTeam, winPid, text) {
    if (this.phase !== 'play') return;
    this.phase = 'roundEnd'; this.phaseT = 5;
    if (this.team && winTeam != null) this.teamScore[winTeam]++;
    if (!this.team && winPid) this.score.set(winPid, (this.score.get(winPid) || 0) + 1);
    for (const p of this.ps.values()) {
      const won = this.team ? p.team === winTeam : p.id === winPid;
      p.money = Math.min(MONEY.max, p.money + (won ? MONEY.win : MONEY.lose));
    }
    this.ev('roundEnd', text, winTeam ?? -1, winPid || '');
  }
  checkRound() {
    if (this.phase !== 'play') return;
    const alive = [...this.ps.values()].filter(p => p.alive && !p.left);
    const timeUp = this.phaseT <= 0;
    if (this.rounds) {
      if (this.team) {
        const a0 = alive.filter(p => p.team === 0).length, a1 = alive.filter(p => p.team === 1).length;
        if (a0 === 0 || a1 === 0 || timeUp) {
          let w = a0 === 0 ? 1 : a1 === 0 ? 0 : a0 > a1 ? 0 : a1 > a0 ? 1 : (Math.random() < 0.5 ? 0 : 1);
          if (a0 === 0 && a1 === 0) w = Math.random() < 0.5 ? 0 : 1;
          this.endRound(w, null, `Раунд за командой «${TEAM_NAMES[w]}»!`);
        }
      } else {
        if (alive.length <= 1 || timeUp) {
          let w = alive.length === 1 ? alive[0] : [...alive].sort((a, b) => (this.roundKills.get(b.id) || 0) - (this.roundKills.get(a.id) || 0) || b.hp - a.hp)[0];
          this.endRound(null, w ? w.id : null, w ? `Раунд выиграл ${w.name}!` : 'Ничья');
        }
      }
    } else if (this.mode === 'pve') {
      const humans = [...this.ps.values()].filter(p => !p.left && !p.bot);
      const allP = [...this.ps.values()].filter(p => !p.left);
      if (allP.length && allP.every(p => !p.alive) && this.lives <= 0) { this.finish(`Монстры победили на волне ${this.wave}…`, new Set()); return; }
      if (!this.queue.length && this.mons.size === 0) {
        if (this.wave >= 6) { this.finish('Все монстры побеждены! Вы — герои!', new Set([...this.ps.keys()])); return; }
        this.phase = 'roundEnd'; this.phaseT = 3;
        for (const p of this.ps.values()) { p.money = Math.min(MONEY.max, p.money + 600); }
        this.ev('roundEnd', `Волна ${this.wave} пройдена!`, -1, '');
      }
    } else if (timeUp) this.finishTimed();
  }
  finishTimed() {
    const players = [...this.ps.values()];
    if (this.team) {
      const [a, b] = this.teamScore;
      if (a === b) this.finish('Ничья!', new Set());
      else { const w = a > b ? 0 : 1; this.finish(`Победили ${TEAM_NAMES[w]}!`, new Set(players.filter(p => p.team === w).map(p => p.id))); }
    } else {
      const best = Math.max(...players.map(p => p.kills));
      const ws = players.filter(p => p.kills === best);
      this.finish(`Победил ${ws.map(p => p.name).join(' и ')}!`, new Set(ws.map(p => p.id)));
    }
  }
  matchWinner() {
    const need = this.opts.rounds;
    if (this.team) { const w = this.teamScore[0] >= need ? 0 : this.teamScore[1] >= need ? 1 : -1; if (w >= 0) this.finish(`Победили ${TEAM_NAMES[w]}! Счёт ${this.teamScore[w]}:${this.teamScore[1 - w]}`, new Set([...this.ps.values()].filter(p => p.team === w).map(p => p.id))); return w >= 0; }
    for (const [pid, s] of this.score) if (s >= need) { const p = this.ps.get(pid); this.finish(`Победил ${p.name}! Выиграно раундов: ${s}`, new Set([pid])); return true; }
    return false;
  }
  finish(text, winners) {
    if (this.over) return;
    this.over = true; this.phase = 'over';
    this.sendSnapshot();
    const rows = [...this.ps.values()].map(p => {
      const win = winners.has(p.id);
      let coins = 10 + p.kills * 2 + (win ? 20 : 0) + p.caps * 4;
      if (this.mode === 'pve') coins = 10 + Math.round(p.kills / 2) + (win ? 25 : 0) + this.wave * 2;
      return { pid: p.id, name: p.name, bot: p.bot, team: p.team, kills: p.kills, deaths: p.deaths, pts: p.pts, caps: p.caps, win, coins: p.bot ? 0 : coins, rounds: this.score.get(p.id) || 0 };
    }).sort((a, b) => (b.win - a.win) || (b.kills - a.kills));
    giveAwards(rows, this.mode === 'pve' ? [
      { name: 'Охотник на монстров', icon: 'skull', ok: r => r.kills > 0, score: r => r.kills },
      { name: 'Самый живучий', icon: 'heart', ok: () => true, score: r => -r.deaths }
    ] : [
      { name: 'Лучший стрелок', icon: 'target', ok: r => r.kills > 0, score: r => r.kills },
      { name: 'Больше всех помог', icon: 'flag', ok: r => r.caps > 0 || r.win, score: r => r.caps * 3 + (r.win ? 1 : 0) + r.kills * 0.1 },
      { name: 'Самый живучий', icon: 'heart', ok: () => true, score: r => -r.deaths + r.kills * 0.01 }
    ]);
    setTimeout(() => this.io.end({ mode: this.mode, winText: text, rows, teamScore: this.teamScore, wave: this.wave }), 1800);
  }

  // ---------- сообщения ----------
  onMsg(pid, m) {
    const p = this.ps.get(pid); if (!p || p.bot) return;
    switch (m.t) {
      case 'pos': {
        if (!p.alive) return;
        const nx = +m.x || 0, ny = +m.y || 0, nz = +m.z || 0;
        const viaPortal = m.portal && this.map.portals && this.map.portals.some(pt => Math.hypot(p.x - pt.a.x, p.z - pt.a.z) < 3 && Math.hypot(nx - pt.b.x, nz - pt.b.z) < 2);
        if (!viaPortal && Math.hypot(nx - p.x, nz - p.z) > 6 && this.t - (p.lastPos || 0) < 1) return; // слишком большой скачок
        p.x = clamp(nx, -this.map.W, this.map.W); p.y = clamp(ny, 0, 12); p.z = clamp(nz, -this.map.D, this.map.D);
        p.yaw = +m.yaw || 0; p.pitch = clamp(+m.pitch || 0, -1.5, 1.5); p.vx = +m.vx || 0; p.vz = +m.vz || 0; p.lastPos = this.t;
        if (m.anim != null) p.anim = m.anim | 0;
        p.scoped = !!m.sc; p.crouch = !!m.cr;
        break;
      }
      case 'switch': if ([p.slot1, p.slot2, 'knife', p.nades > 0 ? 'grenade' : null].includes(m.w)) { p.cur = m.w; p.reloadUntil = 0; } break;
      case 'fire': this.fire(p, m); break;
      case 'reload': this.reload(p); break;
      case 'buy': this.buy(p, m.item); break;
      case 'bready': if (this.phase === 'buy') this.buyReady.add(p.id); break;
      case 'medkit': if (p.alive && p.medkit > 0 && p.hp < 100) { p.medkit--; p.hp = Math.min(100, p.hp + 60); this.ev('heal', p.id); } break;
      case 'emo': p.animN = (p.animN + 1) & 7; p.emo = this.t; break;
    }
  }
  canBuy(p) {
    if (this.phase === 'buy' || this.phase === 'roundEnd') return true;
    if (!this.rounds && (!p.alive || this.t < p.buyWindow)) return true;
    return false;
  }
  buy(p, item) {
    if (!this.canBuy(p)) return;
    const W = WEAPONS[item], G = GEAR[item];
    const price = W ? W.price : G ? G.price : null; if (price == null) return;
    if (p.money < price) return;
    if (W) {
      if (W.slot === 1) { if (p.slot1 === item) { this.giveAmmo(p, item); } else { p.slot1 = item; this.giveAmmo(p, item); p.cur = item; } }
      else if (W.slot === 2) { p.slot2 = item; this.giveAmmo(p, item); p.cur = p.slot1 || item; }
      else if (W.slot === 4) { if (p.nades >= W.max) return; p.nades++; }
      else return;
    } else if (item === 'armor') { if (p.armor >= 100) return; p.armor = 100; }
    else if (item === 'medkit') { if (p.medkit >= 1) return; p.medkit = 1; }
    p.money -= price;
    if (!p.bot) this.io.sendTo(p.id, { t: 'bought', item });
  }
  reload(p) {
    const W = WEAPONS[p.cur], a = p.ammo[p.cur];
    if (!W || !W.mag || !a || a[0] >= W.mag || a[1] <= 0 || p.reloadUntil > this.t) return;
    p.reloadUntil = this.t + W.reload;
    p.reloadW = p.cur;
  }

  // ---------- стрельба ----------
  fire(p, m) {
    if (!p.alive || (this.phase !== 'play') || this.t < p.freezeUntil - 0.6) return;
    const w = m.w, W = WEAPONS[w]; if (!W) return;
    const has = w === 'knife' || w === p.slot1 || w === p.slot2 || (w === 'grenade' && p.nades > 0);
    if (!has) return;
    if (this.t - p.lastFire < W.rate * 0.85) return;
    if (p.reloadUntil > this.t) return;
    if (W.mag) { const a = p.ammo[w]; if (!a || a[0] <= 0) { this.reload(p); return; } a[0]--; }
    p.lastFire = this.t; p.cur = w; p.animN = (p.animN + 1) & 7; p.fired = this.t;
    p.protUntil = 0;
    const o = { x: +m.o.x, y: +m.o.y, z: +m.o.z };
    if (Math.hypot(o.x - p.x, o.z - p.z) > 3 || Math.abs(o.y - (p.y + (p.crouch ? PH.CEYE : PH.EYE))) > 3) { o.x = p.x; o.y = p.y + PH.EYE; o.z = p.z; }
    let d = { x: +m.d.x, y: +m.d.y, z: +m.d.z }; const L = Math.hypot(d.x, d.y, d.z) || 1; d.x /= L; d.y /= L; d.z /= L;
    const moving = Math.hypot(p.vx, p.vz) > 1.5 || !p.ground;
    let spread = (m.sc && W.scopeSpread != null ? W.scopeSpread : W.spread) + (moving ? W.moveSpread || 0 : 0);
    if (W.melee) { this.melee(p, o, d, W); return; }
    if (W.throw) { p.nades--; if (p.nades <= 0) p.cur = p.slot1 || p.slot2; this.throwNade(p, o, d); return; }
    if (W.proj) {
      const dd = jitter(d, spread);
      this.projs.push({ id: ++this.pid, type: W.proj, owner: p.id, x: o.x + dd.x * 0.6, y: o.y + dd.y * 0.6 - 0.15, z: o.z + dd.z * 0.6, vx: dd.x * W.speed, vy: dd.y * W.speed, vz: dd.z * W.speed, grav: W.grav || 0, life: 3, w });
      this.ev('shot', p.id, w);
      return;
    }
    const n = W.pellets || 1;
    // стрелок присылает свои лучи и в кого попал на своём экране — проверяем и засчитываем
    if (Array.isArray(m.ds) && m.ds.length === n) {
      for (let i = 0; i < n; i++) {
        const r = m.ds[i] || {}, L2 = Math.hypot(+r.x || 0, +r.y || 0, +r.z || 0) || 1;
        const dd = { x: (+r.x || 0) / L2, y: (+r.y || 0) / L2, z: (+r.z || 0) / L2 };
        if (dd.x * d.x + dd.y * d.y + dd.z * d.z < 0.9) continue; // разброс не может быть таким большим
        this.hitscan(p, o, dd, W, w, i === 0, Array.isArray(m.hs) ? m.hs[i] : null);
      }
      return;
    }
    for (let i = 0; i < n; i++) this.hitscan(p, o, jitter(d, spread), W, w, i === 0);
  }
  targets() { return [...this.ps.values()].filter(x => x.alive && !x.left).concat([...this.mons.values()].filter(x => x.alive)); }
  // проверка попадания, которое увидел стрелок (компенсация задержки сети)
  claimOk(p, o, d, W, c) {
    if (!Array.isArray(c)) return null;
    const t = this.ps.get(c[0]) || this.mons.get(c[0]), dist = +c[2];
    if (!t || !t.alive || t.left || !this.canHurt(p, t) || !(dist > 0)) return null;
    const range = W.range || 80, sc = t.scale || 1;
    if (dist > range + 2 || Math.hypot(t.x - o.x, t.z - o.z) > range + 4) return null;
    const P = { x: o.x + d.x * dist, y: o.y + d.y * dist, z: o.z + d.z * dist };
    const ty = t.y + (t.hy || 0);
    if (Math.hypot(P.x - t.x, P.z - t.z) > 2.6 * sc || P.y < ty - 0.6 || P.y > ty + 2.3 * sc) return null;
    if (rayWorld(this.map, o, d, dist).t < dist - 0.35) return null; // стена на пути
    return { t, h: { t: dist, head: !!c[1] } };
  }
  hitscan(p, o, d, W, w, showTracer, claim) {
    const wh = rayWorld(this.map, o, d, W.range || 80);
    let end = wh.t;
    const hits = [];
    const ok = this.claimOk(p, o, d, W, claim);
    if (ok) { hits.push(ok); if (!W.pierce) end = ok.h.t; }
    for (const t of this.targets()) {
      if (!this.canHurt(p, t) || (ok && ok.t === t)) continue;
      const h = rayPlayer(o, d, t.hy ? { x: t.x, y: t.y + t.hy, z: t.z } : t, end, t.scale || 1);
      if (h) hits.push({ t, h });
    }
    hits.sort((a, b) => a.h.t - b.h.t);
    const use = W.pierce ? hits : hits.slice(0, 1);
    if (!W.pierce && use[0]) end = use[0].h.t;
    for (const { t, h } of use) {
      const dist = h.t, fall = W.range ? Math.max(0.45, 1 - Math.max(0, dist - W.range * 0.5) / W.range) : 1;
      this.damage(t, W.dmg * (h.head ? (W.head || 1.5) : 1) * fall, p, { head: h.head, w, dir: d });
      if (W.slow) t.slowUntil = this.t + W.slow;
      if (W.mark) t.markUntil = this.t + W.mark;
    }
    if (showTracer) this.ev('tr', p.id, +o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2), +(o.x + d.x * end).toFixed(2), +(o.y + d.y * end).toFixed(2), +(o.z + d.z * end).toFixed(2), w, use.length ? 1 : 0);
  }
  melee(p, o, d, W) {
    let best = null, bd = W.range;
    for (const t of this.targets()) {
      if (!this.canHurt(p, t)) continue;
      const dx = t.x - p.x, dz = t.z - p.z, dist = Math.hypot(dx, dz);
      if (dist > W.range + 0.5 + (t.scale > 2 ? 1.5 : 0) || Math.abs(t.y - p.y) > 1.6) continue;
      const dot = (dx * d.x + dz * d.z) / (dist || 1) / (Math.hypot(d.x, d.z) || 1);
      if (dot < 0.4) continue;
      if (dist < bd) { bd = dist; best = t; }
    }
    this.ev('shot', p.id, 'knife');
    if (best) {
      const back = Math.cos(best.yaw || 0) * (best.x - p.x) * 0 + 0;
      this.damage(best, W.dmg, p, { w: 'knife', dir: d, knock: 4 });
    }
  }
  throwNade(p, o, d) {
    const sp = 17;
    this.projs.push({ id: ++this.pid, type: 'grenade', owner: p.id, x: o.x + d.x * 0.5, y: o.y + d.y * 0.5, z: o.z + d.z * 0.5, vx: d.x * sp, vy: d.y * sp + 3, vz: d.z * sp, grav: 22, life: WEAPONS.grenade.fuse, bounce: true, w: 'grenade' });
    this.ev('shot', p.id, 'grenade');
  }
  explode(pr, x, y, z) {
    const W = WEAPONS[pr.w], owner = this.ps.get(pr.owner) || this.mons.get(pr.owner);
    const R = W ? W.splash : 2.5;
    this.ev('boom', +x.toFixed(2), +y.toFixed(2), +z.toFixed(2), R, pr.type);
    for (const t of this.targets()) {
      const dx = t.x - x, dy = t.y + (t.hy || 0) + 0.9 - y, dz = t.z - z, dist = Math.hypot(dx, dy, dz);
      if (dist > R + 0.4) continue;
      if (owner && !this.canHurt(owner, t) && t !== owner) continue;
      if (!los(this.map, { x, y: y + 0.2, z }, { x: t.x, y: t.y + 1, z: t.z })) continue;
      const k = 1 - Math.min(1, dist / (R + 0.4)) * 0.7;
      const dmg = (W ? W.dmg : 30) * k * (t === owner ? 0.4 : 1);
      const L = dist || 1;
      this.damage(t, dmg, owner, { w: pr.w, dir: { x: dx / L, y: 0.4, z: dz / L }, knock: (W && W.knock) || 7 * k });
      if (W && W.freeze) t.freezeUntil = this.t + W.freeze;
    }
  }
  damage(t, amount, src, o = {}) {
    if (!t.alive || this.over) return;
    if (!t.mon && t.protUntil > this.t) return;
    if (src && src !== t && !this.canHurt(src, t)) return;
    let dmg = Math.round(amount);
    if (!t.mon && t.armor > 0) { const ab = Math.min(t.armor, Math.round(dmg * 0.5)); t.armor -= ab; dmg -= ab; }
    t.hp -= dmg;
    this.ev('hit', t.id, Math.round(amount), o.head ? 1 : 0, src ? src.id : '', +t.x.toFixed(2), +(t.y + (o.head ? 1.55 : 1.1) * (t.scale || 1)).toFixed(2), +t.z.toFixed(2));
    if (o.knock && o.dir) this.knock(t, o.dir.x * o.knock, Math.max(2, (o.dir.y || 0.3) * o.knock), o.dir.z * o.knock);
    if (t.hp <= 0) this.kill(t, src, o);
  }
  knock(t, vx, vy, vz) {
    if (t.mon) { t.vx += vx; t.vz += vz; return; }
    if (t.bot) { t.vx += vx; t.vy = Math.max(t.vy, vy); t.vz += vz; t.ground = false; }
    else this.io.sendTo(t.id, { t: 'kb', vx, vy, vz });
  }
  kill(t, src, o) {
    t.alive = false; t.hp = 0;
    if (t.mon) {
      this.ev('die', t.id, +t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2));
      t.removeT = 2.5;
      if (src && !src.mon) { if (this.mode === 'pve') { src.kills++; src.pts += S_MONSTERS[t.type].boss ? 10 : 1; } src.money = Math.min(MONEY.max, src.money + S_MONSTERS[t.type].money); }
      if (S_MONSTERS[t.type].boss) this.ev('msg', 'Хранитель склепа повержен!');
      return;
    }
    t.deaths++;
    this.dropFlag(t);
    this.ev('kill', src ? src.id : '', t.id, o.w || '', o.head ? 1 : 0);
    if (src && src !== t && !src.mon && this.enemies(src, t)) {
      src.kills++; src.pts++; src.money = Math.min(MONEY.max, src.money + MONEY.kill);
      this.roundKills.set(src.id, (this.roundKills.get(src.id) || 0) + 1);
      if (this.mode === 'tdm' && !this.rounds) this.teamScore[src.team]++;
    }
    if (this.rounds) { t.slot1 = null; t.armor = 0; t.nades = 0; t.slot2 = t.slot2 === 'pistol' ? 'pistol' : 'pistol'; }
    else if (this.mode === 'pve') {
      // общий запас жизней команды: пока есть — вернёшься через 12 с; нет — поднимет товарищ или новая волна
      if (this.lives > 0) { this.lives--; t.respawnT = 12; } else t.respawnT = 1e9;
    } else t.respawnT = 4;
    t.deadAt = { x: t.x, z: t.z }; t.revT = 0;
    t.buyWindow = 0;
  }

  // ---------- флаги ----------
  dropFlag(p) {
    if (!this.flags) return;
    for (const f of this.flags) if (f.carrier === p.id) { f.carrier = null; f.x = p.x; f.y = p.y; f.z = p.z; f.home = false; f.dropT = 15; this.ev('msg', `${p.name} потерял флаг!`); }
  }
  flagTick(dt) {
    for (const f of this.flags) {
      if (f.carrier) { const c = this.ps.get(f.carrier); if (c) { f.x = c.x; f.y = c.y; f.z = c.z; } continue; }
      if (!f.home) { f.dropT -= dt; if (f.dropT <= 0) { Object.assign(f, { home: true, x: f.hx, y: 0, z: f.hz }); this.ev('msg', `Флаг «${TEAM_NAMES[f.team]}» вернулся на базу`); } }
      for (const p of this.ps.values()) {
        if (!p.alive || p.left || Math.hypot(p.x - f.x, p.z - f.z) > 1.3 || Math.abs(p.y - f.y) > 1.5) continue;
        if (p.team !== f.team) { f.carrier = p.id; f.home = false; this.ev('msg', `${p.name} схватил флаг!`); break; }
        else if (!f.home) { Object.assign(f, { home: true, x: f.hx, y: 0, z: f.hz }); p.pts++; this.ev('msg', `${p.name} вернул свой флаг`); break; }
      }
    }
    for (const f of this.flags) {
      if (!f.carrier) continue;
      const c = this.ps.get(f.carrier), own = this.flags[c.team];
      if (own.home && Math.hypot(c.x - own.hx, c.z - own.hz) < 2.2) {
        this.teamScore[c.team]++; c.caps++; c.pts += 3; c.money = Math.min(MONEY.max, c.money + 800);
        Object.assign(f, { carrier: null, home: true, x: f.hx, y: 0, z: f.hz });
        this.ev('cap', c.team, c.id);
        if (this.teamScore[c.team] >= this.goal) this.finish(`Победили ${TEAM_NAMES[c.team]}!`, new Set([...this.ps.values()].filter(p => p.team === c.team).map(p => p.id)));
      }
    }
  }

  // ---------- боты ----------
  botBuy(p) {
    const lvl = this.opts.botLevel;
    const opts = ['smg', 'shotgun', 'rifle', 'paint', 'snow', 'plasma', 'sniper', 'railgun'].filter(w => WEAPONS[w].price <= p.money - (lvl > 0 ? 300 : 0));
    if (opts.length && !p.slot1) this.buy(p, pick(opts.slice(-4)));
    if (p.money >= 650 && Math.random() < 0.6) this.buy(p, 'armor');
    if (p.money >= 300 && Math.random() < 0.5) this.buy(p, 'grenade');
  }
  botThink(p, dt) {
    const ai = p.ai, lvl = this.opts.botLevel, eye = { x: p.x, y: p.y + PH.EYE, z: p.z };
    ai.t -= dt; ai.pathT -= dt;
    // цель
    let target = null, bd = 60;
    for (const t of this.targets()) {
      if (!this.enemies(p, t)) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bd && los(this.map, eye, { x: t.x, y: t.y + 1.2 * (t.scale || 1), z: t.z })) { bd = d; target = t; }
    }
    if (target !== ai.target) { ai.target = target; ai.react = [0.7, 0.45, 0.25][lvl] + rnd(0, 0.2); }
    ai.react -= dt;
    let goal = null;
    if (this.flags) {
      const my = this.flags[p.team], en = this.flags[1 - p.team];
      if (en.carrier === p.id) goal = { x: my.hx, z: my.hz };
      else if (!my.home && !my.carrier) goal = my;
      else if (!en.carrier) goal = en;
      else goal = this.ps.get(my.carrier) || this.ps.get(en.carrier);
    }
    // «Монстры»: бот бежит поднимать павшего товарища, если рядом нет врага
    if (!goal && this.mode === 'pve' && (!target || bd > 8)) {
      let dn = null, dd = 30;
      for (const o of this.ps.values()) if (!o.alive && !o.left && o.deadAt) { const d = Math.hypot(o.deadAt.x - p.x, o.deadAt.z - p.z); if (d < dd) { dd = d; dn = o; } }
      if (dn) goal = { x: dn.deadAt.x, z: dn.deadAt.z, revive: true };
    }
    if (!goal) {
      let near = null, nd = 1e9;
      for (const t of this.targets()) if (this.enemies(p, t)) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < nd) { nd = d; near = t; } }
      goal = near;
    }
    let mx = 0, mz = 0;
    const W = WEAPONS[p.cur] || WEAPONS.pistol;
    if (target) {
      // прицеливание
      const tx = target.x - eye.x, ty = target.y + (target.hy || 0) + 1.1 * (target.scale || 1) - eye.y, tz = target.z - eye.z;
      const yaw = Math.atan2(-tx, -tz), pitch = Math.atan2(ty, Math.hypot(tx, tz));
      const err = [0.09, 0.05, 0.025][lvl];
      if (ai.t <= 0) { ai.t = rnd(0.6, 1.5); ai.aimErr = rnd(-err, err); ai.strafe *= -1; }
      p.yaw = lerpAng(p.yaw, yaw + ai.aimErr, Math.min(1, dt * 8)); p.pitch += (pitch + ai.aimErr * 0.5 - p.pitch) * Math.min(1, dt * 8);
      const want = W.melee ? 1 : W.range && W.range < 25 ? 6 : 14;
      if (bd > want + 2 && !this.flags) { const st = this.followPath(p, target); mx = st.x; mz = st.z; }
      const fx = Math.sin(p.yaw + Math.PI / 2), fz = Math.cos(p.yaw + Math.PI / 2);
      mx += -fx * ai.strafe * 0.6; mz += -fz * ai.strafe * 0.6;
      if (goal && this.flags) { const st = this.followPath(p, goal); mx = mx * 0.4 + st.x; mz = mz * 0.4 + st.z; }
      // выстрел
      if (ai.react <= 0 && this.phase === 'play') {
        const a = p.ammo[p.cur];
        if (W.mag && a && a[0] <= 0) { if (!p.reloadUntil || p.reloadUntil < this.t) this.reload(p); }
        else if (this.t - p.lastFire >= W.rate * (W.auto ? 1 : 1.3) && (W.melee ? bd < 2 : bd < (W.range || 40) * 0.9)) {
          const d = { x: -Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * Math.cos(p.pitch) };
          this.fire(p, { w: p.cur, o: eye, d });
        }
        if (p.nades > 0 && bd > 8 && bd < 18 && Math.random() < dt * 0.15) { const d = { x: -Math.sin(p.yaw) * 0.9, y: 0.35, z: -Math.cos(p.yaw) * 0.9 }; p.cur = 'grenade'; this.fire(p, { w: 'grenade', o: eye, d }); }
      }
    } else if (goal) {
      const st = this.followPath(p, goal); mx = st.x; mz = st.z;
      if (Math.hypot(mx, mz) > 0.1) p.yaw = lerpAng(p.yaw, Math.atan2(-mx, -mz), Math.min(1, dt * 5));
      p.pitch *= 0.9;
      const a = p.ammo[p.cur]; if (W.mag && a && a[0] < W.mag * 0.5) this.reload(p);
    }
    if (p.cur === 'grenade' || !p.cur) p.cur = p.slot1 || p.slot2;
    return { mx, mz };
  }
  followPath(p, goal) {
    const ai = p.ai;
    if (!ai.path || ai.pathT <= 0 || !ai.goal || Math.hypot(ai.goal.x - goal.x, ai.goal.z - goal.z) > 3) {
      ai.path = navPath(this.map, p, goal) || []; ai.pathT = 1.0 + Math.random() * 0.8; ai.goal = { x: goal.x, z: goal.z };
    }
    while (ai.path.length && Math.hypot(ai.path[0].x - p.x, ai.path[0].z - p.z) < 0.8) ai.path.shift();
    const n = ai.path[0] || goal;
    const dx = n.x - p.x, dz = n.z - p.z, L = Math.hypot(dx, dz);
    return L > 0.3 ? { x: dx / L, z: dz / L } : { x: 0, z: 0 };
  }

  // ---------- монстры ----------
  waveList(n) {
    const pc = Math.max(1, [...this.ps.values()].filter(p => !p.left).length);
    const L = [], add = (t, k) => { for (let i = 0; i < k; i++) L.push(t); };
    const k = this.opts.pveDiff === 0 ? 0.7 : this.opts.pveDiff === 2 ? 1.3 : 1, A = (t, c) => add(t, Math.max(1, Math.round(c * k)));
    if (n === 1) { A('skeleton', 4 + pc * 2); A('imp', 2); }
    else if (n === 2) { A('skeleton', 4 + pc); A('zombie', 2 + pc); A('imp', 2 + pc); }
    else if (n === 3) { A('skeleton', 4); A('vampire', 2 + pc); A('ghost', 2 + (pc >> 1)); A('bat', 2); }
    else if (n === 4) { A('zombie', 3 + pc); A('vampire', 3); A('ghost', 3); A('skeleton', pc * 2); A('bat', 2 + pc); }
    else if (n === 5) { A('skeleton', 6); A('zombie', 4); A('vampire', 3 + pc); A('ghost', 4); A('imp', 4); A('bat', 3); }
    else { add('skeleton', 4); return ['boss', ...L]; }
    return shuffle(L);
  }
  spawnMonster(type, at) {
    const M = S_MONSTERS[type], s = at || pick(this.map.monsterSpawns);
    const pc = Math.max(1, [...this.ps.values()].filter(p => !p.left).length);
    const dk = [0.7, 1, 1.4][this.opts.pveDiff ?? 1] || 1; // сложность: лёгкая / обычная / трудная
    const hp = Math.round(M.hp * dk * (M.boss ? 0.5 + pc * 0.3 : 1));
    const m = { id: 'm' + (++this.mid), mon: true, type, x: s.x + rnd(-1, 1), y: 0, z: s.z + rnd(-1, 1), yaw: 0, vx: 0, vy: 0, vz: 0, ground: true, alive: true, hp, maxhp: hp, scale: M.scale,
      atkT: rnd(0.5, 1.5), animN: 0, anim: 0, ai: { path: null, pathT: 0 }, hy: M.hover || 0, dk, slamT: 6, summonT: 14, volleyT: 9, slowUntil: 0, freezeUntil: 0, markUntil: 0 };
    this.mons.set(m.id, m);
    if (M.boss) { this.bossId = m.id; this.ev('msg', 'Появился Хранитель склепа!'); }
  }
  monsterThink(m, dt) {
    const M = S_MONSTERS[m.type];
    let target = null, bd = 1e9;
    for (const p of this.ps.values()) if (p.alive && !p.left) { const d = Math.hypot(p.x - m.x, p.z - m.z) + Math.abs(p.y - m.y) * 2; if (d < bd) { bd = d; target = p; } }
    if (!target) return { mx: 0, mz: 0 };
    const dx = target.x - m.x, dz = target.z - m.z, dist = Math.hypot(dx, dz);
    m.yaw = Math.atan2(-dx, -dz);
    m.atkT -= dt;
    let mx = 0, mz = 0;
    const eye = { x: m.x, y: m.y + 1.4 * M.scale, z: m.z };
    if (M.ranged) {
      const see = los(this.map, eye, { x: target.x, y: target.y + 1.2, z: target.z });
      if (dist > 10 || !see) { const st = this.followPath(m, target); mx = st.x; mz = st.z; }
      if (see && dist < M.range && m.atkT <= 0) {
        m.atkT = M.cd; m.animN = (m.animN + 1) & 7; m.atk = this.t;
        const ty = target.y + 1.1 - eye.y, L = Math.hypot(dx, ty, dz);
        this.projs.push({ id: ++this.pid, type: 'orb', owner: m.id, x: eye.x, y: eye.y, z: eye.z, vx: dx / L * 11, vy: ty / L * 11, vz: dz / L * 11, grav: 0, life: 2.5, dmg: M.dmg });
      }
    } else {
      if (dist > M.range * 0.8) { const st = this.followPath(m, target); mx = st.x; mz = st.z; }
      if (dist < M.range + (M.boss ? 1 : 0) && Math.abs(target.y - m.y) < 1.4 && m.atkT <= 0) {
        m.atkT = M.cd; m.animN = (m.animN + 1) & 7; m.atk = this.t;
        this.damage(target, M.dmg * (m.dk || 1), m, { w: 'claw', dir: { x: dx / (dist || 1), y: 0.3, z: dz / (dist || 1) }, knock: M.boss ? 9 : 4 });
      }
    }
    if (M.boss) this.bossThink(m, dt);
    return { mx, mz };
  }
  bossThink(m, dt) {
    // три фазы: обычная → злая (залпы) → ярость (быстрее, призывает вампиров)
    const ph = m.hp > m.maxhp * 0.66 ? 1 : m.hp > m.maxhp * 0.33 ? 2 : 3;
    if (ph !== (m.phase || 1)) { m.phase = ph; this.ev('msg', ph === 2 ? 'Хранитель разозлился!' : 'Хранитель в ярости!'); this.ev('tele', +m.x.toFixed(2), +m.z.toFixed(2), 6, 0.8); }
    const enraged = ph >= 2;
    m.speedK = ph === 3 ? 1.35 : 1;
    m.slamT -= dt; m.summonT -= dt; m.volleyT -= dt;
    if (m.slamT <= 0 && !m.slam) { m.slamT = enraged ? 4.5 : 6.5; m.slam = { x: m.x, z: m.z, t: 1.1 }; this.ev('tele', +m.x.toFixed(2), +m.z.toFixed(2), 5, 1.1); }
    if (m.slam) {
      m.slam.t -= dt;
      if (m.slam.t <= 0) {
        this.ev('boom', +m.slam.x.toFixed(2), 0.3, +m.slam.z.toFixed(2), 5, 'slam');
        for (const p of this.ps.values()) if (p.alive && p.y < 1.2) { const dx = p.x - m.slam.x, dz = p.z - m.slam.z, d = Math.hypot(dx, dz); if (d < 5) this.damage(p, 40, m, { w: 'slam', dir: { x: dx / (d || 1), y: 0.8, z: dz / (d || 1) }, knock: 11 }); }
        m.slam = null;
      }
    }
    if (m.summonT <= 0) { m.summonT = m.phase === 3 ? 9 : enraged ? 11 : 15; for (let i = 0; i < 3; i++) this.spawnMonster(m.phase === 3 ? 'vampire' : 'skeleton', { x: m.x + rnd(-3, 3), z: m.z + rnd(-3, 3) }); this.ev('msg', m.phase === 3 ? 'Хранитель призвал вампиров!' : 'Хранитель призвал скелетов!'); }
    if (enraged && m.volleyT <= 0) { m.volleyT = m.phase === 3 ? 4 : 6; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.projs.push({ id: ++this.pid, type: 'bossorb', owner: m.id, x: m.x, y: 2.5, z: m.z, vx: Math.sin(a) * 9, vy: 0, vz: Math.cos(a) * 9, grav: 0, life: 3, dmg: 22 }); } }
  }

  // техника, маятники: толкают и бьют
  moverTouch(p) {
    for (const m of this.map.movers) {
      const b = m.box;
      if (!m.moving || p.y > b.y + b.h - 0.2 || p.y + PH.H < b.y) continue;
      if (Math.abs(p.x - b.x) < b.w / 2 + PH.R + 0.1 && Math.abs(p.z - b.z) < b.d / 2 + PH.R + 0.1 && this.t - (p.moverHit || 0) > 1) {
        p.moverHit = this.t;
        // толкаем по ходу движения и в сторону от центра
        const sx = m.dirX ? 0 : Math.sign(p.x - b.x) || 1, sz = m.dirZ ? 0 : Math.sign(p.z - b.z) || 1;
        const dx = m.dirX * 0.8 + sx * 0.6, dz = m.dirZ * 0.8 + sz * 0.6, L = Math.hypot(dx, dz) || 1;
        this.damage(p, m.dmg || 15, null, { w: m.blade ? 'blade' : 'mover', dir: { x: dx / L, y: 0.5, z: dz / L }, knock: m.knock || 9 });
      }
    }
  }

  // ---------- цикл ----------
  tick() {
    const now = performance.now(), dt = Math.min(0.06, (now - this.last) / 1000); this.last = now;
    if (this.over) return;
    this.t += dt; this.phaseT -= dt;
    updateDynamics(this.map, this.t);
    // закупка кончается, когда все живые люди нажали «Готов»
    if (this.phase === 'buy' && this.phaseT > 1.5) { const hum = [...this.ps.values()].filter(p => !p.bot && !p.left && p.alive); if (hum.length && hum.every(p => this.buyReady.has(p.id))) this.phaseT = 1.5; }
    if (this.phase === 'buy' && this.phaseT <= 0) { this.phase = 'play'; this.phaseT = this.rounds ? this.opts.roundTime : (this.mode === 'pve' ? 1e9 : (this.round === 1 ? this.opts.timeLimit : this.phaseT)); this.ev('go'); }
    else if (this.phase === 'roundEnd' && this.phaseT <= 0) { if (!(this.rounds && this.matchWinner())) this.startRound(false); }
    const playing = this.phase === 'play';
    // игроки
    for (const p of this.ps.values()) {
      if (p.left) continue;
      if (!p.alive) {
        if (!this.rounds && playing) { p.respawnT -= dt; if (p.respawnT <= 0) this.spawn(p); }
        continue;
      }
      if (p.reloadUntil && p.reloadUntil <= this.t) { const W = WEAPONS[p.reloadW], a = p.ammo[p.reloadW]; if (W && a) { const need = W.mag - a[0], take = Math.min(need, a[1]); a[0] += take; a[1] -= take; } p.reloadUntil = 0; }
      if (p.bot) {
        let mv = { mx: 0, mz: 0 };
        if (playing) mv = this.botThink(p, dt);
        const l = Math.hypot(mv.mx, mv.mz); if (l > 1) { mv.mx /= l; mv.mz /= l; }
        const slow = this.t < p.freezeUntil ? 0.3 : this.t < p.slowUntil ? 0.6 : 1;
        movePlayer(this.map, p, { mx: mv.mx, mz: mv.mz, speedMul: (this.flags && this.flags.some(f => f.carrier === p.id) ? 0.9 : 1) * slow }, dt);
        p.anim = Math.hypot(p.vx, p.vz) > 0.5 ? 1 : 0;
      }
      this.moverTouch(p);
    }
    // подъём товарища: постой рядом с павшим 3 секунды
    if (playing && this.mode === 'pve') {
      this.revives = [];
      for (const p of this.ps.values()) {
        if (p.alive || p.left || !p.deadAt) continue;
        const helper = [...this.ps.values()].find(h => h.alive && !h.left && Math.hypot(h.x - p.deadAt.x, h.z - p.deadAt.z) < 2.2);
        p.revT = helper ? p.revT + dt : Math.max(0, p.revT - dt * 2);
        if (p.revT > 0) this.revives.push([p.id, +(p.revT / 3).toFixed(2), helper ? helper.id : '']);
        if (p.revT >= 3) { const at = p.deadAt; this.spawn(p); Object.assign(p, { x: at.x, z: at.z, hp: 50 }); if (!p.bot) this.io.sendTo(p.id, { t: 'spawn', x: at.x, y: 0, z: at.z, yaw: p.yaw }); this.ev('msg', `${helper.name} поднял ${p.name}!`); p.deadAt = null; }
      }
    }
    // монстры (в режиме «Монстры» — волны, на кладбище — скелеты из могил)
    if (playing && this.mode !== 'pve' && this.map.hazard) {
      const hz = this.map.hazard;
      this.hazT = (this.hazT ?? hz.every * 0.6) - dt;
      if (this.hazT <= 0) {
        this.hazT = hz.every;
        if ([...this.mons.values()].filter(m => m.alive).length < hz.max) { const g = pick(hz.spawns); this.spawnMonster(hz.type, g); this.ev('rise', +g.x.toFixed(1), +g.z.toFixed(1)); }
      }
    }
    if (playing && (this.mode === 'pve' || this.mons.size)) {
      if (this.mode === 'pve' && this.queue.length) { this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnT = 0.8; this.spawnMonster(this.queue.shift()); } }
      for (const m of this.mons.values()) {
        if (!m.alive) { m.removeT -= dt; if (m.removeT <= 0) this.mons.delete(m.id); continue; }
        const M = S_MONSTERS[m.type];
        const mv = this.monsterThink(m, dt);
        const slow = this.t < m.freezeUntil ? 0.3 : this.t < m.slowUntil ? 0.6 : 1;
        movePlayer(this.map, m, { mx: mv.mx, mz: mv.mz, speedMul: M.speed / PH.SPEED * slow * (m.speedK || 1) }, dt);
        this.moverTouch(m);
      }
      // монстры не стоят друг в друге
      const ms = [...this.mons.values()].filter(m => m.alive);
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) { const a = ms[i], b = ms[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01, min = 0.4 * (a.scale + b.scale); if (d < min) { const k = (min - d) / 2; a.x -= dx / d * k; a.z -= dz / d * k; b.x += dx / d * k; b.z += dz / d * k; } }
    }
    // снаряды
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      const ox = pr.x, oy = pr.y, oz = pr.z;
      pr.vy -= (pr.grav || 0) * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt; pr.life -= dt;
      const seg = { x: pr.x - ox, y: pr.y - oy, z: pr.z - oz }, L = Math.hypot(seg.x, seg.y, seg.z) || 1e-6;
      const d = { x: seg.x / L, y: seg.y / L, z: seg.z / L };
      const wh = rayWorld(this.map, { x: ox, y: oy, z: oz }, d, L);
      let hitT = wh.b ? wh.t : null, victim = null;
      const owner = this.ps.get(pr.owner) || this.mons.get(pr.owner);
      for (const t of this.targets()) {
        if (t.id === pr.owner || (owner && !this.canHurt(owner, t))) continue;
        const h = rayPlayer({ x: ox, y: oy, z: oz }, d, t.hy ? { x: t.x, y: t.y + t.hy, z: t.z } : t, hitT ?? L, (t.scale || 1) * 1.15);
        if (h && (hitT == null || h.t < hitT)) { hitT = h.t; victim = t; }
      }
      if (pr.type === 'grenade') {
        if (hitT != null && !victim) { // отскок
          pr.x = ox + d.x * Math.max(0, hitT - 0.05); pr.y = oy + d.y * Math.max(0, hitT - 0.05); pr.z = oz + d.z * Math.max(0, hitT - 0.05);
          if (wh.axis === 1) { pr.vy = -pr.vy * 0.45; pr.vx *= 0.7; pr.vz *= 0.7; } else if (wh.axis === 0) pr.vx = -pr.vx * 0.5; else pr.vz = -pr.vz * 0.5;
          if (Math.abs(pr.vy) > 2) this.ev('bounce', +pr.x.toFixed(1), +pr.z.toFixed(1));
        }
        if (pr.life <= 0) { this.projs.splice(i, 1); this.explode(pr, pr.x, pr.y + 0.2, pr.z); }
        continue;
      }
      if (hitT != null || pr.life <= 0) {
        this.projs.splice(i, 1);
        const t = hitT ?? L, hx = ox + d.x * t, hy = oy + d.y * t, hz = oz + d.z * t;
        if (pr.type === 'plasma' || pr.type === 'snow') this.explode(pr, hx, hy, hz);
        else if (victim) this.damage(victim, pr.dmg || 15, owner, { w: pr.type, dir: d, knock: pr.type === 'bossorb' ? 6 : 2 });
        else this.ev('puff', +hx.toFixed(2), +hy.toFixed(2), +hz.toFixed(2), pr.type);
      }
    }
    if (playing && this.flags) this.flagTick(dt);
    if (playing) this.checkRound();
    this.sendT += dt; this.meT += dt;
    if (this.sendT >= 0.05) { this.sendT = 0; this.sendSnapshot(); }
    if (this.meT >= 0.1) { this.meT = 0; this.sendPrivate(); }
  }
  sendSnapshot() {
    const e = [];
    for (const p of this.ps.values()) {
      if (p.left) continue;
      let fl = 0; if (!p.alive) fl |= FL.dead; if (p.protUntil > this.t) fl |= FL.prot; if (p.markUntil > this.t) fl |= FL.mark; if (p.armor > 0) fl |= FL.armor;
      if (p.slowUntil > this.t || p.freezeUntil > this.t) fl |= FL.slow; if (this.flags && this.flags.some(f => f.carrier === p.id)) fl |= FL.carry; if (p.reloadUntil > this.t) fl |= FL.reload; if (p.scoped) fl |= FL.scoped; if (p.crouch && p.alive) fl |= FL.crouch;
      e.push([p.id, p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2), (p.anim & 15) | (p.animN << 4), Math.max(0, p.hp), fl, WIDX.indexOf(p.cur)]);
    }
    for (const m of this.mons.values()) e.push([m.id, 'm:' + m.type, +m.x.toFixed(2), +(m.y + (m.hy || 0)).toFixed(2), +m.z.toFixed(2), +m.yaw.toFixed(2), 0, (Math.hypot(m.vx, m.vz) > 0.5 ? 1 : 0) | (m.animN << 4), Math.max(0, Math.round(m.hp)), (m.alive ? 0 : FL.dead) | (m.markUntil > this.t ? FL.mark : 0), m.maxhp]);
    const s = { t: 's2', tm: +this.t.toFixed(2), ph: this.phase, tl: Math.max(0, +this.phaseT.toFixed(1)), rd: this.round, e, br: this.phase === 'buy' ? [this.buyReady.size, [...this.ps.values()].filter(p => !p.bot && !p.left && p.alive).length] : 0,
      p: this.projs.map(p => [p.id, p.type, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.vx.toFixed(1), +p.vy.toFixed(1), +p.vz.toFixed(1), p.grav || 0]), fx: this.fx };
    if (this.team) s.ts = this.teamScore;
    if (!this.team && this.rounds) s.rs = [...this.score];
    if (this.flags) s.fl = this.flags.map(f => [f.team, +f.x.toFixed(2), +f.y.toFixed(2), +f.z.toFixed(2), f.carrier || '']);
    if (this.mode === 'pve') { const b = this.bossId && this.mons.get(this.bossId); s.wave = this.wave; s.lv = this.lives; s.left = this.queue.length + [...this.mons.values()].filter(m => m.alive).length; if (b && b.alive) s.boss = [b.hp, b.maxhp, b.phase || 1]; if (this.revives && this.revives.length) s.rv = this.revives; }
    if (!this.sbT || this.t - this.sbT > 0.5) { this.sbT = this.t; s.sb = [...this.ps.values()].filter(p => !p.left).map(p => [p.id, p.kills, p.deaths, p.pts, this.score.get(p.id) || 0]); }
    this.io.broadcast(s);
    this.fx = [];
  }
  sendPrivate() {
    for (const p of this.ps.values()) {
      if (p.bot || p.left) continue;
      this.io.sendTo(p.id, { t: 'me2', hp: Math.max(0, p.hp), armor: p.armor, money: p.money, slot1: p.slot1, slot2: p.slot2, nades: p.nades, medkit: p.medkit, cur: p.cur,
        ammo: p.ammo, reload: p.reloadUntil > this.t ? +(p.reloadUntil - this.t).toFixed(1) : 0, slow: p.slowUntil > this.t ? 1 : 0, freeze: p.freezeUntil > this.t ? 1 : 0,
        alive: p.alive, resp: p.alive ? 0 : +Math.max(0, p.respawnT).toFixed(1), buy: this.canBuy(p) ? 1 : 0, rounds: this.rounds });
    }
  }
  onLeave(pid) { const p = this.ps.get(pid); if (p) { p.left = true; this.dropFlag(p); } }
  onJoin(pid) { const p = this.ps.get(pid); if (p) { p.left = false; if (p.alive) this.io.sendTo(pid, { t: 'spawn', x: p.x, y: p.y, z: p.z, yaw: p.yaw }); } }
}
function jitter(d, s) {
  if (!s) return d;
  const x = d.x + rnd(-s, s), y = d.y + rnd(-s, s), z = d.z + rnd(-s, s), L = Math.hypot(x, y, z);
  return { x: x / L, y: y / L, z: z / L };
}
function lerpAng(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
