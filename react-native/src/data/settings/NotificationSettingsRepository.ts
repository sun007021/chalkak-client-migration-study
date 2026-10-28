import type { ApiClient } from '../../core/http/ApiClient';
import { asObject, bool } from '../decode';

/** 푸시 수신 설정 항목. 서버 필드는 `<key>PushEnabled`다. */
export type PushSettingKey = 'topic' | 'moderation' | 'aiReview';
export type NotificationSettings = Readonly<Record<PushSettingKey, boolean>>;

export const PUSH_SETTING_KEYS: readonly PushSettingKey[] = ['topic', 'moderation', 'aiReview'];

const FIELDS: Record<PushSettingKey, string> = {
  topic: 'topicPushEnabled',
  moderation: 'moderationPushEnabled',
  aiReview: 'aiReviewPushEnabled',
};

export type NotificationSettingsRepositoryDeps = { api: ApiClient };

/** 푸시 수신 설정 API(NOTIFICATION-006). 실패는 ApiError 하위 클래스를 그대로 던진다. */
export class NotificationSettingsRepository {
  constructor(private readonly deps: NotificationSettingsRepositoryDeps) {}

  /** GET /notification-settings. 세 필드 중 하나라도 없거나 boolean이 아니면 InvalidResponseError. */
  get(signal?: AbortSignal): Promise<NotificationSettings> {
    return this.deps.api.requestJson(
      { method: 'GET', path: '/notification-settings', signal },
      (raw) => {
        const o = asObject(raw, 'notification settings');
        return {
          topic: bool(o, FIELDS.topic),
          moderation: bool(o, FIELDS.moderation),
          aiReview: bool(o, FIELDS.aiReview),
        };
      },
    );
  }

  /** PATCH /notification-settings. 바꾼 항목 하나만 보낸다(빈 요청은 서버가 400이라 보내지 않고 던진다). 204. */
  async update(key: PushSettingKey, enabled: boolean, signal?: AbortSignal): Promise<void> {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    await this.deps.api.requestVoid({
      method: 'PATCH',
      path: '/notification-settings',
      body: { [FIELDS[key]]: enabled },
      signal,
    });
  }
}
