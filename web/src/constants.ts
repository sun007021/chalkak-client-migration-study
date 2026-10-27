// 00-overview §6 다섯 클라이언트 공통 상수. 다른 곳에 값을 직접 쓰지 않는다.
export const SERVICE_TIME_ZONE = 'Asia/Seoul';
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
export const UPLOAD_ID_CLAIM_TTL_MS = 3_600_000;
export const SIGNATURE_PNG_SIZE = { width: 1024, height: 512, padding: 48, strokeWidth: 14 } as const;
export const SIGNATURE_CONTENT_TYPE = 'image/png';
export const SIGNATURE_MAX_BYTES = 1_048_576;
export const SIGNUP_PENDING_RETRY_INTERVAL_MS = 1_000;
export const SIGNUP_PENDING_RETRY_MAX = 10;
export const AI_REVIEW_POLL_INTERVAL_MS = 3_000;
export const AI_REVIEW_POLL_WINDOW_MS = 300_000;
export const PAGE_SIZE = 20;
export const BANNER_PAGE_SIZE = 10;
export const TOAST_DURATION_MS = 2_500;
export const SPLASH_PRELOAD_MAX_MS = 700;

// D-21 네트워크. fetch는 연결/응답 타임아웃을 나누지 못하므로 응답(헤더 도착 + 본문 수신)까지 15초 하나로 적용한다.
// HTTP_CONNECT_TIMEOUT_MS는 shared 값과 대조하기 위한 것일 뿐 Web 코드는 쓰지 않는다.
export const HTTP_CONNECT_TIMEOUT_MS = 10_000;
export const HTTP_RESPONSE_TIMEOUT_MS = 15_000;
export const UPLOAD_PUT_TIMEOUT_MS = 60_000;
export const RETRY_BACKOFF_MS = [500, 1_000] as const;
export const RETRY_MAX = 2;
export const VERSION_LOOKUP_TIMEOUT_MS = 3_000;
/** Web 전용(shared에 없음). Retry-After가 이보다 길면 기다리지 않고 실패(확인 필요 2). */
export const RETRY_AFTER_MAX_MS = 30_000;

export const TERMS_ALLOWED_HOSTS = ['notion.com', 'notion.so', 'notion.site'] as const;
export const TERMS_URLS = {
  service: 'https://app.notion.com/p/3c66b8e8e3678064b543c26b5c0f932d?source=copy_link',
  privacy: 'https://app.notion.com/p/3b56b8e8e36780af8ec8ea0bf92b97a9?source=copy_link',
} as const;

// D-22 분석
export const ANALYTICS_SCREEN_NAMES = [
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
] as const;
export type ScreenName = (typeof ANALYTICS_SCREEN_NAMES)[number];

export const ANALYTICS_TAB_DESTINATIONS = ['home', 'display', 'record', 'settings'] as const;
export type TabDestination = (typeof ANALYTICS_TAB_DESTINATIONS)[number];
