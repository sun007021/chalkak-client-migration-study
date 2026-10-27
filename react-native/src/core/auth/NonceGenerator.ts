export type Nonce = {
  /** 서버에 보내는 원문(base64url, 패딩 없음). 메모리에만 둔다. */
  rawNonce: string;
  /** 카카오 SDK에 넘기는 SHA-256 소문자 hex(64자). */
  nonceHash: string;
};

export interface NonceGenerator {
  generate(): Nonce;
}

export type RandomBytes = (length: number) => Uint8Array;

/** UTF-8 문자열의 SHA-256 소문자 hex. */
export function sha256Hex(_text: string): string {
  throw new Error('not implemented');
}

/** 패딩 없는 base64url. */
export function toBase64Url(_bytes: Uint8Array): string {
  throw new Error('not implemented');
}

/** 32바이트 난수 -> rawNonce, SHA-256 hex -> nonceHash. 난수원은 주입한다(테스트는 고정값). */
export class SecureNonceGenerator implements NonceGenerator {
  constructor(private readonly randomBytes: RandomBytes) {}

  generate(): Nonce {
    void this.randomBytes;
    throw new Error('not implemented');
  }
}
