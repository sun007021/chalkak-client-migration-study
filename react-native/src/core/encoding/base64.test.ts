import { bytesToBase64 } from './base64';

describe('bytesToBase64', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('RFC 4648 벡터 %j', (text, expected) => {
    expect(bytesToBase64(new TextEncoder().encode(text))).toBe(expected);
  });

  it('Buffer의 base64와 모든 바이트 값에서 같다', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
