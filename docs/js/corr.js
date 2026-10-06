/* ============================================================
   Alixo — moteur de correction (1.22)
   Trois étages, du moins cher au plus cher :
   1. local, instantané, sans Internet : fautes de frappe reconnues à l'espace (liste fermée, mots appris,
      lexique de 24 000 mots : lettres inversées, lettre doublée, accent oublié) ;
   2. mémoire : chaque phrase déjà analysée (même texte, même niveau) ne repart jamais vers l'API ;
   3. modèle de langue : seulement les phrases nouvelles ou modifiées, groupées en une requête compacte
      (consigne courte, réponse JSON minimale, jetons de sortie bornés), au plus une requête toutes les 3 s.
   1.28 : modèle ouvert Qwen3.8-27B (Alibaba, licence Apache 2.0) à la place de Grok (xAI). Le modèle n'est lié à
   aucun fournisseur : Alixo parle à n'importe quel serveur « compatible OpenAI » (POST <endpoint>/chat/completions).
   Préréglages : OpenRouter (hébergé, clé « sk-or-… »), Alibaba Cloud Model Studio (l'éditeur du modèle), Ollama sur
   l'ordinateur de l'utilisateur (sans clé, sans Internet) ou tout autre serveur (vLLM, LM Studio, llama.cpp…).
   Chargé avant app.js (ne dépend que de window.ALIXO_LEXIQUE, js/lexique.js). app.js fournit l'accès aux
   blocs et à l'écran via AlixoCorr.init({...}) et branche les événements de frappe.
   ============================================================ */
'use strict';

window.AlixoCorr = (() => {
  /* ---------------- réglages ---------------- */
  const DEFAULT_MODEL = 'Qwen3.8-27B';      // nom affiché ; l'identifiant exact dépend du serveur (voir PROVIDERS)
  /* préréglages de serveurs compatibles OpenAI servant Qwen3.8-27B. `endpoint` : base de l'API (sans /chat/completions).
     `needsKey` : faux pour un serveur local. `keysUrl` / `keyPrefix` : parcours guidé. `remote` : vrai si le texte quitte
     l'ordinateur (information de confidentialité). */
  const PROVIDERS = {
    openrouter: { label: 'OpenRouter (hébergé, recommandé)', endpoint: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3.8-27b', keysUrl: 'https://openrouter.ai/keys', keyPrefix: 'sk-or-', needsKey: true, remote: true,
      hint: 'Compte sur openrouter.ai, quelques centimes pour un cours entier ; l’hébergeur du modèle est choisi par OpenRouter (politique de données réglable dans son compte).' },
    alibaba: { label: 'Alibaba Cloud Model Studio (éditeur de Qwen)', endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-27b', keysUrl: 'https://modelstudio.console.alibabacloud.com/', keyPrefix: 'sk-', needsKey: true, remote: true,
      hint: 'Clé API créée dans la console Model Studio (région Singapour, point d’accès « compatible-mode »).' },
    ollama: { label: 'Ollama — sur cet ordinateur (gratuit, hors ligne)', endpoint: 'http://localhost:11434/v1', model: 'qwen3.8:27b', keysUrl: 'https://ollama.com/download', keyPrefix: '', needsKey: false, remote: false,
      hint: 'Installer Ollama puis, dans un terminal : ollama pull qwen3.8:27b (≈ 17 Go, carte graphique ou Mac avec 24 Go de mémoire conseillés). Rien ne quitte l’ordinateur.' },
    custom: { label: 'Autre serveur compatible OpenAI', endpoint: '', model: 'qwen3.8-27b', keysUrl: '', keyPrefix: '', needsKey: false, remote: true,
      hint: 'vLLM, SGLang, LM Studio, llama.cpp, un serveur de votre établissement… Indiquez la base de l’API (…/v1) et l’identifiant du modèle tel que le serveur le connaît.' }
  };
  const DEFAULT_PROVIDER = 'openrouter';
  const CONFIG_LS = 'alixo.ai.config';     // { provider, endpoint, model, key } — reste sur l'appareil
  const MIN_GAP = 3000;            // ms entre deux requêtes « en direct » (facturation à l'usage : on limite le nombre d'appels)
  const PAUSE_MS = 2500;           // pause de frappe avant d'envoyer les phrases en cours
  const SENTENCE_MS = 700;         // délai après une fin de phrase (. ! ? Entrée)
  const LEAVE_MS = 250;            // délai après la sortie d'un bloc
  const MAX_BATCH_LIVE = 2400;     // caractères par requête (frappe)
  const MAX_BATCH_FULL = 7000;     // caractères par requête (F7)
  const MIN_WORDS = 3;             // une phrase plus courte n'est pas envoyée
  const CACHE_MAX = 4000;          // phrases mémorisées
  const LS = { learned: 'alixo.corr.learned', ignored: 'alixo.corr.ignored', cache: 'alixo.corr.cache', stats: 'alixo.corr.stats' };

  /* ---------------- fautes de frappe : liste fermée (1.21) ---------------- */
  const TYPO_FIXES = {
    qaund: 'quand', qunad: 'quand', quadn: 'quand', aevc: 'avec', avce: 'avec', dnas: 'dans', dasn: 'dans', pusi: 'puis', mias: 'mais', tuot: 'tout', tuos: 'tous',
    poru: 'pour', puor: 'pour', ausis: 'aussi', ausi: 'aussi', parceque: 'parce que', paceque: 'parce que', ocmme: 'comme', cmome: 'comme', comem: 'comme', dnoc: 'donc', alros: 'alors', enocre: 'encore',
    jsute: 'juste', jutse: 'juste', tojuours: 'toujours', toujour: 'toujours', toujorus: 'toujours', jamias: 'jamais', jamis: 'jamais', beaucuop: 'beaucoup', beacoup: 'beaucoup', beaucop: 'beaucoup',
    plusieur: 'plusieurs', pluseurs: 'plusieurs', plusiuers: 'plusieurs', certian: 'certain', poitn: 'point', ponit: 'point', temsp: 'temps', tmeps: 'temps', tepms: 'temps', momnet: 'moment',
    qustion: 'question', quesiton: 'question', questoin: 'question', raisn: 'raison', noatmment: 'notamment', notament: 'notamment', notemment: 'notamment', effectivment: 'effectivement', effectivemnt: 'effectivement',
    seulemnt: 'seulement', seulment: 'seulement', egalemnt: 'également', egalement: 'également', finalemnt: 'finalement', finalment: 'finalement', generalement: 'généralement', vraimen: 'vraiment', vraimnet: 'vraiment', vraiement: 'vraiment',
    nombruex: 'nombreux', nouvaeu: 'nouveau', nouvau: 'nouveau', nouvelel: 'nouvelle', premeir: 'premier', premeire: 'première', premiere: 'première', derniere: 'dernière', denrier: 'dernier',
    possibel: 'possible', posible: 'possible', imposible: 'impossible', improtant: 'important', importnat: 'important', importan: 'important', necesaire: 'nécessaire', necessaire: 'nécessaire', obligatoir: 'obligatoire', suivnat: 'suivant',
    defintion: 'définition', definiton: 'définition', 'défintion': 'définition', 'définiton': 'définition', contart: 'contrat', cotnrat: 'contrat', tribunla: 'tribunal', jurisprudnece: 'jurisprudence', juriprudence: 'jurisprudence',
    consitution: 'constitution', constituion: 'constitution', 'responsabilté': 'responsabilité', responsabilite: 'responsabilité', economie: 'économie', economique: 'économique', augmentaiton: 'augmentation', augmenation: 'augmentation',
    diminuiton: 'diminution', inflaton: 'inflation', inflaiton: 'inflation', chomage: 'chômage', cout: 'coût', couts: 'coûts', controle: 'contrôle', etre: 'être', etes: 'êtes', etant: 'étant', etait: 'était', etaient: 'étaient', ete: 'été',
    ecrire: 'écrire', ecriture: 'écriture', ecrit: 'écrit', ecrits: 'écrits', ecole: 'école', eleve: 'élève', eleves: 'élèves', etude: 'étude', etudes: 'études', etudiant: 'étudiant', etudiants: 'étudiants', etudier: 'étudier',
    evidemment: 'évidemment', evenement: 'événement', energie: 'énergie', equilibre: 'équilibre', egalite: 'égalité', egal: 'égal', egale: 'égale', enonce: 'énoncé', etablir: 'établir', etablissement: 'établissement', etape: 'étape', etranger: 'étranger',
    europeen: 'européen', europeenne: 'européenne', generale: 'générale', generaux: 'généraux', gerer: 'gérer', heritage: 'héritage', hopital: 'hôpital', idee: 'idée', idees: 'idées', interieur: 'intérieur', exterieur: 'extérieur',
    memoire: 'mémoire', mere: 'mère', pere: 'père', frere: 'frère', metier: 'métier', methode: 'méthode', modele: 'modèle', ministere: 'ministère', monetaire: 'monétaire', necessite: 'nécessité', possibilite: 'possibilité', prefet: 'préfet',
    prevoir: 'prévoir', prevu: 'prévu', prevue: 'prévue', probleme: 'problème', problemes: 'problèmes', porblème: 'problème', qualite: 'qualité', quantite: 'quantité', realiser: 'réaliser', realite: 'réalité', reflexion: 'réflexion',
    remede: 'remède', repondre: 'répondre', reponse: 'réponse', resoudre: 'résoudre', resultat: 'résultat', reunion: 'réunion', salarie: 'salarié', salaries: 'salariés', sante: 'santé', securite: 'sécurité', societe: 'société', liberte: 'liberté',
    propriete: 'propriété', specifique: 'spécifique', strategie: 'stratégie', succes: 'succès', superieur: 'supérieur', symptome: 'symptôme', systeme: 'système', theorie: 'théorie', theoreme: 'théorème', universite: 'université',
    verite: 'vérité', veritable: 'véritable', vehicule: 'véhicule', tres: 'très', apres: 'après', deja: 'déjà', voila: 'voilà', francais: 'français', francaise: 'française', telephone: 'téléphone', developpement: 'développement',
    developement: 'développement', developpment: 'développement', interet: 'intérêt', regle: 'règle', reglement: 'règlement', periode: 'période', siecle: 'siècle', medecin: 'médecin', medecine: 'médecine', hypothese: 'hypothèse',
    synthese: 'synthèse', numero: 'numéro', bibliotheque: 'bibliothèque', facon: 'façon', lecon: 'leçon', recu: 'reçu', apercu: 'aperçu', garcon: 'garçon', exmeple: 'exemple', exempel: 'exemple', exemlpe: 'exemple', exmple: 'exemple',
    entrepirse: 'entreprise', entrerpise: 'entreprise', gouvernemnet: 'gouvernement', gouvernment: 'gouvernement', coment: 'comment', commetn: 'comment', pourquio: 'pourquoi', pourqoi: 'pourquoi', pourquoit: 'pourquoi',
    perosnne: 'personne', persone: 'personne', pesonne: 'personne', enfnat: 'enfant', pouvior: 'pouvoir', droti: 'droit', dorit: 'droit', pensse: 'pense', cest: 'c’est', jai: 'j’ai'
  };

  /* ---------------- stockage local ---------------- */
  const loadJSON = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? def : v; } catch { return def; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein ou indisponible */ } };
  let learned = loadJSON(LS.learned, {});               // mot fautif → correction (apprises de l'IA ou de l'utilisateur)
  let ignored = new Set(loadJSON(LS.ignored, []));      // mots que l'utilisateur a voulu garder
  let cache = loadJSON(LS.cache, {});                   // clé de phrase → { f: [[avant, apres, type, regle]…], t }
  const stats = Object.assign({ req: 0, sent: 0, cached: 0, local: 0, auto: 0, chars: 0, since: Date.now() }, loadJSON(LS.stats, {}));
  let saveTm = null;
  function persist() { clearTimeout(saveTm); saveTm = setTimeout(() => { saveJSON(LS.learned, learned); saveJSON(LS.ignored, [...ignored]); saveJSON(LS.cache, cache); saveJSON(LS.stats, stats); }, 1500); }

  /* ---------------- lexique ---------------- */
  const LEX = new Map();        // mot → rang (0 = le plus fréquent)
  const BY_SKEL = new Map();    // squelette sans accent → mots accentués
  const strip = w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  (function loadLex() {
    const src = window.ALIXO_LEXIQUE || '';
    let i = 0;
    for (const w of src.split(' ')) {
      if (!w) continue;
      LEX.set(w, i++);
      const s = strip(w);
      if (s !== w) { let a = BY_SKEL.get(s); if (!a) BY_SKEL.set(s, a = []); a.push(w); }
    }
    for (const k of Object.keys(TYPO_FIXES)) LEX.delete(k);   // « etre », « tres »… ne sont pas des mots
  })();
  const known = w => LEX.has(w.toLowerCase());

  /* ---------------- étage 1 : correction locale d'un mot ---------------- */
  const cap = w => w ? w[0].toUpperCase() + w.slice(1) : w;
  const caseLike = (word, fix) => (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase() ? cap(fix) : fix);
  /* « terminé » proposé pour « termine », « invités » pour « invites » : la forme sans accent est un présent valable */
  function participleTrap(cand, word) {
    if (!/é(e|s|es)?$/.test(cand)) return false;
    const diffs = [];
    for (let i = 0; i < cand.length; i++) if (i >= word.length || strip(cand[i]) !== word[i]) diffs.push(i);
    return diffs.every(i => i >= cand.length - 3);
  }
  /* mot tel que tapé (3 lettres ou plus) → { to, src } ou null. src : liste | appris | accent | frappe */
  function localFix(word) {
    if (!word || word.length < 3) return null;
    const k = word.toLowerCase();
    if (ignored.has(k)) return null;
    if (word !== k && word !== cap(k)) return null;                 // sigle, CamelCase : jamais
    if (TYPO_FIXES[k]) return { to: caseLike(word, TYPO_FIXES[k]), src: 'liste' };
    if (learned[k]) return { to: caseLike(word, learned[k]), src: 'appris' };
    if (!LEX.size || LEX.has(k)) return null;                        // mot connu : rien à faire
    if (/[^a-zàâäçéèêëîïôöûùüÿœæ]/.test(k)) return null;
    // accent oublié : un seul mot du lexique a ce squelette (« ecole » → « école », mais « cote » reste « cote »)
    if (strip(k) === k) {
      const c = (BY_SKEL.get(k) || []).filter(x => !participleTrap(x, k));
      if (c.length === 1) return { to: caseLike(word, c[0]), src: 'accent' };
      if (c.length) return null;
    }
    if (k.length < 5) return null;                                   // mots courts : trop de voisins
    const cands = new Set();
    for (let i = 0; i < k.length - 1; i++) {
      if (k[i] === k[i + 1]) { const t = k.slice(0, i) + k.slice(i + 1); if (LEX.has(t)) cands.add(t); continue; }   // lettre doublée
      const t = k.slice(0, i) + k[i + 1] + k[i] + k.slice(i + 2); if (LEX.has(t)) cands.add(t);                      // lettres inversées
    }
    if (cands.size === 1) return { to: caseLike(word, [...cands][0]), src: 'frappe' };
    return null;
  }
  function learn(from, to) {
    const a = String(from || '').trim().toLowerCase(), b = String(to || '').trim();
    if (!a || !b || a === b.toLowerCase() || /\s/.test(a) || /\s/.test(b) || a.length < 3) return;
    if (ignored.has(a) || LEX.has(a)) return;
    learned[a] = b[0].toLowerCase() + b.slice(1);   // en minuscule initiale : la casse du mot tapé est reprise à l'application
    const keys = Object.keys(learned); if (keys.length > 2000) for (const k of keys.slice(0, 500)) delete learned[k];
    persist();
  }
  function ignore(word) { const k = String(word || '').trim().toLowerCase(); if (!k) return; ignored.add(k); delete learned[k]; persist(); }
  const isIgnored = word => ignored.has(String(word || '').toLowerCase());
  function forget() { learned = {}; ignored = new Set(); persist(); }

  /* ---------------- phrases ---------------- */
  /* découpe en phrases : fin sur . ! ? … suivi d'un blanc puis d'une majuscule, d'un guillemet ou d'un retour à la ligne
     (« art. 1240 », « C. civ. » ne coupent pas) ; renvoie [{ s, e, text }] (offsets dans le texte brut) */
  function sentences(text) {
    const out = []; const t = String(text || '');
    let s = 0;
    const re = /[.!?…]+["»”')\]]*(?=\s+(?:[A-ZÀ-ÝŒ«"“(\[]|[-–—•])|\s*\n|\s*$)|\n+/g;
    let m;
    while ((m = re.exec(t))) {
      const e = m.index + (m[0].trim() ? m[0].length : 0);
      push(s, m[0].trim() ? e : m.index);
      s = m.index + m[0].length;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    push(s, t.length);
    function push(a, b) {
      let txt = t.slice(a, b);
      const lead = txt.length - txt.replace(/^\s+/, '').length;
      txt = txt.trim(); if (!txt) return;
      out.push({ s: a + lead, e: a + lead + txt.length, text: txt });
    }
    return out;
  }
  const words = s => String(s || '').split(/[^A-Za-zÀ-ÿœŒ'’-]+/).filter(w => w.length > 1);
  /* une phrase vaut-elle une analyse ? (assez de mots, pas un sigle / une référence / une formule) */
  function worth(text) {
    const w = words(text);
    if (w.length < MIN_WORDS) return false;
    const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (letters < text.length * 0.5) return false;                   // chiffres, symboles, références
    if (text === text.toUpperCase()) return false;                   // tout en capitales : sigle, titre
    return true;
  }
  const norm = s => String(s || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
  const keyOf = (text, ctx) => hash(`${ctx.level || 'standard'}|${ctx.lang || 'fr'}|${ctx.strict ? 's' : ''}|${norm(text)}`);

  /* ---------------- mémoire des phrases ---------------- */
  function cacheGet(key) { const c = cache[key]; if (!c) return undefined; c.t = Date.now(); return c.f; }
  function cacheSet(key, fixes) {
    cache[key] = { f: fixes, t: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) { keys.sort((a, b) => cache[a].t - cache[b].t); for (const k of keys.slice(0, 1000)) delete cache[k]; }
    persist();
  }
  function clearCache() { cache = {}; persist(); }

  /* ---------------- consignes ---------------- */
  const CHECK_SHORT = `Fautes à relever : orthographe et accents ; homophones (a/à, et/est, on/ont, ce/se, ces/ses/c'est/s'est, leur/leurs, sa/ça, peu/peut, tout/tous, quand/quant) ; terminaisons -é/-er/-ez/-ai/-ais et accord du participe passé ; accord sujet-verbe, adjectif, déterminant, pluriels ; conjugaison et modes (subjonctif après « il faut que », « bien que ») ; négation incomplète, mot doublé, mot manquant ou en trop.`;
  const CHECK_FULL = `Relis mot par mot, catégorie par catégorie, et relève TOUTES les fautes (plusieurs dans la même phrase comprises) :
1. accents et orthographe lexicale (é/è/ê, ç, a/à, ou/où, la/là, du/dû, sur/sûr, lettres doublées ou manquantes) ;
2. homophones grammaticaux (a/à, et/est, on/ont, son/sont, ce/se, ces/ses/c'est/s'est, leur/leurs, quel(le)(s)/qu'elle(s), sa/ça, ni/n'y, si/s'y, peu/peut, tout/tous/toute(s), quelque/quel que, quand/quant/qu'en, davantage/d'avantage, près/prêt, voir/voire) ;
3. terminaisons -é / -er / -ez / -ai / -ais / -ait et accord du participe passé (avec être ; avec avoir si le COD précède) ;
4. accord sujet-verbe (sujet inversé, éloigné, collectif, pronom « qui »), accord de l'adjectif, du déterminant et du nom, pluriels irréguliers, noms composés ;
5. conjugaison : temps et modes (subjonctif après « il faut que », « bien que », « avant que »), concordance des temps ;
6. syntaxe : négation complète, pronoms relatifs, prépositions, mot doublé, mot manquant ou en trop, anglicismes flagrants ;
7. majuscules, apostrophes, traits d'union, ponctuation et typographie française (selon le niveau).`;
  const NEVER = `Ne touche jamais : abréviations juridiques ou médicales usuelles (art., C. civ., Cass., al., n°, CE, CC, BPCO, SCA, IV, mg/kg…), sigles, noms propres, noms de molécules, mots latins, mots ou citations dans une autre langue (jamais traduits ni « corrigés »), formules, nombres, notes télégraphiques volontaires (absence d'article, majuscule manquante, phrase inachevée sans ponctuation).`;
  const LANG_NAMES = { fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand', it: 'italien', pt: 'portugais' };
  function levelLines(ctx) {
    let t = '';
    if (ctx.level === 'leger') t += '\nNiveau léger : seulement les fautes indiscutables (orthographe, accords, conjugaison) ; ignore ponctuation, typographie et majuscules.';
    else if (ctx.level === 'strict') t += '\nNiveau strict : relève aussi la ponctuation, la typographie française (espaces insécables avant ; : ? !, guillemets « »), les majuscules, les répétitions maladroites, les anglicismes et les tournures lourdes, toujours avec une correction minimale.';
    else t += '\nNiveau standard : fautes, grammaire, ponctuation et typographie française courantes.';
    if (ctx.rephrase) t += '\nReformulations : avec parcimonie (au plus une par paragraphe), propose une reformulation plus claire d\'une phrase lourde, sens inchangé, type "r", règle commençant par « Reformulation : ».';
    return t;
  }
  function langLine(lang) {
    if (lang && lang !== 'fr' && LANG_NAMES[lang]) return `\nLangue : ${LANG_NAMES[lang]}. Corrige dans cette langue uniquement, ne traduis rien, ne francise rien.`;
    return '';
  }
  const STYLE_TYPES = `"definition" (notion suivie de sa définition ; "terme" = la notion, telle qu'écrite au début), "arret" (arrêt ou décision de jurisprudence), "exemple" (exemple, cas pratique), "retenir" (règle essentielle, point clé), "controverse" (débat doctrinal), "bilan" (synthèse, récapitulatif), "drapeau" (santé : signes de gravité), "reflexe" (santé : réflexe clinique, piège), "mnemo" (moyen mnémotechnique), "h1"/"h2"/"h3"/"h4" (titre de plan, du plus général au plus fin), "li" (élément d'énumération), "quote" (citation textuelle)`;
  function systemPrompt(mode, ctx, withStyle) {
    const live = mode === 'live';
    let p = `Tu corriges des notes de cours en français (droit, économie, commerce, médecine et santé, STAPS, sciences humaines). Entrée : des phrases numérotées${live ? ', parfois encore en cours de rédaction (ponctuation finale absente, phrase inachevée : ce n\'est pas une faute)' : ''}.
${live ? CHECK_SHORT : CHECK_FULL}
Correction minimale : le mot ou le groupe fautif, rien de plus ; jamais de reformulation, de changement de sens, de style ou de vocabulaire. ${NEVER}${levelLines(ctx)}${langLine(ctx.lang)}
Réponse : uniquement du JSON, sans commentaire : {"c":{"<numéro>":[["avant","apres","type","règle"],…]}} pour les phrases fautives seulement.
- "avant" : extrait EXACT copié tel quel (majuscules, apostrophes, accents), le plus court possible mais unique dans sa phrase ; "apres" : le même extrait corrigé.
- "type" : "f" = faute de frappe évidente d'UN seul mot (lettres inversées, lettre manquante ou doublée, accent oublié) dont la correction ne fait aucun doute ; "o" = orthographe ; "g" = grammaire ou accord ; "t" = typographie / ponctuation${ctx.rephrase ? ' ; "r" = reformulation' : ''}.
- "règle" : une courte phrase pédagogique (12 mots au plus).
Aucune faute : {"c":{}}.`;
    if (withStyle) p += `
Mise en forme : les lignes « § <lettre> : <numéros> » désignent des paragraphes entiers. Si l'un d'eux relève CLAIREMENT d'un type, ajoute "m":{"<lettre>":{"t":"<type>","terme":"<notion définie, pour definition seulement>","raison":"<quelques mots>"}}, avec type parmi ${STYLE_TYPES}. Rien pour un paragraphe ordinaire : mieux vaut aucune proposition qu'une proposition douteuse.`;
    return p;
  }

  /* ---------------- configuration du serveur (1.28) ----------------
     { provider, endpoint, model, key } : lu dans localStorage (alixo.ai.config), jamais synchronisé.
     `provider` est un préréglage de PROVIDERS ; endpoint et model peuvent être modifiés par l'utilisateur. */
  const normEndpoint = u => String(u || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  function normConfig(c) {
    const o = c && typeof c === 'object' ? c : {};
    const provider = PROVIDERS[o.provider] ? o.provider : DEFAULT_PROVIDER;
    const P = PROVIDERS[provider];
    return { provider, endpoint: normEndpoint(o.endpoint) || P.endpoint, model: String(o.model || '').trim() || P.model, key: String(o.key || '').trim() };
  }
  function getConfig() { return normConfig(loadJSON(CONFIG_LS, null)); }
  function setConfig(c) { if (!c) { try { localStorage.removeItem(CONFIG_LS); } catch { } return; } saveJSON(CONFIG_LS, normConfig(c)); }
  /* prêt = un serveur joignable est configuré : clé présente, ou serveur qui n'en demande pas (local) */
  function configured(c) { c = c || getConfig(); return !!(c.endpoint && c.model && (c.key || !PROVIDERS[c.provider].needsKey)); }
  const isLocalUrl = u => { try { const h = new URL(u).hostname; return /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || /\.local$/.test(h); } catch { return false; } };

  /* ---------------- appel du modèle ----------------
     API compatible OpenAI : POST <endpoint>/chat/completions, en-tête Authorization: Bearer <clé> (si clé), réponse
     JSON forcée (response_format json_object). Qwen3.8 « réfléchit » par défaut : on le désactive sous les trois formes
     connues (chat_template_kwargs.enable_thinking pour vLLM / SGLang / llama.cpp, enable_thinking pour Model Studio et
     Ollama, reasoning.enabled pour OpenRouter) ; si un serveur strict refuse un paramètre inconnu, on le retire et on
     recommence (mémorisé par serveur). Un éventuel bloc <think>…</think> resté dans la réponse est ignoré.
     Version PC : un serveur local (Ollama…) est joint par le processus principal (alixoDesktop.aiFetch), ce qui évite
     la politique CORS du navigateur ; version web : fetch direct (Ollama : OLLAMA_ORIGINS=https://alixoapp.com). */
  const quirks = {};   // endpoint → { noThink: bool (ne plus envoyer les paramètres anti-réflexion), noFormat: bool }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const errText = j => {
    if (!j) return '';
    if (typeof j.error === 'string') return j.error;
    if (j.error && typeof j.error.message === 'string') return j.error.message;
    if (typeof j.message === 'string') return j.message;
    if (typeof j.detail === 'string') return j.detail;
    return '';
  };
  const stripThink = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*<think>[\s\S]*$/i, '').trim();
  async function post(url, body, key, timeoutMs) {
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = 'Bearer ' + key;
    if (/openrouter\.ai/i.test(url)) { headers['HTTP-Referer'] = 'https://alixoapp.com'; headers['X-Title'] = 'Alixo'; }
    const desk = window.alixoDesktop;
    if (desk && desk.aiFetch && isLocalUrl(url)) {
      const r = await desk.aiFetch({ url, method: 'POST', headers, body: JSON.stringify(body), timeoutMs });
      if (!r || r.error) { const e = new Error(r && r.error || 'fetch'); e.name = r && r.timeout ? 'AbortError' : 'TypeError'; throw e; }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(r.body) };
    }
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fetch(url, { method: 'POST', signal: ctl.signal, headers, body: JSON.stringify(body) }); }
    finally { clearTimeout(tm); }
  }
  /* cfg : { endpoint, model, key } (ou null → configuration enregistrée). `models` (ancien paramètre) est ignoré. */
  async function call(cfg, { system, user, maxTokens, timeoutMs = 25000, temperature = 0 }) {
    const c = cfg && typeof cfg === 'object' ? normConfig(cfg) : getConfig();
    if (!configured(c)) return { ok: false, status: 0, error: 'Aucun serveur d’IA configuré (Paramètres › Correction par IA).' };
    const url = c.endpoint + '/chat/completions';
    const q = quirks[c.endpoint] || (quirks[c.endpoint] = {});
    const where = PROVIDERS[c.provider].needsKey ? PROVIDERS[c.provider].label.replace(/ \(.*$/, '') : (isLocalUrl(c.endpoint) ? 'le serveur local' : 'le serveur');
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(1500 * attempt);
      const body = { model: c.model, temperature, max_tokens: maxTokens, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
      if (!q.noFormat) body.response_format = { type: 'json_object' };
      if (!q.noThink) { body.chat_template_kwargs = { enable_thinking: false }; body.enable_thinking = false; body.reasoning = { enabled: false }; }
      let res;
      try { res = await post(url, body, c.key, timeoutMs); }
      catch (err) {
        if (err && err.name === 'AbortError') { last = { ok: false, status: 0, error: 'Le modèle ne répond pas (délai dépassé) — réessayez dans un instant.' }; continue; }
        return { ok: false, status: 0, error: isLocalUrl(c.endpoint) ? `Impossible de joindre ${c.endpoint} — le serveur local (Ollama…) est-il lancé ?` : `Impossible de joindre ${where} — vérifiez la connexion internet et l’adresse du serveur.` };
      }
      let j = null; try { j = await res.json(); } catch { j = null; }
      if (res.ok) {
        const choice = j && Array.isArray(j.choices) && j.choices[0];
        const msg = choice && choice.message;
        const raw = msg ? (typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map(p => (p && p.text) || '').join('') : '') : '';
        const content = stripThink(raw);
        if (!msg || (!content && choice.finish_reason !== 'stop')) {
          const why = (choice && choice.finish_reason) || '';
          return { ok: false, status: res.status, error: 'Le modèle n’a pas renvoyé de réponse' + (why === 'length' ? ' (réponse tronquée : la « réflexion » du modèle a consommé les jetons ; vérifiez que la réflexion est désactivée sur le serveur)' : why ? ` (${why})` : '') + '.' };
        }
        const usage = j.usage || {};
        return { ok: true, text: content, model: c.model, tokIn: usage.prompt_tokens || 0, tokOut: usage.completion_tokens || 0 };
      }
      const detail = errText(j);
      if (res.status === 400 && !q.noThink && /enable_thinking|chat_template_kwargs|reasoning|unknown|unrecognized|unexpected|extra|not permitted|additional propert/i.test(detail)) { q.noThink = true; continue; }
      if (res.status === 400 && !q.noFormat && /response_format|json_object|json mode|structured/i.test(detail)) { q.noFormat = true; continue; }
      if (res.status === 404 || /not found|does not exist|not supported|unknown model|no such model|try pulling/i.test(detail)) return { ok: false, status: 404, error: `Modèle « ${c.model} » introuvable sur ${where}${c.provider === 'ollama' ? ' — dans un terminal : ollama pull ' + c.model : ''}.` };
      if (res.status === 401 || (res.status === 400 && /api key|authentication/i.test(detail))) return { ok: false, status: 401, error: `Clé refusée par ${where} : elle est incomplète, révoquée ou mal copiée.` };
      if (res.status === 402) return { ok: false, status: 402, error: `Crédit épuisé sur ${where} — rechargez le compte qui a créé la clé.` };
      if (res.status === 403) return { ok: false, status: 403, error: 'Clé reconnue mais sans accès (' + (detail || 'HTTP 403') + '). Vérifiez les droits de la clé et le crédit du compte.' };
      if (res.status === 503 || res.status === 502 || res.status === 500 || res.status === 429 || /overloaded|capacity|rate limit|too many/i.test(detail)) {
        last = { ok: false, status: res.status, error: res.status === 429 ? 'Limite de requêtes atteinte pour l’instant (ou crédit épuisé) — réessayez dans une minute.' : `Le serveur est saturé pour l’instant (${res.status}) — réessayez dans un instant.` };
        continue;
      }
      return { ok: false, status: res.status, error: `Erreur ${res.status} de ${where}${detail ? ' : ' + detail : ''}.` };
    }
    return last || { ok: false, status: 0, error: 'Le modèle est indisponible pour l’instant.' };
  }
  /* liste des modèles du serveur (GET <endpoint>/models) — pour tester une clé ou vérifier qu'un modèle est installé */
  async function listModels(cfg, timeoutMs = 12000) {
    const c = normConfig(cfg || getConfig());
    const url = c.endpoint + '/models';
    const headers = {}; if (c.key) headers.Authorization = 'Bearer ' + c.key;
    const desk = window.alixoDesktop;
    let status, j;
    try {
      if (desk && desk.aiFetch && isLocalUrl(url)) { const r = await desk.aiFetch({ url, method: 'GET', headers, timeoutMs }); if (!r || r.error) return { ok: false, error: r && r.error || 'fetch' }; status = r.status; try { j = JSON.parse(r.body); } catch { j = null; } }
      else { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs); const res = await fetch(url, { headers, signal: ctl.signal }).finally(() => clearTimeout(tm)); status = res.status; try { j = await res.json(); } catch { j = null; } }
    } catch (e) { return { ok: false, error: e && e.name === 'AbortError' ? 'délai dépassé' : 'serveur injoignable' }; }
    if (status < 200 || status >= 300) return { ok: false, status, error: errText(j) || ('HTTP ' + status) };
    const arr = j && (Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : []);
    return { ok: true, models: arr.map(m => (m && (m.id || m.name || m.model)) || '').filter(Boolean) };
  }
  const parseJson = text => { const m = (text || '').match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
  const KINDS = { f: 'frappe', o: 'orthographe', g: 'grammaire', t: 'typographie', r: 'reformulation' };

  /* retrouve un extrait dans un texte (apostrophes droites / typographiques, espaces insécables) ; null sinon */
  function locate(text, avant) {
    if (!avant) return null;
    const t = String(avant).trim(); if (!t) return null;
    for (const c of [avant, t, t.replace(/'/g, '’'), t.replace(/’/g, "'")]) if (c && text.includes(c)) return c;
    const soft = x => x.replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
    const st = soft(text); let sa = soft(t);
    let i = st.indexOf(sa);
    if (i < 0) { sa = sa.replace(/'/g, '’'); i = st.indexOf(sa); }
    if (i < 0) { sa = sa.replace(/’/g, "'"); i = st.indexOf(sa); }
    if (i < 0) return null;
    const orig = text.slice(i, i + sa.length);
    return soft(orig) === sa ? orig : null;
  }
  function align(avant, apres) {
    if (avant.includes('’') && !avant.includes("'")) return apres.replace(/'/g, '’');
    if (avant.includes("'") && !avant.includes('’')) return apres.replace(/’/g, "'");
    return apres;
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  /* une correction est une « faute de frappe sûre » : un seul mot, à peine changé, et le modèle l'a classée ainsi */
  function sureTypo(f) {
    if (!f || f.kind !== 'frappe') return false;
    const a = String(f.avant).trim(), b = String(f.apres).trim();
    if (!a || !b || /\s/.test(a) || /\s/.test(b) || a.length < 3) return false;
    if (a === a.toUpperCase() && /[A-Z]/.test(a)) return false;
    if (a.toLowerCase() === b.toLowerCase()) return false;
    if (ignored.has(a.toLowerCase())) return false;
    return levenshtein(a.toLowerCase(), b.toLowerCase()) <= (a.length >= 8 ? 3 : 2);
  }
  /* normalise la réponse d'une phrase : [[avant, apres, type, regle]…] → fixes localisées dans la phrase */
  function fixesFor(text, raw) {
    const out = []; const seen = new Set();
    for (const x of Array.isArray(raw) ? raw : []) {
      if (!Array.isArray(x) || typeof x[0] !== 'string' || typeof x[1] !== 'string') continue;
      const avant = locate(text, x[0]); if (!avant) continue;
      const apres = align(avant, x[1]); if (!apres || apres === avant || seen.has(avant)) continue;
      seen.add(avant);
      const kind = KINDS[String(x[2] || '').toLowerCase()] || 'orthographe';
      out.push({ avant, apres, kind, regle: String(x[3] || '').trim(), at: text.indexOf(avant) });
    }
    return out;
  }
  const compact = f => f.map(x => [x.avant, x.apres, Object.keys(KINDS).find(k => KINDS[k] === x.kind) || 'o', x.regle]);

  /* ---------------- une requête : phrases (+ paragraphes à classer) ---------------- */
  /* items : [{ key, text, lang, block, styleTag }] ; styleBlocks : { tag → [indices] } */
  async function request(mode, items, ctx, styleBlocks) {
    if (!configured()) throw new Error('Aucun serveur d’IA configuré.');
    const lines = items.map((it, i) => `${i + 1}| ${it.text}`);
    const withStyle = styleBlocks && Object.keys(styleBlocks).length > 0;
    if (withStyle) for (const [tag, idx] of Object.entries(styleBlocks)) lines.push(`§ ${tag} : ${idx.map(i => i + 1).join(', ')}`);
    let user = lines.join('\n');
    if (ctx.already && ctx.already.length) user = `Déjà relevé lors d'une première lecture (ne le répète pas) :\n${ctx.already.map(a => `« ${a.avant} » → « ${a.apres} »`).join('\n')}\n\nRelis maintenant chaque phrase une seconde fois, plus attentivement (homophones, terminaisons, accords, mots oubliés). Réponds {"c":{}} seulement si tu es certain qu'il ne reste rien.\n\n${user}`;
    const chars = user.length;
    const maxTokens = Math.max(512, Math.min(mode === 'live' ? 2048 : 6144, 300 + Math.round(chars / 2)));
    const r = await call(null, { system: systemPrompt(mode, ctx, withStyle), user, maxTokens, timeoutMs: mode === 'live' ? 20000 : 40000 });
    stats.req++; stats.chars += chars; stats.sent += items.length;
    if (!r.ok) { persist(); const e = new Error(r.error); e.status = r.status; throw e; }
    stats.tokIn = (stats.tokIn || 0) + r.tokIn; stats.tokOut = (stats.tokOut || 0) + r.tokOut; persist();
    const j = parseJson(r.text) || {};
    const c = j.c && typeof j.c === 'object' ? j.c : {};
    const results = items.map((it, i) => ({ item: it, fixes: fixesFor(it.text, c[String(i + 1)]) }));
    const styles = {};
    if (withStyle && j.m && typeof j.m === 'object') for (const [tag, v] of Object.entries(j.m)) if (v && typeof v === 'object' && v.t) styles[tag] = { type: String(v.t), terme: String(v.terme || '').trim(), raison: String(v.raison || '').trim() };
    return { results, styles };
  }

  /* ---------------- étage 3, en direct : file d'attente, regroupement, cadence ---------------- */
  let opts = {};               // fourni par app.js : ctx(), text(blockId) → { text, lang, type } | null, onResult, onStyle, onError, caretIn(blockId, s, e)
  const pending = new Map();   // blockId → { keys: Map(key → { text }), style: bool }
  const inflight = new Set();  // clés en cours d'envoi
  const timers = new Map();    // blockId → timer
  let runTm = null, busy = false, lastReq = 0, backoffUntil = 0;

  function init(o) { opts = Object.assign({}, opts, o); }
  const ctxOf = () => (opts.ctx ? opts.ctx() : {}) || {};

  /* prépare les phrases d'un bloc : celles en mémoire sont rendues tout de suite, les autres mises en file */
  function collect(blockId, { style = false, all = false } = {}) {
    const info = opts.text ? opts.text(blockId) : null;
    if (!info || !info.text) return;
    const ctx = Object.assign({}, ctxOf(), { lang: info.lang || 'fr' });
    const sents = sentences(info.text);
    const fromCache = [];
    let entry = pending.get(blockId);
    for (let i = 0; i < sents.length; i++) {
      const sn = sents[i];
      if (!worth(sn.text)) continue;
      // la phrase qui porte encore le curseur (dernier mot en cours) attend la fin de phrase ou la pause : on ne l'envoie qu'avec « all »
      if (!all && opts.caretIn && opts.caretIn(blockId, sn.s, sn.e) && !/[.!?…]["»”')\]]*$/.test(sn.text)) continue;
      const key = keyOf(sn.text, ctx);
      const hit = cacheGet(key);
      if (hit !== undefined) { stats.cached++; fromCache.push({ key, text: sn.text, fixes: hit.map(x => ({ avant: x[0], apres: x[1], kind: KINDS[x[2]] || 'orthographe', regle: x[3] || '', at: sn.text.indexOf(x[0]) })).filter(f => f.at >= 0) }); continue; }
      if (inflight.has(key)) continue;
      if (!entry) { entry = { keys: new Map(), style: false, lang: ctx.lang }; pending.set(blockId, entry); }
      entry.keys.set(key, { text: sn.text });
    }
    if (style) { if (!entry) { entry = { keys: new Map(), style: false, lang: ctx.lang }; pending.set(blockId, entry); } entry.style = true; }
    if (fromCache.length && opts.onResult) opts.onResult(blockId, fromCache, { cached: true });
    if (entry && !entry.keys.size && !entry.style) pending.delete(blockId);
    if (pending.size) schedule();
  }
  function arm(blockId, ms, o) {
    clearTimeout(timers.get(blockId));
    timers.set(blockId, setTimeout(() => { timers.delete(blockId); collect(blockId, o); }, ms));
  }
  /* appels d'app.js */
  function typed(blockId) { if (!enabled()) return; arm(blockId, PAUSE_MS, { all: true }); }                           // pause de frappe : tout, même la phrase en cours
  function sentenceDone(blockId) { if (!enabled()) return; arm(blockId, SENTENCE_MS, { all: false }); }                 // fin de phrase : les phrases terminées
  function left(blockId, { style = false } = {}) { if (!enabled()) return; arm(blockId, LEAVE_MS, { all: true, style }); }   // sortie du bloc : tout + mise en forme
  function drop(blockId) { clearTimeout(timers.get(blockId)); timers.delete(blockId); pending.delete(blockId); }
  const enabled = () => !!(opts.enabled ? opts.enabled() : true);

  function schedule() {
    if (busy || runTm) return;
    const wait = Math.max(MIN_GAP - (Date.now() - lastReq), backoffUntil - Date.now(), 0);
    runTm = setTimeout(run, wait + 10);
  }
  async function run() {
    runTm = null;
    if (busy || !pending.size) return;
    if (!enabled() || !configured()) { pending.clear(); return; }
    // lot : phrases de tous les blocs en attente, dans la limite de taille ; paragraphes à classer en plus
    const items = []; const styleBlocks = {}; const styleTags = {}; let chars = 0; let tag = 65;
    for (const [blockId, entry] of pending) {
      if (chars > MAX_BATCH_LIVE) break;
      const start = items.length;
      for (const [key, v] of entry.keys) {
        if (chars > MAX_BATCH_LIVE) break;
        items.push({ key, text: v.text, blockId, lang: entry.lang }); inflight.add(key); chars += v.text.length + 4;
        entry.keys.delete(key);
      }
      if (entry.style && items.length > start) {
        const t = String.fromCharCode(tag++); styleBlocks[t] = items.slice(start).map((_, i) => start + i); styleTags[t] = blockId; entry.style = false;
      }
      if (!entry.keys.size && !entry.style) pending.delete(blockId);
    }
    if (!items.length) { if (pending.size) schedule(); return; }
    busy = true; lastReq = Date.now();
    const ctx = Object.assign({}, ctxOf(), { lang: items[0].lang || 'fr' });
    try {
      const { results, styles } = await request('live', items, ctx, styleBlocks);
      const byBlock = new Map();
      for (const r of results) {
        cacheSet(r.item.key, compact(r.fixes)); inflight.delete(r.item.key);
        if (!byBlock.has(r.item.blockId)) byBlock.set(r.item.blockId, []);
        byBlock.get(r.item.blockId).push({ key: r.item.key, text: r.item.text, fixes: r.fixes });
      }
      for (const [blockId, list] of byBlock) if (opts.onResult) opts.onResult(blockId, list, { cached: false });
      for (const [t, blockId] of Object.entries(styleTags)) if (opts.onStyle) opts.onStyle(blockId, styles[t] || null);
    } catch (err) {
      for (const it of items) inflight.delete(it.key);
      if (err && err.status === 429) backoffUntil = Date.now() + 60000;
      else if (err && err.status === 0) backoffUntil = Date.now() + 20000;
      if (opts.onError) opts.onError(err);
    }
    busy = false;
    if (pending.size) schedule();
  }

  /* ---------------- étage 3, à la demande (F7) : tout un cours ---------------- */
  /* blocks : [{ id, text, lang }] → [{ id, avant, apres, regle, kind, at }] ; second = seconde lecture (ignore la mémoire) */
  async function analyzeBlocks(blocks, { onProgress, second = false, already = [] } = {}) {
    const base = ctxOf();
    const all = []; const todo = [];
    for (const b of blocks) {
      const ctx = Object.assign({}, base, { lang: b.lang || 'fr', strict: second });
      for (const sn of sentences(b.text)) {
        if (!worth(sn.text)) continue;
        const key = keyOf(sn.text, ctx);
        const hit = second ? undefined : cacheGet(key);
        if (hit !== undefined) { stats.cached++; for (const x of hit) { const at = sn.text.indexOf(x[0]); if (at >= 0) all.push({ id: b.id, avant: x[0], apres: x[1], kind: KINDS[x[2]] || 'orthographe', regle: x[3] || '', at: sn.s + at }); } continue; }
        todo.push({ key, text: sn.text, blockId: b.id, lang: ctx.lang, s: sn.s });
      }
    }
    // lots par taille (une langue par lot)
    const batches = []; let cur = [], n = 0;
    for (const it of todo) {
      if (cur.length && (n + it.text.length > MAX_BATCH_FULL || cur[0].lang !== it.lang || cur.length >= 120)) { batches.push(cur); cur = []; n = 0; }
      cur.push(it); n += it.text.length + 4;
    }
    if (cur.length) batches.push(cur);
    let step = 0;
    for (const batch of batches) {
      if (onProgress) onProgress(step, batches.length);
      const ctx = Object.assign({}, base, { lang: batch[0].lang, strict: second });
      // seconde lecture : on rappelle ce qui a déjà été relevé pour ne pas le répéter
      if (second && already.length) ctx.already = already.filter(a => batch.some(it => it.blockId === a.id)).slice(0, 60);
      const { results } = await request('full', batch, ctx, null);
      for (const r of results) {
        if (!second) cacheSet(r.item.key, compact(r.fixes));
        for (const f of r.fixes) all.push({ id: r.item.blockId, avant: f.avant, apres: f.apres, kind: f.kind, regle: f.regle, at: r.item.s + f.at });
      }
      step++;
    }
    if (onProgress) onProgress(batches.length, batches.length);
    return all;
  }

  /* ---------------- statistiques (Paramètres › IA) ---------------- */
  function getStats() { return Object.assign({ learned: Object.keys(learned).length, ignored: ignored.size, cacheSize: Object.keys(cache).length, lexicon: LEX.size }, stats); }
  function resetStats() { for (const k of ['req', 'sent', 'cached', 'local', 'auto', 'chars', 'tokIn', 'tokOut']) stats[k] = 0; stats.since = Date.now(); persist(); }
  const note = k => { stats[k] = (stats[k] || 0) + 1; persist(); };

  return {
    init, typed, sentenceDone, left, drop, pending: () => pending.size + inflight.size,
    localFix, learn, ignore, isIgnored, forget, known,
    sentences, worth, sureTypo, levenshtein, locate, align,
    analyzeBlocks, request, call, listModels,
    getConfig, setConfig, configured, isLocalUrl,
    cacheGet, cacheSet, clearCache, keyOf,
    stats: getStats, resetStats, note,
    TYPO_FIXES, LANG_NAMES, PROVIDERS, DEFAULT_PROVIDER, DEFAULT_MODEL
  };
})();
