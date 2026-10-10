export type ObservationOutcome =
  | 'SUCCESS'
  | 'ACCEPTED_NOT_COMPLETED'
  | 'ACCESS_REFUSAL'
  | 'BUSINESS_REFUSAL'
  | 'NON_DISCLOSURE'
  | 'OVERLOADED'
  | 'TECHNICAL_FAILURE'
  | 'UNKNOWN_EXTERNAL';
export interface ObservationCompletion {
  outcome: ObservationOutcome;
  status?: number;
  knowledge?: readonly string[];
  eligibleDelayMilliseconds?: number;
}
export interface Observation {
  finish(metadata: ObservationCompletion): void;
}
export interface ObservationPort {
  begin(
    role: 'api' | 'worker' | 'customer-web' | 'staff-web',
    audience: string,
    operation: string,
    correlationId: string,
  ): Observation;
}
