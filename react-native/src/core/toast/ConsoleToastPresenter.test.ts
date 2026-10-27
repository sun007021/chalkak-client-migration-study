import { ConsoleToastPresenter } from './ConsoleToastPresenter';

describe('ConsoleToastPresenter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('개발 빌드에서는 로그를 남기고 배포 빌드(__DEV__ false)에서는 남기지 않는다', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const flag = globalThis as unknown as { __DEV__: boolean };
    const original = flag.__DEV__;
    try {
      flag.__DEV__ = true;
      new ConsoleToastPresenter().show('hi');
      expect(log).toHaveBeenCalledTimes(1);
      flag.__DEV__ = false;
      new ConsoleToastPresenter().show('hi');
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      flag.__DEV__ = original;
    }
  });
});
