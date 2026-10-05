/* ============================================================
   Alixo — présentations (diapositives) 1.14
   Une présentation est une séance particulière : { kind: 'slides', slides: [...], theme: { id, accent } }
   (d.blocks reste vide : synchronisation, onglets, bibliothèque et corbeille
   n'ont rien à connaître). Chaque diapositive = { id, bg, notes, els: [...] } ;
   chaque bloc = { id, t, x, y, w, h (en % de la diapositive), html | src | iid… }.

   Les blocs (une trentaine : texte, cours, visuels) se posent sur la diapositive par
   glisser-déposer depuis la palette de droite (ou d'un clic), se déplacent et se
   redimensionnent à la souris ; un clic sur un bloc sélectionné entre en édition.
   Sélection multiple : Maj+clic, rectangle tracé sur le fond, Ctrl+A ; les blocs
   sélectionnés se déplacent, se dupliquent, se colorent et se retirent ensemble.
   Thèmes : jeux de couleurs + polices assorties (bouton « Thème »).

   Raccourcis : F5 présenter (Maj+F5 depuis la diapositive affichée), Ctrl+M
   nouvelle diapositive, Ctrl+D dupliquer, Suppr retirer, flèches déplacer
   (Maj : plus vite) ou changer de diapositive, Ctrl+Z / Ctrl+Y, Ctrl+A tout
   sélectionner, Échap sortir de l'édition, Ctrl+P exporter en PDF (pages 16:9).

   Chargé APRÈS app.js : utilise ses globales (state, doc(), save(), openTabs,
   renderTabs, renderCrumbs, showLibrary, closeTab, cycleTab, CALLOUTS,
   AlixoImages, fileToImage, showPopover, toast, esc, uid, folderTint…).
   ============================================================ */
'use strict';

window.AlixoSlides = (() => {
  const SW = 1280, SH = 720;                    // taille logique d'une diapositive (16:9)
  const HIST_MAX = 80;
  const BGS = [['paper', 'Papier'], ['soft', 'Teinte douce'], ['tint', 'Teinte pleine'], ['dark', 'Sombre']];
  const F_SERIF = '"Iowan Old Style", Palatino, Georgia, "Times New Roman", serif';
  const F_UI = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  /* thèmes : couleur d'accent, papier, encre et polices assorties (piles système, sans téléchargement) */
  const THEMES = [
    { id: 'alixo', name: 'Alixo', sub: 'Teinte du dossier, serif classique', acc: '', paper: '#ffffff', ink: '#202124', ink2: '#5f6368', head: F_SERIF, body: F_UI },
    { id: 'ardoise', name: 'Ardoise', sub: 'Bleu net, sans-serif moderne', acc: '#3d6bb5', paper: '#f4f6f8', ink: '#1f2933', ink2: '#52606d', head: 'Bahnschrift, "Segoe UI Semibold", "Segoe UI", Arial, sans-serif', body: F_UI },
    { id: 'encre', name: 'Encre & or', sub: 'Nuit bleue, titres dorés', acc: '#d1a95a', paper: '#1b1d27', ink: '#f2eee6', ink2: '#b9b3a6', head: 'Georgia, "Times New Roman", serif', body: F_UI, dark: true },
    { id: 'terre', name: 'Terracotta', sub: 'Chaud, tout en serif', acc: '#c2603f', paper: '#fbf5ee', ink: '#3b2a22', ink2: '#7a6555', head: 'Georgia, "Times New Roman", serif', body: 'Georgia, "Times New Roman", serif' },
    { id: 'foret', name: 'Forêt', sub: 'Vert profond, Cambria', acc: '#2f7d68', paper: '#f3f6f2', ink: '#1f2a24', ink2: '#556158', head: 'Cambria, "Book Antiqua", Georgia, serif', body: 'Calibri, Carlito, "Segoe UI", sans-serif' },
    { id: 'ocean', name: 'Océan', sub: 'Bleu marine, très lisible', acc: '#1f6fa8', paper: '#eef5fb', ink: '#10263a', ink2: '#4b6478', head: 'Palatino, "Palatino Linotype", "Book Antiqua", serif', body: 'Verdana, Geneva, sans-serif' },
    { id: 'bonbon', name: 'Bonbon', sub: 'Rose pastel, ludique', acc: '#d86a9a', paper: '#fff7fa', ink: '#3b2a33', ink2: '#7d6570', head: '"Trebuchet MS", "Segoe UI", sans-serif', body: F_UI },
    { id: 'minuit', name: 'Minuit', sub: 'Sombre, accent violet', acc: '#8b7cf6', paper: '#0f1020', ink: '#ececf6', ink2: '#aeb0c9', head: '"Segoe UI Semibold", "Segoe UI", Arial, sans-serif', body: F_UI, dark: true },
    { id: 'sable', name: 'Sable', sub: 'Beige, Garamond', acc: '#b3762a', paper: '#f6efe3', ink: '#2c251c', ink2: '#6b5d4b', head: 'Garamond, "EB Garamond", "Times New Roman", serif', body: 'Georgia, "Times New Roman", serif' },
    { id: 'craie', name: 'Tableau noir', sub: 'Vert ardoise, craie jaune', acc: '#f5d76e', paper: '#223629', ink: '#f7f4e8', ink2: '#c8cbbd', head: '"Trebuchet MS", "Segoe UI", sans-serif', body: F_UI, dark: true },
    { id: 'journal', name: 'Journal', sub: 'Noir et rouge, Times', acc: '#c0392b', paper: '#fbfaf6', ink: '#111111', ink2: '#555555', head: '"Times New Roman", Times, serif', body: 'Georgia, "Times New Roman", serif' },
    { id: 'neon', name: 'Néon', sub: 'Anthracite, vert menthe', acc: '#19d3a2', paper: '#101418', ink: '#e8f6f0', ink2: '#9fb5ad', head: 'Bahnschrift, "Segoe UI Semibold", "Segoe UI", sans-serif', body: F_UI, dark: true }
  ];
  const I = {
    title: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
    subtitle: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h8" opacity=".55"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h9"/></svg>',
    kicker: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="13" height="8" rx="2"/><path d="M6 12h7"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>',
    olist: '<svg viewBox="0 0 24 24"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5.5 5.5 4.5V9M3.8 12.2c.4-.8 2.4-1.2 2.4.2 0 1-2.4 1.8-2.4 2.9h2.7M3.8 17.2h1.6c1.3 0 1.3 1.8 0 1.8h-.7.7c1.4 0 1.4 1.9 0 1.9H3.8"/></svg>',
    checklist: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="6" rx="1.2"/><path d="m4.5 7 1.4 1.4L8.5 5.6M11 7h10M11 17h10"/><rect x="3" y="14" width="6" height="6" rx="1.2"/></svg>',
    quote: '<svg viewBox="0 0 24 24"><path d="M6 11h4v5H7a3 3 0 0 1-3-3c0-3 1-5 4-6M15 11h4v5h-3a3 3 0 0 1-3-3c0-3 1-5 4-6"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></svg>',
    callout: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14"/><path d="M11 10h6M11 14h4"/></svg>',
    definition: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Z"/><path d="M4 21a2 2 0 0 1 2-2h14M9 7h7M9 11h5"/></svg>',
    juris: '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 7l7-2 7 2M3 13l2-6 2 6a2 2 0 0 1-4 0ZM17 13l2-6 2 6a2 2 0 0 1-4 0Z"/></svg>',
    formula: '<svg viewBox="0 0 24 24"><path d="M18 5H6l6 7-6 7h12"/></svg>',
    table: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16M16 4v16"/></svg>',
    stat: '<svg viewBox="0 0 24 24"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>',
    kpis: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="6" height="10" rx="1.5"/><rect x="9" y="7" width="6" height="10" rx="1.5"/><rect x="16" y="7" width="6" height="10" rx="1.5"/></svg>',
    question: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17v.5"/></svg>',
    steps: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/><path d="M7.5 12h2M14.5 12h2"/></svg>',
    compare: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/><path d="M5 8h4M15 8h4"/></svg>',
    agenda: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 4.5v3M4 10.5v3M4 16.5v3" stroke-width="2.4"/></svg>',
    session: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m21 16-5.5-5.5L7 19"/></svg>',
    icon: '<svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L12 16.6l-5.4 3 1.2-6.1-4.5-4.2 6.1-.7Z"/></svg>',
    shape: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="10" height="10" rx="2"/><circle cx="16" cy="16" r="5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M4 12h14M13 7l5 5-5 5"/></svg>',
    divider: '<svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M8 6h8M8 18h8" opacity=".4"/></svg>',
    sticky: '<svg viewBox="0 0 24 24"><path d="M4 4h16v10l-6 6H4Z"/><path d="M14 20v-6h6"/></svg>',
    bubble: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12Z"/></svg>',
    badge: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="8" rx="4"/></svg>',
    progress: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="6" rx="3"/><rect x="3" y="9" width="11" height="6" rx="3" fill="currentColor"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    graph: '<svg viewBox="0 0 24 24"><path d="M3 21V3M3 21h18"/><path d="M6 8c4 0 6 10 12 10M6 18C10 18 12 6 18 6"/></svg>',
    qr: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2v2"/></svg>',
    pagenum: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 16h4"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    dup: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
    center: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
    front: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="11" height="11" rx="2"/><rect x="9" y="9" width="11" height="11" rx="2" fill="var(--surface)"/></svg>',
    back: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2" fill="var(--surface)"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  const tableHTML = (r, c) => '<table>' + Array.from({ length: r }, (_, i) => '<tr>' + Array.from({ length: c }, () => `<td>${i === 0 ? '<b>Titre</b>' : '…'}</td>`).join('') + '</tr>').join('') + '</table>';
  /* la palette : blocs que l'on glisse sur la diapositive, par catégorie */
  const BLOCKS = [
    // --- Texte ---
    { t: 'title', cat: 'texte', name: 'Titre', hint: 'Grand titre', kw: 'titre heading', w: 84, h: 16, make: () => ({ html: 'Titre' }) },
    { t: 'subtitle', cat: 'texte', name: 'Sous-titre', hint: 'Sous-titre ou intertitre', kw: 'sous-titre', w: 70, h: 10, make: () => ({ html: 'Sous-titre' }) },
    { t: 'text', cat: 'texte', name: 'Texte', hint: 'Paragraphe', kw: 'paragraphe', w: 60, h: 24, make: () => ({ html: 'Votre texte…' }) },
    { t: 'kicker', cat: 'texte', name: 'Étiquette', hint: 'Petit surtitre en capitales', kw: 'label surtitre chapitre', w: 30, h: 7, make: () => ({ html: 'Chapitre 1' }) },
    { t: 'list', cat: 'texte', name: 'Liste', hint: 'Points clés à puces', kw: 'puces bullet', w: 60, h: 34, make: () => ({ html: '<ul><li>Premier point</li><li>Deuxième point</li><li>Troisième point</li></ul>' }) },
    { t: 'olist', cat: 'texte', name: 'Liste numérotée', hint: 'Étapes 1, 2, 3', kw: 'numeros ordre', w: 60, h: 34, make: () => ({ html: '<ol><li>Première étape</li><li>Deuxième étape</li><li>Troisième étape</li></ol>' }) },
    { t: 'checklist', cat: 'texte', name: 'Cases à cocher', hint: 'Objectifs, prérequis', kw: 'todo objectifs coche', w: 50, h: 30, make: () => ({ html: '<ul><li>Objectif 1</li><li>Objectif 2</li><li>Objectif 3</li></ul>' }) },
    { t: 'quote', cat: 'texte', name: 'Citation', hint: 'Citation et auteur', kw: 'auteur', w: 60, h: 22, make: () => ({ html: '« La loi est l’expression de la volonté générale. »', cite: 'Art. 6, DDHC' }) },
    { t: 'code', cat: 'texte', name: 'Code', hint: 'Bloc à chasse fixe', kw: 'monospace programme', w: 50, h: 24, make: () => ({ html: 'x = (a + b) / 2' }) },
    // --- Cours ---
    { t: 'callout', cat: 'cours', name: 'Encadré', hint: 'Définition, À retenir, Exemple…', kw: 'definition retenir exemple arret', w: 60, h: 24, make: () => ({ ct: 'definition', html: 'Contenu de l’encadré…' }) },
    { t: 'definition', cat: 'cours', name: 'Terme et définition', hint: 'Mot en gras, définition à côté', kw: 'vocabulaire notion', w: 60, h: 18, make: () => ({ term: 'Notion', html: 'Sa définition en une phrase.' }) },
    { t: 'juris', cat: 'cours', name: 'Fiche d’arrêt', hint: 'Faits, problème, solution, portée', kw: 'droit jurisprudence arret cassation', w: 84, h: 52, make: () => ({ ref: 'Cass. civ. 1re, 12 juill. 2023, n° 22-14.081', faits: 'Les faits…', probleme: 'La question posée…', solution: 'La réponse de la Cour…', portee: 'Ce qu’il faut en retenir…' }) },
    { t: 'formula', cat: 'cours', name: 'Formule', hint: 'Notation Alixo (x^2, sum_(i=1)^n…)', kw: 'maths equation', w: 44, h: 18, make: () => ({ src: 'E = m c^2' }) },
    { t: 'table', cat: 'cours', name: 'Tableau', hint: '3 × 3, Tab de case en case', kw: 'grille', w: 64, h: 32, make: () => ({ html: tableHTML(3, 3) }) },
    { t: 'stat', cat: 'cours', name: 'Chiffre clé', hint: 'Grand nombre et légende', kw: 'pourcentage kpi', w: 28, h: 26, make: () => ({ num: '42 %', html: 'des étudiants…' }) },
    { t: 'kpis', cat: 'cours', name: 'Trois chiffres', hint: 'Rangée de trois indicateurs', kw: 'kpi statistiques', w: 84, h: 26, make: () => ({ n1: '12', l1: 'séances', n2: '3 h', l2: 'de révision', n3: '98 %', l3: 'de réussite' }) },
    { t: 'question', cat: 'cours', name: 'Question à choix', hint: 'QCM : question et quatre réponses', kw: 'quiz qcm', w: 70, h: 44, make: () => ({ q: 'Quelle est la bonne réponse ?', a1: 'Réponse A', a2: 'Réponse B', a3: 'Réponse C', a4: 'Réponse D', ans: 0 }) },
    { t: 'steps', cat: 'cours', name: 'Étapes / frise', hint: 'Quatre étapes reliées', kw: 'timeline chronologie processus', w: 84, h: 22, make: () => ({ s1: 'Étape 1', s2: 'Étape 2', s3: 'Étape 3', s4: 'Étape 4' }) },
    { t: 'compare', cat: 'cours', name: 'Comparaison', hint: 'Deux colonnes face à face', kw: 'versus avantages inconvenients', w: 84, h: 40, make: () => ({ lt: 'Avant', lh: '<ul><li>Point</li><li>Point</li></ul>', rt: 'Après', rh: '<ul><li>Point</li><li>Point</li></ul>' }) },
    { t: 'agenda', cat: 'cours', name: 'Plan / sommaire', hint: 'Parties numérotées en grand', kw: 'sommaire plan parties', w: 60, h: 40, make: () => ({ html: '<ol><li>Introduction</li><li>Première partie</li><li>Seconde partie</li><li>Conclusion</li></ol>' }) },
    { t: 'session', cat: 'cours', name: 'Infos de séance', hint: 'Date, professeur, lieu', kw: 'date prof lieu', w: 40, h: 16, make: () => ({ html: `${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · Amphi A` }) },
    // --- Visuel ---
    { t: 'image', cat: 'visuel', name: 'Image', hint: 'Photo, schéma, capture', kw: 'photo', w: 40, h: 45, make: () => ({ iid: '' }) },
    { t: 'icon', cat: 'visuel', name: 'Icône', hint: 'Une icône Alixo, colorée', kw: 'pictogramme symbole', w: 12, h: 20, make: () => ({ icon: 'lightbulb' }) },
    { t: 'shape', cat: 'visuel', name: 'Forme', hint: 'Rectangle, pastille, cercle, losange', kw: 'rectangle cercle fond', w: 30, h: 22, make: () => ({ shape: 'rect', html: '' }) },
    { t: 'arrow', cat: 'visuel', name: 'Flèche', hint: 'Flèche pleine, orientable', kw: 'fleche direction', w: 20, h: 8, make: () => ({ dir: 'right' }) },
    { t: 'divider', cat: 'visuel', name: 'Séparateur', hint: 'Ligne fine', kw: 'ligne trait', w: 60, h: 4, make: () => ({}) },
    { t: 'sticky', cat: 'visuel', name: 'Post-it', hint: 'Note collée, légèrement penchée', kw: 'note memo', w: 24, h: 26, make: () => ({ html: 'À ne pas oublier !' }) },
    { t: 'bubble', cat: 'visuel', name: 'Bulle', hint: 'Bulle de dialogue', kw: 'dialogue parole', w: 34, h: 18, make: () => ({ html: 'Et si on en parlait ?' }) },
    { t: 'badge', cat: 'visuel', name: 'Badge', hint: 'Pastille de texte colorée', kw: 'tag etiquette', w: 18, h: 7, make: () => ({ html: 'Important' }) },
    { t: 'progress', cat: 'visuel', name: 'Barre de progression', hint: 'Pourcentage et légende', kw: 'jauge avancement', w: 40, h: 12, make: () => ({ pct: 65, html: 'Avancement du programme' }) },
    { t: 'chart', cat: 'visuel', name: 'Graphique de données', hint: 'Barres, courbes, secteurs…', kw: 'donnees barres courbe camembert', w: 50, h: 44, make: () => ({ chart: window.AlixoCharts ? AlixoCharts.defaults() : null }) },
    { t: 'graph', cat: 'visuel', name: 'Graphique économique', hint: 'Offre / demande, IS-LM, fonctions…', kw: 'economie courbes offre demande', w: 46, h: 46, make: () => ({ gtype: 'plot', params: { f1: '80 - 0.8x', f2: '10 + 0.7x' } }) },
    { t: 'qr', cat: 'visuel', name: 'Lien + QR code', hint: 'Adresse web et son QR code', kw: 'url lien site', w: 30, h: 30, make: () => ({ url: 'https://www.legifrance.gouv.fr', html: 'Légifrance' }) },
    { t: 'pagenum', cat: 'visuel', name: 'Numéro de page', hint: 'n / N, en pied de diapositive', kw: 'pied page numero', w: 14, h: 6, make: () => ({}) }
  ];
  const CATS = [['texte', 'Texte'], ['cours', 'Cours'], ['visuel', 'Visuel']];
  const TEXT_BLOCKS = ['title', 'subtitle', 'text', 'kicker', 'list', 'olist', 'checklist', 'quote', 'code', 'callout', 'definition', 'juris', 'stat', 'kpis', 'question', 'steps', 'compare', 'agenda', 'session', 'table', 'sticky', 'bubble', 'badge', 'progress', 'qr', 'shape'];
  const LAYOUTS = [
    ['title', 'Diapositive de titre'], ['content', 'Titre et texte'], ['bullets', 'Titre et liste'], ['two', 'Deux colonnes'],
    ['section', 'Section (fond teinté)'], ['stats', 'Chiffres clés'], ['plan', 'Plan du cours'], ['blank', 'Vide']
  ];
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<i class="sl-h" data-h="${h}"></i>`).join('') + '<i class="sl-grip" title="Déplacer"></i>';

  let curSlide = null;         // id de la diapositive affichée
  let selSet = new Set();      // ids des blocs sélectionnés
  let scale = 1;
  let hist = { undo: [], redo: [], typingTs: 0, typingEl: null };
  let drag = null;             // { kind: 'move'|'resize'|'marquee', ... }
  let saveTm = null, thumbTm = null;
  let present = null;          // { i } quand le mode présentation est actif
  let bound = false, ro = null;
  let previewRaf = 0;
  let palCat = 'texte', palQuery = '';
  let renderCtx = { i: 0, n: 1 };

  /* ---------------- accès au modèle ---------------- */
  const d = () => (typeof doc === 'function' ? doc() : null);
  const slides = dd => { if (!Array.isArray(dd.slides)) dd.slides = []; return dd.slides; };
  const slide = () => { const dd = d(); if (!dd) return null; return slides(dd).find(s => s.id === curSlide) || null; };
  const el = id => { const s = slide(); return s ? (s.els || []).find(e => e.id === id) : null; };
  const sel = () => (selSet.size ? [...selSet][0] : null);
  const selEls = () => [...selSet].map(el).filter(Boolean);
  const themeOf = dd => THEMES.find(t => t.id === ((dd && dd.theme && dd.theme.id) || 'alixo')) || THEMES[0];
  const accent = dd => (dd && dd.theme && dd.theme.accent) || themeOf(dd).acc || folderTint(dd ? dd.folderId : null) || '#33658a';
  const round1 = v => Math.round(v * 10) / 10;

  function newSlide(layout, dd) {
    const s = { id: uid(), bg: layout === 'section' ? 'tint' : 'paper', notes: '', els: [] };
    const add = (t, x, y, w, h, extra) => { const b = BLOCKS.find(b => b.t === t); s.els.push(Object.assign({ id: uid(), t, x, y, w, h }, b ? b.make() : {}, extra || {})); };
    const n = dd ? slides(dd).length + 1 : 1;
    if (layout === 'title') { add('title', 8, 30, 84, 20, { html: dd && dd.titre ? esc(dd.titre) : 'Titre de la présentation', al: 'center', fs: 1.25 }); add('text', 18, 54, 64, 12, { html: 'Sous-titre, cours, date', al: 'center' }); add('divider', 42, 51, 16, 2); }
    else if (layout === 'content') { add('title', 6, 7, 88, 14, { html: `Titre ${n}` }); add('text', 6, 25, 88, 62, { html: 'Votre texte…' }); }
    else if (layout === 'bullets') { add('title', 6, 7, 88, 14, { html: `Titre ${n}` }); add('list', 6, 25, 88, 62); }
    else if (layout === 'two') { add('title', 6, 7, 88, 14, { html: `Titre ${n}` }); add('text', 6, 25, 42, 62, { html: 'Colonne de gauche…' }); add('text', 52, 25, 42, 62, { html: 'Colonne de droite…' }); }
    else if (layout === 'section') { add('kicker', 8, 30, 30, 7, { html: `Partie ${n}` }); add('title', 8, 38, 84, 20, { html: 'Titre de la partie', al: 'left', fs: 1.3 }); add('text', 8, 60, 60, 10, { html: 'Ce que nous allons voir' }); }
    else if (layout === 'stats') { add('title', 6, 7, 88, 14, { html: 'En chiffres' }); add('kpis', 6, 32, 88, 34); }
    else if (layout === 'plan') { add('title', 6, 7, 88, 14, { html: 'Plan' }); add('agenda', 6, 25, 60, 62); add('shape', 70, 25, 24, 62, { shape: 'rect', html: '' }); }
    return s;
  }
  function newDoc(fid, prof) {
    const dd = { id: uid(), kind: 'slides', folderId: fid || null, titre: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, prof: prof || '', blocks: [], theme: { id: 'alixo', accent: '' }, slides: [] };
    dd.slides.push(newSlide('title', dd));
    return dd;
  }

  /* ---------------- rendu d'une diapositive (édition, vignette, présentation, PDF) ---------------- */
  const iconSvg = name => (window.AlixoIcons ? AlixoIcons.svg(name) : '');
  function qrSvg(url) {
    try {
      const q = qrcode(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount();
      let p = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
      return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${p}" fill="currentColor"/></svg>`;
    } catch { return '<span class="sl-ph">QR</span>'; }
  }
  function elHTML(e, edit) {
    const st = `left:${e.x}%;top:${e.y}%;width:${e.w}%;height:${e.h}%;${e.fs ? `--fs:${e.fs};` : ''}${e.al ? `text-align:${e.al};` : ''}${e.color ? `--elc:${e.color};` : ''}${e.z ? `z-index:${e.z};` : ''}`;
    const ce = edit ? ' contenteditable="true" spellcheck="true"' : '';
    const T = (f, cls) => `<div class="sl-text${cls ? ' ' + cls : ''}"${ce}${f === 'html' ? '' : ` data-f="${f}"`}>${e[f] || ''}</div>`;
    let inner = '', cls = '';
    switch (e.t) {
      case 'title': case 'subtitle': case 'text': case 'kicker': case 'list': case 'olist': case 'checklist': case 'agenda': case 'code': case 'session': inner = T('html'); break;
      case 'callout': { const c = (typeof CALLOUTS === 'object' && CALLOUTS[e.ct]) || { name: 'Encadré', ico: 'book-open' }; cls = ' ct-' + (e.ct || 'definition'); inner = `<div class="sl-ctitle">${iconSvg(c.ico)}<span>${esc(c.name)}</span></div>${T('html')}`; break; }
      case 'definition': inner = `${T('term', 'sl-term')}${T('html', 'sl-def')}`; break;
      case 'juris': inner = `<div class="sl-jhead">${iconSvg('scale')}${T('ref', 'sl-jref')}</div><div class="sl-jgrid">${[['faits', 'Faits'], ['probleme', 'Problème'], ['solution', 'Solution'], ['portee', 'Portée']].map(([f, l]) => `<div class="sl-jcell"><b>${l}</b>${T(f)}</div>`).join('')}</div>`; break;
      case 'quote': inner = `${T('html', 'sl-q')}${T('cite', 'sl-cite')}`; break;
      case 'image': { const src = e.iid && AlixoImages.cache.get(e.iid); inner = src ? `<img src="${src}" draggable="false" alt="">` : `<div class="sl-imgph">${I.image}<span>${edit ? 'Double-clic : choisir une image (ou glissez-en une ici)' : ''}</span></div>`; break; }
      case 'icon': inner = `<div class="sl-icon">${iconSvg(e.icon || 'star')}</div>`; break;
      case 'formula': inner = `<div class="sl-formula">${(window.AlixoMath && AlixoMath.render(e.src || '')) || '<span class="sl-ph">Formule</span>'}</div>`; break;
      case 'table': inner = T('html', 'sl-tbl'); break;
      case 'stat': inner = `${T('num', 'sl-num')}${T('html', 'sl-lab')}`; break;
      case 'kpis': inner = [1, 2, 3].map(i => `<div class="sl-kpi">${T('n' + i, 'sl-num')}${T('l' + i, 'sl-lab')}</div>`).join(''); break;
      case 'question': inner = `${T('q', 'sl-qq')}<div class="sl-answers">${[1, 2, 3, 4].map(i => `<div class="sl-ans ${e.ans === i - 1 ? 'ok' : ''}"><span class="sl-ansl" data-ans="${i - 1}" title="${edit ? 'Cliquer : marquer comme bonne réponse' : ''}">${String.fromCharCode(64 + i)}</span>${T('a' + i)}</div>`).join('')}</div>`; break;
      case 'steps': inner = `<div class="sl-steps">${[1, 2, 3, 4].map(i => `<div class="sl-step"><span class="sl-stepn">${i}</span>${T('s' + i)}</div>`).join('')}</div>`; break;
      case 'compare': inner = `<div class="sl-col">${T('lt', 'sl-colt')}${T('lh', 'sl-colb')}</div><div class="sl-col">${T('rt', 'sl-colt')}${T('rh', 'sl-colb')}</div>`; break;
      case 'shape': cls = ' sh-' + (e.shape || 'rect'); inner = `<div class="sl-shape"></div>${T('html', 'sl-shlabel')}`; break;
      case 'arrow': cls = ' dir-' + (e.dir || 'right'); inner = `<svg class="sl-arrow" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M0 12h70V0l30 20-30 20V28H0Z" fill="currentColor"/></svg>`; break;
      case 'divider': inner = '<div class="sl-divider"></div>'; break;
      case 'sticky': case 'bubble': case 'badge': inner = T('html'); break;
      case 'progress': { const p = Math.max(0, Math.min(100, +e.pct || 0)); inner = `<div class="sl-prog"><div class="sl-progbar" style="width:${p}%"></div></div><div class="sl-progrow">${T('html', 'sl-lab')}<span class="sl-progpct">${p} %</span></div>`; break; }
      case 'chart': inner = `<div class="sl-chart">${e.chart && window.AlixoCharts ? AlixoCharts.svg(e.chart) : '<span class="sl-ph">Graphique</span>'}</div>`; break;
      case 'graph': inner = `<div class="sl-chart">${window.AlixoGraphs ? AlixoGraphs.renderSVG(e.gtype || 'plot', e.params || {}) : '<span class="sl-ph">Graphique</span>'}</div>`; break;
      case 'qr': inner = `<div class="sl-qr">${qrSvg(e.url || '')}</div>${T('html', 'sl-lab')}`; break;
      case 'pagenum': inner = `<div class="sl-pagenum">${renderCtx.i + 1} / ${renderCtx.n}</div>`; break;
    }
    return `<div class="sl-el t-${e.t}${cls}${edit && selSet.has(e.id) ? ' sel' : ''}" data-id="${e.id}" style="${st}">${inner}${edit ? HANDLES : ''}</div>`;
  }
  function slideHTML(s, dd, edit, idx) {
    const th = themeOf(dd);
    const list = slides(dd);
    renderCtx = { i: idx === undefined ? Math.max(0, list.indexOf(s)) : idx, n: list.length };
    const vars = `--acc:${accent(dd)};--sl-paper:${th.paper};--sl-ink:${th.ink};--sl-ink2:${th.ink2};--font-head:${th.head};--font-body:${th.body}`;
    return `<div class="sl-slide bg-${s.bg || 'paper'}${th.dark ? ' th-dark' : ''}" data-sid="${s.id}" style="${vars}">${(s.els || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0)).map(e => elHTML(e, edit)).join('')}</div>`;
  }

  /* ---------------- historique (Ctrl+Z / Ctrl+Y) ---------------- */
  function pushHist(opts) {
    const dd = d(); if (!dd) return;
    const now = Date.now();
    const typing = opts && opts.typing;
    if (typing && hist.typingEl === opts.el && now - hist.typingTs < 1200) { hist.typingTs = now; return; }
    hist.undo.push(JSON.stringify(slides(dd)));
    if (hist.undo.length > HIST_MAX) hist.undo.shift();
    hist.redo.length = 0;
    hist.typingTs = typing ? now : 0; hist.typingEl = typing ? opts.el : null;
  }
  function undo() { const dd = d(); if (!dd || !hist.undo.length) return false; hist.redo.push(JSON.stringify(slides(dd))); dd.slides = JSON.parse(hist.undo.pop()); hist.typingTs = 0; afterRestore(dd); return true; }
  function redo() { const dd = d(); if (!dd || !hist.redo.length) return false; hist.undo.push(JSON.stringify(slides(dd))); dd.slides = JSON.parse(hist.redo.pop()); hist.typingTs = 0; afterRestore(dd); return true; }
  function afterRestore(dd) { if (!slides(dd).some(s => s.id === curSlide)) curSlide = slides(dd)[0] && slides(dd)[0].id; selSet.clear(); commit(); renderAll(); }

  /* ---------------- enregistrement ---------------- */
  function commit() { const dd = d(); if (!dd || readOnly) return; dd.updatedAt = Date.now(); save(); scheduleThumbs(); }
  /* version reçue d'un autre membre pendant que la présentation est ouverte : on rafraîchit, sans couper une saisie en cours */
  let remoteTm = null;
  function remoteChanged() {
    if (!document.body.classList.contains('mode-slides')) return;
    const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#sl-canvas');
    clearTimeout(remoteTm);
    if (editing || drag) { remoteTm = setTimeout(remoteChanged, 2500); return; }
    refresh();
  }
  function commitSoon() { clearTimeout(saveTm); saveTm = setTimeout(commit, 400); }
  function scheduleThumbs() { clearTimeout(thumbTm); thumbTm = setTimeout(renderStrip, 250); }

  /* ---------------- ouverture / fermeture ---------------- */
  async function open(id) {
    const dd = findDoc(id); if (!dd) return;
    if (currentDocId && currentDocId !== id && typeof rememberScroll === 'function') rememberScroll();
    if (typeof hidePopover === 'function') hidePopover();
    if (typeof closeCtxMenu === 'function') closeCtxMenu();
    currentDocId = id;
    const shared = typeof isSharedDoc === 'function' && isSharedDoc(id);
    readOnly = !!(shared && !(window.AlixoShare && AlixoShare.canWrite(id)));
    document.body.classList.toggle('readonly', readOnly);
    if (shared && window.AlixoShare && AlixoShare.noteOpened) AlixoShare.noteOpened(id);
    if (!slides(dd).length) { if (readOnly) slides(dd).push({ id: 's0', bg: 'paper', notes: '', els: [] }); else slides(dd).push(newSlide('title', dd)); }
    if (!slides(dd).some(s => s.id === curSlide)) curSlide = slides(dd)[0].id;
    selSet.clear(); hist = { undo: [], redo: [], typingTs: 0, typingEl: null };
    document.body.classList.remove('mode-editor');
    document.body.classList.add('mode-slides');
    $('#view-library').style.display = 'none';
    $('#view-editor').hidden = true;
    $('#toolbar').hidden = true;
    $('#view-slides').hidden = false;
    document.documentElement.style.setProperty('--tint', folderTint(dd.folderId));
    if (typeof setSaveStatus === 'function') setSaveStatus('saved');
    if (!openTabs.includes(id)) openTabs.push(id);
    renderTabs(); renderCrumbs();
    if (typeof renderAccess === 'function') renderAccess();
    if (shared && window.AlixoShare) AlixoShare.setPresence(id, null);
    bind();
    const iids = [];
    for (const s of slides(dd)) for (const e of s.els || []) if (e.t === 'image' && e.iid && !AlixoImages.cache.has(e.iid)) iids.push(e.iid);
    if (iids.length) { renderAll(); await Promise.all(iids.map(i => AlixoImages.get(i).catch(() => null))); if (currentDocId !== id) return; }
    renderAll();
  }
  function leave() {
    if (!document.body.classList.contains('mode-slides')) return;
    clearTimeout(saveTm); saveTm = null;
    syncAllText();
    closePresent();
    document.body.classList.remove('mode-slides');
    $('#view-slides').hidden = true;
    selSet.clear(); drag = null;
  }
  function refresh() { if (document.body.classList.contains('mode-slides')) { const dd = d(); if (dd && !slides(dd).some(s => s.id === curSlide)) curSlide = slides(dd)[0] && slides(dd)[0].id; renderAll(); } }

  /* ---------------- rendu global ---------------- */
  function renderAll() { renderBar(); renderStrip(); renderCanvas(); renderSide(); fit(); }
  function renderCanvas() {
    const dd = d(), s = slide(); const c = $('#sl-canvas'); if (!dd || !s || !c) return;
    c.innerHTML = slideHTML(s, dd, !readOnly);
    fit();
  }
  function fit() {
    const st = $('#sl-stage'), c = $('#sl-canvas'); if (!st || !c) return;
    const r = st.getBoundingClientRect();
    scale = Math.max(0.1, Math.min((r.width - 56) / SW, (r.height - 56) / SH));
    c.style.transform = `scale(${scale})`;
    c.style.marginLeft = Math.max(28, (r.width - SW * scale) / 2) + 'px';
    c.style.marginTop = Math.max(28, (r.height - SH * scale) / 2) + 'px';
  }
  function renderStrip() {
    const dd = d(); const strip = $('#sl-strip'); if (!dd || !strip) return;
    strip.innerHTML = slides(dd).map((s, i) => `<div class="sl-thumb ${s.id === curSlide ? 'on' : ''}" data-sid="${s.id}" draggable="true" title="Diapositive ${i + 1} — glisser pour réordonner">
        <span class="sl-tnum">${i + 1}</span>
        <div class="sl-tbox"><div class="sl-tin">${slideHTML(s, dd, false, i)}</div></div>
      </div>`).join('') + `<button class="sl-tadd" type="button" data-sl="add" title="Nouvelle diapositive (Ctrl+M)">${I.plus}<span>Diapositive</span></button>`;
    fitThumbs();
    const on = strip.querySelector('.sl-thumb.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }
  /* la vignette s'adapte à la largeur réelle du volet (elle était rognée à droite) */
  function fitThumbs() {
    $$('#sl-strip .sl-tbox').forEach(b => { const w = b.clientWidth; if (!w) return; const k = w / SW; b.style.height = Math.round(SH * k) + 'px'; const inn = b.querySelector('.sl-tin'); if (inn) inn.style.transform = `scale(${k})`; });
  }
  function renderBar() {
    const dd = d(), s = slide(); const bar = $('#sl-bar'); if (!dd || !s || !bar) return;
    if (readOnly) {
      const info = window.AlixoShare && AlixoShare.infoFor ? AlixoShare.infoFor(dd.id) : null;
      const n = slides(dd).length, idx = slides(dd).findIndex(x => x.id === curSlide) + 1;
      bar.innerHTML = `<div class="sl-barl"><button data-sl="present" class="cta small" title="Présenter (F5)">${I.play} Présenter</button><span class="sl-sep"></span><span class="sl-barlabel">Diapositive ${idx} / ${n}</span><span class="sl-ro">Partagée par <b>${esc(info ? info.owner : 'un membre')}</b> · lecture seule</span></div><div class="sl-barr"><button data-sl="info" class="cta ghost small">Détails</button></div>`;
      return;
    }
    const els = selEls(); const e = els.length === 1 ? els[0] : null;
    const n = slides(dd).length, idx = slides(dd).findIndex(x => x.id === curSlide) + 1;
    let tools = '';
    if (els.length > 1) {
      tools = `<span class="sl-sep"></span><span class="sl-barlabel">${els.length} blocs</span>
        <button data-sl="fs-" title="Texte plus petit">A−</button><button data-sl="fs+" title="Texte plus grand">A+</button>
        <button data-sl="al" data-al="left" title="À gauche">${I.left}</button><button data-sl="al" data-al="center" title="Centré">${I.center}</button><button data-sl="al" data-al="right" title="À droite">${I.right}</button>
        <button data-sl="color" title="Couleur des blocs"><span class="sl-swatch" style="background:${accent(dd)}"></span></button>
        <button data-sl="front" title="Passer devant">${I.front}</button><button data-sl="back" title="Passer derrière">${I.back}</button>
        <button data-sl="dupel" title="Dupliquer (Ctrl+D)">${I.dup}</button><button data-sl="delel" class="danger" title="Retirer (Suppr)">${I.trash}</button>`;
    } else if (e) {
      const txt = TEXT_BLOCKS.includes(e.t);
      tools = `<span class="sl-sep"></span><span class="sl-barlabel">${esc((BLOCKS.find(b => b.t === e.t) || {}).name || 'Bloc')}</span>`;
      if (txt) tools += `<button data-sl="fs-" title="Texte plus petit">A−</button><button data-sl="fs+" title="Texte plus grand">A+</button>
        <button data-sl="cmd" data-cmd="bold" title="Gras (Ctrl+B)"><b>G</b></button><button data-sl="cmd" data-cmd="italic" title="Italique (Ctrl+I)"><i>I</i></button><button data-sl="cmd" data-cmd="underline" title="Souligné (Ctrl+U)"><u>S</u></button>
        <button data-sl="al" data-al="left" class="${!e.al || e.al === 'left' ? 'on' : ''}" title="À gauche">${I.left}</button><button data-sl="al" data-al="center" class="${e.al === 'center' ? 'on' : ''}" title="Centré">${I.center}</button><button data-sl="al" data-al="right" class="${e.al === 'right' ? 'on' : ''}" title="À droite">${I.right}</button>`;
      if (e.t === 'callout') tools += `<select data-sl="ct" title="Type d’encadré">${Object.entries(CALLOUTS).filter(([k, c]) => typeof specAllowed !== 'function' || specAllowed(c.spec)).map(([k, c]) => `<option value="${k}" ${e.ct === k ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
      if (e.t === 'shape') tools += `<select data-sl="shape" title="Forme">${[['rect', 'Rectangle'], ['pill', 'Pastille'], ['circle', 'Cercle'], ['outline', 'Cadre'], ['diamond', 'Losange'], ['tri', 'Triangle']].map(([k, l]) => `<option value="${k}" ${(e.shape || 'rect') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      if (e.t === 'arrow') tools += `<select data-sl="dir" title="Direction">${[['right', '→ Droite'], ['left', '← Gauche'], ['down', '↓ Bas'], ['up', '↑ Haut']].map(([k, l]) => `<option value="${k}" ${(e.dir || 'right') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      if (e.t === 'progress') tools += `<label class="sl-inl">Valeur <input type="range" data-sl="pct" min="0" max="100" value="${+e.pct || 0}"></label>`;
      if (e.t === 'formula') tools += `<button data-sl="formula" class="sl-txtbtn">Modifier la formule…</button>`;
      if (e.t === 'image') tools += `<button data-sl="img" class="sl-txtbtn">${e.iid ? 'Remplacer l’image…' : 'Choisir une image…'}</button>`;
      if (e.t === 'icon') tools += `<button data-sl="icon" class="sl-txtbtn">Changer d’icône…</button>`;
      if (e.t === 'chart') tools += `<button data-sl="chart" class="sl-txtbtn">Données et type…</button>`;
      if (e.t === 'graph') tools += `<button data-sl="graph" class="sl-txtbtn">Choisir le graphique…</button>`;
      if (e.t === 'qr') tools += `<button data-sl="url" class="sl-txtbtn">Adresse du lien…</button>`;
      if (e.t === 'table') tools += `<button data-sl="row+" class="sl-txtbtn" title="Ajouter une ligne">＋ ligne</button><button data-sl="col+" class="sl-txtbtn" title="Ajouter une colonne">＋ colonne</button>`;
      tools += `<button data-sl="color" title="Couleur du bloc"><span class="sl-swatch" style="background:${e.color || accent(dd)}"></span></button>
        <button data-sl="front" title="Passer devant">${I.front}</button><button data-sl="back" title="Passer derrière">${I.back}</button>
        <button data-sl="dupel" title="Dupliquer le bloc (Ctrl+D)">${I.dup}</button><button data-sl="delel" class="danger" title="Retirer le bloc (Suppr)">${I.trash}</button>`;
    } else {
      tools = `<span class="sl-sep"></span><span class="sl-barlabel">Diapositive ${idx} / ${n}</span>
        <select data-sl="bg" title="Fond de la diapositive">${BGS.map(([k, l]) => `<option value="${k}" ${(s.bg || 'paper') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button data-sl="theme" title="Thème : couleurs et polices de la présentation">${I.palette} ${esc(themeOf(dd).name)}</button>
        <button data-sl="accent" title="Couleur d’accent de la présentation"><span class="sl-swatch" style="background:${accent(dd)}"></span> Accent</button>
        <button data-sl="dup" title="Dupliquer la diapositive">${I.dup}</button><button data-sl="del" class="danger" title="Supprimer la diapositive" ${n <= 1 ? 'disabled' : ''}>${I.trash}</button>`;
    }
    bar.innerHTML = `<div class="sl-barl">
        <button data-sl="add" class="cta small" title="Nouvelle diapositive (Ctrl+M)">${I.plus} Diapositive</button>
        <button data-sl="present" class="cta ghost small" title="Présenter depuis le début (F5)">${I.play} Présenter</button>
        ${tools}
      </div>
      <div class="sl-barr">
        <button data-sl="undo" title="Annuler (Ctrl+Z)" ${hist.undo.length ? '' : 'disabled'}>${I.undo}</button>
        <button data-sl="redo" title="Rétablir (Ctrl+Y)" ${hist.redo.length ? '' : 'disabled'}>${I.redo}</button>
      </div>`;
  }
  function paletteHTML() {
    const q = palQuery.trim().toLowerCase();
    const items = BLOCKS.filter(b => q ? (b.name + ' ' + b.hint + ' ' + (b.kw || '')).toLowerCase().includes(q) : b.cat === palCat);
    return items.map(b => `<button class="sl-pitem" type="button" draggable="true" data-pt="${b.t}" title="${esc(b.hint)} — glisser sur la diapositive, ou cliquer">${I[b.t] || I.shape}<span><b>${b.name}</b><small>${esc(b.hint)}</small></span></button>`).join('') || '<div class="sl-palempty">Aucun bloc ne correspond.</div>';
  }
  function renderSide() {
    const s = slide(); const side = $('#sl-side'); if (!side) return;
    if (!side.dataset.built) {
      side.innerHTML = `<div class="sl-sidehead">Blocs<span>glissez-les sur la diapositive</span></div>
        <div class="sl-palsearch"><input id="sl-palq" placeholder="Rechercher un bloc…" autocomplete="off" spellcheck="false"></div>
        <div class="sl-paltabs">${CATS.map(([k, l]) => `<button type="button" data-cat="${k}" class="${k === palCat ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="sl-pal" id="sl-pal">${paletteHTML()}</div>
        <div class="sl-sidehead">Notes<span>pour vous, pendant la présentation</span></div>
        <textarea id="sl-notes" placeholder="Ce que vous voulez dire sur cette diapositive…"></textarea>`;
      side.dataset.built = '1';
    }
    const ta = side.querySelector('#sl-notes'); if (ta && s) ta.value = s.notes || '';
  }

  /* ---------------- diapositives ---------------- */
  function addSlide(layout, after) {
    const dd = d(); if (!dd) return;
    pushHist();
    const s = newSlide(layout || 'content', dd);
    const i = after === undefined ? slides(dd).findIndex(x => x.id === curSlide) : after;
    slides(dd).splice(i + 1, 0, s);
    curSlide = s.id; selSet.clear();
    commit(); renderAll();
    const first = (s.els || [])[0]; if (first) setTimeout(() => select(first.id, true), 40);
  }
  function openLayoutMenu(anchor) {
    const r = anchor ? anchor.getBoundingClientRect() : centerRect();
    showPopover(`<h4>Nouvelle diapositive</h4><div class="po-list sl-layouts">${LAYOUTS.map(([k, l]) => `<button data-lay="${k}"><span class="sl-laypv lay-${k}"><i></i><i></i><i></i></span>${l}</button>`).join('')}</div>`,
      { left: r.left, top: r.top, bottom: r.bottom }, pop => pop.querySelector('.sl-layouts').addEventListener('click', e => { const b = e.target.closest('[data-lay]'); if (!b) return; hidePopover(); addSlide(b.dataset.lay); }));
  }
  function openThemeMenu(anchor) {
    const dd = d(); if (!dd) return;
    const cur = themeOf(dd).id;
    showPopover(`<h4>Thème de la présentation</h4><div class="sl-themes">${THEMES.map(t => `<button type="button" data-th="${t.id}" class="${t.id === cur ? 'on' : ''}" style="--tp:${t.paper};--ti:${t.ink};--ta:${t.acc || folderTint(dd.folderId)};--th:${t.head.replace(/"/g, '&quot;')}"><span class="sl-thprev"><b>Aa</b><i></i></span><span class="sl-thname">${t.name}</span><small>${esc(t.sub)}</small></button>`).join('')}</div>
      <div class="po-hint">Couleurs et polices s’appliquent à toutes les diapositives. La couleur d’accent reste modifiable avec le bouton « Accent ».</div>`,
      anchor ? anchor.getBoundingClientRect() : centerRect(), pop => pop.querySelector('.sl-themes').addEventListener('click', e => {
        const b = e.target.closest('[data-th]'); if (!b) return;
        pushHist(); dd.theme = Object.assign({}, dd.theme || {}, { id: b.dataset.th, accent: '' }); hidePopover(); commit(); renderAll();
      }));
  }
  function deleteSlide(id) {
    const dd = d(); if (!dd || slides(dd).length <= 1) return;
    pushHist();
    const i = slides(dd).findIndex(x => x.id === id); if (i < 0) return;
    slides(dd).splice(i, 1);
    if (curSlide === id) curSlide = (slides(dd)[i] || slides(dd)[i - 1]).id;
    selSet.clear(); commit(); renderAll();
    toast('Diapositive supprimée — Ctrl+Z pour annuler');
  }
  function duplicateSlide(id) {
    const dd = d(); if (!dd) return;
    const i = slides(dd).findIndex(x => x.id === id); if (i < 0) return;
    pushHist();
    const copy = JSON.parse(JSON.stringify(slides(dd)[i])); copy.id = uid(); (copy.els || []).forEach(e => { e.id = uid(); });
    slides(dd).splice(i + 1, 0, copy); curSlide = copy.id; selSet.clear(); commit(); renderAll();
  }
  function moveSlide(id, to) {
    const dd = d(); if (!dd) return;
    const from = slides(dd).findIndex(x => x.id === id); if (from < 0) return;
    to = Math.max(0, Math.min(slides(dd).length - 1, to)); if (to === from) return;
    pushHist();
    const [s] = slides(dd).splice(from, 1); slides(dd).splice(to, 0, s);
    commit(); renderStrip();
  }
  function gotoSlide(id) { if (id === curSlide) return; syncAllText(); curSlide = id; selSet.clear(); renderBar(); renderStrip(); renderCanvas(); renderSide(); }
  function stepSlide(dir) { const dd = d(); if (!dd) return; const i = slides(dd).findIndex(x => x.id === curSlide); const n = slides(dd)[i + dir]; if (n) gotoSlide(n.id); }

  /* ---------------- blocs ---------------- */
  function addEl(t, xPct, yPct) {
    const s = slide(); const b = BLOCKS.find(b => b.t === t); if (!s || !b) return;
    pushHist();
    const w = b.w, h = b.h;
    const x = xPct === undefined ? (100 - w) / 2 : Math.max(0, Math.min(100 - w, xPct - w / 2));
    const y = yPct === undefined ? Math.min(100 - h, 20 + (s.els.length % 5) * 8) : Math.max(0, Math.min(100 - h, yPct - h / 2));
    const e = Object.assign({ id: uid(), t, x: round1(x), y: round1(y), w, h, z: s.els.length + 1 }, b.make());
    s.els.push(e); commit(); renderCanvas(); renderBar();
    select(e.id, ['title', 'subtitle', 'text', 'kicker', 'list', 'olist', 'checklist', 'callout', 'quote', 'table', 'stat', 'code', 'sticky', 'bubble', 'badge', 'session'].includes(t));
    if (t === 'formula') editFormula(e.id);
    if (t === 'image') pickImage(e.id);
    if (t === 'icon') pickIcon(e.id);
    if (t === 'chart') editChart(e.id);
    if (t === 'graph') pickGraph(e.id);
    if (t === 'qr') editUrl(e.id);
  }
  function paintSel() { $$('#sl-canvas .sl-el').forEach(n => n.classList.toggle('sel', selSet.has(n.dataset.id))); }
  function select(id, edit, add) {
    if (!add) selSet.clear();
    if (id) selSet.add(id);
    paintSel(); renderBar();
    if (edit && id) startEdit(id);
  }
  function toggleSel(id) { if (selSet.has(id)) selSet.delete(id); else selSet.add(id); paintSel(); renderBar(); }
  function selectAll() { const s = slide(); if (!s) return; stopEdit(); selSet = new Set(s.els.map(e => e.id)); paintSel(); renderBar(); }
  function deselect() { syncAllText(); selSet.clear(); $$('#sl-canvas .sl-el').forEach(n => { n.classList.remove('sel', 'editing'); }); renderBar(); }
  function startEdit(id) {
    const n = $(`#sl-canvas .sl-el[data-id="${id}"]`); if (!n) return;
    const t = n.querySelector('.sl-text'); if (!t) return;
    n.classList.add('editing'); t.focus();
    const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const sg = getSelection(); sg.removeAllRanges(); sg.addRange(r);
  }
  function stopEdit() { $$('#sl-canvas .sl-el.editing').forEach(n => n.classList.remove('editing')); const a = document.activeElement; if (a && a.closest && a.closest('#sl-canvas')) a.blur(); }
  /* recopie le HTML des zones éditables dans le modèle */
  function syncText(node) {
    const wrap = node.closest('.sl-el'); if (!wrap) return false;
    const e = el(wrap.dataset.id); if (!e) return false;
    const f = node.dataset.f || 'html';
    const v = node.innerHTML;
    if (e[f] === v) return false;
    e[f] = v; return true;
  }
  function syncAllText() { let ch = false; $$('#sl-canvas .sl-text').forEach(n => { if (syncText(n)) ch = true; }); if (ch) commit(); }
  function deleteSel() { const s = slide(); if (!s || !selSet.size) return; pushHist(); s.els = s.els.filter(e => !selSet.has(e.id)); selSet.clear(); commit(); renderCanvas(); renderBar(); }
  function duplicateSel() {
    const s = slide(); const els = selEls(); if (!s || !els.length) return; pushHist();
    const ids = [];
    for (const e of els) { const c = JSON.parse(JSON.stringify(e)); c.id = uid(); c.x = Math.min(100 - c.w, c.x + 3); c.y = Math.min(100 - c.h, c.y + 4); c.z = s.els.length + 1; s.els.push(c); ids.push(c.id); }
    commit(); renderCanvas(); selSet = new Set(ids); paintSel(); renderBar();
  }
  function bringSel(front) { const s = slide(); const els = selEls(); if (!s || !els.length) return; pushHist(); const zs = s.els.map(e => e.z || 0); let z = front ? Math.max(...zs) : Math.min(...zs); for (const e of els) { z += front ? 1 : -1; e.z = z; } commit(); renderCanvas(); paintSel(); }
  function forSel(fn) { const els = selEls(); if (!els.length) return; pushHist(); els.forEach(fn); commit(); renderCanvas(); paintSel(); renderBar(); }
  function editFormula(id) {
    const e = el(id); if (!e) return;
    const n = $(`#sl-canvas .sl-el[data-id="${id}"]`);
    showPopover(`<h4>Formule</h4><div class="po-row"><input id="po-slf" value="${esc(e.src || '')}" placeholder="x^2 + y^2 = r^2" spellcheck="false" autocomplete="off"><button class="pobtn" id="po-slf-ok">OK</button></div>
      <div class="po-result" id="po-slf-prev">${(window.AlixoMath && AlixoMath.render(e.src || '')) || ''}</div>
      <div class="po-hint">Même notation que le bloc /formule des séances : x^2, x_i, sum_(i=1)^n, int_a^b, sqrt(x), alpha, vec(u), mat(a, b; c, d)…</div>`,
      n ? n.getBoundingClientRect() : centerRect(), pop => {
        const inp = pop.querySelector('#po-slf'), pv = pop.querySelector('#po-slf-prev');
        inp.addEventListener('input', () => { pv.innerHTML = (window.AlixoMath && AlixoMath.render(inp.value)) || ''; });
        const ok = () => { pushHist(); e.src = inp.value; hidePopover(); commit(); renderCanvas(); select(id); };
        pop.querySelector('#po-slf-ok').addEventListener('click', ok);
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } });
        setTimeout(() => { inp.focus(); inp.select(); }, 30);
      });
  }
  function editUrl(id) {
    const e = el(id); if (!e) return;
    const n = $(`#sl-canvas .sl-el[data-id="${id}"]`);
    showPopover(`<h4>Lien du QR code</h4><div class="po-row"><input id="po-slu" value="${esc(e.url || '')}" placeholder="https://…" spellcheck="false" autocomplete="off"><button class="pobtn" id="po-slu-ok">OK</button></div><div class="po-hint">Le QR code se met à jour avec l’adresse ; la légende se modifie directement sur la diapositive.</div>`,
      n ? n.getBoundingClientRect() : centerRect(), pop => {
        const inp = pop.querySelector('#po-slu');
        const ok = () => { pushHist(); e.url = inp.value.trim(); hidePopover(); commit(); renderCanvas(); select(id); };
        pop.querySelector('#po-slu-ok').addEventListener('click', ok);
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } });
        setTimeout(() => { inp.focus(); inp.select(); }, 30);
      });
  }
  function pickIcon(id) {
    const e = el(id); if (!e || !window.AlixoIcons) return;
    const n = $(`#sl-canvas .sl-el[data-id="${id}"]`);
    const names = Object.keys(AlixoIcons.ICONS);
    showPopover(`<h4>Icône</h4><div class="po-icons" id="po-sli">${names.map(k => `<button data-ico="${k}" class="${e.icon === k ? 'sel' : ''}" title="${k}">${AlixoIcons.svg(k)}</button>`).join('')}</div>`,
      n ? n.getBoundingClientRect() : centerRect(), pop => pop.querySelector('#po-sli').addEventListener('click', ev => { const b = ev.target.closest('[data-ico]'); if (!b) return; pushHist(); e.icon = b.dataset.ico; hidePopover(); commit(); renderCanvas(); select(id); }));
  }
  function pickGraph(id) {
    const e = el(id); if (!e || !window.AlixoGraphs) return;
    const n = $(`#sl-canvas .sl-el[data-id="${id}"]`);
    const entries = Object.entries(AlixoGraphs.TYPES);
    showPopover(`<h4>Graphique économique</h4><div class="po-list sl-graphs" id="po-slg">${entries.map(([k, t]) => `<button data-g="${k}" class="${(e.gtype || 'plot') === k ? 'cur' : ''}"><span class="sl-gthumb">${AlixoGraphs.thumb(k)}</span>${esc(t.name)}</button>`).join('')}</div>`,
      n ? n.getBoundingClientRect() : centerRect(), pop => pop.querySelector('#po-slg').addEventListener('click', ev => { const b = ev.target.closest('[data-g]'); if (!b) return; pushHist(); e.gtype = b.dataset.g; e.params = e.gtype === 'plot' ? { f1: '80 - 0.8x', f2: '10 + 0.7x' } : {}; hidePopover(); commit(); renderCanvas(); select(id); }));
  }
  function editChart(id) {
    const e = el(id); if (!e || !window.AlixoCharts) return;
    if (!e.chart) e.chart = AlixoCharts.defaults();
    const n = $(`#sl-canvas .sl-el[data-id="${id}"]`);
    /* 1.22 : tableau dynamique (le même que dans les séances), avec aperçu en direct sur la diapositive */
    const w = AlixoCharts.workCopy(e.chart);
    let done = false;
    showPopover(`<h4>Graphique de données</h4>
      <div class="po-row"><select id="po-slck">${Object.entries(AlixoCharts.TYPES).map(([k, t]) => `<option value="${k}" ${e.chart.ck === k ? 'selected' : ''}>${esc(t.name || k)}</option>`).join('')}</select><input id="po-slct" placeholder="Titre du graphique" value="${esc(e.chart.title || '')}"></div>
      <div id="po-slgrid" class="cd-grid"></div>
      <div class="po-hint">Entrée : ligne suivante · Tab et flèches : case en case · collez une plage Excel / Sheets dans une case (dans « Catégorie » : tout remplacer).</div>
      <div class="po-row" style="justify-content:flex-end; gap:6px; margin-top:8px"><button class="cta ghost small" id="po-slc-cancel" type="button">Annuler</button><button class="pobtn" id="po-slc-ok" type="button">Appliquer</button></div>`,
      n ? n.getBoundingClientRect() : centerRect(), pop => {
        pop.style.left = Math.max(12, Math.min(parseFloat(pop.style.left) || 12, innerWidth - pop.offsetWidth - 12)) + 'px';
        const gridEl = pop.querySelector('#po-slgrid');
        const current = () => Object.assign({}, e.chart, AlixoCharts.cleanWork(w), { ck: pop.querySelector('#po-slck').value, title: pop.querySelector('#po-slct').value });
        const preview = () => { const host = n && n.querySelector('.sl-chart'); if (host) host.innerHTML = AlixoCharts.svg(current()); };
        let tm = null; const soon = () => { clearTimeout(tm); tm = setTimeout(preview, 60); };
        const mountText = () => {
          gridEl.innerHTML = `<textarea class="cd-data" id="po-slcd" rows="7" spellcheck="false">${esc(AlixoCharts.toText(AlixoCharts.cleanWork(w)))}</textarea><div class="cg-actions"><span class="po-hint" style="margin:0; flex:1">Une ligne par catégorie : libellé puis les valeurs (tabulations ou « ; ») ; première ligne = noms des séries.</span><button type="button" class="cg-grid">Mode tableau</button></div>`;
          const ta = gridEl.querySelector('#po-slcd');
          const sync = () => { const parsed = AlixoCharts.parseText(ta.value, w); if (parsed) { w.labels = parsed.labels; w.series = parsed.series; return true; } return false; };
          ta.addEventListener('input', () => { if (sync()) soon(); });
          gridEl.querySelector('.cg-grid').addEventListener('click', () => { sync(); mountGrid(); });
          ta.focus();
        };
        const mountGrid = () => AlixoCharts.bindGrid(gridEl, w, soon, { onText: mountText });
        pop.querySelector('#po-slck').addEventListener('change', soon);
        pop.querySelector('#po-slct').addEventListener('input', soon);
        const apply = () => { const c = AlixoCharts.cleanWork(w); if (!c.labels.length || !c.series.length) return false; pushHist(); e.chart = current(); done = true; commit(); renderCanvas(); select(id); return true; };
        const restore = () => { done = true; renderCanvas(); select(id); };
        pop.querySelector('#po-slc-ok').addEventListener('click', () => { if (apply()) hidePopover(); else toast('Le graphique a besoin d’au moins une catégorie et une série'); });
        pop.querySelector('#po-slc-cancel').addEventListener('click', () => { restore(); hidePopover(); });
        pop.addEventListener('keydown', ev => { if (ev.key === 'Escape') restore(); });
        pop._onHide = () => { if (!done) { if (!apply()) restore(); } };
        mountGrid();
        setTimeout(() => { const first = gridEl.querySelector('.cg-val') || gridEl.querySelector('input'); if (first) { first.focus(); first.select(); } }, 40);
      });
  }
  function pickImage(id) {
    const inp = $('#sl-img-file'); if (!inp) return;
    inp.value = ''; inp.dataset.el = id; inp.click();
  }
  async function setImage(id, file) {
    const e = el(id); if (!e || !file || !/^image\//.test(file.type)) return;
    try {
      const im = await fileToImage(file);
      const iid = uid(); await AlixoImages.put(iid, im.data);
      pushHist(); e.iid = iid;
      const ratio = im.h / im.w; e.h = round1(Math.max(6, Math.min(100 - e.y, e.w * (SW / SH) * ratio)));
      commit(); renderCanvas(); select(id);
    } catch (err) { console.error(err); toast('Image illisible'); }
  }
  function openColorPopover(ids, anchor) {
    const dd = d(); const els = ids ? ids.map(el).filter(Boolean) : [];
    const colors = (typeof FOLDER_COLORS !== 'undefined' ? FOLDER_COLORS : ['#33658a']);
    const cur = els.length ? (els[0].color || '') : (dd.theme && dd.theme.accent) || '';
    showPopover(`<h4>${els.length > 1 ? 'Couleur des blocs' : els.length ? 'Couleur du bloc' : 'Couleur d’accent'}</h4><div class="po-colors" id="po-slc">${colors.map(c => `<button data-c="${c}" style="background:${c}" class="${cur === c ? 'sel' : ''}" title="${c}"></button>`).join('')}</div>
      <div class="po-row" style="margin-top:8px; align-items:center; gap:10px"><button class="cta ghost small" id="po-slc-none">${els.length ? 'Couleur d’accent' : 'Couleur du thème'}</button><label class="set-inline">Autre <input type="color" id="po-slc-custom" value="${cur || accent(dd)}"></label></div>`,
      anchor ? anchor.getBoundingClientRect() : centerRect(), pop => {
        const apply = c => { pushHist(); if (els.length) { els.forEach(e => { if (c) e.color = c; else delete e.color; }); } else { dd.theme = dd.theme || {}; dd.theme.accent = c || ''; } hidePopover(); commit(); renderAll(); paintSel(); };
        pop.querySelector('#po-slc').addEventListener('click', ev => { const b = ev.target.closest('[data-c]'); if (b) apply(b.dataset.c); });
        pop.querySelector('#po-slc-none').addEventListener('click', () => apply(''));
        pop.querySelector('#po-slc-custom').addEventListener('change', ev => apply(ev.target.value));
      });
  }
  function tableAdd(id, what) {
    const e = el(id); if (!e) return;
    const box = document.createElement('div'); box.innerHTML = e.html || tableHTML(2, 2);
    const tb = box.querySelector('table'); if (!tb) return;
    pushHist();
    const rows = [...tb.querySelectorAll('tr')];
    if (what === 'row') { const tr = document.createElement('tr'); tr.innerHTML = rows[0].querySelectorAll('td,th').length ? [...rows[0].querySelectorAll('td,th')].map(() => '<td>…</td>').join('') : '<td>…</td>'; tb.appendChild(tr); }
    else rows.forEach(r => { const td = document.createElement('td'); td.textContent = '…'; r.appendChild(td); });
    e.html = box.innerHTML; commit(); renderCanvas(); select(id);
  }
  function openEditor(id) {
    const ee = el(id); if (!ee) return;
    if (ee.t === 'formula') editFormula(id); else if (ee.t === 'image') pickImage(id); else if (ee.t === 'icon') pickIcon(id); else if (ee.t === 'chart') editChart(id); else if (ee.t === 'graph') pickGraph(id); else if (ee.t === 'qr') editUrl(id);
    else if (['arrow', 'divider', 'pagenum'].includes(ee.t)) return; else startEdit(id);
  }

  /* ---------------- coordonnées ---------------- */
  function pctOf(clientX, clientY) {
    const r = $('#sl-canvas').getBoundingClientRect();
    return { x: (clientX - r.left) / (SW * scale) * 100, y: (clientY - r.top) / (SH * scale) * 100 };
  }

  /* ---------------- événements ---------------- */
  function bind() {
    if (bound) return; bound = true;
    const canvas = $('#sl-canvas'), stage = $('#sl-stage'), strip = $('#sl-strip'), side = $('#sl-side'), bar = $('#sl-bar');
    ro = new ResizeObserver(() => { fit(); fitThumbs(); }); ro.observe(stage); ro.observe(strip);

    /* --- barre d'outils --- */
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-sl]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const a = b.dataset.sl; const id = sel();
      if (a === 'info') { if (window.AlixoShare) AlixoShare.openInfo(currentDocId); return; }
      if (a === 'present') { startPresent(0); return; }
      if (readOnly) return;
      if (a === 'add') { openLayoutMenu(b); return; }
      if (a === 'undo') { undo(); return; }
      if (a === 'redo') { redo(); return; }
      if (a === 'dup') { duplicateSlide(curSlide); return; }
      if (a === 'del') { deleteSlide(curSlide); return; }
      if (a === 'accent') { openColorPopover(null, b); return; }
      if (a === 'theme') { openThemeMenu(b); return; }
      if (!selSet.size) return;
      if (a === 'fs-' || a === 'fs+') { forSel(ee => { ee.fs = round1(Math.max(0.4, Math.min(3, (ee.fs || 1) + (a === 'fs+' ? 0.1 : -0.1)))); }); return; }
      if (a === 'cmd') { const n = $(`#sl-canvas .sl-el[data-id="${id}"] .sl-text`); if (!n) return; if (!n.contains(document.activeElement)) { startEdit(id); const r = document.createRange(); r.selectNodeContents(n); const sg = getSelection(); sg.removeAllRanges(); sg.addRange(r); } document.execCommand(b.dataset.cmd); syncAllText(); return; }
      if (a === 'al') { forSel(ee => { ee.al = b.dataset.al; }); return; }
      if (a === 'formula') { editFormula(id); return; }
      if (a === 'img') { pickImage(id); return; }
      if (a === 'icon') { pickIcon(id); return; }
      if (a === 'chart') { editChart(id); return; }
      if (a === 'graph') { pickGraph(id); return; }
      if (a === 'url') { editUrl(id); return; }
      if (a === 'row+') { tableAdd(id, 'row'); return; }
      if (a === 'col+') { tableAdd(id, 'col'); return; }
      if (a === 'color') { openColorPopover([...selSet], b); return; }
      if (a === 'front') { bringSel(true); return; }
      if (a === 'back') { bringSel(false); return; }
      if (a === 'dupel') { duplicateSel(); return; }
      if (a === 'delel') { deleteSel(); return; }
    });
    bar.addEventListener('change', e => {
      const sl = e.target.dataset.sl; const s = slide(); const ee = sel() ? el(sel()) : null;
      if (sl === 'bg' && s) { pushHist(); s.bg = e.target.value; commit(); renderCanvas(); renderStrip(); }
      if (sl === 'ct' && ee) { pushHist(); ee.ct = e.target.value; commit(); renderCanvas(); paintSel(); }
      if (sl === 'shape' && ee) { pushHist(); ee.shape = e.target.value; commit(); renderCanvas(); paintSel(); }
      if (sl === 'dir' && ee) { pushHist(); ee.dir = e.target.value; commit(); renderCanvas(); paintSel(); }
      if (sl === 'pct' && ee) { pushHist({ typing: true, el: 'pct' }); ee.pct = +e.target.value; commit(); renderCanvas(); paintSel(); }
    });
    bar.addEventListener('input', e => { if (e.target.dataset.sl === 'pct') { const ee = sel() ? el(sel()) : null; if (!ee) return; ee.pct = +e.target.value; const n = $(`#sl-canvas .sl-el[data-id="${ee.id}"]`); if (n) { const bar2 = n.querySelector('.sl-progbar'); if (bar2) bar2.style.width = ee.pct + '%'; const p = n.querySelector('.sl-progpct'); if (p) p.textContent = ee.pct + ' %'; } } });
    bar.addEventListener('pointerdown', e => { if (e.target.closest('[data-sl="cmd"]')) e.preventDefault(); });

    /* --- vignettes : sélection, réordonnancement --- */
    let tdrag = null;
    strip.addEventListener('click', e => {
      if (e.target.closest('[data-sl="add"]')) { openLayoutMenu(e.target.closest('[data-sl="add"]')); return; }
      const t = e.target.closest('.sl-thumb'); if (t) gotoSlide(t.dataset.sid);
    });
    strip.addEventListener('contextmenu', e => {
      const t = e.target.closest('.sl-thumb'); if (!t || readOnly) return; e.preventDefault();
      const menu = $('#ctxmenu'); const dd = d(); const i = slides(dd).findIndex(x => x.id === t.dataset.sid);
      menu.innerHTML = `<div class="cm-title">Diapositive ${i + 1}</div><button data-slcm="dup">${I.dup}Dupliquer</button><button data-slcm="up">↑ Monter</button><button data-slcm="down">↓ Descendre</button><button data-slcm="del" class="danger">${I.trash}Supprimer</button>`;
      menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = '';
      menu.onclick = ev => { const b = ev.target.closest('[data-slcm]'); if (!b) return; ev.stopPropagation(); closeCtxMenu(); menu.onclick = null; const id = t.dataset.sid; if (b.dataset.slcm === 'dup') duplicateSlide(id); if (b.dataset.slcm === 'del') deleteSlide(id); if (b.dataset.slcm === 'up') moveSlide(id, i - 1); if (b.dataset.slcm === 'down') moveSlide(id, i + 1); };
      placeCtxMenu(menu, e.clientX, e.clientY);
    });
    strip.addEventListener('dragstart', e => { const t = e.target.closest('.sl-thumb'); if (!t || readOnly) { e.preventDefault(); return; } tdrag = t.dataset.sid; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'slide:' + tdrag); t.classList.add('dragging'); });
    strip.addEventListener('dragend', () => { tdrag = null; $$('#sl-strip .sl-thumb').forEach(t => t.classList.remove('dragging', 'over')); });
    strip.addEventListener('dragover', e => { if (!tdrag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const t = e.target.closest('.sl-thumb'); $$('#sl-strip .sl-thumb').forEach(x => x.classList.toggle('over', x === t && t.dataset.sid !== tdrag)); });
    strip.addEventListener('drop', e => { if (!tdrag) return; e.preventDefault(); const t = e.target.closest('.sl-thumb'); const dd = d(); if (t && t.dataset.sid !== tdrag) moveSlide(tdrag, slides(dd).findIndex(x => x.id === t.dataset.sid)); tdrag = null; });

    /* --- palette : catégories, recherche, glisser un bloc (ou cliquer) --- */
    side.addEventListener('dragstart', e => { const p = e.target.closest('.sl-pitem'); if (!p) return; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/alixo-block', p.dataset.pt); e.dataTransfer.setData('text/plain', 'block:' + p.dataset.pt); canvas.classList.add('drop-ready'); });
    side.addEventListener('dragend', () => canvas.classList.remove('drop-ready', 'drop-over'));
    side.addEventListener('click', e => {
      const p = e.target.closest('.sl-pitem'); if (p) { if (!readOnly) addEl(p.dataset.pt); return; }
      const c = e.target.closest('[data-cat]'); if (c) { palCat = c.dataset.cat; palQuery = ''; side.querySelector('#sl-palq').value = ''; side.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', b === c)); side.querySelector('#sl-pal').innerHTML = paletteHTML(); }
    });
    side.addEventListener('input', e => {
      if (e.target.id === 'sl-notes') { const s = slide(); if (s) { s.notes = e.target.value; commitSoon(); } }
      if (e.target.id === 'sl-palq') { palQuery = e.target.value; side.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', !palQuery && b.dataset.cat === palCat)); side.querySelector('#sl-pal').innerHTML = paletteHTML(); }
    });
    stage.addEventListener('dragover', e => {
      const types = [...(e.dataTransfer.types || [])];
      if (types.includes('text/alixo-block') || types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; canvas.classList.add('drop-over'); }
    });
    stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) canvas.classList.remove('drop-over'); });
    stage.addEventListener('drop', async e => {
      canvas.classList.remove('drop-ready', 'drop-over');
      if (readOnly) return;
      const t = e.dataTransfer.getData('text/alixo-block');
      const p = pctOf(e.clientX, e.clientY);
      if (t) { e.preventDefault(); addEl(t, p.x, p.y); return; }
      const files = [...(e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type));
      if (files.length) {
        e.preventDefault();
        const target = e.target.closest('.sl-el.t-image');
        if (target) { await setImage(target.dataset.id, files[0]); return; }
        for (const f of files) { const s = slide(); if (!s) return; pushHist(); const ee = { id: uid(), t: 'image', x: round1(Math.max(0, Math.min(60, p.x - 20))), y: round1(Math.max(0, Math.min(55, p.y - 22))), w: 40, h: 45, z: s.els.length + 1, iid: '' }; s.els.push(ee); commit(); renderCanvas(); await setImage(ee.id, f); }
      }
    });
    $('#sl-img-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; const id = e.target.dataset.el; if (f && id) setImage(id, f); });

    /* --- diapositive : sélection (simple, Maj, rectangle), déplacement, redimensionnement, édition --- */
    stage.addEventListener('pointerdown', e => {
      if (e.button !== 0 || readOnly) return;
      const n = e.target.closest('.sl-el');
      const ansl = e.target.closest('.sl-ansl');
      if (ansl && n) { const ee = el(n.dataset.id); if (ee && ee.t === 'question') { e.preventDefault(); pushHist(); ee.ans = +ansl.dataset.ans; commit(); renderCanvas(); paintSel(); } return; }
      if (!n) {
        // rectangle de sélection sur le fond de la diapositive (ou clic simple : désélection)
        if (!e.target.closest('.sl-slide')) { if (selSet.size) deselect(); return; }
        const p = pctOf(e.clientX, e.clientY);
        if (!e.shiftKey && selSet.size) deselect();
        drag = { kind: 'marquee', x0: p.x, y0: p.y, add: e.shiftKey, moved: false, base: new Set(selSet) };
        stage.setPointerCapture(e.pointerId);
        return;
      }
      const id = n.dataset.id;
      const h = e.target.closest('.sl-h');
      if (n.classList.contains('editing') && !h && !e.target.closest('.sl-grip')) return;   // en édition : le texte gère la souris
      e.preventDefault();
      if (e.shiftKey && !h) { syncAllText(); stopEdit(); toggleSel(id); return; }
      const wasSel = selSet.has(id) && !h && selSet.size === 1;
      if (!selSet.has(id)) { syncAllText(); stopEdit(); select(id); }
      const p = pctOf(e.clientX, e.clientY);
      drag = { kind: h ? 'resize' : 'move', id, h: h ? h.dataset.h : null, px: p.x, py: p.y, start: selEls().map(ee => ({ ee, x: ee.x, y: ee.y, w: ee.w, h: ee.h })), moved: false, wasSel };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = pctOf(e.clientX, e.clientY);
      if (drag.kind === 'marquee') {
        drag.moved = true;
        let mq = canvas.querySelector('.sl-marquee'); if (!mq) { mq = document.createElement('div'); mq.className = 'sl-marquee'; canvas.appendChild(mq); }
        const x0 = Math.min(drag.x0, p.x), y0 = Math.min(drag.y0, p.y), x1 = Math.max(drag.x0, p.x), y1 = Math.max(drag.y0, p.y);
        mq.style.left = x0 + '%'; mq.style.top = y0 + '%'; mq.style.width = (x1 - x0) + '%'; mq.style.height = (y1 - y0) + '%';
        const s = slide(); if (!s) return;
        const hit = s.els.filter(ee => ee.x < x1 && ee.x + ee.w > x0 && ee.y < y1 && ee.y + ee.h > y0).map(ee => ee.id);
        selSet = new Set([...(drag.add ? drag.base : []), ...hit]); paintSel();
        return;
      }
      const dx = p.x - drag.px, dy = p.y - drag.py;
      if (!drag.moved && Math.abs(dx) * SW / 100 * scale < 3 && Math.abs(dy) * SH / 100 * scale < 3) return;
      if (!drag.moved) { drag.moved = true; pushHist(); $$('#sl-canvas .sl-el.editing').forEach(x => x.classList.remove('editing')); }
      if (drag.kind === 'move') {
        for (const st of drag.start) { st.ee.x = round1(Math.max(-st.ee.w + 4, Math.min(96, st.x + dx))); st.ee.y = round1(Math.max(-st.ee.h + 4, Math.min(96, st.y + dy))); }
      } else {
        const st = drag.start.find(x => x.ee.id === drag.id) || drag.start[0]; const ee = st.ee;
        const hh = drag.h; let x = st.x, y = st.y, w = st.w, h = st.h;
        if (hh.includes('e')) w = Math.max(4, st.w + dx);
        if (hh.includes('s')) h = Math.max(3, st.h + dy);
        if (hh.includes('w')) { w = Math.max(4, st.w - dx); x = st.x + (st.w - w); }
        if (hh.includes('n')) { h = Math.max(3, st.h - dy); y = st.y + (st.h - h); }
        if (e.shiftKey && (ee.t === 'image' || ee.t === 'icon' || ee.t === 'qr')) { h = w * (st.h / st.w); }
        ee.x = round1(x); ee.y = round1(y); ee.w = round1(w); ee.h = round1(h);
      }
      for (const st of drag.start) { const n = $(`#sl-canvas .sl-el[data-id="${st.ee.id}"]`); if (n) { n.style.left = st.ee.x + '%'; n.style.top = st.ee.y + '%'; n.style.width = st.ee.w + '%'; n.style.height = st.ee.h + '%'; } }
    });
    const endDrag = () => {
      if (!drag) return;
      const dr = drag; drag = null;
      if (dr.kind === 'marquee') { const mq = canvas.querySelector('.sl-marquee'); if (mq) mq.remove(); renderBar(); return; }
      if (dr.moved) { commit(); return; }
      if (dr.wasSel) openEditor(dr.id);   // clic simple sur un bloc déjà seul sélectionné : édition
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', () => { const mq = canvas.querySelector('.sl-marquee'); if (mq) mq.remove(); drag = null; });
    stage.addEventListener('dblclick', e => { const n = e.target.closest('.sl-el'); if (!n) return; if (!n.classList.contains('editing')) { select(n.dataset.id); openEditor(n.dataset.id); } });
    canvas.addEventListener('input', e => { const n = e.target.closest('.sl-text'); if (!n) return; const wrap = n.closest('.sl-el'); pushHist({ typing: true, el: wrap && wrap.dataset.id }); syncText(n); commitSoon(); });
    canvas.addEventListener('focusout', e => { const n = e.target.closest && e.target.closest('.sl-text'); if (n) { if (syncText(n)) commit(); } });
    canvas.addEventListener('keydown', e => {
      const n = e.target.closest('.sl-text'); if (!n) return;
      if (e.key === 'Escape') { e.preventDefault(); stopEdit(); syncAllText(); paintSel(); renderBar(); return; }
      if (e.key === 'Tab' && n.classList.contains('sl-tbl')) {
        const sg = getSelection(); const cell = sg && sg.anchorNode && (sg.anchorNode.nodeType === 1 ? sg.anchorNode : sg.anchorNode.parentElement).closest('td,th'); if (!cell) return;
        e.preventDefault();
        const cells = [...n.querySelectorAll('td,th')]; const i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
        if (cells[i]) { const r = document.createRange(); r.selectNodeContents(cells[i]); sg.removeAllRanges(); sg.addRange(r); }
        else if (!e.shiftKey) {
          const perRow = (n.querySelector('tr') || n).querySelectorAll('td,th').length || 1;
          const id = sel(); tableAdd(id, 'row');
          setTimeout(() => { const nn = $(`#sl-canvas .sl-el[data-id="${id}"] .sl-text`); const cs = nn && nn.querySelectorAll('td,th'); if (cs && cs.length) { startEdit(id); const r = document.createRange(); r.selectNodeContents(cs[cs.length - perRow]); const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(r); } }, 30);
        }
        return;
      }
      const single = n.classList.contains('sl-num') || n.classList.contains('sl-cite') || n.classList.contains('sl-term') || n.classList.contains('sl-jref') || n.classList.contains('sl-colt') || n.classList.contains('sl-qq') || n.closest('.t-title, .t-subtitle, .t-kicker, .t-badge, .t-steps, .t-kpis, .t-pagenum');
      if (e.key === 'Enter' && single) { e.preventDefault(); if (e.shiftKey) document.execCommand('insertLineBreak'); return; }
      if (e.key === 'Enter' && n.closest('.t-text, .t-code, .t-sticky, .t-bubble, .t-session, .t-definition, .t-juris') && !e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
    });
    canvas.addEventListener('paste', e => {
      const n = e.target.closest('.sl-text'); if (!n) return;
      const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); const s = slide(); pushHist(); const ee = { id: uid(), t: 'image', x: 30, y: 25, w: 40, h: 45, z: s.els.length + 1, iid: '' }; s.els.push(ee); commit(); renderCanvas(); setImage(ee.id, files[0]); return; }
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, txt);
    });
    stage.addEventListener('contextmenu', e => {
      const n = e.target.closest('.sl-el'); if (!n || readOnly) return; e.preventDefault();
      if (!selSet.has(n.dataset.id)) select(n.dataset.id);
      const menu = $('#ctxmenu'); const many = selSet.size > 1;
      menu.innerHTML = `<div class="cm-title">${many ? selSet.size + ' blocs' : esc((BLOCKS.find(b => b.t === (el(n.dataset.id) || {}).t) || {}).name || 'Bloc')}</div>${many ? '' : '<button data-slcm="edit">Modifier</button>'}<button data-slcm="dup">${I.dup}Dupliquer</button><button data-slcm="front">${I.front}Passer devant</button><button data-slcm="back">${I.back}Passer derrière</button><button data-slcm="del" class="danger">${I.trash}Retirer</button>`;
      menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = '';
      menu.onclick = ev => { const b = ev.target.closest('[data-slcm]'); if (!b) return; ev.stopPropagation(); closeCtxMenu(); menu.onclick = null; const a = b.dataset.slcm; if (a === 'dup') duplicateSel(); if (a === 'del') deleteSel(); if (a === 'front') bringSel(true); if (a === 'back') bringSel(false); if (a === 'edit') openEditor(n.dataset.id); };
      placeCtxMenu(menu, e.clientX, e.clientY);
    });

    /* --- clavier --- */
    document.addEventListener('keydown', e => {
      if (!document.body.classList.contains('mode-slides')) return;
      if (present) { presentKey(e); return; }
      const mod = e.ctrlKey || e.metaKey;
      const inText = e.target.closest && e.target.closest('.sl-text, input, textarea, select, [contenteditable="true"]');
      const popOpen = ($('#popover') && !$('#popover').hidden) || ($('#searchov') && !$('#searchov').hidden) || ($('#setov') && !$('#setov').hidden);
      if (popOpen) return;
      if (e.key === 'F5') { e.preventDefault(); startPresent(e.shiftKey ? 'cur' : 0); return; }
      if (e.altKey && e.key === 'ArrowLeft' && !mod) { e.preventDefault(); showLibrary(); return; }
      if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(currentDocId); return; }
      if (mod && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPDF(); return; }
      if (mod && e.key.toLowerCase() === 'm') { e.preventDefault(); if (!readOnly) addSlide('content'); return; }
      if (readOnly) { if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') stepSlide(-1); if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') stepSlide(1); return; }
      if (inText) {
        if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); }
        if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); }
        if (mod && e.key.toLowerCase() === 'u') { e.preventDefault(); document.execCommand('underline'); }
        return;
      }
      if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (selSet.size) duplicateSel(); else duplicateSlide(curSlide); return; }
      if (e.key === 'Escape') { if (selSet.size) { deselect(); } if (typeof closeCtxMenu === 'function') closeCtxMenu(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selSet.size) { e.preventDefault(); deleteSel(); return; }
      if (e.key === 'Enter' && selSet.size === 1) { e.preventDefault(); openEditor(sel()); return; }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) {
        e.preventDefault();
        if (selSet.size) { const k = e.shiftKey ? 5 : 1; pushHist({ typing: true, el: 'nudge' }); selEls().forEach(ee => { ee.x = round1(ee.x + arrows[e.key][0] * k); ee.y = round1(ee.y + arrows[e.key][1] * k); }); commit(); renderCanvas(); paintSel(); }
        else stepSlide(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (e.key === 'PageUp') { e.preventDefault(); stepSlide(-1); }
      if (e.key === 'PageDown') { e.preventDefault(); stepSlide(1); }
    });
    document.addEventListener('pointerdown', e => { if (!document.body.classList.contains('mode-slides') || present) return; if (!e.target.closest('#sl-stage, #sl-bar, #popover, #ctxmenu')) { if (selSet.size) deselect(); } }, true);
  }

  /* ---------------- mode présentation ---------------- */
  function startPresent(from) {
    const dd = d(); if (!dd) return;
    syncAllText(); stopEdit();
    const i = from === 'cur' ? Math.max(0, slides(dd).findIndex(s => s.id === curSlide)) : (from || 0);
    present = { i };
    const ov = $('#sl-present');
    ov.hidden = false;
    ov.innerHTML = `<div class="sl-pstage"><div class="sl-pin"></div></div><div class="sl-pnav"><button data-p="prev" title="Précédente (←)">‹</button><span class="sl-pcount"></span><button data-p="next" title="Suivante (→, Espace)">›</button><button data-p="exit" title="Quitter (Échap)">${I.x}</button></div><div class="sl-pnotes" hidden></div>`;
    if (!ov.dataset.bound) {
      ov.dataset.bound = '1';
      ov.addEventListener('click', e => {
        const b = e.target.closest('[data-p]');
        if (b) { if (b.dataset.p === 'prev') presentStep(-1); else if (b.dataset.p === 'next') presentStep(1); else closePresent(); return; }
        if (e.target.closest('.sl-pstage')) presentStep(e.clientX < innerWidth / 3 ? -1 : 1);
      });
      window.addEventListener('resize', () => { if (present) fitPresent(); });
    }
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* plein écran refusé */ }
    renderPresent();
  }
  function renderPresent() {
    const dd = d(); if (!dd || !present) return;
    const list = slides(dd); const s = list[present.i]; if (!s) return;
    const ov = $('#sl-present');
    ov.querySelector('.sl-pin').innerHTML = slideHTML(s, dd, false, present.i);
    ov.querySelector('.sl-pcount').textContent = `${present.i + 1} / ${list.length}`;
    const notes = ov.querySelector('.sl-pnotes'); notes.hidden = !present.notes || !s.notes; notes.textContent = s.notes || '';
    fitPresent();
  }
  function fitPresent() {
    const ov = $('#sl-present'); const pin = ov && ov.querySelector('.sl-pin'); if (!pin) return;
    const st = ov.querySelector('.sl-pstage').getBoundingClientRect();
    const k = Math.min(st.width / SW, st.height / SH);
    pin.style.transform = `translate(-50%, -50%) scale(${k})`;
  }
  function presentStep(dir) { const dd = d(); if (!dd || !present) return; const n = present.i + dir; if (n < 0 || n >= slides(dd).length) { if (dir > 0) closePresent(); return; } present.i = n; renderPresent(); }
  function presentKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePresent(); return; }
    if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'].includes(e.key)) { e.preventDefault(); presentStep(1); return; }
    if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp'].includes(e.key)) { e.preventDefault(); presentStep(-1); return; }
    if (e.key === 'Home') { present.i = 0; renderPresent(); }
    if (e.key === 'End') { const dd = d(); present.i = slides(dd).length - 1; renderPresent(); }
    if (e.key.toLowerCase() === 'n') { present.notes = !present.notes; renderPresent(); }
  }
  function closePresent() {
    if (!present) return;
    const dd = d(); if (dd && slides(dd)[present.i]) { curSlide = slides(dd)[present.i].id; }
    present = null;
    const ov = $('#sl-present'); ov.hidden = true; ov.innerHTML = '';
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* ignoré */ }
    if (document.body.classList.contains('mode-slides')) { renderStrip(); renderCanvas(); renderBar(); renderSide(); }
  }

  /* ---------------- export PDF (une page 16:9 par diapositive) ---------------- */
  let pdfBusyS = false;
  async function exportPDF() {
    const dd = d(); if (!dd || pdfBusyS) return;
    syncAllText();
    const box = $('#sl-print');
    box.innerHTML = slides(dd).map((s, i) => `<div class="sl-page">${slideHTML(s, dd, false, i)}</div>`).join('');
    const title = dd.titre || 'Présentation';
    document.title = title + ' — Alixo';
    document.body.classList.add('printing-slides');
    const desk = window.alixoDesktop;
    const done = () => { document.body.classList.remove('printing-slides'); if (typeof exportWatermark === 'function') exportWatermark(false); box.innerHTML = ''; document.title = 'Alixo — Cockpit d’amphi'; };
    if (!desk || !desk.printToPDF || !desk.saveFile) { if (typeof exportWatermark === 'function') exportWatermark(true); try { print(); } finally { done(); if (typeof exportWatermark === 'function') exportWatermark(false); } return; }
    pdfBusyS = true;
    toast('Préparation du PDF…', { duration: 4000 });
    let pdf = null, err = null;
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 150));
      if (typeof exportWatermark === 'function') exportWatermark(true);
      pdf = await desk.printToPDF({ slides: true, title });
      if (typeof exportWatermark === 'function') exportWatermark(false);
    } catch (e) { err = e; }
    done(); pdfBusyS = false;
    if (!pdf || err) { console.error(err); toast('Export PDF impossible' + (err && err.message ? ' : ' + err.message : '')); return; }
    const r = await desk.saveFile({ name: safeFileName(title) + '.pdf', data: pdf, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r && r.ok) toast(`PDF enregistré : ${r.path.split(/[\\/]/).pop()}`, { action: 'Ouvrir', onAction: () => desk.openPath && desk.openPath(r.path) });
    else if (r && r.error) toast('Enregistrement impossible : ' + r.error);
  }

  /* ---------------- aperçu pour la bibliothèque (carte) ---------------- */
  function preview(dd) {
    const s = slides(dd)[0]; if (!s) return '';
    if (!previewRaf) previewRaf = requestAnimationFrame(() => { previewRaf = 0; fitPreviews(); });
    return `<div class="sp-box"><div class="sp-in">${slideHTML(s, dd, false, 0)}</div></div>`;
  }
  function fitPreviews() {
    $$('.sp-box').forEach(b => { const w = b.clientWidth; if (w) { const inn = b.querySelector('.sp-in'); inn.style.transform = `scale(${w / SW})`; b.style.height = Math.round(w / SW * SH) + 'px'; } });
  }
  window.addEventListener('resize', () => { if (document.querySelector('.sp-box')) fitPreviews(); });

  return { newDoc, open, leave, refresh, remoteChanged, undo, redo, exportPDF, preview, fitPreviews, present: startPresent, THEMES, BLOCKS, SW, SH };
})();
