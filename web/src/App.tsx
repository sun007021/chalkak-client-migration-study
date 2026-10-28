import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import type { Bootstrap } from './app/bootstrap';
import { t } from './copy/ko';

/** 조립 결과(main.tsx가 모듈 스코프에서 한 번 만든다)를 그린다. 설정 오류면 오류 화면. */
export function App({ boot }: { boot: Bootstrap }): ReactNode {
  if (boot.kind === 'config_error') {
    return (
      <main>
        <p role="alert">{t('common.error.config')}</p>
      </main>
    );
  }
  return <RouterProvider router={boot.router} />;
}
