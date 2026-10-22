// A dependency-free, loopback-only server for the installed Vite build snapshot.
import { createServer } from 'node:http';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const root = realpathSync(process.argv[2]);
const rootPrefix = `${root}${sep}`;
const port = 5173;
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.woff2', 'font/woff2'],
]);

function withinRoot(file) {
  return file === root || file.startsWith(rootPrefix);
}

function respond(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let file;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!withinRoot(file)) throw new Error('outside site directory');
    file = realpathSync(file);
    if (!withinRoot(file)) throw new Error('outside site directory');
  } catch {
    response.writeHead(404).end();
    return;
  }

  let stats;
  try {
    stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
  } catch {
    response.writeHead(404).end();
    return;
  }

  const headers = {
    'Content-Type': mime.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
    'Content-Length': stats.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  let status = 200;
  let start = 0;
  let end = stats.size - 1;
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` }).end();
      return;
    }
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
    } else {
      start = Math.max(0, stats.size - Number(match[2]));
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end >= stats.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` }).end();
      return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
    headers['Content-Length'] = end - start + 1;
  }

  response.writeHead(status, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

const server = createServer(respond);
server.on('error', (error) => {
  console.error(`本机网页服务无法启动：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`本机网页快照正在运行：http://localhost:${port}/`);
});
