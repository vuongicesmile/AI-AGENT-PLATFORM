# RMIT FM Power Platform

Source of truth for Power Platform low-code artifacts, Dataverse data-model metadata, project architecture and traceability.

## Solution ownership

- `RMITFM_DataModel` exclusively owns Tables, Columns, Relationships, Choices, Keys and shared Security Role definitions.
- `RMITFM_AppsAutomation` owns Power Apps, Power Automate flows, Connection References and Environment Variable definitions.
- `RMITFM_ServerExtensions` is built by `rmit-fm-dataverse-plugins`.
- `RMITFM_UIComponents` is built by `rmit-fm-pcf-components`.

The last two solutions are dependencies, not duplicated compiled source in this repository.

## Scaffold status

The directories under `solutions/` are placeholders only. Do not hand-author `solution.yml` or `publisher.yml`. Generate/synchronize them with a supported Power Platform CLI after RMIT confirms the Dataverse development environment and Publisher prefix.

## Deployment order

1. `RMITFM_DataModel`
2. `RMITFM_ServerExtensions`
3. `RMITFM_UIComponents`
4. `RMITFM_AppsAutomation`
5. Power BI artifacts from `rmit-fm-analytics`

Configuration/reference Rows and historical/business data use separate migration and reconciliation processes; a Solution import does not migrate those Rows.

## Local demo

The [SPO → Dataverse Utility Cost Demo](docs/demo/spo-utility-cost-demo.md) documents a runnable synthetic pipeline plus non-deployable Cloud Flow, Dataverse and Model-driven App blueprints. It does not select or modify a Power Platform environment.
