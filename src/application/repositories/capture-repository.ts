import type {
  CaptureDocumentContent,
  CaptureDocumentRef,
  CaptureItem,
  CaptureProposal,
} from "@/domain/capture";
import { canonicalStorage } from "@/lib/canonical-persistence/storage";
import type { CanonicalStorage, PersistenceEnvelope } from "@/lib/canonical-persistence/types";

function cloneCapturePayload<T extends { id: string }>(value: T): T {
  const document = value as unknown as Partial<CaptureDocumentContent>;
  if (typeof Blob !== "undefined" && document.blob instanceof Blob) {
    // jsdom's structuredClone does not preserve Blob; IndexedDB does.
    return { ...value, blob: document.blob } as T;
  }
  return structuredClone(value);
}

function wrap<T extends { id: string }>(
  value: T,
  previous?: PersistenceEnvelope<T>,
): PersistenceEnvelope<T> {
  return {
    id: value.id,
    entityType: value.constructor?.name ?? "CaptureRecord",
    schemaVersion: 1,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    payload: cloneCapturePayload(value),
  };
}
export class CaptureRepository {
  constructor(private readonly storage: CanonicalStorage = canonicalStorage) {}
  async getItem(id: string) {
    return (await this.storage.get<CaptureItem>("capture_items", id))?.payload;
  }
  async listItems() {
    return (await this.storage.list<CaptureItem>("capture_items")).map((x) => x.payload);
  }
  async saveItem(value: CaptureItem) {
    await this.storage.put(
      "capture_items",
      wrap(value, await this.storage.get("capture_items", value.id)),
    );
  }
  async getProposal(id: string) {
    return (await this.storage.get<CaptureProposal>("capture_proposals", id))?.payload;
  }
  async listProposals(captureItemId?: string) {
    const values = (await this.storage.list<CaptureProposal>("capture_proposals")).map(
      (x) => x.payload,
    );
    return captureItemId ? values.filter((x) => x.captureItemId === captureItemId) : values;
  }
  async saveProposal(value: CaptureProposal) {
    await this.storage.put(
      "capture_proposals",
      wrap(value, await this.storage.get("capture_proposals", value.id)),
    );
  }
  async saveDocumentRef(value: CaptureDocumentRef) {
    await this.storage.put(
      "capture_document_refs",
      wrap(value, await this.storage.get("capture_document_refs", value.id)),
    );
  }
  async getDocumentRef(id: string) {
    return (await this.storage.get<CaptureDocumentRef>("capture_document_refs", id))?.payload;
  }
  async saveDocumentContent(value: CaptureDocumentContent) {
    await this.storage.put(
      "capture_document_content",
      wrap(value, await this.storage.get("capture_document_content", value.id)),
    );
  }
  async getDocumentContent(documentRefId: string) {
    return (
      await this.storage.get<CaptureDocumentContent>("capture_document_content", documentRefId)
    )?.payload;
  }
  async listDocumentRefs(captureItemId?: string) {
    const values = (await this.storage.list<CaptureDocumentRef>("capture_document_refs")).map(
      (x) => x.payload,
    );
    return captureItemId ? values.filter((x) => x.captureItemId === captureItemId) : values;
  }
}
