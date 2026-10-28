import { create } from 'zustand';
import {
  makeExample,
  newNode,
  parameterSchema,
  connect,
  descendants,
  type PipelineDocument,
  type PipelineNode,
} from '@roveran/pipeline';
type Edit = (document: PipelineDocument) => PipelineDocument;
type LabState = {
  document: PipelineDocument;
  selected: string | null;
  past: PipelineDocument[];
  future: PipelineDocument[];
  notice: string;
  edit: (edit: Edit, history?: boolean, key?: string) => void;
  replace: (document: PipelineDocument) => void;
  select: (id: string | null) => void;
  add: (operation: string, position?: { x: number; y: number }) => void;
  update: (id: string, patch: Partial<PipelineNode>, key?: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
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
  past: [],
  future: [],
  notice: '',
  edit: (edit, history = true, key = '') => {
    const state = get();
    const now = performance.now();
    const coalesce = key && lastKey === key && now - lastTime < 500;
    lastKey = key;
    lastTime = now;
    const document = edit(state.document);
    if (document.nodes.length > 100 || document.sources.length > 20) {
      get().notify('This experiment supports up to 20 images and 100 nodes.');
      return;
    }
    set({
      document,
      past: history && !coalesce ? [...state.past.slice(-49), state.document] : state.past,
      future: history ? [] : state.future,
    });
  },
  checkpoint: () => set((s) => ({ past: [...s.past.slice(-49), s.document], future: [] })),
  replace: (document) => {
    lastKey = '';
    set({ document, selected: null, past: [], future: [] });
  },
  select: (id) => {
    if (id && !get().document.nodes.some((node) => node.id === id)) return;
    set((s) => ({
      selected: id,
      document: id ? { ...s.document, preview: { ...s.document.preview, b: id } } : s.document,
    }));
  },
  add: (operation, position) => {
    const state = get();
    if (state.document.nodes.length >= 100) {
      state.notify('This experiment supports up to 100 nodes.');
      return;
    }
    const parent =
      state.document.nodes.find((n) => n.id === state.selected) ?? state.document.nodes.at(-1);
    const node = newNode(
      operation,
      position?.x ?? (parent ? parent.position.x + 240 : 0),
      position?.y ?? parent?.position.y ?? 0,
    );
    get().edit((doc) => {
      let next: PipelineDocument = {
        ...doc,
        nodes: [...doc.nodes, node],
        preview: { ...doc.preview, b: node.id },
      };
      if (parent && operation !== 'source')
        try {
          next = connect(next, parent.id, node.id);
        } catch (error) {
          get().notify((error as Error).message);
        }
      return next;
    });
    set({ selected: node.id });
  },
  update: (id, patch, key) =>
    get().edit(
      (doc) => ({ ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }),
      true,
      key,
    ),
  remove: (id) => {
    get().edit((doc) => ({
      ...doc,
      nodes: doc.nodes.filter((n) => n.id !== id),
      edges: doc.edges.filter((e) => e.source !== id && e.target !== id),
      preview: {
        ...doc.preview,
        a: doc.preview.a === id ? null : doc.preview.a,
        b: doc.preview.b === id ? null : doc.preview.b,
      },
    }));
    set({ selected: null });
  },
  duplicate: (id) => {
    if (get().document.nodes.length >= 100) {
      get().notify('This experiment supports up to 100 nodes.');
      return;
    }
    const source = get().document.nodes.find((n) => n.id === id);
    if (!source) return;
    const node = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      label: `${source.label.slice(0, 95)} copy`,
      position: { x: source.position.x, y: source.position.y + 190 },
    };
    get().edit((doc) => ({
      ...doc,
      nodes: [...doc.nodes, node],
      edges: [
        ...doc.edges,
        ...doc.edges
          .filter((e) => e.target === id)
          .map((e) => ({ ...e, id: crypto.randomUUID(), target: node.id })),
      ],
    }));
    set({ selected: node.id });
  },
  undo: () => {
    const s = get();
    const doc = s.past.at(-1);
    if (doc)
      set({
        document: doc,
        past: s.past.slice(0, -1),
        future: [s.document, ...s.future],
        selected: null,
      });
  },
  redo: () => {
    const s = get();
    const doc = s.future[0];
    if (doc)
      set({
        document: doc,
        past: [...s.past, s.document],
        future: s.future.slice(1),
        selected: null,
      });
  },
  notify: (notice) => set({ notice }),
}));
export function insertGrayscale(id: string) {
  const { document: doc } = useLab.getState();
  const target = doc.nodes.find((n) => n.id === id)!;
  const edge = doc.edges.find((e) => e.target === id && e.input === 0);
  const source = edge
    ? doc.nodes.find((n) => n.id === edge.source)
    : doc.nodes.filter((n) => n.id !== id && !descendants(doc, id).has(n.id)).at(-1);
  if (!source) {
    useLab.getState().notify('Add an image source first.');
    return;
  }
  const gray = newNode('grayscale', target.position.x - 220, target.position.y + 180);
  useLab.getState().edit((doc) => {
    let next = {
      ...doc,
      nodes: [...doc.nodes, gray],
      edges: doc.edges.filter((e) => !(e.target === id && e.input === 0)),
    };
    next = connect(next, source.id, gray.id);
    return connect(next, gray.id, id);
  });
}

export function updateParameter(nodeId: string, key: string, value: number | string): boolean {
  const { document, update, notify } = useLab.getState();
  const node = document.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const parameters = { ...node.parameters, [key]: value };
  const result = parameterSchema(node.operation).safeParse(parameters);
  if (!result.success) {
    notify(result.error.issues.map((i) => i.message).join(' '));
    return false;
  }
  update(nodeId, { parameters }, `${nodeId}:${key}`);
  return true;
}
