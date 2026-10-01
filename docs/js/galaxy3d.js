/* ============================================================
   Alixo — vue Galaxie en 3D (three.js) 1.14
   Rendu WebGL de la galaxie de la bibliothèque : le soleil (dossier affiché)
   rayonne au centre, les planètes (sous-dossiers) tournent avec leurs anneaux,
   les séances, présentations et fichiers scintillent en orbite, des particules
   lumineuses circulent le long des liens, un champ d'étoiles tourne au loin.

   La disposition (forces, flottement) reste calculée par js/galaxy.js, qui
   fournit ici son « cœur » (nœuds, liens, pas de simulation, clics, menus) ;
   ce module ne fait que dessiner et capter la souris : glisser le fond =
   tourner la caméra, molette = s'approcher, glisser un astre = le déplacer,
   clic / double-clic / clic droit = mêmes actions qu'en 2D.

   Sans WebGL (ou three.js absent), js/galaxy.js garde son rendu 2D sur canvas.
   ============================================================ */
'use strict';

window.AlixoGalaxy3D = (() => {
  let T = null, host = null, wrap = null, renderer = null, scene = null, camera = null, labelsEl = null;
  let core = null, running = false, raf = 0, lastT = 0, t0 = 0, ro = null;
  let items = new Map();          // node.id → { mesh, ring, glow, label, kind }
  let lines = null, parts = null, partMeta = [], stars = null, sunLight = null;
  let orbit = { az: 0, el: 0.72, dist: 1100, tx: 0, ty: 0, tz: 0, taz: 0, tel: 0.72, tdist: 1100 };
  let hover = null, pressed = null, dragN = null, rot = null, lastClick = { id: null, t: 0 };
  let softTex = null, glowTex = null;
  const V = () => new T.Vector3();

  function supported() {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }
  const hex = h => { const m = String(h || '').trim().match(/^#?([0-9a-f]{6})$/i); return m ? parseInt(m[1], 16) : 0x5a6e8c; };
  const css = (name, fb) => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; };
  const isDark = () => document.documentElement.dataset.theme === 'dark';

  /* textures procédurales : disque doux (particules, étoiles) et halo (soleil, planètes) */
  function makeTex(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (kind === 'soft') { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(0.25, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }

  /* ---------------- montage / démontage ---------------- */
  function mount(hostEl, coreApi) {
    T = window.THREE; host = hostEl; core = coreApi;
    if (!wrap) {
      wrap = document.createElement('div'); wrap.className = 'gx-3d';
      renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      wrap.appendChild(renderer.domElement);
      labelsEl = document.createElement('div'); labelsEl.className = 'gx-labels'; wrap.appendChild(labelsEl);
      host.insertBefore(wrap, host.firstChild);
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(48, 1, 1, 30000);
      softTex = makeTex('soft'); glowTex = makeTex('glow');
      scene.add(new T.AmbientLight(0xffffff, 1.1));
      sunLight = new T.PointLight(0xffffff, 3, 4000, 0.6); scene.add(sunLight);
      bind();
      ro = new ResizeObserver(resize); ro.observe(host);
      t0 = performance.now();
    }
    wrap.hidden = false;
    applyTheme();
    rebuild();
    fitCamera(true);
    resize();
    start();
  }
  function unmount() { stop(); if (wrap) wrap.hidden = true; if (labelsEl) labelsEl.innerHTML = ''; hover = null; }
  function dispose() { stop(); if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); wrap = null; }

  function applyTheme() {
    if (!scene) return;
    if (running && items.size) rebuild();
    const dark = isDark();
    const bg = new T.Color(dark ? css('--bg', '#0b0e15') : '#e8edf6');
    if (dark) { const s = css('--surface', '#141a28'); bg.lerp(new T.Color(s), 0.35); }
    scene.background = bg;
    scene.fog = new T.FogExp2(bg.getHex(), dark ? 0.00022 : 0.00018);
  }

  /* ---------------- construction des objets ---------------- */
  function clearScene() {
    for (const it of items.values()) { for (const k of ['mesh', 'ring', 'glow']) { const o = it[k]; if (o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); } } }
    items.clear(); labelsEl.innerHTML = '';
    for (const o of [lines, parts, stars]) if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
    lines = parts = stars = null;
  }
  function rebuild() {
    if (!scene) return;
    clearScene();
    const dark = isDark();
    // champ d'étoiles
    const N = 1600, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const r = 1800 + Math.random() * 2600, th = Math.random() * 6.2832, ph = Math.acos(2 * Math.random() - 1); sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); sp[i * 3 + 2] = r * Math.cos(ph) - 600; }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
    stars = new T.Points(sg, new T.PointsMaterial({ size: 13, map: softTex, transparent: true, opacity: dark ? 0.9 : 0.4, color: dark ? 0xffffff : 0x33658a, depthWrite: false, sizeAttenuation: true }));
    scene.add(stars);
    // astres
    for (const n of core.nodes) {
      const col = new T.Color(hex(n.color));
      const it = { kind: n.kind, node: n };
      if (n.kind === 'root') {
        it.mesh = new T.Mesh(new T.SphereGeometry(n.r * 1.25, 40, 40), new T.MeshBasicMaterial({ color: col.clone().lerp(new T.Color(0xffffff), dark ? 0.2 : 0.05) }));
        it.glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: dark ? 0.95 : 0.6, depthWrite: false, blending: dark ? T.AdditiveBlending : T.NormalBlending }));
        it.glow.scale.set(n.r * 11, n.r * 11, 1);
        sunLight.color.copy(col);
      } else if (n.kind === 'folder') {
        it.mesh = new T.Mesh(new T.SphereGeometry(n.r * 1.5, 28, 28), new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: dark ? 0.45 : 0.2, roughness: 0.5, metalness: 0.15 }));
        it.glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: dark ? 0.6 : 0.4, depthWrite: false, blending: dark ? T.AdditiveBlending : T.NormalBlending }));
        it.glow.scale.set(n.r * 7.5, n.r * 7.5, 1);
        if (typeof childFolders === 'function' && childFolders(n.fid).length) {
          it.ring = new T.Mesh(new T.RingGeometry(n.r * 2.1, n.r * 2.6, 64), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
          it.ring.rotation.x = 1.1; it.ring.rotation.y = 0.35;
        }
      } else {
        const white = dark ? 0xffffff : col.getHex();
        const geo = n.kind === 'slides' ? new T.OctahedronGeometry(n.r * 1.8)
          : n.kind === 'sheet' ? new T.BoxGeometry(n.r * 2.4, n.r * 2.4, n.r * 0.7)
          : n.kind === 'file' ? new T.BoxGeometry(n.r * 2.2, n.r * 2.2, n.r * 2.2)
          : new T.SphereGeometry(n.r * 1.4, 14, 14);
        it.mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ color: white }));
        it.glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: dark ? 0.7 : 0.45, depthWrite: false, blending: dark ? T.AdditiveBlending : T.NormalBlending }));
        it.glow.scale.set(n.r * 9, n.r * 9, 1);
      }
      it.mesh.userData.id = n.id;
      scene.add(it.mesh); if (it.glow) scene.add(it.glow); if (it.ring) scene.add(it.ring);
      if (n.kind === 'root' || n.kind === 'folder' || core.nodes.length <= 40) {
        const l = document.createElement('div'); l.className = 'gx-label ' + n.kind; l.textContent = n.count ? `${n.label} · ${n.count}` : n.label; labelsEl.appendChild(l); it.label = l;
      }
      items.set(n.id, it);
    }
    // liens
    const L = core.links.length;
    const lp = new Float32Array(L * 6), lc = new Float32Array(L * 6);
    core.links.forEach((l, i) => { const c = new T.Color(hex(l.b.color)); for (let k = 0; k < 2; k++) { lc[i * 6 + k * 3] = c.r; lc[i * 6 + k * 3 + 1] = c.g; lc[i * 6 + k * 3 + 2] = c.b; } });
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(lp, 3)); lg.setAttribute('color', new T.BufferAttribute(lc, 3));
    lines = new T.LineSegments(lg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: dark ? 0.5 : 0.6, depthWrite: false }));
    scene.add(lines);
    // particules le long des liens
    partMeta = [];
    core.links.forEach(l => { const nP = l.kind === 'folder' ? 3 : 1; for (let i = 0; i < nP; i++) partMeta.push({ l, off: i / nP }); });
    const P = partMeta.length, pp = new Float32Array(P * 3), pc = new Float32Array(P * 3);
    partMeta.forEach((m, i) => { const c = new T.Color(hex(m.l.b.color)).lerp(new T.Color(0xffffff), 0.35); pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b; });
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pp, 3)); pg.setAttribute('color', new T.BufferAttribute(pc, 3));
    parts = new T.Points(pg, new T.PointsMaterial({ size: dark ? 15 : 12, map: softTex, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: dark ? T.AdditiveBlending : T.NormalBlending, sizeAttenuation: true }));
    scene.add(parts);
  }

  /* ---------------- caméra ---------------- */
  function camPos() {
    const { az, el, dist } = orbit;
    return V().set(orbit.tx + dist * Math.cos(el) * Math.sin(az), orbit.ty - dist * Math.sin(el), orbit.tz + dist * Math.cos(el) * Math.cos(az));
  }
  function fitCamera(immediate) {
    const b = core.bbox();
    const size = Math.max(b.w, b.h, 300);
    orbit.tx = b.cx; orbit.ty = -b.cy; orbit.tz = 0;
    orbit.tdist = Math.max(380, Math.min(5000, size * 0.82));
    orbit.taz = 0; orbit.tel = 0.72;
    if (immediate) { orbit.dist = orbit.tdist; orbit.az = orbit.taz; orbit.el = orbit.tel; }
  }
  function resize() {
    if (!host || !renderer) return;
    const r = host.getBoundingClientRect(); const w = Math.max(50, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  /* ---------------- boucle ---------------- */
  const zOf = (n, t) => (n.kind === 'root' ? 0 : n.kind === 'folder' ? Math.sin(t * 0.5 + n.phase) * 14 : Math.sin(t * 0.8 + n.phase * 1.7) * 42);
  function loop(ts) {
    if (!running) return;
    if (!host || host.hidden || !host.isConnected) { unmount(); return; }
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016); lastT = ts;
    if (!document.hidden) {
      core.step(dt);
      const t = (performance.now() - t0) / 1000;
      // caméra
      orbit.az += (orbit.taz - orbit.az) * 0.1; orbit.el += (orbit.tel - orbit.el) * 0.1; orbit.dist += (orbit.tdist - orbit.dist) * 0.1;
      camera.position.copy(camPos()); camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
      // astres
      for (const it of items.values()) {
        const n = it.node; const x = n.x + (n.fx || 0), y = -(n.y + (n.fy || 0)), z = zOf(n, t);
        it.mesh.position.set(x, y, z);
        if (it.glow) it.glow.position.set(x, y, z);
        if (it.ring) { it.ring.position.set(x, y, z); it.ring.rotation.z = t * 0.25; }
        if (n.kind === 'folder' || n.kind === 'root') it.mesh.rotation.y = t * 0.2;
        if (n.kind === 'slides' || n.kind === 'sheet') it.mesh.rotation.y = t * 0.8;
        const k = hover === n ? 1.25 : 1;
        it.mesh.scale.setScalar(k);
        if (n.kind === 'root') { sunLight.position.set(x, y, z + 40); it.glow.scale.setScalar(n.r * (11 + Math.sin(t * 1.3) * 0.8)); }
      }
      if (stars) stars.rotation.z = t * 0.004;
      // liens
      const lp = lines.geometry.attributes.position.array;
      core.links.forEach((l, i) => {
        const a = items.get(l.a.id), b = items.get(l.b.id); if (!a || !b) return;
        lp[i * 6] = a.mesh.position.x; lp[i * 6 + 1] = a.mesh.position.y; lp[i * 6 + 2] = a.mesh.position.z;
        lp[i * 6 + 3] = b.mesh.position.x; lp[i * 6 + 4] = b.mesh.position.y; lp[i * 6 + 5] = b.mesh.position.z;
      });
      lines.geometry.attributes.position.needsUpdate = true;
      // particules
      const pp = parts.geometry.attributes.position.array;
      partMeta.forEach((m, i) => {
        const a = items.get(m.l.a.id), b = items.get(m.l.b.id); if (!a || !b) return;
        const p = (m.l.p + m.off) % 1;
        pp[i * 3] = a.mesh.position.x + (b.mesh.position.x - a.mesh.position.x) * p;
        pp[i * 3 + 1] = a.mesh.position.y + (b.mesh.position.y - a.mesh.position.y) * p;
        pp[i * 3 + 2] = a.mesh.position.z + (b.mesh.position.z - a.mesh.position.z) * p + 3;
      });
      parts.geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      placeLabels();
    }
    raf = requestAnimationFrame(loop);
  }
  function placeLabels() {
    const r = renderer.domElement; const w = r.clientWidth, h = r.clientHeight;
    const v = V();
    for (const it of items.values()) {
      const l = it.label; if (!l) continue;
      const n = it.node;
      const show = n.kind === 'root' || n.kind === 'folder' || hover === n || (core.nodes.length <= 40 && orbit.dist < 1400);
      if (!show) { l.style.display = 'none'; continue; }
      v.copy(it.mesh.position); v.y -= n.r * 1.6; v.project(camera);
      if (v.z > 1) { l.style.display = 'none'; continue; }
      l.style.display = '';
      l.style.transform = `translate(-50%, 0) translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`;
      l.classList.toggle('hover', hover === n);
      l.style.opacity = hover && hover !== n && !core.related(hover, n) ? 0.35 : 1;
    }
    if (hover && !items.get(hover.id).label) {
      // étiquette éphémère pour une séance survolée quand il y en a beaucoup
      let l = labelsEl.querySelector('.gx-label.tmp');
      if (!l) { l = document.createElement('div'); l.className = 'gx-label tmp doc hover'; labelsEl.appendChild(l); }
      l.textContent = hover.label;
      v.copy(items.get(hover.id).mesh.position); v.y -= hover.r * 1.6; v.project(camera);
      l.style.transform = `translate(-50%, 0) translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`;
    } else { const l = labelsEl.querySelector('.gx-label.tmp'); if (l) l.remove(); }
  }
  function start() { if (running) return; running = true; lastT = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---------------- souris ---------------- */
  const ray = () => { if (!ray.r) ray.r = new T.Raycaster(); return ray.r; };
  function nodeAt(px, py) {
    const r = renderer.domElement.getBoundingClientRect();
    const m = new T.Vector2((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    const rc = ray(); rc.setFromCamera(m, camera);
    rc.params.Points = { threshold: 6 };
    const meshes = [...items.values()].map(it => it.mesh);
    // tolérance : on grossit virtuellement les petits astres pour le clic
    const hits = rc.intersectObjects(meshes, false);
    if (hits.length) return items.get(hits[0].object.userData.id).node;
    // repli : le plus proche à l'écran (petites étoiles)
    let best = null, bd = 14;
    const v = V();
    for (const it of items.values()) { v.copy(it.mesh.position).project(camera); if (v.z > 1) continue; const sx = (v.x + 1) / 2 * r.width + r.left, sy = (1 - v.y) / 2 * r.height + r.top; const d = Math.hypot(sx - px, sy - py); if (d < bd) { bd = d; best = it.node; } }
    return best;
  }
  /* point du plan z = z0 visé par la souris (déplacement d'un astre) */
  function planeHit(px, py, z0) {
    const r = renderer.domElement.getBoundingClientRect();
    const m = new T.Vector2((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    const rc = ray(); rc.setFromCamera(m, camera);
    const plane = new T.Plane(new T.Vector3(0, 0, 1), -z0); const out = V();
    return rc.ray.intersectPlane(plane, out) ? out : null;
  }
  function bind() {
    const c = renderer.domElement;
    c.addEventListener('pointermove', e => {
      if (dragN) { const p = planeHit(e.clientX, e.clientY, zOf(dragN, (performance.now() - t0) / 1000)); if (p) { dragN.x = p.x - (dragN.fx || 0); dragN.y = -p.y - (dragN.fy || 0); } return; }
      if (rot) { orbit.taz = rot.az + (e.clientX - rot.px) * 0.005; orbit.tel = Math.max(0.12, Math.min(1.45, rot.el + (e.clientY - rot.py) * 0.005)); return; }
      if (pressed && !pressed.moved) { const dx = e.clientX - pressed.px, dy = e.clientY - pressed.py; if (dx * dx + dy * dy > 16) { pressed.moved = true; if (pressed.n && pressed.n.kind !== 'root') { dragN = pressed.n; core.setDrag(dragN); } else rot = { px: pressed.px, py: pressed.py, az: orbit.taz, el: orbit.tel }; } return; }
      hover = nodeAt(e.clientX, e.clientY);
      c.style.cursor = hover ? (hover.kind === 'root' ? 'grab' : 'pointer') : 'grab';
    });
    c.addEventListener('pointerdown', e => { if (e.button !== 0) return; pressed = { n: nodeAt(e.clientX, e.clientY), px: e.clientX, py: e.clientY, moved: false }; c.setPointerCapture(e.pointerId); if (typeof closeCtxMenu === 'function') closeCtxMenu(); });
    c.addEventListener('pointerup', e => {
      const p = pressed; pressed = null;
      if (dragN) { core.setDrag(null); dragN = null; return; }
      if (rot) { rot = null; return; }
      if (!p || p.moved || e.button !== 0) return;
      const n = nodeAt(e.clientX, e.clientY); if (!n) return;
      const now = Date.now(); const dbl = lastClick.id === n.id && now - lastClick.t < 380; lastClick = { id: n.id, t: now };
      if (n.kind === 'folder' && !dbl) { orbit.tx = n.x; orbit.ty = -n.y; orbit.tdist = Math.min(orbit.tdist, 700); return; }
      if (n.kind === 'root' && !dbl) { fitCamera(false); return; }
      core.activate(n, dbl);
    });
    c.addEventListener('pointercancel', () => { pressed = null; if (dragN) core.setDrag(null); dragN = null; rot = null; });
    c.addEventListener('contextmenu', e => { e.preventDefault(); core.contextFor(nodeAt(e.clientX, e.clientY), e.clientX, e.clientY); });
    c.addEventListener('wheel', e => { e.preventDefault(); orbit.tdist = Math.max(220, Math.min(6000, orbit.tdist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
    c.addEventListener('dblclick', e => e.preventDefault());
    c.addEventListener('pointerleave', () => { if (!pressed) hover = null; });
  }

  return { supported, mount, unmount, dispose, rebuild, applyTheme, recenter: () => fitCamera(false), get active() { return running; } };
})();
