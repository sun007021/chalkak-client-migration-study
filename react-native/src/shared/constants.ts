// 다섯 클라이언트 공통 상수. 값의 원본은 `shared/constants.json`이고 여기서는 가져와 타입만 붙인다(값 중복 없음).
// 시간 값은 이름 끝에 단위(_MS)를 붙인다. JSON import 설정은 README의 "shared 연결" 참고.
import json from '../../../shared/constants.json';

/**
 * 서비스 시간대 이름(문서·로그·다른 클라이언트와의 대조용). 한국은 서머타임이 없어
 * 실제 계산은 이 이름으로 시간대 DB를 조회하지 않고 `core/time/kst.ts`의 `KST_OFFSET_MS`(+9시간)를 쓴다.
 */
export const SERVICE_TIME_ZONE: string = json.SERVICE_TIME_ZONE;
/** 최초 전시일(yyyy-MM-dd, KST). 전시 날짜 이동·선택의 하한(D-12). */
export const FIRST_TOPIC_DATE: string = json.FIRST_TOPIC_DATE;

export const POST_TITLE_MAX: number = json.POST_TITLE_MAX;
export const FEEDBACK_MAX: number = json.FEEDBACK_MAX;
export const FEEDBACK_MIN: number = json.FEEDBACK_MIN;

export const POST_IMAGE_CONTENT_TYPE: string = json.POST_IMAGE_CONTENT_TYPE;
export const POST_IMAGE_MAX_BYTES: number = json.POST_IMAGE_MAX_BYTES;
export const POST_IMAGE_MAX_LONG_EDGE: number = json.POST_IMAGE_MAX_LONG_EDGE;
export const WEBP_QUALITY_LADDER: readonly number[] = json.WEBP_QUALITY_LADDER;
export const WEBP_DOWNSCALE_FACTOR: number = json.WEBP_DOWNSCALE_FACTOR;
export const WEBP_DOWNSCALE_MAX_ATTEMPTS: number = json.WEBP_DOWNSCALE_MAX_ATTEMPTS;
export const UPLOAD_URL_SAFETY_MARGIN_MS: number = json.UPLOAD_URL_SAFETY_MARGIN_MS;
export const UPLOAD_ID_CLAIM_TTL_MS: number = json.UPLOAD_ID_CLAIM_TTL_MS;

export const SIGNATURE_PNG_SIZE: Readonly<{
  width: number;
  height: number;
  padding: number;
  strokeWidth: number;
}> = json.SIGNATURE_PNG_SIZE;
export const SIGNATURE_CONTENT_TYPE: string = json.SIGNATURE_CONTENT_TYPE;
export const SIGNATURE_MAX_BYTES: number = json.SIGNATURE_MAX_BYTES;

export const SIGNUP_PENDING_RETRY: Readonly<{ intervalMs: number; maxAttempts: number }> = {
  intervalMs: json.SIGNUP_PENDING_RETRY_INTERVAL_MS,
  maxAttempts: json.SIGNUP_PENDING_RETRY_MAX,
};
export const AI_REVIEW_POLL_INTERVAL_MS: number = json.AI_REVIEW_POLL_INTERVAL_MS;
export const AI_REVIEW_POLL_WINDOW_MS: number = json.AI_REVIEW_POLL_WINDOW_MS;

export const PAGE_SIZE: number = json.PAGE_SIZE;
export const BANNER_PAGE_SIZE: number = json.BANNER_PAGE_SIZE;

export const TOAST_DURATION_MS: number = json.TOAST_DURATION_MS;
export const SPLASH_PRELOAD_MAX_MS: number = json.SPLASH_PRELOAD_MAX_MS;

export const HTTP_CONNECT_TIMEOUT_MS: number = json.HTTP_CONNECT_TIMEOUT_MS;
export const HTTP_RESPONSE_TIMEOUT_MS: number = json.HTTP_RESPONSE_TIMEOUT_MS;
export const UPLOAD_PUT_TIMEOUT_MS: number = json.UPLOAD_PUT_TIMEOUT_MS;
export const RETRY_BACKOFF_MS: readonly number[] = json.RETRY_BACKOFF_MS;
export const RETRY_MAX: number = json.RETRY_MAX;
/** Retry-After가 이보다 길면 기다리지 않고 실패로 돌려준다(자르지 않음, D-21). */
export const RETRY_AFTER_MAX_MS: number = json.RETRY_AFTER_MAX_MS;
export const VERSION_LOOKUP_TIMEOUT_MS: number = json.VERSION_LOOKUP_TIMEOUT_MS;

export const TERMS_ALLOWED_HOSTS: readonly string[] = json.TERMS_ALLOWED_HOSTS;
export const TERMS_URLS: Readonly<{ service: string; privacy: string }> = json.TERMS_URLS;
export const ANALYTICS_SCREEN_NAMES: readonly string[] = json.ANALYTICS_SCREEN_NAMES;
export const ANALYTICS_TAB_DESTINATIONS: readonly string[] = json.ANALYTICS_TAB_DESTINATIONS;
