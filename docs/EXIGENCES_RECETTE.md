# Matrice de recette — cahier des charges Sentinel

Référence : « Cahier des charges – Logiciel QHSE, GRC et anticorruption2 », sections 1 à 6. Statut initial : non validé. Une fonction développée ne devient validée qu'après exécution du scénario avec preuve, date, environnement et responsable de recette.

| ID | Exigence et scénario de recette | Lot | Dépendances | Preuve attendue |
|---|---|---:|---|---|
| SOC-01 | Créer, vérifier, approuver, diffuser et accuser réception d'un document ; tester version, archivage, document externe et signature | 2 | identité, stockage, notifications | journal et document signé |
| SOC-02 | Diagnostiquer une norme par clause HLS et convertir un écart en action | 3 | référentiels et plan d'actions | diagnostic et action liée |
| SOC-03 | Cartographier processus, pilotes, risques, documents et indicateurs | 3 | identité et socle | fiche processus liée |
| SOC-04 | Enregistrer SWOT, PESTEL, parties intéressées, attentes et revue | 3 | sites et processus | historique de revue |
| SOC-05 | Déclarer NC et réclamation ; analyser 5 pourquoi/Ishikawa, coût et efficacité | 2 | fichiers et actions | dossier clôturé et preuve d'efficacité |
| SOC-06 | Suivre actions de toutes origines avec responsable, échéance et relances | 2 | notifications et identité | action et relance journalisée |
| SOC-07 | Planifier programme d'audit, checklist, constats, rapport et auditeur qualifié | 2 | qualifications et documents | rapport figé et suivi des écarts |
| SOC-08 | Générer entrées de revue de direction, compte rendu et décisions | 3 | indicateurs et actions | revue et décisions suivies |
| SOC-09 | Saisir/importer indicateurs, objectifs et seuils par site/processus/norme | 3 | processus et import | tableau et alerte |
| SOC-10 | Gérer compétences, habilitations, formations et efficacité | 3 | personnes et sites | matrice et évaluation |
| SOC-11 | Référencer et évaluer fournisseurs, audits et réclamations | 3 | tiers et audits | fiche fournisseur et évaluation |
| SOC-12 | Inventorier équipements, étalonnages, maintenances et échéances | 3 | sites et notifications | équipement et alerte |
| SOC-13 | Réaliser enquêtes de satisfaction clients et collaborateurs | 3 | personnes et permissions | enquête et résultats |
| ALIM-01 | Constituer équipe, produits, utilisations et diagrammes | 8 | sites et documents | dossier produit |
| ALIM-02 | Évaluer dangers et déterminer PRP/PRPo/CCP, limites et surveillance | 8 | risques et contrôles | plan HACCP pilote et alerte dépassement |
| ALIM-03 | Tracer lots, gérer retraits/rappels et exercice en moins de quatre heures | 8 | produits et lots | résultat de simulation chronométré |
| ALIM-04 | Suivre validation des maîtrises, laboratoire, tendances et programmes prérequis | 8 | laboratoire et documents | résultats et tendances |
| SST-01 | Évaluer risques par unité/poste/situation et établir document unique | 7 | risques et processus | document unique pilote |
| SST-02 | Analyser accidents, presque-accidents, arbre des causes et taux fréquence/gravité | 7 | incidents et heures travaillées | calculs vérifiés |
| SST-03 | Gérer visites, permis, entreprises extérieures, EPI, santé, FDS, urgences et participation | 7 | compétences, fichiers et droits sensibles | dossiers et exercices |
| ENV-01 | Évaluer aspects/impacts, significativité et cycle de vie | 7 | processus et sites | analyse environnementale |
| ENV-02 | Suivre consommations, émissions/carbone, déchets, bordereaux et urgences | 7 | indicateurs et fichiers | registre et rapport |
| ENV-03 | Suivre autorisations/permis et alertes d'échéance | 7 | obligations et notifications | permis et alerte |
| RSK-01 | Importer cartographie, paramétrer échelles et calculer risques bruts/résiduels | 3 | import et administration | matrice et calculs vérifiés |
| RSK-02 | Relier contrôles internes et tests d'efficacité aux risques, incidents, audits et actions | 4 | actions et audits | contrôle et historique |
| GOV-01 | Suivre délégations, comités et décisions | 4 | identité et actions | registre et décisions |
| GOV-02 | Plan de continuité d'activité | option | gouvernance | exercice documenté |
| CON-01 | Enregistrer obligations légales, contractuelles et volontaires avec responsable et fréquence | 4 | sources et sites | registre filtré |
| CON-02 | Évaluer conformité avec preuves, actions et taux par site/thème/texte | 4 | fichiers et actions | évaluation motivée et taux expliqué |
| CON-03 | Traiter manquements et rapporter à la gouvernance | 4 | revues et actions | rapport et suivi |
| AC-01 | Diffuser politique/code et suivre lecture et formation | 4 | documents et formations | accusés et formations |
| AC-02 | Cartographier corruption par processus/fonction/pays | 4 | risques et processus | cartographie |
| AC-03 | Évaluer dix tiers avec questionnaires, risque et revue | 4 | tiers et identité | dix évaluations |
| AC-04 | Gérer cadeaux, conflits, dons et parrainages avec seuils/validations | 4 | workflows et permissions | registres et décisions |
| AC-05 | Déposer et traiter alerte anonyme en accès restreint | 5 | portail et stockage séparé | dossier et contrôle d'accès négatif |
| AC-06 | Suivre contrôles comptables et fonction anticorruption | 4 | contrôles et gouvernance | registre et revue |
| MED-01 | Dossier technique/conception relié aux risques ISO 14971 | 9 | produits, documents, risques | dossier pilote |
| MED-02 | Tracer lot/série/UDI en moins de deux heures ; valider procédés | 9 | lots et production | recherche chronométrée |
| MED-03 | Traiter matériovigilance, rappels et surveillance après commercialisation | 9 | réclamations et lots | dossier de vigilance |
| COS-01 | Gérer matières, réception, échantillons et statuts | 9 | fournisseurs et stocks | lot matière |
| COS-02 | Fabriquer, contrôler et libérer un lot par personne habilitée | 9 | production et laboratoire | dossier lot et libération |
| COS-03 | Suivre BPF, OOS, sous-traitance, cosmétovigilance et dossier produit | 9 | documents et réclamations | déviation et réclamation pilotes |
| RSE-01 | Autodiagnostic des sept questions centrales et parties prenantes | 10 | diagnostic et processus | diagnostic complet |
| RSE-02 | Suivre actions, achats responsables, indicateurs et générer rapport RSE | 10 | actions et fournisseurs | rapport fondé sur données |
| IA-01 | Surveiller sources officielles CI, Maroc, France et UE et détecter modifications | 6 | sources autorisées et corpus | journal de collecte et délai |
| IA-02 | Extraire exigences et qualifier applicabilité selon profil | 6 | corpus validé et profil | 50 textes, extraction ≥ 90 %, acceptation ≥ 80 % |
| IA-03 | Proposer évaluations et réponses avec articles, liens, confiance et validation humaine | 6 | preuves et responsable | 100 % des réponses sourcées |
| IA-04 | Alertes, synthèses mensuelles, due diligence et listes sanctions/PEP | 6 | notifications et fournisseurs de données | synthèse et revue humaine |
| IA-05 | Garantir journal des propositions/décisions, français/anglais et absence d'entraînement tiers | 6 | contrats fournisseurs | journal et clauses contractuelles |
| TECH-01 | SaaS multi-entités/sites/langues, hébergement identifié | 1, 11 | infrastructure | deux entreprises isolées |
| TECH-02 | Mobile Android/iOS avec incidents/photos et checklist hors ligne | 11 | stockage et synchronisation | parcours hors ligne et conflit |
| TECH-03 | Paramétrer formulaires, workflows, échelles et notifications | 3, 11 | administration | configurations versionnées |
| TECH-04 | Notifications dans l'application et par courriel ; PDF et Excel | 2 | traitements différés | relance et rapports |
| SEC-01 | Comptes administrés, MFA et SSO Entra | 1, 11 | fournisseur d'identité | parcours invitation/MFA/SSO |
| SEC-02 | Permissions rôle/site/module/donnée et cloisonnement enquêtes | 1, 5 | identité et RLS | tests d'isolation et accès révoqué |
| SEC-03 | Chiffrement, sauvegardes quotidiennes et plan de reprise | 1, 11 | hébergement et stockage | restauration chronométrée |
| SEC-04 | Piste d'audit immuable et signature électronique | 2, 11 | journal et prestataire | historique et signature vérifiés |
| SEC-05 | Données personnelles : législations CI, Maroc et RGPD selon usage | 11 | analyse juridique et contrats | dossier de conformité validé |
| INT-01 | Intégrer SIRH, ERP, LIMS, capteurs, messagerie et agenda via API | 11 | systèmes partenaires | échanges vérifiés par connecteur |
| INT-02 | Import/export Excel, Word, PDF et export intégral incluant fichiers | 2, 11 | stockage et contrats | export complet réimportable |
| OPS-01 | Disponibilité ≥ 99,5 %, affichage < 3 s, support français GMT et SLA | 11 | supervision et exploitation | mesures et contrat |
| LIV-01 | Paramétrage, reprise des données, formation, documentation et maintenance | 11 | lots précédents | dossier, migration et supports validés |
| OPT-01 | ISO 27001, 50001, 17025 en option | option | socle et choix client | recette spécifique |

Les cibles de délais et de performance sont des objectifs de recette, pas des résultats déjà mesurés. Les normes citées dans les exemples ne constituent pas des textes réglementaires préchargés. Les preuves doivent être liées à une version précise, avec résultat et environnement ; aucun scénario ci-dessus n'est marqué validé à ce jour.

## Avancement technique — SOC-05

Le dossier de signalement inclut les 5 pourquoi et six familles Ishikawa, enregistrées avec la révision et le journal du dossier. Le cycle de non-conformité avec analyse, actions et vérification indépendante a été exercé par tests API/PostgreSQL locaux, y compris le contrôle de version et la validation des champs. Une recette navigateur, les preuves sur l'environnement pilote avec identités réelles et le parcours complet de réclamation restent nécessaires : l'exigence n'est pas encore validée.

## Avancement technique — SOC-01

Le registre documentaire est paginé ; les responsables du site peuvent consulter les confirmations horodatées d'une version publiée ou archivée. Un test API/PostgreSQL local couvre publication, confirmation idempotente et restriction des accès. La diffusion ciblée, les relances, la signature et la recette navigateur restent à réaliser ; l'exigence reste non validée.

## Avancement technique — SOC-05 et INT-02

Le registre des signalements et son export CSV sont filtrables et respectent la confidentialité propre au déclarant. Un test API/PostgreSQL local a parcouru plusieurs pages et comparé les résultats d'un responsable et d'un lecteur. Il ne remplace pas la recette navigateur ni l'export intégral incluant les pièces jointes ; les exigences restent non validées.

## Avancement technique — SOC-06

Une vérification motivée et indépendante peut être ajoutée à une version clôturée d'action. L'historique est conservé et une réouverture invalide la décision courante ; un test API/PostgreSQL local vérifie rôles, reprise et changement de version. La recette navigateur, les pièces justificatives et les relances restent nécessaires ; l'exigence n'est pas validée.

## Avancement technique — SOC-01, diffusion ciblée

Des destinataires habilités peuvent être désignés sur une version publiée ; leur confirmation est rapprochée de la liste nominative. Des tests API/PostgreSQL locaux couvrent droits, doublons et confirmation. Les notifications, relances, annulations et la recette navigateur restent ouvertes : SOC-01 demeure non validée.
