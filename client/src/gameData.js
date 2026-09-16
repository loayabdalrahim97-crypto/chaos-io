// Display data for the client (names, descriptions, icons, sprite sheets).
// Gameplay numbers live on the server (server/src/abilities.js) — the server is the authority.
//
// Art: "Ninja Adventure" asset pack by Pixel-boy (CC0), loaded from pinned GitHub commits via jsDelivr.

const LOCAL = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
export const SP = LOCAL ? '/na/sp' : 'https://cdn.jsdelivr.net/gh/sparklinlabs/superpowers-asset-packs@e8674a03ab4456802f71f848c4df79eccca23f7a/ninja-adventure';
export const GD = LOCAL ? '/na/gd' : 'https://cdn.jsdelivr.net/gh/pixel-boy/NinjaAdventure@6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/map';

export const HEROES = {
  shadow:   { nameAr: 'كاغي الظل',      sheet: 7,  passive: 'swift' },
  knight:   { nameAr: 'الفارس الحديدي', sheet: 18, passive: 'stoneskin' },
  crimson:  { nameAr: 'القرمزي',        sheet: 24, passive: 'bloodlust' },
  bones:    { nameAr: 'العظمي',         sheet: 23, passive: 'vampiric' },
  sakura:   { nameAr: 'ساكورا',         sheet: 5,  passive: 'quickhands' },
  frost:    { nameAr: 'ابن الثلج',      sheet: 19, passive: 'frosttouch' },
  golem:    { nameAr: 'الروبوت الذهبي', sheet: 20, passive: 'thorns' },
  sage:     { nameAr: 'الحكيم',         sheet: 9,  passive: 'regen' },
  fox:      { nameAr: 'الذئب الأبيض',   sheet: 11, passive: 'crit' },
  explorer: { nameAr: 'المستكشف',       sheet: 14, passive: 'laststand' },
};
export const HERO_IDS = Object.keys(HEROES);
export const faceUrl = (hero) => `${SP}/characters/faceset/${HEROES[hero].sheet}.png`;

// icon: { img } single image, or { fx, f } frame f of a 32px fx strip
export const ABILITIES = {
  fireball:     { nameAr: 'كرة النار',     tag: 'burn',     color: 0xff7a3c, icon: { img: 'items/fireball.png' },      speed: 640, range: 900, desc: 'مقذوف ناري يحرق الهدف (ضرر مستمر).' },
  ice_shard:    { nameAr: 'رمح الجليد',    tag: 'chill',    color: 0x8ae8ff, icon: { img: 'items/ice-spike.png' },     speed: 760, range: 900, desc: 'رمح جليدي يبطّئ الهدف. تبريد مرتين = تجميد!' },
  lightning:    { nameAr: 'صاعقة',         tag: 'shock',    color: 0xfff27a, icon: { fx: 19, f: 1 }, telegraph: 450, radius: 60, desc: 'صاعقة على منطقة بعد إنذار قصير. على هدف مبلول = صعق وشلل.' },
  water_splash: { nameAr: 'دفقة الماء',    tag: 'wet',      color: 0x4cb6ff, icon: { img: 'items/water-pot.png' },     radius: 115, desc: 'موجة ماء قريبة تدفع الأعداء وتبلّلهم.' },
  gust:         { nameAr: 'عاصفة الريح',   tag: 'airborne', color: 0xe8f4ff, icon: { fx: 13, f: 2 },                   speed: 820, width: 90, length: 560, desc: 'ريح تطيّر الأعداء للخلف. مع الحرق = إعصار ناري.' },
  dash:         { nameAr: 'اندفاع الظل',   tag: null,       color: 0xb9a6ff, icon: { fx: 6, f: 1 },                    desc: 'اندفاعة سريعة مع حصانة لحظية، وضربتك التالية +40%.' },
  shield:       { nameAr: 'درع الحجر',     tag: null,       color: 0xffd166, icon: { fx: 4, f: 0 },                    desc: 'حصانة كاملة من كل الضرر لمدة ثانيتين.' },
  trap:         { nameAr: 'فخ الجذور',     tag: 'root',     color: 0x9ccc65, icon: { img: 'items/scroll-plant.png' },  radius: 46, desc: 'فخ مخفي — يثبّت أول عدو يدوس عليه.' },
  hunter_mark:  { nameAr: 'سهم الصياد',    tag: 'mark',     color: 0xff5e7a, icon: { img: 'items/arrow.png' },         speed: 950, range: 1100, desc: 'سهم بعيد المدى يضع علامة — الضربة التالية عليه أقوى.' },
  heal_spring:  { nameAr: 'ينبوع الشفاء',  tag: null,       color: 0x7dffb0, icon: { img: 'items/life-pot.png' },      desc: 'يشفيك مع الوقت ويزيل الحرق والتبريد والبلل.' },
};
export const NORMAL_IDS = Object.keys(ABILITIES);
export const PICKS_REQUIRED = 3;

export const LEGENDS = {
  meteor_storm:  { nameAr: 'مطر النيازك',   tag: 'burn',  color: 0xff6a3d, icon: { fx: 12, f: 2 }, telegraph: 900, radius: 72, desc: 'خمس نيازك تسقط على المنطقة وتحرق كل من فيها.' },
  tsunami:       { nameAr: 'تسونامي',        tag: 'wet',   color: 0x3fa9ff, icon: { fx: 15, f: 2 }, speed: 520, width: 210, length: 2600, telegraph: 700, desc: 'موجة عملاقة تعبر الخريطة، تدفع وتبلّل الجميع.' },
  black_hole:    { nameAr: 'الثقب الأسود',   tag: null,    color: 0xb388ff, icon: { fx: 17, f: 2 }, telegraph: 1400, radius: 115, pullRadius: 270, desc: 'يسحب الأعداء نحو المركز ثم ينفجر.' },
  thunderstorm:  { nameAr: 'عاصفة الرعد',    tag: 'shock', color: 0xfff27a, icon: { img: 'items/scroll-thunder.png' }, telegraph: 650, radius: 480, desc: 'صواعق تضرب كل الأعداء القريبين منك.' },
  ice_age:       { nameAr: 'العصر الجليدي',  tag: 'chill', color: 0x9fe8ff, icon: { img: 'items/scroll-ice.png' }, telegraph: 500, radius: 250, desc: 'انفجار جليدي حولك يبطّئ ويجمّد.' },
  dragon_breath: { nameAr: 'نفَس التنين',    tag: 'burn',  color: 0xff5a1f, icon: { fx: 20, f: 2 }, radius: 370, desc: 'نار مخروطية أمامك ثلاث مرات متتالية.' },
  shadow_strike: { nameAr: 'ضربة الظلال',    tag: null,    color: 0x9d7bff, icon: { fx: 7, f: 1 },  radius: 460, desc: 'تنتقل بين 3 أعداء قريبين وتضرب كل واحد.' },
  kings_fortress:{ nameAr: 'حصن الملك',      tag: null,    color: 0xffd166, icon: { img: 'items/gold-cup.png' }, desc: 'حصانة 3 ثوانٍ + شفاء + سرعة وإزالة كل التأثيرات.' },
  earth_prison:  { nameAr: 'سجن الأرض',      tag: 'root',  color: 0xc28e5c, icon: { img: 'items/scroll-rock.png' }, telegraph: 500, radius: 170, desc: 'تثبيت كل من في المنطقة لأكثر من ثانيتين.' },
  fate_arrow:    { nameAr: 'سهم القدر',      tag: 'mark',  color: 0xffe27a, icon: { img: 'weapons/bow.png' }, speed: 1150, range: 2000, desc: 'سهم عملاق يخترق كل شيء وضرره هائل.' },
};
export const LEGEND_IDS = Object.keys(LEGENDS);

export const BASIC = { id: 'strike', nameAr: 'شوريكن', color: 0xe8e8e8, icon: { img: 'hud/shuriken.png' }, speed: 760, range: 620 };
export const BOSS_NOVA = { id: 'boss_nova', nameAr: 'انفجار الوحش', color: 0xff3d81, telegraph: 500, radius: 150 };

export const PASSIVES = {
  swift:      { nameAr: 'خفة الريح',     icon: '💨', desc: '+12% سرعة حركة.' },
  stoneskin:  { nameAr: 'جلد الحجر',     icon: '🪨', desc: '-15% من كل ضرر تتلقاه.' },
  bloodlust:  { nameAr: 'نهم الدم',      icon: '🩸', desc: 'بعد كل قتل: سرعة +20% وشفاء.' },
  vampiric:   { nameAr: 'مصاص الدماء',   icon: '🦇', desc: 'تستعيد 12% من الضرر الذي تسببه.' },
  quickhands: { nameAr: 'اليد السريعة',  icon: '⚡', desc: 'كل الكولداون أسرع 15%.' },
  frosttouch: { nameAr: 'لمسة الصقيع',   icon: '❄️', desc: '25% فرصة تبريد الهدف مع كل ضربة.' },
  thorns:     { nameAr: 'الأشواك',       icon: '🌵', desc: '15% من الضرر يرتد على المهاجم.' },
  regen:      { nameAr: 'التجدد',        icon: '🌿', desc: 'تستعيد الصحة إذا لم تُضرب 3 ثوانٍ.' },
  crit:       { nameAr: 'العين الثاقبة', icon: '🎯', desc: '20% فرصة ضربة حرجة ×1.6.' },
  laststand:  { nameAr: 'الصمود الأخير', icon: '🔥', desc: 'تحت 30% صحة: أسرع وضرر أقل عليك.' },
};

export const STATUS = {
  burn:     { icon: '🔥', nameAr: 'حرق',   color: '#ff7a3c' },
  chill:    { icon: '❄️', nameAr: 'تبريد', color: '#8ae8ff' },
  wet:      { icon: '💧', nameAr: 'مبلول', color: '#4cb6ff' },
  shock:    { icon: '⚡', nameAr: 'مكهرب', color: '#fff27a' },
  root:     { icon: '🌿', nameAr: 'مثبّت', color: '#9ccc65' },
  stun:     { icon: '💫', nameAr: 'مشلول', color: '#ffffff' },
  mark:     { icon: '🎯', nameAr: 'معلَّم', color: '#ff5e7a' },
  airborne: { icon: '🌪️', nameAr: 'طائر',  color: '#e8f4ff' },
};

export const COMBOS = {
  electro:   { nameAr: '⚡ صعق كهربائي!', color: '#fff27a', recipe: '💧 مبلول + ⚡ صاعقة', effect: 'ضرر إضافي + شلل ثانية' },
  freeze:    { nameAr: '❄️ تجمّد!',        color: '#9fe8ff', recipe: '💧 + ❄️  أو  ❄️ + ❄️', effect: 'الهدف يتجمد تمامًا' },
  shatter:   { nameAr: '💥 انصهار!',       color: '#ffb36b', recipe: '🔥 حرق + ❄️ تبريد', effect: 'ضرر انفجاري كبير' },
  steam:     { nameAr: '♨️ بخار!',         color: '#e0e0e0', recipe: '🔥 حرق + 💧 ماء', effect: 'ضرر إضافي' },
  firestorm: { nameAr: '🌪️ إعصار ناري!',   color: '#ff7a3c', recipe: '🔥 حرق + 🌪️ ريح', effect: 'النار تنتشر للأعداء حوله' },
  mark:      { nameAr: '🎯 علامة الصياد!', color: '#ff5e7a', recipe: '🎯 علامة + أي ضربة', effect: '+12 ضرر' },
};

export const WORLD_EVENTS = { double_damage: '⚡ ضعف الضرر!', chaos: '🌀 فوضى — كولداون أسرع!', meteor_shower: '☄️ وابل نيازك!' };

// ---- map art: frames cut from the tilesets (pixel rects, drawn at 3x) ----
export const SCALE = 3;
export const OBJECT_FRAMES = {
  cluster: { tex: 'village', x: 0,   y: 96,  w: 64, h: 48 },
  tree:    { tex: 'village', x: 64,  y: 97,  w: 32, h: 31 },
  tree2:   { tex: 'village', x: 64,  y: 145, w: 32, h: 31 },
  log:     { tex: 'village', x: 96,  y: 96,  w: 15, h: 32 },
  stump:   { tex: 'village', x: 96,  y: 128, w: 16, h: 16 },
  house:   { tex: 'village', x: 192, y: 97,  w: 63, h: 79 },
  hut:     { tex: 'village', x: 256, y: 80,  w: 64, h: 88 },
  ruin:    { tex: 'village', x: 16,  y: 4,   w: 48, h: 44 },
  kiln:    { tex: 'village', x: 64,  y: 0,   w: 32, h: 48 },
  frog:    { tex: 'village', x: 144, y: 86,  w: 32, h: 26 },
  pillar:  { tex: 'village', x: 32,  y: 54,  w: 16, h: 26 },
  bush:    { tex: 'village', x: 64,  y: 80,  w: 32, h: 16 },
  pine:    { tex: 'tiles',   x: 96,  y: 161, w: 32, h: 30 },
  hedge:   { tex: 'tiles',   x: 0,   y: 162, w: 32, h: 29 },
  rock:    { tex: 'tiles',   x: 194, y: 164, w: 29, h: 27 },
  statue:  { tex: 'tiles',   x: 432, y: 96,  w: 16, h: 31 },
  crate:   { tex: 'tiles',   x: 384, y: 144, w: 16, h: 16 },
  pot:     { tex: 'tiles',   x: 18,  y: 146, w: 13, h: 13 },
  grass:   { tex: 'tiles',   x: 144, y: 241, w: 16, h: 13 },
  fern:    { tex: 'tiles',   x: 208, y: 130, w: 16, h: 14 },
  flower:  { tex: 'tiles',   x: 21,  y: 131, w: 11, h: 9 },
};
// ground tiles: [tex, col, row] on a 16px grid
export const GROUND = {
  grass: [['floor', 11, 12], ['floor', 11, 12], ['floor', 11, 12], ['floor', 12, 12], ['floor', 13, 12], ['floor', 14, 12], ['floor', 15, 12]],
  dirt:  { tl: [11, 7], t: [12, 7], tr: [13, 7], l: [11, 8], c: [12, 8], r: [13, 8], bl: [11, 9], b: [12, 9], br: [13, 9] },
  pond:  { tl: [19, 7], t: [20, 7], tr: [21, 7], l: [19, 8], c: [20, 8], r: [21, 8], bl: [19, 9], b: [20, 9], br: [21, 9] },
};

export function iconStyle(icon, size = 40) {
  if (!icon) return '';
  if (icon.img) return `background-image:url('${SP}/${icon.img}');background-size:contain;background-position:center;background-repeat:no-repeat;width:${size}px;height:${size}px;`;
  const frames = { 1: 5, 2: 5, 3: 7, 4: 5, 5: 6, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5, 11: 5, 12: 5, 13: 6, 14: 6, 15: 6, 16: 5, 17: 5, 18: 6, 19: 6, 20: 5 }[icon.fx] || 5;
  return `background-image:url('${SP}/fx/${icon.fx}.png');background-size:${frames * size}px ${size}px;background-position:-${icon.f * size}px 0;width:${size}px;height:${size}px;`;
}

