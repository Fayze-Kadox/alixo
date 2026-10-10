# Protection du site contre l'aspiration par les IA — rapport d'audit et dossier d'exploitation

Mise en œuvre du *Cahier des charges – Protection du site contre l'aspiration par les IA* (octobre 2026) sur
alixoapp.com (site vitrine, documentation, pages système). Le site est hébergé sur GitHub Pages : la couche page
(ce dépôt) est en place ; la couche réseau (CDN, WAF, en-têtes HTTP) est livrée **prête à déployer** dans
`cloudflare/` et demande que le domaine soit mis derrière Cloudflare (une heure, gratuit). Sans cette couche, les
objectifs chiffrés du § 1.1 sur le contenu éditorial (99,9 % des robots bloqués) ne peuvent pas être tenus : un
site statique ne voit pas les user-agents et ne peut rien refuser.

## 1. Audit des fuites (§ 2) — tableau signé

| Donnée | Où elle apparaissait | Correction | État |
| --- | --- | --- | --- |
| Nom et prénom de l'auteur | nulle part dans le HTML public (vérifié par grep : aucun nom réel, aucune balise `author`, aucun JSON-LD `Person`) ; les notes de version publiées sont nettoyées de tout nom par `scripts/site-releases.js` (dépôt de l'application) | — | ✅ 0 occurrence |
| Identifiant de connexion, pages auteur | pas de CMS, pas de `?author=`, pas d'API utilisateurs | — | ✅ sans objet |
| Adresse postale | `mentions-legales.html` (champ à compléter) | retirée du HTML ; livrée chiffrée (`mentions-data.js`) et affichée après défi (`defi.js`) | ✅ |
| E-mail | `mailto:contact@alixoapp.com` dans 5 pages (mentions, confidentialité, CGV, conditions, maintenance) | tous remplacés par un lien vers `/contact.html`, qui révèle l'adresse après défi et construit le lien d'écriture côté client | ✅ 0 `mailto:` |
| Téléphone | mentions légales (à compléter) | même traitement que l'adresse | ✅ 0 `tel:` |
| SIREN, TVA, directeur de la publication | mentions légales | même traitement | ✅ |
| Photos, avatars | aucune photo de personne ; pas de Gravatar | — | ✅ |
| Métadonnées des fichiers | 26 vignettes `videos/*.jpg` portaient un champ `comment` d'encodeur ; aucune EXIF/GPS | nettoyées (`tools/strip-metadata.py`), à relancer avant chaque ajout d'image | ✅ |
| Données techniques | en-têtes `Server: GitHub.com`, `X-GitHub-Request-Id` ; WHOIS du domaine | retirés par le Worker Cloudflare (`cloudflare/worker.js`) ; WHOIS : activer la protection chez le registrar (hors dépôt) | ⚠️ après déploiement Cloudflare |
| Commentaires | aucun | — | ✅ sans objet |
| Historique (Wayback Machine, caches) | les anciennes versions des mentions légales ne contenaient que des champs vides `[à compléter]` | demande de retrait à Internet Archive non nécessaire ; à faire si des données réelles avaient été publiées | ✅ |
| Dépôt Git public | le dépôt `ultra-project/alixo` (ce site) est public ; `tools/mentions.json` (données en clair) est dans `.gitignore` et ne doit **jamais** être commité | ✅ |

## 2. Cadre légal (§ 3) — choix retenus (à faire valider par un juriste)

- Alixo+ étant vendu, l'éditeur est **professionnel** : dénomination, adresse, SIREN, contact et directeur de la
  publication doivent rester **accessibles aux humains**. Ils le sont : page Mentions légales, bouton « Afficher
  l'identité de l'éditeur », texte normal (accessible aux lecteurs d'écran, RGAA) après une vérification sans
  cookie. Conseil du cahier des charges : une société de domiciliation ou une boîte postale professionnelle
  plutôt qu'une adresse personnelle ; un e-mail générique (`contact@alixoapp.com`, désormais servi par Alixo Mail).
- Réserve de fouille de textes et de données (TDM, art. L. 122-5-3 CPI) : déclarée par `<meta name="tdm-reservation">`
  sur toutes les pages, `/.well-known/tdmrep.json`, l'en-tête `TDM-Reservation: 1` (Worker) et à inscrire dans les
  conditions d'utilisation (§ « Fouille de textes et de données » à ajouter à `conditions.html`, ancre `#tdm`).
- Les auteurs n'ont aucune obligation de publier leur nom : le site n'en publie aucun.

## 3. Exigences fonctionnelles de minimisation (§ 4)

| ID | Exigence | Réalisation |
| --- | --- | --- |
| F-01 | pseudonymes | aucun nom d'auteur publié (« Alixo » signe tout) |
| F-02 | pages auteur en 404 | sans objet (pas de CMS) |
| F-03 | données structurées sans donnée personnelle | Open Graph du site : titre, description, image ; aucun `author` |
| F-04 | contact sans e-mail affiché | `contact.html` : adresse révélée après défi, lien construit au clic ; 0 `mailto:` / `tel:` |
| F-05 | adresse postale hors des pages | uniquement dans le flux chiffré des mentions légales |
| F-06 | fichiers nettoyés | `tools/strip-metadata.py` (images) ; PDF : `exiftool -all=` avant publication |
| F-07 | pas de Gravatar | sans objet |
| F-08 | flux et sitemap | pas de flux RSS ; `sitemap.xml` sans mentions légales, contact, piège ni application |
| F-09 | code source sans donnée personnelle | vérifié ; `tools/mentions.json` ignoré par Git |
| F-10 | e-mails sortants | e-mails Firebase (vérification d'adresse, mot de passe) signés « Alixo », expéditeur `noreply@alixo-b9f58.firebaseapp.com` : à personnaliser dans la console Firebase sans nom de personne |

## 4. Exigences techniques (§ 5)

| ID | Réalisation | Couche |
| --- | --- | --- |
| T-01 | `robots.txt` : 70 user-agents IA interdits (liste ai-robots-txt, 10 oct. 2026) ; moteurs classiques autorisés (option A) | page ✅ |
| T-02 | `meta tdm-reservation` sur 14 pages, `/.well-known/tdmrep.json`, en-tête `TDM-Reservation` (Worker) | page ✅ / réseau ⚠️ |
| T-03 | `meta robots noai, noimageai` partout ; `X-Robots-Tag` (Worker) | page ✅ / réseau ⚠️ |
| T-04 | option A retenue (Google / Bing autorisés) ; mentions légales et contact en `noindex, nofollow` et hors sitemap | ✅ |
| T-05 | Cloudflare Bot Fight Mode + « Block AI bots » + AI Labyrinth : procédure `cloudflare/README.md` | ⚠️ à activer |
| T-06 | règle WAF + Worker : 403 pour les user-agents IA et les clients génériques | ⚠️ à déployer |
| T-07 | règle WAF + Worker : défi pour 15 ASN cloud / IA, sauf robots vérifiés | ⚠️ à déployer |
| T-08 | empreintes JA3/JA4 : fonction native de Super Bot Fight Mode | ⚠️ à activer |
| T-09 | règles de limitation 30 / min et 300 / h par IP (WAF) doublées par le Worker (compteurs KV) | ⚠️ à déployer |
| T-10 | défi pour proxys / VPN / Tor (score de menace, pays T1) | ⚠️ à déployer |
| T-11 | doublure serveur : `nginx/alixoapp.conf` (si le site quitte GitHub Pages) | ✅ livré |
| T-12 | origine masquée : impossible de fermer `ultra-project.github.io` sur GitHub Pages ; aucune page n'y renvoie | ⚠️ limite d'hébergement |
| T-13 | `Server`, `X-GitHub-Request-Id`, `Via`, `X-Served-By`… retirés par le Worker | ⚠️ à déployer |
| T-14 | pas de listing (GitHub Pages) ; `.git`, sauvegardes : règles Nginx livrées | ✅ |
| T-15 | pot de miel : lien invisible (`protection.js`) vers `/piege/`, interdit dans robots.txt ; bannissement 30 jours par le Worker | page ✅ / réseau ⚠️ |
| T-16 | formulaires : pas de formulaire ; contact protégé par défi ; Turnstile branché (`window.ALIXO_TURNSTILE_SITEKEY`) | ✅ |
| T-17 | API : `releases.json` est un fichier statique sans donnée personnelle ; l'API de l'application (Firestore) exige un compte | ✅ |
| T-18 | pas d'identifiants séquentiels ; pas de recherche interne côté serveur | ✅ |
| T-19 | mentions légales après défi, `noindex, nofollow`, hors sitemap | ✅ |
| T-20 | données injectées côté client après le défi (texte accessible, pas d'image) | ✅ |
| T-21 | aucune donnée en clair : AES-256-GCM, clé dérivée de la preuve de travail (`defi.js`, `tools/encode-mentions.js`) | ✅ |
| T-22 | rendu protégé du contenu éditorial : **non retenu** (le site doit rester référencé) | choix |
| T-23 | tatouage : caractères de largeur nulle selon un motif par page (`protection.js`) | ✅ |
| T-24 | zone membre : la documentation reste publique ; le contenu réellement sensible (cours des utilisateurs) est déjà derrière un compte dans l'application | ✅ |

## 5. Recette (§ 6.2)

`node tests/recette-anti-ia.js` rejoue 27 contrôles sur une copie locale (robots, TDM, balises, absence de
`mailto:`/`tel:`/données d'identification sur 13 pages, sitemap, données chiffrées, refus du navigateur
automatisé, pot de miel, affichage après défi, contact, tatouage, EXIF). Contre la production
(`node tests/recette-anti-ia.js https://alixoapp.com`), il ajoute les tests réseau (user-agents IA et clients
génériques → 403, en-tête `TDM-Reservation`, mentions légales refusées sans en-têtes de navigateur). Dernier
passage local : 27 / 27. Captures dans `tests/rapport/`.

Tests manuels à faire après le déploiement Cloudflare : 500 pages en 5 minutes depuis une IP (blocage avant la
60e), requêtes depuis AWS / GCP / OVH (défi), Playwright en mode furtif (défi), navigation humaine sur Chrome,
Firefox, Safari, mobile et lecteur d'écran (moins de 0,5 % de défis).

## 6. Exploitation (§ 7.4)

- **Chaque mois** : mettre à jour la liste des robots IA (robots.txt, règle WAF « Robots IA », `cloudflare/worker.js`)
  depuis <https://github.com/ai-robots-txt/ai.robots.txt> ; lire *Security › Events* (requêtes bloquées par règle,
  top user-agents et ASN, déclenchements du pot de miel = clés `ip:*` valant `honeypot` dans l'espace KV, taux de
  défi chez les humains) ; consigner le rapport.
- **Chaque trimestre** : rechercher le nom réel et l'adresse de l'éditeur sur Google, Bing, la Wayback Machine et
  dans les réponses de ChatGPT, Claude, Gemini et Perplexity ; en cas de fuite, demander le retrait (formulaires
  des moteurs, `info@archive.org`) et changer le sel de `mentions-data.js`.
- **Après chaque mise à jour du site** : `node tests/recette-anti-ia.js https://alixoapp.com`.
- **Mettre à jour les mentions légales** : éditer `tools/mentions.json` (jamais commité), puis
  `node tools/encode-mentions.js tools/mentions.json > mentions-data.js`, commiter `mentions-data.js`.
- Journaux : Cloudflare conserve les événements de sécurité 30 jours (offre gratuite) ; aucune IP n'est stockée
  côté site (RGPD).

## 7. Limites résiduelles acceptées (§ 7.1)

Un humain peut toujours lire puis recopier ; un navigateur réel piloté avec une souris passe le défi (c'est voulu :
les mentions légales doivent rester accessibles) ; la preuve de travail coûte ~0,1 s à un visiteur et devient
dissuasive seulement à l'échelle ; tant que Cloudflare n'est pas devant le site, aucun blocage réseau n'existe et les
en-têtes HTTP ne peuvent pas être posés.

## 8. Réponses aux questions ouvertes (§ 7.5)

| Question | Réponse retenue |
| --- | --- |
| Statut de l'éditeur | professionnel (Alixo+ est vendu) : mentions complètes mais protégées |
| Visible sur Google et Bing ? | oui (option A) |
| Zone membre ? | non pour le site ; l'application est déjà derrière un compte |
| CMS et hébergement | site statique sur mesure, GitHub Pages ; Cloudflare à ajouter devant |
| Budget détection des robots | 0 € (Cloudflare Free : Bot Fight Mode, WAF 5 règles, Workers 100 000 req/jour) ; 20 €/mois (Pro) pour Super Bot Fight Mode et les empreintes |
