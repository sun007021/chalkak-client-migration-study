import { PresignedUploader } from './PresignedUploader';
import { ApiError } from './errors';
import { RecordingLogger } from './Logger';
import { FakeClock } from '../time/FakeClock';
import { FakeFetch, emptyResponse, textResponse } from '../../test/fakeFetch';
import { track } from '../../test/track';
import { NOW } from '../../test/fixtures';

const URL_WITH_QUERY = 'https://s3.test/bucket/photo.webp?X-Amz-Signature=SECRETSIG';

function setup() {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const logger = new RecordingLogger();
  const uploader = new PresignedUploader({ fetch: ff.fetch, clock, logger });
  return { clock, ff, logger, uploader };
}

describe('PresignedUploader', () => {
  it('TC-NET-044 PUT으로 정책의 Content-Type만 보내고 Authorization·Accept 등 앱 공통 헤더는 없다', async () => {
    const { clock, ff, uploader } = setup();
    ff.route('PUT /bucket/photo.webp', () => emptyResponse(200));
    const body = new Blob(['x'], { type: 'image/webp' });
    const result = track(uploader.put({ url: URL_WITH_QUERY, body, contentType: 'image/webp' }));
    await clock.advance(0);
    expect(result.state).toBe('fulfilled');
    const call = ff.calls[0]!;
    expect(call.method).toBe('PUT');
    expect(call.url).toBe(URL_WITH_QUERY);
    expect(call.headers['content-type']).toBe('image/webp');
    expect(Object.keys(call.headers).sort()).toEqual(['content-type']);
    expect(call.body).toBe(body);
  });

  it('TC-NET-044 사인 PNG는 image/png로 보낸다', async () => {
    const { clock, ff, uploader } = setup();
    ff.route('PUT /bucket/photo.webp', () => emptyResponse(200));
    track(uploader.put({ url: URL_WITH_QUERY, body: new ArrayBuffer(4), contentType: 'image/png' }));
    await clock.advance(0);
    expect(ff.calls[0]!.headers['content-type']).toBe('image/png');
  });

  it('TC-NET-044 60초 안의 응답은 성공, 60초를 넘으면 NetworkError(timeout)다', async () => {
    const fast = setup();
    fast.ff.route('PUT /bucket/photo.webp', async () => {
      await fast.clock.sleep(59_000);
      return emptyResponse(200);
    });
    const a = track(fast.uploader.put({ url: URL_WITH_QUERY, body: new ArrayBuffer(1), contentType: 'image/webp' }));
    await fast.clock.advance(59_000);
    expect(a.state).toBe('fulfilled');

    const slow = setup();
    slow.ff.route('PUT /bucket/photo.webp', async () => {
      await slow.clock.sleep(61_000);
      return emptyResponse(200);
    });
    const b = track(slow.uploader.put({ url: URL_WITH_QUERY, body: new ArrayBuffer(1), contentType: 'image/webp' }));
    await slow.clock.advance(60_000);
    expect(b.error).toMatchObject({ name: 'NetworkError', kind: 'timeout' });
  });

  it('TC-NET-044 비 2xx(XML 본문)는 status를 보존한 ApiError(errorCode null)다', async () => {
    const { clock, ff, uploader } = setup();
    ff.route('PUT /bucket/photo.webp', () => textResponse(403, '<Error><Code>AccessDenied</Code></Error>', 'application/xml'));
    const result = track(uploader.put({ url: URL_WITH_QUERY, body: new ArrayBuffer(1), contentType: 'image/webp' }));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status: 403, errorCode: null });
  });

  it('TC-NET-055 실패해도 로그에 presigned URL의 쿼리 문자열이 남지 않는다', async () => {
    const { clock, ff, logger, uploader } = setup();
    ff.route('PUT /bucket/photo.webp', () => emptyResponse(500));
    track(uploader.put({ url: URL_WITH_QUERY, body: new ArrayBuffer(1), contentType: 'image/webp' }));
    await clock.advance(5_000);
    expect(logger.dump()).not.toContain('SECRETSIG');
  });

  it('TC-NET-050 loopback 외 http presigned URL은 요청을 보내지 않고 ConfigError다', async () => {
    const { clock, ff, uploader } = setup();
    const result = track(uploader.put({ url: 'http://s3.test/bucket/photo.webp?X-Amz-Signature=S', body: new ArrayBuffer(1), contentType: 'image/webp' }));
    await clock.advance(0);
    expect(result.error).toMatchObject({ name: 'ConfigError' });
    expect(ff.calls).toHaveLength(0);
  });
});
