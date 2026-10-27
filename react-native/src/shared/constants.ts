// 다섯 클라이언트 공통 상수(docs/spec/00-overview.md §6). 플랫폼 코드에 값을 직접 쓰지 않고 여기서만 읽는다.
// 시간 값은 이름 끝에 단위(_MS)를 붙인다.

/**
 * 서비스 시간대 이름(문서·로그·다른 클라이언트와의 대조용). 한국은 서머타임이 없어
 * 실제 계산은 이 이름으로 시간대 DB를 조회하지 않고 `core/time/kst.ts`의 `KST_OFFSET_MS`(+9시간)를 쓴다.
 */
export const SERVICE_TIME_ZONE = 'Asia/Seoul';
/** 최초 전시일(yyyy-MM-dd, KST). 전시 날짜 이동·선택의 하한(D-12). */
export const FIRST_TOPIC_DATE = '2026-09-17';

export const POST_TITLE_MAX = 10;
export const FEEDBACK_MAX = 1000;
export const FEEDBACK_MIN = 1;

export const POST_IMAGE_CONTENT_TYPE = 'image/webp';
export const POST_IMAGE_MAX_BYTES = 5_242_880;
export const POST_IMAGE_MAX_LONG_EDGE = 4096;
export const WEBP_QUALITY_LADDER = [90, 80, 60, 40] as const;
export const WEBP_DOWNSCALE_FACTOR = 0.85;
export const WEBP_DOWNSCALE_MAX_ATTEMPTS = 3;
export const UPLOAD_URL_SAFETY_MARGIN_MS = 5_000;

export const SIGNATURE_PNG_SIZE = {
  width: 1024,
  height: 512,
  padding: 48,
  strokeWidth: 14,
} as const;
export const SIGNATURE_MAX_BYTES = 1_048_576;

export const SIGNUP_PENDING_RETRY = { intervalMs: 1_000, maxAttempts: 10 } as const;
export const AI_REVIEW_POLL_INTERVAL_MS = 3_000;
export const AI_REVIEW_POLL_WINDOW_MS = 300_000;

export const PAGE_SIZE = 20;
export const BANNER_PAGE_SIZE = 10;

export const TOAST_DURATION_MS = 2_500;
export const SPLASH_PRELOAD_MAX_MS = 700;
