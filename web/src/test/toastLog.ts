import type { ToastController } from '../core/ui/ToastController';

/** 토스트가 새로 뜰 때마다(같은 문구 연속 포함) 문구를 기록한다. */
export function recordToasts(controller: ToastController): { messages: string[] } {
  const messages: string[] = [];
  let lastId: string | null = null;
  controller.subscribe(() => {
    const toast = controller.state.toast;
    if (toast && toast.id !== lastId) messages.push(toast.message);
    lastId = toast?.id ?? lastId;
  });
  return { messages };
}
