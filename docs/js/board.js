/* ============================================================
   Alixo — planches (1.23, refonte 1.25)
   Une planche est une séance particulière : { kind: 'board', items: [...], view: { x, y, z }, bg }
   (d.blocks reste vide : synchronisation, onglets, bibliothèque, corbeille
   et partage n'ont rien de nouveau à connaître).

   Un tableau blanc infini (déplaçable, zoomable) sur lequel on pose :
   - des post-it   { t: 'note',  x, y, w, h, text, color (0-8), rot, size ('s'|'m'|'l') }
   - du texte      { t: 'text',  x, y, w, h (0 = auto), text, size ('s'|'m'|'l'|'xl'), bold, color (0-7), align ('l'|'c'|'r') }
   - des formes    { t: 'shape', x, y, w, h, kind ('rect'|'round'|'pill'|'ellipse'|'diamond'|'hex'|'tri'), color, text }
   - des zones     { t: 'zone',  x, y, w, h, title, color }   (cadres nommés, dessinés sous les autres éléments ;
       déplacer une zone emporte ce qu'elle contient)
   - des images    { t: 'img',   x, y, w, h, iid, nw, nh }   (iid : image du magasin AlixoImages, comme ailleurs)
   - des liens     { t: 'link',  x, y, w, h (0 = auto), url, title }
   - des listes    { t: 'list',  x, y, w, h (0 = auto), title, items: [{ id, text, done }] }
   - des stickers  { t: 'sticker', x, y, w, h, emoji }
   - des fiches de séance { t: 'doc', x, y, w, h (0 = auto), docId }   (carte d'une séance entière ; double-clic : l'ouvre)
   - des blocs de cours épinglés { t: 'block', x, y, w, h (0 = auto), docId, blockId }
       copie en lecture seule d'un bloc d'une séance ; double-clic → ouvre la séance sur ce bloc
   - des flèches   { t: 'arrow', from: itemId, to: itemId, label, dash, dir ('end'|'both'|'none'), curve, color }
       (dessinées sous les éléments)
   Tout élément peut être verrouillé { locked: true } : il ne bouge plus et ne se redimensionne plus.
   Les coordonnées sont celles du plan ; l'ordre du tableau items = ordre d'empilement (les zones restent dessous).
   view = { x, y, z } : translation et zoom affichés (conservés dans la fiche, l'appareil local garde le sien).
   bg = 'dots' | 'grid' | 'plain' : fond de la planche.

   Souris : glisser le fond (ou molette centrale, ou Espace + glisser) déplace la vue, molette fait défiler,
   Ctrl + molette zoome autour du curseur ; outil « Sélection » (ou Maj + glisser) : rectangle de sélection ;
   double-clic sur le fond : nouveau post-it ; clic droit : menu.
   Raccourcis : Suppr / Retour supprimer, Ctrl+D dupliquer, Ctrl+Z / Ctrl+Y, Ctrl+A tout sélectionner,
   flèches déplacer de 10 px (Maj : 1 px), Entrée modifier / ouvrir, Échap, Ctrl+P export PDF, F11 présentation ;
   N post-it, T texte, S forme, Z zone, L lien, K liste, E sticker, F flèche, V sélection, H main, M modèles.

   Chargé APRÈS app.js : utilise ses globales (state, doc(), save(), openTabs, renderTabs,
   renderCrumbs, showLibrary, toast, esc, uid, folderTint, blockHTML, computeNumbers, AlixoImages,
   fileToImage, openDialog, showPopover…).
   ============================================================ */
'use strict';

window.AlixoBoard = (() => {
  const HIST_MAX = 60;
  const GRID = 10;
  const ZMIN = 0.2, ZMAX = 3;
  const NOTE_COLORS = ['#fff3a3', '#ffd6a5', '#ffc2c2', '#d9f2c9', '#c6e5ff', '#e2d4ff', '#ffd3ec', '#e9e9ec', '#ffffff'];
  const NOTE_NAMES = ['Jaune', 'Orange', 'Rose', 'Vert', 'Bleu', 'Violet', 'Fuchsia', 'Gris', 'Blanc'];
  const INK_COLORS = ['', '#b0483f', '#b3762a', '#2f7d68', '#3d6bb5', '#7a5ca8', '#c25b82', '#80868b'];
  const INK_NAMES = ['Encre', 'Rouge', 'Ambre', 'Vert', 'Bleu', 'Violet', 'Rose', 'Gris'];
  const TEXT_SIZES = [['s', 'S', 'Petit'], ['m', 'M', 'Moyen'], ['l', 'L', 'Grand'], ['xl', 'XL', 'Très grand']];
  const NOTE_SIZES = [['s', 'S', 'Petit'], ['m', 'M', 'Moyen'], ['l', 'L', 'Grand']];
  const SHAPE_KINDS = [['round', 'Rectangle arrondi'], ['rect', 'Rectangle'], ['pill', 'Capsule'], ['ellipse', 'Ellipse'], ['diamond', 'Losange'], ['hex', 'Hexagone'], ['tri', 'Triangle']];
  const STICKERS = ['⭐', '✅', '❌', '❓', '❗', '💡', '🔥', '📌', '⚖️', '📚', '🧠', '🎯', '⏳', '💶', '📈', '📉', '🏛️', '🩺', '⚽', '🎓', '👍', '👎', '➡️', '🔁', '🔑', '🧩', '🗓️', '🏆'];
  const BLOCK_NAMES = { h: 'Titre', p: 'Texte', li: 'Liste', callout: 'Encadré', quote: 'Citation', table: 'Tableau', img: 'Image', code: 'Code', math: 'Formule', graph: 'Graphique', draw: 'Dessin', hr: 'Séparateur' };
  const KIND_NAMES = { slides: 'Présentation', sheet: 'Tableur', board: 'Planche', quiz: 'Quiz' };
  const BGS = [['dots', 'Points'], ['grid', 'Lignes'], ['plain', 'Uni']];

  const I = {
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    hand: '<svg viewBox="0 0 24 24"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 6a1.5 1.5 0 0 1 3 0v6M14 8a1.5 1.5 0 0 1 3 0v6M17 11a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.6-2.8L3.2 15a1.6 1.6 0 0 1 2.5-2L8 15.5"/></svg>',
    select: '<svg viewBox="0 0 24 24"><path d="M5 4h4M11 4h4M17 4h2v2M19 8v4M19 14v2M5 4v4M5 10v2"/><path d="m8 13 9 4-4 1-2 4Z"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11l-5 5H4Z"/><path d="M15 20v-5h5"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
    shape: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="10" height="10" rx="2"/><circle cx="16" cy="16" r="5"/></svg>',
    zone: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2" stroke-dasharray="3 2"/><path d="M7 5V3h5"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 9"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="6" rx="1.2"/><path d="m4.5 7 1.4 1.4L8.5 5.6M11 7h10M11 17h10"/><rect x="3" y="14" width="6" height="6" rx="1.2"/></svg>',
    sticker: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M4 20 20 4"/><path d="M11 4h9v9"/></svg>',
    tpl: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13v8M13 17h8"/></svg>',
    present: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8M10 8l4 2-4 2Z"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/></svg>',
    fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    front: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M4 15V5a1 1 0 0 1 1-1h10"/></svg>',
    back: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="11" rx="1.5"/><path d="M20 9v10a1 1 0 0 1-1 1H9"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    label: '<svg viewBox="0 0 24 24"><path d="M4 7h11l5 5-5 5H4Z"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg>',
    doc: '<svg class="dicon" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    dash: '<svg viewBox="0 0 24 24"><path d="M4 12h3M10 12h4M17 12h3"/></svg>',
    both: '<svg viewBox="0 0 24 24"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>',
    curve: '<svg viewBox="0 0 24 24"><path d="M4 18c4-12 12-12 16 0"/></svg>',
    alL: '<svg viewBox="0 0 24 24"><path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/></svg>',
    alC: '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/></svg>',
    alR: '<svg viewBox="0 0 24 24"><path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/></svg>',
    alT: '<svg viewBox="0 0 24 24"><path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/></svg>',
    alM: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/></svg>',
    alB: '<svg viewBox="0 0 24 24"><path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/></svg>',
    disH: '<svg viewBox="0 0 24 24"><path d="M3 4v16M21 4v16"/><rect x="7" y="8" width="3" height="8" rx="1"/><rect x="14" y="8" width="3" height="8" rx="1"/></svg>',
    disV: '<svg viewBox="0 0 24 24"><path d="M4 3h16M4 21h16"/><rect x="8" y="7" width="8" height="3" rx="1"/><rect x="8" y="14" width="8" height="3" rx="1"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
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
  let presenting = false;
  let saveTm = null, viewTm = null, remoteTm = null, mmTm = null;
  let bound = false;

  const item = id => itemsOf(d() || {}).find(i => i.id === id) || null;
  const isArrow = it => !!it && it.t === 'arrow';
  const isZone = it => !!it && it.t === 'zone';
  const hasText = it => !!it && (it.t === 'note' || it.t === 'text' || it.t === 'shape');
  const noteColor = it => (typeof it.color === 'string' && it.color ? it.color : NOTE_COLORS[Math.max(0, Math.min(NOTE_COLORS.length - 1, +it.color || 0))]);
  const inkColor = idx => INK_COLORS[Math.max(0, Math.min(INK_COLORS.length - 1, +idx || 0))];
  const snap = (v, fine) => (fine ? Math.round(v) : Math.round(v / GRID) * GRID);
  const clampZ = z => Math.max(ZMIN, Math.min(ZMAX, z));
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
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
      h = el ? el.offsetHeight : (it.t === 'text' ? 40 : it.t === 'link' ? 64 : 160);
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
  /* éléments dont le centre est dans une zone (ce qu'elle « contient ») */
  function zoneChildren(z) {
    const r = rectOf(z); if (!r) return [];
    return itemsOf(d() || {}).filter(it => it.id !== z.id && !isArrow(it)).filter(it => { const c = rectOf(it); if (!c) return false; const cx = c.x + c.w / 2, cy = c.y + c.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; });
  }

  function newDoc(fid, prof) {
    return { id: uid(), kind: 'board', folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: prof || '', blocks: [], items: [], view: { x: 0, y: 0, z: 1 }, bg: 'dots' };
  }
  function makeItem(t, x, y, extra) {
    const base = { id: uid(), t, x: Math.round(x), y: Math.round(y) };
    if (t === 'note') Object.assign(base, { w: 180, h: 180, text: '', color: 0 });
    else if (t === 'text') Object.assign(base, { w: 240, h: 0, text: '', size: 'm', bold: false });
    else if (t === 'shape') Object.assign(base, { w: 200, h: 120, kind: 'round', color: 4, text: '' });
    else if (t === 'zone') Object.assign(base, { w: 440, h: 320, title: 'Zone', color: 7 });
    else if (t === 'img') Object.assign(base, { w: 320, h: 240, iid: '' });
    else if (t === 'link') Object.assign(base, { w: 260, h: 0, url: '', title: '' });
    else if (t === 'list') Object.assign(base, { w: 250, h: 0, title: 'Liste', items: [] });
    else if (t === 'sticker') Object.assign(base, { w: 72, h: 72, emoji: '⭐' });
    else if (t === 'doc') Object.assign(base, { w: 280, h: 0, docId: '' });
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
    if (window.AlixoQuiz) AlixoQuiz.leave();
    currentDocId = id;
    const shared = typeof isSharedDoc === 'function' && isSharedDoc(id);
    readOnly = !!(shared && !(window.AlixoShare && AlixoShare.canWrite(id)));
    document.body.classList.toggle('readonly', readOnly);
    if (shared && window.AlixoShare && AlixoShare.noteOpened) AlixoShare.noteOpened(id);
    itemsOf(dd);
    const v = dd.view || {};
    view = { x: +v.x || 0, y: +v.y || 0, z: clampZ(+v.z || 1) };
    sel = new Set(); arrowFrom = null; editing = null; drag = null; hist = { undo: [], redo: [] };
    document.body.classList.remove('mode-editor', 'mode-slides', 'mode-sheet', 'mode-quiz');
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
    if (presenting) setPresent(false);
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
    const w = $('#bd-world'), st = stage(); const dd = d(); if (!w || !st) return;
    w.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    const g = 24 * view.z;
    st.style.backgroundSize = `${g}px ${g}px`;
    st.style.backgroundPosition = `${view.x}px ${view.y}px`;
    const bg = (dd && dd.bg) || 'dots';
    st.classList.toggle('bg-grid', bg === 'grid'); st.classList.toggle('bg-plain', bg === 'plain');
    const zb = $('#bd-bar [data-bd="z100"]'); if (zb) zb.textContent = Math.round(view.z * 100) + ' %';
    scheduleMinimap();
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
    if (presenting) { h.hidden = false; h.textContent = 'Présentation — Échap pour quitter · glisser et Ctrl + molette pour naviguer'; return; }
    if (tool !== 'arrow') { h.hidden = true; return; }
    h.hidden = false;
    h.textContent = arrowFrom ? 'Cliquez sur l’élément d’arrivée (Échap pour annuler)' : 'Flèche : cliquez sur l’élément de départ (Échap pour annuler)';
  }
  function renderBar() {
    const bar = $('#bd-bar'); const dd = d(); if (!bar || !dd) return;
    const right = `<div class="bd-barr">
        <button data-bd="zout" title="Zoom arrière (Ctrl + molette)">${I.zoomOut}</button>
        <button data-bd="z100" class="bd-zoom" title="Revenir à 100 %">${Math.round(view.z * 100)} %</button>
        <button data-bd="zin" title="Zoom avant (Ctrl + molette)">${I.zoomIn}</button>
        <button data-bd="fit" title="Tout voir : ajuste le zoom pour afficher tous les éléments (Ctrl+0)">${I.fit}<span class="bd-lbl">Tout voir</span></button>
        <span class="bd-sep"></span>
        <button data-bd="present" title="Présenter la planche en plein écran, sans les barres (F11)">${I.present}<span class="bd-lbl">Présenter</span></button>
        <button data-bd="pdf" title="Exporter en PDF (Ctrl+P)">PDF</button>
      </div>`;
    if (readOnly) {
      const info = window.AlixoShare && AlixoShare.infoFor ? AlixoShare.infoFor(dd.id) : null;
      bar.innerHTML = `<div class="bd-barl"><span class="bd-barlabel">Planche</span><span class="bd-ro">Partagée par <b>${esc(info ? info.owner : 'un membre')}</b> · lecture seule</span></div>` + right;
      return;
    }
    bar.innerHTML = `<div class="bd-barl">
      <button data-bd="undo" title="Annuler (Ctrl+Z)" ${hist.undo.length ? '' : 'disabled'}>${I.undo}</button>
      <button data-bd="redo" title="Rétablir (Ctrl+Y)" ${hist.redo.length ? '' : 'disabled'}>${I.redo}</button>
      <span class="bd-sep"></span>
      <button data-tool="pan" class="${tool === 'pan' ? 'on' : ''}" title="Main (H) : glisser le fond déplace la vue (ou Espace + glisser)">${I.hand}</button>
      <button data-tool="select" class="${tool === 'select' ? 'on' : ''}" title="Sélection (V) : glisser dessine un rectangle de sélection (ou Maj + glisser)">${I.select}</button>
      <span class="bd-sep"></span>
      <button data-bd="note" title="Post-it (N, ou double-clic sur le fond)">${I.note}<span class="bd-lbl">Post-it</span></button>
      <button data-bd="text" title="Texte libre, sans fond (T)">${I.text}<span class="bd-lbl">Texte</span></button>
      <button data-bd="shape" title="Forme : rectangle, capsule, ellipse, losange, hexagone, triangle — avec du texte dedans (S)">${I.shape}<span class="bd-lbl">Forme</span></button>
      <button data-bd="zone" title="Zone : cadre nommé qui regroupe des éléments ; la déplacer emporte son contenu (Z)">${I.zone}<span class="bd-lbl">Zone</span></button>
      <button data-tool="arrow" class="${tool === 'arrow' ? 'on' : ''}" title="Flèche (F) : cliquez sur un premier élément puis sur un second">${I.arrow}<span class="bd-lbl">Flèche</span></button>
      <span class="bd-sep"></span>
      <button data-bd="img" title="Image (fichier, ou collez / glissez une image sur la planche)">${I.image}<span class="bd-lbl">Image</span></button>
      <button data-bd="link" title="Lien vers une page web (L)">${I.link}<span class="bd-lbl">Lien</span></button>
      <button data-bd="list" title="Liste à cocher (K)">${I.list}<span class="bd-lbl">Liste</span></button>
      <button data-bd="sticker" title="Sticker : un emoji, en grand (E)">${I.sticker}<span class="bd-lbl">Sticker</span></button>
      <button data-bd="block" title="Épingler une séance entière (fiche) ou un bloc d’une séance (copie en lecture seule ; double-clic : ouvrir)">${I.pin}<span class="bd-lbl">Cours</span></button>
      <span class="bd-sep"></span>
      <button data-bd="tpl" class="bd-tplbtn" title="Modèles : carte mentale, SWOT, kanban, frise, fiche d’arrêt, plan de dissertation, comparatif, processus (M)">${I.tpl}<span class="bd-lbl">Modèles</span></button>
    </div>` + right;
  }
  function renderStatus() {
    const s = $('#bd-status'); const dd = d(); if (!s || !dd) return;
    const its = itemsOf(dd);
    const n = its.filter(i => !isArrow(i)).length, na = its.length - n;
    s.innerHTML = `<span>${n} élément${n > 1 ? 's' : ''}${na ? ` · ${na} flèche${na > 1 ? 's' : ''}` : ''}</span>` +
      (sel.size ? `<span>${sel.size} sélectionné${sel.size > 1 ? 's' : ''}</span>` : '') +
      `<span class="bd-tip">${readOnly ? 'Glissez le fond pour vous déplacer, Ctrl + molette pour zoomer' : 'Glissez le fond pour vous déplacer · Ctrl + molette : zoom · double-clic sur le fond : post-it · clic droit : menu · N T S Z L K E : ajouter'}</span>`;
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
  /* fiche d'une séance entière */
  function docCardHTML(it) {
    const src = typeof findDoc === 'function' ? findDoc(it.docId) : null;
    if (!src) return `<div class="bd-bhead">${I.doc}<span>Séance</span></div><div class="bd-bmiss">Séance supprimée</div>`;
    const kind = KIND_NAMES[src.kind] || 'Séance';
    const path = typeof folderPath === 'function' ? folderPath(src.folderId).map(f => f.nom).join(' › ') : '';
    let prev = '';
    if (!src.kind) {
      const plain = b => { try { return typeof blockPlain === 'function' ? blockPlain(b) : stripTags(b.text || ''); } catch { return ''; } };
      prev = (src.blocks || []).filter(b => b.type !== 'hr' && b.type !== 'img').map(plain).filter(t => t.trim()).slice(0, 4).join(' · ').slice(0, 220);
    } else if (src.kind === 'slides') prev = `${(src.slides || []).length} diapositive${(src.slides || []).length > 1 ? 's' : ''}`;
    else if (src.kind === 'quiz') prev = `${(src.questions || []).length} question${(src.questions || []).length > 1 ? 's' : ''}`;
    else if (src.kind === 'board') prev = `${(src.items || []).filter(x => x.t !== 'arrow').length} éléments`;
    else if (src.kind === 'sheet') prev = `${(src.sheets || []).length || 1} feuille${(src.sheets || []).length > 1 ? 's' : ''}`;
    return `<div class="bd-bhead" title="Double-clic : ouvrir">${I.doc}<span>${esc(kind)}${path ? ' · ' + esc(path) : ''}</span></div>
      <div class="bd-dbody"><div class="bd-dtitle">${esc(src.titre || 'Sans titre')}</div>${prev ? `<div class="bd-dprev">${esc(prev)}</div>` : ''}<div class="bd-dsub">${typeof fmtDate === 'function' && src.updatedAt ? 'Modifiée le ' + fmtDate(src.updatedAt) : ''}</div></div>`;
  }
  /* HTML d'un élément ; off = décalage (export PDF), print = sans poignée ni sélection */
  function itemHTML(it, off, print) {
    const ox = off ? off.x : 0, oy = off ? off.y : 0;
    const base = `left:${it.x - ox}px;top:${it.y - oy}px;width:${it.w}px;${it.h > 0 ? `height:${it.h}px;` : ''}`;
    const cls = (!print && sel.has(it.id) ? ' sel' : '') + (it.locked ? ' locked' : '');
    const handle = print || readOnly || it.locked ? '' : '<span class="bd-handle" data-h="se" title="Redimensionner"></span>';
    const lock = !print && it.locked ? `<span class="bd-lockmark" title="Verrouillé">${I.lock}</span>` : '';
    switch (it.t) {
      case 'note':
        return `<div class="bd-item bd-note size-${esc(it.size || 'm')}${cls}" data-id="${it.id}" style="${base}--nc:${esc(noteColor(it))};${it.rot ? `transform:rotate(${+it.rot}deg);` : ''}"><div class="bd-text">${esc(it.text || '')}</div>${lock}${handle}</div>`;
      case 'text':
        return `<div class="bd-item bd-txt size-${esc(it.size || 'm')} al-${esc(it.align || 'l')}${it.bold ? ' bold' : ''}${cls}" data-id="${it.id}" style="${base}${it.color ? `color:${inkColor(it.color)};` : ''}"><div class="bd-text">${esc(it.text || '')}</div>${lock}${handle}</div>`;
      case 'shape':
        return `<div class="bd-item bd-shape sh-${esc(it.kind || 'round')}${cls}" data-id="${it.id}" style="${base}--sc:${esc(noteColor(it))}"><div class="bd-shbg"></div><div class="bd-text">${esc(it.text || '')}</div>${lock}${handle}</div>`;
      case 'zone':
        return `<div class="bd-item bd-zone${cls}" data-id="${it.id}" style="${base}--zc:${esc(noteColor(it))}"><div class="bd-ztitle bd-text">${esc(it.title || '')}</div>${lock}${handle}</div>`;
      case 'img': {
        const src = it.iid && AlixoImages.cache.get(it.iid);
        return `<div class="bd-item bd-img${cls}${src ? '' : ' loading'}" data-id="${it.id}" style="${base}">${src ? `<img src="${src}" alt="" draggable="false">` : `<div class="bd-imgph">${I.image}</div>`}${lock}${handle}</div>`;
      }
      case 'link':
        return `<div class="bd-item bd-link${cls}" data-id="${it.id}" style="${base}" title="Double-clic : ouvrir ${esc(it.url || '')}"><span class="bd-lico">${I.globe}</span><span class="bd-lbody"><b>${esc(it.title || it.url || 'Lien')}</b><small>${esc(hostOf(it.url || ''))}</small></span>${lock}${handle}</div>`;
      case 'list': {
        const items = Array.isArray(it.items) ? it.items : [];
        const done = items.filter(x => x.done).length;
        return `<div class="bd-item bd-list${cls}" data-id="${it.id}" style="${base}"><div class="bd-lhead"><span>${esc(it.title || 'Liste')}</span>${items.length ? `<em>${done} / ${items.length}</em>` : ''}</div><div class="bd-litems">${items.map(x => `<div class="bd-li${x.done ? ' done' : ''}" data-li="${esc(x.id)}"><span class="bd-cb">${x.done ? '✓' : ''}</span><span class="bd-litxt">${esc(x.text || '')}</span></div>`).join('') || '<div class="bd-lempty">Double-clic pour ajouter des lignes</div>'}</div>${lock}${handle}</div>`;
      }
      case 'sticker':
        return `<div class="bd-item bd-sticker${cls}" data-id="${it.id}" style="${base}font-size:${Math.round(Math.min(it.w, it.h) * .72)}px"><span>${esc(it.emoji || '⭐')}</span>${lock}${handle}</div>`;
      case 'doc':
        return `<div class="bd-item bd-doc${cls}" data-id="${it.id}" style="${base}">${docCardHTML(it)}${lock}${handle}</div>`;
      case 'block':
        return `<div class="bd-item bd-block${cls}" data-id="${it.id}" style="${base}">${pinnedHTML(it)}${lock}${handle}</div>`;
    }
    return '';
  }
  /* ordre de dessin : zones dessous, puis les autres dans l'ordre d'empilement */
  function drawOrder(list) { return list.filter(isZone).concat(list.filter(it => !isZone(it) && !isArrow(it))); }
  function renderItems() {
    const box = $('#bd-items'); const dd = d(); if (!box || !dd) return;
    numCache.clear();
    box.innerHTML = drawOrder(itemsOf(dd)).map(it => itemHTML(it)).join('');
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
    scheduleMinimap();
  }
  function renderSelClasses() {
    $$('#bd-items > .bd-item').forEach(el => el.classList.toggle('sel', sel.has(el.dataset.id)));
    $$('#bd-arrows .bd-arrow').forEach(el => el.classList.toggle('sel', sel.has(el.dataset.id)));
    renderStatus();
  }

  /* ---------------- mini-carte ---------------- */
  function scheduleMinimap() { if (mmTm) return; mmTm = requestAnimationFrame(() => { mmTm = null; renderMinimap(); }); }
  function renderMinimap() {
    const mm = $('#bd-minimap'); const st = stage(); const dd = d(); if (!mm || !st || !dd || !active()) return;
    const its = itemsOf(dd).filter(it => !isArrow(it));
    const vp = { x: -view.x / view.z, y: -view.y / view.z, w: st.clientWidth / view.z, h: st.clientHeight / view.z };
    if (!its.length) { mm.hidden = true; return; }
    const bb = bboxOf(its, 60) || vp;
    const x1 = Math.min(bb.x, vp.x), y1 = Math.min(bb.y, vp.y), x2 = Math.max(bb.x + bb.w, vp.x + vp.w), y2 = Math.max(bb.y + bb.h, vp.y + vp.h);
    const W = 170, H = 110;
    const k = Math.min(W / (x2 - x1), H / (y2 - y1));
    const ox = (W - (x2 - x1) * k) / 2 - x1 * k, oy = (H - (y2 - y1) * k) / 2 - y1 * k;
    mm.hidden = presenting;
    mm.dataset.k = k; mm.dataset.ox = ox; mm.dataset.oy = oy;
    mm.innerHTML = its.slice(0, 300).map(it => { const r = rectOf(it); return `<i class="mm-${it.t}" style="left:${(r.x * k + ox).toFixed(1)}px;top:${(r.y * k + oy).toFixed(1)}px;width:${Math.max(2, r.w * k).toFixed(1)}px;height:${Math.max(2, r.h * k).toFixed(1)}px${it.t === 'note' || it.t === 'shape' ? `;background:${esc(noteColor(it))}` : ''}"></i>`; }).join('')
      + `<b style="left:${(vp.x * k + ox).toFixed(1)}px;top:${(vp.y * k + oy).toFixed(1)}px;width:${(vp.w * k).toFixed(1)}px;height:${(vp.h * k).toFixed(1)}px"></b>`;
  }
  function minimapGo(e) {
    const mm = $('#bd-minimap'); const st = stage();
    const r = mm.getBoundingClientRect();
    const k = +mm.dataset.k || 1, ox = +mm.dataset.ox || 0, oy = +mm.dataset.oy || 0;
    const px = (e.clientX - r.left - ox) / k, py = (e.clientY - r.top - oy) / k;
    view.x = st.clientWidth / 2 - px * view.z; view.y = st.clientHeight / 2 - py * view.z;
    applyView(); renderSelbar(); saveViewSoon();
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
    const gapA = a.dir === 'both' || a.dir === 'none' ? 6 : 4;
    const p1 = edgePoint(ra, rb.x + rb.w / 2, rb.y + rb.h / 2, a.dir === 'both' ? 6 : gapA);
    const p2 = edgePoint(rb, ra.x + ra.w / 2, ra.y + ra.h / 2, a.dir === 'none' ? 4 : 6);
    let mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2, c = null;
    if (a.curve) {
      const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
      const k = Math.min(120, len * .22);
      c = { x: mx - dy / len * k, y: my + dx / len * k };
      mx = .25 * p1.x + .5 * c.x + .25 * p2.x; my = .25 * p1.y + .5 * c.y + .25 * p2.y;
    }
    return { p1, p2, c, mx, my };
  }
  function arrowsHTML(dd, off, print, mk) {
    const ox = off ? off.x : 0, oy = off ? off.y : 0;
    const id = mk || 'bd-ah';
    const marker = (mid, cls, col) => `<marker id="${mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="ah${cls}"${col ? ` style="fill:${col}"` : ''}/></marker>`;
    let html = `<defs>${marker(id, '')}${marker(id + '-sel', ' sel')}${INK_COLORS.map((c, i) => (c ? marker(`${id}-c${i}`, '', c) : '')).join('')}</defs>`;
    for (const a of itemsOf(dd)) {
      if (!isArrow(a)) continue;
      const g = arrowGeom(a); if (!g) continue;
      const on = !print && sel.has(a.id);
      const f = v => (v).toFixed(1);
      const dline = g.c ? `M${f(g.p1.x - ox)} ${f(g.p1.y - oy)} Q${f(g.c.x - ox)} ${f(g.c.y - oy)} ${f(g.p2.x - ox)} ${f(g.p2.y - oy)}` : `M${f(g.p1.x - ox)} ${f(g.p1.y - oy)} L${f(g.p2.x - ox)} ${f(g.p2.y - oy)}`;
      const col = a.color ? inkColor(a.color) : '';
      const mid = on ? `${id}-sel` : (a.color ? `${id}-c${+a.color}` : id);
      const dir = a.dir || 'end';
      const markers = dir === 'none' ? '' : `${dir === 'both' ? ` marker-start="url(#${mid})"` : ''} marker-end="url(#${mid})"`;
      let label = '';
      if (a.label) {
        const tw = Math.min(260, a.label.length * 7 + 16);
        label = `<rect x="${f(g.mx - ox - tw / 2)}" y="${f(g.my - oy - 11)}" width="${tw}" height="22" rx="5"/><text x="${f(g.mx - ox)}" y="${f(g.my - oy)}" text-anchor="middle" dominant-baseline="central">${esc(a.label.slice(0, 36))}</text>`;
      }
      html += `<g class="bd-arrow${on ? ' sel' : ''}${a.dash ? ' dash' : ''}" data-id="${a.id}"${col && !on ? ` style="--ac:${col}"` : ''}>${print ? '' : `<path class="hit" d="${dline}"/>`}<path class="line" d="${dline}"${markers}/>${label}</g>`;
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
    if (!its.length || readOnly || editing || presenting || (drag && drag.kind !== 'pan')) { sb.hidden = true; return; }
    const notes = its.filter(i => i.t === 'note'), texts = its.filter(i => i.t === 'text'), shapes = its.filter(i => i.t === 'shape'), zones = its.filter(isZone);
    const arrows = its.filter(isArrow), solids = its.filter(i => !isArrow(i));
    const colored = notes.concat(shapes, zones);
    const one = its.length === 1 ? its[0] : null;
    let html = '';
    if (colored.length) {
      const cur = colored.length === 1 ? noteColor(colored[0]) : '';
      html += `<span class="bd-sw-row">${NOTE_COLORS.map((c, i) => `<button data-sb="color" data-c="${i}" class="${cur === c ? 'on' : ''}" title="${NOTE_NAMES[i]}"><span class="bd-sw" style="background:${c}"></span></button>`).join('')}</span>`;
      if (notes.length) html += `<button data-sb="rot" title="Pencher légèrement (ou remettre droit)">⟳</button>`;
      html += `<span class="bd-sep"></span>`;
    }
    if (notes.length) {
      const cur = notes.length === 1 ? (notes[0].size || 'm') : '';
      html += NOTE_SIZES.map(([k, l, n]) => `<button data-sb="nsize" data-s="${k}" class="${cur === k ? 'on' : ''}" title="Texte : ${n.toLowerCase()}">${l}</button>`).join('') + `<span class="bd-sep"></span>`;
    }
    if (shapes.length) {
      const cur = shapes.length === 1 ? (shapes[0].kind || 'round') : '';
      html += `<select data-sb="kind" title="Forme">${SHAPE_KINDS.map(([k, n]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="bd-sep"></span>`;
    }
    if (texts.length) {
      const cur = texts.length === 1 ? (texts[0].size || 'm') : '';
      const curC = texts.length === 1 ? (+texts[0].color || 0) : -1;
      const curA = texts.length === 1 ? (texts[0].align || 'l') : '';
      html += TEXT_SIZES.map(([k, l, n]) => `<button data-sb="size" data-s="${k}" class="${cur === k ? 'on' : ''}" title="${n}">${l}</button>`).join('') +
        `<button data-sb="bold" class="${texts.every(t => t.bold) ? 'on' : ''}" title="Gras"><b>G</b></button>` +
        `<span class="bd-sep"></span><span class="bd-sw-row">${INK_COLORS.map((c, i) => `<button data-sb="ink" data-c="${i}" class="${curC === i ? 'on' : ''}" title="${INK_NAMES[i]}"><span class="bd-sw ink" style="background:${c || 'var(--ink)'}"></span></button>`).join('')}</span>` +
        `<span class="bd-sep"></span>${[['l', '≡', 'Aligner à gauche'], ['c', '☰', 'Centrer'], ['r', '≡', 'Aligner à droite']].map(([k, g, n]) => `<button data-sb="align" data-a="${k}" class="al-${k} ${curA === k ? 'on' : ''}" title="${n}">${g}</button>`).join('')}<span class="bd-sep"></span>`;
    }
    if (arrows.length) {
      const a0 = arrows[0];
      const curC = arrows.length === 1 ? (+a0.color || 0) : -1;
      html += `<button data-sb="dash" class="${arrows.every(a => a.dash) ? 'on' : ''}" title="Pointillés">${I.dash}</button>` +
        `<button data-sb="dir" class="${arrows.every(a => a.dir === 'both') ? 'on' : ''}" title="Sens : simple → double ↔ aucun —">${I.both}</button>` +
        `<button data-sb="curve" class="${arrows.every(a => a.curve) ? 'on' : ''}" title="Courbe">${I.curve}</button>` +
        `<span class="bd-sw-row">${INK_COLORS.map((c, i) => `<button data-sb="acolor" data-c="${i}" class="${curC === i ? 'on' : ''}" title="${INK_NAMES[i]}"><span class="bd-sw ink" style="background:${c || 'var(--ink-2)'}"></span></button>`).join('')}</span>` +
        (arrows.length === 1 && its.length === 1 ? `<button data-sb="label" title="Texte sur la flèche">${I.label}Libellé</button>` : '') + `<span class="bd-sep"></span>`;
    }
    if (one && hasText(one)) html += `<button data-sb="edit" title="Modifier le texte (Entrée ou double-clic)">${I.pen}Modifier</button>`;
    if (one && isZone(one)) html += `<button data-sb="edit" title="Renommer la zone (Entrée)">${I.pen}Renommer</button>`;
    if (one && one.t === 'link') html += `<button data-sb="editlink" title="Adresse et titre">${I.pen}Modifier</button><button data-sb="openlink" title="Ouvrir la page (double-clic)">${I.open}Ouvrir</button>`;
    if (one && one.t === 'list') html += `<button data-sb="editlist" title="Titre et lignes de la liste (double-clic)">${I.pen}Modifier</button>`;
    if (one && one.t === 'sticker') html += `<button data-sb="emoji" title="Changer d’emoji">${I.sticker}Changer</button>`;
    if (one && (one.t === 'block' || one.t === 'doc')) html += `<button data-sb="open" title="Ouvrir la séance (double-clic)">${I.open}Ouvrir la séance</button>`;
    if (one && one.t === 'img') html += `<button data-sb="img" title="Remplacer l’image">${I.image}Remplacer</button>`;
    if (solids.length >= 2) {
      html += `<span class="bd-sep"></span>` + [['l', I.alL, 'Aligner à gauche'], ['c', I.alC, 'Centrer horizontalement'], ['r', I.alR, 'Aligner à droite'], ['t', I.alT, 'Aligner en haut'], ['m', I.alM, 'Centrer verticalement'], ['b', I.alB, 'Aligner en bas']].map(([k, ic, n]) => `<button data-sb="al" data-a="${k}" title="${n}">${ic}</button>`).join('');
      if (solids.length >= 3) html += `<button data-sb="dist" data-a="h" title="Répartir horizontalement">${I.disH}</button><button data-sb="dist" data-a="v" title="Répartir verticalement">${I.disV}</button>`;
    }
    html += `<span class="bd-sep"></span>`;
    if (solids.length) html += `<button data-sb="lock" class="${solids.every(s => s.locked) ? 'on' : ''}" title="${solids.every(s => s.locked) ? 'Déverrouiller' : 'Verrouiller : ne bouge plus, ne se redimensionne plus'}">${solids.every(s => s.locked) ? I.lock : I.unlock}</button><button data-sb="front" title="Mettre devant">${I.front}</button><button data-sb="back" title="Mettre derrière">${I.back}</button><button data-sb="dup" title="Dupliquer (Ctrl+D)">${I.dup}</button>`;
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
  function addItems(list) {
    const dd = d(); if (!dd || readOnly || !list.length) return;
    pushHist();
    itemsOf(dd).push(...list);
    sel = new Set(list.filter(i => !isArrow(i)).map(i => i.id));
    commit(); renderAll();
  }
  /* position d'un nouvel élément : centre de la vue, puis en cascade jusqu'à un endroit libre */
  function spawnPoint(w, h) {
    const c = centerPoint();
    const hh = h || 120;
    let x = snap(c.x - w / 2), y = snap(c.y - hh / 2);
    const its = itemsOf(d() || {}).filter(it => !isZone(it));
    const busy = (px, py) => its.some(it => { const r = rectOf(it); return r && px < r.x + r.w && px + w > r.x && py < r.y + r.h && py + hh > r.y; });
    for (let k = 0; k < 40 && busy(x, y); k++) { x += 40; y += 40; }
    return { x, y };
  }
  const nextNoteColor = () => itemsOf(d() || {}).filter(i => i.t === 'note').length % 8;
  function addNote(at) {
    const p = at || spawnPoint(180, 180);
    addItem(makeItem('note', p.x, p.y, { color: nextNoteColor() }), true);
  }
  function addText(at) {
    const p = at || spawnPoint(240, 40);
    addItem(makeItem('text', p.x, p.y), true);
  }
  function addShape(at, kind) {
    const p = at || spawnPoint(200, 120);
    addItem(makeItem('shape', p.x, p.y, { kind: kind || 'round', color: 4 }), true);
  }
  function addZone(at) {
    const p = at || spawnPoint(440, 320);
    const n = itemsOf(d() || {}).filter(isZone).length;
    const z = makeItem('zone', p.x, p.y, { title: 'Zone ' + (n + 1), color: [7, 4, 3, 1, 5, 0, 2, 6][n % 8] });
    const dd = d(); if (!dd || readOnly) return;
    pushHist();
    itemsOf(dd).push(z);                     // la zone passe sous les éléments déjà présents (ordre de dessin)
    commit(); renderItems(); renderArrows(); renderBar();
    selectOnly(z.id); startEdit(z.id);
  }
  function addSticker(emoji, at) {
    const p = at || spawnPoint(72, 72);
    addItem(makeItem('sticker', p.x, p.y, { emoji }));
  }
  function addList(at) {
    const p = at || spawnPoint(250, 160);
    const it = makeItem('list', p.x, p.y, { title: 'À faire', items: [{ id: uid(), text: 'Première étape', done: false }] });
    addItem(it); editList(it.id);
  }
  function addLink(at) {
    const p = at || spawnPoint(260, 64);
    editLink(null, p);
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
  function addDocCard(docId) {
    const p = spawnPoint(280, 120);
    addItem(makeItem('doc', p.x, p.y, { docId }));
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
    const copies = src.map(it => { const c = JSON.parse(JSON.stringify(it)); c.id = uid(); c.x += 24; c.y += 24; delete c.locked; if (Array.isArray(c.items)) c.items = c.items.map(x => Object.assign({}, x, { id: uid() })); map.set(it.id, c.id); return c; });
    /* les flèches entre deux éléments copiés sont copiées aussi */
    for (const a of itemsOf(dd)) if (isArrow(a) && map.has(a.from) && map.has(a.to)) copies.push(Object.assign({}, a, { id: uid(), from: map.get(a.from), to: map.get(a.to) }));
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
    const its = itemsOf(dd).filter(it => sel.has(it.id) && !isArrow(it) && !it.locked); if (!its.length) return;
    pushHist();
    its.forEach(it => { it.x += dx; it.y += dy; });
    commitSoon(); renderItems(); renderArrows(); renderSelbar();
  }
  function selectAll() {
    sel = new Set(itemsOf(d() || {}).map(i => i.id));
    renderSelClasses(); renderSelbar();
  }
  /* alignement et répartition des éléments sélectionnés */
  function alignSel(mode) {
    const dd = d(); if (!dd || readOnly) return;
    const its = itemsOf(dd).filter(it => sel.has(it.id) && !isArrow(it) && !it.locked);
    if (its.length < 2) return;
    const rs = its.map(it => ({ it, r: rectOf(it) }));
    const bb = bboxOf(its, 0);
    pushHist();
    for (const { it, r } of rs) {
      if (mode === 'l') it.x = bb.x; else if (mode === 'r') it.x = bb.x + bb.w - r.w; else if (mode === 'c') it.x = Math.round(bb.x + bb.w / 2 - r.w / 2);
      else if (mode === 't') it.y = bb.y; else if (mode === 'b') it.y = bb.y + bb.h - r.h; else if (mode === 'm') it.y = Math.round(bb.y + bb.h / 2 - r.h / 2);
    }
    commit(); renderItems(); renderArrows(); renderSelbar();
  }
  function distributeSel(axis) {
    const dd = d(); if (!dd || readOnly) return;
    const its = itemsOf(dd).filter(it => sel.has(it.id) && !isArrow(it) && !it.locked);
    if (its.length < 3) return;
    const rs = its.map(it => ({ it, r: rectOf(it) })).sort((a, b) => (axis === 'h' ? a.r.x - b.r.x : a.r.y - b.r.y));
    const first = rs[0].r, last = rs[rs.length - 1].r;
    const total = axis === 'h' ? (last.x + last.w) - first.x : (last.y + last.h) - first.y;
    const sizes = rs.reduce((s, { r }) => s + (axis === 'h' ? r.w : r.h), 0);
    const gap = (total - sizes) / (rs.length - 1);
    pushHist();
    let pos = axis === 'h' ? first.x : first.y;
    for (const { it, r } of rs) { if (axis === 'h') { it.x = Math.round(pos); pos += r.w + gap; } else { it.y = Math.round(pos); pos += r.h + gap; } }
    commit(); renderItems(); renderArrows(); renderSelbar();
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
  /* lien : adresse et titre (création si id vide) */
  function editLink(id, at) {
    const it = id ? item(id) : null; if (readOnly || (id && !it)) return;
    showPopover(`<h4>${it ? 'Modifier le lien' : 'Nouveau lien'}</h4>
      <div class="po-row"><input id="po-bdurl" value="${esc(it ? it.url : '')}" placeholder="https://…" spellcheck="false" autocomplete="off"></div>
      <div class="po-row" style="margin-top:6px"><input id="po-bdtitle" value="${esc(it ? it.title : '')}" placeholder="Titre affiché (facultatif)" maxlength="80"><button class="pobtn" id="po-bdlink-ok">OK</button></div>`,
      (typeof centerRect === 'function' ? centerRect() : { left: 200, top: 200, bottom: 200 }), pop => {
        const u = pop.querySelector('#po-bdurl'), t = pop.querySelector('#po-bdtitle');
        const ok = () => {
          let url = u.value.trim(); if (!url) { u.focus(); return; }
          if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
          hidePopover();
          if (it) { pushHist(); it.url = url; it.title = t.value.trim(); commit(); renderItems(); renderArrows(); renderSelbar(); }
          else { const p = at || spawnPoint(260, 64); addItem(makeItem('link', p.x, p.y, { url, title: t.value.trim() || hostOf(url) })); }
          stage().focus({ preventScroll: true });
        };
        pop.querySelector('#po-bdlink-ok').addEventListener('click', ok);
        pop.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        setTimeout(() => { u.focus(); u.select(); }, 40);
      });
  }
  function openLink(it) {
    if (!it || !it.url) return;
    const url = it.url;
    if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(url); else window.open(url, '_blank', 'noopener');
  }
  /* liste à cocher : titre + une ligne par élément (« x » ou « [x] » devant une ligne faite) */
  function editList(id) {
    const it = item(id); if (!it || it.t !== 'list' || readOnly) return;
    const lines = (it.items || []).map(x => (x.done ? '[x] ' : '') + (x.text || '')).join('\n');
    showPopover(`<h4>Liste</h4><div class="po-row"><input id="po-bdlt" value="${esc(it.title || '')}" placeholder="Titre" maxlength="60"></div>
      <textarea id="po-bdli" class="po-ta" rows="7" placeholder="Une ligne par élément — « [x] » devant une ligne faite" spellcheck="false">${esc(lines)}</textarea>
      <div class="po-row" style="justify-content:flex-end;margin-top:6px"><button class="pobtn" id="po-bdli-ok">OK</button></div>`,
      (typeof centerRect === 'function' ? centerRect() : { left: 200, top: 200, bottom: 200 }), pop => {
        const t = pop.querySelector('#po-bdlt'), ta = pop.querySelector('#po-bdli');
        const ok = () => {
          const old = new Map((it.items || []).map(x => [x.text, x.id]));
          const items = ta.value.split('\n').map(s => s.replace(/\r/g, '')).filter(s => s.trim()).map(s => { const m = /^\s*(\[x\]|\[ \]|x\s|✓\s|-\s)?\s*(.*)$/i.exec(s); const text = (m ? m[2] : s).trim(); const done = !!(m && m[1] && /x|✓/i.test(m[1])); return { id: old.get(text) || uid(), text, done }; });
          pushHist(); it.title = t.value.trim() || 'Liste'; it.items = items; hidePopover(); commit(); renderItems(); renderArrows(); renderSelbar(); stage().focus({ preventScroll: true });
        };
        pop.querySelector('#po-bdli-ok').addEventListener('click', ok);
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); } });
        setTimeout(() => { (it.items && it.items.length ? ta : t).focus(); }, 40);
      });
  }
  function toggleListItem(id, liId) {
    const it = item(id); if (!it || it.t !== 'list' || readOnly) return;
    const x = (it.items || []).find(y => y.id === liId); if (!x) return;
    pushHist(); x.done = !x.done; commit(); renderItems(); renderArrows();
  }
  /* stickers : palette d'emojis (nouveau sticker, ou changement de celui qui est sélectionné) */
  function pickSticker(forId, at) {
    if (readOnly) return;
    showPopover(`<h4>Sticker</h4><div class="bd-emojis">${STICKERS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div><div class="po-row" style="margin-top:6px"><input id="po-bdemo" placeholder="Ou tapez un emoji…" maxlength="4"><button class="pobtn" id="po-bdemo-ok">OK</button></div>`,
      (typeof centerRect === 'function' ? centerRect() : { left: 200, top: 200, bottom: 200 }), pop => {
        const use = e => { if (!e) return; hidePopover(); if (forId) { const it = item(forId); if (it && it.t === 'sticker') { pushHist(); it.emoji = e; commit(); renderItems(); renderArrows(); } } else addSticker(e, at); stage().focus({ preventScroll: true }); };
        pop.addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) use(b.dataset.e); });
        pop.querySelector('#po-bdemo-ok').addEventListener('click', () => use(pop.querySelector('#po-bdemo').value.trim()));
        pop.querySelector('#po-bdemo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); use(e.target.value.trim()); } });
      });
  }

  /* ---------------- saisie du texte (post-it, texte libre, forme, titre de zone) ---------------- */
  function startEdit(id) {
    const it = item(id); if (!it || readOnly || !(hasText(it) || isZone(it))) return;
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
      const key = it && isZone(it) ? 'title' : 'text';
      if (it && text !== (it[key] || '')) { pushHist(); it[key] = text; commit(); }
    }
    renderItems(); renderArrows(); renderSelbar(); renderBar();
  }

  /* ouvre la séance d'un bloc épinglé, sur ce bloc (ou la séance d'une fiche) */
  function openBlockDoc(it) {
    const src = typeof findDoc === 'function' ? findDoc(it.docId) : null;
    if (!src) { toast('Cette séance n’existe plus'); return; }
    const bid = it.blockId;
    openDoc(src.id);
    if (!bid) return;
    setTimeout(() => {
      const cur = d(); if (!cur || cur.id !== src.id) return;
      const pid = typeof pageOfBlock === 'function' ? pageOfBlock(cur, bid) : null;
      if (pid && pid !== cur.page && typeof switchPage === 'function') { switchPage(pid, bid); return; }
      const el = $(`#blocks > .block[data-id="${bid}"]`); if (!el) { toast('Bloc introuvable dans la séance'); return; }
      if (typeof scrollToBlockEl === 'function') scrollToBlockEl(el, { smooth: false, margin: 40 });
      el.classList.add('flash');
    }, 90);
  }

  /* ---------------- choix d'un bloc (ou d'une séance entière) à épingler ---------------- */
  function openBlockPicker() {
    if (readOnly) return;
    const cur = d();
    const docs = (state.docs || []).filter(x => x.id !== (cur && cur.id)).slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const pathOf = x => (typeof folderPath === 'function' ? folderPath(x.folderId).map(f => f.nom).join(' › ') : '') || 'Mes cours';
    const groups = new Map();
    for (const x of docs) { const k = pathOf(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    const docsHTML = docs.length ? [...groups].map(([k, list]) => `<div class="bd-pf">${esc(k)}</div>` + list.map(x => `<button type="button" class="bd-pd" data-doc="${x.id}">${I.doc}<span>${esc(x.titre || 'Sans titre')}</span>${x.kind ? `<em>${esc(KIND_NAMES[x.kind] || '')}</em>` : ''}</button>`).join('')).join('')
      : '<div class="bd-pick-empty">Aucune séance : écrivez d’abord un cours, puis épinglez-en les blocs ici.</div>';
    openDialog({
      id: 'bd-pick', cls: 'wide', title: 'Épingler un cours',
      sub: 'Choisissez une séance : posez-la entière (fiche) ou l’un de ses blocs. L’élément reste lié au cours (double-clic sur la planche pour y retourner).',
      body: `<div class="bd-pick"><div class="bd-pick-docs">${docsHTML}</div><div class="bd-pick-blocks" id="bd-pick-blocks"><div class="bd-pick-empty">Sélectionnez une séance à gauche.</div></div></div>`,
      onMount: (card, close) => {
        const blocksBox = card.querySelector('#bd-pick-blocks');
        let curDoc = null;
        const showBlocks = x => {
          curDoc = x;
          card.querySelectorAll('.bd-pd').forEach(b => b.classList.toggle('cur', b.dataset.doc === x.id));
          const list = x.kind ? [] : (x.blocks || []).filter(b => b.type !== 'hr');
          const plain = b => { try { return typeof blockPlain === 'function' ? blockPlain(b) : stripTags(b.text || ''); } catch { return ''; } };
          blocksBox.innerHTML = `<button type="button" class="bd-pb bd-pwhole" data-whole="1"><span class="bd-pbt">Fiche</span><span class="txt"><b>${esc(x.titre || 'Sans titre')}</b> — poser la séance entière sur la planche</span></button>` + (list.length ? list.map(b => {
            const t = plain(b).trim().slice(0, 160) || (b.type === 'img' ? 'Image' : b.type === 'table' ? 'Tableau' : b.type === 'draw' ? 'Dessin' : b.type === 'graph' ? 'Graphique' : '(vide)');
            return `<button type="button" class="bd-pb" data-block="${b.id}"><span class="bd-pbt">${esc(BLOCK_NAMES[b.type] || b.type)}</span><span class="txt">${esc(t)}</span></button>`;
          }).join('') : (x.kind ? '' : '<div class="bd-pick-empty">Cette séance est vide.</div>'));
        };
        card.addEventListener('click', e => {
          const bd = e.target.closest('.bd-pd'); if (bd) { const x = docs.find(y => y.id === bd.dataset.doc); if (x) showBlocks(x); return; }
          const wh = e.target.closest('[data-whole]'); if (wh && curDoc) { close(); addDocCard(curDoc.id); return; }
          const bb = e.target.closest('.bd-pb'); if (bb && curDoc) { close(); addBlock(curDoc.id, bb.dataset.block); }
        });
        if (docs.length === 1) showBlocks(docs[0]);
      }
    });
  }

  /* ============================================================
     Modèles : carte mentale, SWOT, kanban, frise, fiche d'arrêt, plan de dissertation, comparatif, processus
     ============================================================ */
  const TEMPLATES = [
    { k: 'mindmap', name: 'Carte mentale', sub: 'Une idée centrale, des branches et sous-branches reliées', ico: '🧠' },
    { k: 'swot', name: 'Matrice SWOT', sub: 'Forces, faiblesses, opportunités, menaces', ico: '◫' },
    { k: 'kanban', name: 'Kanban', sub: 'À faire · En cours · Fait', ico: '▥' },
    { k: 'timeline', name: 'Frise chronologique', sub: 'Dates et événements le long d’un axe', ico: '⟶' },
    { k: 'arret', name: 'Fiche d’arrêt', sub: 'Faits, procédure, prétentions, problème de droit, solution, portée', ico: '⚖️' },
    { k: 'disserte', name: 'Plan de dissertation', sub: 'Introduction, I. A. B., II. A. B., conclusion', ico: '✎' },
    { k: 'compare', name: 'Comparatif', sub: 'Deux thèses face à face, puis la synthèse', ico: '⇄' },
    { k: 'process', name: 'Processus', sub: 'Des étapes enchaînées par des flèches', ico: '➜' }
  ];
  function openTemplates() {
    if (readOnly) return;
    openDialog({
      id: 'bd-tpl', cls: 'narrow', eyebrow: 'Planche', title: 'Modèles', sub: 'Le modèle se pose à droite de ce qui existe déjà ; tout reste modifiable.',
      body: `<div class="bd-tpls">${TEMPLATES.map(t => `<button type="button" class="bd-tpl" data-tpl="${t.k}"><span class="bd-tplico">${t.ico}</span><b>${esc(t.name)}</b><small>${esc(t.sub)}</small></button>`).join('')}</div>`,
      onMount: (card, close) => card.addEventListener('click', e => { const b = e.target.closest('[data-tpl]'); if (!b) return; close(); if (b.dataset.tpl === 'mindmap') askMindmap(); else insertTemplate(b.dataset.tpl); })
    });
  }
  /* origine d'un nouveau groupe d'éléments : à droite du contenu existant, sinon au centre de la vue */
  function templateOrigin(w, h) {
    const bb = bboxOf(itemsOf(d() || {}), 0);
    if (bb) return { x: snap(bb.x + bb.w + 120), y: snap(bb.y) };
    const c = centerPoint(); return { x: snap(c.x - w / 2), y: snap(c.y - h / 2) };
  }
  function fitTo(list) {
    const st = stage(); const bb = bboxOf(list, 60); if (!bb || !st) return;
    const z = clampZ(Math.min(st.clientWidth / bb.w, st.clientHeight / bb.h, 1.2));
    view.z = z; view.x = (st.clientWidth - bb.w * z) / 2 - bb.x * z; view.y = (st.clientHeight - bb.h * z) / 2 - bb.y * z;
    applyView(); renderSelbar(); saveViewSoon();
  }
  function insertTemplate(k) {
    const o = templateOrigin(900, 600);
    const L = [];
    const T = {
      note: (x, y, text, color, w, h) => { const it = makeItem('note', o.x + x, o.y + y, { text, color: color || 0, w: w || 180, h: h || 150 }); L.push(it); return it; },
      text: (x, y, text, size, bold, color) => { const it = makeItem('text', o.x + x, o.y + y, { text, size: size || 'm', bold: !!bold, w: 520, color: color || 0 }); L.push(it); return it; },
      zone: (x, y, w, h, title, color) => { const it = makeItem('zone', o.x + x, o.y + y, { w, h, title, color: color == null ? 7 : color }); L.push(it); return it; },
      shape: (x, y, w, h, text, kind, color) => { const it = makeItem('shape', o.x + x, o.y + y, { w, h, text, kind: kind || 'round', color: color == null ? 4 : color }); L.push(it); return it; },
      arrow: (a, b, label, opts) => { const it = Object.assign({ id: uid(), t: 'arrow', from: a.id, to: b.id, label: label || '' }, opts || {}); L.push(it); return it; }
    };
    if (k === 'swot') {
      T.text(0, -56, 'Matrice SWOT', 'l', true);
      T.zone(0, 0, 380, 280, 'Forces', 3); T.zone(400, 0, 380, 280, 'Faiblesses', 2);
      T.zone(0, 300, 380, 280, 'Opportunités', 4); T.zone(400, 300, 380, 280, 'Menaces', 1);
      T.note(20, 60, 'Un atout…', 3, 160, 110); T.note(420, 60, 'Un point faible…', 2, 160, 110);
      T.note(20, 360, 'Une occasion…', 4, 160, 110); T.note(420, 360, 'Un risque…', 1, 160, 110);
    } else if (k === 'kanban') {
      T.zone(0, 0, 300, 460, 'À faire', 7); T.zone(320, 0, 300, 460, 'En cours', 4); T.zone(640, 0, 300, 460, 'Fait', 3);
      T.note(20, 60, 'Relire le chapitre 2', 0, 260, 90); T.note(20, 170, 'Fiche de révision', 1, 260, 90);
      T.note(340, 60, 'Cas pratique n° 3', 5, 260, 90); T.note(660, 60, 'Fiche d’arrêt rendue', 3, 260, 90);
    } else if (k === 'timeline') {
      T.text(0, -60, 'Frise chronologique', 'l', true);
      const axis = T.shape(0, 200, 1060, 10, '', 'pill', 7);
      const steps = [['1789', 'Déclaration des droits de l’homme'], ['1804', 'Code civil'], ['1958', 'Constitution de la Ve République'], ['1992', 'Traité de Maastricht'], ['2008', 'Révision constitutionnelle']];
      steps.forEach(([date, ev], i) => {
        const x = 40 + i * 240;
        const up = i % 2 === 0;
        T.shape(x + 60, 192, 26, 26, '', 'ellipse', 4);
        T.text(x + 20, up ? 160 : 230, date, 'm', true, 4).w = 110;
        T.note(x, up ? 20 : 270, ev, i % 2 ? 4 : 0, 170, 110);
      });
      axis.locked = true;
    } else if (k === 'arret') {
      T.text(0, -56, 'Fiche d’arrêt — [juridiction, date, n° de pourvoi]', 'l', true);
      T.zone(0, 0, 420, 260, 'Faits', 4); T.zone(440, 0, 420, 260, 'Procédure', 5);
      T.zone(0, 280, 420, 220, 'Prétentions des parties', 0); T.zone(440, 280, 420, 220, 'Problème de droit', 1);
      T.zone(0, 520, 420, 220, 'Solution (motifs et dispositif)', 3); T.zone(440, 520, 420, 220, 'Portée et critique', 2);
      T.note(20, 60, 'Qui ? Quoi ? Quand ? Les faits matériels, dans l’ordre.', 4, 380, 150);
      T.note(460, 60, 'Première instance → appel → pourvoi : qui demande quoi à chaque étape ?', 5, 380, 150);
      T.note(20, 340, 'Thèse du demandeur / thèse du défendeur (moyens).', 0, 380, 110);
      T.note(460, 340, 'La question de droit posée à la Cour, sous forme interrogative.', 1, 380, 110);
      T.note(20, 580, 'Réponse de la Cour : règle appliquée, cassation ou rejet.', 3, 380, 110);
      T.note(460, 580, 'Arrêt de principe ou d’espèce ? Confirmation, revirement, suites.', 2, 380, 110);
    } else if (k === 'disserte') {
      T.text(0, -56, 'Plan de dissertation — [sujet]', 'l', true);
      T.zone(0, 0, 900, 150, 'Introduction', 7);
      ['Accroche', 'Définition des termes', 'Contexte / intérêt', 'Problématique', 'Annonce du plan'].forEach((t, i) => T.note(20 + i * 174, 50, t, 0, 160, 80));
      const z1 = T.zone(0, 180, 440, 360, 'I. [Première partie]', 4), z2 = T.zone(460, 180, 440, 360, 'II. [Seconde partie]', 3);
      T.shape(20, 240, 400, 60, 'A. [Sous-partie]', 'round', 4); T.note(20, 320, 'Idée · argument · exemple', 4, 400, 90); T.shape(20, 430, 400, 60, 'B. [Sous-partie]', 'round', 4);
      T.shape(480, 240, 400, 60, 'A. [Sous-partie]', 'round', 3); T.note(480, 320, 'Idée · argument · exemple', 3, 400, 90); T.shape(480, 430, 400, 60, 'B. [Sous-partie]', 'round', 3);
      T.zone(0, 570, 900, 110, 'Conclusion', 7);
      T.note(20, 616, 'Réponse à la problématique', 0, 420, 50); T.note(460, 616, 'Ouverture', 0, 420, 50);
      T.arrow(z1, z2, 'transition', { curve: true, dash: true });
    } else if (k === 'compare') {
      T.text(0, -56, 'Comparatif', 'l', true);
      T.zone(0, 0, 400, 420, 'Thèse A', 4); T.zone(440, 0, 400, 420, 'Thèse B', 1);
      ['Argument 1', 'Argument 2', 'Exemple / jurisprudence'].forEach((t, i) => { T.note(20, 60 + i * 115, t, 4, 360, 95); T.note(460, 60 + i * 115, t, 2, 360, 95); });
      T.zone(0, 450, 840, 160, 'Synthèse', 3);
      T.note(20, 500, 'Points communs', 3, 390, 90); T.note(430, 500, 'Différences décisives', 3, 390, 90);
    } else if (k === 'process') {
      T.text(0, -56, 'Processus', 'l', true);
      const steps = ['Étape 1', 'Étape 2', 'Étape 3', 'Étape 4'];
      let prev = null;
      steps.forEach((s, i) => { const sh = T.shape(i * 260, 0, 200, 100, s, i === 0 ? 'pill' : i === steps.length - 1 ? 'pill' : 'round', [3, 4, 5, 1][i]); if (prev) T.arrow(prev, sh, ''); prev = sh; T.note(i * 260, 130, 'Qui ? Quoi ? Délai ?', 7, 200, 100); });
      const dec = T.shape(260, 280, 200, 110, 'Condition ?', 'diamond', 2);
      T.arrow(L[2], dec, 'si…', { dash: true }); T.arrow(dec, L[6], 'oui', { curve: true });
    }
    addItems(L);
    fitTo(L);
  }
  /* carte mentale : idée centrale + branches saisies au clavier (une par ligne, sous-branches indentées ou précédées de « - ») */
  function askMindmap() {
    if (readOnly) return;
    openDialog({
      id: 'bd-mm', cls: 'narrow', eyebrow: 'Modèle', title: 'Carte mentale', sub: 'Une branche par ligne ; une ligne commençant par « - » ou par des espaces devient une sous-branche de la précédente.',
      body: `<div class="po-row"><input id="bd-mm-center" placeholder="Idée centrale (ex. : Le contrat)" maxlength="60" style="flex:1"></div>
        <textarea id="bd-mm-lines" class="po-ta" rows="9" placeholder="Formation\n- Consentement\n- Capacité\n- Contenu licite\nEffets\n- Force obligatoire\n- Effet relatif\nInexécution\n- Exception d’inexécution\n- Résolution\n- Responsabilité"></textarea>`,
      foot: `<button type="button" class="cta" id="bd-mm-ok">Créer la carte</button>`,
      onMount: (card, close) => {
        const go = () => {
          const center = card.querySelector('#bd-mm-center').value.trim() || 'Idée centrale';
          const lines = card.querySelector('#bd-mm-lines').value.split('\n').map(s => s.replace(/\r/g, '')).filter(s => s.trim());
          const branches = [];
          for (const l of lines) {
            const sub = /^(\s+|-|•|\*)/.test(l) && branches.length;
            const text = l.replace(/^[\s\-•*]+/, '').trim(); if (!text) continue;
            if (sub) branches[branches.length - 1].kids.push(text); else branches.push({ text, kids: [] });
          }
          close(); buildMindmap(center, branches);
        };
        card.querySelector('#bd-mm-ok').addEventListener('click', go);
        card.querySelector('#bd-mm-center').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); card.querySelector('#bd-mm-lines').focus(); } });
        setTimeout(() => card.querySelector('#bd-mm-center').focus(), 40);
      }
    });
  }
  function buildMindmap(center, branches) {
    const o = templateOrigin(1100, 800);
    const cx = o.x + 550, cy = o.y + 400;
    const L = [];
    const C = makeItem('shape', cx - 120, cy - 45, { w: 240, h: 90, kind: 'ellipse', text: center, color: 4 });
    L.push(C);
    const n = Math.max(1, branches.length);
    const R1 = 300, R2 = 520;
    branches.forEach((b, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const bx = cx + Math.cos(ang) * R1, by = cy + Math.sin(ang) * R1;
      const col = [0, 3, 1, 5, 2, 6, 4, 7][i % 8];
      const B = makeItem('shape', snap(bx - 90), snap(by - 30), { w: 180, h: 60, kind: 'round', text: b.text, color: col });
      L.push(B, { id: uid(), t: 'arrow', from: C.id, to: B.id, label: '', dir: 'none', color: 0 });
      const m = b.kids.length;
      const spread = Math.min(Math.PI / 2.2, m * 0.32);
      b.kids.forEach((k, j) => {
        const a2 = ang + (m > 1 ? -spread / 2 + (spread * j) / (m - 1) : 0);
        const kx = cx + Math.cos(a2) * R2, ky = cy + Math.sin(a2) * R2;
        const K = makeItem('note', snap(kx - 80), snap(ky - 35), { w: 160, h: 70, text: k, color: col, size: 's' });
        L.push(K, { id: uid(), t: 'arrow', from: B.id, to: K.id, label: '', dir: 'none', curve: true, color: 0 });
      });
    });
    addItems(L);
    fitTo(L);
  }

  /* ---------------- vue : zoom, cadrage, présentation ---------------- */
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
  function setPresent(on) {
    presenting = !!on;
    commitEdit();
    document.body.classList.toggle('bd-present', presenting);
    sel = new Set(); renderSelClasses(); renderSelbar(); renderHint();
    try { if (presenting && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else if (!presenting && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* plein écran indisponible */ }
    setTimeout(() => { if (active()) { fitAll(); renderMinimap(); } }, 120);
    setTimeout(() => { const h = $('#bd-hint'); if (h && presenting && tool !== 'arrow') h.hidden = true; }, 3500);
  }
  function setBg(bg) {
    const dd = d(); if (!dd || readOnly) return;
    dd.bg = bg; commit(); applyView();
  }

  /* ---------------- menu contextuel ---------------- */
  function openItemMenu(x, y, id) {
    const it = item(id); const menu = $('#ctxmenu'); if (!it || !menu) return;
    const one = sel.size === 1;
    const rows = [];
    if (hasText(it) && one) rows.push(['edit', I.pen, 'Modifier le texte']);
    if (isZone(it) && one) rows.push(['edit', I.pen, 'Renommer la zone']);
    if (it.t === 'link' && one) rows.push(['openlink', I.open, 'Ouvrir le lien'], ['editlink', I.pen, 'Modifier le lien…']);
    if (it.t === 'list' && one) rows.push(['editlist', I.pen, 'Modifier la liste…']);
    if (it.t === 'sticker' && one) rows.push(['emoji', I.sticker, 'Changer d’emoji…']);
    if ((it.t === 'block' || it.t === 'doc') && one) rows.push(['open', I.open, 'Ouvrir la séance']);
    if (it.t === 'img' && one) rows.push(['img', I.image, 'Remplacer l’image…']);
    if (isArrow(it) && one) rows.push(['label', I.label, 'Libellé de la flèche…']);
    if (!isArrow(it)) rows.push(['lock', it.locked ? I.unlock : I.lock, it.locked ? 'Déverrouiller' : 'Verrouiller'], ['front', I.front, 'Mettre devant'], ['back', I.back, 'Mettre derrière'], ['dup', I.dup, 'Dupliquer']);
    rows.push(['del', I.trash, 'Supprimer', 'danger']);
    menu.innerHTML = `<div class="cm-title">${esc(sel.size > 1 ? sel.size + ' éléments' : ({ note: 'Post-it', text: 'Texte', shape: 'Forme', zone: 'Zone', img: 'Image', link: 'Lien', list: 'Liste', sticker: 'Sticker', doc: 'Fiche de séance', block: 'Bloc de cours', arrow: 'Flèche' })[it.t] || 'Élément')}</div>` +
      rows.map(([k, ic, t, cls]) => `<button data-bcm="${k}" class="${cls || ''}">${ic}${t}</button>`).join('');
    menu.className = '';
    placeCtxMenu(menu, x, y);
  }
  function openBgMenu(x, y) {
    const menu = $('#ctxmenu'); const dd = d(); if (!menu || !dd) return;
    const p = toCanvas(x, y);
    menu.dataset.bx = p.x; menu.dataset.by = p.y;
    menu.innerHTML = `<div class="cm-title">Ajouter ici</div>
      <button data-bcm="anote">${I.note}Post-it</button><button data-bcm="atext">${I.text}Texte</button><button data-bcm="ashape">${I.shape}Forme</button><button data-bcm="azone">${I.zone}Zone</button>
      <button data-bcm="alink">${I.link}Lien…</button><button data-bcm="alist">${I.list}Liste</button><button data-bcm="asticker">${I.sticker}Sticker…</button><button data-bcm="atpl">${I.tpl}Modèle…</button>
      <div class="cm-sep"></div><div class="cm-title">Fond</div>${BGS.map(([k, n]) => `<button data-bcm="bg" data-bg="${k}" class="${(dd.bg || 'dots') === k ? 'on' : ''}">${(dd.bg || 'dots') === k ? '●' : '○'} ${n}</button>`).join('')}`;
    menu.className = '';
    placeCtxMenu(menu, x, y);
  }
  function onMenuAction(k, b) {
    const menu = $('#ctxmenu');
    const one = sel.size === 1 ? item([...sel][0]) : null;
    const at = { x: snap(+menu.dataset.bx || 0), y: snap(+menu.dataset.by || 0) };
    closeCtxMenu();
    if (k === 'anote') addNote(at); else if (k === 'atext') addText(at); else if (k === 'ashape') addShape(at); else if (k === 'azone') addZone(at);
    else if (k === 'alink') addLink(at); else if (k === 'alist') addList(at); else if (k === 'asticker') pickSticker(null, at); else if (k === 'atpl') openTemplates();
    else if (k === 'bg') setBg(b.dataset.bg);
    else selbarAction(k, one);
  }
  function selbarAction(k, one, b) {
    if (k === 'color') patchSel(it => { if (it.t === 'note' || it.t === 'shape' || isZone(it)) it.color = +b.dataset.c; });
    else if (k === 'rot') patchSel(it => { if (it.t === 'note') it.rot = it.rot ? 0 : (Math.random() < 0.5 ? -2.5 : 2.5); });
    else if (k === 'nsize') patchSel(it => { if (it.t === 'note') it.size = b.dataset.s; });
    else if (k === 'size') patchSel(it => { if (it.t === 'text') it.size = b.dataset.s; });
    else if (k === 'ink') patchSel(it => { if (it.t === 'text') it.color = +b.dataset.c; });
    else if (k === 'align') patchSel(it => { if (it.t === 'text') it.align = b.dataset.a; });
    else if (k === 'bold') { const all = [...sel].map(item).filter(it => it && it.t === 'text').every(it => it.bold); patchSel(it => { if (it.t === 'text') it.bold = !all; }); }
    else if (k === 'kind') patchSel(it => { if (it.t === 'shape') it.kind = b.value; });
    else if (k === 'dash') { const all = [...sel].map(item).filter(isArrow).every(a => a.dash); patchSel(it => { if (isArrow(it)) it.dash = !all; }); }
    else if (k === 'curve') { const all = [...sel].map(item).filter(isArrow).every(a => a.curve); patchSel(it => { if (isArrow(it)) it.curve = !all; }); }
    else if (k === 'dir') patchSel(it => { if (isArrow(it)) it.dir = it.dir === 'both' ? 'none' : it.dir === 'none' ? 'end' : 'both'; });
    else if (k === 'acolor') patchSel(it => { if (isArrow(it)) it.color = +b.dataset.c; });
    else if (k === 'edit' && one) startEdit(one.id);
    else if (k === 'open' && one) openBlockDoc(one);
    else if (k === 'openlink' && one) openLink(one);
    else if (k === 'editlink' && one) editLink(one.id);
    else if (k === 'editlist' && one) editList(one.id);
    else if (k === 'emoji' && one) pickSticker(one.id);
    else if (k === 'img' && one) pickImages(one.id);
    else if (k === 'label' && one) editArrowLabel(one.id);
    else if (k === 'al') alignSel(b.dataset.a); else if (k === 'dist') distributeSel(b.dataset.a);
    else if (k === 'lock') { const all = [...sel].map(item).filter(it => it && !isArrow(it)).every(it => it.locked); patchSel(it => { if (!isArrow(it)) { if (all) delete it.locked; else it.locked = true; } }); }
    else if (k === 'front') reorder(true); else if (k === 'back') reorder(false);
    else if (k === 'dup') duplicateSel(); else if (k === 'del') deleteSel();
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
      if (k === 'present') { setPresent(true); return; }
      if (k === 'zin') { zoomCenter(1.25); return; } if (k === 'zout') { zoomCenter(0.8); return; }
      if (k === 'z100') { const s = stage(); zoomAt(1, s.clientWidth / 2, s.clientHeight / 2); return; }
      if (k === 'fit') { fitAll(); return; }
      if (readOnly) return;
      commitEdit();
      if (k === 'note') addNote(); else if (k === 'text') addText(); else if (k === 'shape') addShape(); else if (k === 'zone') addZone();
      else if (k === 'img') pickImages(); else if (k === 'link') addLink(); else if (k === 'list') addList(); else if (k === 'sticker') pickSticker();
      else if (k === 'block') openBlockPicker(); else if (k === 'tpl') openTemplates();
    });

    $('#bd-selbar').addEventListener('pointerdown', e => e.stopPropagation());
    $('#bd-selbar').addEventListener('click', e => {
      const b = e.target.closest('[data-sb]'); if (!b || readOnly || b.tagName === 'SELECT') return;
      const one = sel.size === 1 ? item([...sel][0]) : null;
      selbarAction(b.dataset.sb, one, b);
      if (!editing) st.focus({ preventScroll: true });
    });
    $('#bd-selbar').addEventListener('change', e => { const b = e.target.closest('select[data-sb]'); if (!b || readOnly) return; selbarAction(b.dataset.sb, null, b); });
    $('#ctxmenu').addEventListener('click', e => { const b = e.target.closest('[data-bcm]'); if (!b || !active()) return; e.stopPropagation(); onMenuAction(b.dataset.bcm, b); if (!editing) st.focus({ preventScroll: true }); });
    const mm = $('#bd-minimap');
    if (mm) { mm.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); minimapGo(e); mm.setPointerCapture(e.pointerId); }); mm.addEventListener('pointermove', e => { if (e.buttons) minimapGo(e); }); mm.addEventListener('dblclick', e => e.stopPropagation()); mm.addEventListener('wheel', e => e.stopPropagation()); }
    const exitBtn = $('#bd-present-exit'); if (exitBtn) exitBtn.addEventListener('click', () => setPresent(false));
    document.addEventListener('fullscreenchange', () => { if (presenting && !document.fullscreenElement) setPresent(false); });

    st.addEventListener('contextmenu', e => {
      if (!active()) return;
      e.preventDefault();
      if (editing) commitEdit();
      const itemEl = e.target.closest('.bd-item'), arrowEl = e.target.closest('.bd-arrow');
      const id = itemEl ? itemEl.dataset.id : arrowEl ? arrowEl.dataset.id : null;
      if (readOnly) return;
      if (id) { if (!sel.has(id)) selectOnly(id); openItemMenu(e.clientX, e.clientY, id); }
      else openBgMenu(e.clientX, e.clientY);
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
      const cb = e.target.closest('.bd-li');
      const pan = e.button === 1 || spaceDown || presenting || (!itemEl && !arrowEl && tool !== 'select' && !e.shiftKey);
      if (cb && itemEl && !readOnly && !presenting && e.button === 0 && e.target.closest('.bd-cb')) { toggleListItem(itemEl.dataset.id, cb.dataset.li); e.preventDefault(); return; }
      if (handle && itemEl && !readOnly) {
        const it = item(itemEl.dataset.id); if (!it || it.locked) return;
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
          const add = it => { if (it && !isArrow(it) && !it.locked && !start.has(it.id)) start.set(it.id, { x: it.x, y: it.y }); };
          for (const sid of sel) { const it = item(sid); add(it); if (isZone(it) && !it.locked) zoneChildren(it).forEach(add); }   // une zone emporte son contenu
          if (start.size) drag = { kind: 'move', sx: e.clientX, sy: e.clientY, start, moved: false };
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
        renderArrows(); scheduleMinimap(); return;
      }
      if (drag.kind === 'resize') {
        const it = item(drag.id); if (!it) return;
        if (!drag.moved) { drag.moved = true; pushHist(); renderSelbar(); }
        const minW = it.t === 'text' ? 60 : it.t === 'sticker' ? 32 : 40;
        let w = Math.max(minW, snap(drag.w + dx / view.z, e.altKey));
        let h = Math.max(24, snap(drag.h + dy / view.z, e.altKey));
        if (it.t === 'img' && it.nw && it.nh && !e.shiftKey) h = Math.max(24, Math.round(w * it.nh / it.nw));
        if (it.t === 'sticker') h = w;
        it.w = w;
        if (it.t === 'text' || it.t === 'link' || it.t === 'list' || it.t === 'doc' || it.t === 'block') { if (Math.abs(dy) > 6 || !drag.auto) it.h = h; }
        else it.h = h;
        const el = $(`#bd-items > .bd-item[data-id="${it.id}"]`);
        if (el) { el.style.width = it.w + 'px'; el.style.height = it.h > 0 ? it.h + 'px' : ''; if (it.t === 'sticker') el.style.fontSize = Math.round(Math.min(it.w, it.h) * .72) + 'px'; }
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
          if (isZone(it)) { if (rc.x >= bx1 && rc.x + rc.w <= bx2 && rc.y >= by1 && rc.y + rc.h <= by2) sel.add(it.id); continue; }   // une zone n'est prise qu'entière
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
      if ((dg.kind === 'move' || dg.kind === 'resize') && dg.moved) { commit(); if (dg.kind === 'resize') renderItems(); }
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
        if (it.t === 'block' || it.t === 'doc') { openBlockDoc(it); return; }
        if (it.t === 'link') { openLink(it); return; }
        if (readOnly || presenting) return;
        if (it.t === 'img') { pickImages(it.id); return; }
        if (it.t === 'list') { editList(it.id); return; }
        if (it.t === 'sticker') { pickSticker(it.id); return; }
        if (isZone(it)) {
          if (at.closest('.bd-ztitle')) { selectOnly(it.id); startEdit(it.id); return; }
          const p = toCanvas(e.clientX, e.clientY); addNote({ x: snap(p.x - 90), y: snap(p.y - 90) }); return;   // post-it dans la zone
        }
        if (!sel.has(it.id)) selectOnly(it.id);
        startEdit(it.id); return;
      }
      if (arrowEl) { if (!readOnly && !presenting) editArrowLabel(arrowEl.dataset.id); return; }
      if (readOnly || presenting || at.closest('#bd-selbar, #bd-hint, #bd-minimap')) return;
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
      const p = toCanvas(e.clientX, e.clientY);
      if (files.length) { e.preventDefault(); addImages(files, { x: snap(p.x), y: snap(p.y) }); return; }
      const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').trim();
      if (/^https?:\/\/\S+$/i.test(url)) { e.preventDefault(); addItem(makeItem('link', snap(p.x), snap(p.y), { url, title: hostOf(url) })); }
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
      if (!txt) return;
      e.preventDefault();
      if (/^https?:\/\/\S+$/i.test(txt)) { const p = spawnPoint(260, 64); addItem(makeItem('link', p.x, p.y, { url: txt, title: hostOf(txt) })); return; }
      const p = spawnPoint(180, 180); addItem(makeItem('note', p.x, p.y, { text: txt.slice(0, 2000), color: nextNoteColor() }));
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
      if (e.key === 'Enter' && e.target.closest('.bd-ztitle')) { e.preventDefault(); commitEdit(); st.focus({ preventScroll: true }); return; }
      e.stopPropagation();   // les raccourcis de la planche ne s'appliquent pas pendant la saisie
    });

    /* ---- clavier ---- */
    document.addEventListener('keydown', e => {
      if (!active() || editing) return;
      if ($('.dlgov') || !$('#popover').hidden) return;
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === 'F11') { e.preventDefault(); setPresent(!presenting); return; }
      if (e.key === ' ' && !mod) { if (!spaceDown) { spaceDown = true; st.classList.add('space'); } e.preventDefault(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (presenting) setPresent(false);
        else if (!$('#ctxmenu').hidden) closeCtxMenu();
        else if (tool !== 'pan') setTool('pan');
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
      if (readOnly || presenting) return;
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && key === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (mod && key === 'l') { e.preventDefault(); selbarAction('lock', null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.size) { e.preventDefault(); deleteSel(); } return; }
      if (e.key === 'Enter' && sel.size === 1) {
        const it = item([...sel][0]); if (!it) return;
        e.preventDefault();
        if (hasText(it) || isZone(it)) startEdit(it.id); else if (it.t === 'block' || it.t === 'doc') openBlockDoc(it); else if (it.t === 'link') openLink(it); else if (it.t === 'list') editList(it.id); else if (it.t === 'sticker') pickSticker(it.id); else if (isArrow(it)) editArrowLabel(it.id);
        return;
      }
      if (e.key.startsWith('Arrow') && sel.size && !mod) {
        e.preventDefault();
        const s = e.shiftKey ? 1 : GRID;
        nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
        return;
      }
      if (!mod && !e.altKey && sel.size === 0) {
        const map = { n: addNote, t: addText, s: () => addShape(), z: addZone, l: addLink, k: addList, e: () => pickSticker(), m: openTemplates, v: () => setTool('select'), h: () => setTool('pan'), f: () => setTool('arrow') };
        if (map[key]) { e.preventDefault(); map[key](); }
      }
    });
    document.addEventListener('keyup', e => { if (e.key === ' ' && spaceDown) { spaceDown = false; st.classList.remove('space'); } });
    window.addEventListener('blur', () => { spaceDown = false; st.classList.remove('space'); });
    window.addEventListener('resize', () => { if (active()) { renderSelbar(); scheduleMinimap(); } });
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
    return `<h2>${esc(title)}</h2><div class="bdp-box" style="width:${Math.round(bb.w * k)}px;height:${Math.round(bb.h * k)}px"><div class="bdp-world" style="transform:scale(${k.toFixed(4)});width:${Math.round(bb.w)}px;height:${Math.round(bb.h)}px"><svg class="bd-arrows" xmlns="http://www.w3.org/2000/svg">${arrowsHTML(dd, off, true, 'bdp-ah')}</svg>${drawOrder(its).map(it => itemHTML(it, off, true)).join('')}</div></div>`;
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
    const done = () => { document.body.classList.remove('printing-board'); if (typeof exportWatermark === 'function') exportWatermark(false); box.innerHTML = ''; document.title = 'Alixo — Cockpit d’amphi'; };
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
    const its = (Array.isArray(dd && dd.items) ? dd.items : []).filter(it => !isArrow(it));
    if (!its.length) return '<span class="sp-empty">Planche vide</span>';
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const hOf = it => (it.h > 0 ? it.h : (it.t === 'text' ? 40 : it.t === 'link' ? 64 : 160));
    for (const it of its) { x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y); x2 = Math.max(x2, it.x + it.w); y2 = Math.max(y2, it.y + hOf(it)); }
    /* la boîte est ramenée aux proportions de l'aperçu (≈ 2,6 : 1) pour ne pas déformer les éléments */
    let w = Math.max(60, x2 - x1) * 1.12, h = Math.max(40, y2 - y1) * 1.12;
    const R = 2.6;
    if (w / h < R) w = h * R; else h = w / R;
    const ox = (x1 + x2) / 2 - w / 2, oy = (y1 + y2) / 2 - h / 2;
    return `<div class="bdprev">${drawOrder(its).slice(0, 60).map(it => {
      const l = ((it.x - ox) / w * 100).toFixed(1), t = ((it.y - oy) / h * 100).toFixed(1);
      const ww = (it.w / w * 100).toFixed(1), hh = (hOf(it) / h * 100).toFixed(1);
      return `<i class="bp-${it.t}" style="left:${l}%;top:${t}%;width:${ww}%;height:${hh}%${it.t === 'note' || it.t === 'shape' || it.t === 'zone' ? `;${it.t === 'zone' ? 'border-color' : 'background'}:${esc(noteColor(it))}` : ''}"></i>`;
    }).join('')}</div>`;
  }
  const itemCount = dd => (Array.isArray(dd && dd.items) ? dd.items : []).filter(it => it.t !== 'arrow').length;

  /* recherche universelle : post-it, textes, formes, zones, liens, listes, libellés de flèches, fiches et blocs épinglés */
  function search(dd, needle, max) {
    const want = String(needle || '').toLowerCase();
    if (!want) return [];
    const out = [];
    const list = Array.isArray(dd && dd.items) ? dd.items : [];
    for (const it of list) {
      let text = '';
      if (it.t === 'note' || it.t === 'text' || it.t === 'shape') text = it.text || '';
      else if (it.t === 'zone') text = it.title || '';
      else if (it.t === 'link') text = [it.title, it.url].filter(Boolean).join(' · ');
      else if (it.t === 'list') text = [it.title, ...(it.items || []).map(x => x.text)].filter(Boolean).join(' · ');
      else if (it.t === 'sticker') text = it.emoji || '';
      else if (it.t === 'arrow') text = it.label || '';
      else if (it.t === 'doc') { const s = typeof findDoc === 'function' ? findDoc(it.docId) : null; text = s ? (s.titre || '') : ''; }
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

  return { newDoc, open, leave, remoteChanged, undo, redo, exportPDF, preview, itemCount, search, reveal, insertTemplate, isPresenting: () => presenting };
})();
