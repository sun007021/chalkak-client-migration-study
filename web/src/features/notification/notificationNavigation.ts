/** 알림함이 화면을 여는 통로. 홈의 HomeNavigator와 같은 모양이다. */
export interface NotificationNavigator {
  /** 게시물 상세를 push한다. openAiReview면 state { openAiReview: true }(그렇지 않으면 그 키가 없다). */
  openPost(target: { postId: string; openAiReview: boolean }): void;
  /** 알림 상세를 push한다. 상세 아래에 알림함이 있다는 표시(INBOX_BELOW_STATE)를 state로 넣는다. */
  openDetail(notificationId: string): void;
  /** 홈(`/home`)으로 이동한다(TOPIC·REMINDER 행). 홈을 push한다(뒤로 가면 알림함). */
  openHome(): void;
}

export type NavigateFn = (to: string, options?: { state?: unknown; replace?: boolean }) => void | Promise<void>;

/** 오래 사는 ViewModel이 들고 있는 NotificationNavigator. 화면이 붙어 있는 동안만 실제 구현을 꽂고, 붙어 있지 않을 때의 요청은 버린다. */
export class AttachableNotificationNavigator implements NotificationNavigator {
  /** 붙인다. 돌려준 함수로 뗀다(그 사이 다른 구현이 붙었으면 건드리지 않는다). */
  attach(_target: NotificationNavigator): () => void {
    throw new Error('not implemented');
  }

  openPost(_target: { postId: string; openAiReview: boolean }): void {
    throw new Error('not implemented');
  }

  openDetail(_notificationId: string): void {
    throw new Error('not implemented');
  }

  openHome(): void {
    throw new Error('not implemented');
  }
}

/** react-router navigate로 `/feed/{postId}`(feedPath), `/notifications/{id}`(notificationDetailPath), `/home`을 push한다. */
export class RouterNotificationNavigator implements NotificationNavigator {
  constructor(protected readonly navigate: NavigateFn) {}

  openPost(_target: { postId: string; openAiReview: boolean }): void {
    throw new Error('not implemented');
  }

  openDetail(_notificationId: string): void {
    throw new Error('not implemented');
  }

  openHome(): void {
    throw new Error('not implemented');
  }
}

/** 알림함에서 알림 상세를 push할 때 넣는 location state: "알림함이 바로 아래에 쌓여 있다"는 뜻(SETTINGS_BELOW_STATE와 같은 방식). */
export const INBOX_BELOW_STATE = { inboxBelow: true } as const;

export type BackToInboxPlan = { kind: 'back' } | { kind: 'replace'; to: string };

/**
 * 반려 상세의 "알림함으로"(REQ-NOTI-026). 앱 안에서 알림함을 거쳐 push한 항목(location.key !== 'default'이고 state.inboxBelow === true)이면 뒤로(상세만 닫는다),
 * 그 밖(새로고침·딥링크로 첫 항목이 됨, state 없음·위조)에는 알림함 경로로 replace한다.
 */
export function planBackToInbox(_location: { key: string; state: unknown }): BackToInboxPlan {
  throw new Error('not implemented');
}

/** 알림함 닫기(뒤로 버튼). 앱 안에서 push한 항목이면 뒤로, 새로고침·딥링크로 첫 항목이 되었으면 홈으로 replace한다. */
export function planInboxClose(_location: { key: string }): BackToInboxPlan {
  throw new Error('not implemented');
}
