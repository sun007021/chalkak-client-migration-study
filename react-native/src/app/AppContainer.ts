import { type AppConfig, readAppConfig } from '../core/config/AppConfig';
import { type Clock, SystemClock } from '../core/time/Clock';

/** 의존성 조립 지점. 테스트에서는 fake를 넣어 직접 생성한다. */
export class AppContainer {
  constructor(
    readonly config: AppConfig,
    readonly clock: Clock,
  ) {}

  static create(): AppContainer {
    return new AppContainer(readAppConfig(), new SystemClock());
  }
}
