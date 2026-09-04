# Utility Cost File-Pipeline Demo

Runnable, dependency-free local simulator for a proposed SharePoint Online file handoff into Dataverse Bronze/Silver/Gold logical tables.

## Start

```bash
npm test
npm start
```

Open `http://127.0.0.1:4173`.

## What is executable

- file extension, size, duplicate-file, mapping, required-field and content checks;
- config-driven parsing of three CSV shapes and one JSON shape;
- deterministic file and source-record hashes;
- immutable in-memory Bronze records with raw payload and lineage;
- meter → building → campus relationship resolution;
- timestamp, value, unit, quality, duplicate, negative-delta, gap and outlier rules;
- Silver quarantine and DQ observations;
- VALID-only daily Gold consumption and illustrative cost;
- a local API and responsive review UI.

## What is simulated

SharePoint, Cloud Flow, Dataverse, plug-ins/Custom API, Model-driven App and Power BI are represented by their contracts and observable outputs. This demo performs no authentication and no external write. It is not a production Node.js runtime decision; .NET/C# remains preferred for an approved durable integration service.

The mock tariff and formula are explicitly `MOCK_NOT_APPROVED`.

See the [full demo design](../../../rmit-fm-power-platform/docs/demo/spo-utility-cost-demo.md) and [ADR-0003](../../../rmit-fm-power-platform/docs/adr/ADR-0003-sharepoint-utility-batch-demo.md).
