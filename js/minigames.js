// Мини-игры заданий в замке. open(station, onDone, onClose)
import { shuffle, rnd } from './util.js';

let cur = null;
export function isOpen() { return !!cur; }
export function close() { if (cur) { cur.cleanup && cur.cleanup(); cur.el.remove(); const c = cur; cur = null; c.onClose && c.onClose(); } }

export function open(station, onDone, onClose) {
  close();
  const el = document.createElement('div');
  el.className = 'task-modal';
  el.innerHTML = `<div class="task-card"><div class="task-head"><span class="task-ic">${station.icon}</span><b>${station.name}</b><button class="x" aria-label="Закрыть">✕</button></div><div class="task-body"></div><div class="task-hint"></div></div>`;
  document.body.appendChild(el);
  const body = el.querySelector('.task-body'), hint = el.querySelector('.task-hint');
  cur = { el, onClose };
  el.querySelector('.x').onclick = () => close();
  const finish = () => {
    body.innerHTML = '<div class="task-ok">✅ Готово!</div>';
    if (navigator.vibrate) try { navigator.vibrate([30, 40, 30]); } catch (e) { }
    const c = cur; cur.onClose = null;
    setTimeout(() => { if (cur === c) close(); onDone(); }, 650);
  };
  GAMES[station.game](body, hint, finish, station);
}

const GAMES = {
  // нажать числа по порядку
  order(body, hint, done) {
    hint.textContent = 'Нажимай по порядку: 1, 2, 3…';
    const n = 8; let next = 1;
    body.innerHTML = `<div class="tg-grid">${shuffle([...Array(n)].map((_, i) => i + 1)).map(v => `<button class="tg-tile" data-v="${v}">${v}</button>`).join('')}</div>`;
    body.querySelectorAll('.tg-tile').forEach(b => b.onclick = () => {
      if (+b.dataset.v === next) { b.classList.add('ok'); next++; if (next > n) done(); }
      else { b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 300); }
    });
  },
  // соединить провода одного цвета
  wires(body, hint, done) {
    hint.textContent = 'Нажми провод слева, потом такой же цвет справа';
    const cols = ['#ff5d6c', '#ffd166', '#4da3ff', '#5ee07a'];
    const right = shuffle(cols.map((c, i) => i));
    body.innerHTML = `<div class="tg-wires"><svg class="tg-svg"></svg><div class="tg-col">${cols.map((c, i) => `<button class="tg-wire" data-s="l" data-i="${i}" style="background:${c}"></button>`).join('')}</div><div class="tg-col">${right.map(i => `<button class="tg-wire" data-s="r" data-i="${i}" style="background:${cols[i]}"></button>`).join('')}</div></div>`;
    const svg = body.querySelector('svg'), wrap = body.querySelector('.tg-wires');
    let sel = null, made = 0;
    const center = b => { const r = b.getBoundingClientRect(), w = wrap.getBoundingClientRect(); return [r.left + r.width / 2 - w.left, r.top + r.height / 2 - w.top]; };
    body.querySelectorAll('.tg-wire').forEach(b => b.onclick = () => {
      if (b.classList.contains('done')) return;
      if (b.dataset.s === 'l') { body.querySelectorAll('.tg-wire[data-s=l]').forEach(x => x.classList.remove('sel')); sel = b; b.classList.add('sel'); return; }
      if (!sel) return;
      if (sel.dataset.i === b.dataset.i) {
        const [x1, y1] = center(sel), [x2, y2] = center(b);
        svg.insertAdjacentHTML('beforeend', `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cols[b.dataset.i]}" stroke-width="10" stroke-linecap="round"/>`);
        sel.classList.add('done'); b.classList.add('done'); sel.classList.remove('sel'); sel = null; made++;
        if (made === cols.length) done();
      } else { b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 300); }
    });
  },
  // удерживать кнопку
  hold(body, hint, done, st) {
    hint.textContent = 'Нажми и держи, пока полоска не заполнится';
    body.innerHTML = `<div class="tg-hold"><div class="tg-bar"><i></i></div><button class="tg-holdbtn">${st.icon}<span>Держи!</span></button></div>`;
    const bar = body.querySelector('.tg-bar i'), btn = body.querySelector('.tg-holdbtn');
    let p = 0, down = false, raf, last = performance.now();
    const loop = t => { const dt = (t - last) / 1000; last = t; p += down ? dt / 2.6 : -dt / 4; p = Math.max(0, Math.min(1, p)); bar.style.width = (p * 100) + '%'; if (p >= 1) { done(); return; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    btn.addEventListener('pointerdown', e => { e.preventDefault(); down = true; btn.classList.add('on'); });
    const up = () => { down = false; btn.classList.remove('on'); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointerleave', up); btn.addEventListener('pointercancel', up);
    cur.cleanup = () => cancelAnimationFrame(raf);
  },
  // поймать прыгающие предметы
  tap(body, hint, done, st) {
    const N = 7; let left = N;
    hint.textContent = `Поймай все ${st.icon}: осталось ${left}`;
    body.innerHTML = `<div class="tg-field"></div>`;
    const f = body.querySelector('.tg-field');
    const spawn = () => {
      const b = document.createElement('button'); b.className = 'tg-target'; b.textContent = st.icon;
      b.style.left = rnd(8, 78) + '%'; b.style.top = rnd(8, 72) + '%';
      b.onpointerdown = e => { e.preventDefault(); b.remove(); left--; hint.textContent = `Поймай все ${st.icon}: осталось ${left}`; if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) { } if (left <= 0) done(); else spawn(); };
      f.appendChild(b);
      const t = setTimeout(() => { if (b.isConnected) { b.remove(); spawn(); } }, 1400);
    };
    spawn();
  },
  // остановить стрелку в зелёной зоне 3 раза
  needle(body, hint, done) {
    let hits = 0; const need = 3;
    hint.textContent = 'Жми, когда стрелка в зелёной зоне (3 раза)';
    body.innerHTML = `<div class="tg-needle"><div class="tg-track"><div class="tg-zone"></div><div class="tg-pin"></div></div><div class="tg-stars">${'☆'.repeat(need)}</div><button class="tg-stop">СТОП!</button></div>`;
    const zone = body.querySelector('.tg-zone'), pin = body.querySelector('.tg-pin'), stars = body.querySelector('.tg-stars');
    let zl = 0, zw = 22, pos = 0, dir = 1, speed = 70, raf, last = performance.now();
    const newZone = () => { zw = 24 - hits * 4; zl = rnd(5, 95 - zw); zone.style.left = zl + '%'; zone.style.width = zw + '%'; speed = 70 + hits * 25; };
    newZone();
    const loop = t => { const dt = (t - last) / 1000; last = t; pos += dir * speed * dt; if (pos > 100) { pos = 100; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } pin.style.left = pos + '%'; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    body.querySelector('.tg-stop').onclick = () => {
      if (pos >= zl && pos <= zl + zw) { hits++; stars.textContent = '★'.repeat(hits) + '☆'.repeat(need - hits); if (hits >= need) { cancelAnimationFrame(raf); done(); return; } newZone(); }
      else { body.querySelector('.tg-track').classList.add('bad'); setTimeout(() => body.querySelector('.tg-track') && body.querySelector('.tg-track').classList.remove('bad'), 300); }
    };
    cur.cleanup = () => cancelAnimationFrame(raf);
  }
};
