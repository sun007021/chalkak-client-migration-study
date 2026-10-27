import { WebCryptoNonceGenerator, sha256Hex, sha256HexFallback } from './nonce';

describe('rawNonce 생성', () => {
  it('TC-AUTH-002 100회 생성하면 매번 다르고 모두 base64url(패딩 없음) 43자이다', () => {
    const generator = new WebCryptoNonceGenerator();
    const values = Array.from({ length: 100 }, () => generator.generate());
    expect(new Set(values).size).toBe(100);
    for (const value of values) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('TC-AUTH-002 32바이트 난수를 base64url로 인코딩한다(주입한 난수원으로 검증)', () => {
    const random = {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(0xfb);
        return array;
      },
    };
    // 0xfb 32개 → base64url(패딩 없음) 43자
    expect(new WebCryptoNonceGenerator(random).generate()).toBe('-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_v7-_s');
  });
});

describe('SDK용 nonce 해시', () => {
  it('TC-AUTH-003 알려진 입력 "abc"의 SHA-256 소문자 hex 64자를 돌려준다', async () => {
    const hash = await sha256Hex('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('TC-AUTH-003 빈 문자열의 해시', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('TC-AUTH-003 문자열은 UTF-8 바이트로 해시한다', async () => {
    expect(await sha256Hex('가')).toBe('64ee5293d31bc58b72d76ae9a86a902e90442428e29f24f4ecb257ba841cdd36');
  });
});

describe('SHA-256 순수 TS 폴백 (crypto.subtle이 없을 때)', () => {
  const subtleHex = async (text: string) => sha256Hex(text);

  it('TC-AUTH-003 NIST 벡터: 빈 문자열, "abc", 두 블록 메시지', () => {
    expect(sha256HexFallback('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256HexFallback('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256HexFallback('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it.each([55, 56, 63, 64, 65, 119, 120])('TC-AUTH-003 패딩 경계 %i바이트도 subtle과 같은 값이다', async (length) => {
    const text = 'a'.repeat(length);
    expect(sha256HexFallback(text)).toBe(await subtleHex(text));
  });

  it('TC-AUTH-003 UTF-8 다바이트 문자', async () => {
    expect(sha256HexFallback('가')).toBe('64ee5293d31bc58b72d76ae9a86a902e90442428e29f24f4ecb257ba841cdd36');
  });
});
