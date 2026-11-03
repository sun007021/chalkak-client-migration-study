import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { SignatureRepository } from '../../data/signature/SignatureRepository';
import { t } from '../../shared/copy';
import { SignatureCard } from './SignatureCard';
import { SignatureCardViewModel } from './SignatureCardViewModel';
import { routeFixtures } from './__testing__/routes';

async function setup(fixture: string) {
  const net = createNetHarness();
  await net.signIn();
  routeFixtures(net.transport, { 'GET /users/me/signature': fixture });
  const navigator = { openSignatureChange: jest.fn() };
  const vm = new SignatureCardViewModel({
    repository: new SignatureRepository({ api: net.api }),
    toast: new FakeToastPresenter(),
    navigator,
    authFlow: { toLogin: jest.fn() },
  });
  return { vm, navigator, net };
}

describe('SignatureCard', () => {
  it('TC-SIGN-026 제목·사인 이미지·"변경하기"가 보이고 이미지는 썸네일 URL이다', async () => {
    const { vm, navigator } = await setup('signature/users-me-signature__get-success');
    await vm.refresh();
    await render(<SignatureCard viewModel={vm} />);
    expect(screen.getByTestId('settings.signature-card')).toHaveTextContent(t('sign.card.title'));
    expect(screen.getByTestId('settings.signature-image').props.source).toEqual({
      uri: vm.getSnapshot().imageUrl,
    });
    expect(screen.getByTestId('settings.signature-change-button')).toHaveTextContent(
      t('sign.card.change'),
    );
    await fireEvent.press(screen.getByTestId('settings.signature-change-button'));
    expect(navigator.openSignatureChange).toHaveBeenCalledTimes(1);
  });

  it('TC-SIGN-040 재등록 필요(이미지 없음)여도 카드와 "변경하기"는 남고 이미지 자리는 비어 있다', async () => {
    const { vm } = await setup('signature/users-me-signature__get-registration-required');
    await vm.refresh();
    await render(<SignatureCard viewModel={vm} />);
    expect(screen.getByTestId('settings.signature-card')).toBeOnTheScreen();
    expect(screen.queryByTestId('settings.signature-image')).not.toBeOnTheScreen();
    expect(screen.getByTestId('settings.signature-change-button')).toBeEnabled();
  });

  it('TC-SIGN-041 이미지 URL 로드 실패 시 플레이스홀더로 바뀌고 카드가 깨지지 않는다', async () => {
    const { vm } = await setup('signature/users-me-signature__get-success');
    await vm.refresh();
    await render(<SignatureCard viewModel={vm} />);
    await fireEvent(screen.getByTestId('settings.signature-image'), 'error');
    expect(screen.queryByTestId('settings.signature-image')).not.toBeOnTheScreen();
    expect(screen.getByTestId('settings.signature-card')).toBeOnTheScreen();
    expect(screen.getByTestId('settings.signature-change-button')).toBeOnTheScreen();
  });

  it('조회 중에는 settings.signature-loading을 보인다', async () => {
    const { vm, net } = await setup('signature/users-me-signature__get-success');
    // 응답을 붙잡아 둔다: 가짜 transport는 즉시 응답해서 render가 끝나기 전에 조회가 끝나 버린다.
    const gate = deferred<void>();
    net.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('signature/users-me-signature__get-success');
    });
    const pending = vm.refresh();
    await render(<SignatureCard viewModel={vm} />);
    expect(screen.getByTestId('settings.signature-loading')).toBeOnTheScreen();
    gate.resolve();
    await pending;
    expect(await screen.findByTestId('settings.signature-image')).toBeOnTheScreen();
    expect(screen.queryByTestId('settings.signature-loading')).not.toBeOnTheScreen();
  });

  it('이미지 로드 실패 뒤 다시 조회하면(같은 URL도) 이미지를 다시 시도한다', async () => {
    const { vm } = await setup('signature/users-me-signature__get-success');
    await vm.refresh();
    await render(<SignatureCard viewModel={vm} />);
    await fireEvent(screen.getByTestId('settings.signature-image'), 'error');
    expect(screen.queryByTestId('settings.signature-image')).not.toBeOnTheScreen();
    await act(async () => vm.refresh());
    expect(await screen.findByTestId('settings.signature-image')).toBeOnTheScreen();
  });
});
