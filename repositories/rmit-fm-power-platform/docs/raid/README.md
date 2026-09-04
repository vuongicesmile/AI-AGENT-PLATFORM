# RAID Log

Record risks, assumptions, issues and dependencies here. Do not silently resolve requirement conflicts or production architecture gates.

## Utility cost batch demo entries

| ID | Type | Statement | Status / owner |
|---|---|---|---|
| A-DEMO-01 | Assumption | SharePoint Online represents an approved, human-managed batch handoff only; it is not the telemetry system of record. | Demo assumption; Product Owner/architect to confirm any production batch source |
| A-DEMO-02 | Assumption | Synthetic tariffs of 2,300 VND/kWh and 15,000 VND/m3 plus `consumption × rate` are used only to demonstrate joins and aggregation. | `MOCK_NOT_APPROVED`; business owner decision required |
| R-DEMO-01 | Risk | Using Power Automate to parse vendor CSV at scale may fail on complex CSV, throughput, service-protection or licensing constraints. | Open; profile real files/volume and select approved .NET parser/worker path |
| R-DEMO-02 | Risk | Source-record hash may treat a legitimate correction/reset as a duplicate or a new fact without explicit version/correction rules. | Open; data owner must approve keys and reload/correction procedure |
| D-DEMO-01 | Dependency | Physical Dataverse schema, Model-driven App, Cloud Flow, Custom API and Power BI require the approved Dev environment, Publisher, capacity, connection references and security roles. | Gated by architecture decision; no environment write performed |
| I-DEMO-01 | Issue | One-minute versus five-minute dashboard freshness statements remain inconsistent for formal acceptance despite the Summary's final five-minute answer. | Open acceptance criterion; do not close from demo evidence |
