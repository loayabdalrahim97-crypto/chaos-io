// Server-authoritative game data. Every ability is data for a small set of engine "kinds"
// (proj, strike, wave, cone, dash, buff, zone, chain, hop, trap, summon, special),
// so adding an ability is mostly adding a row here (+ its name/icon in client/src/gameData.js).

export const HEROES = {
  shadow:   { id: 'shadow',   passive: 'swift' },
  knight:   { id: 'knight',   passive: 'stoneskin' },
  crimson:  { id: 'crimson',  passive: 'bloodlust' },
  bones:    { id: 'bones',    passive: 'vampiric' },
  sakura:   { id: 'sakura',   passive: 'quickhands' },
  frost:    { id: 'frost',    passive: 'frosttouch' },
  golem:    { id: 'golem',    passive: 'thorns' },
  sage:     { id: 'sage',     passive: 'regen' },
  fox:      { id: 'fox',      passive: 'crit' },
  explorer: { id: 'explorer', passive: 'laststand' },
};
export const HERO_IDS = Object.keys(HEROES);

export const FAMILIES = ['fire', 'ice', 'storm', 'shadow', 'nature'];

// ---------------------------------------------------------------- 50 normal abilities (draft 6, pick 3)
export const ABILITIES = {
  // 🔥 fire
  fireball:       { family: 'fire', kind: 'proj', cooldown: 4000, speed: 680, damage: 16, radius: 10, range: 900, applies: 'burn', splash: 70 },
  flame_dash:     { family: 'fire', kind: 'dash', cooldown: 6000, range: 280, damage: 10, applies: 'burn', trail: 'burning_trail' },
  fire_ring:      { family: 'fire', kind: 'strike', at: 'self', cooldown: 7000, telegraph: 200, radius: 150, damage: 16, applies: 'burn', knock: 120 },
  magma_bolt:     { family: 'fire', kind: 'strike', at: 'target', cooldown: 6500, telegraph: 650, radius: 95, damage: 30, applies: 'burn', range: 600 },
  burning_ground: { family: 'fire', kind: 'zone', at: 'target', cooldown: 9000, range: 560, duration: 4000, radius: 130, tickMs: 500, damage: 5, applies: 'burn', zstyle: 'fire' },
  ember_fan:      { family: 'fire', kind: 'proj', cooldown: 5000, speed: 720, damage: 9, radius: 8, range: 520, applies: 'burn', count: 3, spread: 0.5 },
  lava_mine:      { family: 'fire', kind: 'trap', cooldown: 8000, lifetime: 14000, damage: 24, radius: 50, explodeR: 110, applies: 'burn', range: 420 },
  fire_whip:      { family: 'fire', kind: 'cone', cooldown: 4500, ticks: 1, tickMs: 0, damage: 18, radius: 230, arc: 0.55, applies: 'burn', knock: 160 },
  phoenix_heal:   { family: 'fire', kind: 'buff', cooldown: 14000, heal: 30, nova: { radius: 130, damage: 10, applies: 'burn' } },
  berserk:        { family: 'fire', kind: 'buff', cooldown: 16000, berserkMs: 5000 },
  // ❄️ ice & water
  ice_shard:      { family: 'ice', kind: 'proj', cooldown: 4500, speed: 800, damage: 13, radius: 9, range: 900, applies: 'chill' },
  water_splash:   { family: 'ice', kind: 'strike', at: 'front', reach: 70, cooldown: 6000, radius: 140, damage: 10, knock: 150, applies: 'wet' },
  frost_nova:     { family: 'ice', kind: 'strike', at: 'self', cooldown: 8000, telegraph: 150, radius: 170, damage: 12, applies: 'chill' },
  glacial_spike:  { family: 'ice', kind: 'proj', cooldown: 6000, speed: 900, damage: 18, radius: 12, range: 950, applies: 'chill', pierce: true },
  frozen_ground:  { family: 'ice', kind: 'zone', at: 'target', cooldown: 9000, range: 560, duration: 4500, radius: 150, tickMs: 600, damage: 2, applies: 'chill', slow: true, zstyle: 'ice' },
  snow_barrage:   { family: 'ice', kind: 'proj', cooldown: 5500, speed: 760, damage: 6, radius: 8, range: 600, applies: 'chill', count: 5, spread: 0.7 },
  blizzard_cone:  { family: 'ice', kind: 'cone', cooldown: 7000, ticks: 3, tickMs: 300, damage: 7, radius: 320, arc: 0.6, applies: 'chill' },
  ice_blink:      { family: 'ice', kind: 'dash', cooldown: 6500, range: 320, blink: true, startNova: { radius: 110, damage: 8, applies: 'chill' } },
  frost_trap:     { family: 'ice', kind: 'trap', cooldown: 8500, lifetime: 14000, damage: 12, radius: 52, applies: 'chill', stunMs: 1400, range: 420 },
  ice_armor:      { family: 'ice', kind: 'buff', cooldown: 13000, shieldAdd: 35, reflectMs: 1500 },
  // ⚡ storm
  lightning:      { family: 'storm', kind: 'strike', at: 'target', cooldown: 6000, telegraph: 400, radius: 80, damage: 20, range: 560, applies: 'shock' },
  chain_lightning:{ family: 'storm', kind: 'chain', cooldown: 7000, damage: 15, range: 560, bounces: 3, bounceRange: 280, applies: 'shock' },
  static_dash:    { family: 'storm', kind: 'dash', cooldown: 6000, range: 300, damage: 14, applies: 'shock' },
  thunder_orb:    { family: 'storm', kind: 'proj', cooldown: 7000, speed: 330, damage: 16, radius: 26, range: 700, applies: 'shock', pierce: true },
  overcharge:     { family: 'storm', kind: 'buff', cooldown: 14000, hasteMs: 4000, hasteMult: 1.35, cleanse: true },
  shock_field:    { family: 'storm', kind: 'zone', at: 'target', cooldown: 9000, range: 560, duration: 4000, radius: 140, tickMs: 700, damage: 6, applies: 'shock', zstyle: 'shock' },
  spark_fan:      { family: 'storm', kind: 'proj', cooldown: 4500, speed: 900, damage: 8, radius: 7, range: 560, applies: 'shock', count: 3, spread: 0.35 },
  magnet_pull:    { family: 'storm', kind: 'strike', at: 'target', cooldown: 8000, telegraph: 350, radius: 220, damage: 8, pull: true, applies: 'shock', range: 520 },
  ball_lightning: { family: 'storm', kind: 'proj', cooldown: 6500, speed: 420, damage: 18, radius: 16, range: 900, applies: 'shock', homing: 2.6 },
  stun_bolt:      { family: 'storm', kind: 'proj', cooldown: 7500, speed: 1050, damage: 8, radius: 8, range: 700, stunMs: 900 },
  // 🌑 shadow
  dash:           { family: 'shadow', kind: 'dash', cooldown: 5500, range: 260, empower: true },
  hunter_mark:    { family: 'shadow', kind: 'proj', cooldown: 5000, speed: 1000, damage: 9, radius: 8, range: 1150, applies: 'mark' },
  poison_dagger:  { family: 'shadow', kind: 'proj', cooldown: 4500, speed: 880, damage: 10, radius: 8, range: 800, applies: 'poison' },
  smoke_bomb:     { family: 'shadow', kind: 'zone', at: 'self', cooldown: 11000, duration: 3000, radius: 150, tickMs: 500, damage: 0, applies: 'weak', stealthOwner: true, zstyle: 'smoke' },
  shadow_step:    { family: 'shadow', kind: 'dash', cooldown: 7000, range: 480, blink: true, behindTarget: true, empower: true },
  silence_seal:   { family: 'shadow', kind: 'proj', cooldown: 8000, speed: 850, damage: 8, radius: 10, range: 800, silenceMs: 2200 },
  soul_drain:     { family: 'shadow', kind: 'proj', cooldown: 6000, speed: 760, damage: 14, radius: 10, range: 700, lifesteal: 1 },
  shuriken_storm: { family: 'shadow', kind: 'proj', cooldown: 6000, speed: 820, damage: 7, radius: 8, range: 540, count: 5, spread: 0.9 },
  cursed_ground:  { family: 'shadow', kind: 'zone', at: 'target', cooldown: 9000, range: 560, duration: 4500, radius: 140, tickMs: 600, damage: 3, applies: 'weak', mark: true, zstyle: 'curse' },
  toxic_cloud:    { family: 'shadow', kind: 'zone', at: 'target', cooldown: 9000, range: 560, duration: 4500, radius: 140, tickMs: 700, damage: 3, applies: 'poison', zstyle: 'poison' },
  // 🌿 nature & earth
  gust:           { family: 'nature', kind: 'wave', cooldown: 7000, speed: 860, width: 110, length: 600, damage: 9, knock: 200, applies: 'airborne' },
  vine_pull:      { family: 'nature', kind: 'proj', cooldown: 8000, speed: 950, damage: 10, radius: 12, range: 560, pull: 230, rootMs: 800 },
  heal_spring:    { family: 'nature', kind: 'buff', cooldown: 13000, hot: 34, hotMs: 2000, cleanse: true },
  shield:         { family: 'nature', kind: 'buff', cooldown: 12000, invulnMs: 2200 },
  trap:           { family: 'nature', kind: 'trap', cooldown: 8000, lifetime: 14000, damage: 18, radius: 52, applies: 'root', range: 420 },
  ground_slam:    { family: 'nature', kind: 'strike', at: 'self', cooldown: 7500, telegraph: 250, radius: 160, damage: 18, knock: 170, applies: 'airborne' },
  boomerang:      { family: 'nature', kind: 'proj', cooldown: 5500, speed: 760, damage: 13, radius: 16, range: 500, pierce: true, boomerang: true },
  thorn_field:    { family: 'nature', kind: 'zone', at: 'target', cooldown: 9000, range: 560, duration: 4000, radius: 140, tickMs: 700, damage: 5, applies: 'root', applyChance: 0.35, zstyle: 'thorn' },
  rock_throw:     { family: 'nature', kind: 'proj', cooldown: 6000, speed: 620, damage: 20, radius: 16, range: 700, knock: 220, stunMs: 500 },
  earth_spikes:   { family: 'nature', kind: 'strike', at: 'line', cooldown: 7000, telegraph: 300, stagger: 90, count: 5, radius: 60, damage: 14, applies: 'airborne', range: 520 },
};
export const NORMAL_IDS = Object.keys(ABILITIES);
export const PICKS_REQUIRED = 3;

// ---------------------------------------------------------------- 20 legendary abilities (draft 4, pick 1, key Q)
export const LEGENDS = {
  meteor_storm:   { family: 'fire', kind: 'strike', at: 'target', cooldown: 28000, count: 6, spread: 170, telegraph: 900, stagger: 260, damage: 20, radius: 85, range: 620, applies: 'burn', impact: 'meteor' },
  tsunami:        { family: 'ice', kind: 'wave', cooldown: 30000, telegraph: 700, speed: 540, width: 240, length: 2600, damage: 28, knock: 260, applies: 'wet' },
  black_hole:     { family: 'shadow', kind: 'special', cooldown: 28000, telegraph: 1500, pullRadius: 300, damage: 34, radius: 130, range: 580 },
  thunderstorm:   { family: 'storm', kind: 'special', cooldown: 30000, telegraph: 650, damage: 22, radius: 500, applies: 'shock' },
  ice_age:        { family: 'ice', kind: 'strike', at: 'self', cooldown: 30000, telegraph: 500, damage: 18, radius: 280, applies: 'chill', impact: 'ice' },
  dragon_breath:  { family: 'fire', kind: 'cone', cooldown: 26000, ticks: 4, tickMs: 280, damage: 12, radius: 400, arc: 0.65, applies: 'burn' },
  shadow_strike:  { family: 'shadow', kind: 'hop', cooldown: 28000, targets: 3, damage: 24, radius: 480, hopMs: 260 },
  kings_fortress: { family: 'nature', kind: 'buff', cooldown: 32000, invulnMs: 3000, heal: 40, hasteMs: 3000, hasteMult: 1.4, cleanse: true },
  earth_prison:   { family: 'nature', kind: 'strike', at: 'target', cooldown: 26000, telegraph: 500, damage: 22, radius: 190, applies: 'root', rootMs: 2300, range: 580, impact: 'earth' },
  fate_arrow:     { family: 'shadow', kind: 'proj', cooldown: 26000, delay: 300, speed: 1200, damage: 50, radius: 24, range: 2000, applies: 'mark', pierce: true },
  time_rewind:    { family: 'storm', kind: 'special', cooldown: 26000, seconds: 3 },
  time_bubble:    { family: 'ice', kind: 'zone', at: 'target', cooldown: 28000, duration: 4500, radius: 230, range: 560, slowProjectiles: 0.25, slow: true, tickMs: 400, damage: 0, zstyle: 'bubble' },
  reality_swap:   { family: 'shadow', kind: 'special', cooldown: 30000, range: 720 },
  reality_rift:   { family: 'storm', kind: 'zone', at: 'target', cooldown: 28000, duration: 4500, radius: 250, range: 560, invert: true, flipProjectiles: true, tickMs: 400, damage: 0, zstyle: 'rift' },
  phoenix_rebirth:{ family: 'fire', kind: 'buff', cooldown: 40000, phoenixMs: 9000, heal: 15 },
  arrow_turret:   { family: 'nature', kind: 'summon', cooldown: 30000, range: 420, duration: 7000, fireMs: 450, targetRange: 560, shot: { speed: 900, damage: 9, radius: 8, range: 600 } },
  earthquake:     { family: 'nature', kind: 'strike', at: 'rings', cooldown: 30000, telegraph: 300, stagger: 350, count: 4, ringStep: 90, damage: 14, knock: 150, applies: 'airborne' },
  lightning_form: { family: 'storm', kind: 'zone', at: 'self', follow: true, cooldown: 30000, duration: 5000, radius: 110, tickMs: 400, damage: 6, applies: 'shock', hasteMs: 5000, hasteMult: 1.45, zstyle: 'shock' },
  blood_moon:     { family: 'shadow', kind: 'buff', cooldown: 32000, lifestealMs: 6000, dmgBuffMs: 6000, dmgBuffMult: 1.25 },
  arrow_rain:     { family: 'nature', kind: 'strike', at: 'target', cooldown: 28000, count: 10, spread: 220, telegraph: 500, stagger: 160, damage: 11, radius: 60, range: 620, impact: 'arrows' },
};
export const LEGEND_IDS = Object.keys(LEGENDS);

// ---------------------------------------------------------------- mythic abilities: earned by killing the champion (key E)
export const MYTHICS = {
  time_stop:     { kind: 'special', cooldown: 35000, duration: 2600 },
  reality_warp:  { kind: 'special', cooldown: 35000, duration: 3200, radius: 480 },
  destiny_snap:  { kind: 'special', cooldown: 45000, telegraph: 900, fraction: 0.35, min: 18 },
  space_portal:  { kind: 'special', cooldown: 30000, range: 1000, damage: 28, radius: 140 },
};
export const MYTHIC_IDS = Object.keys(MYTHICS);

// ---------------------------------------------------------------- fusions: unlocked at 3 kills (key R)
// key = the two families of your abilities, sorted; same family twice = "pure" fusion
export const FUSIONS = {
  sun_flare:        { pair: 'fire+fire', kind: 'strike', at: 'self', cooldown: 16000, telegraph: 500, radius: 260, damage: 34, applies: 'burn', knock: 180 },
  permafrost:       { pair: 'ice+ice', kind: 'zone', at: 'target', cooldown: 16000, range: 600, duration: 5000, radius: 200, tickMs: 500, damage: 4, applies: 'chill', slow: true, zstyle: 'ice' },
  storm_caller:     { pair: 'storm+storm', kind: 'strike', at: 'target', cooldown: 16000, count: 7, spread: 200, telegraph: 400, stagger: 140, damage: 16, radius: 75, range: 620, applies: 'shock', impact: 'lightning' },
  death_mark:       { pair: 'shadow+shadow', kind: 'proj', cooldown: 15000, speed: 1300, damage: 30, radius: 12, range: 1100, applies: 'mark', pierce: true, weakMs: 4000 },
  world_tree:       { pair: 'nature+nature', kind: 'zone', at: 'self', follow: true, cooldown: 18000, duration: 5000, radius: 160, tickMs: 500, damage: 3, applies: 'root', applyChance: 0.25, healOwner: 6, zstyle: 'holy' },
  steam_explosion:  { pair: 'fire+ice', kind: 'strike', at: 'target', cooldown: 15000, telegraph: 450, radius: 170, damage: 28, applies: 'wet', knock: 220, range: 600, impact: 'steam' },
  plasma_beam:      { pair: 'fire+storm', kind: 'wave', cooldown: 15000, speed: 1400, width: 70, length: 1100, damage: 30, knock: 120, applies: 'burn' },
  hellfire_blades:  { pair: 'fire+shadow', kind: 'proj', cooldown: 15000, speed: 700, damage: 14, radius: 10, range: 520, applies: 'burn', count: 8, spread: 6.283 },
  volcano:          { pair: 'fire+nature', kind: 'zone', at: 'target', cooldown: 17000, range: 560, duration: 3500, radius: 150, tickMs: 450, damage: 7, applies: 'burn', zstyle: 'fire', finalBurst: { radius: 190, damage: 26, knock: 200 } },
  frozen_thunder:   { pair: 'ice+storm', kind: 'chain', cooldown: 15000, damage: 20, range: 620, bounces: 5, bounceRange: 320, applies: 'chill' },
  frost_phantom:    { pair: 'ice+shadow', kind: 'dash', cooldown: 14000, range: 520, blink: true, behindTarget: true, damage: 18, stunMs: 1000, applies: 'chill' },
  glacier_tomb:     { pair: 'ice+nature', kind: 'strike', at: 'self', cooldown: 16000, telegraph: 400, radius: 210, damage: 16, applies: 'root', rootMs: 2000, impact: 'ice' },
  void_bolt:        { pair: 'shadow+storm', kind: 'proj', cooldown: 14000, speed: 650, damage: 24, radius: 14, range: 1000, pierce: true, homing: 3.2, silenceMs: 1800 },
  hurricane:        { pair: 'nature+storm', kind: 'zone', at: 'self', follow: true, cooldown: 17000, duration: 4000, radius: 220, tickMs: 500, damage: 4, applies: 'shock', pull: 160, zstyle: 'vortex' },
  plague_swarm:     { pair: 'nature+shadow', kind: 'proj', cooldown: 15000, speed: 520, damage: 9, radius: 10, range: 800, applies: 'poison', count: 5, spread: 1.2, homing: 2.2 },
};
export const FUSION_IDS = Object.keys(FUSIONS);
export const FUSION_BY_PAIR = Object.fromEntries(FUSION_IDS.map((id) => [FUSIONS[id].pair, id]));
export const FUSION_KILLS = 3;

// ---------------------------------------------------------------- mid-match upgrades (every 2 kills pick 1 of 3)
export const UPGRADES = {
  cdr:    { max: 3 },   // -12% cooldowns
  dmg:    { max: 3 },   // +15% damage
  hp:     { max: 3 },   // +25 max hp and heal 25
  speed:  { max: 3 },   // +8% move speed
  armor:  { max: 3 },   // -10% damage taken
  vamp:   { max: 3 },   // +6% lifesteal
  regen:  { max: 3 },   // +2 hp/s
};
export const UPGRADE_IDS = Object.keys(UPGRADES);
export const UPGRADE_EVERY = 2;

// always-available basic attack (shuriken)
export const BASIC_ABILITY = { id: 'strike', kind: 'proj', cooldown: 700, speed: 780, damage: 8, radius: 8, range: 640 };
// ghost curse (dead players, once)
export const GHOST_CURSE = { id: 'curse', kind: 'special', cooldown: 999999, range: 380, damage: 10, rootMs: 1200, weakMs: 3000 };
// bonus supply-drop ability uses a legend id with 1 charge (key F)

export const PASSIVE_IDS = ['swift', 'stoneskin', 'bloodlust', 'vampiric', 'quickhands', 'frosttouch', 'thorns', 'regen', 'crit', 'laststand'];

export const STATUS_MS = {
  burn: 3000, chill: 2500, wet: 4500, shock: 2000, airborne: 550, root: 1500, mark: 5000, stun: 1000,
  poison: 4500, slowtime: 450, inverted: 600, timestop: 2600, polymorph: 3200, berserk: 5000,
  silence: 2000, weak: 3000, haste: 4000, stealth: 2500, reflect: 1500, phoenix: 9000, rage: 0, lifesteal: 6000, empower: 6000,
};
export const STATUS_LIST = ['burn', 'chill', 'wet', 'shock', 'root', 'stun', 'mark', 'airborne', 'poison', 'slowtime', 'inverted', 'timestop', 'polymorph', 'berserk', 'silence', 'weak', 'haste', 'stealth', 'reflect', 'phoenix', 'lifesteal', 'empower', 'onfire', 'rampage'];
export const BURN_DPS = 5;
export const POISON_DPS = 4;
export const CHILL_SLOW = 0.6;
export const WET_SLOW = 0.85;

export const MAX_HP = 200;
export const MAX_SHIELD = 50;
export const CHAMPION_HP_BONUS = 40;
export const CHAMPION_DMG_MULT = 1.2;
export const CHAMPION_MIN_KILLS = 2;
export const SHIELD_REGEN_DELAY = 4500;
export const SHIELD_REGEN_RATE = 10;
export const PLAYER_SPEED = 215;
export const PLAYER_RADIUS = 14;

export function defOf(id) {
  if (id === BASIC_ABILITY.id) return BASIC_ABILITY;
  if (id === GHOST_CURSE.id) return GHOST_CURSE;
  return ABILITIES[id] || LEGENDS[id] || MYTHICS[id] || FUSIONS[id] || null;
}
