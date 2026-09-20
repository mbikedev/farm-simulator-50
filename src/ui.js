// Interface : HUD, toasts, missions, menu de construction (textes en néerlandais)

const el = (id) => document.getElementById(id);

export const ui = {
  setMoney(v) { el('hud-money').textContent = `💶 ${Math.round(v)} €`; },
  setCrops(c) { el('hud-potatoes').textContent = `🥔 ${c.potato} · 🌾 ${c.wheat} · 🌽 ${c.corn}`; },
  setMaterials(v) { el('hud-materials').textContent = `🧱 ${v}`; },
  setVehicle(name) { el('hud-vehicle').textContent = name; },
  setTime(text) { el('hud-time').textContent = text; },
  setWeather(text) { el('hud-weather').textContent = text; },
  setLevel(level, title, xp, xpToNext) {
    el('hud-level-badge').textContent = `⭐ ${level}`;
    el('hud-level-title').textContent = title;
    el('hud-xp-fill').style.width = `${Math.round((xp / xpToNext) * 100)}%`;
    el('hud-xp-text').textContent = `${xp} / ${xpToNext} XP`;
  },
  flashXP() {
    const bar = el('hud-xp-bar');
    bar.classList.remove('flash');
    void bar.offsetWidth; // relance l'animation
    bar.classList.add('flash');
  },
  setMission(html) { el('hud-mission').innerHTML = html; },
};

// ---------- Tableau des scores ----------
export function renderScoreboard(game) {
  const s = game.stats;
  const p = game.prog;
  const rows = [
    ['🥔 · 🌾 · 🌽 Geoogst', s.cropsHarvested],
    ['💰 Verkocht', s.cropsSold],
    ['💶 Verdiend', `${Math.round(s.moneyEarned)} €`],
    ['🧱 Kratten geleverd', s.crateDeliveries],
    ['🛣️ Wegtegels', s.roadTiles],
    ['🏠 Huizen', s.housesBuilt],
    ['🛖 Schuren', s.shedsBuilt],
    ['🚜 Tractoren gebouwd', s.tractorsBuilt],
    ['🛥️ Eiland bereikt', s.reachedIsland ? 'Ja ✅' : 'Nee'],
    ['📋 Missies voltooid', `${s.missionsCompleted} / 6`],
  ];
  el('scoreboard-body').innerHTML = `
    <div class="score-hero">
      <div class="score-total">${p.totalXP}</div>
      <div class="score-label">TOTALE SCORE (XP)</div>
      <div class="score-lvl">⭐ Niveau ${p.level} — ${p.title()}</div>
    </div>
    ${rows.map(([label, value]) => `
      <div class="score-row"><span class="sr-label">${label}</span><span class="sr-value">${value}</span></div>
    `).join('')}
  `;
}

let toastTimer = null;
export function toast(msg, duration = 2200) {
  const t = el('hud-toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ---------- Missions ----------
export const missions = [
  {
    text: 'Oogst 20 aardappelen met de aardappelrooier 🥔 (rood, bij het veld in het zuidwesten)',
    check: (g) => g.stats.potatoesHarvested >= 20,
  },
  {
    text: 'Los de aardappelen bij de fabriek — stop in de gele zone LOSSEN',
    check: (g) => g.stats.potatoesDelivered >= 20,
  },
  {
    text: 'Bedien de kraan bij de fabriek en zet 3 kratten in de zone KRATTEN (joystick = draaien/schuiven, Actie = pakken/loslaten)',
    check: (g) => g.stats.crateDeliveries >= 3,
  },
  {
    text: 'Leg een weg aan: graaf 5 funderingen met de graafmachine (Actie) en stort beton met de betonmixer (Actie)',
    check: (g) => g.stats.roadTiles >= 5,
  },
  {
    text: 'Bouw een huis met de knop Bouwen 🔨 (kost 🧱 en 💶)',
    check: (g) => g.stats.housesBuilt >= 1,
  },
  {
    text: 'Vaar met de boot 🛥️ naar het eiland met de rode vlag',
    check: (g) => g.stats.reachedIsland,
  },
];

export function missionHTML(index) {
  if (index >= missions.length) {
    return '🏆 <b>Gefeliciteerd!</b> Je boerderij bloeit — speel vrij verder!';
  }
  return `📋 <b>Missie ${index + 1}/${missions.length}</b><br>${missions[index].text}`;
}

// ---------- Menu de construction ----------
export function setupBuildMenu(game) {
  const menu = el('build-menu');
  const items = el('build-items');

  const catalog = [
    { id: 'shed', name: '🛖 Schuur', matCost: 3, moneyCost: 50 },
    { id: 'house', name: '🏠 Huis', matCost: 6, moneyCost: 120 },
    { id: 'tractor', name: '🚜 Eigen tractor bouwen', matCost: 10, moneyCost: 300 },
  ];

  function render() {
    items.innerHTML = '';
    for (const item of catalog) {
      const row = document.createElement('div');
      row.className = 'build-item';
      const canAfford = game.materials >= item.matCost && game.money >= item.moneyCost;
      row.innerHTML = `
        <div>
          <div class="bi-name">${item.name}</div>
          <div class="bi-cost">🧱 ${item.matCost} + 💶 ${item.moneyCost} €</div>
        </div>`;
      const btn = document.createElement('button');
      btn.textContent = 'Bouwen';
      btn.disabled = !canAfford;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (game.tryBuild(item)) {
          menu.classList.add('hidden');
        } else {
          render();
        }
      });
      row.appendChild(btn);
      items.appendChild(row);
    }
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:#a8c8a0;margin:6px 0 10px;line-height:1.5;';
    hint.innerHTML = '🛣️ <b>Wegen</b> bouw je buiten: graaf met de graafmachine, stort met de betonmixer (1 🧱 per tegel).<br>🧱 Materialen koop je in de blauwe zone LADEN of verdien je met de kraan.';
    items.appendChild(hint);
  }

  el('btn-build').addEventListener('pointerdown', () => { });
  el('build-close').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    menu.classList.add('hidden');
  });

  return {
    toggle() {
      if (menu.classList.contains('hidden')) {
        render();
        menu.classList.remove('hidden');
      } else {
        menu.classList.add('hidden');
      }
    },
    hide() { menu.classList.add('hidden'); },
  };
}
