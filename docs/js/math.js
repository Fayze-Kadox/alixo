/* ============================================================
   Alixo — moteur de saisie linéaire mathématique
   `e_p = (dQ/Q)/(dP/P)` → notation composée, rendu HTML vectoriel.

   1.12 — mots avec espaces (« Coût total = Prix × Quantité », accents compris),
   exposant ET indice empilés (x_i^2), accents (vec, hat, bar, dot, tilde),
   valeurs absolues / normes / parties entières, racines n-ièmes, binômes,
   matrices et déterminants, systèmes (cases), texte (text(...)), gras, barré,
   ensembles ℝ ℕ ℤ ℚ ℂ, nouveaux symboles (∈ ∉ ⊂ ∪ ∩ ∀ ∃ ≡ ∼ ≪ ≫ ⋯ …),
   décimales à la française (0,5), plusieurs lignes (`\\` ou retour à la ligne).
   ============================================================ */
(function () {
  const GREEK = {
    alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', varepsilon:'ε', zeta:'ζ', eta:'η',
    theta:'θ', vartheta:'ϑ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν', xi:'ξ', pi:'π',
    rho:'ρ', sigma:'σ', tau:'τ', upsilon:'υ', phi:'φ', varphi:'φ', chi:'χ', psi:'ψ', omega:'ω',
    Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π', Sigma:'Σ',
    Phi:'Φ', Psi:'Ψ', Omega:'Ω',
    partial:'∂', nabla:'∇', infty:'∞', inf:'∞', oo:'∞', ell:'ℓ', hbar:'ℏ', EE:'𝔼', PP:'ℙ',
    RR:'ℝ', NN:'ℕ', ZZ:'ℤ', QQ:'ℚ', CC:'ℂ', emptyset:'∅', deg:'°', prime:'′'
  };
  const BIGOPS = { sum:'Σ', prod:'Π', int:'∫', iint:'∬', oint:'∮', lim:'lim', bigcup:'⋃', bigcap:'⋂', limsup:'lim sup', liminf:'lim inf' };
  const FUNCS = ['ln','log','lg','exp','cos','sin','tan','cot','arccos','arcsin','arctan','cosh','sinh','tanh',
    'min','max','sup','Var','Cov','Corr','det','argmax','argmin','MRS','TMS','VAN','TRI','dim','ker','Im','Re',
    'sgn','tr','rank','gcd','pgcd','ppcm','mod','Pr','card','Card','id','Id'];
  // mots-clés → symboles (opérateurs)
  const WORDS = {
    'in':'∈', 'notin':'∉', 'subset':'⊂', 'subseteq':'⊆', 'supset':'⊃', 'cup':'∪', 'cap':'∩', 'forall':'∀', 'exists':'∃',
    'times':'×', 'cdot':'·', 'div':'÷', 'pm':'±', 'mp':'∓', 'neq':'≠', 'leq':'≤', 'geq':'≥',
    'approx':'≈', 'equiv':'≡', 'sim':'∼', 'simeq':'≃', 'propto':'∝', 'perp':'⊥', 'parallel':'∥', 'to':'→', 'implies':'⇒',
    'iff':'⇔', 'cdots':'⋯', 'ldots':'…', 'dots':'…', 'vdots':'⋮', 'circ':'∘', 'star':'⋆', 'oplus':'⊕', 'otimes':'⊗',
    'and':'∧', 'or':'∨', 'not':'¬', 'therefore':'∴', 'because':'∵', 'infty':'∞'
  };
  // commandes à arguments : nom(arg)(arg)
  const ACCENTS = { vec:'vec', hat:'hat', bar:'bar', overline:'bar', dot:'dot', ddot:'ddot', tilde:'tilde', underline:'underline', cancel:'cancel', bold:'bold', bb:'bb', color:'color' };
  const FENCES = { abs:['|','|'], norm:['‖','‖'], floor:['⌊','⌋'], ceil:['⌈','⌉'], brak:['⟨','⟩'] };
  const MATS = { mat:['(',')'], pmat:['(',')'], bmat:['[',']'], det:['|','|'], cases:['{',''], system:['{',''] };
  // opérateurs multi-caractères, remplacés en priorité (ordre : les plus longs d'abord)
  const MULTI = [
    ['<=>','⇔'], ['<->','↔'], ['|->','↦'], ['...','…'], ['=>','⇒'], ['<=','≤'], ['>=','≥'], ['!=','≠'], ['~=','≈'], ['~~','≈'],
    ['-=','≡'], ['->','→'], ['<-','←'], ['+-','±'], ['-+','∓'], ['<<','≪'], ['>>','≫'], ['xx','×'], ['**','·'], ['prop','∝'],
    ['in:','∈'], ['!in','∉'], ['O/','∅'], ['@','∘'], ['\\\\', '\n']
  ];
  const SINGLE = { '*':'·', '=':'=', '+':'+', '-':'−', '<':'<', '>':'>', ',':',', ';':';', '!':'!', '%':'%', '|':'|', "'":'′', ':':':', '~':'∼', '°':'°' };
  const TIGHT = ['′', '″', '!', '%', ',', ';', '°', '…', '⋯'];
  const isLetter = ch => /\p{L}/u.test(ch);
  const isDigit = ch => /[0-9]/.test(ch);

  // ---------- Tokenizer ----------
  function tokenize(src) {
    const toks = [];
    let i = 0;
    src = src.replace(/\\\\/g, '\n')                           // « \\ » : retour à la ligne (LaTeX)
             .replace(/\\([a-zA-Z]+)/g, '$1');                  // tolérance LaTeX : \alpha → alpha, \frac → frac
    let sp = false;                                             // espace avant le jeton suivant
    const push = t => { t.sp = sp; sp = false; toks.push(t); };
    outer: while (i < src.length) {
      const ch = src[i];
      if (ch === '\n') { push({ t: 'nl' }); i++; continue; }
      if (/\s/.test(ch)) { sp = true; i++; continue; }
      for (const [pat, sym] of MULTI) {
        if (src.startsWith(pat, i)) { if (sym === '\n') push({ t: 'nl' }); else push({ t: 'op', v: sym }); i += pat.length; continue outer; }
      }
      if (isDigit(ch)) {
        let j = i;
        while (j < src.length && (isDigit(src[j]) || ((src[j] === '.' || src[j] === ',') && isDigit(src[j + 1] || '')))) j++;
        push({ t: 'num', v: src.slice(i, j) }); i = j; continue;
      }
      if (isLetter(ch)) {
        let j = i; while (j < src.length && isLetter(src[j])) j++;
        const w = src.slice(i, j); i = j;
        if (w === 'frac') { push({ t: 'frac' }); continue; }
        if (w === 'sqrt') { push({ t: 'sqrt' }); continue; }
        if (w === 'root') { push({ t: 'root' }); continue; }
        if (w === 'binom') { push({ t: 'binom' }); continue; }
        if (w === 'text' && src[j] === '(') {   // text(…) : contenu pris tel quel jusqu'à la parenthèse fermante correspondante
          let k = j + 1, depth = 1;
          while (k < src.length && depth) { if (src[k] === '(') depth++; else if (src[k] === ')') depth--; if (depth) k++; }
          push({ t: 'text', v: src.slice(j + 1, k) }); i = k + 1; continue;
        }
        if (ACCENTS[w] && src[j] === '(') { push({ t: 'acc', v: ACCENTS[w] }); continue; }
        if (FENCES[w] && src[j] === '(') { push({ t: 'fence', v: w }); continue; }
        if (MATS[w] && src[j] === '(') { push({ t: 'mat', v: w }); continue; }
        if (BIGOPS[w]) { push({ t: 'big', v: BIGOPS[w], name: w }); continue; }
        if (GREEK[w]) { push({ t: 'id', v: GREEK[w], greek: true }); continue; }
        if (WORDS[w]) { push({ t: 'op', v: WORDS[w] }); continue; }
        if (FUNCS.includes(w)) { push({ t: 'fn', v: w }); continue; }
        push({ t: 'id', v: w, word: w.length > 1 && !/^[a-zA-Z]$/.test(w) }); continue;
      }
      if (ch === '"') {
        let j = src.indexOf('"', i + 1); if (j < 0) j = src.length;
        push({ t: 'text', v: src.slice(i + 1, j) }); i = j + 1; continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') { push({ t: 'open', v: ch }); i++; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { push({ t: 'close', v: ch }); i++; continue; }
      if (ch === '^') { push({ t: 'sup' }); i++; continue; }
      if (ch === '_') { push({ t: 'sub' }); i++; continue; }
      if (ch === '/') { push({ t: 'div' }); i++; continue; }
      // symboles insérés directement par la palette
      if (/[Ͱ-Ͽ∂∞ℓΔ∇ℝℕℤℚℂ𝔼ℙ∅]/u.test(ch)) { push({ t: 'id', v: ch, greek: true }); i++; continue; }
      if ('Σ∫∬∮Π⋃⋂'.includes(ch)) { push({ t: 'big', v: ch }); i++; continue; }
      if (ch === '√') { push({ t: 'sqrt' }); i++; continue; }
      push({ t: 'op', v: SINGLE[ch] !== undefined ? SINGLE[ch] : ch }); i++;
    }
    return toks;
  }

  // ---------- Parseur ----------
  function parse(toks) {
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const PLACEHOLDER = () => ({ k: 'leaf', html: '□' });

    /* séquence jusqu'à une parenthèse fermante (stopClose), un séparateur (stopSep : « , » ou « ; ») ou la fin */
    function parseSeq(stopClose, stopSep) {
      const nodes = [];
      while (p < toks.length) {
        const t = peek();
        if (t.t === 'close') { if (stopClose) break; next(); continue; }
        if (t.t === 'nl') { if (stopClose) { next(); continue; } break; }
        if (stopSep && t.t === 'op' && (t.v === ',' || t.v === ';')) break;
        let node = parseUnit();
        if (node === null) continue;
        // fraction : lie l'unité précédente et la suivante
        while (peek() && peek().t === 'div') {
          next();
          const den = parseUnit() || PLACEHOLDER();
          node = { k: 'frac', num: node, den: den };
          node = parseScripts(node);
        }
        nodes.push(node);
      }
      return { k: 'seq', items: mergeWords(nodes) };
    }

    /* mots séparés par des espaces (au moins deux, ou un mot accentué) → texte droit avec ses espaces */
    function mergeWords(nodes) {
      const out = [];
      const isWord = n => n && n.k === 'id' && n.word;
      const isWordScripted = n => n && n.k === 'scripts' && isWord(n.base);   // dernier mot porteur d'un indice / exposant
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (isWord(n) || isWordScripted(n)) {
          let j = i; const words = [isWord(n) ? n.v : n.base.v]; let tail = isWordScripted(n) ? n : null;
          while (!tail && j + 1 < nodes.length && nodes[j + 1].sp && (isWord(nodes[j + 1]) || isWordScripted(nodes[j + 1]))) {
            j++; const m = nodes[j];
            if (isWord(m)) words.push(m.v); else { words.push(m.base.v); tail = m; }
          }
          if (words.length > 1 || !/^[a-zA-Z]+$/.test(words[0])) {
            const text = { k: 'text', v: words.join(' '), sp: n.sp };
            out.push(tail ? { k: 'scripts', base: text, sup: tail.sup, sub: tail.sub, sp: n.sp } : text);
            i = j; continue;
          }
        }
        out.push(n);
      }
      return out;
    }

    function parseUnit() {
      const t = peek();
      if (!t) return null;
      if (t.t === 'op') { next(); return { k: 'op', v: t.v, sp: t.sp }; }
      let atom = parseAtom();
      if (atom === null) return null;
      return parseScripts(atom);
    }

    /* exposant et/ou indice, dans n'importe quel ordre : x_i^2 ≡ x^2_i (empilés) */
    function parseScripts(atom) {
      let sup = null, sub = null;
      while (peek() && (peek().t === 'sup' || peek().t === 'sub')) {
        const s = next().t;
        const arg = parseScriptArg();
        if (s === 'sup') { if (sup) { atom = { k: 'scripts', base: atom, sup, sub }; sup = null; sub = null; } sup = arg; }
        else { if (sub) { atom = { k: 'scripts', base: atom, sup, sub }; sup = null; sub = null; } sub = arg; }
      }
      if (sup || sub) atom = { k: 'scripts', base: atom, sup, sub, sp: atom.sp };
      return atom;
    }

    function parseScriptArg() {
      const t = peek();
      if (!t) return PLACEHOLDER();
      if (t.t === 'open') { next(); const g = parseSeq(true); if (peek() && peek().t === 'close') next(); return g; }
      if (t.t === 'op' && (t.v === '−' || t.v === '+' || t.v === '±')) {   // x_+ , RV_- , x^(-1)
        next();
        const n = peek();
        const a = n && (n.t === 'num' || n.t === 'id' || n.t === 'open' || n.t === 'fn') ? parseAtom() : null;
        return { k: 'seq', items: a ? [{ k: 'op', v: t.v, tight: true }, a] : [{ k: 'op', v: t.v, tight: true }] };
      }
      return parseAtom() || PLACEHOLDER();
    }

    /* argument entre parenthèses, découpé en lignes (;) et cellules (,) : matrices, systèmes */
    function parseRows() {
      const t = peek();
      if (!t || t.t !== 'open') return [[PLACEHOLDER()]];
      next();
      const rows = [[]];
      for (;;) {
        rows[rows.length - 1].push(parseSeq(true, true));
        const s = peek();
        if (!s) break;
        if (s.t === 'close') { next(); break; }
        if (s.t === 'op' && s.v === ',') { next(); continue; }
        if (s.t === 'op' && s.v === ';') { next(); rows.push([]); continue; }
        break;
      }
      return rows;
    }

    function parseAtom() {
      const t = peek();
      if (!t) return null;
      switch (t.t) {
        case 'num': next(); return { k: 'leaf', html: esc(t.v), plain: true, sp: t.sp };
        case 'id':  next(); return { k: 'id', v: t.v, greek: t.greek, word: t.word, sp: t.sp };
        case 'text': next(); return { k: 'text', v: t.v, sp: t.sp };
        case 'fn': next(); return { k: 'fn', v: t.v, sp: t.sp };
        case 'open': {
          next();
          const g = parseSeq(true);
          let close = null;
          if (peek() && peek().t === 'close') close = next().v;
          const pairs = { '(': ')', '[': ']', '{': '}' };
          return { k: 'paren', inner: g, open: t.v, close: close || pairs[t.v] || ')', sp: t.sp };
        }
        case 'frac': { // frac(a)(b) ou frac{a}{b}
          next();
          const a = parseScriptArg(); const b = parseScriptArg();
          return { k: 'frac', num: a, den: b, sp: t.sp };
        }
        case 'sqrt': { next(); return { k: 'sqrt', inner: parseScriptArg(), sp: t.sp }; }
        case 'root': { next(); const n = parseScriptArg(); const a = parseScriptArg(); return { k: 'sqrt', inner: a, index: n, sp: t.sp }; }
        case 'binom': { next(); const a = parseScriptArg(); const b = parseScriptArg(); return { k: 'binom', top: a, bottom: b, sp: t.sp }; }
        case 'acc': {
          next();
          if (t.v === 'color') { const c = parseScriptArg(); const a = parseScriptArg(); return { k: 'acc', kind: 'color', color: plainText(c), inner: a, sp: t.sp }; }
          return { k: 'acc', kind: t.v, inner: parseScriptArg(), sp: t.sp };
        }
        case 'fence': { next(); const [l, r] = FENCES[t.v]; return { k: 'fence', l, r, inner: parseScriptArg(), sp: t.sp }; }
        case 'mat': { next(); const [l, r] = MATS[t.v]; return { k: 'mat', rows: parseRows(), l, r, cases: t.v === 'cases' || t.v === 'system', sp: t.sp }; }
        case 'big': {
          next();
          let under = null, over = null;
          while (peek() && (peek().t === 'sub' || peek().t === 'sup')) {
            const s = next().t;
            const arg = parseScriptArg();
            if (s === 'sub') under = arg; else over = arg;
          }
          return { k: 'big', op: t.v, under, over, sp: t.sp };
        }
        case 'div': case 'sup': case 'sub': case 'nl': next(); return null;
        default: next(); return null;
      }
    }

    /* lignes de premier niveau (retour à la ligne ou « \\ ») */
    const lines = [];
    for (;;) {
      lines.push(parseSeq(false));
      if (peek() && peek().t === 'nl') { next(); continue; }
      if (p >= toks.length) break;
      next();   // parenthèse fermante orpheline : ignorée
    }
    return lines.length > 1 ? { k: 'lines', rows: lines } : lines[0];
  }

  function plainText(node) {
    if (!node) return '';
    if (node.k === 'seq') return node.items.map(plainText).join('');
    if (node.k === 'id' || node.k === 'text' || node.k === 'fn' || node.k === 'op') return node.v;
    if (node.k === 'leaf') return node.html;
    if (node.k === 'paren') return plainText(node.inner);
    return '';
  }

  // ---------- Rendu HTML ----------
  function strip(node) { // enlève les parenthèses d'un groupe utilisé en num/den/racine
    return (node && node.k === 'paren') ? node.inner : node;
  }
  const SP = '<span class="msp"></span>';
  const ACC_SYM = { vec:'→', hat:'^', bar:'‾', dot:'˙', ddot:'¨', tilde:'~' };

  function render(node, prevOp) {
    if (!node) return '';
    switch (node.k) {
      case 'lines': return node.rows.map(r => '<span class="mline">' + render(r) + '</span>').join('');
      case 'seq': {
        let out = '', prev = null;
        for (const it of node.items) {
          // espace saisi entre deux atomes (hors opérateurs) : espace fine, comme à l'écrit
          if (prev && it.sp && it.k !== 'op' && prev.k !== 'op' && prev.k !== 'fn') out += SP;
          out += render(it, prev && prev.k === 'op');
          prev = it;
        }
        return out;
      }
      case 'leaf': return node.html;
      case 'id': {
        if (node.v.length === 1 && /[a-zA-Z]/.test(node.v)) return '<i>' + esc(node.v) + '</i>';
        if (node.greek) return '<span class="mi">' + esc(node.v) + '</span>';
        return '<span class="mi"><i>' + esc(node.v) + '</i></span>';
      }
      case 'text': return '<span class="mtext">' + esc(node.v) + '</span>';
      case 'fn': return '<span class="mfn">' + esc(node.v) + '</span>';
      case 'op': {
        const tight = node.tight || TIGHT.includes(node.v);
        const cls = 'mo' + (tight ? ' mop-tight' : '') + ((node.v === ',' || node.v === ';') ? ' mop-sep' : '') + ((node.v === '−' || node.v === '+' || node.v === '±') && prevOp ? ' mop-tight' : '');
        return '<span class="' + cls + '">' + esc(node.v) + '</span>';
      }
      case 'paren': return '<span class="mparen">' + esc(node.open) + '</span>' + render(node.inner) + '<span class="mparen">' + esc(node.close) + '</span>';
      case 'frac':
        return '<span class="mfrac"><span class="mnum">' + render(strip(node.num)) +
               '</span><span class="mden">' + render(strip(node.den)) + '</span></span>';
      case 'sqrt':
        return '<span class="msqrt' + (node.index ? ' mroot' : '') + '">' + (node.index ? '<span class="mrootidx">' + render(strip(node.index)) + '</span>' : '') +
               '<span class="mradsym">√</span><span class="mradcontent">' + render(strip(node.inner)) + '</span></span>';
      case 'binom':
        return '<span class="mparen mtall">(</span><span class="mbinom"><span>' + render(strip(node.top)) + '</span><span>' + render(strip(node.bottom)) + '</span></span><span class="mparen mtall">)</span>';
      case 'big':
        return '<span class="mbig"><span class="mover">' + (node.over ? render(strip(node.over)) : '&nbsp;') +
               '</span><span class="mbigop' + (node.op.length > 1 ? ' mbigtxt' : '') + '">' + esc(node.op) + '</span><span class="munder">' +
               (node.under ? render(strip(node.under)) : '&nbsp;') + '</span></span>';
      case 'scripts': {   // base + exposant / indice groupés : le script se place par rapport à sa base, pas à toute la ligne
        const base = render(node.base);
        if (node.sup && node.sub) return '<span class="mscr">' + base + '<span class="msubsup"><sup>' + render(strip(node.sup)) + '</sup><sub>' + render(strip(node.sub)) + '</sub></span></span>';
        if (node.sup) return '<span class="mscr">' + base + '<sup>' + render(strip(node.sup)) + '</sup></span>';
        return '<span class="mscr">' + base + '<sub>' + render(strip(node.sub)) + '</sub></span>';
      }
      case 'acc': {
        const inner = render(strip(node.inner));
        if (node.kind === 'bold') return '<b class="mbold">' + inner + '</b>';
        if (node.kind === 'bb') return '<span class="mbb">' + inner + '</span>';
        if (node.kind === 'underline') return '<span class="munderline">' + inner + '</span>';
        if (node.kind === 'cancel') return '<span class="mcancel">' + inner + '</span>';
        if (node.kind === 'color') { const c = /^[#a-zA-Z0-9(),.% ]{1,40}$/.test(node.color || '') ? node.color : 'inherit'; return '<span style="color:' + esc(c) + '">' + inner + '</span>'; }
        return '<span class="macc macc-' + node.kind + '"><span class="macc-sym">' + esc(ACC_SYM[node.kind] || '') + '</span><span class="macc-base">' + inner + '</span></span>';
      }
      case 'fence': return '<span class="mfence"><span class="mparen mtall">' + esc(node.l) + '</span>' + render(strip(node.inner)) + '<span class="mparen mtall">' + esc(node.r) + '</span></span>';
      case 'mat': {
        const nc = Math.max(1, ...node.rows.map(r => r.length));
        const cells = node.rows.map(r => r.map(c => '<span class="mcell">' + render(c) + '</span>').concat(Array(nc - r.length).fill('<span class="mcell"></span>')).join('')).join('');
        return '<span class="mmat' + (node.cases ? ' mcases' : '') + '">' + (node.l ? '<span class="mbrace">' + esc(node.l) + '</span>' : '') +
               '<span class="mgrid" style="grid-template-columns:repeat(' + nc + ',auto)">' + cells + '</span>' + (node.r ? '<span class="mbrace">' + esc(node.r) + '</span>' : '') + '</span>';
      }
      default: return '';
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.AlixoMath = {
    /** Rend une saisie linéaire en HTML mathématique. */
    render(src) {
      if (!src || !src.trim()) return '';
      try {
        const tree = parse(tokenize(src));
        return '<span class="m' + (tree.k === 'lines' ? ' mmulti' : '') + '">' + render(tree) + '</span>';
      } catch (e) {
        return '<span class="m">' + esc(src) + '</span>';
      }
    },
    /** Texte brut approximatif (recherche, export). */
    plain(src) { return String(src || ''); }
  };
})();
