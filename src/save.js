// Sauvegarde de la progression dans localStorage (par navigateur).
// Robuste : tout est encapsulé dans try/catch (le stockage peut être
// indisponible en navigation privée, page publiée, etc.).

const KEY = 'boerderij_sim_50_save_v1';

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
