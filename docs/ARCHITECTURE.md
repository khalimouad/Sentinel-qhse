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

Les politiques de lecture des actions et de leur audit prennent en compte le signalement parent afin d’éviter les fuites par les vues transversales. Les photos/pièces jointes et la collecte hors connexion dépendent du module de stockage à venir. Les données médicales, alertes anonymes et enquêtes d’anticorruption doivent suivre leurs propres politiques et parcours dédiés.

## Déploiement à préciser

La base conserve une région et les juridictions par tenant afin de préparer le routage et la veille; elle ne déploie aucune infrastructure régionale. Avant lancement Afrique/Europe : choisir les pays, la région primaire, les transferts autorisés, le contrat de traitement des données et les sous-traitants. Prévoir une stratégie de sauvegarde/restauration, les objectifs RPO/RTO, la supervision et une authentification fournisseur de test avant production.
