import Phaser from 'phaser';
import ArenaScene from './ArenaScene.js';
import { joinArena } from './net.js';
import { unlockAudio } from './audio.js';
import {
  SP, HEROES, HERO_IDS, faceUrl, ABILITIES, NORMAL_IDS, PICKS_REQUIRED, LEGENDS, LEGEND_IDS,
  PASSIVES, STATUS, COMBOS, iconStyle,
} from './gameData.js';

const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

const sel = {
  name: load('cio_name', ''),
  hero: HERO_IDS.includes(load('cio_hero', '')) ? load('cio_hero', '') : 'shadow',
  picks: load('cio_picks', []).filter((id) => NORMAL_IDS.includes(id)).slice(0, PICKS_REQUIRED),
  legend: LEGEND_IDS.includes(load('cio_legend', '')) ? load('cio_legend', '') : '',
};
let step = 0;
const STEP_NAMES = ['1. البطل', '2. ثلاث قدرات', '3. القدرة الأسطورية'];

function tagHtml(tag) {
  if (!tag) return '';
  const s = STATUS[tag];
  return `<div class="tag" style="color:${s.color}">${s.icon} ${s.nameAr}</div>`;
}

function render() {
  $('steps').innerHTML = STEP_NAMES.map((n, i) => `<div class="st${i === step ? ' on' : ''}">${n}</div>`).join('');
  const body = $('stepBody');
  if (step === 0) {
    body.innerHTML = `
      <div class="row"><input id="nameInput" maxlength="16" placeholder="اكتب اسمك" value="${sel.name.replace(/"/g, '')}" /></div>
      <div class="counter">اختر بطلك — كل بطل عنده قدرة جانبية (باسيف). لما تقتل حدا بتسرق باسيف منه!</div>
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
  } else if (step === 1) {
    body.innerHTML = `
      <div class="counter">اختر ${PICKS_REQUIRED} قدرات (${sel.picks.length}/${PICKS_REQUIRED}) — تستخدمها بالأزرار 1 و 2 و 3</div>
      <div class="grid skills">${NORMAL_IDS.map((id) => {
        const a = ABILITIES[id];
        return `<div class="tile${sel.picks.includes(id) ? ' sel' : ''}" data-ab="${id}">
          <div class="ico" style="${iconStyle(a.icon, 44)}"></div>
          <div class="nm">${a.nameAr}</div>${tagHtml(a.tag)}
          <div class="ds">${a.desc}</div>
        </div>`;
      }).join('')}</div>
      <div class="combos"><b>🔗 الكومبوهات:</b> ادمج التأثيرات مع بعض لضرر أكبر<br/>
        ${Object.values(COMBOS).map((c) => `<span class="cb"><span style="color:${c.color}">${c.nameAr}</span> = ${c.recipe}</span>`).join('')}
      </div>`;
    body.querySelectorAll('[data-ab]').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.ab;
      if (sel.picks.includes(id)) sel.picks = sel.picks.filter((x) => x !== id);
      else if (sel.picks.length < PICKS_REQUIRED) sel.picks.push(id);
      else { sel.picks.shift(); sel.picks.push(id); }
      render();
    }));
  } else {
    body.innerHTML = `
      <div class="counter">اختر قدرة أسطورية واحدة — بتضل معك طول الجولة (زر Q)</div>
      <div class="grid skills legend">${LEGEND_IDS.map((id) => {
        const a = LEGENDS[id];
        return `<div class="tile${sel.legend === id ? ' sel' : ''}" data-lg="${id}">
          <div class="ico" style="${iconStyle(a.icon, 48)}"></div>
          <div class="nm" style="color:var(--gold)">${a.nameAr}</div>${tagHtml(a.tag)}
          <div class="ds">${a.desc}</div>
        </div>`;
      }).join('')}</div>`;
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
  save('cio_name', name); save('cio_hero', sel.hero); save('cio_picks', sel.picks); save('cio_legend', sel.legend);
  unlockAudio();
  $('nextBtn').disabled = true;
  $('loginStatus').style.color = '#ffd166';
  $('loginStatus').textContent = 'جارٍ الاتصال بالساحة...';
  try {
    const room = await joinArena({ name, hero: sel.hero, picks: sel.picks, legend: sel.legend });
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
