import { z } from "zod";

// Shared sub-schemas
export const VisibilityJsonSchema = z.object({
  academics:       z.boolean().default(true),
  attendance:      z.boolean().default(true),
  report_cards:    z.boolean().default(true),
  communications:  z.boolean().default(true),
  health_records:  z.boolean().default(false),
  incidents:       z.boolean().default(false),
  behavior_notes:  z.boolean().default(false),
});

export const CommunicationJsonSchema = z.object({
  channels: z.object({
    email:  z.boolean().default(true),
    sms:    z.boolean().default(false),
    in_app: z.boolean().default(true),
    push:   z.boolean().default(false),
  }),
  receive: z.object({
    attendance_alerts:      z.boolean().default(true),
    grade_reports:          z.boolean().default(true),
    announcements:          z.boolean().default(true),
    incident_notifications: z.boolean().default(false),
    direct_messages:        z.boolean().default(true),
    payment_reminders:      z.boolean().default(true),
  }),
  quiet_hours: z.object({
    enabled:    z.boolean().default(false),
    start_time: z.string().nullable().default(null),
    end_time:   z.string().nullable().default(null),
  }),
  preferred_language: z.string().default("en"),
});

export const InviteGuardianSchema = z.object({
  student_id:       z.string().uuid("Invalid student ID"),
  family_id:        z.string().uuid("Invalid family ID"),
  household_id:     z.string().uuid().optional().nullable(),
  full_name:        z.string().min(2, "Full name is required").max(120),
  email:            z.string().email("Invalid email address"),
  phone:            z.string().max(30).optional().nullable(),
  relationship_type: z.enum([
    "mother","father","stepmother","stepfather","grandmother","grandfather",
    "aunt","uncle","sibling","legal_guardian","foster_parent","other"
  ], { required_error: "Select a relationship type" }),
  custody_type:     z.enum(["primary","joint","secondary","supervised","none"]).default("joint"),
  is_legal_guardian:  z.boolean().default(true),
  is_primary_contact: z.boolean().default(false),
  is_emergency_contact: z.boolean().default(false),
  emergency_contact_order: z.number().int().min(1).optional().nullable(),
  can_pickup:       z.boolean().default(true),
  pickup_restrictions: z.string().max(500).optional().nullable(),
  court_order_on_file: z.boolean().default(false),
  visibility_json:  VisibilityJsonSchema.optional(),
  communication_json: CommunicationJsonSchema.optional(),
});

export const UpdateGuardianshipSchema = z.object({
  guardianship_id:  z.string().uuid(),
  relationship_type: z.enum([
    "mother","father","stepmother","stepfather","grandmother","grandfather",
    "aunt","uncle","sibling","legal_guardian","foster_parent","other"
  ]).optional(),
  custody_type:     z.enum(["primary","joint","secondary","supervised","none"]).optional(),
  is_legal_guardian: z.boolean().optional(),
  is_primary_contact: z.boolean().optional(),
  is_emergency_contact: z.boolean().optional(),
  emergency_contact_order: z.number().int().min(1).optional().nullable(),
  can_pickup:       z.boolean().optional(),
  pickup_restrictions: z.string().max(500).optional().nullable(),
  court_order_on_file: z.boolean().optional(),
  court_order_notes: z.string().max(2000).optional().nullable(),
  household_id:     z.string().uuid().optional().nullable(),
  visibility_json:  VisibilityJsonSchema.optional(),
  communication_json: CommunicationJsonSchema.optional(),
});

export const UpdatePreferencesSchema = z.object({
  guardianship_id:    z.string().uuid(),
  visibility_json:    VisibilityJsonSchema.optional(),
  communication_json: CommunicationJsonSchema.optional(),
});

export const AddGuardianRecordSchema = z.object({
  student_ids:   z.array(z.string().uuid()).min(1, "Select at least one student"),
  family_id:     z.string().uuid("Invalid family ID"),
  household_id:  z.string().uuid().optional().nullable(),
  full_name:     z.string().min(2, "Full name is required").max(120),
  email:         z.string().email("Invalid email address").optional().nullable(),
  phone:         z.string().max(30).optional().nullable(),
  relationship_type: z.enum([
    "mother","father","stepmother","stepfather","grandmother","grandfather",
    "aunt","uncle","sibling","legal_guardian","foster_parent","other"
  ], { required_error: "Select a relationship type" }),
  custody_type:     z.enum(["primary","joint","secondary","supervised","none"]).default("joint"),
  is_legal_guardian:    z.boolean().default(true),
  is_primary_contact:   z.boolean().default(false),
  is_emergency_contact: z.boolean().default(false),
  can_pickup:           z.boolean().default(true),
  pickup_restrictions:  z.string().max(500).optional().nullable(),
  court_order_on_file:  z.boolean().default(false),
});

export const UpdateGuardianProfileSchema = z.object({
  profile_id: z.string().uuid(),
  family_id:  z.string().uuid(),
  full_name:  z.string().min(2).max(120).optional(),
  email:      z.string().email().optional().nullable(),
  phone:      z.string().max(30).optional().nullable(),
});

export const LinkGuardianToStudentSchema = z.object({
  profile_id:        z.string().uuid(),
  student_id:        z.string().uuid(),
  family_id:         z.string().uuid(),
  household_id:      z.string().uuid().optional().nullable(),
  relationship_type: z.enum([
    "mother","father","stepmother","stepfather","grandmother","grandfather",
    "aunt","uncle","sibling","legal_guardian","foster_parent","other"
  ]),
  custody_type:        z.enum(["primary","joint","secondary","supervised","none"]).default("joint"),
  is_legal_guardian:   z.boolean().default(true),
  is_primary_contact:  z.boolean().default(false),
  is_emergency_contact: z.boolean().default(false),
  can_pickup:          z.boolean().default(true),
  pickup_restrictions: z.string().max(500).optional().nullable(),
});
