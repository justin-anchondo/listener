import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CryptoError,
  decryptField,
  deriveKey,
  encryptField,
  generateDataKey,
  parseMasterKey,
  unwrapDataKey,
  wrapDataKey,
} from "@/lib/crypto/keys";

const master = randomBytes(32);
const clientA = "11111111-1111-4111-8111-111111111111";
const clientB = "22222222-2222-4222-8222-222222222222";
const row = "33333333-3333-4333-8333-333333333333";
const ref = { clientId: clientA, column: "transcript_segments.text", rowId: row };

describe("master key", () => {
  it("accepts 32 bytes of base64 and rejects anything else", () => {
    expect(parseMasterKey(master.toString("base64"))).toEqual(master);
    expect(() => parseMasterKey(undefined)).toThrow(CryptoError);
    expect(() => parseMasterKey(randomBytes(16).toString("base64"))).toThrow(CryptoError);
  });

  it("derives distinct keys per purpose", () => {
    expect(deriveKey(master, "session")).not.toEqual(deriveKey(master, "challenge"));
    expect(deriveKey(master, "session")).toEqual(deriveKey(master, "session"));
  });
});

describe("data keys", () => {
  it("round trips through wrapping", () => {
    const dek = generateDataKey();
    expect(unwrapDataKey(master, wrapDataKey(master, dek, clientA), clientA)).toEqual(dek);
  });

  it("will not unwrap under another client id or master key", () => {
    const wrapped = wrapDataKey(master, generateDataKey(), clientA);
    expect(() => unwrapDataKey(master, wrapped, clientB)).toThrow(CryptoError);
    expect(() => unwrapDataKey(randomBytes(32), wrapped, clientA)).toThrow(CryptoError);
  });
});

describe("fields", () => {
  const dek = generateDataKey();

  it("round trips text, including unicode", () => {
    const text = "We'll ship by July 2027 — confirmed ✅";
    expect(decryptField(dek, ref, encryptField(dek, ref, text))).toBe(text);
  });

  it("does not contain the plaintext", () => {
    const sealed = encryptField(dek, ref, "pricing is 40k");
    expect(sealed).not.toContain("pricing");
    expect(Buffer.from(sealed.slice(3), "base64").toString("utf8")).not.toContain("pricing");
  });

  it("uses a fresh nonce every time", () => {
    expect(encryptField(dek, ref, "same")).not.toBe(encryptField(dek, ref, "same"));
  });

  it("detects tampering", () => {
    const sealed = encryptField(dek, ref, "hello");
    const raw = Buffer.from(sealed.slice(3), "base64");
    raw[raw.length - 20] ^= 1;
    expect(() => decryptField(dek, ref, `v1:${raw.toString("base64")}`)).toThrow(CryptoError);
  });

  it("rejects a ciphertext moved to another client, column, or row", () => {
    const sealed = encryptField(dek, ref, "hello");
    expect(() => decryptField(dek, { ...ref, clientId: clientB }, sealed)).toThrow(CryptoError);
    expect(() => decryptField(dek, { ...ref, column: "projects.name" }, sealed)).toThrow(CryptoError);
    expect(() => decryptField(dek, { ...ref, rowId: clientB }, sealed)).toThrow(CryptoError);
  });

  it("rejects the wrong data key", () => {
    expect(() => decryptField(generateDataKey(), ref, encryptField(dek, ref, "x"))).toThrow(CryptoError);
  });

  it("rejects malformed input", () => {
    expect(() => decryptField(dek, ref, "v2:abc")).toThrow(CryptoError);
    expect(() => decryptField(dek, ref, "v1:" + Buffer.alloc(5).toString("base64"))).toThrow(CryptoError);
    expect(() => decryptField(dek, ref, "garbage")).toThrow(CryptoError);
  });
});
