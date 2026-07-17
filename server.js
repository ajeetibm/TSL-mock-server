/**
 * server.js
 * Production-pattern Express server.
 * Architecture: routes → controllers → services → mock-data (in-memory).
 * PRODUCTION: swap mock-data with real DB queries — no other changes needed.
 */
const fs      = require('fs')
const path    = require('path')
const express = require('express')
const yaml    = require('js-yaml')

const requestLogger = require('./middleware/requestLogger')
const errorHandler  = require('./middleware/errorHandler')
const logger        = require('./utils/logger')

// Load local development secrets before route modules load their services.
// Environment variables supplied by the shell always take precedence.
function loadEnvFile() {
  const envFile = path.join(__dirname, '.env')
  if (!fs.existsSync(envFile)) return

  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]] !== undefined) continue
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
    process.env[match[1]] = value
  }
}

loadEnvFile()

// ─── Config ───────────────────────────────────────────────────────────────────
function loadConfig() {
  try { return yaml.load(fs.readFileSync(path.join(__dirname, 'config.yml'), 'utf8')) || {} }
  catch (e) { logger.warn('server', 'config.yml not found — using defaults', { error: e.message }); return {} }
}
const config  = loadConfig()
const httpCfg = config.protocols?.http || {}
if (httpCfg.enable === false) { logger.warn('server', 'HTTP disabled in config.yml'); process.exit(0) }

const PORT      = process.env.PORT || httpCfg.port || 8080
const MOCKS_DIR = path.resolve(__dirname, httpCfg.mocks_dir || './mocks')

const app = express()

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(requestLogger)

// Method override for clients tunnelling PATCH/PUT/DELETE via POST
app.use((req, res, next) => {
  const override = req.get('X-HTTP-Method-Override') || req.get('X-HTTP-Method') || req.query?._method
  if (override) req.method = override.toUpperCase()
  next()
})

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = Array.isArray(config.origins) ? config.origins : []
app.use((req, res, next) => {
  const origin = req.headers.origin
  const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '')
  if (allowedOrigins.length === 0) { res.setHeader('Access-Control-Allow-Origin', '*') }
  else if (origin && (allowedOrigins.includes(origin) || isLocalDev)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-HTTP-Method-Override')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ─── V2 API Routes (new architecture) ────────────────────────────────────────
// Mounted at /api/v1 — same prefix as before, frontend unchanged.
app.use('/api/v1', require('./v2-routes/index'))

// ─── Legacy static mock file fallback ─────────────────────────────────────────
// Serves .mock files for any endpoint not handled by the new routes above.
// PRODUCTION: remove this entire block once all endpoints are migrated.
const Handlebars = require('handlebars')
Handlebars.registerHelper('randomValue', opts => {
  if (opts.hash?.type === 'UUID') return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r=(Math.random()*16)|0; return (c==='x'?r:(r&0x3)|0x8).toString(16) })
  return ''
})

function buildMockCandidates(relPath, method) {
  const segments = relPath.split('/').filter(Boolean)
  const pathVariants = new Set([relPath])
  const dynamicIdxs = segments.map((s,i)=>({s,i})).filter(({s})=>s&&s!=='api'&&s!=='v1').map(({i})=>i)
  for (let mask=1; mask < (1<<dynamicIdxs.length); mask++) {
    const variant=[...segments]
    dynamicIdxs.forEach((si,bi)=>{ if(mask&(1<<bi)) variant[si]='__' })
    pathVariants.add(variant.join('/'))
  }
  return [...pathVariants].flatMap(v => [path.join(MOCKS_DIR,v,`${method}.mock`), path.join(MOCKS_DIR,v,`${method.toLowerCase()}.mock`)])
}

app.use(async (req, res, next) => {
  try {
    const relPath = req.path.replace(/^\/+/, '')
    const candidates = buildMockCandidates(relPath, req.method)
    let filePath = null
    for (const p of candidates) { try { if (fs.existsSync(p)) { filePath = p; break } } catch (_) {} }
    if (!filePath) { if (req.method === 'GET') { const sf = path.join(MOCKS_DIR, relPath); if (fs.existsSync(sf) && fs.statSync(sf).isFile()) return res.sendFile(sf) } return next() }
    logger.debug('server', `Static mock: ${filePath}`)
    const raw = fs.readFileSync(filePath, 'utf8')
    const parts = raw.split(/\r?\n\r?\n/)
    const headerLines = parts[0].split(/\r?\n/).map(l=>l.trim()).filter(Boolean)
    let statusCode = 200; const headers = {}
    if (headerLines.length) { const m = headerLines[0].match(/HTTP\/\d+\.\d+\s+(\d{3})/); if (m) statusCode = parseInt(m[1]); for (let i=1;i<headerLines.length;i++) { const idx=headerLines[i].indexOf(':'); if (idx>-1) headers[headerLines[i].slice(0,idx).trim()]=headerLines[i].slice(idx+1).trim() } }
    let body = parts.slice(1).join('\n\n')
    if (body.includes('{{')) { try { body = Handlebars.compile(body)({ request: { body: req.body, headers: req.headers, query: req.query } }) } catch (_) {} }
    Object.entries(headers).forEach(([k,v]) => res.setHeader(k,v))
    res.status(statusCode).send(body)
  } catch (e) { next(e) }
})

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.', error: 'NOT_FOUND', path: req.path, method: req.method })
})

// ─── Centralised Error Handler ────────────────────────────────────────────────
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info('server', `Mock server listening on http://0.0.0.0:${PORT}`)
  logger.info('server', `Static mocks dir: ${MOCKS_DIR}`)
  logger.info('server', 'Architecture: routes → controllers → services → mock-data')
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE') { logger.error('server', `Port ${PORT} already in use.`); process.exit(1) }
  throw err
})
