This repository has been reorganized into a minimal `src/` layout to make the codebase easier to split.

Structure:

- src/core      - pure logic modules (no DOM access)
- src/ui        - DOM rendering and event wiring
- src/adapters  - adapters for external systems (OBS, recorders, storage)
- src/features  - higher-level feature bundles (script viewer, scroll logic)

This change only creates folders and placeholder loader. The existing legacy single-file app lives at the project root (e.g. `teleprompter_pro.js`).

Migration guidance:
1. Identify pure logic functions in `teleprompter_pro.js` and move to `src/core`.
2. Move DOM-handling code (querySelector, event listeners) to `src/ui`.
3. Break adapters into separate files in `src/adapters`.
4. Group related features into `src/features`.

The provided `index.js` is a simple loader that preserves existing behavior by injecting the legacy scripts in order. After migration, replace the loader with ES module imports or a bundler entry.
