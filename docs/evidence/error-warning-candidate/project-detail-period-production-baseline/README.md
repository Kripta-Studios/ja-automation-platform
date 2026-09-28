# Project Detail deployed period baseline

- Captured 2026-09-27 in actual headless Chromium against deployed `https://j-aautomation.com/j-aautomation/app`.
- Finance English at 390 px and Auditor Spanish at 1440 px signed in through the rendered page. A project ID was read from Finance Cash's project picker, then only Project Detail GET links were opened. No project or finance action was submitted. Credentials were read at runtime from the private test-account file and are absent from this evidence.
- Reproduce with `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH node docs/evidence/error-warning-candidate/project-detail-period-production-baseline/production-readonly.mjs`.

For both roles, a valid project detail link returned HTTP 200. An impossible start date and a reversed period each returned HTTP 400 with the generic full-page error in the selected language. The date inputs, project context, remedy, and keyboard focus were lost. A duplicated `periodStart` query returned HTTP 200 with no visible warning, so the server silently chose a value. The browser had no page exceptions; console resource errors matched the deliberate 400 responses. Redacted DOM and network facts are in `production-results.json`.
