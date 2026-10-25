// Загрузка 3D-моделей (Kenney, CC0) и подготовка копий нужного размера.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

export const HEROES = 'abcdefghijklmnopqr'.split('').map(l => 'character-' + l);
export const HERO_NAMES = {
  'character-a': 'Силач',
  'character-b': 'Весельчак',
  'character-c': 'Геймер',
  'character-d': 'Манекен',
  'character-e': 'Путешественница',
  'character-f': 'Спортсменка',
  'character-g': 'Робот-молния',
  'character-h': 'Робот-сердце',
  'character-i': 'Профессор',
  'character-j': 'Полицейский',
  'character-k': 'Ковбой',
  'character-l': 'Зомби-агент',
  'character-m': 'Охотник',
  'character-n': 'Принцесса',
  'character-o': 'Тролль',
  'character-p': 'Пират',
  'character-q': 'Агент',
  'character-r': 'Ниндзя'
};

const loader = new GLTFLoader();
const cache = new Map();
const vals = new Map();

function path(name) {
  if (name.startsWith('character-') && name.length === 11) return 'assets/heroes/' + name + '.glb';
  if (name.startsWith('grave/')) return 'assets/grave/' + name.slice(6) + '.glb';
  if (name.startsWith('arena/')) return 'assets/arena/' + name.slice(6) + '.glb';
  if (name.startsWith('furn/')) return 'assets/furniture/' + name.slice(5) + '.glb';
  if (name.startsWith('st/')) return 'assets/station/' + name.slice(3) + '.glb';
  if (name.startsWith('sp/')) return 'assets/space/' + name.slice(3) + '.glb';
  return name;
}

export function load(name) {
  if (!cache.has(name)) {
    cache.set(name, new Promise((res, rej) => {
      loader.load(path(name), g => {
        g.scene.traverse(o => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => { if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.colorSpace = THREE.SRGBColorSpace; } });
          }
        });
        // Размер исходной модели — для нормализации
        g.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g.scene);
        g.size = box.getSize(new THREE.Vector3());
        g.box = box;
        vals.set(name, g);
        res(g);
      }, undefined, rej);
    }));
  }
  return cache.get(name);
}

export function loadAll(names, onProgress) {
  let done = 0;
  return Promise.all(names.map(n => load(n).then(r => { done++; onProgress && onProgress(done / names.length); return r; })));
}

export const preload = loadAll;
export const has = name => vals.has(name);

// Персонаж: копия модели, высота height, свой AnimationMixer
export function makeCharacter(name, height = 1.7) {
  const g = vals.get(name);
  const root = new THREE.Group();
  const model = skClone(g.scene);
  const s = height / g.size.y;
  model.scale.setScalar(s);
  model.position.y = -g.box.min.y * s;
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clips = {};
  g.animations.forEach(c => clips[c.name] = c);
  const parts = {};
  model.traverse(o => { if (o.name) parts[o.name] = o; });
  return { root, model, mixer, clips, parts, scale: s };
}

// Статичный объект с нормализацией: fit = {h} | {w} | {s}
export function makeProp(name, opts = {}) {
  const g = vals.get(name);
  const m = g.scene.clone(true);
  let s = opts.s || 1;
  if (opts.h) s = opts.h / g.size.y;
  if (opts.w) s = opts.w / Math.max(g.size.x, g.size.z);
  m.scale.setScalar(s);
  const grp = new THREE.Group();
  if (opts.center) {
    const c = g.box.getCenter(new THREE.Vector3());
    m.position.set(-c.x * s, -g.box.min.y * s, -c.z * s);
  }
  grp.add(m);
  return grp;
}

// Много одинаковых статичных объектов одним вызовом отрисовки (InstancedMesh)
export function makeInstanced(name, placements, opts = {}) {
  const g = vals.get(name);
  const group = new THREE.Group();
  const s0 = opts.s || 1;
  g.scene.updateMatrixWorld(true);
  const meshes = [];
  g.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const mesh of meshes) {
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length);
    inst.castShadow = opts.shadow !== false; inst.receiveShadow = true;
    placements.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r || 0);
      const sc = (p.s || 1) * s0;
      m4.compose(new THREE.Vector3(p.x, p.y || 0, p.z), q, new THREE.Vector3(sc * (p.sx || 1), sc * (p.sy || 1), sc * (p.sz || 1)));
      m4.multiply(mesh.matrixWorld);
      inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}
