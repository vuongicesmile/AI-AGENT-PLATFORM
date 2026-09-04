# RMIT FM Integrations

External .NET integration runtime for BMS, PME and approved Archibus extraction paths.

This runtime is distinct from Dataverse plug-ins: it executes on an approved integration host, owns protocol/source connectivity and writes through the canonical ingestion contract.

## Architecture gate

Only placeholders are created. Do not create production service projects or choose hosting until RMIT approves the integration host/gateway topology, OT/IT segmentation, outbound connectivity, firewall path, service-account ownership and recovery requirements.

BACnet/IP and Modbus are confirmed protocols. Their transport/addressing details, object/register maps, scaling, units, polling limits and timestamp ownership remain required before implementation. The Archibus interface remains unconfirmed.

## Local demo

`demo/utility-cost-pipeline` is a runnable, synthetic SharePoint-file/Dataverse-medallion simulator for field-mapping and DQ review. It makes no external write and is not a production Node.js runtime decision.
