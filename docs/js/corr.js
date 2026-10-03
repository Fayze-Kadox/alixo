/* ============================================================
   Alixo — moteur de correction (1.22)
   Trois étages, du moins cher au plus cher :
   1. local, instantané, sans Internet : fautes de frappe reconnues à l'espace (liste fermée, mots appris,
      lexique de 24 000 mots : lettres inversées, lettre doublée, accent oublié) ;
   2. mémoire : chaque phrase déjà analysée (même texte, même niveau) ne repart jamais vers l'API ;
   3. API Gemini : seulement les phrases nouvelles ou modifiées, groupées en une requête compacte
      (consigne courte, réponse JSON minimale, jetons de sortie bornés), au plus une requête toutes les 3 s.
   Chargé avant app.js (ne dépend que de window.ALIXO_LEXIQUE, js/lexique.js). app.js fournit l'accès aux
   blocs et à l'écran via AlixoCorr.init({...}) et branche les événements de frappe.
   ============================================================ */
'use strict';

window.AlixoCorr = (() => {
  /* ---------------- réglages ---------------- */
  const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const MODELS_FULL = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];   // relecture à la demande (F7) : qualité d'abord
  const MODELS_LIVE = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash', 'gemini-3.7-flash'];   // pendant la frappe : rapides et peu coûteux d'abord
  const MIN_GAP = 3000;            // ms entre deux requêtes « en direct » (palier gratuit : ~15 / min, on reste bien en dessous)
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

  /* ---------------- appel Gemini ---------------- */
  let thinkingOff = true;     // on demande d'abord « sans réflexion » (moins cher, plus rapide) ; si le modèle refuse le paramètre, on n'insiste plus
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function call(key, { system, user, maxTokens, models, timeoutMs = 25000, temperature = 0 }) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) for (const model of models) {
      if (attempt && model === models[0]) await sleep(1500);
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeoutMs);
      const gen = { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' };
      if (thinkingOff) gen.thinkingConfig = { thinkingBudget: 0 };
      let res;
      try {
        res = await fetch(`${API}${model}:generateContent`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: gen })
        });
      } catch (err) {
        clearTimeout(tm);
        if (err && err.name === 'AbortError') { last = { ok: false, status: 0, error: 'Google ne répond pas (délai dépassé) — réessayez dans un instant.' }; continue; }
        return { ok: false, status: 0, error: 'Impossible de joindre Google — vérifiez la connexion internet.' };
      }
      clearTimeout(tm);
      let j = null; try { j = await res.json(); } catch { j = null; }
      if (res.ok) {
        const cand = j && j.candidates && j.candidates[0];
        if (!cand || !cand.content) {
          const why = (j && j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || '';
          return { ok: false, status: res.status, error: 'Le modèle n’a pas renvoyé de réponse' + (why ? ` (${why})` : '') + '.' };
        }
        const usage = j.usageMetadata || {};
        return { ok: true, text: (cand.content.parts || []).map(p => p.text || '').join(''), model, tokIn: usage.promptTokenCount || 0, tokOut: usage.candidatesTokenCount || 0 };
      }
      const detail = (j && j.error && j.error.message) || '';
      const st = (j && j.error && j.error.status) || '';
      if (res.status === 400 && thinkingOff && /thinking/i.test(detail)) { thinkingOff = false; return call(key, { system, user, maxTokens, models, timeoutMs, temperature }); }
      if (res.status === 404 || /not found|not supported/i.test(detail)) { last = { ok: false, status: 404, error: `Modèle ${model} indisponible.` }; continue; }
      if (res.status === 400 && /api key/i.test(detail)) return { ok: false, status: 400, error: 'Clé refusée par Google : elle est incomplète, révoquée ou mal copiée.' };
      if (res.status === 403) return { ok: false, status: 403, error: 'Clé reconnue mais sans accès (' + (detail || st) + '). Vérifiez que l’API Gemini est activée pour cette clé dans AI Studio.' };
      if (res.status === 503 || res.status === 500 || res.status === 429 || /high demand|overloaded|resource exhausted/i.test(detail)) {
        last = { ok: false, status: res.status, error: res.status === 429 ? 'Limite du palier gratuit atteinte pour l’instant — réessayez dans une minute.' : 'Google est saturé pour l’instant (' + res.status + ') — réessayez dans un instant.' };
        continue;
      }
      return { ok: false, status: res.status, error: `Erreur ${res.status} de Google${detail ? ' : ' + detail : ''}.` };
    }
    return last || { ok: false, status: 404, error: 'Aucun modèle Gemini disponible.' };
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
    const key = opts.key && opts.key(); if (!key) throw new Error('Aucune clé API.');
    const lines = items.map((it, i) => `${i + 1}| ${it.text}`);
    const withStyle = styleBlocks && Object.keys(styleBlocks).length > 0;
    if (withStyle) for (const [tag, idx] of Object.entries(styleBlocks)) lines.push(`§ ${tag} : ${idx.map(i => i + 1).join(', ')}`);
    let user = lines.join('\n');
    if (ctx.already && ctx.already.length) user = `Déjà relevé lors d'une première lecture (ne le répète pas) :\n${ctx.already.map(a => `« ${a.avant} » → « ${a.apres} »`).join('\n')}\n\nRelis maintenant chaque phrase une seconde fois, plus attentivement (homophones, terminaisons, accords, mots oubliés). Réponds {"c":{}} seulement si tu es certain qu'il ne reste rien.\n\n${user}`;
    const chars = user.length;
    const maxTokens = Math.max(512, Math.min(mode === 'live' ? 2048 : 6144, 300 + Math.round(chars / 2)));
    const r = await call(key, { system: systemPrompt(mode, ctx, withStyle), user, maxTokens, models: mode === 'live' ? MODELS_LIVE : MODELS_FULL, timeoutMs: mode === 'live' ? 20000 : 40000 });
    stats.req++; stats.chars += chars; stats.sent += items.length;
    if (!r.ok) { persist(); const e = new Error(r.status === 400 ? 'Clé API refusée — vérifiez-la (Paramètres › IA).' : r.error); e.status = r.status; throw e; }
    stats.tokIn = (stats.tokIn || 0) + r.tokIn; stats.tokOut = (stats.tokOut || 0) + r.tokOut; persist();
    const j = parseJson(r.text) || {};
    const c = j.c && typeof j.c === 'object' ? j.c : {};
    const results = items.map((it, i) => ({ item: it, fixes: fixesFor(it.text, c[String(i + 1)]) }));
    const styles = {};
    if (withStyle && j.m && typeof j.m === 'object') for (const [tag, v] of Object.entries(j.m)) if (v && typeof v === 'object' && v.t) styles[tag] = { type: String(v.t), terme: String(v.terme || '').trim(), raison: String(v.raison || '').trim() };
    return { results, styles };
  }

  /* ---------------- étage 3, en direct : file d'attente, regroupement, cadence ---------------- */
  let opts = {};               // fourni par app.js : key(), ctx(), text(blockId) → { text, lang, type } | null, onResult, onStyle, onError, caretIn(blockId, s, e)
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
    if (!enabled() || !(opts.key && opts.key())) { pending.clear(); return; }
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
    analyzeBlocks, request, call,
    cacheGet, cacheSet, clearCache, keyOf,
    stats: getStats, resetStats, note,
    TYPO_FIXES, MODELS_FULL, MODELS_LIVE, LANG_NAMES
  };
})();
