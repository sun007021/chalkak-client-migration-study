import { StackActions } from '@react-navigation/native';

import { KstDate } from '../core/time/KstDate';
import { NavigationUploadNavigator } from './NavigationUploadNavigator';

function setup(ready = true, routes: { key: string; name: string }[] = []) {
  const getRootState = jest.fn(() => ({ routes }));
  const navigate = jest.fn();
  const dispatch = jest.fn();
  const goBack = jest.fn();
  const navigator = new NavigationUploadNavigator({
    isReady: () => ready,
    getRootState,
    navigate,
    dispatch,
    goBack,
  } as never);
  return { navigator, navigate, dispatch, goBack };
}

describe('NavigationUploadNavigator', () => {
  it('TC-UPL-002 openUpload는 Upload 화면을 topicDate와 함께 연다', () => {
    const { navigator, navigate } = setup();
    navigator.openUpload({ topicDate: KstDate.of(2026, 10, 27) });
    expect(navigate).toHaveBeenCalledWith('Upload', { topicDate: '2026-10-27' });
  });

  it('REQ-UPL-064 showSuccess는 업로드 화면을 성공 화면으로 바꾼다(replace, 뒤로 가도 업로드 화면 없음)', () => {
    const { navigator, dispatch, navigate } = setup();
    navigator.showSuccess({
      topicTitle: '가을 하늘',
      topicDate: KstDate.of(2026, 10, 27),
      moderationStatus: 'PENDING',
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      StackActions.replace('UploadSuccess', {
        topicTitle: '가을 하늘',
        topicDate: '2026-10-27',
        moderationStatus: 'PENDING',
      }),
    );
  });

  it('showSuccess는 맨 위가 다른 화면이어도 업로드 화면의 키로 replace한다', () => {
    const { navigator, dispatch } = setup(true, [
      { key: 'tabs-1', name: 'Tabs' },
      { key: 'upload-7', name: 'Upload' },
      { key: 'editor-3', name: 'PhotoEdit' },
    ]);
    navigator.showSuccess({
      topicTitle: 'x',
      topicDate: KstDate.of(2026, 10, 27),
      moderationStatus: 'PENDING',
    });
    expect(dispatch).toHaveBeenCalledWith({
      ...StackActions.replace('UploadSuccess', {
        topicTitle: 'x',
        topicDate: '2026-10-27',
        moderationStatus: 'PENDING',
      }),
      source: 'upload-7',
    });
  });

  it('TC-UPL-090 close는 뒤로 간다(진입한 탭으로 복귀)', () => {
    const { navigator, goBack } = setup();
    navigator.close();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('TC-UPL-086 openDisplay는 전시 탭을 업로드한 날짜로 연다', () => {
    const { navigator, navigate } = setup();
    navigator.openDisplay(KstDate.of(2026, 10, 27));
    expect(navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Display',
      params: { date: '2026-10-27' },
    });
  });

  it('내비게이션이 준비되기 전의 요청은 버린다', () => {
    const { navigator, navigate, dispatch, goBack } = setup(false);
    navigator.openUpload({ topicDate: KstDate.of(2026, 10, 27) });
    navigator.showSuccess({
      topicTitle: 'x',
      topicDate: KstDate.of(2026, 10, 27),
      moderationStatus: 'PENDING',
    });
    navigator.close();
    navigator.openDisplay(KstDate.of(2026, 10, 27));
    expect(navigate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });
});
