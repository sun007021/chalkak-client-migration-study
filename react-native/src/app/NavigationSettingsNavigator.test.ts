import { NavigationSettingsNavigator } from './NavigationSettingsNavigator';
import { FEEDBACK_ROUTE_NAME, SIGNATURE_CHANGE_ROUTE_NAME } from './navigation/routes';

function setup(ready = true) {
  const navigate = jest.fn();
  const navigator = new NavigationSettingsNavigator({ isReady: () => ready, navigate } as never);
  return { navigate, navigator };
}

describe('routes', () => {
  it('REQ-FDBK-014 피드백 화면의 라우트 이름은 Feedback이다(푸시 탭 보류기가 이 이름으로 판정한다)', () => {
    expect(FEEDBACK_ROUTE_NAME).toBe('Feedback');
  });

  it('REQ-SET-004 사인 변경 흐름의 라우트 이름은 SignatureChange다', () => {
    expect(SIGNATURE_CHANGE_ROUTE_NAME).toBe('SignatureChange');
  });
});

describe('NavigationSettingsNavigator', () => {
  it('TC-SET-050 openFeedback은 Feedback 라우트로 이동한다', () => {
    const { navigate, navigator } = setup();
    navigator.openFeedback();
    expect(navigate).toHaveBeenCalledWith('Feedback');
  });

  it('REQ-SET-004 openSignatureChange는 SignatureChange 라우트로 이동한다', () => {
    const { navigate, navigator } = setup();
    navigator.openSignatureChange();
    expect(navigate).toHaveBeenCalledWith('SignatureChange');
  });

  it('내비게이션이 준비되지 않았을 때의 이동 요청은 버린다', () => {
    const { navigate, navigator } = setup(false);
    navigator.openFeedback();
    navigator.openSignatureChange();
    expect(navigate).not.toHaveBeenCalled();
  });
});
