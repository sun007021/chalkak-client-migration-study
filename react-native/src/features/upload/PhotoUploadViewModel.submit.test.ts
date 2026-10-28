import {
  deferred,
  networkFailure,
  timeoutFailure,
} from '../../core/http/__testing__/FakeTransport';
import { reauth, refreshOk, unauthorized } from '../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import type { RouteValue } from '../../data/__testing__/FixtureRouter';
import { t } from '../../shared/copy';
import {
  countOf,
  createUploadHarness,
  flush,
  TOPIC_DATE,
  TOPIC_ID,
  TOPIC_TITLE,
  UPLOAD_ID_1,
  UPLOAD_ID_2,
  type UploadHarness,
} from './__testing__/createUploadHarness';
import { pickAndConfirm } from './__testing__/uploadFlow';

const CREATE = 'POST /posts';
const PUT_1 = `PUT /__upload/${UPLOAD_ID_1}`;
const PUT_2 = `PUT /__upload/${UPLOAD_ID_2}`;
const POST_ID = '22222222-2222-4222-8222-222222222201';

async function setup(routes: Record<string, RouteValue> = {}, withPhoto = true) {
  const h = await createUploadHarness({ routes });
  await h.viewModel.start();
  if (withPhoto) await pickAndConfirm(h);
  return h;
}
const state = (h: UploadHarness) => h.viewModel.getSnapshot();
const body = (h: UploadHarness, i = 0) =>
  JSON.parse(h.router.calls(CREATE)[i].body as string) as Record<string, unknown>;

describe('PhotoUploadViewModel - 제출', () => {
  it('TC-UPL-060 성공하면 업로드 화면을 성공 화면으로 바꾼다(상태 PENDING)', async () => {
    const h = await setup();
    await h.viewModel.submit();
    expect(h.navigator.calls).toEqual([
      {
        type: 'show-success',
        topicTitle: TOPIC_TITLE,
        topicDate: TOPIC_DATE.toString(),
        moderationStatus: 'PENDING',
      },
    ]);
    expect(h.navigator.ofType('close')).toHaveLength(0);
  });

  it('TC-UPL-060 VALIDATING 응답이면 성공 화면 상태도 VALIDATING이다', async () => {
    const h = await setup({ [CREATE]: 'upload/posts-create__201-validating' });
    await h.viewModel.submit();
    expect(h.navigator.ofType('show-success')[0].moderationStatus).toBe('VALIDATING');
  });

  it('TC-UPL-059·082 제목은 앞뒤 공백을 제거해 보내고 공백뿐이면 title이 null이다', async () => {
    const h = await setup();
    h.viewModel.setTitle(' 가나다라마바사아자차 ');
    await h.viewModel.submit();
    expect(body(h)).toEqual({
      topicId: TOPIC_ID,
      photoUploadId: UPLOAD_ID_1,
      title: '가나다라마바사아자차',
    });

    const blank = await setup();
    blank.viewModel.setTitle('   ');
    await blank.viewModel.submit();
    expect(body(blank).title ?? null).toBeNull();
  });

  it('TC-UPL-073 제출 중 "전시하기"를 연타해도 PUT·POST /posts는 각 1회만 나간다', async () => {
    const gate = deferred<void>();
    const h = await setup({
      [CREATE]: async () => {
        await gate.promise;
        return fixtureResponse('upload/posts-create__201-pending');
      },
    });
    const first = h.viewModel.submit();
    void h.viewModel.submit();
    void h.viewModel.submit();
    await flush();
    expect(state(h).submitting).toBe(true);

    gate.resolve();
    await first;
    await h.viewModel.submit();
    expect(countOf(h, PUT_1)).toBe(1);
    expect(countOf(h, CREATE)).toBe(1);
    expect(h.navigator.ofType('show-success')).toHaveLength(1);
  });

  it('TC-UPL-073 제출 중에는 제목 입력이 잠긴다(입력과 사진은 건드릴 수 없다)', async () => {
    const gate = deferred<void>();
    const h = await setup({
      [CREATE]: async () => {
        await gate.promise;
        return fixtureResponse('upload/posts-create__201-pending');
      },
    });
    h.viewModel.setTitle('가을');
    const pending = h.viewModel.submit();
    await flush();
    h.viewModel.setTitle('바다');
    expect(state(h).title).toBe('가을');
    await h.viewModel.editPhoto();
    expect(state(h).editing).toBe(false);
    gate.resolve();
    await pending;
  });

  it('TC-UPL-074 제출이 실패하면 사진·제목이 유지되고 실패 문구를 보여 주며 다시 제출할 수 있다', async () => {
    const h = await setup({
      [CREATE]: [
        fixtureResponse('upload/posts-create__500-server-error'),
        fixtureResponse('upload/posts-create__201-pending'),
      ],
    });
    h.viewModel.setTitle('가을 하늘');
    await h.viewModel.submit();

    expect(state(h).error).toBe(t('upload.error.create'));
    expect(state(h).submitting).toBe(false);
    expect(state(h).title).toBe('가을 하늘');
    expect(state(h).photo).not.toBeNull();
    expect(state(h).canSubmit).toBe(true);
    expect(h.navigator.calls).toEqual([]);

    await h.viewModel.submit();
    expect(h.navigator.ofType('show-success')).toHaveLength(1);
    expect(countOf(h, CREATE)).toBe(2);
  });

  it('TC-UPL-068 POST /posts 500은 자동 재시도 없이 1회만 나간다', async () => {
    const h = await setup({ [CREATE]: 'upload/posts-create__500-server-error' });
    await h.viewModel.submit();
    expect(countOf(h, CREATE)).toBe(1);
  });

  it.each([
    [
      'TC-UPL-062',
      'upload/posts-create__400-already-posted',
      'home/posts-today__posted-pending',
      t('upload.error.duplicate'),
    ],
    [
      'TC-UPL-063',
      'upload/posts-create__400-topic-not-open',
      'upload/posts-today__topic-date-changed',
      t('upload.error.topic-changed'),
    ],
  ])(
    '%s 400 판정 문구를 보여 주고 성공 화면으로 가지 않는다',
    async (_tc, create, today, message) => {
      const h = await setup({ [CREATE]: create, 'GET /posts/today': today });
      await h.viewModel.submit();
      expect(state(h).error).toBe(message);
      expect(h.navigator.calls).toEqual([]);
      expect(h.notifier.events).toEqual([]);
    },
  );

  it('TC-UPL-064 그 밖의 400은 서버 message를 보여 주고 다음 제출은 정책 발급부터 다시 한다', async () => {
    const h = await setup({
      'POST /posts/uploads': ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
      [CREATE]: ['upload/posts-create__400-upload-expired', 'upload/posts-create__201-pending'],
      'GET /posts/today': 'upload/posts-today__not-posted',
    });
    await h.viewModel.submit();
    expect(state(h).error).toBe('사진 업로드 유효 시간이 지났습니다.');
    await h.viewModel.submit();
    expect(countOf(h, 'POST /posts/uploads')).toBe(2);
    expect(h.navigator.ofType('show-success')).toHaveLength(1);
  });

  it('TC-UPL-067 정지 회원 403은 정지 안내이고 재요청 0건이다', async () => {
    const h = await setup({ [CREATE]: 'upload/posts-create__403-banned' });
    await h.viewModel.submit();
    expect(state(h).error).toBe(t('upload.gate.banned'));
    expect(countOf(h, CREATE)).toBe(1);
  });

  it('TC-UPL-069 응답 유실 뒤 today가 isPosted=true면 성공 화면으로 한 번만 가고 POST는 재전송하지 않는다', async () => {
    const h = await setup({
      [CREATE]: timeoutFailure(),
      'GET /posts/today': 'home/posts-today__posted-validating',
    });
    await h.viewModel.submit();
    expect(countOf(h, CREATE)).toBe(1);
    expect(h.navigator.ofType('show-success')).toEqual([
      expect.objectContaining({ moderationStatus: 'VALIDATING' }),
    ]);
  });

  it('TC-UPL-070 응답 유실 + today 미작성이면 네트워크 문구이고 같은 uploadId로 다시 제출할 수 있다', async () => {
    const h = await setup({
      [CREATE]: [timeoutFailure(), fixtureResponse('upload/posts-create__201-pending')],
      'GET /posts/today': 'home/posts-today__not-posted',
    });
    await h.viewModel.submit();
    expect(state(h).error).toBe(t('upload.error.network'));
    await h.viewModel.submit();
    expect(countOf(h, 'POST /posts/uploads')).toBe(1);
    expect(body(h, 1).photoUploadId).toBe(UPLOAD_ID_1);
    expect(h.navigator.ofType('show-success')).toHaveLength(1);
  });

  it('REQ-UPL-050 생성 실패 뒤 다른 사진으로 바꾸면 이전 사진이 아니라 새 사진이 올라간다', async () => {
    const h = await setup({
      'POST /posts/uploads': ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
      [CREATE]: ['upload/posts-create__500-server-error', 'upload/posts-create__201-pending'],
    });
    await h.viewModel.submit();
    expect(state(h).error).toBe(t('upload.error.create'));
    expect(countOf(h, PUT_1)).toBe(1);

    await pickAndConfirm(h, 'file:///picked/photo-b.jpg');
    await h.viewModel.submit();

    expect(h.navigator.ofType('show-success')).toHaveLength(1);
    expect(countOf(h, 'POST /posts/uploads')).toBe(2);
    expect(countOf(h, PUT_1)).toBe(1);
    expect(countOf(h, PUT_2)).toBe(1);
    expect(body(h, 1).photoUploadId).toBe(UPLOAD_ID_2);
  });

  it('TC-UPL-066 401 갱신 뒤에도 401이면 로그인 화면으로 가고 사진·제목 입력이 유지된다', async () => {
    const h = await setup({ [CREATE]: unauthorized(), 'POST /auth/refresh': refreshOk() });
    h.viewModel.setTitle('가을');
    await h.viewModel.submit();
    expect(h.authFlow.calls).toEqual(['login']);
    // 갱신은 한 번, 갱신 뒤 재전송도 한 번(처음 + 재전송 = POST /posts 2회).
    expect(countOf(h, 'POST /auth/refresh')).toBe(1);
    expect(countOf(h, CREATE)).toBe(2);
    expect(state(h).photo).not.toBeNull();
    expect(state(h).title).toBe('가을');
    expect(state(h).submitting).toBe(false);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-078 REAUTHENTICATION_REQUIRED면 세션 만료 이벤트에 맡기고 임시 WebP 파일과 사진·정책을 버린다', async () => {
    const h = await setup({ [CREATE]: unauthorized(), 'POST /auth/refresh': reauth() });
    await h.viewModel.submit();
    expect(h.authFlow.calls).toEqual([]);
    expect(h.emitted).toHaveLength(1);
    expect(h.files.existing).toEqual([]);
    expect(state(h).photo).toBeNull();
    expect(state(h).error).toBeNull();
  });

  it('TC-UPL-078 정책 발급 중에 세션이 만료돼도 같다(준비 실패가 아니라 입력 폐기)', async () => {
    const h = await setup({
      'POST /posts/uploads': unauthorized(),
      'POST /auth/refresh': reauth(),
    });
    await flush();
    expect(h.emitted).toHaveLength(1);
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-079 제출 중 화면을 나가면 PUT을 취소하고 임시 파일을 지우며 성공 화면은 뜨지 않는다', async () => {
    const h = await setup({ [PUT_1]: () => new Promise(() => undefined) });
    const pending = h.viewModel.submit();
    await flush();
    expect(countOf(h, PUT_1)).toBe(1);

    h.viewModel.dispose();
    await pending;
    expect(h.transport.requests.find((r) => r.method === 'PUT')?.options.signal?.aborted).toBe(
      true,
    );
    expect(countOf(h, CREATE)).toBe(0);
    expect(h.files.existing).toEqual([]);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-079 POST /posts 응답을 기다리는 중 화면을 나가면 뒤늦게 성공해도 성공 화면은 뜨지 않는다', async () => {
    const gate = deferred<void>();
    const h = await setup({
      [CREATE]: async () => {
        await gate.promise;
        return fixtureResponse('upload/posts-create__201-pending');
      },
    });
    const pending = h.viewModel.submit();
    await flush();
    h.viewModel.dispose();
    gate.resolve();
    await pending;
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-079 POST /posts까지 갔다면 이탈해도 홈 갱신을 위해 생성 사실을 알린다', async () => {
    // [가정: 요청이 서버에 도달해 201을 받았다면 화면이 없어도 PostCreationNotifier는 알린다]
    const gate = deferred<void>();
    const h = await setup({
      [CREATE]: async () => {
        await gate.promise;
        return fixtureResponse('upload/posts-create__201-pending');
      },
    });
    const pending = h.viewModel.submit();
    await flush();
    h.viewModel.dispose();
    gate.resolve();
    await pending;
    await flush();
    expect(h.notifier.events).toHaveLength(1);
    expect(h.navigator.ofType('show-success')).toHaveLength(0);
  });

  it('REQ-UPL-063 성공하면 홈·기록·전시 캐시가 다시 불러오도록 한 번 알린다', async () => {
    const h = await setup();
    await h.viewModel.submit();
    expect(h.notifier.events).toEqual([
      { postId: POST_ID, topicDate: TOPIC_DATE.toString(), moderationStatus: 'PENDING' },
    ]);
  });

  it('REQ-UPL-064 성공 뒤 같은 사진을 다시 제출할 수 없다(준비·입력이 정리된다)', async () => {
    const h = await setup();
    await h.viewModel.submit();
    await h.viewModel.submit();
    expect(countOf(h, CREATE)).toBe(1);
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-077 오프라인 제출 실패 후 온라인으로 돌아와 다시 제출하면 성공한다', async () => {
    let online = false;
    const h = await setup({
      'POST /posts/uploads': () =>
        online ? fixtureResponse('upload/posts-uploads__issued') : networkFailure(),
    });
    await flush();
    await h.viewModel.submit();
    expect(state(h).error).not.toBeNull();
    expect(state(h).photo).not.toBeNull();
    online = true;
    await h.viewModel.submit();
    expect(h.navigator.ofType('show-success')).toHaveLength(1);
  });
});

describe('PhotoUploadViewModel - 제목 입력', () => {
  it('TC-UPL-080 한글 10자는 허용되고 11번째 입력은 들어가지 않는다', async () => {
    const h = await setup({}, false);
    h.viewModel.setTitle('가나다라마바사아자차');
    h.viewModel.setTitle('가나다라마바사아자차카');
    expect(state(h).title).toBe('가나다라마바사아자차');
    expect(state(h).titleLength).toBe(10);
  });

  it('TC-UPL-080 이모지 10개는 허용된다(code point 기준)', async () => {
    const h = await setup({}, false);
    h.viewModel.setTitle('😀'.repeat(10));
    expect(state(h).titleLength).toBe(10);
    h.viewModel.setTitle('😀'.repeat(11));
    expect(state(h).title).toBe('😀'.repeat(10));
  });

  it('TC-UPL-081 11자 붙여넣기는 10 code point까지만 들어간다', async () => {
    const h = await setup({}, false);
    h.viewModel.setTitle('가나다라마바사아자차카');
    expect(Array.from(state(h).title)).toHaveLength(10);
  });

  it('TC-UPL-082 앞뒤 공백은 입력 그대로 보존하고 글자 수만 공백을 뺀 값으로 센다', async () => {
    const h = await setup({}, false);
    h.viewModel.setTitle(' 가나다라마바사아자차 ');
    expect(state(h).title).toBe(' 가나다라마바사아자차 ');
    expect(state(h).titleLength).toBe(10);
  });
});
