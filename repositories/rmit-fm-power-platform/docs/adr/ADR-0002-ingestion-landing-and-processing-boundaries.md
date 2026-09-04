# ADR-0002: Ingestion, Raw Landing and Processing Boundaries

- **Status:** Proposed for development; production selection gated
- **Date:** 2026-09-03
- **Decision owner:** Project delivery team; RMIT approval required for hosting, Azure, gateway and network decisions
- **Related requirements:** FR-0.4, FR-0.5, FR-1.1–FR-1.4, FR-2.1–FR-2.4, NFR-4, NFR-6–NFR-8

## Context

BMS and PME are on premises and expose confirmed BACnet/IP and Modbus protocols. The Archibus extraction interface is not confirmed. The platform must preserve immutable raw records, reconcile every layer and implement logical Bronze/Silver/Gold layers as Dataverse Tables. Fabric/OneLake is out of scope.

SharePoint Online and Azure Data Factory were considered as intermediate cloud services. Adding either component to the mandatory telemetry path would introduce another storage or orchestration boundary without removing the need for an approved on-premises protocol adapter.

## Decision

For the phase-one baseline:

1. Use an approved .NET/C# source adapter/worker for BMS/PME telemetry. It checks source configuration and health, opens an `ingestion_run`, reads a bounded watermark window, validates the common envelope and appends raw Rows directly to Dataverse Bronze over an approved private outbound path.
2. Treat Dataverse Bronze as the first durable telemetry landing boundary. It is source-aligned, append-only and contains the lineage needed for replay and reconciliation.
3. Do not use SharePoint Online as the telemetry raw store or system of record. It may be introduced only for an approved, human-managed batch-file handoff; the ingestion process must still hash, validate and land the file contents or protected reference in Bronze.
4. Do not select Azure Data Factory as a mandatory dependency. ADF with self-hosted integration runtime is an optional batch/file orchestration path after Azure subscription, licensing, identity, firewall, network, availability, monitoring and support ownership are approved.
5. Use background, bounded and replayable processing to promote Bronze to Silver and Silver to Gold. The default telemetry processor is .NET/C#. Power Automate is reserved for low-volume operational orchestration, approvals, reminders and email.
6. Use synchronous Dataverse plug-ins only for small transactional invariants such as Bronze write protection, manual-reading validation, workflow-state validation and immutable audit creation. Plug-ins do not perform bulk Bronze/Silver/Gold transformations.
7. Publish Gold only after critical reconciliation passes. Commit the checkpoint only after the corresponding writes and reconciliation succeed.

## Consequences

- The shortest baseline data path is source adapter → Dataverse Bronze → background Silver processor → reconciliation → Gold processor → Power BI.
- Source health, rejected records, duplicates, retry state, watermark and reconciliation results remain queryable in Dataverse control/DQ Tables.
- A source failure does not advance its checkpoint; retry and replay remain deterministic.
- Dataverse service-protection limits, capacity and API throughput must be included in volume testing before production.
- SharePoint and ADF remain available for a justified batch/file use case without becoming hidden platform dependencies.
- The `RMITFM_DataModel` solution creates layer Tables; `RMITFM_ServerExtensions` supplies lightweight plug-ins; `rmit-fm-integrations` owns adapters and background processors.

## Rejected or deferred alternatives

- **SharePoint Online as raw telemetry landing:** rejected for the baseline because it adds a document/list boundary and is not the selected Data Central.
- **Synchronous plug-ins as the transformation engine:** rejected because per-Row server-side work adds transaction latency and is unsuitable for bulk pipeline processing.
- **Power Automate as the default telemetry ETL engine:** rejected for the baseline; retain it for low-volume workflow and notifications.
- **ADF as the selected production orchestrator:** deferred until an approved batch/file source and the Azure/network/licensing gate justify it.
- **Fabric/OneLake:** out of scope for this phase.

## Open decisions

- Approved integration host, gateway topology, OT/IT segmentation and outbound network path.
- BMS/PME register/object maps, timestamp ownership, polling cadence and vendor-supported access.
- Archibus interface, export format, record count and volume.
- Dataverse environment, capacity, region, retention, RPO/RTO and security model.
- Whether a real batch/file source justifies SharePoint Online intake or ADF.
- Exact KPI formulas and the unresolved one-minute versus five-minute freshness acceptance criterion.

## Microsoft references

- [Create and configure a self-hosted integration runtime](https://learn.microsoft.com/en-us/azure/data-factory/create-self-hosted-integration-runtime?tabs=data-factory)
- [Copy and transform data in Microsoft Dataverse](https://learn.microsoft.com/en-us/azure/data-factory/connector-dynamics-crm-office-365)
- [Dataverse plug-in business-logic best practices](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/best-practices/business-logic/)
- [Optimize Dataverse bulk create and update operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/optimize-performance-create-update)
- [SharePoint Online limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits)
