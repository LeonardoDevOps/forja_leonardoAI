import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeSync,
} from "node:fs";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

const DEFAULT_LIMITS = Object.freeze({
  compressedBytes: 64 * 1024 * 1024,
  uncompressedBytes: 256 * 1024 * 1024,
  fileBytes: 64 * 1024 * 1024,
  entries: 20_000,
});

class CliSecurityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CliSecurityError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CliSecurityError(code, message);
}

function isInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function assertInside(root, candidate) {
  const canonicalRoot = resolve(root);
  const canonicalCandidate = resolve(candidate);
  if (!isInside(canonicalRoot, canonicalCandidate)) {
    fail("PATH_OUTSIDE_ROOT", `La ruta queda fuera del destino permitido: ${candidate}`);
  }
  return canonicalCandidate;
}

function assertRealDirectory(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("UNSAFE_DIRECTORY", `El directorio no es una carpeta física segura: ${path}`);
  }
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function ensureRootDirectory(root) {
  const absolute = resolve(root);
  mkdirSync(absolute, { recursive: true });
  assertRealDirectory(absolute);
  return absolute;
}

function ensureDirectoryInside(root, directory) {
  const absoluteRoot = ensureRootDirectory(root);
  const absoluteDirectory = assertInside(absoluteRoot, directory);
  const rel = relative(absoluteRoot, absoluteDirectory);
  let current = absoluteRoot;

  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatIfPresent(current);
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        fail("UNSAFE_DIRECTORY", `El directorio no es una carpeta física segura: ${current}`);
      }
      continue;
    }
    mkdirSync(current);
    assertRealDirectory(current);
  }
  return absoluteDirectory;
}

function assertSafeTarget(target) {
  const stat = lstatIfPresent(target);
  if (!stat) return false;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail("UNSAFE_WRITE_TARGET", `Se rechazó un destino que no es archivo físico: ${target}`);
  }
  return true;
}

function writeAll(fd, data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  let offset = 0;
  while (offset < buffer.length) offset += writeSync(fd, buffer, offset, buffer.length - offset);
}

function atomicWriteFile(target, data, options = {}) {
  const absoluteTarget = resolve(target);
  const root = resolve(options.root || dirname(absoluteTarget));
  assertInside(root, absoluteTarget);
  ensureDirectoryInside(root, dirname(absoluteTarget));
  const existed = assertSafeTarget(absoluteTarget);

  const mode = options.mode ?? 0o600;
  const temp = join(dirname(absoluteTarget), `.${parse(absoluteTarget).base}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temp, "wx", mode);
    writeAll(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, absoluteTarget);
    try {
      chmodSync(absoluteTarget, mode);
    } catch {
      // chmod no está disponible en todos los sistemas de archivos de Windows.
    }
    return { created: !existed };
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // El error original es el relevante.
      }
    }
    rmSync(temp, { force: true });
    throw error;
  }
}

function trustedHttpsOrigin(raw, label = "servicio") {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    fail("UNTRUSTED_ORIGIN", `La URL de ${label} no es válida.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    fail("UNTRUSTED_ORIGIN", `La URL de ${label} debe ser un origen HTTPS exacto.`);
  }
  return url.origin;
}

function serviceUrl(origin, pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) {
    fail("UNTRUSTED_SERVICE_PATH", "La ruta del servicio debe ser absoluta dentro del origen.");
  }
  const trustedOrigin = trustedHttpsOrigin(origin);
  const url = new URL(pathname, `${trustedOrigin}/`);
  if (url.origin !== trustedOrigin) {
    fail("UNTRUSTED_SERVICE_PATH", "La ruta intentó cambiar el origen del servicio.");
  }
  return url.toString();
}

function strictJsonBody(fields, allowedFields) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) {
      fail("UNEXPECTED_NETWORK_FIELD", `El campo de red no permitido fue rechazado: ${key}`);
    }
  }
  return JSON.stringify(
    Object.fromEntries(
      allowedFields.filter((key) => fields[key] !== undefined).map((key) => [key, fields[key]]),
    ),
  );
}

function normalizeSha256(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256[=:]/, "");
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function verifyArtifactIntegrity(buffer, expected, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  if (!Buffer.isBuffer(buffer)) fail("INVALID_ARTIFACT", "El artefacto debe ser binario.");
  if (buffer.length > limits.compressedBytes) {
    fail("ARTIFACT_TOO_LARGE", "El artefacto comprimido supera el límite permitido.");
  }

  const actual = createHash("sha256").update(buffer).digest("hex");
  if (!expected) {
    if (options.requireChecksum) {
      fail("ARTIFACT_CHECKSUM_MISSING", "El servidor no entregó el checksum SHA-256 obligatorio.");
    }
    return { verified: false, sha256: actual };
  }

  const normalized = normalizeSha256(expected);
  if (!normalized) fail("ARTIFACT_CHECKSUM_INVALID", "El checksum SHA-256 recibido no es válido.");
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(normalized, "hex");
  if (!timingSafeEqual(actualBytes, expectedBytes)) {
    fail("ARTIFACT_CHECKSUM_MISMATCH", "El artefacto no coincide con el checksum SHA-256 publicado.");
  }
  return { verified: true, sha256: actual };
}

function parseTarString(header, offset, length) {
  const end = header.indexOf(0, offset);
  const stop = end >= offset && end < offset + length ? end : offset + length;
  return header.subarray(offset, stop).toString("utf8").trim();
}

function parseTarNumber(header, offset, length, field) {
  const bytes = header.subarray(offset, offset + length);
  if ((bytes[0] & 0x80) !== 0) fail("UNSUPPORTED_TAR_NUMBER", `Formato numérico TAR no admitido: ${field}`);
  const raw = bytes.toString("ascii").replace(/\0.*$/, "").trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) fail("INVALID_TAR_HEADER", `Valor TAR inválido: ${field}`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("INVALID_TAR_HEADER", `Valor TAR fuera de rango: ${field}`);
  }
  return value;
}

function verifyTarHeaderChecksum(header) {
  const expected = parseTarNumber(header, 148, 8, "checksum");
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) fail("INVALID_TAR_CHECKSUM", "El header TAR tiene un checksum inválido.");
}

function parsePax(data) {
  const fields = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) fail("INVALID_PAX_HEADER", "Registro PAX incompleto.");
    const length = Number.parseInt(data.subarray(offset, space).toString("ascii"), 10);
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > data.length) {
      fail("INVALID_PAX_HEADER", "Longitud PAX inválida.");
    }
    const record = data.subarray(space + 1, offset + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals > 0) fields[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return fields;
}

function normalizeArchivePath(raw) {
  const initial = String(raw || "");
  const value = initial.replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
  if (
    !value ||
    initial.includes("\0") ||
    initial.includes("\\") ||
    initial.startsWith("/") ||
    /^[a-zA-Z]:/.test(initial)
  ) {
    fail("UNSAFE_ARCHIVE_PATH", `Ruta insegura en el artefacto: ${raw}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    fail("UNSAFE_ARCHIVE_PATH", `Ruta insegura en el artefacto: ${raw}`);
  }
  return parts.join("/");
}

function parseTarGz(buffer, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  verifyArtifactIntegrity(buffer, options.expectedSha256, {
    requireChecksum: options.requireChecksum,
    limits,
  });

  let archive;
  try {
    archive = gunzipSync(buffer, { maxOutputLength: limits.uncompressedBytes });
  } catch (error) {
    if (error?.code === "ERR_BUFFER_TOO_LARGE") {
      fail("ARCHIVE_TOO_LARGE", "El artefacto expandido supera el límite permitido.");
    }
    fail("INVALID_GZIP", "El artefacto no es un GZIP válido.");
  }

  const entries = [];
  const seenFiles = new Set();
  let offset = 0;
  let localPax = {};
  let globalPax = {};
  let longName = null;
  let totalFileBytes = 0;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) break;
    verifyTarHeaderChecksum(header);

    const rawSize = parseTarNumber(header, 124, 12, "size");
    const mode = parseTarNumber(header, 100, 8, "mode");
    const type = String.fromCharCode(header[156] || 0);
    const dataEnd = offset + rawSize;
    if (dataEnd > archive.length) fail("TRUNCATED_TAR", "El artefacto TAR está truncado.");
    const data = archive.subarray(offset, dataEnd);
    offset += Math.ceil(rawSize / 512) * 512;

    if (type === "x" || type === "g") {
      const pax = parsePax(data);
      if (type === "g") globalPax = { ...globalPax, ...pax };
      else localPax = pax;
      continue;
    }
    if (type === "L") {
      longName = data.toString("utf8").replace(/\0.*$/, "").trim();
      continue;
    }
    if (type === "K") fail("UNSAFE_ARCHIVE_LINK", "El artefacto contiene un enlace GNU.");

    const prefix = parseTarString(header, 345, 155);
    const headerName = parseTarString(header, 0, 100);
    const pax = { ...globalPax, ...localPax };
    const rawName = pax.path || longName || (prefix ? `${prefix}/${headerName}` : headerName);
    localPax = {};
    longName = null;
    if (pax.linkpath) fail("UNSAFE_ARCHIVE_LINK", "El artefacto contiene un destino de enlace PAX.");
    if (pax.size !== undefined && Number(pax.size) !== rawSize) {
      fail("INVALID_PAX_HEADER", "El tamaño PAX no coincide con el header TAR.");
    }

    const path = normalizeArchivePath(rawName);
    const kind = type === "5" ? "directory" : type === "\0" || type === "0" ? "file" : null;
    if (!kind) {
      const label = type === "1" ? "hardlink" : type === "2" ? "symlink" : `tipo ${JSON.stringify(type)}`;
      fail("UNSAFE_ARCHIVE_ENTRY", `El artefacto contiene una entrada no admitida: ${label}.`);
    }
    if (kind === "directory" && rawSize !== 0) {
      fail("INVALID_TAR_HEADER", "Un directorio TAR declaró contenido.");
    }
    if (kind === "file") {
      if (rawSize > limits.fileBytes) fail("ARCHIVE_FILE_TOO_LARGE", `Archivo demasiado grande: ${path}`);
      totalFileBytes += rawSize;
      if (totalFileBytes > limits.uncompressedBytes) {
        fail("ARCHIVE_TOO_LARGE", "El contenido total del artefacto supera el límite permitido.");
      }
      if (seenFiles.has(path)) fail("DUPLICATE_ARCHIVE_PATH", `Ruta duplicada en el artefacto: ${path}`);
      seenFiles.add(path);
    }

    entries.push({ path, kind, mode, data: kind === "file" ? Buffer.from(data) : null });
    if (entries.length > limits.entries)
      fail("TOO_MANY_ARCHIVE_ENTRIES", "El artefacto contiene demasiadas entradas.");
  }
  if (!entries.length) fail("EMPTY_ARCHIVE", "El artefacto no contiene archivos.");
  return entries;
}

function materializeStage(entries, parent) {
  ensureRootDirectory(parent);
  const stage = mkdtempSync(join(parent, ".forja-stage-"));
  try {
    for (const entry of entries.filter(({ kind }) => kind === "directory")) {
      ensureDirectoryInside(stage, join(stage, ...entry.path.split("/")));
    }
    for (const entry of entries.filter(({ kind }) => kind === "file")) {
      const target = join(stage, ...entry.path.split("/"));
      const mode = entry.mode & 0o111 ? 0o755 : 0o644;
      atomicWriteFile(target, entry.data, { root: stage, mode });
    }
    return stage;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function validateInstallSlug(slug) {
  const value = String(slug || "").trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value)) {
    fail("INVALID_INSTALL_SLUG", "El identificador del bot no es seguro para crear una carpeta.");
  }
  return value;
}

function extractFreshArchive(buffer, destination, options = {}) {
  const absoluteDestination = resolve(destination);
  const parent = dirname(absoluteDestination);
  const entries = parseTarGz(buffer, options);
  let stage = materializeStage(entries, parent);
  try {
    const destinationStat = lstatIfPresent(absoluteDestination);
    if (destinationStat) {
      if (destinationStat.isSymbolicLink() || !destinationStat.isDirectory()) {
        fail("UNSAFE_DIRECTORY", `El directorio no es una carpeta física segura: ${absoluteDestination}`);
      }
      if (readdirSync(absoluteDestination).length > 0) {
        fail("INSTALL_DESTINATION_NOT_EMPTY", "La carpeta de instalación ya existe y no está vacía.");
      }
      rmdirSync(absoluteDestination);
    }
    renameSync(stage, absoluteDestination);
    stage = null;
    return absoluteDestination;
  } finally {
    if (stage) rmSync(stage, { recursive: true, force: true });
  }
}

function isPreservedUpdatePath(path) {
  const normalized = String(path).replaceAll("\\", "/").replace(/^\.\//, "");
  return (
    normalized === "wrangler.toml" ||
    normalized === ".dev.vars" ||
    normalized.startsWith(".dev.vars.") ||
    normalized === ".env" ||
    normalized.startsWith(".env.") ||
    normalized === ".bot-state.json" ||
    normalized === ".bot-setup.json" ||
    normalized === ".horizontes-bot.json" ||
    /^member\/[^/]+\.local\.ts$/.test(normalized) ||
    normalized === "member/kb" ||
    normalized.startsWith("member/kb/")
  );
}

function extractOverArchive(buffer, destination, options = {}) {
  const absoluteDestination = resolve(destination);
  assertRealDirectory(absoluteDestination);
  const entries = parseTarGz(buffer, options);
  const stage = materializeStage(entries, dirname(absoluteDestination));
  try {
    for (const entry of entries.filter(({ kind }) => kind === "directory")) {
      if (isPreservedUpdatePath(entry.path)) continue;
      ensureDirectoryInside(absoluteDestination, join(absoluteDestination, ...entry.path.split("/")));
    }
    for (const entry of entries.filter(({ kind }) => kind === "file")) {
      if (isPreservedUpdatePath(entry.path)) continue;
      const source = join(stage, ...entry.path.split("/"));
      const target = join(absoluteDestination, ...entry.path.split("/"));
      const mode = entry.mode & 0o111 ? 0o755 : 0o644;
      atomicWriteFile(target, readFileSync(source), { root: absoluteDestination, mode });
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

export {
  CliSecurityError,
  DEFAULT_LIMITS,
  atomicWriteFile,
  extractFreshArchive,
  extractOverArchive,
  isPreservedUpdatePath,
  parseTarGz,
  serviceUrl,
  strictJsonBody,
  trustedHttpsOrigin,
  validateInstallSlug,
  verifyArtifactIntegrity,
};
