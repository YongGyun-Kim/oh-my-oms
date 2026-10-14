export class OmsError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OmsError';
  }
}
export function requireCondition(
  value: unknown,
  status: number,
  code: string,
  message: string,
): asserts value {
  if (!value) throw new OmsError(status, code, message);
}
