// Клиентская часть игры: показывает то, что присылает хост, и отправляет действия игрока.
import * as THREE from 'three';
import { $, $$, esc, clamp, rnd, fmtTime, CLASSES, MODES, TEAM_COLORS, TEAM_NAMES } from './util.js';
import { Avatar } from './render.js';
import { MONSTERS } from './sim-arena.js';
import { Input } from './input.js';
import { icon } from './icons.js';
import { Sound } from './sound.js';

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
    $('#me-cls').innerHTML = icon(CLASSES[this.cls].icon);
    $('#me-thumb').src = thumb(this.myInfo ? this.myInfo.model : 'character-a');
    $('#b-sup').innerHTML = `<span>${icon(CLASSES[this.cls].icon)}</span><small>${CLASSES[this.cls].supName}</small>`;
    $('#b-atk').innerHTML = `<span>${icon({ knight: 'swords', archer: 'archer', mage: 'mage', ninja: 'kill' }[this.cls])}</span>`;
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
    for (const p of s.p) if (!v.projs.has(p[0])) this.sfx(p[1] === 'arrow' ? 'laser' : p[1] === 'fireball' ? 'blaster' : 'laser2', p[2], p[3], 0.5);
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
    $('#me-sup').innerHTML = sup > 0 ? Math.ceil(sup) : icon(CLASSES[this.cls].icon);
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
        this.sfx('hit', x, z, 0.6);
        break;
      }
      case 'hn': v.fx.number(f[1], f[2], '+' + f[3], '#5ee07a'); break;
      case 'sl': v.fx.slash(f[1], f[2], f[3], f[4], f[5]); this.sfx('thud', f[1], f[2], 0.5); break;
      case 'boom': v.fx.boom(f[1], f[2], f[3], f[4]); this.sfx('explode', f[1], f[2], 0.8); break;
      case 'heal': v.fx.ringPulse(f[1], f[2], '#5ee07a', 0.5, f[3], 0.6); v.fx.burst(f[1], 0.5, f[2], '#9dffb0', 18, 3, 0.1, 0.9); break;
      case 'die': v.fx.burst(f[1], 0.8, f[2], '#ffffff', 18, 5, 0.14, 0.8); if (f[3] === this.me) { vibrate([60, 40, 120]); v.shake = 0.6; } break;
      case 'kill': {
        const [, killer, victim, kc, vc] = f;
        killfeed(killer ? `<b style="color:${kc}">${esc(killer)}</b> ${icon('swords')} <b style="color:${vc}">${esc(victim)}</b>` : `${icon('skull')} <b style="color:${vc}">${esc(victim)}</b>`);
        const me = this.roster.get(this.me);
        if (me && killer === me.name) { banner(icon('swords') + ' Ты выбил ' + esc(victim) + '!', 'small', 1500); vibrate(30); Sound.play('confirm', { vol: 0.6 }); }
        break;
      }
      case 'msg': banner(esc(f[1])); break;
      case 'cap': banner(`${icon('flag')} ${esc(f[2])} принёс флаг! +1 команде «${TEAM_NAMES[f[1]]}»`, 'big'); vibrate([40, 40, 40]); break;
      case 'dash': v.fx.burst(f[1], 0.6, f[2], f[3], 10, 4, 0.12, 0.5); break;
      case 'blink': v.fx.burst(f[1], 0.9, f[2], f[5], 14, 3, 0.12, 0.6); v.fx.burst(f[3], 0.9, f[4], f[5], 14, 3, 0.12, 0.6); break;
      case 'tele': v.fx.telegraph(f[1], f[2], f[3], f[4]); break;
      case 'shake': v.shake = Math.max(v.shake, f[1]); break;
      case 'spawn': v.fx.ringPulse(f[1], f[2], '#ffd166', 0.3, 1.6, 0.6); break;
      case 'puff': v.fx.burst(f[1], 1, f[2], '#cccccc', 5, 2, 0.08, 0.3); break;
    }
  }
  sfx(name, x, z, vol = 1) { const me = this.view.ents.get(this.me); if (me) Sound.at(name, x - me.x, z - me.z, 22, { vol, vary: true }); }
  hud(s) {
    const cb = $('#center-big');
    if (s.ph === 'count') { cb.dataset.mode = 'count'; cb.className = 'show'; if (cb.dataset.v !== String(s.c)) { cb.dataset.v = s.c; cb.innerHTML = `<div class="cnt">${s.c}</div>`; vibrate(20); } }
    else if (cb.dataset.mode === 'count') { cb.dataset.mode = ''; cb.dataset.v = ''; cb.className = ''; banner(icon('swords') + ' В бой!', 'big', 1200); Sound.play('j_start', { vol: 0.6 }); }
    $('#hud-timer').style.display = s.tl >= 0 ? '' : 'none';
    if (s.tl >= 0) { $('#hud-timer').textContent = fmtTime(s.tl); $('#hud-timer').classList.toggle('low', s.tl < 15 && s.ph === 'play'); }
    let html = '';
    if (s.ts) {
      const ic = icon(this.mode === 'ctf' ? 'flag' : 'swords'), goal = this.mode === 'ctf' ? 3 : 15;
      const my = this.myInfo ? this.myInfo.team : -1;
      html = `<div class="ts t0 ${my === 0 ? 'mine' : ''}">${s.ts[0]}</div><div class="ts-mid">${ic} до ${goal}</div><div class="ts t1 ${my === 1 ? 'mine' : ''}">${s.ts[1]}</div>`;
    } else if (this.mode === 'pve') {
      html = `<div class="pill">Волна ${Math.max(1, s.wave)}/6</div><div class="pill">${icon('skull')} ${s.left || 0}</div>`;
    }
    if (s.sb) {
      this.sb = s.sb;
      if (this.mode === 'ffa') {
        const sorted = [...s.sb].sort((a, b) => b[1] - a[1]);
        const rank = sorted.findIndex(r => r[0] === this.me) + 1, mine = s.sb.find(r => r[0] === this.me);
        this.ffaHtml = `<div class="pill">${icon('swords')} ${mine ? mine[1] : 0}</div><div class="pill">${icon('medal')} ${rank}/${sorted.length}</div>`;
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
    $('#board-body').innerHTML = `<table><tr><th></th><th>Игрок</th><th>${icon('swords')}</th><th>${icon('skull')}</th><th>${icon('star')}</th></tr>${rows.map(([id, k, d, p]) => {
      const r = this.roster.get(id) || { name: '?' };
      const col = (this.mode === 'tdm' || this.mode === 'ctf') ? TEAM_COLORS[r.team] : '#fff';
      return `<tr class="${id === this.me ? 'me' : ''}"><td><img src="${thumb(r.model || 'character-a')}"></td><td style="color:${col}">${esc(r.name)}${r.bot ? ' ' + icon('bot') : ''}</td><td>${k}</td><td>${d}</td><td>${p}</td></tr>`;
    }).join('')}</table>`;
  }
}

