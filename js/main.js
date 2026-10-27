// Главный модуль: меню, лобби, магазин, хост и запуск игр.
import * as A from './assets.js';
import { R, ShowroomView, AmongView } from './render.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { AMAPS, AMAP_LIST, amapModels } from './amap.js';
import { ShooterSim, S_MONSTERS, SHOOT_DEFAULTS } from './shooter/ssim.js';
import { ShooterView } from './shooter/sview.js';
import { ShooterClient, shBanner } from './shooter/sclient.js';
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
  else Sound.musicOff();
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
  if (!req) {
    if (navigator.standalone || !toggle) return;
    toast('На iPhone: нажми «Поделиться» внизу Safari → «На экран „Домой“». Игра будет открываться на весь экран.', 6000);
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
  $('#set-sens').value = LS.get('sens', 1) * 100; $('#set-sens').oninput = e => LS.set('sens', e.target.value / 100);
  setSeg('#set-aim', LS.get('aimhelp', true) === false ? 0 : 1); setSeg('#set-auto', LS.get('autofire', true) === false ? 0 : 1);
  $('#set-aim').onclick = e => { const b = e.target.closest('button'); if (!b) return; LS.set('aimhelp', b.dataset.v === '1'); setSeg('#set-aim', b.dataset.v); };
  $('#set-auto').onclick = e => { const b = e.target.closest('button'); if (!b) return; LS.set('autofire', b.dataset.v === '1'); setSeg('#set-auto', b.dataset.v); };
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
    const pic = shopTab === 'auras' ? `<span class="swatch" style="background:${it.color === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : it.color || 'transparent'}"></span>` : icon(it.icon);
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
  match: ['rounds', 'timed'], rounds: [3, 5, 7], roundTime: [60, 90, 120], timeLimit: [180, 300, 600], botLevel: [0, 1, 2]
};
const AM_BOOL = ['confirm', 'anon', 'visualTasks'];

function hostStart(code) {
  H.banned = new Set();
  H.players.clear(); H.inGame = false; H.sim = null;
  H.players.set(me.pid, { ...profile(), team: 0, online: true, pts: 0 });
  loading(false); keepAwake();
  history.replaceState(null, '', location.pathname + '?room=' + code);
  hostLobby(true);
}
function lobbyMsg() {
  return { t: 'lobby', code: Net.code, hostId: me.pid, mode: H.mode, opts: H.opts, inGame: H.inGame,
    players: [...H.players.values()].map(p => ({ pid: p.pid, name: p.name, model: p.model, cls: p.cls, hat: p.hat, aura: p.aura, color: p.color, adult: p.adult, team: p.team, online: p.online, pts: p.pts })) };
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
    case 'mode': if (pid === me.pid && MODES[m.mode] && !H.inGame) { H.mode = m.mode; hostLobby(false); } break;
    case 'opt': {
      if (pid !== me.pid || H.inGame) return;
      if (m.k === 'map') { if (AMAP_LIST.some(x => x.id === m.v && x.ready)) H.opts.map = m.v; }
      else if (m.k === 'smap') { if (SMAP_LIST.some(x => x.id === m.v && x.ready)) H.opts.smap = m.v; }
      else if (AM_BOOL.includes(m.k)) H.opts[m.k] = !!m.v;
      else if (AM_SET[m.k] && AM_SET[m.k].includes(m.v)) H.opts[m.k] = m.v;
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
    for (let i = 0; i < H.opts.bots; i++) roster.push({ pid: 'bot' + i, name: names[i % names.length] + (i >= names.length ? ' ' + (i + 1) : ''), model: pick(A.HEROES), hat: pick(HATS).id, aura: 'none', bot: true, team: 0 });
  }
  if (H.mode === 'tdm' || H.mode === 'ctf') {
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
  H.sim = MODES[H.mode].group === 'traitor' ? new AmongSim(io, { roster: H.roster, opts: H.opts }) : new ShooterSim(io, { mode: H.mode, roster: H.roster, opts: H.opts });
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
    case 'wait': toast('Сейчас идёт игра — подожди конца раунда', 4000); break;
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
    <div class="opt-maps">${AMAP_LIST.map(m => `<button class="opt-map ${o.map === m.id ? 'sel' : ''} ${m.ready ? '' : 'locked'}" data-map="${m.id}" ${m.ready ? '' : 'disabled'}>${icon(m.icon)}<b>${m.name}</b>${m.ready ? '' : '<small>скоро</small>'}</button>`).join('')}</div>
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
    <div class="opt-maps four">${SMAP_LIST.map(m => `<button class="opt-map smap ${o.smap === m.id ? 'sel' : ''} ${m.ready ? '' : 'locked'}" data-smap="${m.id}" ${m.ready ? '' : 'disabled'}>${icon(m.icon)}<b>${m.name}</b>${m.ready ? '' : '<small>скоро</small>'}</button>`).join('')}</div>
    ${timedOnly ? `<div class="muted small">${mode === 'pve' ? 'Волны монстров, закупка между волнами' : 'Захват флага идёт на время с возрождением'}</div>` : optRow('Как идёт игра', seg('match', AM_SET.match, match, ['Раунды (без возрождения)', 'На время (с возрождением)']))}
    ${match === 'rounds' ? optRow('Побед для выигрыша', seg('rounds', AM_SET.rounds, o.rounds)) + optRow('Время раунда, сек', seg('roundTime', AM_SET.roundTime, o.roundTime)) : mode === 'pve' ? '' : optRow('Время матча', seg('timeLimit', AM_SET.timeLimit, o.timeLimit, ['3 мин', '5 мин', '10 мин']))}
    ${optRow(`${icon('bot')} Боты`, seg('bots', AM_SET.bots, o.bots))}
    ${o.bots ? optRow('Уровень ботов', seg('botLevel', AM_SET.botLevel, o.botLevel, ['Легко', 'Средне', 'Сложно'])) : ''}`;
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
      ${isHost && p.pid !== me.pid ? `<span class="kick" data-kick="${p.pid}" title="Убрать из комнаты">${icon('close')}</span>` : ''}
    </button>`;
  if (teams) {
    const mine = (online.find(p => p.pid === me.pid) || {}).team;
    const col = t => { const list = online.filter(p => p.team === t); return `<div class="team-col" style="--tc:${TEAM_COLORS[t]}"><div class="tc-head"><b>${TEAM_NAMES[t]}</b><span>${list.length}</span></div>${list.map(card).join('')}${mine !== t && !L.inGame ? `<button class="btn sm tc-join" data-team="${t}">${icon('swap')} Перейти сюда</button>` : ''}</div>`; };
    $('#lb-players').innerHTML = `<div class="teams2">${col(0)}${col(1)}</div>${isHost ? '<div class="muted small">Хост может перекинуть любого — нажми на игрока</div>' : ''}<div class="muted small">Боты сами делятся поровну</div>`;
  } else $('#lb-players').innerHTML = online.map(card).join('');
  $('#lb-mode-title').textContent = isHost ? 'Выбери режим' : 'Режим';
  $('#lb-modes').innerHTML = Object.entries(MODES).map(([id, m]) => `
    <button class="mode ${id === L.mode ? 'sel' : ''} ${m.group === 'traitor' ? 'traitor' : ''}" data-m="${id}"><span class="mi">${icon(m.icon)}</span><b>${m.name}</b><small>${m.desc}</small></button>`).join('');
  const openGroups = new Set([...$$('#lb-opts details[open] summary')].map(s => s.textContent));
  let opts = '';
  if (mode.group === 'arena') opts += shooterSettings(L.opts, L.mode);
  else opts += amongSettings(L.opts);
  $('#lb-opts').innerHTML = opts;
  if (openGroups.size) $$('#lb-opts details').forEach(d => d.open = openGroups.has(d.querySelector('summary').textContent));
  $('#lb-opts').classList.toggle('readonly', !isHost);
  const total = online.length + (mode.group === 'arena' ? L.opts.bots : 0);
  if (L.inGame) $('#lb-action').innerHTML = `<div class="wait">Идёт игра<span class="dots"></span></div>`;
  else if (isHost) {
    const ok = total >= mode.min;
    $('#lb-action').innerHTML = `<button class="btn gold big" id="btn-start" ${ok ? '' : 'disabled'}>${ok ? `${icon('play')} Играть: ${mode.name}` : mode.group === 'traitor' ? 'Нужно минимум 3 игрока' : 'Добавь ботов или друзей'}</button>`;
    $('#btn-start').onclick = () => { $('#btn-start').disabled = true; ready.then(() => Net.toHost({ t: 'start' })); };
  } else $('#lb-action').innerHTML = `<div class="wait">Хост выбирает режим и скоро начнёт<span class="dots"></span></div>`;
  refreshShowroom();
}
$('#lb-modes').addEventListener('click', e => { const b = e.target.closest('.mode'); if (!b) return; if (!Net.isHost) { toast('Режим выбирает хост'); return; } vibrate(10); Net.toHost({ t: 'mode', mode: b.dataset.m }); });
$('#lb-opts').addEventListener('click', e => {
  if (!Net.isHost) return;
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
  const impWin = res.mode === 'traitor' && res.win === 'impostor';
  $('#res-icon').innerHTML = icon(mine && mine.win ? 'trophy' : impWin ? 'impostor' : 'medal');
  $('#res-coins').innerHTML = mine && mine.coins ? `+${mine.coins} ${icon('coin')} <span class="muted small">монет в копилку</span>` : '';
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
