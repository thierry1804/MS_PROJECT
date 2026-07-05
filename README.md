# Atelier — Portefeuille de projets pour PMO

Réplique améliorée de MS Project, orientée gestion de portefeuille. Monorepo pnpm : React + Vite côté web, API Fastify + Prisma côté serveur, moteur d'ordonnancement CPM en TypeScript pur.

## Stack technique

| Couche | Technologies |
|--------|--------------|
| Web | React 19, Vite 6, React Router 7 (hash), Zustand 5, CSS modules par vue |
| API | Fastify 5, CORS localhost, port 8787 |
| Données | Prisma 6, PostgreSQL (Neon serverless) |
| Moteur | `@atelier/scheduling-engine` — CPM, calendriers, EVM, nivellement |
| Langage | TypeScript 5.8, pnpm 10 |

## Démarrer

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # renseigner DATABASE_URL / DIRECT_URL (Neon)
pnpm --filter @atelier/api db:push       # créer le schéma en base
pnpm dev:api      # API sur http://localhost:8787
pnpm dev          # web sur http://localhost:5173 (proxy /api → 8787)
pnpm test         # 26 tests Vitest (moteur CPM)
pnpm typecheck    # vérification TypeScript sur tout le monorepo
pnpm build        # build production (web + compile API)
```

Au premier lancement, si la base est vide, le client persiste un portefeuille initial vide automatiquement.

La connexion Neon peut aussi être configurée depuis **Paramètres** dans l'UI (prioritaire sur le `.env`, appliquée sans redémarrage).

## Structure

```
apps/web                     # React + Vite : shell PMO, vues portefeuille/projet, Gantt, KPI
apps/api                     # Fastify + Prisma : API portefeuille, audit, config runtime DB
packages/scheduling-engine   # moteur pur TS : CPM, calendriers, EVM, charge, nivellement
```

## Navigation

| Route | Vue | Rôle |
|-------|-----|------|
| `/` | Vue portefeuille | Santé RAG, carte budget/CPI, exceptions, feuille de route, jalons, risques |
| `/kpi` | Pilotage PMO | KPI consolidés + saisie gouvernance et baromètre NPS |
| `/demandes` | Pipeline demandes | Kanban stage-gate idée → qualifiée → approuvée / rejetée |
| `/projets/:id` | Vue projet | Grille + Gantt + inspecteur de tâche |
| `/projets/:id/rapport` | Rapport flash | Synthèse EVM, écarts baseline, RAID pour comité |
| `/ressources` | Charge ressources | Registre ressources + heatmap hebdomadaire ETP |
| `/temps` | Feuilles de temps | Saisie hebdomadaire jours/tâche/ressource → coût réel |
| `/raid` | Registre RAID | Risques, actions, problèmes, décisions consolidés |
| `/journal` | Journal d'activité | Audit append-only, filtrable, paginé |
| `/parametres` | Paramètres | Identité app, exercice, Neon, champs personnalisés |

Shell : sidebar repliable, filtre projets, palette de commandes (`Ctrl+K` / `⌘K`), indicateur de sync.

## Moteur d'ordonnancement (`packages/scheduling-engine`)

- **CPM** : dépendances FS / SS / FF / SF avec lag/lead, contraintes ASAP / SNET / MSO, calendriers ouvrés (jours de semaine + jours fériés), passes avant/arrière, chemin critique, marges totales, WBS hiérarchique avec récapitulatives, détection de cycles.
- **Calendrier** : conversion index ↔ dates ISO, respect des week-ends et jours chômés.
- **Coûts** : coût planifié par tâche (affectations × taux journalier × durée + coût fixe) ; ressources `work`, `material`, `cost`.
- **EVM** : BAC, PV, EV, AC, SPI, CPI, EAC, ETC, SV, CV — PV mesurée à la date du jour.
- **Charge** : détection des surallocations journalières, matrice de charge par ressource.
- **Nivellement** : passe heuristique unique — ajoute des contraintes SNET pour décaler les tâches surchargées.
- **Tests** : 26 tests Vitest (19 CPM, 3 métriques, 4 nivellement).

## Fonctionnalités

### Vue portefeuille

- Tableau projets : santé RAG, statut, avancement, budget vs coût planifié, SPI/CPI, échéance.
- Carte budget : rectangles proportionnels au budget approuvé, teintés par performance coût (CPI).
- Panneau exceptions : projets hors tolérance coût, triés par variance décroissante.
- Feuille de route multi-projets avec jalons sur la timeline.
- Jalons à venir (30 jours), registre des risques scorés (probabilité × impact).
- Création / suppression de projets, export JSON du portefeuille, réinitialisation.

### Vue projet

- **Grille** éditable en place (nom, durée, % — double-clic) ; colonnes d'écart optionnelles (Δ début/fin, CV %).
- **Gantt SVG** synchronisé : barres d'avancement, jalons, récapitulatives, liens orthogonaux, chemin critique en rouge, baseline en pointillés, ligne « aujourd'hui », jours chômés grisés, 3 niveaux de zoom (jour / semaine / mois).
- **Inspecteur** : contraintes, prédécesseurs (type + lag), affectations ressources, coûts planifié/réel/EV, notes, champs personnalisés.
- **Édition WBS** : ajout tâche/sous-tâche, indent/outdent (Tab / Maj+Tab), suppression avec sous-arbre.
- **Baseline** : capture instantanée dates + coûts planifiés de toutes les tâches feuilles.
- **Nivellement** : résorption automatique des surcharges (contraintes SNET).
- **Bandeau EVM** : BAC, PV, EV, AC, SPI, CPI, EAC, ETC.
- Export CSV Excel-friendly (UTF-8 BOM, séparateur `;`), lien vers rapport flash.

Toute édition recalcule le planning en direct côté client.

### Pilotage PMO (KPI)

Cinq familles de KPI calculées à partir du portefeuille :

| Famille | Indicateurs |
|---------|-------------|
| Performance | Taux à l'heure (baseline), taux coût cible (CPI ≥ 0,97), glissement moyen (j ouvrés), tâches en retard |
| Qualité | Conformité stage-gate, incidents majeurs ouverts, jalons à l'heure, taux clôture risques |
| Valeur | Taux d'utilisation ressources, surcharges, mix stratégique par axe, budget non tagué |
| Satisfaction | NPS interne (180 j), taux participation gouvernance |
| Opérationnel | Décisions (90 j), délai moyen résolution problèmes, problèmes ouverts > 30 j |

Saisie intégrée : événements de gouvernance (comité portefeuille, revue projet, architecture, conformité) et réponses baromètre (rôle chef de projet / sponsor / équipe, score 0–10).

### Pipeline demandes (stage-gate)

- Colonnes : Idées → Qualifiées → Approuvées → Rejetées.
- Score de priorité : valeur × (6 − effort).
- Gates formelles avec checklist + approbateur + commentaire pour les transitions **qualifier** et **approuver** ; historique tracé sur la carte.
- Conversion d'une demande approuvée en projet actif.
- Suppression des demandes rejetées.

### Charge ressources

- CRUD ressources (personne, matériel, coût forfaitaire) : capacité, taux journalier, rôle.
- Heatmap hebdomadaire en ETP tous projets confondus ; surallocations en rouge.

### Feuilles de temps

- Saisie par semaine (lundi ISO), tâche feuille et ressource affectée.
- Recalcul automatique du coût réel (`actualCost`) de la tâche à partir des entrées × taux journalier.

### Registre RAID

- Consolidation portefeuille : risques (score P×I), actions (cycle à faire → en cours → fait), problèmes (gravité, time-to-resolution), décisions.
- Filtre par projet, KPI de synthèse, CRUD par registre.

### Journal d'activité

- Table append-only indépendante du cycle de sauvegarde portefeuille.
- Trace : projets, tâches, budget/coût réel, baselines, nivellements, RAID, demandes, gouvernance, baromètre, ressources.
- Pas d'authentification : `actor` est un placeholder texte, pas une identité vérifiée.
- Filtrage, pagination (10 / 30 / 100), purge totale.

### Paramètres

- Nom de l'application, libellé portefeuille, année d'exercice (sidebar + titre navigateur).
- Connexion Neon : URL pooler + URL directe optionnelle, test et reconnexion Prisma à chaud.
- Champs personnalisés tâche : texte, nombre, liste de choix — éditables dans l'inspecteur.

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Santé serveur |
| GET | `/api/portfolio` | Lire le portefeuille (404 si vide) |
| PUT | `/api/portfolio` | Remplacement complet du portefeuille |
| GET | `/api/audit?limit=N` | Journal d'audit (max 1000) |
| POST | `/api/audit` | Ajouter une entrée d'audit |
| DELETE | `/api/audit` | Purger le journal |
| GET | `/api/config/database` | Statut connexion (source, URLs masquées) |
| PUT | `/api/config/database` | Enregistrer URLs Neon + reconnecter Prisma |

Config runtime DB persistée dans `apps/api/data/runtime-config.json` (prioritaire sur `.env`).

## Modèle de données (Prisma)

Singleton `Portfolio` (id `"default"`) contenant :

- **Ressources**, **projets** (tâches, dépendances, RAID, feuilles de temps)
- **Demandes** (pipeline stage-gate + `gateHistory` JSON)
- **Champs personnalisés** (`CustomFieldDef`)
- Calendrier portefeuille (jours ouvrés, fériés), nom app, exercice fiscal

Entité séparée **AuditEntry** (append-only, jamais écrasée par le PUT portefeuille).

Les unions de statuts (santé, stage, type dépendance…) sont des `String` côté Postgres ; les types TypeScript frontend en sont la source de vérité.

Champs portefeuille gérés en JSON côté wire mais non persistés en tables dédiées : `governanceEvents`, `surveys`, `strategicAxis` projet, valeurs `custom` tâche/projet.

## Persistance et synchronisation

- Chargement du portefeuille au démarrage (`GET /api/portfolio`).
- Autosauvegarde debounced à chaque modification (`PUT /api/portfolio`).
- Statuts affichés dans le shell : chargement, sauvegarde, à jour, erreur, hors ligne.
- Audit en écriture best-effort (`POST /api/audit`) — une erreur d'audit ne bloque jamais l'édition.

## Feuille de route

- Import/export `.mpp` (MPXJ)
- Collaboration temps réel
- Authentification et rôles (préalable à une traçabilité « qui » fiable)
- Calendrier éditable depuis l'UI (aujourd'hui : lun–ven, fériés via seed/config)
- Script `db:seed` (semis portefeuille démo côté API — à implémenter)
