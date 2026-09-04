# Plug-in Pipeline

The eventual CI pipeline must:

1. restore pinned dependencies;
2. build Release configuration;
3. run unit and approved integration tests;
4. create the plug-in NuGet package;
5. assemble and validate `RMITFM_ServerExtensions` from source;
6. run Solution Checker and dependency checks;
7. publish managed/unmanaged solution artifacts with version and commit SHA.

Pull-request validation must not write to Test or Production.
