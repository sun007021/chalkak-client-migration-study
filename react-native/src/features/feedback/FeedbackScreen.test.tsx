import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import { FeedbackScreen } from './FeedbackScreen';
import {
  createFeedbackHarness,
  POST_FEEDBACK,
  type FeedbackHarnessOptions,
} from './__testing__/createFeedbackHarness';

async function renderFeedback(options: FeedbackHarnessOptions = {}) {
  const h = await createFeedbackHarness(options);
  const view = await render(<FeedbackScreen viewModel={h.viewModel} />);
  return { h, view };
}

const type = (text: string) => fireEvent.changeText(screen.getByTestId('feedback.input'), text);
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
};

describe('FeedbackScreen', () => {
  it('TC-FDBK-002 안내 문구, 입력창 플레이스홀더, 글자 수 카운터, 보내기 버튼이 보인다', async () => {
    await renderFeedback();
    expect(screen.getByTestId('feedback.root')).toBeOnTheScreen();
    expect(screen.getByTestId('feedback.guide-text')).toHaveTextContent(t('fdbk.intro.title'));
    expect(screen.getByTestId('feedback.guide-body')).toHaveTextContent(t('fdbk.intro.body'));
    expect(screen.getByTestId('feedback.input').props.placeholder).toBe(
      t('fdbk.field.placeholder'),
    );
    expect(screen.getByTestId('feedback.counter')).toHaveTextContent('0/1000');
    expect(screen.getByTestId('feedback.submit-button')).toHaveTextContent(t('fdbk.send'));
    expect(screen.getByTestId('feedback.close-button')).toBeOnTheScreen();
  });

  it('TC-FDBK-003 초기 상태에서 보내기가 비활성이다', async () => {
    await renderFeedback();
    expect(screen.getByTestId('feedback.submit-button')).toBeDisabled();
  });

  it('TC-FDBK-004 TC-FDBK-005 공백만이면 비활성, 1자 이상이면 활성이다', async () => {
    await renderFeedback();
    await type('  \n　 ');
    expect(screen.getByTestId('feedback.submit-button')).toBeDisabled();
    await type(' 가 ');
    expect(screen.getByTestId('feedback.submit-button')).toBeEnabled();
  });

  it('TC-FDBK-013 카운터는 trim 후 code point 수와 항상 같고 1000 초과도 그대로 표시한다', async () => {
    await renderFeedback();
    await type('  😀😀 ');
    expect(screen.getByTestId('feedback.counter')).toHaveTextContent('2/1000');
    await type('a'.repeat(1001));
    expect(screen.getByTestId('feedback.counter')).toHaveTextContent('1001/1000');
  });

  it('TC-FDBK-014 10만 자를 붙여넣어도 화면이 멈추지 않고 카운터가 정확하며 전송은 거부된다', async () => {
    const { h } = await renderFeedback();
    await type('a'.repeat(100_000));
    expect(screen.getByTestId('feedback.counter')).toHaveTextContent('100000/1000');
    await fireEvent.press(screen.getByTestId('feedback.submit-button'));
    await flush();
    expect(h.posts()).toHaveLength(0);
    expect(screen.getByTestId('feedback.validation-message')).toHaveTextContent(
      t('fdbk.error.invalid'),
    );
  });

  it('TC-FDBK-018 전송 중에는 버튼이 "보내는 중..."이고 비활성이다', async () => {
    const { h } = await renderFeedback();
    const gate = deferred<void>();
    h.router.set(POST_FEEDBACK, async () => {
      await gate.promise;
      return fixtureResponse('feedback/feedbacks__created');
    });
    await type('내용');
    await fireEvent.press(screen.getByTestId('feedback.submit-button'));
    await flush();
    expect(screen.getByTestId('feedback.submit-button')).toHaveTextContent(t('fdbk.sending'));
    expect(screen.getByTestId('feedback.submit-button')).toBeDisabled();
    gate.resolve();
    await flush();
    expect(h.navigator.closes).toBe(1);
  });

  it('TC-FDBK-019 보내기를 3회 연타해도 POST는 1회뿐이다', async () => {
    const { h } = await renderFeedback();
    await type('내용');
    const button = screen.getByTestId('feedback.submit-button');
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(button);
    await flush();
    expect(h.posts()).toHaveLength(1);
  });

  it('TC-FDBK-007 1001자 전송 시도는 검증 메시지를 보이고 입력을 유지한다', async () => {
    const { h } = await renderFeedback();
    await type('a'.repeat(1001));
    await fireEvent.press(screen.getByTestId('feedback.submit-button'));
    await flush();
    expect(screen.getByTestId('feedback.validation-message')).toHaveTextContent(
      t('fdbk.error.invalid'),
    );
    expect(screen.getByTestId('feedback.input').props.value).toBe('a'.repeat(1001));
    expect(h.posts()).toHaveLength(0);
  });

  it('TC-FDBK-024 서버 오류면 오류 메시지를 보이고 입력은 그대로이며 다시 보낼 수 있다', async () => {
    const { h } = await renderFeedback({
      routes: { [POST_FEEDBACK]: 'feedback/feedbacks__internal-error' },
    });
    await type('내용');
    await fireEvent.press(screen.getByTestId('feedback.submit-button'));
    await flush();
    expect(screen.getByTestId('feedback.error-message')).toHaveTextContent(t('fdbk.error.generic'));
    expect(screen.getByTestId('feedback.input').props.value).toBe('내용');
    expect(screen.getByTestId('feedback.submit-button')).toBeEnabled();
    expect(h.navigator.closes).toBe(0);
  });

  it('TC-FDBK-017 성공하면 화면 닫기가 요청된다', async () => {
    const { h } = await renderFeedback();
    await type('내용');
    await fireEvent.press(screen.getByTestId('feedback.submit-button'));
    await flush();
    expect(h.navigator.closes).toBe(1);
    expect(h.toast.messages).toEqual([t('fdbk.success')]);
  });

  it('REQ-FDBK-008 닫기 버튼은 입력 중이어도 화면 닫기를 요청한다', async () => {
    const { h } = await renderFeedback();
    await type('내용');
    await fireEvent.press(screen.getByTestId('feedback.close-button'));
    expect(h.navigator.closes).toBe(1);
    expect(h.posts()).toHaveLength(0);
  });

  it('TC-ANL-018 다시 그려도 화면은 screen_view를 보내지 않는다(전송은 소유자의 start()뿐)', async () => {
    const { h, view } = await renderFeedback();
    await view.rerender(<FeedbackScreen viewModel={h.viewModel} />);
    expect(h.analytics.events).toEqual([]);
  });
});
