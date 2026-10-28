import { base64ToBytes, bytesToBase64 } from './base64';

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

describe('base64ToBytes', () => {
  it('모든 바이트 값을 왕복한다(패딩 있음·없음)', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 256]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 7) % 256);
      const text = bytesToBase64(bytes);
      expect([...base64ToBytes(text)]).toEqual([...bytes]);
      expect([...base64ToBytes(text.replace(/=+$/, ''))]).toEqual([...bytes]);
    }
  });

  it('줄바꿈·공백은 무시하고 잘못된 문자·길이는 RangeError다', () => {
    expect([...base64ToBytes('Zm9v\nYmFy ')]).toEqual([...new TextEncoder().encode('foobar')]);
    expect(() => base64ToBytes('Zm9v!')).toThrow(RangeError);
    expect(() => base64ToBytes('Z')).toThrow(RangeError);
  });
});
