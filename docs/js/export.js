/* ============================================================
   Alixo — export PDF et Word (.docx) sans dépendance
   Les graphiques SVG sont rasterisés via <canvas>.
   S'appuie sur les globales d'app.js : computeNumbers, CALLOUTS,
   JURIS_FIELDS, makeZip, AlixoGraphs.
   ============================================================ */
(function () {
  'use strict';

  const PALETTE = {
    '--ink': '#1a1a1a', '--ink-2': '#46494e', '--ink-3': '#85898f', '--paper': '#ffffff', '--border': '#c9ccd1',
    '--c-demand': '#b0483f', '--c-supply': '#2f7d68', '--c-third': '#3d6bb5', '--tint': '#33658a',
    '--font-serif': 'Georgia, serif'
  };
  const CALLOUT_COLORS = { definition: '#3d6bb5', arret: '#8c4351', controverse: '#7a6852', retenir: '#b3762a', exemple: '#2e8b6a', bilan: '#2e8b8b' };
  const ALIGN_OF = b => (['center', 'right', 'justify'].includes(b.al) ? b.al : 'left');
  /* bloc « cartes » : titres / textes non vides */
  const cardsOfB = b => (Array.isArray(b.cards) ? b.cards : []).map(c => ({ t: c && c.t || '', x: c && c.x || '' })).filter(c => (c.t + c.x).replace(/<[^>]+>/g, '').trim());
  const cellTaOf = (b, r, c) => Array.isArray(b.ta) && Array.isArray(b.ta[r]) ? (b.ta[r][c] || 'left') : 'left';
  const JURIS_COLOR = '#8c4351';
  const INK = [26, 26, 26], INK2 = [70, 73, 78], INK3 = [133, 137, 143], ACCENT = [51, 101, 138], HAIR = [201, 204, 209];

  /* ---------- couleurs ---------- */
  function parseColor(s) {
    if (!s) return null;
    s = String(s).trim();
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (m) { const a = m[4] === undefined ? 1 : +m[4]; return [1, 2, 3].map(i => Math.round(+m[i] * a + 255 * (1 - a))); }
    return null;
  }
  const hex = rgb => rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const blend = (rgb, t) => rgb.map(v => Math.round(v * t + 255 * (1 - t))); // mélange vers le blanc

  /* ---------- rasterisation des graphiques ---------- */
  function resolveVars(svg) { return svg.replace(/var\((--[a-z0-9-]+)\)/g, (m, v) => PALETTE[v] || '#000'); }

  async function rasterizeSvg(svg, W, H, mime, scale) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, mime, 0.92));
    return { data: new Uint8Array(await blob.arrayBuffer()), w: W, h: H, pw: c.width, ph: c.height };
  }
  async function rasterizeGraph(b, mime = 'image/png', scale = 2) {
    const W = 460, H = 320;
    let svg = resolveVars(AlixoGraphs.renderSVG(b.gtype, b.params || {}));
    svg = svg.replace('<svg ', `<svg width="${W}" height="${H}" `);
    return rasterizeSvg(svg, W, H, mime, scale);
  }
  /* bloc Dessin → image (largeur logique 640) */
  async function rasterizeDraw(b, mime = 'image/png', scale = 2) {
    if (!window.AlixoDraw) return null;
    const svg = AlixoDraw.svg(b);
    const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const W = m ? +m[1] : 640, H = m ? +m[2] : 300;
    return rasterizeSvg(svg, W, H, mime, scale);
  }
  /* graphique de données → image (640 × 360) */
  async function rasterizeChart(b, mime = 'image/png', scale = 2) {
    if (!window.AlixoCharts) return null;
    let svg = AlixoCharts.svg(b, { plain: true });
    svg = svg.replace('<svg ', `<svg width="${AlixoCharts.W}" height="${AlixoCharts.H}" `);
    return rasterizeSvg(svg, AlixoCharts.W, AlixoCharts.H, mime, scale);
  }
  /* définition d'une fiche structurée (fiche d'arrêt ou fiche Santé) */
  function ficheOf(b) {
    if (typeof ficheDef === 'function') return ficheDef(b);
    return { name: 'Fiche d’arrêt', color: JURIS_COLOR, fields: JURIS_FIELDS, head: '' };
  }
  /* score clinique et calculateur : lignes de texte pour l'export */
  function scoreLines(b) {
    const sc = window.AlixoMed && AlixoMed.SCORES[b.sk]; if (!sc) return { title: 'Score', rows: [], total: '' };
    const vals = Array.isArray(b.vals) ? b.vals : [];
    let total = 0;
    const rows = sc.items.map((it, i) => {
      if (it.opts) { const v = vals[i]; const o = it.opts.find(x => x[0] === v); if (typeof v === 'number') total += v; return [it.l, o ? `${o[1]} (${o[0]})` : '—']; }
      if (vals[i]) total += it.p;
      return [it.l, vals[i] ? `☑ ${it.p > 0 ? '+' : ''}${it.p}` : '☐'];
    });
    total = Math.round(total * 10) / 10;
    const it = sc.interp.find(([a, z]) => total >= a && total <= z);
    return { title: sc.name, sub: sc.sub || '', rows, total: String(total) + (it ? ' — ' + it[2] : '') };
  }
  function calcLines(b) {
    const c = window.AlixoMed && AlixoMed.CALCS[b.ck]; if (!c) return { title: 'Calculateur', rows: [], total: '' };
    const vals = typeof mcalcVals === 'function' ? mcalcVals(b) : {};
    let res = []; try { res = c.out(vals); } catch { res = []; }
    const rows = c.inputs.map(inp => { const v = vals[inp.k]; const lab = inp.sel ? ((inp.sel.find(x => x[0] === v) || [])[1] || '') : (typeof v === 'number' && isFinite(v) ? String(v).replace('.', ',') : String(v ?? '')); return [inp.l, lab + (inp.u && lab ? ' ' + inp.u : '')]; });
    const total = res.map(r => `${r.l} : ${typeof r.v === 'number' && !isFinite(r.v) ? '—' : String(r.v).replace('.', ',')}${r.u ? ' ' + r.u : ''}${r.note ? ' (' + r.note + ')' : ''}`).join(' · ');
    return { title: c.name, sub: c.sub || '', rows, total };
  }
  const clock = secs => { secs = Math.max(0, Math.round(+secs || 0)); const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
  const timerText = b => `⏱ ${b.mode === 'up' ? 'Chronomètre' : 'Compte à rebours ' + clock(b.secs)}${b.label ? ' — ' + b.label : ''}`;

  /* ---------- HTML inline → séquences de texte stylé ---------- */
  const FONT_SIZE_PX = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };
  const cellBgOf = (b, r, c) => Array.isArray(b.bg) && Array.isArray(b.bg[r]) ? (b.bg[r][c] || '') : '';
  function htmlRuns(html) {
    const div = document.createElement('div'); div.innerHTML = html || '';
    const runs = [];
    const walk = (node, st) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.textContent) runs.push(Object.assign({ text: n.textContent }, st)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') { runs.push(Object.assign({ text: '\n' }, st)); continue; }
        // blocs imbriqués (tableau, citation, encadré dans un encadré ou une case) : une ligne par élément, cases séparées par « | »
        const blockish = tag === 'div' || tag === 'p' || tag === 'li' || tag === 'tr' || tag === 'table' || tag === 'blockquote';
        if (blockish && runs.length && !/\n$/.test(runs[runs.length - 1].text)) runs.push({ text: '\n' });
        if ((tag === 'td' || tag === 'th') && n.previousElementSibling) runs.push(Object.assign({ text: '  |  ' }, st, { color: [140, 144, 150] }));
        if (tag === 'li') { const ol = n.parentElement && n.parentElement.tagName === 'OL'; runs.push(Object.assign({ text: ol ? ([...n.parentElement.children].indexOf(n) + 1) + '. ' : '\u2022 ' }, st)); }
        const s = Object.assign({}, st);
        if (tag === 'b' || tag === 'strong') s.b = true;
        if (tag === 'i' || tag === 'em') s.i = true;
        if (tag === 'u') s.u = true;
        if (tag === 's' || tag === 'strike' || tag === 'del') s.s = true;
        if (tag === 'mark') s.bg = [233, 196, 106];
        if (tag === 'sup' || n.style.verticalAlign === 'super') s.sup = true;
        if (tag === 'sub' || n.style.verticalAlign === 'sub') s.sub = true;
        if (tag === 'a' && n.classList.contains('refart')) { s.b = true; if (n.classList.contains('item')) s.color = [192, 67, 67]; }
        if (tag === 'a' && n.classList.contains('lnk')) { s.b = true; s.u = true; s.color = [51, 101, 138]; }
        if (tag === 'span' && n.classList.contains('rtag')) { runs.push({ text: ' [Rang ' + n.textContent.trim() + '] ', b: true, color: n.classList.contains('b') ? [179, 118, 42] : [46, 139, 106] }); continue; }
        const fw = n.style.fontWeight; if (fw === 'bold' || +fw >= 600) s.b = true;
        if (n.style.fontStyle === 'italic') s.i = true;
        if (/underline/.test(n.style.textDecoration)) s.u = true;
        if (/line-through/.test(n.style.textDecoration)) s.s = true;
        const col = parseColor(n.style.color || (tag === 'font' ? n.getAttribute('color') : '')); if (col) s.color = col;
        if (n.style.backgroundColor && n.style.backgroundColor !== 'transparent') { const bg = parseColor(n.style.backgroundColor); if (bg) s.bg = bg; }
        if (tag === 'font' && n.getAttribute('size')) s.px = FONT_SIZE_PX[n.getAttribute('size')] || 16;
        if (n.style.fontSize) { const v = parseFloat(n.style.fontSize); if (v) s.px = /pt$/.test(n.style.fontSize) ? v / 0.75 : v; }
        if (n.classList.contains('nb-title')) s.b = true;
        if (tag === 'blockquote') s.i = true;
        walk(n, s);
        if ((n.classList.contains('nb') || n.classList.contains('nb-title') || tag === 'tr') && (n.nextSibling || n.classList.contains('nb-title')) && runs.length && !/\n$/.test(runs[runs.length - 1].text)) runs.push({ text: '\n' });
      }
    };
    walk(div, {});
    return runs;
  }

  /* ---------- encodage WinAnsi (cp1252) pour les polices PDF standard ---------- */
  const CP1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
  const FALLBACK = { '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '∞': 'inf', '√': 'sqrt', 'Δ': 'Delta', 'Σ': 'Sigma', '∑': 'Sum', '∫': 'int', '∂': 'd', 'π': 'pi', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'ρ': 'rho', 'θ': 'theta', 'ω': 'omega', '′': "'", '″': '"', '∈': 'in', '−': '-', '☐': '[ ]', '☑': '[x]', '◦': '\x95', '▪': '\x95', '★': '*', '✓': 'v', '⋮': ':', ' ': ' ', ' ': ' ' };
  /* flèches : dessinées avec la police Symbol (F5) du PDF ; gardées telles quelles ici, converties à l'écriture */
  const SYMBOL = { '→': 0xAE, '⟶': 0xAE, '←': 0xAC, '⟵': 0xAC, '↔': 0xAB, '↑': 0xAD, '↓': 0xAF, '⇒': 0xDE, '⇐': 0xDC, '⇔': 0xDB, '⇑': 0xDD, '⇓': 0xDF };
  const SYMBOL_RE = /[→⟶←⟵↔↑↓⇒⇐⇔⇑⇓]/;
  function toCp1252(str) {
    let out = '';
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c === 0x0A) out += '\n';
      else if (c < 0x20) continue;
      else if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) out += ch;
      else if (CP1252[ch] !== undefined) out += String.fromCharCode(CP1252[ch]);
      else if (SYMBOL[ch] !== undefined) out += ch;
      else if (FALLBACK[ch] !== undefined) out += FALLBACK[ch];
      else if (c >= 0x1F000 || (c >= 0x2600 && c <= 0x27BF) || c === 0xFE0F || c === 0x200D) continue; // émojis
      else out += '?';
    }
    return out;
  }

  /* mesure des largeurs : Arial est métriquement compatible avec Helvetica */
  const mctx = document.createElement('canvas').getContext('2d');
  function textWidth(text, size, b, i) {
    mctx.font = `${i ? 'italic ' : ''}${b ? 'bold ' : ''}${size}px Arial, Helvetica, sans-serif`;
    if (!SYMBOL_RE.test(text)) return mctx.measureText(text).width;
    // flèches (police Symbol) : environ 1 em chacune
    let w = 0;
    for (const ch of text) w += SYMBOL[ch] !== undefined ? size * 1.0 : mctx.measureText(ch).width;
    return w;
  }
  const latin1 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xFF; return u; };
  const pdfStr = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r/g, '');
  const n2 = v => (Math.round(v * 100) / 100).toString();

  /* ============================================================
     Écrivain PDF minimal (A4, polices Helvetica, images JPEG)
     ============================================================ */
  /* filigrane des exports (1.24) : tant que le compte n'a pas Alixo+ (exportWatermarked() d'app.js) */
  const WM_TEXT = 'Alixo';
  const watermarkWanted = () => (typeof exportWatermarked === 'function' ? exportWatermarked() : false);
  class Pdf {
    constructor() {
      this.W = 595.28; this.H = 841.89; this.M = 56; this.MB = 64;
      this.cw = this.W - 2 * this.M;
      this.pages = []; this.images = []; this.dry = false;
      this.newPage();
    }
    newPage() { if (this.dry) { this.y = this.M; return; } this.page = { ops: [] }; this.pages.push(this.page); this.y = this.M; }
    ensure(h) { if (this.y + h > this.H - this.MB) this.newPage(); }
    op(s) { if (!this.dry) this.page.ops.push(s); }
    rect(x, y, w, h, rgb) {
      this.op(`${n2(rgb[0] / 255)} ${n2(rgb[1] / 255)} ${n2(rgb[2] / 255)} rg ${n2(x)} ${n2(this.H - y - h)} ${n2(w)} ${n2(h)} re f`);
    }
    text(x, baseline, str, size, b, i, rgb) {
      const f = b && i ? 'F4' : b ? 'F2' : i ? 'F3' : 'F1';
      const c = rgb || INK;
      if (!SYMBOL_RE.test(str)) { this.op(`BT ${n2(c[0] / 255)} ${n2(c[1] / 255)} ${n2(c[2] / 255)} rg /${f} ${n2(size)} Tf ${n2(x)} ${n2(this.H - baseline)} Td (${pdfStr(str)}) Tj ET`); return; }
      // flèches : segments alternés police standard / Symbol (Tj enchaîne les positions)
      let ops = `BT ${n2(c[0] / 255)} ${n2(c[1] / 255)} ${n2(c[2] / 255)} rg ${n2(x)} ${n2(this.H - baseline)} Td`;
      let buf = '';
      const flush = () => { if (buf) { ops += ` /${f} ${n2(size)} Tf (${pdfStr(buf)}) Tj`; buf = ''; } };
      for (const ch of str) {
        if (SYMBOL[ch] !== undefined) { flush(); ops += ` /F5 ${n2(size)} Tf (${pdfStr(String.fromCharCode(SYMBOL[ch]))}) Tj`; }
        else buf += ch;
      }
      flush();
      this.op(ops + ' ET');
    }
    image(img, x, y, w, h) {
      let entry = this.images.find(e => e.data === img.data);
      if (!entry) { entry = { name: 'Im' + (this.images.length + 1), data: img.data, pw: img.pw, ph: img.ph }; this.images.push(entry); }
      this.op(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(this.H - y - h)} cm /${entry.name} Do Q`);
    }
  }

  /* mise en page d'un paragraphe de séquences stylées, avec retour à la ligne */
  function layoutRuns(pdf, runs, o) {
    const size = o.size;
    const tokens = [];
    for (const r of runs) {
      const rs = (r.px ? r.px * 0.75 : size) * (r.sup || r.sub ? 0.7 : 1);
      for (const p of toCp1252(r.text).split(/(\s+)/)) {
        if (!p) continue;
        if (p.includes('\n')) { tokens.push({ br: true }); continue; }
        tokens.push({ text: p, ws: /^\s+$/.test(p), run: r, size: rs, w: textWidth(p, rs, r.b || o.bold, r.i || o.italic) });
      }
    }
    const lines = []; let line = [], lw = 0;
    const flush = () => { while (line.length && line[line.length - 1].ws) lw -= line.pop().w; lines.push({ segs: line, w: lw }); line = []; lw = 0; };
    for (const t of tokens) {
      if (t.br) { flush(); continue; }
      if (lw + t.w > o.width && line.length && !t.ws) flush();
      if (t.ws && !line.length) continue;
      line.push(t); lw += t.w;
    }
    if (line.length || !lines.length) flush();
    const lineH = o.lineH || size * 1.45;
    for (let li = 0; li < lines.length; li++) {
      const ln = lines[li];
      pdf.ensure(lineH);
      let x = o.x + (o.align === 'center' ? Math.max(0, (o.width - ln.w) / 2) : o.align === 'right' ? Math.max(0, o.width - ln.w) : 0);
      // justifié : l'espace manquant est réparti entre les blancs (sauf dernière ligne)
      let extra = 0;
      if (o.align === 'justify' && li < lines.length - 1) { const nws = ln.segs.filter(s => s.ws).length; if (nws) extra = Math.max(0, (o.width - ln.w) / nws); }
      const base = pdf.y + size * 1.05;
      for (const s of ln.segs) {
        const r = s.run, col = r.color || o.color || INK;
        if (r.bg) pdf.rect(x, pdf.y + size * 0.1, s.w, s.size * 1.25, r.bg);
        pdf.text(x, base - (r.sup ? s.size * 0.5 : r.sub ? -s.size * 0.2 : 0), s.text, s.size, r.b || o.bold, r.i || o.italic, col);
        if (r.u) pdf.rect(x, base + 1.6, s.w, 0.6, col);
        if (r.s) pdf.rect(x, base - s.size * 0.3, s.w, 0.6, col);
        x += s.w + (s.ws ? extra : 0);
      }
      pdf.y += lineH;
    }
  }

  /* puce / numéro / case d'un élément de liste, et son retrait (0 à 3 niveaux) — des points, jamais des tirets */
  function listMark(b, numMap) {
    const ind = Math.min(3, Math.max(0, +b.ind || 0));
    if (b.lt === 'ol') return { mark: (numMap[b.id] || '') + '  ', ind };
    if (b.lt === 'cl') return { mark: (b.done ? '☑' : '☐') + '  ', ind };
    return { mark: (['•', '◦', '▪', '•'][ind]) + '  ', ind };
  }
  /* image d'un bloc (recadrage appliqué) rasterisée pour l'export */
  async function rasterizeImage(b, mime = 'image/jpeg') {
    const src = (window.AlixoImages && AlixoImages.cache.get(b.iid)) || (window.AlixoImages ? await AlixoImages.get(b.iid) : null);
    if (!src) return null;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const c0 = b.crop && b.crop.w > 0 && b.crop.h > 0 ? b.crop : { x: 0, y: 0, w: 1, h: 1 };
    const sx = Math.round(c0.x * img.naturalWidth), sy = Math.round(c0.y * img.naturalHeight);
    const sw = Math.max(1, Math.round(c0.w * img.naturalWidth)), sh = Math.max(1, Math.round(c0.h * img.naturalHeight));
    const scale = Math.min(1, 1600 / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
    const ctx = c.getContext('2d');
    if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, mime, 0.9));
    return { data: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, pw: c.width, ph: c.height };
  }

  /* liens d'un bloc → QR codes (modules dessinés en vectoriel) sous le bloc */
  function linksOf(b) { try { return typeof blockLinks === 'function' ? blockLinks(b) : []; } catch { return []; } }
  function qrMatrix(url) {
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount(); const m = []; for (let r = 0; r < n; r++) { m.push([]); for (let c = 0; c < n; c++) m[r].push(q.isDark(r, c)); } return m; } catch { return null; }
  }
  function drawLinksPdf(pdf, b) {
    const links = linksOf(b); if (!links.length) return;
    const size = 52, gap = 10;
    for (const l of links) {
      const m = qrMatrix(l.url); if (!m) continue;
      pdf.y += 4; pdf.ensure(size + 6);
      const top = pdf.y, cell = size / m.length;
      for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) if (m[r][c]) pdf.rect(pdf.M + c * cell, top + r * cell, cell + 0.15, cell + 0.15, INK);
      const tx = pdf.M + size + gap;
      pdf.y = top + 6;
      layoutRuns(pdf, [{ text: l.label, b: true }], { size: 9.5, x: tx, width: pdf.cw - size - gap, lineH: 12 });
      layoutRuns(pdf, [{ text: l.url, color: INK2 }], { size: 8, x: tx, width: pdf.cw - size - gap, lineH: 10.5 });
      pdf.y = Math.max(pdf.y, top + size) + 6;
    }
  }
  async function qrPng(url, px = 240) {
    const m = qrMatrix(url); if (!m) return null;
    const c = document.createElement('canvas'); c.width = c.height = px;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px); ctx.fillStyle = '#000';
    const cell = px / m.length;
    for (let r = 0; r < m.length; r++) for (let k = 0; k < m.length; k++) if (m[r][k]) ctx.fillRect(Math.floor(k * cell), Math.floor(r * cell), Math.ceil(cell), Math.ceil(cell));
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    return { data: new Uint8Array(await blob.arrayBuffer()), w: px, h: px, pw: px, ph: px };
  }

  async function exportDocPdf(d) {
    const pdf = new Pdf();
    const numMap = computeNumbers(d.blocks);
    layoutRuns(pdf, [{ text: d.titre || 'Sans titre', b: true }], { size: 20, x: pdf.M, width: pdf.cw, lineH: 26 });
    pdf.y += 4; pdf.rect(pdf.M, pdf.y, pdf.cw, 0.8, HAIR); pdf.y += 16;

    for (const b of d.blocks) {
      switch (b.type) {
        case 'h': {
          const size = { 1: 16, 2: 14, 3: 12.5, 4: 11.5 }[b.level] || 12;
          const indent = (b.level - 1) * 14;
          pdf.y += b.level === 1 ? 12 : 6;
          pdf.ensure(size * 3.5);
          const runs = [{ text: (numMap[b.id] || '') + '  ', b: true, color: ACCENT }]
            .concat(htmlRuns(b.text).map(r => Object.assign({}, r, { b: true, i: r.i || b.level === 4 })));
          layoutRuns(pdf, runs, { size, x: pdf.M + indent, width: pdf.cw - indent, lineH: size * 1.4, align: ALIGN_OF(b) === 'justify' ? 'left' : ALIGN_OF(b) });
          pdf.y += 3;
          break;
        }
        case 'li': {
          const { mark, ind } = listMark(b, numMap);
          const x = pdf.M + 14 + ind * 16;
          layoutRuns(pdf, [{ text: mark, color: b.lt === 'ol' ? ACCENT : INK2 }].concat(htmlRuns(b.text).map(r => b.lt === 'cl' && b.done ? Object.assign({}, r, { color: INK3, s: true }) : r)), { size: 11, x, width: pdf.cw - (x - pdf.M), align: ALIGN_OF(b) });
          pdf.y += 2; break;
        }
        case 'draw': {
          const img = await rasterizeDraw(b, 'image/jpeg');
          if (!img) break;
          let w = pdf.cw, h = w * img.h / img.w;
          const maxH = pdf.H - pdf.M - pdf.MB - 12;
          if (h > maxH) { w *= maxH / h; h = maxH; }
          pdf.y += 6; pdf.ensure(h + 6);
          pdf.image(img, pdf.M + (pdf.cw - w) / 2, pdf.y, w, h);
          pdf.y += h + 8;
          break;
        }
        case 'img': {
          const img = await rasterizeImage(b, 'image/jpeg');
          if (!img) break;
          let w = pdf.cw * Math.max(0.08, Math.min(1, (b.w || 60) / 100)), h = w * img.h / img.w;
          const maxH = pdf.H - pdf.M - pdf.MB - 12;
          if (h > maxH) { w *= maxH / h; h = maxH; }
          pdf.y += 6; pdf.ensure(h + 6);
          const x = b.align === 'left' ? pdf.M : b.align === 'right' ? pdf.M + pdf.cw - w : pdf.M + (pdf.cw - w) / 2;
          pdf.image(img, x, pdf.y, w, h);
          pdf.y += h + 4;
          if (b.cap) { layoutRuns(pdf, htmlRuns(b.cap), { size: 9.5, x: pdf.M, width: pdf.cw, align: 'center', italic: true, color: INK2 }); }
          pdf.y += 6;
          break;
        }
        case 'quote':
          pdf.y += 2;
          layoutRuns(pdf, htmlRuns(b.text), { size: 11, x: pdf.M + 18, width: pdf.cw - 18, italic: true, color: INK2, align: ALIGN_OF(b) });
          if (b.cite) { pdf.y += 1; layoutRuns(pdf, htmlRuns(b.cite), { size: 9.5, x: pdf.M + 18, width: pdf.cw - 18, color: INK3, align: ALIGN_OF(b) === 'justify' ? 'left' : ALIGN_OF(b) }); }
          pdf.y += 6; break;
        case 'chart': {
          const img = await rasterizeChart(b, 'image/jpeg');
          if (!img) break;
          const w = pdf.cw * 0.9, h = w * img.h / img.w;
          pdf.y += 8; pdf.ensure(h + 8);
          pdf.image(img, pdf.M + (pdf.cw - w) / 2, pdf.y, w, h);
          pdf.y += h + 10;
          break;
        }
        case 'score':
        case 'mcalc': {
          const sl = b.type === 'score' ? scoreLines(b) : calcLines(b);
          const cc = parseColor('#c04343');
          pdf.y += 8; pdf.ensure(60);
          const top = pdf.y;
          pdf.rect(pdf.M, top, pdf.cw, 22, blend(cc, 0.12));
          pdf.y = top + 4;
          layoutRuns(pdf, [{ text: sl.title, b: true, color: blend(cc, 0.85) }, { text: sl.sub ? '   ' + sl.sub : '', color: INK3 }], { size: 11, x: pdf.M + 10, width: pdf.cw - 20, lineH: 14 });
          pdf.y = Math.max(pdf.y, top + 22) + 4;
          for (const [l, v] of sl.rows) {
            pdf.ensure(16);
            const y0 = pdf.y;
            layoutRuns(pdf, [{ text: l }], { size: 10, x: pdf.M + 10, width: pdf.cw * 0.62, lineH: 13 });
            const y1 = pdf.y; pdf.y = y0;
            layoutRuns(pdf, [{ text: v, b: true }], { size: 10, x: pdf.M + 10 + pdf.cw * 0.64, width: pdf.cw * 0.34, lineH: 13, align: 'right' });
            pdf.y = Math.max(pdf.y, y1);
          }
          pdf.y += 3; pdf.rect(pdf.M, pdf.y, pdf.cw, 0.6, blend(cc, 0.3)); pdf.y += 5;
          layoutRuns(pdf, [{ text: (b.type === 'score' ? 'Total : ' : 'Résultat : '), b: true, color: cc }, { text: sl.total, b: true }], { size: 10.5, x: pdf.M + 10, width: pdf.cw - 20, lineH: 14 });
          pdf.y += 8;
          break;
        }
        case 'timer':
          pdf.y += 3;
          layoutRuns(pdf, [{ text: timerText(b), b: true, color: INK2 }], { size: 10.5, x: pdf.M, width: pdf.cw });
          pdf.y += 5; break;
        case 'callout': {
          const cc = parseColor(CALLOUT_COLORS[b.ct] || CALLOUT_COLORS.retenir);
          const co = CALLOUTS[b.ct] || CALLOUTS.retenir;
          const name = co.name + (co.sub ? '  —  ' + co.sub : '');
          const innerX = pdf.M + 16, innerW = pdf.cw - 26;
          const draw = () => {
            pdf.y += 8;
            layoutRuns(pdf, [{ text: name.toUpperCase(), b: true, color: cc }], { size: 8.5, x: innerX, width: innerW, lineH: 12 });
            layoutRuns(pdf, htmlRuns(b.text), { size: 11, x: innerX, width: innerW, align: ALIGN_OF(b) });
            pdf.y += 8;
          };
          const y0 = pdf.y; pdf.dry = true; draw(); const h = pdf.y - y0; pdf.dry = false; pdf.y = y0;
          pdf.y += 6;
          pdf.ensure(Math.min(h, pdf.H - pdf.M - pdf.MB));
          const top = pdf.y, drawH = Math.min(h, pdf.H - pdf.MB - top);
          pdf.rect(pdf.M, top, pdf.cw, drawH, blend(cc, 0.08));
          pdf.rect(pdf.M, top, 3, drawH, cc);
          draw();
          pdf.y += 6;
          break;
        }
        case 'juris':
        case 'fiche': {
          const f = b.fields || {}, def = ficheOf(b), cc = parseColor(def.color || JURIS_COLOR);
          pdf.y += 8; pdf.ensure(80);
          const top = pdf.y;
          pdf.rect(pdf.M, top, pdf.cw, 24, blend(cc, 0.12));
          pdf.y = top + 5;
          const head = (b.type === 'fiche' ? [{ text: def.name.toUpperCase() + '   ', b: true, color: cc, px: 11 }] : []).concat(htmlRuns(f.ref || (b.type === 'fiche' ? def.head : 'Référence de l’arrêt')));
          layoutRuns(pdf, head, { size: 11.5, x: pdf.M + 10, width: pdf.cw - 20, bold: true, color: blend(cc, 0.85), lineH: 14 });
          pdf.y = Math.max(pdf.y, top + 24) + 5;
          const labW = b.type === 'fiche' ? 130 : 96;
          for (const [k, lab] of def.fields) {
            if (b.type === 'fiche' && !(f[k] || '').trim()) continue;   // fiches Santé : les champs vides ne sont pas imprimés
            pdf.ensure(30);
            const y0 = pdf.y;
            layoutRuns(pdf, [{ text: toCp1252(lab.toUpperCase()), b: true, color: cc }], { size: 7.5, x: pdf.M + 10, width: labW - 16, lineH: 10 });
            const y1 = pdf.y; pdf.y = y0;
            layoutRuns(pdf, htmlRuns(f[k] || '…'), { size: 10.5, x: pdf.M + labW, width: pdf.cw - labW - 10 });
            pdf.y = Math.max(pdf.y, y1);
            pdf.y += 3; pdf.rect(pdf.M, pdf.y, pdf.cw, 0.5, blend(cc, 0.25)); pdf.y += 5;
          }
          pdf.y += 6;
          break;
        }
        case 'formula':
          pdf.y += 5;
          layoutRuns(pdf, [{ text: b.src || '', i: true }], { size: 12, x: pdf.M, width: pdf.cw, align: 'center' });
          pdf.y += 5; break;
        case 'pb': pdf.newPage(); break;   // 1.23 : saut de page
        case 'hr':
          pdf.y += 9; pdf.ensure(12);
          pdf.rect(pdf.M + pdf.cw * 0.1, pdf.y, pdf.cw * 0.8, 0.8, HAIR);
          pdf.y += 11; break;
        case 'tree': {   // 1.20 : arbre → plan indenté
          const walk = (n, depth) => {
            if (!n) return;
            const x = pdf.M + 6 + depth * 16;
            layoutRuns(pdf, [{ text: depth ? '└ ' : '', color: INK3 }].concat(htmlRuns(n.t || '').map(r => depth ? r : Object.assign({}, r, { b: true }))), { size: 11, x, width: pdf.cw - (x - pdf.M) });
            pdf.y += 1;
            (n.k || []).forEach(c => walk(c, depth + 1));
          };
          walk(b.root, 0); pdf.y += 4;
          break;
        }
        case 'cards': {
          const cards = cardsOfB(b);
          if (!cards.length) break;
          const per = 3, gap = 8, pad = 7, size = 10, lineH = 13;
          const colW = (pdf.cw - gap * (per - 1)) / per;
          pdf.y += 6;
          for (let r0 = 0; r0 < cards.length; r0 += per) {
            const row = cards.slice(r0, r0 + per);
            let h = 0;
            const drawCard = (c, x, dry) => {
              const y0 = pdf.y; pdf.dry = dry;
              if ((c.t || '').trim()) layoutRuns(pdf, htmlRuns(c.t).map(rr => Object.assign({}, rr, { b: true })), { size: size + 0.5, x: x + pad, width: colW - 2 * pad, lineH: lineH + 1 });
              if ((c.x || '').trim()) layoutRuns(pdf, htmlRuns(c.x), { size, x: x + pad, width: colW - 2 * pad, lineH, color: INK2 });
              pdf.dry = false; const hh = pdf.y - y0; pdf.y = y0; return hh;
            };
            row.forEach((c, i) => { h = Math.max(h, drawCard(c, pdf.M + i * (colW + gap), true)); });
            h = Math.max(h, lineH) + 2 * pad;
            pdf.ensure(h + 4);
            const top = pdf.y;
            row.forEach((c, i) => {
              const x = pdf.M + i * (colW + gap);
              pdf.rect(x, top, colW, h, [247, 248, 250]);
              pdf.rect(x, top, 2, h, ACCENT);
              pdf.y = top + pad; drawCard(c, x, false);
            });
            pdf.y = top + h + gap;
          }
          pdf.y += 4;
          break;
        }
        case 'graph': {
          const img = await rasterizeGraph(b, 'image/jpeg');
          const w = pdf.cw * 0.82, h = w * img.h / img.w;
          pdf.y += 8; pdf.ensure(h + 8);
          pdf.image(img, pdf.M + (pdf.cw - w) / 2, pdf.y, w, h);
          pdf.y += h + 10;
          break;
        }
        case 'table': {
          const rows = Array.isArray(b.rows) ? b.rows : [];
          if (!rows.length) break;
          const nc = Math.max(1, ...rows.map(r => r.length));
          const pad = 4, size = 10, lineH = 13;
          // 1.21 : largeurs de colonnes réglées dans l'éditeur, et cases fusionnées (b.spans)
          let ws = Array.isArray(b.widths) && b.widths.length === nc ? b.widths.map(x => Math.max(4, +x || 0)) : Array(nc).fill(1);
          const wsum = ws.reduce((a, x) => a + x, 0) || 1; ws = ws.map(x => x / wsum * pdf.cw);
          const xs = [pdf.M]; for (let i = 0; i < nc; i++) xs.push(xs[i] + ws[i]);
          const spans = Array.isArray(b.spans) ? b.spans.filter(x => x && x.r >= 0 && x.c >= 0 && (x.rs > 1 || x.cs > 1)) : [];
          const covered = new Map(); spans.forEach(x => { for (let r = x.r; r < x.r + x.rs; r++) for (let c = x.c; c < x.c + x.cs; c++) if (r !== x.r || c !== x.c) covered.set(r + ':' + c, x); });
          const spanOf = (r, c) => spans.find(x => x.r === r && x.c === c);
          const cellW = (r, c) => { const sp = spanOf(r, c); return xs[Math.min(nc, c + (sp ? sp.cs : 1))] - xs[c]; };
          const dryH = (ri, ci) => { const y0 = pdf.y; pdf.dry = true; layoutRuns(pdf, htmlRuns(rows[ri][ci] || ''), { size, x: xs[ci] + pad, width: cellW(ri, ci) - 2 * pad, lineH, bold: !!b.head && ri === 0, align: cellTaOf(b, ri, ci) }); const h = pdf.y - y0; pdf.dry = false; pdf.y = y0; return h; };
          pdf.y += 6;
          // 1) hauteur de chaque ligne : mise en page à blanc des cases d'une seule ligne
          const heights = rows.map((r, ri) => {
            let h = 0;
            for (let ci = 0; ci < nc; ci++) { if (covered.has(ri + ':' + ci)) continue; const sp = spanOf(ri, ci); if (sp && sp.rs > 1) continue; h = Math.max(h, dryH(ri, ci)); }
            return Math.max(h, lineH) + 2 * pad;
          });
          // une case à cheval sur plusieurs lignes étire la dernière ligne couverte si elle manque de place
          for (const sp of spans) if (sp.rs > 1 && rows[sp.r]) { const need = dryH(sp.r, sp.c) + 2 * pad; let have = 0; for (let r = sp.r; r < sp.r + sp.rs; r++) have += heights[r] || 0; if (need > have) heights[Math.min(rows.length - 1, sp.r + sp.rs - 1)] += need - have; }
          // 2) dessin ligne par ligne ; une case fusionnée verticalement est dessinée depuis sa ligne d'ancre, avec la hauteur cumulée
          rows.forEach((r, ri) => {
            const h = heights[ri], bold = !!b.head && ri === 0;
            pdf.ensure(h);
            const top = pdf.y;
            if (bold) pdf.rect(pdf.M, top, pdf.cw, h, [238, 242, 246]);
            for (let ci = 0; ci < nc; ci++) {
              if (covered.has(ri + ':' + ci)) continue;
              const sp = spanOf(ri, ci);
              const ch = sp && sp.rs > 1 ? heights.slice(ri, ri + sp.rs).reduce((a, x) => a + x, 0) : h;
              const cw = cellW(ri, ci);
              const cbg = parseColor(cellBgOf(b, ri, ci)); if (cbg) pdf.rect(xs[ci], top, cw, ch, cbg);
              pdf.y = top + pad;
              layoutRuns(pdf, htmlRuns(r[ci] || ''), { size, x: xs[ci] + pad, width: cw - 2 * pad, lineH, bold, align: cellTaOf(b, ri, ci), color: cbg && (0.299 * cbg[0] + 0.587 * cbg[1] + 0.114 * cbg[2]) < 140 ? [255, 255, 255] : undefined });
              pdf.rect(xs[ci], top, cw, 0.5, HAIR); pdf.rect(xs[ci], top + ch - 0.5, cw, 0.5, HAIR);
              pdf.rect(xs[ci], top, 0.5, ch, HAIR); pdf.rect(xs[ci] + cw - 0.5, top, 0.5, ch, HAIR);
            }
            pdf.y = top + h;
          });
          pdf.y += 8;
          break;
        }
        default:
          layoutRuns(pdf, htmlRuns(b.text), { size: 11, x: pdf.M, width: pdf.cw, align: ALIGN_OF(b) });
          pdf.y += 5;
      }
      drawLinksPdf(pdf, b);
    }
    // pied de page (et filigrane « Alixo » sans Alixo+, 1.24 : texte gris clair en diagonale au centre de chaque page)
    const n = pdf.pages.length;
    const wm = watermarkWanted();
    pdf.pages.forEach((p, i) => {
      pdf.page = p;
      if (wm) {
        const t = WM_TEXT, sz = 110, w = textWidth(t, sz, true);
        const c = Math.cos(Math.PI / 5), si = Math.sin(Math.PI / 5);   // rotation de 36°
        const cx = pdf.W / 2, cy = pdf.H / 2;
        pdf.op(`q 0.9 0.9 0.9 rg BT /F2 ${n2(sz)} Tf ${n2(c)} ${n2(si)} ${n2(-si)} ${n2(c)} ${n2(cx - (w / 2) * c + (sz * 0.35) * si)} ${n2(cy - (w / 2) * si - (sz * 0.35) * c)} Tm (${pdfStr(t)}) Tj ET Q`);
        const f = toCp1252('Fait avec Alixo · alixoapp.com');
        pdf.text(pdf.W - pdf.M - textWidth(f, 7.5), pdf.H - 18, f, 7.5, false, false, [150, 153, 158]);
      }
      const s = toCp1252(`${d.titre || 'Sans titre'}  ·  ${i + 1} / ${n}`);
      pdf.text(pdf.W / 2 - textWidth(s, 8.5) / 2, pdf.H - 30, s, 8.5, false, false, INK3);
    });
    return buildPdf(pdf);
  }

  function buildPdf(pdf) {
    const objs = [];
    const add = o => { objs.push(o); return objs.length; };
    const catalogId = add(null), pagesId = add(null);
    const fontIds = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique']
      .map(name => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`));
    fontIds.push(add('<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>'));   // F5 : flèches
    const imgIds = pdf.images.map(im => add({
      dict: `<< /Type /XObject /Subtype /Image /Width ${im.pw} /Height ${im.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`,
      stream: im.data
    }));
    const xobj = pdf.images.length ? ' /XObject << ' + pdf.images.map((im, i) => `/${im.name} ${imgIds[i]} 0 R`).join(' ') + ' >>' : '';
    const res = `<< /Font << /F1 ${fontIds[0]} 0 R /F2 ${fontIds[1]} 0 R /F3 ${fontIds[2]} 0 R /F4 ${fontIds[3]} 0 R /F5 ${fontIds[4]} 0 R >>${xobj} >>`;
    const pageIds = pdf.pages.map(p => {
      const content = latin1(p.ops.join('\n'));
      const cId = add({ dict: `<< /Length ${content.length} >>`, stream: content });
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n2(pdf.W)} ${n2(pdf.H)}] /Resources ${res} /Contents ${cId} 0 R >>`);
    });
    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`;

    const chunks = []; let pos = 0; const offsets = [];
    const push = u8 => { chunks.push(u8); pos += u8.length; };
    push(latin1('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    objs.forEach((o, i) => {
      offsets.push(pos);
      push(latin1(`${i + 1} 0 obj\n`));
      if (typeof o === 'string') push(latin1(o + '\n'));
      else { push(latin1(o.dict + '\nstream\n')); push(o.stream); push(latin1('\nendstream\n')); }
      push(latin1('endobj\n'));
    });
    const xref = pos;
    let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) x += String(off).padStart(10, '0') + ' 00000 n \n';
    x += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    push(latin1(x));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* ============================================================
     Écrivain Word (.docx) — WordprocessingML minimal
     ============================================================ */
  const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function runXml(r, ex = {}) {
    const b = r.b || ex.b, i = r.i || ex.i;
    const sz = r.px ? Math.round(r.px * 0.75 * 2) : ex.sz;
    const color = r.color ? hex(r.color) : ex.color;
    const props = [
      b ? '<w:b/>' : '', i ? '<w:i/>' : '', ex.caps ? '<w:caps/>' : '',
      r.u ? '<w:u w:val="single"/>' : '', r.s ? '<w:strike/>' : '',
      color ? `<w:color w:val="${color}"/>` : '',
      sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : '',
      r.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(r.bg)}"/>` : '',
      r.sup ? '<w:vertAlign w:val="superscript"/>' : (r.sub ? '<w:vertAlign w:val="subscript"/>' : '')
    ].join('');
    return String(r.text).split('\n').map((t, k) =>
      `${k ? '<w:r><w:br/></w:r>' : ''}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`).join('');
  }
  const runsXml = (runs, ex) => runs.map(r => runXml(r, ex)).join('');
  const para = (inner, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
  const jcXml = al => (al === 'center' ? '<w:jc w:val="center"/>' : al === 'right' ? '<w:jc w:val="right"/>' : al === 'justify' ? '<w:jc w:val="both"/>' : '');

  function jurisTableXml(b) {
    const f = b.fields || {}, def = ficheOf(b), cc = parseColor(def.color || JURIS_COLOR), bc = hex(blend(cc, 0.3));
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${bc}"/>`).join('');
    const cell = (inner, w, fill, span) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
    const headRuns = (b.type === 'fiche' ? runXml({ text: def.name.toUpperCase() + '   ' }, { b: true, caps: true, sz: 16, color: hex(cc) }) : '') + runsXml(htmlRuns(f.ref || (b.type === 'fiche' ? def.head : 'Référence de l’arrêt')), { b: true, color: hex(blend(cc, 0.85)) });
    let rows = `<w:tr>${cell(para(headRuns), 9000, hex(blend(cc, 0.12)), 2)}</w:tr>`;
    const lw = b.type === 'fiche' ? 2400 : 1800;
    for (const [k, lab] of def.fields) {
      if (b.type === 'fiche' && !(f[k] || '').trim()) continue;
      rows += `<w:tr>${cell(para(runXml({ text: lab }, { b: true, caps: true, sz: 16, color: hex(cc) })), lw, hex(blend(cc, 0.05)))}${cell(para(runsXml(htmlRuns(f[k] || ''))), 9000 - lw)}</w:tr>`;
    }
    return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${lw}"/><w:gridCol w:w="${9000 - lw}"/></w:tblGrid>${rows}</w:tbl>${para('')}`;
  }
  /* score clinique / calculateur → tableau Word à deux colonnes */
  function scoreTableXml(b) {
    const sl = b.type === 'score' ? scoreLines(b) : calcLines(b);
    const cc = parseColor('#c04343'), bc = hex(blend(cc, 0.3));
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${bc}"/>`).join('');
    const cell = (inner, w, fill, span) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span ? `<w:gridSpan w:val="${span}"/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
    let rows = `<w:tr>${cell(para(runXml({ text: sl.title }, { b: true, color: hex(blend(cc, 0.85)) }) + runXml({ text: sl.sub ? '   ' + sl.sub : '', color: INK3 })), 9000, hex(blend(cc, 0.12)), 2)}</w:tr>`;
    for (const [l, v] of sl.rows) rows += `<w:tr>${cell(para(runXml({ text: l })), 6300)}${cell(para(runXml({ text: v }, { b: true }), '<w:jc w:val="right"/>'), 2700)}</w:tr>`;
    rows += `<w:tr>${cell(para(runXml({ text: (b.type === 'score' ? 'Total : ' : 'Résultat : ') }, { b: true, color: hex(cc) }) + runXml({ text: sl.total }, { b: true })), 9000, hex(blend(cc, 0.05)), 2)}</w:tr>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="6300"/><w:gridCol w:w="2700"/></w:tblGrid>${rows}</w:tbl>${para('')}`;
  }

  function tableXml(b) {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return '';
    const nc = Math.max(1, ...rows.map(r => r.length));
    // 1.21 : largeurs de colonnes de l'éditeur et cases fusionnées (gridSpan / vMerge)
    let ws = Array.isArray(b.widths) && b.widths.length === nc ? b.widths.map(x => Math.max(4, +x || 0)) : Array(nc).fill(1);
    const wsum = ws.reduce((a, x) => a + x, 0) || 1; ws = ws.map(x => Math.round(x / wsum * 9000));
    const spans = Array.isArray(b.spans) ? b.spans.filter(x => x && x.r >= 0 && x.c >= 0 && (x.rs > 1 || x.cs > 1)) : [];
    const covered = new Map(); spans.forEach(x => { for (let r = x.r; r < x.r + x.rs; r++) for (let c = x.c; c < x.c + x.cs; c++) if (r !== x.r || c !== x.c) covered.set(r + ':' + c, x); });
    const spanOf = (r, c) => spans.find(x => x.r === r && x.c === c);
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="B9BEC6"/>`).join('');
    const trs = rows.map((r, ri) => {
      const head = !!b.head && ri === 0;
      return `<w:tr>${Array.from({ length: nc }, (_, ci) => {
        const cov = covered.get(ri + ':' + ci);
        if (cov && ci !== cov.c) return '';   // couverte horizontalement : comprise dans le gridSpan de l'ancre
        const sp = spanOf(ri, ci); const cs = cov ? cov.cs : (sp ? sp.cs : 1);
        const w = ws.slice(ci, ci + cs).reduce((a, x) => a + x, 0);
        const shd = (() => { const c = parseColor(cellBgOf(b, cov ? cov.r : ri, cov ? cov.c : ci)); return c ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(c)}"/>` : (head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2F6"/>' : ''); })();
        const merge = cov ? '<w:vMerge/>' : (sp && sp.rs > 1 ? '<w:vMerge w:val="restart"/>' : '');
        return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${cs > 1 ? `<w:gridSpan w:val="${cs}"/>` : ''}${merge}${shd}</w:tcPr>${cov ? para('') : para(runsXml(htmlRuns(r[ci] || ''), head ? { b: true } : {}), jcXml(cellTaOf(b, ri, ci)))}</w:tc>`;
      }).join('')}</w:tr>`;
    }).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${trs}</w:tbl>${para('')}`;
  }

  /* cartes → tableau Word à 3 colonnes (titre en gras, texte dessous) */
  function cardsTableXml(b) {
    const cards = cardsOfB(b);
    if (!cards.length) return '';
    const per = 3, w = 3000;
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D5D9DE"/>`).join('');
    let trs = '';
    for (let r0 = 0; r0 < cards.length; r0 += per) {
      trs += `<w:tr>${Array.from({ length: per }, (_, i) => {
        const c = cards[r0 + i];
        const inner = c ? (c.t ? para(runsXml(htmlRuns(c.t), { b: true }), '<w:spacing w:after="40"/>') : '') + para(runsXml(htmlRuns(c.x || ''), { color: hex(INK2) })) : para('');
        return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${c ? '<w:shd w:val="clear" w:color="auto" w:fill="F7F8FA"/>' : ''}</w:tcPr>${inner}</w:tc>`;
      }).join('')}</w:tr>`;
    }
    return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: per }, () => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${trs}</w:tbl>${para('')}`;
  }

  function imageParaXml(n, img, frac = 1, align = 'center') {
    const cx = Math.round(5400000 * frac), cy = Math.round(cx * img.h / img.w);
    return `<w:p><w:pPr><w:jc w:val="${align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'}"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Graphique ${n}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="graph${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="C9CCD1"/></w:pBdr></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
${[1, 2, 3, 4].map(l => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${l === 1 ? 360 : 240}" w:after="120"/><w:ind w:left="${(l - 1) * 280}"/><w:outlineLvl w:val="${l - 1}"/></w:pPr><w:rPr><w:b/>${l === 4 ? '<w:i/>' : ''}<w:sz w:val="${[32, 28, 25, 23][l - 1]}"/><w:szCs w:val="${[32, 28, 25, 23][l - 1]}"/></w:rPr></w:style>`).join('\n')}
</w:styles>`;

  async function exportDocDocx(d) {
    const numMap = computeNumbers(d.blocks);
    const images = [];
    let body = para(runXml({ text: d.titre || 'Sans titre' }), '<w:pStyle w:val="Title"/>');
    for (const b of d.blocks) {
      switch (b.type) {
        case 'h':
          body += para(runXml({ text: (numMap[b.id] || '') + '  ', b: true, color: ACCENT }) + runsXml(htmlRuns(b.text)), `<w:pStyle w:val="Heading${Math.min(4, Math.max(1, +b.level || 1))}"/>${b.level > 4 ? `<w:ind w:left="${(b.level - 1) * 280}"/>` : ''}${jcXml(ALIGN_OF(b))}`);
          break;
        case 'li': {
          const { mark, ind } = listMark(b, numMap);
          body += para(runXml({ text: mark.trim() + '\t', color: b.lt === 'ol' ? ACCENT : undefined }) + runsXml(htmlRuns(b.text), b.lt === 'cl' && b.done ? { color: hex(INK3) } : {}), `<w:ind w:left="${567 + ind * 360}" w:hanging="283"/><w:spacing w:after="60"/>${jcXml(ALIGN_OF(b))}`);
          break;
        }
        case 'draw': {
          const img = await rasterizeDraw(b, 'image/png');
          if (!img) break;
          images.push(img);
          body += imageParaXml(images.length, img, 1, 'center');
          break;
        }
        case 'img': {
          const img = await rasterizeImage(b, 'image/png');
          if (!img) break;
          images.push(img);
          body += imageParaXml(images.length, img, Math.max(0.08, Math.min(1, (b.w || 60) / 100)), b.align || 'center');
          if (b.cap) body += para(runsXml(htmlRuns(b.cap), { i: true, color: hex(INK2), sz: 19 }), '<w:jc w:val="center"/>');
          break;
        }
        case 'quote':
          body += para(runsXml(htmlRuns(b.text), { i: true, color: hex(INK2) }), '<w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="10" w:color="33658A"/></w:pBdr>' + (b.cite ? '<w:spacing w:after="0"/>' : '') + jcXml(ALIGN_OF(b)));
          if (b.cite) body += para(runsXml(htmlRuns(b.cite), { color: hex(INK3), sz: 19 }), '<w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="10" w:color="33658A"/></w:pBdr>' + jcXml(ALIGN_OF(b)));
          break;
        case 'chart': {
          const img = await rasterizeChart(b, 'image/png');
          if (!img) break;
          images.push(img);
          body += imageParaXml(images.length, img, 0.92);
          break;
        }
        case 'score':
        case 'mcalc': body += scoreTableXml(b); break;
        case 'timer': body += para(runXml({ text: timerText(b), b: true, color: INK2 })); break;
        case 'callout': {
          const cc = parseColor(CALLOUT_COLORS[b.ct] || CALLOUT_COLORS.retenir);
          const co = CALLOUTS[b.ct] || CALLOUTS.retenir;
          const name = co.name + (co.sub ? '  —  ' + co.sub : '');
          const pPr = `<w:shd w:val="clear" w:color="auto" w:fill="${hex(blend(cc, 0.08))}"/><w:pBdr><w:left w:val="single" w:sz="24" w:space="10" w:color="${hex(cc)}"/></w:pBdr><w:ind w:left="170"/>`;
          body += para(runXml({ text: name }, { b: true, caps: true, sz: 16, color: hex(cc) }), pPr + '<w:spacing w:before="160" w:after="0"/><w:keepNext/>');
          body += para(runsXml(htmlRuns(b.text)), pPr + '<w:spacing w:before="0" w:after="200"/>' + jcXml(ALIGN_OF(b)));
          break;
        }
        case 'juris':
        case 'fiche': body += jurisTableXml(b); break;
        case 'table': body += tableXml(b); break;
        case 'hr': body += para('', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9CCD1"/></w:pBdr><w:spacing w:before="120" w:after="200"/>'); break;
        case 'pb': body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; break;   // 1.23 : saut de page
        case 'cards': body += cardsTableXml(b); break;
        case 'tree': {   // 1.20 : arbre → plan indenté
          const walk = (n, depth) => { if (!n) return; body += para((depth ? runXml({ text: '└ ', color: INK3 }) : '') + runsXml(htmlRuns(n.t || ''), depth ? {} : { b: true }), `<w:ind w:left="${360 + depth * 360}"/>`); (n.k || []).forEach(c => walk(c, depth + 1)); };
          walk(b.root, 0);
          break;
        }
        case 'formula': body += para(runXml({ text: b.src || '', i: true }), '<w:jc w:val="center"/>'); break;
        case 'graph': {
          const img = await rasterizeGraph(b, 'image/png');
          images.push(img);
          body += imageParaXml(images.length, img);
          break;
        }
        default: body += para(runsXml(htmlRuns(b.text)), jcXml(ALIGN_OF(b)));
      }
      for (const l of linksOf(b)) {
        const img = await qrPng(l.url, 200); if (!img) continue;
        images.push(img);
        body += imageParaXml(images.length, Object.assign({}, img, { w: 60, h: 60 }));
        body += para(runXml({ text: l.label, b: true }) + runXml({ text: '  ' + l.url, color: [70, 73, 78] }), '<w:jc w:val="center"/>');
      }
    }
    /* filigrane « Alixo » (1.24, sans Alixo+) : un en-tête de page portant une forme WordArt en diagonale, comme
       le filigrane de Word (Création › Filigrane) ; il se répète sur toutes les pages */
    const wm = watermarkWanted();
    const headerXml = wm ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:pict><v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype><v:shape id="PowerPlusWaterMarkObject1" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:460pt;height:115pt;rotation:315;z-index:-251656192;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f"><v:fill opacity=".45"/><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="${WM_TEXT}"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr>${runXml({ text: 'Fait avec Alixo · alixoapp.com', color: [150, 153, 158] })}</w:p></w:hdr>` : '';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr>${wm ? '<w:headerReference w:type="default" r:id="rIdHdr1"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${wm ? '<Relationship Id="rIdHdr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ''}${images.map((im, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/graph${i + 1}.png"/>`).join('')}</Relationships>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${wm ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}</Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const enc = new TextEncoder();
    const files = [
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rootRels) },
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(STYLES_XML) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(rels) },
      ...(wm ? [{ name: 'word/header1.xml', data: enc.encode(headerXml) }] : []),
      ...images.map((im, i) => ({ name: `word/media/graph${i + 1}.png`, data: im.data }))
    ];
    const blob = makeZip(files);
    return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  window.AlixoExport = { exportDocPdf, exportDocDocx, rasterizeGraph, rasterizeImage, rasterizeDraw, rasterizeChart, htmlRuns };
})();
