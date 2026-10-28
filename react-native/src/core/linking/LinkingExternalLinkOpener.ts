import { Linking } from 'react-native';

import type { ExternalLinkOpener, ExternalLinkResult } from './ExternalLinkOpener';

/**
 * RN `Linking`으로 시스템 브라우저를 연다. 열 수 있는 앱이 없으면 'no-browser', 열기 자체가 실패하면 'failed'.
 * 던지지 않는다. Android 11+에서는 `canOpenURL`이 매니페스트 `<queries>`(https)에 의존하므로 prebuild 템플릿의 기본 선언을 지우지 않는다.
 */
export class LinkingExternalLinkOpener implements ExternalLinkOpener {
  async open(url: string): Promise<ExternalLinkResult> {
    try {
      if (!(await Linking.canOpenURL(url))) return 'no-browser';
      await Linking.openURL(url);
      return 'opened';
    } catch {
      return 'failed';
    }
  }
}
