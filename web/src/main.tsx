import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootstrapApp } from './app/bootstrap';

// 컨테이너·라우터는 앱 수명 동안 하나다(렌더마다 만들지 않는다).
const boot = bootstrapApp(import.meta.env);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App boot={boot} />
    </StrictMode>,
  );
}
