import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round4(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function numberField(fields: Record<string, unknown>, field: string): number {
  const value = fields[field];
  return typeof value === "number" ? value : 0;
}

export function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Date / time helpers
// ---------------------------------------------------------------------------

export function toIso(date: Date): string {
  return date.toISOString();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function latestTimestamp(values: (string | undefined)[]): string | undefined {
  return values.filter(Boolean).sort().at(-1);
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

// ---------------------------------------------------------------------------
// Symbol normalization
// ---------------------------------------------------------------------------

export function normalizeSymbol(value: string): string {
  if (!value) return "";
  const trimmed = value.trim().toUpperCase();
  if (trimmed.endsWith(".SZ") || trimmed.endsWith(".SH")) return trimmed;
  const code = trimmed.split(".")[0] ?? trimmed;
  return `${code}.${code.startsWith("6") ? "SH" : "SZ"}`;
}

export function normalizeSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
}

export function symbolCode(symbol: string): string {
  return symbol.split(".")[0] ?? symbol;
}

export function toEastMoneySecid(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const code = symbolCode(normalized);
  const market = normalized.endsWith(".SH") ? "1" : "0";
  return `${market}.${code}`;
}

export function toTencentSymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const code = symbolCode(normalized);
  const market = normalized.endsWith(".SH") ? "sh" : "sz";
  return `${market}${code}`;
}

export function toSinaSymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  const code = symbolCode(normalized);
  const market = normalized.endsWith(".SH") ? "sh" : "sz";
  return `${market}${code}`;
}

// ---------------------------------------------------------------------------
// Cache I/O (generic)
// ---------------------------------------------------------------------------

export async function writeJsonCache<T>(cacheFile: string, data: T): Promise<void> {
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(data), "utf8");
}

export async function readJsonCache<T>(cacheFile: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(cacheFile, "utf8")) as T;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPrice(value: number): string {
  return value.toFixed(2);
}
