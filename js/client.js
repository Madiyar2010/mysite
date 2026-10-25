// Клиентская часть игры: показывает то, что присылает хост, и отправляет действия игрока.
import * as THREE from 'three';
import { $, $$, esc, clamp, rnd, fmtTime, CLASSES, MODES, TEAM_COLORS, TEAM_NAMES, PHRASES } from './util.js';
import { Avatar } from './render.js';
import { MONSTERS } from './sim-arena.js';
import { VISION } from './sim-traitor.js';
import { MAPS, roomAt } from './maps.js';
import { Input } from './input.js';
import * as Mini from './minigames.js';

const vibrate = p => { if (window.__prefs && !window.__prefs.vibe) return; if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) { } };
const thumb = model => model.startsWith('character-') ? `assets/thumbs/${model}.png` : '';

export function banner(text, cls = '', ms = 2600) {
  const b = $('#banner');
  const d = document.createElement('div'); d.className = 'bn ' + cls; d.innerHTML = text;
  b.appendChild(d);
  setTimeout(() => d.classList.add('out'), ms);
  setTimeout(() => d.remove(), ms + 500);
}
function killfeed(html) {
  const k = $('#killfeed');
  const d = document.createElement('div'); d.className = 'kf'; d.innerHTML = html;
  k.prepend(d); while (k.children.length > 5) k.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 4500); setTimeout(() => d.remove(), 5000);
}

// ======================= АРЕНА =======================
export class ArenaClient {
  constructor(ctx) {
    this.ctx = ctx; this.view = ctx.view; this.me = ctx.myPid; this.mode = ctx.mode;
    this.roster = ctx.roster;
    this.myInfo = this.roster.get(this.me);
    this.cls = this.myInfo ? this.myInfo.cls : 'knight';
    this.lastAnimN = new Map();
    this.hpPrev = null;
    document.body.dataset.game = 'arena';
    $('#hud-score').innerHTML = '';
    $('#me-cls').textContent = CLASSES[this.cls].icon;
    $('#me-thumb').src = thumb(this.myInfo ? this.myInfo.model : 'character-a');
    $('#b-sup').innerHTML = `<span>${CLASSES[this.cls].icon}</span><small>${CLASSES[this.cls].supName}</small>`;
    $('#b-atk').innerHTML = `<span>${{ knight: '⚔️', archer: '🏹', mage: '🔥', ninja: '🗡️' }[this.cls]}</span>`;
    $('#keys-hint').innerHTML = `<b>WASD</b> — ходить · <b>Мышь</b> — целиться · <b>ЛКМ</b> — ${CLASSES[this.cls].atkName.toLowerCase()} · <b>ПКМ/Пробел</b> — ${CLASSES[this.cls].supName.toLowerCase()} · <b>X</b> — эмоция · <b>Tab</b> — счёт`;
    this.iv = setInterval(() => this.sendInput(), 50);
  }
  dispose() { clearInterval(this.iv); }
  isEnemy(id, k) {
    if (id === this.me) return false;
    if (this.mode === 'pve') return k.startsWith('m:');
    if (k.startsWith('m:')) return true;
    if (this.mode === 'tdm' || this.mode === 'ctf') { const o = this.roster.get(k); return o && this.myInfo && o.team !== this.myInfo.team; }
    return true;
  }
  aim() {
    const me = this.view.ents.get(this.me);
    if (!me) return null;
    if (!Input.touch && Input.mouse) {
      const p = this.view.screenToGround(Input.mouse.x, Input.mouse.y);
      if (p) { const dx = p.x - me.x, dz = p.z - me.z; if (Math.hypot(dx, dz) > 0.2) return { x: dx, z: dz }; }
    }
    // автоприцел на ближайшего врага
    const c = CLASSES[this.cls], range = c.atk.type === 'melee' ? 4 : c.atk.range;
    let best = null, bd = range;
    for (const [id, a] of this.view.ents) {
      if (!this.isEnemy(id, a.k) || a.dead || a.invisible) continue;
      const d = Math.hypot(a.x - me.x, a.z - me.z);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) return { x: best.x - me.x, z: best.z - me.z };
    const mv = Input.getMove();
    if (mv.x || mv.z) return { x: mv.x, z: mv.z };
    return { x: Math.sin(me.rot), z: Math.cos(me.rot) };
  }
  sendInput() {
    const mv = Input.getMove(), a = this.aim() || { x: 0, z: 1 };
    this.ctx.send({ t: 'i', mx: +mv.x.toFixed(2), mz: +mv.z.toFixed(2), ax: +a.x.toFixed(2), az: +a.z.toFixed(2), atk: Input.attacking() ? 1 : 0, sup: Input.seq.sup, emo: Input.seq.emo });
  }
  onMsg(m) { if (m.t === 's') this.snapshot(m); }
  snapshot(s) {
    const v = this.view, seen = new Set();
    for (const row of s.e) {
      const [id, k, x, z, rot, anim, hp, maxhp, fl, sup, resp] = row;
      seen.add(id);
      const a = v.ensureEnt(id, k); if (!a) continue;
      a.k = k;
      a.setTarget(x, z, rot);
      if (a.fresh) { a.fresh = false; a.snap(); }
      const code = anim & 15;
      if (this.lastAnimN.get(id) !== anim) { this.lastAnimN.set(id, anim); a.play(code, true); }
      a.setHP(hp, maxhp);
      a.dead = !!(fl & 1);
      a.invisible = !!(fl & 2);
      const mine = id === this.me, ally = !this.isEnemy(id, k);
      let alpha = 1;
      if (fl & 2) alpha = ally ? 0.45 : 0.12;
      if (fl & 8) alpha = Math.floor(performance.now() / 120) % 2 ? 0.4 : 1;
      a.setAlpha(alpha);
      this.shield(a, !!(fl & 4));
      if (a.plateEl) a.plateEl.style.display = a.dead ? 'none' : '';
      if (a.ring) a.ring.visible = !a.dead;
      if (mine) this.updateMe(hp, maxhp, sup, a.dead, resp);
    }
    for (const id of [...v.ents.keys()]) if (!seen.has(id)) v.removeEnt(id);
    v.syncProjectiles(s.p);
    if (s.fl) v.syncFlags(s.fl);
    for (const f of s.fx) this.fx(f);
    this.hud(s);
  }
  shield(a, on) {
    if (on && !a.bubble) {
      a.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), new THREE.MeshBasicMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.22, depthWrite: false }));
      a.bubble.position.y = 0.9; a.root.add(a.bubble);
    }
    if (a.bubble) a.bubble.visible = on;
  }
  updateMe(hp, maxhp, sup, dead, resp) {
    const p = clamp(hp / maxhp, 0, 1);
    $('#me-hp i').style.width = (p * 100) + '%';
    $('#me-hp i').style.background = p > 0.5 ? '#5ee07a' : p > 0.25 ? '#ffd166' : '#ff5d6c';
    $('#me-hp span').textContent = `${hp} / ${maxhp}`;
    if (this.hpPrev != null && hp < this.hpPrev && !dead) { const h = $('#hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); vibrate(40); }
    this.hpPrev = hp;
    const cd = CLASSES[this.cls].sup.cd, frac = clamp(sup / cd, 0, 1);
    const b = $('#b-sup');
    b.style.setProperty('--cd', (frac * 360) + 'deg');
    b.classList.toggle('ready', sup <= 0);
    $('#me-sup').style.setProperty('--cd', (frac * 360) + 'deg');
    $('#me-sup').classList.toggle('ready', sup <= 0);
    $('#me-sup').textContent = sup > 0 ? Math.ceil(sup) : CLASSES[this.cls].icon;
    const cb = $('#center-big');
    if (dead) { cb.innerHTML = `<div class="resp">Тебя выбили!<br><b>${Math.ceil(resp)}</b><small>до возрождения</small></div>`; cb.className = 'show'; }
    else if (cb.dataset.mode !== 'count') { cb.className = ''; }
  }
  fx(f) {
    const v = this.view, type = f[0];
    switch (type) {
      case 'hit': {
        const [, x, z, dmg, id, crit] = f;
        const a = v.ents.get(id); if (a) a.flash();
        v.fx.number(x, z, '-' + dmg, crit ? '#ffd166' : id === this.me ? '#ff8080' : '#fff', crit);
        v.fx.burst(x, 1, z, '#ffffff', 5, 3, 0.07, 0.35);
        break;
      }
      case 'hn': v.fx.number(f[1], f[2], '+' + f[3], '#5ee07a'); break;
      case 'sl': v.fx.slash(f[1], f[2], f[3], f[4], f[5]); break;
      case 'boom': v.fx.boom(f[1], f[2], f[3], f[4]); break;
      case 'heal': v.fx.ringPulse(f[1], f[2], '#5ee07a', 0.5, f[3], 0.6); v.fx.burst(f[1], 0.5, f[2], '#9dffb0', 18, 3, 0.1, 0.9); break;
      case 'die': v.fx.burst(f[1], 0.8, f[2], '#ffffff', 18, 5, 0.14, 0.8); if (f[3] === this.me) { vibrate([60, 40, 120]); v.shake = 0.6; } break;
      case 'kill': {
        const [, killer, victim, kc, vc] = f;
        killfeed(killer ? `<b style="color:${kc}">${esc(killer)}</b> ⚔️ <b style="color:${vc}">${esc(victim)}</b>` : `💀 <b style="color:${vc}">${esc(victim)}</b>`);
        const me = this.roster.get(this.me);
        if (me && killer === me.name) { banner('⚔️ Ты выбил ' + esc(victim) + '!', 'small', 1500); vibrate(30); }
        break;
      }
      case 'msg': banner(esc(f[1])); break;
      case 'cap': banner(`🚩 ${esc(f[2])} принёс флаг! +1 команде «${TEAM_NAMES[f[1]]}»`, 'big'); vibrate([40, 40, 40]); break;
      case 'dash': v.fx.burst(f[1], 0.6, f[2], f[3], 10, 4, 0.12, 0.5); break;
      case 'blink': v.fx.burst(f[1], 0.9, f[2], f[5], 14, 3, 0.12, 0.6); v.fx.burst(f[3], 0.9, f[4], f[5], 14, 3, 0.12, 0.6); break;
      case 'tele': v.fx.telegraph(f[1], f[2], f[3], f[4]); break;
      case 'shake': v.shake = Math.max(v.shake, f[1]); break;
      case 'spawn': v.fx.ringPulse(f[1], f[2], '#ffd166', 0.3, 1.6, 0.6); break;
      case 'puff': v.fx.burst(f[1], 1, f[2], '#cccccc', 5, 2, 0.08, 0.3); break;
    }
  }
  hud(s) {
    const cb = $('#center-big');
    if (s.ph === 'count') { cb.dataset.mode = 'count'; cb.className = 'show'; if (cb.dataset.v !== String(s.c)) { cb.dataset.v = s.c; cb.innerHTML = `<div class="cnt">${s.c}</div>`; vibrate(20); } }
    else if (cb.dataset.mode === 'count') { cb.dataset.mode = ''; cb.dataset.v = ''; cb.className = ''; banner('В бой! ⚔️', 'big', 1200); }
    $('#hud-timer').style.display = s.tl >= 0 ? '' : 'none';
    if (s.tl >= 0) { $('#hud-timer').textContent = fmtTime(s.tl); $('#hud-timer').classList.toggle('low', s.tl < 15 && s.ph === 'play'); }
    let html = '';
    if (s.ts) {
      const icon = this.mode === 'ctf' ? '🚩' : '⚔️', goal = this.mode === 'ctf' ? 3 : 15;
      const my = this.myInfo ? this.myInfo.team : -1;
      html = `<div class="ts t0 ${my === 0 ? 'mine' : ''}">${s.ts[0]}</div><div class="ts-mid">${icon} до ${goal}</div><div class="ts t1 ${my === 1 ? 'mine' : ''}">${s.ts[1]}</div>`;
    } else if (this.mode === 'pve') {
      html = `<div class="pill">🌊 Волна ${Math.max(1, s.wave)}/6</div><div class="pill">💀 ${s.left || 0}</div>`;
    }
    if (s.sb) {
      this.sb = s.sb;
      if (this.mode === 'ffa') {
        const sorted = [...s.sb].sort((a, b) => b[1] - a[1]);
        const rank = sorted.findIndex(r => r[0] === this.me) + 1, mine = s.sb.find(r => r[0] === this.me);
        this.ffaHtml = `<div class="pill">⚔️ ${mine ? mine[1] : 0}</div><div class="pill">🏅 ${rank}/${sorted.length}</div>`;
      }
      this.renderBoard();
    }
    if (this.mode === 'ffa') html = this.ffaHtml || '';
    if (html !== this.lastScore) { this.lastScore = html; $('#hud-score').innerHTML = html; }
    const bb = $('#bossbar');
    if (s.boss) { bb.classList.add('show'); bb.querySelector('i').style.width = (s.boss[0] / s.boss[1] * 100) + '%'; } else bb.classList.remove('show');
  }
  renderBoard() {
    if (!this.sb) return;
    const rows = [...this.sb].sort((a, b) => b[3] - a[3] || b[1] - a[1]);
    $('#board-body').innerHTML = `<table><tr><th></th><th>Игрок</th><th>⚔️</th><th>💀</th><th>⭐</th></tr>${rows.map(([id, k, d, p]) => {
      const r = this.roster.get(id) || { name: '?' };
      const col = (this.mode === 'tdm' || this.mode === 'ctf') ? TEAM_COLORS[r.team] : '#fff';
      return `<tr class="${id === this.me ? 'me' : ''}"><td><img src="${thumb(r.model || 'character-a')}"></td><td style="color:${col}">${esc(r.name)}${r.bot ? ' 🤖' : ''}</td><td>${k}</td><td>${d}</td><td>${p}</td></tr>`;
    }).join('')}</table>`;
  }
}

// ======================= ПРЕДАТЕЛЬ =======================
export class TraitorClient {
  constructor(ctx) {
    this.ctx = ctx; this.view = ctx.view; this.me = ctx.myPid; this.roster = ctx.roster;
    this.map = MAPS.castle;
    this.role = 'crew'; this.tasks = []; this.done = new Set(); this.mates = [];
    this.alive = true; this.ghosts = new Map(); this.bodyAv = new Map();
    this.cd = { kill: 99, sab: 99 }; this.phase = 'intro'; this.dark = 0;
    this.myEm = 1; this.mcd = 0;
    this.chatLog = [];
    document.body.dataset.game = 'traitor';
    $('#keys-hint').innerHTML = `<b>WASD</b> — ходить · <b>E</b> — задание · <b>R</b> — сообщить о теле · <b>B</b> — тревога · <b>F</b> — выбить · <b>G</b> — свет · <b>X</b> — эмоция`;
    this.iv = setInterval(() => this.sendInput(), 50);
    Input.onKeyGame = a => this.key(a);
    this.bindButtons();
  }
  dispose() { clearInterval(this.iv); Mini.close(); $('#meeting').className = ''; $('#t-intro').className = ''; Input.onKeyGame = null; }
  bindButtons() {
    $('#b-use').onclick = () => this.key('use');
    $('#b-kill').onclick = () => { Input.seq.kill++; };
    $('#b-rep').onclick = () => { Input.seq.rep++; };
    $('#b-em').onclick = () => { Input.seq.em++; };
    $('#b-sab').onclick = () => { Input.seq.sab++; };
    $('#t-tasks-toggle').onclick = () => $('#t-tasks').classList.toggle('open');
  }
  key(a) { if (a === 'use') this.tryUse(); }
  sendInput() {
    const busy = Mini.isOpen() || this.phase !== 'play';
    const mv = busy ? { x: 0, z: 0 } : Input.getMove();
    const s = Input.seq;
    this.ctx.send({ t: 'i', mx: +mv.x.toFixed(2), mz: +mv.z.toFixed(2), kill: s.kill, rep: s.rep, em: s.em, sab: s.sab, emo: s.emo });
  }
  metaFor(pid, ghost) {
    const r = this.roster.get(pid) || {};
    const mate = this.role === 'traitor' && this.mates.includes(pid);
    return { model: ghost ? 'grave/character-ghost' : r.model, hat: ghost ? 'halo' : r.hat, aura: ghost ? 'none' : r.aura, name: r.name, me: pid === this.me,
      ring: pid === this.me ? '#ffd166' : null, nameColor: mate ? '#ff5d6c' : '#fff' };
  }
  onMsg(m) {
    switch (m.t) {
      case 'role': this.role = m.role; this.tasks = m.tasks; this.done = new Set(m.done); this.mates = m.mates; this.alive = m.alive; this.intro(); this.renderTasks(); this.updateMarkers(); this.restyleMates(); break;
      case 'tcd': this.cd = { kill: m.kill, sab: m.sab }; break;
      case 'taskok': this.done = new Set(m.done); this.renderTasks(); this.updateMarkers(); vibrate([20, 30, 20]); break;
      case 'youdied': this.alive = false; banner('👻 Тебя выбили! Теперь ты призрак.<br><small>Можно летать сквозь стены и доделывать задания</small>', 'big', 4000); vibrate([80, 60, 160]); Mini.close(); break;
      case 'ts': this.state(m); break;
      case 'meet': this.openMeeting(m); break;
      case 'voted': this.voted.add(m.pid); this.renderMeeting(); break;
      case 'voteres': this.voteResult(m); break;
      case 'chat': this.addChat(m); break;
    }
  }
  restyleMates() { for (const id of this.mates) { const a = this.view.ents.get(id); if (a && a.plateEl) a.plateEl.querySelector('.pn').style.color = '#ff5d6c'; } }
  intro() {
    const el = $('#t-intro');
    const t = this.role === 'traitor';
    const mates = this.mates.map(id => esc((this.roster.get(id) || {}).name)).join(', ');
    el.innerHTML = `<div class="ti-card ${t ? 'bad' : 'good'}"><div class="ti-ic">${t ? '😈' : '🛡️'}</div><h2>${t ? 'Ты — ПРЕДАТЕЛЬ' : 'Ты — в команде'}</h2>
      <p>${t ? 'Тихо выбивай игроков (кнопка 🔪), выключай свет 💡 и не попадись! Притворяйся, что делаешь задания.' + (mates ? `<br><b>Твои напарники: ${mates}</b>` : '') : 'Выполняй задания по замку ❗ и найди предателя. Нашёл тело — нажми «Сообщить».'}</p>
      <small>Никому не показывай экран! 🤫</small></div>`;
    el.className = 'show';
    vibrate(t ? [60, 60, 60] : 40);
    setTimeout(() => { el.className = ''; }, 5500);
  }
  renderTasks() {
    const list = this.tasks.map(id => { const s = this.map.stations.find(x => x.id === id); return `<li class="${this.done.has(id) ? 'done' : ''}">${s.icon} ${s.name} <small>${s.room}</small></li>`; }).join('');
    $('#t-tasks ul').innerHTML = list;
    $('#t-tasks-toggle').innerHTML = `📋 ${this.role === 'traitor' ? 'Ложные задания' : 'Задания'} ${this.done.size}/${this.tasks.length}`;
  }
  updateMarkers() { this.view.setMarkers(this.tasks.map(id => { const s = this.map.stations.find(x => x.id === id); return { id, x: s.x, z: s.z, done: this.done.has(id) }; })); }
  state(s) {
    const v = this.view;
    const prevPhase = this.phase;
    this.phase = s.ph; this.dark = s.dark; this.mcd = s.mcd;
    const em = s.em.find(e => e[0] === this.me); if (em) this.myEm = em[1];
    if (prevPhase !== 'play' && s.ph === 'play') { $('#meeting').className = ''; }
    const meRow = s.e.find(r => r[0] === this.me);
    if (meRow) this.alive = !!meRow[5];
    const seen = new Set();
    for (const [id, x, z, rot, anim, alive] of s.e) {
      seen.add(id);
      const ghost = !alive;
      let a = v.ents.get(id);
      if (a && a.isGhost !== ghost) { v.removeEnt(id); a = null; }
      if (!a) {
        a = new Avatar({ ...this.metaFor(id, ghost) });
        a.isGhost = ghost; v.scene.add(a.root); v.ents.set(id, a); a.setTarget(x, z, rot); a.snap();
        if (ghost) a.setAlpha(0.55);
      }
      a.setTarget(x, z, rot);
      if (a.lastAnim !== anim) { a.lastAnim = anim; a.play(anim & 15, true); }
    }
    for (const id of [...v.ents.keys()]) if (!seen.has(id)) v.removeEnt(id);
    // тела
    const bseen = new Set();
    for (const [pid, x, z, rot] of s.b) {
      bseen.add(pid);
      if (!this.bodyAv.has(pid)) {
        const r = this.roster.get(pid) || {};
        const b = new Avatar({ model: r.model, hat: r.hat, label: false });
        b.setTarget(x, z, rot); b.snap(); b.play(5, true); b.ch.mixer.update(3);
        const el = document.createElement('div'); el.className = 'body-mark'; el.textContent = '💀';
        v.scene.add(b.root); this.bodyAv.set(pid, b);
      }
    }
    for (const [pid, b] of this.bodyAv) if (!bseen.has(pid)) { b.dispose(); this.bodyAv.delete(pid); }
    for (const f of s.fx) {
      if (f[0] === 'msg') banner(esc(f[1]));
      if (f[0] === 'kd') { const me = v.ents.get(this.me); if (me && Math.hypot(me.x - f[1], me.z - f[2]) < this.visionR() + 1) v.fx.burst(f[1], 0.8, f[2], '#ff5d6c', 14, 4, 0.12, 0.7); }
    }
    this.hud(s);
  }
  visionR() { if (!this.alive) return 99; if (this.role === 'traitor') return VISION.traitor; return this.dark ? VISION.dark : VISION.crew; }
  near(x, z, d) { const me = this.view.ents.get(this.me); return me && Math.hypot(me.x - x, me.z - z) <= d; }
  nearStation() {
    if (!this.alive && this.role === 'traitor') return null;
    for (const id of this.tasks) { if (this.done.has(id)) continue; const s = this.map.stations.find(x => x.id === id); if (this.near(s.x, s.z, 2.6)) return s; }
    return null;
  }
  tryUse() {
    if (this.phase !== 'play' || Mini.isOpen()) return;
    const st = this.nearStation(); if (!st) return;
    this.ctx.send({ t: 'busy', v: 1 });
    Mini.open(st, () => {
      if (this.role === 'traitor') { this.done.add(st.id); this.renderTasks(); this.updateMarkers(); }
      else this.ctx.send({ t: 'task', id: st.id });
      this.ctx.send({ t: 'busy', v: 0 });
    }, () => this.ctx.send({ t: 'busy', v: 0 }));
  }
  hud(s) {
    const v = this.view, me = v.ents.get(this.me);
    $('#t-prog i').style.width = (s.prog * 100) + '%';
    $('#t-prog span').textContent = `Задания команды: ${Math.round(s.prog * 100)}%`;
    if (me) { const r = roomAt(this.map, me.x, me.z); $('#t-room').textContent = r ? r.name : 'Коридор'; }
    $('#t-role').className = 'role ' + (this.role === 'traitor' ? 'bad' : 'good') + (this.alive ? '' : ' ghost');
    $('#t-role').textContent = (this.alive ? '' : '👻 ') + (this.role === 'traitor' ? '😈 Предатель' : '🛡️ Команда');
    // видимость
    const R = this.visionR();
    for (const [id, a] of v.ents) {
      if (id === this.me) { a.setVisible(true); continue; }
      let vis = true;
      if (a.isGhost) vis = !this.alive;
      else if (this.alive && me) vis = Math.hypot(a.x - me.x, a.z - me.z) < R + 0.4;
      a.setVisible(vis);
    }
    for (const b of this.bodyAv.values()) b.setVisible(!this.alive || !me || Math.hypot(b.x - me.x, b.z - me.z) < R + 0.4);
    // затемнение вокруг игрока
    const vis = $('#vision');
    if (me && this.alive && s.ph === 'play') {
      const c = v.worldToScreen(me.x, 0.8, me.z), e = v.worldToScreen(me.x + R, 0.8, me.z);
      const rpx = Math.abs(e.x - c.x);
      vis.style.background = `radial-gradient(circle at ${c.x}px ${c.y}px, rgba(8,6,20,0) ${rpx * 0.72}px, rgba(8,6,20,.94) ${rpx * 1.02}px)`;
      vis.style.display = 'block';
    } else vis.style.display = 'none';
    // кнопки
    const play = s.ph === 'play';
    const st = play ? this.nearStation() : null;
    const body = play && this.alive && [...this.bodyAv.values()].some(b => this.near(b.x, b.z, 2.7));
    const table = play && this.alive && this.near(this.map.meetingTable.x, this.map.meetingTable.z, 3.3);
    let killable = false;
    if (play && this.role === 'traitor' && this.alive && me) for (const [id, a] of v.ents) if (id !== this.me && !a.isGhost && !this.mates.includes(id) && Math.hypot(a.x - me.x, a.z - me.z) < 1.9) killable = true;
    const set = (sel, on, show = true, label) => { const b = $(sel); b.style.display = show ? '' : 'none'; b.classList.toggle('on', !!on); b.disabled = !on; if (label != null) b.querySelector('small').textContent = label; };
    set('#b-use', !!st, true);
    set('#b-rep', body, true);
    set('#b-em', table && this.myEm > 0 && this.mcd <= 0, true, this.myEm > 0 ? (this.mcd > 0 ? Math.ceil(this.mcd) + 'с' : 'Тревога') : 'Нет');
    const t = this.role === 'traitor' && this.alive;
    set('#b-kill', killable && this.cd.kill <= 0, t, this.cd.kill > 0 ? Math.ceil(this.cd.kill) + 'с' : 'Выбить');
    set('#b-sab', this.cd.sab <= 0 && play, t, this.cd.sab > 0 ? Math.ceil(this.cd.sab) + 'с' : 'Свет');
    if (Mini.isOpen() && st == null && play) Mini.close();
    if (!play && Mini.isOpen()) Mini.close();
  }

  // ---------- собрание ----------
  openMeeting(m) {
    Mini.close();
    this.meet = m; this.voted = new Set(m.voted); this.myVote = null; this.sel = null; this.result = null;
    this.aliveMap = new Map(m.alive);
    this.meetEnds = performance.now() + m.left * 1000;
    const by = (this.roster.get(m.by) || {}).name, body = m.body && (this.roster.get(m.body) || {}).name;
    $('#meet-title').innerHTML = m.reason === 'body' ? `💀 ${esc(by)} нашёл тело: <b>${esc(body)}</b>` : `🚨 ${esc(by)} созвал экстренное собрание!`;
    $('#chat-log').innerHTML = '';
    this.chatLog = [];
    const rooms = this.map.rooms.map(r => r.name);
    const others = [...this.roster.values()].filter(r => r.pid !== this.me && this.aliveMap.get(r.pid));
    const chips = [...PHRASES.slice(0, 4), ...others.map(o => `Подозреваю ${o.name} 🤨`), ...rooms.map(r => `Я был: ${r}`), ...PHRASES.slice(4)];
    $('#chat-quick').innerHTML = chips.map(c => `<button>${esc(c)}</button>`).join('');
    $('#chat-quick').querySelectorAll('button').forEach(b => b.onclick = () => this.say(b.textContent));
    $('#chat-form').onsubmit = e => { e.preventDefault(); const i = $('#chat-in'); this.say(i.value); i.value = ''; };
    $('#meet-skip').onclick = () => this.vote('skip');
    $('#meeting').className = 'show';
    $('#chat-in').disabled = false;
    vibrate([80, 50, 80]);
    clearInterval(this.meetIv);
    this.meetIv = setInterval(() => { const l = Math.max(0, (this.meetEnds - performance.now()) / 1000); $('#meet-time').textContent = Math.ceil(l) + 'с'; if (!$('#meeting').classList.contains('show')) clearInterval(this.meetIv); }, 250);
    this.renderMeeting();
  }
  say(text) { text = String(text).trim(); if (!text) return; this.ctx.send({ t: 'chat', text }); }
  vote(target) {
    if (!this.alive || this.myVote || this.result) return;
    this.myVote = target; this.ctx.send({ t: 'vote', target }); vibrate(30); this.renderMeeting();
  }
  addChat(m) {
    const r = this.roster.get(m.pid) || { name: '?', model: 'character-a' };
    const d = document.createElement('div'); d.className = 'cm' + (m.pid === this.me ? ' me' : '') + (m.ghost ? ' ghost' : '');
    d.innerHTML = `<img src="${thumb(r.model)}"><div><b>${esc(r.name)}${m.ghost ? ' 👻' : ''}</b><p>${esc(m.text)}</p></div>`;
    const log = $('#chat-log'); log.appendChild(d); log.scrollTop = log.scrollHeight;
    if (m.pid !== this.me) vibrate(10);
  }
  renderMeeting() {
    if (!this.meet) return;
    const res = this.result;
    const votesFor = new Map();
    if (res) for (const [voter, t] of res.votes) { if (!votesFor.has(t)) votesFor.set(t, []); votesFor.get(t).push(voter); }
    const players = [...this.roster.values()];
    $('#meet-players').innerHTML = players.map(r => {
      const alive = this.aliveMap.get(r.pid);
      const vs = votesFor.get(r.pid) || [];
      const cls = ['mp', alive ? '' : 'dead', this.sel === r.pid ? 'sel' : '', this.myVote === r.pid ? 'voted-me' : '', res && res.ejected === r.pid ? 'ejected' : ''].join(' ');
      return `<button class="${cls}" data-pid="${r.pid}" ${!alive || !this.alive || this.myVote || res ? 'disabled' : ''}>
        <img src="${thumb(r.model)}"><span class="nm">${esc(r.name)}${r.pid === this.me ? ' (ты)' : ''}</span>
        ${!alive ? '<span class="tag">💀</span>' : this.voted.has(r.pid) && !res ? '<span class="tag ok">✓</span>' : ''}
        ${res ? `<span class="vs">${vs.map(v => `<img src="${thumb((this.roster.get(v) || {}).model || 'character-a')}">`).join('')}</span>` : ''}</button>`;
    }).join('');
    $('#meet-players').querySelectorAll('.mp').forEach(b => b.onclick = () => {
      const pid = b.dataset.pid;
      if (this.sel === pid) this.vote(pid); else { this.sel = pid; this.renderMeeting(); }
    });
    const skipVotes = votesFor.get('skip') || [];
    $('#meet-skip').disabled = !this.alive || !!this.myVote || !!res;
    $('#meet-skip').innerHTML = res ? `⏭️ Пропустили: ${skipVotes.length}` : '⏭️ Пропустить';
    let info = '';
    if (!this.alive) info = '👻 Призраки не голосуют, но могут болтать между собой';
    else if (res) info = '';
    else if (this.myVote) info = '✅ Голос принят. Ждём остальных…';
    else if (this.sel) info = `Нажми ещё раз на <b>${esc((this.roster.get(this.sel) || {}).name)}</b>, чтобы проголосовать`;
    else info = 'Обсудите в чате и нажмите на того, кого подозреваете';
    $('#meet-info').innerHTML = info;
  }
  voteResult(m) {
    this.result = m;
    this.renderMeeting();
    const name = m.ejected && (this.roster.get(m.ejected) || {}).name;
    let text;
    if (!m.ejected) text = m.tie ? '🤝 Голоса разделились — никого не выгнали' : '⏭️ Никого не выгнали';
    else if (m.wasTraitor === true) text = `🎯 ${esc(name)} был ПРЕДАТЕЛЕМ!`;
    else if (m.wasTraitor === false) text = `😢 ${esc(name)} не был предателем…`;
    else text = `${esc(name)} выгнан из замка`;
    if (m.traitorsLeft != null && m.ejected) text += `<br><small>Осталось предателей: ${m.traitorsLeft}</small>`;
    $('#meet-info').innerHTML = `<div class="vres">${text}</div>`;
    if (m.ejected === this.me) { this.alive = false; vibrate([100, 50, 100]); }
    $('#chat-in').disabled = true;
  }
}
