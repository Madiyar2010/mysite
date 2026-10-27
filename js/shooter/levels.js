// Карты шутера: Порт ночью, Замок, Ночное кладбище, Городская улица.
// Всё описывается прямоугольными блоками (коллизия) + декор (только вид).
const PI = Math.PI;

function kit() {
  const B = [], deco = [], floors = [], lights = [], gates = [];
  const box = (x, y, z, w, h, d, vis, extra = {}) => { const b = { x, y, z, w, h, d, vis, ...extra }; B.push(b); return b; };
  // стена вдоль оси x (или z) от a0 до a1 на линии c, с проёмами [{c, w, top, bot}]
  const wall = (axis, a0, a1, c, t, h, vis, gaps = [], extra = {}) => {
    if (a0 > a1) [a0, a1] = [a1, a0];
    const base = extra.base || 0; // стена может стоять выше земли (на палубе, на крыше)
    const seg = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const m = (s0 + s1) / 2, L = s1 - s0;
      if (axis === 'x') box(m, y0 + base, c, L, y1 - y0, t, vis, extra); else box(c, y0 + base, m, t, y1 - y0, L, vis, extra);
    };
    let s = a0;
    for (const g of [...gaps].sort((p, q) => p.c - q.c)) {
      const g0 = g.c - g.w / 2, g1 = g.c + g.w / 2;
      seg(s, g0, 0, h); seg(g0, g1, g.top ?? h, h); if (g.bot) seg(g0, g1, 0, g.bot);
      s = g1;
    }
    seg(s, a1, 0, h);
  };
  const dec = (model, x, z, o = {}) => deco.push({ model, x, z, y: o.y || 0, r: o.r || 0, h: o.h, s: o.s });
  return { B, deco, floors, lights, gates, box, wall, dec };
}
const teamSpawns = (x, dx = 1.4) => {
  const s = { 0: [], 1: [] };
  for (let i = 0; i < 6; i++) { s[0].push({ x: -x + (i % 2) * dx, z: -5 + i * 2, yaw: -PI / 2 }); s[1].push({ x: x - (i % 2) * dx, z: -5 + i * 2, yaw: PI / 2 }); }
  return s;
};
const ffa = list => list.map(([x, z]) => ({ x, z, yaw: Math.atan2(x, z) }));

// ================= ПОРТ НОЧЬЮ =================
// контейнеры в два яруса, кран с кабиной для снайпера в центре, корабль у причала с каютой и мостиком
export function port() {
  const K = kit(), { box, wall, dec } = K;
  const W = 36, D = 22;
  box(0, -1, 0, W * 2 + 2, 1, D * 2 + 2, 'floor');
  // склады-базы по краям и забор
  for (const s of [-1, 1]) {
    box(s * 35.6, 0, 0, 0.8, 4, 44, 'shedwall');
    box(0, 0, -21.6, 72, 3.2, 0.8, 'fence2');
    box(s * 29, 0, -8.5, 0.9, 1.3, 5, 'lowcrate'); box(s * 29, 0, 8.5, 0.9, 1.3, 4, 'lowcrate');
  }
  // вода и причал
  K.floors.push({ x: 0, z: 18.3, w: 74, d: 11.4, tex: 'water', k: 6, y: 0.01 }, { x: 0, z: 12.15, w: 72, d: 0.3, tex: 'paint', k: 1 });
  wall('x', -36, 36, 12.45, 0.3, 3, 'none', [{ c: -8, w: 2.4 }, { c: 8, w: 2.4 }], { pass: true });
  // --- корабль ---
  const DY = 2.2;
  box(0, 0, 17.5, 44, DY, 7, 'hull');
  for (const s of [-1, 1]) {
    // трап с причала на палубу
    for (let i = 0; i < 5; i++) box(s * 8, 0, 11.6 + i * 0.6, 2, 0.44 * (i + 1), 0.6, 'gangway');
    box(s * 8 - 1.15, 0, 13.2, 0.1, 3, 1.7, 'none', { pass: true }); box(s * 8 + 1.15, 0, 13.2, 0.1, 3, 1.7, 'none', { pass: true });
    // лестница на крышу каюты (мостик)
    for (let i = 0; i < 6; i++) box(s * 5.95, DY, 15.0 + i * 0.55, 1.2, 0.48 * (i + 1), 0.55, 'steps');
  }
  // борта: невидимые стенки, чтобы не упасть в воду
  wall('x', -22, 22, 14.1, 0.2, 2.6, 'none', [{ c: -8, w: 2.2 }, { c: 8, w: 2.2 }], { base: DY, pass: true });
  box(0, DY, 20.95, 44, 2.6, 0.1, 'none', { pass: true });
  for (const s of [-1, 1]) box(s * 21.9, DY, 17.5, 0.2, 2.6, 7, 'none', { pass: true });
  K.deco.push({ rail: true, x: 0, z: 14.15, w: 44, y: DY }, { rail: true, x: 0, z: 20.9, w: 44, y: DY });
  // каюта на палубе: дверь к причалу, окна по бокам
  const cz0 = 15.6, cz1 = 20.2, ch = 2.6;
  wall('x', -5, 5, cz0, 0.3, ch, 'shipwall', [{ c: 0, w: 1.6, top: 2.1 }, { c: -3, w: 1.4, bot: 1.0, top: 1.9 }, { c: 3, w: 1.4, bot: 1.0, top: 1.9 }], { base: DY });
  wall('x', -5, 5, cz1, 0.3, ch, 'shipwall', [{ c: 0, w: 1.6, bot: 1.0, top: 1.9 }], { base: DY });
  wall('z', cz0 + 0.15, cz1 - 0.15, -5, 0.3, ch, 'shipwall', [{ c: 17.9, w: 1.4, bot: 1.0, top: 1.9 }], { base: DY });
  wall('z', cz0 + 0.15, cz1 - 0.15, 5, 0.3, ch, 'shipwall', [{ c: 17.9, w: 1.4, bot: 1.0, top: 1.9 }], { base: DY });
  const RY = DY + ch;
  box(0, RY, (cz0 + cz1) / 2, 10.6, 0.3, 4.9, 'deckroof');
  K.floors.push({ x: 0, z: (cz0 + cz1) / 2, w: 9.6, d: 4.2, tex: 'parquet', k: 2, y: DY + 0.01 });
  box(-3.6, DY, 19.4, 1.8, 0.9, 1, 'furn', { model: 'furn/bedSingle', rot: PI / 2 });
  box(2.6, DY, 18.6, 1.4, 0.8, 1, 'furn', { model: 'furn/table' });
  K.lights.push({ x: 0, y: DY + 2.3, z: 17.9, color: '#ffe0a0', i: 2.5, d: 8 });
  // мостик-рубка на крыше каюты — место для снайпера
  const BY = RY + 0.3;
  wall('x', -3, 3, 16.6, 0.25, 1.9, 'shipwall', [{ c: 0, w: 4, bot: 0.9, top: 1.65 }], { base: BY });
  wall('x', -3, 3, 19.4, 0.25, 1.9, 'shipwall', [{ c: 0, w: 3, bot: 0.9, top: 1.65 }], { base: BY });
  for (const s of [-1, 1]) wall('z', 16.7, 19.3, s * 3, 0.25, 1.9, 'shipwall', [{ c: 18, w: 1.2, top: 1.75 }], { base: BY });
  box(0, BY + 1.9, 18, 6.6, 0.2, 3.2, 'deckroof');
  dec('st/computer', 0, 17.2, { y: BY, h: 0.9 });
  box(0, BY + 2.1, 18.6, 0.5, 2.5, 0.5, 'mast');
  // --- кран в центре: кабина наверху, лестница к ней ---
  for (const x of [-4, 4]) for (const z of [-15, -5]) box(x, 0, z, 0.9, 10, 0.9, 'crane');
  for (const z of [-15, -5]) box(0, 9.4, z, 9.8, 0.7, 0.7, 'crane');
  box(0, 9.4, -10, 0.7, 0.7, 10, 'crane');
  const PY = 7;
  box(0, PY - 0.4, -10, 4, 0.4, 4, 'catwalk');
  for (let i = 0; i < 15; i++) box(0, 0, -0.6 - i * 0.5 - 0.25, 1.6, (PY / 15) * (i + 1), 0.5, 'stairs');
  wall('x', -2, 2, -11.9, 0.2, 2.2, 'cabin', [{ c: 0, w: 3.2, bot: 0.9, top: 1.9 }], { base: PY });
  wall('x', -2, 2, -8.1, 0.2, 2.2, 'cabin', [{ c: 0, w: 1.2, top: 2 }], { base: PY });
  for (const s of [-1, 1]) wall('z', -11.8, -8.2, s * 1.9, 0.2, 2.2, 'cabin', [{ c: -10, w: 2.4, bot: 0.9, top: 1.9 }], { base: PY });
  box(0, PY + 2.2, -10, 4.4, 0.2, 4.4, 'deckroof');
  K.lights.push({ x: 0, y: PY + 1.9, z: -10, color: '#ffb35c', i: 2, d: 7 });
  // висящий контейнер на кране (только вид)
  K.deco.push({ hang: true, x: 0, z: -13.6, y: 8.4 });
  // --- контейнеры в два яруса и укрытия ---
  const cont = ['in/shipping-container-a', 'in/shipping-container-b', 'in/shipping-container-c'];
  for (const s of [-1, 1]) {
    // большая стопка: на первый ярус — лестница с края, на второй — лестница по крыше первого
    box(s * 14, 0, -15, 6.1, 2.6, 2.8, 'container', { model: cont[0], rot: PI / 2 });
    box(s * 12.5, 2.6, -15, 3.05, 2.6, 2.8, 'container', { model: cont[1], rot: PI / 2 });
    for (let i = 0; i < 6; i++) box(s * (17.05 + 0.25 + (5 - i) * 0.5), 0, -15, 0.5, 0.433 * (i + 1), 2.6, 'stairs');
    for (let i = 0; i < 6; i++) box(s * (14.05 + 0.25 + (5 - i) * 0.45), 2.6, -15, 0.45, 0.433 * (i + 1), 2.4, 'stairs');
    // стопка у воды
    box(s * 22, 0, 4, 2.8, 2.6, 6.1, 'container', { model: cont[2], rot: 0 });
    box(s * 22, 2.6, 5.5, 2.8, 2.6, 3.05, 'container', { model: cont[0], rot: 0 });
    for (let i = 0; i < 6; i++) box(s * 22, 0, 0.95 - 0.25 - (5 - i) * 0.5, 2.6, 0.433 * (i + 1), 0.5, 'stairs');
    for (let i = 0; i < 6; i++) box(s * 22, 2.6, 3.95 - 0.25 - (5 - i) * 0.4 + 0.0, 2.4, 0.433 * (i + 1), 0.4, 'stairs');
    // укрытия в середине
    box(s * 9, 0, 3, 6.1, 2.6, 2.8, 'container', { model: cont[1], rot: PI / 2 });
    box(s * 6.5, 0, -4.5, 2.8, 2.6, 6.1, 'container', { model: cont[2], rot: 0 });
    box(s * 16, 0, -3, 1.2, 1.1, 1.2, 'crate'); box(s * 16, 0, -1.8, 1.2, 1.1, 1.2, 'crate'); box(s * 16, 1.1, -2.4, 1.2, 1.1, 1.2, 'crate');
    box(s * 12, 0, 9, 1.2, 1.1, 2.4, 'crate'); box(s * 27, 0, -16, 1.2, 1.1, 1.2, 'crate'); box(s * 27, 0, 15.5 - 6, 1.2, 1.1, 1.2, 'crate');
    box(s * 30, 0, -17, 2, 2.2, 3, 'tank', { model: 'in/detail-tank', rot: PI / 2 });
    // фонари вдоль причала
    for (const x of [13, 26]) { box(s * x, 0, 11.3, 0.3, 3, 0.3, 'none'); dec('grave/lightpost-double', s * x, 11.3, { h: 3.8 }); K.lights.push({ x: s * x, y: 3.6, z: 11.3, color: '#ffb35c', i: 2.4, d: 13, lamp: 1 }); }
  }
  // погрузчики катаются между стопками
  const movers = [
    { type: 'ping', axis: 'z', c: -18.5, a: -11, b: 9, speed: 3, len: 3.4, wid: 2.2, h: 2.4, model: 'ca/tractor-shovel', dmg: 15 },
    { type: 'ping', axis: 'z', c: 18.5, a: 9, b: -11, speed: 3, len: 3.4, wid: 2.2, h: 2.4, model: 'ca/tractor-shovel', dmg: 15 }
  ];
  for (const m of movers) m.box = box(0, 0, 0, 1, m.h, 1, 'mover', { dyn: 'mover' });
  return {
    id: 'port', name: 'Порт ночью', W, D, WH: 14, boxes: K.B, gates: K.gates, movers, deco: K.deco, floors: K.floors, lights: K.lights,
    spawnsTeam: teamSpawns(32), spawnsFFA: ffa([[-31, -15], [31, 15 - 6], [-31, 9], [31, -9], [-12, -8], [12, -8], [-12, 7], [12, 7], [0, 2], [0, -18], [-25, 0], [25, 0], [-12, -19], [12, -19]]),
    flags: [{ team: 0, x: -31, z: 0 }, { team: 1, x: 31, z: 0 }],
    monsterSpawns: [[-30, -18], [30, -18], [-30, 9], [30, 9], [0, 4], [-12, -19], [12, -19]].map(([x, z]) => ({ x, z })),
    theme: 'port'
  };
}

// ================= ЗАМОК =================
// две половины через ров с подъёмными мостами; в центре тронный зал на втором этаже,
// под ним — подземелье с маятниками; башни по краям, по стенам можно ходить
export function castle() {
  const K = kit(), { box, wall, dec } = K;
  const W = 34, D = 24;
  box(0, -1, 0, W * 2 + 2, 1, D * 2 + 2, 'floor');
  K.floors.push({ x: 0, z: 0, w: 64, d: 44, tex: 'cobble', k: 3 });
  K.floors.push({ x: 0, z: 0, w: 6, d: 43, tex: 'water', k: 4, y: 0.012 });
  for (const s of [-1, 1]) {
    box(0, 0, s * 22.75, 68, 4.5, 2.5, 'stonewall');
    for (let x = -28; x <= 28; x += 2) box(x, 4.5, s * 23.65, 1.1, 1.1, 0.7, 'merlon');
    box(s * 32.75, 0, 0, 2.5, 6.5, 43, 'stonewall');
    for (const x of [-31, 31]) box(x, 0, s * 21.5, 5, 9, 5, 'tower');
    for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) box(sx * (10.3 + i * 0.6), 0, s * 20.5, 0.6, 0.45 * (i + 1), 2, 'stairs');
  }
  // --- ров и два подъёмных моста (открываются по очереди) ---
  for (const sx of [-1, 1]) {
    wall('z', -21.5, -7.4, sx * 3, 0.3, 3, 'none', [{ c: -14, w: 4 }], { pass: true });
    wall('z', 7.4, 21.5, sx * 3, 0.3, 3, 'none', [{ c: 14, w: 4 }], { pass: true });
  }
  for (const bz of [-14, 14]) {
    K.floors.push({ x: 0, z: bz, w: 6.4, d: 4, tex: 'wood', k: 1.5, y: 0.02 });
    box(0, 0, bz - 2.1, 6, 3, 0.2, 'none', { pass: true }); box(0, 0, bz + 2.1, 6, 3, 0.2, 'none', { pass: true });
    K.deco.push({ rail: true, x: 0, z: bz - 2, w: 6, y: 0 }, { rail: true, x: 0, z: bz + 2, w: 6, y: 0 });
    for (const sx of [-1, 1]) K.gates.push({ box: box(sx * 3.25, 0, bz, 0.4, 3.2, 4, 'drawbridge', { dyn: 'gate' }), period: 24, openFor: 15, lift: -3.25, off: bz < 0 ? 0 : 12 });
  }
  // --- центр: подземелье внизу ---
  const HX = 8, HZ = 7, DH = 2.6;
  wall('x', -HX - 0.4, HX + 0.4, -HZ, 0.8, DH, 'stonewall');
  wall('x', -HX - 0.4, HX + 0.4, HZ, 0.8, DH, 'stonewall');
  for (const sx of [-1, 1]) wall('z', -HZ + 0.4, HZ - 0.4, sx * HX, 0.8, DH, 'stonewall', [{ c: 0, w: 2.4, top: 2.2 }]);
  for (const sz of [-1, 1]) wall('x', -HX + 0.4, HX - 0.4, sz * 2, 0.3, DH, 'bars', [], { pass: true });
  K.floors.push({ x: 0, z: 0, w: 2 * HX, d: 2 * HZ, tex: 'flagstone', k: 1.5, y: 0.02 });
  for (const sx of [-1, 1]) {
    K.gates.push({ box: box(sx * HX, 0, 0, 0.3, 2.2, 2.4, 'portcullis', { dyn: 'gate' }), period: 20, openFor: 14, lift: 2.0, off: sx < 0 ? 0 : 10 });
    for (const sz of [-1, 1]) dec('grave/coffin', sx * 4.5, sz * 4.6, { h: 0.7, r: PI / 2 });
    dec('grave/candle-multiple', sx * 6.5, 3.2, { h: 0.5 }); dec('grave/candle-multiple', sx * 2, -4.5, { h: 0.5 });
    K.lights.push({ x: sx * 4, y: 2.2, z: 0, color: '#ff9a3d', i: 3, d: 7, flicker: 1 });
  }
  const movers = [-1, 1].map((sx, i) => ({ type: 'swing', axis: 'z', x: sx * 2, z: 0, amp: 1.25, period: 3, off: i * 1.5, wid: 1.0, len: 0.3, y: 0.15, h: 1.9, pivot: 2.5, dmg: 30, knock: 10, blade: true }));
  for (const m of movers) m.box = box(0, 0, 0, 1, m.h, 1, 'blade', { dyn: 'mover', solid: false });
  // --- тронный зал наверху ---
  const FY = 3;
  box(0, DH, 0, 2 * HX + 0.8, 0.4, 2 * HZ + 0.8, 'hallfloor');
  wall('x', -HX - 0.4, HX + 0.4, -HZ, 0.8, 4.5, 'hallwall', [{ c: -4, w: 2.4, bot: 1, top: 2.8 }, { c: 4, w: 2.4, bot: 1, top: 2.8 }], { base: FY });
  wall('x', -HX - 0.4, HX + 0.4, HZ, 0.8, 4.5, 'hallwall', [{ c: -4, w: 2.4, bot: 1, top: 2.8 }, { c: 4, w: 2.4, bot: 1, top: 2.8 }], { base: FY });
  for (const sx of [-1, 1]) wall('z', -HZ + 0.4, HZ - 0.4, sx * HX, 0.8, 4.5, 'hallwall', [{ c: -4.5, w: 2.2, top: 2.9 }], { base: FY });
  box(0, FY + 4.5, 0, 2 * HX + 1.6, 0.5, 2 * HZ + 1.6, 'roofslab', { roof: 'tiles', ridge: 'x', rh: 3 });
  K.floors.push({ x: 0, z: 0, w: 2 * HX - 0.8, d: 2 * HZ - 0.8, tex: 'flagstone', k: 2, y: FY + 0.01 }, { x: 0, z: 0, w: 2, d: 2 * HZ - 1.4, tex: 'carpet', k: 2, y: FY + 0.02 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 4.6, FY, sz * 3.6, 0.9, 4.5, 0.9, 'column');
  box(0, FY, 0, 4.6, 0.85, 1.3, 'table'); dec('arena/trophy', 0, 0, { y: FY + 0.85, h: 0.7 });
  box(0, FY, 5.3, 3, 0.4, 1.4, 'pedestal'); dec('furn/chair', 0, 5.4, { y: FY + 0.4, h: 2, r: PI });
  for (const sx of [-1, 1]) { dec('arena/banner', sx * 2.5, -HZ + 0.5, { h: 3.4, y: FY + 0.6 }); dec('arena/banner', sx * 2.5, HZ - 0.5, { h: 3.4, y: FY + 0.6, r: PI }); }
  // лестницы к дверям зала снаружи
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) box(sx * (HX + 0.4 + 0.275 + (6 - i) * 0.55), 0, -4.5, 0.55, FY / 7 * (i + 1), 2.2, 'stairs');
  // --- половины замка ---
  for (const s of [-1, 1]) {
    box(s * 24.5, 0, -6.5, 0.9, 1.3, 4, 'lowwall'); box(s * 24.5, 0, 6.5, 0.9, 1.3, 4, 'lowwall');
    box(s * 27.4, 0, -9.2, 4.6, 1.3, 0.9, 'lowwall'); box(s * 27.4, 0, 9.2, 4.6, 1.3, 0.9, 'lowwall');
    dec('arena/banner', s * 31.4, -4, { h: 3.6, y: 1.6, r: -s * PI / 2 }); dec('arena/banner', s * 31.4, 4, { h: 3.6, y: 1.6, r: -s * PI / 2 });
    dec('arena/weapon-rack', s * 31, -7.5, { h: 1.7, r: -s * PI / 2 });
    // смотровая башня с лестницей — место для снайпера
    box(s * 18, 0, -15, 4, 4.5, 4, 'tower2');
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(s * 18 + dx, 4.5, -15 + dz, 0.8, 1.1, 0.8, 'merlon');
    for (let i = 0; i < 10; i++) box(s * 18, 0, -13 + 0.25 + (9 - i) * 0.5, 1.6, 0.45 * (i + 1), 0.5, 'stairs');
    // укрытия
    box(s * 14.5, 0, 3.5, 1.5, 3, 1.5, 'none'); dec('arena/statue', s * 14.5, 3.5, { h: 3.4, r: -s * PI / 2 });
    box(s * 12, 0, -9, 2.4, 1.0, 2.4, 'well');
    box(s * 15, 0, 11, 2.4, 1.3, 1.3, 'hay', { model: 'grave/hay-bale-bundled' });
    box(s * 16.8, 0, 12.8, 1.3, 1.1, 1.3, 'hay', { model: 'grave/hay-bale' });
    box(s * 8.5, 0, 16, 5, 2.2, 0.8, 'ruin'); box(s * 10.6, 0, 14.3, 0.8, 2.2, 2.6, 'ruin');
    box(s * 21, 0, -3, 1.2, 1.1, 1.2, 'crate'); box(s * 21, 0, -1.8, 1.2, 1.1, 1.2, 'crate'); box(s * 21, 1.1, -2.4, 1.2, 1.1, 1.2, 'crate');
    box(s * 20, 0, 4.5, 1.2, 1.1, 2.4, 'crate');
    box(s * 25, 0, -16, 0.6, 3, 0.6, 'none'); dec('arena/tree', s * 25, -16, { h: 5.5 });
    box(s * 25, 0, 16, 0.6, 3, 0.6, 'none'); dec('arena/tree', s * 25, 16, { h: 5 });
    dec('arena/column-damaged', s * 7, -18, { h: 2.6 }); box(s * 7, 0, -18, 1, 2.4, 1, 'none');
  }
  return {
    id: 'castle', name: 'Замок', W, D, WH: 12, boxes: K.B, gates: K.gates, movers, deco: K.deco, floors: K.floors, lights: K.lights,
    spawnsTeam: teamSpawns(28), spawnsFFA: ffa([[-28, -15], [28, 15], [-28, 15], [28, -15], [-15, -6], [15, 6], [-15, 6], [15, -6], [-21, 10], [21, -10], [-6, -14], [6, 14], [0, 0], [-22, -19], [22, 19]]),
    flags: [{ team: 0, x: -28, z: 0 }, { team: 1, x: 28, z: 0 }],
    monsterSpawns: [[-28, -18], [28, -18], [-28, 18], [28, 18], [-10, -18], [10, 18]].map(([x, z]) => ({ x, z })),
    theme: 'castle'
  };
}

// ================= НОЧНОЕ КЛАДБИЩЕ =================
export function graveyard() {
  const K = kit(), { box, wall, dec } = K;
  const W = 30, D = 22;
  box(0, -1, 0, W * 2 + 2, 1, D * 2 + 2, 'floor');
  for (const s of [-1, 1]) {
    box(0, 0, s * 21.5, 60, 2.8, 1, 'gravewall');
    box(s * 29.5, 0, 0, 1, 2.8, 42, 'gravewall');
    for (let x = -24; x <= 24; x += 8) box(x, 0, s * 21.4, 1.3, 3.3, 1.3, 'gpost');
  }
  // дорожки
  K.floors.push({ x: 0, z: 0, w: 56, d: 3, tex: 'dirt', k: 3 }, { x: 0, z: 0, w: 3, d: 40, tex: 'dirt', k: 3 }, { x: -15, z: -6, w: 3, d: 6, tex: 'dirt', k: 3 }, { x: 15, z: -6, w: 3, d: 6, tex: 'dirt', k: 3 });
  // алтарь на возвышении
  box(0, 0, 0, 9, 1.2, 9, 'plat');
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const al = dz !== 0;
    box(dx * 4.8, 0, dz * 4.8, al ? 3 : 0.6, 0.8, al ? 0.6 : 3, 'gstairs');
    box(dx * 5.4, 0, dz * 5.4, al ? 3 : 0.6, 0.4, al ? 0.6 : 3, 'gstairs');
  }
  box(0, 1.2, 0, 2.4, 1.0, 1.3, 'altar', { model: 'grave/altar-stone' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 3.4, 1.2, sz * 3.4, 0.8, 2.6, 0.8, 'gpost');
  dec('grave/candle-multiple', -0.7, 0, { y: 2.2, h: 0.45 }); dec('grave/candle-multiple', 0.7, 0, { y: 2.2, h: 0.45 });
  K.lights.push({ x: 0, y: 3.4, z: 0, color: '#b07bff', i: 7, d: 16, flicker: 1 });
  // склепы, в которые можно зайти; на входе решётки опускаются в землю
  for (const s of [-1, 1]) {
    const cx = s * 15, z0 = -15, z1 = -9, hw = 3.5, H = 3.4;
    wall('x', cx - hw, cx + hw, z1, 0.6, H, 'crypt', [{ c: cx, w: 2.4, top: 2.6 }]);
    wall('x', cx - hw, cx + hw, z0, 0.6, H, 'crypt', [{ c: cx + s * 1.8, w: 1.4, top: 2.4 }]);
    wall('z', z0 + 0.3, z1 - 0.3, cx - hw, 0.6, H, 'crypt', [{ c: -12, w: 1.4, bot: 1.2, top: 2.2 }]);
    wall('z', z0 + 0.3, z1 - 0.3, cx + hw, 0.6, H, 'crypt', [{ c: -12, w: 1.4, bot: 1.2, top: 2.2 }]);
    box(cx, H, -12, 2 * hw + 0.6, 0.4, 6.6, 'cryptroof', { roof: 'slate', ridge: 'z', rh: 1.6 });
    K.gates.push({ box: box(cx, 0, z1, 2.4, 2.6, 0.2, 'bars', { dyn: 'gate' }), period: 24, openFor: 16, lift: -2.65, off: s > 0 ? 0 : 12 });
    box(cx - s * 1.2, 0, -13.2, 1.0, 0.75, 2.2, 'coffin', { model: 'grave/coffin', rot: 0 });
    dec('grave/candle-multiple', cx + s * 1.6, -14, { h: 0.5 }); dec('grave/urn-round', cx - s * 2.6, -10, { h: 0.7 });
    K.floors.push({ x: cx, z: -12, w: 2 * hw - 0.6, d: 5.4, tex: 'flagstone', k: 1.5 });
    K.lights.push({ x: cx, y: 2.6, z: -12, color: '#ffae4a', i: 3, d: 8, flicker: 1 });
    dec('grave/cross-column', cx, z1 + 0.6, { y: H + 0.4, h: 1.1 });
  }
  // часовня с колокольней: в колокольню снаружи ведёт лестница, наверху — открытая звонница
  const TX = 1.8, TZ0 = 9.2, TZ1 = 12.8, TB = 5.3;
  wall('x', -TX, TX, TZ0, 0.4, TB, 'gravewall', [{ c: 0, w: 1.4, top: 2.4 }]);
  for (const sx of [-1, 1]) wall('z', TZ0 + 0.2, TZ1, sx * TX, 0.4, TB, 'gravewall');
  box(0, TB - 0.3, (TZ0 + TZ1) / 2, 2 * TX + 0.4, 0.3, TZ1 - TZ0 + 0.4, 'gpost');
  for (const sx of [-1, 1]) for (const z of [TZ0, TZ1]) box(sx * TX, TB, z, 0.5, 2.8, 0.5, 'gpost');
  box(0, TB + 2.8, (TZ0 + TZ1) / 2, 2 * TX + 0.8, 0.3, TZ1 - TZ0 + 0.8, 'cryptroof', { roof: 'slate', ridge: 'z', rh: 2.4 });
  K.deco.push({ bell: true, x: 0, z: (TZ0 + TZ1) / 2, y: TB + 2.75 });
  for (let i = 0; i < 12; i++) box(TX + 0.2 + 0.15 + (11 - i) * 0.3, 0, (TZ0 + TZ1) / 2, 0.3, (TB / 12) * (i + 1), 1.6, 'gstairs');
  // зал часовни: двери из колокольни, окна по бокам, скамьи и алтарь
  const CZ1 = 19.5;
  wall('x', -4.6, -TX, TZ1, 0.4, 4.2, 'gravewall'); wall('x', TX, 4.6, TZ1, 0.4, 4.2, 'gravewall');
  wall('x', -4.6, 4.6, CZ1, 0.4, 4.2, 'gravewall');
  for (const sx of [-1, 1]) wall('z', TZ1 + 0.2, CZ1 - 0.2, sx * 4.4, 0.4, 4.2, 'gravewall', [{ c: 15, w: 1.2, bot: 1.2, top: 2.6 }, { c: 17.6, w: 1.2, bot: 1.2, top: 2.6 }]);
  box(0, 4.2, (TZ1 + CZ1) / 2, 9.6, 0.3, CZ1 - TZ1 + 0.4, 'cryptroof', { roof: 'slate', ridge: 'z', rh: 2 });
  K.floors.push({ x: 0, z: (TZ0 + CZ1) / 2, w: 8.4, d: CZ1 - TZ0, tex: 'flagstone', k: 1.5, y: 0.02 });
  for (const sx of [-1, 1]) for (const z of [15, 16.8]) box(sx * 2.2, 0, z, 1.8, 0.6, 0.6, 'bench', { model: 'grave/bench', rot: PI });
  box(0, 0, 18.6, 2.2, 1.0, 1, 'altar', { model: 'grave/altar-stone' });
  dec('grave/candle-multiple', -0.7, 18.6, { y: 1.0, h: 0.45 }); dec('grave/candle-multiple', 0.7, 18.6, { y: 1.0, h: 0.45 });
  K.lights.push({ x: 0, y: 3.2, z: 17, color: '#ffae4a', i: 3, d: 9, flicker: 1 });
  // могилы — за ними прячутся и из них встают скелеты
  const stones = ['grave/gravestone-cross', 'grave/gravestone-round', 'grave/gravestone-bevel', 'grave/gravestone-decorative', 'grave/gravestone-wide', 'grave/gravestone-broken'];
  let si = 0; const graves = [];
  const stone = (x, z, r = 0) => {
    const m = stones[si++ % stones.length];
    box(x, 0, z, 0.9, m.includes('wide') ? 0.9 : 1.15, 0.32, 'stone', { model: m, rot: r });
    K.floors.push({ x, z: z + (r ? -0.95 : 0.95), w: 0.9, d: 1.5, tex: 'mound', k: 1, y: 0.02 });
    graves.push({ x, z: z + (r ? -1.3 : 1.3) });
  };
  for (const s of [-1, 1]) {
    for (const z of [7.5, 10.5, 13.5]) for (const x of [6.5, 9, 11.5]) stone(s * x, z);
    for (const z of [-6.5, -3.5, 3.5, 6.5]) for (const x of [18.5, 21]) stone(s * x, z, z < 0 ? PI : 0);
    box(s * 9, 0, 5.2, 7.5, 1.3, 0.12, 'ironfence', { pass: true });
    box(s * 13.2, 0, 10.3, 0.12, 1.3, 9.8, 'ironfence', { pass: true });
    // база команды
    box(s * 23.5, 0, -8, 1.2, 2.6, 1.2, 'gpost'); box(s * 23.5, 0, 8, 1.2, 2.6, 1.2, 'gpost');
    box(s * 23.5, 0, -10.5, 0.8, 1.6, 4, 'gravewall'); box(s * 23.5, 0, 10.5, 0.8, 1.6, 4, 'gravewall');
    // деревья, фонари, тыквы, скамейки
    for (const [x, z] of [[24, -16], [6, -17], [24, 16], [16, 17.5]]) { box(s * x, 0, s * z, 0.5, 3, 0.5, 'none'); dec('grave/pine-crooked', s * x, s * z, { h: 5.5, r: s }); }
    for (const [x, z] of [[8, -4.3], [22, 10]]) { box(s * x, 0, s * z, 0.3, 3, 0.3, 'none'); dec('grave/lightpost-single', s * x, s * z, { h: 3.2, r: s > 0 ? PI : 0 }); K.lights.push({ x: s * x, y: 3, z: s * z, color: '#ffcf7a', i: 2.4, d: 11, lamp: 1 }); }
    for (const [x, z] of [[5, 6.2], [12.6, 15], [20, -9], [3.5, -9]]) dec('grave/pumpkin-carved', s * x, s * z, { h: 0.55, r: s * 2 });
    box(s * 8.5, 0, -2.4, 1.8, 0.6, 0.6, 'bench', { model: 'grave/bench', rot: s > 0 ? PI : 0 });
    dec('grave/rocks', s * 26, -18, { h: 0.8 }); dec('grave/debris', s * 10, 17, { h: 0.4 }); dec('grave/shovel', s * 12.2, 7.6, { h: 1.2, r: 0.3 });
  }
  // елки за оградой — силуэт на фоне неба
  for (let x = -34; x <= 34; x += 5) for (const s of [-1, 1]) dec('grave/pine', x + (s > 0 ? 2 : 0), s * 24.5, { h: 7 + ((x * 7) % 3) });
  for (let z = -20; z <= 20; z += 6) for (const s of [-1, 1]) dec('grave/pine', s * 33, z, { h: 7 });
  return {
    id: 'graveyard', name: 'Ночное кладбище', W, D, WH: 12, boxes: K.B, gates: K.gates, movers: [], deco: K.deco, floors: K.floors, lights: K.lights,
    spawnsTeam: teamSpawns(26), spawnsFFA: ffa([[-25, -15], [25, 15], [-25, 15], [25, -15], [-15.5, -11], [15.5, -11], [-8, 1.5], [8, -1.5], [0, -12], [0, 10], [-14, 0], [14, 2], [-5, -17], [5, 18.5]]),
    flags: [{ team: 0, x: -26, z: 0 }, { team: 1, x: 26, z: 0 }],
    monsterSpawns: [[-25, -17], [25, -17], [-25, 17], [25, 17], [0, -18], [-12, 18], [12, 18]].map(([x, z]) => ({ x, z })),
    hazard: { type: 'skeleton', every: 14, max: 3, spawns: graves },
    theme: 'graveyard'
  };
}

// ================= ГОРОДСКАЯ УЛИЦА =================
export function street() {
  const K = kit(), { box, wall, dec } = K;
  const W = 34, D = 20;
  box(0, -1, 0, W * 2 + 2, 1, D * 2 + 2, 'floor');
  for (const s of [-1, 1]) {
    box(0, 0, s * 5, 68, 0.15, 2, 'sidewalk');
    box(0, 0, s * 19.6, 70, 3.2, 0.8, 'brickwall');
    box(s * 33.6, 0, 0, 0.8, 2.2, 38.4, 'barrier');
    K.floors.push({ x: 0, z: s * 16.8, w: 68, d: 5.6, tex: 'grass', k: 3 });
  }
  // разметка
  for (let x = -30; x <= 30; x += 4) K.floors.push({ x, z: 0, w: 2, d: 0.18, tex: 'paint', k: 1 });
  for (const s of [-1, 1]) K.floors.push({ x: 0, z: s * 3.85, w: 68, d: 0.12, tex: 'paint', k: 1 });
  const house = (cx, s, kind) => {
    const zf = s * 6.6, zb = s * 14.4, hw = 4.5, H = 3.6, t = 0.35, zc = s * 10.5;
    const zmin = Math.min(zf, zb), zmax = Math.max(zf, zb);
    if (kind === 'solid') {
      box(cx, 0, zc, 9, 6.6, 7.8, 'facade', { roof: 'tiles', ridge: 'x', rh: 2.2 });
      return;
    }
    const sideWin = [{ c: zc, w: 1.8, bot: 1.0, top: 2.2 }];
    if (kind === 'house') {
      wall('x', cx - hw, cx + hw, zf, t, H, 'plaster', [{ c: cx - s * 2, w: 1.5, top: 2.4 }, { c: cx + s * 2, w: 1.8, bot: 1.0, top: 2.2 }]);
      wall('x', cx - hw, cx + hw, zb, t, H, 'plaster', [{ c: cx + s * 2, w: 1.5, top: 2.4 }, { c: cx - s * 2, w: 1.8, bot: 1.0, top: 2.2 }]);
      box(cx + s * 2.8, 0, zc + s * 1.6, 2.2, 0.85, 0.9, 'furn', { model: 'furn/loungeSofa', rot: s > 0 ? PI : 0 });
      box(cx - s * 0.6, 0, zc - s * 0.6, 1.6, 0.75, 1.0, 'furn', { model: 'furn/table' });
      box(cx - s * 3.9, 0, zc + s * 2.2, 0.5, 2.0, 1.4, 'furn', { model: 'furn/bookcaseClosedWide', rot: -s * PI / 2 });
      box(cx + s * 3.85, 0, zc - s * 2.6, 0.7, 1.9, 0.7, 'furn', { model: 'furn/kitchenFridge', rot: s * PI / 2 });
      dec('furn/rugRectangle', cx - s * 0.6, zc - s * 0.6, { h: 0.02, s: 2.2 });
      dec('furn/lampRoundFloor', cx - s * 3.8, zc - s * 2.8, { h: 1.6 });
    } else { // магазин с рольставней
      wall('x', cx - hw, cx + hw, zf, t, H, 'shopwall', [{ c: cx, w: 4.4, top: 2.8 }]);
      wall('x', cx - hw, cx + hw, zb, t, H, 'shopwall', [{ c: cx - s * 2.5, w: 1.5, top: 2.4 }]);
      K.gates.push({ box: box(cx, 0, zf, 4.4, 2.8, 0.2, 'shutter', { dyn: 'gate' }), period: 24, openFor: 14, lift: 2.4, roll: true, off: s > 0 ? 0 : 12 });
      box(cx + s * 1.5, 0, zc + s * 1, 3.5, 1.1, 0.8, 'counter');
      box(cx - s * 3.9, 0, zc, 0.5, 2.0, 3, 'furn', { model: 'furn/bookcaseOpen', rot: -s * PI / 2 });
      box(cx + s * 3.6, 0, zc - s * 2.4, 1.0, 1.0, 1.0, 'furn', { model: 'furn/cardboardBoxClosed' });
      box(cx + s * 3.6, 1.0, zc - s * 2.4, 0.8, 0.8, 0.8, 'furn', { model: 'furn/cardboardBoxClosed', rot: 0.3 });
      dec('furn/computerScreen', cx + s * 1.5, zc + s * 1, { y: 1.1, h: 0.5, r: s > 0 ? PI : 0 });
    }
    wall('z', zmin + t / 2, zmax - t / 2, cx - hw, t, H, kind === 'house' ? 'plaster' : 'shopwall', sideWin);
    wall('z', zmin + t / 2, zmax - t / 2, cx + hw, t, H, kind === 'house' ? 'plaster' : 'shopwall', sideWin);
    box(cx, H, zc, 9.4, 0.3, 8.2, 'ceil', { roof: kind === 'house' ? 'tiles' : 'flat', ridge: 'x', rh: 2 });
    K.floors.push({ x: cx, z: zc, w: 8.6, d: 7.4, tex: kind === 'house' ? 'parquet' : 'tiles', k: 2 });
  };
  // точечная симметрия: (x, z) ↔ (-x, -z), чтобы базам было честно
  house(-8, 1, 'house'); house(8, -1, 'house');
  house(-24, -1, 'house'); house(24, 1, 'house');
  house(8, 1, 'shop'); house(-8, -1, 'shop');
  house(-24, 1, 'solid'); house(24, -1, 'solid');
  for (const s of [-1, 1]) {
    // переулки и задние дворы
    box(s * 16, 0, s * 9, 2.2, 1.4, 1.3, 'dumpster'); box(s * 0.5, 0, s * 12, 1.2, 1.1, 1.2, 'crate'); box(s * -0.7, 0, s * 12.5, 1.2, 1.1, 1.2, 'crate'); box(s * 0, 1.1, s * 12.2, 1.2, 1.1, 1.2, 'crate');
    box(s * -16, 0, s * 12.5, 1.2, 1.1, 2.4, 'crate');
    box(s * 16, 0, s * 15.2, 0.15, 1.5, 3, 'woodfence'); box(s * -16, 0, s * 17.8, 0.15, 1.5, 2.8, 'woodfence');
    box(s * 0, 0, s * 17.8, 0.15, 1.5, 2.8, 'woodfence');
    box(s * -8, 0, s * 17.3, 4.6, 2.3, 2.1, 'car', { model: 'ca/van', rot: PI / 2 });
    box(s * 26, 0, s * 17.2, 4.3, 1.6, 2.0, 'car', { model: 'ca/hatchback-sports', rot: -PI / 2 });
    dec('furn/trashcan', s * 13.2, s * 8, { h: 0.9 }); dec('furn/trashcan', s * -2.8, s * 8.2, { h: 0.9 });
    // припаркованные машины — укрытия на дороге
    box(s * -18, 0, s * 3.3, 4.3, 1.6, 1.95, 'car', { model: 'ca/sedan', rot: PI / 2 });
    box(s * 4, 0, s * 3.3, 4.3, 1.7, 1.95, 'car', { model: 'ca/taxi', rot: -PI / 2 });
    box(s * 12, 0, s * 3.3, 4.4, 1.9, 2.0, 'car', { model: 'ca/suv', rot: PI / 2 });
    box(s * -27.5, 0, s * 2.2, 2.0, 1.7, 4.4, 'car', { model: 'ca/police', rot: 0.25 });
    for (const z of [-3.2, 3.6]) dec('ca/cone', s * -29.5, s * z, { h: 0.7 });
    // фонари
    for (const x of [-16, 0, 16]) { box(s * x, 0, s * 5.6, 0.25, 3, 0.25, 'none'); dec('grave/lightpost-single', s * x, s * 5.6, { h: 3.6, r: s > 0 ? 0 : PI }); }
    K.lights.push({ x: s * -16, y: 3.4, z: s * 5.2, color: '#ffd38a', i: 2.2, d: 12, lamp: 1 });
    box(s * -4.5, 0, s * 5.4, 1.8, 0.6, 0.6, 'bench', { model: 'grave/bench', rot: s > 0 ? PI : 0 });
  }
  K.lights.push({ x: 0, y: 3.4, z: 5.2, color: '#ffd38a', i: 2.2, d: 12, lamp: 1 });
  // машины, которые ездят по дороге
  const movers = [
    { type: 'ping', axis: 'x', c: -1.2, a: -22, b: 22, speed: 7, len: 4.6, wid: 2.1, h: 2.4, model: 'ca/delivery', dmg: 40, knock: 14, car: true },
    { type: 'ping', axis: 'x', c: 1.2, a: 22, b: -22, speed: 7, len: 5.2, wid: 2.2, h: 2.6, model: 'ca/garbage-truck', dmg: 40, knock: 14, car: true }
  ];
  for (const m of movers) m.box = box(0, 0, 0, 1, m.h, 1, 'mover', { dyn: 'mover' });
  return {
    id: 'street', name: 'Городская улица', W, D, WH: 12, boxes: K.B, gates: K.gates, movers, deco: K.deco, floors: K.floors, lights: K.lights,
    spawnsTeam: teamSpawns(31.3), spawnsFFA: ffa([[-31, -2], [31, 2], [-31, 10], [31, -10], [-30, 17], [30, -17], [-16, 17], [16, -17], [-16, 10], [16, -10], [-8, 10.5], [8, -10.5], [0, 10], [0, -10], [-24, -10.5], [24, 10.5]]),
    flags: [{ team: 0, x: -31, z: 0 }, { team: 1, x: 31, z: 0 }],
    monsterSpawns: [[-30, -17], [30, -17], [-30, 17], [30, 17], [0, 17], [0, -17], [-16, 17], [16, -17]].map(([x, z]) => ({ x, z })),
    theme: 'street'
  };
}
