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
- Rate limit login/register (10 req/min/IP)
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

## Sauvegardes MySQL (jour du déploiement)

Planifier des sauvegardes automatiques avant le go-live :

```bash
mysqldump -u USER -p MenuGo > backup_menugo_$(date +%Y%m%d).sql
```

Restauration :

```bash
mysql -u USER -p MenuGo < backup_menugo_YYYYMMDD.sql
```

Fréquence recommandée en prod : quotidienne + avant chaque migration majeure.

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
