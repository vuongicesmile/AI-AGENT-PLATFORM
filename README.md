# RMIT FM Delivery Workspace

This directory is a local workspace for the repositories that deliver the RMIT FM Data & Automation Platform. It is intentionally not a super-repository and does not use Git submodules.

## Repository map

| Repository | Deployable boundary |
|---|---|
| `rmit-fm-power-platform` | Dataverse schema, Power Apps, Power Automate, ALM metadata, architecture and traceability |
| `rmit-fm-dataverse-plugins` | Server-side Dataverse C# plug-ins and Custom API handlers |
| `rmit-fm-pcf-components` | Client-side Power Apps Component Framework controls |
| `rmit-fm-integrations` | External .NET integration workers and source adapters |
| `rmit-fm-analytics` | Power BI PBIP semantic models, reports and themes |

The canonical project instructions remain in [`AGENTS.md`](AGENTS.md) and apply to every repository in this workspace.

No remote repository, Power Platform environment, Publisher, credential or production deployment is configured by this scaffold.
