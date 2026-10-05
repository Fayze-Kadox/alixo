/* ============================================================
   Alixo — planches (1.23)
   Une planche est une séance particulière : { kind: 'board', items: [...], view: { x, y, z } }
   (d.blocks reste vide : synchronisation, onglets, bibliothèque, corbeille
   et partage n'ont rien de nouveau à connaître).

   Un tableau blanc infini (déplaçable, zoomable) sur lequel on pose :
   - des post-it   { t: 'note',  x, y, w, h, text, color (0-7), rot }
   - du texte      { t: 'text',  x, y, w, h (0 = auto), text, size ('s'|'m'|'l'), bold }
   - des images    { t: 'img',   x, y, w, h, iid, nw, nh }   (iid : image du magasin AlixoImages, comme ailleurs)
   - des blocs de cours épinglés { t: 'block', x, y, w, h (0 = auto), docId, blockId }
       copie en lecture seule d'un bloc d'une séance ; double-clic → ouvre la séance sur ce bloc
   - des flèches   { t: 'arrow', from: itemId, to: itemId, label }   (dessinées sous les éléments)
   Les coordonnées sont celles du plan ; l'ordre du tableau items = ordre d'empilement.
   view = { x, y, z } : translation et zoom affichés (conservés dans la fiche, l'appareil local garde le sien).

   Souris : glisser le fond (ou molette centrale, ou Espace + glisser) déplace la vue, molette fait défiler,
   Ctrl + molette zoome autour du curseur ; outil « Sélection » (ou Maj + glisser) : rectangle de sélection ;
   double-clic sur le fond : nouveau post-it.
   Raccourcis : Suppr / Retour supprimer, Ctrl+D dupliquer, Ctrl+Z / Ctrl+Y, Ctrl+A tout sélectionner,
   flèches déplacer de 10 px (Maj : 1 px), Entrée modifier le texte, Échap, Ctrl+P export PDF.

   Chargé APRÈS app.js : utilise ses globales (state, doc(), save(), openTabs, renderTabs,
   renderCrumbs, showLibrary, toast, esc, uid, folderTint, blockHTML, computeNumbers, AlixoImages,
   fileToImage, openDialog, showPopover…).
   ============================================================ */
'use strict';

window.AlixoBoard = (() => {
  const HIST_MAX = 60;
  const GRID = 10;
  const ZMIN = 0.2, ZMAX = 3;
  const NOTE_COLORS = ['#fff3a3', '#ffd6a5', '#ffc2c2', '#d9f2c9', '#c6e5ff', '#e2d4ff', '#ffd3ec', '#e9e9ec'];
  const NOTE_NAMES = ['Jaune', 'Orange', 'Rose', 'Vert', 'Bleu', 'Violet', 'Fuchsia', 'Gris'];
  const TEXT_SIZES = [['s', 'S', 'Petit'], ['m', 'M', 'Moyen'], ['l', 'L', 'Grand']];
  const BLOCK_NAMES = { h: 'Titre', p: 'Texte', li: 'Liste', callout: 'Encadré', quote: 'Citation', table: 'Tableau', img: 'Image', code: 'Code', math: 'Formule', graph: 'Graphique', draw: 'Dessin', hr: 'Séparateur' };

  const I = {
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    hand: '<svg viewBox="0 0 24 24"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 6a1.5 1.5 0 0 1 3 0v6M14 8a1.5 1.5 0 0 1 3 0v6M17 11a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.6-2.8L3.2 15a1.6 1.6 0 0 1 2.5-2L8 15.5"/></svg>',
    select: '<svg viewBox="0 0 24 24"><path d="M5 4h4M11 4h4M17 4h2v2M19 8v4M19 14v2M5 4v4M5 10v2"/><path d="m8 13 9 4-4 1-2 4Z"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11l-5 5H4Z"/><path d="M15 20v-5h5"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 9"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M4 20 20 4"/><path d="M11 4h9v9"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/></svg>',
    fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    front: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M4 15V5a1 1 0 0 1 1-1h10"/></svg>',
    back: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="11" rx="1.5"/><path d="M20 9v10a1 1 0 0 1-1 1H9"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    label: '<svg viewBox="0 0 24 24"><path d="M4 7h11l5 5-5 5H4Z"/></svg>',
    doc: '<svg class="dicon" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></svg>'
  };

  /* ---------------- état ---------------- */
  const d = () => (typeof doc === 'function' ? doc() : null);
  const itemsOf = dd => (Array.isArray(dd && dd.items) ? dd.items : (dd ? (dd.items = []) : []));
  const active = () => document.body.classList.contains('mode-board');
  const stage = () => $('#bd-stage');
  let view = { x: 0, y: 0, z: 1 };
  let sel = new Set();               // identifiants sélectionnés (éléments et flèches)
  let tool = 'pan';                  // 'pan' | 'select' | 'arrow'
  let arrowFrom = null;              // premier élément cliqué avec l'outil flèche
  let editing = null;                // identifiant de l'élément dont on modifie le texte
  let hist = { undo: [], redo: [] };
  let drag = null;                   // { kind: 'pan' | 'move' | 'resize' | 'rubber', ... }
  let spaceDown = false;
  let readOnly = false;
  let saveTm = null, viewTm = null, remoteTm = null;
  let bound = false;

  const item = id => itemsOf(d() || {}).find(i => i.id === id) || null;
  const isArrow = it => !!it && it.t === 'arrow';
  const noteColor = it => (typeof it.color === 'string' && it.color ? it.color : NOTE_COLORS[Math.max(0, Math.min(NOTE_COLORS.length - 1, +it.color || 0))]);
  const snap = (v, fine) => (fine ? Math.round(v) : Math.round(v / GRID) * GRID);
  const clampZ = z => Math.max(ZMIN, Math.min(ZMAX, z));
  function toCanvas(cx, cy) {
    const r = stage().getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z };
  }
  /* rectangle d'un élément (hauteur mesurée dans la page quand elle est automatique) */
  function rectOf(it) {
    if (!it || isArrow(it)) return null;
    let h = it.h;
    if (!(h > 0)) {
      const el = active() ? $(`#bd-items > .bd-item[data-id="${it.id}"]`) : null;
      h = el ? el.offsetHeight : (it.t === 'text' ? 40 : 160);
    }
    return { x: it.x, y: it.y, w: it.w, h };
  }
  function bboxOf(list, pad) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const it of list) {
      const r = rectOf(it); if (!r) continue;
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    }
    if (x1 === Infinity) return null;
    const p = pad || 0;
    return { x: x1 - p, y: y1 - p, w: x2 - x1 + 2 * p, h: y2 - y1 + 2 * p };
  }
  /* point du plan au centre de la zone visible */
  function centerPoint() {
    const st = stage();
    return toCanvas(st.getBoundingClientRect().left + st.clientWidth / 2, st.getBoundingClientRect().top + st.clientHeight / 2);
  }

  function newDoc(fid, prof) {
    return { id: uid(), kind: 'board', folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: prof || '', blocks: [], items: [], view: { x: 0, y: 0, z: 1 } };
  }
  function makeItem(t, x, y, extra) {
    const base = { id: uid(), t, x: Math.round(x), y: Math.round(y) };
    if (t === 'note') Object.assign(base, { w: 180, h: 180, text: '', color: 0 });
    else if (t === 'text') Object.assign(base, { w: 240, h: 0, text: '', size: 'm', bold: false });
    else if (t === 'img') Object.assign(base, { w: 320, h: 240, iid: '' });
    else if (t === 'block') Object.assign(base, { w: 360, h: 0, docId: '', blockId: '' });
    return Object.assign(base, extra || {});
  }

  /* ============================================================
     Ouverture / fermeture
     ============================================================ */
  async function open(id) {
    const dd = findDoc(id); if (!dd) return;
    if (currentDocId && currentDocId !== id && typeof rememberScroll === 'function') rememberScroll();
    if (typeof hidePopover === 'function') hidePopover();
    if (typeof closeCtxMenu === 'function') closeCtxMenu();
    if (window.AlixoSlides) AlixoSlides.leave();
    if (window.AlixoSheets) AlixoSheets.leave();
    currentDocId = id;
    const shared = typeof isSharedDoc === 'function' && isSharedDoc(id);
    readOnly = !!(shared && !(window.AlixoShare && AlixoShare.canWrite(id)));
    document.body.classList.toggle('readonly', readOnly);
    if (shared && window.AlixoShare && AlixoShare.noteOpened) AlixoShare.noteOpened(id);
    itemsOf(dd);
    const v = dd.view || {};
    view = { x: +v.x || 0, y: +v.y || 0, z: clampZ(+v.z || 1) };
    sel = new Set(); arrowFrom = null; editing = null; drag = null; hist = { undo: [], redo: [] };
    document.body.classList.remove('mode-editor', 'mode-slides', 'mode-sheet');
    document.body.classList.add('mode-board');
    $('#view-library').style.display = 'none';
    $('#view-editor').hidden = true;
    $('#toolbar').hidden = true;
    $('#view-board').hidden = false;
    document.documentElement.style.setProperty('--tint', folderTint(dd.folderId));
    if (typeof setSaveStatus === 'function') setSaveStatus('saved');
    if (!openTabs.includes(id)) openTabs.push(id);
    renderTabs(); renderCrumbs();
    if (typeof renderAccess === 'function') renderAccess();
    if (shared && window.AlixoShare) AlixoShare.setPresence(id, null);
    bind();
    setTool('pan');
    renderAll();
    stage().focus({ preventScroll: true });
    /* images pas encore en mémoire : on les charge puis on redessine */
    const iids = itemsOf(dd).filter(it => it.t === 'img' && it.iid && !AlixoImages.cache.has(it.iid)).map(it => it.iid);
    if (iids.length) {
      await Promise.all(iids.map(i => AlixoImages.get(i).catch(() => null)));
      if (currentDocId === id && active()) { renderItems(); renderArrows(); }
    }
  }
  function leave() {
    if (!active()) return;
    commitEdit();
    if (saveTm) { clearTimeout(saveTm); saveTm = null; commit(); }
    if (viewTm) { clearTimeout(viewTm); viewTm = null; saveView(); }
    document.body.classList.remove('mode-board');
    $('#view-board').hidden = true;
    drag = null; arrowFrom = null;
    const sb = $('#bd-selbar'); if (sb) sb.hidden = true;
  }
  /* version reçue d'un autre membre / appareil pendant que la planche est ouverte */
  function remoteChanged() {
    if (!active()) return;
    clearTimeout(remoteTm);
    if (editing || drag) { remoteTm = setTimeout(remoteChanged, 2000); return; }
    const dd = d(); if (!dd) return;
    dd.view = Object.assign({}, view);          // la vue reste celle de cet appareil
    const ids = new Set(itemsOf(dd).map(i => i.id));
    sel = new Set([...sel].filter(id => ids.has(id)));
    renderAll();
  }

  /* ---------------- enregistrement et historique ---------------- */
  function commit() {
    clearTimeout(saveTm); saveTm = null;
    const dd = d(); if (!dd || readOnly) return;
    dd.updatedAt = Date.now();
    dd.view = Object.assign({}, view);
    save();
  }
  function commitSoon() { clearTimeout(saveTm); saveTm = setTimeout(commit, 400); }
  /* la vue (position, zoom) est conservée sans « modifier » la planche (pas de nouvelle date) */
  function saveView() {
    clearTimeout(viewTm); viewTm = null;
    const dd = d(); if (!dd || readOnly) return;
    dd.view = Object.assign({}, view);
    save();
  }
  function saveViewSoon() { clearTimeout(viewTm); viewTm = setTimeout(saveView, 1500); }
  function pushHist() {
    const dd = d(); if (!dd || readOnly) return;
    hist.undo.push(JSON.stringify(itemsOf(dd)));
    if (hist.undo.length > HIST_MAX) hist.undo.shift();
    hist.redo.length = 0;
  }
  function undo() {
    const dd = d(); if (!dd || !active() || !hist.undo.length) return false;
    commitEdit();
    hist.redo.push(JSON.stringify(itemsOf(dd)));
    dd.items = JSON.parse(hist.undo.pop());
    afterRestore(dd); return true;
  }
  function redo() {
    const dd = d(); if (!dd || !active() || !hist.redo.length) return false;
    commitEdit();
    hist.undo.push(JSON.stringify(itemsOf(dd)));
    dd.items = JSON.parse(hist.redo.pop());
    afterRestore(dd); return true;
  }
  function afterRestore(dd) {
    const ids = new Set(itemsOf(dd).map(i => i.id));
    sel = new Set([...sel].filter(id => ids.has(id)));
    commit(); renderAll();
  }

  /* ============================================================
     Rendu
     ============================================================ */
  function renderAll() { renderBar(); applyView(); renderItems(); renderArrows(); renderSelbar(); renderStatus(); }
  function applyView() {
    const w = $('#bd-world'), st = stage(); if (!w || !st) return;
    w.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    const g = 24 * view.z;
    st.style.backgroundSize = `${g}px ${g}px`;
    st.style.backgroundPosition = `${view.x}px ${view.y}px`;
    const zb = $('#bd-bar [data-bd="z100"]'); if (zb) zb.textContent = Math.round(view.z * 100) + ' %';
  }
  function setTool(t) {
    tool = t; arrowFrom = null;
    const st = stage(); if (!st) return;
    st.classList.toggle('tool-select', t === 'select');
    st.classList.toggle('tool-arrow', t === 'arrow');
    $$('#bd-bar [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    $$('#bd-items .bd-item.src').forEach(el => el.classList.remove('src'));
    renderHint();
  }
  function renderHint() {
    const h = $('#bd-hint'); if (!h) return;
    if (tool !== 'arrow') { h.hidden = true; return; }
    h.hidden = false;
    h.textContent = arrowFrom ? 'Cliquez sur l’élément d’arrivée (Échap pour annuler)' : 'Flèche : cliquez sur l’élément de départ (Échap pour annuler)';
  }
  function renderBar() {
    const bar = $('#bd-bar'); const dd = d(); if (!bar || !dd) return;
    if (readOnly) {
      const info = window.AlixoShare && AlixoShare.infoFor ? AlixoShare.infoFor(dd.id) : null;
      bar.innerHTML = `<div class="bd-barl"><span class="bd-barlabel">Planche</span><span class="bd-ro">Partagée par <b>${esc(info ? info.owner : 'un membre')}</b> · lecture seule</span></div>
        <div class="bd-barr">
          <button data-bd="zout" title="Zoom arrière (Ctrl + molette)">${I.zoomOut}</button>
          <button data-bd="z100" class="bd-zoom" title="Revenir à 100 %">${Math.round(view.z * 100)} %</button>
          <button data-bd="zin" title="Zoom avant (Ctrl + molette)">${I.zoomIn}</button>
          <button data-bd="fit" title="Tout voir">${I.fit}<span class="bd-lbl">Tout voir</span></button>
          <span class="bd-sep"></span>
          <button data-bd="pdf" title="Exporter en PDF (Ctrl+P)">PDF</button>
        </div>`;
      return;
    }
    bar.innerHTML = `<div class="bd-barl">
      <button data-bd="undo" title="Annuler (Ctrl+Z)" ${hist.undo.length ? '' : 'disabled'}>${I.undo}</button>
      <button data-bd="redo" title="Rétablir (Ctrl+Y)" ${hist.redo.length ? '' : 'disabled'}>${I.redo}</button>
      <span class="bd-sep"></span>
      <button data-tool="pan" class="${tool === 'pan' ? 'on' : ''}" title="Main : glisser le fond déplace la vue (ou Espace + glisser)">${I.hand}</button>
      <button data-tool="select" class="${tool === 'select' ? 'on' : ''}" title="Sélection : glisser dessine un rectangle de sélection (ou Maj + glisser)">${I.select}</button>
      <span class="bd-sep"></span>
      <button data-bd="note" title="Nouveau post-it (ou double-clic sur le fond)">${I.note}<span class="bd-lbl">Post-it</span></button>
      <button data-bd="text" title="Texte libre, sans fond">${I.text}<span class="bd-lbl">Texte</span></button>
      <button data-bd="img" title="Image (fichier, ou collez / glissez une image sur la planche)">${I.image}<span class="bd-lbl">Image</span></button>
      <button data-bd="block" title="Épingler un bloc d’une de vos séances (copie en lecture seule ; double-clic : ouvrir la séance)">${I.pin}<span class="bd-lbl">Bloc de cours</span></button>
      <button data-tool="arrow" class="${tool === 'arrow' ? 'on' : ''}" title="Flèche : cliquez sur un premier élément puis sur un second">${I.arrow}<span class="bd-lbl">Flèche</span></button>
    </div>
    <div class="bd-barr">
      <button data-bd="zout" title="Zoom arrière (Ctrl + molette)">${I.zoomOut}</button>
      <button data-bd="z100" class="bd-zoom" title="Revenir à 100 %">${Math.round(view.z * 100)} %</button>
      <button data-bd="zin" title="Zoom avant (Ctrl + molette)">${I.zoomIn}</button>
      <button data-bd="fit" title="Tout voir : ajuste le zoom pour afficher tous les éléments">${I.fit}<span class="bd-lbl">Tout voir</span></button>
      <span class="bd-sep"></span>
      <button data-bd="pdf" title="Exporter en PDF (Ctrl+P)">PDF</button>
    </div>`;
  }
  function renderStatus() {
    const s = $('#bd-status'); const dd = d(); if (!s || !dd) return;
    const its = itemsOf(dd);
    const n = its.filter(i => !isArrow(i)).length, na = its.length - n;
    s.innerHTML = `<span>${n} élément${n > 1 ? 's' : ''}${na ? ` · ${na} flèche${na > 1 ? 's' : ''}` : ''}</span>` +
      (sel.size ? `<span>${sel.size} sélectionné${sel.size > 1 ? 's' : ''}</span>` : '') +
      `<span class="bd-tip">${readOnly ? 'Glissez le fond pour vous déplacer, Ctrl + molette pour zoomer' : 'Glissez le fond pour vous déplacer · Ctrl + molette : zoom · double-clic sur le fond : post-it · double-clic sur un texte : modifier'}</span>`;
  }

  /* séance et bloc visés par un bloc épinglé */
  function findBlock(dd, bid) {
    if (!dd) return null;
    const b = (dd.blocks || []).find(x => x.id === bid); if (b) return b;
    for (const p of (dd.pages || [])) { const q = (p.blocks || []).find(x => x.id === bid); if (q) return q; }
    return null;
  }
  const numCache = new Map();
  function pinnedHTML(it) {
    const src = typeof findDoc === 'function' ? findDoc(it.docId) : null;
    const b = findBlock(src, it.blockId);
    if (!src || !b) return `<div class="bd-bhead">${I.doc}<span>${esc(src ? (src.titre || 'Sans titre') : 'Séance supprimée')}</span></div><div class="bd-bmiss">Bloc introuvable</div>`;
    let numMap = numCache.get(src.id);
    if (!numMap) { numMap = typeof computeNumbers === 'function' ? computeNumbers(src.blocks || []) : {}; numCache.set(src.id, numMap); }
    let html = '';
    try { html = blockHTML(b, numMap); } catch (e) { console.error(e); html = `<div class="bd-bmiss">Bloc illisible</div>`; }
    return `<div class="bd-bhead" title="Double-clic : ouvrir la séance sur ce bloc">${I.doc}<span>${esc(src.titre || 'Sans titre')}</span></div><div class="bd-bbody" contenteditable="false">${html}</div>`;
  }
  /* HTML d'un élément ; off = décalage (export PDF), print = sans poignée ni sélection */
  function itemHTML(it, off, print) {
    const ox = off ? off.x : 0, oy = off ? off.y : 0;
    const base = `left:${it.x - ox}px;top:${it.y - oy}px;width:${it.w}px;${it.h > 0 ? `height:${it.h}px;` : ''}`;
    const cls = !print && sel.has(it.id) ? ' sel' : '';
    const handle = print || readOnly ? '' : '<span class="bd-handle" data-h="se" title="Redimensionner"></span>';
    switch (it.t) {
      case 'note':
        return `<div class="bd-item bd-note${cls}" data-id="${it.id}" style="${base}--nc:${esc(noteColor(it))};${it.rot ? `transform:rotate(${+it.rot}deg);` : ''}"><div class="bd-text">${esc(it.text || '')}</div>${handle}</div>`;
      case 'text':
        return `<div class="bd-item bd-txt size-${esc(it.size || 'm')}${it.bold ? ' bold' : ''}${cls}" data-id="${it.id}" style="${base}"><div class="bd-text">${esc(it.text || '')}</div>${handle}</div>`;
      case 'img': {
        const src = it.iid && AlixoImages.cache.get(it.iid);
        return `<div class="bd-item bd-img${cls}${src ? '' : ' loading'}" data-id="${it.id}" style="${base}">${src ? `<img src="${src}" alt="" draggable="false">` : `<div class="bd-imgph">${I.image}</div>`}${handle}</div>`;
      }
      case 'block':
        return `<div class="bd-item bd-block${cls}" data-id="${it.id}" style="${base}">${pinnedHTML(it)}${handle}</div>`;
    }
    return '';
  }
  function renderItems() {
    const box = $('#bd-items'); const dd = d(); if (!box || !dd) return;
    numCache.clear();
    box.innerHTML = itemsOf(dd).filter(it => !isArrow(it)).map(it => itemHTML(it)).join('');
    numCache.clear();
    /* images (de la planche ou des blocs épinglés) dont la donnée n'est pas encore en mémoire */
    box.querySelectorAll('.bd-img.loading').forEach(el => {
      const it = item(el.dataset.id); if (!it || !it.iid) return;
      AlixoImages.get(it.iid).then(v => { if (v && el.isConnected) { el.classList.remove('loading'); el.insertAdjacentHTML('afterbegin', `<img src="${v}" alt="" draggable="false">`); } });
    });
    box.querySelectorAll('.bd-bbody .imgbox.loading').forEach(ib => {
      const fig = ib.closest('.block'); const wrap = ib.closest('.bd-item'); if (!fig || !wrap) return;
      const it = item(wrap.dataset.id); const b = it ? findBlock(findDoc(it.docId), it.blockId) : null;
      if (!b || !b.iid) return;
      AlixoImages.get(b.iid).then(v => { if (v && ib.isConnected) { ib.classList.remove('loading'); ib.insertAdjacentHTML('afterbegin', `<img src="${v}" alt="" draggable="false">`); } });
    });
  }
  function renderSelClasses() {
    $$('#bd-items > .bd-item').forEach(el => el.classList.toggle('sel', sel.has(el.dataset.id)));
    $$('#bd-arrows .bd-arrow').forEach(el => el.classList.toggle('sel', sel.has(el.dataset.id)));
    renderStatus();
  }

  /* ---------------- flèches ---------------- */
  /* point du bord d'un rectangle sur la droite qui joint son centre à (tx, ty) */
  function edgePoint(r, tx, ty, gap) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const sx = dx ? (r.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    const len = Math.hypot(dx, dy) || 1;
    return { x: cx + dx * s + dx / len * (gap || 0), y: cy + dy * s + dy / len * (gap || 0) };
  }
  function arrowGeom(a) {
    const ra = rectOf(item(a.from)), rb = rectOf(item(a.to));
    if (!ra || !rb) return null;
    const p1 = edgePoint(ra, rb.x + rb.w / 2, rb.y + rb.h / 2, 4);
    const p2 = edgePoint(rb, ra.x + ra.w / 2, ra.y + ra.h / 2, 6);
    return { p1, p2, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
  }
  function arrowsHTML(dd, off, print, mk) {
    const ox = off ? off.x : 0, oy = off ? off.y : 0;
    const id = mk || 'bd-ah';
    let html = `<defs>
      <marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="ah"/></marker>
      <marker id="${id}-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="ah sel"/></marker></defs>`;
    for (const a of itemsOf(dd)) {
      if (!isArrow(a)) continue;
      const g = arrowGeom(a); if (!g) continue;
      const on = !print && sel.has(a.id);
      const dline = `M${(g.p1.x - ox).toFixed(1)} ${(g.p1.y - oy).toFixed(1)} L${(g.p2.x - ox).toFixed(1)} ${(g.p2.y - oy).toFixed(1)}`;
      let label = '';
      if (a.label) {
        const tw = Math.min(260, a.label.length * 7 + 16);
        label = `<rect x="${(g.mx - ox - tw / 2).toFixed(1)}" y="${(g.my - oy - 11).toFixed(1)}" width="${tw}" height="22" rx="5"/><text x="${(g.mx - ox).toFixed(1)}" y="${(g.my - oy).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(a.label.slice(0, 36))}</text>`;
      }
      html += `<g class="bd-arrow${on ? ' sel' : ''}" data-id="${a.id}">${print ? '' : `<path class="hit" d="${dline}"/>`}<path class="line" d="${dline}" marker-end="url(#${id}${on ? '-sel' : ''})"/>${label}</g>`;
    }
    return html;
  }
  function renderArrows() {
    const svg = $('#bd-arrows'); const dd = d(); if (!svg || !dd) return;
    svg.innerHTML = arrowsHTML(dd);
  }

  /* ---------------- barre flottante de la sélection ---------------- */
  function renderSelbar() {
    const sb = $('#bd-selbar'); if (!sb) return;
    const dd = d();
    const its = dd ? [...sel].map(item).filter(Boolean) : [];
    if (!its.length || readOnly || editing || (drag && drag.kind !== 'pan')) { sb.hidden = true; return; }
    const notes = its.filter(i => i.t === 'note'), texts = its.filter(i => i.t === 'text'), arrows = its.filter(isArrow), solids = its.filter(i => !isArrow(i));
    let html = '';
    if (notes.length) {
      const cur = notes.length === 1 ? noteColor(notes[0]) : '';
      html += NOTE_COLORS.map((c, i) => `<button data-sb="color" data-c="${i}" class="${cur === c ? 'on' : ''}" title="${NOTE_NAMES[i]}"><span class="bd-sw" style="background:${c}"></span></button>`).join('') +
        `<button data-sb="rot" title="Pencher légèrement (ou remettre droit)">⟳</button><span class="bd-sep"></span>`;
    }
    if (texts.length) {
      const cur = texts.length === 1 ? (texts[0].size || 'm') : '';
      html += TEXT_SIZES.map(([k, l, n]) => `<button data-sb="size" data-s="${k}" class="${cur === k ? 'on' : ''}" title="${n}">${l}</button>`).join('') +
        `<button data-sb="bold" class="${texts.every(t => t.bold) ? 'on' : ''}" title="Gras"><b>G</b></button><span class="bd-sep"></span>`;
    }
    if (its.length === 1 && (its[0].t === 'note' || its[0].t === 'text')) html += `<button data-sb="edit" title="Modifier le texte (Entrée ou double-clic)">Modifier</button>`;
    if (its.length === 1 && its[0].t === 'block') html += `<button data-sb="open" title="Ouvrir la séance sur ce bloc (double-clic)">${I.open}Ouvrir la séance</button>`;
    if (its.length === 1 && its[0].t === 'img') html += `<button data-sb="img" title="Remplacer l’image">${I.image}Remplacer</button>`;
    if (arrows.length === 1 && its.length === 1) html += `<button data-sb="label" title="Texte sur la flèche">${I.label}Libellé</button>`;
    if (solids.length) html += `<button data-sb="front" title="Mettre devant">${I.front}</button><button data-sb="back" title="Mettre derrière">${I.back}</button><button data-sb="dup" title="Dupliquer (Ctrl+D)">${I.dup}</button>`;
    html += `<button data-sb="del" class="danger" title="Supprimer (Suppr)">${I.trash}</button>`;
    sb.innerHTML = html;
    sb.hidden = false;
    /* au-dessus de la sélection (sinon en dessous), dans la zone visible */
    const st = stage();
    const bb = bboxOf(solids.length ? solids : its.map(a => item(a.from)).filter(Boolean), 0);
    let left = 12, top = 12;
    if (bb) {
      left = bb.x * view.z + view.x + (bb.w * view.z) / 2 - sb.offsetWidth / 2;
      top = bb.y * view.z + view.y - sb.offsetHeight - 12;
      if (top < 8) top = (bb.y + bb.h) * view.z + view.y + 12;
    }
    left = Math.max(8, Math.min(left, st.clientWidth - sb.offsetWidth - 8));
    top = Math.max(8, Math.min(top, st.clientHeight - sb.offsetHeight - 8));
    sb.style.left = left + 'px'; sb.style.top = top + 'px';
  }

  /* ============================================================
     Modifications
     ============================================================ */
  function selectOnly(id) { sel = new Set(id ? [id] : []); renderSelClasses(); renderSelbar(); }
  function addItem(it, edit) {
    const dd = d(); if (!dd || readOnly) return null;
    pushHist();
    itemsOf(dd).push(it);
    commit(); renderItems(); renderArrows(); renderBar();
    selectOnly(it.id);
    if (edit) startEdit(it.id);
    return it;
  }
  /* position d'un nouvel élément : centre de la vue, puis en cascade jusqu'à un endroit libre */
  function spawnPoint(w, h) {
    const c = centerPoint();
    const hh = h || 120;
    let x = snap(c.x - w / 2), y = snap(c.y - hh / 2);
    const its = itemsOf(d() || {});
    const busy = (px, py) => its.some(it => { const r = rectOf(it); return r && px < r.x + r.w && px + w > r.x && py < r.y + r.h && py + hh > r.y; });
    for (let k = 0; k < 40 && busy(x, y); k++) { x += 40; y += 40; }
    return { x, y };
  }
  function addNote(at) {
    const p = at || spawnPoint(180, 180);
    addItem(makeItem('note', p.x, p.y, { color: itemsOf(d() || {}).filter(i => i.t === 'note').length % NOTE_COLORS.length }), true);
  }
  function addText(at) {
    const p = at || spawnPoint(240, 40);
    addItem(makeItem('text', p.x, p.y), true);
  }
  async function addImages(files, at) {
    const dd = d(); if (!dd || readOnly) return;
    let k = 0;
    for (const f of files) {
      if (!f || !/^image\//.test(f.type)) continue;
      try {
        const im = await fileToImage(f);
        const iid = uid(); await AlixoImages.put(iid, im.data);
        const w = Math.max(120, Math.min(360, im.w)), h = Math.max(24, Math.round(w * im.h / im.w));   // ni minuscule ni envahissante
        const p = at ? { x: at.x + k * 24, y: at.y + k * 24 } : spawnPoint(w, h);
        if (currentDocId !== dd.id || !active()) return;
        addItem(makeItem('img', p.x, p.y, { w, h, iid, nw: im.w, nh: im.h }));
        k++;
      } catch (err) { console.error(err); toast('Image illisible'); }
    }
  }
  async function replaceImage(id, file) {
    const it = item(id); if (!it || it.t !== 'img' || readOnly || !file) return;
    try {
      const im = await fileToImage(file);
      const iid = uid(); await AlixoImages.put(iid, im.data);
      pushHist();
      it.iid = iid; it.nw = im.w; it.nh = im.h; it.h = Math.max(24, Math.round(it.w * im.h / im.w));
      commit(); renderItems(); renderArrows(); renderSelbar();
    } catch (err) { console.error(err); toast('Image illisible'); }
  }
  function pickImages(forId) {
    const inp = $('#bd-img-file'); if (!inp) return;
    inp.value = ''; inp.dataset.el = forId || ''; inp.click();
  }
  function addBlock(docId, blockId) {
    const p = spawnPoint(360, 160);
    addItem(makeItem('block', p.x, p.y, { docId, blockId }));
  }
  function deleteSel() {
    const dd = d(); if (!dd || readOnly || !sel.size) return;
    pushHist();
    const gone = new Set(sel);
    dd.items = itemsOf(dd).filter(it => !gone.has(it.id) && !(isArrow(it) && (gone.has(it.from) || gone.has(it.to))));
    sel = new Set();
    commit(); renderAll();
  }
  function duplicateSel() {
    const dd = d(); if (!dd || readOnly) return;
    const src = itemsOf(dd).filter(it => sel.has(it.id) && !isArrow(it));
    if (!src.length) return;
    pushHist();
    const map = new Map();
    const copies = src.map(it => { const c = JSON.parse(JSON.stringify(it)); c.id = uid(); c.x += 24; c.y += 24; map.set(it.id, c.id); return c; });
    /* les flèches entre deux éléments copiés sont copiées aussi */
    for (const a of itemsOf(dd)) if (isArrow(a) && map.has(a.from) && map.has(a.to)) copies.push({ id: uid(), t: 'arrow', from: map.get(a.from), to: map.get(a.to), label: a.label || '' });
    itemsOf(dd).push(...copies);
    sel = new Set(copies.filter(c => !isArrow(c)).map(c => c.id));
    commit(); renderAll();
  }
  function reorder(front) {
    const dd = d(); if (!dd || readOnly) return;
    const its = itemsOf(dd);
    const moved = its.filter(it => sel.has(it.id) && !isArrow(it)); if (!moved.length) return;
    pushHist();
    const rest = its.filter(it => !moved.includes(it));
    dd.items = front ? rest.concat(moved) : moved.concat(rest);
    commit(); renderItems(); renderArrows(); renderSelbar();
  }
  function patchSel(fn) {
    const dd = d(); if (!dd || readOnly) return;
    const its = itemsOf(dd).filter(it => sel.has(it.id)); if (!its.length) return;
    pushHist();
    its.forEach(fn);
    commit(); renderItems(); renderArrows(); renderSelbar();
  }
  function nudge(dx, dy) {
    const dd = d(); if (!dd || readOnly) return;
    const its = itemsOf(dd).filter(it => sel.has(it.id) && !isArrow(it)); if (!its.length) return;
    pushHist();
    its.forEach(it => { it.x += dx; it.y += dy; });
    commitSoon(); renderItems(); renderArrows(); renderSelbar();
  }
  function selectAll() {
    sel = new Set(itemsOf(d() || {}).map(i => i.id));
    renderSelClasses(); renderSelbar();
  }
  /* outil flèche : premier puis second élément */
  function arrowPick(id) {
    const dd = d(); if (!dd) return;
    if (!arrowFrom) {
      arrowFrom = id;
      $$('#bd-items .bd-item').forEach(el => el.classList.toggle('src', el.dataset.id === id));
      renderHint(); return;
    }
    if (id === arrowFrom) { toast('Choisissez un autre élément pour l’arrivée'); return; }
    if (itemsOf(dd).some(a => isArrow(a) && a.from === arrowFrom && a.to === id)) { toast('Cette flèche existe déjà'); setTool('pan'); return; }
    pushHist();
    const a = { id: uid(), t: 'arrow', from: arrowFrom, to: id, label: '' };
    itemsOf(dd).push(a);
    setTool('pan');
    commit(); renderArrows(); renderBar();
    selectOnly(a.id);
  }
  function editArrowLabel(id) {
    const a = item(id); if (!a || !isArrow(a) || readOnly) return;
    showPopover(`<h4>Texte de la flèche</h4><div class="po-row"><input id="po-bdlabel" value="${esc(a.label || '')}" placeholder="Ex. : implique, cause, voir aussi…" maxlength="36" spellcheck="false"><button class="pobtn" id="po-bdlabel-ok">OK</button></div>`,
      (typeof centerRect === 'function' ? centerRect() : { left: 200, top: 200, bottom: 200 }), pop => {
        const inp = pop.querySelector('#po-bdlabel');
        const ok = () => { pushHist(); a.label = inp.value.trim(); hidePopover(); commit(); renderArrows(); renderSelbar(); stage().focus({ preventScroll: true }); };
        pop.querySelector('#po-bdlabel-ok').addEventListener('click', ok);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        setTimeout(() => { inp.focus(); inp.select(); }, 40);
      });
  }

  /* ---------------- saisie du texte (post-it, texte libre) ---------------- */
  function startEdit(id) {
    const it = item(id); if (!it || readOnly || (it.t !== 'note' && it.t !== 'text')) return;
    if (editing && editing !== id) commitEdit();
    const el = $(`#bd-items > .bd-item[data-id="${id}"] .bd-text`); if (!el) return;
    editing = id;
    el.closest('.bd-item').classList.add('editing');
    el.contentEditable = 'true';
    el.focus();
    try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* rien à sélectionner */ }
    renderSelbar();
  }
  function commitEdit() {
    if (!editing) return;
    const id = editing; editing = null;
    const it = item(id);
    const el = $(`#bd-items > .bd-item[data-id="${id}"] .bd-text`);
    if (el) {
      const text = el.innerText.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
      el.contentEditable = 'false';
      el.closest('.bd-item').classList.remove('editing');
      if (it && text !== (it.text || '')) { pushHist(); it.text = text; commit(); }
    }
    renderItems(); renderArrows(); renderSelbar(); renderBar();
  }

  /* ouvre la séance d'un bloc épinglé, sur ce bloc */
  function openBlockDoc(it) {
    const src = typeof findDoc === 'function' ? findDoc(it.docId) : null;
    if (!src) { toast('Cette séance n’existe plus'); return; }
    const bid = it.blockId;
    openDoc(src.id);
    setTimeout(() => {
      const cur = d(); if (!cur || cur.id !== src.id) return;
      const pid = typeof pageOfBlock === 'function' ? pageOfBlock(cur, bid) : null;
      if (pid && pid !== cur.page && typeof switchPage === 'function') { switchPage(pid, bid); return; }
      const el = $(`#blocks > .block[data-id="${bid}"]`); if (!el) { toast('Bloc introuvable dans la séance'); return; }
      if (typeof scrollToBlockEl === 'function') scrollToBlockEl(el, { smooth: false, margin: 40 });
      el.classList.add('flash');
    }, 90);
  }

  /* ---------------- choix d'un bloc à épingler ---------------- */
  function openBlockPicker() {
    if (readOnly) return;
    const docs = (state.docs || []).filter(x => x.kind !== 'slides' && x.kind !== 'sheet' && x.kind !== 'board').slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const pathOf = x => (typeof folderPath === 'function' ? folderPath(x.folderId).map(f => f.nom).join(' › ') : '') || 'Mes cours';
    const groups = new Map();
    for (const x of docs) { const k = pathOf(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    const docsHTML = docs.length ? [...groups].map(([k, list]) => `<div class="bd-pf">${esc(k)}</div>` + list.map(x => `<button type="button" class="bd-pd" data-doc="${x.id}">${I.doc}<span>${esc(x.titre || 'Sans titre')}</span></button>`).join('')).join('')
      : '<div class="bd-pick-empty">Aucune séance : écrivez d’abord un cours, puis épinglez-en les blocs ici.</div>';
    openDialog({
      id: 'bd-pick', cls: 'wide', title: 'Épingler un bloc de cours',
      sub: 'Choisissez une séance puis le bloc à poser sur la planche : il reste lié au cours (double-clic sur la planche pour y retourner).',
      body: `<div class="bd-pick"><div class="bd-pick-docs">${docsHTML}</div><div class="bd-pick-blocks" id="bd-pick-blocks"><div class="bd-pick-empty">Sélectionnez une séance à gauche.</div></div></div>`,
      onMount: (card, close) => {
        const blocksBox = card.querySelector('#bd-pick-blocks');
        let curDoc = null;
        const showBlocks = x => {
          curDoc = x;
          card.querySelectorAll('.bd-pd').forEach(b => b.classList.toggle('cur', b.dataset.doc === x.id));
          const list = (x.blocks || []).filter(b => b.type !== 'hr');
          const plain = b => { try { return typeof blockPlain === 'function' ? blockPlain(b) : stripTags(b.text || ''); } catch { return ''; } };
          blocksBox.innerHTML = list.length ? list.map(b => {
            const t = plain(b).trim().slice(0, 160) || (b.type === 'img' ? 'Image' : b.type === 'table' ? 'Tableau' : b.type === 'draw' ? 'Dessin' : b.type === 'graph' ? 'Graphique' : '(vide)');
            return `<button type="button" class="bd-pb" data-block="${b.id}"><span class="bd-pbt">${esc(BLOCK_NAMES[b.type] || b.type)}</span><span class="txt">${esc(t)}</span></button>`;
          }).join('') : '<div class="bd-pick-empty">Cette séance est vide.</div>';
        };
        card.addEventListener('click', e => {
          const bd = e.target.closest('.bd-pd'); if (bd) { const x = docs.find(y => y.id === bd.dataset.doc); if (x) showBlocks(x); return; }
          const bb = e.target.closest('.bd-pb'); if (bb && curDoc) { close(); addBlock(curDoc.id, bb.dataset.block); }
        });
        if (docs.length === 1) showBlocks(docs[0]);
      }
    });
  }

  /* ---------------- vue : zoom, cadrage ---------------- */
  function zoomAt(z, px, py) {
    z = clampZ(z);
    const cx = (px - view.x) / view.z, cy = (py - view.y) / view.z;
    view.z = z; view.x = px - cx * z; view.y = py - cy * z;
    applyView(); renderSelbar(); saveViewSoon();
  }
  function zoomCenter(f) { const st = stage(); zoomAt(view.z * f, st.clientWidth / 2, st.clientHeight / 2); }
  function fitAll() {
    const dd = d(); const st = stage(); if (!dd || !st) return;
    const bb = bboxOf(itemsOf(dd), 40);
    if (!bb) { view = { x: 0, y: 0, z: 1 }; applyView(); saveViewSoon(); return; }
    const z = clampZ(Math.min(st.clientWidth / bb.w, st.clientHeight / bb.h, 1.5));
    view.z = z; view.x = (st.clientWidth - bb.w * z) / 2 - bb.x * z; view.y = (st.clientHeight - bb.h * z) / 2 - bb.y * z;
    applyView(); renderSelbar(); saveViewSoon();
  }

  /* ============================================================
     Interactions
     ============================================================ */
  function bind() {
    if (bound) return; bound = true;
    const st = stage();

    $('#bd-bar').addEventListener('click', e => {
      const t = e.target.closest('[data-tool]');
      if (t) { if (readOnly) return; commitEdit(); setTool(tool === t.dataset.tool && t.dataset.tool !== 'pan' ? 'pan' : t.dataset.tool); return; }
      const b = e.target.closest('[data-bd]'); if (!b) return;
      const k = b.dataset.bd;
      if (k === 'undo') { undo(); return; } if (k === 'redo') { redo(); return; }
      if (k === 'pdf') { exportPDF(); return; }
      if (k === 'zin') { zoomCenter(1.25); return; } if (k === 'zout') { zoomCenter(0.8); return; }
      if (k === 'z100') { const s = stage(); zoomAt(1, s.clientWidth / 2, s.clientHeight / 2); return; }
      if (k === 'fit') { fitAll(); return; }
      if (readOnly) return;
      commitEdit();
      if (k === 'note') addNote(); else if (k === 'text') addText(); else if (k === 'img') pickImages(); else if (k === 'block') openBlockPicker();
    });

    $('#bd-selbar').addEventListener('pointerdown', e => e.stopPropagation());
    $('#bd-selbar').addEventListener('click', e => {
      const b = e.target.closest('[data-sb]'); if (!b || readOnly) return;
      const k = b.dataset.sb;
      const one = sel.size === 1 ? item([...sel][0]) : null;
      if (k === 'color') patchSel(it => { if (it.t === 'note') it.color = +b.dataset.c; });
      else if (k === 'rot') patchSel(it => { if (it.t === 'note') it.rot = it.rot ? 0 : (Math.random() < 0.5 ? -2.5 : 2.5); });
      else if (k === 'size') patchSel(it => { if (it.t === 'text') it.size = b.dataset.s; });
      else if (k === 'bold') { const all = [...sel].map(item).filter(it => it && it.t === 'text').every(it => it.bold); patchSel(it => { if (it.t === 'text') it.bold = !all; }); }
      else if (k === 'edit' && one) startEdit(one.id);
      else if (k === 'open' && one) openBlockDoc(one);
      else if (k === 'img' && one) pickImages(one.id);
      else if (k === 'label' && one) editArrowLabel(one.id);
      else if (k === 'front') reorder(true); else if (k === 'back') reorder(false);
      else if (k === 'dup') duplicateSel(); else if (k === 'del') deleteSel();
      if (!editing) st.focus({ preventScroll: true });
    });

    /* ---- souris / doigt sur la scène ---- */
    st.addEventListener('pointerdown', e => {
      if (e.button === 2) return;
      if (editing) {
        if (e.target.closest(`.bd-item[data-id="${editing}"]`)) return;   // on continue de taper
        commitEdit();
      }
      const itemEl = e.target.closest('.bd-item');
      const arrowEl = e.target.closest('.bd-arrow');
      const handle = e.target.closest('.bd-handle');
      const pan = e.button === 1 || spaceDown || (!itemEl && !arrowEl && tool !== 'select' && !e.shiftKey);
      if (handle && itemEl && !readOnly) {
        const it = item(itemEl.dataset.id); if (!it) return;
        if (!sel.has(it.id)) selectOnly(it.id);
        const r = rectOf(it);
        drag = { kind: 'resize', id: it.id, sx: e.clientX, sy: e.clientY, w: it.w, h: r.h, auto: !(it.h > 0), moved: false };
      } else if (pan) {
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
        st.classList.add('panning');
      } else if (itemEl) {
        const id = itemEl.dataset.id;
        if (tool === 'arrow' && !readOnly) { arrowPick(id); return; }
        if (e.shiftKey) { if (sel.has(id)) sel.delete(id); else sel.add(id); }
        else if (!sel.has(id)) sel = new Set([id]);
        renderSelClasses(); renderSelbar();
        if (!readOnly && sel.has(id)) {
          const start = new Map();
          for (const sid of sel) { const it = item(sid); if (it && !isArrow(it)) start.set(sid, { x: it.x, y: it.y }); }
          drag = { kind: 'move', sx: e.clientX, sy: e.clientY, start, moved: false };
        }
      } else if (arrowEl) {
        const id = arrowEl.dataset.id;
        if (e.shiftKey) { if (sel.has(id)) sel.delete(id); else sel.add(id); } else sel = new Set([id]);
        renderSelClasses(); renderSelbar();
      } else {
        if (tool === 'arrow') setTool('pan');
        const keep = e.shiftKey ? new Set(sel) : new Set();
        sel = new Set(keep); renderSelClasses(); renderSelbar();
        const p = toCanvas(e.clientX, e.clientY);
        drag = { kind: 'rubber', sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, keep };
      }
      if (drag) { try { st.setPointerCapture(e.pointerId); } catch { /* capture impossible */ } }
      st.focus({ preventScroll: true });
      e.preventDefault();
    });
    st.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (drag.kind === 'pan') { view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); renderSelbar(); return; }
      if (drag.kind === 'move') {
        if (!drag.moved) { if (Math.hypot(dx, dy) < 3) return; drag.moved = true; pushHist(); renderSelbar(); }
        for (const [id, s] of drag.start) {
          const it = item(id); if (!it) continue;
          it.x = snap(s.x + dx / view.z, e.altKey); it.y = snap(s.y + dy / view.z, e.altKey);
          const el = $(`#bd-items > .bd-item[data-id="${id}"]`); if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
        }
        renderArrows(); return;
      }
      if (drag.kind === 'resize') {
        const it = item(drag.id); if (!it) return;
        if (!drag.moved) { drag.moved = true; pushHist(); renderSelbar(); }
        const minW = it.t === 'text' ? 60 : 40;
        let w = Math.max(minW, snap(drag.w + dx / view.z, e.altKey));
        let h = Math.max(24, snap(drag.h + dy / view.z, e.altKey));
        if (it.t === 'img' && it.nw && it.nh && !e.shiftKey) h = Math.max(24, Math.round(w * it.nh / it.nw));
        it.w = w;
        if (it.t === 'text') { if (Math.abs(dy) > 6 || !drag.auto) it.h = h; }
        else it.h = h;
        const el = $(`#bd-items > .bd-item[data-id="${it.id}"]`);
        if (el) { el.style.width = it.w + 'px'; el.style.height = it.h > 0 ? it.h + 'px' : ''; }
        renderArrows(); return;
      }
      if (drag.kind === 'rubber') {
        const rb = $('#bd-rubber'); const r = st.getBoundingClientRect();
        const x1 = Math.min(drag.sx, e.clientX) - r.left, y1 = Math.min(drag.sy, e.clientY) - r.top;
        rb.hidden = false; rb.style.left = x1 + 'px'; rb.style.top = y1 + 'px'; rb.style.width = Math.abs(dx) + 'px'; rb.style.height = Math.abs(dy) + 'px';
        const p = toCanvas(e.clientX, e.clientY);
        const bx1 = Math.min(drag.px, p.x), by1 = Math.min(drag.py, p.y), bx2 = Math.max(drag.px, p.x), by2 = Math.max(drag.py, p.y);
        sel = new Set(drag.keep);
        for (const it of itemsOf(d() || {})) {
          const rc = rectOf(it); if (!rc) continue;
          if (rc.x < bx2 && rc.x + rc.w > bx1 && rc.y < by2 && rc.y + rc.h > by1) sel.add(it.id);
        }
        renderSelClasses();
      }
    });
    const endDrag = e => {
      if (!drag) return;
      const dg = drag; drag = null;
      st.classList.remove('panning');
      if (dg.kind === 'pan') saveViewSoon();
      if ((dg.kind === 'move' || dg.kind === 'resize') && dg.moved) commit();
      if (dg.kind === 'rubber') $('#bd-rubber').hidden = true;
      renderSelbar(); renderBar();
      if (e && e.pointerId !== undefined) { try { st.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ } }
    };
    st.addEventListener('pointerup', endDrag);
    st.addEventListener('pointercancel', endDrag);

    st.addEventListener('dblclick', e => {
      /* la scène capture le pointeur pendant le clic : le double-clic lui est renvoyé, on retrouve l'élément visé par sa position */
      const at = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      const itemEl = at.closest('.bd-item');
      const arrowEl = at.closest('.bd-arrow');
      if (itemEl) {
        const it = item(itemEl.dataset.id); if (!it) return;
        if (it.t === 'block') { openBlockDoc(it); return; }
        if (readOnly) return;
        if (it.t === 'img') { pickImages(it.id); return; }
        if (!sel.has(it.id)) selectOnly(it.id);
        startEdit(it.id); return;
      }
      if (arrowEl) { if (!readOnly) editArrowLabel(arrowEl.dataset.id); return; }
      if (readOnly || at.closest('#bd-selbar, #bd-hint')) return;
      const p = toCanvas(e.clientX, e.clientY);
      addNote({ x: snap(p.x - 90), y: snap(p.y - 90) });
    });

    st.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = st.getBoundingClientRect();
        zoomAt(view.z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      } else {
        const k = e.deltaMode === 1 ? 24 : 1;
        if (e.shiftKey && !e.deltaX) view.x -= e.deltaY * k; else { view.x -= e.deltaX * k; view.y -= e.deltaY * k; }
        applyView(); renderSelbar(); saveViewSoon();
      }
    }, { passive: false });

    /* images : fichier choisi, collage, glisser-déposer */
    $('#bd-img-file').addEventListener('change', e => {
      const files = [...(e.target.files || [])]; const forId = e.target.dataset.el;
      if (!files.length) return;
      if (forId) replaceImage(forId, files[0]); else addImages(files);
    });
    st.addEventListener('dragover', e => { if (readOnly) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    st.addEventListener('drop', e => {
      if (readOnly) return;
      const files = [...(e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type));
      if (!files.length) return;
      e.preventDefault();
      const p = toCanvas(e.clientX, e.clientY);
      addImages(files, { x: snap(p.x), y: snap(p.y) });
    });
    document.addEventListener('paste', e => {
      if (!active() || readOnly || $('.dlgov') || !$('#popover').hidden) return;
      if (editing) {
        /* texte brut seulement dans un post-it */
        if (!e.target.closest('#bd-items')) return;
        e.preventDefault();
        const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, txt);
        return;
      }
      if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
      const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); addImages(files); return; }
      const txt = ((e.clipboardData || window.clipboardData).getData('text/plain') || '').trim();
      if (txt) { e.preventDefault(); const p = spawnPoint(180, 180); addItem(makeItem('note', p.x, p.y, { text: txt.slice(0, 2000), color: itemsOf(d() || {}).filter(i => i.t === 'note').length % NOTE_COLORS.length })); }
    });

    /* fin de saisie quand le champ perd le focus */
    $('#bd-items').addEventListener('focusout', e => {
      if (!editing || !e.target.classList || !e.target.classList.contains('bd-text')) return;
      setTimeout(() => { if (editing && document.activeElement !== e.target) commitEdit(); }, 0);
    });
    $('#bd-items').addEventListener('keydown', e => {
      if (!editing || !e.target.closest('.bd-text')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commitEdit(); st.focus({ preventScroll: true }); return; }
      if (e.key === 'Tab') { e.preventDefault(); commitEdit(); st.focus({ preventScroll: true }); return; }
      e.stopPropagation();   // les raccourcis de la planche ne s'appliquent pas pendant la saisie
    });

    /* ---- clavier ---- */
    document.addEventListener('keydown', e => {
      if (!active() || editing) return;
      if ($('.dlgov') || !$('#popover').hidden) return;
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === ' ' && !mod) { if (!spaceDown) { spaceDown = true; st.classList.add('space'); } e.preventDefault(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (tool !== 'pan') setTool('pan');
        else if (sel.size) { sel = new Set(); renderSelClasses(); renderSelbar(); }
        return;
      }
      if (mod && key === 'p') { e.preventDefault(); exportPDF(); return; }
      if (mod && key === 'w' && typeof closeTab === 'function') { e.preventDefault(); closeTab(currentDocId); return; }
      if (e.altKey && e.key === 'ArrowLeft' && !mod) { e.preventDefault(); showLibrary(); return; }
      if (mod && (key === '+' || key === '=')) { e.preventDefault(); zoomCenter(1.25); return; }
      if (mod && key === '-') { e.preventDefault(); zoomCenter(0.8); return; }
      if (mod && key === '0') { e.preventDefault(); fitAll(); return; }
      if (mod && key === 'a') { e.preventDefault(); selectAll(); return; }
      if (readOnly) return;
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && key === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.size) { e.preventDefault(); deleteSel(); } return; }
      if (e.key === 'Enter' && sel.size === 1) { const it = item([...sel][0]); if (it && (it.t === 'note' || it.t === 'text')) { e.preventDefault(); startEdit(it.id); } else if (it && it.t === 'block') { e.preventDefault(); openBlockDoc(it); } return; }
      if (e.key.startsWith('Arrow') && sel.size && !mod) {
        e.preventDefault();
        const s = e.shiftKey ? 1 : GRID;
        nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
        return;
      }
      if (!mod && !e.altKey && sel.size === 0) {
        if (key === 'n') { e.preventDefault(); addNote(); } else if (key === 't') { e.preventDefault(); addText(); } else if (key === 'v') { e.preventDefault(); setTool('select'); } else if (key === 'h') { e.preventDefault(); setTool('pan'); } else if (key === 'f') { e.preventDefault(); setTool('arrow'); }
      }
    });
    document.addEventListener('keyup', e => { if (e.key === ' ' && spaceDown) { spaceDown = false; st.classList.remove('space'); } });
    window.addEventListener('blur', () => { spaceDown = false; st.classList.remove('space'); });
    window.addEventListener('resize', () => { if (active()) renderSelbar(); });
  }

  /* ============================================================
     Export PDF (paysage : la planche entière, ajustée à la page)
     ============================================================ */
  function printHTML(dd) {
    const its = itemsOf(dd).filter(it => !isArrow(it));
    const title = dd.titre || 'Planche';
    if (!its.length) return `<h2>${esc(title)}</h2><div class="bdp-empty">Planche vide</div>`;
    const bb = bboxOf(itemsOf(dd), 30);
    const PW = 1040, PH = 660;
    const k = Math.min(PW / bb.w, PH / bb.h, 1.2);
    const off = { x: bb.x, y: bb.y };
    return `<h2>${esc(title)}</h2><div class="bdp-box" style="width:${Math.round(bb.w * k)}px;height:${Math.round(bb.h * k)}px"><div class="bdp-world" style="transform:scale(${k.toFixed(4)});width:${Math.round(bb.w)}px;height:${Math.round(bb.h)}px"><svg class="bd-arrows" xmlns="http://www.w3.org/2000/svg">${arrowsHTML(dd, off, true, 'bdp-ah')}</svg>${its.map(it => itemHTML(it, off, true)).join('')}</div></div>`;
  }
  let pdfBusy = false;
  async function exportPDF() {
    if (pdfBusy) return;
    const dd = d(); if (!dd || !active()) return;
    commitEdit();
    const box = $('#bd-print'); if (!box) return;
    numCache.clear();
    box.innerHTML = printHTML(dd);
    numCache.clear();
    const title = dd.titre || 'Planche';
    document.title = title + ' — Alixo';
    document.body.classList.add('printing-board');
    const desk = window.alixoDesktop;
    const done = () => { document.body.classList.remove('printing-board'); box.innerHTML = ''; document.title = 'Alixo — Cockpit d’amphi'; };
    if (!desk || !desk.printToPDF || !desk.saveFile) { try { print(); } finally { done(); } return; }
    pdfBusy = true;
    toast('Préparation du PDF…', { duration: 4000 });
    let pdf = null, err = null;
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      pdf = await desk.printToPDF({ sheet: true, title });
    } catch (e) { err = e; }
    done(); pdfBusy = false;
    if (!pdf || err) { console.error(err); toast('Export PDF impossible' + (err && err.message ? ' : ' + err.message : '')); return; }
    const r = await desk.saveFile({ name: safeFileName(title) + '.pdf', data: pdf, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r && r.ok) toast(`PDF enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
    else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
  }

  /* ---------------- aperçu pour la bibliothèque ---------------- */
  function preview(dd) {
    const its = (Array.isArray(dd && dd.items) ? dd.items : []).filter(it => !isArrow(it));
    if (!its.length) return '<span class="sp-empty">Planche vide</span>';
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const hOf = it => (it.h > 0 ? it.h : (it.t === 'text' ? 40 : 160));
    for (const it of its) { x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y); x2 = Math.max(x2, it.x + it.w); y2 = Math.max(y2, it.y + hOf(it)); }
    /* la boîte est ramenée aux proportions de l'aperçu (≈ 2,6 : 1) pour ne pas déformer les éléments */
    let w = Math.max(60, x2 - x1) * 1.12, h = Math.max(40, y2 - y1) * 1.12;
    const R = 2.6;
    if (w / h < R) w = h * R; else h = w / R;
    const ox = (x1 + x2) / 2 - w / 2, oy = (y1 + y2) / 2 - h / 2;
    return `<div class="bdprev">${its.slice(0, 60).map(it => {
      const l = ((it.x - ox) / w * 100).toFixed(1), t = ((it.y - oy) / h * 100).toFixed(1);
      const ww = (it.w / w * 100).toFixed(1), hh = (hOf(it) / h * 100).toFixed(1);
      return `<i class="bp-${it.t}" style="left:${l}%;top:${t}%;width:${ww}%;height:${hh}%${it.t === 'note' ? `;background:${esc(noteColor(it))}` : ''}"></i>`;
    }).join('')}</div>`;
  }
  const itemCount = dd => (Array.isArray(dd && dd.items) ? dd.items : []).filter(it => !isArrow(it)).length;

  /* recherche universelle : post-it, textes, libellés de flèches et blocs épinglés */
  function search(dd, needle, max) {
    const want = String(needle || '').toLowerCase();
    if (!want) return [];
    const out = [];
    const list = Array.isArray(dd && dd.items) ? dd.items : [];
    for (const it of list) {
      let text = '';
      if (it.t === 'note' || it.t === 'text') text = it.text || '';
      else if (isArrow(it)) text = it.label || '';
      else if (it.t === 'block') { const b = findBlock(typeof findDoc === 'function' ? findDoc(it.docId) : null, it.blockId); if (b) { try { text = typeof blockPlain === 'function' ? blockPlain(b) : stripTags(b.text || ''); } catch { text = ''; } } }
      const i = text.toLowerCase().indexOf(want);
      if (i < 0) continue;
      const start = Math.max(0, i - 30);
      out.push({ itemId: it.id, text: (start > 0 ? '…' : '') + text.slice(start, i + want.length + 60).replace(/\s+/g, ' ') });
      if (out.length >= (max || 12)) break;
    }
    return out;
  }
  /* centre la vue sur un élément et le sélectionne (résultat de recherche) */
  function reveal(itemId) {
    const dd = d(); if (!dd || !active()) return;
    const it = item(itemId); if (!it) return;
    const st = stage();
    const r = rectOf(it) || rectOf(item(it.from));
    if (r) {
      if (view.z < 0.8) view.z = 1;
      view.x = st.clientWidth / 2 - (r.x + r.w / 2) * view.z; view.y = st.clientHeight / 2 - (r.y + r.h / 2) * view.z;
      applyView(); saveViewSoon();
    }
    selectOnly(it.id);
    const el = $(`#bd-items > .bd-item[data-id="${it.id}"]`); if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); }
  }

  return { newDoc, open, leave, remoteChanged, undo, redo, exportPDF, preview, itemCount, search, reveal };
})();
