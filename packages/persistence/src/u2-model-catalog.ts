import { readFileSync } from 'node:fs';
import type { Model } from './model-catalog.js';

export const U2_MODELS: readonly Model[] = Object.freeze(
  (
    JSON.parse(readFileSync(new URL('../models/u2-v1.json', import.meta.url), 'utf8')) as {
      entities: Model[];
    }
  ).entities,
);
