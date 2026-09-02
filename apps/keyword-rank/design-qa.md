# Design QA archive

The original visual-comparison captures belonged to the external development
workspace and are intentionally not copied into this repository as build
inputs. The source project retains the approved desktop-first layout and data
density; this migration does not redesign the UI.

For current, reproducible checks run from the repository root:

```powershell
npm run build
npm run release:web -- --output <temporary-output-directory>
npm run verify:web -- --dir <temporary-output-directory>
```

The smoke check verifies a rendered desktop viewport, all five app views,
product rows, IndexedDB bridge methods, settings enhancement controls, and
absence of browser console/page errors. Historical screenshot files remain
outside the release source boundary by design.
