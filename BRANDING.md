# BRANDING.md — Nectason

> Guía de marca para el desarrollo. Claude Code debe respetar estos tokens
> y convenciones en todo el código de UI (web y móvil). No improvisar colores,
> nombres ni estilos fuera de lo aquí definido.

---

## Marca

- **Nombre:** Nectason
- **Escritura:** siempre `Nectason` (una palabra, N mayúscula). En el logotipo
  se estiliza como `necta` + `son`, con la segunda mitad en color de acento.
- **Tagline:** "Conecta. Baila. Vive."
- **Descriptor:** plataforma del baile social latino (bachata y salsa) en Chile.
- **Idioma de producto:** español (Chile). Lenguaje de dominio en español.

---

## Logo

- **Archivo:** silueta de pareja de baile latino en posición cerrada, color sólido.
- **Color oficial del logo:** `#1A7A4E` (Son).
- **Sobre fondo oscuro:** usar la versión en `#4EC990` (Clave) para que resalte.
- **Formato:** PNG con transparencia (y SVG si está disponible).
- **Ubicación en el repo:** ver sección "Assets" más abajo.
- **Zona de respeto:** mantener un padding mínimo equivalente al 15% del alto
  del logo en todos los lados. No pegar el logo al borde.
- **Ícono de app:** recortar solo el torso superior de la pareja (cabezas juntas)
  sobre fondo Selva `#0D1F1A` — más legible a tamaño pequeño que la figura completa.

### No hacer
- No distorsionar, rotar ni aplicar efectos (sombras, contornos, glow).
- No cambiar el color del logo fuera de los dos hex aprobados.
- No colocar el logo sobre fondos de bajo contraste.

---

## Paleta de color

| Token        | Nombre  | Hex       | Uso                                              |
|--------------|---------|-----------|--------------------------------------------------|
| `--selva`    | Selva   | `#0D1F1A` | Fondo principal (modo oscuro), fondo de íconos   |
| `--son`      | Son     | `#1A7A4E` | Color del logo, botones primarios, acentos fuertes |
| `--clave`    | Clave   | `#4EC990` | Acento brillante, logo sobre oscuro, highlights  |
| `--nectar`   | Néctar  | `#B6F0D0` | Acentos suaves, estados hover, detalles          |
| `--sabor`    | Sabor   | `#E8F5E2` | Texto sobre oscuro, fondos muy claros            |

### Neutros sugeridos (completar según diseño)
| Token            | Hex       | Uso                          |
|------------------|-----------|------------------------------|
| `--bg`           | `#0D1F1A` | Fondo app (modo oscuro)      |
| `--surface`      | `#13291F` | Tarjetas, superficies        |
| `--border`       | `#244536` | Bordes sutiles               |
| `--text`         | `#E8F5E2` | Texto principal sobre oscuro |
| `--text-muted`   | `#7BAF8E` | Texto secundario             |

### Tokens CSS (web — Next.js / Tailwind)
```css
:root {
  --selva:  #0D1F1A;
  --son:    #1A7A4E;
  --clave:  #4EC990;
  --nectar: #B6F0D0;
  --sabor:  #E8F5E2;
}
```

### Tailwind (extend theme)
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        selva:  '#0D1F1A',
        son:    '#1A7A4E',
        clave:  '#4EC990',
        nectar: '#B6F0D0',
        sabor:  '#E8F5E2',
      },
    },
  },
};
```

> Nota de implementación: el web usa **Tailwind v4 (config CSS-first)**. Los tokens
> viven en `apps/web/app/globals.css` dentro del bloque `@theme` como
> `--color-selva`, `--color-son`, etc. El token de marca `--color-brand` apunta a
> Son (`#1A7A4E`) para conservar las clases `bg-brand`/`text-brand` existentes.

### Tokens para React Native (Expo)
```ts
// theme/colors.ts
export const colors = {
  selva:  '#0D1F1A',
  son:    '#1A7A4E',
  clave:  '#4EC990',
  nectar: '#B6F0D0',
  sabor:  '#E8F5E2',
} as const;
```

---

## Tipografía

> Si aún no hay fuente definida, usar una sans-serif geométrica y legible.
> Recomendadas (Google Fonts, libres): **Inter**, **Plus Jakarta Sans** o **Onest**.
> El logotipo usa peso medium (500) con tracking ligeramente negativo (-0.02em).
>
> Implementado en web: **Plus Jakarta Sans** vía `next/font/google`.

| Estilo      | Peso | Tamaño ref. | Uso                            |
|-------------|------|-------------|--------------------------------|
| Display     | 500  | 40px        | Títulos de página, hero        |
| Heading     | 500  | 26px        | Secciones                      |
| Subheading  | 500  | 20px        | Subtítulos                     |
| Body        | 400  | 16px        | Texto general                  |
| Caption     | 400  | 12px        | Etiquetas, metadatos           |

- Tracking del logotipo y display: `-0.02em`.
- No usar más de un peso por encima de 600; la marca es limpia, no pesada.

---

## Voz y tono

- Cercano, de la comunidad, pero claro y confiable (se manejan pagos reales).
- Español de Chile, sin caer en exceso de modismos.
- Términos de dominio en español: Evento, Social, Solicitud, Sala, BloqueHorario,
  Entrada, Crédito. Mantener consistencia con el `CLAUDE.md` del proyecto.

---

## Assets — estructura sugerida en el monorepo

```
/assets/brand/
  nectason-logo.png          # logo completo, #1A7A4E, transparente
  nectason-logo-dark.png     # versión #4EC990 para fondos oscuros
  nectason-logo.svg          # vectorial (si disponible)
  nectason-icon.png          # ícono app (torso superior, fondo Selva)
  nectason-wordmark.svg      # solo logotipo "nectason" (opcional)

# Consumido por:
#   apps/web/public/brand/        (Next.js)
#   apps/mobile/assets/brand/     (Expo)
```

- En **Next.js**: colocar en `apps/web/public/brand/` y referenciar con `/brand/...`.
- En **Expo**: colocar en `apps/mobile/assets/brand/` y registrar el ícono de app
  en `app.json` (`expo.icon` y `expo.android.adaptiveIcon`).
- Mantener un único set de assets en `/assets/brand/` como fuente de verdad y
  copiarlo/symlinkarlo a cada app, para no duplicar versiones divergentes.

---

## Checklist al construir UI

- [ ] Usa los tokens de color, nunca hex sueltos en componentes.
- [ ] Botón primario = `--son`; hover/acento = `--clave`.
- [ ] Fondo de app en modo oscuro = `--selva`.
- [ ] Logo en color oficial `#1A7A4E` (o `#4EC990` sobre oscuro).
- [ ] Respeta la zona de respeto del logo.
- [ ] Tipografía con un solo peso fuerte (500), tracking -0.02em en títulos.
