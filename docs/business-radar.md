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
- Migrations PostgreSQL : tous les fichiers numerotes de `db/migrations/`, executes dans l'ordre.
- Alertes : integration Resend existante dans `lib/email/`.

Le site public continue d'etre genere par `build-site.js`. Le module ne modifie aucune page publique ni son contenu.

## Base de donnees

Tables creees :

- `sources` : connecteurs et configuration non secrete.
- `opportunities` : opportunites, score, analyse, statut, empreinte de deduplication.
- `supplier_registrations` : inscriptions fournisseurs recues depuis le portail B2B lorsque la base est disponible.
- `radar_runs` : historique des executions manuelles et planifiees.
- `notifications` : statut des alertes e-mail.
- `opportunity_notes` : notes internes privees avec auteur et horodatage.
- `opportunity_attachments` : metadonnees reservees a un futur stockage prive.

La colonne `opportunities.is_favorite` distingue un favori du statut metier. Les migrations `001` et `002` utilisent `IF NOT EXISTS` ou `ADD COLUMN IF NOT EXISTS`, ne contiennent ni suppression ni troncature et peuvent etre rejouees.

Executer la migration apres avoir defini `DATABASE_URL` :

```powershell
npm run db:migrate:radar
```

La commande applique chaque migration SQL numerotee. Elle est idempotente, ne supprime aucune table et ne modifie pas les donnees du site public. Pour verifier la base, controler la presence des tables `sources`, `opportunities`, `supplier_registrations`, `radar_runs`, `notifications`, `opportunity_notes` et `opportunity_attachments`, ainsi que les index `opportunities_*`.

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
| `MIGRATION_SECRET` | Temporaire en Preview | Autorise la route de migration Preview; a supprimer apres execution. |
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

Si `OPENAI_API_KEY` est configuree, le serveur demande une sortie JSON structuree avec resume, classification, pays, acheteur, produits, exigences, date limite, documents, inscription fournisseur, recommandation, risques et prochaines actions. Les champs absents sont `null` ou des tableaux vides. Deux tentatives au maximum sont autorisees, avec un delai de 20 secondes par tentative. En cas d'erreur fournisseur, le traitement bascule en `no_ai_fallback`; aucune opportunite n'est inventee.

## Deduplication et suivi

Une empreinte SHA-256 est calculee a partir de l'identifiant externe, de l'URL source ou du triplet titre/organisation/echeance. La contrainte unique PostgreSQL evite les doublons entre executions. Les statuts disponibles sont : `new`, `reviewing`, `qualified`, `monitoring`, `submitted`, `won`, `lost`, `archived`.

## Alertes et cron

Les opportunites reelles declenchent une alerte Resend pour un score d'au moins 80, une echeance a moins de sept jours ou 72 heures, ou une inscription fournisseur requise. Les messages hors Production portent le libelle `Business Radar Preview`. Les donnees DEMO sont exclues. L'identifiant d'idempotence Resend et l'index de notifications evitent les envois repetes. Un echec global ou au moins trois erreurs de sources produit une alerte d'execution.

Vercel appelle `/api/cron-business-radar` chaque jour a 06:00 UTC. La route refuse toute requete sans `Authorization: Bearer <CRON_SECRET>`. La frequence pourra etre augmentee selon le forfait Vercel et les besoins metier.

## API

- `POST /api/business-radar-auth` : connexion/deconnexion.
- `GET /api/business-radar?action=overview` : indicateurs, repartitions, echeances, executions.
- `GET /api/business-radar?action=opportunities` : liste filtree.
- `POST /api/business-radar?action=opportunity` : saisie manuelle.
- `POST /api/business-radar?action=status` : changement de statut.
- `POST /api/business-radar?action=favorite` : ajout ou retrait d'un favori.
- `GET /api/business-radar?action=opportunity-detail&id=...` : fiche, notes et etat des pieces jointes.
- `POST /api/business-radar?action=note|note-update` : creation ou modification d'une note de l'auteur.
- `DELETE /api/business-radar?action=note&id=...` : suppression confirmee cote interface.
- `POST /api/business-radar?action=delete-demo` : suppression de toutes les sources et opportunites DEMO.
- `GET /api/business-radar?action=attachments` : capacites de stockage; `configured=false` en Preview actuelle.
- `GET/POST /api/business-radar?action=sources|source` : sources.
- `POST /api/business-radar?action=analyze-url` : analyse ponctuelle.
- `POST /api/business-radar?action=run` : execution manuelle.
- `GET /api/business-radar?action=registrations` : fournisseurs.
- `GET /api/business-radar?action=export` : export CSV.
- `GET /api/business-radar?action=export-xlsx` : export Excel.
- `GET /api/cron-business-radar` : execution planifiee protegee.

Toutes les routes metier exigent une session administrateur valide.

La route `POST /api/business-radar-migrate` est interdite en Production. En Preview, elle exige `MIGRATION_SECRET`, applique les migrations numerotees et retourne uniquement les noms de tables et d'index. Supprimer `MIGRATION_SECRET` de Vercel des que la migration est validee.

## Tests

```powershell
npm run lint
npm test
npm run build
npm run check:links
```

Les tests couvrent le hash et la session, l'expiration, la connexion valide et invalide, la deconnexion, les routes privees, le scoring, la deduplication, le mode sans IA, les reprises OpenAI limitees, le blocage des adresses privees, le cron autorise/refuse, la securite des exports, la validation des pieces jointes et l'absence d'operations destructives dans les migrations. Les tests historiques des formulaires publics restent actifs.

Les connecteurs RSS et HTML ont ete valides en lecture seule avec un flux Atom public GitHub et `example.com`. Cette validation confirme le mecanisme generique, pas la compatibilite de tous les portails. Les pages protegees, CAPTCHA et sources interdisant l'extraction restent hors perimetre.

## Favoris, notes et pieces jointes

- Les favoris sont independants du statut `qualified`.
- Les notes sont reservees a la session administrateur et liees a l'adresse de l'auteur.
- La suppression d'une note exige une confirmation dans l'interface.
- Les pieces jointes sont **NON CONFIGUREES EN PREVIEW**. La validation autorise PDF, DOCX, XLSX, PNG et JPG jusqu'a 10 Mo, nettoie le nom du fichier et refuse tout autre MIME. Aucun stockage public ou succes fictif n'est utilise.

## Exports

Les exports CSV et Excel reprennent les filtres actifs, jusqu'a 200 lignes. Les valeurs externes commencant par `=`, `+`, `-` ou `@` sont prefixees par une apostrophe pour neutraliser les formules. Les colonnes incluent valeur estimee, devise, favori et indicateur DEMO.

## Execution manuelle du cron

Depuis un terminal prive, sans enregistrer le secret dans l'historique partage :

```powershell
Invoke-RestMethod -Method Post -Uri "$env:APP_URL/api/cron-business-radar" -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

Le planning Preview reste quotidien a `06:00 UTC` (`0 6 * * *`) afin d'eviter une frequence excessive.

## Depannage

- `DATABASE_NOT_CONFIGURED` : connecter PostgreSQL Preview, definir `DATABASE_URL`, puis executer les migrations.
- `AUTH_NOT_CONFIGURED` : verifier les quatre variables administrateur et redeployer.
- `AI_ANALYSIS_FAILED` : verifier la cle, le modele et les quotas; le radar continue en mode degrade.
- `ATTACHMENTS_NOT_CONFIGURED` : comportement attendu tant qu'aucun stockage prive n'est valide.
- `UNSAFE_URL` : l'URL cible est locale, privee, non HTTP(S) ou contient des identifiants.

## Rollback Preview

1. Ne jamais modifier `main`.
2. Dans Vercel, promouvoir uniquement un ancien deploiement **Preview** de la branche si un retour est necessaire.
3. Revenir au commit Preview precedent avec un nouveau commit Git non destructif.
4. Les migrations additives ne sont pas supprimees automatiquement; conserver les colonnes et tables inutilisees jusqu'a une revue de donnees.

## Limites du MVP

- Les extractions HTML sont generiques et doivent etre adaptees source par source pour une precision contractuelle.
- Les redirections HTTP sont refusees par securite; une liste blanche avec revalidation DNS pourra etre ajoutee.
- La limitation de connexion est locale a chaque instance serverless.
- La migration doit etre executee manuellement avant la premiere utilisation.
- Le stockage prive des pieces jointes n'est pas configure.
- La limitation de connexion reste locale a chaque instance serverless.
- Une source RSS/HTML generique peut necessiter un connecteur specialise et une surveillance manuelle.
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
