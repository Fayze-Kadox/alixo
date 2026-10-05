/* ============================================================
   Alixo — application (V1 web)
   Store local (hors-ligne d'abord), explorateur de dossiers,
   éditeur par blocs, plan juridique, maths, graphiques, recherche.
   ============================================================ */
'use strict';

/* ---------------- utilitaires ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; };
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtDate = ts => new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const DEFAULT_TINT = '#33658a';
/* version de l'application (tenue à jour avec package.json) — sert aux notifications « nouvelle version installée » */
const ALIXO_VERSION = '1.25.0';
/* version web d'Alixo (GitHub Pages) et téléchargement de la version PC */
const ALIXO_WEB_URL = 'https://alixoapp.com/docs/';
/* 1.23 : tout passe par le site (pages de téléchargement et de versions) — jamais de lien direct vers l'hébergement des fichiers */
const ALIXO_PC_URL = 'https://alixoapp.com/telecharger/windows/';
const ALIXO_MAC_URL = 'https://alixoapp.com/telecharger/mac/';
const ALIXO_VERSIONS_URL = 'https://alixoapp.com/versions/';
const IS_MAC_BROWSER = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Macintosh/.test(navigator.userAgent || '');
const IS_DESKTOP = !!window.alixoDesktop;

/* toast(msg) ou toast(msg, { action: 'Annuler', onAction }) pour proposer une annulation */
function toast(msg, opts) {
  const t = $('#toast');
  clearTimeout(t._tm);
  if (opts && opts.action) {
    t.innerHTML = `<span class="toast-msg">${esc(msg)}</span><button class="toast-act" type="button">${esc(opts.action)}</button>`;
    t.querySelector('.toast-act').addEventListener('click', () => {
      clearTimeout(t._tm); t.hidden = true;
      try { opts.onAction(); } catch (err) { console.error(err); }
    });
  } else t.textContent = msg;
  t.hidden = false;
  t._tm = setTimeout(() => t.hidden = true, (opts && opts.duration) || (opts && opts.action ? 7000 : 2200));
}

/* ---------------- persistance ---------------- */
/* clé de stockage : un espace de données par compte connecté (voir js/auth.js) */
const LS_KEY = 'alixo.v1' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
let state = null;
let saveTm = null;
/* horodatage des réglages (1.16) : la synchronisation garde les réglages les plus récents d'un appareil à
   l'autre. Avant, l'appareil démarré en dernier imposait les siens : la police ou le thème choisis sur le PC
   « revenaient en arrière » dès que le téléphone ou la version web s'ouvrait avec d'anciens réglages. */
let lastSettingsJson = null;
function noteSettingsChange() {
  try {
    const j = JSON.stringify(state.settings);
    if (lastSettingsJson === null) { lastSettingsJson = j; return; }
    if (j !== lastSettingsJson) { lastSettingsJson = j; state.settingsAt = Math.max(Date.now(), (+state.settingsAt || 0) + 1); }   // toujours croissant, même si un autre appareil a l'horloge en avance
  } catch { /* réglages illisibles : on ne date rien */ }
}
function save() {
  clearTimeout(saveTm);
  setSaveStatus('saving');
  if (state && state.settings) noteSettingsChange();
  saveTm = setTimeout(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    if (window.AlixoSync) window.AlixoSync.onLocalSave();
    if (window.AlixoShare && window.AlixoShare.enabled) window.AlixoShare.onLocalSave();
    setSaveStatus('saved');
  }, 350);
}
/* indicateur « Enregistré » dans la barre supérieure (éditeur) */
function setSaveStatus(st) {
  const el = $('#save-status'); if (!el) return;
  el.dataset.st = st;
  if (st === 'saving') { el.textContent = 'Enregistrement…'; return; }
  const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sync = window.AlixoSync && window.AlixoSync.enabled;
  el.textContent = `Enregistré à ${t}${sync ? ' · synchronisé' : ''}`;
}
function load() {
  try { return migrate(JSON.parse(localStorage.getItem(LS_KEY))); } catch { return null; }
}

/* migration : « matières » (v1) → dossiers imbriqués (v2), palette sans violet */
function migrate(s) {
  if (!s) return null;
  const remap = { '#5557d9': '#3d5a80', '#9257a8': '#7a6852' };
  if (s.matieres) {
    s.folders = s.matieres.map(m => ({ id: m.id, nom: m.nom, couleur: remap[m.couleur] || m.couleur, parentId: null }));
    (s.docs || []).forEach(d => { d.folderId = d.matiereId || null; delete d.matiereId; });
    delete s.matieres;
  }
  (s.folders || []).forEach(f => {
    if (remap[f.couleur]) f.couleur = remap[f.couleur];
    // anciennes icônes émoji → icônes SVG
    if (f.icone && !AlixoIcons.ICONS[f.icone]) f.icone = AlixoIcons.EMOJI_MAP[f.icone] || '';
  });
  if (!s.folders) s.folders = [];
  return s;
}

const FOLDER_COLORS = [
  '#8c4351', '#c04343', '#d06a3a', '#b3762a', '#b8952e', '#8a6d3b', '#7a6852', '#4a7856',
  '#2f7d68', '#2e8b8b', '#33658a', '#3d6bb5', '#3d5a80', '#5b6b8c', '#a8556f', '#6b6b6b'
];

/* icônes de dossiers (SVG, par thème) — voir js/icons.js */
const FOLDER_ICONS = AlixoIcons.CATEGORIES;

function folderIconHTML(f, big) {
  if (f && f.icone) return AlixoIcons.svg(f.icone, 'ficon-ico' + (big ? ' big' : ''));
  return big ? FOLDER_ICON_BIG : FOLDER_ICON;
}

/* ---------------- état de départ ----------------
   1.22 : plus de contenu de démonstration. Avant, le premier lancement — et chaque nouvel appareil, puisque le
   stockage local est propre au compte — créait d'office les dossiers « Droit » et « Économie » (avec quatre séances
   d'exemple), qui partaient ensuite dans le compte par la synchronisation : dossiers en double à chaque connexion. */
function emptyState() { return { folders: [], docs: [], settings: { theme: null, snippets: [{ k: 'tkt', v: 't’inquiète' }] } }; }

/* ---------------- état runtime ---------------- */
let currentDocId = null;
let currentFolderId = null;    // null = racine « Mes cours »
let expandedFolders = null;    // Set — initialisé au démarrage
let lastBlockId = null;
let lastFormulaInput = null;
let editingFormula = {};
let planCollapsed = false;

/* séance par id : les miennes, puis celles partagées avec moi (Alixo Share) */
function findDoc(id) { return state.docs.find(d => d.id === id) || (window.AlixoShare && AlixoShare.enabled ? AlixoShare.docById(id) : null) || null; }
const isSharedDoc = id => !!id && !state.docs.some(d => d.id === id) && !!(window.AlixoShare && AlixoShare.enabled && AlixoShare.docById(id));
let readOnly = false;   // séance partagée en lecture seule
const doc = () => findDoc(currentDocId);
const folder = id => state.folders.find(f => f.id === id);
const childFolders = pid => state.folders.filter(f => (f.parentId || null) === (pid || null));
const folderDocs = fid => state.docs.filter(d => (d.folderId || null) === (fid || null));

function folderPath(fid) {
  const path = [];
  let f = folder(fid);
  while (f) { path.unshift(f); f = folder(f.parentId); }
  return path;
}
function folderTint(fid) {
  const p = folderPath(fid);
  for (let i = p.length - 1; i >= 0; i--) if (p[i].couleur) return p[i].couleur;
  return DEFAULT_TINT;
}
function descendantIds(fid) {
  const out = [fid];
  for (const c of childFolders(fid)) out.push(...descendantIds(c.id));
  return out;
}
function subtreeDocCount(fid) {
  const ids = new Set(descendantIds(fid));
  return state.docs.filter(d => ids.has(d.folderId)).length;
}

/* ---------------- professeurs ---------------- */
/* nom du professeur d'un dossier (hérité du dossier parent le plus proche qui en a un) */
function folderProf(fid) {
  const p = folderPath(fid);
  for (let i = p.length - 1; i >= 0; i--) if (p[i].prof) return p[i].prof;
  return '';
}
/* autres professeurs présents dans les sous-dossiers (et leurs séances), différents de celui du dossier */
function otherProfs(f) {
  const main = norm(f.prof || '');
  const ids = descendantIds(f.id), idSet = new Set(ids);
  const found = new Map();
  const add = p => { p = (p || '').trim(); if (p && norm(p) !== main && !found.has(norm(p))) found.set(norm(p), p); };
  for (const id of ids) { if (id !== f.id) { const sf = folder(id); if (sf) add(sf.prof); } }
  for (const d of state.docs) if (idSet.has(d.folderId)) add(d.prof);
  return [...found.values()];
}
/* « Nom du prof +1 » : le prof du dossier (ou le premier trouvé dessous) et le nombre d'autres profs dans les sous-dossiers */
function profBadgeHTML(f) {
  const others = otherProfs(f);
  const main = f.prof || others[0] || '';
  if (!main) return '';
  const extra = f.prof ? others : others.slice(1);
  return `<span class="card-prof">${esc(main)}${extra.length ? `<span class="prof-more" title="${esc('Aussi : ' + extra.join(', '))}">+${extra.length}</span>` : ''}</span>`;
}
/* mémorise un nom de professeur pour les suggestions */
function rememberProf(name) {
  name = (name || '').trim(); if (!name) return;
  const list = state.settings.profs || (state.settings.profs = []);
  if (!list.some(p => norm(p) === norm(name))) { list.push(name); list.sort((a, b) => a.localeCompare(b, 'fr')); renderProfsList(); }
}
function renderProfsList() {
  const dl = $('#profs-list'); if (!dl) return;
  dl.innerHTML = (state.settings.profs || []).map(p => `<option value="${esc(p)}">`).join('');
}

const FOLDER_ICON = '<svg class="ficon" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4.2l2 2.4H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
const FOLDER_ICON_BIG = '<svg class="fbig" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4.2l2 2.4H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';

/* ============================================================
   Navigation entre vues
   ============================================================ */
/* position de lecture de chaque séance ouverte en onglet : on la retrouve en revenant sur l'onglet ;
   un onglet fermé (ou une séance rouverte depuis la bibliothèque) repart du haut */
const TABSCROLL_LS = 'alixo.tabscroll' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
let tabScroll = {};
function loadTabScroll() { try { const t = JSON.parse(localStorage.getItem(TABSCROLL_LS)); tabScroll = t && typeof t === 'object' ? t : {}; } catch { tabScroll = {}; } }
function saveTabScroll() { try { localStorage.setItem(TABSCROLL_LS, JSON.stringify(tabScroll)); } catch { /* stockage indisponible */ } }
function rememberScroll() {
  if (!currentDocId) return;
  const w = $('#docwrap'); if (!w) return;
  tabScroll[currentDocId] = Math.round(w.scrollTop);
  saveTabScroll();
}
function forgetScroll(id) { if (id in tabScroll) { delete tabScroll[id]; saveTabScroll(); } }
function showLibrary() {
  rememberScroll();
  if (window.AlixoSlides) AlixoSlides.leave();
  if (window.AlixoSheets) AlixoSheets.leave();
  if (window.AlixoBoard) AlixoBoard.leave();
  if (window.AlixoQuiz) AlixoQuiz.leave();
  if (window.AlixoShare && AlixoShare.enabled) AlixoShare.setPresence(null, null);
  currentDocId = null;
  applyPagesMode();
  renderAccess();
  readOnly = false; document.body.classList.remove('readonly'); blocksEl.contentEditable = 'true';
  if (cropCtx) cancelCrop();
  clearBlockSel(); hideCalcGhost(); hidePopover(); closeSlash(false); closeCtxMenu();
  $('#imgbar').hidden = true;
  document.body.classList.remove('mode-editor');
  $('#view-editor').hidden = true;
  $('#view-library').style.display = 'flex';
  $('#toolbar').hidden = true;
  closeRightPanels();
  document.documentElement.style.setProperty('--tint', currentFolderId ? folderTint(currentFolderId) : DEFAULT_TINT);
  renderTabs();
  renderCrumbs();
  renderLibrary();
}

function openDoc(id) {
  const d = findDoc(id);
  if (!d) { toast('Cette séance n’existe plus'); showLibrary(); return; }
  if (isSlidesDoc(d)) { if (window.AlixoSlides) AlixoSlides.open(id); else toast('Module de présentation indisponible'); return; }
  if (isSheetDoc(d)) { if (window.AlixoSheets) AlixoSheets.open(id); else toast('Module de tableur indisponible'); return; }
  if (isBoardDoc(d)) { if (window.AlixoBoard) AlixoBoard.open(id); else toast('Module de planche indisponible'); return; }
  if (isQuizDoc(d)) { if (window.AlixoQuiz) AlixoQuiz.open(id); else toast('Module de quiz indisponible'); return; }
  if (window.AlixoSlides) AlixoSlides.leave();
  if (window.AlixoSheets) AlixoSheets.leave();
  if (window.AlixoBoard) AlixoBoard.leave();
  if (window.AlixoQuiz) AlixoQuiz.leave();
  const shared = isSharedDoc(id);
  readOnly = shared && !AlixoShare.canWrite(id);
  document.body.classList.toggle('readonly', readOnly);
  blocksEl.contentEditable = readOnly ? 'false' : 'true';
  renderReadOnlyBanner(shared ? AlixoShare.infoFor(id) : null);
  if (shared) AlixoShare.noteOpened(id);
  docPages(d);
  if (!Array.isArray(d.blocks) || !d.blocks.length) d.blocks = [{ id: uid(), type: 'p', text: '' }];
  if (cropCtx) cancelCrop();
  if (currentDocId !== id) rememberScroll();
  if (!openTabs.includes(id)) forgetScroll(id);   // séance rouverte depuis la bibliothèque : on repart du haut
  currentDocId = id;
  clearBlockSel(); hideCalcGhost(); hidePopover(); closeCtxMenu();
  editingFormula = {}; lastBlockId = null; lastAnchorBlock = null; lastFormulaInput = null;
  dayFilter = null; aiSug = null; tsel = null; tselStart = null;
  // anciens blocs sans date : on leur attribue le jour de création de la séance
  const k0 = dayKey(d.createdAt || Date.now());
  // les notes de correction (règles) sont éphémères : elles ne survivent pas à la réouverture
  d.blocks.forEach(b => { if (!b.day) b.day = k0; delete b.notes; stripCorrBlock(b); repairHiliteBlock(b); });
  corrMarks = [];
  historyReset();
  document.body.classList.add('mode-editor');
  $('#view-library').style.display = 'none';
  $('#view-editor').hidden = false;
  $('#toolbar').hidden = false;
  document.documentElement.style.setProperty('--tint', (shared && AlixoShare.tintFor(id)) || folderTint(d.folderId));
  $('#view-editor').classList.toggle('plan-open', !planCollapsed);
  syncRightPanelClass();
  syncViewerToDoc(d);
  $('#doc-prof').value = d.prof || '';
  $('#doc-prof').disabled = readOnly;
  renderProfsList();
  setSaveStatus('saved');
  if (!openTabs.includes(id)) openTabs.push(id);
  renderTabs();
  renderCrumbs();
  renderEditor();
  applyPagesMode();
  renderPageTabs();
  renderAccess();
  if (window.AlixoShare && AlixoShare.enabled) AlixoShare.setPresence(id, null);
}

/* ---------------- onglets dans une séance (façon Google Docs) ----------------
   d.pages = [{ id, titre, blocks }] ; d.page = id de l'onglet affiché, dont les blocs sont dans d.blocks
   (blocks: null pour cet onglet). Plan, journal, export PDF (page affichée) et synchronisation inchangés. */
function docPages(d) {
  if (!d) return [];
  if (!Array.isArray(d.pages) || !d.pages.length) { d.pages = [{ id: 'main', titre: 'Principal', blocks: null }]; d.page = 'main'; }
  if (!d.page || !d.pages.some(p => p.id === d.page)) {
    const withNull = d.pages.find(p => !Array.isArray(p.blocks));
    if (withNull) d.page = withNull.id; else { d.page = d.pages[0].id; d.pages[0].blocks = null; }
  }
  d.pages.forEach(p => { if (p.id !== d.page && !Array.isArray(p.blocks)) p.blocks = []; });
  return d.pages;
}
const curPage = d => docPages(d).find(p => p.id === d.page);
/* tous les blocs de la séance, onglet par onglet (export, recherche, dictionnaire) */
function allPageBlocks(d, withTitles = true) {
  const pages = docPages(d);
  if (pages.length === 1) return d.blocks || [];
  const out = [];
  for (const p of pages) {
    const bl = p.id === d.page ? (d.blocks || []) : (p.blocks || []);
    if (withTitles) out.push({ id: 'pg_' + p.id, type: 'p', text: `<b>Onglet « ${esc(p.titre || 'Sans titre')} »</b>`, al: 'center', _page: p.id });
    for (const b of bl) out.push(withTitles ? Object.assign({}, b, { _page: p.id }) : b);
  }
  return out;
}
const flatDoc = d => (docPages(d).length > 1 ? Object.assign({}, d, { blocks: allPageBlocks(d) }) : d);
function pageOfBlock(d, bid) { for (const p of docPages(d)) { const bl = p.id === d.page ? d.blocks : p.blocks; if ((bl || []).some(b => b.id === bid)) return p.id; } return d.page; }
function switchPage(pid, focusBlockId) {
  const d = doc(); if (!d) return;
  const pages = docPages(d);
  const cur = pages.find(p => p.id === d.page), nxt = pages.find(p => p.id === pid);
  if (!nxt) return;
  if (nxt !== cur) {
    if (!readOnly) syncAllFromDom();
    rememberScroll();
    if (cur) cur.blocks = d.blocks;
    d.blocks = Array.isArray(nxt.blocks) && nxt.blocks.length ? nxt.blocks : [{ id: uid(), type: 'p', text: '', day: todayKey() }];
    nxt.blocks = null;
    d.page = pid;
    if (!readOnly) { d.updatedAt = Date.now(); save(); }
    forgetScroll(d.id);
    historyReset(); aiSug = null; tsel = null; objSel = null; corrMarks = [];
    renderEditor();
  }
  renderPageTabs();
  if (focusBlockId) setTimeout(() => { const el = $(`.block[data-id="${focusBlockId}"]`); if (el) { scrollToBlockEl(el, { smooth: false, margin: 40 }); el.classList.add('flash'); } }, 30);
}
function addPage() {
  const d = doc(); if (!d || readOnly) return;
  const pages = docPages(d);
  if (pages.length >= 20) { toast('20 onglets au maximum par séance'); return; }
  const np = { id: uid(), titre: `Onglet ${pages.length + 1}`, blocks: [{ id: uid(), type: 'p', text: '', day: todayKey() }] };
  pages.push(np);
  switchPage(np.id);
  openRenamePagePopover(np.id, true);
}
function openRenamePagePopover(pid, isNew) {
  const d = doc(); if (!d) return;
  const pg = docPages(d).find(p => p.id === pid); if (!pg) return;
  const anchor = $(`#page-tabs [data-page="${pid}"]`);
  showPopover(`<h4>${isNew ? 'Nouvel onglet' : 'Renommer l’onglet'}</h4>
    <div class="po-row"><input id="po-pgname" value="${esc(pg.titre || '')}" placeholder="Nom de l’onglet" maxlength="60" spellcheck="false"><button class="pobtn" id="po-pgname-ok">OK</button></div>
    <div class="po-hint">Les onglets découpent une même séance (TD, cours, fiches…) : le plan, le journal et l’export suivent l’onglet affiché.</div>`,
    anchor ? anchor.getBoundingClientRect() : centerRect(), pop => {
      const inp = pop.querySelector('#po-pgname');
      const ok = () => { const v = inp.value.trim(); if (v) pg.titre = v; d.updatedAt = Date.now(); save(); hidePopover(); renderPageTabs(); if (isNew) focusBlock(d.blocks[0].id, 'start'); };
      pop.querySelector('#po-pgname-ok').addEventListener('click', ok);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      setTimeout(() => { inp.focus(); inp.select(); }, 40);
    });
}
function deletePage(pid) {
  const d = doc(); if (!d || readOnly) return;
  const pages = docPages(d);
  if (pages.length <= 1) { toast('Une séance garde au moins un onglet'); return; }
  const pg = pages.find(p => p.id === pid); if (!pg) return;
  const bl = pg.id === d.page ? d.blocks : pg.blocks;
  const n = (bl || []).filter(b => !isEmptyPara(b)).length;
  const go = () => {
    const i = pages.indexOf(pg);
    if (pg.id === d.page) { const other = pages[i + 1] || pages[i - 1]; switchPage(other.id); }
    const j = docPages(d).indexOf(pg); if (j >= 0) docPages(d).splice(j, 1);
    d.updatedAt = Date.now(); save(); renderPageTabs();
    toast(`Onglet « ${pg.titre} » supprimé`);
  };
  if (n) confirmDialog({ title: `Supprimer l’onglet « ${pg.titre} » ?`, text: `${n} bloc${n > 1 ? 's' : ''} seront supprimés avec lui.`, ok: 'Supprimer' }).then(y => { if (y) go(); });
  else go();
}
function movePage(pid, dir) {
  const d = doc(); if (!d || readOnly) return;
  const pages = docPages(d); const i = pages.findIndex(p => p.id === pid); const j = i + dir;
  if (i < 0 || j < 0 || j >= pages.length) return;
  pages.splice(j, 0, pages.splice(i, 1)[0]); d.updatedAt = Date.now(); save(); renderPageTabs();
}
function renderPageTabs() {
  const bar = $('#page-tabs'); const d = doc();
  if (!bar) return;
  if (!d) { bar.hidden = true; return; }
  const pages = docPages(d);
  const show = pages.length > 1;
  bar.hidden = !show;
  document.body.classList.toggle('has-pages', show);
  if (!show) return;
  bar.innerHTML = `<span class="pg-label" title="Onglets de cette séance">Onglets</span>` + pages.map(p => `<button type="button" class="pg-tab ${p.id === d.page ? 'active' : ''}" data-page="${p.id}" title="${esc(p.titre)} — double-clic : renommer · clic droit : options">${esc(p.titre || 'Sans titre')}</button>`).join('') +
    (readOnly ? '' : `<button type="button" class="pg-add" data-pgadd title="Nouvel onglet dans cette séance">＋</button>`);
}
$('#page-tabs').addEventListener('click', e => {
  if (e.target.closest('[data-pgadd]')) { addPage(); return; }
  const t = e.target.closest('[data-page]'); if (t) switchPage(t.dataset.page);
});
$('#page-tabs').addEventListener('dblclick', e => { const t = e.target.closest('[data-page]'); if (t && !readOnly) openRenamePagePopover(t.dataset.page); });
$('#page-tabs').addEventListener('contextmenu', e => {
  const t = e.target.closest('[data-page]'); if (!t || readOnly) return;
  e.preventDefault();
  const d = doc(); const pages = docPages(d); const i = pages.findIndex(p => p.id === t.dataset.page);
  const menu = $('#ctxmenu');
  menu.innerHTML = `<div class="cm-title">${esc(pages[i].titre)}</div>
    <button data-cm="pgrename">${CM_ICO.pen}Renommer…</button>
    <button data-cm="pgleft" ${i === 0 ? 'disabled' : ''}>${CM_ICO.move}Déplacer à gauche</button>
    <button data-cm="pgright" ${i === pages.length - 1 ? 'disabled' : ''}>${CM_ICO.move}Déplacer à droite</button>
    <button data-cm="pgadd">${CM_ICO.dup}Nouvel onglet</button>
    <button data-cm="pgdelete" class="danger">${CM_ICO.trash}Supprimer l’onglet</button>`;
  menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = ''; menu.dataset.page = t.dataset.page;
  placeCtxMenu(menu, e.clientX, e.clientY);
});
const ppPage = $('#pp-page'); if (ppPage) ppPage.addEventListener('click', addPage);

/* ---------------- onglets : plusieurs séances ouvertes en même temps ---------------- */
const TABS_LS = 'alixo.tabs' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
let openTabs = [];
function loadTabs() { try { const t = JSON.parse(localStorage.getItem(TABS_LS)); openTabs = Array.isArray(t) ? t : []; } catch { openTabs = []; } }
function renderTabs() {
  const bar = $('#tabbar'); if (!bar) return;
  openTabs = openTabs.filter(id => !!findDoc(id));
  try { localStorage.setItem(TABS_LS, JSON.stringify(openTabs)); } catch { /* stockage indisponible */ }
  const show = openTabs.length > 0;
  document.body.classList.toggle('has-tabs', show);
  bar.hidden = !show;
  if (!show) return;
  bar.innerHTML = `<button class="tab lib ${!currentDocId ? 'active' : ''}" data-tab="" title="Bibliothèque (Alt+←)">
      <svg class="tab-ico home-ico" viewBox="0 0 24 24"><path d="M4 11 12 4l8 7M6 10v9h12v-9"/></svg><span class="tab-name">Bibliothèque</span></button>` +
    openTabs.map(id => {
      const d = findDoc(id);
      const name = d.titre || 'Sans titre';
      const sh = isSharedDoc(id) ? '<svg class="tab-sh" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>' : '';
      return `<button class="tab ${id === currentDocId ? 'active' : ''}" data-tab="${id}" draggable="true" title="${esc(name)}${sh ? ' (partagé)' : ''} — glisser pour réordonner">
        ${sh}<span class="tab-name">${esc(name)}</span><span class="tab-x" data-close="${id}" title="Fermer l’onglet (Ctrl+W)">✕</span></button>`;
    }).join('');
  /* 1.19 : plus de défilement horizontal (il laissait une barre claire sous les onglets) : les onglets se
     serrent pour tenir sur la ligne, et un bouton « ▾ » liste tous les onglets ouverts */
  if (openTabs.length > 1) bar.insertAdjacentHTML('beforeend', `<button class="tab-more" data-tabmore type="button" title="Tous les onglets ouverts (${openTabs.length})"><span>${openTabs.length}</span> ▾</button>`);
  bar.classList.toggle('crowded', openTabs.length > 6);
}
function openTabsMenu(btn) {
  const rows = openTabs.map(id => { const d = findDoc(id); return d ? `<button data-tabgo="${id}" class="${id === currentDocId ? 'on' : ''}">${docIcon(d)}<span>${esc(d.titre || 'Sans titre')}</span><i class="po-tabx" data-tabx="${id}" title="Fermer">✕</i></button>` : ''; }).join('');
  showPopover(`<h4>Onglets ouverts (${openTabs.length})</h4><div class="po-list po-tabs">${rows}</div><div class="po-row" style="justify-content:flex-end; margin-top:8px"><button class="cta ghost small" id="po-tabs-closeall" type="button">Tout fermer</button></div>`, btn.getBoundingClientRect(), pop => {
    pop.addEventListener('click', e => {
      const x = e.target.closest('[data-tabx]'); if (x) { e.stopPropagation(); closeTab(x.dataset.tabx); if (openTabs.length) openTabsMenu(btn); else hidePopover(); return; }
      const g = e.target.closest('[data-tabgo]'); if (g) { hidePopover(); openDoc(g.dataset.tabgo); return; }
      if (e.target.closest('#po-tabs-closeall')) { hidePopover(); for (const id of openTabs.slice()) closeTab(id); }
    });
  });
}
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tabmore]'); if (b) { e.stopPropagation(); openTabsMenu(b); } });
function closeTab(id) {
  const i = openTabs.indexOf(id);
  if (i < 0) return;
  openTabs.splice(i, 1);
  forgetScroll(id);
  if (currentDocId === id) {
    const next = openTabs[i] || openTabs[i - 1];
    if (next) openDoc(next); else showLibrary();
  } else renderTabs();
}
function cycleTab(dir) {
  if (!openTabs.length) return;
  const i = openTabs.indexOf(currentDocId);
  if (i < 0) { openDoc(dir > 0 ? openTabs[0] : openTabs[openTabs.length - 1]); return; }
  const n = i + dir;
  if (n < 0 || n >= openTabs.length) showLibrary();
  else openDoc(openTabs[n]);
}
$('#tabbar').addEventListener('click', e => {
  const x = e.target.closest('[data-close]');
  if (x) { e.stopPropagation(); closeTab(x.dataset.close); return; }
  const t = e.target.closest('[data-tab]'); if (!t) return;
  if (!t.dataset.tab) { if (currentDocId) showLibrary(); return; }
  if (t.dataset.tab !== currentDocId) openDoc(t.dataset.tab);
});
$('#tabbar').addEventListener('auxclick', e => {
  const t = e.target.closest('[data-tab]');
  if (t && t.dataset.tab && e.button === 1) { e.preventDefault(); closeTab(t.dataset.tab); }
});
$('#tabbar').addEventListener('wheel', e => {
  if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });
/* réordonner les onglets : glisser-déposer (ou Ctrl+Maj+PageUp / PageDown) */
let tabDrag = null;   // id de l'onglet glissé
function moveTab(id, to) {
  const from = openTabs.indexOf(id); if (from < 0) return;
  to = Math.max(0, Math.min(openTabs.length - 1, to));
  if (from === to) return;
  openTabs.splice(from, 1); openTabs.splice(to, 0, id);
  renderTabs();
}
function clearTabDropMarks() { $$('#tabbar .tab.drop-l, #tabbar .tab.drop-r').forEach(t => t.classList.remove('drop-l', 'drop-r')); }
$('#tabbar').addEventListener('dragstart', e => {
  const t = e.target.closest('.tab[data-tab]');
  if (!t || !t.dataset.tab) { e.preventDefault(); return; }
  tabDrag = t.dataset.tab;
  t.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', tabDrag); } catch { /* navigateur strict */ }
});
$('#tabbar').addEventListener('dragover', e => {
  if (!tabDrag) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  clearTabDropMarks();
  const t = e.target.closest('.tab[data-tab]');
  if (!t || t.dataset.tab === tabDrag) return;
  const r = t.getBoundingClientRect();
  t.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-l' : 'drop-r');
});
$('#tabbar').addEventListener('dragleave', e => { if (!e.relatedTarget || !$('#tabbar').contains(e.relatedTarget)) clearTabDropMarks(); });
$('#tabbar').addEventListener('drop', e => {
  if (!tabDrag) return;
  e.preventDefault();
  const t = e.target.closest('.tab[data-tab]');
  const id = tabDrag; tabDrag = null;
  clearTabDropMarks();
  if (!t || t.dataset.tab === id) { renderTabs(); return; }
  if (!t.dataset.tab) { moveTab(id, 0); return; }   // déposé sur « Bibliothèque » : en première position
  const r = t.getBoundingClientRect();
  const before = e.clientX < r.left + r.width / 2;
  const from = openTabs.indexOf(id);
  let to = openTabs.indexOf(t.dataset.tab);
  if (!before) to++;
  if (from < to) to--;
  moveTab(id, to);
});
$('#tabbar').addEventListener('dragend', () => { tabDrag = null; clearTabDropMarks(); $$('#tabbar .tab.dragging').forEach(t => t.classList.remove('dragging')); });

/* professeur de la séance (en-tête de la feuille) */
$('#doc-prof').addEventListener('input', e => {
  const d = doc(); if (!d) return;
  d.prof = e.target.value.trim(); d.updatedAt = Date.now(); save();
});
$('#doc-prof').addEventListener('change', e => rememberProf(e.target.value));
$('#doc-prof').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault(); e.target.blur();
    const d = doc(); if (e.key === 'Enter' && d && d.blocks.length) focusBlock(d.blocks[0].id, 'start');
  }
});

/* ---------------- défilement de l'éditeur (barres fixes en haut) ---------------- */
function editorTopInset() {
  const w = $('#docwrap');
  return parseFloat(getComputedStyle(w).paddingTop) || 122;
}
/* amène un bloc juste sous les barres (topbar + outils) */
function scrollToBlockEl(el, { smooth = true, margin = 4 } = {}) {
  const w = $('#docwrap'); if (!el || !w) return;
  const top = w.scrollTop + el.getBoundingClientRect().top - w.getBoundingClientRect().top - editorTopInset() + margin;
  w.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'instant' });
}
/* s'assure qu'un champ (curseur) reste visible entre les barres et le bas de la fenêtre */
function ensureFieldVisible(el) {
  const w = $('#docwrap'); if (!el || !w) return;
  const r = el.getBoundingClientRect();
  const topLimit = editorTopInset() + 8, bottomLimit = innerHeight - 40;
  if (r.top < topLimit) w.scrollTo({ top: w.scrollTop - (topLimit - r.top) - 24, behavior: 'instant' });
  else if (r.bottom > bottomLimit) w.scrollTo({ top: w.scrollTop + (r.bottom - bottomLimit) + 24, behavior: 'instant' });
}

function renderCrumbs() {
  const c = $('#breadcrumb');
  if (!currentDocId) { c.innerHTML = `<span>Mes cours</span>`; return; }
  const d = doc();
  if (isSharedDoc(d.id)) {
    const info = AlixoShare.infoFor(d.id) || {};
    c.innerHTML = `<button class="crumb-root" data-nav="__shared" title="Partagés avec moi">Partagés avec moi</button><span class="sep">›</span><span class="chip">${esc(info.owner || '')}${info.kind === 'folder' ? ' › ' + esc(info.title || '') : ''}</span><span class="sep">›</span><input id="tb-title" placeholder="Sans titre" value="${esc(d.titre || '')}" spellcheck="false" autocomplete="off" title="Titre de la séance" ${readOnly ? 'readonly' : ''}>`;
    return;
  }
  const path = folderPath(d.folderId);
  c.innerHTML = `<button class="crumb-root" data-nav="" title="Retour à Mes cours">Mes cours</button>` +
    path.map(f => `<span class="sep">›</span><button class="chip" data-nav="${f.id}" title="Ouvrir le dossier">${f.icone ? AlixoIcons.svg(f.icone, 'chip-ico') : ''}${esc(f.nom)}</button>`).join('') +
    `<span class="sep">›</span><input id="tb-title" placeholder="Sans titre" value="${esc(d.titre || '')}" spellcheck="false" autocomplete="off" title="${isSlidesDoc(d) ? 'Renommer la présentation' : isSheetDoc(d) ? 'Renommer le tableur' : isBoardDoc(d) ? 'Renommer la planche' : isQuizDoc(d) ? 'Renommer le quiz' : 'Renommer la séance'}">`;
}

/* navigation par le fil d'Ariane (depuis l'éditeur) */
$('#breadcrumb').addEventListener('click', e => {
  const b = e.target.closest('[data-nav]'); if (!b) return;
  if (b.dataset.nav === '__shared') { openSharedHome(); return; }
  currentFolderId = b.dataset.nav || null;
  for (const f of folderPath(currentFolderId)) expandedFolders.add(f.id);
  showLibrary();
});

/* titre de la séance, éditable dans le fil d'Ariane */
$('#breadcrumb').addEventListener('input', e => {
  if (e.target.id !== 'tb-title') return;
  const d = doc(); if (!d || readOnly) return;
  d.titre = e.target.value;
  if (isSpecialDoc(d)) { d.updatedAt = Date.now(); save(); }
  else touch({ typing: true, blockId: '__title' });
  const t = $(`#tabbar [data-tab="${d.id}"] .tab-name`); if (t) t.textContent = d.titre || 'Sans titre';
  if (pagesActive()) schedulePaginate(true);   // en-tête de la page 1
});
$('#breadcrumb').addEventListener('keydown', e => {
  if (e.target.id !== 'tb-title') return;
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault();
    e.target.blur();
    const d = doc();
    if (e.key === 'Enter' && d && !isSpecialDoc(d) && d.blocks.length) focusBlock(d.blocks[0].id, 'start');
  }
});

/* ============================================================
   Bibliothèque — explorateur
   ============================================================ */
const DOC_ICON = '<svg class="dicon" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></svg>';
const SLIDES_ICON = '<svg class="dicon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8M7 9h6M7 12h4"/></svg>';
const SHEET_ICON = '<svg class="dicon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16"/></svg>';
/* séance « présentation » (diapositives, js/slides.js) : d.kind === 'slides', d.slides = [...] ; d.blocks reste vide */
const isSlidesDoc = d => !!d && d.kind === 'slides';
/* séance « tableur » (grille de calcul, js/sheets.js) : d.kind === 'sheet', d.sheets = [...] ; d.blocks reste vide */
const isSheetDoc = d => !!d && d.kind === 'sheet';
/* séance « planche » (tableau blanc libre, js/board.js) : d.kind === 'board', d.items = [...] ; d.blocks reste vide */
const BOARD_ICON = '<svg class="dicon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="6" y="7" width="5" height="5" rx="1"/><path d="M14 9h4M14 12h3M11 18v3M9 21h4"/></svg>';
const isBoardDoc = d => !!d && d.kind === 'board';
/* séance « quiz » (1.24, js/quiz.js) : d.kind === 'quiz', d.questions = [...], d.results = [...] ; d.blocks reste vide */
const QUIZ_ICON = '<svg class="dicon" viewBox="0 0 24 24"><path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4"/><path d="M12 17h.01"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>';
const isQuizDoc = d => !!d && d.kind === 'quiz';
/* séance qui n'utilise pas l'éditeur de texte (présentation, tableur, planche, quiz) */
const isSpecialDoc = d => isSlidesDoc(d) || isSheetDoc(d) || isBoardDoc(d) || isQuizDoc(d);
const docIcon = d => (isSlidesDoc(d) ? SLIDES_ICON : isSheetDoc(d) ? SHEET_ICON : isBoardDoc(d) ? BOARD_ICON : isQuizDoc(d) ? QUIZ_ICON : DOC_ICON);

function treeDocsHTML(pid) {
  const docs = folderDocs(pid).slice().sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  return docs.map(d => `<div class="tree-row doc">
      <button class="tree-caret leaf">▶</button>
      <button class="tree-label" data-doc="${d.id}" title="${isSlidesDoc(d) ? 'Ouvrir la présentation' : isSheetDoc(d) ? 'Ouvrir le tableur' : isBoardDoc(d) ? 'Ouvrir la planche' : isQuizDoc(d) ? 'Ouvrir le quiz' : 'Ouvrir la séance'}">
        ${docIcon(d)}<span class="tree-name">${esc(d.titre || 'Sans titre')}</span>
      </button>
    </div>`).join('');
}

function treeHTML(pid, depth) {
  const kids = childFolders(pid);
  return kids.map(f => {
    const hasContent = childFolders(f.id).length > 0 || folderDocs(f.id).length > 0 || (window.AlixoFiles && AlixoFiles.count(f.id) > 0);
    const open = expandedFolders.has(f.id);
    const n = subtreeDocCount(f.id);
    return `<div class="tree-node" data-fid="${f.id}">
      <div class="tree-row ${currentFolderId === f.id ? 'active' : ''}" style="--mc:${f.couleur}">
        <button class="tree-caret ${hasContent ? (open ? 'open' : '') : 'leaf'}" data-caret="${f.id}">▶</button>
        <button class="tree-label" data-open="${f.id}" draggable="true">
          ${folderIconHTML(f)}<span class="tree-name">${esc(f.nom)}</span>
          <span class="tree-count">${n || ''}</span>
        </button>
      </div>
      ${hasContent && open ? `<div class="tree-kids">${treeHTML(f.id, depth + 1)}${treeDocsHTML(f.id)}${window.AlixoFiles ? AlixoFiles.sideTreeHTML(f.id) : ''}</div>` : ''}
    </div>`;
  }).join('');
}

function renderLibrary() {
  // arbre
  $('#folder-tree').innerHTML = `
    <div class="tree-row root ${currentFolderId === null && libMode === 'docs' ? 'active' : ''}">
      <button class="tree-caret leaf">▶</button>
      <button class="tree-label" data-open="">
        <svg class="ficon home-ico" viewBox="0 0 24 24"><path d="M4 11 12 4l8 7M6 10v9h12v-9"/></svg>
        <span class="tree-name">Mes cours</span>
        <span class="tree-count">${state.docs.length}</span>
      </button>
    </div>` + treeHTML(null, 0) + treeDocsHTML(null) + (window.AlixoFiles ? AlixoFiles.sideTreeHTML(null) : '') + sharedTreeHTML();

  // fil d'Ariane + titre
  const path = folderPath(currentFolderId);
  $('#lib-path').innerHTML = `<button data-nav="">Mes cours</button>` +
    path.map(f => `<span class="psep">›</span><button data-nav="${f.id}">${esc(f.nom)}</button>`).join('');
  const cur = folder(currentFolderId);
  $('#lib-title').innerHTML = (cur && cur.icone ? AlixoIcons.svg(cur.icone, 'title-ico') : '') + esc(cur ? cur.nom : 'Mes cours');
  document.documentElement.style.setProperty('--tint', cur ? folderTint(cur.id) : DEFAULT_TINT);

  // agenda (vue mois) ou partages à la place de la grille
  document.body.classList.toggle('lib-agenda', libMode === 'agenda' || libMode === 'shared' || libMode === 'todo');
  renderAgendaNav();
  const lnS = $('#ln-shared'); if (lnS) lnS.classList.toggle('active', libMode === 'shared' && !currentDocId);
  const lnT = $('#ln-todo'); if (lnT) lnT.classList.toggle('active', libMode === 'todo' && !currentDocId);
  const lt = $('#lib-todo');
  $('#lib-galaxy').hidden = true;
  if (libMode === 'shfolder') { $('#doc-grid').hidden = false; $('#lib-tree').hidden = true; $('#lib-agenda').hidden = true; $('#lib-shared').hidden = true; if (lt) lt.hidden = true; renderSharedFolder(); return; }
  if (libMode === 'todo') { $('#doc-grid').hidden = true; $('#lib-tree').hidden = true; $('#lib-agenda').hidden = true; $('#lib-shared').hidden = true; if (lt) lt.hidden = false; $('#lib-title').textContent = 'Tâches'; $('#lib-path').innerHTML = '<span>À faire</span>'; if (window.AlixoTodo) AlixoTodo.render(); return; }
  if (lt) lt.hidden = true;
  if (libMode === 'shared') { $('#doc-grid').hidden = true; $('#lib-tree').hidden = true; $('#lib-agenda').hidden = true; $('#lib-shared').hidden = false; $('#lib-title').textContent = 'Partagés avec moi'; $('#lib-path').innerHTML = '<span>Alixo Share</span>'; if (window.AlixoShare && AlixoShare.enabled) AlixoShare.renderSharedHome(); else $('#lib-shared').innerHTML = `<div class="sh-empty">Alixo Share nécessite un compte en ligne.<br>Paramètres › Compte › Se connecter, puis revenez ici pour partager vos cours et recevoir ceux de vos amis.</div>`; return; }
  $('#lib-shared').hidden = true;
  if (libMode === 'agenda') { $('#doc-grid').hidden = true; $('#lib-tree').hidden = true; $('#lib-agenda').hidden = false; renderAgendaHome(); return; }
  $('#lib-agenda').hidden = true;

  // bascule grille / arbre / galaxie
  const view = state.settings.libView || 'grid';
  $$('#view-seg button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#doc-grid').hidden = view !== 'grid';
  $('#lib-tree').hidden = view !== 'tree';
  $('#lib-galaxy').hidden = view !== 'galaxy';
  if (view === 'tree') { renderLibTree(); return; }
  if (view === 'galaxy') { if (window.AlixoGalaxy) AlixoGalaxy.render(); return; }

  // grille : dossiers puis séances
  const folders = childFolders(currentFolderId);
  let docs = folderDocs(currentFolderId).slice().sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  const grid = $('#doc-grid');

  let html = '';
  if (folders.length) {
    html += folders.map(f => {
      const nd = subtreeDocCount(f.id);
      const nf = childFolders(f.id).length;
      const nfi = window.AlixoFiles ? AlixoFiles.subtreeCount(f.id) : 0;
      const meta = [nd ? `${nd} séance${nd > 1 ? 's' : ''}` : '', nf ? `${nf} dossier${nf > 1 ? 's' : ''}` : '', nfi ? `${nfi} fichier${nfi > 1 ? 's' : ''}` : '', profBadgeHTML(f)].filter(Boolean).join(' · ') || 'Vide';
      return `<button class="folder-card" data-fid="${f.id}" draggable="true" style="--mc:${f.couleur}">
        ${folderIconHTML(f, true)}
        <div><h3>${esc(f.nom)}</h3><div class="meta">${meta}</div></div>
        <span class="fc-act ren" data-ren="${f.id}" title="Renommer"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg></span>
        <span class="fc-act del" data-fdel="${f.id}" title="Supprimer"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span>
      </button>`;
    }).join('');
  }
  if (folders.length && docs.length) html += `<div class="grid-sect">Séances</div>`;
  html += docs.map(d => {
    const tint = folderTint(d.folderId);
    if (isSlidesDoc(d)) {
      const ns = (d.slides || []).length;
      const preview = window.AlixoSlides ? AlixoSlides.preview(d) : '';
      return `<button class="doc-card slides-card" data-id="${d.id}" draggable="true" style="--mc:${tint}">
      <span class="mat-chip">${SLIDES_ICON}${esc(folder(d.folderId)?.nom || 'Présentation')}</span>
      <h3>${esc(d.titre || 'Sans titre')}</h3>
      <div class="preview slides-prev">${preview || '<span class="sp-empty">Présentation vide</span>'}</div>
      <div class="meta">${fmtDate(d.updatedAt)} · ${ns} diapositive${ns > 1 ? 's' : ''}${d.prof ? ` · <span class="card-prof">${esc(d.prof)}</span>` : ''}</div>
      <span class="pin-btn ${d.pinned ? 'pinned' : ''}" data-pin="${d.id}" title="Épingler">
        <svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg></span>
      <span class="del-btn" data-del="${d.id}" title="Supprimer">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span>
    </button>`;
    }
    if (isSheetDoc(d)) {
      const nc = window.AlixoSheets ? AlixoSheets.cellCount(d) : 0;
      const nf = (d.sheets || []).length;
      return `<button class="doc-card sheet-card" data-id="${d.id}" draggable="true" style="--mc:${tint}">
      <span class="mat-chip">${SHEET_ICON}${esc(folder(d.folderId)?.nom || 'Tableur')}</span>
      <h3>${esc(d.titre || 'Sans titre')}</h3>
      <div class="preview sheet-prev">${window.AlixoSheets ? AlixoSheets.preview(d) : ''}</div>
      <div class="meta">${fmtDate(d.updatedAt)} · ${nf} feuille${nf > 1 ? 's' : ''} · ${nc} cellule${nc > 1 ? 's' : ''}${d.prof ? ` · <span class="card-prof">${esc(d.prof)}</span>` : ''}</div>
      <span class="pin-btn ${d.pinned ? 'pinned' : ''}" data-pin="${d.id}" title="Épingler">
        <svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg></span>
      <span class="del-btn" data-del="${d.id}" title="Supprimer">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span>
    </button>`;
    }
    if (isBoardDoc(d)) {
      const ni = window.AlixoBoard ? AlixoBoard.itemCount(d) : (d.items || []).length;
      return `<button class="doc-card board-card" data-id="${d.id}" draggable="true" style="--mc:${tint}">
      <span class="mat-chip">${BOARD_ICON}${esc(folder(d.folderId)?.nom || 'Planche')}</span>
      <h3>${esc(d.titre || 'Sans titre')}</h3>
      <div class="preview board-prev">${window.AlixoBoard ? AlixoBoard.preview(d) : ''}</div>
      <div class="meta">${fmtDate(d.updatedAt)} · ${ni} élément${ni > 1 ? 's' : ''}${d.prof ? ` · <span class="card-prof">${esc(d.prof)}</span>` : ''}</div>
      <span class="pin-btn ${d.pinned ? 'pinned' : ''}" data-pin="${d.id}" title="Épingler">
        <svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg></span>
      <span class="del-btn" data-del="${d.id}" title="Supprimer">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span>
    </button>`;
    }
    if (isQuizDoc(d)) {
      const nq = window.AlixoQuiz ? AlixoQuiz.count(d) : (d.questions || []).length;
      return `<button class="doc-card quiz-card" data-id="${d.id}" draggable="true" style="--mc:${tint}">
      <span class="mat-chip">${QUIZ_ICON}${esc(folder(d.folderId)?.nom || 'Quiz')}</span>
      <h3>${esc(d.titre || 'Sans titre')}</h3>
      <div class="preview quiz-prev">${window.AlixoQuiz ? AlixoQuiz.preview(d) : ''}</div>
      <div class="meta">${fmtDate(d.updatedAt)} · ${nq} question${nq > 1 ? 's' : ''}${(d.results || []).length ? ` · ${d.results.length} résultat${d.results.length > 1 ? 's' : ''}` : ''}${d.prof ? ` · <span class="card-prof">${esc(d.prof)}</span>` : ''}</div>
      <span class="pin-btn ${d.pinned ? 'pinned' : ''}" data-pin="${d.id}" title="Épingler">
        <svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg></span>
      <span class="del-btn" data-del="${d.id}" title="Supprimer">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span>
    </button>`;
    }
    const firstText = d.blocks.find(b => ['p', 'callout', 'quote', 'li'].includes(b.type));
    const preview = firstText ? stripTags(firstText.text) : (d.blocks.length ? d.blocks.length + ' blocs' : 'Document vide');
    const nb = d.blocks.length;
    return `<button class="doc-card" data-id="${d.id}" draggable="true" style="--mc:${tint}">
      <span class="mat-chip">${esc(folder(d.folderId)?.nom || 'Séance')}</span>
      <h3>${esc(d.titre || 'Sans titre')}</h3>
      <div class="preview">${esc(preview)}</div>
      <div class="meta">${fmtDate(d.updatedAt)} · ${nb} bloc${nb > 1 ? 's' : ''}${d.prof ? ` · <span class="card-prof">${esc(d.prof)}</span>` : ''}</div>
      <span class="pin-btn ${d.pinned ? 'pinned' : ''}" data-pin="${d.id}" title="Épingler">
        <svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg></span>
      <span class="del-btn" data-del="${d.id}" title="Supprimer">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span>
    </button>`;
  }).join('');

  if (window.AlixoFiles) html += AlixoFiles.gridHTML(currentFolderId, !!html);
  if (!currentFolderId) html += sharedSectionHTML(!!html);
  if (!html) {
    html = `<div class="empty-state"><div class="big">${AlixoIcons.svg('folder-open')}</div>
      <p>Ce dossier est vide.<br>Créez un sous-dossier ou une nouvelle séance, ou glissez ici vos fichiers (PDF, Word, diaporamas, images…) : ils s’ouvrent directement dans Alixo.</p></div>`;
  }
  grid.innerHTML = html;
}

/* ---------------- partagés avec moi : dans la bibliothèque (1.15) ---------------- */
const SHARE_ICO = '<svg class="dicon" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>';
let sharedNav = null;   // { sid, fid } dossier partagé affiché (libMode 'shfolder')
function sharedDocCardHTML(d, tint, owner, role) {
  const ns = isSlidesDoc(d) ? (d.slides || []).length : 0;
  const nf = isSheetDoc(d) ? (d.sheets || []).length : 0;
  const ni = isBoardDoc(d) ? (window.AlixoBoard ? AlixoBoard.itemCount(d) : (d.items || []).length) : 0;
  const nq = isQuizDoc(d) ? (d.questions || []).length : 0;
  const firstText = !isSpecialDoc(d) && (d.blocks || []).find(b => ['p', 'callout', 'quote', 'li'].includes(b.type));
  const preview = isSlidesDoc(d) ? (window.AlixoSlides ? AlixoSlides.preview(d) : '')
    : isSheetDoc(d) ? (window.AlixoSheets ? AlixoSheets.preview(d) : '')
    : isBoardDoc(d) ? (window.AlixoBoard ? AlixoBoard.preview(d) : '')
    : isQuizDoc(d) ? (window.AlixoQuiz ? AlixoQuiz.preview(d) : '')
    : esc(firstText ? stripTags(firstText.text) : ((d.blocks || []).length ? d.blocks.length + ' blocs' : 'Document vide'));
  const count = isSlidesDoc(d) ? `${ns} diapositive${ns > 1 ? 's' : ''}`
    : isSheetDoc(d) ? `${nf} feuille${nf > 1 ? 's' : ''}`
    : isBoardDoc(d) ? `${ni} élément${ni > 1 ? 's' : ''}`
    : isQuizDoc(d) ? `${nq} question${nq > 1 ? 's' : ''}`
    : `${(d.blocks || []).length} bloc${(d.blocks || []).length > 1 ? 's' : ''}`;
  const peers = window.AlixoShare && AlixoShare.enabled ? AlixoShare.peersFor(d.id) : [];
  return `<button class="doc-card shared-card ${isSlidesDoc(d) ? 'slides-card' : ''}${isSheetDoc(d) ? 'sheet-card' : ''}${isBoardDoc(d) ? 'board-card' : ''}${isQuizDoc(d) ? 'quiz-card' : ''}" data-id="${d.id}" style="--mc:${tint}">
      <span class="mat-chip">${SHARE_ICO}${esc(owner || 'Partagé')}</span>
      <h3>${esc(d.titre || 'Sans titre')}</h3>
      <div class="preview ${isSlidesDoc(d) ? 'slides-prev' : ''}${isSheetDoc(d) ? 'sheet-prev' : ''}${isBoardDoc(d) ? 'board-prev' : ''}${isQuizDoc(d) ? 'quiz-prev' : ''}">${preview}</div>
      <div class="meta">${fmtDate(d.updatedAt || Date.now())} · ${count} · <span class="sh-role ${role}">${role === 'write' ? 'écriture' : 'lecture'}</span>${peers.length ? `<span class="peer-live" title="${esc(peers.map(p => p.name).join(', '))}">● ${peers.length === 1 ? esc(peers[0].name) + ' est dessus' : peers.length + ' personnes dessus'}</span>` : ''}</div>
    </button>`;
}
function sharedSectionHTML(hasContent) {
  if (!window.AlixoShare || !AlixoShare.enabled) return '';
  const folders = AlixoShare.sharedFolders();
  const docs = AlixoShare.sharedDocsAlone().filter(x => x.d);
  const n = AlixoShare.pendingCount();
  if (!folders.length && !docs.length && !n) return '';
  let html = `<div class="grid-sect grid-sect-shared">${SHARE_ICO}Partagés avec moi${n ? ` <button class="sh-pending" data-nav="__shared" type="button">${n} invitation${n > 1 ? 's' : ''} en attente</button>` : ''}</div>`;
  html += folders.map(f => `<button class="folder-card shared-card" data-shf="${f.sid}" data-fid="${f.rootId}" style="--mc:${esc(f.color)}">
      ${f.icone ? AlixoIcons.svg(f.icone, 'ficon-ico big') : FOLDER_ICON_BIG}
      <div><h3>${esc(f.title)}</h3><div class="meta">${SHARE_ICO}par ${esc(f.owner)} · ${f.nDocs} séance${f.nDocs > 1 ? 's' : ''}${f.nFiles ? ` · ${f.nFiles} fichier${f.nFiles > 1 ? 's' : ''}` : ''} · <span class="sh-role ${f.role}">${f.role === 'write' ? 'écriture' : 'lecture'}</span></div></div>
    </button>`).join('');
  html += docs.map(x => sharedDocCardHTML(x.d, x.color, x.owner, x.role)).join('');
  return html;
}
function openSharedFolder(sid, fid) {
  libMode = 'shfolder'; sharedNav = { sid, fid: fid || null };
  if (currentDocId) showLibrary(); else renderLibrary();
  const g = $('#doc-grid'); if (g) g.scrollTop = 0;
}
function renderSharedFolder() {
  const v = window.AlixoShare && AlixoShare.enabled && sharedNav ? AlixoShare.sharedFolderView(sharedNav.sid, sharedNav.fid) : null;
  if (!v) { libMode = 'docs'; sharedNav = null; renderLibrary(); return; }
  $('#lib-path').innerHTML = `<button data-nav="">Mes cours</button><span class="psep">›</span><button data-shnav="${v.sid}" data-fid="${v.rootId}">${esc(v.sh.title)}</button>` + v.path.map(f => `<span class="psep">›</span><button data-shnav="${v.sid}" data-fid="${f.id}">${esc(f.nom)}</button>`).join('');
  $('#lib-title').innerHTML = (v.cur && v.cur.icone ? AlixoIcons.svg(v.cur.icone, 'title-ico') : '') + esc(v.cur ? v.cur.nom : v.sh.title) + `<span class="title-shared">${SHARE_ICO}partagé par ${esc(v.sh.owner)} · ${v.sh.role === 'write' ? 'écriture' : 'lecture seule'}</span>`;
  document.documentElement.style.setProperty('--tint', (v.cur && v.cur.couleur) || v.sh.color || DEFAULT_TINT);
  document.body.classList.remove('lib-agenda');
  $$('#view-seg button').forEach(b => b.classList.remove('on'));
  let html = v.folders.map(f => `<button class="folder-card shared-card" data-shf="${v.sid}" data-fid="${f.id}" style="--mc:${esc(f.couleur || v.sh.color)}">
      ${f.icone ? AlixoIcons.svg(f.icone, 'ficon-ico big') : FOLDER_ICON_BIG}
      <div><h3>${esc(f.nom)}</h3><div class="meta">${f.nDocs ? `${f.nDocs} séance${f.nDocs > 1 ? 's' : ''}` : 'Vide'}</div></div>
    </button>`).join('');
  if (v.folders.length && v.docs.length) html += `<div class="grid-sect">Séances</div>`;
  html += v.docs.map(d => sharedDocCardHTML(d, (v.cur && v.cur.couleur) || v.sh.color, v.sh.owner, v.sh.role)).join('');
  if (window.AlixoFiles) html += AlixoFiles.sharedGridHTML(v.files || [], !!(v.folders.length || v.docs.length));
  if (!html) html = `<div class="empty-state"><div class="big">${AlixoIcons.svg('folder-open')}</div><p>${v.state === 'loading' ? 'Chargement du dossier partagé…' : 'Ce dossier partagé est vide pour l’instant.'}</p></div>`;
  $('#doc-grid').innerHTML = html;
  // arbre de gauche : mise en avant
  $$('#folder-tree .tree-row').forEach(r => r.classList.remove('active'));
  const row = $(`#folder-tree [data-shrow="${v.sid}"]`); if (row) row.closest('.tree-row').classList.add('active');
}
/* section « Partagés avec moi » de l'explorateur de gauche */
function sharedTreeHTML() {
  if (!window.AlixoShare || !AlixoShare.enabled) return '';
  const folders = AlixoShare.sharedFolders(), docs = AlixoShare.sharedDocsAlone().filter(x => x.d);
  if (!folders.length && !docs.length) return '';
  return `<div class="tree-shared"><div class="ln-title tree-shtitle">${SHARE_ICO}Partagés avec moi</div>` +
    folders.map(f => `<div class="tree-row ${libMode === 'shfolder' && sharedNav && sharedNav.sid === f.sid ? 'active' : ''}" style="--mc:${esc(f.color)}"><button class="tree-caret leaf">▶</button><button class="tree-label" data-shrow="${f.sid}" data-fid="${f.rootId}" title="Dossier partagé par ${esc(f.owner)}">${f.icone ? AlixoIcons.svg(f.icone, 'ficon-ico') : FOLDER_ICON}<span class="tree-name">${esc(f.title)}</span><span class="tree-count">${f.nDocs || ''}</span></button></div>`).join('') +
    docs.map(x => `<div class="tree-row doc"><button class="tree-caret leaf">▶</button><button class="tree-label" data-doc="${x.d.id}" title="Séance partagée par ${esc(x.owner)}">${docIcon(x.d)}<span class="tree-name">${esc(x.d.titre || 'Sans titre')}</span></button></div>`).join('') + `</div>`;
}

/* ---------------- accès à la séance ouverte : qui la voit (1.15) ---------------- */
function renderAccess() {
  let box = $('#access-chips');
  if (!box) { box = document.createElement('button'); box.id = 'access-chips'; box.className = 'access-chips'; box.type = 'button'; $('#btn-share').before(box); box.addEventListener('click', () => { const a = window.AlixoShare && AlixoShare.enabled && currentDocId ? AlixoShare.accessFor(currentDocId) : null; if (!a) return; if (a.isOwner) AlixoShare.openShareManager(a.sid); else AlixoShare.openInfo(currentDocId); }); }
  const a = window.AlixoShare && AlixoShare.enabled && currentDocId ? AlixoShare.accessFor(currentDocId) : null;
  if (!a) { box.hidden = true; box.innerHTML = ''; return; }
  const peers = AlixoShare.peersFor(currentDocId);
  const here = new Set(peers.map(p => p.uid));
  const av = (name, u, cls) => `<span class="acc-av ${cls || ''} ${here.has(u) ? 'here' : ''}" style="--pc:${AlixoShare.colorFor(u)}" title="${esc(name)}${here.has(u) ? ' · ici en ce moment' : ''}">${esc((name || '?').trim()[0].toUpperCase())}</span>`;
  const me = AlixoShare.me();
  let people = [];
  if (a.isOwner) { people = [{ n: a.owner.name || 'Moi', u: a.owner.uid, cls: 'owner' }].concat(a.members.map(m => ({ n: m.name, u: m.uid }))); }
  else { people = [{ n: a.owner.name, u: a.owner.uid, cls: 'owner' }, { n: me.name, u: me.uid }].concat(peers.filter(p => p.uid !== a.owner.uid).map(p => ({ n: p.name, u: p.uid }))); }
  const shown = people.slice(0, 5);
  box.hidden = false;
  box.title = a.isOwner ? `${a.members.length} membre${a.members.length > 1 ? 's' : ''}${a.invites.length ? ` · ${a.invites.length} invitation${a.invites.length > 1 ? 's' : ''} en attente` : ''} — cliquer pour gérer les accès` : `Partagé par ${a.owner.name} — cliquer pour les détails`;
  box.innerHTML = shown.map(p => av(p.n, p.u, p.cls)).join('') + (people.length > 5 ? `<span class="acc-more">+${people.length - 5}</span>` : '') + (a.isOwner ? `<span class="acc-lbl">${a.members.length ? a.members.length + (a.members.length > 1 ? ' membres' : ' membre') : 'Partagé'}${a.invites.length ? ` · ${a.invites.length} en attente` : ''}</span>` : `<span class="acc-lbl">${peers.length ? `${peers.length} ici` : 'Partagé'}</span>`);
}
/* marqueurs des blocs que d'autres membres modifient en ce moment */
function renderPeers() {
  if (!blocksEl) return;
  blocksEl.querySelectorAll('.block[data-peer]').forEach(el => { el.removeAttribute('data-peer'); el.style.removeProperty('--peer'); });
  if (!window.AlixoShare || !AlixoShare.enabled || !currentDocId || isSpecialDoc(doc())) return;
  for (const p of AlixoShare.peersFor(currentDocId)) {
    if (!p.blockId) continue;
    const el = blocksEl.querySelector(`.block[data-id="${p.blockId}"]`); if (!el) continue;
    el.dataset.peer = (el.dataset.peer ? el.dataset.peer + ', ' : '') + p.name;
    el.style.setProperty('--peer', p.color || AlixoShare.colorFor(p.uid));
  }
}
/* fusion d'une version reçue dans la séance ouverte : on garde le bloc en cours de frappe, on prend le reste (1.15) */
function mergeRemoteDoc(remote, byName) {
  const d = doc();
  if (!d || d.id !== remote.id) return remote;
  if (isSlidesDoc(remote) || isSlidesDoc(d)) {
    Object.assign(d, remote);
    if (window.AlixoSlides) AlixoSlides.remoteChanged();
    return d;
  }
  if (isSheetDoc(remote) || isSheetDoc(d)) {
    Object.assign(d, remote);
    if (window.AlixoSheets) AlixoSheets.remoteChanged();
    return d;
  }
  if (isBoardDoc(remote) || isBoardDoc(d)) {
    Object.assign(d, remote);
    if (window.AlixoBoard) AlixoBoard.remoteChanged();
    return d;
  }
  if (isQuizDoc(remote) || isQuizDoc(d)) {
    Object.assign(d, remote);
    if (window.AlixoQuiz) AlixoQuiz.remoteChanged();
    return d;
  }
  if (!readOnly) syncAllFromDom();
  const typing = Date.now() - hist.typingTs < 4000;
  const keepId = typing ? lastBlockId : null;
  const localKeep = keepId ? d.blocks.find(b => b.id === keepId) : null;
  const before = new Map(d.blocks.map(b => [b.id, JSON.stringify(b)]));
  // pages : on prend celles du distant, mais les blocs affichés sont ceux de l'onglet courant
  const remoteBlocks = Array.isArray(remote.blocks) ? remote.blocks : [];
  const merged = remoteBlocks.map(b => (localKeep && b.id === keepId ? localKeep : b));
  if (localKeep && !merged.some(b => b.id === keepId)) {
    const i = d.blocks.findIndex(b => b.id === keepId);
    const prevId = i > 0 ? d.blocks[i - 1].id : null;
    const j = prevId ? merged.findIndex(b => b.id === prevId) : -1;
    merged.splice(j + 1, 0, localKeep);
  }
  const changed = merged.filter(b => before.get(b.id) !== JSON.stringify(b)).map(b => b.id);
  const titleChanged = remote.titre !== d.titre;
  Object.assign(d, remote, { blocks: merged, updatedAt: Math.max(d.updatedAt || 0, remote.updatedAt || 0) });
  if (titleChanged) renderCrumbs();
  renderBlocks(undefined);
  hist.baseline = snapshotDoc();
  changed.forEach(id => { const el = blocksEl.querySelector(`.block[data-id="${id}"]`); if (el) { el.classList.add('peer-flash'); setTimeout(() => el.classList.remove('peer-flash'), 1800); } });
  renderPeers();
  if (changed.length && byName && !typing) toast(`${byName} vient de modifier ${changed.length > 1 ? changed.length + ' blocs' : 'un bloc'}`, { duration: 2500 });
  return d;
}

/* ---------------- vue arbre (façon Obsidian) ---------------- */
function treeNodeHTML(f) {
  const pid = f ? f.id : null;
  const kidsF = childFolders(pid);
  const kidsD = folderDocs(pid).slice().sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  const kidsFiles = window.AlixoFiles ? AlixoFiles.libTreeHTML(pid) : '';
  const has = kidsF.length + kidsD.length > 0 || !!kidsFiles;
  const card = f
    ? `<button class="tn-card tn-folder ${currentFolderId === f.id ? 'active' : ''} ${has ? 'has-kids' : ''}" data-tfid="${f.id}" draggable="true" style="--mc:${f.couleur}">
        ${folderIconHTML(f)}<span class="tn-name">${esc(f.nom)}</span><span class="tn-count">${subtreeDocCount(f.id) || ''}</span></button>`
    : `<button class="tn-card tn-root ${currentFolderId === null ? 'active' : ''} ${has ? 'has-kids' : ''}" data-tfid="">
        <svg class="ficon home-ico" viewBox="0 0 24 24"><path d="M4 11 12 4l8 7M6 10v9h12v-9"/></svg><span class="tn-name">Mes cours</span><span class="tn-count">${state.docs.length || ''}</span></button>`;
  const kids = has ? `<div class="tn-kids">${kidsF.map(c => treeNodeHTML(c)).join('')}${kidsD.map(d =>
    `<div class="tn"><button class="tn-card tn-doc" data-tdoc="${d.id}" draggable="true">${docIcon(d)}<span class="tn-name">${esc(d.titre || 'Sans titre')}</span></button></div>`).join('')}${kidsFiles}</div>` : '';
  return `<div class="tn">${card}${kids}</div>`;
}
function renderLibTree() {
  $('#lib-tree').innerHTML = `<div class="tn-canvas">${treeNodeHTML(null)}</div>`;
}

$('#view-seg').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  state.settings.libView = b.dataset.view; save(); renderLibrary();
});
$('#lib-tree').addEventListener('click', e => {
  const dBtn = e.target.closest('[data-tdoc]');
  if (dBtn) { openDoc(dBtn.dataset.tdoc); return; }
  const fBtn = e.target.closest('[data-tfid]');
  if (fBtn) gotoFolder(fBtn.dataset.tfid || null);
});
$('#lib-tree').addEventListener('contextmenu', e => {
  const dBtn = e.target.closest('.tn-doc');
  if (dBtn) { e.preventDefault(); openDocCtxMenu(e.clientX, e.clientY, dBtn.dataset.tdoc); return; }
  const fBtn = e.target.closest('.tn-folder'); if (!fBtn) return;
  e.preventDefault();
  openFolderCtxMenu(e.clientX, e.clientY, fBtn.dataset.tfid);
});
/* glisser-déposer des séances et des dossiers dans la vue arbre */
$('#lib-tree').addEventListener('dragstart', e => {
  const c = e.target.closest('.tn-doc, .tn-folder');
  if (!c) { e.preventDefault(); return; }
  if (c.classList.contains('tn-file')) startDrag('file', c.dataset.file, c, e);
  else if (c.classList.contains('tn-doc')) startDrag('doc', c.dataset.tdoc, c, e);
  else startDrag('folder', c.dataset.tfid, c, e);
});
$('#lib-tree').addEventListener('dragend', endDrag);
$('#lib-tree').addEventListener('dragover', e => {
  if (!drag) return;
  const t = e.target.closest('.tn-folder, .tn-root');
  clearDropTargets();
  if (t && canDropOn(t.dataset.tfid || null)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; t.classList.add('drop-target'); }
});
$('#lib-tree').addEventListener('drop', e => {
  if (!drag) return;
  const t = e.target.closest('.tn-folder, .tn-root'); if (!t) return;
  e.preventDefault();
  dropOn(t.dataset.tfid || null);
});

function gotoFolder(fid) {
  libMode = 'docs'; sharedNav = null;
  currentFolderId = fid || null;
  // déplie le chemin
  for (const f of folderPath(currentFolderId)) expandedFolders.add(f.id);
  renderLibrary();
  const g = $('#doc-grid'); if (g) g.scrollTop = 0;
  const t = $('#lib-tree'); if (t) t.scrollTop = 0;
}

$('#folder-tree').addEventListener('click', e => {
  const caret = e.target.closest('[data-caret]');
  if (caret) {
    const id = caret.dataset.caret;
    expandedFolders.has(id) ? expandedFolders.delete(id) : expandedFolders.add(id);
    renderLibrary(); return;
  }
  const docBtn = e.target.closest('[data-doc]');
  if (docBtn) { openDoc(docBtn.dataset.doc); return; }
  const shrow = e.target.closest('[data-shrow]');
  if (shrow) { openSharedFolder(shrow.dataset.shrow, shrow.dataset.fid); return; }
  const open = e.target.closest('[data-open]');
  if (open) gotoFolder(open.dataset.open || null);
});

$('#lib-path').addEventListener('click', e => {
  const sn = e.target.closest('[data-shnav]');
  if (sn) { openSharedFolder(sn.dataset.shnav, sn.dataset.fid); return; }
  const b = e.target.closest('[data-nav]');
  if (b) gotoFolder(b.dataset.nav || null);
});

$('#doc-grid').addEventListener('click', e => {
  const ren = e.target.closest('[data-ren]');
  if (ren) { e.stopPropagation(); openFolderPopover(folder(ren.dataset.ren)); return; }
  const fdel = e.target.closest('[data-fdel]');
  if (fdel) {
    e.stopPropagation();
    deleteFolder(folder(fdel.dataset.fdel));
    return;
  }
  const shf = e.target.closest('[data-shf]');
  if (shf) { openSharedFolder(shf.dataset.shf, shf.dataset.fid); return; }
  const shp = e.target.closest('.sh-pending');
  if (shp) { openSharedHome(); return; }
  const fcard = e.target.closest('.folder-card');
  if (fcard) { gotoFolder(fcard.dataset.fid); return; }
  const pin = e.target.closest('[data-pin]');
  if (pin) { e.stopPropagation(); togglePin(pin.dataset.pin); return; }
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); deleteDoc(del.dataset.del); return; }
  const card = e.target.closest('.doc-card');
  if (card) { openDoc(card.dataset.id); return; }
  /* 1.18 : un clic gauche dans le vide ne fait plus rien (le menu « créer ici » surgissait dès qu'on
     cliquait à côté d'une carte) ; il reste accessible au clic droit et par les boutons du haut */
  if (e.target.closest('.empty-state')) openCreateMenu(e.clientX, e.clientY);
});
$('#doc-grid').addEventListener('contextmenu', e => {
  const shc = e.target.closest('.shared-card');
  if (shc) { e.preventDefault(); if (shc.dataset.id && window.AlixoShare) AlixoShare.openInfo(shc.dataset.id); return; }
  const card = e.target.closest('.doc-card');
  if (card) { e.preventDefault(); openDocCtxMenu(e.clientX, e.clientY, card.dataset.id); return; }
  if (e.target.id === 'doc-grid' || e.target.closest('.empty-state, .grid-sect')) { e.preventDefault(); openCreateMenu(e.clientX, e.clientY); }
});
$('#lib-tree').addEventListener('contextmenu', e => {
  if (e.target.id === 'lib-tree' || e.target.classList.contains('tn-canvas')) { e.preventDefault(); openCreateMenu(e.clientX, e.clientY); }
});
/* menu « créer ici » (clic droit dans le vide de la bibliothèque, ou clic sur le message « dossier vide ») */
function openCreateMenu(x, y) {
  const cur = folder(currentFolderId);
  const menu = $('#ctxmenu');
  menu.innerHTML = `<div class="cm-title">${cur ? esc(cur.nom) : 'Mes cours'}</div>
    <button data-cm="cnewdoc">${CM_ICO.open}Nouvelle séance ici</button>
    <button data-cm="cnewslides">${SLIDES_ICON}Nouvelle présentation ici</button>
    <button data-cm="cnewsheet">${SHEET_ICON}Nouveau tableur ici</button>
    <button data-cm="cnewboard">${BOARD_ICON}Nouvelle planche ici</button>
    <button data-cm="cnewquiz">${QUIZ_ICON}Nouveau quiz ici</button>
    <button data-cm="cnewfolder">${CM_ICO.folder}Nouveau dossier ici</button>
    <button data-cm="cimport">${CM_ICO.plus}Importer des fichiers ici… (PDF, Word, images…)</button>
    ${cur ? `<button data-cm="cagenda">${CM_ICO.plus}Ajouter ce cours à l’agenda</button>` : ''}`;
  menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = '';
  placeCtxMenu(menu, x, y);
}

function togglePin(id) {
  const d = state.docs.find(x => x.id === id); if (!d) return;
  d.pinned = !d.pinned; save(); renderLibrary();
}

/* ---------------- suppression avec confirmation et annulation ---------------- */
function refreshLibrary() { if (!currentDocId) renderLibrary(); }

function deleteDoc(id) {
  const d = state.docs.find(x => x.id === id); if (!d) return;
  const go = () => {
    const idx = state.docs.indexOf(d);
    state.docs = state.docs.filter(x => x.id !== d.id);
    tombstone('docs', d.id);
    const ti = openTabs.indexOf(d.id); if (ti >= 0) openTabs.splice(ti, 1);
    if (currentDocId === d.id) { currentDocId = null; showLibrary(); } else renderTabs();
    save(); refreshLibrary();
    toast(`« ${d.titre || 'Sans titre'} » supprimée`, {
      action: 'Annuler', onAction: () => {
        if (!state.docs.some(x => x.id === d.id)) state.docs.splice(Math.min(idx, state.docs.length), 0, d);
        untomb('docs', d.id);
        save(); refreshLibrary(); toast('Séance restaurée');
      }
    });
  };
  const hasContent = (d.blocks || []).some(b => blockPlain(b).trim());
  if (!hasContent) { go(); return; }
  confirmDialog({
    title: `Supprimer « ${d.titre || 'Sans titre'} » ?`,
    text: 'La séance sera retirée de la bibliothèque. Vous pourrez annuler pendant quelques secondes.'
  }).then(ok => { if (ok) go(); });
}

function deleteFolder(f) {
  if (!f) return;
  const ids = descendantIds(f.id);
  const docs = state.docs.filter(d => ids.includes(d.folderId));
  const nDocs = docs.length;
  const go = () => {
    const folders = state.folders.filter(x => ids.includes(x.id));
    state.folders = state.folders.filter(x => !ids.includes(x.id));
    state.docs = state.docs.filter(d => !ids.includes(d.folderId));
    folders.forEach(x => tombstone('folders', x.id));
    docs.forEach(d => tombstone('docs', d.id));
    const goneFiles = window.AlixoFiles ? AlixoFiles.detachFolders(ids) : { count: 0, restore() {}, finalize() {} };
    const filesTm = setTimeout(() => goneFiles.finalize(), 9000);
    openTabs = openTabs.filter(id => !docs.some(d => d.id === id));
    if (ids.includes(currentFolderId)) currentFolderId = f.parentId || null;
    save(); renderTabs(); renderLibrary();
    toast(`Dossier « ${f.nom} » supprimé`, {
      action: 'Annuler', onAction: () => {
        for (const x of folders) if (!state.folders.some(y => y.id === x.id)) { state.folders.push(x); untomb('folders', x.id); }
        for (const d of docs) if (!state.docs.some(y => y.id === d.id)) { state.docs.push(d); untomb('docs', d.id); }
        clearTimeout(filesTm); goneFiles.restore();
        folders.forEach(x => expandedFolders.add(x.id));
        save(); renderLibrary(); toast('Dossier restauré');
      }
    });
  };
  const nFiles = window.AlixoFiles ? AlixoFiles.subtreeCount(f.id) : 0;
  const hasContent = nDocs || childFolders(f.id).length || nFiles;
  if (!hasContent) { go(); return; }
  confirmDialog({
    title: `Supprimer le dossier « ${f.nom} » ?`,
    text: nDocs
      ? `${nDocs} séance${nDocs > 1 ? 's' : ''} ${nDocs > 1 ? 'seront supprimées' : 'sera supprimée'} avec le dossier et ses sous-dossiers${nFiles ? `, ainsi que ${nFiles} fichier${nFiles > 1 ? 's' : ''}` : ''}. Annulation possible pendant quelques secondes.`
      : (nFiles ? `${nFiles} fichier${nFiles > 1 ? 's' : ''} et les sous-dossiers seront supprimés. Annulation possible pendant quelques secondes.` : 'Ses sous-dossiers seront supprimés. Annulation possible pendant quelques secondes.')
  }).then(ok => { if (ok) go(); });
}

/* pierres tombales : mémoire des suppressions pour que la synchronisation ne ressuscite pas
   un dossier ou une séance supprimés (voir js/sync.js) */
function tombstone(kind, id) {
  if (!state.deleted) state.deleted = { docs: {}, folders: {} };
  if (!state.deleted[kind]) state.deleted[kind] = {};
  state.deleted[kind][id] = Date.now();
}
function untomb(kind, id) { if (state.deleted && state.deleted[kind]) delete state.deleted[kind][id]; }
function isTombstoned(kind, id, since = 0) {
  const t = state.deleted && state.deleted[kind] && state.deleted[kind][id];
  return !!t && t >= since;
}

/* boîte de confirmation dans le style de l'application (remplace confirm()) */
function confirmDialog({ title, text = '', ok = 'Supprimer', cancel = 'Annuler', danger = true }) {
  return new Promise(resolve => {
    showPopover(`<h4>${esc(title)}</h4>
      ${text ? `<div class="po-confirm-text">${esc(text)}</div>` : ''}
      <div class="po-row" style="justify-content:flex-end; gap:8px; margin-top:12px">
        <button class="cta ghost small" id="po-cancel" type="button">${esc(cancel)}</button>
        <button class="pobtn ${danger ? 'danger' : ''}" id="po-ok" type="button">${esc(ok)}</button>
      </div>`,
      centerRect(), pop => {
        let done = false;
        const fin = v => { if (done) return; done = true; pop._onHide = null; hidePopover(); resolve(v); };
        pop._onHide = () => fin(false);
        pop.querySelector('#po-ok').addEventListener('click', () => fin(true));
        pop.querySelector('#po-cancel').addEventListener('click', () => fin(false));
        pop.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); fin(true); }
          if (e.key === 'Tab') {
            e.preventDefault();
            const a = pop.querySelector('#po-ok'), b = pop.querySelector('#po-cancel');
            (document.activeElement === a ? b : a).focus();
          }
        });
        setTimeout(() => { const c = pop.querySelector('#po-cancel'); if (c) c.focus(); }, 30);
      });
  });
}

/* ---------------- menu contextuel des séances ---------------- */
const CM_ICO = {
  open: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l1 7 2.5 3h-13L8 10Z"/></svg>',
  move: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 13h6M13 10l3 3-3 3"/></svg>',
  dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  zip: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>'
};

function placeCtxMenu(menu, x, y) {
  menu.hidden = false;
  menu.style.left = Math.max(6, Math.min(x, innerWidth - menu.offsetWidth - 10)) + 'px';
  menu.style.top = Math.max(6, Math.min(y, innerHeight - menu.offsetHeight - 10)) + 'px';
}

function openDocCtxMenu(x, y, did) {
  const d = state.docs.find(v => v.id === did); if (!d) return;
  const menu = $('#ctxmenu');
  menu.innerHTML = `
    <div class="cm-title">${esc(d.titre || 'Sans titre')}</div>
    <button data-cm="dopen">${CM_ICO.open}Ouvrir</button>
    <button data-cm="drename">${CM_ICO.pen}Renommer…</button>
    <button data-cm="dpin">${CM_ICO.pin}${d.pinned ? 'Désépingler' : 'Épingler'}</button>
    <button data-cm="dmove">${CM_ICO.move}Déplacer vers…</button>
    <button data-cm="ddup">${CM_ICO.dup}Dupliquer</button>
    <button data-cm="dshare">${CM_ICO.share}Partager…</button>
    <button data-cm="ddelete" class="danger">${CM_ICO.trash}Supprimer</button>`;
  menu.dataset.fid = ''; menu.dataset.did = did; menu.dataset.tbl = ''; menu.dataset.img = '';
  placeCtxMenu(menu, x, y);
}

function openRenameDocPopover(did) {
  const d = state.docs.find(x => x.id === did); if (!d) return;
  showPopover(`<h4>Renommer la séance</h4>
    <div class="po-row"><input id="po-dname" value="${esc(d.titre || '')}" placeholder="Sans titre" spellcheck="false"><button class="pobtn" id="po-dname-ok">OK</button></div>`,
    centerRect(), pop => {
      const inp = pop.querySelector('#po-dname');
      const ok = () => {
        d.titre = inp.value.trim(); d.updatedAt = Date.now(); save(); hidePopover();
        if (currentDocId) renderCrumbs(); else renderLibrary();
      };
      pop.querySelector('#po-dname-ok').addEventListener('click', ok);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      setTimeout(() => { inp.focus(); inp.select(); }, 40);
    });
}

function duplicateDoc(did) {
  const d = state.docs.find(x => x.id === did); if (!d) return;
  const copy = JSON.parse(JSON.stringify(d));
  copy.id = uid(); copy.titre = (d.titre || 'Sans titre') + ' (copie)';
  copy.createdAt = copy.updatedAt = Date.now(); copy.pinned = false;
  (copy.blocks || []).forEach(b => { b.id = uid(); });
  (copy.pages || []).forEach(p => { (p.blocks || []).forEach(b => { b.id = uid(); }); });
  (copy.slides || []).forEach(sl => { sl.id = uid(); (sl.els || []).forEach(el => { el.id = uid(); }); });
  if (Array.isArray(copy.items)) {
    /* planche : nouveaux identifiants, en gardant les flèches entre les éléments copiés */
    const ids = new Map(copy.items.map(it => [it.id, uid()]));
    copy.items.forEach(it => { it.id = ids.get(it.id); if (it.t === 'arrow') { it.from = ids.get(it.from) || it.from; it.to = ids.get(it.to) || it.to; } });
  }
  if (Array.isArray(copy.questions)) {
    /* quiz : nouveaux identifiants de questions et de propositions (les bonnes réponses suivent) ; les résultats ne sont pas copiés */
    copy.questions.forEach(q => { q.id = uid(); if (Array.isArray(q.opts)) { const m = new Map(q.opts.map(o => [o.id, uid()])); q.opts.forEach(o => { o.id = m.get(o.id); }); if (q.t === 'mcq' && Array.isArray(q.ans)) q.ans = q.ans.map(a => m.get(a) || a); } });
    copy.results = [];
  }
  state.docs.push(copy); save(); renderLibrary();
  toast(isSlidesDoc(copy) ? 'Présentation dupliquée' : isSheetDoc(copy) ? 'Tableur dupliqué' : isBoardDoc(copy) ? 'Planche dupliquée' : isQuizDoc(copy) ? 'Quiz dupliqué' : 'Séance dupliquée');
}

/* choix d'un dossier de destination (séance ou dossier) */
function openMovePopover(kind, id) {
  const item = kind === 'folder' ? folder(id) : state.docs.find(d => d.id === id);
  if (!item) return;
  const excluded = kind === 'folder' ? new Set(descendantIds(id)) : new Set();
  const curParent = kind === 'folder' ? (item.parentId || null) : (item.folderId || null);
  const rows = [];
  const walk = (pid, depth) => {
    for (const f of childFolders(pid)) {
      if (excluded.has(f.id)) continue;
      rows.push({ f, depth }); walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  const name = kind === 'folder' ? item.nom : (item.titre || 'Sans titre');
  showPopover(`<h4>Déplacer « ${esc(name)} » vers…</h4><div class="po-list po-move">
      <button data-mv="" class="${curParent === null ? 'cur' : ''}"><svg class="ficon home-ico" viewBox="0 0 24 24"><path d="M4 11 12 4l8 7M6 10v9h12v-9"/></svg>Mes cours</button>
      ${rows.map(r => `<button data-mv="${r.f.id}" class="${r.f.id === curParent ? 'cur' : ''}" style="padding-left:${10 + r.depth * 16}px; --mc:${r.f.couleur}">${folderIconHTML(r.f)}${esc(r.f.nom)}</button>`).join('')}
    </div>${rows.length ? '' : '<div class="po-hint">Aucun autre dossier disponible.</div>'}`,
    centerRect(), pop => pop.querySelector('.po-list').addEventListener('click', e => {
      const b = e.target.closest('[data-mv]'); if (!b) return;
      hidePopover();
      if (kind === 'folder') moveFolderTo(id, b.dataset.mv || null);
      else moveDocToFolder(id, b.dataset.mv || null);
    }));
}

function createDocIn(fid) {
  const d = {
    id: uid(), folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false,
    prof: folderProf(fid),
    blocks: [{ id: uid(), type: 'p', text: '', day: todayKey() }]
  };
  state.docs.push(d); save();
  openDoc(d.id);
  setTimeout(() => { const t = $('#tb-title'); if (t) t.focus(); }, 60);
}

/* ---------------- glisser-déposer des séances et dossiers ---------------- */
let drag = null;   // { kind: 'doc' | 'folder' | 'file', id }

function clearDropTargets() {
  $$('.drop-target').forEach(x => x.classList.remove('drop-target'));
}
function startDrag(kind, id, el, e) {
  drag = { kind, id };
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
}
function endDrag() {
  drag = null;
  $$('.dragging').forEach(x => x.classList.remove('dragging'));
  clearDropTargets();
}
/* peut-on déposer l'élément glissé dans ce dossier (null = racine) ? */
function canDropOn(fid) {
  if (!drag) return false;
  fid = fid || null;
  if (drag.kind === 'doc') {
    const d = state.docs.find(x => x.id === drag.id);
    return !!d && (d.folderId || null) !== fid;
  }
  if (drag.kind === 'file') { const fl = window.AlixoFiles && AlixoFiles.byId(drag.id); return !!fl && (fl.folderId || null) !== fid; }
  const f = folder(drag.id);
  if (!f || (f.parentId || null) === fid) return false;
  return !descendantIds(drag.id).includes(fid);
}
function dropOn(fid) {
  if (!drag) return;
  const { kind, id } = drag;
  endDrag();
  if (kind === 'file') { if (window.AlixoFiles) AlixoFiles.move(id, fid); return; }
  if (kind === 'doc') moveDocToFolder(id, fid); else moveFolderTo(id, fid);
}
function moveDocToFolder(docId, fid) {
  const d = state.docs.find(x => x.id === docId);
  if (!d) return;
  fid = fid || null;
  if ((d.folderId || null) === fid) { clearDropTargets(); return; }
  d.folderId = fid;
  d.updatedAt = Date.now();
  if (!d.prof && fid) d.prof = folderProf(fid);   // hérite du professeur du dossier d'arrivée
  if (fid) for (const f of folderPath(fid)) expandedFolders.add(f.id);
  save(); refreshLibrary();
  if (currentDocId === d.id) { renderCrumbs(); document.documentElement.style.setProperty('--tint', folderTint(d.folderId)); }
  const f = folder(fid);
  toast(f ? `Déplacé vers « ${f.nom} »` : 'Déplacé vers Mes cours');
}
function moveFolderTo(fid, targetId) {
  const f = folder(fid); if (!f) return;
  targetId = targetId || null;
  if (targetId === fid || (targetId && descendantIds(fid).includes(targetId))) { toast('Impossible de déplacer un dossier dans lui-même'); return; }
  if ((f.parentId || null) === targetId) return;
  f.parentId = targetId;
  if (targetId) for (const p of folderPath(targetId)) expandedFolders.add(p.id);
  save(); renderLibrary();
  const t = folder(targetId);
  toast(t ? `Dossier déplacé vers « ${t.nom} »` : 'Dossier déplacé vers Mes cours');
}

$('#doc-grid').addEventListener('dragstart', e => {
  const card = e.target.closest('.doc-card, .folder-card, .file-card');
  if (!card) { e.preventDefault(); return; }
  if (card.classList.contains('file-card')) startDrag('file', card.dataset.file, card, e);
  else if (card.classList.contains('doc-card')) startDrag('doc', card.dataset.id, card, e);
  else startDrag('folder', card.dataset.fid, card, e);
});
$('#doc-grid').addEventListener('dragend', endDrag);
$('#doc-grid').addEventListener('dragover', e => {
  if (!drag) return;
  const fc = e.target.closest('.folder-card');
  clearDropTargets();
  if (fc && canDropOn(fc.dataset.fid)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; fc.classList.add('drop-target'); }
});
$('#doc-grid').addEventListener('drop', e => {
  if (!drag) return;
  const fc = e.target.closest('.folder-card');
  if (!fc) return;
  e.preventDefault();
  dropOn(fc.dataset.fid);
});
$('#folder-tree').addEventListener('dragstart', e => {
  const lab = e.target.closest('.tree-label[data-open]');
  if (!lab || !lab.dataset.open) { e.preventDefault(); return; }
  startDrag('folder', lab.dataset.open, lab.closest('.tree-row'), e);
});
$('#folder-tree').addEventListener('dragend', endDrag);
$('#folder-tree').addEventListener('dragover', e => {
  if (!drag) return;
  const row = e.target.closest('.tree-row');
  clearDropTargets();
  const openBtn = row && row.querySelector('[data-open]');
  if (openBtn && canDropOn(openBtn.dataset.open || null)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drop-target'); }
});
$('#folder-tree').addEventListener('drop', e => {
  if (!drag) return;
  const row = e.target.closest('.tree-row');
  const openBtn = row && row.querySelector('[data-open]');
  if (!openBtn) return;
  e.preventDefault();
  dropOn(openBtn.dataset.open || null);
});
/* dépôt sur le fil d'Ariane de la bibliothèque (remonter d'un niveau, racine…) */
$('#lib-path').addEventListener('dragover', e => {
  if (!drag) return;
  const b = e.target.closest('[data-nav]');
  clearDropTargets();
  if (b && canDropOn(b.dataset.nav || null)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; b.classList.add('drop-target'); }
});
$('#lib-path').addEventListener('drop', e => {
  if (!drag) return;
  const b = e.target.closest('[data-nav]'); if (!b) return;
  e.preventDefault();
  dropOn(b.dataset.nav || null);
});

$('#btn-new-doc').addEventListener('click', () => createDocIn(currentFolderId));
$('#btn-new-slides').addEventListener('click', () => createSlidesIn(currentFolderId));
$('#btn-new-sheet').addEventListener('click', () => createSheetIn(currentFolderId));
$('#btn-new-board').addEventListener('click', () => createBoardIn(currentFolderId));
$('#btn-new-quiz').addEventListener('click', () => createQuizIn(currentFolderId));
/* 1.25 — menu « Autres » de la barre de création : dossier, planche, quiz, import (les trois types principaux restent en boutons) */
const IMPORT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>';
function openCreateMenu(btn) {
  const menu = $('#ctxmenu');
  if (!menu.hidden && menu.classList.contains('cm-create')) { closeCtxMenu(); return; }
  menu.innerHTML = `
    <div class="cm-title">Créer dans « ${esc(currentFolderId ? (folder(currentFolderId) || {}).nom || 'ce dossier' : 'Mes cours')} »</div>
    <button data-cm="cnewfolder">${CM_ICO.folder}<span class="cm-lbl">Dossier<small>Un cours, une matière, un semestre</small></span></button>
    <button data-cm="cnewboard">${BOARD_ICON}<span class="cm-lbl">Planche<small>Tableau blanc libre : post-it, formes, schémas, cartes mentales</small></span></button>
    <button data-cm="cnewquiz">${QUIZ_ICON}<span class="cm-lbl">Quiz<small>Questions à tester ou à présenter en direct</small></span></button>
    <div class="cm-sep"></div>
    <button data-cm="cimport">${IMPORT_ICON}<span class="cm-lbl">Importer des fichiers…<small>PDF, Word, PowerPoint, Excel, images, audio</small></span></button>`;
  menu.className = 'cm-create';
  menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = '';
  const r = btn.getBoundingClientRect();
  placeCtxMenu(menu, r.right - 250, r.bottom + 6);
  btn.classList.add('open');
  const off = () => { btn.classList.remove('open'); menu.classList.remove('cm-create'); document.removeEventListener('click', off, true); };
  setTimeout(() => document.addEventListener('click', off, true), 0);
}
$('#btn-new-more').addEventListener('click', e => { e.stopPropagation(); openCreateMenu(e.currentTarget); });
/* nouvelle présentation (diapositives) : même fiche qu'une séance, avec kind: 'slides' — voir js/slides.js */
function createSlidesIn(fid) {
  if (!window.AlixoSlides) { toast('Module de présentation indisponible'); return; }
  const d = AlixoSlides.newDoc(fid || null, folderProf(fid));
  state.docs.push(d); save();
  openDoc(d.id);
  setTimeout(() => { const t = $('#tb-title'); if (t) t.focus(); }, 60);
}
/* nouveau tableur : même fiche qu'une séance, avec kind: 'sheet' — voir js/sheets.js */
function createSheetIn(fid) {
  if (!window.AlixoSheets) { toast('Module de tableur indisponible'); return; }
  const d = AlixoSheets.newDoc(fid || null, folderProf(fid));
  state.docs.push(d); save();
  openDoc(d.id);
  setTimeout(() => { const t = $('#tb-title'); if (t) t.focus(); }, 60);
}
/* nouvelle planche (tableau blanc libre) : même fiche qu'une séance, avec kind: 'board' — voir js/board.js */
function createBoardIn(fid) {
  if (!window.AlixoBoard) { toast('Module de planche indisponible'); return; }
  const d = AlixoBoard.newDoc(fid || null, folderProf(fid));
  state.docs.push(d); save();
  openDoc(d.id);
  setTimeout(() => { const t = $('#tb-title'); if (t) t.focus(); }, 60);
}

/* nouveau quiz (1.24) : même fiche qu'une séance, avec kind: 'quiz' — voir js/quiz.js */
function createQuizIn(fid) {
  if (!window.AlixoQuiz) { toast('Module de quiz indisponible'); return; }
  const d = AlixoQuiz.newDoc(fid || null, folderProf(fid));
  state.docs.push(d); save();
  openDoc(d.id);
  setTimeout(() => { const t = $('#tb-title'); if (t) t.focus(); }, 60);
}

/* création / renommage de dossier */
function openFolderPopover(existing, parentId = currentFolderId) {
  const parentColor = existing ? existing.couleur : (folder(parentId)?.couleur || FOLDER_COLORS[10]);
  const curIcon = existing ? (existing.icone || '') : '';
  const curProf = existing ? (existing.prof || '') : folderProf(parentId);
  showPopover(`<h4>${existing ? 'Modifier le dossier' : 'Nouveau dossier'}</h4>
    <div class="po-row"><input id="po-f-name" placeholder="Ex. Droit administratif" value="${existing ? esc(existing.nom) : ''}"></div>
    <div class="po-label">Professeur</div>
    <div class="po-row"><input id="po-f-prof" list="profs-list" placeholder="Ex. Mme Dupont" autocomplete="off" value="${esc(curProf)}"></div>
    <div class="po-hint" style="margin-top:4px">Repris automatiquement sur les séances du dossier (modifiable sur chaque séance).</div>
    <div class="po-label">Couleur</div>
    <div class="po-colors" id="po-colors">
      ${FOLDER_COLORS.map(c => `<button data-c="${c}" class="${c === parentColor ? 'sel' : ''}" style="background:${c}"></button>`).join('')}
    </div>
    <div class="po-label">Icône</div>
    <div class="po-icons" id="po-icons">
      <button data-i="" class="none ${curIcon ? '' : 'sel'}" title="Icône par défaut">${FOLDER_ICON}</button>
      ${Object.entries(FOLDER_ICONS).map(([sect, list]) => `<div class="po-icons-sect">${sect}</div>` +
        list.map(i => `<button data-i="${i}" class="${i === curIcon ? 'sel' : ''}" title="${i}">${AlixoIcons.svg(i)}</button>`).join('')).join('')}
    </div>
    <div class="po-row" style="margin-top:12px; justify-content:flex-end"><button class="pobtn" id="po-f-ok">${existing ? 'Enregistrer' : 'Créer'}</button></div>`,
    centerRect(), pop => {
      let color = parentColor, icone = curIcon;
      pop.querySelector('#po-colors').addEventListener('click', e => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        color = b.dataset.c;
        pop.querySelectorAll('#po-colors button').forEach(x => x.classList.toggle('sel', x === b));
      });
      pop.querySelector('#po-icons').addEventListener('click', e => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        icone = b.dataset.i;
        pop.querySelectorAll('#po-icons button').forEach(x => x.classList.toggle('sel', x === b));
      });
      const ok = () => {
        const nom = pop.querySelector('#po-f-name').value.trim();
        if (!nom) return;
        const prof = pop.querySelector('#po-f-prof').value.trim();
        rememberProf(prof);
        if (existing) {
          const oldProf = existing.prof || '';
          existing.nom = nom; existing.couleur = color; existing.icone = icone; existing.prof = prof;
          if (prof !== oldProf) {
            // les séances du dossier (et sous-dossiers) sans professeur, ou avec l'ancien, suivent le nouveau nom
            const ids = new Set(descendantIds(existing.id));
            const inherited = oldProf || folderProf(existing.parentId);
            state.docs.forEach(d => { if (ids.has(d.folderId) && (!d.prof || d.prof === inherited)) d.prof = prof || folderProf(d.folderId); });
          }
        } else {
          const f = { id: uid(), nom, couleur: color, icone, parentId: parentId || null, prof };
          state.folders.push(f);
          if (parentId) for (const p of folderPath(parentId)) expandedFolders.add(p.id);
        }
        save(); hidePopover(); refreshLibrary();
        if (currentDocId) { renderCrumbs(); document.documentElement.style.setProperty('--tint', folderTint(doc().folderId)); }
      };
      pop.querySelector('#po-f-ok').addEventListener('click', ok);
      pop.querySelector('#po-f-name').addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      pop.querySelector('#po-f-prof').addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      setTimeout(() => pop.querySelector('#po-f-name')?.focus(), 40);
    });
}
$('#btn-new-folder').addEventListener('click', () => openFolderPopover(null));
$('#btn-new-folder-side').addEventListener('click', () => openFolderPopover(null));

/* ---------------- menu contextuel des dossiers ---------------- */
function openFolderCtxMenu(x, y, fid) {
  const f = folder(fid); if (!f) return;
  const menu = $('#ctxmenu');
  menu.innerHTML = `
    <div class="cm-title">${esc(f.nom)}</div>
    <button data-cm="open">${CM_ICO.folder}Ouvrir</button>
    <button data-cm="newdoc">${CM_ICO.plus}Nouvelle séance ici</button>
    <button data-cm="newslides">${SLIDES_ICON}Nouvelle présentation ici</button>
    <button data-cm="newsheet">${SHEET_ICON}Nouveau tableur ici</button>
    <button data-cm="newboard">${BOARD_ICON}Nouvelle planche ici</button>
    <button data-cm="newquiz">${QUIZ_ICON}Nouveau quiz ici</button>
    <button data-cm="newfolder">${CM_ICO.plus}Nouveau sous-dossier…</button>
    <button data-cm="import">${CM_ICO.plus}Importer des fichiers…</button>
    <button data-cm="rename">${CM_ICO.pen}Renommer / couleur…</button>
    <button data-cm="move">${CM_ICO.move}Déplacer vers…</button>
    <button data-cm="zip">${CM_ICO.zip}Télécharger en .zip</button>
    <button data-cm="share">${CM_ICO.share}Partager le dossier…</button>
    <button data-cm="delete" class="danger">${CM_ICO.trash}Supprimer</button>`;
  menu.dataset.fid = fid; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = '';
  placeCtxMenu(menu, x, y);
}
function closeCtxMenu() { $('#ctxmenu').hidden = true; }

$('#ctxmenu').addEventListener('click', e => {
  const b = e.target.closest('[data-cm]'); if (!b) return;
  const menu = $('#ctxmenu');
  const f = folder(menu.dataset.fid);
  const did = menu.dataset.did;
  closeCtxMenu();
  const cm = b.dataset.cm;
  if (cm.startsWith('pg') && menu.dataset.page) {
    const pid = menu.dataset.page;
    if (cm === 'pgrename') openRenamePagePopover(pid); else if (cm === 'pgleft') movePage(pid, -1); else if (cm === 'pgright') movePage(pid, 1); else if (cm === 'pgadd') addPage(); else if (cm === 'pgdelete') deletePage(pid);
    return;
  }
  if (cm === 'cnewdoc') { createDocIn(currentFolderId); return; }
  if (cm === 'cnewslides') { createSlidesIn(currentFolderId); return; }
  if (cm === 'cnewsheet') { createSheetIn(currentFolderId); return; }
  if (cm === 'cnewboard') { createBoardIn(currentFolderId); return; }
  if (cm === 'cnewquiz') { createQuizIn(currentFolderId); return; }
  if (cm === 'cnewfolder') { openFolderPopover(null, currentFolderId); return; }
  if (cm === 'cimport') { if (window.AlixoFiles) AlixoFiles.pick(currentFolderId); return; }
  if (cm === 'cagenda') { openEventPopover(null, { folderId: currentFolderId }); return; }
  if (cm.startsWith('i') && menu.dataset.img) {
    const id = menu.dataset.img; const ib = getBlock(id); if (!ib || ib.type !== 'img') return;
    if (cm === 'isz') { ib.w = +b.dataset.pct; touch(); renderBlocks('__none'); selectObj(id); return; }
    if (cm === 'isize') { imgSizePopover(id, { left: e.clientX, top: e.clientY, bottom: e.clientY }); return; }
    if (cm === 'ial') { ib.align = b.dataset.al; if (ib.align !== 'center' && (ib.w || 60) > 60) ib.w = 45; touch(); renderBlocks('__none'); selectObj(id); return; }
    if (cm === 'icrop') { selectObj(id); startCrop(id); return; }
    if (cm === 'iuncrop') { delete ib.crop; touch(); renderBlocks('__none'); selectObj(id); return; }
    if (cm === 'icap') {
      if (ib.cap === undefined || ib.cap === null) { ib.cap = ''; touch(); renderBlocks('__none'); const fc = $(`#blocks > .block[data-id="${id}"] figcaption`); if (fc) focusField(fc, 'start'); }
      else { delete ib.cap; touch(); renderBlocks('__none'); selectObj(id); }
      return;
    }
    if (cm === 'ireplace') { pickImages(id); return; }
    if (cm === 'idel') { deleteObj(id); return; }
    return;
  }
  if (cm.startsWith('t') && menu.dataset.tbl) {
    const tb = getBlock(menu.dataset.tbl); if (!tb || tb.type !== 'table') return;
    const cells = tsel && tsel.bid === tb.id ? tselCells() : [lastCell];
    if (cm === 'tbg') { setCellsBg(tb, cells, b.dataset.bg); return; }
    if (cm === 'tbgmore') { openPalettePopover({ left: e.clientX, top: e.clientY, bottom: e.clientY }, { title: 'Couleur de fond des cases', none: 'Aucune couleur', onPick: c => setCellsBg(tb, cells, c === 'none' ? '' : c) }); return; }
    if (cm === 'tal') { setCellsTa(tb, cells, b.dataset.al); return; }
    const ops = { 'trow-': 'rowabove', 'trow+': 'row+', 'tcol-': 'colleft', 'tcol+': 'col+', 'tdelrow': 'row-', 'tdelcol': 'col-', 'thead': 'head', 'tdel': 'del', 'tcopy': 'copy', 'tdup': 'dup', 'tmerge': 'merge', 'tsplit': 'split' };
    if (ops[cm]) tableOp(tb, ops[cm]);
    return;
  }
  if (cm.startsWith('d')) {
    const d = state.docs.find(x => x.id === did); if (!d) return;
    if (cm === 'dopen') openDoc(d.id);
    if (cm === 'drename') openRenameDocPopover(d.id);
    if (cm === 'dpin') togglePin(d.id);
    if (cm === 'dmove') openMovePopover('doc', d.id);
    if (cm === 'ddup') duplicateDoc(d.id);
    if (cm === 'dshare') openShare('doc', d.id);
    if (cm === 'ddelete') deleteDoc(d.id);
    return;
  }
  if (!f) return;
  if (cm === 'open') gotoFolder(f.id);
  if (cm === 'newdoc') createDocIn(f.id);
  if (cm === 'newslides') createSlidesIn(f.id);
  if (cm === 'newsheet') createSheetIn(f.id);
  if (cm === 'newboard') createBoardIn(f.id);
  if (cm === 'newquiz') createQuizIn(f.id);
  if (cm === 'newfolder') openFolderPopover(null, f.id);
  if (cm === 'import' && window.AlixoFiles) AlixoFiles.pick(f.id);
  if (cm === 'rename') openFolderPopover(f);
  if (cm === 'move') openMovePopover('folder', f.id);
  if (cm === 'zip') downloadFolderZip(f.id);
  if (cm === 'share') openShare('folder', f.id);
  if (cm === 'delete') deleteFolder(f);
});
document.addEventListener('pointerdown', e => {
  if (!$('#ctxmenu').hidden && !e.target.closest('#ctxmenu')) closeCtxMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCtxMenu(); });

$('#doc-grid').addEventListener('contextmenu', e => {
  const fc = e.target.closest('.folder-card'); if (!fc) return;
  e.preventDefault();
  openFolderCtxMenu(e.clientX, e.clientY, fc.dataset.fid);
});
$('#folder-tree').addEventListener('contextmenu', e => {
  const docBtn = e.target.closest('[data-doc]');
  if (docBtn) { e.preventDefault(); openDocCtxMenu(e.clientX, e.clientY, docBtn.dataset.doc); return; }
  const row = e.target.closest('.tree-row'); if (!row) return;
  const openBtn = row.querySelector('[data-open]');
  if (!openBtn || !openBtn.dataset.open) return; // pas la racine
  e.preventDefault();
  openFolderCtxMenu(e.clientX, e.clientY, openBtn.dataset.open);
});

/* ---------------- export .zip d'un dossier ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(data) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* archive zip sans compression (méthode STORE) */
function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);        // noms en UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(local.buffer), nameB, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true);
    cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, nameB.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameB);
    offset += 30 + nameB.length + f.data.length;
  }
  const centralSize = central.reduce((s, a) => s + a.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}

const safeFileName = s => (s || '').replace(/[\\/:*?"<>|]/g, '·').trim() || 'Sans titre';

function docExportHTML(d, cssText) {
  const numMap = computeNumbers(d.blocks);
  const body = d.blocks.map(b => blockHTML(b, numMap)).join('')
    .replace(/ contenteditable="(?:true|false)"/g, '').replace(/ draggable="false"/g, '')
    .replace(/ draggable="true"/g, '');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(d.titre || 'Sans titre')}</title>
<style>${cssText}
body { overflow: auto; background: #fff; padding: 40px 16px; }
#doc { margin: 0 auto; border: 1px solid #dadce0; }
.bhandle, .mv-handle, .rz, .graph-controls, .fhint, .tbl-tools, .corr-notes, .ai-sug, .draw-tools, .draw-hrz, .dh, .dsel { display: none !important; }
.block.draw.empty .draw-wrap::after { content: none; }
.block.li.cl .cbox { pointer-events: none; }
.tbl .tcell:focus { box-shadow: none; }
#blocks [data-ph]::before, #blocks .jref::before, #blocks .jval::before, #blocks figcaption::before, #blocks .qcite::before { content: none !important; }
.exp-title { font-family: var(--font-serif); font-size: 28px; font-weight: 650; margin-bottom: 24px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
</style></head>
<body><article id="doc"><h1 class="exp-title">${esc(d.titre || 'Sans titre')}</h1><div id="blocks">${body}</div></article>${exportWatermarked() ? `<div id="alixo-wm" class="wm-screen" aria-hidden="true"><span class="wm-big">${WM_TEXT}</span><span class="wm-foot">Fait avec Alixo · alixoapp.com</span></div>` : ''}</body></html>`;
}

const EXPORT_FORMATS = { pdf: { label: 'PDF', ext: '.pdf' }, docx: { label: 'Word (.docx)', ext: '.docx' }, html: { label: 'Page web (.html)', ext: '.html' } };

/* génère le fichier d'une séance dans le format choisi dans les paramètres */
async function exportDocFile(d0, fmt, css) {
  const d = flatDoc(d0);
  await preloadImages(d);
  if (fmt === 'pdf') return new Uint8Array(await (await AlixoExport.exportDocPdf(d)).arrayBuffer());
  if (fmt === 'docx') return new Uint8Array(await (await AlixoExport.exportDocDocx(d)).arrayBuffer());
  return new TextEncoder().encode(docExportHTML(d, css));
}

async function downloadFolderZip(fid) {
  const root = folder(fid); if (!root) return;
  const fmt = EXPORT_FORMATS[state.settings.exportFormat] ? state.settings.exportFormat : 'pdf';
  const ext = EXPORT_FORMATS[fmt].ext;
  let css = '';
  if (fmt === 'html') { try { css = await (await fetch('styles.css')).text(); } catch { /* export sans styles si hors-ligne */ } }
  const jobs = [];
  const used = new Set();
  const walk = (f, path) => {
    for (const d of folderDocs(f.id)) {
      const base = safeFileName(d.titre);
      /* un tableur s'exporte en CSV (une feuille = un fichier), pas dans le format des séances */
      if (isSheetDoc(d) && window.AlixoSheets) {
        for (const sh of (d.sheets || [])) {
          let name = `${path}${base}${(d.sheets || []).length > 1 ? ' — ' + safeFileName(sh.name) : ''}.csv`;
          for (let k = 2; used.has(name); k++) name = `${path}${base} (${k}).csv`;
          used.add(name);
          jobs.push({ name, csv: { d, sheetId: sh.id } });
        }
        continue;
      }
      /* une planche (tableau blanc) n'a pas d'équivalent texte : elle s'exporte en PDF depuis sa vue, pas dans l'archive */
      if (isBoardDoc(d)) continue;
      /* un quiz s'exporte en PDF depuis sa vue (questions et réponses), pas dans l'archive */
      if (isQuizDoc(d)) continue;
      let name = `${path}${base}${ext}`;
      for (let k = 2; used.has(name); k++) name = `${path}${base} (${k})${ext}`;
      used.add(name);
      jobs.push({ name, d });
    }
    for (const fl of (window.AlixoFiles ? AlixoFiles.inFolder(f.id) : [])) {
      let name = `${path}${fl.name}`;
      for (let k = 2; used.has(name); k++) name = `${path}(${k}) ${fl.name}`;
      used.add(name);
      jobs.push({ name, file: fl });
    }
    for (const c of childFolders(f.id)) walk(c, `${path}${safeFileName(c.nom)}/`);
  };
  walk(root, `${safeFileName(root.nom)}/`);
  if (!jobs.length) { toast('Dossier vide — rien à exporter'); return; }
  toast(`Export ${EXPORT_FORMATS[fmt].label} de ${jobs.length} élément(s)…`);
  const files = [];
  for (const j of jobs) {
    try {
      if (j.file) { const buf = await AlixoFiles.getData(j.file.id); if (buf) files.push({ name: j.name, data: new Uint8Array(buf) }); }
      else if (j.csv) files.push({ name: j.name, data: new TextEncoder().encode(AlixoSheets.sheetCSV(j.csv.d, j.csv.sheetId)) });
      else files.push({ name: j.name, data: await exportDocFile(j.d, fmt, css) });
    }
    catch (err) { console.error('Export impossible :', j.name, err); }
  }
  if (!files.length) { toast('Échec de l’export'); return; }
  const blob = makeZip(files);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(root.nom)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`${files.length} élément(s) exporté(s) (séances en ${EXPORT_FORMATS[fmt].label}, fichiers d’origine) — .zip`);
}

/* ---------------- paramètres ---------------- */
/* ---------------- stockage : taille des données du compte (ce qui part dans la base) ---------------- */
const fmtBytes = n => { if (!(n >= 0)) return '—'; if (n < 1024) return Math.round(n) + ' o'; if (n < 1048576) return Math.round(n / 1024) + ' Ko'; if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',') + ' Mo'; return (n / 1073741824).toFixed(2).replace('.', ',') + ' Go'; };
const fmtGo = n => (Math.max(0, n || 0) / 1073741824).toFixed(n >= 10737418240 ? 1 : 2).replace('.', ',') + ' Go';
const utf8Len = str => { try { return new TextEncoder().encode(str).length; } catch { return String(str).length; } };
/* somme des tailles d'un magasin IndexedDB (data URL, ArrayBuffer ou Blob) */
function idbSum(dbName, store) {
  return new Promise(res => {
    let r; try { r = indexedDB.open(dbName); } catch { res(0); return; }
    r.onerror = () => res(0);
    r.onupgradeneeded = () => { try { r.transaction.abort(); } catch { /* base absente */ } res(0); };
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(store)) { db.close(); res(0); return; }
      let total = 0;
      try {
        const cur = db.transaction(store).objectStore(store).openCursor();
        cur.onsuccess = () => { const c = cur.result; if (!c) { db.close(); res(total); return; } const v = c.value; total += typeof v === 'string' ? v.length : (v && v.byteLength) || (v && v.size) || 0; c.continue(); };
        cur.onerror = () => { db.close(); res(total); };
      } catch { db.close(); res(0); }
    };
  });
}
async function storageUsage() {
  const docs = state.docs.reduce((n, d) => n + utf8Len(JSON.stringify(d)), 0);
  const meta = utf8Len(JSON.stringify({ folders: state.folders, settings: state.settings, events: state.events || [], todos: state.todos || [], todoCats: state.todoCats || [] }));
  const imgs = await idbSum('alixo-images', 'img');
  const fl = Array.isArray(state.files) ? state.files : [];
  const files = fl.reduce((n, f) => n + (f.size || 0), 0);
  const filesCloud = fl.filter(f => f.cloud).reduce((n, f) => n + (f.size || 0), 0);
  let device = null; try { const e = await navigator.storage.estimate(); device = e && e.usage; } catch { device = null; }
  return { docs, meta, imgs, files, filesCloud, nDocs: state.docs.length, nFiles: fl.length, total: docs + meta + imgs + files, cloud: docs + meta + imgs + filesCloud, device };
}
function storageHTML(u, online) {
  const parts = [['Cours', u.docs + u.meta, '#33658a'], ['Images', u.imgs, '#2f7d68'], ['Fichiers', online ? u.filesCloud : u.files, '#b3762a']];
  const tot = online ? u.cloud : u.total;
  const bar = parts.map(([l, v, c]) => `<span style="width:${tot ? Math.max(v ? 1.5 : 0, v / tot * 100) : 0}%; background:${c}" title="${esc(l)} : ${fmtBytes(v)}"></span>`).join('');
  const pct = Math.min(100, u.total / FREE_STORAGE * 100);
  const quota = isPlus() ? `<div class="po-stor-quota plus"><span>${plusBadge()} sans la limite de 3 Go</span></div>`
    : `<div class="po-stor-quota"><i style="width:${pct.toFixed(1)}%" class="${u.total > FREE_STORAGE * .9 ? 'warn' : ''}"></i></div><div class="po-stor-qtxt">${fmtGo(u.total)} sur ${fmtGo(FREE_STORAGE)} (compte gratuit) · <button class="linklike" id="po-plus" type="button">Alixo+ pour aller au-delà</button></div>`;
  const facts = [
    [u.nDocs, `séance${u.nDocs > 1 ? 's' : ''}`],
    [u.nFiles, `fichier${u.nFiles > 1 ? 's' : ''}`],
    [u.device ? fmtBytes(u.device) : null, 'sur cet appareil']
  ].filter(f => f[0] !== null && f[0] !== undefined);
  return `<div class="po-storage"><div class="po-stor-main"><b>${fmtGo(tot)}</b> <span>${online ? 'stockés sur le compte' : 'stockés sur cet appareil'}</span> <span class="po-stor-sub">${fmtBytes(tot)}</span></div>
    <div class="po-stor-bar">${bar}</div>${quota}
    <div class="po-stor-legend">${parts.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l}<b>${fmtBytes(v)}</b></span>`).join('')}</div>
    <div class="po-stor-facts">${facts.map(([n, l]) => `<span><b>${esc(String(n))}</b> ${esc(l)}</span>`).join('')}</div>
    ${online && u.files > u.filesCloud ? `<div class="po-hint" style="margin-top:6px">${fmtBytes(u.files - u.filesCloud)} de fichiers restent sur cet appareil (plus de 20 Mo par fichier).</div>` : ''}</div>`;
}
/* état de la synchronisation, pour la pastille de la carte Compte */
function syncTone(txt) {
  if (/synchronis/i.test(txt)) return 'ok';
  if (/erreur|hors ligne/i.test(txt)) return 'bad';
  if (/inactif/i.test(txt)) return 'off';
  return 'wait';
}
function accountSectionHTML() {
  const A = window.AlixoAuth;
  if (!A || !A.isConfigured) {
    return `<div class="po-label">Compte</div>
      <div class="po-hint">Service en ligne non configuré — l’application fonctionne en local (voir SETUP-COMPTES.md).</div>`;
  }
  const acc = A.account();
  if (acc) {
    const sync = window.AlixoSync && window.AlixoSync.enabled ? window.AlixoSync.status() : 'inactif';
    const p = state.settings.profil;
    const niveau = p ? profilNiveauLabel(p) : '';
    const specs = p ? profilSpecialitesLabel(p) : '';
    const pseudo = (window.AlixoShare && AlixoShare.enabled && AlixoShare.pseudo()) || '';
    const plus = hasPlusPlan();
    return `<div class="po-label">Compte</div>
      <div class="acc-card${plus ? ' plus' : ''}">
        <div class="acc-head">
          <div class="acc-avatar">${esc((acc.name || acc.email || '?')[0].toUpperCase())}</div>
          <div class="acc-id">
            <div class="acc-name">${esc(acc.name || acc.email || 'Mon compte')}${plus ? ' ' + plusBadge() : ''}</div>
            <div class="acc-mail" title="${esc(acc.email || '')}">${esc(acc.email || '')}</div>
          </div>
          <div class="acc-btns">
            <button id="po-editprofil" class="cta ghost small" type="button">Modifier mon profil</button>
            <button id="po-logout" class="cta ghost small" type="button">Se déconnecter</button>
          </div>
        </div>
        <div class="acc-facts">
          <div class="acc-fact"><span>Études</span><b>${esc(niveau || 'Profil non renseigné')}</b></div>
          <div class="acc-fact"><span>Spécialités</span><b>${esc(specs || '—')}</b></div>
          <div class="acc-fact"><span>Synchronisation</span><b class="acc-dot ${syncTone(sync)}">${esc(sync)}</b></div>
          <div class="acc-fact"><span>Formule</span><b>${esc(planLabel())}</b></div>
        </div>
      </div>
      <div class="po-label">Stockage</div>
      <div class="acc-card"><div id="po-storage" class="po-hint" style="margin:0">Calcul de l’espace utilisé…</div></div>
      <div class="po-label">Pseudo Alixo (Alixo Share)</div>
      <div class="acc-card acc-pseudo">
        <div class="po-row"><input id="po-pseudo" placeholder="Ex. fayze_droit" maxlength="24" autocomplete="off" spellcheck="false" value="${esc(pseudo)}"><button class="pobtn" id="po-pseudo-ok" type="button">Enregistrer</button></div>
        <div class="po-hint" style="margin-bottom:0">Vos amis peuvent vous inviter à un cours partagé avec ce pseudo au lieu de votre e-mail.${pseudo ? ` Le vôtre : <b>@${esc(pseudo)}</b>.` : ''}</div>
      </div>`;
  }
  return `<div class="po-label">Compte</div>
    <div class="acc-card">
      <div class="acc-head">
        <div class="acc-avatar off">?</div>
        <div class="acc-id"><div class="acc-name">Non connecté</div><div class="acc-mail">Vos cours sont enregistrés sur cet appareil uniquement.</div></div>
        <div class="acc-btns"><button id="po-login" class="cta small" type="button">Se connecter</button></div>
      </div>
    </div>
    <div class="po-label">Stockage</div>
    <div class="acc-card"><div id="po-storage" class="po-hint" style="margin:0">Calcul de l’espace utilisé…</div></div>`;
}

function snippetRowsHTML() {
  const snips = state.settings.snippets || [];
  if (!snips.length) return `<div class="po-hint">Aucun raccourci. Ajoute par exemple « tkt » → « t’inquiète ».</div>`;
  return snips.map((s, i) => `
    <div class="po-sniprow" data-i="${i}">
      <input class="po-snipk" value="${esc(s.k)}" placeholder="tkt" spellcheck="false" maxlength="24">
      <span class="po-sniparrow">→</span>
      <input class="po-snipv" value="${esc(s.v)}" placeholder="t’inquiète" maxlength="200">
      <button class="po-snipdel" title="Supprimer ce raccourci">✕</button>
    </div>`).join('');
}

/* ============================================================
   Alixo+ (1.16) — formule gratuite / Alixo+
   Gratuit : 3 Go de stockage, thèmes clair / sombre / automatique, 3 polices, sans IA ni tâches.
   Alixo+ : au-delà de 3 Go, tous les thèmes, toutes les polices, IA, tâches.
   L'abonnement est écrit par l'administrateur dans plans/{uid} (panneau admin › Utilisateurs › Alixo+…,
   lu par js/cloudconfig.js) ; l'offre (prix, lien de paiement, note) vient de config/public.
   Sans service en ligne configuré (mode 100 % local), tout est ouvert.
   ============================================================ */
const PLUS_LS = 'alixo.plus' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
const FREE_STORAGE = 3 * 1073741824;                 // 3 Go
const FREE_THEMES = ['auto', 'light', 'dark'];
const FREE_FONTS = ['', 'times', 'segoe'];           // Alixo, Times New Roman, Segoe UI
const PLUS_ICO = {
  stockage: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  themes: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1 1-2 1-3a9 9 0 0 0-7-9Z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15.5" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  polices: '<svg viewBox="0 0 24 24"><path d="M5 19 11 5h2l6 14M7.5 14h9"/></svg>',
  ia: '<svg viewBox="0 0 24 24"><path d="M4 17c3-1 6-9 8-9s3 8 8 7"/><path d="m3 20 2-2M19 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></svg>',
  taches: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="6" rx="1.2"/><path d="m4.5 7 1.4 1.4L8.5 5.6M11 7h10M11 17h10"/><rect x="3" y="14" width="6" height="6" rx="1.2"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/></svg>'
};
const PLUS_FEATURES = [
  { k: 'stockage', name: 'Plus de 3 Go de stockage', free: '3 Go', plus: 'Au-delà de 3 Go', text: 'Fichiers, images et cours au-delà de la limite de 3 Go du compte gratuit.' },
  { k: 'themes', name: 'Tous les thèmes de couleurs', free: 'Clair, sombre, automatique', plus: 'Tous les thèmes', text: 'Bleu galaxie, Nuit d’encre, Forêt, Ardoise, Ambre, Rose néon, Violette, Océan, Braise, Azur, Vert sauge, Rose pastel, Sable, Lavande…' },
  { k: 'polices', name: 'Toutes les polices d’écriture', free: '3 polices', plus: 'Toutes les polices', text: 'Georgia, Garamond, Cambria, Calibri, Verdana, Trebuchet, Monospace, Comic Sans… en plus des trois polices gratuites.' },
  { k: 'ia', name: 'Intelligence artificielle', free: '—', plus: 'Incluse', text: 'Correction de l’orthographe et de la grammaire, mise en forme et reformulations par IA, pendant la frappe ou à la demande (F7).' },
  { k: 'taches', name: 'Tâches à faire', free: '—', plus: 'Incluses', text: 'Tâches, catégories, échéances, priorités et rappel du matin, synchronisés avec le compte.' }
];
let planInfo = (() => { try { return JSON.parse(localStorage.getItem(PLUS_LS)) || {}; } catch { return {}; } })();
let plusOffer = { price: '', url: '', note: '' };
const planActive = p => !!(p && p.plus && (!p.until || +p.until > Date.now()));
/* Alixo+ actif sur ce compte ? (sans service en ligne : tout est ouvert) */
/* version personnalisée (1.19) : clé codée dans js/editions.js, activée dans Paramètres › Alixo+ ; suit le compte */
const editionInfo = () => (state.settings.edition && state.settings.edition.code ? state.settings.edition : null);
const editionActive = () => !!editionInfo();
function isPlus() {
  if (editionActive()) return true;
  if (!window.AlixoAuth || !window.AlixoAuth.isConfigured) return true;
  return planActive(planInfo);
}
const themeLocked = k => !isPlus() && !FREE_THEMES.includes(k);
const fontLocked = k => !isPlus() && !FREE_FONTS.includes(k || '');
function planLabel() {
  if (editionActive()) return `Version personnalisée : ${editionInfo().name || editionInfo().code}`;
  if (!window.AlixoAuth || !window.AlixoAuth.isConfigured) return 'Version locale : toutes les fonctions';
  if (!isPlus()) return 'Formule gratuite';
  return planInfo.until ? `Alixo+ jusqu’au ${new Date(+planInfo.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Alixo+ actif';
}
/* appelé par js/cloudconfig.js à chaque changement de plans/{uid} (null : pas d'abonnement) */
function setPlan(info) {
  const was = isPlus();
  const next = info && info.plus ? { plus: true, until: +info.until || 0, since: +info.since || 0, note: info.note || '' } : {};
  const changed = JSON.stringify(next) !== JSON.stringify(planInfo);
  planInfo = next;
  try { if (planInfo.plus) localStorage.setItem(PLUS_LS, JSON.stringify(planInfo)); else localStorage.removeItem(PLUS_LS); } catch { /* stockage indisponible */ }
  if (!changed) return;
  applyTheme();
  refreshPlusUi();
  const ov = $('#setov'); if (ov && !ov.hidden) renderSettingsBody();
  if (isPlus() !== was) {
    if (isPlus()) { closeDialog('plusov'); toast('Alixo+ est activé sur votre compte — merci !'); }
    else toast('Alixo+ a pris fin sur ce compte : retour aux fonctions gratuites');
  }
}
/* ---------------- clé d'activation (1.19) ----------------
   Une clé Alixo+ (générée dans le panneau admin : codes/{code}) ou une clé de version personnalisée
   (js/editions.js). Résultat : { ok, msg }. */
async function activateCode(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return { ok: false, msg: 'Saisissez une clé.' };
  const ed = (window.ALIXO_EDITIONS || []).find(e => e && e.enabled !== false && String(e.code || '').toUpperCase().replace(/\s+/g, '') === code);
  if (ed) {
    const was = isPlus();
    state.settings.edition = { code, name: ed.name || 'Version personnalisée', note: ed.note || '', ts: Date.now() };
    save(); applyTheme(); refreshPlusUi();
    if (!was) closeDialog('plusov');
    return { ok: true, msg: `Version personnalisée activée : ${ed.name || code}` };
  }
  const A = window.AlixoAuth;
  if (A && A.isConfigured && !A.account()) return { ok: false, msg: 'Connectez-vous à votre compte Alixo pour activer une clé Alixo+ (la clé suit le compte).' };
  if (!window.AlixoCloud || !AlixoCloud.enabled || !AlixoCloud.redeemCode) return { ok: false, msg: 'Clé inconnue.' };
  return AlixoCloud.redeemCode(code);
}
function removeEdition() {
  if (!editionActive()) return;
  delete state.settings.edition;
  save(); applyTheme(); refreshPlusUi();
  const ov = $('#setov'); if (ov && !ov.hidden) renderSettingsBody();
  toast('Version personnalisée retirée');
}
function activationHTML() {
  const ed = editionInfo();
  return `<div class="set-sect"><div class="po-label">Clé d’activation</div>
      <div class="po-hint" style="margin:0 0 8px">Une clé reçue de l’administrateur d’Alixo (Alixo+ pour une durée donnée) ou la clé d’une version personnalisée. Saisissez-la puis cliquez sur « Activer ».</div>
      <div class="po-row" style="gap:8px"><input id="set-actkey" placeholder="ALXP-XXXX-XXXX-XXXX" spellcheck="false" autocomplete="off" autocapitalize="characters" style="flex:1; font-family:var(--font-mono); letter-spacing:.04em"><button class="pobtn" id="set-actgo" type="button">Activer</button></div>
      <div id="set-actmsg" class="po-hint" style="margin:6px 0 0" hidden></div>
      ${ed ? `<div class="po-row" style="margin-top:10px; align-items:center; gap:10px"><span class="po-hint" style="margin:0; flex:1">Clé active : <code>${esc(ed.code)}</code>${ed.note ? ' — ' + esc(ed.note) : ''}</span><button class="cta ghost small" id="set-edrm" type="button">Retirer la version personnalisée</button></div>` : ''}
    </div>`;
}
function bindActivation(root) {
  const inp = root.querySelector('#set-actkey'), go = root.querySelector('#set-actgo'), msg = root.querySelector('#set-actmsg');
  if (!inp || !go) return;
  const run = async () => {
    go.disabled = true; msg.hidden = false; msg.textContent = 'Vérification…'; msg.classList.remove('ai-err');
    let r;
    try { r = await activateCode(inp.value); } catch (e) { r = { ok: false, msg: 'Erreur : ' + (e && e.message || e) }; }
    go.disabled = false;
    msg.textContent = r.msg || (r.ok ? 'Clé activée.' : 'Clé refusée.');
    msg.classList.toggle('ai-err', !r.ok);
    if (r.ok) { toast(r.msg || 'Clé activée'); setTimeout(() => { const ov = $('#setov'); if (ov && !ov.hidden) renderSettingsBody(); }, 900); }
  };
  go.addEventListener('click', run);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  const rm = root.querySelector('#set-edrm'); if (rm) rm.addEventListener('click', removeEdition);
}
function setPlusOffer(o) { plusOffer = Object.assign({ price: '', url: '', note: '' }, o || {}); const ov = $('#plusov'); if (ov) openPlusDialog(ov.dataset.feature || ''); }
/* vrai si la fonction est disponible ; sinon ouvre la fenêtre Alixo+ et renvoie faux */
function requirePlus(feature) { if (isPlus()) return true; openPlusDialog(feature); return false; }
/* limite de stockage du compte gratuit : vrai si `bytes` octets de plus tiennent encore */
async function storageAllows(bytes) {
  if (isPlus()) return true;
  let u; try { u = await storageUsage(); } catch { return true; }
  if (u.total + (bytes || 0) <= FREE_STORAGE) return true;
  openPlusDialog('stockage');
  toast(`Limite de 3 Go du compte gratuit atteinte (${fmtBytes(u.total)} utilisés) — Alixo+ lève cette limite`, { duration: 7000 });
  return false;
}
const plusBadge = (t = 'Alixo+') => `<span class="plus-badge">${t}</span>`;
/* Abonnement Alixo+ réellement actif sur ce compte. isPlus() renvoie aussi vrai en mode 100 % local
   (tout est ouvert) : pour le logo et les marques « Alixo+ », c'est l'abonnement qui compte. */
const hasPlusPlan = () => editionActive() || !!(window.AlixoAuth && window.AlixoAuth.isConfigured && planActive(planInfo));
/* 1.24 : filigrane « Alixo » sur les exports (PDF de tous les types de documents, Word, page web, archive .zip)
   tant que le compte n'a pas Alixo+ ; Alixo+ exporte des documents vierges. Un calque fixe est posé sur la page
   le temps de l'impression (position: fixed → répété sur chaque page du PDF, voir #alixo-wm dans styles.css). */
const WM_TEXT = 'Alixo';
const exportWatermarked = () => !isPlus();
function exportWatermark(on) {
  let el = $('#alixo-wm');
  if (!on || !exportWatermarked()) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement('div'); el.id = 'alixo-wm'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span class="wm-big">${WM_TEXT}</span><span class="wm-foot">Fait avec Alixo · alixoapp.com</span>`;
  document.body.appendChild(el);
}
/* logo de l'application : le « A » Alixo+ (orange, avec le +) dès que le compte a Alixo+ */
const APP_LOGO = 'logo.png', APP_LOGO_PLUS = 'logo-plus.png';
const appLogoSrc = () => (hasPlusPlan() ? APP_LOGO_PLUS : APP_LOGO);
function applyAppLogo() {
  const src = appLogoSrc();
  $$('.app-logo-img').forEach(img => { if (img.getAttribute('src') !== src) img.setAttribute('src', src); });
  for (const id of ['#app-favicon', '#app-touchicon']) {
    const l = $(id); if (l && l.getAttribute('href') !== src) l.setAttribute('href', src);
  }
  const desk = window.alixoDesktop;
  if (desk && desk.setPlusBranding) { try { desk.setPlusBranding(hasPlusPlan()); } catch { /* non bloquant */ } }
}
function refreshPlusUi() {
  const locked = !isPlus();
  const t = $('#ln-todo'); if (t) t.classList.toggle('plus-locked', locked);
  applyAppLogo();
  if (window.AlixoTodo) AlixoTodo.refresh();
}
function openPlusUrl() {
  const url = plusOffer.url;
  if (!url) return;
  if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(url); else window.open(url, '_blank', 'noopener');
}
/* bloc « comment s'abonner » (fenêtre Alixo+ et Paramètres › Alixo+) */
function plusCtaHTML() {
  const A = window.AlixoAuth;
  if (isPlus()) return `<div class="plus-state on">${PLUS_ICO.star}<div><b>${esc(planLabel())}</b><span>Toutes les fonctions sont ouvertes sur ce compte.${planInfo.note ? ' ' + esc(planInfo.note) : ''}</span></div></div>`;
  if (A && A.isConfigured && !A.account()) return `<div class="plus-state"><div><b>Connectez-vous pour activer Alixo+</b><span>L’abonnement suit votre compte Alixo, sur tous vos appareils.</span></div><button class="cta" id="plus-login" type="button">Se connecter</button></div>`;
  if (plusOffer.url) return `<div class="plus-state"><div><b>${esc(plusOffer.price ? `Alixo+ — ${plusOffer.price}` : 'Passer à Alixo+')}</b><span>${esc(plusOffer.note || 'Paiement sécurisé ; l’abonnement est activé sur votre compte dès réception.')}</span></div><button class="cta plus-cta" id="plus-go" type="button">Passer à Alixo+</button></div>`;
  return `<div class="plus-state"><div><b>${esc(plusOffer.price ? `Alixo+ — ${plusOffer.price}` : 'Alixo+ arrive')}</b><span>${esc(plusOffer.note || 'Le lien d’abonnement n’est pas encore ouvert : l’administrateur d’Alixo peut activer Alixo+ sur votre compte.')}</span></div></div>`;
}
function bindPlusCta(root, close) {
  const go = root.querySelector('#plus-go'); if (go) go.addEventListener('click', openPlusUrl);
  const lg = root.querySelector('#plus-login'); if (lg) lg.addEventListener('click', () => { if (close) close(); closeSettings(); window.AlixoAuth.openAuthOverlay(); });
}
function plusTableHTML(feature) {
  return `<div class="plus-table">
    <div class="plus-row plus-head"><span></span><span>Gratuit</span><span>${plusBadge()}</span></div>
    ${PLUS_FEATURES.map(f => `<div class="plus-row ${f.k === feature ? 'on' : ''}"><span class="plus-fname">${PLUS_ICO[f.k]}<b>${esc(f.name)}</b><small>${esc(f.text)}</small></span><span class="plus-free">${esc(f.free)}</span><span class="plus-plus">${esc(f.plus)}</span></div>`).join('')}
  </div>`;
}
/* grande fenêtre Alixo+ (même présentation que les Paramètres) ; `feature` : la fonction qui l'a ouverte */
function openPlusDialog(feature) {
  const f = PLUS_FEATURES.find(x => x.k === feature) || null;
  const ov = openDialog({
    id: 'plusov', cls: 'plus-dlg', eyebrow: 'Alixo+',
    title: f ? f.name : 'Passer à Alixo+',
    sub: f ? `${f.text} Cette fonction fait partie d’Alixo+.` : 'Toutes les fonctions d’Alixo, sans limite, sur tous vos appareils.',
    body: `${plusCtaHTML()}${plusTableHTML(feature)}
      <div class="po-hint">Le compte gratuit garde tout l’essentiel : cours, présentations, dossiers, fichiers jusqu’à 3 Go, agenda, partage, dictionnaire, export PDF, synchronisation. Alixo+ suit le compte : une seule fois pour le PC, le Mac, le web et le téléphone.</div>`,
    foot: `<button class="cta ghost" type="button" data-dlg-close>${isPlus() ? 'Fermer' : 'Plus tard'}</button>${!isPlus() && plusOffer.url ? '<button class="cta plus-cta" type="button" id="plus-go2">Passer à Alixo+</button>' : ''}`,
    onMount: (card, close) => { bindPlusCta(card, close); const g2 = card.querySelector('#plus-go2'); if (g2) g2.addEventListener('click', openPlusUrl); }
  });
  ov.dataset.feature = feature || '';
}

/* ============================================================
   Fenêtres centrales (1.16) : même présentation que les Paramètres
   (partage, événement, Alixo+) — openDialog({ id, title, sub, eyebrow, body, nav, foot, cls, onMount, onClose })
   ============================================================ */
const DLG_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
function openDialog(o) {
  closeDialog(o.id);
  hidePopover(); closeCtxMenu();
  const ov = document.createElement('div');
  ov.className = 'dlgov'; ov.id = o.id || 'dlg';
  ov.innerHTML = `<div class="set-card dlg-card ${o.cls || ''}" role="dialog" aria-label="${esc(o.title || '')}">
      ${o.nav ? `<aside class="set-nav dlg-nav">${o.nav}</aside>` : ''}
      <div class="set-main">
        <header class="set-head"><div class="dlg-htxt">${o.eyebrow ? `<div class="dlg-eyebrow">${o.eyebrow}</div>` : ''}<h2 class="set-htitle">${o.title || ''}</h2>${o.sub ? `<p class="set-hsub">${o.sub}</p>` : ''}</div><button class="set-x" type="button" title="Fermer (Échap)">${DLG_X}</button></header>
        <div class="set-body po-scope dlg-body">${o.body || ''}</div>
        ${o.foot ? `<footer class="dlg-foot">${o.foot}</footer>` : ''}
      </div></div>`;
  document.body.appendChild(ov);
  document.body.classList.add('has-dlg');
  ov._onClose = o.onClose || null;
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.set-x') || e.target.closest('[data-dlg-close]')) closeDialog(ov.id); });
  if (o.onMount) o.onMount(ov.querySelector('.dlg-card'), () => closeDialog(ov.id));
  return ov;
}
function closeDialog(id) {
  const list = id ? [$('#' + id)].filter(Boolean) : $$('.dlgov');
  for (const ov of list) { ov.remove(); if (ov._onClose) { const f = ov._onClose; ov._onClose = null; f(); } }
  if (!$('.dlgov')) document.body.classList.remove('has-dlg');
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const list = $$('.dlgov'); if (!list.length) return;
  if (!$('#popover').hidden) return;                     // un pop-over ouvert par-dessus se ferme d'abord
  e.stopImmediatePropagation(); closeDialog(list[list.length - 1].id);   // les Paramètres, derrière, restent ouverts
}, true);

/* ============================================================
   Paramètres — fenêtre centrale à catégories (1.13)
   Compte · Apparence · Écriture · IA · Export · À propos
   ============================================================ */
const SET_ICO = {
  compte: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  apparence: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1 1-2 1-3a9 9 0 0 0-7-9Z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15.5" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  ecriture: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg>',
  ia: '<svg viewBox="0 0 24 24"><path d="M4 17c3-1 6-9 8-9s3 8 8 7"/><path d="m3 20 2-2M19 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></svg>',
  export: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>',
  apropos: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  plus: PLUS_ICO.star
};
/* thèmes de l'application : base clair / sombre + jeux de couleurs (voir styles.css, html[data-skin]) */
const APP_THEMES = [
  { k: 'auto', name: 'Automatique', sub: 'Suit le réglage de l’ordinateur', base: null, c: ['#f6f7f9', '#ffffff', '#202124', '#33658a'] },
  { k: 'light', name: 'Clair', sub: 'Blanc, texte sombre', base: 'light', c: ['#f6f7f9', '#ffffff', '#202124', '#33658a'] },
  { k: 'dark', name: 'Sombre', sub: 'Gris anthracite', base: 'dark', c: ['#141414', '#1f1f1f', '#e8eaed', '#6fa3cc'] },
  { k: 'galaxy', name: 'Bleu galaxie', sub: 'Nuit bleu profond, texte lavande', base: 'dark', c: ['#0a0f1f', '#121a30', '#e7ecff', '#7d9bff'] },
  { k: 'ink', name: 'Nuit d’encre', sub: 'Brun sombre, papier crème', base: 'dark', c: ['#14110e', '#1d1915', '#f1e9dc', '#d4a256'] },
  { k: 'forest', name: 'Forêt', sub: 'Vert sapin, texte menthe', base: 'dark', c: ['#0e1913', '#152219', '#e5f0e8', '#63b98b'] },
  { k: 'slate', name: 'Ardoise', sub: 'Gris bleuté, contrasté', base: 'dark', c: ['#191c22', '#22262e', '#e7e9ee', '#8ab4f8'] },
  /* 1.18 : thèmes sombres colorés */
  { k: 'amber', name: 'Ambre', sub: 'Nuit dorée, texte crème, accent jaune', base: 'dark', c: ['#17130b', '#231c10', '#f7ecd2', '#e9b949'] },
  { k: 'candy', name: 'Rose néon', sub: 'Nuit framboise, accent rose vif', base: 'dark', c: ['#1a0e15', '#26141f', '#fde8f1', '#ff6fae'] },
  { k: 'violet', name: 'Violette', sub: 'Nuit violette, accent lilas', base: 'dark', c: ['#120d1f', '#1b1430', '#eee8fb', '#b388ff'] },
  { k: 'ocean', name: 'Océan', sub: 'Nuit turquoise, accent menthe', base: 'dark', c: ['#061418', '#0d1f24', '#e2f4f5', '#2ad4c8'] },
  { k: 'ember', name: 'Braise', sub: 'Nuit brune, accent orange', base: 'dark', c: ['#1a0d0a', '#261512', '#fbe9e3', '#ff7a45'] },
  { k: 'azure', name: 'Azur', sub: 'Bleu ciel très clair', base: 'light', c: ['#e9f2fb', '#ffffff', '#0f2438', '#2b6cb0'] },
  { k: 'sage', name: 'Vert sauge', sub: 'Vert doux, reposant', base: 'light', c: ['#edf3ee', '#fafcf9', '#1d2a22', '#3f8a5c'] },
  { k: 'rose', name: 'Rose pastel', sub: 'Rose poudré, texte prune', base: 'light', c: ['#fbeff3', '#fffbfc', '#3a2430', '#c25b82'] },
  { k: 'sand', name: 'Sable', sub: 'Beige chaud, façon papier', base: 'light', c: ['#f4eee3', '#fdfaf3', '#2c251c', '#b3762a'] },
  { k: 'lavender', name: 'Lavande', sub: 'Lilas clair, texte violet nuit', base: 'light', c: ['#f1eefa', '#fcfbff', '#292340', '#7a5ca8'] }
];
/* polices des cours (texte et titres) — piles système, sans téléchargement */
const DOC_FONTS = [
  { k: '', name: 'Alixo', sub: 'Iowan / Palatino / Georgia', css: '' },
  { k: 'georgia', name: 'Georgia', sub: 'Serif classique, très lisible', css: 'Georgia, "Times New Roman", serif' },
  { k: 'garamond', name: 'Garamond', sub: 'Serif élégant, façon livre', css: 'Garamond, "EB Garamond", "Times New Roman", serif' },
  { k: 'cambria', name: 'Cambria', sub: 'Serif moderne (Office)', css: 'Cambria, "Book Antiqua", Georgia, serif' },
  { k: 'times', name: 'Times New Roman', sub: 'Le standard des copies', css: '"Times New Roman", Times, serif' },
  { k: 'segoe', name: 'Segoe UI', sub: 'Sans-serif de Windows', css: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { k: 'calibri', name: 'Calibri', sub: 'Sans-serif d’Office', css: 'Calibri, Carlito, "Segoe UI", sans-serif' },
  { k: 'verdana', name: 'Verdana', sub: 'Large et aérée', css: 'Verdana, Geneva, sans-serif' },
  { k: 'trebuchet', name: 'Trebuchet MS', sub: 'Sans-serif humaniste', css: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { k: 'mono', name: 'Monospace', sub: 'Chasse fixe (Consolas)', css: '"Cascadia Code", Consolas, "Courier New", monospace' },
  { k: 'dys', name: 'Comic Sans', sub: 'Souvent préférée en cas de dyslexie', css: '"Comic Sans MS", "Comic Neue", sans-serif' }
];
const DOC_SIZES = [['s', 'Petit', .92], ['m', 'Normal', 1], ['l', 'Grand', 1.1], ['xl', 'Très grand', 1.22]];
function applyDocFont() {
  const r = document.documentElement.style;
  const f = (!fontLocked(state.settings.docFont) && DOC_FONTS.find(x => x.k === (state.settings.docFont || ''))) || DOC_FONTS[0];   // police Alixo+ sans abonnement : police Alixo (le choix est conservé)
  const fh = (!fontLocked(state.settings.docFontHead) && DOC_FONTS.find(x => x.k === (state.settings.docFontHead || ''))) || null;
  if (f.css) r.setProperty('--doc-font', f.css); else r.removeProperty('--doc-font');
  if (fh && fh.css) r.setProperty('--doc-font-head', fh.css); else r.removeProperty('--doc-font-head');
  const sz = DOC_SIZES.find(x => x[0] === (state.settings.docSize || 'm')) || DOC_SIZES[1];
  if (sz[2] !== 1) r.setProperty('--doc-scale', String(sz[2])); else r.removeProperty('--doc-scale');
  if (pagesActive()) schedulePaginate(true);
}
const SET_CATS = [
  { k: 'compte', name: 'Compte', sub: 'Connexion, profil, stockage, pseudo Alixo Share' },
  { k: 'plus', name: 'Alixo+', sub: 'Votre formule, clé d’activation' },
  { k: 'apparence', name: 'Apparence', sub: 'Thème clair ou sombre, affichage de la bibliothèque' },
  { k: 'ecriture', name: 'Écriture', sub: 'Raccourcis de frappe et remplacements automatiques' },
  { k: 'ia', name: 'Intelligence artificielle', sub: 'Correction orthographique et mise en forme par IA' },
  { k: 'export', name: 'Export', sub: 'PDF, archives .zip des dossiers' },
  { k: 'apropos', name: 'À propos', sub: 'Version, nouveautés, raccourcis clavier' }
];
let settingsCat = 'compte';
const SHORTCUTS = [
  ['Ctrl + K', 'Recherche universelle'], ['Ctrl + P', 'Exporter en PDF'], ['Ctrl + W', 'Fermer l’onglet'], ['Ctrl + Tab', 'Onglet suivant'],
  ['Alt + ←', 'Retour à la bibliothèque'], ['Ctrl + Maj + A', 'Agenda'], ['Ctrl + Maj + K', 'Tâches'], ['Ctrl + Maj + D', 'Dictionnaire'],
  ['Ctrl + Maj + T', 'Chronomètre'], ['/', 'Insérer un bloc (ligne vide)'], ['F7', 'Correction par IA'], ['Ctrl + Alt + 1…6', 'Niveau de titre (selon le plan)'],
  ['F5', 'Présenter (présentation)'], ['Suppr', 'Supprimer le bloc sélectionné (présentation)'],
  ['F2', 'Modifier la cellule (tableur)'], ['Ctrl + flèches', 'Bord de la zone remplie (tableur)'],
  ['F5', 'Tester le quiz'], ['Ctrl + molette', 'Zoom (planche)'], ['Espace + glisser', 'Déplacer la vue (planche)'], ['Ctrl + D', 'Dupliquer la sélection (planche)'], ['N / T / F', 'Post-it, texte, flèche (planche)']
];

/* ---------------- Paramètres › Écriture › Plan du cours (1.24) : pyramide des niveaux ---------------- */
function planRowsHTML() {
  const lv = planLevels();
  return lv.map((l, i) => `<div class="plan-lv" draggable="true" data-i="${i}" style="--d:${i}">
      <span class="plan-grip" title="Glisser pour déplacer ce niveau">⋮⋮</span>
      <span class="plan-sample" title="Exemple de numéro">${esc(NUM_STYLES[l.num][0])}</span>
      <input class="plan-name" value="${esc(l.name)}" placeholder="Nom du niveau" maxlength="30" spellcheck="false" title="Nom du niveau (menu /, bouton Niveau de plan)">
      <select class="plan-num" title="Numérotation de ce niveau">${Object.keys(NUM_STYLES).map(k => `<option value="${esc(k)}" ${l.num === k ? 'selected' : ''}>${esc(NUM_STYLE_NAMES[k])}</option>`).join('')}</select>
      <input class="plan-pre" value="${esc(l.pre)}" placeholder="Mots déclencheurs : Chapitre, Chap." spellcheck="false" title="Une ligne qui commence par l’un de ces mots (séparés par des virgules) devient un titre de ce niveau">
      <span class="plan-mv"><button type="button" data-mv="-1" title="Monter" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-mv="1" title="Descendre" ${i === lv.length - 1 ? 'disabled' : ''}>▼</button></span>
      <button type="button" class="plan-del" title="Retirer ce niveau" ${lv.length <= 1 ? 'disabled' : ''}>✕</button>
    </div>`).join('');
}
function bindPlanEditor(root) {
  const box = root.querySelector('#set-plan'); if (!box) return;
  const addBtn = root.querySelector('#set-planadd');
  const levels = () => planLevels().map(l => Object.assign({}, l));
  const commit = (lv, rerender = true) => {
    state.settings.plan = { levels: lv.slice(0, PLAN_MAX) };
    save(); applyPlanChange();
    if (rerender) { box.innerHTML = planRowsHTML(); if (addBtn) addBtn.disabled = planDepth() >= PLAN_MAX; }
  };
  const readRows = () => [...box.querySelectorAll('.plan-lv')].map(row => ({ name: row.querySelector('.plan-name').value.trim(), num: row.querySelector('.plan-num').value, pre: row.querySelector('.plan-pre').value }));
  box.addEventListener('input', e => {
    const row = e.target.closest('.plan-lv'); if (!row) return;
    const lv = readRows();
    const i = +row.dataset.i;
    if (!lv[i].name) lv[i].name = `Niveau ${i + 1}`;
    commit(lv, false);
    row.querySelector('.plan-sample').textContent = NUM_STYLES[lv[i].num][0];
  });
  box.addEventListener('change', e => { if (e.target.classList.contains('plan-num')) { commit(readRows(), false); const row = e.target.closest('.plan-lv'); row.querySelector('.plan-sample').textContent = NUM_STYLES[e.target.value][0]; } });
  box.addEventListener('click', e => {
    const row = e.target.closest('.plan-lv'); if (!row) return;
    const i = +row.dataset.i;
    const mv = e.target.closest('[data-mv]');
    if (mv) { const lv = readRows(); const j = i + (+mv.dataset.mv); if (j < 0 || j >= lv.length) return; [lv[i], lv[j]] = [lv[j], lv[i]]; commit(lv); return; }
    if (e.target.closest('.plan-del')) { const lv = readRows(); if (lv.length <= 1) return; lv.splice(i, 1); commit(lv); toast('Niveau retiré — les titres de ce niveau prennent celui du dessous'); return; }
  });
  /* glisser-déposer d'un niveau dans la pyramide */
  let dragI = null;
  box.addEventListener('dragstart', e => { const row = e.target.closest('.plan-lv'); if (!row || e.target.matches('input, select')) { e.preventDefault(); return; } dragI = +row.dataset.i; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragI)); } catch { /* */ } });
  box.addEventListener('dragend', () => { dragI = null; box.querySelectorAll('.plan-lv').forEach(r => r.classList.remove('dragging', 'over-up', 'over-down')); });
  box.addEventListener('dragover', e => {
    if (dragI === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.plan-lv'); box.querySelectorAll('.plan-lv').forEach(r => r.classList.remove('over-up', 'over-down'));
    if (!row || +row.dataset.i === dragI) return;
    const r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? 'over-up' : 'over-down');
  });
  box.addEventListener('drop', e => {
    if (dragI === null) return; e.preventDefault();
    const row = e.target.closest('.plan-lv'); if (!row) return;
    const r = row.getBoundingClientRect(); let to = +row.dataset.i + (e.clientY < r.top + r.height / 2 ? 0 : 1);
    const lv = readRows(); const [it] = lv.splice(dragI, 1); if (to > dragI) to--; lv.splice(to, 0, it);
    dragI = null; commit(lv);
  });
  if (addBtn) addBtn.addEventListener('click', () => {
    const lv = levels(); if (lv.length >= PLAN_MAX) return;
    const used = new Set(lv.map(l => l.num));
    const num = ['I', 'A', '1', 'a', 'i', '§', '-'].find(k => !used.has(k)) || '1';
    lv.push({ name: ['Chapitre', 'Titre', 'Sous-partie', 'Point', 'Alinéa'].find(n => !lv.some(l => l.name === n)) || `Niveau ${lv.length + 1}`, num, pre: '' });
    commit(lv);
    const rows = box.querySelectorAll('.plan-lv'); if (rows.length) rows[rows.length - 1].querySelector('.plan-name').select();
  });
  root.querySelector('#set-planreset').addEventListener('click', () => { delete state.settings.plan; save(); applyPlanChange(); box.innerHTML = planRowsHTML(); if (addBtn) addBtn.disabled = false; toast('Plan par défaut rétabli : I. A. 1. a.'); });
}

function settingsSectionHTML(k) {
  const fmt = state.settings.exportFormat || 'pdf';
  const theme = state.settings.theme || 'auto';
  const view = state.settings.libView || 'grid';
  const desk = window.alixoDesktop;
  if (k === 'compte') return `<div class="set-sect">${accountSectionHTML()}</div>
    <div class="set-sect"><div class="po-label">Activité</div>
      <div class="po-row" style="align-items:center; gap:10px"><button id="po-weekly" class="cta ghost small" type="button">Voir mon bilan de la semaine</button><span class="po-hint" style="margin:0">Le bilan s’affiche à chaque ouverture d’Alixo.</span></div></div>`;
  if (k === 'apparence') return `<div class="set-sect"><div class="po-label">Thème de couleurs</div>
      <div class="po-hint" style="margin:0 0 10px">Les couleurs des dossiers et l’accent bleu d’Alixo restent les mêmes ; le thème change le fond, les panneaux et le texte.</div>
      <div class="set-tiles set-tiles4" id="set-theme">
        ${APP_THEMES.map(t => `<button type="button" class="set-tile ${theme === t.k ? 'on' : ''} ${themeLocked(t.k) ? 'locked' : ''}" data-theme="${t.k}"><span class="set-tile-prev set-skin ${t.k === 'auto' ? 'th-auto' : ''}" style="--p0:${t.c[0]};--p1:${t.c[1]};--p2:${t.c[2]};--p3:${t.c[3]}"><i></i><i></i><i></i><em></em></span><b>${t.name}${themeLocked(t.k) ? plusBadge() : ''}</b><span>${t.sub}</span></button>`).join('')}
      </div>${isPlus() ? '' : `<div class="po-hint">Clair, sombre et automatique sont gratuits ; les autres thèmes font partie d’<b>Alixo+</b> (Paramètres › Alixo+).</div>`}
      <div class="set-checks" id="set-themebtn" style="margin-top:12px"><label><input type="checkbox" data-set="showThemeBtn" ${state.settings.showThemeBtn ? 'checked' : ''}><span><b>Bouton clair / sombre dans la barre du haut</b><small>Le soleil à droite de la barre, pour basculer d’un clic entre le thème clair et le thème sombre.</small></span></label></div></div>
    <div class="set-sect"><div class="po-label">Affichage de la bibliothèque</div>
      <div class="set-tiles" id="set-view">
        ${[['grid', 'Grille', 'Cartes des dossiers et séances'], ['tree', 'Arbre', 'Arborescence reliée, façon Obsidian'], ['galaxy', 'Galaxie', 'Dossiers et séances qui flottent, liens animés']].map(([v, l, h]) => `<button type="button" class="set-tile ${view === v ? 'on' : ''}" data-view="${v}"><span class="set-tile-prev vw-${v}"><i></i><i></i><i></i><i></i></span><b>${l}</b><span>${h}</span></button>`).join('')}
      </div>
      <div class="po-hint">Le bouton en haut de la bibliothèque permet aussi de changer d’affichage à tout moment.</div></div>`;
  if (k === 'ecriture') return `<div class="set-sect"><div class="po-label">Police des cours</div>
      <div class="po-hint" style="margin:0 0 10px">Police du texte des séances (paragraphes, listes, encadrés). Les titres suivent la même police, sauf choix contraire ci-dessous. L’export PDF l’utilise aussi.</div>
      <div class="set-tiles set-tiles4 set-fonts" id="set-font">
        ${DOC_FONTS.map(f => `<button type="button" class="set-tile ${(state.settings.docFont || '') === f.k ? 'on' : ''} ${fontLocked(f.k) ? 'locked' : ''}" data-font="${f.k}"><span class="set-fontprev" style="font-family:${esc(f.css || 'var(--font-serif-base)')}">Aa <small>Le juge tranche.</small></span><b>${f.name}${fontLocked(f.k) ? plusBadge() : ''}</b><span>${f.sub}</span></button>`).join('')}
      </div>${isPlus() ? '' : `<div class="po-hint">Alixo, Times New Roman et Segoe UI sont gratuites ; les autres polices font partie d’<b>Alixo+</b> (Paramètres › Alixo+).</div>`}
      <div class="po-row" style="gap:16px; margin-top:12px; flex-wrap:wrap; align-items:center">
        <label class="set-inline">Titres <select id="set-fonthead">${[{ k: '', name: 'Comme le texte' }].concat(DOC_FONTS.slice(1)).map(f => `<option value="${f.k}" ${(state.settings.docFontHead || '') === f.k ? 'selected' : ''} ${f.k && fontLocked(f.k) ? 'disabled' : ''}>${esc(f.name)}${f.k && fontLocked(f.k) ? ' (Alixo+)' : ''}</option>`).join('')}</select></label>
        <label class="set-inline">Taille <select id="set-fontsize">${DOC_SIZES.map(([v, l]) => `<option value="${v}" ${(state.settings.docSize || 'm') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="set-checks" style="margin-top:12px"><label><input type="checkbox" id="set-pageview" ${state.settings.pageView !== false ? 'checked' : ''}><span><b>Feuille découpée en pages A4</b><small>Le cours s’affiche page par page, exactement comme dans le PDF (Ctrl+P) ; le bloc « Saut de page » du menu / force le passage à la page suivante. Décoché : une seule feuille continue.</small></span></label></div></div>
    <div class="set-sect"><div class="po-label">Plan du cours</div>
      <div class="po-hint" style="margin:0 0 10px">Les niveaux de titres, du plus général (en haut de la pyramide) au plus fin. <b>Glissez un niveau</b> pour le monter ou le descendre (ou ▲ ▼), ajoutez-en (Chapitre, Titre, §…), choisissez sa numérotation. Les <b>mots déclencheurs</b> transforment une ligne qui commence par l’un d’eux en titre de ce niveau : avec « Chapitre » sur le niveau placé au-dessus de « Section », taper « Chapitre 1 : Le contrat » crée un chapitre — comme « I. », « A. », « 1. » et « a. » le font déjà. Tab / Maj+Tab change le niveau d’un titre ; Ctrl+Alt+1…6 le fixe.</div>
      <div id="set-plan" class="plan-pyr">${planRowsHTML()}</div>
      <div class="po-row" style="gap:8px; margin-top:10px; flex-wrap:wrap"><button id="set-planadd" class="cta ghost small" type="button" ${planDepth() >= PLAN_MAX ? 'disabled' : ''}>＋ Ajouter un niveau</button><button id="set-planreset" class="cta ghost small" type="button">Plan par défaut (I. A. 1. a.)</button></div></div>
    <div class="set-sect"><div class="po-label">Fautes de frappe</div>
      <div class="set-checks"><label><input type="checkbox" id="set-autotypo" ${state.settings.autoTypo !== false ? 'checked' : ''}><span><b>Corriger seul les fautes de frappe courantes</b><small>« qaund » → « quand », « aevc » → « avec », « etre » → « être », « contart » → « contrat »… dès que vous tapez un espace ou une ponctuation, sans Internet ni IA : liste de fautes courantes, lexique de 24 000 mots (lettres inversées, lettre doublée, accent oublié — jamais un mot ambigu) et mots appris des corrections précédentes. Retour arrière juste après garde le mot tel que vous l’avez tapé (et il n’est plus corrigé). Les textes dans une autre langue ne sont pas touchés.</small></span></label></div></div>
    <div class="set-sect"><div class="po-label">Raccourcis de frappe</div>
      <div class="po-hint" style="margin:0 0 8px">Tape l’abréviation puis un espace : elle est remplacée par le texte complet (« tkt » → « t’inquiète »).</div>
      <div id="po-snips">${snippetRowsHTML()}</div>
      <button id="po-snipadd" class="cta ghost small">＋ Ajouter un raccourci</button></div>
    <div class="set-sect"><div class="po-label">Remplacements automatiques</div>
      <div class="po-hint" style="margin:0">Les symboles « >= », « +/- », « -> » sont mis en forme pour tout le monde. Avec une spécialité Santé dans le profil, la notation médicale (Na+ → Na⁺, HCO3- → HCO₃⁻, umol/L → µmol/L), les abréviations et les blocs Santé du menu « / » sont activés automatiquement${healthMode() ? ' <b>(actif)</b>' : ''}. Les blocs proposés dépendent des spécialités choisies : Compte › Modifier mon profil.</div></div>`;
  if (k === 'ia' && !isPlus()) return `<div class="set-sect"><div class="plus-lock">${PLUS_ICO.ia}<div><b>La correction et la mise en forme par IA font partie d’Alixo+</b><span>Fautes d’orthographe et de grammaire, propositions d’encadrés et de titres, reformulations : pendant la frappe ou à la demande (✨ ou F7), avec une clé Google gratuite ou la clé fournie par l’administrateur.</span></div></div>${plusCtaHTML()}<div id="plus-more" class="po-row" style="margin-top:12px"><button class="cta ghost small" id="set-plusmore" type="button">Voir tout ce que comprend Alixo+</button></div></div>`;
  if (k === 'plus') return `<div class="set-sect">${plusCtaHTML()}</div>
    ${activationHTML()}
    <div class="set-sect"><div class="po-label">Ce que change Alixo+</div>${plusTableHTML('')}
      <div class="po-hint">Le compte gratuit garde tout l’essentiel : cours, présentations, dossiers, fichiers jusqu’à 3 Go, agenda, partage, dictionnaire, export PDF, synchronisation. Alixo+ suit le compte : une seule fois pour le PC, le Mac, le web et le téléphone.</div></div>`;
  if (k === 'ia') { const o = aiOpt(); return `<div class="set-sect"><div class="po-label">Clé et activation</div><div id="po-aisetup">${aiSetupHTML('settings')}</div></div>
    <div class="set-sect"><div class="po-label">Ce que l’IA propose</div>
      <div class="set-checks" id="set-ai">
        <label><input type="checkbox" data-ai="auto" ${o.auto ? 'checked' : ''}><span><b>Analyse automatique pendant la frappe</b><small>À chaque fin de phrase (point, Entrée), après une pause de frappe ou en quittant le paragraphe, les phrases nouvelles partent en une seule requête ; les propositions apparaissent sous le paragraphe, Tab pour accepter, Échap pour ignorer. Sinon, seulement à la demande (✨ ou F7).</small></span></label>
        <label><input type="checkbox" data-ai="fix" ${o.fix ? 'checked' : ''}><span><b>Corriger l’orthographe et la grammaire</b><small>Accords, conjugaison, ponctuation… selon le niveau choisi ci-dessous.</small></span></label>
        <label><input type="checkbox" data-ai="autofix" ${o.autofix ? 'checked' : ''}><span><b>Corriger seul les fautes de frappe évidentes (sans Tab)</b><small>Lettres inversées, lettre manquante, accent oublié : quand l’IA est sûre, la correction s’applique d’elle-même (le mot est surligné un instant, Ctrl+Z pour revenir) et le mot est appris : la prochaine fois, il est corrigé à l’espace, sans requête. Les autres fautes restent proposées sous le paragraphe, Tab pour accepter.</small></span></label>
        <label><input type="checkbox" data-ai="multilang" ${o.multilang ? 'checked' : ''}><span><b>Corriger aussi les textes écrits dans une autre langue</b><small>Un bloc en anglais, espagnol, allemand, italien ou portugais est alors corrigé dans sa langue. Décoché : il est laissé tel quel. Dans tous les cas, un mot ou une citation en langue étrangère au milieu d’un texte français n’est jamais « corrigé ».</small></span></label>
        <label><input type="checkbox" data-ai="style" ${o.style ? 'checked' : ''}><span><b>Proposer une mise en forme</b><small>Repère les définitions, titres, arrêts, exemples, points à retenir… et propose l’encadré ou le titre adapté.</small></span></label>
        <label><input type="checkbox" data-ai="rephrase" ${o.rephrase ? 'checked' : ''}><span><b>Proposer des reformulations</b><small>Avec parcimonie : une phrase lourde peut être reformulée plus clairement, sans changer le sens (règle « Reformulation : … »).</small></span></label>
      </div></div>
    <div class="set-sect"><div class="po-label">Niveau de correction</div>
      <div class="set-tiles" id="set-ailevel">${AI_LEVELS.map(([v, l, h]) => `<button type="button" class="set-tile ${o.level === v ? 'on' : ''}" data-level="${v}"><b>${l}</b><span>${h}</span></button>`).join('')}</div>
      <div class="po-hint">Les abréviations juridiques et médicales, sigles, formules et mots latins ne sont jamais « corrigés ». Ces réglages suivent votre compte.${aiLastStatus ? `<br>Dernière analyse automatique — ${esc(aiLastStatus)}` : ''}</div></div>
    <div class="set-sect"><div class="po-label">Économie de requêtes</div>
      <div class="po-hint" style="margin:0 0 8px">${esc(aiStatsText(AlixoCorr.stats()))}</div>
      <div class="po-row" style="gap:8px; flex-wrap:wrap"><button class="cta ghost small" id="set-aiforget" type="button" title="Oublie les mots appris des corrections et les mots que vous avez demandé à ne plus corriger">Oublier les mots appris et ignorés</button><button class="cta ghost small" id="set-aicache" type="button" title="Les phrases déjà relues seront analysées à nouveau à la prochaine occasion">Vider la mémoire des phrases</button></div></div>`; }
  if (k === 'export') return `<div class="set-sect"><div class="po-label">Format d’export des séances</div>
      <div class="po-radios" id="po-fmt">
        ${Object.entries(EXPORT_FORMATS).map(([k2, v]) => `<label><input type="radio" name="fmt" value="${k2}" ${k2 === fmt ? 'checked' : ''}> ${v.label}</label>`).join('')}
      </div>
      <div class="po-hint">Utilisé par le bouton ⤓ de la barre du haut et par les archives .zip d’un dossier (clic droit → Télécharger en .zip). Ctrl+P exporte toujours en PDF. Les graphiques sont inclus sous forme d’images.</div></div>
    <div class="set-sect"><div class="po-label">PDF</div>
      <div class="po-hint" style="margin:0">Une séance s’exporte en A4 (bouton ⤓ ou Ctrl+P), avec sommaire au-delà de six titres ; une présentation s’exporte en pages 16:9, une diapositive par page.</div></div>`;
  if (k === 'apropos') return `<div class="set-sect"><div class="set-about"><span class="logo-mark"><img class="app-logo-img" src="${appLogoSrc()}" alt=""></span><div><div class="set-abname">Alixo${hasPlusPlan() ? '+' : ''} <span>${ALIXO_VERSION}</span></div><div class="po-hint" style="margin:0">Cockpit d’amphi : Droit, Économie, Commerce, Médecine et santé, STAPS.${desk && desk.versions ? ` Version PC · Electron ${esc(desk.versions.electron)} · Chromium ${esc(desk.versions.chrome)}` : ' Version web (navigateur).'}</div></div></div>
      <div class="po-row" style="gap:8px; margin-top:12px; flex-wrap:wrap">
        <button id="set-news" class="cta ghost small" type="button">Nouveautés de cette version</button>
        ${desk && desk.checkUpdates ? '<button id="set-upd" class="cta ghost small" type="button">Rechercher les mises à jour</button>' : ''}
        <button id="set-other" class="cta ghost small" type="button">${IS_DESKTOP ? 'Ouvrir la version web' : (IS_MAC_BROWSER ? 'Télécharger pour Mac' : 'Télécharger pour Windows')}</button>
        ${IS_DESKTOP ? '' : `<button id="set-other2" class="cta ghost small" type="button">${IS_MAC_BROWSER ? 'Télécharger pour Windows' : 'Télécharger pour Mac'}</button>`}
      </div>
      <div class="po-hint">Version web et version PC sont la même application, mises à jour ensemble : vos cours sont partagés entre les deux dès que vous êtes connecté au même compte (Paramètres › Compte).</div></div>
    <div class="set-sect"><div class="po-label">Raccourcis clavier</div>
      <div class="set-keys">${SHORTCUTS.map(([a, b]) => `<div><kbd>${esc(a)}</kbd><span>${esc(b)}</span></div>`).join('')}</div></div>`;
  return '';
}

function bindSettingsSection(k, root) {
  if (k === 'compte') {
    const stor = root.querySelector('#po-storage');
    if (stor) storageUsage().then(u => { if (stor.isConnected) { stor.className = ''; stor.innerHTML = storageHTML(u, !!(window.AlixoSync && window.AlixoSync.enabled)); const pb = stor.querySelector('#po-plus'); if (pb) pb.addEventListener('click', () => { settingsCat = 'plus'; renderSettingsBody(); }); } }).catch(() => { stor.textContent = 'Espace utilisé : calcul impossible'; });
    const wk = root.querySelector('#po-weekly');
    if (wk) wk.addEventListener('click', () => { closeSettings(); if (window.AlixoStats) AlixoStats.open(true); });
    const logout = root.querySelector('#po-logout');
    if (logout) logout.addEventListener('click', () => { closeSettings(); window.AlixoAuth.signOut(); });
    const pseudoOk = root.querySelector('#po-pseudo-ok');
    if (pseudoOk) { const go = () => { if (window.AlixoShare && AlixoShare.enabled) AlixoShare.setPseudo(root.querySelector('#po-pseudo').value); else toast('Connexion requise'); }; pseudoOk.addEventListener('click', go); root.querySelector('#po-pseudo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } }); }
    const editProfil = root.querySelector('#po-editprofil');
    if (editProfil) editProfil.addEventListener('click', () => { closeSettings(); openOnboarding(true); });
    const login = root.querySelector('#po-login');
    if (login) login.addEventListener('click', () => { closeSettings(); window.AlixoAuth.openAuthOverlay(); });
    return;
  }
  if (k === 'apparence') {
    root.querySelector('#set-theme').addEventListener('click', e => {
      const b = e.target.closest('[data-theme]'); if (!b) return;
      if (themeLocked(b.dataset.theme)) { openPlusDialog('themes'); return; }
      if (b.dataset.theme === 'auto') delete state.settings.theme; else state.settings.theme = b.dataset.theme;
      save(); applyTheme();
      root.querySelectorAll('#set-theme .set-tile').forEach(t => t.classList.toggle('on', t === b));
    });
    root.querySelector('#set-themebtn').addEventListener('change', e => { if (e.target.dataset.set !== 'showThemeBtn') return; state.settings.showThemeBtn = e.target.checked; save(); applyTheme(); });
    root.querySelector('#set-view').addEventListener('click', e => {
      const b = e.target.closest('[data-view]'); if (!b) return;
      state.settings.libView = b.dataset.view; save();
      root.querySelectorAll('#set-view .set-tile').forEach(t => t.classList.toggle('on', t === b));
      if (!currentDocId) renderLibrary();
    });
    return;
  }
  if (k === 'ecriture') {
    root.querySelector('#set-font').addEventListener('click', e => {
      const b = e.target.closest('[data-font]'); if (!b) return;
      if (fontLocked(b.dataset.font)) { openPlusDialog('polices'); return; }
      if (b.dataset.font) state.settings.docFont = b.dataset.font; else delete state.settings.docFont;
      save(); applyDocFont();
      root.querySelectorAll('#set-font .set-tile').forEach(t => t.classList.toggle('on', t === b));
    });
    root.querySelector('#set-fonthead').addEventListener('change', e => { if (e.target.value) state.settings.docFontHead = e.target.value; else delete state.settings.docFontHead; save(); applyDocFont(); });
    root.querySelector('#set-fontsize').addEventListener('change', e => { if (e.target.value !== 'm') state.settings.docSize = e.target.value; else delete state.settings.docSize; save(); applyDocFont(); });
    root.querySelector('#set-pageview').addEventListener('change', e => { if (e.target.checked) delete state.settings.pageView; else state.settings.pageView = false; save(); applyPagesMode(); toast(e.target.checked ? 'Feuille découpée en pages A4' : 'Feuille continue'); });
    bindPlanEditor(root);
    root.querySelector('#set-autotypo').addEventListener('change', e => { state.settings.autoTypo = e.target.checked; save(); toast(e.target.checked ? 'Fautes de frappe corrigées automatiquement' : 'Correction automatique des fautes de frappe désactivée'); });
    const box = root.querySelector('#po-snips');
    const syncRow = row => {
      const i = +row.dataset.i;
      const sn = state.settings.snippets[i]; if (!sn) return;
      sn.k = row.querySelector('.po-snipk').value.trim();
      sn.v = row.querySelector('.po-snipv').value;
      save();
    };
    box.addEventListener('input', e => { const row = e.target.closest('.po-sniprow'); if (row) syncRow(row); });
    box.addEventListener('click', e => {
      if (!e.target.classList.contains('po-snipdel')) return;
      const row = e.target.closest('.po-sniprow');
      state.settings.snippets.splice(+row.dataset.i, 1);
      save();
      box.innerHTML = snippetRowsHTML();
    });
    root.querySelector('#po-snipadd').addEventListener('click', () => {
      if (!state.settings.snippets) state.settings.snippets = [];
      state.settings.snippets.push({ k: '', v: '' });
      save();
      box.innerHTML = snippetRowsHTML();
      const rows = box.querySelectorAll('.po-sniprow');
      if (rows.length) rows[rows.length - 1].querySelector('.po-snipk').focus();
    });
    return;
  }
  if (k === 'plus' || (k === 'ia' && !isPlus())) {
    bindPlusCta(root, null);
    bindActivation(root);
    const more = root.querySelector('#set-plusmore'); if (more) more.addEventListener('click', () => { settingsCat = 'plus'; renderSettingsBody(); });
    return;
  }
  if (k === 'ia') {
    bindAiSetup(root.querySelector('#po-aisetup'), 'settings');
    root.querySelector('#set-ai').addEventListener('change', e => { const key = e.target.dataset.ai; if (!key) return; aiOpt(); state.settings.ai[key] = e.target.checked; save(); if (key === 'auto' && !e.target.checked) dismissSug(); const t = root.querySelector('.ai-styletoggle'); if (t && key === 'auto') t.checked = e.target.checked; });
    root.querySelector('#set-ailevel').addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (!b) return; aiOpt(); state.settings.ai.level = b.dataset.level; save(); root.querySelectorAll('#set-ailevel .set-tile').forEach(t => t.classList.toggle('on', t === b)); });
    const fg = root.querySelector('#set-aiforget'); if (fg) fg.addEventListener('click', () => { AlixoCorr.forget(); toast('Mots appris et ignorés oubliés'); });
    const cc = root.querySelector('#set-aicache'); if (cc) cc.addEventListener('click', () => { AlixoCorr.clearCache(); toast('Mémoire des phrases vidée'); });
    return;
  }
  if (k === 'export') {
    root.querySelector('#po-fmt').addEventListener('change', e => {
      if (e.target.name === 'fmt') { state.settings.exportFormat = e.target.value; save(); syncExportBtn(); toast(`Export : ${EXPORT_FORMATS[e.target.value].label}`); }
    });
    return;
  }
  if (k === 'apropos') {
    const news = root.querySelector('#set-news');
    if (news) news.addEventListener('click', () => { const url = ALIXO_VERSIONS_URL; if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(url); else window.open(url, '_blank'); });
    const upd = root.querySelector('#set-upd');
    if (upd) upd.addEventListener('click', () => { alixoDesktop.checkUpdates(); toast('Recherche des mises à jour…'); });
    const other = root.querySelector('#set-other');
    if (other) other.addEventListener('click', () => { const url = IS_DESKTOP ? ALIXO_WEB_URL : (IS_MAC_BROWSER ? ALIXO_MAC_URL : ALIXO_PC_URL); if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(url); else window.open(url, '_blank'); });
    const other2 = root.querySelector('#set-other2');
    if (other2) other2.addEventListener('click', () => window.open(IS_MAC_BROWSER ? ALIXO_PC_URL : ALIXO_MAC_URL, '_blank'));
  }
}

function renderSettingsBody() {
  const ov = $('#setov'); if (!ov) return;
  const cat = SET_CATS.find(c => c.k === settingsCat) || SET_CATS[0];
  ov.querySelectorAll('.set-navbtn').forEach(b => b.classList.toggle('on', b.dataset.cat === cat.k));
  ov.querySelector('.set-htitle').textContent = cat.name;
  ov.querySelector('.set-hsub').textContent = cat.sub;
  const body = ov.querySelector('#set-body');
  body.innerHTML = settingsSectionHTML(cat.k);
  body.scrollTop = 0;
  bindSettingsSection(cat.k, body);
}
function openSettings(cat) {
  if (typeof cat === 'string') settingsCat = cat;
  hidePopover(); closeCtxMenu();
  let ov = $('#setov');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'setov';
    ov.innerHTML = `<div class="set-card" role="dialog" aria-label="Paramètres">
      <aside class="set-nav">
        <div class="set-navtitle">Paramètres</div>
        ${SET_CATS.map(c => `<button type="button" class="set-navbtn" data-cat="${c.k}">${SET_ICO[c.k]}<span>${c.name}</span></button>`).join('')}
        <div class="set-navfoot">Alixo ${ALIXO_VERSION}</div>
      </aside>
      <div class="set-main">
        <header class="set-head"><div><h2 class="set-htitle"></h2><p class="set-hsub"></p></div><button class="set-x" type="button" title="Fermer (Échap)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
        <div id="set-body" class="set-body po-scope"></div>
      </div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('.set-x')) { closeSettings(); return; }
      const nb = e.target.closest('.set-navbtn');
      if (nb) { settingsCat = nb.dataset.cat; renderSettingsBody(); }
    });
  }
  ov.hidden = false;
  renderSettingsBody();
}
function closeSettings() { const ov = $('#setov'); if (ov) ov.hidden = true; }
document.addEventListener('keydown', e => {
  const ov = $('#setov');
  if (e.key === 'Escape' && ov && !ov.hidden && !$('.dlgov')) { e.stopPropagation(); closeSettings(); }
}, true);
$('#btn-settings').addEventListener('click', openSettings);

/* ============================================================
   Éditeur — une seule zone d'écriture continue (façon Google Docs)
   Le cours reste enregistré comme une liste de blocs (plan, journal,
   export, synchronisation), mais l'écran est un seul contenteditable :
   sélection, suppression, flèches et mise en forme traversent tout le
   texte nativement. Les objets (formule, graphique, tableau, image)
   sont des îlots non éditables dans le flux.
   ============================================================ */
const ROMAN = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'][n] || n;
const ALPHA = n => String.fromCharCode(64 + Math.min(n, 26));
const alpha = n => String.fromCharCode(96 + Math.min(n, 26));
const roman = n => ROMAN(n).toLowerCase();

/* ============================================================
   1.24 — Plan modifiable (Paramètres › Écriture › Plan du cours)
   state.settings.plan = { levels: [{ name, num, pre }] } : les niveaux du plus général (en haut de la pyramide)
   au plus fin. name : libellé (Partie, Chapitre, Section…) ; num : style de numéro ('I' romain, 'A', '1', 'a',
   'i' romain minuscule, '§', '-' aucun) ; pre : mots déclencheurs séparés par des virgules (« Chapitre, Chap. ») —
   une ligne qui commence par l'un d'eux devient un titre de ce niveau, comme « I. » ou « A. » le font déjà.
   Jusqu'à 6 niveaux. Les séances gardent leur numéro de niveau (b.level) : seuls l'affichage (numéro, libellé,
   retrait) et la détection suivent le plan ; un niveau au-delà du plan est affiché comme le dernier.
   ============================================================ */
const PLAN_MAX = 6;
const PLAN_DEFAULT = [
  { name: 'Partie', num: 'I', pre: '' },
  { name: 'Section', num: 'A', pre: '' },
  { name: 'Sous-section', num: '1', pre: '' },
  { name: 'Paragraphe', num: 'a', pre: '' }
];
/* styles de numérotation : [exemple, fonction] */
const NUM_STYLES = { I: ['I.', ROMAN], A: ['A.', ALPHA], '1': ['1.', String], a: ['a.', alpha], i: ['i.', roman], '§': ['§ 1', n => '§ ' + n], '-': ['—', () => ''] };
const NUM_STYLE_NAMES = { I: 'I. II. III.', A: 'A. B. C.', '1': '1. 2. 3.', a: 'a. b. c.', i: 'i. ii. iii.', '§': '§ 1, § 2', '-': 'Sans numéro' };
function planLevels() {
  const p = state.settings && state.settings.plan;
  const raw = p && Array.isArray(p.levels) && p.levels.length ? p.levels : PLAN_DEFAULT;
  return raw.slice(0, PLAN_MAX).map((l, i) => ({
    name: String((l && l.name) || (PLAN_DEFAULT[i] ? PLAN_DEFAULT[i].name : '') || `Niveau ${i + 1}`),
    num: l && NUM_STYLES[l.num] ? l.num : (PLAN_DEFAULT[i] ? PLAN_DEFAULT[i].num : '1'),
    pre: String((l && l.pre) || '')
  }));
}
const planDepth = () => planLevels().length;
const planLevelOf = level => { const lv = planLevels(); return lv[Math.min(lv.length, Math.max(1, +level || 1)) - 1]; };
const planName = level => planLevelOf(level).name;
const planSample = level => NUM_STYLES[planLevelOf(level).num][0];
function planNum(level, n) {
  const st = planLevelOf(level).num;
  const v = NUM_STYLES[st][1](n);
  return st === '§' || st === '-' ? v : v + '.';
}
/* mots déclencheurs : [{ level, re }] — « Chapitre 1 », « chapitre : … », « Chap. II » (suivi d'un espace ou d'une ponctuation) */
let planPrefixCache = { key: '', rules: [] };
function planPrefixRules() {
  const lv = planLevels();
  const key = lv.map(l => l.pre).join('\u0000');
  if (planPrefixCache.key === key) return planPrefixCache.rules;
  const rules = [];
  lv.forEach((l, i) => {
    for (const w of l.pre.split(/[,;]/).map(x => x.trim()).filter(Boolean)) {
      try { rules.push({ level: i + 1, re: new RegExp('^' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s:.,;\u2013\u2014-]', 'iu') }); } catch { /* mot invalide */ }
    }
  });
  planPrefixCache = { key, rules };
  return rules;
}
/* le plan a changé (Paramètres) : numéros, volet plan et menus suivent */
function applyPlanChange() {
  planPrefixCache = { key: '', rules: [] };
  if (currentDocId && !isSpecialDoc(doc())) { renderBlocks('__none'); renderPlan(); }
}

/* numéros des titres (I. A. 1. a. — ou le plan personnalisé) et des listes numérotées (1. a. i.) */
function computeNumbers(blocks) {
  const counters = new Array(PLAN_MAX).fill(0);
  const map = {};
  const lc = [0, 0, 0, 0];
  let inList = false;
  for (const b of blocks) {
    if (b.type === 'li' && b.lt === 'ol') {
      const ind = Math.min(3, Math.max(0, +b.ind || 0));
      if (!inList) lc.fill(0);
      lc[ind]++;
      for (let i = ind + 1; i < 4; i++) lc[i] = 0;
      map[b.id] = [String, alpha, roman, String][ind](lc[ind]) + '.';
      inList = true;
      continue;
    }
    inList = b.type === 'li';   // une puce ou une case au milieu ne casse pas la numérotation
    if (b.type !== 'h') continue;
    const L = Math.min(PLAN_MAX, Math.max(1, +b.level || 1));
    counters[L - 1]++;
    for (let i = L; i < PLAN_MAX; i++) counters[i] = 0;
    map[b.id] = planNum(L, counters[L - 1]);
  }
  return map;
}

const CALLOUTS = {
  definition: { name: 'Définition', ico: 'book-open' },
  arret: { name: 'Arrêt de principe', ico: 'scale', spec: 'droit' },
  controverse: { name: 'Controverse doctrinale', ico: 'message-circle', spec: 'droit' },
  retenir: { name: 'À retenir', ico: 'pin' },
  exemple: { name: 'Exemple', ico: 'lightbulb' },
  bilan: { name: 'Bilan', ico: 'clipboard', sub: 'Ce qu’il faut retenir de cette partie' },
  /* encadrés Santé (voir js/med.js) */
  drapeau: Object.assign({ spec: 'sante' }, AlixoMed.CALLOUTS.drapeau),
  reflexe: Object.assign({ spec: 'sante' }, AlixoMed.CALLOUTS.reflexe),
  mnemo: Object.assign({ spec: 'sante' }, AlixoMed.CALLOUTS.mnemo),
  objectifs: Object.assign({ spec: 'sante' }, AlixoMed.CALLOUTS.objectifs)
};
/* 1.18 — fiches Commerce & marketing et STAPS : même mécanique que les fiches Santé (js/med.js) */
Object.assign(AlixoMed.FICHES, {
  swot: { name: 'Analyse SWOT', ico: 'target', color: '#d4692a', head: 'Entreprise, marque ou projet', spec: 'commerce',
    fields: [['forces', 'Forces (interne)'], ['faiblesses', 'Faiblesses (interne)'], ['opport', 'Opportunités (externe)'], ['menaces', 'Menaces (externe)'], ['axes', 'Axes stratégiques']] },
  mix: { name: 'Marketing mix (4P)', ico: 'layers', color: '#b3762a', head: 'Produit ou marque', spec: 'commerce',
    fields: [['produit', 'Produit'], ['prix', 'Prix'], ['distrib', 'Distribution (place)'], ['comm', 'Communication (promotion)'], ['cible', 'Cible / positionnement']] },
  pestel: { name: 'Analyse PESTEL', ico: 'globe', color: '#3d6bb5', head: 'Marché ou secteur', spec: 'commerce',
    fields: [['pol', 'Politique'], ['eco', 'Économique'], ['socio', 'Socioculturel'], ['tech', 'Technologique'], ['ecol', 'Écologique'], ['legal', 'Légal']] },
  etudecas: { name: 'Étude de cas', ico: 'briefcase', color: '#7a6852', head: 'Entreprise / situation', spec: 'commerce',
    fields: [['contexte', 'Contexte'], ['pb', 'Problématique'], ['diag', 'Diagnostic'], ['reco', 'Recommandations'], ['plan', 'Plan d’action'], ['budget', 'Budget / indicateurs']] },
  persona: { name: 'Persona client', ico: 'user', color: '#a8556f', head: 'Nom du persona', spec: 'commerce',
    fields: [['profil', 'Profil (âge, situation, revenus)'], ['besoins', 'Besoins / motivations'], ['freins', 'Freins / objections'], ['canaux', 'Canaux / parcours d’achat'], ['message', 'Message clé']] },
  negoc: { name: 'Fiche négociation / vente', ico: 'cart', color: '#2e8b6a', head: 'Client / offre', spec: 'commerce',
    fields: [['decouverte', 'Découverte (questions)'], ['argu', 'Argumentaire (CAP / SONCAS)'], ['objections', 'Traitement des objections'], ['conclusion', 'Conclusion / closing'], ['suivi', 'Suivi']] },
  seance: { name: 'Séance d’entraînement', ico: 'activity', color: '#1f9d8a', head: 'Séance (objectif, public)', spec: 'staps',
    fields: [['obj', 'Objectif'], ['echauff', 'Échauffement'], ['corps', 'Corps de séance (situations, séries, répétitions)'], ['calme', 'Retour au calme'], ['charge', 'Charge / intensité / récupération'], ['materiel', 'Matériel et sécurité']] },
  apsa: { name: 'Fiche APSA', ico: 'trophy', color: '#3d6bb5', head: 'Activité physique, sportive ou artistique', spec: 'staps',
    fields: [['logique', 'Logique interne'], ['regles', 'Règlement essentiel'], ['habiletes', 'Habiletés / techniques'], ['tactique', 'Tactique / stratégie'], ['securite', 'Sécurité'], ['eval', 'Évaluation']] },
  muscle: { name: 'Fiche muscle', ico: 'dna', color: '#c04343', head: 'Muscle', spec: 'staps',
    fields: [['origine', 'Origine'], ['terminaison', 'Terminaison'], ['innerv', 'Innervation'], ['action', 'Action(s)'], ['etirement', 'Étirement / renforcement'], ['patho', 'Blessures fréquentes']] },
  physio: { name: 'Physiologie de l’effort', ico: 'zap', color: '#b3762a', head: 'Notion (filière, VO₂max, seuil…)', spec: 'staps',
    fields: [['def', 'Définition'], ['meca', 'Mécanismes'], ['facteurs', 'Facteurs limitants'], ['adapt', 'Adaptations à l’entraînement'], ['mesure', 'Mesure / tests'], ['appli', 'Applications pratiques']] },
  cycle: { name: 'Cycle / progression', ico: 'list', color: '#674ea7', head: 'Cycle (classe ou public, APSA)', spec: 'staps',
    fields: [['niveau', 'Niveau de départ'], ['objectifs', 'Objectifs du cycle'], ['situations', 'Situations d’apprentissage'], ['criteres', 'Critères de réussite'], ['eval', 'Évaluation'], ['differenciation', 'Différenciation']] },
  obs: { name: 'Observation / analyse de pratique', ico: 'clipboard', color: '#33658a', head: 'Situation observée', spec: 'staps',
    fields: [['contexte', 'Contexte (public, lieu, durée)'], ['obs', 'Observations'], ['analyse', 'Analyse (réussites, difficultés)'], ['pistes', 'Pistes de régulation']] }
});
const JURIS_FIELDS = [['faits', 'Faits'], ['probleme', 'Problème'], ['solution', 'Solution'], ['portee', 'Portée']];
/* fiches structurées : la fiche d'arrêt (droit) et les fiches Santé partagent la même mécanique (champ titre + grille de champs) */
const JURIS_DEF = { name: 'Fiche d’arrêt', ico: 'scale', color: '#8c4351', head: 'Cass. civ. 1re, 12 juill. 2023, n° 22-14.081', fields: JURIS_FIELDS };
const isFiche = b => !!b && (b.type === 'juris' || b.type === 'fiche');
function ficheDef(b) {
  if (!b) return JURIS_DEF;
  if (b.type === 'juris') return JURIS_DEF;
  return AlixoMed.FICHES[b.fk] || AlixoMed.FICHES.patho;
}
const PH_P = 'Écrivez, ou tapez « / » pour insérer…';
const TEXT_TYPES = ['p', 'h', 'li', 'quote', 'callout'];
const MULTILINE_TYPES = ['callout', 'quote'];          // Entrée = saut de ligne dans le bloc
const OBJECT_TYPES = ['formula', 'graph', 'table', 'img', 'draw', 'chart', 'score', 'mcalc', 'timer', 'hr', 'pb', 'tree'];
const BLOCK_PROPS = ['text', 'level', 'ct', 'src', 'gtype', 'params', 'fields', 'lt', 'ind', 'done', 'iid', 'nw', 'nh', 'w', 'align', 'crop', 'cap', 'alt', 'rows', 'head', 'widths', 'bg', 'al', 'ta', 'shapes', 'h', 'cite', 'fk', 'ck', 'title', 'labels', 'series', 'opts', 'sk', 'vals', 'mode', 'secs', 'label', 'cards', 'root', 'spans'];
/* « atomes » non éditables dans le texte : références d'articles, items LiSA, résultats de calcul, liens, rangs */
const ATOM_SEL = '.refart, .calc-res, .lnk, .rtag';
const ATOM_RE = /<img|refart|calc-res|class="lnk"|rtag/;
/* paragraphe vide (sans texte ni atome) */
/* bloc « cartes » : 3 par ligne, chacune avec un titre et un texte */
const cardsOf = b => (Array.isArray(b.cards) && b.cards.length ? b.cards : [{ t: '', x: '' }, { t: '', x: '' }, { t: '', x: '' }]).map(c => ({ t: c && c.t || '', x: c && c.x || '' }));
const isEmptyPara = b => !!b && b.type === 'p' && !stripTags(b.text || '').trim() && !ATOM_RE.test(b.text || '');
const ALIGNS = ['left', 'center', 'right', 'justify'];
const alClass = b => (b.al && b.al !== 'left' && ALIGNS.includes(b.al) ? ' al-' + b.al : '');
/* couleur d'encre lisible sur un fond donné (hex ou rgb) */
/* deux couleurs CSS (#hex ou rgb()) désignent-elles la même teinte ? */
function sameColor(a, b) {
  const rgb = c => { const t = document.createElement('i'); t.style.color = ''; t.style.color = String(c || ''); return t.style.color; };
  const x = rgb(a), y = rgb(b);
  return !!x && x === y;
}
/* 1.21 : spans dont l'encre est égale au fond (texte invisible, cours enregistrés avec la fuite de la palette ≤ 1.20) */
function repairHilite(html) {
  if (!html || html.indexOf('background') < 0) return html;
  const t = document.createElement('div'); t.innerHTML = html;
  let changed = false;
  t.querySelectorAll('span[style*="background"]').forEach(sp => {
    const bg = sp.style.backgroundColor; if (!bg || bg === 'transparent') return;
    if (sp.style.color && (sameColor(sp.style.color, bg) || /^(inherit|initial|unset|currentcolor)$/i.test(sp.style.color))) { sp.style.color = contrastInk(bg); sp.dataset.autoInk = '1'; changed = true; }
  });
  return changed ? t.innerHTML : html;
}
function repairHiliteBlock(b) {
  if (typeof b.text === 'string') b.text = repairHilite(b.text);
  if (typeof b.cite === 'string') b.cite = repairHilite(b.cite);
  if (b.fields) for (const k of Object.keys(b.fields)) b.fields[k] = repairHilite(b.fields[k]);
  if (Array.isArray(b.rows)) b.rows.forEach(row => { for (let c = 0; c < row.length; c++) row[c] = repairHilite(row[c]); });
  if (Array.isArray(b.cards)) b.cards.forEach(c => { if (c) { c.t = repairHilite(c.t); c.x = repairHilite(c.x); } });
}
function contrastInk(bg) {
  const m = String(bg || '').match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  let r, g, bl;
  if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join(''); r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); bl = parseInt(h.slice(4, 6), 16); }
  else { const n = String(bg || '').match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/); if (!n) return ''; r = +n[1]; g = +n[2]; bl = +n[3]; }
  return (0.299 * r + 0.587 * g + 0.114 * bl) < 140 ? '#ffffff' : '#202124';
}
const isTextBlock = b => !!b && TEXT_TYPES.includes(b.type);
const isObjectBlock = b => !!b && OBJECT_TYPES.includes(b.type);

/* ---------------- images : stockées sur l'appareil (IndexedDB), en cache mémoire ---------------- */
const AlixoImages = (() => {
  const cache = new Map();
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open('alixo-images', 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => r.result.createObjectStore('img');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  async function putLocal(id, data) {
    cache.set(id, data);
    try {
      const db = await open();
      await new Promise((res, rej) => { const t = db.transaction('img', 'readwrite'); t.objectStore('img').put(data, id); t.oncomplete = res; t.onerror = () => rej(t.error); });
    } catch (e) { console.error('Image non enregistrée sur l’appareil :', e); }
  }
  async function put(id, data) {
    await putLocal(id, data);
    if (window.AlixoSync && window.AlixoSync.pushImage) window.AlixoSync.pushImage(id, data);
  }
  async function get(id) {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    try {
      const db = await open();
      const v = await new Promise((res, rej) => { const r = db.transaction('img').objectStore('img').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
      if (v) { cache.set(id, v); return v; }
    } catch { /* IndexedDB indisponible */ }
    if (window.AlixoSync && window.AlixoSync.fetchImage) {
      const v = await window.AlixoSync.fetchImage(id);
      if (v) { await putLocal(id, v); return v; }
    }
    // image d'une séance partagée avec moi (Alixo Share)
    if (window.AlixoShare && window.AlixoShare.fetchImage) {
      const v = await window.AlixoShare.fetchImage(id);
      if (v) { await putLocal(id, v); return v; }
    }
    return null;
  }
  return { put, putLocal, get, cache, has: id => cache.has(id) };
})();
/* charge en mémoire les images d'une séance (avant rendu ou export) */
function preloadImages(d) {
  const ids = (d && d.blocks || []).filter(b => b.type === 'img' && b.iid && !AlixoImages.has(b.iid)).map(b => b.iid);
  return Promise.all(ids.map(id => AlixoImages.get(id)));
}
/* complète les <img> dont la donnée est arrivée après le rendu */
function patchImages() {
  $$('#blocks .block.img .imgbox.loading').forEach(box => {
    const fig = box.closest('.block'); const b = getBlock(fig.dataset.id); if (!b) return;
    const src = AlixoImages.cache.get(b.iid);
    if (src) { box.classList.remove('loading'); box.insertAdjacentHTML('afterbegin', `<img src="${src}" alt="${esc(b.alt || '')}" draggable="false">`); return; }
    AlixoImages.get(b.iid).then(v => {
      if (!box.isConnected) return;
      box.classList.remove('loading');
      if (v) box.insertAdjacentHTML('afterbegin', `<img src="${v}" alt="${esc(b.alt || '')}" draggable="false">`); else box.classList.add('missing');
    });
  });
}
/* variables CSS d'une image : largeur, recadrage (non destructif, en fractions de l'original) */
function imgCrop(b) { const c = b.crop; return c && c.w > 0 && c.h > 0 ? { x: +c.x || 0, y: +c.y || 0, w: +c.w, h: +c.h } : { x: 0, y: 0, w: 1, h: 1 }; }
function imgStyle(b) {
  const nw = b.nw || 4, nh = b.nh || 3, c = imgCrop(b);
  return `--w:${Math.max(8, Math.min(100, +b.w || 60))}%; --ar:${((c.w * nw) / (c.h * nh)).toFixed(4)}; --nar:${(nw / nh).toFixed(4)}; --iw:${(100 / c.w).toFixed(3)}%; --tx:${(-c.x * 100).toFixed(3)}%; --ty:${(-c.y * 100).toFixed(3)}%`;
}

/* ---------------- rendu d'un bloc ---------------- */
const MV_HANDLE = `<span class="mv-handle" contenteditable="false" title="Glisser pour déplacer">⋮⋮</span>`;
function blockHTML(b, numMap) {
  switch (b.type) {
    case 'h':
      return `<div class="block h l${b.level || 1}${alClass(b)}" data-id="${b.id}" data-num="${numMap[b.id] || ''}"><div class="btxt" data-ph="Titre…">${b.text || '<br>'}</div></div>`;
    case 'li': {
      const lt = b.lt === 'ol' || b.lt === 'cl' ? b.lt : 'ul';
      const ind = Math.min(3, Math.max(0, +b.ind || 0));
      return `<div class="block li ${lt}${ind ? ' ind' + ind : ''}${b.done ? ' done' : ''}${alClass(b)}" data-id="${b.id}"${lt === 'ol' ? ` data-num="${numMap[b.id] || ''}"` : ''}>${lt === 'cl' ? '<span class="cbox" contenteditable="false" title="Cocher / décocher"></span>' : ''}<div class="btxt" data-ph="Élément de liste…">${b.text || '<br>'}</div></div>`;
    }
    case 'quote':
      /* citation + ligne « auteur / source » (champ à part, jamais vide à l'export) */
      return `<div class="block quote${alClass(b)}" data-id="${b.id}"><div class="btxt" data-ph="Citation…">${b.text || '<br>'}</div><div class="qcite" data-f="cite" data-ph="— Auteur, œuvre, année (ou DOI / PMID par le clic droit)">${b.cite || '<br>'}</div></div>`;
    case 'callout': {
      const c = CALLOUTS[b.ct] || CALLOUTS.retenir;
      const style = c.color ? ` style="--cc-light:${c.color}; --cc-dark:${c.dark || c.color}"` : '';
      return `<div class="block callout${alClass(b)}" data-id="${b.id}" data-ct="${b.ct}"${style}><span class="cico" contenteditable="false">${AlixoIcons.svg(c.ico)}</span><div class="ctitle" contenteditable="false">${c.name}${c.sub ? `<span class="csub">${c.sub}</span>` : ''}</div><div class="btxt" data-ph="${b.ct === 'bilan' || b.ct === 'objectifs' ? 'Points clés… (« - » en début de ligne pour une puce)' : 'Contenu de l’encadré…'}">${b.text || '<br>'}</div></div>`;
    }
    case 'draw':
      return window.AlixoDraw ? AlixoDraw.blockHTML(b, MV_HANDLE) : `<div class="block draw" data-id="${b.id}" contenteditable="false">${MV_HANDLE}<div class="draw-wrap">Dessin</div></div>`;
    case 'juris':
    case 'fiche': {
      const f = b.fields || {}, def = ficheDef(b);
      const old = def.fields.find(([k]) => k === 'annee'); // recommandation : année ancienne signalée
      const year = old && f.annee ? parseInt(stripTags(f.annee), 10) : 0;
      const badge = year && new Date().getFullYear() - year >= 5 ? `<span class="jbadge" contenteditable="false" title="Recommandation de plus de 5 ans : vérifier qu’elle est toujours en vigueur">ancienne</span>` : '';
      const timer = def.timer ? `<button class="jtimer" contenteditable="false" data-tstart="${def.timer}" type="button" title="Lancer un compte à rebours de ${Math.round(def.timer / 60)} min">⏱ ${Math.round(def.timer / 60)} min</button>` : '';
      return `<div class="block ${b.type === 'juris' ? 'juris' : 'fiche juris'}" data-id="${b.id}"${b.type === 'fiche' ? ` data-fk="${esc(b.fk || 'patho')}" style="--fc:${def.color}"` : ''}>
        <div class="juris-head"><span class="jico" contenteditable="false">${AlixoIcons.svg(def.ico)}</span>${b.type === 'fiche' ? `<span class="jkind" contenteditable="false">${esc(def.name)}</span>` : ''}<div class="jref" data-f="ref" data-ph="${esc(def.head)}">${f.ref || '<br>'}</div>${badge}${timer}</div>
        <div class="juris-grid">${def.fields.map(([k, lab]) => `<div class="jlabel" contenteditable="false">${lab}</div><div class="jval" data-f="${k}">${f[k] || '<br>'}</div>`).join('')}</div></div>`;
    }
    case 'chart': {
      const t = AlixoCharts.TYPES[b.ck] ? b.ck : 'bar';
      const o = b.opts || {};
      return `<div class="block chart" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
        <div class="chart-card"><div class="cwrap">${AlixoCharts.svg(b)}</div>
        <div class="chart-tools">
          ${Object.entries(AlixoCharts.TYPES).map(([k, v]) => `<button data-ct="${k}" class="${k === t ? 'on' : ''}" title="${esc(v.name)}">${AlixoIcons.svg(v.ico)}</button>`).join('')}
          <span class="tb-sep"></span>
          <button data-cact="data" class="primary" title="Modifier les données (collage depuis Excel / Sheets possible)">Données…</button>
          <button data-cact="colors" title="Couleurs des séries">Couleurs</button>
          <button data-cact="legend" class="${o.legend !== false ? 'on' : ''}" title="Afficher la légende">Légende</button>
          <button data-cact="values" class="${o.values ? 'on' : ''}" title="Afficher les valeurs">Valeurs</button>
          <button data-cact="stack" class="${o.stack ? 'on' : ''}" title="Empiler les séries">Empilé</button>
          <button data-cact="del" class="danger" title="Supprimer le graphique">Supprimer</button>
        </div></div></div>`;
    }
    case 'score': {
      const sc = AlixoMed.SCORES[b.sk]; if (!sc) return `<div class="block score" data-id="${b.id}" contenteditable="false">${MV_HANDLE}<div class="score-card">Score inconnu</div></div>`;
      const vals = Array.isArray(b.vals) ? b.vals : [];
      const total = scoreTotal(b);
      const it = sc.interp.find(([a, z]) => total >= a && total <= z);
      return `<div class="block score" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
        <div class="score-card"><div class="score-head"><span class="score-name">${esc(sc.name)}</span><span class="score-sub">${esc(sc.sub || '')}</span></div>
        <div class="score-items">${sc.items.map((item, i) => item.opts
          ? `<label class="score-row"><span class="score-l">${esc(item.l)}</span><select data-si="${i}">${item.opts.map(([p, lab]) => `<option value="${p}" ${vals[i] === p ? 'selected' : ''}>${esc(lab)} (${p})</option>`).join('')}${vals[i] === undefined || vals[i] === null ? '<option value="" selected>—</option>' : ''}</select></label>`
          : `<label class="score-row"><input type="checkbox" data-si="${i}" ${vals[i] ? 'checked' : ''}><span class="score-l">${esc(item.l)}</span><span class="score-p">${item.p > 0 ? '+' : ''}${item.p}</span></label>`).join('')}</div>
        <div class="score-total"><span>Total</span><b>${Number.isInteger(total) ? total : total.toFixed(1)}</b>${it ? `<span class="score-interp">${esc(it[2])}</span>` : ''}</div></div></div>`;
    }
    case 'mcalc': {
      const c = AlixoMed.CALCS[b.ck]; if (!c) return `<div class="block mcalc" data-id="${b.id}" contenteditable="false">${MV_HANDLE}<div class="score-card">Calculateur inconnu</div></div>`;
      const vals = mcalcVals(b);
      let res = [];
      try { res = c.out(vals); } catch { res = []; }
      return `<div class="block mcalc" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
        <div class="score-card"><div class="score-head"><span class="score-name">${esc(c.name)}</span><span class="score-sub">${esc(c.sub || '')}</span></div>
        <div class="mcalc-in">${c.inputs.map(inp => inp.sel
          ? `<label><span>${esc(inp.l)}</span><select data-mk="${inp.k}">${inp.sel.map(([v, lab]) => `<option value="${v}" ${vals[inp.k] === v ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select></label>`
          : `<label><span>${esc(inp.l)}${inp.u ? ` <em>${esc(inp.u)}</em>` : ''}</span><input data-mk="${inp.k}" type="${inp.date ? 'date' : 'text'}" inputmode="decimal" value="${esc(vals[inp.k] ?? '')}"></label>`).join('')}</div>
        <div class="mcalc-out">${res.map(r => `<div class="mcalc-res"><span>${esc(r.l)}</span><b>${esc(typeof r.v === 'number' && !isFinite(r.v) ? '—' : String(r.v).replace('.', ','))}</b>${r.u ? `<span class="mcalc-u">${esc(r.u)}</span>` : ''}${r.note ? `<span class="score-interp">${esc(r.note)}</span>` : ''}</div>`).join('')}</div></div></div>`;
    }
    case 'hr':
      return `<div class="block hr" data-id="${b.id}" contenteditable="false">${MV_HANDLE}<hr></div>`;
    case 'pb':   // 1.23 : saut de page (le texte qui suit commence sur une nouvelle page, à l'écran comme dans le PDF)
      return `<div class="block pb" data-id="${b.id}" contenteditable="false">${MV_HANDLE}<div class="pb-line">Saut de page</div></div>`;
    case 'tree':
      return trBlockHTML(b);
    case 'cards': {
      const cards = cardsOf(b);
      return `<div class="block cards" data-id="${b.id}">
        <div class="cards-grid">${cards.map((c, i) => `<div class="card-item"><div class="cd-t" data-f="t${i}" data-ph="Titre">${c.t || '<br>'}</div><div class="cd-x" data-f="x${i}" data-ph="Texte de la carte…">${c.x || '<br>'}</div></div>`).join('')}</div>
        <div class="cards-tools" contenteditable="false"><button data-cd="add" type="button" title="Ajouter une carte">＋ carte</button><button data-cd="del" type="button" title="Retirer la dernière carte">− carte</button><button data-cd="rm" class="danger" type="button" title="Supprimer le bloc">Supprimer</button></div></div>`;
    }
    case 'timer': {
      const secs = Math.max(0, +b.secs || 0), down = b.mode !== 'up';
      const run = timerRuns[b.id];
      return `<div class="block timer${run ? ' running' : ''}" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
        <div class="timer-card"><span class="timer-ico">⏱</span><span class="timer-label">${esc(b.label || (down ? 'Compte à rebours' : 'Chronomètre'))}</span>
        <span class="timer-digits" data-tid="${b.id}">${fmtClock(down ? secs : 0)}</span>
        <button data-tm="toggle" title="Démarrer / mettre en pause">${run && !run.paused ? '❚❚' : '▶'}</button><button data-tm="reset" title="Remettre à zéro">↺</button><button data-tm="set" title="Régler (durée, libellé, mode)">⋯</button></div></div>`;
    }
    case 'formula': {
      if (editingFormula[b.id]) {
        return `<div class="block formula" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
          <input class="fsrc" value="${esc(b.src || '')}" placeholder="ex. e_p = (dQ/Q)/(dP/P)   ·   x_i^2   ·   Coût total = Prix xx Quantité   ·   mat(a, b; c, d)" spellcheck="false" autocomplete="off">
          <div class="fhint">Entrée pour composer · Échap pour annuler · Maj+Entrée : nouvelle ligne · mots avec espaces, x_i^2, vec(u), abs(x), mat(…), cases(…) — aide dans le panneau Symboles</div></div>`;
      }
      const html = AlixoMath.render(b.src);
      return `<div class="block formula ${b.src ? '' : 'empty'}" data-id="${b.id}" contenteditable="false">${MV_HANDLE}<div class="frender" title="Cliquer pour modifier">${html || 'Formule vide — cliquer pour saisir'}</div></div>`;
    }
    case 'table': {
      const rows = Array.isArray(b.rows) && b.rows.length ? b.rows : [['', ''], ['', '']];
      const nc = Math.max(1, ...rows.map(r => r.length));
      const widths = tableWidths(b, nc);
      const covered = tableCovered(b), anchors = new Map(tableSpans(b).map(x => [x.r + ':' + x.c, x]));
      return `<div class="block table" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
        <div class="tbl-tools">
          <span class="tt-grp">
            <button data-t="row+" title="Ajouter une ligne en dessous"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="10" rx="1.5"/><path d="M3 9h18M12 17v4M10 19h4"/></svg><span>Ligne</span></button>
            <button data-t="col+" title="Ajouter une colonne à droite"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="11" height="18" rx="1.5"/><path d="M8.5 3v18M17 10v4M15 12h4"/></svg><span>Colonne</span></button>
            <button data-t="row-" title="Supprimer cette ligne"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="10" rx="1.5"/><path d="M3 9h18M10 19h4"/></svg></button>
            <button data-t="col-" title="Supprimer cette colonne"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="11" height="18" rx="1.5"/><path d="M8.5 3v18M15 12h4"/></svg></button>
          </span>
          <span class="tt-sep"></span>
          <span class="tt-grp">
            <button data-t="merge" title="Fusionner les cases sélectionnées (glissez d’une case à l’autre, ou Maj+clic) : une ligne d’une seule case au-dessus d’une ligne de trois, par exemple"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M9 12h6M9 12l2-2M9 12l2 2M15 12l-2-2M15 12l-2 2"/></svg><span>Fusionner</span></button>
            <button data-t="split" title="Scinder la case fusionnée"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M12 5v14M7 12h2M15 12h2"/></svg><span>Scinder</span></button>
            <button data-t="head" class="${b.head ? 'on' : ''}" title="Première ligne en en-tête"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M9 9v11M15 9v11"/><path d="M3 4h18v5H3z" fill="currentColor" stroke="none" opacity=".35"/></svg><span>En-tête</span></button>
          </span>
          <span class="tt-sep"></span>
          <span class="tt-grp">
            <button data-t="copy" title="Copier tout le tableau (à coller ailleurs dans le cours, dans une case, un encadré, ou dans Word / Excel)"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>Copier</span></button>
            <button data-t="dup" title="Dupliquer le tableau juste en dessous"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5" stroke-dasharray="2 2"/></svg><span>Dupliquer</span></button>
            <button data-t="del" class="danger" title="Supprimer le tableau"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
          </span>
        </div>
        <div class="tbl-wrap"><table class="tbl ${b.head ? 'has-head' : ''}"><colgroup>${widths.map(w => `<col style="width:${w.toFixed(2)}%">`).join('')}</colgroup><tbody>${rows.map((r, ri) =>
          `<tr>${Array.from({ length: nc }, (_, ci) => { if (covered.has(ri + ':' + ci)) return ''; const sp = anchors.get(ri + ':' + ci); const last = ci + (sp ? sp.cs : 1) - 1; const bg = cellBg(b, ri, ci); const ta = cellTa(b, ri, ci); return `<td${sp ? ` colspan="${sp.cs}" rowspan="${sp.rs}"` : ''}${bg ? ` style="background:${esc(bg)}; color:${contrastInk(bg)}"` : ''}><div class="tcell" contenteditable="true" data-r="${ri}" data-c="${ci}"${ta ? ` style="text-align:${ta}"` : ''}>${r[ci] || ''}</div>${last < nc - 1 ? `<span class="tbl-rz" data-c="${last}" title="Glisser pour redimensionner la colonne"></span>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    }
    case 'graph': {
      const t = AlixoGraphs.TYPES[b.gtype];
      const p = b.params || {};
      let controls = '';
      if (t && t.engine === 'two') {
        controls = `<span class="gc-label">${esc(t.cfg.c1.label)}</span>
          <button class="gcbtn" data-g="s1+">▲</button><button class="gcbtn" data-g="s1-">▼</button>
          <span class="gc-label">${esc(t.cfg.c2.label)}</span>
          <button class="gcbtn" data-g="s2+">▲</button><button class="gcbtn" data-g="s2-">▼</button>
          <button class="gcbtn ${p.surplus ? 'on' : ''}" data-g="surplus">Surplus</button>
          <button class="gcbtn" data-g="reset">Réinitialiser</button>
          <span class="graph-hint">Glissez une courbe pour la déplacer</span>`;
      } else if (t && t.engine === 'plot') {
        controls = `<input data-g="f1" value="${esc(p.f1 || '')}" placeholder="Qd = 100 − 2P" spellcheck="false">
          <input data-g="f2" value="${esc(p.f2 || '')}" placeholder="Qs = 20 + 2P" spellcheck="false">
          <button class="gcbtn" data-g="draw">Tracer</button>
          <span class="graph-hint">Intersection calculée automatiquement</span>`;
      }
      return `<div class="block graph" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
        <div class="graph-card"><div class="gwrap">${AlixoGraphs.renderSVG(b.gtype, p)}</div>
        ${controls ? `<div class="graph-controls">${controls}</div>` : ''}</div></div>`;
    }
    case 'img': {
      const src = AlixoImages.cache.get(b.iid);
      const al = ['left', 'right', 'center'].includes(b.align) ? b.align : 'center';
      const handles = ['nw', 'ne', 'sw', 'se', 'e', 'w'].map(k => `<span class="rz ${k}" data-rz="${k}"></span>`).join('');
      return `<figure class="block img al-${al}" data-id="${b.id}" contenteditable="false" style="${imgStyle(b)}">${MV_HANDLE}<div class="imgbox ${src ? '' : 'loading'}">${src ? `<img src="${src}" alt="${esc(b.alt || '')}" draggable="false">` : ''}${handles}</div>${b.cap !== undefined && b.cap !== null ? `<figcaption contenteditable="true" data-f="cap">${b.cap || ''}</figcaption>` : ''}</figure>`;
    }
    default:
      return `<div class="block p${alClass(b)}" data-id="${b.id}"><div class="btxt" data-ph="${PH_P}">${b.text || '<br>'}</div></div>`;
  }
}

function renderEditor() {
  renderBlocks('__none');
  // onglet toujours ouvert : on revient au même endroit ; sinon en haut
  const top = currentDocId && openTabs.includes(currentDocId) ? (+tabScroll[currentDocId] || 0) : 0;
  $('#docwrap').scrollTo({ top, behavior: 'instant' });
  hist.baseline = snapshotDoc();
}

/* notes de correction (règle d'orthographe / grammaire) affichées sous un bloc, quelques secondes
   après la correction ; elles s'effacent aussi dès que l'on reprend la frappe ou la lecture */
const NOTE_TTL = 7000;
let noteFadeTm = null, noteShownAt = 0;
const CORR_TTL = 6000;       // durée du surlignage d'un mot corrigé (voir applyCorrMarks)
let corrMarks = [];          // { id, at, text, ts, range }
let corrTm = null;
function freshNotes(b) { const now = Date.now(); return Array.isArray(b.notes) ? b.notes.filter(n => n.ts && now - n.ts < NOTE_TTL) : []; }
function notesHTML(b) {
  const notes = freshNotes(b);
  if (!notes.length) return '';
  return `<div class="corr-notes" contenteditable="false">${notes.map(n =>
    `<div class="corr-note"><span class="cn-ico">✓</span><span class="cn-txt"><b>${esc(n.to)}</b> — ${esc(n.rule)}</span><button class="cn-x" data-note="${b.notes.indexOf(n)}" title="Retirer cette note">✕</button></div>`).join('')}</div>`;
}
/* programme la disparition des notes affichées */
function scheduleNoteFade() {
  clearTimeout(noteFadeTm);
  const shown = $$('#blocks .corr-notes');
  if (!shown.length) return;
  noteShownAt = Date.now();
  noteFadeTm = setTimeout(fadeNotes, NOTE_TTL);
}
/* reason : 'timer' | 'typing' | 'reading' — la frappe / la lecture n'effacent pas une note toute fraîche */
function fadeNotes(reason = 'timer') {
  const shown = $$('#blocks .corr-notes');
  if (!shown.length) return;
  if (reason !== 'timer' && Date.now() - noteShownAt < 900) return;
  clearTimeout(noteFadeTm);
  const d = doc();
  if (d) d.blocks.forEach(b => { if (b.notes) delete b.notes; });
  shown.forEach(el => { el.classList.add('fade'); setTimeout(() => el.remove(), 500); });
}

/* rendu complet ; focusId : bloc à placer sous le curseur ('__none' : ne pas toucher au curseur),
   sinon le curseur est remis là où il était */
function renderBlocks(focusId, caretPos, caretKey) {
  const d = doc(); if (!d) return;
  if (!d.blocks.length) d.blocks.push({ id: uid(), type: 'p', text: '' });
  const restore = focusId === undefined ? caretSnapshot() : null;
  const numMap = computeNumbers(d.blocks);
  blocksEl.innerHTML = d.blocks.map(b => {
    const html = blockHTML(b, numMap);
    const extra = notesHTML(b) + linkPrintHTML(b) + sugHTML(b);
    return extra ? html.replace(/<\/(div|figure)>\s*$/, extra + '</$1>') : html;
  }).join('');
  if (window.AlixoNest) AlixoNest.fixTails(blocksEl);
  renderPlan();
  applyDayFilter();
  applyTsel();
  applyObjSel();
  patchImages();
  scheduleNoteFade();
  applyCorrMarks();
  if (pagesActive()) paginate(true);   // 1.23 : vue par pages — sauts recalculés AVANT de replacer le curseur (sinon le défilement se cale sur une feuille sans pages)
  if (focusId && focusId !== '__none') focusBlock(focusId, caretPos, caretKey);
  else if (restore && restore.id) focusBlock(restore.id, restore.off, restore.key);
  markCurrent();
  if (window.AlixoDraw) AlixoDraw.afterRender();
  if (readOnly) blocksEl.querySelectorAll('[contenteditable="true"], input, select, textarea').forEach(el => { if (el.getAttribute('contenteditable') === 'true') el.setAttribute('contenteditable', 'false'); else el.disabled = true; });
  renderPeers();
}
/* bandeau « séance partagée » au-dessus du cours */
function renderReadOnlyBanner(info) {
  let b = $('#ro-banner');
  if (!info) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'ro-banner'; $('#docwrap').insertBefore(b, $('#doc')); }
  b.innerHTML = `Partagé par <b>${esc(info.owner || 'un membre')}</b> · ${info.role === 'write' ? 'vous pouvez modifier cette séance' : 'lecture seule'}<button type="button" id="ro-info">Détails</button>`;
  b.querySelector('#ro-info').addEventListener('click', () => AlixoShare.openInfo(currentDocId));
}
/* met à jour les numéros (titres, listes) sans tout redessiner */
function setBlockNumbers() {
  const d = doc(); if (!d) return;
  const numMap = computeNumbers(d.blocks);
  for (const el of blocksEl.children) {
    if (!el.classList.contains('h') && !el.classList.contains('ol')) continue;
    const n = numMap[el.dataset.id] || '';
    if (el.dataset.num !== n) el.dataset.num = n;
  }
}

/* ---------------- champs et curseur ---------------- */
const FIELD_SEL = '.btxt, .jref, .jval, .tcell, figcaption, .qcite, .cd-t, .cd-x, .tr-t';
function fieldOfNode(n) {
  const el = n && (n.nodeType === 3 ? n.parentElement : n);
  const f = el && el.closest ? el.closest(FIELD_SEL) : null;
  return f && blocksEl.contains(f) ? f : null;
}
/* champ (paragraphe, case, champ de fiche, formule…) qui porte le curseur */
function activeField() {
  const a = document.activeElement;
  if (a && a.classList && a.classList.contains('fsrc') && blocksEl.contains(a)) return a;
  const sel = getSelection();
  if (sel.rangeCount) { const f = fieldOfNode(sel.anchorNode); if (f) return f; }
  return a && a.closest && blocksEl.contains(a) ? a.closest(FIELD_SEL) : null;
}
function blockOfNode(n) {
  const el = n && (n.nodeType === 3 ? n.parentElement : n);
  const bl = el && el.closest ? el.closest('#blocks > .block') : null;
  return bl;
}
/* bloc qui porte le curseur (ou le point d'ancrage de la sélection) */
function blockAtSelection() {
  const sel = getSelection();
  if (sel.rangeCount) {
    const r = sel.getRangeAt(0);
    let bl = blockOfNode(sel.focusNode) || blockOfNode(r.startContainer);
    if (bl) return bl;
    if (r.startContainer === blocksEl) { const k = blocksEl.childNodes[r.startOffset] || blocksEl.childNodes[r.startOffset - 1]; if (k && k.classList && k.classList.contains('block')) return k; }
  }
  const a = document.activeElement;
  return a && a.closest && blocksEl.contains(a) ? a.closest('#blocks > .block') : null;
}
/* blocs touchés par la sélection (dans l'ordre du cours) */
function selectionBlockEls() {
  const sel = getSelection();
  if (!sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  const a = blockOfNode(r.startContainer), z = blockOfNode(r.endContainer);
  const all = [...blocksEl.children];
  if (r.collapsed) { const bl = blockAtSelection(); return bl ? [bl] : []; }
  return all.filter(el => (el === a || el === z) || (r.intersectsNode(el) && r.comparePoint(el, 0) >= 0 && r.comparePoint(el, el.childNodes.length) <= 0) || r.intersectsNode(el));
}
function selectionBlocks() { return selectionBlockEls().map(el => getBlock(el.dataset.id)).filter(Boolean); }

/* pos : 'start' | 'end' | nombre (position du curseur en caractères) ; key : champ précis (fiche, case) */
function focusBlock(id, pos = 'end', key) {
  const el = $(`#blocks > .block[data-id="${id}"]`);
  if (!el) return;
  let target = null;
  if (key) target = findField(el, key);
  if (!target) target = el.querySelector('.btxt, .fsrc, .jref, .tcell, figcaption, .mcalc-in input, .score-items input, .score-items select');
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT') && !target.classList.contains('fsrc')) { selectObj(id); return; }
  if (!target) { selectObj(id); return; }
  focusField(target, pos);
}
function fieldKey(f) {
  if (!f) return '';
  if (f.classList.contains('tcell')) return 'c:' + f.dataset.r + ':' + f.dataset.c;
  if (f.dataset.f) return 'f:' + f.dataset.f;
  return '';
}
function findField(el, key) {
  if (!key) return null;
  if (key.startsWith('c:')) { const [, r, c] = key.split(':'); return el.querySelector(`.tcell[data-r="${r}"][data-c="${c}"]`); }
  if (key.startsWith('f:')) return el.querySelector(`[data-f="${key.slice(2)}"]`);
  return null;
}
function focusField(target, pos = 'end') {
  if (!target) return;
  if (target.tagName === 'INPUT') {
    target.focus({ preventScroll: true });
    const n = pos === 'start' ? 0 : (typeof pos === 'number' ? Math.min(pos, target.value.length) : target.value.length);
    target.setSelectionRange(n, n);
    ensureFieldVisible(target);
    return;
  }
  // le champ est dans la zone d'écriture (ou est lui-même une zone : case de tableau, légende)
  const host = target.isContentEditable ? target.closest('[contenteditable="true"]') : blocksEl;
  if (host && document.activeElement !== host) host.focus({ preventScroll: true });
  if (typeof pos === 'number') setCaretOffset(target, pos);
  else {
    const r = document.createRange();
    r.selectNodeContents(target);
    r.collapse(pos === 'start');
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  ensureFieldVisible(target);
  markCurrent();
}
/* place le curseur au n-ième caractère du champ (sans entrer dans les atomes non éditables) */
function setCaretOffset(field, n) {
  const r = document.createRange();
  let done = false;
  const walk = node => {
    for (const c of node.childNodes) {
      if (done) return;
      if (c.nodeType === 3) {
        if (n <= c.length) {
          const atom = c.parentElement && c.parentElement.closest(ATOM_SEL);
          if (atom && field.contains(atom) && atom !== field) { if (n === 0) r.setStartBefore(atom); else r.setStartAfter(atom); }
          else r.setStart(c, n);
          done = true; return;
        }
        n -= c.length;
      } else if (c.nodeType === 1 && c.contentEditable !== 'false') walk(c);
    }
  };
  walk(field);
  if (!done) { r.selectNodeContents(field); r.collapse(false); } else r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
/* décalage (en caractères) d'un point dans un champ, et l'inverse */
function offsetInField(field, node, off) {
  const r = document.createRange(); r.selectNodeContents(field);
  try { r.setEnd(node, off); } catch { return 0; }
  return r.toString().length;
}
function pointAtOffset(field, n) {
  const w = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  let node, last = null;
  while ((node = w.nextNode())) { if (n <= node.length) return { node, off: n }; n -= node.length; last = node; }
  return last ? { node: last, off: last.length } : { node: field, off: field.childNodes.length };
}
/* position du curseur à conserver malgré un nouveau rendu : { id, off, key } ou null */
function caretSnapshot(fallbackId) {
  const sel = getSelection();
  if (!sel.rangeCount) return fallbackId ? { id: fallbackId, off: 'end' } : null;
  const f = activeField();
  if (f && f.classList.contains('fsrc')) { const bl = f.closest('.block'); return { id: bl.dataset.id, off: f.selectionStart || 0 }; }
  const bl = blockAtSelection();
  if (!bl) return fallbackId ? { id: fallbackId, off: 'end' } : null;
  let off = 'end';
  if (f && f.contains(sel.focusNode)) off = offsetInField(f, sel.focusNode, sel.focusOffset);
  return { id: bl.dataset.id, off, key: fieldKey(f) };
}
/* classe .cur sur le bloc du curseur (aide-mémoire des paragraphes vides) */
function markCurrent() {
  const bl = blockAtSelection();
  const prev = blocksEl.querySelector('.block.cur');
  if (prev && prev !== bl) prev.classList.remove('cur');
  if (bl && !bl.classList.contains('cur')) bl.classList.add('cur');
  if (window.AlixoShare && AlixoShare.enabled && currentDocId) AlixoShare.setPresence(currentDocId, bl ? bl.dataset.id : null);
}

/* ---------------- lecture de l'écran → modèle ---------------- */
function blockElType(el) {
  const c = el.classList;
  for (const t of ['h', 'li', 'quote', 'callout', 'fiche', 'juris', 'formula', 'table', 'graph', 'img', 'draw', 'chart', 'score', 'mcalc', 'timer', 'hr', 'pb', 'cards', 'tree']) if (c.contains(t)) return t;
  return 'p';
}
const levelOfEl = el => { const m = el.className.match(/\bl([1-6])\b/); return m ? +m[1] : 1; };
function cleanHTML(h) {
  let t = (h || '').replace(/\u200B/g, '').replace(/(<br\s*\/?>)+\s*$/i, '');
  for (let k = 0; k < 4 && /<(span|font|b|i|u|s|sup|sub)[^>]*><\/\1>/.test(t); k++) t = t.replace(/<(span|font|b|i|u|s|sup|sub)[^>]*><\/\1>/g, '');
  return stripCorr(t);
}
const EXTRA_SEL = '.corr-notes, .lnk-print, .ai-sug, .mv-handle';
/* remet l'écran dans une forme lisible après une opération native du navigateur :
   texte hors bloc → paragraphe ; blocs imbriqués → remontés ; bloc de texte vidé → retiré ; ids en double → renouvelés */
function normalizeDom() {
  const root = blocksEl;
  let changed = false;
  if (window.AlixoNest) AlixoNest.normalize(root);   // blocs imbriqués : grille complète, ligne libre après
  let run = [];
  const flushRun = before => {
    if (!run.length) return;
    const p = document.createElement('div'); p.className = 'block p'; p.dataset.id = uid();
    const t = document.createElement('div'); t.className = 'btxt'; t.dataset.ph = PH_P; p.appendChild(t);
    root.insertBefore(p, before);
    run.forEach(n => t.appendChild(n));
    if (!t.childNodes.length) t.appendChild(document.createElement('br'));
    run = []; changed = true;
  };
  for (const n of [...root.childNodes]) {
    const isBlock = n.nodeType === 1 && n.classList.contains('block');
    if (isBlock) { flushRun(n); continue; }
    if (n.nodeType === 3 && !n.textContent.trim()) { n.remove(); continue; }
    if (n.nodeType === 1 && n.tagName === 'BR' && !run.length) { n.remove(); continue; }
    if (n.nodeType === 8) { n.remove(); continue; }
    run.push(n);
  }
  flushRun(null);
  const seen = new Set();
  for (const el of [...root.children]) {
    if (!el.isConnected) continue;
    const nested = [...el.querySelectorAll('.block')];
    if (nested.length) { nested.reverse().forEach(nb => root.insertBefore(nb, el.nextSibling)); changed = true; }
    const type = blockElType(el);
    if (TEXT_TYPES.includes(type)) {
      let f = el.querySelector(':scope > .btxt');
      const stray = [...el.childNodes].filter(n => n !== f && !(n.nodeType === 1 && (n.contentEditable === 'false' || n.matches(EXTRA_SEL) || n.classList.contains('qcite'))));
      const hasContent = n => (n.textContent || '').replace(/\u200B/g, '').trim() || (n.nodeType === 1 && n.querySelector('img, ' + ATOM_SEL));
      if (!f) {
        if (stray.some(hasContent)) { f = document.createElement('div'); f.className = 'btxt'; stray.forEach(n => f.appendChild(n)); el.appendChild(f); changed = true; }
        else { el.remove(); changed = true; continue; }
      } else if (stray.length) { stray.forEach(n => { if (hasContent(n)) f.appendChild(n); else n.remove(); }); changed = true; }
      // un <div> créé par le navigateur à l'intérieur du texte → simple saut de ligne
      f.querySelectorAll(':scope > div:not(.corr-notes):not(.lnk-print):not(.ai-sug):not(.nb)').forEach(dv => { const br = document.createElement('br'); dv.replaceWith(br, ...dv.childNodes); changed = true; });
    } else if (type === 'juris' || type === 'fiche') {
      const def = ficheDef(type === 'fiche' ? { type, fk: el.dataset.fk } : { type });
      if (!el.querySelector('.jref')) { const h = el.querySelector('.juris-head'); if (h) h.insertAdjacentHTML('beforeend', '<div class="jref" data-f="ref"></div>'); }
      const grid = el.querySelector('.juris-grid');
      if (grid) for (const [k, lab] of def.fields) if (!grid.querySelector(`.jval[data-f="${k}"]`)) grid.insertAdjacentHTML('beforeend', `<div class="jlabel" contenteditable="false">${lab}</div><div class="jval" data-f="${k}"></div>`);
      if (!el.querySelector('.juris-head') && !el.querySelector('.juris-grid')) { el.remove(); changed = true; continue; }
    }
    if (type === 'quote' && !el.querySelector(':scope > .qcite')) el.insertAdjacentHTML('beforeend', '<div class="qcite" data-f="cite" data-ph="— Auteur, œuvre, année"><br></div>');
    const id = el.dataset.id;
    if (!id || seen.has(id)) { el.dataset.id = uid(); changed = true; }
    seen.add(el.dataset.id);
  }
  if (!root.children.length) { root.innerHTML = blockHTML({ id: uid(), type: 'p', text: '' }, {}); changed = true; }
  return changed;
}
/* reconstruit d.blocks d'après l'écran (les propriétés des blocs connus sont conservées) */
function syncAllFromDom() {
  const d = doc(); if (!d) return false;
  normalizeDom();
  const old = new Map(d.blocks.map(b => [b.id, b]));
  const out = [];
  for (const el of blocksEl.children) {
    const id = el.dataset.id;
    const type = blockElType(el);
    let b = old.get(id);
    if (!b || (b.type !== type && TEXT_TYPES.includes(type))) {
      b = Object.assign({ id, type, text: '' }, b && b.day ? { day: b.day } : {});
      if (type === 'h') b.level = levelOfEl(el);
      if (type === 'li') { b.lt = el.classList.contains('ol') ? 'ol' : el.classList.contains('cl') ? 'cl' : 'ul'; const m = el.className.match(/\bind([1-3])\b/); if (m) b.ind = +m[1]; if (el.classList.contains('done')) b.done = true; }
      if (type === 'callout') b.ct = el.dataset.ct || 'retenir';
      if (type === 'fiche') b.fk = el.dataset.fk || 'patho';
    }
    if (TEXT_TYPES.includes(b.type)) {
      const f = el.querySelector(':scope > .btxt'); b.text = f ? cleanHTML(f.innerHTML) : '';
      if (b.type === 'quote') { const q = el.querySelector(':scope > .qcite'); const c = q ? cleanHTML(q.innerHTML) : ''; if (c) b.cite = c; else delete b.cite; }
    }
    else if (isFiche(b)) { b.fields = b.fields || {}; el.querySelectorAll('.jref, .jval').forEach(f => { b.fields[f.dataset.f] = cleanHTML(f.innerHTML); }); }
    else if (b.type === 'table') { el.querySelectorAll('.tcell').forEach(c => { const r = +c.dataset.r, k = +c.dataset.c; if (b.rows && b.rows[r] && k < b.rows[r].length) b.rows[r][k] = c.innerHTML.replace(/\u200B/g, ''); }); }
    else if (b.type === 'img') { const fc = el.querySelector('figcaption'); if (fc) b.cap = cleanHTML(fc.innerHTML); }
    else if (b.type === 'tree') treeSyncFromDom(b, el);
    else if (b.type === 'cards') { const items = [...el.querySelectorAll('.card-item')]; if (items.length) b.cards = items.map(c => { const t = c.querySelector('.cd-t'), x = c.querySelector('.cd-x'); return { t: t ? cleanHTML(t.innerHTML) : '', x: x ? cleanHTML(x.innerHTML) : '' }; }); }
    out.push(b);
  }
  d.blocks = out;
  if (!d.blocks.length) d.blocks.push({ id: uid(), type: 'p', text: '' });
  return true;
}

/* ---------------- opérations sur les blocs ---------------- */
function getBlock(id) { const d = doc(); return d ? d.blocks.find(b => b.id === id) : undefined; }
function blockIndex(id) { const d = doc(); return d ? d.blocks.findIndex(b => b.id === id) : -1; }
/* change la nature d'un bloc en repartant d'un état propre */
function resetBlock(b, patch) {
  for (const k of BLOCK_PROPS) delete b[k];
  Object.assign(b, patch);
  return b;
}
function insertAfter(id, block) {
  const i = blockIndex(id);
  doc().blocks.splice(i + 1, 0, block);
  touch(); renderBlocks(block.id, 'start');
  return block;
}
function removeBlock(id, focusPrev = true) {
  const d = doc();
  const i = blockIndex(id);
  d.blocks.splice(i, 1);
  touch();
  const nb = d.blocks[Math.max(0, i - 1)];
  renderBlocks(focusPrev && nb ? nb.id : undefined);
}
/* à appeler après toute modification du cours ; { typing: true, blockId } regroupe les frappes dans l'historique */
function touch(opts) {
  const d = doc(); if (!d) return;
  if (readOnly) return;   // séance partagée en lecture seule : rien n'est enregistré
  d.updatedAt = Date.now(); save();
  recordHistory(opts);
}

/* ---------------- historique du cours (Ctrl+Z / Ctrl+Y) ---------------- */
const HIST_MAX = 150;
let hist = { undo: [], redo: [], baseline: null, typingTs: 0, typingBlock: null };
function snapshotDoc() {
  const d = doc();
  return d ? { titre: d.titre, blocks: JSON.parse(JSON.stringify(d.blocks)), focus: lastBlockId } : null;
}
function historyReset() { hist = { undo: [], redo: [], baseline: null, typingTs: 0, typingBlock: null }; }
function recordHistory({ typing = false, blockId = null } = {}) {
  if (!hist.baseline) { hist.baseline = snapshotDoc(); return; }
  const now = Date.now();
  const coalesce = typing && hist.typingBlock === blockId && now - hist.typingTs < 1200;
  if (!coalesce) {
    hist.undo.push(hist.baseline);
    if (hist.undo.length > HIST_MAX) hist.undo.shift();
    hist.redo.length = 0;
  }
  hist.typingTs = typing ? now : 0;
  hist.typingBlock = typing ? blockId : null;
  stampDays();
  hist.baseline = snapshotDoc();
}

/* ---------------- journal : quel jour chaque bloc a été écrit / modifié ---------------- */
const dayKey = ts => { const n = new Date(ts); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
const todayKey = () => dayKey(Date.now());
const blockSig = b => JSON.stringify(b, (k, v) => (k === 'day' || k === 'mod' || k === 'notes') ? undefined : v);
let dayFilter = null;      // 'AAAA-MM-JJ' ou null = tout le cours
let planTab = 'plan';
/* à chaque modification : date de création des nouveaux blocs, date de modification des blocs changés */
function stampDays() {
  const d = doc(); if (!d) return;
  const today = todayKey();
  const base = hist.baseline ? new Map(hist.baseline.blocks.map(b => [b.id, b])) : null;
  for (const b of d.blocks) {
    if (!b.day) b.day = today;
    if (base) { const o = base.get(b.id); if (o && blockSig(o) !== blockSig(b)) b.mod = today; }
  }
}
function fmtDay(k) {
  const [y, m, dd] = k.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function blockOnDay(b, k) { return b.day === k || b.mod === k; }
function renderDayList() {
  const d = doc(); const nav = $('#day-list'); if (!d || !nav) return;
  const counts = new Map();
  for (const b of d.blocks) for (const k of new Set([b.day, b.mod].filter(Boolean))) counts.set(k, (counts.get(k) || 0) + 1);
  const days = [...counts.keys()].sort().reverse();
  nav.innerHTML = `<button class="dl-item ${!dayFilter ? 'current' : ''}" data-day="">Tout le cours<span class="dl-n">${d.blocks.length}</span></button>` +
    days.map(k => `<button class="dl-item ${dayFilter === k ? 'current' : ''}" data-day="${k}" title="Afficher uniquement ce qui a été écrit ou modifié ce jour-là">${esc(fmtDay(k))}<span class="dl-n">${counts.get(k)}</span></button>`).join('');
}
function applyDayFilter() {
  $$('#blocks > .block').forEach(el => {
    const b = getBlock(el.dataset.id);
    const byDay = !!dayFilter && !(b && blockOnDay(b, dayFilter));
    const byRank = rankFilter && !(b && blockHasRang(b, 'A'));
    el.classList.toggle('day-hidden', byDay || byRank);
  });
  const banner = $('#day-banner');
  if (dayFilter) {
    const n = $$('#blocks > .block:not(.day-hidden)').length;
    banner.hidden = false;
    banner.innerHTML = `Journal — ${n ? `${n} passage${n > 1 ? 's' : ''} écrit${n > 1 ? 's' : ''} ou modifié${n > 1 ? 's' : ''} le` : 'rien n’a été écrit le'} <b>${esc(fmtDay(dayFilter))}</b><button id="day-all" type="button">Tout afficher</button>`;
  } else banner.hidden = true;
}
$('#day-banner').addEventListener('click', e => {
  if (!e.target.closest('#day-all')) return;
  dayFilter = null; applyDayFilter(); renderDayList();
});
$('#day-list').addEventListener('click', e => {
  const it = e.target.closest('[data-day]'); if (!it) return;
  dayFilter = it.dataset.day || null;
  applyDayFilter(); renderDayList();
  $('#docwrap').scrollTo({ top: 0, behavior: 'instant' });
});
$('.pp-tabs').addEventListener('click', e => {
  const t = e.target.closest('.pp-tab'); if (!t) return;
  planTab = t.dataset.pt;
  $$('.pp-tab').forEach(x => x.classList.toggle('active', x === t));
  $('#plan-tree').hidden = planTab !== 'plan';
  $('#plan-progress').hidden = planTab !== 'plan';
  $('#day-list').hidden = planTab !== 'jours';
  if (planTab === 'jours') renderDayList();
});
function restoreSnapshot(s) {
  const d = doc(); if (!d || !s) return;
  const titleChanged = (d.titre || '') !== (s.titre || '');
  d.titre = s.titre;
  d.blocks = JSON.parse(JSON.stringify(s.blocks));
  if (!d.blocks.length) d.blocks.push({ id: uid(), type: 'p', text: '' });
  d.updatedAt = Date.now(); save();
  editingFormula = {}; clearBlockSel(); hideCalcGhost(); closeSlash(false);
  if (titleChanged) renderCrumbs();
  const fid = s.focus && d.blocks.some(b => b.id === s.focus) ? s.focus : null;
  renderBlocks(fid || '__none');
  hist.typingTs = 0; hist.typingBlock = null;
}
function undoEdit() {
  if (!doc() || !hist.undo.length) { if (doc()) toast('Rien à annuler'); return false; }
  hist.redo.push(snapshotDoc());
  restoreSnapshot(hist.undo.pop());
  hist.baseline = snapshotDoc();
  return true;
}
function redoEdit() {
  if (!doc() || !hist.redo.length) return false;
  hist.undo.push(snapshotDoc());
  restoreSnapshot(hist.redo.pop());
  hist.baseline = snapshotDoc();
  return true;
}

function currentBlockId() {
  const bl = blockAtSelection();
  if (bl && getBlock(bl.dataset.id)) return bl.dataset.id;
  if (lastBlockId && getBlock(lastBlockId)) return lastBlockId;
  const d = doc();
  if (!d.blocks.length) d.blocks.push({ id: uid(), type: 'p', text: '' });
  return d.blocks[d.blocks.length - 1].id;
}

/* insère un objet (formule, graphique, tableau, image…) : à la place du paragraphe vide courant, sinon juste après le bloc courant */
function insertSpecial(block) {
  const cur = getBlock(currentBlockId());
  if (isEmptyPara(cur)) {
    resetBlock(cur, Object.assign({}, block, { id: cur.id }));
    touch(); renderBlocks(cur.id, 'start');
    return cur;
  }
  return insertAfter(currentBlockId(), Object.assign({ id: uid() }, block));
}

/* ============================================================
   Éditeur — événements de saisie (zone continue)
   ============================================================ */
const blocksEl = $('#blocks');
let fmtInProgress = false;   // mise en forme en cours : l'événement input est ignoré (une seule entrée d'historique)
let lastAnchorBlock = null;
let selFromNative = false;   // compatibilité : plus de sélection de blocs « à la main »
let justDraggedSel = false, justDraggedCurve = false;

/* le curseur change de bloc : mémorisation, aide-mémoire, analyse IA du bloc quitté, barre d'outils */
document.addEventListener('selectionchange', () => {
  if (!document.body.classList.contains('mode-editor')) return;
  const bl = blockAtSelection();
  if (bl) {
    if (lastBlockId && lastBlockId !== bl.dataset.id) { const prev = getBlock(lastBlockId); if (prev) aiAutoConsider(prev); }
    lastBlockId = bl.dataset.id; lastAnchorBlock = lastBlockId;
    const sel = getSelection();
    if (objSel && objSel !== bl.dataset.id && sel.rangeCount && sel.isCollapsed) clearObjSel();
  }
  markCurrent();
  updateToolbarState();
});

blocksEl.addEventListener('focusin', e => {
  if (e.target.classList && e.target.classList.contains('fsrc')) lastFormulaInput = e.target;
  if (e.target.classList && e.target.classList.contains('tcell')) lastCell = { r: +e.target.dataset.r, c: +e.target.dataset.c };
});

blocksEl.addEventListener('input', e => {
  if (fmtInProgress) return;
  const t = e.target;
  if (t.classList && t.classList.contains('fsrc')) return;                       // formule : validée à l'Entrée
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;   // champs des graphiques, scores, calculateurs, texte d'un dessin
  if (t.classList && t.classList.contains('tcell')) {
    const bl = t.closest('.block'); const b = getBlock(bl.dataset.id); if (!b) return;
    const r = +t.dataset.r, c = +t.dataset.c;
    if (!cellListBusy) detectCellList(t);   // « - », « * », « 1. » en début de ligne → liste dans la case
    if (b.rows && b.rows[r]) { b.rows[r][c] = t.innerHTML.replace(/\u200B/g, ''); touch({ typing: true, blockId: b.id + ':' + r + ':' + c }); }
    return;
  }
  if (t.tagName === 'FIGCAPTION') {
    const bl = t.closest('.block'); const b = getBlock(bl.dataset.id); if (!b) return;
    b.cap = cleanHTML(t.innerHTML); touch({ typing: true, blockId: b.id + ':cap' });
    return;
  }
  // texte du cours : on relit l'écran
  const d = doc(); if (!d) return;
  fadeNotes('typing');
  refreshCorrMarks();
  const before = d.blocks.map(b => b.id).join(',');
  syncAllFromDom();
  const after = d.blocks.map(b => b.id).join(',');
  const bl = blockAtSelection(); const b = bl && getBlock(bl.dataset.id);
  touch({ typing: true, blockId: b ? b.id : null });
  if (before !== after) { setBlockNumbers(); planRefreshSoon(); markCurrent(); }
  if (!b) return;
  const f = activeField();
  const inText = !!(f && f.classList.contains('btxt'));
  if (b.type === 'p' && inText && detectAutoPattern(b, f)) return;
  if (MULTILINE_TYPES.includes(b.type) && inText && !bulletBusy && detectInlineBullet(f)) { b.text = cleanHTML(f.innerHTML); return; }
  if (b.type === 'h') planRefreshSoon();
  if (inText) calcOnInput(b, f);
  if (inText && !calcGhost) refOnInput(b, f);                        // « art. 1240 c. civ. » tapé au clavier → proposition de lien
  if (aiSug && aiSug.id === b.id) { aiSug = null; renderSug(); }   // le texte change : la suggestion ne vaut plus
  if (inText || (f && (f.classList.contains('cd-t') || f.classList.contains('cd-x')))) aiAutoTyping(b);   // pause de frappe → analyse automatique (texte et cartes)
});

/* ---------------- puces dans les encadrés / citations : « - » ou « * » en début de ligne → « • » ---------------- */
let bulletBusy = false;
const BULLET = '• ';
/* texte de la ligne courante avant le curseur (null si pas de curseur dans le champ) */
function lineBeforeCaret(field) {
  const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!field.contains(r.startContainer)) return null;
  const pre = document.createRange(); pre.setStart(field, 0); pre.setEnd(r.startContainer, r.startOffset);
  const before = fragText(pre.cloneContents());
  return before.slice(before.lastIndexOf('\n') + 1);
}
function detectInlineBullet(field) {
  const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  if (r.startContainer.nodeType !== 3) return false;
  const line = lineBeforeCaret(field);
  if (line === null || !/^[-*]\s$/.test(line) || r.startOffset < 2) return false;
  bulletBusy = true;
  try {
    const del = document.createRange(); del.setStart(r.startContainer, r.startOffset - 2); del.setEnd(r.startContainer, r.startOffset);
    sel.removeAllRanges(); sel.addRange(del);
    document.execCommand('insertText', false, BULLET);
  } catch { /* structure inattendue */ }
  bulletBusy = false;
  return true;
}
/* Entrée dans un encadré : une ligne à puce continue la liste, une puce vide la termine ; renvoie true si géré */
function enterInBulletLine(field) {
  const line = lineBeforeCaret(field);
  if (line === null || !/^•[  ]/.test(line)) return false;
  const sel = getSelection(); const r = sel.getRangeAt(0);
  if (!/^•[  ]\s*$/.test(line)) { document.execCommand('insertLineBreak'); document.execCommand('insertText', false, BULLET); return true; }
  // puce vide : on la retire et on passe simplement à la ligne
  if (r.startContainer.nodeType === 3 && r.startOffset >= line.length) {
    const del = document.createRange(); del.setStart(r.startContainer, r.startOffset - line.length); del.setEnd(r.startContainer, r.startOffset);
    sel.removeAllRanges(); sel.addRange(del);
    document.execCommand('delete');
  }
  document.execCommand('insertLineBreak');
  return true;
}

/* ---------------- tableaux ---------------- */
let lastCell = { r: 0, c: 0 };
/* couleurs de fond (b.bg) et alignements (b.ta) des cases : grilles de même forme que b.rows */
function tableGrid(b, key) {
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const nc = rows.length ? Math.max(1, ...rows.map(r => r.length)) : 0;
  if (!Array.isArray(b[key])) b[key] = [];
  const g = b[key];
  g.length = rows.length;
  for (let r = 0; r < rows.length; r++) {
    if (!Array.isArray(g[r])) g[r] = [];
    g[r].length = nc;
    for (let c = 0; c < nc; c++) if (!g[r][c]) g[r][c] = null;
  }
  return g;
}
const tableBg = b => tableGrid(b, 'bg');
const tableTa = b => tableGrid(b, 'ta');
function pruneGrid(b, key) { if (Array.isArray(b[key]) && !b[key].some(r => Array.isArray(r) && r.some(Boolean))) delete b[key]; }
function pruneBg(b) { pruneGrid(b, 'bg'); pruneGrid(b, 'ta'); }
function cellBg(b, r, c) { return Array.isArray(b.bg) && Array.isArray(b.bg[r]) ? (b.bg[r][c] || '') : ''; }
function cellTa(b, r, c) { return Array.isArray(b.ta) && Array.isArray(b.ta[r]) ? (b.ta[r][c] || '') : ''; }
/* 1.21 — fusion de cases : b.spans = [{ r, c, rs, cs }] (ancre en haut à gauche, nombre de lignes / colonnes
   couvertes). Les cases couvertes restent dans b.rows (vides) mais ne sont pas affichées : une ligne peut ainsi
   n'avoir qu'une case au-dessus d'une ligne de trois. */
function tableSpans(b) { return Array.isArray(b.spans) ? b.spans.filter(x => x && x.r >= 0 && x.c >= 0 && (x.rs > 1 || x.cs > 1)) : []; }
function tableCovered(b) {   // case couverte « r:c » → fusion qui la couvre
  const m = new Map();
  for (const x of tableSpans(b)) for (let r = x.r; r < x.r + x.rs; r++) for (let c = x.c; c < x.c + x.cs; c++) if (r !== x.r || c !== x.c) m.set(r + ':' + c, x);
  return m;
}
const spanAt = (b, r, c) => tableSpans(b).find(x => x.r === r && x.c === c) || null;
function tableAnchor(b, r, c) { const x = tableCovered(b).get(r + ':' + c); return x ? { r: x.r, c: x.c } : { r, c }; }
/* fusions valides, dans la grille, sans chevauchement */
function normalizeSpans(b) {
  if (!Array.isArray(b.spans)) return;
  const rows = Array.isArray(b.rows) ? b.rows : []; const nr = rows.length, nc = nr ? Math.max(1, ...rows.map(r => r.length)) : 0;
  const taken = new Set(); const out = [];
  for (const x of b.spans) {
    if (!x || !(x.r >= 0 && x.c >= 0) || x.r >= nr || x.c >= nc || !(+x.rs >= 1) || !(+x.cs >= 1)) continue;
    const rs = Math.max(1, Math.min(+x.rs, nr - x.r)), cs = Math.max(1, Math.min(+x.cs, nc - x.c));
    if (rs === 1 && cs === 1) continue;
    let ok = true; const keys = [];
    for (let r = x.r; r < x.r + rs; r++) for (let c = x.c; c < x.c + cs; c++) { const k = r + ':' + c; if (taken.has(k)) ok = false; keys.push(k); }
    if (!ok) continue;
    keys.forEach(k => taken.add(k)); out.push({ r: x.r, c: x.c, rs, cs });
  }
  if (out.length) b.spans = out; else delete b.spans;
}
/* rectangle de cases étendu aux fusions qu'il touche */
function spanRect(b, r0, c0, r1, c1) {
  const a = { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
  const spans = tableSpans(b);
  for (let k = 0; k < 20; k++) {
    let grew = false;
    for (const x of spans) {
      const xr1 = x.r + x.rs - 1, xc1 = x.c + x.cs - 1;
      if (x.r > a.r1 || xr1 < a.r0 || x.c > a.c1 || xc1 < a.c0) continue;
      if (x.r < a.r0) { a.r0 = x.r; grew = true; } if (xr1 > a.r1) { a.r1 = xr1; grew = true; }
      if (x.c < a.c0) { a.c0 = x.c; grew = true; } if (xc1 > a.c1) { a.c1 = xc1; grew = true; }
    }
    if (!grew) break;
  }
  return a;
}
function mergeCells(b, r0, c0, r1, c1) {
  const a = spanRect(b, r0, c0, r1, c1);
  if (a.r0 === a.r1 && a.c0 === a.c1) { toast('Sélectionnez au moins deux cases : glissez de l’une à l’autre, ou Maj+clic'); return false; }
  const covered = tableCovered(b);
  const parts = [];
  for (let r = a.r0; r <= a.r1; r++) for (let c = a.c0; c <= a.c1; c++) {
    if (covered.has(r + ':' + c) || !b.rows[r]) continue;
    const v = b.rows[r][c] || '';
    if (stripTags(v).replace(/\u00a0/g, ' ').trim() || /<(img|a |table)/i.test(v)) parts.push(v);
    if (r !== a.r0 || c !== a.c0) b.rows[r][c] = '';
  }
  b.rows[a.r0][a.c0] = parts.join('<br>');
  b.spans = tableSpans(b).filter(x => x.r < a.r0 || x.r > a.r1 || x.c < a.c0 || x.c > a.c1);
  b.spans.push({ r: a.r0, c: a.c0, rs: a.r1 - a.r0 + 1, cs: a.c1 - a.c0 + 1 });
  normalizeSpans(b); clearTsel(); touch(); renderBlocks('__none'); focusTableCell(b.id, a.r0, a.c0);
  toast('Cases fusionnées — « Scinder » pour revenir en arrière, Ctrl+Z pour annuler');
  return true;
}
function splitCell(b, r, c) {
  const a = tableAnchor(b, r, c); const x = spanAt(b, a.r, a.c);
  if (!x) { toast('Cette case n’est pas fusionnée'); return false; }
  b.spans = tableSpans(b).filter(y => y !== x); normalizeSpans(b);
  clearTsel(); touch(); renderBlocks('__none'); focusTableCell(b.id, a.r, a.c);
  toast('Case scindée — Ctrl+Z pour annuler');
  return true;
}
/* les fusions suivent les insertions et suppressions de lignes (axis 'r') et de colonnes ('c') */
function spansInsert(b, axis, at) {
  const n = axis === 'r' ? 'rs' : 'cs';
  for (const x of tableSpans(b)) { if (at > x[axis] && at < x[axis] + x[n]) x[n]++; else if (at <= x[axis]) x[axis]++; }
}
function spansDelete(b, axis, at) {
  const n = axis === 'r' ? 'rs' : 'cs';
  for (const x of tableSpans(b)) {
    if (at >= x[axis] && at < x[axis] + x[n]) {
      if (at === x[axis] && x[n] > 1) {   // l'ancre disparaît : son contenu passe à la case suivante, qui devient l'ancre
        const r2 = axis === 'r' ? x.r + 1 : x.r, c2 = axis === 'r' ? x.c : x.c + 1;
        if (b.rows[r2] && c2 < b.rows[r2].length) b.rows[r2][c2] = b.rows[x.r][x.c];
      }
      x[n]--;   // à 0 (seule ligne / colonne de la fusion supprimée) : la fusion disparaît (normalizeSpans)
    } else if (at < x[axis]) x[axis]--;
  }
}
function setCellsBg(b, cells, color) {
  const bg = tableBg(b);
  cells.forEach(({ r, c }) => { if (bg[r] && c < bg[r].length) bg[r][c] = color || null; });
  pruneBg(b); touch(); renderBlocks();
}
function setCellsTa(b, cells, al) {
  const ta = tableTa(b);
  cells.forEach(({ r, c }) => { if (ta[r] && c < ta[r].length) ta[r][c] = al && al !== 'left' ? al : null; });
  pruneBg(b); touch(); renderBlocks();
}
/* sélection de plusieurs cases (glisser d'une case à l'autre, Maj+clic), façon Google Docs */
let tsel = null;        // { bid, r0, c0, r1, c1 }
let tselStart = null;
function tselCells() {
  if (!tsel) return [];
  const out = [];
  for (let r = Math.min(tsel.r0, tsel.r1); r <= Math.max(tsel.r0, tsel.r1); r++)
    for (let c = Math.min(tsel.c0, tsel.c1); c <= Math.max(tsel.c0, tsel.c1); c++) out.push({ r, c });
  return out;
}
function applyTsel() {
  $$('.tbl td.tsel').forEach(td => td.classList.remove('tsel'));
  $$('.block.table.tselecting').forEach(x => x.classList.remove('tselecting'));
  if (!tsel) return;
  const bl = $(`.block[data-id="${tsel.bid}"]`); if (!bl) { tsel = null; return; }
  bl.classList.add('tselecting');
  tselCells().forEach(({ r, c }) => { const cell = bl.querySelector(`.tcell[data-r="${r}"][data-c="${c}"]`); if (cell) cell.parentElement.classList.add('tsel'); });
}
function setTsel(bid, r0, c0, r1, c1) {
  const b = getBlock(bid);
  if (b && tableSpans(b).length) { const a = spanRect(b, r0, c0, r1, c1); r0 = a.r0; c0 = a.c0; r1 = a.r1; c1 = a.c1; }   // 1.21 : une case fusionnée est prise en entier
  tsel = { bid, r0, c0, r1, c1 }; applyTsel();
}
function clearTsel() { if (!tsel) return; tsel = null; applyTsel(); }
blocksEl.addEventListener('mousedown', e => {
  tselStart = null;
  if (e.button !== 0) return;
  const cell = e.target.closest('.tcell');
  if (!cell) { clearTsel(); return; }
  const bl = cell.closest('.block');
  const r = +cell.dataset.r, c = +cell.dataset.c;
  if (e.shiftKey && tsel && tsel.bid === bl.dataset.id) { e.preventDefault(); setTsel(tsel.bid, tsel.r0, tsel.c0, r, c); return; }
  const act = document.activeElement;
  if (e.shiftKey && act && act.classList.contains('tcell') && act.closest('.block') === bl && act !== cell) { e.preventDefault(); setTsel(bl.dataset.id, +act.dataset.r, +act.dataset.c, r, c); return; }
  clearTsel();
  tselStart = { bid: bl.dataset.id, r, c };
});
document.addEventListener('mousemove', e => {
  if (!tselStart) return;
  if (!(e.buttons & 1)) { tselStart = null; return; }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el && el.closest ? el.closest('.tcell') : null;
  if (!cell) return;
  const bl = cell.closest('.block'); if (!bl || bl.dataset.id !== tselStart.bid) return;
  const r = +cell.dataset.r, c = +cell.dataset.c;
  if (!tsel && r === tselStart.r && c === tselStart.c) return;   // même case : sélection de texte native
  e.preventDefault();
  if (!tsel || tsel.r1 !== r || tsel.c1 !== c) {
    const sl = getSelection(); if (sl.rangeCount) sl.removeAllRanges();
    setTsel(tselStart.bid, tselStart.r, tselStart.c, r, c);
  }
});
document.addEventListener('mouseup', e => {
  if (!tselStart) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el && el.closest ? el.closest('.tcell') : null;
  if (cell && cell.closest('.block') && cell.closest('.block').dataset.id === tselStart.bid && (tsel || +cell.dataset.r !== tselStart.r || +cell.dataset.c !== tselStart.c)) {
    setTsel(tselStart.bid, tselStart.r, tselStart.c, +cell.dataset.r, +cell.dataset.c);
  }
  if (tsel) { justDraggedSel = true; setTimeout(() => { justDraggedSel = false; }, 0); }
  tselStart = null;
});
/* listes dans une case : « - », « * », « • », « 1. » suivis d'un espace en début de ligne */
let cellListBusy = false;
function fragText(node) {
  let out = '';
  node.childNodes.forEach(n => {
    if (n.nodeType === 3) out += n.textContent;
    else if (n.nodeName === 'BR') out += '\n';
    else if (n.nodeType === 1 || n.nodeType === 11) { if (/^(DIV|P|LI)$/.test(n.nodeName) && out && !out.endsWith('\n')) out += '\n'; out += fragText(n); }
  });
  return out;
}
function detectCellList(cell) {
  const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  if (!cell.contains(r.startContainer) || r.startContainer.nodeType !== 3) return false;
  if (r.startContainer.parentElement.closest('li')) return false;
  const pre = document.createRange(); pre.setStart(cell, 0); pre.setEnd(r.startContainer, r.startOffset);
  const before = fragText(pre.cloneContents());
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (!/^(?:[-•*]|\d{1,2}[.)])\s$/.test(line) || r.startOffset < line.length) return false;
  cellListBusy = true;
  try {
    const del = document.createRange(); del.setStart(r.startContainer, r.startOffset - line.length); del.setEnd(r.startContainer, r.startOffset);
    del.deleteContents();
    document.execCommand(/\d/.test(line) ? 'insertOrderedList' : 'insertUnorderedList');
  } catch { /* structure inattendue : on laisse le texte tel quel */ }
  cellListBusy = false;
  return true;
}
function caretInListItem() {
  const sl = getSelection(); const n = sl.anchorNode; if (!n) return false;
  const el = n.nodeType === 3 ? n.parentElement : n;
  return !!(el && el.closest && el.closest('.tcell li'));
}
/* largeurs de colonnes en % (réparties également si non définies) */
function tableWidths(b, nc) {
  let w = Array.isArray(b.widths) && b.widths.length === nc ? b.widths.slice() : Array(nc).fill(100 / nc);
  const sum = w.reduce((a, x) => a + x, 0) || 100;
  return w.map(x => Math.max(4, x * 100 / sum));
}
/* redimensionnement des colonnes à la souris (comme Google Docs : seule la bordure glissée bouge) */
let tblRz = null;
blocksEl.addEventListener('mousedown', e => {
  const rz = e.target.closest('.tbl-rz'); if (!rz) return;
  e.preventDefault(); e.stopPropagation();
  const bl = rz.closest('.block'); const b = getBlock(bl.dataset.id); if (!b) return;
  const table = bl.querySelector('table.tbl');
  const cols = [...table.querySelectorAll('col')];
  const c = +rz.dataset.c;
  const tw = table.getBoundingClientRect().width;
  const w = tableWidths(b, cols.length);
  tblRz = { b, cols, c, x0: e.clientX, w0: w.slice(), tw, rz };
  rz.classList.add('on'); document.body.classList.add('tbl-resizing');
});
document.addEventListener('mousemove', e => {
  if (!tblRz) return;
  const { cols, c, x0, w0, tw } = tblRz;
  const dPct = (e.clientX - x0) / tw * 100;
  const min = 5;
  let a = w0[c] + dPct, z = w0[c + 1] - dPct;
  if (a < min) { z -= (min - a); a = min; }
  if (z < min) { a -= (min - z); z = min; }
  const w = w0.slice(); w[c] = a; w[c + 1] = z;
  tblRz.w = w;
  cols[c].style.width = a.toFixed(2) + '%'; cols[c + 1].style.width = z.toFixed(2) + '%';
});
document.addEventListener('mouseup', () => {
  if (!tblRz) return;
  const { b, w, rz } = tblRz;
  rz.classList.remove('on'); document.body.classList.remove('tbl-resizing');
  tblRz = null;
  if (w) { b.widths = w.map(x => Math.round(x * 100) / 100); touch(); }
});
/* clic dans la marge d'une case → curseur dans la case */
blocksEl.addEventListener('click', e => {
  const td = e.target.closest('.tbl td'); if (!td || e.target.closest('.tcell, .tbl-rz')) return;
  const cell = td.querySelector('.tcell'); if (cell) placeCaretAtPoint(cell, e.clientX, e.clientY);
});
/* menu contextuel d'une case (façon Google Docs) */
blocksEl.addEventListener('contextmenu', e => {
  const cell = e.target.closest('.tcell'); if (!cell || e.target.closest('a.lnk')) return;
  const bl = cell.closest('.block'); const b = getBlock(bl.dataset.id); if (!b || b.type !== 'table') return;
  e.preventDefault();
  lastCell = { r: +cell.dataset.r, c: +cell.dataset.c };
  const inSel = tsel && tsel.bid === b.id && tselCells().some(x => x.r === lastCell.r && x.c === lastCell.c);
  if (tsel && !inSel) clearTsel();
  const nSel = inSel ? tselCells().length : 0;
  const menu = $('#ctxmenu');
  menu.innerHTML = `
    <div class="cm-title">${nSel > 1 ? `${nSel} cases sélectionnées` : `Tableau — ligne ${lastCell.r + 1}, colonne ${lastCell.c + 1}`}</div>
    <div class="cm-colors" title="Couleur de fond ${nSel > 1 ? 'des cases sélectionnées' : 'de la case'}"><button data-cm="tbg" data-bg="" class="none" title="Aucune couleur">∅</button>${CELL_COLORS.map(c => `<button data-cm="tbg" data-bg="${c}" style="background:${c}" title="Couleur de fond"></button>`).join('')}<button data-cm="tbgmore" class="more" title="Toutes les couleurs…">…</button></div>
    <div class="cm-aligns"><button data-cm="tal" data-al="left" title="Aligner à gauche">${AL_ICO.left}</button><button data-cm="tal" data-al="center" title="Centrer">${AL_ICO.center}</button><button data-cm="tal" data-al="right" title="Aligner à droite">${AL_ICO.right}</button><button data-cm="tal" data-al="justify" title="Justifier">${AL_ICO.justify}</button></div>
    <button data-cm="trow-">${CM_ICO.plus}Insérer une ligne au-dessus</button>
    <button data-cm="trow+">${CM_ICO.plus}Insérer une ligne en dessous</button>
    <button data-cm="tcol-">${CM_ICO.plus}Insérer une colonne à gauche</button>
    <button data-cm="tcol+">${CM_ICO.plus}Insérer une colonne à droite</button>
    <button data-cm="tdelrow">${CM_ICO.trash}Supprimer la ligne</button>
    <button data-cm="tdelcol">${CM_ICO.trash}Supprimer la colonne</button>
    ${nSel > 1 ? `<button data-cm="tmerge">${CM_ICO.plus}Fusionner les cases</button>` : ''}
    ${spanAt(b, lastCell.r, lastCell.c) ? `<button data-cm="tsplit">${CM_ICO.pen}Scinder la case fusionnée</button>` : ''}
    <button data-cm="thead">${CM_ICO.pen}${b.head ? 'Retirer la ligne d’en-tête' : 'Première ligne en en-tête'}</button>
    <button data-cm="tcopy">${CM_ICO.dup}Copier le tableau</button>
    <button data-cm="tdup">${CM_ICO.dup}Dupliquer le tableau</button>
    <button data-cm="tdel" class="danger">${CM_ICO.trash}Supprimer le tableau</button>`;
  menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = b.id; menu.dataset.img = '';
  placeCtxMenu(menu, e.clientX, e.clientY);
});
blocksEl.addEventListener('pointerdown', e => {
  if (e.target.closest('.tbl-tools button')) e.preventDefault();   // garde le curseur dans la case
});
function focusTableCell(id, r, c) {
  const b = getBlock(id); const a = b && b.type === 'table' ? tableAnchor(b, r, c) : { r, c };   // case couverte par une fusion : son ancre
  const el = $(`.block[data-id="${id}"] .tcell[data-r="${a.r}"][data-c="${a.c}"]`);
  if (el) focusField(el, 'end');
}
function tableOp(b, op) {
  const rows = b.rows;
  const nc = rows[0].length;
  const grids = [tableBg(b), tableTa(b)];
  const r = Math.min(lastCell.r, rows.length - 1), c = Math.min(lastCell.c, nc - 1);
  let focus = { r, c };
  const w = tableWidths(b, nc);
  if (op === 'merge') { if (tsel && tsel.bid === b.id) mergeCells(b, tsel.r0, tsel.c0, tsel.r1, tsel.c1); else toast('Sélectionnez d’abord les cases à fusionner : glissez de l’une à l’autre, ou Maj+clic'); return; }
  if (op === 'split') { splitCell(b, r, c); return; }
  if (op === 'row+') { const sp = spanAt(b, r, c); const at = r + (sp ? sp.rs : 1); spansInsert(b, 'r', at); rows.splice(at, 0, Array(nc).fill('')); grids.forEach(g => g.splice(at, 0, Array(nc).fill(null))); focus = { r: at, c }; }
  if (op === 'rowabove') { spansInsert(b, 'r', r); rows.splice(r, 0, Array(nc).fill('')); grids.forEach(g => g.splice(r, 0, Array(nc).fill(null))); focus = { r, c }; }
  if (op === 'col+' || op === 'colleft') {
    const sp = spanAt(b, r, c);
    const at = op === 'col+' ? c + (sp ? sp.cs : 1) : c;
    spansInsert(b, 'c', at);
    rows.forEach(row => row.splice(at, 0, '')); grids.forEach(g => g.forEach(row => row.splice(at, 0, null)));
    const nw = w.map(x => x * (1 - 1 / (nc + 1))); nw.splice(at, 0, 100 / (nc + 1)); b.widths = nw;
    focus = { r, c: at };
  }
  if (op === 'row-') { if (rows.length > 1) { spansDelete(b, 'r', r); rows.splice(r, 1); grids.forEach(g => g.splice(r, 1)); } focus = { r: Math.min(r, rows.length - 1), c }; }
  if (op === 'col-') {
    if (nc > 1) { spansDelete(b, 'c', c); rows.forEach(row => row.splice(c, 1)); grids.forEach(g => g.forEach(row => row.splice(c, 1))); w.splice(c, 1); const s = w.reduce((a, x) => a + x, 0); b.widths = w.map(x => x * 100 / s); }
    focus = { r, c: Math.min(c, rows[0].length - 1) };
  }
  if (op === 'head') b.head = !b.head;
  if (op === 'copy') { if (window.AlixoNest) AlixoNest.copyTable(b); return; }
  if (op === 'dup') {
    const copy = JSON.parse(JSON.stringify(b)); copy.id = uid(); delete copy.notes; delete copy.day; delete copy.mod;
    doc().blocks.splice(blockIndex(b.id) + 1, 0, copy);
    clearTsel(); touch(); renderBlocks('__none'); focusTableCell(copy.id, 0, 0);
    toast('Tableau dupliqué — Ctrl+Z pour annuler');
    return;
  }
  if (op === 'del') {
    const d = doc(); const i = blockIndex(b.id);
    d.blocks.splice(i, 1);
    if (!d.blocks.length) d.blocks.push({ id: uid(), type: 'p', text: '' });
    touch(); renderBlocks((d.blocks[i] || d.blocks[i - 1]).id, 'start');
    toast('Tableau supprimé — Ctrl+Z pour annuler');
    return;
  }
  pruneBg(b); normalizeSpans(b); clearTsel();
  touch(); renderBlocks('__none');
  focusTableCell(b.id, focus.r, focus.c);
}
blocksEl.addEventListener('click', e => {
  const t = e.target.closest('.tbl-tools [data-t]'); if (!t) return;
  const bl = t.closest('.block'); const b = getBlock(bl.dataset.id);
  if (!b || b.type !== 'table' || !Array.isArray(b.rows) || !b.rows.length) return;
  tableOp(b, t.dataset.t);
});
/* notes de correction : retirer une note */
blocksEl.addEventListener('click', e => {
  const x = e.target.closest('.cn-x'); if (!x) return;
  const bl = x.closest('.block'); const b = getBlock(bl.dataset.id); if (!b || !b.notes) return;
  b.notes.splice(+x.dataset.note, 1);
  if (!b.notes.length) delete b.notes;
  touch(); renderBlocks();
});

/* « I. », « A. », « 1. », « a. » en début de ligne → titre ; « - », « * » → puce ; « [] » → case à cocher ; « > » → citation */
const AUTO_RULES = [
  [/^\[[ x]?\]\s/, { type: 'li', lt: 'cl' }],
  [/^[-•*]\s/, { type: 'li', lt: 'ul' }],
  [/^>\s/, { type: 'quote' }],
  [/^bilan\s*[:—–-]\s/i, { type: 'callout', ct: 'bilan' }]
];
/* retire les n premiers caractères de texte d'un fragment HTML (balises conservées) */
function stripTextPrefix(html, n) {
  const t = document.createElement('div'); t.innerHTML = html;
  const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
  let node;
  while (n > 0 && (node = w.nextNode())) { const k = Math.min(n, node.length); node.deleteData(0, k); n -= k; }
  return t.innerHTML;
}
/* marqueurs de titre tapés en début de ligne : [motif, style de numéro du plan, niveau de repli (ancien plan fixe)].
   Le niveau est celui du plan qui utilise ce style ; sans un tel niveau, l'ancien niveau fixe (0 : jamais). */
const AUTO_NUM = [
  [/^([IVX]{1,6})[.)]\s/, 'I', 1], [/^([A-H])[.)]\s/, 'A', 2], [/^(\d{1,2})[.)]\s/, '1', 3], [/^([a-h])[.)]\s/, 'a', 4],
  [/^([ivx]{1,6})[.)]\s/, 'i', 0], [/^§\s?\d{1,3}\s*[.):]?\s/, '§', 0]
];
/* { m, patch, keep } si la ligne commence par un numéro de titre ou un mot déclencheur du plan (1.24) */
function autoHeadingMatch(t) {
  const lv = planLevels();
  for (const [re, st, legacy] of AUTO_NUM) {
    const m = t.match(re); if (!m) continue;
    let L = lv.findIndex(l => l.num === st) + 1;
    if (!L) { if (!legacy) continue; L = Math.min(legacy, lv.length); }
    return { m, patch: { type: 'h', level: L } };
  }
  for (const r of planPrefixRules()) if (r.re.test(t)) return { m: [''], patch: { type: 'h', level: r.level }, keep: true };   // le mot reste dans le titre
  return null;
}
/* { type, level?, text } si la ligne commence par un marqueur de plan, sinon { text } */
function patternFromLine(html, prevBlock) {
  const t = stripTags(html).replace(/^\u200B+/, '');
  // « 1. » après une liste numérotée : on continue la liste (sinon c'est un titre de niveau 1.)
  if (prevBlock && prevBlock.type === 'li' && prevBlock.lt === 'ol') {
    const m = t.match(/^\d{1,2}[.)]\s/);
    if (m) return { type: 'li', lt: 'ol', ind: prevBlock.ind || 0, text: stripTextPrefix(html, m[0].length), cut: m[0].length };
  }
  const h = autoHeadingMatch(t);
  if (h) return Object.assign({ text: h.keep ? html : stripTextPrefix(html, h.m[0].length), cut: h.keep ? 0 : h.m[0].length }, h.patch);
  for (const [re, patch] of AUTO_RULES) {
    const m = t.match(re);
    if (m) return Object.assign({ text: stripTextPrefix(html, m[0].length), cut: m[0].length }, patch);
  }
  return { text: html };
}
function detectAutoPattern(b, el) {
  const i = blockIndex(b.id);
  const p = patternFromLine(el.innerHTML, i > 0 ? doc().blocks[i - 1] : null);
  if (!p.type) return false;
  const off = caretOffsetIn(el);
  const patch = { type: p.type, text: p.text };
  if (p.level) patch.level = p.level;
  if (p.lt) patch.lt = p.lt;
  if (p.ind) patch.ind = p.ind;
  if (p.ct) patch.ct = p.ct;
  resetBlock(b, patch);
  touch();
  renderBlocks(b.id, typeof off === 'number' ? Math.max(0, off - (p.cut || 0)) : 'start');
  if (p.type === 'h') toast(`${planName(p.level)} (niveau ${planSample(p.level)}) — Tab / Maj+Tab pour changer, Retour arrière pour revenir au texte`);
  return true;
}

/* ---------------- collage : texte propre, une ligne = un paragraphe ; images ; blocs Alixo ---------------- */
const PASTE_INLINE = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's', sup: 'sup', sub: 'sub', mark: 'mark' };
const PASTE_BLOCK = new Set(['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'table', 'td', 'th', 'hr', 'dd', 'dt', 'dl', 'figure', 'figcaption']);
const PASTE_SKIP = new Set(['script', 'style', 'head', 'meta', 'title', 'link', 'img', 'svg', 'noscript', 'template', 'button', 'input', 'select', 'textarea', 'iframe', 'object']);
function htmlToLines(html) {
  let parsed;
  try { parsed = new DOMParser().parseFromString(html, 'text/html'); } catch { return null; }
  const lines = [];
  let cur = '';
  const flush = () => {
    const t = document.createElement('div'); t.innerHTML = cur;   // rééquilibre les balises
    const clean = t.innerHTML.trim();
    if ((t.textContent || '').replace(/ /g, ' ').trim()) lines.push(clean);
    cur = '';
  };
  const walk = (node, st) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { cur += esc(n.textContent.replace(/[\r\n\t]+/g, ' ')); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (PASTE_SKIP.has(tag)) continue;
      if (tag === 'br') { flush(); continue; }
      const isBlock = PASTE_BLOCK.has(tag);
      if (isBlock) flush();
      const cs = n.style || {};
      const s = Object.assign({}, st);
      const open = [];
      let t = PASTE_INLINE[tag] || null;
      if ((tag === 'b' || tag === 'strong') && /^(normal|[1-4]00)$/.test(cs.fontWeight || '')) t = null;  // Google Docs
      if (t) open.push(t);
      if (cs.fontWeight && (cs.fontWeight === 'bold' || cs.fontWeight === 'bolder' || +cs.fontWeight >= 600)) open.push('b');
      if (cs.fontStyle === 'italic') open.push('i');
      const deco = (cs.textDecoration || '') + ' ' + (cs.textDecorationLine || '');
      if (/underline/.test(deco)) open.push('u');
      if (/line-through/.test(deco)) open.push('s');
      if (cs.verticalAlign === 'super') open.push('sup');
      if (cs.verticalAlign === 'sub') open.push('sub');
      const eff = [...new Set(open)].filter(x => !s[x]);
      eff.forEach(x => { cur += `<${x}>`; s[x] = true; });
      walk(n, s);
      eff.slice().reverse().forEach(x => { cur += `</${x}>`; });
      if (isBlock) flush();
    }
  };
  walk(parsed.body, {});
  flush();
  return lines;
}
function fragHTML(frag) { const t = document.createElement('div'); t.appendChild(frag); return t.innerHTML; }

/* insère des blocs à la position du curseur : le premier se fond dans le paragraphe courant (découpé au curseur),
   les suivants prennent place après ; renvoie l'id du dernier bloc inséré */
function insertBlocksAtCaret(newBlocks) {
  const d = doc(); if (!d || !newBlocks.length) return null;
  const f = activeField();
  let bl = f ? f.closest('#blocks > .block') : blockAtSelection();
  let b = bl && getBlock(bl.dataset.id);
  if (!b) { b = getBlock(currentBlockId()); bl = $(`#blocks > .block[data-id="${b.id}"]`); }
  const inText = !!(f && f.classList.contains('btxt') && isTextBlock(b));
  let beforeHTML = '', afterHTML = '';
  if (inText) {
    const sel = getSelection();
    if (sel.rangeCount && f.contains(sel.getRangeAt(0).startContainer)) {
      const r = sel.getRangeAt(0); r.deleteContents();
      const rest = document.createRange(); rest.setStart(r.startContainer, r.startOffset); rest.setEnd(f, f.childNodes.length);
      afterHTML = fragHTML(rest.extractContents());
    }
    beforeHTML = f.innerHTML.replace(/(<br\s*\/?>)+$/i, '');
  }
  const blocks = newBlocks.map(x => Object.assign({}, x, { id: x.id && !getBlock(x.id) ? x.id : uid(), day: undefined }));
  let i = blockIndex(b.id);
  let last = blocks[blocks.length - 1], caret = 'end';
  if (inText) {
    const first = blocks[0];
    const emptyP = b.type === 'p' && !stripTags(beforeHTML).trim() && !afterHTML.trim();
    if (isTextBlock(first) && (first.type === 'p' || emptyP)) {
      // le premier bloc se fond dans le paragraphe courant
      if (emptyP && first.type !== 'p') resetBlock(b, Object.assign({}, first, { id: b.id }));
      else b.text = beforeHTML + (first.text || '');
      blocks.shift();
      if (!blocks.length) { caret = stripTags(b.text).length; b.text += afterHTML; last = b; }
    } else b.text = beforeHTML;
    if (blocks.length) {
      if (isTextBlock(last)) { caret = stripTags(last.text || '').length; last.text = (last.text || '') + afterHTML; }
      else if (afterHTML.trim() || !isTextBlock(last)) { const p = { id: uid(), type: 'p', text: afterHTML }; blocks.push(p); last = p; caret = 0; }
      d.blocks.splice(i + 1, 0, ...blocks);
    }
  } else {
    d.blocks.splice(i + 1, 0, ...blocks);
    if (!isTextBlock(last)) { const p = { id: uid(), type: 'p', text: '' }; d.blocks.splice(i + 1 + blocks.length, 0, p); last = p; caret = 0; }
  }
  touch(); renderBlocks(last.id, caret);
  return last.id;
}

blocksEl.addEventListener('paste', e => {
  const cd = e.clipboardData; if (!cd) return;
  // image copiée (capture d'écran, photo) → bloc image
  const files = [...(cd.files || [])].filter(f => f.type && f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); addImageFiles(files); return; }
  const field = activeField();
  const alx = cd.getData('text/x-alixo');
  const html = cd.getData('text/html'), text = cd.getData('text/plain');
  if (!alx && !html && !text) return;
  /* 1.21 : un objet est sélectionné (dessin, image, tableau…) et aucun champ n'a le curseur : le collage s'insère
     après l'objet — avant, le navigateur injectait le contenu n'importe où dans la page (parfois par-dessus l'objet) */
  if (!field && objSel) {
    e.preventDefault();
    let arr = null; if (alx) { try { arr = JSON.parse(alx); } catch { arr = null; } }
    if (!Array.isArray(arr) || !arr.length) {
      let lines = html ? htmlToLines(html) : null;
      if (!lines || !lines.length) lines = (text || '').split(/\r?\n/).map(l => esc(l.replace(/\s+$/, ''))).filter(l => l.trim());
      arr = lines.map(l => ({ type: 'p', text: l }));
    }
    const d = doc(); const i = blockIndex(objSel); if (!arr.length || i < 0) return;
    const blocks = arr.map(x => Object.assign({}, x, { id: x.id && !getBlock(x.id) ? x.id : uid(), day: undefined }));
    d.blocks.splice(i + 1, 0, ...blocks); clearObjSel(); touch(); renderBlocks(blocks[blocks.length - 1].id, 'end');
    toast(blocks.length > 1 ? `${blocks.length} blocs collés après l’objet` : 'Collé après l’objet');
    return;
  }
  if (!field || field.tagName === 'INPUT') return;
  e.preventDefault();
  if (window.AlixoNest && AlixoNest.handlePaste(field, { alx, html, text })) return;
  const url = (text || '').trim();
  if (field.classList.contains('btxt') && !alx && isWebUrl(url) && (!html || stripTags(html).trim() === url)) { openLinkPopover({ url }); return; }
  // champs simples (fiche, case, légende) : texte seul
  if (!field.classList.contains('btxt')) {
    let lines = html ? htmlToLines(html) : null;
    if (!lines || !lines.length) lines = (text || '').split(/\r?\n/).map(l => esc(l.replace(/\s+$/, ''))).filter(l => l.trim());
    if (lines.length === 1 && field.classList.contains('tcell')) document.execCommand('insertHTML', false, lines[0]);
    else document.execCommand('insertText', false, lines.map(l => stripTags(l)).join('\n'));
    return;
  }
  // blocs copiés depuis Alixo (objets compris)
  if (alx) {
    let arr = null; try { arr = JSON.parse(alx); } catch { arr = null; }
    if (Array.isArray(arr) && arr.length) {
      if (arr.length === 1 && isTextBlock(arr[0])) { document.execCommand('insertHTML', false, arr[0].text || ''); return; }
      insertBlocksAtCaret(arr);
      return;
    }
  }
  const bl = field.closest('#blocks > .block'); const b = getBlock(bl.dataset.id); if (!b) return;
  let lines = html ? htmlToLines(html) : null;
  if (!lines || !lines.length) lines = (text || '').split(/\r?\n/).map(l => esc(l.replace(/\s+$/, ''))).filter(l => l.trim());
  if (!lines.length) return;
  if (lines.length === 1 || !isTextBlock(b) || b.type !== 'p') {
    if (lines.length === 1) document.execCommand('insertHTML', false, lines[0]);
    else document.execCommand('insertText', false, lines.map(l => stripTags(l)).join('\n'));
    return;   // l'événement input met le modèle à jour
  }
  // plusieurs lignes : une ligne = un paragraphe (titres, listes reconnus)
  const i = blockIndex(b.id);
  let prev = i > 0 ? doc().blocks[i - 1] : null;
  const blocks = lines.map(l => { const nb = Object.assign({ type: 'p' }, patternFromLine(l, prev)); delete nb.cut; prev = nb; return nb; });
  insertBlocksAtCaret(blocks);
  toast(`${lines.length} lignes collées`);
});

/* copier / couper : les objets (images, graphiques, tableaux…) voyagent avec le texte */
function selectionPayload() {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!blocksEl.contains(r.commonAncestorContainer) && r.commonAncestorContainer !== blocksEl) return null;
  const els = selectionBlockEls(); if (!els.length) return null;
  const inRange = (node, off) => { try { return r.isPointInRange(node, off); } catch { return false; } };
  const out = [];
  for (const el of els) {
    const b = getBlock(el.dataset.id); if (!b) continue;
    const copy = JSON.parse(JSON.stringify(b)); delete copy.notes; delete copy.day; delete copy.mod;
    if (isTextBlock(b)) {
      const f = el.querySelector(':scope > .btxt'); if (!f) continue;
      const rr = r.cloneRange(); const fr = document.createRange(); fr.selectNodeContents(f);
      if (rr.compareBoundaryPoints(Range.START_TO_START, fr) < 0) rr.setStart(fr.startContainer, fr.startOffset);
      if (rr.compareBoundaryPoints(Range.END_TO_END, fr) > 0) rr.setEnd(fr.endContainer, fr.endOffset);
      if (rr.collapsed && !sel.isCollapsed && els.length > 1) continue;
      copy.text = cleanHTML(fragHTML(rr.cloneContents()));
    } else if (!(inRange(el, 0) && inRange(el, el.childNodes.length)) && !(objSel === b.id)) continue;   // objet partiellement couvert : ignoré
    out.push(copy);
  }
  return out.length ? out : null;
}
document.addEventListener('copy', e => {
  if (!doc() || !document.body.classList.contains('mode-editor')) return;
  if (document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) return;
  if (tsel) {
    const b = getBlock(tsel.bid); if (!b || !b.rows) return;
    const rMin = Math.min(tsel.r0, tsel.r1), rMax = Math.max(tsel.r0, tsel.r1), cMin = Math.min(tsel.c0, tsel.c1), cMax = Math.max(tsel.c0, tsel.c1);
    const lines = [], html = [];
    for (let r = rMin; r <= rMax; r++) {
      const t = [], h = [];
      for (let c = cMin; c <= cMax; c++) { const v = (b.rows[r] || [])[c] || ''; t.push(stripTags(v)); h.push(`<td>${v}</td>`); }
      lines.push(t.join('\t')); html.push(`<tr>${h.join('')}</tr>`);
    }
    e.clipboardData.setData('text/plain', lines.join('\n'));
    e.clipboardData.setData('text/html', `<table>${html.join('')}</table>`);
    e.preventDefault();
    return;
  }
  const f = activeField(); if (f && (f.classList.contains('tcell') || f.tagName === 'FIGCAPTION' || f.tagName === 'INPUT')) return;
  const payload = selectionPayload(); if (!payload) return;
  const sel = getSelection(); const r = sel.getRangeAt(0);
  e.clipboardData.setData('text/x-alixo', JSON.stringify(payload));
  const oneTable = payload.length === 1 && payload[0].type === 'table' && window.AlixoNest ? payload[0] : null;
  e.clipboardData.setData('text/plain', oneTable ? AlixoNest.blockTableText(oneTable) : (sel.isCollapsed ? payload.map(blockPlain).join('\n') : sel.toString()));
  e.clipboardData.setData('text/html', oneTable ? AlixoNest.blockTableHTML(oneTable) : (sel.isCollapsed ? '' : fragHTML(r.cloneContents())));
  e.preventDefault();
  if (oneTable) toast('Tableau copié — Ctrl+V pour le coller');
});
document.addEventListener('cut', e => {
  if (!doc() || !document.body.classList.contains('mode-editor') || tsel) return;
  if (document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) return;
  const f = activeField(); if (f && (f.classList.contains('tcell') || f.tagName === 'FIGCAPTION' || f.tagName === 'INPUT')) return;
  const payload = selectionPayload(); if (!payload) return;
  const sel = getSelection(); const r = sel.getRangeAt(0);
  e.clipboardData.setData('text/x-alixo', JSON.stringify(payload));
  e.clipboardData.setData('text/plain', sel.isCollapsed ? payload.map(blockPlain).join('\n') : sel.toString());
  e.clipboardData.setData('text/html', sel.isCollapsed ? '' : fragHTML(r.cloneContents()));
  e.preventDefault();
  if (objSel && sel.isCollapsed) { deleteObj(objSel); return; }
  fmtInProgress = true;
  try { document.execCommand('delete'); } finally { fmtInProgress = false; }
  syncAllFromDom(); touch(); setBlockNumbers(); planRefreshSoon();
});

/* ---------------- clavier ---------------- */
blocksEl.addEventListener('keydown', e => {
  if (slashCtx) return;                       // le menu « / » gère le clavier
  const mod = e.ctrlKey || e.metaKey;
  const t = e.target;

  if (cropCtx) { if (e.key === 'Enter') { e.preventDefault(); applyCrop(); } else if (e.key === 'Escape') { e.preventDefault(); cancelCrop(); } return; }

  /* --- saisie de formule --- */
  if (t.classList && t.classList.contains('fsrc')) {
    const bl = t.closest('.block'); const b = getBlock(bl.dataset.id); if (!b) return;
    if (e.key === 'Enter' && e.shiftKey) {   // nouvelle ligne dans la formule (« \\ »)
      e.preventDefault();
      const s0 = t.selectionStart ?? t.value.length, s1 = t.selectionEnd ?? s0, ins = ' \\\\ ';
      t.value = t.value.slice(0, s0) + ins + t.value.slice(s1); t.setSelectionRange(s0 + ins.length, s0 + ins.length); b.src = t.value;
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); commitFormula(b, t.value, true); return; }
    if (e.key === 'Escape') { e.preventDefault(); editingFormula[b.id] = false; renderBlocks('__none'); selectObj(b.id); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      commitFormula(b, t.value, false);
      focusFieldNearBlock(b.id, dir);
    }
    return;
  }
  if (t.tagName === 'INPUT') return;   // champs des graphiques

  /* --- des cases de tableau sont sélectionnées --- */
  if (tsel) {
    if (e.key === 'Escape') { e.preventDefault(); clearTsel(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      const tb = getBlock(tsel.bid);
      if (tb && tb.rows) {
        tselCells().forEach(({ r, c }) => { if (tb.rows[r]) tb.rows[r][c] = ''; });
        const r0 = Math.min(tsel.r0, tsel.r1), c0 = Math.min(tsel.c0, tsel.c1);
        touch(); renderBlocks('__none'); focusTableCell(tb.id, r0, c0);
      }
      return;
    }
    if (!mod && e.key.length === 1) clearTsel();
  }

  const f = activeField();
  /* --- un objet est sélectionné (image, graphique, formule, tableau) --- */
  if (objSel && (!f || f.closest('#blocks > .block') !== $(`#blocks > .block[data-id="${objSel}"]`))) {
    const id = objSel;
    if (window.AlixoDraw && AlixoDraw.handleKey(e, id)) return;   // dessin sélectionné : formes, flèches, Suppr d'une forme…
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteObj(id); return; }
    if (e.key === 'Escape') { e.preventDefault(); clearObjSel(); focusFieldNearBlock(id, 1) || focusFieldNearBlock(id, -1); return; }
    if (e.key === 'Enter' && !mod) {
      e.preventDefault();
      const d = doc(); const i = blockIndex(id); const nb = { id: uid(), type: 'p', text: '' };
      d.blocks.splice(i + 1, 0, nb); clearObjSel(); touch(); renderBlocks(nb.id, 'start');
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); clearObjSel(); if (!focusFieldNearBlock(id, 1)) selectObj(id); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); clearObjSel(); if (!focusFieldNearBlock(id, -1)) selectObj(id); return; }
    if (!mod && e.key.length === 1) { e.preventDefault(); return; }   // pas de frappe par-dessus un objet
    if (mod && ['c', 'x', 'z', 'y', 'v'].includes(e.key.toLowerCase())) return;
    return;
  }

  const bl = f ? f.closest('#blocks > .block') : blockAtSelection();
  const b = bl && getBlock(bl.dataset.id);
  if (!b) return;

  /* --- édition d'un texte de dessin --- */
  if (t.classList && t.classList.contains('draw-textedit')) return;

  /* --- case de tableau --- */
  if (f && f.classList.contains('tcell')) {
    const cell = f;
    if (e.key === 'Tab') {
      e.preventDefault();
      const cells = [...bl.querySelectorAll('.tcell')];
      const i = cells.indexOf(cell);
      if (e.shiftKey) { if (cells[i - 1]) focusField(cells[i - 1], 'end'); return; }
      if (cells[i + 1]) { focusField(cells[i + 1], 'end'); return; }
      lastCell = { r: +cell.dataset.r, c: +cell.dataset.c };
      tableOp(b, 'row+'); focusTableCell(b.id, +cell.dataset.r + 1, 0);
      return;
    }
    if (e.key === 'Backspace' && !mod && !e.shiftKey && +cell.dataset.c === 0 && caretAtStart(cell)) {
      const r = +cell.dataset.r, row = (b.rows && b.rows[r]) || [];
      const cellEmpty = x => !stripTags(x || '').replace(/ /g, ' ').trim() && !/<(img|a )/i.test(x || '');
      if (row.length && row.every(cellEmpty) && b.rows.length > 1) {
        e.preventDefault();
        lastCell = { r, c: 0 };
        tableOp(b, 'row-');
        focusTableCell(b.id, Math.max(0, r - 1), row.length - 1);
        toast('Ligne vide supprimée — Ctrl+Z pour annuler');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !mod) { if (caretInListItem()) return; e.preventDefault(); document.execCommand('insertLineBreak'); return; }
    if (e.key === 'Escape') { e.preventDefault(); selectObj(b.id); return; }
    arrowNav(e);
    return;
  }

  /* --- champ d'une fiche d'arrêt --- */
  if (f && f.matches('.jref, .jval')) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const fields = [...bl.querySelectorAll('.jref, .jval')];
      const i = fields.indexOf(f);
      if (i < fields.length - 1) focusField(fields[i + 1], 'end');
      else insertAfter(b.id, { id: uid(), type: 'p', text: '' });
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const fields = editableFields();
      const i = fields.indexOf(f);
      const tgt = fields[i + (e.shiftKey ? -1 : 1)];
      if (tgt) focusField(tgt, e.shiftKey ? 'end' : 'start');
      return;
    }
    if (e.key === 'Backspace' && !mod && caretAtStart(f) && f.classList.contains('jref') && !stripTags(bl.textContent).trim()) {
      // fiche entièrement vide : Retour arrière la retire
      e.preventDefault(); deleteObj(b.id); return;
    }
    return;
  }

  /* --- carte (titre / texte) d'un bloc « cartes » --- */
  if (f && f.matches('.cd-t, .cd-x')) {
    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      e.preventDefault();
      if (f.classList.contains('cd-t')) { const x = f.parentElement.querySelector('.cd-x'); if (x) focusField(x, 'end'); return; }
      if (/(<br\s*\/?>\s*){2}$/i.test(f.innerHTML)) { f.innerHTML = f.innerHTML.replace(/(<br\s*\/?>\s*)+$/i, ''); syncAllFromDom(); touch(); if (!focusFieldNearBlock(b.id, 1)) insertAfter(b.id, { id: uid(), type: 'p', text: '' }); return; }
      document.execCommand('insertLineBreak');
      return;
    }
    if (e.key === 'Enter' && mod) { e.preventDefault(); if (!focusFieldNearBlock(b.id, 1)) insertAfter(b.id, { id: uid(), type: 'p', text: '' }); return; }
    // 1.21 : propositions de l'IA sous les cartes — Tab corrige, Échap ignore (comme pour un paragraphe)
    if (aiSug && aiSug.id === b.id && !mod) {
      if (e.key === 'Tab' && !e.shiftKey && aiSug.fixes.length) { e.preventDefault(); acceptSug({ fixes: aiSug.fixes.map((_, i) => i) }); return; }
      if (e.key === 'Escape') { e.preventDefault(); dismissSug(); return; }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const fields = editableFields();
      const i = fields.indexOf(f);
      const tgt = fields[i + (e.shiftKey ? -1 : 1)];
      if (tgt) focusField(tgt, e.shiftKey ? 'end' : 'start');
      return;
    }
    if (e.key === 'Backspace' && !mod && caretAtStart(f) && !stripTags(bl.querySelector('.cards-grid').textContent).trim()) { e.preventDefault(); deleteObj(b.id); return; }
    if (e.key === 'Escape') { e.preventDefault(); selectObj(b.id); return; }
    return;
  }

  /* --- légende d'image --- */
  if (f && f.tagName === 'FIGCAPTION') {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!focusFieldNearBlock(b.id, 1)) insertAfter(b.id, { id: uid(), type: 'p', text: '' }); }
    if (e.key === 'Escape') { e.preventDefault(); selectObj(b.id); }
    return;
  }

  /* --- auteur / source d'une citation --- */
  if (f && f.classList.contains('qcite')) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); b.cite = cleanHTML(f.innerHTML); touch(); insertAfter(b.id, { id: uid(), type: 'p', text: '' }); return; }
    if (e.key === 'Backspace' && !mod && caretAtStart(f)) {
      e.preventDefault();
      if (!stripTags(f.innerHTML).trim()) { delete b.cite; touch(); renderBlocks(b.id, 'end'); }
      else { const t = bl.querySelector(':scope > .btxt'); if (t) focusField(t, 'end'); }
      return;
    }
    if (e.key === 'ArrowUp' && !mod && !e.shiftKey && caretLine(f).first) { e.preventDefault(); const t = bl.querySelector(':scope > .btxt'); if (t) focusField(t, 'end'); return; }
    if (e.key === 'Escape') { e.preventDefault(); const t = bl.querySelector(':scope > .btxt'); if (t) focusField(t, 'end'); }
    return;
  }

  if (!f || !f.classList.contains('btxt')) {
    // curseur entre deux blocs (après un objet, par exemple) : Entrée crée un paragraphe
    if (e.key === 'Enter' && !mod && bl) { e.preventDefault(); const d = doc(); const i = blockIndex(bl.dataset.id); const nb = { id: uid(), type: 'p', text: '' }; d.blocks.splice(i + 1, 0, nb); touch(); renderBlocks(nb.id, 'start'); }
    return;
  }
  const el = f;

  // suppression des « atomes » non éditables (références d'articles, résultats de calcul, liens)
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const atom = adjacentAtom(el, e.key === 'Backspace' ? -1 : 1);
    if (atom) {
      e.preventDefault();
      atom.remove();
      b.text = cleanHTML(el.innerHTML); touch();
      return;
    }
  }

  // suggestion de calcul : Tab accepte, Échap ignore
  if (calcGhost && calcGhost.field === el) {
    if (e.key === 'Tab') { e.preventDefault(); acceptCalcGhost(); return; }
    if (e.key === 'Escape') { e.preventDefault(); hideCalcGhost(); return; }
  }

  if (e.key === '/' && !mod && !e.altKey) {
    const emptyLine = !el.textContent.replace(/\u200B/g, '').trim() && !el.querySelector(ATOM_SEL + ', img');
    // \u00AB / \u00BB sur une ligne vide \u2192 menu des blocs ; \u00AB / \u00BB apr\u00E8s un espace au milieu d'un texte \u2192 menu d'insertion en ligne (r\u00E9f\u00E9rence, symbole, lien\u2026)
    const sel = getSelection();
    const before = sel.isCollapsed ? (textBeforeCaret(el) || '') : null;
    if (emptyLine || (before !== null && /(^|\s)$/.test(before))) {
      e.preventDefault();
      openSlashMenu(bl, emptyLine ? null : { field: el, range: sel.getRangeAt(0).cloneRange() });
      return;
    }
  }

  // propositions de l'IA : Tab applique les corrections (jamais la mise en forme), Maj+Tab la mise en forme, Échap ignore tout
  if (aiSug && !mod && sugNear(b.id)) {
    if (e.key === 'Tab' && !e.shiftKey && aiSug.fixes.length) { e.preventDefault(); acceptSug({ fixes: aiSug.fixes.map((_, i) => i) }); return; }
    if (e.key === 'Tab' && e.shiftKey && aiSug.style && aiSug.id === b.id) { e.preventDefault(); acceptSug({ style: true }); return; }
    if (e.key === 'Escape') { e.preventDefault(); dismissSug(); return; }
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    if (b.type === 'h') { b.level = e.shiftKey ? Math.max(1, b.level - 1) : Math.min(planDepth(), b.level + 1); touch(); renderBlocks(b.id, caretOffsetIn(el)); return; }
    if (b.type === 'li') { indentList(b, e.shiftKey ? -1 : 1, caretOffsetIn(el)); return; }
    if (!e.shiftKey && b.type === 'p' && caretAtStart(el)) { document.execCommand('insertText', false, '    '); }
    return;
  }

  if (arrowNav(e)) return;

  if (e.key === 'Enter' && !e.shiftKey && !mod) { e.preventDefault(); handleEnter(b, el); return; }

  if (e.key === 'Backspace' && !mod && !e.shiftKey && caretAtStart(el)) { handleBackspaceAtStart(b, el, e); return; }
  if (e.key === 'Delete' && !mod && !e.shiftKey && caretAtEnd(el)) { handleDeleteAtEnd(b, el, e); return; }
});
function caretOffsetIn(field) {
  const sel = getSelection();
  if (!sel.rangeCount || !field.contains(sel.focusNode)) return 'end';
  return offsetInField(field, sel.focusNode, sel.focusOffset);
}

/* Entrée : nouveau paragraphe (découpe au curseur), saut de ligne dans les encadrés / citations */
function handleEnter(b, el) {
  const d = doc();
  const sel = getSelection();
  if (sel.rangeCount && !sel.isCollapsed) sel.getRangeAt(0).deleteContents();
  // « -- », « --- » ou « — » seuls sur la ligne + Entrée → séparateur (trait horizontal)
  if (b.type === 'p' && /^\s*(-{2,}|—|―|_{3,}|\*{3,})\s*$/.test(stripTags(el.innerHTML).replace(/\u200B/g, ''))) {
    resetBlock(b, { type: 'hr' });
    const i = blockIndex(b.id), next = d.blocks[i + 1];
    if (next && isEmptyPara(next)) { touch(); renderBlocks(next.id, 'start'); return; }
    const nb = { id: uid(), type: 'p', text: '' };
    d.blocks.splice(i + 1, 0, nb); touch(); renderBlocks(nb.id, 'start');
    return;
  }
  const atStart = caretAtStart(el), atEnd = caretAtEnd(el);
  const hasText = !!stripTags(el.innerHTML).replace(/\u200B/g, '').trim() || !!el.querySelector(ATOM_SEL + ', img');
  if (MULTILINE_TYPES.includes(b.type)) {
    // une ligne vide en fin d'encadré + Entrée → on sort de l'encadré
    if (atEnd && /(<br\s*\/?>\s*){2}$/i.test(el.innerHTML)) {
      el.innerHTML = el.innerHTML.replace(/(<br\s*\/?>\s*)+$/i, '');
      b.text = cleanHTML(el.innerHTML); touch();
      insertAfter(b.id, { id: uid(), type: 'p', text: '' });
      return;
    }
    if (enterInBulletLine(el)) return;
    document.execCommand('insertLineBreak');
    return;
  }
  if (b.type === 'li' && !hasText) {
    if ((b.ind || 0) > 0) { b.ind--; touch(); renderBlocks(b.id, 'start'); return; }
    resetBlock(b, { type: 'p', text: '' }); touch(); renderBlocks(b.id, 'start'); return;
  }
  if (atStart && hasText) {
    // nouveau bloc vide au-dessus, le curseur reste sur le bloc courant
    const nb = { id: uid(), type: b.type === 'li' ? 'li' : 'p', text: '' };
    if (b.type === 'li') { nb.lt = b.lt; nb.ind = b.ind; }
    d.blocks.splice(blockIndex(b.id), 0, nb);
    touch(); renderBlocks(b.id, 'start');
    return;
  }
  let afterHTML = '';
  if (!atEnd && sel.rangeCount && el.contains(sel.getRangeAt(0).startContainer)) {
    const r = sel.getRangeAt(0);
    const rest = document.createRange();
    rest.setStart(r.startContainer, r.startOffset);
    rest.setEnd(el, el.childNodes.length);
    afterHTML = fragHTML(rest.extractContents());
  }
  b.text = cleanHTML(el.innerHTML.replace(/(<br\s*\/?>)+$/i, ''));
  const nb = { id: uid(), type: b.type === 'li' ? 'li' : 'p', text: cleanHTML(afterHTML) };
  if (b.type === 'li') { nb.lt = b.lt; nb.ind = b.ind; }
  d.blocks.splice(blockIndex(b.id) + 1, 0, nb);
  touch(); renderBlocks(nb.id, 'start');
}

/* Retour arrière en début de bloc */
function handleBackspaceAtStart(b, el, e) {
  const d = doc();
  const i = blockIndex(b.id);
  if (b.type === 'li' && (b.ind || 0) > 0) { e.preventDefault(); b.ind--; touch(); renderBlocks(b.id, 'start'); return; }
  if (['h', 'callout', 'quote', 'li'].includes(b.type)) {
    e.preventDefault();
    resetBlock(b, { type: 'p', text: b.text || '' });
    touch(); renderBlocks(b.id, 'start');
    return;
  }
  const prev = d.blocks[i - 1];
  if (!prev) { e.preventDefault(); return; }
  e.preventDefault();
  const empty = !stripTags(el.innerHTML).replace(/\u200B/g, '').trim() && !el.querySelector(ATOM_SEL + ', img');
  if (isObjectBlock(prev)) {
    // objet (graphique, formule, image, tableau) : on le sélectionne d'abord, un second appui le supprime
    if (empty && d.blocks.length > 1) { d.blocks.splice(i, 1); touch(); renderBlocks('__none'); }
    selectObj(prev.id);
    scrollToBlockIfHidden(prev.id);
    toast('Objet sélectionné — Retour arrière à nouveau pour le supprimer, Échap pour annuler');
    return;
  }
  if (isFiche(prev)) {
    if (empty && d.blocks.length > 1) { d.blocks.splice(i, 1); touch(); renderBlocks('__none'); }
    const pel = $(`#blocks > .block[data-id="${prev.id}"]`); const fields = pel ? pel.querySelectorAll('.jref, .jval') : [];
    if (fields.length) focusField(fields[fields.length - 1], 'end');
    return;
  }
  if (prev.type === 'quote' && !empty) {
    // fusion dans la citation : on rejoint le texte de la citation (l'auteur reste sous la citation)
    const pel = $(`#blocks > .block[data-id="${prev.id}"]`); const q = pel && pel.querySelector(':scope > .qcite');
    if (q && stripTags(q.innerHTML).trim()) { focusField(q, 'end'); return; }
  }
  if (empty) { d.blocks.splice(i, 1); touch(); renderBlocks(prev.id, 'end'); return; }
  const prevText = (prev.text || '').replace(/(<br\s*\/?>)+$/i, '');
  const offset = stripTags(prevText).length;
  prev.text = prevText + cleanHTML(el.innerHTML);
  d.blocks.splice(i, 1);
  touch(); renderBlocks(prev.id, offset);
}

/* Suppr en fin de bloc : fusionne avec le suivant (ou le sélectionne si c'est un objet) */
function handleDeleteAtEnd(b, el, e) {
  const d = doc();
  const i = blockIndex(b.id);
  const next = d.blocks[i + 1];
  if (!next) { e.preventDefault(); return; }
  e.preventDefault();
  if (isObjectBlock(next)) {
    selectObj(next.id);
    scrollToBlockIfHidden(next.id);
    toast('Objet sélectionné — Suppr à nouveau pour le supprimer, Échap pour annuler');
    return;
  }
  if (isFiche(next)) { const nel = $(`#blocks > .block[data-id="${next.id}"]`); const f = nel && nel.querySelector('.jref'); if (f) focusField(f, 'start'); return; }
  const cur = cleanHTML(el.innerHTML.replace(/(<br\s*\/?>)+$/i, ''));
  const offset = stripTags(cur).length;
  b.text = cur + (next.text || '');
  d.blocks.splice(i + 1, 1);
  touch(); renderBlocks(b.id, offset);
}
function scrollToBlockIfHidden(id) {
  const el = $(`.block[data-id="${id}"]`); if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < editorTopInset() || r.bottom > innerHeight) ensureFieldVisible(el);
}

/* ---------------- navigation au clavier entre les blocs ---------------- */
function editableFields() { return $$('#blocks .btxt, #blocks .qcite, #blocks .fsrc, #blocks .jref, #blocks .jval, #blocks .cd-t, #blocks .cd-x, #blocks .tcell, #blocks figcaption'); }
/* champ éditable le plus proche avant / après un bloc (utile depuis un objet : graphique, formule, image) */
function focusFieldNearBlock(id, dir) {
  const all = $$('#blocks > .block');
  const i = all.findIndex(x => x.dataset.id === id);
  if (i < 0) return false;
  for (let k = i + dir; k >= 0 && k < all.length; k += dir) {
    if (all[k].classList.contains('day-hidden')) continue;
    const cands = [...all[k].querySelectorAll('.btxt, .qcite, .fsrc, .jref, .jval, .tcell, figcaption')];
    const t = dir > 0 ? cands[0] : cands[cands.length - 1];
    if (t) { focusField(t, dir > 0 ? 'start' : 'end'); return true; }
    if (['img', 'graph', 'formula', 'draw', 'chart', 'score', 'mcalc', 'timer'].some(c => all[k].classList.contains(c))) { selectObj(all[k].dataset.id); return true; }
  }
  return false;
}
/* le curseur est-il sur la première / dernière ligne visuelle du champ ? */
function caretLine(el) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return { first: false, last: false };
  const atStart = caretAtStart(el), atEnd = caretAtEnd(el);
  const rect = caretRect(el);
  const er = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || (rect ? rect.height * 1.3 : 24) || 24;
  const first = atStart || !rect || rect.top - er.top < lh * 0.75;
  const last = atEnd || !rect || er.bottom - rect.bottom < lh * 0.75;
  return { first, last };
}
/* flèches ↑ ↓ : entrée dans un tableau / une fiche, sortie d'une case ; le reste est natif */
function arrowNav(e) {
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return false;
  const el = e.target.classList && e.target.classList.contains('tcell') ? e.target : activeField();
  if (!el) return false;
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const bl = el.closest('#blocks > .block'); if (!bl) return false;
  const d = doc(); const i = blockIndex(bl.dataset.id);
  if (el.classList.contains('tcell')) {
    const r = +el.dataset.r, c = +el.dataset.c;
    const line = caretLine(el);
    const tb = getBlock(bl.dataset.id);
    if (e.key === 'ArrowUp' && line.first) {
      const a = tb && r > 0 ? tableAnchor(tb, r - 1, c) : { r: r - 1, c };
      const t = bl.querySelector(`.tcell[data-r="${a.r}"][data-c="${a.c}"]`);
      if (t) { focusField(t, 'end'); e.preventDefault(); return true; }
      if (focusFieldNearBlock(bl.dataset.id, -1)) { e.preventDefault(); return true; }
    }
    if (e.key === 'ArrowDown' && line.last) {
      const sp = tb ? spanAt(tb, r, c) : null; const a = tb ? tableAnchor(tb, r + (sp ? sp.rs : 1), c) : { r: r + 1, c };
      const t = bl.querySelector(`.tcell[data-r="${a.r}"][data-c="${a.c}"]`);
      if (t) { focusField(t, 'start'); e.preventDefault(); return true; }
      if (focusFieldNearBlock(bl.dataset.id, 1)) { e.preventDefault(); return true; }
    }
    if (e.key === 'ArrowLeft' && caretAtStart(el)) { const cells = [...bl.querySelectorAll('.tcell')]; const k = cells.indexOf(el); if (cells[k - 1]) { focusField(cells[k - 1], 'end'); e.preventDefault(); return true; } if (focusFieldNearBlock(bl.dataset.id, -1)) { e.preventDefault(); return true; } }
    if (e.key === 'ArrowRight' && caretAtEnd(el)) { const cells = [...bl.querySelectorAll('.tcell')]; const k = cells.indexOf(el); if (cells[k + 1]) { focusField(cells[k + 1], 'start'); e.preventDefault(); return true; } if (focusFieldNearBlock(bl.dataset.id, 1)) { e.preventDefault(); return true; } }
    return false;
  }
  // depuis un texte : entrer dans un tableau voisin (le navigateur saute les îlots non éditables)
  const line = caretLine(el);
  const next = d.blocks[i + 1], prev = d.blocks[i - 1];
  if (e.key === 'ArrowDown' && line.last && next && next.type === 'table') { focusTableCell(next.id, 0, 0); e.preventDefault(); return true; }
  if (e.key === 'ArrowUp' && line.first && prev && prev.type === 'table') { const rows = prev.rows || [[]]; focusTableCell(prev.id, rows.length - 1, 0); e.preventDefault(); return true; }
  if (e.key === 'ArrowDown' && line.last && next && isObjectBlock(next) && next.type !== 'table') { selectObj(next.id); e.preventDefault(); return true; }
  if (e.key === 'ArrowUp' && line.first && prev && isObjectBlock(prev) && prev.type !== 'table') { selectObj(prev.id); e.preventDefault(); return true; }
  return false;
}

function caretAtStart(el) {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  const r = s.getRangeAt(0).cloneRange();
  if (!el.contains(r.startContainer)) return false;
  r.setStart(el, 0);
  return r.toString().replace(/\u200B/g, '').length === 0 && !r.cloneContents().querySelector('img, ' + ATOM_SEL);
}
function caretAtEnd(el) {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  const r = s.getRangeAt(0).cloneRange();
  if (!el.contains(r.startContainer)) return false;
  r.setEnd(el, el.childNodes.length);
  return r.toString().replace(/\u200B/g, '').length === 0 && !r.cloneContents().querySelector('img, ' + ATOM_SEL);
}

/* atome (élément non éditable) juste avant/après le curseur, ou sélectionné seul */
function adjacentAtom(field, dir) {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  const isAtom = n => !!n && n.nodeType === 1 && n.matches(ATOM_SEL);
  const skipEmpty = (n, d) => { while (n && n.nodeType === 3 && !n.length) n = d < 0 ? n.previousSibling : n.nextSibling; return n; };
  if (!sel.isCollapsed) {
    const node = r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset] : null;
    const frag = r.cloneContents();
    return frag.childNodes.length === 1 && isAtom(frag.firstChild) && isAtom(node) ? node : null;
  }
  let node = r.startContainer, off = r.startOffset;
  if (node.nodeType === 3) {
    if (dir < 0 && off > 0) return null;
    if (dir > 0 && off < node.length) return null;
  } else {
    const inner = skipEmpty(dir < 0 ? node.childNodes[off - 1] : node.childNodes[off], dir);
    if (isAtom(inner)) return inner;
    if (inner) return null;
  }
  let cur = node;
  while (cur && cur !== field) {
    const sib = skipEmpty(dir < 0 ? cur.previousSibling : cur.nextSibling, dir);
    if (sib) return isAtom(sib) ? sib : null;
    cur = cur.parentNode;
  }
  return null;
}

/* ---------------- clics dans le cours ---------------- */
blocksEl.addEventListener('click', e => {
  const ref = e.target.closest('a.refart');
  if (ref) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { window.open(ref.href, '_blank', 'noopener'); return; }
    const r = document.createRange(); r.selectNode(ref);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    toast('Référence sélectionnée — Suppr pour la retirer · Ctrl+clic pour ouvrir Légifrance');
    return;
  }
  const cb = e.target.closest('.cbox');
  if (cb) {
    const bl = cb.closest('.block'); const b = getBlock(bl.dataset.id); if (!b) return;
    b.done = !b.done; bl.classList.toggle('done', b.done); touch();
    return;
  }
  const fr = e.target.closest('.frender');
  if (fr) {
    const bl = fr.closest('.block');
    clearObjSel();
    editingFormula[bl.dataset.id] = true;
    renderBlocks(bl.dataset.id);
    openMathPanel();
    return;
  }
  // clic sur un objet (hors ses commandes) → sélection
  const obj = e.target.closest('#blocks > .block.graph, #blocks > .block.formula, #blocks > .block.chart, #blocks > .block.score, #blocks > .block.mcalc, #blocks > .block.timer');
  if (obj && !e.target.closest('button, input, select, label, .gcurve, .mv-handle')) { selectObj(obj.dataset.id); return; }
});
blocksEl.addEventListener('pointerdown', e => { if (e.target.closest('.cbox')) e.preventDefault(); });

/* clic sous le dernier bloc (feuille ou fond) : on écrit à la suite */
function focusLastOrNew() {
  const d = doc(); if (!d) return;
  const last = d.blocks[d.blocks.length - 1];
  if (last && last.type === 'p') { focusBlock(last.id, 'end'); return; }
  const nb = { id: uid(), type: 'p', text: '' };
  d.blocks.push(nb); touch(); renderBlocks(nb.id, 'start');
}
/* Un « clic » n'est traité comme tel que s'il a commencé au même endroit (même élément, sans glisser) et
   qu'aucun texte n'est sélectionné : relâcher une sélection à la souris dans la marge de la feuille ne doit
   pas déplacer le curseur (sinon la sélection est perdue et il faut recommencer). */
let lastPtrDown = null;
document.addEventListener('pointerdown', e => { lastPtrDown = { target: e.target, x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
function isPlainClick(e) {
  if (e.target !== e.currentTarget) return false;
  if (!lastPtrDown || lastPtrDown.target !== e.target) return false;
  if (Math.abs(e.clientX - lastPtrDown.x) > 4 || Math.abs(e.clientY - lastPtrDown.y) > 4) return false;
  const sel = getSelection();
  if (sel.rangeCount && !sel.isCollapsed && blocksEl.contains(sel.anchorNode)) return false;
  return true;
}
$('#doc').addEventListener('click', e => {
  if (justDraggedSel || !isPlainClick(e)) return;
  const els = $$('#blocks > .block').filter(x => x.offsetParent !== null);
  if (els[0] && e.clientY < els[0].getBoundingClientRect().top) { insertParagraphAt(0); return; }
  /* 1.19 : un clic dans l'espace entre deux blocs place le curseur à la fin du bloc du dessus
     (avant, il ajoutait un paragraphe vide en fin de cours) ; sous le dernier bloc : comme avant */
  const y = e.clientY;
  let above = null;
  for (const el of els) { const r = el.getBoundingClientRect(); if (r.bottom <= y) above = el; else if (r.top >= y) break; }
  const below = els.find(el => el.getBoundingClientRect().top >= y);
  if (above && below) { focusBlock(above.dataset.id, 'end'); return; }
  focusLastOrNew();
});
/* double-clic dans l'espace entre deux blocs : un paragraphe s'y insère */
blocksEl.addEventListener('dblclick', e => {
  if (e.target !== blocksEl) return;
  const els = $$('#blocks > .block').filter(x => x.offsetParent !== null);
  const y = e.clientY;
  /* 1.21 : le navigateur sélectionne le mot le plus proche même quand on double-clique dans le vide entre deux
     blocs ; on ne se fie donc plus à la sélection mais à la géométrie : le point doit être hors de tout bloc */
  if (els.some(x => { const r = x.getBoundingClientRect(); return y >= r.top && y <= r.bottom; })) return;
  const next = els.findIndex(x => x.getBoundingClientRect().top > y);
  if (next <= 0) return;
  e.preventDefault();
  const sl = getSelection(); if (sl.rangeCount && !sl.isCollapsed) sl.collapseToEnd();
  const idx = blockIndex(els[next].dataset.id);
  if (idx >= 0) insertParagraphAt(idx);
});
function insertParagraphAt(idx) {
  const d = doc(); if (!d) return;
  const here = d.blocks[idx];
  if (isEmptyPara(here)) { focusBlock(here.id, 'start'); return; }
  const nb = { id: uid(), type: 'p', text: '' };
  d.blocks.splice(idx, 0, nb); touch(); renderBlocks(nb.id, 'start');
}
$('#docwrap').addEventListener('click', e => {
  if (!isPlainClick(e)) return;
  focusLastOrNew();
});
/* champ de saisie du bloc situé sous le point cliqué (fiche d'arrêt : ligne concernée) */
function fieldAtPoint(bl, y) {
  const fields = [...bl.querySelectorAll('.btxt, .qcite, .jref, .jval')];
  if (!fields.length) return null;
  if (fields.length === 1) return fields[0];
  return fields.find(f => { const r = f.getBoundingClientRect(); return y >= r.top - 4 && y <= r.bottom + 4; }) || null;
}
function placeCaretAtPoint(field, x, y) {
  let r = null;
  try { r = document.caretRangeFromPoint(x, y); } catch { r = null; }
  const inAtom = r && r.startContainer && (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer).closest(ATOM_SEL);
  if (r && field.contains(r.startContainer) && !inAtom) {
    const host = field.isContentEditable ? field.closest('[contenteditable="true"]') : blocksEl;
    if (host) host.focus({ preventScroll: true });
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  } else focusField(field, 'end');
}

function commitFormula(b, src, focusNext) {
  b.src = src.trim();
  editingFormula[b.id] = false;
  touch();
  if (focusNext) {
    const i = blockIndex(b.id);
    const next = doc().blocks[i + 1];
    if (next && next.type === 'p' && !stripTags(next.text).trim()) renderBlocks(next.id, 'start');
    else { const nb = { id: uid(), type: 'p', text: '' }; doc().blocks.splice(i + 1, 0, nb); renderBlocks(nb.id, 'start'); }
  } else renderBlocks('__none');
}
blocksEl.addEventListener('focusout', e => {
  if (e.target.classList && e.target.classList.contains('fsrc')) {
    const bl = e.target.closest('.block');
    const b = getBlock(bl.dataset.id);
    if (b && editingFormula[b.id]) { b.src = e.target.value.trim(); editingFormula[b.id] = false; touch(); setTimeout(() => { if (!editingFormula[b.id]) renderBlocks(); }, 10); }
  }
});

/* ============================================================
   Bloc « Arbre » (1.20) : arborescence de nœuds (racine → enfants), affichée de haut en bas avec des
   connecteurs. b.root = { t: 'texte (HTML)', k: [ …enfants ] }. Les nœuds sont des champs éditables
   (.tr-t, data-path = indices séparés par des points) ; ＋ enfant / ＋ frère / ✕ au survol,
   Entrée = nouveau frère, Tab = nouvel enfant, Retour arrière sur un nœud vide = suppression.
   ============================================================ */
const treeRoot = b => (b.root && typeof b.root === 'object' ? b.root : (b.root = { t: '', k: [] }));
function treeNodeAt(root, path) {
  let n = root;
  for (const i of String(path || '').split('.').filter(x => x !== '')) { n = n && Array.isArray(n.k) ? n.k[+i] : null; if (!n) return null; }
  return n;
}
function treeParentOf(root, path) {
  const parts = String(path || '').split('.').filter(x => x !== '');
  if (!parts.length) return null;
  const idx = +parts.pop();
  const parent = treeNodeAt(root, parts.join('.'));
  return parent ? { parent, idx } : null;
}
function trNodeHTML(n, path, depth) {
  const kids = Array.isArray(n.k) ? n.k : [];
  return `<li><div class="tr-node d${Math.min(depth, 4)}"><div class="tr-t" contenteditable="true" data-path="${path}" data-ph="${depth ? 'Nœud' : 'Racine'}" spellcheck="true">${n.t || '<br>'}</div>
      <div class="tr-tools" contenteditable="false"><button data-tr="child" data-path="${path}" type="button" title="Ajouter un enfant (Tab)">＋ enfant</button>${depth ? `<button data-tr="sib" data-path="${path}" type="button" title="Ajouter un frère (Entrée)">＋ frère</button><button data-tr="del" data-path="${path}" type="button" class="danger" title="Supprimer ce nœud et ses enfants">✕</button>` : ''}</div></div>
    ${kids.length ? `<ul>${kids.map((c, i) => trNodeHTML(c, path ? path + '.' + i : String(i), depth + 1)).join('')}</ul>` : ''}</li>`;
}
function trBlockHTML(b) {
  const root = treeRoot(b);
  return `<div class="block tree" data-id="${b.id}" contenteditable="false">${MV_HANDLE}
    <div class="tree-wrap"><ul class="tr">${trNodeHTML(root, '', 0)}</ul></div>
    <div class="tree-tools" contenteditable="false"><span class="tree-hint">Entrée : nouveau frère · Tab : nouvel enfant · Retour arrière sur un nœud vide : supprimer</span><button data-trm="rm" class="danger" type="button" title="Supprimer l’arbre">Supprimer l’arbre</button></div></div>`;
}
const treePlain = (n, depth = 0) => (n ? [('  '.repeat(depth) + stripTags(n.t || '')).trimEnd()].concat((n.k || []).map(c => treePlain(c, depth + 1))).join('\n') : '');
/* relit les nœuds depuis l'écran (saisie en cours) */
function treeSyncFromDom(b, el) {
  const root = treeRoot(b);
  el.querySelectorAll('.tr-t').forEach(f => { const n = treeNodeAt(root, f.dataset.path); if (n) n.t = cleanHTML(f.innerHTML); });
}
function treeFocus(bid, path) {
  const el = $(`#blocks > .block[data-id="${bid}"] .tr-t[data-path="${path}"]`);
  if (el) focusField(el, 'end');
}
function treeAct(bid, act, path) {
  const b = getBlock(bid); if (!b || b.type !== 'tree') return;
  const root = treeRoot(b);
  const n = treeNodeAt(root, path); if (!n) return;
  if (act === 'child') { n.k = Array.isArray(n.k) ? n.k : []; n.k.push({ t: '', k: [] }); touch(); renderBlocks('__none'); treeFocus(bid, path ? path + '.' + (n.k.length - 1) : String(n.k.length - 1)); return; }
  const pp = treeParentOf(root, path);
  if (act === 'sib') { if (!pp) { treeAct(bid, 'child', path); return; } pp.parent.k.splice(pp.idx + 1, 0, { t: '', k: [] }); touch(); renderBlocks('__none'); const base = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : ''; treeFocus(bid, base + (pp.idx + 1)); return; }
  if (act === 'del') {
    if (!pp) return;
    pp.parent.k.splice(pp.idx, 1); touch(); renderBlocks('__none');
    const base = path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
    const next = pp.parent.k.length ? base + Math.min(pp.idx, pp.parent.k.length - 1) : base.slice(0, -1);
    treeFocus(bid, next);
  }
}
blocksEl.addEventListener('click', e => {
  const b = e.target.closest('.tr-tools [data-tr]');
  if (b) { e.preventDefault(); treeAct(b.closest('.block').dataset.id, b.dataset.tr, b.dataset.path || ''); return; }
  const rm = e.target.closest('.tree-tools [data-trm]');
  if (rm) { e.preventDefault(); deleteObj(rm.closest('.block').dataset.id); }
});
blocksEl.addEventListener('keydown', e => {
  const f = e.target.closest && e.target.closest('.tr-t'); if (!f) return;
  const bid = f.closest('.block').dataset.id, path = f.dataset.path || '';
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); treeAct(bid, 'sib', path); return; }
  if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); treeAct(bid, e.shiftKey ? 'sib' : 'child', path); return; }
  if (e.key === 'Backspace' && !stripTags(f.innerHTML).trim() && path) { e.preventDefault(); e.stopPropagation(); treeAct(bid, 'del', path); return; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); selectObj(bid); return; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.stopPropagation();   // pas de changement de bloc depuis un nœud
}, true);

/* ---------------- interactions graphiques ---------------- */
blocksEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-g]');
  if (!btn || btn.tagName === 'INPUT') return;
  const bl = btn.closest('.block');
  const b = getBlock(bl.dataset.id);
  b.params = b.params || {};
  const g = btn.dataset.g;
  if (g === 's1+') b.params.s1 = (b.params.s1 || 0) + 8;
  if (g === 's1-') b.params.s1 = (b.params.s1 || 0) - 8;
  if (g === 's2+') b.params.s2 = (b.params.s2 || 0) + 8;
  if (g === 's2-') b.params.s2 = (b.params.s2 || 0) - 8;
  if (g === 'surplus') b.params.surplus = !b.params.surplus;
  if (g === 'reset') b.params = {};
  if (g === 'draw') {
    const card = bl.querySelector('.graph-card');
    b.params.f1 = card.querySelector('[data-g="f1"]').value;
    b.params.f2 = card.querySelector('[data-g="f2"]').value;
  }
  touch();
  refreshGraph(bl, b);
  if (g === 'surplus') btn.classList.toggle('on', b.params.surplus);
});
blocksEl.addEventListener('keydown', e => {
  if (e.target.matches('[data-g="f1"], [data-g="f2"]') && e.key === 'Enter') {
    e.preventDefault();
    e.target.closest('.graph-controls').querySelector('[data-g="draw"]').click();
  }
});
function refreshGraph(bl, b) {
  bl.querySelector('.gwrap').innerHTML = AlixoGraphs.renderSVG(b.gtype, b.params || {});
}
let gdrag = null;
blocksEl.addEventListener('pointerdown', e => {
  const curve = e.target.closest('.gcurve');
  if (!curve) return;
  const bl = curve.closest('.block');
  const b = getBlock(bl.dataset.id);
  const t = AlixoGraphs.TYPES[b.gtype];
  if (!t || t.engine !== 'two') return;
  const svg = bl.querySelector('svg');
  const scale = svg.getBoundingClientRect().height / 320;
  b.params = b.params || {};
  gdrag = { bl, b, key: curve.dataset.curve === 'c1' ? 's1' : 's2', startY: e.clientY, startVal: b.params[curve.dataset.curve === 'c1' ? 's1' : 's2'] || 0, scale };
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!gdrag) return;
  const dy = e.clientY - gdrag.startY;
  const units = -dy / (gdrag.scale * AlixoGraphs.pxPerUnitY);
  gdrag.b.params[gdrag.key] = Math.round(gdrag.startVal + units);
  refreshGraph(gdrag.bl, gdrag.b);
});
window.addEventListener('pointerup', () => {
  if (gdrag) { touch(); gdrag = null; justDraggedCurve = true; setTimeout(() => justDraggedCurve = false, 0); }
});

/* ---------------- sélection d'un objet (image, graphique, formule, tableau) ---------------- */
let objSel = null;
const selectedBlocks = { get size() { return objSel ? 1 : 0; }, has: id => objSel === id, clear() { objSel = null; }, forEach(fn) { if (objSel) fn(objSel); } };
function applyObjSel() {
  $$('#blocks .block.objsel').forEach(x => { if (x.dataset.id !== objSel) x.classList.remove('objsel'); });
  if (objSel) { const el = $(`#blocks > .block[data-id="${objSel}"]`); if (el) el.classList.add('objsel'); else objSel = null; }
  updateImgBar();
}
function selectObj(id) {
  const el = $(`#blocks > .block[data-id="${id}"]`); if (!el) return;
  if (cropCtx && cropCtx.id !== id) cancelCrop();
  objSel = id; lastBlockId = id; lastAnchorBlock = id;
  applyObjSel();
  blocksEl.focus({ preventScroll: true });
  try { const r = document.createRange(); r.selectNode(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* nœud disparu */ }
  markCurrent();
}
function clearObjSel() {
  if (!objSel) return;
  objSel = null; applyObjSel();
}
function clearBlockSel() { clearObjSel(); }
function deleteObj(id) {
  const d = doc(); if (!d) return;
  const i = blockIndex(id); if (i < 0) return;
  const b = d.blocks[i];
  if (cropCtx) cancelCrop();
  d.blocks.splice(i, 1);
  objSel = null;
  if (!d.blocks.length) d.blocks.push({ id: uid(), type: 'p', text: '' });
  touch();
  const target = d.blocks[Math.min(i, d.blocks.length - 1)];
  renderBlocks(target.id, i < d.blocks.length ? 'start' : 'end');
  if (b.type === 'timer') stopTimerBlock(b.id);
  toast(`${{ img: 'Image', graph: 'Graphique', formula: 'Formule', table: 'Tableau', juris: 'Fiche d’arrêt', fiche: 'Fiche', draw: 'Dessin', chart: 'Graphique', score: 'Score', mcalc: 'Calculateur', timer: 'Minuteur', tree: 'Arbre', hr: 'Séparateur', cards: 'Cartes' }[b.type] || 'Bloc'} supprimé${b.type === 'img' || b.type === 'formula' || b.type === 'fiche' ? 'e' : ''} — Ctrl+Z pour annuler`);
}
document.addEventListener('pointerdown', e => {
  if (objSel && !e.target.closest('#blocks, #toolbar, #popover, #aipanel, #mathpanel, #ctxmenu, #imgbar')) clearObjSel();
  if (objSel && e.target.closest('#blocks') && !e.target.closest(`#blocks > .block[data-id="${objSel}"]`) && !cropCtx) clearObjSel();
});
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || slashCtx) return;
  if (!document.body.classList.contains('mode-editor')) return;
  if (e.key === 'Escape' && objSel && !e.target.closest('#blocks')) clearObjSel();
});

/* ---------------- détection de calcul (façon Apple) ---------------- */
let calcGhost = null; // { field, expr, v }
const CALC_TAIL = /([\d.,\s+\-*/×÷^%()]+)=\s*$/;
const fmtNum = v => (Math.round(v * 1e6) / 1e6).toLocaleString('fr-FR');
function textBeforeCaret(field) {
  const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return null;
  const r = sel.getRangeAt(0); if (!field.contains(r.startContainer)) return null;
  const pre = document.createRange(); pre.selectNodeContents(field); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString();
}
function evalTail(line) {
  const m = line.match(CALC_TAIL); if (!m) return null;
  const expr = m[1].trim();
  if (!/\d/.test(expr) || !/[+\-*/×÷^%]/.test(expr.replace(/^-/, ''))) return null;
  const v = safeCalc(expr);
  return v === null ? null : { expr, v };
}
function calcOnInput(b, field) {
  hideCalcGhost();
  updateCalcResults(b, field);
  const before = textBeforeCaret(field); if (before == null) return;
  const res = evalTail(before.split('\n').pop()); if (!res) return;
  showCalcGhost(field, res.expr, res.v);
}
function caretRect(field) {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  let rects = r.getClientRects();
  if (!rects.length && r.startContainer.nodeType === 1) {
    const prev = r.startContainer.childNodes[r.startOffset - 1];
    if (prev) { const r2 = document.createRange(); r2.selectNodeContents(prev); r2.collapse(false); rects = r2.getClientRects(); if (!rects.length) rects = [prev.getBoundingClientRect()]; }
  }
  return rects.length ? rects[rects.length - 1] : field.getBoundingClientRect();
}
function showCalcGhost(field, expr, v) {
  const rect = caretRect(field); if (!rect) return;
  const g = $('#calc-ghost');
  g.innerHTML = `<span class="cg-val">${esc(fmtNum(v))}</span><kbd>Tab</kbd>`;
  g.hidden = false;
  g.style.fontSize = getComputedStyle(field).fontSize;
  g.style.left = (rect.right + 4) + 'px';
  g.style.top = rect.top + 'px';
  g.style.height = rect.height + 'px';
  calcGhost = { field, expr, v, kind: 'calc' };
}
function hideCalcGhost() { calcGhost = null; const g = $('#calc-ghost'); if (!g.hidden) g.hidden = true; }
function acceptCalcGhost() {
  if (!calcGhost) return false;
  const { field, v, kind } = calcGhost;
  if (kind === 'ref') return acceptRefGhost();
  hideCalcGhost();
  document.execCommand('insertHTML', false,
    ` <span class="calc-res" contenteditable="false" title="Résultat calculé — se met à jour si le calcul change">${esc(fmtNum(v))}</span>&nbsp;`);
  const bl = field.closest('.block'); const b = bl && getBlock(bl.dataset.id);
  if (b) { b.text = cleanHTML(field.innerHTML); touch(); }
  return true;
}
/* référence d'article tapée au clavier (« art. 1240 c. civ. », « article L. 121-1 c. conso ») → proposition de lien Légifrance, Tab pour accepter */
const REF_TAIL = /(?:^|[\s(«])((?:art(?:icle)?s?\.?\s*)((?:[LRD]\.?\s*)?\d+[\d\-.]*(?:\s*al\.?\s*\d+(?:er)?)?)\s*(?:du\s+)?((?:c(?:ode)?\.?\s*(?:civ|p[ée]n|com|trav|conso)\.?|cpc|const\.?|cgi)))$/i;
function refOnInput(b, field) {
  if (!['p', 'li', 'quote', 'callout', 'h'].includes(b.type)) return;
  const before = textBeforeCaret(field); if (before == null) return;
  const m = before.split('\n').pop().match(REF_TAIL); if (!m) return;
  const ref = parseRef(m[2] + ' ' + m[3]); if (!ref) return;
  const rect = caretRect(field); if (!rect) return;
  const g = $('#calc-ghost');
  g.innerHTML = `<span class="cg-val">§ ${esc(ref.label)}</span><kbd>Tab</kbd>`;
  g.hidden = false;
  g.style.fontSize = getComputedStyle(field).fontSize;
  g.style.left = (rect.right + 4) + 'px'; g.style.top = rect.top + 'px'; g.style.height = rect.height + 'px';
  calcGhost = { field, kind: 'ref', ref, len: m[1].length };
}
function acceptRefGhost() {
  const { field, ref, len } = calcGhost;
  hideCalcGhost();
  const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  if (!field.contains(r.startContainer)) return false;
  // sélectionne les `len` derniers caractères tapés (peuvent traverser plusieurs nœuds de texte) puis les remplace par le bouton
  const endOff = offsetInField(field, r.startContainer, r.startOffset);
  const startPt = pointAtOffset(field, Math.max(0, endOff - len));
  const del = document.createRange(); del.setStart(startPt.node, startPt.off); del.setEnd(r.startContainer, r.startOffset);
  domInsertHTML(del, refChipHTML(ref) + '&nbsp;');
  const bl = field.closest('.block'); const b = bl && getBlock(bl.dataset.id);
  if (b) { syncFieldToModel(b, field); touch(); }
  toast(ref.full + ' — lien Légifrance');
  return true;
}
/* recalcul des résultats déjà insérés quand l'expression qui les précède change */
function updateCalcResults(b, field) {
  let changed = false;
  field.querySelectorAll('.calc-res').forEach(span => {
    const pre = document.createRange(); pre.selectNodeContents(field); pre.setEndBefore(span);
    const res = evalTail(pre.toString().split('\n').pop());
    if (!res) { span.classList.add('stale'); return; }
    span.classList.remove('stale');
    const txt = fmtNum(res.v);
    if (span.textContent !== txt) { span.textContent = txt; changed = true; }
  });
  if (changed) b.text = cleanHTML(field.innerHTML);
}
blocksEl.addEventListener('focusout', () => hideCalcGhost());
$('#docwrap').addEventListener('scroll', () => { hideCalcGhost(); updateImgBar(); fadeNotes('reading'); }, { passive: true });

/* ---------------- déplacer un objet à la souris (poignée ⋮⋮, ou l'image elle-même) ---------------- */
let bdrag = null;   // { id, el, x, y, active, ghost }
blocksEl.addEventListener('pointerdown', e => {
  if (e.button !== 0 || cropCtx) return;
  const h = e.target.closest('.mv-handle');
  const img = e.target.closest('#blocks > .block.img .imgbox img');
  if (!h && !img) return;
  const bl = e.target.closest('#blocks > .block'); if (!bl) return;
  e.preventDefault();
  bdrag = { id: bl.dataset.id, el: bl, x: e.clientX, y: e.clientY, active: false, ghost: null };
  selectObj(bl.dataset.id);
});
function clearDropMarks() { $$('#blocks .block.drop-before, #blocks .block.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); }
document.addEventListener('pointermove', e => {
  if (!bdrag) return;
  if (!(e.buttons & 1)) { endBlockDrag(false); return; }
  if (!bdrag.active) {
    if (Math.abs(e.clientX - bdrag.x) < 6 && Math.abs(e.clientY - bdrag.y) < 6) return;
    bdrag.active = true;
    document.body.classList.add('blk-dragging');
    const g = document.createElement('div'); g.id = 'drag-ghost';
    const im = bdrag.el.querySelector('.imgbox img');
    g.innerHTML = im ? `<img src="${im.src}" alt="">` : `<div style="padding:6px 10px;font-size:12.5px">${{ graph: 'Graphique', formula: 'Formule', table: 'Tableau', draw: 'Dessin' }[blockElType(bdrag.el)] || 'Bloc'}</div>`;
    document.body.appendChild(g); bdrag.ghost = g;
  }
  bdrag.ghost.style.left = (e.clientX + 14) + 'px'; bdrag.ghost.style.top = (e.clientY + 14) + 'px';
  clearDropMarks();
  const els = $$('#blocks > .block').filter(x => x.offsetParent !== null && x !== bdrag.el);
  if (!els.length) return;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  let target = under && under.closest ? under.closest('#blocks > .block') : null;
  if (target === bdrag.el) target = null;
  if (!target) {
    // hors d'un bloc : le plus proche verticalement
    let best = null, bd = Infinity;
    for (const x of els) { const r = x.getBoundingClientRect(); const d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0; if (d < bd) { bd = d; best = x; } }
    target = best;
  }
  if (!target) return;
  const r = target.getBoundingClientRect();
  target.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  const w = $('#docwrap');
  if (e.clientY < editorTopInset() + 24) w.scrollTop -= 14; else if (e.clientY > innerHeight - 30) w.scrollTop += 14;
});
document.addEventListener('pointerup', () => { if (bdrag) endBlockDrag(true); });
function endBlockDrag(drop) {
  const st = bdrag; bdrag = null;
  document.body.classList.remove('blk-dragging');
  if (st.ghost) st.ghost.remove();
  if (!st.active) return;
  const target = $('#blocks .block.drop-before, #blocks .block.drop-after');
  const before = target && target.classList.contains('drop-before');
  clearDropMarks();
  if (!drop || !target) return;
  const d = doc();
  const from = blockIndex(st.id); if (from < 0) return;
  const [moved] = d.blocks.splice(from, 1);
  let to = d.blocks.findIndex(b => b.id === target.dataset.id);
  if (to < 0) to = d.blocks.length; else if (!before) to++;
  d.blocks.splice(to, 0, moved);
  touch(); renderBlocks('__none'); selectObj(moved.id);
  const el = $(`#blocks > .block[data-id="${moved.id}"]`); if (el) scrollToBlockIfHidden(moved.id);
}

/* ============================================================
   Mise en forme (barre d'outils) : gras, couleurs, taille, exposant, listes
   ============================================================ */
function applyFmt(cmd, val = null, css = false) {
  const f = activeField();
  if (!f || f.tagName === 'INPUT') { if (!objSel) blocksEl.focus({ preventScroll: true }); else return; }
  fmtInProgress = true;
  try {
    if (css) document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, val);
    if (css) document.execCommand('styleWithCSS', false, false);
  } finally { fmtInProgress = false; }
  afterFmt();
}
function afterFmt() {
  const f = activeField();
  // surlignage : encre lisible sur le fond choisi (clair ou sombre), sans écraser une couleur de texte choisie
  const host = f && f.isContentEditable ? f.closest('[contenteditable="true"]') : blocksEl;
  if (host) host.querySelectorAll('span[style*="background-color"]').forEach(s => {
    const bg = s.style.backgroundColor;
    if (!bg || bg === 'transparent') { s.style.color = s.dataset.autoInk ? '' : s.style.color; delete s.dataset.autoInk; if (!s.getAttribute('style')) s.removeAttribute('style'); return; }
    /* 1.21 : « inherit » (couleur de texte « Automatique ») ou une encre identique au fond (cours enregistrés
       avec l'ancienne fuite de la palette) comptent comme « pas de couleur choisie » : encre lisible sur le fond */
    if (!s.style.color || s.dataset.autoInk || /^(inherit|initial|unset|currentcolor)$/i.test(s.style.color) || sameColor(s.style.color, bg)) { s.style.color = contrastInk(bg); s.dataset.autoInk = '1'; }
  });
  if (f && f.classList.contains('tcell')) { const bl = f.closest('.block'); const b = getBlock(bl.dataset.id); if (b && b.rows && b.rows[+f.dataset.r]) b.rows[+f.dataset.r][+f.dataset.c] = f.innerHTML; }
  else syncAllFromDom();
  touch(); setBlockNumbers(); updateToolbarState();
}

const FONT_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
/* palette (façon Google Docs) : 10 colonnes, du gris aux teintes foncées */
const PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130']
];
/* couleurs proposées d'abord (celles d'Alixo), puis la palette complète */
const TEXT_COLORS = ['#5f6368', '#c04343', '#d06a3a', '#b3762a', '#b8952e', '#2e8b6a', '#2e8b8b', '#3d6bb5', '#5b6b8c', '#8c4351', '#a8556f', '#7a6852'];
const HILITE_COLORS = ['#fff3bf', '#ffe8cc', '#ffd8d8', '#ffdeeb', '#d3f9d8', '#c3fae8', '#d0ebff', '#e5dbff', '#e9ecef'];
const CELL_COLORS = HILITE_COLORS;
const PAL_RECENT_LS = 'alixo.recentColors';
function recentColors() { try { const a = JSON.parse(localStorage.getItem(PAL_RECENT_LS) || '[]'); return Array.isArray(a) ? a.slice(0, 10) : []; } catch { return []; } }
function rememberColor(c) {
  if (!c || c === 'none' || c === 'auto') return;
  const a = [c, ...recentColors().filter(x => x !== c)].slice(0, 10);
  try { localStorage.setItem(PAL_RECENT_LS, JSON.stringify(a)); } catch { /* stockage indisponible */ }
}
/* pop-over de palette générique : { title, none: intitulé de l'option « aucune », quick: couleurs proposées d'abord, current, onPick(color|'none') } */
function openPalettePopover(rect, { title = 'Couleur', none = 'Aucune', quick = [], current = '', onPick, keepSelection = true } = {}) {
  const sw = (c, extra = '') => `<button data-pc="${c}" class="${c === current ? 'sel' : ''}${extra}" style="background:${c}" title="${c}" type="button"></button>`;
  const recent = recentColors();
  showPopover(`<h4>${esc(title)}</h4>
      <div class="pal-quick"><button data-pc="none" class="none" title="${esc(none)}" type="button">∅</button>${quick.map(c => sw(c)).join('')}</div>
      <div class="pal-grid">${PALETTE.map(row => row.map(c => sw(c)).join('')).join('')}</div>
      ${recent.length ? `<div class="po-label">Récentes</div><div class="pal-quick">${recent.map(c => sw(c)).join('')}</div>` : ''}
      <div class="pal-custom"><label>Personnalisée<input type="color" class="pal-input" value="${/^#[0-9a-f]{6}$/i.test(current) ? current : '#33658a'}"></label><button class="cta ghost small pal-apply" type="button">Appliquer</button></div>`,
    rect, pop => {
      if (keepSelection) pop.addEventListener('pointerdown', ev => { if (!ev.target.closest('input')) ev.preventDefault(); });
      const pick = c => { hidePopover(); rememberColor(c); onPick(c); };
      pop.addEventListener('click', ev => { const b = ev.target.closest('[data-pc]'); if (b) pick(b.dataset.pc); });
      const inp = pop.querySelector('.pal-input');
      pop.querySelector('.pal-apply').addEventListener('click', () => pick(inp.value));
      inp.addEventListener('change', () => pick(inp.value));
    });
}

/* taille de police du point d'insertion (px arrondis) */
function currentFontSize() {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  let n = sel.focusNode; if (!n) return null;
  if (n.nodeType === 1 && n.childNodes[sel.focusOffset - 1] && n.childNodes[sel.focusOffset - 1].nodeType === 1) n = n.childNodes[sel.focusOffset - 1];
  const el = n.nodeType === 3 ? n.parentElement : n;
  if (!el || !blocksEl.contains(el)) return null;
  return Math.round(parseFloat(getComputedStyle(el).fontSize));
}
/* applique une taille (px) à la sélection, ou à la suite de la frappe */
function applyFontSize(px) {
  px = Math.max(6, Math.min(120, Math.round(px)));
  const f = activeField(); if (!f || f.tagName === 'INPUT') return;
  const sel = getSelection(); if (!sel.rangeCount) return;
  if (sel.isCollapsed) {
    const r = sel.getRangeAt(0);
    const here = sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode);
    if (here && here.tagName === 'SPAN' && here.style.fontSize && here.textContent === '\u200B') { here.style.fontSize = px + 'px'; updateToolbarState(); return; }
    const span = document.createElement('span'); span.style.fontSize = px + 'px'; span.textContent = '\u200B';
    r.insertNode(span);
    const nr = document.createRange(); nr.setStart(span.firstChild, 1); nr.collapse(true);
    sel.removeAllRanges(); sel.addRange(nr);
    updateToolbarState();
    return;
  }
  fmtInProgress = true;
  try {
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
  } finally { fmtInProgress = false; }
  const host = f.isContentEditable ? f.closest('[contenteditable="true"]') : blocksEl;
  const spans = [];
  host.querySelectorAll('font[size="7"]').forEach(fnt => {
    const s = document.createElement('span'); s.style.fontSize = px + 'px';
    while (fnt.firstChild) s.appendChild(fnt.firstChild);
    fnt.replaceWith(s);
    s.querySelectorAll('[style]').forEach(x => { x.style.fontSize = ''; if (!x.getAttribute('style')) x.removeAttribute('style'); });
    s.querySelectorAll('font[size]').forEach(x => x.removeAttribute('size'));
    spans.push(s);
  });
  if (spans.length) {
    const r = document.createRange(); r.setStartBefore(spans[0]); r.setEndAfter(spans[spans.length - 1]);
    sel.removeAllRanges(); sel.addRange(r);
  }
  afterFmt();
}
function stepFontSize(dir) {
  const cur = currentFontSize() || 16;
  const next = dir > 0 ? (FONT_STEPS.find(s => s > cur) || cur + 4) : ([...FONT_STEPS].reverse().find(s => s < cur) || Math.max(6, cur - 1));
  applyFontSize(next);
}
$('#toolbar .fsize').addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
$('#toolbar .fsize').addEventListener('click', e => {
  const b = e.target.closest('[data-fs]'); if (!b) return;
  stepFontSize(b.dataset.fs === '+' ? 1 : -1);
});
const fsInput = $('#fs-input');
let fsSavedSel = null;
fsInput.addEventListener('focus', () => { const s = getSelection(); fsSavedSel = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; fsInput.select(); });
fsInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = parseInt(fsInput.value, 10);
    if (fsSavedSel) { blocksEl.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(fsSavedSel); }
    if (v) applyFontSize(v); else updateToolbarState();
  } else if (e.key === 'Escape') { e.preventDefault(); if (fsSavedSel) { blocksEl.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(fsSavedSel); } }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = parseInt(fsInput.value, 10) || 16; fsInput.value = e.key === 'ArrowUp' ? v + 1 : Math.max(6, v - 1); }
});

/* états de la barre d'outils (gras, listes, taille…) selon le curseur */
let tbStateTm = null;
function updateToolbarState() {
  clearTimeout(tbStateTm);
  tbStateTm = setTimeout(() => {
    const tb = $('#toolbar'); if (tb.hidden) return;
    const f = activeField();
    const inText = !!f && f.tagName !== 'INPUT';
    const q = cmd => { try { return inText && document.queryCommandState(cmd); } catch { return false; } };
    tb.querySelectorAll('[data-cmd]').forEach(btn => { const c = btn.dataset.cmd; if (c === 'removeFormat') return; btn.classList.toggle('on', q(c)); });
    const bl = blockAtSelection(); const b = bl && getBlock(bl.dataset.id);
    tb.querySelectorAll('[data-list]').forEach(btn => btn.classList.toggle('on', !!b && b.type === 'li' && (b.lt || 'ul') === btn.dataset.list));
    const al = currentAlign();
    tb.querySelectorAll('[data-align]').forEach(btn => btn.classList.toggle('on', btn.dataset.align === al));
    if (document.activeElement !== fsInput) { const px = inText ? currentFontSize() : null; fsInput.value = px || ''; }
  }, 30);
}

function openFmtMenu(btn) {
  const kind = btn.dataset.menu;
  const r = btn.getBoundingClientRect();
  if (kind === 'color') {
    openPalettePopover(r, { title: 'Couleur du texte', none: 'Automatique', quick: TEXT_COLORS, onPick: c => applyFmt('foreColor', c === 'none' ? 'inherit' : c, true) });
  } else if (kind === 'hilite') {
    openPalettePopover(r, { title: 'Surlignage', none: 'Aucun', quick: HILITE_COLORS, onPick: c => {
      if (tsel) { const tb = getBlock(tsel.bid); if (tb) setCellsBg(tb, tselCells(), c === 'none' ? '' : c); return; }
      applyFmt('hiliteColor', c === 'none' ? 'transparent' : c, true);
    } });
  }
}

/* ---------------- alignement du texte : blocs, cases de tableau, images ---------------- */
const AL_ICO = {
  left: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
  center: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
  justify: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>'
};
/* alignement au curseur : case, bloc de texte ou image sélectionnée */
function currentAlign() {
  if (objSel) { const b = getBlock(objSel); if (b && b.type === 'img') return b.align === 'center' || !b.align ? 'center' : b.align; return ''; }
  const f = activeField();
  if (f && f.classList.contains('tcell')) { const b = getBlock(f.closest('.block').dataset.id); return (b && cellTa(b, +f.dataset.r, +f.dataset.c)) || 'left'; }
  const bl = blockAtSelection(); const b = bl && getBlock(bl.dataset.id);
  if (b && TEXT_TYPES.includes(b.type)) return b.al || 'left';
  return '';
}
function setAlign(al) {
  if (!ALIGNS.includes(al)) return;
  if (objSel) {
    const b = getBlock(objSel);
    if (b && b.type === 'img' && al !== 'justify') { b.align = al; if (al !== 'center' && (b.w || 60) > 60) b.w = 45; touch(); renderBlocks('__none'); selectObj(b.id); }
    return;
  }
  if (tsel) { const tb = getBlock(tsel.bid); if (tb) setCellsTa(tb, tselCells(), al); return; }
  const f = activeField();
  if (f && f.classList.contains('tcell')) {
    const b = getBlock(f.closest('.block').dataset.id); if (!b) return;
    const snap = caretSnapshot();
    setCellsTa(b, [{ r: +f.dataset.r, c: +f.dataset.c }], al);
    if (snap) focusBlock(snap.id, snap.off, snap.key);
    return;
  }
  const blocks = selectionBlocks().filter(b => TEXT_TYPES.includes(b.type));
  if (!blocks.length) { toast('Placez le curseur dans un paragraphe, une case ou sur une image'); return; }
  const snap = caretSnapshot();
  blocks.forEach(b => { if (al === 'left') delete b.al; else b.al = al; });
  touch();
  renderBlocks(snap && snap.id ? snap.id : blocks[0].id, snap ? snap.off : 'end', snap ? snap.key : undefined);
}

/* ---------------- listes : puces, numéros, cases ; retrait par Tab ---------------- */
function setList(lt) {
  const cf = activeField();
  if (cf && cf.classList.contains('tcell')) {
    // liste dans une case de tableau (native) ; les cases à cocher n'existent que dans le texte du cours
    if (lt === 'cl') { toast('Cases à cocher : dans le texte du cours uniquement (« [] » en début de ligne)'); return; }
    fmtInProgress = true;
    try { document.execCommand(lt === 'ol' ? 'insertOrderedList' : 'insertUnorderedList'); } finally { fmtInProgress = false; }
    afterFmt();
    return;
  }
  const els = selectionBlockEls();
  const blocks = els.map(el => getBlock(el.dataset.id)).filter(b => b && ['p', 'li', 'quote', 'h'].includes(b.type));
  if (!blocks.length) { toast('Placez le curseur dans un paragraphe'); return; }
  const snap = caretSnapshot();
  const allSame = blocks.every(b => b.type === 'li' && (b.lt || 'ul') === lt);
  for (const b of blocks) {
    if (allSame) resetBlock(b, { type: 'p', text: b.text || '' });
    else { const ind = b.type === 'li' ? (b.ind || 0) : 0; const done = b.type === 'li' && b.done; resetBlock(b, Object.assign({ type: 'li', lt, text: b.text || '', ind }, done ? { done } : {})); }
  }
  touch();
  renderBlocks(snap && snap.id ? snap.id : blocks[0].id, snap ? snap.off : 'end');
}
function indentList(b, dir, caret) {
  const n = Math.max(0, Math.min(3, (b.ind || 0) + dir));
  if (n === (b.ind || 0)) return;
  b.ind = n; if (!n) delete b.ind;
  touch(); renderBlocks(b.id, caret === undefined ? 'end' : caret);
}

/* ============================================================
   Images : insertion, taille, alignement, recadrage, légende
   ============================================================ */
const IMG_MAX_SIDE = 1400, IMG_MAX_BYTES = 940 * 1024;   // taille maximale de la data URL (limite Firestore : 1 Mio par document)
/* lit un fichier image, le réduit si besoin, renvoie { data (data URL), w, h } */
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      let w = im.naturalWidth, h = im.naturalHeight;
      if (!w || !h) { reject(new Error('Image illisible')); return; }
      const isPng = /png|gif|webp|svg/i.test(file.type) && file.size < 400 * 1024;
      const scale = Math.min(1, IMG_MAX_SIDE / Math.max(w, h));
      if (scale === 1 && file.size < IMG_MAX_BYTES * 0.6 && isPng) {
        const fr = new FileReader(); fr.onload = () => resolve({ data: fr.result, w, h }); fr.onerror = () => reject(fr.error); fr.readAsDataURL(file);
        return;
      }
      let q = 0.84, s = scale, data = '';
      for (let k = 0; k < 6; k++) {
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        const ctx = c.getContext('2d');
        if (!isPng) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(im, 0, 0, c.width, c.height);
        data = isPng && k === 0 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
        if (data.length <= IMG_MAX_BYTES) { resolve({ data, w: c.width, h: c.height }); return; }
        if (isPng && k === 0) continue;   // le PNG est trop lourd : on passe en JPEG
        q -= 0.12; s *= 0.85;
      }
      resolve({ data, w: Math.round(w * s), h: Math.round(h * s) });
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    im.src = url;
  });
}
/* insère des fichiers image dans le cours (à la position du curseur, ou après un bloc donné) */
async function addImageFiles(files, afterId) {
  const list = [...files].filter(f => f.type && f.type.startsWith('image/'));
  if (!list.length) { toast('Aucune image dans ce qui a été déposé'); return; }
  if (!await storageAllows(list.reduce((n, f) => n + (f.size || 0), 0))) return;
  let lastId = null;
  for (const file of list) {
    let im;
    try { im = await fileToImage(file); } catch { toast(`Image illisible : ${file.name}`); continue; }
    const iid = uid();
    await AlixoImages.put(iid, im.data);
    const b = { type: 'img', iid, nw: im.w, nh: im.h, w: im.w >= 900 ? 80 : (im.w < 400 ? 40 : 60), align: 'center' };
    let nb;
    if (afterId && getBlock(afterId)) nb = insertAfter(afterId, Object.assign({ id: uid() }, b));
    else nb = insertSpecial(b);
    lastId = afterId = nb.id;
  }
  if (lastId) { selectObj(lastId); toast(list.length > 1 ? `${list.length} images insérées` : 'Image insérée — poignées pour la taille, barre pour recadrer ou aligner'); }
}
let imgReplaceTarget = null;
$('#img-file').addEventListener('change', async e => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  if (imgReplaceTarget) {
    const id = imgReplaceTarget; imgReplaceTarget = null;
    const b = getBlock(id); if (!b) return;
    try {
      const im = await fileToImage(files[0]);
      const iid = uid(); await AlixoImages.put(iid, im.data);
      b.iid = iid; b.nw = im.w; b.nh = im.h; delete b.crop;
      touch(); renderBlocks('__none'); selectObj(id); toast('Image remplacée');
    } catch { toast('Image illisible'); }
    return;
  }
  addImageFiles(files);
});
function pickImages(replaceId) { imgReplaceTarget = replaceId || null; $('#img-file').click(); }
/* glisser-déposer d'images sur la feuille */
$('#docwrap').addEventListener('dragover', e => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  $('#docwrap').classList.add('img-drop');
});
$('#docwrap').addEventListener('dragleave', e => { if (!e.relatedTarget || !$('#docwrap').contains(e.relatedTarget)) $('#docwrap').classList.remove('img-drop'); });
$('#docwrap').addEventListener('drop', e => {
  $('#docwrap').classList.remove('img-drop');
  const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
  if (!files.length) return;
  e.preventDefault();
  const under = document.elementFromPoint(e.clientX, e.clientY);
  let bl = under && under.closest ? under.closest('#blocks > .block') : null;
  if (!bl) { const els = $$('#blocks > .block').filter(x => x.offsetParent !== null); bl = els.filter(x => x.getBoundingClientRect().top <= e.clientY).pop() || null; }
  addImageFiles(files, bl ? bl.dataset.id : null);
});

/* barre flottante au-dessus de l'image sélectionnée */
function updateImgBar() {
  const bar = $('#imgbar');
  const el = objSel ? $(`#blocks > .block.img[data-id="${objSel}"]`) : null;
  if (!el || cropCtx) { bar.hidden = true; return; }
  const b = getBlock(objSel); if (!b) { bar.hidden = true; return; }
  const box = el.querySelector('.imgbox'); const r = (box || el).getBoundingClientRect();
  bar.hidden = false;
  bar.querySelectorAll('[data-ib^="al-"]').forEach(x => x.classList.toggle('on', x.dataset.ib === 'al-' + (b.align || 'center')));
  bar.querySelector('[data-ib="caption"]').classList.toggle('on', b.cap !== undefined && b.cap !== null);
  const sz = bar.querySelector('[data-ib="size"]'); if (sz) sz.textContent = `${Math.round(r.width)} px · ${Math.round(b.w || 60)} %`;
  // sous l'image (comme Google Docs) ; au-dessus si l'on manque de place en bas
  let top = r.bottom + 8;
  if (top + bar.offsetHeight > innerHeight - 8) top = Math.max(editorTopInset() + 6, r.top - bar.offsetHeight - 8);
  if (r.bottom < editorTopInset()) top = editorTopInset() + 6;
  bar.style.top = top + 'px';
  bar.style.left = Math.max(8, Math.min(r.left + r.width / 2 - bar.offsetWidth / 2, innerWidth - bar.offsetWidth - 8)) + 'px';
}
/* taille de l'image : largeur en % de la feuille ou en pixels (hauteur suivie, proportions conservées) */
function imgSizePopover(id, anchor) {
  const b = getBlock(id); if (!b || b.type !== 'img') return;
  const cw = blocksEl.getBoundingClientRect().width || 644;
  const c = imgCrop(b), ratio = (c.w * (b.nw || 4)) / (c.h * (b.nh || 3));
  const pct = Math.round((b.w || 60) * 10) / 10;
  const px = Math.round(cw * pct / 100);
  showPopover(`<h4>Taille de l’image</h4>
      <div class="po-row img-size"><label>Largeur (%)<input id="is-pct" inputmode="decimal" value="${pct}"></label><label>Largeur (px)<input id="is-px" inputmode="numeric" value="${px}"></label><label>Hauteur (px)<input id="is-h" inputmode="numeric" value="${Math.round(px / ratio)}"></label></div>
      <div class="pal-quick img-presets">${[25, 33, 50, 66, 75, 100].map(p => `<button data-pct="${p}" class="${Math.round(pct) === p ? 'sel' : ''}" type="button">${p} %</button>`).join('')}</div>
      <div class="po-hint">Les proportions sont conservées ; pour rogner, utilisez « Recadrer » (clic droit sur l’image).</div>
      <div class="po-row" style="justify-content:flex-end; margin-top:10px"><button class="pobtn" id="is-ok" type="button">Appliquer</button></div>`,
    anchor || centerRect(), pop => {
      const iPct = pop.querySelector('#is-pct'), iPx = pop.querySelector('#is-px'), iH = pop.querySelector('#is-h');
      const fromPct = p => { p = Math.max(8, Math.min(100, +p || 0)); iPct.value = Math.round(p * 10) / 10; iPx.value = Math.round(cw * p / 100); iH.value = Math.round(cw * p / 100 / ratio); return p; };
      iPct.addEventListener('input', () => { const p = +String(iPct.value).replace(',', '.'); if (p) { iPx.value = Math.round(cw * p / 100); iH.value = Math.round(cw * p / 100 / ratio); } });
      iPx.addEventListener('input', () => { const w = +iPx.value; if (w) { iPct.value = Math.round(w / cw * 1000) / 10; iH.value = Math.round(w / ratio); } });
      iH.addEventListener('input', () => { const h = +iH.value; if (h) { const w = h * ratio; iPx.value = Math.round(w); iPct.value = Math.round(w / cw * 1000) / 10; } });
      pop.querySelectorAll('[data-pct]').forEach(x => x.addEventListener('click', () => fromPct(x.dataset.pct)));
      const ok = () => {
        const p = fromPct(String(iPct.value).replace(',', '.'));
        hidePopover();
        const bb = getBlock(id); if (!bb) return;
        bb.w = Math.round(p * 10) / 10; touch(); renderBlocks('__none'); selectObj(id);
      };
      pop.querySelector('#is-ok').addEventListener('click', ok);
      pop.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
      setTimeout(() => { iPct.focus(); iPct.select(); }, 40);
    });
}
/* clic droit sur une image : taille, alignement, recadrage, légende… */
function openImgCtxMenu(x, y, id) {
  const b = getBlock(id); if (!b || b.type !== 'img') return;
  const menu = $('#ctxmenu');
  const al = b.align || 'center';
  menu.innerHTML = `
    <div class="cm-title">Image — ${Math.round(b.w || 60)} % de la largeur</div>
    <div class="cm-aligns cm-sizes">${[25, 50, 75, 100].map(p => `<button data-cm="isz" data-pct="${p}" class="${Math.round(b.w || 60) === p ? 'on' : ''}" title="Largeur ${p} %">${p} %</button>`).join('')}</div>
    <button data-cm="isize">${CM_ICO.pen}Taille personnalisée…</button>
    <div class="cm-aligns"><button data-cm="ial" data-al="left" class="${al === 'left' ? 'on' : ''}" title="À gauche, texte autour">${AL_ICO.left}</button><button data-cm="ial" data-al="center" class="${al === 'center' ? 'on' : ''}" title="Centrée">${AL_ICO.center}</button><button data-cm="ial" data-al="right" class="${al === 'right' ? 'on' : ''}" title="À droite, texte autour">${AL_ICO.right}</button></div>
    <button data-cm="icrop"><svg viewBox="0 0 24 24"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>Recadrer</button>
    ${b.crop ? `<button data-cm="iuncrop">${CM_ICO.dup}Image entière (annuler le recadrage)</button>` : ''}
    <button data-cm="icap">${CM_ICO.pen}${b.cap !== undefined && b.cap !== null ? 'Retirer la légende' : 'Ajouter une légende'}</button>
    <button data-cm="ireplace">${CM_ICO.dup}Remplacer l’image…</button>
    <button data-cm="idel" class="danger">${CM_ICO.trash}Supprimer l’image</button>`;
  menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = id;
  placeCtxMenu(menu, x, y);
}
blocksEl.addEventListener('contextmenu', e => {
  const fig = e.target.closest('#blocks > .block.img'); if (!fig || e.target.closest('figcaption')) return;
  e.preventDefault();
  if (cropCtx) return;
  selectObj(fig.dataset.id);
  openImgCtxMenu(e.clientX, e.clientY, fig.dataset.id);
});
$('#imgbar').addEventListener('pointerdown', e => e.preventDefault());
$('#imgbar').addEventListener('click', e => {
  const btn = e.target.closest('[data-ib]'); if (!btn || !objSel) return;
  const id = objSel; const b = getBlock(id); if (!b || b.type !== 'img') return;
  const k = btn.dataset.ib;
  if (k.startsWith('al-')) { b.align = k.slice(3); if (b.align !== 'center' && (b.w || 60) > 60) b.w = 45; touch(); renderBlocks('__none'); selectObj(id); return; }
  if (k === 'size') { imgSizePopover(id, btn.getBoundingClientRect()); return; }
  if (k === 'crop') { startCrop(id); return; }
  if (k === 'replace') { pickImages(id); return; }
  if (k === 'caption') {
    if (b.cap === undefined || b.cap === null) { b.cap = ''; touch(); renderBlocks('__none'); const fc = $(`#blocks > .block[data-id="${id}"] figcaption`); if (fc) focusField(fc, 'start'); }
    else { delete b.cap; touch(); renderBlocks('__none'); selectObj(id); }
    return;
  }
  if (k === 'delete') deleteObj(id);
});

/* redimensionnement par les poignées (largeur en % de la feuille, proportions conservées) */
let irz = null;
blocksEl.addEventListener('pointerdown', e => {
  const h = e.target.closest('.block.img .rz'); if (!h || cropCtx) return;
  e.preventDefault(); e.stopPropagation();
  const fig = h.closest('.block'); const b = getBlock(fig.dataset.id); if (!b) return;
  const box = fig.querySelector('.imgbox').getBoundingClientRect();
  irz = { fig, b, k: h.dataset.rz, box, cw: blocksEl.getBoundingClientRect().width, w: b.w || 60 };
  selectObj(b.id);
  document.body.classList.add('img-resizing');
});
document.addEventListener('pointermove', e => {
  if (!irz) return;
  const { k, box, cw } = irz;
  let px;
  if (/e/.test(k)) px = e.clientX - box.left;
  else if (/w/.test(k)) px = box.right - e.clientX;
  else px = box.width;
  if (k === 'nw' || k === 'sw' || k === 'w') px = box.right - e.clientX;
  const pct = Math.max(8, Math.min(100, px / cw * 100));
  irz.w = pct;
  irz.fig.style.setProperty('--w', pct.toFixed(1) + '%');
  updateImgBar();
});
document.addEventListener('pointerup', () => {
  if (!irz) return;
  const { b, w } = irz; irz = null;
  document.body.classList.remove('img-resizing');
  b.w = Math.round(w * 10) / 10; touch(); updateImgBar();
});

/* recadrage : rectangle déplaçable / redimensionnable sur l'image entière ; non destructif */
let cropCtx = null;   // { id, fig, box, rect, c: {x,y,w,h}, drag }
function startCrop(id) {
  const fig = $(`#blocks > .block.img[data-id="${id}"]`); const b = getBlock(id); if (!fig || !b) return;
  const src = AlixoImages.cache.get(b.iid); if (!src) { toast('Image pas encore chargée'); return; }
  if (cropCtx) cancelCrop();
  fig.classList.add('cropping');
  const box = fig.querySelector('.imgbox');
  const rect = document.createElement('div'); rect.className = 'crop-rect';
  rect.innerHTML = `<div class="cimg"><img src="${src}" alt=""></div>` + ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(k => `<span class="ch ${k}" data-ch="${k}"></span>`).join('');
  box.appendChild(rect);
  const bar = document.createElement('div'); bar.className = 'crop-bar';
  bar.innerHTML = `<button class="ok" data-crop="ok" type="button">Appliquer</button><button data-crop="reset" type="button">Image entière</button><button data-crop="cancel" type="button">Annuler</button>`;
  fig.appendChild(bar);
  cropCtx = { id, fig, box, rect, c: imgCrop(b), drag: null };
  layoutCrop();
  updateImgBar();
  toast('Recadrage — déplacez ou étirez le cadre, Entrée pour appliquer, Échap pour annuler');
}
function layoutCrop() {
  const { rect, c, box } = cropCtx;
  rect.style.left = (c.x * 100) + '%'; rect.style.top = (c.y * 100) + '%';
  rect.style.width = (c.w * 100) + '%'; rect.style.height = (c.h * 100) + '%';
  const bw = box.getBoundingClientRect().width, bh = box.getBoundingClientRect().height;
  const im = rect.querySelector('.cimg img');
  im.style.width = bw + 'px'; im.style.height = bh + 'px';
  im.style.left = (-c.x * bw) + 'px'; im.style.top = (-c.y * bh) + 'px';
}
function applyCrop() {
  if (!cropCtx) return;
  const { id, c } = cropCtx; const b = getBlock(id);
  cancelCrop();
  if (!b) return;
  const rnd = v => Math.round(v * 10000) / 10000;
  if (c.x < 0.002 && c.y < 0.002 && c.w > 0.998 && c.h > 0.998) delete b.crop;
  else b.crop = { x: rnd(c.x), y: rnd(c.y), w: rnd(c.w), h: rnd(c.h) };
  touch(); renderBlocks('__none'); selectObj(id);
}
function cancelCrop() {
  if (!cropCtx) return;
  const { id, fig, rect } = cropCtx; cropCtx = null;
  rect.remove(); fig.querySelector('.crop-bar')?.remove(); fig.classList.remove('cropping');
  updateImgBar();
  if (objSel === id) applyObjSel();
}
blocksEl.addEventListener('click', e => {
  const b = e.target.closest('[data-crop]'); if (!b || !cropCtx) return;
  e.preventDefault();
  if (b.dataset.crop === 'ok') applyCrop();
  else if (b.dataset.crop === 'cancel') cancelCrop();
  else { cropCtx.c = { x: 0, y: 0, w: 1, h: 1 }; layoutCrop(); }
});
blocksEl.addEventListener('pointerdown', e => {
  if (!cropCtx) return;
  if (e.target.closest('.crop-bar')) { e.preventDefault(); return; }
  const rect = e.target.closest('.crop-rect');
  if (!rect || rect !== cropCtx.rect) return;
  e.preventDefault(); e.stopPropagation();
  const h = e.target.closest('.ch');
  const br = cropCtx.box.getBoundingClientRect();
  cropCtx.drag = { k: h ? h.dataset.ch : 'move', x: e.clientX, y: e.clientY, c0: Object.assign({}, cropCtx.c), bw: br.width, bh: br.height };
}, true);
document.addEventListener('pointermove', e => {
  if (!cropCtx || !cropCtx.drag) return;
  const { k, x, y, c0, bw, bh } = cropCtx.drag;
  const dx = (e.clientX - x) / bw, dy = (e.clientY - y) / bh;
  const c = Object.assign({}, c0);
  const min = 0.05;
  if (k === 'move') { c.x = Math.max(0, Math.min(1 - c.w, c0.x + dx)); c.y = Math.max(0, Math.min(1 - c.h, c0.y + dy)); }
  else {
    let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.w, y1 = c0.y + c0.h;
    if (k.includes('w')) x0 = Math.max(0, Math.min(x1 - min, x0 + dx));
    if (k.includes('e')) x1 = Math.min(1, Math.max(x0 + min, x1 + dx));
    if (k.includes('n')) y0 = Math.max(0, Math.min(y1 - min, y0 + dy));
    if (k.includes('s')) y1 = Math.min(1, Math.max(y0 + min, y1 + dy));
    c.x = x0; c.y = y0; c.w = x1 - x0; c.h = y1 - y0;
  }
  cropCtx.c = c; layoutCrop();
});
document.addEventListener('pointerup', () => { if (cropCtx && cropCtx.drag) cropCtx.drag = null; });

/* ============================================================
   Volet plan
   ============================================================ */
let planTm = null;
function planRefreshSoon() { clearTimeout(planTm); planTm = setTimeout(renderPlan, 350); }

function renderPlan() {
  const d = doc(); if (!d) return;
  if (planTab === 'jours') renderDayList();
  const numMap = computeNumbers(d.blocks);
  const hs = d.blocks.filter(b => b.type === 'h');
  const tree = $('#plan-tree');
  if (!hs.length) {
    tree.innerHTML = `<div class="pt-empty">Tapez « <b>I.</b> », « <b>A.</b> », « <b>1.</b> » en début de ligne : le plan se construit tout seul.<br><br>Tab / Maj+Tab pour changer de niveau.</div>`;
    return;
  }
  tree.innerHTML = hs.map(b =>
    `<button class="pt-item pl${b.level}" data-target="${b.id}">
      <span class="ptnum">${numMap[b.id]}</span><span>${esc(stripTags(b.text)) || '…'}</span></button>`).join('');
}

$('#plan-tree').addEventListener('click', e => {
  const it = e.target.closest('.pt-item'); if (!it) return;
  const el = $(`.block[data-id="${it.dataset.target}"]`);
  if (!el) return;
  scrollToBlockEl(el, { margin: 12 });
  $$('.pt-item').forEach(x => x.classList.toggle('current', x === it));
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
});

/* volet plan : boutons d'insertion (le curseur reste dans le cours) */
$('.pp-tools').addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
$('#pp-refart').addEventListener('click', () => {
  if (!activeField()) { const id = currentBlockId(); focusBlock(id, 'end'); }
  openArticlePopover(currentBlockId());
});
$('#pp-slash').addEventListener('click', () => {
  // menu « / » sur le paragraphe courant s'il est vide, sinon sur un nouveau paragraphe inséré après
  const d = doc(); if (!d) return;
  let b = getBlock(currentBlockId());
  const empty = isEmptyPara(b);
  if (!empty) { const nb = { id: uid(), type: 'p', text: '' }; d.blocks.splice(blockIndex(b ? b.id : d.blocks[d.blocks.length - 1].id) + 1, 0, nb); touch(); renderBlocks(nb.id, 'start'); b = nb; }
  else focusBlock(b.id, 'start');
  const el = $(`#blocks > .block[data-id="${b.id}"]`); if (el) openSlashMenu(el);
});
$('#pp-collapse').addEventListener('click', () => {
  planCollapsed = true;
  $('#planpanel').classList.add('collapsed');
  $('#pp-pill').hidden = false;
  withScrollAnchor(() => $('#view-editor').classList.remove('plan-open'));
});
$('#pp-pill').addEventListener('click', () => {
  planCollapsed = false;
  $('#planpanel').classList.remove('collapsed');
  $('#pp-pill').hidden = true;
  withScrollAnchor(() => $('#view-editor').classList.add('plan-open'));
});

$('#docwrap').addEventListener('scroll', () => {
  const w = $('#docwrap');
  const p = w.scrollHeight > w.clientHeight ? w.scrollTop / (w.scrollHeight - w.clientHeight) : 0;
  $('#plan-progress-bar').style.width = (p * 100).toFixed(1) + '%';
  const hs = $$('.block.h');
  const limit = editorTopInset() + 40;
  let cur = null;
  for (const h of hs) if (h.getBoundingClientRect().top <= limit) cur = h.dataset.id;
  if (!cur && hs.length) cur = hs[0].dataset.id;
  $$('.pt-item').forEach(it => it.classList.toggle('current', it.dataset.target === cur));
}, { passive: true });

/* ============================================================
   Menu « / »
   ============================================================ */
let slashCtx = null;

/* items : `inline` = s'insère au curseur, au milieu d'une phrase ; `spec` = section propre à une spécialité
   (affichée si le profil la contient, ou dès qu'on tape quelque chose) ; `sym` = symbole inséré tel quel */
const SLASH_ITEMS = [
  /* blocs imbriqués (js/nest.js) : proposés quand le curseur est dans un encadré, une citation ou une case de tableau */
  { sect: 'Dans ce bloc', nest: true },
  { id: 'n-table', ico: '▦', name: 'Tableau ici', sub: 'Tableau imbriqué : dans l’encadré, la citation ou la case', kw: 'tableau table grille imbrique dans ici', nest: true },
  { id: 'n-quote', icon: 'quote', name: 'Citation ici', sub: 'Citation imbriquée', kw: 'citation imbrique dans ici', nest: true },
  ...Object.entries(CALLOUTS).map(([k, c]) => ({ id: 'n-c-' + k, icon: c.ico, name: `Encadré ${c.name} ici`, kw: 'encadre imbrique dans ici ' + k, nest: true, spec: c.spec })),
  { sect: 'Structure' },
  /* niveaux du plan (1.24 : libellés, numéros et nombre de niveaux suivent Paramètres › Écriture › Plan du cours) */
  ...[1, 2, 3, 4, 5, 6].map(L => ({ id: 'h' + L, plan: L, ico: '', name: '', sub: ['Titre de premier niveau', 'Deuxième niveau', 'Troisième niveau', 'Quatrième niveau', 'Cinquième niveau', 'Sixième niveau'][L - 1], kw: 'titre plan niveau ' + ['partie un', 'section', '', '', '', ''][L - 1] })),
  { id: 'li', icon: 'list', name: 'Liste à puces', sub: 'Tab pour décaler d’un niveau', kw: 'liste puce' },
  { id: 'ol', ico: '1.', name: 'Liste numérotée', sub: '1. 2. 3. — Tab pour a. b. c.', kw: 'liste numerotee numeros' },
  { id: 'cl', icon: 'check', name: 'Cases à cocher', sub: 'À faire / fait', kw: 'liste case cocher checklist tache' },
  { id: 'quote', icon: 'quote', name: 'Citation', sub: 'Citation ou extrait, avec auteur / source', kw: 'citation auteur source' },
  { id: 'c-definition', icon: 'book-open', name: 'Encadré Définition', kw: 'definition encadre' },
  { id: 'c-retenir', icon: 'pin', name: 'Encadré À retenir', kw: 'retenir important' },
  { id: 'c-exemple', icon: 'lightbulb', name: 'Encadré Exemple', kw: 'exemple' },
  { id: 'c-bilan', icon: 'clipboard', name: 'Bilan', sub: 'Résumé de fin de partie : « - » pour des puces', kw: 'bilan resume synthese recapitulatif conclusion retenir' },
  { sect: 'Droit', spec: 'droit' },
  { id: 'c-arret', icon: 'scale', name: 'Encadré Arrêt de principe', kw: 'arret jurisprudence', spec: 'droit' },
  { id: 'c-controverse', icon: 'message-circle', name: 'Encadré Controverse', kw: 'doctrine controverse', spec: 'droit' },
  { id: 'juris', icon: 'gavel', name: 'Fiche d’arrêt', sub: 'Faits, problème, solution, portée', kw: 'jurisprudence fiche arret cassation', spec: 'droit' },
  { id: 'refart', icon: 'link', name: 'Référence d’article', sub: 'art. 1240 C. civ. → lien Légifrance, au milieu d’une phrase', kw: 'article code legifrance reference', spec: 'droit', inline: true },
  { sect: 'Santé', spec: 'sante' },
  { id: 'item', icon: 'bookmark', name: 'Item LiSA', sub: 'Numéro (1–367), intitulé, rang — au milieu d’une phrase', kw: 'item lisa r2c programme edn ic', spec: 'sante', inline: true },
  { id: 'rangA', ico: 'A', name: 'Rang A', sub: 'Marque une connaissance de rang A (filtre « Rang A » dans le plan)', kw: 'rang a ranga connaissance', spec: 'sante', inline: true },
  { id: 'rangB', ico: 'B', name: 'Rang B', sub: 'Marque une connaissance de rang B', kw: 'rang b rangb connaissance', spec: 'sante', inline: true },
  { id: 'c-drapeau', icon: 'flag', name: 'Drapeaux rouges', sub: 'Signes de gravité, critères d’hospitalisation', kw: 'drapeau rouge gravite urgence hospitalisation red flag', spec: 'sante' },
  { id: 'c-reflexe', icon: 'zap', name: 'Réflexe / piège', sub: '« Jusqu’à preuve du contraire »', kw: 'reflexe piege ecn edn', spec: 'sante' },
  { id: 'c-mnemo', icon: 'brain', name: 'Moyen mnémotechnique', kw: 'mnemotechnique moyen memoire', spec: 'sante' },
  { id: 'c-objectifs', icon: 'target', name: 'Objectifs pédagogiques', sub: 'Objectifs de l’item, à cocher', kw: 'objectifs pedagogiques item', spec: 'sante' },
  { id: 'f-patho', icon: 'activity', name: 'Fiche pathologie', sub: 'Définition → épidémio → physiopath → clinique → paraclinique → DDx → traitement', kw: 'patho pathologie maladie fiche', spec: 'sante' },
  { id: 'f-medoc', icon: 'flask', name: 'Fiche médicament', sub: 'DCI, classe, mécanisme, indications, CI, EI, interactions, posologie', kw: 'med medicament molecule dci pharmaco', spec: 'sante' },
  { id: 'f-semio', icon: 'thermometer', name: 'Sémiologie', sub: 'Signe → définition → recherche → signification', kw: 'semio semiologie signe', spec: 'sante' },
  { id: 'f-cas', icon: 'user', name: 'Cas clinique', sub: 'Énoncé, questions, correction', kw: 'cas clinique', spec: 'sante' },
  { id: 'f-cat', icon: 'list', name: 'Conduite à tenir', sub: 'Mesures immédiates, examens, traitement, surveillance, orientation', kw: 'cat conduite a tenir', spec: 'sante' },
  { id: 'f-reco', icon: 'shield-check', name: 'Recommandation HAS', sub: 'Année, grade, lien, résumé', kw: 'reco recommandation has grade', spec: 'sante' },
  { id: 'f-lca', icon: 'newspaper', name: 'Lecture critique d’article', sub: 'PICO, type d’étude, niveau de preuve, biais', kw: 'lca lecture critique article pico', spec: 'sante' },
  { id: 'f-anat', icon: 'dna', name: 'Anatomie', sub: 'Rapports, vascularisation, innervation, lymphatiques', kw: 'anat anatomie', spec: 'sante' },
  { id: 'f-histo', icon: 'microscope', name: 'Histologie / cytologie', kw: 'histo histologie cytologie tissu cellule', spec: 'sante' },
  { id: 'f-genet', icon: 'dna', name: 'Génétique', sub: 'Transmission, pénétrance, diagnostic, conseil', kw: 'genetique transmission', spec: 'sante' },
  { id: 'f-vaccin', icon: 'shield', name: 'Vaccin', sub: 'Type, schéma, rappels, CI, population', kw: 'vaccin vaccination', spec: 'sante' },
  { id: 'f-ecos', icon: 'target', name: 'Station ECOS', sub: 'Consigne, attendus, grille — minuteur 7 min', kw: 'ecos station', spec: 'sante' },
  { id: 'f-dp', icon: 'file-text', name: 'Dossier progressif / QI', sub: 'Format EDN : questions à 5 propositions', kw: 'dp dossier progressif qi question isolee edn qcm', spec: 'sante' },
  { id: 'f-galen', icon: 'flask', name: 'Fiche galénique', kw: 'galenique forme pharmacie', spec: 'pharmacie' },
  { id: 'f-dent', icon: 'apple', name: 'Fiche dent (FDI)', kw: 'dent dentaire fdi odontologie', spec: 'odontologie' },
  { id: 'f-bilank', icon: 'activity', name: 'Bilan kinésithérapique', kw: 'bilan kine kinesitherapie amplitude', spec: 'kine' },
  { id: 'f-grossesse', icon: 'heart', name: 'Suivi de grossesse', kw: 'grossesse sa maieutique sage-femme', spec: 'maieutique' },
  { id: 'score', icon: 'check-circle', name: 'Score clinique', sub: 'Glasgow, CHA₂DS₂-VASc, Wells, CURB-65, Apgar… avec calcul', kw: 'score glasgow wells curb apgar bishop child nyha killip', spec: 'sante' },
  { id: 'mcalc', icon: 'calculator', name: 'Calculateur clinique', sub: 'IMC, Cockcroft, CKD-EPI, QTc, PAM, trou anionique, LDL…', kw: 'calcul imc clairance dfg qtc pam ldl osmolarite bayes', spec: 'sante' },
  { id: 'triade', ico: '3', name: 'Triade / tétrade', sub: 'Tableau à 3 ou 4 cases', kw: 'triade tetrade', spec: 'sante' },
  { id: 'ddx', ico: '⇄', name: 'Diagnostic différentiel', sub: 'Colonnes : hypothèses · lignes : clinique, biologie, imagerie, pour / contre', kw: 'ddx differentiel comparatif tableau', spec: 'sante' },
  { sect: 'Commerce & marketing', spec: 'commerce' },
  { id: 'f-swot', icon: 'target', name: 'Analyse SWOT', sub: 'Forces, faiblesses, opportunités, menaces', kw: 'swot forces faiblesses opportunites menaces diagnostic', spec: 'commerce' },
  { id: 'f-pestel', icon: 'globe', name: 'Analyse PESTEL', sub: 'Politique, économique, socioculturel, technologique, écologique, légal', kw: 'pestel macro environnement', spec: 'commerce' },
  { id: 'f-mix', icon: 'layers', name: 'Marketing mix (4P)', sub: 'Produit, prix, distribution, communication', kw: 'mix marketing 4p produit prix distribution communication', spec: 'commerce' },
  { id: 'f-persona', icon: 'user', name: 'Persona client', sub: 'Profil, besoins, freins, canaux', kw: 'persona client cible segment', spec: 'commerce' },
  { id: 'f-etudecas', icon: 'briefcase', name: 'Étude de cas', sub: 'Contexte, problématique, diagnostic, recommandations', kw: 'etude cas entreprise diagnostic recommandation', spec: 'commerce' },
  { id: 'f-negoc', icon: 'cart', name: 'Fiche négociation / vente', sub: 'Découverte, argumentaire CAP / SONCAS, objections, closing', kw: 'negociation vente argumentaire soncas cap objection', spec: 'commerce' },
  { sect: 'STAPS', spec: 'staps' },
  { id: 'f-seance', icon: 'activity', name: 'Séance d’entraînement', sub: 'Objectif, échauffement, corps de séance, retour au calme, charge', kw: 'seance entrainement echauffement sport', spec: 'staps' },
  { id: 'f-apsa', icon: 'trophy', name: 'Fiche APSA', sub: 'Logique interne, règlement, habiletés, tactique, sécurité', kw: 'apsa activite sport regles', spec: 'staps' },
  { id: 'f-cycle', icon: 'list', name: 'Cycle / progression', sub: 'Niveau, objectifs, situations, critères de réussite, évaluation', kw: 'cycle progression eps situations', spec: 'staps' },
  { id: 'f-muscle', icon: 'dna', name: 'Fiche muscle', sub: 'Origine, terminaison, innervation, action, étirement', kw: 'muscle anatomie origine terminaison', spec: 'staps' },
  { id: 'f-physio', icon: 'zap', name: 'Physiologie de l’effort', sub: 'Filières, facteurs limitants, adaptations, tests', kw: 'physiologie effort vo2max filiere seuil', spec: 'staps' },
  { id: 'f-obs', icon: 'clipboard', name: 'Observation de pratique', sub: 'Contexte, observations, analyse, pistes', kw: 'observation analyse pratique stage', spec: 'staps' },
  { sect: 'Économie, maths & données' },
  { id: 'chart', icon: 'chart-bar', name: 'Graphique de données', sub: 'Barres, courbes, aires, secteurs — données collées depuis Excel', kw: 'graphique chart diagramme barres histogramme camembert secteurs courbe donnees' },
  { id: 'formula', ico: 'ƒ', name: 'Formule', sub: 'Saisie linéaire → notation composée', kw: 'formule equation math' },
  { id: 'formlib', icon: 'sigma', name: 'Bibliothèque de formules', sub: 'Micro, macro, stats, finance, médecine', kw: 'modele formule bibliotheque' },
  { id: 'graphmenu', icon: 'chart-line', name: 'Graphique économique…', sub: 'Offre/demande, IS-LM, coûts…', kw: 'graphique courbe economie', spec: 'economie' },
  { id: 'g-plot', icon: 'wave', name: 'Traceur de fonctions', sub: 'Qd = 100 − 2P → tracé + intersection', kw: 'tracer fonction courbe' },
  { sect: 'Mise en page' },
  { id: 'table', ico: '▦', name: 'Tableau', sub: '3 lignes × 3 colonnes, modifiable', kw: 'tableau table grille colonnes lignes' },
  { id: 'image', icon: 'camera', name: 'Image', sub: 'Photo, schéma, capture — recadrable, déplaçable', kw: 'image photo schema capture illustration figure' },
  { id: 'draw', icon: 'pen-line', name: 'Dessin', sub: 'Formes, flèches, zones de texte, main levée', kw: 'dessin dessiner schema forme fleche croquis rectangle cercle texte' },
  { id: 'link', icon: 'link', name: 'Lien', sub: 'Bouton cliquable, QR code à l’export PDF', kw: 'lien url site web adresse', inline: true },
  { id: 'timer', icon: 'clock', name: 'Minuteur', sub: 'Compte à rebours ou chronomètre dans le cours', kw: 'minuteur chrono chronometre compte a rebours timer temps', },
  { id: 'tree', icon: 'wave', name: 'Arbre', sub: 'Arborescence : racine, branches, feuilles (plan, arbre de décision, généalogie, organigramme)', kw: 'arbre arborescence hierarchie organigramme decision branches noeud genealogique schema' },
  { id: 'cards', icon: 'layers', name: 'Cartes', sub: '3 cartes par ligne, chacune avec un titre et un texte (notions, acteurs, étapes…)', kw: 'cartes carte grille vignettes tuiles colonnes trois 3' },
  { id: 'hr', ico: '—', name: 'Séparateur', sub: 'Trait horizontal — ou tapez « -- » puis Entrée', kw: 'separateur ligne trait horizontal hr divider barre' },
  { id: 'pb', ico: '⤓', name: 'Saut de page', sub: 'Ce qui suit commence sur une nouvelle page (à l’écran et dans le PDF)', kw: 'saut page nouvelle page break pagebreak feuille suivante' },
  { sect: 'Symboles', spec: 'sym' },
  ...AlixoMed.SYMBOLS.map(([k, s]) => ({ id: 'sym-' + k, ico: s, name: s + '  ' + k, kw: k + ' symbole grec lettre', spec: 'sym', inline: true, sym: s }))
];

/* sections propres à une spécialité : visibles si le profil la contient (profil vide : tout) ou dès qu'on tape quelque chose */
/* une spécialité (« droit », « sante », « economie », « pharmacie »…) fait-elle partie du profil ?
   Profil vide : tout est permis. Les blocs d'une autre spécialité ne sont jamais proposés ni insérables
   (pas de fiche médicament sans spécialité Santé, pas de fiche d'arrêt sans Droit…). */
function specAllowed(spec) {
  if (!spec || spec === 'sym') return true;
  const p = state.settings.profil; const specs = p && Array.isArray(p.specialites) ? p.specialites : [];
  if (!specs.length) return true;
  if (spec === 'sante') return specs.some(k => AlixoMed.HEALTH_KEYS.includes(k)) || healthMode();
  if (spec === 'economie') return specs.some(k => ['economie', 'gestion', 'finance', 'maths', 'sciencepo', 'commerce'].includes(k));
  if (spec === 'droit') return specs.includes('droit') || specs.includes('sciencepo');
  if (AlixoMed.HEALTH_KEYS.includes(spec)) return specs.includes(spec);
  return specs.includes(spec);
}
/* spécialité d'un bloc (encadré, fiche, score, calculateur…) — '' si commun à tous */
function blockSpec(b) {
  if (!b) return '';
  if (b.type === 'callout') return (CALLOUTS[b.ct] || {}).spec || '';
  if (b.type === 'juris') return 'droit';
  if (b.type === 'fiche') return (AlixoMed.FICHES[b.fk] || {}).spec || 'sante';
  if (b.type === 'score' || b.type === 'mcalc') return 'sante';
  return '';
}
function slashSpecOk(it, q) {
  if (!it.spec) return true;
  if (it.spec === 'sym') return !!q;
  return specAllowed(it.spec);
}

/* inline = { field, range } quand le menu est ouvert au milieu d'un texte */
function openSlashMenu(blockEl, inline) {
  slashCtx = { blockId: blockEl.dataset.id, query: '', sel: 0, inline: inline || null, nest: window.AlixoNest ? AlixoNest.nestKindAt(blockEl, inline) : null };
  const r = inline && inline.field ? (caretRect(inline.field) || blockEl.getBoundingClientRect()) : blockEl.getBoundingClientRect();
  const menu = $('#slashmenu');
  menu.hidden = false;
  const top = Math.min(r.bottom + 6, innerHeight - 400);
  menu.style.top = top + 'px';
  menu.style.left = Math.min((inline ? r.left : r.left + 40), innerWidth - 320) + 'px';
  renderSlash();
}

/* 1.20 : les blocs les plus utilisés remontent — section « Les plus utilisés » sans recherche, tri par usage
   quand on tape (compteur par bloc, dans les réglages du compte) */
const slashUse = id => ((state.settings.blockUse || {})[id] || 0);
function noteSlashUse(id) {
  if (!id || id.startsWith('sym-')) return;
  state.settings.blockUse = state.settings.blockUse || {};
  state.settings.blockUse[id] = (state.settings.blockUse[id] || 0) + 1;
  save();
}
function renderSlash() {
  const q = norm(slashCtx.query);
  const nest = slashCtx.nest;   // 'box' (encadré, citation) | 'cell' (case de tableau : blocs imbriqués et symboles seulement) | null
  for (const it of SLASH_ITEMS) if (it.plan) { it.name = `${planName(it.plan)} (niveau ${planSample(it.plan)})`; it.ico = planSample(it.plan); }
  const items = SLASH_ITEMS.filter(it => {
    if (it.plan && it.plan > planDepth()) return false;
    if (it.nest && !nest) return false;
    if (nest === 'cell' && !it.nest && it.spec !== 'sym') return false;
    return it.sect ? slashSpecOk(it, q) : (slashSpecOk(it, q) && (!q || norm(it.name + ' ' + (it.kw || '')).includes(q)));
  });
  let out = [];
  if (q) {
    out = items.filter(it => !it.sect).map((it, i) => ({ it, i, u: slashUse(it.id) })).sort((a, b) => b.u - a.u || a.i - b.i).map(x => x.it);
  } else {
    for (let i = 0; i < items.length; i++) {
      if (items[i].sect) {
        if (items[i + 1] && !items[i + 1].sect) out.push(items[i]);
      } else out.push(items[i]);
    }
    const top = items.filter(it => !it.sect && !it.nest && slashUse(it.id) > 0).sort((a, b) => slashUse(b.id) - slashUse(a.id)).slice(0, 5);
    if (top.length) out = [{ sect: 'Les plus utilisés' }].concat(top, out);
  }
  const flat = out.filter(it => !it.sect);
  if (slashCtx.sel >= flat.length) slashCtx.sel = Math.max(0, flat.length - 1);
  let fi = -1;
  $('#slashmenu').innerHTML = (slashCtx.query ? `<div class="sm-sect">« ${esc(slashCtx.query)} »</div>` : (slashCtx.inline ? `<div class="sm-sect">Insérer ici — tapez pour filtrer (référence, item, symbole…)</div>` : '')) +
    out.map(it => {
      if (it.sect) return `<div class="sm-sect">${it.sect}</div>`;
      fi++;
      return `<button class="sm-item ${fi === slashCtx.sel ? 'sel' : ''}${it.inline ? ' inline' : ''}" data-sid="${it.id}">
        <span class="sm-ico">${it.icon ? AlixoIcons.svg(it.icon) : it.ico}</span><span>${it.name}${it.sub ? `<span class="sm-sub">${it.sub}</span>` : ''}</span></button>`;
    }).join('') +
    (flat.length ? '' : `<div class="sm-sect">Aucun résultat</div>`);
}

function closeSlash(refocus = true) {
  $('#slashmenu').hidden = true;
  const ctx = slashCtx;
  const id = ctx && ctx.blockId;
  slashCtx = null;
  if (!refocus || !id) return;
  if (ctx.inline && ctx.inline.range) { restoreSlashCaret(ctx); return; }
  focusBlock(id);
}
/* remet le curseur là où « / » avait été tapé (menu en ligne) */
function restoreSlashCaret(ctx) {
  const f = ctx.inline && ctx.inline.field;
  if (!f || !f.isConnected) return false;
  const host = f.isContentEditable ? f.closest('[contenteditable="true"]') : blocksEl;
  (host || blocksEl).focus({ preventScroll: true });
  const sel = getSelection(); sel.removeAllRanges();
  try { sel.addRange(ctx.inline.range); return f.contains(ctx.inline.range.startContainer); } catch { return false; }
}

function applySlash(sid) {
  const ctx = slashCtx;
  const bid = ctx.blockId;
  const item = SLASH_ITEMS.find(x => x.id === sid);
  closeSlash(false);
  const b = getBlock(bid); if (!b) return;
  noteSlashUse(sid);
  if (item && item.spec && item.spec !== 'sym' && !specAllowed(item.spec)) { toast('Ce bloc n’est pas disponible avec vos spécialités (Paramètres › Modifier mon profil)'); focusBlock(bid); return; }
  lastBlockId = bid;
  const inlineCtx = ctx.inline && ctx.inline.range ? { field: ctx.inline.field, range: ctx.inline.range } : null;
  const restore = () => { if (inlineCtx) restoreSlashCaret(ctx); else focusBlock(bid); };

  /* --- blocs imbriqués : insérés au curseur, à l'intérieur du bloc courant --- */
  if (sid.startsWith('n-')) { restore(); if (window.AlixoNest) AlixoNest.insert(sid.slice(2)); return; }

  /* --- insertions en ligne (au curseur) --- */
  if (item && item.sym) { restore(); insertHTMLAtCtx(inlineCtx || captureInsertCtx(), esc(item.sym), bid); return; }
  if (sid === 'refart') { restore(); openArticlePopover(bid); return; }
  if (sid === 'item') { restore(); openItemPopover(bid); return; }
  if (sid === 'rangA' || sid === 'rangB') { restore(); insertHTMLAtCtx(inlineCtx || captureInsertCtx(), rangTagHTML(sid.slice(-1)) + '&nbsp;', bid); return; }
  if (sid === 'link') { restore(); openLinkPopover({}); return; }
  if (sid === 'calc') { restore(); openCalculator(bid); return; }

  /* --- blocs : paragraphe vide → transformé sur place ; sinon le bloc s'insère au curseur (le texte est découpé) --- */
  const empty = isEmptyPara(b);
  const transform = patch => {
    if (empty || !inlineCtx) {
      const keepText = b.text || '';
      resetBlock(b, patch);
      if (patch.text === undefined && TEXT_TYPES.includes(patch.type)) b.text = keepText;
      touch(); renderBlocks(b.id);
      return b;
    }
    restore();
    const nb = Object.assign({ id: uid() }, patch);
    if (TEXT_TYPES.includes(nb.type) && nb.text === undefined) nb.text = '';
    insertBlocksAtCaret([nb]);
    if (!isObjectBlock(nb) && !isFiche(nb)) focusBlock(nb.id, 'start');
    return getBlock(nb.id) || nb;
  };

  if (sid.startsWith('h') && sid.length === 2) { transform({ type: 'h', level: +sid[1] }); return; }
  if (sid === 'li') { transform({ type: 'li', lt: 'ul' }); return; }
  if (sid === 'ol' || sid === 'cl') { transform({ type: 'li', lt: sid }); return; }
  if (sid === 'quote') { transform({ type: 'quote' }); return; }
  if (sid === 'image') { restore(); pickImages(); return; }
  if (sid === 'draw') { restore(); insertDrawing(); return; }
  if (sid.startsWith('c-')) { transform({ type: 'callout', ct: sid.slice(2) }); return; }
  if (sid === 'juris') { const nb = transform({ type: 'juris', fields: {} }); focusBlock(nb.id, 'start', 'f:ref'); toast('Fiche d’arrêt — Entrée ou Tab pour passer au champ suivant'); return; }
  if (sid.startsWith('f-')) { const fk = sid.slice(2); const nb = transform({ type: 'fiche', fk, fields: {} }); focusBlock(nb.id, 'start', 'f:ref'); toast(`${AlixoMed.FICHES[fk].name} — Entrée ou Tab pour passer au champ suivant`); return; }
  if (sid === 'formula') { const nb = transform({ type: 'formula', src: '' }); editingFormula[nb.id] = true; renderBlocks(nb.id); openMathPanel(); return; }
  if (sid === 'formlib') { openMathPanel('mod'); restore(); return; }
  if (sid === 'graphmenu') { restore(); openGraphChooser(bid); return; }
  if (sid === 'g-plot') { const nb = transform({ type: 'graph', gtype: 'plot', params: {} }); selectObj(nb.id); return; }
  if (sid === 'chart') { const nb = transform(Object.assign({ type: 'chart' }, AlixoCharts.defaults())); selectObj(nb.id); toast('Graphique — « Données… » pour saisir ou coller vos valeurs'); return; }
  if (sid === 'score') { restore(); openScoreChooser(bid, inlineCtx); return; }
  if (sid === 'mcalc') { restore(); openCalcChooser(bid, inlineCtx); return; }
  if (sid === 'timer') { const nb = transform({ type: 'timer', mode: 'down', secs: 300, label: '' }); selectObj(nb.id); openTimerBlockPopover(nb.id); return; }
  if (sid === 'table') { const nb = transform({ type: 'table', rows: [['', '', ''], ['', '', ''], ['', '', '']], head: true }); focusTableCell(nb.id, 0, 0); toast('Tableau — Tab pour passer de case en case, boutons au-dessus pour lignes et colonnes'); return; }
  if (sid === 'tree') { const nb = transform({ type: 'tree', root: { t: '', k: [{ t: '', k: [] }, { t: '', k: [] }] } }); focusBlock(nb.id, 'start'); setTimeout(() => treeFocus(nb.id, ''), 30); toast('Arbre — Entrée : nouveau frère, Tab : nouvel enfant'); return; }
  if (sid === 'cards') { const nb = transform({ type: 'cards', cards: [{ t: '', x: '' }, { t: '', x: '' }, { t: '', x: '' }] }); focusBlock(nb.id, 'start', 'f:t0'); toast('Cartes — Entrée : du titre au texte, Tab : carte suivante, « ＋ carte » pour en ajouter'); return; }
  if (sid === 'hr' || sid === 'pb') {
    const nb = transform({ type: sid });
    const d = doc(); const i = blockIndex(nb.id); const next = d.blocks[i + 1];
    if (next && isEmptyPara(next)) focusBlock(next.id, 'start');
    else { const np = { id: uid(), type: 'p', text: '' }; d.blocks.splice(i + 1, 0, np); touch(); renderBlocks(np.id, 'start'); }
    return;
  }
  if (sid === 'triade') { const nb = transform({ type: 'table', rows: [['', '', '']], head: true }); focusTableCell(nb.id, 0, 0); toast('Triade — une case par élément ; « ＋ colonne » pour une tétrade'); return; }
  if (sid === 'ddx') { const nb = transform({ type: 'table', rows: [['', 'Hypothèse 1', 'Hypothèse 2'], ['Clinique', '', ''], ['Biologie', '', ''], ['Imagerie', '', ''], ['Arguments pour / contre', '', '']], head: true }); focusTableCell(nb.id, 0, 1); return; }
  if (sid === 'ti') { restore(); openCalcPanel(); return; }
  if (sid === 'dict') { restore(); openDictPanel(); return; }
  if (sid === 'cal') { restore(); openCalPanel(); return; }
  if (sid === 'viewer') { restore(); openViewer(); return; }
}

$('#slashmenu').addEventListener('click', e => {
  const it = e.target.closest('.sm-item');
  if (it) applySlash(it.dataset.sid);
});
/* bloc « cartes » : ajouter / retirer une carte, supprimer le bloc ; séparateur : clic = sélection */
blocksEl.addEventListener('click', e => {
  const cd = e.target.closest('.cards-tools [data-cd]');
  if (cd) {
    e.preventDefault();
    const bl = cd.closest('.block'); const b = getBlock(bl.dataset.id); if (!b || readOnly) return;
    b.cards = cardsOf(b);
    if (cd.dataset.cd === 'add') { if (b.cards.length < 12) { b.cards.push({ t: '', x: '' }); touch(); renderBlocks(b.id, 'start', 'f:t' + (b.cards.length - 1)); } else toast('12 cartes au maximum'); }
    else if (cd.dataset.cd === 'del') { if (b.cards.length > 1) { b.cards.pop(); touch(); renderBlocks(b.id, 'end', 'f:x' + (b.cards.length - 1)); } else deleteObj(b.id); }
    else if (cd.dataset.cd === 'rm') deleteObj(b.id);
    return;
  }
  const hr = e.target.closest('#blocks > .block.hr, #blocks > .block.pb');
  if (hr) { e.preventDefault(); selectObj(hr.dataset.id); }
});

document.addEventListener('keydown', e => {
  if (!slashCtx) return;
  // le menu consomme la touche : l'éditeur ne doit pas la traiter aussi (Entrée créait un bloc en plus)
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  const flatCount = $$('#slashmenu .sm-item').length;
  if (e.key === 'Escape') { stop(); closeSlash(); return; }
  if (e.key === 'ArrowDown') { stop(); slashCtx.sel = Math.min(flatCount - 1, slashCtx.sel + 1); renderSlash(); scrollSlashIntoView(); return; }
  if (e.key === 'ArrowUp') { stop(); slashCtx.sel = Math.max(0, slashCtx.sel - 1); renderSlash(); scrollSlashIntoView(); return; }
  if (e.key === 'Enter' || e.key === 'Tab') {
    stop();
    const sel = $$('#slashmenu .sm-item')[slashCtx.sel];
    if (sel) applySlash(sel.dataset.sid); else closeSlash();
    return;
  }
  if (e.key === 'Backspace') {
    stop();
    if (!slashCtx.query) { closeSlash(); return; }
    slashCtx.query = slashCtx.query.slice(0, -1); renderSlash(); return;
  }
  if (e.key === ' ' && !slashCtx.query) { stop(); const inl = slashCtx.inline; closeSlash(); if (inl) document.execCommand('insertText', false, '/ '); return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    stop();
    slashCtx.query += e.key; slashCtx.sel = 0; renderSlash();
  }
}, true);
function scrollSlashIntoView() {
  const sel = $('#slashmenu .sm-item.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

/* ============================================================
   Pop-over générique
   ============================================================ */
function centerRect() { return { left: innerWidth / 2 - 150, top: innerHeight / 3, bottom: innerHeight / 3 }; }

function showPopover(html, rect, onMount) {
  let pop = $('#popover');
  if (pop._onHide) { const f = pop._onHide; pop._onHide = null; f(); }
  /* 1.21 : les écouteurs posés par les pop-overs précédents (palettes de couleurs surtout) restaient attachés au
     même élément : choisir un surlignage appliquait aussi la couleur de texte choisie plus tôt (texte invisible,
     surtout en thème sombre), colorer une case recolorait les cases choisies avant — même dans d'autres tableaux.
     Chaque ouverture repart d'un élément neuf, sans écouteur. */
  const fresh = pop.cloneNode(false); pop.replaceWith(fresh); pop = fresh;
  pop.innerHTML = html;
  pop.hidden = false;
  pop.style.left = Math.max(12, Math.min(rect.left, innerWidth - 332)) + 'px';
  pop.style.top = '0px';
  // toujours visible : sous l'ancre, sinon au-dessus, sinon calé sur le bas de la fenêtre
  const h = pop.offsetHeight;
  const anchorBottom = rect.bottom != null ? rect.bottom : rect.top;
  const anchorTop = rect.top != null ? rect.top : anchorBottom;
  let top = anchorBottom + 8;
  if (top + h > innerHeight - 12) top = anchorTop - h - 8;
  if (top < 12) top = Math.max(12, Math.min(anchorBottom + 8, innerHeight - 12 - h));
  pop.style.top = top + 'px';
  if (onMount) onMount(pop);
}
function hidePopover() {
  const pop = $('#popover');
  pop.hidden = true; pop.innerHTML = '';
  if (pop._onHide) { const f = pop._onHide; pop._onHide = null; f(); }
}

document.addEventListener('pointerdown', e => {
  if (!$('#popover').hidden && !e.target.closest('#popover')) hidePopover();
  if (slashCtx && !e.target.closest('#slashmenu')) closeSlash(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#popover').hidden) hidePopover();
});

function anchorForBlock(bid) {
  const el = $(`.block[data-id="${bid}"]`);
  return el ? el.getBoundingClientRect() : centerRect();
}

function openGraphChooser(bid) {
  const entries = Object.entries(AlixoGraphs.TYPES);
  showPopover(`<h4>Insérer un graphique</h4>
      <div class="po-label" style="margin-top:0">Graphique de données</div>
      <div class="po-list po-charts">${Object.entries(AlixoCharts.TYPES).map(([k, t]) => `<button data-ck="${k}">${AlixoIcons.svg(t.ico, 'po-ico')}${t.name}</button>`).join('')}</div>
      <div class="po-label">Gabarits économiques</div>
      <div class="po-list">${entries.map(([k, t]) => `<button data-gt="${k}">${t.name}</button>`).join('')}</div>`,
    anchorForBlock(bid), pop => {
      pop.addEventListener('click', e => {
        const ck = e.target.closest('[data-ck]');
        if (ck) {
          hidePopover();
          const spec = Object.assign({ type: 'chart' }, AlixoCharts.defaults(), { ck: ck.dataset.ck });
          const b = getBlock(bid); let nb;
          if (isEmptyPara(b)) { resetBlock(b, spec); touch(); renderBlocks('__none'); nb = b; } else { lastBlockId = bid; nb = insertAfter(bid, Object.assign({ id: uid() }, spec)); }
          selectObj(nb.id); toast('Graphique — « Données… » pour saisir ou coller vos valeurs');
          return;
        }
        const btn = e.target.closest('[data-gt]'); if (!btn) return;
        hidePopover();
        const b = getBlock(bid);
        if (isEmptyPara(b)) {
          resetBlock(b, { type: 'graph', gtype: btn.dataset.gt, params: {} });
          touch(); renderBlocks(b.id);
        } else {
          lastBlockId = bid;
          insertAfter(bid, { id: uid(), type: 'graph', gtype: btn.dataset.gt, params: {} });
        }
        toast('Graphique inséré — les courbes se déplacent au doigt');
      });
    });
}

/* ---------------- référence d'article ---------------- */
const CODES = [
  [/c(?:ode)?\.?\s*civ/i, 'C. civ.', 'Code civil'],
  [/c(?:ode)?\.?\s*p[ée]n/i, 'C. pén.', 'Code pénal'],
  [/c(?:ode)?\.?\s*com/i, 'C. com.', 'Code de commerce'],
  [/c(?:ode)?\.?\s*trav/i, 'C. trav.', 'Code du travail'],
  [/cpc|proc[ée]dure\s*civ/i, 'CPC', 'Code de procédure civile'],
  [/const/i, 'Const.', 'Constitution du 4 octobre 1958'],
  [/conso/i, 'C. conso.', 'Code de la consommation'],
  [/cgi|imp[oô]t/i, 'CGI', 'Code général des impôts']
];

function parseRef(input) {
  const m = input.match(/(\d+[\d\-.]*(?:\s*al\.?\s*\d+(?:er)?)?)/);
  if (!m) return null;
  const num = m[1].trim();
  for (const [re, abbr, full] of CODES) {
    if (re.test(input)) {
      return {
        label: `art. ${num} ${abbr}`,
        full: `article ${num} du ${full}`,
        url: `https://www.legifrance.gouv.fr/search/code?query=${encodeURIComponent('article ' + num + ' ' + full)}`
      };
    }
  }
  return { label: `art. ${num}`, full: `article ${num}`, url: `https://www.legifrance.gouv.fr/search/all?query=${encodeURIComponent('article ' + num)}` };
}

/* insère un fragment HTML à une plage (par le DOM : execCommand('insertHTML') perd les atomes non éditables en fin de ligne
   et ajoute des styles parasites) ; le curseur est placé juste après */
function domInsertHTML(range, html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const frag = tpl.content; const last = frag.lastChild;
  range.deleteContents();
  range.insertNode(frag);
  const r = document.createRange();
  if (last) r.setStartAfter(last); else r.setStart(range.startContainer, range.startOffset);
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
const refChipHTML = ref => `<a class="refart" contenteditable="false" target="_blank" href="${ref.url}" title="${esc(ref.full)} · Ctrl+clic : ouvrir Légifrance · clic : sélectionner (Suppr pour retirer)">${esc(ref.label)}</a>`;
/* insère un fragment HTML (référence, lien…) à l'endroit mémorisé du curseur ; ctx = { field, range } ou null */
function insertHTMLAtCtx(ctx, html, fallbackBid) {
  const field = ctx && ctx.field && ctx.field.isConnected ? ctx.field : null;
  const bl = field && field.closest('.block'); const b = bl && getBlock(bl.dataset.id);
  if (!b) {
    const cur = getBlock(fallbackBid || currentBlockId());
    if (cur && TEXT_TYPES.includes(cur.type)) { cur.text = (cur.text || '') + ' ' + html; touch(); renderBlocks(cur.id); }
    return;
  }
  const host = field.isContentEditable ? field.closest('[contenteditable="true"]') : blocksEl;
  (host || blocksEl).focus({ preventScroll: true });
  const sel = getSelection(); sel.removeAllRanges();
  let ok = false;
  if (ctx.range) { try { sel.addRange(ctx.range); ok = field.contains(ctx.range.startContainer); } catch { ok = false; } }
  if (!ok) { sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(field); r.collapse(false); sel.addRange(r); }
  domInsertHTML(sel.getRangeAt(0), html);
  syncFieldToModel(b, field); touch();
}
/* position du curseur à mémoriser avant d'ouvrir un pop-over d'insertion */
function captureInsertCtx() {
  const af = activeField();
  const field = af && af.tagName !== 'INPUT' && af.matches('.btxt, .jval, .jref, .tcell, .qcite') ? af : null;
  const sel = getSelection();
  return { field, range: field && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
}
function openArticlePopover(bid) {
  const ictx = captureInsertCtx();
  const anchor = ictx.field ? ictx.field.getBoundingClientRect() : anchorForBlock(bid || currentBlockId());
  showPopover(`<h4>Référence d’article</h4>
    <div class="po-row"><input id="po-ref" placeholder="1240 c. civ." spellcheck="false"><button class="pobtn" id="po-ref-ok">Insérer</button></div>
    <div class="po-hint">Saisie rapide : « 1240 c. civ. », « 61-1 const. », « L. 121-1 c. conso »… Codes reconnus : civil, pénal, commerce, travail, procédure civile, Constitution, consommation, CGI.<br>La référence est insérée à l’endroit du curseur, sous forme de bouton vers Légifrance.</div>`,
    anchor, pop => {
      const input = pop.querySelector('#po-ref');
      const ok = () => {
        const ref = parseRef(input.value);
        if (!ref) { toast('Référence non reconnue'); return; }
        hidePopover();
        insertHTMLAtCtx(ictx, refChipHTML(ref) + '&nbsp;', bid);
        toast(ref.full + ' — lien Légifrance');
      };
      pop.querySelector('#po-ref-ok').addEventListener('click', ok);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      setTimeout(() => input.focus(), 40);
    });
}

/* ---------------- liens cliquables (+ QR code à l'impression) ---------------- */
const isWebUrl = s => /^https?:\/\/[^\s<>"']+$/i.test(s || '');
const linkLabelFor = url => { try { const u = new URL(url); const p = u.pathname.replace(/\/+$/, ''); const last = p.split('/').filter(Boolean).pop(); return u.hostname.replace(/^www\./, '') + (last && last.length < 40 ? ' › ' + decodeURIComponent(last).replace(/[-_]+/g, ' ') : ''); } catch { return url; } };
const linkChipHTML = (url, label) => `<a class="lnk" href="${esc(url)}" contenteditable="false" target="_blank" rel="noopener" title="${esc(url)}">${esc(label || linkLabelFor(url))}</a>`;
let linkCtx = null;   // { field, range } : position d'insertion mémorisée pendant le pop-over

/* ouvre le pop-over Lien : nouveau lien (à la position du curseur) ou modification d'un lien existant (el) */
function openLinkPopover({ url = '', label = '', el = null } = {}) {
  const sel = getSelection();
  const af = activeField();
  const field = af && af.classList.contains('btxt') ? af : null;
  if (!el) {
    if (!field) { toast('Placez le curseur dans un paragraphe pour insérer un lien'); return; }
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    if (range && !range.collapsed && !label) label = range.toString().trim();
    linkCtx = { field, range };
  } else { url = el.getAttribute('href') || ''; label = el.textContent; }
  const anchor = el ? el.getBoundingClientRect() : (field ? field.getBoundingClientRect() : centerRect());
  showPopover(`<h4>${el ? 'Modifier le lien' : 'Insérer un lien'}</h4><div class="po-link">
      <div class="po-row"><input id="po-l-url" placeholder="https://…" value="${esc(url)}" spellcheck="false" autocomplete="off"></div>
      <div class="po-row"><input id="po-l-label" placeholder="Intitulé du bouton (ex. Cours du prof, Article Légifrance…)" value="${esc(label)}" autocomplete="off"></div>
      <div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:10px">
        ${el ? `<button class="cta ghost small" id="po-l-rm" type="button">Retirer le lien</button>` : ''}
        <button class="pobtn" id="po-l-ok" type="button">${el ? 'Enregistrer' : 'Insérer'}</button>
      </div>
      <div class="po-hint">Le lien devient un bouton cliquable dans le cours. À l’export PDF, un QR code est ajouté sous le paragraphe pour l’ouvrir depuis un téléphone.</div>
    </div>`,
    anchor, pop => {
      const iu = pop.querySelector('#po-l-url'), il = pop.querySelector('#po-l-label');
      const ok = () => {
        let u = iu.value.trim();
        if (u && !/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
        if (!isWebUrl(u)) { toast('Adresse invalide — elle doit commencer par https://'); iu.focus(); return; }
        const lab = il.value.trim() || linkLabelFor(u);
        hidePopover();
        if (el) {
          el.setAttribute('href', u); el.title = u; el.textContent = lab;
          const bl = el.closest('.block'); const b = bl && getBlock(bl.dataset.id);
          const f = el.closest('.btxt, .jval, .jref, .tcell');
          if (b && f) { syncFieldToModel(b, f); touch(); }
          return;
        }
        insertLinkAtCtx(u, lab);
      };
      pop.querySelector('#po-l-ok').addEventListener('click', ok);
      [iu, il].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
      const rm = pop.querySelector('#po-l-rm');
      if (rm) rm.addEventListener('click', () => {
        hidePopover();
        const bl = el.closest('.block'); const b = bl && getBlock(bl.dataset.id); const f = el.closest('.btxt, .jval, .jref, .tcell');
        el.replaceWith(document.createTextNode(el.textContent));
        if (b && f) { syncFieldToModel(b, f); touch(); }
      });
      setTimeout(() => { (url ? il : iu).focus(); if (url && il.value) il.select(); }, 40);
    });
}
/* écrit le contenu d'un champ dans le modèle du bloc (texte, fiche, case de tableau) */
function syncFieldToModel(b, f) {
  if (f.classList.contains('btxt')) b.text = f.innerHTML;
  else if (f.classList.contains('tcell')) { if (b.rows && b.rows[+f.dataset.r]) b.rows[+f.dataset.r][+f.dataset.c] = f.innerHTML; }
  else if (f.classList.contains('cd-t') || f.classList.contains('cd-x')) { const i = [...f.closest('.cards-grid').children].indexOf(f.closest('.card-item')); b.cards = cardsOf(b); if (b.cards[i]) b.cards[i][f.classList.contains('cd-t') ? 't' : 'x'] = f.innerHTML; }
  else { b.fields = b.fields || {}; b.fields[f.dataset.f] = f.innerHTML; }
}
function insertLinkAtCtx(url, label) {
  const ctx = linkCtx; linkCtx = null;
  const field = ctx && ctx.field && ctx.field.isConnected ? ctx.field : null;
  const bl = field && field.closest('.block'); const b = bl && getBlock(bl.dataset.id);
  if (!b) { const cur = getBlock(currentBlockId()); if (cur && TEXT_TYPES.includes(cur.type)) { cur.text = (cur.text || '') + ' ' + linkChipHTML(url, label) + '&nbsp;'; touch(); renderBlocks(cur.id); } return; }
  blocksEl.focus({ preventScroll: true });
  const sel = getSelection(); sel.removeAllRanges();
  if (ctx.range) { try { sel.addRange(ctx.range); } catch { const r = document.createRange(); r.selectNodeContents(field); r.collapse(false); sel.addRange(r); } }
  else { const r = document.createRange(); r.selectNodeContents(field); r.collapse(false); sel.addRange(r); }
  domInsertHTML(sel.getRangeAt(0), linkChipHTML(url, label) + '&nbsp;');
  syncFieldToModel(b, field); touch();
  // re-rendu pour ajouter le QR code d'impression sous le bloc, curseur conservé
  const s2 = getSelection();
  const off = s2.rangeCount && field.contains(s2.focusNode) ? offsetInField(field, s2.focusNode, s2.focusOffset) : 'end';
  renderBlocks(b.id, off);
  toast('Lien inséré — clic pour l’ouvrir, clic droit pour le modifier');
}
/* clic droit sur un lien → modifier / retirer */
blocksEl.addEventListener('contextmenu', e => {
  const a = e.target.closest('a.lnk'); if (!a) return;
  e.preventDefault();
  openLinkPopover({ el: a });
});
/* QR codes imprimés sous les blocs contenant des liens (visibles uniquement à l'impression) */
const qrCache = new Map();
function qrSvg(url) {
  if (qrCache.has(url)) return qrCache.get(url);
  let svg = '';
  try {
    if (typeof qrcode === 'function') {
      const q = qrcode(0, 'M'); q.addData(url); q.make();
      svg = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    }
  } catch { svg = ''; }
  qrCache.set(url, svg);
  return svg;
}
function blockLinks(b) {
  const htmls = TEXT_TYPES.includes(b.type) ? [b.text || '', b.cite || ''] : isFiche(b) ? Object.values(b.fields || {}) : b.type === 'table' ? (b.rows || []).flat() : [];
  const out = [];
  for (const h of htmls) {
    if (!h || h.indexOf('class="lnk"') < 0) continue;
    const t = document.createElement('div'); t.innerHTML = h;
    t.querySelectorAll('a.lnk').forEach(a => { const u = a.getAttribute('href'); if (u && !out.some(x => x.url === u)) out.push({ url: u, label: a.textContent }); });
  }
  return out;
}
function linkPrintHTML(b) {
  const links = blockLinks(b);
  if (!links.length) return '';
  return `<div class="lnk-print" contenteditable="false">${links.map(l => `<span class="lq">${qrSvg(l.url)}<span><b>${esc(l.label)}</b><span>${esc(l.url)}</span></span></span>`).join('')}</div>`;
}

/* ---------------- calculatrice contextuelle ---------------- */
function safeCalc(expr) {
  let e = expr.replace(/,/g, '.').replace(/\^/g, '**').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
  if (/[^0-9+\-*/().\s]/.test(e.replace(/\*\*/g, ''))) return null;
  try { const v = new Function(`"use strict"; return (${e});`)(); return (typeof v === 'number' && isFinite(v)) ? v : null; } catch { return null; }
}

function openCalculator(bid) {
  const selText = getSelection().toString().trim();
  showPopover(`<h4>Calculatrice</h4>
    <div class="po-row"><input id="po-calc" placeholder="(120 − 100)/100" spellcheck="false" value="${esc(selText)}"></div>
    <div class="po-result" id="po-calc-res"></div>
    <div class="po-row" style="justify-content:flex-end"><button class="pobtn" id="po-calc-ok">Insérer dans la note</button></div>`,
    anchorForBlock(bid || currentBlockId()), pop => {
      const input = pop.querySelector('#po-calc');
      const res = pop.querySelector('#po-calc-res');
      const update = () => {
        const v = safeCalc(input.value);
        res.textContent = v === null ? '' : '= ' + (Math.round(v * 1e6) / 1e6).toLocaleString('fr-FR');
        return v;
      };
      input.addEventListener('input', update);
      update();
      const ok = () => {
        const v = update();
        if (v === null) return;
        hidePopover();
        const target = bid || currentBlockId();
        insertAfter(target, {
          id: uid(), type: 'p',
          text: `${esc(input.value)} <b>= ${(Math.round(v * 1e6) / 1e6).toLocaleString('fr-FR')}</b>`
        });
      };
      pop.querySelector('#po-calc-ok').addEventListener('click', ok);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      setTimeout(() => { input.focus(); }, 40);
    });
}

/* ============================================================
   Palette mathématique
   ============================================================ */
const SYMBOLS = [
  '∂', 'Σ', '∫', '√', '∞', 'Δ',
  'α', 'β', 'γ', 'δ', 'ε', 'λ',
  'μ', 'σ', 'ρ', 'θ', 'π', 'ω',
  '≤', '≥', '≠', '≈', '→', '⇒',
  '±', '×', '·', '∈', '%', '′',
  '∉', '⊂', '∪', '∩', '∀', '∃',
  '≡', '∼', '⇔', '↔', '…', '°'
];
const SYM_SNIPPETS = [
  ['x²', '^2'], ['x₁', '_1'], ['x₁²', '_1^2'], ['a⁄b', '(a)/(b)'], ['√x', 'sqrt(x)'], ['ⁿ√x', 'root(n)(x)'],
  ['Σᵢ', 'sum_(i=1)^n '], ['∫₀', 'int_0^T '], ['lim', 'lim_(x->oo) '], ['𝔼[X]', 'EE[X]'], ['∂/∂x', 'partial/partial x'],
  ['x⃗', 'vec(x)'], ['x̄', 'bar(x)'], ['x̂', 'hat(x)'], ['|x|', 'abs(x)'], ['‖x‖', 'norm(x)'], ['(ⁿₖ)', 'binom(n)(k)'],
  ['[a b; c d]', 'mat(a, b; c, d)'], ['|a b; c d|', 'det(a, b; c, d)'], ['{ … ; …', 'cases(x + y = 2 ; x - y = 0)'],
  ['« texte »', 'text(mot avec espace)'], ['⏎ ligne', ' \\\\ '], ['gras', 'bold(x)'], ['barré', 'cancel(x)'],
  ['ℝ ℕ ℤ', 'RR '], ['∈ ∉', ' in '], ['∀ ∃', 'forall '], ['⊂ ∪ ∩', ' cap ']
];

const FORMULA_LIB = {
  'Microéconomie': [
    ['Cobb-Douglas', 'U(x, y) = x^alpha y^(1-alpha)'],
    ['TMS', 'TMS = (partial U / partial x)/(partial U / partial y)'],
    ['Contrainte budgétaire', 'R = p_x x + p_y y'],
    ['Optimum du consommateur', 'TMS = p_x / p_y'],
    ['Élasticité-prix', 'e_p = (dQ/Q)/(dP/P)'],
    ['Élasticité croisée', 'e_(xy) = (dQ_x/Q_x)/(dP_y/P_y)'],
    ['Coût moyen', 'CM(Q) = CT(Q)/Q'],
    ['Coût marginal', 'Cm(Q) = (dCT)/(dQ)'],
    ['Profit', 'Pi = RT - CT = P Q - CT(Q)'],
    ['Lagrangien', 'L = U(x,y) + lambda (R - p_x x - p_y y)']
  ],
  'Macroéconomie': [
    ['Identité comptable', 'Y = C + I + G + (X - M)'],
    ['Multiplicateur', 'k = 1/(1 - c(1 - t))'],
    ['Courbe IS', 'Y = C(Y - T) + I(i) + G'],
    ['Équilibre monétaire (LM)', 'M/P = L(Y, i)'],
    ['Règle de Taylor', 'i = r + pi + 0.5(pi - pi^(cible)) + 0.5 y'],
    ['Solow (état stationnaire)', 's f(k) = (n + delta) k'],
    ['Phillips', 'pi = pi^e - beta (u - u_n)']
  ],
  'Statistiques': [
    ['Moyenne', 'x = (1/n) sum_(i=1)^n x_i'],
    ['Variance', 'V(X) = EE[(X - EE[X])^2]'],
    ['Écart-type', 'sigma = sqrt(V(X))'],
    ['Covariance', 'Cov(X,Y) = EE[XY] - EE[X] EE[Y]'],
    ['Corrélation', 'rho = Cov(X,Y)/(sigma_X sigma_Y)'],
    ['MCO (pente)', 'beta = Cov(x,y)/V(x)'],
    ['Intervalle de confiance', 'IC = x +- 1.96 sigma/sqrt(n)']
  ],
  'Mathématiques financières': [
    ['Intérêts composés', 'C_n = C_0 (1 + i)^n'],
    ['Actualisation', 'V_0 = (F_n)/((1+i)^n)'],
    ['VAN', 'VAN = -I_0 + sum_(t=1)^n (F_t)/((1+i)^t)'],
    ['Annuités', 'V_0 = a (1 - (1+i)^(-n))/i']
  ],
  'Médecine — calculs cliniques': [
    ['IMC', 'IMC = P/(T^2)'],
    ['Surface corporelle (Mosteller)', 'SC = sqrt((P xx T)/(3600))'],
    ['Clairance (Cockcroft & Gault)', 'Cl = ((140 - age) xx P)/(creat) xx k'],
    ['QT corrigé (Bazett)', 'QTc = (QT)/(sqrt(RR))'],
    ['Pression artérielle moyenne', 'PAM = PAD + (PAS - PAD)/3'],
    ['Trou anionique', 'TA = Na - (Cl + HCO_3)'],
    ['Osmolarité calculée', 'Osm = 2 Na + glyc + uree'],
    ['LDL (Friedewald)', 'LDL = CT - HDL - (TG)/5'],
    ['Natrémie corrigée', 'Na_c = Na + 0.3 (glyc - 5)'],
    ['Calcémie corrigée', 'Ca_c = Ca + 0.02 (40 - alb)'],
    ['Henderson-Hasselbalch', 'pH = 6.1 + log((HCO_3)/(0.03 xx PaCO_2))'],
    ['Volume de distribution', 'V_d = (dose)/(C_0)'],
    ['Demi-vie', 't_(1/2) = (0.693 xx V_d)/(Cl)'],
    ['Dose de charge', 'D_c = C_(cible) xx V_d'],
    ['Débit de perfusion', 'debit = (volume)/(duree)']
  ],
  'Commerce & marketing': [
    ['Marge commerciale', 'M = PV_(HT) - PA_(HT)'],
    ['Taux de marge', 'tau_m = (PV_(HT) - PA_(HT))/(PA_(HT))'],
    ['Taux de marque', 'tau_q = (PV_(HT) - PA_(HT))/(PV_(HT))'],
    ['Coefficient multiplicateur', 'k = (PV_(TTC))/(PA_(HT))'],
    ['Prix TTC', 'PV_(TTC) = PV_(HT) xx (1 + TVA)'],
    ['Seuil de rentabilité', 'SR = (CF)/(TMCV)'],
    ['Taux de marge sur coût variable', 'TMCV = (CA - CV)/(CA)'],
    ['Point mort (jours)', 'PM = (SR)/(CA) xx 360'],
    ['Élasticité-prix', 'e = (Delta Q // Q)/(Delta P // P)'],
    ['Panier moyen', 'PM = (CA)/(N_(ventes))'],
    ['Taux de conversion', 'tau_c = (N_(acheteurs))/(N_(visiteurs))'],
    ['Coût d’acquisition client', 'CAC = (Depenses_(marketing))/(N_(nouveaux clients))'],
    ['Valeur vie client', 'LTV = PM xx f xx D'],
    ['Part de marché', 'PdM = (Ventes_(entreprise))/(Ventes_(marche))']
  ],
  'STAPS — physiologie et entraînement': [
    ['Fréquence cardiaque maximale', 'FC_(max) = 220 - age'],
    ['FC cible (Karvonen)', 'FC_(cible) = FC_(repos) + I xx (FC_(max) - FC_(repos))'],
    ['Réserve cardiaque', 'FC_(reserve) = FC_(max) - FC_(repos)'],
    ['VO₂max estimée (Léger)', 'VO_2max = 3.5 xx VMA'],
    ['Vitesse (m/s → km/h)', 'v_(km//h) = v_(m//s) xx 3.6'],
    ['IMC', 'IMC = P/(T^2)'],
    ['Puissance mécanique', 'P = F xx v'],
    ['Travail', 'W = F xx d'],
    ['Dépense énergétique', 'E = MET xx P xx t'],
    ['Charge d’entraînement (Foster)', 'CE = RPE xx duree'],
    ['Monotonie', 'Mo = (CE_(moy))/(sigma_(CE))'],
    ['Index de fatigue (Wingate)', 'IF = (P_(max) - P_(min))/(P_(max)) xx 100'],
    ['Énergie cinétique', 'E_c = 1/2 m v^2']
  ],
  'Biostatistiques': [
    ['Sensibilité', 'Se = (VP)/(VP + FN)'],
    ['Spécificité', 'Sp = (VN)/(VN + FP)'],
    ['VPP', 'VPP = (VP)/(VP + FP)'],
    ['VPN', 'VPN = (VN)/(VN + FN)'],
    ['Rapport de vraisemblance +', 'RV_+ = (Se)/(1 - Sp)'],
    ['Rapport de vraisemblance −', 'RV_- = (1 - Se)/(Sp)'],
    ['Risque relatif', 'RR = (a/(a+b))/(c/(c+d))'],
    ['Odds ratio', 'OR = (a d)/(b c)'],
    ['Réduction absolue du risque', 'RAR = R_0 - R_1'],
    ['NNT', 'NNT = 1/(RAR)'],
    ['Bayes (post-test)', 'P(M|T+) = (Se xx p)/(Se xx p + (1 - Sp)(1 - p))']
  ]
};

/* ---------------- panneaux de droite (un seul ouvert à la fois) ---------------- */
const RIGHT_PANELS = ['#mathpanel', '#aipanel', '#calcpanel', '#dictpanel', '#calpanel', '#viewpanel', '#timerpanel'];
function syncRightPanelClass() {
  const ve = $('#view-editor');
  const open = RIGHT_PANELS.find(s => !$(s).hidden);
  ve.classList.toggle('math-open', !!open && open !== '#calcpanel' && open !== '#viewpanel');
  ve.classList.toggle('calc-open', open === '#calcpanel');
  ve.classList.toggle('view-open', open === '#viewpanel');
}
/* garde le même passage à l'écran quand la largeur de la feuille change (ouverture / fermeture d'un volet :
   la feuille se rétrécit, le texte se réorganise et le cours « remontait » légèrement) */
function withScrollAnchor(fn) {
  const w = $('#docwrap');
  if (!w || !currentDocId || $('#view-editor').hidden) { fn(); return; }
  const limit = editorTopInset();
  const els = $$('#blocks > .block').filter(el => el.offsetParent !== null);
  const anchor = els.find(el => el.getBoundingClientRect().bottom > limit) || null;
  const before = anchor ? anchor.getBoundingClientRect().top : 0;
  w.classList.add('no-anim');
  fn();
  void w.offsetHeight;   // applique la nouvelle mise en page tout de suite (sans la transition de marge)
  if (anchor) {
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 0.5) w.scrollTo({ top: Math.max(0, w.scrollTop + delta), behavior: 'instant' });
  }
  requestAnimationFrame(() => w.classList.remove('no-anim'));
}
function openRightPanel(sel) {
  withScrollAnchor(() => { RIGHT_PANELS.forEach(s => { $(s).hidden = s !== sel; }); syncRightPanelClass(); });
}
function closeRightPanels() {
  withScrollAnchor(() => { RIGHT_PANELS.forEach(s => { $(s).hidden = true; }); syncRightPanelClass(); });
}
function openMathPanel(tab = 'sym') {
  openRightPanel('#mathpanel');
  $$('.mp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderMathPanel(tab);
}
$('#mp-close').addEventListener('click', closeRightPanels);
$('#ai-close').addEventListener('click', closeRightPanels);
$('#calc-close').addEventListener('click', closeRightPanels);
$('#dict-close').addEventListener('click', closeRightPanels);
$('#cal-close').addEventListener('click', closeRightPanels);
$('#timer-close').addEventListener('click', closeRightPanels);
$('#vw-close').addEventListener('click', () => { const d = doc(); if (d && d.vwOpen) { d.vwOpen = false; save(); } closeRightPanels(); });

/* ============================================================
   Dictionnaire : toutes les définitions écrites dans les cours
   (encadrés « Définition » et paragraphes « <b>Notion</b> — … »)
   ============================================================ */
function dictionaryEntries() {
  const out = [];
  for (const d of state.docs) {
    for (const b of allPageBlocks(d, false)) {
      if (!TEXT_TYPES.includes(b.type) || !b.text) continue;
      const isDef = b.type === 'callout' && b.ct === 'definition';
      const m = b.text.match(/^\s*<b>([^<]{2,80})<\/b>\s*(?:[—–:\-]\s*)?/);
      if (!isDef && !m) continue;
      let term = m ? m[1].trim() : '';
      let def = m ? stripTags(b.text.slice(m[0].length)) : stripTags(b.text);
      if (!term) { const t = stripTags(b.text); const cut = t.match(/^([^—:–]{2,60})\s*[—:–]\s*(.*)$/); if (cut) { term = cut[1].trim(); def = cut[2]; } else { term = t.slice(0, 50); def = t.slice(50); } }
      term = term.replace(/\s+$/, '').replace(/[—:–\-]+$/, '').trim();
      if (!term) continue;
      out.push({ term, def: def.trim(), d, b });
    }
  }
  return out.sort((a, b) => a.term.localeCompare(b.term, 'fr', { sensitivity: 'base' }));
}
function openDictPanel() {
  openRightPanel('#dictpanel');
  renderDict();
  setTimeout(() => $('#dict-input').focus(), 40);
}
function renderDict() {
  const q = norm($('#dict-input').value.trim());
  const all = dictionaryEntries();
  const list = q ? all.filter(e => norm(e.term).includes(q) || norm(e.def).includes(q) || norm(e.d.titre).includes(q)) : all;
  const body = $('#dict-body');
  /* abréviations médicales (mode Santé) : affichées quand la recherche en touche une */
  let abbrHTML = '';
  if (healthMode() && q) {
    const hits = Object.entries(AlixoMed.ABBR).filter(([k, v]) => norm(k).includes(q) || norm(v).includes(q)).slice(0, 12);
    if (hits.length) abbrHTML = `<div class="dict-count">Abréviations médicales</div>` + hits.map(([k, v]) => `<div class="dict-abbr"><b>${esc(k.replace(/\d$/, ''))}</b><span>${esc(v)}</span></div>`).join('');
  } else if (healthMode() && !all.length) abbrHTML = `<div class="dict-empty">Tapez une abréviation médicale (BPCO, SCA, ECBU…) pour voir sa signification.</div>`;
  if (!all.length) { body.innerHTML = abbrHTML + `<div class="dict-empty">Aucune définition pour l’instant. Insérez un encadré <b>Définition</b> (menu « / ») ou commencez un paragraphe par la notion en gras suivie d’un tiret : le dictionnaire se remplit tout seul.</div>`; return; }
  if (!list.length) { body.innerHTML = abbrHTML + `<div class="dict-empty">Aucune notion ne correspond à « ${esc($('#dict-input').value)} ».</div>`; return; }
  const hl = s => { const t = esc(s); if (!q) return t; const re = new RegExp('(' + $('#dict-input').value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'); return t.replace(re, '<mark>$1</mark>'); };
  body.innerHTML = abbrHTML + `<div class="dict-count">${list.length} notion${list.length > 1 ? 's' : ''}${q ? ' trouvée' + (list.length > 1 ? 's' : '') : ''}</div>` +
    list.map((e, i) => `<button class="dict-item" data-doc="${e.d.id}" data-block="${e.b.id}" type="button">
      <div class="dict-term">${hl(e.term)}</div>
      <div class="dict-def">${hl(e.def) || '<i>(définition vide)</i>'}</div>
      <div class="dict-src"><span class="mat-chip" style="--mc:${folderTint(e.d.folderId)}">${esc(folder(e.d.folderId)?.nom || 'Mes cours')}</span><span>${esc(e.d.titre || 'Sans titre')}</span></div>
    </button>`).join('');
}
$('#dict-input').addEventListener('input', renderDict);
$('#dict-input').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; renderDict(); } });
$('#dict-body').addEventListener('click', e => {
  const it = e.target.closest('.dict-item'); if (!it) return;
  const { doc: did, block: bid } = it.dataset;
  const go = () => {
    const el = $(`.block[data-id="${bid}"]`);
    if (el) { scrollToBlockEl(el, { smooth: false, margin: 40 }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  };
  if (did !== currentDocId) { openDoc(did); openRightPanel('#dictpanel'); setTimeout(go, 60); } else go();
});

/* ============================================================
   Agenda : cours et événements, avec l'événement en cours affiché
   dans la barre supérieure (temps restant)
   ============================================================ */
const EV_COLORS = ['#33658a', '#8c4351', '#2f7d68', '#b3762a', '#3d6bb5', '#7a6852', '#a8556f', '#6b6b6b'];
let calWeekStart = null;   // lundi de la semaine affichée
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const parseYmd = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const minutesOf = hm => { const [h, m] = (hm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
/* « 8h30 », « 8:30 », « 08.30 », « 830 », « 14 » → minutes depuis minuit, ou null */
function parseTime(s) {
  const t = String(s || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let m = t.match(/^(\d{1,2})(?:[:h.,](\d{0,2}))?h?$/);
  if (!m) { m = t.match(/^(\d{1,2})(\d{2})$/); if (!m) return null; }
  const h = +m[1], mi = m[2] ? +(m[2].length === 1 ? m[2] + '0' : m[2]) : 0;
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
const fmtTime = m => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
function events() { if (!Array.isArray(state.events)) state.events = []; return state.events; }
/* occurrences d'un événement entre deux dates (répétition hebdomadaire possible) */
function occurrences(ev, from, to) {
  const out = [];
  const first = parseYmd(ev.date);
  const until = ev.repeat === 'weekly' ? (ev.until ? parseYmd(ev.until) : new Date(first.getFullYear() + 1, first.getMonth(), first.getDate())) : first;
  for (let d = new Date(first); d <= until && d <= to; d.setDate(d.getDate() + (ev.repeat === 'weekly' ? 7 : 1))) {
    if (d >= from) {
      const s = new Date(d); s.setHours(0, minutesOf(ev.start), 0, 0);
      const e = new Date(d); e.setHours(0, Math.max(minutesOf(ev.end), minutesOf(ev.start) + 5), 0, 0);
      out.push({ ev, start: s, end: e, key: ymd(d) });
    }
    if (ev.repeat !== 'weekly') break;
  }
  return out;
}
function occurrencesOn(day) {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(from); to.setHours(23, 59, 59, 999);
  return events().flatMap(ev => occurrences(ev, from, to)).sort((a, b) => a.start - b.start);
}
/* événement en cours, sinon le prochain aujourd'hui */
function calStatus(now = new Date()) {
  const occ = occurrencesOn(now);
  const cur = occ.find(o => o.start <= now && now < o.end);
  if (cur) return { kind: 'now', o: cur, left: Math.ceil((cur.end - now) / 60000) };
  const next = occ.find(o => o.start > now);
  if (next) return { kind: 'next', o: next, in: Math.ceil((next.start - now) / 60000) };
  return null;
}
const fmtLeft = m => m >= 60 ? `${Math.floor(m / 60)} h ${pad2(m % 60)}` : `${m} min`;
function renderCalNow() {
  const el = $('#cal-now'); if (!el) return;
  const st = calStatus();
  renderAgendaNav();
  if (!st) { el.hidden = true; el.className = 'cal-now'; return; }
  el.hidden = false;
  const title = st.o.ev.title || 'Événement';
  if (st.kind === 'now') { el.className = 'cal-now live'; el.innerHTML = `<span>${esc(title)}</span><span class="cn-left">· reste ${fmtLeft(st.left)}</span>`; el.title = `En cours jusqu’à ${pad2(st.o.end.getHours())}:${pad2(st.o.end.getMinutes())} — cliquer pour l’agenda`; }
  else { el.className = 'cal-now'; el.innerHTML = `<span class="cn-left">Prochain</span><span>${pad2(st.o.start.getHours())}:${pad2(st.o.start.getMinutes())} ${esc(title)}</span><span class="cn-left">· dans ${fmtLeft(st.in)}</span>`; el.title = 'Prochain événement aujourd’hui — cliquer pour l’agenda'; }
}
setInterval(renderCalNow, 30000);
$('#cal-now').addEventListener('click', () => { if (currentDocId) openCalPanel(); else openAgendaHome(); });

function openCalPanel(weekOf) {
  calWeekStart = mondayOf(weekOf || calWeekStart || new Date());
  openRightPanel('#calpanel');
  renderCal();
}
function renderCal() {
  const body = $('#cal-body'); if (!calWeekStart) calWeekStart = mondayOf(new Date());
  const now = new Date(), today = ymd(now);
  const end = new Date(calWeekStart); end.setDate(end.getDate() + 6);
  const fmt = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  let html = `<div class="cal-nav"><button data-cal="prev" title="Semaine précédente">‹</button><span class="cal-range">${esc(fmt(calWeekStart))} – ${esc(fmt(end))} ${end.getFullYear()}</span><button data-cal="next" title="Semaine suivante">›</button><button class="cal-today" data-cal="today">Aujourd’hui</button></div>`;
  for (let i = 0; i < 7; i++) {
    const day = new Date(calWeekStart); day.setDate(day.getDate() + i);
    const key = ymd(day);
    const occ = occurrencesOn(day);
    if (!occ.length && key !== today) continue;
    html += `<div class="cal-day"><div class="cal-dayhead ${key === today ? 'today' : ''}"><span class="cal-dnum">${day.getDate()}</span>${esc(day.toLocaleDateString('fr-FR', { weekday: 'long' }))}${key === today ? ' · aujourd’hui' : ''}</div>`;
    if (!occ.length) html += `<div class="cal-empty">Rien de prévu.</div>`;
    for (const o of occ) {
      const isNow = o.start <= now && now < o.end, past = o.end < now;
      html += calEvHTML(o, now);
    }
    html += `</div>`;
  }
  if (!events().length) html += `<div class="dict-empty">Ajoutez vos cours et rendez-vous avec « ＋ Événement ». L’événement en cours et le temps restant s’affichent en haut de l’écran, dans tous les cours.</div>`;
  body.innerHTML = html;
}
$('#cal-body').addEventListener('click', e => {
  const nav = e.target.closest('[data-cal]');
  if (nav) { if (nav.dataset.cal === 'today') calWeekStart = mondayOf(new Date()); else calWeekStart.setDate(calWeekStart.getDate() + (nav.dataset.cal === 'next' ? 7 : -7)); renderCal(); return; }
  const of = e.target.closest('[data-openfolder]'); if (of) { libMode = 'docs'; showLibrary(); gotoFolder(of.dataset.openfolder); return; }
  const nd = e.target.closest('[data-newdoc]'); if (nd) { createDocIn(nd.dataset.newdoc); return; }
  const ed = e.target.closest('[data-edit]'); if (ed) { openEventPopover(events().find(x => x.id === ed.dataset.edit)); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    const ev = events().find(x => x.id === del.dataset.del); if (!ev) return;
    state.events = events().filter(x => x !== ev); saveEvents();
    toast(`« ${ev.title} » supprimé`, { action: 'Annuler', onAction: () => { events().push(ev); saveEvents(); } });
  }
});
$('#cal-add').addEventListener('click', () => openEventPopover(null));
function saveEvents() { save(); renderCal(); renderCalNow(); if (!currentDocId && libMode === 'agenda') renderAgendaHome(); }
/* dossier (cours) lié à un événement — les anciens événements liés à une séance retrouvent son dossier */
function eventFolderId(ev) {
  if (!ev) return '';
  if (ev.folderId && folder(ev.folderId)) return ev.folderId;
  if (ev.docId) { const d = state.docs.find(x => x.id === ev.docId); if (d && d.folderId && folder(d.folderId)) return d.folderId; }
  return '';
}
function folderChoices() {
  return state.folders.map(f => ({ id: f.id, path: folderPath(f.id).map(x => x.nom).join(' › '), couleur: f.couleur }))
    .sort((a, b) => a.path.localeCompare(b.path, 'fr'));
}
/* sélecteur de dossier maison (liste déroulante dans le pop-over, avec recherche). Remplace le <select> natif,
   dont la liste ne s'ouvrait pas toujours dans la fenêtre de l'application. L'élément porte `.value`
   et émet « change », comme un <select>. */
function folderPickerHTML(id, value) {
  const list = folderChoices();
  const cur = list.find(f => f.id === value);
  return `<div class="fpick" id="${id}" data-value="${esc(cur ? cur.id : '')}">
    <button type="button" class="fpick-btn" aria-haspopup="listbox" aria-expanded="false"><span class="fpick-dot" style="background:${esc(cur && cur.couleur ? cur.couleur : 'transparent')}"></span><span class="fpick-lab">${esc(cur ? cur.path : '— aucun —')}</span><span class="fpick-caret">▾</span></button>
    <div class="fpick-list" hidden>
      ${list.length > 7 ? '<input class="fpick-q" placeholder="Rechercher un dossier…" autocomplete="off" spellcheck="false">' : ''}
      <div class="fpick-items" role="listbox"><button type="button" data-v="" class="${cur ? '' : 'sel'}"><span class="fpick-dot"></span>— aucun —</button>${list.map(f => `<button type="button" data-v="${f.id}" class="${cur && f.id === cur.id ? 'sel' : ''}" title="${esc(f.path)}"><span class="fpick-dot" style="background:${esc(f.couleur || 'transparent')}"></span>${esc(f.path)}</button>`).join('')}
      ${list.length ? '' : '<div class="po-hint" style="margin:4px 6px">Aucun dossier pour l’instant : créez-en un dans la bibliothèque.</div>'}</div>
    </div></div>`;
}
function mountFolderPicker(el) {
  if (!el) return;
  el.value = el.dataset.value || '';
  const btn = el.querySelector('.fpick-btn'), box = el.querySelector('.fpick-list'), q = el.querySelector('.fpick-q');
  const items = () => [...el.querySelectorAll('.fpick-items button')].filter(b => !b.hidden);
  const filter = () => { const n = norm(q ? q.value : ''); el.querySelectorAll('.fpick-items button').forEach(b => { b.hidden = !!n && !!b.dataset.v && !norm(b.textContent).includes(n); }); };
  const setOpen = open => {
    box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); el.classList.toggle('open', open);
    if (!open) return;
    if (q) { q.value = ''; filter(); setTimeout(() => q.focus(), 0); }
    const sel = el.querySelector('.fpick-items .sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
    // le pop-over grandit : il reste dans la fenêtre
    const pop = el.closest('#popover');
    if (pop) { const r = pop.getBoundingClientRect(); if (r.bottom > innerHeight - 12) pop.style.top = Math.max(12, innerHeight - 12 - r.height) + 'px'; }
  };
  const pick = b => {
    el.value = b.dataset.v || ''; el.dataset.value = el.value;
    el.querySelectorAll('.fpick-items button').forEach(x => x.classList.toggle('sel', x === b));
    const f = folder(el.value);
    el.querySelector('.fpick-lab').textContent = f ? folderPath(f.id).map(x => x.nom).join(' › ') : '— aucun —';
    el.querySelector('.fpick-btn .fpick-dot').style.background = f && f.couleur ? f.couleur : 'transparent';
    setOpen(false); btn.focus();
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  btn.addEventListener('click', () => setOpen(box.hidden));
  el.querySelector('.fpick-items').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) pick(b); });
  if (q) q.addEventListener('input', filter);
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !box.hidden) { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    if (box.hidden) { if (e.key !== 'Enter') { e.preventDefault(); setOpen(true); } return; }
    const list = items(); if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    if (e.key === 'Enter') { if (e.target === q) { e.preventDefault(); e.stopPropagation(); pick(list.find(b => b.dataset.v) || list[0]); } return; }
    e.preventDefault();
    i = e.key === 'ArrowDown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
    list[i].focus();
  });
  el.addEventListener('focusout', () => setTimeout(() => { if (!el.contains(document.activeElement)) setOpen(false); }, 0));
}
/* une occurrence (vue semaine et volet du jour) */
function calEvHTML(o, now) {
  const isNow = o.start <= now && now < o.end, past = o.end < now;
  const f = folder(eventFolderId(o.ev));
  const hm = d => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const dur = Math.round((o.end - o.start) / 60000);
  const soon = !isNow && !past && (o.start - now) < 3600000 ? `dans ${fmtLeft(Math.ceil((o.start - now) / 60000))}` : '';
  return `<div class="cal-ev ${isNow ? 'now' : ''} ${past ? 'past' : ''}" style="--ec:${esc(o.ev.color || EV_COLORS[0])}">
    <div class="cal-top"><span class="cal-time">${hm(o.start)} – ${hm(o.end)}</span>${isNow ? `<span class="cal-live">En cours · reste ${fmtLeft(Math.ceil((o.end - now) / 60000))}</span>` : soon ? `<span class="cal-chip">${esc(soon)}</span>` : `<span class="cal-chip">${fmtLeft(dur)}</span>`}
      <div class="cal-acts"><button data-edit="${o.ev.id}" title="Modifier">✎</button><button data-del="${o.ev.id}" class="del" title="Supprimer">✕</button></div></div>
    <div class="cal-main"><div class="cal-title">${esc(o.ev.title || 'Événement')}</div>
      <div class="cal-sub">${o.ev.lieu ? `<span class="cal-chip"><svg viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10Z"/><circle cx="12" cy="11" r="2"/></svg>${esc(o.ev.lieu)}</span>` : ''}${o.ev.repeat === 'weekly' ? '<span class="cal-chip"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 8M20 4v4h-4M20 12a8 8 0 0 1-14 5.3L4 16M4 20v-4h4"/></svg>chaque semaine</span>' : ''}${f ? `<button data-openfolder="${f.id}" type="button" title="Ouvrir ce cours dans la bibliothèque">${esc(f.nom)}</button><button data-newdoc="${f.id}" class="cal-new" type="button" title="Nouvelle séance dans ce cours">＋ séance</button>` : ''}</div></div></div>`;
}

/* ---------------- agenda : vue mois dans la bibliothèque (inspirée du Calendrier Apple) ---------------- */
let libMode = 'docs';      // 'docs' | 'agenda'
let agMonth = null;        // premier jour du mois affiché
let agSelDay = null;       // jour sélectionné (aaaa-mm-jj)
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
function openAgendaHome(day) {
  const d = day || (agSelDay ? parseYmd(agSelDay) : new Date());
  libMode = 'agenda';
  agMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  agSelDay = ymd(d);
  if (currentDocId) showLibrary(); else renderLibrary();
}
function renderAgendaNav() {
  const b = $('#ln-agenda'); if (!b) return;
  const now = new Date();
  b.classList.toggle('active', libMode === 'agenda' && !currentDocId);
  const st = calStatus(now);
  b.innerHTML = `<span class="ln-cal"><b>${esc(now.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''))}</b><span>${now.getDate()}</span></span><span>Agenda</span>${st ? `<span class="ln-next ${st.kind === 'now' ? 'live' : ''}" title="${esc(st.o.ev.title)}">${st.kind === 'now' ? 'en cours' : pad2(st.o.start.getHours()) + ':' + pad2(st.o.start.getMinutes())}</span>` : ''}`;
}
function renderAgendaHome() {
  const root = $('#lib-agenda'); if (!root) return;
  const now = new Date(), today = ymd(now);
  if (!agMonth) agMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!agSelDay) agSelDay = today;
  const gridStart = mondayOf(agMonth);
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 42); gridEnd.setMilliseconds(-1);
  const byDay = {};
  events().flatMap(ev => occurrences(ev, gridStart, gridEnd)).forEach(o => { (byDay[o.key] = byDay[o.key] || []).push(o); });
  Object.values(byDay).forEach(l => l.sort((a, b) => a.start - b.start));
  const daysInMonth = new Date(agMonth.getFullYear(), agMonth.getMonth() + 1, 0).getDate();
  const nWeeks = Math.ceil((daysInMonth + ((agMonth.getDay() + 6) % 7)) / 7);
  const hm = d => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const chip = o => {
    const isNow = o.start <= now && now < o.end, past = o.end < now;
    return `<button class="ag-ev ${isNow ? 'now' : ''} ${past ? 'past' : ''}" data-ev="${o.ev.id}" type="button" style="--ec:${esc(o.ev.color || EV_COLORS[0])}" title="${esc(o.ev.title)} · ${hm(o.start)}–${hm(o.end)}${o.ev.lieu ? ' · ' + esc(o.ev.lieu) : ''}"><span class="ag-dot"></span><span class="ag-t">${hm(o.start)}</span><span class="ag-title">${esc(o.ev.title || 'Événement')}</span></button>`;
  };
  let cells = '';
  for (let i = 0; i < nWeeks * 7; i++) {
    const day = new Date(gridStart); day.setDate(day.getDate() + i);
    const key = ymd(day), occ = byDay[key] || [];
    const cls = ['ag-cell', day.getMonth() !== agMonth.getMonth() ? 'other' : '', key === today ? 'today' : '', key === agSelDay ? 'sel' : '', (day.getDay() === 0 || day.getDay() === 6) ? 'we' : ''].filter(Boolean).join(' ');
    const max = nWeeks >= 6 ? 2 : 3;
    cells += `<div class="${cls}" data-day="${key}"><div class="ag-dnum">${day.getDate()}</div>${occ.slice(0, max).map(chip).join('')}${occ.length > max ? `<div class="ag-more">+ ${occ.length - max}</div>` : ''}</div>`;
  }
  const dows = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(d => `<div class="ag-dow">${d}</div>`).join('');
  const sd = parseYmd(agSelDay);
  const sOcc = occurrencesOn(sd);
  const upFrom = new Date(sd); upFrom.setDate(upFrom.getDate() + 1);
  const upTo = new Date(sd); upTo.setDate(upTo.getDate() + 30);
  const up = events().flatMap(ev => occurrences(ev, upFrom, upTo)).sort((a, b) => a.start - b.start).slice(0, 6);
  root.innerHTML = `<div class="ag-head"><div class="ag-month">${cap(MONTHS_FR[agMonth.getMonth()])} <b>${agMonth.getFullYear()}</b></div>
      <div class="ag-nav"><button data-ag="prev" title="Mois précédent">‹</button><button data-ag="today">Aujourd’hui</button><button data-ag="next" title="Mois suivant">›</button></div>
      <button class="cta" data-ag="add" type="button">＋ Événement</button></div>
    <div class="ag-body"><div class="ag-grid">${dows}${cells}</div>
      <aside class="ag-side"><div class="ag-sdate ${agSelDay === today ? 'today' : ''}">${esc(sd.toLocaleDateString('fr-FR', { weekday: 'long' }))}${agSelDay === today ? ' · aujourd’hui' : ''}<b>${sd.getDate()} ${MONTHS_FR[sd.getMonth()]}${sd.getFullYear() !== now.getFullYear() ? ' ' + sd.getFullYear() : ''}</b></div>
        ${sOcc.length ? sOcc.map(o => calEvHTML(o, now)).join('') : `<div class="cal-empty">Rien de prévu ce jour.</div>`}
        <button class="cta ghost small ag-add" data-ag="add" type="button">＋ Événement ce jour</button>
        ${up.length ? `<div class="ag-stitle">À venir</div>` + up.map(o => `<div class="ag-up" data-goday="${o.key}" style="--ec:${esc(o.ev.color || EV_COLORS[0])}"><span class="ag-ud">${esc(o.start.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }))}</span><span class="ag-dot"></span><span>${hm(o.start)} ${esc(o.ev.title)}</span></div>`).join('') : ''}
        ${!events().length ? `<div class="dict-empty" style="margin-top:12px">Ajoutez vos cours avec « ＋ Événement » (répétition chaque semaine possible, cours lié). Double-clic sur un jour pour y ajouter un événement. L’événement en cours et le temps restant s’affichent en haut de l’écran, dans tous les cours.</div>` : ''}
      </aside></div>`;
}
$('#lib-agenda').addEventListener('click', e => {
  const nav = e.target.closest('[data-ag]');
  if (nav) {
    const k = nav.dataset.ag;
    if (k === 'prev' || k === 'next') { agMonth = new Date(agMonth.getFullYear(), agMonth.getMonth() + (k === 'next' ? 1 : -1), 1); renderAgendaHome(); }
    else if (k === 'today') { const n = new Date(); agMonth = new Date(n.getFullYear(), n.getMonth(), 1); agSelDay = ymd(n); renderAgendaHome(); }
    else if (k === 'add') openEventPopover(null, { date: agSelDay });
    return;
  }
  const ch = e.target.closest('[data-ev]'); if (ch) { const ev = events().find(x => x.id === ch.dataset.ev); if (ev) openEventPopover(ev); return; }
  const of = e.target.closest('[data-openfolder]'); if (of) { gotoFolder(of.dataset.openfolder); return; }
  const nd = e.target.closest('[data-newdoc]'); if (nd) { createDocIn(nd.dataset.newdoc); return; }
  const ed = e.target.closest('[data-edit]'); if (ed) { openEventPopover(events().find(x => x.id === ed.dataset.edit)); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    const ev = events().find(x => x.id === del.dataset.del); if (!ev) return;
    state.events = events().filter(x => x !== ev); saveEvents();
    toast(`« ${ev.title} » supprimé`, { action: 'Annuler', onAction: () => { events().push(ev); saveEvents(); } });
    return;
  }
  const gd = e.target.closest('[data-goday]');
  if (gd) { agSelDay = gd.dataset.goday; const d = parseYmd(agSelDay); agMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderAgendaHome(); return; }
  const cell = e.target.closest('.ag-cell');
  if (cell) { agSelDay = cell.dataset.day; if (cell.classList.contains('other')) { const d = parseYmd(agSelDay); agMonth = new Date(d.getFullYear(), d.getMonth(), 1); } renderAgendaHome(); }
});
$('#lib-agenda').addEventListener('dblclick', e => {
  const cell = e.target.closest('.ag-cell'); if (!cell || e.target.closest('.ag-ev')) return;
  openEventPopover(null, { date: cell.dataset.day });
});
$('#ln-agenda').addEventListener('click', () => openAgendaHome());
function openSharedHome() { libMode = 'shared'; if (currentDocId) showLibrary(); else renderLibrary(); }
function openTodoHome() { if (!requirePlus('taches')) return; libMode = 'todo'; if (currentDocId) showLibrary(); else renderLibrary(); }
const lnTodo = $('#ln-todo'); if (lnTodo) lnTodo.addEventListener('click', openTodoHome);
$('#ln-shared').addEventListener('click', openSharedHome);
/* partager une séance, un dossier ou un événement (propriétaire) */
function openShare(kind, id) {
  if (!window.AlixoShare || !AlixoShare.enabled) { toast('Alixo Share nécessite un compte : Paramètres › Compte › Se connecter'); return; }
  AlixoShare.openShareFor(kind, id);
}
$('#btn-share').addEventListener('click', () => {
  if (!currentDocId) return;
  if (isSharedDoc(currentDocId)) AlixoShare.openInfo(currentDocId); else openShare('doc', currentDocId);
});
/* fiche d'événement (1.16) : grande fenêtre centrale, même présentation que les Paramètres ;
   formulaire à gauche, aperçu en direct et couleur à droite */
function openEventPopover(ev, preset) {
  const isNew = !ev;
  const now = new Date();
  const curDoc = doc();
  const defFolder = (preset && preset.folderId) || (curDoc ? (curDoc.folderId || '') : (currentFolderId || ''));
  const defF = folder(defFolder);
  const v = Object.assign({ title: isNew && defF ? defF.nom : '', date: ymd(now), start: pad2(Math.min(22, now.getHours() + 1)) + ':00', end: pad2(Math.min(23, now.getHours() + 2)) + ':00', folderId: defFolder || '', repeat: '', until: '', color: (defF && defF.couleur) || EV_COLORS[0], lieu: '' }, ev || {}, preset || {});
  const vFolder = eventFolderId(v);
  const shared = !!(ev && ev.shared);
  const swatches = (color, fc) => (fc && !EV_COLORS.includes(fc) ? `<button data-c="${fc}" class="fcol ${fc === color ? 'sel' : ''}" style="background:${fc}" type="button" title="Couleur du cours"></button>` : '') +
    EV_COLORS.map(c => `<button data-c="${c}" class="${c === color ? 'sel' : ''}" style="background:${c}" type="button"></button>`).join('');
  const timeOpts = (() => { let s = ''; for (let m = 6 * 60; m < 24 * 60; m += 15) s += `<option value="${pad2(Math.floor(m / 60))}:${pad2(m % 60)}">`; return s; })();
  const dayLabel = d => { const x = parseYmd(d); return x && !isNaN(x) ? x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'; };
  const foot = shared
    ? `<button class="cta ghost" id="ev-leave" type="button">Retirer de mon agenda</button><button class="cta" type="button" data-dlg-close>Fermer</button>`
    : `${isNew ? '' : '<button class="cta ghost ev-danger" id="ev-del" type="button">Supprimer</button><button class="cta ghost" id="ev-share" type="button" title="Partager cet événement : les membres le reçoivent dans leur agenda">Partager…</button>'}<span class="dlg-spacer"></span><button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" id="ev-ok" type="button">${isNew ? 'Ajouter à l’agenda' : 'Enregistrer'}</button>`;
  openDialog({
    id: 'evov', cls: 'ev-dlg', eyebrow: 'Agenda',
    title: isNew ? 'Nouvel événement' : 'Modifier l’événement',
    sub: shared ? `Événement partagé par ${esc(ev.ownerName || 'un membre')} : il suit les modifications du propriétaire et ne se modifie pas ici.` : 'Cours, TD, examen, rendez-vous… L’événement en cours et le temps restant s’affichent en haut de l’écran, dans tous les cours.',
    body: `<div class="ev-form po-cal">
      <div class="ev-main">
        <label class="ev-field"><span>Titre</span><input id="ev-title" class="ev-titlein" placeholder="Ex. Droit des obligations — amphi B" value="${esc(v.title)}" autocomplete="off"></label>
        <div class="ev-grid3">
          <label class="ev-field"><span>Date</span><input id="ev-date" type="date" value="${esc(v.date)}"></label>
          <label class="ev-field"><span>Début</span><input id="ev-start" class="ev-time" inputmode="numeric" placeholder="08:00" maxlength="5" autocomplete="off" list="ev-times" value="${esc(v.start)}" title="Heure de début (hh:mm) — ↑ ↓ pour changer par quart d’heure"></label>
          <label class="ev-field"><span>Fin</span><input id="ev-end" class="ev-time" inputmode="numeric" placeholder="10:00" maxlength="5" autocomplete="off" list="ev-times" value="${esc(v.end)}" title="Heure de fin (hh:mm) — ↑ ↓ pour changer par quart d’heure"></label>
          <datalist id="ev-times">${timeOpts}</datalist>
        </div>
        <div class="ev-grid2">
          <label class="ev-check"><input id="ev-weekly" type="checkbox" ${v.repeat === 'weekly' ? 'checked' : ''}> <span><b>Chaque semaine</b><small>Même jour, même heure, jusqu’à la date de fin</small></span></label>
          <label class="ev-field"><span>Jusqu’au</span><input id="ev-until" type="date" value="${esc(v.until || '')}" ${v.repeat === 'weekly' ? '' : 'disabled'}></label>
        </div>
        <div class="ev-field"><span>Cours lié (dossier, facultatif)</span>${folderPickerHTML('ev-folder', vFolder)}<small class="ev-help">Le titre et la couleur reprennent ceux du dossier ; « ＋ séance » depuis l’agenda crée la séance dans ce cours.</small></div>
        <label class="ev-field"><span>Lieu (facultatif)</span><input id="ev-lieu" placeholder="Amphi, salle, bâtiment…" value="${esc(v.lieu || '')}" autocomplete="off"></label>
      </div>
      <aside class="ev-side">
        <div class="po-label" style="margin-top:0">Aperçu</div>
        <div class="ev-preview" id="ev-preview" style="--ec:${esc(v.color || EV_COLORS[0])}">
          <div class="ev-pday" id="ev-pday">${esc(dayLabel(v.date))}</div>
          <div class="ev-pcard"><span class="ev-pbar"></span><div><b id="ev-ptitle">${esc(v.title || 'Événement')}</b><span id="ev-ptime">${esc(v.start)}–${esc(v.end)}</span><span id="ev-pplace">${esc(v.lieu || '')}</span></div></div>
        </div>
        <div class="po-label">Couleur</div>
        <div class="po-colors ev-colors" id="ev-colors">${swatches(v.color || EV_COLORS[0], (folder(vFolder) || {}).couleur)}</div>
        ${shared ? '' : '<div class="po-hint">Raccourcis : Entrée pour valider, Échap pour fermer, ↑ ↓ sur les heures pour avancer par quart d’heure, Maj + ↑ ↓ par heure.</div>'}
      </aside>
    </div>`,
    foot,
    onMount: (card, close) => {
      const q = sel => card.querySelector(sel);
      if (shared) { card.querySelectorAll('input, select, .fpick-btn').forEach(i => { i.disabled = true; }); q('#ev-leave').addEventListener('click', () => { close(); if (window.AlixoShare && AlixoShare.enabled) AlixoShare.leaveEvent(ev.shared); }); return; }
      const shareBtn = q('#ev-share');
      if (shareBtn) shareBtn.addEventListener('click', () => { close(); openShare('event', ev.id); });
      let color = v.color || EV_COLORS[0], colorTouched = !isNew;
      const colors = q('#ev-colors'), preview = q('#ev-preview');
      const refreshPreview = () => {
        preview.style.setProperty('--ec', color);
        q('#ev-ptitle').textContent = q('#ev-title').value.trim() || 'Événement';
        q('#ev-pday').textContent = dayLabel(q('#ev-date').value);
        const s = parseTime(q('#ev-start').value), e = parseTime(q('#ev-end').value);
        q('#ev-ptime').textContent = `${s === null ? '—' : fmtTime(s)}–${e === null ? '—' : fmtTime(e)}${q('#ev-weekly').checked ? ' · chaque semaine' : ''}`;
        q('#ev-pplace').textContent = q('#ev-lieu').value.trim();
      };
      colors.addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; colorTouched = true; colors.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); refreshPreview(); });
      mountFolderPicker(q('#ev-folder'));
      q('#ev-folder').addEventListener('change', e => {
        const f = folder(e.currentTarget.value);
        if (f && !colorTouched && f.couleur) color = f.couleur;
        const t = q('#ev-title'); if (f && !t.value.trim()) t.value = f.nom;
        colors.innerHTML = swatches(color, f ? f.couleur : '');
        refreshPreview();
      });
      q('#ev-weekly').addEventListener('change', e => { q('#ev-until').disabled = !e.target.checked; refreshPreview(); });
      /* heures : champ texte tolérant (« 8h30 », « 14 », « 9.15 »), ↑ ↓ par quart d'heure, la fin suit le début */
      const iStart = q('#ev-start'), iEnd = q('#ev-end');
      let lastStart = parseTime(iStart.value);
      const normalize = inp => { const m = parseTime(inp.value); if (m !== null) inp.value = fmtTime(m); return m; };
      const followStart = () => {
        const s = normalize(iStart); if (s === null) return;
        const e = parseTime(iEnd.value);
        const dur = lastStart !== null && e !== null && e > lastStart ? e - lastStart : 60;
        if (e === null || e <= s || lastStart !== null) iEnd.value = fmtTime(Math.min(23 * 60 + 59, s + dur));
        lastStart = s;
        refreshPreview();
      };
      iStart.addEventListener('change', followStart);
      iEnd.addEventListener('change', () => { normalize(iEnd); refreshPreview(); });
      [iStart, iEnd].forEach(inp => inp.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const m = parseTime(inp.value); if (m === null) { inp.value = '08:00'; return; }
        const step = e.shiftKey ? 60 : 15;
        inp.value = fmtTime(Math.max(0, Math.min(23 * 60 + 45, m + (e.key === 'ArrowUp' ? step : -step))));
        if (inp === iStart) followStart(); else refreshPreview();
      }));
      card.addEventListener('input', refreshPreview);
      const ok = () => {
        const title = q('#ev-title').value.trim();
        const date = q('#ev-date').value;
        const sm = parseTime(iStart.value), em = parseTime(iEnd.value);
        if (!title) { toast('Donnez un titre à l’événement'); q('#ev-title').focus(); return; }
        if (!date) { toast('Indiquez la date'); q('#ev-date').focus(); return; }
        if (sm === null) { toast('Heure de début illisible — par exemple 08:30'); iStart.focus(); iStart.select(); return; }
        if (em === null) { toast('Heure de fin illisible — par exemple 10:00'); iEnd.focus(); iEnd.select(); return; }
        const start = fmtTime(sm), end = fmtTime(em > sm ? em : Math.min(23 * 60 + 59, sm + 60));
        const data = { title, date, start, end, folderId: q('#ev-folder').value || '', lieu: q('#ev-lieu').value.trim(), repeat: q('#ev-weekly').checked ? 'weekly' : '', until: q('#ev-weekly').checked ? q('#ev-until').value : '', color };
        if (isNew) events().push(Object.assign({ id: uid() }, data)); else { delete ev.docId; Object.assign(ev, data); }
        close();
        const dd = parseYmd(date);
        calWeekStart = mondayOf(dd); agSelDay = date; agMonth = new Date(dd.getFullYear(), dd.getMonth(), 1);
        saveEvents();
        toast(isNew ? 'Événement ajouté à l’agenda' : 'Événement modifié');
      };
      q('#ev-ok').addEventListener('click', ok);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input:not([type="date"])') && !e.target.closest('.fpick')) { e.preventDefault(); ok(); } });
      const del = q('#ev-del');
      if (del) del.addEventListener('click', () => { state.events = events().filter(x => x !== ev); close(); saveEvents(); if (window.AlixoShare && AlixoShare.enabled) AlixoShare.eventDeleted(ev.id); toast('Événement supprimé'); });
      setTimeout(() => { const t = q('#ev-title'); if (t) { t.focus(); t.select(); } }, 60);
    }
  });
}

/* ============================================================
   Document affiché à côté du cours (PDF, diaporama, Word, image)
   ============================================================ */
let vwUrl = null;   // object URL en cours (à révoquer)
let vwCurrent = null;   // { name, path, docId } : document affiché
function openViewer() {
  openRightPanel('#viewpanel');
  const root = document.documentElement;
  const w = state.settings.viewerW; if (w) root.style.setProperty('--viewer-w', w + 'px');
  if (!$('#vw-body').dataset.loaded) renderViewerEmpty();
}
/* vide le panneau (autre séance, fermeture) */
function resetViewer() {
  if (vwUrl) { URL.revokeObjectURL(vwUrl); vwUrl = null; }
  vwCurrent = null;
  delete $('#vw-body').dataset.loaded;
  if (!$('#viewpanel').hidden) renderViewerEmpty();
}
/* à l'ouverture d'une séance : chaque séance a son propre document ; le dernier affiché revient tout seul (version PC) */
function syncViewerToDoc(d) {
  const wasOpen = !$('#viewpanel').hidden;
  if (vwCurrent && vwCurrent.docId === d.id) return;
  resetViewer();
  const f = Array.isArray(d.files) ? d.files[0] : null;
  const desk = window.alixoDesktop;
  if (d.vwOpen && f && f.path && desk && desk.readFile) {
    openViewer();
    $('#vw-body').innerHTML = `<div class="vw-empty">Réouverture de « ${esc(f.name)} »…</div>`;
    desk.readFile(f.path).then(r => {
      if (currentDocId !== d.id) return;
      if (r && r.data) showViewerFile(r.name, r.data, f.path);
      else { renderViewerEmpty(); toast(`« ${f.name} » introuvable — il a peut-être été déplacé`); }
    });
    return;
  }
  if (wasOpen) { openViewer(); renderViewerEmpty(); }
}
/* historique : documents de cette séance, puis ceux des autres séances */
function openViewerHistory(anchor) {
  const d = doc(); if (!d) return;
  const desk = !!(window.alixoDesktop && window.alixoDesktop.readFile);
  const ICO = '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/></svg>';
  const row = (f, i, dd) => `<button type="button" data-hdoc="${dd.id}" data-hi="${i}" ${desk && f.path ? '' : 'disabled title="Chemin indisponible : rouvrir avec « Ouvrir… »"'}>${ICO}<span class="vw-hname">${esc(f.name)}</span>${dd.id !== d.id ? `<span class="vw-hdoc">${esc(dd.titre || 'Sans titre')}</span>` : ''}<span class="vw-rx" data-hforget="${dd.id}:${i}" title="Retirer de l’historique">✕</span></button>`;
  const mine = (d.files || []).map((f, i) => row(f, i, d));
  const others = [];
  for (const dd of state.docs) { if (dd.id === d.id) continue; (dd.files || []).forEach((f, i) => { if (others.length < 12) others.push(row(f, i, dd)); }); }
  showPopover(`<h4>Documents récents</h4>
      <div class="po-label" style="margin-top:4px">Cette séance</div>
      <div class="vw-hist">${mine.length ? mine.join('') : '<div class="po-hint" style="margin:0 0 6px">Aucun document ouvert pour cette séance.</div>'}</div>
      ${others.length ? `<div class="po-label">Autres séances</div><div class="vw-hist">${others.join('')}</div>` : ''}
      <div class="po-hint">Le dernier document ouvert pour une séance revient automatiquement quand vous rouvrez la séance.</div>`,
    anchor || centerRect(), pop => {
      pop.addEventListener('click', async e => {
        const fg = e.target.closest('[data-hforget]');
        if (fg) {
          e.stopPropagation();
          const [did, i] = fg.dataset.hforget.split(':'); const dd = state.docs.find(x => x.id === did);
          if (dd && dd.files) { dd.files.splice(+i, 1); dd.updatedAt = Date.now(); save(); }
          hidePopover(); openViewerHistory(anchor); if ($('#vw-body').dataset.loaded !== '1') renderViewerEmpty();
          return;
        }
        const b = e.target.closest('[data-hdoc]'); if (!b || b.disabled) return;
        const dd = state.docs.find(x => x.id === b.dataset.hdoc); const f = dd && dd.files && dd.files[+b.dataset.hi]; if (!f) return;
        hidePopover();
        const r = await window.alixoDesktop.readFile(f.path);
        if (r && r.data) showViewerFile(r.name, r.data, f.path); else toast('Fichier introuvable — il a peut-être été déplacé');
      });
    });
}
$('#vw-recent').addEventListener('click', e => openViewerHistory(e.currentTarget.getBoundingClientRect()));
function renderViewerEmpty() {
  const d = doc();
  const recent = d && Array.isArray(d.files) ? d.files : [];
  const desktop = !!window.alixoDesktop;
  const folderFiles = d && window.AlixoFiles && !isSharedDoc(d.id) ? AlixoFiles.inFolder(d.folderId).slice(0, 12) : [];
  $('#vw-title').textContent = 'Document';
  $('#vw-body').innerHTML = `<div class="vw-empty">Affichez ici le diaporama du prof, un PDF ou un document Word pendant que vous prenez vos notes.<br>
      <button class="cta" id="vw-pick" type="button">Ouvrir un fichier…</button><div style="margin-top:8px; font-size:12px">ou glissez-déposez un fichier dans ce panneau.</div>
      ${folderFiles.length ? `<div class="vw-recent"><div class="vw-rtitle">Fichiers du dossier${folder(d.folderId) ? ' « ' + esc(folder(d.folderId).nom) + ' »' : ''}</div>${folderFiles.map(f => `<button type="button" data-ffile="${f.id}">${AlixoFiles.iconHTML(f.name, 'mini')}<span>${esc(f.name)}</span></button>`).join('')}</div>` : ''}
      ${recent.length ? `<div class="vw-recent"><div class="vw-rtitle">Documents de cette séance</div>${recent.map((f, i) => `<button type="button" data-recent="${i}" ${desktop && f.path ? '' : 'disabled title="Fichier à rouvrir depuis « Ouvrir un fichier… » (chemin indisponible)"'}><svg class="tab-ico" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/></svg><span>${esc(f.name)}</span><span class="vw-rx" data-forget="${i}" title="Retirer de la liste">✕</span></button>`).join('')}</div>` : ''}
    </div>`;
  delete $('#vw-body').dataset.loaded;
}
async function pickViewerFile() {
  if (window.alixoDesktop && window.alixoDesktop.pickFile) {
    const r = await window.alixoDesktop.pickFile();
    if (r && r.data) showViewerFile(r.name, r.data, r.path);
  } else $('#vw-file').click();
}
$('#vw-open').addEventListener('click', pickViewerFile);
$('#vw-body').addEventListener('click', e => {
  if (e.target.closest('#vw-pick')) { pickViewerFile(); return; }
  const ff = e.target.closest('[data-ffile]'); if (ff) { AlixoFiles.showBeside(ff.dataset.ffile); return; }
  const forget = e.target.closest('[data-forget]');
  if (forget) { e.stopPropagation(); const d = doc(); if (d && d.files) { d.files.splice(+forget.dataset.forget, 1); d.updatedAt = Date.now(); save(); renderViewerEmpty(); } return; }
  const rc = e.target.closest('[data-recent]');
  if (rc) { const d = doc(); const f = d && d.files && d.files[+rc.dataset.recent]; if (f && f.path && window.alixoDesktop) window.alixoDesktop.readFile(f.path).then(r => { if (r && r.data) showViewerFile(r.name, r.data, f.path); else toast('Fichier introuvable — il a peut-être été déplacé'); }); }
});
$('#vw-file').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const p = window.alixoDesktop && window.alixoDesktop.pathOf ? window.alixoDesktop.pathOf(f) : '';
  showViewerFile(f.name, await f.arrayBuffer(), p);
  e.target.value = '';
});
$('#viewpanel').addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('#viewpanel').classList.add('vw-drop'); } });
$('#viewpanel').addEventListener('dragleave', () => $('#viewpanel').classList.remove('vw-drop'));
$('#viewpanel').addEventListener('drop', async e => {
  $('#viewpanel').classList.remove('vw-drop');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
  e.preventDefault();
  const p = window.alixoDesktop && window.alixoDesktop.pathOf ? window.alixoDesktop.pathOf(f) : '';
  showViewerFile(f.name, await f.arrayBuffer(), p);
});
function rememberViewerFile(name, path) {
  const d = doc(); if (!d) return;
  d.files = Array.isArray(d.files) ? d.files.filter(f => f.name !== name || (f.path && f.path !== path)) : [];
  d.files.unshift({ name, path: path || '', ts: Date.now() });
  d.files = d.files.slice(0, 8);
  d.vwOpen = true;
  d.updatedAt = Date.now(); save();
}
async function showViewerFile(name, data, path) {
  const body = $('#vw-body');
  const buf = data instanceof ArrayBuffer ? data : (data && data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : null);
  if (!buf) { toast('Fichier illisible'); return; }
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (vwUrl) { URL.revokeObjectURL(vwUrl); vwUrl = null; }
  $('#vw-title').textContent = name;
  body.dataset.loaded = '1';
  vwCurrent = { name, path: path || '', docId: currentDocId };
  rememberViewerFile(name, path);
  openRightPanel('#viewpanel');
  try {
    if (ext === 'pdf') {
      vwUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
      body.innerHTML = `<iframe src="${vwUrl}#toolbar=1&navpanes=0&view=FitH" title="${esc(name)}"></iframe>`;
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      vwUrl = URL.createObjectURL(new Blob([buf]));
      body.innerHTML = `<img class="vw-img" src="${vwUrl}" alt="${esc(name)}">`;
    } else if (ext === 'docx') {
      body.innerHTML = `<div class="vw-empty">Conversion du document Word…</div>`;
      if (typeof mammoth === 'undefined') throw new Error('Convertisseur Word indisponible');
      const r = await mammoth.convertToHtml({ arrayBuffer: buf });
      body.innerHTML = `<div class="vw-doc">${r.value || '<i>Document vide</i>'}</div>`;
    } else if (ext === 'pptx') {
      body.innerHTML = `<div class="vw-empty">Lecture du diaporama…</div>`;
      body.innerHTML = await pptxToHtml(buf);
    } else if (['txt', 'md', 'csv'].includes(ext)) {
      body.innerHTML = `<div class="vw-pre">${esc(new TextDecoder().decode(buf))}</div>`;
    } else if (ext === 'doc' || ext === 'ppt') {
      body.innerHTML = `<div class="vw-empty">Les anciens formats .doc / .ppt ne sont pas lisibles ici. Enregistrez le fichier en <b>.docx</b>, <b>.pptx</b> ou <b>PDF</b> depuis Word / PowerPoint, puis rouvrez-le.</div>`;
    } else {
      body.innerHTML = `<div class="vw-empty">Format « .${esc(ext)} » non pris en charge. Formats lisibles : PDF, PowerPoint (.pptx), Word (.docx), images, texte.</div>`;
    }
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="vw-empty">Impossible d’afficher ce fichier${err && err.message ? ' : ' + esc(err.message) : ''}.<br>Astuce : exportez-le en PDF, c’est le format le plus fidèle.</div>`;
  }
}
/* diaporama .pptx → une carte par diapositive (titre, textes, images, notes) */
async function pptxToHtml(buf) {
  if (typeof JSZip === 'undefined') throw new Error('Lecteur de diaporama indisponible');
  const zip = await JSZip.loadAsync(buf);
  const xml = async p => { const f = zip.file(p); if (!f) return null; return new DOMParser().parseFromString(await f.async('string'), 'application/xml'); };
  const pres = await xml('ppt/presentation.xml');
  const presRels = await xml('ppt/_rels/presentation.xml.rels');
  const relMap = {};
  if (presRels) presRels.querySelectorAll('Relationship').forEach(r => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
  let slidePaths = [];
  if (pres) pres.querySelectorAll('sldIdLst > sldId, sldId').forEach(s => { const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const t = relMap[rid]; if (t) slidePaths.push('ppt/' + t.replace(/^\/?ppt\//, '')); });
  if (!slidePaths.length) slidePaths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);
  const out = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const p = slidePaths[i];
    const sx = await xml(p); if (!sx) continue;
    const rels = await xml(p.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    const rmap = {}; if (rels) rels.querySelectorAll('Relationship').forEach(r => { rmap[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type') || '' }; });
    const paras = []; let title = '';
    sx.querySelectorAll('sp').forEach(sp => {
      const ph = sp.querySelector('nvPr > ph');
      const isTitle = ph && /title|ctrTitle/i.test(ph.getAttribute('type') || '');
      sp.querySelectorAll('txBody > p').forEach(pp => {
        const t = [...pp.querySelectorAll('t')].map(x => x.textContent).join('').trim();
        if (!t) return;
        if (isTitle && !title) { title = t; return; }
        const lvl = +(pp.querySelector('pPr') && pp.querySelector('pPr').getAttribute('lvl') || 0);
        const bullet = !!(pp.querySelector('pPr > buChar, pPr > buAutoNum')) || lvl > 0 || (!ph || /body|obj/i.test(ph.getAttribute('type') || 'body'));
        paras.push({ t, bullet });
      });
    });
    const imgs = [];
    for (const blip of sx.querySelectorAll('blip')) {
      const rid = blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const rel = rid && rmap[rid]; if (!rel) continue;
      const mp = 'ppt/' + rel.target.replace(/^(\.\.\/)+/, '').replace(/^\/?ppt\//, '');
      const f = zip.file(mp); if (!f) continue;
      const ext = (mp.split('.').pop() || '').toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) continue;
      const b64 = await f.async('base64');
      imgs.push(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`);
      if (imgs.length >= 4) break;
    }
    let notes = '';
    const notesRel = Object.values(rmap).find(r => /notesSlide/.test(r.type));
    if (notesRel) { const nx = await xml('ppt/' + notesRel.target.replace(/^(\.\.\/)+/, '').replace(/^\/?ppt\//, '')); if (nx) notes = [...nx.querySelectorAll('t')].map(x => x.textContent).join(' ').trim(); }
    out.push(`<div class="vw-slide"><div class="vw-sn">Diapositive ${i + 1} / ${slidePaths.length}</div>${title ? `<h4>${esc(title)}</h4>` : ''}${paras.map(x => `<p class="${x.bullet ? 'vw-li' : ''}">${esc(x.t)}</p>`).join('')}${imgs.map(s => `<img src="${s}" alt="">`).join('')}${notes ? `<div class="vw-notes">Notes : ${esc(notes)}</div>` : ''}</div>`);
  }
  return out.length ? out.join('') + '<div style="height:20px"></div>' : '<div class="vw-empty">Aucune diapositive lisible dans ce fichier.</div>';
}
/* largeur du panneau : poignée sur son bord gauche */
(() => {
  const rz = document.querySelector('#viewpanel .vw-resizer'); if (!rz) return;
  let drag = null;
  rz.addEventListener('mousedown', e => { e.preventDefault(); drag = { x: e.clientX, w: $('#viewpanel').getBoundingClientRect().width }; rz.classList.add('on'); document.body.classList.add('tbl-resizing'); });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    const w = Math.max(320, Math.min(innerWidth * 0.72, drag.w + (drag.x - e.clientX)));
    document.documentElement.style.setProperty('--viewer-w', w + 'px');
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = null; rz.classList.remove('on'); document.body.classList.remove('tbl-resizing');
    state.settings.viewerW = Math.round($('#viewpanel').getBoundingClientRect().width); save();
  });
})();

/* calculatrices : émulateurs officiels en ligne, dans une vue intégrée — TI-83 Premium CE (Texas Instruments)
   et fx-92 Collège (Casio), la calculatrice scientifique simple du collège. Chaque émulateur n'est chargé
   qu'à sa première ouverture et garde son état (calculs en cours) quand on passe de l'un à l'autre. */
const CALCS = {
  ti: { name: 'TI-83 Premium CE', url: 'https://maclasseti.fr/calculatrice' },
  college: { name: 'fx-92 Collège', url: 'https://classwiz-emulator.casio.com/WebApp/cw/index.html?model=EY006' }
};
const CALC_LS = 'alixo.calc';
let calcKind = (() => { try { const k = localStorage.getItem(CALC_LS); return CALCS[k] ? k : 'ti'; } catch { return 'ti'; } })();
function showCalc(kind) {
  if (!CALCS[kind]) kind = 'ti';
  calcKind = kind;
  try { localStorage.setItem(CALC_LS, kind); } catch { /* stockage indisponible */ }
  const body = $('#calc-body');
  let view = body.querySelector(`[data-calcview="${kind}"]`);
  if (!view) {
    view = document.createElement(window.alixoDesktop ? 'webview' : 'iframe');
    view.dataset.calcview = kind;
    view.setAttribute('src', CALCS[kind].url);
    if (window.alixoDesktop) view.setAttribute('allowpopups', 'false');
    else { view.setAttribute('allow', 'fullscreen'); view.title = 'Calculatrice ' + CALCS[kind].name + ' en ligne'; }
    body.appendChild(view);
  }
  body.querySelectorAll('[data-calcview]').forEach(v => v.classList.toggle('off', v !== view));
  $$('#calc-seg button').forEach(b => b.classList.toggle('on', b.dataset.calc === kind));
  const ext = $('#ti-ext'); ext.href = CALCS[kind].url; ext.title = `Ouvrir « ${CALCS[kind].name} » dans le navigateur`;
}
function openCalcPanel(kind) {
  showCalc(kind || calcKind);
  openRightPanel('#calcpanel');
}
$('#calc-seg').addEventListener('click', e => { const b = e.target.closest('[data-calc]'); if (b) showCalc(b.dataset.calc); });
function toggleCalcPanel() {
  if (!$('#calcpanel').hidden) closeRightPanels(); else openCalcPanel();
}
/* les boutons de la palette ne volent pas le focus : la formule en cours de saisie reste ouverte */
$('#mathpanel').addEventListener('pointerdown', e => {
  if (e.target.closest('button')) e.preventDefault();
});
$('.mp-tabs').addEventListener('click', e => {
  const t = e.target.closest('.mp-tab'); if (!t) return;
  openMathPanel(t.dataset.tab);
});

function renderMathPanel(tab) {
  const body = $('#mp-body');
  if (tab === 'sym') {
    body.innerHTML = `<div class="mp-sect">Symboles fréquents</div>
      <div class="sym-grid">${SYMBOLS.map(s => `<button data-ins="${s}">${s}</button>`).join('')}</div>
      <div class="mp-sect">Structures</div>
      <div class="sym-grid">${SYM_SNIPPETS.map(([lab, ins]) => `<button data-ins="${esc(ins)}" title="${esc(ins)}">${lab}</button>`).join('')}</div>
      <div class="mp-sect">Saisie linéaire</div>
      <div style="font-size:12px; color:var(--ink-3); line-height:1.6; padding:0 4px">
        <code>x^2</code> exposant · <code>e_p</code> indice · <code>x_i^2</code> les deux, empilés · <code>(a)/(b)</code> fraction<br>
        <b>Mots</b> : <code>Coût total = Prix xx Quantité</code> (les mots séparés par des espaces restent des mots, accents compris) · <code>text(…)</code> ou <code>"…"</code> pour forcer du texte<br>
        <code>alpha…omega</code> lettres grecques · <code>partial</code> ∂ · <code>sum_(i=1)^n</code> Σ · <code>lim_(x->oo)</code> · <code>int_a^b</code><br>
        <code>sqrt(x)</code> racine · <code>root(3)(x)</code> ∛ · <code>vec(u)</code> <code>bar(x)</code> <code>hat(β)</code> · <code>abs(x)</code> |x| · <code>norm(v)</code><br>
        <code>mat(a, b; c, d)</code> matrice · <code>det(…)</code> · <code>cases(… ; …)</code> système · <code>binom(n)(k)</code><br>
        <code>&lt;=</code> ≤ · <code>-&gt;</code> → · <code>=&gt;</code> ⇒ · <code>+-</code> ± · <code>xx</code> × · <code>in</code> ∈ · <code>RR NN ZZ</code> ℝ ℕ ℤ · <code>...</code> …<br>
        <code>0,5</code> décimale · <code>\\\\</code> ou Maj+Entrée : nouvelle ligne · <code>bold(x)</code> gras · <code>cancel(x)</code> barré</div>`;
  } else if (tab === 'mod') {
    body.innerHTML = Object.entries(FORMULA_LIB).map(([sect, items]) =>
      `<div class="mp-sect">${sect}</div>` + items.map(([name, src]) =>
        `<button class="mod-item" data-src="${esc(src)}">
          <div class="mod-name">${name}</div>
          <div class="mod-prev">${AlixoMath.render(src)}</div></button>`).join('')
    ).join('');
  } else {
    body.innerHTML = `<div class="mp-sect">Gabarits — objets vectoriels éditables</div>` +
      Object.entries(AlixoGraphs.TYPES).map(([k, t]) =>
        `<button class="gra-item" data-gt="${k}"><span class="gthumb">${AlixoGraphs.thumb(k)}</span>${t.name}</button>`).join('');
  }
}

$('#mp-body').addEventListener('click', e => {
  const sym = e.target.closest('[data-ins]');
  if (sym) {
    const ins = sym.dataset.ins;
    if (lastFormulaInput && document.contains(lastFormulaInput)) {
      const inp = lastFormulaInput;
      const s = inp.selectionStart ?? inp.value.length;
      inp.value = inp.value.slice(0, s) + ins + inp.value.slice(inp.selectionEnd ?? s);
      inp.focus(); inp.setSelectionRange(s + ins.length, s + ins.length);
      const b = getBlock(inp.closest('.block').dataset.id);
      if (b) b.src = inp.value;
    } else {
      const nb = insertSpecial({ type: 'formula', src: ins });
      editingFormula[nb.id] = true; renderBlocks(nb.id);
    }
    return;
  }
  const mod = e.target.closest('.mod-item');
  if (mod) {
    if (lastFormulaInput && document.contains(lastFormulaInput)) {
      lastFormulaInput.value = mod.dataset.src;
      const b = getBlock(lastFormulaInput.closest('.block').dataset.id);
      if (b) { commitFormula(b, mod.dataset.src, false); }
    } else {
      insertSpecial({ type: 'formula', src: mod.dataset.src });
    }
    toast('Formule insérée — cliquer dessus pour l’adapter');
    return;
  }
  const gr = e.target.closest('.gra-item');
  if (gr) {
    insertSpecial({ type: 'graph', gtype: gr.dataset.gt, params: {} });
    toast('Graphique inséré');
  }
});

/* ============================================================
   Capsule d'outils
   ============================================================ */
$('#toolbar').addEventListener('pointerdown', e => {
  if (e.target.closest('button')) e.preventDefault(); // conserve la sélection du cours
});
$('#toolbar').addEventListener('click', e => {
  const cmdBtn = e.target.closest('[data-cmd]');
  if (cmdBtn) { applyFmt(cmdBtn.dataset.cmd); return; }
  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn) { openFmtMenu(menuBtn); return; }
  const listBtn = e.target.closest('[data-list]');
  if (listBtn) { setList(listBtn.dataset.list); return; }
  const alBtn = e.target.closest('[data-align]');
  if (alBtn) { setAlign(alBtn.dataset.align); return; }
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.dataset.act;
  const bid = currentBlockId();
  const r = btn.getBoundingClientRect();
  const above = { left: r.left - 100, top: r.top, bottom: r.bottom };
  if (act === 'text') { insertSpecial({ type: 'p', text: '' }); }
  if (act === 'heading') {
    showPopover(`<h4>Niveau de plan</h4><div class="po-list">
        ${planLevels().map((l, i) => `<button data-l="${i + 1}"><b style="color:var(--tint)">${esc(NUM_STYLES[l.num][0])}</b>&nbsp; ${esc(l.name)}</button>`).join('')}</div>
        <div class="po-hint" style="margin:6px 0 0"><a href="#" id="po-planset">Modifier le plan…</a></div>`,
      above, pop => { pop.querySelector('#po-planset').addEventListener('click', ev => { ev.preventDefault(); hidePopover(); openSettings('ecriture'); setTimeout(() => { const el = $('#set-plan'); if (el) el.scrollIntoView({ block: 'center' }); }, 80); }); pop.querySelector('.po-list').addEventListener('click', ev => {
        const l = ev.target.closest('[data-l]'); if (!l) return;
        hidePopover();
        const b = getBlock(bid);
        if (b && ['p', 'h', 'li', 'quote'].includes(b.type)) { const off = caretSnapshot(); resetBlock(b, { type: 'h', level: +l.dataset.l, text: b.text || '' }); touch(); renderBlocks(b.id, off ? off.off : 'end'); }
        else insertAfter(bid, { id: uid(), type: 'h', level: +l.dataset.l, text: '' });
      }); });
  }
  if (act === 'callout') {
    showPopover(`<h4>Encadré typé</h4><div class="po-list">
        ${Object.entries(CALLOUTS).map(([k, c]) => `<button data-ct="${k}">${AlixoIcons.svg(c.ico, 'po-ico')}${c.name}</button>`).join('')}</div>`,
      above, pop => pop.querySelector('.po-list').addEventListener('click', ev => {
        const c = ev.target.closest('[data-ct]'); if (!c) return;
        hidePopover();
        insertSpecial({ type: 'callout', ct: c.dataset.ct, text: '' });
      }));
  }
  if (act === 'juris') { insertSpecial({ type: 'juris', fields: {} }); toast('Fiche d’arrêt — Entrée pour passer au champ suivant'); }
  if (act === 'formula') {
    const nb = insertSpecial({ type: 'formula', src: '' });
    editingFormula[nb.id] = true; renderBlocks(nb.id); openMathPanel();
  }
  if (act === 'graph') openGraphChooser(bid);
  if (act === 'calc') openCalculator(bid);
  if (act === 'table') {
    const nb = insertSpecial({ type: 'table', rows: [['', '', ''], ['', '', ''], ['', '', '']], head: true });
    focusTableCell(nb.id, 0, 0);
    toast('Tableau — Tab pour passer de case en case, boutons au-dessus pour lignes et colonnes');
  }
  if (act === 'image') pickImages();
  if (act === 'draw') insertDrawing();
  if (act === 'ai') runAiCorrection();
  if (act === 'ti') toggleCalcPanel();
  if (act === 'link') openLinkPopover({});
  if (act === 'refart') openArticlePopover(bid);
  if (act === 'dict') togglePanel('#dictpanel', openDictPanel);
  if (act === 'cal') togglePanel('#calpanel', openCalPanel);
  if (act === 'viewer') { if (!$('#viewpanel').hidden) { const d = doc(); if (d && d.vwOpen) { d.vwOpen = false; save(); } closeRightPanels(); } else { openViewer(); const d = doc(); if (d && $('#vw-body').dataset.loaded === '1') { d.vwOpen = true; save(); } } }
});
function togglePanel(sel, open) { if (!$(sel).hidden) closeRightPanels(); else open(); }
/* nouveau dessin (formes, flèches, zones de texte) à la position du curseur */
function insertDrawing() {
  const nb = insertSpecial({ type: 'draw', h: 300, shapes: [] });
  selectObj(nb.id);
  if (window.AlixoDraw) AlixoDraw.start(nb.id);
  toast('Dessin — choisissez un outil dans la barre du dessin (formes, flèche, texte, main levée)');
}

/* ============================================================
   Correction orthographe / grammaire par IA (API Gemini — Google AI Studio)
   La clé API est saisie par l'utilisateur (gratuite) et reste sur
   l'appareil (localStorage, jamais synchronisée).
   ============================================================ */
const AI_KEY_LS = 'alixo.geminiKey';
const AI_PROVIDER = 'Google AI Studio';
function aiKey() { try { return localStorage.getItem(AI_KEY_LS) || ''; } catch { return ''; } }
/* 1.22 : les appels à Gemini passent par le moteur js/corr.js (AlixoCorr.call) — une seule implémentation,
   réponse JSON, « réflexion » désactivée quand le modèle l'accepte (moins de jetons, plus rapide) */
let aiState = null;   // { items: [{ n, id, avant, apres, regle, done }], label }

function aiCorrectable(b) { return TEXT_TYPES.includes(b.type) || isFiche(b) || b.type === 'table' || b.type === 'cards'; }

/* ---------------- configuration guidée de la clé API ---------------- */
const AI_KEYS_URL = 'https://aistudio.google.com/app/apikey';
const maskKey = k => k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '';
/* mode 'panel' (panneau IA, parcours complet) ou 'settings' (bloc compact dans les Paramètres) */
function aiSetupHTML(mode) {
  const key = aiKey();
  const status = key
    ? `<div class="ai-keystate ok"><span class="ai-dot"></span>Clé enregistrée sur cet appareil (${esc(maskKey(key))})</div>`
    : `<div class="ai-keystate"><span class="ai-dot"></span>Aucune clé pour l’instant — la correction par IA est désactivée.</div>`;
  const steps = mode === 'panel' || !key ? `
    <ol class="ai-steps">
      <li>Ouvrir <a href="${AI_KEYS_URL}" target="_blank" rel="noopener">aistudio.google.com/app/apikey</a> avec un compte Google (gratuit, sans carte bancaire).</li>
      <li>Cliquer <b>Créer une clé API</b> et copier la clé complète.</li>
      <li>La coller ci-dessous et cliquer <b>Tester et enregistrer</b>.</li>
    </ol>` : '';
  return `${status}${steps}
    <div class="po-row ai-keyrow">
      <input class="ai-keyinput" type="password" placeholder="Collez votre clé API…" value="${esc(key)}" autocomplete="off" spellcheck="false" aria-label="Clé API Gemini">
      <button class="ai-keyeye" type="button" title="Afficher / masquer">👁</button>
    </div>
    <div class="po-row ai-keybtns">
      <button class="pobtn ai-keytest" type="button">Tester et enregistrer</button>
      ${key ? `<button class="cta ghost small ai-keyremove" type="button">Retirer la clé</button>` : ''}
    </div>
    <div class="ai-keymsg" aria-live="polite"></div>
    ${key && mode === 'panel' ? `<label class="ai-toggle"><input type="checkbox" class="ai-styletoggle" ${aiStyleOn() ? 'checked' : ''}> Analyse automatique pendant la frappe : les fautes d’orthographe / grammaire et la mise en forme (définitions, titres, encadrés…) sont proposées sous le paragraphe, sans rien demander — <b>Tab</b> pour accepter</label>` : ''}
    <div class="po-hint">Gemini Flash (Google) : gratuit, très bon en français. Alixo économise le palier gratuit : les fautes de frappe courantes sont corrigées sur l’appareil, chaque phrase n’est envoyée qu’une fois (les phrases déjà relues restent en mémoire) et les phrases nouvelles sont groupées en une seule requête. La clé reste sur cet ordinateur (jamais envoyée ailleurs qu’à Google, jamais synchronisée avec vos cours) ; seul le texte analysé est transmis. Le bouton « Corriger » (✨ ou F7) devient actif dès qu’une clé valide est enregistrée.</div>`;
}
function bindAiSetup(root, mode) {
  if (!root) return;
  const input = root.querySelector('.ai-keyinput');
  const msg = root.querySelector('.ai-keymsg');
  const setMsg = (t, cls) => { msg.textContent = t; msg.className = 'ai-keymsg ' + (cls || ''); };
  root.querySelector('.ai-keyeye').addEventListener('click', () => { input.type = input.type === 'password' ? 'text' : 'password'; input.focus(); });
  const rerender = () => { root.innerHTML = aiSetupHTML(mode); bindAiSetup(root, mode); };
  const test = async () => {
    const k = input.value.trim();
    if (!k) { setMsg('Collez d’abord votre clé.', 'err'); input.focus(); return; }
    if (/\s/.test(k) || k.length < 20) { setMsg('La clé semble incomplète (au moins 20 caractères, sans espace). Vérifiez que vous avez copié la clé entière.', 'err'); return; }
    setMsg('Vérification auprès de Google…', '');
    root.querySelector('.ai-keytest').disabled = true;
    const r = await aiTestKey(k);
    root.querySelector('.ai-keytest').disabled = false;
    if (r.ok) {
      try { localStorage.setItem(AI_KEY_LS, k); } catch { /* stockage indisponible */ }
      setMsg('Clé valide et enregistrée ✓ Vous pouvez utiliser « Corriger » (✨ ou F7).', 'ok');
      toast('Clé API enregistrée — correction par IA activée');
      setTimeout(rerender, 900);
    } else setMsg(r.error, 'err');
  };
  root.querySelector('.ai-keytest').addEventListener('click', test);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); test(); } });
  const rm = root.querySelector('.ai-keyremove');
  if (rm) rm.addEventListener('click', () => { try { localStorage.removeItem(AI_KEY_LS); } catch { } toast('Clé API retirée'); rerender(); });
  const st = root.querySelector('.ai-styletoggle');
  if (st) st.addEventListener('change', e => { aiOpt(); state.settings.ai.auto = e.target.checked; save(); if (!e.target.checked) dismissSug(); toast(e.target.checked ? 'Analyse automatique activée' : 'Analyse automatique désactivée'); });
}
/* appel minimal pour vérifier qu'une clé fonctionne (quelques jetons) */
async function aiTestKey(key) {
  const r = await AlixoCorr.call(key, { system: 'Réponds uniquement avec le JSON {"ok":true}.', user: 'Test', maxTokens: 16, models: AlixoCorr.MODELS_LIVE, timeoutMs: 15000 });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
function showAiSetup() {
  const body = $('#ai-body');
  body.innerHTML = `<div class="ai-setup"><div class="ai-setuptitle">Activer la correction par IA</div>
    <div class="ai-empty" style="padding-top:2px">La correction d’orthographe et de grammaire s’appuie sur Gemini Flash (Google, gratuit). Il faut une clé API personnelle, en trois étapes :</div>
    ${aiSetupHTML('panel')}</div>`;
  bindAiSetup(body.querySelector('.ai-setup'), 'panel');
  setTimeout(() => { const i = body.querySelector('.ai-keyinput'); if (i) i.focus(); }, 60);
}

async function runAiCorrection(o) {
  const d = doc(); if (!d) return;
  const second = !!(o && o.second && aiState && aiState.payload);
  if (!requirePlus('ia')) return;
  if (!aiKey()) { openRightPanel('#aipanel'); showAiSetup(); return; }
  // portée : blocs sélectionnés → bloc courant (si le curseur y est) → tout le cours
  const selNative = getSelection();
  let targets = selNative.rangeCount && !selNative.isCollapsed && blocksEl.contains(selNative.anchorNode) ? selectionBlocks() : (objSel ? [getBlock(objSel)].filter(Boolean) : []);
  let label = `${targets.length} passage${targets.length > 1 ? 's' : ''} sélectionné${targets.length > 1 ? 's' : ''}`;
  if (!targets.length) {
    const inEditor = !!activeField();
    const cur = inEditor ? getBlock(currentBlockId()) : null;
    if (cur && aiCorrectable(cur) && blockPlain(cur).trim()) { targets = [cur]; label = 'bloc courant'; }
  }
  if (second) { targets = aiState.payload.map(x => getBlock(x.id)).filter(Boolean); label = aiState.label + ' · seconde lecture'; }
  if (!targets.length) { targets = d.blocks; label = 'tout le cours'; }
  let payload = targets.filter(aiCorrectable).map(b => ({ id: b.id, text: blockPlain(b) })).filter(x => x.text.trim());
  // 1.21 : blocs dans une autre langue — laissés tels quels, sauf réglage « autres langues » (alors corrigés dans leur langue)
  const skipped = [];
  payload = payload.filter(x => { const l = detectLang(x.text); if (l && l !== 'fr' && !aiOpt().multilang) { skipped.push(x); return false; } x.lang = l; return true; });
  if (skipped.length) toast(`${skipped.length} bloc${skipped.length > 1 ? 's' : ''} dans une autre langue laissé${skipped.length > 1 ? 's' : ''} tel${skipped.length > 1 ? 's' : ''} quel${skipped.length > 1 ? 's' : ''} (Paramètres › IA › autres langues)`);
  if (!payload.length) { toast('Rien à corriger dans cette sélection'); return; }
  openRightPanel('#aipanel');
  $('#ai-body').innerHTML = `<div class="ai-empty">Analyse en cours (${esc(label)})…</div>`;
  try {
    const already = second ? aiState.items.map(it => ({ id: it.id, avant: it.avant, apres: it.apres })) : [];
    const items = await aiAnalyze(payload, (i, n) => { const el = $('#ai-body .ai-empty'); if (el && n > 1) el.textContent = `Analyse en cours (${label}) — lecture ${Math.min(i + 1, n)} / ${n}…`; }, { second, already });
    aiState = { items, label, payload: payload.map(x => ({ id: x.id })) };
    renderAiPanel();
    if (!items.length) toast(second ? 'Rien de plus à la seconde lecture' : 'Aucune faute détectée');
  } catch (err) {
    $('#ai-body').innerHTML = `<div class="ai-empty ai-err">${esc(err.message || 'Erreur inattendue')}</div><div class="ai-foot"><button class="cta ghost small" id="ai-run" type="button">Réessayer</button></div>`;
    $('#ai-run').addEventListener('click', () => runAiCorrection());
  }
}

/* analyse à la demande (bouton « Corriger », F7) — 1.22 : phrase par phrase par le moteur js/corr.js. Les phrases
   déjà relues (mémoire locale) ne repartent pas vers l'API ; les autres sont groupées en requêtes compactes.
   `second` : seconde lecture de tout le texte, sans la mémoire, pour rattraper ce qui a échappé à la première */
async function aiAnalyze(blocks, onProgress, { second = false, already = [] } = {}) {
  const raw = await AlixoCorr.analyzeBlocks(blocks.map(b => ({ id: String(b.id), text: b.text, lang: b.lang || 'fr' })), { onProgress, second, already });
  const seen = new Set(); const all = [];
  for (const x of raw) { const k = x.id + '|' + x.at + '|' + x.avant; if (seen.has(k)) continue; seen.add(k); all.push(x); }
  const order = new Map(blocks.map((b, i) => [String(b.id), i]));
  all.sort((a, b) => (order.get(a.id) - order.get(b.id)) || (a.at - b.at));
  return all.map((x, i) => Object.assign({ n: i, done: false }, x));
}

function renderAiPanel() {
  const body = $('#ai-body'); const st = aiState;
  if (!st) {
    body.innerHTML = `<div class="ai-empty">Cliquez sur « Corriger » (barre d’outils ou F7) pour analyser le bloc courant, la sélection ou tout le cours.</div>
      <div class="ai-foot"><button class="cta small" id="ai-run" type="button">Corriger tout le cours</button> <button class="cta ghost small" id="ai-style" type="button" title="Repérer les définitions, titres, arrêts, exemples… à mettre en forme">Suggérer une mise en forme</button></div>
      <div class="ai-empty" style="padding-top:4px">Pendant la frappe, l’analyse est automatique : dès qu’une faute ou une mise en forme (définition, titre, encadré…) est repérée, la proposition apparaît sous le paragraphe, <b>Tab</b> pour l’accepter, Échap pour l’ignorer. Ces boutons analysent tout le cours d’un coup.</div>`;
    body.querySelector('#ai-run').addEventListener('click', () => { clearBlockSel(); document.activeElement && document.activeElement.blur(); runAiCorrection(); });
    const cs = AlixoCorr.stats();
    if (cs.req || cs.cached || cs.local) body.insertAdjacentHTML('beforeend', `<div class="ai-empty ai-stats">${aiStatsText(cs)}</div>`);
    body.querySelector('#ai-style').addEventListener('click', runAiStyle);
    return;
  }
  const todo = st.items.filter(i => !i.done);
  body.innerHTML = `<div class="ai-head"><span>${st.items.length ? `${todo.length} suggestion${todo.length > 1 ? 's' : ''} restante${todo.length > 1 ? 's' : ''}` : (st.kind === 'style' ? 'Rien à changer' : 'Aucune faute détectée')} · ${esc(st.label)}</span>${todo.length > 1 ? `<button class="cta small" id="ai-all" type="button">Tout appliquer</button>` : ''}</div>` +
    st.items.map(it => `<div class="ai-item ${it.done ? 'done' : ''}" data-n="${it.n}">
      <div class="ai-diff">${it.kind === 'style' ? `<b>${esc(styleLabel(it))}</b> <span class="ai-exc">« ${esc(it.excerpt)}${it.excerpt.length >= 90 ? '…' : ''} »</span>` : `<s>${esc(it.avant)}</s> → <b>${esc(it.apres)}</b>`}</div>
      ${(it.regle || it.raison) ? `<div class="ai-rule">${esc(it.regle || it.raison)}</div>` : ''}
      ${it.done
        ? `<div class="ai-status">${it.done === 'skip' ? 'Ignoré' : (it.done === 'fail' ? (it.kind === 'style' ? 'Bloc introuvable ou déjà transformé' : 'Passage introuvable (texte déjà modifié ?)') : 'Appliqué ✓')}</div>`
        : `<div class="ai-actions"><button class="pobtn" data-ai="apply" type="button">Appliquer</button><button class="cta ghost small" data-ai="skip" type="button">Ignorer</button><button class="cta ghost small" data-ai="go" type="button" title="Aller au bloc">Voir</button></div>`}
    </div>`).join('') +
    `<div class="ai-foot"><button class="cta ghost small" id="ai-run" type="button">${st.kind === 'style' ? 'Corriger l’orthographe' : 'Relancer la correction'}</button> ${st.kind === 'style' || !st.payload ? '' : '<button class="cta ghost small" id="ai-second" type="button" title="Relire tout le texte une seconde fois, sans la mémoire des phrases déjà relues (une requête de plus)">Seconde lecture</button> '}<button class="cta ghost small" id="ai-style" type="button">${st.kind === 'style' ? 'Relancer la mise en forme' : 'Mise en forme'}</button> <button class="cta ghost small" id="ai-key" type="button" title="Changer ou retirer la clé API">Clé API…</button></div>`;
  body.querySelector('#ai-run').addEventListener('click', () => runAiCorrection());
  const sec = body.querySelector('#ai-second'); if (sec) sec.addEventListener('click', () => runAiCorrection({ second: true }));
  body.querySelector('#ai-style').addEventListener('click', runAiStyle);
  body.querySelector('#ai-key').addEventListener('click', showAiSetup);
  const all = body.querySelector('#ai-all');
  if (all) all.addEventListener('click', () => { st.items.filter(i => !i.done).forEach(applyAiItem); renderAiPanel(); toast(st.kind === 'style' ? 'Mise en forme appliquée — Ctrl+Z pour annuler' : 'Corrections appliquées — Ctrl+Z pour annuler'); });
}
$('#ai-body').addEventListener('click', e => {
  const btn = e.target.closest('[data-ai]'); if (!btn || !aiState) return;
  const item = aiState.items[+btn.closest('.ai-item').dataset.n]; if (!item) return;
  if (btn.dataset.ai === 'skip') { item.done = 'skip'; renderAiPanel(); return; }
  if (btn.dataset.ai === 'go') {
    const el = $(`.block[data-id="${item.id}"]`);
    if (el) { scrollToBlockEl(el, { margin: 40 }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    return;
  }
  applyAiItem(item); renderAiPanel();
});

/* repère visuel d'une correction qui vient d'être appliquée : un surlignage CSS (Highlight API) posé par-dessus
   le texte pendant quelques secondes. Rien n'est écrit dans le cours : pas de balise, donc rien qui « reste »
   ni qui déteigne sur le texte tapé à côté (l'ancien <span class="corr"> faisait les deux). */
function addCorrMark(id, at, from, to) {
  const delta = to.length - from.length;
  for (const m of corrMarks) if (m.id === id && m.at > at) m.at += delta;   // corrections suivantes du même bloc
  corrMarks.push({ id, at, text: to, ts: Date.now(), range: null });
}
function applyCorrMarks() {
  clearTimeout(corrTm);
  if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') { corrMarks = []; return; }
  const now = Date.now();
  corrMarks = corrMarks.filter(m => now - m.ts < CORR_TTL && m.text);
  const ranges = [];
  for (const m of corrMarks) {
    const el = $(`#blocks > .block[data-id="${m.id}"]`); const f = el && el.querySelector(':scope > .btxt');
    if (!f) { m.ts = 0; continue; }
    const a = pointAtOffset(f, m.at), z = pointAtOffset(f, m.at + m.text.length);
    const r = document.createRange();
    try { r.setStart(a.node, a.off); r.setEnd(z.node, z.off); } catch { m.ts = 0; continue; }
    if (r.toString() !== m.text) { m.ts = 0; continue; }
    m.range = r; ranges.push(r);
  }
  corrMarks = corrMarks.filter(m => m.ts);
  if (ranges.length) CSS.highlights.set('alixo-corr', new Highlight(...ranges)); else CSS.highlights.delete('alixo-corr');
  if (corrMarks.length) corrTm = setTimeout(applyCorrMarks, Math.max(200, CORR_TTL - (now - Math.min(...corrMarks.map(m => m.ts))) + 30));
}
/* après une frappe : les repères suivent le texte ; celui dont le mot a été retouché disparaît aussitôt */
function refreshCorrMarks() {
  if (!corrMarks.length) return;
  for (const m of corrMarks) {
    const r = m.range, el = $(`#blocks > .block[data-id="${m.id}"]`), f = el && el.querySelector(':scope > .btxt');
    if (!r || !f || !r.startContainer.isConnected || !f.contains(r.startContainer) || r.toString() !== m.text) { m.ts = 0; continue; }
    m.at = offsetInField(f, r.startContainer, r.startOffset);
  }
  applyCorrMarks();
}
/* anciens cours : retire les <span class="corr"> enregistrés par les versions précédentes */
function stripCorr(html) {
  if (!html || html.indexOf('corr') < 0 || !/class="[^"]*\bcorr\b/.test(html)) return html;
  const t = document.createElement('div'); t.innerHTML = html;
  t.querySelectorAll('span.corr').forEach(s => s.replaceWith(...s.childNodes));
  t.normalize();
  return t.innerHTML;
}
function stripCorrBlock(b) {
  if (typeof b.text === 'string') b.text = stripCorr(b.text);
  if (typeof b.cite === 'string') b.cite = stripCorr(b.cite);
  if (b.fields) for (const k of Object.keys(b.fields)) b.fields[k] = stripCorr(b.fields[k]);
  if (Array.isArray(b.rows)) b.rows.forEach(row => { for (let c = 0; c < row.length; c++) row[c] = stripCorr(row[c]); });
}

/* remplace la première occurrence de `from` dans un fragment HTML (texte uniquement, balises conservées) ;
   `info.at` reçoit la position (en caractères) du remplacement */
function replaceInHTML(html, from, to, rule, info, hint) {
  const t = document.createElement('div'); t.innerHTML = html || '';
  const nodes = [];
  const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) nodes.push(n);
  const soft = s => s.replace(/ /g, ' ');
  const full = soft(nodes.map(x => x.textContent).join(''));
  /* 1.22 : `hint` = position attendue dans le texte brut ; s'il y a plusieurs occurrences, on prend la plus proche */
  const find = needle => {
    let i = full.indexOf(needle); if (i < 0 || typeof hint !== 'number') return i;
    let best = i;
    while (i >= 0) { if (Math.abs(i - hint) < Math.abs(best - hint)) best = i; i = full.indexOf(needle, i + 1); }
    return best;
  };
  let idx = find(soft(from));
  if (idx < 0) {   // 1.18 : apostrophe droite / typographique selon ce que l'IA a renvoyé
    const alt = from.includes("'") ? from.replace(/'/g, '’') : from.replace(/’/g, "'");
    idx = find(soft(alt));
    if (idx < 0) return null;
    from = alt;
  }
  let pos = 0, start = null, end = null;
  for (const node of nodes) {
    const len = node.length;
    if (start === null && idx < pos + len) start = { node, off: idx - pos };
    if (start && idx + from.length <= pos + len) { end = { node, off: idx + from.length - pos }; break; }
    pos += len;
  }
  if (!start || !end) return null;
  const r = document.createRange(); r.setStart(start.node, start.off); r.setEnd(end.node, end.off);
  r.deleteContents();
  r.insertNode(document.createTextNode(to));   // texte nu : la mise en forme autour (gras, couleur…) est conservée
  t.normalize();
  if (info) info.at = idx;
  return t.innerHTML;
}
function applyAiItem(it) {
  const b = getBlock(it.id);
  if (!b) { it.done = 'fail'; return false; }
  if (it.kind === 'style') {
    if (!applyStyle(b, it)) { it.done = 'fail'; return false; }
    it.done = true; touch(); renderBlocks();
    const el = $(`.block[data-id="${b.id}"]`);
    if (el) { scrollToBlockIfHidden(b.id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    return true;
  }
  const info = {};
  const where = replaceInBlock(b, it.avant, it.apres, it.regle, info, it.at);
  if (!where) { it.done = 'fail'; return false; }
  if (where === 'text') addCorrMark(b.id, info.at, it.avant, it.apres);
  it.done = true;
  b.notes = b.notes || [];
  b.notes.push({ from: it.avant, to: it.apres, rule: it.regle || 'Correction appliquée', ts: Date.now() });
  touch(); renderBlocks();
  const el = $(`.block[data-id="${b.id}"]`);
  if (el) { scrollToBlockIfHidden(b.id); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  return true;
}

/* ============================================================
   Analyse automatique par l'IA pendant la frappe : fautes d'orthographe /
   grammaire et mise en forme (définitions, titres, encadrés…) proposées
   sous le bloc, Tab pour tout accepter — et mise en forme de tout le cours
   ============================================================ */
const AI_STYLE_LS = 'alixo.aiStyle';
/* réglages de l'IA (1.15, synchronisés avec le compte) : analyse automatique, fautes, mise en forme, reformulations, niveau */
const AI_DEFAULTS = { auto: true, fix: true, style: true, rephrase: false, level: 'standard', autofix: true, multilang: false };   // 1.21 : autofix (fautes de frappe sûres sans Tab), multilang (corriger aussi les autres langues)
function aiOpt() {
  if (!state.settings.ai) {
    state.settings.ai = Object.assign({}, AI_DEFAULTS);
    try { if (localStorage.getItem(AI_STYLE_LS) === '0') state.settings.ai.auto = false; } catch { /* */ }   // ancien réglage (≤ 1.14)
  }
  return Object.assign({}, AI_DEFAULTS, state.settings.ai);
}
const aiStyleOn = () => aiOpt().auto;
const AI_LEVELS = [['leger', 'Léger', 'Seulement les fautes indiscutables : orthographe, accords, conjugaison'], ['standard', 'Standard', 'Fautes, grammaire, ponctuation et typographie française'], ['strict', 'Strict', 'En plus : majuscules, répétitions, anglicismes, tournures lourdes']];
const STYLE_LABELS = { definition: 'Encadré Définition', arret: 'Encadré Arrêt de principe', retenir: 'Encadré À retenir', exemple: 'Encadré Exemple', controverse: 'Encadré Controverse', bilan: 'Encadré Bilan', drapeau: 'Encadré Drapeaux rouges', reflexe: 'Encadré Réflexe / piège', mnemo: 'Encadré Moyen mnémotechnique', h1: 'Titre de partie (I.)', h2: 'Titre de section (A.)', h3: 'Sous-titre (1.)', h4: 'Paragraphe de plan (a.)', li: 'Élément de liste', quote: 'Citation' };
const styleLabel = it => STYLE_LABELS[it.type] || it.type;
let aiSug = null;            // proposition affichée sous un bloc : { id, style: {type, terme, raison} | null, fixes: [{avant, apres, regle, kind, at}] }
const aiSeen = new Map();    // blocs dont la mise en forme a déjà été jugée ou ignorée (id + texte)
const aiDeclined = new Set();   // corrections refusées (Échap, ✕) cette session : id|avant|apres — jamais reproposées
const styleKey = b => b.id + '|' + blockPlain(b).trim();
/* ---------------- langue d'un texte (1.21) : d'après les mots-outils les plus fréquents ----------------
   L'IA « corrigeait » des notes prises en anglais ou en espagnol comme si c'était du français fautif. */
const LANG_WORDS = {
  fr: 'le la les des une un et est dans pour que qui pas sur avec ce cette ces sont au aux du par il elle nous vous ils elles mais ou donc car ne plus son sa ses leur leurs été être avoir fait comme très aussi entre sans cela lorsque',
  en: 'the and of to in is that for it with as was on are this by be at from or have not but which an they their has were been will would can all more when there what about into than its',
  es: 'el la los las de que y en un una es por para con no se del al lo como más pero sus le ya o este esta son fue ser también hay muy sin sobre entre cuando todo',
  de: 'der die das und ist in den von zu mit nicht ein eine auf für sich dem des auch als es an werden aus wird sind oder bei nach einer über noch wie wenn nur zum zur',
  it: 'il la di che e è un una per non in con sono del della le gli dei delle al alla da come più ma anche si questo questa essere nel nella ha hanno suo sua',
  pt: 'o a os as de que e do da em um uma para com não se por mais dos das no na é são ao foi como mas ou seu sua pelo pela também já isso esse essa'
};
const LANG_SETS = Object.fromEntries(Object.entries(LANG_WORDS).map(([k, v]) => [k, new Set(v.split(' '))]));
const LANG_NAMES = AlixoCorr.LANG_NAMES;
/* 'fr', 'en', 'es', 'de', 'it', 'pt' — ou null si on ne peut pas trancher (texte court, notes télégraphiques) */
function detectLang(text) {
  const words = String(text || '').toLowerCase().replace(/[’]/g, "'").split(/[^a-zà-ÿäöüßñç']+/).filter(Boolean);
  if (words.length < 6) return null;
  const score = {}; for (const k of Object.keys(LANG_SETS)) score[k] = 0;
  for (const w of words) for (const k of Object.keys(LANG_SETS)) if (LANG_SETS[k].has(w)) score[k]++;
  const best = Object.keys(score).sort((a, b) => score[b] - score[a]);
  const top = score[best[0]], second = score[best[1]] || 0;
  if (top < Math.max(2, words.length * 0.08)) return null;
  if (best[0] !== 'fr' && score.fr >= top * 0.8) return 'fr';     // doute : on reste en français
  if (best[0] !== 'fr' && top < second * 1.5) return null;
  return best[0];
}
/* le curseur est-il dans (ou juste après) ce passage du bloc ? → le mot est peut-être encore en cours de frappe */
function caretTouches(b, avant, at) {
  const bl = blockAtSelection(); if (!bl || bl.dataset.id !== b.id) return false;
  const f = activeField(); if (!f) return false;
  const off = caretOffsetIn(f); if (typeof off !== 'number') return false;
  const plain = stripTags(f.innerHTML);
  const pos = typeof at === 'number' && plain.slice(at, at + avant.length) === avant ? at : plain.indexOf(avant);
  return pos >= 0 && off >= pos && off <= pos + avant.length;
}
/* ============================================================
   1.22 — analyse pendant la frappe : le moteur js/corr.js reçoit les phrases (fin de phrase, pause, sortie du bloc),
   ne renvoie vers l'API que celles qu'il ne connaît pas, groupées ; ici on applique ses réponses à l'écran.
   ============================================================ */
const aiAutoType = b => !!b && (TEXT_TYPES.includes(b.type) || b.type === 'cards');
let aiLastStatus = '';   // dernière analyse automatique (Paramètres › IA) : « ok », « aucune faute », ou l'erreur rencontrée
const aiLiveOn = () => isPlus() && !!aiKey() && aiStyleOn();
const aiStamp = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
/* texte d'un bloc pour le moteur (null : bloc non analysable ou dans une autre langue, réglage « autres langues » décoché) */
function corrInfo(blockId) {
  const b = getBlock(blockId); if (!aiAutoType(b)) return null;
  const text = blockPlain(b); if (text.trim().length < 12) return null;
  const lang = detectLang(text);
  if (lang && lang !== 'fr' && !aiOpt().multilang) { aiLastStatus = `${aiStamp()} : bloc en ${LANG_NAMES[lang]} laissé tel quel (Paramètres › IA › autres langues)`; return null; }
  return { text, lang: lang || 'fr', type: b.type };
}
/* le curseur est-il dans la phrase [s, e[ du bloc ? (la phrase en cours de frappe attend la fin de phrase ou la pause) */
function corrCaretIn(blockId, s, e) {
  const bl = blockAtSelection(); if (!bl || bl.dataset.id !== blockId) return false;
  const f = activeField(); if (!f || !f.classList.contains('btxt')) return false;
  const off = caretOffsetIn(f); return typeof off === 'number' && off >= s && off <= e;
}
/* corrections reçues pour un bloc : fautes de frappe sûres appliquées d'office (Ctrl+Z pour revenir), le reste proposé sous le bloc */
function corrDeliver(blockId, list, meta) {
  const b = getBlock(blockId); if (!aiAutoType(b)) return;
  const o = aiOpt(); if (!o.fix) return;
  const text = blockPlain(b);
  const fixes = [];
  for (const it of list) {
    const base = text.indexOf(it.text); if (base < 0) continue;   // phrase modifiée depuis l'envoi
    for (const f of it.fixes) {
      const at = base + f.at;
      if (text.slice(at, at + f.avant.length) !== f.avant) continue;
      if (aiDeclined.has(blockId + '|' + f.avant + '|' + f.apres)) continue;
      if (fixes.some(x => x.at === at && x.avant === f.avant)) continue;
      fixes.push({ avant: f.avant, apres: f.apres, regle: f.regle, kind: f.kind, at });
    }
  }
  aiLastStatus = `${aiStamp()} : ${fixes.length ? fixes.length + ' correction' + (fixes.length > 1 ? 's' : '') : 'aucune faute'}${meta && meta.cached ? ' (mémoire, sans requête)' : ''}`;
  if (!fixes.length) return;
  const snips = state.settings.snippets || [];
  const auto = o.autofix ? fixes.filter(f => AlixoCorr.sureTypo(f) && !snips.some(x => x.k === f.avant) && !caretTouches(b, f.avant, f.at)) : [];
  let rest = fixes.filter(f => !auto.includes(f));
  if (auto.length) {
    const caret = caretSnapshot(b.id); let off = caret && caret.off, n = 0; const done = [];
    for (const f of auto.slice().sort((x, y) => y.at - x.at)) {   // de la fin vers le début : les positions restent valables
      if (applyFix(b, f)) { n++; done.unshift(f); AlixoCorr.learn(f.avant, f.apres); AlixoCorr.note('auto'); if (caret && caret.id === b.id && TEXT_TYPES.includes(b.type) && typeof off === 'number' && f.at < off) off += f.apres.length - f.avant.length; }
    }
    if (n) {
      const delta = at => done.filter(f => f.at < at).reduce((d, f) => d + f.apres.length - f.avant.length, 0);
      rest = rest.map(f => Object.assign({}, f, { at: f.at + delta(f.at) }));
      touch(); renderBlocks(caret ? caret.id : b.id, off, caret && caret.key); applyCorrMarks();
      toast(n === 1 ? `Faute de frappe corrigée : « ${done[0].avant} » → « ${done[0].apres} » — Ctrl+Z pour annuler` : `${n} fautes de frappe corrigées (${done.map(f => f.apres).join(', ')}) — Ctrl+Z pour annuler`);
      aiLastStatus += ` (${n} appliquée${n > 1 ? 's' : ''} d’office)`;
    }
  }
  if (rest.length) {
    const cur = aiSug && aiSug.id === b.id ? aiSug : { id: b.id, style: null, fixes: [] };
    const merged = cur.fixes.filter(x => blockPlain(b).slice(x.at, x.at + x.avant.length) === x.avant);
    for (const f of rest) if (!merged.some(x => x.at === f.at && x.avant === f.avant)) merged.push(f);
    merged.sort((x, y) => x.at - y.at);
    aiSug = { id: b.id, style: cur.style, fixes: merged }; renderSug();
  } else if (!auto.length) return;
  corrMarkClean(b);
}
/* mise en forme proposée pour un paragraphe (à la sortie du bloc) */
function corrStyle(blockId, st) {
  const b = getBlock(blockId); if (!b) return;
  aiSeen.set(styleKey(b), true);
  if (!st || !aiOpt().style || b.type !== 'p' || !STYLE_LABELS[st.type]) return;
  if (!specAllowed((CALLOUTS[st.type] || {}).spec)) return;
  const cur = aiSug && aiSug.id === b.id ? aiSug : { id: b.id, style: null, fixes: [] };
  aiSug = { id: b.id, style: st, fixes: cur.fixes }; renderSug();
  aiLastStatus = (aiLastStatus || aiStamp() + ' :') + ' + mise en forme';
}
/* après une correction appliquée : les phrases du bloc qui n'ont plus rien en attente sont mémorisées comme propres,
   pour ne pas repartir vers l'API à la prochaine pause de frappe */
function corrMarkClean(b) {
  if (!b) return;
  const info = corrInfo(b.id); if (!info) return;
  const o = aiOpt(); const ctx = { level: o.level, lang: info.lang };
  const pend = aiSug && aiSug.id === b.id ? aiSug.fixes : [];
  for (const sn of AlixoCorr.sentences(info.text)) {
    if (!AlixoCorr.worth(sn.text)) continue;
    if (pend.some(f => f.at >= sn.s && f.at < sn.e)) continue;
    const k = AlixoCorr.keyOf(sn.text, ctx);
    if (AlixoCorr.cacheGet(k) === undefined) AlixoCorr.cacheSet(k, []);
  }
}
AlixoCorr.init({
  key: aiKey,
  enabled: aiLiveOn,
  ctx: () => ({ level: aiOpt().level }),
  text: corrInfo,
  caretIn: corrCaretIn,
  onResult: corrDeliver,
  onStyle: corrStyle,
  onError: err => { aiLastStatus = `${aiStamp()} : échec — ${err && err.message || err}`; console.warn('IA (analyse automatique) :', err); }
});
/* à la sortie d'un bloc : tout le bloc (phrases non encore relues) + mise en forme si c'est un paragraphe */
function aiAutoConsider(b) {
  if (!aiAutoType(b) || !aiLiveOn()) return;
  const o = aiOpt();
  const style = o.style && b.type === 'p' && !aiSeen.has(styleKey(b)) && blockPlain(b).trim().length >= 60;
  if (!o.fix && !style) return;
  AlixoCorr.left(b.id, { style });
}
/* pendant la frappe : pause de 2,5 s → les phrases nouvelles ou modifiées partent (groupées) */
function aiAutoTyping(b) { if (aiAutoType(b) && aiLiveOn() && aiOpt().fix) AlixoCorr.typed(b.id); }
/* fin de phrase (. ! ? Entrée) : les phrases terminées partent sans attendre la pause */
function corrSentenceDone(field) {
  const bl = field && field.closest('#blocks > .block'); const b = bl && getBlock(bl.dataset.id);
  if (aiAutoType(b) && aiLiveOn() && aiOpt().fix) setTimeout(() => AlixoCorr.sentenceDone(b.id), 0);
}
/* mise en forme de plusieurs paragraphes (panneau IA, tout le cours) */
const STYLE_RULES = `- "definition" : une notion suivie de sa définition (donne le terme défini dans "terme", tel qu'il apparaît au début du paragraphe)
- "arret" : présentation d'un arrêt ou d'une décision de jurisprudence (juridiction, date, solution)
- "exemple" : un exemple, un cas pratique, une illustration
- "retenir" : une règle essentielle, un point clé à retenir
- "controverse" : un débat doctrinal, des positions opposées
- "bilan" : une synthèse, un récapitulatif de fin de partie (« en résumé », « pour conclure », « ce qu'il faut retenir de cette section »)
- "drapeau" (santé) : des signes de gravité, des critères d'hospitalisation ou d'urgence
- "reflexe" (santé) : un réflexe clinique ou un piège d'examen (« … jusqu'à preuve du contraire », « ne jamais… »)
- "mnemo" (santé) : un moyen mnémotechnique
- "h1", "h2", "h3", "h4" : un titre de plan (court, sans verbe conjugué), du niveau le plus général (h1 = partie) au plus fin (h4)
- "li" : un élément d'énumération
- "quote" : une citation textuelle
Ne propose rien pour les paragraphes ordinaires : mieux vaut aucune proposition qu'une proposition douteuse. Une proposition n'est justifiée que si le paragraphe ENTIER relève clairement de ce type.`;
const parseJsonAnswer = text => { const m = (text || '').match(/[\[{][\s\S]*[\]}]/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
async function aiStyleAnalyze(blocks) {
  const system = `Tu aides un étudiant (droit, économie, médecine et santé, sciences humaines) à structurer ses notes de cours prises dans un éditeur par blocs.
On te donne des paragraphes de texte brut, chacun précédé de son identifiant entre crochets, dans l'ordre du cours.
Pour chaque paragraphe qui gagnerait clairement à être mis en forme, indique le type le plus adapté :
${STYLE_RULES}
Réponds UNIQUEMENT avec un tableau JSON, sans commentaire : [{"id": "identifiant", "type": "…", "terme": "…", "raison": "pourquoi, en quelques mots"}]. Si rien ne s'impose : [].`;
  const user = blocks.map(b => `[${b.id}]\n${b.text}`).join('\n\n');
  const r = await AlixoCorr.call(aiKey(), { system, user, maxTokens: 4000, models: AlixoCorr.MODELS_FULL, timeoutMs: 40000 });
  if (!r.ok) throw new Error(r.status === 400 ? 'Clé API refusée — vérifiez-la (bouton « Clé API… » ou Paramètres).' : r.error);
  const arr = parseJsonAnswer(r.text);
  if (!Array.isArray(arr)) return [];
  return arr.filter(x => x && x.id && STYLE_LABELS[x.type]).map(x => ({ id: String(x.id), type: x.type, terme: String(x.terme || '').trim(), raison: String(x.raison || '').trim() }));
}
/* Paramètres › IA : ce que le moteur a économisé */
function aiStatsText(c) {
  const since = c.since ? new Date(c.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const parts = [`${c.req} requête${c.req > 1 ? 's' : ''} envoyée${c.req > 1 ? 's' : ''}`, `${c.sent} phrase${c.sent > 1 ? 's' : ''} analysée${c.sent > 1 ? 's' : ''}`, `${c.cached} servie${c.cached > 1 ? 's' : ''} par la mémoire`, `${c.local} faute${c.local > 1 ? 's' : ''} de frappe corrigée${c.local > 1 ? 's' : ''} sans requête`];
  return `Depuis le ${since} : ${parts.join(' · ')}${c.tokIn ? ` · ${(c.tokIn + (c.tokOut || 0)).toLocaleString('fr-FR')} jetons` : ''}. Mémoire : ${c.cacheSize} phrases, ${c.learned} mot${c.learned > 1 ? 's' : ''} appris, ${c.ignored} ignoré${c.ignored > 1 ? 's' : ''}.`;
}
/* applique une proposition de mise en forme à un bloc (sans touch/render) */
function applyStyle(b, it) {
  if (!b || !['p', 'li', 'quote', 'h'].includes(b.type)) return false;
  let patch;
  if (/^h[1-4]$/.test(it.type)) patch = { type: 'h', level: +it.type[1], text: b.text || '' };
  else if (it.type === 'li' || it.type === 'quote') patch = { type: it.type, text: b.text || '' };
  else if (STYLE_LABELS[it.type]) {
    if (!specAllowed((CALLOUTS[it.type] || {}).spec)) return false;   // encadré d'une autre spécialité : jamais proposé
    let text = b.text || '';
    const t = (it.terme || '').trim();
    if (it.type === 'definition' && t && !/^\s*<(b|strong)[\s>]/i.test(text) && text.slice(0, t.length).toLowerCase() === t.toLowerCase()) {
      const rest = text.slice(t.length);
      text = `<b>${text.slice(0, t.length)}</b>` + (/^\s*[—–:-]/.test(rest) ? rest : ' —' + rest);
    }
    patch = { type: 'callout', ct: it.type, text };
  } else return false;
  resetBlock(b, patch);
  return true;
}
/* remplace un passage dans n'importe quel bloc corrigeable : texte, source d'une citation, cartes (titre, texte),
   champs d'une fiche, cases d'un tableau — 1.21 : avant, Tab sur une proposition sous un bloc Cartes cherchait le
   passage dans b.text (inexistant) et finissait en « passage introuvable » */
function replaceInBlock(b, avant, apres, regle, info, hint) {
  if (TEXT_TYPES.includes(b.type)) { const h = replaceInHTML(b.text || '', avant, apres, regle, info, hint); if (h !== null) { b.text = h; return 'text'; } }
  if (b.type === 'quote' && b.cite) { const h = replaceInHTML(b.cite, avant, apres, regle); if (h !== null) { b.cite = h; return 'cite'; } }
  if (b.type === 'cards') {
    b.cards = cardsOf(b);
    for (let i = 0; i < b.cards.length; i++) for (const k of ['t', 'x']) { const h = replaceInHTML(b.cards[i][k] || '', avant, apres, regle); if (h !== null) { b.cards[i][k] = h; return 'f:' + k + i; } }
  }
  if (isFiche(b)) for (const k of Object.keys(b.fields || {})) { const h = replaceInHTML(b.fields[k] || '', avant, apres, regle); if (h !== null) { b.fields[k] = h; return 'f:' + k; } }
  if (b.type === 'table') for (let r = 0; r < (b.rows || []).length; r++) for (let c = 0; c < b.rows[r].length; c++) { const h = replaceInHTML(b.rows[r][c] || '', avant, apres, regle); if (h !== null) { b.rows[r][c] = h; return 'c:' + r + ':' + c; } }
  return null;
}
/* applique une correction (sans touch/render) ; renvoie true si le passage a été trouvé */
function applyFix(b, f) {
  const info = {};
  const where = replaceInBlock(b, f.avant, f.apres, f.regle, info, f.at);
  if (!where) return false;
  if (where === 'text') addCorrMark(b.id, info.at, f.avant, f.apres);
  b.notes = b.notes || [];
  b.notes.push({ from: f.avant, to: f.apres, rule: f.regle || 'Correction appliquée', ts: Date.now() });
  return true;
}
function sugNear(id) { return !!aiSug && (aiSug.id === id || blockIndex(aiSug.id) === blockIndex(id) - 1); }
/* deux cartes distinctes sous le bloc : les corrections (Tab) et, à part, la mise en forme (Maj+Tab ou clic) —
   Tab ne change jamais le style du texte */
function sugHTML(b) {
  if (!aiSug || aiSug.id !== b.id) return '';
  const nf = aiSug.fixes.length;
  let out = '';
  if (nf) out += `<div class="ai-sug fixes" contenteditable="false">
    <div class="as-row"><span class="as-ico">✓</span><span class="as-txt"><b>${nf} correction${nf > 1 ? 's' : ''} d’orthographe / grammaire</b></span><span class="as-keys"><kbd>Tab</kbd> ${nf > 1 ? 'tout corriger' : 'corriger'} · <kbd>Échap</kbd> ignorer</span><button class="as-ok" type="button">${nf > 1 ? 'Tout corriger' : 'Corriger'}</button><button class="as-no as-nofix" type="button" title="Ignorer les corrections">✕</button></div>
    ${aiSug.fixes.map((f, i) => `<div class="as-item"><span class="as-txt"><s>${esc(f.avant)}</s> → <b>${esc(f.apres)}</b>${f.regle ? ` <span class="as-rule">— ${esc(f.regle)}</span>` : ''}</span><button class="as-mini as-fixok" data-fix="${i}" type="button" title="Appliquer">✓</button><button class="as-mini as-fixno" data-fix="${i}" type="button" title="Ignorer">✕</button></div>`).join('')}
  </div>`;
  if (aiSug.style) out += `<div class="ai-sug style" contenteditable="false">
    <div class="as-row"><span class="as-ico">✨</span><span class="as-txt"><b>Mise en forme proposée : ${esc(styleLabel(aiSug.style))}</b>${aiSug.style.raison ? ` <span class="as-rule">— ${esc(aiSug.style.raison)}</span>` : ''}</span><span class="as-keys"><kbd>Maj</kbd>+<kbd>Tab</kbd> appliquer</span><button class="as-ok as-styleok" type="button">Appliquer</button><button class="as-no as-styleno" type="button" title="Ignorer la mise en forme">✕</button></div>
  </div>`;
  return out;
}
function renderSug() {
  $$('#blocks .ai-sug').forEach(x => x.remove());
  if (!aiSug) return;
  if (!aiSug.fixes.length && !aiSug.style) { aiSug = null; return; }
  const el = $(`.block[data-id="${aiSug.id}"]`); if (!el) { aiSug = null; return; }
  el.insertAdjacentHTML('beforeend', sugHTML(getBlock(aiSug.id)));
}
function dismissSug() {
  if (!aiSug) return;
  const b = getBlock(aiSug.id); if (b) aiSeen.set(styleKey(b), true);
  for (const f of aiSug.fixes) aiDeclined.add(aiSug.id + '|' + f.avant + '|' + f.apres);   // 1.22 : jamais reproposées
  aiSug = null; renderSug();
}
/* applique une partie de la proposition ; what : { fixes: [indices], style: bool } — sans argument : toutes les corrections, jamais la mise en forme */
function acceptSug(what) {
  if (!aiSug) return;
  const s = aiSug;
  const b = getBlock(s.id);
  if (!b) { aiSug = null; renderSug(); return; }
  const all = !what;
  const fixIdx = all ? s.fixes.map((_, i) => i) : (what.fixes || []);
  const doStyle = all ? false : !!what.style;
  const caret = caretSnapshot(b.id);
  let off = caret.off, applied = 0;
  /* 1.22 : de la fin vers le début, pour que les positions des corrections suivantes restent valables */
  const todo = fixIdx.map(i => s.fixes[i]).filter(Boolean).sort((x, y) => (y.at || 0) - (x.at || 0));
  const shifts = [];
  for (const f of todo) {
    const plain = blockPlain(b); const at = typeof f.at === 'number' && plain.slice(f.at, f.at + f.avant.length) === f.avant ? f.at : plain.indexOf(f.avant);
    if (applyFix(b, Object.assign({}, f, { at }))) { applied++; shifts.push({ at, d: f.apres.length - f.avant.length }); if (f.kind === 'frappe' && AlixoCorr.sureTypo(f)) AlixoCorr.learn(f.avant, f.apres); if (caret.id === b.id && TEXT_TYPES.includes(b.type) && typeof off === 'number' && at >= 0 && at < off) off += f.apres.length - f.avant.length; }
  }
  let styled = false;
  if (doStyle && s.style) styled = applyStyle(b, s.style);
  // ce qui reste à proposer
  const rest = { id: s.id, fixes: s.fixes.filter((_, i) => !fixIdx.includes(i)).map(f => Object.assign({}, f, { at: typeof f.at === 'number' ? f.at + shifts.filter(x => x.at < f.at).reduce((d, x) => d + x.d, 0) : f.at })), style: doStyle ? null : s.style };
  if (styled) rest.style = null;
  aiSug = rest.fixes.length || rest.style ? rest : null;
  if (!aiSug) aiSeen.set(styleKey(b), true);
  if (applied || styled) { touch(); renderBlocks(caret.id, off, caret.key); }
  else renderSug();
  if (applied) corrMarkClean(getBlock(b.id));
  if (applied && styled) toast(`${applied} correction${applied > 1 ? 's' : ''} et ${styleLabel(s.style)} appliquées — Ctrl+Z pour annuler`);
  else if (styled) toast(`${styleLabel(s.style)} — Ctrl+Z pour annuler`);
  else if (applied) toast(`${applied} correction${applied > 1 ? 's' : ''} appliquée${applied > 1 ? 's' : ''} — Ctrl+Z pour annuler`);
  else toast('Passage introuvable (texte déjà modifié ?)');
}
function ignoreSugPart(what) {
  if (!aiSug) return;
  if (what.style) aiSug.style = null;
  if (what.fixes) { aiSug.fixes.forEach((f, i) => { if (what.fixes.includes(i)) aiDeclined.add(aiSug.id + '|' + f.avant + '|' + f.apres); }); aiSug.fixes = aiSug.fixes.filter((_, i) => !what.fixes.includes(i)); }
  if (!aiSug.fixes.length && !aiSug.style) dismissSug(); else renderSug();
}
blocksEl.addEventListener('click', e => {
  if (e.target.closest('.as-styleok')) { acceptSug({ style: true }); return; }
  if (e.target.closest('.as-styleno')) { ignoreSugPart({ style: true }); return; }
  const fo = e.target.closest('.as-fixok'); if (fo) { acceptSug({ fixes: [+fo.dataset.fix] }); return; }
  const fn = e.target.closest('.as-fixno'); if (fn) { ignoreSugPart({ fixes: [+fn.dataset.fix] }); return; }
  if (e.target.closest('.as-ok')) { acceptSug(); return; }
  if (e.target.closest('.as-nofix')) { if (aiSug) ignoreSugPart({ fixes: aiSug.fixes.map((_, i) => i) }); return; }
  if (e.target.closest('.as-no')) dismissSug();
});
blocksEl.addEventListener('mousedown', e => { if (e.target.closest('.ai-sug')) e.preventDefault(); });
/* tout le cours, dans le panneau IA */
async function runAiStyle() {
  const d = doc(); if (!d) return;
  if (!requirePlus('ia')) return;
  if (!aiKey()) { openRightPanel('#aipanel'); showAiSetup(); return; }
  const payload = d.blocks.filter(b => b.type === 'p').map(b => ({ id: b.id, text: blockPlain(b).trim() })).filter(x => x.text.length >= 12).slice(0, 80);
  if (!payload.length) { toast('Aucun paragraphe à analyser'); return; }
  openRightPanel('#aipanel');
  $('#ai-body').innerHTML = `<div class="ai-empty">Analyse de la mise en forme (${payload.length} paragraphe${payload.length > 1 ? 's' : ''})…</div>`;
  try {
    const items = (await aiStyleAnalyze(payload)).map((x, i) => Object.assign(x, { n: i, kind: 'style', done: false, excerpt: ((payload.find(p => p.id === x.id) || {}).text || '').slice(0, 90) }));
    aiState = { items, label: 'mise en forme', kind: 'style' };
    renderAiPanel();
    if (!items.length) toast('Rien à changer : la mise en forme semble déjà adaptée');
  } catch (err) {
    $('#ai-body').innerHTML = `<div class="ai-empty ai-err">${esc(err.message || 'Erreur inattendue')}</div><div class="ai-foot"><button class="cta ghost small" id="ai-style" type="button">Réessayer</button></div>`;
    $('#ai-style').addEventListener('click', runAiStyle);
  }
}

/* ============================================================
   Recherche universelle
   ============================================================ */
let searchSel = 0;
function openSearch() {
  $('#searchov').hidden = false;
  $('#search-input').value = '';
  $('#search-results').innerHTML = '';
  searchSel = 0;
  setTimeout(() => $('#search-input').focus(), 30);
}
function closeSearch() { $('#searchov').hidden = true; }

$('#btn-search').addEventListener('click', openSearch);
$('#searchov').addEventListener('pointerdown', e => { if (!e.target.closest('#searchbox')) closeSearch(); });

function blockPlain(b) {
  if (isFiche(b)) return stripTags(Object.values(b.fields || {}).join(' '));
  if (b.type === 'quote') return stripTags((b.text || '') + (b.cite ? ' ' + b.cite : ''));
  if (b.type === 'chart') return [b.title || 'Graphique', ...(b.labels || [])].join(' ');
  if (b.type === 'score') return (AlixoMed.SCORES[b.sk] || {}).name || 'Score';
  if (b.type === 'mcalc') return (AlixoMed.CALCS[b.ck] || {}).name || 'Calculateur';
  if (b.type === 'timer') return b.label || 'Minuteur';
  if (b.type === 'hr' || b.type === 'pb') return '';
  if (b.type === 'cards') return cardsOf(b).map(c => stripTags(c.t) + (c.x ? ' — ' + stripTags(c.x) : '')).join('\n');
  if (b.type === 'tree') return treePlain(b.root);
  if (b.type === 'table') return (b.rows || []).map(r => r.map(c => stripTags(c)).join(' | ')).join('\n');
  if (b.type === 'formula') return b.src || '';
  if (b.type === 'graph') return (AlixoGraphs.TYPES[b.gtype] || {}).name || '';
  if (b.type === 'img') return stripTags(b.cap || b.alt || '');
  if (b.type === 'draw') return (b.shapes || []).filter(s => s.t === 'text' && s.text).map(s => s.text).join(' ');
  return stripTags(b.text);
}

function doSearch(q) {
  const nq = norm(q);
  if (!nq) { $('#search-results').innerHTML = ''; return; }
  const results = [];
  const sharedList = window.AlixoShare && AlixoShare.enabled ? AlixoShare.sharedDocs() : [];
  for (const d of [...state.docs, ...sharedList]) {
    const f = folder(d.folderId) || (sharedList.includes(d) ? { nom: 'Partagé · ' + (AlixoShare.labelFor(d.id) || '') } : null);
    if (norm(d.titre).includes(nq)) results.push({ d, f, blockId: null, snippet: d.titre });
    if (isSheetDoc(d)) {
      /* tableur : on cherche dans les cellules (js/sheets.js) */
      if (window.AlixoSheets) for (const hit of AlixoSheets.search(d, q, 8)) {
        results.push({ d, f, blockId: null, snippet: `${hit.sheetName} · ${hit.ref} : ${hit.text}`, cell: hit });
        if (results.length > 30) break;
      }
      if (results.length > 30) break;
      continue;
    }
    if (isBoardDoc(d)) {
      /* planche : post-it, textes, flèches et blocs épinglés (js/board.js) */
      if (window.AlixoBoard) for (const hit of AlixoBoard.search(d, q, 8)) {
        results.push({ d, f, blockId: null, snippet: hit.text, item: hit.itemId });
        if (results.length > 30) break;
      }
      if (results.length > 30) break;
      continue;
    }
    if (isQuizDoc(d)) {
      /* quiz : questions, propositions et réponses acceptées (js/quiz.js) */
      if (window.AlixoQuiz) for (const hit of AlixoQuiz.search(d, q, 8)) {
        results.push({ d, f, blockId: null, snippet: hit.text, item: hit.itemId });
        if (results.length > 30) break;
      }
      if (results.length > 30) break;
      continue;
    }
    for (const b of allPageBlocks(d, false)) {
      const txt = blockPlain(b);
      const i = norm(txt).indexOf(nq);
      if (i >= 0) {
        const start = Math.max(0, i - 40);
        const raw = (start > 0 ? '…' : '') + txt.slice(start, i + q.length + 60) + (i + q.length + 60 < txt.length ? '…' : '');
        results.push({ d, f, blockId: b.id, snippet: raw, page: docPages(d).length > 1 ? pageOfBlock(d, b.id) : '' });
        if (results.length > 30) break;
      }
    }
    if (results.length > 30) break;
  }
  searchSel = 0;
  const fileHits = (Array.isArray(state.files) ? state.files : []).filter(f => norm(f.name).includes(nq)).slice(0, 12);
  if (!results.length && !fileHits.length) {
    $('#search-results').innerHTML = `<div class="sr-empty">Aucun résultat pour « ${esc(q)} »</div>`;
    return;
  }
  const mark = t => esc(t).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
  const filesHTML = fileHits.map((f, i) => `<button class="sr-item ${!results.length && i === 0 ? 'sel' : ''}" data-file="${f.id}">
      <div class="sr-top"><span class="mat-chip" style="--mc:${folderTint(f.folderId)}">${esc(folder(f.folderId) ? folder(f.folderId).nom : 'Mes cours')}</span>
      <span class="sr-doc">Fichier · ${esc(AlixoFiles.fmtSize(f.size))}</span></div>
      <div class="sr-snippet">${mark(f.name)}</div></button>`).join('');
  $('#search-results').innerHTML = results.map((r, i) => {
    const snip = esc(r.snippet).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    const tint = folderTint(r.d.folderId);
    return `<button class="sr-item ${i === 0 ? 'sel' : ''}" data-doc="${r.d.id}" data-block="${r.blockId || ''}" data-page="${r.page || ''}"${r.cell ? ` data-sheet="${esc(r.cell.sheetId)}" data-cell="${esc(r.cell.ref)}"` : ''}${r.item ? ` data-item="${esc(r.item)}"` : ''}>
      <div class="sr-top"><span class="mat-chip" style="--mc:${tint}">${esc(r.f ? r.f.nom : 'Mes cours')}</span>
      <span class="sr-doc">${esc(r.d.titre || 'Sans titre')}</span></div>
      <div class="sr-snippet">${snip}</div></button>`;
  }).join('') + filesHTML;
}

$('#search-input').addEventListener('input', e => doSearch(e.target.value));
$('#search-input').addEventListener('keydown', e => {
  const items = $$('.sr-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); searchSel = Math.min(items.length - 1, searchSel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); searchSel = Math.max(0, searchSel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); const it = items[searchSel]; if (it) it.click(); return; }
  else if (e.key === 'Escape') { closeSearch(); return; }
  else return;
  items.forEach((it, i) => it.classList.toggle('sel', i === searchSel));
  if (items[searchSel]) items[searchSel].scrollIntoView({ block: 'nearest' });
});

$('#search-results').addEventListener('click', e => {
  const it = e.target.closest('.sr-item'); if (!it) return;
  closeSearch();
  if (it.dataset.file) { if (window.AlixoFiles) AlixoFiles.open(it.dataset.file); return; }
  openDoc(it.dataset.doc);
  if (it.dataset.cell) { setTimeout(() => { if (window.AlixoSheets) AlixoSheets.reveal(it.dataset.sheet, it.dataset.cell); }, 120); return; }
  if (it.dataset.item) { setTimeout(() => { if (document.body.classList.contains('mode-quiz')) { if (window.AlixoQuiz) AlixoQuiz.reveal(it.dataset.item); } else if (window.AlixoBoard) AlixoBoard.reveal(it.dataset.item); }, 120); return; }
  const bid = it.dataset.block;
  if (bid && it.dataset.page && doc() && doc().page !== it.dataset.page) { switchPage(it.dataset.page, bid); return; }
  if (bid) setTimeout(() => {
    const el = $(`.block[data-id="${bid}"]`);
    if (el) {
      scrollToBlockEl(el, { smooth: false, margin: 40 });
      el.classList.add('flash');
    }
  }, 60);
});

/* ============================================================
   Thème, export, raccourcis globaux
   ============================================================ */
function applyTheme() {
  const tb = $('#btn-theme'); if (tb) tb.hidden = !state.settings.showThemeBtn;   // 1.20 : bouton clair / sombre de la barre, sur demande (Paramètres › Apparence)
  const t = themeLocked(state.settings.theme) ? 'auto' : state.settings.theme;   // thème Alixo+ sans abonnement : automatique (le choix est conservé)
  const skin = APP_THEMES.find(x => x.k === t && x.base && !['light', 'dark'].includes(x.k));
  const html = document.documentElement;
  if (skin) { html.dataset.theme = skin.base; html.dataset.skin = skin.k; }
  else {
    delete html.dataset.skin;
    if (t === 'light' || t === 'dark') html.dataset.theme = t;
    else html.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyDocFont();
  setWindowBg();
  if (window.AlixoGalaxy && AlixoGalaxy.onTheme) AlixoGalaxy.onTheme();
}
$('#btn-theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  state.settings.theme = cur === 'dark' ? 'light' : 'dark';
  save(); applyTheme();
  toast(state.settings.theme === 'dark' ? 'Thème sombre — d’autres thèmes dans Paramètres › Apparence' : 'Thème clair — d’autres thèmes dans Paramètres › Apparence');
});

/* logo : depuis l'éditeur → retour au dossier courant ; depuis la bibliothèque → racine « Mes cours » */
$('#btn-home').addEventListener('click', () => {
  if (currentDocId) showLibrary();
  else gotoFolder(null);
});

/* couleur rgba → couleur opaque équivalente sur fond blanc */
function opaqueOnWhite(c) {
  const m = String(c).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : +m[4];
  const f = v => Math.round(+v * a + 255 * (1 - a));
  return `rgb(${f(m[1])}, ${f(m[2])}, ${f(m[3])})`;
}
/* avant impression : les fonds / couleurs semi-transparents (surlignages) deviennent opaques,
   certains PDF les rendaient en noir ; renvoie une fonction qui rétablit l'état */
function prepareForPrint() {
  renderBlocks();   // état à jour (QR codes des liens, notes…)
  if (pagesActive()) paginate(true);   // 1.23 : les sauts de page de l'écran sont forcés dans le PDF (.pg-first)
  // plusieurs onglets : les autres onglets sont ajoutés à la suite, avec leur titre
  const dd = doc();
  if (dd && docPages(dd).length > 1) {
    const numMapAll = computeNumbers(allPageBlocks(dd, false));
    blocksEl.insertAdjacentHTML('afterbegin', `<div class="print-pgtitle" contenteditable="false">${esc(curPage(dd).titre || '')}</div>`);
    for (const p of docPages(dd)) {
      if (p.id === dd.page) continue;
      blocksEl.insertAdjacentHTML('beforeend', `<div class="print-pgtitle print-pgbreak" contenteditable="false">${esc(p.titre || '')}</div>` + (p.blocks || []).map(b => blockHTML(b, numMapAll)).join(''));
    }
  }
  const root = document.documentElement, theme = root.dataset.theme;
  root.dataset.theme = 'light';   // le PDF sort toujours en clair : fond blanc, encre noire
  setWindowBg('#ffffff');         // version PC : le fond de fenêtre teintait toute la page du PDF
  const changed = [];
  $$('#blocks [style]').forEach(el => {
    const bg = el.style.backgroundColor;
    if (bg && /rgba\(|transparent/i.test(bg)) {
      changed.push([el, 'background-color', bg]);
      const o = /transparent/i.test(bg) ? '' : opaqueOnWhite(bg);
      el.style.backgroundColor = o || '';
    }
    const col = el.style.color;
    if (col && /rgba\(/i.test(col)) { changed.push([el, 'color', col]); el.style.color = opaqueOnWhite(col) || ''; }
  });
  const sel = getSelection(); const hadSel = sel.rangeCount && !sel.isCollapsed;
  if (hadSel) sel.removeAllRanges();
  const active = document.activeElement; if (active && active.blur) active.blur();
  if (cropCtx) cancelCrop();
  clearBlockSel(); hideCalcGhost(); clearTsel();
  return () => { changed.forEach(([el, p, v]) => el.style.setProperty(p, v)); root.dataset.theme = theme; setWindowBg(); if (dd && docPages(dd).length > 1) renderBlocks('__none'); };
}
/* fond de la fenêtre Electron : suit le thème (sinon un éclair clair au démarrage en mode sombre) */
function setWindowBg(color) {
  if (!window.alixoDesktop || !window.alixoDesktop.setWindowBg) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  window.alixoDesktop.setWindowBg(color || bg || (document.documentElement.dataset.theme === 'dark' ? '#141414' : '#f3f5f8'));
}

/* en-tête imprimé : titre, dossier, professeur, date */
function preparePrintHead(d) {
  let ph = $('#print-head');
  if (!ph) { ph = document.createElement('div'); ph.id = 'print-head'; $('#doc').prepend(ph); }
  const sub = [folderPath(d.folderId).map(x => x.nom).join(' › '), d.prof ? 'Professeur : ' + d.prof : '', fmtDate(d.updatedAt)].filter(Boolean).join('  ·  ');
  ph.innerHTML = `<div class="ph-title">${esc(d.titre || 'Sans titre')}</div><div class="ph-sub">${esc(sub)}</div>`;
}
/* ============================================================
   1.23 — Vue par pages : la feuille est découpée en pages A4 identiques à celles du PDF.
   La zone utile d'une page (largeur, hauteur) est celle de printToPDF (main.js › pdfOptions) et de
   @page : 673 × 983 px à 96 dpi ; les marges sont le padding de #doc (styles.css › body.pages-mode).
   Les blocs ne sont jamais déplacés dans le DOM : le bloc qui ouvre une page reçoit la classe
   .pg-first et une marge haute (--pg-mt) qui le pousse au début de la page suivante ; un calque
   #pg-layer dessine la bande grise entre les pages et les numéros. À l'impression, .pg-first force
   un saut de page (break-before) : le PDF reproduit exactement les pages de l'écran.
   Bloc « Saut de page » (/saut, type 'pb') : ce qui suit commence sur une nouvelle page.
   Réglage : Paramètres › Écriture › « Feuille découpée en pages A4 » (state.settings.pageView).
   ============================================================ */
const PG_H = 983;      // hauteur utile d'une page imprimée (px rendus)
const PG_SAFE = 14;    // la page écran est un peu plus courte : jamais de débordement dans le PDF (arrondis, polices)
const PG_BAND = 26;    // bande grise entre deux pages (px rendus)
let pgSig = '', pgRaf = 0, pgObs = null, pgMut = null;
const pagesActive = () => document.body.classList.contains('pages-mode');
/* active ou coupe la vue par pages selon le document ouvert et le réglage */
function applyPagesMode() {
  const d = doc();
  const on = !!d && !isSpecialDoc(d) && state.settings.pageView !== false && !document.body.classList.contains('mobile');
  document.body.classList.toggle('pages-mode', on);
  if (on) {
    if (!pgObs && typeof ResizeObserver === 'function') { pgObs = new ResizeObserver(() => schedulePaginate()); pgObs.observe(blocksEl); }
    if (!pgMut) { pgMut = new MutationObserver(() => schedulePaginate(true)); pgMut.observe(blocksEl, { childList: true }); }
    schedulePaginate(true);
  } else {
    if (pgObs) { pgObs.disconnect(); pgObs = null; }
    if (pgMut) { pgMut.disconnect(); pgMut = null; }
    clearPagination();
  }
}
function clearPagination() {
  pgSig = '';
  blocksEl.querySelectorAll('.pg-first').forEach(el => { el.classList.remove('pg-first'); el.style.removeProperty('--pg-mt'); });
  blocksEl.style.paddingBottom = '';
  const layer = $('#pg-layer'); if (layer) layer.innerHTML = '';
}
function schedulePaginate(reset) {
  if (reset) pgSig = '';
  if (pgRaf) return;
  pgRaf = requestAnimationFrame(() => { pgRaf = 0; paginate(); });
}
/* en-tête de la page 1 (titre, dossier, professeur, date, onglet) : le même que celui du PDF */
function renderPgHead(d) {
  let h = $('#pg-head');
  if (!h) { h = document.createElement('div'); h.id = 'pg-head'; h.contentEditable = 'false'; $('#doc').insertBefore(h, blocksEl); }
  const sub = [folderPath(d.folderId).map(x => x.nom).join(' › '), d.prof ? 'Professeur : ' + d.prof : '', fmtDate(d.updatedAt)].filter(Boolean).join('  ·  ');
  const tabs = docPages(d);
  const html = `<div class="ph-title">${esc(d.titre || 'Sans titre')}</div><div class="ph-sub">${esc(sub)}</div>${tabs.length > 1 ? `<div class="ph-tab">${esc((curPage(d) || {}).titre || '')}</div>` : ''}`;
  if (h.innerHTML !== html) h.innerHTML = html;
  return h;
}
/* calcule les sauts de page ; force : recalcul même si rien n'a changé (après un rendu complet) */
function paginate(force) {
  if (!pagesActive()) return;
  const d = doc(); if (!d) return;
  const docEl = $('#doc');
  const head = renderPgHead(d);
  let layer = $('#pg-layer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'pg-layer'; layer.contentEditable = 'false'; docEl.appendChild(layer); }
  const s = parseFloat(getComputedStyle(docEl).zoom) || 1;    // Paramètres › Écriture › Taille
  const kids = [...blocksEl.children].filter(el => el.classList.contains('block'));
  const heights = kids.map(el => el.getBoundingClientRect().height);
  const sig = s + '|' + head.offsetHeight + '|' + kids.map((el, i) => el.dataset.id + ':' + Math.round(heights[i]) + (el.classList.contains('pb') ? '!' : '')).join(',');
  if (!force && sig === pgSig) return;    // les hauteurs n'ont pas bougé : les sauts restent valables
  pgSig = sig;
  // bloc sous le curseur : mesuré AVANT la remise à plat, pour qu'il reste au même endroit de l'écran après le recalcul
  const selNode = getSelection().rangeCount ? getSelection().anchorNode : null;
  const caretEl = selNode && blocksEl.contains(selNode) ? (selNode.nodeType === 1 ? selNode : selNode.parentElement).closest('#blocks > .block') : null;
  const caretTop = caretEl ? caretEl.getBoundingClientRect().top : null;
  for (const el of kids) if (el.classList.contains('pg-first')) { el.classList.remove('pg-first'); el.style.removeProperty('--pg-mt'); }
  blocksEl.style.paddingBottom = '';
  const cs = getComputedStyle(docEl);
  const padTop = parseFloat(cs.paddingTop) * s, padBottom = parseFloat(cs.paddingBottom) * s;
  const top0 = docEl.getBoundingClientRect().top + padTop;      // haut de la zone utile de la page 1
  const H = PG_H - PG_SAFE, GAPT = padBottom + PG_BAND + padTop;  // hauteur utile ; espace entre deux zones utiles
  const rects = kids.map(el => { const r = el.getBoundingClientRect(); return { el, top: r.top - top0, bottom: r.bottom - top0, pb: el.classList.contains('pb') }; });
  let shift = 0, pageBase = 0, forced = false, pages = 1;
  const ends = [];   // fin de chaque page terminée par une bande grise (coordonnées finales, depuis top0) et son numéro
  const cuts = [];   // fin de page à l'intérieur d'un bloc plus haut qu'une page (ligne pointillée : le PDF se coupe là)
  rects.forEach((r, i) => {
    const ft = r.top + shift, fb = r.bottom + shift;
    // le bloc précédent dépasse la page (plus haut qu'une page, ou presque) : il continue sur la page suivante,
    // comme dans le PDF où le texte se coupe tout seul — pas de page blanche, on avance simplement de page
    while (ft > pageBase + H) { cuts.push({ y: pageBase + H, k: pages }); pageBase += H; pages++; }
    // un bloc plus haut qu'une page entière ne gagne rien à changer de page (il déborderait de toute façon) :
    // il reste à sa place et se coupe comme dans le PDF, au lieu de laisser une page presque vide derrière lui
    const brk = i > 0 && !r.pb && (forced || (fb - pageBase > H && ft > pageBase + 1 && fb - ft <= H));
    forced = r.pb;
    if (!brk) return;
    const pageEnd = pageBase + H;
    const extra = pageEnd + GAPT - ft;
    r.el.classList.add('pg-first');
    r.el.style.setProperty('--pg-mt', ((r.top - rects[i - 1].bottom + extra) / s) + 'px');
    ends.push({ y: pageEnd, k: pages });
    shift += extra;
    pageBase = pageEnd + GAPT; pages++;
  });
  const lastBottom = rects.length ? rects[rects.length - 1].bottom + shift : 0;
  const lastEnd = pageBase + H * Math.max(1, Math.ceil((lastBottom - pageBase) / H));
  const n = pages + Math.max(0, Math.ceil((lastBottom - pageBase) / H) - 1);
  for (let y = pageBase + H, k = pages; y < lastBottom; y += H, k++) cuts.push({ y, k });   // dernier bloc étalé sur plusieurs pages
  if (rects.length) blocksEl.style.paddingBottom = Math.max(0, (lastEnd - lastBottom) / s) + 'px';
  const num = (y, k) => `<div class="pg-num" style="top:${((padTop + y + padBottom / 2) / s - 7).toFixed(1)}px">${k} / ${n}</div>`;
  layer.innerHTML = ends.map(e => `<div class="pg-gap" style="top:${((padTop + e.y + padBottom) / s).toFixed(1)}px;height:${(PG_BAND / s).toFixed(1)}px"></div>` + num(e.y, e.k)).join('')
    + cuts.map(c => `<div class="pg-cut" style="top:${((padTop + c.y) / s).toFixed(1)}px"><span>${c.k} / ${n} · suite page ${c.k + 1} ↓</span></div>`).join('')
    + num(lastEnd, n);
  if (caretEl) {   // le bloc du curseur a bougé (une page s'est ouverte ou fermée au-dessus) : on suit
    const dy = caretEl.getBoundingClientRect().top - caretTop;
    if (Math.abs(dy) > 1) { const w = $('#docwrap'); if (w) w.scrollTo({ top: w.scrollTop + dy, behavior: 'instant' }); }
  }
}

let pdfBusy = false;
/* export PDF : version PC → rendu par Electron (printToPDF) puis boîte « Enregistrer sous » au nom de la séance ;
   version web → boîte d'impression du navigateur */
async function exportPDF() {
  const d = doc(); if (!d || pdfBusy) return;
  if (isSlidesDoc(d)) { if (window.AlixoSlides) AlixoSlides.exportPDF(); return; }
  if (isSheetDoc(d)) { if (window.AlixoSheets) AlixoSheets.exportPDF(); return; }
  if (isBoardDoc(d)) { if (window.AlixoBoard) AlixoBoard.exportPDF(); return; }
  if (isQuizDoc(d)) { if (window.AlixoQuiz) AlixoQuiz.exportPDF(); return; }
  const numMap = computeNumbers(d.blocks);
  const hs = d.blocks.filter(b => b.type === 'h');
  // sommaire uniquement pour les cours longs (sinon il ajoutait une page inutile)
  $('#print-summary').innerHTML = hs.length >= 6
    ? `<h2>Sommaire</h2>` +
      hs.map(b => `<div class="ps-item pl${b.level}"><span class="ptnum">${numMap[b.id]}</span><span>${esc(stripTags(b.text))}</span></div>`).join('')
    : '';
  preparePrintHead(d);
  const title = d.titre || 'Sans titre';
  document.title = title + ' — Alixo';
  const desk = window.alixoDesktop;
  if (!desk || !desk.printToPDF || !desk.saveFile) {
    const restore = prepareForPrint();
    exportWatermark(true);
    try { print(); } finally { restore(); exportWatermark(false); }
    document.title = 'Alixo — Cockpit d’amphi';
    return;
  }
  pdfBusy = true;
  toast('Préparation du PDF…', { duration: 4000 });
  document.body.classList.add('printing');
  const restore = prepareForPrint();
  exportWatermark(true);
  let pdf = null, err = null;
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // laisse le thème clair s'appliquer
    await new Promise(r => setTimeout(r, 120));
    pdf = await desk.printToPDF({ title, footer: `${title}` });
  } catch (e) { err = e; }
  restore();
  exportWatermark(false);
  document.body.classList.remove('printing');
  document.title = 'Alixo — Cockpit d’amphi';
  pdfBusy = false;
  if (!pdf || err) { console.error(err); toast('Export PDF impossible' + (err && err.message ? ' : ' + err.message : '')); return; }
  const r = await desk.saveFile({ name: safeFileName(title) + '.pdf', data: pdf, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r && r.ok) toast(`PDF enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
  else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
}
/* 1.20 : le bouton ⤓ suit le format choisi dans Paramètres › Export (PDF, Word, page web) ; Ctrl+P reste le PDF */
async function exportDoc() {
  const d = doc(); if (!d) return;
  const fmt = EXPORT_FORMATS[state.settings.exportFormat] ? state.settings.exportFormat : 'pdf';
  if (fmt === 'pdf' || isSpecialDoc(d)) { exportPDF(); return; }
  toast(`Préparation du fichier ${EXPORT_FORMATS[fmt].label}…`, { duration: 3000 });
  let css = '';
  if (fmt === 'html') { try { css = await (await fetch('styles.css')).text(); } catch { /* sans styles hors ligne */ } }
  let data;
  try { data = await exportDocFile(d, fmt, css); } catch (e) { console.error(e); toast('Export impossible : ' + (e && e.message || e)); return; }
  const name = safeFileName(d.titre || 'Sans titre') + EXPORT_FORMATS[fmt].ext;
  const desk = window.alixoDesktop;
  if (desk && desk.saveFile) {
    const r = await desk.saveFile({ name, data, filters: [{ name: EXPORT_FORMATS[fmt].label, extensions: [EXPORT_FORMATS[fmt].ext.slice(1)] }] });
    if (r && r.ok) toast(`Fichier enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
    else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: fmt === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/html;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function syncExportBtn() {
  const fmt = EXPORT_FORMATS[state.settings.exportFormat] ? state.settings.exportFormat : 'pdf';
  const b = $('#btn-export'); if (b) b.title = fmt === 'pdf' ? 'Exporter en PDF (Ctrl+P)' : `Exporter en ${EXPORT_FORMATS[fmt].label} (Paramètres › Export) · Ctrl+P : PDF`;
}
$('#btn-export').addEventListener('click', exportDoc);

/* Ctrl+A (1.18) : jamais la page entière — la barre d'outils, le plan et les menus se retrouvaient sélectionnés
   avec le texte. Dans un champ ou dans le texte du cours : comportement natif (le champ, ou tout le cours) ;
   dans l'éditeur sans curseur : tout le cours ; ailleurs (bibliothèque, agenda…) : rien. */
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'a') return;
  const t = e.target;
  if (t && (t.isContentEditable || (t.closest && t.closest('input, textarea')))) return;
  e.preventDefault();
  if (!document.body.classList.contains('mode-editor') || $('.dlgov') || !$('#popover').hidden || !$('#searchov').hidden) return;
  try {
    blocksEl.focus({ preventScroll: true });
    const r = document.createRange(); r.selectNodeContents(blocksEl);
    const sn = getSelection(); sn.removeAllRanges(); sn.addRange(r);
  } catch { /* rien à sélectionner */ }
}, true);

document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
  if (e.key === 'Escape' && !$('#searchov').hidden) { closeSearch(); return; }
  if (document.body.classList.contains('mode-slides')) return;   // présentation : raccourcis dans js/slides.js
  if (document.body.classList.contains('mode-sheet')) return;    // tableur : raccourcis dans js/sheets.js
  if (document.body.classList.contains('mode-board')) return;    // planche : raccourcis dans js/board.js
  if (document.body.classList.contains('mode-quiz')) return;     // quiz : raccourcis dans js/quiz.js
  if (!document.body.classList.contains('mode-editor')) {
    if (mod && e.shiftKey && e.key.toLowerCase() === 'a' && $('#authov') && $('#authov').hidden !== false) { e.preventDefault(); if (libMode === 'agenda') { libMode = 'docs'; renderLibrary(); } else openAgendaHome(); }
    if (mod && e.shiftKey && e.code === 'KeyK' && $('#authov') && $('#authov').hidden !== false) { e.preventDefault(); if (libMode === 'todo') { libMode = 'docs'; renderLibrary(); } else openTodoHome(); }
    return;
  }
  if (slashCtx) return;
  // retour à la bibliothèque : Alt+← (ou bouton « précédent » de la souris)
  if (e.altKey && e.key === 'ArrowLeft' && !mod) { e.preventDefault(); showLibrary(); return; }
  // onglets : Ctrl+W ferme, Ctrl+Tab / Ctrl+Maj+Tab passe au suivant / précédent
  if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(currentDocId); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); togglePanel('#dictpanel', openDictPanel); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); togglePanel('#calpanel', openCalPanel); return; }
  if (mod && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }
  if (mod && e.shiftKey && (e.key === 'PageUp' || e.key === 'PageDown')) { e.preventDefault(); const i = openTabs.indexOf(currentDocId); if (i >= 0) moveTab(currentDocId, i + (e.key === 'PageUp' ? -1 : 1)); return; }
  // annuler / rétablir au niveau du cours (les champs natifs — titre, formules, pop-overs — gardent leur historique)
  if (mod && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (!$('#popover').hidden || !$('#searchov').hidden) return;
    e.preventDefault();
    if (e.key.toLowerCase() === 'y' || e.shiftKey) redoEdit(); else undoEdit();
    return;
  }
  if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPDF(); return; }
  if (e.key === 'F7') { e.preventDefault(); runAiCorrection(); return; }
  if (mod && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    const nb = insertSpecial({ type: 'formula', src: '' });
    editingFormula[nb.id] = true; renderBlocks(nb.id); openMathPanel();
    return;
  }
  if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); if (specAllowed('economie')) openGraphChooser(currentBlockId()); else toast('Graphiques économiques : réservés aux spécialités Économie / gestion / commerce (Paramètres › Modifier mon profil)'); return; }
  if (mod && e.altKey && /^[0-6]$/.test(e.key) && +e.key <= planDepth()) {
    e.preventDefault();
    const b = getBlock(currentBlockId());
    if (b && ['p', 'h', 'li', 'quote'].includes(b.type)) { const off = caretSnapshot(); resetBlock(b, e.key === '0' ? { type: 'p', text: b.text || '' } : { type: 'h', level: +e.key, text: b.text || '' }); touch(); renderBlocks(b.id, off ? off.off : 'end'); }
    return;
  }
  if (e.target.closest && e.target.closest('input, textarea')) return;
  if (mod && e.shiftKey && /^Digit[789]$/.test(e.code)) { e.preventDefault(); setList({ Digit7: 'ol', Digit8: 'ul', Digit9: 'cl' }[e.code]); return; }
  if (mod && e.shiftKey && !e.altKey && /^Key[LERJ]$/.test(e.code)) { e.preventDefault(); setAlign({ KeyL: 'left', KeyE: 'center', KeyR: 'right', KeyJ: 'justify' }[e.code]); return; }
  // exposant / indice : Ctrl+. et Ctrl+, d'après le caractère produit (sur un clavier AZERTY, « . » demande déjà Maj) ;
  // taille du texte : Ctrl+Maj+> / Ctrl+Maj+< (ou Ctrl+Maj+; / Ctrl+Maj+, sur QWERTY)
  if (mod && !e.altKey && (e.key === '.' || e.key === ':')) { e.preventDefault(); applyFmt('superscript'); return; }
  if (mod && !e.altKey && (e.key === ',' || e.key === ';')) { e.preventDefault(); applyFmt('subscript'); return; }
  if (mod && !e.altKey && (e.key === '>' || (e.shiftKey && e.code === 'Period'))) { e.preventDefault(); stepFontSize(1); return; }
  if (mod && !e.altKey && (e.key === '<' || (e.shiftKey && e.code === 'Comma'))) { e.preventDefault(); stepFontSize(-1); return; }
  if (mod && e.shiftKey && !e.altKey && e.code === 'KeyT') { e.preventDefault(); togglePanel('#timerpanel', openTimerPanel); return; }
  if (mod && !e.altKey && e.key === '\\') { e.preventDefault(); applyFmt('removeFormat'); return; }
});

/* ============================================================
   1.9.2 — rangs A / B, items LiSA, graphiques de données, scores
   cliniques, calculateurs, minuteurs, citation (DOI / PMID)
   ============================================================ */

/* ---------------- rang de connaissance (R2C) et filtre « Rang A » ---------------- */
const rangTagHTML = r => `<span class="rtag ${r.toLowerCase()}" contenteditable="false" title="Connaissance de rang ${r} · clic : sélectionner (Suppr pour retirer)">${r}</span>`;
let rankFilter = false;
function blockHasRang(b, r) {
  const re = new RegExp('class="rtag ' + r.toLowerCase() + '"');
  if (TEXT_TYPES.includes(b.type)) return re.test(b.text || '') || re.test(b.cite || '');
  if (isFiche(b)) return Object.values(b.fields || {}).some(h => re.test(h || ''));
  if (b.type === 'table') return (b.rows || []).flat().some(h => re.test(h || ''));
  return false;
}
function toggleRankFilter() {
  rankFilter = !rankFilter;
  const btn = $('#pp-rang'); if (btn) btn.classList.toggle('on', rankFilter);
  applyDayFilter();
  const n = $$('#blocks > .block:not(.day-hidden)').length;
  toast(rankFilter ? `Rang A seulement — ${n} passage${n > 1 ? 's' : ''}` : 'Tout le cours');
}
/* visibilité des commandes propres au mode Santé */
function syncHealthUI() {
  document.body.classList.toggle('health', healthMode());
  if (!healthMode() && rankFilter) toggleRankFilter();
}
blocksEl.addEventListener('click', e => {
  const t = e.target.closest('.rtag'); if (!t) return;
  e.preventDefault();
  const r = document.createRange(); r.selectNode(t);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  toast('Rang sélectionné — Suppr pour le retirer');
});

/* ---------------- item LiSA (programme du 2e cycle) ---------------- */
function itemChipHTML(num, title, rang) {
  const label = `Item ${num}${title ? ' · ' + title : ''}`;
  const url = 'https://www.google.com/search?q=' + encodeURIComponent(`LiSA UNESS item ${num} ${title || ''}`.trim());
  return `<a class="refart item" contenteditable="false" target="_blank" href="${url}" data-item="${esc(String(num))}" data-rang="${esc(rang || '')}" title="Item LiSA ${num}${title ? ' — ' + esc(title) : ''}${rang ? ' · rang ' + rang : ''} · Ctrl+clic : rechercher la fiche LiSA · clic : sélectionner (Suppr pour retirer)">${esc(label)}</a>${rang ? rangTagHTML(rang) : ''}`;
}
/* items déjà saisis (tous les cours) → suggestions */
function knownItems() {
  const map = new Map();
  for (const d of state.docs) for (const b of d.blocks || []) {
    const htmls = TEXT_TYPES.includes(b.type) ? [b.text || ''] : isFiche(b) ? Object.values(b.fields || {}) : [];
    for (const h of htmls) { if (!h || h.indexOf('refart item') < 0) continue; const t = document.createElement('div'); t.innerHTML = h; t.querySelectorAll('a.item').forEach(a => { const n = a.dataset.item; const title = a.textContent.replace(/^Item \d+\s*·?\s*/, ''); if (n && !map.has(n)) map.set(n, title); }); }
  }
  return map;
}
function openItemPopover(bid) {
  const ictx = captureInsertCtx();
  const anchor = ictx.field ? (caretRect(ictx.field) || ictx.field.getBoundingClientRect()) : anchorForBlock(bid || currentBlockId());
  const known = knownItems();
  showPopover(`<h4>Item LiSA</h4>
    <div class="po-row"><input id="po-item-n" placeholder="N° (1 à 367)" inputmode="numeric" maxlength="3" style="flex:0 0 96px" list="po-items"><input id="po-item-t" placeholder="Intitulé (ex. Thrombose veineuse profonde)"></div>
    <datalist id="po-items">${[...known.entries()].map(([n, t]) => `<option value="${esc(n)}">${esc(t)}</option>`).join('')}</datalist>
    <div class="po-row" style="margin-top:8px; align-items:center; gap:10px"><span class="po-label" style="margin:0">Rang</span><label class="po-check"><input type="radio" name="po-rang" value=""> aucun</label><label class="po-check"><input type="radio" name="po-rang" value="A" checked> A</label><label class="po-check"><input type="radio" name="po-rang" value="B"> B</label><button class="pobtn" id="po-item-ok" style="margin-left:auto">Insérer</button></div>
    <div class="po-hint">Inséré à l’endroit du curseur sous forme de bouton (Ctrl+clic : recherche de la fiche LiSA). Les intitulés déjà saisis sont proposés d’après le numéro.</div>`,
    anchor, pop => {
      const iN = pop.querySelector('#po-item-n'), iT = pop.querySelector('#po-item-t');
      iN.addEventListener('input', () => { const t = known.get(iN.value.trim()); if (t && !iT.value) iT.value = t; });
      const ok = () => {
        const n = parseInt(iN.value, 10);
        if (!n || n < 1 || n > 367) { toast('Numéro d’item entre 1 et 367'); iN.focus(); return; }
        const rang = (pop.querySelector('input[name="po-rang"]:checked') || {}).value || '';
        hidePopover();
        insertHTMLAtCtx(ictx, itemChipHTML(n, iT.value.trim(), rang) + '&nbsp;', bid);
        toast(`Item ${n} inséré`);
      };
      pop.querySelector('#po-item-ok').addEventListener('click', ok);
      [iN, iT].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
      setTimeout(() => iN.focus(), 40);
    });
}

/* ---------------- insertion d'un objet depuis un choix (score, calculateur…) ---------------- */
function insertObjectSmart(spec, bid, inlineCtx) {
  const b = getBlock(bid);
  if (isEmptyPara(b)) { resetBlock(b, Object.assign({}, spec, { id: b.id })); touch(); renderBlocks('__none'); selectObj(b.id); return b; }
  if (inlineCtx && inlineCtx.field && inlineCtx.field.isConnected) {
    const host = inlineCtx.field.isContentEditable ? inlineCtx.field.closest('[contenteditable="true"]') : blocksEl;
    (host || blocksEl).focus({ preventScroll: true });
    const sel = getSelection(); sel.removeAllRanges(); try { sel.addRange(inlineCtx.range); } catch { /* plage perdue */ }
    const nb = Object.assign({ id: uid() }, spec);
    insertBlocksAtCaret([nb]);
    const got = getBlock(nb.id); if (got) selectObj(nb.id);
    return got || nb;
  }
  const nb = insertAfter(bid || currentBlockId(), Object.assign({ id: uid() }, spec));
  selectObj(nb.id);
  return nb;
}

/* ---------------- graphiques de données ---------------- */
function refreshChart(bl, b) {
  bl.querySelector('.cwrap').innerHTML = AlixoCharts.svg(b);
  const o = b.opts || {};
  bl.querySelectorAll('[data-ct]').forEach(x => x.classList.toggle('on', x.dataset.ct === b.ck));
  const set = (k, on) => { const x = bl.querySelector(`[data-cact="${k}"]`); if (x) x.classList.toggle('on', !!on); };
  set('legend', o.legend !== false); set('values', o.values); set('stack', o.stack);
}
blocksEl.addEventListener('click', e => {
  const bl = e.target.closest('#blocks > .block.chart'); if (!bl) return;
  const b = getBlock(bl.dataset.id); if (!b || b.type !== 'chart') return;
  const ct = e.target.closest('[data-ct]');
  if (ct) { b.ck = ct.dataset.ct; touch(); refreshChart(bl, b); selectObj(b.id); return; }
  const act = e.target.closest('[data-cact]'); if (!act) return;
  const k = act.dataset.cact;
  b.opts = b.opts || {};
  if (k === 'data') { openChartDataPopover(b.id, act.getBoundingClientRect()); return; }
  if (k === 'colors') { openChartColorsPopover(b.id, act.getBoundingClientRect()); return; }
  if (k === 'del') { deleteObj(b.id); return; }
  if (k === 'legend') b.opts.legend = b.opts.legend === false;
  if (k === 'values') b.opts.values = !b.opts.values;
  if (k === 'stack') b.opts.stack = !b.opts.stack;
  touch(); refreshChart(bl, b); selectObj(b.id);
});
blocksEl.addEventListener('dblclick', e => {
  const bl = e.target.closest('#blocks > .block.chart .cwrap'); if (!bl) return;
  openChartDataPopover(bl.closest('.block').dataset.id);
});
function openChartDataPopover(id, anchor) {
  const b = getBlock(id); if (!b || b.type !== 'chart') return;
  const bl = $(`#blocks > .block[data-id="${id}"]`);
  /* 1.22 : tableau dynamique (catégories en lignes, séries en colonnes) avec aperçu en direct sur le graphique ;
     le mode texte (collage d'un bloc entier) reste disponible. Travail sur une copie : Annuler / Échap restaure. */
  const w = AlixoCharts.workCopy(b);
  let done = false;
  showPopover(`<h4>Données du graphique</h4>
    <div class="po-row"><input id="cd-title" placeholder="Titre (facultatif)" value="${esc(b.title || '')}"></div>
    <div class="po-row" style="margin-top:6px"><input id="cd-unit" placeholder="Unité (%, €, mmol/L…)" value="${esc((b.opts || {}).unit || '')}" style="flex:0 0 150px"><input id="cd-ymin" placeholder="Min. axe" value="${esc((b.opts || {}).ymin ?? '')}"><input id="cd-ymax" placeholder="Max. axe" value="${esc((b.opts || {}).ymax ?? '')}"></div>
    <div id="cd-grid" class="cd-grid"></div>
    <div class="po-hint">Tapez directement dans les cases : <b>Entrée</b> passe à la ligne suivante (et en ajoute une au bout), <b>Tab</b> et les flèches vont de case en case, × retire une ligne ou une série. Collez une plage depuis Excel / Sheets dans une case : elle se remplit à partir de là ; collée dans la case « Catégorie », elle remplace tout (première ligne = noms des séries). Le graphique se met à jour pendant la saisie.</div>
    <div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:8px"><button class="cta ghost small" id="cd-cancel" type="button">Annuler</button><button class="pobtn" id="cd-ok" type="button">Appliquer</button></div>`,
    anchor || anchorForBlock(id), pop => {
      pop.style.left = Math.max(12, Math.min(parseFloat(pop.style.left) || 12, innerWidth - pop.offsetWidth - 12)) + 'px';
      const gridEl = pop.querySelector('#cd-grid');
      const readMeta = () => {
        const n = sel => { const v = parseFloat((pop.querySelector(sel).value || '').replace(',', '.')); return isFinite(v) ? v : null; };
        return { title: pop.querySelector('#cd-title').value.trim(), unit: pop.querySelector('#cd-unit').value.trim(), ymin: n('#cd-ymin'), ymax: n('#cd-ymax') };
      };
      const optsWith = m => { const o = Object.assign({}, b.opts || {}, { unit: m.unit }); if (m.ymin !== null) o.ymin = m.ymin; else delete o.ymin; if (m.ymax !== null) o.ymax = m.ymax; else delete o.ymax; return o; };
      const previewNow = () => { if (!bl) return; const m = readMeta(); bl.querySelector('.cwrap').innerHTML = AlixoCharts.svg(Object.assign({}, b, AlixoCharts.cleanWork(w), { title: m.title, opts: optsWith(m) })); };
      let tm = null; const soon = () => { clearTimeout(tm); tm = setTimeout(previewNow, 60); };
      const mountText = () => {
        gridEl.innerHTML = `<textarea id="cd-data" class="cd-data" spellcheck="false" rows="9">${esc(AlixoCharts.toText(AlixoCharts.cleanWork(w)))}</textarea>
          <div class="cg-actions"><span class="po-hint" style="margin:0; flex:1">Une ligne par catégorie : étiquette puis une valeur par série (tabulation, « ; » ou « , ») ; première ligne : noms des séries.</span><button type="button" class="cg-grid">Mode tableau</button></div>`;
        const ta = gridEl.querySelector('#cd-data');
        const sync = () => { const parsed = AlixoCharts.parseText(ta.value, w); if (parsed) { w.labels = parsed.labels; w.series = parsed.series; return true; } return false; };
        ta.addEventListener('input', () => { if (sync()) soon(); });
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); } if (e.key === 'Tab') { e.preventDefault(); const st = ta.selectionStart; ta.value = ta.value.slice(0, st) + '\t' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = st + 1; } });
        gridEl.querySelector('.cg-grid').addEventListener('click', () => { if (!sync() && ta.value.trim()) { toast('Données illisibles : une étiquette puis des nombres sur chaque ligne'); return; } mountGrid(); });
        ta.focus();
      };
      const mountGrid = () => { AlixoCharts.bindGrid(gridEl, w, soon, { onText: mountText }); };
      pop.querySelectorAll('#cd-title, #cd-unit, #cd-ymin, #cd-ymax').forEach(x => x.addEventListener('input', soon));
      const commit = () => {
        const c = AlixoCharts.cleanWork(w);
        if (!c.labels.length || !c.series.length) { toast('Le graphique a besoin d’au moins une catégorie et une série'); return false; }
        const m = readMeta();
        b.labels = c.labels; b.series = c.series; b.title = m.title; b.opts = optsWith(m);
        done = true; touch(); if (bl) refreshChart(bl, b); selectObj(id);
        return true;
      };
      const restore = () => { done = true; if (bl) refreshChart(bl, b); };
      const ok = () => { if (commit()) { hidePopover(); toast('Graphique mis à jour'); } };
      pop.querySelector('#cd-ok').addEventListener('click', ok);
      pop.querySelector('#cd-cancel').addEventListener('click', () => { restore(); hidePopover(); });
      pop.addEventListener('keydown', e => { if (e.key === 'Escape') restore(); });
      /* fermé autrement (clic ailleurs) : les données saisies sont gardées si elles sont valables */
      pop._onHide = () => { if (done) return; const c = AlixoCharts.cleanWork(w); if (c.labels.length && c.series.length) commit(); else restore(); };
      mountGrid();
      setTimeout(() => { const first = gridEl.querySelector('.cg-val') || gridEl.querySelector('input'); if (first) { first.focus(); first.select(); } }, 40);
    });
}
function openChartColorsPopover(id, anchor) {
  const b = getBlock(id); if (!b || b.type !== 'chart') return;
  const pie = b.ck === 'pie' || b.ck === 'donut';
  const rows = pie ? (b.labels || []).map((l, i) => ({ i, name: l, color: ((b.series[0] || {}).colors || [])[i] || AlixoCharts.PALETTE[i % AlixoCharts.PALETTE.length] })) : (b.series || []).map((s, i) => ({ i, name: s.name || 'Série ' + (i + 1), color: s.color || AlixoCharts.PALETTE[i % AlixoCharts.PALETTE.length] }));
  showPopover(`<h4>Couleurs ${pie ? 'des secteurs' : 'des séries'}</h4><div class="po-list">${rows.map(r => `<button data-ci="${r.i}"><span class="cswatch" style="background:${r.color}"></span>${esc(r.name)}</button>`).join('')}</div>
    <div class="po-hint">Cliquer pour choisir une couleur.</div>`, anchor || anchorForBlock(id), pop => {
      pop.querySelector('.po-list').addEventListener('click', e => {
        const btn = e.target.closest('[data-ci]'); if (!btn) return;
        const i = +btn.dataset.ci;
        openPalettePopover(btn.getBoundingClientRect(), { title: 'Couleur', none: 'Automatique', quick: AlixoCharts.PALETTE, current: rows[i].color, onPick: c => {
          if (pie) { const s = b.series[0]; if (!s) return; s.colors = s.colors || []; s.colors[i] = c === 'none' ? null : c; }
          else { const s = b.series[i]; if (!s) return; if (c === 'none') delete s.color; else s.color = c; }
          touch(); const bl = $(`#blocks > .block[data-id="${id}"]`); if (bl) refreshChart(bl, b); selectObj(id);
        } });
      });
    });
}

/* ---------------- scores cliniques ---------------- */
function scoreTotal(b) {
  const sc = AlixoMed.SCORES[b.sk]; if (!sc) return 0;
  const vals = Array.isArray(b.vals) ? b.vals : [];
  let t = 0;
  sc.items.forEach((it, i) => { if (it.opts) { const v = vals[i]; if (typeof v === 'number') t += v; } else if (vals[i]) t += it.p; });
  return Math.round(t * 10) / 10;
}
function refreshScore(bl, b) {
  const sc = AlixoMed.SCORES[b.sk]; if (!sc) return;
  const total = scoreTotal(b);
  const it = sc.interp.find(([a, z]) => total >= a && total <= z);
  const tot = bl.querySelector('.score-total');
  if (tot) tot.innerHTML = `<span>Total</span><b>${Number.isInteger(total) ? total : total.toFixed(1)}</b>${it ? `<span class="score-interp">${esc(it[2])}</span>` : ''}`;
}
blocksEl.addEventListener('change', e => {
  const t = e.target; if (!t.matches('.score-items [data-si]')) return;
  const bl = t.closest('.block'); const b = getBlock(bl.dataset.id); if (!b || b.type !== 'score') return;
  b.vals = Array.isArray(b.vals) ? b.vals : [];
  const i = +t.dataset.si;
  b.vals[i] = t.tagName === 'SELECT' ? (t.value === '' ? null : +t.value) : !!t.checked;
  touch(); refreshScore(bl, b);
});
function openScoreChooser(bid, inlineCtx) {
  const entries = Object.entries(AlixoMed.SCORES);
  showPopover(`<h4>Score clinique</h4><div class="po-list po-scores">${entries.map(([k, s]) => `<button data-sk="${k}"><b>${esc(s.name)}</b><span class="sm-sub">${esc(s.sub || '')}</span></button>`).join('')}</div>`,
    anchorForBlock(bid || currentBlockId()), pop => {
      pop.querySelector('.po-list').addEventListener('click', e => {
        const btn = e.target.closest('[data-sk]'); if (!btn) return;
        hidePopover();
        insertObjectSmart({ type: 'score', sk: btn.dataset.sk, vals: [] }, bid, inlineCtx);
        toast(`${AlixoMed.SCORES[btn.dataset.sk].name} — cochez les critères, le total et l’interprétation se calculent`);
      });
    });
}

/* ---------------- calculateurs cliniques ---------------- */
function mcalcVals(b) {
  const c = AlixoMed.CALCS[b.ck]; if (!c) return {};
  const src = b.vals && typeof b.vals === 'object' ? b.vals : {};
  const out = {};
  for (const inp of c.inputs) {
    const raw = src[inp.k];
    if (inp.sel) { out[inp.k] = raw !== undefined && raw !== null && raw !== '' ? raw : inp.d; continue; }
    if (inp.date) { out[inp.k] = raw || inp.d || ''; continue; }
    const v = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
    out[inp.k] = isFinite(v) ? v : (raw === '' ? NaN : inp.d);
  }
  return out;
}
function refreshCalc(bl, b) {
  const c = AlixoMed.CALCS[b.ck]; if (!c) return;
  let res = [];
  try { res = c.out(mcalcVals(b)); } catch { res = []; }
  const out = bl.querySelector('.mcalc-out');
  if (out) out.innerHTML = res.map(r => `<div class="mcalc-res"><span>${esc(r.l)}</span><b>${esc(typeof r.v === 'number' && !isFinite(r.v) ? '—' : String(r.v).replace('.', ','))}</b>${r.u ? `<span class="mcalc-u">${esc(r.u)}</span>` : ''}${r.note ? `<span class="score-interp">${esc(r.note)}</span>` : ''}</div>`).join('');
}
blocksEl.addEventListener('input', e => {
  const t = e.target; if (!t.matches('.mcalc-in [data-mk]')) return;
  const bl = t.closest('.block'); const b = getBlock(bl.dataset.id); if (!b || b.type !== 'mcalc') return;
  b.vals = b.vals && typeof b.vals === 'object' ? b.vals : {};
  b.vals[t.dataset.mk] = t.value;
  touch({ typing: true, blockId: b.id + ':' + t.dataset.mk }); refreshCalc(bl, b);
});
blocksEl.addEventListener('keydown', e => {
  const t = e.target; if (!t.matches || !t.matches('.mcalc-in input')) return;
  if (e.key === 'Enter') { e.preventDefault(); const bl = t.closest('.block'); selectObj(bl.dataset.id); }
  if (e.key === 'Escape') { e.preventDefault(); const bl = t.closest('.block'); selectObj(bl.dataset.id); }
});
function openCalcChooser(bid, inlineCtx) {
  const entries = Object.entries(AlixoMed.CALCS);
  showPopover(`<h4>Calculateur clinique</h4><div class="po-list po-scores">${entries.map(([k, c]) => `<button data-ck="${k}"><b>${esc(c.name)}</b><span class="sm-sub">${esc(c.sub || '')}</span></button>`).join('')}</div>`,
    anchorForBlock(bid || currentBlockId()), pop => {
      pop.querySelector('.po-list').addEventListener('click', e => {
        const btn = e.target.closest('[data-ck]'); if (!btn) return;
        hidePopover();
        insertObjectSmart({ type: 'mcalc', ck: btn.dataset.ck, vals: {} }, bid, inlineCtx);
        toast(`${AlixoMed.CALCS[btn.dataset.ck].name} — saisissez les valeurs, le résultat se met à jour`);
      });
    });
}

/* ---------------- minuteurs : blocs dans le cours + panneau (chronomètre, compte à rebours) ---------------- */
const fmtClock = secs => {
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return (h ? h + ':' : '') + pad2(m) + ':' + pad2(s);
};
let audioCtx = null;
function beep(n = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for (let i = 0; i < n; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i === n - 1 ? 1320 : 880;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t); o.stop(t + 0.24);
    }
  } catch { /* audio indisponible */ }
}
/* blocs minuteur : état d'exécution en mémoire (le cours ne garde que la configuration) */
const timerRuns = {};   // id → { t0 (ms), base (s écoulées avant t0), paused, over }
function timerElapsed(id) { const r = timerRuns[id]; if (!r) return 0; return r.base + (r.paused ? 0 : (Date.now() - r.t0) / 1000); }
function timerDisplay(b) {
  const el = timerElapsed(b.id);
  return b.mode === 'up' ? el : Math.max(0, (+b.secs || 0) - el);
}
function startTimerBlock(id) {
  const b = getBlock(id); if (!b) return;
  const r = timerRuns[id];
  if (r && !r.paused) { r.paused = true; r.base = timerElapsed(id); }
  else if (r && r.paused) { r.paused = false; r.t0 = Date.now(); }
  else timerRuns[id] = { t0: Date.now(), base: 0, paused: false, over: false };
  ensureTimerTick();
  renderTimerBlock(id);
}
function resetTimerBlock(id) { delete timerRuns[id]; renderTimerBlock(id); }
function stopTimerBlock(id) { delete timerRuns[id]; }
function renderTimerBlock(id) {
  const b = getBlock(id); const bl = $(`#blocks > .block.timer[data-id="${id}"]`); if (!b || !bl) return;
  const r = timerRuns[id];
  bl.classList.toggle('running', !!r && !r.paused);
  bl.classList.toggle('over', !!r && r.over);
  const d = bl.querySelector('.timer-digits'); if (d) d.textContent = fmtClock(timerDisplay(b));
  const t = bl.querySelector('[data-tm="toggle"]'); if (t) t.textContent = r && !r.paused ? '❚❚' : '▶';
}
let timerTick = null;
function ensureTimerTick() { if (!timerTick) timerTick = setInterval(tickTimers, 250); }
function tickTimers() {
  let any = false;
  const d = doc();
  for (const id of Object.keys(timerRuns)) {
    const r = timerRuns[id]; const b = d && d.blocks.find(x => x.id === id);
    if (!b) { delete timerRuns[id]; continue; }
    any = true;
    if (r.paused) continue;
    if (b.mode !== 'up' && !r.over && timerDisplay(b) <= 0) { r.over = true; r.paused = true; r.base = +b.secs || 0; beep(); toast(`⏱ Temps écoulé${b.label ? ' — ' + b.label : ''}`, { duration: 6000 }); }
    renderTimerBlock(id);
  }
  tickPanelTimer();
  if (!any && !tp.sw.on && !tp.cd.on) { clearInterval(timerTick); timerTick = null; }
}
blocksEl.addEventListener('click', e => {
  const btn = e.target.closest('#blocks > .block.timer [data-tm]');
  if (btn) {
    const id = btn.closest('.block').dataset.id;
    if (btn.dataset.tm === 'toggle') startTimerBlock(id);
    else if (btn.dataset.tm === 'reset') resetTimerBlock(id);
    else openTimerBlockPopover(id, btn.getBoundingClientRect());
    return;
  }
  const jt = e.target.closest('.jtimer');   // station ECOS : compte à rebours de 7 min dans le panneau
  if (jt) { e.preventDefault(); openTimerPanel(); setCountdown(+jt.dataset.tstart || 420, 'Station ECOS'); startCountdown(); }
});
blocksEl.addEventListener('pointerdown', e => { if (e.target.closest('.jtimer, .block.timer button')) e.preventDefault(); });
function openTimerBlockPopover(id, anchor) {
  const b = getBlock(id); if (!b || b.type !== 'timer') return;
  const mins = Math.floor((+b.secs || 0) / 60), secs = (+b.secs || 0) % 60;
  showPopover(`<h4>Minuteur</h4>
    <div class="po-radios" id="tb-mode"><label><input type="radio" name="tbm" value="down" ${b.mode !== 'up' ? 'checked' : ''}> Compte à rebours</label><label><input type="radio" name="tbm" value="up" ${b.mode === 'up' ? 'checked' : ''}> Chronomètre</label></div>
    <div class="po-row" style="margin-top:8px"><label style="flex:1">Minutes<input id="tb-min" inputmode="numeric" value="${mins}"></label><label style="flex:1">Secondes<input id="tb-sec" inputmode="numeric" value="${secs}"></label></div>
    <div class="pal-quick img-presets" style="margin-top:6px">${[1, 2, 5, 7, 10, 15, 25, 60].map(m => `<button data-tmin="${m}" type="button">${m} min</button>`).join('')}</div>
    <div class="po-row" style="margin-top:8px"><input id="tb-label" placeholder="Libellé (ex. Station ECOS, QCM…)" value="${esc(b.label || '')}"></div>
    <div class="po-row" style="justify-content:flex-end; margin-top:10px"><button class="pobtn" id="tb-ok" type="button">Appliquer</button></div>`,
    anchor || anchorForBlock(id), pop => {
      pop.querySelectorAll('[data-tmin]').forEach(x => x.addEventListener('click', () => { pop.querySelector('#tb-min').value = x.dataset.tmin; pop.querySelector('#tb-sec').value = 0; }));
      const ok = () => {
        b.mode = pop.querySelector('input[name="tbm"]:checked').value;
        b.secs = Math.max(0, (parseInt(pop.querySelector('#tb-min').value, 10) || 0) * 60 + (parseInt(pop.querySelector('#tb-sec').value, 10) || 0));
        b.label = pop.querySelector('#tb-label').value.trim();
        delete timerRuns[id];
        hidePopover(); touch(); renderBlocks('__none'); selectObj(id);
      };
      pop.querySelector('#tb-ok').addEventListener('click', ok);
      pop.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
      setTimeout(() => { const i = pop.querySelector('#tb-min'); i.focus(); i.select(); }, 40);
    });
}

/* panneau : chronomètre (tours) + compte à rebours ; l'état survit à un rechargement (localStorage) */
const TIMER_LS = 'alixo.timer';
let tp = { sw: { on: false, base: 0, t0: 0, laps: [] }, cd: { on: false, total: 420, base: 420, t0: 0, over: false, label: '' } };
try { const saved = JSON.parse(localStorage.getItem(TIMER_LS)); if (saved && saved.sw && saved.cd) tp = saved; } catch { /* état absent */ }
function saveTp() { try { localStorage.setItem(TIMER_LS, JSON.stringify(tp)); } catch { /* stockage indisponible */ } }
const swElapsed = () => tp.sw.base + (tp.sw.on ? (Date.now() - tp.sw.t0) / 1000 : 0);
const cdRemaining = () => Math.max(0, tp.cd.base - (tp.cd.on ? (Date.now() - tp.cd.t0) / 1000 : 0));
function openTimerPanel() { openRightPanel('#timerpanel'); renderTimerPanel(); ensureTimerTick(); }
function renderTimerPanel() {
  const body = $('#timer-body'); if (!body) return;
  const laps = tp.sw.laps.slice().reverse();
  body.innerHTML = `<div class="tp-card">
      <div class="tp-title">Chronomètre</div>
      <div class="tp-digits" id="tp-sw">${fmtClock(swElapsed())}</div>
      <div class="tp-btns"><button class="cta small" data-tp="sw-toggle">${tp.sw.on ? 'Pause' : (tp.sw.base ? 'Reprendre' : 'Démarrer')}</button><button class="cta ghost small" data-tp="sw-lap" ${tp.sw.on ? '' : 'disabled'}>Tour</button><button class="cta ghost small" data-tp="sw-reset">Remise à zéro</button></div>
      ${laps.length ? `<div class="tp-laps">${laps.map((l, i) => `<div><span>Tour ${laps.length - i}</span><b>${fmtClock(l.t)}</b><span class="tp-lapd">+${fmtClock(l.d)}</span></div>`).join('')}</div>` : ''}
    </div>
    <div class="tp-card ${tp.cd.over ? 'over' : ''}">
      <div class="tp-title">Compte à rebours${tp.cd.label ? ` <span class="tp-label">· ${esc(tp.cd.label)}</span>` : ''}</div>
      <div class="tp-digits" id="tp-cd">${fmtClock(cdRemaining())}</div>
      <div class="tp-presets">${[1, 2, 5, 7, 10, 15, 20, 25, 45, 60].map(m => `<button data-tp="cd-set" data-min="${m}" class="${tp.cd.total === m * 60 ? 'on' : ''}" ${tp.cd.on ? 'disabled' : ''}>${m}</button>`).join('')}<label class="tp-custom">min<input id="tp-cd-min" inputmode="numeric" value="${Math.round(tp.cd.total / 60)}" ${tp.cd.on ? 'disabled' : ''}></label></div>
      <div class="tp-btns"><button class="cta small" data-tp="cd-toggle">${tp.cd.on ? 'Pause' : (tp.cd.base < tp.cd.total && !tp.cd.over ? 'Reprendre' : 'Démarrer')}</button><button class="cta ghost small" data-tp="cd-reset">Remise à zéro</button></div>
      <div class="po-hint">${tp.cd.over ? 'Temps écoulé.' : 'Un signal sonore retentit à la fin ; le temps restant reste visible en haut de l’écran, dans tous les cours.'}</div>
    </div>`;
}
function setCountdown(secs, label) { tp.cd = { on: false, total: secs, base: secs, t0: 0, over: false, label: label || '' }; saveTp(); renderTimerPanel(); renderTimerNow(); }
function startCountdown() { if (tp.cd.on) return; if (tp.cd.over || tp.cd.base <= 0) { tp.cd.base = tp.cd.total; tp.cd.over = false; } tp.cd.on = true; tp.cd.t0 = Date.now(); saveTp(); ensureTimerTick(); renderTimerPanel(); renderTimerNow(); }
$('#timer-body').addEventListener('click', e => {
  const btn = e.target.closest('[data-tp]'); if (!btn) return;
  const k = btn.dataset.tp;
  if (k === 'sw-toggle') { if (tp.sw.on) { tp.sw.base = swElapsed(); tp.sw.on = false; } else { tp.sw.on = true; tp.sw.t0 = Date.now(); ensureTimerTick(); } }
  if (k === 'sw-lap') { const t = swElapsed(); const prev = tp.sw.laps.length ? tp.sw.laps[tp.sw.laps.length - 1].t : 0; tp.sw.laps.push({ t, d: t - prev }); }
  if (k === 'sw-reset') tp.sw = { on: false, base: 0, t0: 0, laps: [] };
  if (k === 'cd-set') { setCountdown(+btn.dataset.min * 60, tp.cd.label); return; }
  if (k === 'cd-toggle') { if (tp.cd.on) { tp.cd.base = cdRemaining(); tp.cd.on = false; } else { startCountdown(); return; } }
  if (k === 'cd-reset') tp.cd = { on: false, total: tp.cd.total, base: tp.cd.total, t0: 0, over: false, label: tp.cd.label };
  saveTp(); renderTimerPanel(); renderTimerNow();
});
$('#timer-body').addEventListener('change', e => {
  if (e.target.id !== 'tp-cd-min') return;
  const m = Math.max(0, Math.min(600, parseFloat(String(e.target.value).replace(',', '.')) || 0));
  setCountdown(Math.round(m * 60), tp.cd.label);
});
function tickPanelTimer() {
  if (tp.cd.on && cdRemaining() <= 0) {
    tp.cd.on = false; tp.cd.base = 0; tp.cd.over = true; saveTp();
    beep(); toast(`⏱ Temps écoulé${tp.cd.label ? ' — ' + tp.cd.label : ''}`, { duration: 8000, action: 'Relancer', onAction: () => { setCountdown(tp.cd.total, tp.cd.label); startCountdown(); } });
    renderTimerPanel();
  }
  const sw = $('#tp-sw'); if (sw) sw.textContent = fmtClock(swElapsed());
  const cd = $('#tp-cd'); if (cd) cd.textContent = fmtClock(cdRemaining());
  renderTimerNow();
}
/* pastille dans la barre supérieure */
function renderTimerNow() {
  const el = $('#timer-now'); if (!el) return;
  const showCd = tp.cd.on || (tp.cd.over) || (tp.cd.base < tp.cd.total);
  if (!tp.sw.on && !showCd && !tp.sw.base) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('over', tp.cd.over);
  el.classList.toggle('live', tp.cd.on || tp.sw.on);
  const parts = [];
  if (showCd) parts.push(`<span class="tn-cd">${tp.cd.over ? 'écoulé' : fmtClock(cdRemaining())}</span>`);
  if (tp.sw.on || tp.sw.base) parts.push(`<span class="tn-sw">${fmtClock(swElapsed())}</span>`);
  el.innerHTML = '⏱ ' + parts.join(' <span class="cn-left">·</span> ');
  el.title = 'Chronomètre / compte à rebours — cliquer pour ouvrir';
}
$('#timer-now').addEventListener('click', () => { if (!currentDocId) { toast('Ouvrez une séance pour afficher le panneau des minuteurs'); return; } togglePanel('#timerpanel', openTimerPanel); });
if (tp.sw.on || tp.cd.on) ensureTimerTick();
renderTimerNow();

/* ---------------- citation : auteur / source depuis un DOI ou un PMID (format Vancouver) ---------------- */
function vancouverFromCsl(j) {
  const authors = (j.author || []).slice(0, 6).map(a => `${a.family || ''}${a.given ? ' ' + a.given.split(/[\s-]+/).map(x => x[0]).join('') : ''}`.trim()).filter(Boolean);
  const auth = authors.join(', ') + ((j.author || []).length > 6 ? ', et al' : '');
  const title = Array.isArray(j.title) ? j.title[0] : (j.title || '');
  const journal = j['container-title-short'] || (Array.isArray(j['container-title']) ? j['container-title'][0] : j['container-title']) || '';
  const dp = (j.issued && j.issued['date-parts'] && j.issued['date-parts'][0]) || [];
  const year = dp[0] || '';
  const vol = j.volume ? j.volume : '', issue = j.issue ? `(${j.issue})` : '', pages = j.page ? ':' + j.page : '';
  const doi = j.DOI ? ` doi:${j.DOI}` : '';
  return `${auth}. ${title}${/[.?!]$/.test(title) ? '' : '.'} ${journal}${journal ? '.' : ''} ${year}${vol ? ';' + vol : ''}${issue}${pages}.${doi}`.replace(/\s+/g, ' ').trim();
}
async function fetchCitation(q) {
  q = q.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  if (/^\d{5,9}$/.test(q)) {
    const r = await fetch(`https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=${q}`);
    if (!r.ok) throw new Error('PMID introuvable');
    return vancouverFromCsl(await r.json());
  }
  if (/^10\.\d{4,}\//.test(q)) {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('DOI introuvable');
    const j = await r.json();
    return vancouverFromCsl(j.message || {});
  }
  throw new Error('Saisissez un DOI (10.xxxx/…) ou un PMID (numéro PubMed)');
}
function openCitePopover(bid) {
  const b = getBlock(bid); if (!b || b.type !== 'quote') return;
  showPopover(`<h4>Auteur / source de la citation</h4>
    <div class="po-row"><input id="po-cite" placeholder="— Auteur, œuvre, année" value="${esc(stripTags(b.cite || ''))}"></div>
    <div class="po-label">Depuis un DOI ou un PMID (format Vancouver)</div>
    <div class="po-row"><input id="po-cite-doi" placeholder="10.1056/NEJMoa… ou 31234567" spellcheck="false"><button class="cta ghost small" id="po-cite-fetch" type="button">Chercher</button></div>
    <div class="ai-keymsg" id="po-cite-msg"></div>
    <div class="po-row" style="justify-content:flex-end; margin-top:10px"><button class="pobtn" id="po-cite-ok" type="button">Enregistrer</button></div>`,
    anchorForBlock(bid), pop => {
      const inp = pop.querySelector('#po-cite'), doi = pop.querySelector('#po-cite-doi'), msg = pop.querySelector('#po-cite-msg');
      const ok = () => { const v = inp.value.trim(); if (v) b.cite = esc(v); else delete b.cite; hidePopover(); touch(); renderBlocks(b.id, 'end', 'f:cite'); };
      pop.querySelector('#po-cite-ok').addEventListener('click', ok);
      const fetchIt = async () => {
        msg.textContent = 'Recherche…'; msg.className = 'ai-keymsg';
        try { inp.value = await fetchCitation(doi.value); msg.textContent = 'Référence trouvée ✓'; msg.className = 'ai-keymsg ok'; }
        catch (err) { msg.textContent = err.message || 'Introuvable'; msg.className = 'ai-keymsg err'; }
      };
      pop.querySelector('#po-cite-fetch').addEventListener('click', fetchIt);
      doi.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fetchIt(); } });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      setTimeout(() => (inp.value ? doi : inp).focus(), 40);
    });
}
blocksEl.addEventListener('contextmenu', e => {
  const q = e.target.closest('#blocks > .block.quote'); if (!q || e.target.closest('a')) return;
  const b = getBlock(q.dataset.id); if (!b) return;
  e.preventDefault();
  const menu = $('#ctxmenu');
  menu.innerHTML = `<div class="cm-title">Citation</div>
    <button data-cm="qcite">${CM_ICO.pen}Auteur / source (DOI, PMID)…</button>
    <button data-cm="qpara">${CM_ICO.open}Transformer en paragraphe</button>`;
  menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = ''; menu.dataset.quote = b.id;
  placeCtxMenu(menu, e.clientX, e.clientY);
});
$('#ctxmenu').addEventListener('click', e => {
  const btn = e.target.closest('[data-cm]'); if (!btn) return;
  const menu = $('#ctxmenu'); const qid = menu.dataset.quote; if (!qid) return;
  const b = getBlock(qid); if (!b) return;
  menu.dataset.quote = '';
  if (btn.dataset.cm === 'qcite') { closeCtxMenu(); openCitePopover(qid); }
  if (btn.dataset.cm === 'qpara') { closeCtxMenu(); resetBlock(b, { type: 'p', text: b.text || '' }); touch(); renderBlocks(b.id, 'end'); }
});

/* ---------------- plan : filtre « Rang A », minuteur (barre d'outils) ---------------- */
$('#pp-rang').addEventListener('click', toggleRankFilter);
$('#toolbar').addEventListener('click', e => {
  const btn = e.target.closest('[data-act="timer"]'); if (!btn) return;
  togglePanel('#timerpanel', openTimerPanel);
});

/* ============================================================
   Démarrage
   ============================================================ */
state = load() || emptyState();
if (!state.settings) state.settings = { theme: null };
if (!Array.isArray(state.settings.snippets)) state.settings.snippets = [{ k: 'tkt', v: 't’inquiète' }];
if (!Array.isArray(state.settings.profs)) state.settings.profs = [];
// noms de professeurs déjà saisis sur les dossiers / séances → suggestions
[...state.folders.map(f => f.prof), ...state.docs.map(d => d.prof)].forEach(p => { if (p && !state.settings.profs.some(x => norm(x) === norm(p))) state.settings.profs.push(p); });
state.settings.profs.sort((a, b) => a.localeCompare(b, 'fr'));
lastSettingsJson = JSON.stringify(state.settings);   // point de départ : seuls les changements ultérieurs datent les réglages
renderProfsList();
expandedFolders = new Set(state.folders.map(f => f.id)); // tout déplié au premier lancement
// pierres tombales de plus de 90 jours : inutiles
if (state.deleted) for (const kind of ['docs', 'folders']) for (const [id, ts] of Object.entries(state.deleted[kind] || {})) if (Date.now() - ts > 90 * 86400000) delete state.deleted[kind][id];
applyTheme();
syncHealthUI();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!state.settings.theme) applyTheme(); });
syncExportBtn();
if (!Array.isArray(state.events)) state.events = [];
loadTabs(); loadTabScroll();
showLibrary();
renderCalNow();

/* ============================================================
   Raccourcis de frappe — « tkt » + espace → « t’inquiète »
   (définis dans Paramètres, déclenchés par espace ou ponctuation)
   ============================================================ */
function expandSnippet() {
  const snips = state.settings.snippets;
  if (!snips || !snips.length) return false;
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rng = sel.getRangeAt(0);
  const node = rng.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const before = node.textContent.slice(0, rng.startOffset);
  const m = before.match(/(\S+)$/);
  if (!m) return false;
  const word = m[1];
  let rep = null;
  for (const s of snips) {
    if (!s.k || !s.v) continue;
    if (word === s.k) { rep = s.v; break; }
    // « Tkt » en début de phrase → « T’inquiète »
    if (word === s.k[0].toUpperCase() + s.k.slice(1)) { rep = s.v[0].toUpperCase() + s.v.slice(1); break; }
  }
  if (rep === null) return false;
  const wr = document.createRange();
  wr.setStart(node, rng.startOffset - word.length);
  wr.setEnd(node, rng.startOffset);
  sel.removeAllRanges();
  sel.addRange(wr);
  document.execCommand('insertText', false, rep); // conserve l'historique d'annulation et déclenche `input`
  return true;
}

/* ============================================================
   Fautes de frappe corrigées seules (sans IA, sans Internet) : « qaund » + espace → « quand ».
   1.22 : le mot est jugé par le moteur js/corr.js — liste fermée (1.21), mots appris des corrections précédentes,
   et lexique de 24 000 mots (lettres inversées, lettre doublée, accent oublié, jamais un mot ambigu).
   Retour arrière juste après : le mot d'origine revient et n'est plus jamais touché.
   ============================================================ */
let typoLast = null;            // { field, from, to, ts } : Retour arrière juste après remet le mot d'origine
let typoToasts = 0;
const autoTypoOn = () => state.settings.autoTypo !== false;
function expandTypo(field) {
  if (!autoTypoOn()) return false;
  const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rng = sel.getRangeAt(0); const node = rng.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  if (node.parentElement && node.parentElement.closest('a, code, sup, sub, ' + ATOM_SEL)) return false;
  const before = node.textContent.slice(0, rng.startOffset);
  const m = before.match(/(?:^|[\s(«"“'’])([A-Za-zÀ-ÿ]{3,})$/); if (!m) return false;
  const word = m[1];
  if ((state.settings.snippets || []).some(x => x.k === word)) return false;   // un raccourci personnel a priorité
  const fix = AlixoCorr.localFix(word); if (!fix) return false;
  const lang = detectLang(field.textContent); if (lang && lang !== 'fr') return false;   // texte dans une autre langue : on ne touche à rien
  const rep = fix.to;
  const at = rng.startOffset - word.length;
  const wr = document.createRange(); wr.setStart(node, at); wr.setEnd(node, rng.startOffset);
  sel.removeAllRanges(); sel.addRange(wr);
  document.execCommand('insertText', false, rep);   // historique natif conservé, événement input déclenché
  typoLast = { field, from: word, to: rep, ts: Date.now() };
  AlixoCorr.note('local');
  if (field.classList.contains('btxt')) { const bl = field.closest('#blocks > .block'); if (bl) { addCorrMark(bl.dataset.id, offsetInField(field, node, at), word, rep); applyCorrMarks(); } }
  if (typoToasts++ < 3) toast(`Faute de frappe corrigée : « ${word} » → « ${rep} » — Retour arrière tout de suite pour garder « ${word} »`);
  return true;
}
/* Retour arrière juste après une correction automatique : le mot tapé revient, et n'est plus corrigé (mémorisé sur l'appareil) */
function undoTypo(e) {
  const t = typoLast; typoLast = null;
  if (!t || Date.now() - t.ts > 6000 || !t.field.isConnected) return false;
  const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rng = sel.getRangeAt(0); const node = rng.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !t.field.contains(node)) return false;
  const before = node.textContent.slice(0, rng.startOffset);
  const m = before.match(new RegExp(t.to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\s\\u00a0,.;:!?)]?)$')); if (!m) return false;
  e.preventDefault();
  const wr = document.createRange(); wr.setStart(node, rng.startOffset - m[0].length); wr.setEnd(node, rng.startOffset);
  sel.removeAllRanges(); sel.addRange(wr);
  document.execCommand('insertText', false, t.from + m[1]);
  AlixoCorr.ignore(t.from);
  toast(`« ${t.from} » conservé — ce mot ne sera plus corrigé automatiquement`);
  return true;
}

/* flèches : « -> », « --> », « => », « > », « <- », « <-> »… suivis d'un espace deviennent de vraies flèches */
const ARROWS = { '->': '→', '-->': '⟶', '=>': '⇒', '==>': '⇒', '<-': '←', '<--': '⟵', '<->': '↔', '<=>': '⇔', '>': '→' };
function expandArrow(field) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rng = sel.getRangeAt(0);
  const node = rng.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const before = node.textContent.slice(0, rng.startOffset);
  let m = before.match(/(?:-->|<--|<->|<=>|==>|->|=>|<-)$/);
  let tok = m ? m[0] : null;
  if (!tok && /(^|\s)>$/.test(before)) {
    // « > » seul en tout début de paragraphe reste le raccourci de citation
    if (field.classList.contains('btxt') && (lineBeforeCaret(field) || '') === '>') return false;
    tok = '>';
  }
  if (!tok || !ARROWS[tok]) return false;
  const wr = document.createRange();
  wr.setStart(node, rng.startOffset - tok.length); wr.setEnd(node, rng.startOffset);
  sel.removeAllRanges(); sel.addRange(wr);
  document.execCommand('insertText', false, ARROWS[tok]);
  return true;
}
/* symboles (« >= » → ≥, « +/- » → ±…) et, en mode Santé, ions / molécules / unités : « Na+ » → Na⁺, « HCO3- » → HCO₃⁻, « umol/L » → µmol/L */
function expandNotation(field, key) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const rng = sel.getRangeAt(0);
  const node = rng.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  if (node.parentElement && node.parentElement.closest('sup, sub, ' + ATOM_SEL)) return false;
  const before = node.textContent.slice(0, rng.startOffset);
  const m = before.match(/(\S+)$/); if (!m) return false;
  const word = m[1];
  const replace = (len, html, asText) => {
    const wr = document.createRange(); wr.setStart(node, rng.startOffset - len); wr.setEnd(node, rng.startOffset);
    sel.removeAllRanges(); sel.addRange(wr);
    if (asText) { document.execCommand('insertText', false, html); return true; }
    domInsertHTML(wr, html + '​');   // l'espace de largeur nulle qui suit garde le curseur hors de l'exposant
    const bl = field.closest('#blocks > .block'); const b = bl && getBlock(bl.dataset.id); if (b) { syncFieldToModel(b, field); touch(); }
    return true;
  };
  // symboles pour tous
  const SM = AlixoMed.SYMBOL_MAP;
  for (const k of Object.keys(SM).sort((a, b) => b.length - a.length)) {
    if (word.endsWith(k) && (word === k || /[\d\s]$/.test(word.slice(0, -k.length)) || k.length > 1)) {
      if (/^[a-zA-Z]/.test(k) && word !== k) continue;   // « umol » seulement en mot entier
      return replace(k.length, SM[k], true);
    }
  }
  if (!healthMode()) return false;
  // ions et molécules : Na+, Ca2+, HCO3-, H2O, PaO2… (liste fermée : « J7 », « M3 » restent intacts)
  const core = word.replace(/^[(«"']+/, '');
  const html = AlixoMed.ionHTML(core);
  if (html && html !== core) return replace(core.length, html, false);
  // unités : « ug » → µg, « umol/L » → µmol/L
  const um = core.match(/^u(mol|g|L|l)(\/.+)?$/);
  if (um) return replace(core.length, 'µ' + core.slice(1), true);
  return false;
}
const SNIPPET_TRIGGERS = new Set([' ', ',', '.', ';', ':', '!', '?', ')']);
blocksEl.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Backspace' && typoLast) { undoTypo(e); return; }   // 1.21 : annule la correction de frappe qui vient d'être faite
  if (e.key.length === 1 || e.key === 'Enter') typoLast = null;
  if (e.key === 'Enter') { const f0 = activeField(); if (f0 && f0.classList.contains('btxt')) corrSentenceDone(f0); }   // 1.22 : fin de phrase
  if (!SNIPPET_TRIGGERS.has(e.key)) return;
  const f = activeField(); if (!f || f.tagName === 'INPUT' || !f.matches('.btxt, .jref, .jval, figcaption, .tcell, .qcite, .cd-t, .cd-x')) return;
  if ('.!?'.includes(e.key) && f.classList.contains('btxt')) corrSentenceDone(f);   // 1.22 : la phrase terminée part vers l'analyse
  if (e.key === ' ' && expandArrow(f)) return;   // l'espace s'insère ensuite normalement
  if (expandNotation(f, e.key)) return;
  if (expandSnippet()) return; // la touche déclencheuse s'insère ensuite normalement
  expandTypo(f);               // « qaund » → « quand », à l'espace ou à la ponctuation
});

/* ============================================================
   Questionnaire de bienvenue — niveau + spécialités
   (à la création du compte ; modifiable dans les Paramètres)
   ============================================================ */
const OB_NIVEAUX = [
  { k: 'college', label: 'Collège' },
  { k: 'lycee', label: 'Lycée' },
  { k: 'superieur', label: 'Études supérieures' },
  { k: 'pro', label: 'Milieu professionnel' },
  { k: 'autre', label: 'Autre…' }
];
const OB_SPECIALITES = [
  { k: 'droit', nom: 'Droit', c: '#8c4351' },
  { k: 'economie', nom: 'Économie', c: '#2f7d68' },
  { k: 'medecine', nom: 'Médecine', c: '#c04343' },
  { k: 'pharmacie', nom: 'Pharmacie', c: '#2e8b6a' },
  { k: 'odontologie', nom: 'Odontologie', c: '#3d5a80' },
  { k: 'maieutique', nom: 'Maïeutique', c: '#a8556f' },
  { k: 'kine', nom: 'Kinésithérapie', c: '#d06a3a' },
  { k: 'gestion', nom: 'Gestion & Comptabilité', c: '#b3762a' },
  { k: 'sciencepo', nom: 'Science politique', c: '#3d6bb5' },
  { k: 'maths', nom: 'Maths & Statistiques', c: '#33658a' },
  { k: 'finance', nom: 'Finance', c: '#2e8b8b' },
  { k: 'histgeo', nom: 'Histoire-Géographie', c: '#7a6852' },
  { k: 'lettres', nom: 'Lettres & Philosophie', c: '#a8556f' },
  { k: 'langues', nom: 'Langues', c: '#4a7856' },
  { k: 'sciences', nom: 'Sciences', c: '#3d5a80' },
  { k: 'info', nom: 'Informatique', c: '#5b6b8c' },
  /* 1.18 */
  { k: 'commerce', nom: 'Commerce & Marketing', c: '#d4692a' },
  { k: 'staps', nom: 'STAPS — Sport', c: '#1f9d8a' },
  { k: 'autre', nom: 'Autre…', c: '#6b6b6b' }
];

/* mode Santé : notation automatique (ions, unités), abréviations médicales, sections « Santé » du menu « / » —
   activé par le profil (médecine, pharmacie…) : seules les spécialités choisies sont affichées */
function healthMode() {
  const p = state.settings.profil;
  return !!(p && Array.isArray(p.specialites) && p.specialites.some(k => AlixoMed.HEALTH_KEYS.includes(k)));
}
function profilNiveauLabel(p) {
  if (!p) return '';
  if (p.niveau === 'autre') return p.niveauAutre || 'Autre';
  const n = OB_NIVEAUX.find(n => n.k === p.niveau);
  return n ? n.label : '';
}
function profilSpecialitesLabel(p) {
  if (!p || !p.specialites) return '';
  return p.specialites.map(k => {
    if (k === 'autre') return p.specialiteAutre || 'Autre';
    const s = OB_SPECIALITES.find(s => s.k === k);
    return s ? s.nom : k;
  }).join(', ');
}

function closeOnboarding() {
  const ov = $('#obov');
  if (ov) ov.remove();
}

function openOnboarding(edit) {
  closeOnboarding();
  const prev = state.settings.profil || null;
  const sel = {
    niveau: prev ? prev.niveau : null,
    niveauAutre: prev ? (prev.niveauAutre || '') : '',
    specialites: new Set(prev ? prev.specialites : []),
    specialiteAutre: prev ? (prev.specialiteAutre || '') : ''
  };

  const acc = window.AlixoAuth && window.AlixoAuth.account();
  const prenom = acc && acc.name ? acc.name.split(' ')[0] : '';
  const ov = document.createElement('div');
  ov.id = 'obov';
  document.body.appendChild(ov);

  function renderStep1() {
    ov.innerHTML = `<div class="ob-card">
      <div class="ob-step">Étape 1 sur 2</div>
      <h2 class="ob-title">${edit ? 'Ton profil' : `Bienvenue${prenom ? ' ' + esc(prenom) : ''} !`}</h2>
      <p class="ob-sub">Où en es-tu dans ton parcours ? Alixo s'adapte à ton niveau.</p>
      <div class="ob-levels">
        ${OB_NIVEAUX.map(n => `<button class="ob-level ${sel.niveau === n.k ? 'sel' : ''}" data-k="${n.k}">${n.label}</button>`).join('')}
      </div>
      <input class="ob-other-input ${sel.niveau === 'autre' ? 'on' : ''}" id="ob-niveau-autre" placeholder="Précise ton niveau (ex. BTS, prépa, autodidacte…)" maxlength="60" value="${esc(sel.niveauAutre)}">
      <div class="ob-foot">
        <span></span>
        <button class="cta ob-next" id="ob-next1" ${sel.niveau ? '' : 'disabled'}>Continuer</button>
      </div>
    </div>`;
    ov.querySelectorAll('.ob-level').forEach(b => b.addEventListener('click', () => {
      sel.niveau = b.dataset.k;
      ov.querySelectorAll('.ob-level').forEach(x => x.classList.toggle('sel', x === b));
      ov.querySelector('#ob-niveau-autre').classList.toggle('on', sel.niveau === 'autre');
      if (sel.niveau === 'autre') ov.querySelector('#ob-niveau-autre').focus();
      ov.querySelector('#ob-next1').disabled = false;
    }));
    ov.querySelector('#ob-niveau-autre').addEventListener('input', e => { sel.niveauAutre = e.target.value; });
    ov.querySelector('#ob-next1').addEventListener('click', renderStep2);
  }

  function renderStep2() {
    ov.innerHTML = `<div class="ob-card">
      <div class="ob-step">Étape 2 sur 2</div>
      <h2 class="ob-title">Tes spécialités</h2>
      <p class="ob-sub">Choisis-en une ou plusieurs — elles deviendront tes premiers dossiers.</p>
      <div class="ob-chips">
        ${OB_SPECIALITES.map(s => `<button class="ob-chip ${sel.specialites.has(s.k) ? 'sel' : ''}" data-k="${s.k}" style="--chip-c:${s.c}"><span class="dot"></span>${s.nom}</button>`).join('')}
      </div>
      <input class="ob-other-input ${sel.specialites.has('autre') ? 'on' : ''}" id="ob-spec-autre" placeholder="Ta spécialité (ex. Architecture, Psychologie…)" maxlength="60" value="${esc(sel.specialiteAutre)}">
      <div class="ob-hint">Tu pourras modifier tout ça plus tard dans les Paramètres.</div>
      <div class="ob-foot">
        <button class="ob-back" id="ob-back">‹ Retour</button>
        <button class="cta ob-next" id="ob-done" ${sel.specialites.size ? '' : 'disabled'}>${edit ? 'Enregistrer' : 'C’est parti !'}</button>
      </div>
    </div>`;
    ov.querySelectorAll('.ob-chip').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      sel.specialites.has(k) ? sel.specialites.delete(k) : sel.specialites.add(k);
      b.classList.toggle('sel', sel.specialites.has(k));
      ov.querySelector('#ob-spec-autre').classList.toggle('on', sel.specialites.has('autre'));
      if (k === 'autre' && sel.specialites.has('autre')) ov.querySelector('#ob-spec-autre').focus();
      ov.querySelector('#ob-done').disabled = !sel.specialites.size;
    }));
    ov.querySelector('#ob-spec-autre').addEventListener('input', e => { sel.specialiteAutre = e.target.value; });
    ov.querySelector('#ob-back').addEventListener('click', renderStep1);
    ov.querySelector('#ob-done').addEventListener('click', finish);
  }

  function finish() {
    const before = new Set((state.settings.profil && state.settings.profil.specialites) || []);
    state.settings.profil = {
      niveau: sel.niveau,
      niveauAutre: sel.niveau === 'autre' ? sel.niveauAutre.trim() : '',
      specialites: [...sel.specialites],
      specialiteAutre: sel.specialites.has('autre') ? sel.specialiteAutre.trim() : '',
      ts: Date.now()
    };
    if (window.AlixoAuth && AlixoAuth.clearNewAccount) AlixoAuth.clearNewAccount();
    // 1.22 : plus de dossiers créés d'office pour les spécialités choisies (l'utilisateur crée les siens)
    save();
    closeOnboarding();
    syncHealthUI();
    if (!currentDocId) { renderCrumbs(); renderLibrary(); }
    toast(edit ? 'Profil mis à jour' : 'Bienvenue sur Alixo !');
  }

  renderStep1();
}

/* ============================================================
   1.18 — fenêtre « mise à jour disponible »
   Affichée au démarrage (et toutes les 6 h) tant que la version en cours est plus ancienne que celle
   annoncée par l'administrateur (config/public.latestVersion). « Plus tard » la fait taire 24 h pour
   cette version. Si l'administrateur a fixé une version minimale (minVersion) plus récente que la
   version en cours, la fenêtre ne se ferme pas : l'application n'est plus utilisable avant la mise à
   jour. Sur PC installé, la mise à jour se télécharge toute seule : la fenêtre passe alors à
   « Redémarrer maintenant » (js/notify.js → state 'downloaded').
   ============================================================ */
const UPD_LATER_LS = 'alixo.upd.later';
let updShown = null;   // { version, forced }
function showUpdatePopup(o) {
  o = o || {};
  const version = String(o.version || '').trim(); if (!version) return false;
  const forced = !!o.forced;
  const ready = o.state === 'downloaded';
  if (!forced && !ready) {
    let later = null; try { later = JSON.parse(localStorage.getItem(UPD_LATER_LS) || 'null'); } catch { later = null; }
    if (later && later.v === version && Date.now() - (+later.ts || 0) < 24 * 3600000) return false;
  }
  const prev = $('#updov');
  if (prev && updShown && updShown.version === version && updShown.forced === forced && updShown.ready === ready) return true;
  if (prev) prev.remove();
  updShown = { version, forced, ready };
  const desk = window.alixoDesktop;
  const url = o.url || (desk && desk.platform === 'darwin' ? ALIXO_MAC_URL : desk ? ALIXO_PC_URL : ALIXO_VERSIONS_URL);
  const ov = document.createElement('div'); ov.id = 'updov';
  const how = ready
    ? 'La nouvelle version est téléchargée : redémarrez Alixo pour l’appliquer (vos cours sont conservés).'
    : desk
      ? (desk.platform === 'darwin'
        ? 'Sur Mac, téléchargez le nouveau .dmg puis glissez Alixo dans Applications (vos cours sont conservés).'
        : 'Version installée : la mise à jour se télécharge en arrière-plan, vous serez invité à redémarrer. Version portable : téléchargez le nouveau fichier.')
      : 'Rechargez la page (Ctrl+F5) pour obtenir la dernière version web ; sur PC, téléchargez l’installeur.';
  ov.innerHTML = `<div class="ob-card upd-card">
      <div class="ob-step">${forced ? 'Mise à jour obligatoire' : 'Mise à jour disponible'}</div>
      <h2 class="ob-title">Alixo ${esc(version)} est disponible</h2>
      <p class="ob-sub upd-note">${o.note ? esc(o.note) + '<br><br>' : ''}${forced ? `Votre version (${esc(ALIXO_VERSION)}) n’est plus prise en charge : mettez Alixo à jour pour continuer. ` : `Vous utilisez la version ${esc(ALIXO_VERSION)}. `}${how}</p>
      <div class="ob-foot"><span>${forced ? '' : `<button class="ob-back" id="upd-later" type="button">Plus tard</button>`}</span><span>${ready ? `<button class="cta ob-next" id="upd-restart" type="button">Redémarrer maintenant</button>` : `<button class="cta ob-next" id="upd-dl" type="button">${desk ? 'Télécharger la mise à jour' : 'Recharger la page'}</button>`}</span></div>
    </div>`;
  document.body.appendChild(ov);
  const later = ov.querySelector('#upd-later');
  if (later) later.addEventListener('click', () => { try { localStorage.setItem(UPD_LATER_LS, JSON.stringify({ v: version, ts: Date.now() })); } catch { /* */ } ov.remove(); updShown = null; });
  const dl = ov.querySelector('#upd-dl');
  if (dl) dl.addEventListener('click', () => {
    if (desk) { if (desk.openExternal) desk.openExternal(url); else window.open(url, '_blank', 'noopener'); }
    else location.reload();
  });
  const rs = ov.querySelector('#upd-restart');
  if (rs) rs.addEventListener('click', () => { if (desk && desk.installUpdate) desk.installUpdate(); else location.reload(); });
  return true;
}
function closeUpdatePopup() { const ov = $('#updov'); if (ov) ov.remove(); updShown = null; }

/* affiché après la première connexion : compte présent mais profil jamais rempli */
function maybeOnboard() {
  if (!window.AlixoAuth || !window.AlixoAuth.account()) return;
  if (state.settings.profil) { if (AlixoAuth.clearNewAccount) AlixoAuth.clearNewAccount(); return; }
  // 1.15 : le questionnaire n'est posé qu'au compte tout juste créé sur cet appareil ; une connexion sur un
  // autre ordinateur ou téléphone récupère le profil par la synchronisation (ou se règle dans Paramètres › Compte)
  if (AlixoAuth.isNewAccount && !AlixoAuth.isNewAccount()) return;
  const authov = $('#authov');
  if (authov && !authov.hidden) return;
  if (!$('#obov')) openOnboarding(false);
}

/* ============================================================
   API interne pour la synchronisation (js/sync.js)
   ============================================================ */
window.addEventListener('mouseup', e => {
  if (e.button === 3 && document.body.classList.contains('mode-editor')) { e.preventDefault(); showLibrary(); }
});

window.AlixoApp = {
  get state() { return state; },
  maybeOnboard,
  /* utilisés par le menu Édition / Fichier de la version PC (main.js) */
  undo: () => (currentDocId ? (isSlidesDoc(doc()) ? (window.AlixoSlides && AlixoSlides.undo()) : isSheetDoc(doc()) ? (window.AlixoSheets && AlixoSheets.undo()) : isBoardDoc(doc()) ? (window.AlixoBoard && AlixoBoard.undo()) : isQuizDoc(doc()) ? (window.AlixoQuiz && AlixoQuiz.undo()) : undoEdit()) : false),
  redo: () => (currentDocId ? (isSlidesDoc(doc()) ? (window.AlixoSlides && AlixoSlides.redo()) : isSheetDoc(doc()) ? (window.AlixoSheets && AlixoSheets.redo()) : isBoardDoc(doc()) ? (window.AlixoBoard && AlixoBoard.redo()) : isQuizDoc(doc()) ? (window.AlixoQuiz && AlixoQuiz.redo()) : redoEdit()) : false),
  exportPDF: () => { if (!currentDocId) return false; exportPDF(); return true; },
  version: ALIXO_VERSION,
  openTodoHome, openSharedHome, openDoc, openSettings,
  /* Alixo+ (1.16) et fenêtres centrales : utilisés par js/cloudconfig.js, js/share.js, js/files.js, js/todo.js */
  isPlus, setPlan, setPlusOffer, openPlusDialog, requirePlus, storageAllows, openDialog, closeDialog,
  showUpdatePopup, closeUpdatePopup,
  mergeRemoteDoc, renderAccess, onPresence: () => { renderAccess(); renderPeers(); if (!currentDocId && (libMode === 'docs' || libMode === 'shfolder')) renderLibrary(); },
  showLibrary: () => { showLibrary(); return true; },

  /* séances reçues d'un autre appareil (ajouts/màj + suppressions) */
  applyRemoteDocs(upserts, removedIds) {
    for (const r of upserts) {
      const i = state.docs.findIndex(d => d.id === r.id);
      if (i >= 0) state.docs[i] = r; else state.docs.push(r);
    }
    if (removedIds && removedIds.length) {
      state.docs = state.docs.filter(d => !removedIds.includes(d.id));
      openTabs = openTabs.filter(id => !removedIds.includes(id));
    }
    save();
    renderTabs();
    if (currentDocId && removedIds && removedIds.includes(currentDocId)) {
      toast('Cette séance a été supprimée sur un autre appareil');
      showLibrary();
      return;
    }
    if (currentDocId && upserts.some(r => r.id === currentDocId)) {
      const r = upserts.find(x => x.id === currentDocId);
      const i = state.docs.findIndex(x => x.id === currentDocId);
      if (i >= 0) state.docs[i] = mergeRemoteDoc(r, r.byName);
    }
    else if (!currentDocId) renderLibrary();
  },

  /* dossiers + paramètres reçus d'un autre appareil */
  isTombstoned,
  applyRemoteMeta(folders, settings, events, extra) {
    if (Array.isArray(events)) { state.events = events; renderCalNow(); if (!$('#calpanel').hidden) renderCal(); }
    if (extra && typeof extra === 'object') {
      if (Array.isArray(extra.todos)) state.todos = extra.todos;
      if (Array.isArray(extra.todoCats)) state.todoCats = extra.todoCats;
      if (window.AlixoTodo && (Array.isArray(extra.todos) || Array.isArray(extra.todoCats))) AlixoTodo.refresh();
    }
    if (Array.isArray(folders) && folders.length) {
      // un dossier supprimé ici après sa dernière modification là-bas reste supprimé
      state.folders = folders.filter(f => !isTombstoned('folders', f.id, f.updatedAt || 0));
      folders.forEach(f => expandedFolders.add(f.id));
      if (currentFolderId && !folders.some(f => f.id === currentFolderId)) currentFolderId = null;
    }
    if (settings && typeof settings === 'object') {
      const remoteAt = extra && +extra.settingsAt || 0, localAt = +state.settingsAt || 0;
      if (remoteAt && remoteAt >= localAt) {
        // réglages datés et plus récents que les nôtres : ils remplacent les nôtres (une police remise
        // par défaut là-bas est bien remise par défaut ici) ; la version installée reste celle de cet appareil
        const lastVersion = state.settings.lastVersion;
        state.settings = Object.assign({}, settings);
        if (lastVersion) state.settings.lastVersion = lastVersion;
        state.settingsAt = remoteAt;
        lastSettingsJson = JSON.stringify(state.settings);
        applyTheme();
      } else if (!remoteAt && !localAt) {
        // anciennes versions (réglages non datés) des deux côtés : fusion comme avant 1.16
        state.settings = Object.assign({}, state.settings, settings);
        lastSettingsJson = JSON.stringify(state.settings);
        applyTheme();
      }
      // sinon : nos réglages sont plus récents, ils repartent vers le nuage au prochain envoi
    }
    save();
    // le profil vient d'arriver d'un autre appareil → inutile de le redemander
    if (state.settings.profil) closeOnboarding();
    if (!currentDocId) { renderCrumbs(); renderLibrary(); }
  }
};

/* Alixo+ (1.16) : état des boutons verrouillés dès le démarrage (l'abonnement connu est relu du stockage local) */
refreshPlusUi();
/* premier passage : si la synchro est inactive (hors ligne, mode local avec compte),
   c'est ici qu'on propose le questionnaire ; sinon js/sync.js le fait après la fusion */
setTimeout(() => { if (!window.AlixoSync || !window.AlixoSync.enabled) maybeOnboard(); }, 800);
/* au démarrage : notification « nouvelle version installée », puis bilan de la semaine (à chaque ouverture) */
setTimeout(() => {
  try {
    const prev = state.settings.lastVersion;
    if (prev !== ALIXO_VERSION) {
      state.settings.lastVersion = ALIXO_VERSION; save();
      if (prev && window.AlixoNotify) AlixoNotify.push({ id: 'ver_' + ALIXO_VERSION, kind: 'update', title: `Alixo ${ALIXO_VERSION} installé`, text: 'Nouveautés : nouveau document « Quiz » (questions à choix, vrai / faux, curseur, ordre… à tester ou à présenter en direct : code et QR code à l’écran, réponses sur téléphone via alixoapp.com/quiz), plan du cours modifiable (niveaux à glisser, mots déclencheurs comme « Chapitre »), barre d’outils des tableaux flottante, filigrane sur les exports sans Alixo+…', action: { type: 'url', url: ALIXO_VERSIONS_URL } });
    }
  } catch { /* stockage indisponible */ }
  if (window.AlixoStats) AlixoStats.maybeOpen();
}, 1400);
