import { USER_ROLES, type UserRole } from '@baile-latino/types';

export interface ModuleChild {
  label: string;
  /** Clave de permiso jerárquica (ej: 'music.youtube.tracks'). La sección hereda del padre. */
  key: string;
  /** Enlace (hoja). Ausente si es un grupo con sub-items. */
  href?: string;
  /** Ícono de marca (SVG real) para el header del grupo, en vez de emoji. */
  brandIcon?: 'youtube' | 'spotify';
  /** Sub-items (un nivel de anidamiento, ej: YouTube → Canciones/Catálogo/Playlists). */
  children?: ModuleChild[];
}

export interface AppModule {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  /** Roles con acceso. SUPER_ADMIN siempre tiene acceso (ver canAccess). */
  roles: UserRole[];
  status: 'ready' | 'soon';
  /** Sub-navegación (solo módulos listos). */
  children?: ModuleChild[];
}

const ALL: UserRole[] = [...USER_ROLES];

/**
 * Registro central de módulos del panel web.
 * Para cambiar quién ve qué, edita el array `roles` de cada módulo.
 */
export const MODULES: AppModule[] = [
  {
    key: 'music',
    title: 'Música y DJs',
    description: 'Catálogo, playlists, generador automático y reportes.',
    href: '/music',
    icon: '🎧',
    roles: ['DJ', 'ORGANIZADOR', 'SUPER_ADMIN'],
    status: 'ready',
    children: [
      { label: 'Resumen', key: 'music.resumen', href: '/music' },
      { label: 'Descubre', key: 'music.discover', href: '/music/discover' },
      { label: 'Artistas', key: 'music.artists', href: '/music/artists' },
      {
        label: 'YouTube',
        key: 'music.youtube',
        brandIcon: 'youtube',
        children: [
          { label: 'Mis Canciones', key: 'music.youtube.tracks', href: '/music/tracks' },
          { label: 'Catálogo', key: 'music.youtube.catalog', href: '/music/catalog' },
          { label: 'Playlists Internas', key: 'music.youtube.playlists', href: '/music/playlists' },
          { label: 'Playlists YouTube', key: 'music.youtube.ytplaylists', href: '/music/youtube-playlists' },
        ],
      },
      {
        label: 'Spotify',
        key: 'music.spotify',
        brandIcon: 'spotify',
        children: [
          { label: 'Mis Canciones', key: 'music.spotify.tracks', href: '/music/spotify/tracks' },
          { label: 'Catálogo', key: 'music.spotify.catalog', href: '/music/spotify/catalog' },
          { label: 'Playlists Internas', key: 'music.spotify.internalplaylists', href: '/music/spotify/internal-playlists' },
          { label: 'Playlists Spotify', key: 'music.spotify.playlists', href: '/music/spotify/playlists' },
        ],
      },
      { label: 'Reportes', key: 'music.reportes', href: '/music/reports' },
    ],
  },
  {
    key: 'events',
    title: 'Eventos',
    description: 'Sociales, preventas, fondos en custodia y notificaciones.',
    href: '/events',
    icon: '📅',
    roles: ['ORGANIZADOR', 'VENUE', 'SUPER_ADMIN'],
    status: 'soon',
  },
  {
    key: 'sales',
    title: 'Ventas y Pagos',
    description: 'Entradas, QR, boletas SII y panel de ventas.',
    href: '/sales',
    icon: '💳',
    roles: ['ORGANIZADOR', 'SUPER_ADMIN'],
    status: 'soon',
  },
  {
    key: 'access',
    title: 'Control de Acceso',
    description: 'Escaneo de QR, aforo y control en puerta.',
    href: '/access',
    icon: '🎟️',
    roles: ['ORGANIZADOR', 'VENUE', 'SUPER_ADMIN'],
    status: 'soon',
  },
  {
    key: 'classes',
    title: 'Clases y Bootcamps',
    description: 'Calendario, reservas, seguimiento de alumnos.',
    href: '/classes',
    icon: '🎓',
    roles: ['PROFESOR', 'SUPER_ADMIN'],
    status: 'soon',
  },
  {
    key: 'competitions',
    title: 'Competencias',
    description: 'Inscripciones, ELO, brackets y jueceo.',
    href: '/competitions',
    icon: '🏆',
    roles: ['ORGANIZADOR', 'SUPER_ADMIN'],
    status: 'soon',
  },
  {
    key: 'choreography',
    title: 'Coreografía',
    description: 'Estructura por secciones, looper, metrónomo y ensayos.',
    href: '/choreography',
    icon: '💃',
    roles: ['COREOGRAFO', 'PROFESOR', 'SUPER_ADMIN'],
    status: 'soon',
  },
  {
    key: 'talent',
    title: 'Marketplace de Talento',
    description: 'Perfiles, portafolios, propuestas y contratación.',
    href: '/talent',
    icon: '⭐',
    roles: [
      'DJ',
      'ARTISTA',
      'COREOGRAFO',
      'FILMMAKER',
      'ORGANIZADOR',
      'SUPER_ADMIN',
    ],
    status: 'soon',
  },
  {
    key: 'studios',
    title: 'Salas de Ensayo',
    description: 'Catálogo, reservas y dashboard del dueño.',
    href: '/studios',
    icon: '🏠',
    roles: ['PROFESOR', 'VENUE', 'SUPER_ADMIN'],
    status: 'soon',
  },
  {
    key: 'community',
    title: 'Comunidad',
    description: 'Perfiles, conexiones, feed y mapa de eventos.',
    href: '/community',
    icon: '🌐',
    roles: ALL,
    status: 'soon',
  },
  {
    key: 'credits',
    title: 'Créditos',
    description: 'Saldo, transferencias, misiones y badges.',
    href: '/credits',
    icon: '🪙',
    roles: ALL,
    status: 'soon',
  },
  {
    key: 'products',
    title: 'Productos',
    description: 'Zapatos, ropa técnica, trajes y accesorios.',
    href: '/products',
    icon: '🛍️',
    roles: ALL,
    status: 'soon',
  },
  {
    key: 'admin',
    title: 'Administración',
    description: 'Roles, permisos y configuración de la plataforma.',
    href: '/admin',
    icon: '🛡️',
    roles: ['SUPER_ADMIN'],
    status: 'ready',
    children: [
      { label: 'Resumen', key: 'admin.resumen', href: '/admin' },
      { label: 'Usuarios', key: 'admin.users', href: '/admin/users' },
      {
        label: 'Accesos YouTube',
        key: 'admin.youtube-access',
        href: '/admin/youtube-access',
      },
      { label: 'Roles y permisos', key: 'admin.roles', href: '/admin/roles' },
      { label: 'Estilos y sub-estilos', key: 'admin.tags', href: '/admin/tags' },
      { label: 'Configuración del sitio', key: 'admin.settings', href: '/admin/settings' },
    ],
  },
];

/** SUPER_ADMIN ve todo; el resto, solo módulos donde figure su rol. */
export function canAccess(role: UserRole, mod: AppModule): boolean {
  return role === 'SUPER_ADMIN' || mod.roles.includes(role);
}

export function accessibleModules(role: UserRole): AppModule[] {
  return MODULES.filter((m) => canAccess(role, m));
}

/** Encuentra el módulo activo según la ruta actual. */
export function moduleForPath(pathname: string): AppModule | undefined {
  return MODULES.find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
  );
}

export function moduleByKey(key: string): AppModule | undefined {
  return MODULES.find((m) => m.key === key);
}

export interface PermNode {
  key: string;
  label: string;
  /** 0 = módulo, 1 = sección, 2 = subsección. */
  depth: number;
  /** Clave del módulo raíz (para los defaults). */
  rootKey: string;
}

/** Aplana módulos + secciones + subsecciones en filas para la matriz de permisos. */
export function permTree(): PermNode[] {
  const out: PermNode[] = [];
  for (const m of MODULES) {
    out.push({ key: m.key, label: `${m.icon} ${m.title}`, depth: 0, rootKey: m.key });
    const walk = (children: ModuleChild[], depth: number) => {
      for (const c of children) {
        out.push({ key: c.key, label: c.label, depth, rootKey: m.key });
        if (c.children) walk(c.children, depth + 1);
      }
    };
    if (m.children) walk(m.children, 1);
  }
  return out;
}

/** Roles por defecto de una clave: hereda del módulo raíz (primer segmento). */
export function defaultRolesForKey(key: string): UserRole[] {
  const rootKey = key.split('.')[0];
  return MODULES.find((m) => m.key === rootKey)?.roles ?? [];
}

/** Clave de permiso de la sección (hoja) que mejor matchea una ruta (href más largo). */
export function permKeyForPath(pathname: string): string | undefined {
  let best: { key: string; len: number } | undefined;
  const visit = (children: ModuleChild[]) => {
    for (const c of children) {
      if (
        c.href &&
        (pathname === c.href || pathname.startsWith(`${c.href}/`)) &&
        (!best || c.href.length > best.len)
      ) {
        best = { key: c.key, len: c.href.length };
      }
      if (c.children) visit(c.children);
    }
  };
  for (const m of MODULES) if (m.children) visit(m.children);
  return best?.key;
}
