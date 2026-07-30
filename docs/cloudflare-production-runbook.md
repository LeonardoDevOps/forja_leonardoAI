# Runbook de producción en Cloudflare

Este runbook convierte los controles del Plan 014 en una promoción verificable.
No contiene identificadores de cuenta, dominios, valores de secretos ni
configuración específica de un miembro. Tampoco autoriza desplegar desde el
checkout de la plantilla.

## Reglas de seguridad

- Usa configuraciones separadas y privadas para `staging` y `production`.
  Nunca ejecutes Wrangler contra el `wrangler.toml` de la plantilla mientras
  conserve placeholders.
- No copies valores de secretos a tickets, chats, logs, archivos de evidencia ni
  argumentos de línea de comandos. Introdúcelos en el prompt interactivo de
  Wrangler o desde un gestor de secretos.
- No uses `.dev.vars`, `.env` ni un archivo de producción como evidencia. El
  preflight solo necesita **nombres** de secretos y resultados de controles.
- No envíes pruebas a usuarios reales. Usa cuentas, números, páginas y
  suscriptores de staging.
- No promociones una versión si no hay una versión estable identificada y un
  operador preparado para ejecutar el rollback.
- Los cambios de D1, R2, KV, Vectorize y Durable Objects no se revierten al
  hacer rollback del Worker. Revisa su compatibilidad por separado.

La documentación oficial confirma que `wrangler secret put` crea y despliega
inmediatamente una versión. Para separar creación y promoción usa
`wrangler versions secret put` y `wrangler versions deploy`:

- [Secrets de Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Versiones y despliegues](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Rollback de Workers](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

## Prerrequisitos y separación de entornos

Antes de ejecutar cualquier cambio externo, registra sin valores sensibles:

| Dato                              | Staging | Producción |
| --------------------------------- | ------- | ---------- |
| Configuración Wrangler privada    |         |            |
| Worker independiente              |         |            |
| Dominio o ruta independiente      |         |            |
| D1/R2/Vectorize/DO independientes |         |            |
| Cuenta de prueba por canal        |         |            |
| Versión estable para rollback     |         |            |
| Responsable de monitorización     |         |            |

Si staging comparte datos, rutas, Durable Objects o credenciales con producción,
no es staging seguro y la promoción se detiene.

Guarda la evidencia redactada fuera de Git:

```bash
mkdir -p .forja-reports
cp docs/cloudflare-production-evidence.example.json \
  .forja-reports/plan014-cloudflare-evidence.json
```

`.forja-reports/` está ignorado por Git. El archivo no debe contener valores de
secretos, tokens de Access, payloads reales, correos de clientes ni
identificadores personales.

## 1. Inventario y rotación de secretos

Los cinco nombres mínimos del Plan 014 son:

| Nombre                    | Uso                                        | Requisito |
| ------------------------- | ------------------------------------------ | --------- |
| `TELEGRAM_WEBHOOK_SECRET` | Header secreto registrado con `setWebhook` | Único     |
| `MANYCHAT_WEBHOOK_SECRET` | Header `X-Forja-Webhook-Secret`            | Único     |
| `TWILIO_AUTH_TOKEN`       | Validación de `X-Twilio-Signature`         | De Twilio |
| `DASHBOARD_PASSWORD`      | Basic Auth del panel                       | 16+ chars |
| `CONTROL_PLANE_TOKEN`     | Bearer adicional para `/api/*`             | 32+ chars |

Meta/WhatsApp y las credenciales de envío siguen siendo obligatorios cuando
esos canales están activos, aunque no formen parte de los cinco controles
mínimos de este plan.

### Inventario sin valores

Wrangler solo devuelve nombres al listar secretos. Ejecuta el comando contra la
configuración privada del entorno correcto y no pegues la salida en el
repositorio:

```bash
pnpm exec wrangler secret list \
  --config <ruta-config-staging> \
  --format json
```

Repite para producción únicamente durante la ventana de cambio. Marca en
`secretNames` los nombres verificados; nunca añadas sus valores.

### Orden de rotación

1. Genera un valor aleatorio y exclusivo en un gestor de secretos.
2. Configúralo en **staging** mediante el prompt interactivo:

   ```bash
   pnpm exec wrangler versions secret put <NOMBRE> \
     --config <ruta-config-staging> \
     --message "plan014: rotate <NOMBRE> in staging"
   ```

3. Promueve la versión de staging y ejecuta la matriz completa de este runbook.
4. Para un webhook, coordina el cambio del proveedor y del Worker en la misma
   ventana. Mantén disponible el procedimiento de reversión del proveedor.
5. Repite en producción usando su configuración privada. No uses
   `wrangler secret put` si un despliegue inmediato no está autorizado.
6. Comprueba el flujo válido y el rechazo inválido. Revoca el valor anterior
   solo después de confirmar ambos.
7. Registra fecha, responsable y resultado, nunca el valor.

Telegram debe volver a registrar el mismo valor como `secret_token`; ManyChat
debe enviar el mismo valor en `X-Forja-Webhook-Secret`. Twilio administra
`TWILIO_AUTH_TOKEN`: rota primero en staging/test credentials y valida la URL
exacta, incluido `TWILIO_WEBHOOK_URL` cuando hay proxy o dominio personalizado.

## 2. Access, WAF y Rate Limiting

Configura políticas por ruta; no pongas Access delante de `/webhooks/*`, porque
los proveedores no pueden completar un login humano.

| Ruta          | Control de identidad                                   | Rate limiting                   |
| ------------- | ------------------------------------------------------ | ------------------------------- |
| `/admin*`     | Access para identidades humanas autorizadas            | Por IP, inicialmente en `Log`   |
| `/api*`       | Access Service Token con política `Service Auth`       | Por IP/cliente según el plan    |
| `/webhooks/*` | Firma propia de Telegram/ManyChat/Twilio/Meta/WhatsApp | Según volumen, primero en `Log` |

Access permite proteger rutas concretas. Cuando dos aplicaciones comparten
prefijo, la política de la ruta más específica prevalece:

- [Rutas de aplicaciones Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Service Tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

Para `/admin*`:

1. Crea una aplicación self-hosted para el hostname y la ruta administrativa.
2. Permite solo el grupo o las identidades operadoras.
3. Conserva Basic Auth: Access es una capa adicional, no su sustituto.
4. Verifica desde una sesión autorizada y otra no autorizada.

Para `/api*`:

1. Crea una aplicación específica, separada de `/admin*`.
2. Usa una política `Service Auth` y un Service Token de duración acotada.
3. Guarda su secreto exclusivamente en el gestor del control plane.
4. Conserva `CONTROL_PLANE_TOKEN`; ambas capas deben validar.
5. Documenta expiración y rotación del Service Token.

### Rate limiting

No copies umbrales genéricos a producción. Usa Security Analytics para observar
tráfico normal y anómalo, publica primero con acción `Log`, revisa falsos
positivos y después cambia a `Block` o `Challenge`. Los webhooks automatizados
no deben recibir challenges interactivos.

Cada regla debe registrar:

- expresión exacta de hostname y path;
- característica de conteo disponible en el plan contratado;
- periodo, solicitudes por periodo y tiempo de mitigación;
- acción inicial y acción final;
- captura del análisis que justifica el umbral;
- responsable y fecha de revisión.

Referencias oficiales:

- [Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cómo elegir el límite](https://developers.cloudflare.com/waf/rate-limiting-rules/find-rate-limit/)
- [Creación mediante Rulesets API](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/)

## 3. Decisión sobre egress y DNS

La allowlist exacta del Worker reduce SSRF, pero no fija de forma atómica la IP
resuelta y la conexión. Hay dos opciones válidas:

1. **Cerrar el residual**: enrutar descargas por un proxy de egress administrado
   o un Worker interno accesible mediante Service Binding. Ese servicio debe
   resolver y conectar bajo una política única, rechazar IP privadas/locales,
   revalidar redirects y limitar tamaño y tiempo.
2. **Aceptar temporalmente el residual**: documentar por qué la allowlist y la
   baja exposición son suficientes, asignar responsable y fijar una fecha
   futura de revisión.

Un Service Binding permite llamar a otro Worker sin exponerlo mediante una URL
pública, pero añadirlo requiere código, configuración y despliegue propios:
[Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).

### Decisión actual del repositorio

El residual se **acepta temporalmente hasta el 2026-09-30**:

- el repositorio no contiene un proxy de egress administrado;
- el `wrangler.toml` compartido no declara un Service Binding;
- inventar esa infraestructura sin cuenta, red, staging ni propietario
  produciría un control ficticio;
- la mitigación vigente conserva HTTPS, hosts exactos, revalidación de
  redirects y límites de descarga.

El responsable operativo debe reevaluar la decisión antes de esa fecha o antes
de habilitar un hostname de medios controlado por terceros, lo que ocurra
primero. Si el modelo de amenaza exige cerrar el residual, la promoción queda
bloqueada hasta implementar y probar el proxy/Service Binding.

## 4. Matriz de staging

Usa payloads sintéticos y destinatarios de prueba. Para cada prueba registra
hora, commit, versión del Worker y resultado, sin guardar firmas ni cuerpos
reales.

| Control       | Positivo esperado                   | Negativo esperado                                   |
| ------------- | ----------------------------------- | --------------------------------------------------- |
| Telegram      | Firma válida: `200`, ingesta única  | Sin secreto/secreto erróneo: `403`, sin ingesta     |
| ManyChat      | Header válido: `200`, ingesta única | Header ausente/erróneo: `403`, sin ingesta          |
| Twilio        | Firma válida: TwiML `200`, ingesta  | Firma inválida: TwiML `200`, **sin ingesta**        |
| Meta          | Firma válida: `200`, ingesta        | Firma inválida: `403`, sin ingesta                  |
| WhatsApp      | Firma válida: `200`, ingesta        | Firma inválida: `403`, sin ingesta                  |
| `/admin*`     | Access + Basic válidos: `2xx`       | Access o Basic inválido: bloqueado antes de datos   |
| `/api/health` | Access + Bearer válidos: `200`      | Service Token o Bearer inválido: `401/403`          |
| Rate limit    | Tráfico normal permitido            | Ráfaga sintética registrada/bloqueada según la fase |

En Twilio el estado HTTP negativo es deliberadamente `200` para evitar retries:
la evidencia debe comprobar que no se creó mensaje, conversación ni invocación
del agente. Un `200` por sí solo no prueba autenticidad.

No pruebes rate limiting contra producción. En staging usa una tasa pequeña y
un identificador de prueba; confirma que la regla solo alcanza el hostname y
path previstos.

## 5. Promoción controlada

1. Ejecuta la validación del repositorio y el preflight de evidencia.
2. Identifica la versión estable actual:

   ```bash
   pnpm exec wrangler deployments list \
     --config <ruta-config-produccion> \
     --json
   ```

3. Guarda únicamente el ID de versión estable en la evidencia.
4. Sube la nueva versión sin dirigir tráfico y conserva el ID devuelto.
5. Repite smoke tests en una preview/version override o con 0 % de tráfico
   cuando el plan lo permita.
6. Promueve gradualmente; detén el avance si aumentan `5xx`, rechazos válidos,
   latencia o errores de bindings.
7. Solo lleva al 100 % después de completar la ventana de observación acordada.

`wrangler deploy` crea una versión y la sirve inmediatamente al 100 %. Para una
promoción controlada usa las APIs de versiones y deployments descritas en la
documentación oficial.

## 6. Rollback

Antes de promover, revisa:

- versión estable anterior y comando exacto;
- compatibilidad de schema y bindings;
- cambios externos de proveedores que también deban revertirse;
- responsable con acceso durante toda la ventana;
- criterio cuantitativo de rollback.

Comando preparado, pero **no ejecutar durante validaciones locales**:

```bash
pnpm exec wrangler rollback <VERSION_ID_ESTABLE> \
  --config <ruta-config-produccion> \
  --message "rollback: <incidente>"
```

El rollback de Worker se activa inmediatamente y no restaura recursos de datos
ni la configuración externa de Telegram, ManyChat, Twilio o Meta. Después:

1. confirma la versión activa;
2. ejecuta los smoke tests mínimos;
3. revierte el secreto/configuración del proveedor si formaba parte del cambio;
4. conserva logs y abre el registro del incidente sin datos sensibles.

## 7. Monitorización y alertas

Como mínimo, asigna propietario y alertas para:

| Señal                            | Fuente sugerida                        | Acción                    |
| -------------------------------- | -------------------------------------- | ------------------------- |
| `403` en webhooks                | Workers Logs / zone analytics          | Revisar firma y proveedor |
| `401`/`403` en `/admin` y `/api` | Access logs + WAF/rate limiting events | Revisar abuso o rotación  |
| `5xx` del Worker                 | Workers metrics                        | Detener/rollback          |
| Errores de bindings              | Workers Logs                           | Revisar D1/R2/DO/AI       |
| Latencia y CPU anómalas          | Workers metrics                        | Detener promoción         |

Define umbrales a partir del baseline de staging y del tráfico normal, no de
números universales. Los logs no deben incluir headers de autenticación,
payloads, números, correos, tokens ni conversaciones.

Cloudflare ofrece métricas de requests, errores, CPU y duración, además de
Workers Logs:

- [Observabilidad de Workers](https://developers.cloudflare.com/workers/observability/)
- [Métricas y analytics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

## 8. Gate de evidencia

Después de completar controles externos, copia la plantilla y marca solo
resultados demostrados. Ejecuta:

```bash
pnpm cloudflare:preflight -- \
  --evidence .forja-reports/plan014-cloudflare-evidence.json
```

El comando es offline: no consulta Cloudflare, no lee `.env`/`.dev.vars`, no
despliega y no imprime valores de secretos. Falla si falta cualquiera de estos
elementos:

- cinco nombres de secretos;
- protección y rate limiting de `/admin` y `/api`;
- decisión de egress y revisión futura si el riesgo se acepta;
- pruebas positivas y negativas de staging;
- versión y revisión de rollback;
- monitorización de webhooks, admin/API y `5xx`.

Una evidencia verde no sustituye la revisión humana. El responsable debe
contrastar los booleanos con Cloudflare y con los proveedores durante la ventana
de cambio.
