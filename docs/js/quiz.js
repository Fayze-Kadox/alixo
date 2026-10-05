/* ============================================================
   Alixo — quiz (1.24)
   Un quiz est une séance particulière : { kind: 'quiz', questions: [...], results: [...] }
   (d.blocks reste vide : synchronisation, onglets, bibliothèque, corbeille et partage n'ont rien
   de nouveau à connaître). Types de questions et règles de points : js/quizcore.js (partagé avec
   la page des participants quiz.html).

   Trois usages :
   - l'ÉDITEUR (#view-quiz) : palette de types à glisser dans la liste des questions (ou clic),
     questions réordonnables par glisser-déposer, réponses saisies par objets (propositions à cocher,
     Vrai / Faux, curseur, ordre, réponses acceptées) ;
   - le TEST (overlay #qz-play, mode « test ») : on joue le quiz sur cet appareil, question après
     question, chronomètre et points ; le résultat est enregistré dans d.results ;
   - la PRÉSENTATION EN DIRECT (mode « live ») : comme Kahoot. L'écran du présentateur affiche un
     code à 6 chiffres et un QR code ; les participants ouvrent alixoapp.com/quiz sur leur téléphone
     ou ordinateur, entrent le code et un pseudo, puis répondent sur leur appareil à chaque question.
     Firestore : live/{code} (état de la partie, question en cours — sans la réponse — puis la réponse
     révélée, statistiques et classement) et live/{code}/players/{pid} (pseudo, réponses, score).
     Les participants n'ont pas de compte : voir firestore.rules (bloc « Quiz en direct »).
     À la fin, le classement est enregistré dans d.results (Résultats, dans la barre).

   Chargé APRÈS app.js : utilise ses globales (state, doc(), save(), openTabs, renderTabs,
   renderCrumbs, toast, esc, uid, folderTint, openDialog, confirmDialog, exportWatermark…).
   ============================================================ */
'use strict';

window.AlixoQuiz = (() => {
  const C = window.QuizCore;
  const HIST_MAX = 60;
  const MAX_OPTS = 6;
  const JOIN_HOST = 'alixoapp.com/quiz';
  const joinUrl = code => `https://alixoapp.com/quiz/?code=${encodeURIComponent(code)}`;
  const TIMES = [[0, 'Sans limite'], [10, '10 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '1 min'], [90, '1 min 30'], [120, '2 min'], [180, '3 min']];
  const POINTS = [[0, '0 point'], [500, '500 points'], [1000, '1 000 points'], [2000, '2 000 points']];

  const I = {
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8Z"/></svg>',
    cast: '<svg viewBox="0 0 24 24"><path d="M3 17a9 9 0 0 1 9 9M3 12a14 14 0 0 1 14 14"/><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 20h.01"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    qr: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3"/></svg>'
  };

  /* ---------------- état ---------------- */
  const d = () => (typeof doc === 'function' ? doc() : null);
  const qsOf = dd => (Array.isArray(dd && dd.questions) ? dd.questions : (dd ? (dd.questions = []) : []));
  const resOf = dd => (Array.isArray(dd && dd.results) ? dd.results : (dd ? (dd.results = []) : []));
  const active = () => document.body.classList.contains('mode-quiz');
  let cur = null;                    // question affichée dans l'éditeur
  let hist = { undo: [], redo: [] };
  let readOnly = false, bound = false, saveTm = null, remoteTm = null;
  let dragQ = null, dragType = null; // glisser-déposer : question déplacée / type depuis la palette
  let test = null;                   // { i, score, ok, answers, timer, shownAt, done }
  let live = null;                   // session en direct (hôte) — voir startLive
  const curQ = () => { const dd = d(); if (!dd) return null; return qsOf(dd).find(q => q.id === cur) || null; };
  const qText = q => (q.text || '').trim() || 'Question sans texte';

  function newDoc(fid, prof) {
    return { id: uid(), kind: 'quiz', folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: prof || '', blocks: [], questions: [C.newQuestion('mcq')], results: [] };
  }

  /* ---------------- ouverture / fermeture ---------------- */
  function open(id) {
    const dd = findDoc(id); if (!dd) return;
    if (currentDocId && currentDocId !== id && typeof rememberScroll === 'function') rememberScroll();
    if (typeof hidePopover === 'function') hidePopover();
    if (typeof closeCtxMenu === 'function') closeCtxMenu();
    if (window.AlixoSlides) AlixoSlides.leave();
    if (window.AlixoSheets) AlixoSheets.leave();
    if (window.AlixoBoard) AlixoBoard.leave();
    currentDocId = id;
    const shared = typeof isSharedDoc === 'function' && isSharedDoc(id);
    readOnly = !!(shared && !(window.AlixoShare && AlixoShare.canWrite(id)));
    document.body.classList.toggle('readonly', readOnly);
    if (shared && window.AlixoShare && AlixoShare.noteOpened) AlixoShare.noteOpened(id);
    qsOf(dd); resOf(dd);
    if (!qsOf(dd).some(q => q.id === cur)) cur = qsOf(dd).length ? qsOf(dd)[0].id : null;
    hist = { undo: [], redo: [] };
    document.body.classList.remove('mode-editor', 'mode-slides', 'mode-sheet', 'mode-board');
    document.body.classList.add('mode-quiz');
    $('#view-library').style.display = 'none';
    $('#view-editor').hidden = true;
    $('#toolbar').hidden = true;
    $('#view-quiz').hidden = false;
    document.documentElement.style.setProperty('--tint', folderTint(dd.folderId));
    if (typeof setSaveStatus === 'function') setSaveStatus('saved');
    if (!openTabs.includes(id)) openTabs.push(id);
    renderTabs(); renderCrumbs();
    if (typeof renderAccess === 'function') renderAccess();
    if (shared && window.AlixoShare) AlixoShare.setPresence(id, null);
    bind();
    renderAll();
  }
  function leave() {
    if (!active()) return;
    if (saveTm) { clearTimeout(saveTm); saveTm = null; commit(); }
    document.body.classList.remove('mode-quiz');
    $('#view-quiz').hidden = true;
    dragQ = null; dragType = null;
  }
  /* version reçue d'un autre membre / appareil pendant que le quiz est ouvert */
  function remoteChanged() {
    if (!active()) return;
    clearTimeout(remoteTm);
    if (document.activeElement && document.activeElement.closest('#qz-edit')) { remoteTm = setTimeout(remoteChanged, 2000); return; }
    renderAll();
  }

  /* ---------------- enregistrement et historique ---------------- */
  function commit() {
    clearTimeout(saveTm); saveTm = null;
    const dd = d(); if (!dd || readOnly) return;
    dd.updatedAt = Date.now();
    save();
  }
  function commitSoon() { clearTimeout(saveTm); saveTm = setTimeout(commit, 400); }
  function pushHist() {
    const dd = d(); if (!dd || readOnly) return;
    hist.undo.push(JSON.stringify(qsOf(dd)));
    if (hist.undo.length > HIST_MAX) hist.undo.shift();
    hist.redo.length = 0;
  }
  function undo() {
    const dd = d(); if (!dd || !active() || !hist.undo.length) return false;
    hist.redo.push(JSON.stringify(qsOf(dd)));
    dd.questions = JSON.parse(hist.undo.pop());
    commit(); renderAll(); return true;
  }
  function redo() {
    const dd = d(); if (!dd || !active() || !hist.redo.length) return false;
    hist.undo.push(JSON.stringify(qsOf(dd)));
    dd.questions = JSON.parse(hist.redo.pop());
    commit(); renderAll(); return true;
  }

  /* ============================================================
     Éditeur
     ============================================================ */
  function renderAll() { renderBar(); renderList(); renderEdit(); renderPalette(); }
  function renderBar() {
    const bar = $('#qz-bar'); const dd = d(); if (!bar || !dd) return;
    const n = qsOf(dd).length, nr = resOf(dd).length;
    const info = readOnly && window.AlixoShare && AlixoShare.infoFor ? AlixoShare.infoFor(dd.id) : null;
    bar.innerHTML = `<div class="bd-barl">
      ${readOnly ? `<span class="bd-barlabel">Quiz</span><span class="bd-ro">Partagé par <b>${esc(info ? info.owner : 'un membre')}</b> · lecture seule</span>` : `
      <button data-qz="undo" title="Annuler (Ctrl+Z)" ${hist.undo.length ? '' : 'disabled'}>${I.undo}</button>
      <button data-qz="redo" title="Rétablir (Ctrl+Y)" ${hist.redo.length ? '' : 'disabled'}>${I.redo}</button>
      <span class="bd-sep"></span>
      <span class="bd-barlabel">Quiz</span><span class="qz-count">${n} question${n > 1 ? 's' : ''}</span>`}
    </div>
    <div class="bd-barr">
      <button data-qz="test" class="qz-primary" title="Jouer le quiz sur cet appareil (F5) : chronomètre, points, résultat enregistré">${I.play}<span class="bd-lbl">Tester</span></button>
      <button data-qz="live" class="qz-live" title="Présenter en direct : code et QR code à l'écran, les participants répondent sur leur téléphone (alixoapp.com/quiz)">${I.cast}<span class="bd-lbl">Présenter en direct</span></button>
      <button data-qz="results" title="Résultats enregistrés (tests et parties en direct)">${I.chart}<span class="bd-lbl">Résultats${nr ? ` (${nr})` : ''}</span></button>
      <span class="bd-sep"></span>
      <button data-qz="pdf" title="Exporter en PDF (Ctrl+P) : les questions, avec les réponses">PDF</button>
    </div>`;
  }
  function renderPalette() {
    const el = $('#qz-palette'); if (!el) return;
    if (readOnly) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="qz-ptitle">Ajouter une question</div><div class="qz-phint">Glissez un type dans la liste, ou cliquez : la question s’ajoute après celle qui est ouverte.</div>
      ${Object.entries(C.TYPES).map(([k, t]) => `<div class="qz-ptype" draggable="true" data-type="${k}" title="${esc(t.sub)}"><span class="qz-pico">${t.ico}</span><span><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span></div>`).join('')}`;
  }
  function renderList() {
    const el = $('#qz-list'); const dd = d(); if (!el || !dd) return;
    const qs = qsOf(dd);
    el.innerHTML = `<div class="qz-ltitle">Questions</div>` + (qs.length ? qs.map((q, i) => `<div class="qz-card${q.id === cur ? ' cur' : ''}" data-q="${q.id}" ${readOnly ? '' : 'draggable="true"'}>
        <span class="qz-cnum">${i + 1}</span>
        <span class="qz-cbody"><span class="qz-ctype">${C.TYPES[q.t] ? C.TYPES[q.t].ico + ' ' + C.TYPES[q.t].name : q.t}</span><span class="qz-ctext">${esc(qText(q))}</span></span>
        ${readOnly ? '' : `<span class="qz-cact"><button type="button" data-cdup title="Dupliquer">${I.dup}</button><button type="button" data-cdel title="Supprimer">${I.trash}</button></span>`}
      </div>`).join('') : `<div class="qz-lempty">Aucune question. ${readOnly ? '' : 'Glissez un type depuis la palette, ou cliquez dessus.'}</div>`)
      + (readOnly ? '' : `<div class="qz-ldrop" data-drop-end>${qs.length ? 'Déposer ici pour ajouter à la fin' : ''}</div>`);
  }
  function optRow(q, op, i) {
    const col = C.COLORS[i % C.COLORS.length], sh = C.SHAPES[i % C.SHAPES.length];
    const isAns = q.t === 'mcq' && Array.isArray(q.ans) && q.ans.includes(op.id);
    return `<div class="qz-opt${isAns ? ' ok' : ''}" data-opt="${op.id}" style="--oc:${col}">
      ${q.t === 'order' ? `<span class="qz-onum">${i + 1}</span>` : `<span class="qz-oshape">${sh}</span>`}
      <input class="qz-otext" value="${esc(op.text)}" placeholder="${q.t === 'order' ? `Élément ${i + 1}` : `Proposition ${i + 1}`}" maxlength="120" ${readOnly ? 'disabled' : ''}>
      ${q.t === 'mcq' ? `<button type="button" class="qz-ook" data-ook title="${isAns ? 'Bonne réponse (cliquer pour retirer)' : 'Marquer comme bonne réponse'}" ${readOnly ? 'disabled' : ''}>✓</button>` : ''}
      ${q.t === 'order' ? `<span class="qz-omv"><button type="button" data-omv="-1" title="Monter" ${i === 0 || readOnly ? 'disabled' : ''}>▲</button><button type="button" data-omv="1" title="Descendre" ${i === q.opts.length - 1 || readOnly ? 'disabled' : ''}>▼</button></span>` : ''}
      <button type="button" class="qz-odel" data-odel title="Retirer" ${q.opts.length <= 2 || readOnly ? 'disabled' : ''}>${I.x}</button>
    </div>`;
  }
  function renderEdit() {
    const el = $('#qz-edit'); const dd = d(); if (!el || !dd) return;
    const q = curQ();
    if (!q) { el.innerHTML = `<div class="qz-eempty"><div class="qz-eico">?</div><p>${qsOf(dd).length ? 'Choisissez une question dans la liste.' : 'Ce quiz est vide : ajoutez une première question depuis la palette.'}</p></div>`; return; }
    const t = C.TYPES[q.t] || { name: q.t, ico: '?' };
    const dis = readOnly ? 'disabled' : '';
    let body = '';
    if (q.t === 'mcq' || q.t === 'poll' || q.t === 'order') {
      body = `<div class="qz-label">${q.t === 'order' ? 'Éléments, dans le bon ordre (les participants les reçoivent mélangés)' : q.t === 'poll' ? 'Propositions' : 'Propositions — cochez la ou les bonnes réponses'}</div>
        <div class="qz-opts" id="qz-opts">${q.opts.map((op, i) => optRow(q, op, i)).join('')}</div>
        <div class="po-row" style="gap:10px; margin-top:8px; flex-wrap:wrap; align-items:center">
          <button type="button" class="cta ghost small" data-oadd ${q.opts.length >= MAX_OPTS || readOnly ? 'disabled' : ''}>＋ ${q.t === 'order' ? 'Élément' : 'Proposition'}</button>
          ${q.t === 'mcq' ? `<label class="set-inline"><input type="checkbox" data-multi ${q.multi ? 'checked' : ''} ${dis}> Plusieurs bonnes réponses (le participant valide une sélection)</label>` : ''}
        </div>${q.t === 'mcq' && !(q.ans || []).length ? '<div class="qz-warn">Aucune bonne réponse cochée : la question ne rapportera aucun point.</div>' : ''}`;
    } else if (q.t === 'tf') {
      body = `<div class="qz-label">Bonne réponse</div><div class="qz-tf">
        <button type="button" class="qz-tfbtn${q.ans ? ' on' : ''}" data-tf="1" style="--oc:#26890c" ${dis}>✓ Vrai</button>
        <button type="button" class="qz-tfbtn${!q.ans ? ' on' : ''}" data-tf="0" style="--oc:#e21b3c" ${dis}>✗ Faux</button></div>`;
    } else if (q.t === 'slider') {
      body = `<div class="qz-label">Échelle et bonne réponse</div><div class="qz-grid">
        <label>Minimum <input type="number" data-f="min" value="${esc(q.min)}" ${dis}></label>
        <label>Maximum <input type="number" data-f="max" value="${esc(q.max)}" ${dis}></label>
        <label>Pas <input type="number" data-f="step" value="${esc(q.step)}" min="0.001" step="any" ${dis}></label>
        <label>Bonne réponse <input type="number" data-f="ans" value="${esc(q.ans)}" step="any" ${dis}></label>
        <label>Tolérance ± <input type="number" data-f="tol" value="${esc(q.tol || 0)}" min="0" step="any" ${dis}></label></div>
        <div class="qz-sprev">${C.widgetHTML({ t: 'slider', min: q.min, max: q.max, step: q.step }, { done: true })}</div>`;
    } else if (q.t === 'text') {
      const list = Array.isArray(q.ans) ? q.ans : [];
      body = `<div class="qz-label">Réponses acceptées (majuscules, accents et espaces sont ignorés)</div>
        <div class="qz-opts" id="qz-opts">${(list.length ? list : ['']).map((a, i) => `<div class="qz-opt ok" data-ans="${i}" style="--oc:#26890c"><span class="qz-oshape">✓</span><input class="qz-otext" value="${esc(a)}" placeholder="Réponse ${i + 1}" maxlength="80" ${dis}><button type="button" class="qz-odel" data-adel title="Retirer" ${list.length <= 1 || readOnly ? 'disabled' : ''}>${I.x}</button></div>`).join('')}</div>
        <div class="po-row" style="margin-top:8px"><button type="button" class="cta ghost small" data-aadd ${list.length >= 8 || readOnly ? 'disabled' : ''}>＋ Variante acceptée</button></div>`;
    }
    el.innerHTML = `<div class="qz-ehead">
        <span class="qz-etype" title="${esc(t.sub || '')}">${t.ico} ${esc(t.name)}</span>
        <span class="qz-espacer"></span>
        <label class="set-inline">Temps <select data-f="time" ${dis}>${TIMES.map(([v, l]) => `<option value="${v}" ${+q.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${q.t === 'poll' ? '' : `<label class="set-inline">Points <select data-f="points" ${dis}>${POINTS.map(([v, l]) => `<option value="${v}" ${+q.points === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
      </div>
      <textarea class="qz-qtext" data-f="text" placeholder="${q.t === 'tf' ? 'Affirmation à juger…' : q.t === 'poll' ? 'Question posée au public…' : 'Question…'}" rows="2" maxlength="400" ${dis}>${esc(q.text || '')}</textarea>
      ${body}
      ${q.t === 'poll' ? '' : '<div class="qz-hint">Points : la moitié pour la bonne réponse, l’autre moitié fond avec le temps écoulé (réponse immédiate = tous les points).</div>'}`;
  }

  /* ---------------- modifications ---------------- */
  function addQuestion(t, at) {
    const dd = d(); if (!dd || readOnly) return;
    pushHist();
    const q = C.newQuestion(t);
    const qs = qsOf(dd);
    let i = typeof at === 'number' ? at : (cur ? qs.findIndex(x => x.id === cur) + 1 : qs.length);
    if (i < 0 || i > qs.length) i = qs.length;
    qs.splice(i, 0, q);
    cur = q.id; commit(); renderAll();
    const ta = $('#qz-edit .qz-qtext'); if (ta) ta.focus();
  }
  function deleteQuestion(id) {
    const dd = d(); if (!dd || readOnly) return;
    const qs = qsOf(dd); const i = qs.findIndex(q => q.id === id); if (i < 0) return;
    pushHist(); qs.splice(i, 1);
    if (cur === id) cur = (qs[i] || qs[i - 1] || {}).id || null;
    commit(); renderAll();
  }
  function duplicateQuestion(id) {
    const dd = d(); if (!dd || readOnly) return;
    const qs = qsOf(dd); const i = qs.findIndex(q => q.id === id); if (i < 0) return;
    pushHist();
    const c = JSON.parse(JSON.stringify(qs[i])); c.id = C.uid();
    if (Array.isArray(c.opts)) { const map = {}; for (const o of c.opts) { const n = C.uid(); map[o.id] = n; o.id = n; } if (Array.isArray(c.ans) && c.t === 'mcq') c.ans = c.ans.map(a => map[a] || a); }
    qs.splice(i + 1, 0, c); cur = c.id; commit(); renderAll();
  }
  function moveQuestion(id, to) {
    const dd = d(); if (!dd || readOnly) return;
    const qs = qsOf(dd); const i = qs.findIndex(q => q.id === id); if (i < 0) return;
    if (to > i) to--; if (to === i || to < 0 || to > qs.length) return;
    pushHist(); const [q] = qs.splice(i, 1); qs.splice(to, 0, q); commit(); renderList();
  }
  function patch(fn, structural) {
    const dd = d(); const q = curQ(); if (!dd || !q || readOnly) return;
    if (structural) pushHist();
    fn(q); commitSoon();
    if (structural) { renderEdit(); renderList(); } else { const c = $(`#qz-list .qz-card[data-q="${q.id}"] .qz-ctext`); if (c) c.textContent = qText(q); }
  }

  /* ---------------- liaison des événements ---------------- */
  function bind() {
    if (bound) return; bound = true;
    const view = $('#view-quiz');
    $('#qz-bar').addEventListener('click', e => {
      const b = e.target.closest('[data-qz]'); if (!b) return;
      const a = b.dataset.qz;
      if (a === 'undo') undo(); else if (a === 'redo') redo();
      else if (a === 'test') startTest(); else if (a === 'live') startLive();
      else if (a === 'results') openResults(); else if (a === 'pdf') exportPDF();
    });
    /* palette : clic = ajouter après la question ouverte ; glisser = déposer dans la liste */
    $('#qz-palette').addEventListener('click', e => { const t = e.target.closest('[data-type]'); if (t) addQuestion(t.dataset.type); });
    $('#qz-palette').addEventListener('dragstart', e => { const t = e.target.closest('[data-type]'); if (!t) return; dragType = t.dataset.type; dragQ = null; e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', 'qz:' + dragType); } catch { /* */ } });
    $('#qz-palette').addEventListener('dragend', () => { dragType = null; clearDrop(); });
    /* liste : sélection, suppression, duplication, réordonnancement */
    const list = $('#qz-list');
    list.addEventListener('click', e => {
      const card = e.target.closest('.qz-card'); if (!card) return;
      if (e.target.closest('[data-cdel]')) { deleteQuestion(card.dataset.q); return; }
      if (e.target.closest('[data-cdup]')) { duplicateQuestion(card.dataset.q); return; }
      if (cur !== card.dataset.q) { cur = card.dataset.q; renderList(); renderEdit(); }
    });
    list.addEventListener('dragstart', e => { const card = e.target.closest('.qz-card'); if (!card || readOnly) { e.preventDefault(); return; } dragQ = card.dataset.q; dragType = null; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'qz:move'); } catch { /* */ } });
    list.addEventListener('dragend', () => { dragQ = null; clearDrop(); });
    list.addEventListener('dragover', e => {
      if (!dragQ && !dragType) return;
      e.preventDefault(); e.dataTransfer.dropEffect = dragQ ? 'move' : 'copy';
      clearDrop();
      const card = e.target.closest('.qz-card');
      if (card) { const r = card.getBoundingClientRect(); card.classList.add(e.clientY < r.top + r.height / 2 ? 'over-up' : 'over-down'); }
      else { const end = e.target.closest('[data-drop-end]') || list.querySelector('[data-drop-end]'); if (end) end.classList.add('over'); }
    });
    list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) clearDrop(); });
    list.addEventListener('drop', e => {
      if (!dragQ && !dragType) return;
      e.preventDefault();
      const dd = d(); const qs = qsOf(dd);
      const card = e.target.closest('.qz-card');
      let to = qs.length;
      if (card) { const r = card.getBoundingClientRect(); to = qs.findIndex(q => q.id === card.dataset.q) + (e.clientY < r.top + r.height / 2 ? 0 : 1); }
      if (dragType) addQuestion(dragType, to); else if (dragQ) moveQuestion(dragQ, to);
      dragQ = null; dragType = null; clearDrop();
    });
    /* éditeur de la question */
    const ed = $('#qz-edit');
    ed.addEventListener('input', e => {
      const f = e.target.dataset.f;
      if (f === 'text') { patch(q => { q.text = e.target.value; }); return; }
      if (e.target.classList.contains('qz-otext')) {
        const row = e.target.closest('.qz-opt');
        if (row.dataset.ans !== undefined) patch(q => { if (!Array.isArray(q.ans)) q.ans = []; q.ans[+row.dataset.ans] = e.target.value; });
        else patch(q => { const op = (q.opts || []).find(o => o.id === row.dataset.opt); if (op) op.text = e.target.value; });
        return;
      }
      if (['min', 'max', 'step', 'ans', 'tol'].includes(f)) { patch(q => { const v = parseFloat(e.target.value); if (!isNaN(v)) q[f] = v; }); const pv = ed.querySelector('.qz-sprev'); const q = curQ(); if (pv && q) pv.innerHTML = C.widgetHTML({ t: 'slider', min: q.min, max: q.max, step: q.step }, { done: true }); }
    });
    ed.addEventListener('change', e => {
      const f = e.target.dataset.f;
      if (f === 'time' || f === 'points') { patch(q => { q[f] = +e.target.value; }, true); return; }
      if (e.target.matches('[data-multi]')) { patch(q => { q.multi = e.target.checked; if (!q.multi && Array.isArray(q.ans) && q.ans.length > 1) q.ans = q.ans.slice(0, 1); }, true); return; }
      if (f === 'text' || e.target.classList.contains('qz-otext') || ['min', 'max', 'step', 'ans', 'tol'].includes(f)) pushHist();   // un point d'annulation par champ modifié
    });
    ed.addEventListener('click', e => {
      if (readOnly) return;
      if (e.target.closest('[data-oadd]')) { patch(q => { if ((q.opts || []).length < MAX_OPTS) q.opts.push({ id: C.uid(), text: '' }); }, true); const rows = ed.querySelectorAll('.qz-opt .qz-otext'); if (rows.length) rows[rows.length - 1].focus(); return; }
      if (e.target.closest('[data-aadd]')) { patch(q => { if (!Array.isArray(q.ans)) q.ans = []; if (q.ans.length < 8) q.ans.push(''); }, true); const rows = ed.querySelectorAll('.qz-opt .qz-otext'); if (rows.length) rows[rows.length - 1].focus(); return; }
      const tf = e.target.closest('[data-tf]'); if (tf) { patch(q => { q.ans = tf.dataset.tf === '1'; }, true); return; }
      const row = e.target.closest('.qz-opt'); if (!row) return;
      if (e.target.closest('[data-ook]')) { patch(q => { if (!Array.isArray(q.ans)) q.ans = []; const id = row.dataset.opt; if (q.ans.includes(id)) q.ans = q.ans.filter(x => x !== id); else q.ans = q.multi ? [...q.ans, id] : [id]; }, true); return; }
      if (e.target.closest('[data-odel]')) { patch(q => { if (q.opts.length <= 2) return; q.opts = q.opts.filter(o => o.id !== row.dataset.opt); if (Array.isArray(q.ans) && q.t === 'mcq') q.ans = q.ans.filter(a => a !== row.dataset.opt); }, true); return; }
      if (e.target.closest('[data-adel]')) { patch(q => { if (!Array.isArray(q.ans) || q.ans.length <= 1) return; q.ans.splice(+row.dataset.ans, 1); }, true); return; }
      const mv = e.target.closest('[data-omv]'); if (mv) { patch(q => { const i = q.opts.findIndex(o => o.id === row.dataset.opt); const j = i + (+mv.dataset.omv); if (i < 0 || j < 0 || j >= q.opts.length) return; [q.opts[i], q.opts[j]] = [q.opts[j], q.opts[i]]; }, true); }
    });
    /* clavier (la vue a le focus quand aucun champ n'est actif) */
    view.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.altKey && e.key === 'ArrowLeft' && !mod) { e.preventDefault(); showLibrary(); return; }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPDF(); return; }
      if (e.key === 'F5') { e.preventDefault(); startTest(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && cur && !readOnly) { e.preventDefault(); deleteQuestion(cur); }
    });
    document.addEventListener('keydown', e => { if (active() && play().hidden && e.key === 'F5' && !e.target.matches('input, textarea, select')) { e.preventDefault(); startTest(); } });
  }
  function clearDrop() { $$('#qz-list .over-up, #qz-list .over-down, #qz-list .over, #qz-list .dragging').forEach(x => x.classList.remove('over-up', 'over-down', 'over', 'dragging')); }

  /* ============================================================
     Écran de jeu (overlay #qz-play) : commun au test local et au direct
     ============================================================ */
  const play = () => $('#qz-play');
  function openPlay(cls) {
    const ov = play(); ov.hidden = false; ov.className = 'qz-play ' + cls; ov.innerHTML = '';
    document.body.classList.add('qz-playing');
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement && cls === 'qz-live') document.documentElement.requestFullscreen().catch(() => {}); } catch { /* */ }
    if (!ov.dataset.bound) {
      ov.dataset.bound = '1';
      document.addEventListener('keydown', e => {
        if (play().hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); if (live) closeLive(); else closeTest(); return; }
        if (live && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') && !e.target.matches('input, textarea')) { e.preventDefault(); liveNext(); }
      });
    }
  }
  function closePlay() {
    const ov = play(); ov.hidden = true; ov.innerHTML = ''; ov.className = 'qz-play';
    document.body.classList.remove('qz-playing');
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* */ }
  }
  const fmtPts = n => (n || 0).toLocaleString('fr-FR');
  function timerHTML(left, total) {
    if (!total) return '<span class="qp-timer none">∞</span>';
    const f = Math.max(0, Math.min(1, left / total));
    return `<span class="qp-timer${left <= 5 ? ' low' : ''}" style="--f:${f.toFixed(3)}"><b>${Math.ceil(left)}</b></span>`;
  }

  /* ---------------- test local ---------------- */
  function startTest() {
    const dd = d(); if (!dd) return;
    const qs = qsOf(dd).filter(q => (q.text || '').trim() || (q.opts || []).some(o => o.text));
    if (!qs.length) { toast('Ajoutez au moins une question avec un texte avant de tester'); return; }
    if (live) { toast('Une présentation en direct est en cours'); return; }
    test = { qs, i: 0, score: 0, ok: 0, answers: {}, timer: null, shownAt: 0, answered: false };
    openPlay('qz-test');
    renderTestQ();
  }
  function renderTestQ() {
    const ov = play(); const q = test.qs[test.i]; const p = C.publicQuestion(q);
    test.answered = false; test.shownAt = Date.now(); test.pub = p;
    ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Question ${test.i + 1} / ${test.qs.length}</span><span class="qp-score">${fmtPts(test.score)} pts</span><span id="qp-timer">${timerHTML(q.time, q.time)}</span><button type="button" class="qp-x" data-close title="Quitter (Échap)">${I.x}</button></div>
      <div class="qp-q">${esc(qText(q))}</div>
      <div class="qp-widget" id="qp-widget">${C.widgetHTML(p)}</div>
      <div class="qp-foot">Test sur cet appareil · ${C.TYPES[q.t] ? C.TYPES[q.t].name : ''}${q.t === 'poll' ? ' (sans points)' : ''}</div>`;
    ov.querySelector('[data-close]').addEventListener('click', closeTest);
    C.bindWidget(p, ov.querySelector('#qp-widget'), v => testAnswer(v));
    clearInterval(test.timer);
    if (q.time) {
      const end = test.shownAt + q.time * 1000;
      test.timer = setInterval(() => { const left = (end - Date.now()) / 1000; const t = $('#qp-timer'); if (t) t.innerHTML = timerHTML(left, q.time); if (left <= 0) { clearInterval(test.timer); testAnswer(null); } }, 200);
    }
  }
  function testAnswer(v) {
    if (!test || test.answered) return;
    test.answered = true; clearInterval(test.timer);
    const q = test.qs[test.i]; const el = Date.now() - test.shownAt;
    const ok = C.check(q, v); const pts = C.points(q, el, ok);
    test.score += pts; if (ok) test.ok++;
    test.answers[q.id] = { v, ok, pts, el };
    const ov = play();
    const full = Object.assign({}, test.pub, { ans: q.ans, tol: q.tol, opts: q.t === 'order' ? q.opts : test.pub.opts, multi: q.multi });
    ov.querySelector('#qp-widget').innerHTML = C.widgetHTML(full, { reveal: true, v, done: true });
    const fb = document.createElement('div'); fb.className = 'qp-fb ' + (q.t === 'poll' ? 'poll' : ok ? 'ok' : v === null ? 'late' : 'ko');
    fb.innerHTML = `<div class="qp-fbt">${q.t === 'poll' ? 'Merci pour votre avis' : ok ? 'Bonne réponse !' : v === null ? 'Temps écoulé' : 'Mauvaise réponse'}</div>${q.t === 'poll' ? '' : `<div class="qp-fbp">${ok ? '+ ' + fmtPts(pts) + ' pts' : 'Bonne réponse : ' + esc(C.correctText(q))}</div>`}<button type="button" class="qp-next" data-next>${test.i + 1 < test.qs.length ? 'Question suivante →' : 'Voir le résultat'}</button>`;
    ov.querySelector('.qp-widget').after(fb);
    fb.querySelector('[data-next]').addEventListener('click', () => { if (test.i + 1 < test.qs.length) { test.i++; renderTestQ(); } else endTest(); });
    fb.querySelector('[data-next]').focus();
  }
  function endTest() {
    const dd = d(); if (!dd || !test) return;
    const n = test.qs.length, scored = test.qs.filter(q => q.t !== 'poll').length;
    const rec = { id: uid(), mode: 'test', at: Date.now(), name: 'Moi', score: test.score, ok: test.ok, n: scored, answers: test.answers };
    if (!readOnly) { resOf(dd).push(rec); commit(); renderBar(); }
    const ov = play();
    ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Résultat</span><button type="button" class="qp-x" data-close title="Fermer (Échap)">${I.x}</button></div>
      <div class="qp-end"><div class="qp-endscore">${fmtPts(test.score)}<small>points</small></div>
      <div class="qp-endsub">${test.ok} bonne${test.ok > 1 ? 's' : ''} réponse${test.ok > 1 ? 's' : ''} sur ${scored}${n > scored ? ` · ${n - scored} sondage${n - scored > 1 ? 's' : ''}` : ''}</div>
      <div class="qp-endlist">${test.qs.map((q, i) => { const a = test.answers[q.id] || {}; return `<div class="qp-endrow ${q.t === 'poll' ? 'poll' : a.ok ? 'ok' : 'ko'}"><span>${i + 1}</span><span class="qp-endq">${esc(qText(q))}</span><span class="qp-enda">${esc(C.answerText(q, a.v))}</span><span class="qp-endp">${q.t === 'poll' ? '—' : a.ok ? '+' + fmtPts(a.pts) : '✗'}</span></div>`; }).join('')}</div>
      <div class="po-row" style="justify-content:center; gap:10px; margin-top:16px"><button type="button" class="qp-next" data-again>Rejouer</button><button type="button" class="qp-next ghost" data-close>Fermer</button></div>
      <div class="qp-foot">${readOnly ? 'Quiz en lecture seule : le résultat n’est pas enregistré.' : 'Résultat enregistré (bouton Résultats).'}</div></div>`;
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeTest));
    ov.querySelector('[data-again]').addEventListener('click', () => { closeTest(); startTest(); });
  }
  function closeTest() { if (test) clearInterval(test.timer); test = null; closePlay(); }

  /* ============================================================
     Présentation en direct (hôte)
     ============================================================ */
  const dbOk = () => !!(window.firebase && firebase.firestore && window.AlixoAuth && AlixoAuth.isConfigured && AlixoAuth.account());
  const liveRef = () => firebase.firestore().collection('live').doc(live.code);
  const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
  function qrSvg(url) {
    try {
      const q = qrcode(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount();
      let p = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
      return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${p}" fill="currentColor"/></svg>`;
    } catch { return ''; }
  }
  async function startLive() {
    const dd = d(); if (!dd) return;
    if (!dbOk()) { toast('Présenter en direct demande un compte Alixo connecté (Paramètres › Compte)', { duration: 6000 }); return; }
    const qs = qsOf(dd).filter(q => (q.text || '').trim() || (q.opts || []).some(o => o.text));
    if (!qs.length) { toast('Ajoutez au moins une question avant de présenter'); return; }
    if (live) { toast('Une présentation est déjà en cours'); return; }
    const db = firebase.firestore();
    const me = AlixoAuth.account();
    let code = genCode();
    for (let k = 0; k < 5; k++) { try { const s = await db.collection('live').doc(code).get(); if (!s.exists) break; } catch { break; } code = genCode(); }
    live = { code, qs, i: -1, state: 'lobby', players: new Map(), unsub: null, timer: null, qStart: 0, qEnd: 0, pub: null, busy: false, err: '' };
    try {
      await db.collection('live').doc(code).set({ code, host: me.uid, hostName: me.name || me.email || 'Présentateur', title: dd.titre || 'Quiz', n: qs.length, state: 'lobby', qi: -1, q: null, qStart: 0, qEnd: 0, answer: null, stats: null, top: [], createdAt: Date.now(), updatedAt: Date.now() });
    } catch (e) {
      live = null;
      console.error('Quiz en direct :', e);
      toast('Impossible de créer la partie : ' + (e && e.code === 'permission-denied' ? 'les règles Firestore du quiz en direct ne sont pas publiées (voir README)' : (e && e.message) || 'erreur réseau'), { duration: 8000 });
      return;
    }
    live.unsub = db.collection('live').doc(code).collection('players').onSnapshot(snap => {
      if (!live) return;
      snap.docChanges().forEach(ch => { if (ch.type === 'removed') live.players.delete(ch.doc.id); else live.players.set(ch.doc.id, Object.assign({ pid: ch.doc.id }, ch.doc.data())); });
      onPlayers();
    }, err => { console.error('Quiz en direct (participants) :', err); if (live) { live.err = 'Liaison avec les participants interrompue'; renderLive(); } });
    openPlay('qz-live');
    renderLive();
  }
  function onPlayers() {
    if (!live) return;
    if (live.state === 'lobby') { renderLivePlayers(); return; }
    if (live.state === 'q') {
      const n = live.players.size, a = answeredCount();
      const c = $('#qp-answered'); if (c) c.textContent = `${a} / ${n} réponse${a > 1 ? 's' : ''}`;
      if (n > 0 && a >= n && !live.allTm) live.allTm = setTimeout(() => { live.allTm = null; if (live && live.state === 'q') liveReveal(); }, 1200);   // tout le monde a répondu
    }
  }
  const answeredCount = () => { const q = live.pub; if (!q) return 0; let n = 0; for (const p of live.players.values()) if (p.answers && p.answers[q.id]) n++; return n; };
  function liveQ() { return live.i >= 0 ? live.qs[live.i] : null; }
  function liveNext() {
    if (!live || live.busy) return;
    if (live.state === 'lobby' || live.state === 'reveal') { if (live.i + 1 < live.qs.length) publishQuestion(live.i + 1); else liveEnd(); }
    else if (live.state === 'q') liveReveal();
    else if (live.state === 'end') closeLive();
  }
  async function publishQuestion(i) {
    if (!live) return;
    const q = live.qs[i]; const pub = C.publicQuestion(q);
    live.i = i; live.state = 'q'; live.pub = pub; live.qStart = Date.now(); live.qEnd = q.time ? live.qStart + q.time * 1000 : 0; live.busy = true;
    clearInterval(live.timer); if (live.allTm) { clearTimeout(live.allTm); live.allTm = null; }
    try { await liveRef().update({ state: 'q', qi: i, q: pub, qStart: live.qStart, qEnd: live.qEnd, answer: null, stats: null, updatedAt: Date.now() }); }
    catch (e) { console.error(e); live.err = 'Envoi de la question impossible'; }
    live.busy = false;
    renderLive();
    if (q.time) live.timer = setInterval(() => { if (!live || live.state !== 'q') { clearInterval(live.timer); return; } const left = (live.qEnd - Date.now()) / 1000; const t = $('#qp-timer'); if (t) t.innerHTML = timerHTML(left, q.time); if (left <= 0) { clearInterval(live.timer); liveReveal(); } }, 200);
  }
  async function liveReveal() {
    if (!live || live.state !== 'q' || live.busy) return;
    clearInterval(live.timer); if (live.allTm) { clearTimeout(live.allTm); live.allTm = null; }
    const q = liveQ(); const pub = live.pub;
    live.busy = true; live.state = 'reveal';
    const db = firebase.firestore();
    const list = [];
    const vals = [];
    for (const p of live.players.values()) {
      const a = p.answers && p.answers[q.id];
      const v = a ? a.v : null;
      const ok = a ? C.check(q, v) : (q.t === 'poll' ? null : false);
      const pts = a ? C.points(q, a.el || 0, ok) : 0;
      p.score = (+p.score || 0) + pts;
      p.fb = { qid: q.id, ok, pts, v, answered: !!a };
      if (a) vals.push(v);
      list.push(p);
    }
    list.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    list.forEach((p, i) => { p.rank = i + 1; });
    live.stats = C.stats(q, vals);
    live.top = list.slice(0, 10).map(p => ({ pid: p.pid, name: p.name || '?', score: p.score || 0 }));
    const answer = q.t === 'slider' ? { ans: q.ans, tol: q.tol || 0 } : q.t === 'order' ? { ans: q.opts.map(o => o.id) } : { ans: q.ans };
    try {
      await liveRef().update({ state: 'reveal', answer, stats: live.stats, top: live.top, updatedAt: Date.now() });
      const chunks = []; for (let i = 0; i < list.length; i += 400) chunks.push(list.slice(i, i + 400));
      for (const ch of chunks) { const batch = db.batch(); for (const p of ch) batch.update(db.collection('live').doc(live.code).collection('players').doc(p.pid), { score: p.score, rank: p.rank, fb: p.fb }); await batch.commit(); }
    } catch (e) { console.error(e); live.err = 'Envoi des résultats impossible'; }
    live.busy = false;
    renderLive();
  }
  async function liveEnd() {
    if (!live) return;
    live.state = 'end'; live.busy = true;
    const list = [...live.players.values()].sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    live.final = list.map((p, i) => ({ pid: p.pid, name: p.name || '?', score: p.score || 0, rank: i + 1 }));
    try { await liveRef().update({ state: 'end', top: live.final.slice(0, 50), updatedAt: Date.now() }); } catch (e) { console.error(e); }
    live.busy = false;
    const dd = d();
    if (dd && !readOnly && live.final.length) {
      const scored = live.qs.filter(q => q.t !== 'poll').length;
      resOf(dd).push({ id: uid(), mode: 'live', at: Date.now(), code: live.code, n: scored, questions: live.qs.length, players: live.final.map(p => ({ name: p.name, score: p.score, rank: p.rank })) });
      commit(); renderBar();
    }
    renderLive();
  }
  async function closeLive() {
    if (!live) return;
    if (live.state !== 'end' && live.state !== 'lobby' && live.players.size && !(await confirmDialog({ title: 'Arrêter la présentation ?', text: 'La partie en cours sera fermée pour les participants ; le classement ne sera pas enregistré.', ok: 'Arrêter', danger: true }))) return;
    const L = live; live = null;
    clearInterval(L.timer); if (L.allTm) clearTimeout(L.allTm);
    if (L.unsub) L.unsub();
    closePlay();
    /* ménage : la partie et ses participants sont effacés (les participants voient « partie terminée ») */
    try {
      const db = firebase.firestore();
      const ref = db.collection('live').doc(L.code);
      await ref.update({ state: 'closed', updatedAt: Date.now() });
      const ids = [...L.players.keys()];
      for (let i = 0; i < ids.length; i += 400) { const batch = db.batch(); for (const pid of ids.slice(i, i + 400)) batch.delete(ref.collection('players').doc(pid)); await batch.commit(); }
      setTimeout(() => ref.delete().catch(() => {}), 15000);
    } catch (e) { console.error('Quiz en direct (fermeture) :', e); }
  }
  /* ---- écran du présentateur ---- */
  function renderLivePlayers() {
    const box = $('#qp-players'); if (!box || !live) return;
    const names = [...live.players.values()].map(p => p.name || '?').sort((a, b) => a.localeCompare(b));
    box.innerHTML = `<div class="qp-pcount">${names.length} participant${names.length > 1 ? 's' : ''}</div><div class="qp-pnames">${names.map(n => `<span>${esc(n)}</span>`).join('')}</div>`;
    const b = $('#qp-start'); if (b) b.disabled = !names.length;
  }
  function renderLive() {
    const ov = play(); if (!live || ov.hidden) return;
    const dd = d();
    const top = (title, extra) => `<div class="qp-top"><span class="qp-prog">${title}</span>${extra || ''}<span class="qp-code-sm" title="Code de la partie">${JOIN_HOST} · <b>${live.code}</b></span><button type="button" class="qp-x" data-close title="Arrêter la présentation (Échap)">${I.x}</button></div>`;
    const err = live.err ? `<div class="qp-err">${esc(live.err)}</div>` : '';
    if (live.state === 'lobby') {
      ov.innerHTML = top(esc((dd && dd.titre) || 'Quiz')) + `<div class="qp-lobby">
        <div class="qp-join"><div class="qp-jtitle">Rejoignez le quiz</div><div class="qp-jurl">${JOIN_HOST}</div><div class="qp-jcode">${live.code}</div><div class="qp-jhint">Sur votre téléphone ou ordinateur : ouvrez ${JOIN_HOST}, entrez le code et un pseudo — ou scannez le QR code.</div></div>
        <div class="qp-qr">${qrSvg(joinUrl(live.code))}</div></div>
        <div id="qp-players" class="qp-players"></div>${err}
        <div class="qp-ctrl"><button type="button" class="qp-next" id="qp-start" data-next disabled>Commencer (${live.qs.length} question${live.qs.length > 1 ? 's' : ''}) →</button></div>
        <div class="qp-foot">Espace ou → : passer à la suite · Échap : arrêter</div>`;
      renderLivePlayers();
    } else if (live.state === 'q') {
      const q = liveQ(), pub = live.pub, n = live.players.size, a = answeredCount();
      ov.innerHTML = top(`Question ${live.i + 1} / ${live.qs.length}`, `<span id="qp-timer">${timerHTML(q.time ? (live.qEnd - Date.now()) / 1000 : 0, q.time)}</span><span id="qp-answered" class="qp-answered">${a} / ${n} réponse${a > 1 ? 's' : ''}</span>`) + `
        <div class="qp-q big">${esc(qText(q))}</div>
        <div class="qp-widget big">${q.t === 'text' ? '<div class="qp-device">Les participants tapent leur réponse sur leur appareil.</div>' : C.widgetHTML(pub, { done: true })}</div>${err}
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>Révéler la réponse →</button></div>`;
    } else if (live.state === 'reveal') {
      const q = liveQ(), st = live.stats || { n: 0 };
      const full = Object.assign({}, live.pub, { ans: q.ans, tol: q.tol, opts: q.t === 'order' ? q.opts : live.pub.opts, multi: q.multi });
      let statsHtml = '';
      if ((q.t === 'mcq' || q.t === 'poll') && st.counts) statsHtml = `<div class="qp-bars">${(live.pub.opts || []).map((o, i) => { const c = st.counts[o.id] || 0; const ok = q.t === 'mcq' && (q.ans || []).includes(o.id); return `<div class="qp-bar${ok ? ' ok' : ''}" style="--oc:${C.COLORS[i % C.COLORS.length]}"><span class="qp-bfill" style="height:${st.n ? Math.max(4, Math.round(c / st.n * 100)) : 4}%"></span><b>${c}</b><span class="qp-bsh">${C.SHAPES[i % C.SHAPES.length]}</span></div>`; }).join('')}</div>`;
      else if (q.t === 'tf' && st.counts) statsHtml = `<div class="qp-bars n2">${[['true', 'Vrai', '#26890c', '✓'], ['false', 'Faux', '#e21b3c', '✗']].map(([k, l, c, s]) => `<div class="qp-bar${String(q.ans) === k ? ' ok' : ''}" style="--oc:${c}"><span class="qp-bfill" style="height:${st.n ? Math.max(4, Math.round((st.counts[k] || 0) / st.n * 100)) : 4}%"></span><b>${st.counts[k] || 0}</b><span class="qp-bsh">${s}</span></div>`).join('')}</div>`;
      else if (q.t === 'order' && st.counts) statsHtml = `<div class="qp-stat">${st.counts.ok} bon ordre sur ${st.n}</div>`;
      else if (q.t === 'slider') statsHtml = `<div class="qp-stat">${st.ok || 0} dans la cible sur ${st.n}${st.mean !== null && st.mean !== undefined ? ` · moyenne ${Math.round(st.mean * 100) / 100}` : ''}</div>`;
      else if (q.t === 'text' && st.counts) statsHtml = `<div class="qp-stat">${st.ok || 0} bonne${st.ok > 1 ? 's' : ''} réponse${st.ok > 1 ? 's' : ''} sur ${st.n}</div><div class="qp-texts">${Object.entries(st.counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, c]) => `<span class="${C.check(q, t) ? 'ok' : ''}">${esc(t)} <b>${c}</b></span>`).join('')}</div>`;
      const last = live.i + 1 >= live.qs.length;
      ov.innerHTML = top(`Question ${live.i + 1} / ${live.qs.length} · réponse`) + `
        <div class="qp-reveal"><div class="qp-rleft"><div class="qp-q">${esc(qText(q))}</div><div class="qp-widget">${C.widgetHTML(full, { reveal: true, done: true })}</div>${statsHtml}</div>
        <div class="qp-rright"><div class="qp-ltitle">Classement</div><ol class="qp-lead">${(live.top || []).slice(0, 8).map(p => `<li><span>${esc(p.name)}</span><b>${fmtPts(p.score)}</b></li>`).join('') || '<li class="none">Personne n’a encore de points</li>'}</ol></div></div>${err}
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${last ? 'Terminer : classement final →' : 'Question suivante →'}</button></div>`;
    } else if (live.state === 'end') {
      const f = live.final || [];
      ov.innerHTML = top('Classement final') + `<div class="qp-end live">
        <div class="qp-podium">${[1, 0, 2].map(i => f[i] ? `<div class="qp-pod p${i + 1}"><div class="qp-pname">${esc(f[i].name)}</div><div class="qp-pbox"><span>${i + 1}</span><b>${fmtPts(f[i].score)}</b></div></div>` : `<div class="qp-pod p${i + 1} empty"></div>`).join('')}</div>
        <div class="qp-endlist">${f.slice(3).map(p => `<div class="qp-endrow"><span>${p.rank}</span><span class="qp-endq">${esc(p.name)}</span><span class="qp-endp">${fmtPts(p.score)}</span></div>`).join('')}</div>${err}
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>Fermer</button></div>
        <div class="qp-foot">${readOnly ? 'Quiz en lecture seule : le classement n’est pas enregistré.' : 'Classement enregistré (bouton Résultats).'}</div></div>`;
    }
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeLive));
    ov.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', liveNext));
  }

  /* ============================================================
     Résultats enregistrés
     ============================================================ */
  function openResults() {
    const dd = d(); if (!dd) return;
    const rs = resOf(dd).slice().sort((a, b) => b.at - a.at);
    const when = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const body = rs.length ? `<div class="qz-results">${rs.map(r => r.mode === 'live'
      ? `<div class="qz-res" data-res="${r.id}"><div class="qz-rhead"><b>En direct</b> · ${when(r.at)} · ${(r.players || []).length} participant${(r.players || []).length > 1 ? 's' : ''} · ${r.questions || r.n} question${(r.questions || r.n) > 1 ? 's' : ''}${readOnly ? '' : `<button type="button" class="qz-rdel" data-rdel title="Supprimer">${I.trash}</button>`}</div><ol class="qz-rlist">${(r.players || []).map(p => `<li><span>${esc(p.name)}</span><b>${fmtPts(p.score)}</b></li>`).join('')}</ol></div>`
      : `<div class="qz-res" data-res="${r.id}"><div class="qz-rhead"><b>Test</b> · ${when(r.at)} · <b>${fmtPts(r.score)} pts</b> · ${r.ok} / ${r.n} bonne${r.ok > 1 ? 's' : ''} réponse${r.ok > 1 ? 's' : ''}${readOnly ? '' : `<button type="button" class="qz-rdel" data-rdel title="Supprimer">${I.trash}</button>`}</div><div class="qz-rans">${qsOf(dd).map((q, i) => { const a = r.answers && r.answers[q.id]; if (!a) return ''; return `<span class="${q.t === 'poll' ? '' : a.ok ? 'ok' : 'ko'}" title="${esc(qText(q))}">${i + 1}. ${esc(C.answerText(q, a.v))}</span>`; }).join('')}</div></div>`).join('')}</div>`
      : `<div class="qz-lempty" style="padding:30px 10px; text-align:center">Aucun résultat pour l’instant : <b>Tester</b> joue le quiz sur cet appareil, <b>Présenter en direct</b> le fait jouer à un groupe. Les scores s’enregistrent ici.</div>`;
    openDialog({ id: 'qz-resdlg', cls: 'narrow', eyebrow: 'Quiz', title: 'Résultats', sub: esc(dd.titre || 'Sans titre'), body, onMount: card => {
      card.addEventListener('click', e => {
        const b = e.target.closest('[data-rdel]'); if (!b || readOnly) return;
        const box = b.closest('.qz-res'); const i = resOf(dd).findIndex(r => r.id === box.dataset.res); if (i < 0) return;
        resOf(dd).splice(i, 1); commit(); renderBar(); box.remove();
        if (!resOf(dd).length) closeDialog('qz-resdlg');
      });
    } });
  }

  /* ============================================================
     Export PDF : les questions, avec les bonnes réponses
     ============================================================ */
  function printHTML(dd) {
    const qs = qsOf(dd);
    return `<h2>${esc(dd.titre || 'Quiz')}</h2><div class="qzp-sub">${qs.length} question${qs.length > 1 ? 's' : ''} · les bonnes réponses sont marquées ✓</div>` + qs.map((q, i) => {
      let ans = '';
      if (q.t === 'mcq' || q.t === 'poll') ans = `<ol class="qzp-opts">${(q.opts || []).map((o, k) => `<li class="${q.t === 'mcq' && (q.ans || []).includes(o.id) ? 'ok' : ''}"><span class="qzp-sh">${C.SHAPES[k % C.SHAPES.length]}</span>${esc(o.text)}</li>`).join('')}</ol>`;
      else if (q.t === 'order') ans = `<ol class="qzp-opts order">${(q.opts || []).map(o => `<li class="ok">${esc(o.text)}</li>`).join('')}</ol>`;
      else ans = `<div class="qzp-ans">Réponse : <b>${esc(C.correctText(q))}</b>${q.t === 'slider' ? ` <small>(échelle ${esc(q.min)} – ${esc(q.max)})</small>` : ''}</div>`;
      return `<div class="qzp-q"><div class="qzp-qh"><span class="qzp-n">${i + 1}</span><span class="qzp-t">${esc(qText(q))}</span><span class="qzp-meta">${C.TYPES[q.t] ? esc(C.TYPES[q.t].name) : ''}${q.time ? ` · ${q.time} s` : ''}${q.t === 'poll' ? '' : ` · ${fmtPts(q.points)} pts`}</span></div>${ans}</div>`;
    }).join('');
  }
  let pdfBusy = false;
  async function exportPDF() {
    if (pdfBusy) return;
    const dd = d(); if (!dd || !active()) return;
    const box = $('#qz-print'); if (!box) return;
    box.innerHTML = printHTML(dd);
    const title = dd.titre || 'Quiz';
    document.title = title + ' — Alixo';
    document.body.classList.add('printing-quiz');
    const desk = window.alixoDesktop;
    const done = () => { document.body.classList.remove('printing-quiz'); if (typeof exportWatermark === 'function') exportWatermark(false); box.innerHTML = ''; document.title = 'Alixo — Cockpit d’amphi'; };
    if (!desk || !desk.printToPDF || !desk.saveFile) { if (typeof exportWatermark === 'function') exportWatermark(true); try { print(); } finally { done(); } return; }
    pdfBusy = true;
    toast('Préparation du PDF…', { duration: 4000 });
    let pdf = null, err = null;
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (typeof exportWatermark === 'function') exportWatermark(true);
      pdf = await desk.printToPDF({ title });
    } catch (e) { err = e; }
    done(); pdfBusy = false;
    if (!pdf || err) { console.error(err); toast('Export PDF impossible' + (err && err.message ? ' : ' + err.message : '')); return; }
    const r = await desk.saveFile({ name: safeFileName(title) + '.pdf', data: pdf, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r && r.ok) toast(`PDF enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
    else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
  }

  /* ---------------- aperçu pour la bibliothèque, recherche ---------------- */
  function preview(dd) {
    const qs = Array.isArray(dd && dd.questions) ? dd.questions : [];
    if (!qs.length) return '<span class="sp-empty">Quiz vide</span>';
    return `<div class="qzprev">${qs.slice(0, 4).map((q, i) => `<div class="qzprev-q"><span class="qzprev-n">${i + 1}</span><span>${esc((q.text || '').trim() || (C.TYPES[q.t] ? C.TYPES[q.t].name : '…'))}</span></div>`).join('')}${qs.length > 4 ? `<div class="qzprev-more">+ ${qs.length - 4} autre${qs.length - 4 > 1 ? 's' : ''}</div>` : ''}</div>`;
  }
  const count = dd => (Array.isArray(dd && dd.questions) ? dd.questions.length : 0);
  function search(dd, needle, max) {
    const want = String(needle || '').toLowerCase(); if (!want) return [];
    const out = [];
    for (const q of (Array.isArray(dd && dd.questions) ? dd.questions : [])) {
      const text = [q.text || '', ...(q.opts || []).map(o => o.text || ''), ...(q.t === 'text' && Array.isArray(q.ans) ? q.ans : [])].join(' · ');
      const i = text.toLowerCase().indexOf(want); if (i < 0) continue;
      const start = Math.max(0, i - 30);
      out.push({ itemId: q.id, text: (start > 0 ? '…' : '') + text.slice(start, i + want.length + 60).replace(/\s+/g, ' ') });
      if (out.length >= (max || 12)) break;
    }
    return out;
  }
  function reveal(qid) {
    const dd = d(); if (!dd || !active()) return;
    if (!qsOf(dd).some(q => q.id === qid)) return;
    cur = qid; renderList(); renderEdit();
    const c = $(`#qz-list .qz-card[data-q="${qid}"]`); if (c) { c.scrollIntoView({ block: 'nearest' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1500); }
  }

  return { newDoc, open, leave, remoteChanged, undo, redo, exportPDF, preview, count, search, reveal, startTest, startLive, openResults, isLive: () => !!live };
})();
