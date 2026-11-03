import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { SETTINGS_BELOW_STATE } from '../../app/paths';
import { t } from '../../copy/ko';
import { makeHarness, renderApp } from '../../test/appHarness';
import { deferred } from '../../test/deferred';
import { networkFailure } from '../../test/fakeFetch';
import { memberSession } from '../../test/fixtures';
import { screenViews } from '../../test/screenViews';
import { FEEDBACK_POST, COMBINED_EMOJI, feedbackBodies, fx, resp, routeFeedback, routeSettings, toastText } from '../../test/settingsHarness';
import { recordToasts } from '../../test/toastLog';

async function openFeedback(o: { strict?: boolean; viaSettings?: boolean } = {}) {
  const h = makeHarness({ session: memberSession() });
  routeSettings(h.ff);
  const toasts = recordToasts(h.container.toast);
  const view = o.viaSettings ? renderApp(h.container, { pathname: '/settings' }, { strict: o.strict }) : renderApp(h.container, '/feedback', { strict: o.strict });
  if (o.viaSettings) {
    await screen.findByTestId('settings.root');
    fireEvent.click(await screen.findByTestId('settings.feedback-row'));
  }
  await screen.findByTestId('feedback.root');
  return { h, toasts, ...view };
}
const input = () => screen.getByTestId('feedback.input') as HTMLTextAreaElement;
const submit = () => screen.getByTestId('feedback.submit-button');
const counter = () => screen.getByTestId('feedback.counter');
const type = (value: string) => fireEvent.change(input(), { target: { value } });

describe('피드백 화면 구성', () => {
  it('TC-FDBK-002 REQ-FDBK-002 안내 제목·설명, 입력창(라벨·플레이스홀더), 글자 수 카운터, "보내기" 버튼, 닫기 버튼이 보인다', async () => {
    await openFeedback();
    expect(screen.getByRole('heading', { level: 1, name: '피드백' })).toBeInTheDocument();
    expect(screen.getByTestId('feedback.guide-text')).toHaveTextContent(/찰칵을 사용하며\s*느낀 점을 알려주세요\./);
    expect(screen.getByTestId('feedback.guide-body')).toHaveTextContent(/서비스 이용 중 불편한 점이나 개선되었으면 하는 점을\s*자유롭게 남겨주세요\./);
    expect(input().tagName).toBe('TEXTAREA');
    expect(input()).toHaveAttribute('placeholder', '내용을 입력해 주세요.');
    expect(input()).toHaveAccessibleName('피드백 내용');
    expect(counter()).toHaveTextContent('0/1000');
    expect(submit()).toHaveTextContent('보내기');
    expect(screen.getByTestId('feedback.close-button')).toHaveAccessibleName('닫기');
    expect(screen.queryByTestId('feedback.validation-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feedback.error-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bottom-bar.root')).not.toBeInTheDocument();
  });

  it('TC-FDBK-001 TC-NAV-038 screen_view feedback이 한 번 전송된다(StrictMode 포함)', async () => {
    const { h } = await openFeedback({ strict: true });
    expect(screenViews(h.tracker).filter((name) => name === 'feedback')).toEqual(['feedback']);
  });

  it('TC-FDBK-003 초기 상태에서 "보내기"는 비활성이다', async () => {
    await openFeedback();
    expect(submit()).toBeDisabled();
  });

  it('TC-FDBK-004 공백만(스페이스, 탭, 개행, 전각 공백) 입력해도 비활성이고 카운터는 0이다', async () => {
    await openFeedback();
    type(' \t\n　 ');
    expect(submit()).toBeDisabled();
    expect(counter()).toHaveTextContent('0/1000');
  });

  it('TC-FDBK-005 TC-FDBK-013 입력하면 "현재 수/1000"이 trim 후 code point 수와 같고 "보내기"가 활성이 된다', async () => {
    await openFeedback();
    type('  가나다  ');
    expect(counter()).toHaveTextContent('3/1000');
    expect(submit()).toBeEnabled();
    type(`  ${COMBINED_EMOJI}😀`);
    expect(counter()).toHaveTextContent('6/1000');
    type('');
    expect(counter()).toHaveTextContent('0/1000');
  });

  it('TC-FDBK-013 1000을 넘어도 카운터는 실제 수를 일관되게 보인다', async () => {
    await openFeedback();
    type('가'.repeat(1001));
    expect(counter()).toHaveTextContent('1001/1000');
  });
});

describe('피드백 길이 검증', () => {
  it('TC-FDBK-006 정확히 1000자는 전송된다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff);
    type('가'.repeat(1000));
    fireEvent.click(submit());
    await waitFor(() => expect(feedbackBodies(h.ff)).toEqual([{ content: '가'.repeat(1000) }]));
  });

  it('TC-FDBK-007 REQ-FDBK-005 1001자는 요청 0건이고 "피드백은 1자 이상 1000자 이하로 입력해 주세요."가 검증 메시지로 보이며 입력은 유지된다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff);
    type('가'.repeat(1001));
    expect(screen.queryByTestId('feedback.validation-message')).not.toBeInTheDocument();
    fireEvent.click(submit());
    expect(await screen.findByTestId('feedback.validation-message')).toHaveTextContent('피드백은 1자 이상 1000자 이하로 입력해 주세요.');
    expect(screen.getByTestId('feedback.validation-message')).toHaveAttribute('role', 'alert');
    expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(0);
    expect(input().value).toBe('가'.repeat(1001));
    type('가'.repeat(1000));
    expect(screen.queryByTestId('feedback.validation-message')).not.toBeInTheDocument();
  });

  it('TC-FDBK-008 앞뒤 공백 포함 총 1002자, trim 후 1000자면 전송되고 서버로 가는 content는 trim 값이다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff);
    type(` ${'가'.repeat(1000)} `);
    fireEvent.click(submit());
    await waitFor(() => expect(feedbackBodies(h.ff)).toEqual([{ content: '가'.repeat(1000) }]));
  });

  it('TC-FDBK-009 TC-FDBK-010 이모지 1000개·결합 이모지 200개는 허용, 1001개·201개는 거부', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff);
    type('😀'.repeat(1001));
    fireEvent.click(submit());
    await screen.findByTestId('feedback.validation-message');
    type(COMBINED_EMOJI.repeat(201));
    fireEvent.click(submit());
    await screen.findByTestId('feedback.validation-message');
    expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(0);
    type(COMBINED_EMOJI.repeat(200));
    expect(counter()).toHaveTextContent('1000/1000');
    fireEvent.click(submit());
    await waitFor(() => expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(1));
  });

  it('TC-FDBK-014 10만 자를 붙여 넣어도 화면이 멈추지 않고 카운터가 정확하며 전송은 거부된다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff);
    type('가'.repeat(100_000));
    expect(counter()).toHaveTextContent('100000/1000');
    fireEvent.click(submit());
    expect(await screen.findByTestId('feedback.validation-message')).toBeInTheDocument();
    expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(0);
  });
});

describe('피드백 전송', () => {
  it('TC-FDBK-015 REQ-FDBK-007 보내기를 누르면 POST /feedbacks {content}만 Bearer와 함께 보낸다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff);
    type('앱이 좋아요');
    fireEvent.click(submit());
    await waitFor(() => expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(1));
    const call = h.ff.callsTo(FEEDBACK_POST)[0]!;
    expect(JSON.parse(call.body as string)).toEqual({ content: '앱이 좋아요' });
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-FDBK-018 REQ-FDBK-006 전송 중에는 버튼이 "보내는 중..."이고 비활성이며 입력창은 읽기 전용이다', async () => {
    const gate = deferred<Response>();
    const { h } = await openFeedback();
    routeFeedback(h.ff, () => gate.promise);
    type('내용');
    fireEvent.click(submit());
    await waitFor(() => expect(submit()).toHaveTextContent('보내는 중...'));
    expect(submit()).toBeDisabled();
    expect(input()).toHaveAttribute('readonly');
    gate.resolve(resp('feedback/feedbacks__created.json'));
    await waitFor(() => expect(screen.queryByTestId('feedback.root')).not.toBeInTheDocument());
  });

  it('TC-FDBK-019 보내기를 3회 연타해도 POST는 1회뿐이다', async () => {
    const gate = deferred<Response>();
    const { h } = await openFeedback();
    routeFeedback(h.ff, () => gate.promise);
    type('내용');
    fireEvent.click(submit());
    fireEvent.click(submit());
    fireEvent.click(submit());
    gate.resolve(resp('feedback/feedbacks__created.json'));
    await waitFor(() => expect(screen.queryByTestId('feedback.root')).not.toBeInTheDocument());
    expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(1);
  });

  it('TC-FDBK-017 REQ-FDBK-008 성공하면 토스트 "피드백을 보내주셔서 감사해요."가 뜨고 화면이 닫혀 설정으로 돌아간다', async () => {
    const { h, router } = await openFeedback({ viaSettings: true });
    routeFeedback(h.ff);
    type('내용');
    fireEvent.click(submit());
    await screen.findByTestId('settings.root');
    expect(await screen.findByTestId('toast.message')).toHaveTextContent('피드백을 보내주셔서 감사해요.');
    expect(router.state.location.pathname).toBe('/settings');
    expect(router.state.historyAction).toBe('POP'); // 설정이 아래에 쌓여 있으므로 뒤로 간다
    expect(screen.queryByTestId('feedback.root')).not.toBeInTheDocument();
  });

  it('TC-FDBK-017 URL로 직접 들어온 피드백은 성공 뒤 설정으로 replace 이동한다(히스토리에 피드백이 남지 않는다)', async () => {
    const { h, router } = await openFeedback();
    routeFeedback(h.ff);
    type('내용');
    fireEvent.click(submit());
    await screen.findByTestId('settings.root');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(toastText()).toBe(t('fdbk.success'));
  });

  it('TC-FDBK-020 성공한 뒤 피드백을 다시 열면 이전 내용이 남아 있지 않다', async () => {
    const { h, router } = await openFeedback({ viaSettings: true });
    routeFeedback(h.ff);
    type('이전 내용');
    fireEvent.click(submit());
    await screen.findByTestId('settings.root');
    fireEvent.click(await screen.findByTestId('settings.feedback-row'));
    await screen.findByTestId('feedback.root');
    expect(input().value).toBe('');
    expect(counter()).toHaveTextContent('0/1000');
    expect(submit()).toBeDisabled();
    expect(router.state.location.pathname).toBe('/feedback');
  });

  it('TC-FDBK-021 REQ-FDBK-010 400이면 서버 message가 아니라 고정 문구를 검증 메시지로 보이고 입력은 유지된다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff, fx('feedback/feedbacks__bad-request-blank.json'));
    type('내용');
    fireEvent.click(submit());
    const message = await screen.findByTestId('feedback.validation-message');
    expect(message).toHaveTextContent('피드백은 1자 이상 1000자 이하로 입력해 주세요.');
    expect(message).not.toHaveTextContent('피드백 내용이 필요합니다.');
    expect(input().value).toBe('내용');
    expect(submit()).toBeEnabled();
    expect(screen.getByTestId('feedback.root')).toBeInTheDocument();
  });

  it('TC-FDBK-024 REQ-FDBK-012 500이면 "피드백을 보내지 못했어요. 다시 시도해 주세요."를 오류 메시지로 보이고 입력은 유지되며 요청은 1회뿐이다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff, fx('feedback/feedbacks__internal-error.json'));
    type('내용');
    fireEvent.click(submit());
    const message = await screen.findByTestId('feedback.error-message');
    expect(message).toHaveTextContent('피드백을 보내지 못했어요. 다시 시도해 주세요.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(input().value).toBe('내용');
    await act(async () => void (await h.clock.advance(10_000)));
    expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(1);
    expect(screen.queryByTestId('feedback.validation-message')).not.toBeInTheDocument();
  });

  it('TC-FDBK-025 연결 실패는 "네트워크 연결을 확인해 주세요."이고 입력을 유지하며 다시 보낼 수 있다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff, networkFailure, fx('feedback/feedbacks__created.json'));
    type('내용');
    fireEvent.click(submit());
    expect(await screen.findByTestId('feedback.error-message')).toHaveTextContent('네트워크 연결을 확인해 주세요.');
    expect(input().value).toBe('내용');
    fireEvent.click(submit());
    await screen.findByTestId('settings.root');
    expect(feedbackBodies(h.ff)).toEqual([{ content: '내용' }, { content: '내용' }]);
  });

  it('REQ-FDBK-009 실패 뒤 다시 입력하면 오류 문구가 사라진다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff, fx('feedback/feedbacks__internal-error.json'));
    type('내용');
    fireEvent.click(submit());
    await screen.findByTestId('feedback.error-message');
    type('내용 수정');
    expect(screen.queryByTestId('feedback.error-message')).not.toBeInTheDocument();
  });

  it('TC-FDBK-023 REQ-FDBK-011 REAUTHENTICATION_REQUIRED면 오류 문구 없이 로그인 화면으로 이동한다', async () => {
    const { h, router, toasts } = await openFeedback();
    routeFeedback(h.ff, fx('feedback/feedbacks__unauthorized.json'));
    h.ff.route('POST /auth/refresh', fx('auth/refresh__reauthentication-required.json'));
    type('내용');
    fireEvent.click(submit());
    await screen.findByTestId('login.root');
    expect(router.state.location.pathname).toBe('/login');
    expect(toasts.messages).toEqual([]);
  });

  it('TC-FDBK-022 401 UNAUTHORIZED는 refresh 뒤 한 번 다시 보내 성공하면 정상 완료한다', async () => {
    const { h } = await openFeedback();
    routeFeedback(h.ff, fx('feedback/feedbacks__unauthorized.json'), fx('feedback/feedbacks__created.json'));
    h.ff.route('POST /auth/refresh', fx('auth/refresh__success.json'));
    type('내용');
    fireEvent.click(submit());
    await screen.findByTestId('settings.root');
    expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(2);
  });
});

describe('피드백 화면 닫기·이탈·계정 전환', () => {
  it('TC-FDBK-032 닫기 버튼은 설정으로 돌아간다(설정에서 들어왔으면 뒤로, 직접 들어왔으면 replace) — 요청 없음', async () => {
    const pushed = await openFeedback({ viaSettings: true });
    type('작성 중인 내용');
    fireEvent.click(screen.getByTestId('feedback.close-button'));
    await screen.findByTestId('settings.root');
    expect(pushed.router.state.historyAction).toBe('POP');
    expect(pushed.h.ff.callsTo(FEEDBACK_POST)).toHaveLength(0);
  });

  it('TC-FDBK-032 직접 들어온 피드백의 닫기는 설정으로 replace 이동한다', async () => {
    const direct = await openFeedback();
    fireEvent.click(screen.getByTestId('feedback.close-button'));
    await screen.findByTestId('settings.root');
    expect(direct.router.state.historyAction).toBe('REPLACE');
    expect(direct.router.state.location.pathname).toBe('/settings');
  });

  it('TC-FDBK-032 브라우저 뒤로 가기도 설정으로 돌아간다', async () => {
    const { router } = await openFeedback({ viaSettings: true });
    expect(router.state.location.state).toEqual(SETTINGS_BELOW_STATE);
    await act(async () => router.navigate(-1));
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
  });

  it('TC-FDBK-029 전송 중 화면을 떠나면 요청이 취소되고 오류 문구·토스트가 보이지 않는다', async () => {
    const { h, router, toasts } = await openFeedback();
    routeFeedback(h.ff, () => new Promise<Response>(() => {}));
    type('내용');
    fireEvent.click(submit());
    await waitFor(() => expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(1));
    await act(async () => router.navigate('/settings'));
    await screen.findByTestId('settings.root');
    expect(h.ff.callsTo(FEEDBACK_POST)[0]!.signal?.aborted).toBe(true);
    expect(toasts.messages).toEqual([]);
    expect(screen.queryByTestId('feedback.error-message')).not.toBeInTheDocument();
  });

  it('TC-FDBK-030 전송 중 로그아웃하면 늦게 도착한 성공 응답이 토스트도 화면 전환도 일으키지 않는다', async () => {
    const gate = deferred<Response>();
    const { h, router, toasts } = await openFeedback();
    routeFeedback(h.ff, () => gate.promise);
    h.ff.route('POST /auth/logout', fx('auth/logout__no-content.json'));
    type('내용');
    fireEvent.click(submit());
    await waitFor(() => expect(h.ff.callsTo(FEEDBACK_POST)).toHaveLength(1));
    await act(async () => h.container.accountService.logout());
    await screen.findByTestId('login.root');
    gate.resolve(resp('feedback/feedbacks__created.json'));
    await act(async () => void (await h.clock.advance(1_000)));
    expect(toasts.messages).toEqual([]);
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByTestId('settings.root')).not.toBeInTheDocument();
  });

  it('TC-FDBK-034 D-22 피드백 내용은 분석 이벤트와 로그에 남지 않는다(screen_view feedback 외 파라미터에 내용 없음)', async () => {
    const secret = '비밀 피드백 내용 98765';
    const { h } = await openFeedback();
    routeFeedback(h.ff);
    type(secret);
    fireEvent.click(submit());
    await screen.findByTestId('settings.root');
    expect(JSON.stringify(h.tracker.events)).not.toContain(secret);
    expect(h.logger.dump()).not.toContain(secret);
  });

  it('REQ-FDBK-015 피드백 화면에는 제출한 내용을 다시 보거나 수정·삭제하는 UI가 없다', async () => {
    await openFeedback();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual(['feedback.close-button', 'feedback.submit-button']);
  });
});

describe('피드백 접근성 (R5)', () => {
  it('입력창은 카운터를 aria-describedby로 가리키고 1000자를 넘으면 aria-invalid이다', async () => {
    await openFeedback();
    expect(input()).toHaveAttribute('aria-describedby', counter().id);
    expect(counter().id).not.toBe('');
    expect(input()).not.toHaveAttribute('aria-invalid', 'true');
    type('가'.repeat(1001));
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    type('가'.repeat(1000));
    expect(input()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('전송 중 보내기 버튼은 aria-busy이다(테스트가 disabled를 요구하므로 disabled와 함께)', async () => {
    const gate = deferred<Response>();
    const { h } = await openFeedback();
    routeFeedback(h.ff, () => gate.promise);
    type('내용');
    fireEvent.click(submit());
    await waitFor(() => expect(submit()).toHaveAttribute('aria-busy', 'true'));
    gate.resolve(resp('feedback/feedbacks__created.json'));
    await waitFor(() => expect(screen.queryByTestId('feedback.root')).not.toBeInTheDocument());
  });
});
