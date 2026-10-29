# Démonstration dans le navigateur

Ouvrir `/demo` pour explorer l’interface avec Alex Démo, administrateur fictif, une entreprise fictive et deux sites (Abidjan et Lyon). `/demo/admin` permet de consulter l’administration fictive. Aucun compte réel, token ou droit serveur n’est créé.

## Fonctionnement

Le client `api()` intercepte les appels uniquement lorsque le chemin courant est `/demo` ou commence par `/demo/`. Il charge alors un adaptateur de données local; il n’appelle pas le proxy API. Les pages ordinaires `/` et `/admin` conservent leurs contrôles et leur connexion réels. Le code d’authentification et les politiques PostgreSQL ne sont pas modifiés.

Une bannière persistante identifie la démonstration et propose retour QHSE, administration fictive, réinitialisation et sortie. Les exemples sont initialisés dans la mémoire du navigateur; toute écriture prise en charge sauvegarde l’état sous la clé locale `sentinelle-demo-v1`. La réinitialisation efface cette clé. Ne pas saisir de données réelles ou confidentielles. Les modifications sont propres au navigateur, sans synchronisation entre onglets ou appareils.

## Parcours disponibles

- Vue d’ensemble avec compteurs calculés à partir des exemples, filtre de site et accès aux modules.
- Plan d’actions : consultation, création, clôture/réouverture, historique local et commentaires conservés localement.
- Consultation des exemples documentaires, signalement, risque/matrice, obligation fictive et audit/planning annuel.
- Confirmation de lecture du document fictif et ajout d’actions aux signalements, risques et obligations dans la simulation.
- Consultation de l’entreprise, des sites et du compte fictifs dans `/demo/admin`.

Les opérations non prises en charge produisent un message explicite; aucun repli vers le backend réel n’est effectué. La création des autres objets, les workflows d’approbation/décision, les qualifications, les modèles et les écritures d’administration ne sont pas simulés dans ce premier lot. Les listes de modèles et qualifications sont vides. Les pièces jointes sont désactivées; aucun stockage S3 ni téléchargement n’est simulé.

Les états de validation et empreintes des exemples sont clairement fictifs. Ce mode sert à explorer l’interface, pas à vérifier le workflow serveur, l’isolation des entreprises, les permissions, la concurrence ou la conformité réglementaire. Le backend réel et ses migrations restent nécessaires pour ces validations.
