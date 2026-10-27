/** 플랫폼 보안 저장소 어댑터(실제 구현은 expo-secure-store). */
export interface SecureKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}
