import { YoutubeIcon } from './youtube-icon';
import { SpotifyIcon } from './spotify-icon';

/** Ícono de marca según la plataforma (YouTube o Spotify). */
export function PlatformIcon({
  source,
  className,
}: {
  source: 'YOUTUBE' | 'SPOTIFY';
  className?: string;
}) {
  return source === 'SPOTIFY' ? (
    <SpotifyIcon className={className} />
  ) : (
    <YoutubeIcon className={className} />
  );
}
