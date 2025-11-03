// Bridge file so ESLint finds the flat config when it looks for eslint.config.js
// Re-export the real config from eslint.config.cjs
// ESM wrapper for the CommonJS flat config so ESLint can import it when
// package.json declares "type": "module". This uses createRequire to
// load the CJS module and then re-exports it as a default ESM export.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cfg = require('./eslint.config.cjs');
export default cfg;
