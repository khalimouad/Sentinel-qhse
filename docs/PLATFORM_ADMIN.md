# Administration de la plateforme

L’écran `/admin` est distinct de l’espace QHSE. Il permet de créer les entreprises et sites, rattacher une identité existante à une entreprise, attribuer un rôle et des sites et suspendre/réactiver un accès. Il n’y a pas d’inscription publique.

## Mise en service

1. Déployer l’API avec PostgreSQL et appliquer les migrations, dont `014_platform_admin.sql` et `015_platform_metadata.sql`, avec le propriétaire des migrations (`npm run db:migrate`). Le runtime reste `sentinelle_app`.
2. Configurer le fournisseur OIDC de l’API et du web (voir `.env.example`). Créer le premier compte opérateur chez ce fournisseur. Le fournisseur reste responsable des mots de passe, MFA et récupération de compte.
3. Dans une session d’exploitation disposant de `DATABASE_ADMIN_URL`, renseigner `PLATFORM_ADMIN_ISSUER`, `PLATFORM_ADMIN_SUBJECT` et `PLATFORM_ADMIN_NAME`. Utiliser les valeurs exactes `iss` et `sub` de cette identité. Exécuter `npm run platform:bootstrap`. Ne jamais transmettre `DATABASE_ADMIN_URL` au runtime web/API ni commettre ces variables.
4. Se connecter au web, puis ouvrir `/admin`. Un opérateur sans appartenance à une entreprise voit un lien vers l’administration dans le message d’absence d’organisation. Le script ne lui donne aucun accès aux dossiers QHSE.
5. Créer une entreprise, ses sites et rattacher les comptes existants du fournisseur. Le nom d’une identité déjà connue doit correspondre au nom enregistré; le rattachement ne renomme pas globalement un utilisateur partagé entre entreprises.

Le bootstrap est une opération réservée au propriétaire de la base. Aucun endpoint ne permet à un administrateur d’entreprise de s’attribuer le rôle plateforme. Il n’existe pas de compte ou de mot de passe privilégié par défaut. Le retrait d’un opérateur de `identity.platform_admins` est également réservé à l’exploitation.

## Accès et traçabilité

- L’API vérifie l’identité cryptographique puis le registre privé des opérateurs à chaque requête `/platform/*`. Le rôle `admin` d’une entreprise ne suffit pas.
- Les fonctions PostgreSQL de provisionnement vérifient elles-mêmes ce registre, ont un `search_path` vide et des signatures limitées. Le rôle runtime n’a pas de droits directs sur les tables d’identités, adhésions, habilitations plateforme ou journal d’administration.
- L’administrateur plateforme consulte les entreprises, sites et adhésions via ces fonctions; il ne reçoit aucun droit global sur les documents, risques, signalements ou autres dossiers métier.
- Chaque création ou modification des accès porte un motif et un événement attribué, daté et non modifiable, dans la même transaction que l’opération. Les valeurs avant/après des adhésions incluent les sites explicites. La fiche affiche les 50 derniers événements (le journal complet reste conservé).
- Les modifications d’accès utilisent une révision attendue et sont sérialisées par entreprise. Les sites d’une autre entreprise sont refusés. Les appartenances sont conservées pour préserver les références historiques.
- Une suspension désactive l’appartenance à une entreprise, pas le compte chez le fournisseur ni ses accès aux autres entreprises. Les fonctions d’appartenance, de rôle, d’accès aux sites, d’attribution et de sélection des responsables excluent les appartenances suspendues. L’effet s’applique aux nouvelles requêtes; une transaction déjà engagée ou une URL S3 temporaire déjà émise peut rester valable jusqu’à sa fin/expiration.
- « Tous les sites » inclut les futurs sites de cette entreprise; une sélection explicite vide ne donne accès à aucun site.

## Limites de ce lot

Le formulaire rattache les identités chez le fournisseur configuré : il ne crée pas les comptes chez ce fournisseur et n’envoie pas d’invitation. Les identifiants `sub` ne doivent pas être déduits des e-mails. Le rattachement via invitation et les connecteurs d’administration des fournisseurs restent à développer.

Le catalogue des entreprises est paginé; la fiche charge tous ses sites et comptes et 50 événements. La pagination détaillée des très grandes entreprises reste à ajouter. La facturation et le changement des droits plateforme ne sont pas exposés dans cet écran.

Les builds API et web du lot initial d’administration ont réussi sur Vercel. Les migrations nécessitent encore leur exécution réelle et la vérification de l’isolation, de la suspension et des parcours navigateur avec un fournisseur OIDC. Aucun test supplémentaire n’a été exécuté pour ce lot.

## Modification des entreprises et sites

La migration `015_platform_metadata.sql` ajoute des révisions distinctes aux entreprises et sites. L’opérateur peut modifier nom, région de référence et juridictions d’une entreprise, et nom/code pays d’un site. Les formulaires sont préremplis, demandent un motif et transmettent la révision lue. Un conflit impose une actualisation avant une nouvelle soumission.

Les routes `POST /platform/companies/:id/metadata` et `POST /platform/companies/:id/sites/:siteId/metadata` appellent une fonction PostgreSQL limitée qui vérifie le rôle plateforme, verrouille d’abord l’entreprise puis le site, contrôle la révision et journalise les valeurs avant/après dans la même transaction. Aucun droit direct UPDATE sur les entreprises/sites n’est accordé au runtime. Un site d’une autre entreprise est introuvable dans cette route.

Le changement ne touche ni les identifiants, ni les appartenances, ni les accès aux sites. Les snapshots historiques déjà enregistrés conservent leurs noms d’origine. La région de référence reste descriptive; la modifier ne déplace pas les données. Les juridictions enregistrées ne recalculent pas automatiquement les obligations réglementaires.
