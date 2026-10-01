/* ============================================================
   Alixo — spécialités Santé (médecine, pharmacie, odontologie,
   maïeutique, kinésithérapie) : gabarits de fiches, scores
   cliniques, calculateurs, abréviations, notation automatique.
   Données pures + petites fonctions ; l'intégration est dans app.js.
   ============================================================ */
'use strict';

window.AlixoMed = (() => {
  const HEALTH_KEYS = ['medecine', 'pharmacie', 'odontologie', 'maieutique', 'kine'];

  /* ---------------- fiches structurées (même mécanique que la fiche d'arrêt) ---------------- */
  const FICHES = {
    patho: { name: 'Fiche pathologie', ico: 'activity', color: '#c04343', head: 'Nom de la pathologie', spec: 'sante',
      fields: [['def', 'Définition'], ['epid', 'Épidémiologie'], ['physio', 'Physiopathologie'], ['clin', 'Clinique'], ['para', 'Paraclinique'], ['ddx', 'Diagnostics différentiels'], ['ttt', 'Traitement'], ['evol', 'Évolution / complications'], ['prev', 'Prévention']] },
    medoc: { name: 'Fiche médicament', ico: 'flask', color: '#2e8b6a', head: 'DCI (nom commercial)', spec: 'sante',
      fields: [['classe', 'Classe'], ['meca', 'Mécanisme d’action'], ['ind', 'Indications'], ['ci', 'Contre-indications'], ['ei', 'Effets indésirables'], ['inter', 'Interactions'], ['surv', 'Surveillance'], ['poso', 'Posologie usuelle']] },
    semio: { name: 'Sémiologie', ico: 'thermometer', color: '#3d6bb5', head: 'Signe clinique', spec: 'sante',
      fields: [['def', 'Définition'], ['tech', 'Technique de recherche'], ['sig', 'Signification'], ['patho', 'Pathologies associées']] },
    cas: { name: 'Cas clinique', ico: 'user', color: '#7a6852', head: 'Titre du cas', spec: 'sante',
      fields: [['enonce', 'Énoncé'], ['quest', 'Questions'], ['corr', 'Correction']] },
    cat: { name: 'Conduite à tenir', ico: 'list', color: '#b3762a', head: 'Situation', spec: 'sante',
      fields: [['imm', 'Mesures immédiates'], ['exam', 'Examens'], ['ttt', 'Traitement'], ['surv', 'Surveillance'], ['orient', 'Orientation']] },
    reco: { name: 'Recommandation HAS', ico: 'shield-check', color: '#33658a', head: 'Intitulé de la recommandation', spec: 'sante',
      fields: [['annee', 'Année'], ['grade', 'Grade (A, B, C, AE)'], ['src', 'Source / lien'], ['res', 'Résumé']] },
    lca: { name: 'Lecture critique d’article', ico: 'newspaper', color: '#5b6b8c', head: 'Référence de l’article', spec: 'sante',
      fields: [['pico', 'PICO'], ['type', 'Type d’étude'], ['np', 'Niveau de preuve'], ['biais', 'Biais'], ['cj', 'Critères de jugement'], ['concl', 'Conclusion']] },
    anat: { name: 'Anatomie', ico: 'dna', color: '#a8556f', head: 'Structure anatomique', spec: 'sante',
      fields: [['rap', 'Rapports'], ['vasc', 'Vascularisation'], ['inn', 'Innervation'], ['lymph', 'Drainage lymphatique']] },
    histo: { name: 'Histologie / cytologie', ico: 'microscope', color: '#2f7d68', head: 'Tissu ou type cellulaire', spec: 'sante',
      fields: [['struct', 'Structure'], ['fonc', 'Fonction'], ['colo', 'Coloration'], ['aspect', 'Aspect au microscope']] },
    genet: { name: 'Génétique', ico: 'dna', color: '#674ea7', head: 'Maladie / gène', spec: 'sante',
      fields: [['trans', 'Mode de transmission'], ['penet', 'Pénétrance / expressivité'], ['diag', 'Diagnostic'], ['cons', 'Conseil génétique']] },
    vaccin: { name: 'Vaccin', ico: 'shield', color: '#4a7856', head: 'Vaccin', spec: 'sante',
      fields: [['type', 'Type de vaccin'], ['schema', 'Schéma vaccinal'], ['rappel', 'Rappels'], ['ci', 'Contre-indications'], ['pop', 'Population cible']] },
    ecos: { name: 'Station ECOS', ico: 'target', color: '#d06a3a', head: 'Intitulé de la station', spec: 'sante', timer: 420,
      fields: [['consigne', 'Consigne'], ['attendus', 'Attendus (interrogatoire, examen, annonce, prescription)'], ['grille', 'Grille de notation']] },
    dp: { name: 'Dossier progressif / QI', ico: 'file-text', color: '#3d5a80', head: 'Énoncé initial', spec: 'sante',
      fields: [['q1', 'Question 1 (5 propositions)'], ['q2', 'Question 2'], ['q3', 'Question 3'], ['corr', 'Correction'], ['rang', 'Rang testé']] },
    galen: { name: 'Fiche galénique', ico: 'flask', color: '#2e8b8b', head: 'Forme pharmaceutique', spec: 'pharmacie',
      fields: [['forme', 'Forme galénique'], ['excip', 'Excipients'], ['fab', 'Fabrication'], ['conserv', 'Conservation'], ['voie', 'Voie d’administration']] },
    dent: { name: 'Fiche dent (FDI)', ico: 'apple', color: '#3d5a80', head: 'Dent (numéro FDI)', spec: 'odontologie',
      fields: [['faces', 'Faces (vestibulaire, linguale, mésiale, distale)'], ['occl', 'Occlusion'], ['patho', 'Pathologie'], ['ttt', 'Traitement']] },
    bilank: { name: 'Bilan kinésithérapique', ico: 'activity', color: '#d06a3a', head: 'Patient / motif', spec: 'kine',
      fields: [['ampl', 'Amplitudes articulaires'], ['cot', 'Cotation musculaire (0–5)'], ['tests', 'Tests orthopédiques'], ['obj', 'Objectifs'], ['plan', 'Plan de traitement']] },
    grossesse: { name: 'Suivi de grossesse', ico: 'heart', color: '#a8556f', head: 'Terme (SA) / consultation', spec: 'maieutique',
      fields: [['exam', 'Examens'], ['depist', 'Dépistages'], ['surv', 'Surveillance'], ['cs', 'Conseils']] }
  };

  /* ---------------- encadrés spécifiques ---------------- */
  const CALLOUTS = {
    drapeau: { name: 'Drapeaux rouges', ico: 'flag', sub: 'Signes de gravité, critères d’hospitalisation', color: '#c04343', dark: '#e07b7b' },
    reflexe: { name: 'Réflexe / piège', ico: 'zap', sub: 'Jusqu’à preuve du contraire…', color: '#b3762a', dark: '#d3a05e' },
    mnemo: { name: 'Moyen mnémotechnique', ico: 'brain', color: '#674ea7', dark: '#a48ad6' },
    objectifs: { name: 'Objectifs pédagogiques', ico: 'target', sub: 'À cocher au fil de la rédaction (« - » pour une puce)', color: '#2e8b6a', dark: '#5cb896' }
  };

  /* ---------------- scores cliniques ---------------- */
  /* items : { l, p } (case à cocher = p points) ou { l, opts: [[points, libellé], …] } (un seul choix) */
  const SCORES = {
    cha2ds2: { name: 'CHA₂DS₂-VASc', sub: 'Risque thrombo-embolique en fibrillation atriale',
      items: [{ l: 'Insuffisance cardiaque / FEVG ≤ 40 %', p: 1 }, { l: 'Hypertension artérielle', p: 1 }, { l: 'Âge ≥ 75 ans', p: 2 }, { l: 'Diabète', p: 1 }, { l: 'AVC / AIT / embolie', p: 2 }, { l: 'Maladie vasculaire (IDM, AOMI, plaque aortique)', p: 1 }, { l: 'Âge 65–74 ans', p: 1 }, { l: 'Sexe féminin', p: 1 }],
      interp: [[0, 0, 'Risque faible — pas d’anticoagulation'], [1, 1, 'Risque intermédiaire — anticoagulation à discuter'], [2, 99, 'Anticoagulation recommandée']] },
    hasbled: { name: 'HAS-BLED', sub: 'Risque hémorragique sous anticoagulant',
      items: [{ l: 'HTA non contrôlée (PAS > 160)', p: 1 }, { l: 'Insuffisance rénale', p: 1 }, { l: 'Insuffisance hépatique', p: 1 }, { l: 'AVC', p: 1 }, { l: 'Antécédent de saignement', p: 1 }, { l: 'INR labile', p: 1 }, { l: 'Âge > 65 ans', p: 1 }, { l: 'Médicaments (antiagrégants, AINS)', p: 1 }, { l: 'Alcool', p: 1 }],
      interp: [[0, 2, 'Risque faible à modéré'], [3, 99, 'Risque hémorragique élevé — surveillance rapprochée']] },
    wellstvp: { name: 'Wells — TVP', sub: 'Probabilité clinique de thrombose veineuse profonde',
      items: [{ l: 'Cancer actif', p: 1 }, { l: 'Paralysie, parésie ou immobilisation plâtrée', p: 1 }, { l: 'Alitement > 3 j ou chirurgie < 4 semaines', p: 1 }, { l: 'Douleur sur un trajet veineux profond', p: 1 }, { l: 'Œdème de tout le membre', p: 1 }, { l: 'Mollet augmenté > 3 cm', p: 1 }, { l: 'Œdème prenant le godet', p: 1 }, { l: 'Veines superficielles collatérales', p: 1 }, { l: 'Antécédent de TVP', p: 1 }, { l: 'Diagnostic alternatif au moins aussi probable', p: -2 }],
      interp: [[-9, 0, 'Probabilité faible'], [1, 2, 'Probabilité modérée'], [3, 99, 'Probabilité élevée']] },
    wellsep: { name: 'Wells — Embolie pulmonaire', sub: 'Probabilité clinique d’EP',
      items: [{ l: 'Signes cliniques de TVP', p: 3 }, { l: 'Diagnostic alternatif moins probable que l’EP', p: 3 }, { l: 'Fréquence cardiaque > 100 / min', p: 1.5 }, { l: 'Immobilisation ou chirurgie < 4 semaines', p: 1.5 }, { l: 'Antécédent de TVP / EP', p: 1.5 }, { l: 'Hémoptysie', p: 1 }, { l: 'Cancer actif', p: 1 }],
      interp: [[0, 4, 'EP improbable (≤ 4) — D-dimères'], [4.5, 99, 'EP probable (> 4) — angioscanner']] },
    curb65: { name: 'CURB-65', sub: 'Gravité d’une pneumonie aiguë communautaire',
      items: [{ l: 'Confusion', p: 1 }, { l: 'Urée > 7 mmol/L', p: 1 }, { l: 'Fréquence respiratoire ≥ 30 / min', p: 1 }, { l: 'PA systolique < 90 ou diastolique ≤ 60 mmHg', p: 1 }, { l: 'Âge ≥ 65 ans', p: 1 }],
      interp: [[0, 1, 'Traitement ambulatoire possible'], [2, 2, 'Hospitalisation'], [3, 5, 'Pneumonie sévère — soins intensifs à discuter']] },
    qsofa: { name: 'qSOFA', sub: 'Dépistage du sepsis',
      items: [{ l: 'Fréquence respiratoire ≥ 22 / min', p: 1 }, { l: 'PA systolique ≤ 100 mmHg', p: 1 }, { l: 'Altération de la conscience (Glasgow < 15)', p: 1 }],
      interp: [[0, 1, 'Risque faible'], [2, 3, 'qSOFA ≥ 2 : risque élevé de sepsis']] },
    glasgow: { name: 'Score de Glasgow', sub: 'Conscience (3 à 15)',
      items: [
        { l: 'Ouverture des yeux', opts: [[4, 'spontanée'], [3, 'à la demande'], [2, 'à la douleur'], [1, 'aucune']] },
        { l: 'Réponse verbale', opts: [[5, 'orientée'], [4, 'confuse'], [3, 'inappropriée'], [2, 'incompréhensible'], [1, 'aucune']] },
        { l: 'Réponse motrice', opts: [[6, 'obéit'], [5, 'orientée à la douleur'], [4, 'évitement'], [3, 'flexion stéréotypée'], [2, 'extension stéréotypée'], [1, 'aucune']] }],
      interp: [[13, 15, 'Traumatisme crânien léger'], [9, 12, 'Modéré'], [3, 8, 'Grave — coma (intubation à discuter)']] },
    apgar: { name: 'Score d’Apgar', sub: 'Nouveau-né à 1, 5 et 10 min',
      items: [
        { l: 'Fréquence cardiaque', opts: [[0, 'absente'], [1, '< 100'], [2, '≥ 100']] },
        { l: 'Respiration', opts: [[0, 'absente'], [1, 'lente, irrégulière'], [2, 'cri vigoureux']] },
        { l: 'Tonus', opts: [[0, 'flasque'], [1, 'légère flexion'], [2, 'mouvements actifs']] },
        { l: 'Réactivité', opts: [[0, 'nulle'], [1, 'grimace'], [2, 'cri, toux']] },
        { l: 'Coloration', opts: [[0, 'bleue / pâle'], [1, 'extrémités cyanosées'], [2, 'rose']] }],
      interp: [[7, 10, 'Bonne adaptation'], [4, 6, 'Adaptation moyenne — stimulation, aspiration'], [0, 3, 'Mauvaise adaptation — réanimation']] },
    bishop: { name: 'Score de Bishop', sub: 'Maturité cervicale avant déclenchement',
      items: [
        { l: 'Dilatation', opts: [[0, 'col fermé'], [1, '1–2 cm'], [2, '3–4 cm'], [3, '≥ 5 cm']] },
        { l: 'Effacement', opts: [[0, '0–30 %'], [1, '40–50 %'], [2, '60–70 %'], [3, '≥ 80 %']] },
        { l: 'Consistance', opts: [[0, 'ferme'], [1, 'moyenne'], [2, 'molle']] },
        { l: 'Position', opts: [[0, 'postérieure'], [1, 'intermédiaire'], [2, 'antérieure']] },
        { l: 'Hauteur de la présentation', opts: [[0, '−3'], [1, '−2'], [2, '−1 / 0'], [3, '+1 / +2']] }],
      interp: [[0, 5, 'Col défavorable — maturation cervicale'], [6, 6, 'Intermédiaire'], [7, 13, 'Col favorable — déclenchement possible']] },
    childpugh: { name: 'Child-Pugh', sub: 'Gravité d’une cirrhose',
      items: [
        { l: 'Bilirubine (µmol/L)', opts: [[1, '< 35'], [2, '35–50'], [3, '> 50']] },
        { l: 'Albumine (g/L)', opts: [[1, '> 35'], [2, '28–35'], [3, '< 28']] },
        { l: 'TP (%)', opts: [[1, '> 50'], [2, '40–50'], [3, '< 40']] },
        { l: 'Ascite', opts: [[1, 'absente'], [2, 'modérée'], [3, 'importante']] },
        { l: 'Encéphalopathie', opts: [[1, 'absente'], [2, 'grade 1–2'], [3, 'grade 3–4']] }],
      interp: [[5, 6, 'Child A'], [7, 9, 'Child B'], [10, 15, 'Child C']] },
    killip: { name: 'Classification de Killip', sub: 'Insuffisance cardiaque à la phase aiguë d’un IDM',
      items: [{ l: 'Stade', opts: [[1, 'I — pas de signe d’IC'], [2, 'II — crépitants < ½ champs, B3'], [3, 'III — œdème aigu du poumon'], [4, 'IV — choc cardiogénique']] }],
      interp: [[1, 1, 'Mortalité faible'], [2, 3, 'Mortalité intermédiaire'], [4, 4, 'Mortalité élevée']] },
    nyha: { name: 'Classification NYHA', sub: 'Dyspnée de l’insuffisance cardiaque',
      items: [{ l: 'Classe', opts: [[1, 'I — aucune limitation'], [2, 'II — dyspnée pour efforts importants'], [3, 'III — dyspnée pour efforts modérés'], [4, 'IV — dyspnée au repos']] }],
      interp: [[1, 2, 'Limitation nulle à légère'], [3, 4, 'Limitation marquée à sévère']] },
    rankin: { name: 'Rankin modifié (mRS)', sub: 'Handicap après AVC',
      items: [{ l: 'Score', opts: [[0, '0 — aucun symptôme'], [1, '1 — pas d’incapacité significative'], [2, '2 — incapacité légère'], [3, '3 — incapacité modérée (marche sans aide)'], [4, '4 — incapacité modérément sévère'], [5, '5 — incapacité sévère (grabataire)'], [6, '6 — décès']] }],
      interp: [[0, 2, 'Bon pronostic fonctionnel (indépendance)'], [3, 5, 'Dépendance'], [6, 6, 'Décès']] },
    ranson: { name: 'Score de Ranson', sub: 'Gravité d’une pancréatite aiguë (à l’admission et à 48 h)',
      items: [{ l: 'Âge > 55 ans', p: 1 }, { l: 'Leucocytes > 16 000 / mm³', p: 1 }, { l: 'Glycémie > 11 mmol/L', p: 1 }, { l: 'LDH > 350 UI/L', p: 1 }, { l: 'ASAT > 250 UI/L', p: 1 }, { l: 'À 48 h : chute de l’hématocrite > 10 %', p: 1 }, { l: 'À 48 h : élévation de l’urée > 1,8 mmol/L', p: 1 }, { l: 'À 48 h : calcémie < 2 mmol/L', p: 1 }, { l: 'À 48 h : PaO₂ < 60 mmHg', p: 1 }, { l: 'À 48 h : déficit en bases > 4 mEq/L', p: 1 }, { l: 'À 48 h : séquestration liquidienne > 6 L', p: 1 }],
      interp: [[0, 2, 'Pancréatite bénigne'], [3, 11, 'Pancréatite sévère (≥ 3)']] },
    centor: { name: 'Centor / Mac Isaac', sub: 'Angine : indication du TDR streptocoque',
      items: [{ l: 'Température > 38 °C', p: 1 }, { l: 'Absence de toux', p: 1 }, { l: 'Adénopathies cervicales antérieures douloureuses', p: 1 }, { l: 'Exsudat amygdalien ou amygdales augmentées', p: 1 }, { l: 'Âge 3–14 ans', p: 1 }, { l: 'Âge ≥ 45 ans', p: -1 }],
      interp: [[-1, 1, 'Pas de TDR — pas d’antibiotique'], [2, 5, 'TDR indiqué']] },
    epworth: { name: 'Échelle d’Epworth', sub: 'Somnolence diurne (0 = jamais … 3 = risque élevé de s’endormir)',
      items: ['Assis en lisant', 'En regardant la télévision', 'Assis inactif dans un lieu public', 'Passager d’une voiture pendant 1 h', 'Allongé l’après-midi', 'Assis en parlant à quelqu’un', 'Assis calmement après un repas sans alcool', 'Au volant, arrêté quelques minutes'].map(l => ({ l, opts: [[0, '0'], [1, '1'], [2, '2'], [3, '3']] })),
      interp: [[0, 10, 'Somnolence normale'], [11, 15, 'Somnolence excessive'], [16, 24, 'Somnolence sévère — SAOS à rechercher']] }
  };

  /* ---------------- calculateurs cliniques ---------------- */
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const SEX = { k: 'sexe', l: 'Sexe', sel: [['h', 'Homme'], ['f', 'Femme']], d: 'h' };
  const CALCS = {
    imc: { name: 'IMC', sub: 'Indice de masse corporelle', inputs: [{ k: 'p', l: 'Poids', u: 'kg', d: 70 }, { k: 't', l: 'Taille', u: 'cm', d: 170 }],
      out: v => { const imc = v.p / ((v.t / 100) ** 2); return [{ l: 'IMC', v: r1(imc), u: 'kg/m²', note: imc < 18.5 ? 'Insuffisance pondérale' : imc < 25 ? 'Corpulence normale' : imc < 30 ? 'Surpoids' : imc < 35 ? 'Obésité classe I' : imc < 40 ? 'Obésité classe II' : 'Obésité classe III' }]; } },
    sc: { name: 'Surface corporelle', sub: 'Formule de Mosteller', inputs: [{ k: 'p', l: 'Poids', u: 'kg', d: 70 }, { k: 't', l: 'Taille', u: 'cm', d: 170 }],
      out: v => [{ l: 'SC', v: r2(Math.sqrt(v.p * v.t / 3600)), u: 'm²' }] },
    cockcroft: { name: 'Clairance — Cockcroft & Gault', sub: 'Fonction rénale (adaptation posologique)', inputs: [{ k: 'a', l: 'Âge', u: 'ans', d: 65 }, { k: 'p', l: 'Poids', u: 'kg', d: 70 }, { k: 'c', l: 'Créatinine', u: 'µmol/L', d: 90 }, SEX],
      out: v => [{ l: 'Clairance', v: Math.round((140 - v.a) * v.p / v.c * (v.sexe === 'f' ? 1.04 : 1.23)), u: 'mL/min' }] },
    ckdepi: { name: 'DFG — CKD-EPI 2021', sub: 'Débit de filtration glomérulaire estimé', inputs: [{ k: 'a', l: 'Âge', u: 'ans', d: 65 }, { k: 'c', l: 'Créatinine', u: 'µmol/L', d: 90 }, SEX],
      out: v => { const f = v.sexe === 'f'; const scr = v.c / 88.4, k = f ? 0.7 : 0.9, al = f ? -0.241 : -0.302; const dfg = 142 * Math.min(scr / k, 1) ** al * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** v.a * (f ? 1.012 : 1); return [{ l: 'DFG', v: Math.round(dfg), u: 'mL/min/1,73 m²', note: dfg >= 90 ? 'Stade 1' : dfg >= 60 ? 'Stade 2' : dfg >= 45 ? 'Stade 3a' : dfg >= 30 ? 'Stade 3b' : dfg >= 15 ? 'Stade 4' : 'Stade 5' }]; } },
    mdrd: { name: 'DFG — MDRD', sub: 'Formule simplifiée', inputs: [{ k: 'a', l: 'Âge', u: 'ans', d: 65 }, { k: 'c', l: 'Créatinine', u: 'µmol/L', d: 90 }, SEX],
      out: v => [{ l: 'DFG', v: Math.round(175 * (v.c / 88.4) ** -1.154 * v.a ** -0.203 * (v.sexe === 'f' ? 0.742 : 1)), u: 'mL/min/1,73 m²' }] },
    qtc: { name: 'QT corrigé', sub: 'Bazett et Fridericia', inputs: [{ k: 'qt', l: 'QT mesuré', u: 'ms', d: 400 }, { k: 'fc', l: 'Fréquence cardiaque', u: 'bpm', d: 70 }, SEX],
      out: v => { const rr = 60 / v.fc; const b = v.qt / Math.sqrt(rr), fr = v.qt / Math.cbrt(rr); const lim = v.sexe === 'f' ? 460 : 450; return [{ l: 'QTc Bazett', v: Math.round(b), u: 'ms', note: b > lim ? 'QT long (> ' + lim + ' ms)' : 'Normal' }, { l: 'QTc Fridericia', v: Math.round(fr), u: 'ms' }]; } },
    pam: { name: 'Pression artérielle moyenne', sub: 'PAM = PAD + (PAS − PAD) / 3', inputs: [{ k: 's', l: 'PAS', u: 'mmHg', d: 120 }, { k: 'd', l: 'PAD', u: 'mmHg', d: 80 }],
      out: v => { const pam = v.d + (v.s - v.d) / 3; return [{ l: 'PAM', v: Math.round(pam), u: 'mmHg', note: pam < 65 ? 'PAM < 65 : hypoperfusion' : '' }]; } },
    trou: { name: 'Trou anionique', sub: 'Na − (Cl + HCO₃)', inputs: [{ k: 'na', l: 'Na⁺', u: 'mmol/L', d: 140 }, { k: 'cl', l: 'Cl⁻', u: 'mmol/L', d: 104 }, { k: 'h', l: 'HCO₃⁻', u: 'mmol/L', d: 24 }],
      out: v => { const ta = v.na - (v.cl + v.h); return [{ l: 'Trou anionique', v: ta, u: 'mmol/L', note: ta > 16 ? 'Augmenté (acidose à TA élevé : lactates, cétose, toxiques, IR)' : ta < 8 ? 'Diminué' : 'Normal (8–16)' }]; } },
    osmo: { name: 'Osmolarité calculée', sub: '2 × Na + glycémie + urée', inputs: [{ k: 'na', l: 'Na⁺', u: 'mmol/L', d: 140 }, { k: 'g', l: 'Glycémie', u: 'mmol/L', d: 5 }, { k: 'u', l: 'Urée', u: 'mmol/L', d: 5 }],
      out: v => { const o = 2 * v.na + v.g + v.u; return [{ l: 'Osmolarité', v: Math.round(o), u: 'mOsm/L', note: o > 295 ? 'Hyperosmolarité' : o < 280 ? 'Hypo-osmolarité' : 'Normale (280–295)' }]; } },
    ldl: { name: 'LDL — Friedewald', sub: 'LDL = CT − HDL − TG / 5 (g/L), valable si TG < 4 g/L', inputs: [{ k: 'ct', l: 'Cholestérol total', u: 'g/L', d: 2 }, { k: 'hdl', l: 'HDL', u: 'g/L', d: 0.5 }, { k: 'tg', l: 'Triglycérides', u: 'g/L', d: 1 }],
      out: v => [{ l: 'LDL', v: r2(v.ct - v.hdl - v.tg / 5), u: 'g/L', note: v.tg >= 4 ? 'TG ≥ 4 g/L : formule non valide' : '' }, { l: 'LDL', v: r2((v.ct - v.hdl - v.tg / 5) * 2.58), u: 'mmol/L' }] },
    nacorr: { name: 'Natrémie corrigée', sub: 'Na + 0,3 × (glycémie − 5)', inputs: [{ k: 'na', l: 'Na⁺ mesurée', u: 'mmol/L', d: 130 }, { k: 'g', l: 'Glycémie', u: 'mmol/L', d: 20 }],
      out: v => [{ l: 'Na corrigée', v: r1(v.na + 0.3 * (v.g - 5)), u: 'mmol/L' }] },
    cacorr: { name: 'Calcémie corrigée', sub: 'Ca + 0,02 × (40 − albumine)', inputs: [{ k: 'ca', l: 'Calcémie', u: 'mmol/L', d: 2.2 }, { k: 'alb', l: 'Albumine', u: 'g/L', d: 30 }],
      out: v => { const c = v.ca + 0.02 * (40 - v.alb); return [{ l: 'Ca corrigée', v: r2(c), u: 'mmol/L', note: c > 2.6 ? 'Hypercalcémie' : c < 2.2 ? 'Hypocalcémie' : 'Normale (2,2–2,6)' }]; } },
    pfratio: { name: 'Rapport PaO₂ / FiO₂', sub: 'Sévérité d’un SDRA', inputs: [{ k: 'pao2', l: 'PaO₂', u: 'mmHg', d: 90 }, { k: 'fio2', l: 'FiO₂', u: '%', d: 21 }],
      out: v => { const r = v.pao2 / (v.fio2 / 100); return [{ l: 'PaO₂/FiO₂', v: Math.round(r), u: 'mmHg', note: r < 100 ? 'SDRA sévère' : r < 200 ? 'SDRA modéré' : r < 300 ? 'SDRA léger' : 'Normal (> 300)' }]; } },
    hh: { name: 'Henderson-Hasselbalch', sub: 'pH = 6,1 + log(HCO₃ / (0,03 × PaCO₂))', inputs: [{ k: 'h', l: 'HCO₃⁻', u: 'mmol/L', d: 24 }, { k: 'p', l: 'PaCO₂', u: 'mmHg', d: 40 }],
      out: v => { const ph = 6.1 + Math.log10(v.h / (0.03 * v.p)); return [{ l: 'pH attendu', v: r2(ph), u: '', note: ph < 7.38 ? 'Acidose' : ph > 7.42 ? 'Alcalose' : 'Normal (7,38–7,42)' }]; } },
    dose: { name: 'Dose et débit', sub: 'mg/kg, mL/h, gouttes/min (perfuseur 20 gtt/mL)', inputs: [{ k: 'd', l: 'Dose', u: 'mg/kg', d: 10 }, { k: 'p', l: 'Poids', u: 'kg', d: 70 }, { k: 'v', l: 'Volume à perfuser', u: 'mL', d: 500 }, { k: 't', l: 'Durée', u: 'min', d: 60 }],
      out: v => [{ l: 'Dose totale', v: r1(v.d * v.p), u: 'mg' }, { l: 'Débit', v: r1(v.v / (v.t / 60)), u: 'mL/h' }, { l: 'Débit', v: Math.round(v.v * 20 / v.t), u: 'gouttes/min' }] },
    convert: { name: 'Convertisseur d’unités', sub: 'g/L ↔ mmol/L, °C ↔ °F, mmHg ↔ kPa', inputs: [{ k: 'g', l: 'Glycémie', u: 'g/L', d: 1 }, { k: 'ch', l: 'Cholestérol', u: 'g/L', d: 2 }, { k: 'cr', l: 'Créatinine', u: 'mg/L', d: 10 }, { k: 'ur', l: 'Urée', u: 'g/L', d: 0.3 }, { k: 'tc', l: 'Température', u: '°C', d: 37 }, { k: 'pa', l: 'Pression', u: 'mmHg', d: 100 }],
      out: v => [{ l: 'Glycémie', v: r2(v.g * 5.55), u: 'mmol/L' }, { l: 'Cholestérol', v: r2(v.ch * 2.58), u: 'mmol/L' }, { l: 'Créatinine', v: Math.round(v.cr * 8.84), u: 'µmol/L' }, { l: 'Urée', v: r1(v.ur * 16.7), u: 'mmol/L' }, { l: 'Température', v: r1(v.tc * 9 / 5 + 32), u: '°F' }, { l: 'Pression', v: r1(v.pa * 0.1333), u: 'kPa' }] },
    bayes: { name: 'Probabilité post-test', sub: 'Théorème de Bayes — Se, Sp, prévalence', inputs: [{ k: 'pre', l: 'Probabilité pré-test', u: '%', d: 20 }, { k: 'se', l: 'Sensibilité', u: '%', d: 90 }, { k: 'sp', l: 'Spécificité', u: '%', d: 85 }],
      out: v => { const p = v.pre / 100, se = v.se / 100, sp = v.sp / 100; const lrp = se / (1 - sp), lrn = (1 - se) / sp; const odds = p / (1 - p); const post = o => r1(100 * o / (1 + o)); return [{ l: 'RV+', v: r2(lrp), u: '' }, { l: 'RV−', v: r2(lrn), u: '' }, { l: 'Post-test si positif', v: post(odds * lrp), u: '%' }, { l: 'Post-test si négatif', v: post(odds * lrn), u: '%' }]; } },
    stat2x2: { name: 'Tableau 2 × 2 — test diagnostique', sub: 'Se, Sp, VPP, VPN, rapports de vraisemblance', inputs: [{ k: 'vp', l: 'Vrais positifs', u: '', d: 80 }, { k: 'fp', l: 'Faux positifs', u: '', d: 10 }, { k: 'fn', l: 'Faux négatifs', u: '', d: 20 }, { k: 'vn', l: 'Vrais négatifs', u: '', d: 90 }],
      out: v => { const se = v.vp / (v.vp + v.fn), sp = v.vn / (v.vn + v.fp); return [{ l: 'Sensibilité', v: r1(100 * se), u: '%' }, { l: 'Spécificité', v: r1(100 * sp), u: '%' }, { l: 'VPP', v: r1(100 * v.vp / (v.vp + v.fp)), u: '%' }, { l: 'VPN', v: r1(100 * v.vn / (v.vn + v.fn)), u: '%' }, { l: 'RV+', v: r2(se / (1 - sp)), u: '' }, { l: 'RV−', v: r2((1 - se) / sp), u: '' }, { l: 'Prévalence', v: r1(100 * (v.vp + v.fn) / (v.vp + v.fp + v.fn + v.vn)), u: '%' }]; } },
    risque: { name: 'RR, OR, NNT', sub: 'Essai : exposés (a événements / b sans) vs non exposés (c / d)', inputs: [{ k: 'a', l: 'Exposés — événement', u: '', d: 15 }, { k: 'b', l: 'Exposés — sans événement', u: '', d: 85 }, { k: 'c', l: 'Non exposés — événement', u: '', d: 30 }, { k: 'd', l: 'Non exposés — sans événement', u: '', d: 70 }],
      out: v => { const re = v.a / (v.a + v.b), rn = v.c / (v.c + v.d); const rar = rn - re; return [{ l: 'Risque relatif', v: r2(re / rn), u: '' }, { l: 'Odds ratio', v: r2((v.a * v.d) / (v.b * v.c)), u: '' }, { l: 'Réduction absolue du risque', v: r1(100 * rar), u: '%' }, { l: 'Réduction relative du risque', v: r1(100 * rar / rn), u: '%' }, { l: 'NNT', v: rar > 0 ? Math.ceil(1 / rar) : NaN, u: 'patients' }]; } },
    meld: { name: 'Score MELD', sub: 'Gravité de la cirrhose (transplantation)', inputs: [{ k: 'b', l: 'Bilirubine', u: 'µmol/L', d: 30 }, { k: 'inr', l: 'INR', u: '', d: 1.5 }, { k: 'c', l: 'Créatinine', u: 'µmol/L', d: 90 }],
      out: v => { const m = 3.78 * Math.log(Math.max(1, v.b / 17.1)) + 11.2 * Math.log(Math.max(1, v.inr)) + 9.57 * Math.log(Math.max(1, v.c / 88.4)) + 6.43; return [{ l: 'MELD', v: Math.round(m), u: '', note: m >= 25 ? 'Très sévère' : m >= 15 ? 'Sévère — évaluation pour transplantation' : 'Modéré' }]; } },
    light: { name: 'Critères de Light', sub: 'Exsudat ou transsudat pleural', inputs: [{ k: 'pp', l: 'Protéines pleurales', u: 'g/L', d: 40 }, { k: 'ps', l: 'Protéines sériques', u: 'g/L', d: 70 }, { k: 'lp', l: 'LDH pleurale', u: 'UI/L', d: 300 }, { k: 'ls', l: 'LDH sérique', u: 'UI/L', d: 250 }, { k: 'ln', l: 'LDH — limite sup. normale', u: 'UI/L', d: 250 }],
      out: v => { const ex = v.pp / v.ps > 0.5 || v.lp / v.ls > 0.6 || v.lp > 2 / 3 * v.ln; return [{ l: 'Rapport protéines', v: r2(v.pp / v.ps), u: '' }, { l: 'Rapport LDH', v: r2(v.lp / v.ls), u: '' }, { l: 'Conclusion', v: ex ? 'Exsudat' : 'Transsudat', u: '' }]; } },
    terme: { name: 'Terme de grossesse', sub: 'Depuis la date des dernières règles (DDR)', inputs: [{ k: 'ddr', l: 'DDR', u: '', d: '', date: true }],
      out: v => { if (!v.ddr) return [{ l: 'Terme', v: '—', u: '' }]; const d0 = new Date(v.ddr + 'T00:00:00'); const days = Math.floor((Date.now() - d0) / 86400000); const dpa = new Date(d0); dpa.setDate(dpa.getDate() + 287); return [{ l: 'Terme aujourd’hui', v: `${Math.floor(days / 7)} SA + ${days % 7} j`, u: '' }, { l: 'Date prévue d’accouchement (41 SA)', v: dpa.toLocaleDateString('fr-FR'), u: '' }]; } }
  };

  /* ---------------- abréviations médicales (dictionnaire) ---------------- */
  const ABBR = {
    ACFA: 'Arythmie complète par fibrillation atriale', AIT: 'Accident ischémique transitoire', AOMI: 'Artériopathie oblitérante des membres inférieurs', AVC: 'Accident vasculaire cérébral', AVK: 'Antivitamine K', BAV: 'Bloc atrio-ventriculaire', BBG: 'Bloc de branche gauche', BBD: 'Bloc de branche droit', BHC: 'Bilan hépatique complet', BOM: 'Biopsie ostéo-médullaire', BPCO: 'Bronchopneumopathie chronique obstructive', BU: 'Bandelette urinaire', CAT: 'Conduite à tenir', CIVD: 'Coagulation intravasculaire disséminée', CPRE: 'Cholangio-pancréatographie rétrograde endoscopique', CRP: 'Protéine C réactive', DFG: 'Débit de filtration glomérulaire', DID: 'Diabète insulino-dépendant', DNID: 'Diabète non insulino-dépendant', DT: 'Delirium tremens', ECBU: 'Examen cytobactériologique des urines', ECG: 'Électrocardiogramme', EEG: 'Électro-encéphalogramme', EFR: 'Explorations fonctionnelles respiratoires', EI: 'Effet indésirable / endocardite infectieuse', EP: 'Embolie pulmonaire', ETT: 'Échographie transthoracique', ETO: 'Échographie transœsophagienne', FA: 'Fibrillation atriale', FC: 'Fréquence cardiaque', FEVG: 'Fraction d’éjection du ventricule gauche', FOGD: 'Fibroscopie œso-gastro-duodénale', FR: 'Fréquence respiratoire', GDS: 'Gaz du sang', GEU: 'Grossesse extra-utérine', HBPM: 'Héparine de bas poids moléculaire', HNF: 'Héparine non fractionnée', HTA: 'Hypertension artérielle', HTAP: 'Hypertension artérielle pulmonaire', HTIC: 'Hypertension intracrânienne', IC: 'Insuffisance cardiaque', IDM: 'Infarctus du myocarde', IEC: 'Inhibiteur de l’enzyme de conversion', IM: 'Intramusculaire', IMC: 'Indice de masse corporelle', INR: 'International Normalized Ratio', IPP: 'Inhibiteur de la pompe à protons', IRA: 'Insuffisance rénale aiguë', IRC: 'Insuffisance rénale chronique', IRM: 'Imagerie par résonance magnétique', IV: 'Intraveineux', IVD: 'Intraveineuse directe', IVL: 'Intraveineuse lente', IVSE: 'Intraveineuse à la seringue électrique', LBA: 'Lavage broncho-alvéolaire', LCR: 'Liquide céphalo-rachidien', LDH: 'Lactate déshydrogénase', MICI: 'Maladie inflammatoire chronique de l’intestin', MTEV: 'Maladie thrombo-embolique veineuse', NFS: 'Numération formule sanguine', OAP: 'Œdème aigu du poumon', OMI: 'Œdèmes des membres inférieurs', OMS: 'Organisation mondiale de la santé', PAC: 'Pneumonie aiguë communautaire', PAS: 'Pression artérielle systolique', PAD: 'Pression artérielle diastolique', PAM: 'Pression artérielle moyenne', PCA: 'Analgésie contrôlée par le patient', PL: 'Ponction lombaire', PO: 'Per os (voie orale)', PSE: 'Pousse-seringue électrique', RAC: 'Rétrécissement aortique calcifié', RCH: 'Rectocolite hémorragique', RCP: 'Réunion de concertation pluridisciplinaire', RGO: 'Reflux gastro-œsophagien', RP: 'Radiographie pulmonaire', SAOS: 'Syndrome d’apnées obstructives du sommeil', SC: 'Sous-cutané / surface corporelle', SCA: 'Syndrome coronarien aigu', SDRA: 'Syndrome de détresse respiratoire aiguë', SEP: 'Sclérose en plaques', SHU: 'Syndrome hémolytique et urémique', SIADH: 'Sécrétion inappropriée d’hormone antidiurétique', SpO2: 'Saturation pulsée en oxygène', TA: 'Tension artérielle / trou anionique', TCA: 'Temps de céphaline activée', TDM: 'Tomodensitométrie (scanner)', TDR: 'Test de diagnostic rapide', TP: 'Taux de prothrombine', TSH: 'Thyréostimuline', TVP: 'Thrombose veineuse profonde', USI: 'Unité de soins intensifs', VIH: 'Virus de l’immunodéficience humaine', VNI: 'Ventilation non invasive', VPP: 'Valeur prédictive positive', VPN: 'Valeur prédictive négative', VS: 'Vitesse de sédimentation', BMR: 'Bactérie multirésistante', BGN: 'Bacille Gram négatif', CGP: 'Cocci Gram positif', SARM: 'Staphylococcus aureus résistant à la méticilline', PNP: 'Pneumopathie', ATB: 'Antibiotique', AINS: 'Anti-inflammatoire non stéroïdien', AAP: 'Antiagrégant plaquettaire', AOD: 'Anticoagulant oral direct', BZD: 'Benzodiazépine', ISRS: 'Inhibiteur sélectif de la recapture de la sérotonine', ROT: 'Réflexes ostéo-tendineux', RCIU: 'Retard de croissance intra-utérin', SA: 'Semaines d’aménorrhée', HRP: 'Hématome rétroplacentaire', HGPO: 'Hyperglycémie provoquée par voie orale', DDR: 'Date des dernières règles', LiSA: 'Livret de suivi d’apprentissage (items du 2e cycle)', EDN: 'Épreuves dématérialisées nationales', ECOS: 'Examen clinique objectif et structuré', SDD: 'Situation de départ', R2C: 'Réforme du 2e cycle', HAS: 'Haute Autorité de santé', ANSM: 'Agence nationale de sécurité du médicament', DCI: 'Dénomination commune internationale', ATC: 'Classification anatomique, thérapeutique et chimique', CIM: 'Classification internationale des maladies', PMSI: 'Programme de médicalisation des systèmes d’information', AMM: 'Autorisation de mise sur le marché', RTU: 'Recommandation temporaire d’utilisation', AVP: 'Accident de la voie publique', TC: 'Traumatisme crânien', ACR: 'Arrêt cardio-respiratoire', RCP2: 'Réanimation cardio-pulmonaire', DAE: 'Défibrillateur automatisé externe', SAMU: 'Service d’aide médicale urgente', SMUR: 'Service mobile d’urgence et de réanimation', VVP: 'Voie veineuse périphérique', VVC: 'Voie veineuse centrale', KTC: 'Cathéter central', SNG: 'Sonde nasogastrique', SU: 'Sonde urinaire', HbA1c: 'Hémoglobine glyquée', GAJ: 'Glycémie à jeun', TG: 'Triglycérides', CT: 'Cholestérol total', PTH: 'Parathormone', ACTH: 'Hormone corticotrope', GH: 'Hormone de croissance', FSH: 'Hormone folliculo-stimulante', LH: 'Hormone lutéinisante', HCG: 'Hormone chorionique gonadotrope', PSA: 'Antigène prostatique spécifique', AFP: 'Alpha-fœtoprotéine', ACE: 'Antigène carcino-embryonnaire', VEMS: 'Volume expiratoire maximal par seconde', CV: 'Capacité vitale', CPT: 'Capacité pulmonaire totale', DLCO: 'Capacité de diffusion du CO', TVO: 'Trouble ventilatoire obstructif', TVR: 'Trouble ventilatoire restrictif', OLD: 'Oxygénothérapie de longue durée', PEP: 'Pression expiratoire positive', VAC: 'Ventilation assistée contrôlée', IOT: 'Intubation oro-trachéale', SOFA: 'Sequential Organ Failure Assessment', IGS: 'Indice de gravité simplifié', NIHSS: 'National Institutes of Health Stroke Scale', MMSE: 'Mini-Mental State Examination', GIR: 'Groupe iso-ressources', EHPAD: 'Établissement d’hébergement pour personnes âgées dépendantes', HAD: 'Hospitalisation à domicile', SSR: 'Soins de suite et de réadaptation', ALD: 'Affection de longue durée', MDPH: 'Maison départementale des personnes handicapées', ROR: 'Rougeole-oreillons-rubéole', DTP: 'Diphtérie-tétanos-poliomyélite', BCG: 'Vaccin bilié de Calmette et Guérin', IDR: 'Intradermoréaction', ITL: 'Infection tuberculeuse latente', BK: 'Bacille de Koch', ECBC: 'Examen cytobactériologique des crachats', PCR: 'Réaction en chaîne par polymérase', IST: 'Infection sexuellement transmissible', TPE: 'Traitement post-exposition', PrEP: 'Prophylaxie pré-exposition', ARV: 'Antirétroviral'
  };

  /* ---------------- notation automatique : ions, molécules, unités, symboles ---------------- */
  /* molécules dont les chiffres passent en indice (liste fermée : « J7 » ou « M3 » restent intacts) */
  const MOLECULES = new Set(['O2', 'H2', 'N2', 'CO2', 'CO', 'H2O', 'H2O2', 'HCO3', 'H2CO3', 'NH3', 'NH4', 'SO4', 'PO4', 'HPO4', 'H2PO4', 'NO3', 'NO2', 'NO', 'HbA1c', 'PaO2', 'PaCO2', 'PvO2', 'SpO2', 'SaO2', 'SvO2', 'FiO2', 'FeO2', 'EtCO2', 'C6H12O6', 'CH4', 'CH3', 'C2H5OH', 'CaCO3', 'CaCl2', 'KCl', 'NaCl', 'NaHCO3', 'MgSO4', 'FEV1', 'T3', 'T4', 'B12', 'B6', 'B1', 'B9', 'D3', 'K1', 'K2', 'H1N1', 'H5N1', 'H3N2', 'IL6', 'IL1', 'IL2', 'TNF', 'PGE2', 'PGI2', 'TXA2', 'LTB4', 'GLP1', 'SGLT2', 'DPP4', 'COX2', 'COX1', 'CYP3A4', 'CYP2D6', 'CYP2C9', 'CYP2C19', 'HLA', 'IgG4', 'PD1', 'PDL1', 'CD4', 'CD8', 'CD20', 'HER2', 'BRCA1', 'BRCA2', 'C3', 'C4', 'CH50', 'AT3', 'HCO3-']);
  const ION_BASES = /^(Na|K|Ca|Mg|Cl|H|HCO3|NH4|PO4|HPO4|SO4|Fe|Cu|Zn|Li|Al|OH|NO3|Mn|Ba|Br|I|F|Ag|Hg|Pb)$/;
  /* « Na+ », « Ca2+ », « HCO3- », « Cl- », « H2O », « PaO2 » → HTML avec indices / exposants, ou null */
  function ionHTML(token) {
    const m = token.match(/^([A-Za-z][A-Za-z0-9]*?)(\d*)(\+\+|--|2\+|2-|3\+|3-|\+|-)?$/);
    if (!m) return null;
    const [, base, digits, charge] = m;
    const molecule = base + digits;
    if (!charge && !MOLECULES.has(molecule)) return null;
    if (charge && !MOLECULES.has(molecule) && !(ION_BASES.test(base) && (!digits || MOLECULES.has(base + digits)))) return null;
    if (charge && !ION_BASES.test(base) && !MOLECULES.has(molecule)) return null;
    // chiffres après des lettres → indice (chaque groupe)
    let html = molecule.replace(/([A-Za-z])(\d+)/g, (_, l, d) => l + '<sub>' + d + '</sub>');
    if (charge) {
      const c = charge === '++' ? '2+' : charge === '--' ? '2−' : charge.replace('-', '−');
      html += '<sup>' + c + '</sup>';
    }
    return html;
  }
  const SYMBOL_MAP = { '<=': '≤', '>=': '≥', '!=': '≠', '~=': '≈', '+/-': '±', 'umol': 'µmol', 'ug': 'µg', 'uL': 'µL', 'ul': 'µL', 'degC': '°C', 'oC': '°C', '1/2': '½', '1/4': '¼', '3/4': '¾' };
  const UNIT_RE = /^(u|µ)?(mol|g|L|l|UI|mmol|mg|kg|mmHg|kPa|ml|mL|dL|dl)(\/(L|l|dL|dl|kg|min|h|j|24h|mL|ml))?$/;

  /* ---------------- symboles insérables par le menu « / » ---------------- */
  const SYMBOLS = [
    ['alpha', 'α'], ['beta', 'β'], ['gamma', 'γ'], ['delta', 'δ'], ['epsilon', 'ε'], ['theta', 'θ'], ['kappa', 'κ'], ['lambda', 'λ'], ['mu', 'μ'], ['pi', 'π'], ['rho', 'ρ'], ['sigma', 'σ'], ['tau', 'τ'], ['phi', 'φ'], ['omega', 'ω'],
    ['Delta', 'Δ'], ['Sigma', 'Σ'], ['Omega', 'Ω'],
    ['augmente', '↑'], ['diminue', '↓'], ['fleche', '→'], ['absent', 'Ø'], ['male', '♂'], ['femelle', '♀'], ['degre', '°'], ['pourmille', '‰'], ['micro', 'µ'], ['superieur', '≥'], ['inferieur', '≤'], ['different', '≠'], ['environ', '≈'], ['plusmoins', '±'], ['fois', '×'], ['infini', '∞'], ['normal', 'N']
  ];

  /* rang de connaissance (R2C) */
  const RANGS = { A: { name: 'Rang A', color: '#2e8b6a' }, B: { name: 'Rang B', color: '#b3762a' } };

  return { HEALTH_KEYS, FICHES, CALLOUTS, SCORES, CALCS, ABBR, MOLECULES, ionHTML, SYMBOL_MAP, UNIT_RE, SYMBOLS, RANGS };
})();
