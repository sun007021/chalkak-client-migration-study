import type { AppInfo } from './AppInfo';

/** 설정 화면 "버전정보"에 보일 앱 버전 문자열(접두 없음). */
export interface AppVersionProvider {
  getVersion(): string;
}

/** 앱 설정(expo config)에서 읽은 AppInfo의 버전을 쓴다. 읽지 못했으면 빈 문자열. */
export class AppInfoVersionProvider implements AppVersionProvider {
  constructor(private readonly info: Pick<AppInfo, 'version'>) {}

  getVersion(): string {
    return this.info.version;
  }
}
