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
  knight: { name: 'Рыцарь', icon: '🛡️', hp: 170, speed: 5.0, color: '#7cc4ff',
    desc: 'Крепкий воин с мечом и щитом.', atkName: 'Удар мечом', supName: 'Рывок щитом',
    supDesc: 'Бросок вперёд, сбивает врагов и даёт щит',
    atk: { type: 'melee', range: 2.2, arc: 2.0, dmg: 28, cd: 0.55 }, sup: { cd: 6 } },
  archer: { name: 'Лучник', icon: '🏹', hp: 100, speed: 5.6, color: '#9be15d',
    desc: 'Стреляет издалека, быстрый.', atkName: 'Выстрел', supName: 'Залп',
    supDesc: 'Пять стрел веером',
    atk: { type: 'arrow', speed: 21, dmg: 20, cd: 0.5, range: 15 }, sup: { cd: 7 } },
  mage: { name: 'Маг', icon: '🔮', hp: 110, speed: 5.1, color: '#ff7eb6',
    desc: 'Огненные шары взрываются по площади.', atkName: 'Огненный шар', supName: 'Лечение',
    supDesc: 'Лечит себя и друзей рядом',
    atk: { type: 'fireball', speed: 13, dmg: 26, cd: 0.8, radius: 1.8, range: 13 }, sup: { cd: 9 } },
  ninja: { name: 'Ниндзя', icon: '🥷', hp: 105, speed: 6.6, color: '#b69cff',
    desc: 'Очень быстрый, бьёт часто.', atkName: 'Удар', supName: 'Тень',
    supDesc: 'Телепорт вперёд и невидимость',
    atk: { type: 'melee', range: 2.0, arc: 1.8, dmg: 20, cd: 0.28 }, sup: { cd: 5 } }
};

export const MODES = {
  ffa: { name: 'Каждый сам за себя', icon: '⚔️', group: 'arena', min: 1, desc: 'Кто больше всех выбьет соперников за 3 минуты.' },
  tdm: { name: 'Команда на команду', icon: '🔴🔵', group: 'arena', min: 2, desc: 'Красные против синих. Первые до 15 очков.' },
  ctf: { name: 'Захват флага', icon: '🚩', group: 'arena', min: 2, desc: 'Укради флаг врага и принеси на свою базу. До 3 захватов.' },
  pve: { name: 'Все против монстров', icon: '💀', group: 'arena', min: 1, desc: 'Вместе отбивайтесь от волн скелетов. В конце — босс!' },
  traitor: { name: 'Найди предателя', icon: '🕵️', group: 'traitor', min: 3, desc: 'Выполняйте задания в замке. Среди вас — тайный предатель!' }
};

export const TEAM_COLORS = { 0: '#ff5d6c', 1: '#4da3ff' };
export const TEAM_NAMES = { 0: 'Красные', 1: 'Синие' };

export const HATS = [
  { id: 'none', name: 'Без шапки', icon: '🚫', price: 0 },
  { id: 'cap', name: 'Кепка', icon: '🧢', price: 40 },
  { id: 'party', name: 'Колпак', icon: '🥳', price: 60 },
  { id: 'tophat', name: 'Цилиндр', icon: '🎩', price: 90 },
  { id: 'viking', name: 'Рога викинга', icon: '🐂', price: 120 },
  { id: 'wizard', name: 'Шляпа мага', icon: '🧙', price: 150 },
  { id: 'crown', name: 'Корона', icon: '👑', price: 220 },
  { id: 'halo', name: 'Нимб', icon: '😇', price: 260 },
  { id: 'propeller', name: 'Пропеллер', icon: '🚁', price: 320 }
];
export const AURAS = [
  { id: 'none', name: 'Обычная', icon: '⚪', price: 0, color: null },
  { id: 'fire', name: 'Огонь', icon: '🔥', price: 80, color: '#ff7a2f' },
  { id: 'ice', name: 'Лёд', icon: '❄️', price: 80, color: '#7fe3ff' },
  { id: 'poison', name: 'Яд', icon: '🧪', price: 110, color: '#8cff5a' },
  { id: 'gold', name: 'Золото', icon: '✨', price: 180, color: '#ffd34d' },
  { id: 'void', name: 'Тьма', icon: '🌑', price: 220, color: '#b36bff' },
  { id: 'rainbow', name: 'Радуга', icon: '🌈', price: 350, color: 'rainbow' }
];

export const PHRASES = ['Это не я! 🙅', 'Я делал задание', 'Я видел тело', 'Кто был рядом?', 'Подозрительно… 🤨', 'Он врёт!', 'Я был вместе с ним', 'Пропустим голосование', 'Голосую против', 'Видел, как кто-то убегал', 'Давайте подумаем 🤔', 'Я вам верю', '👍', '👎', '😱', '😂'];

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
