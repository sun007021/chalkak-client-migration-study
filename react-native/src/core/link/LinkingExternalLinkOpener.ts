import { Linking } from 'react-native';

import type { ExternalLinkOpener } from './ExternalLinkOpener';

/** OS 기본 앱(브라우저)으로 URL을 연다. 열 수 없거나 예외가 나면 false. */
export class LinkingExternalLinkOpener implements ExternalLinkOpener {
  async open(url: string): Promise<boolean> {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }
}
