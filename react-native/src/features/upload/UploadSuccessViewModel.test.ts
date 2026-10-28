import { FakeAnalyticsTracker } from '../../core/analytics/__testing__/FakeAnalyticsTracker';
import { KstDate } from '../../core/time/KstDate';
import type { TodayModerationStatus } from '../../data/post/PostModels';
import { t } from '../../shared/copy';
import { FakeUploadNavigator } from './__testing__/FakeUploadNavigator';
import { UploadSuccessViewModel } from './UploadSuccessViewModel';

function setup(topicTitle = '가을 하늘', moderationStatus: TodayModerationStatus = 'PENDING') {
  const analytics = new FakeAnalyticsTracker();
  const navigator = new FakeUploadNavigator();
  const topicDate = KstDate.of(2026, 10, 27);
  const viewModel = new UploadSuccessViewModel({
    params: { topicTitle, topicDate, moderationStatus },
    analytics,
    navigator,
  });
  return { viewModel, analytics, navigator };
}

describe('UploadSuccessViewModel', () => {
  it.each([
    ['하늘', '‘하늘’을 기록했어요.'],
    ['바다', '‘바다’를 기록했어요.'],
    ['꽃', '‘꽃’을 기록했어요.'],
    ['나무', '‘나무’를 기록했어요.'],
  ])('TC-UPL-084 주제 %s -> %s', (topic, expected) => {
    expect(setup(topic).viewModel.getSnapshot().message).toBe(expected);
  });

  it('TC-UPL-085 PENDING이면 검수 대기 문구다', () => {
    const { viewModel } = setup('가을 하늘', 'PENDING');
    expect(viewModel.getSnapshot().statusMessage).toBe(t('upload.success.pending'));
    expect(viewModel.getSnapshot().statusMessage).toBe(
      '검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!',
    );
  });

  it('TC-UPL-085 VALIDATING이면 확인 중 문구다', () => {
    const { viewModel } = setup('가을 하늘', 'VALIDATING');
    expect(viewModel.getSnapshot().statusMessage).toBe(t('upload.success.validating'));
  });

  it('TC-UPL-085 [가정] APPROVED 등 그 밖의 상태는 확인 중 문구로 본다(PENDING만 검수 대기)', () => {
    const { viewModel } = setup('가을 하늘', 'APPROVED');
    expect(viewModel.getSnapshot().statusMessage).toBe(t('upload.success.validating'));
  });

  it('TC-UPL-088 start는 screen_view photo_upload_success를 한 번만 보낸다', () => {
    const { viewModel, analytics } = setup();
    viewModel.start();
    viewModel.start();
    expect(analytics.screenNames).toEqual(['photo_upload_success']);
  });

  it('TC-UPL-086·087 확인하면 업로드한 topicDate의 전시로 이동한다', () => {
    const { viewModel, navigator } = setup();
    viewModel.confirm();
    expect(navigator.calls).toEqual([{ type: 'open-display', topicDate: '2026-10-27' }]);
  });
});
