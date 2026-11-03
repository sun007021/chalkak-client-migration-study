import pkg from '../../package.json';
import { t } from '../copy/ko';
import { fakePng } from '../test/FakeSignatureRasterizer';
import { makeHarness } from '../test/appHarness';
import { deferred } from '../test/deferred';
import { flushAsync } from '../test/FakeClock';
import { guestSession, memberSession } from '../test/fixtures';
import { CARD_GET, FEEDBACK_POST, SETTINGS_GET, SIGNATURE_URL, fx, resp, routeFeedback, routeSettings } from '../test/settingsHarness';
import { routeChange } from '../test/signatureRoutes';
import { recordToasts } from '../test/toastLog';
import { SettingsViewModel } from '../features/settings/SettingsViewModel';
import { FeedbackViewModel } from '../features/feedback/FeedbackViewModel';
import { NotificationSettingsStore } from '../features/settings/NotificationSettingsStore';

describe('컨테이너 조립: 설정·피드백 (W11)', () => {
  it('TC-SET-049 appVersion 기본값은 package.json의 빌드 버전이고, 옵션으로 덮어쓸 수 있다', () => {
    expect(makeHarness().container.appVersion).toBe(pkg.version);
    expect(makeHarness({ appVersion: '9.9.9' }).container.appVersion).toBe('9.9.9');
  });

  it('notificationSettings는 NotificationSettingsStore이고 처음에는 idle이다', () => {
    const { container } = makeHarness({ session: memberSession() });
    expect(container.notificationSettings).toBeInstanceOf(NotificationSettingsStore);
    expect(container.notificationSettings.state).toMatchObject({ status: 'idle', values: null });
  });

  it('REQ-SET-020 TC-SET-037 UserCaches.clearAll(로그아웃·탈퇴·계정 전환)이 푸시 설정과 사인 카드를 함께 비운다', async () => {
    const h = makeHarness({ session: memberSession() });
    routeSettings(h.ff);
    await Promise.all([h.container.notificationSettings.load(), h.container.signatureCard.refresh()]);
    expect(h.container.notificationSettings.state.status).toBe('ready');
    expect(h.container.signatureCard.state.status).toBe('content');
    await h.container.userCaches.clearAll();
    expect(h.container.notificationSettings.state).toMatchObject({ status: 'idle', values: null });
    expect(h.container.signatureCard.state).toEqual({ status: 'idle', imageUrl: null });
  });

  it('TC-SET-032 clearAll 뒤에 이전 계정의 푸시 설정 응답이 늦게 도착해도 반영하지 않는다', async () => {
    const h = makeHarness({ session: memberSession() });
    const gate = deferred<Response>();
    routeSettings(h.ff, { get: [() => gate.promise] });
    const run = h.container.notificationSettings.load();
    await h.container.userCaches.clearAll();
    gate.resolve(resp('settings/notification-settings__get-all-true.json'));
    await run;
    expect(h.container.notificationSettings.state).toMatchObject({ status: 'idle', values: null });
  });

  it('createSettingsViewModel은 매번 새 SettingsViewModel이고 모드와 앱 버전을 담는다', () => {
    const h = makeHarness({ session: memberSession(), appVersion: '1.2.3' });
    const a = h.container.createSettingsViewModel('member');
    const b = h.container.createSettingsViewModel('member');
    expect(a).toBeInstanceOf(SettingsViewModel);
    expect(a).not.toBe(b);
    expect(a.state).toMatchObject({ mode: 'member', appVersion: '1.2.3', dialog: null });
  });

  it('TC-SET-002 회원 SettingsViewModel.onShown은 컨테이너의 사인 카드·푸시 설정 저장소로 GET 두 개를 보낸다', async () => {
    const h = makeHarness({ session: memberSession() });
    routeSettings(h.ff);
    h.container.createSettingsViewModel('member').onShown();
    await flushAsync();
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(1);
    expect(h.ff.callsTo(SETTINGS_GET)).toHaveLength(1);
    await flushAsync();
    expect(h.container.signatureCard.state.imageUrl).toBe(SIGNATURE_URL.thumbnail);
    expect(h.container.notificationSettings.state.status).toBe('ready');
  });

  it('TC-SET-008 게스트 SettingsViewModel.onShown은 요청을 보내지 않는다', async () => {
    const h = makeHarness({ session: guestSession });
    h.container.createSettingsViewModel('guest').onShown();
    await flushAsync();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-SET-047 SettingsViewModel.openDocument는 컨테이너의 externalLinkOpener로 약관 문서를 연다', () => {
    const h = makeHarness({ session: memberSession() });
    expect(h.container.createSettingsViewModel('member').openDocument('service')).toBe('opened');
    expect(h.opener.opened).toHaveLength(1);
    expect(h.opener.opened[0]).toContain('notion.com');
  });

  it('TC-SET-043 SettingsViewModel.confirmLogout은 컨테이너의 AccountService로 로그아웃한다(세션 삭제 + POST /auth/logout)', async () => {
    const h = makeHarness({ session: memberSession() });
    h.ff.route('POST /auth/logout', fx('auth/logout__no-content.json'));
    const vm = h.container.createSettingsViewModel('member');
    vm.requestLogout();
    await vm.confirmLogout();
    await flushAsync();
    expect((await h.store.read()).tokens).toBeNull();
    expect(h.ff.callsTo('POST /auth/logout')).toHaveLength(1);
  });

  it('REQ-NAV-020 게스트 SettingsViewModel.pressLogin은 컨테이너 세션 저장소를 지운다', async () => {
    const h = makeHarness({ session: guestSession });
    expect(await h.container.createSettingsViewModel('guest').pressLogin()).toEqual({ kind: 'login' });
    expect((await h.store.read()).isGuest).toBe(false);
  });

  it('createFeedbackViewModel은 매번 새 FeedbackViewModel이고 submit은 컨테이너의 api로 POST /feedbacks를 보낸다', async () => {
    const h = makeHarness({ session: memberSession() });
    routeFeedback(h.ff);
    const toasts = recordToasts(h.container.toast);
    const vm = h.container.createFeedbackViewModel();
    expect(vm).toBeInstanceOf(FeedbackViewModel);
    expect(vm).not.toBe(h.container.createFeedbackViewModel());
    vm.setText('내용');
    expect(await vm.submit()).toEqual({ kind: 'sent' });
    expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(1);
    expect(toasts.messages).toEqual([t('fdbk.success')]);
  });

  it('TC-SET-009 TC-SET-011 사인 변경 성공 뒤 카드는 진행 중이던 오래된 조회를 무시하고 새로 GET한 사인으로 바뀐다', async () => {
    const h = makeHarness({ session: memberSession() });
    const stale = deferred<Response>();
    routeChange(h.ff, { get: [() => stale.promise, fx('signature/users-me-signature__get-success.json')] });
    const before = h.container.signatureCard.refresh(); // 변경 전에 시작된 조회(응답이 아직 안 옴)
    await flushAsync();
    const vm = h.container.createSignaturePreviewViewModel('change', fakePng(512));
    expect(await vm.confirm()).toEqual({ kind: 'settings' });
    await flushAsync();
    await flushAsync();
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(2); // 진행 중 요청에 올라타지 않고 새 GET
    expect(h.container.signatureCard.state.imageUrl).toBe(SIGNATURE_URL.thumbnail);
    stale.resolve(Response.json({ signatureOriginalImageUrl: 'https://cdn.example.test/old/original.png', signatureThumbnailImageUrl: 'https://cdn.example.test/old/thumbnail.png' }));
    await before;
    expect(h.container.signatureCard.state.imageUrl).toBe(SIGNATURE_URL.thumbnail);
  });
});
