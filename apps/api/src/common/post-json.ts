import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * POST JSON con node:http. No se usa `fetch` porque su cliente (undici) corta
 * cualquier respuesta que tarde más de 5 min en llegar (headersTimeout), aunque se
 * le pase un AbortSignal más largo; la separación de instrumentos y la conversión de
 * videos tardan más que eso.
 */
export function postJson(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const data = Buffer.from(JSON.stringify(payload));
  const target = new URL(url);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      target,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': data.length },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          let body: unknown = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            body = null;
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`El servicio no respondió en ${Math.round(timeoutMs / 60000)} min.`)));
    req.on('error', reject);
    req.end(data);
  });
}
