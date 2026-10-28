import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { SIGNATURE_MAX_BYTES } from '../../constants';
import { t } from '../../copy/ko';
import { makeHarness, renderApp } from '../../test/appHarness';
import { guestSession, memberSession } from '../../test/fixtures';
import { screenViews } from '../../test/screenViews';
import { drawStroke, stubCanvasRect } from '../../test/signatureDrawing';

const CREDENTIAL = { idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' };
const STROKE_A = [{ x: 100, y: 100 }, { x: 300, y: 200 }, { x: 500, y: 120 }];
const STROKE_B = [{ x: 600, y: 300 }, { x: 800, y: 340 }];

async function openDraw(mode: 'onboarding' | 'change', options: { strict?: boolean; draft?: boolean } = {}) {
  const h = makeHarness(mode === 'change' ? { session: memberSession() } : {});
  if (mode === 'onboarding' && options.draft !== false) h.container.signupDraft.set(CREDENTIAL);
  const view = renderApp(h.container, mode === 'onboarding' ? '/signup/signature' : '/settings/signature', { strict: options.strict });
  const root = await screen.findByTestId('signature.root');
  const canvas = screen.getByTestId('signature.canvas');
  stubCanvasRect(canvas);
  return { h, root, canvas, ...view };
}
const submit = () => screen.getByTestId('signature.submit-button');
const undo = () => screen.getByTestId('signature.undo-button');
const clear = () => screen.getByTestId('signature.clear-button');

describe('사인 그리기 화면 구성', () => {
  it('TC-SIGN-001 REQ-SIGN-001 획이 없으면 힌트가 보이고 "이 사인으로 할래요"·되돌리기·전체 지우기가 모두 비활성이다', async () => {
    const { root } = await openDraw('onboarding');
    expect(root).toHaveAttribute('data-mode', 'onboarding');
    expect(screen.getByTestId('signature.title')).toHaveTextContent(/작가님의\s*사인을 그려주세요/);
    expect(screen.getByTestId('signature.guide-text')).toHaveTextContent(/모든 사진에 함께할 사인이에요\.\s*자유롭게 남겨주시고, 실제 서명은 피해 주세요\./);
    expect(screen.getByTestId('signature.canvas-hint')).toHaveTextContent(t('onb.sign.pad-hint'));
    expect(submit()).toHaveTextContent(t('onb.sign.confirm'));
    expect(undo()).toHaveTextContent(t('onb.sign.undo'));
    expect(clear()).toHaveTextContent(t('onb.sign.clear'));
    expect(submit()).toBeDisabled();
    expect(undo()).toBeDisabled();
    expect(clear()).toBeDisabled();
    expect(screen.queryByTestId('signature.error-message')).not.toBeInTheDocument();
    expect(screen.getByTestId('signature.back-button')).toBeInTheDocument();
  });

  it('변경 모드는 같은 화면이고 data-mode만 change이다', async () => {
    const { root, h } = await openDraw('change');
    expect(root).toHaveAttribute('data-mode', 'change');
    expect(screen.getByTestId('signature.title')).toHaveTextContent(/작가님의\s*사인을 그려주세요/);
    expect(submit()).toBeDisabled();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('캔버스의 논리 크기는 1024×512이다(PNG 출력 규격과 같은 좌표계)', async () => {
    const { canvas } = await openDraw('onboarding');
    expect(canvas.getAttribute('width')).toBe('1024');
    expect(canvas.getAttribute('height')).toBe('512');
  });
});

describe('사인 그리기 입력', () => {
  it('TC-SIGN-004 포인터로 획을 그리면 힌트가 사라지고 제출·되돌리기·전체 지우기가 활성이다', async () => {
    const { canvas } = await openDraw('onboarding');
    drawStroke(canvas, STROKE_A);
    expect(screen.queryByTestId('signature.canvas-hint')).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();
    expect(undo()).toBeEnabled();
    expect(clear()).toBeEnabled();
  });

  it('TC-SIGN-002 점 하나만 찍어도(누르고 바로 뗌) 사인이 있는 것으로 본다', async () => {
    const { canvas } = await openDraw('onboarding');
    drawStroke(canvas, [{ x: 200, y: 200 }]);
    expect(submit()).toBeEnabled();
  });

  it('REQ-SIGN-002 누르지 않은 채 움직이거나(마우스 hover) 뗀 뒤 움직이는 것은 획이 아니다', async () => {
    const { canvas } = await openDraw('onboarding');
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 50, pointerId: 1, buttons: 0 });
    expect(submit()).toBeDisabled();
    drawStroke(canvas, STROKE_A);
    fireEvent.click(undo());
    fireEvent.pointerMove(canvas, { clientX: 70, clientY: 70, pointerId: 1, buttons: 0 });
    expect(submit()).toBeDisabled();
  });

  it('REQ-SIGN-002 pointercancel로도 획이 끝난다(이후 움직임은 같은 획에 더해지지 않는다)', async () => {
    const { canvas, h } = await openDraw('onboarding');
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1, buttons: 1 });
    fireEvent.pointerCancel(canvas, { pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 200, pointerId: 1, buttons: 1 });
    fireEvent.click(submit());
    await screen.findByTestId('signature-preview.root');
    expect(h.rasterizer.drawings[0]!.strokes).toEqual([[{ x: 100, y: 100 }, { x: 120, y: 120 }]]);
  });

  it('화면 좌표는 캔버스 CSS 크기에 비례해 1024×512 패드 좌표로 바뀌고, 상자 밖 좌표는 영역 안으로 보정된다', async () => {
    const { canvas, h } = await openDraw('onboarding'); // CSS 512×256 → 논리 1024×512 (2배)
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(canvas, { clientX: 9999, clientY: -40, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(canvas, { clientX: 9999, clientY: -40, pointerId: 1 });
    fireEvent.click(submit());
    await screen.findByTestId('signature-preview.root');
    expect(h.rasterizer.drawings[0]).toEqual({ width: 1024, height: 512, strokes: [[{ x: 200, y: 100 }, { x: 1024, y: 0 }]] });
  });

  it('TC-SIGN-006 되돌리기는 마지막 획부터 지우고 0개가 되면 제출·되돌리기가 비활성이다', async () => {
    const { canvas } = await openDraw('onboarding');
    drawStroke(canvas, STROKE_A);
    drawStroke(canvas, STROKE_B);
    fireEvent.click(undo());
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId('signature.canvas-hint')).not.toBeInTheDocument();
    fireEvent.click(undo());
    expect(submit()).toBeDisabled();
    expect(undo()).toBeDisabled();
    expect(screen.getByTestId('signature.canvas-hint')).toBeInTheDocument();
  });

  it('TC-SIGN-007 전체 지우기는 획을 모두 지우고 이어서 새로 그릴 수 있다', async () => {
    const { canvas, h } = await openDraw('onboarding');
    drawStroke(canvas, STROKE_A);
    drawStroke(canvas, STROKE_B);
    fireEvent.click(clear());
    expect(submit()).toBeDisabled();
    drawStroke(canvas, STROKE_B);
    fireEvent.click(submit());
    await screen.findByTestId('signature-preview.root');
    expect(h.rasterizer.drawings[0]!.strokes).toEqual([STROKE_B]);
  });

  it('REQ-SIGN-002 그리는 동안 캔버스에 획이 그려진다(2D 컨텍스트 stroke 호출)', async () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, prop: string) => (typeof prop === 'string' && !prop.startsWith('__') ? (..._a: unknown[]) => void calls.push(prop) : undefined), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
    const { canvas } = await openDraw('onboarding');
    drawStroke(canvas, STROKE_A);
    expect(calls).toContain('stroke');
  });
});

describe('사인 그리기 제출', () => {
  it('REQ-SIGN-009 TC-SIGN-008 "이 사인으로 할래요"를 연타해도 PNG는 한 번 만들고 미리보기는 한 번만 열린다(push)', async () => {
    const { h, canvas, path, router } = await openDraw('onboarding');
    drawStroke(canvas, STROKE_A);
    fireEvent.click(submit());
    fireEvent.click(submit());
    fireEvent.click(submit());
    const preview = await screen.findByTestId('signature-preview.root');
    expect(preview).toHaveAttribute('data-mode', 'onboarding');
    expect(path()).toBe('/signup/signature/preview');
    expect(router.state.historyAction).toBe('PUSH');
    expect(h.rasterizer.calls).toBe(1);
    expect(h.container.signatureDraft.get()).toBe(h.rasterizer.results[0]);
    await router.navigate(-1); // 한 번 뒤로 가면 그리기 화면이다(미리보기가 겹쳐 쌓이지 않았다)
    expect(await screen.findByTestId('signature.root')).toBeInTheDocument();
  });

  it('변경 모드는 /settings/signature/preview로 간다', async () => {
    const { canvas, path } = await openDraw('change');
    drawStroke(canvas, STROKE_A);
    fireEvent.click(submit());
    expect(await screen.findByTestId('signature-preview.root')).toHaveAttribute('data-mode', 'change');
    expect(path()).toBe('/settings/signature/preview');
  });

  it('TC-SIGN-015 PNG가 1MiB를 넘으면 요청 0건으로 "사인 이미지가 1MB를 초과했어요."를 보이고 이동하지 않으며 그린 내용을 유지한다', async () => {
    const { h, canvas, path } = await openDraw('onboarding');
    h.rasterizer.size = SIGNATURE_MAX_BYTES + 1;
    drawStroke(canvas, STROKE_A);
    fireEvent.click(submit());
    expect(await screen.findByTestId('signature.error-message')).toHaveTextContent('사인 이미지가 1MB를 초과했어요.');
    expect(path()).toBe('/signup/signature');
    expect(h.ff.calls).toHaveLength(0);
    expect(submit()).toBeEnabled();
    expect(undo()).toBeEnabled();
    drawStroke(canvas, STROKE_B); // 다시 그리면 오류가 사라진다
    expect(screen.queryByTestId('signature.error-message')).not.toBeInTheDocument();
  });

  it('TC-SIGN-014 정확히 1,048,576B는 허용되어 미리보기로 간다', async () => {
    const { h, canvas } = await openDraw('onboarding');
    h.rasterizer.size = SIGNATURE_MAX_BYTES;
    drawStroke(canvas, STROKE_A);
    fireEvent.click(submit());
    expect(await screen.findByTestId('signature-preview.root')).toBeInTheDocument();
  });
});

describe('사인 그리기 이동·가드·분석', () => {
  it('가입 모드의 뒤로 버튼은 약관 화면으로 돌아가고(가입 컨텍스트는 유지) 서버 호출은 없다', async () => {
    const { h, path } = await openDraw('onboarding');
    fireEvent.click(screen.getByTestId('signature.back-button'));
    expect(await screen.findByTestId('terms.root')).toBeInTheDocument();
    expect(path()).toBe('/signup/terms');
    expect(h.container.signupDraft.get()).toEqual(CREDENTIAL);
    expect(h.ff.calls).toHaveLength(0);
  });

  it('변경 모드의 뒤로 버튼은 설정으로 돌아가고 서버 호출은 0건이다(TC-SIGN-042)', async () => {
    const { h, path } = await openDraw('change');
    fireEvent.click(screen.getByTestId('signature.back-button'));
    await waitFor(() => expect(path()).toBe('/settings'));
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('가입 컨텍스트가 없으면(새로고침) 그리기 화면 대신 로그인으로 replace 이동한다', async () => {
    const h = makeHarness();
    const { path } = renderApp(h.container, '/signup/signature');
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(screen.queryByTestId('signature.root')).not.toBeInTheDocument();
    expect(path()).toBe('/login');
  });

  it('변경 화면은 회원만: 세션이 없으면 로그인으로, 게스트는 설정으로 보낸다', async () => {
    const none = makeHarness();
    const a = renderApp(none.container, '/settings/signature');
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(a.path()).toBe('/login');
    a.unmount();

    const guest = makeHarness({ session: guestSession });
    const b = renderApp(guest.container, '/settings/signature');
    expect(await screen.findByTestId('settings.root')).toBeInTheDocument();
    expect(screen.queryByTestId('signature.root')).not.toBeInTheDocument();
    expect(b.path()).toBe('/settings');
    expect(guest.ff.calls).toHaveLength(0);
  });

  it('변경 화면에는 하단 바가 없다(탭 셸 밖)', async () => {
    await openDraw('change');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('TC-ONB-049 TC-SIGN-043 가입 그리기는 screen_view onboarding_signature, 변경 그리기는 change_signature를 한 번만 보낸다(StrictMode 포함)', async () => {
    const a = await openDraw('onboarding', { strict: true });
    expect(screenViews(a.h.tracker).filter((n) => n === 'onboarding_signature')).toHaveLength(1);
    expect(screenViews(a.h.tracker).filter((n) => n === 'change_signature')).toHaveLength(0);
    a.unmount();
    const b = await openDraw('change', { strict: true });
    expect(screenViews(b.h.tracker).filter((n) => n === 'change_signature')).toHaveLength(1);
  });

  it('가드로 리다이렉트된 경우 그리기 화면의 screen_view는 나가지 않는다', async () => {
    const h = makeHarness();
    renderApp(h.container, '/signup/signature');
    await screen.findByTestId('login.root');
    expect(screenViews(h.tracker).filter((n) => n === 'onboarding_signature')).toHaveLength(0);
  });
});
