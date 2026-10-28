import type { SecureKeyValueStorage } from './SecureKeyValueStorage';
import type {
  RefreshedTokens,
  SessionCredentials,
  SessionState,
  SessionStore,
} from './SessionStore';

/** 세션 전체(6종)를 이 한 키의 JSON 하나로 저장한다. 한 번의 쓰기라 원자적이다. */
export const SESSION_STORAGE_KEY = 'chalkak.session';

/** expo-secure-store가 경고하는 값 크기(바이트). 넘어도 저장은 시도하고 경고만 낸다. */
export const SECURE_VALUE_WARN_BYTES = 2048;

const FORMAT_VERSION = 1;

type Stored =
  | { v: 1; kind: 'guest' }
  | {
      v: 1;
      kind: 'authenticated';
      userId: string;
      accessToken: string;
      accessTokenExpiresAt: string;
      refreshToken: string;
      refreshTokenExpiresAt: string;
    };

const NONE: SessionState = { kind: 'none' };

function encode(state: SessionState): string {
  if (state.kind === 'guest') return JSON.stringify({ v: FORMAT_VERSION, kind: 'guest' });
  if (state.kind === 'none') throw new Error('none은 저장하지 않고 삭제한다');
  const c = state.credentials;
  const stored: Stored = {
    v: FORMAT_VERSION,
    kind: 'authenticated',
    userId: c.userId,
    accessToken: c.accessToken,
    accessTokenExpiresAt: c.accessTokenExpiresAt.toISOString(),
    refreshToken: c.refreshToken,
    refreshTokenExpiresAt: c.refreshTokenExpiresAt.toISOString(),
  };
  return JSON.stringify(stored);
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

function decode(text: string): SessionState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NONE;
  }
  if (parsed === null || typeof parsed !== 'object') return NONE;
  const o = parsed as Record<string, unknown>;
  if (o.v !== FORMAT_VERSION) return NONE;
  if (o.kind === 'guest') return { kind: 'guest' };
  if (o.kind !== 'authenticated') return NONE;
  if (
    !isNonEmptyString(o.userId) ||
    !isNonEmptyString(o.accessToken) ||
    !isNonEmptyString(o.refreshToken) ||
    !isNonEmptyString(o.accessTokenExpiresAt) ||
    !isNonEmptyString(o.refreshTokenExpiresAt)
  ) {
    return NONE;
  }
  const accessTokenExpiresAt = new Date(o.accessTokenExpiresAt);
  const refreshTokenExpiresAt = new Date(o.refreshTokenExpiresAt);
  if (Number.isNaN(accessTokenExpiresAt.getTime())) return NONE;
  if (Number.isNaN(refreshTokenExpiresAt.getTime())) return NONE;
  return {
    kind: 'authenticated',
    credentials: {
      userId: o.userId,
      accessToken: o.accessToken,
      accessTokenExpiresAt,
      refreshToken: o.refreshToken,
      refreshTokenExpiresAt,
    },
  };
}

/**
 * 모든 연산을 한 줄로 직렬화한다(read-modify-write 경합 방지, TC-NET-029).
 * 읽기 예외·손상 값은 "세션 없음"으로 보고 항목을 지운다(앱 시작이 죽지 않게).
 */
export class SecureSessionStore implements SessionStore {
  private queue: Promise<unknown> = Promise.resolve();
  private currentGeneration = 0;
  /** 마지막으로 확인한 인증 userId(없거나 게스트면 null). undefined는 아직 모름. */
  private lastUserId: string | null | undefined = undefined;

  constructor(
    private readonly storage: SecureKeyValueStorage,
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  generation(): number {
    return this.currentGeneration;
  }

  load(): Promise<SessionState> {
    return this.serialize(async () => (await this.read()).state);
  }

  loadChecked(): Promise<{ state: SessionState; discarded: boolean }> {
    return this.serialize(() => this.read());
  }

  saveAuthenticated(credentials: SessionCredentials): Promise<void> {
    return this.serialize(() => this.write({ kind: 'authenticated', credentials }));
  }

  enterGuest(): Promise<void> {
    return this.serialize(() => this.write({ kind: 'guest' }));
  }

  replaceTokensIfCurrent(expected: string, tokens: RefreshedTokens): Promise<boolean> {
    return this.serialize(async () => {
      const { state } = await this.read();
      if (state.kind !== 'authenticated' || state.credentials.refreshToken !== expected) {
        return false;
      }
      await this.write({
        kind: 'authenticated',
        credentials: { ...tokens, userId: state.credentials.userId },
      });
      return true;
    });
  }

  clear(): Promise<void> {
    return this.serialize(async () => {
      await this.storage.deleteItem(SESSION_STORAGE_KEY);
      this.track(null);
    });
  }

  clearIfCurrent(expected: string): Promise<boolean> {
    return this.serialize(async () => {
      const { state } = await this.read();
      if (state.kind !== 'authenticated' || state.credentials.refreshToken !== expected) {
        return false;
      }
      await this.storage.deleteItem(SESSION_STORAGE_KEY);
      this.track(null);
      return true;
    });
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<{ state: SessionState; discarded: boolean }> {
    let text: string | null;
    try {
      text = await this.storage.getItem(SESSION_STORAGE_KEY);
    } catch {
      await this.discard();
      this.track(null);
      return { state: NONE, discarded: true };
    }
    if (text === null) {
      this.track(null);
      return { state: NONE, discarded: false };
    }
    const state = decode(text);
    if (state.kind !== 'none') {
      this.track(state.kind === 'authenticated' ? state.credentials.userId : null);
      return { state, discarded: false };
    }
    await this.discard();
    this.track(null);
    return { state: NONE, discarded: true };
  }

  private async discard(): Promise<void> {
    try {
      await this.storage.deleteItem(SESSION_STORAGE_KEY);
    } catch {
      // 지우기도 실패하면 다음 읽기에서 다시 같은 경로를 탄다. 앱은 계속 동작한다.
    }
  }

  private async write(state: SessionState): Promise<void> {
    const text = encode(state);
    if (text.length > SECURE_VALUE_WARN_BYTES) {
      this.warn(`session value is ${text.length} bytes (> ${SECURE_VALUE_WARN_BYTES})`);
    }
    await this.storage.setItem(SESSION_STORAGE_KEY, text);
    this.track(state.kind === 'authenticated' ? state.credentials.userId : null);
  }

  /** 계정(userId)이 바뀔 때만 세대를 올린다. 같은 계정의 토큰 교체는 올리지 않는다. */
  private track(userId: string | null): void {
    if (this.lastUserId === userId) return;
    this.lastUserId = userId;
    this.currentGeneration += 1;
  }
}
