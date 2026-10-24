export const PROTOCOL = 1;
export const COLORS = ['#f5bd9e', '#a9d6c9', '#b8c9ef', '#e3bce3', '#f6dfa9', '#9ddbe6', '#edb6cb', '#c5d5a7'];
export const ANIMALS = ['きつね', 'うさぎ', 'くま', 'ことり', 'くじら', 'ねこ', 'りす', 'ペンギン'];
export const SYMBOLS = ['🦊', '🐰', '🐻', '🐥', '🐳', '🐱', '🐿️', '🐧'];
export const MAX_MEMBERS = 8;
export const MAX_BATCH = 16;
const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
export const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const validRoom = value => typeof value === 'string' && /^[A-Za-z0-9_-]{24}$/.test(value);
export function cleanEvent(e) {
  if (!e || typeof e !== 'object') return null;
  if (e.t === 'point' && unit(e.x) && unit(e.y) && typeof e.s === 'string' && /^[a-z0-9-]{1,40}$/.test(e.s)) {
    return { t: 'point', x: +e.x.toFixed(4), y: +e.y.toFixed(4), s: e.s };
  }
  if (e.t === 'note' && Number.isInteger(e.n) && e.n >= 0 && e.n < 8) return { t: 'note', n: e.n };
  if (e.t === 'whale') return { t: 'whale' };
  return null;
}
export function cleanBatch(events) {
  if (!Array.isArray(events) || !events.length || events.length > MAX_BATCH) return null;
  const clean = events.map(cleanEvent);
  return clean.every(Boolean) && clean.filter(e => e.t === 'note').length <= 3 ? clean : null;
}
