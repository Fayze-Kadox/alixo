/* ============================================================
   Alixo — bilan de la semaine (« Bonjour … cette semaine : … »)
   Affiché à chaque ouverture de l'application (toujours actif, 1.13)
   et depuis Paramètres › Compte › « Voir mon bilan de la semaine ».
   Chargé APRÈS app.js et todo.js.
   ============================================================ */
'use strict';

window.AlixoStats = (() => {
  const SHOWN_KEY = 'alixo.weekly.shown' + (window.AlixoAuth ? window.AlixoAuth.storageSuffix() : '');
  const DOWS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const words = html => stripTags(html || '').replace(/​/g, '').split(/[\s ]+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  const blockWords = b => {
    if (b.type === 'table') return (b.rows || []).reduce((n, r) => n + r.reduce((m, c) => m + words(c), 0), 0);
    if (b.type === 'cards') return (b.cards || []).reduce((n, c) => n + words(c.t) + words(c.x), 0);
    if (b.type === 'juris' || b.type === 'fiche') return Object.values(b.fields || {}).reduce((n, v) => n + words(v), 0);
    if (['p', 'h', 'li', 'quote', 'callout'].includes(b.type)) return words(b.text) + words(b.cite);
    return 0;
  };
  const blocksOf = d => (typeof allPageBlocks === 'function' ? allPageBlocks(d, false) : (d.blocks || []));

  /* statistiques de la semaine en cours (lundi → aujourd'hui) + comparaison avec la semaine passée */
  function compute() {
    const now = new Date();
    const monday = mondayOf(now), mk = dayKey(monday);
    const prevMonday = new Date(monday); prevMonday.setDate(prevMonday.getDate() - 7); const pk = dayKey(prevMonday);
    const perDay = {}; DOWS.forEach((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); perDay[dayKey(d)] = 0; });
    let wordsWeek = 0, wordsPrev = 0, blocksWeek = 0;
    const docsWeek = new Set(), docsPrev = new Set();
    for (const d of state.docs) {
      for (const b of blocksOf(d)) {
        const k = b.mod && b.mod > (b.day || '') ? b.mod : (b.day || '');
        if (!k) continue;
        const w = blockWords(b);
        if (k >= mk) { wordsWeek += w; blocksWeek++; docsWeek.add(d.id); if (k in perDay) perDay[k] += w; }
        else if (k >= pk) { wordsPrev += w; docsPrev.add(d.id); }
      }
      if ((d.updatedAt || 0) >= monday.getTime()) docsWeek.add(d.id);
    }
    const created = state.docs.filter(d => (d.createdAt || 0) >= monday.getTime()).length;
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 7);
    const occ = (typeof events === 'function' ? events() : []).flatMap(ev => occurrences(ev, monday, sunday));
    const hours = occ.reduce((n, o) => n + (o.end - o.start) / 3600000, 0);
    const hoursDone = occ.filter(o => o.end <= now).reduce((n, o) => n + (o.end - o.start) / 3600000, 0);
    const next = occ.filter(o => o.start > now).sort((a, b) => a.start - b.start)[0] || null;
    const td = window.AlixoTodo ? { open: AlixoTodo.openCount(), late: AlixoTodo.lateCount(), today: AlixoTodo.todos().filter(t => !t.done && t.due === todayKey()).length, doneWeek: AlixoTodo.todos().filter(t => t.done && t.doneAt >= monday.getTime()).length } : { open: 0, late: 0, today: 0, doneWeek: 0 };
    const files = (Array.isArray(state.files) ? state.files : []).filter(f => (f.createdAt || 0) >= monday.getTime()).length;
    const streak = (() => { let n = 0; const keys = new Set(); for (const d of state.docs) for (const b of blocksOf(d)) { if (b.day) keys.add(b.day); if (b.mod) keys.add(b.mod); } const cur = new Date(); for (let i = 0; i < 60; i++) { const k = dayKey(cur); if (keys.has(k)) n++; else if (i > 0) break; cur.setDate(cur.getDate() - 1); } return n; })();
    return { monday, perDay, wordsWeek, wordsPrev, blocksWeek, docsWeek: docsWeek.size, docsPrev: docsPrev.size, created, hours, hoursDone, next, td, files, streak, dayIndex: (now.getDay() + 6) % 7 };
  }

  const fmtH = h => (h >= 1 ? (Math.round(h * 2) / 2).toString().replace('.', ',') + ' h' : Math.round(h * 60) + ' min');
  const fmtN = n => n.toLocaleString('fr-FR');
  function greeting() {
    const h = new Date().getHours();
    const hello = h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
    const acc = window.AlixoAuth && AlixoAuth.account();
    const prenom = acc && acc.name && !/@/.test(acc.name) ? acc.name.split(/\s+/)[0] : '';
    return `${hello}${prenom ? ' ' + prenom : ''}`;
  }
  function trend(cur, prev, unit) {
    if (!prev && !cur) return '';
    if (!prev) return `<span class="wk-trend up">nouveau</span>`;
    const p = Math.round((cur - prev) / prev * 100);
    if (Math.abs(p) < 5) return `<span class="wk-trend">comme la semaine passée</span>`;
    return `<span class="wk-trend ${p > 0 ? 'up' : 'down'}">${p > 0 ? '+' : ''}${p} % vs semaine passée${unit ? '' : ''}</span>`;
  }

  function open(manual) {
    close();
    const s = compute();
    const max = Math.max(1, ...Object.values(s.perDay));
    const bars = Object.entries(s.perDay).map(([k, v], i) => `<div class="wk-bar ${i === s.dayIndex ? 'today' : ''} ${i > s.dayIndex ? 'future' : ''}" title="${esc(DOWS[i])} : ${fmtN(v)} mot${v > 1 ? 's' : ''}"><i style="height:${Math.max(v ? 6 : 2, Math.round(v / max * 64))}px"></i><span>${DOWS[i]}</span></div>`).join('');
    const hm = d => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    const nextTxt = s.next ? `${esc(s.next.ev.title)} · ${s.next.start.toLocaleDateString('fr-FR', { weekday: 'long' })} ${hm(s.next.start)}${s.next.ev.lieu ? ' · ' + esc(s.next.ev.lieu) : ''}` : '';
    const msg = !s.wordsWeek && !s.docsWeek ? 'La semaine commence : ouvrez une séance et écrivez vos premières lignes.' : s.wordsWeek > s.wordsPrev ? 'Vous écrivez plus que la semaine dernière — continuez sur cette lancée.' : s.streak >= 3 ? `${s.streak} jours d’affilée avec des notes : belle régularité.` : 'Chaque ligne compte — bonnes révisions.';
    const ov = document.createElement('div');
    ov.id = 'wkov';
    ov.innerHTML = `<div class="wk-card" role="dialog" aria-label="Bilan de la semaine">
      <button class="wk-x" type="button" title="Fermer">✕</button>
      <div class="wk-hello">${esc(greeting())} <span class="wk-wave">👋</span></div>
      <div class="wk-sub">Cette semaine, depuis lundi ${s.monday.getDate()} ${MONTHS_FR[s.monday.getMonth()]} :</div>
      <div class="wk-tiles">
        <div class="wk-tile"><b>${fmtN(s.wordsWeek)}</b><span>mot${s.wordsWeek > 1 ? 's' : ''} écrit${s.wordsWeek > 1 ? 's' : ''}</span>${trend(s.wordsWeek, s.wordsPrev)}</div>
        <div class="wk-tile"><b>${s.docsWeek}</b><span>séance${s.docsWeek > 1 ? 's' : ''} travaillée${s.docsWeek > 1 ? 's' : ''}</span>${s.created ? `<span class="wk-trend">${s.created} créée${s.created > 1 ? 's' : ''}</span>` : trend(s.docsWeek, s.docsPrev)}</div>
        <div class="wk-tile"><b>${fmtH(s.hours)}</b><span>de cours à l’agenda</span>${s.hours ? `<span class="wk-trend">${fmtH(s.hoursDone)} déjà passées</span>` : '<span class="wk-trend">agenda vide</span>'}</div>
        <div class="wk-tile ${s.td.late ? 'warn' : ''}"><b>${s.td.open}</b><span>tâche${s.td.open > 1 ? 's' : ''} à faire</span><span class="wk-trend ${s.td.late ? 'down' : ''}">${s.td.late ? `${s.td.late} en retard` : s.td.today ? `${s.td.today} pour aujourd’hui` : s.td.doneWeek ? `${s.td.doneWeek} faite${s.td.doneWeek > 1 ? 's' : ''} cette semaine` : 'rien d’urgent'}</span></div>
      </div>
      <div class="wk-chart"><div class="wk-ctitle">Mots écrits par jour</div><div class="wk-bars">${bars}</div></div>
      ${nextTxt ? `<div class="wk-next"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span><b>Prochain cours :</b> ${nextTxt}</span></div>` : ''}
      <div class="wk-msg">${esc(msg)}${s.streak >= 2 ? ` <span class="wk-streak" title="Jours consécutifs avec des notes">🔥 ${s.streak} j</span>` : ''}</div>
      <div class="wk-foot">
        <span class="wk-off">Votre semaine en un coup d’œil, à chaque ouverture</span>
        <div class="wk-actions">${s.td.open ? '<button class="cta ghost small" data-wk="todo" type="button">Mes tâches</button>' : ''}<button class="cta wk-go" data-wk="go" type="button">C’est parti</button></div>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('.wk-x') || e.target.closest('[data-wk="go"]')) { close(); return; }
      if (e.target.closest('[data-wk="todo"]')) { close(); AlixoApp.openTodoHome(); }
    });
    const esc1 = e => { if (e.key === 'Escape') { close(); } };
    document.addEventListener('keydown', esc1, { once: true });
    if (!manual) { try { localStorage.setItem(SHOWN_KEY, todayKey()); } catch { /* stockage indisponible */ } }
  }
  function close() { const ov = $('#wkov'); if (ov) ov.remove(); }
  /* au démarrage : à chaque ouverture de l'application (1.12 — plus seulement une fois par jour),
     jamais par-dessus la connexion, le questionnaire de bienvenue ou un compte suspendu */
  let shownThisRun = false;
  function maybeOpen() {
    if (shownThisRun) return;
    delete state.settings.noWeekly;   // ancien réglage (≤ 1.12) : le bilan est désormais toujours actif
    const authov = $('#authov'); if (authov && !authov.hidden) { setTimeout(maybeOpen, 2500); return; }
    if ($('#obov') || $('#suspov')) { setTimeout(maybeOpen, 4000); return; }
    if (!state.docs.length) return;
    shownThisRun = true;
    open(false);
  }
  return { open, close, maybeOpen, compute };
})();
