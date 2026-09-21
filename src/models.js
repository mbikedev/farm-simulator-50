import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EMBEDDED } from './models-embedded.js';

// Chargement des modèles .glb déposés dans public/models/.
// Chaque modèle est optionnel : si le fichier est absent (404), on renvoie null
// et l'appelant garde son mesh codé à la main (aucun plantage).
//
// Réglages par modèle (échelle cible en mètres de HAUTEUR, rotation, décalage)
// — ajustés une fois les vrais fichiers fournis.
const TUNING = {
  tractor: { height: 3.2, rotY: 0, yOffset: 0 },
  cow:     { height: 2.0, rotY: 0, yOffset: 0 },
  sheep:   { height: 1.3, rotY: 0, yOffset: 0 },
  chicken: { height: 0.7, rotY: 0, yOffset: 0 },
  tree:    { height: 9.0, rotY: 0, yOffset: 0 },
  barn:    { height: 9.0, rotY: 0, yOffset: 0 },
  house:   { height: 8.0, rotY: 0, yOffset: 0 },
};

const loader = new GLTFLoader();
const cache = new Map();

// data-URL base64 -> ArrayBuffer (pour GLTFLoader.parse, sans réseau)
function dataUrlToArrayBuffer(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function markShadows(scene) {
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}

function onLoaded(name, resolve) {
  return (gltf) => {
    markShadows(gltf.scene);
    resolve({ scene: gltf.scene, animations: gltf.animations || [], tuning: TUNING[name] || {} });
  };
}

// --- Textures des modèles embarqués (compatible bac à sable web / CSP) ---
// GLTFLoader.parse charge les textures via une URL blob: récupérée par fetch,
// que la CSP du bac à sable bloque. On décode donc les images nous-mêmes,
// directement depuis le binaire glb, avec createImageBitmap (insensible à la CSP).
async function applyEmbeddedTextures(scene, arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  if (dv.getUint32(0, true) !== 0x46546c67) return; // pas un glb
  let offset = 12, json = null, bin = null;
  while (offset + 8 <= dv.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, offset + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(arrayBuffer, offset + 8, len);
    offset += 8 + len;
  }
  if (!json || !bin || !json.images) return;
  const bviews = json.bufferViews || [];
  const bitmaps = await Promise.all(json.images.map(async (img) => {
    if (img.bufferView === undefined) return null;
    const bv = bviews[img.bufferView];
    const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    try { return await createImageBitmap(new Blob([bytes], { type: img.mimeType || 'image/png' })); }
    catch { return null; }
  }));
  // matériau -> index d'image (via baseColorTexture)
  const matImg = {};
  (json.materials || []).forEach((m, i) => {
    const ti = m?.pbrMetallicRoughness?.baseColorTexture?.index;
    const src = ti !== undefined ? json.textures?.[ti]?.source : undefined;
    matImg[m.name || `mat${i}`] = src !== undefined ? src : -1;
  });
  const texCache = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!mat) continue;
      const idx = matImg[mat.name];
      if (idx === undefined || idx < 0 || !bitmaps[idx]) continue;
      let tex = texCache.get(idx);
      if (!tex) {
        tex = new THREE.Texture(bitmaps[idx]);
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        texCache.set(idx, tex);
      }
      mat.map = tex;
      if (mat.color) mat.color.setScalar(1);
      mat.needsUpdate = true;
    }
  });
}

// Charge un modèle une seule fois (promesse mise en cache). Résout avec
// { scene, animations, tuning } ou null si absent.
// Priorité au modèle EMBARQUÉ (version web publiée, où le bac à sable ne sert
// pas de .glb) via parse() sans réseau ; sinon fetch du fichier public/models.
function parseEmbedded(name, dataUrl) {
  const ab = dataUrlToArrayBuffer(dataUrl);
  return new Promise((resolve) => {
    loader.parse(ab, '', async (gltf) => {
      markShadows(gltf.scene);
      try { await applyEmbeddedTextures(gltf.scene, ab); } catch { /* garde sans texture */ }
      resolve({ scene: gltf.scene, animations: gltf.animations || [], tuning: TUNING[name] || {} });
    }, () => resolve(null));
  });
}

function fetchModel(name) {
  const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
  return new Promise((resolve) => {
    loader.load(url, onLoaded(name, resolve), undefined, () => resolve(null));
  });
}

// Données embarquées : la plupart des modèles dans EMBEDDED ; l'arbre (lourd)
// dans un chunk séparé chargé à la demande via import dynamique (fichier .js
// distinct, pour rester sous la limite de taille par fichier).
async function embeddedData(name) {
  if (EMBEDDED[name]) return EMBEDDED[name];
  if (name === 'tree') {
    try { const m = await import('./models-embedded-tree.js'); return m.TREE || null; }
    catch { return null; }
  }
  return null;
}

// Charge un modèle une seule fois (promesse mise en cache). Résout avec
// { scene, animations, tuning } ou null. Priorité au modèle embarqué (version
// web, parse() sans réseau) ; sinon fetch du fichier public/models.
export function loadModel(name) {
  if (cache.has(name)) return cache.get(name);
  const p = embeddedData(name).then((data) => data ? parseEmbedded(name, data) : fetchModel(name));
  cache.set(name, p);
  return p;
}

// Remplace le contenu d'un groupe par un vrai modèle .glb (si présent), en
// conservant la position/rotation/échelle du groupe. Garde le mesh codé sinon.
export function attachModel(group, name, onDone) {
  loadModel(name).then((m) => {
    if (!m) return;
    for (let i = group.children.length - 1; i >= 0; i--) group.remove(group.children[i]);
    group.add(normalizeModel(m));
    if (onDone) onDone();
  });
}

// Normalise un modèle chargé : recentré au sol, mis à l'échelle sur une hauteur
// cible, tourné selon le réglage. Renvoie un Group prêt à poser dans la scène.
export function normalizeModel(loaded) {
  const root = new THREE.Group();
  // clone : le même modèle chargé peut servir plusieurs objets (ex. 26 animaux).
  // géométries et matériaux restent partagés (mémoire), seul le graphe est cloné.
  const inner = loaded.scene.clone(true);
  root.add(inner);

  const box = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const t = loaded.tuning || {};
  const targetH = t.height || size.y || 1;
  const s = targetH / (size.y || 1);
  inner.scale.setScalar(s);
  // recentrer en X/Z, poser la base sur y=0
  inner.position.set(-center.x * s, -box.min.y * s + (t.yOffset || 0), -center.z * s);
  if (t.rotY) root.rotation.y = t.rotY;
  return root;
}
