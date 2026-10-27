import { Pad } from './gamepad.js';
// Управление: джойстик и кнопки на телефоне/планшете, клавиатура и мышь на компьютере.
export const Input = {
  touch: matchMedia('(pointer:coarse)').matches,
  mouse: null,          // экранные координаты мыши
  mouseDown: false,
  atkHeld: false,
  seq: { sup: 0, emo: 0, use: 0, kill: 0, rep: 0, em: 0, sab: 0 },
  keys: {},
  joy: null,
  active: false,
  onKey: null,          // (action) — одиночные действия с клавиатуры
  onKeyGame: null,
  init(zones, joyEl) {
    this.joyEl = joyEl;
    const KM = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
    const ACT = { Space: 'sup', KeyQ: 'sup', KeyE: 'use', KeyF: 'kill', KeyR: 'rep', KeyG: 'sab', KeyB: 'em', KeyX: 'emo', KeyJ: 'atk', Enter: 'chat', Tab: 'board', KeyV: 'vent', KeyM: 'map', Escape: 'esc' };
    addEventListener('keydown', e => {
      if (!this.active) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (KM[e.code]) { this.keys[KM[e.code]] = 1; e.preventDefault(); }
      const a = ACT[e.code];
      if (a === 'atk') this.atkHeld = true;
      else if (a && !e.repeat) { e.preventDefault(); this.fire(a); }
    });
    addEventListener('keyup', e => {
      if (KM[e.code]) this.keys[KM[e.code]] = 0;
      if (e.code === 'KeyJ') this.atkHeld = false;
      if (e.code === 'Tab' && this.onKey) this.onKey('boardUp');
    });
    addEventListener('blur', () => { this.keys = {}; this.atkHeld = false; this.mouseDown = false; });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    for (const zone of zones) this.bindZone(zone);
  },
  bindZone(zone) {
    zone.addEventListener('mousemove', e => { this.mouse = { x: e.clientX, y: e.clientY }; });
    zone.addEventListener('mousedown', e => { if (this.touch) return; if (e.button === 0) this.mouseDown = true; if (e.button === 2) this.fire('sup'); });
    zone.addEventListener('contextmenu', e => e.preventDefault());
    // сенсорный джойстик: где коснулся — там и центр
    zone.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !this.active || this.joy) return;
      this.touch = true;
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      try { zone.setPointerCapture(e.pointerId); } catch (_) { }
      this.drawJoy();
    });
    zone.addEventListener('pointermove', e => { if (this.joy && e.pointerId === this.joy.id) { this.joy.x = e.clientX; this.joy.y = e.clientY; this.drawJoy(); } });
    const up = e => { if (this.joy && e.pointerId === this.joy.id) { this.joy = null; this.drawJoy(); } };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    const clear = e => { if (this.joy && (!e.touches || !e.touches.length)) { this.joy = null; this.drawJoy(); } };
    document.addEventListener('touchend', clear); document.addEventListener('touchcancel', clear); addEventListener('blur', () => { this.joy = null; this.drawJoy(); });
  },
  fire(a) { if (this.seq[a] != null) this.seq[a]++; if (this.onKey) this.onKey(a); },
  drawJoy() {
    const el = this.joyEl; if (!el) return;
    if (!this.joy) { el.style.display = 'none'; return; }
    const j = this.joy; let dx = j.x - j.ox, dy = j.y - j.oy; const m = Math.hypot(dx, dy), R = 56;
    if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    el.style.display = 'block';
    el.style.left = j.ox + 'px'; el.style.top = j.oy + 'px';
    el.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  },
  getMove() {
    if (Pad.connected && (Pad.lx || Pad.ly)) { let x = Pad.lx, z = Pad.ly; const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; } return { x, z }; }
    if (this.joy) {
      let dx = (this.joy.x - this.joy.ox) / 50, dy = (this.joy.y - this.joy.oy) / 50;
      const m = Math.hypot(dx, dy);
      if (m < 0.18) return { x: 0, z: 0 };
      if (m > 1) { dx /= m; dy /= m; }
      return { x: dx, z: dy };
    }
    const k = this.keys; let x = (k.r || 0) - (k.l || 0), z = (k.d || 0) - (k.u || 0);
    const m = Math.hypot(x, z); if (m > 0) { x /= m; z /= m; }
    return { x, z };
  },
  attacking() { return this.atkHeld || this.mouseDown; },
  reset() { this.joy = null; this.atkHeld = false; this.mouseDown = false; this.keys = {}; this.drawJoy(); }
};

// геймпад в «Найди предателя»: A — действие, X — выбить, B — сообщить, Y — саботаж, RB — люк, LB или «Назад» — карта, Старт — меню
const PAD_ACT = { 0: 'use', 2: 'kill', 1: 'rep', 3: 'sab', 5: 'vent', 4: 'map', 8: 'map' };
(function padLoop() {
  requestAnimationFrame(padLoop);
  if (!Pad.connected || !Input.active) return;
  if (document.querySelector('.modal.show')) { if (Pad.hit(9) || Pad.hit(1)) document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show')); return; }
  for (const [b, a] of Object.entries(PAD_ACT)) if (Pad.hit(+b)) Input.fire(a);
  if (Pad.hit(9)) { const p = document.querySelector('#s-among [data-act=pause]'); if (p) p.click(); }
})();
