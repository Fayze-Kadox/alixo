/* ============================================================
   Alixo — graphiques de données (barres, courbes, aires, secteurs)
   Bloc { type:'chart', ck, title, labels:[…], series:[{name, data:[…], color}], opts:{legend, values, stack, ymin, ymax, unit} }
   Rendu SVG (viewBox 640×360) : couleurs du thème à l'écran, palette
   fixe pour l'export (plain).
   ============================================================ */
'use strict';

window.AlixoCharts = (() => {
  const W = 640, H = 360;
  const PALETTE = ['#3d6bb5', '#c04343', '#2e8b6a', '#b3762a', '#7a6852', '#a8556f', '#33658a', '#5b6b8c', '#d06a3a', '#674ea7'];
  const TYPES = {
    bar: { name: 'Barres', ico: 'chart-bar' },
    hbar: { name: 'Barres horizontales', ico: 'list' },
    line: { name: 'Courbes', ico: 'chart-line' },
    area: { name: 'Aires', ico: 'wave' },
    pie: { name: 'Secteurs', ico: 'pi' },
    donut: { name: 'Anneau', ico: 'target' }
  };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = (v, unit) => {
    if (v === null || v === undefined || isNaN(v)) return '';
    const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('fr-FR') : (Math.round(v * 100) / 100).toLocaleString('fr-FR');
    return s + (unit ? (unit === '%' ? ' %' : ' ' + unit) : '');
  };

  function defaults() {
    return { ck: 'bar', title: '', labels: ['T1', 'T2', 'T3', 'T4'], series: [{ name: 'Série 1', data: [12, 19, 7, 15] }], opts: { legend: true, values: false } };
  }
  const colorOf = (s, i) => s.color || PALETTE[i % PALETTE.length];

  /* « joli » pas d'axe */
  function niceTicks(min, max, n = 5) {
    if (!(max > min)) { max = min + 1; }
    const raw = (max - min) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { lo, hi, ticks };
  }

  function svg(b, { plain = false } = {}) {
    const ck = TYPES[b.ck] ? b.ck : 'bar';
    const ink = plain ? '#1a1a1a' : 'var(--ink)', ink2 = plain ? '#5f6368' : 'var(--ink-2)', hair = plain ? '#d5d8dc' : 'var(--border)', paper = plain ? '#ffffff' : 'var(--paper)';
    const font = plain ? 'Arial, Helvetica, sans-serif' : 'var(--font-ui)';
    const labels = Array.isArray(b.labels) ? b.labels : [];
    const series = (Array.isArray(b.series) ? b.series : []).filter(s => s && Array.isArray(s.data));
    const opts = b.opts || {};
    let out = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="${font}" font-size="12">`;
    if (plain) out += `<rect width="${W}" height="${H}" fill="${paper}"/>`;
    let top = 14;
    if (b.title) { out += `<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="600" fill="${ink}">${esc(b.title)}</text>`; top = 40; }
    const showLegend = opts.legend !== false && series.length > 1 && ck !== 'pie' && ck !== 'donut';
    if (showLegend) {
      let x = 40;
      let leg = '';
      series.forEach((s, i) => { const name = s.name || 'Série ' + (i + 1); leg += `<rect x="${x}" y="${top + 2}" width="11" height="11" rx="2" fill="${colorOf(s, i)}"/><text x="${x + 15}" y="${top + 12}" fill="${ink2}">${esc(name)}</text>`; x += 22 + name.length * 6.6 + 14; });
      out += leg; top += 24;
    }
    if (!labels.length || !series.length) return out + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${ink2}">Aucune donnée — cliquer sur « Données… »</text></svg>`;

    if (ck === 'pie' || ck === 'donut') {
      const s = series[0]; const data = labels.map((_, i) => Math.max(0, +s.data[i] || 0)); const tot = data.reduce((a, v) => a + v, 0) || 1;
      const cx = 230, cy = top + (H - top) / 2, R = Math.min(130, (H - top) / 2 - 16), r0 = ck === 'donut' ? R * 0.55 : 0;
      let a0 = -Math.PI / 2;
      data.forEach((v, i) => {
        if (!v) return;
        const a1 = a0 + v / tot * 2 * Math.PI, big = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a, rr) => `${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`;
        const d = r0 ? `M${p(a0, R)} A${R} ${R} 0 ${big} 1 ${p(a1, R)} L${p(a1, r0)} A${r0} ${r0} 0 ${big} 0 ${p(a0, r0)} Z` : `M${cx} ${cy} L${p(a0, R)} A${R} ${R} 0 ${big} 1 ${p(a1, R)} Z`;
        out += `<path d="${d}" fill="${colorOf({ color: (s.colors || [])[i] }, i)}" stroke="${paper}" stroke-width="1.5"/>`;
        const am = (a0 + a1) / 2, pct = v / tot * 100;
        if (pct >= 4) out += `<text x="${(cx + (r0 ? (R + r0) / 2 : R * 0.62) * Math.cos(am)).toFixed(1)}" y="${(cy + (r0 ? (R + r0) / 2 : R * 0.62) * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#fff">${Math.round(pct)} %</text>`;
        a0 = a1;
      });
      if (r0 && opts.values !== false) out += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="600" fill="${ink}">${fmt(tot, opts.unit)}</text>`;
      let ly = top + 18;
      labels.forEach((l, i) => { out += `<rect x="400" y="${ly - 10}" width="11" height="11" rx="2" fill="${colorOf({ color: (s.colors || [])[i] }, i)}"/><text x="416" y="${ly}" fill="${ink}">${esc(l)}</text><text x="620" y="${ly}" text-anchor="end" fill="${ink2}">${fmt(data[i], opts.unit)}${data[i] ? ` · ${Math.round(data[i] / tot * 100)} %` : ''}</text>`; ly += 20; });
      return out + '</svg>';
    }

    const horizontal = ck === 'hbar';
    const stack = !!opts.stack && (ck === 'bar' || ck === 'hbar' || ck === 'area');
    const ML = horizontal ? 24 + Math.min(150, Math.max(...labels.map(l => String(l).length)) * 6.8) : 54, MR = 20, MT = top + 10, MB = 40;
    const PW = W - ML - MR, PH = H - MT - MB;
    let vmin = 0, vmax = 0;
    for (let i = 0; i < labels.length; i++) {
      if (stack) { let pos = 0, neg = 0; series.forEach(s => { const v = +s.data[i] || 0; if (v >= 0) pos += v; else neg += v; }); vmax = Math.max(vmax, pos); vmin = Math.min(vmin, neg); }
      else series.forEach(s => { const v = +s.data[i]; if (isFinite(v)) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); } });
    }
    if (isFinite(+opts.ymin)) vmin = +opts.ymin; if (isFinite(+opts.ymax)) vmax = +opts.ymax;
    const nt = niceTicks(vmin, vmax);
    const lo = nt.lo, hi = nt.hi === nt.lo ? nt.lo + 1 : nt.hi;
    const val2px = v => horizontal ? ML + (v - lo) / (hi - lo) * PW : MT + PH - (v - lo) / (hi - lo) * PH;
    // grille + graduations
    nt.ticks.forEach(t => {
      if (horizontal) out += `<line x1="${val2px(t).toFixed(1)}" y1="${MT}" x2="${val2px(t).toFixed(1)}" y2="${MT + PH}" stroke="${hair}" stroke-width="${t === 0 ? 1.2 : 0.7}"/><text x="${val2px(t).toFixed(1)}" y="${MT + PH + 16}" text-anchor="middle" fill="${ink2}" font-size="11">${fmt(t, opts.unit)}</text>`;
      else out += `<line x1="${ML}" y1="${val2px(t).toFixed(1)}" x2="${ML + PW}" y2="${val2px(t).toFixed(1)}" stroke="${hair}" stroke-width="${t === 0 ? 1.2 : 0.7}"/><text x="${ML - 8}" y="${(val2px(t) + 4).toFixed(1)}" text-anchor="end" fill="${ink2}" font-size="11">${fmt(t, opts.unit)}</text>`;
    });
    const n = labels.length, slot = (horizontal ? PH : PW) / n;
    // étiquettes de catégories
    labels.forEach((l, i) => {
      const c = (horizontal ? MT : ML) + slot * (i + 0.5);
      if (horizontal) out += `<text x="${ML - 8}" y="${(c + 4).toFixed(1)}" text-anchor="end" fill="${ink}" font-size="11.5">${esc(l)}</text>`;
      else {
        const txt = String(l);
        const rot = n > 8 || txt.length > 12;
        out += rot ? `<text transform="translate(${c.toFixed(1)} ${MT + PH + 8}) rotate(-35)" text-anchor="end" fill="${ink}" font-size="11">${esc(txt.slice(0, 22))}</text>` : `<text x="${c.toFixed(1)}" y="${MT + PH + 18}" text-anchor="middle" fill="${ink}" font-size="11.5">${esc(txt)}</text>`;
      }
    });
    if (ck === 'bar' || ck === 'hbar') {
      const gw = slot * 0.72, bw = stack ? gw : gw / series.length;
      for (let i = 0; i < n; i++) {
        let posAcc = 0, negAcc = 0;
        series.forEach((s, k) => {
          const v = +s.data[i]; if (!isFinite(v)) return;
          const base = stack ? (v >= 0 ? posAcc : negAcc) : 0;
          const a = val2px(base), z = val2px(base + v);
          const c0 = (horizontal ? MT : ML) + slot * i + (slot - gw) / 2 + (stack ? 0 : k * bw);
          const fill = colorOf(s, k);
          if (horizontal) out += `<rect x="${Math.min(a, z).toFixed(1)}" y="${c0.toFixed(1)}" width="${Math.abs(z - a).toFixed(1)}" height="${bw.toFixed(1)}" fill="${fill}" rx="2"/>`;
          else out += `<rect x="${c0.toFixed(1)}" y="${Math.min(a, z).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(z - a).toFixed(1)}" fill="${fill}" rx="2"/>`;
          if (opts.values) {
            if (horizontal) out += `<text x="${(Math.max(a, z) + 4).toFixed(1)}" y="${(c0 + bw / 2 + 4).toFixed(1)}" fill="${ink}" font-size="10.5">${fmt(v, opts.unit)}</text>`;
            else out += `<text x="${(c0 + bw / 2).toFixed(1)}" y="${(Math.min(a, z) - 4).toFixed(1)}" text-anchor="middle" fill="${ink}" font-size="10.5">${fmt(v, opts.unit)}</text>`;
          }
          if (stack) { if (v >= 0) posAcc += v; else negAcc += v; }
        });
      }
    } else {
      // courbes / aires
      let acc = new Array(n).fill(0);
      series.forEach((s, k) => {
        const pts = [];
        for (let i = 0; i < n; i++) { const v = +s.data[i]; if (!isFinite(v)) { pts.push(null); continue; } const y = stack ? acc[i] + v : v; pts.push([ML + slot * (i + 0.5), val2px(y), v, y]); if (stack) acc[i] = y; }
        const fill = colorOf(s, k);
        let d = '', started = false;
        pts.forEach(p => { if (!p) { started = false; return; } d += (started ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); started = true; });
        if (ck === 'area' && d) {
          const first = pts.find(Boolean), last = [...pts].reverse().find(Boolean);
          out += `<path d="${d} L${last[0].toFixed(1)} ${val2px(stack ? acc[pts.indexOf(last)] - last[2] : 0).toFixed(1)} L${first[0].toFixed(1)} ${val2px(stack ? 0 : 0).toFixed(1)} Z" fill="${fill}" opacity="${stack ? 0.55 : 0.18}" stroke="none"/>`;
        }
        out += `<path d="${d}" fill="none" stroke="${fill}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
        pts.forEach(p => { if (!p) return; out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${paper}" stroke="${fill}" stroke-width="2"/>`; if (opts.values) out += `<text x="${p[0].toFixed(1)}" y="${(p[1] - 8).toFixed(1)}" text-anchor="middle" fill="${ink}" font-size="10.5">${fmt(p[2], opts.unit)}</text>`; });
      });
    }
    // axes
    out += horizontal ? `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + PH}" stroke="${ink2}" stroke-width="1"/>` : `<line x1="${ML}" y1="${MT + PH}" x2="${ML + PW}" y2="${MT + PH}" stroke="${ink2}" stroke-width="1"/>`;
    return out + '</svg>';
  }

  /* ---------- données ↔ texte tabulaire (collage depuis Excel / Sheets : tabulations) ---------- */
  function toText(b) {
    const series = b.series || [], labels = b.labels || [];
    const head = ['', ...series.map((s, i) => s.name || 'Série ' + (i + 1))].join('\t');
    const rows = labels.map((l, i) => [l, ...series.map(s => { const v = s.data[i]; return v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','); })].join('\t'));
    return [head, ...rows].join('\n');
  }
  const num = s => { const t = String(s ?? '').trim().replace(/\s/g, '').replace(/%$/, ''); if (!t) return null; const v = parseFloat(t.replace(',', '.')); return isFinite(v) ? v : null; };
  function parseText(text, prev) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    if (!lines.length) return null;
    const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : (lines[0].split(',').length > 2 && !/\d,\d/.test(lines[0]) ? ',' : (lines[0].includes(';') ? ';' : /\t/.test(text) ? '\t' : ';'));
    const cells = lines.map(l => l.split(sep).map(c => c.trim()));
    const nc = Math.max(...cells.map(r => r.length));
    if (nc < 2) return null;
    // première ligne = noms de séries si sa 2e colonne n'est pas un nombre
    const hasHead = num(cells[0][1]) === null && cells.length > 1;
    const names = hasHead ? cells[0].slice(1) : [];
    const body = hasHead ? cells.slice(1) : cells;
    const labels = body.map(r => r[0]);
    const series = [];
    for (let c = 1; c < nc; c++) {
      const data = body.map(r => num(r[c]));
      if (data.every(v => v === null) && !names[c - 1]) continue;
      const old = prev && prev.series && prev.series[c - 1];
      series.push(Object.assign({}, old && old.color ? { color: old.color } : {}, { name: names[c - 1] || (old && old.name) || 'Série ' + c, data }));
    }
    if (!series.length) return null;
    return { labels, series };
  }

  return { W, H, TYPES, PALETTE, defaults, svg, toText, parseText };
})();
