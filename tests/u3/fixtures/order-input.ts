import { declareU3Operations, OperationRegistry, SchemaValidator } from '@oms/contracts';
import type {
  Ref,
  TargetScope,
  U3OrderInput,
  U3OrderQuery,
  U3OrderDecisionInput,
  U3ApplyOrderChangeInput,
} from '@oms/contracts';

const schema = new SchemaValidator(),
  registry = new OperationRegistry(schema);
declareU3Operations(registry);
export function registeredOrderInput<T>(
  operation: 'submitOrder' | 'decideOrder' | 'applyApprovedChange' | 'readAcceptedOrder',
  input: T,
): T {
  return schema.validateUri<T>(registry.lookup('OrderAcceptance', operation, 3).input, input);
}
export function orderQuery(targetRef: Ref, targetScope: TargetScope): U3OrderQuery {
  return registeredOrderInput('readAcceptedOrder', { targetRef, targetScope });
}
export type RegisteredOrderCommand = U3OrderInput | U3OrderDecisionInput | U3ApplyOrderChangeInput;
