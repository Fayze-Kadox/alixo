/* ============================================================
   Alixo — version téléphone (mobile.html, 1.15)
   Même application que la version web, avec une navigation adaptée :
   tiroir pour l'explorateur, bouton « + » flottant, plan du cours replié,
   barres qui défilent, panneaux en plein écran (voir mobile.css).
   Chargé en dernier : utilise les globales de app.js.
   ============================================================ */
'use strict';
(() => {
  const body = document.body;
  body.classList.add('mobile');
  // hauteur réelle de la fenêtre (barres du navigateur mobile)
  const setVh = () => document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
  setVh(); window.addEventListener('resize', setVh);

  /* ---- tiroir : explorateur ---- */
  const menu = document.createElement('button');
  menu.id = 'mob-menu'; menu.className = 'tbtn'; menu.type = 'button'; menu.title = 'Explorateur';
  menu.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  const back = document.createElement('div'); back.id = 'mob-backdrop'; back.hidden = true;
  document.querySelector('.tb-left').prepend(menu);
  body.appendChild(back);
  const open = v => { body.classList.toggle('drawer-open', v); back.hidden = !v; };
  menu.addEventListener('click', () => { if (body.classList.contains('mode-editor') || body.classList.contains('mode-slides')) { showLibrary(); } else open(!body.classList.contains('drawer-open')); });
  back.addEventListener('click', () => open(false));
  const nav = document.getElementById('libnav');
  nav.addEventListener('click', e => { if (e.target.closest('[data-doc], [data-open], [data-shrow], #ln-agenda, #ln-shared, #ln-todo')) setTimeout(() => open(false), 60); });
  // lien vers la version complète
  const full = document.createElement('a');
  full.className = 'mob-full'; full.href = 'index.html?desktop=1'; full.textContent = 'Version complète (ordinateur)';
  full.addEventListener('click', () => { try { localStorage.setItem('alixo.forceDesktop', '1'); } catch { /* */ } });
  nav.appendChild(full);

  /* ---- bouton « + » flottant (bibliothèque) ---- */
  const fab = document.createElement('div'); fab.id = 'mob-fab';
  fab.innerHTML = `<div class="mob-sheet" hidden>
      <button type="button" data-do="btn-new-doc">＋ Nouvelle séance</button>
      <button type="button" data-do="btn-new-slides">＋ Présentation</button>
      <button type="button" data-do="btn-new-folder">＋ Dossier</button>
      <button type="button" data-do="btn-import-files">＋ Fichier</button>
    </div><button type="button" class="mob-fabbtn" title="Créer">＋</button>`;
  body.appendChild(fab);
  const sheet = fab.querySelector('.mob-sheet');
  fab.querySelector('.mob-fabbtn').addEventListener('click', () => { sheet.hidden = !sheet.hidden; });
  fab.addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (!b) return; sheet.hidden = true; const t = document.getElementById(b.dataset.do); if (t) t.click(); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#mob-fab')) sheet.hidden = true; }, true);

  /* ---- éditeur : plan replié à l'ouverture, volets en plein écran ---- */
  const mo = new MutationObserver(() => {
    const ed = body.classList.contains('mode-editor');
    const ve = document.getElementById('view-editor');
    if (ed && ve && ve.classList.contains('plan-open')) { const c = document.getElementById('pp-collapse'); if (c) c.click(); }
    fab.hidden = ed || body.classList.contains('mode-slides');
    if (ed || body.classList.contains('mode-slides')) open(false);
  });
  mo.observe(body, { attributes: true, attributeFilter: ['class'] });
  fab.hidden = body.classList.contains('mode-editor') || body.classList.contains('mode-slides');

  /* ---- galaxie : rendu 2D par défaut sur téléphone (plus léger) ---- */
  try { if (window.state && state.settings && state.settings.galaxy3d === undefined) state.settings.galaxy3d = false; } catch { /* */ }
})();
