import { Linking } from 'react-native';

import type { StoreOpener } from './UpdateChecker';

/** 스토어 URL(iOS `itms-apps://`, Android `market://`)을 연다. URL이 없거나 열 수 없으면 reject. */
export class LinkingStoreOpener implements StoreOpener {
  constructor(private readonly url: string | null) {}

  async open(): Promise<void> {
    if (!this.url) throw new Error('store url is not configured');
    await Linking.openURL(this.url);
  }
}
