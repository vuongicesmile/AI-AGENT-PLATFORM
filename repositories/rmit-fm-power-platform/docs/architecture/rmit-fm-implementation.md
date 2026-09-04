# RMIT FM Data & Automation Platform — Dev Implementation Plan

**Document Type**: Implementation Plan
**Version**: 0.1
**Status**: Dev design draft
**Related**: [Overview](rmit-fm-overview.md), [Architecture](rmit-fm-architecture.md), [Schema Catalog](rmit-fm-medallion-schema.md)

## 1. Dev-First Sequence

| Step | Dev increment | Exit evidence | Requirement mapping |
|---|---|---|---|
| D0 | ADRs, source inventory, access matrix, environment skeleton | Decisions/unknowns signed or tracked; Dev/Test boundaries | FR-0.1–0.5, NFR-3/6/7 |
| D1 | Canonical schema and seed dimensions | Migrations/solution import; uniqueness and RBAC tests | FR-0.2/0.3, NFR-4/8 |
| D2 | Mock adapters and common ingestion contract | Fixtures for BACnet/Modbus/Archibus; idempotency tests | FR-0.4, FR-1.1, FR-2.1/2.2 |
| D3 | Dataverse Bronze landing and run control | Raw replay; counts, watermark, retry, quarantine evidence | FR-0.5, NFR-4 |
| D4 | Silver quality pipeline | Unit normalization, dedup/gap/outlier/range tests | FR-1.3, FR-2.3, NFR-4 |
| D5 | Dataverse Gold aggregates and targets | Hour/day/month reconciliation and freshness columns | FR-1.4–1.7, FR-2.4–2.7 |
| D6 | Semantic model and dashboard pilot | UAT dataset, RLS tests, measured render/freshness | FR-1.5/1.7, FR-2.5/2.6, FR-6.1–6.7, FR-7.1–7.5 |
| D7 | Workflow/checklist/manual capture | Approval, email, audit, QR/typed-ID tests | FR-3.1–3.7, FR-4.1–4.6, FR-5.1/5.3/5.4 |
| D8 | Historical migration rehearsal | Profile, mapping, dry run, reconciliation, rollback plan | Historical migration clarification, NFR-4/8 |
| D9 | Hardening and release candidate | UAT, docs, monitoring, support/runbook, RAID update | FR-8.1–8.3, NFR-1–8 |

## 2. Dev Environment Layout

Keep connection-specific values outside code:

- `dev`: local/mock fixtures, synthetic data, developer-owned connections.
- `test`: sanitized representative volume, integration endpoints or approved simulators, UAT identities.
- `prod`: not part of this first implementation step; requires hosting ADR, security review, deployment approval, and rollback evidence.

Repository boundaries are defined by deployable/runtime ownership rather than by individual feature:

```text
rmit-fm-power-platform/       # Dataverse schema, apps, flows, ALM metadata and governance
rmit-fm-dataverse-plugins/    # Dataverse server-side C#/.NET Framework extensions
rmit-fm-pcf-components/       # TypeScript PCF controls and RMITFM_UIComponents packaging
rmit-fm-integrations/         # External .NET workers and BACnet/Modbus/Archibus adapters
rmit-fm-analytics/            # Power BI PBIP semantic models, reports and themes
```

Do not create repositories per plug-in class, PCF control, flow or report. `RMITFM_DataModel` remains the sole owner of all project Tables. Deployment order is DataModel, ServerExtensions/UIComponents, AppsAutomation, then analytics. See [ADR-0001](../adr/ADR-0001-repository-and-solution-segmentation.md).

## 3. Step D0 — Decisions Before Source Coding

Produce an ADR for hosting and a source-access matrix. Obtain: BACnet object map, Modbus register map/scaling, PME export/API details, Johnson Controls access method, Archibus extract format, timezone, polling cadence, historical cutover, and volume samples. Use mocks until each interface is confirmed.

## 4. Step D1–D3 — Landing Design

Implement the schema in the catalog, then a single replayable ingestion path before adding more protocols:

1. Read fixture/window.
2. Validate envelope and map source asset/meter.
3. Create `fm_ingestion_run`.
4. Calculate `record_hash`.
5. Append the immutable Bronze envelope.
6. Process accepted Bronze rows into Silver and publish current operational state where required.
7. Record counts, rejects, watermarks, retries, and elapsed time.
8. Re-run the same fixture and prove no duplicate Bronze, Silver, or operational rows.

Do not build three protocol implementations in parallel before this path is proven.

## 5. Step D4–D5 — Transformations

Use an approved background .NET/C# worker as the default telemetry transformation engine. ADF with self-hosted integration runtime is an optional batch/file path only after the Azure/network/licensing gate; Power Automate remains appropriate for low-volume operational orchestration. Keep transformations deterministic with a bounded watermark and replay mode. Separate technical validation from business interpretation. Publish Gold only after Silver reconciliation passes. Keep data-quality issues actionable: rule, record, severity, owner, status, and evidence.

## 6. Step D6 — Reporting Pilot

Start with water hourly/daily/monthly trend and campus/building/meter filters, then add power/PQM. Add the seven FM KPI domains only after source mappings and KPI formulas are approved. Measure source freshness, pipeline completion, and visual render time separately.

## 7. Step D7 — Workflows and Capture

Implement the reusable request state machine first, then configure CIWG, risk, and projects. Add email templates and escalation timers after approver roles are agreed. Checklist templates must be data-driven; manual readings use QR first and typed asset ID fallback. Network failure returns a retryable error; no local offline cache is required.

## 8. Test Gates

- Gate A: schema and security tests pass.
- Gate B: replay/idempotency and source-contract tests pass.
- Gate C: Bronze/Silver/Gold reconciliation passes with no critical issue.
- Gate D: RLS, workflow, email, checklist, QR, and typed-ID tests pass.
- Gate E: historical migration dry run and rollback are accepted.
- Gate F: UAT and performance/freshness evidence are signed off.

## 9. Definition of Ready for the Next Dev Story

The story has requirement IDs, acceptance criteria, test data, source/interface decision or mock, environment target, security role, dependencies, and rollback approach. If one is missing, keep it in discovery/blocked status instead of coding an irreversible assumption.
