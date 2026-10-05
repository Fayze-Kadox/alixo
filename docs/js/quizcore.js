/* ============================================================
   Alixo — quiz : noyau commun (1.24)
   Partagé par l'application (js/quiz.js : éditeur, test, présentation en direct) et par la page des
   participants (quiz.html + js/quizplay.js) : types de questions, vérification des réponses, points,
   statistiques et rendu des réponses sur l'écran de chacun. Aucune dépendance (ni app.js, ni Firebase).

   Question : { id, t, text, time (s, 0 = sans limite), points, opts: [{ id, text }], ans, multi, min, max, step, tol }
     t = 'mcq'   choix multiple   opts, ans: [id…] (plusieurs bonnes réponses possibles : multi = true)
         'tf'    vrai / faux      ans: true | false
         'slider' curseur         min, max, step, ans: nombre, tol: tolérance acceptée (± tol)
         'text'  réponse écrite   ans: [texte accepté…] (majuscules, accents et espaces ignorés)
         'order' ordre à remettre opts dans le bon ordre ; les participants les reçoivent mélangés
         'poll'  sondage          opts, aucune bonne réponse (0 point)
   Réponse d'un participant (v) : mcq / poll → [id…], tf → booléen, slider → nombre, text → chaîne, order → [id…].
   ============================================================ */
'use strict';

window.QuizCore = (() => {
  const COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3'];
  const SHAPES = ['▲', '◆', '●', '■', '⬟', '✶'];
  const TYPES = {
    mcq: { name: 'Choix multiple', sub: 'Une ou plusieurs bonnes réponses parmi 2 à 6 propositions', ico: '◆' },
    tf: { name: 'Vrai / Faux', sub: 'Une affirmation, deux boutons', ico: '✓' },
    slider: { name: 'Curseur', sub: 'Une valeur à placer sur une échelle (année, pourcentage…)', ico: '⟷' },
    text: { name: 'Réponse écrite', sub: 'Un mot ou une expression à taper', ico: 'Aa' },
    order: { name: 'Ordre', sub: 'Des éléments à remettre dans le bon ordre', ico: '⇅' },
    poll: { name: 'Sondage', sub: 'Un avis, sans bonne réponse ni points', ico: '◔' }
  };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function newQuestion(t) {
    const q = { id: uid(), t: TYPES[t] ? t : 'mcq', text: '', time: 20, points: 1000 };
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'order') q.opts = [{ id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }, { id: uid(), text: '' }].slice(0, q.t === 'order' ? 3 : 4);
    if (q.t === 'mcq') { q.ans = []; q.multi = false; }
    if (q.t === 'tf') q.ans = true;
    if (q.t === 'slider') { q.min = 0; q.max = 100; q.step = 1; q.ans = 50; q.tol = 0; }
    if (q.t === 'text') q.ans = [];
    if (q.t === 'poll') q.points = 0;
    return q;
  }
  /* la question telle qu'elle part chez les participants : sans la réponse ; les éléments à ordonner sont mélangés */
  function publicQuestion(q) {
    const p = { id: q.id, t: q.t, text: q.text || '', time: +q.time || 0, points: +q.points || 0 };
    if (q.opts) p.opts = q.opts.map(o => ({ id: o.id, text: o.text || '' }));
    if (q.t === 'mcq') p.multi = !!q.multi || (Array.isArray(q.ans) && q.ans.length > 1);
    if (q.t === 'slider') { p.min = +q.min || 0; p.max = +q.max || 100; p.step = +q.step || 1; }
    if (q.t === 'order' && p.opts) { for (let i = p.opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p.opts[i], p.opts[j]] = [p.opts[j], p.opts[i]]; } if (q.opts.length > 1 && p.opts.every((o, i) => o.id === q.opts[i].id)) p.opts.reverse(); }
    return p;
  }
  /* vrai / faux / null (sondage ou réponse absente) */
  function check(q, v) {
    if (!q || v === undefined || v === null) return null;
    switch (q.t) {
      case 'mcq': { const a = new Set(Array.isArray(q.ans) ? q.ans : [q.ans].filter(Boolean)); const r = new Set(Array.isArray(v) ? v : [v]); return a.size > 0 && a.size === r.size && [...a].every(x => r.has(x)); }
      case 'tf': return !!v === !!q.ans;
      case 'slider': return Math.abs((+v) - (+q.ans)) <= (+q.tol || 0) + 1e-9;
      case 'text': { const n = norm(v); return !!n && (Array.isArray(q.ans) ? q.ans : [q.ans]).some(a => norm(a) === n); }
      case 'order': return Array.isArray(v) && Array.isArray(q.opts) && v.length === q.opts.length && v.every((id, i) => id === q.opts[i].id);
      default: return null;
    }
  }
  /* points : la moitié pour la justesse, l'autre moitié fond avec le temps écoulé (el ms) — comme Kahoot */
  function points(q, el, ok) {
    if (!ok || q.t === 'poll') return 0;
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
      case 'slider': return String(v);
      case 'text': return String(v);
      case 'order': return (Array.isArray(v) ? v : []).map(optText).join(' → ');
      default: return String(v);
    }
  }
  function correctText(q) {
    switch (q.t) {
      case 'mcq': return answerText(q, q.ans || []);
      case 'tf': return q.ans ? 'Vrai' : 'Faux';
      case 'slider': return String(q.ans) + (q.tol ? ` (± ${q.tol})` : '');
      case 'text': return (Array.isArray(q.ans) ? q.ans : [q.ans]).filter(Boolean).join(' / ');
      case 'order': return (q.opts || []).map(o => o.text).join(' → ');
      default: return '';
    }
  }
  /* statistiques des réponses reçues (liste de v) pour l'écran du présentateur */
  function stats(q, list) {
    const n = list.length;
    if (q.t === 'mcq' || q.t === 'poll') {
      const c = {}; for (const o of (q.opts || [])) c[o.id] = 0;
      for (const v of list) for (const id of (Array.isArray(v) ? v : [v])) if (id in c) c[id]++;
      return { n, counts: c };
    }
    if (q.t === 'tf') { let t = 0; for (const v of list) if (v) t++; return { n, counts: { true: t, false: n - t } }; }
    if (q.t === 'order') { let ok = 0; for (const v of list) if (check(q, v)) ok++; return { n, counts: { ok, ko: n - ok } }; }
    if (q.t === 'slider') { const vals = list.map(Number).filter(x => !isNaN(x)); const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; return { n, values: vals, mean, ok: vals.filter(v => check(q, v)).length }; }
    if (q.t === 'text') { const c = {}; for (const v of list) { const k = String(v).trim(); if (!k) continue; c[k] = (c[k] || 0) + 1; } return { n, counts: c, ok: list.filter(v => check(q, v)).length }; }
    return { n };
  }

  /* ---------------- écran du participant : la question et les boutons de réponse ----------------
     o = { done (déjà répondu), v (réponse donnée), reveal (bonne réponse affichée : q complète), big (écran présentateur) } */
  function widgetHTML(q, o = {}) {
    const dis = o.done || o.reveal ? ' disabled' : '';
    const given = o.v;
    if (q.t === 'mcq' || q.t === 'poll') {
      const multi = q.t === 'mcq' && (q.multi || (o.reveal && Array.isArray(q.ans) && q.ans.length > 1));
      const sel = new Set(Array.isArray(given) ? given : []);
      const ans = new Set(o.reveal && Array.isArray(q.ans) ? q.ans : []);
      return `<div class="qp-opts n${(q.opts || []).length}">${(q.opts || []).map((op, i) => `<button type="button" class="qp-opt${sel.has(op.id) ? ' sel' : ''}${o.reveal ? (ans.has(op.id) ? ' ok' : ' ko') : ''}" data-opt="${esc(op.id)}" style="--oc:${COLORS[i % COLORS.length]}"${dis}><span class="qp-shape">${SHAPES[i % SHAPES.length]}</span><span class="qp-otext">${esc(op.text) || '…'}</span>${multi ? '<span class="qp-check"></span>' : ''}</button>`).join('')}</div>${multi && !o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider mes réponses</button>' : ''}`;
    }
    if (q.t === 'tf') {
      const mk = (val, lab, col, sh) => `<button type="button" class="qp-opt qp-tf${given === val ? ' sel' : ''}${o.reveal ? (q.ans === val ? ' ok' : ' ko') : ''}" data-tf="${val ? '1' : '0'}" style="--oc:${col}"${dis}><span class="qp-shape">${sh}</span><span class="qp-otext">${lab}</span></button>`;
      return `<div class="qp-opts n2">${mk(true, 'Vrai', '#26890c', '✓')}${mk(false, 'Faux', '#e21b3c', '✗')}</div>`;
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
    if (q.t === 'text') {
      return `<div class="qp-text"><input type="text" maxlength="80" placeholder="Votre réponse…" autocomplete="off" autocapitalize="off" value="${esc(given || '')}"${dis}>
        ${o.reveal ? `<div class="qp-good">Bonne réponse : <b>${esc(correctText(q))}</b></div>` : ''}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider</button>' : ''}</div>`;
    }
    if (q.t === 'order') {
      const ids = Array.isArray(given) && given.length ? given : (q.opts || []).map(x => x.id);
      const by = new Map((q.opts || []).map(x => [x.id, x]));
      const items = o.reveal ? (q.opts || []).map(x => x.id) : ids;
      return `<div class="qp-order${o.reveal ? ' reveal' : ''}">${items.map((id, i) => { const op = by.get(id); if (!op) return ''; return `<div class="qp-oitem" data-opt="${esc(id)}"><span class="qp-onum">${i + 1}</span><span class="qp-otext">${esc(op.text) || '…'}</span>${o.done || o.reveal ? '' : `<span class="qp-omv"><button type="button" data-mv="-1" title="Monter"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" data-mv="1" title="Descendre"${i === items.length - 1 ? ' disabled' : ''}>▼</button></span>`}</div>`; }).join('')}
        ${!o.done && !o.reveal ? '<button type="button" class="qp-send" data-send>Valider cet ordre</button>' : ''}</div>`;
    }
    return '';
  }
  /* lit la réponse dans le DOM du widget (root = élément qui contient widgetHTML) */
  function readAnswer(q, root) {
    if (q.t === 'mcq' || q.t === 'poll') { const ids = [...root.querySelectorAll('.qp-opt.sel')].map(b => b.dataset.opt); return ids.length ? ids : null; }
    if (q.t === 'tf') { const b = root.querySelector('.qp-tf.sel'); return b ? b.dataset.tf === '1' : null; }
    if (q.t === 'slider') { const i = root.querySelector('input[type=range]'); return i ? +i.value : null; }
    if (q.t === 'text') { const i = root.querySelector('input[type=text]'); const v = i ? i.value.trim() : ''; return v || null; }
    if (q.t === 'order') return [...root.querySelectorAll('.qp-oitem')].map(x => x.dataset.opt);
    return null;
  }
  /* branche les interactions du widget ; onAnswer(v) est appelé quand la réponse est prête (clic direct ou « Valider ») */
  function bindWidget(q, root, onAnswer) {
    const multi = q.t === 'mcq' && q.multi;
    root.addEventListener('click', e => {
      const opt = e.target.closest('.qp-opt');
      if (opt && !opt.disabled) {
        if (q.t === 'tf') { root.querySelectorAll('.qp-tf').forEach(b => b.classList.toggle('sel', b === opt)); onAnswer(opt.dataset.tf === '1'); return; }
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
      if (e.target.closest('[data-send]')) { const v = readAnswer(q, root); if (v === null || (Array.isArray(v) && !v.length)) return; onAnswer(v); }
    });
    const rg = root.querySelector('input[type=range]'); if (rg) rg.addEventListener('input', () => { const o = root.querySelector('output'); if (o) o.textContent = rg.value; });
    const tx = root.querySelector('input[type=text]'); if (tx) tx.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = readAnswer(q, root); if (v) onAnswer(v); } });
  }

  return { COLORS, SHAPES, TYPES, esc, uid, norm, newQuestion, publicQuestion, check, points, answerText, correctText, stats, widgetHTML, readAnswer, bindWidget };
})();
