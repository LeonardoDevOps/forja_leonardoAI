# Plan 006: Reducir el riesgo de DNS rebinding con políticas de host por canal

> **Instrucciones para el ejecutor**: sigue este plan paso a paso y verifica
> cada cambio. Si ocurre una condición de parada, detente e informa; no
> improvises. Al terminar, actualiza `plans/README.md`.
>
> **Comprobación de deriva (ejecutar primero)**:
> `git diff --stat c9025b99a76950a659c6bd6c731d63073394a12c..HEAD -- src/env.ts src/agent.ts src/media/urlPolicy.ts src/media/transcribe.ts src/media/vision.ts src/channels/telegram.ts src/channels/twilio.ts src/channels/whatsapp.ts src/channels/manychat.ts src/channels/learned.ts test/media/urlPolicy.test.ts test/media/transcribe.test.ts test/media/vision.test.ts test/agent.media.test.ts test/channels/telegram.test.ts test/channels/twilio.test.ts test/channels/whatsapp.test.ts test/channels/manychat.test.ts test/channels/learned.test.ts README.md SECURITY.md`
> Si cambió alguno, reconcilia los extractos siguientes con el código vivo.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: M
- **Riesgo**: MED
- **Depende de**: ninguno
- **Categoría**: security
- **Planificado en**: commit `c9025b9`, 2026-07-29
- **Resultado**: COMPLETADO en `advisor/005-006-agents-media-security`

## Por qué importa

La política actual bloquea protocolos inseguros, IP literales privadas y
redirects peligrosos, pero acepta cualquier hostname público. En Workers no
hay una resolución DNS confiable controlada por la aplicación; un dominio
controlado por un atacante puede cambiar su respuesta DNS entre validación y
conexión. Sin un egress confiable, la mitigación compatible es dejar de aceptar
hosts arbitrarios y limitar cada canal a hosts exactos controlados por el
proveedor o aprobados explícitamente por el operador.

## Estado actual

- `src/media/urlPolicy.ts:31`:

  ```ts
  export function assertSafeExternalMediaUrl(value: string | URL): URL {
    const url = value instanceof URL ? new URL(value) : new URL(value);
    // HTTPS, credenciales, puerto, nombres locales e IP privadas...
    return url;
  }
  ```

- `fetchSafeExternalMedia()` valida cada redirección y limita a tres saltos,
  15 segundos y 25 MiB, pero vuelve a aplicar solo la política «host público».
- El comentario reconoce explícitamente que DNS rebinding no puede resolverse
  completamente sin un proxy de salida confiable.
- `src/media/transcribe.ts` descarga audio mediante
  `fetchSafeExternalMedia(audioUrl)`.
- `src/media/vision.ts` entrega la URL validada al proveedor multimodal; esa
  descarga ocurre fuera del control directo del Worker.
- `SupportAgent.ingest()` recibe `channel`, `audioUrl` e `imageUrl`, pero no
  conserva una decisión de confianza de host.
- Orígenes conocidos:
  - Telegram construye medios bajo `api.telegram.org`;
  - Twilio usa URLs de su API de medios;
  - WhatsApp crea una URL firmada del propio dashboard y luego el Worker
    descarga desde Graph API con Bearer;
  - ManyChat y adaptadores aprendidos pueden entregar CDNs variables.
- No existe un binding de egress confiable. No se debe simular seguridad
  resolviendo DNS una vez desde el Worker.

## Comandos necesarios

| Propósito         | Comando                                                                                                                                                                                 | Resultado esperado                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Tests de política | `corepack pnpm@10.34.5 test -- test/media/urlPolicy.test.ts test/media/transcribe.test.ts test/media/vision.test.ts test/agent.media.test.ts`                                           | todos pasan                         |
| Tests de canales  | `corepack pnpm@10.34.5 test -- test/channels/telegram.test.ts test/channels/twilio.test.ts test/channels/whatsapp.test.ts test/channels/manychat.test.ts test/channels/learned.test.ts` | todos los archivos existentes pasan |
| Tipos             | `corepack pnpm@10.34.5 typecheck`                                                                                                                                                       | exit 0                              |
| Calidad           | `corepack pnpm@10.34.5 check`                                                                                                                                                           | exit 0                              |

Si uno de los archivos de test de canal enumerados no existe, créalo solo si
ese canal cambia; no elimines el nombre silenciosamente de la cobertura.

## Alcance

**Dentro del alcance — únicos archivos modificables:**

- `src/env.ts`
- `src/agent.ts`
- `src/media/urlPolicy.ts`
- `src/media/transcribe.ts`
- `src/media/vision.ts`
- `src/channels/telegram.ts`
- `src/channels/twilio.ts`
- `src/channels/whatsapp.ts`
- `src/channels/manychat.ts`
- `src/channels/learned.ts`
- `test/media/urlPolicy.test.ts`
- `test/media/transcribe.test.ts`
- `test/media/vision.test.ts`
- `test/agent.media.test.ts`
- tests de los cinco canales anteriores
- `README.md`
- `SECURITY.md`
- `plans/README.md`

**Fuera de alcance:**

- Crear o desplegar un proxy de egress.
- Hacer consultas DNS desde el Worker y considerar su resultado una garantía.
- Aceptar comodines de dominio, sufijos de public suffix o hosts por substring.
- Modificar `wrangler.toml`, `member/`, secretos o credenciales.
- Desplegar a Cloudflare o realizar llamadas reales a proveedores.
- Eliminar los límites existentes de protocolo, redirección, tamaño o timeout.

## Flujo Git

- Rama: `advisor/006-media-host-policy`.
- Commits sugeridos:
  - `feat(security): restrict media hosts by channel`
  - `test(security): cover media host and redirect policy`
  - `docs(security): document media egress residual risk`
- No publicar ni abrir PR salvo instrucción expresa.

## Pasos

### Paso 1: Modelar una política explícita y cerrada

En `src/media/urlPolicy.ts`, crea un tipo inmutable de política con una
colección de hostnames exactos normalizados. Cambia
`assertSafeExternalMediaUrl()` y `fetchSafeExternalMedia()` para requerirla:
no debe existir un valor por defecto permisivo.

Reglas:

- normalizar con `new URL(...).hostname.toLowerCase()` y eliminar el punto
  final DNS si existe;
- conservar HTTPS, ausencia de credenciales, puerto 443, bloqueo de nombres
  locales/IP literales y límites actuales;
- exigir igualdad exacta con un hostname permitido;
- no admitir `endsWith`, `includes`, `*.example.com` ni patrones;
- aplicar la misma política a cada redirect;
- si un redirect cambia a otro host, solo seguirlo si el host destino también
  está permitido explícitamente;
- mensajes de error no deben incluir credenciales ni query strings.

**Verificar**:
`corepack pnpm@10.34.5 test -- test/media/urlPolicy.test.ts` debe pasar tras
añadir casos de host permitido/no permitido.

### Paso 2: Derivar la política desde el canal y la configuración no secreta

Crea en el módulo de política una función pura
`mediaHostPolicyFor(channel, env)` o equivalente.

- Telegram: `api.telegram.org`.
- Twilio: usa el hostname exacto que generen los fixtures y la documentación
  del endpoint de media real; no adivines un subdominio. Si hay más de uno,
  enuméralos individualmente.
- WhatsApp: hostname exacto de `DASHBOARD_BASE_URL` para la URL firmada y los
  hosts exactos de Graph API que la aplicación construye.
- ManyChat y learned: deniega por defecto los hosts desconocidos y permite
  sumar una lista operativa explícita `MEDIA_ALLOWED_HOSTS` de nombres exactos
  separados por comas.
- Los hosts configurados deben validarse al arrancar/usar: solo hostname, sin
  esquema, puerto, path, credenciales ni comodines. Entradas inválidas se
  ignoran con aviso seguro o producen error de configuración claro; elige una
  conducta y pruébala.

Añade `MEDIA_ALLOWED_HOSTS?: string` a `Env`, pero no añadas ni cambies valores
en `wrangler.toml`. Documenta en README que es opcional, no secreto, de
denegación por defecto y necesario para CDNs variables.

**Verificar**:
`corepack pnpm@10.34.5 typecheck` termina en exit 0.

### Paso 3: Aplicar la política en audio e imagen

- `transcribeAudio()` debe recibir la política explícita y pasarla a
  `fetchSafeExternalMedia()`.
- `buildMultimodalUserMessage()` debe recibir la misma política y validar la
  URL antes de entregarla al SDK de IA.
- `SupportAgent.ingest()`/`processBuffer()` debe derivar la política a partir
  del canal guardado y el entorno; no debe confiar en una allowlist enviada
  por el webhook.
- Si una URL no está autorizada:
  - audio mantiene el fallback amable ya existente;
  - imagen no debe persistir el marcador `[IMAGE_URL: ...]`;
  - no se hace `fetch`;
  - se registra solo canal/razón, nunca la URL completa con query firmada.
- No serialices tokens ni URLs firmadas nuevas dentro del estado para
  «recordar» confianza.

**Verificar**:
los tests de medios demuestran que un host autorizado llega a AI y uno no
autorizado no ejecuta `fetch` ni construye contenido de imagen.

### Paso 4: Cubrir canales, redirects y normalización

Añade pruebas unitarias para:

- host exacto aceptado y subdominio impostor rechazado
  (`api.telegram.org.attacker.test`);
- hostname con mayúsculas y punto final normalizado;
- URL con usuario, puerto alternativo, IPv4 privada, IPv6, localhost y HTTP;
- redirect permitido dentro del mismo host;
- redirect a host permitido distinto;
- redirect a host no permitido, local o IP privada;
- lista operativa válida, duplicados y entradas inválidas;
- Telegram/Twilio/WhatsApp con sus hosts esperados;
- ManyChat/learned sin configuración: fail closed;
- ManyChat/learned con un hostname exacto configurado: success;
- imagen de tier Pro y audio en `SupportAgent`.

No uses DNS ni red real en los tests. Intercepta `globalThis.fetch`.

**Verificar**: los dos comandos de tests focales terminan en exit 0.

### Paso 5: Documentar el control y el residual

En `SECURITY.md` y README documenta:

- el control por host exacto y por canal;
- que `MEDIA_ALLOWED_HOSTS` amplía la superficie y debe contener solo
  proveedores administrados;
- que no hay garantía de IP/ASN sin egress confiable;
- que una allowlist de dominio reduce el riesgo de payload arbitrario, pero un
  dominio permitido comprometido sigue siendo riesgo residual;
- recomendación futura: Service Binding/proxy que resuelva y conecte bajo una
  política de red confiable.

No incluyas valores reales ni ejemplos que parezcan secretos.

**Verificar**:
`rg -n "MEDIA_ALLOWED_HOSTS|DNS rebinding|egress" README.md SECURITY.md` debe
encontrar la configuración y el riesgo residual.

### Paso 6: Ejecutar validación completa

Ejecuta tests, cobertura, tipos y diff. Confirma que no cambió ninguna URL
funcional de envío; solo la aceptación de URLs entrantes de medios.

**Verificar**:

```powershell
corepack pnpm@10.34.5 check
corepack pnpm@10.34.5 test:coverage
git diff --check
git diff --name-only
```

Todos los comandos de calidad deben pasar y la última salida solo debe contener
archivos de alcance.

## Plan de pruebas

- Extiende `test/media/urlPolicy.test.ts` para reglas puras y redirects.
- Extiende `test/media/transcribe.test.ts` y `test/media/vision.test.ts` para
  propagación de política.
- Usa `test/agent.media.test.ts` para verificar el comportamiento funcional
  amable de rechazo.
- Los tests de canal deben afirmar los hosts generados, no solo que existe una
  URL.

## Criterios de terminado

- [x] No existe llamada a `assertSafeExternalMediaUrl` o
      `fetchSafeExternalMedia` sin política explícita.
- [x] Un hostname público arbitrario se rechaza por defecto.
- [x] Todos los redirects se validan contra la misma lista exacta.
- [x] ManyChat/learned requieren una aprobación explícita para hosts variables.
- [x] Audio e imagen rechazada no producen fetch ni exposición de URL firmada.
- [x] `check` y `test:coverage` pasan.
- [x] README y SECURITY explican la configuración y el residual.
- [x] No se modificaron `wrangler.toml`, `member/` ni secretos.
- [x] `plans/README.md` marca el plan como completado.

## Condiciones de parada

Detente e informa si:

- un proveedor legítimo no documenta hosts estables y no existe un contrato
  operativo para mantener `MEDIA_ALLOWED_HOSTS`;
- la solución exige inspección/resolución DNS que Workers no puede garantizar;
- se requiere modificar bindings o placeholders de `wrangler.toml`;
- mantener compatibilidad exigiría volver a aceptar cualquier hostname;
- una verificación falla dos veces tras un arreglo razonable;
- sería necesario tocar `member/`, secretos o desplegar.

## Notas de mantenimiento

- Cada nuevo canal debe declarar sus hosts de medios y añadir pruebas de
  suplantación antes de habilitarse.
- Revisar trimestralmente los hosts configurados y retirar los no usados.
- Una futura capa de egress confiable debe reemplazar, no duplicar de forma
  contradictoria, este control compensatorio.
