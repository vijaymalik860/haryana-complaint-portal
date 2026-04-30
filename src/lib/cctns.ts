import { createDecipheriv } from "node:crypto";

import { CCTNS_CONFIG } from "@/lib/config";
import { formatApiDate } from "@/lib/dates";

type JsonObject = Record<string, unknown>;

export function extractToken(text: string): string {
  const trimmed = text.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed.trim();
  } catch {
    // Some endpoints return XML or raw strings.
  }

  const xmlMatch = trimmed.match(/<string[^>]*>([^<]+)<\/string>/i);
  if (xmlMatch) return xmlMatch[1].trim();

  return trimmed.replace(/^"|"$/g, "").trim();
}

export function decryptIfNeeded(text: string, aesKey = CCTNS_CONFIG.aesKey): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "string") return JSON.stringify(parsed);
    return decryptIfNeeded(parsed, aesKey);
  } catch {
    // Not a JSON wrapper; treat as base64 encrypted payload.
  }

  const payload = Buffer.from(trimmed.replace(/^"|"$/g, ""), "base64");
  if (payload.length <= 16) {
    throw new Error(`Encrypted payload is too short (${payload.length} bytes)`);
  }

  const iv = payload.subarray(0, 16);
  const encrypted = payload.subarray(16);
  const key = Buffer.from(aesKey, "base64");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

function unwrapRows(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) return payload as JsonObject[];
  if (!payload || typeof payload !== "object") return [];

  const object = payload as JsonObject;
  if (Array.isArray(object.Result)) return object.Result as JsonObject[];
  if (Array.isArray(object.data)) return object.data as JsonObject[];

  if (typeof object.Result === "string") {
    try {
      const parsed = JSON.parse(object.Result);
      return unwrapRows(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

export function parseRowsPayload(text: string): JsonObject[] {
  const decoded = decryptIfNeeded(text);
  return unwrapRows(JSON.parse(decoded));
}

async function fetchText(url: URL | string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CCTNS request failed ${response.status}: ${text.slice(0, 180)}`);
  }
  return text;
}

export async function fetchToken(): Promise<string> {
  const url = new URL(CCTNS_CONFIG.tokenUrl);
  url.searchParams.set("SecretKey", CCTNS_CONFIG.secretKey);
  return extractToken(await fetchText(url));
}

export async function fetchComplaintRows(
  from: Date,
  to: Date,
): Promise<JsonObject[]> {
  const token = await fetchToken();
  const url = new URL(CCTNS_CONFIG.complaintUrl);
  url.searchParams.set("TimeFrom", formatApiDate(from));
  url.searchParams.set("TimeTo", formatApiDate(to));

  const text = await fetchText(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseRowsPayload(text);
}

export async function fetchReferenceRows(url: string): Promise<JsonObject[]> {
  const text = await fetchText(url, {
    headers: {
      Accept: "application/json",
    },
  });
  return unwrapRows(JSON.parse(text));
}

export async function fetchDistrictRows(): Promise<JsonObject[]> {
  return fetchReferenceRows(CCTNS_CONFIG.districtsUrl);
}

export async function fetchOfficeRows(): Promise<JsonObject[]> {
  return fetchReferenceRows(CCTNS_CONFIG.officesUrl);
}

export async function fetchPoliceStationRows(
  districtId: string,
): Promise<JsonObject[]> {
  const url = new URL(CCTNS_CONFIG.policeStationsUrl);
  url.searchParams.set("state", "13");
  url.searchParams.set("district", districtId);
  return fetchReferenceRows(url.toString());
}

