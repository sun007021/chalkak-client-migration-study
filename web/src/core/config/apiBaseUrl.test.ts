import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assertAllowedAbsoluteUrl, parseApiBaseUrl, readApiBaseUrl } from './apiBaseUrl';
import { ConfigError } from '../net/errors';

const PAGE = { pageOrigin: 'http://localhost:5173' };

describe('parseApiBaseUrl', () => {
  it('REQ-NET-003 TC-NET-050 https origin에 /api/v1/ 을 붙인다(끝 슬래시 한 개는 허용)', () => {
    expect(parseApiBaseUrl('https://mock.local')).toBe('https://mock.local/api/v1/');
    expect(parseApiBaseUrl('https://mock.local/')).toBe('https://mock.local/api/v1/');
    expect(parseApiBaseUrl('https://mock.local:4010')).toBe('https://mock.local:4010/api/v1/');
  });

  it.each(['http://localhost:4010', 'http://127.0.0.1:4010', 'http://localhost'])('TC-NET-050 loopback만 http를 허용한다: %s', (raw) => {
    expect(parseApiBaseUrl(raw)).toBe(`${raw}/api/v1/`);
  });

  it.each([
    ['일반 http', 'http://chalkak-dev.example'],
    ['대문자 HTTP', 'HTTP://x.test'],
    ['loopback 흉내 호스트', 'http://localhost.evil.test'],
    ['ftp 스킴', 'ftp://x.test'],
    ['스킴 없음', 'chalkak.example'],
    ['프로토콜 상대(//)', '//x.test'],
    ['경로 포함', 'https://mock.local/api/v1/'],
    ['경로 포함2', 'https://mock.local/api'],
    ['쿼리 포함', 'https://mock.local?x=1'],
    ['형식 오류', 'https://'],
  ])('TC-NET-050 REQ-NET-002 %s는 ConfigError로 거부한다', (_n, raw) => {
    expect(() => parseApiBaseUrl(raw, PAGE)).toThrow(ConfigError);
  });

  it.each([undefined, '', '   ', 'same-origin'])('Web 특례 %j이면 현재 페이지 출처에 /api/v1/ 을 붙인다', (raw) => {
    expect(parseApiBaseUrl(raw, PAGE)).toBe('http://localhost:5173/api/v1/');
    expect(parseApiBaseUrl(raw, { pageOrigin: 'https://web.chalkak.example' })).toBe('https://web.chalkak.example/api/v1/');
  });

  it('Web 특례의 pageOrigin이 loopback 아닌 http면 ConfigError다', () => {
    expect(() => parseApiBaseUrl('same-origin', { pageOrigin: 'http://web.chalkak.example' })).toThrow(ConfigError);
  });

  it('Web 특례의 pageOrigin이 주어지지 않으면 location.origin을 쓴다', () => {
    expect(parseApiBaseUrl('same-origin')).toBe(`${window.location.origin}/api/v1/`);
  });

  it('TC-NET-058 readApiBaseUrl은 VITE_API_BASE_URL을 읽고 개발 서버 주소로 대체하지 않는다', () => {
    expect(readApiBaseUrl({ VITE_API_BASE_URL: 'https://mock.local:4010' })).toBe('https://mock.local:4010/api/v1/');
    expect(readApiBaseUrl({}, PAGE)).toBe('http://localhost:5173/api/v1/');
    expect(readApiBaseUrl({ VITE_API_BASE_URL: '' }, PAGE)).not.toContain('chalkak-dev');
    expect(() => readApiBaseUrl({ VITE_API_BASE_URL: 'http://chalkak-dev.example' })).toThrow(ConfigError);
  });

  it('TC-NET-058 소스에 개발 서버 주소가 하드코딩돼 있지 않다(테스트 파일 제외)', () => {
    const root = join(__dirname, '..', '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && readFileSync(p, 'utf8').includes('chalkak-dev.pysun.kr')) offenders.push(p);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('assertAllowedAbsoluteUrl (presigned URL)', () => {
  it('https와 loopback http는 통과한다', () => {
    expect(() => assertAllowedAbsoluteUrl('https://s3.test/b/k?sig=1')).not.toThrow();
    expect(() => assertAllowedAbsoluteUrl('http://localhost:9000/b/k?sig=1')).not.toThrow();
  });

  it.each(['http://s3.test/b/k', 'ftp://s3.test/b', '/relative/path', 'not a url'])('TC-NET-050 %s는 ConfigError다', (u) => {
    expect(() => assertAllowedAbsoluteUrl(u)).toThrow(ConfigError);
  });
});
