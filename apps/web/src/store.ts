import { create } from 'zustand';
import {
  makeExample,
  newNode,
  parameterSchema,
  connect,
  descendants,
  duplicateNodes,
  removeNodes,
  insertOperation,
  type PipelineDocument,
  type PipelineNode,
} from '@roveran/pipeline';
type Edit = (document: PipelineDocument) => PipelineDocument;
type LabState = {
  document: PipelineDocument;
  selected: string | null;
  selectedIds: string[];
  followSelection: boolean;
  past: PipelineDocument[];
  future: PipelineDocument[];
  notice: string;
  edit: (edit: Edit, history?: boolean, key?: string) => void;
  replace: (document: PipelineDocument) => void;
  select: (id: string | null) => void;
  setSelection: (ids: string[]) => void;
  setFollowSelection: (follow: boolean) => void;
  add: (operation: string, position?: { x: number; y: number }) => void;
  insert: (operation: string, edgeId: string, position?: { x: number; y: number }) => void;
  update: (id: string, patch: Partial<PipelineNode>, key?: string) => void;
  remove: (id: string) => void;
  removeSelection: () => void;
  duplicate: (id: string) => void;
  duplicateSelection: () => void;
  undo: () => void;
  redo: () => void;
  notify: (notice: string) => void;
  checkpoint: () => void;
};
let lastKey = '',
  lastTime = 0;
export const useLab = create<LabState>((set, get) => ({
  document: makeExample(),
  selected: null,
  selectedIds: [],
  followSelection: true,
  past: [],
  future: [],
  notice: '',
  edit: (edit, history = true, key = '') => {
    const state = get(),
      now = performance.now(),
      document = edit(state.document);
    if (document === state.document) return;
    if (
      document.nodes.length > 100 ||
      document.sources.length > 20 ||
      document.edges.length > 250
    ) {
      state.notify('This experiment supports up to 20 images, 100 nodes and 250 connections.');
      return;
    }
    const coalesce = key && lastKey === key && now - lastTime < 500;
    lastKey = key;
    lastTime = now;
    set({
      document,
      past: history && !coalesce ? [...state.past.slice(-49), state.document] : state.past,
      future: history ? [] : state.future,
    });
  },
  checkpoint: () => set((s) => ({ past: [...s.past.slice(-49), s.document], future: [] })),
  replace: (document) => {
    lastKey = '';
    set({ document, selected: null, selectedIds: [], past: [], future: [] });
  },
  select: (id) => {
    if (id && !get().document.nodes.some((n) => n.id === id)) return;
    get().setSelection(id ? [id] : []);
  },
  setSelection: (ids) =>
    set((s) => {
      const selectedIds = ids.filter((id) => s.document.nodes.some((n) => n.id === id));
      const selected = selectedIds.at(-1) ?? null;
      return {
        selectedIds,
        selected,
        document:
          selected && s.followSelection && s.document.preview.b !== selected
            ? { ...s.document, preview: { ...s.document.preview, b: selected } }
            : s.document,
      };
    }),
  setFollowSelection: (followSelection) =>
    set((s) => ({
      followSelection,
      document:
        followSelection && s.selected
          ? { ...s.document, preview: { ...s.document.preview, b: s.selected } }
          : s.document,
    })),
  add: (operation, position) => {
    const state = get();
    if (state.document.nodes.length >= 100) {
      state.notify('This experiment supports up to 100 nodes.');
      return;
    }
    const parent = state.document.nodes.find((n) => n.id === state.selected);
    const node = newNode(
      operation,
      position?.x ?? (parent ? parent.position.x + 240 : 0),
      position?.y ?? parent?.position.y ?? 0,
    );
    let next = {
      ...state.document,
      nodes: [...state.document.nodes, node],
      preview: {
        ...state.document.preview,
        b: state.followSelection ? node.id : state.document.preview.b,
      },
    };
    if (parent && !position && operation !== 'source')
      try {
        next = connect(next, parent.id, node.id);
      } catch (error) {
        state.notify((error as Error).message);
      }
    state.edit(() => next);
    get().select(node.id);
  },
  insert: (operation, edgeId, position) => {
    try {
      const before = get().document;
      const next = insertOperation(before, operation, edgeId, position);
      get().edit(() => next);
      get().select(next.nodes.at(-1)!.id);
    } catch (error) {
      get().notify((error as Error).message);
    }
  },
  update: (id, patch, key) =>
    get().edit(
      (doc) => ({ ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }),
      true,
      key,
    ),
  remove: (id) => {
    get().edit((doc) => removeNodes(doc, [id]));
    get().select(null);
  },
  removeSelection: () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    get().edit((doc) => removeNodes(doc, ids));
    get().select(null);
  },
  duplicate: (id) => {
    try {
      const result = duplicateNodes(get().document, [id]);
      get().edit(() => result.document);
      get().setSelection(result.ids);
    } catch (error) {
      get().notify((error as Error).message);
    }
  },
  duplicateSelection: () => {
    try {
      if (!get().selectedIds.length) return;
      const result = duplicateNodes(get().document, get().selectedIds);
      get().edit(() => result.document);
      get().setSelection(result.ids);
    } catch (error) {
      get().notify((error as Error).message);
    }
  },
  undo: () => {
    const s = get(),
      document = s.past.at(-1);
    lastKey = '';
    if (document)
      set({
        document,
        past: s.past.slice(0, -1),
        future: [s.document, ...s.future],
        selected: null,
        selectedIds: [],
      });
  },
  redo: () => {
    const s = get(),
      document = s.future[0];
    lastKey = '';
    if (document)
      set({
        document,
        past: [...s.past, s.document],
        future: s.future.slice(1),
        selected: null,
        selectedIds: [],
      });
  },
  notify: (notice) => set({ notice }),
}));
export function insertGrayscale(id: string) {
  const { document: doc } = useLab.getState();
  const target = doc.nodes.find((n) => n.id === id)!;
  const edge = doc.edges.find((e) => e.target === id && e.input === 0);
  if (edge) {
    useLab
      .getState()
      .insert('grayscale', edge.id, { x: target.position.x - 220, y: target.position.y + 180 });
    return;
  }
  const source = doc.nodes.filter((n) => n.id !== id && !descendants(doc, id).has(n.id)).at(-1);
  if (!source) {
    useLab.getState().notify('Add an image source first.');
    return;
  }
  const gray = newNode('grayscale', target.position.x - 220, target.position.y + 180);
  try {
    let next = { ...doc, nodes: [...doc.nodes, gray] };
    next = connect(next, source.id, gray.id);
    next = connect(next, gray.id, id);
    useLab.getState().edit(() => next);
  } catch (error) {
    useLab.getState().notify((error as Error).message);
  }
}
export function updateParameter(nodeId: string, key: string, value: number | string): boolean {
  const { document, update, notify } = useLab.getState();
  const node = document.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const result = parameterSchema(node.operation).safeParse({ ...node.parameters, [key]: value });
  if (!result.success) {
    notify(result.error.issues.map((i) => i.message).join(' '));
    return false;
  }
  update(
    nodeId,
    { parameters: result.data as Record<string, number | string> },
    `${nodeId}:${key}`,
  );
  return true;
}
