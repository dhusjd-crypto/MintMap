export const TURKISH_CAPTURE_PARSER_VERSION = "TURKISH_CAPTURE_PARSER_V1" as const;
export type CaptureSourceType =
  | "TEXT"
  | "CLIPBOARD"
  | "VOICE"
  | "IMAGE"
  | "SCREENSHOT"
  | "PDF"
  | "EMAIL"
  | "IMPORT"
  | "MANUAL"
  | "OTHER";
export type CaptureStatus =
  | "CAPTURED"
  | "PROCESSING"
  | "PROPOSAL_READY"
  | "REVIEW_REQUIRED"
  | "CONFIRMED"
  | "REJECTED"
  | "ARCHIVED"
  | "FAILED";
export type CaptureProposalType =
  "TASK" | "NOTE" | "WAITING_TASK" | "PROJECT_ACTION" | "FINANCIAL_DOCUMENT" | "UNKNOWN";
export type CaptureConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type CaptureFieldConfidence = { level: CaptureConfidenceLevel; reason?: string };
export type CaptureFields = {
  title?: string;
  description?: string;
  projectToken?: string;
  projectId?: string;
  goalToken?: string;
  doAt?: number;
  dueAt?: number;
  startAt?: number;
  remindAt?: number;
  followUpAt?: number;
  estimatedMinutes?: number;
  priority?: 1 | 2 | 3 | 4;
  waitingFor?: string;
  waitingReason?: string;
};
export type CaptureItem = {
  id: string;
  sourceType: CaptureSourceType;
  rawText?: string;
  attachmentIds?: string[];
  createdAt: number;
  updatedAt: number;
  status: CaptureStatus;
  language?: string;
  sourceMetadata?: Readonly<Record<string, string | number | boolean>>;
  createdEntityType?: "Task" | "Note";
  createdEntityId?: string;
};
export type CaptureProposal = {
  id: string;
  captureItemId: string;
  proposalType: CaptureProposalType;
  confidence: CaptureConfidenceLevel;
  fieldConfidence: Partial<Record<keyof CaptureFields, CaptureFieldConfidence>>;
  fields: CaptureFields;
  warnings: string[];
  requiresConfirmation: boolean;
  createdAt: number;
  parserVersion: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};
export type CaptureDocumentRef = {
  id: string;
  captureItemId: string;
  name: string;
  mimeType: string;
  size: number;
  checksum?: string;
  createdAt: number;
};
export type CaptureProjectContext = { id: string; title: string };
export type TurkishParserConfig = {
  timezone: string;
  now: number;
  daypartDefaults?: Partial<Record<"sabah" | "öğleden sonra" | "akşam", number>>;
  projects?: CaptureProjectContext[];
};
