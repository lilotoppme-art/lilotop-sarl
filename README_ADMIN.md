# LILOTOP Business Radar - Guide d'administration

Ce document decrit l'exploitation et la maintenance de Business Radar v1.0.
Le module est prive et distinct du site corporate public. Sa route de connexion
est :

`https://lilotop-sarl.vercel.app/admin/business-radar`

## 1. Architecture

### Deploiement

- Hebergement et fonctions serverless : Vercel, projet `lilotop-sarl`.
- Branche de reference : `feature/business-radar-v1`.
- Build du site statique : `node build-site.js`.
- Routage prive : `vercel.json` reecrit `/admin/business-radar` vers
  `/api/business-radar-page`.
- Execution planifiee : `/api/cron-business-radar`, chaque jour a 06:00 UTC.

### Interface et API

- Interface : `admin/business-radar-shell.html`,
  `admin/business-radar.css` et `admin/business-radar.js`.
- Page privee : `api/business-radar-page.js`.
- Authentification : `api/business-radar-auth.js` et
  `lib/business-radar/auth.js`.
- API metier : `api/business-radar.js`.
- Cron : `api/cron-business-radar.js`.
- Services metier, scoring, IA, connecteurs et notifications :
  `lib/business-radar/`.
- Envoi d'e-mails : client Resend partage dans `lib/email/`.

### Donnees

- Base : Neon PostgreSQL.
- Migrations : `db/migrations/001_business_radar.sql` et
  `db/migrations/002_business_radar_decision_tools.sql`.
- Script d'application : `scripts/migrate-business-radar.js`.
- Tables principales : `sources`, `opportunities`,
  `supplier_registrations`, `radar_runs`, `notifications`,
  `opportunity_notes` et `opportunity_attachments`.

Le compte administrateur n'est pas une ligne de base de donnees. Son adresse et
le hash PBKDF2 de son mot de passe sont fournis au runtime par Vercel.

## 2. Variables d'environnement

Toutes les valeurs de Production et Preview sont gerees dans Vercel :
`Project Settings > Environment Variables`. Ne jamais placer une valeur reelle
dans Git, un fichier `.env` suivi, un ticket ou une documentation.

| Variable | Role |
| --- | --- |
| `DATABASE_URL` | Connexion chiffree a Neon PostgreSQL. |
| `OPENAI_API_KEY` | Authentification serveur pour l'analyse OpenAI. |
| `OPENAI_MODEL` | Modele utilise par Business Radar. |
| `RESEND_API_KEY` | Cle d'envoi Resend limitee au domaine LILOTOP. |
| `RESEND_WEBHOOK_SECRET` | Signature des evenements de livraison Resend recus par NEXUS. |
| `EMAIL_FROM` | Expediteur valide par Resend. |
| `EMAIL_CONTACT_TO` | Destinataire de repli des alertes. |
| `BUSINESS_RADAR_ALERT_EMAIL` | Destinataire principal des alertes Radar. |
| `EMAIL_REPLY_TO` | Adresse de reponse professionnelle. |
| `CRON_SECRET` | Protection Bearer de la route planifiee. |
| `ADMIN_EMAIL` | Adresse de connexion administrateur. |
| `ADMIN_PASSWORD_HASH` | Hash PBKDF2 du mot de passe administrateur. |
| `AUTH_SECRET` | Signature des cookies de session. |
| `APP_URL` | URL serveur de l'environnement. |
| `NEXT_PUBLIC_SITE_URL` | URL publique de l'environnement. |

Variables injectees par l'integration Neon, a conserver dans Vercel :
`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`,
`DATABASE_URL_UNPOOLED`, `POSTGRES_HOST`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `PGHOST`, `PGUSER` et `NEON_PROJECT_ID`.

Apres toute modification d'une variable, redeployer la meme version dans
l'environnement concerne. Ne jamais afficher une valeur sensible dans les
logs de build ou d'execution.

## 3. Procedure de deploiement

1. Verifier la branche et le statut Git :

   ```powershell
   git switch feature/business-radar-v1
   git status
   ```

2. Executer les controles locaux :

   ```powershell
   pnpm run lint
   pnpm test
   pnpm run build
   pnpm run check:links
   ```

3. Pousser la branche :

   ```powershell
   git push origin feature/business-radar-v1
   ```

4. Dans Vercel, controler les variables Preview, puis lancer et valider la
   Preview.
5. Verifier la connexion, une lecture Neon, une analyse OpenAI et une livraison
   Resend.
6. Pour Production, redeployer ou promouvoir uniquement le commit valide de
   `feature/business-radar-v1`. Ne pas modifier le code ni les domaines du site
   corporate pendant cette operation.
7. Attendre le statut `Ready`, puis verifier :
   - `/admin/business-radar`;
   - l'authentification;
   - la creation et la lecture d'une opportunite;
   - le mode d'analyse `openai`;
   - le statut `delivered` dans Resend.

Pour un retour arriere, promouvoir dans Vercel le dernier deploiement Production
valide. Les migrations etant additives, ne supprimer aucune table ou colonne
sans sauvegarde, revue et validation explicites.

## 4. Recuperation de l'administrateur

Adresse de reference : `admin@lilotopsarl.com`.

1. Generer un nouveau mot de passe fort dans un environnement prive.
2. Produire uniquement son hash :

   ```powershell
   pnpm run admin:hash-password
   ```

3. Dans Vercel, remplacer uniquement `ADMIN_PASSWORD_HASH` pour Production et
   Preview. Ne jamais enregistrer le mot de passe en clair dans Vercel ou Git.
4. Redeployer la meme version actuellement active.
5. Ouvrir `/admin/business-radar`, se deconnecter de toute session existante,
   puis tester une connexion complete avec `admin@lilotopsarl.com`.
6. Conserver temporairement le nouveau mot de passe dans un gestionnaire de
   mots de passe approuve. Supprimer tout fichier local temporaire apres
   transfert.

Si la page affiche `Administrator access is not configured`, verifier
`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` et `AUTH_SECRET`, puis redeployer. Le mot de
passe d'origine ne peut pas etre recupere depuis son hash PBKDF2.

## 5. Sauvegarde Neon

### Sauvegarde geree

1. Ouvrir le projet Neon associe a `NEON_PROJECT_ID`.
2. Verifier que la restauration temporelle ou la retention d'historique est
   active pour le plan utilise.
3. Avant une migration ou une operation importante, creer une branche Neon
   nommee avec la date, par exemple `backup-before-maintenance-YYYY-MM-DD`.
4. Conserver la branche de sauvegarde jusqu'a validation fonctionnelle et
   documenter son identifiant hors du depot Git.

### Export logique

Depuis un poste d'administration disposant de PostgreSQL et d'une connexion
Neon autorisee :

1. Recuperer temporairement la chaine non mutualisee depuis Vercel ou Neon sans
   l'afficher ni l'enregistrer dans le depot.
2. Utiliser `pg_dump` au format custom :

   ```powershell
   pg_dump --format=custom --no-owner --no-acl --file business-radar.backup
   ```

3. Stocker l'archive chiffree dans un emplacement prive, avec date, environnement
   et somme de controle.
4. Tester regulierement la restauration dans une branche Neon isolee.

### Restauration

Option recommandee :

1. Restaurer vers une nouvelle branche Neon ou revenir au point temporel voulu.
2. Connecter temporairement une Preview Vercel a cette branche.
3. Verifier les tables, le nombre d'enregistrements, la connexion et les
   parcours Business Radar.
4. Basculer Production uniquement apres validation et conserver l'ancienne
   branche pendant la periode de securite.

Pour une archive logique :

```powershell
pg_restore --clean --if-exists --no-owner --no-acl --dbname <base-cible> business-radar.backup
```

Executer cette commande uniquement sur une base cible vide ou une branche de
restauration approuvee. Ne jamais restaurer directement sur Production sans
sauvegarde recente et validation explicite.

## 6. Controles de maintenance

- Consulter les erreurs Vercel des routes `api/business-radar*`.
- Verifier les executions dans `radar_runs`.
- Verifier les livraisons et rejets dans Resend.
- Surveiller l'usage et les erreurs OpenAI sans journaliser les donnees
  sensibles.
- Verifier la croissance de Neon et les connexions actives.
- Appliquer les migrations avec `pnpm run db:migrate:radar`.
- Rejouer `pnpm run lint`, `pnpm test`, `pnpm run build` et
  `pnpm run check:links` avant chaque publication.
- Faire tourner les secrets selon la politique interne, puis redeployer.

## 7. Regles de securite

- Aucun secret ne doit etre committe.
- `.env`, `.env.local`, `.env.production` et `.env.*.local` sont ignores par
  Git.
- Les valeurs de `.env.example` sont uniquement des placeholders.
- Ne jamais copier une cle ou un mot de passe dans une conversation, une issue
  ou une capture d'ecran.
- Revoquer immediatement toute cle exposee et la remplacer dans Vercel.
- Limiter les cles Resend au seul envoi et au domaine valide lorsque possible.
- Maintenir toutes les routes metier derriere la session administrateur.
