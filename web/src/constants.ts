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
export const WEBP_DOWNSCALE_MAX_TRIES = 3;
export const UPLOAD_URL_SAFETY_MARGIN_MS = 5_000;
export const SIGNATURE_PNG = { width: 1024, height: 512, padding: 48, strokeWidth: 14 } as const;
export const SIGNATURE_MAX_BYTES = 1_048_576;
export const SIGNUP_PENDING_RETRY = { intervalMs: 1_000, maxTries: 10 } as const;
export const AI_REVIEW_POLL_INTERVAL_MS = 3_000;
export const AI_REVIEW_POLL_WINDOW_MS = 300_000;
export const PAGE_SIZE = 20;
export const BANNER_PAGE_SIZE = 10;
export const TOAST_DURATION_MS = 2_500;
export const SPLASH_PRELOAD_MAX_MS = 700;

// D-21 네트워크. fetch는 연결/응답 타임아웃을 나누지 못하므로 응답(헤더 도착)까지 15초 하나로 적용한다.
export const HTTP_CONNECT_TIMEOUT_MS = 10_000;
export const HTTP_RESPONSE_TIMEOUT_MS = 15_000;
export const PRESIGNED_PUT_TIMEOUT_MS = 60_000;
export const RETRY_BACKOFF_MS = [500, 1_000] as const; // 최대 2회 재시도
export const RETRY_AFTER_MAX_SECONDS = 30; // 확인 필요 2: 넘으면 기다리지 않고 실패

// D-22 분석
export const SCREEN_NAMES = [
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
export type ScreenName = (typeof SCREEN_NAMES)[number];

export const TAB_DESTINATIONS = ['home', 'display', 'record', 'settings'] as const;
export type TabDestination = (typeof TAB_DESTINATIONS)[number];
