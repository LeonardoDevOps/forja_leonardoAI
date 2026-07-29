# Plan 008: Elevar y proteger la cobertura de los módulos administrativos

> **Instrucciones para el ejecutor**: sigue este plan paso a paso. Prioriza
> pruebas de comportamiento sobre snapshots. Si ocurre una condición de
> parada, detente e informa. Al terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat c9025b99a76950a659c6bd6c731d63073394a12c..HEAD -- package.json scripts/check-admin-coverage.mjs src/admin/twilioUsage.ts src/admin/views/campanas.ts src/admin/views/stats.ts src/admin/views/costs.ts src/admin/views/insights.ts src/admin/views/kb.ts src/admin/views/conexiones.ts src/admin/views/leads.ts test/admin`
> `scripts/check-admin-coverage.mjs` y varios tests todavía no existen; eso es
> esperado. Si los módulos de producción cambiaron, recalcula la línea base.

## Estado

- **Prioridad**: P2
- **Esfuerzo**: L
- **Riesgo**: LOW
- **Depende de**: ninguno
- **Categoría**: tests
- **Planificado en**: commit `c9025b9`, 2026-07-29

## Por qué importa

La cobertura global supera el umbral informal del proyecto, pero varias
pantallas administrativas y la integración de costes Twilio apenas se
ejecutan. Son módulos que agregan datos financieros, campañas, leads y
analítica; un cambio de consulta o de estado vacío puede romper el dashboard
sin que CI lo detecte. Este plan añade caracterización útil y un umbral
específico por archivo para evitar que la cobertura global oculte regresiones.

## Estado actual

`coverage/coverage-summary.json`, generado por `pnpm test:coverage`, muestra:

| Archivo                         | Líneas cubiertas |
| ------------------------------- | ---------------: |
| `src/admin/views/campanas.ts`   |            0.00% |
| `src/admin/views/stats.ts`      |            3.63% |
| `src/admin/views/costs.ts`      |            3.70% |
| `src/admin/twilioUsage.ts`      |            6.89% |
| `src/admin/views/insights.ts`   |            7.31% |
| `src/admin/views/kb.ts`         |           23.80% |
| `src/admin/views/conexiones.ts` |           40.90% |
| `src/admin/views/leads.ts`      |           52.50% |

Puntos de entrada:

```ts
renderCampanas(env, query);
renderStats(env);
renderCosts(env, saved);
fetchTwilioUsage(env, period);
renderInsights(env, analyzedParam);
renderKbList(env, flags);
renderKbEditor(doc, env);
renderConexiones(env);
connectionsSummary(env);
renderLeads(env);
exportLeadsCsv(env);
```

- `test/admin/routes.test.ts` contiene un stub D1 sencillo basado en fragmentos
  SQL y es el patrón preferido.
- `test/admin/kb-routes.test.ts` ya prueba mutaciones de KB, pero no cubre bien
  sus variantes de render.
- `renderCampanas`, `renderStats`, `renderCosts` y `renderInsights` consultan
  D1/repositorios y generan HTML. No se deben snapshotear cientos de líneas:
  se deben afirmar datos, escapes, estados y enlaces relevantes.
- `fetchTwilioUsage()` usa credenciales del entorno, Basic auth, JSON externo,
  agregación y fallbacks; nunca debe llamar a Twilio real en tests.
- `vitest.config.ts` ya genera `coverage/coverage-summary.json`.

## Objetivo cuantitativo

Después de las pruebas, cada uno de los ocho archivos debe alcanzar:

- líneas: al menos 70%;
- statements: al menos 70%;
- functions: al menos 70%;
- branches: al menos 50%.

El gate debe leer el JSON de cobertura y fallar por archivo; no se acepta un
promedio del directorio.

## Comandos necesarios

| Propósito   | Comando                                    | Resultado esperado                     |
| ----------- | ------------------------------------------ | -------------------------------------- |
| Tests admin | `corepack pnpm@10.34.5 test -- test/admin` | todos pasan                            |
| Cobertura   | `corepack pnpm@10.34.5 test:coverage`      | exit 0; genera JSON                    |
| Gate admin  | `corepack pnpm@10.34.5 coverage:admin`     | exit 0; ocho archivos superan umbrales |
| CI local    | `corepack pnpm@10.34.5 check:ci`           | exit 0                                 |

## Alcance

**Dentro del alcance — únicos archivos modificables:**

- `package.json`
- `scripts/check-admin-coverage.mjs` (crear)
- los ocho módulos de producción de la tabla, solo para un refactor de
  testabilidad sin cambio funcional si fuera imprescindible
- `test/admin/helpers.ts` (crear si evita duplicación)
- `test/admin/twilio-usage.test.ts` (crear)
- `test/admin/views-campanas.test.ts` (crear)
- `test/admin/views-stats.test.ts` (crear)
- `test/admin/views-costs.test.ts` (crear)
- `test/admin/views-insights.test.ts` (crear)
- `test/admin/views-secondary.test.ts` (crear para KB/conexiones/leads)
- tests admin existentes, solo si se extrae un helper compartido
- `plans/README.md`

**Fuera de alcance:**

- Cambiar HTML, copy, navegación, queries o lógica de precios/campañas.
- Añadir tests que solo importen un módulo para inflar cobertura.
- Snapshots completos del HTML.
- Excluir líneas/archivos de cobertura.
- Bajar umbrales globales o alterar la concurrencia de Vitest.
- Hacer llamadas reales a Twilio, IA, D1 remoto o Cloudflare.
- Tocar `member/`, `wrangler.toml`, secretos, despliegues o npm publish.

## Flujo Git

- Rama: `advisor/008-admin-coverage`.
- Commits sugeridos:
  - `test(admin): cover billing and analytics views`
  - `test(admin): cover campaigns leads and connections`
  - `ci(coverage): enforce admin module thresholds`
- No publicar ni abrir PR salvo instrucción expresa.

## Pasos

### Paso 1: Regenerar y guardar la línea base

Ejecuta cobertura completa y extrae las cuatro métricas de los ocho archivos.
No versiones `coverage/`. Si las cifras cambiaron, actualiza la tabla del plan
o anota la deriva antes de continuar.

**Verificar**:
`coverage/coverage-summary.json` existe y contiene los ocho paths.

### Paso 2: Crear dobles reutilizables sin esconder consultas

Extrae a `test/admin/helpers.ts` un D1 stub basado en el patrón de
`test/admin/routes.test.ts`. Debe:

- emparejar fragmentos SQL de forma determinista;
- soportar `bind`, `first`, `all` y `run`;
- registrar SQL y parámetros para assertions;
- fallar con mensaje claro cuando una prueba marque una consulta como
  obligatoria y no se ejecute;
- no implementar un parser SQL ni replicar lógica de producción.

Añade helpers pequeños para `Env` de prueba y autorización solo si reducen
duplicación. No incluyas valores de secretos reales.

**Verificar**:
`corepack pnpm@10.34.5 test -- test/admin/routes.test.ts test/admin/kb-routes.test.ts`
continúa pasando después de cualquier extracción.

### Paso 3: Cubrir Twilio y costes

En `test/admin/twilio-usage.test.ts`, prueba:

- ausencia de SID/token: `available=false` y cero llamadas de red;
- HTTP no exitoso;
- excepción de red;
- respuesta sin `usage_records`;
- agregación de mensajería, WhatsApp y números;
- parsing de números inválidos como cero;
- categorías con precio cero omitidas;
- orden descendente por precio;
- periodo y Authorization Basic construidos con credenciales ficticias.

En `views-costs`, prueba:

- estado vacío sin tokens ni Twilio;
- filas de varios modelos/días y total mensual;
- banner `saved`;
- Twilio disponible/no disponible;
- contenido controlado por DB escapado.

Usa `vi.stubGlobal("fetch", ...)` o `vi.spyOn(globalThis, "fetch")` y restaura
siempre el mock.

**Verificar**:
`corepack pnpm@10.34.5 test -- test/admin/twilio-usage.test.ts test/admin/views-costs.test.ts`
pasa sin red real.

### Paso 4: Cubrir estadísticas e insights

Para `renderStats`, crea escenarios:

- todas las consultas vacías;
- datos representativos para serie diaria, funnel, heatmap, tokens, canales,
  tools e insights;
- divisores cero y valores ausentes;
- orden/etiquetas esenciales del HTML.

Para `renderInsights`, prueba:

- estado vacío y porcentaje sin analizados;
- estadísticas y listas pobladas;
- banner de `analyzedParam`;
- badges conocidos/desconocidos;
- escape de nombres, oportunidades y texto proveniente de DB;
- conteo pending exitoso y fallback ya existente.

Congela el reloj con `vi.setSystemTime` cuando se afirmen fechas relativas.

**Verificar**:
los dos archivos focales pasan y ninguna aserción depende del timezone local.

### Paso 5: Cubrir campañas, KB, conexiones y leads

Casos mínimos:

- Campañas: estado vacío, banner éxito, banner error escapado, segmentos,
  historial, cuota/cap y fallo al listar templates.
- KB: lista vacía/poblada, banners, HTML escapado, editor nuevo/existente.
- Conexiones: credenciales presentes/ausentes por canal y
  `connectionsSummary` coherente.
- Leads: lista vacía/poblada, status/etiquetas, escape HTML, export CSV con
  coma, comillas, saltos de línea y valores nulos.

No cambies consultas para facilitar el mock. Si un stub no representa D1 con
fidelidad suficiente, usa Miniflare local siguiendo los tests existentes.

**Verificar**:
`corepack pnpm@10.34.5 test -- test/admin/views-campanas.test.ts test/admin/views-secondary.test.ts`
y los tests KB existentes pasan.

### Paso 6: Crear un gate de cobertura por archivo

Crea `scripts/check-admin-coverage.mjs` que:

1. lea `coverage/coverage-summary.json`;
2. normalice `\` y `/` para funcionar en Windows y Linux;
3. localice exactamente los ocho sufijos `src/admin/...`;
4. falle si falta un archivo;
5. compare lines/statements/functions >=70 y branches >=50;
6. imprima una tabla concisa con valor actual, mínimo y PASS/FAIL;
7. termine con código 1 si alguna métrica falla.

Añade a `package.json`:

```json
"coverage:admin": "node scripts/check-admin-coverage.mjs"
```

Incorpora `corepack pnpm coverage:admin` al final de `check:ci`, después de
`test:coverage`, para que el JSON exista.

**Verificar**:

```powershell
corepack pnpm@10.34.5 test:coverage
corepack pnpm@10.34.5 coverage:admin
```

Ambos salen 0 y el segundo informa PASS para 32 comparaciones.

### Paso 7: Revisar calidad y ausencia de inflación artificial

Revisa que las pruebas afirmen salidas/efectos observables y que no haya
snapshots gigantes, sleeps, red ni secretos. Ejecuta CI local.

**Verificar**:

```powershell
corepack pnpm@10.34.5 check:ci
git diff --check
git diff --name-only
```

Todo pasa y solo aparecen archivos de alcance.

## Plan de pruebas

- Pruebas unitarias de `twilioUsage` con fetch interceptado.
- Pruebas de render con D1/repositories controlados.
- Pruebas de escape XSS y CSV para entradas externas.
- Reloj fijo para fechas relativas.
- Una corrida completa con cobertura y gate por archivo.
- No depender del orden global de tests ni compartir mocks sin restaurarlos.

## Criterios de terminado

- [ ] Los ocho módulos alcanzan lines/statements/functions >=70 y branches >=50.
- [ ] `coverage:admin` falla si falta un archivo o baja una métrica.
- [ ] `check:ci` ejecuta el gate después de generar cobertura.
- [ ] Twilio, D1, IA y proveedores están completamente simulados/locales.
- [ ] Hay pruebas de estado vacío, poblado, error y escape para cada familia.
- [ ] No hay snapshots completos ni exclusiones nuevas de cobertura.
- [ ] `check:ci` y `git diff --check` pasan.
- [ ] No cambia comportamiento productivo ni archivos fuera de alcance.
- [ ] `plans/README.md` marca el plan como completado.

## Condiciones de parada

Detente e informa si:

- alcanzar el umbral exige cambiar comportamiento de producción o excluir
  líneas;
- un módulo requiere un servicio real o un secreto para ser probado;
- el gate no puede identificar rutas de forma portable en Windows/Linux;
- la suite se vuelve no determinista tras dos intentos razonables;
- sería necesario tocar `member/`, `wrangler.toml`, secretos o desplegar.

## Notas de mantenimiento

- Al añadir un módulo administrativo de datos/costes, incorporarlo al gate si
  su fallo puede quedar oculto por cobertura global.
- El revisor debe valorar la calidad de assertions, no solo el porcentaje.
- Los umbrales son una base, no un objetivo máximo; pueden elevarse en otro
  cambio cuando haya evidencia estable.
