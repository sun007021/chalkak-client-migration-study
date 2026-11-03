import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';

export type PushSettingKey = 'topicPushEnabled' | 'moderationPushEnabled' | 'aiReviewPushEnabled';
export type NotificationSettings = Record<PushSettingKey, boolean>;

/** 화면 순서(오늘 주제, 승인·반려, AI 피드백 완료). */
export const PUSH_SETTING_KEYS: readonly PushSettingKey[] = ['topicPushEnabled', 'moderationPushEnabled', 'aiReviewPushEnabled'];

const decodeSettings = d.object({ topicPushEnabled: d.boolean(), moderationPushEnabled: d.boolean(), aiReviewPushEnabled: d.boolean() });

/**
 * /notification-settings(API §notification, NOTIFICATION-006).
 * fetch: GET -> 세 Boolean을 모두 읽는다(누락·null이면 InvalidResponseError). update: PATCH, 바뀐 항목 하나만 보낸다(값이 하나도 없으면 요청 없이 거절), 204 본문 없음.
 */
export class NotificationSettingsRepository {
  constructor(private readonly deps: { api: ApiClient }) {}

  fetch(signal?: AbortSignal): Promise<NotificationSettings> {
    return this.deps.api.request({ method: 'GET', path: '/notification-settings', signal }, decodeSettings);
  }

  update(patch: Partial<NotificationSettings>, signal?: AbortSignal): Promise<void> {
    const body: Partial<NotificationSettings> = {};
    for (const key of PUSH_SETTING_KEYS) {
      const value = patch[key];
      if (value !== undefined) body[key] = value;
    }
    if (Object.keys(body).length === 0) return Promise.reject(new Error('empty notification settings patch'));
    return this.deps.api.requestVoid({ method: 'PATCH', path: '/notification-settings', body, signal });
  }
}
