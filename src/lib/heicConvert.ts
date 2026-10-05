/**
 * Server-only HEIC/HEIF → JPEG conversion for the AI extraction pipeline.
 *
 * The ORIGINAL Drive file is NEVER modified. This module produces a temporary
 * in-memory Buffer used only for the Anthropic API call; nothing is stored
 * permanently. source_document_id continues to point to the original SchoolCo
 * student_documents record.
 *
 * Uses heic-convert (pure JS / WASM via heic-decode) — no native binaries,
 * compatible with Vercel serverless Node.js.
 */

// heic-convert has no bundled TS types; we declare the shape we use.
// At runtime it returns a Buffer (from jpeg-js.encode().data), not an ArrayBuffer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const heicConvert: (opts: {
  buffer: Uint8Array;
  format: "JPEG" | "PNG";
  quality?: number;
}) => Promise<Buffer> = require("heic-convert");

export type HeicConvertResult =
  | { success: true; buffer: Buffer; mimeType: "image/jpeg" }
  | { success: false; error: string };

/** MIME types that need HEIC/HEIF conversion */
export const HEIC_MIMES = new Set(["image/heic", "image/heif"]);

/**
 * Returns true if the MIME type requires server-side conversion before
 * sending to Anthropic.
 */
export function needsHeicConversion(mimeType: string): boolean {
  return HEIC_MIMES.has(mimeType.toLowerCase());
}

/**
 * Convert a HEIC/HEIF buffer to JPEG.
 *
 * Size strategy:
 *   - Try JPEG quality 0.85 first (good text readability).
 *   - If result > MAX_OUTPUT_BYTES, retry at 0.70 then 0.55.
 *   - If still over limit, fail with a clean staff-facing error.
 *
 * HEIC originals from iPhones are typically 2–6 MB; JPEG output at quality
 * 0.85 is usually 4–12 MB. The 5 MB Anthropic image limit is enforced on the
 * converted output via extractAcademicRecord()'s existing size guard.
 *
 * We allow the converted output up to 20 MB here; the extraction layer
 * enforces the final 5 MB Anthropic cap. Using a looser pre-check lets us
 * pass the converted buffer through the existing validation path rather than
 * duplicating the error logic.
 */
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024; // 20 MB — extraction layer enforces 5 MB
const QUALITY_ATTEMPTS = [0.85, 0.70, 0.55];

export async function convertHeicToJpeg(
  inputBuffer: Buffer,
): Promise<HeicConvertResult> {
  for (const quality of QUALITY_ATTEMPTS) {
    try {
      // Pass Uint8Array — heic-decode requires an iterable typed array,
      // not a raw ArrayBuffer (ArrayBuffer has no Symbol.iterator).
      const outputBuffer = await heicConvert({
        buffer: new Uint8Array(inputBuffer),
        format: "JPEG",
        quality,
      });

      if (outputBuffer.length <= MAX_OUTPUT_BYTES) {
        return { success: true, buffer: outputBuffer, mimeType: "image/jpeg" };
      }
      // Too large — retry at lower quality
    } catch (e: unknown) {
      // Log error type only — never expose raw V8 message to staff UI
      const tag = e instanceof Error ? e.constructor.name : typeof e;
      console.error(`[heicConvert] conversion failed (${tag})`);
      return {
        success: false,
        error: "This HEIC/HEIF document could not be prepared for analysis. The original document has not been changed.",
      };
    }
  }

  return {
    success: false,
    error:
      "This HEIC/HEIF document is too large to prepare for analysis even after compression. The original document has not been changed.",
  };
}
