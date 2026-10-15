import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { AppShell } from './components/AppShell'
import { Loading } from './components/ui'
import SignIn from './pages/SignIn'
import NotFound from './pages/NotFound'
import './styles.css'

const Home = lazy(() => import('./pages/Home'))
const Closet = lazy(() => import('./pages/Closet'))
const AddGarment = lazy(() => import('./pages/AddGarment'))
const GarmentDetail = lazy(() => import('./pages/GarmentDetail'))
const Review = lazy(() => import('./pages/Review'))
const History = lazy(() => import('./pages/History'))
const Settings = lazy(() => import('./pages/Settings'))
const Colors = lazy(() => import('./pages/Colors'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, err) => n < 1 && !(err as { status?: number })?.status, refetchOnWindowFocus: false } },
})

function RequireAuth() {
  const { ready, signedIn } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="mx-auto max-w-6xl px-4 pt-16"><Loading /></div>
  if (!signedIn) return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  return <AppShell />
}

function Lazy() {
  return (
    <Suspense fallback={<Loading />}>
      <Outlet />
    </Suspense>
  )
}

const router = createBrowserRouter([
  { path: '/signin', element: <SignIn /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Lazy />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/closet', element: <Closet /> },
          { path: '/closet/add', element: <AddGarment /> },
          { path: '/closet/:id', element: <GarmentDetail /> },
          { path: '/review', element: <Review /> },
          { path: '/history', element: <History /> },
          { path: '/settings', element: <Settings /> },
          { path: '/settings/colors', element: <Colors /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
