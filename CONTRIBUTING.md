# Cómo contribuir — Horizontes Bot

¡Gracias por mejorar la plantilla! Esto es de la comunidad, para la comunidad: si tú
encuentras (o arreglas) algo, todos los miembros se benefician.

## ¿Encontraste un bug o tienes una idea? → Abre un Issue

**No necesitas saber programar.** Ve a la pestaña **Issues → New issue**, elige
"🐛 Reportar un problema" o "💡 Proponer una idea", y llena las casillas. Con eso ya
ayudas un montón.

> 💡 Si usas Claude Code, antes de reportar puedes correr `/cliente-misterioso` o pedirle
> "diagnostica mi bot" — a veces te dice qué es al instante.

## ¿Quieres mandar un arreglo? → Pull Request (vía fork)

1. Dale **Fork** a este repo (botón arriba a la derecha).
2. En tu fork, crea una rama y haz tu cambio. Usa Node 22 o 24 y pnpm 10.34.5. Si usas
   Claude Code, pídele que corra `pnpm check` antes.
3. Abre un **Pull Request** hacia `main` de este repo, explicando **qué cambia y por qué**.
4. Mantén la rama actualizada. Para fusionar deben pasar `Node 22`, `Node 24` y
   `JavaScript y TypeScript` (CodeQL), resolverse las conversaciones y existir
   al menos una aprobación válida. Tú no haces push directo a `main`.

### Reglas

- **No toques `member/`** (es la config de cada quien). Cambios solo en `src/`, `test/`,
  `skill/` o documentación.
- **Un PR = un solo tema.** Enfocado y chico = se revisa y mergea más rápido.
- Si tu **agente** abrió el PR, **revisa el diff tú mismo** antes — tú eres responsable.
- **Nada de secrets ni API keys** en el código (van como `wrangler secret`).
- Los PR de Dependabot también se revisan. Una actualización automática no
  autoriza cambios en `member/`, placeholders de `wrangler.toml` ni archivos
  privados.
- Dependency Review bloquea dependencias nuevas de severidad `HIGH` donde la
  API de GitHub está disponible. En PR procedentes de forks puede omitirse por
  un `403`; los checks de CI, CodeQL y la revisión humana siguen siendo
  obligatorios.

### Comprobaciones locales

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm security:audit
```

`pnpm check` agrupa formato, lint, tipos y tests. `pnpm check:ci` añade cobertura. Ninguno
de estos comandos despliega infraestructura; no uses `pnpm deploy` para validar un PR.

## Dudas rápidas

Mejor en la **comunidad de Horizontes IA (Skool)**. Los issues aquí son para bugs e ideas
sobre la plantilla.
