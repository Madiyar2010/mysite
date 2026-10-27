// Общие помощники и игровые данные
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.random() * a.length | 0];
export const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const rid = () => Math.random().toString(36).slice(2, 10);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export const LS = {
  get(k, d) { try { const v = localStorage.getItem('ha_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ha_' + k, JSON.stringify(v)); } catch (e) { } }
};

export const CLASSES = {
  knight: { name: 'Рыцарь', icon: 'knight', hp: 170, speed: 5.0, color: '#7cc4ff',
    desc: 'Крепкий воин с мечом и щитом.', atkName: 'Удар мечом', supName: 'Рывок щитом',
    supDesc: 'Бросок вперёд, сбивает врагов и даёт щит',
    atk: { type: 'melee', range: 2.2, arc: 2.0, dmg: 28, cd: 0.55 }, sup: { cd: 6 } },
  archer: { name: 'Лучник', icon: 'archer', hp: 100, speed: 5.6, color: '#9be15d',
    desc: 'Стреляет издалека, быстрый.', atkName: 'Выстрел', supName: 'Залп',
    supDesc: 'Пять стрел веером',
    atk: { type: 'arrow', speed: 21, dmg: 20, cd: 0.5, range: 15 }, sup: { cd: 7 } },
  mage: { name: 'Маг', icon: 'mage', hp: 110, speed: 5.1, color: '#ff7eb6',
    desc: 'Огненные шары взрываются по площади.', atkName: 'Огненный шар', supName: 'Лечение',
    supDesc: 'Лечит себя и друзей рядом',
    atk: { type: 'fireball', speed: 13, dmg: 26, cd: 0.8, radius: 1.8, range: 13 }, sup: { cd: 9 } },
  ninja: { name: 'Ниндзя', icon: 'ninja', hp: 105, speed: 6.6, color: '#b69cff',
    desc: 'Очень быстрый, бьёт часто.', atkName: 'Удар', supName: 'Тень',
    supDesc: 'Телепорт вперёд и невидимость',
    atk: { type: 'melee', range: 2.0, arc: 1.8, dmg: 20, cd: 0.28 }, sup: { cd: 5 } }
};

export const MODES = {
  ffa: { name: 'Каждый сам за себя', icon: 'swords', group: 'arena', min: 1, desc: 'Кто больше всех выбьет соперников за 3 минуты.' },
  tdm: { name: 'Команда на команду', icon: 'users', group: 'arena', min: 2, desc: 'Красные против синих. Первые до 15 очков.' },
  ctf: { name: 'Захват флага', icon: 'flag', group: 'arena', min: 2, desc: 'Укради флаг врага и принеси на свою базу. До 3 захватов.' },
  gun: { name: 'Оружейная гонка', icon: 'gun', group: 'arena', min: 1, desc: 'За каждое выбивание — новое оружие. Кто первым выбьет ножом — победил!' },
  pve: { name: 'Все против монстров', icon: 'skull', group: 'arena', min: 1, desc: 'Вместе отбивайтесь от волн скелетов. В конце — босс!' },
  traitor: { name: 'Найди предателя', icon: 'impostor', group: 'traitor', min: 3, desc: 'Как Among Us: задания, саботаж, люки, собрания. Среди вас — предатель!' }
};

export const TEAM_COLORS = { 0: '#ff5d6c', 1: '#4da3ff' };
export const TEAM_NAMES = { 0: 'Красные', 1: 'Синие' };

export const HATS = [
  { id: 'none', name: 'Без шапки', icon: 'close', price: 0 },
  { id: 'cap', name: 'Кепка', icon: 'hat', price: 40 },
  { id: 'party', name: 'Колпак', icon: 'hat', price: 60 },
  { id: 'tophat', name: 'Цилиндр', icon: 'hat', price: 90 },
  { id: 'viking', name: 'Рога викинга', icon: 'shield', price: 120 },
  { id: 'wizard', name: 'Шляпа мага', icon: 'mage', price: 150 },
  { id: 'crown', name: 'Корона', icon: 'crown', price: 220 },
  { id: 'halo', name: 'Нимб', icon: 'angel', price: 260 },
  { id: 'propeller', name: 'Пропеллер', icon: 'rotate', price: 320 }
];
export const AURAS = [
  { id: 'none', name: 'Обычная', icon: 'aura', price: 0, color: null },
  { id: 'fire', name: 'Огонь', icon: 'aura', price: 80, color: '#ff7a2f' },
  { id: 'ice', name: 'Лёд', icon: 'aura', price: 80, color: '#7fe3ff' },
  { id: 'poison', name: 'Яд', icon: 'aura', price: 110, color: '#8cff5a' },
  { id: 'gold', name: 'Золото', icon: 'aura', price: 180, color: '#ffd34d' },
  { id: 'void', name: 'Тьма', icon: 'aura', price: 220, color: '#b36bff' },
  { id: 'rainbow', name: 'Радуга', icon: 'aura', price: 350, color: 'rainbow' }
];

export const PHRASES = ['Это не я!', 'Я делал задание', 'Я видел тело', 'Кто был рядом?', 'Подозрительно…', 'Он врёт!', 'Видел, как кто-то вылез из люка', 'Пропустим голосование', 'Голосую против', 'Видел, как кто-то убегал', 'Давайте подумаем', 'Я вам верю', 'Да', 'Нет', 'Где тело?', 'Кто созвал?'];

// Кошелёк и покупки — хранятся на этом устройстве
export const Wallet = {
  coins() { return LS.get('coins', 0); },
  add(n) { LS.set('coins', Math.max(0, this.coins() + n)); },
  owned() { return new Set(LS.get('owned', ['none'])); },
  own(id) { const s = this.owned(); s.add(id); LS.set('owned', [...s]); },
  buy(item) {
    if (this.owned().has(item.id)) return true;
    if (this.coins() < item.price) return false;
    this.add(-item.price); this.own(item.id); return true;
  }
};

// награды конца матча: каждому человеку по одной награде (+10 монет), чтобы никто не остался без приятного
export const AWARD_COINS = 10;
export function giveAwards(rows, defs) {
  const people = rows.filter(r => !r.bot);
  for (const d of defs) {
    const cand = people.filter(r => !r.award && d.ok(r));
    if (!cand.length) continue;
    cand.sort((a, b) => d.score(b) - d.score(a));
    const best = cand[0]; best.award = { name: d.name, icon: d.icon };
  }
  for (const r of people) if (!r.award) r.award = { name: 'Отважный игрок', icon: 'shield' };
  for (const r of people) { r.coins = (r.coins || 0) + AWARD_COINS; }
  return rows;
}
