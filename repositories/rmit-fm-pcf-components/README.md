# RMIT FM PCF Components

Client-side custom UI controls implemented with Power Apps Component Framework, TypeScript and the supported Node.js toolchain.

## Boundary

- One `pcfproj` per code component.
- One `RMITFM_UIComponents.cdsproj` solution project may reference multiple approved `pcfproj` projects.
- Components must remain host-aware, responsive and accessible.
- Standard Power Apps controls are preferred when they meet the acceptance criteria.

This repository does not contain Dataverse server plug-ins or external integration services.

Do not create QR, asset lookup or checklist controls until the approved UX and supported standard-control gap are documented.
