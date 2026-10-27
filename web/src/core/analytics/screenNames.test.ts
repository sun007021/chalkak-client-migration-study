import { ANALYTICS_SCREEN_NAMES, ANALYTICS_TAB_DESTINATIONS } from '../../constants';

describe('분석 허용 목록', () => {
  it('TC-ANL-002 TC-ANL-010 screen_name은 19종이고 철자까지 D-22와 같다', () => {
    expect([...ANALYTICS_SCREEN_NAMES]).toEqual([
      'login',
      'terms',
      'terms_of_service',
      'privacy_policy',
      'onboarding_signature',
      'onboarding_signature_preview',
      'change_signature',
      'change_signature_preview',
      'home',
      'issue',
      'notifications',
      'notification_detail',
      'display',
      'feed',
      'record',
      'settings',
      'feedback',
      'photo_upload',
      'photo_upload_success',
    ]);
    expect(new Set(ANALYTICS_SCREEN_NAMES).size).toBe(19);
  });

  it('TC-ANL-013 TC-ANL-015 탭 destination은 home, display, record, settings 4종뿐이다', () => {
    expect([...ANALYTICS_TAB_DESTINATIONS]).toEqual(['home', 'display', 'record', 'settings']);
  });
});
