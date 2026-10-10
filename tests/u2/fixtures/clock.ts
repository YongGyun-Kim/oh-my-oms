export class SyntheticClock {
  constructor(private milliseconds = Date.parse('2026-10-09T00:00:00.000Z')) {}
  readonly now = (): Date => new Date(this.milliseconds);
  advance(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
      throw new Error('합성 시계는 유한 비음수 정수만 전진할 수 있습니다.');
    this.milliseconds += milliseconds;
  }
}
