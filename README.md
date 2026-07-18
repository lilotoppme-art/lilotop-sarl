# Site web LILOTOP SARL

Site corporate statique de LILOTOP SARL, reconstruit à partir du profil société officiel.

## Architecture

- Français : `index.html`, `a-propos.html`, `secteurs.html`, `produits.html`, `partenaires.html`, `projets.html`, `actualites.html`, `contact.html`
- English : dossier `en/`
- Page légale : `mentions-legales.html` et `en/legal.html`
- Source de génération : `build-site.js`
- Design et animations : `styles.css`, `script.js`
- SEO : `sitemap.xml`, `robots.txt`, balises canonical, hreflang, Open Graph et JSON-LD

## Aperçu local

Utiliser Python depuis ce dossier :

```bash
python -m http.server 4173
```

Puis ouvrir :

```text
http://127.0.0.1:4173/
```

## Publication

Le site est prêt pour un hébergement statique comme Netlify. Le fichier `netlify.toml` publie le dossier courant et applique des en-têtes de sécurité/cache.

Avant publication définitive, remplacer les témoignages éditoriaux par des citations validées et, si disponibles, intégrer des photos officielles de projets LILOTOP.
