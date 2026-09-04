# RMIT FM Analytics

Source-controlled Power BI semantic models, reports and approved visual themes.

Use Power BI Project (PBIP) source artifacts rather than treating a PBIX binary as the source of truth. Connection mode, refresh cadence and performance test profile remain architecture decisions.

The model must use the Dataverse connector, explicit measures, a conformed date dimension, consistent campus/building/asset dimensions, documented units and RLS where required.

The utility-cost proof of concept includes a non-deployable [report blueprint](docs/demo/utility-cost-report.md) and draft DAX/Power Query contracts under `src/demo/utility-cost`. A PBIP project remains gated by the approved Dataverse environment, connection mode, RLS and KPI decisions.
