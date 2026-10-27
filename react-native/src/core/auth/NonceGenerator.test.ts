import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';

import { SecureNonceGenerator, sha256Hex, toBase64Url } from './NonceGenerator';

const randomBytes = (length: number) => new Uint8Array(nodeRandomBytes(length));

describe('SecureNonceGenerator', () => {
  it('TC-AUTH-002 100회 생성하면 매번 다르고 43자 base64url(패딩 없음)이다', () => {
    const generator = new SecureNonceGenerator(randomBytes);
    const raws = Array.from({ length: 100 }, () => generator.generate().rawNonce);
    expect(new Set(raws).size).toBe(100);
    raws.forEach((raw) => {
      expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
  });

  it('TC-AUTH-002 난수 32바이트를 요청하고 그대로 base64url로 인코딩한다', () => {
    const requested: number[] = [];
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
    const generator = new SecureNonceGenerator((length) => {
      requested.push(length);
      return bytes;
    });
    const { rawNonce } = generator.generate();
    expect(requested).toEqual([32]);
    expect(rawNonce).toBe(Buffer.from(bytes).toString('base64url'));
  });

  it('TC-AUTH-003 nonceHash는 rawNonce(UTF-8)의 SHA-256 소문자 hex 64자다', () => {
    const generator = new SecureNonceGenerator(randomBytes);
    const { rawNonce, nonceHash } = generator.generate();
    expect(nonceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(nonceHash).toBe(createHash('sha256').update(rawNonce, 'utf8').digest('hex'));
    expect(nonceHash).not.toBe(rawNonce);
  });

  it('TC-AUTH-003 알려진 입력의 SHA-256 값이 플랫폼 간 같다', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // 멀티바이트(UTF-8)
    expect(sha256Hex('찰칵')).toBe(createHash('sha256').update('찰칵', 'utf8').digest('hex'));
  });

  it('TC-AUTH-002 base64url은 +,/,= 대신 -,_를 쓰고 패딩이 없다', () => {
    expect(toBase64Url(Uint8Array.from([0xfb, 0xff, 0xfe]))).toBe('-__-');
    expect(toBase64Url(Uint8Array.from([1]))).toBe('AQ');
  });
});

describe('sha256Hex 벡터', () => {
  const nodeHex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

  it('TC-AUTH-003 NIST 2블록 벡터', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('TC-AUTH-003 길이 0..130 ASCII(패딩 경계 55/56/64/119/120 포함)가 Node와 같다', () => {
    for (let length = 0; length <= 130; length += 1) {
      const text = Array.from({ length }, (_, i) =>
        String.fromCharCode(33 + ((i * 7 + length) % 90)),
      ).join('');
      expect(sha256Hex(text)).toBe(nodeHex(text));
    }
  });

  it('TC-AUTH-003 3바이트 한글과 4바이트 이모지(서로게이트 쌍)가 Node와 같다', () => {
    for (const text of ['한글 nonce', '😀', 'a😀b찰칵𝄞', '😀'.repeat(40)]) {
      expect(sha256Hex(text)).toBe(nodeHex(text));
    }
  });
});
