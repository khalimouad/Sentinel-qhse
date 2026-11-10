# Démarrage simple

La route `/demarrage` est une démonstration QHSE sans connexion. Elle réduit le parcours à cinq rubriques : vue d’ensemble, signalements, actions, normes et conformité.

## Parcours disponibles

- Configuration locale du nom, du pays et du secteur de l’organisation.
- Sélection des référentiels ISO et suivi d’une question d’autoévaluation par référentiel actif.
- Création de signalements qualité, sécurité, environnement et réclamation client, avec champs spécifiques selon le type choisi.
- Création et clôture/réouverture d’actions.
- Saisie, évaluation et suppression d’obligations réglementaires.
- Exemples modifiables préchargés et données conservées dans le `localStorage` de ce navigateur.

## Limites à garder visibles

Cette route est un prototype monoposte : elle n’utilise pas l’API, PostgreSQL, l’authentification, les rôles, l’isolation par organisation, ni les journaux d’audit du produit. Les données ne sont pas synchronisées entre utilisateurs ou appareils.

Le registre de conformité est manuel : aucun texte officiel n’est téléchargé ou déclaré applicable automatiquement. L’autoévaluation des normes n’est ni un diagnostic HLS complet ni une preuve de certification. Le parcours ne gère pas les alertes anonymes ou confidentielles, les enquêtes anticorruption, les modules HACCP détaillés, les équipements médicaux/cosmétiques, les pièces jointes, les notifications, les exports ou les audits complets.

Ne pas saisir de données personnelles, médicales, confidentielles ou de vraies alertes dans cette démonstration. Utiliser le produit serveur existant pour les parcours avec contrôle d’accès.
