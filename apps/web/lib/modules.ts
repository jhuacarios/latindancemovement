import { USER_ROLES, type UserRole } from '@baile-latino/types';

export interface ModuleChild {
  label: string;
  href: string;
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
      { label: 'Resumen', href: '/music' },
      { label: 'Canciones', href: '/music/tracks' },
      { label: 'Catálogo', href: '/music/catalog' },
      { label: 'Playlists', href: '/music/playlists' },
      { label: 'Reportes', href: '/music/reports' },
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
      { label: 'Resumen', href: '/admin' },
      { label: 'Usuarios', href: '/admin/users' },
      { label: 'Roles y permisos', href: '/admin/roles' },
      { label: 'Estilos y sub-estilos', href: '/admin/tags' },
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
