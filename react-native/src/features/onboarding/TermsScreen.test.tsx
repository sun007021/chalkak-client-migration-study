import { fireEvent, render, screen } from '@testing-library/react-native';

import { t } from '../../shared/copy';
import { TermsScreen } from './TermsScreen';
import { TermsViewModel } from './TermsViewModel';

function setup() {
  const host = { openDocument: jest.fn(), onNext: jest.fn(), onBack: jest.fn() };
  return { host, vm: new TermsViewModel(host) };
}

describe('TermsScreen', () => {
  it('TC-ONB-001 환영 제목·전체 동의·필수 항목 두 개와 각 "보기"·"다음"이 보인다', async () => {
    const { vm } = setup();
    await render(<TermsScreen viewModel={vm} />);
    expect(screen.getByTestId('terms.root')).toBeOnTheScreen();
    expect(screen.getByTestId('terms.title')).toHaveTextContent('찰칵에');
    expect(screen.getByTestId('terms.agree-all-checkbox')).toHaveTextContent(
      t('onb.terms.agree-all'),
    );
    expect(screen.getByTestId('terms.service-checkbox')).toHaveTextContent(t('onb.terms.service'));
    expect(screen.getByTestId('terms.privacy-checkbox')).toHaveTextContent(t('onb.terms.privacy'));
    expect(screen.getByTestId('terms.service-view-button')).toHaveTextContent(t('onb.terms.view'));
    expect(screen.getByTestId('terms.privacy-view-button')).toHaveTextContent(t('onb.terms.view'));
    expect(screen.getByTestId('terms.next-button')).toHaveTextContent(t('onb.terms.next'));
  });

  it('TC-ONB-002 처음에는 체크가 모두 꺼져 있고 "다음"이 비활성이다', async () => {
    const { vm } = setup();
    await render(<TermsScreen viewModel={vm} />);
    for (const id of ['agree-all', 'service', 'privacy']) {
      expect(screen.getByTestId(`terms.${id}-checkbox`)).not.toBeChecked();
    }
    expect(screen.getByTestId('terms.next-button')).toBeDisabled();
  });

  it('TC-ONB-005 TC-ONB-006 개별 선택이 전체 동의 체크와 다음 버튼에 반영된다', async () => {
    const { vm } = setup();
    await render(<TermsScreen viewModel={vm} />);
    await fireEvent.press(screen.getByTestId('terms.service-checkbox'));
    expect(screen.getByTestId('terms.service-checkbox')).toBeChecked();
    expect(screen.getByTestId('terms.agree-all-checkbox')).not.toBeChecked();
    expect(screen.getByTestId('terms.next-button')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('terms.privacy-checkbox'));
    expect(screen.getByTestId('terms.agree-all-checkbox')).toBeChecked();
    expect(screen.getByTestId('terms.next-button')).toBeEnabled();
  });

  it('TC-ONB-003 전체 동의를 누르면 모두 체크된다', async () => {
    const { vm } = setup();
    await render(<TermsScreen viewModel={vm} />);
    await fireEvent.press(screen.getByTestId('terms.agree-all-checkbox'));
    expect(screen.getByTestId('terms.service-checkbox')).toBeChecked();
    expect(screen.getByTestId('terms.privacy-checkbox')).toBeChecked();
  });

  it('TC-ONB-008 TC-ONB-015 "보기"와 "다음"과 뒤로 버튼이 ViewModel로 연결된다', async () => {
    const { vm, host } = setup();
    await render(<TermsScreen viewModel={vm} />);
    await fireEvent.press(screen.getByTestId('terms.service-view-button'));
    await fireEvent.press(screen.getByTestId('terms.privacy-view-button'));
    expect(host.openDocument.mock.calls).toEqual([['service'], ['privacy']]);
    await fireEvent.press(screen.getByTestId('terms.agree-all-checkbox'));
    await fireEvent.press(screen.getByTestId('terms.next-button'));
    expect(host.onNext).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('terms.back-button'));
    expect(host.onBack).toHaveBeenCalledTimes(1);
  });
});
