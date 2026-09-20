import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// modèle embarqué en data-URL base64 (le service d'artifacts ne diffuse pas les .glb)
import farmerData from './assets/farmerModel.js';
import { MIME as TEX_MIME, DATA as TEX_DATA } from './assets/farmerTexture.js';

// Charge le modèle 3D texturé du fermier (statique, sans rig).
// Renvoie un THREE.Group tout de suite ; le modèle est ajouté au chargement du .glb.
// La « marche » est simulée par un léger balancement (le modèle n'a pas d'animation).

const TARGET_HEIGHT = 1.95; // hauteur visée (m)

// Décode une chaîne base64 en Uint8Array
function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Décode le glb (évite tout fetch, bloqué par la CSP des artifacts)
function glbBuffer(dataUrl) {
  return b64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1)).buffer;
}

// Applique la texture au modèle. GLTFLoader décode l'image via un blob:
// que la CSP des artifacts bloque -> on la décode nous-mêmes avec
// createImageBitmap (sur un Blob, sans URL : insensible à la CSP).
function applyTexture(model) {
  const blob = new Blob([b64ToBytes(TEX_DATA)], { type: TEX_MIME });
  createImageBitmap(blob).then((bitmap) => {
    const tex = new THREE.Texture(bitmap);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // convention glTF (UV déjà orientées)
    tex.needsUpdate = true;
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.map = tex;
        o.material.color && o.material.color.setScalar(1);
        o.material.needsUpdate = true;
      }
    });
  }).catch((e) => console.warn('Texture fermier: décodage échoué', e));
}

export function createFarmer() {
  const group = new THREE.Group();
  const state = { group, model: null, ready: false, bob: 0 };

  const onLoad = (gltf) => {
    const model = gltf.scene;
    deformArms(model);            // rapproche les bras du corps (modèle sans rig)
    // échelle + pieds au sol + centrage
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_HEIGHT / (size.y || TARGET_HEIGHT));
    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      }
    });
    group.add(model);
    applyTexture(model);          // texture décodée de façon compatible CSP
    state.model = model;
    state.baseY = model.position.y;
    state.ready = true;
  };

  // parse() lit le binaire directement (aucun fetch réseau)
  try {
    new GLTFLoader().parse(glbBuffer(farmerData), '', onLoad,
      (err) => console.warn('Parse du modèle fermier échoué:', err));
  } catch (err) {
    console.warn('Décodage du modèle fermier échoué:', err);
  }

  return state;
}

// Rapproche les bras du corps en faisant pivoter les sommets des bras
// autour de l'épaule (le modèle est un seul mesh statique, sans squelette).
function deformArms(model) {
  const THETA = 0.55, shoulderY = 0.58, sxR = 0.28, thresh = 0.28, band = 0.16;
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i);
      const ax = Math.abs(x);
      if (ax <= thresh || y < -0.4 || y > 0.66) continue; // uniquement les bras
      const w = Math.min(1, (ax - thresh) / band);
      const side = x > 0 ? 1 : -1;
      const px = side * sxR, py = shoulderY;
      const ang = -side * THETA * w;      // rotation vers l'axe du corps
      const dx = x - px, dy = y - py;
      const c = Math.cos(ang), s = Math.sin(ang);
      p.setX(i, px + dx * c - dy * s);
      p.setY(i, py + dx * s + dy * c);
    }
    p.needsUpdate = true;
    o.geometry.computeVertexNormals();
  });
}

// À appeler chaque frame : léger balancement de marche
export function updateFarmerAnim(state, dt, moving) {
  if (!state.model) return;
  if (moving) {
    state.bob += dt * 9;
    state.model.position.y = state.baseY + Math.abs(Math.sin(state.bob)) * 0.06;
    state.model.rotation.z = Math.sin(state.bob) * 0.03;
    state.model.rotation.x = 0.08; // léger penché avant
  } else {
    state.bob = 0;
    // respiration très légère au repos
    state.model.position.y = state.baseY + Math.sin(performance.now() * 0.002) * 0.01;
    state.model.rotation.z = 0;
    state.model.rotation.x = 0;
  }
}
