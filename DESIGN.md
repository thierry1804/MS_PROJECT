# DESIGN.md

## Concept

"Table à dessin" : papier chaud + encre. L'outil d'un planificateur, pas un SaaS. Thème clair (bureau éclairé, lecture prolongée de données).

## Color (OKLCH)

Stratégie : **Restrained**. Neutres pierre chauds (hue 80), accent encre. Couleur sémantique réservée aux états et au chemin critique.

```css
/* Neutres papier (hue 80, chroma 0.004-0.008) */
--paper-0:  oklch(0.985 0.004 80);  /* fond contenu */
--paper-1:  oklch(0.962 0.005 80);  /* panneaux, sidebar */
--paper-2:  oklch(0.930 0.006 80);  /* hover, séparation forte */
--ink-3:    oklch(0.72 0.010 80);   /* bordures marquées, texte désactivé */
--ink-2:    oklch(0.52 0.012 80);   /* texte secondaire */
--ink-1:    oklch(0.30 0.015 80);   /* texte principal */
--ink-0:    oklch(0.21 0.015 80);   /* titres, données clés */

/* Accent encre bleu nuit (désaturé, éditorial) */
--accent:       oklch(0.42 0.075 255);
--accent-hover: oklch(0.36 0.075 255);
--accent-soft:  oklch(0.93 0.020 255);  /* fonds sélection */

/* Sémantique */
--critical:      oklch(0.55 0.19 30);   /* chemin critique, rouge braise */
--critical-soft: oklch(0.94 0.03 30);
--ok:            oklch(0.55 0.12 150);  /* santé verte */
--ok-soft:       oklch(0.94 0.04 150);
--warn:          oklch(0.68 0.13 75);   /* ambre */
--warn-soft:     oklch(0.95 0.05 85);
--danger:        oklch(0.55 0.19 30);
--milestone:     oklch(0.42 0.075 255); /* jalons = encre */

/* Barres Gantt */
--bar-fill:     oklch(0.58 0.045 255); /* tâche normale */
--bar-progress: oklch(0.40 0.06 255);  /* avancement */
--bar-summary:  oklch(0.30 0.015 80);  /* tâche récapitulative */
```

Interdits : #000/#fff purs, gradients décoratifs, side-stripes, glassmorphism.

## Typography

- **Inter** seule famille (fallback system-ui). `font-feature-settings: "tnum"` sur toute donnée chiffrée (dates, durées, coûts).
- Échelle rem fixe, ratio 1.125 : 11 / 12.5 / 14 (base) / 16 / 18 / 20 / 22.5.
- Poids : 400 corps, 500 labels/nav, 600 titres et données clés. Jamais de display font.
- Grille/Gantt : 12.5px, interligne serré (1.35).

## Layout

- Shell : sidebar 232px (--paper-1) + zone contenu (--paper-0). Pas de topbar globale ; chaque vue a son propre en-tête avec titre + actions.
- Vue projet : split grille (gauche, redimensionnable) / Gantt (droite), scroll vertical partagé, ligne de 32px.
- Espacements : 4px base. Rythme varié : en-têtes aérés (24-32px), données denses (8-12px).
- Bordures 1px --paper-2 pour la structure ; pas de cartes imbriquées.

## Components

- Boutons : radius 6px, primaire = --accent plein, secondaire = bordure --ink-3, ghost pour actions de ligne. États complets (hover/focus/active/disabled).
- Focus visible : outline 2px --accent, offset 1px.
- Badges santé RAG : pastille 8px + label, fonds -soft. Jamais de saturation pleine sur états inactifs.
- Barres Gantt : radius 3px, hauteur 18px dans ligne 32px ; jalons = losange 12px ; récapitulatives = crochet fin ; liens = tracés orthogonaux 1.5px --ink-3, flèche pleine ; critique = --critical (barre ET lien).
- Grille : édition inline au double-clic, ligne sélectionnée = --accent-soft.
- Skeletons pour chargement, pas de spinners centrés.

## Motion

150-200ms, ease-out-quart, uniquement changement d'état (hover, sélection, expand WBS). Zéro chorégraphie au chargement.
