import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES, isSettingsBelow } from '../../app/paths';
import { t } from '../../copy/ko';
import { images } from '../../assets/images';
import { color, font, radius } from '../../design/tokens';
import { Button } from '../../core/ui/Button';
import { useSignupGate } from '../onboarding/useSignupGate';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { LoadingIndicator } from '../../core/ui/StateViews';
import type { SignatureMode } from './SignatureMode';
import { planAfterOutcome } from './signatureNavigation';
import type { SignaturePreviewOutcome, SignaturePreviewViewModel } from './SignaturePreviewViewModel';

/**
 * 사인 미리보기 화면(onboarding: /signup/signature/preview, change: /settings/signature/preview). data-testid: signature-preview.root(data-mode), signature-preview.title,
 * signature-preview.image(PNG를 사진 같은 배경 위에 얹어 표시, src는 blob URL이며 언마운트에서 revoke), signature-preview.redraw-button,
 * signature-preview.confirm-button(가입 "시작하기" / 변경 "사인 변경하기", busy면 disabled), signature-preview.change-notice(변경 모드만), signature-preview.loading(busy 동안).
 * SignatureDraft에 PNG가 없으면 해당 모드의 그리기 경로로 replace. screen_view는 onboarding_signature_preview / change_signature_preview.
 * 결과: home → /home(replace), settings → /settings(replace), draw → 그리기 경로(replace), login → /login(replace).
 */
const drawPath = (mode: SignatureMode): string => (mode === 'onboarding' ? ROUTES.signupSignature : ROUTES.changeSignature);

export function SignaturePreviewScreen({ mode }: { mode: SignatureMode }): ReactNode {
  const container = useContainer();
  const gate = useSignupGate(mode === 'onboarding');
  // 내보낼 PNG는 마운트 시 한 번만 잡는다. 없으면(새로고침 등) 그리기로 보낸다.
  const [png] = useState(() => container.signatureDraft.get());
  const ok = gate.kind === 'ok';
  const create = useCallback(() => (ok && png ? container.createSignaturePreviewViewModel(mode, png) : null), [container, mode, png, ok]);
  const vm = useOwnedViewModel(create);
  if (gate.kind === 'redirect') return <Navigate to={gate.to} replace />;
  if (gate.kind === 'checking') return null;
  if (!png) return <Navigate to={drawPath(mode)} replace />;
  return vm ? <SignaturePreviewView vm={vm} mode={mode} png={png} /> : null;
}

// 원본 미리보기(screens-a §6.2): 사진 5:6 라운드 18, 사인 112×84를 오른쪽 아래(안쪽 8)에 얹는다.
const frameStyle: CSSProperties = { position: 'relative', width: '100%', aspectRatio: '5 / 6', overflow: 'hidden', borderRadius: radius.xlarge, background: color.calendarCell };

function SignaturePreviewView({ vm, mode, png }: { vm: SignaturePreviewViewModel; mode: SignatureMode; png: Blob }): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  // 설정이 두 칸 아래에 쌓여 있으면 끝날 때 뒤로 가기로 그리기·미리보기를 걷어 낸다(REQ-SIGN-022).
  const below = isSettingsBelow(useLocation());
  useScreenView(mode === 'onboarding' ? 'onboarding_signature_preview' : 'change_signature_preview');
  const state = useViewModel(vm);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = container.blobUrls.create(png);
    // 외부 자원(blob URL)을 화면 수명에 묶는 것이라 의도된 setState다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageUrl(url);
    return () => container.blobUrls.revoke(url);
  }, [container, png]);

  const go = (outcome: SignaturePreviewOutcome) => {
    const plan = planAfterOutcome(mode, outcome, below);
    if (!plan) return;
    container.signatureDraft.clear();
    if (plan.kind === 'back') navigate(-plan.steps);
    else navigate(plan.to, { replace: true });
  };
  return (
    <div
      data-testid="signature-preview.root"
      data-mode={mode}
      className="ck-screen"
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: 'calc(var(--safe-top) + 50px) var(--space-screen-horizontal) calc(18px + var(--safe-bottom))', background: color.background }}
    >
      <h1 data-testid="signature-preview.title" style={{ ...font('title1') }}>{t('onb.sign.preview.title')}</h1>
      {mode === 'change' && (
        <p data-testid="signature-preview.change-notice" style={{ marginTop: 'var(--space-sm)', color: color.textMuted, ...font('subheadline') }}>
          {t('sign.change.notice')}
        </p>
      )}
      <div style={{ ...frameStyle, marginTop: mode === 'change' ? 36 : 50 }}>
        <img src={images.previewPhoto} alt="" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        {imageUrl && <img data-testid="signature-preview.image" src={imageUrl} alt="" style={{ position: 'absolute', right: 8, bottom: 8, width: 112, height: 84, objectFit: 'contain' }} />}
      </div>
      {state.busy && <LoadingIndicator screenId="signature-preview" variant="overlay" />}
      <div style={{ display: 'flex', gap: 20, marginTop: 'auto', paddingTop: 'var(--space-xl)' }}>
        <Button variant="outlined" fill data-testid="signature-preview.redraw-button" disabled={state.busy} onClick={() => go(vm.redraw())}>
          {t('onb.sign.preview.redraw')}
        </Button>
        <Button fill data-testid="signature-preview.confirm-button" disabled={state.busy} onClick={() => void vm.confirm().then(go, () => undefined)}>
          {mode === 'onboarding' ? t('onb.sign.preview.start') : t('sign.change.confirm')}
        </Button>
      </div>
    </div>
  );
}
