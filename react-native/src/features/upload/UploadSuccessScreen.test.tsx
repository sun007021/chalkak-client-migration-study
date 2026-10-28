import { fireEvent, render, screen } from '@testing-library/react-native';

import { FakeAnalyticsTracker } from '../../core/analytics/__testing__/FakeAnalyticsTracker';
import { KstDate } from '../../core/time/KstDate';
import { t } from '../../shared/copy';
import { FakeUploadNavigator } from './__testing__/FakeUploadNavigator';
import { UploadSuccessScreen } from './UploadSuccessScreen';
import { UploadSuccessViewModel } from './UploadSuccessViewModel';

async function renderSuccess(moderationStatus: 'PENDING' | 'VALIDATING', topicTitle = '가을 하늘') {
  const analytics = new FakeAnalyticsTracker();
  const navigator = new FakeUploadNavigator();
  const viewModel = new UploadSuccessViewModel({
    params: { topicTitle, topicDate: KstDate.of(2026, 10, 27), moderationStatus },
    analytics,
    navigator,
  });
  await render(<UploadSuccessScreen viewModel={viewModel} />);
  return { viewModel, analytics, navigator };
}

describe('UploadSuccessScreen', () => {
  it('TC-UPL-084 주제 문장을 보인다(받침 있으면 을)', async () => {
    await renderSuccess('PENDING', '하늘');
    expect(screen.getByTestId('upload-success.root')).toBeOnTheScreen();
    expect(screen.getByTestId('upload-success.message')).toHaveTextContent('‘하늘’을 기록했어요.');
  });

  it('TC-UPL-085 PENDING 상태 문구', async () => {
    await renderSuccess('PENDING');
    expect(screen.getByTestId('upload-success.status-message')).toHaveTextContent(
      t('upload.success.pending'),
    );
  });

  it('TC-UPL-085 VALIDATING 상태 문구', async () => {
    await renderSuccess('VALIDATING');
    expect(screen.getByTestId('upload-success.status-message')).toHaveTextContent(
      t('upload.success.validating'),
    );
  });

  // [가정: 화면이 마운트되면 viewModel.start()를 부른다(start는 한 번만 보낸다)]
  it('TC-UPL-088 화면이 보이면 screen_view photo_upload_success를 한 번 보낸다', async () => {
    const { analytics } = await renderSuccess('PENDING');
    expect(analytics.screenNames).toEqual(['photo_upload_success']);
  });

  it('TC-UPL-086 "확인했어요."를 누르면 전시로 이동한다', async () => {
    const { navigator } = await renderSuccess('PENDING');
    expect(screen.getByTestId('upload-success.confirm-button')).toHaveTextContent(
      t('upload.success.confirm'),
    );
    await fireEvent.press(screen.getByTestId('upload-success.confirm-button'));
    expect(navigator.calls).toEqual([{ type: 'open-display', topicDate: '2026-10-27' }]);
  });
});
