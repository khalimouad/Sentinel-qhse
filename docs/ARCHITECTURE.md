# Fondations techniques

## Organisation du code

`apps/web` contient Next.js, le client QHSE et la couche serveur d’authentification/proxy. Le tableau de bord existant reste en JSX; les nouveaux services, routes et contrats sont en TypeScript. `apps/api` est un monolithe NestJS dont le premier domaine est le plan d’actions. `packages/contracts` porte les interfaces d’échange. Les requêtes PostgreSQL sont paramétrées; les migrations versionnées sont dans `database/migrations`.

## Identité et frontières de confiance

Le navigateur lance `/auth/login`; le serveur web effectue la découverte OIDC et utilise code d’autorisation, PKCE, state et nonce. Le fournisseur doit émettre un **jeton d’accès JWT** pour l’audience de l’API (RS256 ou ES256). Les jetons opaques ne sont pas pris en charge à cette étape. La politique MFA/SSO s’applique chez le fournisseur choisi.

Le jeton d’accès est conservé dans un cookie chiffré AES-GCM, HttpOnly et Secure en production, jamais dans `localStorage`. Seul le serveur Next le transmet à l’API. La session expire au plus tard avec le jeton et ne dispose pas encore de renouvellement automatique; une reconnexion est alors nécessaire. Les jetons dont le cookie chiffré dépasserait 3 800 caractères sont refusés : prévoir un magasin de sessions côté serveur pour les fournisseurs produisant de très gros jetons. La déconnexion ferme la session de l’application, pas la session globale du fournisseur.

L’API vérifie signature, issuer, audience, expiration et présence des claims requis, puis résout `(issuer, subject)` dans son annuaire provisionné. Les rôles et sites proviennent de la base, pas des en-têtes de l’appelant ou de claims de rôle non maîtrisés. L’en-tête `X-Tenant-Id` sélectionne une adhésion existante. L’API n’offre pas de création publique de comptes, d’organisations ou de droits à cette étape.

Le mode local utilise une identité fixe, `urn:sentinelle:development / jean-dupont`. Il est activable uniquement avec `NODE_ENV=development`, `DEV_AUTH_ENABLED=true` et une écoute de l’API sur loopback. Il n’accepte aucun en-tête permettant de choisir librement un utilisateur.

## Isolation PostgreSQL

L’API ouvre une transaction, résout l’identité, puis utilise `set_config(..., true)` pour définir acteur et tenant uniquement pour cette transaction. Elle vérifie l’adhésion et les autorisations métier. Les politiques RLS vérifient aussi l’adhésion et les sites sur tenants/sites/actions/historique.

Les tables `identity.*` ne sont pas lisibles directement par le rôle de l’API. Des fonctions `SECURITY DEFINER` étroites, avec `search_path` vide et droits d’exécution explicitement attribués, consultent les adhésions et résolvent l’identité. Ces fonctions sont réservées au serveur de confiance; les identifiants PostgreSQL ne doivent jamais être distribués aux clients.

L’API vérifie au démarrage qu’elle utilise `sentinelle_app` sans SUPERUSER/BYPASSRLS. Ce rôle ne peut ni provisionner les droits, ni supprimer des actions, ni écrire directement l’historique. Les contraintes composites empêchent d’assigner une action à un site ou un membre d’une autre organisation. Le rôle lecteur ne peut pas modifier les plans d’actions; il peut toutefois déclarer un événement à son nom et confirmer la lecture d’une publication. Les rôles admin et manager traitent les actions et signalements de leurs sites autorisés.

Un déclencheur insère un événement de création/mise à jour avec l’acteur, le tenant, le site, la date et les valeurs avant/après. La transaction métier et l’historique réussissent ou échouent ensemble. Le rôle applicatif ne peut pas modifier/supprimer ces événements; cela ne protège pas contre un administrateur de base capable de modifier le schéma. Une conservation probante ou WORM nécessitera un stockage et un contrôle d’exploitation dédiés.

## Contrat API initial

Préfixe `/api/v1`; schéma OpenAPI disponible dans `/api/docs` et `/api/docs-json`.

| Opération | Comportement |
| --- | --- |
| `GET /health` | Disponibilité de la base, sans données métier |
| `GET /me` | Identité et organisations accessibles |
| `GET /context` | Organisation sélectionnée, sites autorisés, membres et droit d’écriture |
| `GET /actions` | Liste limitée à 100 par page, filtres `siteId`, `status`, `search`, `limit`, `offset` |
| `POST /actions` | Titre, site, responsable, priorité, origine et date éventuelle |
| `PATCH /actions/:id` | Statut et version attendue; HTTP 409 si version périmée |
| `GET /actions/:id/history` | 100 événements les plus récents, avec mêmes contrôles d’accès |

Sauf `/health` et `/me`, les opérations métier exigent le tenant. Les identifiants inconnus ou hors périmètre ne doivent pas révéler des objets accessibles uniquement à d’autres tenants/sites. Les mutations refusent les champs inconnus. Le client web charge actuellement les 100 actions les plus récentes; l’export JSON porte sur ce jeu chargé, pas sur toutes les données d’un tenant.

## Cycle documentaire initial

Les routes `/documents`, `/documents/:id`, `/documents/:id/versions`, `/documents/:id/versions/:versionId`, `/documents/:id/versions/:versionId/decisions`, `/documents/:id/versions/:versionId/acknowledgements` et `/documents/:id/history` exposent le cycle documentaire. Le schéma OpenAPI précise leurs verbes et corps. Le contexte ajoute les responsables habilités par site pour les sélecteurs de vérification/approbation.

Un nouveau document reçoit un code tenant unique et une version 1 en brouillon. L’auteur seul peut modifier et soumettre ce brouillon. Le vérificateur désigné peut ensuite vérifier ou retourner avec motif; l’approbateur désigné peut publier ou retourner avec motif après vérification. Tous doivent disposer du rôle admin/manager et du site requis. La décision exige la révision attendue pour éviter les écrasements concurrents.

La publication archive la publication précédente dans la même transaction. Une version soumise ne peut plus changer de contenu; une reprise crée une nouvelle version. Des déclencheurs empêchent aussi les sauts d’étapes et modifications de contenu hors de ce parcours en SQL. Un verrou transactionnel par document sérialise versions, décisions et accusés de lecture; un lecteur peut confirmer la version encore publiée sans acquérir de droit d’écriture documentaire.

Les politiques RLS cachent les brouillons/non-publications aux non-participants, y compris dans les listes et historiques. Les versions publiées et archivées sont visibles aux personnes autorisées du site. Chaque version comporte une empreinte SHA-256 calculée en base. Les événements excluent le texte intégral, conservé dans la version figée. Les accusés de lecture nominatifs sont datés en base et ne peuvent être modifiés/supprimés par l’application. L’approbation horodatée via identité OIDC ne constitue pas une intégration de signature qualifiée; les fichiers binaires, la diffusion nominative et les relances seront ajoutés séparément.

## Incidents, non-conformités et efficacité

L’API `/reports` fournit liste/déclaration et détail. Les sous-routes `/:id/analysis`, `/:id/decisions`, `/:id/actions` et `/:id/history` traitent l’analyse, le cycle métier, les actions du plan commun et l’historique. Les données sont cloisonnées par tenant et site; un lecteur ne voit que ses propres déclarations, tandis qu’un manager voit les déclarations de ses sites.

Le déclarant est dérivé de l’identité vérifiée. Les faits initiaux ne peuvent pas être modifiés par le rôle SQL applicatif. L’analyse comporte correction immédiate, cause racine, jusqu’à cinq pourquoi, responsable, vérificateur distinct et coût stocké en `numeric(14,2)` : les montants sont échangés en chaînes décimales, sans conversion en flottant. Les devises initiales sont XOF, XAF, MAD, EUR, USD et GBP; les francs CFA n’acceptent pas de fraction non nulle.

Le cycle est `reported → in_analysis → action_plan → effectiveness_review → closed`. La vérification requiert au moins une action liée et toutes les actions clôturées; le vérificateur nommé, distinct du responsable, peut conclure avec preuve narrative ou retourner au plan d’actions avec motif. Les mutations attendent une révision et prennent un verrou sur le signalement. Les actions référencent un signalement par une clé étrangère composite tenant/site. Leur création et leurs changements de statut mettent aussi à jour la révision et l’historique du signalement; une action rouverte fait revenir une vérification/clôture au plan d’actions et efface son résultat courant d’efficacité. Les décisions antérieures restent dans le journal immuable.

Les politiques de lecture des actions et de leur audit prennent en compte le signalement parent afin d’éviter les fuites par les vues transversales. Les photos/pièces jointes des signalements utilisent le stockage décrit ci-dessous; la collecte hors connexion reste à développer. Les données médicales, alertes anonymes et enquêtes d’anticorruption doivent suivre leurs propres politiques et parcours dédiés.

## Stockage et preuve documentaire

Les routes `GET /attachments`, `POST /attachments/uploads`, `POST /attachments/:id/confirm`, `POST /attachments/:id/remove` et `GET /attachments/:id/download` / `GET /attachments/:id/history` contrôlent les parents `document_version` et `report`. La liste hérite des politiques de lecture du parent. Le contrôle d’écriture exige auteur du brouillon ou responsable du site; un déclarant peut écrire uniquement sur sa propre déclaration encore au stade `reported`.

Les clés sont générées par le serveur : `staging/{tenant}/{id}` pour les envois et `tenants/{tenant}/objects/{id}/{attempt}` pour une copie finale. Une politique POST de cinq minutes fixe clé, type MIME et taille exacte. Après HEAD et copie conditionnelle sur ETag, le serveur relit les octets pour vérifier longueur, en-tête/encodage et SHA-256. Chaque tentative utilise une nouvelle clé finale; aucun formulaire public ne permet d’écrire dans ce préfixe. Une relecture/finalisation concurrente peut retourner le fichier déjà finalisé sans remplacer son identité.

Les transactions PostgreSQL ne restent pas ouvertes pendant le transfert de vérification. La finalisation reprend un verrou sur le parent, revalide les permissions/état, puis met à jour le fichier. Un échec ambigu de COMMIT ne provoque pas la destruction de la copie finale : une réconciliation ultérieure est nécessaire pour les objets non référencés. Les objets temporaires sont supprimés au mieux et couverts par une expiration de stockage; les copies finales vérifiées sont retenues après retrait de l’association jusqu’à une politique de purge explicite.

Les déclencheurs mettent à jour révision et historique du parent et calculent le manifeste des fichiers disponibles : SHA-256 de la représentation texte PostgreSQL JSONB d’une liste triée par identifiant contenant id, nom, taille, MIME et SHA-256. L’empreinte est stockée dans la version/report; les lignes de fichier et le manifeste ne peuvent plus changer dans les étapes figées. Les uploads pendants bloquent les transitions qui figent les preuves. Les fonctions de verrouillage `SECURITY DEFINER` vérifient explicitement l’identité et le périmètre; la politique de mise à jour des seules métadonnées de rapport s’applique au rôle propriétaire des déclencheurs, pas au rôle applicatif des lecteurs.

L’API n’expose jamais les identifiants du fournisseur. Les liens GET expirent en 60 secondes, imposent `application/octet-stream` et `Content-Disposition: attachment`; les permissions sont revérifiées à chaque émission du lien, pas à chaque requête ultérieure du lien déjà signé. Configurer le bucket privé, CORS limité à l’origine web et chiffrement/stockage régional chez le fournisseur. L’initialisation automatique est limitée à MinIO en développement sur loopback. Ni scan antivirus ni immutabilité WORM ne sont fournis par ce contrôle d’intégrité.

## Déploiement à préciser

La base conserve une région et les juridictions par tenant afin de préparer le routage et la veille; elle ne déploie aucune infrastructure régionale. Avant lancement Afrique/Europe : choisir les pays, la région primaire, les transferts autorisés, le contrat de traitement des données et les sous-traitants. Prévoir une stratégie de sauvegarde/restauration, les objectifs RPO/RTO, la supervision et une authentification fournisseur de test avant production.


## Audits opérationnels

Routes `/audits` (GET/POST), `/audits/:id` (GET), `/:id/checklist` (PATCH), `/:id/decisions`, `/:id/findings` (POST) et `/:id/history` (GET). Les mutations comportent la révision attendue. La ligne d’audit est verrouillée avant modification, création de constat ou décision; un appel obsolète reçoit 409. Une création de constat écrit le signalement de type non-conformité et son lien dans la même transaction. La contrainte unique par audit/point évite les doublons.

`app.audits`, `audit_findings` et `audit_session_events` appliquent FORCE RLS avec tenant/site et rôle manager/admin, y compris lors des exports. Le responsable d’audit et le responsable audité sont deux managers/admins habilités distincts. La checklist est un tableau JSON borné et validé par DTO et contrainte SQL. Son responsable désigné prépare les questions; après démarrage, seules les réponses/preuves peuvent évoluer, et un écart lié ne peut plus être reclassé. Les déclencheurs contrôlent les transitions et figent le rapport à finalisation. Le rôle applicatif n’a aucun droit d’écriture sur le snapshot, les dates de finalisation, les identités ou l’historique; les liens de constats sont immuables.

Le snapshot contient les identités, dates, périmètre, conclusion, checklist et références des non-conformités au moment de finalisation. Les statuts actuels des non-conformités sont chargés séparément et peuvent continuer à évoluer. Le module exporte le snapshot en JSON et le présente pour impression/enregistrement PDF via le navigateur; il ne fournit pas de signature qualifiée, programme annuel, qualification des auditeurs, documents normatifs sous licence, génération PDF côté serveur ou accès d’enquête anticorruption.


### Révision du plan d’audit et identité historique

`PATCH /audits/:id/plan` reçoit le plan complet hors site, `revision` et `reason`. Le DTO rejette les champs supplémentaires; la transaction vérifie rôle, site, révision, état planifié, dates et responsables distincts/habilités. Les droits UPDATE sont limités aux colonnes du plan et au motif. Le déclencheur SQL interdit de combiner replanification et changement de checklist/statut/conclusion, exige le motif et bloque les modifications après démarrage. Le journal inséré dans la même transaction utilise l’opération `REPLAN`; aucun droit de modification de l’historique n’est accordé au rôle applicatif.

Les nouveaux snapshots de fin d’audit portent `schemaVersion: 2`, `auditId` et les noms de l’organisation, du site et des participants à cet instant. Les noms proviennent des vues/fonctions déjà autorisées dans la transaction; le navigateur ne les fournit pas. Les snapshots antérieurs restent intacts. Le composant de rapport affiche le snapshot seul et échappe les textes via React. Il est ouvert dans un dialogue natif, avec fermeture clavier et styles A4 dédiés; le navigateur produit l’impression/PDF à la demande, sans service de rendu ou de diffusion automatique.


### Modèles de checklist et provenance des copies

`GET /audit-templates` liste la dernière version par code pour un site (`siteId` obligatoire, recherche et filtre exact `standard`, pagination). `POST /audit-templates` publie une version immuable avec `expectedVersion` (0 pour création), et `GET /audit-templates/:id/versions` présente les 100 versions récentes du code. Un verrou transactionnel utilise tenant UUID canonique, site UUID canonique et code normalisé, avant de vérifier la dernière version; le déclencheur vérifie aussi la succession des numéros et calcule l’empreinte SHA-256 du JSON de checklist. Les données tenant/site sont protégées par FORCE RLS, les versions n’ont aucun droit UPDATE/DELETE et un déclencheur protège leur immutabilité.

`POST /audits/:id/template` reçoit `revision`, `templateId` et `replace` (false par défaut). Le responsable d’audit doit être l’acteur courant et l’audit encore planifié. Le modèle doit appartenir au même tenant/site et référentiel/édition exacts. Le service copie les clauses/questions avec des identifiants neufs et les réponses vierges, puis écrit `app.audit_template_uses` dans la même transaction. Son déclencheur vérifie état, acteur, révision, site et égalité ordonnée des questions/réponses avec la version source en ignorant seulement les identifiants de points.

Les associations de provenance sont append-only, attribuées et exposées dans le détail d’audit. Un déclencheur BEFORE UPDATE, exécuté après `audit_session_guard` selon l’ordre alphabétique PostgreSQL, ajoute les sources au snapshot lors de la finalisation. Les historiques antérieurs restent intacts. Les noms/empreintes/codes du rapport proviennent de ces enregistrements figés; aucun chargement dynamique de la dernière version ne remplace le contenu historique. Les modèles sont publiés directement par des responsables habilités; un workflow séparé d’approbation et une qualification des auditeurs restent à ajouter.
