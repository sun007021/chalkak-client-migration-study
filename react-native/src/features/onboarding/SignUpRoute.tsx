import { useEffect } from 'react';
import { BackHandler } from 'react-native';

import { useViewModelState } from '../../core/state/useViewModelState';
import { SignatureStep } from '../signature/SignatureStep';
import { LegalDocSheet, type LegalDocWebView } from './LegalDocSheet';
import type { SignUpFlowViewModel } from './SignUpFlowViewModel';
import { TermsScreen } from './TermsScreen';

/** 가입 흐름 화면(약관 -> 사인 그리기 -> 미리보기). ViewModel은 소유자(SignUpFlowOwner)가 만들고 버린다. */
export function SignUpRoute({
  flow,
  WebView,
}: {
  flow: SignUpFlowViewModel;
  WebView: LegalDocWebView;
}) {
  const { step } = useViewModelState(flow);

  useEffect(() => {
    // Android 하드웨어 뒤로: 문서 닫기 / 미리보기 -> 그리기 / 그리기 -> 약관 / 약관 -> 로그인.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      flow.back();
      return true;
    });
    return () => subscription.remove();
  }, [flow]);

  return (
    <>
      {step === 'terms' ? (
        <TermsScreen viewModel={flow.terms} />
      ) : (
        <SignatureStep flow={flow.signature} />
      )}
      <DocumentSheet flow={flow} WebView={WebView} />
    </>
  );
}

function DocumentSheet({ flow, WebView }: { flow: SignUpFlowViewModel; WebView: LegalDocWebView }) {
  const openDocument = useViewModelState(flow, (state) => state.openDocument);
  const document = flow.document;
  if (openDocument === null || document === null) return null;
  return (
    <LegalDocSheet viewModel={document} WebView={WebView} onClose={() => flow.closeDocument()} />
  );
}
