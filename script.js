/* ============================================================
   Alixo — Site vitrine
   Thème, apparition au scroll, compteurs, démo Droit / Éco,
   simulateur de double licence.
   ============================================================ */

/* ============================================================
   Téléchargement direct de l'application PC
   Le lien GitHub "releases/latest/download" est servi en
   Content-Disposition: attachment → le navigateur télécharge
   le .exe sans jamais afficher GitHub.
   ============================================================ */
const EXE_URL = 'https://github.com/Fayze-Kadox/alixo/releases/latest/download/Alixo-Setup.exe';

const dlToast = document.getElementById('dl-toast');
document.getElementById('dl-fallback').href = EXE_URL;
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

/* Version et poids réels, récupérés depuis l'API publique GitHub.
   En cas d'échec (hors-ligne, quota), les libellés par défaut restent. */
fetch('https://api.github.com/repos/Fayze-Kadox/alixo/releases/latest')
  .then(r => (r.ok ? r.json() : null))
  .then(rel => {
    if (!rel) return;
    if (rel.tag_name) {
      const v = rel.tag_name.replace(/^v?/i, 'v');
      document.querySelectorAll('.js-version').forEach(el => { el.textContent = v; });
    }
    const asset = (rel.assets || []).find(a => a.name === 'Alixo-Setup.exe');
    if (asset && asset.size) {
      const mo = (asset.size / 1048576).toFixed(asset.size > 104857600 ? 0 : 1).replace('.', ',');
      document.querySelectorAll('.js-size').forEach(el => { el.textContent = mo + ' Mo'; });
    }
  })
  .catch(() => {});

/* ---------- Thème clair / sombre ---------- */
const root = document.documentElement;
const savedTheme = localStorage.getItem('alixo-theme');
if (savedTheme) {
  root.dataset.theme = savedTheme;
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  root.dataset.theme = 'dark';
}
document.getElementById('btn-theme').addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('alixo-theme', next);
});

/* ---------- Nav : bordure au scroll ---------- */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- Apparition au scroll ---------- */
const revealObs = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
  }
}, { threshold: 0.12, rootMargin: '0px 0px -40px' });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

/* ---------- Compteurs animés ---------- */
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
   Démo de l'éditeur — contenus Droit / Économie
   ============================================================ */
const DEMOS = {
  droit: {
    chip: 'Droit des obligations',
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
      <div class="md-h1"><span class="hnum">I.</span> La formation du contrat</div>
      <div class="md-p">Le contrat est formé par la rencontre d'une offre et d'une acceptation
      <span class="refart">Art. 1113 C. civ.</span>. L'offre doit être <span class="hl">ferme et précise</span>,
      faute de quoi elle ne constitue qu'une invitation à entrer en pourparlers.</div>
      <div class="md-callout def" data-ico="📘"><span class="ct">Définition</span>
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
    chip: 'Microéconomie — L1',
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
          <text class="glabel-d" x="238" y="103">D</text>
          <text class="glabel-s" x="238" y="27">O</text>
        </svg>
        <div class="md-gbar"><span class="on">Équilibre</span><span>Taxe</span><span>Prix plafond</span><span>Surplus</span></div>
      </div>
      <div class="md-callout ex" data-ico="🧮"><span class="ct">Exemple</span>
      Si la demande augmente à offre constante, P* et Q* augmentent tous les deux.</div>
      <div class="md-formula">ε<sub>p</sub> = <span class="frac"><span class="num">ΔQ / Q</span><span class="den">ΔP / P</span></span></div>
      <div class="md-p">Une demande est dite élastique lorsque |ε| &gt; 1<span class="mock-caret"></span></div>`
  }
};

const mockDoc = document.getElementById('mock-doc');
const mockPlan = document.getElementById('mock-plan');
const mockChip = document.getElementById('mock-chip');
const mockProgress = document.querySelector('.mp-progress span');

function renderDemo(key) {
  const d = DEMOS[key];
  mockChip.textContent = d.chip;
  mockProgress.style.width = d.progress + '%';
  mockPlan.innerHTML = d.plan.map(it =>
    `<div class="mp-item i${it.lvl}${it.cur ? ' cur' : ''}"><span class="n">${it.n}</span><span>${it.t}</span></div>`
  ).join('');
  mockDoc.innerHTML = d.doc;
  mockDoc.classList.remove('switching');
  void mockDoc.offsetWidth; /* relance l'animation */
  mockDoc.classList.add('switching');
}

document.querySelectorAll('.mock-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mock-tab').forEach(t => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    renderDemo(tab.dataset.demo);
  });
});
renderDemo('droit');

/* alternance automatique tant que l'utilisateur n'a pas cliqué */
let autoSwap = setInterval(() => {
  const current = document.querySelector('.mock-tab.active');
  const next = current.dataset.demo === 'droit'
    ? document.querySelector('.mock-tab[data-demo="eco"]')
    : document.querySelector('.mock-tab[data-demo="droit"]');
  next.click();
}, 9000);
document.querySelector('.mock-tabs').addEventListener('click', () => {
  clearInterval(autoSwap);
}, { once: true });

/* ============================================================
   Filières — simulateur de sélection multiple
   ============================================================ */
const FIL_NAMES = {
  droit: 'Droit', eco: 'Économie', medecine: 'Médecine', gestion: 'Gestion',
  commerce: 'Commerce', communication: 'Communication', assurance: 'Assurance'
};
const combo = document.getElementById('fil-combo');
const comboText = document.getElementById('combo-text');

function updateCombo() {
  const sel = [...document.querySelectorAll('.fil-card.selected')].map(c => c.dataset.fil);
  const names = sel.map(f => `<strong>${FIL_NAMES[f]}</strong>`);
  let msg;
  if (sel.length === 0) {
    msg = 'Aucune filière sélectionnée — clique sur une carte pour composer ton profil.';
  } else if (sel.length === 1) {
    msg = `Sélection actuelle&nbsp;: ${names[0]} — clique sur une autre carte pour simuler une double licence.`;
  } else if (sel.length === 2) {
    msg = `🎉 Double licence ${names.join(' + ')}&nbsp;: Alixo active les blocs des deux filières dans le même cours.`;
  } else {
    msg = `Profil ${names.join(' + ')}&nbsp;: ambitieux&nbsp;! Alixo combine les ${sel.length} filières sans broncher.`;
  }
  const soonSel = [...document.querySelectorAll('.fil-card.selected.soon')];
  if (soonSel.length) {
    msg += ' <em>(les filières «&nbsp;bientôt&nbsp;» seront activées dès leur sortie)</em>';
  }
  comboText.innerHTML = msg;
  combo.classList.remove('flash');
  void combo.offsetWidth;
  combo.classList.add('flash');
}

document.querySelectorAll('.fil-card[data-fil]').forEach(card => {
  card.addEventListener('click', () => {
    card.classList.toggle('selected');
    updateCombo();
  });
});
