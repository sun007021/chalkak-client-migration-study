import { deferred } from '../../core/http/__testing__/FakeTransport';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { SignatureRepository } from '../../data/signature/SignatureRepository';
import { t } from '../../shared/copy';
import { SignatureCardViewModel } from './SignatureCardViewModel';
import { routeFixtures } from './__testing__/routes';

const GET = 'GET /users/me/signature';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  const toast = new FakeToastPresenter();
  const navigator = { openSignatureChange: jest.fn() };
  const vm = new SignatureCardViewModel({
    repository: new SignatureRepository({ api: net.api }),
    toast,
    navigator,
  });
  return { ...net, toast, navigator, vm };
}

describe('SignatureCardViewModel', () => {
  it('TC-SIGN-026 refresh는 GET /users/me/signature의 썸네일을 이미지로 쓴다', async () => {
    const h = await setup();
    routeFixtures(h.transport, { [GET]: 'signature/users-me-signature__get-success' });
    await h.vm.refresh();
    const body = fixtureBody<Record<string, string>>('signature/users-me-signature__get-success');
    expect(h.vm.getSnapshot()).toEqual({
      imageUrl: body.signatureThumbnailImageUrl,
      loading: false,
    });
  });

  it('TC-SIGN-026 썸네일이 null이면 원본을 쓴다', async () => {
    const h = await setup();
    routeFixtures(h.transport, { [GET]: 'signature/users-me-signature__get-thumbnail-null' });
    await h.vm.refresh();
    const body = fixtureBody<Record<string, string>>(
      'signature/users-me-signature__get-thumbnail-null',
    );
    expect(h.vm.getSnapshot().imageUrl).toBe(body.signatureOriginalImageUrl);
  });

  it('TC-SIGN-027 변경 직후에도 PUT 응답이 아니라 매번 GET으로 재조회하고 서버가 새 썸네일을 주면 바뀐다', async () => {
    const h = await setup();
    routeFixtures(h.transport, {
      [GET]: [
        'signature/users-me-signature__get-thumbnail-null',
        'signature/users-me-signature__get-success',
      ],
    });
    await h.vm.refresh();
    const before = h.vm.getSnapshot().imageUrl;
    await h.vm.refresh(); // 설정 탭이 다시 보임
    expect(h.transport.requestsTo('GET', '/users/me/signature')).toHaveLength(2);
    expect(h.vm.getSnapshot().imageUrl).not.toBe(before);
  });

  it('REQ-SIGN-014 조회가 진행 중이면 중복 요청하지 않는다', async () => {
    const h = await setup();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('signature/users-me-signature__get-success');
    });
    const calls = [h.vm.refresh(), h.vm.refresh(), h.vm.refresh()];
    expect(h.vm.getSnapshot().loading).toBe(true);
    gate.resolve();
    await Promise.all(calls);
    expect(h.transport.requests).toHaveLength(1);
    expect(h.vm.getSnapshot().loading).toBe(false);
  });

  it('REQ-SIGN-015 조회 실패 시 보이던 사인은 유지하고 sign.load.error 토스트', async () => {
    const h = await setup();
    routeFixtures(h.transport, {
      [GET]: [
        'signature/users-me-signature__get-success',
        'signature/users-me-signature__get-internal-error',
      ],
    });
    await h.vm.refresh();
    const shown = h.vm.getSnapshot().imageUrl;
    await h.vm.refresh();
    expect(h.vm.getSnapshot().imageUrl).toBe(shown);
    expect(h.toast.messages).toEqual([t('sign.load.error')]);
  });

  it('REQ-SIGN-015 보이던 사인이 없으면 실패해도 이미지 자리는 빈 상태', async () => {
    const h = await setup();
    routeFixtures(h.transport, { [GET]: 'signature/users-me-signature__get-internal-error' });
    await h.vm.refresh();
    expect(h.vm.getSnapshot().imageUrl).toBeNull();
    expect(h.toast.messages).toEqual([t('sign.load.error')]);
  });

  it('TC-SIGN-040 SIGNATURE_REGISTRATION_REQUIRED면 이미지를 비우고 오류 토스트 없이 변경 진입을 유도한다', async () => {
    const h = await setup();
    routeFixtures(h.transport, {
      [GET]: [
        'signature/users-me-signature__get-success',
        'signature/users-me-signature__get-registration-required',
      ],
    });
    await h.vm.refresh();
    await h.vm.refresh();
    expect(h.vm.getSnapshot().imageUrl).toBeNull();
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SIGN-039 정지 회원도 GET은 성공해 사인이 보이고 변경 시도에서만 제한된다(조회는 403을 만들지 않는다)', async () => {
    const h = await setup();
    routeFixtures(h.transport, { [GET]: 'signature/users-me-signature__get-success' });
    await h.vm.refresh();
    expect(h.vm.getSnapshot().imageUrl).not.toBeNull();
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-SIGN-038 조회 중 로그아웃(세션 변경)되면 이전 계정 사인이 카드에 반영되지 않는다', async () => {
    const h = await setup();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('signature/users-me-signature__get-success');
    });
    const pending = h.vm.refresh();
    await h.sessionStore.clear();
    gate.resolve();
    await pending;
    expect(h.vm.getSnapshot().imageUrl).toBeNull();
    expect(h.toast.messages).toEqual([]);
  });

  it('REQ-SIGN-018 "변경하기"는 변경 흐름 진입 인터페이스를 부른다', async () => {
    const h = await setup();
    h.vm.onChangePress();
    expect(h.navigator.openSignatureChange).toHaveBeenCalledTimes(1);
  });
});
