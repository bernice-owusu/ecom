import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          borderRadius: '12px',
          background: '#1c1c1c',
          color: '#fff',
          fontSize: '14px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        },
        success: { iconTheme: { primary: '#2e7d32', secondary: '#fff' } },
        error: { iconTheme: { primary: '#c62828', secondary: '#fff' } },
      }}
    />
  </StrictMode>,
)
