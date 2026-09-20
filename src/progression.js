import { ui, toast } from './ui.js';

// Système de niveaux / expérience.
// L'XP est gagnée par les actions de jeu ; chaque palier donne une prime.

const TITLES = [
  'Leerling',      // niv. 1
  'Boerenknecht',  // 2
  'Boer',          // 3
  'Landbouwer',    // 4
  'Hoevemeester',  // 5
  'Grootgrondbezitter', // 6
  'Landbouwbaron', // 7
  'Boerenkoning',  // 8+
];

export function createProgression(game) {
  const prog = {
    level: 1,
    xp: 0,
    xpToNext: 80,

    // XP nécessaire pour passer du niveau L au suivant
    needFor(level) { return Math.round(80 * Math.pow(1.4, level - 1)); },

    title() { return TITLES[Math.min(this.level - 1, TITLES.length - 1)]; },

    add(amount, reason) {
      if (amount <= 0) return;
      this.xp += amount;
      let leveled = false;
      while (this.xp >= this.xpToNext) {
        this.xp -= this.xpToNext;
        this.level++;
        this.xpToNext = this.needFor(this.level);
        const bonus = this.level * 50;
        game.setMoney(game.money + bonus);
        toast(`⭐ Niveau ${this.level} — ${this.title()}! +${bonus} €`, 3200);
        leveled = true;
      }
      ui.setLevel(this.level, this.title(), this.xp, this.xpToNext);
      if (!leveled && reason) ui.flashXP(amount);
    },

    init() {
      ui.setLevel(this.level, this.title(), this.xp, this.xpToNext);
    },
  };
  return prog;
}

// Barème d'XP par type d'action
export const XP = {
  harvest: 2,        // par unité récoltée
  sell: 1,           // par unité vendue
  crate: 15,         // par caisse livrée (grue)
  road: 12,          // par dalle de route
  house: 40,
  shed: 20,
  tractor: 30,
  island: 60,
};
