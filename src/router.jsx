import { createBrowserRouter } from 'react-router-dom'
import { GuestOnly, RequireReady, RequireStep } from './auth/guards'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import VerifyEmailPage from './pages/auth/VerifyEmailPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import AuthCallbackPage from './pages/auth/AuthCallbackPage'
import ChangePasswordPage from './pages/auth/ChangePasswordPage'
import AccountDisabledPage from './pages/auth/AccountDisabledPage'
import SetupPage from './pages/setup/SetupPage'
import HomePage from './pages/HomePage'
import RequireSuperAdmin from './auth/RequireSuperAdmin'
import AppLayout from './components/layout/AppLayout'
import SpacePage from './pages/spaces/SpacePage'
import UsersPage from './pages/settings/UsersPage'
import SpacesPage from './pages/settings/SpacesPage'
import SpaceSettingsPage from './pages/settings/SpaceSettingsPage'
import NotFoundPage from './pages/NotFoundPage'

export const routes = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Email link targets: they handle their own session state.
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },

  { element: <RequireStep step="/setup" />, children: [{ path: '/setup', element: <SetupPage /> }] },
  { element: <RequireStep step="/change-password" />, children: [{ path: '/change-password', element: <ChangePasswordPage /> }] },
  { element: <RequireStep step="/account-disabled" />, children: [{ path: '/account-disabled', element: <AccountDisabledPage /> }] },

  {
    element: <RequireReady />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/spaces/:spaceId', element: <SpacePage /> },
          {
            element: <RequireSuperAdmin />,
            children: [
              { path: '/settings/users', element: <UsersPage /> },
              { path: '/settings/spaces', element: <SpacesPage /> },
              { path: '/spaces/:spaceId/settings', element: <SpaceSettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]

export const router = createBrowserRouter(routes)
