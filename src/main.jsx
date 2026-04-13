import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthProvider from './components/AuthProvider';
import App from './App';
import './styles/tailwind.css';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
