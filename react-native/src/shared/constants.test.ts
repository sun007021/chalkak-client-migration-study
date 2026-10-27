import * as c from './constants';

// docs/spec/00-overview.md §6 표와 값이 같은지 확인한다. shared/constants.json 대조는 별도 PR.
describe('constants', () => {
  it('서비스 시간대와 최초 전시일', () => {
    expect(c.SERVICE_TIME_ZONE).toBe('Asia/Seoul');
    expect(c.FIRST_TOPIC_DATE).toBe('2026-09-17');
  });

  it('텍스트 길이 제한', () => {
    expect(c.POST_TITLE_MAX).toBe(10);
    expect(c.FEEDBACK_MAX).toBe(1000);
    expect(c.FEEDBACK_MIN).toBe(1);
  });

  it('게시물 이미지 정책', () => {
    expect(c.POST_IMAGE_CONTENT_TYPE).toBe('image/webp');
    expect(c.POST_IMAGE_MAX_BYTES).toBe(5_242_880);
    expect(c.POST_IMAGE_MAX_LONG_EDGE).toBe(4096);
    expect([...c.WEBP_QUALITY_LADDER]).toEqual([90, 80, 60, 40]);
    expect(c.WEBP_DOWNSCALE_FACTOR).toBe(0.85);
    expect(c.WEBP_DOWNSCALE_MAX_ATTEMPTS).toBe(3);
    expect(c.UPLOAD_URL_SAFETY_MARGIN_MS).toBe(5_000);
  });

  it('사인 PNG', () => {
    expect(c.SIGNATURE_PNG_SIZE).toEqual({
      width: 1024,
      height: 512,
      padding: 48,
      strokeWidth: 14,
    });
    expect(c.SIGNATURE_MAX_BYTES).toBe(1_048_576);
  });

  it('재시도·폴링 시간', () => {
    expect(c.SIGNUP_PENDING_RETRY).toEqual({ intervalMs: 1_000, maxAttempts: 10 });
    expect(c.AI_REVIEW_POLL_INTERVAL_MS).toBe(3_000);
    expect(c.AI_REVIEW_POLL_WINDOW_MS).toBe(300_000);
  });

  it('페이지 크기와 UI 시간', () => {
    expect(c.PAGE_SIZE).toBe(20);
    expect(c.BANNER_PAGE_SIZE).toBe(10);
    expect(c.TOAST_DURATION_MS).toBe(2_500);
    expect(c.SPLASH_PRELOAD_MAX_MS).toBe(700);
  });
});
