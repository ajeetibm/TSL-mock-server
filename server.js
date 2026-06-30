const fs = require('fs');
const path = require('path');
const express = require('express');
const yaml = require('js-yaml');

function loadConfig() {
  const cfgPath = path.join(__dirname, 'config.yml');
  try {
    const content = fs.readFileSync(cfgPath, 'utf8');
    return yaml.load(content) || {};
  } catch (err) {
    console.error('Failed to read config.yml:', err.message);
    return {};
  }
}

const config = loadConfig();
const httpCfg = (config.protocols && config.protocols.http) || {};
const enabled = httpCfg.hasOwnProperty('enable') ? httpCfg.enable : true;
if (!enabled) {
  console.warn('HTTP protocol disabled in config.yml. Exiting.');
  process.exit(0);
}

const port = httpCfg.port || 8080;
const chosenPort = process.env.PORT || port;
const mocksDir = path.resolve(__dirname, (httpCfg.mocks_dir || './mocks'));

const app = express();

// parse JSON bodies for potential mock templating
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Honor X-HTTP-Method-Override header so clients can tunnel PATCH/PUT/DELETE via POST
app.use((req, res, next) => {
  const override = req.get('X-HTTP-Method-Override') || req.get('X-HTTP-Method') || req.query && req.query._method;
  if (override) {
    req.method = override.toUpperCase();
  }
  next();
});

function isLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
}

// CORS middleware: allow origins configured in config.yml, plus localhost dev ports.
const allowedOrigins = (config.origins && Array.isArray(config.origins)) ? config.origins : [];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && (allowedOrigins.includes(origin) || isLocalDevOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-HTTP-Method-Override');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Serve static files from mocks directory
// Handlebars setup for rendering templates in mock bodies
const Handlebars = require('handlebars');
Handlebars.registerHelper('randomValue', function (opts) {
  const type = opts.hash && opts.hash.type;
  if (type === 'UUID') {
    // simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return '';
});

const { handleDynamicMock } = require('./routes')

function buildMockCandidates(relPath, method) {
  const segments = relPath.split('/').filter(Boolean);
  const pathVariants = new Set([relPath]);
  const dynamicIndexes = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment && segment !== 'api' && segment !== 'v1')
    .map(({ index }) => index);

  for (let mask = 1; mask < (1 << dynamicIndexes.length); mask += 1) {
    const variant = [...segments];
    dynamicIndexes.forEach((segmentIndex, bitIndex) => {
      if (mask & (1 << bitIndex)) {
        variant[segmentIndex] = '__';
      }
    });
    pathVariants.add(variant.join('/'));
  }

  return [...pathVariants].flatMap((variantPath) => [
    path.join(mocksDir, variantPath, `${method}.mock`),
    path.join(mocksDir, variantPath, `${method.toLowerCase()}.mock`),
  ]);
}

// Try to serve method-specific mock files (e.g. mocks/user/login/POST.mock)
app.use(async (req, res, next) => {
  try {
    const relPath = req.path.replace(/^\/+/, '');
    const overrideHeader = req.get('X-HTTP-Method-Override') || req.get('X-HTTP-Method') || '';
    const dynamicResponse = handleDynamicMock(req, res, relPath)
    if (dynamicResponse) return

    console.log(`[mock] incoming ${req.method} ${req.path} relPath='${relPath}' override='${overrideHeader}'`);
    // try multiple candidates for method-specific responses so real PATCH calls and
    // dynamic route segments represented by "__" folders work.
    const candidates = buildMockCandidates(relPath, req.method);

    console.log('[mock] candidate mock paths:', candidates);

    let filePath = null;
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) { filePath = p; break; }
      } catch (e) {
        // ignore errors checking candidates
      }
    }
    if (filePath) console.log(`[mock] matched file: ${filePath}`);
    else console.log(`[mock] no matching mock file found for ${req.method} ${relPath}`);

    if (filePath) {
      const raw = fs.readFileSync(filePath, 'utf8');
      // Split headers and body by first blank line
      const parts = raw.split(/\r?\n\r?\n/);
      const headerLines = parts[0].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let statusCode = 200;
      const headers = {};

      if (headerLines.length) {
        // First line may be HTTP status: HTTP/1.1 200 OK
        const first = headerLines[0];
        const m = first.match(/HTTP\/\d+\.\d+\s+(\d{3})/);
        if (m) statusCode = parseInt(m[1], 10);

        // remaining header lines
        for (let i = 1; i < headerLines.length; i++) {
          const idx = headerLines[i].indexOf(':');
          if (idx > -1) {
            const k = headerLines[i].slice(0, idx).trim();
            const v = headerLines[i].slice(idx + 1).trim();
            headers[k] = v;
          }
        }
      }

      let body = parts.slice(1).join('\n\n');
      // render template with request context if it contains handlebars markers
      if (body.includes('{{')) {
        try {
          const tpl = Handlebars.compile(body);
          body = tpl({ request: { body: req.body, headers: req.headers, query: req.query, params: req.params } });
        } catch (e) {
          console.error('Handlebars render error:', e.message);
        }
      }
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.status(statusCode).send(body);
      return;
    }

    // fallback: try to serve a file matching the path directly for GET
    if (req.method === 'GET') {
      const staticFile = path.join(mocksDir, relPath);
      if (fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) {
        return res.sendFile(staticFile);
      }
    }

    // not found
    res.status(404).json({ error: 'Not Found', path: req.path, method: req.method });
  } catch (err) {
    next(err);
  }
});

const server = app.listen(chosenPort, () => {
  console.log(`Mock server listening on http://0.0.0.0:${chosenPort}`);
  console.log(`Serving files from: ${mocksDir}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${chosenPort} is already in use. Change the port in config.yml or stop the process using the port.`);
    process.exit(1);
  }
  throw err;
});
