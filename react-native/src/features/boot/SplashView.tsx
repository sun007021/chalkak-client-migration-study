import { Image, StyleSheet, View } from 'react-native';

import { colors } from '../../shared/design/tokens';

const LAUNCH_LOGO = require('../../../assets/images/ChalkakLaunchLogo.png');
const LOGO_SIZE = 220;

/**
 * testID `splash.logo`. 사용자 입력 없음. 네이티브 스플래시와 같은 배경(logoBackground #FCFAF6)과 런치 로고(220)를 써서
 * 네이티브 스플래시에서 JS 스플래시로 넘어갈 때 화면이 바뀌어 보이지 않게 한다(screens-a.md §2).
 */
export function SplashView() {
  return (
    <View style={styles.root}>
      <Image
        testID="splash.logo"
        accessibilityLabel="찰캌"
        source={LAUNCH_LOGO}
        style={styles.logo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.logoBackground,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});
