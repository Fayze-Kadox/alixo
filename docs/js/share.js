/* ============================================================
   Alixo Share — partage de séances, de dossiers et d'événements
   entre membres d'Alixo (Cloud Firestore). Chargé APRÈS app.js et
   sync.js : utilise directement les fonctions globales de l'application.

   Données :
   - profiles/{uid}            → { email, emailLower, name, pseudo, pseudoLower }
   - shares/{sid}              → { owner, ownerName, ownerEmail, kind: doc|folder|event, target, title, color,
                                   members: { uid: { role: read|write, name, email, since } }, memberIds: [uid],
                                   invites: [{ email, role, name, by, ts }], inviteEmails: [email],
                                   excluded: [ids], folder: { root, folders }, event: {…}, createdAt, updatedAt }
   - shares/{sid}/docs/{docId} → { updatedAt, data: JSON de la séance, by, byName }
   - shares/{sid}/log/{id}     → { ts, uid, name, action, docId, title, detail }
   - shares/{sid}/presence/{uid} → { name, color, docId, blockId, ts } — qui consulte / modifie quoi, en direct (1.15)
   - shares/{sid}/imgs/{iid}   → { ts, data: data URL, by } — images des séances partagées (liste dans shares/{sid}.imgIds)
   - shares/{sid}/files/{fid}  → { name, size, mime, folderId, createdAt, updatedAt, chunks, by, byName } (1.17)
     et shares/{sid}/files/{fid}/chunks/{n} → { i, data } — fichiers partagés (PDF, Word…), par morceaux de 700 Ko
   - mail/{id}                 → { to, message } (extension Firebase « Trigger Email », facultative)
   E-mails d'invitation : window.ALIXO_MAIL = { webhook, key } (firebase-config.js) sinon brouillon Gmail / mailto.
   ============================================================ */
'use strict';

window.AlixoShare = (() => {
  const A = window.AlixoAuth;
  const acc = A && A.isConfigured && A.account();
  const OFF = { enabled: false, docById: () => null, sharedDocs: () => [], canWrite: () => false, infoFor: () => null, onLocalSave() {}, invites: () => [], tintFor: () => null, labelFor: () => '', renderSharedHome() {}, openShareFor() {}, openInfo() {}, setPseudo() {}, pseudo: () => '', pendingCount: () => 0, leaveEvent() {}, fetchImage: async () => null, eventDeleted() {}, accessFor: () => null, sharedFolders: () => [], sharedFolderView: () => null, setPresence() {}, peersFor: () => [], colorFor: () => '#33658a', sharedFilesIn: () => [], sharedFileById: () => null, shareMeta: () => null, fetchFile: async () => null, openSharedFile() {} };
  if (!acc || !window.firebase || !firebase.firestore || !window.AlixoApp) return OFF;

  const uid = acc.uid;
  const me = { uid, email: (acc.email || '').toLowerCase(), name: acc.name || (acc.email || '').split('@')[0] };
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const sharesRef = db.collection('shares');

  const shares = new Map();     // sid → données du partage (possédé, accepté ou invitation en attente)
  const docsBy = new Map();     // sid → Map(docId → séance) — partages reçus
  const unsubDocs = new Map();  // sid → désabonnement de la sous-collection docs
  const lastPushed = new Map(); // `${sid}/${docId}` → JSON connu du nuage
  const lastMeta = new Map();   // sid → JSON des métadonnées poussées
  const lastLog = new Map();    // `${sid}/${docId}` → horodatage de la dernière entrée « modification »
  const openedLogged = new Set();
  let profile = { pseudo: '' };
  let pushTm = null;
  let ready = false;

  const now = () => Date.now();
  const norm2 = s => String(s || '').trim().toLowerCase();
  const isOwner = sh => sh && sh.owner === uid;
  const myRole = sh => (sh && sh.members && sh.members[uid] && sh.members[uid].role) || '';
  const isMember = sh => !!(sh && Array.isArray(sh.memberIds) && sh.memberIds.includes(uid));
  const isInvited = sh => !!(sh && Array.isArray(sh.inviteEmails) && me.email && sh.inviteEmails.includes(me.email));
  const fmtWhen = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const kindLabel = k => ({ doc: 'séance', folder: 'dossier', event: 'événement', file: 'fichier' }[k] || k);
  /* article défini du type, pour les phrases (« partage la séance », « le fichier »…) */
  const kindThe = k => (k === 'doc' ? 'la séance' : k === 'folder' ? 'le dossier' : k === 'file' ? 'le fichier' : 'l’événement');
  const initial = s => (s || '?').trim()[0].toUpperCase();

  /* ---------------- profil (pseudo) ---------------- */
  async function saveProfile(extra) {
    try {
      const data = Object.assign({ uid, email: me.email, emailLower: me.email, name: me.name, updatedAt: now() }, extra || {});
      await db.collection('profiles').doc(uid).set(data, { merge: true });
    } catch (err) { console.error('Share (profil) :', err); }
  }
  async function loadProfile() {
    try { const s = await db.collection('profiles').doc(uid).get(); const d = s.exists ? s.data() : null; profile.pseudo = (d && d.pseudo) || ''; } catch { /* hors ligne */ }
  }
  /* message lisible pour une erreur Firestore (règles non publiées, hors ligne…) */
  function friendly(err) {
    const code = (err && err.code) || '';
    if (/permission-denied/.test(code)) return 'Accès refusé par le serveur : les règles Firestore d’Alixo Share ne sont pas publiées (voir SETUP-COMPTES.md, section 3).';
    if (/unavailable|network/.test(code)) return 'Serveur injoignable — vérifiez la connexion internet.';
    return (err && err.message) || String(err);
  }
  async function setPseudo(p) {
    p = String(p || '').trim().replace(/\s+/g, ' ');
    if (p && !/^[\p{L}\p{N} ._-]{3,24}$/u.test(p)) { toast('Pseudo : 3 à 24 caractères (lettres, chiffres, espace, . _ -)'); return false; }
    try {
      if (p) {
        const q = await db.collection('profiles').where('pseudoLower', '==', norm2(p)).limit(1).get();
        if (!q.empty && q.docs[0].id !== uid) { toast('Ce pseudo est déjà pris'); return false; }
      }
      await db.collection('profiles').doc(uid).set({ uid, email: me.email, emailLower: me.email, name: me.name, pseudo: p, pseudoLower: norm2(p), updatedAt: now() }, { merge: true });
    } catch (err) { console.error('Share (pseudo) :', err); toast(friendly(err), { duration: 7000 }); return false; }
    profile.pseudo = p;
    toast(p ? `Pseudo « ${p} » enregistré — vos amis peuvent vous inviter avec` : 'Pseudo retiré');
    return true;
  }
  /* trouve un membre par pseudo ou par e-mail → { uid?, email, name } */
  async function findUser(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    if (s.includes('@')) {
      const email = norm2(s);
      try { const q = await db.collection('profiles').where('emailLower', '==', email).limit(1).get(); if (!q.empty) { const d = q.docs[0].data(); return { uid: q.docs[0].id, email, name: d.pseudo || d.name || email }; } } catch { /* règles / hors ligne */ }
      return { email, name: email.split('@')[0] };
    }
    const q = await db.collection('profiles').where('pseudoLower', '==', norm2(s.replace(/^@/, ''))).limit(1).get();
    if (q.empty) return null;
    const d = q.docs[0].data();
    return { uid: q.docs[0].id, email: d.emailLower || d.email, name: d.pseudo || d.name || '' };
  }

  /* ---------------- contenu partagé par le propriétaire ---------------- */
  function includedDocIds(sh) {
    if (sh.kind === 'doc') return state.docs.some(d => d.id === sh.target) ? [sh.target] : [];
    if (sh.kind !== 'folder' || !folder(sh.target)) return [];
    const excluded = new Set(sh.excluded || []);
    const ids = [];
    const walk = fid => {
      if (excluded.has(fid) && fid !== sh.target) return;
      for (const d of folderDocs(fid)) if (!excluded.has(d.id)) ids.push(d.id);
      for (const c of childFolders(fid)) walk(c.id);
    };
    walk(sh.target);
    return ids;
  }
  function folderSnapshot(sh) {
    const root = folder(sh.target); if (!root) return null;
    const excluded = new Set(sh.excluded || []);
    const folders = [];
    const walk = fid => { for (const c of childFolders(fid)) { if (excluded.has(c.id)) continue; folders.push({ id: c.id, nom: c.nom, parentId: c.parentId || null, couleur: c.couleur || '', icone: c.icone || '' }); walk(c.id); } };
    walk(root.id);
    return { root: { id: root.id, nom: root.nom, couleur: root.couleur || '', icone: root.icone || '' }, folders };
  }
  function titleOf(sh) {
    if (sh.kind === 'doc') { const d = state.docs.find(x => x.id === sh.target); return d ? (d.titre || 'Sans titre') : sh.title; }
    if (sh.kind === 'folder') { const f = folder(sh.target); return f ? f.nom : sh.title; }
    if (sh.kind === 'event') { const ev = (state.events || []).find(x => x.id === sh.target); return ev ? ev.title : sh.title; }
    if (sh.kind === 'file') { const f = sharedFileSource(sh.target); return f ? f.name : sh.title; }
    return sh.title;
  }
  function colorOf(sh) {
    if (sh.kind === 'doc') { const d = state.docs.find(x => x.id === sh.target); return d ? folderTint(d.folderId) : (sh.color || DEFAULT_TINT); }
    if (sh.kind === 'folder') return folderTint(sh.target);
    if (sh.kind === 'event') { const ev = (state.events || []).find(x => x.id === sh.target); return (ev && ev.color) || sh.color || DEFAULT_TINT; }
    if (sh.kind === 'file') { const f = sharedFileSource(sh.target); return f ? folderTint(f.folderId) : (sh.color || DEFAULT_TINT); }
    return sh.color || DEFAULT_TINT;
  }
  /* fiche d'un fichier de MA bibliothèque (js/files.js), pour les partages dont je suis propriétaire */
  const sharedFileSource = id => (window.AlixoFiles ? AlixoFiles.byId(id) : null);
  const pushedIds = new Map();   // sid → Set(docId) présents dans le nuage (partages possédés)

  const pushErr = new Map();     // sid → dernier message d'erreur d'envoi (affiché dans le gestionnaire de partage)
  const DOC_MAX = 1000000;       // Firestore : 1 Mio par document
  const BATCH_OPS = 100, BATCH_BYTES = 4000000;
  let tooBigWarned = false;

  function schedulePush() { clearTimeout(pushTm); pushTm = setTimeout(push, 1500); }
  let pushing = false, pushAgain = false;
  async function push() {
    if (!ready) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    try {
      for (const sh of [...shares.values()]) {
        // un partage en échec ne bloque pas les autres
        try {
          if (isOwner(sh)) await pushOwned(sh);
          else if (isMember(sh) && myRole(sh) === 'write') await pushEdits(sh);
          pushErr.delete(sh.id);
        } catch (err) { console.error('Share (envoi) :', sh.title, err); pushErr.set(sh.id, friendly(err)); }
      }
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; schedulePush(); }
    }
  }
  /* la cible n'existe plus : seulement si elle a été supprimée ICI (pierre tombale) — sur un appareil où la
     synchronisation n'a pas encore ramené le cours, « absent » ne veut pas dire « supprimé » */
  function targetGone(sh) {
    if (sh.kind === 'doc') return !state.docs.some(d => d.id === sh.target) && isTombstoned('docs', sh.target);
    if (sh.kind === 'folder') return !folder(sh.target) && isTombstoned('folders', sh.target);
    if (sh.kind === 'file') return !sharedFileSource(sh.target) && isTombstoned('files', sh.target);
    return false;   // événements : arrêt explicite à la suppression (eventDeleted)
  }
  function targetHere(sh) {
    if (sh.kind === 'doc') return state.docs.some(d => d.id === sh.target);
    if (sh.kind === 'folder') return !!folder(sh.target);
    if (sh.kind === 'file') return !!sharedFileSource(sh.target);
    return (state.events || []).some(e => e.id === sh.target);
  }
  /* écritures par lots (≤ 100 opérations et ≈ 4 Mo par lot) ; `done` n'est appelé qu'une fois le lot accepté :
     un envoi refusé sera donc retenté au prochain passage au lieu d'être considéré comme fait */
  async function commitOps(ops) {
    let batch = db.batch(), n = 0, bytes = 0, dones = [];
    const flush = async () => { if (!n) return; await batch.commit(); dones.forEach(f => f()); batch = db.batch(); n = 0; bytes = 0; dones = []; };
    for (const op of ops) {
      if (n >= BATCH_OPS || (n && bytes + op.size > BATCH_BYTES)) await flush();
      if (op.del) batch.delete(op.ref); else batch.set(op.ref, op.data);
      n++; bytes += op.size; if (op.done) dones.push(op.done);
    }
    await flush();
  }
  function warnTooBig(d) {
    if (tooBigWarned) return; tooBigWarned = true;
    toast(`« ${d.titre || 'Sans titre'} » est trop volumineuse pour être partagée (plus de 1 Mo de texte)`, { duration: 7000 });
  }
  async function pushOwned(sh) {
    const ref = sharesRef.doc(sh.id);
    if (targetGone(sh)) { await deleteShare(sh.id, true); return; }
    if (!targetHere(sh)) return;   // pas encore synchronisé sur cet appareil : on ne touche à rien
    const meta = { title: titleOf(sh), color: colorOf(sh), updatedAt: now() };
    if (sh.kind === 'folder') meta.folder = folderSnapshot(sh);
    if (sh.kind === 'event') meta.event = (state.events || []).find(e => e.id === sh.target) || null;
    const mj = JSON.stringify([meta.title, meta.color, meta.folder || null, meta.event || null]);
    if (lastMeta.get(sh.id) !== mj) { await ref.set(meta, { merge: true }); lastMeta.set(sh.id, mj); }
    if (sh.kind === 'event') return;
    if (sh.kind === 'file') { await pushFiles(sh); return; }
    const ids = includedDocIds(sh);
    const ops = [];
    const seen = new Set();
    const known = pushedIds.get(sh.id) || pushedIds.set(sh.id, new Set()).get(sh.id);
    const docs = [];
    for (const id of ids) {
      const d = state.docs.find(x => x.id === id); if (!d) continue;
      seen.add(id); docs.push(d);
      const j = JSON.stringify(d), k = sh.id + '/' + id;
      if (lastPushed.get(k) === j) continue;
      if (j.length > DOC_MAX) { warnTooBig(d); continue; }
      ops.push({ ref: ref.collection('docs').doc(id), data: { updatedAt: d.updatedAt || now(), data: j, by: uid, byName: me.name }, size: j.length, done: () => { lastPushed.set(k, j); known.add(id); } });
    }
    for (const id of [...known]) {
      if (seen.has(id)) continue;
      ops.push({ ref: ref.collection('docs').doc(id), del: true, size: 200, done: () => { known.delete(id); lastPushed.delete(sh.id + '/' + id); } });
    }
    await commitOps(ops);
    await pushImgs(sh, docs);
    await pushFiles(sh);
  }
  async function pushEdits(sh) {
    const docs = docsBy.get(sh.id); if (!docs) return;
    const ref = sharesRef.doc(sh.id);
    for (const [id, d] of docs) {
      const j = JSON.stringify(d), k = sh.id + '/' + id;
      if (lastPushed.get(k) === j) continue;
      if (j.length > DOC_MAX) { warnTooBig(d); continue; }
      await ref.collection('docs').doc(id).set({ updatedAt: d.updatedAt || now(), data: j, by: uid, byName: me.name });
      lastPushed.set(k, j);
      if (now() - (lastLog.get(k) || 0) > 5 * 60000) { lastLog.set(k, now()); log(sh.id, 'edit', id, d.titre || 'Sans titre'); }
    }
    await pushImgs(sh, [...docs.values()]);
  }
  /* images des séances partagées : copiées dans shares/{sid}/imgs/{iid} (les membres n'ont pas accès à users/{uid}/imgs) */
  const imgsTried = new Set();   // `${sid}/${iid}` déjà envoyées (ou refusées) pendant cette session
  async function pushImgs(sh, docs) {
    const have = new Set(sh.imgIds || []);
    const added = [];
    const iids = [];
    for (const d of docs) {
      for (const b of (d.blocks || [])) if (b.type === 'img' && b.iid) iids.push(b.iid);
      for (const s of (d.slides || [])) for (const e of (s.els || [])) if (e.t === 'image' && e.iid) iids.push(e.iid);   // présentations (1.15)
      for (const it of (d.items || [])) if (it.t === 'img' && it.iid) iids.push(it.iid);   // planches (1.23)
    }
    for (const iid of iids) {
      if (have.has(iid) || imgsTried.has(sh.id + '/' + iid)) continue;
      imgsTried.add(sh.id + '/' + iid);
      try {
        const data = await AlixoImages.get(iid);
        if (!data || data.length > DOC_MAX) continue;
        await sharesRef.doc(sh.id).collection('imgs').doc(iid).set({ ts: now(), data, by: uid });
        have.add(iid); added.push(iid);
      } catch (err) { console.error('Share (image) :', err); break; }   // règles « imgs » non publiées : inutile d'insister
    }
    if (added.length) { try { await sharesRef.doc(sh.id).update({ imgIds: FV.arrayUnion(...added) }); sh.imgIds = [...have]; } catch (err) { console.error('Share (images) :', err); } }
  }

  /* ============================================================
     Fichiers partagés (1.17) — PDF, Word, diaporamas, images…
     Le propriétaire recopie le contenu dans shares/{sid}/files/{id} (fiche) +
     .../chunks/{n} (morceaux de 700 Ko) : les membres n'ont pas accès à
     users/{uid}/files. Deux cas : un partage « fichier » (une pièce seule) et
     les fichiers d'un dossier partagé (ceux de moins de 20 Mo, non décochés).
     ============================================================ */
  const FILE_MAX = 20 * 1024 * 1024;      // au-delà : le fichier reste sur l'appareil du propriétaire
  const FILE_CHUNK = 700 * 1024;          // un document Firestore est limité à 1 Mio
  const FBlob = firebase.firestore.Blob;
  const filesBy = new Map();              // sid → Map(fileId → fiche reçue)
  const unsubFiles = new Map();           // sid → désabonnement
  const pushedFiles = new Map();          // sid → Map(fileId → JSON de la fiche envoyée)
  const fileMeta = f => ({ name: f.name, size: f.size || 0, mime: f.mime || '', folderId: f.folderId || null, createdAt: f.createdAt || 0, updatedAt: f.updatedAt || 0 });

  /* fichiers de MA bibliothèque inclus dans ce partage */
  function includedFileIds(sh) {
    const AF = window.AlixoFiles; if (!AF) return [];
    if (sh.kind === 'file') { const f = AF.byId(sh.target); return f ? [f.id] : []; }
    if (sh.kind !== 'folder' || !folder(sh.target)) return [];
    const excluded = new Set(sh.excluded || []);
    const ids = [];
    const walk = fid => {
      if (excluded.has(fid) && fid !== sh.target) return;
      for (const f of AF.inFolder(fid)) if (!excluded.has(f.id) && (f.size || 0) <= FILE_MAX) ids.push(f.id);
      for (const c of childFolders(fid)) walk(c.id);
    };
    walk(sh.target);
    return ids;
  }
  async function delSharedFile(sid, id) {
    const ref = sharesRef.doc(sid).collection('files').doc(id);
    const ch = await ref.collection('chunks').get();
    let batch = db.batch(), n = 0;
    for (const c of ch.docs) { batch.delete(c.ref); if (++n >= 200) { await batch.commit(); batch = db.batch(); n = 0; } }
    batch.delete(ref);
    await batch.commit();
  }
  let fileTooBigWarned = false;
  async function pushFiles(sh) {
    const AF = window.AlixoFiles; if (!AF) return;
    const ref = sharesRef.doc(sh.id).collection('files');
    const known = pushedFiles.get(sh.id) || pushedFiles.set(sh.id, new Map()).get(sh.id);
    const ids = includedFileIds(sh);
    const seen = new Set(ids);
    for (const id of ids) {
      const f = AF.byId(id); if (!f) continue;
      const meta = fileMeta(f), j = JSON.stringify(meta);
      if (known.get(id) === j) continue;
      if (known.has(id)) { await ref.doc(id).set(meta, { merge: true }); known.set(id, j); continue; }   // déjà envoyé : la fiche seule (renommé, déplacé)
      if ((f.size || 0) > FILE_MAX) {
        if (!fileTooBigWarned) { fileTooBigWarned = true; toast(`« ${f.name} » dépasse 20 Mo : il n’est pas partagé`, { duration: 7000 }); }
        continue;
      }
      const buf = await AF.getData(id).catch(() => null);
      if (!buf) continue;                       // contenu pas encore redescendu sur cet appareil : on réessaiera
      const u8 = new Uint8Array(buf);
      const n = Math.max(1, Math.ceil(u8.length / FILE_CHUNK));
      for (let i = 0; i < n; i++) await ref.doc(id).collection('chunks').doc(String(i).padStart(4, '0')).set({ i, data: FBlob.fromUint8Array(u8.subarray(i * FILE_CHUNK, Math.min(u8.length, (i + 1) * FILE_CHUNK))) });
      if (!AF.byId(id)) { await delSharedFile(sh.id, id).catch(() => {}); continue; }   // supprimé pendant l'envoi
      await ref.doc(id).set(Object.assign({}, meta, { chunks: n, by: uid, byName: me.name }));   // la fiche en dernier : un fichier visible est toujours complet
      known.set(id, j);
      log(sh.id, 'file', id, f.name);
    }
    for (const id of [...known.keys()]) {
      if (seen.has(id)) continue;
      await delSharedFile(sh.id, id);
      known.delete(id);
    }
  }
  /* réception : fiches des fichiers partagés (le contenu n'est téléchargé qu'à l'ouverture) */
  function listenFiles(sid) {
    if (unsubFiles.has(sid)) return;
    const u = sharesRef.doc(sid).collection('files').onSnapshot(snap => {
      const map = filesBy.get(sid) || filesBy.set(sid, new Map()).get(sid);
      let changed = false;
      snap.docChanges().forEach(ch => {
        const id = ch.doc.id;
        if (ch.type === 'removed') { if (map.delete(id)) changed = true; return; }
        const m = ch.doc.data(); if (!m || !m.name || !m.chunks) return;
        map.set(id, { id, sid, name: m.name, size: m.size || 0, mime: m.mime || '', folderId: m.folderId || null, createdAt: m.createdAt || 0, updatedAt: m.updatedAt || 0, chunks: m.chunks });
        changed = true;
      });
      if (changed && !currentDocId) { if (libMode === 'shared') renderSharedHome(); else renderLibrary(); }
    }, err => { console.error('Share (fichiers reçus) :', err); });
    unsubFiles.set(sid, u);
  }
  function stopFiles(sid) {
    const u = unsubFiles.get(sid); if (u) { try { u(); } catch { /* déjà coupée */ } unsubFiles.delete(sid); }
    filesBy.delete(sid); pushedFiles.delete(sid);
  }
  /* contenu d'un fichier partagé → ArrayBuffer (null si absent / refusé) */
  async function fetchFile(sid, id, onProgress) {
    try {
      const ref = sharesRef.doc(sid).collection('files').doc(id);
      const head = await ref.get(); if (!head.exists) return null;
      const n = head.data().chunks || 0; if (!n) return null;
      const parts = []; let total = 0;
      for (let i = 0; i < n; i++) {
        const c = await ref.collection('chunks').doc(String(i).padStart(4, '0')).get();
        if (!c.exists) return null;
        const u = c.data().data.toUint8Array(); parts.push(u); total += u.length;
        if (onProgress) onProgress((i + 1) / n);
      }
      const out = new Uint8Array(total); let o = 0; for (const q of parts) { out.set(q, o); o += q.length; }
      return out.buffer;
    } catch (err) { console.error('Share (fichier) :', err); return null; }
  }
  /* fiches reçues : d'un dossier partagé (sid + dossier), d'un partage « fichier » seul, ou par identifiant */
  function sharedFilesIn(sid, fid) {
    const map = filesBy.get(sid); if (!map) return [];
    const sh = shares.get(sid);
    const rootId = sh && sh.folder && sh.folder.root ? sh.folder.root.id : (sh ? sh.target : null);
    const known = new Set(((sh && sh.folder && sh.folder.folders) || []).map(f => f.id)); known.add(rootId);
    const cur = fid || rootId;
    let list = [...map.values()].filter(f => (f.folderId || null) === cur);
    if (cur === rootId) list = list.concat([...map.values()].filter(f => !known.has(f.folderId || null)));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  }
  function sharedFileById(sid, id) { const m = filesBy.get(sid); return (m && m.get(id)) || null; }
  /* informations d'un partage par son identifiant (propriétaire, droit, titre) */
  function shareMeta(sid) { const sh = shares.get(sid); return sh ? { sid, title: sh.title, owner: sh.ownerName || sh.ownerEmail || '', role: myRole(sh), kind: sh.kind, color: sh.color || DEFAULT_TINT, isOwner: isOwner(sh) } : null; }

  /* image d'une séance partagée, pour AlixoImages.get (appareil qui ne l'a pas) */
  async function fetchImage(iid) {
    const cands = [...shares.values()].filter(sh => (isMember(sh) || isOwner(sh)) && sh.kind !== 'event' && (sh.imgIds || []).includes(iid));
    for (const sh of cands.slice(0, 4)) {
      try { const s = await sharesRef.doc(sh.id).collection('imgs').doc(iid).get(); const raw = s.exists ? s.data() : null; if (raw && raw.data) return raw.data; } catch { /* règles ou hors ligne */ }
    }
    return null;
  }
  function log(sid, action, docId, title, detail) {
    sharesRef.doc(sid).collection('log').add({ ts: now(), uid, name: me.name, action, docId: docId || '', title: title || '', detail: detail || '' }).catch(err => console.error('Share (journal) :', err));
  }

  /* ---------------- réception ---------------- */
  /* état de la réception par partage : 'loading' | 'ready' | 'error' (+ message) — affiché dans « Partagés avec moi » */
  const docsState = new Map();   // sid → { st, msg, tries, tm }
  function setDocsState(sid, st, msg) {
    const cur = docsState.get(sid) || { tries: 0, tm: null };
    if (cur.st === st && cur.msg === (msg || '') && docsState.has(sid)) return;
    cur.st = st; cur.msg = msg || '';
    docsState.set(sid, cur);
    if (!currentDocId && libMode === 'shared') renderSharedHome();
  }
  /* l'écoute a été refusée ou coupée : on la relance (1,5 s, 3 s, 6 s… 5 essais). Cas typique : on vient d'accepter
     l'invitation et le serveur a reçu la demande d'écoute AVANT l'écriture qui nous ajoute aux membres —
     sans nouvel essai, la séance restait sur « Chargement… » jusqu'au redémarrage. */
  function retryDocs(sid, err) {
    const u = unsubDocs.get(sid); if (u) { try { u(); } catch { /* déjà coupée */ } unsubDocs.delete(sid); }
    const sh = shares.get(sid);
    if (!sh || !(isOwner(sh) || isMember(sh))) { docsState.delete(sid); return; }
    const cur = docsState.get(sid) || { tries: 0, tm: null };
    cur.tries = (cur.tries || 0) + 1; docsState.set(sid, cur);
    if (cur.tries > 5) { setDocsState(sid, 'error', friendly(err)); return; }
    clearTimeout(cur.tm);
    cur.tm = setTimeout(() => listenDocs(sid), 750 * Math.pow(2, cur.tries));
  }
  /* bouton « Réessayer » et clic sur une séance pas encore reçue */
  function reloadDocs(sid) {
    const cur = docsState.get(sid); if (cur) { clearTimeout(cur.tm); cur.tries = 0; }
    const u = unsubDocs.get(sid); if (u) { try { u(); } catch { /* */ } unsubDocs.delete(sid); }
    listenDocs(sid);
  }
  function listenDocs(sid) {
    if (unsubDocs.has(sid)) return;
    const sh = shares.get(sid);
    if (!sh) return;
    if (!docsBy.has(sid)) setDocsState(sid, 'loading');
    const u = sharesRef.doc(sid).collection('docs').onSnapshot(snap => {
      const owner = isOwner(shares.get(sid) || sh);
      { const cur = docsState.get(sid); if (cur) { cur.tries = 0; clearTimeout(cur.tm); } }
      if (!docsBy.has(sid)) docsBy.set(sid, new Map());
      if (!snap.metadata.fromCache || snap.size) setDocsState(sid, 'ready');
      const map = docsBy.get(sid) || docsBy.set(sid, new Map()).get(sid);
      const removed = [];
      let changedCurrent = false;
      snap.docChanges().forEach(ch => {
        const id = ch.doc.id, k = sid + '/' + id;
        if (owner) (pushedIds.get(sid) || pushedIds.set(sid, new Set()).get(sid))[ch.type === 'removed' ? 'delete' : 'add'](id);
        if (ch.doc.metadata.hasPendingWrites) return;
        if (ch.type === 'removed') { if (!owner) { map.delete(id); removed.push(id); } lastPushed.delete(k); return; }
        const raw = ch.doc.data(); if (!raw || !raw.data) return;
        if (lastPushed.get(k) === raw.data) return;
        let remote; try { remote = JSON.parse(raw.data); } catch { return; }
        if (owner) {
          if (raw.by === uid) { lastPushed.set(k, raw.data); return; }
          const local = state.docs.find(d => d.id === id);
          if (local && (local.updatedAt || 0) >= (remote.updatedAt || 0)) return;
          lastPushed.set(k, raw.data);
          AlixoApp.applyRemoteDocs([remote], []);
          if (currentDocId !== id) toast(`« ${remote.titre || 'Sans titre'} » modifiée par ${raw.byName || 'un membre'}`);
          return;
        }
        lastPushed.set(k, raw.data);
        const local = map.get(id);
        if (local && raw.by === uid && (local.updatedAt || 0) >= (remote.updatedAt || 0)) return;
        if (currentDocId === id && AlixoApp.mergeRemoteDoc) { map.set(id, AlixoApp.mergeRemoteDoc(remote, raw.byName || 'un membre')); changedCurrent = true; }
        else { map.set(id, remote); if (currentDocId === id) changedCurrent = true; }
      });
      if (owner) return;
      if (removed.includes(currentDocId)) { toast('Cette séance n’est plus partagée avec vous'); showLibrary(); }
      else if (changedCurrent && !AlixoApp.mergeRemoteDoc) { renderCrumbs(); renderEditor(); }
      if (!currentDocId && libMode !== 'shared') renderLibrary();
      openTabs = openTabs.filter(id => !removed.includes(id)); renderTabs();
      if (!currentDocId && libMode === 'shared') renderSharedHome();
    }, err => { console.error('Share (réception) :', err); retryDocs(sid, err); });
    unsubDocs.set(sid, u);
    listenPresence(sid);
    listenFiles(sid);
  }
  function stopDocs(sid) {
    const u = unsubDocs.get(sid); if (u) { try { u(); } catch { /* déjà coupée */ } unsubDocs.delete(sid); }
    const up = unsubPres.get(sid); if (up) { try { up(); } catch { /* */ } unsubPres.delete(sid); presence.delete(sid); }
    const cur = docsState.get(sid); if (cur) clearTimeout(cur.tm);
    docsState.delete(sid); docsBy.delete(sid);
    stopFiles(sid);
  }

  function applyShareSnapshot(docs, source) {
    const seen = new Set();
    docs.forEach(s => {
      const sh = Object.assign({ id: s.id }, s.data());
      seen.add(sh.id);
      const prev = shares.get(sh.id);
      shares.set(sh.id, sh);
      // membre : on n'écoute qu'une fois l'adhésion confirmée par le serveur (accept() s'en charge, sinon accès refusé)
      const pending = !!(s.metadata && s.metadata.hasPendingWrites) && !isOwner(sh);
      if ((isOwner(sh) || isMember(sh)) && !pending) listenDocs(sh.id);
      if (isMember(sh) && sh.kind === 'event' && sh.event) adoptEvent(sh);
      if (prev && isInvited(prev) && isMember(sh) && !isOwner(sh)) toast(`Vous avez rejoint « ${sh.title} »`);
      // centre de notifications : nouvelle invitation, cours reçu, modification par un autre membre
      if (window.AlixoNotify && !isOwner(sh)) {
        if (!prev && isInvited(sh) && !isMember(sh)) AlixoNotify.push({ id: 'inv_' + sh.id, kind: 'share', title: `${sh.ownerName || sh.ownerEmail || 'Un membre'} vous invite à « ${sh.title} »`, text: `${kindLabel(sh.kind)} partagé${sh.kind === 'doc' || sh.kind === 'event' ? 'e' : ''} — Bibliothèque › Partagés avec moi pour accepter.`, action: { type: 'shared' }, silent: !ready });
        else if (prev && !isMember(prev) && isMember(sh)) AlixoNotify.push({ id: 'join_' + sh.id, kind: 'share', title: `Vous avez rejoint « ${sh.title} »`, text: `Partagé par ${sh.ownerName || sh.ownerEmail || 'un membre'} · droit ${myRole(sh) === 'write' ? 'de modification' : 'de lecture'}.`, action: { type: 'shared' }, silent: true });
      }
    });
    // partages disparus de cette requête (retiré, supprimé, invitation retirée)
    for (const [sid, sh] of [...shares]) {
      if (seen.has(sid)) continue;
      const mine = source === 'owner' ? isOwner(sh) : source === 'member' ? (isMember(sh) && !isOwner(sh)) : (isInvited(sh) && !isMember(sh) && !isOwner(sh));
      if (!mine) continue;
      shares.delete(sid); stopDocs(sid);
      if (sh.kind === 'event') dropEvent(sid);
    }
    if (currentDocId && !findDoc(currentDocId)) { toast('Ce contenu n’est plus partagé avec vous'); showLibrary(); }
    refreshUI();
  }
  function refreshUI() {
    const badge = $('#share-badge');
    const n = pendingCount();
    if (badge) { badge.hidden = !n; badge.textContent = n ? String(n) : ''; badge.title = n ? `${n} invitation${n > 1 ? 's' : ''} en attente` : ''; }
    if (!currentDocId && libMode === 'shared') renderSharedHome();
    else if (!currentDocId) renderLibrary();
    renderTabs();
    if (AlixoApp.renderAccess) AlixoApp.renderAccess();
  }

  /* ---------------- présence en direct (1.15) : qui consulte / modifie quoi ---------------- */
  const PEER_COLORS = ['#3d6bb5', '#2e8b6a', '#b3762a', '#8c4351', '#7a5ca8', '#2e8b8b', '#c04343', '#5b6b8c', '#d06a3a', '#4a7856'];
  const colorFor = u => PEER_COLORS[[...String(u || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % PEER_COLORS.length];
  const presence = new Map();    // sid → Map(uid → { name, color, docId, blockId, ts })
  const unsubPres = new Map();
  const myPres = { sid: null, docId: null, blockId: null, ts: 0 };
  let presTm = null, presBeat = null;
  const PRES_TTL = 60000;
  /* partage qui contient la séance : reçu (membre) ou possédé (le propriétaire est aussi « présent ») */
  function shareForAny(docId) {
    const sh = shareOfDoc(docId); if (sh) return sh;
    for (const s of shares.values()) if (isOwner(s) && s.kind !== 'event' && includedDocIds(s).includes(docId)) return s;
    return null;
  }
  function listenPresence(sid) {
    if (unsubPres.has(sid)) return;
    const u = sharesRef.doc(sid).collection('presence').onSnapshot(snap => {
      const m = new Map();
      snap.forEach(s => { const p = s.data(); if (p && s.id !== uid) m.set(s.id, Object.assign({ uid: s.id }, p)); });
      presence.set(sid, m);
      if (AlixoApp.onPresence) AlixoApp.onPresence();
    }, () => { /* règles « presence » non publiées : silencieux */ });
    unsubPres.set(sid, u);
  }
  async function writePresence(remove) {
    const sid = myPres.sid; if (!sid) return;
    const ref = sharesRef.doc(sid).collection('presence').doc(uid);
    try {
      if (remove) await ref.delete();
      else await ref.set({ name: profile.pseudo || me.name, color: colorFor(uid), docId: myPres.docId, blockId: myPres.blockId || '', ts: now() });
    } catch { /* hors ligne ou règles non publiées */ }
  }
  /* appelée par l'application : séance affichée (ou null) et bloc en cours d'édition ; envois espacés */
  function setPresence(docId, blockId) {
    const sh = docId ? shareForAny(docId) : null;
    const sid = sh ? sh.id : null;
    if (sid !== myPres.sid) {
      if (myPres.sid) { const old = myPres.sid; myPres.sid = old; writePresence(true); }
      myPres.sid = sid; myPres.docId = docId; myPres.blockId = blockId || null;
      clearInterval(presBeat); presBeat = null;
      if (sid) { writePresence(false); presBeat = setInterval(() => writePresence(false), 25000); }
      return;
    }
    if (!sid) return;
    if (myPres.docId === docId && (myPres.blockId || null) === (blockId || null)) return;
    myPres.docId = docId; myPres.blockId = blockId || null;
    clearTimeout(presTm); presTm = setTimeout(() => writePresence(false), 900);
  }
  window.addEventListener('beforeunload', () => { if (myPres.sid) { try { sharesRef.doc(myPres.sid).collection('presence').doc(uid).delete(); } catch { /* */ } } });
  /* les autres membres présents sur une séance (ou sur le partage si docId absent) */
  function peersFor(docId) {
    const sh = docId ? shareForAny(docId) : null; if (!sh) return [];
    const m = presence.get(sh.id); if (!m) return [];
    const out = [];
    for (const p of m.values()) { if (now() - (p.ts || 0) > PRES_TTL) continue; if (docId && p.docId !== docId) continue; out.push(p); }
    return out;
  }

  /* ---------------- accès : qui voit cette séance ---------------- */
  function accessFor(docId) {
    const sh = shareForAny(docId); if (!sh) return null;
    const members = Object.entries(sh.members || {}).map(([u, m]) => ({ uid: u, name: m.name || m.email || '', email: m.email || '', role: m.role || 'read' }));
    return { sid: sh.id, kind: sh.kind, title: sh.title, isOwner: isOwner(sh), role: isOwner(sh) ? 'owner' : myRole(sh), owner: { uid: sh.owner, name: sh.ownerName || sh.ownerEmail || '', email: sh.ownerEmail || '' }, members, invites: (sh.invites || []).map(i => ({ name: i.name || i.email, email: i.email, role: i.role })), color: sh.color };
  }
  /* dossiers partagés avec moi, pour la bibliothèque (1.15) */
  function sharedFolders() {
    return [...shares.values()].filter(sh => isMember(sh) && !isOwner(sh) && sh.kind === 'folder').map(sh => {
      const map = docsBy.get(sh.id) || new Map();
      const rootId = sh.folder && sh.folder.root ? sh.folder.root.id : sh.target;
      return { sid: sh.id, title: sh.title || 'Dossier', color: sh.color || DEFAULT_TINT, icone: sh.folder && sh.folder.root ? sh.folder.root.icone : '', owner: sh.ownerName || sh.ownerEmail || '', role: myRole(sh), rootId, nDocs: map.size, nFiles: (filesBy.get(sh.id) || new Map()).size, state: docsState.get(sh.id) ? docsState.get(sh.id).st : 'ready' };
    });
  }
  function sharedDocsAlone() {
    return [...shares.values()].filter(sh => isMember(sh) && !isOwner(sh) && sh.kind === 'doc').map(sh => ({ sid: sh.id, d: (docsBy.get(sh.id) || new Map()).get(sh.target) || null, title: sh.title, color: sh.color || DEFAULT_TINT, owner: sh.ownerName || sh.ownerEmail || '', role: myRole(sh) }));
  }
  /* contenu d'un dossier partagé (sous-dossiers, séances) avec le chemin depuis la racine du partage */
  function sharedFolderView(sid, fid) {
    const sh = shares.get(sid); if (!sh || sh.kind !== 'folder') return null;
    const map = docsBy.get(sid) || new Map();
    const fs = (sh.folder && sh.folder.folders) || [];
    const rootId = sh.folder && sh.folder.root ? sh.folder.root.id : sh.target;
    const cur = fid || rootId;
    const known = new Set(fs.map(f => f.id)); known.add(rootId);
    const folders = fs.filter(f => (f.parentId || null) === cur).map(f => Object.assign({}, f, { nDocs: [...map.values()].filter(d => (d.folderId || null) === f.id).length }));
    let docs = [...map.values()].filter(d => (d.folderId || null) === cur);
    if (cur === rootId) docs = docs.concat([...map.values()].filter(d => !known.has(d.folderId || null)));   // sous-dossier retiré : à la racine
    docs.sort((a, b) => (b.pinned - a.pinned) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
    const path = []; let f = fs.find(x => x.id === cur);
    while (f) { path.unshift(f); f = fs.find(x => x.id === f.parentId); }
    const curF = cur === rootId ? { id: rootId, nom: sh.title || 'Dossier', couleur: sh.color || DEFAULT_TINT, icone: sh.folder && sh.folder.root ? sh.folder.root.icone : '' } : fs.find(x => x.id === cur);
    return { sid, sh: { title: sh.title, owner: sh.ownerName || sh.ownerEmail || '', role: myRole(sh), color: sh.color || DEFAULT_TINT }, rootId, cur: curF, path, folders, docs, files: sharedFilesIn(sid, cur), state: docsState.get(sid) ? docsState.get(sid).st : 'ready' };
  }
  function start() {
    sharesRef.where('owner', '==', uid).onSnapshot(s => applyShareSnapshot(s.docs, 'owner'), err => console.error('Share (mes partages) :', err));
    sharesRef.where('memberIds', 'array-contains', uid).onSnapshot(s => applyShareSnapshot(s.docs, 'member'), err => console.error('Share (reçus) :', err));
    if (me.email) sharesRef.where('inviteEmails', 'array-contains', me.email).onSnapshot(s => applyShareSnapshot(s.docs, 'invite'), err => console.error('Share (invitations) :', err));
  }

  /* ---------------- événements partagés (copie dans l'agenda du membre) ---------------- */
  function adoptEvent(sh) {
    const evs = state.events || (state.events = []);
    const copy = Object.assign({}, sh.event, { id: 'sh_' + sh.id, shared: sh.id, ownerName: sh.ownerName || '' });
    delete copy.folderId; delete copy.docId;
    const i = evs.findIndex(e => e.shared === sh.id);
    const j = JSON.stringify(copy);
    if (i >= 0) { if (JSON.stringify(evs[i]) === j) return; evs[i] = copy; } else evs.push(copy);
    save(); renderCalNow(); if (!$('#calpanel').hidden) renderCal(); if (!currentDocId && libMode === 'agenda') renderAgendaHome();
  }
  function dropEvent(sid) {
    const evs = state.events || [];
    const i = evs.findIndex(e => e.shared === sid);
    if (i < 0) return;
    evs.splice(i, 1); save(); renderCalNow(); if (!$('#calpanel').hidden) renderCal(); if (!currentDocId && libMode === 'agenda') renderAgendaHome();
  }

  /* ---------------- accès pour l'application ---------------- */
  function docById(id) { for (const m of docsBy.values()) { const d = m.get(id); if (d) return d; } return null; }
  function shareOfDoc(id) { for (const [sid, m] of docsBy) if (m.has(id)) return shares.get(sid); return null; }
  function sharedDocs() { const out = []; for (const [sid, m] of docsBy) { const sh = shares.get(sid); if (!sh || isOwner(sh)) continue; for (const d of m.values()) out.push(d); } return out; }
  function canWrite(id) { const sh = shareOfDoc(id); return !!sh && myRole(sh) === 'write'; }
  function infoFor(id) { const sh = shareOfDoc(id); return sh ? { sid: sh.id, title: sh.title, owner: sh.ownerName || sh.ownerEmail || '', role: myRole(sh), kind: sh.kind, color: sh.color } : null; }
  function tintFor(id) { const sh = shareOfDoc(id); return sh ? (sh.color || DEFAULT_TINT) : null; }
  function labelFor(id) { const sh = shareOfDoc(id); return sh ? (sh.kind === 'folder' ? sh.title : 'Partagé') : ''; }
  function pendingCount() { let n = 0; for (const sh of shares.values()) if (isInvited(sh) && !isMember(sh) && !isOwner(sh)) n++; return n; }
  function mySharesOf(kind, target) { return [...shares.values()].filter(sh => isOwner(sh) && sh.kind === kind && sh.target === target); }
  function noteOpened(id) { const sh = shareOfDoc(id); if (!sh || openedLogged.has(id)) return; openedLogged.add(id); log(sh.id, 'open', id, (docById(id) || {}).titre || ''); }

  /* ---------------- actions ---------------- */
  async function createShare(kind, target) {
    const sh = { owner: uid, ownerName: me.name, ownerEmail: me.email, kind, target, title: '', color: '', members: {}, memberIds: [], invites: [], inviteEmails: [], excluded: [], createdAt: now(), updatedAt: now() };
    sh.title = titleOf(sh); sh.color = colorOf(sh);
    if (kind === 'folder') sh.folder = folderSnapshot(sh);
    if (kind === 'event') sh.event = (state.events || []).find(e => e.id === target) || null;
    const ref = await sharesRef.add(sh);
    sh.id = ref.id; shares.set(sh.id, sh);
    lastMeta.set(sh.id, JSON.stringify([sh.title, sh.color, sh.folder || null, sh.event || null]));
    listenDocs(sh.id);
    schedulePush();
    return sh;
  }
  async function invite(sid, who, role) {
    const sh = shares.get(sid); if (!sh) throw new Error('Partage introuvable');
    const u = await findUser(who);
    if (!u || !u.email) throw new Error('Personne introuvable — indiquez un e-mail ou un pseudo Alixo existant');
    if (u.email === me.email) throw new Error('C’est votre propre adresse');
    if (u.uid && sh.members && sh.members[u.uid]) throw new Error(`${u.name} est déjà membre`);
    if ((sh.inviteEmails || []).includes(u.email)) throw new Error('Invitation déjà envoyée à cette adresse');
    const inv = { email: u.email, role: role === 'write' ? 'write' : 'read', name: u.name || '', by: me.name, ts: now() };
    await sharesRef.doc(sid).update({ invites: FV.arrayUnion(inv), inviteEmails: FV.arrayUnion(u.email), updatedAt: now() });
    sh.invites = [...(sh.invites || []), inv]; sh.inviteEmails = [...(sh.inviteEmails || []), u.email];
    inv.mailed = await sendMail(sh, inv).catch(() => false);   // true : parti tout seul ; false : à envoyer soi-même (boutons du gestionnaire)
    return inv;
  }
  function inviteMessage(sh, inv) {
    const link = `alixo://share/${sh.id}`;
    const subject = `${me.name} partage « ${sh.title} » avec vous sur Alixo`;
    const text = `Bonjour${inv.name ? ' ' + inv.name : ''},\n\n${me.name} (${me.email}) vous invite à consulter ${kindThe(sh.kind)} « ${sh.title} » sur Alixo${inv.role === 'write' ? ', avec le droit d’écriture' : ''}.\n\nPour accepter : ouvrez Alixo avec le compte ${inv.email}, puis Bibliothèque › Partagés avec moi › Accepter.\nLien direct (version PC) : ${link}\n\nAlixo — cockpit d’amphi`;
    const html = `<p>Bonjour${inv.name ? ' ' + esc(inv.name) : ''},</p><p><b>${esc(me.name)}</b> (${esc(me.email)}) vous invite à consulter ${kindThe(sh.kind)} <b>« ${esc(sh.title)} »</b> sur Alixo${inv.role === 'write' ? ', <b>avec le droit d’écriture</b>' : ''}.</p><p>Pour accepter : ouvrez Alixo avec le compte <b>${esc(inv.email)}</b>, puis <b>Bibliothèque › Partagés avec moi › Accepter</b>.</p><p><a href="${link}">Ouvrir dans Alixo</a> (version PC)</p><p style="color:#888">Alixo — cockpit d’amphi</p>`;
    return { subject, text, html };
  }
  /* envoi automatique : (1) webhook configuré dans firebase-config.js (Google Apps Script, voir SETUP-COMPTES.md § 3 ter),
     (2) extension Firebase « Trigger Email » (collection `mail`). Renvoie true si un service d'envoi est configuré. */
  const MAIL = window.ALIXO_MAIL || {};
  async function sendMail(sh, inv) {
    const m = inviteMessage(sh, inv);
    let sent = false;
    if (MAIL.webhook) {
      try {
        await fetch(MAIL.webhook, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: MAIL.key || '', to: inv.email, subject: m.subject, text: m.text, html: m.html, from: me.name }) });
        sent = true;
      } catch (err) { console.error('Share (e-mail, webhook) :', err); }
    }
    try { await db.collection('mail').add({ to: inv.email, message: m, createdAt: now(), share: sh.id }); if (MAIL.extension) sent = true; } catch { /* règles : sans importance */ }
    return sent;
  }
  /* envoi « à la main » : brouillon prêt dans Gmail ou dans l'application de messagerie */
  function mailLinks(sh, inv) {
    const m = inviteMessage(sh, inv);
    const q = encodeURIComponent;
    return {
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${q(inv.email)}&su=${q(m.subject)}&body=${q(m.text)}`,
      mailto: `mailto:${q(inv.email)}?subject=${q(m.subject)}&body=${q(m.text)}`,
      text: m.subject + '\n\n' + m.text
    };
  }
  function openMail(sh, inv, how) {
    const l = mailLinks(sh, inv);
    if (how === 'copy') { navigator.clipboard.writeText(l.text).then(() => toast('Message d’invitation copié'), () => toast('Copie impossible')); return; }
    const url = how === 'gmail' ? l.gmail : l.mailto;
    if (window.alixoDesktop && window.alixoDesktop.openExternal) window.alixoDesktop.openExternal(url);
    else if (how === 'gmail') window.open(url, '_blank', 'noopener');
    else location.href = url;
  }
  async function cancelInvite(sid, inv) {
    const sh = shares.get(sid); if (!sh) return;
    await sharesRef.doc(sid).update({ invites: FV.arrayRemove(inv), inviteEmails: FV.arrayRemove(inv.email), updatedAt: now() });
    sh.invites = (sh.invites || []).filter(x => x.email !== inv.email); sh.inviteEmails = (sh.inviteEmails || []).filter(x => x !== inv.email);
  }
  async function setRole(sid, memberUid, role) {
    const sh = shares.get(sid); if (!sh || !sh.members || !sh.members[memberUid]) return;
    await sharesRef.doc(sid).update({ [`members.${memberUid}.role`]: role, updatedAt: now() });
    sh.members[memberUid].role = role;
    log(sid, 'role', '', sh.members[memberUid].name || '', role);
  }
  async function removeMember(sid, memberUid) {
    const sh = shares.get(sid); if (!sh) return;
    await sharesRef.doc(sid).update({ [`members.${memberUid}`]: FV.delete(), memberIds: FV.arrayRemove(memberUid), updatedAt: now() });
    if (sh.members) delete sh.members[memberUid]; sh.memberIds = (sh.memberIds || []).filter(x => x !== memberUid);
  }
  async function setExcluded(sid, ids) {
    const sh = shares.get(sid); if (!sh) return;
    sh.excluded = ids; lastMeta.delete(sid);
    await sharesRef.doc(sid).update({ excluded: ids, folder: folderSnapshot(sh), updatedAt: now() });
    schedulePush();
  }
  async function deleteShare(sid, silent) {
    const sh = shares.get(sid); if (!sh) return;
    shares.delete(sid); stopDocs(sid);
    try {
      const docs = await sharesRef.doc(sid).collection('docs').get();
      const batch = db.batch(); docs.forEach(d => batch.delete(d.ref)); await batch.commit();
      const fls = await sharesRef.doc(sid).collection('files').get();          // fichiers partagés (1.17) : fiche + morceaux
      for (const f of fls.docs) await delSharedFile(sid, f.id).catch(() => {});
      await sharesRef.doc(sid).delete();
    } catch (err) { console.error('Share (suppression) :', err); }
    if (!silent) toast('Partage arrêté');
    refreshUI();
  }
  async function accept(sid) {
    const sh = shares.get(sid); if (!sh) return;
    const inv = (sh.invites || []).find(x => x.email === me.email);
    const role = inv ? inv.role : 'read';
    const member = { role, name: profile.pseudo || me.name, email: me.email, since: now() };
    const upd = { [`members.${uid}`]: member, memberIds: FV.arrayUnion(uid), inviteEmails: FV.arrayRemove(me.email), updatedAt: now() };
    if (inv) upd.invites = FV.arrayRemove(inv);
    await sharesRef.doc(sid).update(upd);   // résolu quand le serveur a enregistré l'adhésion
    // (les écouteurs ont pu remplacer l'objet dans `shares` entre-temps : on met à jour les deux)
    for (const x of new Set([sh, shares.get(sid)].filter(Boolean))) {
      x.members = Object.assign({}, x.members, { [uid]: member }); x.memberIds = [...new Set([...(x.memberIds || []), uid])];
      x.inviteEmails = (x.inviteEmails || []).filter(e => e !== me.email); x.invites = (x.invites || []).filter(i => i.email !== me.email);
    }
    if (!shares.has(sid)) shares.set(sid, sh);
    reloadDocs(sid);
    if (sh.kind === 'event' && sh.event) adoptEvent(sh);
    log(sid, 'accept', '', '', role);
    toast(`Vous avez rejoint « ${sh.title} »`);
    refreshUI();
  }
  async function decline(sid) {
    const sh = shares.get(sid); if (!sh) return;
    const inv = (sh.invites || []).find(x => x.email === me.email);
    const upd = { inviteEmails: FV.arrayRemove(me.email), updatedAt: now() };
    if (inv) upd.invites = FV.arrayRemove(inv);
    await sharesRef.doc(sid).update(upd);
    shares.delete(sid); refreshUI();
  }
  async function leave(sid) {
    const sh = shares.get(sid); if (!sh) return;
    await sharesRef.doc(sid).update({ [`members.${uid}`]: FV.delete(), memberIds: FV.arrayRemove(uid), updatedAt: now() });
    log(sid, 'leave', '', '');
    shares.delete(sid); stopDocs(sid); if (sh.kind === 'event') dropEvent(sid);
    openTabs = openTabs.filter(id => findDoc(id));
    if (currentDocId && !findDoc(currentDocId)) showLibrary(); else refreshUI();
    toast(`Vous avez quitté « ${sh.title} »`);
  }
  function leaveEvent(sid) { leave(sid); }
  /* l'événement partagé vient d'être supprimé de mon agenda (propriétaire) → le partage s'arrête */
  function eventDeleted(evId) { for (const sh of mySharesOf('event', evId)) deleteShare(sh.id, true); }
  async function copyToLibrary(id) {
    const d = docById(id); if (!d) return;
    const copy = JSON.parse(JSON.stringify(d));
    copy.id = uid_(); copy.titre = (d.titre || 'Sans titre') + ' (copie)'; copy.folderId = null; copy.createdAt = copy.updatedAt = now(); copy.pinned = false;
    (copy.blocks || []).forEach(b => { b.id = uid_(); });
    state.docs.push(copy); save(); toast('Copie ajoutée à « Mes cours »');
  }
  const uid_ = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /* ---------------- interface : bibliothèque « Partagés avec moi » ---------------- */
  const SH_ICO = '<svg viewBox="0 0 24 24" class="dicon"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/></svg>';
  /* où en est la réception d'un partage (texte court pour une carte, bloc avec « Réessayer » pour un dossier) */
  function stateText(sh) {
    const st = docsState.get(sh.id) || {};
    return st.st === 'error' ? 'Chargement impossible — cliquez pour réessayer' : st.st === 'ready' ? 'En attente : le propriétaire doit ouvrir Alixo pour envoyer la séance' : 'Chargement…';
  }
  function stateHint(sh, emptyMsg) {
    const st = docsState.get(sh.id) || {};
    if (st.st === 'error') return `<div class="po-hint sh-err">Impossible de charger ce partage : ${esc(st.msg)} <button class="cta ghost small" data-sh="reload" data-sid="${sh.id}" type="button">Réessayer</button></div>`;
    if (st.st !== 'ready') return '<div class="po-hint">Chargement des séances…</div>';
    return `<div class="po-hint">${emptyMsg}</div>`;
  }
  function renderSharedHome() {
    const root = $('#lib-shared'); if (!root) return;
    const invites = [...shares.values()].filter(sh => isInvited(sh) && !isMember(sh) && !isOwner(sh));
    const received = [...shares.values()].filter(sh => isMember(sh) && !isOwner(sh));
    const mine = [...shares.values()].filter(isOwner);
    let html = '';
    if (invites.length) html += `<div class="sh-section"><div class="sh-stitle">Invitations</div>${invites.map(sh => `<div class="sh-invite"><div class="sh-ico">${esc(initial(sh.ownerName || sh.ownerEmail))}</div><div class="sh-txt"><b>${esc(sh.ownerName || sh.ownerEmail || 'Un membre')} partage ${kindThe(sh.kind)} « ${esc(sh.title || '')} »</b><span>${((sh.invites || []).find(x => x.email === me.email) || {}).role === 'write' ? 'Lecture et écriture' : 'Lecture seule'} · ${esc(sh.ownerEmail || '')}</span></div><button class="cta small" data-sh="accept" data-sid="${sh.id}">Accepter</button><button class="cta ghost small" data-sh="decline" data-sid="${sh.id}">Refuser</button></div>`).join('')}</div>`;
    html += `<div class="sh-section"><div class="sh-stitle">Partagés avec moi</div>`;
    if (!received.length) html += `<div class="sh-empty">Personne ne partage encore de cours avec vous.<br>Les cours, dossiers et événements que d’autres membres d’Alixo vous partagent apparaîtront ici (invitation par e-mail ou par pseudo).${profile.pseudo ? `<br><br>Votre pseudo : <b>${esc(profile.pseudo)}</b>` : '<br><br>Choisissez un pseudo dans Paramètres › Compte pour être invité plus facilement.'}</div>`;
    else {
      const evs = received.filter(sh => sh.kind === 'event');
      const folders = received.filter(sh => sh.kind === 'folder');
      const docs = received.filter(sh => sh.kind === 'doc');
      for (const sh of folders) {
        const map = docsBy.get(sh.id) || new Map();
        const fs = (sh.folder && sh.folder.folders) || [];
        const rootId = sh.folder && sh.folder.root ? sh.folder.root.id : sh.target;
        const known = new Set(fs.map(f => f.id)); known.add(rootId);
        const docBtn = d => `<button data-shdoc="${d.id}">${SH_ICO}${esc(d.titre || 'Sans titre')}</button>`;
        const fileBtn = f => `<button data-shfile="${f.id}" data-sid="${sh.id}" title="${esc(f.name)}">${window.AlixoFiles ? AlixoFiles.iconHTML(f.name) : SH_ICO}${esc(f.name)}</button>`;
        const fileMap = filesBy.get(sh.id) || new Map();
        const filesIn = fid => [...fileMap.values()].filter(f => (f.folderId || null) === fid).map(fileBtn).join('');
        const docsIn = fid => [...map.values()].filter(d => (d.folderId || null) === fid).map(docBtn).join('');
        const orphans = [...map.values()].filter(d => !known.has(d.folderId || null)).map(docBtn).join('');   // sous-dossier retiré : à la racine
        const render = pid => fs.filter(f => (f.parentId || null) === pid).map(f => `<button class="sh-sf" data-shf="${f.id}" style="--mc:${esc(f.couleur || sh.color || DEFAULT_TINT)}">${f.icone ? AlixoIcons.svg(f.icone, 'ficon-ico') : FOLDER_ICON}${esc(f.nom)}</button><div style="margin-left:18px">${render(f.id)}${docsIn(f.id)}${filesIn(f.id)}</div>`).join('');
        const orphanFiles = [...fileMap.values()].filter(f => !known.has(f.folderId || null)).map(fileBtn).join('');
        const sub = render(rootId), rootLeaves = docsIn(rootId) + orphans + filesIn(rootId) + orphanFiles;
        html += `<div class="sh-folder" style="--mc:${esc(sh.color || DEFAULT_TINT)}"><div class="sh-fhead">${sh.folder && sh.folder.root && sh.folder.root.icone ? AlixoIcons.svg(sh.folder.root.icone, 'ficon-ico') : FOLDER_ICON}<span>${esc(sh.title || 'Dossier')}</span><span class="sh-role ${myRole(sh)}">${myRole(sh) === 'write' ? 'écriture' : 'lecture'}</span><span class="sh-sub">par ${esc(sh.ownerName || sh.ownerEmail || '')} · ${map.size} séance${map.size > 1 ? 's' : ''}${fileMap.size ? ` · ${fileMap.size} fichier${fileMap.size > 1 ? 's' : ''}` : ''}</span><button class="cta ghost small" data-sh="leave" data-sid="${sh.id}" title="Ne plus recevoir ce partage">Quitter</button></div><div class="sh-tree">${sub}${rootLeaves}${!map.size && !fileMap.size ? stateHint(sh, 'Aucune séance ni fichier pour l’instant.') : ''}</div></div>`;
      }
      if (docs.length) html += `<div class="sh-grid">${docs.map(sh => { const d = (docsBy.get(sh.id) || new Map()).get(sh.target); const first = d && (d.blocks || []).find(b => ['p', 'callout', 'quote', 'li'].includes(b.type)); const isSl = d && d.kind === 'slides', isBd = d && d.kind === 'board', nBd = isBd ? (d.items || []).filter(it => it.t !== 'arrow').length : 0; return `<button class="sh-card" data-shdoc="${sh.target}" data-sid="${sh.id}" style="--mc:${esc(sh.color || DEFAULT_TINT)}"><h3>${isSl ? SLIDES_ICON : isBd ? BOARD_ICON : ''}${esc((d && d.titre) || sh.title || 'Sans titre')}</h3><div class="preview" style="font-size:12.5px;color:var(--ink-2)">${isSl ? `Présentation · ${(d.slides || []).length} diapositive${(d.slides || []).length > 1 ? 's' : ''}` : isBd ? `Planche · ${nBd} élément${nBd > 1 ? 's' : ''}` : esc(first ? stripTags(first.text).slice(0, 140) : (d ? '' : stateText(sh)))}</div><div class="meta"><span class="sh-role ${myRole(sh)}">${myRole(sh) === 'write' ? 'écriture' : 'lecture'}</span><span>par ${esc(sh.ownerName || sh.ownerEmail || '')}</span>${d ? `<span>${fmtDate(d.updatedAt || now())}</span>` : ''}</div></button>`; }).join('')}</div>`;
      const fls = received.filter(sh => sh.kind === 'file');
      if (fls.length) html += `<div class="sh-stitle" style="margin-top:14px">Fichiers partagés</div><div class="sh-grid">${fls.map(sh => {
        const f = (filesBy.get(sh.id) || new Map()).get(sh.target);
        const name = (f && f.name) || sh.title || 'Fichier';
        return `<button class="sh-card sh-filecard" data-shfile="${sh.target}" data-sid="${sh.id}" style="--mc:${esc(sh.color || DEFAULT_TINT)}"><h3>${window.AlixoFiles ? AlixoFiles.iconHTML(name) : SH_ICO}${esc(name)}</h3><div class="preview" style="font-size:12.5px;color:var(--ink-2)">${f && window.AlixoFiles ? esc(AlixoFiles.fmtSize(f.size)) : esc(stateText(sh))}</div><div class="meta"><span class="sh-role ${myRole(sh)}">lecture</span><span>par ${esc(sh.ownerName || sh.ownerEmail || '')}</span></div></button>`;
      }).join('')}</div>`;
      if (evs.length) html += `<div class="sh-stitle" style="margin-top:14px">Événements partagés</div>${evs.map(sh => `<div class="sh-member"><div class="sh-av">${esc(initial(sh.ownerName || sh.ownerEmail))}</div><div class="sh-mi"><b>${esc(sh.title || 'Événement')}</b><span>${sh.event ? esc(sh.event.date + ' · ' + sh.event.start + '–' + sh.event.end + (sh.event.lieu ? ' · ' + sh.event.lieu : '')) : ''} — par ${esc(sh.ownerName || '')}</span></div><button class="cta ghost small" data-sh="leave" data-sid="${sh.id}">Retirer</button></div>`).join('')}`;
    }
    html += `</div>`;
    html += `<div class="sh-section"><div class="sh-stitle">Mes partages <span class="po-hint" style="margin:0; text-transform:none; letter-spacing:0; font-weight:400">— clic droit sur une séance ou un dossier › Partager…</span></div>`;
    if (!mine.length) html += `<div class="po-hint" style="padding:0 4px">Vous ne partagez rien pour l’instant.</div>`;
    else html += mine.map(sh => { const nM = (sh.memberIds || []).length, nI = (sh.invites || []).length; return `<div class="sh-member"><div class="sh-av" style="background:${esc(sh.color || DEFAULT_TINT)}">${sh.kind === 'doc' ? '📄' : sh.kind === 'folder' ? '📁' : sh.kind === 'file' ? '📎' : '📅'}</div><div class="sh-mi"><b>${esc(sh.title || '')}</b><span>${kindLabel(sh.kind)} · ${nM} membre${nM > 1 ? 's' : ''}${nI ? ` · ${nI} invitation${nI > 1 ? 's' : ''} en attente` : ''}</span></div><button class="cta ghost small" data-sh="manage" data-sid="${sh.id}">Gérer…</button></div>`; }).join('');
    html += `</div>`;
    root.innerHTML = html;
  }
  $('#lib-shared').addEventListener('click', async e => {
    const act = e.target.closest('[data-sh]');
    if (act) {
      const sid = act.dataset.sid, k = act.dataset.sh;
      try {
        if (k === 'accept') await accept(sid);
        else if (k === 'decline') await decline(sid);
        else if (k === 'leave') { if (await confirmDialog({ title: 'Quitter ce partage ?', text: 'Vous n’y aurez plus accès ; le propriétaire pourra vous réinviter.', ok: 'Quitter' })) await leave(sid); }
        else if (k === 'manage') openShareManager(sid);
        else if (k === 'reload') { reloadDocs(sid); toast('Nouvel essai…'); }
      } catch (err) { console.error(err); toast('Action impossible : ' + friendly(err), { duration: 7000 }); }
      renderSharedHome();
      return;
    }
    const fbtn = e.target.closest('[data-shfile]');
    if (fbtn) { openSharedFile(fbtn.dataset.sid, fbtn.dataset.shfile); return; }
    const dbtn = e.target.closest('[data-shdoc]');
    if (dbtn) {
      if (docById(dbtn.dataset.shdoc)) { openDoc(dbtn.dataset.shdoc); return; }
      // pas encore reçue : on relance la réception, et on ouvre dès qu'elle arrive
      const sid = dbtn.dataset.sid, id = dbtn.dataset.shdoc;
      const st = sid ? (docsState.get(sid) || {}) : {};
      if (sid && st.st !== 'ready') reloadDocs(sid);
      toast(st.st === 'ready' ? 'Cette séance n’a pas encore été envoyée par son propriétaire (il doit ouvrir Alixo, connecté)' : 'Chargement de la séance…', { duration: 5000 });
      let n = 0; const tm = setInterval(() => { n++; if (docById(id)) { clearInterval(tm); if (!currentDocId && libMode === 'shared') openDoc(id); } else if (n > 20) clearInterval(tm); }, 500);
    }
  });
  $('#lib-shared').addEventListener('contextmenu', e => {
    const fbtn = e.target.closest('[data-shfile]');
    if (fbtn) { e.preventDefault(); if (window.AlixoFiles) AlixoFiles.openSharedMenu(e.clientX, e.clientY, fbtn.dataset.sid, fbtn.dataset.shfile); return; }
    const dbtn = e.target.closest('[data-shdoc]'); if (!dbtn) return;
    e.preventDefault();
    const id = dbtn.dataset.shdoc; const d = docById(id); if (!d) return;
    const menu = $('#ctxmenu');
    menu.innerHTML = `<div class="cm-title">${esc(d.titre || 'Sans titre')}</div><button data-shcm="open">${CM_ICO.open}Ouvrir</button><button data-shcm="copy">${CM_ICO.dup}Copier dans mes cours</button>`;
    menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = ''; menu.dataset.shdoc = id;
    placeCtxMenu(menu, e.clientX, e.clientY);
  });
  $('#ctxmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-shcm]'); if (!b) return;
    const id = $('#ctxmenu').dataset.shdoc; $('#ctxmenu').dataset.shdoc = ''; closeCtxMenu();
    if (b.dataset.shcm === 'open') openDoc(id); else copyToLibrary(id);
  });

  /* fichier partagé : ouverture dans la visionneuse d'Alixo (js/files.js) */
  function openSharedFile(sid, id) {
    const f = sharedFileById(sid, id);
    if (!f) { toast('Ce fichier n’a pas encore été envoyé par son propriétaire (il doit ouvrir Alixo, connecté)', { duration: 6000 }); return; }
    if (!window.AlixoFiles) { toast('Module de fichiers indisponible'); return; }
    AlixoFiles.openShared(f);
    const sh = shares.get(sid); if (sh) log(sid, 'open', id, f.name);
  }

  /* ---------------- interface : partager (propriétaire) ----------------
     1.16 : grandes fenêtres centrales (même présentation que les Paramètres) à la place des pop-overs */
  const SH_NAV_ICO = {
    members: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 20h6a5 5 0 0 0-3.5-4.8"/></svg>',
    content: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
    log: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>'
  };
  const roleHelpHTML = `<div class="sh-roles"><div><b>Lecture</b><span>Consulte les séances, les présente (F5), ouvre et enregistre les fichiers, copie le tout dans sa bibliothèque.</span></div><div><b>Écriture</b><span>Modifie les séances en direct ; ses modifications sont notées dans le journal. Les fichiers restent en lecture.</span></div></div>`;
  async function openShareFor(kind, target) {
    const existing = mySharesOf(kind, target)[0];
    if (existing) { openShareManager(existing.id); return; }
    const name = kind === 'doc' ? ((state.docs.find(d => d.id === target) || {}).titre || 'Sans titre')
      : kind === 'folder' ? (folder(target) || {}).nom
      : kind === 'file' ? ((sharedFileSource(target) || {}).name || 'Fichier')
      : ((state.events || []).find(e => e.id === target) || {}).title;
    const what = kind === 'doc' ? 'cette séance'
      : kind === 'folder' ? 'ce dossier (séances, sous-dossiers et fichiers de moins de 20 Mo)'
      : kind === 'file' ? 'ce fichier (il s’ouvre dans leur Alixo, comme chez vous)'
      : 'cet événement (il apparaît dans l’agenda des membres)';
    openDialog({
      id: 'shareov', cls: 'share-dlg', eyebrow: 'Alixo Share',
      title: `Partager « ${esc(name || '')} »`,
      sub: `Invitez un membre d’Alixo à ${what}. L’invitation apparaît dans son Alixo (Bibliothèque › Partagés avec moi).`,
      body: `<div class="sh-dlg2">
        <div class="sh-dlg-main">
          <div class="po-label" style="margin-top:0">Inviter quelqu’un</div>
          <div class="sh-inv"><input id="sh-who" placeholder="e-mail ou pseudo Alixo" autocomplete="off" spellcheck="false"><select id="sh-role"><option value="read">Lecture</option><option value="write">Écriture</option></select></div>
          <div class="ai-keymsg" id="sh-msg"></div>
          <div class="po-hint">Par <b>e-mail</b> (celui de son compte Alixo) ou par son <b>pseudo</b> (Paramètres › Compte). Si la personne n’a pas encore de compte, l’invitation l’attend à sa première connexion ; vous pourrez aussi lui envoyer l’e-mail d’invitation en un clic.</div>
        </div>
        <aside class="sh-dlg-side">
          <div class="sh-how"><b>Comment ça marche</b><ol><li>Vous invitez par e-mail ou pseudo.</li><li>La personne accepte dans « Partagés avec moi ».</li><li>Elle voit vos modifications en direct ; vous gérez les droits et le contenu à tout moment.</li></ol></div>
          ${roleHelpHTML}
        </aside></div>`,
      foot: `<button class="cta ghost" type="button" data-dlg-close>Annuler</button><button class="cta" id="sh-ok" type="button">Inviter</button>`,
      onMount: (card, close) => {
        const who = card.querySelector('#sh-who'), msg = card.querySelector('#sh-msg');
        const ok = async () => {
          const w = who.value.trim(); if (!w) { who.focus(); return; }
          msg.textContent = 'Envoi…'; msg.className = 'ai-keymsg';
          card.querySelector('#sh-ok').disabled = true;
          try {
            const sh = await createShare(kind, target);
            const inv = await invite(sh.id, w, card.querySelector('#sh-role').value);
            close();
            openShareManager(sh.id);
            afterInvite(sh, inv);
          } catch (err) { console.error('Share :', err); msg.textContent = friendly(err); msg.className = 'ai-keymsg err'; card.querySelector('#sh-ok').disabled = false; }
        };
        card.querySelector('#sh-ok').addEventListener('click', ok);
        who.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        setTimeout(() => who.focus(), 60);
      }
    });
  }
  /* l'invitation est enregistrée : si aucun envoi automatique n'est configuré, on propose le brouillon d'e-mail */
  function afterInvite(sh, inv) {
    const who = inv.name || inv.email;
    if (inv.mailed) { toast(`Invitation et e-mail envoyés à ${who}`); return; }
    toast(`Invitation enregistrée pour ${who} — elle la voit dans son Alixo. La prévenir par e-mail ?`, { duration: 12000, action: 'Écrire l’e-mail', onAction: () => openMail(shares.get(sh.id) || sh, inv, 'gmail') });
  }
  /* gestionnaire de partage : fenêtre à onglets Membres / Contenu / Journal ; réutilisée (pas recréée)
     tant qu'elle est ouverte sur le même partage, pour que la liste se rafraîchisse sans clignoter */
  function shareTabHTML(sh, tab) {
    const sid = sh.id;
    const members = Object.entries(sh.members || {});
    const invites = sh.invites || [];
    if (tab === 'members') {
      return `<div class="po-label" style="margin-top:0">Membres${members.length ? ` <span class="dlg-chip">${members.length}</span>` : ''}</div>
        <div class="sh-members">${members.map(([u, m]) => `<div class="sh-member"><div class="sh-av">${esc(initial(m.name || m.email))}</div><div class="sh-mi"><b>${esc(m.name || m.email)}</b><span>${esc(m.email || '')}</span></div><select data-role="${u}"><option value="read" ${m.role !== 'write' ? 'selected' : ''}>Lecture</option><option value="write" ${m.role === 'write' ? 'selected' : ''}>Écriture</option></select><button class="sh-rm" data-rm="${u}" title="Retirer l’accès">✕</button></div>`).join('')}
        ${invites.map(inv => `<div class="sh-member pending"><div class="sh-av" style="opacity:.5">${esc(initial(inv.name || inv.email))}</div><div class="sh-mi"><b>${esc(inv.name || inv.email)}</b><span>Invitation en attente · ${inv.role === 'write' ? 'écriture' : 'lecture'} · ${esc(inv.email)}</span></div><button class="sh-mailbtn" data-mail="gmail" data-to="${esc(inv.email)}" title="Ouvrir un brouillon Gmail prêt à envoyer">Gmail</button><button class="sh-mailbtn" data-mail="mailto" data-to="${esc(inv.email)}" title="Ouvrir un brouillon dans l’application de messagerie de l’ordinateur">E-mail</button><button class="sh-rm" data-cancel="${esc(inv.email)}" title="Annuler l’invitation">✕</button></div>`).join('')}
        ${invites.length ? `<div class="po-hint" style="margin-top:4px">${MAIL.webhook || MAIL.extension ? 'L’e-mail d’invitation part automatiquement.' : 'L’invitation apparaît déjà dans l’Alixo de la personne (Bibliothèque › Partagés avec moi).'} Pour la prévenir vous-même : <b>Gmail</b> ou <b>E-mail</b> ouvre un message prêt à envoyer.</div>` : ''}
        ${!members.length && !invites.length ? '<div class="po-hint">Personne pour l’instant : invitez quelqu’un ci-dessous.</div>' : ''}</div>
        <div class="po-label">Inviter</div>
        <div class="sh-inv"><input id="sh-who" placeholder="e-mail ou pseudo Alixo" autocomplete="off" spellcheck="false"><select id="sh-role"><option value="read">Lecture</option><option value="write">Écriture</option></select><button class="pobtn" id="sh-add" type="button">Inviter</button></div>
        <div class="ai-keymsg${pushErr.get(sid) ? ' err' : ''}" id="sh-msg">${pushErr.get(sid) ? 'Envoi des séances impossible : ' + esc(pushErr.get(sid)) : ''}</div>
        <div class="sh-link">Lien d’invitation (version PC) : <code>alixo://share/${sh.id}</code> <button class="cta ghost small" id="sh-copy" type="button">Copier le message d’invitation</button></div>`;
    }
    if (tab === 'content') {
      if (sh.kind !== 'folder') return `<div class="po-label" style="margin-top:0">Contenu</div><div class="po-hint">Ce partage porte sur ${sh.kind === 'doc' ? 'une seule séance' : sh.kind === 'file' ? 'un seul fichier' : 'un événement'} : rien à choisir ici.</div>`;
      const excluded = new Set(sh.excluded || []);
      const rows = [];
      const walk = (fid, depth) => {
        for (const c of childFolders(fid)) { rows.push({ id: c.id, name: c.nom, depth, kind: 'f' }); if (!excluded.has(c.id)) walk(c.id, depth + 1); else rows.push({ id: c.id + ':hidden', depth: depth + 1, name: 'contenu masqué', kind: 'x' }); }
        for (const d of folderDocs(fid)) rows.push({ id: d.id, name: d.titre || 'Sans titre', depth, kind: 'd' });
        if (window.AlixoFiles) for (const f of AlixoFiles.inFolder(fid)) rows.push({ id: f.id, name: f.name, depth, kind: 'fl', big: (f.size || 0) > FILE_MAX, size: f.size || 0 });
      };
      walk(sh.target, 0);
      return `<div class="po-label" style="margin-top:0">Contenu partagé</div>
        <div class="po-hint" style="margin:0 0 8px">Décochez une séance, un fichier ou un sous-dossier pour le retirer du partage (il reste dans votre bibliothèque). Les nouveautés du dossier sont partagées automatiquement ; les fichiers de plus de 20 Mo ne le sont jamais.</div>
        <div class="sh-content">${rows.map(r => {
          if (r.kind === 'x') return `<div class="po-hint" style="margin:0; padding-left:${14 + r.depth * 16}px">(${esc(r.name)})</div>`;
          const ico = r.kind === 'f' ? FOLDER_ICON : r.kind === 'fl' ? (window.AlixoFiles ? AlixoFiles.iconHTML(r.name) : SH_ICO) : SH_ICO;
          if (r.kind === 'fl' && r.big) return `<label class="excl" style="padding-left:${6 + r.depth * 16}px" title="Plus de 20 Mo : non partagé"><input type="checkbox" disabled>${ico}${esc(r.name)} <span class="po-hint" style="margin:0">— plus de 20 Mo</span></label>`;
          return `<label class="${r.kind === 'f' ? 'sf' : ''} ${excluded.has(r.id) ? 'excl' : ''}" style="padding-left:${6 + r.depth * 16}px"><input type="checkbox" data-inc="${r.id}" ${excluded.has(r.id) ? '' : 'checked'}>${ico}${esc(r.name)}${r.kind === 'fl' && window.AlixoFiles ? ` <span class="po-hint" style="margin:0">${esc(AlixoFiles.fmtSize(r.size))}</span>` : ''}</label>`;
        }).join('') || '<div class="po-hint">Dossier vide.</div>'}</div>`;
    }
    return `<div class="po-label" style="margin-top:0">Journal</div><div class="sh-log" id="sh-log"><div class="po-hint">Chargement du journal…</div></div>`;
  }
  async function openShareManager(sid, tab = 'members') {
    const sh = shares.get(sid); if (!sh) return;
    let ov = $('#shareov');
    const fresh = !(ov && ov.dataset.mode === 'manage' && ov.dataset.sid === sid);
    if (fresh) {
      ov = openDialog({
        id: 'shareov', cls: 'share-dlg wide', eyebrow: 'Alixo Share',
        title: `${esc(sh.title || '')}<span class="dlg-chip">${kindLabel(sh.kind)}</span>`,
        sub: 'Membres et invitations, contenu partagé, journal des consultations et des modifications.',
        nav: `<div class="set-navtitle">Partage</div>${['members', 'content', 'log'].map(t => `<button type="button" class="set-navbtn" data-tab="${t}">${SH_NAV_ICO[t]}<span>${{ members: 'Membres', content: 'Contenu', log: 'Journal' }[t]}</span></button>`).join('')}`,
        body: '',
        foot: `<button class="cta ghost ev-danger" id="sh-stop" type="button">Arrêter le partage</button><span class="dlg-spacer"></span><button class="cta" type="button" data-dlg-close>Fermer</button>`,
        onMount: (card, close) => {
          const cur = () => shares.get(sid) || sh;
          const msgEl = () => card.querySelector('#sh-msg');
          const err = e => { console.error('Share :', e); const msg = msgEl(); if (msg) { msg.textContent = friendly(e); msg.className = 'ai-keymsg err'; } else toast(friendly(e), { duration: 7000 }); };
          card.querySelector('.dlg-nav').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) openShareManager(sid, t.dataset.tab); });
          card.querySelector('#sh-stop').addEventListener('click', async () => {
            if (await confirmDialog({ title: `Arrêter le partage de « ${cur().title} » ?`, text: 'Les membres n’y auront plus accès. Vos cours restent intacts.', ok: 'Arrêter' })) { close(); await deleteShare(sid); if (!currentDocId) renderLibrary(); }
          });
          card.addEventListener('change', async e => {
            const r = e.target.closest('[data-role]'); if (r) { try { await setRole(sid, r.dataset.role, r.value); toast('Droits mis à jour'); } catch (x) { err(x); } return; }
            const inc = e.target.closest('[data-inc]');
            if (inc) { const ex = new Set(cur().excluded || []); if (inc.checked) ex.delete(inc.dataset.inc); else ex.add(inc.dataset.inc); try { await setExcluded(sid, [...ex]); openShareManager(sid, 'content'); } catch (x) { err(x); } }
          });
          card.addEventListener('click', async e => {
            const rm = e.target.closest('[data-rm]'); if (rm) { try { await removeMember(sid, rm.dataset.rm); toast('Accès retiré'); openShareManager(sid); } catch (x) { err(x); } return; }
            const ca = e.target.closest('[data-cancel]'); if (ca) { const inv = (cur().invites || []).find(x => x.email === ca.dataset.cancel); if (inv) { try { await cancelInvite(sid, inv); openShareManager(sid); } catch (x) { err(x); } } return; }
            const mb = e.target.closest('[data-mail]');
            if (mb) { const inv = (cur().invites || []).find(x => x.email === mb.dataset.to); if (inv) openMail(cur(), inv, mb.dataset.mail); return; }
            if (e.target.closest('#sh-copy')) { const m = inviteMessage(cur(), { email: '', name: '', role: 'read' }); try { await navigator.clipboard.writeText(m.subject + '\n\n' + m.text); toast('Message d’invitation copié'); } catch { toast('Copie impossible'); } return; }
            if (e.target.closest('#sh-add')) {
              const who = card.querySelector('#sh-who'); const w = who ? who.value.trim() : ''; if (!w) { if (who) who.focus(); return; }
              const msg = msgEl(); if (msg) { msg.textContent = 'Envoi…'; msg.className = 'ai-keymsg'; }
              try { const inv = await invite(sid, w, card.querySelector('#sh-role').value); openShareManager(sid); afterInvite(cur(), inv); } catch (x) { err(x); }
            }
          });
          card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'sh-who') { e.preventDefault(); const b = card.querySelector('#sh-add'); if (b) b.click(); } });
        }
      });
      ov.dataset.mode = 'manage'; ov.dataset.sid = sid;
    }
    ov.dataset.tab = tab;
    ov.querySelectorAll('.dlg-nav .set-navbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    ov.querySelector('.set-htitle').innerHTML = `${esc(sh.title || '')}<span class="dlg-chip">${kindLabel(sh.kind)}</span>`;
    const body = ov.querySelector('.dlg-body');
    const keepScroll = !fresh && ov.dataset.lastTab === tab ? body.scrollTop : 0;
    body.innerHTML = shareTabHTML(sh, tab);
    body.scrollTop = keepScroll;
    ov.dataset.lastTab = tab;
    if (tab === 'log') {
      sharesRef.doc(sid).collection('log').orderBy('ts', 'desc').limit(80).get().then(q => {
        const box = ov.querySelector('#sh-log'); if (!box) return;
        const A = { accept: 'a rejoint le partage', edit: 'a modifié', open: 'a consulté', leave: 'a quitté le partage', role: 'droits modifiés', file: 'a partagé le fichier' };
        const rows = []; q.forEach(s => rows.push(s.data()));
        box.innerHTML = rows.length ? rows.map(r => `<div><span class="sh-lt">${esc(fmtWhen(r.ts))}</span><span><b>${esc(r.name || '')}</b> ${esc(A[r.action] || r.action)}${r.title ? ` « ${esc(r.title)} »` : ''}${r.detail ? ` (${esc(r.detail)})` : ''}</span></div>`).join('') : '<div class="po-hint">Aucune activité pour l’instant : les consultations et modifications des membres apparaîtront ici.</div>';
      }).catch(e => { const box = ov.querySelector('#sh-log'); if (box) box.innerHTML = `<div class="po-hint">Journal indisponible : ${esc(e.message || e)}</div>`; });
    }
    if (fresh && tab === 'members') setTimeout(() => { const w = ov.querySelector('#sh-who'); if (w && !(sh.members && Object.keys(sh.members).length)) w.focus(); }, 80);
  }
  /* séance reçue : informations et sortie */
  function openInfo(id) {
    const sh = shareOfDoc(id); if (!sh) return;
    const write = myRole(sh) === 'write';
    openDialog({
      id: 'shareov', cls: 'share-dlg narrow', eyebrow: 'Alixo Share',
      title: `${sh.kind === 'folder' ? 'Dossier partagé' : 'Séance partagée'}<span class="dlg-chip">${write ? 'lecture et écriture' : 'lecture seule'}</span>`,
      sub: sh.kind === 'folder' ? `Dossier « ${esc(sh.title)} » partagé avec vous.` : 'Séance partagée avec vous.',
      body: `<div class="sh-ownercard"><div class="po-avatar">${esc(initial(sh.ownerName || sh.ownerEmail))}</div><div class="po-accinfo"><div class="po-accname">${esc(sh.ownerName || '')}</div><div class="po-accmail">${esc(sh.ownerEmail || '')}</div><div class="po-accsync">Propriétaire du partage</div></div></div>
        <div class="po-hint">${write ? 'Vos modifications sont envoyées au propriétaire en direct et notées dans son journal.' : 'Vous consultez la dernière version du propriétaire ; il peut vous donner le droit d’écriture.'} « Copier dans mes cours » en fait une copie indépendante dans votre bibliothèque.</div>`,
      foot: `<button class="cta ghost ev-danger" id="sh-leave" type="button">Quitter le partage</button><span class="dlg-spacer"></span><button class="cta ghost" id="sh-copy2" type="button">Copier dans mes cours</button><button class="cta" type="button" data-dlg-close>Fermer</button>`,
      onMount: (card, close) => {
        card.querySelector('#sh-copy2').addEventListener('click', () => { close(); copyToLibrary(id); });
        card.querySelector('#sh-leave').addEventListener('click', async () => { if (await confirmDialog({ title: 'Quitter ce partage ?', text: 'Vous n’y aurez plus accès ; le propriétaire pourra vous réinviter.', ok: 'Quitter' })) { close(); leave(sh.id); } });
      }
    });
  }

  /* ---------------- lien profond alixo://share/{sid} ---------------- */
  function handleDeepLink(url) {
    const m = String(url || '').match(/share\/([A-Za-z0-9_-]+)/);
    if (!m) return;
    openSharedHome();
    toast(shares.has(m[1]) ? 'Invitation ouverte' : 'Ouvrez « Partagés avec moi » : l’invitation apparaît dès qu’elle est reçue');
  }
  if (window.alixoDesktop && window.alixoDesktop.onDeepLink) window.alixoDesktop.onDeepLink(handleDeepLink);
  if (/#share=/.test(location.hash)) setTimeout(() => handleDeepLink(location.hash.replace('#share=', 'share/')), 600);

  /* ---------------- démarrage ---------------- */
  (async () => {
    await loadProfile();
    if (!profile.pseudo) saveProfile();
    ready = true;
    start();
    setTimeout(push, 2500);
  })();

  return { enabled: true, docById, sharedDocs, canWrite, infoFor, tintFor, labelFor, onLocalSave: schedulePush, invites: () => [...shares.values()].filter(sh => isInvited(sh) && !isMember(sh)), pendingCount, renderSharedHome, openShareFor, openShareManager, openInfo, setPseudo, pseudo: () => profile.pseudo, noteOpened, leaveEvent, mySharesOf, copyToLibrary, fetchImage, eventDeleted, accessFor, sharedFolders, sharedDocsAlone, sharedFolderView, setPresence, peersFor, colorFor, me: () => me,
    sharedFilesIn, sharedFileById, shareMeta, fetchFile, openSharedFile };
})();
