# Alioune Boerderij Donk — projet Unreal (fondation)

Migration du jeu (actuellement Three.js) vers **Unreal Engine 5.3+**, orientée **Android**.
Ce dossier contient une **base C++ qui compile** + un **script d'import** de tes modèles `.glb`.

> ⚠️ Ce squelette te donne un fermier jouable qui se déplace avec une caméra 3ᵉ personne,
> et l'import automatique de tous les modèles. Le reste (véhicules, animaux, marché, UI…)
> se construit ensuite phase par phase (voir le plan de migration).

---

## Prérequis (Windows 11)

1. **Epic Games Launcher** → installe **Unreal Engine 5.3** (ou plus récent).
2. **Visual Studio 2022** avec la charge de travail *« Développement de jeux avec C++ »*
   et le composant *« Unreal Engine installer »*.
3. **Git LFS** : `git lfs install` (indispensable pour les futurs `.uasset` binaires).

## Étape 1 — Ouvrir et compiler le projet

1. Copie ce dossier `unreal/` où tu veux (ou laisse-le dans le dépôt).
2. Clic droit sur **`BoerderijDonk.uproject`** → **Generate Visual Studio project files**.
3. Double-clic sur `BoerderijDonk.uproject` (ou ouvre le `.sln` dans VS 2022 et `Build`).
   - La 1ʳᵉ compilation prend quelques minutes ; l'éditeur s'ouvre ensuite.
4. Vérifie que les plugins **glTF Importer** et **Enhanced Input** sont activés
   (Edit → Plugins) — ils le sont déjà dans le `.uproject`.

## Étape 2 — Importer les modèles 3D

1. Ouvre `Scripts/import_assets.py`, adapte la variable **`SRC`** au chemin de tes `.glb`
   (le dossier **`public/models`** du dépôt cloné, ex. `C:/Users/TOI/farm-simulator-50/public/models`).
2. Dans l'éditeur : **Tools → Execute Python Script…** → choisis `import_assets.py`.
3. Les modèles arrivent dans **Content/Imported/** :
   - `Characters/farmer` → **Skeletal Mesh** + squelette + 12 animations
   - `Animals/…`, `Vehicles/tractor`, `Buildings/…`, `Env/tree` → Static/Skeletal selon le rig.

## Étape 3 — Personnage jouable

1. Crée les entrées **Enhanced Input** (clic droit dans Content → Input) :
   - `IA_Move` (Value type **Axis2D/Vector2D**)
   - `IA_Look` (Value type **Axis2D/Vector2D**)
   - `IMC_Farmer` (Input Mapping Context) : mappe **WASD** → IA_Move, **Souris XY** → IA_Look.
2. Crée un **Blueprint enfant de `BDFarmerCharacter`** → `BP_FarmerCharacter` :
   - Mesh → assigne le Skeletal Mesh **farmer** ; crée un **Animation Blueprint** (`ABP_Farmer`)
     avec une State Machine Idle/Walk/Run (Blendspace piloté par la vitesse).
   - Renseigne `DefaultMappingContext=IMC_Farmer`, `MoveAction=IA_Move`, `LookAction=IA_Look`.
3. **World Settings → GameMode Override** = `BDGameMode`, **Default Pawn** = `BP_FarmerCharacter`.
4. Place un **sol** (ou un Landscape), clique **Play** → le fermier marche. ✅

---

## Ce que fournit déjà le C++

| Fichier | Rôle |
|---|---|
| `BDFarmerCharacter.*` | Personnage joueur : déplacement + caméra chase + Enhanced Input |
| `BDGameMode.*` | Pion joueur par défaut |
| `Config/DefaultEngine.ini` | Réglages mobile de base (MobileHDR off, Android arm64/Vulkan) |
| `Scripts/import_assets.py` | Import automatique des 13 modèles `.glb` |

---

## Phase 3 — Véhicules (fournie ✅)

Classes C++ livrées : `BDVehicleBase` (conduite arcade + suivi du terrain + caméra +
monter/descendre), `BDTractor` et `BDBoat` (exemples). Le fermier a une action
**Interact** pour monter, et s'assoit (`bIsSeated` → Anim BP).

### Mise en place dans l'éditeur
1. **Entrées** (clic droit Content → Input) :
   - `IA_Drive` (**Axis2D** : Y = gaz/frein, X = direction)
   - `IA_Exit` (**Digital/bool**), `IA_Interact` (**Digital/bool**)
   - `IMC_Farmer` : ajoute **E → IA_Interact** (en plus de WASD/souris).
   - `IMC_Drive` : **WASD/flèches → IA_Drive**, **F/Échap → IA_Exit**.
2. **Blueprints véhicules** : clic droit → Blueprint Class → cherche `BDTractor` (et `BDBoat`) :
   - `BP_Tractor` : **Body** → assigne le Static Mesh **tractor** ; monte le **SeatPoint**
     à la hauteur du siège (le fermier s'attache là — remonte-le ~90 cm pour l'asseoir bien).
   - Renseigne `DriveMappingContext=IMC_Drive`, `DriveAction=IA_Drive`, `ExitAction=IA_Exit`.
   - `BP_Boat` : idem, règle **WaterLevel** = Z de ta surface d'eau.
3. **Fermier** : sur `BP_FarmerCharacter`, renseigne `InteractAction=IA_Interact`.
4. **Anim BP** (`ABP_Farmer`) : ajoute un état **Seated** qui joue `Chair_Sit_Idle_M`,
   avec transition « Entry ↔ Seated » pilotée par la variable **bIsSeated**
   (Get owning pawn → cast BDFarmerCharacter → bIsSeated).
5. Place un `BP_Tractor` dans le niveau, **Play**, approche-toi → **E** pour monter,
   conduis (WASD), **F** pour descendre. ✅

> Autres véhicules (moissonneuse, bétonnière, pelle, grue) : même patron —
> crée une classe C++ enfant de `BDVehicleBase` (ou juste un BP enfant) et règle
> les stats + le mesh. Les comportements spéciaux (récolte auto, godet, grue)
> viendront avec leurs phases.

---

## Prochaines phases (à construire ensuite)

1. ~~**Véhicules**~~ ✅ (base + tracteur + bateau ; monter/descendre + assise)
2. **Animaux** — `BDAnimal` + AIController (errance, fuite des poules), spawner mixte poules/coqs.
3. **Cultures & récolte** — champs en InstancedStaticMesh, moissonneuse.
4. **Économie** — marché (prix variables), usine (déchargement).
5. **Progression & missions**, **UI (UMG)**, **sauvegarde**, **ambiance** (jour/nuit, audio).
6. **Contrôles tactiles** + **packaging Android**.

Dis-moi quand ça compile chez toi (ou colle-moi une erreur de build), et j'écris la phase animaux.
