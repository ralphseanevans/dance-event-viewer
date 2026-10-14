#!/usr/bin/env node
// Sanitized public export of a private master file (18 fields plus canceled_dates /
// cancel_status when set; leak check enforced).
// Usage (from the repo root): node tools/export_public.mjs <master.json> <out.json>
import { load, save, exportPublic, validateDance } from './lib.mjs';
const [,,src,out]=process.argv;
if(!src||!out){ console.error('Usage: node tools/export_public.mjs <master.json> <out.json>'); process.exit(2); }
const d=load(src); const errs=validateDance(d); if(errs.length){ console.error("VALIDATION FAILED:\n"+errs.join("\n")); process.exit(1); }
save(out, exportPublic(d)); console.log(`exported ${d.events.length} events -> ${out} (18 public fields + cancel fields when set, leak check passed)`);
