'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { EMPTY_ACADEMY, academiesApi, validateAcademy, type AcademyFormValues } from '@/lib/academies';
import { AcademyForm } from '@/components/academy-form';
import { LogoPicker } from '@/components/academy-logo-picker';
import { Card } from '@/components/ui';

export default function NewAcademyPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [values, setValues] = useState<AcademyFormValues>(EMPTY_ACADEMY);
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const err = validateAcademy(values);
    if (err) return setError(err);
    setBusy(true);
    setError(null);
    try {
      const a = await academiesApi.create(values, logo);
      await qc.invalidateQueries({ queryKey: ['academies'] });
      router.push(`/academies/${a.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la academia.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/academies" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Academias
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Crear academia</h1>
        <p className="text-sm text-neutral-400">
          Quedas como dueño. Después puedes agregar profesores, publicar el horario y subir los videos de las clases.
        </p>
      </div>
      <Card>
        <AcademyForm
          values={values}
          onChange={setValues}
          onSubmit={save}
          onCancel={() => router.push('/academies')}
          submitLabel="Crear academia"
          busy={busy}
          error={error}
          logoSlot={<LogoPicker file={logo} onChange={setLogo} />}
        />
      </Card>
    </div>
  );
}
