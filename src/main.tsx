import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// 👈 1. استيراد مزود الإعدادات (تأكد من أن المسار يطابق هيكلة ملفاتك)
import { SettingsProvider } from './context/SettingsContext'; 
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* 👈 2. تغليف التطبيق بمزود الإعدادات */}
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>
);