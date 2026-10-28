# Revue du plan — mise à jour du 28 octobre 2026

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

### Incrément incidents et non-conformités

Le code ajoute les déclarations d’incident, presque-accident, non-conformité et réclamation; l’analyse des causes avec jusqu’à cinq pourquoi; la correction immédiate; le coût de non-qualité en devise; l’attribution d’un responsable et d’un vérificateur distincts; les actions correctives du plan unique et la décision motivée d’efficacité. La clôture exige des actions terminées et une validation du vérificateur désigné. Une action rouverte fait revenir automatiquement le signalement au plan d’actions et invalide son résultat d’efficacité, dans la même transaction.

La migration `003_reports.sql` ajoute tables, contraintes, politiques, historique et synchronisation des actions. Les membres « reader » peuvent déclarer sur leurs sites et consulter leurs propres signalements. Les managers/admins traitent ceux de leurs sites. Les actions et journaux liés suivent aussi la visibilité du signalement afin de ne pas révéler les déclarations d’autres personnes par le plan commun.

Six nouveaux tests locaux passent (15 au total). Les tests PostgreSQL couvrent usurpation de déclarant, sites, confidentialité, indépendance de la vérification et réouverture automatique; un test HTTP déroule le cycle complet. Ces tests d’intégration et le build restent à exécuter. Les photos/fichiers, notifications, diagramme Ishikawa, indicateurs SST et signalements anonymes/confidentiels ne sont pas ajoutés par cet incrément.

### Incrément pièces jointes privées

Le code ajoute stockage compatible S3, uploads temporaires par politique signée, vérification serveur des octets/taille/type/SHA-256 et copie finale distincte. Les téléchargements sont autorisés depuis le parent et signés pour 60 secondes. Les écrans Documents et Incidents permettent l’ajout de fichiers/photos, la finalisation/reprise d’un envoi, son annulation et le téléchargement. Limites initiales : 10 Mo et 20 fichiers actifs par parent.

La migration `004_attachments.sql` hérite des droits tenant/site/parent, protège l’historique et actualise les révisions et manifestes des parents. Les fichiers d’une version soumise sont figés. Les fichiers d’un signalement sont figés pendant sa vérification/clôture; un lecteur peut joindre à sa propre déclaration sans gagner le droit d’analyse. Un upload incomplet bloque soumission documentaire, démarrage d’analyse ou vérification d’efficacité jusqu’à finalisation/annulation.

Le profil Docker `storage` et `storage:init` configurent un MinIO local privé; la CI comprend désormais ses tests d’intégration. Dix tests d’intégrité/métadonnées et un test de configuration supplémentaires passent (26 tests locaux au total). La compilation et la recette PostgreSQL/MinIO/SSO/navigateur restent ouvertes. Les copies finales sont conservées après retrait de l’association pour l’audit; antivirus, politique de rétention/purge, réconciliation des objets orphelins et export intégral restent à compléter.

### Incrément audits opérationnels — 26 octobre

Le menu Audits est relié à l’API et à la migration `005_audits.sql`. Il permet de planifier une mission par site/référentiel, périmètre et dates avec responsable d’audit et responsable audité distincts; préparer une checklist de 30 points maximum; figer ses questions au démarrage; documenter résultats et preuves; créer des non-conformités liées aux écarts et ouvrir leur suivi existant. La création du signalement et du lien est atomique et sérialisée avec les décisions de l’audit.

Seul le responsable d’audit désigné réalise la checklist et finalise; les managers/admins du site consultent et planifient. Les lecteurs n’accèdent pas à ce premier espace opérationnel. Toute finalisation exige une conclusion, des résultats justifiés et une non-conformité par écart. Le rapport JSON est figé dans la base et exportable, avec les identités, dates, preuves et liens. Finaliser l’audit ne clôture pas les non-conformités : leur analyse, actions et vérification indépendante conservent leur cycle existant. L’historique et les liens ne sont pas modifiables par le rôle applicatif.

La compilation, les migrations et la recette de ce nouveau parcours restent à effectuer. L’installation des dépendances a de nouveau échoué sur une connexion réseau refusée par l’environnement. Aucun nouveau résultat de test n’est revendiqué pour cet incrément. Programme annuel, replanification, qualification et équipe d’auditeurs, modèles de checklist, pièces jointes d’audit, PDF et diffusion restent à compléter.

### Suite audits : révision du plan et rapport imprimable

La migration `006_audit_replanning.sql` permet une révision motivée avant démarrage : titre, référentiel, périmètre, dates et responsables. La révision attendue et le verrou de ligne protègent les modifications concurrentes. Les managers/admins du site peuvent replanifier; le site, la checklist et le cycle de réalisation restent inchangés pendant cette opération. L’historique immuable distingue les replanifications et expose le motif et les valeurs avant/après. Une fois démarré, le plan est figé. Les participants sont revérifiés au démarrage.

Le rapport finalisé dispose maintenant d’une présentation imprimable via le navigateur, avec enregistrement PDF depuis son dialogue d’impression. Les nouvelles finalisations capturent les noms de l’organisation, du site et des personnes; les anciens snapshots restent inchangés et affichent leurs identifiants historiques. La vue imprimée ne mélange pas le contenu figé et les statuts actuels des non-conformités. Génération PDF automatique, programme annuel, qualification et équipe d’auditeurs, modèles, fichiers et diffusion restent à développer.

Les contrôles de syntaxe Node des fichiers compatibles et la vérification des espaces Git ont été effectués. Aucun test supplémentaire n’a été ajouté ou exécuté. La compilation, l’application des migrations et la recette navigateur/impression demeurent ouvertes; les dépendances de compilation ne sont pas installées dans cet environnement.

### Suite audits : modèles de checklist versionnés

La migration `007_audit_templates.sql` ajoute la bibliothèque par site et ses versions immuables, avec code, titre, référentiel/édition, description de changement, auteur/date et empreinte de checklist. Le menu Audits expose création/publication, nouvelle version, recherche, pagination et historique des 100 dernières versions. Les managers/admins sont limités à leurs sites autorisés; les lecteurs n’accèdent pas à cet espace.

Le responsable d’un audit planifié peut copier une version compatible du même site, avec confirmation de remplacement si une checklist existe. Les questions sont copiées sans résultats ni preuves avec de nouveaux identifiants. Le verrou de l’audit, sa révision attendue et l’écriture atomique de la provenance évitent l’écrasement concurrent ou une source fictive sans copie correspondante. Le rapport final conserve toutes les sources copiées; le contenu final de l’audit reste distinct et peut être adapté avant démarrage. Les modifications ultérieures du modèle ne se propagent jamais aux audits existants.

Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git ont été effectués. Aucun test nouveau n’a été ajouté ou exécuté. Compilation, migration et recette PostgreSQL/navigateur restent ouvertes. Programme annuel, qualification et équipe d’auditeurs, approbation/retrait des modèles, partage entre sites, pièces jointes d’audit et diffusion restent à développer.

### Suite audits : planning annuel opérationnel — 28 octobre

Une vue annuelle affiche douze mois, les effectifs par statut et les missions en retard sur le périmètre tenant/site autorisé, avec filtres de recherche et de statut. Les missions sont sélectionnées par chevauchement de dates : les missions couvrant plusieurs mois figurent dans chacun, mais une seule fois au total annuel. Le filtre de mois agit sur la liste et n’altère pas la vue annuelle. La liste est maintenant paginée par 25 missions au lieu de s’arrêter aux 100 premières.

L’API `/audits/programme` calcule les compteurs sur tous les audits autorisés en une requête SQL, sans dépendre de la pagination; l’API de liste accepte les paramètres `year` et `month`. Les retards utilisent la date UTC serveur : début dépassé pour les missions planifiées, fin dépassée pour celles en cours, sans inclure les audits annulés/finalisés. Les compteurs sont actualisés après les mutations et à la demande. Aucun changement de schéma n’est nécessaire.

Ce planning ne remplace pas l’approbation d’un programme annuel. Objectifs/budgets annuels, approbation/révision de programme, qualification et équipe d’auditeurs restent à développer. Les contrôles de syntaxe des services/contrats compatibles avec Node et des espaces Git ont passé; aucun test n’a été ajouté ou exécuté. Compilation, requêtes PostgreSQL et navigateur demeurent à recetter.

### Suite audits : qualification du responsable d’audit

La migration `008_auditor_qualifications.sql` ajoute un registre par site/personne/référentiel, avec dates de validité, justificatif référencé, évaluation nominative et révocation motivée. Les managers/admins habilités évaluent une autre personne habilitée; aucune auto-attribution n’est permise. Évaluations et révocations sont conservées sans droit de modification/suppression pour le rôle applicatif. Le registre dispose d’un écran de saisie, consultation, filtres et pagination.

Les nouveaux démarrages exigent une qualification non révoquée couvrant la période planifiée et valide à la date UTC de démarrage. La vérification est dans l’API et la base. Un verrou partagé par périmètre qualification/démarrage sérialise attribution, révocation et démarrage. La preuve choisie et ses noms sont figés au démarrage puis incorporés au rapport final. Les audits déjà démarrés avant migration n’obtiennent pas de preuve rétroactive; une révocation/expiration ultérieure n’altère pas la preuve historique et ne suspend pas automatiquement une mission en cours.

Aucune qualification n’est préchargée dans les fixtures. Deux personnes habilitées distinctes sont nécessaires pour l’attribution. Pièces justificatives binaires, contrôle d’authenticité/accréditation, équipe d’auditeurs, suspension/remplacement en cours de mission et relances restent à développer. Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git passent. Aucun test ajouté ou exécuté; compilation, migration et recette PostgreSQL/navigateur restent ouvertes.

### Prochaines étapes actualisées

Le code et le workflow de vérification sont publiés sur `khalimouad/Sentinel-qhse`, branche `main`. Le workflow inclut PostgreSQL 17, migrations, fixtures, tests métier, vérification des types, build et tests d’isolation/HTTP. Son premier lancement n’a exécuté aucune étape et n’a reçu aucun runner; la vérification reste ouverte. Le snapshot importé est identique au dépôt local (empreinte de l’arbre Git contrôlée).

1. Terminer la recette de cette fondation : exécuter le build, les tests d’isolation et le parcours navigateur; connecter un fournisseur OIDC de test et produire le lockfile.
2. Compléter le socle partagé : terminer la recette documentaire, des signalements et fichiers privés, puis compléter les audits, risques, commentaires et file de notifications; définir le scan et la conservation des fichiers avant exploitation.
3. Registre des obligations : textes et versions, articles, preuves, responsables, évaluations et décisions humaines; commencer avec des sources vérifiées pour les pays choisis.
4. Anticorruption : tiers, cadeaux/conflits, alertes anonymes et enquêtes avec une politique d’accès distincte. Les droits du socle ne doivent pas donner accès aux enquêtes.
5. Agent de veille : ingestion par source/pays, extraction et recherche sourcée, suivi des versions, validation humaine, évaluations sur corpus contrôlé avant mise en service.
6. Modules sectoriels et mobile hors connexion : choisir les premiers référentiels avec les clients pilotes, puis livrer les parcours terrain et règles de synchronisation.

## Critères avant exploitation de production

Un tenant ne doit pouvoir accéder à aucune donnée ni pièce jointe d’un autre tenant; les restrictions de sites et d’enquêtes doivent aussi s’appliquer aux recherches, exports, notifications et outils d’administration. Vérifier restauration, export complet, performances, supervision, sauvegardes, sécurité OIDC et gestion des secrets. Le nom d’une région dans la base constitue une métadonnée, pas une preuve de résidence ou de conformité juridique.

Les graphiques, risques et textes réglementaires de l’interface restent des aperçus identifiés comme exemples. Ils ne constituent ni mesures réelles ni avis réglementaires.
