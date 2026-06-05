import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { WebGPUCanvas } from './WebGPUCanvas.jsx'
import { MobileControls } from './mobile/MobileControls.jsx'
import { LoadingScreen } from './LoadingScreen.jsx'
import { JumpRopeCamera } from './jumpRope/JumpRopeCamera'
import { JumpRopeHUD } from './jumpRope/JumpRopeHUD'
import { ModeSelect } from './jumpRope/ModeSelect'

createRoot(document.getElementById('root')).render(
  <div className='canvas-container'>
    <MobileControls/>
    <JumpRopeCamera />
    <Suspense fallback={false}>
      <WebGPUCanvas />
    </Suspense>
    <JumpRopeHUD />
    <ModeSelect />
    <LoadingScreen />
    <div className="version">v0.3.4</div>
  </div>
)
