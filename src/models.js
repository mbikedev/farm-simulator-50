import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

// Charge un modèle une seule fois (promesse mise en cache).
// Résout avec { scene, animations, tuning } ou null si absent.
export function loadModel(name) {
  if (cache.has(name)) return cache.get(name);
  const url = `${import.meta.env.BASE_URL}models/${name}.glb`;
  const p = new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        gltf.scene.traverse((o) => {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
        });
        resolve({ scene: gltf.scene, animations: gltf.animations || [], tuning: TUNING[name] || {} });
      },
      undefined,
      () => resolve(null), // fichier absent -> repli sur le mesh codé
    );
  });
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
