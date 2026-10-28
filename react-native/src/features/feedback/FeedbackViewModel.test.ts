import {
  deferred,
  networkFailure,
  timeoutFailure,
} from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import {
  createFeedbackHarness,
  POST_FEEDBACK,
  type FeedbackHarness,
} from './__testing__/createFeedbackHarness';

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

/** 응답을 `release()`할 때까지 미루는 POST /feedbacks 라우트. */
function holdPost(h: FeedbackHarness, fixture = 'feedback/feedbacks__created') {
  const gate = deferred<void>();
  h.router.set(POST_FEEDBACK, async () => {
    await gate.promise;
    return fixtureResponse(fixture);
  });
  return { release: () => gate.resolve() };
}

describe('FeedbackViewModel 화면 진입과 상태', () => {
  it('TC-FDBK-001 TC-ANL-009 start()가 screen_view feedback을 1회 보낸다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.start();
    expect(h.analytics.events).toEqual([
      { name: 'screen_view', params: { screen_name: 'feedback' } },
    ]);
  });

  it('TC-ANL-018 입력·전송 중 상태가 바뀌어도 screen_view는 다시 나가지 않는다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.start();
    h.viewModel.onTextChange('가');
    h.viewModel.onTextChange('가나');
    await h.viewModel.submit();
    expect(h.analytics.screenNames).toEqual(['feedback']);
  });

  it('TC-FDBK-003 초기 상태는 빈 입력, 카운터 0, 보내기 비활성이다', async () => {
    const h = await createFeedbackHarness();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      text: '',
      count: 0,
      canSubmit: false,
      sending: false,
      validationMessage: null,
      errorMessage: null,
    });
  });

  it('TC-FDBK-004 공백만 입력하면 비활성이고 submit()을 불러도 서버 호출이 0건이다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange(' \t\n　 ');
    expect(h.viewModel.getSnapshot()).toMatchObject({ count: 0, canSubmit: false });
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(0);
    expect(h.navigator.closes).toBe(0);
  });

  it('TC-FDBK-005 trim 후 1자면 활성이다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('  가 ');
    expect(h.viewModel.getSnapshot()).toMatchObject({ count: 1, canSubmit: true });
  });

  it('TC-FDBK-013 카운터 값은 입력할 때마다 trim 후 code point 수와 같다(원문은 그대로 보관)', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('  😀😀 ');
    expect(h.viewModel.getSnapshot()).toMatchObject({ text: '  😀😀 ', count: 2 });
    h.viewModel.onTextChange('a'.repeat(1001));
    expect(h.viewModel.getSnapshot().count).toBe(1001);
  });

  it('TC-FDBK-014 10만 자를 붙여넣어도 카운터가 정확하고 전송은 거부되며 요청이 없다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('a'.repeat(100_000));
    expect(h.viewModel.getSnapshot().count).toBe(100_000);
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(0);
    expect(h.viewModel.getSnapshot().validationMessage).toBe(t('fdbk.error.invalid'));
  });
});

describe('FeedbackViewModel 길이 검증과 전송 내용', () => {
  it('TC-FDBK-006 trim 후 정확히 1000자는 요청이 나간다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('a'.repeat(1000));
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(1);
  });

  it('TC-FDBK-007 REQ-FDBK-005 1001자는 요청 0건이고 fdbk.error.invalid를 보이며 입력은 막지 않는다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('a'.repeat(1001));
    expect(h.viewModel.getSnapshot().canSubmit).toBe(true);
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(0);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      validationMessage: t('fdbk.error.invalid'),
      sending: false,
      text: 'a'.repeat(1001),
    });
    expect(h.navigator.closes).toBe(0);
  });

  it('TC-FDBK-008 앞뒤 공백 포함 1002자(trim 후 1000자)는 허용되고 서버로 가는 content는 trim 값이다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange(` ${'a'.repeat(1000)} `);
    await h.viewModel.submit();
    expect(h.sentContents()).toEqual(['a'.repeat(1000)]);
  });

  it('TC-FDBK-009 이모지 1000개(UTF-16 2000)는 허용, 1001개는 거부한다', async () => {
    const ok = await createFeedbackHarness();
    ok.viewModel.onTextChange('😀'.repeat(1000));
    await ok.viewModel.submit();
    expect(ok.posts()).toHaveLength(1);

    const bad = await createFeedbackHarness();
    bad.viewModel.onTextChange('😀'.repeat(1001));
    await bad.viewModel.submit();
    expect(bad.posts()).toHaveLength(0);
  });

  it('TC-FDBK-010 결합 이모지 200개(=1000 code point)는 허용, 201개는 거부한다', async () => {
    const family = '👨‍👩‍👧';
    const ok = await createFeedbackHarness();
    ok.viewModel.onTextChange(family.repeat(200));
    await ok.viewModel.submit();
    expect(ok.posts()).toHaveLength(1);

    const bad = await createFeedbackHarness();
    bad.viewModel.onTextChange(family.repeat(201));
    await bad.viewModel.submit();
    expect(bad.posts()).toHaveLength(0);
  });

  it('TC-FDBK-011 분해형 한글은 정규화 없이 code point 그대로 센다', async () => {
    const h = await createFeedbackHarness();
    const decomposed = '한'.normalize('NFD');
    h.viewModel.onTextChange(decomposed);
    expect(h.viewModel.getSnapshot().count).toBe(3);
    await h.viewModel.submit();
    expect(h.sentContents()).toEqual([decomposed]);
  });

  it('TC-FDBK-012 중간의 개행·연속 공백은 보존하고 앞뒤만 제거해 보낸다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('\n 첫 줄\n\n  둘째   줄 \t');
    await h.viewModel.submit();
    expect(h.sentContents()).toEqual(['첫 줄\n\n  둘째   줄']);
  });

  it('REQ-FDBK-007 요청 바디에는 content 하나만 있다(앱 버전·기기 정보 없음)', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('좋아요');
    await h.viewModel.submit();
    expect(JSON.parse(String(h.posts()[0].body))).toEqual({ content: '좋아요' });
  });
});

describe('FeedbackViewModel 전송 성공과 연타', () => {
  it('TC-FDBK-017 TC-FDBK-020 성공하면 토스트 fdbk.success, 화면 닫기, 입력 비움이다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('좋아요');
    await h.viewModel.submit();
    expect(h.toast.messages).toEqual([t('fdbk.success')]);
    expect(h.navigator.closes).toBe(1);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      text: '',
      count: 0,
      canSubmit: false,
      sending: false,
      errorMessage: null,
      validationMessage: null,
    });
  });

  it('TC-FDBK-028 REQ-FDBK-013 전송 전에 회원 상태를 조회하지 않고 POST 한 번으로 성공한다(정지 회원도 같은 흐름)', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('좋아요');
    await h.viewModel.submit();
    expect(h.transport.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/v1/feedbacks',
    ]);
    expect(h.toast.messages).toEqual([t('fdbk.success')]);
  });

  it('TC-FDBK-018 전송 중에는 sending이고 보내기가 비활성이다', async () => {
    const h = await createFeedbackHarness();
    const post = holdPost(h);
    h.viewModel.onTextChange('좋아요');
    const sending = h.viewModel.submit();
    expect(h.viewModel.getSnapshot()).toMatchObject({ sending: true, canSubmit: false });
    post.release();
    await sending;
    expect(h.viewModel.getSnapshot().sending).toBe(false);
  });

  it('TC-FDBK-019 REQ-FDBK-006 보내기를 3회 연타해도 POST는 1회뿐이다', async () => {
    const h = await createFeedbackHarness();
    const post = holdPost(h);
    h.viewModel.onTextChange('좋아요');
    const first = h.viewModel.submit();
    void h.viewModel.submit();
    void h.viewModel.submit();
    post.release();
    await first;
    await flush();
    expect(h.posts()).toHaveLength(1);
    expect(h.toast.messages).toEqual([t('fdbk.success')]);
    expect(h.navigator.closes).toBe(1);
  });

  it('TC-FDBK-020 성공 뒤 같은 ViewModel을 다시 써도 이전 내용이 남아 있지 않다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.onTextChange('첫 피드백');
    await h.viewModel.submit();
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(1);
  });

  it('TC-FDBK-034 TC-FDBK-001 분석 이벤트에는 피드백 내용이 담기지 않는다', async () => {
    const h = await createFeedbackHarness();
    h.viewModel.start();
    h.viewModel.onTextChange('비밀스러운 피드백');
    await h.viewModel.submit();
    expect(JSON.stringify(h.analytics.events)).not.toContain('비밀스러운');
    expect(h.analytics.events).toEqual([
      { name: 'screen_view', params: { screen_name: 'feedback' } },
    ]);
  });
});

describe('FeedbackViewModel 실패 처리', () => {
  it.each([
    ['blank', 'feedback/feedbacks__bad-request-blank'],
    ['too-long', 'feedback/feedbacks__bad-request-too-long'],
  ])(
    'TC-FDBK-021 400 BUSINESS_ERROR(%s)는 fdbk.error.invalid를 보이고 입력을 유지한다',
    async (_n, fixture) => {
      const h = await createFeedbackHarness({ routes: { [POST_FEEDBACK]: fixture } });
      h.viewModel.onTextChange('내용');
      await h.viewModel.submit();
      expect(h.viewModel.getSnapshot()).toMatchObject({
        text: '내용',
        validationMessage: t('fdbk.error.invalid'),
        sending: false,
      });
      expect(h.toast.messages).toEqual([]);
      expect(h.navigator.closes).toBe(0);
    },
  );

  it('TC-FDBK-022 401 뒤 refresh가 성공하면 원 요청이 1회 재전송되어 정상 완료한다', async () => {
    const h = await createFeedbackHarness();
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    h.router.set(POST_FEEDBACK, (request) =>
      request.headers.Authorization === 'Bearer access-1'
        ? fixtureResponse('feedback/feedbacks__unauthorized')
        : fixtureResponse('feedback/feedbacks__created'),
    );
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(2); // 401 -> 갱신 -> 1회 재전송
    expect(h.router.calls('POST /auth/refresh')).toHaveLength(1);
    expect(h.toast.messages).toEqual([t('fdbk.success')]);
    expect(h.authFlow.calls).toEqual([]);
  });

  it('TC-FDBK-023 REQ-FDBK-011 401 REAUTHENTICATION_REQUIRED면 화면은 아무것도 하지 않는다(세션 만료 이벤트가 로그인으로 보낸다)', async () => {
    const h = await createFeedbackHarness();
    h.router.set(POST_FEEDBACK, 'feedback/feedbacks__unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__reauthentication-required');
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    expect(h.toast.messages).toEqual([]);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      errorMessage: null,
      validationMessage: null,
      text: '내용',
      sending: false,
    });
    expect(h.navigator.closes).toBe(0);
    expect(h.emitted.map((e) => e.type)).toContain('session-expired');
  });

  it('REQ-FDBK-011 갱신 뒤에도 남은 401이면 로그인 화면으로 보낸다(오류 문구 없음)', async () => {
    const h = await createFeedbackHarness();
    h.router.set(POST_FEEDBACK, 'feedback/feedbacks__unauthorized');
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.viewModel.getSnapshot().errorMessage).toBeNull();
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-FDBK-024 REQ-FDBK-012 500은 fdbk.error.generic, 입력 유지, 요청 1회(자동 재시도 금지)다', async () => {
    const h = await createFeedbackHarness({
      routes: { [POST_FEEDBACK]: 'feedback/feedbacks__internal-error' },
    });
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(1);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      text: '내용',
      errorMessage: t('fdbk.error.generic'),
      sending: false,
      canSubmit: true,
    });
    expect(h.navigator.closes).toBe(0);
    expect(h.sleeper.calls).toEqual([]);
  });

  it('TC-FDBK-025 연결 실패는 common.error.network, 입력 유지, 재시도 없이 사용자가 다시 보낼 수 있다', async () => {
    const h = await createFeedbackHarness({
      routes: { [POST_FEEDBACK]: networkFailure() },
    });
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(1);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      text: '내용',
      errorMessage: t('common.error.network'),
      canSubmit: true,
    });
    h.router.set(POST_FEEDBACK, 'feedback/feedbacks__created');
    await h.viewModel.submit();
    expect(h.toast.messages).toEqual([t('fdbk.success')]);
  });

  it('TC-FDBK-025 REQ-FDBK-009 오류가 사라지는 시점: 다시 보내기 성공 뒤 오류 문구도 비워진다', async () => {
    const h = await createFeedbackHarness({
      routes: { [POST_FEEDBACK]: 'feedback/feedbacks__internal-error' },
    });
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    h.router.set(POST_FEEDBACK, 'feedback/feedbacks__created');
    await h.viewModel.submit();
    expect(h.viewModel.getSnapshot().errorMessage).toBeNull();
  });

  it('TC-FDBK-026 타임아웃 뒤 수동 재전송은 중복 제거 없이 한 번 더 보낸다(횟수 제한 없음)', async () => {
    const h = await createFeedbackHarness();
    h.router.set(POST_FEEDBACK, timeoutFailure());
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    expect(h.viewModel.getSnapshot().errorMessage).toBe(t('common.error.network'));
    h.router.set(POST_FEEDBACK, 'feedback/feedbacks__created');
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(1);
    expect(h.navigator.closes).toBe(1);
  });

  it('TC-FDBK-027 Retry-After가 있는 503은 재시도 없이 일반 오류 문구를 보인다', async () => {
    const h = await createFeedbackHarness({
      routes: { [POST_FEEDBACK]: 'common/error__service-unavailable-503' },
    });
    h.viewModel.onTextChange('내용');
    await h.viewModel.submit();
    expect(h.posts()).toHaveLength(1);
    expect(h.viewModel.getSnapshot().errorMessage).toBe(t('fdbk.error.generic'));
    expect(h.sleeper.calls).toEqual([]);
  });
});

describe('FeedbackViewModel 취소와 계정 전환', () => {
  it('TC-FDBK-029 전송 중 화면을 떠나면(dispose) 요청이 취소되고 오류·토스트·닫기가 없다', async () => {
    const h = await createFeedbackHarness();
    const post = holdPost(h);
    h.viewModel.onTextChange('내용');
    const sending = h.viewModel.submit();
    h.viewModel.dispose();
    post.release();
    await sending;
    await flush();
    expect(h.toast.messages).toEqual([]);
    expect(h.navigator.closes).toBe(0);
    expect(h.authFlow.calls).toEqual([]);
  });

  it('TC-FDBK-030 전송 중 로그아웃·계정 전환(clearAll)이면 늦은 응답이 토스트도 화면 전환도 일으키지 않는다', async () => {
    const h = await createFeedbackHarness();
    const post = holdPost(h);
    h.viewModel.onTextChange('내용');
    const sending = h.viewModel.submit();
    await h.viewModel.clearAll();
    post.release();
    await sending;
    await flush();
    expect(h.toast.messages).toEqual([]);
    expect(h.navigator.closes).toBe(0);
    expect(h.viewModel.getSnapshot()).toMatchObject({ text: '', sending: false });
  });

  it('TC-FDBK-030 clearAll 뒤 늦게 도착한 실패 응답도 오류 문구를 만들지 않는다', async () => {
    const h = await createFeedbackHarness();
    const post = holdPost(h, 'feedback/feedbacks__internal-error');
    h.viewModel.onTextChange('내용');
    const sending = h.viewModel.submit();
    await h.viewModel.clearAll();
    post.release();
    await sending;
    expect(h.viewModel.getSnapshot().errorMessage).toBeNull();
  });
});
