# Habit Tracker PWA

Application de suivi d'habitudes installable sur iPhone et Android.

## 🚀 Mise en ligne (de zéro à app installée sur iPhone)

### Étape 1 — Préparer l'environnement local

```bash
# Installer les dépendances (une seule fois)
npm install

# Lancer le serveur de dev pour tester
npm run dev
# → ouvre http://localhost:5173 dans ton navigateur
```

Tu peux aussi tester sur ton téléphone si l'ordi et le téléphone sont sur le même Wi-Fi : Vite affiche une URL "Network" du genre `http://192.168.1.x:5173` que tu peux ouvrir depuis Safari sur ton iPhone.

### Étape 2 — Mettre le code sur GitHub

1. Va sur [github.com](https://github.com) et crée un nouveau repository (publique ou privé, peu importe). Donne-lui un nom, par ex. `habit-tracker`.
2. Sur ton ordi, dans le dossier du projet :

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/habit-tracker.git
git push -u origin main
```

### Étape 3 — Déployer sur Vercel (gratuit, 2 minutes)

1. Va sur [vercel.com](https://vercel.com) et crée un compte (utilise "Continue with GitHub")
2. Clique sur "Add New" → "Project"
3. Choisis ton repo `habit-tracker` et clique "Import"
4. Vercel détecte automatiquement Vite. Laisse les paramètres par défaut.
5. Clique "Deploy". Attends ~30 secondes.
6. ✅ Tu as une URL du genre `habit-tracker-xxx.vercel.app`

### Étape 4 — Installer la PWA sur ton iPhone

1. Ouvre l'URL Vercel dans **Safari** (pas Chrome — important sur iOS)
2. Tap sur l'icône **partager** (le carré avec une flèche vers le haut, en bas de l'écran)
3. Fais défiler et tap sur **"Sur l'écran d'accueil"** ou "Add to Home Screen"
4. Confirme. ✅ Une icône apparaît sur ton home screen.
5. Tap dessus → l'app s'ouvre en plein écran, sans la barre d'URL Safari.

## 🔧 Structure du projet

```
habit-tracker/
├── public/                  # Fichiers statiques (icônes, manifest)
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-512-maskable.png
│   ├── apple-touch-icon.png
│   └── favicon.svg
├── src/
│   ├── main.jsx             # Point d'entrée React
│   ├── HabitTracker.jsx     # Toute l'app
│   └── index.css            # Reset CSS minimal
├── index.html               # HTML racine
├── vite.config.js           # Config Vite + plugin PWA
├── package.json
└── README.md
```

## 📝 Notes importantes

- Les données sont stockées dans le **`localStorage`** du navigateur, pas sur un serveur.
- Si tu changes de téléphone, les données ne suivent pas automatiquement → utilise l'**Export** dans les Paramètres.
- L'app fonctionne **hors ligne** une fois installée (grâce au service worker).
- Pour mettre à jour l'app : push sur GitHub, Vercel re-déploie automatiquement.

## 🎨 Personnaliser

- **Nom de l'app** : modifie `name` dans `vite.config.js` (manifest) et `<title>` dans `index.html`.
- **Icône** : remplace les fichiers PNG dans `public/` (mêmes noms et dimensions).
- **Couleur de fond** au lancement : modifie `theme_color` et `background_color` dans `vite.config.js`.
