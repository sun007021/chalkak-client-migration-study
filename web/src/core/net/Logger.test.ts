import { sanitizeLogFields, stripUrlQuery } from './Logger';

const SECRET_KEYS = ['accessToken', 'refreshToken', 'idToken', 'rawNonce', 'fcmToken', 'signupToken', 'authorization', 'Authorization'];

describe('sanitizeLogFields', () => {
  it.each(SECRET_KEYS)('TC-NET-055 %s 값은 로그에 남기지 않는다', (key) => {
    const out = JSON.stringify(sanitizeLogFields({ [key]: 'TOP-SECRET-VALUE', keep: 'visible' }));
    expect(out).not.toContain('TOP-SECRET-VALUE');
    expect(out).toContain('visible');
  });

  it('TC-NET-055 중첩 객체·배열 안의 비밀값도 제거한다', () => {
    const out = JSON.stringify(sanitizeLogFields({ request: { body: { refreshToken: 'SECRET-R' }, list: [{ idToken: 'SECRET-I' }] } }));
    expect(out).not.toContain('SECRET-R');
    expect(out).not.toContain('SECRET-I');
  });

  it('TC-NET-055 문자열 값에 섞인 presigned URL은 쿼리를 잘라낸다', () => {
    const out = JSON.stringify(sanitizeLogFields({ note: 'PUT https://s3.test/b/k?X-Amz-Signature=SIG123 failed' }));
    expect(out).not.toContain('SIG123');
    expect(out).toContain('https://s3.test/b/k');
  });

  it('TC-NET-055 원본 객체를 바꾸지 않는다', () => {
    const input = { accessToken: 'A' };
    sanitizeLogFields(input);
    expect(input.accessToken).toBe('A');
  });
});

describe('stripUrlQuery', () => {
  it('TC-NET-055 쿼리와 fragment를 제거한다', () => {
    expect(stripUrlQuery('https://s3.test/b/k?X-Amz-Signature=abc#frag')).toBe('https://s3.test/b/k');
    expect(stripUrlQuery('https://s3.test/b/k')).toBe('https://s3.test/b/k');
    expect(stripUrlQuery('/api/v1/posts?page=1')).toBe('/api/v1/posts');
  });
});
