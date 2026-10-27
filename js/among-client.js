// Клиент «Найди предателя» (Among Us): отображение, интерфейс, кнопки.
import { $, $$, esc, clamp, PHRASES } from './util.js';
import { icon } from './icons.js';
import { Avatar } from './render.js';
import { TASKS, SAB, castRay, lineOfSight, roomAtPos, T, applyMapText } from './amap.js';
import { BASE, FLAG, DEFAULT_OPTS } from './among-sim.js';
import { Input } from './input.js';
import { Sound } from './sound.js';
import * as Tasks from './among-tasks.js';

const vib = p => { if (window.__prefs && !window.__prefs.vibe) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
const thumb = m => `assets/thumbs/${m}.png`;
const SUBS = {
  sheriff: { name: 'Шериф', icon: 'sheriff', desc: 'Можешь выбить предателя. Но если ошибёшься — выбьешь себя.' },
  engineer: { name: 'Инженер', icon: 'engineer', desc: 'Можешь прыгать в люки, как предатель (до 15 секунд).' },
  scientist: { name: 'Учёный', icon: 'scientist', desc: 'В любой момент смотришь, кто жив, а кто нет (кнопка сверху).' },
  angel: { name: 'Ангел-хранитель', icon: 'angel', desc: 'Когда станешь призраком — сможешь защищать игроков от выбивания.' },
  shapeshifter: { name: 'Оборотень', icon: 'shapeshifter', desc: 'Можешь на 20 секунд превратиться в другого игрока.' }
};
export function amBanner(html, cls = '', ms = 2600) {
  const b = $('#am-banner'); const d = document.createElement('div'); d.className = 'bn ' + cls; d.innerHTML = html; b.appendChild(d);
  setTimeout(() => d.classList.add('out'), ms); setTimeout(() => d.remove(), ms + 500);
}

export class AmongClient {
  constructor(ctx) {
    this.ctx = ctx; this.view = ctx.view; this.map = ctx.view.map; this.me = ctx.myPid; this.roster = ctx.roster;
    applyMapText(this.map); Tasks.setTheme(this.map.theme);
    this.opts = { ...DEFAULT_OPTS, ...(ctx.opts || {}) };
    this.role = 'crew'; this.sub = null; this.mates = []; this.tasks = []; this.alive = true; this.pv = {};
    this.st = null; this.bodyAv = new Map(); this.appearance = new Map(); this.lastAnim = new Map();
    this.closed = new Set(); this.overlay = null; this.vitalsBattery = 10; this.vitalsCd = 0;
    this.stepT = 0; this.lastDoors = '';
    this.canvas = $('#am-vision'); this.g = this.canvas.getContext('2d');
    this.view.onFrame = dt => this.frame(dt);
    this.bindUI();
    this.iv = setInterval(() => this.tick(), 50);
    Input.onKeyGame = a => this.key(a);
    Sound.loop('ambient', 0.25);
  }
  dispose() {
    clearInterval(this.iv); clearInterval(this.meetIv); Tasks.close(true); this.closeOverlay();
    Input.onKeyGame = null; this.view.onFrame = null; Sound.siren(false); Sound.stopLoops();
    ['#am-meeting', '#am-intro', '#am-killscr', '#am-eject', '#am-pick', '#am-splash'].forEach(s => $(s).className = '');
  }
  info(pid) { return this.roster.get(pid) || { name: '?', model: 'character-a' }; }
  bindUI() {
    const on = (id, fn) => { const b = $(id); b.onclick = e => { e.stopPropagation(); fn(); }; b.onpointerdown = e => e.stopPropagation(); };
    on('#am-use', () => this.use());
    on('#am-report', () => this.ctx.send({ t: 'report' }));
    on('#am-kill', () => this.ctx.send({ t: 'kill', target: this.killTarget }));
    on('#am-ventbtn', () => this.ventAction());
    on('#am-sabbtn', () => this.openMap(true));
    on('#am-shift', () => this.pv.shift ? this.ctx.send({ t: 'shift' }) : this.pick('Превратиться в…', true, id => this.ctx.send({ t: 'shift', target: id })));
    on('#am-protect', () => this.pick('Кого защитить?', false, id => this.ctx.send({ t: 'protect', target: id })));
    on('#am-emo', () => this.ctx.send({ t: 'emo', v: Math.random() < 0.5 ? 1 : 0 }));
    on('#am-mini', () => this.overlay === 'map' ? this.closeOverlay() : this.openMap(false));
    on('#am-map', () => this.overlay === 'map' ? this.closeOverlay() : this.openMap(false));
    on('#am-vitals', () => this.overlay === 'vitals' ? this.closeOverlay() : this.openVitals());
    on('#am-tasks-tg', () => $('#am-tasks').classList.toggle('open'));
    on('#am-ov-close', () => this.closeOverlay());
    $('#am-tasks').onpointerdown = e => e.stopPropagation();
  }
  key(a) {
    if (a === 'sup') { if (this.killTarget) a = 'kill'; else a = 'use'; }
    if (a === 'board') a = 'map';
    if (a === 'use') this.use();
    else if (a === 'kill') this.ctx.send({ t: 'kill', target: this.killTarget });
    else if (a === 'rep') this.ctx.send({ t: 'report' });
    else if (a === 'vent') this.ventAction();
    else if (a === 'map') this.overlay === 'map' ? this.closeOverlay() : this.openMap(this.role === 'impostor');
    else if (a === 'emo') this.ctx.send({ t: 'emo', v: 1 });
    else if (a === 'esc') { if (Tasks.isOpen()) Tasks.close(); else this.closeOverlay(); }
  }
  tick() {
    const busy = Tasks.isOpen() || this.overlay || (this.st && this.st.ph !== 'play') || this.pv.vent;
    const mv = busy ? { x: 0, z: 0 } : Input.getMove();
    this.ctx.send({ t: 'i', mx: +mv.x.toFixed(2), mz: +mv.z.toFixed(2) });
    if (this.vitalsCd > 0) this.vitalsCd -= 0.05;
    if (this.overlay === 'vitals' && this.sub === 'scientist') { this.vitalsBattery -= 0.05; if (this.vitalsBattery <= 0) { this.closeOverlay(); this.vitalsCd = 15; } }
    else if (this.vitalsBattery < 10 && this.vitalsCd <= 0) this.vitalsBattery = 10;
    this.hud();
  }
  onMsg(m) {
    switch (m.t) {
      case 'role': this.role = m.role; this.sub = m.sub; this.mates = m.mates; this.tasks = m.tasks; this.opts = { ...this.opts, ...m.opts }; this.alive = m.alive; this.intro(); this.renderTasks(); this.restyle(); break;
      case 'me': this.pv = m; break;
      case 'as': this.state(m); break;
      case 'taskok': this.tasks = m.tasks; this.renderTasks(); break;
      case 'killed': this.killedScreen(m); break;
      case 'toast': amBanner(esc(m.text), 'small'); break;
      case 'meet': this.openMeeting(m); break;
      case 'votenow': this.meetStage = 'vote'; this.meetEnds = performance.now() + m.left * 1000; Sound.play('j_start', { vol: 0.5 }); this.renderMeeting(); break;
      case 'voted': this.voted.add(m.pid); Sound.play('pop', { vol: 0.6 }); this.renderMeeting(); break;
      case 'voteres': this.voteResult(m); break;
      case 'chat': this.addChat(m); break;
    }
  }

  // ---------- состояние ----------
  meta(pid, ghost, asPid) {
    const r = this.info(asPid || pid), real = this.info(pid);
    const mate = this.role === 'impostor' && (this.mates.includes(pid) || pid === this.me) && this.role === 'impostor';
    return { model: ghost ? 'grave/character-ghost' : r.model, hat: ghost ? 'halo' : r.hat, aura: ghost ? 'none' : r.aura, name: ghost ? real.name : r.name,
      me: pid === this.me, scale: 1.3, ring: pid === this.me ? '#ffd166' : null, nameColor: mate && !ghost ? '#ff4d5e' : '#fff' };
  }
  restyle() { for (const [id, a] of this.view.ents) a.dispose(); this.view.ents.clear(); this.appearance.clear(); }
  state(s) {
    const v = this.view, prev = this.st;
    this.st = s;
    this.closed = new Set(s.doors);
    const dk = s.doors.join(',');
    if (dk !== this.lastDoors) { if (s.doors.length > this.lastDoors.split(',').filter(Boolean).length) Sound.play('door_close', { vol: 0.6 }); else Sound.play('door_open', { vol: 0.5 }); this.lastDoors = dk; }
    v.setDoors(s.doors);
    if (prev && prev.ph !== 'play' && s.ph === 'play') { $('#am-meeting').className = ''; $('#am-eject').className = ''; }
    const meRow = s.e.find(r => r[0] === this.me);
    if (meRow) this.alive = !!(meRow[5] & FLAG.alive);
    const seen = new Set();
    let scanning = false;
    for (const [id, x, z, rot, anim, fl, as] of s.e) {
      seen.add(id);
      const ghost = !(fl & FLAG.alive), key = (ghost ? 'g' : 'a') + (as || id);
      let a = v.ents.get(id);
      if (a && this.appearance.get(id) !== key) { v.removeEnt(id); a = null; if (!ghost && prev) v.fx.burst(x, 1, z, '#c9b6ff', 14, 3, 0.12, 0.6); }
      if (!a) { a = new Avatar(this.meta(id, ghost, as)); v.scene.add(a.root); v.ents.set(id, a); a.setTarget(x, z, rot); a.snap(); this.appearance.set(id, key); if (ghost) a.setAlpha(0.5); }
      a.setTarget(x, z, rot); a.fl = fl; a.isGhost = ghost;
      if (this.lastAnim.get(id) !== anim) { this.lastAnim.set(id, anim); a.play(anim & 15, true); }
      if (fl & FLAG.scan) scanning = true;
    }
    v.scanning = scanning;
    for (const id of [...v.ents.keys()]) if (!seen.has(id)) v.removeEnt(id);
    const bseen = new Set();
    for (const [pid, x, z, rot] of s.b) {
      bseen.add(pid);
      if (!this.bodyAv.has(pid)) {
        const r = this.info(pid);
        const b = new Avatar({ model: r.model, hat: r.hat, label: false, scale: 1.3 });
        b.setTarget(x, z, rot); b.snap(); b.play(5, true); b.ch.mixer.update(3);
        v.scene.add(b.root); this.bodyAv.set(pid, b);
      }
    }
    for (const [pid, b] of this.bodyAv) if (!bseen.has(pid)) { b.dispose(); this.bodyAv.delete(pid); }
    // события
    const me = v.ents.get(this.me);
    const heard = (x, z) => me && Math.hypot(me.x - x, me.z - z) < 14;
    for (const f of s.fx) {
      if (f[0] === 'kill') { if (this.canSee(f[1], f[2])) { v.fx.burst(f[1], 0.8, f[2], '#ff4d5e', 16, 4, 0.12, 0.7); } if (heard(f[1], f[2])) Sound.at('kill', f[1] - me.x, f[2] - me.z, 14); }
      if (f[0] === 'vent') { const vent = this.map.vents.find(x => Math.abs(x.x - f[1]) < 0.1 && Math.abs(x.z - f[2]) < 0.1); if (vent) v.ventAnim(vent.id); if (heard(f[1], f[2])) Sound.at('vent', f[1] - me.x, f[2] - me.z, 12); }
      if (f[0] === 'sab') { Sound.play(f[1] === 'lights' ? 'lights' : f[1] === 'comms' ? 'glitch' : 'error'); amBanner(`${icon(SAB[f[1]].icon)} ${SAB[f[1]].name}!`, 'bad big'); vib([100, 60, 100]); }
      if (f[0] === 'sabfix') { Sound.play('confirm'); amBanner(`${icon('check')} Саботаж устранён`, 'good'); }
      if (f[0] === 'shield') v.fx.ringPulse(f[1], f[2], '#7cc4ff', 0.5, 2, 0.6);
      if (f[0] === 'shift') { v.fx.burst(f[1], 1, f[2], '#c9b6ff', 16, 3, 0.12, 0.6); }
      if (f[0] === 'msg') amBanner(esc(f[1]), 'small');
    }
    const crit = s.sab && SAB[s.sab.type].critical;
    Sound.siren(!!crit && s.ph === 'play');
    if (!prev || (prev.sab && !s.sab) || (!prev.sab && s.sab) || (prev.sab && s.sab && prev.sab.type !== s.sab.type)) this.renderTasks();
  }
  visionR() {
    if (!this.alive) return 99;
    let r = BASE.vision * (this.role === 'impostor' ? this.opts.impVision : this.opts.crewVision);
    if (this.st && this.st.sab && this.st.sab.type === 'lights' && this.role !== 'impostor') r *= 0.32;
    return r;
  }
  canSee(x, z) {
    const me = this.view.ents.get(this.me); if (!me) return false;
    if (!this.alive) return true;
    const R = this.visionR();
    return Math.hypot(me.x - x, me.z - z) < R + 0.3 && lineOfSight(this.map, me.x, me.z, x, z, this.closed);
  }

  // ---------- кадр: обзор, видимость, стрелки ----------
  frame(dt) {
    const v = this.view, me = v.ents.get(this.me), c = this.canvas, g = this.g;
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    g.clearRect(0, 0, c.width, c.height);
    const camsOn = this.overlay === 'cams';
    for (const [id, a] of v.ents) {
      let vis;
      if (id === this.me) vis = true;
      else if (camsOn) vis = !a.isGhost && !(a.fl & FLAG.vent);
      else if (a.isGhost) vis = !this.alive;
      else if (a.fl & FLAG.vent) vis = false;
      else vis = !me || this.canSee(a.x, a.z);
      a.setVisible(vis);
    }
    for (const b of this.bodyAv.values()) b.setVisible(camsOn || this.canSee(b.x, b.z));
    if (me && this.pv.vent) me.setAlpha(0.35); else if (me && this.alive) me.setAlpha(1);
    // темнота вокруг
    if (me && this.alive && !camsOn && this.st && this.st.ph === 'play') {
      const R = this.visionR(), N = 160, pts = [];
      for (let i = 0; i < N; i++) {
        const ang = i / N * Math.PI * 2, d = castRay(this.map, me.x, me.z, ang, R, this.closed) + 0.3;
        pts.push(v.worldToScreen(me.x + Math.cos(ang) * d, 0.8, me.z + Math.sin(ang) * d));
      }
      const cs = v.worldToScreen(me.x, 0.8, me.z), es = v.worldToScreen(me.x + R, 0.8, me.z), rpx = Math.abs(es.x - cs.x);
      g.fillStyle = 'rgba(3,3,12,0.94)'; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-out';
      const grad = g.createRadialGradient(cs.x, cs.y, rpx * 0.55, cs.x, cs.y, rpx * 1.05);
      grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = grad;
      g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    // шаги
    if (me && this.st && this.st.ph === 'play' && !this.pv.vent) {
      const mv = Input.getMove();
      if ((mv.x || mv.z) && !Tasks.isOpen() && !this.overlay) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = 0.32; Sound.play('step' + (Math.random() * 5 | 0), { vol: 0.25, vary: true }); } }
    }
    this.arrows(me);
    this.miniMap(me);
  }
  // маленькая карта в углу: комнаты, ты и задания
  miniMap(me) {
    const cv = $('#am-mini'), m = this.map; if (!cv || !m) return;
    const now = performance.now(); if (now - (this.mmT || 0) < 150) return; this.mmT = now;
    const W = cv.clientWidth; if (!W) return;
    const k = W / m.GW, H = Math.round(m.GH * k);
    if (!this.mmBase || this.mmBase.W !== W || this.mmBase.m !== m) {
      cv.style.height = H + 'px'; cv.width = W * 2; cv.height = H * 2;
      const b = document.createElement('canvas'); b.width = W * 2; b.height = H * 2; const g = b.getContext('2d'); g.scale(2, 2);
      for (let y = 0; y < m.GH; y++) for (let x = 0; x < m.GW; x++) { const v = m.grid[y * m.GW + x]; if (!v) continue; g.fillStyle = v === 2 ? '#3d4370' : '#5a6198'; g.fillRect(x * k, y * k, k + 0.5, k + 0.5); }
      this.mmBase = { W, m, c: b };
    }
    const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(this.mmBase.c, 0, 0); g.scale(2, 2);
    const tx = x => (x / T + m.GW / 2) * k, tz = z => (z / T + m.GH / 2) * k, r = Math.max(2.5, k * 0.7);
    for (const d of this.closed) { for (let i = 0; i < m.doorAt.length; i++) if (m.doorAt[i] === d) { g.fillStyle = '#ff4d5e'; g.fillRect((i % m.GW) * k, Math.floor(i / m.GW) * k, k + 0.5, k + 0.5); } }
    const comms = this.st && this.st.sab && this.st.sab.type === 'comms';
    if (!comms && this.tasks) for (const t of this.tasks) if (t.step < t.steps.length) { const s = m.stations[t.steps[t.step]]; g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(tx(s.x), tz(s.z), r * 0.8, 0, 7); g.fill(); }
    if (this.st && this.st.sab) for (const f of SAB[this.st.sab.type].fix) { if (this.st.sab.done.includes(f)) continue; const s = m.stations[f]; if (Math.floor(now / 300) % 2) { g.fillStyle = '#ff4d5e'; g.beginPath(); g.arc(tx(s.x), tz(s.z), r, 0, 7); g.fill(); } }
    if (me) { g.fillStyle = '#3ee0c0'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(tx(me.x), tz(me.z), r * 1.1, 0, 7); g.fill(); g.stroke(); }
  }
  arrows(me) {
    const box = $('#am-arrows');
    if (!me || !this.st || !this.st.sab || this.st.ph !== 'play' || this.overlay) { if (box.innerHTML) box.innerHTML = ''; return; }
    const s = SAB[this.st.sab.type];
    let html = '';
    for (const f of s.fix) {
      if (this.st.sab.done.includes(f)) continue;
      const stn = this.map.stations[f], p = this.view.worldToScreen(stn.x, 1, stn.z);
      const cx = innerWidth / 2, cy = innerHeight / 2, m = 46;
      if (p.x > m && p.x < innerWidth - m && p.y > m && p.y < innerHeight - m) continue;
      const ang = Math.atan2(p.y - cy, p.x - cx);
      const k = Math.min((innerWidth / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (innerHeight / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
      html += `<div class="am-arrow" style="left:${cx + Math.cos(ang) * k}px;top:${cy + Math.sin(ang) * k}px;transform:translate(-50%,-50%) rotate(${ang}rad)"></div>`;
    }
    box.innerHTML = html;
  }

  // ---------- кнопки ----------
  myStation() {
    const me = this.view.ents.get(this.me); if (!me) return null;
    const near = st => { const s = this.map.stations[st]; return s && Math.hypot(s.x - me.x, s.z - me.z) < 2.8 ? s : null; };
    if (this.st && this.st.sab && this.alive) { const s = SAB[this.st.sab.type]; for (const f of s.fix) if (!this.st.sab.done.includes(f) && near(f)) return { kind: 'fix', st: f, s }; }
    if (this.role === 'crew' || this.alive) {
      for (const t of this.tasks) if (t.step < t.steps.length) { const st = t.steps[t.step]; if (near(st) && (this.role === 'crew' || this.alive)) return { kind: 'task', st, task: t }; }
    }
    if (this.alive && near('button')) return { kind: 'button' };
    if (near('cams')) return { kind: 'cams' };
    if (near('admin')) return { kind: 'admin' };
    return null;
  }
  hud() {
    const s = this.st; if (!s) return;
    const play = s.ph === 'play', me = this.view.ents.get(this.me);
    // полоска заданий
    const tb = $('#am-taskbar');
    tb.style.display = s.prog < 0 ? 'none' : '';
    if (s.prog >= 0) $('#am-taskbar i').style.width = (s.prog * 100) + '%';
    // комната
    if (me) { const r = roomAtPos(this.map, me.x, me.z); const t = r ? r.name : 'Коридор'; if ($('#am-room').textContent !== t) $('#am-room').textContent = t; }
    // саботаж
    const sa = $('#am-sab');
    if (s.sab && play) {
      const S = SAB[s.sab.type];
      let txt = `${icon(S.icon)} ${S.name}`;
      if (S.critical) txt += ` <b>${Math.ceil(s.sab.t)}</b>`;
      if (s.sab.type === 'o2') txt += ` <small>${s.sab.done.length}/2</small>`;
      if (s.sab.type === 'reactor') txt += ` <small>${s.sab.holds.length}/2</small>`;
      if (sa.innerHTML !== txt) sa.innerHTML = txt;
      sa.className = 'show' + (S.critical ? ' crit' : '');
    } else sa.className = '';
    // кнопки
    const set = (id, show, on, label, extra) => {
      const b = $(id); b.style.display = show ? '' : 'none'; if (!show) return;
      b.classList.toggle('on', !!on); b.disabled = !on;
      if (label != null) { const sm = b.querySelector('small'); if (sm.textContent !== label) sm.textContent = label; }
      if (extra) b.dataset.cd = extra; else delete b.dataset.cd;
    };
    const ctxS = play && !this.pv.vent ? this.myStation() : null;
    const useInfo = !ctxS ? ['use', 'Действие'] : ctxS.kind === 'task' ? [TASKS[ctxS.task.id].icon, 'Задание'] : ctxS.kind === 'fix' ? ['wrench', 'Починить'] : ctxS.kind === 'button' ? ['alarm', 'Тревога'] : ctxS.kind === 'cams' ? ['camera', 'Камеры'] : ['admin', 'Админ'];
    const ub = $('#am-use');
    if (ub.dataset.ic !== useInfo[0]) { ub.dataset.ic = useInfo[0]; ub.querySelector('span').innerHTML = icon(useInfo[0]); }
    let useOn = !!ctxS;
    if (ctxS && ctxS.kind === 'button') useOn = this.pv.meetLeft > 0 && s.mcd <= 0 && !(s.sab && SAB[s.sab.type].critical);
    if (ctxS && (ctxS.kind === 'cams' || ctxS.kind === 'admin') && s.sab && s.sab.type === 'comms') useOn = false;
    set('#am-use', true, useOn, ctxS && ctxS.kind === 'button' && s.mcd > 0 ? Math.ceil(s.mcd) + 'с' : useInfo[1]);
    const nearBody = play && this.alive && me && [...this.bodyAv.values()].some(b => Math.hypot(b.x - me.x, b.z - me.z) < 3 && lineOfSight(this.map, me.x, me.z, b.x, b.z, this.closed));
    set('#am-report', this.alive, nearBody, 'Сообщить');
    // выбить
    const killer = this.alive && (this.role === 'impostor' || this.sub === 'sheriff');
    this.killTarget = null;
    if (killer && play && me && !this.pv.vent) {
      const range = BASE.killDist[this.opts.killDist] || 2.1; let bd = range;
      for (const [id, a] of this.view.ents) {
        if (id === this.me || a.isGhost || (a.fl & FLAG.vent) || (this.role === 'impostor' && this.mates.includes(id))) continue;
        const d = Math.hypot(a.x - me.x, a.z - me.z);
        if (d < bd && lineOfSight(this.map, me.x, me.z, a.x, a.z, this.closed)) { bd = d; this.killTarget = id; }
      }
    }
    set('#am-kill', killer, this.killTarget && this.pv.kill <= 0, this.pv.kill > 0 ? Math.ceil(this.pv.kill) + 'с' : 'Выбить');
    // люк
    const venter = this.alive && (this.role === 'impostor' || this.sub === 'engineer');
    const nearVent = me && this.map.vents.some(vt => Math.hypot(vt.x - me.x, vt.z - me.z) < 1.6);
    set('#am-ventbtn', venter, play && (this.pv.vent || (nearVent && !(this.sub === 'engineer' && this.pv.ventCd > 0))), this.pv.vent ? 'Выйти' : this.sub === 'engineer' && this.pv.ventCd > 0 ? Math.ceil(this.pv.ventCd) + 'с' : 'Люк');
    set('#am-sabbtn', this.role === 'impostor', play, s.scd > 0 ? Math.ceil(s.scd) + 'с' : 'Саботаж');
    set('#am-shift', this.sub === 'shapeshifter' && this.alive, play && (this.pv.shift || this.pv.shiftCd <= 0), this.pv.shift ? Math.ceil(this.pv.shiftT) + 'с' : this.pv.shiftCd > 0 ? Math.ceil(this.pv.shiftCd) + 'с' : 'Облик');
    set('#am-protect', this.sub === 'angel' && !this.alive, play && this.pv.angelCd <= 0, this.pv.angelCd > 0 ? Math.ceil(this.pv.angelCd) + 'с' : 'Защита');
    set('#am-emo', this.alive, play, 'Эмоция');
    $('#am-vitals').style.display = this.sub === 'scientist' ? '' : 'none';
    // интерфейс люка
    this.ventUI();
    if (Tasks.isOpen() && play) {
      const cur = Tasks.current();
      const still = ctxS && ((ctxS.kind === 'task' || ctxS.kind === 'fix') && cur.st === ctxS.st);
      if (!still && cur.st) Tasks.close();
    }
    if (!play && Tasks.isOpen()) Tasks.close();
    if (!play && this.overlay) this.closeOverlay();
  }
  use() {
    if (!this.st || this.st.ph !== 'play' || Tasks.isOpen()) return;
    const c = this.myStation(); if (!c) return;
    if (c.kind === 'button') { Sound.play('j_meeting'); this.ctx.send({ t: 'button' }); return; }
    if (c.kind === 'cams') { if (this.st.sab && this.st.sab.type === 'comms') return; this.openCams(); return; }
    if (c.kind === 'admin') { if (this.st.sab && this.st.sab.type === 'comms') return; this.openMap(false, true); return; }
    if (c.kind === 'fix') {
      const S = c.s;
      Tasks.open({ title: S.name, icon: S.icon, game: S.game, sab: true,
        onHold: v => this.ctx.send({ t: 'hold', st: c.st, v: v ? 1 : 0 }),
        onDone: () => this.ctx.send({ t: 'fix', st: c.st }) });
      Tasks.current().st = c.st;
      return;
    }
    const t = c.task, def = TASKS[t.id];
    const stepText = t.steps.length > 1 ? `Шаг ${t.step + 1} из ${t.steps.length}` : '';
    this.ctx.send({ t: 'busy', st: def.game === 'scan' ? 'scan' : c.st });
    Tasks.open({ title: def.name, icon: def.icon, game: def.game, stepText,
      onDone: () => {
        this.ctx.send({ t: 'busy', st: null });
        if (this.role === 'impostor') { t.step++; this.renderTasks(); }
        else this.ctx.send({ t: 'task', st: c.st });
      },
      onClose: () => this.ctx.send({ t: 'busy', st: null }) });
    Tasks.current().st = c.st;
  }
  ventAction() {
    if (!this.st || this.st.ph !== 'play') return;
    if (this.pv.vent) this.ctx.send({ t: 'vent', a: 'exit' }); else this.ctx.send({ t: 'vent', a: 'enter' });
  }
  ventUI() {
    const box = $('#am-vent');
    if (!this.pv.vent || !this.st || this.st.ph !== 'play') { if (box.className) { box.className = ''; box.innerHTML = ''; } return; }
    if (box.dataset.v === this.pv.vent && box.className) return;
    box.dataset.v = this.pv.vent; box.className = 'show';
    const cur = this.map.vents.find(v => v.id === this.pv.vent);
    box.innerHTML = cur.to.map(id => {
      const t = this.map.vents.find(v => v.id === id), ang = Math.atan2(t.z - cur.z, t.x - cur.x);
      return `<button class="vent-go" data-to="${id}" style="left:calc(50% + ${Math.cos(ang) * 150}px);top:calc(50% + ${Math.sin(ang) * 110}px)"><i style="transform:rotate(${ang}rad)"></i><span>${esc(t.roomName)}</span></button>`;
    }).join('') + `<div class="vent-hint">Ты в люке. Выбери, куда ползти, или нажми «Выйти»</div>`;
    box.querySelectorAll('.vent-go').forEach(b => { b.onpointerdown = e => e.stopPropagation(); b.onclick = () => { Sound.play('vent', { vol: 0.5 }); this.ctx.send({ t: 'vent', a: 'move', to: b.dataset.to }); }; });
  }

  // ---------- задания ----------
  renderTasks() {
    const comms = this.st && this.st.sab && this.st.sab.type === 'comms';
    const list = comms ? `<li class="warn">${icon('comms')} Связь сломана — задания не видны</li>` : this.tasks.map(t => {
      const d = TASKS[t.id], done = t.step >= t.steps.length;
      const st = !done && this.map.stations[t.steps[t.step]];
      const prog = t.steps.length > 1 ? ` (${Math.min(t.step, t.steps.length)}/${t.steps.length})` : '';
      return `<li class="${done ? 'done' : t.step > 0 ? 'part' : ''}">${esc(st ? st.roomName : '')}${st ? ': ' : ''}${d.name}${prog}</li>`;
    }).join('');
    const sabLine = this.st && this.st.sab && !comms ? `<li class="warn">${icon(SAB[this.st.sab.type].icon)} ${SAB[this.st.sab.type].name}</li>` : '';
    $('#am-tasks ul').innerHTML = (this.role === 'impostor' ? `<li class="fake">${icon('impostor')} Ложные задания — притворяйся!</li>` : '') + sabLine + list;
    const done = this.tasks.filter(t => t.step >= t.steps.length).length;
    $('#am-tasks-tg').innerHTML = `${icon('task')} Задания ${done}/${this.tasks.length}`;
  }

  // ---------- оверлеи: карта, админ, камеры, показатели ----------
  closeOverlay() {
    if (!this.overlay) return;
    if (this.overlay === 'cams') this.view.setCams(null);
    this.overlay = null; $('#am-ov').className = ''; $('#am-ov-body').innerHTML = '';
    clearInterval(this.ovIv);
  }
  openOverlay(kind, title) {
    Tasks.close(); this.closeOverlay();
    this.overlay = kind; $('#am-ov').className = 'show ' + kind; $('#am-ov-title').innerHTML = title;
    Sound.play('open', { vol: 0.6 });
  }
  openCams() {
    this.openOverlay('cams', `${icon('camera')} Камеры наблюдения`);
    this.view.setCams(this.map.cams);
    $('#am-ov-body').innerHTML = `<div class="cam-grid">${this.map.cams.map(c => `<div class="cam-cell"><span class="rec"></span>${esc(c.name)}</div>`).join('')}</div>`;
  }
  openVitals() {
    if (this.sub !== 'scientist' || this.vitalsCd > 0) { if (this.vitalsCd > 0) amBanner(`Батарея заряжается: ${Math.ceil(this.vitalsCd)}с`, 'small'); return; }
    this.openOverlay('vitals', `${icon('vitals')} Показатели жизни`);
    const draw = () => {
      if (this.overlay !== 'vitals') return;
      const alive = new Map((this.st ? this.st.e : []).map(r => [r[0], !!(r[5] & FLAG.alive)]));
      $('#am-ov-body').innerHTML = `<div class="vitals"><div class="batt"><i style="width:${this.vitalsBattery * 10}%"></i></div>${[...this.roster.values()].map(r => {
        const a = alive.get(r.pid); const st = a === undefined ? 'left' : a ? 'ok' : 'dead';
        return `<div class="vit ${st}"><img src="${thumb(r.model)}"><b>${esc(r.name)}</b><svg viewBox="0 0 100 20"><polyline points="${st === 'ok' ? '0,10 30,10 38,2 46,18 54,10 100,10' : '0,10 100,10'}"/></svg><span>${st === 'ok' ? 'Жив' : st === 'dead' ? 'Выбит' : 'Вышел'}</span></div>`;
      }).join('')}</div>`;
    };
    draw(); this.ovIv = setInterval(draw, 500);
  }
  openMap(sabMode, admin) {
    this.openOverlay(admin ? 'admin' : 'map', admin ? `${icon('admin')} Админ — кто где` : sabMode ? `${icon('sabotage')} Саботаж` : `${icon('map')} Карта`);
    const m = this.map;
    $('#am-ov-body').innerHTML = `<div class="mm-wrap"><canvas id="mm"></canvas><div id="mm-btns"></div></div>${sabMode ? '<div class="sab-row" id="sab-row"></div>' : ''}`;
    const cv = $('#mm'), wrap = cv.parentElement;
    const draw = () => {
      if (!this.overlay || (this.overlay !== 'map' && this.overlay !== 'admin')) return;
      const W = wrap.clientWidth, H = wrap.clientHeight;
      const k = Math.min(W / m.GW, H / m.GH), ox = (W - m.GW * k) / 2, oy = (H - m.GH * k) / 2;
      cv.width = W * 2; cv.height = H * 2; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const g = cv.getContext('2d'); g.scale(2, 2);
      const tx = x => ox + (x / T + m.GW / 2) * k, tz = z => oy + (z / T + m.GH / 2) * k;
      for (let y = 0; y < m.GH; y++) for (let x = 0; x < m.GW; x++) {
        const v = m.grid[y * m.GW + x]; if (!v) continue;
        g.fillStyle = v === 2 ? '#3d4370' : '#5a6198';
        if (m.doorAt[y * m.GW + x] >= 0 && this.closed.has(m.doorAt[y * m.GW + x])) g.fillStyle = '#ff4d5e';
        g.fillRect(ox + x * k, oy + y * k, k + 0.5, k + 0.5);
      }
      g.font = `700 ${Math.max(9, k * 0.75)}px Rubik,sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.85)';
      for (const r of m.rooms) g.fillText(r.name, ox + ((r.x1 + r.x2 + 1) / 2) * k, oy + (r.y1 + 1.1) * k);
      const comms = this.st && this.st.sab && this.st.sab.type === 'comms';
      if (!comms && !admin) for (const t of this.tasks) if (t.step < t.steps.length) { const s = m.stations[t.steps[t.step]]; g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(tx(s.x), tz(s.z), k * 0.38, 0, 7); g.fill(); }
      if (this.st && this.st.sab) for (const f of SAB[this.st.sab.type].fix) { if (this.st.sab.done.includes(f)) continue; const s = m.stations[f]; g.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff4d5e' : '#ffb3bb'; g.beginPath(); g.arc(tx(s.x), tz(s.z), k * 0.5, 0, 7); g.fill(); }
      if (admin && this.st) {
        const counts = new Map();
        for (const [id, x, z, , , fl] of this.st.e) { if (!(fl & FLAG.alive) || (fl & FLAG.vent)) continue; const r = roomAtPos(m, x, z); if (r) counts.set(r.id, (counts.get(r.id) || 0) + 1); }
        for (const b of this.st.b) { const r = roomAtPos(m, b[1], b[2]); if (r) counts.set(r.id + '_b', (counts.get(r.id + '_b') || 0) + 1); }
        for (const r of m.rooms) {
          const n = counts.get(r.id) || 0, nb = counts.get(r.id + '_b') || 0;
          for (let i = 0; i < n + nb; i++) { g.fillStyle = i < n ? '#ffffff' : '#ff4d5e'; g.beginPath(); g.arc(ox + (r.x1 + 1 + i * 1.1) * k, oy + (r.y2 - 0.6) * k, k * 0.4, 0, 7); g.fill(); }
        }
      }
      const me = this.view.ents.get(this.me);
      if (me && !admin) { g.fillStyle = '#3ee0c0'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(tx(me.x), tz(me.z), k * 0.55, 0, 7); g.fill(); g.stroke(); }
      if (sabMode) {
        // кнопки дверей
        const btns = $('#mm-btns'); const cds = this.pv.doorCd || {};
        btns.innerHTML = m.def.doorRooms.map(rid => { const r = m.R[rid]; const cd = cds[rid] || 0; return `<button class="mm-door" data-r="${rid}" style="left:${ox + ((r.x1 + r.x2 + 1) / 2) * k}px;top:${oy + ((r.y1 + r.y2 + 1) / 2) * k}px" ${cd > 0 ? 'disabled' : ''}>${icon('doors')}${cd > 0 ? `<small>${cd}</small>` : ''}</button>`; }).join('');
        btns.querySelectorAll('.mm-door').forEach(b => b.onclick = () => { Sound.play('door_close', { vol: 0.5 }); this.ctx.send({ t: 'sabdoor', room: b.dataset.r }); });
        const row = $('#sab-row'), scd = this.st ? this.st.scd : 0, active = this.st && this.st.sab;
        row.innerHTML = ['lights', 'comms', 'reactor', 'o2'].map(k2 => `<button class="sab-b ${SAB[k2].critical ? 'crit' : ''}" data-s="${k2}" ${scd > 0 || active ? 'disabled' : ''}>${icon(SAB[k2].icon)}<span>${SAB[k2].short}</span>${scd > 0 ? `<small>${Math.ceil(scd)}с</small>` : ''}</button>`).join('');
        row.querySelectorAll('.sab-b').forEach(b => b.onclick = () => { this.ctx.send({ t: 'sab', type: b.dataset.s }); this.closeOverlay(); });
      }
    };
    draw(); this.ovIv = setInterval(draw, admin ? 400 : 700);
  }
  pick(title, includeSelf, fn) {
    const box = $('#am-pick');
    const alive = new Set((this.st ? this.st.e : []).filter(r => r[5] & FLAG.alive).map(r => r[0]));
    box.innerHTML = `<div class="pick-card"><div class="row"><h3 class="grow">${title}</h3><button class="icon-btn" id="pick-x">${icon('close')}</button></div><div class="pick-grid">${[...this.roster.values()].filter(r => alive.has(r.pid) && r.pid !== this.me).map(r => `<button data-p="${r.pid}"><img src="${thumb(r.model)}"><span>${esc(r.name)}</span></button>`).join('')}</div></div>`;
    box.className = 'show';
    box.querySelector('#pick-x').onclick = () => box.className = '';
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { fn(b.dataset.p); box.className = ''; });
  }

  // ---------- экраны ----------
  intro() {
    const el = $('#am-intro'), imp = this.role === 'impostor';
    const team = imp ? [this.me, ...this.mates] : [...this.roster.keys()];
    const sub = this.sub && SUBS[this.sub];
    el.innerHTML = `<div class="ai ${imp ? 'imp' : 'crew'}"><div class="ai-title">${imp ? 'Предатель' : 'Член экипажа'}</div>
      <div class="ai-sub">${imp ? `Выбивай экипаж, ломай станцию и не попадись. ${this.mates.length ? 'Твои напарники подсвечены красным.' : ''}` : `Среди нас ${this.opts.impostors} ${this.opts.impostors > 1 ? 'предателя' : 'предатель'}. Выполняй задания и найди его!`}</div>
      <div class="ai-team">${team.map(id => { const r = this.info(id); return `<div class="${id === this.me ? 'me' : ''}"><img src="${thumb(r.model)}"><span>${esc(r.name)}</span></div>`; }).join('')}</div>
      ${sub ? `<div class="ai-role">${icon(sub.icon)}<div><b>Твоя роль: ${sub.name}</b><p>${sub.desc}</p></div></div>` : ''}
      <div class="ai-can">${imp ? `${icon('kill')} <b>Выбить</b> рядом стоящего · ${icon('vent')} <b>Люк</b> — прятаться · ${icon('sabotage')} <b>Саботаж</b> — ломать` : `${icon('use')} <b>Действие</b> — делать задания · ${icon('report')} <b>Сообщить</b> о теле · ${icon('map')} карта в углу`}</div>
      <small>Никому не показывай свой экран!</small></div>`;
    el.className = 'show';
    Sound.play(imp ? 'j_impostor' : 'j_crew'); vib(imp ? [60, 60, 60] : 40);
    setTimeout(() => { el.className = ''; }, 6000);
  }
  killedScreen(m) {
    Tasks.close(true); this.closeOverlay();
    const el = $('#am-killscr'), k = m.by ? this.info(m.by) : null;
    el.innerHTML = `<div class="ak">${k ? `<img src="${thumb(k.model)}" class="killer">${icon('kill', 'knife')}` : icon('sheriff', 'big')}<h2>${m.sheriff ? 'Ты ошибся, шериф!' : 'Тебя выбили!'}</h2><p>${k ? `Это был <b>${esc(k.name)}</b>` : ''}</p><small>Теперь ты призрак: летай сквозь стены и ${this.role === 'crew' ? 'доделывай задания' : 'помогай саботажем'}</small></div>`;
    el.className = 'show'; Sound.play('kill'); Sound.play('slime', { vol: 0.6 }); vib([100, 60, 200]);
    setTimeout(() => el.className = '', 3500);
  }
  openMeeting(m) {
    Tasks.close(true); this.closeOverlay(); Sound.siren(false);
    this.meet = m; this.meetStage = m.stage; this.voted = new Set(m.voted); this.myVote = null; this.sel = null; this.result = null;
    this.aliveMap = new Map(m.alive);
    this.meetEnds = performance.now() + m.left * 1000;
    const by = this.info(m.by).name, body = m.body && this.info(m.body).name;
    $('#amm-title').innerHTML = m.reason === 'body' ? `${icon('body')} ${esc(by)} нашёл тело: <b>${esc(body)}</b>` : `${icon('alarm')} ${esc(by)} созвал экстренное собрание!`;
    $('#amm-chat-log').innerHTML = '';
    const rooms = this.map.rooms.map(r => r.name);
    const others = [...this.roster.values()].filter(r => r.pid !== this.me && this.aliveMap.get(r.pid));
    const chips = [...PHRASES.filter(p => !/[\u{1F300}-\u{1FAFF}]/u.test(p)).slice(0, 6), 'Пропускаю', ...others.map(o => `Это ${o.name}!`), ...others.map(o => `Видел, как ${o.name} шёл один`), ...others.map(o => `${o.name} со мной был`), ...rooms.map(r => `Я был: ${r}`)];
    $('#amm-quick').innerHTML = chips.map(c => `<button>${esc(c)}</button>`).join('');
    $('#amm-quick').querySelectorAll('button').forEach(b => b.onclick = () => this.say(b.textContent));
    $('#amm-form').onsubmit = e => { e.preventDefault(); const i = $('#amm-in'); this.say(i.value); i.value = ''; };
    $('#amm-skip').onclick = () => this.vote('skip');
    $('#amm-in').disabled = false;
    // экран «Тело найдено!»
    const sp = $('#am-splash'); sp.innerHTML = `<div class="spl ${m.reason}">${icon(m.reason === 'body' ? 'body' : 'alarm')}<b>${m.reason === 'body' ? 'Тело найдено!' : 'Собрание!'}</b></div>`; sp.className = 'show';
    Sound.play(m.reason === 'body' ? 'j_report' : 'j_meeting'); vib([80, 50, 80]);
    setTimeout(() => { sp.className = ''; $('#am-meeting').className = 'show'; }, 1800);
    clearInterval(this.meetIv);
    this.meetIv = setInterval(() => {
      const l = Math.max(0, (this.meetEnds - performance.now()) / 1000);
      $('#amm-time').textContent = this.result ? '' : (this.meetStage === 'discuss' ? 'Обсуждение: ' : 'Голосование: ') + Math.ceil(l) + 'с';
      if (!$('#am-meeting').classList.contains('show') && !$('#am-splash').classList.contains('show')) clearInterval(this.meetIv);
    }, 250);
    this.renderMeeting();
  }
  say(text) { text = String(text).trim(); if (text) this.ctx.send({ t: 'chat', text }); }
  vote(target) {
    if (!this.alive || this.myVote || this.result || this.meetStage !== 'vote') return;
    this.myVote = target; this.ctx.send({ t: 'vote', target }); vib(30); this.renderMeeting();
  }
  addChat(m) {
    const r = this.info(m.pid);
    const d = document.createElement('div'); d.className = 'cm' + (m.pid === this.me ? ' me' : '') + (m.ghost ? ' ghost' : '');
    d.innerHTML = `<img src="${thumb(r.model)}"><div><b>${esc(r.name)}${m.ghost ? ' (призрак)' : ''}</b><p>${esc(m.text)}</p></div>`;
    const log = $('#amm-chat-log'); log.appendChild(d); log.scrollTop = log.scrollHeight;
    if (m.pid !== this.me) { Sound.play('pop', { vol: 0.4 }); vib(10); }
  }
  renderMeeting() {
    if (!this.meet) return;
    const res = this.result, canVote = this.alive && !this.myVote && !res && this.meetStage === 'vote';
    const votesFor = new Map();
    if (res) for (const [voter, t] of res.votes) { if (!votesFor.has(t)) votesFor.set(t, []); votesFor.get(t).push(voter); }
    $('#amm-players').innerHTML = [...this.roster.values()].map(r => {
      const alive = this.aliveMap.get(r.pid), vs = votesFor.get(r.pid) || [];
      const cls = ['mp', alive ? '' : 'dead', this.sel === r.pid ? 'sel' : '', this.myVote === r.pid ? 'voted-me' : '', res && res.ejected === r.pid ? 'ejected' : ''].join(' ');
      const mate = this.role === 'impostor' && (this.mates.includes(r.pid) || r.pid === this.me);
      return `<button class="${cls}" data-pid="${r.pid}" ${!alive || !canVote ? 'disabled' : ''}><img src="${thumb(r.model)}"><span class="nm" style="${mate ? 'color:#ff6b78' : ''}">${esc(r.name)}${r.pid === this.me ? ' (ты)' : ''}</span>
        ${!alive ? `<span class="tag">${icon('skull')}</span>` : this.voted.has(r.pid) && !res ? `<span class="tag ok">${icon('check')}</span>` : ''}
        ${res ? `<span class="vs">${vs.map(v => v === '?' ? '<i class="anon"></i>' : `<img src="${thumb(this.info(v).model)}">`).join('')}</span>` : ''}</button>`;
    }).join('');
    $('#amm-players').querySelectorAll('.mp').forEach(b => b.onclick = () => { const pid = b.dataset.pid; if (this.sel === pid) this.vote(pid); else { this.sel = pid; Sound.play('select', { vol: 0.5 }); this.renderMeeting(); } });
    $('#amm-skip').disabled = !canVote;
    $('#amm-skip').innerHTML = res ? `${icon('skip')} Пропустили: ${res.skip}` : `${icon('skip')} Пропустить`;
    let info = '';
    if (res) info = '';
    else if (!this.alive) info = 'Призраки не голосуют, но могут болтать между собой';
    else if (this.meetStage === 'discuss') info = 'Обсуждайте! Голосование скоро начнётся';
    else if (this.myVote) info = 'Голос принят. Ждём остальных…';
    else if (this.sel) info = `Нажми ещё раз на <b>${esc(this.info(this.sel).name)}</b>, чтобы проголосовать`;
    else info = 'Нажми на того, кого подозреваешь';
    if (!res) $('#amm-info').innerHTML = info;
  }
  voteResult(m) {
    this.result = m; this.renderMeeting();
    $('#amm-in').disabled = true;
    const name = m.ejected && this.info(m.ejected).name;
    let text;
    if (!m.ejected) text = m.tie ? 'Голоса разделились. Никого не выгнали.' : 'Никого не выгнали.';
    else if (m.wasImp === true) text = `${esc(name)} был предателем.`;
    else if (m.wasImp === false) text = `${esc(name)} не был предателем.`;
    else text = `${esc(name)} выброшен в космос.`;
    const sub = m.impLeft != null ? `Осталось предателей: ${m.impLeft}` : '';
    $('#amm-info').innerHTML = `<div class="vres">${text}</div>`;
    if (m.ejected === this.me) { this.alive = false; vib([100, 50, 100]); }
    setTimeout(() => {
      const el = $('#am-eject');
      el.innerHTML = `<div class="ej-stars"></div>${m.ejected ? `<img class="ej-body" src="${thumb(this.info(m.ejected).model)}">` : ''}<div class="ej-text"><span>${text}</span><small>${sub}</small></div>`;
      el.className = 'show'; $('#am-meeting').className = '';
      if (m.ejected) Sound.play('eject');
      const sp = el.querySelector('.ej-text span'), full = sp.textContent; sp.textContent = '';
      let i = 0; const tw = setInterval(() => { sp.textContent = full.slice(0, ++i); if (i % 2) Sound.play('tick', { vol: 0.3 }); if (i >= full.length) clearInterval(tw); }, 55);
    }, 2500);
  }
}
