import Phaser from 'phaser';
import ArenaScene from './ArenaScene.js';
import { joinArena } from './net.js';
import { unlockAudio } from './audio.js';
import {
  SP, HEROES, HERO_IDS, faceUrl, ABILITIES, NORMAL_IDS, PICKS_REQUIRED, LEGENDS, LEGEND_IDS, FAMILIES, FUSIONS,
  PASSIVES, STATUS, COMBOS, iconStyle, XP, UNLOCK_STEP, NORMAL_UNLOCK_ORDER, LEGEND_START,
} from './gameData.js';

const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
const shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);

// ---- player profile & unlocks (per browser)
const profile = Object.assign({ xp: 0, kills: 0, wins: 0, games: 0 }, load('cio_profile', {}));
function unlockedNormals() {
  const extra = Math.floor(profile.xp / UNLOCK_STEP);
  return [...NORMAL_UNLOCK_ORDER.starters, ...NORMAL_UNLOCK_ORDER.rest.slice(0, extra)];
}
function unlockedLegends() { return LEGEND_IDS.slice(0, Math.min(LEGEND_IDS.length, LEGEND_START + Math.floor(profile.xp / (UNLOCK_STEP * 2)))); }
function nextUnlock() {
  const n = unlockedNormals().length;
  if (n >= NORMAL_IDS.length) return null;
  const need = (Math.floor(profile.xp / UNLOCK_STEP) + 1) * UNLOCK_STEP;
  return { id: NORMAL_UNLOCK_ORDER.rest[n - NORMAL_UNLOCK_ORDER.starters.length], need };
}
window.addEventListener('cio-result', (e) => {
  const r = e.detail;
  const before = unlockedNormals().length + unlockedLegends().length;
  profile.games += 1; profile.kills += r.kills; if (r.won) profile.wins += 1;
  profile.xp += XP.game + r.kills * XP.kill + (r.won ? XP.win : 0) + (r.boss ? XP.boss : 0);
  save('cio_profile', profile);
  const after = unlockedNormals().length + unlockedLegends().length;
  if (after > before && window.__cioToast) window.__cioToast(`🔓 فتحت ${after - before} قدرة جديدة! (XP ${profile.xp})`);
});

// ---- draft
function draftNormals() {
  const pool = unlockedNormals();
  const fams = shuffle(Object.keys(FAMILIES));
  const offer = [];
  fams.forEach((f) => { const c = shuffle(pool.filter((id) => ABILITIES[id].family === f && !offer.includes(id)))[0]; if (c) offer.push(c); });
  shuffle(pool.filter((id) => !offer.includes(id))).slice(0, 6 - offer.length).forEach((id) => offer.push(id));
  return shuffle(offer.slice(0, 6));
}
const draftLegends = () => shuffle(unlockedLegends()).slice(0, 4);

const sel = {
  name: load('cio_name', ''),
  hero: HERO_IDS.includes(load('cio_hero', '')) ? load('cio_hero', '') : 'shadow',
  mode: load('cio_mode', 'solo') === 'duo' ? 'duo' : 'solo',
  offers: draftNormals(),
  legendOffers: draftLegends(),
  picks: [],
  legend: '',
  rerolls: 1,
  legendRerolls: 1,
};
let step = 0;
const STEP_NAMES = ['1. البطل والوضع', '2. درافت القدرات', '3. القدرة الأسطورية'];

function tagHtml(a) {
  const f = FAMILIES[a.family];
  const s = a.applies && STATUS[a.applies];
  return `<div class="tags">${f ? `<span class="tag" style="color:${f.css}">${f.icon} ${f.nameAr}</span>` : ''}${s ? `<span class="tag" style="color:${s.color}">${s.icon} ${s.nameAr}</span>` : ''}</div>`;
}

function fusionPreview() {
  if (sel.picks.length < 2) return '';
  const fams = sel.picks.map((id) => ABILITIES[id].family);
  const counts = {}; fams.forEach((f) => { counts[f] = (counts[f] || 0) + 1; });
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const pair = sorted.length === 1 ? `${sorted[0]}+${sorted[0]}` : [sorted[0], sorted[1]].sort().join('+');
  const fu = Object.values(FUSIONS).find((f) => f.pair === pair);
  return fu ? `<div class="fusionHint">🧬 بعد 3 قتلات بتندمج قدراتك وبتاخد: <b style="color:#${fu.color.toString(16).padStart(6, '0')}">${fu.nameAr}</b> — ${fu.desc}</div>` : '';
}

function render() {
  $('steps').innerHTML = STEP_NAMES.map((n, i) => `<div class="st${i === step ? ' on' : ''}">${n}</div>`).join('');
  const body = $('stepBody');
  const nu = nextUnlock();
  const lockedN = NORMAL_IDS.length - unlockedNormals().length, lockedL = LEGEND_IDS.length - unlockedLegends().length;
  if (step === 0) {
    body.innerHTML = `
      <div class="row"><input id="nameInput" maxlength="16" placeholder="اكتب اسمك" value="${sel.name.replace(/"/g, '')}" /></div>
      <div class="row modes">
        <div class="mode${sel.mode === 'solo' ? ' sel' : ''}" data-mode="solo"><b>⚔ فردي</b><span>الكل ضد الكل</span></div>
        <div class="mode${sel.mode === 'duo' ? ' sel' : ''}" data-mode="duo"><b>🤝 ثنائي</b><span>فرق 2 ضد 2 ضد 2</span></div>
      </div>
      <div class="profile">⭐ XP ${profile.xp} · 🏆 ${profile.wins} فوز · ⚔ ${profile.kills} قتلة · 🔒 ${lockedN + lockedL} قدرة مقفولة${nu ? ` · القدرة الجاية عند ${nu.need} XP` : ''}</div>
      <div class="counter">اختر بطلك — كل بطل عنده قدرة جانبية. لما تقتل حدا بتسرق قدرته الجانبية!</div>
      <div class="grid heroes">${HERO_IDS.map((id) => {
        const h = HEROES[id], p = PASSIVES[h.passive];
        return `<div class="tile${sel.hero === id ? ' sel' : ''}" data-hero="${id}">
          <img class="face px" src="${faceUrl(id)}" alt="" />
          <div class="walker" style="background-image:url('${SP}/characters/${h.sheet}.png')"></div>
          <div class="nm">${h.nameAr}</div>
          <div class="ps">${p.icon} ${p.nameAr}</div>
          <div class="ds">${p.desc}</div>
        </div>`;
      }).join('')}</div>`;
    $('nameInput').addEventListener('input', (e) => { sel.name = e.target.value; });
    body.querySelectorAll('[data-hero]').forEach((el) => el.addEventListener('click', () => { sel.hero = el.dataset.hero; render(); }));
    body.querySelectorAll('[data-mode]').forEach((el) => el.addEventListener('click', () => { sel.mode = el.dataset.mode; render(); }));
  } else if (step === 1) {
    body.innerHTML = `
      <div class="counter">🎴 طلعلك 6 قدرات عشوائية — اختر ${PICKS_REQUIRED} (${sel.picks.length}/${PICKS_REQUIRED})
        <button class="btn ghost small" id="rerollBtn" ${sel.rerolls ? '' : 'disabled'}>🎲 خلط جديد (${sel.rerolls})</button></div>
      <div class="grid skills">${sel.offers.map((id) => {
        const a = ABILITIES[id];
        return `<div class="tile${sel.picks.includes(id) ? ' sel' : ''}" data-ab="${id}">
          <div class="ico" style="${iconStyle(a.icon, 44)}"></div>
          <div class="nm">${a.nameAr}</div>${tagHtml(a)}
          <div class="ds">${a.desc}</div>
        </div>`;
      }).join('')}</div>
      ${fusionPreview()}
      <div class="combos"><b>🔗 الكومبوهات:</b> ادمج التأثيرات مع بعض لضرر أكبر<br/>
        ${Object.values(COMBOS).map((c) => `<span class="cb"><span style="color:${c.color}">${c.nameAr}</span> = ${c.recipe}</span>`).join('')}
      </div>
      <div class="locked">🔒 ${lockedN} قدرة عادية مقفولة من أصل ${NORMAL_IDS.length} — العب واقتل وافوز عشان تفتحها</div>`;
    $('rerollBtn').addEventListener('click', () => { if (!sel.rerolls) return; sel.rerolls -= 1; sel.offers = draftNormals(); sel.picks = []; render(); });
    body.querySelectorAll('[data-ab]').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.ab;
      if (sel.picks.includes(id)) sel.picks = sel.picks.filter((x) => x !== id);
      else if (sel.picks.length < PICKS_REQUIRED) sel.picks.push(id);
      else { sel.picks.shift(); sel.picks.push(id); }
      render();
    }));
  } else {
    body.innerHTML = `
      <div class="counter">👑 اختر قدرة أسطورية من 4 — بتضل معك طول الجولة (زر Q)
        <button class="btn ghost small" id="rerollBtn" ${sel.legendRerolls ? '' : 'disabled'}>🎲 خلط جديد (${sel.legendRerolls})</button></div>
      <div class="grid skills legend">${sel.legendOffers.map((id) => {
        const a = LEGENDS[id];
        return `<div class="tile${sel.legend === id ? ' sel' : ''}" data-lg="${id}">
          <div class="ico" style="${iconStyle(a.icon, 48)}"></div>
          <div class="nm" style="color:var(--gold)">${a.nameAr}</div>${tagHtml(a)}
          <div class="ds">${a.desc}</div>
        </div>`;
      }).join('')}</div>
      <div class="combos"><b>🎁 داخل الجولة:</b> صناديق بتنزل من السما فيها قدرة أسطورية إضافية (زر F) · الغول العملاق بيطلع بعد 30 ثانية واللي بيقتله بياخد قوة دائمة · كل قتلتين بتختار ترقية · بعد 3 قتلات بتندمج قدراتك (زر R) · إذا متت بتصير شبح وبتقدر تلعن قاتلك مرة وحدة 👻</div>
      <div class="locked">🔒 ${lockedL} قدرة أسطورية مقفولة من أصل ${LEGEND_IDS.length}</div>`;
    $('rerollBtn').addEventListener('click', () => { if (!sel.legendRerolls) return; sel.legendRerolls -= 1; sel.legendOffers = draftLegends(); sel.legend = ''; render(); });
    body.querySelectorAll('[data-lg]').forEach((el) => el.addEventListener('click', () => { sel.legend = el.dataset.lg; render(); }));
  }
  $('backBtn').style.visibility = step === 0 ? 'hidden' : 'visible';
  $('nextBtn').textContent = step === 2 ? '⚔ ادخل الساحة' : 'التالي';
  $('nextBtn').disabled = (step === 1 && sel.picks.length !== PICKS_REQUIRED) || (step === 2 && !sel.legend);
}

$('backBtn').addEventListener('click', () => { if (step > 0) { step -= 1; render(); } });
$('nextBtn').addEventListener('click', () => {
  if (step < 2) { step += 1; render(); $('login').scrollTop = 0; return; }
  start();
});
render();

async function start() {
  const name = (sel.name || 'لاعب').trim().slice(0, 16) || 'لاعب';
  save('cio_name', name); save('cio_hero', sel.hero); save('cio_mode', sel.mode);
  unlockAudio();
  $('nextBtn').disabled = true;
  $('loginStatus').style.color = '#ffd166';
  $('loginStatus').textContent = 'جارٍ الاتصال بالساحة...';
  try {
    const room = await joinArena({ name, hero: sel.hero, picks: sel.picks, legend: sel.legend }, sel.mode);
    const map = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('map timeout')), 8000);
      room.onMessage('map', (m) => { clearTimeout(t); resolve(m); });
      room.send('getMap');
    });
    $('login').style.display = 'none';
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#1b3a1b',
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    game.scene.add('arena', ArenaScene, true, { room, map });
  } catch (err) {
    console.error(err);
    $('loginStatus').style.color = '#ff8a8a';
    $('loginStatus').textContent = 'تعذّر الاتصال بالخادم — حاول مرة ثانية.';
    $('nextBtn').disabled = false;
  }
}
