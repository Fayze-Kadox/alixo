/* ============================================================
   Alixo — présentation animée des nouveautés (motion design)
   ------------------------------------------------------------
   Au premier lancement après une mise à jour, app.js appelle AlixoWhatsNew.open(version) :
   une popup joue une courte séquence de scènes animées (une idée par scène, texte + illustration),
   avec progression, pause, précédent / suivant, et fermeture. Les scènes de chaque version sont
   décrites dans js/whatsnew-scenes.js (AlixoWhatsNew.register) — c'est le seul fichier à écrire
   à chaque mise à jour (voir .claude/skills/alixo-update).

   Fonctionne aussi sans app.js (page autonome nouveautes.html : rendu vidéo, site) : aucune
   dépendance, thème via html[data-theme].

   Format d'une scène :
     { kind: 'intro' | 'feature' | 'outro',   // intro et outro : texte centré ; feature : texte + illustration
       kicker: 'Nouveauté',                   // petite étiquette au-dessus du titre (facultatif)
       title: 'Un <em>quiz</em> refondu',     // HTML léger autorisé : <em> = mot en couleur, <br>
       text: 'Une phrase…',                   // paragraphe (facultatif)
       bullets: ['<b>Thèmes</b> : …', '…'],   // puces (facultatif, 2 à 4)
       art: 'cards' | 'chart' | 'board' | 'quiz' | 'text' | 'palette' | 'list' | { icon: '🎯' } | { svg: '<svg…>' } | { image: 'url' },
       accent: '#33658a', accent2: '#b3762a', // couleurs des halos et de l'accent (facultatif)
       dur: 6000 }                            // durée en ms avant le passage automatique (défaut 6000 ; intro 4500 ; outro 7000)
   ============================================================ */
'use strict';

window.AlixoWhatsNew = (() => {
  const REG = {};                 // version → { scenes, title }
  const q = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /* HTML « léger » des titres et puces : seules <em> <b> <i> <br> sont gardées, le reste est échappé */
  const lite = s => esc(s).replace(/&lt;(\/?)(em|b|i|br)&gt;/g, '<$1$2>');
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg>'
  };

  function register(version, def) {
    if (!version || !def) return;
    const scenes = Array.isArray(def) ? def : def.scenes;
    if (!Array.isArray(scenes) || !scenes.length) return;
    REG[version] = { scenes, title: (def && def.title) || `Alixo ${version}` };
  }
  const has = v => !!REG[v];
  const versions = () => Object.keys(REG);

  /* ---------- illustrations ---------- */
  function artHTML(art, scene) {
    if (!art) return '';
    const lines = (cls, n) => Array.from({ length: n }, (_, i) => `<div class="ln ${cls[i % cls.length]}" style="--i:${i}"></div>`).join('');
    const frame = inner => `<div class="fr"><div class="bar"><i></i><i></i><i></i></div><div class="in">${inner}</div></div>`;
    if (typeof art === 'object') {
      if (art.image) return `<div class="wn-art image"><img src="${esc(art.image)}" alt="${esc(art.alt || '')}"></div>`;
      if (art.svg) return `<div class="wn-art icon"><div class="big">${art.svg}</div></div>`;
      if (art.icon) return `<div class="wn-art icon"><div class="big">${esc(art.icon)}</div></div>`;
      return '';
    }
    switch (art) {
      case 'cards': return `<div class="wn-art cards">${frame([0, 1, 2, 3, 4, 5].map(i => `<div class="cd ${i === 1 ? 'hi' : ''}" style="--i:${i}"></div>`).join(''))}</div>`;
      case 'chart': return `<div class="wn-art chart">${frame([45, 70, 55, 90, 65, 80].map((h, i) => `<div class="br" style="--i:${i}; height:${h}%"></div>`).join(''))}</div>`;
      case 'board': return `<div class="wn-art board">${frame('<div class="pi y" style="--i:0"></div><div class="pi p" style="--i:1"></div><div class="pi g" style="--i:2"></div><div class="ar"></div>')}</div>`;
      case 'quiz': return `<div class="wn-art quiz">${frame('<div class="qq"></div>' + ['A', 'B', 'C', 'D'].map((l, i) => `<div class="qa ${i === 2 ? 'ok' : ''}" style="--i:${i}">${l}</div>`).join(''))}</div>`;
      case 'text': return `<div class="wn-art text"><div class="in">${lines(['t', 's', 'm', 's', 'x', 's', 'm'], 7)}</div></div>`;
      case 'palette': return `<div class="wn-art palette">${frame(['#33658a', '#b3762a', '#2e8b6a', '#8a4b9c', '#c04343', '#3d6bb5', '#1f2a37', '#d3a05e'].map((c, i) => `<div class="sw" style="--i:${i}; background:${c}"></div>`).join(''))}</div>`;
      case 'list': return `<div class="wn-art list">${frame([1, 1, 1, 0].map((on, i) => `<div class="ck ${on ? 'on' : ''}" style="--i:${i}"><i></i><s></s></div>`).join(''))}</div>`;
      default: return `<div class="wn-art">${frame(lines(['t', 's', 'm', 's', 'x'], 5))}</div>`;
    }
  }

  function sceneHTML(s, version, index, total) {
    const kind = s.kind || 'feature';
    const solo = kind !== 'feature' || !s.art;
    const acc = s.accent ? `--wn-acc:${esc(s.accent)};` : '';
    const acc2 = s.accent2 ? `--wn-acc2:${esc(s.accent2)};` : '';
    let txt = '';
    if (s.kicker || kind === 'feature') txt += `<div class="wn-kicker"><span class="wn-dot"></span>${lite(s.kicker || `Nouveauté ${index} / ${total}`)}</div>`;
    if (kind === 'intro' && s.logo !== false) txt += `<img class="wn-logo" src="${esc(s.logo || 'logo.png')}" alt="">`;
    if (kind === 'intro' && s.version !== false) txt += `<div class="wn-version">Alixo <span>${esc(s.version || version)}</span></div>`;
    if (s.title) txt += `<h2 class="wn-title">${lite(s.title)}</h2>`;
    if (s.text) txt += `<p class="wn-text">${lite(s.text)}</p>`;
    if (Array.isArray(s.bullets) && s.bullets.length) txt += `<ul class="wn-list">${s.bullets.map((b, i) => `<li style="--i:${i}"><span>${lite(b)}</span></li>`).join('')}</ul>`;
    return `<div class="wn-scene ${solo ? 'solo' : ''} k-${kind}" style="${acc}${acc2}"><div class="wn-txt">${txt}</div>${solo ? '' : artHTML(s.art, s)}</div>`;
  }

  /* ---------- lecteur ---------- */
  let cur = null;   // { version, scenes, i, timer, paused, ov, onClose, auto }
  function defaultDur(s) { return s.dur || (s.kind === 'intro' ? 4500 : s.kind === 'outro' ? 7000 : 6000); }

  function open(version, opts) {
    opts = opts || {};
    const def = REG[version]; if (!def) return false;
    close(true);
    const ov = document.createElement('div'); ov.id = 'wnov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', `Nouveautés d’Alixo ${version}`);
    ov.innerHTML = `<div class="wn-card"><div class="wn-stage"><div class="wn-blob a"></div><div class="wn-blob b"></div></div>
      <button class="wn-close" type="button" title="Fermer (Échap)" aria-label="Fermer">×</button>
      <div class="wn-ctrl">
        <button class="wn-btn" data-act="prev" type="button" title="Précédent (←)" aria-label="Précédent">${ICON.prev}</button>
        <button class="wn-btn" data-act="pause" type="button" title="Pause (Espace)" aria-label="Pause">${ICON.pause}</button>
        <button class="wn-btn" data-act="next" type="button" title="Suivant (→)" aria-label="Suivant">${ICON.next}</button>
        <div class="wn-prog">${def.scenes.map(() => '<span><i></i></span>').join('')}</div>
        <span class="wn-counter"></span>
        <button class="wn-btn main" data-act="skip" type="button">Passer</button>
      </div></div>`;
    document.body.appendChild(ov);
    cur = { version, scenes: def.scenes, i: -1, timer: null, paused: false, ov, onClose: opts.onClose, auto: opts.auto !== false, loop: !!opts.loop };
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b) { const a = b.dataset.act; if (a === 'prev') go(cur.i - 1); else if (a === 'next') go(cur.i + 1); else if (a === 'pause') togglePause(); else if (a === 'skip') close(); return; }
      if (e.target.closest('.wn-close')) { close(); return; }
      const p = e.target.closest('.wn-prog span'); if (p) go([...p.parentNode.children].indexOf(p));
      else if (e.target === ov && !document.body.classList.contains('wn-page')) close();
    });
    document.addEventListener('keydown', onKey);
    go(0);
    return true;
  }
  function onKey(e) {
    if (!cur) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(cur.i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur.i - 1); }
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
  }
  function togglePause() {
    if (!cur) return;
    cur.paused = !cur.paused;
    cur.ov.classList.toggle('paused', cur.paused);
    const b = cur.ov.querySelector('[data-act="pause"]');
    if (b) { b.innerHTML = cur.paused ? ICON.play : ICON.pause; b.title = cur.paused ? 'Lecture (Espace)' : 'Pause (Espace)'; }
    if (cur.paused) { clearTimeout(cur.timer); cur.timer = null; cur.left = Math.max(300, cur.until - Date.now()); }
    else arm(cur.left);
  }
  function arm(ms) {
    clearTimeout(cur.timer);
    if (!cur.auto) return;
    cur.until = Date.now() + ms;
    cur.timer = setTimeout(() => { if (cur && !cur.paused) go(cur.i + 1); }, ms);
  }
  function go(i) {
    if (!cur) return;
    const n = cur.scenes.length;
    if (i >= n) { if (cur.loop) i = 0; else { close(); return; } }
    if (i < 0) i = 0;
    const card = cur.ov.querySelector('.wn-card');
    const old = card.querySelector('.wn-scene');
    const next = document.createElement('div');
    // étiquette « Nouveauté k / N » : on ne compte que les scènes « feature » (ni l'intro ni la fin)
    const fi = cur.scenes.slice(0, i + 1).filter(s => (s.kind || 'feature') === 'feature').length;
    next.innerHTML = sceneHTML(cur.scenes[i], cur.version, fi, featureCount(cur.scenes));
    const el = next.firstElementChild;
    if (old) {
      old.classList.add('leaving');
      old.addEventListener('animationend', () => old.remove(), { once: true });
      setTimeout(() => old.remove(), 500);
    }
    card.insertBefore(el, card.querySelector('.wn-ctrl'));
    cur.i = i;
    const dur = defaultDur(cur.scenes[i]);
    cur.ov.querySelectorAll('.wn-prog span').forEach((s, k) => {
      s.classList.toggle('done', k < i); s.classList.toggle('cur', k === i);
      if (k === i) { s.style.setProperty('--d', dur + 'ms'); const bar = s.querySelector('i'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    });
    const c = cur.ov.querySelector('.wn-counter'); if (c) c.textContent = `${i + 1} / ${n}`;
    const skip = cur.ov.querySelector('[data-act="skip"]'); if (skip) skip.textContent = i === n - 1 ? 'Terminer' : 'Passer';
    const prev = cur.ov.querySelector('[data-act="prev"]'); if (prev) prev.disabled = i === 0;
    if (cur.paused) { cur.left = dur; cur.until = Date.now() + dur; } else arm(dur);
    try { cur.ov.dispatchEvent(new CustomEvent('wn-scene', { detail: { index: i, total: n, version: cur.version } })); } catch { /* rien */ }
  }
  function close(silent) {
    if (!cur) return;
    const c = cur; cur = null;
    clearTimeout(c.timer);
    document.removeEventListener('keydown', onKey);
    const done = () => { c.ov.remove(); if (!silent && typeof c.onClose === 'function') { try { c.onClose(); } catch (e) { console.error(e); } } };
    if (silent) done();
    else { c.ov.classList.add('closing'); c.ov.addEventListener('animationend', done, { once: true }); setTimeout(done, 300); }
    try { document.dispatchEvent(new CustomEvent('wn-closed', { detail: { version: c.version, silent: !!silent } })); } catch { /* rien */ }
  }

  /* Nombre de scènes « feature » (pour l'étiquette « Nouveauté n / N ») */
  function featureCount(scenes) { return scenes.filter(s => (s.kind || 'feature') === 'feature').length; }
  /* durée totale de la séquence, en ms (utile au rendu vidéo) */
  function duration(version) { const d = REG[version]; return d ? d.scenes.reduce((t, s) => t + defaultDur(s), 0) : 0; }

  return { register, has, versions, open, close, go, duration, featureCount, get current() { return cur; }, get scenes() { return REG; } };
})();
