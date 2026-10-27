// Главный модуль: меню, лобби, магазин, хост и запуск игр.
import * as A from './assets.js';
import { R, ShowroomView, AmongView, hatThumb } from './render.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { AMAPS, AMAP_LIST, amapModels } from './amap.js';
import { ShooterSim, S_MONSTERS, SHOOT_DEFAULTS } from './shooter/ssim.js';
import { ShooterView } from './shooter/sview.js';
import { ShooterClient, shBanner, KEY_DEF, keyName } from './shooter/sclient.js';
import { SMAPS, SMAP_LIST, smapModels } from './shooter/smap.js';
import { WEAPONS } from './shooter/weapons.js';
import { AmongSim, DEFAULT_OPTS } from './among-sim.js';
import { AmongClient } from './among-client.js';
import * as Tasks from './among-tasks.js';
import { Sound } from './sound.js';
import { icon } from './icons.js';
import { $, $$, esc, rid, pick, shuffle, LS, CLASSES, MODES, HATS, AURAS, TEAM_COLORS, TEAM_NAMES, Wallet } from './util.js';

// ---------- я ----------
let myPid;
// постоянный номер устройства: после закрытия вкладки можно вернуться в ту же игру с теми же очками
try { myPid = localStorage.getItem('ha_pid') || sessionStorage.getItem('ha_pid'); if (!myPid) myPid = rid(); localStorage.setItem('ha_pid', myPid); } catch (e) { myPid = rid(); }
const me = {
  pid: myPid, name: LS.get('name', ''), model: LS.get('model', pick(A.HEROES)), cls: LS.get('cls', 'knight'),
  hat: LS.get('hat', 'none'), aura: LS.get('aura', 'none'), color: LS.get('color', '#ffd166'), adult: LS.get('adult', false)
};
const prefs = window.__prefs = { vibe: LS.get('vibe', true) };
Net.myPid = myPid;
const thumb = m => `assets/thumbs/${m}.png`;
const PCOLORS = ['#ffd166', '#ff6b78', '#4da3ff', '#5ee07a', '#b46bff', '#ff9a3d', '#3dd6d0', '#ff7ad9'];
function saveMe() { for (const k of ['name', 'model', 'cls', 'hat', 'aura', 'color', 'adult']) LS.set(k, me[k]); }
function profile() { return { pid: me.pid, name: me.name, model: me.model, cls: me.cls, hat: me.hat, aura: me.aura, color: me.color, adult: !!me.adult }; }
function hydrate(root = document) { root.querySelectorAll('[data-ic]').forEach(el => { if (!el.firstChild) el.innerHTML = icon(el.dataset.ic); }); }

// ---------- общий интерфейс ----------
const S = { screen: 's-home', lobby: null, game: null, roster: null };
const GAME_SCREENS = ['s-shoot', 's-among'];
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  S.screen = id;
  const game = GAME_SCREENS.includes(id);
  if (!game) { Input.active = false; Input.reset(); document.body.dataset.game = ''; Sound.playMusic('menu'); }
  else Sound.playMusic(id === 's-among' ? 'tense' : 'battle');
  refreshShowroom();
}
function toast(t, ms = 2600) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), ms); }
function loading(t) { if (t) { $('#loading-text').textContent = t; $('#loading').classList.add('show'); } else $('#loading').classList.remove('show'); }
function vibrate(p) { if (prefs.vibe && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { } }
function updateCoins() { $$('.coin-n').forEach(e => e.textContent = Wallet.coins()); }
function openModal(id) { $(id).classList.add('show'); Sound.play('open', { vol: 0.5 }); }
// на весь экран: повторное нажатие выходит; на iPhone браузер не умеет — подсказываем добавить на экран «Домой»
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
async function goFullscreen(toggle) {
  const d = document.documentElement;
  const req = d.requestFullscreen || d.webkitRequestFullscreen;
  if (fsEl()) { if (!toggle) return; try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { } return; }
  if (!req || /iPhone|iPod/.test(navigator.userAgent)) {
    if (navigator.standalone || !toggle) return;
    openModal('#m-a2hs');
    return;
  }
  try { const r = req.call(d, { navigationUI: 'hide' }); if (r && r.then) await r; }
  catch (e) { if (toggle) toast('Браузер не разрешил полный экран. Попробуй ещё раз.'); return; }
  try { await screen.orientation.lock('landscape'); } catch (e) { }
}
function updateFs() { const on = !!fsEl(); $$('.fs-label').forEach(x => x.textContent = on ? 'Выйти из полного экрана' : 'На весь экран'); }
document.addEventListener('fullscreenchange', updateFs); document.addEventListener('webkitfullscreenchange', updateFs);
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]'); if (c) c.closest('.modal').classList.remove('show');
  const a = e.target.closest('[data-act]');
  if (a) {
    const k = a.dataset.act;
    if (k === 'shop') openShop(); if (k === 'settings') openSettings(); if (k === 'fullscreen') goFullscreen(true); if (k === 'pause') { renderPausePlayers(); openModal('#m-pause'); }
  }
});
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); }));
if (Input.touch) { document.body.classList.add('touch'); document.body.classList.add('need-landscape'); window.__touch = true; }
// айфон и айпад: вибрации нет, полный экран — только через «На экран Домой»
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = navigator.standalone || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
if (IOS) document.body.classList.add('ios');
if (STANDALONE) document.body.classList.add('standalone');
if (IOS && !STANDALONE && !LS.get('a2hs', false)) setTimeout(() => { if (S.screen === 's-home') { LS.set('a2hs', true); openModal('#m-a2hs'); } }, 2500);
$('#btn-a2hs').onclick = () => openModal('#m-a2hs');
hydrate();

let wakeLock = null;
async function keepAwake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (Net.peer && document.visibilityState === 'visible') keepAwake(); });

// ---------- 3D ----------
R.init($('#gl'), $('#labels'));
R.onAuto = t => toast(t, 3500);
const showroom = new ShowroomView();
R.setView(showroom);
const ALL_MODELS = [...A.HEROES, ...Object.values(S_MONSTERS).map(m => m.model), 'grave/character-ghost', ...smapModels(SMAPS.warehouse), ...Object.values(WEAPONS).filter(w => w.model).map(w => w.model), ...amapModels(AMAPS.station)];
A.preload(A.HEROES).then(refreshShowroom);
const ready = A.preload([...new Set(ALL_MODELS)], p => {
  $('#load .load-bar i').style.width = (p * 100) + '%';
  $('#load span').textContent = `Загружаем героев и карты… ${Math.round(p * 100)}%`;
}).then(() => { $('#load').classList.add('done'); refreshShowroom(); });
ready.catch(e => { console.error(e); $('#load span').textContent = 'Не удалось загрузить модели. Обнови страницу.'; });

const SHOW_GUNS = ['rifle', 'plasma', 'paint', 'sniper', 'smg', 'snow', 'railgun', 'water'];
function refreshShowroom() {
  if (R.view !== showroom) return;
  const wide = innerWidth > 820 || innerWidth > innerHeight;
  const panelTop = { 's-lobby': 0.30, 's-shop': 0.42 }[S.screen] ?? 0.38;
  if (wide) showroom.setShift(innerWidth > innerHeight * 1.6 ? 0.2 : 0.19, 0); else showroom.setShift(0, 0.5 - panelTop / 2 - 0.09);
  if (S.screen === 's-lobby' && S.lobby) {
    const list = S.lobby.players.filter(p => p.online);
    list.sort((a, b) => (b.pid === me.pid) - (a.pid === me.pid));
    showroom.setHeroes(list.slice(0, 8).map((p, i) => ({ model: p.model, gun: SHOW_GUNS[i % SHOW_GUNS.length], gunW: WEAPONS[SHOW_GUNS[i % SHOW_GUNS.length]], hat: p.hat, aura: p.aura, name: p.name, me: p.pid === me.pid })));
  } else showroom.setHeroes([{ model: me.model, gun: 'rifle', gunW: WEAPONS.rifle, hat: S.preview?.hat ?? me.hat, aura: S.preview?.aura ?? me.aura, name: me.name, me: true }]);
}
addEventListener('resize', refreshShowroom);

// ---------- выбор героя и класса ----------
function renderPickers() {
  for (const [hid, cid] of [['#heroes', '#classes'], ['#heroes2', '#classes2']]) {
    $(hid).innerHTML = A.HEROES.map(h => `<button class="hero ${h === me.model ? 'sel' : ''}" data-h="${h}" title="${A.HERO_NAMES[h]}"><img src="${thumb(h)}" alt="${A.HERO_NAMES[h]}" loading="lazy"></button>`).join('');
    if ($(cid)) $(cid).innerHTML = Object.entries(CLASSES).map(([id, c]) => `<button class="cls ${id === me.cls ? 'sel' : ''}" data-c="${id}"><span class="ci">${icon(c.icon)}</span><b>${c.name}</b><small>${c.desc} Супер: ${c.supName.toLowerCase()}.</small><span class="stats">${icon('heart')} ${c.hp} · ${icon('speed')} ${c.speed}</span></button>`).join('');
  }
  $('#hero-name').textContent = A.HERO_NAMES[me.model];
}
function bindPickers() {
  for (const sel of ['#heroes', '#heroes2']) $(sel).addEventListener('click', e => {
    const b = e.target.closest('.hero'); if (!b) return;
    me.model = b.dataset.h; saveMe(); renderPickers(); refreshShowroom(); vibrate(10); sendProfile();
  });
  for (const sel of ['#classes', '#classes2']) if ($(sel)) $(sel).addEventListener('click', e => {
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
  // вернулись в ту же комнату (закрыли вкладку или перезагрузили) — заходим сами
  const last = LS.get('last', null);
  if (q && last && last.code === codeIn.value && Date.now() - last.t < 40 * 60 * 1000 && me.name) setTimeout(() => { if (!Net.code) $('#btn-join').click(); }, 600);
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });
  $('#in-name').addEventListener('input', () => { me.name = $('#in-name').value.trim().slice(0, 14); saveMe(); refreshShowroom(); });
  const drawColors = () => { $('#colors').innerHTML = PCOLORS.map(c => `<button class="sw ${c === me.color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="цвет"></button>`).join(''); };
  drawColors();
  $('#colors').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; me.color = b.dataset.c; saveMe(); drawColors(); Sound.play('select', { vol: 0.5 }); if (Net.code) Net.toHost({ t: 'prof', ...profile() }); };
  $('#in-adult').checked = !!me.adult;
  $('#in-adult').onchange = () => { me.adult = $('#in-adult').checked; saveMe(); if (Net.code) Net.toHost({ t: 'prof', ...profile() }); };
  const readName = () => { const n = $('#in-name').value.trim().slice(0, 14); if (!n) { toast('Как тебя зовут?'); $('#in-name').focus(); return false; } me.name = n; saveMe(); return true; };
  $('#btn-create').onclick = async () => {
    if (!readName()) return;
    if (Input.touch) goFullscreen();
    loading('Создаём комнату…');
    try { const code = await Net.host(); hostStart(code); }
    catch (e) { loading(false); Net.reset(); toast('Не получилось создать комнату. Проверь интернет.'); }
  };
  $('#btn-join').onclick = async () => {
    if (!readName()) return;
    const c = codeIn.value.trim();
    if (c.length !== 4) { toast('Код — это 4 символа'); codeIn.focus(); return; }
    if (Input.touch) goFullscreen();
    loading('Ищем комнату ' + c + '…');
    try { await Net.join(c, { t: 'hello', ...profile() }); keepAwake(); history.replaceState(null, '', location.pathname + '?room=' + c); LS.set('last', { code: c, t: Date.now() }); }
    catch (e) { loading(false); toast(e.message === 'notfound' ? `Комната ${c} не найдена` : 'Не удалось подключиться. Код верный? Все в одной Wi‑Fi?', 3500); }
  };
  $('#btn-cancel').onclick = () => { loading(false); leaveRoom(); };
  updateCoins();
  Sound.playMusic('menu');
}

// ---------- настройки ----------
function openSettings() {
  const setSeg = (sel, val) => $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v === String(val)));
  setSeg('#set-quality', R.quality); setSeg('#set-vibe', prefs.vibe ? 1 : 0); setSeg('#set-quiet', Sound.quiet ? 1 : 0);
  $('#set-sfx').value = Sound.sfxVol * 100; $('#set-music').value = Sound.musicVol * 100;
  $('#set-sfx').oninput = e => { Sound.set('sfxVol', e.target.value / 100); };
  $('#set-sfx').onchange = () => Sound.play('confirm');
  $('#set-music').oninput = e => { Sound.set('musicVol', e.target.value / 100); };
  $('#set-ui').value = Sound.uiVol * 100; $('#set-ui').oninput = e => { Sound.set('uiVol', e.target.value / 100); Sound.play('click', { vol: 0.6, ui: true }); };
  $('#set-sens').value = LS.get('sens', 1) * 100; $('#set-sens').oninput = e => LS.set('sens', e.target.value / 100);
  setSeg('#set-aim', LS.get('aimhelp', true) === false ? 0 : 1); setSeg('#set-auto', LS.get('autofire', true) === false ? 0 : 1);
  $('#set-aim').onclick = e => { const b = e.target.closest('button'); if (!b) return; LS.set('aimhelp', b.dataset.v === '1'); setSeg('#set-aim', b.dataset.v); };
  $('#set-auto').onclick = e => { const b = e.target.closest('button'); if (!b) return; LS.set('autofire', b.dataset.v === '1'); setSeg('#set-auto', b.dataset.v); };
  $('#set-keys').onclick = () => { $('#m-settings').classList.remove('show'); openKeys(); };
  $('#set-layout').onclick = () => { if (S.game) { toast('Кнопки настраиваются вне игры — выйди в лобби или на главный экран'); return; } $('#m-settings').classList.remove('show'); layoutEdit(true); };
  $('#set-quality').onclick = e => { const b = e.target.closest('button'); if (!b) return; R.setQuality(b.dataset.v); setSeg('#set-quality', b.dataset.v); };
  $('#set-vibe').onclick = e => { const b = e.target.closest('button'); if (!b) return; prefs.vibe = b.dataset.v === '1'; LS.set('vibe', prefs.vibe); setSeg('#set-vibe', b.dataset.v); vibrate(40); };
  $('#set-quiet').onclick = e => { const b = e.target.closest('button'); if (!b) return; Sound.set('quiet', b.dataset.v === '1'); setSeg('#set-quiet', b.dataset.v); };
  openModal('#m-settings');
}

// ---------- магазин ----------
let shopTab = 'hats', shopFrom = 's-home';
function openShop() {
  if (GAME_SCREENS.includes(S.screen)) return;
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
    const th = shopTab === 'hats' && hatThumb(it.id);
    const pic = shopTab === 'auras' ? `<span class="swatch ${it.color ? 'glow' : ''}" style="--c:${it.color === 'rainbow' ? '#fff' : it.color || 'transparent'};background:${it.color === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : it.color ? `radial-gradient(circle,#fff 0 12%,${it.color} 35%,transparent 72%)` : 'transparent'}"></span>` : th ? `<img class="hat3d" src="${th}" alt="">` : icon(it.icon);
    return `<button class="item ${on ? 'on' : ''} ${has ? '' : 'locked'} ${pv && !on ? 'preview' : ''}" data-id="${it.id}"><span class="ii">${pic}</span><b>${it.name}</b><span class="pr ${has ? 'own' : ''}">${on ? icon('check') + ' Надето' : has ? 'Надеть' : icon('coin') + ' ' + it.price}</span></button>`;
  }).join('');
}
$('#shop-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; shopTab = b.dataset.tab; S.preview = null; renderShop(); refreshShowroom(); });
$('#shop-grid').addEventListener('click', e => {
  const b = e.target.closest('.item'); if (!b) return;
  const items = shopTab === 'hats' ? HATS : AURAS, it = items.find(x => x.id === b.dataset.id);
  const key = shopTab === 'hats' ? 'hat' : 'aura';
  const has = Wallet.owned().has(it.id) || it.price === 0;
  if (has) { me[key] = it.id; saveMe(); S.preview = null; sendProfile(); vibrate(20); Sound.play('select'); }
  else if (S.preview && S.preview[key] === it.id) {
    if (Wallet.buy(it)) { me[key] = it.id; saveMe(); S.preview = null; sendProfile(); toast(`Куплено: ${it.name}!`); Sound.play('j_win', { vol: 0.6 }); vibrate([30, 40, 30]); if (showroom.heroes[0]) showroom.heroes[0].play(7, true); }
    else { toast(`Не хватает монет: нужно ${it.price}, у тебя ${Wallet.coins()}`); Sound.play('error'); }
  } else { S.preview = { [key]: it.id }; toast(`Примерка! Нажми ещё раз, чтобы купить за ${it.price} монет`); }
  renderShop(); refreshShowroom();
});
$('#btn-shop-back').onclick = () => { S.preview = null; show(shopFrom === 's-shop' ? 's-home' : shopFrom); if (S.screen === 's-lobby') renderLobby(); };

// ======================= ХОСТ =======================
const H = { players: new Map(), mode: 'tdm', opts: { ...SHOOT_DEFAULTS, ...DEFAULT_OPTS, bots: 0 }, sim: null, pending: null, roster: null, inGame: false };
const BOT_NAMES = ['Бот Гоша', 'Бот Люся', 'Бот Шустрик', 'Бот Пиксель', 'Бот Ватрушка', 'Бот Чип'];
// допустимые значения настроек «Найди предателя»
const AM_SET = {
  maxPlayers: [4, 5, 6, 7, 8, 10], impostors: [1, 2, 3], meetings: [0, 1, 2, 3], discuss: [0, 15, 30, 60], vote: [30, 60, 90, 120],
  speed: [0.75, 1, 1.25, 1.5], crewVision: [0.5, 0.75, 1, 1.5], impVision: [1, 1.5, 2], killCd: [10, 20, 25, 30, 45], killDist: [0, 1, 2],
  common: [0, 1, 2], long: [0, 1, 2, 3], short: [1, 2, 3, 4, 5], taskBar: ['always', 'meetings', 'never'],
  engineer: [0, 1], scientist: [0, 1], sheriff: [0, 1], angel: [0, 1], shapeshifter: [0, 1], bots: [0, 1, 2, 3, 4, 5, 6, 7],
  pveDiff: [0, 1, 2], teamSize: [0, 2, 3, 4, 5], match: ['rounds', 'timed'], rounds: [3, 5, 7, 13], roundTime: [60, 90, 120], timeLimit: [180, 300, 600], botLevel: [0, 1, 2]
};
const AM_BOOL = ['confirm', 'anon', 'visualTasks', 'ff', 'endless'];

// последние настройки хоста сохраняются на устройстве
// в «Команда на команду» раунды до 13 или 7, в остальных — 3, 5 или 7
function fixRounds() { if (H.mode === 'tdm') { if (![7, 13].includes(H.opts.rounds)) H.opts.rounds = 13; } else if (H.opts.rounds === 13) H.opts.rounds = 5; }
function saveHostSet() { LS.set('hostSet', { mode: H.mode, opts: H.opts }); }
function loadHostSet() {
  const sv = LS.get('hostSet', null); if (!sv) return;
  if (MODES[sv.mode]) H.mode = sv.mode;
  for (const [k, v] of Object.entries(sv.opts || {})) {
    if (k === 'map' ? AMAP_LIST.some(x => x.id === v && x.ready) : k === 'smap' ? SMAP_LIST.some(x => x.id === v && x.ready) : AM_BOOL.includes(k) ? typeof v === 'boolean' : AM_SET[k] && AM_SET[k].includes(v)) H.opts[k] = v;
  }
}
function hostStart(code) {
  H.banned = new Set();
  loadHostSet(); fixRounds();
  H.players.clear(); H.inGame = false; H.sim = null;
  H.players.set(me.pid, { ...profile(), team: 0, online: true, pts: 0 });
  loading(false); keepAwake();
  history.replaceState(null, '', location.pathname + '?room=' + code);
  hostLobby(true);
}
function lobbyMsg() {
  return { t: 'lobby', code: Net.code, hostId: me.pid, mode: H.mode, opts: H.opts, inGame: H.inGame,
    players: [...H.players.values()].map(p => ({ pid: p.pid, name: p.name, model: p.model, cls: p.cls, hat: p.hat, aura: p.aura, color: p.color, adult: p.adult, team: p.team, online: p.online, pts: p.pts, ready: !!p.ready, vote: p.vote || null })) };
}
function hostLobby(go) { const m = lobbyMsg(); if (go) m.go = 1; Net.broadcast(m); }
function cleanProfile(m) {
  return { name: String(m.name || 'Игрок').slice(0, 14) || 'Игрок', model: A.HEROES.includes(m.model) ? m.model : 'character-a',
    cls: CLASSES[m.cls] ? m.cls : 'knight', hat: HATS.some(h => h.id === m.hat) ? m.hat : 'none', aura: AURAS.some(a => a.id === m.aura) ? m.aura : 'none', color: PCOLORS.includes(m.color) ? m.color : '#ffd166', adult: !!m.adult };
}
Net.onHostMessage = (pid, m) => {
  switch (m.t) {
    case 'hello': case 'prof': {
      if (H.banned && H.banned.has(pid)) { Net.sendTo(pid, { t: 'kicked' }); Net.drop(pid); return; }
      let p = H.players.get(pid);
      const prof = cleanProfile(m);
      if (!p && m.t === 'hello' && H.mode === 'traitor' && [...H.players.values()].filter(x => x.online).length >= H.opts.maxPlayers) { Net.sendTo(pid, { t: 'full' }); return; }
      if (p) Object.assign(p, prof, { online: true });
      else {
        const t0 = [...H.players.values()].filter(x => x.online && x.team === 0).length, t1 = [...H.players.values()].filter(x => x.online && x.team === 1).length;
        p = { pid, ...prof, team: t0 <= t1 ? 0 : 1, online: true, pts: 0 }; H.players.set(pid, p);
      }
      if (m.t === 'hello') {
        if (H.inGame && H.sim) {
          if (H.roster.some(r => r.pid === pid)) { Net.sendTo(pid, startMsg()); H.sim.onJoin(pid); }
          else if (H.sim instanceof ShooterSim) {
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
    case 'mode': if (pid === me.pid && MODES[m.mode] && !H.inGame) { H.mode = m.mode; fixRounds(); saveHostSet(); hostLobby(false); } break;
    case 'lready': { const p = H.players.get(pid); if (!p || H.inGame) return; p.ready = !!m.v; hostLobby(false); checkAllReady(); break; }
    case 'vote': { const p = H.players.get(pid); if (!p || H.inGame) return; p.vote = p.vote || {}; if (m.k === 'mode' && MODES[m.v]) p.vote.mode = m.v; if ((m.k === 'map' || m.k === 'smap') && typeof m.v === 'string') p.vote.map = m.v; hostLobby(false); break; }
    case 'lact': if (pid === me.pid && !H.inGame) lobbyAction(m.a); break;
    case 'opt': {
      if (pid !== me.pid || H.inGame) return;
      if (m.k === 'map') { if (AMAP_LIST.some(x => x.id === m.v && x.ready)) H.opts.map = m.v; }
      else if (m.k === 'smap') { if (SMAP_LIST.some(x => x.id === m.v && x.ready)) H.opts.smap = m.v; }
      else if (AM_BOOL.includes(m.k)) H.opts[m.k] = !!m.v;
      else if (AM_SET[m.k] && AM_SET[m.k].includes(m.v)) H.opts[m.k] = m.v;
      saveHostSet();
      hostLobby(false);
      break;
    }
    case 'team': {
      if (H.inGame) return;
      const target = pid === me.pid && m.pid ? m.pid : pid;
      const p = H.players.get(target); if (p) { p.team = m.to === 0 || m.to === 1 ? m.to : 1 - p.team; hostLobby(false); }
      break;
    }
    case 'start': if (pid === me.pid) hostStartGame(); break;
    case 'kick': {
      // хост выгоняет игрока: больше в эту комнату он не зайдёт
      if (pid !== me.pid || m.pid === me.pid || !H.players.has(m.pid)) return;
      H.banned.add(m.pid);
      Net.sendTo(m.pid, { t: 'kicked' }); Net.drop(m.pid);
      if (H.sim) H.sim.onLeave(m.pid);
      H.players.delete(m.pid);
      if (H.pending) { const need = [...H.players.values()].filter(x => x.online).every(x => H.pending.ready.has(x.pid)); if (need) launchSim(); }
      hostLobby(false);
      break;
    }
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
function startMsg() { return { t: 'start', mode: H.mode, roster: H.roster, opts: H.gameOpts || H.opts }; }
// все нажали «Готов» — начинаем сами
function checkAllReady() {
  const on = [...H.players.values()].filter(p => p.online), mode = MODES[H.mode];
  const total = on.length + (mode.group === 'arena' ? (isTeamMode(H.mode) && H.opts.teamSize ? 99 : H.opts.bots) : 0);
  if (on.length >= 2 && on.every(p => p.ready) && total >= mode.min && !H.inGame) { Net.broadcast({ t: 'msg', text: 'Все готовы — начинаем!' }); setTimeout(() => { if ([...H.players.values()].filter(p => p.online).every(p => p.ready)) hostStartGame(); }, 1200); }
}
const isTeamMode = m => m === 'tdm' || m === 'ctf';
function topVote(key, allowed) {
  const cnt = {};
  for (const p of H.players.values()) if (p.online && p.vote && p.vote[key] && allowed(p.vote[key])) cnt[p.vote[key]] = (cnt[p.vote[key]] || 0) + 1;
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return best && best[0];
}
function lobbyAction(a) {
  const on = [...H.players.values()].filter(p => p.online);
  if (a === 'votes') {
    const md = topVote('mode', v => MODES[v]); if (md) H.mode = md;
    const grp = MODES[H.mode].group;
    const mp = topVote('map', v => grp === 'traitor' ? AMAP_LIST.some(x => x.id === v && x.ready) : SMAP_LIST.some(x => x.id === v && x.ready));
    if (mp) { if (grp === 'traitor') H.opts.map = mp; else H.opts.smap = mp; }
    if (!md && !mp) Net.sendTo(me.pid, { t: 'msg', text: 'Пока никто не голосовал' });
  } else if (a === 'random') {
    const ok = Object.keys(MODES).filter(k => MODES[k].group === 'arena' || on.length >= MODES[k].min);
    H.mode = pick(ok);
    if (MODES[H.mode].group === 'traitor') H.opts.map = pick(AMAP_LIST.filter(x => x.ready)).id; else H.opts.smap = pick(SMAP_LIST.filter(x => x.ready && !x.pve)).id;
    if (MODES[H.mode].group === 'arena' && on.length < 2 && !H.opts.bots && !H.opts.teamSize) H.opts.bots = 3;
  } else if (a === 'shuffle' || a === 'fair') {
    // «Честные команды»: сначала взрослые по разным командам, потом дети
    const list = shuffle(on), adults = list.filter(p => p.adult), kids = list.filter(p => !p.adult);
    const order = a === 'fair' ? adults.concat(kids) : list;
    const cnt = [0, 0]; order.forEach(p => { const t = cnt[0] <= cnt[1] ? 0 : 1; p.team = t; cnt[t]++; });
    if (a === 'fair' && adults.length >= 2) { /* взрослые уже чередуются */ }
  }
  fixRounds(); saveHostSet(); hostLobby(false);
}
function hostStartGame() {
  if (H.inGame) return;
  const mode = MODES[H.mode];
  const humans = [...H.players.values()].filter(p => p.online);
  const total = humans.length + (mode.group === 'arena' ? (isTeamMode(H.mode) && H.opts.teamSize ? 2 * H.opts.teamSize : H.opts.bots) : 0);
  if (total < mode.min) { toast(mode.group === 'traitor' ? 'Для «Найди предателя» нужно минимум 3 игрока' : `Нужно минимум ${mode.min} игрока — добавь ботов!`); return; }
  const roster = humans.map(rosterEntry);
  // размер команды: свободные места в каждой команде занимают боты
  let nb = mode.group === 'arena' ? H.opts.bots : 0;
  const fill = mode.group === 'arena' && isTeamMode(H.mode) && H.opts.teamSize > 0;
  if (fill) nb = Math.max(0, H.opts.teamSize - humans.filter(p => p.team === 0).length) + Math.max(0, H.opts.teamSize - humans.filter(p => p.team === 1).length);
  if (nb > 0) {
    const names = shuffle(BOT_NAMES);
    for (let i = 0; i < nb; i++) roster.push({ pid: 'bot' + i, name: names[i % names.length] + (i >= names.length ? ' ' + (i + 1) : ''), model: pick(A.HEROES), hat: pick(HATS).id, aura: 'none', bot: true, team: 0 });
  }
  if (H.mode === 'tdm' || H.mode === 'ctf') {
    for (const r of roster) if (r.bot) { const c0 = roster.filter(x => !x.bot || x.assigned).filter(x => x.team === 0).length, c1 = roster.filter(x => !x.bot || x.assigned).filter(x => x.team === 1).length; r.team = fill ? (c0 < H.opts.teamSize ? 0 : 1) : (c0 <= c1 ? 0 : 1); r.assigned = true; }
    if (!roster.some(r => r.team === 0) || !roster.some(r => r.team === 1)) roster.forEach((r, i) => r.team = i % 2);
  }
  roster.forEach(r => delete r.assigned);
  // «Монстры» — всегда на Арене, остальные режимы — не на Арене
  H.gameOpts = { ...H.opts, smap: H.mode === 'pve' ? 'arena' : (H.opts.smap === 'arena' ? 'warehouse' : H.opts.smap) };
  H.roster = roster; H.inGame = true;
  H.pending = { ready: new Set(), to: setTimeout(launchSim, 15000) };
  Net.broadcast(startMsg());
  hostLobby(false);
}
function launchSim() {
  if (!H.pending) return;
  clearTimeout(H.pending.to); H.pending = null;
  const io = { broadcast: m => Net.broadcast(m), sendTo: (p, m) => Net.sendTo(p, m), end: res => hostEndGame(res) };
  H.sim = MODES[H.mode].group === 'traitor' ? new AmongSim(io, { roster: H.roster, opts: H.opts }) : new ShooterSim(io, { mode: H.mode, roster: H.roster, opts: H.gameOpts || H.opts });
}
function hostEndGame(res) {
  if (H.sim) H.sim.stop();
  H.sim = null; H.inGame = false;
  for (const r of res.rows) { const p = H.players.get(r.pid); if (p) p.pts += r.coins || 0; }
  for (const p of H.players.values()) p.ready = false;
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
    case 'wait': toast('Сейчас идёт игра — подожди конца раунда', 4000); break;
    case 'msg': if (!S.game) toast(m.text, 2500); else S.game.ctrl.onMsg(m); break;
    case 'full': toast('Комната заполнена', 4000); leaveRoom(); break;
    case 'kicked': S.kicked = true; leaveRoom(); toast('Хост убрал тебя из комнаты', 4500); break;
    default: if (S.game) S.game.ctrl.onMsg(m);
  }
};
// связь пропала — несколько раз пробуем вернуться сами (Wi‑Fi моргнул, телефон уснул)
Net.onHostLost = async () => {
  if (S.kicked) { S.kicked = false; return; }
  const code = Net.code;
  try { Net.reset(); } catch (e) { }
  for (let i = 0; i < 6; i++) {
    loading(`Связь пропала, возвращаемся в комнату ${code}… (${i + 1}/6)`);
    await new Promise(r => setTimeout(r, i ? 2500 : 800));
    try { await Net.join(code, { t: 'hello', ...profile() }); loading(false); toast('Вернулись в игру!'); return; } catch (e) { if (e && e.message === 'notfound' && i >= 2) break; }
  }
  loading(false);
  leaveRoom();
  $('#in-code').value = code;
  toast('Комната закрылась или пропал интернет. Нажми «Войти», чтобы попробовать ещё раз.', 5000);
};
function renderPausePlayers() {
  const el = $('#pause-players'); if (!el) return;
  const list = Net.isHost && S.lobby ? S.lobby.players.filter(p => p.online && p.pid !== me.pid) : [];
  el.innerHTML = list.length ? `<div class="muted small">Игроки</div>` + list.map(p => `<div class="pp-row"><img src="${thumb(p.model)}" alt=""><b>${esc(p.name)}</b><button class="btn red sm" data-kick="${p.pid}">${icon('close')} Убрать</button></div>`).join('') : '';
}
$('#m-pause').addEventListener('click', e => { const k = e.target.closest('[data-kick]'); if (k) askKick(k.dataset.kick); });
function leaveRoom() {
  LS.set('last', null);
  stopGame();
  if (H.sim) H.sim.stop();
  H.sim = null; H.inGame = false; H.pending = null;
  Net.reset(); S.lobby = null;
  try { wakeLock && wakeLock.release(); } catch (e) { }
  history.replaceState(null, '', location.pathname);
  show('s-home');
}

// ---------- лобби ----------
const seg = (k, vals, cur, labels) => `<div class="seg" data-o="${k}">${vals.map((v, i) => `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${labels ? labels[i] : v}</button>`).join('')}</div>`;
const optRow = (label, html) => `<div class="opt-row"><span>${label}</span>${html}</div>`;
function amongSettings(o) {
  const yes = (k, cur) => seg(k, [1, 0], cur ? 1 : 0, ['Да', 'Нет']);
  return `
    <div class="opt-maps">${AMAP_LIST.map(m => `<button class="opt-map ${o.map === m.id ? 'sel' : ''} ${m.ready ? '' : 'locked'}" data-map="${m.id}" ${m.ready ? '' : 'disabled'}>${icon(m.icon)}<b>${m.name}</b>${m.ready ? '' : '<small>скоро</small>'}${S.voteDots ? S.voteDots('map', m.id) : ''}</button>`).join('')}</div>
    <details class="opt-group" open><summary>${icon('users')} Игроки и роли</summary>
      ${optRow('Максимум игроков', seg('maxPlayers', AM_SET.maxPlayers, o.maxPlayers))}
      ${optRow('Предателей', seg('impostors', AM_SET.impostors, o.impostors))}
      ${optRow(`${icon('sheriff')} Шериф`, seg('sheriff', [0, 1], o.sheriff, ['Нет', 'Есть']))}
      ${optRow(`${icon('engineer')} Инженер`, seg('engineer', [0, 1], o.engineer, ['Нет', 'Есть']))}
      ${optRow(`${icon('scientist')} Учёный`, seg('scientist', [0, 1], o.scientist, ['Нет', 'Есть']))}
      ${optRow(`${icon('angel')} Ангел-хранитель`, seg('angel', [0, 1], o.angel, ['Нет', 'Есть']))}
      ${optRow(`${icon('shapeshifter')} Оборотень`, seg('shapeshifter', [0, 1], o.shapeshifter, ['Нет', 'Есть']))}
    </details>
    <details class="opt-group"><summary>${icon('task')} Задания</summary>
      ${optRow('Общие', seg('common', AM_SET.common, o.common))}
      ${optRow('Длинные', seg('long', AM_SET.long, o.long))}
      ${optRow('Короткие', seg('short', AM_SET.short, o.short))}
      ${optRow('Видно сканирование', yes('visualTasks', o.visualTasks))}
      ${optRow('Полоска заданий', seg('taskBar', AM_SET.taskBar, o.taskBar, ['Всегда', 'На собраниях', 'Скрыта']))}
    </details>
    <details class="opt-group"><summary>${icon('meeting')} Собрания</summary>
      ${optRow('Тревог на игрока', seg('meetings', AM_SET.meetings, o.meetings))}
      ${optRow('Обсуждение, сек', seg('discuss', AM_SET.discuss, o.discuss))}
      ${optRow('Голосование, сек', seg('vote', AM_SET.vote, o.vote))}
      ${optRow('Анонимные голоса', yes('anon', o.anon))}
      ${optRow('Показывать роль выгнанного', yes('confirm', o.confirm))}
    </details>
    <details class="opt-group"><summary>${icon('speed')} Скорость и обзор</summary>
      ${optRow('Скорость', seg('speed', AM_SET.speed, o.speed, ['×0.75', '×1', '×1.25', '×1.5']))}
      ${optRow('Обзор экипажа', seg('crewVision', AM_SET.crewVision, o.crewVision, ['×0.5', '×0.75', '×1', '×1.5']))}
      ${optRow('Обзор предателя', seg('impVision', AM_SET.impVision, o.impVision, ['×1', '×1.5', '×2']))}
      ${optRow('Перезарядка выбивания, сек', seg('killCd', AM_SET.killCd, o.killCd))}
      ${optRow('Дальность выбивания', seg('killDist', AM_SET.killDist, o.killDist, ['Близко', 'Средне', 'Далеко']))}
    </details>`;
}
function shooterSettings(o, mode) {
  const timedOnly = mode === 'ctf' || mode === 'pve';
  const match = timedOnly ? 'timed' : o.match;
  return `
    <div class="opt-maps four">${SMAP_LIST.filter(m => !!m.pve === (mode === 'pve')).map(m => `<button class="opt-map smap ${o.smap === m.id || m.pve ? 'sel' : ''} ${m.ready ? '' : 'locked'}" data-smap="${m.id}" ${m.ready ? '' : 'disabled'}>${icon(m.icon)}<b>${m.name}</b>${m.ready ? '' : '<small>скоро</small>'}${S.voteDots ? S.voteDots('map', m.id) : ''}</button>`).join('')}</div>
    ${mode === 'pve' ? optRow(`${icon('skull')} Сложность`, seg('pveDiff', [0, 1, 2], o.pveDiff ?? 1, ['Лёгкая', 'Обычная', 'Трудная'])) + optRow(`${icon('hourglass')} Бесконечно`, seg('endless', [0, 1], o.endless ? 1 : 0, ['Выкл', 'Вкл'])) + `<div class="muted small">${o.endless ? `Волны без конца, каждые 6 — босс и монстры сильнее. За волну +1 жизнь команде. Рекорд на этом устройстве: волна ${(LS.get('endlessBest', {}) || {})[o.pveDiff ?? 1] || 0}.` : '6 волн и босс.'} Жизни команды: ${[15, 8, 3][o.pveDiff ?? 1]}. Подойди к павшему и постой 3 секунды — поднимешь его.</div>` : ''}
    ${timedOnly ? `<div class="muted small">${mode === 'pve' ? 'Между волнами — закупка' : 'Захват флага идёт на время с возрождением'}</div>` : optRow('Как идёт игра', seg('match', AM_SET.match, match, ['Раунды (без возрождения)', 'На время (с возрождением)']))}
    ${match === 'rounds' ? optRow('Побед для выигрыша', mode === 'tdm' ? seg('rounds', [13, 7], o.rounds, ['13 (обычно)', '7 (быстро)']) : seg('rounds', [3, 5, 7], o.rounds)) + optRow('Время раунда, сек', seg('roundTime', AM_SET.roundTime, o.roundTime)) : mode === 'pve' ? '' : optRow('Время матча', seg('timeLimit', AM_SET.timeLimit, o.timeLimit, ['3 мин', '5 мин', '10 мин']))}
    ${mode === 'tdm' || mode === 'ctf' ? optRow(`${icon('users')} Размер команды`, seg('teamSize', AM_SET.teamSize, o.teamSize, ['Сам', '2×2', '3×3', '4×4', '5×5'])) : ''}
    ${(mode === 'tdm' || mode === 'ctf') && o.teamSize ? `<div class="muted small">Свободные места в каждой команде займут боты</div>` : optRow(`${icon('bot')} Боты`, seg('bots', AM_SET.bots, o.bots))}
    ${o.bots || ((mode === 'tdm' || mode === 'ctf') && o.teamSize) ? optRow('Уровень ботов', seg('botLevel', AM_SET.botLevel, o.botLevel, ['Легко', 'Средне', 'Сложно'])) : ''}
    ${mode === 'tdm' || mode === 'ctf' ? optRow('Урон по своим', seg('ff', [0, 1], o.ff ? 1 : 0, ['Выкл', 'Вкл'])) : ''}`;
}
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
  $('#lb-count').textContent = online.length + (L.mode === 'traitor' ? ' / ' + L.opts.maxPlayers : '') + ' в комнате';
  const card = p => `
    <button class="pl ${p.pid === me.pid ? 'me' : ''}" data-pid="${p.pid}">
      ${teams ? `<span class="team-dot" style="background:${TEAM_COLORS[p.team]}"></span>` : ''}
      <img src="${thumb(p.model)}" alt="">
      <div style="min-width:0"><div class="pn" style="color:${p.color || '#fff'}">${esc(p.name)}${p.adult ? ` <span class="adult-i" title="взрослый">${icon('crown')}</span>` : ''}${p.pid === L.hostId ? '<span class="badge">ХОСТ</span>' : ''}</div>
      <div class="ps">${icon(CLASSES[p.cls].icon)} ${CLASSES[p.cls].name} · ${icon('star')} ${p.pts}</div></div>
      ${p.ready && !L.inGame ? `<span class="rdy" title="готов">${icon('check')}</span>` : ''}
      ${isHost && p.pid !== me.pid ? `<span class="kick" data-kick="${p.pid}" title="Убрать из комнаты">${icon('close')}</span>` : ''}
    </button>`;
  if (teams) {
    const mine = (online.find(p => p.pid === me.pid) || {}).team;
    const col = t => { const list = online.filter(p => p.team === t); return `<div class="team-col" style="--tc:${TEAM_COLORS[t]}"><div class="tc-head"><b>${TEAM_NAMES[t]}</b><span>${list.length}</span></div>${list.map(card).join('')}${mine !== t && !L.inGame ? `<button class="btn sm tc-join" data-team="${t}">${icon('swap')} Перейти сюда</button>` : ''}</div>`; };
    $('#lb-players').innerHTML = `<div class="teams2">${col(0)}${col(1)}</div>${isHost && !L.inGame ? `<div class="lb-tools"><button class="btn ghost sm" data-lact="shuffle">${icon('swap')} Перемешать</button><button class="btn ghost sm" data-lact="fair">${icon('crown')} Честные команды</button></div><div class="muted small">«Честные» — взрослые в разных командах. Хост может перекинуть любого — нажми на игрока</div>` : ''}<div class="muted small">Боты сами делятся поровну</div>`;
  } else $('#lb-players').innerHTML = online.map(card).join('');
  $('#lb-mode-title').textContent = isHost ? 'Выбери режим' : 'Режим';
  // голоса: цветные точки игроков на режимах и картах
  const dots = (key, v) => { const vs = online.filter(p => p.vote && p.vote[key] === v); return vs.length ? `<span class="votes">${vs.map(p => `<i style="background:${p.color || '#fff'}" title="${esc(p.name)}"></i>`).join('')}</span>` : ''; };
  S.voteDots = dots;
  const tools = isHost && !L.inGame ? `<div class="lb-tools"><button class="btn ghost sm" data-lact="votes">${icon('vote')} По голосам</button><button class="btn ghost sm" data-lact="random">${icon('question')} Случайная карта и режим</button></div>` : !isHost ? `<div class="muted small" style="margin-bottom:6px">Нажми на режим и карту, чтобы проголосовать. Выбирает хост.</div>` : '';
  $('#lb-modes').innerHTML = tools + Object.entries(MODES).map(([id, m]) => `
    <button class="mode ${id === L.mode ? 'sel' : ''} ${m.group === 'traitor' ? 'traitor' : ''}" data-m="${id}"><span class="mi">${icon(m.icon)}</span><b>${m.name}</b><small>${m.desc}</small>${dots('mode', id)}</button>`).join('');
  const openGroups = new Set([...$$('#lb-opts details[open] summary')].map(s => s.textContent));
  let opts = '';
  if (mode.group === 'arena') opts += shooterSettings(L.opts, L.mode);
  else opts += amongSettings(L.opts);
  $('#lb-opts').innerHTML = opts;
  if (openGroups.size) $$('#lb-opts details').forEach(d => d.open = openGroups.has(d.querySelector('summary').textContent));
  $('#lb-opts').classList.toggle('readonly', !isHost);
  const total = online.length + (mode.group === 'arena' ? L.opts.bots : 0);
  if (L.inGame) $('#lb-action').innerHTML = `<div class="wait">Идёт игра<span class="dots"></span></div>`;
  else {
    const mine = online.find(p => p.pid === me.pid) || {}, nr = online.filter(p => p.ready).length;
    const rbtn = `<button class="btn ${mine.ready ? 'teal' : 'ghost'} big" id="btn-ready">${icon('check')} ${mine.ready ? 'Я готов!' : 'Готов?'}</button>`;
    const info = `<div class="muted small rdy-info">Готовы ${nr} из ${online.length}. Когда готовы все — игра начнётся сама.</div>`;
    if (isHost) {
      const ok = total >= mode.min;
      $('#lb-action').innerHTML = `<div class="row">${online.length > 1 ? rbtn : ''}<button class="btn gold big grow" id="btn-start" ${ok ? '' : 'disabled'}>${ok ? `${icon('play')} Играть` : mode.group === 'traitor' ? 'Нужно 3 игрока' : 'Добавь ботов'}</button></div>${online.length > 1 ? info : ''}`;
      $('#btn-start').onclick = () => { $('#btn-start').disabled = true; ready.then(() => Net.toHost({ t: 'start' })); };
    } else $('#lb-action').innerHTML = `<div class="row">${rbtn}</div>${info}`;
    const rb = $('#btn-ready'); if (rb) rb.onclick = () => { vibrate(10); Sound.play('select', { vol: 0.5 }); Net.toHost({ t: 'lready', v: !mine.ready }); };
  }
  refreshShowroom();
}
$('#lb-modes').addEventListener('click', e => {
  const t = e.target.closest('[data-lact]'); if (t) { Net.toHost({ t: 'lact', a: t.dataset.lact }); return; }
  const b = e.target.closest('.mode'); if (!b) return; vibrate(10);
  if (!Net.isHost) { Net.toHost({ t: 'vote', k: 'mode', v: b.dataset.m }); toast('Твой голос учтён'); return; }
  Net.toHost({ t: 'mode', mode: b.dataset.m });
});
$('#lb-opts').addEventListener('click', e => {
  if (!Net.isHost) { const mp = e.target.closest('.opt-map'); if (mp && !mp.disabled) { Net.toHost({ t: 'vote', k: 'map', v: mp.dataset.smap || mp.dataset.map }); toast('Твой голос учтён'); } return; }
  const mp = e.target.closest('.opt-map'); if (mp) { if (mp.dataset.smap) Net.toHost({ t: 'opt', k: 'smap', v: mp.dataset.smap }); else Net.toHost({ t: 'opt', k: 'map', v: mp.dataset.map }); return; }
  const b = e.target.closest('.seg button'); if (!b) return;
  const k = b.closest('.seg').dataset.o, raw = b.dataset.v;
  const v = AM_BOOL.includes(k) ? raw === '1' : isNaN(+raw) ? raw : +raw;
  Net.toHost({ t: 'opt', k, v });
});
function askKick(pid) {
  const p = S.lobby && S.lobby.players.find(x => x.pid === pid); if (!p) return;
  if (confirm(`Убрать «${p.name}» из комнаты? Вернуться он не сможет.`)) Net.toHost({ t: 'kick', pid });
}
$('#lb-players').addEventListener('click', e => {
  const k = e.target.closest('[data-kick]'); if (k) { e.stopPropagation(); askKick(k.dataset.kick); return; }
  const la = e.target.closest('[data-lact]'); if (la) { Net.toHost({ t: 'lact', a: la.dataset.lact }); return; }
  const j = e.target.closest('.tc-join'); if (j) { vibrate(10); Net.toHost({ t: 'team', pid: me.pid, to: +j.dataset.team }); return; }
  const b = e.target.closest('.pl'); if (!b || !S.lobby) return;
  const teams = S.lobby.mode === 'tdm' || S.lobby.mode === 'ctf';
  if (!teams) return;
  if (b.dataset.pid === me.pid || Net.isHost) Net.toHost({ t: 'team', pid: b.dataset.pid });
});
$('#btn-leave').onclick = () => { if (!confirm(Net.isHost && S.lobby && S.lobby.players.filter(p => p.online).length > 1 ? 'Ты хост. Если выйти — комната закроется для всех. Выйти?' : 'Выйти из комнаты?')) return; leaveRoom(); };
$('#btn-share').onclick = async () => {
  const url = location.origin + location.pathname + '?room=' + Net.code;
  const text = 'Заходи в «Замок Героев»! Код комнаты: ' + Net.code;
  try { if (navigator.share) { await navigator.share({ title: 'Замок Героев', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch (e) { toast('Код комнаты: ' + Net.code); }
};
$('#btn-hero').onclick = () => { renderPickers(); openModal('#m-hero'); };

// ---------- игра ----------
function metaShoot(k) {
  if (String(k).startsWith('m:')) {
    const mt = S_MONSTERS[k.slice(2)]; if (!mt) return null;
    return { model: mt.model, name: mt.boss ? '' : mt.name, scale: mt.scale, hpBar: false, nameColor: '#ffb3bd', label: false };
  }
  const r = S.roster.get(k); if (!r) return null;
  const teams = S.game.mode === 'tdm' || S.game.mode === 'ctf';
  const mine = k === me.pid;
  const myTeam = (S.roster.get(me.pid) || {}).team;
  const ally = S.game.mode === 'pve' || (teams && r.team === myTeam);
  return { model: r.model, hat: r.hat, aura: r.aura, name: r.name, me: mine, hpBar: ally && !mine, gun: 'pistol', gunW: WEAPONS.pistol,
    ring: teams ? TEAM_COLORS[r.team] : null, nameColor: teams ? TEAM_COLORS[r.team] : '#fff', label: ally && !mine, tint: teams && !mine ? TEAM_COLORS[r.team] : null, ally: teams && ally && !mine };
}
// обучение перед первой игрой в каждом режиме: на телефоне про кнопки, на компьютере про клавиши
const TUTOR = {
  shooter: {
    touch: [['speed', 'Ходи левым пальцем', 'Поставь палец на левую половину экрана и веди его — герой побежит.'], ['eye', 'Смотри правым пальцем', 'Веди пальцем по правой половине экрана, чтобы поворачиваться.'], ['gun', 'Стреляй красной кнопкой', 'Наведи прицел на врага. Прицел сам немного «липнет» к врагу и может стрелять сам — это меняется в настройках.'], ['shop', 'Закупка', 'Перед боем выбери оружие и нажми «Готов!». Граната: держи кнопку — видно, куда упадёт, отпусти — бросок.']],
    keys: [['speed', 'Ходи клавишами W A S D', 'Пробел — прыжок, C или Ctrl — присесть.'], ['eye', 'Смотри мышкой', 'Нажми на экран, чтобы захватить мышь. Esc — отпустить.'], ['gun', 'Стреляй левой кнопкой мыши', 'Правая кнопка или F — прицел. R — перезарядка, 1–4 — оружие, V — вид от 1-го или 3-го лица.'], ['shop', 'Закупка', 'B — открыть закупку, «Готов!» — в бой. G держать — граната с дугой полёта, отпустить — бросок.']]
  },
  traitor: {
    touch: [['speed', 'Ходи левым пальцем', 'Поставь палец на экран слева и веди его.'], ['task', 'Делай задания', 'Список слева вверху. Подойди к заданию и нажми большую кнопку «Действие».'], ['impostor', 'Если ты предатель', 'Притворяйся, что делаешь задания. Кнопка «Выбить» — рядом с игроком, «Саботаж» — устроить поломку.'], ['report', 'Нашёл выбитого?', 'Нажми «Сообщить» — начнётся собрание. Обсудите и проголосуйте, кто предатель.']],
    keys: [['speed', 'Ходи клавишами W A S D', 'Или стрелками.'], ['task', 'Делай задания', 'Подойди к заданию и нажми E. M — карта.'], ['impostor', 'Если ты предатель', 'F — выбить, G — саботаж, V — люк.'], ['report', 'Нашёл выбитого?', 'R — сообщить. На собрании обсудите и проголосуйте.']]
  }
};
function showTutor(group) {
  const key = 'tut_' + group; if (LS.get(key, false) || LS.get('tutor', false)) return Promise.resolve();
  const slides = TUTOR[group][Input.touch ? 'touch' : 'keys'];
  return new Promise(res => {
    let i = 0;
    const draw = () => { const [ic, t, x] = slides[i]; $('#tut-ic').innerHTML = icon(ic); $('#tut-title').textContent = t; $('#tut-text').textContent = x; $('#tut-dots').innerHTML = slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join(''); $('#tut-next').textContent = i === slides.length - 1 ? 'Понятно, играем!' : 'Дальше'; };
    const done = () => { LS.set(key, true); $('#m-tutor').classList.remove('show'); res(); };
    $('#tut-next').onclick = () => { Sound.play('click', { vol: 0.5 }); if (++i >= slides.length) done(); else draw(); };
    $('#tut-skip').onclick = done;
    draw(); $('#m-tutor').classList.add('show');
  });
}
async function startGame(m) {
  loading('Готовим игру…');
  try { await ready; } catch (e) { }
  if (MODES[m.mode].group === 'traitor') { loading('Загружаем карту…'); try { await A.preload(amapModels(AMAPS[m.opts.map] || AMAPS.station)); } catch (e) { } }
  if (MODES[m.mode].group !== 'traitor') { loading('Загружаем карту…'); try { await A.preload(smapModels(SMAPS[m.opts.smap] || SMAPS.warehouse)); } catch (e) { } }
  stopGame();
  $$('.modal').forEach(x => x.classList.remove('show'));
  S.roster = new Map(m.roster.map(r => [r.pid, r]));
  const group = MODES[m.mode].group;
  const ctx = { myPid: me.pid, mode: m.mode, roster: S.roster, opts: m.opts, send: msg => Net.toHost(msg) };
  if (group === 'traitor') {
    const view = new AmongView({ map: AMAPS[m.opts.map] || AMAPS.station, myPid: me.pid });
    S.game = { mode: m.mode, view }; R.setView(view);
    S.game.ctrl = new AmongClient({ ...ctx, view });
    $('#am-banner').innerHTML = '';
    show('s-among');
  } else {
    const view = new ShooterView({ map: SMAPS[m.opts.smap] || SMAPS.warehouse, myPid: me.pid, metaOf: k => metaShoot(k) });
    S.game = { mode: m.mode, view }; R.setView(view);
    S.game.ctrl = new ShooterClient({ ...ctx, view });
    $('#sh-banner').innerHTML = ''; $('#sh-feed').innerHTML = '';
    show('s-shoot');
    shBanner(`${icon(MODES[m.mode].icon)} ${MODES[m.mode].name}`, 'big', 2500);
  }
  document.body.dataset.game = group === 'traitor' ? 'traitor' : 'shooter';
  Input.active = group === 'traitor';
  loading(false);
  Net.toHost({ t: 'ready' });
  showTutor(group === 'traitor' ? 'traitor' : 'shooter');
}
function stopGame() {
  if (S.game) { S.game.ctrl.dispose(); S.game = null; }
  Tasks.close(true);
  Sound.siren(false); Sound.stopLoops();
  if (R.view !== showroom) { R.setView(showroom); showroom.key = null; }
}
Input.init([$('#s-among')], $('#joy'));
Input.onKey = a => {
  if (!S.game) return;
  if (a === 'chat' && $('#am-meeting').classList.contains('show')) $('#amm-in').focus();
  if (Input.onKeyGame) Input.onKeyGame(a);
};
$$('#am-topr button, #am-actions .act').forEach(b => b.addEventListener('pointerdown', e => e.stopPropagation()));
$('#btn-quit').onclick = () => { $('#m-pause').classList.remove('show'); if (!confirm(Net.isHost ? 'Ты хост. Комната закроется для всех. Выйти?' : 'Выйти из комнаты?')) return; leaveRoom(); };

// ---------- итоги ----------
const SUBN = { sheriff: 'Шериф', engineer: 'Инженер', scientist: 'Учёный', angel: 'Ангел', shapeshifter: 'Оборотень' };
function showResults(res) {
  stopGame();
  show('s-results');
  const mine = res.rows.find(r => r.pid === me.pid);
  if (mine && mine.coins) { Wallet.add(mine.coins); updateCoins(); }
  $('#res-title').textContent = res.winText;
  // рекорд «Бесконечно» хранится на устройстве, отдельно для каждой сложности
  if (res.endless) { const best = LS.get('endlessBest', {}) || {}, d = res.pveDiff ?? 1, was = best[d] || 0; if (res.wave > was) { best[d] = res.wave; LS.set('endlessBest', best); } res.recordText = res.wave > was ? `Новый рекорд: волна ${res.wave}!` : `Рекорд: волна ${was}`; }
  const impWin = res.mode === 'traitor' && res.win === 'impostor';
  $('#res-icon').innerHTML = icon(mine && mine.win ? 'trophy' : impWin ? 'impostor' : 'medal');
  $('#res-coins').innerHTML = (res.recordText ? `<div class="rec">${icon('trophy')} ${res.recordText}</div>` : '') + (mine && mine.coins ? `+${mine.coins} ${icon('coin')} <span class="muted small">монет в копилку</span>` : '');
  const roster = S.roster || new Map();
  $('#res-list').innerHTML = res.rows.map((r, i) => {
    const info = roster.get(r.pid) || {};
    let stat = '';
    if (res.mode === 'traitor') stat = r.role === 'impostor' ? `<span style="color:#ff6b78">${icon('impostor')} Предатель${r.sub ? ' · ' + SUBN[r.sub] : ''}</span> · ${icon('kill')} ${r.kills}` : `${icon('crew')} Экипаж${r.sub ? ' · ' + SUBN[r.sub] : ''} · ${icon('task')} ${r.tasks}${r.alive ? '' : ' · ' + icon('ghost')}`;
    else if (res.mode === 'pve') stat = `${icon('skull')} ${r.kills} монстров · выбит ${r.deaths} раз`;
    else stat = `${r.rounds ? icon('trophy') + ' ' + r.rounds + ' · ' : ''}${icon('swords')} ${r.kills} · ${icon('skull')} ${r.deaths}${r.caps ? ' · ' + icon('flag') + ' ' + r.caps : ''}`;
    const teamCol = (res.mode === 'tdm' || res.mode === 'ctf') ? TEAM_COLORS[r.team] : '#fff';
    return `<div class="rr ${r.win ? 'win' : ''} ${r.pid === me.pid ? 'me' : ''}"><span class="rk">${r.win ? icon('trophy') : i + 1}</span><img src="${thumb(info.model || 'character-a')}"><div class="rn" style="color:${teamCol}">${esc(r.name)}${r.bot ? ' (бот)' : ''}<div class="rs">${stat}</div>${r.award ? `<div class="raw">${icon(r.award.icon)} ${esc(r.award.name)}</div>` : ''}</div><div class="rc">${r.bot ? '' : '+' + r.coins + ' ' + icon('coin')}</div></div>`;
  }).join('');
  if (Net.isHost) {
    $('#res-action').innerHTML = `<div class="row"><button class="btn gold grow" id="btn-again">${icon('rotate')} Ещё раз</button><button class="btn ghost grow" id="btn-tolobby">${icon('castle')} В лобби</button></div>`;
    $('#btn-again').onclick = () => { H.inGame = false; hostStartGame(); };
    $('#btn-tolobby').onclick = () => Net.toHost({ t: 'lobby' });
  } else $('#res-action').innerHTML = `<div class="wait">Ждём хоста<span class="dots"></span></div><button class="btn ghost big" data-act="shop" style="margin-top:10px">${icon('shop')} Магазин</button>`;
  Sound.play(mine && mine.win ? 'j_win' : 'j_lose');
  vibrate(mine && mine.win ? [60, 60, 60, 60, 120] : 50);
}

window.addEventListener('beforeunload', e => { if (Net.isHost && H.players.size > 1) { e.preventDefault(); e.returnValue = ''; } });
if (location.search.includes('debug')) window.__dbg = { H, S };
initHome();

// телефон: не даём браузеру зумить страницу щипком и двойным тапом
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTap = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTap < 320 && !e.target.closest('input,textarea,button,.modal-card,.panel')) e.preventDefault();
  lastTap = now;
}, { passive: false });

// защита от случайного выхода: свайп «назад» на айфоне и кнопка «Назад» не выкидывают из комнаты
let guardOn = false;
function armGuard() { if (guardOn || !Net.code) return; guardOn = true; history.pushState({ guard: 1 }, '', location.href); }
addEventListener('popstate', () => {
  if (!guardOn) return;
  guardOn = false;
  if (!Net.code) return;
  armGuard();
  renderPausePlayers(); openModal('#m-pause');
  toast('Чтобы выйти, нажми «Выйти из комнаты»', 3000);
});
addEventListener('beforeunload', e => { if (Net.code) { e.preventDefault(); e.returnValue = ''; } });
setInterval(() => { if (Net.code && !guardOn) armGuard(); if (!Net.code) guardOn = false; }, 1000);

// ---------- свои клавиши (компьютер) ----------
let keyWait = null;
function openKeys() {
  const cur = LS.get('keys', {}) || {};
  $('#keys-list').innerHTML = Object.entries(KEY_DEF).map(([k, [def, name]]) => `<button class="key-row ${keyWait === k ? 'wait' : ''}" data-k="${k}"><span>${name}</span><b>${keyWait === k ? 'нажми клавишу…' : keyName(cur[k] || def)}</b></button>`).join('');
  openModal('#m-keys');
}
$('#keys-list').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; keyWait = b.dataset.k; openKeys(); });
$('#keys-reset').onclick = () => { LS.set('keys', {}); keyWait = null; openKeys(); toast('Клавиши как было'); };
addEventListener('keydown', e => {
  if (!keyWait || !$('#m-keys').classList.contains('show')) return;
  e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') { keyWait = null; openKeys(); return; }
  const cur = LS.get('keys', {}) || {};
  // если клавиша уже занята — меняем местами
  for (const [k, [def]] of Object.entries(KEY_DEF)) if ((cur[k] || def) === e.code && k !== keyWait) cur[k] = cur[keyWait] || KEY_DEF[keyWait][0];
  cur[keyWait] = e.code; LS.set('keys', cur); keyWait = null; Sound.play('select', { vol: 0.5 }); openKeys();
}, true);

// ---------- своя раскладка кнопок (телефон, планшет) ----------
const LAY_IDS = ['sh-fire', 'sh-jump', 'sh-crouch', 'sh-aim', 'sh-reload', 'sh-nade', 'sh-switch', 'sh-fire2', 'sh-med', 'sh-cam', 'sh-buyb'];
function applyLayout() {
  const L = LS.get('layout', {}) || {}, op = LS.get('layop', 1);
  for (const id of LAY_IDS) {
    const el = $('#' + id); if (!el) continue;
    const v = L[id];
    if (v) Object.assign(el.style, { left: v.x * 100 + '%', top: v.y * 100 + '%', right: 'auto', bottom: 'auto', transform: `translate(-50%,-50%) scale(${v.s || 1})` });
    else Object.assign(el.style, { left: '', top: '', right: '', bottom: '', transform: '' });
    el.style.opacity = op;
  }
}
applyLayout();
let layFrom = null, laySel = null;
function layoutEdit(on) {
  if (on) { layFrom = S.screen; show('s-shoot'); document.body.classList.add('lay-edit'); $('#lay-op').value = LS.get('layop', 1) * 100; laySelect(null); }
  else { document.body.classList.remove('lay-edit'); laySelect(null); show(layFrom || 's-home'); }
}
function laySelect(id) {
  laySel = id; LAY_IDS.forEach(i => { const el = $('#' + i); if (el) el.classList.toggle('lay-sel', i === id); });
  const L = LS.get('layout', {}) || {}; $('#lay-size').value = ((L[id] && L[id].s) || 1) * 100; $('#lay-size').disabled = !id;
}
(() => {
  let drag = null;
  const pos = el => { const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; };
  $('#sh-touch').addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('lay-edit')) return;
    const el = e.target.closest('.act'); if (!el || !LAY_IDS.includes(el.id)) return;
    e.preventDefault(); e.stopPropagation(); laySelect(el.id);
    const L = LS.get('layout', {}) || {}; if (!L[el.id]) { L[el.id] = { ...pos(el), s: 1 }; LS.set('layout', L); applyLayout(); }
    drag = { id: el.id, pid: e.pointerId }; try { el.setPointerCapture(e.pointerId); } catch (er) { }
  }, true);
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const L = LS.get('layout', {}) || {}, v = L[drag.id] || { s: 1 };
    v.x = Math.max(0.04, Math.min(0.96, e.clientX / innerWidth)); v.y = Math.max(0.06, Math.min(0.94, e.clientY / innerHeight));
    L[drag.id] = v; LS.set('layout', L); applyLayout();
  });
  addEventListener('pointerup', () => { drag = null; });
  $('#lay-size').oninput = e => { if (!laySel) return; const L = LS.get('layout', {}) || {}; const el = $('#' + laySel); L[laySel] = L[laySel] || { ...pos(el) }; L[laySel].s = e.target.value / 100; LS.set('layout', L); applyLayout(); };
  $('#lay-op').oninput = e => { LS.set('layop', e.target.value / 100); applyLayout(); };
  $('#lay-reset').onclick = () => { LS.set('layout', {}); LS.set('layop', 1); $('#lay-op').value = 100; applyLayout(); laySelect(null); toast('Кнопки как было'); };
  $('#lay-done').onclick = () => { layoutEdit(false); toast('Раскладка сохранена'); };
})();
