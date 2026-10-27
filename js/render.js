// 3D-отрисовка: сцена, герои, эффекты, камера.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texMat, boxGeo, canvasTex } from './tex.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as A from './assets.js';
import { CLASSES, AURAS, TEAM_COLORS, PETS, PACKS, TRAILS, SKINS, clamp, rnd, esc } from './util.js';

// ---------- общий рендерер ----------
export const R = {
  renderer: null, labels: null, view: null, clock: new THREE.Clock(), quality: 'high',
  init(canvas, labelsEl) {
    let lowEnd = matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 500;
    // слабая встроенная графика (старые Маки и ноутбуки с Intel) — сразу режим «Быстро»
    try {
      const gl = document.createElement('canvas').getContext('webgl'), ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      this.gpu = gpu;
      if (/Intel|SwiftShader|llvmpipe|Mali-4|Adreno \(TM\) [345]/i.test(gpu) || (navigator.hardwareConcurrency || 8) <= 2) lowEnd = true;
    } catch (e) { }
    this.quality = localStorage.getItem('ha_quality') ? JSON.parse(localStorage.getItem('ha_quality')) : (lowEnd ? 'low' : 'high');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.applyQuality();
    this.labels = new CSS2DRenderer({ element: labelsEl });
    addEventListener('resize', () => this.resize());
    this.resize();
    // если игра тормозит — сами снижаем качество (сначала тени и чёткость, потом разрешение)
    let fpsT = 0, fpsN = 0, slow = 0;
    this.scale = 1;
    const watchFps = raw => {
      if (!this.view || !this.view.ents) { fpsT = fpsN = 0; return; }
      fpsT += raw; fpsN++;
      if (fpsT < 4) return;
      const fps = fpsN / fpsT; fpsT = fpsN = 0;
      if (fps >= (this.saver ? 22 : 26)) { slow = 0; return; }
      if (++slow < 2) return; slow = 0;
      if (this.quality === 'high') { this.setQuality('low'); this.onAuto && this.onAuto('Игра тормозила — включили режим «Быстро»'); }
      else if (this.scale > 0.5) { this.scale = Math.max(0.5, this.scale - 0.15); this.applyQuality(); }
    };
    // экономия батареи: не больше 30 кадров в секунду и меньше точек на экране
    try { this.saver = JSON.parse(localStorage.getItem('ha_saver')) === true; } catch (e) { this.saver = false; }
    let acc = 0;
    const loop = () => {
      requestAnimationFrame(loop);
      let raw = this.clock.getDelta();
      if (this.saver) { acc += raw; if (acc < 1 / 31) return; raw = acc; acc = 0; }
      const dt = Math.min(0.05, raw);
      if (raw < 1) watchFps(raw);
      if (this.view) {
        this.view.update(dt);
        if (this.view.render) this.view.render(this.renderer); else this.renderer.render(this.view.scene, this.view.camera);
        const hide = !!(this.view.cams);
        this.labels.domElement.style.visibility = hide ? 'hidden' : '';
        if (!hide) this.labels.render(this.view.scene, this.view.camera);
      }
    };
    loop();
  },
  applyQuality() {
    const hi = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, hi && !this.saver ? 1.5 : 1) * (this.scale || 1) * (this.saver ? 0.8 : 1));
    this.renderer.shadowMap.enabled = hi;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  },
  setSaver(on) { this.saver = on; localStorage.setItem('ha_saver', JSON.stringify(on)); this.applyQuality(); },
  setQuality(q) { this.quality = q; localStorage.setItem('ha_quality', JSON.stringify(q)); this.applyQuality(); if (this.view && this.view.onQuality) this.view.onQuality(); },
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    if (this.view) this.view.resize(w, h);
  },
  setView(v) {
    if (this.view && this.view.dispose) this.view.dispose();
    this.view = v;
    if (v) v.resize(innerWidth, innerHeight);
  }
};

// ---------- текстуры пола (рисуются в canvas) ----------
const texCache = {};
export function floorTexture(type) {
  if (texCache[type]) return texCache[type];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const noise = (n, a, col) => { for (let i = 0; i < n; i++) { g.fillStyle = col(); g.globalAlpha = a; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); } g.globalAlpha = 1; };
  const tiles = (cols, size, base, grout, jitter) => {
    g.fillStyle = grout; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += size) for (let x = 0; x < 256; x += size) {
      const l = jitter ? rnd(-jitter, jitter) : 0;
      g.fillStyle = shade(pickc(cols), l); g.fillRect(x + 2, y + 2, size - 4, size - 4);
    }
  };
  const pickc = a => a[Math.random() * a.length | 0];
  const shade = (hex, l) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = n >> 8 & 255, b = n & 255; r = clamp(r + l, 0, 255); gg = clamp(gg + l, 0, 255); b = clamp(b + l, 0, 255); return `rgb(${r},${gg},${b})`; };
  switch (type) {
    case 'arena': tiles(['#d9c7a3', '#d2bf98', '#e0cfad'], 64, 0, '#b5a07c', 8); noise(500, .15, () => '#8b7650'); break;
    case 'wood': for (let y = 0; y < 256; y += 32) { g.fillStyle = shade(pickc(['#9a6a3d', '#a8754a', '#8f6036']), rnd(-10, 10)); g.fillRect(0, y, 256, 30); g.fillStyle = '#5e3d20'; g.fillRect(0, y + 30, 256, 2); g.fillRect(rnd(0, 256), y, 2, 30); } break;
    case 'planks': for (let x = 0; x < 256; x += 42) { g.fillStyle = shade('#8a7356', rnd(-14, 14)); g.fillRect(x, 0, 40, 256); g.fillStyle = '#4c3c2a'; g.fillRect(x + 40, 0, 2, 256); } noise(300, .2, () => '#3b2e20'); break;
    case 'stone': tiles(['#8d8f9c', '#979aa6', '#868895'], 64, 0, '#5d5f6b', 10); break;
    case 'stone2': tiles(['#9b8fa8', '#a597b3', '#8f839c'], 85, 0, '#615672', 8); break;
    case 'tile': for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) { g.fillStyle = ((x + y) / 32) % 2 ? '#f1ece0' : '#5a7fa6'; g.fillRect(x, y, 32, 32); } break;
    case 'carpet': g.fillStyle = '#6d4a8f'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#8b66ad'; g.lineWidth = 6; for (let i = -256; i < 256; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke(); } break;
    case 'royal': g.fillStyle = '#a32e3c'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#e2b648'; g.lineWidth = 4; g.strokeRect(12, 12, 232, 232); g.fillStyle = '#c23f4e'; g.fillRect(40, 40, 176, 176); break;
    case 'dirt': g.fillStyle = '#8b7355'; g.fillRect(0, 0, 256, 256); noise(1400, .35, () => pickc(['#7a6247', '#9c8464', '#6e573d'])); break;
    case 'grass': g.fillStyle = '#5f9b4a'; g.fillRect(0, 0, 256, 256); noise(1800, .45, () => pickc(['#6cad54', '#558c42', '#79b95f'])); break;
    case 'ground': g.fillStyle = '#4f7d43'; g.fillRect(0, 0, 256, 256); noise(1600, .4, () => pickc(['#5a8c4b', '#46713b', '#628f50'])); break;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache[type] = t;
  return t;
}
function floorMesh(type, w, d, rep = 4) {
  const t = floorTexture(type).clone(); t.needsUpdate = true;
  t.repeat.set(w / rep, d / rep);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
  return m;
}

// ---------- шапки ----------
function std(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); }
export function buildHat(id) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
  const dome = (r, c) => new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  switch (id) {
    case 'cap': { // кепка с козырьком, пуговкой и звездой
      const red = std('#e63946'), dark = std('#a4161a');
      add(dome(0.55), red, 0, 0, 0);
      for (let i = 0; i < 6; i++) { const l = add(new THREE.TorusGeometry(0.55, 0.012, 4, 24, Math.PI / 2), dark, 0, 0, 0); l.rotation.set(0, i / 6 * Math.PI * 2, Math.PI / 2); }
      add(new THREE.SphereGeometry(0.07, 10, 8), dark, 0, 0.55, 0);
      const v = add(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24, 1, false, -Math.PI / 2, Math.PI), dark, 0, 0.03, 0.18); v.scale.set(1, 1, 1.1);
      add(new THREE.CylinderGeometry(0.56, 0.56, 0.08, 24, 1, true), std('#fff', { side: THREE.DoubleSide }), 0, 0.06, 0);
      const st = add(new THREE.OctahedronGeometry(0.13, 0), std('#ffd60a', { emissive: '#7a5b00', emissiveIntensity: 0.5 }), 0, 0.3, 0.47); st.scale.set(1, 1, 0.3); break; }
    case 'party': { // колпак в полоску с помпоном
      const cols = ['#ffb703', '#3a86ff', '#ff006e', '#8ac926'];
      for (let i = 0; i < 4; i++) { const h0 = i * 0.25, r0 = 0.42 * (1 - h0), r1 = 0.42 * (1 - h0 - 0.25); add(new THREE.CylinderGeometry(Math.max(0.001, r1), r0, 0.25, 18), std(cols[i]), 0, h0 + 0.125, 0); }
      const pom = add(new THREE.IcosahedronGeometry(0.15, 1), std('#ffffff', { roughness: 1 }), 0, 1.04, 0);
      add(new THREE.TorusGeometry(0.42, 0.06, 6, 20), std('#ffffff', { roughness: 1 }), 0, 0.02, 0).rotation.x = Math.PI / 2; break; }
    case 'tophat': { // цилиндр с лентой, пряжкой и цветком
      const blk = std('#1d1d24', { roughness: 0.4 });
      add(new THREE.CylinderGeometry(0.44, 0.4, 0.85, 24), blk, 0, 0.45, 0);
      add(new THREE.CylinderGeometry(0.75, 0.75, 0.05, 28), blk, 0, 0.04, 0);
      add(new THREE.TorusGeometry(0.73, 0.04, 6, 28), blk, 0, 0.07, 0).rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.415, 0.415, 0.16, 24), std('#d62828'), 0, 0.17, 0);
      add(new THREE.BoxGeometry(0.16, 0.14, 0.03), std('#ffd34d', { metalness: 0.8, roughness: 0.3 }), 0, 0.17, 0.42);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(new THREE.SphereGeometry(0.06, 8, 6), std('#ffffff'), 0.3 + Math.cos(a) * 0.07, 0.2 + Math.sin(a) * 0.07, 0.33); }
      add(new THREE.SphereGeometry(0.05, 8, 6), std('#ffd60a'), 0.3, 0.2, 0.37); break; }
    case 'viking': { // шлем с заклёпками и рогами
      const steel = std('#9aa0a6', { metalness: 0.6, roughness: 0.35 }), band = std('#7a5230');
      add(dome(0.58), steel, 0, -0.05, 0);
      add(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 24, 1, true), band, 0, 0.0, 0).material.side = THREE.DoubleSide;
      add(new THREE.BoxGeometry(0.09, 0.08, 1.2), band, 0, 0.46, 0).rotation.x = 0;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(new THREE.SphereGeometry(0.04, 6, 6), std('#ffd34d', { metalness: 0.8 }), Math.cos(a) * 0.6, 0.0, Math.sin(a) * 0.6); }
      for (const s2 of [-1, 1]) { // рог — изогнутая трубка с острым кончиком
        const cv = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s2 * 0.45, 0.12, 0), new THREE.Vector3(s2 * 0.95, 0.2, 0), new THREE.Vector3(s2 * 0.9, 0.62, 0));
        add(new THREE.TubeGeometry(cv, 12, 0.085, 8), std('#f1e3c3'));
        const tip = add(new THREE.ConeGeometry(0.085, 0.24, 8), std('#d9c7a0'), s2 * 0.9, 0.62, 0);
        const tg = cv.getTangent(1); tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg); tip.position.addScaledVector(tg, 0.11);
      } break; }
    case 'wizard': { // шляпа мага со звёздами и луной
      const pur = std('#7b2cbf'), dk = std('#5a189a');
      add(new THREE.CylinderGeometry(0.88, 0.88, 0.05, 28), dk, 0, 0.03, 0);
      add(new THREE.ConeGeometry(0.5, 1.0, 20), pur, 0, 0.53, 0);
      const tip = add(new THREE.ConeGeometry(0.2, 0.5, 14), pur, 0.12, 1.08, 0); tip.rotation.z = -0.5;
      add(new THREE.CylinderGeometry(0.51, 0.51, 0.12, 20), std('#ffd60a'), 0, 0.1, 0);
      const gold = std('#ffd60a', { emissive: '#ffb703', emissiveIntensity: 0.7 });
      for (const [x, y, z, sc] of [[0.18, 0.55, 0.36, 1], [-0.22, 0.85, 0.24, 0.7], [0.1, 1.05, 0.15, 0.55]]) add(new THREE.OctahedronGeometry(0.1 * sc), gold, x, y, z);
      const moon = add(new THREE.TorusGeometry(0.09, 0.035, 6, 14, Math.PI * 1.3), gold, -0.25, 0.45, 0.4); moon.rotation.z = 0.6; break; }
    case 'crown': {
      const gold = std('#ffd34d', { metalness: 0.85, roughness: 0.25, emissive: '#6b4b00', emissiveIntensity: 0.3 });
      add(new THREE.CylinderGeometry(0.5, 0.46, 0.32, 24, 1, true), gold, 0, 0.16, 0).material.side = THREE.DoubleSide;
      add(new THREE.TorusGeometry(0.47, 0.035, 6, 28), gold, 0, 0.01, 0).rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.5, 0.03, 6, 28), gold, 0, 0.32, 0).rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(new THREE.ConeGeometry(0.09, 0.3, 6), gold, Math.cos(a) * 0.48, 0.47, Math.sin(a) * 0.48); add(new THREE.SphereGeometry(0.045, 8, 6), std('#fff8e1', { metalness: 0.3, roughness: 0.2 }), Math.cos(a) * 0.48, 0.64, Math.sin(a) * 0.48); }
      const gems = ['#e63946', '#3a86ff', '#2ec4b6', '#b36bff'];
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 2; const gm = add(new THREE.OctahedronGeometry(0.075), std(gems[i], { emissive: gems[i], emissiveIntensity: 0.35, roughness: 0.15 }), Math.cos(a) * 0.5, 0.16, Math.sin(a) * 0.5); gm.scale.set(1, 1.3, 0.6); gm.lookAt(0, 0.16, 0); } break; }
    case 'halo': {
      const ring = new THREE.Group(); ring.position.y = 0.55; g.add(ring);
      const h = add(new THREE.TorusGeometry(0.45, 0.06, 10, 36), new THREE.MeshBasicMaterial({ color: '#fff3b0' }), 0, 0, 0, ring); h.rotation.x = Math.PI / 2; h.castShadow = false;
      const glow = add(new THREE.TorusGeometry(0.45, 0.14, 8, 36), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0, 0, ring); glow.rotation.x = Math.PI / 2; glow.castShadow = false;
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; const sp = add(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.cos(a) * 0.45, 0.04, Math.sin(a) * 0.45, ring); sp.castShadow = false; }
      g.userData.spin = ring; g.userData.bob = ring; break; }
    case 'propeller': {
      const q = [std('#3a86ff'), std('#ffbe0b'), std('#ff006e'), std('#8ac926')];
      for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.5, 10, 8, i * Math.PI / 2, Math.PI / 2, 0, Math.PI / 2), q[i], 0, 0, 0);
      add(new THREE.CylinderGeometry(0.51, 0.51, 0.06, 24, 1, true), std('#ffffff', { side: THREE.DoubleSide }), 0, 0.03, 0);
      add(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), std('#555', { metalness: 0.6 }), 0, 0.6, 0);
      const p = new THREE.Group(); p.position.y = 0.76; g.add(p);
      add(new THREE.SphereGeometry(0.07, 10, 8), std('#ff006e'), 0, 0, 0, p);
      for (let i = 0; i < 3; i++) { const bl = add(new THREE.BoxGeometry(0.55, 0.025, 0.16), std(['#ff006e', '#ffbe0b', '#3a86ff'][i]), 0, 0, 0, p); const a = i / 3 * Math.PI * 2; bl.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); bl.rotation.set(0.25, -a, 0); }
      g.userData.spin = p; break; }
  }
  return g;
}

// ---------- питомец: летает рядом с героем ----------
function eyes(par, r, y, z, gap = 0.45) {
  const w = std('#ffffff'), b = std('#1a1a22');
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), w); e.position.set(sx * r * gap * 2.2, y, z); par.add(e); const p2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 8, 6), b); p2.position.set(sx * r * gap * 2.2, y, z + r * 0.6); par.add(p2); }
}
export function buildPet(id) {
  const g = new THREE.Group(), it = PETS.find(x => x.id === id); if (!it || id === 'none') return null;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (id) {
    case 'chick': {
      add(new THREE.SphereGeometry(0.22, 16, 12), std('#ffd23f'), 0, 0, 0).scale.set(1, 0.95, 1.05);
      add(new THREE.SphereGeometry(0.15, 14, 10), std('#ffdd55'), 0, 0.22, 0.06);
      const bk = add(new THREE.ConeGeometry(0.05, 0.12, 8), std('#ff8c1a'), 0, 0.2, 0.22); bk.rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) { const w = add(new THREE.SphereGeometry(0.1, 10, 8), std('#ffc21a'), sx * 0.2, 0.02, -0.02); w.scale.set(0.4, 0.8, 1); g.userData['wing' + sx] = w; }
      add(new THREE.ConeGeometry(0.04, 0.1, 6), std('#ff8c1a'), 0, 0.38, 0.04);
      eyes(g, 0.035, 0.27, 0.17); break; }
    case 'slime': {
      add(new THREE.SphereGeometry(0.24, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), std('#5ee07a', { transparent: true, opacity: 0.8, roughness: 0.15, emissive: '#1d6b30', emissiveIntensity: 0.4 }), 0, -0.05, 0).scale.set(1, 0.9, 1);
      add(new THREE.SphereGeometry(0.07, 10, 8), std('#2fa84f'), 0.05, -0.02, 0);
      eyes(g, 0.045, 0.1, 0.17); break; }
    case 'robot': {
      add(new THREE.SphereGeometry(0.22, 18, 14), std('#c3d0dc', { metalness: 0.6, roughness: 0.3 }));
      const band = add(new THREE.TorusGeometry(0.2, 0.05, 8, 24, Math.PI * 0.7), std('#3df5ff', { emissive: '#3df5ff', emissiveIntensity: 1.2 }), 0, 0.03, 0.04); band.rotation.z = Math.PI * 0.15 + Math.PI; band.rotation.x = 0.1;
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), std('#555'), 0, 0.3, 0);
      add(new THREE.SphereGeometry(0.04, 8, 6), std('#ff4d5e', { emissive: '#ff4d5e', emissiveIntensity: 1 }), 0, 0.4, 0);
      for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), std('#7d8a96', { metalness: 0.6 }), sx * 0.22, 0, 0).rotation.z = Math.PI / 2;
      break; }
    case 'ghosty': {
      const m = std('#eef4ff', { transparent: true, opacity: 0.85, emissive: '#8fa8ff', emissiveIntensity: 0.25 });
      add(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.06, 0);
      add(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 16, 1, true), m, 0, -0.04, 0).material.side = THREE.DoubleSide;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const c = add(new THREE.ConeGeometry(0.06, 0.12, 6), m, Math.cos(a) * 0.19, -0.19, Math.sin(a) * 0.19); c.rotation.x = Math.PI; }
      eyes(g, 0.04, 0.1, 0.16); break; }
    case 'dragon': {
      const red = std('#ff5d3d', { emissive: '#7a1400', emissiveIntensity: 0.3 }), bel = std('#ffd28a');
      add(new THREE.SphereGeometry(0.2, 16, 12), red, 0, 0, 0).scale.set(1, 0.9, 1.15);
      add(new THREE.SphereGeometry(0.12, 12, 10), bel, 0, -0.03, 0.12).scale.set(1, 1, 0.6);
      add(new THREE.SphereGeometry(0.15, 14, 10), red, 0, 0.2, 0.15);
      add(new THREE.SphereGeometry(0.08, 10, 8), bel, 0, 0.16, 0.28).scale.set(1, 0.7, 0.8);
      for (const sx of [-1, 1]) {
        add(new THREE.ConeGeometry(0.03, 0.12, 6), std('#ffe9b0'), sx * 0.07, 0.36, 0.1).rotation.z = -sx * 0.3;
        const w = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 3), std('#c41e3a', { side: THREE.DoubleSide })); w.position.set(sx * 0.2, 0.08, -0.05); w.rotation.set(0, 0, sx * 1.9); w.scale.set(1, 1, 0.15); g.add(w); g.userData['wing' + sx] = w;
      }
      const t = add(new THREE.ConeGeometry(0.06, 0.3, 8), red, 0, -0.06, -0.28); t.rotation.x = -Math.PI / 2 - 0.4;
      eyes(g, 0.035, 0.26, 0.26); break; }
  }
  return g;
}
// ---------- рюкзак на спине ----------
export function buildPack(id) {
  const g = new THREE.Group(); if (!id || id === 'none') return null;
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (id) {
    case 'school': {
      const b = std('#3a86ff'), d = std('#1f5fcf');
      add(new THREE.BoxGeometry(0.62, 0.72, 0.3), b, 0, 0, -0.15);
      add(new THREE.BoxGeometry(0.64, 0.3, 0.32), d, 0, 0.22, -0.15);
      add(new THREE.BoxGeometry(0.4, 0.26, 0.08), d, 0, -0.14, -0.33);
      add(new THREE.BoxGeometry(0.1, 0.06, 0.03), std('#ffd34d', { metalness: 0.7 }), 0, 0.08, -0.32);
      break; }
    case 'rocket': {
      const r = std('#e63946'), w = std('#eef2f6', { metalness: 0.4, roughness: 0.3 });
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.13, 0.13, 0.6, 14), w, sx * 0.17, 0, -0.18);
        add(new THREE.ConeGeometry(0.13, 0.22, 14), r, sx * 0.17, 0.41, -0.18);
        add(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 12), std('#444', { metalness: 0.7 }), sx * 0.17, -0.34, -0.18);
        const f = add(new THREE.ConeGeometry(0.09, 0.32, 10), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), sx * 0.17, -0.55, -0.18); f.rotation.x = Math.PI; f.castShadow = false;
        (g.userData.flames = g.userData.flames || []).push(f);
      }
      add(new THREE.BoxGeometry(0.2, 0.3, 0.08), r, 0, 0, -0.06); break; }
    case 'wings': {
      const m = std('#ffffff', { emissive: '#bcd6ff', emissiveIntensity: 0.35, side: THREE.DoubleSide });
      for (const sx of [-1, 1]) {
        const piv = new THREE.Group(); piv.position.set(sx * 0.1, 0.12, -0.16); g.add(piv);
        for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.3 - i * 0.06, 12, 8), m); f.scale.set(1.3, 0.45, 0.1); f.position.set(sx * (0.32 + i * 0.12), 0.08 - i * 0.14, 0); f.rotation.z = sx * (0.35 + i * 0.25); f.castShadow = true; piv.add(f); }
        g.userData['wing' + sx] = piv;
      } break; }
    case 'cape': {
      const geo = new THREE.PlaneGeometry(0.8, 1.15, 6, 8); geo.translate(0, -0.575, 0);
      const c = new THREE.Mesh(geo, std('#d62828', { side: THREE.DoubleSide, emissive: '#3a0000', emissiveIntensity: 0.3 })); c.position.set(0, 0.36, -0.2); c.castShadow = true; g.add(c);
      const trim = add(new THREE.BoxGeometry(0.84, 0.08, 0.06), std('#ffd34d', { metalness: 0.8, roughness: 0.3 }), 0, 0.36, -0.17);
      g.userData.cape = c; c.userData.base = geo.attributes.position.array.slice(); break; }
  }
  return g;
}
// следы под ногами: картинки рисуются один раз
const trailTex = {};
function trailTexture(kind) {
  if (trailTex[kind]) return trailTex[kind];
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); c.fillStyle = '#fff';
  if (kind === 'steps') { c.beginPath(); c.ellipse(32, 40, 13, 16, 0, 0, Math.PI * 2); c.fill(); for (const [x, y] of [[16, 18], [27, 11], [38, 11], [49, 18]]) { c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); } }
  else if (kind === 'stars') { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 30, a = i / 10 * Math.PI * 2 - Math.PI / 2; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } c.fill(); }
  else if (kind === 'hearts') { c.beginPath(); c.moveTo(32, 56); c.bezierCurveTo(2, 34, 10, 6, 32, 20); c.bezierCurveTo(54, 6, 62, 34, 32, 56); c.fill(); }
  else { const gr = c.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return (trailTex[kind] = t);
}
// раскраска оружия
function skinGun(g, skin) {
  const it = SKINS.find(x => x.id === skin); if (!it || !it.color) return;
  g.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material; if (skin !== 'camo') m.map = null; m.color = skin === 'camo' ? new THREE.Color(m.color || '#fff').lerp(new THREE.Color(it.color), 0.55) : new THREE.Color(it.color); m.needsUpdate = true;
    if (skin === 'gold') { m.metalness = 0.85; m.roughness = 0.22; m.emissive = new THREE.Color('#5a3b00'); m.emissiveIntensity = 0.35; }
    if (skin === 'diamond' || skin === 'ice') { m.metalness = 0.3; m.roughness = 0.08; m.emissive = new THREE.Color(it.color); m.emissiveIntensity = skin === 'diamond' ? 0.45 : 0.2; }
    if (skin === 'candy') { m.roughness = 0.3; m.emissive = new THREE.Color('#5a0040'); m.emissiveIntensity = 0.25; }
  });
}

// картинка вещи для магазина: рисуем 3D-модель один раз в маленькую картинку
const thumbCache = {};
export function hatThumb(id, kind = 'hat') {
  const ck = kind + ':' + id;
  if (thumbCache[ck]) return thumbCache[ck];
  const r = R.renderer; if (!r || id === 'none') return null;
  try {
    const S = 128, rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight('#ffffff', '#5a4b8a', 1.6));
    const dl = new THREE.DirectionalLight('#ffffff', 2.2); dl.position.set(2, 4, 3); sc.add(dl);
    const hat = kind === 'pet' ? buildPet(id) : kind === 'pack' ? buildPack(id) : buildHat(id); if (!hat) return null; if (kind === 'pack') hat.rotation.y = Math.PI * 0.8; sc.add(hat);
    const box = new THREE.Box3().setFromObject(hat), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50), d = Math.max(sz.x, sz.y, sz.z) * 2.3;
    cam.position.set(c.x + d * 0.35, c.y + d * 0.45, c.z + d * 0.85); cam.lookAt(c);
    const prevT = r.getRenderTarget(), prevC = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(sc, cam);
    const px = new Uint8Array(S * S * 4); r.readRenderTargetPixels(rt, 0, 0, S, S, px);
    r.setRenderTarget(prevT); r.setClearColor(prevC, prevA);
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g2 = cv.getContext('2d'), im = g2.createImageData(S, S);
    for (let y = 0; y < S; y++) im.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4); // картинка из видеокарты перевёрнута
    g2.putImageData(im, 0, 0);
    rt.dispose(); sc.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    return (thumbCache[ck] = cv.toDataURL());
  } catch (e) { return null; }
}

// ---------- оружие ----------
function buildWeapon(cls, color) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const metal = std('#eef2f6', { metalness: 0.25, roughness: 0.35 }), wood = std('#8a5a2b'), dark = std('#2b2d42');
  if (cls === 'knight') { add(new THREE.BoxGeometry(0.08, 0.95, 0.03), metal, 0, 0.55, 0); add(new THREE.BoxGeometry(0.32, 0.06, 0.08), std('#c9a227'), 0, 0.08, 0); add(new THREE.BoxGeometry(0.06, 0.22, 0.06), wood, 0, -0.05, 0); }
  else if (cls === 'ninja') { add(new THREE.BoxGeometry(0.05, 0.85, 0.02), metal, 0, 0.5, 0); add(new THREE.BoxGeometry(0.16, 0.04, 0.12), std('#c9a227'), 0, 0.08, 0); add(new THREE.BoxGeometry(0.05, 0.25, 0.05), dark, 0, -0.06, 0); }
  else if (cls === 'mage') { add(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 8), wood, 0, 0.35, 0); const orb = add(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: color || '#ff7eb6', emissive: color || '#ff7eb6', emissiveIntensity: 1.4 }), 0, 1.15, 0); g.userData.orb = orb; }
  else if (cls === 'archer') { const bow = add(new THREE.TorusGeometry(0.5, 0.03, 6, 20, Math.PI), wood, 0, 0.1, 0); bow.rotation.z = -Math.PI / 2; const str = add(new THREE.CylinderGeometry(0.006, 0.006, 1.0, 4), std('#eee'), 0, 0.1, 0); }
  return g;
}
function buildShield(color) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.08), std(color || '#4d6cfa')); m.castShadow = true; g.add(m);
  const e = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), std('#ffd34d', { metalness: 0.6 })); e.rotation.z = Math.PI / 4; g.add(e);
  return g;
}

// ---------- персонаж ----------
export const GUN_ROT = [Math.PI / 2, 0, 0];
const ANIMS = ['idle', 'walk', 'sprint', 'attack-melee-right', 'holding-right-shoot', 'die', 'interact-right', 'emote-yes', 'emote-no', 'holding-both-shoot', 'attack-kick-right', 'pick-up', 'holding-both', 'holding-right'];
export const ANIM = { idle: 0, walk: 1, run: 2, melee: 3, shoot: 4, die: 5, interact: 6, yes: 7, no: 8, cast: 9, kick: 10, pickup: 11, hold2: 12, hold1: 13 };
let rainbowHue = 0;

export class Avatar {
  constructor(opts) {
    this.opts = opts;
    const h = 1.7 * (opts.scale || 1);
    const ch = A.makeCharacter(opts.model, h);
    this.ch = ch;
    this.root = ch.root;
    this.root.userData.avatar = this;
    this.x = opts.x || 0; this.z = opts.z || 0; this.rot = opts.rot || 0;
    this.tx = this.x; this.tz = this.z; this.trot = this.rot; this.y = 0; this.ty = 0;
    this.root.position.set(this.x, 0, this.z);
    this.anim = -1; this.action = null;
    this.alpha = 1;
    const s = ch.scale;
    // кольцо под ногами
    if (opts.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42 * (opts.scale || 1), 0.55 * (opts.scale || 1), 32), new THREE.MeshBasicMaterial({ color: opts.ring, transparent: true, opacity: 0.85, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; this.root.add(ring); this.ring = ring;
    }
    // оружие и щит
    const arm = ch.parts['arm-right'], armL = ch.parts['arm-left'];
    const auraColor = this.auraColor();
    if (opts.cls && arm) {
      const w = buildWeapon(opts.cls, auraColor && auraColor !== 'rainbow' ? auraColor : CLASSES[opts.cls].color);
      const hand = this.handOffset(arm);
      w.position.copy(hand); w.scale.setScalar(1 / s);
      if (opts.cls === 'archer') w.rotation.set(0, -Math.PI / 2, 0);
      else if (opts.cls === 'mage') w.rotation.set(0.15, 0, 0);
      else w.rotation.set(0.95, 0, 0);
      arm.add(w); this.weapon = w;
    }
    if (opts.gun && arm) this.setGun(opts.gun, opts.gunW);
    if (opts.cls === 'knight' && armL) {
      const sh = buildShield(opts.ring || '#4d6cfa');
      const hand = this.handOffset(armL); sh.position.copy(hand); sh.position.z += 0.12 / s; sh.position.y *= 0.65; sh.scale.setScalar(1 / s);
      armL.add(sh);
    }
    // шапка
    if (opts.hat && opts.hat !== 'none' && ch.parts.head) {
      const head = ch.parts.head;
      const box = localBox(head);
      const hat = buildHat(opts.hat);
      const hw = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      hat.scale.setScalar(hw * 0.95);
      hat.position.set((box.min.x + box.max.x) / 2, box.max.y - hw * 0.02, (box.min.z + box.max.z) / 2);
      head.add(hat); this.hat = hat;
    }
    // аура
    if (auraColor) {
      const c = auraColor === 'rainbow' ? '#ffffff' : auraColor;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.9 * (opts.scale || 1), 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; this.root.add(glow); this.glow = glow;
      this.sparkT = 0;
    }
    // питомец рядом
    const sc = opts.scale || 1;
    const pet = opts.pet && buildPet(opts.pet);
    if (pet) { const pw = new THREE.Group(); pw.position.set(0.75 * sc, 1.25 * sc, -0.25 * sc); pet.scale.setScalar(1.1 * sc); pw.add(pet); this.root.add(pw); this.pet = pet; this.petWrap = pw; this.petPh = Math.random() * 6; }
    // рюкзак на спине
    const pack = opts.pack && ch.parts.torso && buildPack(opts.pack);
    if (pack) {
      const torso = ch.parts.torso, box = ownBox(torso), tw = box.max.x - box.min.x;
      pack.scale.setScalar(tw * 0.95); pack.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2 + (box.max.y - box.min.y) * 0.1, box.min.z + tw * 0.08);
      torso.add(pack); this.pack = pack;
    }
    if (opts.trail && opts.trail !== 'none') { this.trail = TRAILS.find(x => x.id === opts.trail); this.trailBits = []; this.trailD = 0; this.trailSide = 1; }
    // подпись
    if (opts.label !== false) {
      const el = document.createElement('div');
      el.className = 'plate' + (opts.me ? ' me' : '');
      el.innerHTML = `<div class="pn" style="color:${opts.nameColor || '#fff'}">${esc(opts.name || '')}</div>` + (opts.hpBar ? `<div class="hp"><i></i></div>` : '');
      this.plate = new CSS2DObject(el);
      this.plate.position.set(0, h + 0.35, 0);
      this.root.add(this.plate);
      this.plateEl = el; this.hpEl = el.querySelector('.hp i');
    }
    this.mats = [];
    this.root.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); this.mats.push(...(Array.isArray(o.material) ? o.material : [o.material])); } });
    // цвет команды: лёгкое свечение всего героя, чтобы сразу было видно, свой или чужой
    if (opts.tint) for (const m of this.mats) if (m.emissive) { m.emissive = new THREE.Color(opts.tint); m.emissiveIntensity = 0.32; }
    if (opts.ally && this.plateEl) { this.plateEl.classList.add('ally'); this.plateEl.style.setProperty('--tc', opts.nameColor || '#fff'); }
    this.play(ANIM.idle);
  }
  auraColor() { const a = AURAS.find(x => x.id === this.opts.aura); return a && a.color; }
  setGun(id, W) {
    const arm = this.ch.parts['arm-right']; if (!arm || this.gunId === id) return;
    if (this.weapon) { this.weapon.removeFromParent(); }
    this.gunId = id;
    const g = makeGun(id, W, this.opts.skin), hand = this.handOffset(arm), s = this.ch.scale * (this.opts.scale || 1) / (this.opts.scale || 1);
    const wrap = new THREE.Group(); wrap.add(g);
    wrap.position.copy(hand); wrap.scale.setScalar(1 / this.ch.scale);
    wrap.rotation.set(GUN_ROT[0], GUN_ROT[1], GUN_ROT[2]);
    arm.add(wrap); this.weapon = wrap;
    if (this.mats) wrap.traverse(o => { if (o.isMesh) this.mats.push(o.material); });
  }
  handOffset(arm) {
    const b = localBox(arm);
    return new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * 0.1, (b.min.z + b.max.z) / 2);
  }
  play(code, force) {
    if (code === this.anim && !force) return;
    this.anim = code;
    const name = ANIMS[code] || 'idle';
    const clip = this.ch.clips[name] || this.ch.clips.idle;
    if (!clip) return;
    const act = this.ch.mixer.clipAction(clip);
    const once = code === ANIM.die || code === ANIM.melee || code === ANIM.shoot || code === ANIM.cast || code === ANIM.kick || code === ANIM.pickup || code === ANIM.yes || code === ANIM.no || code === ANIM.interact;
    act.reset();
    act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    act.clampWhenFinished = once;
    act.timeScale = code === ANIM.melee ? 1.6 : 1;
    if (this.action && this.action !== act) act.crossFadeFrom(this.action, code === ANIM.die ? 0.1 : 0.15, false);
    act.play();
    this.action = act;
  }
  setTarget(x, z, rot, y = 0) { this.tx = x; this.tz = z; this.trot = rot; this.ty = y; }
  snap() { this.x = this.tx; this.z = this.tz; this.y = this.ty; this.rot = this.trot; this.root.position.set(this.x, this.y, this.z); this.root.rotation.y = this.rot; }
  setHP(hp, max) { if (this.hpEl) { const p = clamp(hp / max, 0, 1); this.hpEl.style.width = (p * 100) + '%'; this.hpEl.style.background = p > 0.5 ? '#5ee07a' : p > 0.25 ? '#ffd166' : '#ff5d6c'; } }
  setAlpha(a) {
    if (Math.abs(a - this.alpha) < 0.01) return;
    this.alpha = a;
    for (const m of this.mats) { m.transparent = a < 1; m.opacity = a; m.depthWrite = a >= 1; }
    if (this.plateEl) this.plateEl.style.opacity = a < 0.3 ? 0 : 1;
  }
  flash() { this.flashT = 0.15; }
  setVisible(v) { this.root.visible = v; if (this.plateEl) this.plateEl.style.display = v ? '' : 'none'; }
  update(dt, view) {
    const k = Math.min(1, dt * 14);
    this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k; this.y += (this.ty - this.y) * k;
    let d = this.trot - this.rot; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.rot += d * Math.min(1, dt * 16);
    this.root.position.set(this.x, this.y, this.z); this.root.rotation.y = this.rot;
    this.ch.mixer.update(dt);
    if (this.hat && this.hat.userData.spin) this.hat.userData.spin.rotation.y += dt * (this.opts.hat === 'propeller' ? 18 : 1.5);
    if (this.hat && this.hat.userData.bob) this.hat.userData.bob.position.y = 0.55 + Math.sin(performance.now() / 300) * 0.05;
    if (this.glow) {
      const t = performance.now() / 1000;
      this.glow.material.opacity = (0.25 + Math.sin(t * 3) * 0.1) * this.alpha;
      if (this.auraColor() === 'rainbow') this.glow.material.color.setHSL((t * 0.3) % 1, 1, 0.6);
      if (view && this.root.visible && this.alpha > 0.5) {
        this.sparkT -= dt;
        if (this.sparkT <= 0) { this.sparkT = 0.12; const c = this.auraColor(); view.fx.particle(this.x + rnd(-0.4, 0.4), 0.2, this.z + rnd(-0.4, 0.4), 0, rnd(1, 2), 0, c === 'rainbow' ? `hsl(${Math.random() * 360},100%,60%)` : c, 0.7, 0.08); }
      }
    }
    const now = performance.now() / 1000;
    if (this.pet) {
      this.petPh += dt;
      this.petWrap.position.y = (1.25 + Math.sin(this.petPh * 2.4) * 0.12) * (this.opts.scale || 1);
      this.pet.rotation.y = Math.sin(this.petPh * 0.8) * 0.5;
      for (const sx of [-1, 1]) { const w = this.pet.userData['wing' + sx]; if (w) w.rotation.z = (this.opts.pet === 'dragon' ? sx * 1.9 : 0) + Math.sin(this.petPh * 14) * 0.5 * sx; }
    }
    if (this.pack) {
      const u = this.pack.userData;
      if (u.flames) for (const f of u.flames) f.scale.set(1, 0.7 + Math.random() * 0.6, 1);
      for (const sx of [-1, 1]) if (u['wing' + sx]) u['wing' + sx].rotation.y = sx * (0.2 + Math.sin(now * 5) * 0.3);
      if (u.cape) { const pa = u.cape.geometry.attributes.position, b = u.cape.userData.base; for (let i = 0; i < pa.count; i++) { const y = b[i * 3 + 1]; pa.array[i * 3 + 2] = b[i * 3 + 2] - Math.sin(now * 4 + y * 5 + b[i * 3] * 3) * 0.05 * -y - (-y) * 0.15; } pa.needsUpdate = true; }
    }
    if (this.trail && this.root.parent) {
      const moved = this.lastX == null ? 0 : Math.hypot(this.x - this.lastX, this.z - this.lastZ);
      this.lastX = this.x; this.lastZ = this.z;
      this.trailD += Math.min(moved, 0.5);
      if (this.trailD > 0.55 && this.root.visible && this.alpha > 0.5) {
        this.trailD = 0; this.trailSide *= -1;
        const kind = this.trail.id, rb = kind === 'rainbow';
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: trailTexture(kind), color: rb ? new THREE.Color().setHSL(now * 0.5 % 1, 1, 0.6) : this.trail.color, transparent: true, depthWrite: false, opacity: 0.9, blending: kind === 'steps' ? THREE.NormalBlending : THREE.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2; m.rotation.z = this.rot + Math.PI;
        const ox = Math.cos(this.rot) * 0.14 * this.trailSide, oz = -Math.sin(this.rot) * 0.14 * this.trailSide;
        m.position.set(this.x + (kind === 'steps' ? ox : 0), this.y + 0.04, this.z + (kind === 'steps' ? oz : 0));
        if (kind !== 'steps') m.scale.setScalar(kind === 'rainbow' ? 1.6 : 1);
        this.root.parent.add(m); this.trailBits.push({ m, t: 0 });
      }
      for (let i = this.trailBits.length - 1; i >= 0; i--) {
        const b = this.trailBits[i]; b.t += dt;
        if (b.t > 1.6) { b.m.removeFromParent(); b.m.geometry.dispose(); b.m.material.dispose(); this.trailBits.splice(i, 1); continue; }
        b.m.material.opacity = 0.9 * (1 - b.t / 1.6);
        if (this.trail.id !== 'steps') b.m.position.y += dt * 0.15;
      }
    }
    if (this.weapon && this.weapon.userData.orb) this.weapon.userData.orb.scale.setScalar(1 + Math.sin(performance.now() / 200) * 0.12);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this.mats) if (m.emissive) { m.emissive.setRGB(on ? 0.9 : 0, on ? 0.15 : 0, on ? 0.15 : 0); }
    }
  }
  dispose() { this.root.removeFromParent(); if (this.plate) this.plate.element.remove(); if (this.trailBits) for (const b of this.trailBits) { b.m.removeFromParent(); b.m.geometry.dispose(); b.m.material.dispose(); } }
}
function ownBox(obj) {
  // только сама деталь, без вложенных (у туловища внутри голова и руки)
  const meshes = obj.isMesh ? [obj] : obj.children.filter(c => c.isMesh);
  if (!meshes.length) return localBox(obj);
  const box = new THREE.Box3(); obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  for (const o of meshes) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); }
  return box;
}
function localBox(obj) {
  // ограничивающий прямоугольник детей объекта в его собственных координатах
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse(o => {
    if (o.isMesh) {
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      box.union(b);
    }
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, -1, -0.5), new THREE.Vector3(0.5, 0, 0.5));
  return box;
}

// ---------- эффекты ----------
class FX {
  constructor(scene) {
    this.scene = scene; this.parts = []; this.items = [];
    this.pGeo = new THREE.BoxGeometry(1, 1, 1);
  }
  particle(x, y, z, vx, vy, vz, color, life = 0.6, size = 0.1, grav = 0) {
    if (this.parts.length > 400) return;
    const m = new THREE.Mesh(this.pGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.set(x, y, z); m.scale.setScalar(size); this.scene.add(m);
    this.parts.push({ m, vx, vy, vz, life, t: 0, size, grav });
  }
  burst(x, y, z, color, n = 12, speed = 4, size = 0.12, life = 0.6) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = rnd(speed * 0.4, speed); this.particle(x, y, z, Math.cos(a) * s, rnd(1, speed), Math.sin(a) * s, color, rnd(life * 0.6, life), size, 9); }
  }
  add(obj, life, upd) { this.scene.add(obj); this.items.push({ obj, life, t: 0, upd }); }
  slash(x, z, rot, color, range = 2) {
    const geo = new THREE.RingGeometry(range * 0.45, range, 24, 1, -1.0, 2.0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot - Math.PI / 2;
    m.position.set(x, 0.9, z);
    this.add(m, 0.22, (o, t, l) => { o.material.opacity = 0.75 * (1 - t / l); o.scale.setScalar(1 + t * 1.5); });
  }
  ringPulse(x, z, color, r0, r1, life = 0.5, y = 0.06) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    this.add(m, life, (o, t, l) => { const k = t / l; o.scale.setScalar(r0 + (r1 - r0) * k); o.material.opacity = 0.9 * (1 - k); });
  }
  telegraph(x, z, r, life) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#ff3355', transparent: true, opacity: 0.25, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z);
    this.add(m, life, (o, t, l) => { o.scale.setScalar(r * Math.min(1, t / l * 1.2)); o.material.opacity = 0.2 + 0.25 * Math.abs(Math.sin(t * 12)); });
  }
  boom(x, z, r, color = '#ff8a3d') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, 0.6, z);
    this.add(m, 0.35, (o, t, l) => { const k = t / l; o.scale.setScalar(r * (0.3 + k)); o.material.opacity = 0.8 * (1 - k); });
    this.burst(x, 0.6, z, color, 16, 6, 0.14);
    this.burst(x, 0.6, z, '#ffd166', 8, 4, 0.1);
  }
  number(x, z, text, color = '#fff', big) {
    const el = document.createElement('div'); el.className = 'dmg' + (big ? ' big' : ''); el.textContent = text; el.style.color = color;
    const o = new CSS2DObject(el); o.position.set(x + rnd(-0.3, 0.3), 2, z);
    this.add(o, 0.9, (ob, t, l) => { ob.position.y = 2 + t * 1.6; el.style.opacity = 1 - (t / l) ** 2; });
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.t += dt;
      if (p.t >= p.life) { p.m.removeFromParent(); p.m.material.dispose(); this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      p.m.material.opacity = 1 - p.t / p.life; p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      if (it.t >= it.life) { it.obj.removeFromParent(); if (it.obj.element) it.obj.element.remove(); this.items.splice(i, 1); continue; }
      it.upd && it.upd(it.obj, it.t, it.life);
    }
  }
}

// ---------- снаряды ----------
function buildProjectile(type, color) {
  const g = new THREE.Group();
  if (type === 'arrow') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), std('#8a5a2b')); shaft.rotation.x = Math.PI / 2; g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), new THREE.MeshBasicMaterial({ color: color || '#dfe6ee' })); tip.rotation.x = Math.PI / 2; tip.position.z = 0.5; g.add(tip);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: color || '#ff5d6c' })); fl.position.z = -0.4; g.add(fl);
  } else {
    const c = type === 'fireball' ? (color || '#ff7a2f') : type === 'bossorb' ? '#ff2e63' : '#b36bff';
    const core = new THREE.Mesh(new THREE.SphereGeometry(type === 'bossorb' ? 0.4 : 0.25, 14, 10), new THREE.MeshBasicMaterial({ color: '#fff4d6' })); g.add(core);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(type === 'bossorb' ? 0.65 : 0.42, 14, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(glow);
    g.userData.color = c;
  }
  g.position.y = 1;
  return g;
}

// ---------- флаг ----------
function buildFlag(team) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), std('#ddd', { metalness: 0.5 })); pole.position.y = 1.2; g.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.65, 8, 1), new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], side: THREE.DoubleSide, emissive: TEAM_COLORS[team], emissiveIntensity: 0.25 }));
  cloth.position.set(0.5, 2.0, 0); g.add(cloth); g.userData.cloth = cloth;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.15, 16), std('#555')); base.position.y = 0.07; g.add(base);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- построение карты ----------
export function buildMap(scene, map) {
  const root = new THREE.Group(); scene.add(root);
  // земля
  const ground = floorMesh(map.id === 'arena' ? 'ground' : 'dirt', 160, 160, 6); ground.position.y = -0.02; root.add(ground);
  if (map.id === 'arena') {
    const f = floorMesh('arena', map.W * 2, map.D * 2, 4); root.add(f);
    // деревья вокруг арены
    const trees = [];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(1.05, 1.9);
      const x = Math.cos(a) * (map.W + 4) * r, z = Math.sin(a) * (map.D + 4) * r;
      if (Math.abs(x) < map.W + 2 && Math.abs(z) < map.D + 2) continue;
      trees.push({ x, z, r: Math.random() * 6, s: rnd(1.3, 2.2) });
    }
    root.add(A.makeInstanced('grave/pine', trees, { s: 1 }));
  } else {
    for (const room of map.rooms) {
      const f = floorMesh(room.floor, room.w, room.d, room.floor === 'royal' ? room.w : 3); f.position.set(room.x, 0.001, room.z); root.add(f);
    }
    // двери: светлые пороги
  }
  // стены: группируем одинаковые модели
  const groups = {};
  for (const w of map.walls) (groups[w.model] = groups[w.model] || []).push({ x: w.x, z: w.z, r: w.r, s: 2, sx: w.sx || 1, sy: map.id === 'castle' && !w.pillar ? 1.25 : (w.pillar ? 1.3 : 1) });
  for (const [model, list] of Object.entries(groups)) root.add(A.makeInstanced(model, list));
  // декор
  const solo = [];
  const dgroups = {};
  for (const d of map.deco) {
    if (d.team != null || d.center || d.flat) { solo.push(d); continue; }
    (dgroups[d.model] = dgroups[d.model] || []).push({ x: d.x, z: d.z, r: d.r || 0, s: d.s || 2 });
  }
  for (const [model, list] of Object.entries(dgroups)) root.add(A.makeInstanced(model, list));
  for (const d of solo) {
    const p = A.makeProp(d.model, { s: d.s || 2, center: d.center });
    p.position.set(d.x, d.flat ? 0.01 : 0, d.z); p.rotation.y = d.r || 0;
    if (d.team != null) p.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(TEAM_COLORS[d.team]); } });
    root.add(p);
  }
  return root;
}

// ---------- игровой вид ----------
export class GameView {
  constructor(opts) {
    this.opts = opts; // {map, mode, myPid, metaOf(k)}
    this.scene = new THREE.Scene();
    const castle = opts.map.id === 'castle';
    this.scene.background = new THREE.Color(castle ? '#1a1830' : '#8fc4ff');
    this.scene.fog = new THREE.Fog(castle ? '#1a1830' : '#8fc4ff', 45, 110);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
    const hemi = new THREE.HemisphereLight(castle ? '#c9c2ff' : '#ffffff', castle ? '#40304a' : '#5b6b46', castle ? 1.0 : 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(castle ? '#ffe2b8' : '#fff1d6', castle ? 1.5 : 2.4);
    sun.position.set(-12, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;
    this.mapRoot = buildMap(this.scene, opts.map);
    this.fx = new FX(this.scene);
    this.ents = new Map();     // id -> Avatar
    this.projs = new Map();    // id -> {g, vx, vz}
    this.flags = new Map();
    this.bodies = new Map();
    this.markers = new Map();
    this.camPos = new THREE.Vector3(0, 20, 14);
    this.focus = new THREE.Vector3();
    this.shake = 0;
    this.myId = opts.myPid;
    this.camZoom = castle ? 0.72 : 1;
    this.ray = new THREE.Raycaster();
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.portrait = w < h; }
  ensureEnt(id, k) {
    let a = this.ents.get(id);
    if (!a) {
      const meta = this.opts.metaOf(k, id);
      if (!meta) return null;
      a = new Avatar(meta);
      a.meta = meta;
      this.scene.add(a.root);
      this.ents.set(id, a);
      a.fresh = true;
    }
    return a;
  }
  removeEnt(id) { const a = this.ents.get(id); if (a) { a.dispose(); this.ents.delete(id); } }
  syncProjectiles(list) {
    const seen = new Set();
    for (const [id, type, x, z, vx, vz, color] of list) {
      seen.add(id);
      let p = this.projs.get(id);
      if (!p) {
        const g = buildProjectile(type, color);
        this.scene.add(g); p = { g, type }; this.projs.set(id, p);
        g.position.set(x, 1, z);
      }
      p.vx = vx; p.vz = vz;
      // плавная коррекция
      p.g.position.x += (x - p.g.position.x) * 0.5; p.g.position.z += (z - p.g.position.z) * 0.5;
      p.g.rotation.y = Math.atan2(vx, vz);
    }
    for (const [id, p] of this.projs) if (!seen.has(id)) { p.g.removeFromParent(); this.projs.delete(id); }
  }
  syncFlags(list) {
    // [team, x, z, carrierId]
    for (const [team, x, z, carrier] of list) {
      let f = this.flags.get(team);
      if (!f) { f = buildFlag(team); this.scene.add(f); this.flags.set(team, f); }
      f.userData.carrier = carrier; f.userData.x = x; f.userData.z = z;
    }
  }
  setMarkers(stations) {
    // stations: [{id,x,z,done}]
    for (const [id, m] of this.markers) { m.removeFromParent(); }
    this.markers.clear();
    for (const s of stations) {
      if (s.done) continue;
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
      const el = document.createElement('div'); el.className = 'task-mark'; el.textContent = '!';
      const lbl = new CSS2DObject(el); lbl.position.y = 2.6; g.add(lbl);
      g.position.set(s.x, 0, s.z); g.userData.el = el; g.userData.ring = ring;
      this.scene.add(g); this.markers.set(s.id, g);
    }
  }
  screenToGround(cx, cy) {
    const v = new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const t = -this.ray.ray.origin.y / this.ray.ray.direction.y;
    if (!(t > 0)) return null;
    return this.ray.ray.origin.clone().addScaledVector(this.ray.ray.direction, t);
  }
  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1 };
  }
  update(dt) {
    for (const a of this.ents.values()) a.update(dt, this);
    for (const p of this.projs.values()) {
      p.g.position.x += (p.vx || 0) * dt; p.g.position.z += (p.vz || 0) * dt;
      if (p.type !== 'arrow' && Math.random() < 0.6) this.fx.particle(p.g.position.x, 1, p.g.position.z, rnd(-0.5, 0.5), rnd(0, 1), rnd(-0.5, 0.5), p.g.userData.color, 0.35, 0.12);
    }
    const t = performance.now() / 1000;
    for (const [team, f] of this.flags) {
      const c = f.userData.carrier && this.ents.get(f.userData.carrier);
      if (c) { f.position.set(c.x - 0.2, 1.2, c.z - 0.2); f.scale.setScalar(0.6); }
      else { f.position.set(f.userData.x, 0, f.userData.z); f.scale.setScalar(1); }
      f.userData.cloth.rotation.y = Math.sin(t * 3 + team) * 0.25;
    }
    for (const m of this.markers.values()) { m.userData.ring.material.opacity = 0.5 + Math.sin(t * 4) * 0.3; }
    this.fx.update(dt);
    // камера
    const me = this.ents.get(this.myId);
    if (me) this.focus.lerp(new THREE.Vector3(me.x, 0, me.z), Math.min(1, dt * 6));
    else if (this.spectate) this.focus.lerp(this.spectate, Math.min(1, dt * 3));
    const zoom = this.camZoom * (this.portrait ? 1.75 : 1);
    const off = new THREE.Vector3(0, 17 * zoom, 12 * zoom);
    const target = this.focus.clone().add(off);
    this.camPos.lerp(target, Math.min(1, dt * 5));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); this.camera.position.x += rnd(-1, 1) * this.shake * 0.3; this.camera.position.y += rnd(-1, 1) * this.shake * 0.3; }
    this.camera.lookAt(this.focus.x, 0.8, this.focus.z);
    this.sun.position.set(this.focus.x - 12, 30, this.focus.z + 14); this.sun.target.position.copy(this.focus);
  }
  dispose() {
    for (const a of this.ents.values()) a.dispose();
    for (const b of this.bodies.values()) b.dispose && b.dispose();
    this.scene.traverse(o => { if (o.element) o.element.remove(); });
  }
}

// ---------- витрина для меню ----------
export class ShowroomView {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1b1640');
    this.scene.fog = new THREE.Fog('#1b1640', 14, 40);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight('#d6ccff', '#2a2050', 1.3));
    const key = new THREE.DirectionalLight('#fff0d8', 2.2); key.position.set(4, 8, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#8f7bff', 1.4); rim.position.set(-5, 4, -6); this.scene.add(rim);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.4, 48), new THREE.MeshStandardMaterial({ color: '#3a2f7a', roughness: 0.5 }));
    ped.position.y = -0.2; ped.receiveShadow = true; this.scene.add(ped);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: '#ffd166' }));
    rimRing.rotation.x = Math.PI / 2; this.scene.add(rimRing);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#221c4d' }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.4; floor.receiveShadow = true; this.scene.add(floor);
    // звёзды
    const sg = new THREE.BufferGeometry(); const pts = [];
    for (let i = 0; i < 400; i++) { const a = Math.random() * Math.PI * 2, r = rnd(15, 35); pts.push(Math.cos(a) * r, rnd(2, 20), Math.sin(a) * r); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff', size: 0.12 })));
    this.fx = new FX(this.scene);
    this.heroes = [];
    this.angle = 0; this.t = 0;
    this.offsetX = 0; this.userRot = 0;
  }
  resize(w, h) { this.w = w; this.h = h; this.camera.aspect = w / h; this.portrait = w < h; this.applyShift(); }
  // сдвиг картинки, чтобы герои не прятались под панелью меню
  setShift(x, y) { this.shiftX = x; this.shiftY = y; this.applyShift(); }
  applyShift() {
    if (!this.w) return;
    if (this.shiftX || this.shiftY) this.camera.setViewOffset(this.w, this.h, (this.shiftX || 0) * this.w, (this.shiftY || 0) * this.h, this.w, this.h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  // list: [{model, cls, hat, aura, name, me}]
  setHeroes(list) {
    const key = JSON.stringify(list) + list.filter(o => A.has(o.model)).length + '/' + list.filter(o => !o.gunW || A.has(o.gunW.model)).length;
    if (key === this.key) return;
    this.key = key;
    for (const h of this.heroes) h.dispose();
    this.heroes = [];
    const n = list.length;
    list.forEach((o, i) => {
      if (!A.has(o.model)) return;
      const a = new Avatar({ ...o, label: n > 1, nameColor: o.me ? '#ffd166' : '#fff' });
      let x = 0, z = 0;
      if (n > 1) { const idx = i - (n - 1) / 2; x = idx * 1.25; z = -Math.abs(idx) * 0.35; }
      a.setTarget(x, z, 0); a.snap();
      a.play(i === 0 ? 7 : 0, true);
      this.scene.add(a.root); this.heroes.push(a);
    });
    this.wave = 0.2;
  }
  update(dt) {
    this.t += dt;
    if (!this.dragging) this.userRot *= Math.pow(0.6, dt * 0.15);
    this.angle = Math.sin(this.t * 0.25) * 0.35 * (this.dragging || Math.abs(this.userRot) > 0.3 ? 0.2 : 1) + (this.userRot || 0);
    const n = Math.max(1, this.heroes.length);
    const spread = n > 1 ? (n - 1) * 1.25 : 0;
    const dist = this.portrait ? Math.max(9.5, (spread + 2.2) / (0.69 * this.camera.aspect)) : (n > 1 ? 5.4 + n * 0.6 : 5.6);
    this.camera.position.set(Math.sin(this.angle) * dist, 1.9, Math.cos(this.angle) * dist);
    this.camera.lookAt(0, 0.95, 0);
    for (const h of this.heroes) {
      h.update(dt, this);
      if (h.action && !h.action.isRunning() && h.anim !== 0) h.play(0);
    }
    if (Math.random() < dt * 0.25 && this.heroes.length) { const h = this.heroes[Math.random() * this.heroes.length | 0]; h.play(Math.random() < 0.6 ? 7 : 11, true); }
    this.fx.update(dt);
  }
  dispose() { for (const h of this.heroes) h.dispose(); }
}

// ======================= КАРТЫ «НАЙДИ ПРЕДАТЕЛЯ» =======================
const FLOOR_TINT = { metal: '#ffffff', grate: '#c9cbe0', cafe: '#ffe9c7', white: '#e9f6ff', green: '#d8ffe0', corridor: '#b9bdd6' };
const HAUNT_FLOOR = { stone: 'stone', stone2: 'stone2', planks: 'planks', wood: 'wood', royal: 'royal', carpet: 'carpet', grass: 'grass', dirt: 'dirt', tile: 'tile', corridor: 'stone' };
// замок: пол из процедурных текстур, стены — склеенные коробки
function buildHaunted3D(root, map) {
  const T = 2, { GW, GH, grid, W, Z } = map;
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && grid[y * GW + x] > 0;
  // пол: по прямоугольнику на комнату + плитки коридоров
  for (const r of map.rooms) { const ft = HAUNT_FLOOR[r.floor] || 'stone'; const m = floorMesh(ft, r.wx2 - r.wx1, r.wz2 - r.wz1, ft === 'royal' || ft === 'carpet' ? 2 : ft === 'tile' ? 3 : 4); m.position.set((r.wx1 + r.wx2) / 2, 0, (r.wz1 + r.wz2) / 2); root.add(m); }
  const cor = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (grid[y * GW + x] === 2) cor.push([x, y]);
  if (cor.length) {
    const geos = cor.map(([x, y]) => { const g = new THREE.PlaneGeometry(T, T); g.rotateX(-Math.PI / 2); g.translate(W(x), 0.001, Z(y)); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5 + (x % 2) * 0.5, uv.getY(i) * 0.5 + (y % 2) * 0.5); return g; });
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: floorTexture('stone2'), roughness: 0.95, color: '#b9b0c8' })); m.receiveShadow = true; root.add(m);
  }
  const wallG = [], topG = [], H = 2.6, t = 0.5;
  const add = (cx, cz, w, d) => { const g = boxGeo({ x: cx, y: 0, z: cz, w, h: H, d }, 2.6); g.translate(cx, H / 2, cz); wallG.push(g); const tg = new THREE.BoxGeometry(w + 0.04, 0.12, d + 0.04); tg.translate(cx, H + 0.06, cz); topG.push(tg); };
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!isFloor(x, y)) continue;
    const cx = W(x), cz = Z(y);
    if (!isFloor(x, y - 1)) add(cx, cz - T / 2 - t / 2, T + t * 2, t);
    if (!isFloor(x, y + 1)) add(cx, cz + T / 2 + t / 2, T + t * 2, t);
    if (!isFloor(x - 1, y)) add(cx - T / 2 - t / 2, cz, t, T);
    if (!isFloor(x + 1, y)) add(cx + T / 2 + t / 2, cz, t, T);
  }
  const wm = new THREE.Mesh(mergeGeometries(wallG), texMat('stone', '#d8cfe6')); wm.castShadow = true; wm.receiveShadow = true; root.add(wm);
  root.add(new THREE.Mesh(mergeGeometries(topG), new THREE.MeshStandardMaterial({ color: '#2a2030', roughness: 0.9 })));
}
// модель по высоте в метрах, по центру
function propByHeight(p) {
  const g = A.info(p.model); if (!g) return null;
  const s = p.h / g.size.y, c = g.box.getCenter(new THREE.Vector3());
  const o = A.makeProp(p.model, { s }); o.children[0].position.set(-c.x * s, -g.box.min.y * s, -c.z * s);
  o.position.set(p.x, 0, p.z); o.rotation.y = p.rot || 0;
  return o;
}
export function buildAmap3D(scene, map) {
  const T = 2, root = new THREE.Group(); scene.add(root);
  const { GW, GH, grid, W, Z } = map;
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && grid[y * GW + x] > 0;
  const theme = map.theme || 'space';
  if (theme === 'haunted') buildHaunted3D(root, map); else {
  // пол: рисованная текстура на каждую комнату и на коридоры (видно на любом устройстве)
  const FT = { metal: 'panel', grate: 'grate2', white: 'medtile', cafe: 'cafetile', green: 'greentile' };
  const tint = theme === 'underwater' ? '#c8e8ff' : '#ffffff';
  for (const r of map.rooms) {
    const t = canvasTex(FT[r.floor] || 'panel'), w = r.wx2 - r.wx1, d = r.wz2 - r.wz1; t.repeat.set(w / 4, d / 4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, color: tint, roughness: 0.8, metalness: 0.1 }));
    m.rotation.x = -Math.PI / 2; m.position.set((r.wx1 + r.wx2) / 2, 0, (r.wz1 + r.wz2) / 2); m.receiveShadow = true; root.add(m);
  }
  {
    const geos = [];
    for (const c of map.corridors) {
      const x1 = W(c.x1) - T / 2, x2 = W(c.x2) + T / 2, z1 = Z(c.y1) - T / 2, z2 = Z(c.y2) + T / 2, w = x2 - x1, d = z2 - z1;
      if (w <= 0 || d <= 0) continue;
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
      if (c.h) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u * w / 4); } }
      else { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * d / 4); }
      g.translate((x1 + x2) / 2, -0.002, (z1 + z2) / 2); geos.push(g);
    }
    if (geos.length) { const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: canvasTex('corridor'), color: tint, roughness: 0.8 })); m.receiveShadow = true; root.add(m); }
  }
  // стены по краям пола + колонны в углах
  const walls = [], deco = [], verts = new Map();
  const addV = (vx, vy, dir) => { const k = vx + ',' + vy; const s = verts.get(k) || new Set(); s.add(dir); verts.set(k, s); };
  let n = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!isFloor(x, y)) continue;
    const cx = W(x), cz = Z(y);
    const pushW = (px, pz, r, vx1, vy1, vx2, vy2, dir) => { n++; (n % (theme === 'underwater' ? 3 : 7) === 1 ? deco : walls).push({ x: px, z: pz, r, s: 2 }); addV(vx1, vy1, dir); addV(vx2, vy2, dir); };
    if (!isFloor(x, y - 1)) pushW(cx, cz - T / 2, 0, x, y, x + 1, y, 'h');
    if (!isFloor(x, y + 1)) pushW(cx, cz + T / 2, Math.PI, x, y + 1, x + 1, y + 1, 'h');
    if (!isFloor(x - 1, y)) pushW(cx - T / 2, cz, Math.PI / 2, x, y, x, y + 1, 'v');
    if (!isFloor(x + 1, y)) pushW(cx + T / 2, cz, -Math.PI / 2, x + 1, y, x + 1, y + 1, 'v');
  }
  root.add(A.makeInstanced('st/wall', walls));
  root.add(A.makeInstanced(theme === 'underwater' ? 'st/wall-window' : 'st/wall-detail', deco));
  const pillars = [];
  for (const [k, s] of verts) if (s.size > 1) { const [vx, vy] = k.split(',').map(Number); pillars.push({ x: W(vx) - T / 2, z: Z(vy) - T / 2, s: 2 }); }
  root.add(A.makeInstanced('st/wall-pillar', pillars));
  }
  // предметы
  const groups = {}, special = [];
  for (const p of map.props) {
    if (!p.model.includes('/')) { special.push(p); continue; }
    if (p.h) { if (A.has(p.model)) { const o = propByHeight(p); if (o) root.add(o); } continue; }
    (groups[p.model] = groups[p.model] || []).push({ x: p.x, z: p.z, r: p.rot, s: p.s });
  }
  for (const [m, list] of Object.entries(groups)) root.add(A.makeInstanced(m, list));
  const out = { root, doors: [], vents: new Map(), scanner: null };
  for (const p of special) {
    if (p.model === 'button') {
      const g = new THREE.Group();
      const table = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.85, 28), std('#9aa3c7')); table.position.y = 0.42; g.add(table);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.08, 28), std('#d7dcf0')); top.position.y = 0.88; g.add(top);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.18, 20), std('#555b75')); base.position.y = 1.0; g.add(base);
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), theme === 'haunted' ? new THREE.MeshStandardMaterial({ color: '#b46bff', emissive: '#6a1fd0', emissiveIntensity: 0.8 }) : new THREE.MeshStandardMaterial({ color: '#ff2e44', emissive: '#a00010', emissiveIntensity: 0.8 })); btn.position.y = 1.08; g.add(btn);
      const glass = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.35, roughness: 0.1 })); glass.position.y = 1.08; g.add(glass);
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(p.x, 0, p.z); root.add(g); out.button = btn;
    } else if (p.model === 'scanner') {
      const g = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.12, 32), std('#7d86b0')); pad.position.y = 0.06; g.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: '#4dffb0' })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#4dffb0', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 1.1; beam.visible = false; g.add(beam);
      g.position.set(p.x, 0, p.z); root.add(g); out.scanner = { g, beam, ring };
    }
  }
  // люки
  for (const v of map.vents) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.0), std('#4a4f68')); frame.position.y = 0.03; g.add(frame);
    const lid = new THREE.Group(); lid.position.set(0, 0.07, -0.45); g.add(lid);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.85), std('#7b819e', { metalness: 0.5 })); plate.position.z = 0.43; lid.add(plate);
    for (let i = -2; i <= 2; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.07), std('#30344a')); sl.position.set(0, 0.03, 0.43 + i * 0.15); lid.add(sl); }
    g.position.set(v.x, 0, v.z); root.add(g);
    out.vents.set(v.id, { g, lid, open: 0, target: 0 });
  }
  // двери
  for (const d of map.doors) {
    const g = new THREE.Group(); g.position.set(d.ex, 0, d.ez); g.rotation.y = d.rot; root.add(g);
    const halves = [];
    for (const s of [-1, 1]) {
      const h = new THREE.Group(); g.add(h);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(d.len / 2, 1.95, 0.22), theme === 'haunted' ? new THREE.MeshStandardMaterial({ map: floorTexture('planks'), color: '#a07850', roughness: 0.8 }) : std(theme === 'underwater' ? '#6f9fc0' : '#8e97c4', { metalness: 0.3 })); panel.position.set(s * d.len / 4, 0.98, 0); panel.castShadow = true; h.add(panel);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(d.len / 2 * 0.9, 0.12, 0.24), theme === 'haunted' ? std('#2b2b30', { metalness: 0.7 }) : new THREE.MeshStandardMaterial({ color: '#ffb02e', emissive: '#ff8a00', emissiveIntensity: 0.6 })); stripe.position.set(s * d.len / 4, 1.2, 0); h.add(stripe);
      h.userData.s = s; halves.push(h);
    }
    g.visible = false;
    out.doors.push({ g, halves, open: 1, len: d.len });
  }
  return out;
}

export class AmongView {
  constructor(opts) {
    this.opts = opts; this.map = opts.map; this.myId = opts.myPid;
    this.scene = new THREE.Scene();
    const th = this.theme = this.map.theme || 'space';
    const TH = { space: ['#05061a', '#e2e6ff', '#2a2f55', 1.15, '#fff4e0', 1.6], haunted: ['#0b0614', '#d6caff', '#4a3550', 1.35, '#ffe6c8', 1.5], underwater: ['#03304d', '#c4ecff', '#0d3550', 1.1, '#d8f4ff', 1.4] }[th];
    this.scene.background = new THREE.Color(TH[0]);
    if (th !== 'space') this.scene.fog = new THREE.Fog(TH[0], 19, 44);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(TH[1], TH[2], TH[3]));
    const sun = new THREE.DirectionalLight(TH[4], TH[5]);
    sun.position.set(-6, 24, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
    this.scene.add(sun); this.scene.add(sun.target); this.sun = sun;
    // звёзды под станцией
    if (th === 'space') {
      const pts = []; for (let i = 0; i < 1600; i++) pts.push(rnd(-150, 150), rnd(-40, -12), rnd(-110, 110));
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cfd6ff', size: 0.35, sizeAttenuation: true })));
    } else {
      // подводная база — песчаное дно и пузыри; замок — плавающие огоньки
      if (th === 'underwater') {
        const sand = floorMesh('dirt', 260, 200, 6); sand.material.color.set('#e8d29a'); sand.position.y = -7; this.scene.add(sand);
        if (A.has('st/rocks')) { const rk = []; for (let i = 0; i < 70; i++) rk.push({ x: rnd(-90, 90), y: -7, z: rnd(-70, 70), r: rnd(0, 6), s: rnd(3, 8) }); this.scene.add(A.makeInstanced('st/rocks', rk, { shadow: false })); }
      }
      const n = th === 'underwater' ? 260 : 90, pts = [];
      for (let i = 0; i < n; i++) pts.push(rnd(-this.map.width / 2, this.map.width / 2), rnd(-6, 4), rnd(-this.map.depth / 2, this.map.depth / 2));
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.motes = new THREE.Points(g, new THREE.PointsMaterial(th === 'underwater' ? { color: '#d8f6ff', size: 0.22, transparent: true, opacity: 0.6, depthWrite: false } : { color: '#b98bff', size: 0.3, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(this.motes);
    }
    this.built = buildAmap3D(this.scene, this.map);
    this.fx = new FX(this.scene);
    this.ents = new Map();
    this.focus = new THREE.Vector3(); this.camPos = new THREE.Vector3(0, 30, 10);
    this.shake = 0; this.cams = null; this.camCams = [];
    this.closedDoors = new Set();
  }
  resize(w, h) { this.w = w; this.h = h; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.portrait = w < h; }
  removeEnt(id) { const a = this.ents.get(id); if (a) { a.dispose(); this.ents.delete(id); } }
  setDoors(closed) {
    this.closedDoors = new Set(closed);
    this.built.doors.forEach((d, i) => { d.target = this.closedDoors.has(i) ? 0 : 1; });
  }
  ventAnim(id) { const v = this.built.vents.get(id); if (v) { v.open = 1; } }
  worldToScreen(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1 }; }
  update(dt) {
    for (const a of this.ents.values()) a.update(dt, this);
    this.fx.update(dt);
    const t = performance.now() / 1000;
    for (const d of this.built.doors) {
      if (d.target == null) d.target = 1;
      d.open += (d.target - d.open) * Math.min(1, dt * 7);
      d.g.visible = d.open < 0.98;
      for (const h of d.halves) h.position.x = h.userData.s * d.open * d.len / 2;
    }
    for (const v of this.built.vents.values()) { v.open = Math.max(0, v.open - dt * 1.5); v.lid.rotation.x = -Math.sin(Math.min(1, v.open) * Math.PI) * 1.2; }
    if (this.motes) {
      const pa = this.motes.geometry.attributes.position, up = this.theme === 'underwater';
      for (let i = 0; i < pa.count; i++) {
        let y = pa.getY(i) + dt * (up ? 1.2 + (i % 5) * 0.25 : 0.25 * Math.sin(t + i));
        if (y > 5) y = -6;
        pa.setY(i, y); if (!up) pa.setX(i, pa.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.3);
      }
      pa.needsUpdate = true;
    }
    if (this.built.button) this.built.button.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.3;
    if (this.built.scanner) { this.built.scanner.ring.position.y = 0.14 + (this.scanning ? (Math.sin(t * 4) + 1) * 0.9 : 0); this.built.scanner.beam.visible = !!this.scanning; }
    const me = this.ents.get(this.myId);
    if (me) this.focus.lerp(new THREE.Vector3(me.x, 0, me.z), Math.min(1, dt * 7));
    const zoom = this.portrait ? 1.6 : this.h < 500 ? 1.2 : 1; // на телефоне горизонтально — чуть дальше, чтобы видеть больше
    const target = this.focus.clone().add(new THREE.Vector3(0, 13 * zoom, 4.2 * zoom));
    this.camPos.lerp(target, Math.min(1, dt * 6));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2); this.camera.position.x += rnd(-1, 1) * this.shake * 0.3; }
    this.camera.lookAt(this.focus.x, 0.5, this.focus.z);
    this.sun.position.set(this.focus.x - 6, 24, this.focus.z + 10); this.sun.target.position.copy(this.focus);
    if (this.onFrame) this.onFrame(dt);
  }
  // режим камер наблюдения: 4 картинки
  setCams(list) {
    this.cams = list;
    if (list && !this.camCams.length) for (let i = 0; i < 4; i++) this.camCams.push(new THREE.PerspectiveCamera(55, 1, 0.1, 100));
  }
  render(renderer) {
    if (!this.cams) { renderer.setScissorTest(false); renderer.setViewport(0, 0, this.w, this.h); renderer.render(this.scene, this.camera); return; }
    const w = this.w, h = this.h, pad = 8, top = 56;
    const cw = (w - pad * 3) / 2, ch = (h - top - pad * 3) / 2;
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, w, h); renderer.setViewport(0, 0, w, h);
    renderer.setClearColor('#05061a'); renderer.clear();
    this.cams.forEach((c, i) => {
      const cam = this.camCams[i]; cam.aspect = cw / ch; cam.updateProjectionMatrix();
      cam.position.set(c.x, 11, c.z + 6.5); cam.lookAt(c.x, 0, c.z - 0.5);
      const x = pad + (i % 2) * (cw + pad), y = pad + (1 - Math.floor(i / 2)) * (ch + pad);
      renderer.setScissor(x, y, cw, ch); renderer.setViewport(x, y, cw, ch);
      renderer.render(this.scene, cam);
    });
    renderer.setScissorTest(false);
  }
  dispose() { for (const a of this.ents.values()) a.dispose(); this.scene.traverse(o => { if (o.element) o.element.remove(); }); }
}

// ======================= ОРУЖИЕ ШУТЕРА =======================
// перекраска текстуры: real — металл, toy — яркий пластик, blaster — как есть
const gunTex = new Map();
function styledMap(map, style) {
  const key = map.uuid + style;
  if (gunTex.has(key)) return gunTex.get(key);
  const img = map.image; if (!img || !img.width) return map;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i], gg = a[i + 1], b = a[i + 2];
    const l = (r * 0.3 + gg * 0.59 + b * 0.11);
    if (style === 'real') { const v = l * 0.55 + 18; const warm = (r > gg + 30 && r > b + 30) ? 1 : 0; r = v + warm * 40; gg = v + warm * 18; b = v; }
    else if (style === 'toy') { const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx - mn > 40) { const t = r; r = Math.min(255, b * 1.1 + 40); b = Math.min(255, gg * 0.6 + 30); gg = Math.min(255, t * 0.9 + 50); } else { r = Math.min(255, l + 60); gg = Math.min(255, l + 40); b = Math.min(255, l + 70); } }
    a[i] = r; a[i + 1] = gg; a[i + 2] = b;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.flipY = map.flipY;
  gunTex.set(key, t);
  return t;
}
const GUN_LEN = { bubble: 0.8, smoke: 0.18, flash: 0.18, sticky: 0.18, banana: 0.18, knife: 0.4, pistol: 0.42, laser: 0.42, water: 0.45, smg: 0.62, rifle: 0.9, shotgun: 0.85, sniper: 1.15, plasma: 0.8, railgun: 1.1, paint: 0.75, snow: 0.8, grenade: 0.18 };
export function makeGun(id, W, skin) {
  const g = new THREE.Group();
  if (id === 'knife' || !W || !W.model || !A.has(W.model)) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.3), std('#e6ebf0', { metalness: 0.4, roughness: 0.3 })); blade.position.z = 0.16; g.add(blade);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.12), std('#3a2a1c')); h.position.z = -0.04; g.add(h);
    if (skin && id !== 'grenade') skinGun(g, skin);
    return g;
  }
  const src = A.makeProp(W.model, { s: 1 });
  const box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = (GUN_LEN[id] || 0.6) / Math.max(size.z, 0.01);
  src.scale.setScalar(s); src.position.set(-c.x * s, -c.y * s, -c.z * s);
  src.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (o.material.map && W.style !== 'blaster') o.material.map = styledMap(o.material.map, W.style);
    if (W.style === 'real') { o.material.roughness = 0.45; o.material.metalness = 0.35; }
    if (W.style === 'blaster') { o.material.emissive = new THREE.Color(W.tracer || '#66e0ff'); o.material.emissiveIntensity = 0.12; }
    o.castShadow = true;
  });
  if (skin && id !== 'grenade') skinGun(src, skin);
  g.add(src);
  g.userData.len = GUN_LEN[id] || 0.6;
  return g;
}
export { buildFlag };
