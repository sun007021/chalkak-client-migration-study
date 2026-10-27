const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier/flat');

// TC-TIME-029 / REQ-TIME-002: 시스템 시계를 직접 부르지 않고 주입된 Clock만 쓴다.
// 인자 없는 `new Date()`, `Date.now`, `performance.now`를 금지한다(인자 있는 `new Date(x)`는 허용).
const CLOCK_MESSAGE = '시스템 시계를 직접 부르지 말고 주입된 Clock(core/time/Clock)을 쓰세요.';
const noDirectClock = {
  'no-restricted-syntax': [
    'error',
    { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MESSAGE },
    {
      selector: "MemberExpression[object.name='Date'][property.name='now']",
      message: CLOCK_MESSAGE,
    },
    {
      selector: "MemberExpression[object.name='performance'][property.name='now']",
      message: CLOCK_MESSAGE,
    },
  ],
};

module.exports = defineConfig([
  expo,
  prettier,
  { ignores: ['node_modules/', 'ios/', 'android/', 'dist/', '.expo/', 'coverage/'] },
  { rules: noDirectClock },
  {
    // 허용 목록: 시스템 시계를 감싸는 Clock 구현 한 곳과 테스트 코드.
    files: ['src/core/time/Clock.ts', '**/*.test.ts', '**/*.test.tsx', '**/__testing__/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
]);
