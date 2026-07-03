# PRODUCT.md

## Product

**Atelier** : gestion de portefeuille de projets pour PMO. Réplique améliorée de MS Project, web, React + Vite, monorepo pnpm.

Le cœur : un moteur d'ordonnancement CPM (chemin critique, dépendances FS/SS/FF/SF, calendriers ouvrés) et des vues denses (Gantt interactif, grille de tâches, dashboard portefeuille).

## Register

product

## Users

- **PMO / responsable portefeuille** : arbitre, priorise, suit la santé globale. Lit des tableaux consolidés, cherche les dérives (jalons glissés, budgets dépassés, surcharges).
- **Chef de projet** : planifie, séquence, affecte. Vit dans le Gantt et la grille. Attend la précision de MS Project sans sa lourdeur.
- **Contributeur** : consulte ses tâches, met à jour l'avancement.

Utilisateurs experts, sessions longues (heures), écrans 24-27" en environnement bureau éclairé. La densité d'information est une exigence, pas un défaut.

## Tone

Précis, calme, outil de travail. L'interface disparaît derrière la tâche. La confiance vient de la fiabilité des chiffres (dates, marges, coûts), pas de la décoration.

## Anti-references

- MS Project lui-même : puissant mais hostile, ruban surchargé, modale pour tout.
- Monday/Asana : couleur décorative partout, densité insuffisante pour un PMO.
- Dashboards SaaS génériques : hero-metrics à gradient, cartes identiques en grille.

## Strategic principles

1. **Le moteur d'abord** : CPM exact, calendriers ouvrés respectés. Un Gantt joli avec des dates fausses est inutile.
2. **Densité maîtrisée** : beaucoup de données, hiérarchie typographique stricte, jamais de bruit décoratif.
3. **Édition en place** : grille type tableur, pas de modale pour éditer une tâche.
4. **Le chemin critique est le héros visuel** : c'est l'information la plus chère de l'écran.
