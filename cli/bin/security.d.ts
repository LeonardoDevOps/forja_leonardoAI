export type ArchiveLimits = {
  compressedBytes: number;
  uncompressedBytes: number;
  fileBytes: number;
  entries: number;
};

export type ArchiveOptions = {
  expectedSha256?: string | null;
  requireChecksum?: boolean;
  limits?: Partial<ArchiveLimits>;
};

export type ArchiveEntry = {
  path: string;
  kind: "directory" | "file";
  mode: number;
  data: Buffer | null;
};

export class CliSecurityError extends Error {
  code: string;
}

export const DEFAULT_LIMITS: Readonly<ArchiveLimits>;

export function atomicWriteFile(
  target: string,
  data: string | Buffer,
  options?: { root?: string; mode?: number },
): { created: boolean };

export function extractFreshArchive(buffer: Buffer, destination: string, options?: ArchiveOptions): string;

export function extractOverArchive(buffer: Buffer, destination: string, options?: ArchiveOptions): void;

export function isPreservedUpdatePath(path: string): boolean;
export function parseTarGz(buffer: Buffer, options?: ArchiveOptions): ArchiveEntry[];
export function serviceUrl(origin: string, pathname: string): string;
export function strictJsonBody(fields: Record<string, unknown>, allowedFields: string[]): string;
export function trustedHttpsOrigin(raw: string, label?: string): string;
export function validateInstallSlug(slug: string): string;
export function verifyArtifactIntegrity(
  buffer: Buffer,
  expected?: string | null,
  options?: { requireChecksum?: boolean; limits?: Partial<ArchiveLimits> },
): { verified: boolean; sha256: string };
