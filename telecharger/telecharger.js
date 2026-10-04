/* Pages /telecharger/windows/, /windows-portable/, /mac/ : lance le téléchargement du fichier de la dernière
   version (adresse lue dans /releases.json, généré à chaque publication) et affiche version, poids et date.
   Le site ne montre jamais l'hébergement des fichiers : seules ces pages y renvoient, en arrière-plan. */
(function () {
  var os = document.body.dataset.os || 'windows';
  var key = { windows: 'setup', portable: 'portable', mac: 'mac' }[os] || 'setup';
  var link = document.getElementById('dl-link');
  var status = document.getElementById('dl-status-txt');
  var auto = !/[?&]noauto/.test(location.search);
  var started = false;

  function fmtMo(size) { return size ? (size / 1048576).toFixed(size > 104857600 ? 0 : 1).replace('.', ',') + ' Mo' : ''; }
  function start(url) {
    if (started || !url) return;
    started = true;
    if (link) link.href = url;
    if (auto) setTimeout(function () { location.href = url; }, 400);   // navigation vers un fichier : la page reste affichée
  }
  function fail() {
    if (status) status.innerHTML = 'Impossible de préparer le téléchargement pour le moment. Réessayez dans un instant ou passez par la <a href="/index.html?site#telecharger">page de téléchargement</a>.';
    var dot = document.querySelector('#dl-status .sys-dot'); if (dot) dot.style.display = 'none';
  }

  fetch('/releases.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      var a = rel && rel.assets && rel.assets[key];
      if (!a || !a.url) { fail(); return; }
      var v = document.getElementById('dl-version'), s = document.getElementById('dl-size'), d = document.getElementById('dl-date');
      if (v && rel.version) v.textContent = 'Alixo ' + rel.version;
      if (s && a.size) { s.textContent = fmtMo(a.size); s.hidden = false; }
      if (d && rel.date) { d.textContent = 'publiée le ' + new Date(rel.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); d.hidden = false; }
      start(a.url);
    })
    .catch(fail);

  if (link) link.addEventListener('click', function (e) {
    if (!started) { e.preventDefault(); fail(); }
  });
})();
