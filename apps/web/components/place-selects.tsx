'use client';

import { citiesOf, comunasOf } from '@baile-latino/types';
import { Select } from '@/components/ui';
import { clsx } from '@/components/clsx';

export interface CityCommune {
  city: string;
  commune: string;
}

/**
 * Lista de ciudades de la región. Al cambiar de ciudad se limpia la comuna (o
 * se completa sola si la ciudad tiene una sola comuna).
 *
 * Si el valor guardado no está en la lista (texto libre antiguo), se muestra
 * igual como opción marcada "revisar", para no perderlo sin aviso.
 */
export function CitySelect({
  region,
  value,
  onChange,
  className,
}: {
  region: string;
  value: CityCommune;
  onChange: (v: CityCommune) => void;
  className?: string;
}) {
  const cities = citiesOf(region);
  const legacy = value.city && !cities.some((c) => c.name === value.city);
  return (
    <Select
      value={value.city}
      disabled={!region}
      onChange={(e) => {
        const city = e.target.value;
        const c = cities.find((x) => x.name === city);
        onChange({ city, commune: c && c.comunas.length === 1 ? c.comunas[0] : '' });
      }}
      className={clsx('w-full', className)}
    >
      <option value="">{region ? 'Elige una ciudad…' : 'Elige primero la región'}</option>
      {legacy && <option value={value.city}>{value.city} (revisar)</option>}
      {cities.map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

/** Lista de comunas de la ciudad elegida. */
export function CommuneSelect({
  region,
  value,
  onChange,
  className,
}: {
  region: string;
  value: CityCommune;
  onChange: (v: CityCommune) => void;
  className?: string;
}) {
  const comunas = comunasOf(region, value.city);
  const legacy = value.commune && !comunas.includes(value.commune);
  return (
    <Select
      value={value.commune}
      disabled={comunas.length === 0}
      onChange={(e) => onChange({ city: value.city, commune: e.target.value })}
      className={clsx('w-full', className)}
    >
      <option value="">{value.city ? 'Elige una comuna…' : 'Elige primero la ciudad'}</option>
      {legacy && <option value={value.commune}>{value.commune} (revisar)</option>}
      {comunas.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
}
