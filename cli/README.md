# forjabot

**Chatbots de IA para tu negocio, desde tu terminal.** `forjabot` instala y mantiene
bots de IA por giro (restaurante, barbería, inmobiliaria, clínica…) en **tu propia
cuenta de Cloudflare**, con **tus llaves**. El bot es tuyo — para usarlo o revenderlo.

Pensado para que lo maneje tu **agente de IA** (Claude Code o Codex): tú respondes
preguntas de negocio y apruebas; el agente corre lo técnico.

> Parte de [Forja](https://horizontesia.com), la plataforma de chatbots de Horizontes IA.

---

## Instalación

No necesitas instalar nada global. Se corre con `npx`:

```bash
npx forjabot init
```

Requisitos:

- **Node 20–24** (para `npx`).
- Una cuenta **gratis de Cloudflare** (ahí vive tu bot).
- Un **agente de IA** — [Claude Code](https://claude.com/claude-code) o Codex — para ejecutar los pasos.
- Una **llave de IA** (Anthropic, OpenAI o xAI). Se guarda como _secreto de Cloudflare_, nunca en el CLI.

## Inicio rápido

```bash
# 1 · asistente: elige idioma, licencia (gratis o Forja+) y giro
npx forjabot init

# 2 · verifica que todo esté sano
npx forjabot doctor

# 3 · mantente al día cuando saquemos mejoras (sin perder tu configuración)
npx forjabot update
```

`init` baja la plantilla del giro que elijas y te hace unas preguntas del negocio.
Al terminar, tu agente despliega el bot a Cloudflare y tú abres tu panel en
`https://<tu-worker>.workers.dev/admin`.

### Tu agente aprende a usar Forja

La primera vez, `forjabot` instala una guía para tu agente en
`~/.claude/skills/forja/` (Claude Code). Con eso tu agente sabe cómo usar el CLI y el flujo
completo: instalar, configurar, desplegar y operar el bot. Puedes desactivarlo con
`--no-agent-skill` o la variable `FORJA_NO_AGENT_SKILL=1`.

## Comandos

| Comando                     | Qué hace                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `forjabot init`             | Asistente interactivo: idioma (ES/EN), licencia (gratis con tu correo o key `HZN-…`), elige el giro e instala. |
| `forjabot list`             | Muestra el catálogo de bots disponibles para tu plan.                                                          |
| `forjabot install <slug>`   | Instala un giro específico (p. ej. `restaurante`, `barberia`, `inmobiliaria`).                                 |
| `forjabot update [carpeta]` | Trae la versión nueva **conservando** tu `member/` (config, base de conocimiento).                             |
| `forjabot doctor [carpeta]` | Diagnóstico del bot instalado: versión, archivos, licencia y si el worker responde.                            |

Opciones útiles:

- `--key HZN-XXXX-XXXX-XXXX` — pasa tu licencia de Forja+ sin el asistente (`install` / `update` / `init`).
- `--email tu@correo.com` `--name "Tu Nombre"` — para el arranque gratis sin teclear (útil si tu teclado no mete la `@` en la terminal).
- Todo el onboarding acepta flags (pensado para que tu **agente** lo corra sin menús):
  `--giro --negocio --que --ofrece --horario --ubicacion --telefono --web --pagos --faq --reglas --tono --cerebro --yes`.

El asistente usa **menús con flechas** (↑/↓ + enter). Si corres en un entorno sin
terminal interactiva (CI, scripts), cae automáticamente a listas numeradas.

¿No tienes licencia de Forja+? La obtienes al **entrar a la comunidad de Horizontes IA**
([horizontesia.com](https://horizontesia.com)): ahí recibes tu llave `HZN-…`.

La licencia y el idioma se guardan en `~/.forja/config.json`. La versión instalada
vive en el marcador `.horizontes-bot.json` dentro de la carpeta de tu bot.

## Seguridad del instalador y las actualizaciones

El artefacto descargado se trata siempre como contenido no confiable:

- El servidor de licencias y el control plane deben configurarse como **orígenes
  HTTPS exactos**, sin credenciales, rutas, query ni fragmentos. Las respuestas
  sensibles no siguen redirects.
- Si el backend entrega `X-Artifact-SHA256`, el CLI verifica el hash antes de
  extraer. Un hash inválido o que no coincida detiene la instalación sin escribir
  el árbol. `FORJA_REQUIRE_ARTIFACT_INTEGRITY=1` permite exigir el header y fallar
  cerrado cuando el backend no lo entregue.
- El CLI no delega la extracción en `tar`: valida en memoria el GZIP/TAR, su
  checksum estructural y cada entrada. Rechaza rutas absolutas, `..`, rutas
  Windows, symlinks, hardlinks, tipos especiales y duplicados.
- Se aplican límites de 64 MiB comprimidos, 256 MiB expandidos, 64 MiB por archivo
  y 20 000 entradas para reducir el riesgo de archivos bomba.
- La extracción ocurre primero en una carpeta temporal física. Una instalación
  nueva se promociona completa y una actualización usa reemplazos atómicos por
  archivo, rechazando symlinks/reparse points en el destino.
- `update` preserva `wrangler.toml`, `.env*`, `.dev.vars*`,
  `member/*.local.ts`, `member/kb`, estados locales y el marcador de instalación.

**Residual explícito:** el backend de artefactos no vive en este repositorio y no
se puede confirmar aquí que publique `X-Artifact-SHA256`. Mientras no lo haga,
el CLI avisa y conserva las defensas estructurales anteriores, pero no puede
garantizar integridad criptográfica extremo a extremo. Producción debe publicar
el header y activar `FORJA_REQUIRE_ARTIFACT_INTEGRITY=1` después de verificar la
compatibilidad del contrato.

## Los comandos del agente

Una vez instalado, operas el bot pidiéndole **skills** a tu agente (no son subcomandos
de `forjabot`, son instrucciones que tu agente ejecuta sobre el bot ya instalado):

- `reporte`, `exportar`, `analiticas`, `human-in-the-loop`, `conectar-mi-ia` (conecta tu propia IA) — el día a día. _(Gratis)_
- `superpoderes` (enciende y configura los 12), `reportes` (reporte diario con tu marca), `conexiones-composio` (conecta apps: Gmail, Slack…), `voz-de-marca`, `mantenimiento`, `afinar`, `campaña`, `clonar`, `precios` — operación y ajustes. _(Forja+)_
- **Modo Agencia:** `cliente-nuevo`, `cliente-misterioso` (demo para un prospecto), `roi`, `cotizar`, `propuesta`, `cobrar` — para revender. _(Forja+)_

Le hablas normal a tu agente ("hazme el reporte del mes") y él sabe cuál usar.

## Planes

- **Gratis** — instala el bot Starter, captura leads, panel básico. Se obtiene con tu correo.
- **Forja +** — los 14 giros con sus paneles, los comandos recurrentes y el Modo Agencia.
  Se activa con una key `HZN-…`. → [Únete a Forja +](https://horizontesia.com)

La licencia se hace cumplir en la distribución: sin licencia activa no bajas bots
premium ni actualizas. **Tu bot instalado nunca se apaga por esto** — sigue corriendo.

## Documentación

Guía completa, referencia de comandos y conexiones:
**https://forjabots.com/docs/**

## Privacidad

`forjabot` corre en tu máquina. No sube tu código ni los datos de tus clientes a
Horizontes: solo valida tu licencia y baja el bot desde el control plane. El bot y
todos sus datos viven en **tu** Cloudflare, con **tus** llaves.

---

© Horizontes IA · [horizontesia.com](https://horizontesia.com)

## 🔍 ¿Es seguro? Verifícalo tú mismo

Es sano desconfiar de un `npx` que no conoces — si tu agente de IA se niega a ejecutarlo, está haciendo su trabajo. Aquí está todo lo que necesitas para comprobarlo en un minuto:

- **El código es este mismo repositorio**, carpeta [`cli/`](./bin/cli.js). Lo que se publica en npm es exactamente ese archivo: puedes leerlo completo antes de correr nada.
- **No tiene dependencias.** Cero paquetes de terceros: el `package.json` no declara ninguna. Nada que se pueda comprometer río arriba.
- **No recolecta datos tuyos.** No manda telemetría ni analíticas. Solo habla con el servidor de licencias para validar tu llave y bajar el bot, y con npm para instalarse.
- **Tu API key nunca pasa por aquí.** El CLI jamás la pide ni la guarda: va como secreto a _tu_ cuenta de Cloudflare (`wrangler secret put`).
- **Licencia MIT**, publicado por Horizontes IA.

Compruébalo con:

```bash
npm view forjabot            # autor, licencia, repositorio
npm view forjabot dist.tarball   # bájalo y léelo antes de ejecutarlo
```

Y si prefieres no usar `npx`, clona este repo y corre `node cli/bin/cli.js init` directamente.

### Por qué el CLI pide estos permisos

Los escáneres de cadena de suministro (Socket y similares) marcan las _capacidades_ de un paquete. Un instalador necesita varias por definición; aquí está para qué usa cada una, y puedes comprobarlo en [`bin/cli.js`](./bin/cli.js):

| Capacidad                        | Para qué la usa                                                                                                                                                                                                                                    | Cómo está acotada                                                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Red** (`node:http`)            | Levanta un servidor **local en 127.0.0.1** para el regreso de `forjabot login`. También consulta licencias, el control plane, la Graph API de Meta durante `doctor --whatsapp` y el Worker HTTPS que el usuario indique.                           | Los servicios propios usan orígenes HTTPS exactos y redirects bloqueados; la URL del Worker se reduce a su origen HTTPS. El servidor local usa nonce, puerto temporal y se cierra al terminar.           |
| **Shell** (`node:child_process`) | Abre el navegador y ejecuta `wrangler` para guardar secretos en TU Cloudflare.                                                                                                                                                                     | Usa `execFileSync` con argumentos separados. En Windows solo `npx wrangler` activa `shell` para resolver `npx.cmd`; el comando y los nombres de secretos son fijos. La extracción no usa shell ni `tar`. |
| **Variables de entorno**         | Únicamente las suyas: `FORJA_SERVER`, `FORJA_CLOUD`, `FORJA_GET_URL`, `FORJA_YES`, `FORJA_NO_ART`, `FORJA_NO_BROWSER`, `FORJA_NO_AGENT_SKILL`, `FORJA_REQUIRE_ARTIFACT_INTEGRITY`, `HORIZONTES_KEY`, `HORIZONTES_SERVER`, y `NO_COLOR` (estándar). | **No enumera ni adjunta el entorno.** Solo lee las variables nombradas; las credenciales recibidas se usan en su operación prevista y nunca se incluyen en el artefacto.                                 |
| **Sistema de archivos**          | Escribe la carpeta del bot, `~/.forja/` y la guía opcional `~/.claude/skills/forja/`.                                                                                                                                                              | Escrituras atómicas; destinos symlink/reparse rechazados; actualización con exclusiones explícitas para configuración, secretos locales y conocimiento del miembro.                                      |
| **Cadenas URL**                  | Servidor de licencias, app.forjabots.com, Graph API de Meta y el Worker configurado por el usuario.                                                                                                                                                | HTTPS obligatorio, sin credenciales embebidas; payloads JSON con listas blancas de campos y redirects bloqueados para llamadas autenticadas.                                                             |

Y lo más importante: **tu API key nunca pasa por el CLI**. Cuando toca guardarla, se hace con `wrangler secret put` contra _tu_ cuenta de Cloudflare — el CLI nunca la recibe, ni la escribe en disco, ni la manda a ningún lado.
