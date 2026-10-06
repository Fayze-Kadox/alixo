/* ============================================================
   Alixo — panneau d'administration (page statique)
   Firestore :
   - admins/{uid}            → { email, addedAt, addedBy }           (qui peut entrer ici)
   - profiles/{uid}          → écrit par l'application : email, name, pseudo, lastSeen, version, platform, nDocs,
                                specialites, storage (tailles, 1.26), ageGroup (1.26), plusConsent (1.26) ; + disabled, disabledReason (posés ici).
                                Lisible par le titulaire et les administrateurs seulement (1.26).
   - audit/{id}              → 1.26 : journal des actions d'administration { ts, by, byEmail, action, target, details } — écrit par
                                l'administrateur qui agit, jamais modifié ni effacé ; le contenu des cours (users/{uid}/**) n'est
                                plus lisible depuis le panneau
   - config/aikeys           → { keys: [{ id, key, label, enabled, addedAt }] }  (réservoir, admins seulement)
   - keys/{uid}              → { grok, keyId, note, force, assignedAt }  (lisible par l'utilisateur seul ; 1.27 : `grok` remplace `gemini`)
   - config/public           → { announcements: [{ id, title, text, url, audience, ts, until, silent }],
                                 latestVersion, latestNote, downloadUrl, minVersion (1.18 : en dessous, l'application se bloque
                                 jusqu'à la mise à jour) }  (lisible par tout compte connecté)
   - inbox/{uid}/msgs/{id}   → { title, text, url, ts, by, popup, deliveredAt, deliveredOn, readAt }  (messages directs, 1.12)
   - config/msglog           → { items: [{ id, uid, email, title, ts, by, popup }] }  (journal des envois, admins)
   - profiles/{uid}          → présence écrite par l'application (1.12) : online, activity, activeAt, lastSeen
   - plans/{uid}             → Alixo+ (1.16) : { plus, until (0 = sans fin), since, by, note }  (posé ici, lu par l'utilisateur ;
                                depuis 1.19 aussi écrit par l'utilisateur lui-même avec une clé d'activation)
   - codes/{code}            → clés d'activation Alixo+ (1.19) : { kind: 'plus', months, label, createdAt, by, usedBy, usedAt, usedEmail, applied }
   - config/public           → + plusPrice, plusUrl, plusNote : l'offre Alixo+ affichée dans l'application (1.16)
   Règles : SETUP-COMPTES.md § 6.
   ============================================================ */
'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const uid8 = () => Math.random().toString(36).slice(2, 10);
  const when = ts => ts ? new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const ago = ts => { if (!ts) return 'jamais'; const d = Date.now() - ts; if (d < 3600000) return `il y a ${Math.max(1, Math.round(d / 60000))} min`; if (d < 86400000) return `il y a ${Math.round(d / 3600000)} h`; if (d < 30 * 86400000) return `il y a ${Math.round(d / 86400000)} j`; return new Date(ts).toLocaleDateString('fr-FR'); };
  const fmtBytes = n => { if (!(n >= 0)) return '—'; if (n < 1024) return n + ' o'; if (n < 1048576) return Math.round(n / 1024) + ' Ko'; if (n < 1073741824) return (n / 1048576).toFixed(1).replace('.', ',') + ' Mo'; return (n / 1073741824).toFixed(2).replace('.', ',') + ' Go'; };
  const SPECS = { droit: 'Droit', economie: 'Économie', medecine: 'Médecine', pharmacie: 'Pharmacie', odontologie: 'Odontologie', maieutique: 'Maïeutique', kine: 'Kiné', gestion: 'Gestion', sciencepo: 'Science po', maths: 'Maths', finance: 'Finance', histgeo: 'Hist-géo', lettres: 'Lettres', langues: 'Langues', sciences: 'Sciences', info: 'Info', commerce: 'Commerce', staps: 'STAPS', autre: 'Autre' };
  const HEALTH = ['medecine', 'pharmacie', 'odontologie', 'maieutique', 'kine'];
  const cmpVer = (a, b) => { const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  let toastTm = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTm); toastTm = setTimeout(() => { t.hidden = true; }, 2600); }
  function modal(html, onMount) {
    const m = $('#modal'), c = $('#modal-card'); c.innerHTML = html; m.hidden = false;
    const close = () => { m.hidden = true; c.innerHTML = ''; };
    m.onclick = e => { if (e.target === m) close(); };
    c.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    if (onMount) onMount(c, close);
    const first = c.querySelector('input, textarea'); if (first) setTimeout(() => first.focus(), 30);
  }
  const confirmBox = (title, text, ok = 'Confirmer', danger = false) => new Promise(res => modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="modal-foot"><button class="btn ghost" data-close>Annuler</button><button class="btn ${danger ? 'danger ghost' : ''}" id="cf-ok">${esc(ok)}</button></div>`, (c, close) => { c.querySelector('#cf-ok').onclick = () => { close(); res(true); }; c.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => res(false))); }));

  /* ---------------- Firebase ---------------- */
  const CONFIG = window.ALIXO_FIREBASE_CONFIG;
  if (!CONFIG) { $('#login-err').hidden = false; $('#login-err').textContent = 'firebase-config.js introuvable : copiez app/firebase-config.js à côté de cette page.'; return; }
  if (typeof firebase === 'undefined' || !firebase.auth || !firebase.firestore) { $('#login-err').hidden = false; $('#login-err').textContent = 'SDK Firebase non chargé (dossier vendor/ manquant ?) — republiez le panneau avec le workflow GitHub Pages.'; return; }
  firebase.initializeApp(CONFIG);
  const auth = firebase.auth(); auth.languageCode = 'fr';
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  let me = null;
  const state = { profiles: [], keysDoc: { keys: [] }, assigned: new Map(), pub: {}, admins: [], msglog: [], plans: new Map(), codes: [] };
  /* Alixo+ (1.16) */
  const planOf = uid => state.plans.get(uid) || null;
  const planActive = pl => !!(pl && pl.plus && (!pl.until || +pl.until > Date.now()));
  const planLabel = pl => !planActive(pl) ? '' : (pl.until ? 'jusqu’au ' + new Date(+pl.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'sans fin');
  const unsubs = [];
  /* 1.26 : journal des actions d'administration (collection audit, lecture seule pour tous, jamais effacée) */
  const audit = (action, target, details) => {
    if (!me) return Promise.resolve();
    return db.collection('audit').add({ ts: Date.now(), by: me.uid, byEmail: me.email || '', action, target: String(target || ''), details: details || null }).catch(err => console.warn('Audit :', err.message));
  };

  /* ---------------- connexion ---------------- */
  $('#google').addEventListener('click', async () => {
    $('#login-err').hidden = true;
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (e) { $('#login-err').hidden = false; $('#login-err').textContent = e.code === 'auth/unauthorized-domain' ? `Domaine non autorisé : ajoutez « ${location.hostname} » dans Firebase › Authentication › Settings › Authorized domains.` : (e.message || 'Connexion impossible'); }
  });
  $('#pwform').addEventListener('submit', async e => {
    e.preventDefault(); $('#login-err').hidden = true;
    try { await auth.signInWithEmailAndPassword($('#pw-mail').value.trim(), $('#pw-pass').value); }
    catch (err) { $('#login-err').hidden = false; $('#login-err').textContent = ({ 'auth/invalid-credential': 'E-mail ou mot de passe incorrect.', 'auth/user-not-found': 'Aucun compte avec cet e-mail.', 'auth/wrong-password': 'Mot de passe incorrect.' })[err.code] || err.message; }
  });
  $('#logout').addEventListener('click', () => auth.signOut());
  $('#den-reload').addEventListener('click', () => location.reload());
  $('#den-out').addEventListener('click', () => auth.signOut());

  auth.onAuthStateChanged(async user => {
    unsubs.splice(0).forEach(u => { try { u(); } catch { /* déjà arrêté */ } });
    me = user || null;
    $('#login').hidden = !!user; $('#denied').hidden = true; $('#panel').hidden = true; $('#nav').hidden = true; $('#me').hidden = !user;
    if (!user) return;
    $('#me-mail').textContent = user.email || user.uid;
    let ok = false;
    try { const s = await db.collection('admins').doc(user.uid).get(); ok = s.exists; } catch { ok = false; }
    if (!ok) { $('#denied').hidden = false; $('#den-mail').textContent = user.email || ''; $('#den-uid').textContent = user.uid; return; }
    $('#panel').hidden = false; $('#nav').hidden = false;
    start();
  });

  /* ---------------- navigation ---------------- */
  function showView(name) {
    $$('#nav button').forEach(x => x.classList.toggle('on', x.dataset.view === name));
    $$('.view').forEach(v => { v.hidden = v.id !== 'v-' + name; });
    if (name === 'db' && typeof dbEnsure === 'function') dbEnsure();
    if (name === 'msg' && typeof msgEnsure === 'function') msgEnsure();
  }
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); });
  document.addEventListener('click', e => { const a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); showView(a.dataset.goto); } });

  /* ---------------- données (temps réel) ---------------- */
  function start() {
    unsubs.push(db.collection('profiles').onSnapshot(s => { state.profiles = s.docs.map(d => Object.assign({ uid: d.id }, d.data())); renderAll(); }, err => toast('Profils : ' + err.message)));
    unsubs.push(db.collection('keys').onSnapshot(s => { state.assigned = new Map(s.docs.map(d => [d.id, d.data()])); renderAll(); }, err => toast('Clés attribuées : ' + err.message)));
    unsubs.push(db.collection('plans').onSnapshot(s => { state.plans = new Map(s.docs.map(d => [d.id, d.data()])); renderAll(); }, err => toast('Alixo+ : ' + err.message + ' (règles Firestore à redéployer : collection plans)')));
    unsubs.push(db.collection('config').doc('aikeys').onSnapshot(s => { state.keysDoc = s.exists ? s.data() : { keys: [] }; if (!Array.isArray(state.keysDoc.keys)) state.keysDoc.keys = []; renderKeys(); renderUsers(); renderDash(); }, err => toast('Réservoir de clés : ' + err.message)));
    unsubs.push(db.collection('config').doc('public').onSnapshot(s => { state.pub = s.exists ? s.data() : {}; renderAnn(); renderDash(); }, err => toast('Config publique : ' + err.message)));
    unsubs.push(db.collection('codes').onSnapshot(s => { state.codes = s.docs.map(d => Object.assign({ code: d.id }, d.data())); renderCodes(); }, err => toast('Clés Alixo+ : ' + err.message + ' (règles Firestore à redéployer ?)')));
    unsubs.push(db.collection('admins').onSnapshot(s => { state.admins = s.docs.map(d => Object.assign({ uid: d.id }, d.data())); renderAdmins(); }, err => toast('Administrateurs : ' + err.message)));
    unsubs.push(db.collection('config').doc('msglog').onSnapshot(s => { const d = s.exists ? s.data() : {}; state.msglog = Array.isArray(d.items) ? d.items : []; renderMsgLog(); }, err => toast('Journal des messages : ' + err.message)));
    /* les durées relatives (« il y a 3 min », présence) se rafraîchissent d'elles-mêmes */
    clearInterval(tickTm); tickTm = setInterval(() => { if (!$('#v-users').hidden) renderUsers(); if (!$('#v-dash').hidden) renderDash(); }, 30000);
  }
  let tickTm = null;
  function renderAll() { renderDash(); renderUsers(); renderKeys(); }
  const keyById = id => state.keysDoc.keys.find(k => k.id === id) || null;
  /* 1.27 : une attribution ne compte que si elle porte une clé xAI (`grok`) ; un ancien document `gemini` (clé Google) vaut « sans clé » */
  const hasKey = uid => { const a = state.assigned.get(uid); return !!(a && typeof a.grok === 'string' && a.grok); };
  const keyLabel = k => k ? (k.label || ('Clé …' + String(k.key || '').slice(-4))) : '';
  const mask = k => k ? k.slice(0, 6) + '…' + k.slice(-4) : '';

  /* ---------------- tableau de bord ---------------- */
  function renderDash() {
    const P = state.profiles, now = Date.now();
    const act7 = P.filter(p => p.lastSeen && now - p.lastSeen < 7 * 86400000).length;
    const act30 = P.filter(p => p.lastSeen && now - p.lastSeen < 30 * 86400000).length;
    const docs = P.reduce((n, p) => n + (+p.nDocs || 0), 0);
    const sante = P.filter(p => (p.specialites || []).some(k => HEALTH.includes(k))).length, droit = P.filter(p => (p.specialites || []).includes('droit')).length, eco = P.filter(p => (p.specialites || []).includes('economie')).length;
    const anns = (state.pub.announcements || []).filter(a => !a.until || a.until > now).length;
    const online = P.filter(p => presence(p).on).length;
    $('#dash-tiles').innerHTML = [[online, 'connectés maintenant'], [P.length, 'comptes'], [act7, 'actifs sur 7 jours'], [act30, 'actifs sur 30 jours'], [docs, 'séances (déclarées)'], [[...state.assigned.keys()].filter(hasKey).length, 'clés IA attribuées'], [P.filter(p => planActive(planOf(p.uid))).length, 'abonnés Alixo+'], [state.keysDoc.keys.filter(k => k.enabled !== false).length, 'clés actives au réservoir'], [P.filter(p => p.disabled).length, 'comptes suspendus'], [anns, 'annonces en cours']].map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join('') +
      `<div class="tile"><b style="font-size:16px; margin-top:6px">${droit} · ${eco} · ${sante}</b><span>Droit · Économie · Santé</span></div>`;
    const recent = P.filter(p => p.lastSeen).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 8);
    $('#dash-recent').innerHTML = recent.length ? recent.map(p => { const pr = presence(p); return `<div class="recent-row"><span><span class="pres ${pr.cls}" title="${esc(pr.label)}"></span>${esc(p.name || p.pseudo || p.email || p.uid)} <span class="muted small">${esc(p.email || '')}</span></span><span>${pr.on ? esc(pr.label) : ago(p.lastSeen)} · ${esc(p.version || '?')}</span></div>`; }).join('') : '<div class="empty">Aucune activité remontée pour l’instant (les applications 1.11+ signalent leur dernière ouverture).</div>';
    const vers = {}; P.forEach(p => { if (p.version) vers[p.version] = (vers[p.version] || 0) + 1; });
    $('#dash-version').innerHTML = `<div class="storage">Version annoncée : <b>${esc(state.pub.latestVersion || '—')}</b></div><div class="storage" style="margin-top:8px">Versions en usage :<br>${Object.entries(vers).sort((a, b) => b[1] - a[1]).map(([v, n]) => `<span class="chip">${esc(v)} × ${n}</span>`).join(' ') || '<span class="muted">—</span>'}</div><div class="storage" style="margin-top:8px">Plateformes : ${['desktop', 'web'].map(k => `<span class="chip dim">${k === 'desktop' ? 'PC' : 'web'} × ${P.filter(p => p.platform === k).length}</span>`).join(' ')}</div>`;
  }

  /* ---------------- utilisateurs ---------------- */
  $('#users-q').addEventListener('input', renderUsers);
  $('#users-f').addEventListener('change', renderUsers);
  function filteredUsers() {
    const q = $('#users-q').value.trim().toLowerCase(), f = $('#users-f').value, now = Date.now();
    return state.profiles.filter(p => {
      if (q && ![p.email, p.pseudo, p.name, p.uid].some(v => String(v || '').toLowerCase().includes(q))) return false;
      if (f === 'online') return presence(p).on;
      if (f === 'active') return p.lastSeen && now - p.lastSeen < 7 * 86400000;
      if (f === 'key') return hasKey(p.uid);
      if (f === 'nokey') return !hasKey(p.uid);
      if (f === 'disabled') return !!p.disabled;
      if (f === 'plus') return planActive(planOf(p.uid));
      if (f === 'free') return !planActive(planOf(p.uid));
      if (f === 'desktop' || f === 'web') return p.platform === f;
      return true;
    }).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  }
  function renderUsers() {
    const list = filteredUsers();
    $('#users-count').textContent = `${list.length} / ${state.profiles.length}`;
    $('#users-tbl tbody').innerHTML = list.length ? list.map(p => {
      const a = state.assigned.get(p.uid); const k = a ? keyById(a.keyId) : null;
      const isAdm = state.admins.some(x => x.uid === p.uid);
      const pl = planOf(p.uid), plusOn = planActive(pl);
      return `<tr data-uid="${esc(p.uid)}">
        <td><div class="u-main">${esc(p.name || p.pseudo || '—')}${isAdm ? ' <span class="chip">admin</span>' : ''}</div><div class="u-sub">${esc(p.email || '')}${p.pseudo ? ' · @' + esc(p.pseudo) : ''}</div><div class="u-sub" title="UID">${esc(p.uid)}</div></td>
        <td>${(p.specialites || []).map(s => `<span class="chip dim">${esc(SPECS[s] || s)}</span>`).join('') || '<span class="muted">—</span>'}</td>
        <td>${presenceHTML(p)}</td>
        <td title="${esc(when(p.lastSeen))}">${ago(p.lastSeen)}</td>
        <td>${p.version ? `<span class="chip dim">${esc(p.version)}</span>` : '—'} ${p.platform ? `<span class="muted small">${p.platform === 'desktop' ? 'PC' : 'web'}</span>` : ''}</td>
        <td>${p.nDocs ?? '—'}</td>
        <td>${a && a.grok ? `<span class="chip ok" title="${esc(mask(a.grok))}">${esc(k ? keyLabel(k) : 'clé hors réservoir')}${a.force ? ' · imposée' : ''}</span>` : a ? '<span class="chip bad" title="Attribution antérieure à 1.27 (clé Google) : l’application l’ignore — attribuer une clé xAI">ancienne clé Google</span>' : '<span class="chip dim">aucune</span>'}</td>
        <td>${plusOn ? `<span class="chip ok" title="${esc(pl.note || '')}${pl.by ? ' · par ' + esc(pl.by) : ''}">Alixo+ · ${esc(planLabel(pl))}</span>` : (pl && pl.plus ? '<span class="chip bad" title="Abonnement arrivé à échéance">expiré</span>' : '<span class="chip dim">gratuit</span>')}</td>
        <td>${p.disabled ? `<span class="chip bad" title="${esc(p.disabledReason || '')}">suspendu</span>` : '<span class="chip ok">actif</span>'}</td>
        <td><div class="acts"><button data-ua="msg" title="Envoyer un message direct à cet utilisateur">Message…</button><button data-ua="key" title="Attribuer / retirer une clé IA">Clé…</button><button data-ua="plan" title="Activer, prolonger ou retirer Alixo+">Alixo+…</button><button data-ua="storage" title="Espace utilisé dans la base">Stockage</button><button data-ua="${p.disabled ? 'enable' : 'disable'}" class="${p.disabled ? '' : 'danger'}">${p.disabled ? 'Réactiver' : 'Suspendre'}</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="10" class="empty">Aucun utilisateur ne correspond.</td></tr>';
    const n = $('#msg-all-n'); if (n) n.textContent = `${list.length} destinataire${list.length > 1 ? 's' : ''}`;
  }
  $('#users-tbl').addEventListener('click', async e => {
    const b = e.target.closest('[data-ua]'); if (!b) return;
    const uid = b.closest('tr').dataset.uid; const p = state.profiles.find(x => x.uid === uid); if (!p) return;
    const act = b.dataset.ua;
    if (act === 'key') return openAssignModal(p);
    if (act === 'plan') return openPlanModal(p);
    if (act === 'storage') return openStorageModal(p);
    if (act === 'msg') return openMsgModal(p);
    if (act === 'disable') {
      modal(`<h3>Suspendre ${esc(p.email || p.uid)}</h3><p class="muted">L’application affichera « Accès suspendu » à sa prochaine synchronisation ; ses cours restent sur ses appareils.</p><label class="field">Motif (affiché à l’utilisateur)<textarea id="dis-reason" placeholder="Ex. compte partagé entre plusieurs personnes, contactez…"></textarea></label><div class="modal-foot"><button class="btn ghost" data-close>Annuler</button><button class="btn danger ghost" id="dis-ok">Suspendre</button></div>`, (c, close) => {
        c.querySelector('#dis-ok').onclick = async () => { const reason = c.querySelector('#dis-reason').value.trim(); await db.collection('profiles').doc(uid).set({ disabled: true, disabledReason: reason, disabledAt: Date.now() }, { merge: true }); audit('user.suspend', uid, { reason }); close(); toast('Compte suspendu'); };
      });
      return;
    }
    if (act === 'enable') { await db.collection('profiles').doc(uid).set({ disabled: false, disabledReason: FV.delete(), disabledAt: FV.delete() }, { merge: true }); audit('user.enable', uid); toast('Compte réactivé'); }
  });
  $('#users-csv').addEventListener('click', () => {
    const rows = [['uid', 'email', 'nom', 'pseudo', 'specialites', 'statut', 'derniere_ouverture', 'version', 'plateforme', 'seances', 'cle_ia', 'alixo_plus', 'alixo_plus_fin', 'suspendu']].concat(filteredUsers().map(p => { const pl = planOf(p.uid); return [p.uid, p.email || '', p.name || '', p.pseudo || '', (p.specialites || []).join('|'), presence(p).label, p.lastSeen ? new Date(p.lastSeen).toISOString() : '', p.version || '', p.platform || '', p.nDocs ?? '', state.assigned.has(p.uid) ? 'oui' : 'non', planActive(pl) ? 'oui' : 'non', planActive(pl) && pl.until ? new Date(+pl.until).toISOString() : '', p.disabled ? 'oui' : 'non']; }));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    audit('users.csv', '', { n: rows.length - 1 });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `alixo-utilisateurs-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  });
  /* ---------------- Alixo+ (1.16) : activer / prolonger / retirer ---------------- */
  function openPlanModal(p) {
    const cur = planOf(p.uid);
    const on = planActive(cur);
    const base = on && cur.until ? +cur.until : Date.now();
    modal(`<h3>Alixo+ de ${esc(p.email || p.uid)}</h3>
      <p class="muted">${on ? `Alixo+ est actif (${esc(planLabel(cur))}${cur.since ? ', depuis le ' + when(cur.since) : ''}). Une nouvelle durée <b>prolonge</b> à partir de la fin actuelle.` : 'Ouvre tous les thèmes, toutes les polices, l’IA, les tâches et le stockage au-delà de 3 Go sur ce compte, sur tous ses appareils, dès sa prochaine synchronisation.'}</p>
      <label class="field">Durée<select id="pl-dur"><option value="1">1 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12" selected>12 mois</option><option value="0">Sans fin</option><option value="custom">Jusqu’à une date…</option></select></label>
      <label class="field" id="pl-until-w" hidden>Fin<input id="pl-until" type="date" value="${on && cur.until ? new Date(+cur.until).toISOString().slice(0, 10) : ''}"></label>
      <label class="field">Note (montrée à l’utilisateur)<input id="pl-note" maxlength="140" placeholder="Ex. Merci pour votre soutien !" value="${esc(cur ? cur.note || '' : '')}"></label>
      <div class="modal-foot">${on || (cur && cur.plus) ? '<button class="btn ghost danger" id="pl-rm">Retirer Alixo+</button>' : ''}<button class="btn ghost" data-close>Annuler</button><button class="btn" id="pl-ok">${on ? 'Prolonger' : 'Activer Alixo+'}</button></div>`, (c, close) => {
      const sel = c.querySelector('#pl-dur'), uw = c.querySelector('#pl-until-w');
      const sync = () => { uw.hidden = sel.value !== 'custom'; }; sel.onchange = sync; sync();
      const rm = c.querySelector('#pl-rm');
      if (rm) rm.onclick = async () => { await db.collection('plans').doc(p.uid).delete(); audit('plan.remove', p.uid); close(); toast('Alixo+ retiré'); };
      c.querySelector('#pl-ok').onclick = async () => {
        let until = 0;
        if (sel.value === 'custom') { const v = c.querySelector('#pl-until').value; if (!v) { toast('Indiquez la date de fin'); return; } until = new Date(v + 'T23:59:59').getTime(); if (until < Date.now()) { toast('La date de fin est déjà passée'); return; } }
        else if (+sel.value > 0) { const d = new Date(base); d.setMonth(d.getMonth() + +sel.value); until = d.getTime(); }
        await db.collection('plans').doc(p.uid).set({ plus: true, until, since: on && cur.since ? cur.since : Date.now(), updatedAt: Date.now(), by: me.email || me.uid, note: c.querySelector('#pl-note').value.trim(), email: p.email || '' });
        audit('plan.set', p.uid, { until });
        close(); toast(until ? `Alixo+ actif jusqu’au ${new Date(until).toLocaleDateString('fr-FR')}` : 'Alixo+ actif sans fin');
      };
    });
  }
  async function openStorageModal(p) {
    /* 1.26 : tailles déclarées par l'application (profiles/{uid}.storage) — le panneau ne lit plus users/{uid} */
    const st = p.storage || null;
    modal(`<h3>Stockage de ${esc(p.email || p.uid)}</h3><div id="st-body" class="storage">${st
      ? `<p><b>${fmtBytes(st.total)}</b> dans la base (${((st.total || 0) / 1073741824).toFixed(3).replace('.', ',')} Go)</p><p>Cours : <b>${st.nDocs ?? '—'}</b> séances · ${fmtBytes(st.docs)}<br>Images : ${fmtBytes(st.imgs)}<br>Fichiers : <b>${st.nFiles ?? '—'}</b> · ${fmtBytes(st.files)}</p><p class="muted small">Tailles calculées par l’application le ${when(st.at)}. Le contenu des cours n’est pas accessible depuis le panneau.</p>`
      : '<p class="muted">Pas encore de mesure : l’application (1.26 ou plus récente) envoie les tailles à sa prochaine ouverture.</p>'}</div><div class="modal-foot"><button class="btn ghost" data-close>Fermer</button></div>`);
  }

  /* ---------------- clés API ---------------- */
  async function saveKeys() { await db.collection('config').doc('aikeys').set({ keys: state.keysDoc.keys, updatedAt: Date.now() }); }
  async function testKey(key) {
    try {
      const r = await fetch('https://api.x.ai/v1/models', { headers: { 'Authorization': 'Bearer ' + key } });
      if (r.ok) return { ok: true };
      const j = await r.json().catch(() => ({}));
      return { ok: false, msg: (typeof j.error === 'string' ? j.error : j.error && j.error.message) || ('HTTP ' + r.status) };
    } catch (e) { return { ok: false, msg: e.message }; }
  }
  $('#key-add').addEventListener('click', () => {
    modal(`<h3>Ajouter une clé API xAI (Grok)</h3><p class="muted small">Clé créée sur <a href="https://console.x.ai/" target="_blank" rel="noopener">console.x.ai</a> (API Keys › Create API key, elle commence par <code>xai-</code>). La consommation est facturée au compte xAI qui a créé la clé : plusieurs clés = répartition de la dépense et des limites de débit.</p>
      <label class="field">Libellé<input id="k-label" placeholder="Ex. Compte xAI n° 2"></label><label class="field">Clé<input id="k-key" placeholder="xai-…" autocomplete="off" spellcheck="false"></label>
      <p id="k-msg" class="muted small"></p><div class="modal-foot"><button class="btn ghost" data-close>Annuler</button><button class="btn ghost" id="k-test">Tester</button><button class="btn" id="k-ok">Ajouter</button></div>`, (c, close) => {
      const msg = c.querySelector('#k-msg');
      c.querySelector('#k-test').onclick = async () => { msg.textContent = 'Test…'; const r = await testKey(c.querySelector('#k-key').value.trim()); msg.textContent = r.ok ? '✓ Clé valide' : '✕ ' + r.msg; };
      c.querySelector('#k-ok').onclick = async () => {
        const key = c.querySelector('#k-key').value.trim(); if (key.length < 20) { msg.textContent = 'Clé trop courte.'; return; }
        if (state.keysDoc.keys.some(k => k.key === key)) { msg.textContent = 'Cette clé est déjà dans le réservoir.'; return; }
        state.keysDoc.keys.push({ id: uid8(), key, label: c.querySelector('#k-label').value.trim(), enabled: true, addedAt: Date.now(), addedBy: me.email || me.uid });
        await saveKeys(); close(); toast('Clé ajoutée');
      };
    });
  });
  function renderKeys() {
    const K = state.keysDoc.keys;
    const usage = {}; for (const a of state.assigned.values()) usage[a.keyId] = (usage[a.keyId] || 0) + 1;
    $('#keys-tbl tbody').innerHTML = K.length ? K.map(k => `<tr data-kid="${k.id}"><td><b>${esc(keyLabel(k))}</b><div class="u-sub">ajoutée ${when(k.addedAt)}${k.addedBy ? ' par ' + esc(k.addedBy) : ''}</div></td><td class="key-mask" title="Cliquer pour copier" data-copy="${esc(k.key)}">${esc(mask(k.key))}</td><td>${usage[k.id] || 0}</td><td>${k.enabled === false ? '<span class="chip bad">désactivée</span>' : '<span class="chip ok">active</span>'}${k.lastTest ? `<div class="u-sub">test ${k.lastTest.ok ? '✓' : '✕'} ${when(k.lastTest.ts)}</div>` : ''}</td><td><div class="acts"><button data-ka="test">Tester</button><button data-ka="toggle">${k.enabled === false ? 'Activer' : 'Désactiver'}</button><button data-ka="rename">Renommer</button><button data-ka="del" class="danger">Retirer</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty">Aucune clé. Ajoutez-en une, puis distribuez-la aux utilisateurs.</td></tr>';
  }
  $('#keys-tbl').addEventListener('click', async e => {
    const cp = e.target.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Clé copiée'); } catch { /* presse-papiers indisponible */ } return; }
    const b = e.target.closest('[data-ka]'); if (!b) return;
    const k = keyById(b.closest('tr').dataset.kid); if (!k) return;
    const act = b.dataset.ka;
    if (act === 'test') { toast('Test en cours…'); const r = await testKey(k.key); k.lastTest = { ok: r.ok, ts: Date.now(), msg: r.msg || '' }; await saveKeys(); toast(r.ok ? 'Clé valide ✓' : 'Clé refusée : ' + r.msg); }
    else if (act === 'toggle') { k.enabled = k.enabled === false; await saveKeys(); }
    else if (act === 'rename') { const v = prompt('Libellé de la clé', k.label || ''); if (v !== null) { k.label = v.trim(); await saveKeys(); } }
    else if (act === 'del') {
      const n = [...state.assigned.values()].filter(a => a.keyId === k.id).length;
      if (!await confirmBox('Retirer cette clé ?', n ? `${n} utilisateur(s) l’utilisent : leur attribution sera supprimée (ils repasseront sur leur clé personnelle ou sans IA).` : 'Elle sera supprimée du réservoir.', 'Retirer', true)) return;
      const batch = db.batch(); let c = 0;
      for (const [uid, a] of state.assigned) if (a.keyId === k.id) { batch.delete(db.collection('keys').doc(uid)); if (++c >= 400) break; }
      state.keysDoc.keys = state.keysDoc.keys.filter(x => x.id !== k.id);
      batch.set(db.collection('config').doc('aikeys'), { keys: state.keysDoc.keys, updatedAt: Date.now() });
      await batch.commit(); toast('Clé retirée');
    }
  });
  function openAssignModal(p) {
    const cur = state.assigned.get(p.uid);
    const K = state.keysDoc.keys.filter(k => k.enabled !== false);
    modal(`<h3>Clé IA de ${esc(p.email || p.uid)}</h3>
      <label class="field">Clé du réservoir<select id="as-key"><option value="">— Aucune (retirer l’attribution) —</option>${K.map(k => `<option value="${k.id}" ${cur && cur.keyId === k.id ? 'selected' : ''}>${esc(keyLabel(k))} (${esc(mask(k.key))})</option>`).join('')}<option value="__custom" ${cur && !keyById(cur.keyId) ? 'selected' : ''}>Clé spécifique à cet utilisateur…</option></select></label>
      <label class="field" id="as-custom-w" hidden>Clé spécifique<input id="as-custom" placeholder="xai-…" value="${esc(cur && !keyById(cur.keyId) ? cur.grok || '' : '')}"></label>
      <label class="field">Note (montrée dans la notification)<input id="as-note" placeholder="Ex. Offerte par l’association — merci de ne pas la partager" value="${esc(cur ? cur.note || '' : '')}"></label>
      <label class="chk"><input type="checkbox" id="as-force" ${cur && cur.force ? 'checked' : ''}> Imposer (remplace aussi une clé personnelle)</label>
      <div class="modal-foot"><button class="btn ghost" data-close>Annuler</button><button class="btn" id="as-ok">Enregistrer</button></div>`, (c, close) => {
      const sel = c.querySelector('#as-key'), cw = c.querySelector('#as-custom-w');
      const sync = () => { cw.hidden = sel.value !== '__custom'; }; sel.onchange = sync; sync();
      c.querySelector('#as-ok').onclick = async () => {
        const v = sel.value;
        if (!v) { await db.collection('keys').doc(p.uid).delete(); audit('key.remove', p.uid); close(); toast('Attribution retirée'); return; }
        const key = v === '__custom' ? c.querySelector('#as-custom').value.trim() : keyById(v).key;
        if (!key || key.length < 20) { toast('Clé invalide'); return; }
        await db.collection('keys').doc(p.uid).set({ grok: key, keyId: v === '__custom' ? 'custom' : v, note: c.querySelector('#as-note').value.trim(), force: c.querySelector('#as-force').checked, assignedAt: Date.now(), assignedBy: me.email || me.uid });
        audit('key.assign', p.uid, { keyId: v === '__custom' ? 'custom' : v, force: c.querySelector('#as-force').checked });
        close(); toast('Clé attribuée');
      };
    });
  }
  /* distribution : chaque utilisateur reçoit la clé active la moins chargée */
  const log = t => { const l = $('#dist-log'); l.textContent += t + '\n'; l.scrollTop = l.scrollHeight; };
  async function distribute({ onlyMissing, clear }) {
    $('#dist-log').textContent = '';
    const force = $('#dist-force').checked;
    if (clear) {
      if (!await confirmBox('Retirer toutes les clés attribuées ?', `${state.assigned.size} attribution(s) seront supprimées.`, 'Retirer', true)) return;
      let batch = db.batch(), n = 0;
      for (const uid of state.assigned.keys()) { batch.delete(db.collection('keys').doc(uid)); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
      if (n % 400) await batch.commit();
      audit('key.clearAll', '', { n });
      log(`${n} attribution(s) retirée(s).`); return;
    }
    const K = state.keysDoc.keys.filter(k => k.enabled !== false);
    if (!K.length) { log('Aucune clé active dans le réservoir.'); return; }
    const load = Object.fromEntries(K.map(k => [k.id, 0]));
    if (onlyMissing) for (const a of state.assigned.values()) if (a.grok && a.keyId in load) load[a.keyId]++;
    const targets = state.profiles.filter(p => !p.disabled && (!onlyMissing || !hasKey(p.uid)));
    if (!targets.length) { log('Personne à servir.'); return; }
    if (!await confirmBox(onlyMissing ? 'Attribuer une clé' : 'Rééquilibrer', `${targets.length} utilisateur(s) recevront une clé parmi ${K.length} clé(s) active(s)${force ? ', imposée même s’ils ont une clé personnelle' : ''}.`, 'Continuer')) return;
    let batch = db.batch(), n = 0;
    for (const p of targets) {
      const k = K.reduce((a, b) => (load[b.id] < load[a.id] ? b : a));
      load[k.id]++;
      batch.set(db.collection('keys').doc(p.uid), { grok: k.key, keyId: k.id, note: '', force, assignedAt: Date.now(), assignedBy: me.email || me.uid });
      log(`${p.email || p.uid} ← ${keyLabel(k)}`);
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400) await batch.commit();
    audit(onlyMissing ? 'key.distribute' : 'key.rebalance', '', { n, force });
    log(`Terminé : ${n} attribution(s). Charge : ` + K.map(k => `${keyLabel(k)} ${load[k.id]}`).join(' · '));
    toast(`${n} clé(s) attribuée(s)`);
  }
  $('#dist-all').addEventListener('click', () => distribute({ onlyMissing: true }));
  $('#dist-rebalance').addEventListener('click', () => distribute({ onlyMissing: false }));
  $('#dist-clear').addEventListener('click', () => distribute({ clear: true }));

  /* ---------------- clés d'activation Alixo+ (1.19) + versions personnalisées ---------------- */
  const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans 0/O, 1/I
  const newCode = () => { const g = () => Array.from({ length: 4 }, () => CODE_ALPHA[Math.floor(Math.random() * CODE_ALPHA.length)]).join(''); return `ALXP-${g()}-${g()}-${g()}`; };
  const durLabel = m => (+m ? `${m} mois` : 'sans fin');
  const userOf = uid => state.profiles.find(p => p.uid === uid);
  function renderCodes() {
    const C = state.codes.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const free = C.filter(c => !c.usedBy).length;
    $('#codes-count').textContent = C.length ? `${C.length} · ${free} disponible${free > 1 ? 's' : ''}` : '';
    $('#codes-tbl tbody').innerHTML = C.length ? C.map(c => {
      const u = c.usedBy ? userOf(c.usedBy) : null;
      const st = c.usedBy ? `<span class="chip dim" title="${esc(c.usedBy)}">utilisée par ${esc(c.usedEmail || (u && u.email) || c.usedBy)}${c.usedAt ? ' · ' + when(c.usedAt) : ''}</span>` : '<span class="chip ok">disponible</span>';
      return `<tr data-code="${esc(c.code)}"><td><code class="key-mask" title="Cliquer pour copier" data-copy="${esc(c.code)}">${esc(c.code)}</code></td><td>${durLabel(c.months)}</td><td>${esc(c.label || '')}</td><td>${st}</td><td>${when(c.createdAt)}${c.by ? `<div class="u-sub">par ${esc(c.by)}</div>` : ''}</td><td><div class="acts"><button data-ca="copy">Copier</button>${c.usedBy ? '' : '<button data-ca="del" class="danger">Supprimer</button>'}</div></td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">Aucune clé. Cliquez sur « Générer des clés Alixo+ ».</td></tr>';
    const E = Array.isArray(window.ALIXO_EDITIONS) ? window.ALIXO_EDITIONS : [];
    $('#editions-tbl tbody').innerHTML = E.length ? E.map(e => `<tr><td><code class="key-mask" title="Cliquer pour copier" data-copy="${esc(e.code || '')}">${esc(e.code || '')}</code></td><td><b>${esc(e.name || '')}</b></td><td class="muted">${esc(e.note || '')}</td><td>${e.enabled === false ? '<span class="chip bad">désactivée</span>' : '<span class="chip ok">active</span>'}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Aucune version personnalisée dans app/js/editions.js.</td></tr>';
  }
  $('#codes-gen').addEventListener('click', () => {
    modal(`<h3>Générer des clés Alixo+</h3>
      <div class="row wrap"><label>Nombre<input id="cg-n" type="number" min="1" max="50" value="5" style="width:80px"></label>
      <label>Durée<select id="cg-dur"><option value="1">1 mois</option><option value="3">3 mois</option><option value="6">6 mois</option><option value="12" selected>12 mois</option><option value="0">Sans fin</option></select></label></div>
      <label class="field">Libellé (montré à l’utilisateur, facultatif)<input id="cg-label" maxlength="80" placeholder="Ex. Offre rentrée 2026"></label>
      <div id="cg-out" hidden><p class="muted small">Clés créées — copiez-les maintenant, elles restent visibles dans la liste :</p><textarea id="cg-list" rows="6" readonly style="width:100%; font-family:var(--font-mono)"></textarea></div>
      <div class="modal-foot"><button class="btn ghost" data-close>Fermer</button><button class="btn" id="cg-ok">Générer</button></div>`, (c, close) => {
      c.querySelector('#cg-ok').onclick = async () => {
        const n = Math.max(1, Math.min(50, +c.querySelector('#cg-n').value || 1)), months = +c.querySelector('#cg-dur').value || 0, label = c.querySelector('#cg-label').value.trim();
        const batch = db.batch(); const made = [];
        for (let i = 0; i < n; i++) { const code = newCode(); made.push(code); batch.set(db.collection('codes').doc(code), { kind: 'plus', months, label, createdAt: Date.now(), by: me.email || me.uid, usedBy: null }); }
        try { await batch.commit(); } catch (e) { toast('Création impossible : ' + e.message); return; }
        audit('code.create', '', { n, months, label });
        c.querySelector('#cg-out').hidden = false; c.querySelector('#cg-list').value = made.join('\n'); c.querySelector('#cg-ok').textContent = 'Générer encore';
        toast(`${n} clé${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}`);
      };
    });
  });
  $('#v-codes').addEventListener('click', async e => {
    const cp = e.target.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Clé copiée'); } catch { /* presse-papiers indisponible */ } return; }
    const b = e.target.closest('[data-ca]'); if (!b) return;
    const code = b.closest('tr').dataset.code; const c = state.codes.find(x => x.code === code); if (!c) return;
    if (b.dataset.ca === 'copy') { try { await navigator.clipboard.writeText(code); toast('Clé copiée'); } catch { /* */ } }
    else if (b.dataset.ca === 'del') {
      if (c.usedBy) { toast('Cette clé a été utilisée : elle reste dans l’historique'); return; }
      if (!await confirmBox('Supprimer cette clé ?', `${code} ne pourra plus être activée.`, 'Supprimer', true)) return;
      await db.collection('codes').doc(code).delete(); audit('code.delete', code); toast('Clé supprimée');
    }
  });

  /* ---------------- annonces + version ---------------- */
  const savePub = patch => db.collection('config').doc('public').set(Object.assign({ updatedAt: Date.now() }, patch), { merge: true });
  function renderAnn() {
    const pub = state.pub || {};
    if (document.activeElement !== $('#ver-num')) $('#ver-num').value = pub.latestVersion || '';
    if (document.activeElement !== $('#ver-url')) $('#ver-url').value = pub.downloadUrl || '';
    if (document.activeElement !== $('#ver-note')) $('#ver-note').value = pub.latestNote || '';
    if (document.activeElement !== $('#ver-min')) $('#ver-min').value = pub.minVersion || '';
    if (document.activeElement !== $('#plus-price')) $('#plus-price').value = pub.plusPrice || '';
    if (document.activeElement !== $('#plus-url')) $('#plus-url').value = pub.plusUrl || '';
    if (document.activeElement !== $('#plus-note')) $('#plus-note').value = pub.plusNote || '';
    const A = (pub.announcements || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const aud = a => ({ all: 'tous', droit: 'Droit', economie: 'Économie', sante: 'Santé', commerce: 'Commerce', staps: 'STAPS' })[a.audience || 'all'] || a.audience;
    $('#ann-tbl tbody').innerHTML = A.length ? A.map(a => `<tr data-aid="${esc(a.id)}"><td><b>${esc(a.title)}</b><div class="muted small">${esc(a.text || '')}${a.url ? ` · <a href="${esc(a.url)}" target="_blank" rel="noopener">lien</a>` : ''}</div></td><td><span class="chip dim">${esc(aud(a))}</span>${a.silent ? ' <span class="chip dim">discrète</span>' : ''}</td><td>${when(a.ts)}</td><td>${a.until ? (a.until < Date.now() ? '<span class="chip bad">expirée</span> ' : '') + when(a.until) : '—'}</td><td><div class="acts"><button data-aa="del" class="danger">Supprimer</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty">Aucune annonce.</td></tr>';
  }
  $('#ver-save').addEventListener('click', async () => {
    const v = $('#ver-num').value.trim();
    if (v && !/^\d+\.\d+\.\d+$/.test(v)) { toast('Numéro attendu : x.y.z'); return; }
    const mn = $('#ver-min').value.trim();
    if (mn && !/^\d+\.\d+\.\d+$/.test(mn)) { toast('Version minimale attendue : x.y.z'); return; }
    if (mn && v && cmpVer(mn, v) > 0) { toast('La version minimale ne peut pas dépasser la version disponible'); return; }
    await savePub({ latestVersion: v, downloadUrl: $('#ver-url').value.trim(), latestNote: $('#ver-note').value.trim(), minVersion: mn }); toast('Version enregistrée');
  });
  $('#plus-save').addEventListener('click', async () => {
    const url = $('#plus-url').value.trim();
    if (url && !/^https?:\/\//.test(url)) { toast('Le lien doit commencer par https://'); return; }
    await savePub({ plusPrice: $('#plus-price').value.trim(), plusUrl: url, plusNote: $('#plus-note').value.trim() }); toast('Offre Alixo+ enregistrée');
  });
  $('#ann-add').addEventListener('click', () => {
    modal(`<h3>Nouvelle annonce</h3><label class="field">Titre<input id="an-title" maxlength="140" placeholder="Ex. Maintenance dimanche matin"></label><label class="field">Texte<textarea id="an-text" maxlength="600" placeholder="Détails (facultatif)"></textarea></label><label class="field">Lien (facultatif)<input id="an-url" placeholder="https://…"></label>
      <div class="row wrap"><label>Public<select id="an-aud"><option value="all">Tout le monde</option><option value="droit">Droit</option><option value="economie">Économie</option><option value="sante">Santé</option><option value="commerce">Commerce &amp; marketing</option><option value="staps">STAPS</option></select></label><label>Expire le<input id="an-until" type="date"></label><label class="chk"><input type="checkbox" id="an-silent"> Discrète (pas de bandeau, seulement dans la cloche)</label></div>
      <div class="modal-foot"><button class="btn ghost" data-close>Annuler</button><button class="btn" id="an-ok">Publier</button></div>`, (c, close) => {
      c.querySelector('#an-ok').onclick = async () => {
        const title = c.querySelector('#an-title').value.trim(); if (!title) { toast('Un titre est nécessaire'); return; }
        const until = c.querySelector('#an-until').value ? new Date(c.querySelector('#an-until').value + 'T23:59:59').getTime() : 0;
        const a = { id: uid8(), title, text: c.querySelector('#an-text').value.trim(), url: c.querySelector('#an-url').value.trim(), audience: c.querySelector('#an-aud').value, ts: Date.now(), until, silent: c.querySelector('#an-silent').checked, by: me.email || me.uid };
        await savePub({ announcements: FV.arrayUnion(a) }); close(); toast('Annonce publiée');
      };
    });
  });
  $('#ann-tbl').addEventListener('click', async e => {
    const b = e.target.closest('[data-aa]'); if (!b) return;
    const id = b.closest('tr').dataset.aid; const a = (state.pub.announcements || []).find(x => x.id === id); if (!a) return;
    if (!await confirmBox('Supprimer l’annonce ?', 'Elle disparaîtra de la liste ; les utilisateurs qui l’ont déjà reçue la gardent dans leur cloche.', 'Supprimer', true)) return;
    await savePub({ announcements: FV.arrayRemove(a) }); toast('Annonce supprimée');
  });

  /* ---------------- administrateurs ---------------- */
  function renderAdmins() {
    $('#adm-tbl tbody').innerHTML = state.admins.length ? state.admins.map(a => `<tr data-uid="${esc(a.uid)}"><td><b>${esc(a.email || '—')}</b>${a.uid === (me && me.uid) ? ' <span class="chip">vous</span>' : ''}</td><td class="u-sub">${esc(a.uid)}</td><td>${when(a.addedAt)}${a.addedBy ? `<div class="muted small">par ${esc(a.addedBy)}</div>` : ''}</td><td><div class="acts">${a.uid === (me && me.uid) ? '' : '<button data-ad="del" class="danger">Retirer</button>'}</div></td></tr>`).join('') : '<tr><td colspan="4" class="empty">Aucun administrateur (impossible en principe : vous êtes ici).</td></tr>';
    renderUsers();
  }
  $('#adm-add').addEventListener('click', async () => {
    const v = $('#adm-mail').value.trim().toLowerCase(); if (!v) return;
    let uid = v, email = '';
    if (v.includes('@')) {
      const p = state.profiles.find(x => (x.email || '').toLowerCase() === v || (x.emailLower || '') === v);
      if (!p) { toast('Aucun utilisateur Alixo avec cet e-mail (il doit s’être connecté au moins une fois)'); return; }
      uid = p.uid; email = p.email || v;
    } else { const p = state.profiles.find(x => x.uid === v); email = p ? p.email || '' : ''; }
    await db.collection('admins').doc(uid).set({ email, addedAt: Date.now(), addedBy: me.email || me.uid });
    audit('admin.add', uid, { email });
    $('#adm-mail').value = ''; toast('Administrateur ajouté');
  });
  $('#adm-tbl').addEventListener('click', async e => {
    const b = e.target.closest('[data-ad]'); if (!b) return;
    const uid = b.closest('tr').dataset.uid; if (uid === me.uid) return;
    if (!await confirmBox('Retirer cet administrateur ?', 'Il perdra l’accès à ce panneau (ses cours ne sont pas touchés).', 'Retirer', true)) return;
    await db.collection('admins').doc(uid).delete(); audit('admin.remove', uid); toast('Administrateur retiré');
  });

  /* ---------------- présence (1.12) ----------------
     L'application écrit un battement toutes les 60 s : online, activity (library / editor / idle / background),
     activeAt (dernière action), lastSeen. Au-delà de 2 min 30 sans battement, l'utilisateur est considéré hors ligne. */
  const PRES_TTL = 150000;
  function presence(p) {
    const now = Date.now();
    const fresh = p.lastSeen && now - p.lastSeen < PRES_TTL && p.online !== false;
    if (!fresh) return { on: false, cls: 'off', label: p.lastSeen ? `Hors ligne · vu ${ago(p.lastSeen)}` : 'Jamais connecté', sub: '' };
    const act = p.activity || 'library';
    const idleMin = p.activeAt ? Math.round((now - p.activeAt) / 60000) : 0;
    if (act === 'idle' || idleMin >= 5) return { on: true, cls: 'on idle', label: 'Connecté · inactif', sub: `sans action depuis ${idleMin} min` };
    if (act === 'background') return { on: true, cls: 'on idle', label: 'Connecté · en arrière-plan', sub: 'fenêtre masquée' };
    if (act === 'editor') return { on: true, cls: 'on', label: 'Connecté · rédige une séance', sub: 'en cours…' };
    return { on: true, cls: 'on', label: 'Connecté · bibliothèque', sub: 'en cours…' };
  }
  function presenceHTML(p) { const pr = presence(p); return `<span class="pres ${pr.cls}" title="${esc(when(p.lastSeen))}">${esc(pr.label)}${pr.sub ? `<span class="sub">${esc(pr.sub)}</span>` : ''}</span>`; }

  /* ---------------- messages directs (1.12) ---------------- */
  const userLabel = p => p ? (p.name || p.pseudo || p.email || p.uid) : '';
  const findUser = q => { q = String(q || '').trim().toLowerCase(); if (!q) return null; return state.profiles.find(p => p.uid === q || (p.email || '').toLowerCase() === q) || state.profiles.find(p => (p.pseudo || '').toLowerCase() === q || (p.name || '').toLowerCase() === q) || state.profiles.find(p => String(userLabel(p) + ' ' + (p.email || '')).toLowerCase().includes(q)) || null; };
  const msgLogRef = db.collection('config').doc('msglog');
  async function sendMessage(targets, m) {
    const ts = Date.now(), by = me.email || me.uid;
    let batch = db.batch(), n = 0; const items = [];
    for (const p of targets) {
      const id = uid8() + uid8().slice(0, 4);
      batch.set(db.collection('inbox').doc(p.uid).collection('msgs').doc(id), { title: m.title, text: m.text, url: m.url, popup: !!m.popup, ts, by });
      items.push({ id, uid: p.uid, email: p.email || '', name: userLabel(p), title: m.title, ts, by, popup: !!m.popup });
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    if (n % 400) await batch.commit();
    audit('msg.send', targets.length === 1 ? targets[0].uid : '', { n, title: m.title, popup: !!m.popup });
    /* journal (200 derniers envois) */
    const log = state.msglog.concat(items).sort((a, b) => b.ts - a.ts).slice(0, 200);
    await msgLogRef.set({ items: log, updatedAt: ts });
    return n;
  }
  function openMsgModal(p) {
    modal(`<h3>Message à ${esc(userLabel(p))}</h3><p class="muted small">${esc(p.email || p.uid)} · ${esc(presence(p).label)}</p>
      <label class="field">Titre<input id="mm-title" maxlength="140" placeholder="Ex. Votre clé IA arrive demain"></label><label class="field">Texte<textarea id="mm-text" maxlength="1200" placeholder="Message (facultatif)"></textarea></label><label class="field">Lien (facultatif)<input id="mm-url" placeholder="https://…"></label>
      <label class="chk"><input type="checkbox" id="mm-popup"> Afficher en fenêtre (l’utilisateur doit la fermer)</label>
      <div class="modal-foot"><button class="btn ghost" data-close>Annuler</button><button class="btn" id="mm-ok">Envoyer</button></div>`, (c, close) => {
      c.querySelector('#mm-ok').onclick = async () => {
        const title = c.querySelector('#mm-title').value.trim(); if (!title) { toast('Un titre est nécessaire'); return; }
        try { await sendMessage([p], { title, text: c.querySelector('#mm-text').value.trim(), url: c.querySelector('#mm-url').value.trim(), popup: c.querySelector('#mm-popup').checked }); close(); toast('Message envoyé'); showView('msg'); }
        catch (e) { toast('Envoi impossible : ' + e.message); }
      };
    });
  }
  let msgReady = false;
  function msgEnsure() {
    if (!msgReady) {
      msgReady = true;
      $('#msg-to').addEventListener('input', () => { const p = findUser($('#msg-to').value); $('#msg-to-hint').textContent = p ? `→ ${userLabel(p)} · ${p.email || p.uid} · ${presence(p).label}` : ($('#msg-to').value.trim() ? 'Aucun utilisateur ne correspond' : ''); });
      $('#msg-all').addEventListener('change', () => { $('#msg-to').disabled = $('#msg-all').checked; });
      $('#msg-q').addEventListener('input', renderMsgLog);
      $('#msg-refresh').addEventListener('click', () => { msgStatus.clear(); renderMsgLog(); });
      $('#msg-send').addEventListener('click', async () => {
        const title = $('#msg-title').value.trim(); if (!title) { toast('Un titre est nécessaire'); return; }
        const all = $('#msg-all').checked;
        const targets = all ? filteredUsers().filter(p => !p.disabled) : [findUser($('#msg-to').value)].filter(Boolean);
        if (!targets.length) { toast(all ? 'Aucun utilisateur affiché dans l’onglet Utilisateurs' : 'Choisissez un destinataire'); return; }
        if (all && !await confirmBox('Envoyer à tout le monde ?', `${targets.length} utilisateur(s) recevront ce message.`, 'Envoyer')) return;
        $('#msg-send').disabled = true;
        try {
          const n = await sendMessage(targets, { title, text: $('#msg-text').value.trim(), url: $('#msg-url').value.trim(), popup: $('#msg-popup').checked });
          toast(`${n} message(s) envoyé(s)`); $('#msg-title').value = ''; $('#msg-text').value = ''; $('#msg-url').value = '';
        } catch (e) { toast('Envoi impossible : ' + e.message); }
        $('#msg-send').disabled = false;
      });
    }
    $('#msg-users').innerHTML = state.profiles.map(p => `<option value="${esc(p.email || p.uid)}">${esc(userLabel(p))}${p.pseudo ? ' @' + esc(p.pseudo) : ''}</option>`).join('');
    const n = filteredUsers().length; $('#msg-all-n').textContent = `${n} destinataire${n > 1 ? 's' : ''}`;
    renderMsgLog();
  }
  /* suivi (reçu / lu) : lu une fois par ligne affichée, « Actualiser » relit */
  const msgStatus = new Map();
  function renderMsgLog() {
    const tb = $('#msg-tbl tbody'); if (!tb || $('#v-msg').hidden) return;
    const q = ($('#msg-q').value || '').trim().toLowerCase();
    const items = state.msglog.filter(m => !q || [m.email, m.name, m.title, m.by].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 60);
    $('#msg-count').textContent = `${items.length} / ${state.msglog.length}`;
    const stHTML = st => !st ? '<span class="msg-status">…</span>' : st.gone ? '<span class="chip dim">supprimé</span>' : st.readAt ? `<span class="chip ok" title="${esc(when(st.readAt))}">lu ${ago(st.readAt)}</span>` : st.deliveredAt ? `<span class="chip warn" title="${esc(when(st.deliveredAt))}">reçu ${ago(st.deliveredAt)}${st.deliveredOn ? ' · ' + (st.deliveredOn === 'desktop' ? 'PC' : 'web') : ''}</span>` : '<span class="chip dim">en attente</span>';
    tb.innerHTML = items.length ? items.map(m => `<tr data-mid="${esc(m.id)}" data-muid="${esc(m.uid)}"><td><div class="u-main">${esc(m.name || m.email || m.uid)}</div><div class="u-sub">${esc(m.email || '')}</div></td><td><b>${esc(m.title)}</b>${m.popup ? ' <span class="chip dim">fenêtre</span>' : ''}<div class="muted small">par ${esc(m.by || '')}</div></td><td title="${esc(when(m.ts))}">${ago(m.ts)}</td><td class="st">${stHTML(msgStatus.get(m.id))}</td><td><div class="acts"><button data-ma="del" class="danger" title="Retirer le message de la boîte de l’utilisateur (s’il ne l’a pas encore reçu, il ne le verra pas)">Supprimer</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty">Aucun message envoyé.</td></tr>';
    for (const m of items) {
      if (msgStatus.has(m.id)) continue;
      msgStatus.set(m.id, null);
      db.collection('inbox').doc(m.uid).collection('msgs').doc(m.id).get().then(snap => {
        msgStatus.set(m.id, snap.exists ? snap.data() : { gone: true });
        const cell = tb.querySelector(`tr[data-mid="${m.id}"] td.st`); if (cell) cell.innerHTML = stHTML(msgStatus.get(m.id));
      }).catch(() => { msgStatus.set(m.id, { gone: true }); });
    }
  }
  $('#msg-tbl').addEventListener('click', async e => {
    const b = e.target.closest('[data-ma]'); if (!b) return;
    const tr = b.closest('tr'); const id = tr.dataset.mid, uid = tr.dataset.muid;
    if (!await confirmBox('Supprimer ce message ?', 'Il disparaît de la boîte de réception de l’utilisateur et du journal.', 'Supprimer', true)) return;
    try {
      await db.collection('inbox').doc(uid).collection('msgs').doc(id).delete().catch(() => {});
      await msgLogRef.set({ items: state.msglog.filter(m => m.id !== id), updatedAt: Date.now() });
      msgStatus.delete(id); toast('Message supprimé');
    } catch (err) { toast('Suppression impossible : ' + err.message); }
  });

  /* ---------------- explorateur de la base (1.12, lecture seule) ----------------
     Façon phpMyAdmin : collections racine, documents par pages de 50, recherche locale, filtre serveur,
     document complet avec ses sous-collections connues. Firestore ne liste pas les sous-collections
     depuis le navigateur : elles sont déclarées ici. */
  const DB_ROOTS = ['profiles', 'admins', 'keys', 'plans', 'codes', 'inbox', 'config', 'shares', 'mail', 'audit'];   // 1.26 : plus de users/ (contenu des cours)
  const DB_SUBS = { shares: ['log', 'presence'], inbox: ['msgs'] };   // 1.26 : plus de users/** ni de contenu de partage
  const DB_PAGE = 50;
  const dbs = { path: '', docs: [], last: null, where: null, done: false, busy: false, ready: false };
  /* sous-collections connues d'un document : users/UID → docs, imgs, files ; users/UID/files/ID → chunks */
  const subsFor = docPath => { const segs = docPath.split('/'); if (segs.length === 2) return DB_SUBS[segs[0]] || []; if (segs.length === 4) return DB_SUBS[segs[0] + '/*/' + segs[2]] || []; return []; };
  const parseVal = v => { v = String(v).trim(); if (v === 'true') return true; if (v === 'false') return false; if (v === 'null') return null; if (/^-?\d+(\.\d+)?$/.test(v)) return +v; if (/^[\[{"]/.test(v)) { try { return JSON.parse(v); } catch { /* texte */ } } return v; };
  const fmtCell = v => { if (v === null || v === undefined) return '<span class="t-null">null</span>'; if (typeof v === 'number') return `<span class="t-num">${v}</span>`; if (typeof v === 'boolean') return `<span class="t-bool">${v}</span>`; if (typeof v === 'string') return esc(v.length > 80 ? v.slice(0, 80) + '…' : v); if (Array.isArray(v)) return `<span class="t-obj">[${v.length}]</span> ${esc(JSON.stringify(v).slice(0, 60))}`; if (v && typeof v.toDate === 'function') return esc(v.toDate().toISOString()); if (typeof v === 'object') return `<span class="t-obj">{${Object.keys(v).length}}</span> ${esc(JSON.stringify(v).slice(0, 60))}`; return esc(String(v)); };
  const jsonHL = j => esc(j).replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, (m, str, colon, bool, nul, num) => str ? (colon ? `<span class="js-k">${str}</span>${colon}` : `<span class="js-s">${str}</span>`) : bool ? `<span class="js-b">${bool}</span>` : nul ? `<span class="js-x">${nul}</span>` : `<span class="js-n">${num}</span>`);
  const plain = v => { if (v && typeof v.toDate === 'function') return v.toDate().toISOString(); if (Array.isArray(v)) return v.map(plain); if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o; } return v; };
  function dbEnsure() {
    if (dbs.ready) return;
    dbs.ready = true;
    $('#db-cols').innerHTML = DB_ROOTS.map(c => `<button data-col="${c}">${c}</button>`).join('');
    $('#db-cols').addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (b) dbOpen(b.dataset.col); });
    $('#db-go').addEventListener('click', () => { const p = $('#db-path').value.trim().replace(/^\/+|\/+$/g, ''); if (!p) return; if (p.split('/').length % 2 === 0) dbOpenDoc(p); else dbOpen(p); });
    $('#db-path').addEventListener('keydown', e => { if (e.key === 'Enter') $('#db-go').click(); });
    $('#db-q').addEventListener('input', dbRenderTable);
    $('#db-filter').addEventListener('click', () => { const f = $('#db-wf').value.trim(); if (!f) { toast('Indiquez un champ'); return; } dbOpen(dbs.path, { field: f, op: $('#db-wo').value, value: parseVal($('#db-wv').value) }); });
    $('#db-reset').addEventListener('click', () => { $('#db-wf').value = ''; $('#db-wv').value = ''; $('#db-q').value = ''; dbOpen(dbs.path); });
    $('#db-more').addEventListener('click', () => dbLoad());
    $('#db-export').addEventListener('click', () => { if (!dbs.docs.length) { toast('Rien à exporter'); return; } audit('db.export', dbs.path, { n: dbs.docs.length }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(dbs.docs.map(d => Object.assign({ _id: d.id, _path: d.path }, plain(d.data))), null, 2)], { type: 'application/json' })); a.download = `alixo-${dbs.path.replace(/\//g, '_')}-${new Date().toISOString().slice(0, 10)}.json`; a.click(); });
    $('#db-tbl').addEventListener('click', e => { const tr = e.target.closest('tr[data-path]'); if (tr) dbOpenDoc(tr.dataset.path); });
    $('#db-crumbs').addEventListener('click', e => { const b = e.target.closest('[data-cp]'); if (!b) return; const p = b.dataset.cp; if (!p) return; if (p.split('/').length % 2 === 0) dbOpenDoc(p); else dbOpen(p); });
    dbOpen('profiles');
  }
  function dbCrumbs(path) {
    const segs = path.split('/'); let acc = '';
    $('#db-crumbs').innerHTML = '<button data-cp="">racine</button>' + segs.map((sg, i) => { acc += (i ? '/' : '') + sg; const last = i === segs.length - 1; return `<span class="sep">/</span>${last ? `<span class="cur">${esc(sg)}</span>` : `<button data-cp="${esc(acc)}">${esc(sg)}</button>`}`; }).join('');
    $$('#db-cols button').forEach(b => b.classList.toggle('on', b.dataset.col === segs[0]));
    $('#db-path').value = path;
  }
  function dbQuery() {
    let q = db.collection(dbs.path);
    if (dbs.where) q = q.where(dbs.where.field, dbs.where.op, dbs.where.value);
    else q = q.orderBy(firebase.firestore.FieldPath.documentId());
    if (dbs.last) q = q.startAfter(dbs.last);
    return q.limit(DB_PAGE);
  }
  async function dbOpen(path, where) {
    if (!path) return;
    dbs.path = path; dbs.docs = []; dbs.last = null; dbs.where = where || null; dbs.done = false;
    if (path !== 'audit') audit('db.list', path, where ? { where: `${where.field} ${where.op} ${JSON.stringify(where.value)}` } : null);
    if (!where) { $('#db-wf').value = ''; $('#db-wv').value = ''; }
    dbCrumbs(path);
    $('#db-tbl thead').innerHTML = ''; $('#db-tbl tbody').innerHTML = '';
    $('#db-status').textContent = 'Lecture…';
    dbCount(path, where);
    await dbLoad();
  }
  let dbTotal = null;
  async function dbCount(path, where) {
    dbTotal = null;
    try {
      let q = db.collection(path); if (where) q = q.where(where.field, where.op, where.value);
      if (typeof q.count !== 'function') return;
      const s = await q.count().get(); dbTotal = s.data().count; dbStatus();
    } catch { dbTotal = null; }
  }
  function dbStatus() {
    const n = dbs.docs.length;
    $('#db-status').innerHTML = `<b>${esc(dbs.path)}</b> · ${n} document${n > 1 ? 's' : ''} chargé${n > 1 ? 's' : ''}${dbTotal !== null ? ` sur <b>${dbTotal}</b>` : ''}${dbs.where ? ` · filtre <code>${esc(dbs.where.field)} ${esc(dbs.where.op)} ${esc(JSON.stringify(dbs.where.value))}</code>` : ''}${dbs.done ? ' · fin de la collection' : ''}`;
    $('#db-more').hidden = dbs.done || dbs.busy;
  }
  async function dbLoad() {
    if (dbs.busy || dbs.done) return;
    dbs.busy = true; $('#db-more').disabled = true;
    try {
      const snap = await dbQuery().get();
      snap.forEach(d => dbs.docs.push({ id: d.id, path: d.ref.path, data: d.data() }));
      dbs.last = snap.docs[snap.docs.length - 1] || dbs.last;
      if (snap.size < DB_PAGE) dbs.done = true;
      dbRenderTable();
    } catch (e) {
      $('#db-status').innerHTML = `<span class="err">Lecture impossible : ${esc(e.message)}</span>` + (/index/i.test(e.message) ? ' <span class="muted">(ce filtre demande un index : le lien dans la console du navigateur le crée)</span>' : /permission/i.test(e.message) ? ' <span class="muted">(règles Firestore : republiez firestore.rules, SETUP-COMPTES.md § 6)</span>' : '');
      console.error(e);
    }
    dbs.busy = false; $('#db-more').disabled = false; dbStatus();
  }
  function dbRenderTable() {
    const q = ($('#db-q').value || '').trim().toLowerCase();
    const rows = dbs.docs.filter(d => !q || d.id.toLowerCase().includes(q) || JSON.stringify(plain(d.data)).toLowerCase().includes(q));
    const cols = []; const seen = new Set();
    for (const d of rows) for (const k of Object.keys(d.data)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
    cols.sort((a, b) => a.localeCompare(b));
    const shown = cols.slice(0, 14);
    $('#db-tbl thead').innerHTML = `<tr><th>id</th>${shown.map(c => `<th>${esc(c)}</th>`).join('')}${cols.length > shown.length ? `<th>+${cols.length - shown.length} champs</th>` : ''}</tr>`;
    $('#db-tbl tbody').innerHTML = rows.length ? rows.map(d => `<tr data-path="${esc(d.path)}"><td class="id">${esc(d.id)}</td>${shown.map(c => `<td title="${esc(typeof d.data[c] === 'string' ? d.data[c].slice(0, 400) : JSON.stringify(plain(d.data[c]) ?? null).slice(0, 400))}">${c in d.data ? fmtCell(d.data[c]) : ''}</td>`).join('')}${cols.length > shown.length ? '<td class="muted">…</td>' : ''}</tr>`).join('') : `<tr><td colspan="${shown.length + 2}" class="empty">${dbs.docs.length ? 'Aucun document chargé ne contient ce texte.' : 'Collection vide (ou pas encore lue).'}</td></tr>`;
    dbStatus();
  }
  async function dbOpenDoc(path) {
    const segs = path.split('/'); const col = segs.slice(0, -1).join('/');
    modal(`<h3 style="font-family:ui-monospace,Consolas,monospace; font-size:14px; word-break:break-all">${esc(path)}</h3><div id="dbd-body" class="muted">Lecture…</div><div class="modal-foot"><button class="btn ghost small" id="dbd-copy">Copier le JSON</button><button class="btn ghost small" id="dbd-open-col">Ouvrir la collection</button><button class="btn ghost" data-close>Fermer</button></div>`, async (c, close) => {
      c.closest('.modal-card').classList.add('db-doc');
      c.querySelector('#dbd-open-col').onclick = () => { close(); dbOpen(col); };
      try {
        audit('db.read', path);
        const snap = await db.doc(path).get();
        if (!snap.exists) { c.querySelector('#dbd-body').innerHTML = '<p class="err">Ce document n’existe pas (une sous-collection peut exister sans document parent).</p>' + subsHTML(path); bindSubs(c, close, path); return; }
        const data = plain(snap.data());
        let decoded = '';
        for (const k of ['data', 'meta']) if (typeof data[k] === 'string' && /^[\[{]/.test(data[k])) { try { const j = JSON.parse(data[k]); decoded += `<h3 style="margin-top:12px">Champ <code>${k}</code> décodé (JSON)</h3><pre>${jsonHL(JSON.stringify(j, null, 2).slice(0, 200000))}</pre>`; } catch { /* pas du JSON */ } }
        const json = JSON.stringify(data, null, 2);
        c.querySelector('#dbd-body').innerHTML = `<div class="muted small">${Object.keys(data).length} champ(s) · ${fmtBytes(json.length)}</div>${subsHTML(path)}<pre>${jsonHL(json.length > 200000 ? json.slice(0, 200000) + '\n… (tronqué)' : json)}</pre>${decoded}`;
        c.querySelector('#dbd-copy').onclick = async () => { try { await navigator.clipboard.writeText(json); toast('JSON copié'); } catch { /* presse-papiers indisponible */ } };
        bindSubs(c, close, path);
      } catch (e) { c.querySelector('#dbd-body').innerHTML = `<p class="err">Lecture impossible : ${esc(e.message)}</p>`; }
    });
    function subsHTML(p) { const subs = subsFor(p); return subs.length ? `<div class="subs">Sous-collections : ${subs.map(sc => `<button class="btn ghost small" data-sub="${esc(p + '/' + sc)}">${esc(sc)}</button>`).join('')}</div>` : ''; }
    function bindSubs(c, close, p) { c.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => { close(); dbOpen(b.dataset.sub); })); }
  }
})();
