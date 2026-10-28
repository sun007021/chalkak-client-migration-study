/// 푸시 수신 설정 항목 하나. [wireKey]는 `/notification-settings`의 JSON 필드 이름이다.
enum PushSetting {
  topic('topicPushEnabled'),
  moderation('moderationPushEnabled'),
  aiReview('aiReviewPushEnabled');

  const PushSetting(this.wireKey);

  final String wireKey;
}

/// 서버의 푸시 수신 설정 세 값(NOTIFICATION-006). 항목은 서로 독립이다.
class NotificationSettings {
  const NotificationSettings({
    required this.topic,
    required this.moderation,
    required this.aiReview,
  });

  final bool topic;
  final bool moderation;
  final bool aiReview;

  bool valueOf(PushSetting setting) => switch (setting) {
    PushSetting.topic => topic,
    PushSetting.moderation => moderation,
    PushSetting.aiReview => aiReview,
  };

  /// [setting] 하나만 [value]로 바꾼 사본.
  NotificationSettings withValue(PushSetting setting, bool value) =>
      NotificationSettings(
        topic: setting == PushSetting.topic ? value : topic,
        moderation: setting == PushSetting.moderation ? value : moderation,
        aiReview: setting == PushSetting.aiReview ? value : aiReview,
      );

  @override
  bool operator ==(Object other) =>
      other is NotificationSettings &&
      other.topic == topic &&
      other.moderation == moderation &&
      other.aiReview == aiReview;

  @override
  int get hashCode => Object.hash(topic, moderation, aiReview);

  @override
  String toString() =>
      'NotificationSettings(topic: $topic, moderation: $moderation, aiReview: $aiReview)';
}
