import { createCipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptIfNeeded, extractToken, parseRowsPayload } from "@/lib/cctns";

function encryptForTest(json: string, keyBase64: string) {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(json), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

describe("CCTNS API helpers", () => {
  const key = "O7yhrqWMMymKrM9Av64JkXo3GOoTebAyJlQ9diSxi0U=";

  it("extracts tokens from JSON strings, XML wrappers, and raw strings", () => {
    expect(extractToken('"TOKEN"')).toBe("TOKEN");
    expect(extractToken('<string xmlns="x">TOKEN</string>')).toBe("TOKEN");
    expect(extractToken("TOKEN")).toBe("TOKEN");
  });

  it("passes through plain JSON payloads", () => {
    const rows = parseRowsPayload('[{"Name":"AMBALA","ID":13221}]');
    expect(rows).toEqual([{ Name: "AMBALA", ID: 13221 }]);
  });

  it("decrypts AES complaint payloads", () => {
    const encrypted = encryptForTest('[{"COMPL_REG_NUM":"A1"}]', key);
    expect(decryptIfNeeded(encrypted, key)).toBe('[{"COMPL_REG_NUM":"A1"}]');
  });
});

