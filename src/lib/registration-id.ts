/**
 * Registration ID — build specification section 2.2, open item O-13.
 *
 *   BCJ0001-SYED
 *
 * The sequential part is used for support and sorting; the four-letter suffix
 * is taken from the participant's name so the ID is recognisable and easy to
 * read back over the phone.
 *
 * DEVIATION FROM THE SPECIFICATION, at BCJ's request (31 August 2026).
 * Section 2.2 specifies four *random* characters, because the registration ID
 * is the only participant credential. A name-derived suffix is guessable: the
 * leaderboard publishes display names, so seeing a participant there reveals
 * most of their ID and leaves only the short sequential part to try. Anyone
 * who guesses it can sign in as that participant and alter their entries.
 *
 * If that becomes a problem, the two supported fixes are:
 *   - set ID_SUFFIX_MODE below to "random", restoring section 2.2 exactly; or
 *   - add the second sign-in field the specification offers under O-13,
 *     registration ID plus registered mobile number, which keeps a readable
 *     ID and still avoids a password.
 */

/** Random characters exclude 0, O, 1, I and L, which are misread aloud. */
const RANDOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SUFFIX_LENGTH = 4;
const PREFIX = "BCJ";
const SEQ_DIGITS = 4;

/**
 * "name"   — first four letters of the participant's name (BCJ0001-SYED).
 * "random" — four random characters, as specification section 2.2 defines.
 */
export const ID_SUFFIX_MODE: "name" | "random" = "name";

/**
 * Uses Web Crypto, which exists in Node and in the browser, so this module
 * stays importable from client components. Values that would skew the
 * distribution are rejected rather than folded with a modulo.
 */
export function randomSuffix(length = SUFFIX_LENGTH): string {
  const limit =
    Math.floor(256 / RANDOM_ALPHABET.length) * RANDOM_ALPHABET.length;
  const out: string[] = [];

  while (out.length < length) {
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue; // rejection sampling, no modulo bias
      out.push(RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length]);
      if (out.length === length) break;
    }
  }

  return out.join("");
}

/**
 * The first four letters of a name, uppercased.
 *
 * Spaces, punctuation and accents are stripped first, so "Syed Safwan" and
 * "syedsafwan" both give SYED. A name that yields fewer than four letters —
 * a very short one, or one written in a non-Latin script — is padded with
 * random characters so every ID is the same length.
 */
export function nameSuffix(fullName: string): string {
  const letters = fullName
    // NFD splits an accented letter into letter + combining mark; the
    // [^A-Z] filter below then drops the mark, so "Zaid" and "Zaïd"
    // both yield ZAID.
    .normalize("NFD")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (letters.length >= SUFFIX_LENGTH) return letters.slice(0, SUFFIX_LENGTH);
  return letters + randomSuffix(SUFFIX_LENGTH - letters.length);
}

/**
 * Builds the ID. `fullName` is required in "name" mode and ignored in
 * "random" mode.
 *
 * Two participants whose names begin with the same four letters still get
 * different IDs, because the sequential part differs and it is drawn from a
 * database sequence.
 */
export function buildRegistrationId(seqNo: number, fullName = ""): string {
  const sequential = `${PREFIX}${String(seqNo).padStart(SEQ_DIGITS, "0")}`;
  const suffix =
    ID_SUFFIX_MODE === "name" && fullName.trim().length > 0
      ? nameSuffix(fullName)
      : randomSuffix();
  return `${sequential}-${suffix}`;
}

// A name-derived suffix may contain any letter, including the O, I and L the
// random alphabet leaves out, so the pattern accepts the full range.
const PATTERN = new RegExp(
  `^${PREFIX}\\d{${SEQ_DIGITS},}-[A-Z0-9]{${SUFFIX_LENGTH}}$`,
);

/**
 * Normalises what a participant types: trims, uppercases, and accepts the ID
 * with or without its hyphen.
 */
export function normaliseRegistrationId(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!cleaned.startsWith(PREFIX)) return cleaned;
  const body = cleaned.slice(PREFIX.length);
  if (body.length <= SUFFIX_LENGTH) return cleaned;
  const seq = body.slice(0, body.length - SUFFIX_LENGTH);
  const suffix = body.slice(body.length - SUFFIX_LENGTH);
  return `${PREFIX}${seq}-${suffix}`;
}

export function isRegistrationId(value: string): boolean {
  return PATTERN.test(value);
}
