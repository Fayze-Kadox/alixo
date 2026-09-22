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
      btn.href = mac.browser_download_url; btn.removeAttribute('target');
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
   Démo de l'éditeur — Droit / Économie / Santé
   ============================================================ */
const DEMOS = {
  droit: {
    chip: 'Droit des obligations',
    tree: [
      { t: '📁 Droit des obligations', l: 1, open: true },
      { t: 'Séance 3 — Le consentement', l: 2 },
      { t: 'Séance 4 — La formation', l: 2, cur: true },
      { t: 'Fiche TD 3.pdf', l: 3, fi: 'pdf' },
      { t: '📁 Droit de la famille', l: 1 },
      { t: '📁 Institutions judiciaires', l: 1 },
    ],
    plan: [
      { n: 'I.', t: 'La formation du contrat', lvl: 1 },
      { n: 'A.', t: "L'offre", lvl: 2, cur: true },
      { n: '1.', t: 'Les caractères', lvl: 3 },
      { n: '2.', t: 'La rétractation', lvl: 3 },
      { n: 'B.', t: "L'acceptation", lvl: 2 },
      { n: 'II.', t: 'La validité du contrat', lvl: 1 },
      { n: 'A.', t: 'Le consentement', lvl: 2 },
    ],
    progress: 42,
    doc: `
      <div class="md-title">Séance 4 — La formation du contrat</div>
      <div class="md-meta">Mardi 22 septembre · Amphi A · Pr. Delmas</div>
      <div class="md-h1"><span class="hnum">I.</span> La formation du contrat</div>
      <div class="md-p">Le contrat est formé par la rencontre d'une offre et d'une acceptation
      <span class="refart">Art. 1113 C. civ.</span>. L'offre doit être <span class="hl">ferme et précise</span>,
      faute de quoi elle ne constitue qu'une invitation à entrer en pourparlers.</div>
      <div class="md-callout def"><span class="ct">Définition</span>
      L'offre est la manifestation unilatérale de volonté par laquelle une personne propose la conclusion d'un contrat déterminé.</div>
      <div class="md-h2"><span class="hnum">A.</span> L'offre</div>
      <div class="md-juris">
        <div class="md-juris-head">⚖️ Cass. civ. 1re, 12 juill. 2023, n° 22-14.081</div>
        <div class="md-juris-row"><span>Faits</span><i>Rétractation d'une offre de vente avant l'expiration du délai raisonnable.</i></div>
        <div class="md-juris-row"><span>Solution</span><i>La rétractation fautive engage la responsabilité de l'offrant.</i></div>
        <div class="md-juris-row"><span>Portée</span><i>Confirmation de la ligne de l'art. 1116 C. civ.</i></div>
      </div>
      <div class="md-p">La rétractation de l'offre avant l'expiration du délai empêche la conclusion du contrat<span class="mock-caret"></span></div>`
  },
  eco: {
    chip: 'Microéconomie',
    tree: [
      { t: '📁 Microéconomie', l: 1, open: true },
      { t: 'Séance 5 — La demande', l: 2 },
      { t: 'Séance 6 — L’équilibre', l: 2, cur: true },
      { t: 'Données TD.xlsx', l: 3, fi: 'xls' },
      { t: '📁 Macroéconomie', l: 1 },
      { t: '📁 Statistiques', l: 1 },
    ],
    plan: [
      { n: 'I.', t: 'Le marché', lvl: 1 },
      { n: 'A.', t: 'La demande', lvl: 2 },
      { n: 'B.', t: "L'offre", lvl: 2 },
      { n: 'II.', t: "L'équilibre", lvl: 1, cur: true },
      { n: 'A.', t: 'Le prix d’équilibre', lvl: 2 },
      { n: 'B.', t: 'Les élasticités', lvl: 2 },
    ],
    progress: 64,
    doc: `
      <div class="md-title">Séance 6 — L'équilibre du marché</div>
      <div class="md-meta">Jeudi 24 septembre · Amphi B · Pr. Morel</div>
      <div class="md-h1"><span class="hnum">II.</span> L'équilibre du marché</div>
      <div class="md-p">Le prix d'équilibre égalise les quantités offertes et demandées&nbsp;:
      au point E, <span class="hl">le marché est apuré</span>.</div>
      <div class="md-graph">
        <svg viewBox="0 0 260 130">
          <path class="gx" d="M28 10v104h218"/>
          <path class="gd" d="M40 24C96 40 150 74 234 100"/>
          <path class="gs" d="M40 100C96 84 150 50 234 24"/>
          <path class="gdash" d="M137 62H28M137 62v52"/>
          <circle class="gpt" cx="137" cy="62" r="4"/>
          <text x="10" y="65">P*</text>
          <text x="132" y="124">Q*</text>
          <text x="238" y="103">D</text>
          <text x="238" y="27">O</text>
        </svg>
        <div class="md-gbar"><span class="on">Équilibre</span><span>Taxe</span><span>Prix plafond</span><span>Surplus</span></div>
      </div>
      <div class="md-callout ex"><span class="ct">Exemple</span>
      Si la demande augmente à offre constante, P* et Q* augmentent tous les deux.</div>
      <div class="md-formula">ε<sub>p</sub> = <span class="frac"><span class="num">ΔQ / Q</span><span class="den">ΔP / P</span></span></div>
      <div class="md-p">Une demande est dite élastique lorsque |ε| &gt; 1<span class="mock-caret"></span></div>`
  },
  sante: {
    chip: 'Cardiologie — DFASM1',
    tree: [
      { t: '📁 Cardiologie', l: 1, open: true },
      { t: 'Item 230 — Fibrillation atriale', l: 2, cur: true },
      { t: 'Item 231 — Valvulopathies', l: 2 },
      { t: 'Reco HAS 2024.pdf', l: 3, fi: 'pdf' },
      { t: '📁 Pneumologie', l: 1 },
      { t: '📁 ECOS — entraînement', l: 1 },
    ],
    plan: [
      { n: 'I.', t: 'Définition & épidémiologie', lvl: 1 },
      { n: 'II.', t: 'Diagnostic', lvl: 1 },
      { n: 'A.', t: 'Clinique', lvl: 2 },
      { n: 'B.', t: 'ECG', lvl: 2 },
      { n: 'III.', t: 'Prise en charge', lvl: 1, cur: true },
      { n: 'A.', t: 'Anticoagulation', lvl: 2 },
    ],
    progress: 78,
    doc: `
      <div class="md-title">Item 230 — Fibrillation atriale</div>
      <div class="md-meta">Lundi 21 septembre · CHU · Pr. Lambert · <span class="md-rang">Rang A</span></div>
      <div class="md-h1"><span class="hnum">III.</span> Prise en charge</div>
      <div class="md-p">L'indication d'anticoagulation repose sur le score <span class="hl">CHA₂DS₂-VASc</span>&nbsp;:
      anticoagulation recommandée si score ≥ 2 chez l'homme, ≥ 3 chez la femme.</div>
      <div class="md-score">
        <b style="grid-column:1/-1">Score CHA₂DS₂-VASc</b>
        <span>Insuffisance cardiaque</span><b>1</b>
        <span>HTA</span><b>1</b>
        <span>Âge ≥ 75 ans</span><b>2</b>
        <span>Diabète</span><b>0</b>
        <b class="total">Total : 4 → anticoagulation</b>
      </div>
      <div class="md-callout flag"><span class="ct">Drapeau rouge</span>
      FA + AVC ischémique récent : différer l'anticoagulation selon la taille de l'infarctus.</div>
      <div class="md-callout ret"><span class="ct">Mnémotechnique</span>
      C-H-A-D-S-VA-Sc : Cardiaque, HTA, Âge, Diabète, Stroke, Vasculaire, Âge 65, Sexe.</div>
      <div class="md-p">Bilan avant AOD : NFS, créatininémie (Cockcroft), bilan hépatique<span class="mock-caret"></span></div>`
  }
};

const mockDoc = document.getElementById('mock-doc');
const mockPlan = document.getElementById('mock-plan');
const mockTree = document.getElementById('mock-tree');
const mockChip = document.getElementById('mock-chip');
const mockProgress = document.getElementById('mock-progress');
const mockPct = document.getElementById('mock-pct');

function renderDemo(key) {
  const d = DEMOS[key];
  mockChip.textContent = d.chip;
  mockProgress.style.width = d.progress + '%';
  mockPct.textContent = d.progress + ' %';
  mockTree.innerHTML = d.tree.map(it =>
    `<div class="ms-item l${it.l}${it.cur ? ' cur' : ''}">${it.fi ? `<span class="fi ${it.fi}">${it.fi.toUpperCase()}</span>` : ''}<span>${it.t}</span></div>`
  ).join('');
  mockPlan.innerHTML = d.plan.map(it =>
    `<div class="mp-item i${it.lvl}${it.cur ? ' cur' : ''}"><span class="n">${it.n}</span><span>${it.t}</span></div>`
  ).join('');
  mockDoc.innerHTML = d.doc;
  mockDoc.classList.remove('switching');
  void mockDoc.offsetWidth;
  mockDoc.classList.add('switching');
}

const tabs = [...document.querySelectorAll('.mock-tab')];
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    renderDemo(tab.dataset.demo);
  });
});
renderDemo('droit');

/* Alternance automatique tant que l'utilisateur n'a pas cliqué et que la maquette est visible */
let autoSwap = setInterval(() => {
  const mock = document.getElementById('demo');
  const r = mock.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const i = tabs.findIndex(t => t.classList.contains('active'));
  tabs[(i + 1) % tabs.length].click();
}, 8000);
document.querySelector('.mock-tabs').addEventListener('click', () => clearInterval(autoSwap), { once: true });
