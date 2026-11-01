import '@fontsource-variable/inter'
import './styles/base.css'
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/settings'

// One bundle serves every ovyra:// host; each loads only the code for its own page.
const pages: Record<string, LazyExoticComponent<ComponentType>> = {
  shell: lazy(() => import('./shell/Shell')),
  overlay: lazy(() => import('./overlay/Overlay')),
  newtab: lazy(() => import('./pages/NewTab')),
  history: lazy(() => import('./pages/History')),
  bookmarks: lazy(() => import('./pages/Bookmarks')),
  downloads: lazy(() => import('./pages/Downloads')),
  settings: lazy(() => import('./pages/Settings')),
  extensions: lazy(() => import('./pages/Extensions')),
  error: lazy(() => import('./pages/ErrorPage'))
}

const host = location.host
document.documentElement.dataset.page = host
const Page = pages[host] ?? pages.error

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>
    <Page />
  </Suspense>
)
