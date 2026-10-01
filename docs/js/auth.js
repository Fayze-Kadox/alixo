/* ============================================================
   Alixo — comptes en ligne (Firebase Auth)
   Chargé AVANT app.js : fournit de façon synchrone la « suite »
   de stockage local du compte courant (les cours de chaque compte
   sont isolés), puis gère l'écran de connexion et la session.
   ============================================================ */
'use strict';

window.AlixoAuth = (() => {
  const SESSION_KEY = 'alixo.session.v1';   // dernier compte connu (lecture synchrone au boot)
  const LOCAL_MODE_KEY = 'alixo.localmode'; // « continuer sans compte » choisi
  const BASE_KEY = 'alixo.v1';

  const CONFIG = window.ALIXO_FIREBASE_CONFIG || null;
  const GOOGLE_DESKTOP = window.ALIXO_GOOGLE_DESKTOP_CLIENT || null;
  const isDesktop = !!window.alixoDesktop;

  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { cached = null; }
  if (cached && !cached.uid) cached = null;

  let auth = null;
  if (CONFIG && window.firebase) {
    try {
      firebase.initializeApp(CONFIG);
      auth = firebase.auth();
      auth.languageCode = 'fr';
    } catch (e) { console.error('Firebase init impossible :', e); }
  }

  /* ---------- clé de stockage du compte courant (synchrone) ---------- */
  function storageSuffix() { return cached ? '::' + cached.uid : ''; }
  /* compte créé sur cet appareil : le questionnaire de bienvenue (niveau, spécialités) n'est posé qu'à ce moment-là,
     jamais lors d'une simple connexion sur un autre ordinateur ou téléphone (1.15) */
  const NEW_KEY = 'alixo.newAccount';
  function markNewAccount(user) { try { if (user && user.uid) localStorage.setItem(NEW_KEY, user.uid); } catch { /* stockage indisponible */ } }
  function isNewAccount() { try { return !!cached && localStorage.getItem(NEW_KEY) === cached.uid; } catch { return false; } }
  function clearNewAccount() { try { localStorage.removeItem(NEW_KEY); } catch { /* */ } }

  /* Premier login sur cet appareil : les cours créés « sans compte »
     sont adoptés par le compte (copie, l'original est conservé). */
  function adoptGuestData(uid) {
    const userKey = BASE_KEY + '::' + uid;
    if (localStorage.getItem(userKey) !== null) return;
    const guest = localStorage.getItem(BASE_KEY);
    if (guest !== null) localStorage.setItem(userKey, guest);
  }

  function setSession(user) {
    cached = {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || (user.email || '').split('@')[0],
      provider: (user.providerData[0] && user.providerData[0].providerId) || 'password'
    };
    adoptGuestData(user.uid);
    localStorage.setItem(SESSION_KEY, JSON.stringify(cached));
    localStorage.removeItem(LOCAL_MODE_KEY);
  }

  /* ---------- messages d'erreur en français ---------- */
  const ERRORS = {
    'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail.',
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
    'auth/user-not-found': 'Aucun compte avec cet e-mail.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/invalid-login-credentials': 'E-mail ou mot de passe incorrect.',
    'auth/too-many-requests': 'Trop de tentatives — réessayez dans quelques minutes.',
    'auth/network-request-failed': 'Pas de connexion internet. Vos cours restent disponibles hors ligne.',
    'auth/popup-closed-by-user': 'Fenêtre de connexion fermée.',
    'auth/missing-password': 'Saisissez un mot de passe.'
  };
  const frError = e => ERRORS[e && e.code] || (e && e.message) || 'Une erreur est survenue.';

  /* ============================================================
     Écran de connexion (overlay plein écran, style « Liquid Glass »)
     ============================================================ */
  let ov = null;

  function buildOverlay() {
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'authov';
    ov.innerHTML = `
      <div class="auth-card glass">
        <div class="auth-logo"><span class="logo-mark"><img src="logo.png" alt="Alixo"></span></div>
        <h2 class="auth-title">Bienvenue sur Alixo</h2>
        <p class="auth-sub">Connectez-vous pour retrouver vos cours sur tous vos appareils.</p>

        <div class="auth-error" id="auth-error" hidden></div>

        <div class="auth-providers">
          <button id="auth-google" class="auth-pbtn">
            <svg viewBox="0 0 24 24" class="gicon"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3a7.24 7.24 0 0 1-10.79-3.8H1.28v3.09A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.98 11.98 0 0 0 1.28 6.62l3.99 3.09A7.2 7.2 0 0 1 12 4.75Z"/></svg>
            Continuer avec Google
          </button>
          <button id="auth-apple" class="auth-pbtn">
            <svg viewBox="0 0 24 24" class="aicon"><path fill="currentColor" d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.86-1.6.02-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.4 1.2-.05 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.78 1.3-.02 2.2-1.2 3-2.4.94-1.4 1.3-2.7 1.33-2.8-.03-.01-2.55-1-2.58-3.9ZM14.3 5.1c.66-.8 1.1-1.9 1-3.1-.95.04-2.1.64-2.8 1.44-.6.7-1.2 1.85-1 2.93 1.06.08 2.13-.54 2.8-1.3Z"/></svg>
            Continuer avec Apple
          </button>
        </div>

        <div class="auth-or"><span>ou par e-mail</span></div>

        <form id="auth-form" novalidate>
          <input id="auth-name" class="auth-in" type="text" placeholder="Prénom (ou pseudo)" autocomplete="name" hidden>
          <input id="auth-email" class="auth-in" type="email" placeholder="Adresse e-mail" autocomplete="email" required>
          <input id="auth-pass" class="auth-in" type="password" placeholder="Mot de passe" autocomplete="current-password" required>
          <button id="auth-submit" class="cta auth-cta" type="submit">Se connecter</button>
        </form>

        <div class="auth-links">
          <button id="auth-toggle" class="auth-link">Créer un compte</button>
          <button id="auth-forgot" class="auth-link">Mot de passe oublié ?</button>
        </div>

        <div class="auth-foot">
          <button id="auth-offline" class="auth-link subtle">Continuer sans compte (local uniquement)</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    let mode = 'login'; // 'login' | 'signup'
    const $a = s => ov.querySelector(s);
    const err = msg => { const e = $a('#auth-error'); e.textContent = msg || ''; e.hidden = !msg; };
    const busy = on => { ov.classList.toggle('busy', !!on); $a('#auth-submit').disabled = !!on; };

    function setMode(m) {
      mode = m; err('');
      $a('#auth-name').hidden = m !== 'signup';
      $a('#auth-pass').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
      $a('#auth-submit').textContent = m === 'signup' ? 'Créer mon compte' : 'Se connecter';
      $a('#auth-toggle').textContent = m === 'signup' ? 'J’ai déjà un compte' : 'Créer un compte';
      $a('.auth-sub').textContent = m === 'signup'
        ? 'Créez un compte pour synchroniser vos cours sur tous vos appareils.'
        : 'Connectez-vous pour retrouver vos cours sur tous vos appareils.';
    }
    $a('#auth-toggle').addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));

    async function done(user) { setSession(user); location.reload(); }

    $a('#auth-form').addEventListener('submit', async e => {
      e.preventDefault(); err('');
      if (!auth) { err('Service en ligne non configuré (voir SETUP-COMPTES.md).'); return; }
      const email = $a('#auth-email').value.trim();
      const pass = $a('#auth-pass').value;
      if (!email) { err('Saisissez votre adresse e-mail.'); return; }
      if (!pass) { err('Saisissez un mot de passe.'); return; }
      busy(true);
      try {
        let cred;
        if (mode === 'signup') {
          cred = await auth.createUserWithEmailAndPassword(email, pass);
          markNewAccount(cred.user);
          const name = $a('#auth-name').value.trim();
          if (name) { await cred.user.updateProfile({ displayName: name }); }
        } else {
          cred = await auth.signInWithEmailAndPassword(email, pass);
        }
        await done(cred.user);
      } catch (ex) { err(frError(ex)); }
      busy(false);
    });

    $a('#auth-forgot').addEventListener('click', async () => {
      err('');
      if (!auth) { err('Service en ligne non configuré (voir SETUP-COMPTES.md).'); return; }
      const email = $a('#auth-email').value.trim();
      if (!email) { err('Saisissez votre e-mail ci-dessous, puis recliquez sur « Mot de passe oublié ? ».'); return; }
      try {
        await auth.sendPasswordResetEmail(email);
        err('E-mail de réinitialisation envoyé à ' + email + '.');
      } catch (ex) { err(frError(ex)); }
    });

    $a('#auth-google').addEventListener('click', async () => {
      err('');
      if (!auth) { err('Service en ligne non configuré (voir SETUP-COMPTES.md).'); return; }
      busy(true);
      try {
        let cred;
        if (isDesktop) {
          if (!GOOGLE_DESKTOP || !GOOGLE_DESKTOP.clientId) {
            err('Connexion Google non configurée pour l’appli PC (voir SETUP-COMPTES.md, étape « ID client de bureau »).');
            busy(false); return;
          }
          const tok = await window.alixoDesktop.googleOAuth(GOOGLE_DESKTOP.clientId, GOOGLE_DESKTOP.clientSecret || '');
          const gcred = firebase.auth.GoogleAuthProvider.credential(tok.idToken, tok.accessToken || null);
          cred = await auth.signInWithCredential(gcred);
          if (cred && cred.additionalUserInfo && cred.additionalUserInfo.isNewUser) markNewAccount(cred.user);
        } else {
          cred = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
          if (cred && cred.additionalUserInfo && cred.additionalUserInfo.isNewUser) markNewAccount(cred.user);
        }
        await done(cred.user);
      } catch (ex) { err(frError(ex)); }
      busy(false);
    });

    $a('#auth-apple').addEventListener('click', async () => {
      err('');
      if (!window.ALIXO_APPLE_CONFIG) {
        err('La connexion Apple nécessite l’Apple Developer Program (payant). Utilisez Google ou votre e-mail en attendant.');
        return;
      }
      if (isDesktop) { err('La connexion Apple n’est disponible que dans la version web pour l’instant.'); return; }
      busy(true);
      try {
        const provider = new firebase.auth.OAuthProvider('apple.com');
        provider.addScope('email'); provider.addScope('name');
        const cred = await auth.signInWithPopup(provider);
        if (cred && cred.additionalUserInfo && cred.additionalUserInfo.isNewUser) markNewAccount(cred.user);
        await done(cred.user);
      } catch (ex) { err(frError(ex)); }
      busy(false);
    });

    $a('#auth-offline').addEventListener('click', () => {
      localStorage.setItem(LOCAL_MODE_KEY, '1');
      hideOverlay();
    });

    return ov;
  }

  function showOverlay() { buildOverlay().hidden = false; }
  function hideOverlay() { if (ov) ov.hidden = true; }

  /* ============================================================
     Session : vérification en arrière-plan + API publique
     ============================================================ */
  if (auth) {
    let first = true;
    auth.onAuthStateChanged(user => {
      if (!first) return;
      first = false;
      if (user && (!cached || cached.uid !== user.uid)) { setSession(user); location.reload(); return; }
      if (!user && cached) {
        // session expirée ou déconnectée ailleurs
        localStorage.removeItem(SESSION_KEY);
        location.reload();
      }
    });
  }

  function boot() {
    // Écran de connexion au démarrage : service configuré, personne de connecté,
    // et l'utilisateur n'a pas choisi « continuer sans compte ».
    if (CONFIG && !cached && !localStorage.getItem(LOCAL_MODE_KEY)) {
      if (document.body) showOverlay();
      else document.addEventListener('DOMContentLoaded', showOverlay);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return {
    isConfigured: !!auth,
    storageSuffix, isNewAccount, clearNewAccount,
    account: () => cached,
    user: () => (auth ? auth.currentUser : null),
    firebaseAuth: () => auth,
    openAuthOverlay: () => { localStorage.removeItem(LOCAL_MODE_KEY); showOverlay(); },
    signOut: async () => {
      try { if (auth) await auth.signOut(); } catch { /* hors ligne : on déconnecte quand même localement */ }
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LOCAL_MODE_KEY); // ré-affiche l'écran de connexion
      location.reload();
    }
  };
})();
