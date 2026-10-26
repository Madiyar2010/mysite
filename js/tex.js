// Процедурные текстуры (рисуются на canvas) и коробки с ними — общие для шутера и «Найди предателя».
import * as THREE from 'three';

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
    case 'wallpaper': { fill('#4a2a5e'); g.fillStyle = '#5d3a74'; for (let y = 0; y < 200; y += 40) for (let x = (y / 40 % 2) * 32; x < 256; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y + 20); g.lineTo(x, y + 40); g.lineTo(x - 12, y + 20); g.fill(); } g.fillStyle = '#3a2416'; g.fillRect(0, 196, 256, 60); g.fillStyle = '#5a3a22'; g.fillRect(0, 196, 256, 8); break; }
    case 'subwall': { fill('#3d5a73'); for (let x = 0; x < 256; x += 64) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 4, 256); } g.fillStyle = '#5e7f99'; g.fillRect(0, 0, 256, 18); g.fillStyle = '#26394a'; g.fillRect(0, 230, 256, 26); g.fillStyle = '#9ab3c6'; for (let x = 10; x < 256; x += 32) { g.beginPath(); g.arc(x, 9, 3, 0, 7); g.fill(); g.beginPath(); g.arc(x, 242, 3, 0, 7); g.fill(); } noise(500, 0.15, '#1c2a36'); break; }
    case 'panel': { fill('#9aa3b8'); for (let y = 0; y < 256; y += 128) for (let x = 0; x < 256; x += 128) { g.fillStyle = shade('#a7b0c4', (Math.random() - 0.5) * 16); g.fillRect(x + 3, y + 3, 122, 122); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 3, y + 3, 122, 4); g.fillStyle = '#6f778a'; for (const [cx, cy] of [[12, 12], [116, 12], [12, 116], [116, 116]]) { g.beginPath(); g.arc(x + cx, y + cy, 4, 0, 7); g.fill(); } } g.strokeStyle = '#5d6476'; g.lineWidth = 4; for (let i = 0; i <= 256; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } noise(900, 0.12, '#4a5060'); break; }
    case 'grate2': { fill('#3e4452'); g.fillStyle = '#5a6172'; for (let y = 6; y < 256; y += 16) g.fillRect(0, y, 256, 8); g.fillStyle = '#2b2f39'; for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 6, 256); g.strokeStyle = '#f2c230'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 250); break; }
    case 'medtile': blocks(4, 4, '#e4f1f7', 8, '#a9c6d4', 4, false); g.fillStyle = 'rgba(80,190,140,.5)'; g.fillRect(0, 120, 256, 16); break;
    case 'cafetile': for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { g.fillStyle = ((x + y) / 64) % 2 ? '#e9d7b4' : '#c9b48e'; g.fillRect(x, y, 64, 64); } g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } break;
    case 'greentile': blocks(4, 4, '#a9d8b4', 12, '#6d9c78', 4, false); noise(600, 0.15, '#4b7a56'); break;
    case 'corridor': { fill('#7d8496'); g.fillStyle = '#8b92a5'; g.fillRect(16, 0, 224, 256); g.fillStyle = '#f2c230'; for (let y = 0; y < 256; y += 32) { g.fillRect(0, y, 10, 16); g.fillRect(246, y + 16, 10, 16); } g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < 256; y += 64) g.fillRect(16, y, 224, 3); noise(700, 0.12, '#4a5060'); break; }
    case 'ceiling': fill('#2b2f38'); g.strokeStyle = '#3c414c'; g.lineWidth = 8; g.strokeRect(0, 0, 256, 256); break;
  }
}
function shade(hex, l) {
  const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, Math.round(v + l)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
export function baseTex(type) {
  if (!texCache[type]) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    paint(type, c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texCache[type] = t;
  }
  return texCache[type];
}
export function canvasTex(type) { const t = baseTex(type).clone(); t.needsUpdate = true; return t; }
const ALPHA = new Set(['bars', 'ironfence', 'portcullis']);
const matCache = {};
export function texMat(type, color = '#fff', glow) {
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
export function boxGeo(b, k = 2) {
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  const uv = geo.attributes.uv, pos = geo.attributes.position, nor = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const x = pos.getX(i) + b.w / 2, y = pos.getY(i) + b.h / 2 + (b.y || 0), z = pos.getZ(i) + b.d / 2;
    if (ny > 0.5) uv.setXY(i, (x + b.x) / k, (z + b.z) / k); else if (nx > 0.5) uv.setXY(i, (z + b.z) / k, y / k); else uv.setXY(i, (x + b.x) / k, y / k);
  }
  return geo;
}
export function texBox(b, type, k = 2, color = '#fff') {
  const m = new THREE.Mesh(boxGeo({ ...b, x: 0, z: 0 }, k), texMat(type, color));
  m.position.set(b.x, b.y + b.h / 2, b.z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
