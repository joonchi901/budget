import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './brand/tokens.css';
import './styles.css';
import './design-system.css';
import './controls.css';
import './date-fields.css';
import './ux-refinements.css';
import './room-navigation.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
