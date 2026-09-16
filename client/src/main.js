import Phaser from 'phaser';
import ArenaScene from './ArenaScene.js';
import { joinArena } from './net.js';
import { unlockAudio } from './audio.js';
import { ABILITIES, RARITY_COLOR, PICKABLE_STARTERS, PICKS_REQUIRED } from './abilityData.js';

const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const status = document.getElementById('loginStatus');
const login = document.getElementById('login');
const pickGrid = document.getElementById('pickGrid');

nameInput.value = localStorage.getItem('chaosio_name') || '';
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click(); });

// ---- starting-loadout picker: pick exactly PICKS_REQUIRED of PICKABLE_STARTERS ----
// (the "you choose your abilities" step from the original concept, merged into chaos-io
// alongside the always-on basic attack) — the server independently re-validates this,
// this is purely for UX.
const savedPicks = JSON.parse(localStorage.getItem('chaosio_picks') || 'null');
let selectedPicks = Array.isArray(savedPicks) ? savedPicks.filter((id) => PICKABLE_STARTERS.includes(id)) : [];
if (selectedPicks.length !== PICKS_REQUIRED) selectedPicks = PICKABLE_STARTERS.slice(0, PICKS_REQUIRED);

function renderPickGrid() {
  pickGrid.innerHTML = PICKABLE_STARTERS.map((id) => {
    const def = ABILITIES[id];
    const sel = selectedPicks.includes(id);
    return `<div class="pick${sel ? ' selected' : ''}" data-id="${id}">
      <div class="nm">${def.nameAr}</div>
      <div class="rn" style="color:${RARITY_COLOR[def.rarity]}">${def.rarity}</div>
    </div>`;
  }).join('');
  joinBtn.disabled = selectedPicks.length !== PICKS_REQUIRED;
}
pickGrid.addEventListener('click', (e) => {
  const el = e.target.closest('.pick');
  if (!el) return;
  const id = el.dataset.id;
  if (selectedPicks.includes(id)) {
    selectedPicks = selectedPicks.filter((x) => x !== id);
  } else if (selectedPicks.length < PICKS_REQUIRED) {
    selectedPicks = [...selectedPicks, id];
  } else {
    return; // already have PICKS_REQUIRED chosen — deselect one first
  }
  renderPickGrid();
});
renderPickGrid();

joinBtn.addEventListener('click', async () => {
  if (selectedPicks.length !== PICKS_REQUIRED) return;
  const name = (nameInput.value || 'لاعب').trim().slice(0, 16) || 'لاعب';
  localStorage.setItem('chaosio_name', name);
  localStorage.setItem('chaosio_picks', JSON.stringify(selectedPicks));
  unlockAudio(); // must happen inside this click gesture or mobile browsers block sound later
  joinBtn.disabled = true;
  status.textContent = 'جارٍ الاتصال بالساحة...';
  try {
    const room = await joinArena(name, selectedPicks);
    login.style.display = 'none';
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#07060d',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    game.scene.add('arena', ArenaScene, true, { room });
  } catch (err) {
    console.error(err);
    status.textContent = 'تعذّر الاتصال بالخادم — تأكد أن السيرفر يعمل.';
    joinBtn.disabled = false;
  }
});
