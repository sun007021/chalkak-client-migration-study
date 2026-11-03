import {
  FirebaseMessagingTokenProvider,
  type FirebaseMessagingModule,
} from './FirebaseMessagingTokenProvider';

function fakeModule(overrides: Partial<FirebaseMessagingModule> = {}) {
  const refreshListeners = new Set<(token: string) => void>();
  const module: FirebaseMessagingModule = {
    getMessaging: jest.fn(() => ({ id: 'messaging' })),
    getToken: jest.fn(async () => 'fcm-ios-1'),
    onTokenRefresh: jest.fn((_m: unknown, listener: (token: string) => void) => {
      refreshListeners.add(listener);
      return () => refreshListeners.delete(listener);
    }),
    ...overrides,
  };
  return {
    module,
    refresh: (t: string) => [...refreshListeners].forEach((l) => l(t)),
    refreshListeners,
  };
}

describe('FirebaseMessagingTokenProvider (iOS FCM 토큰)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('생성만으로는 네이티브 모듈을 불러오지 않는다(지연 로드)', () => {
    const load = jest.fn();
    new FirebaseMessagingTokenProvider(load);
    expect(load).not.toHaveBeenCalled();
  });

  it('FCM 토큰 문자열을 돌려준다', async () => {
    const f = fakeModule();
    const provider = new FirebaseMessagingTokenProvider(() => f.module);
    await expect(provider.getToken()).resolves.toBe('fcm-ios-1');
    expect(f.module.getToken).toHaveBeenCalledTimes(1);
  });

  it('getToken이 던지면 null이고 토큰 원문·오류 메시지를 로그에 내지 않는다(REQ-PUSH-018)', async () => {
    const f = fakeModule({
      getToken: jest.fn(async () => {
        throw new Error('secret-apns-detail');
      }),
    });
    const provider = new FirebaseMessagingTokenProvider(() => f.module);
    await expect(provider.getToken()).resolves.toBeNull();
    expect(JSON.stringify((console.warn as jest.Mock).mock.calls)).not.toContain('secret-apns');
  });

  it('빈 토큰은 null이다(등록 건너뜀)', async () => {
    const f = fakeModule({ getToken: jest.fn(async () => '') });
    await expect(new FirebaseMessagingTokenProvider(() => f.module).getToken()).resolves.toBeNull();
  });

  it('네이티브 모듈을 불러오지 못해도(Firebase 미포함 빌드) 던지지 않고 null이다', async () => {
    const provider = new FirebaseMessagingTokenProvider(() => {
      throw new Error('Cannot find module');
    });
    await expect(provider.getToken()).resolves.toBeNull();
  });

  it('토큰 갱신(onTokenRefresh)을 새 토큰으로 전달하고 해제하면 끊는다', () => {
    const f = fakeModule();
    const provider = new FirebaseMessagingTokenProvider(() => f.module);
    const listener = jest.fn();
    const unsubscribe = provider.subscribe(listener);
    f.refresh('fcm-ios-2');
    expect(listener).toHaveBeenCalledWith('fcm-ios-2');
    f.refresh('');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(f.refreshListeners.size).toBe(0);
  });

  it('구독 중 모듈 로드가 실패하면 아무 일 없이 빈 해제 함수를 돌려준다', () => {
    const provider = new FirebaseMessagingTokenProvider(() => {
      throw new Error('x');
    });
    expect(() => provider.subscribe(jest.fn())()).not.toThrow();
  });
});
