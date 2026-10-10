# Couche réseau : Cloudflare devant alixoapp.com

Le site est servi par GitHub Pages, qui n'offre ni pare-feu applicatif, ni en-têtes personnalisés, ni limitation de
débit. Le cahier des charges (T-05 à T-14) impose un CDN avec gestion des robots : **Cloudflare** (offre gratuite
ou Pro) suffit. Tout ce qui suit est versionné ici pour être rejoué.

## 1. Mettre le domaine derrière Cloudflare

1. Ajouter `alixoapp.com` dans Cloudflare, reprendre les enregistrements existants, changer les serveurs de noms
   chez le registrar.
2. DNS : `A alixoapp.com → 185.199.108.153 / .109 / .110 / .111` et `CNAME www → ultra-project.github.io`,
   **nuage orange** (proxy) sur les deux. Le domaine de la messagerie (`mail.alixoapp.com`, MX) reste en nuage gris.
3. SSL/TLS : mode *Full (strict)*, HSTS activé, TLS 1.2 minimum.
4. **T-12** : l'origine GitHub Pages reste joignable directement (`ultra-project.github.io`), c'est inhérent à
   GitHub Pages ; ce qui compte est que `alixoapp.com` ne pointe plus que vers Cloudflare et que l'ancien hôte
   `*.github.io` ne soit indiqué nulle part (le site ne le mentionne pas).

## 2. Robots (T-05, T-06, T-08, T-10)

Tableau de bord › *Security* › *Bots* :

- **Bot Fight Mode** (gratuit) ou **Super Bot Fight Mode** (Pro) : activer, « Definitely automated » = *Block*,
  « Likely automated » = *Managed Challenge*, « Verified bots » = *Allow* (moteurs de recherche).
- **Block AI bots** (section *AI Scrapers and Crawlers*) : *On* — Cloudflare maintient la liste des robots IA et
  les bloque par empreinte, pas seulement par user-agent (couvre T-08 : JA3/JA4, ordre des en-têtes).
- **AI Labyrinth** : *On* (les robots qui ignorent robots.txt sont envoyés vers des pages leurres).
- *Security* › *Settings* : « Browser Integrity Check » *On* ; « Challenge Passage » 30 minutes.

## 3. Règles WAF (T-06, T-07, T-09, T-10) — *Security* › *WAF* › *Custom rules*

| Nom | Expression | Action |
| --- | --- | --- |
| Robots IA | `(http.user_agent contains "GPTBot") or (http.user_agent contains "ClaudeBot") or (http.user_agent contains "CCBot") or (http.user_agent contains "Bytespider") or (http.user_agent contains "PerplexityBot") or (http.user_agent contains "Google-Extended") or (http.user_agent contains "Applebot-Extended") or (http.user_agent contains "Amazonbot") or (http.user_agent contains "Meta-ExternalAgent") or (http.user_agent contains "anthropic-ai") or (http.user_agent contains "cohere-ai") or (http.user_agent contains "Diffbot") or (http.user_agent contains "YouBot") or (http.user_agent contains "omgili") or (http.user_agent contains "ImagesiftBot")` | Block |
| Clients génériques | `(http.user_agent contains "python-requests") or (http.user_agent contains "curl/") or (http.user_agent contains "Wget") or (http.user_agent contains "Scrapy") or (http.user_agent contains "HeadlessChrome") or (http.user_agent contains "Go-http-client") or (http.user_agent contains "axios") or (http.user_agent contains "node-fetch") or (http.user_agent eq "")` | Block |
| Réseaux cloud / IA | `(ip.geoip.asnum in {16509 14618 8987 15169 396982 8075 16276 24940 14061 20473 63949 45102 212238 51167 60781}) and not cf.client.bot` | Managed Challenge |
| Proxys, VPN, Tor | `(cf.threat_score gt 10) or (ip.geoip.country eq "T1")` | Managed Challenge |
| Score de robot | `(cf.bot_management.score lt 30) and not cf.client.bot` *(Pro)* | Managed Challenge |
| Pages protégées | `(http.request.uri.path in {"/mentions-legales.html" "/contact.html"}) and not (http.request.headers["accept"][0] contains "text/html")` | Block |

*Security* › *WAF* › **Rate limiting rules** (T-09) : `http.request.uri.path` ne se termine pas par
`css|js|png|jpg|svg|woff2|mp4` → 30 requêtes / 60 s par IP → *Managed Challenge* ; seconde règle 300 / 1 h → *Block*
pendant 1 h. Ajuster après une semaine de mesure (*Security* › *Events*).

## 4. Worker (T-13, T-15 et doublure des règles)

```bash
npm i -g wrangler && wrangler login
wrangler kv namespace create BANS            # reporter l'id dans wrangler.toml
cd cloudflare && wrangler deploy
```

Le Worker (`worker.js`) ajoute `TDM-Reservation: 1`, `X-Robots-Tag: noai, noimageai`, supprime `Server` et les
en-têtes GitHub / Fastly, bannit 30 jours toute IP qui visite `/piege/`, double les blocages par user-agent et la
limitation de débit (compteurs KV), et refuse les pages protégées aux clients qui ne se présentent pas comme un
navigateur. Il tourne même si une règle WAF est désactivée par erreur.

## 5. Turnstile (T-16, T-19) — recommandé

*Turnstile* › *Add site* › domaine `alixoapp.com`, mode *Managed* ou *Invisible* → copier la **Site Key** et la
coller dans `mentions-legales.html` et `contact.html` :

```html
<script>window.ALIXO_TURNSTILE_SITEKEY = '0x4AAAAAAA…';</script>
```

`defi.js` utilise alors Turnstile avant la preuve de travail. Sans clé, seule la preuve de travail s'applique.

## 6. Supervision (§ 6.1)

- *Security* › *Events* : requêtes bloquées par règle, top user-agents et ASN ; exporter chaque mois dans le
  rapport de supervision (`PROTECTION.md`, § Exploitation).
- *Analytics* › *Security* : part de défis servis à des humains (objectif : moins de 0,5 % des visiteurs).
- *Notifications* : alerte « Advanced DDoS » et « Security Events » (pic d'événements = nouveau robot).
- Mise à jour mensuelle de la liste des user-agents (robots.txt, règle WAF « Robots IA », `worker.js`) depuis
  <https://github.com/ai-robots-txt/ai.robots.txt>.
