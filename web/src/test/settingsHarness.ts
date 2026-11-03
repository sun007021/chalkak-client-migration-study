import { screen } from '@testing-library/react';
import type { PushSettingKey } from '../features/settings/NotificationSettingsRepository';
import type { FakeFetch, Responder } from './fakeFetch';
import { loadFixture } from './fixtures';
import { fx, CARD_GET } from './signatureRoutes';

export const SETTINGS_GET = 'GET /notification-settings';
export const SETTINGS_PATCH = 'PATCH /notification-settings';
export const FEEDBACK_POST = 'POST /feedbacks';
export { CARD_GET, fx };
/** 픽스처 응답을 바로 만든다(지연 응답을 직접 풀 때). */
export const resp = (path: string): Response => loadFixture(path).toResponse();

/** 설정 탭이 부르는 읽기·쓰기 경로를 등록한다. FakeFetch는 먼저 등록한 경로가 우선이므로 단계별 응답은 여기서 준다. */
export function routeSettings(ff: FakeFetch, o: { signature?: Responder[]; get?: Responder[]; patch?: Responder[] } = {}): void {
  ff.route(CARD_GET, ...(o.signature ?? [fx('signature/users-me-signature__get-success.json')]));
  ff.route(SETTINGS_GET, ...(o.get ?? [fx('settings/notification-settings__get-all-true.json')]));
  ff.route(SETTINGS_PATCH, ...(o.patch ?? [fx('settings/notification-settings__patch-no-content.json')]));
}

export function routeFeedback(ff: FakeFetch, ...responders: Responder[]): void {
  ff.route(FEEDBACK_POST, ...(responders.length > 0 ? responders : [fx('feedback/feedbacks__created.json')]));
}

/** PATCH 요청 바디(JSON)를 순서대로. */
export const patchBodies = (ff: FakeFetch): unknown[] => ff.callsTo(SETTINGS_PATCH).map((c) => JSON.parse(c.body as string) as unknown);
export const feedbackBodies = (ff: FakeFetch): unknown[] => ff.callsTo(FEEDBACK_POST).map((c) => JSON.parse(c.body as string) as unknown);

// check-testids가 리터럴을 찾으므로 맵으로 둔다.
export const PUSH_TOGGLE_IDS: Readonly<Record<PushSettingKey, string>> = {
  topicPushEnabled: 'settings.push-topic-toggle',
  moderationPushEnabled: 'settings.push-moderation-toggle',
  aiReviewPushEnabled: 'settings.push-ai-toggle',
};
export const pushToggle = (key: PushSettingKey): HTMLElement => screen.getByTestId(PUSH_TOGGLE_IDS[key]);
/** 스위치 켜짐 여부. role="switch"의 aria-checked 또는 checkbox의 checked. */
export function isOn(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}
export function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement | HTMLInputElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
}

/** 토스트 문구(없으면 null). */
export const toastText = (): string | null => screen.queryByTestId('toast.message')?.textContent ?? null;

/** 1000자 경계 입력용. */
export const COMBINED_EMOJI = '👨‍👩‍👧'; // 5 code points (3 emoji + 2 ZWJ)

/** shared/fixtures의 사인 URL(썸네일 있는 응답, 썸네일 null 응답의 원본). */
export const SIGNATURE_URL = {
  thumbnail: (loadFixture('signature/users-me-signature__get-success.json').json as Record<string, string>).signatureThumbnailImageUrl!,
  original: (loadFixture('signature/users-me-signature__get-thumbnail-null.json').json as Record<string, string>).signatureOriginalImageUrl!,
};
