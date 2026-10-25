// 3D-сцена шутера: склад, игроки, оружие от первого лица, трассеры, эффекты.
import * as THREE from 'three';
import * as A from '../assets.js';
import { Avatar, makeGun, buildFlag, R } from '../render.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS } from './weapons.js';
import { PH, updateDynamics, rayWorld } from './smap.js';
import { rnd, clamp } from '../util.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const texCache = {};
// процедурные текстуры (рисуем на canvas, без загрузки картинок)
const R256 = () => Math.random() * 256;
function paint(type, g) {
  const noise = (n, a, col, sz = 3) => { for (let i = 0; i < n; i++) { g.fillStyle = col; g.globalAlpha = a * Math.random(); g.fillRect(R256(), R256(), 1 + Math.random() * sz, 1 + Math.random() * sz); } g.globalAlpha = 1; };
  const fill = c => { g.fillStyle = c; g.fillRect(0, 0, 256, 256); };
  const blocks = (rows, cols, base, vary, mortar, mw = 4, offset = true) => {
    fill(mortar);
    const bh = 256 / rows, bw = 256 / cols;
    for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) {
      const x = c * bw + (offset && r % 2 ? bw / 2 : 0), y = r * bh;
      const l = (Math.random() - 0.5) * vary;
      g.fillStyle = shade(base, l); g.fillRect(x + mw / 2, y + mw / 2, bw - mw, bh - mw);
    }
  };
  switch (type) {
    case 'concrete': fill('#8d8e92'); noise(2500, 0.25, '#6f7075'); noise(1500, 0.2, '#a9aaae'); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); break;
    case 'metalwall': { const grad = g.createLinearGradient(0, 0, 32, 0); grad.addColorStop(0, '#6d7a8c'); grad.addColorStop(0.5, '#8b98aa'); grad.addColorStop(1, '#5d6a7c'); g.fillStyle = grad; for (let x = 0; x < 256; x += 32) { g.save(); g.translate(x, 0); g.fillRect(0, 0, 32, 256); g.restore(); } noise(600, 0.15, '#3c4554'); break; }
    case 'divider': fill('#a7a094'); for (let y = 0; y < 256; y += 64) for (let x = (y / 64) % 2 * 64; x < 256; x += 128) { g.fillStyle = '#9b9488'; g.fillRect(x, y, 126, 62); } g.strokeStyle = '#7d776c'; g.lineWidth = 3; for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); } noise(800, 0.2, '#6b655b'); break;
    case 'stripes': for (let i = -256; i < 512; i += 64) { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 + 256, 256); g.lineTo(i + 256, 256); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i + 64, 0); g.lineTo(i + 64 + 256, 256); g.lineTo(i + 32 + 256, 256); g.fill(); } break;
    case 'barrier': for (let i = 0; i < 256; i += 64) { g.fillStyle = '#e8e8e8'; g.fillRect(i, 0, 32, 256); g.fillStyle = '#d33a2c'; g.fillRect(i + 32, 0, 32, 256); } noise(400, 0.15, '#000'); break;
    case 'shutter': for (let y = 0; y < 256; y += 16) { g.fillStyle = y % 32 ? '#9aa4b0' : '#b4bdc8'; g.fillRect(0, y, 256, 16); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + 14, 256, 2); } break;
    case 'grate': fill('#3c4048'); g.strokeStyle = '#7d848f'; g.lineWidth = 6; for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } break;
    case 'crate': fill('#b07a43'); for (let y = 0; y < 256; y += 51) { g.fillStyle = y % 102 ? '#a26e3a' : '#bb854e'; g.fillRect(0, y, 256, 49); } g.strokeStyle = '#6b4523'; g.lineWidth = 18; g.strokeRect(9, 9, 238, 238); g.beginPath(); g.moveTo(18, 18); g.lineTo(238, 238); g.stroke(); noise(400, 0.25, '#5a3a1c'); break;
    case 'steps': fill('#5a606b'); g.fillStyle = '#f2c230'; g.fillRect(0, 0, 256, 26); noise(500, 0.3, '#2d3138'); break;
    case 'stone': blocks(4, 2, '#9c968a', 26, '#6e695f', 6); noise(1800, 0.25, '#5e594f'); noise(900, 0.18, '#c4bdae'); break;
    case 'mossy': blocks(4, 2, '#77786f', 22, '#4b4c45', 6); noise(1500, 0.3, '#3d4a2c', 4); noise(500, 0.35, '#5b7a3a', 5); break;
    case 'flagstone': blocks(3, 3, '#8a8478', 30, '#5b564d', 5); noise(1500, 0.2, '#4e4a42'); break;
    case 'cobble': { fill('#6c6a63'); for (let i = 0; i < 160; i++) { const x = R256(), y = R256(), r = 9 + Math.random() * 9; g.fillStyle = shade('#8f8b80', (Math.random() - 0.5) * 40); g.beginPath(); g.ellipse(x, y, r, r * 0.8, Math.random() * 3, 0, 7); g.fill(); } noise(1200, 0.2, '#4a4842'); break; }
    case 'wood': for (let y = 0; y < 256; y += 32) { g.fillStyle = shade('#8a5a32', (Math.random() - 0.5) * 30); g.fillRect(0, y, 256, 31); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 30, 256, 2); g.fillRect(((y * 37) % 200) + 20, y, 2, 31); } noise(900, 0.18, '#4a2e17', 6); break;
    case 'parquet': for (let y = 0; y < 256; y += 32) for (let x = (y / 32 % 2) * 64; x < 256 + 64; x += 128) { g.fillStyle = shade('#a8743f', (Math.random() - 0.5) * 30); g.fillRect(x - 64, y, 127, 31); g.fillStyle = shade('#a8743f', (Math.random() - 0.5) * 30); g.fillRect(x + 64, y, 127, 31); } noise(600, 0.15, '#5a3a1c', 5); break;
    case 'tiles': blocks(4, 4, '#d9d6cc', 10, '#9d9a90', 4, false); break;
    case 'carpet': fill('#8e1f2b'); g.strokeStyle = '#e0b84a'; g.lineWidth = 10; g.strokeRect(14, -10, 228, 276); noise(1500, 0.15, '#4a0c14'); break;
    case 'grass': fill('#4d7a35'); noise(3000, 0.35, '#3a612a', 3); noise(1500, 0.3, '#6c9a48', 3); break;
    case 'darkgrass': fill('#1f2e1f'); noise(3000, 0.4, '#162216', 3); noise(1600, 0.35, '#2e4429', 3); noise(300, 0.3, '#3b3324', 6); break;
    case 'dirt': fill('#4a3d2e'); noise(2500, 0.35, '#352b20', 4); noise(1000, 0.3, '#6a5a44', 3); break;
    case 'mound': fill('#3a2f23'); noise(1500, 0.4, '#251d15', 4); noise(500, 0.3, '#56473a', 3); break;
    case 'asphalt': fill('#3d3f44'); noise(4000, 0.35, '#2d2f33', 2); noise(2000, 0.25, '#55585e', 2); break;
    case 'sidewalk': blocks(2, 2, '#b3aea3', 14, '#8a857b', 4, false); noise(1200, 0.2, '#7d786f'); break;
    case 'paint': fill('#f2f0e6'); noise(300, 0.2, '#999'); break;
    case 'brick': blocks(8, 4, '#a5503a', 30, '#d1c6b4', 5); noise(1200, 0.2, '#5c2a1d'); break;
    case 'plaster': fill('#e8dcc2'); noise(2500, 0.12, '#b9ac90', 3); g.fillStyle = '#b98f5e'; g.fillRect(0, 230, 256, 26); break;
    case 'shopwall': fill('#9fc3c9'); noise(2000, 0.12, '#6f949a', 3); g.fillStyle = '#4b6b70'; g.fillRect(0, 236, 256, 20); break;
    case 'facade': { blocks(8, 4, '#b8674a', 26, '#d9cdb8', 4); g.fillStyle = '#d9cdb8'; g.fillRect(70, 40, 116, 150); g.fillStyle = '#26364d'; g.fillRect(78, 48, 100, 134); g.fillStyle = Math.random() < 0.5 ? '#ffd27a' : '#3a5578'; g.fillRect(82, 52, 44, 60); g.fillStyle = '#ffd27a'; g.fillRect(130, 52, 44, 60); g.fillStyle = '#3a5578'; g.fillRect(82, 116, 44, 62); g.fillRect(130, 116, 44, 62); break; }
    case 'tilesroof': for (let y = 0; y < 256; y += 32) for (let x = (y / 32 % 2) * 16; x < 272; x += 32) { g.fillStyle = shade('#a8432f', (Math.random() - 0.5) * 30); g.beginPath(); g.arc(x, y + 24, 16, Math.PI, 0); g.lineTo(x + 16, y + 32); g.lineTo(x - 16, y + 32); g.fill(); } break;
    case 'slate': blocks(8, 4, '#4b5260', 20, '#2c313a', 3); break;
    case 'flatroof': fill('#55585d'); noise(2000, 0.25, '#3c3e42'); break;
    case 'woodfence': for (let x = 0; x < 256; x += 32) { g.fillStyle = shade('#a0703f', (Math.random() - 0.5) * 30); g.fillRect(x + 2, 0, 28, 256); } g.fillStyle = '#6b4523'; g.fillRect(0, 50, 256, 18); g.fillRect(0, 190, 256, 18); break;
    case 'dumpster': fill('#2f6e46'); for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, 0, 4, 256); } noise(800, 0.3, '#1d4029', 4); break;
    case 'bars': case 'ironfence': case 'portcullis': {
      g.clearRect(0, 0, 256, 256);
      const step = type === 'portcullis' ? 42 : 32, w = type === 'portcullis' ? 12 : 7;
      g.fillStyle = type === 'portcullis' ? '#3a3530' : '#22252b';
      for (let x = 8; x < 256; x += step) g.fillRect(x, 0, w, 256);
      if (type === 'portcullis') for (let y = 20; y < 256; y += step) g.fillRect(0, y, 256, w);
      else { g.fillRect(0, 18, 256, 10); g.fillRect(0, 226, 256, 10); for (let x = 8; x < 256; x += step) { g.beginPath(); g.moveTo(x - 4, 14); g.lineTo(x + w / 2, 0); g.lineTo(x + w + 4, 14); g.fill(); } }
      break;
    }
    case 'ceiling': fill('#2b2f38'); g.strokeStyle = '#3c414c'; g.lineWidth = 8; g.strokeRect(0, 0, 256, 256); break;
  }
}
function shade(hex, l) {
  const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, Math.round(v + l)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
function baseTex(type) {
  if (!texCache[type]) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    paint(type, c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texCache[type] = t;
  }
  return texCache[type];
}
function canvasTex(type) { const t = baseTex(type).clone(); t.needsUpdate = true; return t; }
const ALPHA = new Set(['bars', 'ironfence', 'portcullis']);
const matCache = {};
function texMat(type, color = '#fff', glow) {
  const key = type + color + (glow || '');
  if (!matCache[key]) {
    const o = { map: baseTex(type) };
    if (glow) Object.assign(o, { emissive: glow, emissiveMap: baseTex(type) });
    if (ALPHA.has(type)) Object.assign(o, { alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
    matCache[key] = std(color, o);
  }
  return matCache[key];
}
// геометрия коробки с UV по размеру (текстура k метров на плитку)
function boxGeo(b, k = 2) {
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  const uv = geo.attributes.uv, pos = geo.attributes.position, nor = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const x = pos.getX(i) + b.w / 2, y = pos.getY(i) + b.h / 2 + (b.y || 0), z = pos.getZ(i) + b.d / 2;
    if (ny > 0.5) uv.setXY(i, (x + b.x) / k, (z + b.z) / k); else if (nx > 0.5) uv.setXY(i, (z + b.z) / k, y / k); else uv.setXY(i, (x + b.x) / k, y / k);
  }
  return geo;
}
function texBox(b, type, k = 2, color = '#fff') {
  const m = new THREE.Mesh(boxGeo({ ...b, x: 0, z: 0 }, k), texMat(type, color));
  m.position.set(b.x, b.y + b.h / 2, b.z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
// двускатная крыша: конёк вдоль оси ridge
function roofMesh(b, type, ridge, rh) {
  const along = ridge === 'x', L = along ? b.w : b.d, Wd = (along ? b.d : b.w) / 2;
  const sh = new THREE.Shape(); sh.moveTo(-Wd, 0); sh.lineTo(Wd, 0); sh.lineTo(0, rh); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  if (along) geo.rotateY(Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  const m = new THREE.Mesh(geo, texMat(type === 'tiles' ? 'tilesroof' : type === 'slate' ? 'slate' : 'flatroof'));
  m.position.set(b.x, b.y + b.h, b.z); m.castShadow = true; m.receiveShadow = true;
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
// много одинаковых моделей одним вызовом: подгонка под коробки или по высоте
function instancedModels(name, list) {
  const g = A.info(name); if (!g) return null;
  const size = g.size, c = g.box.getCenter(new THREE.Vector3()), minY = g.box.min.y;
  const pl = list.map(b => {
    const r = b.rot || b.r || 0;
    let sx, sy, sz;
    if (b.w != null) { const rr = Math.abs(Math.sin(r)) > 0.7; sx = (rr ? b.d : b.w) / size.x; sy = b.h / size.y; sz = (rr ? b.w : b.d) / size.z; }
    else { const s = b.h ? b.h / size.y : (b.s || 1); sx = sy = sz = s; }
    const ox = -c.x * sx, oz = -c.z * sz, cos = Math.cos(r), sin = Math.sin(r);
    return { x: b.x + ox * cos + oz * sin, y: (b.y || 0) - minY * sy, z: b.z - ox * sin + oz * cos, r, sx, sy, sz };
  });
  return A.makeInstanced(name, pl);
}
// оформление карт
const THEMES = {
  warehouse: { bg: '#1c2130', fog: ['#1c2130', 40, 95], hemi: ['#dfe8ff', '#4a4038', 1.0], sun: ['#fff3dc', 1.7, [-12, 30, 8]], floor: 'concrete', floorK: 4, stairs: 'steps' },
  castle: { sky: ['#3f86d8', '#a9d3f5', '#f4e6c8'], fog: ['#cfe0ee', 50, 120], hemi: ['#eef5ff', '#6b5a40', 1.0], sun: ['#fff1d6', 1.9, [-18, 34, 14]], floor: 'grass', floorK: 3, stairs: 'stone', clouds: true },
  graveyard: { sky: ['#03050f', '#0d1530', '#1f2a55'], stars: true, moon: [40, 45, -70], fog: ['#161e3c', 12, 52], hemi: ['#8f9fe6', '#2a2232', 0.85], sun: ['#b4c4ff', 1.05, [16, 30, -14]], floor: 'darkgrass', floorK: 3, stairs: 'flagstone', night: true },
  street: { sky: ['#2b2466', '#b75f86', '#ffbf7a'], fog: ['#c98f86', 40, 105], hemi: ['#ffe6cf', '#4a3a40', 0.95], sun: ['#ffbe85', 1.7, [-34, 20, 12]], floor: 'asphalt', floorK: 4, stairs: 'flagstone', clouds: true }
};
// какая текстура у какого блока: [текстура, метров на плитку, цвет]
const VIS = {
  wall: ['metalwall', 2.4], divider: ['divider', 2],
  stonewall: ['stone', 2.4], merlon: ['stone', 1.1], tower: ['stone', 2.4], hallwall: ['stone', 2.4], column: ['stone', 1.2], lowwall: ['stone', 1.4], ruin: ['stone', 1.4], pedestal: ['stone', 1], well: ['stone', 1.2], roofslab: ['wood', 2, '#fff', '#5a4a3a'], table: ['wood', 1.4],
  gravewall: ['mossy', 2.2], gpost: ['mossy', 1.3], plat: ['flagstone', 2], gstairs: ['flagstone', 1], crypt: ['mossy', 2.2], cryptroof: ['slate', 2, '#fff', '#2a2d38'],
  sidewalk: ['sidewalk', 2], brickwall: ['brick', 2.5], barrier: ['barrier', 1.6], plaster: ['plaster', 3.6], shopwall: ['shopwall', 3.6], ceil: ['wood', 2, '#fff', '#6a5a48'], facade: ['facade', 3.2], counter: ['wood', 1.2], dumpster: ['dumpster', 1.4], woodfence: ['woodfence', 1.5],
  ironfence: ['ironfence', 1.3], bars: ['bars', 1.3]
};
export class ShooterView {
  constructor({ map, myPid, metaOf }) {
    this.map = map; this.myId = myPid; this.metaOf = metaOf;
    this.scene = new THREE.Scene();
    const th = this.theme = THEMES[map.theme] || THEMES.warehouse;
    this.scene.background = new THREE.Color(th.bg || th.fog[0]);
    this.scene.fog = new THREE.Fog(th.sky ? th.sky[2] : th.fog[0], th.fog[1], th.fog[2]);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 260);
    this.scene.add(new THREE.HemisphereLight(...th.hemi));
    const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1]);
    sun.position.set(...th.sun[2]); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera, ext = Math.max(map.W, map.D) + 6; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 110;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    this.scene.add(sun); this.scene.add(sun.target);
    if (th.sky) this.sky(th);
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
  sky(th) {
    // небо — большая сфера с градиентом
    const geo = new THREE.SphereGeometry(200, 32, 16), col = [], c0 = new THREE.Color(th.sky[0]), c1 = new THREE.Color(th.sky[1]), c2 = new THREE.Color(th.sky[2]), tmp = new THREE.Color();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const k = pos.getY(i) / 200; if (k > 0.15) tmp.copy(c1).lerp(c0, Math.min(1, (k - 0.15) / 0.6)); else tmp.copy(c2).lerp(c1, Math.max(0, (k + 0.05) / 0.2)); col.push(tmp.r, tmp.g, tmp.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10; this.scene.add(sky); this.skyMesh = sky;
    if (th.stars) {
      const v = []; for (let i = 0; i < 700; i++) { const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3; v.push(Math.cos(a) * Math.cos(e) * 190, Math.sin(e) * 190, Math.sin(a) * Math.cos(e) * 190); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      const st = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
      sky.add(st);
    }
    if (th.moon) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: '#f4f1dc', fog: false }));
      moon.position.set(...th.moon).normalize().multiplyScalar(170); sky.add(moon);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 16), new THREE.MeshBasicMaterial({ color: '#8fa6ff', transparent: true, opacity: 0.08, fog: false, depthWrite: false }));
      glow.position.copy(moon.position); sky.add(glow);
    }
    if (th.clouds) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, fog: false, depthWrite: false });
      for (let i = 0; i < 14; i++) {
        const cl = new THREE.Group(), a = i / 14 * Math.PI * 2 + Math.random() * 0.3, r = 150, y = 45 + Math.random() * 35;
        for (let j = 0; j < 5; j++) { const p = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 6, 10, 8), mat); p.position.set(j * 8 - 16, Math.random() * 4, Math.random() * 5); p.scale.y = 0.5; cl.add(p); }
        cl.position.set(Math.cos(a) * r, y, Math.sin(a) * r); cl.lookAt(0, y, 0); sky.add(cl);
      }
    }
  }
  build() {
    const m = this.map, th = this.theme, root = new THREE.Group(); this.scene.add(root); this.root = root;
    const ext = 70;
    // пол
    const ft = canvasTex(th.floor), fw = m.W * 2 + ext, fd = m.D * 2 + ext; ft.repeat.set(fw / th.floorK, fd / th.floorK);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), std('#fff', { map: ft }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
    // участки пола другого вида (дорожки, ковры, газоны)
    (m.floors || []).forEach((f, i) => {
      const t = canvasTex(f.tex); t.repeat.set(f.w / (f.k || 2), f.d / (f.k || 2));
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), std('#fff', { map: t, polygonOffset: true, polygonOffsetFactor: -1 - i * 0.01, polygonOffsetUnits: -1 }));
      pl.rotation.x = -Math.PI / 2; pl.position.set(f.x, (f.y || 0.004) + i * 0.0004, f.z); pl.receiveShadow = true; root.add(pl);
    });
    if (m.id === 'warehouse') this.buildWarehouse(root);
    this.dyn = { gates: [] };
    // статичные блоки склеиваем по материалу — меньше вызовов отрисовки
    const groups = new Map(), models = new Map();
    const addGeo = (key, mat, geo) => { if (!groups.has(key)) groups.set(key, { mat, geos: [] }); groups.get(key).geos.push(geo); };
    const addBox = (b, type, k, color = '#fff', glow) => { const geo = boxGeo(b, k); geo.translate(b.x, b.y + b.h / 2, b.z); addGeo(type + color + (glow || ''), texMat(type, color, glow), geo); };
    for (const b of m.boxes) {
      if (b.vis === 'floor' || b.vis === 'none' || b.vis === 'mover' || b.vis === 'blade') continue;
      if (b.dyn === 'gate') { const o = texBox({ ...b, y: 0 }, b.vis === 'portcullis' ? 'portcullis' : b.vis === 'bars' ? 'bars' : 'shutter', b.vis === 'shutter' ? 1.5 : 1.4, '#dfe6ee'); o.userData.h0 = b.h; root.add(o); this.dyn.gates.push(o); continue; }
      if (b.model && A.has(b.model)) { if (!models.has(b.model)) models.set(b.model, []); models.get(b.model).push(b); continue; }
      const v = VIS[b.vis];
      if (v) addBox(b, v[0], v[1], v[2], v[3]);
      else if (b.vis === 'stairs') addBox(b, th.stairs, th.stairs === 'steps' ? 1 : 1.2);
      else if (b.vis === 'crate') addBox(b, 'crate', Math.max(b.w, b.h) * 1.02);
      else if (b.vis === 'pillar') { const o = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), std('#e0a91f', { metalness: 0.3 })); o.position.set(b.x, b.y + b.h / 2, b.z); root.add(o); }
      else if (b.vis === 'catwalk') { addBox(b, 'grate', 1.2); this.rails(root, b); }
      else if (b.vis === 'conveyor') { root.add(fitModel('fa/conveyor-long', b, 0)); this.conveyor(root, b); }
      else if (b.vis === 'car' || b.vis === 'furn') { /* модель не загрузилась */ addBox(b, 'concrete', 2, '#8899aa'); }
      else addBox(b, 'concrete', 2);
      if (b.vis === 'divider') addBox({ x: b.x, y: b.y + b.h - 0.3, z: b.z, w: b.w + 0.04, h: 0.3, d: b.d + 0.04 }, 'stripes', 1);
      if (b.vis === 'tower') this.towerTop(root, b);
      if (b.roof) root.add(roofMesh(b, b.roof, b.ridge, b.rh));
      if (b.vis === 'well') { const w = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 0.5, b.d - 0.5), std('#1d3a52', { roughness: 0.2, metalness: 0.3 })); w.rotation.x = -Math.PI / 2; w.position.set(b.x, b.y + b.h + 0.01, b.z); root.add(w); }
    }
    for (const { mat, geos } of groups.values()) {
      const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    }
    for (const [name, list] of models) { const o = instancedModels(name, list); if (o) root.add(o); }
    // декор (только вид)
    const deco = new Map();
    for (const d of m.deco || []) { if (!A.has(d.model)) continue; if (!deco.has(d.model)) deco.set(d.model, []); deco.get(d.model).push(d); }
    for (const [name, list] of deco) { const o = instancedModels(name, list); if (o) root.add(o); }
    // фонари и свечи
    this.lights = [];
    const hi = R.quality === 'high';
    for (const L of m.lights || []) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(L.lamp ? 0.18 : 0.12, 10, 8), new THREE.MeshBasicMaterial({ color: L.color }));
      bulb.position.set(L.x, L.y, L.z); root.add(bulb);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshBasicMaterial({ color: L.color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(bulb.position); root.add(halo);
      let light = null;
      if (hi || !L.lamp) { light = new THREE.PointLight(L.color, L.i * (th.night ? 1 : 0.7), L.d, 1.6); light.position.copy(bulb.position); root.add(light); }
      this.lights.push({ L, light, halo, seed: Math.random() * 10 });
    }
    // движущееся: техника и маятники
    this.movers = m.movers.map(mv => {
      if (mv.blade) {
        const piv = new THREE.Group(), L = mv.pivot - (mv.y + mv.h / 2);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L, 6), std('#3a3530', { metalness: 0.6 })); arm.position.y = -L / 2; piv.add(arm);
        const sh = new THREE.Shape(); sh.absarc(0, 0, 0.75, Math.PI, 0, true); sh.lineTo(0.75, 0); sh.closePath();
        const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1 }), std('#c9d1d9', { metalness: 0.85, roughness: 0.25 }));
        blade.position.set(0, -L + 0.35, -0.025); piv.add(blade);
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), std('#3a3530', { metalness: 0.6 })); piv.add(hub);
        piv.position.set(mv.x, mv.pivot, mv.z); root.add(piv);
        return { mv, o: piv, L };
      }
      const o = A.has(mv.model) ? fitModel(mv.model, { x: 0, y: 0, z: 0, w: mv.wid, h: mv.h, d: mv.len }, 0) : texBox({ x: 0, y: 0, z: 0, w: mv.wid, h: mv.h, d: mv.len }, 'dumpster', 2);
      root.add(o);
      let light = null;
      if (!mv.car) { light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff9a1f' })); light.position.y = mv.h + 0.15; o.add(light); }
      else for (const sx of [-0.65, 0.65]) { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff6c8' })); hl.position.set(sx * mv.wid / 1.3, 0.75, mv.len / 2 + 0.02); o.add(hl); }
      return { mv, o, light };
    });
  }
  towerTop(root, b) {
    const top = b.y + b.h;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const t = (j + 0.5) / 3 * b.w - b.w / 2, side = i % 2 ? 1 : -1, alongX = i < 2;
      const mb = { x: b.x + (alongX ? t : side * (b.w / 2 - 0.35)), y: top, z: b.z + (alongX ? side * (b.d / 2 - 0.35) : t), w: 0.8, h: 0.9, d: 0.8 };
      root.add(texBox(mb, 'stone', 1));
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), std('#5a4a3a')); pole.position.set(b.x, top + 1.5, b.z); root.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), std(b.x < 0 ? '#e94b5f' : '#3d8bfd', { side: THREE.DoubleSide })); fl.position.set(b.x + 0.8, top + 2.4, b.z); root.add(fl);
    (this.towerFlags = this.towerFlags || []).push(fl);
  }
  buildWarehouse(root) {
    const m = this.map;
    const stripeMat = new THREE.MeshBasicMaterial({ color: '#e8b923', transparent: true, opacity: 0.85 });
    for (const z of [-12.8, 12.8]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(m.W * 2 - 4, 0.25), stripeMat); s.rotation.x = -Math.PI / 2; s.position.set(0, 0.01, z); root.add(s); }
    for (const x of [-26.8, 26.8]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 14), stripeMat); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.01, 0); root.add(s); }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(m.W * 2 + 2, m.D * 2 + 2), std('#2b2f38', { side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = m.WH; root.add(ceil);
    for (let x = -m.W + 4; x < m.W; x += 8) { const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, m.D * 2), std('#4a505c')); beam.position.set(x, m.WH - 0.4, 0); root.add(beam); }
    for (let x = -m.W + 8; x < m.W; x += 16) for (const z of [-8, 8]) { const sky = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: '#dfeaff' })); sky.rotation.x = Math.PI / 2; sky.position.set(x, m.WH - 0.02, z); root.add(sky); }
    for (let x = -24; x <= 24; x += 12) for (const z of [-5, 5]) { const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.3, 12, 1, true), std('#2d3138', { side: THREE.DoubleSide })); lamp.position.set(x, 7, z); root.add(lamp); const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshBasicMaterial({ color: '#fff6d8' })); bulb.rotation.x = Math.PI / 2; bulb.position.set(x, 6.86, z); root.add(bulb); const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2), std('#111')); wire.position.set(x, 8.1, z); root.add(wire); }
    for (const [x, z] of [[-13, 13.6], [13, -13.6], [-13, -13.6], [13, 13.6]]) { if (!A.has('ca/cone')) break; const c = A.makeProp('ca/cone', { s: 1.4, center: true }); c.position.set(x, 0, z); root.add(c); }
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
    (this.map.gates || []).forEach((g, i) => { const o = this.dyn.gates[i]; if (!o) return; o.position.y = g.box.y + g.box.h / 2; o.scale.y = g.box.h / o.userData.h0; });
    for (const { mv, o, light, L } of this.movers) {
      if (mv.blade) { const a = Math.asin(clamp((mv.swing || 0) * mv.amp / L, -1, 1)); if (mv.axis === 'x') o.rotation.z = a; else o.rotation.x = -a; continue; }
      o.position.set(mv.box.x, 0, mv.box.z); o.rotation.y = mv.yaw || 0;
      if (light) light.visible = mv.moving && Math.floor(t * 3) % 2 === 0;
    }
    for (const l of this.lights) { if (!l.L.flicker) continue; const f = 0.8 + 0.2 * Math.sin(t * 9 + l.seed) * Math.sin(t * 13.7 + l.seed * 2); if (l.light) l.light.intensity = l.L.i * f; l.halo.material.opacity = 0.16 * f; }
    if (this.towerFlags) for (const f of this.towerFlags) f.rotation.y = Math.sin(t * 2 + f.position.x) * 0.25;
    if (this.skyMesh) this.skyMesh.position.copy(this.camera.position);
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
