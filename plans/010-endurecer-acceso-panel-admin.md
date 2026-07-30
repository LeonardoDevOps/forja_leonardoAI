# Plan 010: Endurecer el acceso al panel administrativo

> **Instrucciones para el ejecutor**: sigue este plan paso a paso. No degrades la
> usabilidad para el dueño legítimo. Si ocurre una condición de parada, detente e
> informa. Al terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat 792bc637dd3b84b6c29440ea6aae9729794299b5..HEAD -- src/admin/auth.ts src/admin/routes.ts src/api.ts src/env.ts`
> Confirma que `adminAuth` sigue montado sobre `/admin/*` en `src/index.ts:254`.

## Estado

- **Prioridad**: P2
- **Esfuerzo**: S–M
- **Riesgo**: LOW
- **Depende de**: ninguno
- **Categoría**: seguridad (hardening)
- **Origen del hallazgo**: SEC-002 (LOW, CONFIRMADO, PREEXISTENTE) — auditoría 2026-07-30
- **Planificado en**: commit `792bc63`, 2026-07-30

## Por qué importa

El panel usa HTTP Basic Auth con usuario fijo `admin` y una sola contraseña en el
secreto `DASHBOARD_PASSWORD`, con comparación timing-safe correcta
(`src/admin/auth.ts`). Es un modelo aceptable para un producto de un solo dueño,
pero no hay: (a) exigencia de contraseña fuerte, (b) bloqueo/backoff ante intentos
repetidos, ni (c) rotación documentada. Un panel expuesto con contraseña débil es
adivinable por fuerza bruta sin coste para el atacante. El objetivo es reducir esa
superficie sin añadir complejidad de sesiones ni romper el flujo de un dueño.

## Estado actual (evidencia)

- `src/admin/auth.ts:20-25` — `adminAuth` delega en `hono/basic-auth` con
  `DASHBOARD_PASSWORD`.
- `src/admin/auth.ts:67-86` — `checkBasicCredentials` (timing-safe) disponible
  para lógica propia.
- No hay contador de intentos ni umbral de longitud/entropía de contraseña.
- El control-plane `/api/*` usa Bearer (`CONTROL_PLANE_TOKEN`) — revisar de paso
  que también sea fail-closed y con token de longitud mínima.

## Alcance

**Dentro del alcance:**

- `src/admin/auth.ts` — validación de robustez mínima de `DASHBOARD_PASSWORD` al
  arranque/uso (p. ej. longitud mínima) con fallo claro si es débil; y punto de
  enganche para backoff.
- Rate-limit/backoff ligero para `/admin/*` (p. ej. contador en memoria del DO o
  KV si ya existe binding; **no** introducir infra nueva sin justificar). Si
  Workers no ofrece un mecanismo simple sin binding adicional, documentar el
  residual y aportar solo la validación de contraseña + cabeceras.
- Cabeceras de seguridad en respuestas admin: `Cache-Control: no-store`,
  `X-Frame-Options: DENY`/CSP frame-ancestors, `Referrer-Policy`.
- `src/env.ts`, `README.md`, `SECURITY.md`, guías de setup — exigir contraseña
  fuerte y explicar rotación (`wrangler secret put DASHBOARD_PASSWORD`).
- Tests: `test/admin/auth.test.ts`, `test/admin/routes.test.ts`.
- `plans/README.md`.

**Fuera de alcance:**

- Migrar a login por formulario, cookies de sesión, OAuth o multiusuario.
- Introducir un almacén persistente nuevo solo para el contador si complica el
  despliegue del dueño no técnico.
- Tocar `member/`, `wrangler.toml`, secretos, despliegues o npm publish.

## Flujo Git

- Rama: `advisor/010-admin-access-hardening`.
- Commits sugeridos:
  - `feat(admin): enforce strong dashboard password`
  - `feat(admin): add security headers and no-store to admin responses`
  - `docs: document dashboard password rotation`
- No publicar ni abrir PR salvo instrucción expresa.

## Pasos

### Paso 1: Robustez de contraseña

En `adminAuth`/`checkBasicCredentials`, si `DASHBOARD_PASSWORD` está vacío o por
debajo de una longitud mínima razonable (p. ej. 16), fail-closed con un mensaje
que **no** revele el valor. Documenta el requisito en las guías.

**Verificar**: contraseña débil/ausente → acceso denegado con error claro;
contraseña fuerte → acceso normal.

### Paso 2: Backoff de intentos (si es viable sin infra nueva)

Añade un backoff simple por IP/credencial fallida. Si no hay mecanismo sin binding
adicional, documenta el residual y omite este paso, dejándolo anotado.

**Verificar**: N fallos consecutivos introducen demora/deniegan temporalmente sin
afectar al primer intento legítimo.

### Paso 3: Cabeceras de seguridad

Aplica `Cache-Control: no-store`, protección de framing y `Referrer-Policy` a las
respuestas de `/admin/*` (contenido autenticado no debe cachearse ni embeberse).

**Verificar**: las respuestas admin incluyen las cabeceras; una vista pública no
se ve afectada.

### Paso 4: Control-plane `/api/*`

Confirma que el Bearer es fail-closed y exige longitud mínima del token; ajusta si
procede.

**Verificar**: sin token/token corto → 401; token válido → 200.

### Paso 5: CI local y documentación

**Verificar**:

```powershell
corepack pnpm@10.34.5 check:ci
git diff --check
```

Actualiza `README`/`SECURITY` con la política de contraseña y rotación.

## Plan de pruebas

- Contraseña débil/ausente → denegado (fail-closed).
- Credenciales válidas → acceso, con comparación timing-safe intacta.
- Cabeceras presentes en respuestas admin.
- Backoff (si se implementa) no afecta al acceso legítimo normal.

## Criterios de terminado

- [x] Contraseña débil o ausente bloquea el acceso con mensaje sin fugas.
- [x] Respuestas admin llevan `no-store` + protección de framing + referrer.
- [x] Backoff implementado o residual documentado con justificación.
- [x] `/api/*` Bearer confirmado fail-closed.
- [x] Gates equivalentes pasan; la desviación CRLF de `check:ci` queda
      documentada y solo se modifican archivos de alcance.
- [x] `plans/README.md` actualizado.

## Condiciones de parada

Detente e informa si:

- el backoff exige un binding/infra nuevo que complique el despliegue del dueño;
- endurecer la contraseña rompería instalaciones existentes sin ruta de migración;
- sería necesario tocar `member/`, `wrangler.toml`, secretos o desplegar.

## Decisiones y desviaciones de ejecución

- Las cabeceras requeridas ya estaban aplicadas en `origin/main`; se conservaron
  y se amplió su prueba a respuestas `401` y `503`.
- El código real permitía `DASHBOARD_PUBLIC="1"`, un bypass no contemplado por
  el plan. Se eliminó para que una contraseña ausente o débil siempre falle
  cerrada. La migración consiste en guardar una contraseña única de 16+
  caracteres antes de actualizar.
- No se añadió backoff en memoria: Workers puede distribuir y reciclar isolates,
  por lo que el contador no sería durable ni confiable. Un límite real exige un
  control perimetral o estado distribuido nuevo; se documenta Cloudflare Rate
  Limiting, WAF o Access como mitigación residual.

## Resultado de ejecución

Implementado el 2026-07-30 en `advisor/010-admin-access-hardening`, desde
`origin/main` en `98c891b`.

- `DASHBOARD_PASSWORD` requiere 16+ caracteres y una configuración inválida
  responde `503` antes de ejecutar rutas.
- `CONTROL_PLANE_TOKEN` requiere 32+ caracteres; ausente, corto o incorrecto
  responde `401`.
- Las cabeceras admin existentes se verifican también en rechazos, y `/health`
  demuestra que no se aplican a rutas públicas.
- Pasan lint sin warnings, TypeScript, 526 pruebas, cobertura global de 83,35 %
  de líneas y el gate administrativo de 32 comparaciones.
- `check:ci` se detiene solamente en `format:check` por CRLF heredado en 189
  archivos ajenos al cambio. El formato de todos los archivos modificados y
  los demás gates equivalentes pasan; la normalización global sigue en el plan 011.
