/* ============================================================
   Alixo — bloc « Dessin » (façon Google Docs) : formes, traits,
   flèches, zones de texte, main levée. Le dessin est un objet du
   cours : { type: 'draw', h, shapes: [...] }, rendu en SVG (largeur
   logique 640, mise à l'échelle sur la feuille) et rasterisé à
   l'export. S'appuie sur les globales d'app.js (getBlock, touch,
   selectObj, objSel, blocksEl, uid, esc, openPalettePopover…).
   Forme : { id, t, stroke, fill, sw, ls (solid|dash|dot), op (opacité 0.25-1), x,y,w,h | x1,y1,x2,y2 | pts,
             text (zone de texte) | label (texte dans une forme), fs, color, bold, ta (left|center|right), border }
   1.21 : copier / couper / coller les formes (Ctrl+C / X / V, d'un dessin à l'autre), texte dans les formes
   (double-clic ou Entrée), nouvelles formes (pentagone, parallélogramme, cylindre, bulle), opacité, grille
   magnétique, alignement sur la feuille, ordre avancer / reculer, Maj = proportions, Tab = forme suivante,
   Alt+flèches = redimensionner, barre d'outils accessible (rôles ARIA, états), style rafraîchi.
   ============================================================ */
window.AlixoDraw = (() => {
  'use strict';
  const W = 640;                       // largeur logique du dessin
  const FONT = 'Arial, Helvetica, sans-serif';
  const GRID = 10;                     // pas de la grille magnétique
  const I = {
    select: '<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-2 6Z"/></svg>',
    rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',
    rrect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="4"/></svg>',
    ellipse: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
    triangle: '<svg viewBox="0 0 24 24"><path d="M12 5l8 14H4Z"/></svg>',
    diamond: '<svg viewBox="0 0 24 24"><path d="M12 4l8 8-8 8-8-8Z"/></svg>',
    pentagon: '<svg viewBox="0 0 24 24"><path d="M12 3.5l8.5 6.2-3.2 10H6.7l-3.2-10Z"/></svg>',
    hexagon: '<svg viewBox="0 0 24 24"><path d="M8 5h8l4 7-4 7H8l-4-7Z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7Z"/></svg>',
    para: '<svg viewBox="0 0 24 24"><path d="M8 6h13l-5 12H3Z"/></svg>',
    cylinder: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/></svg>',
    bubble: '<svg viewBox="0 0 24 24"><path d="M4 5h16v10H10l-4 4v-4H4Z"/></svg>',
    line: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5M11 5h8v8"/></svg>',
    darrow: '<svg viewBox="0 0 24 24"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M6 6h12M12 6v13M9 19h6"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20c3-8 6-11 9-11s1 8 4 8 3-6 3-6"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    front: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="11" rx="1.5"/><rect x="9" y="9" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".25"/></svg>',
    back: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1.5"/><rect x="4" y="4" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".25"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 12l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v13M6 12l6 6 6-6"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
    paste: '<svg viewBox="0 0 24 24"><path d="M9 4h6v3H9ZM7 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M9 12h6M9 16h4"/></svg>',
    border: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 12h8"/></svg>',
    label: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M12 10v6M10 16h4"/></svg>',
    alL: '<svg viewBox="0 0 24 24"><path d="M4 3v18M8 7h10v4H8ZM8 13h6v4H8Z"/></svg>',
    alC: '<svg viewBox="0 0 24 24"><path d="M12 3v18M6 7h12v4H6ZM8 13h8v4H8Z"/></svg>',
    alR: '<svg viewBox="0 0 24 24"><path d="M20 3v18M6 7h10v4H6ZM10 13h6v4h-6Z"/></svg>',
    alT: '<svg viewBox="0 0 24 24"><path d="M3 4h18M7 8h4v10H7ZM13 8h4v6h-4Z"/></svg>',
    alM: '<svg viewBox="0 0 24 24"><path d="M3 12h18M7 6h4v12H7ZM13 8h4v8h-4Z"/></svg>',
    alB: '<svg viewBox="0 0 24 24"><path d="M3 20h18M7 6h4v10H7ZM13 10h4v6h-4Z"/></svg>',
    solid: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/></svg>',
    dash: '<svg viewBox="0 0 24 24"><path d="M3 12h4M10 12h4M17 12h4"/></svg>',
    dot: '<svg viewBox="0 0 24 24" stroke-dasharray="1 3"><path d="M3 12h18"/></svg>'
  };
  const TOOLS = [
    ['select', 'Sélection (V) — déplacer, redimensionner'],
    ['rect', 'Rectangle (R)'], ['rrect', 'Rectangle arrondi'], ['ellipse', 'Ellipse (O)'], ['triangle', 'Triangle'], ['diamond', 'Losange'],
    ['pentagon', 'Pentagone'], ['hexagon', 'Hexagone'], ['star', 'Étoile'], ['para', 'Parallélogramme'], ['cylinder', 'Cylindre (base de données)'], ['bubble', 'Bulle de dialogue'],
    ['line', 'Trait (L)'], ['arrow', 'Flèche (A)'], ['darrow', 'Double flèche'],
    ['text', 'Zone de texte (T)'], ['pen', 'Main levée (P)']
  ];
  const TOOL_KEYS = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', t: 'text', p: 'pen' };
  const POLY_TYPES = ['triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'para'];
  const BOX_TOOLS = ['rect', 'rrect', 'ellipse', ...POLY_TYPES, 'cylinder', 'bubble', 'text'];
  const LABEL_TYPES = BOX_TOOLS.filter(t => t !== 'text');   // formes qui peuvent porter un texte
  const LINE_TYPES = ['line', 'arrow', 'darrow'];
  const STROKE_QUICK = ['#202124', '#6b6b6b', '#c04343', '#d06a3a', '#b8952e', '#2e8b6a', '#2e8b8b', '#3d6bb5', '#8c4351', '#a8556f', '#ffffff'];
  const FILL_QUICK = ['none', '#ffffff', '#fff3bf', '#ffe8cc', '#ffd8d8', '#ffdeeb', '#d3f9d8', '#c3fae8', '#d0ebff', '#e5dbff', '#e9ecef', '#202124'];
  const OPACITIES = [1, 0.75, 0.5, 0.25];
  /* réglages courants (conservés d'un dessin à l'autre) */
  const st = { tool: 'select', stroke: '#202124', fill: 'none', sw: 2, fs: 16, ls: 'solid', bold: false, ta: 'left', grid: false };
  let ctx = null;   // { id, sel: id de forme, drag, textEdit }
  let clip = null;  // dernière forme copiée (secours si le presse-papiers système n'est pas lisible)

  const mctx = document.createElement('canvas').getContext('2d');
  function measure(t, fs, bold) { mctx.font = `${bold ? 'bold ' : ''}${fs}px ${FONT}`; return mctx.measureText(t).width; }
  /* découpe un texte en lignes qui tiennent dans maxW */
  function wrapLines(text, fs, maxW, bold) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/(\s+)/); let line = '';
      for (const w of words) {
        if (!w) continue;
        const cand = line + w;
        if (line && !/^\s+$/.test(w) && measure(cand, fs, bold) > maxW) { out.push(line.replace(/\s+$/, '')); line = w.replace(/^\s+/, ''); }
        else line = cand;
      }
      out.push(line.replace(/\s+$/, ''));
    }
    return out;
  }
  const n1 = v => (Math.round(v * 10) / 10).toString();
  const shapes = b => (Array.isArray(b.shapes) ? b.shapes : (b.shapes = []));
  const blockEl = id => document.querySelector(`#blocks > .block.draw[data-id="${id}"]`);
  const heightOf = b => Math.max(80, Math.min(2000, +b.h || 300));
  const isLine = s => LINE_TYPES.includes(s.t);
  const canLabel = s => LABEL_TYPES.includes(s.t);
  const snap = v => st.grid ? Math.round(v / GRID) * GRID : v;
  /* encre lisible sur une couleur de fond */
  function inkOn(fill) {
    const m = String(fill || '').match(/^#([0-9a-f]{6})$/i); if (!m) return '#202124';
    const r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? '#ffffff' : '#202124';
  }

  /* ---------- géométrie ---------- */
  function bbox(s) {
    if (isLine(s)) return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    if (s.t === 'path') {
      const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  }
  function moveShape(s, dx, dy) {
    if (isLine(s)) { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
    else if (s.t === 'path') s.pts = s.pts.map(p => [p[0] + dx, p[1] + dy]);
    else { s.x += dx; s.y += dy; }
  }
  /* applique une nouvelle boîte englobante (redimensionnement) à partir de la forme d'origine */
  function fitShape(s, o, nb) {
    if (s.t === 'path') {
      const ob = bbox(o), sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
      s.pts = o.pts.map(p => [nb.x + (p[0] - ob.x) * sx, nb.y + (p[1] - ob.y) * sy]);
    } else if (isLine(s)) {
      const ob = bbox(o), sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
      s.x1 = nb.x + (o.x1 - ob.x) * sx; s.y1 = nb.y + (o.y1 - ob.y) * sy; s.x2 = nb.x + (o.x2 - ob.x) * sx; s.y2 = nb.y + (o.y2 - ob.y) * sy;
    } else { s.x = nb.x; s.y = nb.y; s.w = nb.w; s.h = nb.h; }
  }
  /* la forme reste dans la feuille ; le dessin s'allonge si besoin */
  function keepInside(s, b) {
    const bb = bbox(s);
    let dx = 0, dy = 0;
    if (bb.x + bb.w > W) dx = W - (bb.x + bb.w); if (bb.x + dx < 0) dx = -bb.x;
    if (bb.y < 0) dy = -bb.y;
    if (dx || dy) moveShape(s, dx, dy);
    const bb2 = bbox(s);
    if (bb2.y + bb2.h > heightOf(b)) b.h = Math.min(2000, Math.ceil(bb2.y + bb2.h + 10));
  }
  function arrowHead(x1, y1, x2, y2, sw) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const L = 9 + sw * 2.4, wd = 4 + sw * 1.4;
    const bx = x2 - L * Math.cos(a), by = y2 - L * Math.sin(a);
    return { base: [bx, by], pts: `${n1(x2)},${n1(y2)} ${n1(bx + wd * Math.sin(a))},${n1(by - wd * Math.cos(a))} ${n1(bx - wd * Math.sin(a))},${n1(by + wd * Math.cos(a))}` };
  }
  /* sommets des polygones inscrits dans la boîte */
  function polyPoints(s) {
    const { x, y, w, h } = s; const cx = x + w / 2, cy = y + h / 2;
    if (s.t === 'triangle') return [[cx, y], [x + w, y + h], [x, y + h]];
    if (s.t === 'diamond') return [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
    if (s.t === 'pentagon') { const pts = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([cx + w / 2 * Math.cos(a), cy + h / 2 * Math.sin(a)]); } return pts; }
    if (s.t === 'hexagon') return [[x + w / 4, y], [x + 3 * w / 4, y], [x + w, cy], [x + 3 * w / 4, y + h], [x + w / 4, y + h], [x, cy]];
    if (s.t === 'star') { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; pts.push([cx + r * w / 2 * Math.cos(a), cy + r * h / 2 * Math.sin(a)]); } return pts; }
    if (s.t === 'para') { const o = Math.min(w * 0.22, h * 0.6); return [[x + o, y], [x + w, y], [x + w - o, y + h], [x, y + h]]; }
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
  const dashOf = (ls, sw) => ls === 'dash' ? ` stroke-dasharray="${n1(sw * 4)} ${n1(sw * 3)}"` : ls === 'dot' ? ` stroke-dasharray="${n1(Math.max(1, sw))} ${n1(sw * 2.2)}"` : '';
  /* zone utile pour le texte d'une forme */
  function labelBox(s) {
    const { x, y, w, h } = s;
    if (s.t === 'bubble') return { x, y, w, h: h * 0.78 };
    if (s.t === 'triangle') return { x: x + w * 0.2, y: y + h * 0.4, w: w * 0.6, h: h * 0.55 };
    if (s.t === 'diamond') return { x: x + w * 0.2, y: y + h * 0.2, w: w * 0.6, h: h * 0.6 };
    if (s.t === 'ellipse') return { x: x + w * 0.12, y: y + h * 0.14, w: w * 0.76, h: h * 0.72 };
    if (s.t === 'star') return { x: x + w * 0.25, y: y + h * 0.3, w: w * 0.5, h: h * 0.45 };
    if (s.t === 'pentagon') return { x: x + w * 0.15, y: y + h * 0.25, w: w * 0.7, h: h * 0.65 };
    if (s.t === 'cylinder') return { x: x + w * 0.1, y: y + h * 0.2, w: w * 0.8, h: h * 0.65 };
    if (s.t === 'para') return { x: x + w * 0.18, y, w: w * 0.64, h };
    return { x, y, w, h };
  }

  /* ---------- rendu SVG ---------- */
  function textSVG(text, box, s, align, color) {
    const fs = +s.fs || (s.t === 'text' ? 16 : 14), pad = 6, lh = fs * 1.3;
    const lines = wrapLines(text, fs, Math.max(10, box.w - 2 * pad), s.bold);
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const tx = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w - pad : box.x + pad;
    const y0 = s.t === 'text' ? box.y + pad + fs * 0.92 : box.y + Math.max(pad, (box.h - lines.length * lh) / 2) + fs * 0.92;
    return `<text x="${n1(tx)}" y="${n1(y0)}" font-family="${FONT}" font-size="${fs}"${s.bold ? ' font-weight="bold"' : ''} fill="${color}" text-anchor="${anchor}" xml:space="preserve">${lines.map((l, i) => `<tspan x="${n1(tx)}" dy="${i ? n1(lh) : 0}">${esc(l) || ' '}</tspan>`).join('')}</text>`;
  }
  function shapeSVG(s, edit) {
    const sid = edit ? ` data-sid="${s.id}"` : '';
    const op = s.op && s.op < 1 ? ` opacity="${n1(s.op)}"` : '';
    const stroke = s.stroke || '#202124', sw = +s.sw || 2, fill = s.fill && s.fill !== 'none' ? s.fill : 'none';
    const fillAttr = fill === 'none' ? 'rgba(0,0,0,0.001)' : fill;
    const dash = dashOf(s.ls, sw);
    const hit = `stroke="rgba(0,0,0,0.001)" stroke-width="${Math.max(12, sw + 8)}"`;
    const common = `fill="${fillAttr}" stroke="${stroke}" stroke-width="${sw}"${dash}`;
    let inner = '';
    switch (s.t) {
      case 'rect': inner = `<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="1" ${common}/>`; break;
      case 'rrect': inner = `<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="${n1(Math.min(s.w, s.h) * 0.18)}" ${common}/>`; break;
      case 'ellipse': inner = `<ellipse cx="${n1(s.x + s.w / 2)}" cy="${n1(s.y + s.h / 2)}" rx="${n1(s.w / 2)}" ry="${n1(s.h / 2)}" ${common}/>`; break;
      case 'triangle': case 'diamond': case 'pentagon': case 'hexagon': case 'star': case 'para':
        inner = `<polygon points="${polyPoints(s).map(p => `${n1(p[0])},${n1(p[1])}`).join(' ')}" ${common} stroke-linejoin="round"/>`; break;
      case 'cylinder': {
        const rx = s.w / 2, ry = Math.max(2, Math.min(s.h / 6, s.w / 4));
        inner = `<path d="M${n1(s.x)},${n1(s.y + ry)} A${n1(rx)},${n1(ry)} 0 0 0 ${n1(s.x + s.w)},${n1(s.y + ry)} V${n1(s.y + s.h - ry)} A${n1(rx)},${n1(ry)} 0 0 1 ${n1(s.x)},${n1(s.y + s.h - ry)} Z" ${common}/><ellipse cx="${n1(s.x + rx)}" cy="${n1(s.y + ry)}" rx="${n1(rx)}" ry="${n1(ry)}" ${common}/>`; break;
      }
      case 'bubble': {
        const r = Math.max(2, Math.min(10, s.w / 4, s.h / 4)), yb = s.y + s.h * 0.78, x = s.x, y = s.y, w = s.w, h = s.h;
        inner = `<path d="M${n1(x + r)},${n1(y)} H${n1(x + w - r)} Q${n1(x + w)},${n1(y)} ${n1(x + w)},${n1(y + r)} V${n1(yb - r)} Q${n1(x + w)},${n1(yb)} ${n1(x + w - r)},${n1(yb)} H${n1(x + w * 0.36)} L${n1(x + w * 0.16)},${n1(y + h)} L${n1(x + w * 0.2)},${n1(yb)} H${n1(x + r)} Q${n1(x)},${n1(yb)} ${n1(x)},${n1(yb - r)} V${n1(y + r)} Q${n1(x)},${n1(y)} ${n1(x + r)},${n1(y)} Z" ${common} stroke-linejoin="round"/>`; break;
      }
      case 'line': inner = `<line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" ${hit}/><line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash}/>`; break;
      case 'arrow': {
        const h = arrowHead(s.x1, s.y1, s.x2, s.y2, sw);
        inner = `<line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" ${hit}/><line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(h.base[0])}" y2="${n1(h.base[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash}/><polygon points="${h.pts}" fill="${stroke}"/>`; break;
      }
      case 'darrow': {
        const h2 = arrowHead(s.x1, s.y1, s.x2, s.y2, sw), h1 = arrowHead(s.x2, s.y2, s.x1, s.y1, sw);
        inner = `<line x1="${n1(s.x1)}" y1="${n1(s.y1)}" x2="${n1(s.x2)}" y2="${n1(s.y2)}" ${hit}/><line x1="${n1(h1.base[0])}" y1="${n1(h1.base[1])}" x2="${n1(h2.base[0])}" y2="${n1(h2.base[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash}/><polygon points="${h2.pts}" fill="${stroke}"/><polygon points="${h1.pts}" fill="${stroke}"/>`; break;
      }
      case 'path': {
        if (!s.pts || s.pts.length < 2) return '';
        const d = 'M' + s.pts.map(p => `${n1(p[0])} ${n1(p[1])}`).join(' L');
        inner = `<path d="${d}" fill="none" ${hit}/><path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`; break;
      }
      case 'text': {
        const box = `<rect x="${n1(s.x)}" y="${n1(s.y)}" width="${n1(s.w)}" height="${n1(s.h)}" rx="2" fill="${fillAttr}" stroke="${s.border ? stroke : 'none'}" stroke-width="${sw}"${dash}/>`;
        inner = box + textSVG(s.text, s, s, s.ta || 'left', s.color || s.stroke || '#202124'); break;
      }
      default: return '';
    }
    if (s.label && canLabel(s)) inner += textSVG(s.label, labelBox(s), s, 'center', s.color || inkOn(s.fill));
    return `<g${sid}${op}>${inner}</g>`;
  }
  function handlesSVG(s) {
    const hs = [];
    const H = 9;
    const hd = (k, x, y, cur) => `<rect class="dh" data-h="${k}" x="${n1(x - H / 2)}" y="${n1(y - H / 2)}" width="${H}" height="${H}" rx="2" style="cursor:${cur}"/>`;
    if (isLine(s)) return hd('p1', s.x1, s.y1, 'move') + hd('p2', s.x2, s.y2, 'move');
    const b = bbox(s);
    hs.push(`<rect class="dsel" x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}"/>`);
    hs.push(hd('nw', b.x, b.y, 'nwse-resize'), hd('n', b.x + b.w / 2, b.y, 'ns-resize'), hd('ne', b.x + b.w, b.y, 'nesw-resize'),
      hd('e', b.x + b.w, b.y + b.h / 2, 'ew-resize'), hd('se', b.x + b.w, b.y + b.h, 'nwse-resize'), hd('s', b.x + b.w / 2, b.y + b.h, 'ns-resize'),
      hd('sw', b.x, b.y + b.h, 'nesw-resize'), hd('w', b.x, b.y + b.h / 2, 'ew-resize'));
    return hs.join('');
  }
  /* SVG complet ; plain : autonome (export, fond blanc, attributs de taille) */
  function svg(b, { edit = false, plain = false } = {}) {
    const h = heightOf(b);
    const sel = edit && ctx && ctx.id === b.id && ctx.sel ? shapes(b).find(s => s.id === ctx.sel) : null;
    const n = shapes(b).length;
    const grid = edit && st.grid ? `<defs><pattern id="dg-${b.id}" width="${GRID * 2}" height="${GRID * 2}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#c9ccd1"/></pattern></defs><rect class="dgrid" width="${W}" height="${h}" fill="url(#dg-${b.id})"/>` : '';
    return `<svg class="draw-svg" viewBox="0 0 ${W} ${h}"${plain ? ` xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}"` : ` role="img" aria-label="Dessin : ${n} forme${n > 1 ? 's' : ''}"`} preserveAspectRatio="xMinYMin meet">${plain ? `<rect width="${W}" height="${h}" fill="#fff"/>` : grid}${shapes(b).map(s => shapeSVG(s, edit)).join('')}${sel ? handlesSVG(sel) : ''}</svg>`;
  }
  const swatch = (c, cls, sel) => `<span class="dt-sw ${cls}${sel ? ' sel' : ''}${c === 'none' ? ' none' : ''}" style="background:${c === 'none' ? 'transparent' : c}"></span>`;
  const btn = (attrs, tip, inner, on) => `<button ${attrs} class="${on ? 'on' : ''}" title="${tip}" aria-label="${tip}"${on !== undefined ? ` aria-pressed="${on ? 'true' : 'false'}"` : ''} type="button">${inner}</button>`;
  function toolsHTML() {
    return `<div class="draw-tools" contenteditable="false" role="toolbar" aria-label="Outils du dessin">
      <div class="dt-row">
        <span class="dt-group dt-tools" role="group" aria-label="Outils">${TOOLS.map(([k, tip]) => btn(`data-dt="${k}"`, tip, I[k], k === st.tool)).join('')}</span>
        <span class="dt-group" role="group" aria-label="Affichage">${btn('data-dgrid', 'Grille magnétique (points tous les 10 px, formes alignées dessus)', I.grid, st.grid)}</span>
        <span class="dt-group" role="group" aria-label="Presse-papiers">${btn('data-dcopy', 'Copier la forme (Ctrl+C)', I.copy)}${btn('data-dpaste', 'Coller une forme (Ctrl+V)', I.paste)}${btn('data-ddup', 'Dupliquer la forme (Ctrl+D)', I.dup)}</span>
        <span class="dt-group" role="group" aria-label="Suppression">${btn('data-ddel', 'Supprimer la forme sélectionnée (Suppr)', I.trash)}${btn('data-dclear', 'Tout effacer', I.clear)}</span>
      </div>
      <div class="dt-row">
        <span class="dt-lab" title="Couleur du trait / du texte">Trait</span>
        <span class="dt-group dt-quick" role="group" aria-label="Couleur du trait">${STROKE_QUICK.map(c => btn(`data-dqs="${c}"`, c, swatch(c, 'stroke'), c === st.stroke)).join('')}${btn('data-dc="stroke"', 'Autres couleurs de trait…', '…')}</span>
        <span class="dt-group dt-widths" role="group" aria-label="Épaisseur">${[1, 2, 3, 5, 8].map(w => btn(`data-dsw="${w}"`, `Épaisseur ${w} px`, `<i style="height:${w}px"></i>`, w === st.sw)).join('')}</span>
        <span class="dt-group" role="group" aria-label="Style du trait">${[['solid', 'Trait plein'], ['dash', 'Tirets'], ['dot', 'Pointillés']].map(([k, tip]) => btn(`data-dls="${k}"`, tip, I[k], k === st.ls)).join('')}</span>
        <span class="dt-lab" title="Couleur de remplissage">Fond</span>
        <span class="dt-group dt-quick" role="group" aria-label="Couleur de fond">${FILL_QUICK.map(c => btn(`data-dqf="${c}"`, c === 'none' ? 'Sans remplissage' : c, swatch(c, 'fill'), c === st.fill)).join('')}${btn('data-dc="fill"', 'Autres couleurs de fond…', '…')}</span>
        <span class="dt-group" role="group" aria-label="Opacité">${btn('data-dop', 'Opacité de la forme (cliquer pour changer)', '<span class="dt-op">100 %</span>')}</span>
      </div>
      <div class="dt-row">
        <span class="dt-lab">Texte</span>
        <span class="dt-group" role="group" aria-label="Texte">${btn('data-dlabel', 'Écrire dans la forme (Entrée ou double-clic)', I.label)}${btn('data-dfs="-"', 'Texte plus petit', 'A−')}${btn('data-dfs="+"', 'Texte plus grand', 'A+')}${btn('data-dbold', 'Gras', '<b>G</b>', st.bold)}${['left', 'center', 'right'].map(a => btn(`data-dta="${a}"`, { left: 'Texte à gauche', center: 'Texte centré', right: 'Texte à droite' }[a], AL_ICO[a], a === st.ta)).join('')}${btn('data-dborder', 'Cadre autour de la zone de texte', I.border, false)}</span>
        <span class="dt-lab">Ordre</span>
        <span class="dt-group" role="group" aria-label="Ordre des formes">${btn('data-dz="front"', 'Mettre tout devant', I.front)}${btn('data-dz="up"', 'Avancer d’un cran', I.up)}${btn('data-dz="down"', 'Reculer d’un cran', I.down)}${btn('data-dz="back"', 'Mettre tout derrière', I.back)}</span>
        <span class="dt-lab">Aligner</span>
        <span class="dt-group" role="group" aria-label="Aligner sur la feuille">${[['l', 'Aligner à gauche de la feuille', I.alL], ['c', 'Centrer horizontalement', I.alC], ['r', 'Aligner à droite de la feuille', I.alR], ['t', 'Aligner en haut', I.alT], ['m', 'Centrer verticalement', I.alM], ['b', 'Aligner en bas', I.alB]].map(([k, tip, ico]) => btn(`data-dal="${k}"`, tip, ico)).join('')}</span>
        <span class="dt-hint">Maj : proportions / 45° · Tab : forme suivante · Flèches : déplacer · Alt+flèches : taille</span>
      </div>
    </div>`;
  }
  function blockHTML(b, MV) {
    const empty = !shapes(b).length;
    return `<div class="block draw${empty ? ' empty' : ''} tool-${st.tool}${st.grid ? ' grid' : ''}" data-id="${b.id}" contenteditable="false">${MV || ''}${toolsHTML()}<div class="draw-wrap">${svg(b, { edit: true })}</div><div class="draw-hrz" title="Glisser pour changer la hauteur du dessin" role="separator" aria-label="Hauteur du dessin"></div></div>`;
  }
  function renderCanvas(b) {
    const bl = blockEl(b.id); if (!bl) return;
    bl.querySelector('.draw-wrap').innerHTML = svg(b, { edit: true });
    bl.classList.toggle('empty', !shapes(b).length);
    updateTools(bl);
  }
  function updateTools(bl) {
    bl.className = bl.className.replace(/\btool-\w+/g, '').replace(/\bgrid\b/g, '').trim() + ' tool-' + st.tool + (st.grid ? ' grid' : '');
    const b = getBlock(bl.dataset.id);
    const sel = b && ctx && ctx.id === bl.dataset.id && ctx.sel ? shapes(b).find(s => s.id === ctx.sel) : null;
    const cur = { stroke: sel ? (sel.t === 'text' ? (sel.color || sel.stroke) : sel.stroke) || st.stroke : st.stroke, fill: sel ? (sel.fill || 'none') : st.fill, sw: sel ? (+sel.sw || 2) : st.sw, ls: sel ? (sel.ls || 'solid') : st.ls, bold: sel ? !!sel.bold : st.bold, ta: sel ? (sel.ta || 'left') : st.ta };
    const setOn = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    bl.querySelectorAll('[data-dt]').forEach(x => setOn(x, x.dataset.dt === st.tool));
    bl.querySelectorAll('[data-dsw]').forEach(x => setOn(x, +x.dataset.dsw === cur.sw));
    bl.querySelectorAll('[data-dqs]').forEach(x => setOn(x, x.dataset.dqs === cur.stroke));
    bl.querySelectorAll('[data-dqf]').forEach(x => setOn(x, x.dataset.dqf === cur.fill));
    bl.querySelectorAll('[data-dls]').forEach(x => setOn(x, x.dataset.dls === cur.ls));
    bl.querySelectorAll('[data-dta]').forEach(x => setOn(x, x.dataset.dta === cur.ta));
    const bb = bl.querySelector('[data-dbold]'); if (bb) setOn(bb, cur.bold);
    const bg = bl.querySelector('[data-dgrid]'); if (bg) setOn(bg, st.grid);
    const bd = bl.querySelector('[data-dborder]'); if (bd) { setOn(bd, !!(sel && sel.border)); bd.disabled = !(sel && sel.t === 'text'); }
    const lb = bl.querySelector('[data-dlabel]'); if (lb) lb.disabled = !(sel && (canLabel(sel) || sel.t === 'text'));
    const op = bl.querySelector('[data-dop]'); if (op) { op.disabled = !sel; op.querySelector('.dt-op').textContent = Math.round((sel && sel.op ? sel.op : 1) * 100) + ' %'; }
    bl.querySelectorAll('[data-dz], [data-ddel], [data-ddup], [data-dcopy], [data-dal]').forEach(x => x.disabled = !sel);
    const pa = bl.querySelector('[data-dpaste]'); if (pa) pa.disabled = !clip;
    const cl = bl.querySelector('[data-dclear]'); if (cl) cl.disabled = !(b && shapes(b).length);
  }
  function afterRender() {
    if (!ctx) return;
    const bl = blockEl(ctx.id);
    if (!bl) { ctx = null; return; }
    updateTools(bl);
  }
  function start(id) {
    const b = getBlock(id); if (!b) return;
    ctx = { id, sel: null, drag: null, textEdit: null };
    if (!shapes(b).length) st.tool = 'rect';
    afterRender();
  }
  function ensureCtx(id) { if (!ctx || ctx.id !== id) { commitText(); ctx = { id, sel: null, drag: null, textEdit: null }; } return ctx; }
  function setTool(k, bl) {
    st.tool = k;
    if (bl) updateTools(bl);
  }
  function selectShape(b, sid) { ctx.sel = sid; renderCanvas(b); }
  /* le dessin est-il l'objet sélectionné du cours (clavier, presse-papiers) ? */
  function activeDraw() {
    if (!ctx || ctx.textEdit) return null;
    if (typeof objSel === 'undefined' || objSel !== ctx.id) return null;
    const b = getBlock(ctx.id);
    return b && b.type === 'draw' ? b : null;
  }

  /* ---------- coordonnées ---------- */
  function point(svgEl, e) {
    const r = svgEl.getBoundingClientRect();
    const k = W / (r.width || W);
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }
  const clampPt = (p, b) => ({ x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(heightOf(b), p.y)) });
  const snapPt = p => ({ x: snap(p.x), y: snap(p.y) });

  /* ---------- zone de texte / texte d'une forme : édition en place ---------- */
  function openTextEdit(b, s, label = false) {
    commitText();
    const bl = blockEl(b.id); if (!bl) return;
    const wrap = bl.querySelector('.draw-wrap'); const svgEl = wrap.querySelector('svg');
    const r = svgEl.getBoundingClientRect(); const k = (r.width || W) / W;
    const box = label ? labelBox(s) : s;
    const ta = document.createElement('textarea');
    ta.className = 'draw-textedit' + (label ? ' label' : '');
    ta.value = (label ? s.label : s.text) || '';
    ta.style.left = (box.x * k) + 'px'; ta.style.top = (box.y * k) + 'px';
    ta.style.width = (box.w * k) + 'px'; ta.style.minHeight = (box.h * k) + 'px';
    ta.style.fontSize = ((+s.fs || (label ? 14 : 16)) * k) + 'px'; ta.style.lineHeight = '1.3';
    ta.style.fontWeight = s.bold ? '700' : '400';
    ta.style.color = s.color || (label ? inkOn(s.fill) : (s.stroke || '#202124'));
    ta.style.textAlign = label ? 'center' : (s.ta || 'left');
    ta.style.background = label ? (s.fill && s.fill !== 'none' ? s.fill : 'rgba(255,255,255,.92)') : (s.fill && s.fill !== 'none' ? s.fill : '#fff');
    ta.spellcheck = true; ta.setAttribute('lang', 'fr');
    ta.setAttribute('aria-label', label ? 'Texte de la forme' : 'Zone de texte');
    ta.placeholder = label ? 'Texte de la forme…' : 'Texte…';
    wrap.appendChild(ta);
    ctx.textEdit = { b, s, ta, label };
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(box.h * k, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commitText(); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); commitText(); return; }
      e.stopPropagation();
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (ctx && ctx.textEdit && ctx.textEdit.ta === ta) commitText(); }, 0));
    setTimeout(() => { ta.focus(); ta.select(); grow(); }, 10);
  }
  function commitText() {
    if (!ctx || !ctx.textEdit) return;
    const { b, s, ta, label } = ctx.textEdit; ctx.textEdit = null;
    const text = ta.value.replace(/\s+$/, '');
    ta.remove();
    if (label) {
      if (text.trim()) s.label = text; else delete s.label;
    } else {
      const fs = +s.fs || 16, pad = 6;
      if (!text.trim()) {
        const i = shapes(b).indexOf(s); if (i >= 0) shapes(b).splice(i, 1);
        if (ctx.sel === s.id) ctx.sel = null;
      } else {
        s.text = text;
        const lines = wrapLines(text, fs, Math.max(10, s.w - 2 * pad), s.bold);
        s.h = Math.max(s.h, Math.round(lines.length * fs * 1.3 + 2 * pad));
        if (s.y + s.h > heightOf(b)) b.h = Math.ceil(s.y + s.h + 10);
      }
    }
    touch(); renderCanvas(b);
    if (objSel === b.id) { blocksEl.focus({ preventScroll: true }); selectObj(b.id); }
  }
  /* hauteur d'une zone de texte selon son contenu */
  function refitText(s) {
    if (s.t !== 'text') return;
    const lines = wrapLines(s.text, +s.fs || 16, Math.max(10, s.w - 12), s.bold);
    s.h = Math.max(s.h, Math.round(lines.length * (+s.fs || 16) * 1.3 + 12));
  }

  /* ---------- souris ---------- */
  blocksEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const bl = e.target.closest('#blocks > .block.draw'); if (!bl) return;
    if (e.target.closest('.draw-tools')) { e.preventDefault(); return; }   // les boutons gardent la sélection
    const id = bl.dataset.id; const b = getBlock(id); if (!b) return;
    if (e.target.closest('.draw-textedit')) return;
    const hrz = e.target.closest('.draw-hrz');
    if (hrz) {
      e.preventDefault(); e.stopPropagation();
      ensureCtx(id); if (objSel !== id) selectObj(id);
      ctx.drag = { kind: 'height', b, y0: e.clientY, h0: heightOf(b), k: W / (bl.querySelector('svg').getBoundingClientRect().width || W) };
      document.body.classList.add('draw-dragging');
      return;
    }
    const svgEl = e.target.closest('svg.draw-svg'); if (!svgEl) return;
    e.preventDefault(); e.stopPropagation();
    ensureCtx(id);
    commitText();
    if (objSel !== id) selectObj(id);
    else if (document.activeElement !== blocksEl) blocksEl.focus({ preventScroll: true });   // le clavier (Suppr, flèches) revient au dessin
    const p = clampPt(point(svgEl, e), b);
    const handle = e.target.closest('[data-h]');
    if (handle && ctx.sel) {
      const s = shapes(b).find(x => x.id === ctx.sel);
      if (s) { ctx.drag = { kind: 'resize', b, s, h: handle.dataset.h, p0: p, o: JSON.parse(JSON.stringify(s)) }; return; }
    }
    const hit = e.target.closest('[data-sid]');
    if (st.tool === 'select') {
      if (hit) {
        const s = shapes(b).find(x => x.id === hit.dataset.sid);
        if (s) { if (ctx.sel !== s.id) selectShape(b, s.id); ctx.drag = { kind: 'move', b, s, p0: p, o: JSON.parse(JSON.stringify(s)), moved: false }; return; }
      }
      if (ctx.sel) selectShape(b, null);
      return;
    }
    // création d'une forme
    const q = snapPt(p);
    const base = { id: uid(), stroke: st.stroke, fill: st.fill, sw: st.sw, ls: st.ls === 'solid' ? undefined : st.ls };
    let s;
    if (LINE_TYPES.includes(st.tool)) s = Object.assign(base, { t: st.tool, x1: q.x, y1: q.y, x2: q.x, y2: q.y });
    else if (st.tool === 'pen') s = Object.assign(base, { t: 'path', pts: [[p.x, p.y]] });
    else if (st.tool === 'text') s = Object.assign(base, { t: 'text', x: q.x, y: q.y, w: 0, h: 0, fs: st.fs, text: '', fill: st.fill, color: st.stroke, bold: st.bold || undefined, ta: st.ta === 'left' ? undefined : st.ta });
    else s = Object.assign(base, { t: st.tool, x: q.x, y: q.y, w: 0, h: 0 });
    shapes(b).push(s);
    ctx.sel = null;
    ctx.drag = { kind: 'create', b, s, p0: q };
    document.body.classList.add('draw-dragging');
  });
  document.addEventListener('pointermove', e => {
    if (!ctx || !ctx.drag) return;
    const d = ctx.drag, b = d.b;
    if (d.kind === 'height') {
      b.h = Math.max(80, Math.min(2000, Math.round(d.h0 + (e.clientY - d.y0) * d.k)));
      renderCanvas(b); return;
    }
    const bl = blockEl(b.id); const svgEl = bl && bl.querySelector('svg.draw-svg'); if (!svgEl) return;
    const p = clampPt(point(svgEl, e), b);
    const dx = p.x - d.p0.x, dy = p.y - d.p0.y;
    if (d.kind === 'move') {
      if (!d.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      d.moved = true;
      const s = d.s, o = d.o;
      const ob = bbox(o); const nx = snap(ob.x + dx) - ob.x, ny = snap(ob.y + dy) - ob.y;
      if (isLine(s)) { s.x1 = o.x1 + nx; s.y1 = o.y1 + ny; s.x2 = o.x2 + nx; s.y2 = o.y2 + ny; }
      else if (s.t === 'path') s.pts = o.pts.map(q => [q[0] + nx, q[1] + ny]);
      else { s.x = o.x + nx; s.y = o.y + ny; }
      renderCanvas(b); return;
    }
    if (d.kind === 'resize') {
      const s = d.s, o = d.o, k = d.h;
      if (k === 'p1') { s.x1 = snap(p.x); s.y1 = snap(p.y); if (e.shiftKey) snap45(s, 'p1'); }
      else if (k === 'p2') { s.x2 = snap(p.x); s.y2 = snap(p.y); if (e.shiftKey) snap45(s, 'p2'); }
      else {
        const ob = bbox(o);
        let x0 = ob.x, y0 = ob.y, x1 = ob.x + ob.w, y1 = ob.y + ob.h;
        if (k.includes('w')) x0 = Math.min(x1 - 6, snap(ob.x + dx));
        if (k.includes('e')) x1 = Math.max(x0 + 6, snap(ob.x + ob.w + dx));
        if (k.includes('n')) y0 = Math.min(y1 - 6, snap(ob.y + dy));
        if (k.includes('s')) y1 = Math.max(y0 + 6, snap(ob.y + ob.h + dy));
        // Maj sur un coin : proportions d'origine conservées
        if (e.shiftKey && k.length === 2 && ob.w > 0 && ob.h > 0) {
          const ratio = ob.w / ob.h; let w = x1 - x0, h = y1 - y0;
          if (w / h > ratio) w = h * ratio; else h = w / ratio;
          if (k.includes('w')) x0 = x1 - w; else x1 = x0 + w;
          if (k.includes('n')) y0 = y1 - h; else y1 = y0 + h;
        }
        fitShape(s, o, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
      renderCanvas(b); return;
    }
    if (d.kind === 'create') {
      const s = d.s;
      if (isLine(s)) { s.x2 = snap(p.x); s.y2 = snap(p.y); if (e.shiftKey) snap45(s, 'p2'); }
      else if (s.t === 'path') { const last = s.pts[s.pts.length - 1]; if (Math.hypot(p.x - last[0], p.y - last[1]) > 1.5) s.pts.push([p.x, p.y]); }
      else {
        let w = snap(p.x) - d.p0.x, h = snap(p.y) - d.p0.y;
        if (e.shiftKey && s.t !== 'text') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        s.x = Math.min(d.p0.x, d.p0.x + w); s.y = Math.min(d.p0.y, d.p0.y + h); s.w = Math.abs(w); s.h = Math.abs(h);
      }
      renderCanvas(b);
    }
  });
  function snap45(s, which) {
    const ax = which === 'p2' ? s.x1 : s.x2, ay = which === 'p2' ? s.y1 : s.y2;
    const px = which === 'p2' ? s.x2 : s.x1, py = which === 'p2' ? s.y2 : s.y1;
    const a = Math.round(Math.atan2(py - ay, px - ax) / (Math.PI / 4)) * (Math.PI / 4);
    const L = Math.hypot(px - ax, py - ay);
    const nx = ax + L * Math.cos(a), ny = ay + L * Math.sin(a);
    if (which === 'p2') { s.x2 = nx; s.y2 = ny; } else { s.x1 = nx; s.y1 = ny; }
  }
  document.addEventListener('pointerup', () => {
    if (!ctx || !ctx.drag) return;
    const d = ctx.drag; ctx.drag = null;
    document.body.classList.remove('draw-dragging');
    const b = d.b;
    if (d.kind === 'height') { touch(); return; }
    if (d.kind === 'move') { if (d.moved) touch(); return; }
    if (d.kind === 'resize') { touch(); return; }
    if (d.kind === 'create') {
      const s = d.s, list = shapes(b);
      const tiny = isLine(s) ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 4 : s.t === 'path' ? s.pts.length < 2 : (s.w < 4 && s.h < 4);
      if (s.t === 'text') {
        if (tiny) { s.w = 180; s.h = Math.round((+s.fs || 16) * 1.3 + 12); }
        if (s.x + s.w > W) s.x = Math.max(0, W - s.w);
        ctx.sel = s.id; st.tool = 'select';
        renderCanvas(b);
        openTextEdit(b, s);
        return;
      }
      if (tiny) {
        // simple clic avec un outil de forme : une forme de taille standard
        if (s.t === 'path') { list.splice(list.indexOf(s), 1); renderCanvas(b); return; }
        if (isLine(s)) { s.x2 = Math.min(W, s.x1 + 120); s.y2 = s.y1; }
        else { s.w = 120; s.h = s.t === 'cylinder' ? 90 : 70; if (s.x + s.w > W) s.x = Math.max(0, W - s.w); if (s.y + s.h > heightOf(b)) b.h = Math.ceil(s.y + s.h + 10); }
      }
      if (s.t !== 'path') { ctx.sel = s.id; st.tool = 'select'; }
      touch(); renderCanvas(b);
    }
  });
  /* double-clic : zone de texte → modifier le texte ; forme → texte dans la forme ; ailleurs (outil Sélection) → nouvelle zone de texte */
  blocksEl.addEventListener('dblclick', e => {
    const bl = e.target.closest('#blocks > .block.draw'); if (!bl) return;
    const svgEl = e.target.closest('svg.draw-svg'); if (!svgEl) return;
    e.preventDefault();
    const b = getBlock(bl.dataset.id); if (!b) return;
    ensureCtx(b.id);
    const hit = e.target.closest('[data-sid]');
    const s = hit && shapes(b).find(x => x.id === hit.dataset.sid);
    if (s && s.t === 'text') { ctx.sel = s.id; renderCanvas(b); openTextEdit(b, s); return; }
    if (s && canLabel(s)) { ctx.sel = s.id; renderCanvas(b); openTextEdit(b, s, true); return; }
    if (!s) {
      const p = snapPt(clampPt(point(svgEl, e), b));
      const ns = { id: uid(), t: 'text', x: p.x, y: p.y, w: 180, h: Math.round(st.fs * 1.3 + 12), fs: st.fs, text: '', fill: 'none', stroke: st.stroke, color: st.stroke, sw: st.sw, bold: st.bold || undefined, ta: st.ta === 'left' ? undefined : st.ta };
      if (ns.x + ns.w > W) ns.x = Math.max(0, W - ns.w);
      shapes(b).push(ns); ctx.sel = ns.id; renderCanvas(b); openTextEdit(b, ns);
    }
  });
  /* barre d'outils du dessin */
  blocksEl.addEventListener('click', e => {
    const bl = e.target.closest('#blocks > .block.draw'); if (!bl) return;
    const btnEl = e.target.closest('.draw-tools button'); if (!btnEl || btnEl.disabled) return;
    const b = getBlock(bl.dataset.id); if (!b) return;
    ensureCtx(b.id);
    if (objSel !== b.id) selectObj(b.id);
    const sel = ctx.sel ? shapes(b).find(s => s.id === ctx.sel) : null;
    const ds = btnEl.dataset;
    const applyStroke = v => { st.stroke = v; if (sel) { sel.stroke = v; if (sel.t === 'text') sel.color = v; touch(); } renderCanvas(b); };
    const applyFill = v => { st.fill = v; if (sel) { sel.fill = v; touch(); } renderCanvas(b); };
    if (ds.dt) { setTool(ds.dt, bl); return; }
    if (ds.dqs) { applyStroke(ds.dqs); return; }
    if (ds.dqf) { applyFill(ds.dqf); return; }
    if (ds.dc) {
      const which = ds.dc;
      openPalettePopover(btnEl.getBoundingClientRect(), {
        title: which === 'fill' ? 'Remplissage' : 'Couleur du trait', none: which === 'fill' ? 'Aucun remplissage' : 'Noir',
        quick: which === 'fill' ? FILL_QUICK.filter(c => c !== 'none') : STROKE_QUICK, current: which === 'fill' ? st.fill : st.stroke,
        onPick: c => { const v = c === 'none' ? (which === 'fill' ? 'none' : '#202124') : c; if (which === 'fill') applyFill(v); else applyStroke(v); if (objSel !== b.id) selectObj(b.id); }
      });
      return;
    }
    if (ds.dsw) { st.sw = +ds.dsw; if (sel) { sel.sw = st.sw; touch(); } renderCanvas(b); return; }
    if (ds.dls) { st.ls = ds.dls; if (sel) { if (ds.dls === 'solid') delete sel.ls; else sel.ls = ds.dls; touch(); } renderCanvas(b); return; }
    if (btnEl.hasAttribute('data-dgrid')) { st.grid = !st.grid; renderCanvas(b); toast(st.grid ? 'Grille magnétique activée : les formes s’alignent sur les points' : 'Grille désactivée'); return; }
    if (btnEl.hasAttribute('data-dop') && sel) {
      const cur = sel.op || 1; const i = OPACITIES.findIndex(v => Math.abs(v - cur) < 0.01);
      const next = OPACITIES[(i + 1) % OPACITIES.length];
      if (next === 1) delete sel.op; else sel.op = next;
      touch(); renderCanvas(b); return;
    }
    if (ds.dfs) {
      const next = fs => Math.max(8, Math.min(72, fs + (ds.dfs === '+' ? 2 : -2)));
      if (sel && (sel.t === 'text' || canLabel(sel))) { sel.fs = next(+sel.fs || (sel.t === 'text' ? 16 : 14)); if (sel.t === 'text') { st.fs = sel.fs; refitText(sel); } touch(); renderCanvas(b); }
      else { st.fs = next(st.fs); toast(`Taille du texte : ${st.fs} px`); }
      return;
    }
    if (btnEl.hasAttribute('data-dbold')) {
      if (sel && (sel.t === 'text' || canLabel(sel))) { sel.bold = !sel.bold || undefined; if (!sel.bold) delete sel.bold; if (sel.t === 'text') { st.bold = !!sel.bold; refitText(sel); } touch(); }
      else st.bold = !st.bold;
      renderCanvas(b); return;
    }
    if (ds.dta) { st.ta = ds.dta; if (sel && sel.t === 'text') { if (ds.dta === 'left') delete sel.ta; else sel.ta = ds.dta; touch(); } renderCanvas(b); return; }
    if (btnEl.hasAttribute('data-dborder') && sel && sel.t === 'text') { sel.border = !sel.border || undefined; if (!sel.border) delete sel.border; touch(); renderCanvas(b); return; }
    if (btnEl.hasAttribute('data-dlabel') && sel) { if (sel.t === 'text') openTextEdit(b, sel); else if (canLabel(sel)) openTextEdit(b, sel, true); return; }
    if (ds.dz && sel) {
      const list = shapes(b); const i = list.indexOf(sel); list.splice(i, 1);
      if (ds.dz === 'front') list.push(sel);
      else if (ds.dz === 'back') list.unshift(sel);
      else if (ds.dz === 'up') list.splice(Math.min(list.length, i + 1), 0, sel);
      else list.splice(Math.max(0, i - 1), 0, sel);
      touch(); renderCanvas(b); return;
    }
    if (ds.dal && sel) { alignShape(b, sel, ds.dal); return; }
    if (btnEl.hasAttribute('data-ddup') && sel) { duplicate(b, sel); return; }
    if (btnEl.hasAttribute('data-dcopy') && sel) { copyShape(sel); return; }
    if (btnEl.hasAttribute('data-dpaste')) { if (clip) pasteShape(b, clip); else toast('Aucune forme copiée — sélectionnez une forme puis Ctrl+C'); return; }
    if (btnEl.hasAttribute('data-ddel') && sel) { deleteShape(b, sel); return; }
    if (btnEl.hasAttribute('data-dclear') && shapes(b).length) {
      const n = shapes(b).length; b.shapes = []; ctx.sel = null; touch(); renderCanvas(b);
      toast(`${n} forme${n > 1 ? 's' : ''} effacée${n > 1 ? 's' : ''} — Ctrl+Z pour annuler`);
    }
  });
  function deleteShape(b, s) {
    const list = shapes(b); const i = list.indexOf(s); if (i < 0) return;
    list.splice(i, 1); ctx.sel = null; touch(); renderCanvas(b);
  }
  function duplicate(b, s) {
    const copy = JSON.parse(JSON.stringify(s)); copy.id = uid(); moveShape(copy, 14, 14); keepInside(copy, b);
    shapes(b).push(copy); ctx.sel = copy.id; touch(); renderCanvas(b);
  }
  /* aligne la forme sur la feuille : gauche / centre / droite / haut / milieu / bas */
  function alignShape(b, s, k) {
    const bb = bbox(s); const H = heightOf(b);
    const dx = k === 'l' ? -bb.x : k === 'c' ? (W - bb.w) / 2 - bb.x : k === 'r' ? W - bb.w - bb.x : 0;
    const dy = k === 't' ? -bb.y : k === 'm' ? (H - bb.h) / 2 - bb.y : k === 'b' ? H - bb.h - bb.y : 0;
    if (!dx && !dy) return;
    moveShape(s, dx, dy); touch(); renderCanvas(b);
  }

  /* ---------- presse-papiers : une forme voyage d'un dessin à l'autre ---------- */
  function copyShape(s) {
    clip = JSON.stringify(s);
    const h = ev => {
      ev.clipboardData.setData('text/x-alixo-shape', clip);
      ev.clipboardData.setData('text/plain', s.t === 'text' ? (s.text || '') : (s.label || ''));
      ev.preventDefault(); ev.stopImmediatePropagation();
    };
    document.addEventListener('copy', h, true);
    try { document.execCommand('copy'); } catch { /* presse-papiers indisponible : la copie interne suffit */ }
    document.removeEventListener('copy', h, true);
    toast('Forme copiée — Ctrl+V pour la coller, ici ou dans un autre dessin');
    const bl = blockEl(ctx && ctx.id); if (bl) updateTools(bl);
  }
  function pasteShape(b, json) {
    let s = null; try { s = JSON.parse(json); } catch { s = null; }
    if (!s || !s.t) return false;
    s.id = uid();
    // même endroit qu'une forme existante (collage dans le même dessin) : décalée pour rester visible
    let guard = 0;
    while (guard++ < 40 && shapes(b).some(x => { const o = bbox(x), q = bbox(s); return Math.abs(o.x - q.x) < 1 && Math.abs(o.y - q.y) < 1; }) && bbox(s).y < heightOf(b) - 20) moveShape(s, 14, 14);
    keepInside(s, b);
    shapes(b).push(s); ctx.sel = s.id; st.tool = 'select';
    touch(); renderCanvas(b);
    if (objSel !== b.id) selectObj(b.id);
    return true;
  }
  /* Ctrl+C / Ctrl+X sur une forme sélectionnée : la forme, pas le bloc entier (1.21) */
  document.addEventListener('copy', e => {
    const b = activeDraw(); if (!b || !ctx.sel) return;
    const s = shapes(b).find(x => x.id === ctx.sel); if (!s) return;
    clip = JSON.stringify(s);
    try { e.clipboardData.setData('text/x-alixo-shape', clip); e.clipboardData.setData('text/plain', s.t === 'text' ? (s.text || '') : (s.label || '')); } catch { /* */ }
    e.preventDefault(); e.stopImmediatePropagation();
    toast('Forme copiée — Ctrl+V pour la coller, ici ou dans un autre dessin');
  }, true);
  document.addEventListener('cut', e => {
    const b = activeDraw(); if (!b || !ctx.sel) return;
    const s = shapes(b).find(x => x.id === ctx.sel); if (!s) return;
    clip = JSON.stringify(s);
    try { e.clipboardData.setData('text/x-alixo-shape', clip); e.clipboardData.setData('text/plain', s.t === 'text' ? (s.text || '') : (s.label || '')); } catch { /* */ }
    e.preventDefault(); e.stopImmediatePropagation();
    deleteShape(b, s);
    toast('Forme coupée — Ctrl+V pour la coller');
  }, true);
  /* Ctrl+V avec le dessin sélectionné : une forme copiée se colle dans le dessin ; un texte devient une zone de texte */
  document.addEventListener('paste', e => {
    const b = activeDraw(); if (!b) return;
    const cd = e.clipboardData; if (!cd) return;
    const sh = cd.getData('text/x-alixo-shape');
    if (sh) { e.preventDefault(); e.stopImmediatePropagation(); pasteShape(b, sh); return; }
    if (cd.getData('text/x-alixo')) return;   // blocs copiés depuis le cours : app.js les insère après le dessin
    const text = (cd.getData('text/plain') || '').trim();
    if (clip && text === (JSON.parse(clip).text || JSON.parse(clip).label || '').trim()) { e.preventDefault(); e.stopImmediatePropagation(); pasteShape(b, clip); return; }
    if (!text || [...(cd.files || [])].some(f => f.type && f.type.startsWith('image/'))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const ns = { id: uid(), t: 'text', x: 20, y: 20, w: Math.min(W - 40, Math.max(180, Math.round(measure(text.split('\n')[0], st.fs, st.bold) + 20))), h: 0, fs: st.fs, text: text.slice(0, 2000), fill: 'none', stroke: st.stroke, color: st.stroke, sw: st.sw, bold: st.bold || undefined };
    refitText(ns); pasteShape(b, JSON.stringify(ns));
  }, true);

  /* ---------- clavier (le bloc est l'objet sélectionné) ---------- */
  function handleKey(e, id) {
    const b = getBlock(id); if (!b || b.type !== 'draw') return false;
    if (ctx && ctx.textEdit) return true;   // la zone de texte gère ses touches
    ensureCtx(id);
    const mod = e.ctrlKey || e.metaKey;
    const list = shapes(b);
    const sel = ctx.sel ? list.find(s => s.id === ctx.sel) : null;
    if (mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) return false;
    if (mod && ['c', 'x', 'v'].includes(e.key.toLowerCase())) return false;   // événements copy / cut / paste
    if (!mod && !e.altKey && TOOL_KEYS[e.key.toLowerCase()] && !e.shiftKey) { e.preventDefault(); const bl = blockEl(id); setTool(TOOL_KEYS[e.key.toLowerCase()], bl); return true; }
    if (e.key === 'Tab' && !mod && !e.altKey && list.length) {   // Tab : forme suivante (accessibilité clavier)
      e.preventDefault();
      const i = sel ? list.indexOf(sel) : -1;
      const n = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length;
      selectShape(b, list[n].id); return true;
    }
    if (!sel) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteShape(b, sel); return true; }
    if (e.key === 'Escape') { e.preventDefault(); ctx.sel = null; renderCanvas(b); return true; }
    if (e.key === 'Enter' && !mod) { e.preventDefault(); if (sel.t === 'text') openTextEdit(b, sel); else if (canLabel(sel)) openTextEdit(b, sel, true); return true; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(b, sel); return true; }
    if (/^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (e.altKey) {   // Alt+flèches : la forme grandit ou rétrécit
        const o = JSON.parse(JSON.stringify(sel)), ob = bbox(o);
        fitShape(sel, o, { x: ob.x, y: ob.y, w: Math.max(6, ob.w + dx), h: Math.max(6, ob.h + dy) });
      } else moveShape(sel, dx, dy);
      touch({ typing: true, blockId: id + ':' + sel.id }); renderCanvas(b); return true;
    }
    return false;
  }
  /* clic en dehors du dessin : on valide le texte en cours */
  document.addEventListener('pointerdown', e => {
    if (ctx && ctx.textEdit && !e.target.closest('.draw-textedit, #popover')) commitText();
  });

  return { svg: b => svg(b, { plain: true }), blockHTML, afterRender, start, handleKey, renderCanvas, pasteShape, get ctx() { return ctx; }, get clip() { return clip; }, settings: st };
})();
