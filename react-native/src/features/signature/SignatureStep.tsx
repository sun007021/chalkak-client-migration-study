import { useViewModelState } from '../../core/state/useViewModelState';
import { SignatureDrawScreen } from './SignatureDrawScreen';
import type { SignatureFlowViewModel } from './SignatureFlowViewModel';
import { SignaturePreviewScreen } from './SignaturePreviewScreen';

/** 사인 그리기/미리보기. 가입과 설정의 사인 변경이 같은 화면을 쓴다. */
export function SignatureStep({ flow }: { flow: SignatureFlowViewModel | null }) {
  if (flow === null) return null;
  return <SignatureFlowScreen flow={flow} />;
}

function SignatureFlowScreen({ flow }: { flow: SignatureFlowViewModel }) {
  const { step } = useViewModelState(flow);
  const preview = flow.preview;
  if (step === 'preview' && preview !== null) return <SignaturePreviewScreen viewModel={preview} />;
  return <SignatureDrawScreen viewModel={flow.draw} mode={flow.mode} onBack={() => flow.back()} />;
}
