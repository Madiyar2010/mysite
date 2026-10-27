// 3D-сцена шутера: склад, игроки, оружие от первого лица, трассеры, эффекты.
import * as THREE from 'three';
import * as A from '../assets.js';
import { Avatar, makeGun, buildFlag, R } from '../render.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS } from './weapons.js';
import { PH, updateDynamics, rayWorld } from './smap.js';
import { rnd, clamp } from '../util.js';
import { texMat, boxGeo, canvasTex, texBox } from '../tex.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
// двускатная крыша: конёк вдоль оси ridge
function roofMesh(b, type, ridge, rh) {
  const along = ridge === 'x', L = along ? b.w : b.d, Wd = (along ? b.d : b.w) / 2;
  const sh = new THREE.Shape(); sh.moveTo(-Wd, 0); sh.lineTo(Wd, 0); sh.lineTo(0, rh); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  if (along) geo.rotateY(Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  const m = new THREE.Mesh(geo, texMat(type === 'tiles' ? 'tilesroof' : type === 'slate' ? 'slate' : type === 'snow' ? 'snowroof' : 'flatroof'));
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
  port: { sky: ['#020512', '#0b1630', '#1b2b55'], stars: true, moon: [-50, 40, 60], fog: ['#101c38', 18, 75], hemi: ['#9fb0e6', '#2a2232', 0.9], sun: ['#b9c8ff', 1.0, [-20, 30, 18]], floor: 'concrete', floorK: 4, stairs: 'steps', night: true },
  arena: { sky: ['#3b2466', '#d0674a', '#ffb070'], fog: ['#c98a6a', 45, 110], hemi: ['#ffe2c8', '#5a3a30', 1.0], sun: ['#ffb27a', 1.6, [-26, 22, 14]], floor: 'dirt', floorK: 3, stairs: 'stone', clouds: true },
  island: { sky: ['#2f8fe0', '#8fd3ff', '#e9f7ff'], fog: ['#cfeeff', 55, 140], hemi: ['#ffffff', '#c9a86a', 1.1], sun: ['#fff4d6', 2.0, [-20, 36, 12]], floor: 'sand', floorK: 4, stairs: 'wood', clouds: true },
  winter: { sky: ['#7fa8d4', '#c9dff2', '#eef4fb'], fog: ['#e2ecf6', 28, 95], hemi: ['#ffffff', '#93a8c2', 1.15], sun: ['#fff6e8', 1.5, [-20, 30, 10]], floor: 'snow', floorK: 4, stairs: 'wood', snow: true },
  toys: { bg: '#ffe2b8', fog: ['#ffe2b8', 45, 130], hemi: ['#ffffff', '#b38b5d', 1.25], sun: ['#fff2d9', 1.5, [-12, 30, 14]], floor: 'parquet', floorK: 3, stairs: 'wood' },
  moon: { sky: ['#000003', '#03040a', '#0d0f1a'], stars: true, earth: [60, 35, -80], fog: ['#0b0c14', 70, 160], hemi: ['#d8dcff', '#34343c', 0.75], sun: ['#ffffff', 2.4, [30, 26, -10]], floor: 'regolith', floorK: 5, stairs: 'steps', night: true },
  street: { sky: ['#2b2466', '#b75f86', '#ffbf7a'], fog: ['#c98f86', 40, 105], hemi: ['#ffe6cf', '#4a3a40', 0.95], sun: ['#ffbe85', 1.7, [-34, 20, 12]], floor: 'asphalt', floorK: 4, stairs: 'flagstone', clouds: true }
};
// какая текстура у какого блока: [текстура, метров на плитку, цвет]
const VIS = {
  wall: ['metalwall', 2.4], divider: ['divider', 2],
  stonewall: ['stone', 2.4], merlon: ['stone', 1.1], tower: ['stone', 2.4], hallwall: ['stone', 2.4], column: ['stone', 1.2], lowwall: ['stone', 1.4], ruin: ['stone', 1.4], pedestal: ['stone', 1], well: ['stone', 1.2], roofslab: ['wood', 2, '#fff', '#5a4a3a'], table: ['wood', 1.4],
  gravewall: ['mossy', 2.2], gpost: ['mossy', 1.3], plat: ['flagstone', 2], gstairs: ['flagstone', 1], crypt: ['mossy', 2.2], cryptroof: ['slate', 2, '#fff', '#2a2d38'],
  sidewalk: ['sidewalk', 2], brickwall: ['brick', 2.5], barrier: ['barrier', 1.6], plaster: ['plaster', 3.6], shopwall: ['shopwall', 3.6], ceil: ['wood', 2, '#fff', '#6a5a48'], facade: ['facade', 3.2], counter: ['wood', 1.2], dumpster: ['dumpster', 1.4], woodfence: ['woodfence', 1.5],
  ironfence: ['ironfence', 1.3], bars: ['bars', 1.3],
  parapet: ['brick', 2], acunit: ['metalwall', 1, '#c9d1dc'], escape: ['grate', 1], bus: ['bus', 3], kiosk: ['metalwall', 1.4, '#5fbf7a'], kioskroof: ['flatroof', 2],
  hutwall: ['logwall', 2], logwall2: ['logwall', 2], tower3: ['logwall', 2], sail: ['shipwhite', 2, '#fffaf0'], rock: ['rock', 2.4], snowbank: ['snow', 2], logs: ['logwall', 1.2, '#c99a6a'],
  kidwall: ['kidwall', 6], toywood: ['parquet', 2.4, '#ffd9a8'], mattress: ['mattress', 3], pillow: ['mattress', 2, '#ffe9f3'], mug: ['paint', 1, '#ff6b78'],
  toyR: ['toyblock', 1.6, '#ff5d6c'], toyB: ['toyblock', 1.6, '#4da3ff'], toyY: ['toyblock', 1.6, '#ffd23f'], toyG: ['toyblock', 1.6, '#5ee07a'],
  bookR: ['paint', 1, '#e63946'], bookB: ['paint', 1, '#3a6fd8'], bookG: ['paint', 1, '#2a9d5c'],
  moonpanel: ['moonpanel', 2.4], moonroof: ['moonpanel', 3, '#c9cdd6'], moonbox: ['moonpanel', 1.6, '#f2d27a'], moonbox2: ['moonpanel', 2.4, '#bcd3f2'], moonrock: ['regolith', 2, '#bdbdc2'],
  steps: ['steps', 1], tower2: ['stone', 2], hallfloor: ['flagstone', 2], shedwall: ['metalwall', 2.4, '#8a95a8'], fence2: ['metalwall', 2.4, '#5d6a7c'], lowcrate: ['crate', 1.2], hull: ['hull', 2.2], shipwall: ['shipwhite', 2.6], deckroof: ['grate', 1.2], crane: ['crane', 1.6], cabin: ['crane', 1.2], gangway: ['grate', 1], mast: ['shipwhite', 2]
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
    this.ents = new Map(); this.projs = new Map(); this.flags = new Map(); this.chests = new Map(); this.smokes = [];
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
  // пальма: изогнутый ствол из колец и большие листья
  palm(root, d) {
    const g = new THREE.Group(), trunk = std('#9b7247', { roughness: 0.9 }), leaf = std('#3f9b3a', { side: THREE.DoubleSide, roughness: 0.6 });
    const n = 8, h = d.h || 5;
    for (let i = 0; i < n; i++) { const k = i / n, seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - k * 0.06, 0.24 - k * 0.06, h / n + 0.05, 8), trunk); seg.position.set(Math.sin(k * 1.4) * 0.6, (i + 0.5) * h / n, 0); seg.rotation.z = -Math.cos(k * 1.4) * 0.12; seg.castShadow = true; g.add(seg); }
    const top = new THREE.Vector3(Math.sin(1.4) * 0.6, h, 0);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, lf = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7, 6, 1), leaf);
      const pa = lf.geometry.attributes.position; for (let j = 0; j < pa.count; j++) { const x = pa.getX(j) + 1.3; pa.setXYZ(j, x, -x * x * 0.12, pa.getY(j)); } lf.geometry.computeVertexNormals();
      lf.position.copy(top); lf.rotation.y = a; lf.castShadow = true; g.add(lf);
    }
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), std('#6b4a2a')); c.position.set(top.x + Math.cos(i * 2.1) * 0.25, h - 0.25, Math.sin(i * 2.1) * 0.25); g.add(c); }
    g.position.set(d.x, d.y || 0, d.z); g.rotation.y = (d.x * 7 + d.z * 3) % 6; root.add(g);
  }
  snowman(root, d) {
    const g = new THREE.Group(), w = std('#ffffff', { roughness: 0.9 });
    for (const [y, r] of [[0.5, 0.55], [1.25, 0.4], [1.85, 0.28]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), w); b.position.y = y; b.castShadow = true; g.add(b); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 8), std('#ff8c1a')); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.85, 0.36); g.add(nose);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), std('#111')); e.position.set(sx * 0.1, 1.95, 0.25); g.add(e); const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5), std('#6b4523')); arm.position.set(sx * 0.6, 1.4, 0); arm.rotation.z = sx * 1.0; g.add(arm); }
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 14), std('#222')); hat.position.y = 2.2; g.add(hat);
    const sc = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 16), std('#e63946')); sc.rotation.x = Math.PI / 2; sc.position.y = 1.58; g.add(sc);
    g.position.set(d.x, 0, d.z); g.rotation.y = Math.atan2(-d.x, -d.z); root.add(g);
  }
  rocket(root, d) {
    const g = new THREE.Group(), white = std('#eef2f6', { metalness: 0.3, roughness: 0.35 }), red = std('#e63946');
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 6, 20), white); body.position.y = 3.6; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1, 2.2, 20), red); nose.position.y = 7.7; g.add(nose);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), std('#5fc8ff', { emissive: '#2b8fd8', emissiveIntensity: 0.6 })); win.position.set(0, 5, 1.01); g.add(win);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 1.2), red); const a = i / 4 * Math.PI * 2; f.position.set(Math.cos(a) * 1.1, 1.3, Math.sin(a) * 1.1); f.rotation.y = -a; g.add(f); }
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.85, 0.6, 16), std('#555', { metalness: 0.7 })); noz.position.y = 0.3; g.add(noz);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(d.x, 0, d.z); root.add(g);
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
    if (th.earth) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g2 = c.getContext('2d'); g2.fillStyle = '#1f5fbf'; g2.fillRect(0, 0, 256, 128);
      g2.fillStyle = '#3aa45a'; for (let i = 0; i < 18; i++) { g2.beginPath(); g2.ellipse(Math.random() * 256, 20 + Math.random() * 88, 10 + Math.random() * 26, 6 + Math.random() * 14, Math.random() * 3, 0, 7); g2.fill(); }
      g2.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 22; i++) { g2.beginPath(); g2.ellipse(Math.random() * 256, Math.random() * 128, 8 + Math.random() * 20, 3 + Math.random() * 5, 0, 0, 7); g2.fill(); }
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const earth = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 20), new THREE.MeshBasicMaterial({ map: tx, fog: false }));
      earth.position.set(...th.earth).normalize().multiplyScalar(170); earth.rotation.z = 0.4; sky.add(earth);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshBasicMaterial({ color: '#6fb6ff', transparent: true, opacity: 0.15, fog: false, depthWrite: false })); glow.position.copy(earth.position); sky.add(glow);
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
    if ((m.base || m.id) === 'warehouse') this.buildWarehouse(root);
    this.dyn = { gates: [] };
    // статичные блоки склеиваем по материалу — меньше вызовов отрисовки
    const groups = new Map(), models = new Map();
    const addGeo = (key, mat, geo) => { if (!groups.has(key)) groups.set(key, { mat, geos: [] }); groups.get(key).geos.push(geo); };
    const addBox = (b, type, k, color = '#fff', glow) => { const geo = boxGeo(b, k); geo.translate(b.x, b.y + b.h / 2, b.z); addGeo(type + color + (glow || ''), texMat(type, color, glow), geo); };
    for (const b of m.boxes) {
      if (b.vis === 'floor' || b.vis === 'none' || b.vis === 'mover' || b.vis === 'blade') continue;
      if (b.dyn === 'gate') { const o = texBox({ ...b, y: 0 }, b.vis === 'portcullis' ? 'portcullis' : b.vis === 'bars' ? 'bars' : b.vis === 'drawbridge' ? 'wood' : 'shutter', b.vis === 'shutter' ? 1.5 : b.vis === 'drawbridge' ? 1 : 1.4, '#dfe6ee'); o.userData.h0 = b.h; root.add(o); this.dyn.gates.push(o); continue; }
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
    for (const d of m.deco || []) {
      if (d.rail) { const mat = std('#e0a91f', { metalness: 0.4 }); for (const h of [0.55, 1.05]) { const r = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.07, 0.07), mat); r.position.set(d.x, d.y + h, d.z); root.add(r); } for (let x = d.x - d.w / 2; x <= d.x + d.w / 2; x += 2) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), mat); p.position.set(x, d.y + 0.52, d.z); root.add(p); } continue; }
      if (d.msign) { const c = document.createElement('canvas'); c.width = c.height = 128; const g2 = c.getContext('2d'); g2.fillStyle = '#e63946'; g2.beginPath(); g2.arc(64, 64, 60, 0, 7); g2.fill(); g2.fillStyle = '#fff'; g2.font = 'bold 84px Rubik, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('М', 64, 70); const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide })); sp.position.set(d.x, d.y, d.z); root.add(sp); continue; }
      if (d.bell) { const pts = [[0, 0], [0.55, 0], [0.5, 0.15], [0.35, 0.6], [0.3, 0.9], [0.12, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y)); const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), std('#c9a23a', { metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide })); bell.scale.setScalar(0.8); bell.position.set(d.x, d.y - 0.8, d.z); root.add(bell); this.bell = bell; continue; }
      if (d.hang) { const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), std('#222')); cab.position.set(d.x, d.y + 1.6, d.z); root.add(cab); if (A.has('in/shipping-container-b')) root.add(fitModel('in/shipping-container-b', { x: d.x, y: d.y - 2.6, z: d.z, w: 6, h: 2.6, d: 2.8 }, 0)); this.hangBox = root.children[root.children.length - 1]; continue; }
      if (d.palm) { this.palm(root, d); continue; }
      if (d.snowman) { this.snowman(root, d); continue; }
      if (d.ball) { const b = new THREE.Mesh(new THREE.SphereGeometry(d.r, 24, 16), std('#fff', { map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); const cols = [d.c || '#ff5d6c', '#ffffff', '#ffd23f', '#ffffff']; cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 64); }); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.4 })); b.position.set(d.x, d.r, d.z); b.rotation.z = 0.4; b.castShadow = true; root.add(b); continue; }
      if (d.dome) { const m = new THREE.Mesh(new THREE.SphereGeometry(d.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.3, emissive: '#2b6fb0', emissiveIntensity: 0.3, depthWrite: false })); m.position.set(d.x, d.y, d.z); root.add(m); const r = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.08, 8, 32), std('#e9ecf2', { metalness: 0.5 })); r.rotation.x = Math.PI / 2; r.position.set(d.x, d.y, d.z); root.add(r); continue; }
      if (d.crater) { const m = new THREE.Mesh(new THREE.RingGeometry(d.r * 0.55, d.r, 28), new THREE.MeshStandardMaterial({ color: '#6e6e74', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.position.set(d.x, 0.02, d.z); root.add(m); const c = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.55, 24), new THREE.MeshStandardMaterial({ color: '#7f7f85', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); c.rotation.x = -Math.PI / 2; c.position.set(d.x, 0.015, d.z); root.add(c); continue; }
      if (d.rocket) { this.rocket(root, d); continue; }
      if (d.pad) { const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(d.w, d.d) / 2, Math.min(d.w, d.d) / 2 + 0.1, 0.18, 24), std('#2b2f38', { metalness: 0.5 })); base.position.y = 0.09; g.add(base); const top = new THREE.Mesh(new THREE.CircleGeometry(Math.min(d.w, d.d) / 2 - 0.15, 24), new THREE.MeshBasicMaterial({ color: d.c, transparent: true, opacity: 0.8 })); top.rotation.x = -Math.PI / 2; top.position.y = 0.19; g.add(top); const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(d.w, d.d) / 2 - 0.3, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring); g.position.set(d.x, d.y || 0, d.z); root.add(g); (this.padRings = this.padRings || []).push(ring); continue; }
      if (!A.has(d.model)) continue; if (!deco.has(d.model)) deco.set(d.model, []); deco.get(d.model).push(d); }
    for (const [name, list] of deco) { const o = instancedModels(name, list); if (o) root.add(o); }
    // светлячки над кладбищем
    if ((m.base || m.id) === 'graveyard') {
      const n = 140, pts = [];
      for (let i = 0; i < n; i++) pts.push((Math.random() - 0.5) * m.W * 2, 0.4 + Math.random() * 2.4, (Math.random() - 0.5) * m.D * 2);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.flies = new THREE.Points(g, new THREE.PointsMaterial({ color: '#d8ff7a', size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.flies.userData.base = pts.slice(); root.add(this.flies);
    }
    // снег идёт
    if (th.snow) {
      const n = 900, pts = [];
      for (let i = 0; i < n; i++) pts.push((Math.random() - 0.5) * m.W * 2.4, Math.random() * 14, (Math.random() - 0.5) * m.D * 2.4);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.snowPts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, transparent: true, opacity: 0.9, depthWrite: false })); root.add(this.snowPts);
    }
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
    let skin = 'none'; try { skin = JSON.parse(localStorage.getItem('ha_skin')) || 'none'; } catch (e) { }
    const g = makeGun(id, W, skin); g.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
    this.vmGun = g; this.vm.add(g);
    this.vmState.raise = 1;
    this.flash.position.set(0, 0.03, -(g.userData.len || 0.5) * 0.55 - 0.05);
  }
  // дуга полёта гранаты и место падения
  setArc(pts) {
    if (!this.arc) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(80 * 3), 3));
      this.arc = new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#ffe08a', dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.95, depthTest: false }));
      this.arc.renderOrder = 10; this.arc.frustumCulled = false; this.scene.add(this.arc);
      this.arcEnd = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 28), new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
      this.arcEnd.renderOrder = 10; this.scene.add(this.arcEnd);
    }
    const on = !!(pts && pts.length > 1);
    this.arc.visible = this.arcEnd.visible = on; if (!on) return;
    const a = this.arc.geometry.attributes.position, n = Math.min(80, pts.length);
    for (let i = 0; i < n; i++) a.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    a.needsUpdate = true; this.arc.geometry.setDrawRange(0, n); this.arc.computeLineDistances();
    const e = pts[n - 1]; this.arcEnd.position.set(e.x, e.y + 0.04, e.z); this.arcEnd.rotation.x = -Math.PI / 2;
    const k = 1 + Math.sin(performance.now() / 150) * 0.12; this.arcEnd.scale.setScalar(k);
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
        else if (type === 'smoke' || type === 'flash' || type === 'sticky') { g = new THREE.Group(); const c = { smoke: '#9aa3ad', flash: '#f4f7ff', sticky: '#ff4dc4' }[type]; const body = new THREE.Mesh(type === 'sticky' ? new THREE.SphereGeometry(0.13, 12, 8) : new THREE.CylinderGeometry(0.08, 0.08, 0.24, 12), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, emissive: type === 'sticky' ? '#5a0040' : '#000', emissiveIntensity: 0.4 })); body.rotation.x = Math.PI / 2; g.add(body); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), new THREE.MeshStandardMaterial({ color: '#444', metalness: 0.6 })); cap.position.y = type === 'sticky' ? 0.13 : 0.14; g.add(cap); }
        else if (type === 'banana' || type === 'bananaS') { g = new THREE.Group(); const sc = type === 'banana' ? 1 : 0.6; const b = new THREE.Mesh(new THREE.TorusGeometry(0.16 * sc, 0.06 * sc, 8, 16, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: '#ffe14d', roughness: 0.5 })); g.add(b); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035 * sc, 6, 6), new THREE.MeshStandardMaterial({ color: '#5a3b1a' })); tip.position.set(0.16 * sc, 0, 0); g.add(tip); }
        else if (type === 'bubble') { g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#bff4ff', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2, emissive: '#3dd6ff', emissiveIntensity: 0.25, depthWrite: false }))); const sh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); sh.position.set(-0.08, 0.1, 0.12); g.add(sh); }
        else { const c = { plasma: '#8a5bff', snow: '#ffffff', orb: '#b36bff', bossorb: '#ff2e63' }[type] || '#fff'; g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(type === 'snow' ? 0.14 : 0.18, 12, 8), new THREE.MeshBasicMaterial({ color: type === 'snow' ? '#ffffff' : '#fff4f4' }))); if (type !== 'snow') g.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))); g.userData.c = c; }
        g.position.set(x, y, z); this.scene.add(g); p = { g, type }; this.projs.set(id, p);
      }
      p.vx = vx; p.vy = vy; p.vz = vz; p.grav = grav;
      p.g.position.lerp(new THREE.Vector3(x, y, z), 0.5);
    }
    for (const [id, p] of this.projs) if (!seen.has(id)) { p.g.removeFromParent(); this.projs.delete(id); }
  }
  // сундуки с монетами
  syncChests(list) {
    const seen = new Set();
    for (const [id, x, y, z, secret] of list) {
      seen.add(id);
      if (this.chests.has(id)) continue;
      const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: secret ? '#7b2cbf' : '#8a5a2b', roughness: 0.7 }), gold = new THREE.MeshStandardMaterial({ color: '#ffd34d', metalness: 0.8, roughness: 0.3, emissive: '#6b4b00', emissiveIntensity: 0.4 });
      const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
      add(new THREE.BoxGeometry(0.8, 0.45, 0.55), wood, 0, 0.22, 0);
      const lid = add(new THREE.CylinderGeometry(0.275, 0.275, 0.8, 12, 1, false, 0, Math.PI), wood, 0, 0.45, 0); lid.rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(0.84, 0.06, 0.6), gold, 0, 0.44, 0);
      for (const sx of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.07, 0.75, 0.6), gold, sx, 0.35, 0);
      add(new THREE.BoxGeometry(0.14, 0.16, 0.05), gold, 0, 0.36, 0.29);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: secret ? '#d29bff' : '#ffd34d', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; g.add(glow);
      g.position.set(x, y, z); g.userData = { y, ph: Math.random() * 6, glow };
      this.scene.add(g); this.chests.set(id, g);
    }
    for (const [id, g] of this.chests) if (!seen.has(id)) { g.removeFromParent(); this.chests.delete(id); }
  }
  // облако дыма
  smoke(x, z, r, life) {
    const g = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const s = r * rnd(0.45, 0.75), m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: '#d5d9e0', emissive: '#8a9099', emissiveIntensity: 0.9, roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.55;
      m.position.set(x + Math.cos(a) * d, rnd(0.6, 2.4), z + Math.sin(a) * d); m.userData = { y: m.position.y, s }; m.scale.setScalar(s); g.add(m);
    }
    this.scene.add(g); this.smokes.push({ g, t: 0, life });
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
    if (this.bell) this.bell.rotation.z = Math.sin(t * 1.3) * 0.12;
    if (this.flies) { const pa = this.flies.geometry.attributes.position, bs = this.flies.userData.base; for (let i = 0; i < pa.count; i++) { pa.setXYZ(i, bs[i * 3] + Math.sin(t * 0.5 + i) * 0.8, bs[i * 3 + 1] + Math.sin(t * 1.3 + i * 2) * 0.3, bs[i * 3 + 2] + Math.cos(t * 0.4 + i) * 0.8); } pa.needsUpdate = true; this.flies.material.opacity = 0.6 + Math.sin(t * 3) * 0.3; }
    if (this.padRings) for (const r of this.padRings) { const k = (t * 1.2) % 1; r.position.y = 0.25 + k * 1.2; r.material.opacity = 1 - k; r.material.transparent = true; }
    if (this.snowPts) { const pa = this.snowPts.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) - dt * 1.4; if (y < 0) y += 14; pa.setY(i, y); pa.setX(i, pa.getX(i) + Math.sin(t + i) * dt * 0.3); } pa.needsUpdate = true; }
    if (this.hangBox) this.hangBox.rotation.y = Math.sin(t * 0.4) * 0.15;
    if (this.towerFlags) for (const f of this.towerFlags) f.rotation.y = Math.sin(t * 2 + f.position.x) * 0.25;
    if (this.skyMesh) this.skyMesh.position.copy(this.camera.position);
    if (this.convBoxes) for (const c of this.convBoxes) { const u = c.userData; c.position.x = u.x0 + ((c.position.x - u.x0 + dt * 1.2) % u.len); }
    for (const a of this.ents.values()) a.update(dt, null);
    for (const p of this.projs.values()) { p.vy -= (p.grav || 0) * dt; p.g.position.x += p.vx * dt; p.g.position.y += p.vy * dt; p.g.position.z += p.vz * dt; if (p.type === 'grenade' || p.type === 'smoke' || p.type === 'flash' || p.type === 'banana' || p.type === 'bananaS') { p.g.rotation.x += dt * 8; } else if (p.type === 'bubble' || p.type === 'sticky') { p.g.scale.setScalar(1 + Math.sin(t * 9) * 0.08); } else if (Math.random() < 0.5 && p.g.userData.c) this.particle(p.g.position.x, p.g.position.y, p.g.position.z, 0, 0, 0, p.g.userData.c, 0.25, 0.08, 0); }
    for (const c of this.chests.values()) { c.rotation.y += dt * 0.8; c.position.y = c.userData.y + Math.sin(t * 2.5 + c.userData.ph) * 0.06; c.userData.glow.material.opacity = 0.35 + Math.sin(t * 4) * 0.15; }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i]; sm.t += dt; const k = sm.t / sm.life;
      if (k >= 1) { sm.g.removeFromParent(); sm.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); this.smokes.splice(i, 1); continue; }
      const op = Math.min(1, sm.t * 2.5) * (k > 0.8 ? (1 - k) / 0.2 : 1);
      sm.g.children.forEach((m, j) => { m.material.opacity = 0.9 * op; m.position.y = m.userData.y + Math.sin(t * 0.6 + j) * 0.15; m.scale.setScalar(m.userData.s * (0.6 + Math.min(1, sm.t) * 0.4)); });
    }
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
      const want2 = Math.max(0.4, Math.min(L, hit.t - 0.3));
      // к стене приближаемся сразу, отъезжаем плавно — без дёрганья
      this.camDist = this.camDist == null || want2 < this.camDist ? want2 : this.camDist + (want2 - this.camDist) * Math.min(1, dt * 6);
      cam.position.copy(pivot).addScaledVector(d, this.camDist);
    }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); cam.position.x += rnd(-1, 1) * this.shake * 0.08; cam.position.y += rnd(-1, 1) * this.shake * 0.08; }
    cam.lookAt(cam.position.clone().add(fwd));
    const fov = 72 / this.zoom;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix(); }
    // оружие в руках
    const vs = this.vmState;
    vs.kick = Math.max(0, vs.kick - dt * 8); vs.raise = Math.max(0, vs.raise - dt * 4);
    this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 25);
    const bob = this.moving ? Math.sin(t * 10) * 0.012 : 0, breath = Math.sin(t * 1.6) * 0.004;
    const rel = this.reloading ? 1 : 0; vs.reload += (rel - vs.reload) * Math.min(1, dt * 10);
    // оружие чуть отстаёт при повороте и прыжке — ощущается «в руках»
    let dy = (this.yaw - (vs.lastYaw ?? this.yaw)); dy = Math.atan2(Math.sin(dy), Math.cos(dy)); vs.lastYaw = this.yaw;
    const dp = this.pitch - (vs.lastPitch ?? this.pitch); vs.lastPitch = this.pitch;
    const k = Math.min(1, dt * 9);
    vs.sx = (vs.sx || 0) + (clamp(dy * 1.6, -0.06, 0.06) - (vs.sx || 0)) * k;
    vs.sy = (vs.sy || 0) + (clamp(-dp * 1.6, -0.05, 0.05) - (vs.sy || 0)) * k;
    vs.cr = (vs.cr || 0) + ((this.crouch ? 1 : 0) - (vs.cr || 0)) * k;
    const shake = vs.reload > 0.5 ? Math.sin(t * 22) * 0.02 * vs.reload : 0; // «вставляем магазин»
    const sw = this.melee ? vs.kick : 0; // нож — взмах вбок
    this.vm.position.set(0.2 + bob * 0.5 + vs.sx - sw * 0.12, -0.19 + Math.abs(bob) + breath + vs.sy - vs.raise * 0.25 - vs.reload * 0.12 - vs.cr * 0.02, -0.48 + (this.melee ? -sw * 0.08 : vs.kick * 0.05));
    this.vm.scale.setScalar(0.72);
    this.vm.rotation.set((this.melee ? -sw * 0.5 : vs.kick * 0.12) - vs.reload * 0.6 + shake, 0.04 + vs.sx * 2 + sw * 0.9, vs.reload * 0.3 - vs.sx * 3 + vs.cr * 0.08);
    this.vm.visible = (this.camMode === 'fps' && !this.scoped && this.alive);
  }
  render(renderer) {
    // тени пересчитываем через кадр: вдвое меньше работы для видеокарты
    this.frameN = (this.frameN || 0) + 1;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = this.frameN % 2 === 1;
    renderer.render(this.scene, this.camera);
    if (this.vm.visible && this.vmGun) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.vmScene, this.vmCam); renderer.autoClear = true; }
  }
  dispose() { if (R.renderer) R.renderer.shadowMap.autoUpdate = true; for (const a of this.ents.values()) a.dispose(); this.scene.traverse(o => { if (o.element) o.element.remove(); }); }
}
