import * as THREE from 'three';
import { terrainHeight, terrainNormal, WATER_LEVEL } from './terrain.js';

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}
const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.55 });
const tireMat = mat(0x1c1c1e);
const rimMat = mat(0xd8c53a);

function shadow(o) { o.castShadow = true; return o; }

// Roue crantée de tracteur
function wheel(radius, width, rimColor = 0xd8c53a) {
  const g = new THREE.Group();
  const tire = shadow(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 18), tireMat));
  tire.rotation.z = Math.PI / 2;
  g.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.04, 12), mat(rimColor));
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  // crampons
  for (let i = 0; i < 10; i++) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, radius * 0.22, radius * 0.28), tireMat);
    const a = (i / 10) * Math.PI * 2;
    lug.position.set(0, Math.sin(a) * radius * 0.92, Math.cos(a) * radius * 0.92);
    lug.rotation.x = a;
    g.add(lug);
  }
  return g;
}

const _n = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _target = new THREE.Vector3();

export class Vehicle {
  constructor(def) {
    Object.assign(this, {
      name: def.name, emoji: def.emoji, kind: def.kind,
      maxSpeed: def.maxSpeed ?? 12, accel: def.accel ?? 10,
      turnRate: def.turnRate ?? 1.4, clearance: def.clearance ?? 0,
      camDist: def.camDist ?? 16, camHeight: def.camHeight ?? 7,
      isBoat: !!def.isBoat, isStatic: !!def.isStatic,
      seatRadius: def.seatRadius ?? 6,
    });
    this.mesh = new THREE.Group();
    this.heading = def.heading ?? 0;
    this.speed = 0;
    this.wheels = [];       // { mesh, radius, steer }
    this.time = 0;
    this.headlightSpots = [];
    this.lampMat = null;
  }

  // Phares : lampes à ±lx (visibles de jour, lumineuses de nuit)
  // + deux vrais projecteurs SpotLight activés seulement sur le véhicule conduit
  addHeadlights(lx, y, z) {
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x8a8a70 });
    for (const side of lx === 0 ? [0] : [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this.lampMat);
      lamp.position.set(side * lx, y, z);
      this.mesh.add(lamp);
      const spot = new THREE.SpotLight(0xffeeb0, 0, 55, 0.5, 0.45, 0);
      spot.position.set(side * lx, y, z);
      const target = new THREE.Object3D();
      target.position.set(side * lx * 0.5, Math.max(0, y - 2.5), z + 16);
      this.mesh.add(target);
      spot.target = target;
      this.mesh.add(spot);
      this.headlightSpots.push(spot);
    }
  }

  setLights(night, driven) {
    if (this.lampMat) this.lampMat.color.setHex(night ? 0xfff8c0 : 0x8a8a70);
    for (const s of this.headlightSpots) s.intensity = night && driven ? 5 : 0;
  }

  setPosition(x, z) {
    this.mesh.position.set(x, this.isBoat ? WATER_LEVEL : terrainHeight(x, z) + this.clearance, z);
  }

  // Conduite arcade commune (sol)
  drive(dt, input) {
    const fwd = input.forward;
    if (fwd > 0.05) this.speed = Math.min(this.maxSpeed, this.speed + this.accel * fwd * dt);
    else if (fwd < -0.05) this.speed = Math.max(-this.maxSpeed * 0.5, this.speed + this.accel * fwd * dt);
    else {
      const damp = Math.min(1, dt * 3);
      this.speed -= this.speed * damp;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    const steerFactor = THREE.MathUtils.clamp(this.speed / (this.maxSpeed * 0.35), -1, 1);
    this.heading -= input.turn * this.turnRate * steerFactor * dt;

    const nx = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;
    // limites du monde & pas dans l'eau profonde pour les véhicules terrestres
    const inBounds = Math.abs(nx) < 380 && Math.abs(nz) < 380;
    const h = terrainHeight(nx, nz);
    if (inBounds && h > WATER_LEVEL - 0.2) {
      this.mesh.position.x = nx;
      this.mesh.position.z = nz;
    } else {
      this.speed *= -0.3;
    }
    this.placeOnGround();
    this.spinWheels(dt, input);
  }

  placeOnGround() {
    const p = this.mesh.position;
    p.y = terrainHeight(p.x, p.z) + this.clearance;
    terrainNormal(p.x, p.z, _n);
    _fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    _fwd.sub(_tmp.copy(_n).multiplyScalar(_fwd.dot(_n))).normalize();
    _target.copy(p).add(_fwd);
    this.mesh.up.copy(_n);
    this.mesh.lookAt(_target);
  }

  spinWheels(dt, input) {
    for (const w of this.wheels) {
      w.mesh.rotation.x += (this.speed / w.radius) * dt;
      if (w.steer) w.mesh.parent.rotation.y = -input.turn * 0.45;
    }
  }

  addWheel(radius, width, x, y, z, steer = false, rimColor) {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    const w = wheel(radius, width, rimColor);
    holder.add(w);
    this.mesh.add(holder);
    this.wheels.push({ mesh: w, radius, steer });
    return holder;
  }

  update(dt, input, game) {
    this.time += dt;
    this.drive(dt, input);
  }

  onAction() { }
}

// ============================================================
// TRACTOR
// ============================================================
export class Tractor extends Vehicle {
  constructor(color = 0x2e7d32) {
    super({ name: 'Tractor', emoji: '🚜', kind: 'tractor', maxSpeed: 16, accel: 12, turnRate: 1.6, camDist: 15, camHeight: 6.5 });
    const body = mat(color);
    const dark = mat(0x24313a);

    // châssis + capot
    const chassis = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.8, 4.6), dark));
    chassis.position.y = 1.0;
    this.mesh.add(chassis);
    const hood = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 2.3), body));
    hood.position.set(0, 1.75, 1.35);
    this.mesh.add(hood);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.12), mat(0x555c63));
    grille.position.set(0, 1.68, 2.52);
    this.mesh.add(grille);
    // pot d'échappement
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), mat(0x333333));
    exhaust.position.set(0.55, 2.9, 0.9);
    this.mesh.add(exhaust);
    // cabine vitrée
    const cabFrame = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 2.0), body));
    cabFrame.position.set(0, 3.35, -0.8);
    this.mesh.add(cabFrame);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 1.9), glassMat);
    cab.position.set(0, 2.6, -0.8);
    this.mesh.add(cab);
    for (const sx of [-0.82, 0.82]) {
      for (const sz of [-1.7, 0.1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), body);
        pillar.position.set(sx, 2.6, -0.8 + (sz === -1.7 ? -0.9 : 0.95));
        this.mesh.add(pillar);
      }
    }
    // garde-boue arrière
    for (const sx of [-1, 1]) {
      const fender = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.5, 12, 1, false, 0, Math.PI), body));
      fender.rotation.z = Math.PI / 2;
      fender.rotation.y = Math.PI / 2;
      fender.position.set(sx * 1.15, 1.5, -1.4);
      this.mesh.add(fender);
    }
    // attelage
    const hitch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.7), mat(0x777777));
    hitch.position.set(0, 0.8, -2.5);
    this.mesh.add(hitch);
    // phares
    this.addHeadlights(0.5, 1.9, 2.56);
    // roues : grandes à l'arrière, directrices à l'avant
    this.addWheel(1.25, 0.7, -1.25, 1.25, -1.4);
    this.addWheel(1.25, 0.7, 1.25, 1.25, -1.4);
    this.addWheel(0.75, 0.5, -1.0, 0.75, 1.7, true);
    this.addWheel(0.75, 0.5, 1.0, 0.75, 1.7, true);
  }
}

// ============================================================
// AARDAPPELROOIER (arracheuse de pommes de terre)
// ============================================================
export class Harvester extends Vehicle {
  constructor() {
    super({ name: 'Aardappelrooier', emoji: '🥔', kind: 'harvester', maxSpeed: 10, accel: 8, turnRate: 1.2, camDist: 18, camHeight: 8 });
    this.cargo = { potato: 0, wheat: 0, corn: 0 };
    this.capacity = 150;
    const red = mat(0xb5342a);
    const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 5.2), red));
    body.position.y = 1.7;
    this.mesh.add(body);
    // trémie
    const hopper = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), mat(0x8d8d94)));
    hopper.position.set(0, 3.0, -1.2);
    this.mesh.add(hopper);
    this.potatoPile = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), mat(0xc9a24b));
    this.potatoPile.scale.set(1, 0.4, 1);
    this.potatoPile.position.set(0, 3.6, -1.2);
    this.potatoPile.visible = false;
    this.mesh.add(this.potatoPile);
    // cabine
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.4), glassMat);
    cab.position.set(0, 3.2, 1.4);
    this.mesh.add(cab);
    const cabTop = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.15, 1.5), red));
    cabTop.position.set(0, 3.95, 1.4);
    this.mesh.add(cabTop);
    // tapis frontal + rouleau
    const intake = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, 1.6), mat(0x44474d)));
    intake.position.set(0, 0.9, 3.1);
    intake.rotation.x = 0.35;
    this.mesh.add(intake);
    this.reel = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.7, 10), mat(0xd8c53a));
    drum.rotation.z = Math.PI / 2;
    this.reel.add(drum);
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 0.35), mat(0x8c2e2e));
      blade.rotation.x = (i / 6) * Math.PI * 2;
      this.reel.add(blade);
    }
    this.reel.position.set(0, 0.85, 3.9);
    this.mesh.add(this.reel);

    this.addWheel(1.1, 0.6, -1.5, 1.1, -1.6);
    this.addWheel(1.1, 0.6, 1.5, 1.1, -1.6);
    this.addWheel(0.8, 0.5, -1.3, 0.8, 1.8, true);
    this.addWheel(0.8, 0.5, 1.3, 0.8, 1.8, true);
    this.addHeadlights(0.7, 3.2, 2.15);
  }

  totalCargo() {
    return this.cargo.potato + this.cargo.wheat + this.cargo.corn;
  }

  update(dt, input, game) {
    super.update(dt, input, game);
    if (Math.abs(this.speed) > 0.3) this.reel.rotation.x += dt * this.speed * 1.5;
    // récolte automatique au-dessus des champs (toutes cultures)
    const EMOJI = { potato: '🥔', wheat: '🌾', corn: '🌽' };
    if (Math.abs(this.speed) > 0.5 && this.totalCargo() < this.capacity) {
      const p = this.mesh.position;
      for (const plant of game.world.plantData) {
        if (plant.harvested) continue;
        if (Math.hypot(plant.x - p.x, plant.z - p.z) < 3.4) {
          plant.harvested = true;
          game.hidePlant(plant);
          this.cargo[plant.type]++;
          if (plant.type === 'potato') game.stats.potatoesHarvested++;
          game.stats.cropsHarvested++;
          game.addCrop(plant.type, 1);
          game.awardXP(2, 'harvest'); // XP.harvest
          game.toast(`${EMOJI[plant.type]} +1 (${this.totalCargo()} geladen)`);
        }
      }
    }
    this.potatoPile.visible = this.totalCargo() > 0;
  }
}

// ============================================================
// BETONMIXER (camion-toupie)
// ============================================================
export class MixerTruck extends Vehicle {
  constructor() {
    super({ name: 'Betonmixer', emoji: '🚛', kind: 'mixer', maxSpeed: 14, accel: 10, turnRate: 1.3, camDist: 17, camHeight: 7.5 });
    const white = mat(0xe8e8ec);
    const orange = mat(0xe07820);
    // cabine
    const cab = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 1.8), white));
    cab.position.set(0, 1.95, 2.3);
    this.mesh.add(cab);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.1), glassMat);
    windshield.position.set(0, 2.25, 3.22);
    this.mesh.add(windshield);
    // châssis
    const chassis = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 6.5), mat(0x2c2c30)));
    chassis.position.y = 1.0;
    this.mesh.add(chassis);
    // toupie
    this.drum = new THREE.Group();
    const drumBody = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 3.2, 14), orange));
    drumBody.position.y = 0;
    this.drum.add(drumBody);
    const drumTip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, 1.0, 14), orange);
    drumTip.position.y = 2.1;
    this.drum.add(drumTip);
    // bandes hélicoïdales
    for (let i = 0; i < 3; i++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.07, 6, 20), white);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = -0.8 + i * 0.9;
      stripe.scale.setScalar(1 - i * 0.12);
      this.drum.add(stripe);
    }
    this.drum.rotation.x = -Math.PI / 2 + 0.28;
    this.drum.position.set(0, 2.5, -1.1);
    this.mesh.add(this.drum);
    // goulotte
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 1.6), mat(0x9a9aa2));
    chute.position.set(0, 1.6, -3.6);
    chute.rotation.x = 0.5;
    this.mesh.add(chute);

    this.addWheel(0.75, 0.5, -1.15, 0.75, 2.3, true);
    this.addWheel(0.75, 0.5, 1.15, 0.75, 2.3, true);
    this.addWheel(0.75, 0.5, -1.15, 0.75, -0.6, false, 0x666666);
    this.addWheel(0.75, 0.5, 1.15, 0.75, -0.6, false, 0x666666);
    this.addWheel(0.75, 0.5, -1.15, 0.75, -2.2, false, 0x666666);
    this.addWheel(0.75, 0.5, 1.15, 0.75, -2.2, false, 0x666666);
    this.addHeadlights(0.85, 1.7, 3.25);
  }

  update(dt, input, game) {
    super.update(dt, input, game);
    this.drum.rotation.y += dt * 1.6; // la toupie tourne toujours
  }

  onAction(game) {
    game.pourConcrete(this);
  }
}

// ============================================================
// GRAAFMACHINE (pelleteuse)
// ============================================================
export class Excavator extends Vehicle {
  constructor() {
    super({ name: 'Graafmachine', emoji: '🚧', kind: 'excavator', maxSpeed: 7, accel: 6, turnRate: 1.1, camDist: 17, camHeight: 8 });
    this.digTimer = 0;
    const yellow = mat(0xe8b400);
    // chenilles
    for (const sx of [-1.3, 1.3]) {
      const track = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 4.4), mat(0x2a2a2e)));
      track.position.set(sx, 0.55, 0);
      this.mesh.add(track);
      for (let i = 0; i < 5; i++) {
        const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 10), mat(0x55555c));
        roller.rotation.z = Math.PI / 2;
        roller.position.set(sx, 0.4, -1.7 + i * 0.85);
        this.mesh.add(roller);
      }
    }
    // tourelle
    this.turret = new THREE.Group();
    const cabBody = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 3.4), yellow));
    cabBody.position.set(0, 0.7, -0.4);
    this.turret.add(cabBody);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 1.6), glassMat);
    cab.position.set(-0.65, 1.9, 0.2);
    this.turret.add(cab);
    const counter = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.0), mat(0x8c6d00)));
    counter.position.set(0, 0.8, -2.2);
    this.turret.add(counter);
    // flèche articulée
    this.boom = new THREE.Group();
    const boomArm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 3.6), yellow));
    boomArm.position.set(0, 0, 1.8);
    this.boom.add(boomArm);
    this.stick = new THREE.Group();
    const stickArm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 2.6), yellow));
    stickArm.position.set(0, 0, 1.3);
    this.stick.add(stickArm);
    this.bucket = new THREE.Group();
    const bucketMesh = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.2, 8, 1, false, 0, Math.PI), mat(0x77777e)));
    bucketMesh.rotation.z = Math.PI / 2;
    this.bucket.add(bucketMesh);
    this.bucket.position.set(0, 0, 2.6);
    this.stick.add(this.bucket);
    this.stick.position.set(0, 0, 3.5);
    this.stick.rotation.x = 0.9;
    this.boom.add(this.stick);
    this.boom.position.set(0.6, 1.6, 0.9);
    this.boom.rotation.x = -0.55;
    this.turret.add(this.boom);
    this.turret.position.y = 1.0;
    this.mesh.add(this.turret);
    this.addHeadlights(0.9, 1.3, 2.3);
  }

  update(dt, input, game) {
    super.update(dt, input, game);
    if (this.digTimer > 0) {
      this.digTimer -= dt;
      const k = 1 - Math.max(0, this.digTimer) / 1.6;
      const dip = Math.sin(k * Math.PI);
      this.boom.rotation.x = -0.55 + dip * 0.55;
      this.stick.rotation.x = 0.9 - dip * 0.5;
      if (this.digTimer <= 0) game.finishDig(this);
    }
  }

  onAction(game) {
    if (this.digTimer <= 0 && Math.abs(this.speed) < 1) {
      this.digTimer = 1.6;
      game.toast('🪏 Graven…');
    }
  }
}

// ============================================================
// BOOT (bateau)
// ============================================================
export class Boat extends Vehicle {
  constructor() {
    super({ name: 'Boot', emoji: '🛥️', kind: 'boat', maxSpeed: 13, accel: 6, turnRate: 1.2, isBoat: true, camDist: 18, camHeight: 7 });
    const hullMat = mat(0x2255aa);
    // coque
    const hull = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 6.0), hullMat));
    hull.position.y = 0.4;
    this.mesh.add(hull);
    const bow = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.1, 3, 1), hullMat));
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI;
    bow.scale.set(1, 1, 0.9);
    bow.position.set(0, 0.4, 3.4);
    this.mesh.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 5.8), mat(0xd9c08a));
    deck.position.y = 1.0;
    this.mesh.add(deck);
    // cabine
    const cabin = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 2.0), mat(0xf0f0f4)));
    cabin.position.set(0, 1.6, 0.6);
    this.mesh.add(cabin);
    const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), glassMat);
    cabinGlass.position.set(0, 1.95, 0.62);
    this.mesh.add(cabinGlass);
    // moteur hors-bord
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), mat(0x222226));
    motor.position.set(0, 0.9, -3.1);
    this.mesh.add(motor);
    // fanion
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), mat(0xdddddd));
    pole.position.set(0, 2.6, -2.6);
    this.mesh.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: 0xff5533, side: THREE.DoubleSide }));
    flag.position.set(0.35, 3.0, -2.6);
    this.mesh.add(flag);
    // feu de proue
    this.addHeadlights(0, 1.35, 3.7);
  }

  update(dt, input, game) {
    this.time += dt;
    const fwd = input.forward;
    if (fwd > 0.05) this.speed = Math.min(this.maxSpeed, this.speed + this.accel * fwd * dt);
    else if (fwd < -0.05) this.speed = Math.max(-this.maxSpeed * 0.4, this.speed + this.accel * fwd * dt);
    else this.speed -= this.speed * Math.min(1, dt * 1.2);
    const steerFactor = THREE.MathUtils.clamp(this.speed / (this.maxSpeed * 0.3), -1, 1);
    this.heading -= input.turn * this.turnRate * steerFactor * dt;

    const nx = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;
    if (terrainHeight(nx, nz) < WATER_LEVEL - 0.7) {
      this.mesh.position.x = nx;
      this.mesh.position.z = nz;
    } else {
      this.speed *= -0.2; // échouage doux
    }
    this.mesh.position.y = WATER_LEVEL + 0.15 + Math.sin(this.time * 1.7) * 0.08;
    this.mesh.rotation.set(0, this.heading, 0);
    this.mesh.rotation.z = -input.turn * 0.12 * steerFactor;
    this.mesh.rotation.x = -this.speed * 0.008 + Math.sin(this.time * 1.3) * 0.02;
  }
}

// ============================================================
// KRAAN (grue à tour, statique)
// ============================================================
export class Crane extends Vehicle {
  constructor() {
    super({ name: 'Kraan', emoji: '🏗️', kind: 'crane', isStatic: true, camDist: 30, camHeight: 22, seatRadius: 9 });
    this.jibAngle = 0;
    this.trolleyPos = 8;   // distance le long de la flèche
    this.carrying = null;  // caisse portée
    const steel = mat(0xe8b400);
    // base
    const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), mat(0x8a8a90)));
    base.position.y = 0.5;
    this.mesh.add(base);
    // mât
    const mast = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.4, 20, 1.4), steel));
    mast.position.y = 10.5;
    this.mesh.add(mast);
    // croisillons décoratifs
    for (let i = 0; i < 9; i++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), mat(0x8c6d00));
      cross.position.y = 2 + i * 2.1;
      cross.rotation.y = Math.PI / 4;
      this.mesh.add(cross);
    }
    // partie tournante : flèche + contre-flèche + cabine
    this.top = new THREE.Group();
    const jib = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 18), steel));
    jib.position.set(0, 0, 9);
    this.top.add(jib);
    const counterJib = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 5), steel));
    counterJib.position.set(0, 0, -2.5);
    this.top.add(counterJib);
    const counterWeight = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.4), mat(0x666a70)));
    counterWeight.position.set(0, -0.5, -4.5);
    this.top.add(counterWeight);
    const craneCab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 1.3), glassMat);
    craneCab.position.set(1.2, -0.6, 0.5);
    this.top.add(craneCab);
    // apex + haubans
    const apex = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.5, 3, 4), steel);
    apex.position.set(0, 2, 0);
    this.top.add(apex);
    // chariot + câble + crochet
    this.trolley = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1.0), mat(0x333338));
    this.trolley.position.set(0, -0.6, this.trolleyPos);
    this.top.add(this.trolley);
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), mat(0x222222));
    this.top.add(this.cable);
    this.hook = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 8), mat(0xcc3333));
    this.hook.rotation.x = Math.PI;
    this.top.add(this.hook);
    this.top.position.y = 20.6;
    this.mesh.add(this.top);
    this.hookHeight = 6; // hauteur du crochet au-dessus du sol
  }

  // Position monde du crochet
  hookWorldPos(out) {
    this.top.updateWorldMatrix(true, false);
    out.set(0, 0, this.trolleyPos);
    this.top.localToWorld(out);
    out.y = terrainHeight(out.x, out.z) + this.hookHeight;
    return out;
  }

  update(dt, input, game) {
    this.time += dt;
    // rotation de la flèche + déplacement du chariot
    this.jibAngle -= input.turn * 0.7 * dt;
    this.trolleyPos = THREE.MathUtils.clamp(this.trolleyPos + input.forward * 5 * dt, 3, 17);
    this.top.rotation.y = this.jibAngle;
    this.trolley.position.z = this.trolleyPos;
    // câble et crochet
    const topY = this.top.position.y - 0.6;
    const groundY = (() => {
      const p = _tmp;
      this.hookWorldPos(p);
      return p.y;
    })();
    const cableLen = Math.max(1, this.mesh.position.y + topY - groundY);
    this.cable.scale.y = cableLen;
    this.cable.position.set(0, -0.6 - cableLen / 2, this.trolleyPos);
    this.hook.position.set(0, -0.6 - cableLen, this.trolleyPos);
    // caisse portée suit le crochet
    if (this.carrying) {
      const p = this.hookWorldPos(_tmp);
      this.carrying.position.set(p.x, p.y - 1.3, p.z);
      this.carrying.rotation.y = this.jibAngle;
    }
  }

  onAction(game) {
    game.craneAction(this);
  }
}

// ============================================================
// FERMIER / BÛCHERON (personnage à pied)
// ============================================================

// Texture de chemise à carreaux (tartan) générée sur canvas
function plaidTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const base = '#8f9488', dark = '#3f463c', line = '#c9cabf', red = '#7a3b30';
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  const bands = [0, 42, 84];
  g.globalAlpha = 0.55;
  for (const b of bands) {
    g.fillStyle = dark;
    g.fillRect(b, 0, 22, 128);
    g.fillRect(0, b, 128, 22);
  }
  g.globalAlpha = 0.4;
  for (const b of bands) {
    g.fillStyle = dark;
    g.fillRect(b, 0, 22, 128); // recouvrement -> carreaux plus sombres aux croisements
  }
  g.globalAlpha = 0.8;
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (const b of [11, 53, 95]) {
    g.beginPath(); g.moveTo(b, 0); g.lineTo(b, 128); g.stroke();
    g.beginPath(); g.moveTo(0, b); g.lineTo(128, b); g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

let _plaidMat = null;
function plaidMaterial() {
  if (!_plaidMat) _plaidMat = new THREE.MeshLambertMaterial({ map: plaidTexture() });
  return _plaidMat;
}

// Visage peint sur une texture, appliqué à la sphère de la tête.
// Repère UV de SphereGeometry : u=0.25 -> avant (+z), v croît du sommet vers le bas.
let _faceTex = null;
function faceTexture() {
  if (_faceTex) return _faceTex;
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const cx = W * 0.25;              // centre du visage (avant de la tête)
  // teint métis + cheveux/barbe caramel clair
  const skin = '#9c6a44', skinDark = '#744e30', skinLight = '#c08c5e';
  const hairCol = '#a5773f', hairDark = '#7c5528';

  // fond = cheveux (couvre côtés, arrière et sommet)
  x.fillStyle = hairCol;
  x.fillRect(0, 0, W, H);

  // ovale du visage (peau) avec dégradé de volume
  const faceCx = cx, faceCy = 128, faceRx = 46, faceRy = 70;
  const grd = x.createRadialGradient(faceCx - 10, faceCy - 14, 12, faceCx, faceCy, 74);
  grd.addColorStop(0, skinLight);
  grd.addColorStop(0.55, skin);
  grd.addColorStop(1, skinDark);
  x.save();
  x.beginPath();
  x.ellipse(faceCx, faceCy, faceRx, faceRy, 0, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = grd;
  x.fillRect(faceCx - faceRx, faceCy - faceRy, faceRx * 2, faceRy * 2);

  // ombres de modelé (joues, tempes)
  x.fillStyle = 'rgba(80,50,30,0.28)';
  x.beginPath(); x.ellipse(faceCx - 36, faceCy - 4, 12, 26, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(faceCx + 36, faceCy - 4, 12, 26, 0, 0, Math.PI * 2); x.fill();

  // barbe fournie (mâchoire + menton, remonte sur les joues)
  const beard = '#6f4a22', beardHi = '#8f6432';
  x.fillStyle = beard;
  x.beginPath();
  x.moveTo(faceCx - 46, faceCy - 8);
  x.quadraticCurveTo(faceCx - 48, faceCy + 52, faceCx - 20, faceCy + 74);
  x.quadraticCurveTo(faceCx, faceCy + 86, faceCx + 20, faceCy + 74);
  x.quadraticCurveTo(faceCx + 48, faceCy + 52, faceCx + 46, faceCy - 8);
  // bord supérieur : remonte sur les joues, laisse le milieu (bouche) sous la moustache
  x.quadraticCurveTo(faceCx + 40, faceCy + 14, faceCx + 22, faceCy + 26);
  x.quadraticCurveTo(faceCx, faceCy + 22, faceCx - 22, faceCy + 26);
  x.quadraticCurveTo(faceCx - 40, faceCy + 14, faceCx - 46, faceCy - 8);
  x.fill();
  // mèches claires de la barbe (volume)
  x.strokeStyle = beardHi; x.lineWidth = 1.4;
  for (let i = -6; i <= 6; i++) {
    x.beginPath();
    x.moveTo(faceCx + i * 5.5, faceCy + 34);
    x.lineTo(faceCx + i * 6.5, faceCy + 68);
    x.stroke();
  }
  x.restore();

  // implantation des cheveux (front + houppe)
  x.fillStyle = hairCol;
  x.beginPath();
  x.moveTo(faceCx - 48, faceCy - 30);
  x.quadraticCurveTo(faceCx - 40, faceCy - 78, faceCx, faceCy - 66);   // tempe G -> pic
  x.quadraticCurveTo(faceCx + 40, faceCy - 78, faceCx + 48, faceCy - 30);
  x.quadraticCurveTo(faceCx, faceCy - 58, faceCx - 48, faceCy - 30);   // ligne de front (léger pic central)
  x.fill();
  x.fillStyle = hairDark;
  x.fillRect(faceCx - 50, faceCy - 92, 100, 22); // masse au sommet

  // sourcils (auburn, légèrement inclinés)
  x.strokeStyle = hairDark; x.lineWidth = 6; x.lineCap = 'round';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(faceCx + s * 8, faceCy - 22);
    x.lineTo(faceCx + s * 30, faceCy - 26);
    x.stroke();
  }

  // yeux (blanc, iris marron, pupille, reflet)
  for (const s of [-1, 1]) {
    const ex = faceCx + s * 19, ey = faceCy - 10;
    x.fillStyle = '#f4efe8';
    x.beginPath(); x.ellipse(ex, ey, 11, 6.5, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5a3a1e';
    x.beginPath(); x.arc(ex, ey, 5, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1a1008';
    x.beginPath(); x.arc(ex, ey, 2.4, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(ex - 1.6, ey - 1.6, 1.2, 0, Math.PI * 2); x.fill();
    // paupière supérieure
    x.strokeStyle = 'rgba(120,80,55,0.6)'; x.lineWidth = 2;
    x.beginPath(); x.ellipse(ex, ey - 2, 11, 6, 0, Math.PI, Math.PI * 2); x.stroke();
  }

  // nez (arête ombrée + narines)
  x.strokeStyle = 'rgba(70,45,25,0.4)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(faceCx - 3, faceCy - 6); x.lineTo(faceCx - 5, faceCy + 16); x.stroke();
  x.fillStyle = 'rgba(55,35,20,0.55)';
  x.beginPath(); x.ellipse(faceCx - 6, faceCy + 18, 3, 2, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(faceCx + 6, faceCy + 18, 3, 2, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(200,150,105,0.5)';
  x.beginPath(); x.ellipse(faceCx, faceCy + 14, 4, 6, 0, 0, Math.PI * 2); x.fill(); // pointe éclairée

  // moustache (guidon) sous le nez, reliée à la barbe
  x.fillStyle = '#6f4a22';
  x.beginPath();
  x.moveTo(faceCx, faceCy + 24);
  x.quadraticCurveTo(faceCx - 16, faceCy + 22, faceCx - 26, faceCy + 26);
  x.quadraticCurveTo(faceCx - 38, faceCy + 30, faceCx - 40, faceCy + 20); // pointe G recourbée vers le haut
  x.quadraticCurveTo(faceCx - 30, faceCy + 34, faceCx, faceCy + 34);      // bas de l'aile G
  x.quadraticCurveTo(faceCx + 30, faceCy + 34, faceCx + 40, faceCy + 20); // aile D + pointe
  x.quadraticCurveTo(faceCx + 38, faceCy + 30, faceCx + 26, faceCy + 26);
  x.quadraticCurveTo(faceCx + 16, faceCy + 22, faceCx, faceCy + 24);
  x.fill();
  // reflets/mèches de la moustache
  x.strokeStyle = hairDark; x.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    x.beginPath();
    x.moveTo(faceCx + i * 5, faceCy + 25);
    x.lineTo(faceCx + i * 6.5, faceCy + 32);
    x.stroke();
  }

  // bouche (entre moustache et barbe)
  x.strokeStyle = '#8a4638'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(faceCx - 10, faceCy + 39); x.quadraticCurveTo(faceCx, faceCy + 43, faceCx + 10, faceCy + 39); x.stroke();

  const tex = new THREE.CanvasTexture(c);
  _faceTex = tex;
  return tex;
}

export function buildFarmer() {
  const g = new THREE.Group();
  const skin = mat(0x9c6a44);   // teint métis
  const denim = mat(0x3b4654);
  const boot = mat(0x2e2117);
  const hair = mat(0xa5773f);   // cheveux caramel clair
  const shirt = plaidMaterial();

  // bottes
  for (const sx of [-0.17, 0.17]) {
    const b = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.42), boot));
    b.position.set(sx, 0.11, 0.05);
    g.add(b);
  }
  // jambes (jean)
  for (const sx of [-0.17, 0.17]) {
    const leg = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.85, 8), denim));
    leg.position.set(sx, 0.62, 0);
    g.add(leg);
  }
  // bassin/jean
  const hips = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.32), denim));
  hips.position.y = 1.08;
  g.add(hips);
  // ceinture
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.36), mat(0x5a3a1e));
  belt.position.y = 1.25;
  g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.05), mat(0xccb040));
  buckle.position.set(0, 1.25, 0.19);
  g.add(buckle);

  // torse (chemise à carreaux)
  const torso = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.72, 10), shirt));
  torso.position.y = 1.68;
  g.add(torso);
  const chest = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.36), shirt));
  chest.position.y = 1.68;
  g.add(chest);
  // liseré de boutons
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.02), mat(0x2a2f26));
  placket.position.set(0, 1.68, 0.185);
  g.add(placket);

  // bras (manches à carreaux + mains)
  for (const sx of [-1, 1]) {
    const arm = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.68, 8), shirt));
    arm.position.set(sx * 0.4, 1.7, 0);
    arm.rotation.z = sx * 0.14;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), skin);
    hand.position.set(sx * 0.47, 1.33, 0.02);
    g.add(hand);
  }

  // cou + tête (visage peint sur texture)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 8), skin);
  neck.position.y = 2.06;
  g.add(neck);
  const head = shadow(new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 28, 24),
    new THREE.MeshLambertMaterial({ map: faceTexture() })
  ));
  head.scale.set(0.96, 1.12, 1.0);
  head.position.y = 2.34;
  g.add(head);

  // volume de cheveux à l'arrière/au sommet (la texture gère le devant)
  const backHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hair
  );
  backHair.scale.set(0.98, 1.1, 1.02);
  backHair.position.set(0, 2.4, -0.03);
  backHair.rotation.x = -0.15;
  g.add(backHair);
  // nez en relief (discret, par-dessus la texture)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), skin);
  nose.scale.set(0.8, 1.1, 1.1);
  nose.position.set(0, 2.325, 0.275);
  g.add(nose);
  // oreilles
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin);
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(sx * 0.27, 2.33, 0.02);
    g.add(ear);
  }

  return g;
}
