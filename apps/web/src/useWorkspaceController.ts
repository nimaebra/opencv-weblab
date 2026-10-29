import { useState, useEffect, useRef, useCallback } from 'react';
import {
  newNode,
  parseDocument,
  emptyDocument,
  executionSignature,
  type PipelineDocument,
} from '@opencv-weblab/pipeline';
import { useLab } from './store';
import { startRuntime, evaluate } from './runtime';
import {
  saveLocal,
  readLocal,
  listLocal,
  deleteLocal,
  collectUnusedAssets,
  putAsset,
  resolveAssets,
  getStorageState,
} from './persistence';
import { independentDocument, readBackup, validateImage, createBackup } from './projectFiles';
import { download } from './persistence';
export type SaveStatus = 'saving' | 'saved' | 'temporary' | 'failed';
export function useWorkspaceController() {
  const doc = useLab((s) => s.document),
    notice = useLab((s) => s.notice);
  const past = useLab((s) => s.past.length),
    future = useLab((s) => s.future.length);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saving');
  const [panel, setPanel] = useState<'workspace' | 'tools' | 'inspector'>('workspace');
  const [dialog, setDialog] = useState<'projects' | 'export' | null>(null);
  const [exportTab, setExportTab] = useState<'python' | 'json'>('python');
  const [localProjects, setLocalProjects] = useState<
    { id: string; name: string; updatedAt: number }[]
  >([]);
  const workspace = useRef<HTMLDivElement>(null);
  const reconnectNode = useRef<string | null>(null);
  const navigation = useRef(0);
  const signature = executionSignature(doc);
  const flushLocal = useCallback(async () => {
    const document = useLab.getState().document;
    const snapshot = JSON.stringify(document);
    try {
      await resolveAssets(document);
      await saveLocal(document);
      if (JSON.stringify(useLab.getState().document) === snapshot) setSaveStatus('saved');
      return true;
    } catch {
      setSaveStatus(getStorageState() === 'temporary' ? 'temporary' : 'failed');
      return false;
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void readLocal()
      .then((document) => {
        if (!mounted) return;
        if (document) useLab.getState().replace(document);
        setHydrated(true);
      })
      .catch(() => {
        if (mounted) {
          setSaveStatus('temporary');
          setHydrated(true);
        }
      });
    startRuntime();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (hydrated) void evaluate(useLab.getState().document);
  }, [signature, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => void flushLocal(), 400);
    return () => clearTimeout(timer);
  }, [doc, hydrated, flushLocal]);
  useEffect(() => {
    const storage = () => {
      if (getStorageState() !== 'available')
        setSaveStatus(getStorageState() === 'temporary' ? 'temporary' : 'failed');
    };
    const reconnect = (e: Event) => {
      reconnectNode.current = (e as CustomEvent<string>).detail;
      document.getElementById('reconnect-input')?.click();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') void flushLocal();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (getStorageState() !== 'available') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('opencv-weblab-storage', storage);
    window.addEventListener('opencv-weblab-reconnect', reconnect);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('opencv-weblab-storage', storage);
      window.removeEventListener('opencv-weblab-reconnect', reconnect);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [flushLocal]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useLab.getState().notify(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement).closest('[role="dialog"]'))
        return;
      // Panels must also close while focus is in search or a parameter field.
      if (event.key === 'Escape') {
        setPanel('workspace');
        return;
      }
      if (
        (event.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable], [role="dialog"]',
        )
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) useLab.getState().redo();
        else useLab.getState().undo();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'd' &&
        (event.target as HTMLElement).closest('.graph-section')
      ) {
        event.preventDefault();
        useLab.getState().duplicateSelection();
      }
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setPanel('tools');
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('[aria-label="Find an operation"]')?.focus(),
        );
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const chooseDocument = async (
    document: PipelineDocument,
    assets?: { id: string; blob: Blob }[],
  ) => {
    const token = ++navigation.current;
    await flushLocal();
    if (token !== navigation.current) return false;
    let persisted = false;
    if (assets)
      try {
        await saveLocal(document, assets);
        persisted = true;
      } catch {
        /* The complete import remains available in memory for a backup. */
      }
    if (token !== navigation.current) return false;
    useLab.getState().replace(parseDocument(document));
    setSaveStatus(
      assets
        ? persisted
          ? 'saved'
          : getStorageState() === 'temporary'
            ? 'temporary'
            : 'failed'
        : 'saving',
    );
    setDialog(null);
    setPanel('workspace');
    return true;
  };
  async function openProjects() {
    await flushLocal();
    setLocalProjects(await listLocal());
    setDialog('projects');
  }
  async function removeProject(id: string) {
    try {
      await flushLocal();
      await deleteLocal(id);
      if (useLab.getState().document.id === id) useLab.getState().replace(emptyDocument());
      const state = useLab.getState();
      await collectUnusedAssets([state.document, ...state.past, ...state.future]);
      setLocalProjects(await listLocal());
    } catch (error) {
      useLab.getState().notify((error as Error).message);
    }
  }
  async function duplicateProject(id: string) {
    const original = await readLocal(id);
    if (!original) return;
    const copy = independentDocument(original);
    copy.name = `${copy.name.slice(0, 94)} copy`;
    await chooseDocument(copy);
  }
  async function renameProject(id: string, name: string) {
    const original = await readLocal(id);
    if (!original) return;
    const renamed = { ...original, name: name.trim().slice(0, 100) || 'Untitled experiment' };
    if (id === useLab.getState().document.id) useLab.getState().edit(() => renamed);
    await saveLocal(renamed);
    setLocalProjects(await listLocal());
  }
  async function addImages(files: FileList | null, reconnectId?: string | null) {
    if (!files) return;
    const projectId = useLab.getState().document.id;
    for (const file of Array.from(files)) {
      try {
        const size = await validateImage(file);
        if (useLab.getState().document.id !== projectId)
          throw new Error('Image import stopped because the active experiment changed.');
        const current = useLab.getState().document;
        const existing = reconnectId ? current.nodes.find((n) => n.id === reconnectId) : undefined;
        if (
          (!existing && current.nodes.length >= 100) ||
          (current.sources.length >= 20 &&
            (!existing ||
              current.nodes.some((n) => n.id !== existing.id && n.sourceId === existing.sourceId)))
        )
          throw new Error('This experiment supports up to 20 images and 100 nodes.');
        const id = crypto.randomUUID();
        await putAsset(id, file);
        if (useLab.getState().document.id !== projectId) continue;
        const source = {
          id,
          name: file.name,
          mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
          ...size,
        };
        if (existing) {
          useLab.getState().edit((doc) => {
            const nodes = doc.nodes.map((n) => (n.id === existing.id ? { ...n, sourceId: id } : n));
            const used = new Set(nodes.map((n) => n.sourceId));
            return {
              ...doc,
              nodes,
              sources: [...doc.sources.filter((s) => used.has(s.id)), source],
            };
          });
        } else {
          const node = {
            ...newNode('source', 0, current.sources.length * 210),
            sourceId: id,
            label: file.name.slice(0, 100),
          };
          useLab.getState().edit((doc) => ({
            ...doc,
            sources: [...doc.sources, source],
            nodes: [...doc.nodes, node],
            preview: { ...doc.preview, a: doc.preview.a ?? node.id, b: node.id },
          }));
          useLab.getState().select(node.id);
        }
      } catch (error) {
        useLab.getState().notify((error as Error).message);
      }
    }
  }
  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (/\.zip$/i.test(file.name) || (signature[0] === 0x50 && signature[1] === 0x4b)) {
        const imported = await readBackup(file);
        if (!(await chooseDocument(imported.document, imported.assets))) return;
        window.dispatchEvent(new Event('opencv-weblab-assets'));
        useLab.getState().notify('Portable experiment imported with its original images.');
      } else {
        if (file.size > 2 * 1024 * 1024)
          throw new Error('Project JSON must be smaller than 2 MiB.');
        await chooseDocument(independentDocument(parseDocument(JSON.parse(await file.text()))));
        useLab
          .getState()
          .notify('Graph imported. Reconnect any missing original images in the Inspector.');
      }
    } catch (error) {
      useLab.getState().notify(`Import failed: ${(error as Error).message}`);
    }
  }
  async function backup() {
    try {
      const document = useLab.getState().document;
      download(`${document.name}.opencv-weblab.zip`, await createBackup(document));
    } catch (error) {
      useLab.getState().notify((error as Error).message);
    }
  }
  function resizePanel(
    event: React.PointerEvent<HTMLDivElement>,
    side: 'left' | 'right' | 'vertical',
  ) {
    if (event.button !== 0 || !workspace.current) return;
    event.preventDefault();
    const el = workspace.current,
      bounds = el.getBoundingClientRect();
    const preview = el.querySelector<HTMLElement>('.preview-section');
    const minPreview = Math.max(
      280,
      preview ? Number.parseFloat(getComputedStyle(preview).minHeight) || 0 : 0,
    );
    const maxPreview = Math.max(minPreview, bounds.height - 260);
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (move: PointerEvent) => {
      if (side === 'left')
        el.style.setProperty(
          '--library-width',
          `${Math.max(190, Math.min(340, move.clientX - bounds.left))}px`,
        );
      else if (side === 'right')
        el.style.setProperty(
          '--inspector-width',
          `${Math.max(250, Math.min(430, bounds.right - move.clientX))}px`,
        );
      else
        el.style.setProperty(
          '--preview-height',
          `${Math.max(minPreview, Math.min(maxPreview, move.clientY - bounds.top))}px`,
        );
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
    window.addEventListener('blur', stop, { once: true });
  }
  return {
    doc,
    notice,
    past,
    future,
    saveStatus,
    panel,
    setPanel,
    dialog,
    setDialog,
    exportTab,
    setExportTab,
    localProjects,
    setLocalProjects,
    workspace,
    reconnectNode,
    chooseDocument,
    openProjects,
    removeProject,
    duplicateProject,
    renameProject,
    addImages,
    importJson,
    resizePanel,
    flushLocal,
    backup,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
