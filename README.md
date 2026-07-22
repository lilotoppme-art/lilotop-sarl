# Site web LILOTOP SARL

Site corporate statique de LILOTOP SARL, genere a partir du profil societe officiel.

## Architecture

- Francais : `index.html`, `a-propos.html`, `solutions.html`, `produits.html`, `b2b-portal.html`, `request-a-quote.html`, `suppliers.html`, `partnerships.html`, `tenders.html`, `contact.html`
- English : dossier `en/`
- Page legale : `mentions-legales.html` et `en/legal.html`
- Source de generation : `build-site.js`
- Design et animations : `styles.css`, `script.js`
- API formulaire : `api/contact.js`
- API RFQ : `api/rfq.js`
- API portail B2B : `api/portal.js`
- SEO : `sitemap.xml`, `robots.txt`, canonical, hreflang, Open Graph et JSON-LD

## Apercu local

```bash
npm run build
npm run start
```

Puis ouvrir :

```text
http://127.0.0.1:4173/
```

## Formulaire de contact

Le formulaire envoie les demandes vers `contact@lilotopsarl.com` via une fonction serveur Vercel :

```text
/api/contact
```

Le service d'envoi utilise Resend. Aucune cle API ne doit etre ajoutee dans le code source.

Variables d'environnement a configurer dans Vercel :

```text
RESEND_API_KEY=
EMAIL_FROM=LILOTOP Website <notifications@updates.lilotopsarl.com>
EMAIL_REPLY_TO=contact@lilotopsarl.com
EMAIL_CONTACT_TO=contact@lilotopsarl.com
EMAIL_RFQ_TO=contact@lilotopsarl.com
EMAIL_SUPPLIER_TO=contact@lilotopsarl.com
EMAIL_PARTNERSHIP_TO=contact@lilotopsarl.com
EMAIL_TENDER_TO=contact@lilotopsarl.com
EMAIL_TEST_MODE=true
EMAIL_TEST_TO=contact@lilotopsarl.com
RFQ_SEND_ACK=false
NEXT_PUBLIC_SITE_URL=https://lilotopsarl.com
```

Remarques :

- `RESEND_API_KEY` doit etre renseignee depuis le tableau de bord Resend.
- `EMAIL_FROM` doit utiliser le domaine Resend verifie `updates.lilotopsarl.com`.
- Pour la version 1.0, toutes les variables `EMAIL_*_TO` pointent vers `contact@lilotopsarl.com`, tout en restant separees pour une evolution future.
- `EMAIL_TEST_MODE=true` doit rester active sur les deploiements Preview. Passer a `false` uniquement apres verification du domaine Resend, configuration Vercel et tests reels valides.
- Sans `RESEND_API_KEY`, l'API renvoie une erreur de configuration claire et aucun envoi fictif n'est effectue.
- `RFQ_SEND_ACK=false` garde l'accuse de reception automatique des RFQ desactive. Passer a `true` uniquement apres validation.

## Espace RFQ

La page `request-a-quote.html` permet de soumettre une demande de cotation complete avec documents.

## Portail B2B

La page `b2b-portal.html` regroupe les parcours :

- Clients : `request-a-quote.html`
- Fournisseurs : `suppliers.html`
- Partenariats : `partnerships.html`
- Appels d'offres : `tenders.html`

Les soumissions fournisseurs, partenariats et appels d'offres utilisent `api/portal.js`. Elles generent des references `SUP-YYYYMMDD-XXXX`, `PART-YYYYMMDD-XXXX` et `TND-YYYYMMDD-XXXX`. Les donnees sont structurees pour de futures integrations IA, Odoo CRM, Odoo Achats, stockage cloud et tableau de suivi, sans connexion active a ce stade.

Limites appliquees cote serveur :

- 5 fichiers maximum.
- 4 Mo par fichier.
- 8 Mo au total.
- Extensions autorisees : PDF, XLS, XLSX, DOC, DOCX, JPG, PNG.

Les documents ne sont pas stockes dans le depot GitHub. Ils sont prepares pour etre envoyes comme pieces jointes via Resend lorsque les variables d'environnement sont configurees. Les donnees RFQ sont aussi structurees en JSON pour de futures integrations IA, Odoo CRM ou suivi fournisseur, sans connexion active a ce stade.

## Publication Vercel

Build command :

```bash
npm run build
```

Output directory :

```text
.
```

Avant un deploiement de production avec formulaire actif :

1. Verifier le domaine d'envoi dans Resend.
2. Ajouter les variables d'environnement dans Vercel.
3. Redeployer le projet.
4. Envoyer une demande test depuis la page Contact.

## LILOTOP NEXUS AI - Business Radar

Le premier module NEXUS AI est isole du site public et accessible sur :

```text
/admin/business-radar
```

Il utilise des fonctions Vercel, PostgreSQL, une session administrateur signee, des connecteurs modulaires, Resend pour les alertes et une analyse OpenAI optionnelle. Sans cle OpenAI, le module reste operationnel en mode `no_ai`.

Le centre de commande inclut les priorites du jour, les echeances, les favoris, les notes internes, la suppression des donnees `DEMO` et des exports CSV/Excel neutralisant les formules externes. Les pieces jointes restent explicitement desactivees tant qu'un stockage prive n'est pas configure.

Commandes principales :

```bash
npm run admin:hash-password
npm run db:migrate:radar
npm run test
```

Documentation technique : `docs/business-radar.md`.

Guide utilisateur : `BUSINESS_RADAR_GUIDE_UTILISATEUR.md`.
