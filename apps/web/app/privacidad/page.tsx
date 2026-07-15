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
            guardamos únicamente un <b>token de acceso</b> para mantener la
            conexión. No guardamos tu contraseña ni el <b>contenido</b> de esas
            cuentas (tus playlists, videos, historial): ese contenido se lee en
            el momento para mostrártelo o para la acción que solicitas, y no se
            almacena en Nectason.
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
        Si conectas tu cuenta de YouTube (mediante Google OAuth), usamos los{' '}
        <b>YouTube API Services</b> únicamente para:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Leer las playlists de tu cuenta de YouTube para mostrártelas y compararlas con tu catálogo dentro de Nectason.</li>
          <li>Crear playlists en tu canal de YouTube a partir de las que armaste en Nectason (solo cuando tú lo solicitas explícitamente).</li>
        </ul>
        <p className="mt-2">
          <b>No almacenamos datos de tu cuenta de YouTube.</b> No guardamos tus
          playlists, videos ni historial: se leen en el momento y se muestran.
          Lo único que conservamos es el token de acceso para mantener la
          conexión, que se elimina apenas usas <b>Desconectar</b>. No modificamos
          ni eliminamos contenido de tu YouTube salvo la acción que tú inicias.
          No usamos datos de YouTube para publicidad, no los vendemos ni los
          transferimos a terceros.
        </p>
        <p className="mt-2">
          El uso y la transferencia de la información recibida de las APIs de
          Google por parte de Nectason se ajustan a la{' '}
          <a
            className="text-brand hover:underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , incluidos sus requisitos de <b>Uso Limitado (Limited Use)</b>. Al usar
          la integración de YouTube aceptas los{' '}
          <a
            className="text-brand hover:underline"
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer"
          >
            Términos de Servicio de YouTube
          </a>{' '}
          y la{' '}
          <a
            className="text-brand hover:underline"
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Política de Privacidad de Google
          </a>
          . El inicio de sesión con Google se usa solo para autenticarte (nombre
          y correo); no accede a tu YouTube.
        </p>
        <p className="mt-2">
          Puedes revocar el acceso de Nectason a tu cuenta de Google/YouTube en
          cualquier momento desde{' '}
          <a
            className="text-brand hover:underline"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            la página de permisos de seguridad de Google
          </a>
          .
        </p>
      </Section>

      <Section title="5. Cómo protegemos y conservamos tus datos">
        Los tokens de las integraciones se almacenan de forma segura en nuestros
        servidores y se usan solo para las funciones descritas. Los datos que
        conservamos mientras tu cuenta esté activa son los <b>internos de
        Nectason</b> (tu curaduría: canciones seleccionadas, tu biblioteca y tus
        playlists armadas en la plataforma). Los datos de las cuentas de YouTube
        o Spotify <b>no se conservan</b> (solo el token de conexión). Puedes
        solicitar la eliminación de tu cuenta y datos escribiéndonos.
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

      <div className="mt-10 flex gap-4 border-t border-neutral-800 pt-6 text-sm">
        <Link href="/" className="text-brand hover:underline">
          ← Volver a Nectason
        </Link>
        <Link href="/terminos" className="text-brand hover:underline">
          Términos y Condiciones
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
