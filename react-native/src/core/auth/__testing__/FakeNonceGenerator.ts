import type { Nonce, NonceGenerator } from '../NonceGenerator';

/** 호출마다 `raw-1/hash-1`, `raw-2/hash-2`... 를 돌려준다. rawNonce와 nonceHash가 섞였는지 눈으로 구분된다. */
export class FakeNonceGenerator implements NonceGenerator {
  count = 0;

  generate(): Nonce {
    this.count += 1;
    return { rawNonce: `raw-${this.count}`, nonceHash: `hash-${this.count}` };
  }
}
