import { ToastController } from '../../core/ui/ToastController';
import { t } from '../../copy/ko';
import { makeApiEnv } from '../../test/apiEnv';
import { deferred } from '../../test/deferred';
import { flushAsync } from '../../test/FakeClock';
import { loadFixture, memberSession } from '../../test/fixtures';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { recordToasts } from '../../test/toastLog';
import { track } from '../../test/track';
import { NotificationSettingsRepository } from './NotificationSettingsRepository';
import type { PushSettingKey } from './NotificationSettingsRepository';
import { NotificationSettingsStore } from './NotificationSettingsStore';

const GET = 'GET /notification-settings';
const PATCH = 'PATCH /notification-settings';
const fixture = (path: string) => () => loadFixture(path).toResponse();
const allTrue = fixture('settings/notification-settings__get-all-true.json');
const topicOff = fixture('settings/notification-settings__get-topic-off.json');
const noContent = fixture('settings/notification-settings__patch-no-content.json');
const patchFails = fixture('settings/notification-settings__patch-internal-error.json');
const ON = { topicPushEnabled: true, moderationPushEnabled: true, aiReviewPushEnabled: true };

function setup() {
  const env = makeApiEnv(memberSession());
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  const toasts = recordToasts(toast);
  const store = new NotificationSettingsStore({ repository: new NotificationSettingsRepository({ api: env.client() }), toast });
  const patchBodies = () => env.ff.callsTo(PATCH).map((c) => JSON.parse(c.body as string) as unknown);
  return { ...env, toast, toasts, store, patchBodies };
}
type Ctx = ReturnType<typeof setup>;

/** GET을 성공시켜 ready 상태로 만든다. */
async function ready(ctx: Ctx, get = allTrue): Promise<void> {
  ctx.ff.route(GET, get);
  await ctx.store.load();
}

describe('NotificationSettingsStore.load', () => {
  it('REQ-SET-008 처음에는 idle이고 값이 없다. load가 시작되면 loading, 성공하면 세 값을 담은 ready이다', async () => {
    const ctx = setup();
    expect(ctx.store.state).toMatchObject({ status: 'idle', values: null });
    const gate = deferred<Response>();
    ctx.ff.route(GET, () => gate.promise);
    const run = ctx.store.load();
    expect(ctx.store.state.status).toBe('loading');
    gate.resolve(allTrue());
    await run;
    expect(ctx.store.state).toMatchObject({ status: 'ready', values: ON });
    expect(ctx.store.state.saving).toEqual({ topicPushEnabled: false, moderationPushEnabled: false, aiReviewPushEnabled: false });
  });

  it('TC-SET-007 조회가 진행 중일 때 다시 load해도 요청은 한 번이다', async () => {
    const ctx = setup();
    const gate = deferred<Response>();
    ctx.ff.route(GET, () => gate.promise);
    const a = ctx.store.load();
    const b = ctx.store.load();
    gate.resolve(allTrue());
    await Promise.all([a, b]);
    expect(ctx.ff.callsTo(GET)).toHaveLength(1);
  });

  it('TC-SET-014 TC-SET-018 서버가 꺼 둔 항목은 꺼진 채로 담는다', async () => {
    const ctx = setup();
    await ready(ctx, topicOff);
    expect(ctx.store.state.values).toEqual({ topicPushEnabled: false, moderationPushEnabled: true, aiReviewPushEnabled: true });
  });

  it('TC-SET-016 REQ-SET-010 조회가 실패하면(5xx, 재시도 소진) error 상태이고 값을 지어내지 않으며 토스트 settings.push.load-error를 한 번 보인다', async () => {
    const ctx = setup();
    ctx.ff.route(GET, fixture('settings/notification-settings__get-internal-error.json'));
    const run = track(ctx.store.load());
    await ctx.clock.advance(5_000);
    expect(run.state).toBe('fulfilled'); // load는 던지지 않는다
    expect(ctx.store.state).toMatchObject({ status: 'error', values: null });
    expect(ctx.toasts.messages).toEqual([t('settings.push.load-error')]);
    expect(ctx.ff.callsTo(GET)).toHaveLength(3); // GET은 멱등이라 D-21 재시도
  });

  it('TC-SET-015 세 필드 중 하나가 없거나 null인 응답은 잘못된 응답이라 error 상태(토글 사용 불가)이다', async () => {
    for (const name of ['get-field-missing', 'get-null-field']) {
      const ctx = setup();
      ctx.ff.route(GET, fixture(`settings/notification-settings__${name}.json`));
      await ctx.store.load();
      expect(ctx.store.state).toMatchObject({ status: 'error', values: null });
      expect(ctx.toasts.messages).toEqual([t('settings.push.load-error')]);
    }
  });

  it('REQ-SET-010 error 뒤 다시 load하면 재조회하고 성공하면 ready로 돌아온다', async () => {
    const ctx = setup();
    ctx.ff.route(GET, fixture('settings/notification-settings__get-field-missing.json'), allTrue);
    await ctx.store.load();
    expect(ctx.store.state.status).toBe('error');
    await ctx.store.load();
    expect(ctx.store.state).toMatchObject({ status: 'ready', values: ON });
  });

  it('REQ-SET-008 다시 load하는 동안(탭이 다시 보임)에는 loading이라 toggle이 무시된다', async () => {
    const ctx = setup();
    const gate = deferred<Response>();
    ctx.ff.route(GET, allTrue, () => gate.promise);
    ctx.ff.route(PATCH, noContent);
    await ctx.store.load();
    const reload = ctx.store.load();
    expect(ctx.store.state.status).toBe('loading');
    await ctx.store.toggle('topicPushEnabled');
    expect(ctx.ff.callsTo(PATCH)).toHaveLength(0);
    gate.resolve(topicOff());
    await reload;
    expect(ctx.store.state.values).toMatchObject({ topicPushEnabled: false });
  });

  it('TC-SET-033 재조회가 실패하면 오래된 서버 값을 비우고, 이어지는 toggle은 PATCH를 보내지 않는다', async () => {
    const ctx = setup();
    ctx.ff.route(GET, allTrue, fixture('settings/notification-settings__get-internal-error.json'));
    ctx.ff.route(PATCH, noContent);
    await ctx.store.load();
    const reload = track(ctx.store.load());
    await ctx.clock.advance(5_000);
    expect(reload.state).toBe('fulfilled');
    expect(ctx.store.state).toMatchObject({ status: 'error', values: null });
    await ctx.store.toggle('moderationPushEnabled');
    expect(ctx.ff.callsTo(PATCH)).toHaveLength(0);
  });

  it('TC-SET-032 clear(계정 전환) 뒤에 이전 계정의 조회 응답이 늦게 도착해도 반영하지 않는다', async () => {
    const ctx = setup();
    const gate = deferred<Response>();
    ctx.ff.route(GET, () => gate.promise);
    const run = ctx.store.load();
    ctx.store.clear();
    gate.resolve(topicOff());
    await run;
    expect(ctx.store.state).toMatchObject({ status: 'idle', values: null });
    expect(ctx.toasts.messages).toEqual([]);
  });

  it('TC-SET-032 clear 뒤에 이전 계정의 조회가 늦게 실패해도 새 계정 화면에 토스트가 뜨지 않는다', async () => {
    const ctx = setup();
    const gate = deferred<Response>();
    ctx.ff.route(GET, () => gate.promise);
    const run = ctx.store.load();
    ctx.store.clear();
    gate.resolve(fixture('settings/notification-settings__get-internal-error.json')());
    await ctx.clock.advance(5_000);
    await run;
    expect(ctx.store.state.status).toBe('idle');
    expect(ctx.toasts.messages).toEqual([]);
  });

  it('TC-SET-037 REQ-SET-020 clear하면 이전 계정의 값이 남지 않고 idle로 돌아가며, 다시 load하면 새로 조회한다', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.store.clear();
    expect(ctx.store.state).toMatchObject({ status: 'idle', values: null });
  });

  it('TC-SET-037 clear 뒤 load는 GET을 다시 보낸다(캐시 값을 재사용하지 않는다)', async () => {
    const ctx = setup();
    ctx.ff.route(GET, allTrue, topicOff);
    await ctx.store.load();
    ctx.store.clear();
    await ctx.store.load();
    expect(ctx.ff.callsTo(GET)).toHaveLength(2);
    expect(ctx.store.state.values).toMatchObject({ topicPushEnabled: false });
  });
});

describe('NotificationSettingsStore.toggle', () => {
  it('TC-SET-023 REQ-SET-011 응답을 기다리지 않고 즉시 반대 값으로 보이고 그 항목만 saving이다', async () => {
    const ctx = setup();
    await ready(ctx);
    const gate = deferred<Response>();
    ctx.ff.route(PATCH, () => gate.promise);
    const run = ctx.store.toggle('topicPushEnabled');
    expect(ctx.store.state.values).toEqual({ ...ON, topicPushEnabled: false });
    expect(ctx.store.state.saving).toEqual({ topicPushEnabled: true, moderationPushEnabled: false, aiReviewPushEnabled: false });
    gate.resolve(noContent());
    await run;
    expect(ctx.store.state.saving.topicPushEnabled).toBe(false);
  });

  it.each<[string, PushSettingKey]>([
    ['TC-SET-019', 'topicPushEnabled'],
    ['TC-SET-020', 'moderationPushEnabled'],
    ['TC-SET-021', 'aiReviewPushEnabled'],
  ])('%s %s를 끄면 PATCH 바디는 그 항목 하나뿐이다', async (_tc, key) => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, noContent);
    await ctx.store.toggle(key);
    expect(ctx.patchBodies()).toEqual([{ [key]: false }]);
    expect(ctx.store.state.values).toEqual({ ...ON, [key]: false });
  });

  it('REQ-SET-012 꺼진 항목을 켜면 true 하나만 보낸다. 성공해도 서버 값으로 다시 덮어쓰지(GET) 않는다', async () => {
    const ctx = setup();
    await ready(ctx, topicOff);
    ctx.ff.route(PATCH, noContent);
    await ctx.store.toggle('topicPushEnabled');
    expect(ctx.patchBodies()).toEqual([{ topicPushEnabled: true }]);
    expect(ctx.store.state.values).toEqual(ON);
    expect(ctx.ff.callsTo(GET)).toHaveLength(1);
  });

  it('TC-SET-024 TC-SET-035 저장이 실패하면 재시도(0.5초, 1초)가 끝난 뒤에야 그 항목만 이전 값으로 돌아오고 토스트 settings.push.save-error를 한 번 보인다', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, patchFails);
    const run = track(ctx.store.toggle('aiReviewPushEnabled'));
    await ctx.clock.advance(1_000);
    expect(ctx.store.state.values).toEqual({ ...ON, aiReviewPushEnabled: false }); // 재시도 중에는 낙관적 값 유지
    expect(ctx.toasts.messages).toEqual([]);
    await ctx.clock.advance(1_000);
    expect(run.state).toBe('fulfilled');
    expect(ctx.ff.callsTo(PATCH)).toHaveLength(3);
    expect(ctx.store.state.values).toEqual(ON);
    expect(ctx.store.state.saving.aiReviewPushEnabled).toBe(false);
    expect(ctx.toasts.messages).toEqual(['알림 설정을 저장하지 못했어요. 다시 시도해 주세요.']);
  });

  it('TC-SET-024 연결 실패도 같은 방식으로 되돌리고 토스트를 보인다', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, () => {
      throw new TypeError('Failed to fetch');
    });
    const run = track(ctx.store.toggle('topicPushEnabled'));
    await ctx.clock.advance(5_000);
    expect(run.state).toBe('fulfilled');
    expect(ctx.store.state.values).toEqual(ON);
    expect(ctx.toasts.messages).toEqual([t('settings.push.save-error')]);
  });

  it.each<[string, PushSettingKey, PushSettingKey]>([
    ['TC-SET-025', 'topicPushEnabled', 'moderationPushEnabled'],
    ['TC-SET-026', 'moderationPushEnabled', 'topicPushEnabled'],
    ['TC-SET-027', 'aiReviewPushEnabled', 'topicPushEnabled'],
  ])('%s %s 저장이 실패해도 이미 성공한 %s 변경은 유지된다', async (_tc, failing, succeeded) => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, noContent, patchFails);
    await ctx.store.toggle(succeeded);
    const run = track(ctx.store.toggle(failing));
    await ctx.clock.advance(5_000);
    expect(run.state).toBe('fulfilled');
    expect(ctx.store.state.values).toEqual({ ...ON, [succeeded]: false });
  });

  it('REQ-SET-013 한 항목의 실패는 진행 중인 다른 항목의 요청에 영향을 주지 않는다', async () => {
    const ctx = setup();
    await ready(ctx);
    const other = deferred<Response>();
    ctx.ff.route(PATCH, (req) => (JSON.parse(req.body as string).moderationPushEnabled !== undefined ? other.promise : patchFails()));
    const moderation = ctx.store.toggle('moderationPushEnabled');
    const topic = track(ctx.store.toggle('topicPushEnabled'));
    await ctx.clock.advance(5_000);
    expect(topic.state).toBe('fulfilled');
    expect(ctx.store.state.values).toEqual({ ...ON, moderationPushEnabled: false }); // topic만 복원
    expect(ctx.store.state.saving.moderationPushEnabled).toBe(true);
    other.resolve(noContent());
    await moderation;
    expect(ctx.store.state.values).toEqual({ ...ON, moderationPushEnabled: false });
    expect(ctx.toasts.messages).toEqual([t('settings.push.save-error')]);
  });

  it('TC-SET-027 TC-SET-028 같은 항목이 저장 중일 때 같은 항목을 다시 누르면 요청은 한 번이고 두 번째 입력은 무시된다', async () => {
    const ctx = setup();
    await ready(ctx);
    const gate = deferred<Response>();
    ctx.ff.route(PATCH, () => gate.promise);
    const first = ctx.store.toggle('topicPushEnabled');
    const second = ctx.store.toggle('topicPushEnabled');
    const third = ctx.store.toggle('topicPushEnabled');
    gate.resolve(noContent());
    await Promise.all([first, second, third]);
    expect(ctx.patchBodies()).toEqual([{ topicPushEnabled: false }]);
    expect(ctx.store.state.values).toEqual({ ...ON, topicPushEnabled: false });
  });

  it('TC-SET-029 주제 저장 중에도 승인·반려와 AI 토글은 막히지 않고 각각 별도 PATCH가 나간다', async () => {
    const ctx = setup();
    await ready(ctx);
    const gates = { topic: deferred<Response>(), moderation: deferred<Response>(), ai: deferred<Response>() };
    ctx.ff.route(PATCH, (req) => {
      const body = JSON.parse(req.body as string) as Record<string, boolean>;
      if ('topicPushEnabled' in body) return gates.topic.promise;
      return 'moderationPushEnabled' in body ? gates.moderation.promise : gates.ai.promise;
    });
    const runs = [ctx.store.toggle('topicPushEnabled'), ctx.store.toggle('moderationPushEnabled'), ctx.store.toggle('aiReviewPushEnabled')];
    await flushAsync();
    expect(ctx.patchBodies()).toEqual([{ topicPushEnabled: false }, { moderationPushEnabled: false }, { aiReviewPushEnabled: false }]);
    expect(ctx.store.state.saving).toEqual({ topicPushEnabled: true, moderationPushEnabled: true, aiReviewPushEnabled: true });
    for (const gate of Object.values(gates)) gate.resolve(noContent());
    await Promise.all(runs);
    expect(ctx.store.state.values).toEqual({ topicPushEnabled: false, moderationPushEnabled: false, aiReviewPushEnabled: false });
  });

  it('REQ-SET-014 저장이 끝나면 같은 항목을 다시 바꿀 수 있다(켜기)', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, noContent);
    await ctx.store.toggle('topicPushEnabled');
    await ctx.store.toggle('topicPushEnabled');
    expect(ctx.patchBodies()).toEqual([{ topicPushEnabled: false }, { topicPushEnabled: true }]);
    expect(ctx.store.state.values).toEqual(ON);
  });

  it('TC-SET-036 조회 전(idle)이거나 조회 실패(error)로 값이 없으면 toggle은 PATCH를 보내지 않는다', async () => {
    const ctx = setup();
    ctx.ff.route(PATCH, noContent);
    await ctx.store.toggle('topicPushEnabled');
    expect(ctx.ff.callsTo(PATCH)).toHaveLength(0);
    expect(ctx.store.state).toMatchObject({ status: 'idle', values: null });
  });

  it('TC-SET-030 저장 중 cancelPending(화면 이탈)하면 요청을 취소하고 그 항목을 이전 값으로 되돌리며 오류 토스트는 없다', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, () => new Promise<Response>(() => {})); // 응답이 오지 않는다. 취소로만 끝난다
    const run = track(ctx.store.toggle('moderationPushEnabled'));
    await flushAsync();
    ctx.store.cancelPending();
    await flushAsync();
    expect(ctx.ff.callsTo(PATCH)[0]!.signal?.aborted).toBe(true);
    expect(run.state).toBe('fulfilled');
    expect(ctx.store.state.values).toEqual(ON);
    expect(ctx.store.state.saving.moderationPushEnabled).toBe(false);
    expect(ctx.toasts.messages).toEqual([]);
  });

  it('TC-SET-031 저장 도중 계정이 바뀌면(clear) 이전 계정의 저장 실패 응답이 새 계정의 값을 되돌리거나 토스트를 띄우지 않는다', async () => {
    const ctx = setup();
    await ready(ctx);
    const gate = deferred<Response>();
    ctx.ff.route(PATCH, () => gate.promise);
    const run = ctx.store.toggle('topicPushEnabled');
    ctx.store.clear();
    gate.resolve(patchFails());
    await ctx.clock.advance(5_000);
    await run;
    expect(ctx.store.state).toMatchObject({ status: 'idle', values: null });
    expect(ctx.toasts.messages).toEqual([]);
  });

  it('TC-SET-031 저장 성공 응답이 늦게 와도 clear된 상태를 건드리지 않는다', async () => {
    const ctx = setup();
    await ready(ctx);
    const gate = deferred<Response>();
    ctx.ff.route(PATCH, () => gate.promise);
    const run = ctx.store.toggle('aiReviewPushEnabled');
    ctx.store.clear();
    gate.resolve(noContent());
    await run;
    expect(ctx.store.state).toMatchObject({ status: 'idle', values: null });
    expect(ctx.store.state.saving).toEqual({ topicPushEnabled: false, moderationPushEnabled: false, aiReviewPushEnabled: false });
  });

  it('TC-SET-034 PATCH가 401이어도 refresh로 이어 가면 성공이고 되돌리지 않는다', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, fixture('settings/notification-settings__patch-unauthorized.json'), noContent);
    ctx.ff.route('POST /auth/refresh', fixture('auth/refresh__success.json'));
    await ctx.store.toggle('topicPushEnabled');
    expect(ctx.store.state.values).toEqual({ ...ON, topicPushEnabled: false });
    expect(ctx.toasts.messages).toEqual([]);
  });

  it('TC-SET-034 REAUTHENTICATION_REQUIRED면 값을 되돌리고 토스트 없이 끝난다(로그인 화면 이동은 세션 이벤트가 맡는다)', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, fixture('settings/notification-settings__patch-unauthorized.json'));
    ctx.ff.route('POST /auth/refresh', fixture('auth/refresh__reauthentication-required.json'));
    await ctx.store.toggle('topicPushEnabled');
    expect(ctx.expired.count).toBe(1);
    expect(ctx.store.state.values).toEqual(ON);
    expect(ctx.toasts.messages).toEqual([]);
  });

  it('TC-SET-034 GET이 REAUTHENTICATION_REQUIRED면 토스트 없이 error 상태가 된다', async () => {
    const ctx = setup();
    ctx.ff.route(GET, fixture('settings/notification-settings__get-unauthorized.json'));
    ctx.ff.route('POST /auth/refresh', fixture('auth/refresh__reauthentication-required.json'));
    await ctx.store.load();
    expect(ctx.expired.count).toBe(1);
    expect(ctx.store.state.status).toBe('error');
    expect(ctx.toasts.messages).toEqual([]);
  });

  it('REQ-SET-021 정지 회원이어도 조회·저장은 그대로 동작한다(403 분기 없음). 서버가 403을 줘도 일반 저장 실패와 같이 되돌린다', async () => {
    const ctx = setup();
    await ready(ctx);
    ctx.ff.route(PATCH, fixture('common/error__forbidden-banned.json'));
    await ctx.store.toggle('topicPushEnabled');
    expect(ctx.store.state.values).toEqual(ON);
    expect(ctx.toasts.messages).toEqual([t('settings.push.save-error')]);
  });
});
