# Site web LILOTOP SARL

Site corporate statique de LILOTOP SARL, genere a partir du profil societe officiel.

## Architecture

- Francais : `index.html`, `a-propos.html`, `secteurs.html`, `solutions.html`, `produits.html`, `partenaires.html`, `projets.html`, `actualites.html`, `contact.html`
- English : dossier `en/`
- Page legale : `mentions-legales.html` et `en/legal.html`
- Source de generation : `build-site.js`
- Design et animations : `styles.css`, `script.js`
- API formulaire : `api/contact.js`
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
CONTACT_TO_EMAIL=contact@lilotopsarl.com
CONTACT_FROM_EMAIL=LILOTOP SARL <noreply@lilotopsarl.com>
```

Remarques :

- `RESEND_API_KEY` doit etre renseignee depuis le tableau de bord Resend.
- `CONTACT_FROM_EMAIL` doit utiliser un domaine verifie dans Resend.
- `CONTACT_TO_EMAIL` recoit les demandes envoyees depuis le site.
- Sans `RESEND_API_KEY`, l'API renvoie une erreur de configuration claire et aucun envoi fictif n'est effectue.

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
