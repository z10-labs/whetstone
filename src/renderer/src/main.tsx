import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/explain-pr.css';
import './styles/session-memory.css';
import './styles/brain.css';
import './styles/workbench.css';
import './styles/transcript.css';
import './styles/live.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
