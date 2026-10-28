import { useState, useEffect, useRef, useCallback, useEffectEvent } from 'react';
import {
  newNode,
  parseDocument,
  executionSignature,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  type PipelineDocument,
} from '@roveran/pipeline';
import { useLab } from './store';
import { startRuntime, evaluate } from './runtime';
import {
  saveLocal,
  readLocal,
  listLocal,
  putAsset,
  resolveAssets,
  getCloudBinding,
  putCloudBinding,
} from './persistence';
import { cloud, authClient, ConflictError, type CloudProject } from './cloud';
type Panel = 'workspace' | 'tools' | 'inspector';
export function useWorkspaceController() {
  const doc = useLab((s) => s.document),
    notice = useLab((s) => s.notice),
    past = useLab((s) => s.past.length),
    future = useLab((s) => s.future.length);

  const [hydrated, setHydrated] = useState(false),
    [saved, setSaved] = useState(false),
    [panel, setPanel] = useState<Panel>('workspace'),
    [dialog, setDialog] = useState<'projects' | 'export' | 'cloud' | null>(null),
    [exportTab, setExportTab] = useState<'python' | 'json'>('python'),
    [localProjects, setLocalProjects] = useState<{ id: string; name: string; updatedAt: number }[]>(
      [],
    ),
    [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]),
    [cloudProject, setCloudProject] = useState<CloudProject | null>(null),
    [includeImages, setIncludeImages] = useState(false),
    [cloudBusy, setCloudBusy] = useState(false),
    [cloudError, setCloudError] = useState(''),
    [conflict, setConflict] = useState(false),
    [user, setUser] = useState<{ name: string; email: string } | null>(null),
    [providers, setProviders] = useState<('google' | 'github')[]>([]),
    [cloudAvailable, setCloudAvailable] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const activeProject = useRef<CloudProject | null>(null);
  const reconnectNode = useRef<string | null>(null);
  const saving = useRef(false);
  const lastCloudSnapshot = useRef('');
  const signature = executionSignature(doc);
  const refreshSession = useCallback(async () => {
    try {
      const [config, session] = await Promise.all([cloud.config(), cloud.session()]);
      setProviders(config.providers);
      setCloudAvailable(config.cloud && config.providers.length > 0);
      setUser(session?.user ?? null);
    } catch {
      setCloudAvailable(false);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void readLocal()
      .then(async (document) => {
        if (mounted) {
          if (document) {
            useLab.getState().replace(document);
            const binding = (await getCloudBinding(document.id)) as CloudProject | undefined;
            if (binding) {
              activeProject.current = binding;
              lastCloudSnapshot.current = JSON.stringify(binding.document);
              setCloudProject(binding);
              setIncludeImages(binding.syncImages);
            }
          }
          setHydrated(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setHydrated(true);
          useLab
            .getState()
            .notify('Local storage is unavailable. Export JSON before closing this tab.');
        }
      });
    startRuntime();
    void refreshSession();
    return () => {
      mounted = false;
    };
  }, [refreshSession]);
  useEffect(() => {
    if (hydrated) void evaluate(useLab.getState().document);
  }, [signature, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    setSaved(false);
    const timer = setTimeout(
      () =>
        void saveLocal(doc)
          .then(() => setSaved(true))
          .catch(() =>
            useLab
              .getState()
              .notify('Device storage is full or unavailable. Export JSON to keep your project.'),
          ),
      400,
    );
    return () => clearTimeout(timer);
  }, [doc, hydrated]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => useLab.getState().notify(''), 7000);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) useLab.getState().redo();
        else useLab.getState().undo();
      }
      if (event.key === '/') {
        event.preventDefault();
        setPanel('tools');
        document.querySelector<HTMLInputElement>('[aria-label="Find an operation"]')?.focus();
      }
      if (event.key === 'Escape') setPanel('workspace');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const cloudId = cloudProject?.id;
  const onAutosave = useEffectEvent(() => {
    void saveCloud(false, true);
  });
  useEffect(() => {
    if (!cloudId || !user || conflict || cloudBusy) return;
    if (
      JSON.stringify(doc) === lastCloudSnapshot.current &&
      includeImages === activeProject.current?.syncImages
    )
      return;
    const timer = setTimeout(() => {
      if (saving.current) return;
      onAutosave();
    }, 1600);
    return () => clearTimeout(timer); /* cloud revision changes must not schedule another save */
  }, [doc, includeImages, user, conflict, cloudBusy, cloudId]);
  useEffect(() => {
    const handler = (event: Event) => {
      reconnectNode.current = (event as CustomEvent<string>).detail;
      document.getElementById('reconnect-input')?.click();
    };
    window.addEventListener('roveran-reconnect', handler);
    return () => window.removeEventListener('roveran-reconnect', handler);
  }, []);
  useEffect(() => {
    const handler = (event: Event) =>
      useLab.getState().notify((event as CustomEvent<string>).detail);
    window.addEventListener('roveran-storage-warning', handler);
    return () => window.removeEventListener('roveran-storage-warning', handler);
  }, []);
  const chooseDocument = async (document: PipelineDocument, current?: CloudProject | null) => {
    current =
      current === undefined
        ? (((await getCloudBinding(document.id)) as CloudProject | undefined) ?? null)
        : current;
    lastCloudSnapshot.current = current ? JSON.stringify(current.document) : '';
    activeProject.current = current;
    setCloudProject(current);
    setIncludeImages(current?.syncImages ?? false);
    setConflict(false);
    setCloudError('');
    useLab.getState().replace(document);
    setDialog(null);
    setPanel('workspace');
  };
  async function saveCloud(copy = false, automatic = false) {
    if (!user) {
      setDialog('cloud');
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setCloudBusy(true);
    setCloudError('');
    try {
      await resolveAssets(useLab.getState().document);
      const original = useLab.getState().document;
      const document = copy
        ? { ...original, id: crypto.randomUUID(), name: `${original.name} copy` }
        : original;
      const saved = await cloud.save(document, copy ? null : activeProject.current, includeImages);
      activeProject.current = saved;
      lastCloudSnapshot.current = JSON.stringify(document);
      await putCloudBinding(document.id, saved);
      setCloudProject(saved);
      setConflict(false);
      await cloud.syncImages(saved);
      if (copy) useLab.getState().replace(document);
      if (!automatic) useLab.getState().notify('Project saved to your cloud library.');
    } catch (error) {
      setCloudError((error as Error).message);
      if (error instanceof ConflictError) {
        setConflict(true);
        setDialog('cloud');
      }
    } finally {
      saving.current = false;
      setCloudBusy(false);
    }
  }
  async function signOut() {
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? 'Sign out failed.');
      setUser(null);
      setCloudProject(null);
      activeProject.current = null;
    } catch (error) {
      setCloudError((error as Error).message);
    }
  }
  async function signIn(provider: 'google' | 'github') {
    setCloudError('');
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin,
      });
      if (result.error) setCloudError(result.error.message ?? 'Sign in failed.');
    } catch (error) {
      setCloudError((error as Error).message);
    }
  }
  async function openProjects() {
    await saveLocal(useLab.getState().document).catch(() => {});
    setLocalProjects(await listLocal());
    setDialog('projects');
    if (user)
      try {
        setCloudProjects(await cloud.list());
      } catch (error) {
        useLab.getState().notify((error as Error).message);
      }
  }
  async function addImages(files: FileList | null, reconnectId?: string | null) {
    if (!files) return;
    for (const file of files) {
      try {
        if (
          !reconnectId &&
          (useLab.getState().document.sources.length >= 20 ||
            useLab.getState().document.nodes.length >= 100)
        )
          throw new Error('This experiment supports up to 20 images and 100 nodes.');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
          throw new Error('Choose a PNG, JPEG, or WebP image.');
        if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 20 MiB.');
        const bitmap = await createImageBitmap(file);
        const { width, height } = bitmap;
        bitmap.close();
        if (width * height > MAX_IMAGE_PIXELS || width > 16384 || height > 16384)
          throw new Error('Choose an image of at most 16 megapixels and 16,384 pixels per edge.');
        const existing = reconnectId
          ? useLab.getState().document.nodes.find((n) => n.id === reconnectId)
          : undefined;
        const id = existing?.sourceId ?? crypto.randomUUID();
        await putAsset(id, file);
        if (existing) {
          useLab.getState().edit((doc) => ({
            ...doc,
            sources: doc.sources.map((s) =>
              s.id === id
                ? {
                    id,
                    name: file.name,
                    mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
                    width,
                    height,
                  }
                : s,
            ),
          }));
          continue;
        }
        const node = {
          ...newNode('source', 0, useLab.getState().document.sources.length * 210),
          sourceId: id,
          label: file.name.slice(0, 100),
        };
        useLab.getState().edit((doc) => ({
          ...doc,
          sources: [
            ...doc.sources,
            {
              id,
              name: file.name,
              mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
              width,
              height,
            },
          ],
          nodes: [...doc.nodes, node],
          preview: { ...doc.preview, a: doc.preview.a ?? node.id, b: node.id },
        }));
        useLab.getState().select(node.id);
      } catch (error) {
        useLab.getState().notify((error as Error).message);
      }
    }
  }
  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Project JSON must be smaller than 2 MiB.');
      const document = parseDocument(JSON.parse(await file.text()));
      await chooseDocument(document);
      useLab
        .getState()
        .notify('Project imported. Reconnect any missing source images in the Inspector.');
    } catch (error) {
      useLab.getState().notify(`Import failed: ${(error as Error).message}`);
    }
  }
  function resizePanel(
    event: React.PointerEvent<HTMLDivElement>,
    side: 'left' | 'right' | 'vertical',
  ) {
    event.preventDefault();
    const el = workspace.current!;
    const bounds = el.getBoundingClientRect();
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
          `${Math.max(240, Math.min(bounds.height - 210, move.clientY - bounds.top))}px`,
        );
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  }

  return {
    doc,
    notice,
    past,
    future,
    saved,
    panel,
    setPanel,
    dialog,
    setDialog,
    exportTab,
    setExportTab,
    localProjects,
    setLocalProjects,
    cloudProjects,
    setCloudProjects,
    cloudProject,
    setCloudProject,
    includeImages,
    setIncludeImages,
    cloudBusy,
    cloudError,
    setCloudError,
    conflict,
    user,
    setUser,
    providers,
    cloudAvailable,
    workspace,
    activeProject,
    reconnectNode,
    saving,
    chooseDocument,
    signIn,
    signOut,
    saveCloud,
    openProjects,
    addImages,
    importJson,
    resizePanel,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspaceController>;
