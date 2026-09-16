// Display-only mirror of the server's ability metadata (server/src/abilities.js).
// The server is the sole authority on damage/cooldown/hit-detection — this file exists
// purely so the client can render icons, telegraph rings, and hotbar tooltips without
// a round-trip. Keep the ids/telegraph/radius/cooldown values in sync with the server
// when adding a new ability.
export const ABILITIES = {
  dash:      { nameAr: 'اندفاع',        type: 'MOBILITY',  rarity: 'COMMON',    cooldown: 6000,  telegraph: 0,    radius: 0,   color: 0x9ad1ff, damage: 0,  desc: 'اندفاعة سريعة باتجاه الحركة مع حصانة لحظية.' },
  shield:    { nameAr: 'الدرع',          type: 'DEFENSIVE', rarity: 'COMMON',    cooldown: 12000, telegraph: 0,    radius: 0,   color: 0x9affc7, damage: 0,  duration: 2200, desc: 'حصانة كاملة من كل الأضرار لمدة قصيرة.' },
  fireball:  { nameAr: 'كرة النار',      type: 'OFFENSIVE', rarity: 'COMMON',    cooldown: 4500,  telegraph: 0,    radius: 26,  color: 0xff8a4c, damage: 16, speed: 620, desc: 'مقذوف ناري سريع باتجاه الماوس — أول من يصطدم به يتضرر.' },
  meteor:    { nameAr: 'النيزك',         type: 'AREA',      rarity: 'EPIC',      cooldown: 10000, telegraph: 1100, radius: 95,  color: 0xff5252, damage: 34, desc: 'حدد منطقة — بعد إنذار واضح ينزل نيزك ضخم.' },
  lightning: { nameAr: 'البرق',          type: 'OFFENSIVE', rarity: 'RARE',      cooldown: 7000,  telegraph: 750,  radius: 55,  color: 0xfff27a, damage: 30, desc: 'يستهدف أقرب عدو بدائرة تحذير — إذا لم يتحرك يتضرر بشدة.' },
  blackhole: { nameAr: 'الثقب الأسود',   type: 'CONTROL',   rarity: 'RARE',      cooldown: 11000, telegraph: 600,  radius: 70,  color: 0xb388ff, damage: 22, desc: 'يسحب من حوله لمدة ثانية ثم ينفجر.' },
  freeze:    { nameAr: 'منطقة التجميد',  type: 'CONTROL',   rarity: 'RARE',      cooldown: 10000, telegraph: 400,  radius: 110, color: 0x8ae8ff, damage: 6,  desc: 'منطقة تبطئ حركة من بداخلها بشدة.' },
  teleport:  { nameAr: 'الانتقال',       type: 'MOBILITY',  rarity: 'RARE',      cooldown: 9000,  telegraph: 350,  radius: 0,   color: 0xd6b3ff, damage: 0,  desc: 'انتقال فوري لمسافة أبعد من الاندفاع، بإنذار قصير قبله.' },
  firewave:  { nameAr: 'موجة النار',     type: 'AREA',      rarity: 'RARE',      cooldown: 9500,  telegraph: 700,  radius: 0,   color: 0xff6f3c, damage: 26, desc: 'موجة نار تجتاح الخريطة بالكامل باتجاه الماوس.' },
  mine:      { nameAr: 'الفخ',           type: 'TRICK',     rarity: 'COMMON',    cooldown: 8000,  telegraph: 0,    radius: 50,  color: 0xcccccc, damage: 24, desc: 'فخ غير مرئي تقريبًا — ينفجر بأول من يمر فوقه.' },
  tsunami:   { nameAr: 'تسونامي',        type: 'GLOBAL',    rarity: 'LEGENDARY', cooldown: 26000, telegraph: 1000, radius: 0,   color: 0x4cc3ff, damage: 42, desc: 'موجة عملاقة تعبر جزءًا كبيرًا من الخريطة — ضرر كبير وعريض.' },
  boss_nova: { nameAr: 'انفجار الوحش',   type: 'OFFENSIVE', rarity: 'LEGENDARY', cooldown: 6000,  telegraph: 500,  radius: 150, color: 0xff3d81, damage: 26, desc: 'انفجار قوي حول الوحش يضرب كل من يقترب منه.' },
  strike:    { nameAr: 'الضربة الأساسية', type: 'OFFENSIVE', rarity: 'BASIC',    cooldown: 900,   telegraph: 0,    radius: 16,  color: 0xffe27a, damage: 7,  speed: 700, desc: 'هجوم أساسي بسيط، كولداون قصير — متاح دائمًا لكل لاعب.' },
};

export const RARITY_COLOR = {
  COMMON: '#c9d6ff',
  RARE: '#8ae8ff',
  EPIC: '#d6b3ff',
  LEGENDARY: '#ffd166',
  BASIC: '#ffe27a',
};

// Small glyph per ability "type" so the upgrade cards / hotbar read at a glance
// without needing image assets.
export const TYPE_ICON = {
  OFFENSIVE: '🔥',
  DEFENSIVE: '🛡️',
  MOBILITY: '💨',
  CONTROL: '🌀',
  AREA: '☄️',
  GLOBAL: '🌊',
  TRICK: '🕸️',
};

// Mirrors the server's PICKABLE_STARTERS/PICKS_REQUIRED — the login screen offers
// exactly these as a starting-loadout choice (the "you pick your abilities" step).
export const PICKABLE_STARTERS = ['dash', 'shield', 'fireball', 'mine'];
export const PICKS_REQUIRED = 2;
export const BASIC_ABILITY_ID = 'strike';

export const PASSIVES = {
  bloodlust:  { nameAr: 'نهم الدم',     icon: '🩸', desc: '+15% سرعة لمدة 5 ثوانٍ بعد كل قتل.' },
  vampiric:   { nameAr: 'الامتصاص',      icon: '🧛', desc: 'يشفيك 12% من كل ضرر تسببه.' },
  quickhands: { nameAr: 'اليد السريعة',  icon: '⚡', desc: 'كل الكولداون أسرع بنسبة 15%.' },
  laststand:  { nameAr: 'الصمود الأخير', icon: '💪', desc: '+25% سرعة إذا هبطت صحتك دون 30%.' },
  thorns:     { nameAr: 'الأشواك',       icon: '🌵', desc: '15% من الضرر الذي يصيبك يرتد على المهاجم.' },
};
