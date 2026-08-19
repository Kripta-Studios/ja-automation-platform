# MCP / Skill / Agent Matrix

The parent session may have many MCPs configured globally. Do **not** make every agent use every MCP. Tool minimization is part of the orchestration design.

| Agent | Model / effort | Preferred MCPs | Preferred skills | Write? |
|---|---|---|---|---|
| `architect` | Sol high | GitHub, Context7 only when external API semantics matter | orchestrator, spec-compliance | No |
| `frontend_lead` | Sol medium | Context7, Playwright/Chrome DevTools when available | frontend-design, responsive-regression, playwright-qa, stop-slop | Yes |
| `backend_domain` | Sol medium | Context7, GitHub | orchestrator/work-packet, finance-integrity where relevant | Yes |
| `finance_reporting` | Sol medium | Context7, GitHub, browser for download flows | finance-integrity, work-packet | Yes |
| `industrial_operations` | Sol medium | Context7 only as needed | work-packet, spec-compliance | Yes |
| `business_operations` | Sol medium | Context7 only as needed | work-packet, spec-compliance | Yes |
| `data_readiness` | Sol medium | Context7; W&B/HF only later if actual ML work starts | ml-data-readiness | Yes |
| `spec_auditor` | Luna max | GitHub/read tools | spec-compliance | No |
| `mobile_qa` | Luna max | Playwright, Chrome DevTools | playwright-qa, responsive-regression | No |
| `desktop_qa` | Luna max | Playwright, Chrome DevTools | playwright-qa | No |
| `finance_integrity_reviewer` | Luna max | GitHub/read tools | finance-integrity | No |
| `security_reviewer` | Luna max | GitHub/read tools; Sentry only for concrete runtime evidence | security-rbac-audit | No |
| `data_leakage_reviewer` | Luna max | read tools | ml-data-readiness | No |
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

### Tier 3 — future ML work

- **Hugging Face** and **Weights & Biases**: do not add context/tool overhead to ordinary V3 implementation. Enable when a real CatBoost/temporal/JEPA experiment is being built and tracked.

## Important rule

MCP output is evidence, not authority over local code. The authoritative product behavior is determined by the V3 spec, this repository, tests, and approved product extensions.
