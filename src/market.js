import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { attachModel } from './models.js';

// Marché : prix fluctuants pour chaque culture, stand + panneau d'affichage 3D.
// Le joueur y vend au prix courant (potentiellement > ou < que le prix fixe usine).

export const MARKET = { x: 22, z: 74, r: 8 };

const BASE = { potato: 2, wheat: 3, corn: 4 };
const LABELS = { potato: 'Aardappel', wheat: 'Tarwe', corn: 'Maïs' };
const ORDER = ['potato', 'wheat', 'corn'];

function mat(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }); }

export function createMarket(scene) {
  const mx = MARKET.x, mz = MARKET.z, my = terrainHeight(mx, mz);

  // ---------- Stand ----------
  const stall = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 2.2), mat(0x8a5a34));
  counter.position.y = 0.55;
  counter.castShadow = true;
  stall.add(counter);
  // poteaux + auvent rayé
  for (const sx of [-2.7, 2.7]) {
    for (const sz of [-0.9, 0.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), mat(0x6b4a2a));
      post.position.set(sx, 1.5, sz);
      stall.add(post);
    }
  }
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 2.6), mat(i % 2 ? 0xd83a30 : 0xf0f0f0));
    stripe.position.set(-2.5 + i, 3.05, 0);
    stripe.rotation.x = 0.08;
    stall.add(stripe);
  }
  // cageots de produits sur le comptoir
  const crops3d = [
    { c: 0xcaa24a, x: -2 }, { c: 0xd8b84a, x: 0 }, { c: 0xe8c020, x: 2 },
  ];
  for (const cr of crops3d) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3), mat(0x9a6a3a));
    crate.position.set(cr.x, 1.35, 0.2);
    stall.add(crate);
    const pile = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat(cr.c));
    pile.scale.set(1, 0.45, 1);
    pile.position.set(cr.x, 1.7, 0.2);
    stall.add(pile);
  }
  stall.position.set(mx, my, mz);
  stall.rotation.y = Math.PI;
  scene.add(stall);
  attachModel(stall, 'market'); // vrai modèle 3D si présent (sinon garde l'étal codé)

  // ---------- Panneau des prix (canvas mis à jour) ----------
  const canvas = document.createElement('canvas');
  canvas.width = 300; canvas.height = 340;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.76),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  board.position.set(mx, my + 5, mz);
  scene.add(board);
  const boardPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 6), mat(0x5a4028));
  boardPost.position.set(mx, my + 2.5, mz);
  scene.add(boardPost);

  // ---------- Zone de vente ----------
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(MARKET.r - 1.2, MARKET.r, 40),
    new THREE.MeshBasicMaterial({ color: 0xffa83a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(mx, my + 0.12, mz);
  scene.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(MARKET.r - 1.2, 40),
    new THREE.MeshBasicMaterial({ color: 0xffa83a, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(mx, my + 0.11, mz);
  scene.add(disc);

  // ---------- État des prix ----------
  const prices = { potato: BASE.potato, wheat: BASE.wheat, corn: BASE.corn };
  const target = { ...prices };
  const trend = { potato: 0, wheat: 0, corn: 0 };
  let changeTimer = 6;

  function drawBoard() {
    g.fillStyle = '#1a2416';
    g.fillRect(0, 0, 300, 340);
    g.strokeStyle = '#ffd97a'; g.lineWidth = 4;
    g.strokeRect(6, 6, 288, 328);
    g.fillStyle = '#ffd97a';
    g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText('🛒 MARKT', 150, 48);
    g.font = 'bold 26px sans-serif'; g.textAlign = 'left';
    ORDER.forEach((crop, i) => {
      const y = 110 + i * 74;
      g.fillStyle = '#eaeadd';
      g.fillText(LABELS[crop], 26, y);
      const price = prices[crop];
      const up = trend[crop] > 0;
      g.fillStyle = up ? '#7ddf5a' : trend[crop] < 0 ? '#ff6a5a' : '#eaeadd';
      g.textAlign = 'right';
      g.fillText(`${price.toFixed(1)} €`, 232, y);
      g.fillText(trend[crop] > 0 ? '▲' : trend[crop] < 0 ? '▼' : '–', 278, y);
      g.textAlign = 'left';
      // barre relative au prix de base
      const frac = Math.min(1.6, price / BASE[crop]) / 1.6;
      g.fillStyle = '#3a4a30';
      g.fillRect(26, y + 10, 248, 8);
      g.fillStyle = up ? '#7ddf5a' : '#e0a83a';
      g.fillRect(26, y + 10, 248 * frac, 8);
    });
    tex.needsUpdate = true;
  }
  drawBoard();

  let redrawAcc = 0;

  return {
    MARKET,
    priceOf(crop) { return prices[crop]; },

    update(dt, playerPos) {
      // le panneau fait face à la caméra/joueur
      if (playerPos) board.lookAt(playerPos.x, board.position.y, playerPos.z);

      changeTimer -= dt;
      if (changeTimer <= 0) {
        changeTimer = 10 + Math.random() * 12;
        for (const crop of ORDER) {
          const factor = 0.6 + Math.random() * 1.0; // 0.6x .. 1.6x
          target[crop] = BASE[crop] * factor;
        }
      }
      let changed = false;
      for (const crop of ORDER) {
        const old = prices[crop];
        prices[crop] = THREE.MathUtils.damp(prices[crop], target[crop], 1.2, dt);
        const d = prices[crop] - old;
        trend[crop] = Math.abs(d) < 0.002 ? 0 : Math.sign(d);
        if (Math.abs(d) > 0.01) changed = true;
      }
      redrawAcc += dt;
      if (changed && redrawAcc > 0.25) { redrawAcc = 0; drawBoard(); }
    },
  };
}
