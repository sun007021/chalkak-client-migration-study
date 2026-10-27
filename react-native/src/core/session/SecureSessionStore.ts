import type { SecureKeyValueStorage } from './SecureKeyValueStorage';
import type {
  RefreshedTokens,
  SessionCredentials,
  SessionState,
  SessionStore,
} from './SessionStore';

/** 세션 전체(6종)를 이 한 키의 JSON 하나로 저장한다. 한 번의 쓰기라 원자적이다. */
export const SESSION_STORAGE_KEY = 'chalkak.session';

export class SecureSessionStore implements SessionStore {
  constructor(private readonly storage: SecureKeyValueStorage) {}

  load(): Promise<SessionState> {
    void this.storage;
    throw new Error('not implemented');
  }
  saveAuthenticated(_credentials: SessionCredentials): Promise<void> {
    throw new Error('not implemented');
  }
  enterGuest(): Promise<void> {
    throw new Error('not implemented');
  }
  replaceTokensIfCurrent(_expected: string, _tokens: RefreshedTokens): Promise<boolean> {
    throw new Error('not implemented');
  }
  clear(): Promise<void> {
    throw new Error('not implemented');
  }
  clearIfCurrent(_expected: string): Promise<boolean> {
    throw new Error('not implemented');
  }
}
