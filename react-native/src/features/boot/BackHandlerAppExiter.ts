import { BackHandler } from 'react-native';

import type { AppExiter } from './AppExiter';

export class BackHandlerAppExiter implements AppExiter {
  exit(): void {
    BackHandler.exitApp();
  }
}
