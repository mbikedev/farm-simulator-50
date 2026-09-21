// Build web autonome (pour publication en artefact / hébergement statique) :
// embarque les .glb en base64, construit avec des chemins relatifs, puis
// restaure les stubs vides. La build Android/normale (npm run build) reste
// légère et charge les .glb depuis public/models.
//
// Les modèles courants vont dans src/models-embedded.js (chunk principal).
// L'arbre (lourd) va dans src/models-embedded-tree.js, chargé à la demande via
// import dynamique -> chunk .js séparé, pour rester sous la limite par fichier.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const MAIN = ['tractor', 'cow', 'sheep', 'chicken', 'barn', 'house', 'farmer'];
const FILE = 'src/models-embedded.js';
const TREE_FILE = 'src/models-embedded-tree.js';
const STUB = 'export const EMBEDDED = {};\n';
const TREE_STUB = 'export const TREE = null;\n';

function dataUrl(m) {
  return `data:model/gltf-binary;base64,${fs.readFileSync(`public/models/${m}.glb`).toString('base64')}`;
}

let main = '// Généré par scripts/build-web.mjs — NE PAS COMMITER (voir le stub versionné).\n';
main += 'export const EMBEDDED = {\n';
for (const m of MAIN) main += `  ${m}: "${dataUrl(m)}",\n`;
main += '};\n';

const tree = '// Généré par scripts/build-web.mjs — NE PAS COMMITER (voir le stub versionné).\n'
  + `export const TREE = "${dataUrl('tree')}";\n`;

fs.writeFileSync(FILE, main);
fs.writeFileSync(TREE_FILE, tree);
try {
  execSync('npx vite build --base=./', { stdio: 'inherit' });
} finally {
  fs.writeFileSync(FILE, STUB);        // toujours restaurer les stubs
  fs.writeFileSync(TREE_FILE, TREE_STUB);
}
console.log('\nBuild web autonome prête dans dist/ (modèles 3D embarqués, arbre inclus).');
