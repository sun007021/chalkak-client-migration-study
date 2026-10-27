import type { AppConfig } from '../core/config/AppConfig';
import { type Clock, SystemClock } from '../core/time/Clock';

/** 컨테이너가 조립하는 의존성 전체. 새 의존성은 여기에 추가한다. */
export interface Dependencies {
  readonly config: AppConfig;
  readonly clock: Clock;
}

/** 의존성 조립 지점. 테스트에서는 fake를 `overrides`로 넣는다. 전역(Constants 등)은 읽지 않는다. */
export class AppContainer {
  readonly config: AppConfig;
  readonly clock: Clock;

  private constructor(dependencies: Dependencies) {
    this.config = dependencies.config;
    this.clock = dependencies.clock;
  }

  /** `config`는 앱 루트가 `readAppConfig()`로 읽어 넘긴다. 나머지는 기본 구현이며 `overrides`로 바꾼다. */
  static create(config: AppConfig, overrides: Partial<Dependencies> = {}): AppContainer {
    return new AppContainer({
      config: overrides.config ?? config,
      clock: overrides.clock ?? new SystemClock(),
    });
  }
}
