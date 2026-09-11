import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  handleBrokers,
  handleConnect,
  handleDisconnect,
  handleStatus,
  handleTrade,
} from './api/metaapi/_handlers.js'
import signupsHandler from './api/signups/index.js'
import licensesHandler from './api/licenses/index.js'
import mentorsHandler from './api/mentors/index.js'
import chartSymbolHandler from './api/chart/symbol.js'

function metaApiDevPlugin() {
  return {
    name: 'metaapi-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost')

          if (url.pathname === '/api/signups' || url.pathname === '/api/signups/') {
            req.url = `${url.pathname}${url.search}`
            return signupsHandler(req, res)
          }

          if (url.pathname === '/api/licenses' || url.pathname === '/api/licenses/') {
            req.url = `${url.pathname}${url.search}`
            return licensesHandler(req, res)
          }

          if (url.pathname === '/api/mentors' || url.pathname === '/api/mentors/') {
            req.url = `${url.pathname}${url.search}`
            return mentorsHandler(req, res)
          }

          if (url.pathname === '/api/chart/symbol' || url.pathname === '/api/chart/symbol/') {
            req.url = `${url.pathname}${url.search}`
            return chartSymbolHandler(req, res)
          }

          if (!url.pathname.startsWith('/api/metaapi/')) return next()

          // Preserve full path+query for handlers that parse req.url
          req.url = `${url.pathname}${url.search}`

          if (req.method === 'GET' && url.pathname === '/api/metaapi/brokers') {
            return handleBrokers(req, res)
          }
          if (req.method === 'GET' && url.pathname === '/api/metaapi/status') {
            return handleStatus(req, res)
          }
          if (req.method === 'POST' && url.pathname === '/api/metaapi/connect') {
            return handleConnect(req, res)
          }
          if (req.method === 'POST' && url.pathname === '/api/metaapi/trade') {
            return handleTrade(req, res)
          }
          if (req.method === 'POST' && url.pathname === '/api/metaapi/disconnect') {
            return handleDisconnect(req, res)
          }

          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Not found' }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'Server error' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  process.env.METAAPI_TOKEN = process.env.METAAPI_TOKEN || env.METAAPI_TOKEN || ''
  process.env.METAAPI_STRATEGY_ID = process.env.METAAPI_STRATEGY_ID || env.METAAPI_STRATEGY_ID || ''
  process.env.METAAPI_REGION = process.env.METAAPI_REGION || env.METAAPI_REGION || 'new-york'
  process.env.SIGNUPS_GITHUB_TOKEN =
    process.env.SIGNUPS_GITHUB_TOKEN || env.SIGNUPS_GITHUB_TOKEN || ''
  process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || env.GITHUB_TOKEN || ''
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || ''
  process.env.OPENAI_VISION_MODEL =
    process.env.OPENAI_VISION_MODEL || env.OPENAI_VISION_MODEL || 'gpt-4o-mini'

  return {
    plugins: [react(), metaApiDevPlugin()],
  }
})
