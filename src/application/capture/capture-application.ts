import { nanoid } from "nanoid";
import { classifyCapture } from "@/capture/classifier";
import { parseTurkishCapture } from "@/capture/turkish-task-parser";
import type {
  CaptureDocumentRef,
  CaptureItem,
  CaptureProposal,
  CaptureSourceType,
  TurkishParserConfig,
} from "@/domain/capture";
import { CaptureRepository } from "../repositories/capture-repository";
import type { TaskRecord } from "../repositories/task-repository";
import { taskApplication } from "../task-application";

export type CaptureApplicationDependencies = {
  repository?: CaptureRepository;
  createTask?: (input: {
    nodeId: string;
    text: string;
    extra?: Record<string, unknown>;
  }) => TaskRecord;
};

export function createCaptureApplication(deps: CaptureApplicationDependencies = {}) {
  const repository = deps.repository ?? new CaptureRepository();
  const createTask =
    deps.createTask ?? ((input) => taskApplication.commands.createTask(input as never));
  async function textCapture(
    rawText: string,
    sourceType: CaptureSourceType = "TEXT",
    config?: TurkishParserConfig,
  ) {
    const now = config?.now ?? Date.now();
    const parsed = parseTurkishCapture(
      rawText,
      config ?? { now, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
    );
    const classification = classifyCapture({ text: rawText, sourceType });
    const proposal: CaptureProposal = {
      ...parsed,
      id: nanoid(12),
      captureItemId: "",
      createdAt: now,
      proposalType:
        classification.proposalType === "UNKNOWN"
          ? parsed.proposalType
          : classification.proposalType,
      confidence:
        classification.confidence === "LOW" ? parsed.confidence : classification.confidence,
      requiresConfirmation: classification.requiresConfirmation || parsed.requiresConfirmation,
    };
    const item: CaptureItem = {
      id: nanoid(12),
      sourceType,
      rawText,
      createdAt: now,
      updatedAt: now,
      status: itemStatus(proposal.requiresConfirmation),
      language: "tr",
    };
    proposal.captureItemId = item.id;
    await repository.saveItem(item);
    await repository.saveProposal(proposal);
    return { item, proposal };
  }
  async function fileCapture(file: File, sourceType: CaptureSourceType, possibleFinancial = false) {
    const now = Date.now();
    const item: CaptureItem = {
      id: nanoid(12),
      sourceType,
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
      status: "REVIEW_REQUIRED",
      language: "tr",
    };
    const classification = classifyCapture({ sourceType, possibleFinancial });
    const proposal: CaptureProposal = {
      id: nanoid(12),
      captureItemId: item.id,
      proposalType: classification.proposalType,
      confidence: "LOW",
      fieldConfidence: {},
      fields: {},
      warnings: ["FILE_REVIEW_REQUIRED"],
      requiresConfirmation: true,
      createdAt: now,
      parserVersion: "CAPTURE_FILE_V1",
    };
    const ref: CaptureDocumentRef = {
      id: nanoid(12),
      captureItemId: item.id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      createdAt: now,
    };
    item.attachmentIds = [ref.id];
    await repository.saveItem(item);
    await repository.saveProposal(proposal);
    await repository.saveDocumentRef(ref);
    await repository.saveDocumentContent({
      id: ref.id,
      documentRefId: ref.id,
      blob: file,
      createdAt: now,
    });
    return { item, proposal, ref };
  }
  async function confirmCapture(
    itemId: string,
    proposalId: string,
    nodeId: string,
    overrides: Partial<CaptureProposal["fields"]> = {},
  ) {
    const item = await repository.getItem(itemId);
    const proposal = await repository.getProposal(proposalId);
    if (!item || !proposal) throw new Error("Capture önerisi bulunamadı.");
    const fields = { ...proposal.fields, ...overrides };
    const title = fields.title?.trim();
    if (!title) throw new Error("Görev başlığı boş olamaz.");
    const record = createTask({
      nodeId,
      text: title,
      extra: {
        myDayAt: fields.doAt,
        dueAt: fields.dueAt,
        reminderAt: fields.remindAt,
        estimateMin: fields.estimatedMinutes,
        priority: fields.priority,
        note: fields.description,
        sourceType: "CAPTURE_ITEM",
        sourceId: itemId,
      },
    });
    const confirmed = {
      ...item,
      status: "CONFIRMED" as const,
      updatedAt: Date.now(),
      createdEntityType: "Task" as const,
      createdEntityId: record.task.id,
    };
    await repository.saveItem(confirmed);
    return record;
  }
  return {
    textCapture,
    fileCapture,
    confirmCapture,
    repository,
    reject: async (id: string) => {
      const item = await repository.getItem(id);
      if (item) await repository.saveItem({ ...item, status: "REJECTED", updatedAt: Date.now() });
    },
    archive: async (id: string) => {
      const item = await repository.getItem(id);
      if (item) await repository.saveItem({ ...item, status: "ARCHIVED", updatedAt: Date.now() });
    },
  };
}
function itemStatus(requiresConfirmation: boolean): CaptureItem["status"] {
  return requiresConfirmation ? "REVIEW_REQUIRED" : "PROPOSAL_READY";
}
export const captureApplication = createCaptureApplication();
