# Modèles 3D `.glb` (Route B — réalisme)

Dépose ici tes modèles pour remplacer les formes codées à la main par de vrais
objets 3D détaillés. **Nomme les fichiers exactement comme ci-dessous** — le jeu
les charge automatiquement, et garde la version codée à la main si le fichier
est absent (aucun plantage).

| Fichier attendu | Objet dans le jeu | Priorité |
|---|---|---|
| `tractor.glb` | 🚜 Le tracteur (objet vedette, toujours à l'écran) | ⭐⭐⭐ |
| `cow.glb` | 🐄 Les vaches | ⭐⭐ |
| `sheep.glb` | 🐑 Les moutons | ⭐⭐ |
| `chicken.glb` | 🐔 Les poules | ⭐ |
| `tree.glb` | 🌲 Les arbres (nombreux → gros impact décor) | ⭐⭐⭐ |
| `barn.glb` | 🛖 La grange de départ (optionnel) | ⭐ |
| `house.glb` | 🏠 Maison constructible (optionnel) | ⭐ |

## Où trouver des modèles gratuits

- **poly.pizza** — immense bibliothèque CC0 / CC-BY, téléchargement `.glb` en un clic.
- **quaternius.com** — packs 100 % CC0 (dont un tracteur, des animaux, des arbres).
- **kenney.nl** — assets CC0 (Nature Kit = beaucoup d'arbres).
- **sketchfab.com** — filtre « Downloadable » + licence « CC » pour du plus réaliste.

## Spécifications

- **Format : `.glb`** (binaire, textures incluses). Si tu n'as que du `.gltf`+textures,
  du `.fbx` ou de l'`.obj`, donne-le-moi quand même, je convertirai.
- **Poids : idéalement < 2–3 Mo** par modèle (jeu mobile). Cherche « low poly » / « game ready ».
- **Licence : CC0** de préférence (sinon CC-BY, je crédite l'auteur dans le README).
- **Orientation / échelle : peu importe** — je réoriente et redimensionne dans le code.

## Ce qui se passe ensuite

Dès qu'un fichier est présent ici, je l'ajuste (échelle, orientation, pivot, ombres)
et le branche à la place du mesh codé. Les véhicules gardent leurs animations
(roues qui tournent, direction) ; les animaux gardent leur comportement (brouter,
marcher, fuir).
