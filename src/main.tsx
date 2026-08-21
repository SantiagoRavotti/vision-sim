import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Deliberately NOT wrapped in <StrictMode>. Its dev-only double-mount would
// acquire the camera twice and create/destroy a WebGL context on every reload,
// which produces confusing failures in exactly the layer we care about most.
createRoot(document.getElementById('root')!).render(<App />)
