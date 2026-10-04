/* Page /versions/ : toutes les versions d'Alixo et leurs notes, depuis /releases.json. */
(function () {
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* markdown minimal et sûr (texte échappé avant tout) : titres, listes, gras, italique, code, liens alixoapp.com */
  function render(md) {
    var lines = String(md || '').replace(/\r/g, '').split('\n');
    var html = '', inList = false, first = true;
    var inline = function (t) {
      return esc(t)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/&lt;(https:\/\/alixoapp\.com[^&\s]*)&gt;/g, '<a href="$1">$1</a>')
        .replace(/\[([^\]]+)\]\((https:\/\/alixoapp\.com[^)\s]*)\)/g, '<a href="$2">$1</a>');
    };
    var closeList = function () { if (inList) { html += '</ul>'; inList = false; } };
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { closeList(); continue; }
      line = line.replace(/^(-\s+)+/, '- ');
      var h = line.match(/^#{1,4}\s+(.*)/);
      if (h) { closeList(); if (!first) html += '<h4>' + inline(h[1]) + '</h4>'; first = false; continue; }
      var li = line.match(/^[-*]\s+(.*)/);
      if (li) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(li[1]) + '</li>'; first = false; continue; }
      closeList();
      if (first) { first = false; if (/^Nouveautés/i.test(line)) continue; }   /* première ligne = titre déjà affiché */
      html += '<p>' + inline(line) + '</p>';
    }
    closeList();
    return html;
  }
  var box = document.getElementById('vs-list');
  fetch('/releases.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !rel.history || !rel.history.length) throw new Error('vide');
      var latest = document.getElementById('vs-latest');
      if (latest) latest.textContent = 'Dernière version : Alixo ' + rel.version + (rel.date ? ' · ' + new Date(rel.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
      box.innerHTML = rel.history.map(function (r, i) {
        var date = r.date ? new Date(r.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        var title = (r.notes || '').split('\n')[0].replace(/^#+\s*/, '').replace(/^(Nouveautés|Alixo)\s+[\d.]+\s*[—–:-]?\s*/i, '').trim();
        return '<details class="vs-item"' + (i === 0 ? ' open' : '') + ' id="v' + esc(r.version) + '">' +
          '<summary><span class="vs-ver">Alixo ' + esc(r.version) + '</span>' + (title && !/^[-*]/.test(title) ? '<span class="vs-title">' + esc(title) + '</span>' : '') + (date ? '<span class="vs-date">' + esc(date) + '</span>' : '') + '</summary>' +
          '<div class="vs-notes">' + (render(r.notes) || '<p class="sys-small">Pas de notes pour cette version.</p>') + '</div></details>';
      }).join('');
      if (location.hash) { var t = document.querySelector(location.hash); if (t && t.tagName === 'DETAILS') { t.open = true; t.scrollIntoView(); } }
    })
    .catch(function () { box.innerHTML = '<p class="sys-small">Les versions ne peuvent pas être affichées pour le moment. Réessayez dans un instant.</p>'; });
})();
