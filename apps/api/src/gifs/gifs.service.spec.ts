import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GifsService } from './gifs.service';

const config = (key?: string) => ({ get: () => key }) as unknown as ConfigService;

const giphyGif = (id: string, host = 'media1.giphy.com') => ({
  id,
  title: `GIF ${id}`,
  images: {
    fixed_width: { url: `https://${host}/${id}/200w.gif`, webp: `https://${host}/${id}/200w.webp`, width: '200', height: '150' },
    fixed_width_small: { url: `https://${host}/${id}/100w.gif`, width: '100', height: '75' },
  },
});

describe('GifsService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sin clave: desactivado y no llama a GIPHY', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const s = new GifsService(config(undefined));
    await expect(s.search('baile')).resolves.toEqual({ enabled: false, gifs: [], nextOffset: null });
    await expect(s.byId('abc')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('convierte la respuesta, descarta URLs ajenas a GIPHY y pagina', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [giphyGif('a'), giphyGif('b', 'evil.example.com')],
        pagination: { offset: 0, count: 2, total_count: 40 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const s = new GifsService(config('KEY'));
    const r = await s.search('Baile');
    expect(r.enabled).toBe(true);
    expect(r.gifs).toEqual([
      {
        id: 'a',
        title: 'GIF a',
        url: 'https://media1.giphy.com/a/200w.webp',
        previewUrl: 'https://media1.giphy.com/a/100w.gif',
        width: 200,
        height: 150,
      },
    ]);
    expect(r.nextOffset).toBe(2);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/search?');
    expect(url).toContain('q=baile');
    expect(url).toContain('rating=pg-13');
    // La segunda vez sale de la caché.
    await s.search('baile');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('byId rechaza ids raros sin llamar a GIPHY', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const s = new GifsService(config('KEY'));
    await expect(s.byId('../etc')).rejects.toThrow('GIF no encontrado.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
