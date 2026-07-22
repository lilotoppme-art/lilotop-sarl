# Guide utilisateur - LILOTOP Business Radar

## Connexion

Ouvrez `/admin/business-radar` sur l'environnement autorise. Saisissez l'adresse administrateur et le mot de passe initial defini par l'administrateur technique. La session se ferme automatiquement apres huit heures.

## Vue generale

La page d'accueil du module affiche le nombre total d'opportunites, les nouvelles opportunites, les dossiers avec un score superieur ou egal a 70, les donnees de demonstration, les principaux secteurs, les pays, les prochaines echeances et les dernieres executions.

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

## Fournisseurs

L'onglet **Fournisseurs** reprend les nouvelles inscriptions envoyees depuis le portail fournisseur lorsque la base Business Radar est configuree. L'e-mail de soumission reste envoye par le systeme existant meme si l'enregistrement dans la base est temporairement indisponible.

## Exports

Les boutons **CSV** et **Excel** exportent jusqu'a 200 opportunites selon le filtre serveur. Les fichiers contiennent les informations operationnelles et les liens source; ils ne contiennent aucun secret.

## Alertes

Une nouvelle opportunite reelle avec un score d'au moins 70 peut produire une alerte a l'adresse configuree. Les sources DEMO ne produisent jamais d'alerte. En cas de doute, consultez l'historique et demandez une verification technique avant de relancer plusieurs fois.

## Bonnes pratiques

- Conserver le lien vers la source originale.
- Ne jamais transformer une hypothese IA en fait sans verification.
- Ne pas saisir de mot de passe, cle API ou document confidentiel dans une description.
- Mettre a jour le statut apres chaque decision importante.
- Archiver les dossiers clos afin de garder une liste exploitable.
