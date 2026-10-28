import type { KakaoCredential, SocialLoginClient } from '../features/auth/SocialLoginClient';

type Step = { kind: 'ok'; credential?: KakaoCredential } | { kind: 'throw'; error: Error } | { kind: 'pending' };

/** 호출마다 새 idToken·rawNonce를 만들어 주는 Fake. script로 호출별 동작(성공, 던짐, 보류)을 정한다. 마지막 단계를 반복. */
export class FakeSocialLoginClient implements SocialLoginClient {
  calls = 0;
  readonly signals: (AbortSignal | undefined)[] = [];
  readonly issued: KakaoCredential[] = [];
  private steps: Step[] = [{ kind: 'ok' }];
  private waiters: { resolve: (c: KakaoCredential) => void; reject: (e: unknown) => void }[] = [];

  script(...steps: Step[]): this {
    this.steps = steps;
    return this;
  }
  /** 보류 중인 login() 호출을 성공으로 끝낸다. */
  resolvePending(credential?: KakaoCredential): void {
    const c = credential ?? this.issue();
    this.waiters.splice(0).forEach((w) => w.resolve(c));
  }
  rejectPending(error: Error): void {
    this.waiters.splice(0).forEach((w) => w.reject(error));
  }

  login(signal?: AbortSignal): Promise<KakaoCredential> {
    this.calls += 1;
    this.signals.push(signal);
    const step = this.steps[Math.min(this.calls - 1, this.steps.length - 1)]!;
    if (step.kind === 'throw') return Promise.reject(step.error);
    if (step.kind === 'pending') return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
    return Promise.resolve(step.credential ?? this.issue());
  }

  private issue(): KakaoCredential {
    const n = this.issued.length + 1;
    const credential = { idToken: `fake-id-token-${n}`, rawNonce: `fake-raw-nonce-${n}` };
    this.issued.push(credential);
    return credential;
  }
}

export const ok = (credential?: KakaoCredential): Step => ({ kind: 'ok', credential });
export const failWith = (error: Error): Step => ({ kind: 'throw', error });
export const pending: Step = { kind: 'pending' };
