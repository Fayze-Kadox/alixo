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
   Aperçu : index.html?nouveautes=1.28.0 (ou nouveautes.html?v=1.28.0 en page seule).
   ============================================================ */
'use strict';

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

AlixoWhatsNew.register('1.27.1', {
  scenes: [
    { kind: 'intro', kicker: 'Mise à jour installée', title: 'La connexion Apple est prête,<br>et les nouveautés se présentent', text: 'Une correction attendue, et une nouvelle façon de découvrir ce qui change.' },
    { title: 'Connexion avec <em>Apple</em>', text: 'Le bouton « Continuer avec Apple » est prêt, dans le navigateur comme sur PC ; il s’active dès l’ouverture du service Apple d’Alixo.',
      bullets: ['<b>Navigateur</b> : une fenêtre s’ouvre, ou une redirection sur iPhone', '<b>Version PC</b> : le navigateur s’ouvre, puis revient tout seul dans Alixo', '<b>Prénom</b> transmis par Apple gardé dans votre profil'],
      art: { svg: '<svg viewBox="0 0 24 24" style="fill:var(--ink);stroke:none"><path d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.86-1.6.02-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.6-3.8Z"/><path d="M14.3 5.4c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z"/></svg>' },
      accent: '#5b6b8c', accent2: '#33658a', dur: 7500 },
    { title: 'Des <em>messages</em> qui expliquent', text: 'Quand une connexion échoue, Alixo dit pourquoi, en français.',
      bullets: ['<b>Fenêtre bloquée</b> par le navigateur : quoi autoriser', '<b>Compte déjà existant</b> avec un autre mode de connexion : lequel utiliser', '<b>Connexion annulée</b>, domaine non autorisé, service non activé'],
      art: 'list', accent: '#2e8b6a', accent2: '#b3762a', dur: 7000 },
    { title: 'Les <em>nouveautés</em> en images', text: 'Après chaque mise à jour, cette présentation vous montre ce qui change — c’est elle que vous regardez.',
      bullets: ['<b>Rejouable</b> depuis Paramètres › À propos', '<b>Pause</b>, précédent / suivant, Échap pour fermer', '<b>Aussi sur le site</b> : alixoapp.com/versions'],
      art: 'cards', accent: '#8a4b9c', accent2: '#33658a', dur: 7000 },
    { kind: 'outro', kicker: 'Bonne séance', title: 'C’est à vous.', text: 'Le détail est sur alixoapp.com/versions — et dans Paramètres › À propos.', dur: 5000 }
  ]
});
