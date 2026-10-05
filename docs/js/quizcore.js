/* ============================================================
   Alixo — quiz : noyau commun (1.24, refonte 1.25)
   Partagé par l'application (js/quiz.js : éditeur, test, présentation en direct) et par la page des
   participants (quiz.html + js/quizplay.js) : types de questions, vérification des réponses, points,
   statistiques, thèmes et rendu des réponses sur l'écran de chacun. Aucune dépendance (ni app.js, ni Firebase).

   Question : { id, t, text, time (s, 0 = sans limite), points, img (identifiant d'image, côté application), opts: [{ id, text }], ans, … }
     t = 'mcq'     choix multiple   opts, ans: [id…] (plusieurs bonnes réponses possibles : multi = true)
         'tf'      vrai / faux      ans: true | false
         'numeric' nombre à taper   ans: nombre, tol: tolérance (± tol), unit: texte affiché après le champ
         'slider'  curseur          min, max, step, ans: nombre, tol: tolérance acceptée (± tol)
         'text'    réponse écrite   ans: [texte accepté…] (majuscules, accents et espaces ignorés)
         'order'   ordre à remettre opts dans le bon ordre ; les participants les reçoivent mélangés
         'match'   association      pairs: [{ id, l, r }] ; les participants relient chaque élément de gauche à un de droite (mélangés)
         'poll'    sondage          opts, aucune bonne réponse (0 point)
         'scale'   échelle          min, max (ex. 1 à 5), lo, hi (libellés des bornes) ; aucune bonne réponse
         'open'    réponse libre    nuage de mots sur l'écran du présentateur ; aucune bonne réponse
         'info'    page             text = titre, body = texte, img ; aucune question (diapositive d'information)
   Réponse d'un participant (v) : mcq / poll → [id…], tf → booléen, numeric / slider / scale → nombre, text / open → chaîne,
   order → [id…], match → { idGauche: idDroite… }.
   ============================================================ */
'use strict';

window.QuizCore = (() => {
  /* palette des propositions (A, B, C…) : six teintes validées (séparation daltonienne), déclinées clair / sombre */
  const PAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7', '#e87ba4'];
  const PAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9', '#d55181'];
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const COLORS = PAL_LIGHT;                       // compatibilité (anciens appels)
  const SHAPES = LETTERS;
  const TYPES = {
    mcq: { name: 'Choix multiple', sub: 'Une ou plusieurs bonnes réponses parmi 2 à 6 propositions', ico: '☑', grp: 'q' },
    tf: { name: 'Vrai / Faux', sub: 'Une affirmation, deux boutons', ico: '✓', grp: 'q' },
    numeric: { name: 'Nombre', sub: 'Un nombre à taper, avec une tolérance (date, montant, pourcentage…)', ico: '12', grp: 'q' },
    slider: { name: 'Curseur', sub: 'Une valeur à placer sur une échelle', ico: '⟷', grp: 'q' },
    text: { name: 'Réponse écrite', sub: 'Un mot ou une expression à taper', ico: 'Aa', grp: 'q' },
    order: { name: 'Ordre', sub: 'Des éléments à remettre dans le bon ordre', ico: '⇅', grp: 'q' },
    match: { name: 'Association', sub: 'Relier chaque élément à celui qui lui correspond (notion → définition, date → événement…)', ico: '⇄', grp: 'q' },
    poll: { name: 'Sondage', sub: 'Un avis parmi des propositions, sans bonne réponse ni points', ico: '◔', grp: 'p' },
    scale: { name: 'Échelle', sub: 'Une note de 1 à 5 (ou autre) : accord, confiance, difficulté…', ico: '★', grp: 'p' },
    open: { name: 'Nuage de mots', sub: 'Chacun tape un mot ou une idée ; le nuage se forme à l’écran', ico: '☁', grp: 'p' },
    info: { name: 'Page', sub: 'Une diapositive sans question : titre, texte, image — pour présenter, expliquer, faire une pause', ico: '▭', grp: 'i' }
  };
  const GROUPS = [['q', 'Questions notées'], ['p', 'Avis du public'], ['i', 'Pages']];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isScored = q => !!q && !['poll', 'scale', 'open', 'info'].includes(q.t);
  const isPage = q => !!q && q.t === 'info';

  /* ---------------- thèmes ---------------- */
  const THEMES = {
    alixo: { name: 'Alixo', sub: 'Clair, sobre, bleu Alixo', bg: '#f6f7f9', surface: '#ffffff', ink: '#202124', accent: '#33658a', dark: false },
    nuit: { name: 'Nuit', sub: 'Sombre, pour l’amphi', bg: '#141414', surface: '#1f1f1f', ink: '#e8eaed', accent: '#6d95d8', dark: true },
    ocean: { name: 'Océan', sub: 'Bleu profond', bg: '#0f2a3f', surface: '#163a52', ink: '#eef6fb', accent: '#4fb3bf', dark: true },
    foret: { name: 'Forêt', sub: 'Vert, clair', bg: '#eef4ea', surface: '#ffffff', ink: '#1e2a1e', accent: '#2f7d68', dark: false },
    sable: { name: 'Sable', sub: 'Beige chaud, façon papier', bg: '#f4eee3', surface: '#fdfaf3', ink: '#2c251c', accent: '#b3762a', dark: false },
    ardoise: { name: 'Ardoise', sub: 'Gris sombre, accent doré', bg: '#2b2f36', surface: '#363b44', ink: '#eceff3', accent: '#f2b84b', dark: true },
    prune: { name: 'Prune', sub: 'Violet sombre', bg: '#2a1b2e', surface: '#3a2740', ink: '#f6eefa', accent: '#e59ad1', dark: true },
    lavande: { name: 'Lavande', sub: 'Lilas clair', bg: '#f1eefa', surface: '#fcfbff', ink: '#292340', accent: '#7a5ca8', dark: false }
  };
  const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const lum = h => { const c = hex2rgb(h); if (!c) return 1; const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); if (!x || !y) return a; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  /* valeurs résolues d'un thème (clé ou objet personnalisé { k: 'custom', bg, surface, ink, accent }) */
  function resolveTheme(th) {
    const base = th && th.k === 'custom' ? Object.assign({}, THEMES.alixo, th) : (THEMES[(th && th.k) || 'alixo'] || THEMES.alixo);
    const bg = hex2rgb(base.bg) ? base.bg : THEMES.alixo.bg;
    const dark = lum(bg) < .3;
    const surface = hex2rgb(base.surface) ? base.surface : (dark ? mix(bg, '#ffffff', .07) : '#ffffff');
    const ink = hex2rgb(base.ink) ? base.ink : (dark ? '#eef0f3' : '#202124');
    const accent = hex2rgb(base.accent) ? base.accent : THEMES.alixo.accent;
    return { k: (th && th.k) || 'alixo', bg, surface, ink, accent, dark, ink2: mix(ink, bg, .4), border: mix(surface, ink, dark ? .18 : .14), accentInk: lum(accent) > .4 ? '#1a1a1a' : '#ffffff', pal: dark ? PAL_DARK : PAL_LIGHT, font: (th && th.font) || 'sans' };
  }
  const FONTS = { sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif', serif: '"Iowan Old Style", Palatino, Georgia, "Times New Roman", serif', rounded: '"Nunito", "Varela Round", "Trebuchet MS", "Segoe UI", sans-serif', mono: '"SF Mono", ui-monospace, Consolas, monospace' };
  /* style inline (variables CSS) pour l'écran de jeu ou la page des participants */
  function themeStyle(th) {
    const r = th && th.pal ? th : resolveTheme(th);
    return `--qp-bg:${r.bg};--qp-surface:${r.surface};--qp-border:${r.border};--qp-ink:${r.ink};--qp-ink2:${r.ink2};--qp-accent:${r.accent};--qp-accent-ink:${r.accentInk};--qp-hover:${mix(r.surface, r.ink, .06)};--qp-font:${FONTS[r.font] || FONTS.sans};` + r.pal.map((c, i) => `--qp-c${i}:${c};`).join('') + `color-scheme:${r.dark ? 'dark' : 'light'};`;
  }

  function newQuestion(t) {
    const q = { id: uid(), t: TYPES[t] ? t : 'mcq', text: '', time: 20, points: 1000 };
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'order') q.opts = [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }].slice(0, q.t === 'order' ? 3 : 4);
    if (q.t === 'mcq') { q.ans = []; q.multi = false; }
    if (q.t === 'tf') q.ans = true;
    if (q.t === 'numeric') { q.ans = 0; q.tol = 0; q.unit = ''; }
    if (q.t === 'slider') { q.min = 0; q.max = 100; q.step = 1; q.ans = 50; q.tol = 0; }
    if (q.t === 'text') q.ans = [];
    if (q.t === 'match') q.pairs = [{ id: uid(), l: '', r: '' }, { id: uid(), l: '', r: '' }, { id: uid(), l: '', r: '' }];
    if (q.t === 'scale') { q.min = 1; q.max = 5; q.lo = 'Pas du tout'; q.hi = 'Tout à fait'; q.time = 30; }
    if (q.t === 'open') { q.time = 45; }
    if (!isScored(q)) q.points = 0;
    if (q.t === 'info') { q.time = 0; q.body = ''; }
    return q;
  }
  /* la question telle qu'elle part chez les participants : sans la réponse ; les éléments à ordonner sont mélangés.
     Pour une association, les éléments de droite reçoivent des identifiants neufs : p._key (à ne pas envoyer) les relie aux paires. */
  function publicQuestion(q) {
    const p = { id: q.id, t: q.t, text: q.text || '', time: +q.time || 0, points: +q.points || 0 };
    if (q.opts) p.opts = q.opts.map(o => ({ id: o.id, text: o.text || '' }));
    if (q.t === 'mcq') p.multi = !!q.multi || (Array.isArray(q.ans) && q.ans.length > 1);
    if (q.t === 'slider') { p.min = +q.min || 0; p.max = +q.max || 100; p.step = +q.step || 1; }
    if (q.t === 'numeric') p.unit = q.unit || '';
    if (q.t === 'scale') { p.min = +q.min || 1; p.max = +q.max || 5; p.lo = q.lo || ''; p.hi = q.hi || ''; }
    if (q.t === 'info') { p.body = q.body || ''; p.time = 0; p.points = 0; }
    if (q.t === 'order' && p.opts) { shuffle(p.opts); if (q.opts.length > 1 && p.opts.every((o, i) => o.id === q.opts[i].id)) p.opts.reverse(); }
    if (q.t === 'match') {
      const pairs = (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim());
      p.opts = pairs.map(x => ({ id: x.id, text: x.l || '' }));
      const key = {};
      p.rights = shuffle(pairs.map(x => { const rid = uid(); key[rid] = x.id; return { id: rid, text: x.r || '' }; }));
      Object.defineProperty(p, '_key', { value: key, enumerable: false });
    }
    return p;
  }
  /* version envoyable (sans la clé d'association) */
  const sendable = p => Object.assign({}, p);
  /* vrai / faux / null (sondage, page ou réponse absente). Pour une association, q.rkey = clé { idDroite: idPaire } */
  function check(q, v) {
    if (!q || v === undefined || v === null) return null;
    switch (q.t) {
      case 'mcq': { const a = new Set(Array.isArray(q.ans) ? q.ans : [q.ans].filter(Boolean)); const r = new Set(Array.isArray(v) ? v : [v]); return a.size > 0 && a.size === r.size && [...a].every(x => r.has(x)); }
      case 'tf': return !!v === !!q.ans;
      case 'numeric': case 'slider': return isFinite(+v) && Math.abs((+v) - (+q.ans)) <= (+q.tol || 0) + 1e-9;
      case 'text': { const n = norm(v); return !!n && (Array.isArray(q.ans) ? q.ans : [q.ans]).some(a => norm(a) === n); }
      case 'order': return Array.isArray(v) && Array.isArray(q.opts) && v.length === q.opts.length && v.every((id, i) => id === q.opts[i].id);
      case 'match': {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
        const pairs = (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim());
        const key = q.rkey || null;
        return pairs.length > 0 && pairs.every(x => { const r = v[x.id]; return r !== undefined && (key ? key[r] === x.id : r === x.id); });
      }
      default: return null;
    }
  }
  /* points : la moitié pour la justesse, l'autre moitié fond avec le temps écoulé (el ms) */
  function points(q, el, ok) {
    if (!ok || !isScored(q)) return 0;
    const base = Math.max(0, +q.points || 0);
    const t = (+q.time || 0) * 1000;
    if (!t) return base;
    const f = Math.max(0, Math.min(1, (+el || 0) / t));
    return Math.round(base * (1 - 0.5 * f));
  }
  /* réponse lisible (écran du présentateur, résultats) */
  function answerText(q, v) {
    if (v === undefined || v === null) return '—';
    const optText = id => { const o = (q.opts || []).find(x => x.id === id); return o ? o.text : '?'; };
    switch (q.t) {
      case 'mcq': case 'poll': return (Array.isArray(v) ? v : [v]).map(optText).join(', ');
      case 'tf': return v ? 'Vrai' : 'Faux';
      case 'numeric': return String(v) + (q.unit ? ' ' + q.unit : '');
      case 'slider': case 'scale': return String(v);
      case 'text': case 'open': return String(v);
      case 'order': return (Array.isArray(v) ? v : []).map(optText).join(' → ');
      case 'match': { const pairs = q.pairs || []; const rt = id => { if (q.rkey) { const pid = q.rkey[id]; const p = pairs.find(x => x.id === pid); return p ? p.r : '?'; } const p = pairs.find(x => x.id === id); return p ? p.r : '?'; }; return pairs.map(x => `${x.l} → ${v && v[x.id] !== undefined ? rt(v[x.id]) : '?'}`).join(' · '); }
      default: return String(v);
    }
  }
  function correctText(q) {
    switch (q.t) {
      case 'mcq': return answerText(q, q.ans || []);
      case 'tf': return q.ans ? 'Vrai' : 'Faux';
      case 'numeric': return String(q.ans) + (q.unit ? ' ' + q.unit : '') + (q.tol ? ` (± ${q.tol})` : '');
      case 'slider': return String(q.ans) + (q.tol ? ` (± ${q.tol})` : '');
      case 'text': return (Array.isArray(q.ans) ? q.ans : [q.ans]).filter(Boolean).join(' / ');
      case 'order': return (q.opts || []).map(o => o.text).join(' → ');
      case 'match': return (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim()).map(x => `${x.l} → ${x.r}`).join(' · ');
      default: return '';
    }
  }
  /* statistiques des réponses reçues (liste de v) pour l'écran du présentateur et les résultats */
  function stats(q, list) {
    const n = list.length;
    if (q.t === 'mcq' || q.t === 'poll') {
      const c = {}; for (const o of (q.opts || [])) c[o.id] = 0;
      for (const v of list) for (const id of (Array.isArray(v) ? v : [v])) if (id in c) c[id]++;
      return { n, counts: c, ok: q.t === 'mcq' ? list.filter(v => check(q, v)).length : 0 };
    }
    if (q.t === 'tf') { let t = 0; for (const v of list) if (v) t++; return { n, counts: { true: t, false: n - t }, ok: list.filter(v => check(q, v)).length }; }
    if (q.t === 'order' || q.t === 'match') { let ok = 0; for (const v of list) if (check(q, v)) ok++; return { n, counts: { ok, ko: n - ok }, ok }; }
    if (q.t === 'slider' || q.t === 'numeric' || q.t === 'scale') {
      const vals = list.map(Number).filter(x => !isNaN(x)); const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const counts = {}; for (const v of vals) counts[v] = (counts[v] || 0) + 1;
      return { n, values: vals, mean, counts, ok: q.t === 'scale' ? 0 : vals.filter(v => check(q, v)).length };
    }
    if (q.t === 'text' || q.t === 'open') { const c = {}; for (const v of list) { const k = String(v).trim(); if (!k) continue; const kk = q.t === 'open' ? k.toLowerCase() : k; c[kk] = (c[kk] || 0) + 1; } return { n, counts: c, ok: q.t === 'text' ? list.filter(v => check(q, v)).length : 0 }; }
    return { n, ok: 0 };
  }

  /* ---------------- écran du participant : la question et les boutons de réponse ----------------
     o = { done (déjà répondu), v (réponse donnée), reveal (bonne réponse affichée : q complète), big (écran présentateur) } */
  const letter = i => LETTERS[i % LETTERS.length];
  const colorVar = i => `var(--qp-c${i % 6})`;
  function widgetHTML(q, o = {}) {
    const dis = o.done || o.reveal ? ' disabled' : '';
    const given = o.v;
    if (q.t === 'info') return `<div class="qp-infopage">${q.body ? `<div class="qp-pbody">${esc(q.body).replace(/\n/g, '<br>')}</div>` : ''}</div>`;
    if (q.t === 'mcq' || q.t === 'poll') {
      const multi = q.t === 'mcq' && (q.multi || (o.reveal && Array.isArray(q.ans) && q.ans.length > 1));
      const sel = new Set(Array.isArray(given) ? given : []);
      const ans = new Set(o.reveal && Array.isArray(q.ans) ? q.ans : []);
      return `<div class="qp-opts n${(q.opts || []).length}">${(q.opts || []).map((op, i) => `<button type="button" class="qp-opt${sel.has(op.id) ? ' sel' : ''}${o.reveal ? (ans.has(op.id) ? ' ok' : (q.t === 'poll' ? '' : ' ko')) : ''}" data-opt="${esc(op.id)}" style="--oc:${colorVar(i)}"${dis}><span class="qp-shape">${letter(i)}</span><span class="qp-otext">${esc(op.text) || '…'}</span>${multi ? '<span class="qp-check"></span>' : ''}</button>`).join('')}</div>${multi && !o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider mes réponses</button>' : ''}`;
    }
    if (q.t === 'tf') {
      const mk = (val, lab, col, sh) => `<button type="button" class="qp-opt qp-tf${given === val ? ' sel' : ''}${o.reveal ? (q.ans === val ? ' ok' : ' ko') : ''}" data-tf="${val ? '1' : '0'}" style="--oc:${col}"${dis}><span class="qp-shape">${sh}</span><span class="qp-otext">${lab}</span></button>`;
      return `<div class="qp-opts n2">${mk(true, 'Vrai', colorVar(2), 'V')}${mk(false, 'Faux', colorVar(1), 'F')}</div>`;
    }
    if (q.t === 'scale') {
      const min = +q.min || 1, max = Math.max(min + 1, +q.max || 5);
      const vals = []; for (let v = min; v <= max; v++) vals.push(v);
      return `<div class="qp-scale"><div class="qp-sbtns">${vals.map((v, i) => `<button type="button" class="qp-opt qp-sbtn${+given === v ? ' sel' : ''}" data-val="${v}" style="--oc:${colorVar(Math.round(i * 5 / Math.max(1, vals.length - 1)))}"${dis}><span class="qp-shape">${v}</span></button>`).join('')}</div><div class="qp-srange"><span>${esc(q.lo || '')}</span><span>${esc(q.hi || '')}</span></div></div>`;
    }
    if (q.t === 'slider') {
      const min = +q.min || 0, max = +q.max || 100, step = +q.step || 1;
      const v = given !== undefined && given !== null ? +given : Math.round((min + max) / 2 / step) * step;
      return `<div class="qp-slider"><div class="qp-sval"><output>${esc(v)}</output></div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${v}"${dis}>
        <div class="qp-srange"><span>${esc(min)}</span><span>${esc(max)}</span></div>
        ${o.reveal ? `<div class="qp-good">Bonne réponse : <b>${esc(correctText(q))}</b></div>` : ''}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
    }
    if (q.t === 'numeric') {
      return `<div class="qp-text qp-num"><div class="qp-numrow"><input type="number" step="any" inputmode="decimal" placeholder="Votre nombre…" autocomplete="off" value="${given !== undefined && given !== null ? esc(given) : ''}"${dis}>${q.unit ? `<span class="qp-unit">${esc(q.unit)}</span>` : ''}</div>
        ${o.reveal ? `<div class="qp-good">Bonne réponse : <b>${esc(correctText(q))}</b></div>` : ''}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
    }
    if (q.t === 'text' || q.t === 'open') {
      return `<div class="qp-text"><input type="text" maxlength="${q.t === 'open' ? 40 : 80}" placeholder="${q.t === 'open' ? 'Un mot, une idée…' : 'Votre réponse…'}" autocomplete="off" autocapitalize="off" value="${esc(given || '')}"${dis}>
        ${o.reveal && q.t === 'text' ? `<div class="qp-good">Bonne réponse : <b>${esc(correctText(q))}</b></div>` : ''}
        ${!o.done && !o.reveal ? `<button type="button" class="qp-send" data-send>${q.t === 'open' ? 'Envoyer' : 'Valider'}</button>` : ''}</div>`;
    }
    if (q.t === 'order') {
      const ids = Array.isArray(given) && given.length ? given : (q.opts || []).map(x => x.id);
      const by = new Map((q.opts || []).map(x => [x.id, x]));
      const items = o.reveal ? (q.opts || []).map(x => x.id) : ids;
      return `<div class="qp-order${o.reveal ? ' reveal' : ''}">${items.map((id, i) => { const op = by.get(id); if (!op) return ''; return `<div class="qp-oitem" data-opt="${esc(id)}"><span class="qp-onum">${i + 1}</span><span class="qp-otext">${esc(op.text) || '…'}</span>${o.done || o.reveal ? '' : `<span class="qp-omv"><button type="button" data-mv="-1" title="Monter"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" data-mv="1" title="Descendre"${i === items.length - 1 ? ' disabled' : ''}>▼</button></span>`}</div>`; }).join('')}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider cet ordre</button>' : ''}</div>`;
    }
    if (q.t === 'match') {
      if (o.reveal) {
        const pairs = (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim());
        const mine = given && typeof given === 'object' ? given : null;
        const rt = id => { if (q.rkey) { const p = pairs.find(x => x.id === q.rkey[id]); return p ? p.r : '?'; } const p = pairs.find(x => x.id === id); return p ? p.r : '?'; };
        return `<div class="qp-match reveal">${pairs.map((x, i) => { const good = mine ? (q.rkey ? q.rkey[mine[x.id]] === x.id : mine[x.id] === x.id) : null; return `<div class="qp-mrow${good === true ? ' ok' : good === false ? ' ko' : ''}"><span class="qp-shape" style="--oc:${colorVar(i)}">${letter(i)}</span><span class="qp-ml">${esc(x.l)}</span><span class="qp-marr">→</span><span class="qp-mr">${esc(x.r)}${mine && good === false ? ` <s>${esc(rt(mine[x.id]))}</s>` : ''}</span></div>`; }).join('')}</div>`;
      }
      const lefts = q.opts || [], rights = q.rights || [];
      const mine = given && typeof given === 'object' ? given : {};
      return `<div class="qp-match">${lefts.map((x, i) => `<div class="qp-mrow"><span class="qp-shape" style="--oc:${colorVar(i)}">${letter(i)}</span><span class="qp-ml">${esc(x.text)}</span><span class="qp-marr">→</span><select data-left="${esc(x.id)}"${dis}><option value="">…</option>${rights.map(r => `<option value="${esc(r.id)}" ${mine[x.id] === r.id ? 'selected' : ''}>${esc(r.text)}</option>`).join('')}</select></div>`).join('')}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
    }
    return '';
  }
  /* lit la réponse dans le DOM du widget (root = élément qui contient widgetHTML) */
  function readAnswer(q, root) {
    if (q.t === 'mcq' || q.t === 'poll') { const ids = [...root.querySelectorAll('.qp-opt.sel')].map(b => b.dataset.opt); return ids.length ? ids : null; }
    if (q.t === 'tf') { const b = root.querySelector('.qp-tf.sel'); return b ? b.dataset.tf === '1' : null; }
    if (q.t === 'scale') { const b = root.querySelector('.qp-sbtn.sel'); return b ? +b.dataset.val : null; }
    if (q.t === 'slider') { const i = root.querySelector('input[type=range]'); return i ? +i.value : null; }
    if (q.t === 'numeric') { const i = root.querySelector('input[type=number]'); const v = i ? i.value.trim().replace(',', '.') : ''; return v !== '' && isFinite(+v) ? +v : null; }
    if (q.t === 'text' || q.t === 'open') { const i = root.querySelector('input[type=text]'); const v = i ? i.value.trim() : ''; return v || null; }
    if (q.t === 'order') return [...root.querySelectorAll('.qp-oitem')].map(x => x.dataset.opt);
    if (q.t === 'match') { const v = {}; let all = true; root.querySelectorAll('select[data-left]').forEach(s => { if (s.value) v[s.dataset.left] = s.value; else all = false; }); return all && Object.keys(v).length ? v : null; }
    return null;
  }
  /* branche les interactions du widget ; onAnswer(v) est appelé quand la réponse est prête (clic direct ou « Valider ») */
  function bindWidget(q, root, onAnswer) {
    const multi = q.t === 'mcq' && q.multi;
    root.addEventListener('click', e => {
      const opt = e.target.closest('.qp-opt');
      if (opt && !opt.disabled) {
        if (q.t === 'tf') { root.querySelectorAll('.qp-tf').forEach(b => b.classList.toggle('sel', b === opt)); onAnswer(opt.dataset.tf === '1'); return; }
        if (q.t === 'scale') { root.querySelectorAll('.qp-sbtn').forEach(b => b.classList.toggle('sel', b === opt)); onAnswer(+opt.dataset.val); return; }
        if (multi) { opt.classList.toggle('sel'); return; }
        root.querySelectorAll('.qp-opt').forEach(b => b.classList.toggle('sel', b === opt));
        onAnswer([opt.dataset.opt]); return;
      }
      const mv = e.target.closest('[data-mv]');
      if (mv) {
        const it = mv.closest('.qp-oitem'); const list = it.parentElement; const d = +mv.dataset.mv;
        const sib = d < 0 ? it.previousElementSibling : it.nextElementSibling;
        if (sib && sib.classList.contains('qp-oitem')) { if (d < 0) list.insertBefore(it, sib); else list.insertBefore(sib, it); }
        [...list.querySelectorAll('.qp-oitem')].forEach((x, i, arr) => { x.querySelector('.qp-onum').textContent = i + 1; const up = x.querySelector('[data-mv="-1"]'), dn = x.querySelector('[data-mv="1"]'); if (up) up.disabled = i === 0; if (dn) dn.disabled = i === arr.length - 1; });
        return;
      }
      if (e.target.closest('[data-send]')) { const v = readAnswer(q, root); if (v === null || (Array.isArray(v) && !v.length)) { const inp = root.querySelector('input, select'); if (inp) inp.focus(); return; } onAnswer(v); }
    });
    const rg = root.querySelector('input[type=range]'); if (rg) rg.addEventListener('input', () => { const o = root.querySelector('output'); if (o) o.textContent = rg.value; });
    root.querySelectorAll('input[type=text], input[type=number]').forEach(tx => tx.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = readAnswer(q, root); if (v !== null) onAnswer(v); } }));
  }

  return { COLORS, SHAPES, LETTERS, PAL_LIGHT, PAL_DARK, TYPES, GROUPS, THEMES, FONTS, esc, uid, norm, shuffle, isScored, isPage, resolveTheme, themeStyle, newQuestion, publicQuestion, sendable, check, points, answerText, correctText, stats, widgetHTML, readAnswer, bindWidget, letter };
})();
