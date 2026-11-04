import { UploadGate } from '../features/upload/UploadGate';
import { UploadViewModel } from '../features/upload/UploadViewModel';
import { PhotoPreparer } from '../features/upload/PhotoPreparer';
import { UploadRepository } from '../features/upload/UploadRepository';
import { makeHarness } from '../test/appHarness';
import { FakeUploadNavigator } from '../test/FakeUploadNavigator';
import { deferred } from '../test/deferred';
import { FixtureRouter } from '../test/fixtureRouter';
import { guestSession, loadFixture, memberSession } from '../test/fixtures';
import { MEMBER_ROUTES } from '../test/homeHarness';
import { TODAY, UPLOAD_ROUTES, settleMore } from '../test/uploadHarness';
import { recordToasts as toastLog } from '../test/toastLog';

describe('앱 조립: 업로드 (UploadGate, 결과 보관, 계정 전환)', () => {
  it('TC-UPL-002 업로드 진입을 덮어쓰지 않으면 기본 UploadGate이고 uploadEntry와 같다', () => {
    const h = makeHarness({ session: memberSession(), realUpload: true });
    expect(h.container.uploadGate).toBeInstanceOf(UploadGate);
    expect(h.container.uploadEntry).toBe(h.container.uploadGate);
  });

  it('업로드 진입을 덮어쓰면(테스트용 Fake) uploadGate는 null이다', () => {
    const h = makeHarness({ session: memberSession() });
    expect(h.container.uploadGate).toBeNull();
    expect(h.container.uploadEntry).toBe(h.upload);
  });

  it('TC-UPL-002 createUploadViewModel은 고정된 topicDate로 UploadViewModel을 만들고 같은 저장소·결과 보관을 쓴다', async () => {
    const h = makeHarness({ session: memberSession(), realUpload: true });
    new FixtureRouter(h.ff, { ...MEMBER_ROUTES, ...UPLOAD_ROUTES });
    const vm = h.container.createUploadViewModel('2026-10-27');
    expect(vm).toBeInstanceOf(UploadViewModel);
    expect(vm.state.topicDate).toBe('2026-10-27');
    vm.start();
    await settleMore();
    expect(vm.state.topic.status).toBe('ready');
    expect(h.container.uploadRepository).toBeInstanceOf(UploadRepository);
    expect(h.container.photoPreparer).toBeInstanceOf(PhotoPreparer);
    vm.dispose();
  });

  it('createUploadViewModel은 호출마다 새 인스턴스다(화면이 마운트될 때마다 새로 만든다)', () => {
    const h = makeHarness({ session: memberSession(), realUpload: true });
    expect(h.container.createUploadViewModel('2026-10-27')).not.toBe(h.container.createUploadViewModel('2026-10-27'));
  });

  it('TC-UPL-078 계정이 바뀌면(userCaches.clearAll) 담아 둔 업로드 결과를 비운다', async () => {
    const h = makeHarness({ session: memberSession(), realUpload: true });
    h.container.uploadResults.set({ topicDate: '2026-10-27', topicTitle: '가을 하늘', moderationStatus: 'PENDING', photo: new Blob(['x']) });
    await h.container.userCaches.clearAll();
    expect(h.container.uploadResults.get()).toBeNull();
  });

  it('TC-UPL-078 TC-UPL-010 계정이 바뀌면 확인 중이던 업로드 진입을 취소해 뒤늦은 응답으로 화면이 열리지 않는다', async () => {
    const h = makeHarness({ session: memberSession(), realUpload: true });
    const navigator = new FakeUploadNavigator();
    h.container.uploadNavigator.attach(navigator);
    const router = new FixtureRouter(h.ff, { ...MEMBER_ROUTES, ...UPLOAD_ROUTES });
    const gate = deferred<Response>();
    router.set(TODAY, () => gate.promise);
    h.container.uploadEntry.start();
    await settleMore();
    const signal = h.ff.callsTo('GET /posts/today')[0]!.signal;
    await h.container.userCaches.clearAll();
    expect(signal?.aborted).toBe(true);
    gate.resolve(loadFixture('upload/posts-today__not-posted.json').toResponse());
    await settleMore();
    expect(navigator.opened).toEqual([]);
  });

  it('TC-UPL-001 진입 게이트는 저장소의 세션으로 회원/게스트를 판정한다(게스트면 요청 없이 토스트)', async () => {
    const guest = makeHarness({ session: guestSession, realUpload: true });
    const toasts = toastLog(guest.container.toast);
    guest.container.uploadEntry.start();
    await settleMore();
    expect(guest.ff.calls).toHaveLength(0);
    expect(toasts.messages).toEqual(['게시물을 추가하려면 로그인이 필요해요']);
  });

  it('TC-UPL-002 같은 컨테이너에서 로그인 상태가 바뀌어도 시작할 때마다 저장소를 다시 읽는다', async () => {
    const h = makeHarness({ session: guestSession, realUpload: true });
    const navigator = new FakeUploadNavigator();
    h.container.uploadNavigator.attach(navigator);
    new FixtureRouter(h.ff, { ...MEMBER_ROUTES, ...UPLOAD_ROUTES });
    const toasts = toastLog(h.container.toast);
    h.container.uploadEntry.start();
    await settleMore();
    expect(toasts.messages).toHaveLength(1);
    await h.store.write(memberSession());
    h.container.uploadEntry.start();
    await settleMore();
    expect(navigator.opened).toEqual([{ topicDate: '2026-10-27' }]);
  });

  it('uploadNavigator는 붙은 구현으로 요청을 넘기고, 붙어 있지 않으면 요청을 버린다', () => {
    const h = makeHarness({ session: memberSession(), realUpload: true });
    const navigator = new FakeUploadNavigator();
    h.container.uploadNavigator.openUpload({ topicDate: '2026-10-27' });
    const detach = h.container.uploadNavigator.attach(navigator);
    h.container.uploadNavigator.openUpload({ topicDate: '2026-10-27' });
    detach();
    h.container.uploadNavigator.openUpload({ topicDate: '2026-10-28' });
    expect(navigator.opened).toEqual([{ topicDate: '2026-10-27' }]);
  });
});
