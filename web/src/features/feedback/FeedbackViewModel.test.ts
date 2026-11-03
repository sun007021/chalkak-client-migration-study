import { ToastController } from '../../core/ui/ToastController';
import { t } from '../../copy/ko';
import { makeApiEnv } from '../../test/apiEnv';
import { deferred } from '../../test/deferred';
import { flushAsync } from '../../test/FakeClock';
import { networkFailure } from '../../test/fakeFetch';
import { loadFixture, memberSession } from '../../test/fixtures';
import { COMBINED_EMOJI } from '../../test/settingsHarness';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { recordToasts } from '../../test/toastLog';
import { track } from '../../test/track';
import { FeedbackRepository } from './FeedbackRepository';
import { FeedbackViewModel } from './FeedbackViewModel';

const POST = 'POST /feedbacks';
const fixture = (path: string) => () => loadFixture(path).toResponse();
const created = fixture('feedback/feedbacks__created.json');

function setup() {
  const env = makeApiEnv(memberSession());
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const vm = new FeedbackViewModel({ repository: new FeedbackRepository({ api: env.client() }), toast });
  const bodies = () => env.ff.callsTo(POST).map((c) => JSON.parse(c.body as string) as { content: string });
  return { ...env, toast, toasts, vm, bodies };
}

describe('FeedbackViewModel 입력 상태', () => {
  it('TC-FDBK-003 초기 상태는 입력이 비어 있고 보내기가 비활성이다', () => {
    const { vm } = setup();
    expect(vm.state).toEqual({ text: '', count: 0, canSubmit: false, submitting: false, error: null });
  });

  it('TC-FDBK-004 공백만(스페이스, 탭, 개행, 전각 공백) 입력하면 count 0이고 보내기 비활성이며 submit은 요청 없이 무시된다', async () => {
    const { vm, ff } = setup();
    ff.route(POST, created);
    vm.setText(' \t\n　 ');
    expect(vm.state).toMatchObject({ count: 0, canSubmit: false });
    expect(await vm.submit()).toEqual({ kind: 'ignored' });
    expect(ff.callsTo(POST)).toHaveLength(0);
  });

  it('TC-FDBK-005 trim 후 1 code point면 보내기가 활성이다', () => {
    const { vm } = setup();
    vm.setText('  가 ');
    expect(vm.state).toMatchObject({ text: '  가 ', count: 1, canSubmit: true });
  });

  it('TC-FDBK-013 count는 항상 trim 후 code point 수와 같다(1000 초과도 그대로 센다)', () => {
    const { vm } = setup();
    for (const [text, count] of [['a', 1], ['  ab  ', 2], ['😀😀', 2], [COMBINED_EMOJI, 5], ['가'.repeat(1001), 1001], ['', 0]] as const) {
      vm.setText(text);
      expect(vm.state.count).toBe(count);
    }
  });

  it('REQ-FDBK-005 1000자를 넘어도 입력은 막지 않고 보내기도 활성이다(보내기 시점에 검증)', () => {
    const { vm } = setup();
    vm.setText('가'.repeat(1001));
    expect(vm.state).toMatchObject({ text: '가'.repeat(1001), count: 1001, canSubmit: true, error: null });
  });

  it('TC-FDBK-014 10만 자를 붙여 넣어도 count가 정확하고 전송은 거부된다', async () => {
    const { vm, ff } = setup();
    ff.route(POST, created);
    vm.setText('가'.repeat(100_000));
    expect(vm.state.count).toBe(100_000);
    expect(await vm.submit()).toEqual({ kind: 'failed' });
    expect(vm.state.error).toBe('invalid');
    expect(ff.callsTo(POST)).toHaveLength(0);
  });

  it('입력이 바뀌면 이전 오류 문구를 지운다', async () => {
    const { vm } = setup();
    vm.setText('가'.repeat(1001));
    await vm.submit();
    expect(vm.state.error).toBe('invalid');
    vm.setText('가'.repeat(1000));
    expect(vm.state.error).toBeNull();
  });
});

describe('FeedbackViewModel 길이 경계', () => {
  it('TC-FDBK-006 정확히 1000 code point면 허용되고 요청이 나간다', async () => {
    const { vm, ff, bodies } = setup();
    ff.route(POST, created);
    vm.setText('가'.repeat(1000));
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(bodies()).toEqual([{ content: '가'.repeat(1000) }]);
  });

  it('TC-FDBK-007 1001 code point면 요청 0건이고 fdbk.error.invalid를 보인다', async () => {
    const { vm, ff } = setup();
    ff.route(POST, created);
    vm.setText('가'.repeat(1001));
    expect(await vm.submit()).toEqual({ kind: 'failed' });
    expect(vm.state.error).toBe('invalid');
    expect(vm.state.text).toBe('가'.repeat(1001)); // 입력 유지
    expect(ff.callsTo(POST)).toHaveLength(0);
  });

  it('TC-FDBK-008 앞뒤 공백 포함 1002자, trim 후 1000자면 허용되고 서버로 가는 content는 trim 값이다', async () => {
    const { vm, ff, bodies } = setup();
    ff.route(POST, created);
    vm.setText(` ${'가'.repeat(1000)}\n`);
    await vm.submit();
    expect(bodies()).toEqual([{ content: '가'.repeat(1000) }]);
  });

  it('TC-FDBK-009 이모지 1000개는 허용, 1001개는 거부', async () => {
    const ok = setup();
    ok.ff.route(POST, created);
    ok.vm.setText('😀'.repeat(1000));
    expect(await ok.vm.submit()).toEqual({ kind: 'sent' });
    const tooLong = setup();
    tooLong.ff.route(POST, created);
    tooLong.vm.setText('😀'.repeat(1001));
    expect(await tooLong.vm.submit()).toEqual({ kind: 'failed' });
    expect(tooLong.ff.callsTo(POST)).toHaveLength(0);
  });

  it('TC-FDBK-010 결합 이모지 200개는 허용, 201개는 거부(grapheme로 세지 않는다)', async () => {
    const ok = setup();
    ok.ff.route(POST, created);
    ok.vm.setText(COMBINED_EMOJI.repeat(200));
    expect(await ok.vm.submit()).toEqual({ kind: 'sent' });
    const tooLong = setup();
    tooLong.ff.route(POST, created);
    tooLong.vm.setText(COMBINED_EMOJI.repeat(201));
    expect(await tooLong.vm.submit()).toEqual({ kind: 'failed' });
    expect(tooLong.ff.callsTo(POST)).toHaveLength(0);
  });

  it('TC-FDBK-011 분해형 한글은 정규화하지 않고 code point 그대로 세며 서버로도 그대로 간다', async () => {
    const { vm, ff, bodies } = setup();
    ff.route(POST, created);
    const nfd = '한'.normalize('NFD');
    vm.setText(nfd);
    expect(vm.state.count).toBe(3);
    await vm.submit();
    expect(bodies()).toEqual([{ content: nfd }]);
  });

  it('TC-FDBK-012 중간의 개행·연속 공백은 보존하고 앞뒤만 제거해 보낸다', async () => {
    const { vm, ff, bodies } = setup();
    ff.route(POST, created);
    vm.setText('\n  첫 줄\n\n  둘째    줄  \n');
    await vm.submit();
    expect(bodies()).toEqual([{ content: '첫 줄\n\n  둘째    줄' }]);
  });
});

describe('FeedbackViewModel 전송', () => {
  it('REQ-FDBK-006 TC-FDBK-018 전송 중에는 submitting이고 보내기가 비활성이다. 입력 변경은 무시된다', async () => {
    const { vm, ff } = setup();
    const gate = deferred<Response>();
    ff.route(POST, () => gate.promise);
    vm.setText('내용');
    const run = vm.submit();
    expect(vm.state).toMatchObject({ submitting: true, canSubmit: false });
    vm.setText('바뀐 내용');
    expect(vm.state.text).toBe('내용');
    gate.resolve(created());
    await run;
    expect(vm.state.submitting).toBe(false);
  });

  it('TC-FDBK-019 보내기를 3회 연타해도 POST는 1회뿐이고 나머지는 무시된다', async () => {
    const { vm, ff } = setup();
    const gate = deferred<Response>();
    ff.route(POST, () => gate.promise);
    vm.setText('내용');
    const runs = [vm.submit(), vm.submit(), vm.submit()];
    gate.resolve(created());
    expect(await Promise.all(runs)).toEqual([{ kind: 'sent' }, { kind: 'ignored' }, { kind: 'ignored' }]);
    expect(ff.callsTo(POST)).toHaveLength(1);
  });

  it('TC-FDBK-017 REQ-FDBK-008 201이면 토스트 fdbk.success를 한 번 보이고 입력을 비운다', async () => {
    const { vm, ff, toasts } = setup();
    ff.route(POST, created);
    vm.setText('좋아요');
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(toasts.messages).toEqual([t('fdbk.success')]);
    expect(vm.state).toEqual({ text: '', count: 0, canSubmit: false, submitting: false, error: null });
  });

  it('TC-FDBK-020 성공한 뒤 같은 화면에서 다시 보내려 해도 이전 내용은 남아 있지 않다(비어 있으면 무시)', async () => {
    const { vm, ff } = setup();
    ff.route(POST, created);
    vm.setText('좋아요');
    await vm.submit();
    expect(await vm.submit()).toEqual({ kind: 'ignored' });
    expect(ff.callsTo(POST)).toHaveLength(1);
  });

  it('TC-FDBK-021 REQ-FDBK-010 400 BUSINESS_ERROR는 서버 message 대신 고정 문구(fdbk.error.invalid) 종류이고 입력은 유지된다', async () => {
    for (const name of ['feedbacks__bad-request-blank', 'feedbacks__bad-request-too-long']) {
      const { vm, ff, toasts } = setup();
      ff.route(POST, fixture(`feedback/${name}.json`));
      vm.setText('내용');
      expect(await vm.submit()).toEqual({ kind: 'failed' });
      expect(vm.state).toMatchObject({ text: '내용', error: 'invalid', submitting: false, canSubmit: true });
      expect(toasts.messages).toEqual([]);
    }
  });

  it('TC-FDBK-024 REQ-FDBK-012 500은 generic 오류이고 입력을 유지하며 요청은 1회뿐이다(자동 재시도 없음)', async () => {
    const { vm, ff, clock } = setup();
    ff.route(POST, fixture('feedback/feedbacks__internal-error.json'));
    vm.setText('내용');
    const run = track(vm.submit());
    await clock.advance(10_000);
    expect(run.value).toEqual({ kind: 'failed' });
    expect(vm.state).toMatchObject({ text: '내용', error: 'generic' });
    expect(ff.callsTo(POST)).toHaveLength(1);
  });

  it('TC-FDBK-025 연결 실패는 network 오류이고 재시도 없이, 입력 유지 상태로 다시 보낼 수 있다', async () => {
    const { vm, ff, clock, bodies } = setup();
    ff.route(POST, networkFailure, created);
    vm.setText('내용');
    const first = track(vm.submit());
    await clock.advance(10_000);
    expect(first.value).toEqual({ kind: 'failed' });
    expect(vm.state).toMatchObject({ text: '내용', error: 'network', canSubmit: true });
    expect(ff.callsTo(POST)).toHaveLength(1);
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(bodies()).toEqual([{ content: '내용' }, { content: '내용' }]);
    expect(vm.state.error).toBeNull();
  });

  it('TC-FDBK-025 응답이 15초 안에 오지 않으면(타임아웃) network 오류이고 재시도하지 않는다', async () => {
    const { vm, ff, clock } = setup();
    ff.route(POST, () => new Promise<Response>(() => {}));
    vm.setText('내용');
    const run = track(vm.submit());
    await clock.advance(15_000);
    await clock.advance(30_000);
    expect(run.value).toEqual({ kind: 'failed' });
    expect(vm.state).toMatchObject({ text: '내용', error: 'network' });
    expect(ff.callsTo(POST)).toHaveLength(1);
  });

  it('TC-FDBK-026 타임아웃 뒤 수동 재전송은 중복 제거 없이 한 번 더 보낸다(제출 횟수 제한 없음)', async () => {
    const { vm, ff, clock } = setup();
    ff.route(POST, () => new Promise<Response>(() => {}), created);
    vm.setText('내용');
    const first = track(vm.submit());
    await clock.advance(15_000);
    expect(first.value).toEqual({ kind: 'failed' });
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(ff.callsTo(POST)).toHaveLength(2);
  });

  it('TC-FDBK-027 503 Retry-After와 429도 재시도 없이 generic 오류이다', async () => {
    for (const name of ['common/error__service-unavailable-503.json', 'common/error__rate-limited-429.json']) {
      const { vm, ff, clock } = setup();
      ff.route(POST, fixture(name));
      vm.setText('내용');
      const run = track(vm.submit());
      await clock.advance(60_000);
      expect(run.value).toEqual({ kind: 'failed' });
      expect(vm.state.error).toBe('generic');
      expect(ff.callsTo(POST)).toHaveLength(1);
    }
  });

  it('TC-FDBK-022 401 UNAUTHORIZED는 refresh 뒤 원 요청을 한 번 다시 보내 성공하면 정상 완료한다', async () => {
    const { vm, ff, toasts } = setup();
    ff.route(POST, fixture('feedback/feedbacks__unauthorized.json'), created);
    ff.route('POST /auth/refresh', fixture('auth/refresh__success.json'));
    vm.setText('내용');
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(ff.callsTo(POST)).toHaveLength(2);
    expect(toasts.messages).toEqual([t('fdbk.success')]);
  });

  it('TC-FDBK-023 REQ-FDBK-011 REAUTHENTICATION_REQUIRED면 오류 문구·토스트 없이 끝난다(로그인 이동은 세션 이벤트가 맡는다)', async () => {
    const { vm, ff, toasts, expired } = setup();
    ff.route(POST, fixture('feedback/feedbacks__unauthorized.json'));
    ff.route('POST /auth/refresh', fixture('auth/refresh__reauthentication-required.json'));
    vm.setText('내용');
    expect(await vm.submit()).toEqual({ kind: 'abandoned' });
    expect(vm.state.error).toBeNull();
    expect(toasts.messages).toEqual([]);
    expect(expired.count).toBe(1);
  });

  it('TC-FDBK-028 REQ-FDBK-013 정지(BANNED) 회원도 201이면 정지 안내 없이 성공한다', async () => {
    const { vm, ff, toasts } = setup();
    ff.route(POST, created);
    vm.setText('내용');
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(toasts.messages).toEqual([t('fdbk.success')]);
  });

  it('REQ-FDBK-009 실패한 뒤 다시 보내면 오류 문구를 지우고 같은 내용을 보낸다', async () => {
    const { vm, ff, clock } = setup();
    ff.route(POST, fixture('feedback/feedbacks__internal-error.json'), created);
    vm.setText('내용');
    const first = track(vm.submit());
    await clock.advance(10_000);
    expect(first.value).toEqual({ kind: 'failed' });
    expect(vm.state).toMatchObject({ text: '내용', error: 'generic' });
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(vm.state.error).toBeNull();
  });
});

describe('FeedbackViewModel 취소·계정 전환', () => {
  it('TC-FDBK-029 전송 중 dispose(화면 이탈)하면 요청을 취소하고 abandoned이며 오류 문구·토스트가 없다', async () => {
    const { vm, ff, toasts } = setup();
    ff.route(POST, () => new Promise<Response>(() => {}));
    vm.setText('내용');
    const run = vm.submit();
    await flushAsync();
    vm.dispose();
    expect(await run).toEqual({ kind: 'abandoned' });
    expect(ff.callsTo(POST)[0]!.signal?.aborted).toBe(true);
    expect(vm.state.error).toBeNull();
    expect(toasts.messages).toEqual([]);
  });

  it('TC-FDBK-030 dispose 뒤에 성공 응답이 늦게 와도 토스트도 입력 비우기도 일으키지 않는다', async () => {
    const { vm, ff, toasts } = setup();
    const gate = deferred<Response>();
    ff.route(POST, () => gate.promise);
    vm.setText('내용');
    const run = vm.submit();
    await flushAsync();
    vm.dispose();
    gate.resolve(created());
    expect(await run).toEqual({ kind: 'abandoned' });
    expect(toasts.messages).toEqual([]);
    expect(vm.state.text).toBe('내용');
  });

  it('TC-FDBK-030 dispose 뒤에 실패 응답이 늦게 와도 오류 문구를 만들지 않는다', async () => {
    const { vm, ff, toasts, clock } = setup();
    const gate = deferred<Response>();
    ff.route(POST, () => gate.promise);
    vm.setText('내용');
    const run = track(vm.submit());
    await flushAsync();
    vm.dispose();
    gate.resolve(fixture('feedback/feedbacks__internal-error.json')());
    await clock.advance(5_000);
    expect(run.value).toEqual({ kind: 'abandoned' });
    expect(vm.state.error).toBeNull();
    expect(toasts.messages).toEqual([]);
  });

  it('TC-FDBK-034 D-22 전송 성공·실패 뒤에도 피드백 내용이 로그에 남지 않는다', async () => {
    const secret = '비밀스러운 피드백 문장 12345';
    const ok = setup();
    ok.ff.route(POST, created);
    ok.vm.setText(secret);
    await ok.vm.submit();
    expect(ok.logger.dump()).not.toContain(secret);
    const failed = setup();
    failed.ff.route(POST, fixture('feedback/feedbacks__internal-error.json'));
    failed.vm.setText(secret);
    const run = track(failed.vm.submit());
    await failed.clock.advance(10_000);
    expect(run.state).toBe('fulfilled');
    expect(failed.logger.dump()).not.toContain(secret);
  });
});
