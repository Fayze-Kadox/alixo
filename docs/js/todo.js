/* ============================================================
   Alixo — tâches à faire (Bibliothèque › Tâches)
   state.todos    = [{ id, text, cat, done, doneAt, due, prio, createdAt, updatedAt }]
   state.todoCats = [{ id, name, color, createdAt, updatedAt }]
   Synchronisées avec le compte (méta, voir js/sync.js). Chargé APRÈS app.js.
   ============================================================ */
'use strict';

window.AlixoTodo = (() => {
  const CAT_COLORS = ['#33658a', '#2f7d68', '#c04343', '#b3762a', '#3d6bb5', '#a8556f', '#7a6852', '#2e8b8b', '#d06a3a', '#5b6b8c'];
  const todos = () => (Array.isArray(state.todos) ? state.todos : (state.todos = []));
  const cats = () => (Array.isArray(state.todoCats) ? state.todoCats : (state.todoCats = []));
  const catOf = id => cats().find(c => c.id === id) || null;
  let filter = 'open';        // open | done | all
  let selCat = 'all';         // all | none | id
  const today = () => todayKey();
  const stamp = o => { o.updatedAt = Date.now(); return o; };
  const isLate = t => !t.done && t.due && t.due < today();
  const dueLabel = k => {
    if (!k) return '';
    const t = today(); if (k === t) return 'aujourd’hui';
    const d = parseYmd(k), n = parseYmd(t); const diff = Math.round((d - n) / 86400000);
    if (diff === 1) return 'demain'; if (diff === -1) return 'hier';
    if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + (d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '');
  };
  const openCount = () => todos().filter(t => !t.done).length;
  const lateCount = () => todos().filter(isLate).length;

  function persist() { save(); refresh(); }
  function refresh() {
    const locked = typeof isPlus === 'function' && !isPlus();   // tâches réservées à Alixo+ (1.16)
    const b = $('#todo-badge');
    if (b && locked) { b.hidden = true; b.textContent = ''; b.title = ''; }
    else if (b) { const n = openCount(), l = lateCount(); b.hidden = !n; b.textContent = n ? String(n) : ''; b.classList.toggle('late', l > 0); b.title = n ? `${n} tâche${n > 1 ? 's' : ''} à faire${l ? ` · ${l} en retard` : ''}` : ''; }
    if (!currentDocId && libMode === 'todo') render();
  }

  /* ---------------- actions ---------------- */
  function addTask(text, cat, due, prio) {
    text = (text || '').trim(); if (!text) return null;
    const t = { id: uid(), text: text.slice(0, 300), cat: cat && catOf(cat) ? cat : null, done: false, doneAt: 0, due: due || '', prio: +prio || 0, createdAt: Date.now(), updatedAt: Date.now() };
    todos().push(t); persist(); return t;
  }
  function toggle(id) { const t = todos().find(x => x.id === id); if (!t) return; t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; stamp(t); persist(); }
  function remove(id) {
    const i = todos().findIndex(x => x.id === id); if (i < 0) return;
    const [t] = todos().splice(i, 1); persist();
    toast(`« ${t.text.slice(0, 40)} » supprimée`, { action: 'Annuler', onAction: () => { todos().splice(Math.min(i, todos().length), 0, t); persist(); } });
  }
  function addCat(name, color) {
    name = (name || '').trim(); if (!name) return null;
    const c = { id: uid(), name: name.slice(0, 40), color: color || CAT_COLORS[cats().length % CAT_COLORS.length], createdAt: Date.now(), updatedAt: Date.now() };
    cats().push(c); persist(); return c;
  }
  function removeCat(id) {
    const c = catOf(id); if (!c) return;
    const n = todos().filter(t => t.cat === id).length;
    const go = () => { state.todoCats = cats().filter(x => x.id !== id); todos().forEach(t => { if (t.cat === id) { t.cat = null; stamp(t); } }); if (selCat === id) selCat = 'all'; persist(); toast(`Catégorie « ${c.name} » supprimée`); };
    if (n) confirmDialog({ title: `Supprimer la catégorie « ${c.name} » ?`, text: `${n} tâche${n > 1 ? 's' : ''} seront gardées sans catégorie.`, ok: 'Supprimer' }).then(y => { if (y) go(); }); else go();
  }
  function clearDone() {
    const done = todos().filter(t => t.done); if (!done.length) return;
    state.todos = todos().filter(t => !t.done); persist();
    toast(`${done.length} tâche${done.length > 1 ? 's' : ''} terminée${done.length > 1 ? 's' : ''} effacée${done.length > 1 ? 's' : ''}`, { action: 'Annuler', onAction: () => { todos().push(...done); persist(); } });
  }

  /* ---------------- pop-overs ---------------- */
  function openCatPopover(existing, anchor) {
    let color = existing ? existing.color : CAT_COLORS[cats().length % CAT_COLORS.length];
    showPopover(`<h4>${existing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h4>
      <div class="po-row"><input id="po-catname" value="${esc(existing ? existing.name : '')}" placeholder="Ex. Révisions, Administratif, TD…" maxlength="40" autocomplete="off"></div>
      <div class="po-label">Couleur</div>
      <div class="po-colors" id="po-catcolors">${CAT_COLORS.map(c => `<button data-c="${c}" class="${c === color ? 'sel' : ''}" style="background:${c}" type="button"></button>`).join('')}</div>
      <div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:12px">${existing ? '<button class="cta ghost small" id="po-catdel" type="button">Supprimer</button>' : ''}<button class="pobtn" id="po-catok" type="button">${existing ? 'Enregistrer' : 'Créer'}</button></div>`,
      anchor || centerRect(), pop => {
        const inp = pop.querySelector('#po-catname');
        pop.querySelector('#po-catcolors').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; pop.querySelectorAll('#po-catcolors button').forEach(x => x.classList.toggle('sel', x === b)); });
        const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } if (existing) { existing.name = v.slice(0, 40); existing.color = color; stamp(existing); persist(); } else { const c = addCat(v, color); selCat = c.id; render(); } hidePopover(); };
        pop.querySelector('#po-catok').addEventListener('click', ok);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        const del = pop.querySelector('#po-catdel'); if (del) del.addEventListener('click', () => { hidePopover(); removeCat(existing.id); });
        setTimeout(() => { inp.focus(); inp.select(); }, 40);
      });
  }
  function openTaskPopover(t, anchor) {
    showPopover(`<h4>Modifier la tâche</h4>
      <div class="po-row"><input id="po-ttext" value="${esc(t.text)}" maxlength="300" autocomplete="off"></div>
      <div class="po-cal"><div class="po-row"><label>Échéance<input id="po-tdue" type="date" value="${esc(t.due || '')}"></label><label>Priorité<select id="po-tprio"><option value="0" ${!t.prio ? 'selected' : ''}>Normale</option><option value="1" ${t.prio === 1 ? 'selected' : ''}>Importante</option><option value="2" ${t.prio === 2 ? 'selected' : ''}>Urgente</option></select></label></div>
      <div class="po-row"><label>Catégorie<select id="po-tcat"><option value="">Sans catégorie</option>${cats().map(c => `<option value="${c.id}" ${t.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div></div>
      <div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:12px"><button class="cta ghost small" id="po-tdel" type="button">Supprimer</button><button class="pobtn" id="po-tok" type="button">Enregistrer</button></div>`,
      anchor || centerRect(), pop => {
        const inp = pop.querySelector('#po-ttext');
        const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } t.text = v.slice(0, 300); t.due = pop.querySelector('#po-tdue').value || ''; t.prio = +pop.querySelector('#po-tprio').value || 0; t.cat = pop.querySelector('#po-tcat').value || null; stamp(t); persist(); hidePopover(); };
        pop.querySelector('#po-tok').addEventListener('click', ok);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        pop.querySelector('#po-tdel').addEventListener('click', () => { hidePopover(); remove(t.id); });
        setTimeout(() => { inp.focus(); }, 40);
      });
  }

  /* ---------------- rendu ---------------- */
  const taskHTML = t => {
    const c = catOf(t.cat);
    return `<div class="td-item ${t.done ? 'done' : ''} ${isLate(t) ? 'late' : ''} prio${t.prio || 0}" data-tid="${t.id}" draggable="true">
      <button type="button" class="td-check" data-toggle="${t.id}" title="${t.done ? 'Marquer à faire' : 'Marquer faite'}">${t.done ? '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>' : ''}</button>
      <div class="td-main" data-edit="${t.id}"><div class="td-text">${esc(t.text)}</div>
        <div class="td-meta">${t.prio ? `<span class="td-prio">${t.prio === 2 ? 'Urgent' : 'Important'}</span>` : ''}${t.due ? `<span class="td-due" title="${esc(t.due)}">${isLate(t) ? 'En retard · ' : ''}${esc(dueLabel(t.due))}</span>` : ''}${c && selCat === 'all' ? `<span class="td-cat" style="--cc:${c.color}"><i></i>${esc(c.name)}</span>` : ''}${t.done && t.doneAt ? `<span class="td-done">fait le ${new Date(t.doneAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>` : ''}</div></div>
      <button type="button" class="td-x" data-del="${t.id}" title="Supprimer">✕</button></div>`;
  };
  function render() {
    const root = $('#lib-todo'); if (!root) return;
    const all = todos();
    const visible = all.filter(t => (filter === 'all' || (filter === 'done') === !!t.done) && (selCat === 'all' || (selCat === 'none' ? !t.cat : t.cat === selCat)));
    const order = (a, b) => (a.done - b.done) || ((b.prio || 0) - (a.prio || 0)) || ((a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : 0) || (b.createdAt - a.createdAt);
    visible.sort(order);
    const groups = [];
    if (selCat === 'all') {
      for (const c of cats()) { const items = visible.filter(t => t.cat === c.id); if (items.length || filter !== 'done') groups.push({ c, items }); }
      const none = visible.filter(t => !t.cat); if (none.length || !cats().length) groups.push({ c: null, items: none });
    } else groups.push({ c: selCat === 'none' ? null : catOf(selCat), items: visible });
    const nOpen = openCount(), nLate = lateCount(), nDone = all.filter(t => t.done).length;
    const todayOpen = all.filter(t => !t.done && t.due === today()).length;
    root.innerHTML = `<div class="td-head">
        <div><div class="td-title">Tâches</div><div class="td-sub">${nOpen ? `${nOpen} à faire${todayOpen ? ` · ${todayOpen} pour aujourd’hui` : ''}${nLate ? ` · <b class="late">${nLate} en retard</b>` : ''}` : 'Rien à faire — profitez-en pour réviser.'}</div></div>
        <div class="td-tools"><div class="seg td-seg">${[['open', 'À faire'], ['done', 'Faites'], ['all', 'Toutes']].map(([k, l]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>${nDone ? '<button class="cta ghost small" data-cleardone type="button">Effacer les faites</button>' : ''}<button class="cta ghost small" data-newcat type="button">＋ Catégorie</button></div>
      </div>
      <div class="td-body">
        <aside class="td-cats">
          <button type="button" class="td-catbtn ${selCat === 'all' ? 'on' : ''}" data-cat="all"><i style="background:var(--ink-3)"></i><span>Toutes</span><em>${nOpen}</em></button>
          ${cats().map(c => { const n = all.filter(t => t.cat === c.id && !t.done).length; return `<button type="button" class="td-catbtn ${selCat === c.id ? 'on' : ''}" data-cat="${c.id}" data-catedit="${c.id}" title="Clic droit ou ✎ : modifier"><i style="background:${c.color}"></i><span>${esc(c.name)}</span><em>${n || ''}</em><span class="td-catpen" data-cedit="${c.id}">✎</span></button>`; }).join('')}
          <button type="button" class="td-catbtn ${selCat === 'none' ? 'on' : ''}" data-cat="none"><i style="background:transparent; border:1.5px dashed var(--ink-3)"></i><span>Sans catégorie</span><em>${all.filter(t => !t.cat && !t.done).length || ''}</em></button>
          <div class="td-cathint">Les catégories regroupent vos tâches (révisions, administratif, TD, mémoire…).</div>
        </aside>
        <div class="td-lists">
          <form class="td-add" data-addform><input class="td-addinput" placeholder="Nouvelle tâche… (Entrée pour ajouter)" maxlength="300" autocomplete="off"><input type="date" class="td-adddue" title="Échéance (facultatif)"><select class="td-addcat" title="Catégorie">${selCat !== 'all' && selCat !== 'none' ? '' : '<option value="">Sans catégorie</option>'}${cats().map(c => `<option value="${c.id}" ${selCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}${selCat !== 'all' && selCat !== 'none' ? '<option value="">Sans catégorie</option>' : ''}</select><button class="cta small" type="submit">Ajouter</button></form>
          ${groups.map(g => `<section class="td-group" style="--cc:${g.c ? g.c.color : 'var(--ink-3)'}"><div class="td-ghead"><i></i><span>${g.c ? esc(g.c.name) : 'Sans catégorie'}</span><em>${g.items.filter(t => !t.done).length ? g.items.filter(t => !t.done).length + ' à faire' : (g.items.length ? 'tout est fait' : '')}</em>${g.c ? `<button type="button" class="td-gedit" data-cedit="${g.c.id}" title="Modifier la catégorie">✎</button>` : ''}</div>
            ${g.items.length ? g.items.map(taskHTML).join('') : `<div class="td-empty">${filter === 'done' ? 'Aucune tâche terminée ici.' : 'Aucune tâche — ajoutez-en une ci-dessus.'}</div>`}</section>`).join('')}
        </div>
      </div>`;
    const inp = root.querySelector('.td-addinput'); if (inp && !root.dataset.bound) setTimeout(() => inp.focus(), 30);
    if (!root.dataset.bound) { root.dataset.bound = '1'; bind(root); }
  }
  function bind(root) {
    root.addEventListener('submit', e => {
      const f = e.target.closest('[data-addform]'); if (!f) return;
      e.preventDefault();
      const inp = f.querySelector('.td-addinput');
      const t = addTask(inp.value, f.querySelector('.td-addcat').value, f.querySelector('.td-adddue').value, 0);
      if (t) { render(); const i2 = root.querySelector('.td-addinput'); if (i2) i2.focus(); }
    });
    root.addEventListener('click', e => {
      const tg = e.target.closest('[data-toggle]'); if (tg) { toggle(tg.dataset.toggle); return; }
      const del = e.target.closest('[data-del]'); if (del) { remove(del.dataset.del); return; }
      const ce = e.target.closest('[data-cedit]'); if (ce) { e.stopPropagation(); openCatPopover(catOf(ce.dataset.cedit), ce.getBoundingClientRect()); return; }
      const ed = e.target.closest('[data-edit]'); if (ed) { const t = todos().find(x => x.id === ed.dataset.edit); if (t) openTaskPopover(t, ed.getBoundingClientRect()); return; }
      const fl = e.target.closest('[data-filter]'); if (fl) { filter = fl.dataset.filter; render(); return; }
      const ct = e.target.closest('[data-cat]'); if (ct) { selCat = ct.dataset.cat; render(); return; }
      if (e.target.closest('[data-newcat]')) { openCatPopover(null, e.target.getBoundingClientRect()); return; }
      if (e.target.closest('[data-cleardone]')) clearDone();
    });
    root.addEventListener('contextmenu', e => { const ct = e.target.closest('[data-catedit]'); if (ct) { e.preventDefault(); openCatPopover(catOf(ct.dataset.catedit), ct.getBoundingClientRect()); } });
    /* glisser une tâche sur une catégorie (colonne de gauche) pour la reclasser */
    let drag = null;
    root.addEventListener('dragstart', e => { const it = e.target.closest('.td-item'); if (!it) { e.preventDefault(); return; } drag = it.dataset.tid; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag); } catch { /* navigateur strict */ } });
    root.addEventListener('dragover', e => { const c = e.target.closest('[data-cat]'); if (drag && c && c.dataset.cat !== 'all') { e.preventDefault(); c.classList.add('drop'); } });
    root.addEventListener('dragleave', e => { const c = e.target.closest('[data-cat]'); if (c) c.classList.remove('drop'); });
    root.addEventListener('drop', e => { const c = e.target.closest('[data-cat]'); if (!drag || !c || c.dataset.cat === 'all') return; e.preventDefault(); const t = todos().find(x => x.id === drag); drag = null; if (!t) return; t.cat = c.dataset.cat === 'none' ? null : c.dataset.cat; stamp(t); persist(); });
    root.addEventListener('dragend', () => { drag = null; root.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); });
  }

  /* rappel des tâches en retard / du jour (une fois par jour) */
  function dailyReminder() {
    const late = lateCount(), td = todos().filter(t => !t.done && t.due === today()).length;
    if (!late && !td) return;
    const k = 'alixo.todo.reminded' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
    try { if (localStorage.getItem(k) === today()) return; localStorage.setItem(k, today()); } catch { /* stockage indisponible */ }
    if (typeof isPlus === 'function' && !isPlus()) return;   // pas de rappel sans Alixo+
    if (window.AlixoNotify) AlixoNotify.push({ id: 'todo_' + today(), kind: 'todo', title: td ? `${td} tâche${td > 1 ? 's' : ''} pour aujourd’hui${late ? ` · ${late} en retard` : ''}` : `${late} tâche${late > 1 ? 's' : ''} en retard`, text: todos().filter(t => !t.done && (isLate(t) || t.due === today())).slice(0, 3).map(t => '• ' + t.text).join('\n'), action: { type: 'todo' }, silent: true });
  }
  refresh();
  setTimeout(dailyReminder, 2500);

  return { render, refresh, addTask, toggle, remove, addCat, openCount, lateCount, todos, cats, isLate };
})();
