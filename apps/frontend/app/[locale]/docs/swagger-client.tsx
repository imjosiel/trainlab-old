'use client'

import { useEffect, useState } from 'react'

export default function SwaggerClient() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch('/api/backend/docs')
      .then((res) => {
        if (res.status === 401) {
          window.location.href = '/'
          return null
        }
        if (!res.ok) {
          window.location.href = '/'
          return null
        }
        return res.json()
      })
      .then((spec) => {
        if (cancelled || !spec) return
        setReady(true)

        const script = document.createElement('script')
        script.src = 'https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js'
        script.onload = () => {
          const ui = (window as any).SwaggerUIBundle({
            spec,
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              (window as any).SwaggerUIBundle.presets.apis,
              (window as any).SwaggerUIBundle.SwaggerUIStandalonePreset,
            ],
            plugins: [(window as any).SwaggerUIBundle.plugins.DownloadUrl],
            layout: 'BaseLayout',
            tryItOutEnabled: true,
            persistAuthorization: true,
            filter: true,
            docExpansion: 'list',
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 2,
            displayRequestDuration: true,
            showExtensions: true,
            showCommonExtensions: true,
          })
          ;(window as any).__swaggerUi = ui
        }
        document.head.appendChild(script)
      })
      .catch(() => {
        if (!cancelled) window.location.href = '/'
      })

    return () => { cancelled = true }
  }, [])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"
      />

      <div
        style={{
          minHeight: '100vh',
          background: '#0a0a0a',
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f9cf9, #845ef7)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 900,
              color: '#fff',
            }}
          >
            ⚽
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '-0.3px',
              }}
            >
              Player.Action
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#4f9cf9',
                  background: 'rgba(79,156,249,0.12)',
                  padding: '2px 8px',
                  borderRadius: 12,
                  border: '1px solid rgba(79,156,249,0.3)',
                  verticalAlign: 'middle',
                }}
              >
                API Docs
              </span>
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              OpenAPI 3.1 — Personal Training Platform
            </p>
          </div>
        </div>

        {!ready && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            Carregando documentação...
          </div>
        )}

        <div id="swagger-ui" style={{ display: ready ? 'block' : 'none' }} />
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            body { background: #0a0a0a !important; }
            .swagger-ui { background: transparent !important; color: #e2e8f0 !important; }
            .swagger-ui .info { padding: 20px 0 10px; }
            .swagger-ui .info .title { color: #f1f5f9 !important; font-size: 24px; }
            .swagger-ui .info .description p { color: #94a3b8 !important; }
            .swagger-ui .opblock { border-radius: 8px !important; margin-bottom: 8px !important; background: rgba(255,255,255,0.03) !important; border-color: rgba(255,255,255,0.08) !important; }
            .swagger-ui .opblock .opblock-summary { border-radius: 8px !important; }
            .swagger-ui .opblock.is-open { background: rgba(255,255,255,0.05) !important; }
            .swagger-ui .opblock.opblock-get { border-left: 3px solid #4f9cf9 !important; }
            .swagger-ui .opblock.opblock-post { border-left: 3px solid #51cf66 !important; }
            .swagger-ui .opblock.opblock-put { border-left: 3px solid #f59e0b !important; }
            .swagger-ui .opblock.opblock-delete { border-left: 3px solid #f87171 !important; }
            .swagger-ui .opblock.opblock-patch { border-left: 3px solid #a78bfa !important; }
            .swagger-ui .opblock-summary-description { color: #cbd5e1 !important; }
            .swagger-ui .opblock-summary-path { color: #f1f5f9 !important; }
            .swagger-ui .opblock-tag { border-bottom: 1px solid rgba(255,255,255,0.08) !important; }
            .swagger-ui .opblock-tag-section h3 { color: #f1f5f9 !important; font-weight: 700; }
            .swagger-ui input[type=text], .swagger-ui textarea, .swagger-ui select { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.12) !important; color: #e2e8f0 !important; border-radius: 6px !important; }
            .swagger-ui .btn.execute { background: linear-gradient(135deg, #4f9cf9, #845ef7) !important; border: none !important; border-radius: 6px !important; font-weight: 600; }
            .swagger-ui .btn.try-out__btn { background: rgba(79,156,249,0.12) !important; color: #4f9cf9 !important; border: 1px solid rgba(79,156,249,0.3) !important; border-radius: 6px !important; }
            .swagger-ui .parameters-col_description { color: #94a3b8 !important; }
            .swagger-ui table.parameters th { color: #64748b !important; font-size: 11px !important; text-transform: uppercase; letter-spacing: 0.5px; }
            .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #94a3b8 !important; }
            .swagger-ui .response-col_status { color: #4f9cf9 !important; font-weight: 700; }
            .swagger-ui section.models { border-color: rgba(255,255,255,0.08) !important; background: rgba(255,255,255,0.02) !important; border-radius: 8px; }
            .swagger-ui section.models.is-open h4 { color: #f1f5f9 !important; }
            .swagger-ui .model-title { color: #a78bfa !important; }
            .swagger-ui .model { color: #cbd5e1 !important; }
            .swagger-ui .prop-type { color: #4f9cf9 !important; }
            .swagger-ui .prop-format { color: #94a3b8 !important; }
            .swagger-ui .topbar { display: none !important; }
            .swagger-ui .filter .operation-filter-input { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.12) !important; color: #e2e8f0 !important; }
            .swagger-ui .markdown p, .swagger-ui .markdown li { color: #94a3b8 !important; }
            .swagger-ui .markdown code { background: rgba(255,255,255,0.08) !important; color: #a78bfa !important; padding: 1px 4px; border-radius: 3px; }
            .swagger-ui .markdown table { color: #94a3b8 !important; }
            .swagger-ui .markdown table th { color: #f1f5f9 !important; }
            .swagger-ui .scheme-container { background: transparent !important; box-shadow: none !important; padding: 0; }
            .swagger-ui .dialog-ux .modal-ux { background: #1e293b !important; border-color: rgba(255,255,255,0.12) !important; color: #e2e8f0 !important; }
            .swagger-ui .dialog-ux .modal-ux-header h3 { color: #f1f5f9 !important; }
            .swagger-ui .auth-container label { color: #94a3b8 !important; }
            .swagger-ui .btn.authorize { background: rgba(79,156,249,0.12) !important; color: #4f9cf9 !important; border: 1px solid rgba(79,156,249,0.3) !important; border-radius: 6px !important; }
            .swagger-ui .btn.authorize svg { fill: #4f9cf9 !important; }
            .swagger-ui .highlight-code { background: #0f172a !important; border-radius: 6px !important; }
            .swagger-ui .microlight { color: #94a3b8 !important; }
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
            ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
          `,
        }}
      />
    </>
  )
}
