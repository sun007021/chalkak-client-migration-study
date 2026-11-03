import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { networkFailure } from '../../test/fakeFetch';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { createGateHarness, REFRESH, settleMore, TODAY } from '../../test/uploadHarness';
import type { GateHarness } from '../../test/uploadHarness';

const press = async (h: GateHarness) => {
  h.gate.start();
  await settleMore();
  // 재시도 백오프(0.5초, 1초)는 가짜 시계로 소화한다. 성공 경로는 시계를 움직이지 않는다.
  for (let i = 0; i < 20 && h.gate.state.checking; i += 1) {
    await h.clock.advance(500);
    await settleMore();
  }
};

/** 응답을 직접 풀어 줄 때까지 붙잡아 두는 GET /posts/today. */
function holdToday(h: GateHarness) {
  const gate = deferred<Response>();
  h.router.set(TODAY, () => gate.promise);
  return { release: (fixture: string) => gate.resolve(loadFixture(`${fixture}.json`).toResponse()) };
}

describe('UploadGate 게스트 (REQ-UPL-001, D-05)', () => {
  it('TC-UPL-001 게스트는 로그인 안내 토스트만 보이고 네트워크 요청이 0건이며 업로드 화면이 열리지 않는다', async () => {
    const h = createGateHarness({ mode: 'guest' });
    await press(h);
    expect(h.toasts.messages).toEqual([t('upload.gate.login-required')]);
    expect(h.toasts.messages[0]).toBe('게시물을 추가하려면 로그인이 필요해요');
    expect(h.ff.calls).toHaveLength(0);
    expect(h.navigator.opened).toEqual([]);
    expect(h.gate.state.checking).toBe(false);
  });

  it('TC-UPL-001 게스트는 몇 번을 눌러도 요청 0건이고 누를 때마다 토스트를 보인다', async () => {
    const h = createGateHarness({ mode: 'guest' });
    await press(h);
    await press(h);
    expect(h.toasts.messages).toHaveLength(2);
    expect(h.ff.calls).toHaveLength(0);
  });
});

describe('UploadGate 회원 (REQ-UPL-002~007)', () => {
  it('TC-UPL-002 미작성이면 GET /posts/today 1회 뒤 업로드 화면을 열고 토스트는 없다', async () => {
    const h = createGateHarness();
    await press(h);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(1);
    expect(h.ff.calls).toHaveLength(1);
    expect(h.navigator.opened).toEqual([{ topicDate: '2026-10-27' }]);
    expect(h.toasts.messages).toEqual([]);
    expect(h.gate.state.checking).toBe(false);
  });

  it('TC-UPL-002 열 때 쓰는 날짜는 기기 시계가 아니라 응답의 topicDate다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: 'upload/posts-today__topic-date-changed' } });
    await press(h);
    expect(h.navigator.opened).toEqual([{ topicDate: '2026-10-28' }]);
  });

  it.each([
    ['VALIDATING', 'home/posts-today__posted-validating'],
    ['PENDING', 'home/posts-today__posted-pending'],
    ['APPROVED', 'home/posts-today__posted-approved'],
  ])('TC-UPL-003 오늘 이미 작성(%s)이면 안내 토스트만 보이고 화면을 열지 않는다', async (_status, fixture) => {
    const h = createGateHarness({ routes: { [TODAY]: fixture } });
    await press(h);
    expect(h.toasts.messages).toEqual(['이미 이 주제에 게시물을 작성했어요.']);
    expect(h.navigator.opened).toEqual([]);
  });

  it('TC-UPL-004 참여 가능한 주제가 없으면(404) 안내 토스트다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: 'home/posts-today__404-no-open-topic' } });
    await press(h);
    expect(h.toasts.messages).toEqual(['지금 참여할 수 있는 주제가 없어요.']);
    expect(h.navigator.opened).toEqual([]);
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-UPL-005 정지 회원(403)이면 안내 토스트이고 같은 요청을 다시 보내지 않는다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: 'home/posts-today__403-banned' } });
    await press(h);
    await h.clock.advance(5_000);
    await settleMore();
    expect(h.toasts.messages).toEqual(['이용이 정지되어 게시물을 작성할 수 없어요.']);
    expect(h.navigator.opened).toEqual([]);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(1);
  });

  it('TC-UPL-006 401은 refresh 뒤 1회 재전송하고 통과하면 업로드 화면을 연다(토스트 없음)', async () => {
    const h = createGateHarness({
      routes: { [TODAY]: ['home/posts-today__401-unauthorized', 'upload/posts-today__not-posted'], [REFRESH]: 'auth/refresh__success' },
    });
    await press(h);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(2);
    expect(h.navigator.opened).toEqual([{ topicDate: '2026-10-27' }]);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-UPL-006 재인증이 필요하면(REAUTHENTICATION_REQUIRED) 게이트는 토스트도 이동도 하지 않는다(로그인 화면은 세션 이벤트가 연다)', async () => {
    const h = createGateHarness({
      routes: { [TODAY]: 'home/posts-today__401-unauthorized', [REFRESH]: 'auth/refresh__reauthentication-required' },
    });
    await press(h);
    expect(h.expired.count).toBe(1);
    expect(h.toasts.messages).toEqual([]);
    expect(h.navigator.opened).toEqual([]);
    expect(h.gate.state.checking).toBe(false);
  });

  it('TC-UPL-007 서버 오류는 GET 재시도(0.5초, 1초) 뒤 확인 실패 토스트이고 화면을 열지 않는다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: 'home/posts-today__500-server-error' } });
    await press(h);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(3);
    expect(h.toasts.messages).toEqual(['게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요.']);
    expect(h.navigator.opened).toEqual([]);
  });

  it('TC-UPL-007 연결 실패도 같은 확인 실패 토스트다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: networkFailure } });
    await press(h);
    expect(h.toasts.messages).toEqual([t('upload.gate.check-failed')]);
    expect(h.navigator.opened).toEqual([]);
  });

  it.each([
    ['알 수 없는 moderationStatus', 'home/posts-today__unknown-status'],
    ['미작성인데 post 필드가 있음(TC-UPL-008)', 'upload/posts-today__invalid-not-posted-with-post'],
  ])('TC-UPL-007 TC-UPL-008 계약 위반(%s)은 확인 실패 토스트다', async (_name, fixture) => {
    const h = createGateHarness({ routes: { [TODAY]: fixture } });
    await press(h);
    expect(h.toasts.messages).toEqual([t('upload.gate.check-failed')]);
    expect(h.navigator.opened).toEqual([]);
  });

  it('TC-UPL-008 본문이 JSON이 아닌 200도 확인 실패다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: () => json(200, { unexpected: true }) } });
    await press(h);
    expect(h.toasts.messages).toEqual([t('upload.gate.check-failed')]);
  });

  it('TC-UPL-007 실패한 뒤 다시 누르면 새로 확인한다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: 'home/posts-today__500-server-error' } });
    await press(h);
    h.router.set(TODAY, 'upload/posts-today__not-posted');
    await press(h);
    expect(h.navigator.opened).toEqual([{ topicDate: '2026-10-27' }]);
  });
});

describe('UploadGate 중복·취소 (REQ-UPL-002, 011)', () => {
  it('TC-UPL-009 확인 중에는 연타해도 GET /posts/today가 1번만 나가고 화면도 한 번만 열린다', async () => {
    const h = createGateHarness();
    const held = holdToday(h);
    h.gate.start();
    await settleMore();
    expect(h.gate.state.checking).toBe(true);
    h.gate.start();
    h.gate.start();
    await settleMore();
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(1);
    held.release('upload/posts-today__not-posted');
    await settleMore();
    expect(h.navigator.opened).toHaveLength(1);
    expect(h.gate.state.checking).toBe(false);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-UPL-009 확인이 끝나면 다시 누를 수 있다(두 번째 확인은 새 요청)', async () => {
    const h = createGateHarness({ routes: { [TODAY]: 'home/posts-today__posted-pending' } });
    await press(h);
    await press(h);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(2);
    expect(h.toasts.messages).toHaveLength(2);
  });

  it('TC-UPL-010 대기 중 cancel하면 요청을 abort하고 뒤늦은 응답이 와도 이동도 토스트도 없다', async () => {
    const h = createGateHarness();
    const held = holdToday(h);
    h.gate.start();
    await settleMore();
    const signal = h.ff.callsTo('GET /posts/today')[0]!.signal;
    h.gate.cancel();
    await settleMore();
    expect(signal?.aborted).toBe(true);
    held.release('upload/posts-today__not-posted');
    await settleMore();
    expect(h.navigator.opened).toEqual([]);
    expect(h.toasts.messages).toEqual([]);
    expect(h.gate.state.checking).toBe(false);
  });

  it('TC-UPL-010 대기 중 cancel한 요청의 실패 응답도 토스트로 보이지 않는다', async () => {
    const h = createGateHarness({ routes: { [TODAY]: 'home/posts-today__500-server-error' } });
    h.gate.start();
    await settleMore();
    h.gate.cancel();
    await h.clock.advance(5_000);
    await settleMore();
    expect(h.toasts.messages).toEqual([]);
    expect(h.navigator.opened).toEqual([]);
  });

  it('TC-UPL-010 cancel한 뒤 다시 누르면 새 확인이 정상 동작한다', async () => {
    const h = createGateHarness();
    const held = holdToday(h);
    h.gate.start();
    await settleMore();
    h.gate.cancel();
    held.release('home/posts-today__posted-pending');
    await settleMore();
    h.router.set(TODAY, 'upload/posts-today__not-posted');
    await press(h);
    expect(h.navigator.opened).toEqual([{ topicDate: '2026-10-27' }]);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-UPL-010 세션을 읽는 중에 cancel하면 뒤늦게 시작할 요청도 보내지 않는다', async () => {
    const h = createGateHarness();
    h.gate.start();
    h.gate.cancel(); // mode()가 아직 끝나지 않은 순간
    await settleMore();
    expect(h.ff.calls).toHaveLength(0);
    expect(h.navigator.opened).toEqual([]);
  });

  it('TC-UPL-010 게스트에서도 세션을 읽는 중에 cancel하면 토스트가 뜨지 않는다', async () => {
    const h = createGateHarness({ mode: 'guest' });
    h.gate.start();
    h.gate.cancel();
    await settleMore();
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-UPL-010 cancel은 확인 중이 아닐 때 아무 일도 하지 않는다', async () => {
    const h = createGateHarness();
    h.gate.cancel();
    await press(h);
    expect(h.navigator.opened).toHaveLength(1);
  });

  it('TC-UPL-010 dispose하면 대기 중 요청을 취소하고 이후 start()는 요청 0건이다', async () => {
    const h = createGateHarness();
    const held = holdToday(h);
    h.gate.start();
    await settleMore();
    const signal = h.ff.callsTo('GET /posts/today')[0]!.signal;
    h.gate.dispose();
    expect(signal?.aborted).toBe(true);
    held.release('upload/posts-today__not-posted');
    await settleMore();
    expect(h.navigator.opened).toEqual([]);
    const before = h.ff.calls.length;
    h.gate.start();
    await settleMore();
    expect(h.ff.calls).toHaveLength(before);
    expect(h.toasts.messages).toEqual([]);
  });
});
