import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import SearchView from './pages/SearchView'
import NegotiateView from './pages/NegotiateView'
import ListingView from './pages/ListingView'
import PipelineView from './pages/PipelineView'
import DashboardView from './pages/DashboardView'
import AdminDashboard from './pages/AdminDashboard'
import DiscoveryView from './pages/DiscoveryView'
import HowToView from './pages/HowToView'
import AppointmentsPage from './pages/AppointmentsPage'
import HomeView from './pages/HomeView'
import { usePipeline } from './hooks/usePipeline'

export default function App() {
  const pipeline = usePipeline()

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout>
              <HomeView pipeline={pipeline} />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/search" element={
          <ProtectedRoute>
            <Layout>
              <SearchView pipeline={pipeline} />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/discovery" element={
          <ProtectedRoute>
            <Layout>
              <DiscoveryView pipeline={pipeline} />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/negotiate" element={
          <ProtectedRoute>
            <Layout>
              <NegotiateView pipeline={pipeline} />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/listing" element={
          <ProtectedRoute>
            <Layout>
              <ListingView />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/pipeline" element={
          <ProtectedRoute>
            <Layout>
              <PipelineView pipeline={pipeline} />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout>
              <DashboardView pipeline={pipeline} />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/management" element={
          <ProtectedRoute>
            <Layout>
              <AdminDashboard pipeline={pipeline} />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/howto" element={
          <ProtectedRoute>
            <Layout>
              <HowToView />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={<Navigate to="/management" replace />} />
        <Route path="/admin" element={<Navigate to="/management" replace />} />
        <Route path="/appointments" element={
          <ProtectedRoute>
            <Layout>
              <AppointmentsPage />
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  )
}

