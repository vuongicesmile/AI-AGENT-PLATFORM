# Repository Scaffold Traceability

| Requirement | Decision/artifact | Verification/evidence | Status |
|---|---|---|---|
| FR-0.1 | ADR-0001; Power Platform solution-source and deployment directories | Local repository and structure validation | Scaffolded; environment/pipeline pending |
| FR-0.2 | `RMITFM_DataModel` ownership boundary | Placeholder ownership review | Design only; physical schema gated |
| FR-0.3, NFR-3 | Security test boundary and secret exclusions | `.gitignore` inspection | Scaffolded; RBAC implementation pending |
| FR-0.4, FR-1.1, FR-2.1, FR-2.2 | `rmit-fm-integrations` adapters and contract boundary | Placeholder gate review | Blocked on approved source interfaces/host |
| FR-3.1–FR-5.5 | AppsAutomation, ServerExtensions and PCF boundaries | Repository dependency review | Scaffolded; stories/business rules pending |
| FR-6.1–FR-7.5 | `rmit-fm-analytics` PBIP boundary | Repository structure review | Scaffolded; data/KPI/workspace decisions pending |
| NFR-4, NFR-8 | Central traceability, mappings, RAID and runbook directories | Documentation-path review | Scaffolded; runtime evidence pending |
| NFR-5 | PCF accessibility baseline and analytics UX test boundary | Documentation review | Scaffolded; approved UI/component pending |
| NFR-6, NFR-7 | Deployable-boundary segmentation and configuration templates | ADR review | Scaffolded |
| FR-0.4, FR-0.5, FR-1.1–FR-1.4, FR-2.1–FR-2.4, NFR-4, NFR-6–NFR-8 | ADR-0002; detailed source-health, Bronze/Silver/Gold, reconciliation and serving flow in `rmit-fm-architecture.md` | Mermaid structure review; runtime contract/reconciliation tests pending | Proposed design documented; source interfaces and hosting gated |
| FR-0.2, FR-0.4, FR-0.5, FR-1.1–FR-1.5, FR-2.1, FR-2.3–FR-2.6, FR-5.3, NFR-4, NFR-6–NFR-8 | ADR-0003; `docs/demo/spo-utility-cost-demo.md`; table/flow/app blueprints; local utility-cost pipeline | Node test suite covers raw preservation, duplicate/idempotency, relationship mapping, validation/quarantine and VALID-only Gold cost | Local synthetic demo; no environment deployment or production acceptance |

“Scaffolded” does not mean the requirement is implemented or accepted. Completion requires the evidence defined by the project Definition of Done.
