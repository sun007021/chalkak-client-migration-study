// iOS FCM은 opt-in이다(app.config.ts와 같은 기준: GOOGLE_SERVICES_PLIST).
// 값이 없으면 RNFB 파드를 iOS 자동 링크에서 뺀다. RNFB 27은 SPM 전용 Firebase SDK를 쓰므로
// dynamic frameworks 없이 링크되면 pod install이 멈춘다. Android 링크는 그대로 둔다.
const iosFcmEnabled = Boolean(process.env.GOOGLE_SERVICES_PLIST?.trim());

const RNFB_PACKAGES = ['@react-native-firebase/app', '@react-native-firebase/messaging'];

module.exports = {
  dependencies: iosFcmEnabled
    ? {}
    : Object.fromEntries(RNFB_PACKAGES.map((name) => [name, { platforms: { ios: null } }])),
};
