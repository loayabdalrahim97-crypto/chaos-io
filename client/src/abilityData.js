// Display-only mirror of the server's ability metadata (server/src/abilities.js).
// The server is the sole authority on damage/cooldown/hit-detection — this file exists
// purely so the client can render icons, telegraph rings, and hotbar tooltips without
// a round-trip. Keep the ids/telegraph/radius/cooldown values in sync with the server
// when adding a new ability.
export const ABILITIES = {
  dash:      { nameAr: 'اندفاع',        type: 'MOBILITY',  rarity: 'COMMON',    cooldown: 6000,  telegraph: 0,    radius: 0,   color: 0x9ad1ff },
  shield:    { nameAr: 'الدرع',          type: 'DEFENSIVE', rarity: 'COMMON',    cooldown: 12000, telegraph: 0,    radius: 0,   color: 0x9affc7 },
  fireball:  { nameAr: 'كرة النار',      type: 'OFFENSIVE', rarity: 'COMMON',    cooldown: 4500,  telegraph: 0,    radius: 26,  color: 0xff8a4c },
  meteor:    { nameAr: 'النيزك',         type: 'AREA',      rarity: 'EPIC',      cooldown: 10000, telegraph: 1100, radius: 95,  color: 0xff5252 },
  lightning: { nameAr: 'البرق',          type: 'OFFENSIVE', rarity: 'RARE',      cooldown: 7000,  telegraph: 750,  radius: 55,  color: 0xfff27a },
  blackhole: { nameAr: 'الثقب الأسود',   type: 'CONTROL',   rarity: 'RARE',      cooldown: 11000, telegraph: 600,  radius: 70,  color: 0xb388ff },
  freeze:    { nameAr: 'منطقة التجميد',  type: 'CONTROL',   rarity: 'RARE',      cooldown: 10000, telegraph: 400,  radius: 110, color: 0x8ae8ff },
  teleport:  { nameAr: 'الانتقال',       type: 'MOBILITY',  rarity: 'RARE',      cooldown: 9000,  telegraph: 350,  radius: 0,   color: 0xd6b3ff },
  firewave:  { nameAr: 'موجة النار',     type: 'AREA',      rarity: 'RARE',      cooldown: 9500,  telegraph: 700,  radius: 0,   color: 0xff6f3c },
  mine:      { nameAr: 'الفخ',           type: 'TRICK',     rarity: 'COMMON',    cooldown: 8000,  telegraph: 0,    radius: 50,  color: 0xcccccc },
  tsunami:   { nameAr: 'تسونامي',        type: 'GLOBAL',    rarity: 'LEGENDARY', cooldown: 26000, telegraph: 1000, radius: 0,   color: 0x4cc3ff },
  boss_nova: { nameAr: 'انفجار الوحش',   type: 'OFFENSIVE', rarity: 'LEGENDARY', cooldown: 6000,  telegraph: 500,  radius: 150, color: 0xff3d81 },
};

export const RARITY_COLOR = {
  COMMON: '#c9d6ff',
  RARE: '#8ae8ff',
  EPIC: '#d6b3ff',
  LEGENDARY: '#ffd166',
};

export const PASSIVES = {
  bloodlust:  { nameAr: 'نهم الدم' },
  vampiric:   { nameAr: 'الامتصاص' },
  quickhands: { nameAr: 'اليد السريعة' },
  laststand:  { nameAr: 'الصمود الأخير' },
  thorns:     { nameAr: 'الأشواك' },
};
