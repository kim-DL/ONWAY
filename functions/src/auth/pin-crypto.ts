import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
const PIN_PATTERN = /^\d{6}$/;
const SCRYPT_VERSION = "v1";
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export type PinHashOptions = {
  salt?: Buffer;
};

function assertSecret(secret: string, name: string) {
  if (secret.length < 32) {
    throw new Error(`${name} must contain at least 32 characters.`);
  }
}

async function derivePinKey(
  pin: string,
  pepper: string,
  salt: Buffer,
  cost = SCRYPT_COST,
  blockSize = SCRYPT_BLOCK_SIZE,
  parallelization = SCRYPT_PARALLELIZATION,
) {
  assertSecret(pepper, "PIN_PEPPER");

  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      `${pin}\u0000${pepper}`,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export function isSixDigitPin(pin: string) {
  return PIN_PATTERN.test(pin);
}

export function isForbiddenPin(pin: string) {
  if (!isSixDigitPin(pin)) {
    return true;
  }

  if (/^(\d)\1{5}$/.test(pin)) {
    return true;
  }

  const obviousSequences = new Set([
    "012345",
    "123456",
    "234567",
    "345678",
    "456789",
    "987654",
    "876543",
    "765432",
    "654321",
    "543210",
  ]);

  return obviousSequences.has(pin);
}

export function createOpaqueKey(value: string, secret: string, context: string) {
  assertSecret(secret, "HMAC secret");

  return createHmac("sha256", secret)
    .update(context)
    .update("\u0000")
    .update(value)
    .digest("base64url");
}

export function createPinLookupKey(pin: string, lookupSecret: string) {
  if (!isSixDigitPin(pin)) {
    throw new Error("A PIN lookup key requires exactly six digits.");
  }

  return createOpaqueKey(pin, lookupSecret, "onnuriway-pin-lookup-v1");
}

export async function hashPin(
  pin: string,
  pepper: string,
  options: PinHashOptions = {},
) {
  if (!isSixDigitPin(pin)) {
    throw new Error("A PIN hash requires exactly six digits.");
  }

  const salt = options.salt ?? randomBytes(16);
  const derivedKey = await derivePinKey(pin, pepper, salt);

  return [
    "scrypt",
    SCRYPT_VERSION,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPin(pin: string, encodedHash: string, pepper: string) {
  try {
    const [algorithm, version, costText, blockSizeText, parallelizationText, saltText, hashText] =
      encodedHash.split("$");
    const cost = Number(costText);
    const blockSize = Number(blockSizeText);
    const parallelization = Number(parallelizationText);

    if (
      algorithm !== "scrypt" ||
      version !== SCRYPT_VERSION ||
      !isSixDigitPin(pin) ||
      cost !== SCRYPT_COST ||
      blockSize !== SCRYPT_BLOCK_SIZE ||
      parallelization !== SCRYPT_PARALLELIZATION ||
      !saltText ||
      !hashText
    ) {
      return false;
    }

    const expected = Buffer.from(hashText, "base64url");
    const actual = await derivePinKey(
      pin,
      pepper,
      Buffer.from(saltText, "base64url"),
      cost,
      blockSize,
      parallelization,
    );

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function consumePinHashCost(pin: string, pepper: string) {
  const paddedPin = pin.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
  await derivePinKey(
    paddedPin,
    pepper,
    Buffer.from("onnuriway-dummy", "utf8"),
  );
}

export function generateRandomPin() {
  for (;;) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    if (!isForbiddenPin(pin)) {
      return pin;
    }
  }
}
