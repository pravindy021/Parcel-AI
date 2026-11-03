import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/auth/ProtectedRoute'

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DataPreviewPage = lazy(() => import('./pages/DataPreviewPage'))
const DataQualityPage = lazy(() => import('./pages/DataQualityPage'))
const DatasetComparisonPage = lazy(() => import('./pages/DatasetComparisonPage'))
const DatasetsPage = lazy(() => import('./pages/DatasetsPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const OrganizationPage = lazy(() => import('./pages/OrganizationPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const PredictionsPage = lazy(() => import('./pages/PredictionsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const UploadPage = lazy(() => import('./pages/UploadPage'))

const PageLoader = () => (
  <div className="flex min-h-56 items-center justify-center" role="status" aria-label="Loading page">
    <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-700" />
  </div>
)

export const App = () => (
  <AuthProvider>
    <AppProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/datasets/:datasetId" element={<DataPreviewPage />} />
          <Route path="/compare" element={<DatasetComparisonPage />} />
          <Route path="/data-quality" element={<DataQualityPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/team" element={<OrganizationPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
          <Route path="/settings" element={<AccountPage />} />
          <Route path="/workspace-settings" element={<SettingsPage />} />
        </Route>
        <Route path="/index" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppProvider>
  </AuthProvider>
)

export default App
