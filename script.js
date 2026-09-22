/* ============================================================
   Alixo — Site vitrine (v2)
   Téléchargement direct, version live, macOS auto-détecté,
   thème, apparition au scroll, compteurs, démo de l'éditeur,
   changelog live depuis GitHub.
   ============================================================ */

const REPO = 'Fayze-Kadox/alixo';
const EXE_URL = `https://github.com/${REPO}/releases/latest/download/Alixo-Setup.exe`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

/* ---------- Téléchargement direct ---------- */
const dlToast = document.getElementById('dl-toast');
let toastTimer;

function startDownload() {
  const a = document.createElement('a');
  a.href = EXE_URL;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  dlToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dlToast.hidden = true; }, 8000);
}

document.querySelectorAll('[data-download]').forEach(el => {
  el.addEventListener('click', (e) => { e.preventDefault(); startDownload(); });
});
dlToast.querySelector('.dl-toast-close').addEventListener('click', () => {
  clearTimeout(toastTimer);
  dlToast.hidden = true;
});

/* ---------- Détection macOS ---------- */
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Macintosh/.test(navigator.userAgent);
if (isMac) {
  const n = document.getElementById('mac-notice');
  if (n) n.hidden = false;
}

/* ---------- Version, poids, portable, macOS, changelog (API GitHub) ---------- */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Rendu markdown minimal et sûr (texte échappé avant tout) */
function renderNotes(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  let html = '', inList = false, count = 0;
  const inline = (t) => escapeHtml(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (let raw of lines) {
    let line = raw.trim();
    if (!line) { closeList(); continue; }
    if (/^mise à jour automatique/i.test(line)) continue;        /* ligne technique */
    line = line.replace(/^(-\s+)+/, '- ');                        /* "- - item" → "- item" */
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) { closeList(); html += `<h4>${inline(h[1])}</h4>`; continue; }
    const li = line.match(/^[-*]\s+(.*)/);
    if (li) {
      if (count >= 8) continue;
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(li[1])}</li>`; count++; continue;
    }
    closeList();
    if (count === 0 && !html) { html += `<h4>${inline(line)}</h4>`; continue; } /* première ligne = titre */
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  .then(r => (r.ok ? r.json() : null))
  .then(rel => {
    if (!rel) return;
    const assets = rel.assets || [];

    if (rel.tag_name) {
      const v = rel.tag_name.replace(/^v?/i, 'v');
      document.querySelectorAll('.js-version').forEach(el => { el.textContent = v; });
    }
    const setup = assets.find(a => a.name === 'Alixo-Setup.exe');
    if (setup && setup.size) {
      const mo = (setup.size / 1048576).toFixed(setup.size > 104857600 ? 0 : 1).replace('.', ',');
      document.querySelectorAll('.js-size').forEach(el => { el.textContent = mo + ' Mo'; });
    }
    const portable = assets.find(a => /portable\.exe$/i.test(a.name));
    const portableLink = document.getElementById('dl-portable');
    if (portable && portableLink) portableLink.href = portable.browser_download_url;

    /* Le jour où un .dmg apparaît dans la release, la carte macOS s'active toute seule. */
    const mac = assets.find(a => /\.dmg$/i.test(a.name) || /mac|darwin/i.test(a.name));
    if (mac) {
      const card = document.getElementById('dl-mac');
      const btn = document.getElementById('btn-mac');
      card.classList.add('available');
      btn.textContent = 'Télécharger pour macOS';
      btn.classList.remove('ghost'); btn.classList.add('primary');
      btn.href = `https://github.com/${REPO}/releases/latest/download/Alixo-Mac.dmg`; btn.removeAttribute('target');
      const hint = document.getElementById('mac-hint');
      if (hint) hint.hidden = false;
      document.querySelectorAll('.cta-mac, .soon-badge').forEach(el => { el.textContent = el.classList.contains('soon-badge') ? 'Disponible' : ' macOS · disponible'; });
      const notice = document.getElementById('mac-notice');
      if (notice) notice.innerHTML = ' La version macOS est disponible. <a href="' + btn.href + '">Télécharger Alixo pour Mac →</a>';
      const tag = card.querySelector('.dl-soon-tag');
      if (tag) { tag.textContent = 'Disponible'; tag.style.display = 'inline-block'; }
      const txt = card.querySelector('.dl-mac-txt');
      if (txt) txt.textContent = 'Même application, mêmes fonctionnalités, même compte : tes cours pris sur Windows sont déjà là.';
    }

    /* Changelog */
    if (rel.body) {
      const body = document.getElementById('cl-body');
      const html = renderNotes(rel.body);
      if (body && html) body.innerHTML = html;
    }
    if (rel.published_at) {
      const d = new Date(rel.published_at);
      const el = document.getElementById('cl-date');
      if (el) el.textContent = 'Publiée le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  })
  .catch(() => {});

/* ---------- Thème ---------- */
const root = document.documentElement;
const savedTheme = localStorage.getItem('alixo-theme');
if (savedTheme) root.dataset.theme = savedTheme;
else if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';
document.getElementById('btn-theme').addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('alixo-theme', next);
});

/* ---------- Nav ---------- */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- Apparition au scroll ---------- */
const revealObs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
  }
}, { threshold: 0.1, rootMargin: '0px 0px -40px' });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

/* ---------- Compteurs ---------- */
const countObs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    countObs.unobserve(e.target);
    const el = e.target;
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    if (target === 0) { el.textContent = '0' + suffix; continue; }
    const t0 = performance.now(), dur = 1100;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}, { threshold: 0.5 });
document.querySelectorAll('.stat-n').forEach(el => countObs.observe(el));

/* ============================================================
   Captures réelles — onglets + alternance automatique
   ============================================================ */
const SHOT_TITLES = {
  droit: "Droit des obligations — fiche d'arrêt, définition, références Légifrance",
  eco: 'Macroéconomie — formules rendues et graphique IS-LM',
  galaxy: 'Bibliothèque — vue Galaxie de tes dossiers et séances',
  slides: 'Présentations — blocs à glisser-déposer, thèmes, notes',
  agenda: 'Agenda — tes cours du mois, événement en cours dans la barre',
  search: 'Recherche universelle — Ctrl+K dans tous les cours et fichiers',
  dark: 'Thème sombre — et 11 autres thèmes dans Paramètres › Apparence',
};
const shotTabs = [...document.querySelectorAll('.shots-tab')];
const shotImgs = [...document.querySelectorAll('.shot')];
const shotTitle = document.getElementById('shots-title');
function showShot(key) {
  shotTabs.forEach(t => { const on = t.dataset.shot === key; t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
  shotImgs.forEach(i => i.classList.toggle('on', i.dataset.shot === key));
  shotTitle.textContent = SHOT_TITLES[key] || '';
}
shotTabs.forEach(t => t.addEventListener('click', () => showShot(t.dataset.shot)));

let autoSwap = setInterval(() => {
  const stage = document.getElementById('demo');
  const r = stage.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const i = shotTabs.findIndex(t => t.classList.contains('active'));
  showShot(shotTabs[(i + 1) % shotTabs.length].dataset.shot);
}, 7000);
document.querySelector('.shots-tabs').addEventListener('click', () => clearInterval(autoSwap), { once: true });
