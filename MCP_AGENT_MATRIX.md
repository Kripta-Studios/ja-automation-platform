# MCP / Skill / Agent Matrix

The parent session may have many MCPs configured globally. Do **not** make every agent use every MCP. Tool minimization is part of the orchestration design.

| Agent | Model / effort | Preferred MCPs | Preferred skills | Write? |
|---|---|---|---|---|
| `architect` | Sol high | GitHub, Context7 only when external API semantics matter | orchestrator, spec-compliance | No |
| `frontend_lead` | Sol medium | Context7, Playwright/Chrome DevTools when available | frontend-design, responsive-regression, playwright-qa, stop-slop | Yes |
| `backend_domain` | Sol medium | Context7, GitHub | orchestrator/work-packet, finance-integrity where relevant | Yes |
| `finance_reporting` | Sol medium | Context7, GitHub, browser for download flows | finance-integrity, work-packet | Yes |
| `industrial_operations` | Sol medium | Context7 only as needed | work-packet, spec-compliance | Yes — deferred except Essential PLC/report dependency |
| `business_operations` | Sol medium | Context7 only as needed | work-packet, spec-compliance | Yes — Essential dependencies only; generic platform deferred |
| `data_readiness` | Sol medium | Context7; W&B/HF only after explicit post-core request | ml-data-readiness | Yes — deferred post-core |
| `spec_auditor` | Luna max | GitHub/read tools | spec-compliance | No |
| `mobile_qa` | Luna max | Playwright, Chrome DevTools | playwright-qa, responsive-regression | No |
| `desktop_qa` | Luna max | Playwright, Chrome DevTools | playwright-qa | No |
| `finance_integrity_reviewer` | Luna max | GitHub/read tools | finance-integrity | No |
| `security_reviewer` | Luna max | GitHub/read tools; Sentry only for concrete runtime evidence | security-rbac-audit | No |
| `data_leakage_reviewer` | Luna max | read tools | ml-data-readiness | No — only for commissioned post-core ML/existing record changes |
| `integration_reviewer` | Sol high | GitHub, CI/Sentry evidence as needed | release-gate, spec-compliance | No |

## MCP priorities

### Tier 1 — use actively

- **GitHub**: repo/PR/CI context, not as a replacement for the local working tree when local code is available.
- **Context7**: current SvelteKit/Svelte/Playwright/library documentation when implementation depends on version-specific behavior.
- **Playwright**: end-to-end product flows and reproducible browser assertions.
- **Chrome DevTools**: runtime/network/console/computed-layout diagnosis when Playwright exposes a failure but not the cause.

### Tier 2 — conditional

- **Sentry**: staging/production runtime exceptions and release regressions when the project is connected.
- **Exa**: only for current external research that cannot be answered by primary docs already available.
- **DeepWiki**: only for understanding an external repository/library, not the J&A repo itself.

### Tier 3 — deferred post-core ML work

- **Hugging Face** and **Weights & Biases**: do not add context/tool overhead to Client Essential implementation. Enable only after an explicit post-core ML request.

## Important rule

MCP output is evidence, not authority over local code. Client-release behavior is determined by the Client Essential specification/checklist, current repository and verified tests/runtime evidence. The old V3/backlog is non-conflicting reference and deferred roadmap.

## Luna Max implementation workers

These agents are **first-class production implementers**, not assistants of last resort. Prefer them for Complexity-A packets.

| Agent | Model | Typical MCPs | Typical skills | Write? |
|---|---|---|---|---|
| `frontend_leaf` | Luna max | Context7, Playwright/Chrome DevTools as needed | frontend-design, responsive-regression | Yes |
| `backend_leaf` | Luna max | Context7 | subagent-work-packet | Yes |
| `crud_ui_worker` | Luna max | Context7, Playwright | frontend-design, playwright-qa | Yes |
| `responsive_worker` | Luna max | Playwright, Chrome DevTools | responsive-regression, playwright-qa | Yes |
| `report_ui_worker` | Luna max | Context7, Playwright | frontend-design, finance-integrity as read guidance | Yes |
| `industrial_ui_worker` | Luna max | Context7, Playwright | frontend-design | Yes — explicit Essential PLC/report packet or post-core only |
| `business_ui_worker` | Luna max | Context7, Playwright | frontend-design | Yes — bounded Essential dependency or post-core only |
| `data_tooling_worker` | Luna max | Context7 | ml-data-readiness | Yes — deferred post-core |
| `fixture_data_worker` | Luna max | none/Context7 as needed | subagent-work-packet | Yes |
| `migration_worker` | Luna max | Context7 | subagent-work-packet | Yes, only under Sol-defined migration contract |
| `test_worker` | Luna max | Playwright/Chrome DevTools when browser tests | playwright-qa, spec-compliance | Yes |
| `docs_worker` | Luna max | GitHub/read tools as needed | spec-compliance | Yes |

A Luna write agent can own a large bounded packet or complete low-risk vertical slice. Do not fragment work into meaningless microtasks merely to use Luna. The limiting factors are semantic ambiguity and invariant risk, not line count.
