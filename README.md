# Sentinelle — QHSE, risques et conformité

SaaS sur mesure destiné à l’Afrique et à l’Europe. Cette étape remplace le prototype Vite avec actions locales par une fondation Next.js + NestJS + PostgreSQL, avec contrats TypeScript, identité OIDC et plan d’actions persistant.

**État : fondation SaaS et premier module documentaire ajoutés, compilation et intégration PostgreSQL/SSO encore à vérifier.** Neuf tests locaux passent : trois de configuration et six de workflow documentaire. Les tests PostgreSQL, HTTP et le build nécessitent encore l’installation des dépendances et une base disponible; aucun résultat de recette complète ou de sécurité en production n’est revendiqué.

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

## Vérifications

```sh
npm test
npm run typecheck
npm run build
npm run test:integration
```

Les tests d’intégration nécessitent une base locale migrée et initialisée ainsi que le build de l’API. Ils utilisent les fixtures connues : isolation tenant/site, lecteur sans droit d’écriture, historique atomique et non modifiable par l’application, absence de fuite entre connexions du pool. La suite HTTP démarre une API de test et un serveur de clés local pour vérifier les JWT, les adhésions, les contrôles de sites, les champs inconnus et les conflits de version. Les écritures de test SQL sont annulées; les tests HTTP n’effectuent pas de mutation réussie sur les fixtures.

Après une première installation réussie, vérifier les versions résolues puis committer le `package-lock.json`; il n’a pas pu être généré ici. Le dépôt utilise des plages de versions à cette étape.

## Connexion SSO

Provisionner les utilisateurs OIDC et leurs adhésions avec le compte d’administration, puis désactiver `DEV_AUTH_ENABLED`. Configurer les variables OIDC de `.env.example` séparément pour l’API et le serveur web. Le fournisseur doit accepter `PUBLIC_WEB_URL/auth/callback` et délivrer des JWT pour `OIDC_AUDIENCE`. Selon le fournisseur, configurer `OIDC_SCOPE`, `OIDC_RESOURCE` ou `OIDC_AUTHORIZATION_AUDIENCE` pour demander ce jeton d’API.

Le serveur web exige une clé `SESSION_SECRET` aléatoire de 32 octets encodée en base64; conserver cette clé et le secret du client OIDC dans le gestionnaire de secrets du déploiement. La clé ne doit pas être exposée avec un préfixe `NEXT_PUBLIC_`. Les secrets, cookies et jetons ne sont pas journalisés par les parcours ajoutés. Une vraie configuration fournisseur est nécessaire pour vérifier le parcours de connexion complet.

## Périmètre livré et restant

Le plan d’actions est relié au serveur : sélection d’organisation autorisée, sites, responsables, priorité, échéance, création, clôture/réouverture, recherche et consultation de l’historique. L’export JSON contient les actions chargées (100 au maximum). Les tableaux de risques, graphiques de conformité et textes de veille restent des illustrations identifiées comme telles.

Le module Documents permet de rédiger des documents texte, de soumettre une version figée à un vérificateur puis un approbateur nommés, de publier et archiver les versions, de confirmer une lecture et de consulter les décisions et empreintes SHA-256. Les trois personnes doivent être distinctes et habilitées au site. Les brouillons ne sont visibles que par leurs participants; les documents publiés sont accessibles aux membres autorisés du site. Exécuter toutes les migrations et relancer les fixtures pour disposer du troisième responsable, Clara Martin.

Les fichiers binaires et pièces jointes S3, signatures par prestataire, diffusion nominative/relances, audits, incidents, cartographie des risques, registre réglementaire réel, alertes anticorruption, sources de veille, IA, notifications, export intégral et mobile hors connexion restent à compléter dans l’ordre du plan. L’interface est française; l’internationalisation anglais/français et la recette responsive restent à compléter. Aucun hébergement régional ni certification n’est fourni par cette étape.
