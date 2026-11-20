import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './lib/auth'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}><AuthProvider><App /><Toaster position="top-right" toastOptions={{ style: { borderRadius: '14px', background: 'var(--primary)', color: '#fff', fontSize: '14px' } }} /></AuthProvider></BrowserRouter>
)
