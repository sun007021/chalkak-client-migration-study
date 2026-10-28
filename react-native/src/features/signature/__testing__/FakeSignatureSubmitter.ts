import type { SignatureSubmitter, SubmitHooks } from '../SignatureSubmitter';

/** submit 호출을 기록하고 정해진 결과(성공 또는 오류)를 순서대로 돌려준다. gate로 응답을 붙잡을 수 있다. */
export class FakeSignatureSubmitter implements SignatureSubmitter {
  readonly calls: { png: Uint8Array; signal: AbortSignal }[] = [];
  private results: (Error | 'ok')[] = ['ok'];
  private gate: Promise<void> | null = null;
  private commitFirst = false;

  script(...results: (Error | 'ok')[]): this {
    this.results = results;
    return this;
  }

  holdUntil(gate: Promise<void>): this {
    this.gate = gate;
    return this;
  }

  /** 붙잡기 전에 onCommit을 먼저 부른다(서버가 받아 준 뒤 세션 저장 중인 상태 흉내). */
  commitBeforeHold(): this {
    this.commitFirst = true;
    return this;
  }

  async submit(png: Uint8Array, signal: AbortSignal, hooks?: SubmitHooks): Promise<void> {
    const index = this.calls.length;
    this.calls.push({ png, signal });
    if (this.commitFirst) hooks?.onCommit?.();
    if (this.gate) await this.gate;
    const result = this.results[Math.min(index, this.results.length - 1)];
    if (result !== 'ok') throw result;
  }
}
