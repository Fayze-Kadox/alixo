/* ============================================================
   Alixo — vue « Galaxie » de la bibliothèque (1.13)
   Troisième affichage, à côté de la grille et de l'arbre : le dossier
   affiché est un soleil, ses sous-dossiers des planètes (couleur du
   dossier, taille selon le nombre de séances), les séances, présentations
   et fichiers de petites étoiles en orbite. Tout flotte doucement ; des
   particules circulent le long des liens parent → enfant.

   Souris : survol = mise en avant + étiquette ; clic sur une séance = ouvrir ;
   clic sur un dossier = centrer dessus, double-clic = y entrer ; clic droit =
   menu contextuel habituel ; glisser un astre = le déplacer ; glisser le
   fond = déplacer la vue ; molette = zoom ; « Recentrer » remet tout en place.

   Rendu 3D (three.js, js/galaxy3d.js) quand WebGL est disponible ; ce fichier
   garde la disposition (forces) et le rendu 2D de repli. Bouton « 2D / 3D ».

   Chargé APRÈS app.js : utilise ses globales (state, currentFolderId,
   folder, childFolders, folderDocs, openDoc, gotoFolder, AlixoFiles…).
   ============================================================ */
'use strict';

window.AlixoGalaxy = (() => {
  const HOME_BLUE = '#33658a';
  let host = null, canvas = null, ctx = null, hud = null;
  let nodes = [], links = [], byId = new Map();
  let running = false, raf = 0, lastT = 0, t0 = 0;
  let W = 0, H = 0, dpr = 1;
  let cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
  let hover = null, drag = null, pan = null, pressed = null, lastClick = { id: null, t: 0 };
  let stars = [];
  let settled = 0;      // itérations de mise en place (les premières sont plus « chaudes »)
  let ro = null;

  /* ---------------- couleurs du thème ---------------- */
  const css = (name, fb) => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; };
  const isDark = () => document.documentElement.dataset.theme === 'dark';
  function theme() {
    const dark = isDark();
    return {
      dark,
      bg1: dark ? '#0b0e15' : '#f3f5f9',
      bg2: dark ? '#141a28' : '#e6ebf4',
      ink: css('--ink', dark ? '#e8eaed' : '#202124'),
      ink2: css('--ink-2', dark ? '#bdc1c6' : '#5f6368'),
      ink3: css('--ink-3', dark ? '#80868b' : '#9198a1'),
      star: dark ? '255,255,255' : '51,101,138',
      link: dark ? '255,255,255' : '32,33,36',
      tint: css('--tint', HOME_BLUE)
    };
  }
  function hexRgb(h) {
    const m = String(h || '').trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return '90,110,140';
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  /* ---------------- construction du graphe ---------------- */
  function build(keepPositions) {
    const prev = keepPositions ? new Map(nodes.map(n => [n.id, n])) : new Map();
    nodes = []; links = []; byId = new Map();
    const rootF = typeof folder === 'function' ? folder(currentFolderId) : null;
    const rootId = 'f:' + (currentFolderId || 'root');
    const add = n => { const o = prev.get(n.id); if (o) { n.x = o.x; n.y = o.y; n.vx = o.vx; n.vy = o.vy; n.pin = o.pin; } nodes.push(n); byId.set(n.id, n); return n; };
    const root = add({ id: rootId, kind: 'root', label: rootF ? rootF.nom : 'Mes cours', color: rootF ? folderTint(rootF.id) : HOME_BLUE, r: 26, x: 0, y: 0, vx: 0, vy: 0, depth: 0, fid: currentFolderId || null, phase: Math.random() * 6.28 });
    const walk = (fid, parent, depth) => {
      const fs = childFolders(fid);
      const ds = folderDocs(fid).slice().sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
      const fl = window.AlixoFiles && AlixoFiles.inFolder ? (AlixoFiles.inFolder(fid) || []) : [];
      for (const f of fs) {
        const nd = subtreeDocCount(f.id);
        const n = add({ id: 'f:' + f.id, kind: 'folder', label: f.nom, color: f.couleur || parent.color, r: Math.min(22, 10 + Math.sqrt(nd) * 2.6), depth: depth + 1, fid: f.id, f, count: nd, phase: Math.random() * 6.28, x: NaN, y: NaN, vx: 0, vy: 0 });
        links.push({ a: parent, b: n, kind: 'folder', p: Math.random() });
        walk(f.id, n, depth + 1);
      }
      for (const d of ds) {
        const slides = d.kind === 'slides', sheet = d.kind === 'sheet', board = d.kind === 'board';
        const n = add({ id: 'd:' + d.id, kind: slides ? 'slides' : sheet ? 'sheet' : board ? 'board' : 'doc', label: d.titre || 'Sans titre', color: parent.color, r: slides ? 5.5 : sheet || board ? 5 : 4.6, depth: depth + 1, did: d.id, d, pinned: !!d.pinned, phase: Math.random() * 6.28, x: NaN, y: NaN, vx: 0, vy: 0 });
        links.push({ a: parent, b: n, kind: 'doc', p: Math.random() });
      }
      for (const f of fl) {
        const n = add({ id: 'x:' + f.id, kind: 'file', label: f.name || f.nom || 'Fichier', color: parent.color, r: 3.4, depth: depth + 1, fileId: f.id, file: f, phase: Math.random() * 6.28, x: NaN, y: NaN, vx: 0, vy: 0 });
        links.push({ a: parent, b: n, kind: 'file', p: Math.random() });
      }
    };
    walk(currentFolderId || null, root, 0);
    // disposition initiale radiale : chaque enfant reçoit un secteur proportionnel à la taille de son sous-arbre
    const weight = n => { const kids = links.filter(l => l.a === n).map(l => l.b); return 1 + kids.reduce((s, k) => s + (k.kind === 'folder' ? weight(k) : 0.35), 0); };
    const place = (n, a0, a1) => {
      const kids = links.filter(l => l.a === n).map(l => l.b);
      if (!kids.length) return;
      const total = kids.reduce((s, k) => s + weight(k), 0);
      let a = a0;
      const ring = 200;
      for (const k of kids) {
        const span = (a1 - a0) * weight(k) / total;
        const ang = a + span / 2;
        const dist = k.kind === 'folder' ? ring : 80 + Math.random() * 24;
        if (isNaN(k.x)) { k.x = n.x + Math.cos(ang) * dist; k.y = n.y + Math.sin(ang) * dist; }
        if (k.kind === 'folder') place(k, ang - span / 2 + 0.05, ang + span / 2 - 0.05);
        a += span;
      }
    };
    const a0 = -Math.PI / 2 - Math.PI / 6;   // premier secteur en haut à gauche : deux dossiers ne forment pas une ligne verticale
    place(root, a0, a0 + Math.PI * 2);
    // longueurs au repos cohérentes avec les anneaux de la physique (200 par niveau de dossier, séances à 90 de leur dossier)
    for (const l of links) l.rest = l.kind === 'folder' ? 200 : (l.kind === 'doc' ? 90 : 78);
    settled = keepPositions ? 60 : 0;
  }

  /* ---------------- physique (forces + flottement) ---------------- */
  function step(dt) {
    const n = nodes.length; if (!n) return;
    const heat = settled < 90 ? 1 - settled / 90 : 0;
    settled++;
    // répulsion (limitée aux voisins proches par une grille grossière)
    const cell = 130, grid = new Map();
    for (const a of nodes) { const k = ((a.x / cell) | 0) + ':' + ((a.y / cell) | 0); (grid.get(k) || grid.set(k, []).get(k)).push(a); }
    for (const a of nodes) {
      const cx = (a.x / cell) | 0, cy = (a.y / cell) | 0;
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = grid.get(gx + ':' + gy); if (!bucket) continue;
        for (const b of bucket) {
          if (b === a || b.id < a.id) continue;
          let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
          if (d2 > 260 * 260) continue;
          const d = Math.sqrt(d2);
          const bothF = (a.kind === 'folder' || a.kind === 'root') && (b.kind === 'folder' || b.kind === 'root');
          const min = a.r + b.r + (bothF ? 120 : (a.kind === 'folder' || b.kind === 'folder' || a.kind === 'root' || b.kind === 'root') ? 34 : 18);
          const f = (bothF ? 3200 : (a.kind === 'folder' || b.kind === 'folder') ? 1500 : 520) / d2 + (d < min ? (min - d) * 0.45 : 0);
          const fx = dx / d * f, fy = dy / d * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
    }
    // ressorts le long des liens
    for (const l of links) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = l.kind === 'folder' ? 0.045 : 0.06;
      const f = (d - l.rest) * k;
      const fx = dx / d * f, fy = dy / d * f;
      l.a.vx += fx * (l.a.kind === 'root' ? 0.1 : 0.5); l.a.vy += fy * (l.a.kind === 'root' ? 0.1 : 0.5);
      l.b.vx -= fx; l.b.vy -= fy;
    }
    // gravité douce vers le centre + flottement
    const tNow = (performance.now() - t0) / 1000;
    for (const a of nodes) {
      if (a.kind === 'root') { a.vx -= a.x * 0.03; a.vy -= a.y * 0.03; }
      else {
        // orbites : chaque astre est ramené doucement vers l'anneau de sa profondeur (dossiers) ou juste au-delà de son parent (séances, fichiers)
        const r = Math.sqrt(a.x * a.x + a.y * a.y) || 1;
        const target = a.kind === 'folder' ? 200 * a.depth : 200 * (a.depth - 1) + 90;
        const f = (target - r) * 0.012;
        a.vx += a.x / r * f; a.vy += a.y / r * f;
      }
      if (a === drag) { a.vx = a.vy = 0; continue; }
      a.vx *= 0.82; a.vy *= 0.82;
      const sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy), cap = 6 + heat * 14;
      if (sp > cap) { a.vx *= cap / sp; a.vy *= cap / sp; }
      a.x += a.vx * dt * 60; a.y += a.vy * dt * 60;
      a.fx = Math.sin(tNow * 0.9 + a.phase) * (a.kind === 'folder' ? 2.2 : 3.2);
      a.fy = Math.cos(tNow * 0.7 + a.phase * 1.3) * (a.kind === 'folder' ? 2.2 : 3.2);
    }
    // particules le long des liens
    for (const l of links) { l.p += dt * (l.kind === 'folder' ? 0.28 : 0.42); if (l.p > 1) l.p -= 1; }
    // caméra : interpolation douce
    cam.x += (cam.tx - cam.x) * 0.12; cam.y += (cam.ty - cam.y) * 0.12; cam.z += (cam.tz - cam.z) * 0.12;
  }

  /* ---------------- rendu ---------------- */
  const sx = n => W / 2 + (n.x + (n.fx || 0) - cam.x) * cam.z;
  const sy = n => H / 2 + (n.y + (n.fy || 0) - cam.y) * cam.z;
  function draw() {
    const th = theme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // fond : dégradé radial + étoiles qui scintillent
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, th.bg2); g.addColorStop(1, th.bg1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const tNow = (performance.now() - t0) / 1000;
    for (const s of stars) {
      const a = s.a * (0.55 + 0.45 * Math.sin(tNow * s.sp + s.ph));
      ctx.fillStyle = `rgba(${th.star},${(th.dark ? a : a * 0.5).toFixed(3)})`;
      const px = ((s.x - cam.x * 0.08 * s.z) % 1 + 1) % 1 * W, py = ((s.y - cam.y * 0.08 * s.z) % 1 + 1) % 1 * H;
      ctx.fillRect(px, py, s.r, s.r);
    }
    const hi = hover;
    const related = new Set();
    if (hi) { related.add(hi); for (const l of links) { if (l.a === hi) related.add(l.b); if (l.b === hi) related.add(l.a); } }
    // liens
    for (const l of links) {
      const ax = sx(l.a), ay = sy(l.a), bx = sx(l.b), by = sy(l.b);
      const on = hi && (l.a === hi || l.b === hi);
      const dim = hi && !on;
      const rgb = hexRgb(l.b.color);
      ctx.strokeStyle = `rgba(${rgb},${dim ? 0.07 : on ? 0.75 : l.kind === 'folder' ? 0.38 : 0.2})`;
      ctx.lineWidth = (l.kind === 'folder' ? 1.4 : 0.8) * (on ? 1.6 : 1);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (dim) continue;
      // particule qui circule du parent vers l'enfant
      const nP = l.kind === 'folder' ? 2 : 1;
      for (let i = 0; i < nP; i++) {
        const p = (l.p + i / nP) % 1;
        const px = ax + (bx - ax) * p, py = ay + (by - ay) * p;
        const rr = (l.kind === 'folder' ? 2.2 : 1.5) * (on ? 1.5 : 1) * Math.min(1.4, cam.z);
        ctx.fillStyle = `rgba(${rgb},${(0.35 + 0.5 * Math.sin(p * Math.PI)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, rr, 0, 6.2832); ctx.fill();
      }
    }
    // astres
    ctx.textBaseline = 'middle';
    for (const a of nodes) {
      const x = sx(a), y = sy(a);
      if (x < -80 || y < -80 || x > W + 80 || y > H + 80) continue;
      const on = hi === a, near = related.has(a);
      const dim = hi && !near;
      const rgb = hexRgb(a.color);
      const r = a.r * Math.max(0.55, Math.min(1.6, Math.sqrt(cam.z))) * (on ? 1.18 : 1);
      ctx.globalAlpha = dim ? 0.28 : 1;
      if (a.kind === 'root' || a.kind === 'folder') {
        // halo
        const hg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * (a.kind === 'root' ? 3.2 : 2.2));
        hg.addColorStop(0, `rgba(${rgb},${a.kind === 'root' ? 0.45 : 0.32})`); hg.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, r * (a.kind === 'root' ? 3.2 : 2.2), 0, 6.2832); ctx.fill();
        // corps
        const bg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        bg.addColorStop(0, `rgba(${rgb},1)`); bg.addColorStop(1, th.dark ? `rgba(${rgb},0.75)` : `rgba(${rgb},0.92)`);
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
        if (a.kind === 'folder' && childFolders(a.fid).length) {   // anneau : le dossier a des sous-dossiers
          ctx.strokeStyle = `rgba(${rgb},0.55)`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(x, y, r * 1.75, r * 0.55, -0.4, 0, 6.2832); ctx.stroke();
        }
        if (a.kind === 'root') {   // lettre au centre du soleil
          ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(r * 0.95)}px ${css('--font-serif', 'Georgia, serif')}`; ctx.textAlign = 'center';
          ctx.fillText((a.label || 'A')[0].toUpperCase(), x, y + 1);
        }
        // étiquette
        const fs = a.kind === 'root' ? 14 : 12.5;
        ctx.font = `${a.kind === 'root' ? 650 : 600} ${fs}px ${css('--font-ui', 'sans-serif')}`; ctx.textAlign = 'center';
        const label = a.count ? `${a.label}  ·  ${a.count}` : a.label;
        const tw = ctx.measureText(label).width + 14;
        ctx.fillStyle = th.dark ? 'rgba(10,13,20,.72)' : 'rgba(255,255,255,.82)';
        roundRect(x - tw / 2, y + r + 6, tw, fs + 8, 6); ctx.fill();
        ctx.fillStyle = th.ink; ctx.fillText(label, x, y + r + 6 + (fs + 8) / 2 + 0.5);
      } else {
        // séance / présentation / fichier : petite étoile
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        glow.addColorStop(0, `rgba(${rgb},${on ? 0.7 : 0.35})`); glow.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 6.2832); ctx.fill();
        ctx.fillStyle = on ? `rgb(${rgb})` : (th.dark ? '#fff' : `rgb(${rgb})`);
        if (a.kind === 'slides') { ctx.beginPath(); ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.25, y); ctx.lineTo(x, y + r * 1.25); ctx.lineTo(x - r * 1.25, y); ctx.closePath(); ctx.fill(); }
        else if (a.kind === 'sheet') { const w = r * 1.05; ctx.fillRect(x - w, y - w, w * 2, w * 2); }
        else if (a.kind === 'board') { const w = r * 1.3, h = r * 0.9; ctx.fillRect(x - w, y - h, w * 2, h * 2); }   // planche : petit rectangle couché
        else if (a.kind === 'file') { roundRect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8, 1.5); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
        if (a.pinned) { ctx.strokeStyle = `rgba(${rgb},0.9)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 6.2832); ctx.stroke(); }
        if (on || cam.z >= 1.55 || nodes.length <= 40) {
          ctx.font = `${on ? 600 : 500} 11.5px ${css('--font-ui', 'sans-serif')}`; ctx.textAlign = 'left';
          const label = a.label.length > 42 ? a.label.slice(0, 40) + '…' : a.label;
          if (on) { const tw = ctx.measureText(label).width + 12; ctx.fillStyle = th.dark ? 'rgba(10,13,20,.85)' : 'rgba(255,255,255,.92)'; roundRect(x + r + 6, y - 10, tw, 20, 5); ctx.fill(); }
          ctx.fillStyle = on ? th.ink : th.ink2; ctx.fillText(label, x + r + 12, y + 0.5);
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function loop(t) {
    if (!running) return;
    if (!host || host.hidden || !host.isConnected || !document.body.contains(canvas)) { stop(); return; }
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (!document.hidden) { step(dt); draw(); }
    raf = requestAnimationFrame(loop);
  }
  function start() { if (running) return; running = true; lastT = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---------------- interaction ---------------- */
  function nodeAt(px, py) {
    let best = null, bd = 1e9;
    for (const a of nodes) {
      const dx = sx(a) - px, dy = sy(a) - py; const d = Math.sqrt(dx * dx + dy * dy);
      const hit = Math.max(9, a.r * Math.max(0.55, Math.sqrt(cam.z)) + 5);
      if (d < hit && d < bd) { best = a; bd = d; }
    }
    return best;
  }
  function focusOn(n) { cam.tx = n.x; cam.ty = n.y; }
  function bbox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const a of nodes) { x0 = Math.min(x0, a.x - 40); y0 = Math.min(y0, a.y - 40); x1 = Math.max(x1, a.x + (a.kind === 'folder' || a.kind === 'root' ? 60 : 150)); y1 = Math.max(y1, a.y + 50); }
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }
  function recenter() { const b = bbox(); cam.tx = nodes.length > 1 ? b.cx : 0; cam.ty = nodes.length > 1 ? b.cy : 0; cam.tz = fitZoom(); }
  function fitZoom() {
    if (nodes.length < 2) return 1;
    const b = bbox();
    return Math.max(0.3, Math.min(1.25, Math.min((W - 60) / b.w, (H - 110) / b.h)));
  }
  function bind() {
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      if (drag) { drag.x = (px - W / 2) / cam.z + cam.x - (drag.fx || 0); drag.y = (py - H / 2) / cam.z + cam.y - (drag.fy || 0); drag.moved = true; return; }
      if (pan) { cam.tx = cam.x = pan.cx - (px - pan.px) / cam.z; cam.ty = cam.y = pan.cy - (py - pan.py) / cam.z; pan.moved = true; return; }
      hover = nodeAt(px, py);
      canvas.style.cursor = hover ? (hover.kind === 'root' ? 'grab' : 'pointer') : 'grab';
      if (pressed && !pressed.moved) { const dx = px - pressed.px, dy = py - pressed.py; if (dx * dx + dy * dy > 16) { pressed.moved = true; if (pressed.n) { drag = pressed.n; drag.moved = false; } else pan = { px: pressed.px, py: pressed.py, cx: cam.x, cy: cam.y, moved: true }; } }
    });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      const n = nodeAt(px, py);
      pressed = { n, px, py, moved: false };
      canvas.setPointerCapture(e.pointerId);
      if (typeof closeCtxMenu === 'function') closeCtxMenu();
    });
    canvas.addEventListener('pointerup', e => {
      const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      const p = pressed; pressed = null;
      if (drag) { drag.pin = false; drag = null; return; }
      if (pan) { pan = null; return; }
      if (!p || p.moved || e.button !== 0) return;
      const n = nodeAt(px, py); if (!n) return;
      const now = Date.now(); const dbl = lastClick.id === n.id && now - lastClick.t < 380; lastClick = { id: n.id, t: now };
      if (n.kind === 'folder' && !dbl) { focusOn(n); return; }
      if (n.kind === 'root' && !dbl) { recenter(); return; }
      activate(n, dbl);
    });
    canvas.addEventListener('pointercancel', () => { pressed = null; drag = null; pan = null; });
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      contextFor(nodeAt(e.clientX - r.left, e.clientY - r.top), e.clientX, e.clientY);
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      const k = Math.exp(-e.deltaY * 0.0012);
      const nz = Math.max(0.25, Math.min(3.2, cam.tz * k));
      // zoom vers le pointeur
      const wx = (px - W / 2) / cam.z + cam.x, wy = (py - H / 2) / cam.z + cam.y;
      cam.tx = wx - (px - W / 2) / nz; cam.ty = wy - (py - H / 2) / nz; cam.tz = nz;
    }, { passive: false });
    canvas.addEventListener('dblclick', e => e.preventDefault());
    canvas.addEventListener('pointerleave', () => { if (!pressed) hover = null; });
    hud.addEventListener('click', e => {
      const b = e.target.closest('[data-gx]'); if (!b) return;
      if (b.dataset.gx === 'center') { if (is3D()) AlixoGalaxy3D.recenter(); else recenter(); }
      if (b.dataset.gx === 'shuffle') { build(false); for (let i = 0; i < 70; i++) step(0.016); if (is3D()) { AlixoGalaxy3D.rebuild(); AlixoGalaxy3D.recenter(); } else recenter(); }
      if (b.dataset.gx === 'up') { const f = folder(currentFolderId); gotoFolder(f ? f.parentId : null); }
      if (b.dataset.gx === 'mode') { state.settings.galaxy3d = !use3D(); save(); render(); }
    });
  }
  /* action sur un astre (clic simple ou double) — partagée avec le rendu 3D */
  function activate(n, dbl) {
    if (!n) return;
    if (n.kind === 'doc' || n.kind === 'slides' || n.kind === 'sheet' || n.kind === 'board') { openDoc(n.did); return; }
    if (n.kind === 'file') { if (window.AlixoFiles) AlixoFiles.open(n.fileId); return; }
    if (n.kind === 'folder') { gotoFolder(n.fid); return; }
    if (n.kind === 'root' && dbl && currentFolderId) { const f = folder(currentFolderId); gotoFolder(f ? f.parentId : null); }
  }
  function contextFor(n, x, y) {
    if (!n) { openCreateMenu(x, y); return; }
    if (n.kind === 'doc' || n.kind === 'slides' || n.kind === 'sheet' || n.kind === 'board') openDocCtxMenu(x, y, n.did);
    else if (n.kind === 'folder') openFolderCtxMenu(x, y, n.fid);
    else if (n.kind === 'file' && window.AlixoFiles && AlixoFiles.openMenu) AlixoFiles.openMenu(x, y, n.fileId);
    else openCreateMenu(x, y);
  }
  const related = (a, b) => a === b || links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  /* cœur exposé au rendu 3D : nœuds, liens, simulation, actions */
  const core = { get nodes() { return nodes; }, get links() { return links; }, step, bbox, related, activate, contextFor, setDrag: n => { drag = n; } };
  const use3D = () => state.settings.galaxy3d !== false && !!window.AlixoGalaxy3D && AlixoGalaxy3D.supported();
  const is3D = () => use3D() && window.AlixoGalaxy3D && AlixoGalaxy3D.active;
  function resize() {
    if (!host || !canvas) return;
    const r = host.getBoundingClientRect();
    W = Math.max(50, Math.round(r.width)); H = Math.max(50, Math.round(r.height));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    if (!stars.length) stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 1.2, r: Math.random() < 0.85 ? 1 : 2, a: 0.25 + Math.random() * 0.6, sp: 0.6 + Math.random() * 1.8, ph: Math.random() * 6.28 }));
  }

  /* ---------------- point d'entrée (depuis renderLibrary) ---------------- */
  function render() {
    host = document.getElementById('lib-galaxy'); if (!host) return;
    if (!canvas) {
      host.innerHTML = `<canvas class="gx-canvas"></canvas>
        <div class="gx-hud">
          <div class="gx-legend"><span><i class="gx-sun"></i>Dossier affiché</span><span><i class="gx-planet"></i>Sous-dossier</span><span><i class="gx-star"></i>Séance</span><span><i class="gx-diamond"></i>Présentation</span><span><i class="gx-file"></i>Fichier</span></div>
          <div class="gx-btns"><button type="button" data-gx="up" class="gx-up" title="Remonter d’un niveau">↑ Dossier parent</button><button type="button" data-gx="center" title="Recentrer la vue">Recentrer</button><button type="button" data-gx="shuffle" title="Recomposer la galaxie">Recomposer</button><button type="button" data-gx="mode" class="gx-mode" title="Basculer entre le rendu 3D (WebGL) et le rendu 2D"></button></div>
        </div>
        <div class="gx-hint"></div>`;
      canvas = host.querySelector('canvas'); ctx = canvas.getContext('2d'); hud = host.querySelector('.gx-hud');
      t0 = performance.now();
      bind();
      ro = new ResizeObserver(() => { resize(); }); ro.observe(host);
    }
    const up = host.querySelector('.gx-up'); if (up) up.hidden = !currentFolderId;
    resize();
    const sameRoot = nodes.length && nodes[0].id === 'f:' + (currentFolderId || 'root');
    build(!!sameRoot);
    if (!sameRoot) { cam.x = cam.tx = 0; cam.y = cam.ty = 0; cam.z = cam.tz = 1; }
    // quelques itérations « à froid » pour que la galaxie apparaisse déjà en place
    if (!sameRoot) { for (let i = 0; i < 70; i++) step(0.016); recenter(); cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; }
    hover = null;
    const three = use3D();
    const modeBtn = host.querySelector('.gx-mode'); if (modeBtn) { modeBtn.textContent = three ? 'Vue 2D' : 'Vue 3D'; modeBtn.hidden = !(window.AlixoGalaxy3D && AlixoGalaxy3D.supported()); }
    host.querySelector('.gx-hint').textContent = three
      ? 'Clic : ouvrir une séance ou un dossier · glisser le fond : tourner · molette : s’approcher · glisser un astre : le déplacer · clic droit : menu'
      : 'Clic : ouvrir une séance · clic sur une planète : la centrer, double-clic : entrer dans le dossier · molette : zoom · glisser : déplacer';
    canvas.hidden = three;
    if (three) { stop(); AlixoGalaxy3D.mount(host, core); }
    else { if (window.AlixoGalaxy3D) AlixoGalaxy3D.unmount(); start(); }
  }
  function refresh() { if (host && !host.hidden && canvas) { build(true); if (is3D()) AlixoGalaxy3D.rebuild(); } }
  function stopAll() { stop(); if (window.AlixoGalaxy3D) AlixoGalaxy3D.unmount(); }
  function onTheme() { if (window.AlixoGalaxy3D) AlixoGalaxy3D.applyTheme(); }

  return { render, refresh, stop: stopAll, onTheme };
})();
