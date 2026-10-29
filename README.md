# Sentinelle — QHSE, risques et conformité

SaaS sur mesure destiné à l’Afrique et à l’Europe. Cette étape remplace le prototype Vite avec actions locales par une fondation Next.js + NestJS + PostgreSQL, avec contrats TypeScript, identité OIDC et plan d’actions persistant.

**État : fondation SaaS, gestion documentaire, incidents/non-conformités, pièces jointes privées et premier parcours d’audit ajoutés, compilation et intégration PostgreSQL/SSO/stockage encore à vérifier.** Vingt-six tests locaux passent : quatre de configuration, six de workflow documentaire, six de traitement des signalements et dix de validation/intégrité des fichiers. Les tests PostgreSQL, HTTP, stockage et le build restent à exécuter avec leurs services; aucun résultat de recette complète ou de sécurité en production n’est revendiqué.

La [revue du plan](docs/PLAN.md) décrit les écarts constatés, le travail de cette étape et les modules restants. L’[architecture](docs/ARCHITECTURE.md) décrit les frontières d’accès, l’authentification et le contrat API.

Le dépôt de référence est désormais [khalimouad/Sentinel-qhse](https://github.com/khalimouad/Sentinel-qhse). Le workflow [Verify SaaS foundation](https://github.com/khalimouad/Sentinel-qhse/actions) installe les dépendances, vérifie les types, compile l’application et prépare PostgreSQL 17 pour les tests d’isolation et HTTP. Le premier lancement a échoué avant l’affectation d’un runner et avant toute étape : il ne constitue donc pas un résultat de compilation ou de tests. Le motif de disponibilité du runner reste à vérifier dans les annotations GitHub Actions.

## Démarrage local

Prérequis : Node.js 22.14 ou supérieur, npm, Docker Compose et accès au registre npm / à l’image PostgreSQL.

```sh
cp .env.example .env
npm install
docker compose up -d --wait postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Web : `http://127.0.0.1:3000`. API : `http://127.0.0.1:4000/api/v1`. Documentation : `http://127.0.0.1:4000/api/docs`.

La configuration d’exemple active une identité locale fixe et des données de démonstration pour deux organisations; Jean Dupont ne peut accéder qu’à Atlas Industries. La seconde organisation et le lecteur limité à un site servent à la recette d’isolation. Les adresses et mots de passe de `.env.example` sont exclusivement locaux. Le rôle d’administration est réservé aux migrations et au provisionnement; l’API utilise le rôle restreint `sentinelle_app`.

Les anciennes actions dans le stockage du navigateur ne sont pas reprises automatiquement. Leurs valeurs restent dans ce navigateur; la nouvelle application charge son plan depuis l’API.

## Stockage local facultatif

Le stockage reste désactivé tant que les variables S3 ne sont pas renseignées. Pour le tester, décommenter le bloc de stockage local dans `.env.example` après l’avoir copié dans `.env`, puis :

```sh
docker compose --profile storage up -d minio
npm run storage:init
npm run db:migrate
npm run dev
```

Le profil MinIO est accessible uniquement sur loopback (API 9000, console 9001). L’initialisation est limitée aux endpoints locaux en mode développement : elle crée un bucket privé et une expiration des objets temporaires `staging/` après un jour. Les origines navigateur locales sont configurées dans Compose. Les paramètres et identifiants d’exemple ne sont pas destinés à la production.

Les pièces jointes acceptent PDF, DOCX, XLSX, TXT, CSV et photos JPEG/PNG/WebP/HEIC/HEIF, jusqu’à 10 Mo par fichier et 20 fichiers actifs par version documentaire ou signalement. Le client envoie dans une zone temporaire avec une politique signée limitée à la clé, au type et à la taille exacte. L’API copie dans une clé finale distincte puis vérifie les octets, la signature de type et SHA-256 avant disponibilité. Un ancien formulaire d’envoi ne peut pas remplacer la copie finale.

Les fichiers d’une version documentaire sont modifiables seulement par son auteur au stade brouillon; leur manifeste est figé à la soumission. Un déclarant peut joindre des fichiers à son propre signalement au stade déclaré; les responsables habilités peuvent le faire jusqu’à la demande de vérification d’efficacité. Les envois en attente bloquent ces étapes et peuvent être terminés ou annulés depuis l’interface. Le téléchargement passe par un contrôle d’accès puis un lien valable 60 secondes, avec téléchargement forcé.

Retirer un fichier masque son association; les copies finales vérifiées sont conservées pour l’audit. La politique de rétention/purge et la réconciliation des copies finales éventuellement orphelines restent à définir avant exploitation. Les objets temporaires sont nettoyés au mieux et expirent via le stockage. La vérification de type est un contrôle de signature/en-tête et d’encodage, pas une analyse antivirus ni une validation complète de formats Office/PDF. Le scan antimalware et les garanties de conservation WORM ne sont pas implémentés.

## Vérifications

```sh
npm test
npm run typecheck
npm run build
npm run test:integration
# Après initialisation du stockage local :
npm run test:storage
```

Les tests d’intégration nécessitent une **base de test jetable**, migrée et initialisée, ainsi que le build de l’API. Ils utilisent les fixtures connues : isolation tenant/site, droits des lecteurs et déclarants, historique atomique et non modifiable par l’application, absence de fuite entre connexions du pool. La suite HTTP démarre une API de test et un serveur de clés local pour vérifier les JWT, les adhésions, les contrôles de sites, les champs inconnus et les conflits de version. Elle parcourt également déclaration, analyse, action corrective, clôture indépendante et réouverture automatique. Les écritures SQL sont annulées; les tests HTTP créent des signalements et actions de test qui restent dans cette base jetable. Ne pas les exécuter sur une base d’exploitation.

Après une première installation réussie, vérifier les versions résolues puis committer le `package-lock.json`; il n’a pas pu être généré ici. Le dépôt utilise des plages de versions à cette étape.

Les tests de stockage utilisent une API à jetons de test et un MinIO local réel. Ils couvrent envoi/finalisation/téléchargement, confidentialité des brouillons et tenants, rejeu d’un formulaire d’envoi, blocage des tailles ou types incorrects, annulation et publication d’une version avec manifeste. Ils créent des fichiers et données dans les services de test jetables. La CI inclut maintenant leur démarrage et leur initialisation; son exécution reste à vérifier.

## Connexion SSO

Provisionner les utilisateurs OIDC et leurs adhésions avec le compte d’administration, puis désactiver `DEV_AUTH_ENABLED`. Configurer les variables OIDC de `.env.example` séparément pour l’API et le serveur web. Le fournisseur doit accepter `PUBLIC_WEB_URL/auth/callback` et délivrer des JWT pour `OIDC_AUDIENCE`. Selon le fournisseur, configurer `OIDC_SCOPE`, `OIDC_RESOURCE` ou `OIDC_AUTHORIZATION_AUDIENCE` pour demander ce jeton d’API.

Le serveur web exige une clé `SESSION_SECRET` aléatoire de 32 octets encodée en base64; conserver cette clé et le secret du client OIDC dans le gestionnaire de secrets du déploiement. La clé ne doit pas être exposée avec un préfixe `NEXT_PUBLIC_`. Les secrets, cookies et jetons ne sont pas journalisés par les parcours ajoutés. Une vraie configuration fournisseur est nécessaire pour vérifier le parcours de connexion complet.

## Périmètre livré et restant

Le plan d’actions est relié au serveur : sélection d’organisation autorisée, sites, responsables, priorité, échéance, création, clôture/réouverture, recherche et consultation de l’historique. L’export JSON contient les actions chargées (100 au maximum). Les tableaux de risques, graphiques de conformité et textes de veille restent des illustrations identifiées comme telles.

Le module Documents permet de rédiger des documents texte, de soumettre une version figée à un vérificateur puis un approbateur nommés, de publier et archiver les versions, de confirmer une lecture et de consulter les décisions et empreintes SHA-256. Les trois personnes doivent être distinctes et habilitées au site. Les brouillons ne sont visibles que par leurs participants; les documents publiés sont accessibles aux membres autorisés du site. Exécuter toutes les migrations et relancer les fixtures pour disposer du troisième responsable, Clara Martin.

Le module **Incidents & NC** traite incidents, presque-accidents, non-conformités et réclamations : déclaration par le personnel autorisé au site, correction immédiate, responsables nommés, analyse des « 5 pourquoi », cause racine, coût de non-qualité avec devise, actions correctives du plan unique et vérification indépendante d’efficacité. Toutes les actions liées doivent être closes avant la vérification; rouvrir une action annule automatiquement la clôture ou la vérification en cours du signalement. Un lecteur suit uniquement ses propres signalements et leurs actions; les managers traitent les signalements de leurs sites. Ces déclarations ne sont pas le canal confidentiel/anonyme d’anticorruption.

Les pièces jointes sont maintenant reliées aux documents et signalements, y compris les photos via le sélecteur mobile. La recette avec stockage, le scan antimalware, la rétention/purge, les signatures par prestataire, diffusion nominative/relances, diagramme Ishikawa, audits, cartographie des risques, registre réglementaire réel, alertes anticorruption, sources de veille, IA, notifications, export intégral et mobile hors connexion restent à compléter dans l’ordre du plan. L’interface est française; l’internationalisation anglais/français et la recette responsive restent à compléter. Aucun hébergement régional ni certification n’est fourni par cette étape.


## Audits opérationnels — premier parcours

Le menu **Audits** permet aux managers/admins de planifier une mission par site, référentiel/édition, périmètre, dates et deux responsables distincts. Le responsable d’audit prépare jusqu’à 30 questions avec clauses, puis démarre la réalisation. Les questions sont alors figées; chaque résultat comporte une preuve ou justification.

Un écart enregistré peut créer une non-conformité dans la même transaction que son lien au constat. Le bouton « Ouvrir le suivi » ouvre son analyse, ses actions et sa vérification d’efficacité dans **Incidents & NC**. Les conflits de révision sont refusés. La finalisation exige tous les résultats, les preuves et les liens des écarts; elle fige un rapport JSON exportable. Les non-conformités restent suivies séparément, même après finalisation du rapport.

Appliquer la migration `005_audits.sql` avec `npm run db:migrate`. Les lecteurs n’ont pas accès à cet espace opérationnel dans cet incrément. Le site est fixé à la création; les autres éléments du plan peuvent être révisés avec motif avant démarrage. Un plan peut aussi être annulé avec motif avant son démarrage. Programme annuel, équipe et qualification des auditeurs, modèles de checklist, pièces jointes propres à l’audit, génération PDF automatique et diffusion restent à compléter. Aucun contenu normatif sous licence n’est préchargé. Le nouveau parcours nécessite encore compilation et recette PostgreSQL/navigateur.


### Révision du plan et rapport imprimable

Appliquer également `006_audit_replanning.sql`. **Modifier la planification** permet aux managers/admins du site de changer dates, titre, référentiel, périmètre et responsables tant que l’audit est planifié. Le motif est obligatoire et l’historique affiche les valeurs avant/après. Le site et la checklist sont conservés; vérifier les questions si le périmètre change. Une révision obsolète est refusée; dès le démarrage, le plan est figé. L’habilitation des participants est revérifiée au démarrage.

**Consulter / imprimer le rapport** présente uniquement l’enregistrement finalisé : périmètre, responsables, dates, questions, preuves, conclusion et liens des non-conformités. Le dialogue d’impression du navigateur permet de l’imprimer ou de l’enregistrer en PDF. Les nouvelles finalisations figent aussi les noms de l’organisation, du site et des personnes. Les rapports historiques sans noms conservent leurs identifiants sans être réécrits à partir de l’annuaire actuel. La génération de PDF côté serveur et leur envoi automatique ne sont pas implémentés. Ces parcours restent à compiler et à recetter avec PostgreSQL et un navigateur.


### Bibliothèque de modèles de checklist

La migration `007_audit_templates.sql` ajoute des modèles versionnés par site, accessibles aux managers/admins habilités. Depuis **Audits → Modèles de checklist**, créer un code, un titre, un référentiel/édition et 1 à 30 questions avec leurs clauses. La publication exige une description de version. Chaque version est conservée et ne peut pas être réécrite; **Nouvelle version** copie les questions pour préparer la suivante. Une publication concurrente est refusée si la version attendue n’est plus la dernière.

Dans un audit planifié, le responsable d’audit peut copier un modèle du même site et du même référentiel/édition exacts. Une checklist existante nécessite une confirmation de remplacement; les questions copiées reçoivent de nouveaux identifiants et aucun résultat ou preuve. La copie et sa provenance sont enregistrées dans la même transaction. La checklist peut être adaptée avant démarrage; la publication d’une autre version du modèle ne change aucun audit existant. Le rapport finalisé conserve les références des modèles copiés et leurs empreintes SHA-256 de checklist. La liste présente les dernières versions et permet leur pagination; l’historique affiche les 100 versions les plus récentes d’un code.

Cette bibliothèque ne comporte pas encore de workflow de vérification/approbation des modèles, de retrait, de partage entre sites ni de contenu ISO sous licence. L’application d’un modèle n’atteste pas la qualification d’un auditeur. Compilation, migration et recette navigateur/PostgreSQL de cet incrément restent à effectuer.


### Planning annuel opérationnel

L’écran Audits affiche l’année courante, les totaux par statut, les retards et douze mois sélectionnables. Choisir un mois filtre la liste; **Tous les mois** rétablit l’année complète et **Toute période** supprime le filtre annuel. La recherche, le statut et le site s’appliquent aux totaux annuels comme à la liste. Une mission est incluse si sa période chevauche l’année/le mois sélectionné : elle peut figurer dans plusieurs mois mais ne compte qu’une fois au total annuel.

Les compteurs proviennent d’une agrégation serveur sur tous les audits autorisés, sans limite liée à la page de liste. La liste utilise désormais des pages de 25 missions. Les retards sont calculés à la date UTC du serveur : début dépassé pour les missions planifiées, fin dépassée pour celles en cours. Les audits annulés/finalisés ne sont pas marqués en retard; les non-conformités d’un rapport finalisé peuvent toutefois rester ouvertes. **Actualiser le planning** recharge les informations; les mutations d’audit déclenchent aussi leur actualisation.

Aucune migration supplémentaire n’est nécessaire pour cette vue : les migrations 001 à 007 restent requises. Il s’agit d’un planning opérationnel; les objectifs/budgets annuels, la qualification des auditeurs, l’approbation formelle et la révision d’un programme annuel restent à ajouter. Compilation et recette PostgreSQL/navigateur demeurent ouvertes.


### Qualification des responsables d’audit

Appliquer `008_auditor_qualifications.sql` avant de démarrer l’API mise à jour. Le menu **Audits → Qualification des auditeurs** permet aux responsables habilités du site de saisir une évaluation pour un autre responsable : référentiel/édition exacts, période de validité, référence de justificatif et conclusion. L’identité de l’évaluateur et la date sont enregistrées par le serveur. L’auto-attribution est refusée. Une évaluation ne se modifie pas : la révoquer avec motif, puis enregistrer une nouvelle évaluation si nécessaire. Le registre est paginé et filtre site, personne et référentiel.

**Nouveau contrôle au démarrage** : une qualification non révoquée doit couvrir toute la période planifiée et être valide aujourd’hui (date UTC serveur), pour le responsable, le site et le référentiel exacts. L’écran montre le résultat du contrôle et désactive le démarrage si aucune qualification ne convient. L’API et le déclencheur PostgreSQL contrôlent aussi cette règle. Les écritures de qualification/révocation et le démarrage sont sérialisés dans le même périmètre. La preuve choisie, l’évaluation et les noms sont figés au démarrage puis repris dans le rapport finalisé.

Les fixtures ne créent aucune qualification automatiquement : utiliser deux comptes habilités distincts pour l’évaluation. Les audits déjà en cours avant cette migration restent poursuivables sans preuve ajoutée rétroactivement. Une expiration ou révocation ultérieure bloque les prochains démarrages et ne réécrit pas les preuves des audits déjà démarrés; elle ne les suspend pas automatiquement. Le registre est une évaluation interne, sans vérification automatique de certificat, fichier justificatif joint ou reconnaissance d’accréditation. Équipe d’auditeurs, suspension/remplacement en cours de mission et rappels d’expiration restent à ajouter. Compilation, migration et recette PostgreSQL/navigateur restent à effectuer.


### Commentaires de suivi des actions

Appliquer `009_action_comments.sql`. Depuis le menu/historique d’une action du plan unique, ouvrir **Commentaires de suivi**; dans **Incidents & NC**, le bouton **Commentaires** se trouve sur chaque action liée. Les responsables habilités peuvent ajouter un texte de 4 000 caractères maximum; les lecteurs peuvent consulter les commentaires des actions qui leur sont visibles. Les listes sont paginées par 20 messages, du plus récent au plus ancien.

Auteur, date et périmètre proviennent du serveur. Les commentaires sont conservés sans édition/suppression par l’application; une correction se fait par un nouveau message. La confidentialité suit l’action : les commentaires d’actions liées à un signalement privé ne deviennent pas visibles depuis le plan transversal à une personne qui ne voit pas ce signalement. Une clé d’envoi conservée pour la reprise du même brouillon évite les doublons lors d’une relance de requête.

Un commentaire peut être ajouté à une action clôturée sans modifier son statut, sa version ou la preuve d’efficacité du signalement. Mentions, notifications, pièces jointes et commentaires sur les autres objets ne sont pas fournis dans cet incrément. La politique de rétention/export des commentaires reste à intégrer au parcours global. L’installation des dépendances reste bloquée par un refus réseau de l’environnement; compilation, migration et recette PostgreSQL/navigateur demeurent à effectuer.


### Notifications internes

Appliquer `010_in_app_notifications.sql`. La cloche affiche maintenant les notifications réelles de l’utilisateur connecté dans l’organisation sélectionnée. Deux événements sont couverts pour les nouvelles écritures après migration : attribution d’une action à une autre personne et nouveau commentaire sur l’action adressé à son responsable. Une action/commentaire de son propre responsable ne lui génère pas de notification. Les anciennes données ne sont pas notifiées rétroactivement.

La création de notification fait partie de la transaction métier. Une clé unique par destinataire/événement/source évite les doublons; la reprise idempotente d’un commentaire ne crée pas une seconde notification. Chaque destinataire peut consulter ses notifications accessibles, filtrer les non-lues et les marquer individuellement comme lues. **Consulter le suivi** marque la notification puis ouvre les commentaires de l’action, ainsi que le signalement parent si elle est corrective. Le compteur est actualisé à l’ouverture, au retour de la fenêtre/onglet et chaque minute visible; il ne s’agit pas d’un flux temps réel.

Les notifications héritent de la visibilité de l’action et du signalement : un changement de droits peut masquer une notification auparavant visible, y compris dans le compteur. Leur reçu de lecture est horodaté côté serveur, idempotent et non réécrivable. L’application n’a aucun droit d’insertion manuelle/suppression des notifications. E-mail/SMS/push, relances d’échéance, préférences, autres événements métier et file de livraison externe restent à développer. Compilation, migration et recette PostgreSQL/navigateur restent ouvertes.


### Registre des risques opérationnels

Appliquer `011_risks.sql` avant de démarrer l’API mise à jour. Le menu **Risques** contient maintenant un registre par site, réservé aux managers/admins habilités : titre, description, catégorie, responsable, mesures de maîtrise, cotations initiale/résiduelle et prochaine revue. Probabilité et gravité sont chacune comprises entre 1 et 5; PostgreSQL calcule leurs produits. Les niveaux d’affichage initiaux sont 1–4 faible, 5–9 modéré, 10–16 élevé, 17–25 critique. Ils ne décident pas automatiquement de l’acceptation.

La matrice résiduelle est calculée sur tous les risques autorisés correspondant au site, à la recherche, au statut et à la catégorie. Une case filtre la liste, paginée par 25. Les revues en retard sont calculées à la date UTC serveur, hors risques archivés. Les réévaluations exigent un motif et la révision attendue; les décisions et cotations sont historisées sans droit de réécriture par le rôle applicatif.

Les actions de traitement utilisent le plan unique, les commentaires et les notifications existants. Une action ne peut être liée simultanément à un risque et à un signalement. L’acceptation nécessite une personne distincte du responsable, une justification, une date de revue non dépassée et la fin des actions liées. Un risque sans action peut être accepté si ses mesures sont documentées et ces autres conditions satisfaites. L’archivage exige aussi la fin des actions et un motif. Un risque accepté/archivé doit être rouvert avant réévaluation; une action rouverte le remet automatiquement en traitement et invalide son acceptation courante, conservée dans l’historique.

Les actions de risque, leur historique, leurs commentaires et leurs notifications suivent la visibilité du risque : un lecteur ne gagne pas accès à ces données par le plan transversal. La rubrique de cartographie et le KPI de risques du tableau de bord général restent des exemples identifiés; le registre et sa matrice utilisent vos données. Matrices configurables, modèles sectoriels/DUERP/AMDEC, pièces jointes de risque, rappels de revue et export global restent à développer. Ce registre n’est pas un espace d’enquête anticorruption confidentielle. Compilation, migration et recette PostgreSQL/navigateur demeurent ouvertes.
