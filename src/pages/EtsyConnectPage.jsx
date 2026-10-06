import { useState, useEffect } from 'react'
import PageHeader from '../components/common/PageHeader'
import Button from '../components/common/Button'
import { useDocument, useFirestoreCrud } from '../hooks/useFirestore'
import { useSearchParams } from 'react-router-dom'

export default function EtsyConnectPage() {
  const { document: etsyConfig } = useDocument('config', 'etsy')
  const configCrud = useFirestoreCrud('config')
  const [connecting, setConnecting] = useState(false)
  const [searchParams] = useSearchParams()

  const isConnected = !!etsyConfig?.accessToken
  const justConnected = searchParams.get('connected') === 'true'

  // Editable config fields
  const [price, setPrice] = useState('')
  const [shopId, setShopId] = useState('')

  useEffect(() => {
    if (etsyConfig) {
      setPrice(String(etsyConfig.defaultPrice || '6.99'))
      setShopId(String(etsyConfig.shopId || ''))
    }
  }, [etsyConfig])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const response = await fetch(
        'https://us-central1-gamer-art-factory.cloudfunctions.net/etsyAuthUrl'
      )
      const data = await response.json()
      if (data.authUrl) {
        window.location.href = data.authUrl
      } else {
        alert('Failed to generate auth URL: ' + (data.error || 'Unknown error'))
        setConnecting(false)
      }
    } catch (err) {
      alert('Connection error: ' + err.message)
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Etsy? You will need to re-authorize to publish digital listings.')) return
    await configCrud.update('etsy', {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      shopId: null,
    })
  }

  const handleSaveConfig = async () => {
    await configCrud.update('etsy', {
      defaultPrice: parseFloat(price) || 6.99,
      shopId: shopId || etsyConfig?.shopId || null,
    })
    alert('Settings saved!')
  }

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title="Etsy Integration"
        subtitle="Connect your Etsy shop for digital download listings"
      />

      {/* Connection Status */}
      <div
        className="p-4 rounded-lg mb-6"
        style={{
          backgroundColor: isConnected ? 'rgba(166,227,161,0.1)' : 'rgba(243,139,168,0.1)',
          border: `1px solid ${isConnected ? 'rgba(166,227,161,0.3)' : 'rgba(243,139,168,0.3)'}`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: isConnected ? '#a6e3a1' : '#f38ba8' }}>
              {isConnected ? 'Connected to Etsy' : 'Not connected'}
            </p>
            {isConnected && etsyConfig?.shopId && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Shop ID: {etsyConfig.shopId}
              </p>
            )}
            {isConnected && etsyConfig?.expiresAt && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Token expires: {new Date(etsyConfig.expiresAt.seconds ? etsyConfig.expiresAt.seconds * 1000 : etsyConfig.expiresAt).toLocaleString()}
                {' '}(auto-refreshes)
              </p>
            )}
            {justConnected && (
              <p className="text-xs mt-1 font-medium" style={{ color: '#a6e3a1' }}>
                Successfully connected!
              </p>
            )}
          </div>
          {isConnected ? (
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Redirecting...' : 'Connect Etsy'}
            </Button>
          )}
        </div>
      </div>

      {/* Settings */}
      {isConnected && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            Digital Download Settings
          </h3>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Shop ID
            </label>
            <input
              type="text"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
              placeholder="Auto-detected from OAuth"
            />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Default Price (USD)
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
              placeholder="6.99"
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Recommended: $6-8 for digital downloads
            </p>
          </div>

          <Button variant="primary" size="sm" onClick={handleSaveConfig}>
            Save Settings
          </Button>
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 p-4 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
          How Digital Downloads Work
        </h3>
        <ol className="text-xs space-y-1.5" style={{ color: 'var(--color-text-muted)' }}>
          <li>1. Connect your Etsy shop above</li>
          <li>2. Go to Gallery → select an image → Prepare Listing</li>
          <li>3. Generate AI listing data (title, tags, description)</li>
          <li>4. Click "Publish as Digital Download"</li>
          <li>5. The app creates the listing, uploads preview + high-res file, and activates it</li>
        </ol>
        <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
          <strong>Two channels:</strong> Use "Publish via Gelato" for physical framed posters,
          and "Publish as Digital Download" for the digital file listing. Same artwork, two revenue streams.
        </p>
      </div>
    </div>
  )
}
