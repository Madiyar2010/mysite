// Главный модуль: меню, лобби, магазин, хост и запуск игр.
import * as A from './assets.js';
import { R, ShowroomView, GameView } from './render.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { MAPS, mapModels } from './maps.js';
import { ArenaSim, MONSTERS } from './sim-arena.js';
import { TraitorSim } from './sim-traitor.js';
import { ArenaClient, TraitorClient, banner } from './client.js';
import * as Mini from './minigames.js';
import { $, $$, esc, rid, pick, shuffle, LS, CLASSES, MODES, HATS, AURAS, TEAM_COLORS, TEAM_NAMES, Wallet } from './util.js';

// ---------- я ----------
let myPid;
try { myPid = sessionStorage.getItem('ha_pid'); if (!myPid) { myPid = rid(); sessionStorage.setItem('ha_pid', myPid); } } catch (e) { myPid = rid(); }
const me = {
  pid: myPid, name: LS.get('name', ''), model: LS.get('model', pick(A.HEROES)), cls: LS.get('cls', 'knight'),
  hat: LS.get('hat', 'none'), aura: LS.get('aura', 'none')
};
const prefs = window.__prefs = { vibe: LS.get('vibe', true) };
Net.myPid = myPid;
const thumb = m => `assets/thumbs/${m}.png`;
function saveMe() { for (const k of ['name', 'model', 'cls', 'hat', 'aura']) LS.set(k, me[k]); }
function profile() { return { pid: me.pid, name: me.name, model: me.model, cls: me.cls, hat: me.hat, aura: me.aura }; }

// ---------- общий интерфейс ----------
const S = { screen: 's-home', lobby: null, game: null, roster: null };
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  S.screen = id;
  if (id !== 's-game') { Input.active = false; Input.reset(); document.body.dataset.game = ''; $('#vision').style.display = 'none'; }
  refreshShowroom();
}
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), ms); }
function loading(t) { if (t) { $('#loading-text').textContent = t; $('#loading').classList.add('show'); } else $('#loading').classList.remove('show'); }
function vibrate(p) { if (prefs.vibe && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { } }
function updateCoins() { $$('.coin-n').forEach(e => e.textContent = Wallet.coins()); }
function openModal(id) { $(id).classList.add('show'); }
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (c) c.closest('.modal').classList.remove('show');
  const a = e.target.closest('[data-act]');
  if (a) { if (a.dataset.act === 'shop') openShop(); if (a.dataset.act === 'settings') openSettings(); }
});
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); }));
if (Input.touch) document.body.classList.add('touch');

let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (Net.peer && document.visibilityState === 'visible') keepAwake(); });

// ---------- 3D ----------
R.init($('#gl'), $('#labels'));
const showroom = new ShowroomView();
R.setView(showroom);
const ALL_MODELS = [...A.HEROES, ...Object.values(MONSTERS).map(m => m.model), ...mapModels(MAPS.arena), ...mapModels(MAPS.castle)];
const ready = A.preload([...new Set(ALL_MODELS)], p => {
  $('#load .load-bar i').style.width = (p * 100) + '%';
  $('#load span').textContent = `Загружаем героев и замок… ${Math.round(p * 100)}%`;
}).then(() => { $('#load').classList.add('done'); refreshShowroom(); });
ready.catch(e => { console.error(e); $('#load span').textContent = 'Не удалось загрузить модели. Обнови страницу.'; });
A.preload(A.HEROES.slice(0, 18)).then(refreshShowroom);

function refreshShowroom() {
  if (R.view !== showroom) return;
  const wide = innerWidth > 820;
  const panelTop = { 's-lobby': 0.30, 's-shop': 0.42 }[S.screen] ?? 0.38;
  if (wide) showroom.setShift(0.19, 0); else showroom.setShift(0, 0.5 - panelTop / 2 - 0.09);
  if (S.screen === 's-lobby' && S.lobby) {
    const list = S.lobby.players.filter(p => p.online);
    list.sort((a, b) => (b.pid === me.pid) - (a.pid === me.pid));
    showroom.setHeroes(list.slice(0, 8).map(p => ({ model: p.model, cls: p.cls, hat: p.hat, aura: p.aura, name: p.name, me: p.pid === me.pid })));
  } else showroom.setHeroes([{ model: me.model, cls: me.cls, hat: S.preview?.hat ?? me.hat, aura: S.preview?.aura ?? me.aura, name: me.name, me: true }]);
}
addEventListener('resize', refreshShowroom);

// ---------- выбор героя и класса ----------
function renderPickers() {
  for (const [hid, cid] of [['#heroes', '#classes'], ['#heroes2', '#classes2']]) {
    $(hid).innerHTML = A.HEROES.map(h => `<button class="hero ${h === me.model ? 'sel' : ''}" data-h="${h}" title="${A.HERO_NAMES[h]}"><img src="${thumb(h)}" alt="${A.HERO_NAMES[h]}" loading="lazy"></button>`).join('');
    $(cid).innerHTML = Object.entries(CLASSES).map(([id, c]) => `<button class="cls ${id === me.cls ? 'sel' : ''}" data-c="${id}"><span class="ci">${c.icon}</span><b>${c.name}</b><small>${c.desc} Супер: ${c.supName.toLowerCase()}.</small><span class="stats">❤️ ${c.hp} · 👟 ${c.speed}</span></button>`).join('');
  }
  $('#hero-name').textContent = A.HERO_NAMES[me.model];
}
function bindPickers() {
  for (const sel of ['#heroes', '#heroes2']) $(sel).addEventListener('click', e => {
    const b = e.target.closest('.hero'); if (!b) return;
    me.model = b.dataset.h; saveMe(); renderPickers(); refreshShowroom(); vibrate(10); sendProfile();
  });
  for (const sel of ['#classes', '#classes2']) $(sel).addEventListener('click', e => {
    const b = e.target.closest('.cls'); if (!b) return;
    me.cls = b.dataset.c; saveMe(); renderPickers(); refreshShowroom(); vibrate(10); sendProfile();
    if (showroom.heroes[0]) showroom.heroes[0].play(7, true);
  });
}
function sendProfile() { if (Net.peer && (Net.isHost || Net.hostConn)) Net.toHost({ t: 'prof', ...profile() }); }

// ---------- главная ----------
function initHome() {
  $('#in-name').value = me.name;
  renderPickers(); bindPickers();
  const codeIn = $('#in-code');
  const q = new URLSearchParams(location.search).get('room');
  if (q) codeIn.value = q.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });
  $('#in-name').addEventListener('input', () => { me.name = $('#in-name').value.trim().slice(0, 14); saveMe(); refreshShowroom(); });
  const readName = () => { const n = $('#in-name').value.trim().slice(0, 14); if (!n) { toast('Как тебя зовут? ✍️'); $('#in-name').focus(); return false; } me.name = n; saveMe(); return true; };
  $('#btn-create').onclick = async () => {
    if (!readName()) return;
    loading('Создаём комнату…');
    try { const code = await Net.host(); hostStart(code); }
    catch (e) { loading(false); Net.reset(); toast('Не получилось создать комнату 😕 Проверь интернет.'); }
  };
  $('#btn-join').onclick = async () => {
    if (!readName()) return;
    const c = codeIn.value.trim();
    if (c.length !== 4) { toast('Код — это 4 символа'); codeIn.focus(); return; }
    loading('Ищем комнату ' + c + '…');
    try { await Net.join(c, { t: 'hello', ...profile() }); keepAwake(); history.replaceState(null, '', location.pathname + '?room=' + c); }
    catch (e) { loading(false); toast(e.message === 'notfound' ? `Комната ${c} не найдена 🤔` : 'Не удалось подключиться. Код верный? Все в одной Wi‑Fi?', 3500); }
  };
  $('#btn-cancel').onclick = () => { loading(false); leaveRoom(); };
  updateCoins();
}

// ---------- настройки ----------
function openSettings() {
  const setSeg = (sel, val) => $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === String(val)));
  setSeg('#set-quality', R.quality); setSeg('#set-vibe', prefs.vibe ? 1 : 0);
  $('#set-quality').onclick = e => { const b = e.target.closest('button'); if (!b) return; R.setQuality(b.dataset.v); setSeg('#set-quality', b.dataset.v); };
  $('#set-vibe').onclick = e => { const b = e.target.closest('button'); if (!b) return; prefs.vibe = b.dataset.v === '1'; LS.set('vibe', prefs.vibe); setSeg('#set-vibe', b.dataset.v); vibrate(40); };
  openModal('#m-settings');
}

// ---------- магазин ----------
let shopTab = 'hats', shopFrom = 's-home';
function openShop() {
  if (S.screen === 's-game') return;
  if (S.screen !== 's-shop') shopFrom = S.screen;
  S.preview = null;
  show('s-shop'); renderShop();
}
function renderShop() {
  updateCoins();
  const items = shopTab === 'hats' ? HATS : AURAS, owned = Wallet.owned(), cur = shopTab === 'hats' ? me.hat : me.aura;
  $$('#shop-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === shopTab));
  $('#shop-grid').innerHTML = items.map(it => {
    const has = owned.has(it.id) || it.price === 0, on = cur === it.id;
    const pv = S.preview && (S.preview.hat === it.id || S.preview.aura === it.id);
    return `<button class="item ${on ? 'on' : ''} ${has ? '' : 'locked'} ${pv && !on ? 'preview' : ''}" data-id="${it.id}"><span class="ii">${it.icon}</span><b>${it.name}</b><span class="pr ${has ? 'own' : ''}">${on ? '✓ Надето' : has ? 'Надеть' : '🪙 ' + it.price}</span></button>`;
  }).join('');
}
$('#shop-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; shopTab = b.dataset.tab; S.preview = null; renderShop(); refreshShowroom(); });
$('#shop-grid').addEventListener('click', e => {
  const b = e.target.closest('.item'); if (!b) return;
  const items = shopTab === 'hats' ? HATS : AURAS, it = items.find(x => x.id === b.dataset.id);
  const key = shopTab === 'hats' ? 'hat' : 'aura';
  const has = Wallet.owned().has(it.id) || it.price === 0;
  if (has) { me[key] = it.id; saveMe(); S.preview = null; sendProfile(); vibrate(20); }
  else if (S.preview && S.preview[key] === it.id) {
    if (Wallet.buy(it)) { me[key] = it.id; saveMe(); S.preview = null; sendProfile(); toast(`Куплено: ${it.name}! 🎉`); vibrate([30, 40, 30]); if (showroom.heroes[0]) showroom.heroes[0].play(7, true); }
    else toast(`Не хватает монет: нужно ${it.price}, у тебя ${Wallet.coins()} 🪙`);
  } else { S.preview = { [key]: it.id }; toast(`Примерка! Нажми ещё раз, чтобы купить за ${it.price} 🪙`); }
  renderShop(); refreshShowroom();
});
$('#btn-shop-back').onclick = () => { S.preview = null; show(shopFrom === 's-shop' ? 's-home' : shopFrom); if (S.screen === 's-lobby') renderLobby(); };

// ======================= ХОСТ =======================
const H = { players: new Map(), mode: 'ffa', opts: { bots: 0, traitors: 1, confirm: true }, sim: null, pending: null, roster: null, inGame: false };
const BOT_NAMES = ['Бот Гоша', 'Бот Люся', 'Бот Шустрик', 'Бот Пиксель', 'Бот Ватрушка', 'Бот Чип'];

function hostStart(code) {
  H.players.clear(); H.inGame = false; H.sim = null;
  H.players.set(me.pid, { ...profile(), team: 0, online: true, pts: 0 });
  loading(false); keepAwake();
  history.replaceState(null, '', location.pathname + '?room=' + code);
  hostLobby(true);
}
function lobbyMsg() {
  return { t: 'lobby', code: Net.code, hostId: me.pid, mode: H.mode, opts: H.opts, inGame: H.inGame,
    players: [...H.players.values()].map(p => ({ pid: p.pid, name: p.name, model: p.model, cls: p.cls, hat: p.hat, aura: p.aura, team: p.team, online: p.online, pts: p.pts })) };
}
function hostLobby(go) { const m = lobbyMsg(); if (go) m.go = 1; Net.broadcast(m); }
function cleanProfile(m) {
  return { name: String(m.name || 'Игрок').slice(0, 14) || 'Игрок', model: A.HEROES.includes(m.model) ? m.model : 'character-a',
    cls: CLASSES[m.cls] ? m.cls : 'knight', hat: HATS.some(h => h.id === m.hat) ? m.hat : 'none', aura: AURAS.some(a => a.id === m.aura) ? m.aura : 'none' };
}
Net.onHostMessage = (pid, m) => {
  switch (m.t) {
    case 'hello': case 'prof': {
      let p = H.players.get(pid);
      const prof = cleanProfile(m);
      if (p) Object.assign(p, prof, { online: true });
      else {
        const t0 = [...H.players.values()].filter(x => x.online && x.team === 0).length, t1 = [...H.players.values()].filter(x => x.online && x.team === 1).length;
        p = { pid, ...prof, team: t0 <= t1 ? 0 : 1, online: true, pts: 0 }; H.players.set(pid, p);
      }
      if (m.t === 'hello') {
        if (H.inGame && H.sim) {
          if (H.roster.some(r => r.pid === pid)) { Net.sendTo(pid, startMsg()); H.sim.onJoin(pid); }
          else if (H.sim instanceof ArenaSim) {
            const r = rosterEntry(p); if (H.mode === 'tdm' || H.mode === 'ctf') r.team = p.team;
            H.roster.push(r); H.sim.addLate(r);
            Net.broadcast({ t: 'roster', roster: H.roster }, pid);
            Net.sendTo(pid, startMsg());
          } else { Net.sendTo(pid, { ...lobbyMsg(), go: 1 }); Net.sendTo(pid, { t: 'wait' }); }
        } else Net.sendTo(pid, { ...lobbyMsg(), go: 1 });
      }
      hostLobby(false);
      break;
    }
    case 'mode': if (pid === me.pid && MODES[m.mode] && !H.inGame) { H.mode = m.mode; hostLobby(false); } break;
    case 'opts': if (pid === me.pid && !H.inGame) { Object.assign(H.opts, { bots: Math.max(0, Math.min(5, m.bots | 0)), traitors: Math.max(1, Math.min(2, m.traitors | 0)), confirm: !!m.confirm }); hostLobby(false); } break;
    case 'team': {
      if (H.inGame) return;
      const target = pid === me.pid && m.pid ? m.pid : pid;
      const p = H.players.get(target); if (p) { p.team = 1 - p.team; hostLobby(false); }
      break;
    }
    case 'start': if (pid === me.pid) hostStartGame(); break;
    case 'ready': if (H.pending) { H.pending.ready.add(pid); const need = [...H.players.values()].filter(p => p.online).every(p => H.pending.ready.has(p.pid)); if (need) launchSim(); } break;
    case 'lobby': if (pid === me.pid && !H.sim) { H.inGame = false; hostLobby(true); } break;
    default: if (H.sim) H.sim.onMsg(pid, m);
  }
};
Net.onPeerLeft = pid => {
  const p = H.players.get(pid); if (!p) return;
  p.online = false;
  if (H.sim) H.sim.onLeave(pid);
  if (H.pending) { const need = [...H.players.values()].filter(x => x.online).every(x => H.pending.ready.has(x.pid)); if (need) launchSim(); }
  hostLobby(false);
};
function rosterEntry(p) { return { pid: p.pid, name: p.name, model: p.model, cls: p.cls, hat: p.hat, aura: p.aura, team: p.team }; }
function startMsg() { return { t: 'start', mode: H.mode, roster: H.roster, opts: H.opts }; }
function hostStartGame() {
  if (H.inGame) return;
  const mode = MODES[H.mode];
  const humans = [...H.players.values()].filter(p => p.online);
  const total = humans.length + (mode.group === 'arena' ? H.opts.bots : 0);
  if (total < mode.min) { toast(mode.group === 'traitor' ? 'Для «Найди предателя» нужно минимум 3 игрока' : `Нужно минимум ${mode.min} игрока — добавь ботов!`); return; }
  const roster = humans.map(rosterEntry);
  if (mode.group === 'arena' && H.opts.bots > 0) {
    const names = shuffle(BOT_NAMES);
    for (let i = 0; i < H.opts.bots; i++) {
      const b = { pid: 'bot' + i, name: names[i % names.length], model: pick(A.HEROES), cls: pick(Object.keys(CLASSES)), hat: pick(HATS).id, aura: 'none', bot: true, team: 0 };
      roster.push(b);
    }
  }
  if (H.mode === 'tdm' || H.mode === 'ctf') {
    // боты — в команду, где меньше игроков
    for (const r of roster) if (r.bot) { const c0 = roster.filter(x => !x.bot || x.assigned).filter(x => x.team === 0).length, c1 = roster.filter(x => !x.bot || x.assigned).filter(x => x.team === 1).length; r.team = c0 <= c1 ? 0 : 1; r.assigned = true; }
    if (!roster.some(r => r.team === 0) || !roster.some(r => r.team === 1)) roster.forEach((r, i) => r.team = i % 2);
  }
  roster.forEach(r => delete r.assigned);
  H.roster = roster; H.inGame = true;
  H.pending = { ready: new Set(), to: setTimeout(launchSim, 15000) };
  Net.broadcast(startMsg());
  hostLobby(false);
}
function launchSim() {
  if (!H.pending) return;
  clearTimeout(H.pending.to); H.pending = null;
  const io = { broadcast: m => Net.broadcast(m), sendTo: (p, m) => Net.sendTo(p, m), end: res => hostEndGame(res) };
  H.sim = MODES[H.mode].group === 'traitor' ? new TraitorSim(io, { roster: H.roster, opts: H.opts }) : new ArenaSim(io, { mode: H.mode, roster: H.roster });
}
function hostEndGame(res) {
  if (H.sim) H.sim.stop();
  H.sim = null; H.inGame = false;
  for (const r of res.rows) { const p = H.players.get(r.pid); if (p) p.pts += r.coins || 0; }
  Net.broadcast({ t: 'end', res });
  hostLobby(false);
}

// ======================= КЛИЕНТ =======================
Net.onMessage = m => {
  switch (m.t) {
    case 'lobby': {
      S.lobby = m; loading(false);
      if (m.go || S.screen === 's-home') { stopGame(); if (S.screen !== 's-shop') show('s-lobby'); }
      if (S.screen === 's-lobby') renderLobby();
      break;
    }
    case 'start': startGame(m); break;
    case 'roster': if (S.game) { S.roster = new Map(m.roster.map(r => [r.pid, r])); S.game.ctrl.roster = S.roster; } break;
    case 'end': showResults(m.res); break;
    case 'wait': toast('Сейчас идёт игра — подожди конца раунда ⏳', 4000); break;
    default: if (S.game) S.game.ctrl.onMsg(m);
  }
};
Net.onHostLost = () => {
  const code = Net.code;
  leaveRoom();
  $('#in-code').value = code;
  toast('Связь с комнатой потеряна. Нажми «Войти», чтобы вернуться.', 4500);
};
function leaveRoom() {
  stopGame();
  if (H.sim) H.sim.stop();
  H.sim = null; H.inGame = false; H.pending = null;
  Net.reset(); S.lobby = null;
  try { wakeLock && wakeLock.release(); } catch (e) { }
  history.replaceState(null, '', location.pathname);
  show('s-home');
}

// ---------- лобби ----------
function renderLobby() {
  const L = S.lobby; if (!L) return;
  const isHost = Net.isHost;
  const mode = MODES[L.mode], teams = L.mode === 'tdm' || L.mode === 'ctf';
  $('#lb-code').innerHTML = [...L.code].map(c => `<span>${c}</span>`).join('');
  const url = location.origin + location.pathname + '?room=' + L.code;
  const qrEl = $('#lb-qr');
  if (qrEl.dataset.url !== url) {
    qrEl.dataset.url = url;
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); qrEl.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { qrEl.style.display = 'none'; }
  }
  const online = L.players.filter(p => p.online);
  $('#lb-count').textContent = online.length + ' в комнате';
  $('#lb-players').innerHTML = online.map(p => `
    <button class="pl ${p.pid === me.pid ? 'me' : ''}" data-pid="${p.pid}">
      ${teams ? `<span class="team-dot" style="background:${TEAM_COLORS[p.team]}"></span>` : ''}
      <img src="${thumb(p.model)}" alt="">
      <div style="min-width:0"><div class="pn">${esc(p.name)}${p.pid === L.hostId ? '<span class="badge">ХОСТ</span>' : ''}</div>
      <div class="ps">${CLASSES[p.cls].icon} ${CLASSES[p.cls].name} · ⭐ ${p.pts}</div></div>
    </button>`).join('') + (teams ? `<div class="muted small" style="grid-column:1/-1">Нажми на себя, чтобы сменить команду${isHost ? ' (хост может менять любого)' : ''}</div>` : '');
  $('#lb-mode-title').textContent = isHost ? 'Выбери режим' : 'Режим';
  $('#lb-modes').innerHTML = Object.entries(MODES).map(([id, m]) => `
    <button class="mode ${id === L.mode ? 'sel' : ''} ${m.group === 'traitor' ? 'traitor' : ''}" data-m="${id}"><span class="mi">${m.icon}</span><b>${m.name}</b><small>${m.desc}</small></button>`).join('');
  let opts = '';
  if (mode.group === 'arena') opts += `<div class="opt-row"><span>🤖 Боты</span><div class="seg" data-o="bots">${[0, 1, 2, 3, 4, 5].map(n => `<button data-v="${n}" class="${L.opts.bots === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
  else opts += `<div class="opt-row"><span>😈 Предателей</span><div class="seg" data-o="traitors">${[1, 2].map(n => `<button data-v="${n}" class="${L.opts.traitors === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="opt-row"><span>🔍 Роль выгнанного</span><div class="seg" data-o="confirm"><button data-v="1" class="${L.opts.confirm ? 'on' : ''}">Показать</button><button data-v="0" class="${!L.opts.confirm ? 'on' : ''}">Скрыть</button></div></div>`;
  $('#lb-opts').innerHTML = opts;
  $$('#lb-opts .seg').forEach(s => s.style.pointerEvents = isHost ? 'auto' : 'none');
  const total = online.length + (mode.group === 'arena' ? L.opts.bots : 0);
  if (L.inGame) $('#lb-action').innerHTML = `<div class="wait">Идёт игра<span class="dots"></span></div>`;
  else if (isHost) {
    const ok = total >= mode.min;
    $('#lb-action').innerHTML = `<button class="btn gold big" id="btn-start" ${ok ? '' : 'disabled'}>${ok ? `▶ Играть: ${mode.name}` : mode.group === 'traitor' ? 'Нужно минимум 3 игрока' : 'Добавь ботов или друзей'}</button>`;
    $('#btn-start').onclick = () => { $('#btn-start').disabled = true; ready.then(() => Net.toHost({ t: 'start' })); };
  } else $('#lb-action').innerHTML = `<div class="wait">Хост выбирает режим и скоро начнёт<span class="dots"></span></div>`;
  refreshShowroom();
}
$('#lb-modes').addEventListener('click', e => { const b = e.target.closest('.mode'); if (!b) return; if (!Net.isHost) { toast('Режим выбирает хост 😊'); return; } vibrate(10); Net.toHost({ t: 'mode', mode: b.dataset.m }); });
$('#lb-opts').addEventListener('click', e => {
  const b = e.target.closest('.seg button'); if (!b || !Net.isHost) return;
  const o = b.closest('.seg').dataset.o, v = +b.dataset.v;
  const opts = { ...S.lobby.opts, [o]: o === 'confirm' ? !!v : v };
  Net.toHost({ t: 'opts', ...opts });
});
$('#lb-players').addEventListener('click', e => {
  const b = e.target.closest('.pl'); if (!b || !S.lobby) return;
  const teams = S.lobby.mode === 'tdm' || S.lobby.mode === 'ctf';
  if (!teams) return;
  if (b.dataset.pid === me.pid || Net.isHost) Net.toHost({ t: 'team', pid: b.dataset.pid });
});
$('#btn-leave').onclick = () => { if (Net.isHost && S.lobby && S.lobby.players.filter(p => p.online).length > 1 && !confirm('Ты хост. Если выйти — комната закроется для всех. Выйти?')) return; leaveRoom(); };
$('#btn-share').onclick = async () => {
  const url = location.origin + location.pathname + '?room=' + Net.code;
  const text = 'Заходи в «Замок Героев»! Код комнаты: ' + Net.code;
  try { if (navigator.share) { await navigator.share({ title: 'Замок Героев', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована 📋'); } catch (e) { toast('Код комнаты: ' + Net.code); }
};
$('#btn-hero').onclick = () => { renderPickers(); openModal('#m-hero'); };

// ---------- игра ----------
function metaArena(k, id) {
  if (k.startsWith('m:')) {
    const mt = MONSTERS[k.slice(2)]; if (!mt) return null;
    return { model: mt.model, name: mt.boss ? '' : mt.name, scale: mt.scale, hpBar: !mt.boss, nameColor: '#ffb3bd', ring: mt.boss ? '#ff3355' : null, label: !mt.boss };
  }
  const r = S.roster.get(k); if (!r) return null;
  const teams = S.game.mode === 'tdm' || S.game.mode === 'ctf';
  const mine = k === me.pid;
  return { model: r.model, cls: r.cls, hat: r.hat, aura: r.aura, name: r.name + (r.bot ? ' 🤖' : ''), me: mine, hpBar: true,
    ring: teams ? TEAM_COLORS[r.team] : mine ? '#ffd166' : null, nameColor: teams ? TEAM_COLORS[r.team] : mine ? '#ffd166' : '#fff' };
}
async function startGame(m) {
  loading('Готовим поле боя…');
  try { await ready; } catch (e) { }
  stopGame();
  Mini.close();
  $$('.modal').forEach(x => x.classList.remove('show'));
  S.roster = new Map(m.roster.map(r => [r.pid, r]));
  const group = MODES[m.mode].group;
  const view = new GameView({ map: group === 'traitor' ? MAPS.castle : MAPS.arena, mode: m.mode, myPid: me.pid, metaOf: (k, id) => metaArena(k, id) });
  S.game = { mode: m.mode, view };
  R.setView(view);
  const ctx = { view, myPid: me.pid, mode: m.mode, roster: S.roster, send: msg => Net.toHost(msg) };
  S.game.ctrl = group === 'traitor' ? new TraitorClient(ctx) : new ArenaClient(ctx);
  $('#banner').innerHTML = ''; $('#killfeed').innerHTML = ''; $('#center-big').className = ''; $('#center-big').dataset.mode = '';
  show('s-game');
  document.body.dataset.game = group;
  Input.active = true;
  loading(false);
  Net.toHost({ t: 'ready' });
  if (group === 'arena') banner(`${MODES[m.mode].icon} ${MODES[m.mode].name}`, 'big', 2500);
}
function stopGame() {
  if (S.game) { S.game.ctrl.dispose(); S.game = null; }
  Mini.close();
  $('#meeting').className = '';
  if (R.view !== showroom) { R.setView(showroom); showroom.key = null; }
}
Input.init($('#s-game'), $('#joy'));
Input.onKey = a => {
  if (!S.game) return;
  if (a === 'board' && S.game.mode !== 'traitor') { $('#board').classList.add('show'); S.game.ctrl.renderBoard && S.game.ctrl.renderBoard(); }
  if (a === 'boardUp') $('#board').classList.remove('show');
  if (a === 'chat' && $('#meeting').classList.contains('show')) $('#chat-in').focus();
  if (Input.onKeyGame) Input.onKeyGame(a);
};
// кнопки действий на сенсорном экране
const holdBtn = $('#b-atk');
holdBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Input.atkHeld = true; holdBtn.setPointerCapture(e.pointerId); });
const release = () => { Input.atkHeld = false; };
holdBtn.addEventListener('pointerup', release); holdBtn.addEventListener('pointercancel', release); holdBtn.addEventListener('lostpointercapture', release);
$('#b-sup').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Input.seq.sup++; vibrate(15); });
for (const id of ['#b-emo', '#b-emo2']) $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Input.seq.emo++; });
$$('#actions .act, #hud-top button, #t-tasks, #me-panel').forEach(b => b.addEventListener('pointerdown', e => e.stopPropagation()));
$('#btn-board').onclick = () => { $('#board').classList.add('show'); S.game && S.game.ctrl.renderBoard && S.game.ctrl.renderBoard(); };
$('#btn-pause').onclick = () => openModal('#m-pause');
$('#btn-quit').onclick = () => { $('#m-pause').classList.remove('show'); if (Net.isHost && !confirm('Ты хост. Комната закроется для всех. Выйти?')) return; leaveRoom(); };

// ---------- итоги ----------
function showResults(res) {
  stopGame();
  show('s-results');
  const mine = res.rows.find(r => r.pid === me.pid);
  if (mine && mine.coins) { Wallet.add(mine.coins); updateCoins(); }
  $('#res-title').textContent = res.winText;
  $('.trophy').textContent = mine && mine.win ? '🏆' : res.mode === 'traitor' && res.win === 'traitor' ? '😈' : '🎖️';
  $('#res-coins').innerHTML = mine && mine.coins ? `+${mine.coins} 🪙 <span class="muted small">монет в копилку</span>` : '';
  const roster = S.roster || new Map();
  $('#res-list').innerHTML = res.rows.map((r, i) => {
    const info = roster.get(r.pid) || {};
    let stat = '';
    if (res.mode === 'traitor') stat = r.role === 'traitor' ? `😈 Предатель · 🔪 ${r.kills}` : `🛡️ Команда · ✅ ${r.tasks} заданий${r.alive ? '' : ' · 👻'}`;
    else if (res.mode === 'pve') stat = `💀 ${r.kills} монстров · выбит ${r.deaths} раз`;
    else stat = `⚔️ ${r.kills} · 💀 ${r.deaths}${r.caps ? ' · 🚩 ' + r.caps : ''}`;
    const teamCol = (res.mode === 'tdm' || res.mode === 'ctf') ? TEAM_COLORS[r.team] : '#fff';
    return `<div class="rr ${r.win ? 'win' : ''} ${r.pid === me.pid ? 'me' : ''}"><span class="rk">${r.win ? '🏆' : i + 1}</span><img src="${thumb(info.model || 'character-a')}"><div class="rn" style="color:${teamCol}">${esc(r.name)}${r.bot ? ' 🤖' : ''}<div class="rs">${stat}</div></div><div class="rc">${r.bot ? '' : '+' + r.coins + ' 🪙'}</div></div>`;
  }).join('');
  if (Net.isHost) {
    $('#res-action').innerHTML = `<div class="row"><button class="btn gold grow" id="btn-again">🔁 Ещё раз</button><button class="btn ghost grow" id="btn-tolobby">🏠 В лобби</button></div>`;
    $('#btn-again').onclick = () => { H.inGame = false; hostStartGame(); };
    $('#btn-tolobby').onclick = () => Net.toHost({ t: 'lobby' });
  } else $('#res-action').innerHTML = `<div class="wait">Ждём хоста<span class="dots"></span></div><button class="btn ghost big" data-act="shop" style="margin-top:10px">🛒 Магазин</button>`;
  vibrate(mine && mine.win ? [60, 60, 60, 60, 120] : 50);
}

window.addEventListener('beforeunload', e => { if (Net.isHost && H.players.size > 1) { e.preventDefault(); e.returnValue = ''; } });
initHome();
