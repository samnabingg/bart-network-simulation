// Tiny local server for the spike.
// - Serves the page (index.html, app.js, parse.js).
// - Proxies BART's Legacy API so the API key stays on the server and the
//   browser never has to deal with cross-origin rules.
// Needs Node 18+ (built-in fetch). No dependencies.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // localhost only unless you change it
const KEY = process.env.BART_API_KEY || '';
const BASE = process.env.BART_API_BASE || 'https://api.bart.gov/api';

const HOUR = 60 * 60 * 1000;
const ETD_TTL = 15 * 1000; // real-time estimates: cache briefly to be polite

// Only these files are served, so nothing else in the folder is exposed.
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/bayfair.js': ['bayfair.js', 'text/javascript; charset=utf-8'],
  '/train-ride.js': ['train-ride.js', 'text/javascript; charset=utf-8'],
  '/station3d.js': ['station3d.js', 'text/javascript; charset=utf-8'],
  '/fleet.js': ['fleet.js', 'text/javascript; charset=utf-8'],
  '/network.js': ['network.js', 'text/javascript; charset=utf-8'],
  '/parse.js': ['parse.js', 'text/javascript; charset=utf-8'],
  // Track lines and station entrances, made from BART's KML by build-geo.mjs.
  '/geo.json': ['geo.json', 'application/json; charset=utf-8'],
};

const cache = new Map();

async function cachedJSON(url, ttlMs) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;

  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`BART API returned HTTP ${res.status}`);

  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

function sendJSON(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET' });
      return res.end('Method not allowed');
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/stations' || url.pathname === '/api/etd') {
      if (!KEY) {
        return sendJSON(res, 503, {
          error: 'BART_API_KEY is not set. Register for a key, then restart the server with it.',
        });
      }

      if (url.pathname === '/api/stations') {
        const data = await cachedJSON(
          `${BASE}/stn.aspx?cmd=stns&key=${encodeURIComponent(KEY)}&json=y`,
          HOUR,
        );
        return sendJSON(res, 200, data);
      }

      const orig = (url.searchParams.get('orig') || '').toUpperCase();
      if (!/^[A-Z0-9]{2,4}$/.test(orig)) {
        return sendJSON(res, 400, { error: 'Invalid station abbreviation.' });
      }
      const data = await cachedJSON(
        `${BASE}/etd.aspx?cmd=etd&orig=${orig}&key=${encodeURIComponent(KEY)}&json=y`,
        ETD_TTL,
      );
      return sendJSON(res, 200, data);
    }

    const entry = STATIC[url.pathname];
    if (!entry) {
      res.writeHead(404);
      return res.end('Not found');
    }
    let body;
    try {
      body = await readFile(path.join(DIR, entry[0]));
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        return res.end(`${entry[0]} not found. Run: node build-geo.mjs path/to/doc.kml`);
      }
      throw err;
    }
    res.writeHead(200, { 'content-type': entry[1] });
    res.end(body);
  } catch (err) {
    sendJSON(res, 502, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Spike running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (!KEY) console.warn('Warning: BART_API_KEY is not set. The page will load, but data calls will fail.');
});