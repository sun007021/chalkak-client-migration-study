import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES, SETTINGS_BELOW_STATE, isSettingsBelow } from '../../app/paths';
import { SIGNATURE_PNG_SIZE } from '../../constants';
import { t } from '../../copy/ko';
import { useSignupGate } from '../onboarding/useSignupGate';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import type { SignatureDrawViewModel } from './SignatureDrawViewModel';
import type { SignatureMode } from './SignatureMode';
import type { SignaturePad } from './SignaturePad';
import { clientToPad, smoothPath } from './signatureGeometry';
import { planDrawBack } from './signatureNavigation';

/**
 * 사인 그리기 화면(onboarding: /signup/signature, change: /settings/signature). data-testid: signature.root(data-mode), signature.title, signature.guide-text,
 * signature.canvas(포인터 이벤트 대상, 논리 크기 1024×512), signature.canvas-hint(획이 없을 때만), signature.undo-button, signature.clear-button,
 * signature.submit-button(사인이 없거나 busy면 disabled), signature.back-button, signature.error-message(오류가 있을 때만).
 * 포인터: pointerdown → 획 시작(clientToPad), 버튼이 눌린 pointermove → 점 추가, pointerup·pointercancel → 점을 더하지 않고 획만 끝낸다. 누르지 않은 hover는 무시. 뒤로 버튼: 가입은 /signup/terms, 변경은 /settings로 replace.
 * 가입 모드에서 SignupDraft가 없으면 /login으로 replace(그리지 않음). 마운트마다 새 ViewModel·빈 패드. screen_view는 onboarding_signature / change_signature를 useScreenView로.
 */
export function SignatureDrawScreen({ mode }: { mode: SignatureMode }): ReactNode {
  const container = useContainer();
  const gate = useSignupGate(mode === 'onboarding');
  const allowed = gate.kind === 'ok';
  const create = useCallback(() => {
    if (!allowed) return null;
    container.signatureDraft.clear(); // 빈 패드로 시작하므로 이전 PNG도 남기지 않는다.
    return container.createSignatureDrawViewModel(mode);
  }, [container, mode, allowed]);
  const vm = useOwnedViewModel(create);
  if (gate.kind === 'redirect') return <Navigate to={gate.to} replace />;
  return vm ? <SignatureDrawView vm={vm} mode={mode} /> : null;
}

const canvasStyle: CSSProperties = { width: '100%', aspectRatio: '2 / 1', display: 'block', background: '#2b2b2b', borderRadius: 12, touchAction: 'none' };

/** 패드의 획을 화면 캔버스에 그린다(논리 크기 1024×512, 흰 획). getContext가 없으면(테스트 환경) 그리지 않는다. */
function paintStrokes(canvas: HTMLCanvasElement, pad: SignaturePad, strokes: SignaturePad['state']['strokes']): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, pad.size.width, pad.size.height);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = SIGNATURE_PNG_SIZE.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      const only = stroke[0]!;
      ctx.beginPath();
      ctx.arc(only.x, only.y, SIGNATURE_PNG_SIZE.strokeWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    for (const op of smoothPath(stroke)) {
      if (op.op === 'move') ctx.moveTo(op.x, op.y);
      else if (op.op === 'line') ctx.lineTo(op.x, op.y);
      else ctx.quadraticCurveTo(op.cx, op.cy, op.x, op.y);
    }
    ctx.stroke();
  }
}

function SignatureDrawView({ vm, mode }: { vm: SignatureDrawViewModel; mode: SignatureMode }): ReactNode {
  const navigate = useNavigate();
  const below = isSettingsBelow(useLocation());
  useScreenView(mode === 'onboarding' ? 'onboarding_signature' : 'change_signature');
  const state = useViewModel(vm);
  const pad = vm.pad;
  const padState = useViewModel(pad);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) paintStrokes(canvasRef.current, pad, padState.strokes);
  }, [pad, padState.strokes]);

  const point = (event: PointerEvent<HTMLCanvasElement>) =>
    clientToPad({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), pad.size);
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // 포인터 캡처가 없어도 그릴 수 있다.
    }
    pad.beginStroke(point(event));
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.buttons === 0) return; // 누르지 않은 hover는 획이 아니다.
    pad.extendStroke(point(event));
  };
  const endStroke = () => pad.endStroke();
  const submit = () =>
    void vm.submit().then((outcome) => {
      if (outcome.kind === 'preview') navigate(mode === 'onboarding' ? ROUTES.signupSignaturePreview : ROUTES.changeSignaturePreview, { state: below ? SETTINGS_BELOW_STATE : undefined });
    }, () => undefined);
  const back = () => {
    const plan = planDrawBack(mode, below);
    if (plan.kind === 'back') navigate(-plan.steps);
    else navigate(plan.to, { replace: true });
  };
  return (
    <div data-testid="signature.root" data-mode={mode} style={{ minHeight: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      <button type="button" data-testid="signature.back-button" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={back}>
        ←
      </button>
      <h1 data-testid="signature.title" style={{ whiteSpace: 'pre-line' }}>
        {t('onb.sign.title')}
      </h1>
      <p data-testid="signature.guide-text" style={{ whiteSpace: 'pre-line' }}>
        {t('onb.sign.guide')}
      </p>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          data-testid="signature.canvas"
          width={pad.size.width}
          height={pad.size.height}
          style={canvasStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
        {!padState.hasSignature && (
          <span data-testid="signature.canvas-hint" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', pointerEvents: 'none' }}>
            {t('onb.sign.pad-hint')}
          </span>
        )}
      </div>
      {state.error && (
        <p key={state.error.id} data-testid="signature.error-message" role="alert">
          {state.error.message}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid="signature.undo-button" disabled={!padState.canUndo} style={{ minHeight: 44 }} onClick={() => pad.undo()}>
          {t('onb.sign.undo')}
        </button>
        <button type="button" data-testid="signature.clear-button" disabled={!padState.hasSignature} style={{ minHeight: 44 }} onClick={() => pad.clear()}>
          {t('onb.sign.clear')}
        </button>
      </div>
      <button type="button" data-testid="signature.submit-button" disabled={!padState.hasSignature || state.busy} style={{ marginTop: 'auto', minHeight: 48 }} onClick={submit}>
        {t('onb.sign.confirm')}
      </button>
    </div>
  );
}
