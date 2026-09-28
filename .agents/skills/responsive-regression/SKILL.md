---
name: responsive-regression
description: Audit and validate J&A responsive layouts across required phone, tablet and desktop widths. Use after frontend/layout/form/navigation changes or when reproducing clipping/compression/first-letter sidebar bugs.
---

# Responsive Regression

Client Essential representative viewports:

- 360×800
- 390×844
- 768×1024
- 1440×900

Smoke-check 430px or other widths when a reproduced defect or layout risk warrants it; do not create an exhaustive viewport release product.

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
