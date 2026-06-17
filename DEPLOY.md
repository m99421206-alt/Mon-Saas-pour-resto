# MenuGo — Guide de préparation et déploiement

Ce document décrit comment installer MenuGo en local (mode « prod-like »), initialiser la base de données, sécuriser l’API et valider le projet **avant** une mise en ligne.

Le déploiement réel (serveur, domaine, HTTPS, DNS) est une étape séparée — voir [Décisions reportées](#décisions-reportées-au-jour-j).

---

## Prérequis

- **Node.js** 18 ou plus (`backend/package.json`)
- **MySQL** 8+ (InnoDB, utf8mb4)
- Un éditeur / serveur statique pour le frontend (Live Server, nginx, Netlify, etc.)
- En production future : nom de domaine + certificat HTTPS (Let’s Encrypt)

---

## Structure du projet

| Composant | Emplacement | Rôle |
|-----------|-------------|------|
| Frontend | Racine + `frontend/`, `assets/` | Pages HTML/CSS/JS statiques |
| API | `backend/src/server.js` | Express, port 4000 par défaut |
| Base | MySQL | Données restaurants, plats, abonnements |
| Uploads | `backend/uploads/` | Images logo, bannière, plats (**doit être persistant** en prod) |

```text
Navigateur → Frontend statique → API (JSON) → MySQL
                              → /uploads/ (images)
```

---

## Installation locale (prod-like)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Éditez `backend/.env` : au minimum `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAILS`, `CORS_ORIGIN`.

### 2. Base MySQL

Créez la base (une seule fois) :

```sql
CREATE DATABASE MenuGo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Puis, depuis `backend/` :

```bash
npm run db:schema
```

### 3. Migrations (bases existantes ou compléments)

Sur une **base vierge**, `db:schema` applique le schéma principal. Les scripts ci-dessous ajoutent ou ajustent des colonnes/tables — la plupart sont **idempotents** (safe à relancer).

Exécutez-les **dans cet ordre** si vous partez d’une ancienne base ou si une migration a échoué à mi-chemin :

| Ordre | Commande | Rôle |
|-------|----------|------|
| 1 | `npm run db:schema` | Schéma initial (`sql/schema.sql`) |
| 2 | `npm run db:settings` | Colonnes restaurant (logo, bannière, thème…) |
| 3 | `npm run db:admin-timestamps` | Horodatage utilisateurs |
| 4 | `npm run db:audit-log` | Journal d’audit |
| 5 | `npm run db:user-status` | Statut compte utilisateur |
| 6 | `npm run db:admin-restaurants` | Données admin restaurants |
| 7 | `npm run db:admin-subscriptions` | Tables / colonnes abonnements admin |
| 8 | `npm run db:admin-platform-settings` | Paramètres plateforme |
| 9 | `npm run db:subscription-plan-key` | Clé de plan d’abonnement |
| 10 | `npm run db:onboarding` | Flags onboarding |
| 11 | `npm run db:registration-fields` | Champs inscription |
| 12 | `npm run db:product-is-visible` | Visibilité des plats sur le menu public |

**Base neuve (recommandé pour test)** : `db:schema` puis les migrations 2–12 si le schéma seul ne couvre pas encore toutes les colonnes utilisées par votre version du code.

> **Note :** `init-db.js` supprime automatiquement un BOM UTF-8 en tête de `schema.sql` (erreur MySQL fréquente sous Windows).

### 4. Démarrer l’API

```bash
npm start
# ou en dev : npm run dev
```

Vérification :

```bash
curl http://localhost:4000/health
# Attendu : {"ok":true,"service":"MenuGo-api","db":"up"}
```

### 5. Frontend

Servez la **racine du dépôt** (où se trouve `index.html`) avec un serveur HTTP statique.

Exemples :

- VS Code Live Server sur le dossier projet
- `npx serve .` à la racine

Ouvrez `index.html` ou `frontend/pages/login.html`.

**Configuration** : [`frontend/js/config.js`](frontend/js/config.js)

- `PUBLIC_SITE_ORIGIN` : laisser **vide** en prod (QR code = `window.location.origin`)
- `API_URL` : auto (`hostname:4000`) si API sur la même machine ; sinon URL API explicite
- `SUPPORT_WHATSAPP` : numéro support plateforme pour abonnements

---

## Checklist sécurité production

Avant toute mise en ligne, vérifiez dans `backend/.env` :

| Variable | Exigence |
|----------|----------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Clé longue aléatoire (ex. `openssl rand -hex 32`) |
| `ADMIN_EMAILS` | **Obligatoire** — emails admin séparés par des virgules |
| `CORS_ORIGIN` | URL exacte du frontend (ex. `https://app.votredomaine.com`) |
| `DB_*` | Identifiants MySQL dédiés, mot de passe fort |

Comportements activés en production :

- CORS LAN désactivé (seules les origines `CORS_ORIGIN` sont acceptées)
- Admin **bloqué** si `ADMIN_EMAILS` est vide
- Rate limit inscription (10 req/min/IP en prod)
- **Login : 5 échecs → blocage 15 min** (par email + IP, configurable via `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES`)
- **Isolation restaurant** : middleware `requireRestaurantOwner` sur `/api/products`, `/api/categories`, `/api/restaurant`, `/api/me`, `/upload` — refus **403** si `restaurant_id` étranger ou accès à un produit/catégorie d'un autre restaurant
- Headers sécurité (`helmet`)
- Erreurs 500 génériques (pas de stack trace exposée)

---

## Checklist tests manuels (local mode prod)

Simulez la production dans `backend/.env` :

```env
NODE_ENV=production
ADMIN_EMAILS=votre@email.com
CORS_ORIGIN=http://127.0.0.1:5500
JWT_SECRET=test_secret_local_assez_long_pour_jwt
```

Redémarrez l’API. Cochez chaque parcours :

| # | Parcours | Fichier / endpoint | OK |
|---|----------|-------------------|-----|
| 1 | Landing | `index.html` | ☐ |
| 2 | Inscription | `frontend/pages/register.html` → POST `/register` | ☐ |
| 3 | Connexion | `frontend/pages/login.html` → POST `/login` | ☐ |
| 4 | Onboarding | `frontend/pages/onboarding.html` | ☐ |
| 5 | Dashboard | `frontend/pages/dashboard.html` — stats, lien menu, QR | ☐ |
| 6 | Catégories | `frontend/pages/categories.html` — CRUD | ☐ |
| 7 | Plats | `frontend/pages/mes-plats.html` — CRUD + image | ☐ |
| 8 | Paramètres | `frontend/pages/parametres.html` — logo, bannière, thème | ☐ |
| 9 | Menu public | `frontend/pages/mon-menu.html?id=<restaurantId>` | ☐ |
| 10 | QR code | `frontend/pages/qr-code.html` — URL sans `PUBLIC_SITE_ORIGIN` | ☐ |
| 11 | Abonnement | `frontend/pages/mon-abonnement.html` | ☐ |
| 12 | Admin autorisé | `frontend/pages/admin-dashboard.html` avec email dans `ADMIN_EMAILS` | ☐ |
| 13 | Admin refusé | Même pages admin avec compte restaurant **non** listé → 403 | ☐ |
| 14 | Santé API | `GET /health` → `db: up` | ☐ |
| 15 | Upload | Paramètres ou Mes plats — image JPG/PNG | ☐ |

---

## Sauvegardes automatiques (données clients)

Chaque restaurant MenuGo repose sur **deux éléments** à sauvegarder ensemble :

| Élément | Contenu |
|---------|---------|
| **Base MySQL** | Comptes, restaurants, catégories, plats, abonnements, journal d’audit |
| **`backend/uploads/`** | Logos, bannières, photos des plats (URLs `/uploads/…` en base) |

### Lancer une sauvegarde manuelle

Depuis `backend/` :

```bash
npm run backup
```

Résultat dans `backups/menugo_YYYYMMDD_HHMMSS/` :

- `database.sql.gz` — export MySQL compressé
- `uploads.zip` (Windows) ou `uploads.tar.gz` (Linux/macOS)
- `manifest.json` — métadonnées

Variables optionnelles dans `.env` :

| Variable | Défaut | Rôle |
|----------|--------|------|
| `BACKUP_DIR` | `../backups` | Dossier de sortie |
| `BACKUP_RETENTION_DAYS` | `14` | Suppression auto des sauvegardes plus anciennes |
| `MYSQLDUMP_PATH` | auto | Chemin `mysqldump` si absent du PATH |

### Planifier (automatique)

**Windows — Planificateur de tâches**

1. Créer une tâche quotidienne (ex. 02:00)
2. Action : `powershell.exe -ExecutionPolicy Bypass -File "C:\chemin\backend\scripts\backup.ps1"`
3. Stocker les sauvegardes hors du projet (ex. `D:\Backups\MenuGo`) via `BACKUP_DIR` dans `.env`

**Linux — cron**

```cron
0 2 * * * /chemin/vers/backend/scripts/backup.sh >> /var/log/menugo-backup.log 2>&1
```

En production : copier les sauvegardes **hors site** (rsync, S3, snapshot disque).

### Restaurer une sauvegarde

```bash
npm run backup:restore -- ../backups/menugo_YYYYMMDD_HHMMSS
```

Confirmer avec `oui` quand demandé (ou `--yes` pour script).  
**Attention :** écrase la base courante et le dossier `uploads/`.

Restauration manuelle SQL :

```bash
gunzip -c backup/database.sql.gz | mysql -u USER -p MenuGo
```

Fréquence recommandée en prod : **quotidienne** + avant chaque migration majeure.

---

## Fichiers à ne pas déployer

| Exclure | Raison |
|---------|--------|
| `node_modules/` | Réinstaller avec `npm install` sur le serveur |
| `.env` | Secrets |
| `backend/uploads/` (vide au 1er deploy) | Créer le dossier avec droits d’écriture |
| `dossier de resto/` | Images de démo locales |
| `.git/` | Optionnel sur le serveur |

---

## Performance / cache navigateur

Optimisations déjà en place dans le code :

- **Images uploadées** : compressées et converties automatiquement en **WebP** à l’upload (`sharp`), redimensionnées à 1600px max. En-têtes de cache long (`Cache-Control: public, max-age=2592000, immutable`) servis par l’API sur `/uploads` (sûr car noms de fichiers uniques).
- **Assets statiques** (`assets/images/`, `docs/img/`) : servis en **WebP** dans le HTML/CSS/JS. Les PNG/JPG d’origine restent sur disque en backup mais ne sont plus référencés.
- **Polices & Font Awesome** : chargées en **non bloquant** (`media="print" onload`) sur toutes les pages → meilleur FCP/LCP.
- **Scripts** : tous chargés avec `defer`.
- **Menu client** : un seul appel API (`/menu/:id`), images `loading="lazy"`, bannière `fetchpriority="high"`.

À configurer côté **hébergeur statique** (nginx, Netlify, Vercel…) pour le CSS/JS du dossier `frontend/` :

```nginx
# Exemple nginx — cache long pour les assets statiques
location ~* \.(css|js)$ {
  add_header Cache-Control "public, max-age=604800";
}
location ~* \.(png|jpg|jpeg|webp|svg|woff2)$ {
  add_header Cache-Control "public, max-age=2592000, immutable";
}
```

> Note : si tu modifies un fichier CSS/JS, pense à versionner l’URL (`dashboard.css?v=2`) ou à vider le cache CDN, sinon les visiteurs garderont l’ancienne version en cache.

---

## Migration WebP (uploads existants + assets statiques)

**Avant toute migration** : sauvegarde obligatoire.

```bash
cd backend
npm run backup
```

### Uploads déjà en base (`backend/uploads/`)

Les **nouveaux** uploads sont déjà convertis à l’upload. Pour migrer les anciens PNG/JPG :

```bash
cd backend
npm run db:uploads-webp              # simulation (dry-run)
npm run db:uploads-webp -- --apply   # conversion + mise à jour MySQL
```

Met à jour : `restaurants.logo_url`, `restaurants.banner_url`, `products.image`, `product_variants.image`, et `upload_files` si présente. Les originaux PNG/JPG sont **conservés** sur disque.

### Assets statiques (`assets/images/`, `docs/img/`)

```bash
cd backend
npm run assets:webp                              # simulation
npm run assets:webp -- --apply --update-refs   # conversion + MAJ index.html / frontend / docs
```

Un rapport des fichiers code modifiés est écrit dans `backend/scripts/assets-webp-ref-report.json`.

---

## Stockage des uploads

Les images sont enregistrées dans `backend/uploads/`.

- **VPS** : dossier sur disque persistant, servi par l’API (`/uploads/…`) ou nginx
- **PaaS éphémère** (Railway, Render sans volume) : prévoir un volume attaché ou un stockage objet (S3, Cloudinary) — non implémenté dans cette version

---

## Décisions reportées au jour J

| Sujet | Options |
|-------|---------|
| Hébergement | VPS + nginx, PaaS (Railway/Render), frontend statique séparé (Netlify/Vercel) |
| Domaine | ex. `menugo.com`, sous-domaines `app.` / `api.` |
| HTTPS | Let’s Encrypt via Caddy ou nginx |
| Uploads | Disque VPS vs cloud |
| Paiement abonnement | WhatsApp manuel (actuel) vs passerelle future |
| Email | Validation format (actuel) vs confirmation par lien |

---

## Version de préparation

Lorsque les phases de préparation sont terminées, le dépôt peut être tagué :

```bash
git tag -a v0.9.0-preprod -m "MenuGo prêt pour déploiement (pré-production)"
```

---

## Dépannage rapide

| Problème | Piste |
|----------|-------|
| CORS bloqué | Vérifier `CORS_ORIGIN` = URL exacte du frontend (protocole + port) |
| `JWT_SECRET manquant` | Renseigner dans `.env` |
| Admin 503 | `ADMIN_EMAILS` vide en `NODE_ENV=production` |
| QR ne s’ouvre pas sur mobile | En dev, renseigner `PUBLIC_SITE_ORIGIN` avec l’IP LAN ; en prod, laisser vide |
| `/health` db down | MySQL arrêté ou mauvais `DB_*` |
