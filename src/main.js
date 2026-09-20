import * as THREE from 'three';
import { terrainHeight, isWater, WATER_LEVEL, ISLAND } from './terrain.js';
import { buildWorld, SPOTS } from './world.js';
import { Tractor, Harvester, MixerTruck, Excavator, Boat, Crane, buildFarmer } from './vehicles.js';
import { ui, toast, missions, missionHTML, setupBuildMenu } from './ui.js';
import { createControls } from './controls.js';

// ---------- Rendu ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 900);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Monde ----------
const world = buildWorld(scene);

// ---------- État du jeu ----------
const game = {
  world,
  scene,
  money: 500,
  potatoes: 0,
  materials: 4,
  stats: {
    potatoesHarvested: 0,
    potatoesDelivered: 0,
    crateDeliveries: 0,
    roadTiles: 0,
    housesBuilt: 0,
    reachedIsland: false,
  },
  vehicles: [],
  currentVehicle: null,
  missionIndex: 0,
  roadCells: new Map(),
  updatables: [],

  setMoney(v) { this.money = v; ui.setMoney(v); },
  setPotatoes(v) { this.potatoes = v; ui.setPotatoes(v); },
  setMaterials(v) { this.materials = v; ui.setMaterials(v); },
  toast,

  hidePlant(index) {
    const m = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    world.plants.setMatrixAt(index, m);
    world.plants.instanceMatrix.needsUpdate = true;
  },

  // --- Pelleteuse : creuser une fondation ---
  finishDig(excavator) {
    const p = excavator.mesh.position;
    const bx = p.x + Math.sin(excavator.heading) * 5.5;
    const bz = p.z + Math.cos(excavator.heading) * 5.5;
    const i = Math.round(bx / 6), j = Math.round(bz / 6);
    const key = `${i},${j}`;
    const cx = i * 6, cz = j * 6;
    if (isWater(cx, cz)) { toast('🌊 Niet in het water graven!'); return; }
    const cell = this.roadCells.get(key);
    if (cell) {
      toast(cell.state === 'road' ? '🛣️ Hier ligt al een weg.' : '🪏 Hier ligt al een fundering.');
      return;
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(5.7, 0.25, 5.7),
      new THREE.MeshLambertMaterial({ color: 0x7a5c36 })
    );
    mesh.position.set(cx, terrainHeight(cx, cz) + 0.12, cz);
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.roadCells.set(key, { state: 'foundation', mesh });
    toast('🪏 Fundering klaar! Stort nu beton met de betonmixer.');
  },

  // --- Camion-toupie : couler une dalle de route ---
  pourConcrete(mixer) {
    const p = mixer.mesh.position;
    const i = Math.round(p.x / 6), j = Math.round(p.z / 6);
    const cell = this.roadCells.get(`${i},${j}`);
    if (!cell || cell.state === 'road') {
      toast('🪏 Eerst een fundering graven met de graafmachine!');
      return;
    }
    if (this.materials < 1) {
      toast('🧱 Geen materialen! Koop ze in de blauwe zone LADEN.');
      return;
    }
    this.setMaterials(this.materials - 1);
    scene.remove(cell.mesh);
    const cx = i * 6, cz = j * 6;
    const road = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(5.9, 0.22, 5.9),
      new THREE.MeshLambertMaterial({ color: 0x46464c })
    );
    slab.receiveShadow = true;
    road.add(slab);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.24, 3.4),
      new THREE.MeshLambertMaterial({ color: 0xdddccc })
    );
    road.add(stripe);
    road.position.set(cx, terrainHeight(cx, cz) + 0.14, cz);
    scene.add(road);
    cell.state = 'road';
    cell.mesh = road;
    this.stats.roadTiles++;
    toast(`🛣️ Wegtegel gestort! (${this.stats.roadTiles})`);
  },

  // --- Grue : prendre / déposer des caisses ---
  craneAction(crane) {
    const hookPos = new THREE.Vector3();
    crane.hookWorldPos(hookPos);
    if (crane.carrying) {
      const crate = crane.carrying;
      crane.carrying = null;
      const drop = SPOTS.crateDrop;
      if (Math.hypot(hookPos.x - drop.x, hookPos.z - drop.z) < drop.r) {
        this.stats.crateDeliveries++;
        this.setMaterials(this.materials + 2);
        toast('🧱 Krat geleverd! +2 materialen');
        // la caisse « repart » sur la pile
        const k = Math.floor(Math.random() * 3);
        const cx = SPOTS.cratePile.x + k * 2.2 - 2.2;
        const cz = SPOTS.cratePile.z + Math.random() * 2;
        crate.position.set(cx, terrainHeight(cx, cz) + 0.8, cz);
        crate.rotation.y = 0;
      } else {
        crate.position.set(hookPos.x, terrainHeight(hookPos.x, hookPos.z) + 0.8, hookPos.z);
        toast('📦 Krat neergezet.');
      }
      return;
    }
    let best = null, bestD = 5;
    for (const crate of world.crates) {
      const d = Math.hypot(crate.position.x - hookPos.x, crate.position.z - hookPos.z);
      if (d < bestD) { bestD = d; best = crate; }
    }
    if (best) {
      crane.carrying = best;
      toast('🏗️ Krat opgetild!');
    } else {
      toast('📦 Geen krat onder de haak. Draai de kraan boven de stapel.');
    }
  },

  // --- Construction (menu Bâtir) ---
  tryBuild(item) {
    if (this.materials < item.matCost || this.money < item.moneyCost) {
      toast('❌ Niet genoeg geld of materialen!');
      return false;
    }
    const ref = this.currentVehicle ? this.currentVehicle.mesh.position : farmer.position;
    const heading = this.currentVehicle ? this.currentVehicle.heading : farmerState.heading;
    const bx = ref.x + Math.sin(heading) * 14;
    const bz = ref.z + Math.cos(heading) * 14;
    if (isWater(bx, bz)) { toast('🌊 Niet in het water bouwen!'); return false; }

    this.setMaterials(this.materials - item.matCost);
    this.setMoney(this.money - item.moneyCost);

    if (item.id === 'tractor') {
      const palette = [0xd8262c, 0x2e7d32, 0x1565c0, 0xef6c00, 0x6a1b9a, 0x00897b];
      const t = new Tractor(palette[Math.floor(Math.random() * palette.length)]);
      t.name = 'Eigen tractor';
      t.setPosition(bx, bz);
      t.heading = heading;
      t.placeOnGround();
      scene.add(t.mesh);
      this.vehicles.push(t);
      toast('🚜 Nieuwe tractor gebouwd! Stap in met « Instappen ».');
      return true;
    }

    const building = item.id === 'house' ? buildHouse() : buildShed();
    building.position.set(bx, terrainHeight(bx, bz), bz);
    building.rotation.y = heading + Math.PI;
    building.scale.setScalar(0.05);
    scene.add(building);
    let t0 = 0;
    this.updatables.push((dt) => {
      if (t0 >= 1) return;
      t0 = Math.min(1, t0 + dt);
      const s = 0.05 + (1 - Math.pow(1 - t0, 3)) * 0.95;
      building.scale.setScalar(s);
    });
    if (item.id === 'house') this.stats.housesBuilt++;
    toast(item.id === 'house' ? '🏠 Huis gebouwd!' : '🛖 Schuur gebouwd!');
    return true;
  },
};

// ---------- Bâtiments constructibles ----------
function lam(color) { return new THREE.MeshLambertMaterial({ color }); }

function buildHouse() {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(8, 4.6, 7), lam(0xe8dcc0));
  walls.position.y = 2.3;
  walls.castShadow = true;
  g.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 3.4, 4), lam(0xa5432e));
  roof.position.y = 6.3;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.15), lam(0x6b4a2a));
  door.position.set(0, 1.2, 3.55);
  g.add(door);
  for (const sx of [-2.4, 2.4]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.15), lam(0x9fd8ff));
    win.position.set(sx, 2.6, 3.55);
    g.add(win);
  }
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), lam(0x8a5a48));
  chimney.position.set(2.4, 6.6, -1.5);
  g.add(chimney);
  return g;
}

function buildShed() {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5.5), lam(0x8f9aa5));
  walls.position.y = 1.7;
  walls.castShadow = true;
  g.add(walls);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 7.4, 3, 1), lam(0x5b6670));
  roof.rotation.z = Math.PI / 2;
  roof.scale.set(1, 1, 0.5);
  roof.position.y = 4.1;
  roof.castShadow = true;
  g.add(roof);
  const doorOpen = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 0.15), lam(0x37424c));
  doorOpen.position.set(0, 1.3, 2.8);
  g.add(doorOpen);
  return g;
}

// ---------- Véhicules ----------
function addVehicle(v, x, z, heading = 0) {
  v.setPosition(x, z);
  v.heading = heading;
  if (!v.isBoat) v.placeOnGround();
  else v.mesh.rotation.y = heading;
  scene.add(v.mesh);
  game.vehicles.push(v);
  return v;
}

addVehicle(new Tractor(0x2e7d32), 10, -8, 0.5);
addVehicle(new Harvester(), -75, -70, Math.PI / 2);
addVehicle(new MixerTruck(), -32, 95, -0.6);
addVehicle(new Excavator(), 72, -28, -0.9);
addVehicle(new Boat(), 140, 48, Math.PI / 2);
const crane = addVehicle(new Crane(), SPOTS.cranePad.x, SPOTS.cranePad.z, 0);

// ---------- Fermier ----------
const farmer = buildFarmer();
const farmerState = { heading: 0, speed: 0 };
farmer.position.set(0, terrainHeight(0, 0), 4);
scene.add(farmer);

// ---------- Entrées ----------
const buildMenu = setupBuildMenu(game);

const input = createControls({
  onAction() {
    if (started === false) return;
    // acheter des matériaux dans la zone LADEN
    const pos = game.currentVehicle ? game.currentVehicle.mesh.position : farmer.position;
    const lz = SPOTS.loadZone;
    if (Math.hypot(pos.x - lz.x, pos.z - lz.z) < lz.r) {
      if (game.money >= 15) {
        game.setMoney(game.money - 15);
        game.setMaterials(game.materials + 1);
        toast('🧱 +1 materiaal gekocht (−15 €)');
      } else {
        toast('💶 Niet genoeg geld!');
      }
      return;
    }
    if (game.currentVehicle) game.currentVehicle.onAction(game);
  },
  onEnter() {
    if (!started) return;
    if (game.currentVehicle) {
      exitVehicle();
    } else {
      let best = null, bestD = Infinity;
      for (const v of game.vehicles) {
        const d = farmer.position.distanceTo(v.mesh.position);
        if (d < v.seatRadius && d < bestD) { bestD = d; best = v; }
      }
      if (best) enterVehicle(best);
      else toast('🚶 Geen voertuig in de buurt.');
    }
  },
  onBuild() {
    if (!started) return;
    buildMenu.toggle();
  },
});

function enterVehicle(v) {
  game.currentVehicle = v;
  farmer.visible = false;
  ui.setVehicle(`${v.emoji} ${v.name}`);
  toast(`${v.emoji} ${v.name}`);
}

function exitVehicle() {
  const v = game.currentVehicle;
  const offsets = [
    [Math.cos(v.heading) * 4, -Math.sin(v.heading) * 4],
    [-Math.cos(v.heading) * 4, Math.sin(v.heading) * 4],
    [-Math.sin(v.heading) * 6, -Math.cos(v.heading) * 6],
    [Math.sin(v.heading) * 7, Math.cos(v.heading) * 7],
  ];
  for (const [ox, oz] of offsets) {
    const x = v.mesh.position.x + ox;
    const z = v.mesh.position.z + oz;
    if (terrainHeight(x, z) > WATER_LEVEL + 0.2) {
      farmer.position.set(x, terrainHeight(x, z), z);
      farmer.visible = true;
      farmerState.heading = v.heading;
      game.currentVehicle = null;
      ui.setVehicle('🚶 Te voet');
      return;
    }
  }
  toast('⚓ Leg eerst aan bij een steiger of het strand!');
}

// ---------- Déchargement automatique à l'usine ----------
let unloadAcc = 0;
function updateUnloading(dt) {
  const v = game.currentVehicle;
  if (!v || v.kind !== 'harvester' || v.cargo <= 0) { unloadAcc = 0; return; }
  const uz = SPOTS.unloadZone;
  const p = v.mesh.position;
  if (Math.hypot(p.x - uz.x, p.z - uz.z) > uz.r || Math.abs(v.speed) > 0.8) { unloadAcc = 0; return; }
  unloadAcc += dt * 14;
  const n = Math.min(Math.floor(unloadAcc), v.cargo);
  if (n > 0) {
    unloadAcc -= n;
    v.cargo -= n;
    game.stats.potatoesDelivered += n;
    game.setPotatoes(Math.max(0, game.potatoes - n));
    game.setMoney(game.money + n * 2);
    toast(`💶 ${n * 2} € — aardappelen gelost! (nog ${v.cargo})`, 1200);
  }
}

// ---------- Missions ----------
function updateMissions() {
  if (game.missionIndex >= missions.length) return;
  // mission bateau : atteindre l'île
  const v = game.currentVehicle;
  if (v?.kind === 'boat') {
    if (Math.hypot(v.mesh.position.x - ISLAND.x, v.mesh.position.z - ISLAND.z) < 34) {
      game.stats.reachedIsland = true;
    }
  }
  if (missions[game.missionIndex].check(game)) {
    game.missionIndex++;
    toast('✅ Missie voltooid!', 3000);
    ui.setMission(missionHTML(game.missionIndex));
  }
}

// ---------- Caméra ----------
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
function updateCamera(dt) {
  const v = game.currentVehicle;
  const pos = v ? v.mesh.position : farmer.position;
  const heading = v ? v.heading : farmerState.heading;
  const dist = v ? v.camDist : 10;
  const height = v ? v.camHeight : 5;
  camDesired.set(
    pos.x - Math.sin(heading) * dist,
    pos.y + height,
    pos.z - Math.cos(heading) * dist
  );
  // la caméra ne passe pas sous le terrain
  const minY = Math.max(terrainHeight(camDesired.x, camDesired.z) + 2, WATER_LEVEL + 2);
  if (camDesired.y < minY) camDesired.y = minY;
  const k = 1 - Math.exp(-4 * dt);
  camera.position.lerp(camDesired, k);
  camTarget.set(pos.x, pos.y + (v?.kind === 'crane' ? 14 : 2.5), pos.z);
  camera.lookAt(camTarget);
}

// ---------- Fermier : marche ----------
function updateFarmer(dt) {
  if (game.currentVehicle) return;
  farmerState.heading -= input.turn * 2.6 * dt * (input.forward !== 0 ? 1 : 0.6);
  const speed = input.forward * 6;
  const nx = farmer.position.x + Math.sin(farmerState.heading) * speed * dt;
  const nz = farmer.position.z + Math.cos(farmerState.heading) * speed * dt;
  if (Math.abs(nx) < 380 && Math.abs(nz) < 380 && terrainHeight(nx, nz) > WATER_LEVEL) {
    farmer.position.x = nx;
    farmer.position.z = nz;
  }
  farmer.position.y = terrainHeight(farmer.position.x, farmer.position.z)
    + (speed !== 0 ? Math.abs(Math.sin(performance.now() * 0.012)) * 0.12 : 0);
  farmer.rotation.y = farmerState.heading;
}

// ---------- Boucle ----------
let started = false;
document.getElementById('btn-start').addEventListener('pointerdown', () => {
  document.getElementById('title-screen').style.display = 'none';
  started = true;
});

ui.setMoney(game.money);
ui.setPotatoes(0);
ui.setMaterials(game.materials);
ui.setMission(missionHTML(0));

const clock = new THREE.Clock();
const idleInput = { forward: 0, turn: 0 };

// Accès debug/tests (sans impact sur le jeu)
window.__game = game;
window.__farmer = farmer;
window.__enterVehicle = enterVehicle;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (started) {
    for (const v of game.vehicles) {
      v.update(dt, v === game.currentVehicle ? input : idleInput, game);
    }
    updateFarmer(dt);
    updateUnloading(dt);
    updateMissions();
  }
  for (const fn of world.updatables) fn(t);
  for (const fn of game.updatables) fn(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
});
