// Карты: данные для логики (стены, препятствия, точки появления) и для отрисовки.
// Мир плоский: координаты x (влево-вправо) и z (вверх-вниз по экрану).

// ---------- столкновения ----------
// Препятствие — прямоугольник {x, z, hw, hd} (центр и половины размеров)
export function pushOut(obs, p, r) {
  for (let k = 0; k < 2; k++) {
    for (const o of obs) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const ox = o.hw + r - Math.abs(dx), oz = o.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        // ближайшая точка прямоугольника
        const cx = Math.max(o.x - o.hw, Math.min(p.x, o.x + o.hw));
        const cz = Math.max(o.z - o.hd, Math.min(p.z, o.z + o.hd));
        const ddx = p.x - cx, ddz = p.z - cz, d = Math.hypot(ddx, ddz);
        if (d > 0 && d < r) { p.x = cx + ddx / d * r; p.z = cz + ddz / d * r; }
        else if (d === 0) { if (ox < oz) p.x += dx > 0 ? ox : -ox; else p.z += dz > 0 ? oz : -oz; }
      }
    }
  }
}
export function pointBlocked(obs, x, z, r = 0) {
  for (const o of obs) if (Math.abs(x - o.x) < o.hw + r && Math.abs(z - o.z) < o.hd + r) return true;
  return false;
}
// Есть ли прямая видимость между точками (для ботов и монстров)
export function lineClear(obs, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
  for (let i = 1; i < n; i++) { const t = i / n; if (pointBlocked(obs, ax + (bx - ax) * t, az + (bz - az) * t, 0.1)) return false; }
  return true;
}

// ---------- АРЕНА ----------
function buildArena() {
  const W = 22, D = 15; // половины размеров
  const obs = [], deco = [], walls = [];
  // внешние стены
  const wallRun = (x1, z1, x2, z2, gapAt) => {
    const horiz = z1 === z2, len = horiz ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const n = Math.round(len / 2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      const isGate = gapAt != null && Math.abs((horiz ? x : z) - gapAt) < 1.01;
      walls.push({ model: isGate ? 'arena/wall-gate' : 'arena/wall', x, z, r: horiz ? 0 : Math.PI / 2 });
    }
    obs.push(horiz ? { x: (x1 + x2) / 2, z: z1, hw: len / 2 + 0.6, hd: 0.6 } : { x: x1, z: (z1 + z2) / 2, hw: 0.6, hd: len / 2 + 0.6 });
  };
  wallRun(-W, -D, W, -D, 0); wallRun(-W, D, W, D, 0);
  wallRun(-W, -D, -W, D, 0); wallRun(W, -D, W, D, 0);
  for (const [x, z] of [[-W, -D], [W, -D], [-W, D], [W, D]]) walls.push({ model: 'arena/wall-corner', x, z, r: 0, corner: true });

  const add = (o) => { obs.push({ x: o.x, z: o.z, hw: o.hw, hd: o.hd }); deco.push(o); };
  const sym = (fn) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) fn(sx, sz); };
  // центр
  add({ model: 'arena/statue', x: 0, z: 0, hw: 0.9, hd: 0.9, s: 2.2 });
  for (const [x, z] of [[-2.6, 0], [2.6, 0]]) deco.push({ model: 'arena/floor-detail', x, z, s: 2, flat: true });
  // колонны и стенки-укрытия
  sym((sx, sz) => {
    add({ model: 'arena/column', x: 6 * sx, z: 5.5 * sz, hw: 0.65, hd: 0.65, s: 2 });
    add({ model: 'arena/column-damaged', x: 11 * sx, z: 10 * sz, hw: 0.65, hd: 0.65, s: 2 });
    deco.push({ model: 'arena/wall', x: 12 * sx - 1, z: 3.6 * sz, r: 0, s: 2 }, { model: 'arena/wall', x: 12 * sx + 1, z: 3.6 * sz, r: 0, s: 2 });
    obs.push({ x: 12 * sx, z: 3.6 * sz, hw: 2, hd: 0.6 });
    add({ model: 'grave/pine', x: 19 * sx, z: 12 * sz, hw: 0.7, hd: 0.7, s: 1.6 });
    deco.push({ model: 'grave/rocks', x: 16.5 * sx, z: 12.5 * sz, s: 2.2 });
  });
  for (const sz of [-1, 1]) {
    deco.push({ model: 'arena/wall', x: -1, z: 9 * sz, r: 0, s: 2 }, { model: 'arena/wall', x: 1, z: 9 * sz, r: 0, s: 2 });
    obs.push({ x: 0, z: 9 * sz, hw: 2, hd: 0.6 });
    add({ model: 'arena/block', x: 5 * (sz), z: 11 * sz, hw: 1, hd: 1, s: 2 });
    add({ model: 'arena/block', x: -5 * (sz), z: 11 * sz, hw: 1, hd: 1, s: 2 });
  }
  // базы команд (для режимов с командами)
  const bases = [{ team: 0, x: -18, z: 0 }, { team: 1, x: 18, z: 0 }];
  for (const b of bases) {
    const sx = Math.sign(b.x);
    deco.push({ model: 'arena/weapon-rack', x: b.x + sx * 2.6, z: -4.5, r: -sx * Math.PI / 2, s: 2 });
    deco.push({ model: 'arena/weapon-rack', x: b.x + sx * 2.6, z: 4.5, r: -sx * Math.PI / 2, s: 2 });
    deco.push({ model: 'arena/banner', x: b.x + sx * 3.2, z: 0, r: -sx * Math.PI / 2, s: 2, team: b.team });
  }
  const spawnsFFA = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; spawnsFFA.push({ x: Math.cos(a) * 15, z: Math.sin(a) * 10 }); }
  const teamSpawns = { 0: [], 1: [] };
  for (const b of bases) for (let i = 0; i < 6; i++) teamSpawns[b.team].push({ x: b.x - Math.sign(b.x) * (i % 2) * 1.6, z: (i - 2.5) * 1.6 });
  const pveSpawns = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; pveSpawns.push({ x: Math.cos(a) * 3.5, z: Math.sin(a) * 3.5 }); }
  const monsterGates = [{ x: 0, z: -D + 1.6 }, { x: 0, z: D - 1.6 }, { x: -W + 1.6, z: 0 }, { x: W - 1.6, z: 0 }];
  return { id: 'arena', W, D, obs, deco, walls, bases, spawnsFFA, teamSpawns, pveSpawns, monsterGates, floor: 'arena' };
}

// ---------- ЗАМОК (для «Найди предателя») ----------
export const STATIONS = {
  books:    { name: 'Расставить книги', game: 'order', icon: '📚' },
  sword:    { name: 'Наточить меч', game: 'needle', icon: '🗡️' },
  bed:      { name: 'Заправить кровать', game: 'hold', icon: '🛏️' },
  soup:     { name: 'Сварить суп', game: 'tap', icon: '🍲' },
  fridge:   { name: 'Разложить продукты', game: 'wires', icon: '🧊' },
  trophy:   { name: 'Почистить кубок', game: 'tap', icon: '🏆' },
  candles:  { name: 'Зажечь свечи', game: 'tap', icon: '🕯️' },
  boxes:    { name: 'Разобрать коробки', game: 'order', icon: '📦' },
  washer:   { name: 'Постирать бельё', game: 'needle', icon: '🧺' },
  radio:    { name: 'Починить радио', game: 'wires', icon: '📻' },
  fire:     { name: 'Разжечь костёр', game: 'hold', icon: '🔥' },
  pumpkins: { name: 'Полить тыквы', game: 'hold', icon: '🎃' }
};

function buildCastle() {
  const CW = 14, CD = 12, cols = 3, rows = 3;
  const x0 = -CW * cols / 2, z0 = -CD * rows / 2;
  const W = -x0, D = -z0;
  const obs = [], deco = [], walls = [], stations = [];
  const GAP = 3;
  const rooms = [
    ['Библиотека', 'wood'], ['Оружейная', 'stone'], ['Спальня', 'carpet'],
    ['Кухня', 'tile'], ['Тронный зал', 'royal'], ['Часовня', 'stone2'],
    ['Склад', 'planks'], ['Двор', 'dirt'], ['Сад', 'grass']
  ].map(([name, floor], i) => {
    const c = i % 3, r = Math.floor(i / 3);
    return { name, floor, x: x0 + CW * (c + 0.5), z: z0 + CD * (r + 0.5), w: CW, d: CD };
  });
  // стена из кусочков с проёмом посередине
  const seg = (x1, z1, x2, z2, gap) => {
    const horiz = z1 === z2, len = horiz ? x2 - x1 : z2 - z1;
    const parts = gap ? [[0, (len - GAP) / 2], [(len + GAP) / 2, len]] : [[0, len]];
    for (const [a, b] of parts) {
      const l = b - a, n = Math.max(1, Math.round(l / 2)), pl = l / n;
      for (let i = 0; i < n; i++) {
        const t = a + pl * (i + 0.5);
        walls.push({ model: 'arena/wall', x: horiz ? x1 + t : x1, z: horiz ? z1 : z1 + t, r: horiz ? 0 : Math.PI / 2, sx: pl / 2 });
      }
      const mid = (a + b) / 2;
      obs.push(horiz ? { x: x1 + mid, z: z1, hw: l / 2, hd: 0.45 } : { x: x1, z: z1 + mid, hw: 0.45, hd: l / 2 });
    }
  };
  // внешний контур
  seg(x0, z0, x0 + CW * cols, z0); seg(x0, z0 + CD * rows, x0 + CW * cols, z0 + CD * rows);
  seg(x0, z0, x0, z0 + CD * rows); seg(x0 + CW * cols, z0, x0 + CW * cols, z0 + CD * rows);
  // внутренние стены с дверями
  for (let c = 1; c < cols; c++) for (let r = 0; r < rows; r++) seg(x0 + CW * c, z0 + CD * r, x0 + CW * c, z0 + CD * (r + 1), true);
  for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) seg(x0 + CW * c, z0 + CD * r, x0 + CW * (c + 1), z0 + CD * r, true);
  for (let c = 0; c <= cols; c++) for (let r = 0; r <= rows; r++) walls.push({ model: 'arena/column', x: x0 + CW * c, z: z0 + CD * r, r: 0, pillar: true });

  // предметы в комнатах: [модель, dx, dz, поворот, масштаб, размер коллизии [hw,hd] | 0, станция]
  const F = 2.6; // масштаб мебели
  const R = Math.PI;
  const furnish = {
    'Библиотека': [['furn/bookcaseOpen', -4, -5.0, 0, F, [1.1, 0.5]], ['furn/bookcaseOpen', -1.5, -5.0, 0, F, [1.1, 0.5], 'books'], ['furn/bookcaseClosedWide', 2.5, -5.0, 0, F, [1.6, 0.5]],
      ['furn/table', -1, 1, 0, F, [1.1, 0.6]], ['furn/chair', -1.6, 2.2, R, F, 0], ['furn/chair', -0.3, 2.2, R, F, 0], ['furn/rugRound', 3.5, 2, 0, F, 0], ['furn/lampRoundFloor', 5.5, -4.5, 0, F, 0], ['furn/books', -0.7, 0.8, 0.3, F, 0]],
    'Оружейная': [['arena/weapon-rack', -3, -5, 0, 2, [1, 0.4], 'sword'], ['arena/weapon-rack', 0, -5, 0, 2, [1, 0.4]], ['arena/weapon-rack', 3, -5, 0, 2, [1, 0.4]],
      ['arena/statue', 4.5, 2.5, 0, 1.8, [0.8, 0.8]], ['arena/block', -4.5, 3, 0, 1.5, [0.75, 0.75]], ['arena/weapon-spear', -2, 3.5, 0.6, 2, 0], ['arena/banner', 5.8, -2, -Math.PI / 2, 2, 0]],
    'Спальня': [['furn/bedDouble', -3.5, -3.5, 0, F, [1.4, 1.5], 'bed'], ['furn/bedSingle', 3.8, -3.8, 0, F, [0.8, 1.4]], ['furn/sideTable', -0.9, -4.6, 0, F, 0],
      ['furn/rugRectangle', 0, 2, 0, F, 0], ['furn/coatRackStanding', 5.6, 3.8, 0, F, 0], ['furn/lampRoundFloor', -5.6, 3.8, 0, F, 0]],
    'Кухня': [['furn/kitchenStove', -3, -5, 0, F, [0.6, 0.6], 'soup'], ['furn/kitchenCabinet', -1.7, -5, 0, F, [0.6, 0.6]], ['furn/kitchenSink', -0.4, -5, 0, F, [0.6, 0.6]],
      ['furn/kitchenFridge', 2.5, -5, 0, F, [0.7, 0.6], 'fridge'], ['furn/table', -0.5, 1.5, 0, F, [1.1, 0.6]], ['furn/chair', -1.2, 0.3, 0, F, 0], ['furn/chair', 0.3, 0.3, 0, F, 0], ['furn/trashcan', 5.5, 4.2, 0, F, 0]],
    'Тронный зал': [['furn/tableCloth', -1.1, -0.6, 0, F * 1.2, [1.3, 0.7]], ['arena/statue', -5, -4, 0, 1.8, [0.8, 0.8]], ['arena/statue', 5, -4, 0, 1.8, [0.8, 0.8]],
      ['arena/trophy', 4.6, 3.6, 0, 2.2, [0.5, 0.5], 'trophy'], ['arena/banner', -6.2, 2, Math.PI / 2, 2, 0], ['arena/banner', 6.2, 2, -Math.PI / 2, 2, 0]],
    'Часовня': [['grave/altar-stone', 0, -4.6, 0, 2.2, [1.1, 0.6]], ['grave/candle-multiple', 2.4, -4.6, 0, 2.6, [0.4, 0.4], 'candles'], ['grave/candle-multiple', -2.4, -4.6, 0, 2.6, [0.4, 0.4]],
      ['furn/bench', -2.5, 0, 0, F, [1, 0.3]], ['furn/bench', 2.5, 0, 0, F, [1, 0.3]], ['furn/bench', -2.5, 2.5, 0, F, [1, 0.3]], ['furn/bench', 2.5, 2.5, 0, F, [1, 0.3]], ['grave/urn-round', 5.5, -4.5, 0, 2.5, 0]],
    'Склад': [['furn/cardboardBoxClosed', -4.5, -4.2, 0.2, F * 1.3, [0.6, 0.6], 'boxes'], ['furn/cardboardBoxClosed', -3.2, -4.6, -0.1, F * 1.3, [0.6, 0.6]], ['furn/cardboardBoxClosed', -4.1, -3.0, 0.5, F, [0.5, 0.5]],
      ['furn/washer', 3.5, -4.8, 0, F, [0.6, 0.6], 'washer'], ['furn/radio', 4.8, 3.6, R, F * 1.4, [0.4, 0.4], 'radio'], ['furn/sideTable', 4.8, 3.9, R, F, 0], ['furn/trashcan', -5.4, 4.2, 0, F, 0], ['grave/coffin', 0, 3.6, Math.PI / 2, 2.2, [0.5, 1.1]]],
    'Двор': [['grave/fire-basket', 0, 0.5, 0, 3, [0.6, 0.6], 'fire'], ['grave/rocks', -4.5, -3.5, 0, 2.2, [0.8, 0.6]], ['grave/lantern-candle', 4.5, -3.8, 0, 2.5, 0],
      ['furn/bench', -3, 3.5, 0, F, [1, 0.3]], ['furn/bench', 3, 3.5, 0, F, [1, 0.3]], ['grave/rocks-tall', 5, 3, 0.8, 2, [0.6, 0.6]]],
    'Сад': [['grave/pumpkin-carved', -2, -1, 0.4, 2.6, [0.4, 0.4], 'pumpkins'], ['grave/pine', -4.6, -3.8, 0, 1.3, [0.6, 0.6]], ['grave/pine-crooked', 4.6, -3.6, 0, 1.3, [0.6, 0.6]],
      ['grave/pine', 4.6, 3.6, 0, 1.2, [0.6, 0.6]], ['grave/gravestone-round', 1.5, 3.2, 0, 2.3, [0.4, 0.2]], ['grave/gravestone-cross', 3, 1.5, 0.2, 2.3, [0.4, 0.2]], ['grave/pumpkin-carved', -1, -1.6, -0.5, 2, 0], ['grave/rocks', -4.4, 3.6, 0, 1.8, [0.7, 0.5]]]
  };
  for (const room of rooms) {
    for (const [model, dx, dz, r, s, col, st] of (furnish[room.name] || [])) {
      const x = room.x + dx, z = room.z + dz;
      deco.push({ model, x, z, r, s, center: true, glow: !!st });
      if (col) obs.push({ x, z, hw: col[0], hd: col[1] });
      if (st) stations.push({ id: st, x, z, room: room.name, ...STATIONS[st] });
    }
  }
  const throne = rooms[4];
  const meetingTable = { x: throne.x - 1.1, z: throne.z - 0.6 };
  const spawns = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; spawns.push({ x: meetingTable.x + Math.cos(a) * 3, z: meetingTable.z + Math.sin(a) * 2.4 }); }
  return { id: 'castle', W, D, obs, deco, walls, rooms, stations, spawns, meetingTable, floor: 'castle' };
}

export function roomAt(map, x, z) {
  if (!map.rooms) return null;
  return map.rooms.find(r => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) || null;
}

export const MAPS = { arena: buildArena(), castle: buildCastle() };

export function mapModels(map) {
  const s = new Set();
  map.deco.forEach(d => s.add(d.model));
  map.walls.forEach(w => s.add(w.model));
  return [...s];
}
