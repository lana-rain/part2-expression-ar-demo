import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

// Validation inputs are useful in local development but are intentionally not
// part of the public live demo. Older cloud drafts are likewise not loaded.
await rm(join(dist, 'validation'), { recursive: true, force: true });
for (const name of [
  'smile-rain-cloud-luminous.png',
  'smile-rain-cloud-premium.png',
  'smile-rain-cloud.png',
]) {
  await rm(join(dist, 'effects', name), { force: true });
}
