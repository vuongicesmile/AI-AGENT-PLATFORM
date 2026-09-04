# Utility Cost Power BI Demo Blueprint

**Status:** Semantic-model design only; no PBIP is created because the Dev environment, table logical names, connection mode, refresh cadence, RLS and tariff business rules are not approved.

## Serving contract

Use the Dataverse connector and consume:

- `fm_gold_utilitydailycost` as the reporting fact;
- `fm_campus`, `fm_building` and `fm_meter` as conformed dimensions;
- a proper Date dimension related to `fm_gold_utilitydailycost[fm_localdate]`;
- `fm_dataqualityissue` and `fm_ingestionrun` for operational monitoring, not blended into billing totals.

The report page should expose Campus, Building, Meter/Utility and Date filters. Cost visuals must show formula/tariff status so mock or unapproved figures cannot look authoritative.

## Proposed page

| Visual | Data | Acceptance note |
|---|---|---|
| Total utility cost | Explicit `[Total Utility Cost VND]` | Must show currency and tariff/formula status |
| Electricity consumption | `[Electricity Consumption kWh]` by Date | `VALID` Gold source rows only |
| Water consumption | `[Water Consumption m3]` by Date and source/meter | Separate manual and automated meters when required |
| Cost by utility | `[Total Utility Cost VND]` by Utility Type | No inferred allocation across buildings |
| DQ banner | Open error/critical count and last successful run | Freshness and render time are separate metrics |
| Detail matrix | Campus → Building → Meter → Date | Supports trace back to Gold row and run |

## Connection decision

Microsoft guidance recommends Import where possible and offers DirectQuery for real-time retrieval/more direct Dataverse security behavior. The project must select the mode only after the five-minute provisional freshness target, the conflicting manual-refresh statement, Dataverse capacity, TDS endpoint/network availability, model volume and RLS test profile are agreed.

Reference: [Create a Power BI report using the Microsoft Dataverse connector](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-powerbi-connector).

## Security and evidence

- Enforce Dataverse privileges and semantic-model RLS; hiding a page or filter is not authorization.
- Use synthetic data until data classification and approved non-production extracts exist.
- Measure source-to-report freshness separately from page render time.
- Do not claim `<3 seconds` or `<=5 minutes` from this local demo.
- Reconcile Power BI totals to the Gold table for the same filters before UAT acceptance.
