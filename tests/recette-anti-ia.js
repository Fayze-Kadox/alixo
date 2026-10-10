/* ============================================================
   alixoapp.com — scripts de recette « anti-aspiration » (§ 6.2 du cahier des charges), à rejouer après chaque mise à jour.
   Usage : node tests/recette-anti-ia.js [https://alixoapp.com | http://127.0.0.1:4180]
   Sans argument, un serveur statique local est lancé sur le dossier du dépôt (couche page seulement).
   Contre le site en production derrière Cloudflare, les tests réseau (user-agents, débit, cloud) s'ajoutent.
   Chaque test affiche ✓ / ✗ ; le code de sortie vaut 1 si un test échoue. Captures et rapport dans tests/rapport/.
   ============================================================ */
'use strict';
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const target = process.argv[2];
const results = []; const ok = (n, c, x) => { results.push({ n, ok: !!c, x }); console.log((c ? '✓ ' : '✗ ') + n + (x ? ' — ' + x : '')); if (!c) process.exitCode = 1; };
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.xml': 'application/xml' };
function serve() { return new Promise(r => { const s = http.createServer((q, res) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }); s.listen(0, '127.0.0.1', () => r({ base: 'http://127.0.0.1:' + s.address().port, close: () => s.close() })); }); }
const BOTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'PerplexityBot', 'Perplexity-User', 'Bytespider', 'Meta-ExternalAgent', 'Meta-ExternalFetcher', 'Amazonbot', 'cohere-ai', 'Diffbot', 'YouBot', 'omgili', 'ImagesiftBot'];
const PAGES = ['/', '/documentation.html', '/cgv.html', '/conditions.html', '/confidentialite.html', '/mentions-legales.html', '/contact.html', '/maintenance.html', '/404.html', '/versions/', '/telecharger/windows/', '/telecharger/windows-portable/', '/telecharger/mac/'];
/* données d'identification à ne jamais trouver en clair (noms réels retirés de ce script public : les compléter en local) */
const LEAK = [/mailto:/i, /\btel:/i, /\[adresse postale/i, /\[Prénom NOM/i, /000 000 000/, /Fayze/i, /Kadox/i, /SIREN<\/strong> : [0-9]/];
(async () => {
  const local = target ? null : await serve(); const base = (target || local.base).replace(/\/$/, '');
  const get = (p, headers) => fetch(base + p, { headers: Object.assign({ 'user-agent': 'Mozilla/5.0 (recette Alixo)', accept: 'text/html,*/*', 'accept-language': 'fr' }, headers || {}), redirect: 'manual' });
  /* robots.txt */
  const robots = await (await get('/robots.txt')).text();
  const missing = BOTS.filter(b => !new RegExp('^User-agent: ' + b.replace(/[-]/g, '\\-') + '\\s*$', 'mi').test(robots));
  ok('robots.txt : tous les robots IA de T-01 sont interdits', missing.length === 0, missing.join(', '));
  ok('robots.txt : pot de miel, mentions légales et contact interdits', /Disallow: \/piege\//.test(robots) && /Disallow: \/mentions-legales\.html/.test(robots) && /Disallow: \/contact\.html/.test(robots));
  /* TDM */
  const tdm = await get('/.well-known/tdmrep.json'); let tj = null; try { tj = await tdm.json(); } catch { /* */ }
  ok('tdmrep.json présent et valide', tdm.status === 200 && Array.isArray(tj) && tj[0] && tj[0]['tdm-reservation'] === 1);
  /* pages : meta, mailto, fuite, protection.js, pot de miel */
  for (const p of PAGES) {
    const r = await get(p); const html = await r.text();
    const metaTdm = /<meta name="tdm-reservation" content="1">/.test(html), metaAi = /<meta name="robots" content="[^"]*noai[^"]*noimageai/.test(html);
    const leaks = LEAK.filter(re => re.test(html));
    const prot = /protection\.js/.test(html);
    ok(`page ${p} : balises TDM + noai, aucun mailto/tel, aucune donnée d’identification, protection.js`, r.status === 200 && metaTdm && metaAi && leaks.length === 0 && prot, leaks.length ? 'fuite : ' + leaks.map(String).join(' ') : (!metaTdm ? 'meta TDM absente' : !metaAi ? 'meta noai absente' : !prot ? 'protection.js absent' : ''));
    if (/mentions-legales|contact/.test(p)) ok(`page ${p} : noindex`, /noindex/.test(html));
    if (target) ok(`page ${p} : en-tête TDM-Reservation`, r.headers.get('tdm-reservation') === '1', 'absent (Worker Cloudflare non déployé ?)');
  }
  /* sitemap */
  const sm = await (await get('/sitemap.xml')).text();
  ok('sitemap : ni mentions légales, ni contact, ni piège, ni application', !/mentions-legales|contact\.html|piege|\/docs\//.test(sm) && /documentation\.html/.test(sm));
  /* mentions légales brutes : rien d'exploitable ; données chiffrées */
  const md = await (await get('/mentions-data.js')).text();
  ok('mentions-data.js : rien de lisible (chiffré)', /"ct":"[A-Za-z0-9+/=]{40,}"/.test(md) && !/SIREN|adresse|@alixoapp/i.test(md));
  /* défi : un vrai navigateur, un geste humain, puis les données apparaissent ; un navigateur automatisé est refusé */
  let pw = null; try { pw = require(process.env.PLAYWRIGHT_MODULE || (fs.existsSync('/opt/node-tools/node_modules/playwright') ? '/opt/node-tools/node_modules/playwright' : 'playwright')); } catch { /* */ }
  if (pw) {
    fs.mkdirSync(path.join(__dirname, 'rapport'), { recursive: true });
    const browser = await pw.chromium.launch();
    // 1. navigateur automatisé (navigator.webdriver = true, comme Playwright par défaut)
    const p1 = await browser.newPage(); await p1.goto(base + '/mentions-legales.html'); await p1.waitForTimeout(300);
    ok('défi : navigateur automatisé refusé (navigator.webdriver)', await p1.$eval('#defi-btn', b => b.disabled) && /automatisé/.test(await p1.$eval('#defi-status', e => e.textContent)));
    const honey = await p1.$eval('a[href^="/piege/"]', a => a.getAttribute('aria-hidden') === 'true' && a.getBoundingClientRect().right < 0 && getComputedStyle(a).opacity === '0').catch(() => false);
    ok('pot de miel : lien invisible présent', honey);
    await p1.screenshot({ path: path.join(__dirname, 'rapport', 'defi-automatise.png') });
    // 2. navigateur humain simulé : webdriver masqué + geste souris → données affichées
    const ctx = await browser.newContext(); await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const p2 = await ctx.newPage(); await p2.goto(base + '/mentions-legales.html'); await p2.mouse.move(100, 100); await p2.mouse.move(200, 180);
    const before = await p2.content(); ok('mentions légales : HTML initial sans donnée obligatoire', !/Dénomination<\/strong> : [^'<]|000 000 000|\[adresse postale/.test(before) && (await p2.$eval('#editeur-data', e => e.hidden && !e.children.length)));
    await p2.click('#defi-btn'); await p2.waitForSelector('#editeur-data:not([hidden]) li', { timeout: 20000 });
    const shown = await p2.$eval('#editeur-data', e => e.textContent);
    ok('défi : données affichées après la preuve de travail', /Dénomination/.test(shown) && /Directeur de la publication/.test(shown));
    await p2.screenshot({ path: path.join(__dirname, 'rapport', 'defi-humain.png') });
    const p3 = await ctx.newPage(); await p3.goto(base + '/contact.html'); await p3.mouse.move(50, 50); await p3.mouse.move(60, 80); await p3.click('#defi-btn'); await p3.waitForSelector('#contact-data:not([hidden]) a', { timeout: 20000 });
    ok('contact : adresse révélée après défi, construite côté client', /@/.test(await p3.$eval('#contact-data', e => e.textContent)));
    await p3.screenshot({ path: path.join(__dirname, 'rapport', 'contact.png') });
    // tatouage
    const p4 = await ctx.newPage(); await p4.goto(base + '/documentation.html'); await p4.waitForTimeout(400);
    const zw = await p4.evaluate(() => (document.body.innerText.match(/[​‌]/g) || []).length);
    ok('tatouage : marqueurs invisibles présents dans la documentation', zw >= 5, zw + ' marqueur(s)');
    await browser.close();
  } else ok('Playwright disponible pour les tests du défi', false, 'npm i -D playwright');
  /* images : métadonnées */
  const imgDir = path.join(ROOT, 'img'); let exif = 0;
  for (const f of fs.readdirSync(imgDir)) { if (!/\.jpe?g$/i.test(f)) continue; const b = fs.readFileSync(path.join(imgDir, f)); if (b.includes(Buffer.from('Exif\0\0')) || b.includes(Buffer.from('http://ns.adobe.com/xap/'))) exif++; }
  ok('images : aucune métadonnée EXIF / XMP dans img/', exif === 0, exif + ' fichier(s)');
  /* réseau (production seulement) */
  if (target && /alixoapp\.com/.test(target)) {
    for (const ua of ['GPTBot/1.0', 'ClaudeBot/1.0', 'python-requests/2.31', 'curl/8.4.0', 'Scrapy/2.11']) { const r = await get('/documentation.html', { 'user-agent': ua }); ok(`réseau : ${ua} → 403 ou défi`, r.status === 403 || r.status === 429 || (r.status === 403) || [403, 429, 503].includes(r.status) || r.headers.get('cf-mitigated') === 'challenge', 'HTTP ' + r.status); }
    const r = await get('/mentions-legales.html', { accept: '*/*', 'accept-language': '' }); ok('réseau : mentions légales refusées sans en-têtes de navigateur', r.status === 403, 'HTTP ' + r.status);
  }
  fs.mkdirSync(path.join(__dirname, 'rapport'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'rapport', 'resultats.json'), JSON.stringify({ base, date: new Date().toISOString(), results }, null, 2));
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} tests réussis`);
  if (local) local.close();
})().catch(e => { console.error(e); process.exit(1); });
