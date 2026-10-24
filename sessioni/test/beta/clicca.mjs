// Beta tester di clotch (#518): clicca ogni elemento cliccabile visibile di un'area dell'app Electron vera, fotografa prima e dopo,
// prova Esc, frecce e Tab, lancia le sonde su ogni stato e (con --video) misura ogni animazione a ogni fotogramma.
// Uso: node test/beta/clicca.mjs --area <barra|chat|nuova|friday|impostazioni|cornice|tutto> [--tema chiaro|scuro] [--misura min|grande]
//        [--dati con|senza] [--lungo] [--ridotto] [--matrice] [--video] [--max N] --out <cartella>
// Prima: npm ci, npm run build, npm run scene. Scrive <out>/<area>/<config>/registro.json, foto/, video/ e <out>/sommario.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AREE, avvia, configura, preparaScena, schermo } from './avvio.mjs';
import { difettiInterruzione, difettiMovimento, riassunto } from './movimento.mjs';
import { tokenPagina } from './token.mjs';

const arg = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, ''), v = process.argv[i + 1];
  arg[k] = v && !v.startsWith('--') ? (i++, v) : true;
}
const aree = arg.area === 'tutto' ? Object.keys(AREE).filter((a) => !AREE[a].extra) : [arg.area];
if (!arg.out || aree.some((a) => !AREE[a])) { console.error(`uso: node test/beta/clicca.mjs --area <${Object.keys(AREE).join('|')}|tutto> --out <cartella> [--matrice]`); process.exit(2); }
const OUT = resolve(arg.out), MAX = +arg.max || 80, VIDEO = !!arg.video;

const nome = (c) => [c.tema, c.misura, `dati-${c.dati}`, c.lungo && 'lungo', c.ridotto && 'ridotto'].filter(Boolean).join('-');
// Matrice minima del collaudo: tema × misura × dati × testo lungo, più un giro con movimento ridotto.
const CONFIG = arg.matrice
  ? ['chiaro', 'scuro'].flatMap((tema) => ['min', 'grande'].flatMap((misura) => ['con', 'senza'].flatMap((dati) => [false, true].map((lungo) => ({ tema, misura, dati, lungo, ridotto: false })))))
    .concat([{ tema: 'scuro', misura: 'grande', dati: 'con', lungo: false, ridotto: true }])
  : [{ tema: arg.tema ?? 'scuro', misura: arg.misura ?? 'grande', dati: arg.dati ?? 'con', lungo: !!arg.lungo, ridotto: !!arg.ridotto }];
const TOK = tokenPagina();
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function giro(app, area, cfg, console_) {
  const { pagina } = app, radice = AREE[area].radice, dir = join(OUT, area, nome(cfg));
  mkdirSync(join(dir, 'foto'), { recursive: true });
  const reg = { area, config: cfg, nome: nome(cfg), elementi: [], difetti: [], movimenti: [], console: console_.splice(0), foto: 0 };
  let nf = 0;
  const foto = async (n) => { const f = join('foto', `${String(nf++).padStart(3, '0')}-${n}.jpg`); await pagina.screenshot({ path: join(dir, f), type: 'jpeg', quality: 60, timeout: 5000 }).catch(() => nf--); return f; };
  const difetti = async (dove, f) => (await pagina.evaluate(([r, t]) => window.__bt.statiche(r, t, []), [radice, TOK])).forEach((x) => reg.difetti.push({ ...x, quando: dove, foto: f }));
  const segna = () => pagina.evaluate((r) => window.__bt.cliccabili(r).map((e, i) => (e.setAttribute('data-bt', i), window.__bt.sel(e))), radice);
  const pulito = async () => { await pagina.reload(); await pagina.waitForSelector('.cornice:not(.in-avvio)', { timeout: 15000 }).catch(() => {}); await configura(app, cfg); await pausa(300);
    if (AREE[area].apri && !(await pagina.locator(radice).first().isVisible())) { await pagina.locator(AREE[area].apri).first().click({ timeout: 2000 }).catch(() => {}); await pausa(400); }
  };

  // la foto della finestra di prova non ridisegna :hover e :active del mouse finto: si forzano con CSS.forcePseudoState sul pezzo
  const cdp = await pagina.context().newCDPSession(pagina);
  const forza = async (i, stati) => { try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 }), { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-bt="${i}"]` });
    if (nodeId) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: stati });
    // il mouse vero tiene `:hover` anche sugli antenati (una riga che mostra le sue azioni solo al passaggio): si forzano insieme
    await pagina.evaluate((i) => { document.querySelectorAll('[data-bt-anc]').forEach((e) => e.removeAttribute('data-bt-anc')); if (!document.querySelector('[data-bt-anc]')) for (let e = document.querySelector(`[data-bt="${i}"]`)?.parentElement; e; e = e.parentElement) e.setAttribute('data-bt-anc', ''); }, i);
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-bt-anc]' });
    for (const id of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: stati.filter((s) => s === 'hover') });
  } catch { /* pezzo sparito */ } };
  await pulito();
  const f0 = await foto('iniziale');
  await difetti('iniziale', f0);
  let nomi = await segna();
  const firma0 = await pagina.evaluate((r) => window.__bt.firma(r), radice);
  const n = Math.min(nomi.length, MAX);
  for (let i = 0; i < n; i++) {
    let loc = pagina.locator(`[data-bt="${i}"]`);
    if (!(await loc.count())) { await pulito(); nomi = await segna(); loc = pagina.locator(`[data-bt="${i}"]`); if (!(await loc.count())) continue; }
    const el = { n: i, dove: nomi[i], foto: [] };
    if (!(await loc.isVisible())) continue;
    el.foto.push(await foto(`el${i}-prima`));
    // l'elemento può sparire subito dopo il conteggio: le View Transition (#520) cambiano il DOM un fotogramma dopo il clic di prima
    const tipo = await loc.evaluate((e) => e.matches('input,textarea,[contenteditable]') ? 'campo' : e.getAttribute('role') ?? e.tagName.toLowerCase(), null, { timeout: 2000 }).catch(() => null);
    if (!tipo) continue;
    // stati: riposo, mouse sopra, premuto (il rilascio è il clic); uguale al precedente = stato mancante
    const disab = await loc.evaluate((e) => e.disabled || e.getAttribute('aria-disabled') === 'true', null, { timeout: 2000 }).catch(() => false);
    const box = await loc.boundingBox(), clip = box && { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: box.width + 8, height: box.height + 8 };
    const pezzo = () => (clip ? pagina.screenshot({ clip, timeout: 3000 }).catch(() => null) : null);
    const uguali = (a, b) => a && b && a.equals(b);
    const manca = (criterio, valore) => reg.difetti.push({ criterio, dove: el.dove, valore, quando: el.dove, foto: el.foto.at(-1) });
    await pagina.mouse.move(0, 0, { steps: 2 }); await pausa(200);
    const asp = () => loc.evaluate((e) => window.__bt.aspetto(e)).catch(() => null);
    const riposo = await pezzo(), aRiposo = await asp();
    const ok = await loc.hover({ timeout: 2000 }).then(() => true, (e) => (el.errore = e.message.split('\n')[0], false));
    // un solo spostamento non sempre accende :hover (visto sulle righe della barra, #522): si entra con qualche passo, come una mano vera
    if (ok && box) await pagina.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 1, { steps: 4 });
    if (ok) await forza(i, ['hover']);
    await pausa(250);
    const sopra = await pezzo(), aSopra = await asp(); el.foto.push(await foto(`el${i}-hover`));
    if (ok && !disab && uguali(riposo, sopra) && aRiposo === aSopra) manca('HOVER', 'nessun cambio visivo col mouse sopra');
    const campione = VIDEO ? pagina.evaluate(() => window.__bt.campiona(700)).catch(() => null) : null;
    if (ok) {
      await pagina.mouse.down(); await forza(i, ['hover', 'active']); await pausa(80);
      const premuto = await pezzo(), aPremuto = await asp(); el.foto.push(await foto(`el${i}-premuto`));
      await pagina.mouse.up(); await forza(i, []);
      if (!disab && tipo !== 'campo' && uguali(sopra, premuto) && aSopra === aPremuto) manca('PREMUTO', 'nessuno stato premuto');
    }
    if (campione) { const c = await campione; if (c) { reg.movimenti.push({ dove: el.dove, animazioni: riassunto(c) }); difettiMovimento(c, { ridotto: cfg.ridotto, dove: el.dove }).forEach((d) => reg.difetti.push({ ...d, quando: el.dove })); } }
    else await pausa(350);
    el.foto.push(await foto(`el${i}-dopo`));
    await difetti(el.dove, el.foto.at(-1));
    reg.elementi.push(el);
    if (!ok) continue;
    // tastiera: in un campo si scrive e si svuota; un sovrapposto aperto si percorre con le frecce, Esc lo chiude e il fuoco torna a chi l'ha aperto
    if (tipo === 'campo') { await loc.fill('Collaudo beta').catch(() => {}); el.foto.push(await foto(`el${i}-scritto`)); await loc.fill('').catch(() => {}); }
    else if (tipo === 'tab') { await pagina.keyboard.press('ArrowRight'); el.foto.push(await foto(`el${i}-freccia`)); }
    const aperti = await pagina.evaluate(() => window.__bt.menuAperti());
    if (aperti && tipo !== 'campo') {
      await pagina.keyboard.press('ArrowDown'); el.foto.push(await foto(`el${i}-freccia`));
      await pagina.keyboard.press('Escape'); await pausa(450);
      const dopo = await pagina.evaluate(() => ({ aperti: window.__bt.menuAperti(), fuoco: document.activeElement?.getAttribute('data-bt') }));
      if (dopo.aperti) reg.difetti.push({ criterio: 'ESC', dove: el.dove, valore: 'Esc non chiude il sovrapposto', quando: el.dove, foto: el.foto.at(-1) });
      else if (dopo.fuoco !== String(i)) reg.difetti.push({ criterio: 'FUOCO-RITORNO', dove: el.dove, valore: 'dopo Esc il fuoco non torna al pulsante che ha aperto', quando: el.dove, foto: el.foto.at(-1) });
      if (VIDEO && !dopo.aperti) { // M10: si riapre e si interrompe a metà con Esc
        const c = pagina.evaluate(() => window.__bt.campiona(500)).catch(() => null);
        await loc.click({ timeout: 1000 }).catch(() => {}); await pausa(60); await pagina.keyboard.press('Escape');
        const r = await c; if (r) difettiInterruzione(r, el.dove).forEach((d) => reg.difetti.push({ ...d, quando: el.dove }));
      }
    } else if (tipo !== 'campo') { await pagina.keyboard.press('Escape'); await pausa(250); } // la chiusura con Esc finisce la sua transizione prima della firma
    if (await pagina.evaluate((r) => window.__bt.firma(r), radice) !== firma0) { await pulito(); nomi = await segna(); }
  }
  // Tab su tutta l'area: anello del fuoco presente e con la forma del pezzo
  await pulito(); await segna(); await pagina.evaluate(() => document.activeElement?.blur());
  for (let k = 0; k < Math.min(60, n + 5); k++) {
    await pagina.keyboard.press('Tab');
    const d = await pagina.evaluate((r) => { const e = document.activeElement; return e && e !== document.body && e.closest(r) ? { d: window.__bt.anello(e) } : null; }, radice);
    if (!d) continue;
    const f = await foto(`tab${k}`); // fuoco da tastiera, fotografato
    if (d.d) reg.difetti.push({ ...d.d, quando: 'Tab', foto: f });
  }
  reg.console.push(...console_.splice(0));
  reg.console.forEach((c) => reg.difetti.push({ criterio: 'CONSOLE', dove: 'console', valore: c.slice(0, 200), quando: 'giro' }));
  reg.foto = nf; reg.cliccati = reg.elementi.length;
  writeFileSync(join(dir, 'registro.json'), JSON.stringify(reg, null, 1));
  return reg;
}

await schermo();
mkdirSync(OUT, { recursive: true });
const sommario = [];
for (const area of aree) {
  // un avvio per scena (dati, testo lungo); tema, misura e movimento ridotto cambiano sulla stessa finestra
  const gruppi = Object.values(Object.groupBy(CONFIG, (c) => `${c.dati}-${c.lungo}`));
  for (const g of gruppi) {
    const scena = preparaScena(area, g[0], OUT);
    const app = await avvia(scena, { video: VIDEO && join(OUT, area, 'video', `${g[0].dati}${g[0].lungo ? '-lungo' : ''}`) });
    const console_ = [];
    app.pagina.on('console', (m) => m.type() === 'error' && console_.push(m.text()));
    app.pagina.on('pageerror', (e) => console_.push('pageerror: ' + e.message));
    await app.pagina.addInitScript({ path: new URL('./sonde.js', import.meta.url).pathname });
    try {
      for (const cfg of g) {
        const r = await giro(app, area, cfg, console_);
        const per = {}; r.difetti.forEach((d) => (per[d.criterio] = (per[d.criterio] ?? 0) + 1));
        sommario.push({ area, config: r.nome, cliccati: r.cliccati, foto: r.foto, difetti: per });
        console.log(`${area} ${r.nome}: ${r.cliccati} elementi cliccati, ${r.foto} foto, difetti ${JSON.stringify(per)}`);
      }
    } finally { await app.chiudi(); }
  }
}
const N = sommario.reduce((a, s) => a + s.cliccati, 0), M = sommario.reduce((a, s) => a + s.foto, 0);
writeFileSync(join(OUT, 'sommario.json'), JSON.stringify({ cliccati: N, foto: M, giri: sommario }, null, 1));
console.log(`${N} elementi cliccati, ${M} foto`);
