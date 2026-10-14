import { OmsError } from '@oms/contracts';
import type { ObservationOutcome } from '@oms/contracts';
import { QueuePublishFailure } from './queue.js';
export function workerFailureOutcome(error: unknown): ObservationOutcome {
  if (error instanceof QueuePublishFailure)
    return error.outcome === 'UNKNOWN' ? 'UNKNOWN_EXTERNAL' : 'TECHNICAL_FAILURE';
  if (error instanceof OmsError) {
    if (
      error.code === 'PUBLISH_OUTCOME_UNKNOWN' ||
      error.code === 'EXTERNAL_ORIGINAL_RECONCILIATION'
    )
      return 'UNKNOWN_EXTERNAL';
    if (error.status === 401 || error.status === 403) return 'ACCESS_REFUSAL';
    if (error.status === 404) return 'NON_DISCLOSURE';
    if (error.status === 429) return 'OVERLOADED';
    if (error.status >= 500) return 'TECHNICAL_FAILURE';
    return 'BUSINESS_REFUSAL';
  }
  return 'TECHNICAL_FAILURE';
}
