// Grading system types — shared between calculation engine and server actions.
// No "use server" — safe to import anywhere.

export type GradeStatus =
  | 'graded'      // points_earned used in numerator + denominator
  | 'missing'     // 0 earned / full points_possible (counts against student)
  | 'excused'     // excluded from both earned and possible
  | 'absent'      // excluded until teacher resolves
  | 'incomplete'  // excluded until resolved
  | 'not_graded'; // excluded from calculation permanently

export type GradingMethod = 'points' | 'weighted' | 'pass_fail' | 'rating';

export type AssignmentCategory =
  | 'homework' | 'classwork' | 'project' | 'quiz'
  | 'test' | 'participation' | 'lab' | 'other';

export interface GradeScaleLevel {
  letter:     string;
  min_pct:    number;
  max_pct:    number;
  gpa_points: number;
}

// A single assignment's data as needed by the calculator
export interface AssignmentRecord {
  assignment_id:  string;
  title:          string;
  points_possible: number;
  is_graded:      boolean;
  category:       AssignmentCategory;
}

// A student's grade entry for one assignment
export interface GradeInput {
  assignment_id:   string;
  points_possible: number;
  points_earned:   number | null;
  grade_status:    GradeStatus;
  category:        AssignmentCategory;
  is_graded:       boolean;     // assignment-level flag; false = always excluded
}

// Result of a single-period (quarter) grade calculation
export type GradeState = 'graded' | 'no_grade' | 'partial';

export interface QuarterGradeResult {
  state:              GradeState;
  earned:             number;
  possible:           number;
  percentage:         number | null;
  display_percentage: string | null;  // e.g. "91.18%"
  letter_grade:       string | null;
  count_graded:       number;
  count_missing:      number;
  count_excused:      number;
  count_absent:       number;
  count_incomplete:   number;
  count_not_graded:   number;
}

// Weighted category breakdown (one entry per category)
export interface CategoryResult {
  category:    AssignmentCategory;
  weight:      number;           // configured weight 0-100
  earned:      number;
  possible:    number;
  percentage:  number | null;
  is_active:   boolean;          // false if no graded work yet
}

export interface WeightedGradeResult extends QuarterGradeResult {
  categories:           CategoryResult[];
  active_weight_sum:    number;   // sum of weights for categories with graded work
  all_categories_active: boolean; // false when some configured categories have no data
}

// Result of a semester-level calculation (aggregates two quarters)
export interface SemesterGradeResult {
  state:                  GradeState;
  earned:                 number;
  possible:               number;
  percentage:             number | null;
  display_percentage:     string | null;
  letter_grade:           string | null;
  quarters_included:      number;   // 0, 1, or 2
  quarters_without_data:  number;   // how many child quarters have no grade data
}

// Year-to-date result across all quarters in the school year
export interface YTDGradeResult {
  state:              GradeState;
  earned:             number;
  possible:           number;
  percentage:         number | null;
  display_percentage: string | null;
  letter_grade:       string | null;
  periods_included:   string[];     // names of quarters with data, e.g. ['Q1', 'Q2']
}

// Category weight config stored in course_grade_settings.weight_config JSONB
// Values are percentages that should sum to 100 for a weighted course
export type CategoryWeights = Partial<Record<AssignmentCategory, number>>;
