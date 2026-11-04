import { Linking } from 'react-native';

import type { StoreOpener } from './UpdateChecker';

/**
 * 스토어 앱 상세 URL을 앞에서부터 하나씩 시도해 처음 열리는 것을 연다(Android: `market://` -> Play 웹 URL).
 * URL이 없거나 모두 열리지 않으면 reject(마지막 오류).
 */
export class LinkingStoreOpener implements StoreOpener {
  constructor(private readonly urls: readonly string[]) {}

  async open(): Promise<void> {
    if (this.urls.length === 0) throw new Error('store url is not configured');
    let lastError: unknown;
    for (const url of this.urls) {
      try {
        await Linking.openURL(url);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
