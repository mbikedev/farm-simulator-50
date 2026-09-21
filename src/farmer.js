import * as THREE from 'three';
import { loadModel } from './models.js';

// Personnage joueur : modèle 3D riggé + animé (Meshy), chargé via le système de
// modèles (fetch en local, embarqué pour la version web). Anime idle / marche.

const TARGET_HEIGHT = 1.9; // hauteur visée (m)
const ROT_Y = Math.PI;     // correction d'orientation (le modèle regarde -Z -> on le retourne)

// Pose assise (squelette Mixamo) : plie hanches puis genoux. [os, axe, angle rad]
// NB : GLTFLoader retire le « : » des noms Mixamo (mixamorig:LeftUpLeg -> mixamorigLeftUpLeg).
const SEAT_POSE = [
  ['mixamorigLeftUpLeg', 'x', -1.45],
  ['mixamorigRightUpLeg', 'x', -1.45],
  ['mixamorigLeftLeg', 'x', 1.55],
  ['mixamorigRightLeg', 'x', 1.55],
];

export function createFarmer() {
  const group = new THREE.Group();
  const state = {
    group, model: null, mixer: null, actions: {}, current: null, ready: false,
    actionPlaying: false, // une animation one-shot (récolte, salut…) est en cours
    seated: false, bones: {},
  };

  loadModel('farmer').then((m) => {
    if (!m) return; // pas de modèle -> le fermier reste invisible (repli minimal)
    const model = m.scene;

    // échelle + pieds au sol + centrage horizontal
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(TARGET_HEIGHT / (size.y || TARGET_HEIGHT));
    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.rotation.y = ROT_Y; // regarde l'avant du jeu (+Z)

    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // évite que le skinned mesh disparaisse (bbox figée)
        for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (mat?.emissive) mat.emissive.setScalar(0); // pas de halo émissif
          if (mat) mat.emissiveIntensity = 0;
        }
      }
    });
    group.add(model);

    // animations : idle par défaut, marche quand on bouge
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of (m.animations || [])) actions[clip.name] = mixer.clipAction(clip);
    state.mixer = mixer;
    state.actions = actions;
    // os (pose bind) pour la pose assise, capturés avant toute animation
    model.traverse((o) => { if (o.isBone) state.bones[o.name] = o; });
    for (const [name] of SEAT_POSE) {
      const b = state.bones[name];
      if (b) b.userData.restRot = b.rotation.clone();
    }
    // fin d'une animation one-shot -> on rend la main à idle/marche
    mixer.addEventListener('finished', () => { state.actionPlaying = false; });
    state.model = model;
    state.ready = true;
    if (state.seated) {
      // monté dans un véhicule avant la fin du chargement -> pose assise directe
      mixer.stopAllAction();
      applySeat(state, true);
    } else {
      const idle = pick(actions, ['Idle_9', 'Idle']);
      if (idle) { idle.play(); state.current = idle; }
    }
  });

  return state;
}

function pick(actions, names) {
  for (const n of names) if (actions[n]) return actions[n];
  return Object.values(actions)[0] || null;
}

// À appeler chaque frame : avance le mixer et enchaîne idle <-> marche.
export function updateFarmerAnim(state, dt, moving) {
  if (!state.mixer) return;
  if (state.seated) return; // pose assise figée pendant la conduite
  state.mixer.update(dt);
  if (state.actionPlaying) return; // laisse l'animation one-shot se terminer
  const want = moving ? pick(state.actions, ['Walking', 'Running']) : pick(state.actions, ['Idle_9', 'Idle']);
  if (want && want !== state.current) {
    if (state.current) state.current.fadeOut(0.2);
    want.reset().fadeIn(0.2).play();
    state.current = want;
  }
}

// Joue une animation ponctuelle (récolte, salut…) une seule fois, accélérée
// pour rester nerveuse, puis rend la main à idle/marche.
export function playFarmerAction(state, names, targetDur = 1.6) {
  if (!state.mixer) return;
  const act = pick(state.actions, Array.isArray(names) ? names : [names]);
  if (!act) return;
  const clip = act.getClip();
  act.reset();
  act.setLoop(THREE.LoopOnce, 1);
  act.clampWhenFinished = true;
  act.setEffectiveTimeScale(Math.max(1, clip.duration / targetDur));
  act.setEffectiveWeight(1);
  if (state.current && state.current !== act) state.current.fadeOut(0.15);
  act.fadeIn(0.15).play();
  state.current = act;
  state.actionPlaying = true;
}

// Applique (ou retire) la flexion des jambes de la pose assise.
function applySeat(state, on) {
  for (const [name, axis, ang] of SEAT_POSE) {
    const b = state.bones[name];
    if (b && b.userData.restRot) b.rotation[axis] = b.userData.restRot[axis] + (on ? ang : 0);
  }
}

// Assoit / relève le personnage (pose manuelle du squelette, sans animation
// « assise » disponible). À appeler à la montée / descente d'un véhicule.
// Robuste si appelé avant le chargement du modèle : la pose est réappliquée
// au chargement (voir createFarmer).
export function setFarmerSeated(state, seated) {
  if (state.seated === seated) return;
  state.seated = seated;
  if (seated && state.mixer) {
    state.mixer.stopAllAction();
    state.current = null;
    state.actionPlaying = false;
  }
  if (!state.model) return; // sera appliqué au chargement
  applySeat(state, seated);
  if (!seated) {
    const idle = pick(state.actions, ['Idle_9', 'Idle']);
    if (idle && state.mixer) { idle.reset().fadeIn(0.15).play(); state.current = idle; }
  }
}
