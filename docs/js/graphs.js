/* ============================================================
   Alixo — gabarits de graphiques économiques
   Objets vectoriels SVG, éditables (courbes déplaçables au doigt).
   ============================================================ */
(function () {
  const W = 460, H = 320, ML = 46, MR = 26, MT = 24, MB = 40;
  const PW = W - ML - MR, PH = H - MT - MB;

  // domaine logique 0..100 sur les deux axes
  const X = q => ML + (q / 100) * PW;
  const Y = v => MT + PH - (v / 100) * PH;

  const INK = 'var(--ink)', INK3 = 'var(--ink-3)', HAIR = 'var(--hair)';

  function axes(xLabel, yLabel) {
    return `
      <line x1="${ML}" y1="${MT + PH}" x2="${ML + PW + 10}" y2="${MT + PH}" stroke="${INK}" stroke-width="1.4"/>
      <line x1="${ML}" y1="${MT + PH}" x2="${ML}" y2="${MT - 8}" stroke="${INK}" stroke-width="1.4"/>
      <path d="M${ML + PW + 10} ${MT + PH} l-7 -3.5 v7 z" fill="${INK}" stroke="none"/>
      <path d="M${ML} ${MT - 8} l-3.5 7 h7 z" fill="${INK}" stroke="none"/>
      <text x="${ML + PW + 8}" y="${MT + PH + 18}" font-size="13" font-style="italic" fill="${INK}">${xLabel}</text>
      <text x="${ML - 12}" y="${MT - 10}" font-size="13" font-style="italic" fill="${INK}" text-anchor="end">${yLabel}</text>
      <text x="${ML - 6}" y="${MT + PH + 15}" font-size="11" fill="${INK3}" text-anchor="end">0</text>`;
  }

  function linePath(fn, x0 = 2, x1 = 98, n = 60) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const x = x0 + (i / n) * (x1 - x0);
      let y = fn(x);
      if (!isFinite(y)) continue;
      y = Math.max(-30, Math.min(130, y));
      d += (d ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1);
    }
    return d;
  }

  function curveEl(id, d, color, label, labelPos, draggable) {
    const lp = labelPos || null;
    return `<g class="${draggable ? 'gcurve' : ''}" data-curve="${id}" style="color:${color}">
      <path d="${d}" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      ${draggable ? `<path d="${d}" stroke="transparent" stroke-width="16" fill="none"/>` : ''}
      ${lp ? `<text x="${lp[0]}" y="${lp[1]}" font-size="13.5" font-weight="600" font-style="italic" fill="${color}" stroke="none">${label}</text>` : ''}
    </g>`;
  }

  function eqPoint(q, v, name, color) {
    return `
      <line x1="${ML}" y1="${Y(v)}" x2="${X(q)}" y2="${Y(v)}" stroke="${INK3}" stroke-width="1" stroke-dasharray="4 4"/>
      <line x1="${X(q)}" y1="${MT + PH}" x2="${X(q)}" y2="${Y(v)}" stroke="${INK3}" stroke-width="1" stroke-dasharray="4 4"/>
      <circle cx="${X(q)}" cy="${Y(v)}" r="4.2" fill="${color || INK}" stroke="var(--paper)" stroke-width="1.5"/>
      <text x="${X(q) + 8}" y="${Y(v) - 8}" font-size="13" font-weight="650" font-style="italic" fill="${color || INK}">${name}</text>
      <text x="${ML - 5}" y="${Y(v) + 4}" font-size="11" fill="${INK3}" text-anchor="end">${name.replace('E', 'P')}</text>
      <text x="${X(q)}" y="${MT + PH + 15}" font-size="11" fill="${INK3}" text-anchor="middle">${name.replace('E', 'Q')}</text>`;
  }

  function svgWrap(inner) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="var(--font-serif)">${inner}</svg>`;
  }

  /* ---------- moteur « deux droites » (offre/demande, IS-LM, AS-AD) ---------- */
  function twoCurves(cfg, params) {
    const s1 = params.s1 || 0, s2 = params.s2 || 0;
    const f1 = x => cfg.c1.a + s1 + cfg.c1.b * x;
    const f2 = x => cfg.c2.a + s2 + cfg.c2.b * x;
    const f1o = x => cfg.c1.a + cfg.c1.b * x;
    const f2o = x => cfg.c2.a + cfg.c2.b * x;

    // équilibre
    const qe = (cfg.c2.a + s2 - cfg.c1.a - s1) / (cfg.c1.b - cfg.c2.b);
    const pe = f1(qe);
    const qo = (cfg.c2.a - cfg.c1.a) / (cfg.c1.b - cfg.c2.b);
    const po = f1o(qo);
    const moved = Math.abs(s1) > 0.5 || Math.abs(s2) > 0.5;

    let ghost = '';
    if (moved) {
      if (Math.abs(s1) > 0.5) ghost += `<path d="${linePath(f1o)}" stroke="${cfg.c1.color}" stroke-width="1.6" fill="none" stroke-dasharray="5 5" opacity=".45"/>`;
      if (Math.abs(s2) > 0.5) ghost += `<path d="${linePath(f2o)}" stroke="${cfg.c2.color}" stroke-width="1.6" fill="none" stroke-dasharray="5 5" opacity=".45"/>`;
    }

    let surplus = '';
    if (params.surplus && qe > 0 && qe < 100) {
      // surplus consommateur : entre la demande (décroissante) et le prix d'équilibre
      const dem = cfg.c1.b < 0 ? { f: f1, col: cfg.c1.color } : { f: f2, col: cfg.c2.color };
      const off = cfg.c1.b < 0 ? { f: f2, col: cfg.c2.color } : { f: f1, col: cfg.c1.color };
      let up = `M${X(0)} ${Y(Math.min(dem.f(0), 100))}`;
      for (let x = 0; x <= qe; x += qe / 24) up += `L${X(x)} ${Y(Math.min(dem.f(x), 100))}`;
      up += `L${X(qe)} ${Y(pe)} L${X(0)} ${Y(pe)} Z`;
      let low = `M${X(0)} ${Y(Math.max(off.f(0), 0))}`;
      for (let x = 0; x <= qe; x += qe / 24) low += `L${X(x)} ${Y(Math.max(off.f(x), 0))}`;
      low += `L${X(qe)} ${Y(pe)} L${X(0)} ${Y(pe)} Z`;
      surplus = `<path d="${up}" fill="${dem.col}" opacity=".16" stroke="none"/>
                 <path d="${low}" fill="${off.col}" opacity=".16" stroke="none"/>`;
    }

    const inner = axes(cfg.x, cfg.y) + surplus + ghost +
      curveEl('c1', linePath(f1), cfg.c1.color, cfg.c1.label + (Math.abs(s1) > 0.5 ? '′' : ''), [X(96), Y(f1(96)) - 8], true) +
      curveEl('c2', linePath(f2), cfg.c2.color, cfg.c2.label + (Math.abs(s2) > 0.5 ? '′' : ''), [X(96), Y(f2(96)) - 8], true) +
      (moved && qo > 0 && qo < 100 ? eqPoint(qo, po, 'E', INK3) : '') +
      (qe > 0 && qe < 100 ? eqPoint(qe, pe, moved ? 'E′' : 'E', INK) : '');
    return svgWrap(inner);
  }

  /* ---------- familles de courbes statiques ---------- */
  function multiFn(cfg) {
    let inner = axes(cfg.x, cfg.y);
    for (const c of cfg.fns) {
      const d = linePath(c.f, c.x0 || 2, c.x1 || 98);
      inner += curveEl(c.label, d, c.color, c.label, c.at ? [X(c.at[0]), Y(c.at[1])] : null, false);
    }
    if (cfg.extra) inner += cfg.extra;
    return svgWrap(inner);
  }

  /* ---------- traceur de fonctions ---------- */
  function safeFn(expr) {
    if (!expr || !expr.trim()) return null;
    let e = expr.trim();
    const m = e.match(/^[A-Za-z_][A-Za-z_0-9]*\s*=\s*(.+)$/); // "Qd = 100 - 2P" → membre droit
    if (m) e = m[1];
    e = e.replace(/\^/g, '**')
         .replace(/(\d)\s*([a-zA-Z(])/g, '$1*$2')     // 2P → 2*P
         .replace(/\)\s*\(/g, ')*(');
    e = e.replace(/\b(sqrt|ln|log|exp|abs|cos|sin|tan)\b/g, 'Math.$1')
         .replace(/Math\.ln/g, 'Math.log');
    if (/[^0-9a-zA-Z+\-*/().,\s_%]/.test(e.replace(/Math\./g, ''))) return null;
    try {
      const f = new Function('x', `"use strict"; const P=x,Q=x,Y=x,q=x,p=x,y=x,t=x,r=x,L=x,K=x; return (${e});`);
      f(10); // test
      return f;
    } catch { return null; }
  }

  function plotter(params) {
    const f1 = safeFn(params.f1), f2 = safeFn(params.f2);
    let inner = axes('x', 'y');
    if (!f1 && !f2) {
      inner += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="13.5" fill="${INK3}">Saisir une fonction ci-dessous, ex. « Qd = 100 − 2P »</text>`;
      return svgWrap(inner);
    }
    if (f1) inner += curveEl('f1', linePath(f1), 'var(--c-demand)', params.f1.split('=')[0].trim() || 'f₁', [X(88), Y(Math.max(4, Math.min(96, f1(88)))) - 10], false);
    if (f2) inner += curveEl('f2', linePath(f2), 'var(--c-supply)', params.f2.split('=')[0].trim() || 'f₂', [X(88), Y(Math.max(4, Math.min(96, f2(88)))) + 18], false);
    if (f1 && f2) {
      // intersection par balayage + resserrement
      let prev = null, root = null;
      for (let x = 0.5; x <= 99.5; x += 0.25) {
        const d = f1(x) - f2(x);
        if (prev !== null && isFinite(d) && isFinite(prev.d) && Math.sign(d) !== Math.sign(prev.d)) {
          let lo = prev.x, hi = x;
          for (let k = 0; k < 40; k++) {
            const mid = (lo + hi) / 2;
            if (Math.sign(f1(mid) - f2(mid)) === Math.sign(f1(lo) - f2(lo))) lo = mid; else hi = mid;
          }
          root = (lo + hi) / 2; break;
        }
        prev = { x, d };
      }
      if (root !== null) {
        const yv = f1(root);
        if (yv > 0 && yv < 100 && root > 0 && root < 100) {
          inner += eqPoint(root, yv, 'E', INK);
          inner += `<text x="${X(root) + 8}" y="${Y(yv) + 16}" font-size="11.5" fill="${INK3}">(${root.toFixed(1)} ; ${yv.toFixed(1)})</text>`;
        }
      }
    }
    return svgWrap(inner);
  }

  /* ---------- catalogue des gabarits ---------- */
  const CD = 'var(--c-demand)', CS = 'var(--c-supply)', CT = 'var(--c-third)';

  const TYPES = {
    offredemande: {
      name: 'Offre / Demande', engine: 'two',
      cfg: { x: 'Q', y: 'P', c1: { label: 'D', a: 88, b: -0.85, color: CD }, c2: { label: 'O', a: 10, b: 0.85, color: CS } }
    },
    islm: {
      name: 'IS-LM', engine: 'two',
      cfg: { x: 'Y', y: 'i', c1: { label: 'IS', a: 90, b: -0.8, color: CD }, c2: { label: 'LM', a: 8, b: 0.75, color: CT } }
    },
    asad: {
      name: 'AS-AD (offre / demande globales)', engine: 'two',
      cfg: { x: 'Y', y: 'P', c1: { label: 'AD', a: 92, b: -0.9, color: CD }, c2: { label: 'AS', a: 12, b: 0.8, color: CS } }
    },
    couts: {
      name: 'Courbes de coûts (CM, Cm, CVM)', engine: 'fn',
      cfg: {
        x: 'Q', y: '€', fns: [
          { label: 'Cm', f: x => 0.045 * (x - 34) * (x - 34) + 10, color: CD, at: [88, 92] },
          { label: 'CM', f: x => 0.02 * (x - 52) * (x - 52) + 24, color: CT, at: [88, 55] },
          { label: 'CVM', f: x => 0.02 * (x - 45) * (x - 45) + 16, color: CS, at: [88, 44] }
        ]
      }
    },
    indiff: {
      name: 'Courbes d’indifférence + budget', engine: 'fn',
      cfg: {
        x: 'x', y: 'y', fns: [
          { label: 'U₁', f: x => 700 / x, color: CS, x0: 8, at: [80, 12] },
          { label: 'U₂', f: x => 1400 / x, color: CS, x0: 15, at: [80, 22] },
          { label: 'U₃', f: x => 2400 / x, color: CS, x0: 26, at: [80, 34] },
          { label: 'Budget', f: x => 75 - 0.78 * x, color: CD, at: [58, 36] }
        ],
        extra: eqPoint(37.5, 45.6, 'E', INK)
      }
    },
    fpp: {
      name: 'Frontière des possibilités de production', engine: 'fn',
      cfg: {
        x: 'Bien A', y: 'Bien B',
        fns: [{ label: 'FPP', f: x => 88 * Math.sqrt(Math.max(0, 1 - (x / 92) ** 2)), color: CT, x0: 0, x1: 92, at: [55, 72] }],
        extra: `<circle cx="${X(45)}" cy="${Y(55)}" r="3.5" fill="${INK3}" stroke="none"/><text x="${X(45) + 7}" y="${Y(55) + 4}" font-size="12" fill="${INK3}">inefficace</text>`
      }
    },
    phillips: {
      name: 'Courbe de Phillips', engine: 'fn',
      cfg: { x: 'Chômage u', y: 'Inflation π', fns: [{ label: 'Phillips', f: x => 4 + 260 / (x + 2), color: CD, x0: 3, at: [70, 16] }] }
    },
    laffer: {
      name: 'Courbe de Laffer', engine: 'fn',
      cfg: {
        x: 'Taux t', y: 'Recettes',
        fns: [{ label: '', f: x => x * (100 - x) / 29, color: CT, x0: 0, x1: 100 }],
        extra: `<line x1="${X(50)}" y1="${MT + PH}" x2="${X(50)}" y2="${Y(86.2)}" stroke="${INK3}" stroke-width="1" stroke-dasharray="4 4"/><text x="${X(50)}" y="${MT + PH + 15}" font-size="11.5" fill="${INK3}" text-anchor="middle">t*</text>`
      }
    },
    lorenz: {
      name: 'Courbe de Lorenz (Gini)', engine: 'fn',
      cfg: {
        x: '% population', y: '% revenu',
        fns: [
          { label: 'Égalité', f: x => x, color: CS, x0: 0, x1: 100, at: [40, 48] },
          { label: 'Lorenz', f: x => 100 * (x / 100) ** 2.3, color: CD, x0: 0, x1: 100, at: [72, 30] }
        ],
        extra: (() => {
          let d = `M${X(0)} ${Y(0)}`;
          for (let x = 0; x <= 100; x += 4) d += `L${X(x)} ${Y(x)}`;
          for (let x = 100; x >= 0; x -= 4) d += `L${X(x)} ${Y(100 * (x / 100) ** 2.3)}`;
          return `<path d="${d}Z" fill="${CT}" opacity=".13" stroke="none"/><text x="${X(56)}" y="${Y(38)}" font-size="12" fill="${INK3}">aire → Gini</text>`;
        })()
      }
    },
    plot: { name: 'Traceur de fonctions', engine: 'plot' }
  };

  function renderSVG(gtype, params) {
    const t = TYPES[gtype];
    if (!t) return svgWrap(axes('x', 'y'));
    if (t.engine === 'two') return twoCurves(t.cfg, params || {});
    if (t.engine === 'fn') return multiFn(t.cfg);
    if (t.engine === 'plot') return plotter(params || {});
    return svgWrap(axes('x', 'y'));
  }

  // vignette pour la palette
  function thumb(gtype) {
    return renderSVG(gtype, gtype === 'plot' ? { f1: '80 - 0.8x', f2: '10 + 0.7x' } : {});
  }

  window.AlixoGraphs = { TYPES, renderSVG, thumb, pxPerUnitY: PH / 100 };
})();
