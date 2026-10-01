/* ============================================================
   Alixo — liaison avec le panneau d'administration (Firestore)
   - config/public        → annonces, dernière version (lu par tout compte connecté)
   - keys/{uid}           → clé API Google (Gemini) attribuée par l'administrateur
   - profiles/{uid}       → `disabled` : compte suspendu (posé par l'administrateur) ;
                            présence (`online`, `activity`, `lastSeen`) écrite ici (1.12)
   - inbox/{uid}/msgs/{id} → messages directs de l'administrateur (1.12)
   - plans/{uid}          → Alixo+ (1.16) : { plus, until, since, by, note } posé par l'administrateur ;
                            config/public.plusPrice / plusUrl / plusNote : l'offre affichée dans l'application
   Règles Firestore : voir SETUP-COMPTES.md § 6 (panneau admin).
   Chargé APRÈS app.js, notify.js. Sans compte : inactif.
   ============================================================ */
'use strict';

window.AlixoCloud = (() => {
  const A = window.AlixoAuth;
  const acc = A && A.isConfigured && A.account();
  if (!acc || !window.firebase || !firebase.firestore) return { enabled: false, adminKey: () => '' };
  const uid = acc.uid;
  const db = firebase.firestore();
  const ADMIN_KEY_LS = 'alixo.geminiKey.admin' + A.storageSuffix();
  const ADMIN_KEY_AT_LS = 'alixo.geminiKey.adminAt' + A.storageSuffix();   // horodatage de la dernière attribution notifiée
  const adminKey = () => { try { return localStorage.getItem(ADMIN_KEY_LS) || ''; } catch { return ''; } };
  const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* stockage indisponible */ } };
  const notify = n => { if (window.AlixoNotify) AlixoNotify.push(n); };
  const cmpVer = (a, b) => { const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  const permErr = err => /permission|insufficient/i.test(String(err && err.message));

  /* ---------------- clé IA attribuée ----------------
     Utilisée si l'utilisateur n'a pas la sienne (ou si l'administrateur l'impose).
     Chaque attribution (nouvel `assignedAt`) est notifiée, même si c'est la même clé
     qu'auparavant — avant 1.12 une clé réattribuée passait sans notification. */
  db.collection('keys').doc(uid).onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null;
    const key = d && typeof d.gemini === 'string' ? d.gemini.trim() : '';
    const prev = adminKey();
    const at = d && +d.assignedAt ? String(+d.assignedAt) : (key ? 'k' + key.slice(-6) : '');
    const notifiedAt = lsGet(ADMIN_KEY_AT_LS);
    lsSet(ADMIN_KEY_LS, key);
    const own = lsGet('alixo.geminiKey');
    const source = lsGet('alixo.geminiKey.source');
    if (key) {
      const fresh = at !== notifiedAt;               // nouvelle attribution (ou première lecture sur cet appareil)
      const adopt = !own || d.force || own === prev || source === 'admin';
      if (adopt && own !== key) { lsSet('alixo.geminiKey', key); lsSet('alixo.geminiKey.source', 'admin'); }
      if (fresh) {
        lsSet(ADMIN_KEY_AT_LS, at);
        if (adopt) notify({ id: 'key_' + at, kind: 'key', title: 'Une clé d’intelligence artificielle vous a été attribuée', text: (d.note ? d.note + ' — ' : '') + 'La correction et la mise en forme par IA sont actives, sans rien configurer.', action: { type: 'settings' } });
        else notify({ id: 'key_' + at, kind: 'key', title: 'Une clé d’intelligence artificielle vous a été proposée', text: (d.note ? d.note + ' — ' : '') + 'Vous utilisez déjà votre clé personnelle : elle est conservée. Pour passer sur la clé fournie, effacez la vôtre dans Paramètres › Correction par IA.', action: { type: 'settings' } });
      }
    } else if (prev) {
      lsSet(ADMIN_KEY_AT_LS, '');
      if (own === prev) { lsSet('alixo.geminiKey', ''); lsSet('alixo.geminiKey.source', ''); notify({ kind: 'key', title: 'La clé IA attribuée a été retirée', text: 'Vous pouvez saisir votre propre clé gratuite dans Paramètres › Correction par IA.', action: { type: 'settings' } }); }
    }
  }, err => { if (!permErr(err)) console.error('Cloud (clé) :', err); });

  /* ---------------- annonces de l'administrateur + version disponible ---------------- */
  db.collection('config').doc('public').onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null; if (!d) return;
    const anns = Array.isArray(d.announcements) ? d.announcements : [];
    for (const a of anns) {
      if (!a || !a.id || !a.title) continue;
      if (a.until && Date.now() > +a.until) continue;
      if (a.audience && a.audience !== 'all') {
        const p = state.settings.profil; const specs = p && Array.isArray(p.specialites) ? p.specialites : [];
        if (a.audience === 'sante' ? !specs.some(k => AlixoMed.HEALTH_KEYS.includes(k)) : !specs.includes(a.audience)) continue;
      }
      notify({ id: 'ann_' + a.id, kind: 'admin', title: a.title, text: a.text || '', ts: +a.ts || Date.now(), action: a.url ? { type: 'url', url: a.url } : null, silent: !!a.silent });
    }
    if (window.AlixoApp && AlixoApp.setPlusOffer) AlixoApp.setPlusOffer({ price: d.plusPrice || '', url: d.plusUrl || '', note: d.plusNote || '' });
    if (d.latestVersion && window.AlixoApp && cmpVer(d.latestVersion, AlixoApp.version) > 0 && !(window.alixoDesktop && alixoDesktop.onUpdate)) {
      notify({ id: 'latest_' + d.latestVersion, kind: 'update', title: `Alixo ${d.latestVersion} est disponible`, text: d.latestNote || 'Téléchargez la nouvelle version depuis la page d’Alixo.', action: { type: 'url', url: d.downloadUrl || 'https://github.com/Fayze-Kadox/alixo/releases' } });
    }
    /* 1.18 : fenêtre de mise à jour (au démarrage puis toutes les 6 h) ; bloquante sous la version minimale */
    updInfo = d.latestVersion && window.AlixoApp && cmpVer(d.latestVersion, AlixoApp.version) > 0
      ? { version: d.latestVersion, note: d.latestNote || '', url: d.downloadUrl || '', forced: !!(d.minVersion && cmpVer(d.minVersion, AlixoApp.version) > 0) }
      : null;
    if (!updInfo && window.AlixoApp && AlixoApp.closeUpdatePopup && !updReady) AlixoApp.closeUpdatePopup();
    updPrompt();
  }, err => { if (!permErr(err)) console.error('Cloud (config) :', err); });
  let updInfo = null, updReady = false;
  function updPrompt() {
    if (!updInfo || !window.AlixoApp || !AlixoApp.showUpdatePopup) return;
    if ($('#obov') || $('#authov') && !$('#authov').hidden) { setTimeout(updPrompt, 15000); return; }   // après le questionnaire de bienvenue / la connexion
    AlixoApp.showUpdatePopup(Object.assign({}, updInfo, updReady ? { state: 'downloaded' } : {}));
  }
  setInterval(updPrompt, 6 * 3600000);
  if (window.alixoDesktop && alixoDesktop.onUpdate) alixoDesktop.onUpdate(info => {
    if (!info || info.state !== 'downloaded') return;
    updReady = true;
    if (!updInfo) updInfo = { version: info.version || '', note: '', url: '', forced: false };
    if (info.version) updInfo.version = info.version;
    updPrompt();
  });

  /* ---------------- messages directs de l'administrateur (1.12) ----------------
     inbox/{uid}/msgs/{id} → { title, text, url, ts, by, popup }. Reçus en direct dans la cloche
     (et en fenêtre si l'administrateur l'a demandé) ; l'application note la réception et la lecture. */
  const MSG_SEEN_LS = 'alixo.inbox.seen' + A.storageSuffix();
  let msgSeen = {}; try { msgSeen = JSON.parse(lsGet(MSG_SEEN_LS) || '{}') || {}; } catch { msgSeen = {}; }
  const inboxRef = db.collection('inbox').doc(uid).collection('msgs');
  function showMessagePopup(id, m) {
    if ($('#msgov')) $('#msgov').remove();
    const ov = document.createElement('div'); ov.id = 'msgov';
    ov.innerHTML = `<div class="ob-card msg-card"><div class="ob-step">Message de l’administrateur d’Alixo${m.by ? ' · ' + esc(m.by) : ''}</div><h2 class="ob-title">${esc(m.title || 'Message')}</h2>
      <p class="ob-sub msg-text">${esc(m.text || '')}</p>
      <div class="ob-foot"><span class="msg-when">${new Date(+m.ts || Date.now()).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span><span>${m.url ? `<button class="cta ghost" id="msg-url" type="button">Ouvrir le lien</button> ` : ''}<button class="cta ob-next" id="msg-ok" type="button">J’ai compris</button></span></div></div>`;
    document.body.appendChild(ov);
    const done = () => { ov.remove(); markRead(id); };
    ov.querySelector('#msg-ok').addEventListener('click', done);
    const u = ov.querySelector('#msg-url'); if (u) u.addEventListener('click', () => { if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(m.url); else window.open(m.url, '_blank', 'noopener'); done(); });
  }
  function markRead(id) {
    if (msgSeen[id] === 'read') return;
    msgSeen[id] = 'read'; lsSet(MSG_SEEN_LS, JSON.stringify(msgSeen));
    inboxRef.doc(id).set({ readAt: Date.now() }, { merge: true }).catch(() => {});
  }
  inboxRef.onSnapshot(snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'removed') return;
      const m = ch.doc.data(); const id = ch.doc.id;
      if (!m || !m.title) return;
      if (ch.type === 'modified' && msgSeen[id]) return;        // accusés de réception / lecture : rien à faire
      if (msgSeen[id]) return;                                  // déjà reçu sur cet appareil
      msgSeen[id] = 'got'; lsSet(MSG_SEEN_LS, JSON.stringify(msgSeen));
      if (m.ts && Date.now() - +m.ts > 30 * 86400000) return;   // nouvel appareil : les vieux messages ne ressortent pas
      if (!m.deliveredAt) inboxRef.doc(id).set({ deliveredAt: Date.now(), deliveredOn: window.alixoDesktop ? 'desktop' : 'web' }, { merge: true }).catch(() => {});
      const msg = { title: m.title, text: m.text || '', url: m.url || '', ts: +m.ts || Date.now(), by: m.by || '' };
      notify({ id: 'msg_' + id, kind: 'message', title: m.title, text: m.text || '', ts: msg.ts, action: { type: 'msg', id, msg }, silent: !!m.popup });
      if (m.popup) showMessagePopup(id, msg);
    });
  }, err => { if (!permErr(err)) console.error('Cloud (messages) :', err); });

  /* ---------------- Alixo+ (1.16) : abonnement posé par l'administrateur ----------------
     plans/{uid} → { plus: true, until: 0 | horodatage de fin, since, by, note }. Absent ou plus: false : formule gratuite.
     L'application garde le dernier état connu en local (hors ligne, démarrage) ; toute activation est notifiée. */
  const PLAN_AT_LS = 'alixo.plus.notifiedAt' + A.storageSuffix();
  db.collection('plans').doc(uid).onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null;
    if (window.AlixoApp && AlixoApp.setPlan) AlixoApp.setPlan(d);
    const active = d && d.plus && (!d.until || +d.until > Date.now());
    const at = active ? String(+d.since || 1) : '';
    if (active && lsGet(PLAN_AT_LS) !== at) {
      lsSet(PLAN_AT_LS, at);
      notify({ id: 'plus_' + at, kind: 'key', title: 'Alixo+ est activé sur votre compte', text: (d.note ? d.note + ' — ' : '') + (d.until ? `Jusqu’au ${new Date(+d.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. ` : '') + 'Tous les thèmes, toutes les polices, l’IA, les tâches et le stockage au-delà de 3 Go sont ouverts.', action: { type: 'settings' } });
    } else if (!active && lsGet(PLAN_AT_LS)) lsSet(PLAN_AT_LS, '');
  }, err => { if (!permErr(err)) console.error('Cloud (Alixo+) :', err); });

  /* ---------------- compte suspendu par l'administrateur ---------------- */
  db.collection('profiles').doc(uid).onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null;
    if (!d || !d.disabled) { const ov = $('#suspov'); if (ov) ov.remove(); return; }
    if ($('#suspov')) return;
    const ov = document.createElement('div'); ov.id = 'suspov';
    ov.innerHTML = `<div class="ob-card"><div class="ob-step">Compte</div><h2 class="ob-title">Accès suspendu</h2>
      <p class="ob-sub">${esc(d.disabledReason || 'Votre compte a été suspendu par l’administrateur d’Alixo.')}<br>Vos cours restent enregistrés sur cet appareil.</p>
      <div class="ob-foot"><span></span><button class="cta ob-next" id="susp-out" type="button">Se déconnecter</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#susp-out').addEventListener('click', () => A.signOut());
  }, () => { /* profil illisible : on ignore */ });

  /* ---------------- présence et statistiques d'usage (panneau admin) ----------------
     Un « battement » toutes les 60 s tant que l'application est ouverte : dernière ouverture, version,
     nombre de séances, activité en cours (bibliothèque / rédaction / inactif). Aucun contenu de cours. */
  const profRef = db.collection('profiles').doc(uid);
  const HEART_MS = 60000, IDLE_MS = 5 * 60000;
  let lastInput = Date.now(), lastBeat = 0, ended = false;
  const activity = () => {
    if (Date.now() - lastInput > IDLE_MS) return 'idle';
    if (document.hidden) return 'background';
    return document.body.classList.contains('mode-editor') ? 'editor' : 'library';
  };
  function beat(extra) {
    if (ended) return;
    lastBeat = Date.now();
    try {
      profRef.set(Object.assign({ uid, email: (acc.email || '').toLowerCase(), name: acc.name || '', lastSeen: Date.now(), online: true, activity: activity(), activeAt: lastInput, version: window.AlixoApp ? AlixoApp.version : '', platform: window.alixoDesktop ? 'desktop' : 'web', nDocs: state.docs.length, specialites: (state.settings.profil && state.settings.profil.specialites) || [] }, extra || {}), { merge: true }).catch(() => {});
    } catch { /* hors ligne */ }
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  beat();
  setInterval(() => { if (!document.hidden || Date.now() - lastBeat > 3 * HEART_MS) beat(); }, HEART_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastInput = Date.now(); beat(); } });
  const bye = () => { if (ended) return; ended = true; try { profRef.set({ online: false, activity: 'offline', lastSeen: Date.now() }, { merge: true }).catch(() => {}); } catch { /* ignoré */ } };
  window.addEventListener('pagehide', bye);
  window.addEventListener('beforeunload', bye);

  /* ---------------- clé d'activation Alixo+ (1.19) ----------------
     codes/{code} → { kind: 'plus', months (0 = sans fin), label, createdAt, by, usedBy, usedAt, usedEmail }
     généré dans le panneau admin. L'utilisateur marque la clé comme utilisée puis écrit son propre plan ;
     les règles Firestore vérifient que la clé existe, qu'elle est à lui et que la durée correspond. */
  async function redeemCode(code) {
    const ref = db.collection('codes').doc(code);
    let snap;
    try { snap = await ref.get(); } catch (e) { return { ok: false, msg: 'Vérification impossible pour l’instant (' + (e && e.message || 'hors ligne') + ').' }; }
    if (!snap.exists) return { ok: false, msg: 'Clé inconnue : vérifiez la saisie (lettres et chiffres, tirets compris).' };
    const c = snap.data() || {};
    if (c.kind !== 'plus') return { ok: false, msg: 'Cette clé n’est pas une clé Alixo+.' };
    if (c.usedBy && c.usedBy !== uid) return { ok: false, msg: 'Cette clé a déjà été utilisée sur un autre compte.' };
    if (c.usedBy === uid && c.applied) return { ok: false, msg: 'Vous avez déjà activé cette clé.' };
    const months = Math.max(0, +c.months || 0);
    let cur = null;
    try { const ps = await db.collection('plans').doc(uid).get(); cur = ps.exists ? ps.data() : null; } catch { cur = null; }
    const active = !!(cur && cur.plus && (!cur.until || +cur.until > Date.now()));
    if (active && !cur.until) return { ok: false, msg: 'Alixo+ est déjà actif sans limite de durée sur ce compte : gardez cette clé pour plus tard.' };
    const base = active ? +cur.until : Date.now();
    let until = 0;
    if (months) { const d = new Date(base); d.setMonth(d.getMonth() + months); until = d.getTime(); }
    try {
      if (c.usedBy !== uid) await ref.update({ usedBy: uid, usedAt: Date.now(), usedEmail: (acc.email || '').toLowerCase() });
      await db.collection('plans').doc(uid).set({ plus: true, until, since: active && cur.since ? cur.since : Date.now(), updatedAt: Date.now(), by: 'code', code, note: c.label || '', email: (acc.email || '').toLowerCase() });
      await ref.update({ applied: true }).catch(() => {});
    } catch (e) { return { ok: false, msg: 'Activation refusée (' + (e && e.message || 'erreur') + '). Réessayez ou contactez l’administrateur.' }; }
    return { ok: true, msg: until ? `Alixo+ activé jusqu’au ${new Date(until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Alixo+ activé sans limite de durée' };
  }

  return { enabled: true, adminKey, beat, showMessage: showMessagePopup, redeemCode };
})();
