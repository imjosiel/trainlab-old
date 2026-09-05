const withNextIntl = require('next-intl/plugin')('./i18n.js');

const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['mongodb'],

  webpack(config, { dev }) {
    if (dev) {
      // Reduce CPU/memory from file watching
      config.watchOptions = {
        poll: 2000, // check every 2 seconds
        aggregateTimeout: 300, // wait before rebuilding
        ignored: ['**/node_modules'],
      };
    }
    return config;
  },

  async headers() {
    // Jitsi (fatia 37): domínio configurável via JITSI_DOMAIN; o CSP precisa
    // permitir o script external_api.js, o iframe da sala e as conexões de mídia.
    const jitsiHost = (process.env.JITSI_DOMAIN || "meet.jit.si").replace(/^https?:\/\//, "").replace(/\/+$/, "") || "meet.jit.si";
    const jitsiOrigin = `https://${jitsiHost}`;
    return [
      {
        // Required for FFmpeg WASM (SharedArrayBuffer)
        // 'credentialless' enables SharedArrayBuffer without blocking cross-origin resources (e.g. Cloudinary)
        source: "/(dashboard/exercises|admin)(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy",  value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        // Liberação de CORS focada na API para comunicação com frontend 3D isolado
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: process.env.FRONTEND_3D_URL || "http://localhost:5173" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization" }
        ]
      },
      {
        // Proteção contra clickjacking apenas em rotas autenticadas — não na landing page,
        // pois bots de preview (Vercel, OG scrapers) renderizam via iframe e seriam bloqueados.
        source: "/(dashboard|admin|partner|u)(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          // X-Frame-Options removido daqui — aplicado individualmente acima nas rotas protegidas
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Evita vazamento de URL completa quando o usuário clica em links externos
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restringe APIs sensíveis do browser a páginas autorizadas
          { key: "Permissions-Policy", value: `camera=(self "${jitsiOrigin}"), microphone=(self "${jitsiOrigin}"), geolocation=(), payment=()` },
          // Força HTTPS — protege contra SSL stripping e downgrade attacks
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },

          // Content-Security-Policy — origens legítimas do projeto
          {
            key: "Content-Security-Policy",
            value: [
              // Scripts: próprios + Next.js inline + Stripe + WASM (blob:) + Cloudflare Analytics
              `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://connect.stripe.com https://connect-js.stripe.com https://static.cloudflareinsights.com https://unpkg.com https://vercel.live https://*.vercel.live ${jitsiOrigin} https://meet.jit.si blob:`, 
              // Estilos: próprios + Google Fonts + inline (Radix/Tailwind inject styles)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              // Imagens: próprios + Cloudinary CDN + Google avatars + Stripe + data URIs + R2 CDN
              `img-src 'self' data: blob: https://res.cloudinary.com https://*.cloudinary.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://q.stripe.com https://courses-playeraction.hidrasistemas.com.br ${jitsiOrigin} https://meet.jit.si`,
              // Fontes: Google Fonts + próprias
              "font-src 'self' https://fonts.gstatic.com",
              // Frames: Stripe Connect (iframes de pagamento)
              `frame-src https://js.stripe.com https://connect.stripe.com https://connect-js.stripe.com https://hooks.stripe.com ${jitsiOrigin} https://meet.jit.si`,
              // Conexões: própria API + Cloudinary + Stripe + Upstash + Pusher + Cloudflare
              `connect-src 'self' https://*.cloudinary.com https://api.cloudinary.com https://api.stripe.com https://q.stripe.com https://connect-js.stripe.com https://*.upstash.io wss://*.upstash.io https://*.pusher.com wss://*.pusher.com https://cloudflareinsights.com https://accounts.google.com https://api.groq.com https://*.r2.cloudflarestorage.com https://courses-playeraction.hidrasistemas.com.br ${jitsiOrigin} wss://${jitsiHost} https://meet.jit.si wss://meet.jit.si https://*.8x8.vc wss://*.8x8.vc`,
              // Media: Cloudinary vídeos + R2 assets (proxy e CDN público)
              `media-src 'self' blob: https://res.cloudinary.com https://*.cloudinary.com https://*.r2.cloudflarestorage.com https://courses-playeraction.hidrasistemas.com.br ${jitsiOrigin} https://meet.jit.si`,
              // Workers: FFmpeg WASM usa workers com blob:
              "worker-src 'self' blob:",
              // Objects: bloqueia plugins (<object>, <embed>)
              "object-src 'none'",
              // Base URI: apenas a própria origem
              "base-uri 'self'",
              // Forms: apenas a própria origem
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);