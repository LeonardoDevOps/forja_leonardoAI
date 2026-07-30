import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CliSecurityError,
  atomicWriteFile,
  extractFreshArchive,
  extractOverArchive,
  parseTarGz,
  serviceUrl,
  strictJsonBody,
  trustedHttpsOrigin,
  validateInstallSlug,
  verifyArtifactIntegrity,
} from "../../cli/bin/security.js";

type TarEntry = {
  name: string;
  body?: string | Buffer;
  type?: "0" | "1" | "2" | "5";
  linkName?: string;
  mode?: number;
};

const roots: string[] = [];

function tempRoot(label = "forja cli áé ") {
  const root = mkdtempSync(join(tmpdir(), label));
  roots.push(root);
  return root;
}

function writeText(target: Buffer, offset: number, length: number, value: string) {
  target.write(value.slice(0, length), offset, length, "utf8");
}

function writeOctal(target: Buffer, offset: number, length: number, value: number) {
  const octal = value.toString(8).padStart(length - 2, "0");
  writeText(target, offset, length, `${octal}\0 `);
}

function tar(entries: TarEntry[]) {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body || "");
    const header = Buffer.alloc(512);
    writeText(header, 0, 100, entry.name);
    writeOctal(header, 100, 8, entry.mode ?? (entry.type === "5" ? 0o755 : 0o644));
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, entry.type === "5" ? 0 : body.length);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = (entry.type || "0").charCodeAt(0);
    if (entry.linkName) writeText(header, 157, 100, entry.linkName);
    writeText(header, 257, 6, "ustar");
    writeText(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeOctal(header, 148, 8, checksum);
    chunks.push(header);
    if (entry.type !== "5") {
      chunks.push(body);
      const padding = (512 - (body.length % 512)) % 512;
      if (padding) chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("integridad y origen", () => {
  it("acepta SHA-256 correcto y rechaza hash alterado o ausente cuando es obligatorio", () => {
    const artifact = Buffer.from("artifact");
    const digest = createHash("sha256").update(artifact).digest("hex");

    expect(verifyArtifactIntegrity(artifact, digest)).toMatchObject({ verified: true, sha256: digest });
    expect(() => verifyArtifactIntegrity(artifact, "0".repeat(64))).toThrowError(
      expect.objectContaining({ code: "ARTIFACT_CHECKSUM_MISMATCH" }),
    );
    expect(() => verifyArtifactIntegrity(artifact, null, { requireChecksum: true })).toThrowError(
      expect.objectContaining({ code: "ARTIFACT_CHECKSUM_MISSING" }),
    );
  });

  it("fija orígenes HTTPS exactos y no permite escapar con rutas", () => {
    expect(trustedHttpsOrigin("https://example.com")).toBe("https://example.com");
    expect(serviceUrl("https://example.com", "/v1/catalog")).toBe("https://example.com/v1/catalog");
    for (const unsafe of [
      "http://example.com",
      "https://user@example.com",
      "https://example.com/base",
      "https://example.com?next=evil",
    ]) {
      expect(() => trustedHttpsOrigin(unsafe)).toThrow(CliSecurityError);
    }
    expect(() => serviceUrl("https://example.com", "//evil.example/path")).toThrow(CliSecurityError);
  });

  it("valida slugs antes de convertirlos en rutas", () => {
    expect(validateInstallSlug("starter-es")).toBe("starter-es");
    for (const unsafe of ["../evil", "/tmp/evil", "C:\\evil", "bot/otro", "Bot Con Espacios"]) {
      expect(() => validateInstallSlug(unsafe)).toThrow(CliSecurityError);
    }
  });
});

describe("extracción segura", () => {
  it("extrae un artefacto legítimo en una ruta con espacios y acentos", () => {
    const root = tempRoot();
    const destination = join(root, "bot válido");
    const artifact = tar([
      { name: "src/", type: "5" },
      { name: "src/index.ts", body: "export const ok = true;\n" },
      { name: "README.md", body: "hola\n" },
    ]);

    extractFreshArchive(artifact, destination);

    expect(readFileSync(join(destination, "src", "index.ts"), "utf8")).toContain("ok = true");
    expect(readFileSync(join(destination, "README.md"), "utf8")).toBe("hola\n");
  });

  it.each([
    ["traversal", { name: "../evil.txt", body: "owned" }],
    ["ruta absoluta", { name: "/tmp/evil.txt", body: "owned" }],
    ["ruta Windows", { name: "C:\\evil.txt", body: "owned" }],
    ["symlink", { name: "link", type: "2" as const, linkName: "../outside" }],
    ["hardlink", { name: "link", type: "1" as const, linkName: "README.md" }],
  ])("rechaza %s", (_label, entry) => {
    expect(() => parseTarGz(tar([entry]))).toThrow(CliSecurityError);
  });

  it("aplica límites de tamaño antes de escribir", () => {
    const artifact = tar([{ name: "large.txt", body: "12345" }]);
    expect(() => parseTarGz(artifact, { limits: { fileBytes: 4 } })).toThrowError(
      expect.objectContaining({ code: "ARCHIVE_FILE_TOO_LARGE" }),
    );
  });

  it("actualiza desde staging sin sobrescribir configuración ni conocimiento local", () => {
    const root = tempRoot();
    const destination = join(root, "bot");
    mkdirSync(join(destination, "member", "kb"), { recursive: true });
    mkdirSync(join(destination, "src"), { recursive: true });
    writeFileSync(join(destination, "wrangler.toml"), "usuario");
    writeFileSync(join(destination, ".env.local"), "secreto");
    writeFileSync(join(destination, "member", "config.local.ts"), "config usuario");
    writeFileSync(join(destination, "member", "kb", "negocio.md"), "kb usuario");
    writeFileSync(join(destination, "src", "index.ts"), "viejo");

    const artifact = tar([
      { name: "wrangler.toml", body: "plantilla" },
      { name: ".env.local", body: "filtrado" },
      { name: "member/", type: "5" },
      { name: "member/kb/", type: "5" },
      { name: "member/config.local.ts", body: "config nueva" },
      { name: "member/kb/negocio.md", body: "kb nueva" },
      { name: "src/", type: "5" },
      { name: "src/index.ts", body: "nuevo" },
      { name: "src/feature.ts", body: "feature" },
    ]);

    extractOverArchive(artifact, destination);

    expect(readFileSync(join(destination, "wrangler.toml"), "utf8")).toBe("usuario");
    expect(readFileSync(join(destination, ".env.local"), "utf8")).toBe("secreto");
    expect(readFileSync(join(destination, "member", "config.local.ts"), "utf8")).toBe("config usuario");
    expect(readFileSync(join(destination, "member", "kb", "negocio.md"), "utf8")).toBe("kb usuario");
    expect(readFileSync(join(destination, "src", "index.ts"), "utf8")).toBe("nuevo");
    expect(readFileSync(join(destination, "src", "feature.ts"), "utf8")).toBe("feature");
  });
});

describe("escrituras atómicas y canónicas", () => {
  it("escribe de forma completa en rutas con espacios y acentos", () => {
    const root = tempRoot();
    const target = join(root, "configuración segura.json");
    atomicWriteFile(target, '{"ok":true}', { root });
    atomicWriteFile(target, '{"ok":"actualizado"}', { root });
    expect(readFileSync(target, "utf8")).toBe('{"ok":"actualizado"}');
    expect(lstatSync(target).isFile()).toBe(true);
  });

  it("rechaza un directorio intermedio que sea symlink o reparse point", () => {
    const root = tempRoot();
    const real = join(root, "real");
    const linked = join(root, "linked");
    mkdirSync(real);
    try {
      symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir");
    } catch (error: any) {
      if (error?.code === "EPERM") return;
      throw error;
    }
    expect(() => atomicWriteFile(join(linked, "config.json"), "unsafe", { root })).toThrowError(
      expect.objectContaining({ code: "UNSAFE_DIRECTORY" }),
    );
  });
});

describe("campos file-to-network", () => {
  it("rechaza campos no incluidos en la lista blanca", () => {
    expect(
      JSON.parse(strictJsonBody({ email: "a@example.com", source: "cli" }, ["email", "source"])),
    ).toEqual({
      email: "a@example.com",
      source: "cli",
    });
    expect(() => strictJsonBody({ email: "a@example.com", env: "SECRET=1" }, ["email"])).toThrowError(
      expect.objectContaining({ code: "UNEXPECTED_NETWORK_FIELD" }),
    );
  });

  it("construye cuerpos previstos para claim y subscribe sin aceptar adjuntos locales", () => {
    const claimBody = JSON.parse(
      strictJsonBody({ email: "a@example.com", name: "Ana", fingerprint: "fp-1", source: "cli" }, [
        "email",
        "name",
        "fingerprint",
        "source",
      ]),
    );
    const subscribeBody = JSON.parse(
      strictJsonBody({ email: "a@example.com", key: "HZN-TEST", fingerprint: "fp-1" }, [
        "email",
        "key",
        "fingerprint",
      ]),
    );
    expect(Object.keys(claimBody).sort()).toEqual(["email", "fingerprint", "name", "source"]);
    expect(Object.keys(subscribeBody).sort()).toEqual(["email", "fingerprint", "key"]);
    expect(JSON.stringify({ claimBody, subscribeBody })).not.toContain(".env");
    expect(JSON.stringify({ claimBody, subscribeBody })).not.toContain("member/");
  });
});
