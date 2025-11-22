import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';
import './index.css';
import App from './App.jsx';
import { Provider } from 'react-redux';
import { store } from './state/store.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <AppProvider i18n={enTranslations}>
        <App />
      </AppProvider>
    </Provider>
  </StrictMode>,
);
