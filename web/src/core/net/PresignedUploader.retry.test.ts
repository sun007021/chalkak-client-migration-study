import { PresignedUploader } from './PresignedUploader';
import { FakeClock } from '../../test/FakeClock';
import { FakeFetch, emptyResponse, networkFailure, textResponse } from '../../test/fakeFetch';
import { NOW } from '../../test/fixtures';
import { track } from '../../test/track';

const URL_WITH_QUERY = 'https://s3.test/bucket/photo.webp?X-Amz-Signature=SECRETSIG';
const body = new Blob(['x'], { type: 'image/webp' });

function setup() {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const uploader = new PresignedUploader({ fetch: ff.fetch, clock });
  const put = (retry?: boolean, signal?: AbortSignal) => uploader.put({ url: URL_WITH_QUERY, body, contentType: 'image/webp', retry, signal });
  return { clock, ff, uploader, put };
}

const xml500 = () => textResponse(500, '<Error><Code>InternalError</Code></Error>', 'application/xml');
const xml403 = () => textResponse(403, '<Error><Code>SignatureDoesNotMatch</Code></Error>', 'application/xml');

describe('PresignedUploader retry 옵션(사진 업로드는 멱등 PUT이라 D-21 재시도)', () => {
  it('TC-UPL-055 retry를 주지 않으면 5xx도 재시도하지 않는다(기본 동작 유지)', async () => {
    const h = setup();
    h.ff.route('PUT /bucket/photo.webp', xml500);
    const result = track(h.put());
    await h.clock.advance(5_000);
    expect(result.state).toBe('rejected');
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-UPL-055 retry: true면 5xx에 0.5초, 1초 뒤 최대 2회 다시 보낸다(총 3회)', async () => {
    const h = setup();
    h.ff.route('PUT /bucket/photo.webp', xml500);
    const result = track(h.put(true));
    await h.clock.advance(0);
    expect(h.ff.calls).toHaveLength(1);
    await h.clock.advance(499);
    expect(h.ff.calls).toHaveLength(1);
    await h.clock.advance(1);
    expect(h.ff.calls).toHaveLength(2);
    await h.clock.advance(999);
    expect(h.ff.calls).toHaveLength(2);
    await h.clock.advance(1);
    expect(h.ff.calls).toHaveLength(3);
    await h.clock.advance(10_000);
    expect(h.ff.calls).toHaveLength(3);
    expect(result.state).toBe('rejected');
    expect(result.error).toMatchObject({ name: 'ApiError', status: 500 });
  });

  it('TC-UPL-055 첫 재시도가 성공하면 거기서 끝난다', async () => {
    const h = setup();
    h.ff.route('PUT /bucket/photo.webp', xml500, () => emptyResponse(200));
    const result = track(h.put(true));
    await h.clock.advance(500);
    expect(result.state).toBe('fulfilled');
    expect(h.ff.calls).toHaveLength(2);
  });

  it('TC-UPL-055 연결 실패도 같은 백오프로 재시도하고, 끝내 실패하면 NetworkError다', async () => {
    const h = setup();
    h.ff.route('PUT /bucket/photo.webp', networkFailure);
    const result = track(h.put(true));
    await h.clock.advance(1_500);
    expect(h.ff.calls).toHaveLength(3);
    expect(result.state).toBe('rejected');
    expect(result.error).toMatchObject({ name: 'NetworkError' });
  });

  it('TC-UPL-055 403(서명 불일치·만료)은 retry: true여도 재시도하지 않는다', async () => {
    const h = setup();
    h.ff.route('PUT /bucket/photo.webp', xml403);
    const result = track(h.put(true));
    await h.clock.advance(5_000);
    expect(h.ff.calls).toHaveLength(1);
    expect(result.error).toMatchObject({ name: 'ApiError', status: 403 });
  });

  it('TC-UPL-055 재시도 때도 Authorization 없이 같은 Content-Type과 같은 본문을 보낸다', async () => {
    const h = setup();
    h.ff.route('PUT /bucket/photo.webp', xml500, () => emptyResponse(200));
    track(h.put(true));
    await h.clock.advance(500);
    for (const call of h.ff.calls) {
      expect(Object.keys(call.headers)).toEqual(['content-type']);
      expect(call.headers['content-type']).toBe('image/webp');
      expect(call.body).toBe(body);
    }
  });

  it('TC-UPL-055 백오프 중 취소하면 AbortError로 끝나고 더 보내지 않는다', async () => {
    const h = setup();
    h.ff.route('PUT /bucket/photo.webp', xml500);
    const controller = new AbortController();
    const result = track(h.put(true, controller.signal));
    await h.clock.advance(0);
    controller.abort();
    await h.clock.advance(5_000);
    expect(result.state).toBe('rejected');
    expect((result.error as Error).name).toBe('AbortError');
    expect(h.ff.calls).toHaveLength(1);
  });
});
