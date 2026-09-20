import * as THREE from 'three';
import { WORLD_SIZE, WATER_LEVEL, LAKE, ISLAND, terrainHeight } from './terrain.js';
import { PENS } from './animals.js';
import { MARKET } from './market.js';
import { loadModel, normalizeModel, attachModel } from './models.js';

// Emplacements clés du monde
export const SPOTS = {
  spawn: { x: 0, z: 0 },
  potatoField: { x: -120, z: -80, w: 100, d: 70 },
  factory: { x: -50, z: 120 },
  unloadZone: { x: -12, z: 105, r: 9 },     // déchargement (pommes de terre)
  loadZone: { x: -12, z: 135, r: 9 },       // chargement (matériaux)
  cranePad: { x: -28, z: 150 },
  cratePile: { x: -40, z: 158 },
  crateDrop: { x: -12, z: 158, r: 7 },
  buildArea: { x: 90, z: -40 },
  dock: { x: 128, z: 40 },
  islandDock: { x: 220, z: 68 },
};

function mat(color, opts = {}) {
  // Matériau PBR par défaut : mat, non métallique (bois, terre, plastique peint)
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05, ...opts });
}

export function buildWorld(scene) {
  const world = {
    plants: null,          // InstancedMesh des plants de pommes de terre
    plantData: [],         // { x, z, harvested }
    conveyorBoxes: [],
    smoke: [],
    zones: {},
    updatables: [],
  };

  // ---------- Lumières & ciel ----------
  scene.background = new THREE.Color(0x87c7ee);
  scene.fog = new THREE.Fog(0x9fd3f0, 220, 560);

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3d5a2a, 0.9);
  scene.add(hemi);
  world.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  world.sun = sun;

  // ---------- Étoiles (visibles la nuit) ----------
  const starCount = 350;
  const starPos = new Float32Array(starCount * 3);
  const starRand = mulberry32(99);
  for (let i = 0; i < starCount; i++) {
    const az = starRand() * Math.PI * 2;
    const el = Math.asin(starRand() * 0.95 + 0.05);
    const r = 430;
    starPos[i * 3] = Math.cos(el) * Math.cos(az) * r;
    starPos[i * 3 + 1] = Math.sin(el) * r;
    starPos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2.0, sizeAttenuation: false,
    transparent: true, opacity: 0, fog: false, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ---------- Cycle jour/nuit ----------
  const cNightSky = new THREE.Color(0x0a1226);
  const cDaySky = new THREE.Color(0x87c7ee);
  const cDuskSky = new THREE.Color(0xe08a4a);
  const cSunDay = new THREE.Color(0xfff2d0);
  const cSunLow = new THREE.Color(0xff9a55);
  const skyTmp = new THREE.Color();
  // t01 : 0 = minuit, 0.25 = lever, 0.5 = midi, 0.75 = coucher
  // renvoie le facteur jour (0 = nuit noire, 1 = plein jour)
  world.updateDayNight = (t01) => {
    const a = (t01 - 0.25) * Math.PI * 2;
    const e = Math.sin(a); // élévation du soleil
    sun.position.set(Math.cos(a) * 160, Math.max(e, -0.2) * 200 + 20, 80);
    const day = THREE.MathUtils.smoothstep(e, -0.12, 0.3);
    const dusk = Math.exp(-Math.pow((e - 0.04) / 0.16, 2));
    sun.intensity = 1.6 * day;
    sun.color.copy(cSunDay).lerp(cSunLow, 1 - THREE.MathUtils.smoothstep(e, 0.05, 0.5));
    hemi.intensity = 0.14 + 0.8 * day;
    skyTmp.copy(cNightSky).lerp(cDaySky, day).lerp(cDuskSky, dusk * 0.55);
    scene.background.copy(skyTmp);
    scene.fog.color.copy(skyTmp);
    starMat.opacity = Math.max(0, 1 - day * 1.6);
    return day;
  };

  // ---------- Sol ----------
  const segs = 140;
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segs, segs);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x5a9c3a);
  const cGrass2 = new THREE.Color(0x4f8c33);
  const cSand = new THREE.Color(0xcbb36a);
  const cDirt = new THREE.Color(0x8a6a3f);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    if (h < WATER_LEVEL + 0.5) tmp.copy(cSand);
    else if (h > 8) tmp.copy(cDirt).lerp(cGrass2, 0.4);
    else tmp.copy(cGrass).lerp(cGrass2, (Math.sin(x * 0.11) * Math.cos(z * 0.13) + 1) / 2);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0.0,
  }));
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- Eau ----------
  const waterGeo = new THREE.CircleGeometry(LAKE.radius + 30, 48);
  waterGeo.rotateX(-Math.PI / 2);
  // eau réfléchissante : faible rugosité -> reflète le ciel via l'environnement (IBL)
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
    color: 0x2e6fa8, transparent: true, opacity: 0.85,
    roughness: 0.12, metalness: 0.2, envMapIntensity: 1.4,
  }));
  water.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
  scene.add(water);
  world.updatables.push((t) => { water.position.y = WATER_LEVEL + Math.sin(t * 0.8) * 0.06; });

  // ---------- Route principale (spawn -> usine -> champ) ----------
  const roadMat = mat(0x3d3d42);
  const lineMat = mat(0xdddccc);
  // Bande plaquée au terrain entre deux points (route ou marquage)
  function groundStrip(x1, z1, x2, z2, width, material, lift) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const g = new THREE.PlaneGeometry(width, len, 1, Math.max(2, Math.round(len / 6)));
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, material);
    m.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    m.rotation.y = yaw;
    const p = g.attributes.position;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getZ(i);
      const wx = m.position.x + lx * cos + lz * sin;
      const wz = m.position.z - lx * sin + lz * cos;
      p.setY(i, terrainHeight(wx, wz) + lift);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  function roadSegment(x1, z1, x2, z2, width = 7) {
    groundStrip(x1, z1, x2, z2, width, roadMat, 0.07);
    groundStrip(x1, z1, x2, z2, 0.35, lineMat, 0.1);
  }
  roadSegment(0, -30, 0, 90);
  roadSegment(0, 90, -40, 110);
  roadSegment(0, -30, -90, -60);
  roadSegment(0, 20, 80, -30);
  // routes goudronnées desservant les champs
  roadSegment(-90, -60, -118, -48, 6);   // -> champ de pommes de terre (bord nord)
  roadSegment(-118, -48, -150, -5, 6);   // pommes de terre -> blé
  roadSegment(-150, -5, -153, 28, 6);    // -> champ de blé (bord est)
  roadSegment(80, -30, 62, -89, 6);      // chantier -> champ de maïs (bord nord)

  // ---------- Champs de cultures (pommes de terre, blé, maïs) ----------
  const m4 = new THREE.Matrix4();
  const FIELDS = [
    { type: 'potato', ...SPOTS.potatoField, rows: 9, cols: 24, soil: 0x6d4f2c, label: 'AARDAPPELEN' },
    { type: 'wheat', x: -190, z: 30, w: 80, d: 60, rows: 11, cols: 20, soil: 0x7d6a3a, label: 'TARWE' },
    { type: 'corn', x: 60, z: -115, w: 85, d: 55, rows: 8, cols: 18, soil: 0x6a5230, label: 'MAÏS' },
  ];
  const PLANT_SHAPES = {
    potato: { geo: new THREE.ConeGeometry(0.55, 1.1, 6), color: 0x3f7d23, lift: 0.55 },
    wheat: { geo: new THREE.ConeGeometry(0.24, 1.5, 5), color: 0xd8b84a, lift: 0.75 },
    corn: { geo: new THREE.CylinderGeometry(0.16, 0.24, 2.3, 6), color: 0x4e9430, lift: 1.15 },
  };
  world.fields = FIELDS;
  for (const f of FIELDS) {
    const fieldGeo = new THREE.PlaneGeometry(f.w, f.d, 20, 16);
    fieldGeo.rotateX(-Math.PI / 2);
    const fp = fieldGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      fp.setY(i, terrainHeight(f.x + fp.getX(i), f.z + fp.getZ(i)) + 0.05);
    }
    fieldGeo.computeVertexNormals();
    const field = new THREE.Mesh(fieldGeo, mat(f.soil));
    field.position.set(f.x, 0, f.z);
    field.receiveShadow = true;
    scene.add(field);

    // plants instanciés en rangées
    const shape = PLANT_SHAPES[f.type];
    const count = f.rows * f.cols;
    const plants = new THREE.InstancedMesh(shape.geo, mat(shape.color), count);
    plants.castShadow = true;
    let idx = 0;
    for (let r = 0; r < f.rows; r++) {
      for (let c = 0; c < f.cols; c++) {
        const x = f.x - f.w / 2 + 8 + c * ((f.w - 16) / (f.cols - 1));
        const z = f.z - f.d / 2 + 8 + r * ((f.d - 16) / (f.rows - 1));
        const y = terrainHeight(x, z) + shape.lift;
        m4.makeTranslation(x, y, z);
        plants.setMatrixAt(idx, m4);
        world.plantData.push({ x, z, type: f.type, harvested: false, mesh: plants, index: idx });
        idx++;
      }
    }
    scene.add(plants);

    // panneau du champ
    const c2 = document.createElement('canvas');
    c2.width = 512; c2.height = 128;
    const g2 = c2.getContext('2d');
    g2.fillStyle = '#3a2c18'; g2.fillRect(0, 0, 512, 128);
    g2.fillStyle = '#ffd97a'; g2.font = 'bold 60px sans-serif'; g2.textAlign = 'center';
    g2.fillText(f.label, 256, 86);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), side: THREE.DoubleSide })
    );
    const px = f.x, pz = f.z + f.d / 2 + 4;
    panel.position.set(px, terrainHeight(px, pz) + 3, pz);
    scene.add(panel);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), mat(0x6b4a2a));
    pole.position.set(px, terrainHeight(px, pz) + 1.5, pz);
    scene.add(pole);
  }

  // ---------- Usine ----------
  const fx = SPOTS.factory.x, fz = SPOTS.factory.z;
  const fy = terrainHeight(fx, fz);
  const factory = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(38, 14, 22), mat(0x9aa3ad));
  hall.position.y = 7; hall.castShadow = true; hall.receiveShadow = true;
  factory.add(hall);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 11.5, 38, 3, 1), mat(0x7c2d2d));
  roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI;
  roof.scale.set(1, 1, 0.5);
  roof.position.y = 14;
  factory.add(roof);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 16, 10), mat(0x6b6f76));
  chimney.position.set(-14, 18, -6); chimney.castShadow = true;
  factory.add(chimney);
  // Enseigne
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512; signCanvas.height = 96;
  const sc = signCanvas.getContext('2d');
  sc.fillStyle = '#20321e'; sc.fillRect(0, 0, 512, 96);
  sc.fillStyle = '#ffe98a'; sc.font = 'bold 52px sans-serif'; sc.textAlign = 'center';
  sc.fillText('BS50 FABRIEK', 256, 64);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 3.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas) })
  );
  sign.position.set(0, 11, 11.2);
  factory.add(sign);
  factory.position.set(fx, fy, fz);
  scene.add(factory);

  // Fumée de cheminée
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.4 });
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), smokeMat.clone());
    puff.position.set(fx - 14, fy + 26 + i * 3, fz - 6);
    puff.userData.phase = i / 6;
    scene.add(puff);
    world.smoke.push(puff);
  }
  world.updatables.push((t) => {
    for (const p of world.smoke) {
      const k = ((t * 0.12 + p.userData.phase) % 1);
      p.position.y = fy + 26 + k * 20;
      p.position.x = fx - 14 + Math.sin(t + p.userData.phase * 9) * (1 + k * 3);
      p.scale.setScalar(0.7 + k * 2.2);
      p.material.opacity = 0.45 * (1 - k);
    }
  });

  // ---------- Convoyeur (machine de déchargement) ----------
  const convA = { x: fx + 22, z: fz - 4 };
  const convB = { x: fx + 40, z: fz - 16 };
  const convLen = Math.hypot(convB.x - convA.x, convB.z - convA.z);
  const convYaw = Math.atan2(convB.x - convA.x, convB.z - convA.z);
  const conveyor = new THREE.Group();
  const belt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, convLen), mat(0x2b2b2e));
  belt.position.y = 2.2;
  conveyor.add(belt);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, convLen), mat(0xc9a13a));
  frame.position.y = 1.85;
  conveyor.add(frame);
  for (let i = 0; i <= 4; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.4), mat(0x777777));
    leg.position.set(0, 1, -convLen / 2 + (convLen / 4) * i);
    conveyor.add(leg);
  }
  conveyor.position.set((convA.x + convB.x) / 2, terrainHeight((convA.x + convB.x) / 2, (convA.z + convB.z) / 2), (convA.z + convB.z) / 2);
  conveyor.rotation.y = convYaw;
  conveyor.castShadow = true;
  scene.add(conveyor);

  // Caisses qui défilent sur le convoyeur
  const boxGeo = new THREE.BoxGeometry(1.4, 1.2, 1.4);
  const boxMat = mat(0xb5762a);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(boxGeo, boxMat);
    b.castShadow = true;
    b.userData.phase = i / 4;
    scene.add(b);
    world.conveyorBoxes.push(b);
  }
  world.updatables.push((t) => {
    for (const b of world.conveyorBoxes) {
      const k = (t * 0.07 + b.userData.phase) % 1;
      b.position.set(
        convA.x + (convB.x - convA.x) * k,
        conveyor.position.y + 3.1,
        convA.z + (convB.z - convA.z) * k
      );
      b.rotation.y = convYaw;
    }
  });

  // ---------- Zones de chargement / déchargement ----------
  function zoneRing(spot, color, label) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spot.r - 1.2, spot.r, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(spot.x, terrainHeight(spot.x, spot.z) + 0.12, spot.z);
    scene.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(spot.r - 1.2, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(ring.position).y -= 0.01;
    scene.add(disc);
    // panneau
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g2 = c.getContext('2d');
    g2.fillStyle = 'rgba(10,20,10,0.85)'; g2.fillRect(0, 0, 512, 128);
    g2.fillStyle = '#' + new THREE.Color(color).getHexString();
    g2.font = 'bold 56px sans-serif'; g2.textAlign = 'center';
    g2.fillText(label, 256, 84);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide })
    );
    panel.position.set(spot.x, terrainHeight(spot.x, spot.z) + 5, spot.z);
    scene.add(panel);
    world.updatables.push(() => { }); // (placeholder)
    return { spot, ring, panel };
  }
  world.zones.unload = zoneRing(SPOTS.unloadZone, 0xffcc33, 'LOSSEN 🥔');
  world.zones.load = zoneRing(SPOTS.loadZone, 0x44aaff, 'LADEN 🧱');
  world.zones.crateDrop = zoneRing(SPOTS.crateDrop, 0x9dff57, 'KRATTEN');

  // ---------- Pile de caisses pour la grue ----------
  world.crates = [];
  for (let i = 0; i < 6; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), mat(0xc98936));
    const cx = SPOTS.cratePile.x + (i % 3) * 2.2 - 2.2;
    const cz = SPOTS.cratePile.z + Math.floor(i / 3) * 2.2;
    crate.position.set(cx, terrainHeight(cx, cz) + 0.8, cz);
    crate.castShadow = true;
    scene.add(crate);
    world.crates.push(crate);
  }

  // ---------- Chantier de construction ----------
  const b = SPOTS.buildArea;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(26, 40), mat(0xa08a5c));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(b.x, terrainHeight(b.x, b.z) + 0.05, b.z);
  pad.receiveShadow = true;
  scene.add(pad);
  // panneau chantier
  const bc = document.createElement('canvas');
  bc.width = 512; bc.height = 128;
  const bg = bc.getContext('2d');
  bg.fillStyle = '#e8b73a'; bg.fillRect(0, 0, 512, 128);
  bg.fillStyle = '#222'; bg.font = 'bold 48px sans-serif'; bg.textAlign = 'center';
  bg.fillText('🔨 BOUWTERREIN', 256, 82);
  const bpanel = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), side: THREE.DoubleSide })
  );
  bpanel.position.set(b.x, terrainHeight(b.x, b.z) + 4.5, b.z + 24);
  scene.add(bpanel);

  // ---------- Pontons ----------
  function dockAt(x, z, yaw) {
    const dock = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 16), mat(0x8a6a42));
    deck.position.y = WATER_LEVEL + 1.1;
    deck.castShadow = true;
    dock.add(deck);
    for (let i = 0; i < 4; i++) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 8), mat(0x5f4526));
      pile.position.set(i % 2 === 0 ? -1.6 : 1.6, WATER_LEVEL - 0.5, -6 + Math.floor(i / 2) * 12);
      dock.add(pile);
    }
    dock.position.set(x, 0, z);
    dock.rotation.y = yaw;
    scene.add(dock);
  }
  dockAt(SPOTS.dock.x, SPOTS.dock.z, Math.PI / 2.3);
  dockAt(SPOTS.islandDock.x, SPOTS.islandDock.z, -Math.PI / 3);

  // Drapeau sur l'île (objectif bateau)
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), mat(0xdddddd));
  flagPole.position.set(ISLAND.x, terrainHeight(ISLAND.x, ISLAND.z) + 3.5, ISLAND.z);
  scene.add(flagPole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ color: 0xff5533, side: THREE.DoubleSide }));
  flag.position.set(ISLAND.x + 1.2, terrainHeight(ISLAND.x, ISLAND.z) + 6.2, ISLAND.z);
  scene.add(flag);
  world.updatables.push((t) => { flag.rotation.y = Math.sin(t * 2.5) * 0.35; });

  // ---------- Arbres (instanciés) ----------
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3, 6);
  const crownGeo = new THREE.ConeGeometry(2.4, 5.5, 7);
  const treeCount = 160;
  const trunks = new THREE.InstancedMesh(trunkGeo, mat(0x6b4a2a), treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, mat(0x2f6e26), treeCount);
  trunks.castShadow = true; crowns.castShadow = true;
  let placed = 0, tries = 0;
  const treeXf = []; // transforms partagés (cônes de repli + arbre 3D détaillé)
  const rand = mulberry32(1234);
  while (placed < treeCount && tries < 4000) {
    tries++;
    const x = (rand() - 0.5) * 700;
    const z = (rand() - 0.5) * 700;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 1) continue;
    // éviter routes, champ, usine, chantier, lac
    if (Math.abs(x) < 12 && z > -40 && z < 100) continue;
    if (Math.hypot(x - fx, z - fz) < 45) continue;
    if (Math.hypot(x - b.x, z - b.z) < 35) continue;
    if (FIELDS.some(f => x > f.x - f.w / 2 - 10 && x < f.x + f.w / 2 + 10
      && z > f.z - f.d / 2 - 10 && z < f.z + f.d / 2 + 10)) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius + 18) continue;
    if (Math.hypot(x, z) < 22) continue;
    // pas d'arbres dans les enclos des animaux
    if (Math.hypot(x - PENS.cows.x, z - PENS.cows.z) < PENS.cows.r + 6) continue;
    if (Math.hypot(x - PENS.sheep.x, z - PENS.sheep.z) < PENS.sheep.r + 6) continue;
    if (Math.hypot(x - PENS.chickens.x, z - PENS.chickens.z) < PENS.chickens.r + 6) continue;
    if (Math.hypot(x - MARKET.x, z - MARKET.z) < MARKET.r + 6) continue;
    const s = 0.8 + rand() * 0.9;
    treeXf.push({ x, h, z, s, rotY: rand() * Math.PI * 2 });
    m4.makeScale(s, s, s);
    m4.setPosition(x, h + 1.5 * s, z);
    trunks.setMatrixAt(placed, m4);
    m4.makeScale(s, s, s);
    m4.setPosition(x, h + (3 + 2.75) * s * 0.85, z);
    crowns.setMatrixAt(placed, m4);
    placed++;
  }
  trunks.count = placed; crowns.count = placed;
  scene.add(trunks); scene.add(crowns);

  // Remplacement par un vrai arbre 3D (public/models/tree.glb) si présent.
  // On instancie chaque sous-maillage du modèle (1 appel de rendu chacun) et on
  // réduit le nombre d'arbres, car un arbre détaillé coûte bien plus cher qu'un cône.
  const MAX_DETAILED_TREES = 90;
  loadModel('tree').then((m) => {
    if (!m) return; // pas de fichier -> on garde les cônes
    const root = normalizeModel(m);
    root.updateMatrixWorld(true);
    // récupérer chaque sous-maillage, géométrie figée dans l'espace du modèle
    const parts = [];
    root.traverse((o) => {
      if (o.isMesh) {
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        parts.push({ geo: g, mat: o.material });
      }
    });
    if (!parts.length) return;
    const n = Math.min(placed, MAX_DETAILED_TREES);
    const insts = parts.map(({ geo, mat }) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.castShadow = true; im.receiveShadow = true;
      return im;
    });
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = treeXf[i];
      q.setFromAxisAngle(up, t.rotY);
      pos.set(t.x, t.h, t.z);
      scl.setScalar(t.s * 0.62); // modèle mis à l'échelle sur ~10 m -> ~5 à 10 m
      mm.compose(pos, q, scl);
      for (const im of insts) im.setMatrixAt(i, mm);
    }
    for (const im of insts) { im.instanceMatrix.needsUpdate = true; scene.add(im); }
    // retirer les cônes de repli
    scene.remove(trunks); scene.remove(crowns);
    trunks.geometry.dispose(); crowns.geometry.dispose();
  });

  // ---------- Ferme de départ ----------
  const barn = new THREE.Group();
  const barnBody = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 12), mat(0xa53a2e));
  barnBody.position.y = 3.5; barnBody.castShadow = true;
  barn.add(barnBody);
  const barnRoof = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 16.6, 3, 1), mat(0x5d3a26));
  barnRoof.rotation.z = Math.PI / 2;
  barnRoof.scale.set(1, 1, 0.55);
  barnRoof.position.y = 8.4;
  barn.add(barnRoof);
  barn.position.set(-25, terrainHeight(-25, -20), -20);
  barn.rotation.y = 0.4;
  scene.add(barn);
  // Remplace par le vrai modèle 3D (public/models/barn.glb) si présent
  attachModel(barn, 'barn');

  return world;
}

// PRNG déterministe pour un monde stable
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
