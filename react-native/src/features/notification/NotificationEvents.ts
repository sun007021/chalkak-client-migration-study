/** read: 읽음 처리 성공. gone: 알림이 없어졌다(404 등) -> 열려 있는 알림함이 조용히 새로고침한다. */
export type NotificationEvent =
  { type: 'read'; notificationId: string } | { type: 'gone'; notificationId: string };

/** 알림 읽음·소멸을 알리는 작은 이벤트 버스. 푸시 탭과 알림함 탭이 같은 결과를 알림함 화면에 전한다. */
export class NotificationEvents {
  private readonly listeners = new Set<(event: NotificationEvent) => void>();

  subscribe(listener: (event: NotificationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: NotificationEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[NotificationEvents] listener error', error);
      }
    }
  }
}
