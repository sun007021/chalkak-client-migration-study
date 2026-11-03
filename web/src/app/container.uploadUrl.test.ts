import { createAppContainer } from './container';
import { InProcessRefreshLock } from '../core/auth/RefreshLock';
import { FakeClock } from '../test/FakeClock';
import { FakeSessionStore } from '../test/FakeSessionStore';
import { FakeFetch, emptyResponse } from '../test/fakeFetch';
import { SequentialIdGenerator } from '../test/sequentialIds';

function build(allowLoopbackUploadHttp?: boolean) {
  const ff = new FakeFetch();
  const container = createAppContainer({
    env: {},
    pageOrigin: 'https://app.test',
    fetch: ff.fetch,
    clock: new FakeClock(),
    store: new FakeSessionStore(),
    lock: new InProcessRefreshLock(),
    ids: new SequentialIdGenerator(),
    allowLoopbackUploadHttp,
  });
  return { ff, container };
}

describe('앱 조립: 업로드 URL 허용 범위 (리뷰 8)', () => {
  it('리뷰 8 배포 설정(allowLoopbackUploadHttp: false)이면 loopback http 업로드 URL로 PUT을 보내지 않는다', async () => {
    const { ff, container } = build(false);
    await expect(container.presignedUploader.put({ url: 'http://localhost:4010/__upload/x', body: new Blob(['x']), contentType: 'image/webp' })).rejects.toMatchObject({ name: 'ConfigError' });
    expect(ff.calls).toHaveLength(0);
  });

  it('리뷰 8 지정하지 않으면 정적 define(__UPLOAD_PROXY_ENABLED__)을 따른다: 테스트(개발) 빌드는 허용', async () => {
    const { ff, container } = build();
    ff.route('PUT /__upload/x', () => emptyResponse(200));
    await container.presignedUploader.put({ url: 'http://localhost:4010/__upload/x', body: new Blob(['x']), contentType: 'image/webp' });
    expect(ff.calls).toHaveLength(1);
  });
});
