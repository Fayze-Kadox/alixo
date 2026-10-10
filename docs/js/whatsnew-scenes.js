/* ============================================================
   Alixo — scènes de la présentation animée des nouveautés, version par version.
   ------------------------------------------------------------
   À chaque mise à jour, ajouter un bloc AlixoWhatsNew.register('x.y.z', { scenes: [...] }) EN TÊTE
   de ce fichier (le lecteur est js/whatsnew.js, le format y est documenté). Garder au plus les trois
   dernières versions : les plus anciennes se retirent (elles restent lisibles sur alixoapp.com/versions/).

   Règles d'écriture (voir .claude/skills/alixo-update/references/video.md) :
   - une idée par scène, 4 à 7 scènes, 35 à 60 secondes au total ;
   - une scène « intro » (numéro de version), des scènes « feature » (titre court avec un mot en <em>,
     une phrase, 2 à 4 puces commençant par un <b>mot-clé</b>, une illustration `art`), une « outro » ;
   - le texte reprend la section « Nouveautés x.y.z » du README en langage d'utilisateur (jamais de
     nom de fichier ni de fonction).
   Aperçu : index.html?nouveautes=1.29.0 (ou nouveautes.html?v=1.29.0 en page seule).
   ============================================================ */
'use strict';

AlixoWhatsNew.register('1.29.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Alixo <em>Mail</em> arrive,<br>et l’éditeur se corrige', text: 'Une messagerie à vous, un compte mieux protégé, trois gênes de l’éditeur réglées — en moins d’une minute.', dur: 5000 },
    { title: 'Votre adresse <em>@alixoapp.com</em>', text: 'Alixo Mail est une messagerie indépendante de l’application : seul votre compte Alixo est commun.',
      bullets: ['<b>Webmail</b> : dossiers, fils, recherche, pièces jointes, raccourcis, sombre', '<b>Outlook, Apple Mail, téléphone</b> : mots de passe d’application, configuration automatique', '<b>Répondeur, filtres, alias</b> réglés depuis les paramètres', '<b>Ouverture</b> dès que le serveur sera en ligne : vous serez prévenu ici'],
      art: { icon: '✉️' }, accent: '#2e8b6a', accent2: '#1d8a5e', dur: 8500 },
    { title: 'Une adresse <em>confirmée</em>', text: 'À l’inscription par e-mail, un lien de confirmation protège désormais votre compte avant la première ouverture.',
      bullets: ['<b>Un clic</b> dans l’e-mail reçu, Alixo s’ouvre tout seul', '<b>Pas reçu ?</b> Renvoyer l’e-mail ou changer d’adresse', '<b>Comptes existants</b> : rien ne bloque, la cloche propose le lien'],
      art: 'list', accent: '#33658a', accent2: '#3d6bb5', dur: 7000 },
    { title: 'Le <em>double-clic</em> entre les blocs', text: 'Double-cliquez sous le dernier bloc, entre deux blocs ou au-dessus du premier : un paragraphe s’insère à cet endroit, aussi en vue par pages.',
      bullets: ['<b>Sous le dernier bloc</b> : bas de la feuille, fin de page ou fond gris', '<b>Entre deux blocs</b> espacés : titre, tableau, image', '<b>Au-dessus du premier</b> : un paragraphe en tête'],
      art: 'text', accent: '#b3762a', accent2: '#33658a', dur: 7500 },
    { title: 'Chacun ses <em>spécialités</em>', text: 'Les blocs d’une spécialité que vous n’avez pas choisie ne s’insèrent plus, par aucune porte.',
      bullets: ['<b>Barre d’outils, bibliothèque de formules, graphiques</b> : filtrés selon votre profil', '<b>Collés depuis un autre cours</b> : ils deviennent du texte simple', '<b>Profil conservé</b> lors de la synchronisation entre appareils'],
      art: 'cards', accent: '#8a4b9c', accent2: '#c04343', dur: 7500 },
    { title: 'Les fautes <em>mineures</em> se corrigent seules', text: 'Un accent oublié, une lettre doublée ou inversée repérés plus tard par l’IA : la correction s’applique comme une faute de frappe, sans Tab.',
      bullets: ['<b>Un seul mot</b>, d’une lettre ou d’un accent, vers un mot connu', '<b>Ctrl+Z</b> pour revenir ; le mot est appris', '<b>Accords et homophones</b> restent proposés sous le paragraphe'],
      art: 'text', accent: '#c04343', accent2: '#b3762a', dur: 7500 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.28.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'Une <em>correction</em> pour le quiz', text: 'Le fichier audio personnalisé s’importe à nouveau.', dur: 4500 },
    { title: 'Votre <em>musique</em> dans le quiz', text: 'Dans Quiz › Apparence › Musique, « Mon fichier audio » marche de nouveau : le bouton Choisir… ouvre bien la boîte de sélection.',
      bullets: ['<b>Choisir…</b> : un morceau à vous (25 Mo au plus), gardé sur cet appareil', '<b>Écoute ▶</b> des musiques intégrées de nouveau active', '<b>Thèmes</b> : les vignettes se choisissent comme avant'],
      art: { icon: '🎧' }, accent: '#8a4b9c', accent2: '#b3762a', dur: 8000 },
    { title: 'Pour mémoire : l’IA est <em>ouverte</em>', text: 'Depuis la 1.28, la correction par IA tourne sur Qwen3.8-27B, un modèle libre : vous choisissez où il tourne dans Paramètres › Correction par IA.',
      bullets: ['<b>OpenRouter</b> ou <b>Alibaba Cloud</b> : un compte et une clé', '<b>Sur votre ordinateur</b> avec Ollama : gratuit, hors ligne, sans clé'],
      art: 'cards', accent: '#2e8b6a', accent2: '#33658a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});

AlixoWhatsNew.register('1.28.0', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'L’IA d’Alixo devient <em>ouverte</em>', text: 'Un modèle libre, que vous faites tourner où vous voulez — même sur votre ordinateur.', dur: 5000 },
    { title: 'Un modèle <em>ouvert</em> : Qwen3.8', text: 'La correction d’orthographe et de grammaire, l’analyse pendant la frappe et la mise en forme suggérée reposent sur un modèle libre.',
      bullets: ['<b>Licence Apache 2.0</b> : poids publiés, utilisables par tous', '<b>Aucun fournisseur imposé</b> : Alixo ne dépend plus de xAI ni de Google', '<b>Excellent en français</b>, même qualité de relecture'],
      art: { icon: '🔓' }, accent: '#2e8b6a', accent2: '#33658a', dur: 8000 },
    { title: 'Vous choisissez <em>où</em> il tourne', text: 'Dans Paramètres › Correction par IA, un menu « Où tourne le modèle » et un bouton Tester et enregistrer.',
      bullets: ['<b>OpenRouter</b> ou <b>Alibaba Cloud</b> : un compte, une clé, quelques centimes par cours', '<b>Sur votre ordinateur</b> avec Ollama : gratuit, hors ligne, sans clé', '<b>Un autre serveur</b> (établissement, association) : adresse et modèle libres'],
      art: 'cards', accent: '#33658a', accent2: '#b3762a', dur: 8500 },
    { title: 'Rien ne quitte votre <em>appareil</em>', text: 'Avec Ollama, le texte analysé ne sort pas de l’ordinateur ; ailleurs, seules les phrases relues sont envoyées au serveur choisi.',
      bullets: ['<b>Serveur, modèle et clé</b> restent sur l’appareil, jamais synchronisés', '<b>Anciennes clés xAI</b> ignorées : l’application propose le nouveau parcours', '<b>Clé attribuée</b> par l’administrateur : tout se configure seul'],
      art: 'list', accent: '#8a4b9c', accent2: '#2e8b6a', dur: 8000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5500 }
  ]
});
