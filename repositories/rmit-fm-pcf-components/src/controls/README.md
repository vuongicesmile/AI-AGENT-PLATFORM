# PCF Control Projects

Create each approved component in its own folder using `pac pcf init`:

```text
controls/
  <ComponentName>/
    <ComponentName>.pcfproj
    ControlManifest.Input.xml
    index.ts
    components/
    css/
    tests/
    package.json
    package-lock.json
```

Use the PAC-generated manifest and project files. Never copy a compiled `bundle.js` into source control.
