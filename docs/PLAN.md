# Revue du plan — mise à jour du 29 octobre 2026

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

### Socle partagé : commentaires de suivi des actions — 29 octobre

La migration `009_action_comments.sql` ajoute des commentaires attribués, horodatés et non modifiables sur les actions du plan commun. L’API expose consultation paginée et ajout; le dialogue partagé est accessible depuis l’historique du plan d’actions et les actions correctives des signalements. Les managers/admins habilités ajoutent les commentaires; les lecteurs consultent uniquement ceux des actions déjà visibles dans leur périmètre. Les politiques reprennent aussi la confidentialité du signalement parent.

Les reprises du même envoi utilisent une clé d’idempotence par tenant/action/auteur; un contenu différent sous la même clé est refusé. Aucun droit UPDATE/DELETE sur les commentaires n’est accordé au rôle applicatif, et un déclencheur protège leur conservation. L’ajout ne modifie ni la version ni le statut de l’action, et ne remplace pas une preuve de vérification d’efficacité.

Notifications, mentions, fichiers joints, extension aux autres objets et export/rétention complets restent ouverts. L’installation des dépendances a encore échoué sur un refus de connexion réseau de l’environnement. Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git passent; aucun test ajouté ou exécuté. Compilation, migration et recette PostgreSQL/navigateur restent à effectuer.

### Socle partagé : notifications internes transactionnelles

La migration `010_in_app_notifications.sql` ajoute les notifications d’attribution d’action et de commentaire adressé au responsable, hors auto-notification. Elles sont créées dans la transaction métier, avec déduplication par destinataire/type/source. Les anciennes données ne génèrent pas de notifications rétroactives. La cloche d’illustration est remplacée par un compteur et une boîte paginée réels, avec filtre non-lues, lecture individuelle et accès aux commentaires et au signalement éventuel.

Le destinataire doit rester autorisé à voir l’action; les politiques de notifications héritent de sa confidentialité tenant/site/signalement, même pour le décompte. La lecture est horodatée serveur et idempotente; les autres utilisateurs ne peuvent ni lire ni acquitter une notification. Le runtime ne peut pas en créer manuellement ni les supprimer. Le compteur utilise une actualisation périodique et au retour de fenêtre/onglet, pas du temps réel.

Notifications de documents/audits, rappels d’échéance, préférences, e-mail/SMS/push et file de livraison externe restent ouverts. Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git passent. Aucun test ajouté ou exécuté; compilation, migration et recette PostgreSQL/navigateur restent à effectuer.

### Socle partagé : registre des risques opérationnels

La migration `011_risks.sql` ajoute un registre tenant/site avec responsable habilité, catégories, cotations initiale et résiduelle 1–5, mesures de maîtrise et échéance de revue. Les scores sont calculés dans PostgreSQL. La matrice de l’interface est agrégée sur tout le périmètre autorisé et les filtres métier, puis une case peut filtrer la liste paginée. Les revues dépassées utilisent la date UTC serveur. Les seuils de couleur sont initiaux et fixes; aucune acceptation n’est calculée automatiquement.

Les réévaluations et décisions exigent une révision attendue et un motif. L’acceptation est nominative, réservée à une personne distincte du responsable, avec actions terminées et revue non dépassée. L’archivage exige la fin des actions et un motif. Les risques acceptés/archivés sont figés jusqu’à réouverture. Une action rouverte remet automatiquement son risque en traitement et invalide l’acceptation courante dans la même transaction; l’historique conserve la preuve antérieure.

Les actions de traitement rejoignent le plan commun, ses commentaires et notifications. Leur visibilité hérite du risque, ce qui protège aussi les vues transversales et les compteurs de notifications. Les lecteurs n’ont pas accès au premier registre opérationnel. Les aperçus de risques du tableau de bord général restent explicitement illustratifs; le registre est connecté aux données de l’organisation.

Matrices configurables, déclinaisons DUERP/AMDEC et sectorielles, pièces jointes, rappels de revue et export complet restent ouverts. Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git passent; aucun test ajouté ou exécuté. Compilation, migration et recette PostgreSQL/navigateur demeurent à effectuer.

### Socle partagé : vue d’ensemble opérationnelle réelle

La route `/overview` agrège, en une requête SQL, toutes les données autorisées du tenant/site : actions et échéances, publications et accusés de lecture, signalements ouverts, audits planifiés/en cours et risques non archivés. Les compteurs ne dépendent pas des pages chargées. Les lecteurs ne reçoivent pas de compteurs d’audits/risques, et les actions/signalements conservent leur confidentialité sous RLS. Six actions ouvertes sont proposées par retard, priorité et échéance, avec accès au suivi et clôture à version attendue.

L’accueil retire les anciens pourcentages, graphiques, échéances et synthèses de risques fictifs. La conformité reste un aperçu distinct : aucun taux réglementaire n’est présenté comme calculé. Le menu d’actions reste limité aux 100 plus récentes; ses statistiques sont explicitement calculées sur les données chargées, et les anciens messages de tendance/synchronisation fictive ont été retirés. Les échéances utilisent la date UTC serveur; l’heure d’actualisation est affichée en Europe/Paris. Aucun changement de schéma n’est requis au-delà des migrations existantes.

Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git passent. Aucun test ajouté ou exécuté. Compilation, requête PostgreSQL et recette navigateur restent à vérifier. Le dernier workflow GitHub consulté (`40849026215`) n’a eu aucun runner et n’a exécuté aucune étape : aucun résultat de build ne peut en être déduit.

### Registre des obligations : premier parcours manuel

La migration `012_obligations.sql` ajoute les références par tenant/site : juridiction, texte, version/édition saisie, article, lien HTTPS et extrait figés avec empreinte SHA-256. Le menu Conformité remplace les exemples par le registre réel, avec recherche, filtres actif/archivé et évaluation, pagination et historique. La référence doit être vérifiée par un responsable distinct du créateur avant toute évaluation. Vérificateur et date sont attribués par le serveur; le contrôle humain n’est pas une certification automatique du domaine ou du texte.

Les évaluations sont humaines et nominatives, avec statut, conclusion/applicabilité, références de preuves, responsable et prochaine revue non dépassée. Une réévaluation conserve sa trace même si les valeurs sont identiques. L’archivage exige un motif; la réouverture remet la fiche à évaluer sans réécrire la référence historique. Les compteurs de l’accueil présentent les obligations actives enregistrées, les sources non vérifiées, les conclusions et retards, sans taux global. Les lecteurs n’accèdent pas à ce premier registre.

Les sources ne sont ni téléchargées ni inventées par l’application. Versionnement structuré/amendements, liens aux actions, pièces de preuve, connecteurs officiels, rappels, retrait de vérification et propositions IA restent à développer après choix des pays et sources. Les champs de version servent de citation explicite, sans prétendre à une base réglementaire exhaustive. Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git passent; aucun test ajouté ou exécuté. Compilation, migration et recette PostgreSQL/navigateur restent à effectuer.

### Obligations : actions de traitement et invalidation de l’évaluation

La migration `013_obligation_actions.sql` relie les obligations au plan commun. Une référence active et vérifiée peut recevoir des actions attribuées à des responsables habilités du site. La fiche expose consultation paginée, compteur complet des actions ouvertes, clôture/réouverture et commentaires. Les notifications orientent aussi vers l’obligation et l’action concernées. Une contrainte limite chaque action à une origine unique parmi signalement, risque et obligation; les FKs et politiques d’accès propagent le périmètre tenant/site/obligation aux vues transversales.

Une action ajoutée ou rouverte remet l’évaluation à effectuer et, si nécessaire, réactive une obligation archivée, dans la même transaction. La référence vérifiée demeure inchangée et la décision antérieure reste au journal. La clôture d’actions ne produit aucun verdict de conformité. Une conclusion conforme/non applicable et l’archivage exigent l’absence d’action ouverte, en plus des contrôles humains déjà présents. Les changements d’action incrémentent la révision de l’obligation; les écritures obsolètes sont refusées par l’API.

La synchronisation interne utilise des colonnes non modifiables par le runtime et un déclencheur étroit, sans permettre au client de réécrire une évaluation. Les contrôles de syntaxe Node des services/contrats compatibles et des espaces Git passent. Aucun test ajouté ou exécuté; compilation, migration et recette PostgreSQL/navigateur restent ouvertes.

### Prochaines étapes actualisées

Le code et le workflow de vérification sont publiés sur `khalimouad/Sentinel-qhse`, branche `main`. Le workflow inclut PostgreSQL 17, migrations, fixtures, tests métier, vérification des types, build et tests d’isolation/HTTP. Son premier lancement n’a exécuté aucune étape et n’a reçu aucun runner; la vérification reste ouverte. Le snapshot importé est identique au dépôt local (empreinte de l’arbre Git contrôlée).

1. Terminer la recette de cette fondation : exécuter le build, les tests d’isolation et le parcours navigateur; connecter un fournisseur OIDC de test et produire le lockfile.
2. Compléter le socle partagé : terminer la recette documentaire, des signalements et fichiers privés, puis compléter les audits, risques et file de notifications, puis étendre les commentaires aux autres objets; définir le scan et la conservation des fichiers avant exploitation.
3. Registre des obligations : textes et versions, articles, preuves, responsables, évaluations et décisions humaines; commencer avec des sources vérifiées pour les pays choisis.
4. Anticorruption : tiers, cadeaux/conflits, alertes anonymes et enquêtes avec une politique d’accès distincte. Les droits du socle ne doivent pas donner accès aux enquêtes.
5. Agent de veille : ingestion par source/pays, extraction et recherche sourcée, suivi des versions, validation humaine, évaluations sur corpus contrôlé avant mise en service.
6. Modules sectoriels et mobile hors connexion : choisir les premiers référentiels avec les clients pilotes, puis livrer les parcours terrain et règles de synchronisation.

## Critères avant exploitation de production

Un tenant ne doit pouvoir accéder à aucune donnée ni pièce jointe d’un autre tenant; les restrictions de sites et d’enquêtes doivent aussi s’appliquer aux recherches, exports, notifications et outils d’administration. Vérifier restauration, export complet, performances, supervision, sauvegardes, sécurité OIDC et gestion des secrets. Le nom d’une région dans la base constitue une métadonnée, pas une preuve de résidence ou de conformité juridique.

La vue d’ensemble et les registres connectés présentent les données serveur autorisées. Les références réglementaires sont maintenant saisies et vérifiées par les responsables; aucun texte n’est préchargé et aucune veille automatique n’est connectée. Aucun taux global de conformité réglementaire n’est calculé.

## Administration de la plateforme — premier lot

La migration `014_platform_admin.sql`, les routes `/platform/*` et l’écran `/admin` ajoutent la création d’entreprises/sites, le rattachement d’identités du fournisseur configuré et la modification/suspension des rôles et accès par site. Le registre privé des opérateurs de plateforme est distinct des administrateurs d’entreprise. Les opérations sont motivées, journalisées et les modifications d’adhésion utilisent une révision attendue. Aucun droit de lecture globale des dossiers QHSE n’est ajouté.

La procédure d’amorçage et les limites sont documentées dans `docs/PLATFORM_ADMIN.md`. La création des identités chez le fournisseur, les invitations et la pagination détaillée des comptes restent à développer. Migration et isolation doivent encore être validées dans PostgreSQL avec des identités réelles.

## Administration — modification des entreprises et sites

La migration `015_platform_metadata.sql` et les formulaires de `/admin` permettent de modifier les métadonnées des entreprises/sites avec motif, révision attendue et journal avant/après atomique. Les verrous suivent l’ordre entreprise puis site et la fonction refuse un site extérieur à l’entreprise sélectionnée. Les droits plateforme restent distincts des droits métier. La migration et les conflits concurrents restent à valider dans PostgreSQL.

## Administration — recherche des comptes et historique paginé

La migration `016_platform_lists.sql` remplace les comptes et événements embarqués dans la fiche par deux listes indépendantes avec compteurs complets, recherche et filtres. L’interface affiche 25 lignes par page, conserve les filtres après les mutations et permet de consulter les valeurs avant/après de l’historique. Les fonctions SQL sont réservées aux opérateurs plateforme et ne donnent pas accès aux dossiers métier. Les sites restent chargés ensemble pour les habilitations. Exécution PostgreSQL et vérifications d’isolation restent nécessaires.

## Correction des chargements sans contexte utilisateur

Le diagnostic du déploiement a confirmé que seule la configuration de session est présente : l’URL de l’API et les paramètres OIDC ne sont pas encore renseignés. Le build web réussi ne signifie donc pas que le parcours connecté est opérationnel. L’accès HTTP automatisé au déploiement est en outre bloqué par Vercel Authentication dans cet environnement.

Le tableau de bord ne monte plus les modules métier tant que le contexte utilisateur n’est pas disponible. Il distingue chargement, connexion requise et indisponibilité avec motif et reprise. La vue d’ensemble traite aussi explicitement l’absence de contexte. Les requêtes du client ont un délai maximal (25 secondes, 70 pour confirmation de pièce jointe) tout en conservant l’annulation au changement de page. En production, le proxy renvoie un 503 explicite si l’API n’est pas configurée, au lieu de tenter localhost. L’API hébergée, PostgreSQL/migrations, OIDC et le premier administrateur restent nécessaires pour une utilisation réelle.

## Démonstration locale au navigateur

Les routes `/demo` et `/demo/admin` donnent accès à un utilisateur administrateur fictif, une entreprise et deux sites, sans API ni OIDC. Les modules présentent des exemples explicitement inventés. Le plan d’actions, les commentaires et la confirmation de lecture disposent d’écritures locales. Les autres workflows non simulés indiquent leur limite sans appel réseau de repli. Une bannière identifie le mode, permet de le quitter et de réinitialiser le stockage du navigateur. Les permissions serveur et le proxy réel ne sont pas modifiés. Voir `docs/DEMO.md`.

## Lot invitations — raccordement et recette locale

La migration 024, l'API et l'interface relient la demande à un envoi explicite, un état confirmé ou incertain, un rattachement et une réconciliation contrôlée. Un rôle PostgreSQL distinct vérifie les opérations du service ; l'API exige un administrateur plateforme du fournisseur configuré. Le projet fournisseur est figé dès la réservation. Une réconciliation incertaine vérifie le sujet et l'adresse confirmée auprès de Supabase, sans prétendre que le message a été livré. L'activation reste opt-in et nécessite les secrets et la recette réelle détaillés dans `docs/DEPLOIEMENT_PILOTE.md`.

### Recette avec propriétaire de base restreint

Une base locale vierge a été migrée sous `sentinelle_schema_owner` sans SUPERUSER ni BYPASSRLS. La migration 026 ajoute la politique SELECT nécessaire à l'INSERT dédupliqué des notifications, limitée au seul propriétaire et à l'acteur courant sur ses sites d'écriture. L'application conserve le cloisonnement par destinataire. Les tests de recette passent avec ce propriétaire ; ce résultat ne constitue pas une recette du projet Supabase hébergé.

## Socle — consultation du plan d'actions paginé

Le registre « Mes actions » charge maintenant les résultats par pages de 25, avec recherche par intitulé et filtres de statut et de site appliqués par l'API avant pagination. Le total reflète les résultats visibles dans le périmètre de l'utilisateur. Les actions plus anciennes sont accessibles, peuvent être clôturées ou rouvertes avec contrôle de version, et donnent accès à leur historique et à leurs commentaires. La réouverture d'une action liée rappelle que le dossier parent peut revenir en traitement. Le mode de démonstration applique les mêmes filtres.

L'export JSON est explicitement limité à la page affichée ; il ne constitue pas l'export complet du tenant ni un export PDF/Excel. L'historique reste limité aux 100 derniers événements. Une recette navigateur et l'export complet restent nécessaires. Le build complet et le test du filtrage et de la pagination en démonstration ont réussi.

## Socle — export des actions filtrées

L'API expose `GET /api/v1/actions/export`, avec les mêmes filtres de site, statut et intitulé et les mêmes politiques de sécurité que le registre. Une requête SQL unique fournit un instantané cohérent des actions visibles, indépendamment de la page affichée. Pour éviter une extraction partielle silencieuse ou trop volumineuse, l'API refuse plus de 10 000 résultats et demande d'affiner les filtres. Le client produit un fichier CSV UTF-8 avec BOM, séparateur point-virgule, échappement des champs et neutralisation des formules de tableur. La démonstration suit le même parcours.

Les tests API couvrent les restrictions d'entreprise et de site et la validation des filtres ; les tests du CSV couvrent les formules, guillemets et retours à la ligne. Le build complet et 31 tests unitaires ont réussi. Cet export concerne uniquement les actions ; l'export complet des données et fichiers, PDF, XLSX natif et la recette navigateur restent à réaliser.

## Socle et conformité — exports des registres risques et obligations

Les registres des risques et des obligations proposent un export CSV de tous les résultats correspondant aux filtres actifs, y compris le site et la cellule de cotation sélectionnée pour les risques. Les API réutilisent les autorisations d'accès des registres et les politiques RLS ; un lecteur et une identité sans appartenance à l'entreprise ne peuvent pas exporter ces données. L'export est produit depuis un instantané SQL, limité à 10 000 lignes avec refus explicite au-delà. Le CSV UTF-8 protège les champs contre les formules de tableur. La démonstration accepte les mêmes filtres principaux.

La compilation complète, les tests unitaires et les tests HTTP ciblés des droits et filtres ont réussi sur une base locale. L'export reste limité aux champs affichés dans le registre ; il ne contient pas les pièces jointes, le journal complet ni les fichiers liés. La recette navigateur, le PDF, le XLSX natif et l'export global restent ouverts.

## Lot 2 — analyse Ishikawa des incidents et non-conformités

Les migrations 028 et 029 ajoutent six familles de causes au dossier : main-d'œuvre, méthodes, machines, matières, milieu et mesures. L'analyse est facultative, modifiable uniquement durant les phases d'analyse, soumise au contrôle de révision et enregistrée avec le journal existant. Les anciennes demandes API qui ne fournissent pas ce champ conservent les données antérieures. La validation interdit les familles inconnues et limite chaque champ à 1 000 caractères.

Les migrations ont été appliquées localement et sur le projet Supabase de test ; son conseiller de sécurité ne signale aucun avertissement. Le build complet et les 31 tests d'intégration locaux ont réussi, dont le parcours de non-conformité, la vérification indépendante, la concurrence, les droits et les pièces jointes sous un propriétaire de schéma restreint. La recette navigateur et l'utilisation avec les identités réelles restent à effectuer. La présentation est actuellement en français ; l'interface anglaise demeure à compléter.

## Lot 2 — consultation documentaire et lectures confirmées

Le registre documentaire charge les documents autorisés par pages de 25, avec recherche et filtre de site côté serveur. Les documents au-delà des 100 plus récents restent accessibles. Pour chaque version publiée ou archivée, les responsables habilités du site peuvent consulter les accusés de lecture horodatés, avec pagination. Les lecteurs ne peuvent pas consulter la liste des autres personnes ; les confirmations restent idempotentes. Cette vue montre les lectures reçues : elle ne détermine pas encore une population cible ni les personnes à relancer.

Le build complet et un test API/PostgreSQL du circuit publication, lecture, contrôle de rôle, isolation d'entreprise et pagination ont réussi. Une recette navigateur reste à réaliser. La diffusion ciblée et les relances par courriel restent ouvertes ; SOC-01 n'est pas encore validée.

## Lot 2 — registre et export des signalements

La liste des incidents, presque-accidents, non-conformités et réclamations est paginée par 25. Les filtres de titre, statut et site sont appliqués avant pagination et respectent les politiques de confidentialité des signalements. Un export CSV reprend tous les résultats visibles correspondant aux filtres, sans les pièces jointes ni le journal complet ; au-delà de 10 000 lignes, il refuse l'export et demande d'affiner les filtres. Les cellules sont échappées et les formules de tableur neutralisées.

Le build complet et les tests API/PostgreSQL ciblés ont réussi : 27 signalements sur deux pages, absence de doublons, filtre de statut, visibilité limitée au propre signalement d'un lecteur, export correspondant et refus d'un autre tenant. La recette navigateur et l'export intégral des données et fichiers restent à réaliser.

## Lot 2 — vérification d'efficacité des actions

Une vérification nominative peut être enregistrée pour une action clôturée, par un responsable habilité du site distinct de son responsable. Résultat et preuve sont obligatoires ; une clé d'idempotence permet de reprendre le même envoi. La vérification est liée à la version de l'action. Une réouverture conserve l'historique mais rend la vérification non courante. L'historique est paginé et hérite des restrictions tenant, site et dossier parent. Les décisions sont immuables et une version d'action ne peut recevoir qu'une décision ; pour une nouvelle décision, l'action doit être rouverte puis clôturée.

La migration 030 est installée sur le projet Supabase de test ; RLS est forcée et le rôle applicatif ne peut pas modifier les preuves. Le conseiller de sécurité Supabase ne signale aucun avertissement. Le build et les 34 tests d'intégration locaux ont réussi, y compris séparation des rôles, idempotence, changement de version et isolation d'entreprise. Le parcours à l'écran est accessible depuis le plan d'actions ; le mode démonstration permet seulement de consulter un historique vide. L'interface anglaise, la recette navigateur, les pièces justificatives et les relances restent à réaliser. Cette vérification ne déclenche pas automatiquement la clôture ou la réouverture des dossiers parents.

## Lot 2 — diffusion ciblée des documents

La migration 031 ajoute une liste nominative de destinataires liée à une version publiée. Un responsable habilité peut ajouter jusqu'à 100 comptes actifs autorisés sur le site par demande ; les doublons sont ignorés et une demande contenant un destinataire non autorisé est refusée intégralement. Les ajouts sont conservés avec leur auteur et date, sans modification ni suppression par le rôle applicatif. Les responsables du site consultent une liste paginée et le nombre de lectures confirmées ; les confirmations déjà enregistrées sont rapprochées automatiquement. Les versions archivées conservent la liste mais ne peuvent recevoir de nouveaux destinataires.

Cette étape ne transmet aucun message et ne retire pas les droits de lecture existants : notifications et relances, annulation motivée d'une affectation et recette navigateur restent à développer. Le mode démonstration affiche une liste vide et ne simule pas l'ajout. La migration est appliquée sur Supabase de test, avec RLS forcée et aucune alerte du conseiller de sécurité. Le build et 34 tests d'intégration locaux réussissent, dont destinataire hors entreprise, absence d'écriture partielle, doublon, confidentialité et confirmation de lecture.

## Lot 2 — notifications de diffusion documentaire

Chaque ajout d'un autre destinataire à une version publiée crée, dans la même transaction, une notification interne. Les ajouts répétés ne créent pas de doublon. La boîte de réception et son compteur combinent désormais les notifications d'actions et de documents ; ouvrir une notification conduit au document et marque la notification comme lue. L'utilisateur ne voit que ses notifications, tant qu'il conserve l'accès au site et que la version reste publiée. Le remplacement de la version masque la notification historique sans supprimer sa trace. Une auto-affectation ne crée pas de notification.

La migration 032 est installée sur Supabase de test ; RLS est forcée, l'application ne peut pas créer directement ces notifications et le conseiller de sécurité ne signale aucun avertissement. Le build et 34 tests d'intégration locaux ont réussi, dont création sous un propriétaire PostgreSQL sans contournement RLS, doublon, lecture, confidentialité et remplacement de version. La recette navigateur, les relances et les courriels restent ouverts ; aucune notification n'a été envoyée à un utilisateur réel pendant cette recette.

## Lot 2 — annulation motivée de diffusion

Un responsable habilité peut annuler un destinataire d'une version publiée en indiquant un motif. L'annulation est ajoutée au journal avec son auteur et sa date, et conserve toute confirmation de lecture antérieure. Les compteurs distinguent affectations actives et historiques. La notification associée est masquée dès l'annulation ; les accès documentaires existants ne changent pas. Une clé d'idempotence permet de reprendre le même envoi ; une affectation annulée ne peut pas être réactivée sur cette version dans ce premier parcours.

La migration 033 est installée sur Supabase de test, avec RLS forcée et aucune alerte du conseiller de sécurité. Le build et les 34 tests d'intégration locaux ont réussi, dont restriction des rôles, reprise, conservation d'un accusé, compteur actif et notification masquée. La recette navigateur, la réaffectation explicite, les relances et les courriels restent à réaliser.

## Lot 2 — relances documentaires internes

Un responsable habilité peut relancer manuellement un destinataire actif qui n'a pas confirmé la version publiée. La relance apparaît dans la boîte de notifications interne, avec accès au document ; elle est enregistrée avec son auteur et sa date, affichée dans le suivi de diffusion et limitée à une par destinataire sur 24 heures. La même clé d'envoi permet une reprise sans doublon. Après confirmation, annulation ou remplacement de version, la notification n'apparaît plus au destinataire ; le responsable conserve la trace. Aucune auto-relance n'est permise.

La migration 034 est installée sur Supabase de test ; RLS est forcée et le conseiller de sécurité ne signale aucun avertissement. Le build et 34 tests d'intégration locaux ont réussi, dont rôle, reprise, fréquence, lecture et masquage après confirmation. Cette étape ne programme pas de relance automatique et n'envoie aucun courriel ; le traitement différé, les préférences, le fournisseur de messagerie, la recette navigateur et les comptes réels restent ouverts.

## Lot 2 — sélection des destinataires et historique de relance

L'interface recherche les comptes actifs habilités sur le site du document ; les personnes déjà affectées, y compris celles dont l'affectation a été annulée, sont exclues de cette sélection. Les résultats sont paginés et la sélection reste visible entre les pages. Les responsables peuvent consulter, pour chaque destinataire, l'historique paginé des relances avec auteur, date et lecture de la notification. Ces consultations appliquent les permissions de l'entreprise et du site ; elles ne créent ni relance ni courriel.

Le build, les tests du mode démonstration et les 34 tests d'intégration locaux ont réussi. Les tests API ciblés couvrent recherche, exclusion après affectation, restriction aux responsables et isolation d'entreprise. Aucune migration n'est nécessaire. La recette navigateur et l'intégration de messagerie restent ouvertes.

## Priorité recentrée — premier bloc métier anticorruption

Conformément à la demande de l'utilisateur, les prochains développements privilégient les parcours métier de conformité et d'anticorruption, puis les modules sectoriels ; les finitions et approfondissements transverses seront traités ensuite. Les règles d'isolation existantes restent appliquées.

La migration 035 et le menu Anticorruption ajoutent un premier registre persistant de tiers, évaluations liées à un tiers, cadeaux/invitations et conflits d'intérêts. Les fiches comprennent site, responsable, analyse, risque, statut et date de revue ; les cadeaux comportent un montant et une devise. Les modifications sont historisées et soumises à une révision attendue. L'interface permet la création, consultation et mise à jour. Une évaluation doit référencer un tiers du même site.

La migration est appliquée sur Supabase de test ; le build et le test API/PostgreSQL local incluant dix tiers et les quatre types de fiche ont réussi. Ce premier registre ne couvre pas encore questionnaires structurés, seuils et circuits d'approbation, décisions indépendantes, dons, sanctions/PEP, pièces justificatives, export ou bilinguisme. L'API hébergée reste à déployer ; le mode démonstration présente des listes vides et ne simule pas les écritures. Les exigences AC-03 et AC-04 ne sont pas encore validées.

## Anticorruption — questionnaires, dons et décisions

Les évaluations de tiers comportent désormais un premier questionnaire structuré de cinq questions, versionné : bénéficiaires effectifs, liens publics, politique anticorruption, faits défavorables et intermédiaires. Les réponses sont conservées avec le dossier et son historique. Le risque reste saisi par un responsable ; aucune conclusion automatique n'est produite.

Un registre des dons et parrainages complète les cadeaux et conflits. Les évaluations et déclarations peuvent recevoir une décision motivée d'approbation, de refus ou d'approbation conditionnelle, avec auteur et date. Les migrations 036 et 037 sont appliquées à Supabase de test. Le build et 35 tests d'intégration locaux réussissent, dont questionnaire, décision, concurrence et don. Les seuils paramétrables, circuits multi-étapes, listes sanctions/PEP, justificatifs, export et recette navigateur restent à développer. L'API hébergée et les comptes réels restent à mettre en service.
