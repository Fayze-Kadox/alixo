/* ============================================================
   Alixo — fichiers dans les dossiers (PDF, Word, PowerPoint, Excel, images, audio…)
   Chargé APRÈS app.js : utilise ses fonctions globales.

   - La fiche d'un fichier vit dans state.files : { id, name, size, mime, folderId, createdAt, updatedAt, cloud }
     (enregistrée avec le reste de la bibliothèque).
   - Son contenu est stocké sur l'appareil (IndexedDB « alixo-files »), jamais dans localStorage.
   - Avec un compte : users/{uid}/files/{id} (fiche + nombre de morceaux) et
     users/{uid}/files/{id}/chunks/{n} (contenu, par morceaux de 700 Ko — un document Firestore est limité à 1 Mio).
     Le contenu n'est téléchargé sur un autre appareil qu'à la première ouverture.
   - Ouverture dans l'application : PDF, images, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), texte, audio, vidéo ;
     les autres formats s'ouvrent avec l'application associée (version PC) ou s'enregistrent.
   - Partage (1.17, js/share.js) : un fichier seul ou les fichiers d'un dossier partagé sont recopiés dans
     shares/{sid}/files/{id}. Les fiches reçues ({ sid, id, name, … }) s'ouvrent dans la même visionneuse,
     s'enregistrent et se copient dans la bibliothèque ; leur contenu est mis en cache sous « sh:{sid}:{id} ».
   ============================================================ */
'use strict';

window.AlixoFiles = (() => {
  const MAX_FILE = 300 * 1024 * 1024;    // au-delà : refusé (mémoire)
  const MAX_SYNC = 20 * 1024 * 1024;     // au-delà : le fichier reste sur cet appareil
  const CHUNK = 700 * 1024;
  const RISKY = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'lnk', 'jar', 'hta', 'reg', 'cpl', 'pif']);

  const files = () => (Array.isArray(state.files) ? state.files : (state.files = []));
  const byId = id => files().find(f => f.id === id) || null;
  const inFolder = fid => files().filter(f => (f.folderId || null) === (fid || null)).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  const extOf = name => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  function fmtSize(n) {
    if (!(n >= 0)) return '';
    if (n < 1024) return n + ' o';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' Ko';
    return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' Mo';
  }
  /* famille d'un fichier : couleur, libellé, façon de l'afficher */
  const KINDS = {
    pdf: { label: 'PDF', color: '#c04343', exts: ['pdf'] },
    word: { label: 'Word', color: '#2b5fb4', exts: ['docx', 'doc', 'odt', 'rtf'] },
    slides: { label: 'Diaporama', color: '#c8602b', exts: ['pptx', 'ppt', 'odp', 'key'] },
    sheet: { label: 'Tableur', color: '#2e7d4f', exts: ['xlsx', 'xls', 'ods', 'csv', 'tsv'] },
    image: { label: 'Image', color: '#7a5bb5', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic'] },
    audio: { label: 'Audio', color: '#2e8b8b', exts: ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'flac', 'aac', 'opus'] },
    video: { label: 'Vidéo', color: '#a8556f', exts: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'] },
    text: { label: 'Texte', color: '#5b6b8c', exts: ['txt', 'md', 'json', 'xml', 'html', 'htm', 'css', 'py', 'r', 'tex', 'log', 'ini', 'yml', 'yaml', 'sql', 'c', 'h', 'java'] },
    zip: { label: 'Archive', color: '#8a6d3b', exts: ['zip', 'rar', '7z', 'tar', 'gz'] }
  };
  function kindOf(name) { const e = extOf(name); for (const [k, v] of Object.entries(KINDS)) if (v.exts.includes(e)) return Object.assign({ key: k }, v); return { key: 'other', label: 'Fichier', color: '#6b6b6b', exts: [] }; }
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4' };
  function iconHTML(name, cls) {
    const k = kindOf(name); const e = (extOf(name) || '?').slice(0, 4).toUpperCase();
    return `<span class="file-ico ${cls || ''}" style="--fc:${k.color}"><svg viewBox="0 0 24 24"><path d="M6 2.5h8.5L19 7v14.5H6Z"/><path d="M14.5 2.5V7H19"/></svg><span class="file-ext">${esc(e)}</span></span>`;
  }

  /* ---------------- contenu sur l'appareil (IndexedDB) ---------------- */
  let dbp = null;
  const openDb = () => dbp || (dbp = new Promise((res, rej) => {
    let r; try { r = indexedDB.open('alixo-files', 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => r.result.createObjectStore('blob');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  async function idb(mode, fn) {
    const db = await openDb();
    return new Promise((res, rej) => { const t = db.transaction('blob', mode); const rq = fn(t.objectStore('blob')); t.oncomplete = () => res(rq ? rq.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  }
  const putLocal = (id, buf) => idb('readwrite', s => s.put(buf, id));
  const getLocal = id => idb('readonly', s => s.get(id)).catch(() => null);
  const delLocal = id => idb('readwrite', s => s.delete(id)).catch(() => {});
  const hasLocal = async id => { try { return (await idb('readonly', s => s.count(id))) > 0; } catch { return false; } };

  /* contenu d'un fichier : l'appareil d'abord, sinon le nuage (puis mis en cache) */
  async function getData(id, onProgress) {
    let buf = await getLocal(id);
    if (buf) return buf instanceof Blob ? buf.arrayBuffer() : buf;
    buf = await Cloud.download(id, onProgress);
    if (buf) { try { await putLocal(id, buf); } catch (e) { console.error('Fichier non mis en cache :', e); } }
    return buf;
  }

  /* ---------------- fichiers reçus par Alixo Share (1.17) ----------------
     Une fiche partagée porte { sid, id, name, size, mime } ; son contenu vient de
     shares/{sid}/files/{id} et reste en cache local sous « sh:{sid}:{id} ». */
  const isShared = x => !!(x && typeof x === 'object' && x.sid && x.id);
  const sharedKey = f => 'sh:' + f.sid + ':' + f.id;
  async function sharedData(f, onProgress) {
    let buf = await getLocal(sharedKey(f));
    if (buf) return buf instanceof Blob ? buf.arrayBuffer() : buf;
    buf = window.AlixoShare && AlixoShare.enabled ? await AlixoShare.fetchFile(f.sid, f.id, onProgress) : null;
    if (buf) { try { await putLocal(sharedKey(f), buf); } catch (e) { console.error('Fichier partagé non mis en cache :', e); } }
    return buf;
  }
  /* résout ce qu'on nous donne (identifiant local ou fiche partagée) en { f, data() } */
  function handleOf(x) {
    if (isShared(x)) return { f: x, shared: true, data: p => sharedData(x, p) };
    const f = byId(typeof x === 'string' ? x : (x && x.id) || ''); 
    return f ? { f, shared: false, data: p => getData(f.id, p) } : null;
  }

  /* ---------------- import ---------------- */
  async function addFiles(list, folderId) {
    const arr = [...(list || [])].filter(f => f && f.name);
    if (!arr.length) return [];
    // compte gratuit (1.16) : 3 Go au total ; au-delà, la fenêtre Alixo+ s'ouvre et rien n'est importé
    if (typeof storageAllows === 'function' && !await storageAllows(arr.reduce((n, f) => n + (f.size || 0), 0))) return [];
    const added = []; let tooBig = 0, failed = 0;
    for (const file of arr) {
      if (file.size > MAX_FILE) { tooBig++; continue; }
      try {
        const buf = await file.arrayBuffer();
        if (!buf.byteLength && file.size === 0 && !file.type && !extOf(file.name)) { failed++; continue; }   // dossier glissé par erreur
        const id = uid();
        await putLocal(id, buf);
        const meta = { id, name: uniqueName(file.name, folderId), size: buf.byteLength, mime: file.type || MIME[extOf(file.name)] || '', folderId: folderId || null, createdAt: Date.now(), updatedAt: Date.now(), cloud: false };
        files().push(meta); added.push(meta);
      } catch (e) { console.error('Import impossible :', file.name, e); failed++; }
    }
    if (added.length) {
      if (folderId) for (const f of folderPath(folderId)) expandedFolders.add(f.id);
      save(); refreshLibrary(); Cloud.schedule();
      const where = folder(folderId) ? `« ${folder(folderId).nom} »` : 'Mes cours';
      toast(added.length === 1 ? `« ${added[0].name} » ajouté à ${where}` : `${added.length} fichiers ajoutés à ${where}`, added.length === 1 ? { action: 'Ouvrir', onAction: () => open(added[0].id) } : undefined);
    }
    if (tooBig) toast(`${tooBig} fichier${tooBig > 1 ? 's' : ''} de plus de 300 Mo non importé${tooBig > 1 ? 's' : ''}`, { duration: 6000 });
    else if (failed && !added.length) toast('Import impossible (un dossier ? glissez plutôt les fichiers qu’il contient)', { duration: 6000 });
    return added;
  }
  function uniqueName(name, folderId) {
    const taken = new Set(inFolder(folderId).map(f => f.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    const e = extOf(name); const base = e ? name.slice(0, -(e.length + 1)) : name;
    for (let i = 2; i < 500; i++) { const n = `${base} (${i})${e ? '.' + e : ''}`; if (!taken.has(n.toLowerCase())) return n; }
    return name;
  }
  let picker = null, pickFolder = null;
  function pick(folderId) {
    pickFolder = folderId || null;
    if (!picker) {
      picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true;
      picker.addEventListener('change', () => { const l = [...picker.files]; picker.value = ''; addFiles(l, pickFolder); });
      document.body.appendChild(picker);
    }
    picker.click();
  }

  /* ---------------- opérations ---------------- */
  function rename(id) {
    const f = byId(id); if (!f) return;
    const e = extOf(f.name); const base = e ? f.name.slice(0, -(e.length + 1)) : f.name;
    showPopover(`<h4>Renommer le fichier</h4><div class="po-row"><input id="fl-name" value="${esc(base)}" autocomplete="off" spellcheck="false">${e ? `<span class="fl-extlab">.${esc(e)}</span>` : ''}</div>
      <div class="po-row" style="justify-content:flex-end; margin-top:10px"><button class="pobtn" id="fl-ok" type="button">Renommer</button></div>`, centerRect(), pop => {
      const inp = pop.querySelector('#fl-name');
      const ok = () => {
        const v = inp.value.trim().replace(/[\\/:*?"<>|]/g, '·'); if (!v) { inp.focus(); return; }
        const full = v + (e ? '.' + e : '');
        if (full !== f.name) { f.name = uniqueName(full, f.folderId); f.updatedAt = Date.now(); save(); refreshLibrary(); Cloud.schedule(); }
        hidePopover();
      };
      pop.querySelector('#fl-ok').addEventListener('click', ok);
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } });
      setTimeout(() => { inp.focus(); inp.select(); }, 40);
    });
  }
  function move(id, fid) {
    const f = byId(id); if (!f) return;
    fid = fid || null;
    if ((f.folderId || null) === fid) return;
    f.folderId = fid; f.name = uniqueName(f.name, fid); f.updatedAt = Date.now();
    if (fid) for (const p of folderPath(fid)) expandedFolders.add(p.id);
    save(); refreshLibrary(); Cloud.schedule();
    const t = folder(fid); toast(t ? `Déplacé vers « ${t.nom} »` : 'Déplacé vers Mes cours');
  }
  function openMove(id) {
    const f = byId(id); if (!f) return;
    const rows = []; const walk = (pid, depth) => { for (const c of childFolders(pid)) { rows.push({ f: c, depth }); walk(c.id, depth + 1); } }; walk(null, 0);
    showPopover(`<h4>Déplacer « ${esc(f.name)} » vers…</h4><div class="po-list po-move">
        <button data-mv="" class="${!f.folderId ? 'cur' : ''}"><svg class="ficon" viewBox="0 0 24 24" style="stroke:var(--ink-2)"><path d="M4 11 12 4l8 7M6 10v9h12v-9" fill="none"/></svg>Mes cours</button>
        ${rows.map(r => `<button data-mv="${r.f.id}" class="${r.f.id === f.folderId ? 'cur' : ''}" style="padding-left:${10 + r.depth * 16}px; --mc:${r.f.couleur}">${folderIconHTML(r.f)}${esc(r.f.nom)}</button>`).join('')}</div>`,
      centerRect(), pop => pop.querySelector('.po-list').addEventListener('click', ev => { const b = ev.target.closest('[data-mv]'); if (!b) return; hidePopover(); move(id, b.dataset.mv || null); }));
  }
  /* suppression (annulable quelques secondes ; le contenu n'est effacé de l'appareil qu'ensuite) */
  function removeMany(list, label) {
    const gone = list.filter(Boolean); if (!gone.length) return;
    const ids = new Set(gone.map(f => f.id));
    state.files = files().filter(f => !ids.has(f.id));
    gone.forEach(f => tombstone('files', f.id));
    if (viewing && ids.has(viewing.id)) closeViewer();
    save(); refreshLibrary(); Cloud.schedule();
    let undone = false;
    const finalize = () => { if (!undone) gone.forEach(f => delLocal(f.id)); };
    const tm = setTimeout(finalize, 9000);
    toast(label || (gone.length === 1 ? `« ${gone[0].name} » supprimé` : `${gone.length} fichiers supprimés`), {
      action: 'Annuler', onAction: () => {
        undone = true; clearTimeout(tm);
        for (const f of gone) if (!byId(f.id)) { f.cloud = false; f.updatedAt = Date.now(); files().push(f); untomb('files', f.id); }
        save(); refreshLibrary(); Cloud.schedule(); toast(gone.length === 1 ? 'Fichier restauré' : 'Fichiers restaurés');
      }
    });
  }
  function remove(id) {
    const f = byId(id); if (!f) return;
    confirmDialog({ title: `Supprimer « ${f.name} » ?`, text: 'Le fichier sera retiré d’Alixo (l’original sur votre ordinateur n’est pas touché). Annulation possible pendant quelques secondes.' }).then(ok => { if (ok) removeMany([f]); });
  }
  /* fichiers d'une arborescence de dossiers (suppression d'un dossier) : renvoie de quoi les restaurer */
  function detachFolders(folderIds) {
    const set = new Set(folderIds);
    const gone = files().filter(f => set.has(f.folderId));
    if (!gone.length) return { count: 0, restore() {}, finalize() {} };
    state.files = files().filter(f => !set.has(f.folderId));
    gone.forEach(f => tombstone('files', f.id));
    Cloud.schedule();
    return {
      count: gone.length,
      restore() { for (const f of gone) if (!byId(f.id)) { f.cloud = false; f.updatedAt = Date.now(); files().push(f); untomb('files', f.id); } Cloud.schedule(); },
      finalize() { gone.forEach(f => { if (!byId(f.id)) delLocal(f.id); }); }
    };
  }
  async function saveCopy(x) {
    const h = handleOf(x); if (!h) return;
    const f = h.f;
    const buf = await h.data(); if (!buf) { toast('Contenu indisponible sur cet appareil (hors ligne ?)'); return; }
    if (window.alixoDesktop && window.alixoDesktop.saveFile) {
      const r = await window.alixoDesktop.saveFile({ name: f.name, data: new Uint8Array(buf) });
      if (r && r.ok) toast('Copie enregistrée', { action: 'Ouvrir', onAction: () => window.alixoDesktop.openPath(r.path) });
      else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
      return;
    }
    const url = URL.createObjectURL(new Blob([buf], { type: f.mime || 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function openExternal(x) {
    const h = handleOf(x); if (!h) return;
    const f = h.f;
    if (!(window.alixoDesktop && window.alixoDesktop.openData)) { saveCopy(x); return; }
    if (RISKY.has(extOf(f.name))) { toast('Par sécurité, Alixo n’exécute pas ce type de fichier — enregistrez-en une copie pour l’utiliser', { duration: 6000 }); return; }
    const buf = await h.data(); if (!buf) { toast('Contenu indisponible sur cet appareil (hors ligne ?)'); return; }
    const r = await window.alixoDesktop.openData({ name: f.name, data: new Uint8Array(buf) });
    if (!r || !r.ok) toast('Ouverture impossible' + (r && r.error ? ' : ' + r.error : ' — aucune application associée ?'), { duration: 6000 });
  }

  /* ---------------- affichage dans l'application ---------------- */
  let viewing = null;   // { id, cleanup }
  function ensureOverlay() {
    let ov = $('#fileov'); if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'fileov'; ov.hidden = true;
    ov.innerHTML = `<div class="fv-win" role="dialog" aria-modal="true">
        <div class="fv-head"><span class="fv-icon"></span><div class="fv-tt"><div class="fv-name"></div><div class="fv-meta"></div></div>
          <button class="cta ghost small" data-fv="side" type="button" title="Afficher ce fichier à côté de la séance ouverte, pour prendre des notes">À côté du cours</button>
          <button class="cta ghost small" data-fv="ext" type="button" title="Ouvrir avec l’application associée (Word, lecteur PDF…)">Ouvrir avec…</button>
          <button class="cta ghost small" data-fv="save" type="button" title="Enregistrer une copie sur l’ordinateur">Enregistrer une copie</button>
          <button class="fv-close" data-fv="close" type="button" title="Fermer (Échap)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <div class="fv-body"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('pointerdown', e => { if (e.target === ov) closeViewer(); });
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-fv]'); if (!b || !viewing) return;
      const src = viewing.h ? (viewing.h.shared ? viewing.h.f : viewing.h.f.id) : viewing.id, k = b.dataset.fv;
      if (k === 'close') closeViewer();
      if (k === 'save') saveCopy(src);
      if (k === 'ext') openExternal(src);
      if (k === 'side') { closeViewer(); showBeside(src); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) { e.preventDefault(); e.stopPropagation(); closeViewer(); } }, true);
    return ov;
  }
  function closeViewer() {
    const ov = $('#fileov'); if (!ov) return;
    ov.hidden = true;
    if (viewing && viewing.cleanup) { try { viewing.cleanup(); } catch { /* */ } }
    viewing = null;
    ov.querySelector('.fv-body').innerHTML = '';
  }
  async function open(x) {
    const h = handleOf(x); if (!h) { toast('Ce fichier n’existe plus'); return; }
    const f = h.f, key = h.shared ? sharedKey(f) : f.id;
    const ov = ensureOverlay();
    if (viewing) closeViewer();
    viewing = { id: key, h, cleanup: null };
    const owner = h.shared && window.AlixoShare && AlixoShare.enabled ? ((AlixoShare.shareMeta(f.sid) || {}).owner || '') : '';
    ov.querySelector('.fv-icon').innerHTML = iconHTML(f.name);
    ov.querySelector('.fv-name').textContent = f.name;
    ov.querySelector('.fv-meta').textContent = h.shared
      ? `${kindOf(f.name).label} · ${fmtSize(f.size)} · fichier partagé${owner ? ' par ' + owner : ''} (lecture)`
      : `${kindOf(f.name).label} · ${fmtSize(f.size)} · ajouté le ${fmtDate(f.createdAt || Date.now())}${folder(f.folderId) ? ' · ' + folderPath(f.folderId).map(x => x.nom).join(' › ') : ''}`;
    ov.querySelector('[data-fv="ext"]').hidden = !(window.alixoDesktop && window.alixoDesktop.openData);
    ov.querySelector('[data-fv="side"]').hidden = !currentDocId;
    const body = ov.querySelector('.fv-body');
    body.innerHTML = `<div class="vw-empty">Ouverture de « ${esc(f.name)} »…<div class="fv-prog" hidden><span></span></div></div>`;
    ov.hidden = false;
    const prog = body.querySelector('.fv-prog');
    const buf = await h.data(p => { if (prog && prog.isConnected) { prog.hidden = false; prog.firstElementChild.style.width = Math.round(p * 100) + '%'; } });
    if (!viewing || viewing.id !== key) return;
    if (!buf) {
      body.innerHTML = `<div class="vw-empty">${h.shared
        ? 'Ce fichier partagé n’a pas pu être téléchargé.<br>Son propriétaire doit avoir ouvert Alixo (connecté) au moins une fois depuis le partage ; vérifiez aussi la connexion internet.'
        : `Le contenu de ce fichier n’est pas sur cet appareil et n’a pas pu être téléchargé.<br>${f.cloud ? 'Vérifiez la connexion internet, puis réessayez.' : 'Il a été ajouté sur un autre appareil et n’a pas encore été synchronisé (ou il dépasse 20 Mo).'}`}</div>`;
      return;
    }
    viewing.cleanup = await render(body, f.name, buf);
  }
  const openShared = f => open(f);
  /* affiche un fichier dans un conteneur ; renvoie une fonction de nettoyage (URL temporaires) */
  async function render(body, name, buf) {
    const ext = extOf(name);
    let url = null;
    const blobUrl = type => { url = URL.createObjectURL(new Blob([buf], type ? { type } : undefined)); return url; };
    try {
      if (ext === 'pdf') body.innerHTML = `<iframe src="${blobUrl('application/pdf')}#toolbar=1&navpanes=0&view=FitH" title="${esc(name)}"></iframe>`;
      else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) body.innerHTML = `<div class="fv-imgwrap"><img class="vw-img" src="${blobUrl(MIME[ext])}" alt="${esc(name)}"></div>`;
      else if (ext === 'docx') {
        body.innerHTML = `<div class="vw-empty">Conversion du document Word…</div>`;
        if (typeof mammoth === 'undefined') throw new Error('Convertisseur Word indisponible');
        const r = await mammoth.convertToHtml({ arrayBuffer: buf });
        body.innerHTML = `<div class="vw-doc">${r.value || '<i>Document vide</i>'}</div>`;
      } else if (ext === 'pptx') {
        body.innerHTML = `<div class="vw-empty">Lecture du diaporama…</div>`;
        body.innerHTML = `<div class="fv-slides">${await pptxToHtml(buf)}</div>`;
      } else if (ext === 'xlsx') {
        body.innerHTML = `<div class="vw-empty">Lecture du classeur…</div>`;
        body.innerHTML = await xlsxToHtml(buf);
      } else if (ext === 'csv' || ext === 'tsv') {
        body.innerHTML = csvToHtml(new TextDecoder().decode(buf), ext === 'tsv' ? '\t' : null);
      } else if (KINDS.audio.exts.includes(ext)) body.innerHTML = `<div class="fv-media"><div class="fv-medianame">${esc(name)}</div><audio controls src="${blobUrl(MIME[ext])}"></audio></div>`;
      else if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) body.innerHTML = `<div class="fv-media"><video controls src="${blobUrl(MIME[ext])}"></video></div>`;
      else if (KINDS.text.exts.includes(ext) || (buf.byteLength < 400000 && looksLikeText(buf))) body.innerHTML = `<div class="vw-pre">${esc(new TextDecoder().decode(buf.byteLength > 1500000 ? buf.slice(0, 1500000) : buf))}</div>`;
      else {
        const desk = !!(window.alixoDesktop && window.alixoDesktop.openData);
        const old = ext === 'doc' || ext === 'ppt' || ext === 'xls';
        body.innerHTML = `<div class="vw-empty">${old ? `Les anciens formats Office (.${esc(ext)}) ne s’affichent pas dans Alixo.` : `Pas d’aperçu intégré pour les fichiers « .${esc(ext || '?')} ».`}<br>${desk ? 'Utilisez <b>Ouvrir avec…</b> pour l’ouvrir dans son application.' : 'Utilisez <b>Enregistrer une copie</b> pour l’ouvrir dans son application.'}</div>`;
      }
    } catch (err) {
      console.error(err);
      body.innerHTML = `<div class="vw-empty">Impossible d’afficher ce fichier${err && err.message ? ' : ' + esc(err.message) : ''}.<br>Essayez « Ouvrir avec… » ou « Enregistrer une copie ».</div>`;
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }
  function looksLikeText(buf) {
    const u = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096));
    let bad = 0; for (const c of u) if (c === 0 || (c < 9) || (c > 13 && c < 32)) bad++;
    return u.length > 0 && bad / u.length < 0.01;
  }
  function gridTable(rows, maxR = 400, maxC = 40) {
    const cut = rows.length > maxR;
    const nc = Math.min(maxC, Math.max(1, ...rows.slice(0, maxR).map(r => r.length)));
    return `<table>${rows.slice(0, maxR).map(r => `<tr>${Array.from({ length: nc }, (_, i) => `<td>${esc(r[i] === undefined || r[i] === null ? '' : String(r[i]))}</td>`).join('')}</tr>`).join('')}</table>${cut ? `<p class="fv-note">Aperçu limité aux ${maxR} premières lignes.</p>` : ''}`;
  }
  function csvToHtml(text, sep) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
    if (!sep) { const l0 = lines[0] || ''; sep = (l0.split(';').length > l0.split(',').length) ? ';' : ','; }
    const parse = l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    return `<div class="vw-doc fv-sheet">${gridTable(lines.map(parse))}</div>`;
  }
  /* classeur Excel → un tableau par feuille (valeurs ; les dates restent des nombres) */
  async function xlsxToHtml(buf) {
    if (typeof JSZip === 'undefined') throw new Error('Lecteur de classeur indisponible');
    const zip = await JSZip.loadAsync(buf);
    const xml = async p => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
    const sst = []; const ss = await xml('xl/sharedStrings.xml');
    if (ss) ss.querySelectorAll('si').forEach(si => sst.push([...si.querySelectorAll('t')].map(t => t.textContent).join('')));
    const wb = await xml('xl/workbook.xml'); const rels = await xml('xl/_rels/workbook.xml.rels');
    const relMap = {}; if (rels) rels.querySelectorAll('Relationship').forEach(r => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
    let sheets = [];
    if (wb) wb.querySelectorAll('sheets > sheet').forEach(s => { const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'); const t = relMap[rid]; if (t) sheets.push({ name: s.getAttribute('name') || 'Feuille', path: 'xl/' + t.replace(/^\/?xl\//, '') }); });
    if (!sheets.length) sheets = Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort().map((p, i) => ({ name: 'Feuille ' + (i + 1), path: p }));
    const colIdx = ref => { let n = 0; for (const ch of (ref || '').replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
    const out = [];
    for (const sh of sheets.slice(0, 8)) {
      const sx = await xml(sh.path); if (!sx) continue;
      const rows = [];
      sx.querySelectorAll('sheetData > row').forEach(row => {
        const r = (+row.getAttribute('r') || rows.length + 1) - 1; if (r > 450) return;
        const line = rows[r] || (rows[r] = []);
        row.querySelectorAll('c').forEach(c => {
          const i = colIdx(c.getAttribute('r')); if (i < 0 || i > 60) return;
          const t = c.getAttribute('t'); const v = c.querySelector('v'); const is = c.querySelector('is');
          let val = '';
          if (t === 's') val = sst[+(v ? v.textContent : -1)] || '';
          else if (t === 'inlineStr') val = is ? is.textContent : '';
          else if (t === 'b') val = v && v.textContent === '1' ? 'VRAI' : 'FAUX';
          else if (v) { const num = +v.textContent; val = Number.isFinite(num) && !Number.isInteger(num) ? String(Math.round(num * 1e6) / 1e6).replace('.', ',') : v.textContent; }
          line[i] = val;
        });
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      while (rows.length && !rows[rows.length - 1].some(x => x)) rows.pop();
      out.push(`<div class="vw-doc fv-sheet"><h3>${esc(sh.name)}</h3>${rows.length ? gridTable(rows) : '<i>Feuille vide</i>'}</div>`);
    }
    return out.join('') || '<div class="vw-empty">Aucune feuille lisible dans ce classeur.</div>';
  }
  /* affiche le fichier dans le panneau « Document » à côté de la séance ouverte */
  async function showBeside(x) {
    const h = handleOf(x); if (!h || !currentDocId) return;
    const buf = await h.data(); if (!buf) { toast('Contenu indisponible sur cet appareil'); return; }
    showViewerFile(h.f.name, buf, '');
  }

  /* ---------------- bibliothèque : cartes, arbre, menus ---------------- */
  const cloudBadge = f => !Cloud.enabled ? '' : f.cloud ? '<span class="file-cloud ok" title="Synchronisé avec votre compte">☁</span>' : (f.size > MAX_SYNC ? '<span class="file-cloud off" title="Plus de 20 Mo : reste sur cet appareil">⌂</span>' : '<span class="file-cloud wait" title="En attente de synchronisation">☁</span>');
  /* cartes des fichiers reçus par Alixo Share (vue d'un dossier partagé) */
  function sharedGridHTML(list, hasOther) {
    if (!list || !list.length) return '';
    return `${hasOther ? '<div class="grid-sect">Fichiers partagés</div>' : ''}${list.map(f => `<button class="file-card shared-card" data-shfile="${esc(f.id)}" data-sid="${esc(f.sid)}" style="--mc:${kindOf(f.name).color}" title="${esc(f.name)}">
        ${iconHTML(f.name, 'big')}<div class="file-info"><h3>${esc(f.name)}</h3><div class="meta">${kindOf(f.name).label} · ${fmtSize(f.size)} · partagé</div></div></button>`).join('')}`;
  }
  function gridHTML(fid, hasOther) {
    const list = inFolder(fid); if (!list.length) return '';
    return `${hasOther ? '<div class="grid-sect">Fichiers</div>' : ''}${list.map(f => `<button class="file-card" data-file="${f.id}" draggable="true" style="--mc:${kindOf(f.name).color}" title="${esc(f.name)}">
        ${iconHTML(f.name, 'big')}<div class="file-info"><h3>${esc(f.name)}</h3><div class="meta">${kindOf(f.name).label} · ${fmtSize(f.size)} · ${fmtDate(f.createdAt || Date.now())} ${cloudBadge(f)}</div></div>
        <span class="del-btn" data-filedel="${f.id}" title="Supprimer"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span></button>`).join('')}`;
  }
  const sideTreeHTML = fid => inFolder(fid).map(f => `<div class="tree-row doc file"><button class="tree-caret leaf">▶</button><button class="tree-label" data-file="${f.id}" title="Ouvrir le fichier">${iconHTML(f.name, 'mini')}<span class="tree-name">${esc(f.name)}</span></button></div>`).join('');
  const libTreeHTML = fid => inFolder(fid).map(f => `<div class="tn"><button class="tn-card tn-doc tn-file" data-file="${f.id}" draggable="true">${iconHTML(f.name, 'mini')}<span class="tn-name">${esc(f.name)}</span></button></div>`).join('');
  const count = fid => inFolder(fid).length;
  const subtreeCount = fid => { const ids = new Set(descendantIds(fid)); return files().filter(f => ids.has(f.folderId)).length; };

  function openMenu(x, y, id) {
    const f = byId(id); if (!f) return;
    const desk = !!(window.alixoDesktop && window.alixoDesktop.openData);
    const menu = $('#ctxmenu');
    menu.innerHTML = `<div class="cm-title">${esc(f.name)}</div>
      <button data-fcm="open">${CM_ICO.open}Ouvrir dans Alixo</button>
      ${desk ? `<button data-fcm="ext">${CM_ICO.share}Ouvrir avec l’application associée</button>` : ''}
      ${currentDocId ? `<button data-fcm="side">${CM_ICO.dup}Afficher à côté du cours</button>` : ''}
      ${window.AlixoShare && AlixoShare.enabled ? `<button data-fcm="share">${CM_ICO.share}Partager…</button>` : ''}
      <button data-fcm="rename">${CM_ICO.pen}Renommer…</button>
      <button data-fcm="move">${CM_ICO.move}Déplacer vers…</button>
      <button data-fcm="save">${CM_ICO.zip}Enregistrer une copie…</button>
      <button data-fcm="delete" class="danger">${CM_ICO.trash}Supprimer</button>`;
    menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = ''; menu.dataset.file = id;
    placeCtxMenu(menu, x, y);
  }
  $('#ctxmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-fcm]'); if (!b) return;
    const id = $('#ctxmenu').dataset.file; closeCtxMenu();
    const k = b.dataset.fcm;
    if (k === 'open') open(id); if (k === 'ext') openExternal(id); if (k === 'side') showBeside(id);
    if (k === 'rename') rename(id); if (k === 'move') openMove(id); if (k === 'save') saveCopy(id); if (k === 'delete') remove(id);
    if (k === 'share') { if (window.AlixoShare && AlixoShare.enabled) AlixoShare.openShareFor('file', id); else toast('Alixo Share nécessite un compte en ligne'); }
  });
  /* menu d'un fichier REÇU par Alixo Share : lecture, enregistrement, copie dans ma bibliothèque */
  function openSharedMenu(x, y, sid, id) {
    const f = window.AlixoShare && AlixoShare.enabled ? AlixoShare.sharedFileById(sid, id) : null;
    if (!f) return;
    const desk = !!(window.alixoDesktop && window.alixoDesktop.openData);
    const menu = $('#ctxmenu');
    menu.innerHTML = `<div class="cm-title">${esc(f.name)}</div>
      <button data-shfcm="open">${CM_ICO.open}Ouvrir dans Alixo</button>
      ${desk ? `<button data-shfcm="ext">${CM_ICO.share}Ouvrir avec l’application associée</button>` : ''}
      ${currentDocId ? `<button data-shfcm="side">${CM_ICO.dup}Afficher à côté du cours</button>` : ''}
      <button data-shfcm="copy">${CM_ICO.dup}Copier dans mes fichiers</button>
      <button data-shfcm="save">${CM_ICO.zip}Enregistrer une copie…</button>`;
    menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = ''; menu.dataset.file = '';
    menu.dataset.shfile = sid + '|' + id;
    placeCtxMenu(menu, x, y);
  }
  $('#ctxmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-shfcm]'); if (!b) return;
    const raw = $('#ctxmenu').dataset.shfile || ''; $('#ctxmenu').dataset.shfile = ''; closeCtxMenu();
    const [sid, id] = raw.split('|');
    const f = window.AlixoShare && AlixoShare.enabled ? AlixoShare.sharedFileById(sid, id) : null;
    if (!f) return;
    const k = b.dataset.shfcm;
    if (k === 'open') open(f); if (k === 'ext') openExternal(f); if (k === 'side') showBeside(f);
    if (k === 'save') saveCopy(f); if (k === 'copy') adoptShared(f);
  });
  /* copier un fichier partagé dans ma bibliothèque (dossier affiché) */
  async function adoptShared(f) {
    const buf = await sharedData(f);
    if (!buf) { toast('Contenu indisponible : le propriétaire doit avoir ouvert Alixo depuis le partage'); return; }
    const fid = libMode === 'docs' || libMode === 'tree' ? currentFolderId : null;
    const copy = new File([buf], f.name, { type: f.mime || 'application/octet-stream' });
    const added = await addFiles([copy], fid);
    if (added && added.length) toast(`« ${f.name} » copié dans ${folder(fid) ? '« ' + folder(fid).nom + ' »' : 'Mes cours'}`);
  }
  for (const sel of ['#doc-grid', '#lib-tree', '#folder-tree']) {
    const el = $(sel); if (!el) continue;
    el.addEventListener('click', e => {
      const del = e.target.closest('[data-filedel]'); if (del) { e.stopPropagation(); remove(del.dataset.filedel); return; }
      const sb = e.target.closest('[data-shfile]');
      if (sb) { e.stopPropagation(); if (window.AlixoShare && AlixoShare.enabled) AlixoShare.openSharedFile(sb.dataset.sid, sb.dataset.shfile); return; }
      const b = e.target.closest('[data-file]'); if (b) { e.stopPropagation(); open(b.dataset.file); }
    }, true);
    el.addEventListener('contextmenu', e => {
      const sb = e.target.closest('[data-shfile]');
      if (sb) { e.preventDefault(); e.stopPropagation(); openSharedMenu(e.clientX, e.clientY, sb.dataset.sid, sb.dataset.shfile); return; }
      const b = e.target.closest('[data-file]'); if (!b) return; e.preventDefault(); e.stopPropagation(); openMenu(e.clientX, e.clientY, b.dataset.file);
    }, true);
  }

  /* fichiers glissés depuis l'ordinateur : sur un dossier (carte, arbre) ou dans le dossier affiché */
  const lib = $('#view-library');
  const hasOsFiles = e => !!(e.dataTransfer && [...e.dataTransfer.types].includes('Files')) && !drag;
  const dropFolderOf = e => {
    const fc = e.target.closest('.folder-card'); if (fc) return { el: fc, fid: fc.dataset.fid };
    const tn = e.target.closest('.tn-folder, .tn-root'); if (tn) return { el: tn, fid: tn.dataset.tfid || null };
    const row = e.target.closest('#folder-tree .tree-row'); const ob = row && row.querySelector('[data-open]'); if (ob) return { el: row, fid: ob.dataset.open || null };
    return { el: null, fid: currentFolderId };
  };
  lib.addEventListener('dragover', e => {
    if (!hasOsFiles(e) || libMode !== 'docs') return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    clearDropTargets(); const t = dropFolderOf(e); if (t.el) t.el.classList.add('drop-target');
    lib.classList.add('files-over');
  });
  lib.addEventListener('dragleave', e => { if (!lib.contains(e.relatedTarget)) { lib.classList.remove('files-over'); clearDropTargets(); } });
  lib.addEventListener('drop', e => {
    if (!hasOsFiles(e) || libMode !== 'docs') return;
    e.preventDefault(); lib.classList.remove('files-over'); clearDropTargets();
    addFiles(e.dataTransfer.files, dropFolderOf(e).fid);
  });

  /* ---------------- synchronisation (Cloud Firestore) ---------------- */
  const Cloud = (() => {
    const A = window.AlixoAuth; const acc = A && A.isConfigured && A.account();
    const off = { enabled: false, schedule() {}, download: async () => null, status: () => '' };
    if (!acc || !window.firebase || !firebase.firestore) return off;
    const db = firebase.firestore(); const ref = db.collection('users').doc(acc.uid).collection('files');
    const Blob_ = firebase.firestore.Blob;
    let tm = null, busy = false, again = false, denied = false, started = false;
    const pushedMeta = new Map();   // id → JSON de la fiche connue du nuage
    const metaOf = f => ({ name: f.name, size: f.size, mime: f.mime || '', folderId: f.folderId || null, createdAt: f.createdAt || 0, updatedAt: f.updatedAt || 0 });

    function schedule() { if (denied) return; clearTimeout(tm); tm = setTimeout(push, 1800); }
    async function delRemote(id) {
      const ch = await ref.doc(id).collection('chunks').get();
      let batch = db.batch(), n = 0;
      for (const d of ch.docs) { batch.delete(d.ref); if (++n >= 200) { await batch.commit(); batch = db.batch(); n = 0; } }
      batch.delete(ref.doc(id)); await batch.commit();
      pushedMeta.delete(id);
    }
    async function push() {
      if (!started || denied) return;
      if (busy) { again = true; return; }
      busy = true;
      try {
        // suppressions faites ici
        const tombs = (state.deleted && state.deleted.files) || {};
        for (const id of Object.keys(tombs)) { if (byId(id) || !pushedMeta.has(id)) continue; await delRemote(id); }
        for (const f of [...files()]) {
          if (!f.cloud) {
            if (f.size > MAX_SYNC) continue;
            const buf = await getLocal(f.id); if (!buf) continue;   // fiche venue d'ailleurs, contenu pas encore ici
            const u8 = new Uint8Array(buf instanceof Blob ? await buf.arrayBuffer() : buf);
            const n = Math.max(1, Math.ceil(u8.length / CHUNK));
            for (let i = 0; i < n; i++) await ref.doc(f.id).collection('chunks').doc(String(i).padStart(4, '0')).set({ i, data: Blob_.fromUint8Array(u8.subarray(i * CHUNK, Math.min(u8.length, (i + 1) * CHUNK))) });
            if (!byId(f.id)) { await delRemote(f.id).catch(() => {}); continue; }   // supprimé pendant l'envoi
            const m = Object.assign(metaOf(f), { chunks: n });
            await ref.doc(f.id).set(m);   // la fiche en dernier : un fichier visible ailleurs est toujours complet
            pushedMeta.set(f.id, JSON.stringify(metaOf(f)));
            f.cloud = true; save(); refreshLibrary();
          } else {
            const j = JSON.stringify(metaOf(f));
            if (pushedMeta.get(f.id) === j) continue;
            await ref.doc(f.id).set(metaOf(f), { merge: true });
            pushedMeta.set(f.id, j);
          }
        }
      } catch (err) {
        console.error('Fichiers (envoi) :', err);
        if (err && /permission-denied/.test(err.code || '')) denied = true;
      }
      busy = false;
      if (again) { again = false; schedule(); }
    }
    async function download(id, onProgress) {
      try {
        const head = await ref.doc(id).get(); if (!head.exists) return null;
        const n = head.data().chunks || 0; if (!n) return null;
        const parts = []; let total = 0;
        for (let i = 0; i < n; i++) {
          const s = await ref.doc(id).collection('chunks').doc(String(i).padStart(4, '0')).get();
          if (!s.exists) return null;
          const u = s.data().data.toUint8Array(); parts.push(u); total += u.length;
          if (onProgress) onProgress((i + 1) / n);
        }
        const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
        return out.buffer;
      } catch (err) { console.error('Fichiers (téléchargement) :', err); return null; }
    }
    function listen() {
      ref.onSnapshot(snap => {
        let changed = false;
        snap.docChanges().forEach(ch => {
          if (ch.doc.metadata.hasPendingWrites) return;
          const id = ch.doc.id;
          if (ch.type === 'removed') {
            pushedMeta.delete(id);
            const f = byId(id);
            if (f && f.cloud) { state.files = files().filter(x => x.id !== id); delLocal(id); changed = true; }   // supprimé sur un autre appareil
            return;
          }
          const m = ch.doc.data(); if (!m || !m.chunks) return;
          if (isTombstoned('files', id, m.updatedAt || 0)) { schedule(); pushedMeta.set(id, ''); return; }   // supprimé ici : le nuage suivra
          const meta = { name: m.name, size: m.size, mime: m.mime || '', folderId: m.folderId || null, createdAt: m.createdAt || 0, updatedAt: m.updatedAt || 0 };
          const f = byId(id);
          if (!f) { files().push(Object.assign({ id, cloud: true }, meta)); pushedMeta.set(id, JSON.stringify(meta)); changed = true; return; }
          if (!f.cloud) { f.cloud = true; changed = true; }
          if ((m.updatedAt || 0) > (f.updatedAt || 0)) { Object.assign(f, meta); pushedMeta.set(id, JSON.stringify(meta)); changed = true; }
          else if (!pushedMeta.has(id)) pushedMeta.set(id, JSON.stringify(meta));
        });
        if (!started) { started = true; schedule(); }
        if (changed) { save(); refreshLibrary(); }
      }, err => {
        console.error('Fichiers (réception) :', err);
        if (err && /permission-denied/.test(err.code || '')) denied = true;
        started = true;
      });
    }
    setTimeout(listen, 1200);
    return { enabled: true, schedule, download, status: () => denied ? 'denied' : (busy ? 'busy' : 'ok') };
  })();

  { const ib = $('#btn-import-files'); if (ib) ib.addEventListener('click', () => pick(currentFolderId)); }
  // la bibliothèque a pu être dessinée avant le chargement de ce module
  setTimeout(() => { try { refreshLibrary(); } catch { /* pas encore prête */ } }, 0);

  return { open, openShared, openSharedMenu, pick, addFiles, remove, rename, move, openMove, openMenu, getData, gridHTML, sharedGridHTML, sideTreeHTML, libTreeHTML, count, subtreeCount, detachFolders, inFolder, byId, iconHTML, fmtSize, kindOf, render, showBeside, syncStatus: () => Cloud.status(), cloudEnabled: Cloud.enabled };
})();
