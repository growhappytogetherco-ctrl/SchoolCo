// Shared constants for academic subjects — importable by both server and client code.

export const SUBJECTS = [
  "math", "reading", "writing", "ela", "science", "history",
  "bible", "spanish", "leadership", "entrepreneurship",
  "elective", "art", "music", "pe", "other",
] as const;

export type Subject = typeof SUBJECTS[number];

export const SUBJECT_LABELS: Record<Subject, string> = {
  math:             "Math",
  reading:          "Reading",
  writing:          "Writing",
  ela:              "ELA",
  science:          "Science",
  history:          "History",
  bible:            "Bible",
  spanish:          "Spanish",
  leadership:       "Leadership",
  entrepreneurship: "Entrepreneurship",
  elective:         "Elective",
  art:              "Art",
  music:            "Music",
  pe:               "PE",
  other:            "Other",
};
