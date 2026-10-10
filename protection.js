/* ============================================================
   alixoapp.com — protection contre l'aspiration automatisée (côté page)
   Chargé sur toutes les pages publiques du site vitrine (defer). Trois rôles :
   1. pot de miel (T-15) : un lien invisible pour les humains, vers /piege/ (interdit dans robots.txt) ;
   2. tatouage (T-23) : des caractères de largeur nulle insérés dans les paragraphes éditoriaux, selon un motif
      propre au site, pour prouver une reprise du contenu (sans effet visible ni sur la lecture d'écran) ;
   3. signalement : un navigateur piloté (navigator.webdriver) ou sans aucune interaction humaine n'a pas accès
      aux pages protégées (mentions légales, contact) — voir defi.js. Ici on se contente de marquer la page.
   Les mesures réseau (user-agents, ASN, débit, empreintes TLS) sont dans cloudflare/.
   ============================================================ */
(function () {
  'use strict';
  /* 1. pot de miel : lien hors écran, ignoré par les lecteurs d'écran (aria-hidden, tabindex -1) */
  try {
    var a = document.createElement('a');
    a.href = '/piege/' + 'index.html?r=' + Math.random().toString(36).slice(2, 8);
    a.textContent = 'Archive complète des articles';
    a.setAttribute('aria-hidden', 'true'); a.setAttribute('tabindex', '-1'); a.rel = 'nofollow';
    a.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(a);
  } catch (e) { /* rien */ }

  /* 2. tatouage : motif binaire dérivé du chemin de la page, encodé en U+200B / U+200C entre certains mots */
  try {
    var seed = 0, path = location.pathname || '/';
    for (var i = 0; i < path.length; i++) seed = (seed * 31 + path.charCodeAt(i)) >>> 0;
    var bits = (seed ^ 0xA11C0).toString(2).padStart(20, '0');          // 20 bits : identité du site + page
    var nodes = document.querySelectorAll('main p, article p, .doc-main p, .faq-a p, section p');
    var k = 0;
    for (var n = 0; n < nodes.length && n < 24; n++) {
      var t = nodes[n].firstChild;
      if (!t || t.nodeType !== 3 || t.nodeValue.length < 40) continue;
      var txt = t.nodeValue, pos = txt.indexOf(' ', 20);
      if (pos < 0) continue;
      var mark = bits[k % bits.length] === '1' ? '​' : '‌';
      t.nodeValue = txt.slice(0, pos) + mark + txt.slice(pos);
      k++;
    }
  } catch (e) { /* rien */ }

  /* 3. marque « automatisation » : utilisée par defi.js et le CSS (rien n'est caché ici, option T-22 non retenue) */
  try { if (navigator.webdriver) document.documentElement.setAttribute('data-automation', '1'); } catch (e) { /* rien */ }
})();
