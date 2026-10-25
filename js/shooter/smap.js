// Карты шутера: прямоугольные блоки (коллизия + вид), физика игрока, лучи, сетка для ботов.
export const PH = { R: 0.35, H: 1.7, EYE: 1.55, STEP: 0.5, G: 24, JUMP: 8.4, SPEED: 6, AIR: 14, ACC: 60 };

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
    { id: 0, x: -13, z0: -12, z1: 12, speed: 3.2, w: 2.2, h: 2.4, d: 3.4, model: 'ca/tractor-shovel' },
    { id: 1, x: 13, z0: 12, z1: -12, speed: 3.2, w: 2.2, h: 2.4, d: 3.4, model: 'ca/tractor-shovel' }
  ];
  for (const m of movers) m.box = box(m.x, 0, m.z0, m.w, m.h, m.d, 'mover', { dyn: 'mover', mover: m.id });
  const spawnsTeam = { 0: [], 1: [] };
  for (let i = 0; i < 6; i++) { spawnsTeam[0].push({ x: -29.5 + (i % 2) * 1.6, z: -5 + i * 2, yaw: -Math.PI / 2 }); spawnsTeam[1].push({ x: 29.5 - (i % 2) * 1.6, z: -5 + i * 2, yaw: Math.PI / 2 }); }
  const spawnsFFA = [[-28, -12], [28, 12], [-28, 12], [28, -12], [-12, 0], [12, 0], [2, -16], [-2, 16], [-20, -14], [20, 14], [-8, 10], [8, -10]].map(([x, z]) => ({ x, z, yaw: Math.atan2(x, z) }));
  const flags = [{ team: 0, x: -29, z: 0 }, { team: 1, x: 29, z: 0 }];
  const monsterSpawns = [[-30, -18], [30, -18], [-30, 18], [30, 18], [0, -17.5], [0, 17.5]].map(([x, z]) => ({ x, z }));
  return { id: 'warehouse', name: 'Склад', W, D, WH, boxes: B, gate, movers, spawnsTeam, spawnsFFA, flags, monsterSpawns, theme: 'indoor' };
}

// ---------- динамика: ворота и погрузчики зависят только от времени ----------
export function updateDynamics(map, t) {
  // ворота: 20 c открыты, 10 c закрыты
  const cyc = t % 30, open = cyc < 20 ? Math.min(1, cyc / 1.2) : Math.max(0, 1 - (cyc - 20) / 1.2);
  map.gateOpen = cyc < 20 ? Math.min(1, cyc / 1.2) : Math.max(0, 1 - (cyc - 20) / 1.2);
  const g = map.gate; g.y = map.gateOpen * 4.6; g.solid = map.gateOpen < 0.75;
  for (const m of map.movers) {
    const len = Math.abs(m.z1 - m.z0), period = len / m.speed * 2 + 3;
    let ph = (t % period);
    let k; const half = len / m.speed + 1.5;
    if (ph < 1.5) k = 0; else if (ph < half) k = (ph - 1.5) / (half - 1.5); else if (ph < half + 1.5) k = 1; else k = 1 - (ph - half - 1.5) / (period - half - 1.5);
    const z = m.z0 + (m.z1 - m.z0) * k;
    m.vz = (z - (m.zPrev ?? z)); m.zPrev = z;
    m.box.z = z; m.dir = Math.sign((m.z1 - m.z0) * ((ph > 1.5 && ph < half) ? 1 : (ph > half + 1.5 ? -1 : 0)));
    m.moving = m.dir !== 0;
  }
  return open;
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
    if (!solidBox(b)) continue;
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
export function rayPlayer(o, d, p, maxT, scale = 1) {
  const head = raySphere(o, d, { x: p.x, y: p.y + 1.5 * scale, z: p.z }, 0.27 * scale, maxT);
  const body = rayBox(o, d, { x: p.x, y: p.y, z: p.z, w: 0.75 * scale, h: 1.28 * scale, d: 0.75 * scale }, maxT);
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
      if (b.vis === 'floor' || b.dyn) continue;
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
  const open = [s], came = new Int32Array(nx * nz).fill(-1), gs = new Float32Array(nx * nz).fill(1e9), closed = new Uint8Array(nx * nz);
  gs[s] = 0;
  const h = i => Math.hypot(i % nx - g % nx, Math.floor(i / nx) - Math.floor(g / nx));
  const fs = new Map([[s, h(s)]]);
  let iter = 0;
  while (open.length && iter++ < 4000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (fs.get(open[i]) < fs.get(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === g) break;
    closed[cur] = 1;
    const x = cur % nx, z = Math.floor(cur / nx);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
      const n = Z * nx + X; if (!grid[n] || closed[n]) continue;
      if (dx && dz && (!grid[z * nx + X] || !grid[Z * nx + x])) continue;
      const ng = gs[cur] + (dx && dz ? 1.414 : 1);
      if (ng < gs[n]) { gs[n] = ng; came[n] = cur; fs.set(n, ng + h(n)); if (!open.includes(n)) open.push(n); }
    }
  }
  if (came[g] < 0 && g !== s) return null;
  const path = []; let c = g;
  while (c !== s && c >= 0) { path.push({ x: -map.W + c % nx + 0.5, z: -map.D + Math.floor(c / nx) + 0.5 }); c = came[c]; }
  return path.reverse();
}

export const SMAPS = { warehouse: warehouse() };
buildNav(SMAPS.warehouse);
export const SMAP_LIST = [
  { id: 'warehouse', name: 'Склад', icon: 'station', ready: true },
  { id: 'castle', name: 'Замок', icon: 'castle', ready: false },
  { id: 'graveyard', name: 'Ночное кладбище', icon: 'skull', ready: false },
  { id: 'street', name: 'Городская улица', icon: 'users', ready: false }
];
export function smapModels(map) {
  const s = new Set(['fa/conveyor-long', 'fa/box-small', 'ca/cone']);
  for (const b of map.boxes) if (b.model) s.add(b.model);
  for (const m of map.movers) s.add(m.model);
  return [...s];
}
