export interface NonceGenerator {
  /** 32바이트 보안 난수의 base64url(패딩 없음) 43자. 호출마다 새 값. */
  generate(): string;
}

export class WebCryptoNonceGenerator implements NonceGenerator {
  constructor(_random: Pick<Crypto, 'getRandomValues'> = globalThis.crypto) {}
  generate(): string {
    throw new Error('not implemented');
  }
}

/** SHA-256(UTF-8) 소문자 hex 64자. SDK(카카오 인가 요청)에 보내는 nonce 값(API §2.1). */
export async function sha256Hex(_text: string): Promise<string> {
  throw new Error('not implemented');
}
