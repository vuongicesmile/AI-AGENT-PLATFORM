# Dataverse Solution Source

This folder will become the root of the Power Platform YAML source-control layout.

Do not create the manifests until all of the following are confirmed:

- target Dataverse development environment;
- Solution Publisher and customization prefix;
- solution binding/environment binding approach;
- owning solution for every component.

Generated folders such as `entities/`, `modernflows/`, `canvasapps/`, `environmentvariabledefinitions/` and `connectionreferences/` will be added by the supported Dataverse Git/PAC synchronization flow when components exist.
