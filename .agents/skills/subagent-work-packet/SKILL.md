---
name: subagent-work-packet
description: Create or execute a bounded J&A subagent work packet with explicit ownership, dependencies, tests and handoff. Use before delegating implementation or review work to a subagent.
---

# Subagent Work Packet

Every delegated task must include:

1. `ID` and objective.
2. Why the task exists / linked requirement IDs.
3. Preconditions and upstream dependencies.
4. **Owned write paths**.
5. **Forbidden write paths**.
6. Interfaces/contracts that may be read but not changed without escalation.
7. Required implementation behavior.
8. Required unit/integration/E2E tests.
9. Acceptance criteria.
10. Handoff format.

## Handoff format

Return:

- summary of implemented behavior;
- exact changed files;
- migrations/data changes;
- commands/tests run and outcomes;
- manual/browser verification performed;
- unresolved risks/blockers;
- requirement IDs believed satisfied;
- whether another agent must change an interface.

An agent may not silently broaden its write scope. Escalate path/interface conflicts to the parent.
