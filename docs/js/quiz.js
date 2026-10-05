/* ============================================================
   Alixo — quiz (1.24, refonte 1.25)
   Un quiz est une séance particulière : { kind: 'quiz', questions: [...], results: [...], theme, music }
   (d.blocks reste vide : synchronisation, onglets, bibliothèque, corbeille et partage n'ont rien
   de nouveau à connaître). Types de questions, thèmes et règles de points : js/quizcore.js (partagé avec
   la page des participants quiz.html) ; musiques et sons : js/quizfx.js.

   Trois usages :
   - l'ÉDITEUR (#view-quiz) : palette de types à glisser dans la liste (ou clic) — questions notées, avis du
     public, pages sans question — ; questions réordonnables, image par question, réponses saisies par objets ;
     bouton « Apparence » : thème (ou couleurs personnalisées), musique de fond, sons ;
   - le TEST (overlay #qz-play, mode « test ») : on joue le quiz sur cet appareil ;
   - la PRÉSENTATION EN DIRECT (mode « live ») : l'écran du présentateur affiche un code à 6 chiffres et un
     QR code ; les participants ouvrent alixoapp.com/quiz sur leur téléphone et répondent à chaque question.
     Firestore : live/{code} (état, thème, question en cours — sans la réponse — puis réponse révélée,
     statistiques, classement) et live/{code}/players/{pid}. Voir firestore.rules (bloc « Quiz en direct »).
     À la fin, le classement et les statistiques (par question, par participant) sont enregistrés dans d.results.

   Chargé APRÈS app.js : utilise ses globales (state, doc(), save(), openTabs, renderTabs,
   renderCrumbs, toast, esc, uid, folderTint, openDialog, confirmDialog, exportWatermark, AlixoImages, fileToImage…).
   ============================================================ */
'use strict';

window.AlixoQuiz = (() => {
  const C = window.QuizCore;
  const FX = () => window.AlixoQuizFx || null;
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
    look: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor"/><path d="M12 21c-1.5-2-1-4 .5-4.5 2-.5 3.5-2 2.5-4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 9"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10Z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>',
    csv: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>'
  };

  /* ---------------- état ---------------- */
  const d = () => (typeof doc === 'function' ? doc() : null);
  const qsOf = dd => (Array.isArray(dd && dd.questions) ? dd.questions : (dd ? (dd.questions = []) : []));
  const resOf = dd => (Array.isArray(dd && dd.results) ? dd.results : (dd ? (dd.results = []) : []));
  const themeOf = dd => (dd && dd.theme && typeof dd.theme === 'object' ? dd.theme : { k: 'alixo' });
  const musicOf = dd => (dd && dd.music && typeof dd.music === 'object' ? dd.music : { k: 'none', vol: 0.5, sfx: true });
  const active = () => document.body.classList.contains('mode-quiz');
  let cur = null;                    // question affichée dans l'éditeur
  let hist = { undo: [], redo: [] };
  let readOnly = false, bound = false, saveTm = null, remoteTm = null;
  let dragQ = null, dragType = null; // glisser-déposer : question déplacée / type depuis la palette
  let test = null;                   // { i, score, ok, answers, timer, shownAt, done }
  let live = null;                   // session en direct (hôte) — voir startLive
  const curQ = () => { const dd = d(); if (!dd) return null; return qsOf(dd).find(q => q.id === cur) || null; };
  const qText = q => (q.text || '').trim() || (q.t === 'info' ? 'Page sans titre' : 'Question sans texte');
  const playable = q => (q.text || '').trim() || (q.opts || []).some(o => o.text) || (q.pairs || []).some(p => p.l || p.r) || (q.t === 'info' && ((q.body || '').trim() || q.img));
  const fmtPts = n => (n || 0).toLocaleString('fr-FR');
  const fmtSec = ms => (ms == null ? '—' : (Math.round(ms / 100) / 10).toLocaleString('fr-FR') + ' s');

  function newDoc(fid, prof) {
    return { id: uid(), kind: 'quiz', folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: prof || '', blocks: [], questions: [C.newQuestion('mcq')], results: [], theme: { k: 'alixo' }, music: { k: 'none', vol: 0.5, sfx: true } };
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
    const th = C.resolveTheme(themeOf(dd));
    const info = readOnly && window.AlixoShare && AlixoShare.infoFor ? AlixoShare.infoFor(dd.id) : null;
    bar.innerHTML = `<div class="bd-barl">
      ${readOnly ? `<span class="bd-barlabel">Quiz</span><span class="bd-ro">Partagé par <b>${esc(info ? info.owner : 'un membre')}</b> · lecture seule</span>` : `
      <button data-qz="undo" title="Annuler (Ctrl+Z)" ${hist.undo.length ? '' : 'disabled'}>${I.undo}</button>
      <button data-qz="redo" title="Rétablir (Ctrl+Y)" ${hist.redo.length ? '' : 'disabled'}>${I.redo}</button>
      <span class="bd-sep"></span>
      <span class="bd-barlabel">Quiz</span><span class="qz-count">${n} élément${n > 1 ? 's' : ''}</span>`}
    </div>
    <div class="bd-barr">
      ${readOnly ? '' : `<button data-qz="look" title="Apparence : thème ou couleurs personnalisées, musique de fond, sons"><span class="qz-swatch" style="background:${th.bg};border-color:${th.accent}"><i style="background:${th.accent}"></i></span><span class="bd-lbl">Apparence</span></button><span class="bd-sep"></span>`}
      <button data-qz="test" class="qz-primary" title="Jouer le quiz sur cet appareil (F5) : chronomètre, points, résultat enregistré">${I.play}<span class="bd-lbl">Tester</span></button>
      <button data-qz="live" class="qz-live" title="Présenter en direct : code et QR code à l'écran, les participants répondent sur leur téléphone (alixoapp.com/quiz)">${I.cast}<span class="bd-lbl">Présenter en direct</span></button>
      <button data-qz="results" title="Résultats enregistrés : scores, statistiques par question et par participant, export CSV">${I.chart}<span class="bd-lbl">Résultats${nr ? ` (${nr})` : ''}</span></button>
      <span class="bd-sep"></span>
      <button data-qz="pdf" title="Exporter en PDF (Ctrl+P) : les questions, avec les réponses">PDF</button>
    </div>`;
  }
  function renderPalette() {
    const el = $('#qz-palette'); if (!el) return;
    if (readOnly) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="qz-ptitle">Ajouter</div><div class="qz-phint">Glissez un type dans la liste, ou cliquez : il s’ajoute après l’élément ouvert.</div>
      ${C.GROUPS.map(([g, name]) => `<div class="qz-pgroup">${esc(name)}</div>` + Object.entries(C.TYPES).filter(([, t]) => t.grp === g).map(([k, t]) => `<div class="qz-ptype" draggable="true" data-type="${k}" title="${esc(t.sub)}"><span class="qz-pico">${t.ico}</span><span><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span></div>`).join('')).join('')}`;
  }
  function renderList() {
    const el = $('#qz-list'); const dd = d(); if (!el || !dd) return;
    const qs = qsOf(dd);
    let qi = 0;
    el.innerHTML = `<div class="qz-ltitle">Déroulé</div>` + (qs.length ? qs.map((q) => { const page = q.t === 'info'; if (!page) qi++; return `<div class="qz-card${q.id === cur ? ' cur' : ''}${page ? ' page' : ''}" data-q="${q.id}" ${readOnly ? '' : 'draggable="true"'}>
        <span class="qz-cnum">${page ? '▭' : qi}</span>
        <span class="qz-cbody"><span class="qz-ctype">${C.TYPES[q.t] ? C.TYPES[q.t].ico + ' ' + C.TYPES[q.t].name : q.t}${q.img ? ' · 🖼' : ''}</span><span class="qz-ctext">${esc(qText(q))}</span></span>
        ${readOnly ? '' : `<span class="qz-cact"><button type="button" data-cdup title="Dupliquer">${I.dup}</button><button type="button" data-cdel title="Supprimer">${I.trash}</button></span>`}
      </div>`; }).join('') : `<div class="qz-lempty">Aucune question. ${readOnly ? '' : 'Glissez un type depuis la palette, ou cliquez dessus.'}</div>`)
      + (readOnly ? '' : `<div class="qz-ldrop" data-drop-end>${qs.length ? 'Déposer ici pour ajouter à la fin' : ''}</div>`);
  }
  function optRow(q, op, i) {
    const col = `var(--qp-c${i % 6})`, sh = C.letter(i);
    const isAns = q.t === 'mcq' && Array.isArray(q.ans) && q.ans.includes(op.id);
    return `<div class="qz-opt${isAns ? ' ok' : ''}" data-opt="${op.id}" style="--oc:${col}">
      ${q.t === 'order' ? `<span class="qz-onum">${i + 1}</span>` : `<span class="qz-oshape">${sh}</span>`}
      <input class="qz-otext" value="${esc(op.text)}" placeholder="${q.t === 'order' ? `Élément ${i + 1}` : `Proposition ${sh}`}" maxlength="120" ${readOnly ? 'disabled' : ''}>
      ${q.t === 'mcq' ? `<button type="button" class="qz-ook" data-ook title="${isAns ? 'Bonne réponse (cliquer pour retirer)' : 'Marquer comme bonne réponse'}" ${readOnly ? 'disabled' : ''}>✓</button>` : ''}
      ${q.t === 'order' ? `<span class="qz-omv"><button type="button" data-omv="-1" title="Monter" ${i === 0 || readOnly ? 'disabled' : ''}>▲</button><button type="button" data-omv="1" title="Descendre" ${i === q.opts.length - 1 || readOnly ? 'disabled' : ''}>▼</button></span>` : ''}
      <button type="button" class="qz-odel" data-odel title="Retirer" ${q.opts.length <= 2 || readOnly ? 'disabled' : ''}>${I.x}</button>
    </div>`;
  }
  function imgBox(q) {
    if (readOnly && !q.img) return '';
    return `<div class="qz-img${q.img ? ' has' : ''}" id="qz-img">${q.img ? `<img alt="" data-iid="${esc(q.img)}">` : ''}${readOnly ? '' : `<span class="qz-imgbtns"><button type="button" class="cta ghost small" data-img>${I.image} ${q.img ? 'Changer l’image' : 'Ajouter une image'}</button>${q.img ? `<button type="button" class="cta ghost small" data-imgdel>Retirer</button>` : ''}</span>`}</div>`;
  }
  function renderEdit() {
    const el = $('#qz-edit'); const dd = d(); if (!el || !dd) return;
    const q = curQ();
    if (!q) { el.innerHTML = `<div class="qz-eempty"><div class="qz-eico">?</div><p>${qsOf(dd).length ? 'Choisissez un élément dans la liste.' : 'Ce quiz est vide : ajoutez une première question depuis la palette.'}</p></div>`; return; }
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
    } else if (q.t === 'match') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : (q.pairs = []);
      body = `<div class="qz-label">Paires à relier (les correspondances de droite sont mélangées chez les participants)</div>
        <div class="qz-opts" id="qz-opts">${pairs.map((p, i) => `<div class="qz-opt qz-pair" data-pair="${p.id}" style="--oc:var(--qp-c${i % 6})"><span class="qz-oshape">${C.letter(i)}</span><input class="qz-otext" data-pf="l" value="${esc(p.l || '')}" placeholder="Élément ${C.letter(i)}" maxlength="80" ${dis}><span class="qz-marr">→</span><input class="qz-otext" data-pf="r" value="${esc(p.r || '')}" placeholder="Correspondance" maxlength="80" ${dis}><button type="button" class="qz-odel" data-pdel title="Retirer" ${pairs.length <= 2 || readOnly ? 'disabled' : ''}>${I.x}</button></div>`).join('')}</div>
        <div class="po-row" style="margin-top:8px"><button type="button" class="cta ghost small" data-padd ${pairs.length >= MAX_OPTS || readOnly ? 'disabled' : ''}>＋ Paire</button></div>`;
    } else if (q.t === 'tf') {
      body = `<div class="qz-label">Bonne réponse</div><div class="qz-tf">
        <button type="button" class="qz-tfbtn${q.ans ? ' on' : ''}" data-tf="1" style="--oc:var(--qp-c2)" ${dis}>✓ Vrai</button>
        <button type="button" class="qz-tfbtn${!q.ans ? ' on' : ''}" data-tf="0" style="--oc:var(--qp-c1)" ${dis}>✗ Faux</button></div>`;
    } else if (q.t === 'numeric') {
      body = `<div class="qz-label">Bonne réponse</div><div class="qz-grid">
        <label>Nombre attendu <input type="number" data-f="ans" value="${esc(q.ans)}" step="any" ${dis}></label>
        <label>Tolérance ± <input type="number" data-f="tol" value="${esc(q.tol || 0)}" min="0" step="any" ${dis}></label>
        <label>Unité (affichée) <input type="text" data-f="unit" value="${esc(q.unit || '')}" placeholder="€, %, ans…" maxlength="12" ${dis}></label></div>
        <div class="qz-hint">Les participants tapent un nombre ; la virgule et le point sont acceptés.</div>`;
    } else if (q.t === 'slider') {
      body = `<div class="qz-label">Échelle et bonne réponse</div><div class="qz-grid">
        <label>Minimum <input type="number" data-f="min" value="${esc(q.min)}" ${dis}></label>
        <label>Maximum <input type="number" data-f="max" value="${esc(q.max)}" ${dis}></label>
        <label>Pas <input type="number" data-f="step" value="${esc(q.step)}" min="0.001" step="any" ${dis}></label>
        <label>Bonne réponse <input type="number" data-f="ans" value="${esc(q.ans)}" step="any" ${dis}></label>
        <label>Tolérance ± <input type="number" data-f="tol" value="${esc(q.tol || 0)}" min="0" step="any" ${dis}></label></div>
        <div class="qz-sprev qz-play-scope" style="${C.themeStyle(themeOf(dd))}">${C.widgetHTML({ t: 'slider', min: q.min, max: q.max, step: q.step }, { done: true })}</div>`;
    } else if (q.t === 'scale') {
      body = `<div class="qz-label">Échelle (sans bonne réponse)</div><div class="qz-grid">
        <label>De <input type="number" data-f="min" value="${esc(q.min)}" min="0" max="9" ${dis}></label>
        <label>À <input type="number" data-f="max" value="${esc(q.max)}" min="2" max="10" ${dis}></label>
        <label>Libellé à gauche <input type="text" data-f="lo" value="${esc(q.lo || '')}" placeholder="Pas du tout" maxlength="30" ${dis}></label>
        <label>Libellé à droite <input type="text" data-f="hi" value="${esc(q.hi || '')}" placeholder="Tout à fait" maxlength="30" ${dis}></label></div>
        <div class="qz-sprev qz-play-scope" style="${C.themeStyle(themeOf(dd))}">${C.widgetHTML({ t: 'scale', min: q.min, max: q.max, lo: q.lo, hi: q.hi }, { done: true })}</div>`;
    } else if (q.t === 'text') {
      const list = Array.isArray(q.ans) ? q.ans : [];
      body = `<div class="qz-label">Réponses acceptées (majuscules, accents et espaces sont ignorés)</div>
        <div class="qz-opts" id="qz-opts">${(list.length ? list : ['']).map((a, i) => `<div class="qz-opt ok" data-ans="${i}" style="--oc:var(--ok)"><span class="qz-oshape">✓</span><input class="qz-otext" value="${esc(a)}" placeholder="Réponse ${i + 1}" maxlength="80" ${dis}><button type="button" class="qz-odel" data-adel title="Retirer" ${list.length <= 1 || readOnly ? 'disabled' : ''}>${I.x}</button></div>`).join('')}</div>
        <div class="po-row" style="margin-top:8px"><button type="button" class="cta ghost small" data-aadd ${list.length >= 8 || readOnly ? 'disabled' : ''}>＋ Variante acceptée</button></div>`;
    } else if (q.t === 'open') {
      body = `<div class="qz-hint" style="margin-top:14px">Chaque participant envoie un mot ou une courte idée ; l’écran du présentateur affiche le nuage de mots (les réponses identiques grossissent). Sans points.</div>`;
    } else if (q.t === 'info') {
      body = `<div class="qz-label">Texte de la page</div><textarea class="qz-body" data-f="body" placeholder="Quelques lignes : consigne, rappel de cours, transition, pause…" rows="6" maxlength="2000" ${dis}>${esc(q.body || '')}</textarea>
        <div class="qz-hint">Une page ne pose pas de question : elle s’affiche sur l’écran du présentateur (et sur les téléphones) jusqu’à ce que vous passiez à la suite.</div>`;
    }
    el.innerHTML = `<div class="qz-ehead">
        <span class="qz-etype" title="${esc(t.sub || '')}">${t.ico} ${esc(t.name)}</span>
        <span class="qz-espacer"></span>
        ${q.t === 'info' ? '' : `<label class="set-inline">Temps <select data-f="time" ${dis}>${TIMES.map(([v, l]) => `<option value="${v}" ${+q.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
        ${C.isScored(q) ? `<label class="set-inline">Points <select data-f="points" ${dis}>${POINTS.map(([v, l]) => `<option value="${v}" ${+q.points === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      </div>
      <textarea class="qz-qtext" data-f="text" placeholder="${q.t === 'tf' ? 'Affirmation à juger…' : q.t === 'info' ? 'Titre de la page…' : q.t === 'poll' || q.t === 'scale' || q.t === 'open' ? 'Question posée au public…' : 'Question…'}" rows="2" maxlength="400" ${dis}>${esc(q.text || '')}</textarea>
      ${imgBox(q)}
      ${body}
      ${C.isScored(q) ? '<div class="qz-hint">Points : la moitié pour la bonne réponse, l’autre moitié fond avec le temps écoulé (réponse immédiate = tous les points).</div>' : ''}`;
    const im = el.querySelector('#qz-img img');
    if (im) AlixoImages.get(im.dataset.iid).then(v => { if (v && im.isConnected) im.src = v; });
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
    if (Array.isArray(c.pairs)) for (const p of c.pairs) p.id = C.uid();
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
  async function setImage(file) {
    const q = curQ(); if (!q || readOnly || !file || !/^image\//.test(file.type)) return;
    try {
      const im = await fileToImage(file);
      const iid = uid(); await AlixoImages.put(iid, im.data);
      patch(x => { x.img = iid; }, true);
    } catch (e) { console.error(e); toast('Image illisible'); }
  }
  /* image réduite (≤ 720 px, JPEG) pour l'envoi aux participants — la fiche live/{code} doit rester sous 1 Mio */
  async function smallImage(iid) {
    const src = await AlixoImages.get(iid); if (!src) return '';
    return new Promise(res => {
      const im = new Image();
      im.onload = () => { try { const k = Math.min(1, 720 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); } catch { res(''); } };
      im.onerror = () => res('');
      im.src = src;
    });
  }

  /* ---------------- apparence : thème, musique, sons ---------------- */
  function openAppearance() {
    const dd = d(); if (!dd || readOnly) return;
    const th = themeOf(dd), mu = musicOf(dd);
    const fx = FX();
    const custom = Object.assign({ bg: '#f6f7f9', surface: '#ffffff', ink: '#202124', accent: '#33658a' }, th.k === 'custom' ? th : {});
    const tiles = Object.entries(C.THEMES).map(([k, t]) => `<button type="button" class="set-tile qz-tile ${th.k === k ? 'on' : ''}" data-theme="${k}"><span class="qz-tprev" style="background:${t.bg};border-color:${t.accent}"><i style="background:${t.surface};border-color:${C.resolveTheme({ k }).border}"><em style="background:${t.accent}"></em><em style="background:${C.resolveTheme({ k }).pal[0]}"></em></i></span><b>${esc(t.name)}</b><span>${esc(t.sub)}</span></button>`).join('')
      + `<button type="button" class="set-tile qz-tile ${th.k === 'custom' ? 'on' : ''}" data-theme="custom"><span class="qz-tprev" style="background:${esc(custom.bg)};border-color:${esc(custom.accent)}"><i style="background:${esc(custom.surface)}"><em style="background:${esc(custom.accent)}"></em></i></span><b>Personnalisé</b><span>Vos couleurs</span></button>`;
    const body = `<div class="qz-look">
      <div class="set-sect"><h3>Thème</h3><div class="set-tiles qz-tiles">${tiles}</div>
        <div class="qz-custom" id="qz-custom" ${th.k === 'custom' ? '' : 'hidden'}>
          <label>Fond <input type="color" data-c="bg" value="${esc(custom.bg)}"></label>
          <label>Cartes <input type="color" data-c="surface" value="${esc(custom.surface)}"></label>
          <label>Texte <input type="color" data-c="ink" value="${esc(custom.ink)}"></label>
          <label>Accent <input type="color" data-c="accent" value="${esc(custom.accent)}"></label>
        </div>
        <label class="set-inline" style="margin-top:10px">Police <select id="qz-font"><option value="sans" ${(th.font || 'sans') === 'sans' ? 'selected' : ''}>Sans-serif (Alixo)</option><option value="serif" ${th.font === 'serif' ? 'selected' : ''}>Serif</option><option value="rounded" ${th.font === 'rounded' ? 'selected' : ''}>Arrondie</option><option value="mono" ${th.font === 'mono' ? 'selected' : ''}>Monospace</option></select></label>
        <div class="qz-lprev qz-play-scope" id="qz-lprev" style="${C.themeStyle(th)}"><div class="qp-q" style="font-size:20px;margin:6px 0 10px">Aperçu : quelle est la capitale de l’Australie ?</div>${C.widgetHTML({ t: 'mcq', opts: [{ id: 'a', text: 'Sydney' }, { id: 'b', text: 'Canberra' }, { id: 'c', text: 'Melbourne' }, { id: 'd', text: 'Perth' }], ans: ['b'] }, { reveal: true, v: ['a'], done: true })}</div>
      </div>
      <div class="set-sect"><h3>Musique de fond</h3><p class="set-help">Jouée sur l’écran du présentateur (et pendant un test), pas sur les téléphones. Les musiques de base sont générées par Alixo : rien à télécharger.</p>
        <div class="qz-tracks">${Object.entries(fx ? fx.TRACKS : {}).map(([k, t]) => `<label class="qz-track ${mu.k === k ? 'on' : ''}"><input type="radio" name="qz-music" value="${k}" ${mu.k === k ? 'checked' : ''}><span class="qz-trk"><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></span>${k !== 'none' && k !== 'file' ? `<button type="button" class="qz-tplay" data-prev="${k}" title="Écouter quelques secondes">▶</button>` : ''}${k === 'file' ? `<span class="qz-tfile"><input type="file" id="qz-mfile" accept="audio/*" hidden><button type="button" class="cta ghost small" data-mfile>Choisir…</button><small id="qz-mname">${esc(mu.name || 'Aucun fichier')}</small></span>` : ''}</label>`).join('')}</div>
        <label class="set-inline" style="margin-top:10px">Volume <input type="range" id="qz-vol" min="0" max="1" step="0.05" value="${esc(mu.vol == null ? 0.5 : mu.vol)}" style="width:160px"></label>
        <label class="set-inline" style="margin-top:6px"><input type="checkbox" id="qz-sfx" ${mu.sfx === false ? '' : 'checked'}> Sons : dernières secondes, révélation, bonne / mauvaise réponse, arrivée d’un participant</label>
      </div></div>`;
    openDialog({ id: 'qz-look', cls: 'wide', eyebrow: 'Quiz', title: 'Apparence', sub: 'Le thème s’applique à l’écran du présentateur, au test et aux téléphones des participants.', body, onClose: () => { if (fx) fx.stop(); }, onMount: card => {
      const prev = card.querySelector('#qz-lprev');
      const saveTheme = () => { commit(); renderBar(); prev.style.cssText = C.themeStyle(themeOf(dd)); };
      card.addEventListener('click', e => {
        const t = e.target.closest('[data-theme]');
        if (t) {
          const k = t.dataset.theme;
          card.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b === t));
          card.querySelector('#qz-custom').hidden = k !== 'custom';
          const font = card.querySelector('#qz-font').value;
          dd.theme = k === 'custom' ? Object.assign({ k: 'custom', font }, custom, { k: 'custom' }) : { k, font };
          saveTheme(); return;
        }
        const p = e.target.closest('[data-prev]'); if (p && fx) { fx.setVolume(+card.querySelector('#qz-vol').value); fx.preview(p.dataset.prev, dd.id); return; }
        if (e.target.closest('[data-mfile]')) { card.querySelector('#qz-mfile').click(); }
      });
      card.querySelectorAll('[data-c]').forEach(inp => inp.addEventListener('input', () => { custom[inp.dataset.c] = inp.value; dd.theme = Object.assign({}, custom, { k: 'custom', font: card.querySelector('#qz-font').value }); const tile = card.querySelector('[data-theme="custom"] .qz-tprev'); if (tile) { tile.style.background = custom.bg; tile.style.borderColor = custom.accent; tile.querySelector('i').style.background = custom.surface; tile.querySelector('em').style.background = custom.accent; } saveTheme(); }));
      card.querySelector('#qz-font').addEventListener('change', e => { dd.theme = Object.assign({}, themeOf(dd), { font: e.target.value }); saveTheme(); });
      card.querySelectorAll('input[name="qz-music"]').forEach(r => r.addEventListener('change', () => { card.querySelectorAll('.qz-track').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); dd.music = Object.assign({}, musicOf(dd), { k: r.value }); commit(); if (fx) { if (r.value === 'none') fx.stop(); else fx.preview(r.value, dd.id); } }));
      card.querySelector('#qz-vol').addEventListener('input', e => { dd.music = Object.assign({}, musicOf(dd), { vol: +e.target.value }); if (fx) fx.setVolume(+e.target.value); commitSoon(); });
      card.querySelector('#qz-sfx').addEventListener('change', e => { dd.music = Object.assign({}, musicOf(dd), { sfx: e.target.checked }); commit(); if (fx && e.target.checked) fx.sfx('reveal'); });
      const mf = card.querySelector('#qz-mfile');
      if (mf) mf.addEventListener('change', async () => {
        const f = mf.files && mf.files[0]; if (!f || !fx) return;
        if (f.size > 25 * 1024 * 1024) { toast('Fichier trop lourd (25 Mo maximum)'); return; }
        try { await fx.storeFile(dd.id, f); dd.music = Object.assign({}, musicOf(dd), { k: 'file', name: f.name }); commit(); card.querySelector('#qz-mname').textContent = f.name; const r = card.querySelector('input[name="qz-music"][value="file"]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change')); } }
        catch (e) { console.error(e); toast('Fichier audio non enregistré'); }
      });
    } });
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
      else if (a === 'results') openResults(); else if (a === 'pdf') exportPDF(); else if (a === 'look') openAppearance();
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
      if (f === 'body' || f === 'unit' || f === 'lo' || f === 'hi') { patch(q => { q[f] = e.target.value; }); return; }
      if (e.target.classList.contains('qz-otext')) {
        const row = e.target.closest('.qz-opt');
        if (row.dataset.pair) patch(q => { const p = (q.pairs || []).find(x => x.id === row.dataset.pair); if (p) p[e.target.dataset.pf] = e.target.value; });
        else if (row.dataset.ans !== undefined) patch(q => { if (!Array.isArray(q.ans)) q.ans = []; q.ans[+row.dataset.ans] = e.target.value; });
        else patch(q => { const op = (q.opts || []).find(o => o.id === row.dataset.opt); if (op) op.text = e.target.value; });
        return;
      }
      if (['min', 'max', 'step', 'ans', 'tol'].includes(f)) {
        patch(q => { const v = parseFloat(e.target.value); if (!isNaN(v)) q[f] = v; });
        const pv = ed.querySelector('.qz-sprev'); const q = curQ();
        if (pv && q) pv.innerHTML = q.t === 'scale' ? C.widgetHTML({ t: 'scale', min: q.min, max: q.max, lo: q.lo, hi: q.hi }, { done: true }) : C.widgetHTML({ t: 'slider', min: q.min, max: q.max, step: q.step }, { done: true });
      }
    });
    ed.addEventListener('change', e => {
      const f = e.target.dataset.f;
      if (f === 'time' || f === 'points') { patch(q => { q[f] = +e.target.value; }, true); return; }
      if (e.target.matches('[data-multi]')) { patch(q => { q.multi = e.target.checked; if (!q.multi && Array.isArray(q.ans) && q.ans.length > 1) q.ans = q.ans.slice(0, 1); }, true); return; }
      if (e.target.matches('#qz-imgfile')) { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) setImage(file); return; }
      if (f === 'text' || f === 'body' || e.target.classList.contains('qz-otext') || ['min', 'max', 'step', 'ans', 'tol', 'unit', 'lo', 'hi'].includes(f)) pushHist();   // un point d'annulation par champ modifié
    });
    ed.addEventListener('click', e => {
      if (readOnly) return;
      if (e.target.closest('[data-img]')) { let inp = $('#qz-imgfile'); if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'qz-imgfile'; inp.hidden = true; ed.appendChild(inp); } inp.value = ''; inp.click(); return; }
      if (e.target.closest('[data-imgdel]')) { patch(q => { delete q.img; }, true); return; }
      if (e.target.closest('[data-oadd]')) { patch(q => { if ((q.opts || []).length < MAX_OPTS) q.opts.push({ id: C.uid(), text: '' }); }, true); const rows = ed.querySelectorAll('.qz-opt .qz-otext'); if (rows.length) rows[rows.length - 1].focus(); return; }
      if (e.target.closest('[data-padd]')) { patch(q => { if (!Array.isArray(q.pairs)) q.pairs = []; if (q.pairs.length < MAX_OPTS) q.pairs.push({ id: C.uid(), l: '', r: '' }); }, true); const rows = ed.querySelectorAll('.qz-pair [data-pf="l"]'); if (rows.length) rows[rows.length - 1].focus(); return; }
      if (e.target.closest('[data-aadd]')) { patch(q => { if (!Array.isArray(q.ans)) q.ans = []; if (q.ans.length < 8) q.ans.push(''); }, true); const rows = ed.querySelectorAll('.qz-opt .qz-otext'); if (rows.length) rows[rows.length - 1].focus(); return; }
      const tf = e.target.closest('[data-tf]'); if (tf) { patch(q => { q.ans = tf.dataset.tf === '1'; }, true); return; }
      const row = e.target.closest('.qz-opt'); if (!row) return;
      if (e.target.closest('[data-pdel]')) { patch(q => { if ((q.pairs || []).length <= 2) return; q.pairs = q.pairs.filter(p => p.id !== row.dataset.pair); }, true); return; }
      if (e.target.closest('[data-ook]')) { patch(q => { if (!Array.isArray(q.ans)) q.ans = []; const id = row.dataset.opt; if (q.ans.includes(id)) q.ans = q.ans.filter(x => x !== id); else q.ans = q.multi ? [...q.ans, id] : [id]; }, true); return; }
      if (e.target.closest('[data-odel]')) { patch(q => { if (q.opts.length <= 2) return; q.opts = q.opts.filter(o => o.id !== row.dataset.opt); if (Array.isArray(q.ans) && q.t === 'mcq') q.ans = q.ans.filter(a => a !== row.dataset.opt); }, true); return; }
      if (e.target.closest('[data-adel]')) { patch(q => { if (!Array.isArray(q.ans) || q.ans.length <= 1) return; q.ans.splice(+row.dataset.ans, 1); }, true); return; }
      const mv = e.target.closest('[data-omv]'); if (mv) { patch(q => { const i = q.opts.findIndex(o => o.id === row.dataset.opt); const j = i + (+mv.dataset.omv); if (i < 0 || j < 0 || j >= q.opts.length) return; [q.opts[i], q.opts[j]] = [q.opts[j], q.opts[i]]; }, true); }
    });
    ed.addEventListener('dragover', e => { if (readOnly) return; if ([...(e.dataTransfer.items || [])].some(x => x.kind === 'file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    ed.addEventListener('drop', e => { if (readOnly) return; const f = [...(e.dataTransfer.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); setImage(f); } });
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
    const dd = d();
    const ov = play(); ov.hidden = false; ov.className = 'qz-play ' + cls; ov.innerHTML = '';
    ov.style.cssText = C.themeStyle(themeOf(dd));
    document.body.classList.add('qz-playing');
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement && cls === 'qz-live') document.documentElement.requestFullscreen().catch(() => {}); } catch { /* */ }
    const fx = FX(); const mu = musicOf(dd);
    if (fx) { fx.setVolume(mu.vol == null ? 0.5 : mu.vol); if (mu.k && mu.k !== 'none') fx.play(mu.k, dd.id); }
    if (!ov.dataset.bound) {
      ov.dataset.bound = '1';
      document.addEventListener('keydown', e => {
        if (play().hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); if (live) closeLive(); else closeTest(); return; }
        if (e.target.matches('input, textarea, select')) return;
        if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleSound(); return; }
        if (live && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter')) { e.preventDefault(); liveNext(); return; }
        if (test && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter')) { const b = play().querySelector('[data-next]'); if (b) { e.preventDefault(); b.click(); } }
      });
    }
  }
  function closePlay() {
    const ov = play(); ov.hidden = true; ov.innerHTML = ''; ov.className = 'qz-play'; ov.style.cssText = '';
    document.body.classList.remove('qz-playing');
    const fx = FX(); if (fx) fx.stop();
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* */ }
  }
  const sfxOn = () => { const fx = FX(); return fx && musicOf(d()).sfx !== false ? fx : null; };
  const sfx = name => { const fx = sfxOn(); if (fx) fx.sfx(name); };
  function toggleSound() { const fx = FX(); if (!fx) return; const m = fx.toggleMute(); const b = play().querySelector('.qp-sound'); if (b) { b.classList.toggle('off', m); b.innerHTML = m ? I.mute : I.sound; b.title = m ? 'Son coupé (M)' : 'Couper le son (M)'; } }
  const soundBtn = () => { const fx = FX(); if (!fx) return ''; const m = fx.isMuted(); return `<button type="button" class="qp-sound${m ? ' off' : ''}" data-sound title="${m ? 'Son coupé (M)' : 'Couper le son (M)'}">${m ? I.mute : I.sound}</button>`; };
  function timerHTML(left, total) {
    if (!total) return '<span class="qp-timer none">∞</span>';
    const f = Math.max(0, Math.min(1, left / total));
    return `<span class="qp-timer${left <= 5 ? ' low' : ''}" style="--f:${f.toFixed(3)}"><b>${Math.ceil(left)}</b></span>`;
  }
  const progressHTML = (i, n) => `<div class="qp-progress"><i style="--p:${n ? Math.round(((i + 1) / n) * 100) : 0}%"></i></div>`;
  /* image de la question : chargée puis insérée (test local) ou déjà en data URL (direct) */
  function imgHTML(q, pub) {
    const src = pub && pub.img ? pub.img : '';
    if (src) return `<img class="qp-qimg" src="${esc(src)}" alt="">`;
    if (q && q.img) return `<img class="qp-qimg" data-iid="${esc(q.img)}" alt="" hidden>`;
    return '';
  }
  function loadImgs(root) { root.querySelectorAll('.qp-qimg[data-iid]').forEach(im => AlixoImages.get(im.dataset.iid).then(v => { if (v && im.isConnected) { im.src = v; im.hidden = false; } })); }
  /* tic des dernières secondes */
  let lastTick = -1;
  function tickCheck(left) { const s = Math.ceil(left); if (s <= 5 && s >= 1 && s !== lastTick) { lastTick = s; sfx('tick'); } }

  /* ---------------- test local ---------------- */
  function startTest() {
    const dd = d(); if (!dd) return;
    const qs = qsOf(dd).filter(playable);
    if (!qs.length) { toast('Ajoutez au moins une question avec un texte avant de tester'); return; }
    if (live) { toast('Une présentation en direct est en cours'); return; }
    test = { qs, i: 0, score: 0, ok: 0, answers: {}, timer: null, shownAt: 0, answered: false };
    openPlay('qz-test');
    renderTestQ();
  }
  function renderTestQ() {
    const ov = play(); const q = test.qs[test.i]; const p = C.publicQuestion(q);
    test.answered = false; test.shownAt = Date.now(); test.pub = p; lastTick = -1;
    const nq = test.qs.filter(C.isScored).length;
    if (q.t === 'info') {
      ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Page ${test.i + 1} / ${test.qs.length}</span><span class="qp-score">${fmtPts(test.score)} pts</span>${soundBtn()}<button type="button" class="qp-x" data-close title="Quitter (Échap)">${I.x}</button></div>${progressHTML(test.i, test.qs.length)}
        <div class="qp-body qp-page-wrap">${imgHTML(q)}<div class="qp-q">${esc(qText(q))}</div>${C.widgetHTML(p)}</div>
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${test.i + 1 < test.qs.length ? 'Continuer →' : 'Voir le résultat'} <kbd>Espace</kbd></button></div>`;
      loadImgs(ov);
      ov.querySelector('[data-close]').addEventListener('click', closeTest);
      ov.querySelector('[data-next]').addEventListener('click', () => { if (test.i + 1 < test.qs.length) { test.i++; renderTestQ(); } else endTest(); });
      const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
      sfx('page');
      return;
    }
    ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Question ${test.i + 1} / ${test.qs.length}</span><span class="qp-ptype">${C.TYPES[q.t] ? esc(C.TYPES[q.t].name) : ''}${C.isScored(q) ? '' : ' · sans points'}</span><span class="qp-score">${fmtPts(test.score)} pts</span><span id="qp-timer">${timerHTML(q.time, q.time)}</span>${soundBtn()}<button type="button" class="qp-x" data-close title="Quitter (Échap)">${I.x}</button></div>${progressHTML(test.i, test.qs.length)}
      <div class="qp-body">${imgHTML(q)}<div class="qp-q">${esc(qText(q))}</div>
      <div class="qp-widget" id="qp-widget">${C.widgetHTML(p)}</div></div>
      <div class="qp-foot">Test sur cet appareil · ${nq} question${nq > 1 ? 's' : ''} notée${nq > 1 ? 's' : ''}</div>`;
    loadImgs(ov);
    ov.querySelector('[data-close]').addEventListener('click', closeTest);
    const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
    C.bindWidget(p, ov.querySelector('#qp-widget'), v => testAnswer(v));
    clearInterval(test.timer);
    if (q.time) {
      const end = test.shownAt + q.time * 1000;
      test.timer = setInterval(() => { const left = (end - Date.now()) / 1000; const t = $('#qp-timer'); if (t) t.innerHTML = timerHTML(left, q.time); tickCheck(left); if (left <= 0) { clearInterval(test.timer); testAnswer(null); } }, 200);
    }
  }
  function testAnswer(v) {
    if (!test || test.answered) return;
    test.answered = true; clearInterval(test.timer);
    const q = test.qs[test.i]; const el = Date.now() - test.shownAt;
    const qk = Object.assign({}, q, { rkey: test.pub._key || null });
    const ok = C.check(qk, v); const pts = C.points(q, el, ok);
    test.score += pts; if (ok) test.ok++;
    const vs = q.t === 'match' && v && test.pub._key ? Object.fromEntries(Object.entries(v).map(([l, r]) => [l, test.pub._key[r] || r])) : v;   // association : identifiants des paires, lisibles plus tard
    test.answers[q.id] = { v: vs, ok, pts, el };
    const sc = play().querySelector('.qp-score'); if (sc) sc.textContent = fmtPts(test.score) + ' pts';
    const ov = play();
    const full = Object.assign({}, test.pub, { ans: q.ans, tol: q.tol, unit: q.unit, opts: q.t === 'order' ? q.opts : test.pub.opts, multi: q.multi, pairs: q.pairs, rkey: test.pub._key || null });
    const unscored = !C.isScored(q);
    ov.querySelector('#qp-widget').innerHTML = unscored && q.t !== 'poll' ? `<div class="qp-good">Votre réponse : <b>${esc(C.answerText(full, v))}</b></div>` : C.widgetHTML(full, { reveal: true, v, done: true });
    const fb = document.createElement('div'); fb.className = 'qp-fb ' + (unscored ? 'poll' : ok ? 'ok' : v === null ? 'late' : 'ko');
    fb.innerHTML = `<div class="qp-fbt">${unscored ? 'Merci pour votre réponse' : ok ? 'Bonne réponse !' : v === null ? 'Temps écoulé' : 'Mauvaise réponse'}</div>${unscored ? '' : `<div class="qp-fbp">${ok ? '+ ' + fmtPts(pts) + ' pts · ' + fmtSec(el) : 'Bonne réponse : <b>' + esc(C.correctText(full)) + '</b>'}</div>`}<button type="button" class="qp-next" data-next>${test.i + 1 < test.qs.length ? 'Suivant →' : 'Voir le résultat'} <kbd>Espace</kbd></button>`;
    ov.querySelector('.qp-widget').after(fb);
    fb.querySelector('[data-next]').addEventListener('click', () => { if (test.i + 1 < test.qs.length) { test.i++; renderTestQ(); } else endTest(); });
    fb.querySelector('[data-next]').focus();
    if (!unscored) sfx(ok ? 'ok' : v === null ? 'late' : 'ko'); else sfx('reveal');
  }
  function endTest() {
    const dd = d(); if (!dd || !test) return;
    const n = test.qs.length, scored = test.qs.filter(C.isScored).length;
    const els = Object.values(test.answers).filter(a => a.v !== null).map(a => a.el);
    const rec = { id: uid(), mode: 'test', at: Date.now(), name: 'Moi', score: test.score, ok: test.ok, n: scored, answers: test.answers, meanEl: els.length ? Math.round(els.reduce((a, b) => a + b, 0) / els.length) : null };
    if (!readOnly) { resOf(dd).push(rec); commit(); renderBar(); }
    const ov = play();
    const pct = scored ? Math.round(test.ok / scored * 100) : 0;
    ov.innerHTML = `<div class="qp-top"><span class="qp-prog">Résultat</span>${soundBtn()}<button type="button" class="qp-x" data-close title="Fermer (Échap)">${I.x}</button></div>
      <div class="qp-body"><div class="qp-end"><div class="qp-endscore">${fmtPts(test.score)}<small>points</small></div>
      <div class="qp-kpis"><div class="qp-kpi"><b>${test.ok} / ${scored}</b><small>bonnes réponses</small></div><div class="qp-kpi"><b>${pct} %</b><small>de réussite</small></div><div class="qp-kpi"><b>${fmtSec(rec.meanEl)}</b><small>temps moyen</small></div>${n > scored ? `<div class="qp-kpi"><b>${n - scored}</b><small>sans points</small></div>` : ''}</div>
      <div class="qp-endlist">${test.qs.map((q, i) => { const a = test.answers[q.id] || {}; const un = !C.isScored(q); return `<div class="qp-endrow ${un ? '' : a.ok ? 'ok' : 'ko'}"><span>${i + 1}</span><span class="qp-endq">${esc(qText(q))}</span><span class="qp-enda">${q.t === 'info' ? 'page' : esc(C.answerText(Object.assign({}, q, { rkey: null }), a.v))}</span><span class="qp-endp">${un ? '—' : a.ok ? '+' + fmtPts(a.pts) : '✗'}</span></div>`; }).join('')}</div>
      <div class="qp-ctrl"><button type="button" class="qp-next" data-again>Rejouer</button><button type="button" class="qp-next ghost" data-close>Fermer</button></div>
      <div class="qp-foot">${readOnly ? 'Quiz en lecture seule : le résultat n’est pas enregistré.' : 'Résultat enregistré (bouton Résultats).'}</div></div></div>`;
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeTest));
    ov.querySelector('[data-again]').addEventListener('click', () => { closeTest(); startTest(); });
    const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
    sfx('end');
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
    const qs = qsOf(dd).filter(playable);
    if (!qs.length) { toast('Ajoutez au moins une question avant de présenter'); return; }
    if (live) { toast('Une présentation est déjà en cours'); return; }
    const db = firebase.firestore();
    const me = AlixoAuth.account();
    let code = genCode();
    for (let k = 0; k < 5; k++) { try { const s = await db.collection('live').doc(code).get(); if (!s.exists) break; } catch { break; } code = genCode(); }
    const theme = C.resolveTheme(themeOf(dd));
    live = { code, qs, i: -1, state: 'lobby', players: new Map(), unsub: null, timer: null, qStart: 0, qEnd: 0, pub: null, busy: false, err: '', prevRank: new Map(), qstats: [], joined: 0 };
    try {
      await db.collection('live').doc(code).set({ code, host: me.uid, hostName: me.name || me.email || 'Présentateur', title: dd.titre || 'Quiz', n: qs.length, state: 'lobby', qi: -1, q: null, qStart: 0, qEnd: 0, answer: null, stats: null, top: [], theme, createdAt: Date.now(), updatedAt: Date.now() });
    } catch (e) {
      live = null;
      console.error('Quiz en direct :', e);
      toast('Impossible de créer la partie : ' + (e && e.code === 'permission-denied' ? 'les règles Firestore du quiz en direct ne sont pas publiées (voir README)' : (e && e.message) || 'erreur réseau'), { duration: 8000 });
      return;
    }
    live.unsub = db.collection('live').doc(code).collection('players').onSnapshot(snap => {
      if (!live) return;
      let added = 0;
      snap.docChanges().forEach(ch => { if (ch.type === 'removed') live.players.delete(ch.doc.id); else { if (ch.type === 'added') added++; live.players.set(ch.doc.id, Object.assign({ pid: ch.doc.id }, ch.doc.data())); } });
      if (added && live.state === 'lobby' && live.joined > 0) sfx('join');
      live.joined += added;
      onPlayers();
    }, err => { console.error('Quiz en direct (participants) :', err); if (live) { live.err = 'Liaison avec les participants interrompue'; renderLive(); } });
    openPlay('qz-live');
    renderLive();
  }
  function onPlayers() {
    if (!live) return;
    if (live.state === 'lobby') { renderLivePlayers(); return; }
    if (live.state === 'q' && live.pub && live.pub.t !== 'info') {
      const n = live.players.size, a = answeredCount();
      const c = $('#qp-answered'); if (c) { c.textContent = `${a} / ${n} réponse${a > 1 ? 's' : ''}`; c.classList.toggle('all', n > 0 && a >= n); }
      if (n > 0 && a >= n && !live.allTm) live.allTm = setTimeout(() => { live.allTm = null; if (live && live.state === 'q') liveReveal(); }, 1200);   // tout le monde a répondu
    }
  }
  const answeredCount = () => { const q = live.pub; if (!q) return 0; let n = 0; for (const p of live.players.values()) if (p.answers && p.answers[q.id]) n++; return n; };
  function liveQ() { return live.i >= 0 ? live.qs[live.i] : null; }
  function liveNext() {
    if (!live || live.busy) return;
    if (live.state === 'lobby' || live.state === 'reveal' || (live.state === 'q' && live.pub && live.pub.t === 'info')) { if (live.i + 1 < live.qs.length) publishQuestion(live.i + 1); else liveEnd(); }
    else if (live.state === 'q') liveReveal();
    else if (live.state === 'end') closeLive();
  }
  async function publishQuestion(i) {
    if (!live) return;
    const q = live.qs[i]; const pub = C.publicQuestion(q);
    live.busy = true;
    if (q.img) { try { pub.img = await smallImage(q.img); } catch { pub.img = ''; } if (!pub.img) delete pub.img; }
    if (!live) return;
    if (live.state === 'lobby') sfx('start'); else if (q.t === 'info') sfx('page');
    live.i = i; live.state = 'q'; live.pub = pub; live.qStart = Date.now(); live.qEnd = q.time && q.t !== 'info' ? live.qStart + q.time * 1000 : 0; lastTick = -1;
    clearInterval(live.timer); if (live.allTm) { clearTimeout(live.allTm); live.allTm = null; }
    try { await liveRef().update({ state: 'q', qi: i, q: C.sendable(pub), qStart: live.qStart, qEnd: live.qEnd, answer: null, stats: null, updatedAt: Date.now() }); }
    catch (e) { console.error(e); live.err = 'Envoi de la question impossible'; }
    live.busy = false;
    renderLive();
    if (live.qEnd) live.timer = setInterval(() => { if (!live || live.state !== 'q') { clearInterval(live.timer); return; } const left = (live.qEnd - Date.now()) / 1000; const t = $('#qp-timer'); if (t) t.innerHTML = timerHTML(left, q.time); tickCheck(left); if (left <= 0) { clearInterval(live.timer); liveReveal(); } }, 200);
  }
  async function liveReveal() {
    if (!live || live.state !== 'q' || live.busy) return;
    clearInterval(live.timer); if (live.allTm) { clearTimeout(live.allTm); live.allTm = null; }
    const q = liveQ(); const pub = live.pub;
    if (q.t === 'info') { liveNext(); return; }
    live.busy = true; live.state = 'reveal';
    const db = firebase.firestore();
    const qk = Object.assign({}, q, { rkey: pub._key || null });
    const list = [];
    const vals = [];
    let fastest = null;
    live.prevRank = new Map([...live.players.values()].map(p => [p.pid, p.rank || 0]));
    for (const p of live.players.values()) {
      const a = p.answers && p.answers[q.id];
      const v = a ? a.v : null;
      const ok = a ? C.check(qk, v) : (C.isScored(q) ? false : null);
      const pts = a ? C.points(q, a.el || 0, ok) : 0;
      p.score = (+p.score || 0) + pts;
      p.fb = { qid: q.id, ok, pts, v, answered: !!a };
      p.nok = (+p.nok || 0) + (ok ? 1 : 0); p.nans = (+p.nans || 0) + (a ? 1 : 0); p.sumEl = (+p.sumEl || 0) + (a ? (+a.el || 0) : 0);
      if (a) vals.push(v);
      if (ok && a && (!fastest || a.el < fastest.el)) fastest = { name: p.name || '?', el: a.el };
      list.push(p);
    }
    list.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    list.forEach((p, i) => { p.rank = i + 1; });
    live.stats = C.stats(qk, vals);
    live.fastest = fastest;
    live.qstats.push({ id: q.id, t: q.t, text: qText(q), n: vals.length, players: live.players.size, ok: live.stats.ok || 0, meanEl: vals.length ? Math.round(list.filter(p => p.fb.answered).reduce((s, p) => s + ((p.answers[q.id] || {}).el || 0), 0) / vals.length) : null, counts: live.stats.counts || null, mean: live.stats.mean == null ? null : live.stats.mean });
    live.top = list.slice(0, 10).map(p => ({ pid: p.pid, name: p.name || '?', score: p.score || 0 }));
    const answer = q.t === 'slider' || q.t === 'numeric' ? { ans: q.ans, tol: q.tol || 0, unit: q.unit || '' } : q.t === 'order' ? { ans: q.opts.map(o => o.id) } : q.t === 'match' ? { pairs: (q.pairs || []).filter(x => (x.l || '').trim() || (x.r || '').trim()).map(x => ({ id: x.id, l: x.l || '', r: x.r || '' })), rkey: pub._key || {} } : { ans: q.ans === undefined ? null : q.ans };
    try {
      await liveRef().update({ state: 'reveal', answer, stats: { n: live.stats.n, ok: live.stats.ok || 0 }, top: live.top, updatedAt: Date.now() });
      const chunks = []; for (let i = 0; i < list.length; i += 400) chunks.push(list.slice(i, i + 400));
      for (const ch of chunks) { const batch = db.batch(); for (const p of ch) batch.update(db.collection('live').doc(live.code).collection('players').doc(p.pid), { score: p.score, rank: p.rank, fb: p.fb }); await batch.commit(); }
    } catch (e) { console.error(e); live.err = 'Envoi des résultats impossible'; }
    live.busy = false;
    sfx('reveal');
    renderLive();
  }
  async function liveEnd() {
    if (!live) return;
    live.state = 'end'; live.busy = true;
    const list = [...live.players.values()].sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    live.final = list.map((p, i) => ({ pid: p.pid, name: p.name || '?', score: p.score || 0, rank: i + 1, ok: p.nok || 0, answered: p.nans || 0, meanEl: p.nans ? Math.round((p.sumEl || 0) / p.nans) : null }));
    try { await liveRef().update({ state: 'end', top: live.final.slice(0, 50).map(p => ({ pid: p.pid, name: p.name, score: p.score, rank: p.rank })), updatedAt: Date.now() }); } catch (e) { console.error(e); }
    live.busy = false;
    const dd = d();
    if (dd && !readOnly && live.final.length) {
      const scored = live.qs.filter(C.isScored).length;
      resOf(dd).push({ id: uid(), mode: 'live', at: Date.now(), code: live.code, n: scored, questions: live.qs.length, players: live.final.map(p => ({ name: p.name, score: p.score, rank: p.rank, ok: p.ok, answered: p.answered, meanEl: p.meanEl })), qstats: live.qstats.slice() });
      commit(); renderBar();
    }
    sfx('end');
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
    box.innerHTML = `<div class="qp-pcount">${names.length ? names.length + ' participant' + (names.length > 1 ? 's' : '') : 'En attente des premiers participants'}</div><div class="qp-pnames">${names.map(n => `<span>${esc(n)}</span>`).join('')}</div>`;
    const b = $('#qp-start'); if (b) b.disabled = !names.length;
  }
  function statsHTML(q, st) {
    if (!st) return '';
    const pct = c => (st.n ? Math.round(c / st.n * 100) : 0);
    if ((q.t === 'mcq' || q.t === 'poll') && st.counts) return `<div class="qp-bars">${(live.pub.opts || []).map((o, i) => { const c = st.counts[o.id] || 0; const ok = q.t === 'mcq' && (q.ans || []).includes(o.id); return `<div class="qp-bar${ok ? ' ok' : ''}" style="--oc:var(--qp-c${i % 6})"><span class="qp-bfill" style="height:${st.n ? Math.max(3, pct(c)) : 3}%"></span><b>${c}<small>${pct(c)} %</small></b><span class="qp-bsh">${C.letter(i)}</span></div>`; }).join('')}</div>`;
    if (q.t === 'tf' && st.counts) return `<div class="qp-bars n2">${[['true', 'V', 'var(--qp-c2)'], ['false', 'F', 'var(--qp-c1)']].map(([k, l, c]) => `<div class="qp-bar${String(q.ans) === k ? ' ok' : ''}" style="--oc:${c}"><span class="qp-bfill" style="height:${st.n ? Math.max(3, pct(st.counts[k] || 0)) : 3}%"></span><b>${st.counts[k] || 0}<small>${pct(st.counts[k] || 0)} %</small></b><span class="qp-bsh">${l}</span></div>`).join('')}</div>`;
    if (q.t === 'order' || q.t === 'match') return `<div class="qp-stat">${st.ok || 0} sur ${st.n} ont trouvé<small>${pct(st.ok || 0)} % de réussite</small></div>`;
    if (q.t === 'slider' || q.t === 'numeric' || q.t === 'scale') {
      const entries = Object.entries(st.counts || {}).map(([v, c]) => [+v, c]).sort((a, b) => a[0] - b[0]);
      const max = Math.max(1, ...entries.map(e => e[1]));
      const hist = entries.length ? `<div class="qp-hist">${entries.slice(0, 14).map(([v, c]) => `<div class="${q.t !== 'scale' && C.check(q, v) ? 'ok' : ''}"><b>${c}</b><i style="height:${Math.max(3, Math.round(c / max * 100))}%"></i><small>${esc(v)}</small></div>`).join('')}</div>` : '';
      const mean = st.mean == null ? '' : `moyenne ${(Math.round(st.mean * 100) / 100).toLocaleString('fr-FR')}${q.unit ? ' ' + esc(q.unit) : ''}`;
      return hist + `<div class="qp-stat">${q.t === 'scale' ? `${st.n} réponse${st.n > 1 ? 's' : ''}` : `${st.ok || 0} dans la cible sur ${st.n}`}<small>${mean}</small></div>`;
    }
    if (q.t === 'open' && st.counts) {
      const entries = Object.entries(st.counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
      const max = Math.max(1, ...entries.map(e => e[1]));
      return `<div class="qp-cloud">${entries.map(([t, c], i) => `<span style="--k:${((c - 1) / Math.max(1, max - 1)).toFixed(2)};--cc:var(--qp-c${i % 6})">${esc(t)}${c > 1 ? `<small>×${c}</small>` : ''}</span>`).join('') || '<span style="--k:0">Aucune réponse</span>'}</div><div class="qp-stat"><small>${st.n} réponse${st.n > 1 ? 's' : ''} · ${entries.length} mot${entries.length > 1 ? 's' : ''} différent${entries.length > 1 ? 's' : ''}</small></div>`;
    }
    if (q.t === 'text' && st.counts) return `<div class="qp-stat">${st.ok || 0} bonne${st.ok > 1 ? 's' : ''} réponse${st.ok > 1 ? 's' : ''} sur ${st.n}<small>${pct(st.ok || 0)} % de réussite</small></div><div class="qp-texts">${Object.entries(st.counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, c]) => `<span class="${C.check(q, t) ? 'ok' : ''}">${esc(t)} <b>${c}</b></span>`).join('')}</div>`;
    return '';
  }
  function renderLive() {
    const ov = play(); if (!live || ov.hidden) return;
    const dd = d();
    const top = (title, extra) => `<div class="qp-top"><span class="qp-prog">${title}</span>${extra || ''}<span class="qp-code-sm" title="Code de la partie">${JOIN_HOST} · <b>${live.code}</b></span>${soundBtn()}<button type="button" class="qp-x" data-close title="Arrêter la présentation (Échap)">${I.x}</button></div>`;
    const err = live.err ? `<div class="qp-err">${esc(live.err)}</div>` : '';
    const hints = `<div class="qp-hints"><span><kbd>Espace</kbd> ou <kbd>→</kbd> suite</span><span><kbd>M</kbd> son</span><span><kbd>Échap</kbd> arrêter</span></div>`;
    if (live.state === 'lobby') {
      const nq = live.qs.filter(C.isScored).length, np = live.qs.filter(C.isPage).length;
      ov.innerHTML = top('Salle d’attente') + `<div class="qp-body"><div class="qp-lobby-title">${esc((dd && dd.titre) || 'Quiz')}</div><div class="qp-lobby-sub">${nq} question${nq > 1 ? 's' : ''}${np ? ` · ${np} page${np > 1 ? 's' : ''}` : ''}${live.qs.length - nq - np ? ` · ${live.qs.length - nq - np} avis du public` : ''}</div><div class="qp-lobby">
        <div class="qp-join"><div class="qp-jtitle">Rejoignez le quiz</div><div class="qp-jurl">${JOIN_HOST}</div><div class="qp-jcode">${live.code}</div><div class="qp-jhint">Sur votre téléphone ou ordinateur : ouvrez ${JOIN_HOST}, entrez le code et un pseudo — ou scannez le QR code.</div></div>
        <div class="qp-qr">${qrSvg(joinUrl(live.code))}</div></div>
        <div id="qp-players" class="qp-players"></div>${err}</div>
        <div class="qp-ctrl"><button type="button" class="qp-next" id="qp-start" data-next disabled>Commencer →</button>${hints}</div>`;
      renderLivePlayers();
    } else if (live.state === 'q') {
      const q = liveQ(), pub = live.pub, n = live.players.size, a = answeredCount();
      if (q.t === 'info') {
        ov.innerHTML = top(`Page ${live.i + 1} / ${live.qs.length}`) + progressHTML(live.i, live.qs.length) + `
          <div class="qp-body qp-page-wrap">${imgHTML(q, pub)}<div class="qp-q">${esc(qText(q))}</div>${C.widgetHTML(pub)}</div>${err}
          <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${live.i + 1 < live.qs.length ? 'Suite →' : 'Terminer : classement final →'}</button>${hints}</div>`;
      } else {
        ov.innerHTML = top(`Question ${live.i + 1} / ${live.qs.length}`, `<span class="qp-ptype">${C.TYPES[q.t] ? esc(C.TYPES[q.t].name) : ''}</span><span id="qp-timer">${timerHTML(q.time ? (live.qEnd - Date.now()) / 1000 : 0, q.time)}</span><span id="qp-answered" class="qp-answered${n > 0 && a >= n ? ' all' : ''}">${a} / ${n} réponse${a > 1 ? 's' : ''}</span>`) + progressHTML(live.i, live.qs.length) + `
          <div class="qp-body">${imgHTML(q, pub)}<div class="qp-q big">${esc(qText(q))}</div>
          <div class="qp-widget big">${q.t === 'text' || q.t === 'open' || q.t === 'numeric' ? `<div class="qp-device">${q.t === 'numeric' ? 'Les participants tapent un nombre sur leur appareil.' : q.t === 'open' ? 'Les participants envoient un mot ou une idée : le nuage se forme à la révélation.' : 'Les participants tapent leur réponse sur leur appareil.'}</div>` : C.widgetHTML(pub, { done: true })}</div></div>${err}
          <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${C.isScored(q) ? 'Révéler la réponse →' : 'Voir les réponses →'}</button>${hints}</div>`;
      }
    } else if (live.state === 'reveal') {
      const q = liveQ(), st = live.stats || { n: 0 };
      const full = Object.assign({}, live.pub, { ans: q.ans, tol: q.tol, unit: q.unit, opts: q.t === 'order' ? q.opts : live.pub.opts, multi: q.multi, pairs: q.pairs, rkey: live.pub._key || null });
      const last = live.i + 1 >= live.qs.length;
      const showWidget = !(q.t === 'text' || q.t === 'open' || q.t === 'scale' || q.t === 'numeric');
      ov.innerHTML = top(`Question ${live.i + 1} / ${live.qs.length} · ${C.isScored(q) ? 'réponse' : 'réponses du public'}`) + progressHTML(live.i, live.qs.length) + `
        <div class="qp-body"><div class="qp-reveal"><div class="qp-rleft"><div class="qp-q">${esc(qText(q))}</div>${showWidget ? `<div class="qp-widget">${C.widgetHTML(full, { reveal: true, done: true })}</div>` : (C.isScored(q) ? `<div class="qp-good" style="text-align:center">Bonne réponse : <b>${esc(C.correctText(full))}</b></div>` : '')}${statsHTML(q, st)}</div>
        <div class="qp-rright"><div class="qp-ltitle">Classement</div><ol class="qp-lead">${(live.top || []).slice(0, 8).map((p, i) => { const prev = live.prevRank.get(p.pid) || 0; const delta = prev ? prev - (i + 1) : 0; return `<li><span>${esc(p.name)}</span><em class="${delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'}">${delta > 0 ? '▲' + delta : delta < 0 ? '▼' + (-delta) : (prev ? '=' : '')}</em><b>${fmtPts(p.score)}</b></li>`; }).join('') || '<li class="none">Personne n’a encore de points</li>'}</ol>${live.fastest ? `<div class="qp-fastest">Le plus rapide : <b>${esc(live.fastest.name)}</b> en ${fmtSec(live.fastest.el)}</div>` : ''}</div></div>${err}</div>
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>${last ? 'Terminer : classement final →' : 'Suivant →'}</button>${hints}</div>`;
    } else if (live.state === 'end') {
      const f = live.final || [];
      const scored = live.qstats.filter(s => C.TYPES[s.t] && C.isScored({ t: s.t }));
      const sumOk = scored.reduce((s, x) => s + (x.ok || 0), 0), sumN = scored.reduce((s, x) => s + (x.n || 0), 0);
      const mean = f.length ? Math.round(f.reduce((s, p) => s + p.score, 0) / f.length) : 0;
      const hardest = scored.length ? scored.slice().sort((a, b) => (a.n ? a.ok / a.n : 0) - (b.n ? b.ok / b.n : 0))[0] : null;
      ov.innerHTML = top('Classement final') + `<div class="qp-body"><div class="qp-end live">
        <div class="qp-podium">${[1, 0, 2].map(i => f[i] ? `<div class="qp-pod p${i + 1}"><div class="qp-pname">${esc(f[i].name)}</div><div class="qp-pbox"><span>${i + 1}</span><b>${fmtPts(f[i].score)}</b></div></div>` : `<div class="qp-pod p${i + 1} empty"></div>`).join('')}</div>
        <div class="qp-kpis"><div class="qp-kpi"><b>${f.length}</b><small>participant${f.length > 1 ? 's' : ''}</small></div><div class="qp-kpi"><b>${fmtPts(mean)}</b><small>score moyen</small></div><div class="qp-kpi"><b>${sumN ? Math.round(sumOk / sumN * 100) : 0} %</b><small>de bonnes réponses</small></div>${hardest ? `<div class="qp-kpi"><b>${hardest.n ? Math.round(hardest.ok / hardest.n * 100) : 0} %</b><small>question la plus dure : « ${esc(hardest.text.slice(0, 40))}${hardest.text.length > 40 ? '…' : ''} »</small></div>` : ''}</div>
        <div class="qp-endlist">${f.slice(3).map(p => `<div class="qp-endrow"><span>${p.rank}</span><span class="qp-endq">${esc(p.name)}</span><span class="qp-enda">${p.ok} / ${scored.length} · ${fmtSec(p.meanEl)}</span><span class="qp-endp">${fmtPts(p.score)}</span></div>`).join('')}</div>${err}
        <div class="qp-ctrl"><button type="button" class="qp-next" data-next>Fermer</button><button type="button" class="qp-next ghost" data-stats>Statistiques détaillées</button></div>
        <div class="qp-foot">${readOnly ? 'Quiz en lecture seule : le classement n’est pas enregistré.' : 'Classement et statistiques enregistrés (bouton Résultats).'}</div></div></div>`;
      const sb = ov.querySelector('[data-stats]'); if (sb) sb.addEventListener('click', () => { closeLive(); setTimeout(openResults, 150); });
    }
    loadImgs(ov);
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeLive));
    ov.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', liveNext));
    const sb = ov.querySelector('[data-sound]'); if (sb) sb.addEventListener('click', toggleSound);
  }

  /* ============================================================
     Résultats enregistrés : scores, statistiques par question et par participant, export CSV
     ============================================================ */
  const median = arr => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function liveResultHTML(dd, r) {
    const players = r.players || [];
    const qst = Array.isArray(r.qstats) ? r.qstats : [];
    const scoredQ = qst.filter(s => C.isScored({ t: s.t }));
    const scores = players.map(p => +p.score || 0);
    const mean = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const sumOk = scoredQ.reduce((s, x) => s + (x.ok || 0), 0), sumN = scoredQ.reduce((s, x) => s + (x.n || 0), 0);
    const els = players.map(p => p.meanEl).filter(x => x != null);
    const maxScore = Math.max(1, ...scores);
    /* répartition des scores : six tranches */
    const B = 6; const buckets = new Array(B).fill(0);
    for (const s of scores) buckets[Math.min(B - 1, Math.floor(s / maxScore * B))]++;
    const bmax = Math.max(1, ...buckets);
    const kpis = `<div class="qz-kpis"><div class="qz-kpi"><b>${players.length}</b><small>participants</small></div><div class="qz-kpi"><b>${fmtPts(mean)}</b><small>score moyen</small></div><div class="qz-kpi"><b>${fmtPts(Math.round(median(scores)))}</b><small>médiane</small></div><div class="qz-kpi"><b>${sumN ? Math.round(sumOk / sumN * 100) : 0} %</b><small>bonnes réponses</small></div><div class="qz-kpi"><b>${els.length ? fmtSec(Math.round(els.reduce((a, b) => a + b, 0) / els.length)) : '—'}</b><small>temps moyen</small></div></div>`;
    const dist = scores.length > 1 ? `<div class="qz-rsect"><div class="qz-rtitle">Répartition des scores</div><div class="qz-hist">${buckets.map((c, i) => `<div title="${c} participant${c > 1 ? 's' : ''}"><b>${c || ''}</b><i style="height:${Math.max(2, Math.round(c / bmax * 100))}%"></i><small>${fmtPts(Math.round(i / B * maxScore))}</small></div>`).join('')}</div></div>` : '';
    const perQ = qst.length ? `<div class="qz-rsect"><div class="qz-rtitle">Par question</div><div class="qz-qrows">${qst.map((s, i) => { const scored = C.isScored({ t: s.t }); const pct = s.n ? Math.round((s.ok || 0) / s.n * 100) : 0; const hard = scored && s.n && scoredQ.length > 1 && s === scoredQ.slice().sort((a, b) => (a.n ? a.ok / a.n : 0) - (b.n ? b.ok / b.n : 0))[0]; return `<div class="qz-qrow${hard ? ' hard' : ''}"><span class="qz-qn">${i + 1}</span><span class="qz-qt" title="${esc(s.text)}">${esc(s.text)}${hard ? ' <em>la plus dure</em>' : ''}</span>${scored ? `<span class="qz-qbar"><i style="width:${pct}%"></i></span><span class="qz-qv">${pct} %<small>${s.ok || 0} / ${s.n}</small></span>` : `<span class="qz-qbar muted"></span><span class="qz-qv"><small>${s.t === 'info' ? 'page' : (s.n || 0) + ' réponse' + (s.n > 1 ? 's' : '') + (s.mean != null ? ' · moy. ' + (Math.round(s.mean * 100) / 100).toLocaleString('fr-FR') : '')}</small></span>`}<span class="qz-qel">${fmtSec(s.meanEl)}</span></div>`; }).join('')}</div></div>` : '';
    const table = `<div class="qz-rsect"><div class="qz-rtitle">Participants</div><table class="qz-ptable"><thead><tr><th>#</th><th>Pseudo</th><th>Score</th><th>Bonnes</th><th>Temps moyen</th></tr></thead><tbody>${players.map(p => `<tr><td>${p.rank || ''}</td><td>${esc(p.name)}</td><td><b>${fmtPts(p.score)}</b></td><td>${p.ok != null ? `${p.ok} / ${scoredQ.length || r.n || '?'}` : '—'}</td><td>${fmtSec(p.meanEl)}</td></tr>`).join('')}</tbody></table></div>`;
    return kpis + dist + perQ + table;
  }
  function testResultHTML(dd, r) {
    const qs = qsOf(dd);
    return `<div class="qz-kpis"><div class="qz-kpi"><b>${fmtPts(r.score)}</b><small>points</small></div><div class="qz-kpi"><b>${r.ok} / ${r.n}</b><small>bonnes réponses</small></div><div class="qz-kpi"><b>${r.n ? Math.round(r.ok / r.n * 100) : 0} %</b><small>réussite</small></div><div class="qz-kpi"><b>${fmtSec(r.meanEl)}</b><small>temps moyen</small></div></div>
      <div class="qz-rans">${qs.map((q, i) => { const a = r.answers && r.answers[q.id]; if (!a) return ''; const un = !C.isScored(q); return `<span class="${un ? '' : a.ok ? 'ok' : 'ko'}" title="${esc(qText(q))}">${i + 1}. ${q.t === 'info' ? 'page' : esc(C.answerText(Object.assign({}, q, { rkey: null }), a.v))}${a.el ? ` <small>${fmtSec(a.el)}</small>` : ''}</span>`; }).join('')}</div>`;
  }
  function csvOf(dd, r) {
    const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const lines = [];
    if (r.mode === 'live') {
      lines.push(['Rang', 'Pseudo', 'Score', 'Bonnes réponses', 'Réponses', 'Temps moyen (s)'].map(q).join(';'));
      for (const p of (r.players || [])) lines.push([p.rank, p.name, p.score, p.ok ?? '', p.answered ?? '', p.meanEl != null ? (p.meanEl / 1000).toFixed(1).replace('.', ',') : ''].map(q).join(';'));
      if (Array.isArray(r.qstats) && r.qstats.length) {
        lines.push('', ['N°', 'Question', 'Type', 'Réponses', 'Bonnes', 'Réussite (%)', 'Temps moyen (s)'].map(q).join(';'));
        r.qstats.forEach((s, i) => lines.push([i + 1, s.text, C.TYPES[s.t] ? C.TYPES[s.t].name : s.t, s.n, s.ok, s.n && C.isScored({ t: s.t }) ? Math.round(s.ok / s.n * 100) : '', s.meanEl != null ? (s.meanEl / 1000).toFixed(1).replace('.', ',') : ''].map(q).join(';')));
      }
    } else {
      lines.push(['N°', 'Question', 'Réponse', 'Juste', 'Points', 'Temps (s)'].map(q).join(';'));
      qsOf(dd).forEach((x, i) => { const a = r.answers && r.answers[x.id]; if (a) lines.push([i + 1, qText(x), C.answerText(Object.assign({}, x, { rkey: null }), a.v), a.ok ? 'oui' : (C.isScored(x) ? 'non' : ''), a.pts, a.el != null ? (a.el / 1000).toFixed(1).replace('.', ',') : ''].map(q).join(';')); });
    }
    return '﻿' + lines.join('\r\n');
  }
  function downloadCSV(dd, r) {
    const name = safeFileName((dd.titre || 'Quiz') + ' - résultats ' + new Date(r.at).toLocaleDateString('fr-FR').replace(/\//g, '-')) + '.csv';
    const blob = new Blob([csvOf(dd, r)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function openResults() {
    const dd = d(); if (!dd) return;
    const rs = resOf(dd).slice().sort((a, b) => b.at - a.at);
    const when = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const body = rs.length ? `<div class="qz-results">${rs.map((r, i) => `<div class="qz-res${i === 0 ? ' open' : ''}" data-res="${r.id}"><div class="qz-rhead" data-toggle>${r.mode === 'live' ? `<b>En direct</b> · ${when(r.at)} · ${(r.players || []).length} participant${(r.players || []).length > 1 ? 's' : ''} · ${r.questions || r.n} question${(r.questions || r.n) > 1 ? 's' : ''}` : `<b>Test</b> · ${when(r.at)} · <b>${fmtPts(r.score)} pts</b> · ${r.ok} / ${r.n} bonne${r.ok > 1 ? 's' : ''} réponse${r.ok > 1 ? 's' : ''}`}<span class="qz-ract"><button type="button" class="qz-rcsv" data-rcsv title="Télécharger en CSV (tableur)">${I.csv}CSV</button>${readOnly ? '' : `<button type="button" class="qz-rdel" data-rdel title="Supprimer">${I.trash}</button>`}</span></div><div class="qz-rbody">${r.mode === 'live' ? liveResultHTML(dd, r) : testResultHTML(dd, r)}</div></div>`).join('')}</div>`
      : `<div class="qz-lempty" style="padding:30px 10px; text-align:center">Aucun résultat pour l’instant : <b>Tester</b> joue le quiz sur cet appareil, <b>Présenter en direct</b> le fait jouer à un groupe. Les scores et statistiques s’enregistrent ici.</div>`;
    openDialog({ id: 'qz-resdlg', cls: 'wide', eyebrow: 'Quiz', title: 'Résultats', sub: esc(dd.titre || 'Sans titre'), body, onMount: card => {
      card.addEventListener('click', e => {
        const box = e.target.closest('.qz-res'); if (!box) return;
        const r = resOf(dd).find(x => x.id === box.dataset.res); if (!r) return;
        if (e.target.closest('[data-rcsv]')) { downloadCSV(dd, r); return; }
        if (e.target.closest('[data-rdel]')) {
          if (readOnly) return;
          const i = resOf(dd).indexOf(r); if (i < 0) return;
          resOf(dd).splice(i, 1); commit(); renderBar(); box.remove();
          if (!resOf(dd).length) closeDialog('qz-resdlg');
          return;
        }
        if (e.target.closest('[data-toggle]')) box.classList.toggle('open');
      });
    } });
  }

  /* ============================================================
     Export PDF : les questions, avec les bonnes réponses
     ============================================================ */
  function printHTML(dd) {
    const qs = qsOf(dd);
    let qi = 0;
    return `<h2>${esc(dd.titre || 'Quiz')}</h2><div class="qzp-sub">${qs.filter(q => q.t !== 'info').length} question${qs.length > 1 ? 's' : ''} · les bonnes réponses sont marquées ✓</div>` + qs.map((q) => {
      let ans = '';
      if (q.t === 'mcq' || q.t === 'poll') ans = `<ol class="qzp-opts">${(q.opts || []).map((o, k) => `<li class="${q.t === 'mcq' && (q.ans || []).includes(o.id) ? 'ok' : ''}"><span class="qzp-sh">${C.letter(k)}</span>${esc(o.text)}</li>`).join('')}</ol>`;
      else if (q.t === 'order') ans = `<ol class="qzp-opts order">${(q.opts || []).map(o => `<li class="ok">${esc(o.text)}</li>`).join('')}</ol>`;
      else if (q.t === 'match') ans = `<ol class="qzp-opts">${(q.pairs || []).map((p, k) => `<li class="ok"><span class="qzp-sh">${C.letter(k)}</span>${esc(p.l)} → ${esc(p.r)}</li>`).join('')}</ol>`;
      else if (q.t === 'info') ans = q.body ? `<div class="qzp-ans">${esc(q.body).replace(/\n/g, '<br>')}</div>` : '';
      else if (q.t === 'scale') ans = `<div class="qzp-ans">Échelle de ${esc(q.min)} (${esc(q.lo || '')}) à ${esc(q.max)} (${esc(q.hi || '')})</div>`;
      else if (q.t === 'open') ans = `<div class="qzp-ans">Réponse libre (nuage de mots)</div>`;
      else ans = `<div class="qzp-ans">Réponse : <b>${esc(C.correctText(q))}</b>${q.t === 'slider' ? ` <small>(échelle ${esc(q.min)} – ${esc(q.max)})</small>` : ''}</div>`;
      const page = q.t === 'info'; if (!page) qi++;
      return `<div class="qzp-q${page ? ' page' : ''}"><div class="qzp-qh"><span class="qzp-n">${page ? '▭' : qi}</span><span class="qzp-t">${esc(qText(q))}</span><span class="qzp-meta">${C.TYPES[q.t] ? esc(C.TYPES[q.t].name) : ''}${q.time && !page ? ` · ${q.time} s` : ''}${C.isScored(q) ? ` · ${fmtPts(q.points)} pts` : ''}</span></div>${ans}</div>`;
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
    const th = C.resolveTheme(dd.theme);
    return `<div class="qzprev">${qs.slice(0, 4).map((q, i) => `<div class="qzprev-q"><span class="qzprev-n" style="background:${th.pal[i % 6]};color:#fff">${q.t === 'info' ? '▭' : i + 1}</span><span>${esc((q.text || '').trim() || (C.TYPES[q.t] ? C.TYPES[q.t].name : '…'))}</span></div>`).join('')}${qs.length > 4 ? `<div class="qzprev-more">+ ${qs.length - 4} autre${qs.length - 4 > 1 ? 's' : ''}</div>` : ''}</div>`;
  }
  const count = dd => (Array.isArray(dd && dd.questions) ? dd.questions.length : 0);
  function search(dd, needle, max) {
    const want = String(needle || '').toLowerCase(); if (!want) return [];
    const out = [];
    for (const q of (Array.isArray(dd && dd.questions) ? dd.questions : [])) {
      const text = [q.text || '', q.body || '', ...(q.opts || []).map(o => o.text || ''), ...(q.pairs || []).map(p => `${p.l || ''} ${p.r || ''}`), ...(q.t === 'text' && Array.isArray(q.ans) ? q.ans : [])].join(' · ');
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

  return { newDoc, open, leave, remoteChanged, undo, redo, exportPDF, preview, count, search, reveal, startTest, startLive, openResults, openAppearance, isLive: () => !!live };
})();
