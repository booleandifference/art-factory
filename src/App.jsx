import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/common/Layout'
import LoginPage from './pages/LoginPage'
import ConceptsPage from './pages/ConceptsPage'
import BuilderPage from './pages/BuilderPage'
import MockupBuilderPage from './pages/MockupBuilderPage'
import QueuePage from './pages/QueuePage'
import GalleryPage from './pages/GalleryPage'
import MockupGalleryPage from './pages/MockupGalleryPage'
import CollectionsPage from './pages/CollectionsPage'
import EtsyConnectPage from './pages/EtsyConnectPage'
import StatsPage from './pages/StatsPage'
import BuilderV2Page from './pages/BuilderV2Page'
import CollectionDetailPage from './pages/CollectionDetailPage'
import VideoGalleryPage from './pages/VideoGalleryPage'
import CollectionAnalysisPage from './pages/CollectionAnalysisPage'
import BatchVideoPage from './pages/BatchVideoPage'
import BatchProductionPage from './pages/BatchProductionPage'
import BundleMakerPage from './pages/BundleMakerPage'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ConceptsPage />} />
        <Route path="builder-v2" element={<BuilderV2Page />} />
        <Route path="builder-v2/:collectionId" element={<CollectionDetailPage />} />
        <Route path="builder" element={<BuilderPage />} />
        <Route path="mockups" element={<MockupBuilderPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="mockup-gallery" element={<MockupGalleryPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="videos" element={<VideoGalleryPage />} />
        <Route path="batch-video" element={<BatchVideoPage />} />
        <Route path="batch" element={<BatchProductionPage />} />
        <Route path="bundle-maker" element={<BundleMakerPage />} />
        <Route path="analysis" element={<CollectionAnalysisPage />} />
        <Route path="settings/etsy" element={<EtsyConnectPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ProtectedRoutes />
    </AuthProvider>
  )
}
