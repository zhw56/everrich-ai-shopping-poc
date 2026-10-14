import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ComparePage } from './app/ComparePage';
import { AdminApp } from './admin/AdminApp';
import './theme.css';
import './styles.css';

const comparisonPath = /^\/compare\/([^/]+)\/?$/.exec(window.location.pathname);
const isAdmin = /^\/admin\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {comparisonPath ? <ComparePage id={comparisonPath[1]} /> : isAdmin ? <AdminApp /> : <App />}
  </StrictMode>,
);
