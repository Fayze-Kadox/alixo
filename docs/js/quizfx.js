/* ============================================================
   Alixo — quiz : musiques de fond et sons (1.25)
   Tout est synthétisé avec l'API Web Audio : aucun fichier à télécharger, rien à héberger.
   - quatre musiques de base, générées en boucle (calme, entraînante, concentration, suspense) ;
   - un fichier audio personnel (mp3, m4a, ogg…) gardé sur cet appareil (IndexedDB « alixo-quizfx »,
     une entrée par quiz) : il n'est pas synchronisé — sur un autre appareil, la musique de base « calme » prend le relais ;
   - des sons courts (tic des dernières secondes, révélation, bonne / mauvaise réponse, arrivée d'un participant, fin).
   Utilisé par js/quiz.js (test local et écran du présentateur) ; la page des participants reste silencieuse.
   ============================================================ */
'use strict';

window.AlixoQuizFx = (() => {
  const TRACKS = {
    none: { name: 'Aucune musique', sub: 'Silence' },
    calm: { name: 'Calme', sub: 'Nappes douces, arpèges lents — pour réfléchir' },
    upbeat: { name: 'Entraînante', sub: 'Rythme léger, mélodie vive — pour un quiz qui avance' },
    focus: { name: 'Concentration', sub: 'Accords feutrés façon lo-fi' },
    tension: { name: 'Suspense', sub: 'Pulsation grave, montée de tension' },
    file: { name: 'Mon fichier audio', sub: 'Un morceau à vous, gardé sur cet appareil' }
  };
  let ctx = null, master = null, bus = null, delayIn = null;
  let vol = 0.5, muted = false, ducked = false;
  let loop = null;        // { kind, bpm, step, i, next, timer }
  let audioEl = null;     // fichier personnel
  let curKind = 'none';

  /* ---------------- moteur ---------------- */
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = effVol(); master.connect(ctx.destination);
      bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);
      /* petit écho feutré, pour donner de l'espace aux boucles */
      const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.34;
      const fb = ctx.createGain(); fb.gain.value = 0.28;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const wet = ctx.createGain(); wet.gain.value = 0.22;
      dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(master);
      delayIn = dl;
      return true;
    } catch (e) { console.warn('Audio indisponible :', e); return false; }
  }
  const effVol = () => (muted ? 0 : vol * (ducked ? 0.35 : 1));
  function applyVol() {
    if (master) master.gain.setTargetAtTime(effVol(), ctx.currentTime, 0.08);
    if (audioEl) audioEl.volume = Math.max(0, Math.min(1, effVol()));
  }
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);   // numéro MIDI → Hz
  function tone(freq, t, dur, o = {}) {
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.value = freq;
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.attack || 0.01, r = o.release || 0.12, peak = o.gain || 0.1;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, dur - r)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    let out = g;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; f.Q.value = o.q || 0.7; g.connect(f); out = f; }
    osc.connect(g); out.connect(o.dry ? master : bus);
    if (o.echo && delayIn) out.connect(delayIn);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(t, dur, gain, freq, type) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq || 6000; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + 0.02);
  }
  /* accords (numéros MIDI) */
  const CH = {
    Cmaj7: [60, 64, 67, 71], Am7: [57, 60, 64, 67], Fmaj7: [53, 57, 60, 64], G6: [55, 59, 62, 64],
    Dm7: [50, 53, 57, 60], G7: [55, 59, 62, 65], Em7: [52, 55, 59, 62], C: [60, 64, 67], G: [55, 59, 62], A: [57, 61, 64], F: [53, 57, 60]
  };
  const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79];
  /* chaque piste : tempo et une fonction qui programme le pas i (croche) à l'instant t */
  const GEN = {
    calm: { bpm: 64, step(i, t, st) {
      const prog = [CH.Cmaj7, CH.Am7, CH.Fmaj7, CH.G6]; const bar = Math.floor(i / 8); const ch = prog[Math.floor(bar / 2) % 4];
      if (i % 16 === 0) { tone(NOTE(ch[0] - 12), t, st * 16, { type: 'triangle', gain: 0.045, attack: 1.2, release: 2, filter: 600, echo: true }); tone(NOTE(ch[2] - 12), t, st * 16, { type: 'triangle', gain: 0.03, attack: 1.6, release: 2, filter: 600, detune: 6 }); }
      const n = ch[[0, 1, 2, 3, 2, 1][i % 6]] + (i % 8 >= 4 ? 12 : 0);
      if (i % 2 === 0 || Math.random() < 0.3) tone(NOTE(n), t, st * 1.8, { type: 'sine', gain: 0.07, attack: 0.02, release: 0.5, echo: true });
    } },
    upbeat: { bpm: 118, step(i, t, st) {
      const roots = [60, 55, 57, 53]; const bar = Math.floor(i / 8); const root = roots[bar % 4];
      if (i % 2 === 0) tone(NOTE(root - 24 + (i % 8 === 6 ? 7 : 0)), t, st * 1.6, { type: 'sawtooth', gain: 0.07, attack: 0.005, release: 0.08, filter: 420 });
      if (i % 4 === 0) tone(110, t, 0.18, { type: 'sine', gain: 0.22, attack: 0.002, release: 0.12, slide: 45 });
      if (i % 8 === 4) noise(t, 0.16, 0.12, 1800, 'bandpass');
      noise(t, 0.05, i % 2 ? 0.035 : 0.05, 9000, 'highpass');
      if (!st.mel) st.mel = 4;
      if (i % 2 === 1 || Math.random() < 0.5) { st.mel = Math.max(0, Math.min(PENTA.length - 1, st.mel + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.2 ? 2 : 1))); tone(NOTE(PENTA[st.mel]), t, st * 0.9, { type: 'square', gain: 0.035, attack: 0.005, release: 0.1, filter: 2600, echo: true }); }
    } },
    focus: { bpm: 80, step(i, t, st) {
      const prog = [CH.Dm7, CH.G7, CH.Cmaj7, CH.Am7]; const ch = prog[Math.floor(i / 8) % 4];
      if (i % 4 === 0) ch.forEach((n, k) => { tone(NOTE(n), t + k * 0.012, st * 3.6, { type: 'sine', gain: 0.055, attack: 0.03, release: 1.0, echo: true }); tone(NOTE(n + 12), t, st * 3, { type: 'sine', gain: 0.012, attack: 0.05, release: 0.8 }); });
      if (i % 8 === 0 || i % 8 === 5) tone(70, t, 0.22, { type: 'sine', gain: 0.2, attack: 0.003, release: 0.15, slide: 40 });
      if (i % 8 === 4) noise(t, 0.12, 0.05, 1200, 'bandpass');
      if (i % 2 === 0) noise(t, st * 2, 0.006, 3000, 'lowpass');
      if (i % 16 === 14 && Math.random() < 0.7) tone(NOTE(ch[2] + 12), t, st * 2, { type: 'triangle', gain: 0.03, attack: 0.01, release: 0.6, echo: true });
    } },
    tension: { bpm: 100, step(i, t, st) {
      if (i % 16 === 0) { tone(55, t, st * 16.2, { type: 'sawtooth', gain: 0.06, attack: 0.3, release: 0.4, filter: 240 + (i % 64) * 4 }); tone(58.27, t, st * 16.2, { type: 'sawtooth', gain: 0.03, attack: 0.5, release: 0.4, filter: 200, detune: -8 }); }
      const fast = (i % 64) >= 48;
      if (i % 2 === 0 || fast) tone(110, t, 0.12, { type: 'sine', gain: fast ? 0.13 : 0.09, attack: 0.002, release: 0.08, slide: 70 });
      if (i % 8 === 7) noise(t, 0.08, 0.06, 4000, 'bandpass');
      if (i % 64 === 60) tone(220, t, st * 4, { type: 'triangle', gain: 0.05, attack: 0.1, release: 0.3, slide: 440, echo: true });
    } }
  };
  function schedule() {
    if (!loop || !ctx) return;
    const st = 60 / loop.bpm / 2;   // durée d'une croche
    while (loop.next < ctx.currentTime + 0.25) { try { loop.gen.step(loop.i, loop.next, st, loop.state); } catch (e) { console.warn(e); } loop.i++; loop.next += st; }
  }
  function stopLoop() { if (loop) { clearInterval(loop.timer); loop = null; } }
  function stopFile() { if (audioEl) { try { audioEl.pause(); } catch { /* */ } audioEl = null; } }

  /* ---------------- API musique ---------------- */
  async function play(kind, quizId) {
    stop();
    curKind = kind || 'none';
    if (curKind === 'none') return;
    if (curKind === 'file') {
      const blob = quizId ? await getFile(quizId) : null;
      if (!blob) { curKind = 'calm'; }
      else {
        try {
          audioEl = new Audio(URL.createObjectURL(blob)); audioEl.loop = true; audioEl.volume = effVol();
          await audioEl.play(); return;
        } catch (e) { console.warn('Lecture du fichier impossible :', e); audioEl = null; curKind = 'calm'; }
      }
    }
    if (!GEN[curKind] || !ensure()) return;
    loop = { kind: curKind, bpm: GEN[curKind].bpm, gen: GEN[curKind], i: 0, next: ctx.currentTime + 0.05, state: {}, timer: null };
    loop.timer = setInterval(schedule, 60);
    schedule();
  }
  function stop() { stopLoop(); stopFile(); curKind = 'none'; }
  function setVolume(v) { vol = Math.max(0, Math.min(1, +v || 0)); applyVol(); }
  function setMuted(m) { muted = !!m; applyVol(); return muted; }
  function toggleMute() { return setMuted(!muted); }
  function duck(on) { ducked = !!on; applyVol(); }
  const playing = () => curKind !== 'none';

  /* ---------------- sons courts ---------------- */
  function sfx(name) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime + 0.01;
    const o = { dry: true };
    switch (name) {
      case 'tick': noise(t, 0.04, 0.12, 2500, 'bandpass'); tone(1200, t, 0.05, Object.assign({ type: 'square', gain: 0.03, release: 0.03 }, o)); break;
      case 'reveal': tone(NOTE(76), t, 0.25, Object.assign({ type: 'triangle', gain: 0.12, release: 0.15 }, o)); tone(NOTE(79), t + 0.12, 0.4, Object.assign({ type: 'triangle', gain: 0.12, release: 0.3, echo: true }, o)); break;
      case 'ok': [72, 76, 79, 84].forEach((n, k) => tone(NOTE(n), t + k * 0.09, 0.28, Object.assign({ type: 'triangle', gain: 0.1, release: 0.2, echo: true }, o))); break;
      case 'ko': tone(180, t, 0.35, Object.assign({ type: 'sawtooth', gain: 0.07, release: 0.2, filter: 500, slide: 110 }, o)); break;
      case 'late': tone(330, t, 0.2, Object.assign({ type: 'sine', gain: 0.08, release: 0.15 }, o)); tone(262, t + 0.18, 0.3, Object.assign({ type: 'sine', gain: 0.08, release: 0.2 }, o)); break;
      case 'join': tone(620, t, 0.14, Object.assign({ type: 'sine', gain: 0.09, release: 0.08, slide: 980 }, o)); break;
      case 'start': noise(t, 0.5, 0.08, 800, 'bandpass'); tone(NOTE(60), t, 0.5, Object.assign({ type: 'sine', gain: 0.1, release: 0.3, slide: NOTE(72) }, o)); break;
      case 'end': [60, 64, 67, 72, 67, 72].forEach((n, k) => tone(NOTE(n), t + k * 0.13, 0.45, Object.assign({ type: 'triangle', gain: 0.11, release: 0.25, echo: true }, o))); noise(t + 0.6, 0.6, 0.05, 5000, 'highpass'); break;
      case 'page': tone(NOTE(67), t, 0.16, Object.assign({ type: 'sine', gain: 0.07, release: 0.1 }, o)); break;
      default: tone(880, t, 0.08, Object.assign({ type: 'sine', gain: 0.06, release: 0.05 }, o));
    }
  }
  /* aperçu d'une musique de base dans le réglage (quelques secondes) */
  let previewTm = null;
  function preview(kind, quizId) {
    clearTimeout(previewTm);
    play(kind, quizId);
    previewTm = setTimeout(stop, 9000);
  }

  /* ---------------- fichier personnel (IndexedDB local) ---------------- */
  let dbp = null;
  const openDb = () => dbp || (dbp = new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open('alixo-quizfx', 1); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => r.result.createObjectStore('music');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  async function storeFile(quizId, file) {
    const db = await openDb();
    await new Promise((res, rej) => { const t = db.transaction('music', 'readwrite'); t.objectStore('music').put(file, quizId); t.oncomplete = res; t.onerror = () => rej(t.error); });
  }
  async function getFile(quizId) {
    try { const db = await openDb(); return await new Promise((res, rej) => { const r = db.transaction('music').objectStore('music').get(quizId); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); }
    catch { return null; }
  }
  async function removeFile(quizId) {
    try { const db = await openDb(); await new Promise((res, rej) => { const t = db.transaction('music', 'readwrite'); t.objectStore('music').delete(quizId); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch { /* */ }
  }

  return { TRACKS, play, stop, preview, setVolume, setMuted, toggleMute, isMuted: () => muted, duck, playing, current: () => curKind, sfx, storeFile, getFile, removeFile };
})();
