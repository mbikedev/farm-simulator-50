# -*- coding: utf-8 -*-
# Import automatique des modèles .glb du jeu (Three.js) dans Unreal.
#
# Utilisation (dans l'éditeur Unreal, une fois le projet ouvert) :
#   1) Menu Tools > Execute Python Script...  -> choisir ce fichier
#      (ou coller dans Output Log > Cmd: py "chemin/vers/import_assets.py")
#   2) Adapte SRC ci-dessous au chemin de tes .glb (dossier public/models du dépôt).
#
# Les .glb riggés (fermier, animaux) s'importent en Skeletal Mesh + squelette +
# animations ; les autres en Static Mesh. La détection est automatique (glTF).

import os
import unreal

# >>> À ADAPTER : chemin absolu vers le dossier des .glb (dépôt cloné sous Windows).
SRC = r"C:/Users/TOI/farm-simulator-50/public/models"

# Dossier de destination dans le Content Browser
DEST_ROOT = "/Game/Imported"

# modèle -> sous-dossier de destination
MODELS = {
    "farmer":  "Characters",
    "cow":     "Animals",
    "sheep":   "Animals",
    "chicken": "Animals",
    "rooster": "Animals",
    "tractor": "Vehicles",
    "barn":    "Buildings",
    "house":   "Buildings",
    "coop":    "Buildings",
    "market":  "Buildings",
    "potato":  "Buildings",   # « potato plant » = usine
    "shed":    "Buildings",
    "tree":    "Env",
}


def build_tasks():
    tasks = []
    for name, folder in MODELS.items():
        src = os.path.join(SRC, name + ".glb")
        if not os.path.isfile(src):
            unreal.log_warning("[import] Introuvable, ignore: {}".format(src))
            continue
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", src)
        task.set_editor_property("destination_path", "{}/{}".format(DEST_ROOT, folder))
        task.set_editor_property("destination_name", name)
        task.set_editor_property("automated", True)       # pas de fenêtre de dialogue
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("save", True)
        tasks.append(task)
    return tasks


def main():
    tasks = build_tasks()
    if not tasks:
        unreal.log_error("[import] Aucun .glb trouve. Verifie la variable SRC.")
        return
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    tools.import_asset_tasks(tasks)
    for t in tasks:
        for path in (t.get_editor_property("imported_object_paths") or []):
            unreal.log("[import] OK -> {}".format(path))
    unreal.log("[import] Termine: {} modele(s) traite(s).".format(len(tasks)))


if __name__ == "__main__":
    main()
