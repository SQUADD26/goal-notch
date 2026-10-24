// Controlla le voci del collaudo in checklist/<famiglia>.jsonl (#518): schema, id unici, prefisso della famiglia, voci osservabili.
// Uso: node test/beta/controlla-checklist.mjs [--min N] [--prossimo PREFISSO]   Esce 1 se c'è un errore.
// Campi: id, famiglia, titolo, dove, fai, vedi, soglia, piattaforme (["electron"]), prova (auto|occhio|fotogrammi), gravita, fonte, origine.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./checklist/', import.meta.url));
// Il prefisso di una famiglia è quello del primo id del suo file (BAR, SOV, CMD…): un file nuovo non tocca questo script; due file con lo stesso prefisso = errore.
const GRAVITA = ['bloccante', 'alta', 'media', 'bassa'], PROVA = ['auto', 'occhio', 'fotogrammi'];
// parole di gusto: «vedi» dice un sì/no che si osserva, mai un giudizio
const GUSTO = /\b(bell[oaie]|brutt[oaie]|piacevol\w*|adeguat\w*|sembr\w*|elegant\w*|curat\w*|fluid[oaie]|naturale|intuitiv\w*|ragionevol\w*|opportun\w*|buon[oaie])\b/i;
const opt = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);

const righe = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
  .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').map((r, i) => ({ f, i: i + 1, r })).filter((x) => x.r.trim()));
if (opt('--prossimo')) {
  const pre = opt('--prossimo').toUpperCase();
  const n = righe.map((x) => { try { return JSON.parse(x.r).id; } catch { return ''; } }).filter((id) => id?.startsWith(pre + '-')).map((id) => +id.split('-')[1]);
  console.log(`${pre}-${String(Math.max(0, ...n) + 1).padStart(3, '0')}`);
  process.exit(0);
}
const errori = [], visti = new Map(), conto = {}, prefissi = {};
for (const { f, i, r } of righe) {
  const posto = `${f}:${i}`, fam = f.replace('.jsonl', '');
  let v; try { v = JSON.parse(r); } catch { errori.push(`${posto}: JSON non valido`); continue; }
  const pre = (prefissi[fam] ??= String(v.id ?? '').split('-')[0]);
  if (!/^[A-Z][A-Z0-9]{2,3}$/.test(pre)) { errori.push(`${posto}: id «${v.id}» senza prefisso di 3-4 lettere maiuscole o cifre (ABC-001)`); continue; }
  const altro = Object.entries(prefissi).find(([g, p]) => p === pre && g !== fam);
  if (altro) errori.push(`${posto}: prefisso ${pre} già usato da ${altro[0]}.jsonl`);
  if (!new RegExp(`^${pre}-\\d{3}$`).test(v.id ?? '')) errori.push(`${posto}: id «${v.id}» non è ${pre}-001…`);
  if (visti.has(v.id)) errori.push(`${posto}: id ${v.id} doppio (già in ${visti.get(v.id)})`); else visti.set(v.id, posto);
  if (v.famiglia !== fam && v.famiglia !== pre) errori.push(`${posto} ${v.id}: famiglia «${v.famiglia}», il file dice «${fam}» (${pre})`);
  for (const [k, min] of [['titolo', 8], ['dove', 3], ['fai', 3], ['vedi', 15], ['soglia', 1], ['fonte', 6], ['origine', 3]]) if (typeof v[k] !== 'string' || v[k].trim().length < min) errori.push(`${posto} ${v.id}: «${k}» mancante o sotto ${min} caratteri`);
  if (!GRAVITA.includes(v.gravita)) errori.push(`${posto} ${v.id}: gravita ${GRAVITA.join('|')}`);
  if (!PROVA.includes(v.prova)) errori.push(`${posto} ${v.id}: prova ${PROVA.join('|')}`);
  if (JSON.stringify(v.piattaforme) !== '["electron"]') errori.push(`${posto} ${v.id}: piattaforme deve essere ["electron"]`);
  if (typeof v.vedi === 'string' && GUSTO.test(v.vedi)) errori.push(`${posto} ${v.id}: «vedi» ha una parola di gusto («${v.vedi.match(GUSTO)[0]}»): sì/no osservabile`);
  if (typeof v.fonte === 'string' && !/^(figma:\d+[:-]\d+|criteri:[A-Z]+\d*|bug #\d+)/.test(v.fonte)) errori.push(`${posto} ${v.id}: fonte «figma:<id>», «criteri:<id>» o «bug #N»`);
  conto[fam] = (conto[fam] ?? 0) + 1;
}
const min = +(opt('--min') ?? 0);
console.log(JSON.stringify({ voci: visti.size, perFamiglia: conto }));
if (visti.size < min) errori.push(`solo ${visti.size} voci, ne servono ${min}`);
if (errori.length) { console.error(errori.slice(0, 60).join('\n')); process.exit(1); }
