import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { makeHarness, renderApp } from '../test/appHarness';
import { SETTINGS_BELOW_STATE } from './paths';
import { loadFixture, memberSession } from '../test/fixtures';
import { screenViews } from '../test/screenViews';
import { CARD_GET, CHANGE_CONFIRM, CHANGE_PUT, CHANGE_UPLOADS, fx, routeChange, sequence } from '../test/signatureRoutes';
import { drawStroke, stubCanvasRect } from '../test/signatureDrawing';

const STROKE = [{ x: 100, y: 100 }, { x: 300, y: 220 }, { x: 520, y: 140 }];

/** 설정 탭에서 시작해(설정 화면은 다음 PR이라 자리표시) 사인 변경 화면을 push로 연다. */
async function startFromSettings(options: { strict?: boolean } = {}) {
  const h = makeHarness({ session: memberSession() });
  const view = renderApp(h.container, '/settings', options);
  await screen.findByTestId('settings.root');
  await act(async () => view.router.navigate('/settings/signature', { state: SETTINGS_BELOW_STATE }));
  const canvas = await screen.findByTestId('signature.canvas');
  stubCanvasRect(canvas);
  return { h, canvas, ...view };
}
async function drawAndPreview(canvas: HTMLElement) {
  drawStroke(canvas, STROKE);
  fireEvent.click(screen.getByTestId('signature.submit-button'));
  await screen.findByTestId('signature-preview.root');
}

describe('사인 변경 전체 흐름 (설정 → 그리기 → 미리보기 → 설정)', () => {
  it('TC-SIGN-019 TC-SIGN-025 TC-SIGN-026 사인을 그려 변경하면 uploads → PUT → 확정 → 설정 복귀 + 토스트 + 사인 카드 GET 재조회 순서이다', async () => {
    const { h, canvas, path } = await startFromSettings();
    routeChange(h.ff);
    await drawAndPreview(canvas);
    expect(path()).toBe('/settings/signature/preview');
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(path()).toBe('/settings'));
    expect(await screen.findByTestId('toast.message')).toHaveTextContent('사인 반영까지 시간이 좀 걸릴 수 있어요!');
    await waitFor(() => expect(h.ff.callsTo(CARD_GET)).toHaveLength(1));
    expect(sequence(h.ff).slice(0, 4)).toEqual([CHANGE_UPLOADS, CHANGE_PUT, CHANGE_CONFIRM, CARD_GET]);
    expect(h.container.signatureCard.state.status).toBe('content');
  });

  it('TC-NAV-038 TC-SIGN-043 screen_view는 change_signature, change_signature_preview 순으로 한 번씩이고 마지막에 설정으로 돌아온다(StrictMode 포함)', async () => {
    const { h, canvas, path } = await startFromSettings({ strict: true });
    routeChange(h.ff);
    await drawAndPreview(canvas);
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(path()).toBe('/settings'));
    await screen.findByTestId('settings.root');
    expect(screenViews(h.tracker)).toEqual(['settings', 'change_signature', 'change_signature_preview', 'settings']);
  });

  it('REQ-SIGN-022 변경이 끝난 뒤 뒤로 가도 그리기·미리보기 화면이 다시 보이지 않는다', async () => {
    const { h, canvas, router, path } = await startFromSettings();
    routeChange(h.ff);
    await drawAndPreview(canvas);
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(path()).toBe('/settings'));
    await act(async () => router.navigate(-1));
    expect(screen.queryByTestId('signature.root')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signature-preview.root')).not.toBeInTheDocument();
    expect(router.state.location.pathname).not.toMatch(/signature/);
  });

  it('TC-SIGN-042 그리기 도중 뒤로 가기로 설정에 돌아오면 서버 호출이 0건이고 사인 카드는 그대로이다', async () => {
    const { h, canvas, router, path } = await startFromSettings();
    drawStroke(canvas, STROKE);
    await act(async () => router.navigate(-1));
    await waitFor(() => expect(path()).toBe('/settings'));
    expect(h.ff.calls).toHaveLength(0);
    expect(h.container.signatureCard.state).toEqual({ status: 'idle', imageUrl: null });
  });

  it('TC-SIGN-029 서버가 사인을 거절하면 그리기 화면으로 돌아가 빈 패드에서 다시 그려 변경할 수 있다', async () => {
    const { h, canvas, path } = await startFromSettings();
    routeChange(h.ff, { confirm: [fx('signature/users-me-signature__put-invalid-signature.json'), fx('signature/users-me-signature__put-success.json')] });
    await drawAndPreview(canvas);
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await screen.findByTestId('signature.root');
    expect(path()).toBe('/settings/signature');
    expect(screen.getByTestId('signature.submit-button')).toBeDisabled();
    const again = screen.getByTestId('signature.canvas');
    stubCanvasRect(again);
    await drawAndPreview(again);
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(path()).toBe('/settings'));
    expect(h.ff.callsTo(CHANGE_UPLOADS)).toHaveLength(2);
  });

  it('TC-SIGN-038 변경 진행 중 로그아웃되면 응답이 와도 이전 계정의 사인 카드에 반영하지 않고 토스트도 없다', async () => {
    const { h, canvas } = await startFromSettings();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    routeChange(h.ff, {
      confirm: [
        async () => {
          await gate;
          return loadFixture('signature/users-me-signature__put-success.json').toResponse();
        },
      ],
    });
    await drawAndPreview(canvas);
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(h.ff.callsTo(CHANGE_CONFIRM)).toHaveLength(1));
    await act(async () => {
      await h.container.accountService.logout();
    });
    await act(async () => {
      release();
      await h.clock.advance(0);
    });
    expect(h.ff.callsTo(CARD_GET)).toHaveLength(0);
    expect(h.container.signatureCard.state).toEqual({ status: 'idle', imageUrl: null });
    expect(screen.queryByText('사인 반영까지 시간이 좀 걸릴 수 있어요!')).not.toBeInTheDocument();
  });

  it('딥링크로 그리기가 첫 항목이면(settingsBelow 없음) 끝난 뒤 -2로 나가지 않고 설정으로 replace한다', async () => {
    const h = makeHarness({ session: memberSession() });
    const { router, path } = renderApp(h.container, '/settings/signature');
    const canvas = await screen.findByTestId('signature.canvas');
    stubCanvasRect(canvas);
    routeChange(h.ff);
    await drawAndPreview(canvas);
    fireEvent.click(screen.getByTestId('signature-preview.confirm-button'));
    await waitFor(() => expect(path()).toBe('/settings'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
    expect(screen.queryByTestId('signature-preview.root')).not.toBeInTheDocument();
  });

  it('딥링크 그리기의 뒤로 버튼은 설정으로 replace한다', async () => {
    const h = makeHarness({ session: memberSession() });
    const { router, path } = renderApp(h.container, '/settings/signature');
    await screen.findByTestId('signature.canvas');
    fireEvent.click(screen.getByTestId('signature.back-button'));
    await waitFor(() => expect(path()).toBe('/settings'));
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
