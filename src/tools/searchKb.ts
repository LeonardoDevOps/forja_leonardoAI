import { tool } from "ai";
import { z } from "zod";
import type { Env } from "../env";

export interface SearchKbResult {
  title: string;
  content: string;
  score: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

export function searchKbTool(env: Env) {
  return tool({
    description:
      "Busca en el knowledge base del negocio. Devuelve top-5 chunks con score 0-1. Si top-1 score < 0.7 no hay match útil — escala.",
    inputSchema: z.object({
      query: z.string().min(2).describe("Pregunta o tema a buscar"),
    }),
    execute: async ({ query }) => {
      try {
        const embedding: unknown = await env.AI.run("@cf/baai/bge-m3", {
          text: query,
        });
        const data = isRecord(embedding) ? embedding.data : undefined;
        const vec = Array.isArray(data) ? data[0] : undefined;
        if (!Array.isArray(vec) || !vec.every((value) => typeof value === "number")) {
          return { error: "transient" as const, message: "embedding shape unexpected" };
        }
        const matches = await env.KB.query(vec, { topK: 5 });
        const results: SearchKbResult[] = (matches.matches ?? []).map((match) => ({
          title: typeof match.metadata?.title === "string" ? match.metadata.title : "",
          content: typeof match.metadata?.content === "string" ? match.metadata.content : "",
          score: match.score ?? 0,
        }));
        return { results };
      } catch (error: unknown) {
        return { error: "transient" as const, message: errorMessage(error) };
      }
    },
  });
}
