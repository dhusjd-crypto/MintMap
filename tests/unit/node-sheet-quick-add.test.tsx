import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createMiddleware: () => ({
    server: () => async ({ next }: { next: () => unknown }) => next(),
  }),
  createServerFn: () => ({
    inputValidator() {
      return this;
    },
    middleware() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));

import { NodeSheet } from "@/components/NodeSheet";
import { mindmap } from "@/lib/mindmap-store";

function setup({ withNestedTask = false }: { withNestedTask?: boolean } = {}) {
  mindmap.getSnapshot();
  const node = mindmap.add(null, "Taşınma planı");
  mindmap.addTodo(node.id, "Nakliyeci ile Görüş Tarihi Belirle");
  mindmap.addTodo(node.id, "Koli listesi hazırla");
  if (withNestedTask) {
    const first = mindmap.getSnapshot().find((item) => item.id === node.id)!.todos[0];
    mindmap.addTodo(node.id, "Tarihi netleştir", first.id);
  }
  render(<NodeSheet nodeId={node.id} onClose={() => {}} initialTab="todo" />);
  return { nodeId: node.id };
}

function todos(nodeId: string) {
  return mindmap.getSnapshot().find((node) => node.id === nodeId)?.todos ?? [];
}

describe("NodeSheet quick subtask add UX", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    mindmap.getSnapshot();
    mindmap.reset();
  });

  afterEach(() => {
    cleanup();
  });

  it("toggles the quick add form with the same subtask button", async () => {
    setup();

    fireEvent.click((await screen.findAllByLabelText("Alt görev ekle"))[0]);
    expect(screen.getByPlaceholderText("Alt görev...")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Alt görev eklemeyi kapat"));
    expect(screen.queryByPlaceholderText("Alt görev...")).toBeNull();
  });

  it("keeps drag handles available while hierarchy numbers are optional", async () => {
    setup({ withNestedTask: true });

    expect(await screen.findAllByLabelText("Görevi sürükle")).toHaveLength(3);
    expect(screen.queryByTestId("todo-order-number")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sıra numaralarını göster" }));

    expect(screen.getAllByTestId("todo-order-number").map((element) => element.textContent)).toEqual([
      "1.",
      "1.1.",
      "2.",
    ]);
  });

  it("closes on outside pointerdown without creating an empty task", async () => {
    const { nodeId } = setup();
    const before = todos(nodeId).length;

    fireEvent.click((await screen.findAllByLabelText("Alt görev ekle"))[0]);
    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByPlaceholderText("Alt görev...")).toBeNull());
    expect(todos(nodeId)).toHaveLength(before);
  });

  it("keeps only one quick add form when switching tasks", async () => {
    setup();

    const quickAddButtons = await screen.findAllByLabelText("Alt görev ekle");
    fireEvent.click(quickAddButtons[0]);
    fireEvent.change(screen.getByPlaceholderText("Alt görev..."), {
      target: { value: "Kaydedilmeyen taslak" },
    });

    fireEvent.click(quickAddButtons[1]);

    expect(screen.getAllByPlaceholderText("Alt görev...")).toHaveLength(1);
    expect((screen.getByPlaceholderText("Alt görev...") as HTMLInputElement).value).toBe("");
  });

  it("closes when another task row is clicked", async () => {
    setup();

    fireEvent.click((await screen.findAllByLabelText("Alt görev ekle"))[0]);
    expect(screen.getByPlaceholderText("Alt görev...")).toBeTruthy();

    fireEvent.click(screen.getByText("Koli listesi hazırla"));

    expect(screen.queryByPlaceholderText("Alt görev...")).toBeNull();
  });

  it("closes on Escape without saving the draft", async () => {
    const { nodeId } = setup();
    const before = todos(nodeId).length;

    fireEvent.click((await screen.findAllByLabelText("Alt görev ekle"))[0]);
    const input = screen.getByPlaceholderText("Alt görev...");
    fireEvent.change(input, { target: { value: "Kaydedilmeyecek taslak" } });
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

    expect(screen.queryByPlaceholderText("Alt görev...")).toBeNull();
    expect(todos(nodeId)).toHaveLength(before);
  });

  it("ignores empty Enter and saves one subtask on Enter", async () => {
    const { nodeId } = setup();
    const parent = todos(nodeId)[0];

    fireEvent.click((await screen.findAllByLabelText("Alt görev ekle"))[0]);
    const input = screen.getByPlaceholderText("Alt görev...");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(todos(nodeId).filter((todo) => todo.parentId === parent.id)).toHaveLength(0);

    fireEvent.change(input, { target: { value: "Nakliye saatini teyit et" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(screen.queryByPlaceholderText("Alt görev...")).toBeNull());
    expect(todos(nodeId).filter((todo) => todo.parentId === parent.id)).toHaveLength(1);
  });

  it("does not create duplicates on a fast double click", async () => {
    const { nodeId } = setup();
    const parent = todos(nodeId)[0];

    fireEvent.click((await screen.findAllByLabelText("Alt görev ekle"))[0]);
    fireEvent.change(screen.getByPlaceholderText("Alt görev..."), {
      target: { value: "Nakliye ücretini teyit et" },
    });
    const addButton = screen.getByLabelText("Alt görevi ekle");

    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(todos(nodeId).filter((todo) => todo.parentId === parent.id)).toHaveLength(1);
  });

  it("keeps the draft if adding the subtask fails", async () => {
    setup();
    const addTodo = vi.spyOn(mindmap, "addTodo").mockImplementationOnce(() => {
      throw new Error("boom");
    });

    fireEvent.click((await screen.findAllByLabelText("Alt görev ekle"))[0]);
    const input = screen.getByPlaceholderText("Alt görev...");
    fireEvent.change(input, { target: { value: "Hata sonrası kalmalı" } });
    fireEvent.click(screen.getByLabelText("Alt görevi ekle"));

    expect((screen.getByPlaceholderText("Alt görev...") as HTMLInputElement).value).toBe(
      "Hata sonrası kalmalı",
    );
    addTodo.mockRestore();
  });
});

