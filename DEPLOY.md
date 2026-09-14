# AfricaMenu — Guide de préparation et déploiement

Ce document décrit comment installer AfricaMenu en local (mode « prod-like »), initialiser la base de données, sécuriser l’API et valider le projet **avant** une mise en ligne.

Le déploiement réel (serveur, domaine, HTTPS, DNS) est une étape séparée — voir [Décisions reportées](#décisions-reportées-au-jour-j).

---

## Prérequis

- **Node.js** 18 ou plus (`backend/package.json`)
- **MySQL** 8+ (InnoDB, utf8mb4)
- Un éditeur / serveur statique pour le frontend (Live Server, nginx, Netlify, etc.)
- En production future : nom de domaine + certificat HTTPS (Let’s Encrypt)

---

## Structure du projet

| Composant | Emplacement                     | Rôle                                                            |
| --------- | ------------------------------- | --------------------------------------------------------------- |
| Frontend  | Racine + `frontend/`, `assets/` | Pages HTML/CSS/JS statiques                                     |
| API       | `backend/src/server.js`         | Express, port 4000 par défaut                                   |
| Base      | MySQL                           | Données restaurants, plats, abonnements                         |
| Uploads   | `backend/uploads/`              | Images logo, bannière, plats (**doit être persistant** en prod) |

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

Après une mise à jour des dépendances (`git pull`), réinstallez et redémarrez l’API :

```bash
cd backend
npm install
npm audit --omit=dev   # attendu : 0 vulnérabilité
pm2 restart all        # ou votre commande de redémarrage
```

Éditez `backend/.env` : au minimum `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAILS`, `CORS_ORIGIN`.

### 2. Base MySQL

Créez la base (une seule fois) :

```sql
CREATE DATABASE AfricaMenu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Puis, depuis `backend/` :

```bash
npm run db:schema
```

### 3. Migrations base de données

#### Installation neuve (base vide)

```bash
cd backend
npm run db:schema
```

Le fichier [`backend/sql/schema.sql`](backend/sql/schema.sql) crée **toutes** les tables et colonnes de la version actuelle. Aucune migration incrémentielle n’est requise ensuite.

Pour générer les slugs manquants sur d’éventuels restaurants de test importés à la main :

```bash
npm run db:restaurant-slugs
```

#### Mise à jour d’une base existante (local ou VPS)

Après `git pull`, relancez **toutes** les migrations incrémentielles (idempotentes — safe à répéter) :

```bash
cd backend
npm run db:migrate-all
```

Équivalent manuel (même ordre) :

| Ordre | Commande | Rôle |
| ----- | -------- | ---- |
| 1 | `npm run db:settings` | Logo, bannière, thème, variantes produits |
| 2 | `npm run db:admin-timestamps` | `created_at` sur users / products |
| 3 | `npm run db:audit-log` | Table `audit_logs` |
| 4 | `npm run db:audit-impersonation` | Colonnes impersonation admin dans `audit_logs` |
| 5 | `npm run db:user-status` | `users.account_status` |
| 6 | `npm run db:admin-restaurants` | Ville, statut abo, menu suspendu, `created_at` restaurant |
| 7 | `npm run db:restaurant-slugs` | Colonne + index `slug`, génération pour lignes sans slug |
| 8 | `npm run db:admin-subscriptions` | Dates et montant abonnement |
| 9 | `npm run db:subscription-plan-key` | Clé de plan (`trial`, `monthly`, …) |
| 10 | `npm run db:admin-platform-settings` | Table `platform_settings` |
| 11 | `npm run db:onboarding` | Flags onboarding restaurant |
| 12 | `npm run db:registration-fields` | `full_name`, `phone`, `country` |
| 13 | `npm run db:product-is-visible` | `products.is_visible` (menu public) |
| 14 | `npm run db:admin-notifications` | Table `admin_notifications` |
| 15 | `npm run db:admin-notifications-group` | Regroupement / `updated_at` notifications |
| 16 | `npm run db:performance-indexes` | Index SQL performance |
| 17 | `npm run db:upload-registry` | Table `upload_files` (quota 100 images / restaurant) |

#### Déploiement VPS (checklist migrations)

```bash
cd /var/www/africamenu
git pull

cd backend
npm install
npm run db:migrate-all    # après chaque mise à jour backend
pm2 restart all
```

**Avant une migration risquée** (conversion WebP, grosse refonte) :

```bash
npm run backup
npm run db:migrate-all
# ou migration ciblée : npm run db:upload-registry
pm2 restart all
```

#### Migrations optionnelles (données / assets)

| Commande | Quand l’utiliser |
| -------- | ---------------- |
| `npm run db:uploads-webp` | Convertir d’anciens PNG/JPG déjà en base (dry-run puis `--apply`) |
| `npm run assets:webp` | Convertir images statiques marketing (`assets/`, `docs/`) |

> **Note :** `init-db.js` supprime automatiquement un BOM UTF-8 en tête de `schema.sql` (erreur MySQL fréquente sous Windows).

### 4. Démarrer l’API

```bash
npm start
# ou en dev : npm run dev
```

Vérification :

```bash
curl http://localhost:4000/health
# Attendu : {"ok":true,"service":"AfricaMenu-api","db":"up"}
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

| Variable       | Exigence                                                    |
| -------------- | ----------------------------------------------------------- |
| `NODE_ENV`     | `production`                                                |
| `JWT_SECRET`   | Clé longue aléatoire (ex. `openssl rand -hex 32`)           |
| `ADMIN_EMAILS` | **Obligatoire** — emails admin séparés par des virgules     |
| `CORS_ORIGIN`  | URL exacte du frontend (ex. `https://app.votredomaine.com`) |
| `DB_*`         | Identifiants MySQL dédiés, mot de passe fort                |

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

| #   | Parcours       | Fichier / endpoint                                                   | OK  |
| --- | -------------- | -------------------------------------------------------------------- | --- |
| 1   | Landing        | `index.html`                                                         | ☐   |
| 2   | Inscription    | `frontend/pages/register.html` → POST `/register`                    | ☐   |
| 3   | Connexion      | `frontend/pages/login.html` → POST `/login`                          | ☐   |
| 4   | Onboarding     | `frontend/pages/onboarding.html`                                     | ☐   |
| 5   | Dashboard      | `frontend/pages/dashboard.html` — stats, lien menu, QR               | ☐   |
| 6   | Catégories     | `frontend/pages/categories.html` — CRUD                              | ☐   |
| 7   | Plats          | `frontend/pages/mes-plats.html` — CRUD + image                       | ☐   |
| 8   | Paramètres     | `frontend/pages/parametres.html` — logo, bannière, thème             | ☐   |
| 9   | Menu public    | `https://votredomaine/restaurant/<slug>` (ou `/menu/<id>` legacy)     | ☐   |
| 10  | QR code        | `frontend/pages/qr-code.html` — URL sans `PUBLIC_SITE_ORIGIN`        | ☐   |
| 11  | Abonnement     | `frontend/pages/mon-abonnement.html`                                 | ☐   |
| 12  | Admin autorisé | `frontend/pages/admin-dashboard.html` avec email dans `ADMIN_EMAILS` | ☐   |
| 13  | Admin refusé   | Même pages admin avec compte restaurant **non** listé → 403          | ☐   |
| 14  | Santé API      | `GET https://votredomaine/health` → JSON `"db":"up"`                 | ☐   |
| 15  | Sitemap SEO    | `GET https://votredomaine/sitemap.xml` → XML avec `/restaurant/`     | ☐   |
| 16  | HTTPS          | `http://` redirige vers `https://`                                   | ☐   |
| 17  | Upload         | Paramètres ou Mes plats — image JPG/PNG                              | ☐   |

---

## Sauvegardes automatiques (données clients)

Chaque restaurant AfricaMenu repose sur **deux éléments** à sauvegarder ensemble :

| Élément                | Contenu                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| **Base MySQL**         | Comptes, restaurants, catégories, plats, abonnements, journal d’audit |
| **`backend/uploads/`** | Logos, bannières, photos des plats (URLs `/uploads/…` en base)        |

### Lancer une sauvegarde manuelle

Depuis `backend/` :

```bash
npm run backup
```

Résultat dans `backups/africamenu_YYYYMMDD_HHMMSS/` :

- `database.sql.gz` — export MySQL compressé
- `uploads.zip` (Windows) ou `uploads.tar.gz` (Linux/macOS)
- `manifest.json` — métadonnées

Variables optionnelles dans `.env` :

| Variable                | Défaut       | Rôle                                            |
| ----------------------- | ------------ | ----------------------------------------------- |
| `BACKUP_DIR`            | `../backups` | Dossier de sortie                               |
| `BACKUP_RETENTION_DAYS` | `14`         | Suppression auto des sauvegardes plus anciennes |
| `MYSQLDUMP_PATH`        | auto         | Chemin `mysqldump` si absent du PATH            |

### Planifier (automatique)

**Windows — Planificateur de tâches**

1. Créer une tâche quotidienne (ex. 02:00)
2. Action : `powershell.exe -ExecutionPolicy Bypass -File "C:\chemin\backend\scripts\backup.ps1"`
3. Stocker les sauvegardes hors du projet (ex. `D:\Backups\AfricaMenu`) via `BACKUP_DIR` dans `.env`

**Linux — cron**

```cron
0 2 * * * /chemin/vers/backend/scripts/backup.sh >> /var/log/africamenu-backup.log 2>&1
```

En production : copier les sauvegardes **hors site** (rsync, S3, snapshot disque).

### Restaurer une sauvegarde

```bash
# Linux / VPS — remplacer par le vrai dossier (ls ../backups/)
npm run backup:restore -- ../backups/africamenu_20260914_183836 --yes
```

Confirmer avec `oui` quand demandé, ou ajouter **`--yes`** pour éviter la question interactive.  
**Attention :** écrase la base courante et le dossier `uploads/`.

Vérification Linux après restore :

```bash
ls uploads | wc -l
du -sh uploads
pm2 restart all
```

Restauration manuelle SQL :

```bash
gunzip -c backup/database.sql.gz | mysql -u USER -p AfricaMenu
```

Fréquence recommandée en prod : **quotidienne** + avant chaque migration majeure.

---

## Fichiers à ne pas déployer

| Exclure                                 | Raison                                        |
| --------------------------------------- | --------------------------------------------- |
| `node_modules/`                         | Réinstaller avec `npm install` sur le serveur |
| `.env`                                  | Secrets                                       |
| `backend/uploads/` (vide au 1er deploy) | Créer le dossier avec droits d’écriture       |
| `dossier de resto/`                     | Images de démo locales                        |
| `.git/`                                 | Optionnel sur le serveur                      |

---

## Performance / cache navigateur

Optimisations déjà en place dans le code :

- **Images uploadées** : compressées et converties automatiquement en **WebP** à l’upload (`sharp`), redimensionnées à 1600px max. En-têtes de cache long (`Cache-Control: public, max-age=2592000, immutable`) servis par l’API sur `/uploads` (sûr car noms de fichiers uniques).
- **Assets statiques** (`assets/images/`, `docs/img/`) : servis en **WebP** dans le HTML/CSS/JS. Les PNG/JPG d’origine restent sur disque en backup mais ne sont plus référencés.
- **Polices & Font Awesome** : chargées en **non bloquant** (`media="print" onload`) sur toutes les pages → meilleur FCP/LCP.
- **Scripts** : tous chargés avec `defer`.
- **Menu client** : un seul appel API (`/menu/:id`), images `loading="lazy"`, bannière `fetchpriority="high"`.

À configurer côté **nginx** (obligatoire en production) — voir [`nginx/africamenu.conf.example`](nginx/africamenu.conf.example) :

```nginx
# CSS/JS de l'app (chemins absolus /frontend/css/ et /frontend/js/ dans le HTML)
location /frontend/ {
  alias /var/www/africamenu/frontend/;
  expires 7d;
  add_header Cache-Control "public, max-age=604800";
}

# Landing + images marketing
location /assets/ {
  alias /var/www/africamenu/assets/;
  expires 30d;
  add_header Cache-Control "public, max-age=2592000, immutable";
}

# Raccourcis legacy (anciennes URLs /css/ et /js/) — optionnel
location /css/ { alias /var/www/africamenu/frontend/css/; }
location /js/  { alias /var/www/africamenu/frontend/js/; }
```

Sans `location /frontend/`, le menu public (`/menu/<slug>`) et la connexion renvoient **404** sur `config.js`, `menu-client.css`, etc.

**Uploads d’images** (POST `/api/upload`) — sans `client_max_body_size`, nginx coupe à **1 Mo** (erreur **413**) avant l’API :

```nginx
client_max_body_size 64M;

location /api/ {
  client_max_body_size 64M;
  proxy_read_timeout 120s;
  proxy_send_timeout 120s;
  # … proxy_pass, headers …
}
```

La limite applicative (Multer) est configurable en admin (**1–64 Mo**, défaut **5 Mo**) ; nginx doit rester au moins égale à la valeur admin.

### Erreur 500 sur `/frontend/pages/*.html`

Symptôme : l’API répond (`/api/health` → 200) mais les pages statiques renvoient **500 nginx**.

1. Lire la cause exacte :
   ```bash
   sudo tail -30 /var/log/nginx/africamenu.error.log
   ```
2. Vérifier que les fichiers existent :
   ```bash
   ls -la /var/www/africamenu/frontend/pages/categories.html
   ls -la /var/www/africamenu/index.html
   ```
3. **Ne pas utiliser `alias` pour `/frontend/`** si `root` pointe déjà sur la racine du dépôt — les alias mal placés provoquent des 500. Utilisez la config simplifiée de [`nginx/africamenu.conf.example`](nginx/africamenu.conf.example) (seul `/uploads/` reste en alias).
4. Si HTTPS (Certbot) : appliquez les mêmes `location` dans le bloc `listen 443 ssl`, pas seulement le port 80.
5. Recharger :
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   curl -sI https://africamenu.com/frontend/pages/login.html
   ```
   Attendu : **200 OK** (pas 500).

### Réécriture des URLs publiques propres

Format **canonique** : `/restaurant/<slug>`. Legacy : `/menu/<id>`.

```nginx
location /restaurant/ {
  try_files $uri $uri/ /frontend/pages/mon-menu.html;
}

location /menu/ {
  try_files $uri $uri/ /frontend/pages/mon-menu.html;
}

# Ancien format /<slug> → redirection canonique
location ~ ^/(?!api/|uploads/|css/|js/|frontend/|assets/|restaurant/|menu/|favicon\.ico|robots\.txt|sitemap\.xml|health)([^/.]+)$ {
  return 301 /restaurant/$1;
}
```

Voir [`nginx/africamenu.conf.example`](nginx/africamenu.conf.example) pour la config complète (`/health`, `/sitemap.xml`, `client_max_body_size`, etc.).

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

## HTTPS, monitoring et SEO (production VPS)

Config nginx complète : [`nginx/africamenu.conf.example`](nginx/africamenu.conf.example)  
(inclut `/health`, `/api/health`, `/sitemap.xml`, redirection HTTP→HTTPS, menus `/restaurant/`).

### 1. DNS

Pointer `A` (et `AAAA` si IPv6) vers l’IP du VPS :

| Enregistrement | Valeur        |
| -------------- | ------------- |
| `africamenu.com` | IP du VPS   |
| `www.africamenu.com` | IP du VPS ou CNAME vers `@ |

### 2. Certificat Let’s Encrypt (Certbot)

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Copier / activer la config nginx (HTTP seul d’abord si besoin)
sudo cp /var/www/africamenu/nginx/africamenu.conf.example /etc/nginx/sites-available/africamenu
sudo ln -sf /etc/nginx/sites-available/africamenu /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Obtenir le certificat (Certbot modifie nginx ou utilise --nginx)
sudo certbot --nginx -d africamenu.com -d www.africamenu.com

# Renouvellement auto (timer systemd Certbot)
sudo certbot renew --dry-run
```

**Important :** les blocs `location` (`/api/`, `/health`, `/sitemap.xml`, `/restaurant/`, etc.) doivent exister dans le **`server { listen 443 ssl … }`**, pas seulement sur le port 80. Sinon le site HTTPS répond mais `/health` ou `/sitemap.xml` renvoient `index.html`.

### 3. Variables `.env` production

```env
NODE_ENV=production
CORS_ORIGIN=https://africamenu.com
SITE_ORIGIN=https://africamenu.com
```

`SITE_ORIGIN` force les URLs absolues du **sitemap** (`https://…/restaurant/<slug>`). Sans cela, l’API utilise `X-Forwarded-Proto` + `Host` (nécessite `proxy_set_header X-Forwarded-Proto $scheme` dans nginx — déjà dans l’exemple).

### 4. Vérifications après déploiement

```bash
# Santé API (JSON, pas du HTML)
curl -sS https://africamenu.com/health
# Attendu : {"ok":true,"service":"AfricaMenu-api","db":"up"}

curl -sS https://africamenu.com/api/health

# Sitemap (XML, pas index.html)
curl -sSI https://africamenu.com/sitemap.xml | head -5
curl -sS https://africamenu.com/sitemap.xml | head -20

# Robots
curl -sS https://africamenu.com/robots.txt

# Redirection HTTP → HTTPS
curl -sSI http://africamenu.com/ | head -3
# Attendu : HTTP/1.1 301 … Location: https://…
```

| Test | OK | Problème probable |
| ---- | -- | ----------------- |
| `/health` → JSON `db:"up"` | ✅ | PM2 arrêté, MySQL down, ou nginx sert `index.html` |
| `/sitemap.xml` → XML `<urlset` | ✅ | Proxy nginx manquant sur le bloc HTTPS |
| `/sitemap.xml` contient `https://` | ✅ | `SITE_ORIGIN` ou `X-Forwarded-Proto` manquant |
| `robots.txt` → `Sitemap:` | ✅ | Fichier [`robots.txt`](robots.txt) absent à la racine web |

### 5. Monitoring uptime (optionnel)

Surveillez `GET https://africamenu.com/health` toutes les 5 min (UptimeRobot, Better Stack, cron + alerte). Alerte si status ≠ 200 ou `"db":"down"`.

---

## Décisions reportées au jour J

| Sujet               | Options                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| Hébergement         | VPS + nginx, PaaS (Railway/Render), frontend statique séparé (Netlify/Vercel) |
| Domaine             | ex. `africamenu.com`, sous-domaines `app.` / `api.`                           |
| Uploads             | Disque VPS vs cloud                                                           |
| Paiement abonnement | WhatsApp manuel (actuel) vs passerelle future                                 |
| Email               | Validation format (actuel) vs confirmation par lien                           |

---

## Version de préparation

Lorsque les phases de préparation sont terminées, le dépôt peut être tagué :

```bash
git tag -a v0.9.0-preprod -m "AfricaMenu prêt pour déploiement (pré-production)"
```

---

## Dépannage rapide

| Problème                     | Piste                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| CORS bloqué                  | Vérifier `CORS_ORIGIN` = URL exacte du frontend (protocole + port)            |
| `JWT_SECRET manquant`        | Renseigner dans `.env`                                                        |
| Admin 503                    | `ADMIN_EMAILS` vide en `NODE_ENV=production`                                  |
| QR ne s’ouvre pas sur mobile | En dev, renseigner `PUBLIC_SITE_ORIGIN` avec l’IP LAN ; en prod, laisser vide |
| CSS/JS 404 en prod | Vérifier `location /frontend/` (et `/assets/`) dans nginx ; recharger `sudo nginx -t && sudo systemctl reload nginx` |
| Menu public écran blanc | Onglet Réseau : `config.js` ou `mon-menu.js` en 404 → alias nginx manquant |
| Upload image **413** | Ajouter `client_max_body_size 64M;` dans le bloc `server` ou `location /api/` nginx, puis `sudo nginx -t && sudo systemctl reload nginx` |
| Upload refusé côté app | Limite admin (défaut **5 Mo**) dans Paramètres plateforme ; nginx doit être ≥ cette valeur |
| **500** sur pages HTML/CSS | Voir ci-dessous — souvent alias nginx cassé après édition manuelle |
| `/health` db down            | MySQL arrêté ou mauvais `DB_*`                                                |
| `/health` renvoie du HTML    | Proxy `/health` absent du bloc **HTTPS** nginx → ajouter `location = /health` |
| `/sitemap.xml` = page d’accueil | Idem — proxy manquant sur 443 ; voir [`nginx/africamenu.conf.example`](nginx/africamenu.conf.example) |
| Sitemap en `http://`         | Renseigner `SITE_ORIGIN=https://…` dans `.env` + `X-Forwarded-Proto` nginx    |
