/* ============================================================
   Alixo — versions personnalisées (1.19)
   Les clés des versions personnalisées ne sont pas dans la base : elles sont codées ici, en dur.
   Une clé saisie dans Paramètres › Alixo+ › Clé d'activation qui figure dans cette liste active la
   version personnalisée correspondante sur le compte (toutes les fonctions Alixo+ ouvertes, nom de la
   version affiché dans les Paramètres). Le panneau d'administration affiche cette liste, en lecture seule.

   Chaque entrée : { code, name, note, enabled }
   - code    : la clé, en majuscules, sans espaces (ex. ALXV-ECOLE-2026-XXXX)
   - name    : nom de la version affiché à l'utilisateur
   - note    : phrase affichée sous le nom (facultative)
   - enabled : false pour désactiver une clé sans la supprimer
   Chargé par app/index.html (avant app.js) et par admin/index.html.
   ============================================================ */
window.ALIXO_EDITIONS = [
  { code: 'ALXV-EXEMPLE-0000-0000', name: 'Version personnalisée (exemple)', note: 'Remplacez cette entrée dans app/js/editions.js.', enabled: false }
];
