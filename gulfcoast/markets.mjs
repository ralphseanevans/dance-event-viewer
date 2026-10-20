// Simple-mode markets for Experimental Viewer 2 (plan §2a req 11).
// Order is fixed: Pensacola, Mobile, Destin, Panama City Beach, then Other.
// Pensacola/Mobile/Destin mirror locationOf()/isDestinAreaVenue() in js/app.js
// (main viewer untouched; this copy goes away when viewer-core.mjs is extracted).
// Panama City Beach = PCB proper + Laguna Beach + Inlet Beach; Panama City proper
// (and Lynn Haven/Callaway) stays out. PCB wins over Destin for those places.

export const MARKETS = Object.freeze([
  { id: 'pensacola', label: 'Pensacola' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'destin', label: 'Destin' },
  { id: 'pcb', label: 'Panama City Beach' }
]);
export const OTHER = Object.freeze({ id: 'other', label: 'Other' });
// Exp1 control order, top to bottom (req 15).
export const SIMPLE_CONTROL_ORDER = Object.freeze(['where', 'styles', 'when', 'cards']);

const DESTIN_AREA_TOWNS = [
  'Santa Rosa Beach', 'Miramar Beach', 'Sandestin', 'Seaside', 'WaterColor', 'Grayton Beach',
  'Blue Mountain Beach', 'Dune Allen', 'Seagrove Beach', 'Inlet Beach', 'Rosemary Beach',
  'Alys Beach', 'Watersound', 'Freeport', 'DeFuniak Springs', 'Niceville', 'Fort Walton Beach',
  'Ft\\.? Walton Beach', 'Okaloosa Island', 'Mary Esther', 'Shalimar', 'Valparaiso', 'Crestview'
];
const DESTIN_AREA_TOWN_RE = new RegExp(`\\b(?:${DESTIN_AREA_TOWNS.map(t => t.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');
const DESTIN_AREA_ZIPS = new Set(['32459', '32550', '32461', '32413', '32439', '32433', '32541',
  '32547', '32548', '32549', '32569', '32579', '32578', '32580', '32536', '32539']);
const PCB_TOWN_RE = /\b(?:Panama\s+City\s+Beach|PCB|Laguna\s+Beach|Inlet\s+Beach)\b/i;
const PCB_ZIPS = new Set(['32407', '32408', '32413']);

function stateCode(ev) {
  const v = typeof ev?.venue === 'string' ? ev.venue : '';
  if (typeof ev?.state === 'string' && ev.state.trim()) return ev.state.trim().toUpperCase();
  const m = v.match(/(?:^|,)\s*([A-Za-z][A-Za-z .'\-]*?),\s*([A-Za-z]{2})\b(?:\s+\d{5})?/);
  return m ? m[2].toUpperCase() : '';
}
const trailingFlZip = v => (v.match(/\bFL\s+(\d{5})(?:-\d{4})?\s*$/i) || [])[1] || '';

export function isPanamaCityBeachVenue(v, code) {
  if (typeof v !== 'string' || !v || code !== 'FL') return false;
  return PCB_TOWN_RE.test(v) || PCB_ZIPS.has(trailingFlZip(v));
}
export function isDestinAreaVenue(v, code) {
  if (typeof v !== 'string' || !v || code !== 'FL') return false;
  if (/\bdestin\b/i.test(v) || DESTIN_AREA_TOWN_RE.test(v)) return true;
  return DESTIN_AREA_ZIPS.has(trailingFlZip(v));
}

// Returns the market id for an event, or null (= Other).
export function marketOf(ev) {
  const v = typeof ev?.venue === 'string' ? ev.venue : '';
  if (!v) return null;
  const code = stateCode(ev);
  if (/pensacola/i.test(v)) return 'pensacola';
  if (/mobile/i.test(v)) return 'mobile';
  if (isPanamaCityBeachVenue(v, code)) return 'pcb';
  if (isDestinAreaVenue(v, code)) return 'destin';
  return null;
}
