// Build web autonome (pour publication en artefact / hébergement statique) :
// embarque les .glb en base64 dans src/models-embedded.js, construit avec des
// chemins relatifs, puis restaure le stub vide. La build Android/normale
// (npm run build) reste légère et charge les .glb depuis public/models.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const EMBED = ['tractor', 'cow', 'sheep', 'chicken', 'barn', 'house']; // pas l'arbre (trop lourd)
const STUB = 'export const EMBEDDED = {};\n';
const FILE = 'src/models-embedded.js';

let out = '// Généré par scripts/build-web.mjs — NE PAS COMMITER (voir le stub versionné).\n';
out += 'export const EMBEDDED = {\n';
for (const m of EMBED) {
  const b = fs.readFileSync(`public/models/${m}.glb`).toString('base64');
  out += `  ${m}: "data:model/gltf-binary;base64,${b}",\n`;
}
out += '};\n';

fs.writeFileSync(FILE, out);
try {
  execSync('npx vite build --base=./', { stdio: 'inherit' });
} finally {
  fs.writeFileSync(FILE, STUB); // toujours restaurer le stub
}
console.log('\nBuild web autonome prête dans dist/ (modèles 3D embarqués).');
