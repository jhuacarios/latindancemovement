import Link from 'next/link';

export const metadata = {
  title: 'Términos y Condiciones · Nectason',
  description:
    'Términos de uso del servicio Nectason, incluyendo las integraciones con Spotify, YouTube y Google.',
};

/** Página pública de términos y condiciones (requisito para integraciones OAuth). */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-200">
      <h1 className="text-3xl font-bold">Términos y Condiciones</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Última actualización: julio de 2026 · Nectason (nectason.app)
      </p>

      <Section title="1. Aceptación">
        Al crear una cuenta o usar Nectason (el “Servicio”) aceptas estos
        Términos y nuestra{' '}
        <Link className="text-brand hover:underline" href="/privacidad">
          Política de Privacidad
        </Link>
        . Si no estás de acuerdo, no uses el Servicio.
      </Section>

      <Section title="2. Qué es Nectason">
        Nectason es una plataforma para la comunidad de baile social latino
        (bachata y salsa) que permite a DJs, profesores y organizadores gestionar
        su música, catálogos y playlists, y —de forma opcional— conectar cuentas
        externas (Spotify, YouTube) para organizar su contenido.
      </Section>

      <Section title="3. Tu cuenta">
        Eres responsable de la actividad de tu cuenta y de mantener seguras tus
        credenciales. Debes proporcionar información veraz. Puedes cerrar tu
        cuenta cuando quieras.
      </Section>

      <Section title="4. Uso aceptable">
        <ul className="list-disc space-y-1 pl-5">
          <li>No uses el Servicio para actividades ilegales ni para infringir derechos de terceros (incluidos derechos de autor).</li>
          <li>No intentes vulnerar, sobrecargar o interferir con el Servicio ni con las APIs de terceros que usa.</li>
          <li>Eres responsable del contenido que subes o gestionas y de tener los derechos para usarlo en tus eventos.</li>
        </ul>
      </Section>

      <Section title="5. Integraciones con terceros (Spotify, YouTube/Google)">
        Las integraciones son opcionales. Al conectarlas, autorizas a Nectason a
        usar sus APIs solo para las funciones descritas en la Política de
        Privacidad (leer tus playlists y, a tu solicitud, crear playlists en tu
        cuenta). Tu uso de esas plataformas se rige además por sus propios
        términos:{' '}
        <a
          className="text-brand hover:underline"
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noreferrer"
        >
          Términos de YouTube
        </a>
        {' '}y los Términos de Spotify. Puedes desconectarlas en cualquier momento
        desde Nectason o desde tu cuenta de Google/Spotify.
      </Section>

      <Section title="6. Contenido y propiedad">
        Nectason y su software son propiedad de sus titulares. Tú conservas los
        derechos sobre el contenido que aportas. El catálogo y la curaduría dentro
        de la plataforma se usan para prestarte el Servicio.
      </Section>

      <Section title="7. Servicio “tal cual” y responsabilidad">
        El Servicio se ofrece “tal cual”, sin garantías. En la medida permitida
        por la ley, Nectason no será responsable por daños indirectos o
        derivados del uso o la imposibilidad de uso del Servicio, ni por fallas o
        cambios en las APIs de terceros (Spotify, YouTube, Google).
      </Section>

      <Section title="8. Cambios">
        Podemos actualizar el Servicio y estos Términos. Publicaremos la versión
        vigente en esta página con su fecha. El uso continuado implica aceptación.
      </Section>

      <Section title="9. Contacto">
        Para consultas sobre estos Términos, escríbenos a{' '}
        <a className="text-brand hover:underline" href="mailto:jhuacarios@gmail.com">
          jhuacarios@gmail.com
        </a>
        .
      </Section>

      <div className="mt-10 border-t border-neutral-800 pt-6 text-sm">
        <Link href="/" className="text-brand hover:underline">
          ← Volver a Nectason
        </Link>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-neutral-300">{children}</div>
    </section>
  );
}
