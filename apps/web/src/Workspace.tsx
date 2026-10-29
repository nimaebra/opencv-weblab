import { ReactFlowProvider } from '@xyflow/react';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Menu, PanelRight } from 'lucide-react';
import { Button } from '@opencv-weblab/ui';
import { Library } from './Library';
import { Inspector } from './Inspector';
import { Graph } from './Graph';
import { Preview } from './Preview';
import { ParameterComparison } from './ParameterComparison';
import { PanelResizeHandle } from './PanelResizeHandle';
import type { WorkspaceController } from './useWorkspaceController';
const panelBreakpoint = '(max-width: 950px)';
function subscribeBreakpoint(change: () => void) {
  const media = window.matchMedia(panelBreakpoint);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}
const isNarrow = () => window.matchMedia(panelBreakpoint).matches;
export function Workspace({ controller }: { controller: WorkspaceController }) {
  const { doc, panel, setPanel, workspace, resizePanel } = controller;
  const revealWorkspace = useCallback(() => setPanel('workspace'), [setPanel]);
  const narrow = useSyncExternalStore(subscribeBreakpoint, isNarrow);
  const toolsTrigger = useRef<HTMLButtonElement>(null);
  const inspectorTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!narrow || panel === 'workspace') return;
    const drawer = document.getElementById(panel === 'tools' ? 'tools-panel' : 'inspector-panel');
    const trigger = panel === 'tools' ? toolsTrigger.current : inspectorTrigger.current;
    const target = panel === 'tools' ? drawer?.querySelector<HTMLInputElement>('input') : drawer;
    target?.focus({ preventScroll: true });
    return () => {
      if (
        isNarrow() &&
        (drawer?.contains(document.activeElement) ||
          document.activeElement?.classList.contains('panel-backdrop') ||
          document.activeElement === document.body)
      ) {
        trigger?.focus({ preventScroll: true });
      }
    };
  }, [narrow, panel]);

  return (
    <>
      <nav className="mobile-nav" aria-label="Workspace panels">
        <Button
          ref={toolsTrigger}
          aria-controls="tools-panel"
          aria-expanded={panel === 'tools'}
          aria-pressed={panel === 'tools'}
          icon={<Menu size={15} />}
          onClick={() => setPanel(panel === 'tools' ? 'workspace' : 'tools')}
        >
          Tools
        </Button>
        <Button aria-pressed={panel === 'workspace'} onClick={() => setPanel('workspace')}>
          Workspace
        </Button>
        <Button
          ref={inspectorTrigger}
          aria-controls="inspector-panel"
          aria-expanded={panel === 'inspector'}
          aria-pressed={panel === 'inspector'}
          icon={<PanelRight size={15} />}
          onClick={() => setPanel(panel === 'inspector' ? 'workspace' : 'inspector')}
        >
          Inspector
        </Button>
      </nav>
      <main ref={workspace} className={`workspace show-${panel}`}>
        <Library onClose={revealWorkspace} />
        <PanelResizeHandle side="left" workspace={workspace} onResize={resizePanel} />
        {narrow && panel !== 'workspace' && (
          <button
            className="panel-backdrop"
            aria-label="Close workspace panel"
            tabIndex={-1}
            onClick={revealWorkspace}
          />
        )}
        <div
          id="workspace-content"
          className="workbench"
          tabIndex={-1}
          inert={narrow && panel !== 'workspace'}
        >
          <Preview />
          <ParameterComparison />
          <PanelResizeHandle side="vertical" workspace={workspace} onResize={resizePanel} />
          <ReactFlowProvider key={doc.id}>
            <Graph />
          </ReactFlowProvider>
        </div>
        <PanelResizeHandle side="right" workspace={workspace} onResize={resizePanel} />
        <Inspector onCompare={revealWorkspace} onClose={revealWorkspace} />
      </main>
    </>
  );
}
