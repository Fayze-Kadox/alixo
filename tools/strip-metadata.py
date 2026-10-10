#!/usr/bin/env python3
"""Nettoyage des métadonnées des fichiers publiés (F-06) : EXIF, GPS, XMP, ICC et champ Auteur des images ;
   à lancer avant chaque ajout d'image dans img/ ou videos/ (les PDF se traitent avec `exiftool -all= fichier.pdf`).
   Usage : python3 tools/strip-metadata.py img/ videos/        (réécrit les fichiers en place)
           python3 tools/strip-metadata.py --check img/         (ne modifie rien, échoue si une métadonnée subsiste)"""
import sys, os
from PIL import Image

check = '--check' in sys.argv
paths = [p for p in sys.argv[1:] if not p.startswith('--')] or ['img']
KEEP = {'jfif', 'jfif_version', 'jfif_unit', 'jfif_density', 'progressive', 'progression', 'dpi', 'quality', 'subsampling', 'transparency', 'gamma', 'srgb', 'dpi', 'loop', 'duration'}
bad = 0; done = 0
for root in paths:
    for dp, _, files in os.walk(root):
        for f in files:
            if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')): continue
            p = os.path.join(dp, f)
            im = Image.open(p)
            meta = {k: v for k, v in im.info.items() if k not in KEEP}
            if not meta: continue
            if check: print('métadonnées :', p, list(meta)); bad += 1; continue
            data = list(im.getdata()); clean = Image.new(im.mode, im.size); clean.putdata(data)
            kw = {'quality': 90, 'optimize': True, 'progressive': True} if f.lower().endswith(('.jpg', '.jpeg')) else {'optimize': True}
            clean.save(p, **kw); done += 1; print('nettoyé :', p, list(meta))
if check and bad: sys.exit(1)
print('terminé :', done, 'fichier(s) réécrit(s)' if not check else 'fichier(s) à nettoyer')
