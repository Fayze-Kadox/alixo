/* ============================================================
   Alixo — tableurs (1.17)
   Un tableur est une séance particulière : { kind: 'sheet', sheets: [...] }
   (d.blocks reste vide : synchronisation, onglets, bibliothèque, corbeille
   et partage n'ont rien de nouveau à connaître).

   Une feuille = { id, name, cells, cols, rows, nc, nr, frozen }
   - cells : { 'A1': cellule } en notation A1 (colonnes A, B… Z, AA…)
   - une cellule = { v, b, i, u, a, c, bg, fmt, dec, w }
       v   valeur saisie (texte ; « = » au début : formule)
       b/i/u gras, italique, souligné · a alignement · c couleur du texte
       bg  fond · fmt format de nombre ('', 'num', 'eur', 'pct', 'date')
       dec nombre de décimales · w renvoi à la ligne
   - cols / rows : largeurs et hauteurs modifiées (par index)

   Formules : =A1+B2, plages A1:B10, opérateurs + − × ÷ ^ % & et comparaisons,
   une cinquantaine de fonctions en français et en anglais (SOMME/SUM,
   MOYENNE/AVERAGE, SI/IF, RECHERCHEV/VLOOKUP…), détection des cycles.

   Aide aux formules (1.18) : assistant sous la cellule (noms proposés, signature, aperçu, erreurs
   expliquées), cellules référencées surlignées, fenêtre « Insérer une fonction », guide complet.

   Raccourcis : flèches se déplacer, Tab / Entrée valider, F2 modifier,
   Suppr effacer, Ctrl+C/X/V copier-coller (aussi hors d'Alixo, en TSV),
   Ctrl+Z / Ctrl+Y, Ctrl+B/I/U, Ctrl+A tout sélectionner, Ctrl+P export PDF.

   Chargé APRÈS app.js : utilise ses globales (state, doc(), save(), openTabs,
   renderTabs, renderCrumbs, showLibrary, toast, esc, uid, folderTint…).
   ============================================================ */
'use strict';

window.AlixoSheets = (() => {
  const DEF_COLS = 26, DEF_ROWS = 100;
  const MAX_COLS = 260, MAX_ROWS = 5000;
  const COL_W = 104, ROW_H = 26, HEAD_W = 46;
  const HIST_MAX = 60;
  const ERR = { DIV: '#DIV/0!', REF: '#REF!', NAME: '#NOM?', VAL: '#VALEUR!', CYC: '#CYCLE!', NUM: '#NOMBRE!', NA: '#N/A' };
  const isErr = v => typeof v === 'string' && v.charCodeAt(0) === 35 && Object.values(ERR).includes(v);
  const FILL_COLORS = ['', '#fde8e8', '#fdf0d5', '#e7f4e4', '#e2eef7', '#eae4f5', '#f3e9e0', '#eceff1', '#33658a', '#2f7d68', '#b3762a', '#c04343'];
  const TEXT_COLORS = ['', '#c04343', '#b3762a', '#2f7d68', '#33658a', '#7a5ca8', '#8c4351', '#5f6368'];
  const FORMATS = [
    ['', 'Automatique', 'Texte ou nombre, tel quel'],
    ['num', 'Nombre', '1 234,50'],
    ['eur', 'Monnaie (€)', '1 234,50 €'],
    ['pct', 'Pourcentage', '12,50 %'],
    ['date', 'Date', '22 sept. 2026']
  ];

  const I = {
    bold: '<svg viewBox="0 0 24 24"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7Zm0 7h7a3.5 3.5 0 0 1 0 7H7Z"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
    center: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
    rowAdd: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="1.5"/><path d="M12 14v6M9 17h6"/></svg>',
    colAdd: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="6" height="18" rx="1.5"/><path d="M17 9v6M14 12h6"/></svg>',
    rowDel: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="1.5"/><path d="M9 17h6"/></svg>',
    colDel: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="6" height="18" rx="1.5"/><path d="M14 12h6"/></svg>',
    sortAZ: '<svg viewBox="0 0 24 24"><path d="M6 4v16M3 17l3 3 3-3"/><path d="M13 6h8M13 11h6M13 16h4"/></svg>',
    sortZA: '<svg viewBox="0 0 24 24"><path d="M6 20V4M3 7l3-3 3 3"/><path d="M13 6h4M13 11h6M13 16h8"/></svg>',
    freeze: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    fx: '<svg viewBox="0 0 24 24"><path d="M14 5h-2.2A2.8 2.8 0 0 0 9 7.8V19M7 11h6"/><path d="m16 11 5 8M21 11l-5 8"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    csv: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>',
    imp: '<svg viewBox="0 0 24 24"><path d="M12 14V3"/><path d="m7.5 7 4.5-4 4.5 4"/><path d="M4 20h16"/></svg>',
    wrap: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h12a3 3 0 0 1 0 6h-3"/><path d="m14 15-2 3 2 3"/><path d="M4 18h4"/></svg>'
  };

  /* ---------------- repères A1 ---------------- */
  function colName(c) {
    let s = '';
    for (let n = c; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
    return s;
  }
  function colIndex(s) {
    let n = 0;
    for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  const key = (r, c) => colName(c) + (r + 1);
  function parseRef(s) {
    const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,5})$/.exec(s);
    if (!m) return null;
    return { r: +m[2] - 1, c: colIndex(m[1]) };
  }

  /* ---------------- état ---------------- */
  const d = () => (typeof doc === 'function' ? doc() : null);
  const sheetsOf = dd => (Array.isArray(dd && dd.sheets) ? dd.sheets : (dd ? (dd.sheets = []) : []));
  let curSheet = '';                 // identifiant de la feuille affichée
  let sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 };
  let readOnly = false;
  let editing = null;                // { r, c, input } pendant la saisie
  let hist = { undo: [], redo: [] };
  let clip = null;                   // { cells: [[cellule|null]], cut: {r,c} | null }
  let dragSel = null, dragSize = null;
  let saveTm = null, remoteTm = null;
  let chartOn = false;               // panneau « graphique de la sélection »
  const tds = new Map();             // 'r,c' → <td> (grille dessinée)

  const active = () => document.body.classList.contains('mode-sheet');
  function sheet() {
    const dd = d(); if (!dd) return null;
    const list = sheetsOf(dd);
    return list.find(s => s.id === curSheet) || list[0] || null;
  }
  const cellsOf = s => (s.cells || (s.cells = {}));
  const cellAt = (s, r, c) => (s.cells ? s.cells[key(r, c)] : null) || null;
  const colW = (s, c) => (s.cols && s.cols[c]) || COL_W;
  const rowH = (s, r) => (s.rows && s.rows[r]) || ROW_H;
  const nCols = s => Math.max(1, Math.min(MAX_COLS, s.nc || DEF_COLS));
  const nRows = s => Math.max(1, Math.min(MAX_ROWS, s.nr || DEF_ROWS));
  const norm = () => ({ r1: Math.min(sel.r1, sel.r2), r2: Math.max(sel.r1, sel.r2), c1: Math.min(sel.c1, sel.c2), c2: Math.max(sel.c1, sel.c2) });
  const inSel = (r, c) => { const n = norm(); return r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2; };

  function newSheet(name) {
    return { id: uid(), name: name || 'Feuille 1', cells: {}, cols: {}, rows: {}, nc: DEF_COLS, nr: DEF_ROWS, frozen: { r: 0, c: 0 } };
  }
  function newDoc(fid, prof) {
    const dd = { id: uid(), kind: 'sheet', folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: prof || '', blocks: [], sheets: [] };
    dd.sheets.push(newSheet('Feuille 1'));
    return dd;
  }

  /* ============================================================
     Calcul : analyse et évaluation des formules
     ============================================================ */
  const numOf = v => {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null || v === undefined || v === '') return 0;
    if (isErr(v)) return v;
    const n = parseFrNumber(String(v));
    return n === null ? ERR.VAL : n;
  };
  /* « 1 234,5 », « 12,5 % », « 3.25 », « 4 € » → nombre (null si ce n'est pas un nombre) */
  function parseFrNumber(txt) {
    let t = String(txt).trim();
    if (!t) return null;
    let mult = 1;
    if (/%$/.test(t)) { mult = 0.01; t = t.slice(0, -1).trim(); }
    else if (/€$/.test(t)) t = t.slice(0, -1).trim();
    t = t.replace(/ | /g, '').replace(/\s/g, '');
    if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');      // 1.234.567,89
    t = t.replace(',', '.');
    if (!/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
    const n = parseFloat(t);
    return isFinite(n) ? n * mult : null;
  }
  /* valeur « brute » d'une cellule : nombre, booléen, texte ou erreur */
  function rawValue(s, r, c, seen) {
    const cell = cellAt(s, r, c);
    if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return '';
    const v = String(cell.v);
    if (v[0] === '=') return evalFormula(s, v.slice(1), r, c, seen);
    if (v === 'VRAI' || v === 'TRUE') return true;
    if (v === 'FAUX' || v === 'FALSE') return false;
    const n = parseFrNumber(v);
    return n === null ? v : n;
  }
  /* cache d'un cycle de calcul (vidé à chaque recalcul complet) */
  let calcCache = new Map();
  function valueAt(s, r, c, seen) {
    const k = s.id + '!' + key(r, c);
    if (calcCache.has(k)) return calcCache.get(k);
    const stack = seen || new Set();
    if (stack.has(k)) return ERR.CYC;
    stack.add(k);
    let out;
    try { out = rawValue(s, r, c, stack); } catch { out = ERR.VAL; }
    stack.delete(k);
    calcCache.set(k, out);
    return out;
  }

  /* --- lexer --- */
  function tokenize(src) {
    const t = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
      if (ch === '"') {
        let j = i + 1, out = '';
        while (j < src.length) {
          if (src[j] === '"') { if (src[j + 1] === '"') { out += '"'; j += 2; continue; } break; }
          out += src[j++];
        }
        t.push({ t: 'str', v: out }); i = j + 1; continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i;
        while (j < src.length && /[0-9.,]/.test(src[j])) j++;
        if (/[eE]/.test(src[j] || '') && /[0-9+-]/.test(src[j + 1] || '')) { j += 2; while (j < src.length && /[0-9]/.test(src[j])) j++; }
        const raw = src.slice(i, j).replace(',', '.');
        t.push({ t: 'num', v: parseFloat(raw) }); i = j; continue;
      }
      if (/[A-Za-zÀ-ÿ_$]/.test(ch)) {
        let j = i;
        while (j < src.length && /[A-Za-zÀ-ÿ0-9_.$]/.test(src[j])) j++;
        t.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
      }
      if (ch === '#') {                                   // erreur laissée par une suppression : #REF!, #DIV/0!…
        const err = Object.values(ERR).find(e => src.startsWith(e, i));
        if (err) { t.push({ t: 'err', v: err }); i += err.length; continue; }
        throw new Error('char');
      }
      const two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') { t.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/^%&()<>=:;,'.includes(ch)) { t.push({ t: ch === ',' || ch === ';' ? 'sep' : 'op', v: ch }); i++; continue; }
      throw new Error('char');
    }
    return t;
  }

  /* --- parseur (descente récursive) → arbre --- */
  function parse(src) {
    const t = tokenize(src);
    let p = 0;
    const peek = () => t[p];
    const eat = v => { const x = t[p]; if (!x || (v && x.v !== v)) throw new Error('syntax'); p++; return x; };
    function expr() { return cmp(); }
    function cmp() {
      let l = concat();
      while (peek() && peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const o = eat().v; l = { n: 'bin', o, l, r: concat() }; }
      return l;
    }
    function concat() {
      let l = add();
      while (peek() && peek().v === '&' && peek().t === 'op') { eat(); l = { n: 'bin', o: '&', l, r: add() }; }
      return l;
    }
    function add() {
      let l = mul();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const o = eat().v; l = { n: 'bin', o, l, r: mul() }; }
      return l;
    }
    function mul() {
      let l = unary();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { const o = eat().v; l = { n: 'bin', o, l, r: unary() }; }
      return l;
    }
    function unary() {
      if (peek() && peek().t === 'op' && (peek().v === '-' || peek().v === '+')) { const o = eat().v; return { n: 'un', o, e: unary() }; }
      return pow();
    }
    function pow() {
      const l = postfix();
      if (peek() && peek().t === 'op' && peek().v === '^') { eat(); return { n: 'bin', o: '^', l, r: unary() }; }
      return l;
    }
    function postfix() {
      let e = atom();
      while (peek() && peek().t === 'op' && peek().v === '%') { eat(); e = { n: 'pct', e }; }
      return e;
    }
    function atom() {
      const x = peek();
      if (!x) throw new Error('eof');
      if (x.t === 'num') { eat(); return { n: 'num', v: x.v }; }
      if (x.t === 'str') { eat(); return { n: 'str', v: x.v }; }
      if (x.t === 'err') { eat(); return { n: 'err', v: x.v }; }
      if (x.t === 'op' && x.v === '(') { eat('('); const e = expr(); eat(')'); return e; }
      if (x.t === 'id') {
        eat();
        const name = x.v;
        if (peek() && peek().t === 'op' && peek().v === '(') {
          eat('(');
          const args = [];
          if (!(peek() && peek().v === ')')) {
            args.push(expr());
            while (peek() && peek().t === 'sep') { eat(); args.push(expr()); }
          }
          eat(')');
          return { n: 'fn', name: name.toUpperCase(), args };
        }
        const up = name.toUpperCase();
        if (up === 'VRAI' || up === 'TRUE') return { n: 'bool', v: true };
        if (up === 'FAUX' || up === 'FALSE') return { n: 'bool', v: false };
        const ref = parseRef(name);
        if (ref) {
          if (peek() && peek().t === 'op' && peek().v === ':') {
            eat(':');
            const y = eat();
            const ref2 = parseRef(String(y.v));
            if (!ref2) throw new Error('ref');
            return { n: 'range', a: ref, b: ref2 };
          }
          return { n: 'ref', r: ref.r, c: ref.c };
        }
        return { n: 'name', v: up };
      }
      throw new Error('syntax');
    }
    const out = expr();
    if (p < t.length) throw new Error('trailing');
    return out;
  }

  const astCache = new Map();
  function astOf(src) {
    if (astCache.has(src)) return astCache.get(src);
    let a;
    try { a = parse(src); } catch { a = { n: 'err', v: ERR.NAME }; }
    if (astCache.size > 4000) astCache.clear();
    astCache.set(src, a);
    return a;
  }
  function evalFormula(s, src, r, c, seen) {
    if (!String(src).trim()) return '';
    return evalNode(astOf(src), s, seen);
  }

  /* aplatit les arguments (une plage devient la liste de ses valeurs) */
  function flat(args, s, seen, keepBlank) {
    const out = [];
    for (const a of args) {
      if (a && a.n === 'range') { for (const v of rangeValues(a, s, seen)) if (keepBlank || v !== '') out.push(v); }
      else { const v = evalNode(a, s, seen); if (keepBlank || v !== '') out.push(v); }
    }
    return out;
  }
  function rangeValues(node, s, seen) {
    const r1 = Math.min(node.a.r, node.b.r), r2 = Math.max(node.a.r, node.b.r);
    const c1 = Math.min(node.a.c, node.b.c), c2 = Math.max(node.a.c, node.b.c);
    const out = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(valueAt(s, r, c, seen));
    return out;
  }
  /* nombres d'une liste de valeurs ; propage la première erreur rencontrée */
  function nums(list) {
    const out = [];
    for (const v of list) {
      if (isErr(v)) return v;
      if (typeof v === 'number') out.push(v);
      else if (typeof v === 'boolean') out.push(v ? 1 : 0);
      else if (typeof v === 'string' && v !== '') { const n = parseFrNumber(v); if (n !== null) out.push(n); }
    }
    return out;
  }
  const truthy = v => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : String(v).toUpperCase() === 'VRAI' || String(v).toUpperCase() === 'TRUE');
  const txt = v => (v === '' || v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'VRAI' : 'FAUX') : String(v));

  function compare(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
    const x = txt(a).toLowerCase(), y = txt(b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  /* critère de SOMME.SI / NB.SI : « >10 », « <>a », « Droit », « *éco* » */
  function matcher(crit) {
    const m = /^(<=|>=|<>|<|>|=)?\s*(.*)$/.exec(txt(crit));
    const op = m[1] || '=', rest = m[2];
    const n = parseFrNumber(rest);
    return v => {
      if (n !== null) {
        const x = typeof v === 'number' ? v : parseFrNumber(txt(v));
        if (x === null) return op === '<>';
        return op === '=' ? x === n : op === '<>' ? x !== n : op === '<' ? x < n : op === '>' ? x > n : op === '<=' ? x <= n : x >= n;
      }
      const a = txt(v).toLowerCase(), b = rest.toLowerCase();
      if (/[*?]/.test(b)) {
        const re = new RegExp('^' + b.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return op === '<>' ? !re.test(a) : re.test(a);
      }
      return op === '<>' ? a !== b : a === b;
    };
  }
  const DAY = 86400000;
  const serialToDate = n => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * DAY);
  const dateToSerial = dt => Math.round((Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) - Date.UTC(1899, 11, 30)) / DAY);

  const FN = {
    /* --- somme et statistiques --- */
    SOMME: (a, s, seen) => { const n = nums(flat(a, s, seen)); return isErr(n) ? n : n.reduce((x, y) => x + y, 0); },
    MOYENNE: (a, s, seen) => { const n = nums(flat(a, s, seen)); return isErr(n) ? n : (n.length ? n.reduce((x, y) => x + y, 0) / n.length : ERR.DIV); },
    MIN: (a, s, seen) => { const n = nums(flat(a, s, seen)); return isErr(n) ? n : (n.length ? Math.min(...n) : 0); },
    MAX: (a, s, seen) => { const n = nums(flat(a, s, seen)); return isErr(n) ? n : (n.length ? Math.max(...n) : 0); },
    NB: (a, s, seen) => { const n = nums(flat(a, s, seen)); return isErr(n) ? n : n.length; },
    NBVAL: (a, s, seen) => flat(a, s, seen).length,
    'NB.VIDE': (a, s, seen) => flat(a, s, seen, true).filter(v => v === '').length,
    PRODUIT: (a, s, seen) => { const n = nums(flat(a, s, seen)); return isErr(n) ? n : n.reduce((x, y) => x * y, 1); },
    MEDIANE: (a, s, seen) => {
      const n = nums(flat(a, s, seen)); if (isErr(n)) return n;
      if (!n.length) return ERR.NUM;
      const t = n.slice().sort((x, y) => x - y), m = t.length >> 1;
      return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
    },
    ECARTYPE: (a, s, seen) => {
      const n = nums(flat(a, s, seen)); if (isErr(n)) return n;
      if (n.length < 2) return ERR.DIV;
      const m = n.reduce((x, y) => x + y, 0) / n.length;
      return Math.sqrt(n.reduce((x, y) => x + (y - m) * (y - m), 0) / (n.length - 1));
    },
    VAR: (a, s, seen) => { const v = FN.ECARTYPE(a, s, seen); return typeof v === 'number' ? v * v : v; },
    'SOMME.SI': (a, s, seen) => {
      if (a.length < 2) return ERR.VAL;
      const rng = a[0].n === 'range' ? rangeValues(a[0], s, seen) : [evalNode(a[0], s, seen)];
      const ok = matcher(evalNode(a[1], s, seen));
      const sum = a[2] ? (a[2].n === 'range' ? rangeValues(a[2], s, seen) : [evalNode(a[2], s, seen)]) : rng;
      let t = 0;
      rng.forEach((v, i) => { if (ok(v)) { const n = typeof sum[i] === 'number' ? sum[i] : parseFrNumber(txt(sum[i])); if (n !== null) t += n; } });
      return t;
    },
    'NB.SI': (a, s, seen) => {
      if (a.length < 2) return ERR.VAL;
      const rng = a[0].n === 'range' ? rangeValues(a[0], s, seen) : [evalNode(a[0], s, seen)];
      const ok = matcher(evalNode(a[1], s, seen));
      return rng.filter(ok).length;
    },
    'MOYENNE.SI': (a, s, seen) => {
      const t = FN['SOMME.SI'](a, s, seen), n = FN['NB.SI']([a[0], a[1]], s, seen);
      return isErr(t) ? t : (n ? t / n : ERR.DIV);
    },
    RANG: (a, s, seen) => {
      const v = numOf(evalNode(a[0], s, seen)); if (isErr(v)) return v;
      const n = nums(a[1] && a[1].n === 'range' ? rangeValues(a[1], s, seen) : flat(a.slice(1), s, seen));
      if (isErr(n)) return n;
      const desc = !a[2] || !truthy(evalNode(a[2], s, seen));
      const t = n.slice().sort((x, y) => (desc ? y - x : x - y));
      const i = t.indexOf(v);
      return i < 0 ? ERR.NA : i + 1;
    },

    /* --- mathématiques --- */
    ABS: (a, s, seen) => un(a, s, seen, Math.abs),
    RACINE: (a, s, seen) => un(a, s, seen, x => (x < 0 ? ERR.NUM : Math.sqrt(x))),
    PUISSANCE: (a, s, seen) => bin(a, s, seen, (x, y) => Math.pow(x, y)),
    ARRONDI: (a, s, seen) => bin2(a, s, seen, (x, n) => { const p = Math.pow(10, n); return Math.round((x + Number.EPSILON * Math.sign(x)) * p) / p; }),
    'ARRONDI.INF': (a, s, seen) => bin2(a, s, seen, (x, n) => { const p = Math.pow(10, n); return Math.floor(x * p) / p; }),
    'ARRONDI.SUP': (a, s, seen) => bin2(a, s, seen, (x, n) => { const p = Math.pow(10, n); return Math.ceil(x * p) / p; }),
    ENT: (a, s, seen) => un(a, s, seen, Math.floor),
    MOD: (a, s, seen) => bin(a, s, seen, (x, y) => (y === 0 ? ERR.DIV : x - y * Math.floor(x / y))),
    SIGNE: (a, s, seen) => un(a, s, seen, Math.sign),
    EXP: (a, s, seen) => un(a, s, seen, Math.exp),
    LN: (a, s, seen) => un(a, s, seen, x => (x > 0 ? Math.log(x) : ERR.NUM)),
    LOG10: (a, s, seen) => un(a, s, seen, x => (x > 0 ? Math.log10(x) : ERR.NUM)),
    PI: () => Math.PI,
    ALEA: () => Math.random(),
    'ALEA.ENTRE.BORNES': (a, s, seen) => bin(a, s, seen, (x, y) => Math.floor(x + Math.random() * (y - x + 1))),

    /* --- logique --- */
    SI: (a, s, seen) => {
      if (!a.length) return ERR.VAL;
      const t = evalNode(a[0], s, seen);
      if (isErr(t)) return t;
      return truthy(t) ? (a[1] ? evalNode(a[1], s, seen) : true) : (a[2] ? evalNode(a[2], s, seen) : false);
    },
    ET: (a, s, seen) => flat(a, s, seen).every(truthy),
    OU: (a, s, seen) => flat(a, s, seen).some(truthy),
    NON: (a, s, seen) => !truthy(evalNode(a[0], s, seen)),
    SIERREUR: (a, s, seen) => { const v = evalNode(a[0], s, seen); return isErr(v) ? (a[1] ? evalNode(a[1], s, seen) : '') : v; },
    ESTVIDE: (a, s, seen) => evalNode(a[0], s, seen) === '',
    ESTNUM: (a, s, seen) => typeof evalNode(a[0], s, seen) === 'number',
    ESTTEXTE: (a, s, seen) => { const v = evalNode(a[0], s, seen); return typeof v === 'string' && !isErr(v) && v !== ''; },

    /* --- texte --- */
    CONCATENER: (a, s, seen) => flat(a, s, seen, true).map(txt).join(''),
    GAUCHE: (a, s, seen) => txt(evalNode(a[0], s, seen)).slice(0, a[1] ? Math.max(0, numOf(evalNode(a[1], s, seen))) : 1),
    DROITE: (a, s, seen) => { const t = txt(evalNode(a[0], s, seen)); const n = a[1] ? Math.max(0, numOf(evalNode(a[1], s, seen))) : 1; return n ? t.slice(-n) : ''; },
    STXT: (a, s, seen) => txt(evalNode(a[0], s, seen)).substr(Math.max(0, numOf(evalNode(a[1], s, seen)) - 1), numOf(evalNode(a[2], s, seen))),
    NBCAR: (a, s, seen) => txt(evalNode(a[0], s, seen)).length,
    MAJUSCULE: (a, s, seen) => txt(evalNode(a[0], s, seen)).toUpperCase(),
    MINUSCULE: (a, s, seen) => txt(evalNode(a[0], s, seen)).toLowerCase(),
    SUPPRESPACE: (a, s, seen) => txt(evalNode(a[0], s, seen)).trim().replace(/\s+/g, ' '),
    TEXTE: (a, s, seen) => txt(evalNode(a[0], s, seen)),
    CNUM: (a, s, seen) => { const n = parseFrNumber(txt(evalNode(a[0], s, seen))); return n === null ? ERR.VAL : n; },

    /* --- dates --- */
    AUJOURDHUI: () => dateToSerial(new Date()),
    MAINTENANT: () => dateToSerial(new Date()) + (new Date().getHours() * 3600 + new Date().getMinutes() * 60) / 86400,
    ANNEE: (a, s, seen) => un(a, s, seen, x => serialToDate(x).getUTCFullYear()),
    MOIS: (a, s, seen) => un(a, s, seen, x => serialToDate(x).getUTCMonth() + 1),
    JOUR: (a, s, seen) => un(a, s, seen, x => serialToDate(x).getUTCDate()),
    DATE: (a, s, seen) => {
      const y = numOf(evalNode(a[0], s, seen)), m = numOf(evalNode(a[1], s, seen)), j = numOf(evalNode(a[2], s, seen));
      if (isErr(y) || isErr(m) || isErr(j)) return ERR.VAL;
      return Math.round((Date.UTC(y, m - 1, j) - Date.UTC(1899, 11, 30)) / DAY);
    },

    /* --- recherche --- */
    RECHERCHEV: (a, s, seen) => {
      if (a.length < 3 || a[1].n !== 'range') return ERR.VAL;
      const needle = evalNode(a[0], s, seen);
      const col = numOf(evalNode(a[2], s, seen));
      if (isErr(col) || col < 1) return ERR.VAL;
      const r1 = Math.min(a[1].a.r, a[1].b.r), r2 = Math.max(a[1].a.r, a[1].b.r);
      const c1 = Math.min(a[1].a.c, a[1].b.c), c2 = Math.max(a[1].a.c, a[1].b.c);
      if (c1 + col - 1 > c2) return ERR.REF;
      for (let r = r1; r <= r2; r++) if (compare(valueAt(s, r, c1, seen), needle) === 0) return valueAt(s, r, c1 + col - 1, seen);
      return ERR.NA;
    },
    INDEX: (a, s, seen) => {
      if (!a.length || a[0].n !== 'range') return ERR.VAL;
      const r1 = Math.min(a[0].a.r, a[0].b.r), c1 = Math.min(a[0].a.c, a[0].b.c);
      const r2 = Math.max(a[0].a.r, a[0].b.r), c2 = Math.max(a[0].a.c, a[0].b.c);
      const dr = a[1] ? numOf(evalNode(a[1], s, seen)) : 1, dc = a[2] ? numOf(evalNode(a[2], s, seen)) : 1;
      const r = r1 + dr - 1, c = c1 + dc - 1;
      if (r < r1 || r > r2 || c < c1 || c > c2) return ERR.REF;
      return valueAt(s, r, c, seen);
    },
    EQUIV: (a, s, seen) => {
      if (a.length < 2 || a[1].n !== 'range') return ERR.VAL;
      const needle = evalNode(a[0], s, seen);
      const list = rangeValues(a[1], s, seen);
      const i = list.findIndex(v => compare(v, needle) === 0);
      return i < 0 ? ERR.NA : i + 1;
    }
  };
  /* aides pour les fonctions à un ou deux arguments numériques */
  function un(a, s, seen, f) { const v = numOf(evalNode(a[0], s, seen)); return isErr(v) ? v : f(v); }
  function bin(a, s, seen, f) { const x = numOf(evalNode(a[0], s, seen)), y = numOf(evalNode(a[1], s, seen)); return isErr(x) ? x : isErr(y) ? y : f(x, y); }
  function bin2(a, s, seen, f) { const x = numOf(evalNode(a[0], s, seen)); const y = a[1] ? numOf(evalNode(a[1], s, seen)) : 0; return isErr(x) ? x : isErr(y) ? y : f(x, y); }

  /* noms anglais acceptés en plus des noms français */
  const ALIAS = {
    SUM: 'SOMME', AVERAGE: 'MOYENNE', COUNT: 'NB', COUNTA: 'NBVAL', COUNTBLANK: 'NB.VIDE', PRODUCT: 'PRODUIT',
    MEDIAN: 'MEDIANE', STDEV: 'ECARTYPE', 'STDEV.S': 'ECARTYPE', SUMIF: 'SOMME.SI', COUNTIF: 'NB.SI', AVERAGEIF: 'MOYENNE.SI',
    RANK: 'RANG', SQRT: 'RACINE', POWER: 'PUISSANCE', ROUND: 'ARRONDI', ROUNDDOWN: 'ARRONDI.INF', ROUNDUP: 'ARRONDI.SUP',
    INT: 'ENT', SIGN: 'SIGNE', LOG: 'LN', RAND: 'ALEA', RANDBETWEEN: 'ALEA.ENTRE.BORNES',
    IF: 'SI', AND: 'ET', OR: 'OU', NOT: 'NON', IFERROR: 'SIERREUR', ISBLANK: 'ESTVIDE', ISNUMBER: 'ESTNUM', ISTEXT: 'ESTTEXTE',
    CONCAT: 'CONCATENER', CONCATENATE: 'CONCATENER', LEFT: 'GAUCHE', RIGHT: 'DROITE', MID: 'STXT', LEN: 'NBCAR',
    UPPER: 'MAJUSCULE', LOWER: 'MINUSCULE', TRIM: 'SUPPRESPACE', VALUE: 'CNUM',
    TODAY: 'AUJOURDHUI', NOW: 'MAINTENANT', YEAR: 'ANNEE', MONTH: 'MOIS', DAY: 'JOUR',
    VLOOKUP: 'RECHERCHEV', MATCH: 'EQUIV'
  };

  function evalNode(node, s, seen) {
    if (!node) return '';
    switch (node.n) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'bool': return node.v;
      case 'err': return node.v;
      case 'name': return ERR.NAME;
      case 'ref': return valueAt(s, node.r, node.c, seen);
      case 'range': { const v = rangeValues(node, s, seen); return v.length ? v[0] : ''; }
      case 'pct': { const v = numOf(evalNode(node.e, s, seen)); return isErr(v) ? v : v / 100; }
      case 'un': { const v = numOf(evalNode(node.e, s, seen)); return isErr(v) ? v : (node.o === '-' ? -v : v); }
      case 'fn': {
        const f = FN[node.name] || FN[ALIAS[node.name]];
        if (!f) return ERR.NAME;
        const out = f(node.args, s, seen);
        return out === undefined || (typeof out === 'number' && !isFinite(out)) ? (typeof out === 'number' ? ERR.NUM : '') : out;
      }
      case 'bin': {
        const o = node.o;
        if (o === '&') {
          const a = evalNode(node.l, s, seen), b = evalNode(node.r, s, seen);
          return isErr(a) ? a : isErr(b) ? b : txt(a) + txt(b);
        }
        if (['=', '<>', '<', '>', '<=', '>='].includes(o)) {
          const a = evalNode(node.l, s, seen), b = evalNode(node.r, s, seen);
          if (isErr(a)) return a; if (isErr(b)) return b;
          const k = compare(a, b);
          return o === '=' ? k === 0 : o === '<>' ? k !== 0 : o === '<' ? k < 0 : o === '>' ? k > 0 : o === '<=' ? k <= 0 : k >= 0;
        }
        const a = numOf(evalNode(node.l, s, seen)), b = numOf(evalNode(node.r, s, seen));
        if (isErr(a)) return a; if (isErr(b)) return b;
        if (o === '+') return a + b;
        if (o === '-') return a - b;
        if (o === '*') return a * b;
        if (o === '/') return b === 0 ? ERR.DIV : a / b;
        if (o === '^') { const v = Math.pow(a, b); return isFinite(v) ? v : ERR.NUM; }
        return ERR.VAL;
      }
      default: return ERR.VAL;
    }
  }

  /* ---------------- affichage d'une valeur ---------------- */
  const NBSP = ' ';
  function groupFr(n, dec) {
    const s = Math.abs(n).toFixed(dec);
    const [ip, dp] = s.split('.');
    const g = ip.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '−' : '') + g + (dp ? ',' + dp : '');
  }
  function display(cell, v) {
    if (isErr(v)) return v;
    if (v === '' || v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    const fmt = (cell && cell.fmt) || '';
    if (typeof v !== 'number') return String(v);
    const dec = cell && cell.dec !== undefined && cell.dec !== null ? cell.dec : null;
    if (fmt === 'eur') return groupFr(v, dec === null ? 2 : dec) + NBSP + '€';
    if (fmt === 'pct') return groupFr(v * 100, dec === null ? 2 : dec) + NBSP + '%';
    if (fmt === 'date') { const dt = serialToDate(v); return isNaN(dt) ? String(v) : dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
    if (fmt === 'num') return groupFr(v, dec === null ? 2 : dec);
    if (dec !== null) return groupFr(v, dec);
    const r = Math.round(v * 1e10) / 1e10;
    return String(r).replace('.', ',');
  }
  const isNum = v => typeof v === 'number' || typeof v === 'boolean';
  /* luminance d'une couleur #rgb / #rrggbb : sert au contraste du texte sur un fond coloré */
  function isDarkColor(hex) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return false;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 145;
  }

  /* ============================================================
     Ouverture / fermeture
     ============================================================ */
  async function open(id) {
    const dd = findDoc(id); if (!dd) return;
    if (currentDocId && currentDocId !== id && typeof rememberScroll === 'function') rememberScroll();
    if (typeof hidePopover === 'function') hidePopover();
    if (typeof closeCtxMenu === 'function') closeCtxMenu();
    currentDocId = id;
    const shared = typeof isSharedDoc === 'function' && isSharedDoc(id);
    readOnly = !!(shared && !(window.AlixoShare && AlixoShare.canWrite(id)));
    document.body.classList.toggle('readonly', readOnly);
    if (shared && window.AlixoShare && AlixoShare.noteOpened) AlixoShare.noteOpened(id);
    if (!sheetsOf(dd).length) sheetsOf(dd).push(newSheet('Feuille 1'));
    if (!sheetsOf(dd).some(s => s.id === curSheet)) curSheet = sheetsOf(dd)[0].id;
    sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 };
    hist = { undo: [], redo: [] };
    chartOn = false;
    document.body.classList.remove('mode-editor', 'mode-slides');
    if (window.AlixoSlides) AlixoSlides.leave();
    document.body.classList.add('mode-sheet');
    $('#view-library').style.display = 'none';
    $('#view-editor').hidden = true;
    $('#toolbar').hidden = true;
    $('#view-sheet').hidden = false;
    document.documentElement.style.setProperty('--tint', folderTint(dd.folderId));
    if (typeof setSaveStatus === 'function') setSaveStatus('saved');
    if (!openTabs.includes(id)) openTabs.push(id);
    renderTabs(); renderCrumbs();
    if (typeof renderAccess === 'function') renderAccess();
    if (shared && window.AlixoShare) AlixoShare.setPresence(id, null);
    bind();
    renderAll();
    focusGrid();
  }
  function leave() {
    if (!active()) return;
    commitEdit(false);
    clearTimeout(saveTm); saveTm = null;
    document.body.classList.remove('mode-sheet');
    $('#view-sheet').hidden = true;
    dragSel = null; dragSize = null;
  }
  /* version reçue d'un autre membre / appareil pendant que le tableur est ouvert */
  function remoteChanged() {
    if (!active()) return;
    clearTimeout(remoteTm);
    if (editing) { remoteTm = setTimeout(remoteChanged, 2000); return; }
    const dd = d(); if (!dd) return;
    if (!sheetsOf(dd).some(s => s.id === curSheet)) curSheet = (sheetsOf(dd)[0] || {}).id || '';
    renderAll();
  }

  /* ---------------- enregistrement et historique ---------------- */
  function commit() {
    const dd = d(); if (!dd || readOnly) return;
    dd.updatedAt = Date.now();
    save();
  }
  function commitSoon() { clearTimeout(saveTm); saveTm = setTimeout(commit, 400); }
  function pushHist() {
    const dd = d(); if (!dd || readOnly) return;
    hist.undo.push(JSON.stringify(sheetsOf(dd)));
    if (hist.undo.length > HIST_MAX) hist.undo.shift();
    hist.redo.length = 0;
  }
  function undo() {
    const dd = d(); if (!dd || !hist.undo.length) return false;
    hist.redo.push(JSON.stringify(sheetsOf(dd)));
    dd.sheets = JSON.parse(hist.undo.pop());
    afterRestore(dd); return true;
  }
  function redo() {
    const dd = d(); if (!dd || !hist.redo.length) return false;
    hist.undo.push(JSON.stringify(sheetsOf(dd)));
    dd.sheets = JSON.parse(hist.redo.pop());
    afterRestore(dd); return true;
  }
  function afterRestore(dd) {
    if (!sheetsOf(dd).some(s => s.id === curSheet)) curSheet = (sheetsOf(dd)[0] || {}).id || '';
    clampSel();
    commit(); renderAll();
  }
  function clampSel() {
    const s = sheet(); if (!s) return;
    const R = nRows(s) - 1, C = nCols(s) - 1;
    for (const k of ['r1', 'r2', 'ar']) sel[k] = Math.max(0, Math.min(R, sel[k]));
    for (const k of ['c1', 'c2', 'ac']) sel[k] = Math.max(0, Math.min(C, sel[k]));
  }

  /* ---------------- modification des cellules ---------------- */
  function setCell(s, r, c, patch) {
    const k = key(r, c);
    const cur = cellsOf(s)[k] || {};
    const next = Object.assign({}, cur, patch);
    for (const p of Object.keys(next)) if (next[p] === '' && p !== 'v') delete next[p];
    if (next.v === '' || next.v === undefined) delete next.v;
    if (!Object.keys(next).length) delete cellsOf(s)[k]; else cellsOf(s)[k] = next;
  }
  function setValue(s, r, c, raw) {
    const v = String(raw === null || raw === undefined ? '' : raw);
    setCell(s, r, c, { v });
    /* une cellule qui reçoit « 12,5 % » ou « 3 € » prend le format qui va avec */
    const cell = cellAt(s, r, c);
    if (cell && v && v[0] !== '=' && !cell.fmt) {
      if (/%\s*$/.test(v) && parseFrNumber(v) !== null) setCell(s, r, c, { fmt: 'pct' });
      else if (/€\s*$/.test(v) && parseFrNumber(v) !== null) setCell(s, r, c, { fmt: 'eur' });
    }
  }
  /* applique une modification de style à toute la sélection */
  function styleSel(patch) {
    if (readOnly) return;
    const s = sheet(); if (!s) return;
    const n = norm();
    pushHist();
    for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) setCell(s, r, c, patch);
    commit(); paint();
  }
  /* bascule un style booléen : si toute la sélection l'a, on l'enlève */
  function toggleStyle(prop) {
    const s = sheet(); if (!s) return;
    const n = norm();
    let all = true;
    for (let r = n.r1; r <= n.r2 && all; r++) for (let c = n.c1; c <= n.c2 && all; c++) { const cl = cellAt(s, r, c); if (!cl || !cl[prop]) all = false; }
    styleSel({ [prop]: all ? '' : 1 });
  }
  function clearSel(styles) {
    if (readOnly) return;
    const s = sheet(); if (!s) return;
    const n = norm();
    pushHist();
    for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) {
      if (styles) delete cellsOf(s)[key(r, c)];
      else setCell(s, r, c, { v: '' });
    }
    commit(); paint();
  }

  /* ---------------- insertion / suppression de lignes et colonnes ---------------- */
  /* réécrit les références d'une formule (« =SOMME(A1:A10) ») avec `mapRef`.
     Les chaînes entre guillemets et les noms de fonctions (suivis d'une parenthèse,
     comme LOG10) ne sont jamais pris pour des références. */
  function mapRefsIn(src, mapRef) {
    /* lit le mot qui commence en `i` s'il s'agit d'une référence (et pas d'un appel de fonction) */
    const readRef = i => {
      if (i >= src.length || !/[A-Za-zÀ-ÿ_$]/.test(src[i])) return null;
      let j = i;
      while (j < src.length && /[A-Za-zÀ-ÿ0-9_.$]/.test(src[j])) j++;
      if (/^\s*\(/.test(src.slice(j))) return null;            // LOG10(, SOMME(… : un nom de fonction
      const ref = parseRef(src.slice(i, j));
      return ref ? { ref, end: j } : null;
    };
    let out = '', i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"') {
        let j = i + 1;
        while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { j += 2; continue; } break; } j++; }
        out += src.slice(i, Math.min(j + 1, src.length)); i = j + 1; continue;
      }
      const a = readRef(i);
      if (a) {
        /* plage « A1:B10 » : les deux bornes bougent ensemble et se resserrent
           quand une partie seulement de la plage est supprimée */
        const colon = /^\s*:\s*/.exec(src.slice(a.end));
        const b = colon ? readRef(a.end + colon[0].length) : null;
        if (b) {
          const lo = { r: Math.min(a.ref.r, b.ref.r), c: Math.min(a.ref.c, b.ref.c) };
          const hi = { r: Math.max(a.ref.r, b.ref.r), c: Math.max(a.ref.c, b.ref.c) };
          const ms = mapRef(lo.r, lo.c, 'start'), me = mapRef(hi.r, hi.c, 'end');
          out += ms && me && ms.r <= me.r && ms.c <= me.c ? `${key(ms.r, ms.c)}:${key(me.r, me.c)}` : ERR.REF;
          i = b.end; continue;
        }
        const to = mapRef(a.ref.r, a.ref.c, 'cell');
        out += to ? key(to.r, to.c) : ERR.REF;
        i = a.end; continue;
      }
      if (/[A-Za-zÀ-ÿ_$]/.test(ch)) {                           // mot qui n'est pas une référence
        let j = i;
        while (j < src.length && /[A-Za-zÀ-ÿ0-9_.$]/.test(src[j])) j++;
        out += src.slice(i, j); i = j; continue;
      }
      out += ch; i++;
    }
    return out;
  }
  /* déplace les cellules ET met à jour les références des formules */
  function shiftCells(s, fn) {
    const out = {};
    for (const [k, cell] of Object.entries(cellsOf(s))) {
      const ref = parseRef(k); if (!ref) continue;
      const to = fn(ref.r, ref.c);
      if (!to) continue;
      const moved = cell.v && String(cell.v)[0] === '='
        ? Object.assign({}, cell, { v: '=' + mapRefsIn(String(cell.v).slice(1), fn) })
        : cell;
      out[key(to.r, to.c)] = moved;
    }
    s.cells = out;
    astCache.clear();
  }
  function shiftSizes(map, at, delta, max) {
    if (!map) return {};
    const out = {};
    for (const [k, v] of Object.entries(map)) {
      const i = +k;
      if (delta < 0 && i >= at && i < at - delta) continue;
      out[i >= at ? i + delta : i] = v;
    }
    return out;
  }
  function insertRows(at, n) {
    const s = sheet(); if (!s || readOnly) return;
    pushHist();
    shiftCells(s, (r, c) => ({ r: r >= at ? r + n : r, c }));
    s.rows = shiftSizes(s.rows, at, n);
    s.nr = Math.min(MAX_ROWS, nRows(s) + n);
    commit(); renderGrid();
  }
  function insertCols(at, n) {
    const s = sheet(); if (!s || readOnly) return;
    pushHist();
    shiftCells(s, (r, c) => ({ r, c: c >= at ? c + n : c }));
    s.cols = shiftSizes(s.cols, at, n);
    s.nc = Math.min(MAX_COLS, nCols(s) + n);
    commit(); renderGrid();
  }
  /* index survivant le plus proche d'une ligne / colonne supprimée :
     début de plage → la première qui suit, fin de plage → la dernière qui précède */
  const clampDeleted = (at, n, role) => (role === 'start' ? at : role === 'end' ? at - 1 : null);
  function deleteRows(at, n) {
    const s = sheet(); if (!s || readOnly) return;
    pushHist();
    shiftCells(s, (r, c, role) => {
      if (r >= at && r < at + n) { const rr = clampDeleted(at, n, role); return rr === null || rr < 0 ? null : { r: rr, c }; }
      return { r: r >= at + n ? r - n : r, c };
    });
    s.rows = shiftSizes(s.rows, at, -n);
    s.nr = Math.max(1, nRows(s) - n);
    clampSel(); commit(); renderGrid();
  }
  function deleteCols(at, n) {
    const s = sheet(); if (!s || readOnly) return;
    pushHist();
    shiftCells(s, (r, c, role) => {
      if (c >= at && c < at + n) { const cc = clampDeleted(at, n, role); return cc === null || cc < 0 ? null : { r, c: cc }; }
      return { r, c: c >= at + n ? c - n : c };
    });
    s.cols = shiftSizes(s.cols, at, -n);
    s.nc = Math.max(1, nCols(s) - n);
    clampSel(); commit(); renderGrid();
  }
  /* tri de la sélection (ou de la colonne active) sur une colonne */
  function sortBy(col, asc) {
    const s = sheet(); if (!s || readOnly) return;
    const n = norm();
    const oneCell = n.r1 === n.r2 && n.c1 === n.c2;
    const r1 = oneCell ? 0 : n.r1, r2 = oneCell ? lastRow(s) : n.r2;
    const c1 = oneCell ? 0 : n.c1, c2 = oneCell ? lastCol(s) : n.c2;
    if (r2 <= r1) { toast('Sélectionnez au moins deux lignes à trier'); return; }
    recalc();
    const rows = [];
    for (let r = r1; r <= r2; r++) {
      const line = [];
      for (let c = c1; c <= c2; c++) line.push(cellAt(s, r, c));
      rows.push({ line, k: valueAt(s, r, Math.min(Math.max(col, c1), c2)) });
    }
    rows.sort((a, b) => (asc ? 1 : -1) * compare(a.k === '' ? (asc ? '￿' : '') : a.k, b.k === '' ? (asc ? '￿' : '') : b.k));
    pushHist();
    rows.forEach((row, i) => {
      row.line.forEach((cell, j) => {
        const k = key(r1 + i, c1 + j);
        if (cell) cellsOf(s)[k] = cell; else delete cellsOf(s)[k];
      });
    });
    commit(); renderGrid();
    toast(`Trié sur la colonne ${colName(Math.min(Math.max(col, c1), c2))} (${asc ? 'croissant' : 'décroissant'})`);
  }
  function lastRow(s) { let m = 0; for (const k of Object.keys(cellsOf(s))) { const p = parseRef(k); if (p && p.r > m) m = p.r; } return m; }
  function lastCol(s) { let m = 0; for (const k of Object.keys(cellsOf(s))) { const p = parseRef(k); if (p && p.c > m) m = p.c; } return m; }

  /* ---------------- rendu ---------------- */
  function renderAll() { renderBar(); renderGrid(); renderTabsRow(); renderSide(); }

  function renderBar() {
    const bar = $('#sh-bar'); const s = sheet(); if (!bar || !s) return;
    const cell = cellAt(s, sel.ar, sel.ac) || {};
    if (readOnly) {
      const info = window.AlixoShare && AlixoShare.infoFor ? AlixoShare.infoFor((d() || {}).id) : null;
      bar.innerHTML = `<div class="sh-barl"><span class="sh-barlabel">${esc(s.name)}</span><span class="sh-ro">Partagé par <b>${esc(info ? info.owner : 'un membre')}</b> · lecture seule</span></div>
        <div class="sh-barr"><button data-sh="csv" title="Exporter la feuille en CSV">${I.csv}</button><button data-sh="pdf" title="Exporter en PDF (Ctrl+P)">PDF</button></div>`;
      return;
    }
    const on = (p, v) => (v === undefined ? (cell[p] ? 'on' : '') : (cell[p] || '') === v ? 'on' : '');
    bar.innerHTML = `<div class="sh-barl">
      <button data-sh="undo" title="Annuler (Ctrl+Z)" ${hist.undo.length ? '' : 'disabled'}>${I.undo}</button>
      <button data-sh="redo" title="Rétablir (Ctrl+Y)" ${hist.redo.length ? '' : 'disabled'}>${I.redo}</button>
      <span class="sh-sep"></span>
      <button data-sh="b" class="${on('b')}" title="Gras (Ctrl+B)"><b>G</b></button>
      <button data-sh="i" class="${on('i')}" title="Italique (Ctrl+I)"><i>I</i></button>
      <button data-sh="u" class="${on('u')}" title="Souligné (Ctrl+U)"><u>S</u></button>
      <button data-sh="color" title="Couleur du texte"><span class="sh-swatch" style="background:${esc(cell.c || 'var(--ink)')}">A</span></button>
      <button data-sh="fill" title="Couleur de fond"><span class="sh-swatch fill" style="background:${esc(cell.bg || 'transparent')}"></span></button>
      <span class="sh-sep"></span>
      <button data-sh="al" data-al="left" class="${on('a', 'left')}" title="À gauche">${I.left}</button>
      <button data-sh="al" data-al="center" class="${on('a', 'center')}" title="Centré">${I.center}</button>
      <button data-sh="al" data-al="right" class="${on('a', 'right')}" title="À droite">${I.right}</button>
      <button data-sh="wrap" class="${on('w')}" title="Renvoi à la ligne">${I.wrap}</button>
      <span class="sh-sep"></span>
      <select data-sh="fmt" title="Format des nombres">${FORMATS.map(([k, n]) => `<option value="${k}" ${(cell.fmt || '') === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button data-sh="dec-" title="Moins de décimales">,0−</button>
      <button data-sh="dec+" title="Plus de décimales">,0+</button>
      <span class="sh-sep"></span>
      <button data-sh="fx" title="Insérer une fonction">${I.fx}</button>
      <button data-sh="rowins" title="Insérer une ligne au-dessus">${I.rowAdd}</button>
      <button data-sh="colins" title="Insérer une colonne à gauche">${I.colAdd}</button>
      <button data-sh="rowdel" title="Supprimer les lignes sélectionnées">${I.rowDel}</button>
      <button data-sh="coldel" title="Supprimer les colonnes sélectionnées">${I.colDel}</button>
      <span class="sh-sep"></span>
      <button data-sh="sortaz" title="Trier de A à Z sur la colonne active">${I.sortAZ}</button>
      <button data-sh="sortza" title="Trier de Z à A sur la colonne active">${I.sortZA}</button>
      <button data-sh="freeze" class="${s.frozen && (s.frozen.r || s.frozen.c) ? 'on' : ''}" title="Figer les lignes et colonnes jusqu’à la cellule active">${I.freeze}</button>
      <button data-sh="chart" class="${chartOn ? 'on' : ''}" title="Graphique de la sélection">${I.chart}</button>
      <button data-sh="import" title="Importer un fichier CSV dans cette feuille">${I.imp}</button>
    </div>
    <div class="sh-barr">
      <button data-sh="csv" title="Exporter la feuille en CSV">${I.csv}</button>
      <button data-sh="pdf" title="Exporter en PDF (Ctrl+P)">PDF</button>
    </div>`;
  }

  /* ligne de formule : repère de la cellule + contenu brut */
  function renderFormula() {
    const s = sheet(); if (!s) return;
    const nameBox = $('#sh-name'), fx = $('#sh-fx');
    if (!nameBox || !fx) return;
    const n = norm();
    nameBox.textContent = n.r1 === n.r2 && n.c1 === n.c2 ? key(sel.ar, sel.ac) : `${key(n.r1, n.c1)}:${key(n.r2, n.c2)}`;
    const cell = cellAt(s, sel.ar, sel.ac);
    if (document.activeElement !== fx) fx.value = (cell && cell.v) || '';
    fx.readOnly = readOnly;
  }

  function renderGrid() {
    const s = sheet(); const host = $('#sh-grid'); if (!s || !host) return;
    const NC = nCols(s), NR = nRows(s);
    const froz = s.frozen || { r: 0, c: 0 };
    let head = `<tr><th class="sh-corner"></th>`;
    for (let c = 0; c < NC; c++) head += `<th class="sh-ch${froz.c && c < froz.c ? ' froz' : ''}" data-c="${c}" style="width:${colW(s, c)}px;min-width:${colW(s, c)}px"><span>${colName(c)}</span><i class="sh-res" data-resc="${c}"></i></th>`;
    head += '</tr>';
    let body = '';
    for (let r = 0; r < NR; r++) {
      body += `<tr style="height:${rowH(s, r)}px"><th class="sh-rh${froz.r && r < froz.r ? ' froz' : ''}" data-r="${r}"><span>${r + 1}</span><i class="sh-resr" data-resr="${r}"></i></th>`;
      for (let c = 0; c < NC; c++) body += `<td data-r="${r}" data-c="${c}"></td>`;
      body += '</tr>';
    }
    host.innerHTML = `<table class="sh-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    tds.clear();
    host.querySelectorAll('tbody td').forEach(td => tds.set(td.dataset.r + ',' + td.dataset.c, td));
    paint();
  }

  /* recalcule toutes les valeurs (cache vidé) */
  function recalc() { calcCache = new Map(); }

  /* remplit les cellules dessinées : valeurs, styles, sélection */
  function paint() {
    const s = sheet(); if (!s) return;
    recalc();
    const n = norm();
    const froz = s.frozen || { r: 0, c: 0 };
    for (const [k, td] of tds) {
      const [r, c] = k.split(',').map(Number);
      const cell = cellAt(s, r, c);
      const v = cell ? valueAt(s, r, c) : '';
      const shown = display(cell, v);
      if (td.firstChild && td.firstChild.tagName === 'INPUT') continue;   // cellule en cours de saisie
      if (td.textContent !== shown) td.textContent = shown;
      let cls = 'sh-c';
      if (cell) {
        if (cell.b) cls += ' b'; if (cell.i) cls += ' i'; if (cell.u) cls += ' u'; if (cell.w) cls += ' w';
        if (cell.v && String(cell.v)[0] === '=') cls += ' f';
      }
      const al = (cell && cell.a) || (isNum(v) ? 'right' : '');
      if (al) cls += ' al-' + al;
      if (isErr(v)) cls += ' err';
      if (inSel(r, c)) cls += ' sel';
      if (r === sel.ar && c === sel.ac) cls += ' active';
      if (froz.r && r < froz.r) cls += ' frozr';
      if (froz.c && c < froz.c) cls += ' frozc';
      if (refMarks.length) { const m = / sh-ref\d/.exec(td.className); if (m) cls += m[0]; }
      if (td.className !== cls) td.className = cls;
      /* fond foncé sans couleur de texte choisie : on écrit en blanc pour rester lisible */
      const style = (cell && cell.c ? 'color:' + cell.c + ';' : (cell && cell.bg && isDarkColor(cell.bg) ? 'color:#fff;' : '')) + (cell && cell.bg ? 'background:' + cell.bg + ';' : '');
      if (td.getAttribute('style') !== style) { if (style) td.setAttribute('style', style); else td.removeAttribute('style'); }
      td.title = isErr(v) ? `${v} — ${errExplain(cell, v)}` : (cell && cell.v && String(cell.v)[0] === '=' ? String(cell.v) : '');
    }
    $('#sh-grid').querySelectorAll('.sh-ch').forEach(th => th.classList.toggle('on', +th.dataset.c >= n.c1 && +th.dataset.c <= n.c2));
    $('#sh-grid').querySelectorAll('.sh-rh').forEach(th => th.classList.toggle('on', +th.dataset.r >= n.r1 && +th.dataset.r <= n.r2));
    renderFormula(); renderStatus(); renderBar();
    if (chartOn) renderSide();
  }

  /* barre du bas : somme, moyenne, nombre de valeurs de la sélection */
  function renderStatus() {
    const el = $('#sh-status'); const s = sheet(); if (!el || !s) return;
    const n = norm();
    const vals = [];
    for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) { const v = valueAt(s, r, c); if (v !== '') vals.push(v); }
    const ns = nums(vals);
    const numList = isErr(ns) ? [] : ns;
    const nCells = (n.r2 - n.r1 + 1) * (n.c2 - n.c1 + 1);
    const sum = numList.reduce((a, b) => a + b, 0);
    const av = valueAt(s, sel.ar, sel.ac);
    if (isErr(av)) { el.innerHTML = `<span class="sh-sterr"><b>${esc(av)}</b> — ${esc(errExplain(cellAt(s, sel.ar, sel.ac), av))}</span><span class="sh-stdim">Modifier : F2 · aide : bouton « ? » de la ligne de formule</span>`; return; }
    el.innerHTML = numList.length
      ? `<span>Somme <b>${esc(display({ dec: 2 }, sum))}</b></span><span>Moyenne <b>${esc(display({ dec: 2 }, sum / numList.length))}</b></span><span>Min <b>${esc(display({ dec: 2 }, Math.min(...numList)))}</b></span><span>Max <b>${esc(display({ dec: 2 }, Math.max(...numList)))}</b></span><span>Nombres <b>${numList.length}</b></span><span class="sh-stdim">${nCells} cellule${nCells > 1 ? 's' : ''}</span>`
      : `<span class="sh-stdim">${vals.length} valeur${vals.length > 1 ? 's' : ''} · ${nCells} cellule${nCells > 1 ? 's' : ''} sélectionnée${nCells > 1 ? 's' : ''}</span>`;
  }

  /* onglets des feuilles (bas de l'écran) */
  function renderTabsRow() {
    const dd = d(); const el = $('#sh-tabs'); if (!dd || !el) return;
    el.innerHTML = sheetsOf(dd).map(s => `<button class="sh-tab ${s.id === curSheet ? 'active' : ''}" data-sheet="${s.id}" title="${esc(s.name)}">${esc(s.name)}</button>`).join('') +
      (readOnly ? '' : `<button class="sh-tab add" data-sheet-add="1" title="Nouvelle feuille">＋</button>`);
  }

  /* panneau latéral : graphique de la sélection */
  function renderSide() {
    const side = $('#sh-side'); if (!side) return;
    side.hidden = !chartOn;
    if (!chartOn) return;
    const s = sheet(); if (!s) return;
    const spec = chartSpec(s);
    side.innerHTML = `<div class="sh-sidehead"><b>Graphique de la sélection</b><button class="sh-sidex" data-sh="chart" type="button" title="Fermer">✕</button></div>` +
      (spec
        ? `<div class="sh-chartbox">${window.AlixoCharts ? AlixoCharts.svg(spec) : ''}</div>
           <div class="sh-chartopts">${Object.entries(window.AlixoCharts ? AlixoCharts.TYPES : {}).map(([k, t]) => `<button class="${spec.ck === k ? 'on' : ''}" data-ck="${k}" type="button">${esc(t.name)}</button>`).join('')}</div>
           <div class="po-hint">La première colonne donne les étiquettes, les suivantes les séries. Sélectionnez une plage avec un en-tête pour nommer les séries.</div>`
        : `<div class="po-hint" style="padding:12px">Sélectionnez une plage de cellules contenant des nombres (avec, si possible, une colonne d’étiquettes et une ligne d’en-tête).</div>`);
  }
  let chartKind = 'bar';
  function chartSpec(s) {
    const n = norm();
    if (n.r1 === n.r2 && n.c1 === n.c2) return null;
    recalc();
    const grid = [];
    for (let r = n.r1; r <= n.r2; r++) { const line = []; for (let c = n.c1; c <= n.c2; c++) line.push(valueAt(s, r, c)); grid.push(line); }
    if (!grid.length || !grid[0].length) return null;
    const headRow = grid[0].slice(1).some(v => typeof v === 'string' && v !== '');
    const labelCol = grid.map(l => l[0]).slice(headRow ? 1 : 0).some(v => typeof v === 'string' && v !== '');
    const body = headRow ? grid.slice(1) : grid;
    const labels = body.map((l, i) => (labelCol ? txt(l[0]) : String(i + 1)));
    const c0 = labelCol ? 1 : 0;
    const series = [];
    for (let c = c0; c < grid[0].length; c++) {
      const data = body.map(l => (typeof l[c] === 'number' ? l[c] : parseFrNumber(txt(l[c]))));
      if (!data.some(v => typeof v === 'number' && isFinite(v))) continue;
      series.push({ name: headRow ? txt(grid[0][c]) || `Série ${series.length + 1}` : `Série ${series.length + 1}`, data: data.map(v => (typeof v === 'number' ? v : 0)) });
    }
    if (!series.length) return null;
    return { ck: chartKind, title: '', labels, series, opts: { legend: series.length > 1, values: false } };
  }

  /* ---------------- sélection et saisie ---------------- */
  function focusGrid() {
    const cap = $('#sh-capture');
    if (cap && !editing) { cap.value = ''; cap.focus({ preventScroll: true }); return; }
    const g = $('#sh-grid'); if (g) g.focus({ preventScroll: true });
  }
  function setSel(r, c, extend) {
    const s = sheet(); if (!s) return;
    r = Math.max(0, Math.min(nRows(s) - 1, r));
    c = Math.max(0, Math.min(nCols(s) - 1, c));
    if (extend) { sel.r2 = r; sel.c2 = c; }
    else { sel = { r1: r, c1: c, r2: r, c2: c, ar: r, ac: c }; }
    paint(); scrollIntoView(r, c);
  }
  function scrollIntoView(r, c) {
    const td = tds.get(r + ',' + c); const host = $('#sh-grid');
    if (!td || !host) return;
    const tr = td.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const padT = 30, padL = HEAD_W;
    if (tr.top < hr.top + padT) host.scrollTop -= hr.top + padT - tr.top;
    else if (tr.bottom > hr.bottom) host.scrollTop += tr.bottom - hr.bottom;
    if (tr.left < hr.left + padL) host.scrollLeft -= hr.left + padL - tr.left;
    else if (tr.right > hr.right) host.scrollLeft += tr.right - hr.right;
  }
  function startEdit(seed) {
    if (readOnly) return;
    const s = sheet(); if (!s) return;
    const r = sel.ar, c = sel.ac;
    const td = tds.get(r + ',' + c); if (!td) return;
    const cell = cellAt(s, r, c);
    commitEdit(false);
    const input = document.createElement('input');
    input.className = 'sh-edit';
    input.value = seed === undefined || seed === null ? (cell && cell.v) || '' : seed;
    input.spellcheck = false;
    td.textContent = '';
    td.appendChild(input);
    editing = { r, c, input };
    input.focus();
    if (seed === undefined || seed === null) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener('keydown', e => {
      if (fxHelpKey(e)) return;                                  // assistant de formules : ↑ ↓ Tab Entrée
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); focusGrid(); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitEdit(true); setSel(r + (e.shiftKey ? -1 : 1), c); focusGrid(); return; }
      if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); commitEdit(true); setSel(r, c + (e.shiftKey ? -1 : 1)); focusGrid(); return; }
      e.stopPropagation();
    });
    input.addEventListener('input', () => { const fx = $('#sh-fx'); if (fx && document.activeElement !== fx) fx.value = input.value; scheduleFxHelp(); });
    ['click', 'keyup'].forEach(ev => input.addEventListener(ev, e => { if (ev === 'keyup' && ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(e.key)) return; scheduleFxHelp(); }));
    scheduleFxHelp();
  }
  function commitEdit(apply) {
    if (!editing) return;
    const wasFocused = document.activeElement === editing.input;
    const { r, c, input } = editing;
    const val = input.value;
    editing = null;
    hideFxHelp();
    const td = tds.get(r + ',' + c);
    if (td) td.textContent = '';
    if (apply) {
      const s = sheet();
      if (s && String((cellAt(s, r, c) || {}).v || '') !== val) { pushHist(); setValue(s, r, c, val); commitSoon(); }
    }
    paint();
    if (wasFocused) focusGrid();
  }
  function cancelEdit() { if (!editing) return; const { r, c } = editing; editing = null; hideFxHelp(); const td = tds.get(r + ',' + c); if (td) td.textContent = ''; paint(); }

  /* ---------------- presse-papiers ---------------- */
  function selMatrix() {
    const s = sheet(); const n = norm();
    const out = [];
    for (let r = n.r1; r <= n.r2; r++) {
      const line = [];
      for (let c = n.c1; c <= n.c2; c++) { const cl = cellAt(s, r, c); line.push(cl ? JSON.parse(JSON.stringify(cl)) : null); }
      out.push(line);
    }
    return out;
  }
  function selText() {
    const s = sheet(); const n = norm();
    recalc();
    const lines = [];
    for (let r = n.r1; r <= n.r2; r++) {
      const line = [];
      for (let c = n.c1; c <= n.c2; c++) line.push(display(cellAt(s, r, c), valueAt(s, r, c)).replace(/\t/g, ' '));
      lines.push(line.join('\t'));
    }
    return lines.join('\n');
  }
  function doCopy(e, cut) {
    clip = { cells: selMatrix(), cut: cut ? norm() : null };
    const t = selText();
    if (e && e.clipboardData) { e.clipboardData.setData('text/plain', t); e.preventDefault(); }
    else if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
    if (cut) clearSel(false);
  }
  /* colle : les cellules d'Alixo si elles viennent d'ici, sinon le texte (TSV / CSV) */
  function doPaste(text) {
    if (readOnly) return;
    const s = sheet(); if (!s) return;
    const r0 = sel.ar, c0 = sel.ac;
    pushHist();
    let rows;
    if (clip && clip.cells) {
      rows = clip.cells;
      rows.forEach((line, i) => line.forEach((cl, j) => {
        const k = key(r0 + i, c0 + j);
        if (cl) cellsOf(s)[k] = JSON.parse(JSON.stringify(cl)); else delete cellsOf(s)[k];
      }));
    } else {
      rows = parseTable(text || '');
      rows.forEach((line, i) => line.forEach((v, j) => setValue(s, r0 + i, c0 + j, v)));
    }
    const h = rows.length, w = rows.reduce((m, l) => Math.max(m, l.length), 0);
    s.nr = Math.min(MAX_ROWS, Math.max(nRows(s), r0 + h));
    s.nc = Math.min(MAX_COLS, Math.max(nCols(s), c0 + w));
    sel = { r1: r0, c1: c0, r2: r0 + h - 1, c2: c0 + w - 1, ar: r0, ac: c0 };
    clampSel(); commit(); renderGrid();
  }
  /* TSV ou CSV (séparateur deviné), guillemets gérés */
  function parseTable(text) {
    const t = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '');
    if (!t) return [[]];
    const sep = t.includes('\t') ? '\t' : (t.split('\n')[0].split(';').length > t.split('\n')[0].split(',').length ? ';' : ',');
    const rows = [[]];
    let cur = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) {
        if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
        continue;
      }
      if (ch === '"') { q = true; continue; }
      if (ch === sep) { rows[rows.length - 1].push(cur); cur = ''; continue; }
      if (ch === '\n') { rows[rows.length - 1].push(cur); cur = ''; rows.push([]); continue; }
      cur += ch;
    }
    rows[rows.length - 1].push(cur);
    return rows;
  }

  /* ---------------- export ---------------- */
  function toCSV(s) {
    recalc();
    const R = Math.max(lastRow(s), 0), C = Math.max(lastCol(s), 0);
    const q = v => (/[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    const lines = [];
    for (let r = 0; r <= R; r++) {
      const line = [];
      for (let c = 0; c <= C; c++) line.push(q(display(cellAt(s, r, c), valueAt(s, r, c))));
      lines.push(line.join(';'));
    }
    return '﻿' + lines.join('\r\n');
  }
  async function exportCSV() {
    const dd = d(), s = sheet(); if (!dd || !s) return;
    const name = safeFileName((dd.titre || 'Tableur') + ' — ' + s.name) + '.csv';
    const data = new TextEncoder().encode(toCSV(s));
    const desk = window.alixoDesktop;
    if (desk && desk.saveFile) {
      const r = await desk.saveFile({ name, data, filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (r && r.ok) toast(`CSV enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
      else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
      return;
    }
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /* tableau imprimable (export PDF) : la zone remplie de chaque feuille */
  function printHTML(dd) {
    recalc();
    return sheetsOf(dd).map(s => {
      const R = lastRow(s), C = lastCol(s);
      let rows = '';
      for (let r = 0; r <= R; r++) {
        let line = '';
        for (let c = 0; c <= C; c++) {
          const cell = cellAt(s, r, c);
          const v = valueAt(s, r, c);
          const st = (cell && cell.c ? `color:${cell.c};` : (cell && cell.bg && isDarkColor(cell.bg) ? 'color:#fff;' : '')) + (cell && cell.bg ? `background:${cell.bg};` : '') +
            (cell && cell.b ? 'font-weight:700;' : '') + (cell && cell.i ? 'font-style:italic;' : '') + (cell && cell.u ? 'text-decoration:underline;' : '') +
            `text-align:${(cell && cell.a) || (isNum(v) ? 'right' : 'left')};`;
          line += `<td style="${st}">${esc(display(cell, v))}</td>`;
        }
        rows += `<tr>${line}</tr>`;
      }
      return `<section class="shp-sheet"><h2>${esc(dd.titre || 'Tableur')} — ${esc(s.name)}</h2><table>${rows || '<tr><td>Feuille vide</td></tr>'}</table></section>`;
    }).join('');
  }
  let pdfBusy = false;
  async function exportPDF() {
    if (pdfBusy) return;
    const dd = d(); if (!dd) return;
    const box = $('#sh-print'); if (!box) return;
    box.innerHTML = printHTML(dd);
    const title = dd.titre || 'Tableur';
    document.title = title + ' — Alixo';
    document.body.classList.add('printing-sheet');
    const desk = window.alixoDesktop;
    const done = () => { document.body.classList.remove('printing-sheet'); if (typeof exportWatermark === 'function') exportWatermark(false); box.innerHTML = ''; document.title = 'Alixo — Cockpit d’amphi'; };
    if (!desk || !desk.printToPDF || !desk.saveFile) { if (typeof exportWatermark === 'function') exportWatermark(true); try { print(); } finally { done(); if (typeof exportWatermark === 'function') exportWatermark(false); } return; }
    pdfBusy = true;
    toast('Préparation du PDF…', { duration: 4000 });
    let pdf = null, err = null;
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (typeof exportWatermark === 'function') exportWatermark(true);
      pdf = await desk.printToPDF({ sheet: true, title });
      if (typeof exportWatermark === 'function') exportWatermark(false);
    } catch (e) { err = e; }
    done(); pdfBusy = false;
    if (!pdf || err) { console.error(err); toast('Export PDF impossible' + (err && err.message ? ' : ' + err.message : '')); return; }
    const r = await desk.saveFile({ name: safeFileName(title) + '.pdf', data: pdf, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r && r.ok) toast(`PDF enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
    else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
  }

  /* ---------------- aperçu pour la bibliothèque ---------------- */
  function preview(dd) {
    const s = sheetsOf(dd)[0]; if (!s) return '';
    const prev = { id: s.id, cells: s.cells, cols: s.cols, rows: s.rows, nc: s.nc, nr: s.nr };
    const keep = calcCache; calcCache = new Map();
    let html = '<div class="shprev"><table>';
    for (let r = 0; r < 5; r++) {
      html += '<tr>';
      for (let c = 0; c < 4; c++) {
        const cell = cellAt(prev, r, c);
        const v = cell ? valueAt(prev, r, c) : '';
        const b = cell && cell.b ? ' class="b"' : '';
        html += `<td${b}>${esc(display(cell, v)).slice(0, 14)}</td>`;
      }
      html += '</tr>';
    }
    calcCache = keep;
    return html + '</table></div>';
  }
  const cellCount = dd => sheetsOf(dd).reduce((n, s) => n + Object.keys(s.cells || {}).length, 0);

  /* ============================================================
     Interactions
     ============================================================ */
  let bound = false;
  function bind() {
    if (bound) return; bound = true;

    /* barre d'outils */
    $('#sh-bar').addEventListener('click', e => {
      const b = e.target.closest('[data-sh]'); if (!b) return;
      const k = b.dataset.sh;
      if (k === 'undo') { undo(); return; } if (k === 'redo') { redo(); return; }
      if (k === 'pdf') { exportPDF(); return; } if (k === 'csv') { exportCSV(); return; }
      if (k === 'chart') { chartOn = !chartOn; renderSide(); renderBar(); return; }
      if (readOnly) return;
      if (k === 'b' || k === 'i' || k === 'u' || k === 'wrap') { toggleStyle(k === 'wrap' ? 'w' : k); focusGrid(); return; }
      if (k === 'al') { styleSel({ a: b.dataset.al }); focusGrid(); return; }
      if (k === 'color') { openColors(b, false); return; }
      if (k === 'fill') { openColors(b, true); return; }
      if (k === 'dec+' || k === 'dec-') { bumpDecimals(k === 'dec+' ? 1 : -1); focusGrid(); return; }
      if (k === 'fx') { openFunctions(); return; }
      if (k === 'import') { importCSV(); return; }
      if (k === 'rowins') { const n = norm(); insertRows(n.r1, n.r2 - n.r1 + 1); return; }
      if (k === 'colins') { const n = norm(); insertCols(n.c1, n.c2 - n.c1 + 1); return; }
      if (k === 'rowdel') { const n = norm(); deleteRows(n.r1, n.r2 - n.r1 + 1); return; }
      if (k === 'coldel') { const n = norm(); deleteCols(n.c1, n.c2 - n.c1 + 1); return; }
      if (k === 'sortaz') { sortBy(sel.ac, true); return; }
      if (k === 'sortza') { sortBy(sel.ac, false); return; }
      if (k === 'freeze') { const s = sheet(); s.frozen = s.frozen && (s.frozen.r || s.frozen.c) ? { r: 0, c: 0 } : { r: sel.ar, c: sel.ac }; commit(); renderGrid(); return; }
    });
    $('#sh-bar').addEventListener('change', e => {
      const sl = e.target.closest('[data-sh="fmt"]'); if (!sl) return;
      styleSel({ fmt: sl.value }); focusGrid();
    });

    /* panneau latéral (type de graphique) */
    $('#sh-side').addEventListener('click', e => {
      const x = e.target.closest('.sh-sidex'); if (x) { chartOn = false; renderSide(); renderBar(); return; }
      const b = e.target.closest('[data-ck]'); if (!b) return;
      chartKind = b.dataset.ck; renderSide();
    });

    /* ligne de formule. Entrée valide puis descend d'une cellule ; Échap abandonne la saisie.
       1.18 : la validation est faite AVANT de déplacer la sélection et le « blur » qui suit n'écrit plus
       rien (avant, le contenu restait dans le champ et se recopiait dans la cellule du dessous). */
    const fx = $('#sh-fx');
    let fxSkipBlur = false;
    fx.addEventListener('keydown', e => {
      if (fxHelpKey(e)) return;                                  // assistant de formules : ↑ ↓ Tab Entrée
      if (e.key === 'Enter') { e.preventDefault(); applyFormulaBar(); fxSkipBlur = true; setSel(sel.ar + (e.shiftKey ? -1 : 1), sel.ac); focusGrid(); fxSkipBlur = false; renderFormula(); }
      else if (e.key === 'Tab') { e.preventDefault(); applyFormulaBar(); fxSkipBlur = true; setSel(sel.ar, sel.ac + (e.shiftKey ? -1 : 1)); focusGrid(); fxSkipBlur = false; renderFormula(); }
      else if (e.key === 'Escape') { e.preventDefault(); fxSkipBlur = true; focusGrid(); fxSkipBlur = false; renderFormula(); }
      e.stopPropagation();
    });
    fx.addEventListener('blur', () => { if (fxSkipBlur || readOnly) return; applyFormulaBar(); });
    fx.addEventListener('focus', () => { fxTarget = { r: sel.ar, c: sel.ac }; });

    /* grille : sélection à la souris, redimensionnement, menu contextuel */
    const grid = $('#sh-grid');
    grid.addEventListener('pointerdown', e => {
      const res = e.target.closest('[data-resc], [data-resr]');
      if (res) { startResize(e, res); return; }
      const th = e.target.closest('.sh-ch, .sh-rh, .sh-corner');
      const s = sheet(); if (!s) return;
      if (th) {
        commitEdit(true);
        e.preventDefault();
        focusGrid();
        if (th.classList.contains('sh-corner')) { sel = { r1: 0, c1: 0, r2: nRows(s) - 1, c2: nCols(s) - 1, ar: 0, ac: 0 }; paint(); return; }
        if (th.classList.contains('sh-ch')) { const c = +th.dataset.c; sel = e.shiftKey ? Object.assign(sel, { c2: c, r1: 0, r2: nRows(s) - 1 }) : { r1: 0, c1: c, r2: nRows(s) - 1, c2: c, ar: 0, ac: c }; paint(); return; }
        const r = +th.dataset.r; sel = e.shiftKey ? Object.assign(sel, { r2: r, c1: 0, c2: nCols(s) - 1 }) : { r1: r, c1: 0, r2: r, c2: nCols(s) - 1, ar: r, ac: 0 }; paint(); return;
      }
      const td = e.target.closest('td[data-r]'); if (!td) return;
      if (editing && (+td.dataset.r !== editing.r || +td.dataset.c !== editing.c)) commitEdit(true);
      /* on garde le clavier sur le champ de capture : le navigateur ne doit pas
         déplacer le focus sur la grille (les accents seraient perdus) */
      e.preventDefault();
      const r = +td.dataset.r, c = +td.dataset.c;
      setSel(r, c, e.shiftKey);
      dragSel = true;
      grid.setPointerCapture(e.pointerId);
      focusGrid();
    });
    grid.addEventListener('pointermove', e => {
      if (dragSize) { moveResize(e); return; }
      if (!dragSel) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const td = el && el.closest ? el.closest('td[data-r]') : null;
      if (!td) return;
      const r = +td.dataset.r, c = +td.dataset.c;
      if (r !== sel.r2 || c !== sel.c2) { sel.r2 = r; sel.c2 = c; paint(); }
    });
    grid.addEventListener('pointerup', e => { dragSel = false; endResize(); try { grid.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ } });
    grid.addEventListener('dblclick', e => { if (e.target.closest('td[data-r]')) startEdit(); });
    grid.addEventListener('contextmenu', e => {
      const td = e.target.closest('td[data-r]'), th = e.target.closest('.sh-ch, .sh-rh');
      if (!td && !th) return;
      e.preventDefault();
      if (td && !inSel(+td.dataset.r, +td.dataset.c)) setSel(+td.dataset.r, +td.dataset.c);
      openCellMenu(e.clientX, e.clientY, th ? (th.classList.contains('sh-ch') ? 'col' : 'row') : 'cell');
    });

    /* clavier : tout passe par le champ de capture (accents, touches mortes, presse-papiers) */
    const cap = $('#sh-capture');
    for (const el of [grid, cap]) {
      el.addEventListener('keydown', onKey);
      el.addEventListener('copy', e => doCopy(e, false));
      el.addEventListener('cut', e => { if (readOnly) return; doCopy(e, true); });
      el.addEventListener('paste', e => {
        if (readOnly) return;
        const t = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        /* si le texte ne vient pas d'Alixo, on oublie les cellules copiées */
        if (clip && t && t !== selTextOf(clip.cells)) clip = null;
        e.preventDefault(); doPaste(t);
      });
    }
    /* un caractère tapé dans le champ de capture ouvre la cellule avec ce caractère */
    cap.addEventListener('input', () => {
      const v = cap.value;
      cap.value = '';
      if (!v || readOnly || editing) return;
      startEdit(v);
    });

    /* onglets des feuilles */
    $('#sh-tabs').addEventListener('click', e => {
      if (e.target.closest('[data-sheet-add]')) { addSheet(); return; }
      const b = e.target.closest('[data-sheet]'); if (!b) return;
      if (b.dataset.sheet === curSheet) { if (!readOnly) renameSheet(b.dataset.sheet); return; }
      commitEdit(true);
      curSheet = b.dataset.sheet;
      sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 };
      renderAll(); focusGrid();
    });
    $('#sh-tabs').addEventListener('contextmenu', e => {
      const b = e.target.closest('[data-sheet]'); if (!b || readOnly) return;
      e.preventDefault(); openSheetMenu(e.clientX, e.clientY, b.dataset.sheet);
    });

    /* raccourcis généraux de la vue (onglets, export) : partout dans le tableur */
    document.addEventListener('keydown', e => {
      if (!active()) return;
      const mod = e.ctrlKey || e.metaKey;
      const popOpen = ($('#popover') && !$('#popover').hidden) || ($('#searchov') && !$('#searchov').hidden) || ($('#setov') && !$('#setov').hidden) || !!$('.dlgov');
      if (popOpen) return;
      if (e.altKey && e.key === 'ArrowLeft' && !mod) { e.preventDefault(); showLibrary(); return; }
      if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(currentDocId); return; }
      if (mod && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }
      if (mod && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPDF(); return; }
    });

    bindFxHelp();

    /* menus contextuels : actions */
    $('#ctxmenu').addEventListener('click', e => {
      const b = e.target.closest('[data-shcm]'); if (!b) return;
      const menu = $('#ctxmenu');
      const kind = menu.dataset.shkind || 'cell', sid = menu.dataset.shsheet || '';
      menu.dataset.shkind = ''; menu.dataset.shsheet = '';
      closeCtxMenu();
      runMenu(b.dataset.shcm, kind, sid);
    });
  }
  const selTextOf = cells => cells.map(l => l.map(c => (c && c.v !== undefined ? String(c.v) : '')).join('\t')).join('\n');

  /* cellule visée par la ligne de formule : celle qui était active quand le champ a pris le focus
     (si la sélection bouge entre-temps, la saisie ne doit pas atterrir ailleurs) */
  let fxTarget = null;
  function applyFormulaBar() {
    if (readOnly) return;
    const s = sheet(); const fx = $('#sh-fx'); if (!s || !fx) return;
    const t = fxTarget && fxTarget.r < nRows(s) && fxTarget.c < nCols(s) ? fxTarget : { r: sel.ar, c: sel.ac };
    fxTarget = null;
    const cur = String((cellAt(s, t.r, t.c) || {}).v || '');
    if (fx.value === cur) return;
    pushHist(); setValue(s, t.r, t.c, fx.value); commitSoon(); paint();
  }
  function bumpDecimals(delta) {
    const s = sheet(); if (!s) return;
    const cell = cellAt(s, sel.ar, sel.ac) || {};
    const cur = cell.dec === undefined || cell.dec === null ? 2 : cell.dec;
    styleSel({ dec: Math.max(0, Math.min(8, cur + delta)) });
  }

  function onKey(e) {
    if (!active() || editing) return;
    if (e.isComposing) return;
    const s = sheet(); if (!s) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && !e.altKey) {
      const low = k.toLowerCase();
      if (low === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (low === 'y') { e.preventDefault(); redo(); return; }
      if (low === 'b') { e.preventDefault(); toggleStyle('b'); return; }
      if (low === 'i') { e.preventDefault(); toggleStyle('i'); return; }
      if (low === 'u') { e.preventDefault(); toggleStyle('u'); return; }
      if (low === 'a') { e.preventDefault(); sel = { r1: 0, c1: 0, r2: nRows(s) - 1, c2: nCols(s) - 1, ar: 0, ac: 0 }; paint(); return; }
      if (k === 'Home') { e.preventDefault(); setSel(0, 0, e.shiftKey); return; }
      if (k === 'End') { e.preventDefault(); setSel(lastRow(s), lastCol(s), e.shiftKey); return; }
      if (k === 'ArrowDown') { e.preventDefault(); setSel(jump(s, sel.r2, sel.c2, 1, 0), sel.c2, e.shiftKey); return; }
      if (k === 'ArrowUp') { e.preventDefault(); setSel(jump(s, sel.r2, sel.c2, -1, 0), sel.c2, e.shiftKey); return; }
      if (k === 'ArrowRight') { e.preventDefault(); setSel(sel.r2, jump(s, sel.r2, sel.c2, 0, 1), e.shiftKey); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); setSel(sel.r2, jump(s, sel.r2, sel.c2, 0, -1), e.shiftKey); return; }
      return;   // copier/couper/coller sont traités par les événements natifs
    }
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (step) {
      e.preventDefault();
      const br = e.shiftKey ? sel.r2 : sel.ar, bc = e.shiftKey ? sel.c2 : sel.ac;
      setSel(br + step[0], bc + step[1], e.shiftKey);
      return;
    }
    if (k === 'Tab') { e.preventDefault(); setSel(sel.ar, sel.ac + (e.shiftKey ? -1 : 1)); return; }
    if (k === 'Enter') { e.preventDefault(); if (readOnly) return; startEdit(); return; }
    if (k === 'F2') { e.preventDefault(); startEdit(); return; }
    if (k === 'Escape') { e.preventDefault(); setSel(sel.ar, sel.ac); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearSel(false); return; }
    if (k === 'PageDown') { e.preventDefault(); setSel(sel.ar + 20, sel.ac, e.shiftKey); return; }
    if (k === 'PageUp') { e.preventDefault(); setSel(sel.ar - 20, sel.ac, e.shiftKey); return; }
    if (k === 'Home') { e.preventDefault(); setSel(sel.ar, 0, e.shiftKey); return; }
    if (k === 'End') { e.preventDefault(); setSel(sel.ar, lastCol(s), e.shiftKey); return; }
    if (!readOnly && k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(k); return; }
  }
  /* Ctrl+flèche : saut au bord de la zone remplie */
  function jump(s, r, c, dr, dc) {
    const R = nRows(s) - 1, C = nCols(s) - 1;
    const has = (rr, cc) => { const cl = cellAt(s, rr, cc); return !!(cl && cl.v !== undefined && cl.v !== ''); };
    let rr = r, cc = c, n = 0;
    const cur = has(r, c);
    while (n++ < 5000) {
      const nr = rr + dr, nc = cc + dc;
      if (nr < 0 || nr > R || nc < 0 || nc > C) break;
      if (cur && !has(nr, nc)) { rr = nr; cc = nc; break; }
      rr = nr; cc = nc;
      if (!cur && has(rr, cc)) break;
    }
    return dr ? rr : cc;
  }

  /* --- redimensionnement des colonnes / lignes --- */
  function startResize(e, handle) {
    if (readOnly) return;
    const s = sheet(); if (!s) return;
    e.preventDefault(); e.stopPropagation();
    const isCol = handle.hasAttribute('data-resc');
    const i = +(isCol ? handle.dataset.resc : handle.dataset.resr);
    dragSize = { isCol, i, x: e.clientX, y: e.clientY, start: isCol ? colW(s, i) : rowH(s, i) };
    $('#sh-grid').setPointerCapture(e.pointerId);
  }
  function moveResize(e) {
    const s = sheet(); if (!s || !dragSize) return;
    const delta = dragSize.isCol ? e.clientX - dragSize.x : e.clientY - dragSize.y;
    const v = Math.max(dragSize.isCol ? 30 : 18, Math.round(dragSize.start + delta));
    if (dragSize.isCol) {
      (s.cols || (s.cols = {}))[dragSize.i] = v;
      $('#sh-grid').querySelectorAll(`.sh-ch[data-c="${dragSize.i}"]`).forEach(th => { th.style.width = v + 'px'; th.style.minWidth = v + 'px'; });
    } else {
      (s.rows || (s.rows = {}))[dragSize.i] = v;
      const tr = $('#sh-grid').querySelector(`.sh-rh[data-r="${dragSize.i}"]`);
      if (tr && tr.parentElement) tr.parentElement.style.height = v + 'px';
    }
  }
  function endResize() { if (!dragSize) return; dragSize = null; commit(); }

  /* --- feuilles --- */
  function addSheet() {
    if (readOnly) return;
    const dd = d(); if (!dd) return;
    pushHist();
    const names = sheetsOf(dd).map(s => s.name);
    let n = sheetsOf(dd).length + 1;
    while (names.includes('Feuille ' + n)) n++;
    const s = newSheet('Feuille ' + n);
    sheetsOf(dd).push(s);
    curSheet = s.id;
    sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 };
    commit(); renderAll(); focusGrid();
  }
  function renameSheet(id) {
    const dd = d(); const s = sheetsOf(dd).find(x => x.id === id); if (!s) return;
    showPopover(`<h4>Renommer la feuille</h4>
      <div class="po-row"><input id="sh-rn" value="${esc(s.name)}" maxlength="40" autocomplete="off"></div>
      <div class="po-row" style="justify-content:flex-end; margin-top:10px"><button class="pobtn" id="sh-rn-ok">Enregistrer</button></div>`,
      centerRect(), pop => {
        const input = pop.querySelector('#sh-rn');
        const ok = () => { const v = input.value.trim(); if (v) { pushHist(); s.name = v.slice(0, 40); commit(); renderTabsRow(); renderBar(); } hidePopover(); };
        pop.querySelector('#sh-rn-ok').addEventListener('click', ok);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        setTimeout(() => { input.focus(); input.select(); }, 40);
      });
  }
  async function removeSheet(id) {
    const dd = d(); const list = sheetsOf(dd);
    if (list.length < 2) { toast('Un tableur garde au moins une feuille'); return; }
    const s = list.find(x => x.id === id); if (!s) return;
    if (Object.keys(s.cells || {}).length && !(await confirmDialog({ title: `Supprimer « ${s.name} » ?`, text: 'Les données de cette feuille seront perdues.', ok: 'Supprimer' }))) return;
    pushHist();
    dd.sheets = list.filter(x => x.id !== id);
    if (curSheet === id) curSheet = dd.sheets[0].id;
    commit(); renderAll();
  }
  function duplicateSheet(id) {
    const dd = d(); const s = sheetsOf(dd).find(x => x.id === id); if (!s) return;
    pushHist();
    const copy = JSON.parse(JSON.stringify(s));
    copy.id = uid(); copy.name = (s.name + ' (copie)').slice(0, 40);
    sheetsOf(dd).splice(sheetsOf(dd).indexOf(s) + 1, 0, copy);
    curSheet = copy.id;
    commit(); renderAll();
  }
  function moveSheet(id, dir) {
    const dd = d(); const list = sheetsOf(dd);
    const i = list.findIndex(x => x.id === id); if (i < 0) return;
    const j = i + dir; if (j < 0 || j >= list.length) return;
    pushHist();
    list.splice(j, 0, list.splice(i, 1)[0]);
    commit(); renderTabsRow();
  }

  /* --- menus contextuels --- */
  function openCellMenu(x, y, kind) {
    const menu = $('#ctxmenu');
    const n = norm();
    const nR = n.r2 - n.r1 + 1, nC = n.c2 - n.c1 + 1;
    const ro = readOnly;
    menu.innerHTML = `<div class="cm-title">${key(n.r1, n.c1)}${nR > 1 || nC > 1 ? ':' + key(n.r2, n.c2) : ''}</div>
      <button data-shcm="copy">${CM_ICO.dup}Copier</button>
      ${ro ? '' : `<button data-shcm="cut">${CM_ICO.move}Couper</button><button data-shcm="paste">${CM_ICO.plus}Coller</button>`}
      ${ro ? '' : `<button data-shcm="rowins">${I.rowAdd}Insérer ${nR > 1 ? nR + ' lignes' : 'une ligne'}</button>
      <button data-shcm="colins">${I.colAdd}Insérer ${nC > 1 ? nC + ' colonnes' : 'une colonne'}</button>
      <button data-shcm="rowdel">${I.rowDel}Supprimer ${nR > 1 ? 'les lignes' : 'la ligne'}</button>
      <button data-shcm="coldel">${I.colDel}Supprimer ${nC > 1 ? 'les colonnes' : 'la colonne'}</button>`}
      ${ro || kind !== 'col' ? '' : `<button data-shcm="sortaz">${I.sortAZ}Trier de A à Z</button><button data-shcm="sortza">${I.sortZA}Trier de Z à A</button>`}
      ${ro ? '' : `<button data-shcm="clearfmt">${CM_ICO.pen}Effacer la mise en forme</button>
      <button data-shcm="clear" class="danger">${I.trash}Effacer le contenu</button>`}`;
    menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = ''; menu.dataset.file = '';
    menu.dataset.shkind = kind;
    placeCtxMenu(menu, x, y);
  }
  function openSheetMenu(x, y, sid) {
    const menu = $('#ctxmenu');
    menu.innerHTML = `<div class="cm-title">Feuille</div>
      <button data-shcm="shrename">${CM_ICO.pen}Renommer…</button>
      <button data-shcm="shdup">${CM_ICO.dup}Dupliquer</button>
      <button data-shcm="shleft">${CM_ICO.move}Déplacer à gauche</button>
      <button data-shcm="shright">${CM_ICO.move}Déplacer à droite</button>
      <button data-shcm="shdel" class="danger">${I.trash}Supprimer</button>`;
    menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = ''; menu.dataset.file = '';
    menu.dataset.shsheet = sid;
    placeCtxMenu(menu, x, y);
  }
  function runMenu(k, kind, sid) {
    const n = norm();
    if (k === 'copy') { doCopy(null, false); return; }
    if (k === 'cut') { doCopy(null, true); return; }
    if (k === 'paste') { navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText().then(t => doPaste(t)).catch(() => doPaste('')) : doPaste(''); return; }
    if (k === 'rowins') { insertRows(n.r1, n.r2 - n.r1 + 1); return; }
    if (k === 'colins') { insertCols(n.c1, n.c2 - n.c1 + 1); return; }
    if (k === 'rowdel') { deleteRows(n.r1, n.r2 - n.r1 + 1); return; }
    if (k === 'coldel') { deleteCols(n.c1, n.c2 - n.c1 + 1); return; }
    if (k === 'sortaz') { sortBy(n.c1, true); return; }
    if (k === 'sortza') { sortBy(n.c1, false); return; }
    if (k === 'clear') { clearSel(false); return; }
    if (k === 'clearfmt') { clearFormatting(); return; }
    if (k === 'shrename') { renameSheet(sid); return; }
    if (k === 'shdup') { duplicateSheet(sid); return; }
    if (k === 'shleft') { moveSheet(sid, -1); return; }
    if (k === 'shright') { moveSheet(sid, 1); return; }
    if (k === 'shdel') { removeSheet(sid); return; }
  }
  function clearFormatting() {
    if (readOnly) return;
    const s = sheet(); const n = norm();
    pushHist();
    for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) {
      const cl = cellAt(s, r, c); if (!cl) continue;
      if (cl.v === undefined || cl.v === '') delete cellsOf(s)[key(r, c)];
      else cellsOf(s)[key(r, c)] = { v: cl.v };
    }
    commit(); paint();
  }

  /* --- couleurs --- */
  function openColors(btn, isFill) {
    const list = isFill ? FILL_COLORS : TEXT_COLORS;
    const r = btn.getBoundingClientRect();
    showPopover(`<h4>${isFill ? 'Couleur de fond' : 'Couleur du texte'}</h4>
      <div class="po-colors sh-colors">${list.map(c => `<button data-c="${c}" class="${c ? '' : 'none'}" style="background:${c || 'transparent'}" title="${c || 'Aucune'}">${c ? '' : '∅'}</button>`).join('')}</div>`,
      { left: r.left, top: r.bottom + 4, bottom: r.bottom + 4 }, pop => {
        pop.querySelector('.sh-colors').addEventListener('click', e => {
          const b = e.target.closest('[data-c]'); if (!b) return;
          styleSel(isFill ? { bg: b.dataset.c } : { c: b.dataset.c });
          hidePopover(); focusGrid();
        });
      });
  }

  /* --- import d'un fichier CSV --- */
  function importCSV() {
    if (readOnly) return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,.tsv,.txt,text/csv,text/plain';
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) { toast('Fichier trop volumineux (8 Mo maximum)'); return; }
      let text = '';
      try {
        const buf = await file.arrayBuffer();
        text = new TextDecoder('utf-8').decode(buf);
        /* fichier enregistré par Excel en Windows-1252 : caractères de remplacement → on retente */
        if (text.includes('\ufffd')) { try { text = new TextDecoder('windows-1252').decode(buf); } catch { /* décodeur absent */ } }
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      } catch (e) { console.error(e); toast('Lecture impossible'); return; }
      const rows = parseTable(text);
      if (!rows.length) { toast('Fichier vide'); return; }
      const s = sheet(); if (!s) return;
      const r0 = sel.ar, c0 = sel.ac;
      pushHist();
      rows.forEach((line, i) => line.forEach((v, j) => setValue(s, r0 + i, c0 + j, v)));
      s.nr = Math.min(MAX_ROWS, Math.max(nRows(s), r0 + rows.length + 5));
      s.nc = Math.min(MAX_COLS, Math.max(nCols(s), c0 + rows.reduce((m, l) => Math.max(m, l.length), 0) + 2));
      commit(); renderGrid();
      toast(`${rows.length} ligne${rows.length > 1 ? 's' : ''} importée${rows.length > 1 ? 's' : ''} depuis « ${file.name} »`);
    });
    inp.click();
  }

  /* ============================================================
     Aide aux formules (1.18)
     - catalogue documenté de toutes les fonctions (signature, description, exemple, catégorie) ;
     - assistant sous la cellule pendant la frappe d'une formule : auto-complétion des noms
       (↑ ↓ puis Tab), signature avec l'argument en cours, aperçu du résultat ou explication de
       l'erreur, cellules référencées surlignées de la même couleur ;
     - erreurs expliquées dans la barre d'état et au survol ;
     - fenêtre « Insérer une fonction » par catégories et guide complet des formules.
     ============================================================ */
  const FN_CATS = ['Somme et statistiques', 'Mathématiques', 'Logique', 'Texte', 'Dates', 'Recherche'];
  const FN_DOC = {
    SOMME: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Additionne des nombres, des cellules ou des plages.', ex: '=SOMME(A1:A10)' },
    MOYENNE: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Moyenne arithmétique des nombres (les cellules vides ou en texte sont ignorées).', ex: '=MOYENNE(B2:B20)' },
    MIN: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Plus petite valeur.', ex: '=MIN(A1:A10)' },
    MAX: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Plus grande valeur.', ex: '=MAX(A1:A10)' },
    NB: { c: 0, a: ['valeur1', 'valeur2…'], d: 'Compte les cellules qui contiennent un nombre.', ex: '=NB(A1:A10)' },
    NBVAL: { c: 0, a: ['valeur1', 'valeur2…'], d: 'Compte les cellules non vides (nombres et textes).', ex: '=NBVAL(A1:A10)' },
    'NB.VIDE': { c: 0, a: ['plage'], d: 'Compte les cellules vides d’une plage.', ex: '=NB.VIDE(A1:A10)' },
    PRODUIT: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Multiplie les nombres entre eux.', ex: '=PRODUIT(A1:A3)' },
    MEDIANE: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Valeur médiane (la moitié des valeurs sont en dessous).', ex: '=MEDIANE(A1:A10)' },
    ECARTYPE: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Écart type d’un échantillon (dispersion autour de la moyenne).', ex: '=ECARTYPE(A1:A10)' },
    VAR: { c: 0, a: ['nombre1', 'nombre2…'], d: 'Variance d’un échantillon (carré de l’écart type).', ex: '=VAR(A1:A10)' },
    'SOMME.SI': { c: 0, a: ['plage', 'critère', 'plage_somme'], d: 'Somme des cellules qui respectent un critère : ">10", "Droit", "<>0", "*éco*". Avec plage_somme, on additionne cette plage-là.', ex: '=SOMME.SI(A1:A10;">10")' },
    'NB.SI': { c: 0, a: ['plage', 'critère'], d: 'Compte les cellules qui respectent un critère (nombre, texte, comparaison, joker *).', ex: '=NB.SI(B1:B30;"Droit")' },
    'MOYENNE.SI': { c: 0, a: ['plage', 'critère', 'plage_moyenne'], d: 'Moyenne des cellules qui respectent un critère.', ex: '=MOYENNE.SI(C1:C20;">=10")' },
    RANG: { c: 0, a: ['nombre', 'plage', 'ordre'], d: 'Rang d’une valeur dans une plage : 1 = la plus grande (ordre omis ou 0), ou la plus petite (ordre = 1).', ex: '=RANG(B2;B2:B20)' },
    ABS: { c: 1, a: ['nombre'], d: 'Valeur absolue (sans le signe).', ex: '=ABS(A1-B1)' },
    RACINE: { c: 1, a: ['nombre'], d: 'Racine carrée (le nombre doit être positif).', ex: '=RACINE(A1)' },
    PUISSANCE: { c: 1, a: ['nombre', 'exposant'], d: 'Élève un nombre à une puissance (comme A1^2).', ex: '=PUISSANCE(A1;2)' },
    ARRONDI: { c: 1, a: ['nombre', 'décimales'], d: 'Arrondit à n décimales (0 : entier le plus proche).', ex: '=ARRONDI(A1;2)' },
    'ARRONDI.INF': { c: 1, a: ['nombre', 'décimales'], d: 'Arrondit vers le bas.', ex: '=ARRONDI.INF(A1;0)' },
    'ARRONDI.SUP': { c: 1, a: ['nombre', 'décimales'], d: 'Arrondit vers le haut.', ex: '=ARRONDI.SUP(A1;0)' },
    ENT: { c: 1, a: ['nombre'], d: 'Partie entière (arrondi vers le bas).', ex: '=ENT(7,9)' },
    MOD: { c: 1, a: ['nombre', 'diviseur'], d: 'Reste de la division entière.', ex: '=MOD(A1;2)' },
    SIGNE: { c: 1, a: ['nombre'], d: 'Signe : 1, 0 ou −1.', ex: '=SIGNE(A1)' },
    EXP: { c: 1, a: ['nombre'], d: 'Exponentielle (e élevé au nombre).', ex: '=EXP(1)' },
    LN: { c: 1, a: ['nombre'], d: 'Logarithme népérien (nombre > 0).', ex: '=LN(A1)' },
    LOG10: { c: 1, a: ['nombre'], d: 'Logarithme décimal (nombre > 0).', ex: '=LOG10(1000)' },
    PI: { c: 1, a: [], d: 'Le nombre π (3,14159…).', ex: '=PI()*A1^2' },
    ALEA: { c: 1, a: [], d: 'Nombre aléatoire entre 0 et 1 (change à chaque recalcul).', ex: '=ALEA()' },
    'ALEA.ENTRE.BORNES': { c: 1, a: ['min', 'max'], d: 'Entier aléatoire entre deux bornes incluses.', ex: '=ALEA.ENTRE.BORNES(1;6)' },
    SI: { c: 2, a: ['test', 'si_vrai', 'si_faux'], d: 'Renvoie si_vrai quand le test est vrai, sinon si_faux. Le test compare avec = <> < > <= >=.', ex: '=SI(A1>=10;"Admis";"Refusé")' },
    ET: { c: 2, a: ['condition1', 'condition2…'], d: 'VRAI si toutes les conditions sont vraies.', ex: '=ET(A1>0;B1>0)' },
    OU: { c: 2, a: ['condition1', 'condition2…'], d: 'VRAI si au moins une condition est vraie.', ex: '=OU(A1="oui";B1="oui")' },
    NON: { c: 2, a: ['condition'], d: 'Inverse une condition (VRAI ↔ FAUX).', ex: '=NON(ESTVIDE(A1))' },
    SIERREUR: { c: 2, a: ['valeur', 'si_erreur'], d: 'Renvoie si_erreur à la place d’une erreur (#DIV/0!, #N/A…).', ex: '=SIERREUR(A1/B1;0)' },
    ESTVIDE: { c: 2, a: ['cellule'], d: 'VRAI si la cellule est vide.', ex: '=SI(ESTVIDE(A1);"à remplir";A1)' },
    ESTNUM: { c: 2, a: ['valeur'], d: 'VRAI si la valeur est un nombre.', ex: '=ESTNUM(A1)' },
    ESTTEXTE: { c: 2, a: ['valeur'], d: 'VRAI si la valeur est un texte.', ex: '=ESTTEXTE(A1)' },
    CONCATENER: { c: 3, a: ['texte1', 'texte2…'], d: 'Assemble des textes et des valeurs (comme l’opérateur &).', ex: '=CONCATENER(A1;" ";B1)' },
    GAUCHE: { c: 3, a: ['texte', 'nombre'], d: 'Les premiers caractères d’un texte.', ex: '=GAUCHE(A1;3)' },
    DROITE: { c: 3, a: ['texte', 'nombre'], d: 'Les derniers caractères d’un texte.', ex: '=DROITE(A1;2)' },
    STXT: { c: 3, a: ['texte', 'début', 'nombre'], d: 'Une partie d’un texte, à partir d’une position (1 = premier caractère).', ex: '=STXT(A1;2;3)' },
    NBCAR: { c: 3, a: ['texte'], d: 'Nombre de caractères.', ex: '=NBCAR(A1)' },
    MAJUSCULE: { c: 3, a: ['texte'], d: 'Texte en majuscules.', ex: '=MAJUSCULE(A1)' },
    MINUSCULE: { c: 3, a: ['texte'], d: 'Texte en minuscules.', ex: '=MINUSCULE(A1)' },
    SUPPRESPACE: { c: 3, a: ['texte'], d: 'Retire les espaces en trop (début, fin, doubles).', ex: '=SUPPRESPACE(A1)' },
    TEXTE: { c: 3, a: ['valeur'], d: 'Convertit une valeur en texte.', ex: '="Total : "&TEXTE(A1)' },
    CNUM: { c: 3, a: ['texte'], d: 'Convertit un texte en nombre (« 12,5 » → 12,5).', ex: '=CNUM(A1)' },
    AUJOURDHUI: { c: 4, a: [], d: 'La date du jour (format Date pour l’afficher en clair).', ex: '=AUJOURDHUI()' },
    MAINTENANT: { c: 4, a: [], d: 'Date et heure actuelles.', ex: '=MAINTENANT()' },
    ANNEE: { c: 4, a: ['date'], d: 'L’année d’une date.', ex: '=ANNEE(A1)' },
    MOIS: { c: 4, a: ['date'], d: 'Le mois d’une date (1 à 12).', ex: '=MOIS(A1)' },
    JOUR: { c: 4, a: ['date'], d: 'Le jour du mois d’une date.', ex: '=JOUR(A1)' },
    DATE: { c: 4, a: ['année', 'mois', 'jour'], d: 'Construit une date à partir de ses trois nombres.', ex: '=DATE(2026;9;22)' },
    RECHERCHEV: { c: 5, a: ['valeur', 'table', 'colonne'], d: 'Cherche la valeur dans la première colonne de la table et renvoie la cellule de la colonne demandée (1 = première colonne de la table).', ex: '=RECHERCHEV(A1;D1:F20;3)' },
    INDEX: { c: 5, a: ['plage', 'ligne', 'colonne'], d: 'La cellule située à la ligne et la colonne données d’une plage.', ex: '=INDEX(A1:C10;2;3)' },
    EQUIV: { c: 5, a: ['valeur', 'plage'], d: 'Position d’une valeur dans une plage (1 = première cellule).', ex: '=EQUIV("Droit";B1:B20)' }
  };
  /* mots-clés de recherche (fenêtre « Insérer une fonction ») en plus du nom et de la description */
  const FN_KW = { SI: 'condition test alors sinon', ET: 'condition toutes', OU: 'condition au moins une', NON: 'condition inverse', SIERREUR: 'condition erreur remplacer', 'SOMME.SI': 'condition critère total', 'NB.SI': 'condition critère compter', 'MOYENNE.SI': 'condition critère', SOMME: 'total addition', NB: 'compter', NBVAL: 'compter', RECHERCHEV: 'chercher tableau colonne', EQUIV: 'chercher position', INDEX: 'chercher', CONCATENER: 'coller assembler', ARRONDI: 'arrondir décimales', AUJOURDHUI: 'date du jour' };
  const FN_NAMES = Object.keys(FN_DOC);
  const fnAliasesOf = name => Object.keys(ALIAS).filter(k => ALIAS[k] === name);
  const fnCanon = name => { const up = String(name || '').toUpperCase(); return FN_DOC[up] ? up : (ALIAS[up] && FN_DOC[ALIAS[up]] ? ALIAS[up] : ''); };
  const ERR_EXPLAIN = {
    '#NOM?': 'Nom de fonction inconnu, référence mal écrite ou formule incomplète (parenthèse ou guillemet manquant).',
    '#DIV/0!': 'Division par zéro, ou moyenne d’une plage sans aucun nombre.',
    '#REF!': 'Référence vers une cellule supprimée ou en dehors du tableau.',
    '#VALEUR!': 'Un argument n’a pas le type attendu (texte à la place d’un nombre, plage attendue, argument manquant).',
    '#CYCLE!': 'La formule fait référence à sa propre cellule, directement ou par une boucle de cellules.',
    '#NOMBRE!': 'Résultat impossible : racine d’un nombre négatif, logarithme d’un nombre ≤ 0, dépassement.',
    '#N/A': 'Valeur introuvable (RECHERCHEV, EQUIV, RANG) : vérifiez la valeur cherchée et la plage.'
  };
  /* proposition pour un nom mal orthographié : préfixe commun ou distance d'édition ≤ 2 */
  function fnSuggest(name) {
    const up = String(name || '').toUpperCase(); if (!up) return '';
    const all = FN_NAMES.concat(Object.keys(ALIAS));
    let best = '', bd = 3;
    for (const n of all) {
      const a = up, b = n;
      if (b.startsWith(a) && a.length >= 2) return fnCanon(b);
      const m = a.length, k = b.length; if (Math.abs(m - k) > 2) continue;
      const dp = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(k).fill(0)));
      for (let j = 1; j <= k; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= k; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (dp[m][k] < bd) { bd = dp[m][k]; best = n; }
    }
    return best ? fnCanon(best) : '';
  }
  /* diagnostic d'une formule (texte avec le « = ») : { err, why } ou null si elle est bien formée */
  function diagnose(src) {
    const body = String(src || '').slice(1);
    if (!body.trim()) return { err: '', why: 'Formule vide : tapez un calcul, une référence ou un nom de fonction.' };
    const opens = (body.match(/\(/g) || []).length, closes = (body.match(/\)/g) || []).length;
    const quotes = (body.match(/"/g) || []).length;
    if (quotes % 2) return { err: ERR.NAME, why: 'Guillemet non fermé : un texte s’écrit entre deux guillemets, "ainsi".' };
    if (opens > closes) return { err: ERR.NAME, why: `Il manque ${opens - closes} parenthèse${opens - closes > 1 ? 's' : ''} fermante${opens - closes > 1 ? 's' : ''}.` };
    if (closes > opens) return { err: ERR.NAME, why: 'Parenthèse fermante en trop.' };
    let ast;
    try { ast = parse(body); } catch (e) {
      const msg = e && e.message;
      if (msg === 'char') return { err: ERR.NAME, why: 'Caractère inattendu : seuls + − * / ^ % & = < > ( ) ; : et les guillemets sont admis.' };
      if (msg === 'eof') return { err: ERR.NAME, why: 'Formule incomplète : il manque une valeur après le dernier opérateur ou séparateur.' };
      if (msg === 'ref') return { err: ERR.NAME, why: 'Plage mal écrite : la forme attendue est A1:B10.' };
      return { err: ERR.NAME, why: 'Formule mal formée : vérifiez l’ordre des opérateurs, des parenthèses et des séparateurs (« ; » entre les arguments).' };
    }
    let bad = null, name = null;
    (function walk(n) {
      if (!n || bad || name) return;
      if (n.n === 'fn') { if (!FN[n.name] && !FN[ALIAS[n.name]]) { bad = n.name; return; } n.args.forEach(walk); }
      else if (n.n === 'name') name = n.v;
      else if (n.n === 'bin') { walk(n.l); walk(n.r); }
      else if (n.n === 'un' || n.n === 'pct') walk(n.e);
    })(ast);
    if (bad) { const sug = fnSuggest(bad); return { err: ERR.NAME, why: `Fonction inconnue : « ${bad} »${sug ? ` — vouliez-vous dire ${sug} ?` : ''}` }; }
    if (name) { const sug = fnSuggest(name); return { err: ERR.NAME, why: `« ${name} » n’est ni une cellule (A1, B12…) ni une fonction${sug ? ` — vouliez-vous dire ${sug}( ?` : '.'}` }; }
    return null;
  }
  /* explication d'une erreur affichée dans une cellule */
  function errExplain(cell, v) {
    if (!isErr(v)) return '';
    const src = cell && cell.v && String(cell.v)[0] === '=' ? String(cell.v) : '';
    if (v === ERR.NAME && src) { const d = diagnose(src); if (d && d.why) return d.why; }
    return ERR_EXPLAIN[v] || '';
  }
  /* contexte du curseur dans une formule : nom en cours de frappe, fonction ouverte et argument courant */
  function formulaContext(src, caret) {
    const t = src.slice(0, caret);
    const m = /(^|[^A-Za-z0-9_.])([A-Za-z][A-Za-z0-9.]*)$/.exec(t);
    const partial = m && !parseRef(m[2]) ? m[2] : '';
    const stack = []; let inStr = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '(') { const mm = /([A-Za-z][A-Za-z0-9.]*)$/.exec(t.slice(0, i)); stack.push({ name: mm ? mm[1].toUpperCase() : '', arg: 0 }); }
      else if (ch === ')') stack.pop();
      else if ((ch === ';' || ch === ',') && stack.length) stack[stack.length - 1].arg++;
    }
    return { partial, fn: stack.length ? stack[stack.length - 1] : null, inStr };
  }
  function fnMatches(partial) {
    const p = String(partial || '').toUpperCase(); if (!p) return [];
    const out = [];
    for (const n of FN_NAMES) {
      if (n.startsWith(p)) { out.push({ name: n }); continue; }
      const al = fnAliasesOf(n).find(a => a.startsWith(p));
      if (al) out.push({ name: n, via: al });
    }
    return out.slice(0, 8);
  }
  const fnSigHTML = (name, cur) => {
    const a = FN_DOC[name].a;
    return `${esc(name)}(${a.map((x, i) => (i === cur || (cur >= a.length && i === a.length - 1 && x.endsWith('…'))) ? `<b>${esc(x)}</b>` : esc(x)).join('; ')})`;
  };

  /* --- panneau d'aide sous la cellule --- */
  let fxHelp = null;        // { mode: 'list' | 'sig' | 'hint', items, sel, input }
  let refMarks = [];
  const fxInput = () => (editing ? editing.input : (document.activeElement === $('#sh-fx') ? $('#sh-fx') : null));
  const fxHelpEl = () => $('#sh-fxhelp');
  function hideFxHelp() {
    const el = fxHelpEl(); if (el) { el.hidden = true; el.innerHTML = ''; }
    fxHelp = null;
    clearRefMarks();
  }
  function clearRefMarks() { for (const td of refMarks) td.className = td.className.replace(/\s?sh-ref\d/g, ''); refMarks = []; }
  function markRefs(src) {
    clearRefMarks();
    const s = sheet(); if (!s) return;
    const re = /(?:^|[^A-Za-z0-9_])([A-Za-z]{1,3}[0-9]{1,5})(?::([A-Za-z]{1,3}[0-9]{1,5}))?(?![A-Za-z0-9_(])/g;
    let m, i = 0;
    while ((m = re.exec(src)) && i < 30) {
      const a = parseRef(m[1].toUpperCase()), b = m[2] ? parseRef(m[2].toUpperCase()) : a; if (!a || !b) continue;
      const r1 = Math.min(a.r, b.r), r2 = Math.min(Math.max(a.r, b.r), r1 + 400), c1 = Math.min(a.c, b.c), c2 = Math.min(Math.max(a.c, b.c), c1 + 60);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const td = tds.get(r + ',' + c); if (td && !(editing && r === editing.r && c === editing.c)) { td.className += ' sh-ref' + (i % 6); refMarks.push(td); } }
      i++;
    }
  }
  function previewFormula(src) {
    const s = sheet(); if (!s) return null;
    const r = editing ? editing.r : sel.ar, c = editing ? editing.c : sel.ac;
    const d = diagnose(src); if (d) return d;
    const k = s.id + '!' + key(r, c);
    const keep = calcCache; calcCache = new Map(keep); calcCache.delete(k);
    let v;
    try { v = evalFormula(s, src.slice(1), r, c, new Set([k])); } catch { v = ERR.VAL; }
    calcCache = keep;
    if (isErr(v)) return { err: v, why: ERR_EXPLAIN[v] || '' };
    return { val: display(cellAt(s, r, c) || {}, v) };
  }
  function scheduleFxHelp() { requestAnimationFrame(renderFxHelp); }
  function renderFxHelp() {
    const el = fxHelpEl(); if (!el) return;
    const input = fxInput();
    const src = input ? input.value : '';
    if (!input || readOnly || src[0] !== '=') { hideFxHelp(); return; }
    const caret = input.selectionStart ?? src.length;
    const ctx = formulaContext(src, caret);
    const items = ctx.inStr ? [] : fnMatches(ctx.partial);
    const prevSel = fxHelp && fxHelp.mode === 'list' && fxHelp.key === ctx.partial ? fxHelp.sel : 0;
    let mode = 'hint', name = ctx.fn ? fnCanon(ctx.fn.name) : '';
    if (items.length) mode = 'list'; else if (name) mode = 'sig';
    fxHelp = { mode, items, sel: Math.min(prevSel, Math.max(0, items.length - 1)), key: ctx.partial, input, name, arg: ctx.fn ? ctx.fn.arg : 0 };
    const pv = mode === 'list' ? null : previewFormula(src);   // nom en cours de frappe : pas d'erreur « #NOM? » prématurée
    let html = '';
    if (mode === 'list') {
      html = `<div class="fh-list">${items.map((it, i) => `<button type="button" data-fni="${i}" class="${i === fxHelp.sel ? 'on' : ''}"><code>${esc(it.name)}${it.via ? ` <small>(${esc(it.via)})</small>` : ''}</code><span>${esc(FN_DOC[it.name].d)}</span></button>`).join('')}</div>
        <div class="fh-keys"><kbd>↑</kbd> <kbd>↓</kbd> choisir · <kbd>Tab</kbd> insérer · <kbd>Échap</kbd> annuler la saisie</div>`;
    } else if (mode === 'sig') {
      const doc = FN_DOC[name];
      html = `<div class="fh-sig">${fnSigHTML(name, fxHelp.arg)}</div>
        <div class="fh-desc">${esc(doc.d)}${doc.a.length && fxHelp.arg < doc.a.length ? ` <span class="fh-arg">Argument ${fxHelp.arg + 1} : <b>${esc(doc.a[fxHelp.arg])}</b></span>` : ''}<div class="fh-ex">Exemple : ${esc(doc.ex)}</div></div>`;
    } else {
      html = `<div class="fh-desc"><b>Formule</b> — un calcul (<code>=A1*2+B1</code>), une plage (<code>A1:B10</code>) ou une fonction : commencez à taper son nom.
        <div class="fh-chips">${['SOMME', 'MOYENNE', 'SI', 'NB.SI', 'RECHERCHEV', 'ARRONDI'].map(n => `<button type="button" data-fnins="${n}">${n}</button>`).join('')}<button type="button" data-fnall>Toutes les fonctions…</button><button type="button" data-fnguide>Guide</button></div></div>`;
    }
    if (pv) html += pv.err !== undefined ? `<div class="fh-prev err">${pv.err ? `<b>${esc(pv.err)}</b> — ` : ''}${esc(pv.why)}</div>` : `<div class="fh-prev">= ${esc(pv.val === '' ? '(vide)' : pv.val)}</div>`;
    el.innerHTML = html;
    el.hidden = false;
    /* position : sous la cellule en cours de saisie (ou sous la ligne de formule), dans la zone de la grille */
    const main = $('#sh-main'), mr = main.getBoundingClientRect();
    let left = 12, top = 6;
    if (editing) {
      const td = tds.get(editing.r + ',' + editing.c);
      if (td) { const tr = td.getBoundingClientRect(); left = tr.left - mr.left; top = tr.bottom - mr.top + 3; if (top + el.offsetHeight > mr.height - 8) top = Math.max(6, tr.top - mr.top - el.offsetHeight - 3); }
    }
    el.style.left = Math.max(6, Math.min(left, mr.width - el.offsetWidth - 10)) + 'px';
    el.style.top = top + 'px';
    markRefs(src);
  }
  /* insère un nom de fonction (avec sa parenthèse ouvrante) à la place du nom en cours de frappe */
  function acceptFxHelp(i) {
    if (!fxHelp || fxHelp.mode !== 'list') return false;
    const it = fxHelp.items[i === undefined ? fxHelp.sel : i]; if (!it) return false;
    const input = fxHelp.input; if (!input || !document.contains(input)) return false;
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret - fxHelp.key.length), after = input.value.slice(caret);
    const ins = it.name + (FN_DOC[it.name].a.length ? '(' : '()');
    input.value = before + ins + after;
    const pos = before.length + ins.length;
    input.focus(); input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    scheduleFxHelp();
    return true;
  }
  /* insère « =NOM( » dans une saisie (en cours ou nouvelle) */
  function insertFunction(name) {
    const s = sheet(); if (!s || readOnly) return;
    const input = fxInput();
    const ins = name + (FN_DOC[name] && !FN_DOC[name].a.length ? '()' : '(');
    if (input && document.contains(input)) {
      const caret = input.selectionStart ?? input.value.length;
      const v = input.value;
      const head = v[0] === '=' ? '' : (caret === 0 && !v ? '=' : '');
      input.value = head + v.slice(0, caret) + ins + v.slice(caret);
      const pos = head.length + caret + ins.length;
      input.focus(); input.setSelectionRange(pos, pos);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      scheduleFxHelp();
      return;
    }
    startEdit('=' + ins);
    scheduleFxHelp();
  }
  /* touches de l'assistant (dans la cellule ou la ligne de formule) : ↑ ↓ Tab Entrée quand la liste est ouverte */
  function fxHelpKey(e) {
    if (!fxHelp || fxHelp.mode !== 'list' || !fxHelp.items.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      fxHelp.sel = (fxHelp.sel + (e.key === 'ArrowDown' ? 1 : fxHelp.items.length - 1)) % fxHelp.items.length;
      const el = fxHelpEl(); if (el) el.querySelectorAll('[data-fni]').forEach((b, i) => b.classList.toggle('on', i === fxHelp.sel));
      return true;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); acceptFxHelp(); return true; }
    return false;
  }
  function bindFxHelp() {
    const el = fxHelpEl(); if (!el) return;
    el.addEventListener('pointerdown', e => e.preventDefault());   // le champ garde le focus
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-fni]'); if (b) { acceptFxHelp(+b.dataset.fni); return; }
      const c = e.target.closest('[data-fnins]'); if (c) { insertFunction(c.dataset.fnins); return; }
      if (e.target.closest('[data-fnall]')) { openFunctions(); return; }
      if (e.target.closest('[data-fnguide]')) { openFormulaGuide(); return; }
    });
    const fx = $('#sh-fx');
    ['input', 'click', 'keyup', 'focus'].forEach(ev => fx.addEventListener(ev, e => { if (ev === 'keyup' && ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(e.key)) return; scheduleFxHelp(); }));
    fx.addEventListener('blur', () => setTimeout(() => { if (!editing) hideFxHelp(); }, 0));
    const ico = $('#sh-fxico'); if (ico) ico.addEventListener('click', openFunctions);
    const hb = $('#sh-fxguide'); if (hb) hb.addEventListener('click', openFormulaGuide);
  }

  /* --- fenêtre « Insérer une fonction » par catégories --- */
  function openFunctions() {
    const groups = FN_CATS.map((cat, ci) => ({ cat, items: FN_NAMES.filter(n => FN_DOC[n].c === ci) }));
    openDialog({
      id: 'shfnov', cls: 'narrow', eyebrow: 'Tableur',
      title: 'Insérer une fonction',
      sub: 'Cliquez sur une fonction pour l’insérer dans la cellule. Les noms anglais (SUM, AVERAGE, IF…) marchent aussi ; les arguments se séparent par un point-virgule.',
      body: `<input id="sh-fnq" placeholder="Rechercher : nom, mot-clé (somme, condition, texte, date…)" autocomplete="off" spellcheck="false" style="width:100%; margin-bottom:10px">
        <div class="sh-fnlist" id="sh-fnlist">${groups.map(g => `<div class="sh-fncat" data-cat>${esc(g.cat)}</div>${g.items.map(n => `<button type="button" data-fn="${esc(n)}" data-q="${esc((n + ' ' + fnAliasesOf(n).join(' ') + ' ' + FN_DOC[n].d + ' ' + (FN_KW[n] || '') + ' ' + g.cat).toLowerCase())}"><code>${esc(n)}(${esc(FN_DOC[n].a.join('; '))})</code><span>${esc(FN_DOC[n].d)}</span><small>${esc(FN_DOC[n].ex)}</small></button>`).join('')}`).join('')}</div>`,
      foot: `<button class="cta ghost" type="button" id="sh-fnguide">Guide des formules</button><span style="flex:1"></span><button class="cta ghost" type="button" data-dlg-close>Fermer</button>`,
      onMount: (card, close) => {
        const q = card.querySelector('#sh-fnq'), list = card.querySelector('#sh-fnlist');
        q.addEventListener('input', () => {
          const v = q.value.trim().toLowerCase();
          list.querySelectorAll('[data-fn]').forEach(b => { b.hidden = !!v && !b.dataset.q.includes(v); });
          list.querySelectorAll('[data-cat]').forEach(h => { let n = h.nextElementSibling, any = false; while (n && !n.hasAttribute('data-cat')) { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !any; });
        });
        list.addEventListener('click', e => {
          const b = e.target.closest('[data-fn]'); if (!b) return;
          close();
          insertFunction(b.dataset.fn);
        });
        card.querySelector('#sh-fnguide').addEventListener('click', () => { close(); openFormulaGuide(); });
        setTimeout(() => q.focus(), 60);
      }
    });
  }
  /* --- guide complet --- */
  function openFormulaGuide() {
    const row = (k, v) => `<tr><td><code>${esc(k)}</code></td><td>${v}</td></tr>`;
    openDialog({
      id: 'shguideov', eyebrow: 'Tableur',
      title: 'Guide des formules',
      sub: 'Tout ce qu’il faut pour écrire une formule dans une cellule. Pendant la frappe, un assistant s’affiche sous la cellule : noms de fonctions proposés, signature, aperçu du résultat.',
      body: `<div class="sh-guide">
        <section><h4>1. Commencer</h4><p>Une formule commence par <code>=</code>. Tapez-la dans la cellule (double-clic ou <kbd>F2</kbd>, ou commencez simplement à écrire) ou dans la ligne de formule en haut. <kbd>Entrée</kbd> valide et descend, <kbd>Tab</kbd> valide et passe à droite, <kbd>Échap</kbd> annule.</p>
          <table>${row('=12*3', 'un calcul simple')}${row('=A1+B1', 'additionne deux cellules')}${row('=A1*10%', '10 % de A1 (le % divise par 100)')}${row('=(A1-B1)/B1', 'une variation : parenthèses d’abord')}${row('=A1^2', 'A1 au carré')}${row('="Note : "&A1', '& colle des textes et des valeurs')}</table></section>
        <section><h4>2. Références et plages</h4><p>Une cellule s’écrit colonne puis ligne : <code>A1</code>, <code>C12</code>, <code>AB3</code>. Une plage va d’un coin à l’autre : <code>A1:A10</code> (colonne), <code>A1:D1</code> (ligne), <code>A1:D10</code> (rectangle). Pendant la saisie, les cellules citées se colorent dans la grille. Une formule copiée-collée ailleurs adapte ses références (copiez <code>=A1*2</code> une ligne plus bas : elle devient <code>=A2*2</code>).</p></section>
        <section><h4>3. Fonctions</h4><p>Un nom, une parenthèse, des arguments séparés par <code>;</code> : <code>=SOMME(A1:A10)</code>, <code>=SI(A1>=10;"Admis";"Refusé")</code>. Les textes vont entre guillemets. Les noms anglais sont acceptés (<code>SUM</code>, <code>AVERAGE</code>, <code>IF</code>, <code>VLOOKUP</code>…). Bouton <b>fx</b> de la barre : la liste complète par catégorie.</p>
          <table>${row('SOMME · MOYENNE · MIN · MAX · NB', 'totaux et statistiques d’une plage')}${row('SI · ET · OU · SIERREUR', 'conditions : SI(test ; si vrai ; si faux)')}${row('SOMME.SI · NB.SI · MOYENNE.SI', 'totaux sous condition')}${row('ARRONDI · ENT · MOD · RACINE · PUISSANCE', 'mathématiques')}${row('GAUCHE · DROITE · STXT · NBCAR · MAJUSCULE', 'texte')}${row('AUJOURDHUI · DATE · ANNEE · MOIS · JOUR', 'dates (format Date pour l’affichage)')}${row('RECHERCHEV · INDEX · EQUIV', 'chercher une valeur dans un tableau')}</table></section>
        <section><h4>4. Critères (SOMME.SI, NB.SI, MOYENNE.SI)</h4><table>${row('">10"', 'strictement supérieur à 10 (aussi >= < <= <>)')}${row('"Droit"', 'égal au texte Droit (sans tenir compte de la casse)')}${row('"<>"', 'différent de vide')}${row('"*éco*"', 'contient « éco » (* = n’importe quoi, ? = un caractère)')}${row('A1', 'la valeur d’une cellule comme critère')}</table></section>
        <section><h4>5. Comprendre une erreur</h4><table>${Object.entries(ERR_EXPLAIN).map(([k, v]) => row(k, esc(v))).join('')}</table><p>Survolez une cellule en erreur, ou sélectionnez-la : l’explication est aussi dans la barre du bas.</p></section>
        <section><h4>6. Astuces</h4><p>Les nombres s’écrivent avec une virgule (<code>12,5</code>) ; le format d’une cellule (Nombre, Monnaie, Pourcentage, Date) se règle dans la barre d’outils et ne change pas la valeur. <kbd>Ctrl</kbd>+<kbd>Z</kbd> annule, la barre du bas affiche somme et moyenne de la sélection sans formule.</p></section>
      </div>`,
      foot: `<button class="cta ghost" type="button" id="sh-guidefn">Insérer une fonction…</button><span style="flex:1"></span><button class="cta" type="button" data-dlg-close>Compris</button>`,
      onMount: (card, close) => { card.querySelector('#sh-guidefn').addEventListener('click', () => { close(); openFunctions(); }); }
    });
  }

  /* recherche universelle : cellules dont la valeur affichée contient le texte cherché */
  function search(dd, needle, max) {
    const want = String(needle || '').toLowerCase();
    if (!want) return [];
    const keep = calcCache; calcCache = new Map();
    const out = [];
    for (const s of sheetsOf(dd)) {
      for (const k of Object.keys(s.cells || {})) {
        const ref = parseRef(k); if (!ref) continue;
        const cell = s.cells[k];
        const shown = display(cell, valueAt(s, ref.r, ref.c));
        const raw = String(cell.v || '');
        if (!shown.toLowerCase().includes(want) && !raw.toLowerCase().includes(want)) continue;
        out.push({ sheetId: s.id, sheetName: s.name, ref: k, text: shown || raw });
        if (out.length >= (max || 12)) { calcCache = keep; return out; }
      }
    }
    calcCache = keep;
    return out;
  }
  /* ouvre une cellule précise (résultat de recherche) */
  function reveal(sheetId, ref) {
    const dd = d(); if (!dd || !active()) return;
    if (sheetId && sheetsOf(dd).some(x => x.id === sheetId) && sheetId !== curSheet) { curSheet = sheetId; renderAll(); }
    const p = parseRef(ref || 'A1'); if (!p) return;
    setSel(p.r, p.c);
    focusGrid();
  }

  /* CSV d'une feuille donnée d'un tableur quelconque (archive .zip d'un dossier) */
  function sheetCSV(dd, sheetId) {
    const list = Array.isArray(dd && dd.sheets) ? dd.sheets : [];
    const s = list.find(x => x.id === sheetId) || list[0];
    if (!s) return '';
    const keep = calcCache; calcCache = new Map();
    const out = toCSV(s);
    calcCache = keep;
    return out;
  }

  return {
    newDoc, open, leave, remoteChanged, undo, redo,
    exportPDF, sheetCSV, preview, cellCount, search, reveal
  };
})();
