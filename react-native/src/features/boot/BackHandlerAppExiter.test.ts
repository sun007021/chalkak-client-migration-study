import { BackHandler } from 'react-native';

import { BackHandlerAppExiter } from './BackHandlerAppExiter';

describe('BackHandlerAppExiter', () => {
  it('REQ-BOOT-009 exit()는 BackHandler.exitApp()을 부른다', () => {
    const exit = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    new BackHandlerAppExiter().exit();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
