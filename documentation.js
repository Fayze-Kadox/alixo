/* Documentation Alixo : thème, navigation, surlignage de la section courante, recherche dans la page. */
const root = document.documentElement;
if (!root.dataset.theme) {
  let saved = null; try { saved = localStorage.getItem('alixo-theme'); } catch (e) {}
  root.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
document.getElementById('btn-theme').addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('alixo-theme', next); } catch (e) {}
});
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

/* Sommaire : section courante */
const links = [...document.querySelectorAll('.doc-side a[href^="#"]')];
const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
const targets = [...byId.keys()].map(id => document.getElementById(id)).filter(Boolean);
let current = null;
const spy = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { current = e.target.id; }
  if (!current) return;
  links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + current));
}, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
targets.forEach(t => spy.observe(t));

/* Sommaire repliable sur téléphone */
const side = document.querySelector('.doc-side');
const toggle = document.querySelector('.doc-side-toggle');
if (toggle) toggle.addEventListener('click', () => side.classList.toggle('open'));
links.forEach(a => a.addEventListener('click', () => side.classList.remove('open')));

/* Recherche dans la page : filtre les sections, surligne les mots */
const input = document.getElementById('doc-q');
const sections = [...document.querySelectorAll('.doc-main > section')];
const noRes = document.getElementById('doc-noresult');
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function clearMarks() { document.querySelectorAll('mark.hit').forEach(m => m.replaceWith(m.textContent)); }
function markIn(el, q) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement.closest('video, script, style, mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
  let count = 0;
  for (const t of nodes) {
    const txt = t.nodeValue, low = norm(txt); let i = low.indexOf(q); if (i < 0) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    while (i >= 0 && count < 400) { frag.append(txt.slice(last, i)); const m = document.createElement('mark'); m.className = 'hit'; m.textContent = txt.slice(i, i + q.length); frag.append(m); last = i + q.length; i = low.indexOf(q, last); count++; }
    frag.append(txt.slice(last)); t.replaceWith(frag);
  }
  return count;
}
function search() {
  const q = norm(input.value.trim());
  clearMarks();
  let shown = 0;
  for (const s of sections) {
    const ok = q.length < 2 || norm(s.textContent).includes(q);
    s.hidden = !ok; if (ok) shown++;
    if (ok && q.length >= 2) markIn(s, q);
  }
  noRes.style.display = shown ? 'none' : 'block';
  links.forEach(a => { const s = document.getElementById(a.getAttribute('href').slice(1)); a.style.display = (s && s.closest('section') && s.closest('section').hidden) ? 'none' : ''; });
}
let timer; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 120); });
addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== input && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); } if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; search(); input.blur(); } });
if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(() => el.scrollIntoView(), 50); }
