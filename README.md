# 🐾 Vaya — Suivi Traitement (PWA)

Application web installable (PWA) pour suivre et cocher au fur et à mesure le protocole 28 jours de Vaya, synchronisée en temps réel avec Google Sheets.

## 1. Activer la mise à jour automatique du Google Sheet (1 minute)

1. Ouvre ton [Google Sheet Vaya](https://docs.google.com/spreadsheets/d/1VKHF8v74lzlDWnaVbuJROEJ1-RdQtYCQUq1g6ifH5iE/edit?gid=0#gid=0).
2. Dans le menu en haut, clique sur **Extensions → Apps Script**.
3. Supprime le code par défaut et colle tout le contenu du fichier `google-apps-script/Code.gs`.
4. Clique sur **Déployer** (en haut à droite) → **Nouveau déploiement**.
5. Choisis le type **Application Web** :
   - **Exécuter en tant que** : `Moi`
   - **Qui a accès** : `Tout le monde`
6. Clique sur **Déployer**, accepte les autorisations demandées, puis **copie l'URL** de l'application Web (elle se termine par `/exec`).
7. *(Optionnel)* Une fois le script déployé, tu peux même repasser ton Google Sheet en **Privé** : le script continuera de lire et écrire dedans en toute sécurité !

## 2. Mettre la PWA en ligne gratuitement (pour ton Android)

Pour qu'Android Chrome propose **« Installer l'application »**, la PWA doit être servie en **HTTPS** :
- **Option ultra-rapide (sans compte complexe)** : glisse-dépose le dossier `vaya-suivi/` sur [Netlify Drop](https://app.netlify.com/drop) → tu obtiens immédiatement une adresse `https://...netlify.app`.
- **Option GitHub Pages** : pousse ce dossier sur un dépôt GitHub et active *Settings → Pages*.

*(Astuce : si tu veux que l'URL de ton script soit déjà pré-remplie automatiquement sur tous tes appareils, colle-la dans `DEFAULT_SCRIPT_URL` en haut de `app.js` avant de déposer le dossier !)*

## 3. Installer sur ton téléphone Android

1. Ouvre l'adresse HTTPS de ton site dans **Google Chrome** sur ton Android.
2. Appuie sur le bouton ⚙️ (Paramètres) et colle l'URL `/exec` de ton Apps Script (si tu ne l'as pas mise dans `app.js`), puis clique sur **Enregistrer**.
3. Dans le menu `⋮` de Chrome (en haut à droite), appuie sur **Ajouter à l'écran d'accueil** → **Installer**.
4. L'icône 🐾 **Vaya Soins** apparaît sur ton écran d'accueil comme une vraie application !
