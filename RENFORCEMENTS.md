# Renforcements Atelier PMO

Propositions pour **ajouter ou renforcer** des fonctionnalités sur le produit existant (portefeuille / MS Project / PMO).

Hors périmètre de ce document : staffing commercial BU, TACE, intégrations Google / Jira, facturation.

---

## Fil conducteur

1. **Fiabiliser le quotidien PMO** — calendrier UI, date de statut EVM, timesheets multi-projets, drill-down KPI.
2. **Fermer la boucle revue** — baseline visuelle, alertes, rapport flash exportable, RAID lié au planning.
3. **Préparer le multi-utilisateur** — auth légère + écritures par agrégat.
4. **Interop** — import/export `.mpp`, seed démo.

Le socle (CPM, EVM, charge, RAID, demandes) est déjà là. La suite à forte valeur : **précision EVM**, **charge actionnable**, **timesheets / gouvernance utilisables en comité**, puis **auth + persistance fine**.

---

## Renforcer l’existant

### 1. Planning & EVM

Le moteur est déjà riche ; l’usage quotidien peut encore gagner en précision.

| Renforcement | Détail |
|---|---|
| Date de statut EVM exposée | Le moteur sait mesurer le PV à une date ; l’UI doit la rendre explicite (sinon SPI/SV restent ambigus). |
| Courbes S / PV phasé | Sans date, le PV ≈ BAC ; une courbe planifié vs réel vs gagné est le langage comité. |
| Baseline multiple / historique | Une seule capture limite les revues « avant / après arbitrage ». |
| % d’avancement guidé | Modes (manuel, jalons, effort) et rappel quand le % diverge du planning. |

### 2. Charge ressources

Heatmap, surallocations et nivellement existent ; la boucle métier est incomplète.

| Renforcement | Détail |
|---|---|
| Lien surcharge → action | Depuis la heatmap : ouvrir la tâche, proposer le nivellement, voir les projets en conflit. |
| Horizon et filtres | 4 / 8 / 12 semaines, par rôle, par projet — la vue globale sature vite. |
| Capacité réelle | Absences simples ou jours non dispo (même sans module congés complet) pour éviter les faux verts. |

### 3. Feuilles de temps

Base solide pour l’AC, encore « outil solo ».

| Renforcement | Détail |
|---|---|
| Validation légère | Statuts brouillon / validé, même sans auth complète. |
| Vue « ma semaine » | Tous projets confondus, pas seulement projet par projet. |
| Écarts plan vs saisi | Ex. affecté 3 j, saisi 5 j — signal PMO immédiat. |
| Coût réel hors timesheet | Saisie aussi depuis l’inspecteur de tâche. |

### 4. Pipeline demandes

Stage-gate + conversion : bon squelette, peu de pilotage.

| Renforcement | Détail |
|---|---|
| Champs PMO utiles | Sponsor budgétaire, échéance souhaitée, dépendance à un projet existant, axe stratégique dès la demande. |
| File d’attente capacité | « Si on approuve, quelle surcharge ? » (lien avec la heatmap). |
| Traçabilité post-conversion | Lien bidirectionnel demande ↔ projet ; la demande ne « meurt » pas à la conversion. |

### 5. RAID & assistant risque

Le wizard IA est un différenciateur ; le registre reste classique.

| Renforcement | Détail |
|---|---|
| Remontée portefeuille actionnable | Risques rouges + actions en retard + problèmes > 30 j en une file priorisée (pas seulement des compteurs). |
| Lien risque → tâche / jalon | Ancrer le RAID dans le planning. |
| Réévaluation périodique | Rappel / score résiduel pour que l’assistant ne soit pas one-shot. |

### 6. Dashboard & KPI

Beaucoup d’indicateurs ; peu de parcours.

| Renforcement | Détail |
|---|---|
| Drill-down | Clic KPI → liste des projets / tâches qui le composent. |
| Seuils configurables | CPI 0,97, etc. dans Paramètres. |
| Axe stratégique | Champ présent ; renforcer l’UX de rattachement et le mix (sinon le KPI reste creux). |
| Exceptions enrichies | Ajouter le « pourquoi » (CPI, retard jalon, risque ouvert). |

### 7. Calendrier & paramètres

Déjà en feuille de route README ; vrai frein métier.

| Renforcement | Détail |
|---|---|
| Calendrier éditable UI | Jours ouvrés / fériés (aujourd’hui peu accessible). |
| Seed démo API | Onboarding et démos PMO. |
| Tolérances PMO | Seuils coût / délai / santé RAG dans Paramètres (en plus de l’identité app / exercice). |

---

## Ajouter (dans la logique produit actuelle)

| Priorité | Fonctionnalité | Pourquoi |
|---|---|---|
| Haute | Auth + rôles simples (lecteur / éditeur / admin) | Prérequis audit fiable, multi-poste, desktop + cloud |
| Haute | API granulaire (projet, tâche, timesheet) au lieu du seul `PUT` portefeuille | Moins de conflits LWW, sync plus saine |
| Haute | Calendrier éditable + fériés | Planning et charge faux sans ça |
| Moyenne | Import / export `.mpp` | Adoption vs MS Project (déjà en roadmap) |
| Moyenne | Comparaison baseline / actuel visuelle (Gantt + tableau d’écarts) | Cœur de la revue de projet |
| Moyenne | Alertes PMO (jalon J-7, CPI &lt; seuil, risque non mitigé, CRA vide) | Dashboard proactif |
| Moyenne | Rapport flash exportable (PDF / Doc figé) | La vue existe ; il manque l’artefact comité |
| Basse | Collaboration temps réel | Utile après auth + API granulaire |
| Basse | Champs perso projet + vues filtrées portefeuille | Flexibilité sans exploser le modèle |

---

## Non-priorités (pour l’instant)

- Staffing commercial, TACE, CRA facturation, Google / Jira — autre produit.
- Refonte visuelle large — le besoin est surtout profondeur métier et parcours comité.
- Temps réel avant auth — amplifierait les conflits du remplacement complet de portefeuille.

---

## Lien avec la roadmap existante

Éléments déjà listés dans `README.md` / `.paul/ROADMAP.md` et repris ici comme renforcements :

- Import / export `.mpp` (MPXJ)
- Collaboration temps réel
- Authentification et rôles
- Calendrier éditable depuis l’UI
- Script `db:seed`
