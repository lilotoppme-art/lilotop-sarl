# LILOTOP NEXUS AI - Business Radar MVP 1.0

## Perimetre

Business Radar est un module d'administration distinct du site corporate public. Il collecte, structure, qualifie et suit des opportunites industrielles. La route `/admin/business-radar` n'est pas referencee dans la navigation publique et renvoie l'en-tete `X-Robots-Tag: noindex, nofollow, noarchive`.

## Architecture

- Interface : `admin/business-radar-shell.html`, `admin/business-radar.css`, `admin/business-radar.js`.
- Page protegee : `api/business-radar-page.js`.
- Authentification : `api/business-radar-auth.js` et `lib/business-radar/auth.js`.
- API metier : `api/business-radar.js`.
- Tache planifiee : `api/cron-business-radar.js`.
- Services : `lib/business-radar/`.
- Migration PostgreSQL : `db/migrations/001_business_radar.sql`.
- Alertes : integration Resend existante dans `lib/email/`.

Le site public continue d'etre genere par `build-site.js`. Le module ne modifie aucune page publique ni son contenu.

## Base de donnees

Tables creees :

- `sources` : connecteurs et configuration non secrete.
- `opportunities` : opportunites, score, analyse, statut, empreinte de deduplication.
- `supplier_registrations` : inscriptions fournisseurs recues depuis le portail B2B lorsque la base est disponible.
- `radar_runs` : historique des executions manuelles et planifiees.
- `notifications` : statut des alertes e-mail.

Executer la migration apres avoir defini `DATABASE_URL` :

```powershell
npm run db:migrate:radar
```

La migration est idempotente. Elle ne supprime aucune table et ne modifie pas les donnees du site public.

## Premier administrateur

1. Choisir une phrase de passe unique d'au moins 14 caracteres.
2. Executer `npm run admin:hash-password` dans un terminal prive.
3. Copier uniquement le hash produit dans `ADMIN_PASSWORD_HASH` sur Vercel.
4. Definir `ADMIN_EMAIL=admin@lilotopsarl.com`.
5. Generer une valeur aleatoire d'au moins 32 octets pour `AUTH_SECRET`.
6. Ne jamais stocker le mot de passe ou `AUTH_SECRET` dans Git.

La session expire apres 8 heures. Le cookie est `HttpOnly`, `SameSite=Strict` et `Secure` en HTTPS. Les tentatives de connexion sont limitees par instance serverless; une limitation partagee par Redis/Vercel KV est recommandee pour une phase ulterieure.

## Variables d'environnement

| Variable | Obligatoire | Usage |
| --- | --- | --- |
| `DATABASE_URL` | Oui | Connexion PostgreSQL chiffrable et persistante. |
| `OPENAI_API_KEY` | Non | Analyse IA cote serveur. Absente = mode `no_ai`. |
| `OPENAI_MODEL` | Non | Modele OpenAI, valeur par defaut documentee dans `.env.example`. |
| `RESEND_API_KEY` | Pour alertes | Cle Resend deja utilisee par le site, jamais exposee au navigateur. |
| `BUSINESS_RADAR_ALERT_EMAIL` | Pour alertes | Destinataire des opportunites a score eleve. |
| `CRON_SECRET` | Oui pour cron | Jeton Bearer verifie en temps constant. |
| `ADMIN_EMAIL` | Oui | Identifiant de l'administrateur. |
| `ADMIN_PASSWORD_HASH` | Oui | Hash PBKDF2, jamais le mot de passe. |
| `AUTH_SECRET` | Oui | Signature des sessions. |
| `APP_URL` | Oui | URL exacte de la Preview ou de l'environnement. |

Configurer ces valeurs d'abord dans l'environnement Vercel Preview. Ne pas reutiliser une cle secrete de Production pour un environnement de developpement non controle.

## Connecteurs

- `manual` : saisie directe dans le tableau de bord.
- `demo` : deux opportunites fictives avec badge `DEMO`; aucune alerte e-mail n'est envoyee.
- `rss` : lecture generique RSS/Atom, maximum 50 elements par execution.
- `html` : extraction generique du titre et de la description d'une page publique.
- Analyse d'URL : controle de protocole, refus des adresses locales/privees, limite de taille et delai de 12 secondes.

Les connecteurs HTML et RSS ne contournent ni authentification, ni CAPTCHA, ni conditions d'utilisation. Une source qui l'interdit ne doit pas etre ajoutee.

## Analyse et scoring

Le score deterministe sur 100 combine : pertinence sectorielle, completude, urgence et zone geographique strategique. Le score et ses details restent disponibles meme sans IA.

Si `OPENAI_API_KEY` est configuree, le serveur demande une sortie JSON structuree avec resume, adequation, risques et prochaines actions. En cas d'erreur fournisseur, le traitement bascule en `no_ai_fallback`; aucune opportunite n'est inventee.

## Deduplication et suivi

Une empreinte SHA-256 est calculee a partir de l'identifiant externe, de l'URL source ou du triplet titre/organisation/echeance. La contrainte unique PostgreSQL evite les doublons entre executions. Les statuts disponibles sont : `new`, `reviewing`, `qualified`, `monitoring`, `submitted`, `won`, `lost`, `archived`.

## Alertes et cron

Les nouvelles opportunites reelles avec un score d'au moins 70 declenchent une alerte Resend vers `BUSINESS_RADAR_ALERT_EMAIL`. Les donnees DEMO sont exclues. Chaque tentative est tracee dans `notifications`.

Vercel appelle `/api/cron-business-radar` chaque jour a 06:00 UTC. La route refuse toute requete sans `Authorization: Bearer <CRON_SECRET>`. La frequence pourra etre augmentee selon le forfait Vercel et les besoins metier.

## API

- `POST /api/business-radar-auth` : connexion/deconnexion.
- `GET /api/business-radar?action=overview` : indicateurs, repartitions, echeances, executions.
- `GET /api/business-radar?action=opportunities` : liste filtree.
- `POST /api/business-radar?action=opportunity` : saisie manuelle.
- `POST /api/business-radar?action=status` : changement de statut.
- `GET/POST /api/business-radar?action=sources|source` : sources.
- `POST /api/business-radar?action=analyze-url` : analyse ponctuelle.
- `POST /api/business-radar?action=run` : execution manuelle.
- `GET /api/business-radar?action=registrations` : fournisseurs.
- `GET /api/business-radar?action=export` : export CSV.
- `GET /api/business-radar?action=export-xlsx` : export Excel.
- `GET /api/cron-business-radar` : execution planifiee protegee.

Toutes les routes metier exigent une session administrateur valide.

## Tests

```powershell
npm run lint
npm test
npm run build
npm run check:links
```

Les tests couvrent le hash et la session, l'expiration, la validation, le scoring, la deduplication, le mode sans IA, le blocage des adresses privees et le refus d'un cron non autorise. Les tests historiques des formulaires publics restent actifs.

## Limites du MVP

- Les extractions HTML sont generiques et doivent etre adaptees source par source pour une precision contractuelle.
- Les redirections HTTP sont refusees par securite; une liste blanche avec revalidation DNS pourra etre ajoutee.
- La limitation de connexion est locale a chaque instance serverless.
- La migration doit etre executee manuellement avant la premiere utilisation.
- Aucun connecteur Odoo, CRM ou plateforme d'appels d'offres authentifiee n'est active dans ce MVP.
- Les resultats IA sont une aide a la qualification et doivent etre verifies humainement.

## Deploiement Preview

1. Pousser uniquement `feature/business-radar-v1`.
2. Creer une base PostgreSQL de Preview et executer la migration.
3. Configurer toutes les variables de Preview.
4. Ouvrir `/admin/business-radar` sur l'URL Preview.
5. Ajouter d'abord une source `demo` et lancer le radar.
6. Verifier les badges DEMO, la deduplication et les exports.
7. Ajouter une source reelle autorisee, puis verifier le statut de l'alerte dans Resend.
8. Ne fusionner dans `main` et ne deployer en Production qu'apres validation explicite.
