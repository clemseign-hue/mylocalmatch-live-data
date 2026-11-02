# MyLocalMatch — passation technique

Documentation complète (fonctionnalités, sources, règles) : https://claude.ai/artifact/ApogZNcbHTg5SuUn49d5WG

> Propriétaire : clemseign-hue, sans connaissance en code, travaille surtout depuis un iPhone. Réponses en français,
> étapes concrètes ; ne jamais lui demander de lire du code. Appli : https://clemseign-hue.github.io/mylocalmatch-live-data/

## Contenu du dépôt
- `app/` — appli React 18 + TypeScript + Vite + Tailwind (PWA, GitHub Pages). Deux pages : `index.html` (appli) et
  `admin.html` (affiches A6 + export CSV, non listée). Publiée par `.github/workflows/deploy-app.yml` à chaque push sur `app/`.
- `scrape-laura.js` — robot (Node 22) lancé par `.github/workflows/update-data.yml` chaque lundi 6 h UTC. API FFF
  `api-dofa.fff.fr` (via ScraperAPI sans rendu car GitHub est bloqué ; secret `SCRAPER_API_KEY`), reprise par page
  (`pages-state.json`), stades via Nominatim/Overpass (`stades-laura.json`), scores archivés (`resultats.json`).
  Produit `matchs-app.json` (format compact lu par l'appli) et `events-amateur.json`. Options manuelles :
  `--only=<texte>`, `--stades` (relocalisation sans FFF), `--app` (régénère matchs-app.json).
- `partenaires.json` — commerces partenaires (`"test": true` = visible seulement en mode test).
- `firestore.rules` — règles Firestore, à recoller dans la console Firebase à chaque modification.
- `discover-districts.js` — exploration ponctuelle des numéros de compétitions (≈1 crédit/requête).

## Compétitions suivies
R1 457860 (2 poules), R2 457861 (5), R3 457862 (10) ; district Drôme-Ardèche (cdg 125) : D1 452463 (1),
D2 452464 (2), D3 452465 (4), D4 452466 (6). Coupe de France retirée volontairement.

## Firebase (projet mylocalmatch-72926, offre Spark gratuite, pas de carte bancaire)
Auth anonyme + Firestore : `going`, `scans` (id = match_partenaire_uid → un coupon), `scans_test`, `pin_checks`,
`pins` (empreinte SHA-256 de `<id>:<pin>`). Admin (export) : uid `cJl9OVBDIIh0cPzbkuYbBE13njH2`. Pas de Google Analytics.

## Décisions du propriétaire à respecter
- Football uniquement ; pas de rugby/handball/basket (sources protégées, ne pas contourner).
- Pas de vert dans l'interface ; carte identique en clair et sombre ; ouverture sur Valence, filtre « Ce week-end ».
- « Ce week-end », « Cette semaine » et « J'y vais » = semaine en cours jusqu'au dimanche ; un « J'y vais » par jour ;
  verrou définitif désactivé (`FINAL_GOING_LOCK = false`).
- Pas d'onglet Résultats ni de filtre de distance (retirés à sa demande).
- Mode test : 5 touchers sur le titre (ou `?test=1`) ; rescans illimités, pas de contrôle 150 m, collection `scans_test`.
- Économiser les crédits ScraperAPI (1 000/mois) : ne pas relancer le robot complet sans raison.
