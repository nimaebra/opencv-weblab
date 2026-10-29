import { ArrowDownToLine, Upload, Code2, Braces, Download } from 'lucide-react';
import { Button, Modal } from '@opencv-weblab/ui';
import { generatePython } from '@opencv-weblab/pipeline';
import { useRuntime, exportImage } from './runtime';
import { download } from './persistence';
import type { WorkspaceController } from './useWorkspaceController';
export function ExportDialog({ controller }: { controller: WorkspaceController }) {
  const { doc, dialog, setDialog, exportTab, setExportTab, backup } = controller;
  const status = useRuntime((s) => s.status);
  let exported = '',
    exportError = false;
  if (dialog === 'export') {
    try {
      exported = exportTab === 'json' ? JSON.stringify(doc, null, 2) : generatePython(doc);
    } catch (error) {
      exportError = true;
      exported = `# ${(error as Error).message}\n# Complete the graph before exporting Python.`;
    }
  }
  return (
    <>
      <Modal
        open={dialog === 'export'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Take your experiment further"
        description="Keep the result, or turn your pipeline into code you can run yourself."
      >
        <div className="export-options">
          <Button onClick={() => void backup()} icon={<Download size={16} />}>
            Portable backup
          </Button>
          <Button
            variant="primary"
            icon={<Download size={16} />}
            disabled={status !== 'ready' || !doc.preview.b}
            onClick={() => exportImage(doc)}
          >
            Full-resolution PNG
          </Button>
          <Button
            icon={<Upload size={16} />}
            onClick={() => document.getElementById('json-input')?.click()}
          >
            Import project
          </Button>
        </div>
        <div className="export-tabs">
          <Button
            aria-pressed={exportTab === 'python'}
            icon={<Code2 size={15} />}
            onClick={() => setExportTab('python')}
          >
            Python / OpenCV
          </Button>
          <Button
            aria-pressed={exportTab === 'json'}
            icon={<Braces size={15} />}
            onClick={() => setExportTab('json')}
          >
            Pipeline JSON
          </Button>
        </div>
        <pre className="code-preview">
          <code>{exported}</code>
        </pre>
        <div className="dialog-footer">
          <p>
            {exportTab === 'json'
              ? 'Graph-only JSON keeps images separate. Use Portable backup to include originals.'
              : 'Includes source filenames, dependencies, and every operation.'}
          </p>
          <Button
            variant="primary"
            disabled={exportTab === 'python' && exportError}
            icon={<ArrowDownToLine size={15} />}
            onClick={() =>
              download(
                `${doc.name}.${exportTab === 'json' ? 'json' : 'py'}`,
                exported,
                exportTab === 'json' ? 'application/json' : 'text/x-python',
              )
            }
          >
            Download {exportTab === 'json' ? 'JSON' : 'Python'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
