import { View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { drawLine, flush } from '../signature/__testing__/draw';
import { createSignUpHarness } from './__testing__/createSignUpHarness';
import { SignUpRoute } from './SignUpRoute';

const FakeWebView = () => <View testID="fake-webview" />;

describe('SignUpRoute', () => {
  it('TC-ONB-015 약관 -> 사인 그리기 -> 미리보기 순서로 화면이 바뀐다', async () => {
    const h = createSignUpHarness();
    h.flow.start();
    await render(<SignUpRoute flow={h.flow} WebView={FakeWebView} />);
    expect(screen.getByTestId('terms.root')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('terms.agree-all-checkbox'));
    await fireEvent.press(screen.getByTestId('terms.next-button'));
    expect(screen.getByTestId('signature.root')).toBeOnTheScreen();

    await act(async () => {
      drawLine(h.flow.signature!.draw);
      await h.flow.signature!.draw.confirm();
    });
    expect(screen.getByTestId('signature-preview.root')).toBeOnTheScreen();
    expect(screen.getByTestId('signature-preview.confirm-button')).toHaveTextContent('시작하기');
  });

  it('TC-ONB-008 "보기"는 문서 시트를 열고 닫으면 약관 화면으로 돌아온다', async () => {
    const h = createSignUpHarness();
    h.flow.start();
    await render(<SignUpRoute flow={h.flow} WebView={FakeWebView} />);
    await fireEvent.press(screen.getByTestId('terms.service-view-button'));
    await act(async () => flush());
    expect(screen.getByTestId('legal-doc.sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('fake-webview')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('legal-doc.close-button'));
    expect(screen.queryByTestId('legal-doc.sheet')).not.toBeOnTheScreen();
    expect(screen.getByTestId('terms.root')).toBeOnTheScreen();
  });

  it('REQ-ONB-027 사인 그리기의 뒤로 버튼은 약관으로 돌아가고 동의 상태가 유지된다', async () => {
    const h = createSignUpHarness();
    h.flow.start();
    await render(<SignUpRoute flow={h.flow} WebView={FakeWebView} />);
    await fireEvent.press(screen.getByTestId('terms.agree-all-checkbox'));
    await fireEvent.press(screen.getByTestId('terms.next-button'));
    await fireEvent.press(screen.getByTestId('signature.back-button'));
    expect(screen.getByTestId('terms.root')).toBeOnTheScreen();
    expect(screen.getByTestId('terms.next-button')).toBeEnabled();
  });
});
