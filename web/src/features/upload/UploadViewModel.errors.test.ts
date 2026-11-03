import { t } from '../../copy/ko';
import { networkFailure } from '../../test/fakeFetch';
import { json } from '../../test/fixtureRouter';
import {
  CREATE,
  POLICY,
  POST_ID,
  REFRESH,
  TODAY,
  UPLOAD_ID,
  UPLOAD_ID_NEW,
  createBody,
  createUploadHarness,
  hangingServer,
  prepareReady,
  putKey,
  settleMore,
} from '../../test/uploadHarness';
import type { UploadHarness } from '../../test/uploadHarness';
import { track } from '../../test/track';
import type { UploadOutcome } from './UploadViewModel';

const SECOND_POLICY = ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'];
const puts = (h: UploadHarness, uploadId = UPLOAD_ID) => h.ff.callsTo(`PUT /__upload/${uploadId}`);
const policyCalls = (h: UploadHarness) => h.ff.callsTo('POST /posts/uploads').length;
const createCalls = (h: UploadHarness) => h.ff.callsTo('POST /posts').length;
const todayCalls = (h: UploadHarness) => h.ff.callsTo('GET /posts/today').length;

/** submit()을 끝까지 돌린다: 대기 중인 체인을 비우고, 재시도 백오프·타임아웃은 가짜 시계를 0.5초씩 움직여 소화한다. */
async function submitAll(h: UploadHarness): Promise<UploadOutcome> {
  const result = track(h.vm.submit());
  for (let i = 0; i < 400 && result.state === 'pending'; i += 1) {
    await settleMore();
    if (result.state !== 'pending') break;
    await h.clock.advance(500);
  }
  expect(result.state).toBe('fulfilled');
  return result.value as UploadOutcome;
}

/** 실패 뒤의 공통 보장: 사진·제목은 그대로이고 다시 제출할 수 있다(REQ-UPL-048, TC-UPL-074). */
function expectInputsKept(h: UploadHarness, photo: Blob, title: string) {
  expect(h.vm.state.photo?.source).toBe(photo);
  expect(h.vm.state.title).toBe(title);
  expect(h.vm.state.submitting).toBe(false);
  expect(h.vm.state.canSubmit).toBe(true);
  expect(h.results.get()).toBeNull();
  expect(h.published).toEqual([]);
}

async function readyWithTitle(h: UploadHarness) {
  const photo = await prepareReady(h);
  h.vm.setTitle('하늘');
  return photo;
}

describe('UploadViewModel PUT 실패 (REQ-UPL-045~047)', () => {
  it('TC-UPL-055 S3 403(서명 불일치·만료)은 업로드 실패 문구이고 재시도하지 않으며 입력을 유지한다', async () => {
    const h = createUploadHarness({ routes: { [putKey(UPLOAD_ID)]: 'upload/s3-put__403-signature-mismatch' } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe('사진을 업로드하지 못했어요. 다시 시도해 주세요.');
    expect(h.vm.state.errorMessage).toBe(t('upload.error.upload'));
    expect(puts(h)).toHaveLength(1);
    expect(createCalls(h)).toBe(0);
    expectInputsKept(h, photo, '하늘');
  });

  it('TC-UPL-055 S3 403 뒤의 다음 "전시하기"는 정책 발급부터 다시 한다(새 uploadId)', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [putKey(UPLOAD_ID)]: 'upload/s3-put__403-signature-mismatch' } });
    await readyWithTitle(h);
    await submitAll(h);
    expect(policyCalls(h)).toBe(1);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(policyCalls(h)).toBe(2);
    expect(puts(h, UPLOAD_ID_NEW)).toHaveLength(1);
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID_NEW);
  });

  it('TC-UPL-055 S3 5xx는 0.5초, 1초 뒤 최대 2회 다시 보낸 뒤(총 3회) 업로드 실패 문구다', async () => {
    const h = createUploadHarness({ routes: { [putKey(UPLOAD_ID)]: 'upload/s3-put__500-server-error' } });
    await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(puts(h)).toHaveLength(3);
    expect(h.vm.state.errorMessage).toBe(t('upload.error.upload'));
    expect(createCalls(h)).toBe(0);
  });

  it('TC-UPL-055 PUT 연결 실패는 재시도(총 3회) 뒤 "네트워크 연결을 확인해 주세요."이고, 다음 제출은 같은 uploadId로 이어간다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [putKey(UPLOAD_ID)]: networkFailure } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(puts(h)).toHaveLength(3);
    expect(h.vm.state.errorMessage).toBe('네트워크 연결을 확인해 주세요.');
    expectInputsKept(h, photo, '하늘');
    h.router.set(putKey(UPLOAD_ID), 'upload/s3-put__200');
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(policyCalls(h)).toBe(1);
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID);
  });
});

describe('UploadViewModel POST /posts 응답 해석 (D-07, REQ-UPL-050~053)', () => {
  it.each([
    ['VALIDATING', 'home/posts-today__posted-validating'],
    ['PENDING', 'home/posts-today__posted-pending'],
    ['APPROVED', 'home/posts-today__posted-approved'],
  ] as const)('TC-UPL-061 201 본문을 해석할 수 없으면 GET /posts/today로 확인해 %s 상태로 성공 처리한다(재전송 없음)', async (status, today) => {
    const h = createUploadHarness({ routes: { [CREATE]: 'upload/posts-create__201-unknown-status', [TODAY]: today } });
    await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(createCalls(h)).toBe(1);
    expect(todayCalls(h)).toBe(1);
    expect(h.results.get()?.moderationStatus).toBe(status);
    expect(h.published).toEqual([{ type: 'created', postId: POST_ID, topicDate: '2026-10-27', moderationStatus: status }]);
  });

  it('TC-UPL-061 201 본문에 필드가 없을 때도 같은 확인을 거친다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: () => json(201, { postId: POST_ID }), [TODAY]: 'home/posts-today__posted-pending' } });
    await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(createCalls(h)).toBe(1);
    expect(h.results.get()?.moderationStatus).toBe('PENDING');
  });

  it('TC-UPL-061 확인에서도 미작성이면 "네트워크 연결을 확인해 주세요."이고 입력을 유지한다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: 'upload/posts-create__201-unknown-status' } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.network'));
    expectInputsKept(h, photo, '하늘');
  });

  it('TC-UPL-069 POST /posts가 타임아웃이어도 재전송하지 않고 today가 posted면 성공 화면으로 한 번만 간다(상태는 today의 값)', async () => {
    const h = createUploadHarness({ routes: { [TODAY]: 'home/posts-today__posted-validating' } });
    h.router.set(CREATE, hangingServer(h.clock));
    await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(createCalls(h)).toBe(1);
    expect(todayCalls(h)).toBe(1);
    expect(h.results.get()?.moderationStatus).toBe('VALIDATING');
    expect(h.published).toHaveLength(1);
    await h.clock.advance(10_000);
    await settleMore();
    expect(createCalls(h)).toBe(1);
  });

  it('TC-UPL-069 연결이 끊긴 경우도 같다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: networkFailure, [TODAY]: 'home/posts-today__posted-pending' } });
    await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(createCalls(h)).toBe(1);
    expect(h.results.get()?.moderationStatus).toBe('PENDING');
  });

  it('TC-UPL-070 타임아웃인데 today가 미작성이면 네트워크 문구이고 같은 uploadId로 다시 제출할 수 있다(새 정책 없음)', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY } });
    h.router.set(CREATE, hangingServer(h.clock));
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.network'));
    expectInputsKept(h, photo, '하늘');
    h.router.set(CREATE, 'upload/posts-create__201-pending');
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(policyCalls(h)).toBe(1);
    expect(h.ff.callsTo('POST /posts').map((c) => JSON.parse(c.body as string).photoUploadId)).toEqual([UPLOAD_ID, UPLOAD_ID]);
  });

  it('TC-UPL-071 타임아웃 뒤 today 확인도 실패하면 네트워크 문구이고, 서버가 이미 만들었다면 재제출은 400 중복으로 "이미 전시한 사진" 문구가 된다', async () => {
    const h = createUploadHarness({ routes: { [TODAY]: 'home/posts-today__500-server-error' } });
    h.router.set(CREATE, hangingServer(h.clock));
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.network'));
    expectInputsKept(h, photo, '하늘');
    // 서버는 사실 만들어 두었다: 재제출은 400, 이어서 today는 posted
    h.router.set(CREATE, 'upload/posts-create__400-already-posted');
    h.router.set(TODAY, 'home/posts-today__posted-pending');
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe('이미 이 주제에 전시한 사진이 있어요.');
    expect(h.vm.state.errorMessage).toBe(t('upload.error.duplicate'));
  });
});

describe('UploadViewModel POST /posts 400 판정 (D-02: 서버 message로 가르지 않는다)', () => {
  it.each([
    ['기본 message', () => json(400, { errorCode: 'BUSINESS_ERROR', message: '이미 해당 주제에 게시물을 작성했습니다.' })],
    ['전혀 다른 message', () => json(400, { errorCode: 'BUSINESS_ERROR', message: '서버 문구가 바뀌었다' })],
  ])('TC-UPL-062 400 뒤 today가 posted면 중복 문구다(%s)', async (_name, create) => {
    const h = createUploadHarness({ routes: { [CREATE]: create, [TODAY]: 'home/posts-today__posted-pending' } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.duplicate'));
    expect(todayCalls(h)).toBe(1);
    expect(createCalls(h)).toBe(1);
    expectInputsKept(h, photo, '하늘');
  });

  it.each([
    ['today 404', 'home/posts-today__404-no-open-topic', 'upload/posts-create__400-topic-not-open'],
    ['today topicDate가 다름', 'upload/posts-today__topic-date-changed', 'upload/posts-create__400-topic-not-open'],
    ['다른 message여도(404)', 'home/posts-today__404-no-open-topic', 'upload/posts-create__400-already-posted'],
    ['다른 message여도(날짜 다름)', 'upload/posts-today__topic-date-changed', 'upload/posts-create__400-upload-used'],
  ])('TC-UPL-063 TC-UPL-075 400 뒤 %s 이면 "주제가 변경되어 전시할 수 없어요."다', async (_name, today, create) => {
    const h = createUploadHarness({ routes: { [CREATE]: create, [TODAY]: today } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe('주제가 변경되어 전시할 수 없어요.');
    expect(h.vm.state.errorMessage).toBe(t('upload.error.topic-changed'));
    expectInputsKept(h, photo, '하늘');
  });

  it.each([
    ['업로드 만료', 'upload/posts-create__400-upload-expired', '사진 업로드 유효 시간이 지났습니다.'],
    ['재사용', 'upload/posts-create__400-upload-used', '이미 사용된 사진입니다.'],
    ['형식 거절', 'upload/posts-create__400-rejected-unsupported-format', 'WebP 이미지만 업로드할 수 있습니다.'],
    ['용량 거절', 'upload/posts-create__400-rejected-too-large', '더 작은 용량의 이미지를 업로드해 주세요.'],
    ['제목 길이(TC-UPL-083)', 'upload/posts-create__400-title-too-long', '제목은 10자 이하여야 합니다.'],
  ])('TC-UPL-064 TC-UPL-083 400(%s) 뒤 today가 미작성·같은 주제면 서버 message를 그대로 보이고 입력을 유지한다', async (_name, fixture, message) => {
    const h = createUploadHarness({ routes: { [CREATE]: fixture } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(message);
    expectInputsKept(h, photo, '하늘');
  });

  it('TC-UPL-064 다음 "전시하기"는 정책 발급부터 사진 준비를 다시 한다(새 uploadId로 PUT·POST)', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [CREATE]: ['upload/posts-create__400-upload-expired', 'upload/posts-create__201-pending'] } });
    await readyWithTitle(h);
    await submitAll(h);
    expect(policyCalls(h)).toBe(1);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(policyCalls(h)).toBe(2);
    expect(puts(h, UPLOAD_ID_NEW)).toHaveLength(1);
    expect(h.ff.callsTo('POST /posts').map((c) => JSON.parse(c.body as string).photoUploadId)).toEqual([UPLOAD_ID, UPLOAD_ID_NEW]);
  });

  it('TC-UPL-064 400 뒤 today 확인이 실패하면 전시 완료 실패 문구다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: 'upload/posts-create__400-upload-expired', [TODAY]: 'home/posts-today__500-server-error' } });
    await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.create'));
  });
});

describe('UploadViewModel POST /posts 그 밖의 실패', () => {
  it.each(['upload/posts-create__404-upload-not-found', 'upload/posts-create__404-topic-not-found'])(
    'TC-UPL-065 404(%s)는 서버 message가 아니라 전시 완료 실패 문구이고 today를 조회하지 않으며 준비물을 버린다',
    async (fixture) => {
      const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [CREATE]: [fixture, 'upload/posts-create__201-pending'] } });
      const photo = await readyWithTitle(h);
      await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
      expect(h.vm.state.errorMessage).toBe('전시를 완료하지 못했어요. 다시 시도해 주세요.');
      expect(todayCalls(h)).toBe(0);
      expectInputsKept(h, photo, '하늘');
      await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
      expect(policyCalls(h)).toBe(2);
      expect(createBody(h, 1).photoUploadId).toBe(UPLOAD_ID_NEW);
    },
  );

  it('TC-UPL-066 POST /posts 401의 재인증이 필요하면 login이고 문구 없이 사진·제목이 유지된다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: 'upload/posts-create__401-unauthorized', [REFRESH]: 'auth/refresh__reauthentication-required' } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'login' });
    expect(h.expired.count).toBe(1);
    expect(h.vm.state.errorMessage).toBeNull();
    expect(createCalls(h)).toBe(1);
    expectInputsKept(h, photo, '하늘');
  });

  it('TC-UPL-067 POST /posts 403(정지 회원)은 정지 안내이고 재요청하지 않는다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: 'upload/posts-create__403-banned' } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    await h.clock.advance(10_000);
    await settleMore();
    expect(h.vm.state.errorMessage).toBe('이용이 정지되어 게시물을 작성할 수 없어요.');
    expect(createCalls(h)).toBe(1);
    expect(todayCalls(h)).toBe(0);
    expectInputsKept(h, photo, '하늘');
  });

  it('TC-UPL-068 TC-UPL-074 POST /posts 500은 자동 재시도 없이 1회만 보내고 전시 완료 실패 문구이며 입력은 유지된다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [CREATE]: ['upload/posts-create__500-server-error', 'upload/posts-create__201-pending'] } });
    const photo = await readyWithTitle(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    await h.clock.advance(10_000);
    await settleMore();
    expect(createCalls(h)).toBe(1);
    expect(h.vm.state.errorMessage).toBe('전시를 완료하지 못했어요. 다시 시도해 주세요.');
    expectInputsKept(h, photo, '하늘');
  });

  it('TC-UPL-074 실패 뒤 다시 제출하면 같은 uploadId로 POST /posts를 보내 성공한다(만료 전)', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [CREATE]: ['upload/posts-create__500-server-error', 'upload/posts-create__201-pending'] } });
    await readyWithTitle(h);
    await submitAll(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(policyCalls(h)).toBe(1);
    expect(h.ff.callsTo('POST /posts').map((c) => JSON.parse(c.body as string).photoUploadId)).toEqual([UPLOAD_ID, UPLOAD_ID]);
    expect(h.vm.state.errorMessage).toBeNull();
  });

  it('TC-UPL-074 성공하기 전까지 결과·변경 알림은 만들지 않고, 성공하면 한 번만 만든다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: ['upload/posts-create__500-server-error', 'upload/posts-create__201-validating'] } });
    await readyWithTitle(h);
    await submitAll(h);
    expect(h.published).toEqual([]);
    await submitAll(h);
    expect(h.published).toHaveLength(1);
    expect(h.results.get()?.moderationStatus).toBe('VALIDATING');
  });
});

describe('UploadViewModel 제출 전 준비 실패', () => {
  it('TC-UPL-029 선제 준비가 실패한 상태에서 제출이 다시 실패하면 문구를 보이고 입력을 유지한다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__500-server-error' } });
    const photo = await prepareReady(h);
    h.vm.setTitle('하늘');
    await h.clock.advance(1_500);
    await settleMore();
    expect(h.vm.state.preparation).toBe('failed');
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
    expect(allPutsOf(h)).toBe(0);
    expectInputsKept(h, photo, '하늘');
  });

  it('TC-UPL-027 제출 중 정책 발급 403이면 정지 안내이고 다시 요청하지 않는다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__403-banned' } });
    await prepareReady(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.gate.banned'));
  });

  it('TC-UPL-078 제출 중 정책 발급이 재인증을 요구하면 login이다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__401-unauthorized', [REFRESH]: 'auth/refresh__reauthentication-required' } });
    await prepareReady(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'login' });
    expect(h.expired.count).toBe(1);
    expect(h.vm.state.errorMessage).toBeNull();
    expect(h.vm.state.submitting).toBe(false);
  });
});

function allPutsOf(h: UploadHarness): number {
  return h.ff.calls.filter((c) => c.method === 'PUT').length;
}
