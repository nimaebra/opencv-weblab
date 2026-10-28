import { ReactFlowProvider } from '@xyflow/react';
import { Menu, PanelRight } from 'lucide-react';
import { Button } from '@roveran/ui';
import { Library } from './Library';
import { Inspector } from './Inspector';
import { Graph } from './Graph';
import { Preview } from './Preview';
import type { WorkspaceController } from './useWorkspaceController';
export function Workspace({ controller }: { controller: WorkspaceController }) {
  const { doc, panel, setPanel, workspace, resizePanel } = controller;

  return (
    <>
      <nav className="mobile-nav" aria-label="Workspace panels">
        <Button
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
          aria-pressed={panel === 'inspector'}
          icon={<PanelRight size={15} />}
          onClick={() => setPanel(panel === 'inspector' ? 'workspace' : 'inspector')}
        >
          Inspector
        </Button>
      </nav>
      <main ref={workspace} className={`workspace show-${panel}`}>
        <Library />
        <div
          className="resize-handle library-resize"
          role="separator"
          aria-label="Resize tools panel"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={(e) => resizePanel(e, 'left')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
              workspace.current?.style.setProperty(
                '--library-width',
                `${e.key === 'ArrowLeft' ? 210 : 280}px`,
              );
          }}
        />
        <div className="workbench">
          <Preview />
          <div
            className="resize-handle preview-resize"
            role="separator"
            aria-label="Resize image preview"
            aria-orientation="horizontal"
            tabIndex={0}
            onPointerDown={(e) => resizePanel(e, 'vertical')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
                workspace.current?.style.setProperty(
                  '--preview-height',
                  e.key === 'ArrowUp' ? '300px' : '450px',
                );
            }}
          />
          <ReactFlowProvider key={doc.id}>
            <Graph />
          </ReactFlowProvider>
        </div>
        <div
          className="resize-handle inspector-resize"
          role="separator"
          aria-label="Resize inspector panel"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={(e) => resizePanel(e, 'right')}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
              workspace.current?.style.setProperty(
                '--inspector-width',
                e.key === 'ArrowLeft' ? '360px' : '280px',
              );
          }}
        />
        <Inspector />
      </main>
    </>
  );
}
