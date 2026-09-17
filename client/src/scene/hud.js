// DOM HUD: vitals, hotbar, banners, upgrade picker, round results.
import { faceUrl, ABILITIES, LEGENDS, MYTHICS, FUSIONS, BASIC, CURSE, PASSIVES, STATUS, WORLD_EVENTS, UPGRADES, COMPANIONS, domainDef, iconStyle } from '../gameData.js';
import { playSfx } from '../audio.js';
import { clampNum } from './fx.js';

export const hudMixin = {
  buildScreenFx() {
    const root = this.hud.root;
    const mk = (id, html, cls = 'panel') => { let el = document.getElementById(id); if (!el) { el = document.createElement('div'); el.id = id; el.className = cls; el.innerHTML = html; root.appendChild(el); } return el; };
    this.hud.timeStopFx = mk('timeStopFx', '<div class="clock">⏸️</div><div class="lbl"></div>');
    this.hud.darkFx = mk('darkFx', '');
    this.hud.champArrow = mk('champArrow', '<span class="ar">➤</span><span class="cr">👑</span>');
    this.hud.announce = mk('announce', '');
    this.hud.upgradeBox = mk('upgradeBox', '', 'panel wood');
    this.hud.upgradeBox.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('[data-up]');
      if (!card) return;
      e.preventDefault(); e.stopPropagation();
      this.room.send('upgrade', { id: card.dataset.up });
      this.hud.upgradeBox.classList.remove('show');
    });
  },

  pushFeed(text) {
    const el = document.createElement('div');
    el.className = 'k';
    el.textContent = text;
    this.hud.killfeed.prepend(el);
    while (this.hud.killfeed.children.length > (this.touch ? 3 : 6)) this.hud.killfeed.lastChild.remove();
    setTimeout(() => el.remove(), 6500);
  },
  showBanner(text, ms) {
    this.hud.banner.textContent = text;
    this.hud.banner.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.hud.banner.classList.remove('show'), ms);
  },
  toast(html, ms) {
    this.hud.toast.innerHTML = html;
    this.hud.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.hud.toast.classList.remove('show'), ms);
  },
  announce(text, color = 0xffd166) {
    const el = this.hud.announce;
    el.textContent = text;
    el.style.color = this.hexOf(color);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => el.classList.remove('show'), 1900);
  },
  showRoundEnd(m) {
    const me = this.room.state.players.get(this.myId);
    const mine = m.results.find((r) => r.id === this.myId);
    const won = !!(mine && mine.status === 'winner');
    playSfx(won ? 'victory' : 'defeat');
    if (mine && m.final) window.dispatchEvent(new CustomEvent('cio-result', { detail: { kills: mine.kills, won, boss: !!this._bossKill } }));
    const head = m.final ? '⚔ الحرب الأخيرة' : `الجولة ${m.round}/${m.rounds}`;
    this.hud.reTitle.textContent = m.winnerName ? `${head} — 🏆 ${m.final ? 'بطل المباراة' : 'الفائز'}: ${m.winnerName}` : `${head} — انتهت`;
    this.hud.reGrowth.innerHTML = this.growthHtml(m);
    this.hud.reNext.textContent = m.final ? '🏆 انتهت المباراة — مباراة جديدة بعد لحظات...' : m.round >= m.rounds ? '🎯 بعدها: اختيار الأهداف ثم الحرب الأخيرة!' : `الجولة ${m.round + 1} بعد لحظات... جيشك وقوته محفوظين`;
    const label = (s) => (s === 'winner' ? '🏆 فائز' : s === 'survivor' ? 'نجا' : 'خرج');
    const duo = this.room.state.mode === 'duo';
    this.hud.reTable.innerHTML = `<tr><th></th><th>اللاعب</th>${duo ? '<th>الفريق</th>' : ''}<th>الحالة</th><th>القتلات</th><th>🛡️ الجيش</th><th>${m.final ? 'النقاط' : 'جولات'}</th></tr>`
      + m.results.map((r) => `<tr class="${r.id === this.myId ? 'me' : ''}"><td><img class="px" src="${faceUrl(r.hero || 'shadow')}" /></td><td>${r.name}${r.isBot ? ' 🤖' : ''}</td>${duo ? `<td>${r.team}</td>` : ''}<td>${label(r.status)}</td><td>${r.kills}</td><td>${r.power}</td><td>${m.final ? r.pts : r.roundWins}</td></tr>`).join('');
    this.hud.roundEnd.classList.add('show');
    if (me) this.hud.upgradeBox.classList.remove('show');
  },

  flashDamage() {
    this.hud.dmgFlash.style.opacity = '0.8';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { this.hud.dmgFlash.style.opacity = '0'; }, 160);
  },

  // slots the player can use right now: [id, key, def, cssClass]
  slotsFor(me) {
    if (!me.alive) return me.ghost && me.curseReady ? [['curse', 'C', CURSE, 'curse']] : [];
    const s = [['strike', 'Space', BASIC, 'basic']];
    [...me.abilities].forEach((id, i) => s.push([id, String(i + 1), ABILITIES[id], 'n' + i]));
    s.push([me.legend, 'Q', LEGENDS[me.legend], 'legend']);
    if (me.fusion) s.push([me.fusion, 'R', FUSIONS[me.fusion], 'fusion']);
    if (me.bonus) s.push([me.bonus, 'F', LEGENDS[me.bonus], 'bonus']);
    if (me.mythic) s.push([me.mythic, 'E', MYTHICS[me.mythic], 'mythic']);
    const comps = COMPANIONS[me.hero] || [];
    if (comps[0]) s.push(['summon1', 'Z', comps[0], 'summon summon1']);
    if (comps[1]) s.push(['summon2', 'X', comps[1], 'summon summon2']);
    s.push(['domain', 'G', domainDef(me.hero), 'domain']);
    return s.filter((x) => x[2]);
  },

  updateHud(state, me) {
    const h = this.hud;
    if (me) {
      const maxHp = me.maxHp || 200;
      h.hpFill.style.width = `${clampNum(me.hp / maxHp, 0, 1) * 100}%`;
      h.shieldFill.style.width = `${clampNum(me.shield / me.maxShield, 0, 1) * 100}%`;
      const stats = `${state.championId === me.id ? '👑 ' : ''}${me.bounty >= 3 ? '💰 ' : ''}القتلات: ${me.kills} · الصحة: ${Math.ceil(me.hp)}${me.ghost ? ' · 👻 شبح' : ''}`;
      if (stats !== this._lastStats) { h.statsLine.textContent = stats; this._lastStats = stats; }
      if (this._face !== me.hero) { this._face = me.hero; h.selfFace.style.backgroundImage = `url('${faceUrl(me.hero)}')`; h.selfFace.style.backgroundSize = 'cover'; }
      const st = me.fx ? me.fx.split(',').map((s) => STATUS[s] ? STATUS[s].icon : '').join(' ') : '';
      if (st !== this._lastSt) { h.selfStatus.textContent = st; this._lastSt = st; }
      if (this.touch) this.touch.update(me, this.slotsFor(me));
      else this.renderHotbar(me);
      const ups = me.upgrades ? me.upgrades.split(',').map((kv) => { const [k, v] = kv.split(':'); return UPGRADES[k] ? `<span class="p u">${UPGRADES[k].icon}${v}</span>` : ''; }).join('') : '';
      const pas = [...me.passives].map((id) => this.touch ? `<span class="p">${PASSIVES[id] ? PASSIVES[id].icon : '?'}</span>` : `<span class="p" title="${PASSIVES[id] ? PASSIVES[id].desc : ''}">${PASSIVES[id] ? PASSIVES[id].icon + ' ' + PASSIVES[id].nameAr : id}</span>`).join('');
      const all = pas + ups;
      if (all !== this._lastPas) { h.passives.innerHTML = (this.touch ? '' : '<div class="ttl">القدرات الجانبية والترقيات</div>') + all; this._lastPas = all; }
      // upgrade picker
      if (me.upgradeOffer !== this._lastOffer) {
        this._lastOffer = me.upgradeOffer;
        if (me.upgradeOffer && me.alive) {
          h.upgradeBox.innerHTML = '<div class="ttl">⬆️ اختر ترقية</div><div class="cards">' + me.upgradeOffer.split(',').map((id) => {
            const u = UPGRADES[id];
            return `<div class="upc" data-up="${id}"><div class="ic">${u.icon}</div><b>${u.nameAr}</b><span>${u.desc}</span></div>`;
          }).join('') + '</div>';
          h.upgradeBox.classList.add('show');
          playSfx('upgrade');
        } else h.upgradeBox.classList.remove('show');
      }
    }
    let alive = 0; state.players.forEach((p) => { if (p.alive && p.kind !== 'boss') alive++; });
    const pl = `${state.mode === 'duo' ? '🤝' : '⚔'} اللاعبون: ${alive}`;
    if (pl !== this._lastPl) { h.playersLeft.textContent = pl; this._lastPl = pl; }
    if (state.phase === 'playing') {
      const total = Math.max(0, Math.ceil(state.remaining));
      const tt = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      if (tt !== this._lastT) { h.timer.textContent = tt; this._lastT = tt; }
      const ev = state.eventId ? WORLD_EVENTS[state.eventId] || '' : (Date.now() < state.matchReadyAt ? 'استعد...' : '');
      if (ev !== this._lastEv) { h.remaining.textContent = ev; this._lastEv = ev; }
    }
    const boss = state.bossId ? state.players.get(state.bossId) : null;
    const champ = state.championId ? state.players.get(state.championId) : null;
    const top = boss && boss.alive ? boss : champ && champ.alive ? champ : null;
    if (top) {
      h.bossBar.classList.add('show');
      h.bossBar.classList.toggle('isBoss', top === boss);
      const lbl = top === boss ? `👹 ${boss.name}` : `👑 البطل الأقوى: ${champ.name} (${champ.kills} قتلات)`;
      if (lbl !== this._lastChampLbl) { h.bossLbl.textContent = lbl; this._lastChampLbl = lbl; }
      h.bossFill.style.width = `${clampNum(top.hp / (top.maxHp || 200), 0, 1) * 100}%`;
    } else h.bossBar.classList.remove('show');
  },

  renderHotbar(me) {
    const now = Date.now();
    const html = this.slotsFor(me).map(([id, key, def, cls]) => {
      const cd = cls === 'bonus' || cls === 'curse' ? 0 : (me.cooldowns.get(id) || 0) - now;
      const secs = cd > 0 ? Math.ceil(cd / 1000) : 0;
      const big = ['legend', 'fusion', 'bonus', 'mythic', 'curse', 'domain'].includes(cls);
      const locked = id === 'domain' && this.room.state.activeDomainPlayer && this.room.state.activeDomainPlayer !== me.id;
      return `<div class="slot ${cls}${locked ? ' locked' : ''}" data-cast="${id}" title="${def.nameAr}${def.desc ? ' — ' + def.desc : ''}">
        <div class="ico" style="${iconStyle(def.icon, big ? 48 : 38)}">${def.icon && def.icon.emoji ? def.icon.emoji : ''}</div>
        <div class="key">${key}</div>${secs ? `<div class="cd">${secs}</div>` : ''}${locked ? '<div class="lock">🔒</div>' : ''}
      </div>`;
    }).join('');
    if (html !== this._lastHotbar) { this.hud.hotbar.innerHTML = html; this._lastHotbar = html; }
  },
};

export function getHudRefs() {
  const byId = (id) => document.getElementById(id);
  return {
    root: byId('hud'), hpFill: byId('hpFill'), shieldFill: byId('shieldFill'), statsLine: byId('statsLine'),
    selfFace: byId('selfFace'), selfStatus: byId('selfStatus'), timer: byId('timer'), remaining: byId('remaining'),
    hotbar: byId('hotbar'), passives: byId('passives'), killfeed: byId('killfeed'), playersLeft: byId('playersLeft'),
    bossBar: byId('bossBar'), bossLbl: byId('bossLbl'), bossFill: byId('bossFill'), banner: byId('banner'), toast: byId('toast'),
    waiting: byId('waiting'), waitingCountdown: byId('waitingCountdown'),
    roundEnd: byId('roundEnd'), reTitle: byId('reTitle'), reTable: byId('reTable'), dmgFlash: byId('dmgFlash'),
    helpBtn: byId('helpBtn'), helpPanel: byId('helpPanel'),
  };
}
