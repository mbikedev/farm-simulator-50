import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { terrainHeight } from './terrain.js';
import { audio } from './audio.js';
import { loadModel, normalizeModel, normalizeObject } from './models.js';

// Cherche un clip d'animation par mot-clé de nom (insensible à la casse).
function findClip(clips, keys) {
  for (const k of keys) {
    const c = clips.find((cl) => (cl.name || '').toLowerCase().includes(k));
    if (c) return c;
  }
  return null;
}

// Remplace le mesh codé de chaque animal d'un type par un vrai modèle 3D (si présent).
// Si le modèle porte une animation (ex. vache riggée qui marche), chaque instance
// reçoit son propre squelette (SkeletonUtils.clone) et son mixer, sinon on partage
// un simple clone de graphe (statique, plus léger).
// Deux clips exploités si présents : marche (mouvement) et repos (idle/broute).
// Un seul clip (vache/mouton) -> il joue en marchant, figé à l'arrêt.
function applyAnimalModel(list, name) {
  loadModel(name).then((m) => {
    if (!m) return; // pas de fichier -> on garde le mesh codé
    const clips = m.animations || [];
    const animated = clips.length > 0;
    const walkClip = animated ? (findClip(clips, ['walk', 'run', 'move']) || clips[0]) : null;
    const restClip = animated ? findClip(clips, ['idle', 'graze', 'eat', 'peck', 'stand']) : null;
    for (const a of list) {
      for (let i = a.mesh.children.length - 1; i >= 0; i--) a.mesh.remove(a.mesh.children[i]);
      if (animated) {
        // squelette indépendant par instance (sinon toutes partageraient les mêmes os)
        const inner = cloneSkeleton(m.scene);
        inner.traverse((o) => {
          if (o.isMesh || o.isSkinnedMesh) {
            o.castShadow = true; o.receiveShadow = true;
            o.frustumCulled = false; // le skinned mesh a une bbox figée -> ne pas le culler
            for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
              if (mat?.emissive) { mat.emissive.setScalar(0); mat.emissiveIntensity = 0; } // pas de halo
            }
          }
        });
        a.mesh.add(normalizeObject(inner, m.tuning));
        const mixer = new THREE.AnimationMixer(inner);
        const moveAction = mixer.clipAction(walkClip);
        moveAction.play();
        moveAction.time = Math.random() * walkClip.duration; // désynchronise les instances
        const restAction = restClip && restClip !== walkClip ? mixer.clipAction(restClip) : null;
        if (restAction) {
          restAction.play();
          restAction.time = Math.random() * restClip.duration;
          restAction.setEffectiveWeight(1);   // au repos par défaut
          moveAction.setEffectiveWeight(0);
        } else {
          moveAction.setEffectiveTimeScale(0); // pas de clip de repos -> figé à l'arrêt
        }
        a.mixer = mixer;
        a.moveAction = moveAction;
        a.restAction = restAction;
        a.moveWeight = 0;                       // poids courant du clip de marche (0..1)
        a.walkRate = 0.9 + Math.random() * 0.3; // légère variation de cadence
      } else {
        a.mesh.add(normalizeModel(m)); // cloné par animal (statique)
      }
      a.hasModel = true;               // désactive l'animation de tête codée
    }
  });
}

// Enclos et zones des animaux
export const PENS = {
  cows: { x: -75, z: 30, r: 24 },
  sheep: { x: 45, z: 55, r: 19 },
  chickens: { x: -12, z: -40, r: 11 }, // basse-cour près de la grange (sans clôture)
};

function mat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 }); }
function shadow(o) { o.castShadow = true; return o; }

// ---------- Modèles ----------

function buildCow() {
  const g = new THREE.Group();
  const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 2.0), mat(0xf2f0ea)));
  body.position.y = 1.15;
  g.add(body);
  // taches noires
  const patchMat = mat(0x2b2b2b);
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.7), patchMat);
  p1.position.set(0.35, 1.35, -0.45);
  g.add(p1);
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.55), patchMat);
  p2.position.set(-0.38, 1.05, 0.5);
  g.add(p2);
  // tête (groupe pour brouter)
  const head = new THREE.Group();
  const skull = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.7), mat(0xf2f0ea)));
  head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.25), mat(0xe8b4a8));
  muzzle.position.set(0, -0.18, 0.42);
  head.add(muzzle);
  for (const sx of [-0.3, 0.3]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.15), mat(0xf2f0ea));
    ear.position.set(sx, 0.18, 0);
    head.add(ear);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), mat(0xd8cba8));
    horn.position.set(sx * 0.55, 0.34, 0);
    head.add(horn);
  }
  head.position.set(0, 1.5, 1.15);
  g.add(head);
  // pattes
  for (const [sx, sz] of [[-0.35, 0.7], [0.35, 0.7], [-0.35, -0.7], [0.35, -0.7]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), mat(0xe8e5dd));
    leg.position.set(sx, 0.35, sz);
    g.add(leg);
  }
  // pis + queue
  const udder = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mat(0xe8b4a8));
  udder.position.set(0, 0.62, -0.55);
  g.add(udder);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5), mat(0xf2f0ea));
  tail.position.set(0, 1.25, -1.05);
  tail.rotation.x = 0.25;
  g.add(tail);
  return { mesh: g, head, headRest: { x: 0, y: 1.5 } };
}

function buildSheep() {
  const g = new THREE.Group();
  const wool = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), mat(0xf5f2e8)));
  wool.scale.set(1, 0.85, 1.35);
  wool.position.y = 0.85;
  g.add(wool);
  const woolTop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0xf5f2e8));
  woolTop.position.set(0, 1.25, 0.55);
  g.add(woolTop);
  const head = new THREE.Group();
  const skull = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.45), mat(0x4a423a)));
  head.add(skull);
  for (const sx of [-0.18, 0.18]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), mat(0x4a423a));
    ear.position.set(sx, 0.1, 0);
    head.add(ear);
  }
  head.position.set(0, 1.05, 0.85);
  g.add(head);
  for (const [sx, sz] of [[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.4], [0.25, -0.4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), mat(0x4a423a));
    leg.position.set(sx, 0.25, sz);
    g.add(leg);
  }
  return { mesh: g, head, headRest: { x: 0, y: 1.05 } };
}

function buildChicken() {
  const g = new THREE.Group();
  const body = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xf7f4ec)));
  body.scale.set(1, 0.95, 1.25);
  body.position.y = 0.32;
  g.add(body);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0xf7f4ec));
  head.add(skull);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.12), mat(0xd83a2a));
  comb.position.y = 0.15;
  head.add(comb);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), mat(0xe8a020));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0, 0.16);
  head.add(beak);
  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), mat(0xd83a2a));
  wattle.position.set(0, -0.09, 0.12);
  head.add(wattle);
  head.position.set(0, 0.62, 0.14);
  g.add(head);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), mat(0xe0d8c8));
  tail.rotation.x = -Math.PI / 2.4;
  tail.position.set(0, 0.42, -0.3);
  g.add(tail);
  for (const sx of [-0.07, 0.07]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 5), mat(0xe8a020));
    leg.position.set(sx, 0.1, 0);
    g.add(leg);
  }
  return { mesh: g, head, headRest: { x: 0, y: 0.62 } };
}

// ---------- Clôtures ----------

function buildFence(scene, pen) {
  const postMat = mat(0x6b4a2a);
  const railMat = mat(0x8a6a42);
  const n = Math.max(10, Math.round((2 * Math.PI * pen.r) / 4));
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = pen.x + Math.cos(a) * pen.r;
    const z = pen.z + Math.sin(a) * pen.r;
    const y = terrainHeight(x, z);
    if (i < n) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.18), postMat);
      post.position.set(x, y + 0.65, z);
      post.castShadow = true;
      scene.add(post);
    }
    if (prev) {
      const dx = x - prev.x, dz = z - prev.z;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      for (const ry of [0.5, 1.0]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, len), railMat);
        rail.position.set((x + prev.x) / 2, (y + prev.y) / 2 + ry, (z + prev.z) / 2);
        rail.rotation.y = yaw;
        scene.add(rail);
      }
    }
    prev = { x, y, z };
  }
}

// ---------- Comportement ----------

function makeAnimal(build, pen, speed) {
  const { mesh, head, headRest } = build();
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * (pen.r - 2);
  const animal = {
    mesh, head, headRest, pen, speed,
    x: pen.x + Math.cos(a) * d,
    z: pen.z + Math.sin(a) * d,
    heading: Math.random() * Math.PI * 2,
    state: 'idle',          // idle (brouter/picorer) | walk | flee
    timer: 1 + Math.random() * 3,
    tx: 0, tz: 0,
    phase: Math.random() * 10,
    cryTimer: 3 + Math.random() * 20,
  };
  animal.mesh.position.set(animal.x, terrainHeight(animal.x, animal.z), animal.z);
  animal.mesh.rotation.y = animal.heading;
  return animal;
}

export function buildAnimals(scene) {
  const animals = [];

  buildFence(scene, PENS.cows);
  buildFence(scene, PENS.sheep);

  const tag = (a, type) => { a.type = type; a.prodReady = 0; return a; };
  for (let i = 0; i < 7; i++) animals.push(tag(makeAnimal(buildCow, PENS.cows, 1.1), 'cow'));
  for (let i = 0; i < 9; i++) animals.push(tag(makeAnimal(buildSheep, PENS.sheep, 1.4), 'sheep'));
  for (let i = 0; i < 10; i++) animals.push(tag(makeAnimal(buildChicken, PENS.chickens, 2.2), 'chicken'));

  for (const a of animals) scene.add(a.mesh);

  // Remplacement par de vrais modèles 3D si les fichiers existent
  applyAnimalModel(animals.filter(a => a.type === 'cow'), 'cow');
  applyAnimalModel(animals.filter(a => a.type === 'sheep'), 'sheep');
  applyAnimalModel(animals.filter(a => a.type === 'chicken'), 'chicken');

  // Abreuvoir décoratif dans l'enclos des vaches
  const trough = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.0), mat(0x7a8288));
  trough.position.set(PENS.cows.x + 8, terrainHeight(PENS.cows.x + 8, PENS.cows.z) + 0.25, PENS.cows.z);
  trough.castShadow = true;
  scene.add(trough);
  const troughWater = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.8), mat(0x2e7fb8));
  troughWater.position.copy(trough.position).y += 0.22;
  scene.add(troughWater);

  // Poulailler dans la basse-cour
  const coop = new THREE.Group();
  const coopBody = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.0), mat(0xb5762a)));
  coopBody.position.y = 1.2;
  coop.add(coopBody);
  const coopRoof = shadow(new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 4), mat(0x8c4a2a)));
  coopRoof.position.y = 2.65;
  coopRoof.rotation.y = Math.PI / 4;
  coop.add(coopRoof);
  const coopDoor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.1), mat(0x4a3220));
  coopDoor.position.set(0, 0.75, 1.02);
  coop.add(coopDoor);
  coop.position.set(PENS.chickens.x - 6, terrainHeight(PENS.chickens.x - 6, PENS.chickens.z - 4), PENS.chickens.z - 4);
  scene.add(coop);

  const _dir = new THREE.Vector3();

  function update(dt, t, playerPos) {
    for (const a of animals) {
      const isChicken = a.pen === PENS.chickens;

      // Les poules fuient le joueur / véhicule proche
      if (isChicken && playerPos) {
        const dp = Math.hypot(a.x - playerPos.x, a.z - playerPos.z);
        if (dp < 5 && a.state !== 'flee') {
          a.state = 'flee';
          a.timer = 1.2;
          const away = Math.atan2(a.x - playerPos.x, a.z - playerPos.z);
          a.tx = a.pen.x + Math.sin(away) * (a.pen.r - 1);
          a.tz = a.pen.z + Math.cos(away) * (a.pen.r - 1);
          audio.cry('chicken-alarm', dp);
        }
      }

      // cris espacés, audibles selon la distance au joueur
      a.cryTimer -= dt;
      if (a.cryTimer <= 0) {
        a.cryTimer = 8 + Math.random() * 22;
        if (playerPos) {
          const dist = Math.hypot(a.x - playerPos.x, a.z - playerPos.z);
          const type = a.pen === PENS.cows ? 'cow' : a.pen === PENS.sheep ? 'sheep' : 'chicken';
          audio.cry(type, dist);
        }
      }

      a.timer -= dt;
      if (a.state === 'idle') {
        // brouter / picorer : la tête plonge
        const peck = isChicken
          ? (Math.sin(t * 9 + a.phase) > 0.55 ? 0.5 : 0)
          : Math.max(0, Math.sin(t * 0.7 + a.phase)) * 0.55;
        if (!a.hasModel) {
          a.head.rotation.x = peck;
          a.head.position.y = a.headRest.y - peck * (isChicken ? 0.25 : 0.45);
        }
        if (a.timer <= 0) {
          const na = Math.random() * Math.PI * 2;
          const nd = Math.sqrt(Math.random()) * (a.pen.r - 2);
          a.tx = a.pen.x + Math.cos(na) * nd;
          a.tz = a.pen.z + Math.sin(na) * nd;
          a.state = 'walk';
          a.timer = 10;
        }
      } else {
        // marcher vers la cible
        if (!a.hasModel) {
          a.head.rotation.x = 0;
          a.head.position.y = a.headRest.y;
        }
        const dx = a.tx - a.x, dz = a.tz - a.z;
        const dist = Math.hypot(dx, dz);
        const speed = a.state === 'flee' ? a.speed * 2.2 : a.speed;
        if (dist < 0.5 || a.timer <= 0) {
          a.state = 'idle';
          a.timer = 2 + Math.random() * 5;
        } else {
          const want = Math.atan2(dx, dz);
          let diff = want - a.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.heading += THREE.MathUtils.clamp(diff, -2.5 * dt, 2.5 * dt);
          a.x += Math.sin(a.heading) * speed * dt;
          a.z += Math.cos(a.heading) * speed * dt;
          // petit trottinement
          a.mesh.position.y = terrainHeight(a.x, a.z) + Math.abs(Math.sin(t * (isChicken ? 14 : 7) + a.phase)) * (isChicken ? 0.06 : 0.04);
        }
        a.mesh.position.x = a.x;
        a.mesh.position.z = a.z;
        a.mesh.rotation.y = a.heading;
      }
      if (a.state === 'idle') {
        a.mesh.position.y = terrainHeight(a.x, a.z);
      }

      // Animation squelettique : marche en mouvement, repos (idle/broute) à
      // l'arrêt si un tel clip existe, sinon figé. Cadence plus rapide en fuite.
      if (a.mixer) {
        const moving = a.state === 'walk' || a.state === 'flee';
        const rate = a.walkRate * (a.state === 'flee' ? 1.8 : 1);
        if (a.restAction) {
          // fondu enchaîné marche <-> repos
          a.moveWeight += ((moving ? 1 : 0) - a.moveWeight) * Math.min(1, dt * 8);
          a.moveAction.setEffectiveWeight(a.moveWeight);
          a.restAction.setEffectiveWeight(1 - a.moveWeight);
          a.moveAction.setEffectiveTimeScale(rate);
        } else {
          a.moveAction.setEffectiveTimeScale(moving ? rate : 0);
        }
        a.mixer.update(dt);
      }
    }
  }

  return { update, animals };
}
