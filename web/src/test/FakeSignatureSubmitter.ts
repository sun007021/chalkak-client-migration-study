import type { SignatureSubmitter, SubmitOutcome } from '../features/signature/SignatureSubmitter';

/** 미리보기 ViewModel 테스트용. outcome을 정해 두고(마지막 것 반복), hold()로 붙잡았다가 release()로 끝낸다. */
export class FakeSignatureSubmitter implements SignatureSubmitter {
  readonly pngs: Blob[] = [];
  readonly signals: AbortSignal[] = [];
  private outcomes: SubmitOutcome[] = [{ kind: 'succeeded' }];
  private waiters: (() => void)[] = [];
  private holding = false;

  script(...outcomes: SubmitOutcome[]): this {
    this.outcomes = outcomes;
    return this;
  }
  hold(): this {
    this.holding = true;
    return this;
  }
  release(): void {
    this.holding = false;
    this.waiters.splice(0).forEach((resolve) => resolve());
  }
  get calls(): number {
    return this.pngs.length;
  }

  async submit(png: Blob, signal: AbortSignal): Promise<SubmitOutcome> {
    this.pngs.push(png);
    this.signals.push(signal);
    const outcome = this.outcomes[Math.min(this.pngs.length - 1, this.outcomes.length - 1)]!;
    if (this.holding) await new Promise<void>((resolve) => this.waiters.push(resolve));
    return outcome;
  }
}

export const succeeded: SubmitOutcome = { kind: 'succeeded' };
export const cancelled: SubmitOutcome = { kind: 'cancelled' };
export const failed = (kind: import('../features/signature/SignatureSubmitter').SignatureFailureKind, serverMessage?: string): SubmitOutcome => ({
  kind: 'failed',
  failure: serverMessage === undefined ? { kind } : { kind, serverMessage },
});
