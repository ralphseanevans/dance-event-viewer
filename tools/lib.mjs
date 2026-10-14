// Shared helpers for the Dance Event Viewer pipeline tools.
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

export const PUBLIC_FIELDS = ['key','name','style','type','day_of_week','monthly_rule','exclude_monthly_rules','exclude_dates','start_date','end_date','start_time','end_time','venue','state','cost','source_url','unverified','verified_on'];
// Cancel banners (docs/cancel-banners.md). Optional: only written on events that use them.
export const CANCEL_FIELDS = ['canceled_dates','cancel_status'];
export const CANCEL_STATUS_ENUM = ['confirmed','likely','owner'];
export const INTERNAL_FIELDS = ['notes','source_skill','source_type','source_detail','first_seen','last_confirmed','added_to_calendar','calendar_event_id','in_wcs_list','flyer_url','research_batch','research_confidence'];

// site-log.json schema.
export const SITE_LOG_SCHEMA = 1;
export const SITE_LOG_KINDS = {
  event_discovered: { required: ['id','ts','ts_precision','kind','key','name'], optional: ['venue','style','state','has_flyer'] },
  flyer_captured:   { required: ['id','ts','ts_precision','kind','key','name'], optional: [] },
};

export const TYPE_ENUM = ['weekly_recurring','monthly_recurring','one_time','tentative'];
export const SOURCE_TYPE_ENUM = ['messenger','email','facebook_group','website','manual'];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const KEY_RE = /^[A-Za-z0-9._-]+$/;
export const MASTER_REQUIRED_FIELDS = [
  'key','name','style','type','day_of_week','monthly_rule','start_date','end_date',
  'start_time','end_time','venue','state','cost','notes','source_skill','source_type',
  'source_detail','first_seen','last_confirmed','added_to_calendar','calendar_event_id','in_wcs_list',
];
export const MASTER_OPTIONAL_FIELDS = [
  'exclude_monthly_rules','exclude_dates','source_url','flyer_url','research_batch','research_confidence',
  ...CANCEL_FIELDS,
];

export function strictReadText(p) {
  const b = readFileSync(p);
  if (b.length === 0) throw new Error(`Empty writable source: ${p}`);
  if (b.includes(0)) throw new Error(`NUL byte in ${p}; restore from a verified backup. Corruption must never be stripped and continued.`);
  return b.toString('utf8');
}

export function load(p) {
  const text = strictReadText(p);
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`Malformed or truncated JSON in ${p}: ${error.message}`); }
}

export function atomicWriteText(p, text) {
  if (text.includes('\0')) throw new Error(`Refusing to write NUL bytes to ${p}`);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx' });
    strictReadText(tmp);
    renameSync(tmp, p);
  } catch (error) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* preserve original error */ }
    throw error;
  }
}

export function save(p, obj) {
  const text = JSON.stringify(obj, null, 2) + '\n';
  JSON.parse(text);
  atomicWriteText(p, text);
  return load(p);
}

const isNullableString = value => value === null || typeof value === 'string';
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function validateDance(doc) {
  const errs = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['document must be an object'];
  if (typeof doc._schema_notes !== 'string' || !doc._schema_notes.trim()) errs.push('_schema_notes must be a nonempty string');
  if (!doc.skill_runs || typeof doc.skill_runs !== 'object' || Array.isArray(doc.skill_runs)) errs.push('skill_runs must be an object');
  if (!Array.isArray(doc.events)) return [...errs, 'events must be an array'];

  const keys = new Set();
  const allowed = new Set([...MASTER_REQUIRED_FIELDS, ...MASTER_OPTIONAL_FIELDS]);
  for (const [index, event] of doc.events.entries()) {
    const label = event && event.key ? event.key : `events[${index}]`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) { errs.push(`${label}: event must be an object`); continue; }
    for (const field of MASTER_REQUIRED_FIELDS) if (!hasOwn(event, field)) errs.push(`${label}: missing required field ${field}`);
    for (const field of Object.keys(event)) if (!allowed.has(field)) errs.push(`${label}: unknown field ${field}`);
    if (typeof event.key !== 'string' || !KEY_RE.test(event.key) || keys.has(event.key)) errs.push(`${label}: bad or duplicate key`);
    if (typeof event.key === 'string') keys.add(event.key);
    if (typeof event.name !== 'string' || !event.name.trim()) errs.push(`${label}: name must be nonempty`);
    if (typeof event.style !== 'string' || !event.style.trim()) errs.push(`${label}: style must be nonempty`);
    if (!TYPE_ENUM.includes(event.type)) errs.push(`${label}: bad type ${event.type}`);
    if (!isNullableString(event.day_of_week)) errs.push(`${label}: day_of_week must be string or null`);
    if (!isNullableString(event.monthly_rule)) errs.push(`${label}: monthly_rule must be string or null`);
    for (const field of ['start_date','end_date']) if (event[field] !== null && !DATE_RE.test(event[field] || '')) errs.push(`${label}: bad ${field}`);
    for (const field of ['start_time','end_time']) if (event[field] !== null && !TIME_RE.test(event[field] || '')) errs.push(`${label}: bad ${field}`);
    if (typeof event.venue !== 'string') errs.push(`${label}: venue must be a string`);
    if (!isNullableString(event.cost)) errs.push(`${label}: cost must be string or null`);
    if (typeof event.notes !== 'string') errs.push(`${label}: notes must be a string`);
    if (!isNullableString(event.source_skill)) errs.push(`${label}: source_skill must be string or null`);
    if (!SOURCE_TYPE_ENUM.includes(event.source_type)) errs.push(`${label}: bad source_type ${event.source_type}`);
    if (typeof event.source_detail !== 'string' || !event.source_detail.trim()) errs.push(`${label}: source_detail must be nonempty`);
    for (const field of ['first_seen','last_confirmed']) if (!DATE_RE.test(event[field] || '')) errs.push(`${label}: bad ${field}`);
    if (typeof event.added_to_calendar !== 'boolean') errs.push(`${label}: added_to_calendar must be boolean`);
    if (!isNullableString(event.calendar_event_id)) errs.push(`${label}: calendar_event_id must be string or null`);
    if (typeof event.in_wcs_list !== 'boolean') errs.push(`${label}: in_wcs_list must be boolean`);
    if (!hasOwn(event, 'state') || (event.state !== null && !/^[A-Z]{2}$/.test(event.state))) errs.push(`${label}: bad state ${event.state}`);
    for (const field of ['exclude_dates','exclude_monthly_rules']) {
      if (hasOwn(event, field) && (!Array.isArray(event[field]) || event[field].some(value => typeof value !== 'string'))) errs.push(`${label}: ${field} must be an array of strings`);
    }
    if (hasOwn(event, 'exclude_dates') && event.exclude_dates.some(value => !DATE_RE.test(value))) errs.push(`${label}: exclude_dates contains a non-date`);
    for (const field of ['source_url','flyer_url','research_batch']) if (hasOwn(event, field) && !isNullableString(event[field])) errs.push(`${label}: ${field} must be string or null`);
    for (const message of validateCancelFields(event)) errs.push(`${label}: ${message}`);
    if (hasOwn(event, 'research_confidence') && !['low','medium','high'].includes(event.research_confidence)) errs.push(`${label}: bad research_confidence`);
  }
  return errs;
}

// Checks canceled_dates / cancel_status. Missing or null is fine (not canceled).
export function validateCancelFields(event) {
  const errs = [];
  if (hasOwn(event, 'cancel_status') && event.cancel_status !== null && !CANCEL_STATUS_ENUM.includes(event.cancel_status)) errs.push(`bad cancel_status ${event.cancel_status}`);
  if (hasOwn(event, 'canceled_dates') && event.canceled_dates !== null) {
    if (!Array.isArray(event.canceled_dates)) errs.push('canceled_dates must be an array');
    else for (const entry of event.canceled_dates) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !DATE_RE.test(entry.date || '')) { errs.push('canceled_dates entries need a YYYY-MM-DD date'); continue; }
      if (hasOwn(entry, 'cancel_status') && entry.cancel_status !== null && !CANCEL_STATUS_ENUM.includes(entry.cancel_status)) errs.push(`bad canceled_dates cancel_status ${entry.cancel_status}`);
      if (hasOwn(entry, 'reason') && entry.reason !== null && typeof entry.reason !== 'string') errs.push('canceled_dates reason must be a string');
    }
  }
  return errs;
}

// Copies the cancel fields onto a public event, only when they carry a value
// (this matches how the committed dance_events.json stores them).
export function addCancelFields(publicEvent, source) {
  for (const field of CANCEL_FIELDS) {
    const value = source[field];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    publicEvent[field] = value;
  }
  return publicEvent;
}

export function copyAndVerifyBackup(source, destination, validator = null) {
  const original = readFileSync(source);
  if (original.length === 0 || original.includes(0)) throw new Error(`Cannot back up invalid source: ${source}`);
  copyFileSync(source, destination);
  const copied = readFileSync(destination);
  if (!original.equals(copied)) throw new Error(`Backup verification failed: ${destination}`);
  const parsed = load(destination);
  if (validator) {
    const errors = validator(parsed);
    if (errors.length) throw new Error(`Backup schema validation failed: ${errors.join('; ')}`);
  }
  return parsed;
}

export function compareMasterTransition(before, after) {
  const beforeMap = new Map(before.events.map(event => [event.key, event]));
  const afterMap = new Map(after.events.map(event => [event.key, event]));
  const added = [...afterMap.keys()].filter(key => !beforeMap.has(key));
  const removed = [...beforeMap.keys()].filter(key => !afterMap.has(key));
  const updated = [...afterMap.keys()].filter(key => beforeMap.has(key) && JSON.stringify(beforeMap.get(key)) !== JSON.stringify(afterMap.get(key)));
  return { added, removed, updated };
}

export function exportPublic(dance) {
  const baseFields = PUBLIC_FIELDS.filter(field => !['unverified','verified_on'].includes(field));
  const out = { events: dance.events.map(event => {
    const publicEvent = {};
    for (const field of baseFields) publicEvent[field] = hasOwn(event, field) ? event[field] : null;
    publicEvent.unverified = event.research_confidence === 'low';
    publicEvent.verified_on = DATE_RE.test(event.last_confirmed || '') ? event.last_confirmed : null;
    return addCancelFields(publicEvent, event);
  }) };
  const leaks = [];
  for (const event of out.events) for (const field of INTERNAL_FIELDS) if (hasOwn(event, field)) leaks.push(`${event.key}:${field}`);
  if (leaks.length) throw new Error(`LEAK CHECK FAILED: ${leaks.join(', ')}`);
  return out;
}
