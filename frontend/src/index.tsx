import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
// Self-hosted fonts: only the weights the UI uses (Barlow for text, Big Shoulders for headings).
import '@fontsource/barlow/400';
import '@fontsource/barlow/500';
import '@fontsource/barlow/600';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import './index.css';
import App from './App';

// The served head carries a title, description and canonical for crawlers that don't run JS.
// PageMeta renders its own, so drop the served ones to avoid two of each.
document.head
  .querySelectorAll('title, meta[name="description"], link[rel="canonical"]')
  .forEach((el) => el.remove());

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
