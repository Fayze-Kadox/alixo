/* ============================================================
   Alixo — quiz en direct : page des participants (quiz.html, 1.24, refonte 1.25)
   Sans compte : la page lit live/{code} (état de la partie, thème, question en cours puis réponse révélée,
   classement) et écrit sa propre fiche live/{code}/players/{pid} (pseudo, réponses, puis score et
   retour posés par le présentateur). Identité : un identifiant aléatoire gardé dans localStorage par
   code de partie — recharger la page ne fait pas perdre sa place. Règles : firestore.rules (« Quiz en direct »).
   Écrans : rejoindre (code + pseudo) → attente → question (ou page d'information) → réponse envoyée → résultat → classement final.
   Le thème choisi par le présentateur (couleurs, police) s'applique à la page.
   ============================================================ */
'use strict';

(() => {
  const C = window.QuizCore;
  const $ = s => document.querySelector(s);
  const esc = C.esc;
  const main = $('#qp-main'), me = $('#qp-me');
  let db = null;
  try { firebase.initializeApp(window.ALIXO_FIREBASE_CONFIG); db = firebase.firestore(); } catch (e) { console.error(e); }

  const params = new URLSearchParams(location.search);
  let code = (params.get('code') || '').replace(/\D/g, '').slice(0, 6);
  let name = '';
  try { name = localStorage.getItem('alixo.quiz.name') || ''; } catch { /* */ }
  let pid = '', unsubLive = null, unsubMe = null, game = null, mine = null;
  let shownQ = null, shownAt = 0, answered = false, timer = null, themeKey = '';
  const pidFor = c => { try { const k = 'alixo.quiz.pid.' + c; let v = localStorage.getItem(k); if (!v) { v = C.uid() + C.uid(); localStorage.setItem(k, v); } return v; } catch { return C.uid() + C.uid(); } };
  const fmtPts = n => (n || 0).toLocaleString('fr-FR');

  /* ---------------- thème ---------------- */
  function applyTheme(t) {
    const k = JSON.stringify(t || null);
    if (k === themeKey) return;
    themeKey = k;
    const r = t && t.pal ? t : C.resolveTheme(t);
    document.body.style.cssText = C.themeStyle(r);
    document.documentElement.style.background = r.bg;
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = r.bg;
  }

  /* ---------------- écrans ---------------- */
  function screenJoin(err) {
    me.innerHTML = '';
    main.innerHTML = `<div class="qp-card"><h1>Rejoindre un quiz</h1><p>Entrez le code affiché à l’écran du présentateur, puis un pseudo.</p>
      <form id="qp-form">
        <label class="qp-field"><span>Code de la partie</span><input class="code" id="qp-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000" value="${esc(code)}" autocomplete="off" required></label>
        <label class="qp-field"><span>Votre pseudo</span><input id="qp-name" maxlength="24" placeholder="Prénom ou surnom" value="${esc(name)}" autocomplete="nickname" required></label>
        ${err ? `<div class="qp-err">${esc(err)}</div>` : ''}
        <button type="submit" class="qp-next">Rejoindre →</button>
      </form></div>`;
    (code ? $('#qp-name') : $('#qp-code')).focus();
    $('#qp-form').addEventListener('submit', e => { e.preventDefault(); join($('#qp-code').value, $('#qp-name').value); });
  }
  function screenWait(text, sub) {
    main.innerHTML = `<div class="qp-card"><div class="qp-wait"><div style="font-size:48px">${game && game.state === 'lobby' ? '🙌' : '⏳'}</div><div style="margin-top:10px;font-weight:700;color:var(--qp-ink)">${esc(text)}<span class="qp-dots"></span></div>${sub ? `<div style="margin-top:6px;font-size:15px">${esc(sub)}</div>` : ''}</div></div>`;
  }
  function screenEnd(txt) {
    unsubscribe();
    main.innerHTML = `<div class="qp-card"><h1>${esc(txt || 'La partie est terminée')}</h1><p>Merci d’avoir joué !</p><button type="button" class="qp-next" id="qp-again">Rejoindre une autre partie</button></div>`;
    $('#qp-again').addEventListener('click', () => { code = ''; location.href = location.pathname; });
  }
  function renderMe() {
    me.innerHTML = name ? `<b>${esc(name)}</b>${mine && mine.score ? ` · ${fmtPts(mine.score)} pts` : ''}${mine && mine.rank ? ` · ${mine.rank}<sup>${mine.rank === 1 ? 'er' : 'e'}</sup>` : ''}` : '';
  }

  /* ---------------- rejoindre ---------------- */
  async function join(c, n) {
    code = String(c || '').replace(/\D/g, '').slice(0, 6); name = String(n || '').trim().slice(0, 24);
    if (code.length !== 6) { screenJoin('Le code comporte 6 chiffres.'); return; }
    if (!name) { screenJoin('Choisissez un pseudo.'); return; }
    if (!db) { screenJoin('Service indisponible : réessayez dans un instant.'); return; }
    try { localStorage.setItem('alixo.quiz.name', name); } catch { /* */ }
    screenWait('Connexion à la partie');
    let snap;
    try { snap = await db.collection('live').doc(code).get(); }
    catch (e) { console.error(e); screenJoin('Connexion impossible : vérifiez votre accès à Internet.'); return; }
    if (!snap.exists || ['closed'].includes((snap.data() || {}).state)) { screenJoin('Aucune partie en cours avec ce code.'); return; }
    if ((snap.data() || {}).state === 'end') { screenJoin('Cette partie est terminée.'); return; }
    applyTheme((snap.data() || {}).theme);
    pid = pidFor(code);
    const ref = db.collection('live').doc(code).collection('players').doc(pid);
    try {
      const m = await ref.get();
      if (m.exists) await ref.update({ name, lastAt: Date.now() });
      else await ref.set({ name, joinedAt: Date.now(), lastAt: Date.now(), answers: {}, score: 0 });
    } catch (e) { console.error(e); screenJoin(e && e.code === 'permission-denied' ? 'Participation refusée (règles du quiz non publiées).' : 'Impossible de rejoindre la partie.'); return; }
    try { history.replaceState(null, '', location.pathname + '?code=' + code); } catch { /* */ }
    renderMe();
    unsubLive = db.collection('live').doc(code).onSnapshot(s => { if (!s.exists) { screenEnd('La partie a été fermée'); return; } game = s.data(); applyTheme(game.theme); onGame(); }, err => { console.error(err); screenWait('Connexion perdue', 'La page réessaie automatiquement…'); });
    unsubMe = ref.onSnapshot(s => { mine = s.exists ? s.data() : null; renderMe(); if (game && game.state === 'reveal') renderReveal(); }, () => {});
  }
  function unsubscribe() { if (unsubLive) unsubLive(); if (unsubMe) unsubMe(); unsubLive = unsubMe = null; clearInterval(timer); }

  /* ---------------- suivi de la partie ---------------- */
  function onGame() {
    if (!game) return;
    if (game.state === 'lobby') { shownQ = null; screenWait('En attente du présentateur', `${game.title ? game.title + ' · ' : ''}${game.n || ''} question${game.n > 1 ? 's' : ''}`); return; }
    if (game.state === 'q' && game.q) { if (shownQ !== game.q.id) renderQuestion(); return; }
    if (game.state === 'reveal' && game.q) { clearInterval(timer); renderReveal(); return; }
    if (game.state === 'end') { clearInterval(timer); renderFinal(); return; }
    if (game.state === 'closed') screenEnd('La partie a été fermée');
  }
  function timerHTML(left, total) {
    if (!total) return '<span class="qp-timer none">∞</span>';
    const f = Math.max(0, Math.min(1, left / total));
    return `<span class="qp-timer${left <= 5 ? ' low' : ''}" style="--f:${f.toFixed(3)}"><b>${Math.ceil(Math.max(0, left))}</b></span>`;
  }
  const imgHTML = q => (q.img ? `<img class="qp-qimg" src="${esc(q.img)}" alt="">` : '');
  function renderQuestion() {
    const q = game.q; shownQ = q.id; shownAt = Date.now(); answered = !!(mine && mine.answers && mine.answers[q.id]);
    clearInterval(timer);
    const label = C.TYPES[q.t] ? C.TYPES[q.t].name : '';
    if (q.t === 'info') {
      main.innerHTML = `<div class="qp-top" style="min-height:0;padding:0 0 6px"><span class="qp-prog">Page ${(game.qi || 0) + 1} / ${game.n || '?'}</span></div>
        <div class="qp-page-wrap">${imgHTML(q)}<div class="qp-q">${esc(q.text || '')}</div>${C.widgetHTML(q)}</div>
        <div class="qp-foot">Regardez l’écran du présentateur : la suite arrive.</div>`;
      return;
    }
    const left0 = game.qEnd ? (game.qEnd - Date.now()) / 1000 : 0;
    main.innerHTML = `<div class="qp-top" style="min-height:0;padding:0 0 6px"><span class="qp-prog">Question ${(game.qi || 0) + 1} / ${game.n || '?'}</span><span class="qp-ptype">${esc(label)}</span><span id="qp-timer" style="margin-left:auto">${timerHTML(left0, q.time)}</span></div>
      ${imgHTML(q)}<div class="qp-q">${esc(q.text || '')}</div>
      <div class="qp-widget" id="qp-widget">${answered ? sentHTML() : C.widgetHTML(q)}</div>`;
    if (!answered) C.bindWidget(q, $('#qp-widget'), v => sendAnswer(q, v));
    if (q.time) timer = setInterval(() => { const left = (game.qEnd - Date.now()) / 1000; const t = $('#qp-timer'); if (t) t.innerHTML = timerHTML(left, q.time); if (left <= 0) { clearInterval(timer); if (!answered) { answered = true; const w = $('#qp-widget'); if (w) w.innerHTML = `<div class="qp-sent"><div class="qp-big">⏱</div><h2>Temps écoulé</h2><p>La réponse arrive sur l’écran du présentateur…</p></div>`; } } }, 250);
  }
  const sentHTML = () => `<div class="qp-sent"><div class="qp-big">✅</div><h2>Réponse envoyée</h2><p>Regardez l’écran du présentateur : la suite arrive.</p></div>`;
  async function sendAnswer(q, v) {
    if (answered) return;
    answered = true;
    const el = Date.now() - shownAt;
    $('#qp-widget').innerHTML = sentHTML();
    try { await db.collection('live').doc(code).collection('players').doc(pid).update({ ['answers.' + q.id]: { v, el, at: Date.now() }, lastAt: Date.now() }); }
    catch (e) { console.error(e); answered = false; $('#qp-widget').innerHTML = `<div class="qp-err">Envoi impossible : réessayez.</div>` + C.widgetHTML(q, { v }); C.bindWidget(q, $('#qp-widget'), vv => sendAnswer(q, vv)); }
  }
  function renderReveal() {
    const q = game.q; if (!q) return;
    const a = game.answer || {};
    const full = Object.assign({}, q, { ans: a.ans, tol: a.tol || 0, unit: a.unit || q.unit || '' });
    if (q.t === 'order' && Array.isArray(a.ans)) { const by = new Map((q.opts || []).map(o => [o.id, o])); full.opts = a.ans.map(id => by.get(id)).filter(Boolean); }
    if (q.t === 'match') { full.pairs = a.pairs || []; full.rkey = a.rkey || null; }
    const fb = mine && mine.fb && mine.fb.qid === q.id ? mine.fb : null;
    const myV = fb ? fb.v : (mine && mine.answers && mine.answers[q.id] ? mine.answers[q.id].v : null);
    const unscored = !C.isScored(q);
    main.innerHTML = `<div class="qp-top" style="min-height:0;padding:0 0 6px"><span class="qp-prog">Question ${(game.qi || 0) + 1} / ${game.n || '?'} · réponse</span></div>
      <div class="qp-q">${esc(q.text || '')}</div>
      <div class="qp-widget">${unscored && q.t !== 'poll' ? `<div class="qp-good">Votre réponse : <b>${esc(C.answerText(full, myV))}</b></div>` : C.widgetHTML(full, { reveal: true, v: myV, done: true })}</div>
      ${fb ? `<div class="qp-fb ${unscored ? 'poll' : fb.ok ? 'ok' : fb.answered ? 'ko' : 'late'}"><div class="qp-fbt">${unscored ? 'Merci pour votre réponse' : fb.ok ? 'Bonne réponse !' : fb.answered ? 'Mauvaise réponse' : 'Pas de réponse'}</div>${unscored ? '' : `<div class="qp-fbp">${fb.ok ? '+ ' + fmtPts(fb.pts) + ' pts' : 'Bonne réponse : <b>' + esc(C.correctText(full)) + '</b>'}</div>`}<div class="qp-fbr">Total : <b>${fmtPts(mine.score)}</b> pts${mine.rank ? ` · ${mine.rank}<sup>${mine.rank === 1 ? 'er' : 'e'}</sup> sur ${Math.max(mine.rank, (game.top || []).length)}` : ''}</div></div>` : '<div class="qp-wait" style="padding:14px 0 0;font-size:15px">Calcul des points<span class="qp-dots"></span></div>'}`;
  }
  function renderFinal() {
    const top = game.top || [];
    const myRank = mine && mine.rank ? mine.rank : (top.findIndex(p => p.pid === pid) + 1 || null);
    main.innerHTML = `<div class="qp-end"><div class="qp-endscore">${fmtPts(mine ? mine.score : 0)}<small>points</small></div>
      ${myRank ? `<div class="qp-rank">${myRank}<sup>${myRank === 1 ? 'er' : 'e'}</sup> sur ${Math.max(myRank, top.length)}<small>${myRank === 1 ? 'Bravo, vous avez gagné !' : myRank <= 3 ? 'Sur le podium !' : 'Merci d’avoir joué'}</small></div>` : ''}
      <div class="qp-endlist">${top.slice(0, 10).map(p => `<div class="qp-endrow${p.pid === pid ? ' ok' : ''}"><span>${p.rank || ''}</span><span class="qp-endq">${esc(p.name)}</span><span class="qp-endp">${fmtPts(p.score)}</span></div>`).join('')}</div>
      <button type="button" class="qp-next ghost" id="qp-again" style="margin-top:18px">Rejoindre une autre partie</button></div>`;
    $('#qp-again').addEventListener('click', () => { unsubscribe(); location.href = location.pathname; });
  }

  applyTheme(null);
  if (!db) screenJoin('Service indisponible : réessayez dans un instant.');
  else screenJoin();   // code et pseudo pré-remplis s'ils sont connus : on confirme d'un bouton
})();
