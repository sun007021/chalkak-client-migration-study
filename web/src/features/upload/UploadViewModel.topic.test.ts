import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { networkFailure } from '../../test/fakeFetch';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { finish } from '../../test/homeHarness';
import { createUploadHarness, createBody, CREATE, openUpload, pickPhoto, REFRESH, settleMore, submitSequence, TOPIC_DATE, TOPIC_ID, TOPICS } from '../../test/uploadHarness';

const topicError = (h: ReturnType<typeof createUploadHarness>) => {
  const { topic } = h.vm.state;
  return topic.status === 'error' ? topic.message : null;
};

describe('UploadViewModel 주제 조회 (REQ-UPL-008~010)', () => {
  it('TC-UPL-011 시작하면 GET /topics?date=<topicDate>로 topicId와 제목을 받는다', async () => {
    const h = createUploadHarness();
    expect(h.vm.state.topic).toEqual({ status: 'loading' });
    expect(h.vm.state.topicDate).toBe(TOPIC_DATE);
    await openUpload(h);
    expect(h.ff.callsTo('GET /topics')).toHaveLength(1);
    expect(h.ff.callsTo('GET /topics')[0]!.query.get('date')).toBe(TOPIC_DATE);
    expect(h.vm.state.topic).toEqual({ status: 'ready', id: TOPIC_ID, title: '가을 하늘' });
  });

  it('TC-UPL-011 start를 여러 번 불러도 주제는 한 번만 받는다', async () => {
    const h = createUploadHarness();
    h.vm.start();
    h.vm.start();
    await settleMore();
    h.vm.start();
    await settleMore();
    expect(h.ff.callsTo('GET /topics')).toHaveLength(1);
  });

  it('TC-UPL-011 응답 topicDate가 요청과 다르면 주제 조회 실패 문구다', async () => {
    const h = createUploadHarness({ routes: { [TOPICS]: 'upload/topics__mismatch-date' } });
    await openUpload(h);
    expect(topicError(h)).toBe('주제를 불러오지 못했어요. 다시 시도해 주세요.');
    expect(topicError(h)).toBe(t('upload.error.topic-load'));
  });

  it('TC-UPL-012 404는 주제 조회 실패 문구다(재시도 없음)', async () => {
    const h = createUploadHarness({ routes: { [TOPICS]: () => json(404, { errorCode: 'BUSINESS_ERROR', message: '주제를 찾을 수 없습니다.' }) } });
    await openUpload(h);
    expect(topicError(h)).toBe(t('upload.error.topic-load'));
    expect(h.ff.callsTo('GET /topics')).toHaveLength(1);
  });

  it('TC-UPL-012 500은 GET 재시도(0.5초, 1초) 뒤에도 실패하면 주제 조회 실패 문구다', async () => {
    const h = createUploadHarness({ routes: { [TOPICS]: 'upload/topics__500-server-error' } });
    h.vm.start();
    await finish(h, Promise.resolve());
    await h.clock.advance(1_500);
    await settleMore();
    expect(h.ff.callsTo('GET /topics')).toHaveLength(3);
    expect(topicError(h)).toBe(t('upload.error.topic-load'));
  });

  it('TC-UPL-012 연결 실패는 "네트워크 연결을 확인해 주세요."다(주제 조회 실패 문구와 다르다)', async () => {
    const h = createUploadHarness({ routes: { [TOPICS]: networkFailure } });
    h.vm.start();
    await settleMore();
    await h.clock.advance(1_500);
    await settleMore();
    expect(topicError(h)).toBe('네트워크 연결을 확인해 주세요.');
    expect(topicError(h)).toBe(t('upload.error.network'));
  });

  it('TC-UPL-012 401 재인증 필요는 문구 없이 세션 만료로 넘기고 전시 완료 오류 문구도 만들지 않는다', async () => {
    const h = createUploadHarness({
      routes: {
        [TOPICS]: () => loadFixture('upload/posts-uploads__401-unauthorized.json').toResponse(),
        [REFRESH]: 'auth/refresh__reauthentication-required',
      },
    });
    await openUpload(h);
    expect(h.expired.count).toBe(1);
    expect(h.vm.state.topic.status).not.toBe('ready');
    expect(h.vm.state.errorMessage).toBeNull();
    expect(topicError(h)).not.toBe(t('upload.error.create'));
  });

  it('TC-UPL-012 retryTopic은 주제만 다시 받고 사진·제목·준비 상태를 건드리지 않는다', async () => {
    const h = createUploadHarness({ routes: { [TOPICS]: () => json(404, { errorCode: 'BUSINESS_ERROR', message: '없음' }) } });
    await openUpload(h);
    await pickPhoto(h);
    await settleMore();
    h.vm.setTitle('하늘');
    const before = h.vm.state;
    expect(before.topic.status).toBe('error');
    h.router.set(TOPICS, 'home/topics__open-2026-10-27');
    const policyCalls = h.ff.callsTo('POST /posts/uploads').length;
    h.vm.retryTopic();
    await settleMore();
    expect(h.vm.state.topic).toEqual({ status: 'ready', id: TOPIC_ID, title: '가을 하늘' });
    expect(h.vm.state.photo).toBe(before.photo);
    expect(h.vm.state.title).toBe('하늘');
    expect(h.vm.state.preparation).toBe(before.preparation);
    expect(h.vm.state.errorMessage).toBe(before.errorMessage);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(policyCalls);
  });

  it('TC-UPL-012 재시도 중에는 주제가 loading으로 돌아가고, 두 번 눌러도 요청은 한 번이다', async () => {
    const h = createUploadHarness({ routes: { [TOPICS]: () => json(404, { errorCode: 'BUSINESS_ERROR', message: '없음' }) } });
    await openUpload(h);
    const gate = deferred<Response>();
    h.router.set(TOPICS, () => gate.promise);
    h.vm.retryTopic();
    h.vm.retryTopic();
    await settleMore();
    expect(h.vm.state.topic).toEqual({ status: 'loading' });
    expect(h.ff.callsTo('GET /topics')).toHaveLength(2);
    gate.resolve(loadFixture('home/topics__open-2026-10-27.json').toResponse());
    await settleMore();
    expect(h.vm.state.topic.status).toBe('ready');
  });

  it('TC-UPL-012 주제가 준비되지 않았으면 사진이 있어도 전시할 수 없다', async () => {
    const h = createUploadHarness({ routes: { [TOPICS]: () => json(404, { errorCode: 'BUSINESS_ERROR', message: '없음' }) } });
    await openUpload(h);
    await pickPhoto(h);
    expect(h.vm.state.canSubmit).toBe(false);
    await expect(h.vm.submit()).resolves.toEqual({ kind: 'stay' });
    expect(submitSequence(h)).not.toContain(CREATE);
  });

  it('TC-UPL-010 dispose하면 대기 중인 주제 요청을 취소하고 상태를 바꾸지 않는다', async () => {
    const h = createUploadHarness();
    const gate = deferred<Response>();
    h.router.set(TOPICS, () => gate.promise);
    h.vm.start();
    await settleMore();
    const signal = h.ff.callsTo('GET /topics')[0]!.signal;
    h.vm.dispose();
    expect(signal?.aborted).toBe(true);
    gate.resolve(loadFixture('home/topics__open-2026-10-27.json').toResponse());
    await settleMore();
    expect(h.vm.state.topic).toEqual({ status: 'loading' });
  });
});

describe('UploadViewModel 자정 경계 (REQ-UPL-008, TC-UPL-013)', () => {
  it('TC-UPL-013 23:59:30 KST에 진입해 00:01에 제출해도 진입 때 고정한 topicDate·topicId를 쓴다', async () => {
    const h = createUploadHarness({ now: '2026-10-27T14:59:30Z' });
    await openUpload(h);
    await pickPhoto(h);
    await settleMore();
    await h.clock.advance(90_000); // 00:01:00 KST (정책 수명 300초 안)
    const result = h.vm.submit();
    await settleMore();
    await expect(result).resolves.toEqual({ kind: 'success' });
    expect(h.ff.callsTo('GET /topics')).toHaveLength(1);
    expect(h.ff.callsTo('GET /topics')[0]!.query.get('date')).toBe('2026-10-27');
    expect(createBody(h).topicId).toBe(TOPIC_ID);
    expect(h.results.get()?.topicDate).toBe('2026-10-27');
    expect(h.published).toEqual([expect.objectContaining({ type: 'created', topicDate: '2026-10-27' })]);
  });

  it('TC-UPL-013 자정이 지난 뒤에 화면이 주제를 받아도 게이트가 고정한 topicDate로 요청한다', async () => {
    const h = createUploadHarness({ now: '2026-10-27T15:01:00Z' }); // 2026-10-28 00:01 KST
    await openUpload(h);
    expect(h.ff.callsTo('GET /topics')[0]!.query.get('date')).toBe('2026-10-27');
    expect(h.vm.state.topicDate).toBe('2026-10-27');
  });
});
