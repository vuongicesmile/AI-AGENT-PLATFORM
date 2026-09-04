# ADR-0001: Repository and Solution Segmentation

- **Status:** Accepted for development scaffold
- **Date:** 2026-09-03
- **Decision owner:** Project delivery team; production ALM approval remains with RMIT
- **Related requirements:** FR-0.1, FR-0.2, FR-0.3, NFR-3, NFR-5, NFR-6, NFR-7, NFR-8

## Context

The platform combines maker-authored Power Platform metadata, Dataverse server extensions, browser-hosted PCF controls, external on-premises integration services and Power BI artifacts. These workloads use different toolchains and deployment boundaries.

Directly committing compiled Dataverse plug-in or PCF output alongside its source creates two competing sources of truth. Conversely, creating one repository per plug-in class, control, flow or report would create unnecessary release and dependency overhead.

The original design placed Cloud flows, Custom APIs and plug-in assemblies together in `RMITFM_DataProcessing`. The approved development scaffold refines that boundary so code-first extensions can be built from their own source repositories.

## Decision

Use five repositories:

1. `rmit-fm-power-platform` for Dataverse data-model and maker-authored solution metadata.
2. `rmit-fm-dataverse-plugins` for C#/.NET Framework plug-ins and server-side Custom API handlers.
3. `rmit-fm-pcf-components` for TypeScript PCF controls.
4. `rmit-fm-integrations` for external .NET workers and source adapters.
5. `rmit-fm-analytics` for Power BI PBIP artifacts.

Use these Dataverse solution boundaries:

- `RMITFM_DataModel`: sole owner of all project Tables and shared schema components.
- `RMITFM_ServerExtensions`: plug-in package, assemblies, steps, images and server-side Custom API handlers.
- `RMITFM_UIComponents`: independently built PCF code components.
- `RMITFM_AppsAutomation`: apps, flows, Connection References and Environment Variable definitions.

The required import order is DataModel, ServerExtensions/UIComponents, then AppsAutomation. All solutions must use the same approved Publisher. Code-first repositories produce versioned solution artifacts in CI; generated binaries and Solution ZIP files are not source-controlled.

## Consequences

- Plug-ins and PCF controls can use their native build/test toolchains and version lifecycle.
- Solution dependencies and import order become explicit and require automated validation.
- App-specific components should not be moved into the shared component solutions unless independent reuse/versioning is justified.
- The project needs a cross-repository release manifest for reproducible deployments.
- More repositories increase governance overhead, so new repositories require an additional deployable or ownership boundary.

## Deferred decisions

- Git provider and remote organization/project.
- Power Platform environment binding versus solution binding.
- final Publisher and customization prefix.
- production environment, licensing/capacity, region and retention.
- integration host, gateway topology and OT/IT network path.
- Power BI connection mode and deployment pipeline.
