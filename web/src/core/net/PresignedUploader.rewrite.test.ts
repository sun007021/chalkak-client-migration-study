import { PresignedUploader } from './PresignedUploader';
import { DevProxyUploadUrlRewriter } from './UploadUrlRewriter';
import type { UploadUrlRewriter } from './UploadUrlRewriter';
import { FakeClock } from '../../test/FakeClock';
import { FakeFetch, emptyResponse } from '../../test/fakeFetch';
import { RecordingLogger } from '../../test/RecordingLogger';
import { NOW } from '../../test/fixtures';
import { track } from '../../test/track';

const S3 = 'https://chalkak-bucket.s3.amazonaws.com/signatures/a.png?X-Amz-Signature=SECRETSIG';

function setup(urlRewriter?: UploadUrlRewriter) {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const logger = new RecordingLogger();
  const uploader = new PresignedUploader({ fetch: ff.fetch, clock, logger, urlRewriter });
  return { clock, ff, logger, uploader };
}

describe('PresignedUploader + UploadUrlRewriter', () => {
  it('재작성기가 없으면 원래 주소로 보낸다(기본: 그대로)', async () => {
    const { clock, ff, uploader } = setup();
    ff.route('PUT /signatures/a.png', () => emptyResponse(200));
    track(uploader.put({ url: S3, body: new ArrayBuffer(2), contentType: 'image/png' }));
    await clock.advance(0);
    expect(ff.calls[0]!.url).toBe(S3);
  });

  it('재작성기가 있으면 바뀐 주소로 PUT하고 헤더는 여전히 Content-Type뿐이다(인증 헤더 없음)', async () => {
    const { clock, ff, uploader } = setup(new DevProxyUploadUrlRewriter());
    ff.route('PUT /__upload-proxy/chalkak-bucket.s3.amazonaws.com/signatures/a.png', () => emptyResponse(200));
    const body = new Blob(['png'], { type: 'image/png' });
    const result = track(uploader.put({ url: S3, body, contentType: 'image/png' }));
    await clock.advance(0);
    expect(result.state).toBe('fulfilled');
    const call = ff.calls[0]!;
    expect(call.url).toBe('/__upload-proxy/chalkak-bucket.s3.amazonaws.com/signatures/a.png?X-Amz-Signature=SECRETSIG');
    expect(call.method).toBe('PUT');
    expect(Object.keys(call.headers).sort()).toEqual(['content-type']);
    expect(call.headers['content-type']).toBe('image/png');
    expect(call.body).toBe(body);
  });

  it('허용 검사는 바꾸기 전 주소로 하고, 거절되면 재작성기도 요청도 부르지 않는다', async () => {
    const seen: string[] = [];
    const { ff, uploader } = setup({ rewrite: (url) => (seen.push(url), url) });
    await expect(uploader.put({ url: 'http://evil.example/x.png?sig=1', body: new ArrayBuffer(1), contentType: 'image/png' })).rejects.toThrow();
    expect(seen).toEqual([]);
    expect(ff.calls).toHaveLength(0);
  });

  it('실패 로그에는 바뀐 주소가 아니라 원래 주소의 쿼리 없는 형태를 남긴다', async () => {
    const { clock, ff, logger, uploader } = setup(new DevProxyUploadUrlRewriter());
    ff.route('PUT /__upload-proxy/chalkak-bucket.s3.amazonaws.com/signatures/a.png', () => emptyResponse(403));
    const result = track(uploader.put({ url: S3, body: new ArrayBuffer(1), contentType: 'image/png' }));
    await clock.advance(0);
    expect(result.state).toBe('rejected');
    const text = logger.dump();
    expect(text).not.toContain('SECRETSIG');
    expect(text).toContain('https://chalkak-bucket.s3.amazonaws.com/signatures/a.png');
  });
});
