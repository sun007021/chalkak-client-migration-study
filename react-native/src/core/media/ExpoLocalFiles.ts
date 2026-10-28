import { File } from 'expo-file-system';

import type { LocalFiles } from './LocalFiles';

/** expo-file-system 구현. 없는 파일을 지워도 던지지 않는다. */
export class ExpoLocalFiles implements LocalFiles {
  readBytes(uri: string): Promise<Uint8Array> {
    return new File(uri).bytes();
  }

  async delete(uri: string): Promise<void> {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // 지우지 못해도 앱 캐시 폴더라 시스템이 정리한다.
    }
  }
}
