/* ============================================================
   Alixo — blocs dans des blocs, copie et collage de tableaux.
   Chargé APRÈS app.js : utilise ses fonctions globales.

   Un bloc imbriqué (« .nb ») vit dans le texte de son conteneur — le texte d'un encadré
   ou d'une citation (.btxt), une case de tableau (.tcell), ou un autre bloc imbriqué —
   et il est enregistré avec lui, en HTML (b.text, b.rows[r][c]). Le modèle du cours reste
   donc une simple liste de blocs : synchronisation, historique, partage et export n'ont
   rien à connaître de l'imbrication.

     <table class="nb nb-tbl [has-head]"><tbody><tr><td>…</td></tr></tbody></table>
     <blockquote class="nb nb-quote">…</blockquote>
     <div class="nb nb-call" data-ct="exemple" style="--cc-light:…; --cc-dark:…">
       <div class="nb-title" contenteditable="false">Exemple</div><div class="nb-body">…</div></div>

   Clavier : Tab = case suivante (nouvelle ligne à la fin) ; Entrée = saut de ligne, Entrée sur
   une ligne vide en fin de citation / d'encadré = sortie ; Ctrl+Entrée = sortie ; Retour arrière
   au début = le bloc imbriqué redevient du texte (ou disparaît s'il est vide).
   ============================================================ */
'use strict';

window.AlixoNest = (() => {
  const root = document.getElementById('blocks');
  const PART_SEL = '.nb-tbl td, .nb-quote, .nb-body';
  const MAX_DEPTH = 3;
  const INLINE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'FONT', 'SUP', 'SUB', 'MARK', 'A']);
  const CC = { definition: ['#3d6bb5', '#7fa4dc'], arret: ['#8c4351', '#c98795'], controverse: ['#7a6852', '#b3a186'], retenir: ['#b3762a', '#d3a05e'], exemple: ['#2e8b6a', '#5cb896'], bilan: ['#5b6b8c', '#9aa9c9'] };

  /* ---------------- HTML des blocs imbriqués ---------------- */
  const td = h => `<td>${h || '<br>'}</td>`;
  function tableHTML(rows, head) {
    const nc = Math.max(1, ...rows.map(r => r.length));
    return `<table class="nb nb-tbl${head ? ' has-head' : ''}"><tbody>${rows.map(r => `<tr>${Array.from({ length: nc }, (_, c) => td(r[c])).join('')}</tr>`).join('')}</tbody></table>`;
  }
  const quoteHTML = t => `<blockquote class="nb nb-quote">${t || '<br>'}</blockquote>`;
  function calloutHTML(ct, t) {
    const c = CALLOUTS[ct] || CALLOUTS.retenir;
    const col = c.color ? [c.color, c.dark || c.color] : (CC[ct] || CC.retenir);
    return `<div class="nb nb-call" data-ct="${esc(ct)}" style="--cc-light:${col[0]}; --cc-dark:${col[1]}"><div class="nb-title" contenteditable="false">${esc(c.name)}</div><div class="nb-body">${t || '<br>'}</div></div>`;
  }

  /* ---------------- où est le curseur ? ---------------- */
  function caretInfo() {
    const sel = getSelection(); if (!sel.rangeCount) return null;
    const n = sel.focusNode; const el = n && (n.nodeType === 3 ? n.parentElement : n);
    if (!el || !root.contains(el)) return null;
    const field = el.closest(FIELD_SEL);
    if (!field || !root.contains(field)) return null;
    let part = el.closest(PART_SEL);
    if (part && !field.contains(part)) part = null;
    const blockEl = field.closest('#blocks > .block');
    return { sel, el, field, part, nb: part ? part.closest('.nb') : null, blockEl };
  }
  const depthOf = el => { let d = 0; for (let p = el; p && p !== root; p = p.parentElement) if (p.classList && p.classList.contains('nb')) d++; return d; };
  /* le champ accepte-t-il des blocs imbriqués ? → 'cell' (case de tableau), 'box' (encadré, citation) ou null */
  function nestKind(field, blockEl) {
    if (!field || !blockEl || readOnly) return null;
    if (field.classList.contains('tcell')) return 'cell';
    if (field.classList.contains('btxt') && (blockEl.classList.contains('callout') || blockEl.classList.contains('quote'))) return 'box';
    return null;
  }
  function nestKindAt(blockEl, inline) {
    const field = inline && inline.field ? inline.field : (blockEl ? blockEl.querySelector(':scope > .btxt') : null);
    return nestKind(field, blockEl);
  }
  function canNestHere() {
    const i = caretInfo();
    return !!(i && nestKind(i.field, i.blockEl) && depthOf(i.el) < MAX_DEPTH);
  }

  /* ---------------- curseur ---------------- */
  function caretTo(node, atEnd) {
    const r = document.createRange();
    r.selectNodeContents(node);
    // fin d'une partie terminée par un <br> de remplissage : le curseur va avant lui
    if (atEnd && node.lastChild && node.lastChild.nodeName === 'BR') r.setEndBefore(node.lastChild);
    r.collapse(!atEnd);
    const host = node.isContentEditable ? (node.closest('[contenteditable="true"]') || root) : root;
    if (document.activeElement !== host) host.focus({ preventScroll: true });
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function caretAfter(nb) {
    if (!nb.nextSibling || (nb.nextSibling.nodeType === 1 && nb.nextSibling.classList.contains('nb'))) nb.after(document.createElement('br'));
    const r = document.createRange();
    let nx = nb.nextSibling;
    // juste après une citation, Chrome ramène le curseur DANS la citation : un caractère de largeur nulle
    // (retiré à l'enregistrement par cleanHTML) lui donne un point d'ancrage sans ambiguïté
    if (nx.nodeType !== 3) { nx = document.createTextNode('\u200B'); nb.after(nx); }
    if (nx.textContent.startsWith('\u200B')) r.setStart(nx, 1); else r.setStart(nx, 0);
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  const firstPart = nb => nb.matches('.nb-quote') ? nb : nb.querySelector(nb.matches('.nb-tbl') ? 'td' : '.nb-body');
  function lastPart(nb) {
    if (nb.matches('.nb-quote')) return nb;
    if (nb.matches('.nb-call')) return nb.querySelector(':scope > .nb-body');
    const cells = tableCells(nb); return cells[cells.length - 1] || null;
  }
  const tableCells = tbl => [...tbl.querySelectorAll(':scope > tbody > tr > td, :scope > tr > td')];
  const tableRows = tbl => [...tbl.querySelectorAll(':scope > tbody > tr, :scope > tr')];
  const isEmptyPart = p => !(p.textContent || '').replace(/\u200B/g, '').trim() && !p.querySelector('img, .nb, ' + ATOM_SEL);

  /* prévient l'application que le contenu du champ a changé (elle relit l'écran et enregistre) */
  function changed(field) {
    const f = field && field.isConnected ? field : null;
    (f || root).dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---------------- insertion au curseur ---------------- */
  function insertHTML(html) {
    const info = caretInfo(); if (!info) return null;
    const host = info.part || info.field;
    const r = info.sel.getRangeAt(0);
    if (!r.collapsed) r.deleteContents();
    const mk = document.createElement('span');
    r.insertNode(mk);
    // on sort des mises en forme (gras, couleur…) ; d'une liste ou d'un autre élément de structure : on se place après lui
    const chain = []; for (let p = mk.parentNode; p && p !== host; p = p.parentNode) chain.push(p);
    const hard = chain.filter(p => !INLINE_TAGS.has(p.nodeName));
    if (hard.length) chain[chain.length - 1].after(mk);
    else while (mk.parentNode !== host) {
      const p = mk.parentNode;
      const rr = document.createRange(); rr.setStartAfter(mk); rr.setEnd(p, p.childNodes.length);
      const tail = rr.extractContents();
      p.after(mk);
      if (tail.textContent || tail.querySelector('br, img')) { const clone = p.cloneNode(false); clone.appendChild(tail); mk.after(clone); }
      if (!p.textContent && !p.querySelector('br, img, .nb')) p.remove();
    }
    const tpl = document.createElement('template'); tpl.innerHTML = html.trim();
    const node = tpl.content.firstElementChild;
    mk.replaceWith(node);
    fixTails(info.field);
    return { node, field: info.field };
  }
  /* kind : 'table' | 'quote' | 'c-<type d'encadré>' */
  function insert(kind) {
    if (!canNestHere()) { toast('Ici, impossible d’imbriquer davantage'); return false; }
    const html = kind === 'table' ? tableHTML([['', ''], ['', '']], false) : kind === 'quote' ? quoteHTML('') : calloutHTML(kind.replace(/^c-/, ''), '');
    const res = insertHTML(html); if (!res) return false;
    caretTo(firstPart(res.node), false);
    changed(res.field);
    if (kind === 'table') toast('Tableau imbriqué — Tab : case suivante · clic droit : lignes et colonnes · Ctrl+Entrée : sortir');
    return true;
  }

  /* ---------------- remise en forme après une opération native ---------------- */
  /* un bloc imbriqué en fin de champ est suivi d'un <br> : sans lui, impossible de placer le curseur après */
  function fixTails(scope) {
    (scope || root).querySelectorAll('.nb').forEach(nb => {
      const nx = nb.nextSibling;
      if (!nx || (nx.nodeType === 1 && nx.classList.contains('nb')) || (nx.nodeType === 3 && !nx.textContent && !nx.nextSibling)) nb.after(document.createElement('br'));
    });
  }
  function normalize(scope) {
    const base = scope || root;
    base.querySelectorAll('.nb-tbl').forEach(tbl => {
      const rows = tableRows(tbl);
      if (!rows.length || !tableCells(tbl).length) { tbl.remove(); return; }
      const nc = Math.max(...rows.map(tr => tr.children.length));
      rows.forEach(tr => { while (tr.children.length < nc) tr.appendChild(document.createElement('td')); });
      tableCells(tbl).forEach(c => { if (!c.childNodes.length) c.appendChild(document.createElement('br')); });
    });
    base.querySelectorAll('.nb-call').forEach(nb => {
      let body = nb.querySelector(':scope > .nb-body');
      if (!body) {
        // le corps a été avalé par une suppression : on le reconstitue avec ce qui reste
        body = document.createElement('div'); body.className = 'nb-body';
        [...nb.childNodes].filter(n => !(n.nodeType === 1 && n.classList.contains('nb-title'))).forEach(n => body.appendChild(n));
        nb.appendChild(body);
      }
      if (!nb.querySelector(':scope > .nb-title')) { const t = document.createElement('div'); t.className = 'nb-title'; t.contentEditable = 'false'; t.textContent = (CALLOUTS[nb.dataset.ct] || CALLOUTS.retenir).name; nb.prepend(t); }
      if (!body.childNodes.length) body.appendChild(document.createElement('br'));
    });
    base.querySelectorAll('.nb-quote').forEach(q => { if (!q.childNodes.length) q.appendChild(document.createElement('br')); });
    fixTails(base);
  }

  /* ---------------- tableau imbriqué : lignes et colonnes ---------------- */
  function cellPos(cell) { const tr = cell.parentElement; return { tr, r: tableRows(cell.closest('.nb-tbl')).indexOf(tr), c: [...tr.children].indexOf(cell) }; }
  function tableOpNested(cell, op) {
    const tbl = cell.closest('.nb-tbl'); if (!tbl) return;
    const field = tbl.closest(FIELD_SEL);
    const rows = tableRows(tbl); const { tr, r, c } = cellPos(cell);
    const nc = tr.children.length;
    const newRow = () => { const x = document.createElement('tr'); for (let i = 0; i < nc; i++) { const d = document.createElement('td'); d.appendChild(document.createElement('br')); x.appendChild(d); } return x; };
    const newCell = () => { const d = document.createElement('td'); d.appendChild(document.createElement('br')); return d; };
    let focus = cell;
    if (op === 'row+') { const x = newRow(); tr.after(x); focus = x.children[c]; }
    if (op === 'row-above') { const x = newRow(); tr.before(x); focus = x.children[c]; }
    if (op === 'col+') rows.forEach(x => { const d = newCell(); (x.children[c] || x.lastElementChild).after(d); if (x === tr) focus = d; });
    if (op === 'col-left') rows.forEach(x => { const d = newCell(); (x.children[c] || x.firstElementChild).before(d); if (x === tr) focus = d; });
    if (op === 'row-') { if (rows.length > 1) { focus = (rows[r + 1] || rows[r - 1]).children[c]; tr.remove(); } }
    if (op === 'col-') { if (nc > 1) { rows.forEach(x => { if (x.children[c]) x.children[c].remove(); }); focus = tr.children[Math.min(c, nc - 2)]; } }
    if (op === 'head') tbl.classList.toggle('has-head');
    if (op === 'del') { caretAfter(tbl); tbl.remove(); changed(field); toast('Tableau imbriqué supprimé — Ctrl+Z pour annuler'); return; }
    if (focus && focus.isConnected) caretTo(focus, true);
    changed(field);
  }
  /* bloc imbriqué → texte simple (son contenu reste, l'habillage disparaît) */
  function unwrap(nb) {
    const field = nb.closest(FIELD_SEL);
    const part = nb.matches('.nb-tbl') ? null : firstPart(nb);
    const frag = document.createDocumentFragment();
    if (part) while (part.firstChild) frag.appendChild(part.firstChild);
    else tableRows(nb).forEach((tr, i) => { if (i) frag.appendChild(document.createElement('br')); [...tr.children].forEach((c, k) => { if (k) frag.appendChild(document.createTextNode(' | ')); while (c.firstChild) { if (c.firstChild.nodeName === 'BR' && !c.firstChild.nextSibling) c.firstChild.remove(); else frag.appendChild(c.firstChild); } }); });
    const first = frag.firstChild;
    const prev = nb.previousSibling;
    if (prev && !(prev.nodeName === 'BR') && !(prev.nodeType === 1 && prev.classList.contains('nb')) && (prev.textContent || '').trim()) nb.before(document.createElement('br'));
    const last = frag.lastChild;
    if (last && last.nodeName !== 'BR' && nb.nextSibling && nb.nextSibling.nodeName !== 'BR') frag.appendChild(document.createElement('br'));
    nb.replaceWith(frag);
    const r = document.createRange();
    if (first && first.isConnected) { if (first.nodeType === 3) r.setStart(first, 0); else r.setStartBefore(first); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    changed(field);
  }
  function removeNb(nb) {
    const field = nb.closest(FIELD_SEL);
    caretAfter(nb); nb.remove();
    changed(field);
  }

  /* ---------------- clavier (phase de capture : avant les règles générales de l'éditeur) ---------------- */
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  /* élément collé au curseur, avant (dir -1) ou après (dir 1), en traversant les mises en forme */
  function adjacentEl(range, dir, host) {
    let node = range.startContainer, off = range.startOffset;
    if (node.nodeType === 3) {
      if (dir < 0 ? off > 0 : off < node.length) { if ((dir < 0 ? node.textContent.slice(0, off) : node.textContent.slice(off)).replace(/\u200B/g, '')) return null; }
      off = [...node.parentNode.childNodes].indexOf(node) + (dir < 0 ? 0 : 1); node = node.parentNode;
    }
    for (;;) {
      let sib = node.childNodes[dir < 0 ? off - 1 : off];
      while (sib && sib.nodeType === 3 && !sib.textContent.replace(/\u200B/g, '')) sib = dir < 0 ? sib.previousSibling : sib.nextSibling;
      if (sib) return sib.nodeType === 1 ? sib : null;
      if (node === host || !node.parentNode) return null;
      off = [...node.parentNode.childNodes].indexOf(node) + (dir < 0 ? 0 : 1); node = node.parentNode;
    }
  }
  function cellsInRange(r) { return [...root.querySelectorAll('.nb-tbl td')].filter(c => r.intersectsNode(c)); }

  root.addEventListener('keydown', e => {
    if (slashCtx || e.isComposing || readOnly) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const info = caretInfo(); if (!info) return;
    const mod = e.ctrlKey || e.metaKey;
    const sel = info.sel, r = sel.getRangeAt(0);
    const { part, nb, field } = info;

    /* « / » dans une case de tableau ou dans un bloc imbriqué : menu d'insertion */
    if (e.key === '/' && !mod && !e.altKey && sel.isCollapsed && (part || field.classList.contains('tcell')) && nestKind(field, info.blockEl)) {
      const before = lineBeforeCaret(part || field);
      if (before !== null && /(^|\s)$/.test(before.replace(/\u200B/g, ''))) { stop(e); openSlashMenu(info.blockEl, { field, range: r.cloneRange() }); }
      return;
    }

    if (!part) {
      // curseur juste après / juste avant un bloc imbriqué : on y entre au lieu de le démolir
      if ((e.key === 'Backspace' || e.key === 'Delete') && !mod && sel.isCollapsed && field.querySelector('.nb')) {
        const adj = adjacentEl(r, e.key === 'Backspace' ? -1 : 1, field);
        if (adj && adj.classList.contains('nb')) { stop(e); const p = e.key === 'Backspace' ? lastPart(adj) : firstPart(adj); if (p) caretTo(p, e.key === 'Backspace'); }
      }
      return;
    }

    /* sélection à cheval sur plusieurs cases : on vide les cases, la grille reste entière */
    if (!sel.isCollapsed && part.matches('td')) {
      const cells = cellsInRange(r);
      if (cells.length > 1 && (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter' || (!mod && e.key.length === 1))) {
        if (e.key.length !== 1 || e.key === ' ') stop(e); else e.stopPropagation();
        cells.forEach(c => { c.innerHTML = '<br>'; });
        caretTo(cells[0], false);
        if (e.key.length !== 1 || e.key === ' ') changed(field);
        return;
      }
    }

    if (e.key === 'Enter' && mod) { stop(e); caretAfter(nb); return; }

    if (part.matches('td')) {
      if (e.key === 'Tab') {
        stop(e);
        const cells = tableCells(nb); const i = cells.indexOf(part);
        if (e.shiftKey) { if (cells[i - 1]) caretTo(cells[i - 1], true); return; }
        if (cells[i + 1]) { caretTo(cells[i + 1], true); return; }
        tableOpNested(part, 'row+');
        const rows = tableRows(nb); caretTo(rows[rows.length - 1].children[0], false);
        return;
      }
      if (e.key === 'Enter' && !mod) { if (info.el.closest('li')) { e.stopPropagation(); return; } stop(e); document.execCommand('insertLineBreak'); return; }
      if (e.key === 'Backspace' && !mod && sel.isCollapsed && caretAtStart(part)) {
        stop(e);
        if (tableCells(nb).every(isEmptyPart)) removeNb(nb);
        else { const cells = tableCells(nb); const i = cells.indexOf(part); if (i > 0) caretTo(cells[i - 1], true); }
        return;
      }
      if (e.key === 'Delete' && !mod && sel.isCollapsed && caretAtEnd(part)) { stop(e); return; }
      if (e.key === 'Escape') { stop(e); caretAfter(nb); return; }
      // les autres touches (texte, flèches, raccourcis de mise en forme) restent natives, sans les règles du bloc parent
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab') e.stopPropagation();
      return;
    }

    /* citation ou encadré imbriqué */
    if (e.key === 'Enter' && !mod && !e.shiftKey) {
      stop(e);
      if (isEmptyPart(part)) { removeNb(nb); return; }
      if (caretAtEnd(part) && /(<br\s*\/?>\s*){2}$/i.test(part.innerHTML)) {
        while (part.lastChild && part.lastChild.nodeName === 'BR') part.lastChild.remove();
        caretAfter(nb); changed(field); return;
      }
      if (enterInBulletLine(part)) return;
      document.execCommand('insertLineBreak');
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) { stop(e); document.execCommand('insertLineBreak'); return; }
    if (e.key === 'Backspace' && !mod && sel.isCollapsed && caretAtStart(part)) { stop(e); if (isEmptyPart(part)) removeNb(nb); else unwrap(nb); return; }
    if (e.key === 'Delete' && !mod && sel.isCollapsed && caretAtEnd(part)) { stop(e); return; }
    if (e.key === 'Tab') { stop(e); return; }
    if (e.key === 'Escape') { stop(e); caretAfter(nb); return; }
  }, true);

  /* ---------------- menu contextuel d'un bloc imbriqué ---------------- */
  let cmCell = null, cmNb = null;
  root.addEventListener('contextmenu', e => {
    const nb = e.target.closest && e.target.closest('.nb'); if (!nb || !root.contains(nb) || e.target.closest('a.lnk') || readOnly) return;
    e.preventDefault(); e.stopPropagation();
    cmNb = nb; cmCell = nb.matches('.nb-tbl') ? e.target.closest('td') : null;
    if (cmCell && cmCell.closest('.nb-tbl') !== nb) cmCell = null;
    const menu = $('#ctxmenu');
    const I = CM_ICO;
    if (nb.matches('.nb-tbl')) {
      const pos = cmCell ? cellPos(cmCell) : null;
      menu.innerHTML = `<div class="cm-title">Tableau imbriqué${pos ? ` — ligne ${pos.r + 1}, colonne ${pos.c + 1}` : ''}</div>
        ${cmCell ? `<button data-ncm="row-above">${I.plus}Insérer une ligne au-dessus</button>
        <button data-ncm="row+">${I.plus}Insérer une ligne en dessous</button>
        <button data-ncm="col-left">${I.plus}Insérer une colonne à gauche</button>
        <button data-ncm="col+">${I.plus}Insérer une colonne à droite</button>
        <button data-ncm="row-">${I.trash}Supprimer la ligne</button>
        <button data-ncm="col-">${I.trash}Supprimer la colonne</button>
        <button data-ncm="head">${I.pen}${nb.classList.contains('has-head') ? 'Retirer la ligne d’en-tête' : 'Première ligne en en-tête'}</button>` : ''}
        <button data-ncm="copy">${I.dup}Copier le tableau</button>
        <button data-ncm="unwrap">${I.pen}Convertir en texte</button>
        <button data-ncm="del" class="danger">${I.trash}Supprimer le tableau imbriqué</button>`;
    } else {
      const name = nb.matches('.nb-quote') ? 'Citation imbriquée' : 'Encadré imbriqué';
      menu.innerHTML = `<div class="cm-title">${name}</div>
        <button data-ncm="out">${I.open}Placer le curseur après</button>
        <button data-ncm="unwrap">${I.pen}Retirer l’habillage (garder le texte)</button>
        <button data-ncm="del" class="danger">${I.trash}Supprimer</button>`;
    }
    menu.dataset.fid = ''; menu.dataset.did = ''; menu.dataset.tbl = ''; menu.dataset.img = '';
    placeCtxMenu(menu, e.clientX, e.clientY);
  }, true);
  $('#ctxmenu').addEventListener('click', e => {
    const b = e.target.closest('[data-ncm]'); if (!b) return;
    const op = b.dataset.ncm, nb = cmNb, cell = cmCell;
    closeCtxMenu();
    if (!nb || !nb.isConnected) return;
    if (op === 'copy') { copyTable(tableToBlock(nb)); return; }
    if (op === 'unwrap') { unwrap(nb); return; }
    if (op === 'out') { caretAfter(nb); return; }
    if (op === 'del') { if (nb.matches('.nb-tbl')) tableOpNested(cell || tableCells(nb)[0], 'del'); else removeNb(nb); return; }
    if (cell && cell.isConnected) tableOpNested(cell, op);
  });

  /* ---------------- tableaux : conversions ---------------- */
  /* tableau imbriqué (écran) → bloc tableau du modèle */
  function tableToBlock(tbl) {
    return { type: 'table', head: tbl.classList.contains('has-head'), rows: tableRows(tbl).map(tr => [...tr.children].map(c => cleanHTML(c.innerHTML))) };
  }
  /* bloc tableau → HTML autonome (presse-papiers : Word, Excel, e-mail…) */
  function blockTableHTML(b) {
    const rows = b.rows || [];
    // 1.21 : cases fusionnées (b.spans) → colspan / rowspan, cases couvertes omises
    const spans = Array.isArray(b.spans) ? b.spans.filter(x => x && (x.rs > 1 || x.cs > 1)) : [];
    const covered = new Set(), anchor = new Map();
    spans.forEach(x => { anchor.set(x.r + ':' + x.c, x); for (let r = x.r; r < x.r + (x.rs || 1); r++) for (let c = x.c; c < x.c + (x.cs || 1); c++) if (r !== x.r || c !== x.c) covered.add(r + ':' + c); });
    return `<table border="1" style="border-collapse:collapse">${rows.map((r, ri) => `<tr>${r.map((c, ci) => { if (covered.has(ri + ':' + ci)) return ''; const sp = anchor.get(ri + ':' + ci); const bg = Array.isArray(b.bg) && b.bg[ri] ? b.bg[ri][ci] : ''; const tag = b.head && ri === 0 ? 'th' : 'td'; return `<${tag}${sp ? ` colspan="${sp.cs}" rowspan="${sp.rs}"` : ''} style="padding:4px 8px${bg ? ';background:' + bg : ''}">${c || ''}</${tag}>`; }).join('')}</tr>`).join('')}</table>`;
  }
  const blockTableText = b => (b.rows || []).map(r => r.map(c => stripTags(String(c || '').replace(/<br\s*\/?>/gi, ' ')).replace(/\s+/g, ' ').trim()).join('\t')).join('\n');
  /* copie un tableau entier : format Alixo (recollable ici, imbriqué ou non) + HTML + texte tabulé */
  function copyTable(b) {
    const copy = JSON.parse(JSON.stringify(b)); delete copy.id; delete copy.notes; delete copy.day; delete copy.mod;
    const h = ev => {
      ev.clipboardData.setData('text/x-alixo', JSON.stringify([copy]));
      ev.clipboardData.setData('text/html', blockTableHTML(copy));
      ev.clipboardData.setData('text/plain', blockTableText(copy));
      ev.preventDefault(); ev.stopImmediatePropagation();
    };
    document.addEventListener('copy', h, true);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.removeEventListener('copy', h, true);
    if (!ok && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(blockTableText(copy)).catch(() => {});
    toast('Tableau copié — Ctrl+V pour le coller (dans le cours, une case, un encadré, ou dans Word / Excel)');
  }
  /* grille collée depuis Excel, Word, une page web ou une sélection de cases : [[html]] ou null */
  function gridFromClipboard(html, text) {
    if (html && /<table[\s>]/i.test(html)) {
      let parsed = null; try { parsed = new DOMParser().parseFromString(html, 'text/html'); } catch { parsed = null; }
      if (parsed) {
        const tables = [...parsed.body.querySelectorAll('table')].filter(t => !t.parentElement.closest('table'));
        if (tables.length === 1) {
          const t = tables[0];
          const outside = (parsed.body.textContent || '').replace(/\s+/g, '').length - (t.textContent || '').replace(/\s+/g, '').length;
          if (outside <= 0) {
            const rows = [...t.rows].filter(tr => tr.closest('table') === t).map(tr => [...tr.cells].map(c => (htmlToLines(c.innerHTML) || []).join('<br>')));
            const grid = rows.filter(r => r.length);
            if (grid.length) return grid;
          }
        }
      }
    }
    if (text && /\t/.test(text)) {
      const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
      if (lines.every(l => l.includes('\t') || !l.trim())) return lines.filter(l => l.trim()).map(l => l.split('\t').map(c => esc(c.trim())));
    }
    return null;
  }
  const squareUp = grid => { const nc = Math.max(1, ...grid.map(r => r.length)); return grid.map(r => Array.from({ length: nc }, (_, i) => r[i] || '')); };

  /* collage : renvoie true si géré ici (tableau imbriqué, grille versée dans les cases, tableau créé) */
  function handlePaste(field, { alx, html, text }) {
    if (!field || readOnly) return false;
    const info = caretInfo();
    const blockEl = field.closest('#blocks > .block'); const b = blockEl && getBlock(blockEl.dataset.id);
    if (!b) return false;
    const kind = nestKind(field, blockEl);
    let arr = null; if (alx) { try { arr = JSON.parse(alx); } catch { arr = null; } }
    const tblBlock = Array.isArray(arr) && arr.length === 1 && arr[0] && arr[0].type === 'table' && Array.isArray(arr[0].rows) ? arr[0] : null;

    // un tableau entier copié dans Alixo, collé dans un encadré, une citation ou une case → tableau imbriqué
    if (tblBlock && kind) {
      if (depthOf(info ? info.el : field) >= MAX_DEPTH) { toast('Ici, impossible d’imbriquer davantage'); return true; }
      const res = insertHTML(tableHTML(squareUp(tblBlock.rows), !!tblBlock.head));
      if (res) { caretAfter(res.node); changed(res.field); toast('Tableau collé dans le bloc'); }
      return true;
    }
    if (alx) return false;   // autres blocs Alixo : collage habituel

    const grid = gridFromClipboard(html, text);
    if (!grid) return false;
    const g = squareUp(grid);
    // dans un tableau imbriqué : la grille remplit les cases à partir de la case courante
    if (info && info.part && info.part.matches('td')) {
      const tbl = info.nb; const { r, c } = cellPos(info.part);
      while (tableRows(tbl).length < r + g.length) tableOpNested(tableRows(tbl)[tableRows(tbl).length - 1].children[0], 'row+');
      while (tableRows(tbl)[0].children.length < c + g[0].length) tableOpNested(tableRows(tbl)[0].lastElementChild, 'col+');
      const rows = tableRows(tbl);
      g.forEach((row, i) => row.forEach((v, k) => { rows[r + i].children[c + k].innerHTML = v || '<br>'; }));
      caretTo(rows[r + g.length - 1].children[c + g[0].length - 1], true);
      changed(field);
      return true;
    }
    // dans une case d'un tableau du cours : idem, sur le modèle
    if (field.classList.contains('tcell') && b.type === 'table' && Array.isArray(b.rows)) {
      if (g.length === 1 && g[0].length === 1) return false;
      const r0 = +field.dataset.r, c0 = +field.dataset.c;
      const nc0 = Math.max(1, ...b.rows.map(x => x.length));
      const needC = Math.max(nc0, c0 + g[0].length), needR = Math.max(b.rows.length, r0 + g.length);
      if (needC > nc0) { const w = tableWidths(b, nc0); const total = needC; b.widths = Array.from({ length: needC }, (_, i) => i < nc0 ? w[i] * nc0 / total : 100 / total); }
      for (const key of ['rows', 'bg', 'ta']) {
        if (!Array.isArray(b[key])) continue;
        while (b[key].length < needR) b[key].push([]);
        b[key].forEach(row => { while (row.length < needC) row.push(key === 'rows' ? '' : null); });
      }
      g.forEach((row, i) => row.forEach((v, k) => { b.rows[r0 + i][c0 + k] = v; }));
      touch(); renderBlocks('__none');
      focusTableCell(b.id, r0 + g.length - 1, c0 + g[0].length - 1);
      toast(`${g.length} × ${g[0].length} cases collées — Ctrl+Z pour annuler`);
      return true;
    }
    if (g.length < 2 && g[0].length < 2) return false;
    // dans un encadré / une citation : tableau imbriqué ; dans le texte du cours : nouveau bloc tableau
    if (kind === 'box') {
      const res = insertHTML(tableHTML(g, false));
      if (res) { caretAfter(res.node); changed(res.field); }
      return true;
    }
    if (field.classList.contains('btxt')) {
      if (isEmptyPara(b)) { resetBlock(b, { type: 'table', rows: g, head: false }); touch(); renderBlocks('__none'); focusTableCell(b.id, 0, 0); }
      else insertBlocksAtCaret([{ type: 'table', rows: g, head: false }]);
      toast(`Tableau collé (${g.length} × ${g[0].length})`);
      return true;
    }
    return false;
  }

  return { insert, nestKindAt, canNestHere, normalize, fixTails, handlePaste, copyTable, blockTableHTML, blockTableText, tableHTML };
})();
