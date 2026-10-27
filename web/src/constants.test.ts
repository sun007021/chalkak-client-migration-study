import * as c from './constants';

describe('00-overview §6 공통 상수', () => {
  it('값이 명세와 같다', () => {
    expect(c.SERVICE_TIME_ZONE).toBe('Asia/Seoul');
    expect(c.FIRST_TOPIC_DATE).toBe('2026-09-17');
    expect(c.POST_TITLE_MAX).toBe(10);
    expect(c.FEEDBACK_MAX).toBe(1000);
    expect(c.FEEDBACK_MIN).toBe(1);
    expect(c.POST_IMAGE_CONTENT_TYPE).toBe('image/webp');
    expect(c.POST_IMAGE_MAX_BYTES).toBe(5_242_880);
    expect(c.POST_IMAGE_MAX_LONG_EDGE).toBe(4096);
    expect([...c.WEBP_QUALITY_LADDER]).toEqual([90, 80, 60, 40]);
    expect(c.WEBP_DOWNSCALE_FACTOR).toBe(0.85);
    expect(c.WEBP_DOWNSCALE_MAX_TRIES).toBe(3);
    expect(c.UPLOAD_URL_SAFETY_MARGIN_MS).toBe(5_000);
    expect(c.SIGNATURE_PNG).toEqual({ width: 1024, height: 512, padding: 48, strokeWidth: 14 });
    expect(c.SIGNATURE_MAX_BYTES).toBe(1_048_576);
    expect(c.SIGNUP_PENDING_RETRY).toEqual({ intervalMs: 1_000, maxTries: 10 });
    expect(c.AI_REVIEW_POLL_INTERVAL_MS).toBe(3_000);
    expect(c.AI_REVIEW_POLL_WINDOW_MS).toBe(300_000);
    expect(c.PAGE_SIZE).toBe(20);
    expect(c.BANNER_PAGE_SIZE).toBe(10);
    expect(c.TOAST_DURATION_MS).toBe(2_500);
    expect(c.SPLASH_PRELOAD_MAX_MS).toBe(700);
  });

  it('D-21 네트워크 상수', () => {
    expect(c.HTTP_CONNECT_TIMEOUT_MS).toBe(10_000);
    expect(c.HTTP_RESPONSE_TIMEOUT_MS).toBe(15_000);
    expect(c.PRESIGNED_PUT_TIMEOUT_MS).toBe(60_000);
    expect([...c.RETRY_BACKOFF_MS]).toEqual([500, 1_000]);
    expect(c.RETRY_AFTER_MAX_SECONDS).toBe(30);
  });
});
