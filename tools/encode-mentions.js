#!/usr/bin/env node
/* Chiffre les données obligatoires (mentions légales, contact) pour defi.js.
   Usage : node tools/encode-mentions.js tools/mentions.json > mentions-data.js
   Le fichier mentions.json N'EST PAS publié (il est dans .gitignore) : seul le résultat chiffré l'est.
   Clé = SHA-256(salt + ':' + n + '|alixo-mentions') où n est le plus petit nonce dont SHA-256(salt:n) commence par
   `bits` bits à zéro : le navigateur doit résoudre cette preuve de travail pour déchiffrer (defi.js fait le même
   calcul). Changer le sel à chaque mise à jour des données. */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const src = process.argv[2]; if (!src) { console.error('fichier JSON attendu'); process.exit(1); }
const fields = JSON.parse(fs.readFileSync(src, 'utf8'));
const bits = +(process.env.POW_BITS || 12);
const salt = crypto.randomBytes(12).toString('base64url');
let n = 0; for (;; n++) { const h = crypto.createHash('sha256').update(salt + ':' + n).digest(); if ((((h[0] << 8) | h[1]) >>> (16 - bits)) === 0) break; }
const key = crypto.createHash('sha256').update(salt + ':' + n + '|alixo-mentions').digest();
const iv = crypto.randomBytes(12);
const c = crypto.createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([c.update(JSON.stringify(fields), 'utf8'), c.final(), c.getAuthTag()]);
process.stdout.write(`/* Données obligatoires chiffrées (voir defi.js et tools/encode-mentions.js) — générées le ${new Date().toISOString().slice(0, 10)}. Rien de lisible ici : c'est voulu. */\nwindow.ALIXO_MENTIONS = ${JSON.stringify({ salt, bits, iv: iv.toString('base64'), ct: ct.toString('base64') })};\n`);
