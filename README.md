# MyLocalMatch — Données amateurs en direct

Ce dossier contient le robot qui va chercher chaque jour les calendriers de
matchs amateurs (LAuRAFoot) et publie le résultat pour que l'application
MyLocalMatch puisse l'afficher automatiquement.

## Ce que ça fait concrètement

Chaque jour à 8h (heure de Paris), un service gratuit de GitHub ("Actions")
ouvre un navigateur invisible, va sur les pages LAuRAFoot, lit les matchs
affichés, et enregistre le résultat dans `data/events-amateur.json`. L'appli
MyLocalMatch va lire ce fichier toutes les 15 minutes et à chaque fois que tu
la rouvres — donc elle se met à jour toute seule, sans que tu aies rien à faire
une fois que c'est en place.

## Mise en place (une seule fois, ~10 minutes)

### 1. Créer le dépôt GitHub

1. Va sur **github.com**, connecte-toi avec le compte que tu viens de créer
2. Clique sur le bouton vert **"New"** (nouveau dépôt)
3. Nom du dépôt : `mylocalmatch-live-data`
4. Coche **"Public"** (nécessaire pour que l'appli puisse lire les données sans mot de passe)
5. Clique **"Create repository"**

### 2. Envoyer les fichiers de ce dossier

Le plus simple sans ligne de commande :

1. Sur la page de ton nouveau dépôt, clique **"uploading an existing file"**
2. Glisse-dépose **tout le contenu** de ce dossier (`data/`, `scraper/`, `.github/`) — attention à bien garder la structure des sous-dossiers
3. Clique **"Commit changes"**

### 3. Activer le robot

1. Va dans l'onglet **"Actions"** de ton dépôt GitHub
2. Si un message demande d'activer les workflows, clique pour confirmer
3. Tu devrais voir apparaître **"Mise à jour quotidienne des données MyLocalMatch"**
4. Clique dessus, puis sur **"Run workflow"** (bouton à droite) pour le lancer une première fois manuellement, sans attendre le lendemain

### 4. Vérifier que ça a marché

1. Après 1-2 minutes, actualise la page — un ✅ vert doit apparaître
2. Si c'est un ❌ rouge, clique dessus pour voir le détail : copie-moi le message d'erreur, je corrige le script
3. Va dans `data/events-amateur.json` sur GitHub — le contenu doit avoir changé (plus de matchs qu'au départ, ou au moins un `generatedAt` rempli)

### 5. Brancher l'appli sur ces données

Dans le fichier `MyLocalMatch-App.html`, cherche la ligne :

```js
const AMATEUR_DATA_URL = "https://cdn.jsdelivr.net/gh/VOTRE-COMPTE/mylocalmatch-live-data@main/data/events-amateur.json";
```

Remplace `VOTRE-COMPTE` par ton nom d'utilisateur GitHub (visible en haut à
droite du site). Redépose ensuite le fichier sur Netlify comme d'habitude.

## Si le nombre de matchs extraits est bas ou nul

C'est probable au premier essai : je n'ai pas pu observer moi-même à quoi
ressemble la page une fois chargée (mes outils ne peuvent pas exécuter le
JavaScript du site), donc le script part d'une estimation raisonnable de sa
structure. Deux façons de corriger ça ensemble :

- Va dans l'onglet **Actions** → le dernier passage → ouvre les logs : ils
  indiquent combien de lignes ont été trouvées et reconnues par compétition.
- Regarde s'il existe des fichiers `data/debug-*.txt` dans le dépôt : ils
  contiennent le texte brut que le robot a vu mais n'a pas su interpréter.
  Copie-colle-moi quelques lignes de ces fichiers, j'ajuste le script de
  reconnaissance en conséquence.

## Étendre à d'autres compétitions ou villes

- Pour suivre d'autres poules/championnats : ouvre `scraper/scrape-laura.js`,
  ajoute une ligne dans le tableau `COMPETITIONS` en copiant le format d'URL
  trouvé sur laurafoot.fff.fr après avoir sélectionné une poule.
- Pour qu'une ville soit correctement placée sur la carte : ajoute-la dans
  `data/communes-laura.json` avec ses coordonnées GPS (cherche "<ville>
  coordonnées GPS" sur le web).

## Les matchs professionnels (OL, etc.)

Ce robot ne touche pas aux matchs professionnels (Ligue 1) : ceux-ci restent
saisis directement dans l'application, vérifiés via une source sportive
officielle à chaque fois que tu me demandes de les rafraîchir. C'est un choix
volontaire — cette source est plus fiable qu'un site à faire tourner soi-même,
donc pas besoin de l'automatiser de la même façon.
