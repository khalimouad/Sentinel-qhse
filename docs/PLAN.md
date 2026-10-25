# Revue du plan — mise à jour du 25 octobre 2026

## Décisions confirmées

- SaaS développé sur mesure, commercialisable en Afrique et en Europe dès la V1.
- Next.js/React/TypeScript, API NestJS REST/OpenAPI, PostgreSQL et monolithe modulaire.
- Livraison progressive du socle, puis conformité/anticorruption et modules sectoriels.
- Toute décision réglementaire assistée par IA nécessite une validation humaine nommée et des références vérifiables.
- Pays précis, hébergeur, résidence, transferts autorisés, référentiels prioritaires et budget ne sont pas encore fixés. Aucun hébergement de production n’est provisionné.

## Écart constaté avant cette étape

Le dépôt contenait une interface Vite/React avec données d’illustration et actions dans `localStorage`. Il ne contenait ni API, ni base, ni identité vérifiée, ni isolation tenant. Le travail suivant doit donc commencer par les fondations SaaS avant d’étendre les écrans métier.

## Étape actuelle : fondations et premier parcours serveur

Code ajouté, en attente de compilation et de recette avec PostgreSQL :

- Monorepo npm : application Next.js, API NestJS TypeScript et contrats partagés.
- Organisations et juridictions configurables, annuaire d’identités, adhésions, rôles et périmètres de sites.
- Jetons d’accès OIDC vérifiés par l’API, code d’autorisation + PKCE côté web, cookies chiffrés HttpOnly, vérification d’origine sur mutations.
- Liste et création d’actions, clôture/réouverture, échéances, assignees, filtrage, export JSON des données chargées et consultation de l’historique.
- Transactions avec identité et tenant locaux à la connexion; RLS tenant/site; rôle SQL sans accès direct à l’annuaire; historique inséré par déclencheur dans la transaction métier.
- Détection des modifications concurrentes par version : un client obsolète reçoit HTTP 409.
- Configuration de développement locale explicite, migrations contrôlées par empreinte et fixtures pour deux organisations.

Vérification effectuée : trois tests de configuration et contrôles de syntaxe des fichiers compatibles avec Node. Restent à exécuter : installation/verrouillage des dépendances, compilation TypeScript/Next, migrations, tests PostgreSQL/HTTP et recette navigateur/SSO avec le fournisseur choisi.

## Suite du plan, dans l’ordre

### Incrément documentaire ajouté le 25 octobre

Le code du premier module documentaire complète maintenant le socle : documents texte par tenant/site, code unique, brouillons et versions, vérificateur et approbateur nommés et distincts de l’auteur, soumission avec contenu figé, validation en deux étapes, publication, retour motivé, archivage de la précédente publication et accusé de lecture idempotent. Les versions comportent une empreinte SHA-256, les dates de vérification/approbation et un historique attribué.

Le parcours Documents est relié à l’API. Les brouillons sont réservés aux participants; les publications et archives sont visibles aux utilisateurs autorisés du site. La migration `002_documents.sql` ajoute les tables, politiques et déclencheurs; relancer `db:migrate` puis `db:seed` pour disposer des trois responsables nécessaires dans les fixtures locales.

Six tests métier documentaires passent, en plus des trois tests de configuration. Les tests PostgreSQL ajoutés pour confidentialité des brouillons, immutabilité, accusés de lecture et remplacement d’une publication restent à exécuter. Les fichiers binaires, diffusion nominative avec relances, signatures via prestataire et retrait/archivage sans remplacement restent à compléter. L’approbation nominative actuelle n’est pas une intégration de signature électronique qualifiée.

### Prochaines étapes

Le code et le workflow de vérification sont publiés sur `khalimouad/Sentinel-qhse`, branche `main`. Le workflow inclut PostgreSQL 17, migrations, fixtures, tests métier, vérification des types, build et tests d’isolation/HTTP. Son premier lancement n’a exécuté aucune étape et n’a reçu aucun runner; la vérification reste ouverte. Le snapshot importé est identique au dépôt local (empreinte de l’arbre Git contrôlée).

1. Terminer la recette de cette fondation : exécuter le build, les tests d’isolation et le parcours navigateur; connecter un fournisseur OIDC de test et produire le lockfile.
2. Compléter le socle partagé : terminer la recette documentaire et les fichiers/pièces jointes privés, puis incidents/non-conformités, audits, risques, commentaires, workflows et file de notifications.
3. Registre des obligations : textes et versions, articles, preuves, responsables, évaluations et décisions humaines; commencer avec des sources vérifiées pour les pays choisis.
4. Anticorruption : tiers, cadeaux/conflits, alertes anonymes et enquêtes avec une politique d’accès distincte. Les droits du socle ne doivent pas donner accès aux enquêtes.
5. Agent de veille : ingestion par source/pays, extraction et recherche sourcée, suivi des versions, validation humaine, évaluations sur corpus contrôlé avant mise en service.
6. Modules sectoriels et mobile hors connexion : choisir les premiers référentiels avec les clients pilotes, puis livrer les parcours terrain et règles de synchronisation.

## Critères avant exploitation de production

Un tenant ne doit pouvoir accéder à aucune donnée ni pièce jointe d’un autre tenant; les restrictions de sites et d’enquêtes doivent aussi s’appliquer aux recherches, exports, notifications et outils d’administration. Vérifier restauration, export complet, performances, supervision, sauvegardes, sécurité OIDC et gestion des secrets. Le nom d’une région dans la base constitue une métadonnée, pas une preuve de résidence ou de conformité juridique.

Les graphiques, risques et textes réglementaires de l’interface restent des aperçus identifiés comme exemples. Ils ne constituent ni mesures réelles ni avis réglementaires.
