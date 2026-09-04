# PCF Pipeline

The eventual CI pipeline must:

1. run `npm ci` for each component;
2. lint and test TypeScript;
3. build PCF controls in production mode;
4. synchronize component and solution versions;
5. build `RMITFM_UIComponents.cdsproj` in Release mode;
6. run Solution Checker and dependency validation;
7. publish solution ZIP files as immutable artifacts, not Git content.
