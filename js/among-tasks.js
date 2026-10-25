// Мини-игры заданий и починки саботажа (в стиле Among Us).
import { shuffle, rnd } from './util.js';
import { icon } from './icons.js';
import { Sound } from './sound.js';

let cur = null;
export function isOpen() { return !!cur; }
export function current() { return cur; }
export function close(silent) {
  if (!cur) return;
  const c = cur; cur = null;
  c.cleanup && c.cleanup(); c.el.remove();
  if (!silent && c.onClose) c.onClose();
}
const vib = p => { if (window.__prefs && !window.__prefs.vibe) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };

// opts: {title, icon, game, onDone, onClose, onHold(v), stepText}
export function open(opts) {
  close(true);
  const el = document.createElement('div');
  el.className = 'task-modal';
  el.innerHTML = `<div class="task-card ${opts.sab ? 'sab' : ''}"><div class="task-head">${icon(opts.icon || 'task', 'task-ic')}<b>${opts.title}</b>${opts.stepText ? `<small>${opts.stepText}</small>` : ''}<button class="x" aria-label="Закрыть">${icon('close')}</button></div><div class="task-body"></div><div class="task-hint"></div></div>`;
  document.body.appendChild(el);
  const body = el.querySelector('.task-body'), hint = el.querySelector('.task-hint');
  cur = { el, onClose: opts.onClose, game: opts.game };
  el.querySelector('.x').onclick = () => close();
  const done = () => {
    if (!cur || cur.el !== el) return;
    body.innerHTML = `<div class="task-ok">${icon('check')}<span>Готово!</span></div>`;
    Sound.play('taskdone'); vib([30, 40, 30]);
    const c = cur; c.onClose = null;
    setTimeout(() => { if (cur === c) close(true); }, 700);
    opts.onDone && opts.onDone();
  };
  const G = GAMES[opts.game] || GAMES.hold;
  G(body, hint, done, opts);
}

const step = () => { Sound.play('step', { vol: 0.6, vary: true }); vib(12); };
const bad = el => { Sound.play('error', { vol: 0.6 }); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); vib(60); };
const raf = (fn) => { let id, last = performance.now(); const loop = t => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (fn(dt) !== false) id = requestAnimationFrame(loop); }; id = requestAnimationFrame(loop); cur.cleanup = () => cancelAnimationFrame(id); };

const GAMES = {
  // нажать по порядку 1..10
  order(body, hint, done) {
    hint.textContent = 'Открой клапаны по порядку: 1, 2, 3…';
    const n = 10; let next = 1;
    body.innerHTML = `<div class="tg-grid five">${shuffle([...Array(n)].map((_, i) => i + 1)).map(v => `<button class="tg-tile" data-v="${v}">${v}</button>`).join('')}</div>`;
    body.querySelectorAll('.tg-tile').forEach(b => b.onclick = () => {
      if (+b.dataset.v === next) { b.classList.add('ok'); next++; step(); if (next > n) done(); }
      else { bad(b); next = 1; body.querySelectorAll('.tg-tile').forEach(x => x.classList.remove('ok')); }
    });
  },
  // провода
  wires(body, hint, done) {
    hint.textContent = 'Соедини провода одного цвета: нажми слева, потом справа';
    const cols = ['#ff4d5e', '#ffd23f', '#3d8bff', '#ff4dff'];
    const right = shuffle([0, 1, 2, 3]);
    body.innerHTML = `<div class="tg-wires"><svg class="tg-svg"></svg><div class="tg-col">${cols.map((c, i) => `<button class="tg-wire" data-s="l" data-i="${i}" style="background:${c}"></button>`).join('')}</div><div class="tg-col">${right.map(i => `<button class="tg-wire" data-s="r" data-i="${i}" style="background:${cols[i]}"></button>`).join('')}</div></div>`;
    const svg = body.querySelector('svg'), wrap = body.querySelector('.tg-wires');
    let sel = null, made = 0;
    const center = b => { const r = b.getBoundingClientRect(), w = wrap.getBoundingClientRect(); return [r.left + r.width / 2 - w.left, r.top + r.height / 2 - w.top]; };
    body.querySelectorAll('.tg-wire').forEach(b => b.onclick = () => {
      if (b.classList.contains('done')) return;
      if (b.dataset.s === 'l') { body.querySelectorAll('.tg-wire[data-s=l]').forEach(x => x.classList.remove('sel')); sel = b; b.classList.add('sel'); Sound.play('select', { vol: 0.5 }); return; }
      if (!sel) return;
      if (sel.dataset.i === b.dataset.i) {
        const [x1, y1] = center(sel), [x2, y2] = center(b);
        svg.insertAdjacentHTML('beforeend', `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cols[b.dataset.i]}" stroke-width="12" stroke-linecap="round"/>`);
        sel.classList.add('done'); b.classList.add('done'); sel.classList.remove('sel'); sel = null; made++; step();
        if (made === cols.length) done();
      } else bad(b);
    });
  },
  // удерживать кнопку
  hold(body, hint, done, o) {
    hint.textContent = 'Нажми и держи, пока полоска не заполнится';
    body.innerHTML = `<div class="tg-hold"><div class="tg-bar"><i></i></div><button class="tg-holdbtn">${icon(o.icon || 'use')}<span>Держи</span></button></div>`;
    const bar = body.querySelector('.tg-bar i'), btn = body.querySelector('.tg-holdbtn');
    let p = 0, down = false;
    raf(dt => { p += down ? dt / 3 : -dt / 5; p = Math.max(0, Math.min(1, p)); bar.style.width = (p * 100) + '%'; if (p >= 1) { done(); return false; } });
    btn.addEventListener('pointerdown', e => { e.preventDefault(); down = true; btn.classList.add('on'); Sound.play('computer', { vol: 0.4 }); });
    const up = () => { down = false; btn.classList.remove('on'); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointerleave', up); btn.addEventListener('pointercancel', up);
  },
  // сбить астероиды
  tap(body, hint, done) {
    const N = 12; let left = N;
    hint.textContent = `Сбей астероиды: осталось ${left}`;
    body.innerHTML = `<div class="tg-field space"><div class="tg-cross"></div></div>`;
    const f = body.querySelector('.tg-field');
    const spawn = () => {
      const b = document.createElement('button'); b.className = 'tg-target'; b.innerHTML = icon('asteroid');
      const y = rnd(10, 75); b.style.top = y + '%'; b.style.left = '100%';
      const dur = rnd(2.2, 3.4); b.style.transition = `left ${dur}s linear, top ${dur}s linear`;
      f.appendChild(b); requestAnimationFrame(() => { b.style.left = '-15%'; b.style.top = (y + rnd(-15, 15)) + '%'; });
      b.onpointerdown = e => { e.preventDefault(); if (b.classList.contains('hit')) return; b.classList.add('hit'); Sound.play('laser', { vol: 0.5, vary: true }); setTimeout(() => b.remove(), 250); left--; hint.textContent = `Сбей астероиды: осталось ${Math.max(0, left)}`; vib(15); if (left <= 0) done(); };
      setTimeout(() => b.remove(), dur * 1000 + 100);
    };
    const iv = setInterval(spawn, 550); spawn();
    cur.cleanup = () => clearInterval(iv);
  },
  // ползунок — выставить в нужное место
  slider(body, hint, done) {
    hint.textContent = 'Перетащи ползунок к зелёной отметке и держи';
    const target = rnd(15, 85);
    body.innerHTML = `<div class="tg-slider"><div class="tg-strack"><div class="tg-mark" style="left:${target}%"></div><input type="range" min="0" max="100" value="${target > 50 ? 5 : 95}"></div><div class="tg-bar"><i></i></div></div>`;
    const inp = body.querySelector('input'), bar = body.querySelector('.tg-bar i');
    let p = 0;
    inp.addEventListener('input', () => Sound.play('tick', { vol: 0.25 }));
    raf(dt => { const ok = Math.abs(+inp.value - target) < 4; p = ok ? p + dt / 1.2 : Math.max(0, p - dt); bar.style.width = (p * 100) + '%'; body.querySelector('.tg-mark').classList.toggle('on', ok); if (p >= 1) { done(); return false; } });
  },
  // стрелка в зелёной зоне 3 раза
  needle(body, hint, done) {
    let hits = 0; const need = 3;
    hint.textContent = 'Жми, когда стрелка в зелёной зоне (3 раза)';
    body.innerHTML = `<div class="tg-needle"><div class="tg-track"><div class="tg-zone"></div><div class="tg-pin"></div></div><div class="tg-stars"></div><button class="tg-stop">СТОП</button></div>`;
    const zone = body.querySelector('.tg-zone'), pin = body.querySelector('.tg-pin'), stars = body.querySelector('.tg-stars'), track = body.querySelector('.tg-track');
    const showStars = () => stars.innerHTML = [...Array(need)].map((_, i) => `<i class="${i < hits ? 'on' : ''}"></i>`).join('');
    showStars();
    let zl = 0, zw = 22, pos = 0, dir = 1, speed = 70;
    const nz = () => { zw = 24 - hits * 4; zl = rnd(5, 95 - zw); zone.style.left = zl + '%'; zone.style.width = zw + '%'; speed = 70 + hits * 25; };
    nz();
    raf(dt => { pos += dir * speed * dt; if (pos > 100) { pos = 100; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } pin.style.left = pos + '%'; });
    body.querySelector('.tg-stop').onclick = () => {
      if (pos >= zl && pos <= zl + zw) { hits++; showStars(); step(); if (hits >= need) { done(); return; } nz(); }
      else bad(track);
    };
  },
  // навести прицел в центр
  center(body, hint, done) {
    hint.textContent = 'Перетащи прицел в центр круга';
    body.innerHTML = `<div class="tg-center"><div class="tg-ring"></div><div class="tg-dot" style="left:${rnd(10, 30)}%;top:${rnd(65, 85)}%"></div></div>`;
    const area = body.querySelector('.tg-center'), dot = body.querySelector('.tg-dot');
    let drag = false;
    const move = e => { if (!drag) return; const r = area.getBoundingClientRect(); dot.style.left = ((e.clientX - r.left) / r.width * 100) + '%'; dot.style.top = ((e.clientY - r.top) / r.height * 100) + '%'; };
    dot.addEventListener('pointerdown', e => { drag = true; dot.setPointerCapture(e.pointerId); });
    dot.addEventListener('pointermove', move);
    dot.addEventListener('pointerup', () => { drag = false; const x = parseFloat(dot.style.left), y = parseFloat(dot.style.top); if (Math.hypot(x - 50, y - 50) < 7) done(); else Sound.play('tick', { vol: 0.4 }); });
  },
  // зарядить все соты щитов
  hex(body, hint, done) {
    hint.textContent = 'Нажми на все красные соты';
    const n = 7;
    body.innerHTML = `<div class="tg-hex">${[...Array(n)].map((_, i) => `<button class="hx ${Math.random() < 0.7 || i === 0 ? 'off' : ''}"></button>`).join('')}</div>`;
    const check = () => { if (!body.querySelector('.hx.off')) done(); };
    body.querySelectorAll('.hx').forEach(b => b.onclick = () => { b.classList.toggle('off'); step(); check(); });
  },
  // вытащить листья из фильтра
  leaves(body, hint, done) {
    hint.textContent = 'Перетащи все листья влево, в трубу';
    body.innerHTML = `<div class="tg-leaves"><div class="tg-pipe"></div>${[...Array(6)].map(() => `<div class="leaf" style="left:${rnd(45, 85)}%;top:${rnd(10, 75)}%;transform:rotate(${rnd(0, 360)}deg)">${icon('leaf')}</div>`).join('')}</div>`;
    const area = body.querySelector('.tg-leaves');
    body.querySelectorAll('.leaf').forEach(l => {
      let drag = false;
      l.addEventListener('pointerdown', e => { drag = true; l.setPointerCapture(e.pointerId); });
      l.addEventListener('pointermove', e => { if (!drag) return; const r = area.getBoundingClientRect(); l.style.left = ((e.clientX - r.left) / r.width * 100 - 6) + '%'; l.style.top = ((e.clientY - r.top) / r.height * 100 - 8) + '%'; });
      l.addEventListener('pointerup', () => { drag = false; if (parseFloat(l.style.left) < 12) { l.remove(); step(); if (!area.querySelector('.leaf')) done(); } });
    });
  },
  // провести картой
  card(body, hint, done) {
    hint.textContent = 'Проведи карту слева направо — не слишком быстро и не слишком медленно';
    body.innerHTML = `<div class="tg-card"><div class="tg-reader"><span class="led"></span><span class="msg">Проведите карту</span></div><div class="tg-slot"><div class="cardx">${icon('card')}</div></div></div>`;
    const slot = body.querySelector('.tg-slot'), card = body.querySelector('.cardx'), msg = body.querySelector('.msg'), led = body.querySelector('.led');
    let drag = false, t0 = 0, x0 = 0;
    card.addEventListener('pointerdown', e => { drag = true; t0 = performance.now(); x0 = e.clientX; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
    card.addEventListener('pointermove', e => { if (!drag) return; const r = slot.getBoundingClientRect(); const dx = Math.max(0, Math.min(r.width - card.offsetWidth, e.clientX - x0)); card.style.transform = `translateX(${dx}px)`; card.dataset.dx = dx; });
    card.addEventListener('pointerup', () => {
      if (!drag) return; drag = false;
      const r = slot.getBoundingClientRect(), dt = performance.now() - t0, full = +card.dataset.dx >= r.width - card.offsetWidth - 6;
      card.style.transition = 'transform .25s'; card.style.transform = '';
      if (!full) { msg.textContent = 'Не до конца'; bad(slot); }
      else if (dt < 450) { msg.textContent = 'Слишком быстро'; bad(slot); }
      else if (dt > 1400) { msg.textContent = 'Слишком медленно'; bad(slot); }
      else { msg.textContent = 'Принято!'; led.classList.add('ok'); done(); }
    });
  },
  // скачать / загрузить данные
  download(body, hint, done, o) {
    const up = (o.stepText || '').includes('2');
    hint.textContent = up ? 'Загрузи данные и подожди' : 'Скачай данные и подожди';
    body.innerHTML = `<div class="tg-dl"><div class="row2">${icon('station', 'big')}<div class="dots"><i></i><i></i><i></i></div>${icon(up ? 'upload' : 'download', 'big')}</div><div class="tg-bar"><i></i></div><button class="tg-stop">${up ? 'Загрузить' : 'Скачать'}</button></div>`;
    const bar = body.querySelector('.tg-bar i'), btn = body.querySelector('.tg-stop');
    btn.onclick = () => {
      btn.disabled = true; body.querySelector('.tg-dl').classList.add('run'); Sound.play('computer', { vol: 0.5 });
      let p = 0; raf(dt => { p += dt / 5; bar.style.width = (p * 100) + '%'; if (p >= 1) { done(); return false; } });
    };
  },
  // повторить последовательность (запуск реактора)
  simon(body, hint, done) {
    const rounds = 4; let seq = [], inp = [], busy = true;
    hint.textContent = 'Запомни и повтори вспышки';
    body.innerHTML = `<div class="tg-simon"><div class="lights">${[...Array(rounds)].map(() => '<i></i>').join('')}</div><div class="pads">${[...Array(9)].map((_, i) => `<button data-i="${i}"></button>`).join('')}</div></div>`;
    const pads = [...body.querySelectorAll('.pads button')], lights = [...body.querySelectorAll('.lights i')];
    const flash = (i, d = 350) => { pads[i].classList.add('on'); Sound.play('select', { vol: 0.5, rate: 0.8 + i * 0.06 }); setTimeout(() => pads[i].classList.remove('on'), d); };
    const play = () => { busy = true; inp = []; seq.forEach((v, k) => setTimeout(() => flash(v), 500 + k * 550)); setTimeout(() => busy = false, 500 + seq.length * 550); };
    const next = () => { seq.push(Math.random() * 9 | 0); lights.forEach((l, i) => l.classList.toggle('on', i < seq.length - 1)); play(); };
    pads.forEach(b => b.onclick = () => {
      if (busy) return; const i = +b.dataset.i; flash(i, 200); inp.push(i);
      if (seq[inp.length - 1] !== i) { bad(body.querySelector('.pads')); seq = []; setTimeout(next, 600); return; }
      if (inp.length === seq.length) { if (seq.length >= rounds) { lights.forEach(l => l.classList.add('on')); done(); } else setTimeout(next, 500); }
    });
    setTimeout(next, 300);
  },
  // сканирование (стоять на месте)
  scan(body, hint, done) {
    hint.textContent = 'Стой на сканере, пока идёт проверка';
    body.innerHTML = `<div class="tg-scan">${icon('scan', 'big')}<div class="tg-bar"><i></i></div><div class="tg-scanlog"></div></div>`;
    const bar = body.querySelector('.tg-bar i'), log = body.querySelector('.tg-scanlog');
    const lines = ['Рост: ' + (120 + Math.random() * 60 | 0) + ' см', 'Вес: ' + (25 + Math.random() * 50 | 0) + ' кг', 'Группа крови: ' + ['0', 'A', 'B', 'AB'][Math.random() * 4 | 0], 'Здоров!'];
    let p = 0, shown = 0;
    Sound.play('computer', { vol: 0.5 });
    raf(dt => { p += dt / 8; bar.style.width = (p * 100) + '%'; while (shown < lines.length && p > (shown + 1) / (lines.length + 1)) log.innerHTML += `<div>${lines[shown++]}</div>`; if (p >= 1) { done(); return false; } });
  },
  // проверить образец: запустить, подождать, выбрать правильную пробирку
  sample(body, hint, done) {
    hint.textContent = 'Запусти анализ и выбери пробирку с отклонением';
    body.innerHTML = `<div class="tg-sample"><div class="tubes">${[...Array(5)].map((_, i) => `<button class="tube" data-i="${i}" disabled></button>`).join('')}</div><div class="tg-bar"><i></i></div><button class="tg-stop">Анализ</button></div>`;
    const btn = body.querySelector('.tg-stop'), bar = body.querySelector('.tg-bar i'), tubes = [...body.querySelectorAll('.tube')];
    const badI = Math.random() * 5 | 0;
    btn.onclick = () => {
      btn.disabled = true; Sound.play('computer', { vol: 0.5 });
      let p = 0; raf(dt => { p += dt / 6; bar.style.width = (p * 100) + '%'; if (p >= 1) { tubes.forEach((t, i) => { t.disabled = false; t.classList.add(i === badI ? 'bad' : 'ok'); }); hint.textContent = 'Выбери красную пробирку'; return false; } });
    };
    tubes.forEach((t, i) => t.onclick = () => { if (i === badI) done(); else bad(t); });
  },
  // ---------- саботаж ----------
  switches(body, hint, done) {
    hint.textContent = 'Включи все рубильники (вверх)';
    body.innerHTML = `<div class="tg-switches">${[...Array(5)].map((_, i) => `<button class="sw ${Math.random() < 0.6 || i === 2 ? '' : 'on'}"><i></i></button>`).join('')}</div>`;
    body.querySelectorAll('.sw').forEach(b => b.onclick = () => { b.classList.toggle('on'); Sound.play('toggle'); if (!body.querySelector('.sw:not(.on)')) done(); });
  },
  dial(body, hint, done) {
    const target = rnd(10, 90);
    hint.textContent = 'Найди частоту: крути, пока сигнал не станет ровным';
    body.innerHTML = `<div class="tg-dial"><svg viewBox="0 0 200 60" class="wave"><path d=""/></svg><input type="range" min="0" max="100" value="${target > 50 ? 0 : 100}"><div class="tg-bar"><i></i></div></div>`;
    const inp = body.querySelector('input'), path = body.querySelector('path'), bar = body.querySelector('.tg-bar i');
    let p = 0, t = 0;
    raf(dt => {
      t += dt; const off = Math.abs(+inp.value - target) / 100;
      let d = 'M0 30'; for (let x = 0; x <= 200; x += 4) d += ` L${x} ${30 + Math.sin(x / 12 + t * 6) * 20 * off * (1 + Math.sin(x * 1.7) * 0.6)}`;
      path.setAttribute('d', d);
      p = off < 0.04 ? p + dt / 1.2 : Math.max(0, p - dt); bar.style.width = (p * 100) + '%';
      if (p >= 1) { done(); return false; }
    });
  },
  keypad(body, hint, done) {
    const code = String(10000 + Math.random() * 89999 | 0);
    hint.innerHTML = `Введи код с записки`;
    body.innerHTML = `<div class="tg-keypad"><div class="note">Код: <b>${code}</b></div><div class="screen"></div><div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div></div>`;
    const scr = body.querySelector('.screen'); let v = '';
    body.querySelectorAll('.keys button').forEach(b => b.onclick = () => {
      const k = b.dataset.k; Sound.play('tick', { vol: 0.5 });
      if (k === 'C') v = ''; else if (k === 'OK') { if (v === code) { done(); return; } bad(scr); v = ''; } else if (v.length < 5) v += k;
      scr.textContent = v;
    });
  },
  handprint(body, hint, done, o) {
    hint.textContent = 'Держи ладонь на панели. Второй игрок должен держать вторую панель!';
    body.innerHTML = `<div class="tg-hand"><button class="hand">${icon('use')}</button><div class="hstatus">Приложи ладонь</div></div>`;
    const btn = body.querySelector('.hand'), st = body.querySelector('.hstatus');
    const set = v => { btn.classList.toggle('on', v); st.textContent = v ? 'Ждём второго игрока…' : 'Приложи ладонь'; o.onHold && o.onHold(v); if (v) Sound.play('computer', { vol: 0.4 }); };
    btn.addEventListener('pointerdown', e => { e.preventDefault(); set(true); });
    const up = () => set(false);
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
    cur.cleanup = () => o.onHold && o.onHold(false);
  }
};
