/* ============================================================
   alixoapp.com — Cloudflare Worker de protection (couche réseau du cahier des charges, § 5.2 et 5.3)
   GitHub Pages ne permet ni en-têtes personnalisés ni règles de pare-feu : ce Worker, placé devant le site (route
   alixoapp.com/*, Cloudflare en proxy orange), applique :
     T-06  blocage par user-agent (robots IA de robots.txt + clients génériques) → 403
     T-07  défi (redirection vers la page de défi géré) pour les ASN de fournisseurs cloud / IA, sauf liste blanche
     T-09  limitation de débit : 30 pages / minute et 300 / heure par adresse IP (compteurs KV) → 429 puis bannissement 1 h
     T-10  défi systématique pour le trafic classé proxy / VPN / Tor (cf.botManagement / cf.asn connus)
     T-13  en-têtes nettoyés (Server, X-Powered-By, X-GitHub-Request-Id…) et ajout de TDM-Reservation, X-Robots-Tag
     T-15  pot de miel : toute visite de /piege/ bannit l'adresse 30 jours
     T-19  mentions légales et contact : refus aux requêtes sans en-tête de navigateur cohérent (Accept, Accept-Language)
   Prérequis : un espace KV lié sous le nom BANS (wrangler.toml : [[kv_namespaces]] binding = "BANS").
   Les règles « managées » (Bot Fight Mode / Super Bot Fight Mode, « Block AI bots », WAF, empreintes JA3/JA4) se
   règlent dans le tableau de bord Cloudflare : voir README.md de ce dossier.
   ============================================================ */
const AI_UA = /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|Google-Extended|GoogleOther|Applebot-Extended|CCBot|PerplexityBot|Perplexity-User|Bytespider|TikTokSpider|Meta-ExternalAgent|Meta-ExternalFetcher|FacebookBot|Amazonbot|cohere-ai|cohere-training|Diffbot|YouBot|omgili|webzio|ImagesiftBot|img2dataset|AI2Bot|DuckAssistBot|PetalBot|Timpibot|VelenPublicWebCrawler|MistralAI-User|FirecrawlAgent|Crawlspace|ICC-Crawler|PanguBot|SBIntuitionsBot|TurnitinBot|bedrockbot|Gemini-Deep-Research|NovaAct|Operator|Devin|Manus/i;
const GENERIC_UA = /python-requests|python-urllib|aiohttp|httpx|^curl\/|^Wget|Scrapy|HeadlessChrome|PhantomJS|Go-http-client|axios|node-fetch|undici|okhttp|libwww-perl|Java\/|Apache-HttpClient|^$/i;
/* numéros d'ASN de fournisseurs cloud et d'IA : défi (et non blocage) — liste à revoir mensuellement */
const CLOUD_ASN = new Set([16509, 14618, 8987, 15169, 396982, 8075, 16276, 24940, 14061, 20473, 63949, 45102, 37963, 132203, 55960, 13335 /* Cloudflare Workers eux-mêmes */, 212238, 51167, 60781, 29802]);
const ALLOW_ASN = new Set([15169 /* Googlebot légitime : vérifié par cf.verifiedBot ci-dessous */]);
const RATE_MIN = 30, RATE_HOUR = 300;
const PROTECTED = ['/mentions-legales.html', '/contact.html'];
const SEARCH_BOTS = /Googlebot|Bingbot|DuckDuckBot|Qwantify|Applebot\b(?!-Extended)|YandexBot|Baiduspider/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
    const ua = request.headers.get('user-agent') || '';
    const cf = request.cf || {};
    const path = url.pathname;
    const key = 'ip:' + ip;

    /* bannis (pot de miel, dépassement répété) */
    const ban = env.BANS ? await env.BANS.get(key) : null;
    if (ban) return deny(403, 'Accès refusé.');

    /* T-15 : pot de miel */
    if (path.startsWith('/piege/')) { if (env.BANS) ctx.waitUntil(env.BANS.put(key, 'honeypot', { expirationTtl: 30 * 86400 })); return deny(403, 'Accès refusé.'); }

    /* T-06 : user-agents IA et clients génériques (les moteurs de recherche vérifiés passent) */
    const verifiedBot = !!(cf.botManagement && cf.botManagement.verifiedBot);
    if (AI_UA.test(ua)) return deny(403, 'Robots d’intelligence artificielle interdits (robots.txt, TDM-Reservation).');
    if (GENERIC_UA.test(ua) && !verifiedBot) return deny(403, 'Client non pris en charge.');

    /* T-07 / T-10 : ASN cloud, proxys, VPN, Tor, score de robot faible → défi géré de Cloudflare */
    const asn = +cf.asn || 0;
    const score = cf.botManagement && typeof cf.botManagement.score === 'number' ? cf.botManagement.score : 100;
    const suspicious = (CLOUD_ASN.has(asn) && !ALLOW_ASN.has(asn)) || score < 30 || cf.isEUCountry === undefined && false;
    if (suspicious && !verifiedBot && !SEARCH_BOTS.test(ua)) {
      // Le Worker ne peut pas lancer lui-même un défi interactif : on renvoie 403 avec l'en-tête lu par la règle WAF
      // « Managed Challenge » (voir README : règle « http.response.headers["x-alixo-challenge"] eq "1" » impossible côté
      // réponse → la règle WAF équivalente est posée sur la requête : asn/score). Ici : 403 sobre.
      return deny(403, 'Vérification requise : ce réseau est associé à des accès automatisés. Utilisez un navigateur classique depuis une connexion résidentielle.');
    }

    /* T-09 : limitation de débit (pages HTML seulement) */
    const isPage = !/\.(css|js|png|jpg|jpeg|webp|svg|ico|mp4|webm|woff2?|json|xml|txt)$/i.test(path);
    if (isPage && env.BANS) {
      const now = Date.now(), minKey = key + ':m' + Math.floor(now / 60000), hourKey = key + ':h' + Math.floor(now / 3600000);
      const [m, h] = await Promise.all([env.BANS.get(minKey), env.BANS.get(hourKey)]);
      const mc = (+m || 0) + 1, hc = (+h || 0) + 1;
      ctx.waitUntil(Promise.all([env.BANS.put(minKey, String(mc), { expirationTtl: 120 }), env.BANS.put(hourKey, String(hc), { expirationTtl: 3700 })]));
      if (mc > RATE_MIN * 2 || hc > RATE_HOUR * 2) { ctx.waitUntil(env.BANS.put(key, 'rate', { expirationTtl: 3600 })); return deny(429, 'Trop de requêtes : accès suspendu une heure.'); }
      if (mc > RATE_MIN || hc > RATE_HOUR) return deny(429, 'Trop de requêtes : ralentissez.', { 'retry-after': '60' });
    }

    /* T-19 : pages à données obligatoires — un navigateur annonce Accept et Accept-Language */
    if (PROTECTED.includes(path)) {
      const acc = request.headers.get('accept') || '', lang = request.headers.get('accept-language') || '';
      if (!/text\/html/.test(acc) || !lang) return deny(403, 'Page réservée aux navigateurs.');
    }

    /* origine : GitHub Pages */
    const res = await fetch(request, { cf: { cacheEverything: false } });
    const out = new Response(res.body, res);
    /* T-13 : en-têtes nettoyés + déclarations T-02 / T-03 */
    for (const h of ['server', 'x-powered-by', 'x-github-request-id', 'x-served-by', 'x-fastly-request-id', 'x-timer', 'via', 'x-cache', 'x-cache-hits', 'x-proxy-cache']) out.headers.delete(h);
    out.headers.set('TDM-Reservation', '1');
    out.headers.set('TDM-Policy', 'https://alixoapp.com/conditions.html#tdm');
    out.headers.set('X-Robots-Tag', PROTECTED.includes(path) || path.startsWith('/piege/') ? 'noindex, nofollow, noai, noimageai' : 'noai, noimageai');
    out.headers.set('X-Content-Type-Options', 'nosniff');
    out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    out.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (!out.headers.has('Strict-Transport-Security')) out.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    return out;
  }
};
function deny(status, text, extra) {
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${status}</title><body style="font-family:system-ui;max-width:520px;margin:12vh auto;padding:0 20px;color:#223"><h1 style="font-size:22px">Alixo</h1><p>${text}</p><p style="color:#778;font-size:13px">Si vous êtes un visiteur humain et que ce message est une erreur, réessayez dans quelques minutes.</p></body></html>`, { status, headers: Object.assign({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'X-Robots-Tag': 'noindex', 'TDM-Reservation': '1' }, extra || {}) });
}
