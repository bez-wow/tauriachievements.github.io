import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.env.DIST_DIR ?? fileURLToPath(new URL('../dist/tauri-achievements/browser', import.meta.url)));
const port = Number(process.env.PORT ?? 4300);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function existingFile(path) {
  try {
    const stats = statSync(path);
    if (stats.isFile()) {
      return path;
    }
    if (stats.isDirectory()) {
      return existingFile(join(path, 'index.html'));
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function send(response, status, path) {
  response.writeHead(status, { 'content-type': contentTypes[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(response);
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const target = normalize(join(root, pathname));
  const file = target.startsWith(root) ? existingFile(target) : undefined;

  if (file) {
    send(response, 200, file);
  } else {
    send(response, 404, join(root, '404.html'));
  }
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
