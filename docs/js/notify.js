/* ============================================================
   Alixo — centre de notifications (cloche de la barre supérieure)
   Mises à jour de l'application, partages reçus, annonces et messages
   directs de l'administrateur, clé IA attribuée… Stockées sur l'appareil
   (par compte), 100 au plus. Chargé APRÈS app.js.
   ============================================================ */
'use strict';

window.AlixoNotify = (() => {
  const KEY = 'alixo.notifs' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
  const MAX = 100;
  let list = [];
  try { const t = JSON.parse(localStorage.getItem(KEY)); list = Array.isArray(t) ? t : []; } catch { list = []; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* stockage indisponible */ } };
  const unread = () => list.filter(n => !n.read).length;

  const KIND = {
    update: { label: 'Mise à jour', ico: '<svg viewBox="0 0 24 24"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 20h16"/></svg>', color: '#33658a' },
    share: { label: 'Alixo Share', ico: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>', color: '#2f7d68' },
    admin: { label: 'Alixo', ico: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4Z"/><path d="M8 9h8M8 12h5"/></svg>', color: '#b3762a' },
    message: { label: 'Message de l’administrateur', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>', color: '#8a4b9c' },
    key: { label: 'Intelligence artificielle', ico: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M15 8l2 2M18 5l2 2"/></svg>', color: '#7a6852' },
    todo: { label: 'Tâches', ico: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="6" rx="1.2"/><path d="m4.5 7 1.4 1.4L8.5 5.6M11 7h10M11 17h10"/><rect x="3" y="14" width="6" height="6" rx="1.2"/></svg>', color: '#c04343' },
    info: { label: 'Information', ico: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>', color: '#5b6b8c' }
  };
  const when = ts => {
    const d = Date.now() - ts;
    if (d < 60000) return 'à l’instant';
    if (d < 3600000) return `il y a ${Math.round(d / 60000)} min`;
    if (d < 86400000) return `il y a ${Math.round(d / 3600000)} h`;
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  function renderBadge() {
    const b = $('#notif-badge'); if (!b) return;
    const n = unread();
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
    const btn = $('#btn-notif'); if (btn) btn.title = n ? `${n} notification${n > 1 ? 's' : ''} non lue${n > 1 ? 's' : ''}` : 'Notifications : mises à jour, partages, messages';
  }

  /* push({ id?, kind, title, text?, action?, silent? }) — `id` évite les doublons (annonces, versions…) */
  function push(n) {
    if (!n || !n.title) return null;
    if (n.id && list.some(x => x.id === n.id)) return null;
    const item = { id: n.id || uid(), ts: n.ts || Date.now(), kind: KIND[n.kind] ? n.kind : 'info', title: String(n.title).slice(0, 140), text: String(n.text || '').slice(0, 600), action: n.action || null, read: false };
    list.unshift(item); if (list.length > MAX) list.length = MAX;
    persist(); renderBadge();
    if (!n.silent) toast(item.title, item.action ? { action: 'Voir', onAction: () => run(item) } : undefined);
    if (!$('#popover').hidden && $('#popover').querySelector('.nt-list')) openPanel();
    return item;
  }
  function run(item) {
    item.read = true; persist(); renderBadge();
    const a = item.action; if (!a) return;
    try {
      if (a.type === 'shared') AlixoApp.openSharedHome();
      else if (a.type === 'todo') AlixoApp.openTodoHome();
      else if (a.type === 'doc' && a.id) AlixoApp.openDoc(a.id);
      else if (a.type === 'settings') AlixoApp.openSettings();
      else if (a.type === 'msg' && a.msg) { if (window.AlixoCloud && AlixoCloud.showMessage) AlixoCloud.showMessage(a.id, a.msg); }
      else if (a.type === 'url' && a.url) { if (window.alixoDesktop && alixoDesktop.openExternal) alixoDesktop.openExternal(a.url); else window.open(a.url, '_blank', 'noopener'); }
      else if (a.type === 'update-install') { if (window.alixoDesktop && alixoDesktop.installUpdate) alixoDesktop.installUpdate(); else toast('Redémarrez Alixo pour appliquer la mise à jour'); }
    } catch (e) { console.error(e); }
  }
  function markAllRead() { list.forEach(n => { n.read = true; }); persist(); renderBadge(); }
  function clear() { list = []; persist(); renderBadge(); }

  function openPanel() {
    const r = $('#btn-notif').getBoundingClientRect();
    const items = list.slice(0, 40);
    showPopover(`<h4>Notifications${unread() ? ` <span class="nt-count">${unread()}</span>` : ''}</h4>
      <div class="nt-list">${items.length ? items.map(n => { const k = KIND[n.kind] || KIND.info; return `<button type="button" class="nt-item ${n.read ? '' : 'unread'}" data-nid="${n.id}" style="--nc:${k.color}"><span class="nt-ico">${k.ico}</span><span class="nt-body"><span class="nt-title">${esc(n.title)}</span>${n.text ? `<span class="nt-text">${esc(n.text)}</span>` : ''}<span class="nt-meta">${esc(k.label)} · ${when(n.ts)}${n.action ? ' · <u>ouvrir</u>' : ''}</span></span><span class="nt-x" data-ndel="${n.id}" title="Retirer">✕</span></button>`; }).join('') : '<div class="po-hint" style="margin:6px 2px 10px">Rien pour le moment. Vous serez prévenu ici des mises à jour, des cours partagés avec vous et des messages d’Alixo.</div>'}</div>
      ${items.length ? `<div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:8px"><button class="cta ghost small" id="nt-read" type="button">Tout marquer lu</button><button class="cta ghost small" id="nt-clear" type="button">Effacer</button></div>` : ''}`,
      { left: r.right - 360, top: r.bottom, bottom: r.bottom }, pop => {
        pop.addEventListener('click', e => {
          const del = e.target.closest('[data-ndel]');
          if (del) { e.stopPropagation(); list = list.filter(n => n.id !== del.dataset.ndel); persist(); renderBadge(); openPanel(); return; }
          const it = e.target.closest('[data-nid]'); if (!it) return;
          const n = list.find(x => x.id === it.dataset.nid); if (!n) return;
          hidePopover(); run(n);
        });
        const rd = pop.querySelector('#nt-read'); if (rd) rd.addEventListener('click', () => { markAllRead(); openPanel(); });
        const cl = pop.querySelector('#nt-clear'); if (cl) cl.addEventListener('click', () => { clear(); hidePopover(); });
      });
    // les notifications affichées sont vues (mais restent listées)
    setTimeout(() => { if (unread()) { markAllRead(); } }, 1500);
  }
  const btn = $('#btn-notif');
  if (btn) btn.addEventListener('click', () => { if (!$('#popover').hidden && $('#popover').querySelector('.nt-list')) hidePopover(); else openPanel(); });
  renderBadge();

  /* mises à jour de la version PC (electron-updater → main.js → preload) */
  if (window.alixoDesktop && alixoDesktop.onUpdate) {
    alixoDesktop.onUpdate(info => {
      if (!info || !info.state) return;
      if (info.state === 'download') push({ id: 'upd_mac_' + info.version, kind: 'update', title: `Alixo ${info.version} est disponible`, text: 'Sur Mac, la mise à jour se télécharge à la main : cliquez pour récupérer le nouveau .dmg, puis glissez Alixo dans Applications (vos cours sont conservés).', action: { type: 'url', url: info.url || 'https://github.com/Fayze-Kadox/alixo/releases/latest' } });
      else if (info.state === 'available') push({ id: 'upd_av_' + info.version, kind: 'update', title: `Alixo ${info.version} est disponible`, text: 'Téléchargement en arrière-plan… Vous serez prévenu quand elle sera prête à installer.', silent: true });
      else if (info.state === 'downloaded') push({ id: 'upd_dl_' + info.version, kind: 'update', title: `Alixo ${info.version} est prêt à être installé`, text: 'Cliquez pour redémarrer et appliquer la mise à jour (vos cours sont conservés). Sinon elle s’installera à la fermeture.', action: { type: 'update-install' } });
      else if (info.state === 'error' && info.manual) push({ kind: 'update', title: 'Vérification des mises à jour impossible', text: 'Impossible de contacter le serveur (hors ligne ?).', silent: true });
      else if (info.state === 'none' && info.manual) push({ kind: 'update', title: 'Vous êtes à jour', text: `Alixo ${info.version || AlixoApp.version} est la dernière version.` });
    });
  }

  return { push, unread, markAllRead, clear, open: openPanel, list: () => list.slice() };
})();
