// Клиент шутера: своё движение, обзор, стрельба, закупка, интерфейс.
import { Pad } from '../gamepad.js';
import * as THREE from 'three';
import { $, $$, esc, clamp, rnd, fmtTime, TEAM_COLORS, TEAM_NAMES, LS } from '../util.js';
import { icon } from '../icons.js';
import { Sound } from '../sound.js';
import { WEAPONS, GEAR, BUY_GROUPS, STYLE_NAMES } from './weapons.js';
import { PH, movePlayer, updateDynamics, rayWorld, rayPlayer } from './smap.js';
const jit = (d, s) => { if (!s) return d; const x = d.x + rnd(-s, s), y = d.y + rnd(-s, s), z = d.z + rnd(-s, s), L = Math.hypot(x, y, z); return { x: x / L, y: y / L, z: z / L }; };
import { S_MONSTERS } from './ssim.js';

const WIDX = Object.keys(WEAPONS);
// захват мыши: «сырое» движение без ускорения Windows — прицел точнее и без задержки
function lockMouse(el) {
  if (!el.requestPointerLock) return;
  try { const r = el.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(() => { try { const r2 = el.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { }); } catch (e) { } }); }
  catch (e) { try { el.requestPointerLock(); } catch (e2) { } }
}
// свои клавиши на компьютере (настройки → «Клавиши»)
export const KEY_DEF = { fwd: ['KeyW', 'Вперёд'], back: ['KeyS', 'Назад'], left: ['KeyA', 'Влево'], right: ['KeyD', 'Вправо'], jump: ['Space', 'Прыжок'], crouch: ['KeyC', 'Присесть'], reload: ['KeyR', 'Перезарядка'], nade: ['KeyG', 'Граната (держать)'], scope: ['KeyF', 'Прицел'], cam: ['KeyV', 'Вид от 1-го / 3-го лица'], buy: ['KeyB', 'Закупка'], med: ['KeyH', 'Аптечка'], prev: ['KeyQ', 'Прошлое оружие'] };
export function keymap() { const s = LS.get('keys', {}) || {}, m = {}; for (const k in KEY_DEF) m[k] = s[k] || KEY_DEF[k][0]; return m; }
export function keyName(code) {
  if (!code) return '—';
  const N = { Space: 'Пробел', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps', Backquote: '`' };
  return N[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
// готовые наборы закупки: из каждой группы берётся первое, на что хватает денег
const KITS = [
  { id: 'sniper', name: 'Снайпер', icon: 'target', groups: [['sniper', 'railgun', 'paint'], ['armor']] },
  { id: 'storm', name: 'Штурмовик', icon: 'rifle', groups: [['rifle', 'plasma', 'smg'], ['grenade'], ['armor']] },
  { id: 'guard', name: 'Защитник', icon: 'shield', groups: [['shotgun', 'snow', 'water'], ['armor'], ['medkit']] }
];
const vib = p => { if (window.__prefs && !window.__prefs.vibe) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
const thumb = m => `assets/thumbs/${m}.png`;
const RECOIL = { bubble: 0.008, pistol: 0.018, laser: 0.012, water: 0.003, smg: 0.012, rifle: 0.016, shotgun: 0.06, sniper: 0.07, plasma: 0.03, railgun: 0.06, paint: 0.01, snow: 0.025, knife: 0, grenade: 0 };

export function shBanner(html, cls = '', ms = 2400) {
  const b = $('#sh-banner'); const d = document.createElement('div'); d.className = 'bn ' + cls; d.innerHTML = html; b.appendChild(d);
  while (b.children.length > 3) b.firstChild.remove();
  setTimeout(() => d.classList.add('out'), ms); setTimeout(() => d.remove(), ms + 500);
}

export class ShooterClient {
  constructor(ctx) {
    this.ctx = ctx; this.view = ctx.view; this.map = ctx.view.map; this.me = ctx.myPid; this.roster = ctx.roster; this.mode = ctx.mode;
    this.surf = { winter: 'snow', island: 'grass', graveyard: 'grass', arena: 'grass', castle: 'concrete', toys: 'wood', moon: 'concrete', street: 'concrete', port: 'concrete', warehouse: 'concrete' }[this.map.theme] || null;
    this.opts = ctx.opts || {};
    this.team = this.mode === 'tdm' || this.mode === 'ctf';
    this.my = this.roster.get(this.me) || {};
    this.p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: true };
    this.yaw = 0; this.pitch = 0; this.alive = false; this.pv = { ammo: {}, money: 0, hp: 100, armor: 0 };
    this.ammo = {}; this.cur = 'pistol'; this.lastFire = 0; this.fireHeld = false; this.firedThisPress = false;
    this.km = keymap();
    { const K = this.km, n = keyName; $('#sh-keys').textContent = `${n(K.fwd)}${n(K.left)}${n(K.back)}${n(K.right)} — ходить · Мышь — смотреть · ЛКМ — огонь · ПКМ/${n(K.scope)} — прицел · ${n(K.reload)} — перезарядка · 1-4/колесо — оружие · ${n(K.nade)} (держать) — граната · ${n(K.buy)} — закупка · ${n(K.crouch)} — присед · ${n(K.cam)} — вид · ${n(K.med)} — аптечка · Tab — счёт`; }
    this.keys = {}; this.joy = null; this.look = null; this.scoped = false; this.buyOpen = false;
    this.camMode = LS.get('cam', 'fps'); this.view.camMode = this.camMode;
    this.offset = null; this.sendT = 0; this.stepT = 0; this.spec = null; this.lastAnim = new Map();
    this.ph = 'buy'; this.locked = false; this.prevWeapon = 'knife';
    this.view.onFrame = dt => this.frame(dt);
    this.view.setViewGun('pistol');
    document.body.dataset.game = 'shooter';
    this.bind();
    this.updateCamBtn();
    Sound.loop('ambient', 0.12);
  }
  dispose() {
    this.view.onFrame = null; this.unbind(); Sound.stopLoops();
    if (document.pointerLockElement) document.exitPointerLock();
    $('#sh-buy').className = ''; $('#sh-dead').className = ''; $('#sh-scope').className = '';
  }
  info(id) { return this.roster.get(id) || { name: '?', model: 'character-a' }; }
  name(id) { if (!id) return ''; if (String(id).startsWith('m')) { const e = this.view.ents.get(id); return e ? e.meta.name || 'Монстр' : 'Монстр'; } return this.info(id).name; }
  isEnemyId(id) {
    if (id === this.me) return false;
    if (String(id).startsWith('m')) return true;
    if (this.mode === 'pve') return false;
    if (this.team) return this.info(id).team !== this.my.team;
    return true;
  }

  // ---------- ввод ----------
  bind() {
    const L = this.listeners = [];
    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); L.push([el, ev, fn, o]); };
    const scr = $('#s-shoot');
    on(document, 'keydown', e => this.keyDown(e));
    on(document, 'keyup', e => { this.keys[e.code] = false; if (e.code === this.km.nade && this.nadeAim) { this.nadeAim = false; this.throwNade(); } if (e.code === this.km.crouch || e.code === 'ControlLeft') this.setCrouch(false); if (e.code === 'Tab') $('#sh-board').classList.remove('show'); });
    on(document, 'mousemove', e => { if (document.pointerLockElement) { const mx = e.movementX, my = e.movementY; if (Math.abs(mx) > 400 || Math.abs(my) > 400) return; /* баг браузера: случайный скачок */ const s = (LS.get('sens', 1)) * 0.0022 / this.view.zoom; this.yaw -= mx * s; this.pitch = clamp(this.pitch - my * s, -1.45, 1.45); } });
    on(document, 'pointerlockchange', () => { this.locked = !!document.pointerLockElement; this.updateLock(); });
    on(scr, 'mousedown', e => {
      if (window.__touch) return;
      if (!document.pointerLockElement) { if (!e.target.closest('button,.sh-modal,#sh-buy')) lockMouse(scr); return; }
      if (e.button === 0) { this.fireHeld = true; this.firedThisPress = true; this.doFire(); }
      if (e.button === 2) this.toggleScope(true);
    });
    on(document, 'mouseup', e => { if (e.button === 0) this.fireHeld = false; if (e.button === 2 && this.scopeHold) this.toggleScope(false); });
    on(scr, 'contextmenu', e => e.preventDefault());
    on(document, 'wheel', e => { if (document.pointerLockElement) this.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    // касания: отслеживаем пальцы по touch-событиям и сверяем с e.touches — ничего не «залипает»
    on(scr, 'touchstart', e => this.tStart(e), { passive: false });
    on(scr, 'touchmove', e => this.tMove(e), { passive: false });
    on(document, 'touchend', e => this.tEnd(e), { passive: false });
    on(document, 'touchcancel', e => this.tEnd(e), { passive: false });
    on(window, 'blur', () => this.releaseAll());
    on(document, 'visibilitychange', () => this.releaseAll());
    const btn = (id, fn) => { const b = $(id); on(b, 'pointerdown', e => { if (e.pointerType !== 'mouse') return; e.preventDefault(); e.stopPropagation(); fn(); }); b._tap = fn; };
    btn('#sh-jump', () => { this.jumpReq = true; if (this.crouch) this.setCrouch(false); });
    btn('#sh-crouch', () => this.setCrouch());
    btn('#sh-reload', () => this.reload());
    btn('#sh-aim', () => this.toggleScope());
    btn('#sh-nade', () => this.throwNade()); $('#sh-nade')._tap = null; // на телефоне: держать — прицел, отпустить — бросок
    btn('#sh-switch', () => this.cycle(1));
    btn('#sh-med', () => this.ctx.send({ t: 'medkit' }));
    btn('#sh-cam', () => this.toggleCam());
    btn('#sh-buyb', () => this.toggleBuy());
    on($('#sh-lock'), 'click', e => { if (e.target.closest('[data-act]')) return; lockMouse($('#s-shoot')); });
    on($('#sh-buy'), 'pointerdown', e => e.stopPropagation());
    on($('#sh-buy'), 'click', e => { const kb = e.target.closest('[data-kit]'); if (kb) { const k = kb.dataset.kit; this.buyList(k === 'last' ? (this.prevBuys || []).map(x => [x]) : KITS.find(x => x.id === k).groups); return; } const b = e.target.closest('[data-item]'); if (b) this.buy(b.dataset.item); if (e.target.closest('#sh-buy-x')) this.toggleBuy(false); if (e.target.closest('#sh-buy-ready')) { this.buyReady(); this.toggleBuy(false); } });
  }
  unbind() { for (const [el, ev, fn, o] of this.listeners) el.removeEventListener(ev, fn, o); }
  keyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    this.keys[e.code] = true;
    const k = e.code, K = this.km;
    if ([K.jump, 'Tab', K.buy].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (k === K.jump) this.jumpReq = true;
    else if (k === K.reload) this.reload();
    else if (k === 'Digit1') this.switchTo(this.pv.slot1);
    else if (k === 'Digit2') this.switchTo(this.pv.slot2);
    else if (k === 'Digit3') this.switchTo('knife');
    else if (k === 'Digit4') this.switchTo('grenade');
    else if (k === K.nade) { if (this.alive && this.pv.nades > 0 && this.ph === 'play') this.nadeAim = true; }
    else if (k === K.prev) this.switchTo(this.prevWeapon);
    else if (k === K.cam) this.toggleCam();
    else if (k === K.buy) this.toggleBuy();
    else if (k === K.med) this.ctx.send({ t: 'medkit' });
    else if (k === 'KeyX') this.ctx.send({ t: 'emo' });
    else if (k === 'Tab') { $('#sh-board').classList.add('show'); this.renderBoard(); }
    else if (k === K.scope) this.toggleScope();
    else if (k === K.crouch || k === 'ControlLeft') this.setCrouch(true);
  }
  tStart(e) {
    window.__touch = true;
    const ui = e.target.closest && e.target.closest('#sh-buy,.sh-modal,#sh-board');
    // обычные кнопки (пауза и т.п.) получают настоящий клик — иначе браузер не даст, например, включить полный экран
    const plainBtn = [...e.changedTouches].some(t => { const b = t.target.closest && t.target.closest('button'); return b && !b._tap && !['sh-fire', 'sh-fire2', 'sh-nade'].includes(b.id); });
    if (!ui && !plainBtn) e.preventDefault(); // без этого браузер зумит страницу двойным тапом и щипком
    for (const t of e.changedTouches) {
      const el = t.target.closest ? t.target.closest('button,#sh-buy,.sh-modal,#sh-board') : null;
      if (el && el.id === 'sh-nade') { if (this.alive && this.pv.nades > 0 && this.ph === 'play') { this.nadeAim = true; this.nadeId = t.identifier; } continue; }
      if (el && (el.id === 'sh-fire' || el.id === 'sh-fire2')) {
        this.fireHeld = true; this.firedThisPress = true; this.doFire();
        if (el.id === 'sh-fire' && !this.look) this.look = { id: t.identifier, x: t.clientX, y: t.clientY, fire: true }; else this.fireId = t.identifier;
        continue;
      }
      if (el) { if (!ui && el._tap) { el._tap(); vib(10); } continue; }
      if (t.clientX < innerWidth * 0.42 && !this.joy) { this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }; this.drawJoy(); }
      else if (!this.look) this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }
  tMove(e) {
    if (!(e.target.closest && e.target.closest('#sh-buy,.sh-modal,#sh-board'))) e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.joy && t.identifier === this.joy.id) { this.joy.x = t.clientX; this.joy.y = t.clientY; this.drawJoy(); }
      if (this.look && t.identifier === this.look.id) {
        const s = (LS.get('sens', 1)) * 0.0065 / this.view.zoom;
        this.yaw -= (t.clientX - this.look.x) * s; this.pitch = clamp(this.pitch - (t.clientY - this.look.y) * s, -1.45, 1.45);
        this.look.x = t.clientX; this.look.y = t.clientY;
      }
    }
  }
  tEnd(e) {
    const alive = new Set([...e.touches].map(t => t.identifier));
    if (this.joy && !alive.has(this.joy.id)) { this.joy = null; this.drawJoy(); }
    if (this.look && !alive.has(this.look.id)) { if (this.look.fire) this.fireHeld = false; this.look = null; }
    if (this.fireId != null && !alive.has(this.fireId)) { this.fireId = null; this.fireHeld = false; }
    if (this.nadeId != null && !alive.has(this.nadeId)) { this.nadeId = null; if (this.nadeAim) { this.nadeAim = false; this.throwNade(); } }
    if (!e.touches.length) { this.fireHeld = false; this.fireId = null; }
  }
  releaseAll() { this.nadeAim = false; this.nadeId = null; this.joy = null; this.look = null; this.fireId = null; this.fireHeld = false; this.keys = {}; this.drawJoy(); }
  drawJoy() {
    const el = $('#joy');
    if (!this.joy) { el.style.display = 'none'; return; }
    const j = this.joy; let dx = j.x - j.ox, dy = j.y - j.oy; const m = Math.hypot(dx, dy), R = 56;
    if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    el.style.display = 'block'; el.style.left = j.ox + 'px'; el.style.top = j.oy + 'px';
    el.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  }
  moveInput() {
    let f = 0, s = 0;
    if (Pad.connected && (Pad.lx || Pad.ly)) { s = Pad.lx; f = -Pad.ly; const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; } }
    else if (this.joy) { let dx = (this.joy.x - this.joy.ox) / 50, dy = (this.joy.y - this.joy.oy) / 50; const m = Math.hypot(dx, dy); if (m > 0.15) { if (m > 1) { dx /= m; dy /= m; } s = dx; f = -dy; } }
    else { const k = this.keys, K = this.km; f = (k[K.fwd] || k.ArrowUp ? 1 : 0) - (k[K.back] || k.ArrowDown ? 1 : 0); s = (k[K.right] || k.ArrowRight ? 1 : 0) - (k[K.left] || k.ArrowLeft ? 1 : 0); const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; } }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    return { mx: fx * f + rx * s, mz: fz * f + rz * s, moving: Math.hypot(f, s) > 0.1 };
  }

  // ---------- действия ----------
  owned() { return [this.pv.slot1, this.pv.slot2, 'knife', this.pv.nades > 0 ? 'grenade' : null].filter(Boolean); }
  switchTo(w) {
    if (!w || !this.owned().includes(w) || w === this.cur) return;
    if (w !== 'grenade') this.prevWeapon = this.cur;
    this.cur = w; this.toggleScope(false); this.view.setViewGun(w); this.ctx.send({ t: 'switch', w });
    Sound.play('select', { vol: 0.4 });
    this.updateWeaponHUD();
  }
  cycle(d) { const list = this.owned().filter(w => w !== 'grenade'); const i = list.indexOf(this.cur); this.switchTo(list[(i + d + list.length) % list.length]); }
  reload() {
    const W = WEAPONS[this.cur], a = this.ammo[this.cur];
    if (!W || !W.mag || !a || a[0] >= W.mag || a[1] <= 0) return;
    this.ctx.send({ t: 'reload' }); this.reloadUntil = performance.now() / 1000 + W.reload; Sound.play('tick', { vol: 0.5 }); this.toggleScope(false);
  }
  toggleScope(v) {
    const W = WEAPONS[this.cur];
    const want = v == null ? !this.scoped : v;
    this.scopeHold = v === true;
    this.scoped = want && !!(W && W.zoom);
    this.view.scoped = this.scoped; this.view.zoom = this.scoped ? W.zoom : 1;
    $('#sh-scope').className = this.scoped ? 'show' : '';
  }
  toggleCam() { this.camMode = this.camMode === 'fps' ? 'tps' : 'fps'; this.view.camMode = this.camMode; LS.set('cam', this.camMode); this.updateCamBtn(); Sound.play('toggle', { vol: 0.5 }); }
  updateCamBtn() { $('#sh-cam').querySelector('small').textContent = this.camMode === 'fps' ? '1-е лицо' : '3-е лицо'; }
  throwNade() {
    if (!this.alive || this.pv.nades <= 0 || this.ph !== 'play') return;
    const prev = this.cur; this.cur = 'grenade';
    this.doFire(true);
    this.cur = prev;
  }
  buy(item) {
    if (!this.pv.buy) { Sound.play('error'); return; }
    const price = WEAPONS[item] ? WEAPONS[item].price : GEAR[item].price;
    if (this.pv.money < price) { Sound.play('error'); shBanner('Не хватает денег', 'small', 1200); return; }
    this.ctx.send({ t: 'buy', item });
  }
  toggleBuy(v) {
    const want = v == null ? !this.buyOpen : v;
    if (!want && this.buyOpen && this.ph === 'buy') this.buyReady();
    if (want && !this.pv.buy) { shBanner('Сейчас закупка недоступна', 'small', 1200); return; }
    this.buyOpen = want;
    $('#sh-buy').className = want ? 'show' : '';
    if (want) { this.buyKey = null; this.renderBuy(); if (document.pointerLockElement) document.exitPointerLock(); Sound.play('open', { vol: 0.5 }); }
    else if (!window.__touch && this.alive) lockMouse($('#s-shoot'));
  }
  aimPoint() {
    // точка, куда смотрит камера (для вида от 3-го лица)
    const cam = this.view.camera, o = cam.position.clone(), d = new THREE.Vector3(); cam.getWorldDirection(d);
    let best = rayWorld(this.map, o, d, 120).t;
    for (const [id, a] of this.view.ents) {
      if (id === this.me || !a.root.visible || a.dead) continue;
      const h = rayPlayer(o, d, { x: a.x, y: a.y, z: a.z }, best, a.meta.scale || 1, !!(a.fl & 256)); if (h) best = h.t;
    }
    return o.addScaledVector(d, best);
  }
  doFire(force) {
    const W = WEAPONS[this.cur]; if (!W || !this.alive || this.ph !== 'play' || this.buyOpen) return;
    const now = performance.now() / 1000;
    if (now - this.lastFire < W.rate) return;
    if (this.reloadUntil && now < this.reloadUntil) return;
    if (W.mag) { const a = this.ammo[this.cur]; if (!a || a[0] <= 0) { if (!this.clicked) { Sound.play('click', { vol: 0.5 }); this.clicked = true; } this.reload(); return; } a[0]--; }
    this.clicked = false;
    this.lastFire = now;
    const eye = new THREE.Vector3(this.p.x, this.p.y + this.eyeH(), this.p.z);
    const aim = this.aimPoint();
    const d = aim.clone().sub(eye).normalize();
    const msg = { t: 'fire', w: this.cur, o: { x: +eye.x.toFixed(3), y: +eye.y.toFixed(3), z: +eye.z.toFixed(3) }, d: { x: +d.x.toFixed(4), y: +d.y.toFixed(4), z: +d.z.toFixed(4) }, sc: this.scoped ? 1 : 0 };
    let shots = null;
    if (!W.melee && !W.throw && !W.proj) {
      // попадание считаем по тому, что видно на экране, хост только проверяет
      const moving = Math.hypot(this.p.vx, this.p.vz) > 1.5 || !this.p.ground;
      const spread = (this.scoped && W.scopeSpread != null ? W.scopeSpread : W.spread) + (moving ? W.moveSpread || 0 : 0) * (this.crouch ? 0.6 : 1);
      const n = W.pellets || 1; msg.ds = []; msg.hs = []; shots = [];
      for (let i = 0; i < n; i++) {
        const dd = jit(d, spread * (this.crouch ? 0.7 : 1));
        let end = rayWorld(this.map, eye, dd, W.range || 80).t, hit = 0;
        for (const [id, a] of this.view.ents) {
          if (id === this.me || a.dead || !a.root.visible || !this.isEnemyId(id)) continue;
          const h = rayPlayer(eye, dd, { x: a.x, y: a.y, z: a.z }, end, (a.meta.scale || 1) * 1.08, !!(a.fl & 256));
          if (h) { end = h.t; hit = [id, h.head ? 1 : 0, +h.t.toFixed(2)]; }
        }
        msg.ds.push({ x: +dd.x.toFixed(4), y: +dd.y.toFixed(4), z: +dd.z.toFixed(4) }); msg.hs.push(hit);
        shots.push(eye.clone().addScaledVector(new THREE.Vector3(dd.x, dd.y, dd.z), end));
      }
    }
    this.ctx.send(msg);
    // отдача и эффекты у себя
    this.view.kick(this.cur === 'shotgun' || this.cur === 'sniper' ? 1.4 : 0.7);
    this.pitch = clamp(this.pitch + (RECOIL[this.cur] || 0.01) * (this.scoped ? 0.5 : 1), -1.45, 1.45);
    this.yaw += rnd(-0.004, 0.004);
    Sound.play(W.sound || (W.throw ? 'drop' : 'thud'), { vol: 0.7, vary: true });
    if (!W.melee && !W.throw && !W.proj) {
      const muzzle = this.muzzle();
      (shots || [aim]).slice(0, 4).forEach(e => this.view.tracer(muzzle, e, W.tracer || '#ffe08a', W.beam));
    }
    if (this.cur === 'grenade') { this.updateWeaponHUD(); }
    vib(W.pellets || this.cur === 'sniper' ? 25 : 8);
    if (W.mag && this.ammo[this.cur][0] <= 0) setTimeout(() => this.reload(), 200);
    this.updateWeaponHUD();
  }
  updateArc() {
    const show = this.alive && this.ph === 'play' && this.pv.nades > 0 && (this.nadeAim || this.cur === 'grenade') && !this.buyOpen;
    if (!show) { this.view.setArc(null); return; }
    const eye = new THREE.Vector3(this.p.x, this.p.y + this.eyeH(), this.p.z), d = this.aimPoint().sub(eye).normalize();
    // тот же полёт, что считает хост: скорость 17, вверх 3, тяжесть 22
    let p = { x: eye.x + d.x * 0.5, y: eye.y + d.y * 0.5, z: eye.z + d.z * 0.5 }, v = { x: d.x * 17, y: d.y * 17 + 3, z: d.z * 17 };
    const pts = [p], dt = 1 / 30;
    for (let i = 0; i < 70; i++) {
      v.y -= 22 * dt;
      const n = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
      const seg = { x: n.x - p.x, y: n.y - p.y, z: n.z - p.z }, L = Math.hypot(seg.x, seg.y, seg.z) || 1e-6;
      const h = rayWorld(this.map, p, { x: seg.x / L, y: seg.y / L, z: seg.z / L }, L);
      if (h.b) { pts.push({ x: p.x + seg.x / L * h.t, y: p.y + seg.y / L * h.t, z: p.z + seg.z / L * h.t }); break; }
      pts.push(n); p = n;
    }
    this.view.setArc(pts);
  }
  eyeH() { return this.eyeY ?? PH.EYE; }
  setCrouch(v) { this.crouch = v == null ? !this.crouch : v; const b = $('#sh-crouch'); if (b) b.classList.toggle('on', this.crouch); }
  muzzle() {
    const cam = this.view.camera, d = new THREE.Vector3(); cam.getWorldDirection(d);
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (this.camMode === 'fps') return cam.position.clone().addScaledVector(d, 0.6).addScaledVector(r, 0.18).add(new THREE.Vector3(0, -0.15, 0));
    return new THREE.Vector3(this.p.x, this.p.y + 1.25, this.p.z).addScaledVector(d, 0.7).addScaledVector(r, 0.25);
  }

  // геймпад: левый стик — ходить, правый — смотреть, RT — огонь, LT — прицел, A — прыжок, B — присед,
  // X — перезарядка, Y — оружие, RB — граната (держать), LB — аптечка, крестовина вверх — закупка, вниз — вид, Старт — меню
  padInput(dt) {
    if (!Pad.connected) return;
    if (!this.padSeen) { this.padSeen = true; this.updateLock(); }
    if (document.querySelector('.modal.show')) { if (Pad.hit(9) || Pad.hit(1)) document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show')); return; }
    const s = (LS.get('sens', 1)) * 2.6 / this.view.zoom;
    if (Pad.rx || Pad.ry) { this.yaw -= Pad.rx * Math.abs(Pad.rx) * s * dt; this.pitch = clamp(this.pitch - Pad.ry * Math.abs(Pad.ry) * s * 0.75 * dt, -1.45, 1.45); }
    if (Pad.hit(7)) { this.fireHeld = true; this.firedThisPress = true; this.doFire(); }
    if (Pad.up(7)) this.fireHeld = false;
    if (Pad.hit(6)) this.toggleScope(true); if (Pad.up(6) && this.scoped) this.toggleScope(false);
    if (Pad.hit(0)) { this.jumpReq = true; if (this.crouch) this.setCrouch(false); }
    if (Pad.hit(1)) this.setCrouch();
    if (Pad.hit(2)) this.reload();
    if (Pad.hit(3)) this.cycle(1);
    if (Pad.hit(5) && this.alive && this.pv.nades > 0 && this.ph === 'play') this.nadeAim = true;
    if (Pad.up(5) && this.nadeAim) { this.nadeAim = false; this.throwNade(); }
    if (Pad.hit(4)) this.ctx.send({ t: 'medkit' });
    if (Pad.hit(12)) this.toggleBuy();
    if (Pad.hit(13)) this.toggleCam();
    if (Pad.hit(8)) $('#sh-board').classList.toggle('show');
    if (Pad.hit(9)) document.querySelector('#s-shoot [data-act=pause]').click();
  }
  // ---------- кадр ----------
  frame(dt) {
    const now = performance.now() / 1000;
    const simT = this.offset != null ? now + this.offset : 0;
    this.view.simTime = simT;
    updateDynamics(this.map, simT);
    const frozen = this.ph === 'buy' || this.ph === 'over';
    this.padInput(dt);
    const mv = this.moveInput();
    if (this.alive) {
      let mul = this.scoped ? 0.5 : 1;
      if (this.pv.freeze) mul *= 0.3; else if (this.pv.slow) mul *= 0.6;
      if (frozen) mul = 0;
      if (this.cur === 'knife') mul *= 1.12;
      if (this.crouch) mul *= 0.5;
      movePlayer(this.map, this.p, { mx: mv.mx, mz: mv.mz, jump: this.jumpReq && !frozen, speedMul: mul }, dt);
      // метро: вошёл в подземный переход — вышел из другого
      if (this.map.portals && !frozen && now - (this.portT || 0) > 2) for (const pt of this.map.portals) {
        if (Math.hypot(this.p.x - pt.a.x, this.p.z - pt.a.z) < 0.9 && this.p.y < 0.5) { Object.assign(this.p, { x: pt.b.x, z: pt.b.z, vx: 0, vz: 0 }); this.yaw = pt.b.yaw; this.portT = now; Sound.play('vent', { vol: 0.6 }); shBanner(`${icon('compass')} Метро!`, 'small', 900); this.ctx.send({ t: 'pos', x: +this.p.x.toFixed(2), y: 0, z: +this.p.z.toFixed(2), yaw: this.yaw, pitch: this.pitch, vx: 0, vz: 0, portal: 1 }); break; }
      }
      this.aimHelp(dt);
      if (this.fireHeld) { const W = WEAPONS[this.cur]; if (W && (W.auto || !this.firedThisPress)) { this.doFire(); this.firedThisPress = true; } }
      // шаги
      if (mv.moving && this.p.ground && !frozen) { this.stepT -= dt; if (this.stepT <= 0) { this.stepT = this.scoped ? 0.5 : 0.36; Sound.play(Sound.step(this.surf), { vol: 0.25, vary: true }); } }
    }
    this.jumpReq = false;
    this.updateArc();
    { const want = this.crouch && this.alive ? PH.CEYE : PH.EYE; this.eyeY = (this.eyeY ?? PH.EYE) + (want - (this.eyeY ?? PH.EYE)) * Math.min(1, dt * 12); }
    // камера
    let eye;
    if (this.alive) eye = new THREE.Vector3(this.p.x, this.p.y + this.eyeH(), this.p.z);
    else {
      // первые секунды после гибели — смотрим на того, кто выбил, потом наблюдаем за своими
      const since = performance.now() / 1000 - (this.diedAt || 0);
      const killer = this.killerId && this.view.ents.get(this.killerId);
      const t = since > 3.5 ? this.spectateTarget() : null;
      this.view.camMode = 'tps';
      if (t) { eye = new THREE.Vector3(t.x, t.y + PH.EYE, t.z); this.specLabel(t); }
      else {
        eye = new THREE.Vector3(this.p.x, this.p.y + PH.EYE, this.p.z);
        if (killer && killer !== this.view.ents.get(this.me)) { const want = Math.atan2(-(killer.x - this.p.x), -(killer.z - this.p.z)); let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; this.yaw += d * Math.min(1, dt * 3); this.pitch *= 0.95; }
        this.specLabel(null);
      }
    }
    if (this.alive) this.view.camMode = this.camMode;
    this.view.eye.copy(eye); this.view.yaw = this.yaw; this.view.pitch = this.pitch;
    // присед у других игроков
    for (const [id, a] of this.view.ents) {
      const cr = !!(a.fl & 256) && !a.dead; a.root.scale.y += ((cr ? 0.72 : 1) - a.root.scale.y) * Math.min(1, dt * 12);
    }
    this.view.alive = this.alive; this.view.moving = mv.moving && this.alive;
    this.view.reloading = this.reloadUntil && now < this.reloadUntil;
    this.view.melee = !!(WEAPONS[this.cur] || {}).melee; this.view.crouch = !!this.crouch;
    // своя фигура
    const meA = this.view.ents.get(this.me);
    if (meA) {
      meA.setVisible(this.alive && this.view.camMode === 'tps');
      meA.setTarget(this.p.x, this.p.z, this.yaw + Math.PI, this.p.y); meA.snap();
      const a = !this.alive ? 5 : (mv.moving ? 1 : 12);
      if (meA.anim !== a && !(meA.anim === 9 && performance.now() - (meA.shotAt || 0) < 250)) meA.play(a);
      if (performance.now() / 1000 - this.lastFire < 0.05) { meA.shotAt = performance.now(); meA.play(9, true); }
      if (this.cur) meA.setGun(this.cur, WEAPONS[this.cur]);
    }
    // отправка позиции
    this.sendT -= dt;
    if (this.sendT <= 0 && this.alive) {
      this.sendT = 0.05;
      this.ctx.send({ t: 'pos', x: +this.p.x.toFixed(2), y: +this.p.y.toFixed(2), z: +this.p.z.toFixed(2), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3), vx: +this.p.vx.toFixed(1), vz: +this.p.vz.toFixed(1), anim: mv.moving ? 1 : 0, sc: this.scoped ? 1 : 0, cr: this.crouch ? 1 : 0 });
    }
    this.hudFrame();
  }
  specLabel(t) {
    const el = $('#sh-spec'); if (!el) return;
    const txt = t ? `${icon('eye')} Смотришь за: <b>${esc(t.meta.name || '')}</b>` : '';
    if (el.dataset.t !== txt) { el.dataset.t = txt; el.innerHTML = txt; el.className = txt ? 'show' : ''; }
    $('#sh-dead').classList.toggle('mini', !!t);
  }
  // помощь в прицеливании на телефоне: прицел слегка «липнет» к врагу, автоогонь
  aimHelp(dt) {
    if (!(window.__touch || Pad.connected) || this.ph !== 'play' || this.buyOpen || LS.get('aimhelp', true) === false) return;
    const W = WEAPONS[this.cur]; if (!W || W.throw) return;
    const eye = { x: this.p.x, y: this.p.y + this.eyeH(), z: this.p.z };
    const cp = Math.cos(this.pitch), fwd = { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
    const range = W.melee ? 2.4 : Math.min(W.range || 45, 60);
    let best = null;
    for (const [id, a] of this.view.ents) {
      if (a.dead || !a.root.visible || !this.isEnemyId(id)) continue;
      const sc = (a.meta && a.meta.scale) || 1;
      const tx = a.x - eye.x, ty = a.y + 1.05 * sc - eye.y, tz = a.z - eye.z, L = Math.hypot(tx, ty, tz);
      if (L > range || L < 0.3) continue;
      const ang = Math.acos(clamp((tx * fwd.x + ty * fwd.y + tz * fwd.z) / L, -1, 1));
      const lim = Math.min(0.4, 0.1 + 0.9 / L);
      if (ang > lim || (best && ang > best.ang)) continue;
      const dir = { x: tx / L, y: ty / L, z: tz / L };
      if (rayWorld(this.map, eye, dir, L).t < L - 0.4) continue;
      best = { ang, L, yaw: Math.atan2(-tx, -tz), pitch: Math.atan2(ty, Math.hypot(tx, tz)) };
    }
    if (!best) return;
    const k = Math.min(1, dt * 2.2);
    let d = best.yaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * k; this.pitch += (best.pitch - this.pitch) * k;
    if (LS.get('autofire', true) !== false && best.ang < Math.max(0.06, 0.55 / best.L)) this.doFire();
  }
  spectateTarget() {
    let best = null;
    for (const [id, a] of this.view.ents) { if (id === this.me || a.dead || String(id).startsWith('m') || (this.team && this.isEnemyId(id))) continue; best = a; if (id === this.spec) break; }
    if (best) this.spec = [...this.view.ents].find(([, a]) => a === best)[0];
    return best;
  }

  // ---------- сообщения ----------
  onMsg(m) {
    switch (m.t) {
      case 's2': this.snapshot(m); break;
      case 'me2': this.privateState(m); break;
      case 'spawn': this.setCrouch(false); Object.assign(this.p, { x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0 }); this.yaw = m.yaw; this.pitch = 0; this.alive = true; $('#sh-dead').className = ''; this.specLabel(null); this.releaseAll(); this.toggleScope(false); this.reloadUntil = 0; break;
      case 'flash': { const el = $('#flashfx'); el.style.transition = 'none'; el.style.opacity = Math.min(1, m.k * 1.1); void el.offsetWidth; el.style.transition = `opacity ${1.2 + m.k * 2}s ease-in`; el.style.opacity = 0; Sound.play('lights', { vol: 0.7 }); vib(60); break; }
      case 'paint': { const el = $('#paintfx'); el.innerHTML = Array.from({ length: 7 }, () => `<i style="left:${rnd(5, 85)}%;top:${rnd(5, 80)}%;width:${rnd(80, 190)}px;height:${rnd(80, 190)}px;background:${['#ff4dc4', '#ffd23f', '#3dd6d0', '#8cff5a'][Math.random() * 4 | 0]}"></i>`).join(''); el.className = ''; void el.offsetWidth; el.className = 'on'; Sound.play('slime', { vol: 0.7 }); break; }
      case 'kb': this.p.vx += m.vx; this.p.vz += m.vz; this.p.vy = Math.max(this.p.vy, m.vy); this.p.ground = false; break;
      case 'bought': Sound.play('drop'); vib(15); this.roundBuys = this.roundBuys || []; this.roundBuys.push(m.item); LS.set('lastBuy', this.roundBuys); if (WEAPONS[m.item] && WEAPONS[m.item].slot === 1) { setTimeout(() => this.switchTo(m.item), 120); } break;
    }
  }
  privateState(m) {
    const wasAlive = this.alive;
    this.pv = m;
    const now = performance.now() / 1000;
    for (const [w, a] of Object.entries(m.ammo)) {
      if (w === this.cur && now - this.lastFire < 0.4 && this.ammo[w]) continue;
      this.ammo[w] = [...a];
    }
    if (!m.reload && this.reloadUntil && now > this.reloadUntil - 0.2) this.reloadUntil = 0;
    if (m.reload) this.reloadUntil = now + m.reload;
    if (!this.owned().includes(this.cur)) { this.cur = m.cur; this.view.setViewGun(this.cur); }
    if (wasAlive && !m.alive) { this.alive = false; this.toggleScope(false); }
    if (!m.alive) this.alive = false;
    if (this.buyOpen) { if (!m.buy) this.toggleBuy(false); else this.renderBuy(); }
    if (this.wantBuy && m.buy && m.alive) { this.wantBuy = false; if (!this.buyOpen) this.toggleBuy(true); }
    if (this.ph !== 'buy') this.wantBuy = false;
    this.updateWeaponHUD();
    $('#sh-buyb').style.display = m.buy ? '' : 'none';
    $('#sh-med').style.display = m.medkit > 0 ? '' : 'none';
  }
  snapshot(s) {
    const now = performance.now() / 1000;
    const off = s.tm - now;
    this.offset = this.offset == null ? off : this.offset * 0.9 + off * 0.1;
    if (s.ph !== this.ph || !this.snap) this.phaseChange(this.snap ? this.ph : null, s.ph);
    this.ph = s.ph; this.snap = s;
    const v = this.view, seen = new Set();
    const meRow = s.e.find(r => r[0] === this.me);
    for (const row of s.e) {
      const [id, k, x, y, z, yaw, pitch, anim, hp, fl, w] = row;
      seen.add(id);
      const a = v.ensureEnt(id, k); if (!a) continue;
      a.dead = !!(fl & 1); a.hp = hp; a.fl = fl;
      if (id === this.me) continue;
      a.setTarget(x, z, yaw + Math.PI, y); if (a.fresh) { a.fresh = false; a.snap(); }
      // шаги других слышно с нужной стороны (присевших не слышно)
      if (id !== this.me && !(fl & 1) && !(fl & 256)) { const mvd = Math.hypot(x - (a.lx ?? x), z - (a.lz ?? z)); a.stepT = (a.stepT || 0) - 0.05; if (mvd > 0.12 && a.stepT <= 0) { a.stepT = 0.38; this.snd(Sound.step(this.surf), x, z, 0.4, 16); } }
      a.lx = x; a.lz = z;
      const mon = String(k).startsWith('m:');
      if (mon) a.setHP(hp, w); else { a.setHP(hp, 100); if (w >= 0) a.setGun(WIDX[w], WEAPONS[WIDX[w]]); }
      const n = anim >> 4, code = anim & 15;
      let want = a.dead ? 5 : code === 1 ? 1 : mon ? 0 : 12;
      if (this.lastAnim.get(id) !== n) { this.lastAnim.set(id, n); if (!a.dead) { a.play(mon ? 3 : 9, true); a.shotAt = now; } }
      if (a.anim !== want && !a.dead && (a.anim !== 9 && a.anim !== 3 || now - (a.shotAt || 0) > 0.3)) a.play(want);
      if (a.dead && a.anim !== 5) a.play(5, true);
      // подпись и видимость имени врага
      const enemy = this.isEnemyId(id);
      if (a.plateEl) {
        const marked = !!(fl & 4);
        const me = this.p, dist = Math.hypot(x - me.x, z - me.z);
        const show = !a.dead && (!enemy || marked || dist < 18);
        a.plateEl.style.display = show ? '' : 'none';
        a.plateEl.classList.toggle('marked', marked);
      }
      a.setAlpha(fl & 2 ? (Math.floor(now * 8) % 2 ? 0.4 : 1) : 1);
    }
    for (const id of [...v.ents.keys()]) if (!seen.has(id)) v.removeEnt(id);
    v.syncProjectiles(s.p);
    v.syncChests(s.ch || []);
    if (s.fl) v.syncFlags(s.fl);
    for (const f of s.fx) this.fx(f);
    this.hud(s);
  }
  phaseChange(from, to) {
    if (to === 'buy') this.wantBuy = true;
    if (to === 'buy') { this.isReady = false; this.prevBuys = LS.get('lastBuy', []) || []; this.roundBuys = []; this.buyKey = null; }
    if (to === 'play') { if (this.buyOpen) this.toggleBuy(false); shBanner(`${icon('swords')} В бой!`, 'big', 1300); Sound.play('j_start', { vol: 0.6 }); }
  }
  pos3(x, y, z) { return { dx: x - this.p.x, dz: z - this.p.z }; }
  snd(name, x, z, vol = 1, maxD = 30) { Sound.at(name, x - this.p.x, z - this.p.z, maxD, { vol, vary: true, right: { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) } }); }
  fx(f) {
    const v = this.view, type = f[0];
    switch (type) {
      case 'tr': {
        const [, sid, ox, oy, oz, ex, ey, ez, w, hit] = f; const W = WEAPONS[w] || {};
        if (sid !== this.me) {
          const a = v.ents.get(sid);
          const o = a ? { x: a.x, y: a.y + 1.3, z: a.z } : { x: ox, y: oy, z: oz };
          v.tracer(o, { x: ex, y: ey, z: ez }, W.tracer || '#ffe08a', W.beam);
          this.snd(W.sound || 'hit', ox, oz, 0.7, 40);
        }
        if (!hit) {
          const dir = { x: ex - ox, y: ey - oy, z: ez - oz };
          const wh = rayWorld(this.map, { x: ox, y: oy, z: oz }, (L => ({ x: dir.x / L, y: dir.y / L, z: dir.z / L }))(Math.hypot(dir.x, dir.y, dir.z) || 1), 200);
          if (w === 'paint') { v.decal({ x: ex, y: ey, z: ez }, wh.axis ?? 1, dir, ['#ff4dc4', '#4dff88', '#ffd23f', '#4da3ff'][Math.random() * 4 | 0], 0.28); v.burst(ex, ey, ez, '#ff4dc4', 6, 2, 0.06, 0.4); }
          else if (w === 'water') v.burst(ex, ey, ez, '#7cc9ff', 6, 2, 0.06, 0.4);
          else { v.decal({ x: ex, y: ey, z: ez }, wh.axis ?? 1, dir); v.burst(ex, ey, ez, '#ffd27a', 4, 3, 0.04, 0.3); }
        }
        break;
      }
      case 'shot': { const [, sid, w] = f; if (sid !== this.me) { const a = v.ents.get(sid); if (a) this.snd(WEAPONS[w] && WEAPONS[w].sound || 'thud', a.x, a.z, 0.7, 35); } break; }
      case 'hit': {
        const [, tid, dmg, head, sid, x, y, z] = f;
        const a = v.ents.get(tid); if (a) a.flash();
        v.burst(x, y, z, head ? '#ffd23f' : '#ffffff', head ? 10 : 5, 3, 0.05, 0.35);
        if (sid === this.me && tid !== this.me) { this.hitmarker(head); this.dmgNumber(x, y, z, dmg, head); }
        if (tid === this.me) {
          const h = $('#hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
          v.shake = Math.max(v.shake || 0, 0.6); vib(40);
          const src = sid && v.ents.get(sid);
          if (src) this.damageDir(src.x, src.z);
        }
        break;
      }
      case 'kill': {
        const [, kid, vid, w, head] = f;
        const kn = this.name(kid), vn = this.name(vid);
        const kc = this.team && kid ? TEAM_COLORS[this.info(kid).team] : '#ffd166', vc = this.team ? TEAM_COLORS[this.info(vid).team] : '#fff';
        const wi = WEAPONS[w] ? icon(WEAPONS[w].icon) : w === 'mover' ? icon(this.map.theme === 'street' ? 'steering' : 'engine') : w === 'blade' ? icon('swords') : icon('skull');
        this.killfeed(`${kid ? `<b style="color:${kc}">${esc(kn)}</b> ` : ''}${wi}${head ? ' ' + icon('target') : ''} <b style="color:${vc}">${esc(vn)}</b>`);
        if (kid === this.me && vid !== this.me) { shBanner(`${icon('swords')} Ты выбил ${esc(vn)}${head ? ' — в голову!' : ''}`, 'small', 1400); Sound.play('confirm', { vol: 0.8 }); vib([20, 30, 40]); }
        if (vid === this.me) {
          this.alive = false; this.diedAt = performance.now() / 1000; this.killerId = kid; this.spec = null; this.toggleScope(false);
          $('#sh-dead').innerHTML = `<div class="dead-card">${kid && kid !== this.me ? `<img src="${thumb(this.info(kid).model || 'character-a')}"><b>Тебя выбил ${esc(kn)}</b>` : '<b>Тебя выбили</b>'}<span id="sh-resp"></span></div>`;
          $('#sh-dead').className = 'show'; Sound.play('kill', { vol: 0.8 }); vib([80, 50, 120]);
        }
        break;
      }
      case 'die': { const [, id, x, y, z] = f; v.burst(x, y + 1, z, '#d9d9d9', 16, 4, 0.12, 0.8); this.snd('thud', x, z, 0.6); break; }
      case 'boom': { const [, x, y, z, r, tp] = f; v.boom(x, y, z, tp === 'flash' ? 1.2 : r, { plasma: '#9b6bff', snow: '#ffffff', grenade: '#ff8a3d', slam: '#ff3355', flash: '#ffffff', sticky: '#ff4dc4', banana: '#ffe14d', bananaS: '#ffe14d', bubble: '#8fe8ff' }[tp] || '#ff8a3d'); this.snd(tp === 'snow' ? 'thud' : tp === 'bubble' || tp === 'sticky' ? 'pop' : tp === 'flash' ? 'laser2' : tp === 'grenade' || tp === 'banana' || tp === 'bananaS' ? (Math.random() < 0.5 ? 'boom2' : 'boom3') : 'explode', x, z, 1, 45); const d = Math.hypot(x - this.p.x, z - this.p.z); if (d < 12) v.shake = Math.max(v.shake || 0, (12 - d) / 8); break; }
      case 'puff': { const [, x, y, z, tp] = f; v.burst(x, y, z, tp === 'orb' ? '#b36bff' : '#ffffff', 6, 2, 0.08, 0.4); break; }
      case 'bounce': this.snd('bounce', f[1], f[2], 0.6, 20); break;
      case 'smoke': { const [, x, z, r, life] = f; v.smoke(x, z, r, life); this.snd('vent', x, z, 0.8, 30); break; }
      case 'chest': { const [, pid, secret, x, y, z] = f; v.burst(x, y + 0.6, z, '#ffd34d', 24, 4, 0.1, 0.9); if (pid === this.me) { shBanner(`${icon('chest')} ${secret ? 'Секретный сундук!' : 'Сундук!'} +$${secret ? 800 : 400} и +5 монет`, 'small good', 2200); Sound.coin(); Sound.play('chips', { vol: 0.7 }); vib([20, 30, 20]); } else this.snd('chips', x, z, 0.6, 20); break; }
      case 'rise': { const [, x, z] = f; v.burst(x, 0.2, z, '#4a3b2c', 22, 3, 0.13, 1); v.burst(x, 0.3, z, '#9fe8a0', 8, 1.5, 0.08, 1.2); this.snd('glitch', x, z, 0.8, 30); if (!this.riseShown) { this.riseShown = true; shBanner(`${icon('skull')} Из могил встают скелеты!`, 'small', 2500); } break; }
      case 'tele': v.ring(f[1], f[2], f[3], f[4]); break;
      case 'heal': if (f[1] === this.me) { Sound.play('taskdone', { vol: 0.6 }); shBanner(`${icon('heart')} +60 здоровья`, 'small', 1200); } break;
      case 'round': { const [, n, wave] = f; shBanner(wave ? `Волна ${wave} из 6` : `Раунд ${n}`, 'big', 2200); Sound.play('j_meeting', { vol: 0.5 }); break; }
      case 'roundEnd': { const [, text, wt, wp] = f; const won = this.team ? wt === this.my.team : wp === this.me; shBanner(esc(text), won || wt === -1 && !wp ? 'big good' : 'big', 3500); Sound.play(won ? 'j_win' : 'j_lose', { vol: 0.7 }); break; }
      case 'go': break;
      case 'msg': shBanner(esc(f[1]), 'small', 2200); break;
      case 'cap': { const [, team, pid] = f; shBanner(`${icon('flag')} ${esc(this.name(pid))} принёс флаг! +1 «${TEAM_NAMES[team]}»`, 'big', 2600); Sound.play('j_win', { vol: 0.6 }); break; }
    }
  }
  hitmarker(head) {
    const h = $('#sh-hit'); h.className = ''; void h.offsetWidth; h.className = 'on' + (head ? ' head' : '');
    Sound.play(head ? 'select' : 'hit', { vol: head ? 0.9 : 0.5, rate: head ? 1.5 : 1.2 });
  }
  dmgNumber(x, y, z, dmg, head) {
    const p = this.view.camera ? new THREE.Vector3(x, y, z).project(this.view.camera) : null; if (!p || p.z > 1) return;
    const el = document.createElement('div'); el.className = 'sh-dmg' + (head ? ' head' : ''); el.textContent = dmg;
    el.style.left = ((p.x + 1) / 2 * innerWidth + rnd(-15, 15)) + 'px'; el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
    $('#s-shoot').appendChild(el); setTimeout(() => el.remove(), 800);
  }
  damageDir(x, z) {
    const ang = Math.atan2(x - this.p.x, z - this.p.z);
    const rel = -(ang - Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw)));
    const el = document.createElement('div'); el.className = 'sh-ddir'; el.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`;
    $('#s-shoot').appendChild(el); setTimeout(() => el.remove(), 900);
  }
  killfeed(html) {
    const k = $('#sh-feed'); const d = document.createElement('div'); d.className = 'kf'; d.innerHTML = html;
    k.prepend(d); while (k.children.length > 5) k.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 5000); setTimeout(() => d.remove(), 5500);
  }

  // ---------- интерфейс ----------
  updateWeaponHUD() {
    const W = WEAPONS[this.cur] || {}, a = this.ammo[this.cur];
    $('#sh-wname').innerHTML = `${icon(W.icon || 'gun')} ${W.name || ''}`;
    $('#sh-ammo').innerHTML = W.mag && a ? `<b class="${a[0] <= Math.ceil(W.mag * 0.25) ? 'low' : ''}">${a[0]}</b><span>/ ${a[1]}</span>` : W.throw ? `<b>${this.pv.nades}</b>` : '';
    $('#sh-money').textContent = '$' + (this.pv.money || 0); $('#sh-money').style.display = this.mode === 'gun' ? 'none' : '';
    $('#sh-nade').style.display = this.pv.nades > 0 ? '' : 'none';
    $('#sh-nade').querySelector('small').textContent = '×' + (this.pv.nades || 0);
    { const nt = WEAPONS[this.pv.nadeType || 'grenade']; const sp = $('#sh-nade').querySelector('span'); if (nt && sp.dataset.nt !== nt.icon) { sp.dataset.nt = nt.icon; sp.innerHTML = icon(nt.icon); } }
    $('#sh-aim').style.display = W.zoom ? '' : 'none';
    $('#sh-switch').querySelector('span').innerHTML = icon(W.icon || 'gun');
    $('#sh-reload').style.display = W.mag ? '' : 'none';
    const sl = $('#sh-slots');
    sl.innerHTML = [[1, this.pv.slot1], [2, this.pv.slot2], [3, 'knife'], [4, this.pv.nades > 0 ? 'grenade' : null]].map(([n, w]) => w ? `<div class="${w === this.cur ? 'on' : ''}"><i>${n}</i>${icon(WEAPONS[w === 'grenade' ? this.pv.nadeType || 'grenade' : w].icon)}</div>` : '').join('');
  }
  // маленькая карта сверху справа: стены, ты (стрелка), свои, флаги; враги — только подсвеченные, монстры — всегда
  miniMap() {
    const cv = $('#sh-mini'), m = this.map; if (!cv || !m) return;
    const now = performance.now(); if (now - (this.mmT || 0) < 120) return; this.mmT = now;
    if (!this.mmB) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const b of m.boxes) { if (b.w > 60 || b.d > 60) continue; x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2); z0 = Math.min(z0, b.z - b.d / 2); z1 = Math.max(z1, b.z + b.d / 2); }
      this.mmB = { x0, x1, z0, z1 };
    }
    // ширина по месту, но не выше maxH (на телефоне ниже — чтобы не налезать на кнопку огня)
    const B = this.mmB, touch = document.body.classList.contains('touch'), maxW = touch ? 96 : 180, maxH = touch ? 66 : 180;
    const k = Math.min(maxW / (B.x1 - B.x0), maxH / (B.z1 - B.z0)), W = Math.round((B.x1 - B.x0) * k), H = Math.round((B.z1 - B.z0) * k);
    if (!this.mmBase || this.mmBase.W !== W) {
      cv.style.width = W + 'px';
      cv.style.height = H + 'px'; cv.width = W * 2; cv.height = H * 2; document.documentElement.style.setProperty('--shmm', H + 'px');
      const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const g = c.getContext('2d'); g.scale(2, 2);
      const list = m.boxes.filter(b => b.w <= 60 && b.d <= 60 && b.vis !== 'invis' && b.solid !== false).sort((a, b) => (a.y + a.h) - (b.y + b.h));
      for (const b of list) { const top = b.y + b.h; g.fillStyle = b.vis === 'floor' || top < 0.3 ? 'rgba(255,255,255,.10)' : top < 1.6 ? 'rgba(170,180,230,.45)' : 'rgba(210,215,255,.8)'; g.fillRect((b.x - b.w / 2 - B.x0) * k, (b.z - b.d / 2 - B.z0) * k, Math.max(1, b.w * k), Math.max(1, b.d * k)); }
      this.mmBase = { W, c };
    }
    const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(this.mmBase.c, 0, 0); g.scale(2, 2);
    const tx = x => (x - B.x0) * k, tz = z => (z - B.z0) * k;
    const dot = (x, z, col, r = 3) => { g.fillStyle = col; g.beginPath(); g.arc(tx(x), tz(z), r, 0, 7); g.fill(); };
    for (const [id, a] of this.view.ents) {
      if (id === this.me || a.dead || a.x == null) continue;
      const enemy = this.isEnemyId(id), mon = String(id).startsWith('m');
      if (enemy && !mon && !((a.fl || 0) & 4)) continue;
      dot(a.x, a.z, mon ? '#ff5d6c' : enemy ? '#ff9f43' : this.team ? (this.my.team === 0 ? '#ff6b6b' : '#4dabf7') : '#5ee07a', 3);
    }
    if (this.view.flags) for (const [team, f] of this.view.flags) { const p = f.userData.p; if (p) { g.fillStyle = team === 0 ? '#ff4d5e' : '#3a86ff'; g.fillRect(tx(p[0]) - 3, tz(p[2]) - 6, 6, 6); g.fillRect(tx(p[0]) - 3, tz(p[2]) - 6, 1.5, 10); } }
    if (this.alive) { // ты — стрелка по направлению взгляда
      const x = tx(this.p.x), z = tz(this.p.z), dx = -Math.sin(this.yaw), dz = -Math.cos(this.yaw);
      g.fillStyle = '#ffd166'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + dx * 7, z + dz * 7); g.lineTo(x - dx * 4 + dz * 4.5, z - dz * 4 - dx * 4.5); g.lineTo(x - dx * 4 - dz * 4.5, z - dz * 4 + dx * 4.5); g.closePath(); g.fill(); g.stroke();
    }
  }
  hudFrame() {
    this.miniMap();
    const W = WEAPONS[this.cur] || {};
    const moving = Math.hypot(this.p.vx, this.p.vz) > 1.5 || !this.p.ground;
    const spread = (this.scoped && W.scopeSpread != null ? W.scopeSpread : (W.spread || 0.01)) + (moving ? W.moveSpread || 0 : 0) + Math.max(0, 0.03 - (performance.now() / 1000 - this.lastFire)) * 0.5;
    const gap = Math.min(60, 4 + spread * 520);
    const c = $('#sh-cross'); c.style.setProperty('--g', gap + 'px'); c.style.display = this.scoped || W.melee ? 'none' : '';
    const rel = this.reloadUntil && performance.now() / 1000 < this.reloadUntil;
    $('#sh-rel').style.display = rel ? '' : 'none';
    if (rel) {
      const W2 = WEAPONS[this.cur], f = clamp(1 - (this.reloadUntil - performance.now() / 1000) / W2.reload, 0, 1);
      $('#sh-rel i').style.width = f * 100 + '%';
      $('#sh-ring circle:last-child').style.strokeDashoffset = (1 - f) * 100;
    }
    $('#sh-ring').style.display = rel ? '' : 'none';
  }
  hud(s) {
    const pv = this.pv;
    $('#sh-hp i').style.width = clamp(pv.hp, 0, 100) + '%'; $('#sh-hp span').textContent = pv.hp;
    $('#sh-hp i').style.background = pv.hp > 50 ? '#5ee07a' : pv.hp > 25 ? '#ffd166' : '#ff5d6c';
    $('#sh-ar').style.display = pv.armor > 0 ? '' : 'none'; $('#sh-ar i').style.width = pv.armor + '%'; $('#sh-ar span').textContent = pv.armor;
    $('#hurtlow').classList.toggle('on', this.alive && pv.hp > 0 && pv.hp <= 30);
    $('#slowfx').classList.toggle('on', !!(pv.slow || pv.freeze));
    // верх
    let ph = '';
    if (s.ph === 'buy') ph = `Закупка ${Math.ceil(s.tl)}`;
    // крупный таймер закупки и сколько игроков готовы
    const bt = s.ph === 'buy' ? `<b>${Math.ceil(s.tl)}</b><span>${this.isReady ? 'Ты готов' : 'Закупка'}${s.br ? ` · готовы ${s.br[0]} из ${s.br[1]}` : ''}</span>` : '';
    if (bt !== this.lastBt) { this.lastBt = bt; $('#sh-buyt').innerHTML = bt; $('#sh-buyt').className = bt ? 'show' : ''; const r = $('#sh-buy-rd'); if (r) r.textContent = s.br ? `Готовы ${s.br[0]} из ${s.br[1]} · ${Math.ceil(s.tl)} сек` : ''; }
    else if (s.ph === 'roundEnd') ph = 'Конец раунда';
    else if (s.ph === 'play' && s.tl < 1e6) ph = fmtTime(s.tl);
    $('#sh-time').textContent = ph; $('#sh-time').style.display = ph ? '' : 'none'; $('#sh-time').classList.toggle('low', s.ph === 'play' && s.tl < 15);
    let sc = '';
    if (s.ts) { const my = this.my.team; sc = `<div class="ts t0 ${my === 0 ? 'mine' : ''}">${s.ts[0]}</div><div class="ts-mid">${this.opts.match === 'rounds' && this.mode !== 'ctf' ? 'до ' + this.opts.rounds : this.mode === 'ctf' ? icon('flag') + ' до 3' : 'до 20'}</div><div class="ts t1 ${my === 1 ? 'mine' : ''}">${s.ts[1]}</div>`; }
    else if (this.mode === 'pve') sc = `<div class="pill">Волна ${Math.max(1, s.wave)}${this.opts.endless ? '' : '/6'}</div><div class="pill">${icon('skull')} ${s.left || 0}</div><div class="pill ${s.lv === 0 ? 'warn' : ''}" title="жизни команды">${icon('heart')} ${s.lv ?? ''}</div>`;
    else if (this.mode === 'gun' && s.sb) { const mine = s.sb.find(r => r[0] === this.me) || [0, 0, 0, 0, 0, 0], top = Math.max(...s.sb.map(r => r[5] || 0)); sc = `<div class="pill">${icon('gun')} Оружие ${(mine[5] || 0) + 1}/10</div><div class="pill dim">${icon('trophy')} лидер ${top + 1}/10</div>`; }
    else if (s.sb) { const mine = s.sb.find(r => r[0] === this.me) || [0, 0, 0, 0, 0]; sc = this.opts.match === 'rounds' ? `<div class="pill">${icon('trophy')} ${mine[4]}/${this.opts.rounds}</div><div class="pill">${icon('swords')} ${mine[1]}</div>` : `<div class="pill">${icon('swords')} ${mine[1]}</div>`; }
    if (s.rd && this.opts.match === 'rounds' && this.mode !== 'pve') sc += `<div class="pill dim">Раунд ${s.rd}</div>`;
    if (sc !== this.lastSc) { this.lastSc = sc; $('#sh-score').innerHTML = sc; }
    if (s.sb) { this.sb = s.sb; }
    const bb = $('#sh-boss');
    if (!!s.boss !== !!this.bossMus) { this.bossMus = !!s.boss; Sound.playMusic(s.boss ? 'boss' : (window.__music || 'battle')); }
    if (s.boss) { bb.classList.add('show'); bb.querySelector('i').style.width = (s.boss[0] / s.boss[1] * 100) + '%'; bb.querySelector('b').textContent = ['Хранитель склепа', 'Хранитель склепа — злится!', 'Хранитель склепа — в ярости!'][(s.boss[2] || 1) - 1]; bb.dataset.ph = s.boss[2] || 1; } else bb.classList.remove('show');
    // подъём товарищей
    const rv = (s.rv || []).find(r => r[0] === this.me || r[2] === this.me);
    if (rv && performance.now() - (this.rvShown || 0) > 400) { this.rvShown = performance.now(); const pct = Math.round(rv[1] * 100); if (rv[2] === this.me) shBanner(`${icon('heart')} Поднимаешь ${esc(this.name(rv[0]))}: ${pct}%`, 'small', 600); }
    if (!this.alive) { const r = $('#sh-resp'); const me = (s.rv || []).find(x => x[0] === this.me); if (r) r.textContent = me ? `Тебя поднимают: ${Math.round(me[1] * 100)}%` : this.opts.match === 'rounds' && this.mode !== 'pve' ? 'Ждём следующий раунд…' : pv.resp > 0 && pv.resp < 1000 ? `Возрождение через ${Math.ceil(pv.resp)}` : this.mode === 'pve' ? 'Жизни кончились: подожди, пока тебя поднимут, или новую волну' : ''; }
  }
  buyList(groups) {
    // покупаем по очереди, считая остаток денег у себя (хост всё равно проверит)
    let money = this.pv.money, n = 0;
    const has = id => id === this.pv.slot1 || id === this.pv.slot2 || (id === 'armor' && this.pv.armor >= 100) || (id === 'medkit' && this.pv.medkit > 0);
    for (const g of groups) {
      const id = g.find(x => { const it = WEAPONS[x] || GEAR[x]; return it && (has(x) || it.price <= money); });
      if (!id || has(id)) continue;
      const it = WEAPONS[id] || GEAR[id]; money -= it.price; n++;
      setTimeout(() => this.ctx.send({ t: 'buy', item: id }), n * 120);
    }
    if (!n) { Sound.play('error'); shBanner('Не хватает денег или всё уже есть', 'small', 1400); }
  }
  buyReady() { if (this.ph !== 'buy' || this.isReady) return; this.isReady = true; this.ctx.send({ t: 'bready' }); Sound.play('confirm', { vol: 0.5 }); }
  renderBuy() {
    const pv = this.pv;
    const key = [pv.money, pv.slot1, pv.slot2, pv.armor, pv.nades, pv.nadeType, pv.medkit, (this.prevBuys || []).length].join('|');
    if (key === this.buyKey && $('#sh-buy-list').firstChild) return;
    this.buyKey = key;
    const owned = new Set([pv.slot1, pv.slot2]);
    $('#sh-buy-money').textContent = '$' + pv.money;
    const bar = (v, max) => `<i style="width:${Math.min(100, v / max * 100)}%"></i>`;
    const prev = (this.prevBuys || []).filter(x => WEAPONS[x] || GEAR[x]);
    const kitRow = `<div class="bg"><h4>Быстро</h4><div class="kits">${prev.length ? `<button class="kit" data-kit="last">${icon('rotate')}<b>Как в прошлый раз</b><small>${prev.map(x => (WEAPONS[x] || GEAR[x]).name).slice(0, 3).join(', ')}</small></button>` : ''}${KITS.map(k => `<button class="kit" data-kit="${k.id}">${icon(k.icon)}<b>${k.name}</b><small>${k.groups.map(g => (WEAPONS[g[0]] || GEAR[g[0]]).name).join(' + ')}</small></button>`).join('')}</div></div>`;
    $('#sh-buy-list').innerHTML = kitRow + BUY_GROUPS.map(g => `<div class="bg"><h4>${g.name}</h4><div class="bitems">${g.items.map(id => {
      const W = WEAPONS[id], G = GEAR[id], it = W || G, price = it.price;
      const own = owned.has(id) || (id === 'armor' && pv.armor >= 100) || (id === 'medkit' && pv.medkit > 0) || (W && W.nade && pv.nadeType === id && pv.nades >= W.max);
      const poor = pv.money < price;
      const dps = W && W.dmg && !W.throw ? (W.dmg * (W.pellets || 1)) / W.rate : 0;
      return `<button class="bitem ${own ? 'own' : ''} ${poor ? 'poor' : ''} ${W ? 'st-' + W.style : ''}" data-item="${id}">
        <div class="bt">${icon(it.icon)}<b>${it.name}</b></div>
        ${W && !W.throw ? `<div class="bstats"><span>Урон</span><div>${bar(W.dmg * (W.pellets || 1), 110)}</div><span>Скорость</span><div>${bar(1 / W.rate, 14)}</div><span>Точность</span><div>${bar(1 - Math.min(1, (W.spread || 0.05) * 10), 1)}</div><span>Дальность</span><div>${bar(W.range || (W.proj ? (W.grav > 0 ? 45 : W.speed * 2.2) : 60), 150)}</div></div>` : `<div class="bdesc">${G ? G.desc : W.desc || 'Взрыв по площади'}</div>`}
        <div class="bp">${W ? `<small>${STYLE_NAMES[W.style]}</small>` : ''}<span>${own && W && W.slot !== 4 ? 'Есть · патроны' : price ? '$' + price : 'Бесплатно'}</span></div></button>`;
    }).join('')}</div></div>`).join('');
  }
  renderBoard() {
    if (!this.sb) return;
    const rows = [...this.sb].sort((a, b) => (b[4] - a[4]) || (b[1] - a[1]));
    $('#sh-board-body').innerHTML = `<table><tr><th></th><th>Игрок</th>${this.opts.match === 'rounds' && !this.team ? `<th>${icon('trophy')}</th>` : ''}<th>${icon('swords')}</th><th>${icon('skull')}</th></tr>${rows.map(([id, k, d, p, r]) => {
      const info = this.info(id); const col = this.team ? TEAM_COLORS[info.team] : '#fff';
      return `<tr class="${id === this.me ? 'me' : ''}"><td><img src="${thumb(info.model || 'character-a')}"></td><td style="color:${col}">${esc(info.name)}${info.bot ? ' (бот)' : ''}</td>${this.opts.match === 'rounds' && !this.team ? `<td>${r}</td>` : ''}<td>${k}</td><td>${d}</td></tr>`;
    }).join('')}</table>`;
  }
  updateLock() {
    const show = !window.__touch && !Pad.connected && !this.locked && !this.buyOpen && document.body.dataset.game === 'shooter';
    $('#sh-lock').className = show ? 'show' : '';
  }
}
