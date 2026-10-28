import type { SignatureFlowViewModel } from './SignatureFlowViewModel';

/**
 * 설정에서 사인 변경 흐름(change 모드)을 여는 진입점. 설정 화면의 내비게이션(PR11)이 구현하고,
 * 흐름 ViewModel의 소유자도 그 내비게이션이다(화면이 만들지 않는다).
 * flow.onExit/onCompleted에서 스택을 닫고, 완료 시 SignatureCardViewModel.refresh()를 부른다.
 */
export interface SignatureChangeFlowFactory {
  create(host: { onCompleted: () => void; onExit: () => void }): SignatureFlowViewModel;
}
