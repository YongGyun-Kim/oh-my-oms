import { canonicalJson } from '@oms/contracts';
import { modelDefinition } from './model-catalog.js';
import type { ModelData } from './model-catalog.js';
function projection(model: string, data: ModelData, ignored: readonly string[] = []): ModelData {
  return Object.fromEntries(
    modelDefinition(model)
      .attributes.filter(
        (attribute) =>
          !ignored.includes(attribute.name) &&
          data[attribute.name] !== undefined &&
          (attribute.required || data[attribute.name] !== null),
      )
      .map((attribute) => [attribute.name, data[attribute.name]]),
  );
}
export function sameSessionAuthority(left: ModelData | null, right: ModelData | null): boolean {
  return (
    !!left &&
    !!right &&
    canonicalJson(projection('IdentitySession', left, ['revision', 'lastActiveAt'])) ===
      canonicalJson(projection('IdentitySession', right, ['revision', 'lastActiveAt']))
  );
}
export function currentSecurityMatches(
  model: string,
  visible: ModelData | null,
  raw: ModelData | null,
): boolean {
  if (!visible || !raw) return visible === raw;
  if (model !== 'IdentitySession')
    return canonicalJson(projection(model, visible)) === canonicalJson(projection(model, raw));
  const active = Date.parse(String(raw.lastActiveAt));
  const previous = Date.parse(String(visible.lastActiveAt));
  const deadline = Date.parse(String(visible.deadlineAt));
  // A primary-only heartbeat never extends authoritative idle time: callers
  // still receive the previous protected lastActiveAt. Every other field must
  // match, even when a direct mutation failed to increment revision.
  return (
    sameSessionAuthority(visible, raw) &&
    Number(raw.revision) >= Number(visible.revision) &&
    Number.isFinite(active) &&
    Number.isFinite(previous) &&
    active >= previous &&
    active <= deadline
  );
}
