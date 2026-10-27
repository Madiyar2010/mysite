// Успехи игрока на этом устройстве: счётчики, задания дня, семейная таблица рекордов.
import { LS } from './util.js';

// номер недели (с понедельника) и дня — по местному времени
export function dayId(d = new Date()) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
export function weekId(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dayId(x);
}

// ---------- счётчики ----------
export const Stats = {
  get() {
    const st = LS.get('stats', null) || { games: 0, wins: 0, kills: 0, tasks: 0, quests: 0, endless: 0, week: '', weekWins: 0 };
    if (st.week !== weekId()) { st.week = weekId(); st.weekWins = 0; }
    return st;
  },
  save(st) { LS.set('stats', st); }
};

// ---------- задания дня: три штуки, одинаковые для всей семьи в этот день ----------
// each(row, res) — сколько засчитать за матч
const QUESTS = [
  { id: 'play3', text: 'Сыграй 3 матча', icon: 'play', n: 3, each: () => 1 },
  { id: 'win1', text: 'Победи 1 раз', icon: 'trophy', n: 1, each: r => r.win ? 1 : 0 },
  { id: 'win2', text: 'Победи 2 раза', icon: 'trophy', n: 2, each: r => r.win ? 1 : 0 },
  { id: 'kills10', text: 'Выбей 10 соперников в шутере', icon: 'swords', n: 10, each: (r, res) => res.mode !== 'pve' && res.mode !== 'traitor' ? r.kills || 0 : 0 },
  { id: 'hits30', text: 'Сделай 30 попаданий', icon: 'target', n: 30, each: (r, res) => res.mode !== 'traitor' ? r.hits || 0 : 0 },
  { id: 'monsters20', text: 'Выбей 20 монстров', icon: 'skull', n: 20, each: (r, res) => res.mode === 'pve' ? r.kills || 0 : 0 },
  { id: 'waves5', text: 'Пройди 5 волн монстров', icon: 'hourglass', n: 5, each: (r, res) => res.mode === 'pve' ? Math.max(0, (res.wave || 1) - 1) : 0 },
  { id: 'tasks5', text: 'Выполни 5 заданий в «Найди предателя»', icon: 'task', n: 5, each: (r, res) => res.mode === 'traitor' ? r.tasks || 0 : 0 },
  { id: 'traitor2', text: 'Сыграй 2 раза в «Найди предателя»', icon: 'impostor', n: 2, each: (r, res) => res.mode === 'traitor' ? 1 : 0 },
  { id: 'flag1', text: 'Принеси 1 флаг', icon: 'flag', n: 1, each: r => r.caps || 0 },
  { id: 'chest2', text: 'Найди 2 сундука', icon: 'chest', n: 2, each: r => r.chests || 0 },
  { id: 'gun1', text: 'Сыграй в «Оружейную гонку»', icon: 'gun', n: 1, each: (r, res) => res.mode === 'gun' ? 1 : 0 }
];
export const QUEST_COINS = 25;
function seeded(seed) { let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
export const Daily = {
  today() {
    const day = dayId();
    let d = LS.get('daily', null);
    if (!d || d.day !== day) {
      const r = seeded(day), pool = [...QUESTS], ids = [];
      // разные виды: одно общее, одно из шутера, одно любое
      const groups = [['play3', 'win1', 'win2'], ['kills10', 'hits30', 'monsters20', 'waves5', 'flag1', 'chest2', 'gun1'], ['tasks5', 'traitor2', 'kills10', 'hits30', 'chest2']];
      for (const gr of groups) { const opts = gr.filter(x => !ids.includes(x)); ids.push(opts[Math.floor(r() * opts.length)]); }
      d = { day, ids, prog: [0, 0, 0], done: [false, false, false] };
      LS.set('daily', d);
    }
    return { ...d, list: d.ids.map((id, i) => ({ ...QUESTS.find(q => q.id === id), prog: d.prog[i], done: d.done[i] })) };
  },
  // засчитать матч; возвращает список только что выполненных заданий
  count(row, res) {
    const d = this.today(), fresh = [];
    d.list.forEach((q, i) => {
      if (d.done[i]) return;
      d.prog[i] = Math.min(q.n, d.prog[i] + (q.each(row, res) || 0));
      if (d.prog[i] >= q.n) { d.done[i] = true; fresh.push(q); }
    });
    LS.set('daily', { day: d.day, ids: d.ids, prog: d.prog, done: d.done });
    return fresh;
  }
};

// ---------- семейная таблица: у каждого устройства своя копия, в комнате сводятся ----------
export const Family = {
  all() { return LS.get('family', {}) || {}; },
  // своя строчка
  mine(me, st) {
    const fam = this.all(), was = fam[me.pid] || {};
    fam[me.pid] = { name: me.name, color: me.color, week: st.week, weekWins: st.weekWins, wins: st.wins, games: st.games, endless: { ...(was.endless || {}), ...(LS.get('endlessBest', {}) || {}) }, t: Date.now() };
    LS.set('family', fam);
    return { [me.pid]: fam[me.pid] };
  },
  // свести с чужой копией: у каждого игрока остаётся самая свежая запись
  merge(other) {
    if (!other || typeof other !== 'object') return false;
    const fam = this.all(); let ch = false;
    for (const [pid, e] of Object.entries(other)) {
      if (!e || typeof e !== 'object' || typeof pid !== 'string' || pid.length > 20) continue;
      const clean = { name: String(e.name || 'Игрок').slice(0, 14), color: /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#ffffff', week: String(e.week || '').slice(0, 12), weekWins: +e.weekWins || 0, wins: +e.wins || 0, games: +e.games || 0, endless: {}, t: +e.t || 0 };
      for (const k of [0, 1, 2]) if (e.endless && +e.endless[k]) clean.endless[k] = +e.endless[k];
      if (!fam[pid] || fam[pid].t < clean.t) { fam[pid] = clean; ch = true; }
    }
    if (Object.keys(fam).length > 40) { const keep = Object.entries(fam).sort((a, b) => b[1].t - a[1].t).slice(0, 40); LS.set('family', Object.fromEntries(keep)); }
    else if (ch) LS.set('family', fam);
    return ch;
  }
};
