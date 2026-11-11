import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/theme.css'
import './styles/tailwind-remap.css'
import './index.css'
import './mobile.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)