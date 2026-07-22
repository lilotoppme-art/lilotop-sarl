# Guide utilisateur - LILOTOP Business Radar

## Connexion

Ouvrez `/admin/business-radar` sur l'environnement autorise. Saisissez l'adresse administrateur et le mot de passe initial defini par l'administrateur technique. La session se ferme automatiquement apres huit heures.

## Vue generale

La page d'accueil du module affiche les nouvelles opportunites du jour, les dossiers prioritaires, les echeances a sept jours et 72 heures, les inscriptions fournisseurs requises, les opportunites retenues, les favoris, la valeur potentielle disponible et les dernieres executions. Une valeur absente est affichee comme non disponible et n'est jamais inventee.

La section **Actions recommandees aujourd'hui** classe cinq dossiers selon leur score, leur urgence et leur statut. Ouvrez une action pour consulter sa fiche privee.

Le badge `DEMO` signifie que la donnee est fictive. Elle ne doit jamais etre utilisee dans une offre commerciale ou presentee comme une opportunite reelle.

## Ajouter une source

Dans l'onglet **Sources**, choisissez **Ajouter une source** :

- RSS/Atom pour un flux public.
- HTML pour une page web publique et autorisee.
- Manuel pour organiser les saisies humaines.
- DEMO pour verifier le fonctionnement du module.

N'ajoutez pas de page protegee par un compte, un CAPTCHA ou des conditions interdisant l'extraction.

## Lancer le radar

Le bouton **Lancer le radar** interroge toutes les sources actives. L'historique indique le nombre de sources consultees, les elements trouves, les creations, les mises a jour et les erreurs eventuelles.

Une nouvelle execution ne cree pas de doublon lorsqu'une opportunite possede la meme empreinte.

## Ajouter une opportunite manuellement

Dans **Opportunites**, choisissez **Ajouter**. Le titre est obligatoire. Renseignez autant que possible l'organisation, le pays, le secteur, le type, l'echeance, l'URL source et la description afin d'obtenir un score plus utile.

## Analyser une URL

Choisissez **Analyser une URL**, saisissez une URL publique, puis verifiez le titre, le resume, le score et le mode d'analyse. Cliquez sur **Enregistrer** uniquement apres avoir confirme que la source et les informations sont fiables.

## Qualifier une opportunite

Le statut peut etre modifie directement dans la liste :

- Nouveau : pas encore analyse par l'equipe.
- En analyse : verification en cours.
- Qualifie : correspond aux capacites et priorites de LILOTOP.
- Suivi : a surveiller avant decision.
- Soumis : offre ou manifestation d'interet envoyee.
- Gagne / Perdu : resultat connu.
- Archive : dossier clos sans action courante.

Le score est un indicateur de priorite, pas une decision automatique. Verifiez toujours la source, les exigences, l'echeance et la conformite.

## Favoris et filtres

L'etoile ajoute une opportunite aux favoris sans modifier son statut. Le filtre **Favoris**, la recherche, le statut et le tri restent memorises pendant la session du navigateur. Les tris disponibles sont le score, la date limite et la date de detection.

## Notes internes

Ouvrez une fiche pour ajouter une note privee. Chaque note indique son auteur, sa date et son heure. L'auteur peut modifier ou supprimer sa note apres confirmation. Ces notes ne sont jamais exposees sur le site public.

## Pieces jointes

Le panneau de documents indique **NON CONFIGUREE EN PREVIEW** tant qu'aucun stockage prive n'est connecte. Aucun televersement n'est simule. La couche de validation accepte uniquement PDF, DOCX, XLSX, PNG et JPG, avec une limite de 10 Mo.

## Fournisseurs

L'onglet **Fournisseurs** reprend les nouvelles inscriptions envoyees depuis le portail fournisseur lorsque la base Business Radar est configuree. L'e-mail de soumission reste envoye par le systeme existant meme si l'enregistrement dans la base est temporairement indisponible.

## Exports

Les boutons **CSV** et **Excel** exportent jusqu'a 200 opportunites selon les filtres actifs. Les fichiers conservent les accents, dates, valeurs, devises et liens source. Les cellules externes commencant par `=`, `+`, `-` ou `@` sont neutralisees afin d'eviter l'execution d'une formule dans Excel.

## Alertes

Une opportunite reelle peut produire une alerte pour un score d'au moins 80, une echeance inferieure a sept jours ou 72 heures, ou une inscription fournisseur requise. Les e-mails Preview sont marques **Business Radar Preview**. Les sources DEMO ne produisent jamais d'alerte.

## Supprimer les donnees DEMO

Dans **Opportunites**, choisissez **Supprimer les DEMO**, puis confirmez. Cette action supprime toutes les opportunites et sources de demonstration, sans toucher aux donnees reelles.

## Bonnes pratiques

- Conserver le lien vers la source originale.
- Ne jamais transformer une hypothese IA en fait sans verification.
- Ne pas saisir de mot de passe, cle API ou document confidentiel dans une description.
- Mettre a jour le statut apres chaque decision importante.
- Archiver les dossiers clos afin de garder une liste exploitable.
