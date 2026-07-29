# Plan 005: Migrar `agents` a 0.3.x y cerrar su deuda de supply chain

> **Instrucciones para el ejecutor**: sigue este plan paso a paso. Ejecuta
> cada verificación y confirma el resultado esperado antes de continuar. Si
> ocurre algo descrito en «Condiciones de parada», detente e informa; no
> improvises. Al terminar, actualiza el estado de este plan en
> `plans/README.md`, salvo que el revisor que te asignó el trabajo mantenga el
> índice.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat c9025b99a76950a659c6bd6c731d63073394a12c..HEAD -- package.json pnpm-lock.yaml src/agent.ts src/env.ts src/index.ts test/agent.test.ts test/agent.media.test.ts test/index.test.ts test/learn/endpoint.test.ts test/stubs/cloudflare-workers.ts test/stubs/cloudflare-email.ts vitest.config.ts`
> Si cambió alguno de esos archivos, compara «Estado actual» con el código
> vivo. Una discrepancia material es condición de parada.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: L
- **Riesgo**: HIGH
- **Depende de**: ninguno
- **Categoría**: migration, security
- **Planificado en**: commit `c9025b9`, 2026-07-29

## Por qué importa

El proyecto declara `agents: ^0.1.0` y el lockfile resuelve `0.1.6`, una API
pre-1.0 con tres avisos moderados directos y varias dependencias transitivas
vulnerables. La versión mínima que corrige todos los avisos directos conocidos
de `agents` es `0.3.10`. Esta migración debe tratarse como cambio de API, no
como actualización automática del lockfile: el código actual escribe
directamente en una tabla privada del SDK para implementar el debounce.

## Estado actual

- `package.json:38` contiene `"agents": "^0.1.0"`.
- `pnpm-lock.yaml` resuelve `agents@0.1.6`.
- `corepack pnpm@10.34.5 audit --audit-level low` informa:
  - 6 vulnerabilidades moderadas y 5 bajas;
  - `agents <0.3.7`: IDOR en enrutado de correo
    (`GHSA-r7x9-8ph7-w8cg`);
  - `agents <0.3.10`: dos XSS reflejados en AI Playground/OAuth
    (`GHSA-cvhv-6xm6-c3v4` y `GHSA-w5cr-2qhr-jqc5`);
  - transitivas destacadas: `uuid <11.1.1`,
    `@hono/node-server <2.0.5`, una versión antigua de `ai`, y dependencias de
    desarrollo como `esbuild`.
- La serie 0.3.x termina en `0.3.10`; no hay un parche posterior dentro de esa
  minor. Sus peers obligatorios compatibles con este repo son `ai ^6` y
  `zod ^3.25 || ^4`. `viem`, `x402`, `@ai-sdk/react` y `@ai-sdk/openai` aparecen
  como peers opcionales; no deben añadirse si el código no los usa.
- `src/agent.ts:164-177` depende de un detalle privado:

  ```ts
  const alarmAt = Date.now() + cfg.bufferMs;
  const alarmAtSec = Math.floor(alarmAt / 1000);
  void this.sql`
    INSERT OR REPLACE INTO cf_agents_schedules
      (id, callback, payload, type, time, created_at)
    VALUES
      ('msg-buffer', 'processBuffer', '{}', 'delayed', ${alarmAtSec}, unixepoch())
  `;
  await this.ctx.storage.setAlarm(alarmAt);
  ```

- La semántica funcional que debe conservarse es:
  - cada mensaje se persiste en `pendingMessages`;
  - con `bot_paused`, no se programa procesamiento;
  - una ráfaga reprograma un único procesamiento para
    `Date.now() + cfg.bufferMs`;
  - `processBuffer()` consume el lote una sola vez.
- `test/agent.media.test.ts` simula el SDK con `sql()` y
  `storage.setAlarm()`. Ese doble reproduce la implementación privada y debe
  cambiar para probar el contrato público.
- La documentación primaria del SDK describe `schedule()`,
  listado/consulta y `cancelSchedule()` como API pública. La firma exacta debe
  comprobarse en las declaraciones instaladas de `agents@0.3.10`; no se debe
  copiar la firma de la documentación más reciente si difiere.

## Comandos necesarios

| Propósito      | Comando                                                                                                                    | Resultado esperado                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Estado inicial | `git status --short`                                                                                                       | sin salida                                 |
| Instalar       | `corepack pnpm@10.34.5 install --frozen-lockfile`                                                                          | exit 0                                     |
| Actualizar     | `corepack pnpm@10.34.5 up agents@0.3.10`                                                                                   | exit 0; solo manifiesto/lockfile esperados |
| Grafo          | `corepack pnpm@10.34.5 why agents @hono/node-server uuid ai`                                                               | muestra rutas nuevas                       |
| Tipos          | `corepack pnpm@10.34.5 typecheck`                                                                                          | exit 0                                     |
| Tests focales  | `corepack pnpm@10.34.5 test -- test/agent.test.ts test/agent.media.test.ts test/index.test.ts test/learn/endpoint.test.ts` | todos pasan                                |
| Suite          | `corepack pnpm@10.34.5 check`                                                                                              | exit 0                                     |
| Auditoría      | `corepack pnpm@10.34.5 audit --audit-level moderate`                                                                       | ningún aviso directo de `agents <0.3.10`   |

## Referencias

- API pública de tareas programadas:
  `https://developers.cloudflare.com/agents/runtime/execution/schedule-tasks/`
- Avisos:
  `https://github.com/advisories/GHSA-r7x9-8ph7-w8cg`,
  `https://github.com/advisories/GHSA-cvhv-6xm6-c3v4` y
  `https://github.com/advisories/GHSA-w5cr-2qhr-jqc5`.

## Alcance

**Dentro del alcance — únicos archivos modificables:**

- `package.json`
- `pnpm-lock.yaml`
- `src/agent.ts`
- `src/env.ts`, solo si cambian genéricos públicos del SDK
- `src/index.ts`, solo si cambia la exportación/registro del Durable Object
- `test/agent.test.ts`
- `test/agent.media.test.ts`
- `test/index.test.ts`
- `test/learn/endpoint.test.ts`
- `test/stubs/cloudflare-workers.ts`
- `test/stubs/cloudflare-email.ts`
- `vitest.config.ts`, solo si la nueva versión necesita otro stub virtual
- `plans/README.md`

**Fuera de alcance:**

- `member/`, cualquier secreto y todos los valores de `wrangler.toml`.
- Desplegar, ejecutar migraciones remotas o publicar paquetes.
- Saltar a `agents` 0.4+ o a la versión `latest`; eso requiere otro plan.
- Añadir peers opcionales que el código no importe.
- Resolver avisos transitivos con `pnpm.overrides` fuera del rango semver
  declarado por el paquete consumidor.
- Cambiar el comportamiento de conversación, buffering o respuesta.

## Flujo Git

- Crear `advisor/005-agents-0-3-migration` desde el commit de trabajo actual.
- Commits revisables con estilo convencional:
  - `chore(deps): upgrade agents to 0.3.10`
  - `refactor(agent): use public scheduling API`
  - `test(agent): cover scheduler migration`
- No publicar rama ni abrir PR salvo instrucción expresa del operador.

## Pasos

### Paso 1: Capturar la línea base y el grafo vulnerable

Ejecuta instalación congelada, los tests focales, `typecheck`, `pnpm why` y la
auditoría. Guarda en la descripción del commit o PR el conteo 6 moderadas /
5 bajas y las rutas de `agents`, `@hono/node-server`, `uuid` y `ai`. No guardes
el informe dentro del repositorio.

**Verificar**:
`git status --short` debe seguir vacío después de las comprobaciones de solo
lectura.

### Paso 2: Actualizar exclusivamente a `agents@0.3.10`

Ejecuta `corepack pnpm@10.34.5 up agents@0.3.10`. Conserva un rango que no salga
de la serie 0.3; el manifiesto debe quedar en `^0.3.10` o `0.3.10`, nunca en
`latest` ni `*`. Revisa el diff del lockfile y confirma que no se añadieron
peers opcionales de pago, React o x402 sin ser usados.

Después de instalar, inspecciona las declaraciones exportadas del paquete para
`Agent`, `schedule`, listado de schedules y `cancelSchedule`. Registra las
firmas encontradas en el mensaje del commit.

**Verificar**:

```powershell
corepack pnpm@10.34.5 why agents
corepack pnpm@10.34.5 typecheck
```

Resultado esperado: `agents 0.3.10` y, como máximo, errores de tipo localizados
en los archivos de alcance.

### Paso 3: Sustituir el acceso a la tabla privada por el API público

En `SupportAgent.ingest()`:

1. conserva el retorno temprano de `bot_paused`;
2. identifica schedules retrasados cuyo callback sea `processBuffer`;
3. cancela todos esos schedules antes de crear el nuevo, para mantener un
   debounce real aunque haya residuos anteriores;
4. programa `processBuffer` para `cfg.bufferMs / 1000` segundos usando la firma
   pública confirmada en 0.3.10;
5. conserva `lastAlarmAt` como milisegundos absolutos para no cambiar el estado
   observable;
6. elimina toda escritura directa a `cf_agents_schedules` y toda llamada
   directa a `ctx.storage.setAlarm()` desde el código de aplicación.

No asumas que un ID fijo puede pasarse a `schedule()` si la declaración de
0.3.10 no lo permite. El criterio funcional es cancelar el callback pendiente
y crear uno nuevo, no conservar literalmente `msg-buffer`.

**Verificar**:

```powershell
rg -n "cf_agents_schedules|ctx\.storage\.setAlarm|INSERT OR REPLACE" src/agent.ts
corepack pnpm@10.34.5 typecheck
```

Resultado esperado: la búsqueda no encuentra esos patrones en `src/agent.ts`;
el chequeo de tipos termina en exit 0.

### Paso 4: Actualizar dobles y pruebas de la programación

Actualiza el mock de `Agent` en `test/agent.media.test.ts` para exponer solo las
operaciones públicas realmente usadas. Añade pruebas que demuestren:

- `bot_paused=1` no lista, cancela ni crea schedules;
- un mensaje sin schedule previo crea exactamente uno con el retardo esperado;
- un segundo mensaje cancela el schedule anterior antes de crear el nuevo;
- varios schedules residuales de `processBuffer` se cancelan todos;
- schedules de otros callbacks no se cancelan;
- `lastAlarmAt` refleja el nuevo vencimiento;
- `processBuffer` sigue procesando y vaciando el lote una vez.

Evita afirmar que el SDK fue probado si solo se probó el mock. Añade además una
prueba de carga/importación contra el paquete real si puede ejecutarse con los
stubs `cloudflare:*` existentes; si el runtime Node no puede representar la
semántica del Durable Object, mantén esa limitación explícita y confía en
tipos + pruebas del contrato local.

**Verificar**:
`corepack pnpm@10.34.5 test -- test/agent.test.ts test/agent.media.test.ts test/index.test.ts test/learn/endpoint.test.ts`
debe pasar íntegramente.

### Paso 5: Auditar transitivas y aplicar solo correcciones compatibles

Ejecuta `pnpm why` y la auditoría después de la migración.

- Los tres avisos directos de `agents` deben desaparecer.
- Si `uuid` desaparece porque 0.3.10 ya no arrastra x402, registra ese cierre.
- Para cada aviso restante, comprueba si existe una versión corregida dentro
  del rango admitido por su padre. Actualiza solo dentro de esos rangos.
- Para `@hono/node-server`, no fuerces 2.x si
  `@modelcontextprotocol/sdk` declara 1.x.
- Para un aviso «sin versión corregida» (por ejemplo, una versión de
  `@ai-sdk/provider-utils`), documenta paquete, ruta, alcanzabilidad,
  mitigación y fecha de revisión; no inventes una resolución.
- Las vulnerabilidades bajas de herramientas de desarrollo pueden actualizarse
  en este plan únicamente si basta un parche compatible y el diff queda
  limitado a `package.json`/`pnpm-lock.yaml`.

**Verificar**:
`corepack pnpm@10.34.5 audit --audit-level moderate` no debe contener ninguno
de los tres GHSA directos de `agents`. El conteo final y cualquier residual
deben quedar documentados con su ruta exacta.

### Paso 6: Ejecutar la matriz completa y revisar el diff

Ejecuta `check`, `test:coverage` y auditoría baja. Confirma que no cambiaron
`member/`, `wrangler.toml`, secretos ni archivos fuera del alcance.

**Verificar**:

```powershell
corepack pnpm@10.34.5 check
corepack pnpm@10.34.5 test:coverage
corepack pnpm@10.34.5 audit --audit-level low
git diff --check
git status --short
```

`check`, cobertura y `git diff --check` deben terminar correctamente. La
auditoría puede salir 1 solo por residuales documentados sin solución compatible.

## Plan de pruebas

- Usa `test/agent.media.test.ts` como prueba principal del debounce.
- Conserva `test/index.test.ts` y `test/learn/endpoint.test.ts` como pruebas de
  integración del grafo de importación.
- Casos nuevos mínimos: creación, reprogramación, cancelación selectiva,
  pausa y procesamiento único.
- No hagas snapshots de implementación SQL: afirma llamadas al API público y
  estado observable.

## Criterios de terminado

- [ ] `package.json` y `pnpm-lock.yaml` resuelven `agents 0.3.10`.
- [ ] Los tres GHSA directos de `agents` ya no aparecen en la auditoría.
- [ ] `rg -n "cf_agents_schedules|ctx\.storage\.setAlarm" src/agent.ts` no
      devuelve coincidencias.
- [ ] Las pruebas prueban debounce y pausa a través del API público.
- [ ] `corepack pnpm@10.34.5 typecheck`, tests focales, `check` y
      `test:coverage` terminan en exit 0.
- [ ] Cada vulnerabilidad residual tiene paquete, ruta, alcanzabilidad,
      mitigación y seguimiento; no se declara falsamente resuelta.
- [ ] No se añadieron peers opcionales sin uso.
- [ ] Solo cambiaron archivos de alcance y `plans/README.md` marca el plan
      como completado.

## Condiciones de parada

Detente e informa si:

- 0.3.10 no expone una forma pública de listar/cancelar y programar tareas que
  permita conservar el debounce.
- La migración exige cambiar bindings, migraciones o placeholders de
  `wrangler.toml`.
- La única forma de eliminar un aviso es forzar una major transitiva fuera del
  rango que admite su consumidor.
- Aparecen cambios funcionales en mensajes, almacenamiento o rutas.
- Una verificación falla dos veces tras un arreglo razonable.
- Sería necesario tocar `member/`, secretos, desplegar o publicar.

## Notas de mantenimiento

- Revisar una migración a una serie posterior de `agents` en otro plan; no
  mezclarla con esta transición pre-1.0.
- El revisor debe prestar especial atención a la unidad temporal de
  `schedule()` (segundos frente a milisegundos) y a posibles duplicados.
- Las tablas `cf_agents_*` pertenecen al SDK. El código de aplicación no debe
  volver a escribirlas directamente.
