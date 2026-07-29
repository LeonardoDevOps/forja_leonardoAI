# Plan 007: Eliminar los 33 avisos ESLint y bloquear su regresión

> **Instrucciones para el ejecutor**: ejecuta este plan después de 005 y 006.
> Sigue cada paso y verifica el resultado. Si ocurre una condición de parada,
> detente e informa. Al terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat c9025b99a76950a659c6bd6c731d63073394a12c..HEAD -- eslint.config.js package.json scripts/deploy-check.ts src/admin/views/conversations.ts src/agent.ts src/campaigns.ts src/channels/shared.ts src/channels/telegram.ts src/flywheel/apply.ts src/index.ts src/integrations/calcom.ts src/llm/provider.ts src/media/transcribe.ts src/tools/index.ts src/tools/scheduleAppointment.ts src/tools/searchKb.ts test/admin/inbox.test.ts test/agent.media.test.ts test/agent.test.ts test/campaigns.test.ts test/channels/telegram.test.ts test/index.test.ts test/integrations/calcom.test.ts test/media/transcribe.test.ts test/tools/index.test.ts test/tools/scheduleAppointment.test.ts test/tools/searchKb.test.ts`
> Los cambios esperados de 005/006 deben reconciliarse con este plan. Cualquier
> otra discrepancia material es condición de parada.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: L
- **Riesgo**: MED
- **Depende de**:
  `plans/005-migrar-agents-0-3-supply-chain.md`,
  `plans/006-endurecer-egress-medios-dns.md`
- **Categoría**: tech-debt, dx
- **Planificado en**: commit `c9025b9`, 2026-07-29

## Por qué importa

ESLint termina sin errores, pero emite 33 avisos heredados, todos por
`@typescript-eslint/no-explicit-any`. Los avisos se concentran en límites de
red, SDKs y el bucle del agente, precisamente donde perder el tipo oculta
payloads malformados y cambios de API. El objetivo no es silenciar la regla:
es reemplazar `any` por tipos reales o `unknown` validado y convertir el lint
en una puerta de cero avisos.

## Estado actual

`corepack pnpm@10.34.5 lint` termina en exit 0 con 0 errores y 33 avisos:

| Archivo                            | Líneas                            | Avisos |
| ---------------------------------- | --------------------------------- | -----: |
| `scripts/deploy-check.ts`          | 54, 55                            |      2 |
| `src/admin/views/conversations.ts` | 165, 225, 230                     |      3 |
| `src/agent.ts`                     | 214, 321, 344, 353, 370, 380, 387 |      7 |
| `src/campaigns.ts`                 | 39                                |      1 |
| `src/channels/shared.ts`           | 23, 24, 25                        |      3 |
| `src/channels/telegram.ts`         | 26                                |      1 |
| `src/flywheel/apply.ts`            | 20                                |      1 |
| `src/index.ts`                     | 54, 123, 164                      |      3 |
| `src/integrations/calcom.ts`       | 89, 137                           |      2 |
| `src/llm/provider.ts`              | 92                                |      1 |
| `src/media/transcribe.ts`          | 18, 21, 24                        |      3 |
| `src/tools/index.ts`               | 20                                |      1 |
| `src/tools/scheduleAppointment.ts` | 31, 33                            |      2 |
| `src/tools/searchKb.ts`            | 23, 28, 34                        |      3 |

Patrones relevantes:

```ts
// src/channels/shared.ts
parseIncoming(request: Request, env: any): Promise<IncomingMessage>;
sendReply(reply: OutgoingReply, env: any): Promise<void>;

// src/campaigns.ts
const data = (await res.json()) as { contents?: any[] };

// src/agent.ts
const aiMessages: any[] = history.map(...);
const attempt = async (m: any) => streamText(...);

// src/media/transcribe.ts
const result = await env.AI.run("..." as any, { audio: base64 } as any);
return { text: (result as any).text ?? "" };
```

- `eslint.config.js` degrada las reglas recomendadas a warning y configura
  explícitamente `no-explicit-any: "warn"` en TypeScript de producción.
- En `test/**/*.ts`, `no-explicit-any` está apagada deliberadamente para dobles
  ligeros de Cloudflare/SDKs. Esa excepción de tests no forma parte de los 33
  avisos y se conserva.
- `package.json` usa `"lint": "eslint ."`, por lo que un nuevo warning no falla
  CI.

## Principios de implementación

- En entradas JSON, errores capturados y respuestas de SDK, usar `unknown` y
  validar antes de leer propiedades.
- En D1, usar los genéricos de `Db.all<T>()`/`first<T>()`, no `any`.
- En APIs internas, importar `Env`, `ModelMessage`, `LanguageModel`, tool/result
  types u otros tipos públicos reales.
- Si los tipos de Workers AI no declaran un modelo soportado en runtime, crear
  una interfaz local mínima y hacer un único puente
  `unknown as NarrowBinding`; nunca propagar `any`.
- No sustituir `any` por `unknown as SomeType` sin validación en un límite
  externo.
- No añadir `eslint-disable`, no apagar reglas y no excluir archivos.

## Comandos necesarios

| Propósito     | Comando                                                                                                                                                                                                                                                                                                                                  | Resultado esperado                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Línea base    | `corepack pnpm@10.34.5 lint`                                                                                                                                                                                                                                                                                                             | 33 warnings antes; 0 después                                                      |
| Contar patrón | `rg -n "\bany\b" scripts/deploy-check.ts src`                                                                                                                                                                                                                                                                                            | sin `any` explícitos de producción al terminar, salvo texto justificado no tipado |
| Tipos         | `corepack pnpm@10.34.5 typecheck`                                                                                                                                                                                                                                                                                                        | exit 0                                                                            |
| Tests focales | `corepack pnpm@10.34.5 test -- test/admin/inbox.test.ts test/agent.media.test.ts test/agent.test.ts test/campaigns.test.ts test/channels/telegram.test.ts test/index.test.ts test/integrations/calcom.test.ts test/media/transcribe.test.ts test/tools/index.test.ts test/tools/scheduleAppointment.test.ts test/tools/searchKb.test.ts` | todos pasan                                                                       |
| Suite CI      | `corepack pnpm@10.34.5 check:ci`                                                                                                                                                                                                                                                                                                         | exit 0, cero warnings                                                             |

## Alcance

**Dentro del alcance — únicos archivos modificables:**

- `eslint.config.js`
- `package.json`
- `scripts/deploy-check.ts`
- los 14 archivos `src/` enumerados en «Estado actual»
- los tests focales enumerados en la tabla de comandos
- `plans/README.md`

**Fuera de alcance:**

- Activar `no-explicit-any` en tests o tipar todos los dobles de prueba.
- Cambiar respuestas HTTP, HTML, prompts, modelos, herramientas o reglas de
  negocio.
- Añadir una dependencia solo para obtener un tipo trivial.
- Usar `eslint-disable`, `@ts-ignore`, `@ts-nocheck` o casts a `any`.
- Tocar `member/`, `wrangler.toml`, secretos, despliegues o publicación npm.

## Flujo Git

- Rama: `advisor/007-zero-eslint-warnings`, creada sobre 005 y 006.
- Commits sugeridos:
  - `refactor(types): validate external boundaries`
  - `refactor(types): type agent and tool execution`
  - `ci(lint): enforce zero warnings`
- No publicar ni abrir PR salvo instrucción expresa.

## Pasos

### Paso 1: Congelar el inventario de 33 avisos

Ejecuta lint y guarda la salida fuera del repositorio. Comprueba que la regla,
archivos y conteos coinciden con la tabla. Si 005/006 ya resolvieron avisos,
resta solo los realmente presentes y documenta la diferencia; no reintroduzcas
`any` para reproducir la línea base.

**Verificar**:
la suma de avisos observados está explicada y no hay reglas distintas con
warnings no inventariados.

### Paso 2: Tipar contratos internos y persistencia

- `src/channels/shared.ts`: sustituye `env: any` por `Env` en
  `ChannelAdapter`.
- `src/admin/views/conversations.ts`: declara interfaces de fila para cada
  consulta y pásalas a `all<T>`/`first<T>`.
- `src/tools/index.ts`: usa el tipo de definición/registro de tools que consume
  `streamText`, o un contrato estructural mínimo con `unknown`.
- `src/flywheel/apply.ts`: reemplaza el payload mutable `any` por una interfaz
  con propiedades opcionales y discriminadas.
- `scripts/deploy-check.ts`: usa `process.argv` y tipos estándar de Node; no
  mutar/castear el objeto global `process`.

No debe cambiar ninguna rama de ejecución.

**Verificar**:

```powershell
corepack pnpm@10.34.5 typecheck
corepack pnpm@10.34.5 lint
```

El conteo de warnings debe bajar exactamente en los archivos de este paso.

### Paso 3: Validar respuestas JSON y errores externos

- `src/campaigns.ts`: define el shape mínimo de Content API y valida que
  `contents` sea array antes de mapearlo.
- `src/channels/telegram.ts`: trata `res.json()` como `unknown`; valida `ok`,
  `result.file_path` y sus tipos.
- `src/index.ts`: captura como `unknown` y valida el body antes de pasarlo a
  parsers de Meta/WhatsApp. Conserva los status codes actuales.
- `src/integrations/calcom.ts`: catches `unknown` y helper seguro para mensaje.
- `src/tools/scheduleAppointment.ts` y `src/tools/searchKb.ts`: usa resultados
  tipados/validados; un payload inesperado debe seguir el fallback existente.
- `src/media/transcribe.ts`: define un contrato local mínimo
  `{ text?: string }`, valida el resultado de Workers AI y conserva texto vacío
  cuando no exista. Integra la firma de política creada en el plan 006.

Añade/ajusta pruebas para JSON vacío, propiedad con tipo incorrecto, excepción
no-`Error` y happy path. Las pruebas deben afirmar la conducta anterior, no una
nueva respuesta.

**Verificar**:
tests focales de campañas, Telegram, index, Cal.com, media y tools pasan.

### Paso 4: Tipar el bucle de agente y proveedor LLM

Trabaja sobre el `src/agent.ts` ya migrado por 005:

- `aiMessages` debe usar `ModelMessage[]` o el tipo público exacto de AI SDK 6;
- el argumento de `attempt` debe usar el tipo de modelo aceptado por
  `streamText`;
- los tool calls deben usar el tipo inferido de `result.steps`, sin callbacks
  `tc: any`;
- todos los catches deben ser `unknown` y formatearse mediante un helper seguro;
- `src/llm/provider.ts` debe devolver/almacenar el tipo público de modelo de AI
  SDK, conservando provider y model ID.

No uses un union inventado si el SDK exporta el tipo. Si la exportación cambió
con `agents 0.3.10`, toma el tipo de la versión instalada y añade una prueba de
tipos indirecta mediante `typecheck`.

**Verificar**:
`typecheck`, `test/agent.media.test.ts` y `test/agent.test.ts` pasan; lint ya no
señala `src/agent.ts` ni `src/llm/provider.ts`.

### Paso 5: Convertir cero avisos en una puerta

Cuando lint esté completamente limpio:

- cambia `@typescript-eslint/no-explicit-any` a `"error"` para producción;
- conserva la excepción documentada de `test/**/*.ts`;
- cambia el script `lint` a `eslint . --max-warnings 0`.

No promociones todas las reglas recomendadas a error en este plan; la puerta
`--max-warnings 0` ya impide cualquier warning nuevo y evita ampliar el alcance
del refactor.

**Verificar**:

```powershell
corepack pnpm@10.34.5 lint
corepack pnpm@10.34.5 lint 2>&1 | Select-String "warning|error"
```

El primer comando sale 0 y el segundo no muestra diagnósticos ESLint.

### Paso 6: Validar comportamiento completo

Ejecuta tests focales, CI local y revisión de diff. Comprueba que los cambios
son de tipos/validación defensiva y que no se añadieron asserts permisivos.

**Verificar**:

```powershell
corepack pnpm@10.34.5 check:ci
git diff --check
git diff --name-only
rg -n "eslint-disable|@ts-ignore|@ts-nocheck|as any|: any\b|<any>" eslint.config.js scripts src
```

`check:ci` y `git diff --check` salen 0. La última búsqueda no devuelve
supresiones o `any` explícitos nuevos.

## Plan de pruebas

- Modela tests de respuesta JSON sobre los existentes del mismo módulo.
- Añade casos negativos solo donde ahora se valida `unknown`.
- Conserva pruebas de integración de `SupportAgent`, canales y rutas.
- No añadas snapshots grandes; afirma status, llamadas, valores persistidos y
  fallbacks.
- La garantía de tipo final es `tsc --noEmit` sobre Node 20 y 22 en CI.

## Criterios de terminado

- [ ] `corepack pnpm@10.34.5 lint` produce 0 errores y 0 warnings.
- [ ] `no-explicit-any` es error en producción y sigue apagada solo en tests.
- [ ] El script lint incluye `--max-warnings 0`.
- [ ] No existen supresiones ESLint/TypeScript nuevas.
- [ ] Todo JSON externo se trata como `unknown` antes de validar.
- [ ] `typecheck`, tests focales y `check:ci` pasan.
- [ ] No cambian contratos funcionales ni archivos fuera de alcance.
- [ ] `plans/README.md` marca el plan como completado.

## Condiciones de parada

Detente e informa si:

- 005 o 006 no están completados y `agent.ts`/media conservan APIs antiguas;
- eliminar un warning exige cambiar un contrato público o comportamiento;
- el SDK no exporta un tipo usable y el único workaround probado requiere
  `any` o una supresión;
- aparecen warnings de otra regla que requieren un refactor no descrito;
- una verificación falla dos veces tras un arreglo razonable;
- sería necesario tocar `member/`, secretos, `wrangler.toml` o desplegar.

## Notas de mantenimiento

- Toda nueva excepción de lint debe requerir justificación y plan propio; este
  plan deja una base de cero avisos.
- El revisor debe buscar casts dobles que solo oculten una incompatibilidad,
  especialmente en Workers AI y AI SDK.
- Una futura tarea puede tipar más estrictamente los dobles de tests, pero no es
  necesaria para proteger producción.
