'use client';

import { Input } from './ui';

/** Input de búsqueda con botón ✕ para limpiar lo escrito. */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        className="pr-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          title="Limpiar"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-200"
        >
          ✕
        </button>
      )}
    </div>
  );
}
