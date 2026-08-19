---
name: ml-data-readiness
description: Design or audit J&A Project Intelligence data infrastructure: point-in-time snapshots, events, features, training exports, model registry, prediction history and leakage prevention. Use for future GBT/JEPA readiness; do not claim model quality without real validation data.
---

# ML / Data Readiness

## Build now

- point-in-time project-day/project-week snapshots;
- immutable material business events with event time and actor/source;
- feature schema/version definitions;
- reproducible export manifests and hashes;
- explicit outcome labels only after they become known;
- model registry with version, training window, features, metrics and status;
- prediction history storing model version, as-of time, feature snapshot/hash and prediction;
- shadow mode and rollback/disable;
- rule/statistical baselines.

## Leakage rules

Never include facts that became known after `as_of` in an earlier snapshot. Split evaluation by project/entity and time as appropriate; never randomly split adjacent snapshots of the same project across train/test.

## Future models

CatBoost/XGBoost should be evaluated against simple baselines first. Temporal/JEPA work is experimental until it beats appropriate baselines on held-out real projects. Do not use synthetic data as proof of production accuracy.
