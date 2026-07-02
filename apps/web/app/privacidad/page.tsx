import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidad · Nectason',
  description:
    'Cómo Nectason recopila, usa y protege tus datos, incluyendo las integraciones con Spotify, YouTube y Google.',
};

/** Página pública de política de privacidad (requisito para integraciones OAuth). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-200">
      <h1 className="text-3xl font-bold">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Última actualización: julio de 2026 · Nectason (nectason.app)
      </p>

      <Section title="1. Quiénes somos">
        Nectason es una plataforma para la comunidad de baile social latino
        (bachata y salsa). Permite a DJs y organizadores gestionar su música,
        catálogos y playlists, y conectar cuentas externas (Spotify, YouTube) de
        forma opcional para organizar su contenido.
      </Section>

      <Section title="2. Qué datos recopilamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Cuenta:</b> nombre, correo electrónico, ciudad, rol y preferencias
            que ingresas o que obtenemos al iniciar sesión con Google.
          </li>
          <li>
            <b>Contenido musical:</b> canciones, catálogos y playlists que creas o
            importas dentro de la plataforma.
          </li>
          <li>
            <b>Integraciones (opcionales):</b> si conectas Spotify o YouTube,
            guardamos un token de acceso para leer tus playlists y, con tu
            permiso, crear playlists en tu cuenta. No guardamos tu contraseña de
            esas plataformas.
          </li>
        </ul>
      </Section>

      <Section title="3. Uso de datos de Spotify">
        Cuando conectas tu cuenta de Spotify, usamos la Spotify Web API únicamente
        para:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Leer las playlists de tu cuenta y sus canciones, para mostrarlas y compararlas con tu catálogo dentro de Nectason.</li>
          <li>Crear playlists en tu cuenta de Spotify a partir de las playlists que armaste en Nectason (solo cuando tú lo solicitas).</li>
          <li>Leer tu perfil básico (nombre, email, tipo de cuenta) para identificar la conexión.</li>
        </ul>
        <p className="mt-2">
          No modificamos ni eliminamos tu contenido de Spotify salvo la acción que
          tú inicias explícitamente. No usamos tus datos de Spotify para
          publicidad, no los vendemos ni los compartimos con terceros. Los datos
          de Spotify se usan solo dentro de tu cuenta de Nectason.
        </p>
      </Section>

      <Section title="4. Uso de datos de YouTube / Google">
        Si conectas YouTube (mediante Google OAuth), usamos la YouTube Data API
        para leer y, con tu permiso, crear playlists en tu cuenta. El uso de datos
        de la API de YouTube se rige también por la{' '}
        <a
          className="text-brand hover:underline"
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          Política de Privacidad de Google
        </a>
        . El inicio de sesión con Google se usa solo para autenticarte.
      </Section>

      <Section title="5. Cómo protegemos y conservas tus datos">
        Los tokens de las integraciones se almacenan de forma segura en nuestros
        servidores y se usan solo para las funciones descritas. Conservamos tus
        datos mientras tu cuenta esté activa. Puedes solicitar la eliminación de
        tu cuenta y datos escribiéndonos.
      </Section>

      <Section title="6. Cómo desconectar o revocar el acceso">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            En Nectason: entra a la sección de Spotify o YouTube y usa{' '}
            <b>Desconectar</b>. Eso elimina el token guardado.
          </li>
          <li>
            En Spotify: puedes revocar el acceso de la app en{' '}
            <a
              className="text-brand hover:underline"
              href="https://www.spotify.com/account/apps/"
              target="_blank"
              rel="noreferrer"
            >
              spotify.com/account/apps
            </a>
            .
          </li>
          <li>
            En Google: en{' '}
            <a
              className="text-brand hover:underline"
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              myaccount.google.com/permissions
            </a>
            .
          </li>
        </ul>
      </Section>

      <Section title="7. Terceros">
        Usamos proveedores de infraestructura (hosting y base de datos) para operar
        el servicio. No vendemos tus datos personales. Las integraciones con
        Spotify y YouTube se rigen además por sus propias políticas y términos.
      </Section>

      <Section title="8. Cambios">
        Podemos actualizar esta política. Publicaremos la versión vigente en esta
        página con su fecha de actualización.
      </Section>

      <Section title="9. Contacto">
        Para dudas sobre privacidad o para solicitar la eliminación de tus datos,
        escríbenos a{' '}
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
