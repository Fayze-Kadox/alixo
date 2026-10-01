/* ============================================================
   Configuration du service en ligne d'Alixo (Firebase).
   Projet : alixo (alixo-b9f58) — console.firebase.google.com
   Configuré le 26/08/2026.
   ============================================================ */

window.ALIXO_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAB-OMJA_ZBpsjcrnR_mhXBB16OMf2rdRA",
  authDomain: "alixo-b9f58.firebaseapp.com",
  projectId: "alixo-b9f58",
  storageBucket: "alixo-b9f58.firebasestorage.app",
  messagingSenderId: "417370097574",
  appId: "1:417370097574:web:36a6cdc6c61c1e47563167",
  measurementId: "G-DRNJ4E84ZD"
};

/* ID client OAuth « Application de bureau » (bouton Google de l'appli PC).
   Pour une app de bureau, ce « secret » n'est pas confidentiel (flux PKCE). */
window.ALIXO_GOOGLE_DESKTOP_CLIENT = null;

/* Connexion Apple : nécessite l'Apple Developer Program (payant) + un Service ID. */
window.ALIXO_APPLE_CONFIG = null;

/* E-mails d'invitation d'Alixo Share (facultatif — voir SETUP-COMPTES.md § 3 ter).
   Sans réglage : Alixo ouvre un brouillon prêt à envoyer (Gmail ou messagerie de l'ordinateur).
   Envoi automatique : { webhook: "https://script.google.com/macros/s/…/exec", key: "…" } (Google Apps Script)
   ou { extension: true } si l'extension Firebase « Trigger Email » est installée. */
window.ALIXO_MAIL = null;

