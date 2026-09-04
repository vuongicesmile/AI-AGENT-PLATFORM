# RMIT FM Data & Automation Platform — Agent Instructions

## Purpose

Work as a delivery agent for RMIT Vietnam's Facilities Management (FM) Data & Automation Platform. Keep every design, implementation, test, and document traceable to:

- `FM_Requirement_and_Techincal_Solution.pdf` — proposed SRS breakdown, architecture, epics, and delivery plan.
- `RMIT FDTAP - Summary (1).pdf` — later stakeholder clarifications and operational constraints.

Treat the Summary as the stronger source when it explicitly clarifies or overrides the proposed solution. Do not silently resolve contradictions; record them as an assumption, risk, or architecture decision and ask the Product Owner when the answer changes scope, cost, security, hosting, or acceptance criteria.

## Communication and Working Style

- Reply in Vietnamese when the user writes in Vietnamese; keep product names, code, schema names, requirement IDs, and technical terms in English.
- Lead with the outcome. State assumptions and unresolved decisions explicitly.
- Inspect the repository and relevant requirements before editing. Preserve unrelated user changes.
- Prefer small, reviewable, configuration-driven changes over speculative frameworks.
- For meaningful work, report: files changed, verification performed, mapped FR/NFR IDs, assumptions, and remaining risks.
- Never invent credentials, endpoints, data volumes, licenses, tenant capabilities, business rules, KPI formulas, approval routes, or source-system interfaces.

## Project Outcome

Deliver a secure, auditable, maintainable FM platform that:

1. Integrates utilities data from on-premises BMS and PME systems.
2. Supports digital checklists and manual meter readings.
3. Automates CIWG, risk-register, and FM-project approval workflows.
4. Produces governed Bronze/Silver/Gold logical layers as Dataverse tables and Power BI reporting.
5. Centralizes one main dashboard and eight sub-pages/reports into a role-aware FM experience.
6. Supports historical migration and future expansion without redesign.

## Known Stakeholder Constraints

Use these facts unless a newer approved decision supersedes them:

- BMS: Johnson Controls, on premises.
- PME: Schneider, on premises, approximately 20 monitored meters/feeders.
- CMMS: Archibus. Its interface, export method, record count, and volume are not yet confirmed.
- Source protocols confirmed: BACnet/IP and Modbus. Do not assume REST, SQL, OPC-UA, or vendor APIs are available.
- Fabric/OneLake is not in scope for this phase; it was only a suggestion in the original technical proposal. Use Dataverse tables for the logical Bronze/Silver/Gold layers.
- Dataverse/Power Platform tenant, licensing, environment region, capacity and on-premises gateway/network path still require RMIT approval.
- Notifications: email only. Do not add Microsoft Teams notifications unless RMIT changes this decision.
- Users: approximately 30.
- Other IoT platforms/sensors: none currently identified.
- Manual scope: two water meters and 14 checklists today; design capacity for at least five offline equipment items and 20 checklists.
- Equipment identification: QR code with a human-entered equipment/asset ID fallback.
- Offline app operation: not required. Do not implement local caching/sync solely from FR-5.2 without a new decision.
- Historical data migration: required.
- Backend preference: .NET/C# preferred; Java is acceptable when justified. Python remains suitable for narrowly scoped integration/data tasks when approved.
- Data loss: target less than 1–2%; any breach must trigger investigation and corrective action. Obtain an exact acceptance formula before formal SLA testing.
- Dashboard freshness: stakeholder answers conflict between a final five-minute target and a one-minute maximum after manual refresh. Use `<=5 minutes` only as a provisional upper bound and track the one-minute statement as an unresolved acceptance criterion.
- Dashboard rendering performance remains less than three seconds under agreed normal-load conditions; define the test page, filters, network, data volume, cache state, and percentile before claiming compliance.

## Architecture Decision Gate

Fabric/OneLake and Link to Microsoft Fabric are explicitly removed from this phase. The Medallion pattern remains a logical separation implemented with Dataverse tables and Power Platform automation.

Before implementing production, create or update an ADR that confirms:

- Power Platform tenant, Dataverse environment, licensing/capacity, region and retention;
- on-premises data gateway or approved .NET/C# integration host for BMS/PME;
- OT/IT segmentation, outbound connectivity, firewall, gateway HA, service accounts, and credential ownership;
- data residency, recovery, audit, RPO/RTO, security and expected volume/cost envelope;
- Power BI connection mode, refresh cadence and performance test profile.

Dataverse is the selected Data Central for this phase. Do not expose BACnet or Modbus directly to the public internet.

## Requirement and Delivery Discipline

- Map work to the canonical IDs `FR-0.1`–`FR-8.3` and `NFR-1`–`NFR-8` from the requirements PDF.
- When the Summary changes a requirement, add a named constraint or decision beside the original ID. Examples: email-only changes FR-3.3; no offline mode changes FR-5.2; historical migration extends the original scope.
- Maintain a traceability record for requirement -> decision -> implementation artifact -> test/evidence -> status.
- Use MoSCoW priority, but do not drop a Must requirement without written Product Owner approval.
- Follow Definition of Ready: acceptance criteria understood, access or mock agreed, UI reference available, dependencies identified.
- Follow Definition of Done: peer-reviewed, deployed/tested in the appropriate non-production environment, acceptance criteria verified, data-quality checks passed, documentation updated, and new RAID items recorded.
- Treat the 12-sprint roadmap and dates as indicative. Verify current status and dependencies before planning against them.

## Data and Integration Rules

- Preserve source timestamps, timezone, source system, asset/meter ID, unit, value, quality/status, ingestion timestamp, and correlation/batch ID.
- Make ingestion restartable and idempotent. Define natural/deduplication keys and checkpoint/watermark behavior.
- Keep raw data immutable in Dataverse Bronze tables; do not use Fabric/OneLake for this phase.
- Silver must perform schema validation, unit normalization, duplicate detection, range checks, missing-interval detection, and sensor/outlier handling. Quarantine invalid records; do not silently discard or overwrite them.
- Gold contains documented business aggregates and KPI calculations as Dataverse tables, including hourly/daily/monthly utility rollups where required.
- Reconcile record counts and critical totals at each boundary. Instrument freshness, completeness, rejected records, retries, and data-loss rate.
- Historical migration requires profiling, mapping, deduplication, reconciliation, cutoff/delta strategy, dry run, sign-off, and rollback/reload procedure.
- For BACnet/IP and Modbus, confirm transport variant, addressing, register/object maps, units/scaling, timestamp ownership, polling limitations, and vendor-supported access before coding.
- Prefer .NET/C# for durable custom integration services. Use Java only with a recorded rationale and operational ownership. Never assume a custom service is necessary before checking supported connectors/gateways and vendor export options.
- Store secrets in an approved secret store or connection reference. Never commit passwords, tokens, certificates, tenant IDs, private endpoints, or production data.

## Power Platform and Application Rules

- Keep Power Platform artifacts solution-aware and ready for Dev -> Test -> Prod ALM.
- Use environment variables, connection references, least-privilege service principals/accounts, DLP policies, and role-based security.
- Make checklist templates, validation ranges, units, schedules, approval steps, approver roles, reminders, and escalations configuration-driven.
- Preserve immutable audit history for workflow actions and manual submissions: who, what, when, previous state, new state, and comments.
- Manual meter forms must support QR scanning and typed asset-ID fallback, validate that the resolved asset is active/authorized, and mark readings with `source = manual`.
- Because offline operation is not required, design for clear network-error handling and safe retry rather than local offline synchronization.
- Send workflow notifications by email. Templates should include record identity, status, actor, due date, action link, and correlation information without leaking restricted data.
- Enforce access in Dataverse/data/semantic-model layers, not only by hiding UI controls.

## Analytics and UX Rules

- Power BI models must use the Dataverse connector, explicit measures, a conformed date dimension, consistent campus/building/asset dimensions, documented units, and row-level security where required.
- Use standard global filters for campus, building, asset/meter, and date range where the model supports them.
- Required reporting domains include water; energy and power quality; CAPEX; OHS/compliance; equipment/calibration; training/skills; overtime; vendor KPIs; and incidents/near-misses/recognition.
- Define baseline/target ownership and KPI formulas with the Product Owner; do not infer business definitions from chart labels.
- Apply RMIT-approved branding and accessible color contrast/font sizing. Validate mobile-responsive forms and dashboards.
- Measure freshness separately from visual render time. A successful refresh does not prove source-to-report freshness, and a sub-three-second render does not prove the freshness SLA.

## Testing and Evidence

- Unit-test transformation and business rules with normal, boundary, duplicate, missing, stale, out-of-order, invalid-unit, and retry cases.
- Add integration/contract tests around external boundaries and use sanitized fixtures or mocks when access is unavailable.
- Verify idempotency, checkpoint recovery, late-arriving data, daylight-saving/timezone behavior, reconciliation, and alerting.
- Test RBAC/RLS with positive and negative cases for technicians, engineers, managers, executives, vendors, and admins as applicable.
- Test workflow approve, reject, modify/resubmit, overdue, escalation, duplicate action, and notification-failure paths.
- Performance claims require reproducible measurements and stated conditions. Never declare an FR/NFR complete from code inspection alone.
- Do not use real personal, HR, safety, vendor, credential, or production telemetry data in committed fixtures.

## Documentation Artifacts

Create or maintain only what the task needs, using existing repository conventions when they emerge:

- ADRs for hosting, system of record, integration path, latency, retention, portal choice, and other consequential decisions.
- Data dictionary and source-to-target mappings.
- Interface contracts and runbooks for BMS, PME, Archibus, gateways, and custom services.
- Requirement traceability matrix and RAID log.
- Deployment, rollback, monitoring, support, user, and admin documentation.
- Mermaid diagrams for architecture, sequence, workflow, data lineage, and state transitions.

## Installed Skill Routing

Use the smallest relevant set of installed skills and follow each skill's own instructions before acting:

- `microsoft-docs`: verify current Microsoft guidance, limitations, licensing-sensitive behavior, and recommended patterns for Power Platform, Dataverse, Power BI, Power Automate, Power Pages, Entra ID, gateways, and .NET. Fabric is out of scope for this phase.
- `msgraph`: discover and implement Microsoft Graph endpoints, schemas, permissions, and samples. Do not use Graph when a first-party Power Platform connector or Dataverse API is the correct boundary.
- `dv-connect`: set up, switch, authenticate, or troubleshoot a Dataverse MCP environment. Never commit the generated `.env`; confirm the target environment before writes.
- `power-apps-code-app-scaffold`: scaffold a Power Apps Code App when the approved UX requires one. Do not invoke it merely for a standard canvas/model-driven app.
- `power-platform-mcp-connector-suite`: build or validate a Power Platform custom connector with MCP/Copilot Studio integration when that architecture is explicitly selected.
- `solution-architect`: use for requested business overview, technical architecture, and implementation-plan deliverables based on these requirements.
- `mermaid-diagrams`: use for requested diagrams and for boxes-and-arrows documentation; do not draw ASCII diagrams.
- `frontend-design`: use when creating or materially redesigning the FM Portal, Code App, or other custom web UI.
- `fastapi`: use only if an approved Python integration/API is implemented with FastAPI.
- `code-documentation-code-explain`: use when the user requests a detailed code explanation or educational walkthrough.
- `refactor-plan`: use before a requested multi-file refactor; investigate, present the plan, and wait for confirmation as the skill requires.
- `imagegen`: use only for appropriate raster visual assets, never for architecture diagrams or repo-native UI that should be implemented in code.
- `openai-docs`: use for questions about Codex, OpenAI APIs/products, configuration, models, or agent behavior.
- `find-skills`, `skill-installer`, `skill-creator`, `plugin-creator`, and `plugin-management:plugin-management`: use only when the user asks to discover, install, create, update, connect, or remove the corresponding capability.
- `deep-research-work:deep-research`: use only when the user explicitly requests Deep Research.
- `parallel-task`: use only for an explicit `/parallel-task` request.
- `caveman`: use only when the user requests caveman/ultra-compressed communication or explicit token efficiency.

If a skill's output conflicts with project requirements, these project constraints and the user's current instruction win. Record consequential deviations.

## Stop-and-Confirm Conditions

Pause and obtain a decision before:

- selecting the production Power Platform environment, licensing/capacity, gateway topology, or network path;
- treating the one-minute versus five-minute freshness target as resolved;
- choosing a BMS/PME/Archibus extraction interface not confirmed by RMIT/vendor documentation;
- defining KPI formulas, approval matrices, retention periods, RPO/RTO, data classification, or licensing assumptions;
- performing writes in production, destructive data operations, security-policy changes, external notifications, or deployment/go-live actions;
- accepting data loss, reconciliation variance, security exceptions, or performance below the agreed threshold.

For routine local implementation choices that do not cross these boundaries, proceed with a stated reasonable assumption and verify the result.
