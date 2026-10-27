import { VERSION_LOOKUP_TIMEOUT_MS } from '../../shared/constants';
import { TimeoutError } from '../../core/http/ApiError';
import {
  FakeTransport,
  json,
  networkFailure,
  raw,
} from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { buildLookupUrl, ItunesUpdateChecker } from './ItunesUpdateChecker';

const BUNDLE_ID = 'com.example.chalkak';

function setup(country: string | null = 'kr', installedVersion = '1.1.1') {
  const transport = new FakeTransport();
  const checker = new ItunesUpdateChecker({
    transport,
    bundleId: BUNDLE_ID,
    installedVersion,
    storefrontCountry: async () => country,
  });
  return { transport, checker };
}

describe('ItunesUpdateChecker 판정', () => {
  it.each([
    ['TC-BOOT-016', 'boot/itunes-lookup__newer-major', 'update-required'],
    ['TC-BOOT-017', 'boot/itunes-lookup__newer-minor', 'update-required'],
    ['TC-BOOT-018', 'boot/itunes-lookup__patch-only', 'up-to-date'],
    ['TC-BOOT-018', 'boot/itunes-lookup__same', 'up-to-date'],
    ['TC-BOOT-022', 'boot/itunes-lookup__empty-results', 'unavailable'],
  ])('%s fixture %s -> %s (설치 1.1.1)', async (_id, fixture, expected) => {
    const { transport, checker } = setup();
    transport.script(fixtureResponse(fixture));
    await expect(checker.check()).resolves.toBe(expected);
  });

  it('TC-BOOT-022 results[0]에 version 필드가 없으면 통과(unavailable)다', async () => {
    const { transport, checker } = setup();
    transport.script(json(200, { resultCount: 1, results: [{ bundleId: BUNDLE_ID }] }));
    await expect(checker.check()).resolves.toBe('unavailable');
  });

  it('TC-BOOT-020 스토어 version이 파싱 불가 문자열이면 통과(unavailable)다', async () => {
    const { transport, checker } = setup();
    for (const version of ['1', '1.2.3.4', '1.two.3', '']) {
      transport.script(json(200, { resultCount: 1, results: [{ version }] }));
      await expect(checker.check()).resolves.toBe('unavailable');
    }
  });

  it('TC-BOOT-020 설치 버전이 파싱 불가여도 크래시 없이 통과한다', async () => {
    const { transport, checker } = setup('kr', 'dev-build');
    transport.script(fixtureResponse('boot/itunes-lookup__newer-major'));
    await expect(checker.check()).resolves.toBe('unavailable');
  });

  it.each([
    ['네트워크 오류', () => networkFailure()],
    ['5xx', () => raw(503, 'Service Unavailable', 'text/plain')],
    ['본문이 JSON 아님', () => raw(200, '<html/>', 'text/html')],
  ])('TC-BOOT-023 %s면 앱을 막지 않고 통과(unavailable)다', async (_name, failure) => {
    const { transport, checker } = setup();
    transport.script(failure());
    await expect(checker.check()).resolves.toBe('unavailable');
  });
});

describe('ItunesUpdateChecker 요청', () => {
  it('TC-BOOT-021 URL에 bundleId, 스토어프론트 국가, entity=software가 들어간다', async () => {
    const { transport, checker } = setup('us');
    transport.script(fixtureResponse('boot/itunes-lookup__same'));
    await checker.check();

    const [request] = transport.requests;
    const url = new URL(request.url);
    expect(request.method).toBe('GET');
    expect(`${url.origin}${url.pathname}`).toBe('https://itunes.apple.com/lookup');
    expect(url.searchParams.get('bundleId')).toBe(BUNDLE_ID);
    expect(url.searchParams.get('country')).toBe('us');
    expect(url.searchParams.get('entity')).toBe('software');
  });

  it('TC-BOOT-021 국가 코드를 못 읽으면 기본 국가(kr)를 쓴다', async () => {
    const { transport, checker } = setup(null);
    transport.script(fixtureResponse('boot/itunes-lookup__same'));
    await checker.check();
    expect(new URL(transport.requests[0].url).searchParams.get('country')).toBe('kr');
  });

  it('TC-BOOT-021 buildLookupUrl은 특수문자를 인코딩한다', () => {
    const url = new URL(buildLookupUrl('com.a b&c', 'kr'));
    expect(url.searchParams.get('bundleId')).toBe('com.a b&c');
  });

  it('TC-BOOT-024 조회 타임아웃은 3초(VERSION_LOOKUP_TIMEOUT_MS)로 transport에 전달한다', async () => {
    const { transport, checker } = setup();
    transport.script(fixtureResponse('boot/itunes-lookup__same'));
    await checker.check();
    expect(VERSION_LOOKUP_TIMEOUT_MS).toBe(3000);
    const { options } = transport.requests[0];
    expect(options.responseTimeoutMs).toBe(VERSION_LOOKUP_TIMEOUT_MS);
    expect(options.connectTimeoutMs).toBeLessThanOrEqual(VERSION_LOOKUP_TIMEOUT_MS);
  });

  it('TC-BOOT-024 타임아웃 오류는 통과(unavailable)로 처리한다', async () => {
    const { transport, checker } = setup();
    transport.script(new TimeoutError('3s'));
    await expect(checker.check()).resolves.toBe('unavailable');
  });
});
