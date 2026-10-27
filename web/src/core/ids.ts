export interface IdGenerator {
  /** 호출할 때마다 서로 다른 ID를 돌려준다. */
  next(): string;
}

export class RandomIdGenerator implements IdGenerator {
  next(): string {
    return globalThis.crypto.randomUUID();
  }
}
