// 3D-сцена шутера: склад, игроки, оружие от первого лица, трассеры, эффекты.
import * as THREE from 'three';
import * as A from '../assets.js';
import { Avatar, makeGun, buildFlag, floorTexture } from '../render.js';
import { WEAPONS } from './weapons.js';
import { PH, updateDynamics, rayWorld } from './smap.js';
import { rnd, clamp } from '../util.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const texCache = {};
function canvasTex(type, rep = 1) {
  const key = type;
  if (!texCache[key]) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const noise = (n, a, col) => { for (let i = 0; i < n; i++) { g.fillStyle = col; g.globalAlpha = a * Math.random(); g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3); } g.globalAlpha = 1; };
    if (type === 'concrete') { g.fillStyle = '#8d8e92'; g.fillRect(0, 0, 256, 256); noise(2500, 0.25, '#6f7075'); noise(1500, 0.2, '#a9aaae'); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); }
    else if (type === 'metalwall') { const grad = g.createLinearGradient(0, 0, 32, 0); grad.addColorStop(0, '#6d7a8c'); grad.addColorStop(0.5, '#8b98aa'); grad.addColorStop(1, '#5d6a7c'); g.fillStyle = grad; for (let x = 0; x < 256; x += 32) { g.save(); g.translate(x, 0); g.fillRect(0, 0, 32, 256); g.restore(); } noise(600, 0.15, '#3c4554'); }
    else if (type === 'divider') { g.fillStyle = '#a7a094'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 64) for (let x = (y / 64) % 2 * 64; x < 256; x += 128) { g.fillStyle = '#9b9488'; g.fillRect(x, y, 126, 62); } g.strokeStyle = '#7d776c'; g.lineWidth = 3; for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); } noise(800, 0.2, '#6b655b'); }
    else if (type === 'stripes') { for (let i = -256; i < 512; i += 64) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 + 256, 256); g.lineTo(i + 256, 256); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i + 64, 0); g.lineTo(i + 64 + 256, 256); g.lineTo(i + 32 + 256, 256); g.fill(); } }
    else if (type === 'shutter') { for (let y = 0; y < 256; y += 16) { g.fillStyle = y % 32 ? '#9aa4b0' : '#b4bdc8'; g.fillRect(0, y, 256, 16); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + 14, 256, 2); } }
    else if (type === 'grate') { g.fillStyle = '#3c4048'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#7d848f'; g.lineWidth = 6; for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } }
    else if (type === 'crate') { g.fillStyle = '#b07a43'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 51) { g.fillStyle = y % 102 ? '#a26e3a' : '#bb854e'; g.fillRect(0, y, 256, 49); } g.strokeStyle = '#6b4523'; g.lineWidth = 18; g.strokeRect(9, 9, 238, 238); g.beginPath(); g.moveTo(18, 18); g.lineTo(238, 238); g.stroke(); noise(400, 0.25, '#5a3a1c'); }
    else if (type === 'steps') { g.fillStyle = '#5a606b'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#f2c230'; g.fillRect(0, 0, 256, 26); noise(500, 0.3, '#2d3138'); }
    else if (type === 'ceiling') { g.fillStyle = '#2b2f38'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#3c414c'; g.lineWidth = 8; g.strokeRect(0, 0, 256, 256); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texCache[key] = t;
  }
  const t = texCache[key].clone(); t.needsUpdate = true; return t;
}
// коробка с текстурой, которая повторяется по размеру
function texBox(b, type, k = 2, color = '#fff') {
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  const uv = geo.attributes.uv, pos = geo.attributes.position, nor = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const x = pos.getX(i) + b.w / 2, y = pos.getY(i) + b.h / 2, z = pos.getZ(i) + b.d / 2;
    if (ny > 0.5) uv.setXY(i, x / k, z / k); else if (nx > 0.5) uv.setXY(i, z / k, y / k); else uv.setXY(i, x / k, y / k);
  }
  const m = new THREE.Mesh(geo, std(color, { map: canvasTex(type) }));
  m.position.set(b.x, b.y + b.h / 2, b.z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function fitModel(name, b, rot = 0) {
  const p = A.makeProp(name, { s: 1, center: true });
  const box = new THREE.Box3().setFromObject(p), size = box.getSize(new THREE.Vector3());
  const r = Math.abs(Math.sin(rot)) > 0.7;
  const sx = (r ? b.d : b.w) / size.x, sy = b.h / size.y, sz = (r ? b.w : b.d) / size.z;
  p.scale.set(sx, sy, sz); p.rotation.y = rot;
  const g = new THREE.Group(); g.add(p); g.position.set(b.x, b.y, b.z);
  return g;
}

export class ShooterView {
  constructor({ map, myPid, metaOf }) {
    this.map = map; this.myId = myPid; this.metaOf = metaOf;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1c2130');
    this.scene.fog = new THREE.Fog('#1c2130', 40, 95);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#4a4038', 1.0));
    const sun = new THREE.DirectionalLight('#fff3dc', 1.7);
    sun.position.set(-12, 30, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -36; sc.right = 36; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    this.scene.add(sun); this.scene.add(sun.target);
    this.build();
    this.ents = new Map(); this.projs = new Map(); this.flags = new Map();
    this.tracers = []; this.decals = []; this.parts = [];
    this.pGeo = new THREE.BoxGeometry(1, 1, 1);
    this.camMode = 'fps';
    this.yaw = 0; this.pitch = 0; this.eye = new THREE.Vector3(); this.zoom = 1;
    // оружие от первого лица — отдельная сцена поверх
    this.vmScene = new THREE.Scene();
    this.vmScene.add(new THREE.HemisphereLight('#ffffff', '#555566', 1.5));
    const vl = new THREE.DirectionalLight('#ffffff', 1.2); vl.position.set(1, 2, 1); this.vmScene.add(vl);
    this.vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vm = new THREE.Group(); this.vmScene.add(this.vm);
    this.vmGun = null; this.vmState = { kick: 0, bob: 0, reload: 0, raise: 1 };
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.vm.add(this.flash);
  }
  build() {
    const m = this.map, root = new THREE.Group(); this.scene.add(root);
    // пол
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(m.W * 2 + 2, m.D * 2 + 2), std('#fff', { map: (() => { const t = canvasTex('concrete'); t.repeat.set(m.W / 2, m.D / 2); return t; })() }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
    // полосы разметки
    const stripeMat = new THREE.MeshBasicMaterial({ color: '#e8b923', transparent: true, opacity: 0.85 });
    for (const z of [-12.8, 12.8]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(m.W * 2 - 4, 0.25), stripeMat); s.rotation.x = -Math.PI / 2; s.position.set(0, 0.01, z); root.add(s); }
    for (const x of [-26.8, 26.8]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 14), stripeMat); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.01, 0); root.add(s); }
    // потолок с балками и световыми окнами
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(m.W * 2 + 2, m.D * 2 + 2), std('#2b2f38', { side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = m.WH; root.add(ceil);
    for (let x = -m.W + 4; x < m.W; x += 8) { const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, m.D * 2), std('#4a505c')); beam.position.set(x, m.WH - 0.4, 0); root.add(beam); }
    for (let x = -m.W + 8; x < m.W; x += 16) for (const z of [-8, 8]) { const sky = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: '#dfeaff' })); sky.rotation.x = Math.PI / 2; sky.position.set(x, m.WH - 0.02, z); root.add(sky); }
    // лампы
    for (let x = -24; x <= 24; x += 12) for (const z of [-5, 5]) { const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.3, 12, 1, true), std('#2d3138', { side: THREE.DoubleSide })); lamp.position.set(x, 7, z); root.add(lamp); const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshBasicMaterial({ color: '#fff6d8' })); bulb.rotation.x = Math.PI / 2; bulb.position.set(x, 6.86, z); root.add(bulb); const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2), std('#111')); wire.position.set(x, 8.1, z); root.add(wire); }
    this.dyn = {};
    for (const b of m.boxes) {
      let o = null;
      switch (b.vis) {
        case 'wall': o = texBox(b, 'metalwall', 2.4); o.castShadow = false; break;
        case 'divider': o = texBox(b, 'divider', 2); { const top = texBox({ x: b.x, y: b.y + b.h - 0.3, z: b.z, w: b.w + 0.04, h: 0.3, d: b.d + 0.04 }, 'stripes', 1); root.add(top); } break;
        case 'gate': o = texBox(b, 'shutter', 1.5, '#dfe6ee'); this.dyn.gate = o; break;
        case 'catwalk': o = texBox(b, 'grate', 1.2); this.rails(root, b); break;
        case 'pillar': o = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), std('#e0a91f', { metalness: 0.3 })); o.position.set(b.x, b.y + b.h / 2, b.z); break;
        case 'stairs': o = texBox(b, 'steps', 1); break;
        case 'crate': o = texBox(b, 'crate', Math.max(b.w, b.h) * 1.02); break;
        case 'conveyor': o = fitModel('fa/conveyor-long', b, 0); this.conveyor(root, b); break;
        case 'container': case 'tank': case 'machine': o = fitModel(b.model, b, b.rot || 0); break;
        case 'mover': break;
      }
      if (o) root.add(o);
    }
    // погрузчики
    this.movers = m.movers.map(mv => { const o = fitModel(mv.model, { x: 0, y: 0, z: 0, w: mv.w, h: mv.h, d: mv.d }, 0); root.add(o); const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff9a1f' })); light.position.y = mv.h + 0.15; o.add(light); return { mv, o, light }; });
    // конусы и знаки
    for (const [x, z] of [[-13, 13.6], [13, -13.6], [-13, -13.6], [13, 13.6]]) { const c = A.makeProp('ca/cone', { s: 1.4, center: true }); c.position.set(x, 0, z); root.add(c); }
  }
  rails(root, b) {
    const mat = std('#e0a91f', { metalness: 0.4 });
    for (const side of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.06, 0.06), mat); r.position.set(b.x, b.y + b.h + 1, b.z + side * (b.d / 2 - 0.05)); root.add(r); }
    for (let x = b.x - b.w / 2; x <= b.x + b.w / 2; x += 2) for (const side of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), mat); p.position.set(x, b.y + b.h + 0.5, b.z + side * (b.d / 2 - 0.05)); root.add(p); }
  }
  conveyor(root, b) {
    this.convBoxes = this.convBoxes || [];
    for (let i = 0; i < 4; i++) { const c = A.makeProp('fa/box-small', { s: 1.1, center: true }); c.position.set(b.x - b.w / 2 + (i + 0.5) * b.w / 4, b.y + b.h, b.z); c.userData = { x0: b.x - b.w / 2, len: b.w }; root.add(c); this.convBoxes.push(c); }
  }
  resize(w, h) { this.w = w; this.h = h; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.vmCam.aspect = w / h; this.vmCam.updateProjectionMatrix(); }

  // ---------- сущности ----------
  ensureEnt(id, k) {
    let a = this.ents.get(id);
    if (!a) {
      const meta = this.metaOf(k, id); if (!meta) return null;
      a = new Avatar(meta); a.meta = meta; a.k = k;
      this.scene.add(a.root); this.ents.set(id, a); a.fresh = true;
    }
    return a;
  }
  removeEnt(id) { const a = this.ents.get(id); if (a) { a.dispose(); this.ents.delete(id); } }
  setViewGun(id) {
    if (this.vmGunId === id) return;
    this.vmGunId = id;
    if (this.vmGun) this.vmGun.removeFromParent();
    const W = WEAPONS[id];
    const g = makeGun(id, W); g.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
    this.vmGun = g; this.vm.add(g);
    this.vmState.raise = 1;
    this.flash.position.set(0, 0.03, -(g.userData.len || 0.5) * 0.55 - 0.05);
  }
  kick(amount = 1) { this.vmState.kick = Math.min(1.5, this.vmState.kick + amount); this.flash.material.opacity = 1; this.flash.scale.setScalar(0.8 + Math.random() * 0.6); }

  // ---------- эффекты ----------
  tracer(o, e, color, beam) {
    const dir = new THREE.Vector3(e.x - o.x, e.y - o.y, e.z - o.z), len = dir.length(); if (len < 0.1) return;
    const geo = new THREE.CylinderGeometry(beam ? 0.035 : 0.012, beam ? 0.035 : 0.012, len, 5, 1, true);
    geo.translate(0, len / 2, 0); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: beam ? 0.9 : 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(o.x, o.y, o.z); m.lookAt(e.x, e.y, e.z);
    this.scene.add(m); this.tracers.push({ m, t: 0, life: beam ? 0.25 : 0.07 });
  }
  particle(x, y, z, vx, vy, vz, color, life = 0.5, size = 0.06, grav = 9) {
    if (this.parts.length > 500) return;
    const m = new THREE.Mesh(this.pGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.set(x, y, z); m.scale.setScalar(size); this.scene.add(m);
    this.parts.push({ m, vx, vy, vz, life, t: 0, grav });
  }
  burst(x, y, z, color, n = 10, sp = 4, size = 0.07, life = 0.5) { for (let i = 0; i < n; i++) this.particle(x, y, z, rnd(-sp, sp), rnd(0, sp), rnd(-sp, sp), color, rnd(life * 0.5, life), size); }
  decal(p, axis, dir, color = '#1a1a1a', size = 0.07) {
    if (this.decals.length > 80) { const d = this.decals.shift(); d.removeFromParent(); }
    const m = new THREE.Mesh(new THREE.CircleGeometry(size, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    const n = new THREE.Vector3(axis === 0 ? -Math.sign(dir.x) : 0, axis === 1 ? -Math.sign(dir.y) || 1 : 0, axis === 2 ? -Math.sign(dir.z) : 0);
    m.position.set(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01);
    m.lookAt(m.position.clone().add(n));
    this.scene.add(m); this.decals.push(m);
  }
  boom(x, y, z, r, color = '#ff8a3d') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); this.scene.add(m); this.tracers.push({ m, t: 0, life: 0.4, grow: r });
    this.burst(x, y, z, color, 20, 7, 0.12, 0.8); this.burst(x, y, z, '#555', 12, 3, 0.2, 1.2);
  }
  ring(x, z, r, life, color = '#ff3355') {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); this.scene.add(m); this.tracers.push({ m, t: 0, life, tele: r });
  }
  syncProjectiles(list) {
    const seen = new Set();
    for (const [id, type, x, y, z, vx, vy, vz, grav] of list) {
      seen.add(id);
      let p = this.projs.get(id);
      if (!p) {
        let g;
        if (type === 'grenade') { g = makeGun('grenade', WEAPONS.grenade); }
        else { const c = { plasma: '#8a5bff', snow: '#ffffff', orb: '#b36bff', bossorb: '#ff2e63' }[type] || '#fff'; g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(type === 'snow' ? 0.14 : 0.18, 12, 8), new THREE.MeshBasicMaterial({ color: type === 'snow' ? '#ffffff' : '#fff4f4' }))); if (type !== 'snow') g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))); g.userData.c = c; }
        g.position.set(x, y, z); this.scene.add(g); p = { g, type }; this.projs.set(id, p);
      }
      p.vx = vx; p.vy = vy; p.vz = vz; p.grav = grav;
      p.g.position.lerp(new THREE.Vector3(x, y, z), 0.5);
    }
    for (const [id, p] of this.projs) if (!seen.has(id)) { p.g.removeFromParent(); this.projs.delete(id); }
  }
  syncFlags(list) {
    for (const [team, x, y, z, carrier] of list) {
      let f = this.flags.get(team);
      if (!f) { f = buildFlag(team); this.scene.add(f); this.flags.set(team, f); }
      f.userData.c = carrier; f.userData.p = [x, y, z];
    }
  }

  // ---------- кадр ----------
  update(dt) {
    const t = performance.now() / 1000;
    if (this.onFrame) this.onFrame(dt);
    if (this.simTime != null) { updateDynamics(this.map, this.simTime); }
    if (this.dyn.gate) this.dyn.gate.position.y = this.map.gate.y + this.map.gate.h / 2;
    for (const { mv, o, light } of this.movers) { o.position.set(mv.box.x, 0, mv.box.z); o.rotation.y = mv.dir >= 0 ? (mv.z1 > mv.z0 ? 0 : Math.PI) : (mv.z1 > mv.z0 ? Math.PI : 0); light.visible = mv.moving && Math.floor(t * 3) % 2 === 0; }
    if (this.convBoxes) for (const c of this.convBoxes) { const u = c.userData; c.position.x = u.x0 + ((c.position.x - u.x0 + dt * 1.2) % u.len); }
    for (const a of this.ents.values()) a.update(dt, null);
    for (const p of this.projs.values()) { p.vy -= (p.grav || 0) * dt; p.g.position.x += p.vx * dt; p.g.position.y += p.vy * dt; p.g.position.z += p.vz * dt; if (p.type === 'grenade') { p.g.rotation.x += dt * 8; } else if (Math.random() < 0.5 && p.g.userData.c) this.particle(p.g.position.x, p.g.position.y, p.g.position.z, 0, 0, 0, p.g.userData.c, 0.25, 0.08, 0); }
    for (const [team, f] of this.flags) {
      const c = f.userData.c && this.ents.get(f.userData.c);
      if (c && c.root.visible) { f.position.set(c.x - 0.3, c.y + 1.3, c.z); f.scale.setScalar(0.55); } else { const p = f.userData.p; f.position.set(p[0], p[1], p[2]); f.scale.setScalar(1); }
      f.userData.cloth.rotation.y = Math.sin(t * 3 + team) * 0.3;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]; tr.t += dt; const k = tr.t / tr.life;
      if (k >= 1) { tr.m.removeFromParent(); tr.m.geometry.dispose(); this.tracers.splice(i, 1); continue; }
      if (tr.grow) { tr.m.scale.setScalar(tr.grow * (0.3 + k)); tr.m.material.opacity = 0.85 * (1 - k); }
      else if (tr.tele) { tr.m.scale.setScalar(tr.tele * Math.min(1, k * 1.3)); tr.m.material.opacity = 0.2 + 0.3 * Math.abs(Math.sin(tr.t * 12)); }
      else tr.m.material.opacity *= 0.82;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t += dt;
      if (p.t >= p.life) { p.m.removeFromParent(); p.m.material.dispose(); this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.02, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      p.m.material.opacity = 1 - p.t / p.life;
    }
    // камера
    const cam = this.camera;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    if (this.camMode === 'fps' || this.scoped) {
      cam.position.copy(this.eye);
    } else {
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const pivot = this.eye.clone().add(new THREE.Vector3(0, 0.35, 0)).addScaledVector(right, 0.8);
      const back = fwd.clone().multiplyScalar(-3.8);
      const want = pivot.clone().add(back);
      // камера не залезает в стены
      const d = want.clone().sub(pivot), L = d.length(); d.normalize();
      const hit = rayWorld(this.map, pivot, d, L + 0.3);
      const dist = Math.max(0.4, Math.min(L, hit.t - 0.3));
      cam.position.copy(pivot).addScaledVector(d, dist);
    }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); cam.position.x += rnd(-1, 1) * this.shake * 0.08; cam.position.y += rnd(-1, 1) * this.shake * 0.08; }
    cam.lookAt(cam.position.clone().add(fwd));
    const fov = 72 / this.zoom;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix(); }
    // оружие в руках
    const vs = this.vmState;
    vs.kick = Math.max(0, vs.kick - dt * 8); vs.raise = Math.max(0, vs.raise - dt * 4);
    this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 25);
    const bob = this.moving ? Math.sin(t * 10) * 0.012 : 0;
    const rel = this.reloading ? 1 : 0; vs.reload += (rel - vs.reload) * Math.min(1, dt * 10);
    this.vm.position.set(0.2 + bob * 0.5, -0.19 + Math.abs(bob) - vs.raise * 0.25 - vs.reload * 0.12, -0.48 + vs.kick * 0.05);
    this.vm.scale.setScalar(0.72);
    this.vm.rotation.set(vs.kick * 0.12 - vs.reload * 0.6, 0.04, vs.reload * 0.3);
    this.vm.visible = (this.camMode === 'fps' && !this.scoped && this.alive);
  }
  render(renderer) {
    renderer.render(this.scene, this.camera);
    if (this.vm.visible && this.vmGun) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.vmScene, this.vmCam); renderer.autoClear = true; }
  }
  dispose() { for (const a of this.ents.values()) a.dispose(); this.scene.traverse(o => { if (o.element) o.element.remove(); }); }
}
