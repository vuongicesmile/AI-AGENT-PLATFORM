# RMIT FM Dataverse Plug-ins

Server-side Dataverse extensions implemented in C#/.NET Framework and executed by the Dataverse event pipeline.

## Boundary

This repository owns:

- plug-in source and tests;
- approved server-side Custom API handlers;
- plug-in package build configuration;
- registration metadata for packages, assemblies, steps and images;
- the `RMITFM_ServerExtensions` solution artifact.

It does not own Dataverse Tables, Power Apps, Power Automate flows, PCF controls or external integration workers.

## Scaffold rule

Create the **deployable** plug-in package with `pac plugin init` after confirming the supported Dataverse target framework and package/signing approach. The current `net8.0` class library under `src/Rmit.Fm.Dataverse.Plugins` holds testable Custom API business logic (Sales Gold) and must be merged into / referenced from the Pac-generated package before Dataverse registration. It is not itself the sandboxed production assembly.

No plug-in should encode unapproved KPI formulas, approval routes, retention policies, source interfaces or credentials.

## Sales MVP (plan.md)

| Custom API | Plugin type | Registration blueprint |
|---|---|---|
| `sdp_CalculateSalesGold` | `SalesDataPlugin.CreateSalesGold` | `registration/steps/sdp_CalculateSalesGold.json` |

```bash
dotnet test
```
