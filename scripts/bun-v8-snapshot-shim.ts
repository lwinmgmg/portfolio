// Preloaded by Bun scripts that use the MongoDB driver. BSON probes
// `v8.startupSnapshot.isBuildingSnapshot()` when it loads, and Bun 1.3 throws
// "not yet implemented" there. No Bun process builds a V8 startup snapshot, so `false` is true.
import v8 from "node:v8";

v8.startupSnapshot.isBuildingSnapshot = () => false;
