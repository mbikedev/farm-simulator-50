import * as THREE from 'three';
import { audio } from './audio.js';

// Météo dynamique : clair / pluie / brouillard, avec transitions douces.
// La pluie est un LineSegments (gouttes filées) qui suit le joueur.

const FOG_NEAR = 220, FOG_FAR = 560;        // brouillard de base (profondeur)
const MIST_NEAR = 25, MIST_FAR = 130;       // brouillard épais

const DROPS = 700;
const RAIN_BOX = { w: 70, h: 42 };          // volume de pluie autour du joueur
const RAIN_SPEED = 32;

export function createWeather(scene) {
  // ---------- Particules de pluie ----------
  const positions = new Float32Array(DROPS * 2 * 3);
  const drops = [];
  for (let i = 0; i < DROPS; i++) {
    drops.push({
      x: (Math.random() - 0.5) * RAIN_BOX.w,
      y: Math.random() * RAIN_BOX.h,
      z: (Math.random() - 0.5) * RAIN_BOX.w,
    });
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0xaac8e0, transparent: true, opacity: 0, fog: false, depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  const grey = new THREE.Color();
  const cGreyDay = new THREE.Color(0x9aa4aa);

  const weather = {
    current: 'clear',       // clear | rain | mist
    timer: 30 + Math.random() * 40,
    rainT: 0,               // intensité de pluie 0..1 (lissée)
    mistT: 0,               // intensité de brouillard 0..1 (lissée)

    // pour les tests / debug
    force(type, instant = false) {
      this.current = type;
      this.timer = 45 + Math.random() * 45;
      if (instant) {
        this.rainT = type === 'rain' ? 1 : 0;
        this.mistT = type === 'mist' ? 1 : 0;
      }
    },

    update(dt, playerPos, sun, hemi, day) {
      // changement de temps aléatoire
      this.timer -= dt;
      if (this.timer <= 0) {
        const r = Math.random();
        const next = r < 0.5 ? 'clear' : r < 0.75 ? 'rain' : 'mist';
        this.force(next);
      }

      // transitions douces (~5 s)
      this.rainT = THREE.MathUtils.damp(this.rainT, this.current === 'rain' ? 1 : 0, 0.8, dt);
      this.mistT = THREE.MathUtils.damp(this.mistT, this.current === 'mist' ? 1 : 0, 0.8, dt);

      // pluie : gouttes qui tombent autour du joueur
      rain.visible = this.rainT > 0.02;
      if (rain.visible) {
        rain.position.set(playerPos.x, playerPos.y, playerPos.z);
        rainMat.opacity = 0.55 * this.rainT;
        for (let i = 0; i < DROPS; i++) {
          const d = drops[i];
          d.y -= RAIN_SPEED * dt;
          if (d.y < 0) {
            d.y += RAIN_BOX.h;
            d.x = (Math.random() - 0.5) * RAIN_BOX.w;
            d.z = (Math.random() - 0.5) * RAIN_BOX.w;
          }
          const o = i * 6;
          positions[o] = d.x; positions[o + 1] = d.y; positions[o + 2] = d.z;
          positions[o + 3] = d.x; positions[o + 4] = d.y + 0.8; positions[o + 5] = d.z;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }

      // brouillard : la nappe rapproche les plans du fog, la pluie l'épaissit un peu
      const mix = Math.max(this.mistT, this.rainT * 0.45);
      scene.fog.near = THREE.MathUtils.lerp(FOG_NEAR, MIST_NEAR, this.mistT);
      scene.fog.far = THREE.MathUtils.lerp(FOG_FAR, MIST_FAR, this.mistT) * (1 - 0.3 * this.rainT);
      grey.copy(cGreyDay).multiplyScalar(0.2 + 0.8 * day);
      scene.fog.color.lerp(grey, mix);
      scene.background.lerp(grey, mix);

      // lumière voilée par le mauvais temps
      sun.intensity *= (1 - 0.6 * this.rainT) * (1 - 0.45 * this.mistT);
      hemi.intensity *= (1 - 0.25 * this.rainT) * (1 - 0.15 * this.mistT);

      audio.setRain(this.rainT);

      return this.mistT > 0.4 ? '🌫️' : this.rainT > 0.4 ? '🌧️' : '☀️';
    },
  };

  return weather;
}
