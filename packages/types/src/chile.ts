import type { ChileRegion } from './index';

// ---------------------------------------------------------------------------
// Geografía de Chile: Región → Ciudad → Comuna
// ---------------------------------------------------------------------------
// Las 346 comunas oficiales, agrupadas por "ciudad". La ciudad no es una
// división oficial: acá es el área urbana que la gente reconoce. Las grandes
// conurbaciones (Santiago, Gran Valparaíso, Gran Concepción…) agrupan varias
// comunas; cualquier otra comuna es su propia ciudad (mismo nombre).
// En la DB se guardan los NOMBRES (`city` y `commune`), no códigos.

/** Áreas urbanas de varias comunas, por región. */
const CONURBATIONS: Partial<Record<ChileRegion, Record<string, string[]>>> = {
  TARAPACA: { 'Iquique-Alto Hospicio': ['Iquique', 'Alto Hospicio'] },
  COQUIMBO: { 'La Serena-Coquimbo': ['La Serena', 'Coquimbo'] },
  VALPARAISO: {
    'Gran Valparaíso': ['Valparaíso', 'Viña del Mar', 'Concón', 'Quilpué', 'Villa Alemana'],
  },
  METROPOLITANA: {
    Santiago: [
      'Santiago', 'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central',
      'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana',
      'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú',
      'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura',
      'Quinta Normal', 'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón',
      'Vitacura', 'Puente Alto', 'San Bernardo',
    ],
  },
  OHIGGINS: { 'Gran Rancagua': ['Rancagua', 'Machalí'] },
  NUBLE: { 'Gran Chillán': ['Chillán', 'Chillán Viejo'] },
  BIOBIO: {
    'Gran Concepción': [
      'Concepción', 'Talcahuano', 'Hualpén', 'San Pedro de la Paz', 'Chiguayante',
      'Penco', 'Tomé', 'Coronel', 'Lota', 'Hualqui',
    ],
  },
  ARAUCANIA: { 'Gran Temuco': ['Temuco', 'Padre Las Casas'] },
};

/** Las 346 comunas por región (orden alfabético dentro de la región). */
const COMUNAS: Record<ChileRegion, string[]> = {
  ARICA_PARINACOTA: ['Arica', 'Camarones', 'General Lagos', 'Putre'],
  TARAPACA: ['Alto Hospicio', 'Camiña', 'Colchane', 'Huara', 'Iquique', 'Pica', 'Pozo Almonte'],
  ANTOFAGASTA: [
    'Antofagasta', 'Calama', 'María Elena', 'Mejillones', 'Ollagüe', 'San Pedro de Atacama',
    'Sierra Gorda', 'Taltal', 'Tocopilla',
  ],
  ATACAMA: [
    'Alto del Carmen', 'Caldera', 'Chañaral', 'Copiapó', 'Diego de Almagro', 'Freirina',
    'Huasco', 'Tierra Amarilla', 'Vallenar',
  ],
  COQUIMBO: [
    'Andacollo', 'Canela', 'Combarbalá', 'Coquimbo', 'Illapel', 'La Higuera', 'La Serena',
    'Los Vilos', 'Monte Patria', 'Ovalle', 'Paiguano', 'Punitaqui', 'Río Hurtado', 'Salamanca',
    'Vicuña',
  ],
  VALPARAISO: [
    'Algarrobo', 'Cabildo', 'Calle Larga', 'Cartagena', 'Casablanca', 'Catemu', 'Concón',
    'El Quisco', 'El Tabo', 'Hijuelas', 'Isla de Pascua', 'Juan Fernández', 'La Calera',
    'La Cruz', 'La Ligua', 'Limache', 'Llaillay', 'Los Andes', 'Nogales', 'Olmué', 'Panquehue',
    'Papudo', 'Petorca', 'Puchuncaví', 'Putaendo', 'Quillota', 'Quilpué', 'Quintero',
    'Rinconada', 'San Antonio', 'San Esteban', 'San Felipe', 'Santa María', 'Santo Domingo',
    'Valparaíso', 'Villa Alemana', 'Viña del Mar', 'Zapallar',
  ],
  METROPOLITANA: [
    'Alhué', 'Buin', 'Calera de Tango', 'Cerrillos', 'Cerro Navia', 'Colina', 'Conchalí',
    'Curacaví', 'El Bosque', 'El Monte', 'Estación Central', 'Huechuraba', 'Independencia',
    'Isla de Maipo', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana', 'La Reina',
    'Lampa', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú',
    'María Pinto', 'Melipilla', 'Ñuñoa', 'Padre Hurtado', 'Paine', 'Pedro Aguirre Cerda',
    'Peñaflor', 'Peñalolén', 'Pirque', 'Providencia', 'Pudahuel', 'Puente Alto', 'Quilicura',
    'Quinta Normal', 'Recoleta', 'Renca', 'San Bernardo', 'San Joaquín', 'San José de Maipo',
    'San Miguel', 'San Pedro', 'San Ramón', 'Santiago', 'Talagante', 'Tiltil', 'Vitacura',
  ],
  OHIGGINS: [
    'Chépica', 'Chimbarongo', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros',
    'La Estrella', 'Las Cabras', 'Litueche', 'Lolol', 'Machalí', 'Malloa', 'Marchigüe',
    'Mostazal', 'Nancagua', 'Navidad', 'Olivar', 'Palmilla', 'Paredones', 'Peralillo', 'Peumo',
    'Pichidegua', 'Pichilemu', 'Placilla', 'Pumanque', 'Quinta de Tilcoco', 'Rancagua',
    'Rengo', 'Requínoa', 'San Fernando', 'San Vicente', 'Santa Cruz',
  ],
  MAULE: [
    'Cauquenes', 'Chanco', 'Colbún', 'Constitución', 'Curepto', 'Curicó', 'Empedrado',
    'Hualañé', 'Licantén', 'Linares', 'Longaví', 'Maule', 'Molina', 'Parral', 'Pelarco',
    'Pelluhue', 'Pencahue', 'Rauco', 'Retiro', 'Río Claro', 'Romeral', 'Sagrada Familia',
    'San Clemente', 'San Javier', 'San Rafael', 'Talca', 'Teno', 'Vichuquén', 'Villa Alegre',
    'Yerbas Buenas',
  ],
  NUBLE: [
    'Bulnes', 'Chillán', 'Chillán Viejo', 'Cobquecura', 'Coelemu', 'Coihueco', 'El Carmen',
    'Ninhue', 'Ñiquén', 'Pemuco', 'Pinto', 'Portezuelo', 'Quillón', 'Quirihue', 'Ránquil',
    'San Carlos', 'San Fabián', 'San Ignacio', 'San Nicolás', 'Treguaco', 'Yungay',
  ],
  BIOBIO: [
    'Alto Biobío', 'Antuco', 'Arauco', 'Cabrero', 'Cañete', 'Chiguayante', 'Concepción',
    'Contulmo', 'Coronel', 'Curanilahue', 'Florida', 'Hualpén', 'Hualqui', 'Laja', 'Lebu',
    'Los Álamos', 'Los Ángeles', 'Lota', 'Mulchén', 'Nacimiento', 'Negrete', 'Penco',
    'Quilaco', 'Quilleco', 'San Pedro de la Paz', 'San Rosendo', 'Santa Bárbara', 'Santa Juana',
    'Talcahuano', 'Tirúa', 'Tomé', 'Tucapel', 'Yumbel',
  ],
  ARAUCANIA: [
    'Angol', 'Carahue', 'Cholchol', 'Collipulli', 'Cunco', 'Curacautín', 'Curarrehue',
    'Ercilla', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro', 'Loncoche', 'Lonquimay',
    'Los Sauces', 'Lumaco', 'Melipeuco', 'Nueva Imperial', 'Padre Las Casas', 'Perquenco',
    'Pitrufquén', 'Pucón', 'Purén', 'Renaico', 'Saavedra', 'Temuco', 'Teodoro Schmidt',
    'Toltén', 'Traiguén', 'Victoria', 'Vilcún', 'Villarrica',
  ],
  LOS_RIOS: [
    'Corral', 'Futrono', 'La Unión', 'Lago Ranco', 'Lanco', 'Los Lagos', 'Máfil', 'Mariquina',
    'Paillaco', 'Panguipulli', 'Río Bueno', 'Valdivia',
  ],
  LOS_LAGOS: [
    'Ancud', 'Calbuco', 'Castro', 'Chaitén', 'Chonchi', 'Cochamó', 'Curaco de Vélez',
    'Dalcahue', 'Fresia', 'Frutillar', 'Futaleufú', 'Hualaihué', 'Llanquihue', 'Los Muermos',
    'Maullín', 'Osorno', 'Palena', 'Puerto Montt', 'Puerto Octay', 'Puerto Varas', 'Puqueldón',
    'Purranque', 'Puyehue', 'Queilén', 'Quellón', 'Quemchi', 'Quinchao', 'Río Negro',
    'San Juan de la Costa', 'San Pablo',
  ],
  AYSEN: [
    'Aysén', 'Chile Chico', 'Cisnes', 'Cochrane', 'Coyhaique', 'Guaitecas', 'Lago Verde',
    "O'Higgins", 'Río Ibáñez', 'Tortel',
  ],
  MAGALLANES: [
    'Antártica', 'Cabo de Hornos', 'Laguna Blanca', 'Natales', 'Porvenir', 'Primavera',
    'Punta Arenas', 'Río Verde', 'San Gregorio', 'Timaukel', 'Torres del Paine',
  ],
};

export interface ChileCity {
  /** Nombre de la ciudad (lo que se guarda en `city`). */
  name: string;
  /** Comunas que la forman (una sola si no es conurbación). */
  comunas: string[];
}

const collator = new Intl.Collator('es');

function buildCities(region: ChileRegion): ChileCity[] {
  const groups = CONURBATIONS[region] ?? {};
  const grouped = new Set(Object.values(groups).flat());
  const cities: ChileCity[] = Object.entries(groups).map(([name, comunas]) => ({
    name,
    comunas: [...comunas].sort(collator.compare),
  }));
  for (const c of COMUNAS[region]) {
    if (!grouped.has(c)) cities.push({ name: c, comunas: [c] });
  }
  return cities.sort((a, b) => collator.compare(a.name, b.name));
}

/** Ciudades (con sus comunas) de cada región, ordenadas alfabéticamente. */
export const CHILE_CITIES: Record<ChileRegion, ChileCity[]> = Object.fromEntries(
  (Object.keys(COMUNAS) as ChileRegion[]).map((r) => [r, buildCities(r)]),
) as Record<ChileRegion, ChileCity[]>;

/** Ciudades de una región (vacío si la región no existe). */
export function citiesOf(region: string | null | undefined): ChileCity[] {
  return (region && CHILE_CITIES[region as ChileRegion]) || [];
}

/** Comunas de una ciudad dentro de una región. */
export function comunasOf(region: string | null | undefined, city: string | null | undefined): string[] {
  if (!city) return [];
  return citiesOf(region).find((c) => c.name === city)?.comunas ?? [];
}

/** Todas las comunas de una región. */
export function comunasOfRegion(region: string | null | undefined): string[] {
  return (region && COMUNAS[region as ChileRegion]) || [];
}

/** Ciudad a la que pertenece una comuna (en esa región), o `null`. */
export function cityOfComuna(region: string | null | undefined, comuna: string): string | null {
  return citiesOf(region).find((c) => c.comunas.includes(comuna))?.name ?? null;
}

/** Quita tildes, mayúsculas y espacios de más, para comparar texto libre. */
export function normalizePlaceText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombres coloquiales de CIUDADES → nombre oficial (normalizados). */
const CITY_ALIASES: Record<string, string> = {
  'gran santiago': 'santiago',
  stgo: 'santiago',
};

/** Nombres coloquiales de COMUNAS → nombre oficial (normalizados). */
const COMUNA_ALIASES: Record<string, string> = {
  'santiago centro': 'santiago',
  'stgo centro': 'santiago',
  vina: 'vina del mar',
  valpo: 'valparaiso',
  calera: 'la calera',
  'llay-llay': 'llaillay',
  'llay llay': 'llaillay',
  'til til': 'tiltil',
  coihaique: 'coyhaique',
};

/**
 * Interpreta un texto libre ("Vina del mar", "Providencia", "Santiago") dentro
 * de una región. Devuelve la ciudad y, si se pudo, la comuna. Si el texto es el
 * nombre de una ciudad de varias comunas (ej. "Gran Valparaíso") no elige comuna.
 * `null` si no calza.
 */
export function matchPlace(
  region: string | null | undefined,
  text: string | null | undefined,
): { city: string; commune: string | null } | null {
  if (!text) return null;
  const raw = normalizePlaceText(text);
  const comunaAlias = COMUNA_ALIASES[raw];
  const t = CITY_ALIASES[raw] ?? raw;
  // Primero la ciudad: "Santiago" a secas es la ciudad, no la comuna Santiago.
  const city = comunaAlias ? undefined : citiesOf(region).find((c) => normalizePlaceText(c.name) === t);
  if (city) return { city: city.name, commune: city.comunas.length === 1 ? city.comunas[0] : null };
  const wanted = comunaAlias ?? t;
  for (const c of citiesOf(region)) {
    const comuna = c.comunas.find((x) => normalizePlaceText(x) === wanted);
    if (comuna) return { city: c.name, commune: comuna };
  }
  return null;
}

/**
 * Valida y completa una ubicación: la ciudad debe ser de la región y la comuna
 * de la ciudad. Si viene solo la comuna, deduce la ciudad; si la ciudad tiene
 * una sola comuna, la completa. Devuelve un mensaje de error si no calza.
 */
export function resolvePlace(
  region: string | null | undefined,
  city: string | null | undefined,
  commune: string | null | undefined,
): { city: string | null; commune: string | null } | { error: string } {
  const cityIn = city?.trim() || null;
  const communeIn = commune?.trim() || null;
  if (!cityIn && !communeIn) return { city: null, commune: null };
  if (!region || !CHILE_CITIES[region as ChileRegion]) {
    return { error: 'Elige primero la región.' };
  }
  if (communeIn) {
    const owner = cityOfComuna(region, communeIn);
    if (!owner) return { error: `La comuna "${communeIn}" no es de esa región.` };
    if (cityIn && cityIn !== owner) {
      return { error: `La comuna "${communeIn}" no es de la ciudad "${cityIn}".` };
    }
    return { city: owner, commune: communeIn };
  }
  const c = citiesOf(region).find((x) => x.name === cityIn);
  if (!c) return { error: `La ciudad "${cityIn}" no es de esa región.` };
  return { city: c.name, commune: c.comunas.length === 1 ? c.comunas[0] : null };
}

/** Texto para mostrar: "Ñuñoa, Santiago" · "Talca" · "Gran Valparaíso". */
export function placeLabel(city: string | null | undefined, commune: string | null | undefined): string {
  if (commune && city && commune !== city) return `${commune}, ${city}`;
  return commune || city || '';
}
