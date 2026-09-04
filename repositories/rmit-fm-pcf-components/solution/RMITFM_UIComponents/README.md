# RMITFM_UIComponents

Create `RMITFM_UIComponents.cdsproj` with `pac solution init` only after the shared Publisher is approved. Add each PCF project using `pac solution add-reference`.

Build the solution in Release/production mode. Apps that consume a component must depend on this solution and must be updated/published when the component version changes.
