// Terrain analytique : la même fonction sert au maillage du sol
// et à la physique des véhicules (échantillonnage de hauteur).

export const WORLD_SIZE = 800;          // taille du monde (m)
export const WATER_LEVEL = -1.6;        // niveau de l'eau (m)

export const LAKE = { x: 210, z: 40, radius: 100, depth: 7 };
export const ISLAND = { x: 235, z: 75, radius: 18 };

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x, z) {
  // Douces ondulations générales
  let h = 0.35 * Math.sin(x * 0.018) * Math.cos(z * 0.021)
        + 0.2 * Math.sin(x * 0.05 + 1.3) * Math.sin(z * 0.043);

  // Collines en bordure du monde
  const d = Math.sqrt(x * x + z * z);
  h += smoothstep(300, 390, d) * 22;

  // Cuvette du lac
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h -= smoothstep(LAKE.radius, LAKE.radius * 0.45, LAKE.radius - (LAKE.radius - dl)) * 0;
  const lakeFactor = 1 - smoothstep(LAKE.radius * 0.55, LAKE.radius, dl);
  h -= lakeFactor * LAKE.depth;

  // Île au milieu du lac
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  const islandFactor = 1 - smoothstep(ISLAND.radius * 0.35, ISLAND.radius, di);
  h += islandFactor * (LAKE.depth + 1.2);

  return h;
}

export function isWater(x, z) {
  return terrainHeight(x, z) < WATER_LEVEL - 0.4;
}

// Normale approchée du terrain (pour incliner les véhicules)
export function terrainNormal(x, z, out) {
  const e = 1.2;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  out.set(hL - hR, 2 * e, hD - hU).normalize();
  return out;
}
