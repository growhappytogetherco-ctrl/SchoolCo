/**
 * Academic Record AI Extraction
 *
 * Server-only. Never import in client components or NEXT_PUBLIC_ files.
 * API key: ANTHROPIC_API_KEY (never NEXT_PUBLIC_ANTHROPIC_API_KEY)
 *
 * Provider: Anthropic
 * Model: claude-opus-4 (structured document / table understanding)
 * SDK: @anthropic-ai/sdk
 *
 * Design rules:
 *   - AI MUST NOT invent values — null on uncertainty
 *   - HS credits ≠ source credits (never auto-convert college hours)
 *   - Extraction result is stored raw in academic_record_imports.raw_extraction
 *   - Proposed courses are created as needs_review, never verified
 *   - This module has no DB dependency — all DB writes happen in academicImport.ts
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Extraction schema ─────────────────────────────────────────────────────────

export interface ExtractedCourse {
  school_year:                      string | null;
  grade_level:                      string | null;
  institution_name:                 string | null;
  institution_type:                 string | null; // 'public'|'private'|'homeschool'|'umbrella'|'virtual'|'college'|'rla'|'other'
  course_name:                      string | null;
  course_code:                      string | null;
  subject_area:                     string | null;
  term:                             string | null; // 'full_year'|'semester_1'|'semester_2'|'quarter_1..4'|'summer'|'other'
  course_level:                     string | null; // 'standard'|'honors'|'ap'|'dual_enrollment'
  semester_1_grade:                 string | null;
  semester_2_grade:                 string | null;
  final_grade:                      string | null;
  percentage:                       number | null;
  credits_attempted:                number | null; // HS credits attempted
  credits_earned:                   number | null; // HS credits earned
  source_credits_attempted:         number | null; // institution-reported (e.g. college semester hours)
  source_credits_earned:            number | null;
  source_credit_unit:               string | null; // 'high_school_credit'|'college_semester_hours'|'college_quarter_hours'|'other'
  counts_toward_high_school_credit: boolean | null;
  completion_status:                string | null; // 'completed'|'failed'|'withdrawn'|'incomplete'|'unknown'
  source_notes:                     string | null; // brief note if extraction uncertain
  needs_review_reason:              string | null; // human-readable review flag
}

export interface ExtractionResult {
  success:         boolean;
  error?:          string;
  document_label?: string;
  courses:         ExtractedCourse[];
  raw:             object; // full AI response for storage in raw_extraction
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT_VERSION = "1.0.0";
const EXTRACTION_VERSION = 1;

export { EXTRACTION_PROMPT_VERSION, EXTRACTION_VERSION };

function buildSystemPrompt(): string {
  return `You are an academic records specialist extracting structured data from school transcripts, report cards, and academic achievement records.

CRITICAL RULES — NEVER VIOLATE:
1. NEVER invent, infer, or fill in missing values. If a field is not clearly stated in the document, return null.
2. NEVER convert college/dual-enrollment credits to high-school credits. They are separate fields.
3. NEVER infer course level (honors/AP) unless explicitly labeled in the document.
4. NEVER infer credit amounts. Only extract what the document explicitly states.
5. NEVER infer completion status unless the document clearly states it.
6. NEVER extract SSN, full address, phone numbers, medical information, or unrelated personal identifiers.

UNDERSTANDING DOCUMENT STRUCTURE:
- Identify each school year section, institution, and grade level separately
- Recognize semester column headers (S1, S2, Semester 1, Semester 2, Fall, Spring, etc.)
- Recognize final grade columns (Final, Year, Annual, etc.)
- Credit columns may be labeled Credits, Credit Hours, Units, Hrs, etc.
- Dual enrollment sections often show college course numbers and semester hours separately
- Multi-page tables continue across pages — treat them as one record

GRADE LEVELS:
- Support grades K, 1–12, DE (dual enrollment), and pre-K
- Grade 8 or below may legitimately earn high-school credit (e.g. Algebra I). Preserve grade level as stated.

HIGH SCHOOL vs SOURCE CREDITS:
- credits_attempted / credits_earned = high-school transcript credit units (typically 0.5 or 1.0)
- source_credits_attempted / source_credits_earned = institution-reported credit (college semester hours, quarter hours, etc.)
- source_credit_unit indicates the unit type
- If the document shows "3 semester hours", set source_credits_earned=3, source_credit_unit="college_semester_hours", and leave credits_earned=null

COMPLETION STATUS:
- "completed" only if the document clearly shows a passing final grade or explicit completion
- "failed" only if explicitly stated or if a failing final grade is the only grade
- "withdrawn" if the document shows W or Withdrawn
- "incomplete" if explicitly incomplete
- "unknown" if status cannot be determined

TERM:
- "full_year" if the course spans a full year or no term is specified for a year-long course
- "semester_1" / "semester_2" for half-year courses
- "quarter_1"–"quarter_4" for quarter courses
- "summer" for summer courses
- "other" for anything else

Return ONLY a valid JSON object with this exact structure:
{
  "document_label": "<brief description of the document, e.g. '2023-2024 Transcript — Bethany Christian School'>",
  "courses": [
    {
      "school_year": "2023-2024",
      "grade_level": "10",
      "institution_name": "Bethany Christian School",
      "institution_type": "private",
      "course_name": "English II",
      "course_code": "ENG2",
      "subject_area": "english_ela",
      "term": "full_year",
      "course_level": "standard",
      "semester_1_grade": "89",
      "semester_2_grade": "92",
      "final_grade": null,
      "percentage": null,
      "credits_attempted": 1.0,
      "credits_earned": 1.0,
      "source_credits_attempted": null,
      "source_credits_earned": null,
      "source_credit_unit": null,
      "counts_toward_high_school_credit": true,
      "completion_status": "completed",
      "source_notes": null,
      "needs_review_reason": null
    }
  ]
}

Subject area values (use null if unclear):
mathematics, english_ela, science, social_studies, world_language, fine_arts, pe_health, career_technical, leadership, entrepreneurship, elective, bible, other

Institution type values (use null if unclear):
public, private, homeschool, umbrella, virtual, college, rla, other

If you are uncertain about any value, return null and set needs_review_reason to a brief explanation.
Do not include any text outside the JSON object.`;
}

// ── Client factory (server-only) ──────────────────────────────────────────────

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function isExtractionConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract structured academic course data from a document buffer.
 *
 * @param buffer   Raw bytes of the document (PDF or image)
 * @param mimeType MIME type — must be application/pdf, image/jpeg, image/png, image/gif, image/webp
 * @param documentLabel Human-readable label for the document (e.g. "2023-2024 Transcript")
 */
export async function extractAcademicRecord(
  buffer: Buffer,
  mimeType: string,
  documentLabel: string,
): Promise<ExtractionResult> {
  const client = getClient();
  if (!client) {
    return {
      success: false,
      error: "ANTHROPIC_API_KEY is not configured. Set it in Vercel environment variables.",
      courses: [],
      raw: {},
    };
  }

  // Normalize MIME types — Claude supports application/pdf, image/jpeg, image/png, image/gif, image/webp
  const supportedMimes = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supportedMimes.includes(mimeType)) {
    return {
      success: false,
      error: `Unsupported document type: ${mimeType}. Supported types: PDF, JPEG, PNG, GIF, WEBP.`,
      courses: [],
      raw: {},
    };
  }

  const base64Data = buffer.toString("base64");

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 8192,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: mimeType === "application/pdf" ? "document" : "image",
              source: {
                type: "base64",
                media_type: mimeType as "application/pdf" | "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: base64Data,
              },
            } as any,
            {
              type: "text",
              text: `Extract all academic course records from this document: "${documentLabel}". Return only the JSON object described in your instructions.`,
            },
          ],
        },
      ],
    });

    const rawResponse = {
      model:        response.model,
      stop_reason:  response.stop_reason,
      usage:        response.usage,
      content_type: response.content[0]?.type,
    };

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        success: false,
        error: "AI returned no text content.",
        courses: [],
        raw: rawResponse,
      };
    }

    // Parse JSON — extract from markdown code block if wrapped
    let jsonText = textBlock.text.trim();
    const mdMatch = jsonText.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (mdMatch) jsonText = mdMatch[1];

    let parsed: { document_label?: string; courses?: unknown[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return {
        success: false,
        error: "AI returned invalid JSON. Raw response stored for debugging.",
        courses: [],
        raw: { ...rawResponse, raw_text: jsonText.slice(0, 2000) },
      };
    }

    const courses = (parsed.courses ?? []) as ExtractedCourse[];
    return {
      success:        true,
      document_label: parsed.document_label ?? documentLabel,
      courses,
      raw: { ...rawResponse, parsed },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: `AI extraction failed: ${msg}`,
      courses: [],
      raw: { error: msg },
    };
  }
}
