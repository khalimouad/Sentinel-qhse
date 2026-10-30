# Préparation du pilote Sentinel

Le projet Supabase de test est distinct des projets existants. Le fichier `render.yaml` décrit une API de test en région Francfort. Il ne crée pas de service automatiquement. Le plan gratuit et ses limites doivent être vérifiés sur Render au moment de la création ; il ne constitue pas un engagement de disponibilité.

## Préconditions avant activation

1. Appliquer les migrations sur la base de test avec un compte propriétaire distinct. Vérifier leur empreinte, les politiques et les droits sur une base vierge. Ne jamais transmettre la connexion propriétaire au service API.
2. Créer le rôle de connexion `sentinelle_app` avec un secret généré et ses seuls droits, sans SUPERUSER, BYPASSRLS ou appartenance au propriétaire des schémas. Configurer la connexion TLS vérifiée au serveur PostgreSQL. Le pooler utilisé doit conserver les propriétés transactionnelles nécessaires aux paramètres locaux et aux verrous.
3. Configurer Supabase Auth avec inscription publique désactivée, clés de signature asymétriques, MFA TOTP, URLs de redirection limitées et service de messagerie adapté aux invitations. Le JWT attendu a comme émetteur `https://<projet>.supabase.co/auth/v1`, audience `authenticated`, niveau `aal2` et une signature ES256 ou RS256 vérifiable par le JWKS du projet.
4. Créer le service Render depuis le dépôt, puis fournir `DATABASE_URL`, `OIDC_ISSUER` et `OIDC_JWKS_URI` dans ses secrets. Vérifier `/api/v1/health` et les contrôles de démarrage avant connexion web.
5. Dans l'environnement Vercel de test uniquement, configurer `AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_WEB_URL`, `INTERNAL_API_URL` et une clé `SESSION_SECRET` distincte. La clé publishable peut être exposée au navigateur ; la clé service Supabase et les accès administrateur SQL ne doivent jamais l'être. Redéployer pour prendre en compte ces variables.
6. Créer le premier opérateur chez le fournisseur d'identité, puis l'amorcer avec `npm run platform:bootstrap` depuis un environnement d'exploitation autorisé. Cette opération ne donne aucun accès métier par défaut.

Le parcours actuel couvre mot de passe, enrôlement ou vérification TOTP et échange d'un jeton `aal2` contre un cookie chiffré. Il n'est pas prêt pour une activation publique : invitations, première définition du mot de passe, révocation des sessions du fournisseur, rate limiting et vérification complète avec Supabase restent à réaliser. La session courante expire au plus tard après une heure et ne se renouvelle pas automatiquement. `AUTH_REQUIRE_MFA=true` doit rester activé sur le service de test.

Le projet Supabase créé ne prouve pas que ses quotas, sauvegardes, restauration, chiffrement, résidence complète ou disponibilité conviennent à un usage commercial. Ne pas utiliser des données de clients avant la recette des contrôles et l'établissement des services nécessaires.

La récupération de mot de passe utilise `/auth/recovery` et `/auth/reset`, avec vérification TOTP lorsqu’un facteur est déjà enregistré. Configurer explicitement l’URL `/auth/reset` dans les redirections Supabase et vérifier la messagerie, les liens expirés et le MFA avant activation. Le parcours de récupération n’a pas encore été validé avec le fournisseur.

Les migrations 017–018 et l'administration permettent d'enregistrer et consulter des demandes d'invitation avec rôle, sites, motif et clé d'idempotence. Elles ne créent pas de compte et n'envoient aucun e-mail ; l'état « en attente » indique uniquement une demande enregistrée. La livraison Supabase, la reprise après erreur, l'annulation et le rattachement de l'identité ne sont pas encore connectés. La fonction est indisponible tant que l'API et les migrations hébergées ne sont pas installées.

La migration 020 prépare un état de livraison réservé et un identifiant de tentative. Aucune autorisation runtime n'est accordée à cette fonction : elle ne déclenche aucun envoi. La gestion des résultats, la réconciliation et le raccordement au fournisseur restent nécessaires avant activation.

La migration 021 ajoute l'enregistrement d'un résultat confirmé ou incertain pour une tentative précise. Cette fonction reste réservée au propriétaire de migration : aucun droit runtime n'est accordé tant que le fournisseur, la preuve de résultat et l'association des droits ne sont pas intégrés. Un résultat incertain ne doit pas être réexpédié automatiquement.
