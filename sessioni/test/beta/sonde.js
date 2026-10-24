// Sonde dentro la pagina (init script del beta tester, #518). Espone window.__bt: cliccabili, sonde su uno stato, anello del fuoco,
// campionatore delle animazioni a ogni fotogramma. Ogni difetto: { criterio, dove, valore }. Criteri in sessioni/test/beta/LEGGIMI.md.
(() => {
  const SOPRA = '[role=menu],[role=listbox],[role=dialog],[role=tooltip],.menu,.tooltip,.popover-attivita,.dialogo,[popover]:popover-open,dialog[open],.avviso-comparsa';
  const CLIC = 'button,a,[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox],[role=tab],[role=option],input,textarea,[tabindex]:not([tabindex="-1"])';
  const LAYOUT = /^(width|height|top|left|right|bottom|inset|margin|padding|max-|min-|flex-basis|grid-template)/;
  const num = (s) => (String(s).match(/-?[\d.]+/g) || []).map(Number);
  const testo = (e) => (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const sel = (e) => {
    if (!e || !e.tagName) return '?';
    const c = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const t = testo(e);
    return e.tagName.toLowerCase() + c + (t ? ` «${t}»` : '');
  };
  // aspetto calcolato di un pezzo e dei suoi figli: seconda prova degli stati, accanto ai pixel della foto
  const aspetto = (x) => [x, ...x.querySelectorAll('*')].map((y) => { const z = getComputedStyle(y); return z.color + z.backgroundColor + z.opacity + z.borderTopColor + z.boxShadow + z.transform + z.fill + z.stroke; }).join();
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0; };
  const proprio = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const dentro = (a, b, m = 1) => a.left >= b.left - m && a.top >= b.top - m && a.right <= b.right + m && a.bottom <= b.bottom + m;
  const sopra = () => [...document.querySelectorAll(SOPRA)].filter(vis).filter((e, _, t) => !t.some((o) => o !== e && o.contains(e)));

  // spazio scritto con un token (`var(--spazio-*)`, anche dentro calc) o nato da `auto`: il numero calcolato non è a mano.
  // Lo dicono le regole del CSS costruito che toccano l'elemento (da file:// la pagina non legge i suoi fogli).
  const regole = (css) => (window.__regole ??= (function giu(l) { return [...l].flatMap((r) => (r.selectorText ? [r] : []).concat(r.cssRules ? giu(r.cssRules) : [])); })((() => { const f = new CSSStyleSheet(); f.replaceSync(css); return f.cssRules; })()));
  const CORTA = { margin: 'margin', padding: 'padding', row: 'gap', column: 'gap' };
  function scritto(e, p, css) {
    const k = p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), corta = CORTA[k.split('-')[0]];
    const vale = (st) => { const v = st.getPropertyValue(k); return v === 'auto' || v.includes('var(--') || (!v && /var\(--|auto/.test(st.getPropertyValue(corta))); };
    return vale(e.style) || regole(css).some((r) => { try { return e.matches(r.selectorText) && vale(r.style); } catch { return false; } });
  }

  function statiche(radice, tok, d) {
    const finestra = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const el = [...document.querySelectorAll(`${radice}, ${radice} *, ${SOPRA}, :is(${SOPRA}) *`)].filter(vis);
    const colOk = (c) => { const v = num(c); if (v.length < 3 || (v[3] ?? 1) === 0) return true; return tok.colori.some((t) => Math.abs(t[0] - v[0]) <= 1 && Math.abs(t[1] - v[1]) <= 1 && Math.abs(t[2] - v[2]) <= 1 && Math.abs(t[3] - (v[3] ?? 1)) <= 0.01); };
    const visti = new Set(), una = (criterio, e, valore) => { const k = criterio + sel(e) + valore; if (!visti.has(k) && visti.add(k)) d.push({ criterio, dove: sel(e), valore }); };
    for (const e of el) {
      const s = getComputedStyle(e), svg = e instanceof SVGElement;
      if (svg) continue;
      for (const [c, quando] of [[s.color, proprio(e)], [s.backgroundColor, true], [s.borderTopColor, +parseFloat(s.borderTopWidth) > 0]]) if (quando && !colOk(c)) una('COLORE', e, c);
      for (const r of [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius]) {
        const v = parseFloat(r); if (v && !r.includes('%') && v < 999 && !tok.raggi.includes(v)) una('RAGGIO', e, r);
      }
      for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
        const v = Math.abs(parseFloat(s[p])); if (v && !tok.spazi.includes(v) && !scritto(e, p, tok.css)) una('SPAZIO', e, `${p} ${s[p]}`);
      }
      const p = e.parentElement, ps = p && getComputedStyle(p);
      if (p && p !== document.body && ps.overflow === 'visible' && (ps.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(ps.borderTopWidth) > 0)) {
        const r = e.getBoundingClientRect(), q = p.getBoundingClientRect(), fuori = Math.max(q.left - r.left, q.top - r.top, r.right - q.right, r.bottom - q.bottom);
        if (fuori > 1) una('SPORGE', e, `esce di ${Math.round(fuori)} px da ${sel(p)}`);
      }
      if (proprio(e) && e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && s.webkitLineClamp === 'none') una('TESTO', e, `${e.scrollWidth}>${e.clientWidth} senza ellissi`);
    }
    for (const e of document.querySelectorAll(`${radice} :is(${CLIC})`)) {
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      let scorre = false;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflow)) { scorre = true; break; }
      if (e.disabled || e.getAttribute('aria-disabled') === 'true') {
        const gemello = [...document.querySelectorAll(`${radice} :is(${CLIC})`)].find((o) => o !== e && o.className === e.className && !o.disabled && o.getAttribute('aria-disabled') !== 'true' && vis(o));
        if (gemello && aspetto(gemello) === aspetto(e)) una('STATO', e, `disabilitato uguale all'attivo ${sel(gemello)}`);
      }
      if (!scorre && !dentro(r, finestra)) una('FUORI', e, `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} in ${innerWidth}×${innerHeight}`);
    }
    for (const e of sopra()) {
      const r = e.getBoundingClientRect();
      if (!dentro(r, finestra)) una('FUORI', e, `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)} fuori da ${innerWidth}×${innerHeight}`);
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/hidden|clip|auto|scroll/.test(getComputedStyle(p).overflow) && !dentro(r, p.getBoundingClientRect())) { una('TAGLIATO', e, `tagliato da ${sel(p)}`); break; }
      }
      // chi non prende il mouse (tooltip, pointer-events: none) non si vede con elementFromPoint: non si misura
      const coperti = getComputedStyle(e).pointerEvents === 'none' ? [] : [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9]].map(([x, y]) => [r.left + r.width * x, r.top + r.height * y])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight).filter(([x, y]) => { const t = document.elementFromPoint(x, y); return t && !e.contains(t); });
      if (coperti.length) una('COPERTO', e, `${coperti.length}/5 punti coperti da ${sel(document.elementFromPoint(...coperti[0]))}`);
    }
    return d;
  }

  // Anello del fuoco: c'è (outline o box-shadow) e segue la forma (stesso raggio del pezzo che si vede, se il fuoco è su un figlio o un genitore).
  function anello(e) {
    // un campo non disegna l'anello: lo disegna il contenitore (#521), il primo antenato col fuoco dentro che ha outline
    const nudo = (x) => { const z = getComputedStyle(x); return z.outlineStyle !== 'none' && parseFloat(z.outlineWidth) > 0; };
    if (e.matches('input,textarea') && !nudo(e)) { for (let p = e.parentElement, n = 0; p && n < 4; p = p.parentElement, n++) if (nudo(p)) return null; }
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    const c = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, o = s.boxShadow !== 'none';
    if (!c && !o) return { criterio: 'FOCUS', dove: sel(e), valore: 'nessun anello del fuoco' };
    const raggio = parseFloat(s.borderTopLeftRadius) || 0;
    const forma = [e.parentElement, e.firstElementChild].filter(Boolean).find((x) => { const q = x.getBoundingClientRect(), z = getComputedStyle(x); return Math.abs(q.width - r.width) <= 2 && Math.abs(q.height - r.height) <= 2 && (z.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(z.borderTopWidth) > 0); });
    const rf = forma ? parseFloat(getComputedStyle(forma).borderTopLeftRadius) || 0 : raggio;
    if (Math.abs(rf - raggio) > 0.5) return { criterio: 'FOCUS', dove: sel(e), valore: `anello con raggio ${raggio}px su forma con raggio ${rf}px` };
    return null;
  }

  // Una transizione invertita a metà (il mouse esce durante il passaggio) dura meno di quanto dichiarato: si misura la durata scritta nel CSS.
  function dichiarata(a) {
    if (!a.transitionProperty || a.effect.pseudoElement) return null;
    const s = getComputedStyle(a.effect.target), d = s.transitionDuration.split(','), i = s.transitionProperty.split(',').map((x) => x.trim()).indexOf(a.transitionProperty);
    const t = d[(i < 0 ? 0 : i) % d.length].trim(), v = parseFloat(t);
    return Number.isFinite(v) ? (t.endsWith('ms') ? v : v * 1000) : null;
  }
  // Campiona ogni fotogramma per `ms`: tempi dei fotogrammi e, per ogni animazione che parte, proprietà, durata e curva dichiarate, opacità e trasformazione misurate.
  function campiona(ms) {
    // ogni gesto conta: un'animazione parte dal premuto (pointerdown), un'altra dal clic (pointerup), un'altra dal tasto
    let ev = null; const eventi = [], l = () => { const t = performance.now(); ev ??= t; eventi.push(t); }, GESTI = ['pointerdown', 'pointerup', 'keydown'];
    GESTI.forEach((g) => addEventListener(g, l, { capture: true }));
    const prima = new Set(document.getAnimations()), anim = new Map(), T = [];
    return new Promise((ok) => {
      const t0 = performance.now(), passo = (t) => {
        T.push(t);
        // anche le ombre: l'uscita dei sovrapposti è una copia in uno shadow root (base/Sovrapposto.tsx)
        for (const a of [...document.getAnimations(), ...[...document.body.children].flatMap((e) => e.shadowRoot?.getAnimations() ?? [])]) {
          if (prima.has(a) || !a.effect?.target) continue;
          if (!anim.has(a)) {
            const k = a.effect.getKeyframes(), tim = a.effect.getComputedTiming();
            anim.set(a, { dove: sel(a.effect.target) + (a.effect.pseudoElement ?? ''), nome: a.transitionProperty ?? a.animationName ?? '?', proprieta: [...new Set(k.flatMap((f) => Object.keys(f).filter((x) => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))))],
              durata: dichiarata(a) ?? tim.duration, avviso: !!a.effect.target.closest('.avviso-comparsa,[role=status]') || /\(avviso-\d+\)/.test(a.effect.pseudoElement ?? ''),
              // nasce sotto una View Transition (base/movimento.ts): il DOM vero è coperto dalle foto, la sua partenza non si vede
              coperta: !a.effect.pseudoElement && document.getAnimations().some((x) => x.effect?.pseudoElement?.startsWith('::view-transition')),
              // il tooltip compare dopo un'attesa voluta (base/Suggerimento.tsx), non subito al gesto
              attesa: !!a.effect.target.closest?.('[role=tooltip],.tooltip,.suggerimento'), infinita: tim.iterations === Infinity, curva: k[0]?.easing && k[0].easing !== 'linear' ? k[0].easing : a.effect.getTiming().easing, serie: [] });
          }
          const s = getComputedStyle(a.effect.target, a.effect.pseudoElement ?? null), m = s.transform === 'none' ? [1, 0, 0, 1, 0, 0] : num(s.transform);
          const e = anim.get(a);
          // inizio vero dalla linea del tempo: il primo campione può arrivare tardi se uno screenshot ferma i fotogrammi
          if (e.inizio == null && a.startTime != null) e.inizio = a.startTime;
          e.serie.push([t, +s.opacity, m[4] ?? 0, m[5] ?? 0, Math.hypot(m[0], m[1])]);
        }
        if (t - t0 < ms) return requestAnimationFrame(passo);
        GESTI.forEach((g) => removeEventListener(g, l, { capture: true }));
        ok({ evento: ev, eventi, T, animazioni: [...anim.values()] });
      };
      requestAnimationFrame(passo);
    });
  }

  window.__bt = {
    SOPRA, LAYOUT: LAYOUT.source, sel, aspetto, statiche, anello, campiona,
    cliccabili(radice) {
      const visti = new Set();
      return [...document.querySelectorAll(`${radice} :is(${CLIC})`)].filter(vis).filter((e) => !e.closest(SOPRA)).filter((e) => {
        const r = e.getBoundingClientRect(), k = sel(e) + Math.round(r.x) + Math.round(r.y); return !visti.has(k) && visti.add(k);
      });
    },
    sopra,
    // menu, popover e dialoghi aperti da un gesto: tooltip e avvisi a comparsa non si chiudono con Esc né prendono il fuoco
    menuAperti: () => sopra().filter((e) => !e.matches('.avviso-comparsa,[role=tooltip],.tooltip,[role=status]')).length,
    firma: (radice) => [...document.querySelectorAll(`${radice} :is(${CLIC})`)].filter(vis).length + '|' + sopra().length + '|' + location.search,
  };
})();
