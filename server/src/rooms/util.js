// shared helpers/constants for the arena room modules
export const ROUND_TIME = 180;
export const BOSS_HP = 700;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function normalize(dx, dy) { const l = Math.hypot(dx, dy); return l < 0.0001 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l }; }
export function shuffle(a) { return a.slice().sort(() => Math.random() - 0.5); }
