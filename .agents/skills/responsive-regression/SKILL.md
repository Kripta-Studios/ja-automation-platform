---
name: responsive-regression
description: Audit and validate J&A responsive layouts across required phone, tablet and desktop widths. Use after frontend/layout/form/navigation changes or when reproducing clipping/compression/first-letter sidebar bugs.
---

# Responsive Regression

Required viewports:

- 360×800
- 390×844
- 430×932
- 768×1024
- 1440×900

For every affected flow inspect:

- navigation labels and drawer behavior;
- card/form padding and borders;
- field label hierarchy;
- one-column stacking when appropriate;
- tables/mobile transformations;
- buttons and touch targets;
- modals/drawers;
- sticky actions;
- horizontal and vertical clipping;
- focus/keyboard behavior.

Do not accept `scrollWidth <= innerWidth` as sufficient proof of usability.
