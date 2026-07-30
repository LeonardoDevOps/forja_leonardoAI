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
- [ ] Residual DNS cerrado con egress confiable o aceptado con fecha de revisión.
- [ ] Staging prueba positivos y negativos de webhooks/panel.
- [ ] Runbook de despliegue, rollback y monitorización documentado.
- [ ] `plans/README.md` actualizado.

## Condiciones de parada

Detente e informa si:

- falta acceso a la cuenta de Cloudflare del propietario o a los planes necesarios
  (Access/WAF/Rate Limiting);
- una prueba exigiría enviar mensajes reales a usuarios;
- el despliegue no puede hacerse primero en staging;
- sería necesario pegar un secreto en chat/logs (usar siempre `wrangler secret put`).
