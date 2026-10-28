import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { ROUTES } from '../../app/paths';
import { t } from '../../copy/ko';
import { useScreenView } from '../../core/analytics/useScreenView';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { LoadingIndicator } from '../../core/ui/StateViews';
import type { SignatureMode } from './SignatureMode';
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
  // 마운트 시 한 번만 판정한다. 가입 컨텍스트가 없으면 로그인, 내보낼 PNG가 없으면 그리기로(새로고침 등).
  const [entry] = useState<{ to: string } | { png: Blob }>(() => {
    if (mode === 'onboarding' && container.signupDraft.get() === null) return { to: ROUTES.login };
    const png = container.signatureDraft.get();
    return png ? { png } : { to: drawPath(mode) };
  });
  const png = 'png' in entry ? entry.png : null;
  const create = useCallback(() => (png ? container.createSignaturePreviewViewModel(mode, png) : null), [container, mode, png]);
  const vm = useOwnedViewModel(create);
  if (!png) return <Navigate to={(entry as { to: string }).to} replace />;
  return vm ? <SignaturePreviewView vm={vm} mode={mode} png={png} /> : null;
}

const imageStyle: CSSProperties = { width: '100%', aspectRatio: '2 / 1', objectFit: 'contain', display: 'block', background: 'linear-gradient(135deg, #7a8b99, #b9a58f)', borderRadius: 12 };

function SignaturePreviewView({ vm, mode, png }: { vm: SignaturePreviewViewModel; mode: SignatureMode; png: Blob }): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  // 그리기 화면에서 push로 들어왔는지. 변경 모드는 끝날 때 그 두 항목을 백스택에서 걷어 낸다(REQ-SIGN-022).
  const fromDraw = (useLocation().state as { fromDraw?: boolean } | null)?.fromDraw === true;
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
    switch (outcome.kind) {
      case 'home':
        container.signatureDraft.clear();
        navigate(ROUTES.home, { replace: true });
        break;
      case 'settings':
        container.signatureDraft.clear();
        if (fromDraw) navigate(-2);
        else navigate(ROUTES.settings, { replace: true });
        break;
      case 'draw':
        container.signatureDraft.clear();
        if (mode === 'change' && fromDraw) navigate(-1);
        else navigate(drawPath(mode), { replace: true });
        break;
      case 'login':
        container.signatureDraft.clear();
        navigate(ROUTES.login, { replace: true });
        break;
      default:
        break;
    }
  };
  return (
    <div data-testid="signature-preview.root" data-mode={mode} style={{ minHeight: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      <h1 data-testid="signature-preview.title">{t('onb.sign.preview.title')}</h1>
      {imageUrl && <img data-testid="signature-preview.image" src={imageUrl} alt="" style={imageStyle} />}
      {mode === 'change' && <p data-testid="signature-preview.change-notice">{t('sign.change.notice')}</p>}
      {state.busy && <LoadingIndicator screenId="signature-preview" />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        <button type="button" data-testid="signature-preview.redraw-button" disabled={state.busy} style={{ minHeight: 48 }} onClick={() => go(vm.redraw())}>
          {t('onb.sign.preview.redraw')}
        </button>
        <button type="button" data-testid="signature-preview.confirm-button" disabled={state.busy} style={{ minHeight: 48 }} onClick={() => void vm.confirm().then(go)}>
          {mode === 'onboarding' ? t('onb.sign.preview.start') : t('sign.change.confirm')}
        </button>
      </div>
    </div>
  );
}
