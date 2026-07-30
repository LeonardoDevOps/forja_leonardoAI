# Plan 014: Preparación operativa de Cloudflare para producción

> **Instrucciones para el ejecutor/operador**: este plan es de **operación y
> configuración en Cloudflare**, no de código. Nunca pegues secretos en el chat ni
> en logs: usa `wrangler secret put`. No despliegues a producción sin probar en
> staging y sin plan de rollback. Al terminar, actualiza `plans/README.md`.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: M
- **Riesgo**: MEDIUM (cambios en el borde afectan tráfico real)
- **Depende de**: 012 recomendado antes de habilitar el CLI como canal; independiente para el Worker
- **Categoría**: operación / plataforma
- **Origen del hallazgo**: Informe 2026-07-30 §9 (P1 — operación Cloudflare) y residuales §6
- **Planificado en**: commit `f7fdd77`, 2026-07-30
- **Ejecución en repositorio**: COMPLETADA el 2026-07-30
- **Estado operativo**: BLOQUEADO — faltan staging, identificadores/acceso
  Cloudflare y autorización para desplegar
- **Rama**: `advisor/014-cloudflare-operations`, creada desde `origin/main`
  (`936e7dc`)

## Por qué importa

La autenticación de webhooks y del panel es **fail-closed**: sin los secretos
configurados en Cloudflare, esos canales rechazan todo. Además, el Worker no ofrece
rate limiting distribuido ni elimina por sí mismo el residual de DNS rebinding.
Estos controles viven en el borde (Cloudflare) y deben aplicarse antes de abrir
tráfico real.

## Alcance

**Dentro del alcance (configuración/operación):**

- Secretos del Worker (via `wrangler secret put`).
- Cloudflare Access / WAF / Rate Limiting delante de `/admin` y `/api`.
- Egress confiable (proxy o Service Binding) si se quiere eliminar el residual DNS.
- Pruebas en staging y plan de rollback + monitorización.
- `docs/` / `SECURITY.md`: runbook de despliegue y rotación.

**Fuera de alcance:**

- Cambiar código del Worker o del CLI.
- Leer/mostrar valores de secretos.
- Tocar `member/` o sustituir placeholders reales de `wrangler.toml` en el repo.

## Pasos

### Paso 1: Configurar y rotar secretos

Con `wrangler secret put`, definir valores fuertes y únicos:

- `TELEGRAM_WEBHOOK_SECRET` (y registrar el `secret_token` en `setWebhook`);
- `MANYCHAT_WEBHOOK_SECRET` (y el header correspondiente en el "External Request");
- `TWILIO_AUTH_TOKEN` y, si aplica, `TWILIO_WEBHOOK_URL`;
- `DASHBOARD_PASSWORD` único de 16+ caracteres;
- `CONTROL_PLANE_TOKEN` aleatorio de 32+ caracteres.

**Verificar**: los cinco secretos existen; un webhook con firma inválida es
rechazado; el panel exige la contraseña.

### Paso 2: Access / WAF / Rate Limiting

Colocar Cloudflare Access (o WAF + Rate Limiting) delante de `/admin` y `/api` para
compensar la ausencia de backoff en el Worker. Definir reglas de rate limiting para
los webhooks si el volumen lo justifica.

**Verificar**: acceso a `/admin` mediado por Access/regla; ráfagas anómalas se
limitan.

### Paso 3: Egress confiable (residual DNS)

Si el modelo de amenaza lo exige, enrutar el fetch de medios por un proxy/Service
Binding de egress con resolución bajo la misma política, para cerrar el residual de
DNS rebinding de un hostname aprobado comprometido. Si se acepta el residual,
registrar la decisión y la fecha de revisión.

**Verificar**: medios legítimos siguen funcionando; el residual queda cerrado o
aceptado explícitamente.

### Paso 4: Staging, rollback y monitorización

Probar webhooks legítimos y firmas inválidas en staging antes de cambiar tráfico.
Preparar rollback al commit anterior y monitorización de rechazos/errores (tasa de
403 de webhooks, 401 de admin, errores 5xx).

**Verificar**: staging valida positivos y negativos; existe runbook de rollback y
dashboards/alertas mínimas.

## Criterios de terminado

- [ ] Los cinco secretos configurados y rotación documentada (sin exponer valores).
- [ ] Access/WAF/Rate Limiting activo delante de `/admin` y `/api`.
- [x] Residual DNS cerrado con egress confiable o aceptado con fecha de revisión.
- [ ] Staging prueba positivos y negativos de webhooks/panel.
- [x] Runbook de despliegue, rollback y monitorización documentado.
- [x] `plans/README.md` actualizado.

## Resultado de la ejecución en el repositorio

### Controles implementados

- `docs/cloudflare-production-runbook.md` documenta separación obligatoria de
  staging/producción, inventario y rotación sin valores, Access/WAF/Rate
  Limiting por ruta, pruebas positivas y negativas, promoción gradual, rollback
  y monitorización.
- `scripts/cloudflare-production-check.ts` añade un gate offline y fail-closed
  que valida evidencia redactada. No consulta Cloudflare, no lee `.env`,
  `.dev.vars` ni valores de secretos y no despliega.
- `docs/cloudflare-production-evidence.example.json` aporta una plantilla que
  falla hasta que un operador demuestre cada control. La evidencia real se
  guarda en `.forja-reports/`, ahora ignorado por Git.
- El gate exige los cinco nombres del plan, protección y rate limiting de
  `/admin` y `/api`, decisión de egress, 14 pruebas de staging, versión estable
  de rollback y tres señales mínimas de monitorización.
- Siete pruebas unitarias cubren evidencia válida, entrada malformada, secretos
  ausentes, borde incompleto, aceptación DNS vencida, prueba negativa fallida,
  rollback y monitorización incompletos.
- `README.md` y `SECURITY.md` enlazan el runbook, describen el gate y alinean
  Node 22/24 con la CI protegida por el Plan 013.

### Decisión DNS

El riesgo residual se acepta temporalmente hasta el **2026-09-30**. El
repositorio no contiene un proxy administrado ni un Service Binding, y no hay
cuenta, red o staging sobre los que diseñar y demostrar egress confiable. Se
mantienen HTTPS, hosts exactos, revalidación de redirects y límites de descarga.
La promoción debe bloquearse si el modelo de amenaza exige cerrar el riesgo
antes de esa fecha.

### Bloqueos externos

No se ejecutaron mutaciones en Cloudflare porque:

- `wrangler.toml` conserva placeholders y no define entornos nombrados de
  staging/producción;
- no se proporcionaron Worker, dominio, zone/account IDs, cuentas de prueba ni
  una versión estable para rollback;
- no se verificó el plan contratado para Access/WAF/Rate Limiting;
- la instrucción original prohíbe leer/modificar secretos y desplegar;
- probar sin staging podría enviar tráfico a usuarios reales, una condición de
  parada expresa del plan.

Por tanto, no se afirma que secretos, políticas de borde, pruebas o dashboards
estén activos. El operador desbloquea el plan al completar el runbook y obtener
un resultado verde de:

```bash
pnpm cloudflare:preflight -- \
  --evidence .forja-reports/plan014-cloudflare-evidence.json
```

### Desviaciones

- La instrucción inicial menciona `wrangler secret put`, pero Wrangler 4.105.0
  y la documentación vigente confirman que ese comando crea y despliega una
  versión inmediatamente. El runbook prefiere `wrangler versions secret put`
  seguido de una promoción explícita para respetar staging y la prohibición de
  despliegue directo.
- No se modificó el código del Worker, el CLI, `member/` ni `wrangler.toml`. El
  único TypeScript nuevo es tooling operativo offline.

## Validación

- Prettier focal: PASS.
- ESLint con cero warnings: PASS.
- TypeScript `--noEmit`: PASS.
- Pruebas focales: 7/7 PASS.
- Suite completa: 75 archivos y 548 pruebas, todas PASS; cobertura global de
  83,35 % de líneas.
- Gate administrativo: PASS, 32/32 comparaciones.
- Auditoría con umbral `high`: PASS; solo permanece el `MEDIUM` conocido de
  `@hono/node-server`.
- El ejemplo incompleto falla cerrado como está diseñado.
- `git diff --check`: PASS.
- No se leyó ni modificó ningún secreto, no se conectó a Cloudflare y no se
  realizó ningún despliegue.

`check:ci` se detuvo únicamente en el formato global porque este checkout de
Windows materializa 128 archivos heredados con CRLF pese a que Git y
`.gitattributes` declaran LF. No se normalizaron archivos fuera de alcance; el
formato focal y todos los demás gates equivalentes sí pasaron.

## Condiciones de parada

Detente e informa si:

- falta acceso a la cuenta de Cloudflare del propietario o a los planes necesarios
  (Access/WAF/Rate Limiting);
- una prueba exigiría enviar mensajes reales a usuarios;
- el despliegue no puede hacerse primero en staging;
- sería necesario pegar un secreto en chat/logs (usar siempre `wrangler secret put`).
