import type { ConfigPlugin } from '@expo/config-plugins';

declare const withOkHttpNoRetry: ConfigPlugin & {
  transformMainApplication: (contents: string, language: string) => string;
};
export = withOkHttpNoRetry;
