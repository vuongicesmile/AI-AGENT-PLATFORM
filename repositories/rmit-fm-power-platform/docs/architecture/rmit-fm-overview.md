# RMIT FM Data & Automation Platform — Solution Overview

**Document Type**: Solution Overview
**Version**: 0.1
**Status**: Dev design draft
**Sources**: `FM_Requirement_and_Techincal_Solution.pdf`, `RMIT FDTAP - Summary (1).pdf`

## 1. Outcome

RMIT needs one governed FM data and workflow platform across on-premises Johnson Controls BMS, Schneider PME, Archibus, manual meter readings, checklists, and FM processes. The Dev design establishes stable contracts and testable medallion layers before production hosting is approved.

## 2. In Scope

- Water, power, and power-quality ingestion.
- Historical data migration and reconciliation.
- Dataverse operational entities/Data Central.
- Bronze → Silver → Gold logical data contracts implemented as Dataverse tables.
- CIWG, risk-register, and FM-project workflows.
- Digital checklist and manual meter forms with QR plus asset-ID fallback.
- Power BI semantic/reporting model and centralized FM experience.

## 3. Constraints

The source systems are on premises; BACnet/IP and Modbus are confirmed protocols; roughly 20 meters/feeders and 30 users are expected. Email is the approved notification channel. Offline entry is not required. Current manual scope is two water meters and 14 checklists, with design capacity for five equipment items and 20 checklists.

Fabric/OneLake is removed from this phase. Dataverse/Power Platform is the selected implementation direction, subject to tenant, licensing, capacity, gateway and network approval.

## 4. Success Measures

- Every source record is traceable from source → ingestion run → Bronze → Silver → Gold/report.
- Ingestion is restartable and idempotent; rejected records are quarantined and visible.
- Historical migration has profiled mappings, dry-run reconciliation, and a signed cutoff/delta plan.
- Dashboard freshness is measured separately from render time. Five minutes is a provisional upper bound; the one-minute manual-refresh statement remains unresolved.
- Main dashboard render target is less than three seconds under a documented test profile.
