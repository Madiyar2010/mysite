// Карты шутера: прямоугольные блоки (коллизия + вид), физика игрока, лучи, сетка для ботов.
import { port, castle, graveyard, street, arena } from './levels.js';
export const PH = { R: 0.35, H: 1.7, EYE: 1.55, CEYE: 1.0, STEP: 0.5, G: 24, JUMP: 8.4, SPEED: 6, AIR: 14, ACC: 60 };

// ---------- построение склада ----------
function warehouse() {
  const B = [];
  // box: центр x,z; низ y; размеры w(x),h(y),d(z)
  const box = (x, y, z, w, h, d, vis, extra = {}) => { const b = { x, y, z, w, h, d, vis, ...extra }; B.push(b); return b; };
  const mirror = fn => { fn(1); fn(-1); };
  const W = 32, D = 20, WH = 9;
  // стены и пол
  box(0, -1, 0, W * 2 + 2, 1, D * 2 + 2, 'floor');
  box(0, 0, -D - 0.5, W * 2 + 2, WH, 1, 'wall'); box(0, 0, D + 0.5, W * 2 + 2, WH, 1, 'wall');
  box(-W - 0.5, 0, 0, 1, WH, D * 2, 'wall'); box(W + 0.5, 0, 0, 1, WH, D * 2, 'wall');
  // перегородка с воротами посередине и проходами у стен
  box(0, 0, -9.5, 0.8, 5, 11, 'divider'); box(0, 0, 9.5, 0.8, 5, 11, 'divider');
  const gate = box(0, 0, 0, 0.6, 5, 8, 'gate', { dyn: 'gate' });
  const gates = [{ box: gate, period: 30, openFor: 20, lift: 4.6, off: 0 }];
  // северный мостик над проходом, лестницы на него
  box(0, 2.8, -18.4, 49, 0.25, 3, 'catwalk');
  for (let x = -24; x <= 24; x += 8) box(x, 0, -17.2, 0.3, 2.8, 0.3, 'pillar');
  mirror(s => {
    // лестница вдоль стены к мостику
    for (let i = 0; i < 7; i++) box(s * (28.6 - i * 0.62), 0, -18.4, 0.62, 0.4 * (i + 1), 3, 'stairs');
    // контейнеры
    box(s * 21, 0, 9, 2.8, 2.6, 6.1, 'container', { model: 'in/shipping-container-a', rot: 0 });
    box(s * 21, 2.6, 9, 2.8, 2.6, 6.1, 'container', { model: 'in/shipping-container-b', rot: 0 });
    box(s * 18.2, 0, 10, 2.8, 2.6, 6.1, 'container', { model: 'in/shipping-container-b', rot: 0 });
    for (let i = 0; i < 6; i++) box(s * 18.2, 0, 6.64 - (5 - i) * 0.62, 2.6, 0.43 * (i + 1), 0.62, 'stairs');
    box(s * 17.6, 2.6, 11.8, 1.2, 1.25, 1.2, 'crate'); box(s * 18.8, 2.6, 11.8, 1.2, 2.5, 1.2, 'crate');
    box(s * 18, 0, -6, 6.1, 2.6, 2.8, 'container', { model: 'in/shipping-container-a', rot: Math.PI / 2 });
    box(s * 24.5, 0, -11, 6.1, 2.6, 2.8, 'container', { model: 'in/shipping-container-b', rot: Math.PI / 2 });
    box(s * 8, 0, 14.5, 2.8, 2.6, 6.1, 'container', { model: 'in/shipping-container-a', rot: 0 });
    // ящики-укрытия
    box(s * 24, 0, 3, 1.2, 1.1, 1.2, 'crate'); box(s * 24, 0, -6.5, 1.2, 1.1, 2.4, 'crate'); box(s * 24, 1.1, -6.5, 1.2, 1.1, 1.2, 'crate');
    box(s * 5, 0, 7, 1.2, 1.1, 1.2, 'crate'); box(s * 5, 0, 8.2, 1.2, 1.1, 1.2, 'crate'); box(s * 5, 1.1, 7.6, 1.2, 1.1, 1.2, 'crate');
    box(s * 5, 0, -7, 1.2, 1.1, 2.4, 'crate'); box(s * 9, 0, -2, 1.2, 1.1, 1.2, 'crate'); box(s * 9, 0, 3, 2.4, 1.1, 1.2, 'crate');
    box(s * 16.5, 0, -14, 1.2, 1.1, 1.2, 'crate'); box(s * 17.7, 0, -14, 1.2, 1.1, 1.2, 'crate'); box(s * 17.1, 1.1, -14, 1.2, 1.1, 1.2, 'crate');
    // конвейер у южной стены и баки
    box(s * 14, 0, 18.4, 14, 0.85, 1.6, 'conveyor');
    box(s * 30.5, 0, 17.5, 2, 2.2, 3, 'tank', { model: 'in/detail-tank', rot: Math.PI / 2 });
    box(s * 4, 0, -14, 2, 1.6, 2, 'machine', { model: 'fa/machine-fortified', rot: 0 });
  });
  // погрузчики: ездят туда-сюда по своим дорожкам
  const movers = [
    { type: 'ping', axis: 'z', c: -13, a: -12, b: 12, speed: 3.2, len: 3.4, wid: 2.2, h: 2.4, model: 'ca/tractor-shovel', dmg: 15 },
    { type: 'ping', axis: 'z', c: 13, a: 12, b: -12, speed: 3.2, len: 3.4, wid: 2.2, h: 2.4, model: 'ca/tractor-shovel', dmg: 15 }
  ];
  for (const m of movers) m.box = box(0, 0, 0, 1, m.h, 1, 'mover', { dyn: 'mover' });
  const spawnsTeam = { 0: [], 1: [] };
  for (let i = 0; i < 6; i++) { spawnsTeam[0].push({ x: -29.5 + (i % 2) * 1.6, z: -5 + i * 2, yaw: -Math.PI / 2 }); spawnsTeam[1].push({ x: 29.5 - (i % 2) * 1.6, z: -5 + i * 2, yaw: Math.PI / 2 }); }
  const spawnsFFA = [[-28, -12], [28, 12], [-28, 12], [28, -12], [-12, 0], [12, 0], [2, -16], [-2, 16], [-20, -14], [20, 14], [-8, 10], [8, -10]].map(([x, z]) => ({ x, z, yaw: Math.atan2(x, z) }));
  const flags = [{ team: 0, x: -29, z: 0 }, { team: 1, x: 29, z: 0 }];
  const monsterSpawns = [[-30, -18], [30, -18], [-30, 18], [30, 18], [0, -17.5], [0, 17.5]].map(([x, z]) => ({ x, z }));
  return { id: 'warehouse', name: 'Склад', W, D, WH, boxes: B, gates, movers, spawnsTeam, spawnsFFA, flags, monsterSpawns, theme: 'warehouse' };
}

// ---------- динамика: ворота, техника и маятники зависят только от времени ----------
export function updateDynamics(map, t) {
  for (const g of map.gates || []) {
    const cyc = (t + g.off) % g.period, ramp = 1.2;
    const open = cyc < g.openFor ? Math.min(1, cyc / ramp) : Math.max(0, 1 - (cyc - g.openFor) / ramp);
    if (g.h0 == null) { g.h0 = g.box.h; g.y0 = g.box.y; }
    g.open = open; g.box.solid = open < 0.75;
    if (g.roll) { g.box.y = g.y0 + open * g.lift; g.box.h = g.h0 - open * g.lift; } else g.box.y = g.y0 + open * g.lift;
  }
  for (const m of map.movers || []) {
    let x, z, dx = 0, dz = 0, heading;
    if (m.type === 'ping') {
      const len = Math.abs(m.b - m.a), travel = len / m.speed, period = travel * 2 + 3;
      const ph = t % period; let k;
      if (ph < 1.5) k = 0; else if (ph < 1.5 + travel) { k = (ph - 1.5) / travel; dx = 1; } else if (ph < 3 + travel) k = 1; else { k = 1 - (ph - 3 - travel) / travel; dx = -1; }
      const v = m.a + (m.b - m.a) * k, sign = Math.sign(m.b - m.a) * dx;
      if (m.axis === 'z') { x = m.c; z = v; dz = sign; dx = 0; } else { x = v; z = m.c; dx = sign; }
      if (sign) m.lastSign = sign;
      heading = m.lastSign || Math.sign(m.b - m.a);
      m.yaw = m.axis === 'z' ? (heading > 0 ? 0 : Math.PI) : (heading > 0 ? Math.PI / 2 : -Math.PI / 2);
      const along = m.axis === 'z';
      m.box.w = along ? m.wid : m.len; m.box.d = along ? m.len : m.wid;
    } else if (m.type === 'swing') {
      const s = Math.sin((t + (m.off || 0)) * Math.PI * 2 / m.period);
      x = m.x + (m.axis === 'x' ? s * m.amp : 0); z = m.z + (m.axis === 'z' ? s * m.amp : 0);
      const v = Math.cos((t + (m.off || 0)) * Math.PI * 2 / m.period);
      dx = m.axis === 'x' ? Math.sign(v) : 0; dz = m.axis === 'z' ? Math.sign(v) : 0;
      m.box.w = m.axis === 'x' ? m.wid : m.len; m.box.d = m.axis === 'x' ? m.len : m.wid;
      m.swing = s; m.box.y = m.y || 0;
    }
    m.box.x = x; m.box.z = z; m.dirX = dx; m.dirZ = dz; m.moving = !!(dx || dz);
  }
}
const solidBox = b => b.vis !== 'floor' && (b.solid !== false);

// ---------- движение игрока (общее для клиента и ботов) ----------
// p: {x,y,z,vx,vy,vz,ground}; inp: {mx,mz — мировое направление (длина ≤1), jump, speedMul}
export function movePlayer(map, p, inp, dt) {
  const sp = PH.SPEED * (inp.speedMul || 1);
  const ax = (inp.mx || 0) * sp, az = (inp.mz || 0) * sp;
  const acc = p.ground ? PH.ACC : PH.AIR;
  p.vx += Math.max(-acc * dt, Math.min(acc * dt, ax - p.vx));
  p.vz += Math.max(-acc * dt, Math.min(acc * dt, az - p.vz));
  if (inp.jump && p.ground) { p.vy = PH.JUMP; p.ground = false; }
  p.vy -= PH.G * dt;
  const boxes = map.boxes, R = PH.R, H = PH.H;
  const overlapsXZ = (b, x, z) => Math.abs(x - b.x) < b.w / 2 + R && Math.abs(z - b.z) < b.d / 2 + R;
  const axis = (k) => {
    const d = (k === 'x' ? p.vx : p.vz) * dt; if (!d) return;
    p[k] += d;
    for (const b of boxes) {
      if (!solidBox(b)) continue;
      const top = b.y + b.h;
      if (top <= p.y + 0.01 || b.y >= p.y + H) continue;
      if (!overlapsXZ(b, p.x, p.z)) continue;
      if (top - p.y <= PH.STEP && p.vy <= 0.5 && !blockedAbove(boxes, p.x, p.z, top, R, H)) { p.y = top; p.vy = Math.max(0, p.vy); p.ground = true; continue; }
      const half = (k === 'x' ? b.w : b.d) / 2 + R, c = b[k];
      p[k] = d > 0 ? c - half - 0.001 : c + half + 0.001;
      if (k === 'x') p.vx = 0; else p.vz = 0;
    }
  };
  axis('x'); axis('z');
  const prevY = p.y;
  p.y += p.vy * dt;
  p.ground = false;
  for (const b of boxes) {
    if (!solidBox(b) && b.vis !== 'floor') continue;
    if (!overlapsXZ(b, p.x, p.z) && b.vis !== 'floor') continue;
    const top = b.y + b.h;
    if (p.vy <= 0 && prevY >= top - 0.05 && p.y <= top) { p.y = top; p.vy = 0; p.ground = true; }
    else if (p.vy > 0 && prevY + H <= b.y + 0.05 && p.y + H > b.y && b.vis !== 'floor') { p.y = b.y - H; p.vy = 0; }
  }
  if (p.y < 0) { p.y = 0; p.vy = 0; p.ground = true; }
  // если застряли внутри (например, наехал погрузчик) — выталкиваем
  for (const b of boxes) {
    if (!solidBox(b) || b.vis === 'floor') continue;
    const top = b.y + b.h;
    if (top <= p.y + 0.05 || b.y >= p.y + H - 0.05 || !overlapsXZ(b, p.x, p.z)) continue;
    const ox = b.w / 2 + R - Math.abs(p.x - b.x), oz = b.d / 2 + R - Math.abs(p.z - b.z);
    if (ox < oz) p.x += (p.x > b.x ? 1 : -1) * ox; else p.z += (p.z > b.z ? 1 : -1) * oz;
  }
  p.x = Math.max(-map.W + R, Math.min(map.W - R, p.x)); p.z = Math.max(-map.D + R, Math.min(map.D - R, p.z));
}
function blockedAbove(boxes, x, z, y, R, H) {
  for (const b of boxes) { if (!solidBox(b)) continue; if (b.y >= y + H || b.y + b.h <= y + 0.01) continue; if (Math.abs(x - b.x) < b.w / 2 + R && Math.abs(z - b.z) < b.d / 2 + R) return true; }
  return false;
}

// ---------- лучи ----------
export function rayBox(o, d, b, maxT) {
  let tmin = 0, tmax = maxT;
  const mins = [b.x - b.w / 2, b.y, b.z - b.d / 2], maxs = [b.x + b.w / 2, b.y + b.h, b.z + b.d / 2], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  let n = -1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < mins[i] || oo[i] > maxs[i]) return null; continue; }
    let t1 = (mins[i] - oo[i]) / dd[i], t2 = (maxs[i] - oo[i]) / dd[i];
    let ni = i;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) { tmin = t1; n = ni; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return { t: tmin, axis: n };
}
export function rayWorld(map, o, d, maxT) {
  let best = { t: maxT, b: null };
  for (const b of map.boxes) {
    if (b.vis === 'floor') { if (d.y < 0) { const t = -o.y / d.y; if (t > 0 && t < best.t) best = { t, b, axis: 1 }; } continue; }
    if (!solidBox(b) || b.pass) continue;
    const h = rayBox(o, d, b, best.t);
    if (h && h.t < best.t) best = { t: h.t, b, axis: h.axis };
  }
  return best;
}
export function raySphere(o, d, c, r, maxT) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc; if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < maxT ? t : null;
}
// попадание в персонажа: голова — шар, тело — коробка
export function rayPlayer(o, d, p, maxT, scale = 1, crouch = p.crouch) {
  const hy = crouch ? 1.02 : 1.5, bh = crouch ? 0.82 : 1.28;
  const head = raySphere(o, d, { x: p.x, y: p.y + hy * scale, z: p.z }, 0.27 * scale, maxT);
  const body = rayBox(o, d, { x: p.x, y: p.y, z: p.z, w: 0.75 * scale, h: bh * scale, d: 0.75 * scale }, maxT);
  if (head != null && (!body || head < body.t)) return { t: head, head: true };
  if (body) return { t: body.t, head: false };
  return null;
}
export function los(map, a, b) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L = Math.hypot(d.x, d.y, d.z);
  if (L < 0.01) return true;
  d.x /= L; d.y /= L; d.z /= L;
  return rayWorld(map, a, d, L).t >= L - 0.05;
}

// ---------- сетка для ботов и монстров (только пол) ----------
export function buildNav(map) {
  const C = 1, nx = map.W * 2, nz = map.D * 2;
  const grid = new Uint8Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = -map.W + ix + 0.5, z = -map.D + iz + 0.5;
    let ok = 1;
    for (const b of map.boxes) {
      if (b.vis === 'floor' || b.dyn || b.solid === false) continue;
      if (b.y > 1.6 || b.y + b.h < 0.45) continue;
      if (Math.abs(x - b.x) < b.w / 2 + 0.45 && Math.abs(z - b.z) < b.d / 2 + 0.45) { ok = 0; break; }
    }
    grid[iz * nx + ix] = ok;
  }
  map.nav = { nx, nz, grid, cell: C };
}
export function navPath(map, from, to) {
  const { nx, nz, grid } = map.nav;
  const cx = x => Math.max(0, Math.min(nx - 1, Math.floor(x + map.W))), cz = z => Math.max(0, Math.min(nz - 1, Math.floor(z + map.D)));
  let s = cz(from.z) * nx + cx(from.x), g = cz(to.z) * nx + cx(to.x);
  if (!grid[g]) { // ближайшая свободная клетка к цели
    let best = -1, bd = 1e9; const gx = g % nx, gz = Math.floor(g / nx);
    for (let r = 1; r < 6 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const x = gx + dx, z = gz + dz; if (x < 0 || z < 0 || x >= nx || z >= nz || !grid[z * nx + x]) continue; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = z * nx + x; } }
    if (best < 0) return null; g = best;
  }
  // A* с двоичной кучей; массивы переиспользуются — без рывков у хоста
  const N = nx * nz;
  if (!map.navBuf || map.navBuf.N !== N) map.navBuf = { N, came: new Int32Array(N), gs: new Float32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), run: 0 };
  const B = map.navBuf, run = ++B.run, came = B.came, gs = B.gs;
  const G = i => B.stamp[i] === run ? gs[i] : 1e9;
  const gx = g % nx, gz = Math.floor(g / nx);
  const h = i => { const dx = Math.abs(i % nx - gx), dz = Math.abs(Math.floor(i / nx) - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const heap = [], hf = [];
  const push = (i, f) => { heap.push(i); hf.push(f); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (hf[q] <= hf[k]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; [hf[q], hf[k]] = [hf[k], hf[q]]; k = q; } };
  const pop = () => { const top = heap[0], li = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = li; hf[0] = lf; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
  B.stamp[s] = run; gs[s] = 0; came[s] = -1; push(s, h(s));
  let iter = 0, found = s === g;
  while (heap.length && iter++ < 6000) {
    const cur = pop();
    if (B.closed[cur] === run) continue;
    if (cur === g) { found = true; break; }
    B.closed[cur] = run;
    const x = cur % nx, z = Math.floor(cur / nx), gc = gs[cur];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
      const n = Z * nx + X; if (!grid[n] || B.closed[n] === run) continue;
      if (dx && dz && (!grid[z * nx + X] || !grid[Z * nx + x])) continue;
      const ng = gc + (dx && dz ? 1.414 : 1);
      if (ng < G(n)) { B.stamp[n] = run; gs[n] = ng; came[n] = cur; push(n, ng + h(n)); }
    }
  }
  if (!found) return null;
  const path = []; let c = g;
  while (c !== s && c >= 0) { path.push({ x: -map.W + c % nx + 0.5, z: -map.D + Math.floor(c / nx) + 0.5 }); c = came[c]; }
  return path.reverse();
}

export const SMAPS = { warehouse: warehouse(), port: port(), castle: castle(), graveyard: graveyard(), street: street(), arena: arena() };
for (const m of Object.values(SMAPS)) buildNav(m);
export const SMAP_LIST = [
  { id: 'port', name: 'Порт ночью', icon: 'anchor', ready: true },
  { id: 'warehouse', name: 'Склад', icon: 'station', ready: true },
  { id: 'castle', name: 'Замок', icon: 'castle', ready: true },
  { id: 'graveyard', name: 'Ночное кладбище', icon: 'skull', ready: true },
  { id: 'street', name: 'Городская улица', icon: 'users', ready: true },
  { id: 'arena', name: 'Арена', icon: 'swords', ready: true, pve: true }
];
export function smapModels(map) {
  const s = new Set(map.id === 'warehouse' ? ['fa/conveyor-long', 'fa/box-small', 'ca/cone'] : []);
  if (map.hazard) s.add('grave/character-skeleton');
  for (const b of map.boxes) if (b.model) s.add(b.model);
  for (const m of map.movers) if (m.model) s.add(m.model);
  for (const d of map.deco || []) if (d.model) s.add(d.model);
  if (map.id === 'port') ['in/shipping-container-b', 'ca/cone'].forEach(x => s.add(x));
  return [...s];
}
