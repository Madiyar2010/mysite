// Карты для «Найди предателя»: сетка из комнат и коридоров, двери, люки, камеры, задания.
// Клетка = T метров. Пол — там, где есть комната или коридор; всё остальное — стена.

export const T = 2;
const PROP_SCALE = 1.35;

// ---------- описание заданий ----------
// game — тип мини-игры; kind — short/long/common
export const TASKS = {
  asteroids: { name: 'Сбить астероиды', game: 'tap', kind: 'short', icon: 'asteroid' },
  divert: { name: 'Перенаправить энергию', game: 'slider', kind: 'short', icon: 'power' },
  distributor: { name: 'Откалибровать распределитель', game: 'needle', kind: 'short', icon: 'power' },
  steering: { name: 'Стабилизировать курс', game: 'center', kind: 'short', icon: 'steering' },
  shields: { name: 'Зарядить щиты', game: 'hex', kind: 'short', icon: 'shields' },
  manifold: { name: 'Открыть клапаны реактора', game: 'order', kind: 'short', icon: 'reactor' },
  filter: { name: 'Почистить фильтр кислорода', game: 'leaves', kind: 'short', icon: 'leaf' },
  chart: { name: 'Проложить курс', game: 'slider', kind: 'short', icon: 'compass' },
  align_u: { name: 'Выровнять верхний двигатель', game: 'slider', kind: 'short', icon: 'engine' },
  align_l: { name: 'Выровнять нижний двигатель', game: 'slider', kind: 'short', icon: 'engine' },
  swipe: { name: 'Провести картой', game: 'card', kind: 'common', icon: 'card' },
  wires: { name: 'Починить проводку', game: 'wires', kind: 'common', icon: 'wire', where: ['wiresC', 'wiresS', 'wiresE'] },
  garbage: { name: 'Вынести мусор', game: 'hold', kind: 'common', icon: 'trash', where: ['garbageC', 'garbageT'] },
  simon: { name: 'Запустить реактор', game: 'simon', kind: 'long', icon: 'reactor' },
  scan: { name: 'Пройти сканирование', game: 'scan', kind: 'long', icon: 'scan' },
  sample: { name: 'Проверить образец', game: 'sample', kind: 'long', icon: 'flask' },
  fuel: { name: 'Заправить двигатели', game: 'hold', kind: 'long', icon: 'fuel', steps: ['fuelT', 'fuel_u', 'fuelT', 'fuel_l'] },
  data: { name: 'Скачать и загрузить данные', game: 'download', kind: 'long', icon: 'download', steps: [['download_c', 'download_w', 'download_n', 'download_k'], 'upload'] }
};
// станция задания по умолчанию = id задания, если не указано иное
export const SAB = {
  lights: { name: 'Свет выключен', icon: 'lights', fix: ['fix_lights'], game: 'switches' },
  comms: { name: 'Связь сломана', icon: 'comms', fix: ['fix_comms'], game: 'dial' },
  reactor: { name: 'Авария реактора', icon: 'reactor', fix: ['fix_reactor1', 'fix_reactor2'], game: 'handprint', critical: 45, both: true },
  o2: { name: 'Утечка кислорода', icon: 'oxygen', fix: ['fix_o2_1', 'fix_o2_2'], game: 'keypad', critical: 45 }
};

// ---------- космическая станция ----------
function stationDef() {
  const C = [[1, 7], [11, 17], [21, 31], [35, 41], [45, 51]]; // колонки комнат (x от..до)
  const Rw = [[1, 8], [12, 19], [23, 30]];                    // ряды (y от..до)
  const room = (id, name, c, r, adj = {}) => ({ id, name, x1: C[c][0] + (adj.x1 || 0), x2: C[c][1] + (adj.x2 || 0), y1: Rw[r][0] + (adj.y1 || 0), y2: Rw[r][1] + (adj.y2 || 0), floor: adj.floor || 'metal' });
  const rooms = [
    room('U', 'Верхний двигатель', 0, 0, { floor: 'grate' }), room('M', 'Медпункт', 1, 0, { floor: 'white' }), room('C', 'Кафетерий', 2, 0, { y1: -0, floor: 'cafe' }), room('W', 'Оружейная', 3, 0),
    room('R', 'Реактор', 0, 1, { y1: -1, y2: 1, floor: 'grate' }), room('S', 'Охрана', 1, 1, { y1: 1, y2: -1 }), room('A', 'Админ', 2, 1, { x1: 2, x2: -2, y1: 1, y2: -1, floor: 'cafe' }), room('O', 'Кислород', 3, 1, { x1: 1, x2: -1, y1: 1, y2: -1, floor: 'green' }), room('N', 'Навигация', 4, 1),
    room('L', 'Нижний двигатель', 0, 2, { floor: 'grate' }), room('E', 'Электрика', 1, 2, { floor: 'grate' }), room('T', 'Склад', 2, 2), room('K', 'Связь', 3, 2), room('H', 'Щиты', 4, 2)
  ];
  const links = [['U', 'M'], ['M', 'C'], ['C', 'W'], ['U', 'R'], ['R', 'L'], ['R', 'S'], ['S', 'E'], ['C', 'A'], ['A', 'T'], ['W', 'O'], ['O', 'N'], ['N', 'H'], ['L', 'E'], ['E', 'T'], ['T', 'K'], ['K', 'H'], ['A', 'O']];
  const doorRooms = ['C', 'M', 'S', 'E', 'T', 'U', 'L'];
  // предметы: [модель, dx, dy, поворот, масштаб, размер_коллизии [w,h] в клетках | 0, станция]
  // dx, dy — в клетках от левого верхнего угла комнаты
  const P = Math.PI, H = P / 2;
  const props = {
    U: [['sp/rocket_fuelA', 2.2, 4, H, 3.4, [2.4, 2.4], 'fuel_u'], ['st/computer', 5.5, 0.7, 0, 2, [0.6, 0.6], 'align_u'], ['st/pipe', 6.4, 3, 0, 2, 0], ['st/pipe', 6.4, 5, 0, 2, 0]],
    M: [['st/bed-single', 1.0, 1.4, H, 2, [1.2, 1.6]], ['st/bed-single', 1.0, 3.8, H, 2, [1.2, 1.6]], ['scanner', 4.6, 5.2, 0, 1, 0, 'scan'], ['st/table-display', 5.6, 0.8, 0, 2, [1, 0.6], 'sample'], ['st/computer', 6.4, 3.5, -H, 2, [0.6, 0.6]]],
    C: [['st/table-large', 2.3, 2, 0, 2, [2, 1.2]], ['st/table-large', 8.7, 2, 0, 2, [2, 1.2]], ['st/table-large', 2.3, 6.2, 0, 2, [2, 1.2]], ['st/table-large', 8.7, 6.2, 0, 2, [2, 1.2]],
      ['button', 5.5, 4.2, 0, 1, [1.4, 1.4], 'button'], ['st/skip', 10.0, 7.2, P, 2, [1.4, 0.8], 'garbageC'], ['st/wall-switch', 0.5, 4.2, H, 2, 0, 'wiresC'], ['st/computer', 10.4, 0.7, 0, 2, [0.6, 0.6], 'download_c'],
      ['st/chair', 1.6, 1.2, 0, 2, 0], ['st/chair', 3.0, 1.2, 0, 2, 0], ['st/chair', 8.0, 1.2, 0, 2, 0], ['st/chair', 9.4, 1.2, 0, 2, 0], ['st/chair', 1.6, 7.1, P, 2, 0], ['st/chair', 3.0, 7.1, P, 2, 0], ['st/chair', 8.0, 7.1, P, 2, 0], ['st/chair', 9.4, 7.1, P, 2, 0]],
    W: [['sp/turret_double', 3.5, 3.4, P, 4, [2.6, 1.8]], ['st/computer-system', 3.5, 6.6, P, 2, [1.6, 0.8], 'asteroids'], ['st/computer', 6.3, 0.7, 0, 2, [0.6, 0.6], 'download_w']],
    R: [['sp/machine_barrelLarge', 2.6, 5, 0, 4.2, [2.6, 2.6]], ['st/display-wall', 0.5, 1.2, H, 2.2, [0.5, 0.6], 'fix_reactor1'], ['st/display-wall', 0.5, 8.8, H, 2.2, [0.5, 0.6], 'fix_reactor2'],
      ['st/computer', 5.8, 0.7, 0, 2, [0.6, 0.6], 'simon'], ['st/computer-screen', 5.8, 9.3, P, 2, [0.6, 0.6], 'manifold']],
    S: [['st/computer-wide', 3.5, 0.7, 0, 2, [1.6, 0.6], 'cams'], ['st/chair', 3.5, 2.0, P, 2, 0], ['st/wall-switch', 6.5, 4, -H, 2, 0, 'wiresS'], ['st/display-wall-wide', 0.5, 3, H, 2, 0]],
    A: [['st/table-display-planet', 3.5, 3, 0, 2.6, [2.6, 1.6], 'admin'], ['st/computer', 6.3, 0.7, 0, 2, [0.6, 0.6], 'swipe'], ['st/computer-screen', 0.7, 0.7, 0, 2, [0.6, 0.6], 'upload'], ['st/display-wall', 0.5, 5.2, H, 2.2, [0.5, 0.6], 'fix_o2_2']],
    O: [['st/container-tall', 0.9, 0.9, 0, 2, [1, 1], 'filter'], ['st/display-wall', 4.4, 0.6, 0, 2.2, [0.6, 0.5], 'fix_o2_1'], ['st/pipe', 0.5, 4, 0, 2, 0], ['st/pipe', 4.5, 4, 0, 2, 0]],
    N: [['st/computer-system', 5.6, 4, -H, 2, [0.8, 1.6], 'steering'], ['st/computer-wide', 3.5, 0.7, 0, 2, [1.6, 0.6], 'chart'], ['st/computer', 6.3, 7.3, P, 2, [0.6, 0.6], 'download_n'], ['st/chair', 4.4, 4, H, 2, 0], ['st/display-wall-wide', 3.5, 7.6, P, 2, 0]],
    L: [['sp/rocket_fuelA', 2.2, 4, H, 3.4, [2.4, 2.4], 'fuel_l'], ['st/computer', 5.5, 7.3, P, 2, [0.6, 0.6], 'align_l'], ['st/pipe', 6.4, 3, 0, 2, 0]],
    E: [['st/structure-panel', 1.0, 0.6, 0, 2, [1.2, 0.5], 'fix_lights'], ['st/wall-switch', 6.5, 1.5, -H, 2, 0, 'wiresE'], ['st/computer', 3.5, 7.3, P, 2, [0.6, 0.6], 'distributor'], ['sp/machine_generator', 5.2, 5, 0, 2.6, [1.6, 0.8], 'divert'], ['st/pipe-ring', 0.6, 5, 0, 2, 0]],
    T: [['st/container-tall', 9.6, 1.4, 0, 2.2, [1, 1], 'fuelT'], ['st/skip', 1.8, 7.2, 0, 2, [1.4, 0.8], 'garbageT'], ['st/container-wide', 3, 2.6, 0, 2.2, [1.6, 1]], ['st/container', 6.4, 5, 0.3, 2.4, [1, 1]],
      ['st/container-flat', 8, 6.6, 0, 2.2, [1.4, 1]], ['st/container', 4.6, 5.6, 0, 2.2, [1, 1]], ['st/container-wide', 1.4, 4.2, H, 2.2, [1, 1.6]]],
    K: [['sp/satelliteDish_large', 4.6, 3, 0, 3.4, [2, 1.6]], ['st/computer-screen', 0.7, 0.7, 0, 2, [0.6, 0.6], 'fix_comms'], ['st/computer', 6.3, 7.3, P, 2, [0.6, 0.6], 'download_k']],
    H: [['st/structure-panel', 3.5, 0.6, 0, 2, [1.2, 0.5], 'shields'], ['st/display-wall-wide', 6.5, 4, -H, 2, 0], ['sp/machine_barrel', 1.2, 6.6, 0, 3, [0.8, 0.8]]]
  };
  const vents = [
    { id: 'vU', room: 'U', dx: 5.6, dy: 6.6, to: ['vR', 'vL'] }, { id: 'vR', room: 'R', dx: 5.6, dy: 5, to: ['vU', 'vL'] }, { id: 'vL', room: 'L', dx: 5.6, dy: 1.5, to: ['vU', 'vR'] },
    { id: 'vM', room: 'M', dx: 1.2, dy: 6.8, to: ['vS', 'vE'] }, { id: 'vS', room: 'S', dx: 1.2, dy: 5.5, to: ['vM', 'vE'] }, { id: 'vE', room: 'E', dx: 1.2, dy: 7, to: ['vM', 'vS'] },
    { id: 'vC', room: 'C', dx: 1.0, dy: 7.3, to: ['vA'] }, { id: 'vA', room: 'A', dx: 6.2, dy: 5.2, to: ['vC'] },
    { id: 'vW', room: 'W', dx: 1.0, dy: 1.0, to: ['vN'] }, { id: 'vN', room: 'N', dx: 1.2, dy: 7.2, to: ['vW', 'vH'] }, { id: 'vH', room: 'H', dx: 1.2, dy: 4.2, to: ['vN', 'vO'] }, { id: 'vO', room: 'O', dx: 4.2, dy: 5.2, to: ['vH'] }
  ];
  const cams = [{ name: 'Верхний коридор', link: ['U', 'M'] }, { name: 'Коридор у Админа', link: ['A', 'O'] }, { name: 'Навигация', link: ['O', 'N'] }, { name: 'Нижний коридор', link: ['E', 'T'] }];
  return { id: 'station', name: 'Космическая станция', GW: 53, GH: 32, rooms, links, doorRooms, props, vents, cams, spawnRoom: 'C', theme: 'space' };
}

// ---------- построение карты ----------
export function buildAmap(def) {
  const { GW, GH } = def;
  const grid = new Uint8Array(GW * GH);   // 0 стена, 1 пол комнаты, 2 коридор
  const roomOf = new Int16Array(GW * GH).fill(-1);
  const idx = (x, y) => y * GW + x;
  const R = {};
  def.rooms.forEach((r, i) => {
    R[r.id] = r; r.i = i;
    for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) { grid[idx(x, y)] = 1; roomOf[idx(x, y)] = i; }
  });
  const corridors = [], doors = [];
  for (const [a, b] of def.links) {
    const A = R[a], B = R[b];
    let c;
    if (A.x2 < B.x1 || B.x2 < A.x1) { // по горизонтали
      const L = A.x2 < B.x1 ? A : B, Rr = L === A ? B : A;
      const y0 = Math.max(L.y1, Rr.y1), y1 = Math.min(L.y2, Rr.y2), cy = Math.floor((y0 + y1) / 2);
      c = { x1: L.x2 + 1, x2: Rr.x1 - 1, y1: cy, y2: cy + 1, h: true, a: L.id, b: Rr.id };
    } else {
      const Tt = A.y2 < B.y1 ? A : B, Bb = Tt === A ? B : A;
      const x0 = Math.max(Tt.x1, Bb.x1), x1 = Math.min(Tt.x2, Bb.x2), cx = Math.floor((x0 + x1) / 2);
      c = { x1: cx, x2: cx + 1, y1: Tt.y2 + 1, y2: Bb.y1 - 1, h: false, a: Tt.id, b: Bb.id };
    }
    corridors.push(c);
    for (let y = c.y1; y <= c.y2; y++) for (let x = c.x1; x <= c.x2; x++) if (!grid[idx(x, y)]) grid[idx(x, y)] = 2;
    // двери на концах коридора у «дверных» комнат
    for (const end of ['a', 'b']) {
      const rid = c[end]; if (!def.doorRooms.includes(rid)) continue;
      const cells = [];
      if (c.h) { const x = end === 'a' ? c.x1 : c.x2; for (let y = c.y1; y <= c.y2; y++) cells.push([x, y]); }
      else { const y = end === 'a' ? c.y1 : c.y2; for (let x = c.x1; x <= c.x2; x++) cells.push([x, y]); }
      doors.push({ id: 'd' + doors.length, room: rid, cells, h: c.h, side: end });
    }
  }
  const W = (tx) => (tx + 0.5 - GW / 2) * T, Z = (ty) => (ty + 0.5 - GH / 2) * T;
  const toTile = (x, z) => [Math.floor(x / T + GW / 2), Math.floor(z / T + GH / 2)];
  const doorAt = new Int16Array(GW * GH).fill(-1);
  doors.forEach((d, i) => {
    for (const [x, y] of d.cells) doorAt[idx(x, y)] = i;
    const cx = d.cells.reduce((s, c) => s + c[0], 0) / d.cells.length, cy = d.cells.reduce((s, c) => s + c[1], 0) / d.cells.length;
    d.x = W(cx); d.z = Z(cy); d.len = d.cells.length * T;
    // створка стоит на границе коридора и комнаты
    if (d.h) { d.ex = d.x + (d.side === 'a' ? -T / 2 : T / 2); d.ez = d.z; d.rot = Math.PI / 2; }
    else { d.ex = d.x; d.ez = d.z + (d.side === 'a' ? -T / 2 : T / 2); d.rot = 0; }
  });
  // предметы и станции
  const props = [], stations = {}, solids = [];
  for (const r of def.rooms) {
    r.cx = (W(r.x1) + W(r.x2)) / 2; r.cz = (Z(r.y1) + Z(r.y2)) / 2;
    r.wx1 = W(r.x1) - T / 2; r.wx2 = W(r.x2) + T / 2; r.wz1 = Z(r.y1) - T / 2; r.wz2 = Z(r.y2) + T / 2;
    for (const [model, dx, dy, rot, s0, col, st] of (def.props[r.id] || [])) {
      const x = W(r.x1) - T / 2 + dx * T, z = Z(r.y1) - T / 2 + dy * T;
      const k = model.includes('/') ? PROP_SCALE : 1, s = s0 * k;
      props.push({ model, x, z, rot, s, st });
      if (col) solids.push({ x, z, hw: col[0] * T / 2 * 0.9 * k, hd: col[1] * T / 2 * 0.9 * k, rot });
      if (st) stations[st] = { id: st, x, z, room: r.id, roomName: r.name };
    }
  }
  // поворот коллизии на 90°
  for (const s of solids) if (Math.abs(Math.sin(s.rot || 0)) > 0.7) { const t = s.hw; s.hw = s.hd; s.hd = t; }
  const vents = def.vents.map(v => { const r = R[v.room]; return { ...v, x: W(r.x1) - T / 2 + v.dx * T, z: Z(r.y1) - T / 2 + v.dy * T, roomName: r.name }; });
  const cams = def.cams.map(c => { const cor = corridors.find(k => (k.a === c.link[0] && k.b === c.link[1]) || (k.a === c.link[1] && k.b === c.link[0])); return { name: c.name, x: (W(cor.x1) + W(cor.x2)) / 2, z: (Z(cor.y1) + Z(cor.y2)) / 2 }; });
  const sp = R[def.spawnRoom];
  const button = stations.button;
  const spawns = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; spawns.push({ x: button.x + Math.cos(a) * 3.2, z: button.z + Math.sin(a) * 2.6 }); }
  const map = { def, id: def.id, name: def.name, GW, GH, grid, roomOf, doorAt, rooms: def.rooms, R, corridors, doors, props, stations, solids, vents, cams, spawns, W, Z, toTile,
    width: GW * T, depth: GH * T, theme: def.theme };
  return map;
}

// ---------- запросы к карте ----------
// закрытые двери передаются набором индексов
export function solidTile(map, tx, ty, closed) {
  if (tx < 0 || ty < 0 || tx >= map.GW || ty >= map.GH) return true;
  const i = ty * map.GW + tx;
  if (!map.grid[i]) return true;
  if (closed && closed.size && map.doorAt[i] >= 0 && closed.has(map.doorAt[i])) return true;
  return false;
}
export function roomAtPos(map, x, z) {
  const [tx, ty] = map.toTile(x, z);
  if (tx < 0 || ty < 0 || tx >= map.GW || ty >= map.GH) return null;
  const r = map.roomOf[ty * map.GW + tx];
  return r >= 0 ? map.rooms[r] : null;
}
// вытолкнуть круг из стен и предметов
export function collide(map, p, r, closed) {
  const [tx, ty] = map.toTile(p.x, p.z);
  for (let k = 0; k < 2; k++) {
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      if (!solidTile(map, x, y, closed)) continue;
      const cx = map.W(x), cz = map.Z(y), h = T / 2;
      push(p, cx, cz, h, h, r);
    }
    for (const s of map.solids) if (Math.abs(s.x - p.x) < s.hw + r + 0.5 && Math.abs(s.z - p.z) < s.hd + r + 0.5) push(p, s.x, s.z, s.hw, s.hd, r);
  }
}
function push(p, ox, oz, hw, hd, r) {
  const nx = Math.max(ox - hw, Math.min(p.x, ox + hw)), nz = Math.max(oz - hd, Math.min(p.z, oz + hd));
  const dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
  if (d < r) {
    if (d > 1e-4) { p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
    else { const ex = hw + r - Math.abs(p.x - ox), ez = hd + r - Math.abs(p.z - oz); if (ex < ez) p.x += p.x > ox ? ex : -ex; else p.z += p.z > oz ? ez : -ez; }
  }
}
// луч по сетке: на каком расстоянии упрёмся в стену (не дальше maxD)
export function castRay(map, x, z, ang, maxD, closed) {
  const dx = Math.cos(ang), dz = Math.sin(ang);
  let gx = x / T + map.GW / 2, gz = z / T + map.GH / 2;
  let tx = Math.floor(gx), tz = Math.floor(gz);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDX = Math.abs(1 / dx), tDZ = Math.abs(1 / dz);
  let tMX = dx > 0 ? (tx + 1 - gx) * tDX : (gx - tx) * tDX;
  let tMZ = dz > 0 ? (tz + 1 - gz) * tDZ : (gz - tz) * tDZ;
  const maxT = maxD / T;
  let t = 0;
  while (t < maxT) {
    if (tMX < tMZ) { t = tMX; tMX += tDX; tx += stepX; } else { t = tMZ; tMZ += tDZ; tz += stepZ; }
    if (t >= maxT) break;
    if (solidTile(map, tx, tz, closed)) return t * T;
  }
  return maxD;
}
export function lineOfSight(map, ax, az, bx, bz, closed) {
  const d = Math.hypot(bx - ax, bz - az);
  if (d < 0.01) return true;
  return castRay(map, ax, az, Math.atan2(bz - az, bx - ax), d, closed) >= d - 0.05;
}

export const AMAPS = { station: buildAmap(stationDef()) };
export const AMAP_LIST = [
  { id: 'station', name: 'Космическая станция', icon: 'station', ready: true },
  { id: 'haunted', name: 'Замок с призраками', icon: 'castle', ready: false },
  { id: 'underwater', name: 'Подводная база', icon: 'submarine', ready: false }
];

export function amapModels(map) {
  const s = new Set(['st/floor', 'st/floor-panel', 'st/floor-detail', 'st/wall', 'st/wall-window', 'st/wall-pillar', 'st/wall-banner', 'st/wall-detail', 'st/door-double']);
  map.props.forEach(p => { if (p.model.includes('/')) s.add(p.model); });
  return [...s];
}
