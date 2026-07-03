# Atelier — Portefeuille de projets pour PMO

Réplique améliorée de MS Project, orientée gestion de portefeuille. Monorepo pnpm : React + Vite côté web, moteur d'ordonnancement CPM en TypeScript pur.

## Démarrer

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # tests du moteur (vitest)
pnpm build        # build production
```

## Structure

```
apps/web                     # React + Vite : dashboard PMO, Gantt, grille, ressources
packages/scheduling-engine   # moteur pur TS : CPM, calendriers ouvrés, dépendances, métriques
```

## Fonctionnalités actuelles

- **Moteur CPM** : dépendances FS / SS / FF / SF avec lag/lead, contraintes SNET / MSO,
  calendriers ouvrés (week-ends + jours fériés), passes avant/arrière, chemin critique,
  marges, WBS hiérarchique avec récapitulatives, détection de cycles. 16 tests.
- **Vue projet** : grille de tâches éditable en place (nom, durée, % — double-clic) synchronisée
  avec un Gantt SVG : barres d'avancement, jalons, récapitulatives, liens orthogonaux,
  chemin critique en rouge, ligne « aujourd'hui », jours chômés grisés, 3 niveaux de zoom.
  Toute édition recalcule le planning en direct.
- **Dashboard portefeuille** : santé RAG, avancement, budget vs coût planifié, échéances,
  feuille de route multi-projets avec jalons, jalons à venir, registre des risques scorés.
- **Charge ressources** : heatmap hebdomadaire en ETP tous projets confondus,
  surallocations en rouge.

## Feuille de route (extraits)

Baselines et suivi d'écart, nivellement de ressources, EVM complet (SPI/CPI),
import/export .mpp (MPXJ), API + persistance, collaboration temps réel, feuilles de temps,
workflow de gouvernance (stage-gate), champs personnalisés.
