/* ============================================================
   alixoapp.com — défi anti-robot et révélation des données obligatoires (T-16, T-19, T-20, T-21)
   Les mentions légales (identité de l'éditeur, adresse, SIREN, téléphone) et l'adresse de contact ne figurent pas
   dans le HTML : elles sont livrées chiffrées (mentions-data.js, AES-GCM) et déchiffrées dans le navigateur après :
     1. un geste humain (pointeur, clavier ou toucher) et l'absence de pilotage automatisé (navigator.webdriver) ;
     2. une preuve de travail (quelques milliers de SHA-256, ~0,1 s pour un humain, coûteux pour un aspirateur de masse) ;
     3. ou, si le site est derrière Cloudflare et qu'une clé est fournie (window.ALIXO_TURNSTILE_SITEKEY), le jeton
        Turnstile — défi invisible, le plus robuste.
   La clé de déchiffrement dérive de la solution de la preuve de travail : sans l'exécuter, la page brute ne contient
   aucune donnée lisible. Limite assumée (§ 7.1 du cahier des charges) : un navigateur réel piloté par un humain ou un
   acteur déterminé peut passer ; l'objectif porte sur le volume, pas sur chaque tentative. Le rendu après défi est du
   texte normal (accessible, RGAA), pas une image.
   Encodage des données : tools/encode-mentions.js (dépôt du site).
   ============================================================ */
window.AlixoDefi = (function () {
  'use strict';
  var enc = new TextEncoder(), dec = new TextDecoder();
  var human = false;
  ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(function (ev) { addEventListener(ev, function () { human = true; }, { passive: true, once: true }); });

  function sha256(str) { return crypto.subtle.digest('SHA-256', enc.encode(str)).then(function (b) { return new Uint8Array(b); }); }
  var hex = function (u8) { return Array.prototype.map.call(u8, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };
  /* preuve de travail : trouver n tel que SHA-256(salt:n) commence par `bits` bits à zéro */
  async function pow(salt, bits) {
    var mask = (1 << bits) - 1;
    for (var n = 0; n < 5e6; n++) {
      var h = await sha256(salt + ':' + n);
      var lead = (h[0] << 8 | h[1]) >>> (16 - bits);
      if ((lead & mask) === 0) return n;
    }
    throw new Error('défi trop long');
  }
  async function unlock(data) {
    // data = { salt, bits, iv, ct } (base64). La clé AES dérive de la SOLUTION de la preuve de travail (le plus petit
    // nonce valable, que pow() trouve en partant de 0) : impossible de déchiffrer sans la calculer.
    var n = await pow(data.salt, data.bits || 12);
    var h = await sha256(data.salt + ':' + n);
    if (hex(h).slice(0, Math.ceil((data.bits || 12) / 4)).replace(/0/g, '') !== '') throw new Error('preuve invalide');
    var keyMat = await sha256(data.salt + ':' + n + '|alixo-mentions');
    var key = await crypto.subtle.importKey('raw', keyMat, 'AES-GCM', false, ['decrypt']);
    var b64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(data.iv) }, key, b64(data.ct));
    return JSON.parse(dec.decode(pt));
  }
  function turnstile(sitekey) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
      s.onload = function () { var box = document.createElement('div'); document.getElementById('defi-zone').appendChild(box); window.turnstile.render(box, { sitekey: sitekey, size: 'flexible', language: 'fr', callback: function (token) { resolve(token); }, 'error-callback': function () { reject(new Error('Turnstile indisponible')); } }); };
      s.onerror = function () { reject(new Error('Turnstile injoignable')); };
      document.head.appendChild(s);
    });
  }
  /* run({ data, button, status, onPass }) : branche le bouton « Afficher », exécute le défi, appelle onPass(fields) */
  function run(o) {
    var btn = o.button, st = o.status;
    var say = function (m) { if (st) st.textContent = m; };
    if (navigator.webdriver) { say('Navigateur automatisé détecté : ces informations sont réservées aux visiteurs humains. Elles restent disponibles par courrier auprès de l’hébergeur.'); if (btn) btn.disabled = true; return; }
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      if (!human) { say('Bougez la souris ou faites défiler la page, puis réessayez.'); btn.disabled = false; human = true; return; }
      say('Vérification en cours…');
      try {
        if (window.ALIXO_TURNSTILE_SITEKEY) await turnstile(window.ALIXO_TURNSTILE_SITEKEY);
        var fields = await unlock(o.data);
        say(''); btn.hidden = true;
        o.onPass(fields);
      } catch (e) { say('La vérification a échoué (' + (e && e.message || e) + '). Rechargez la page et réessayez.'); btn.disabled = false; }
    });
  }
  return { run: run, unlock: unlock, pow: pow };
})();
