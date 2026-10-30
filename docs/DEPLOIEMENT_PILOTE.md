# Déploiement du pilote Sentinel

Le projet Supabase `sentinel-qhse-test` est dédié au pilote, en région Paris. `render.yaml` décrit une API de test en région Francfort ; il ne crée pas le service automatiquement. Le plan gratuit et ses limites doivent être vérifiés avant création et ne constituent pas un engagement de disponibilité. L'interface Vercel publique utilise encore la démo ; aucun client réel ne doit utiliser les données de test.

## Préconditions de mise en service

1. Appliquer toutes les migrations sur une base de test vierge avec un propriétaire distinct. Contrôler les droits et empreintes. La connexion propriétaire ne doit jamais être fournie à l'API.
2. Créer le rôle de connexion `sentinelle_app` sans privilèges propriétaire, SUPERUSER ou BYPASSRLS, avec connexion TLS vérifiée. Vérifier que le pooler conserve les transactions et paramètres locaux.
3. Configurer Supabase Auth : inscription publique désactivée, clés de signature asymétriques, MFA TOTP, URLs de redirection limitées et messagerie adaptée. L'API attend l'émetteur `https://<projet>.supabase.co/auth/v1`, l'audience `authenticated`, le niveau `aal2` et une signature ES256 ou RS256 vérifiée par le JWKS du projet.
4. Créer le service Render depuis le dépôt puis fournir ses secrets `DATABASE_URL`, `OIDC_ISSUER` et `OIDC_JWKS_URI`. Garder `AUTH_REQUIRE_MFA=true`. Vérifier `/api/v1/health` et les contrôles de démarrage.
5. Dans Vercel pour l'environnement de test, configurer `AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_WEB_URL`, `INTERNAL_API_URL` et une clé `SESSION_SECRET` distincte. Redéployer pour appliquer ces valeurs. Seule la clé publishable est destinée au navigateur.
6. Créer le premier opérateur chez le fournisseur d'identité puis l'amorcer avec `npm run platform:bootstrap` depuis l'environnement d'exploitation autorisé. Cette opération ne crée aucune appartenance métier.

La connexion par mot de passe, MFA TOTP, invitation et récupération reste à recetter avec le projet Supabase et une messagerie de test. Configurer `/auth/reset` comme URL de redirection autorisée ; vérifier liens expirés, première définition du mot de passe, authentification, MFA et déconnexion. La session courante dure au maximum une heure et ne se renouvelle pas automatiquement. Révocation des sessions fournisseur et limitation de débit restent à finaliser avant ouverture publique.

## Invitations et réconciliation

Les administrateurs plateforme enregistrent une demande avec rôle, sites et motif. L'envoi explicite réserve une tentative en base avant l'appel fournisseur ; un résultat incertain ne déclenche aucune nouvelle tentative automatique. Un résultat accepté est enregistré avant le rattachement transactionnel. Un échec de rattachement laisse l'identité confirmée disponible pour reprise, sans modifier une appartenance existante.

La réconciliation d'un résultat `uncertain` ou d'un `sending` de plus de deux minutes demande un UUID fournisseur et un motif. L'API vérifie directement auprès du projet Supabase que l'UUID, l'adresse et la confirmation de cette adresse correspondent. Elle enregistre `identity_verified` : cet état ne prouve pas la livraison de l'e-mail. Le projet fournisseur est figé lors de la réservation et doit correspondre lors de la reprise. Une demande annulée ou non envoyée ne peut pas être réconciliée. Aucun renvoi automatique n'est effectué.

Les routes d'envoi et de réconciliation sont désactivées par défaut. Pour les activer après recette dans un environnement autorisé, définir côté API uniquement : `INVITATION_DELIVERY_ENABLED=true`, `INVITATION_DATABASE_URL`, `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_KEY` et `INVITATION_REDIRECT_URL` (URL HTTPS exacte se terminant par `/auth/reset`). L'émetteur vérifié du compte administrateur doit être celui du projet configuré. Ne jamais exposer ces secrets dans le web ni les journaux.

La connexion dédiée doit utiliser exactement le rôle `sentinelle_invitation_worker`, créé NOLOGIN et sans accès direct aux tables ni privilèges propriétaire/BYPASSRLS. Les migrations accordent seulement l'exécution des fonctions nécessaires. L'exploitation doit configurer sa connexion et son secret avant activation. Le pool de cette identité est distinct du pool API ; si les deux secrets sont configurés dans le même processus API, leur séparation ne protège pas contre une compromission complète de ce processus.

Les commandes d'exploitation `npm run platform:deliver-invitation -- <entreprise> <demande> <administrateur>` et `npm run platform:reconcile-invitation -- <entreprise> <demande> <administrateur>` nécessitent la même connexion limitée. La seconde ne renvoie pas d'e-mail et reprend uniquement une identité déjà confirmée et enregistrée. Pour un résultat incertain, utiliser le parcours de vérification par fournisseur ; un conflit d'adhésion existante doit être résolu manuellement.

## Vérifications effectuées et limites

Les migrations 001–025 ont été appliquées sur une base PostgreSQL locale vierge. La compilation API et web, les tests de droits existants, le contrôle MFA et les parcours d'invitation avec fournisseur simulé ont réussi ; aucun e-mail réel n'a été envoyé. Le test d'intégration du rôle worker utilise exclusivement une base locale jetable `sentinelle_bulk_verify2` avec un rôle de test temporairement activé.

L'API hébergée, l'identité initiale, la configuration de messagerie et les migrations du projet Supabase ne sont pas encore en service. Le projet Supabase créé ne démontre pas à lui seul la conformité des sauvegardes, de la restauration, de la résidence des données ou de la disponibilité commerciale. Les données réelles attendront la recette et la configuration de ces services.

La migration 026 corrige la génération des notifications lorsque le propriétaire des tables est soumis à FORCE RLS : sa politique SELECT est limitée aux notifications créées par l'acteur courant sur ses sites d'écriture. Le rôle applicatif conserve une lecture limitée au destinataire. La recette PostgreSQL a été rejouée avec un propriétaire de schémas sans SUPERUSER ni BYPASSRLS ; les 28 tests d'intégration existants et le test ciblé de visibilité des notifications passent.
