import { fireEvent, render, screen } from '@testing-library/react-native';

import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { FakeToastPresenter } from '../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter } from '../../data/__testing__/FixtureRouter';
import { SignatureRepository } from '../../data/signature/SignatureRepository';
import { t } from '../../shared/copy';
import { SignatureCard } from './SignatureCard';
import { SignatureCardViewModel } from './SignatureCardViewModel';

const GET = 'GET /users/me/signature';

async function setup(fixture: string) {
  const net = createNetHarness();
  await net.signIn();
  const router = new FixtureRouter({ [GET]: fixture }).install(net.transport);
  const vm = new SignatureCardViewModel({
    repository: new SignatureRepository({ api: net.api }),
    toast: new FakeToastPresenter(),
    navigator: { openSignatureChange: jest.fn() },
    authFlow: { toLogin: jest.fn() },
  });
  return { vm, router };
}

describe('SignatureCard 설정 탭 오류 상태', () => {
  it('TC-SET-006 최초 조회가 실패하면 오류 문구와 다시 불러오기가 보이고 누르면 재조회한다', async () => {
    const { vm, router } = await setup('signature/users-me-signature__get-internal-error');
    await vm.refresh();
    await render(<SignatureCard viewModel={vm} />);
    expect(screen.getByTestId('settings.signature-error')).toHaveTextContent(t('sign.load.error'));
    expect(screen.getByTestId('settings.signature-change-button')).toBeOnTheScreen();

    router.set(GET, 'signature/users-me-signature__get-success');
    await fireEvent.press(screen.getByTestId('settings.signature-retry-button'));
    expect(await screen.findByTestId('settings.signature-image')).toBeOnTheScreen();
    expect(screen.queryByTestId('settings.signature-error')).not.toBeOnTheScreen();
    // router.set이 호출 기록을 새로 시작하므로 다시 불러오기 이후의 요청만 센다.
    expect(router.calls(GET)).toHaveLength(1);
  });

  it('TC-SET-005 이미 사인이 보이는 상태의 재조회 실패에는 오류 상태를 만들지 않는다(빈 카드로 바꾸지 않음)', async () => {
    const { vm, router } = await setup('signature/users-me-signature__get-success');
    await vm.refresh();
    await render(<SignatureCard viewModel={vm} />);
    router.set(GET, 'signature/users-me-signature__get-internal-error');
    await vm.refresh();
    expect(await screen.findByTestId('settings.signature-image')).toBeOnTheScreen();
    expect(screen.queryByTestId('settings.signature-error')).not.toBeOnTheScreen();
  });
});
