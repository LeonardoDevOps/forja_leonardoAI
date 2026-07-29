# Política de seguridad

## Versiones soportadas

| Versión                        | Soporte        |
| ------------------------------ | -------------- |
| Rama `main`                    | Sí             |
| Commits o versiones anteriores | No garantizado |

Las correcciones de seguridad se preparan primero para `main`. Quien mantenga una
instalación propia debe revisar y aplicar esas actualizaciones sin sustituir su
configuración privada de `member/`.

## Reportar una vulnerabilidad

Usa el reporte privado de **GitHub Security Advisories** de este repositorio
(`Security` → `Advisories` → `Report a vulnerability`). No publiques detalles
explotables, pruebas de concepto ni datos sensibles en un issue público.

Incluye, cuando sea posible:

- componente, ruta y versión o commit afectados;
- impacto y condiciones necesarias para reproducir el problema;
- pasos mínimos de reproducción sin datos reales;
- mitigación o corrección sugerida;
- forma segura de contactar contigo dentro del propio advisory.

No adjuntes credenciales, tokens, llaves, conversaciones reales ni datos de clientes.
Usa valores ficticios y elimina metadatos sensibles de capturas o archivos.

## Alcance

Se consideran especialmente relevantes:

- bypass de autenticación o autorización administrativa;
- bypass o ausencia de validación de firmas de webhooks;
- SSRF, inyección SQL o inyección de comandos;
- XSS en el panel o en notificaciones HTML;
- exposición de datos entre usuarios o negocios;
- filtración de secretos o datos de clientes;
- manejo inseguro de archivos, imágenes o audio;
- compromiso de dependencias o del proceso de actualización;
- abuso de herramientas controladas por prompts;
- prompt injection con consecuencias operativas;
- autorización insuficiente en endpoints administrativos o de control.

Los problemas de configuración que requieren exponer deliberadamente el panel, reutilizar
credenciales débiles o modificar el código pueden quedar fuera de alcance, pero se
agradece reportarlos de forma privada si producen un riesgo inesperado.

## Respuesta

Los mantenedores intentarán confirmar la recepción, evaluar severidad y acordar una
divulgación coordinada. El tiempo de corrección depende del impacto y de la compatibilidad
con instalaciones existentes. No se garantiza recompensa económica.
