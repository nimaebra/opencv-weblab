import { RefreshCw, X } from 'lucide-react';
import { Button } from '@roveran/ui';
import { useLab } from './store';
import { useRuntime, restartRuntime } from './runtime';
import type { WorkspaceController } from './useWorkspaceController';
export function StatusBar({ controller }: { controller: WorkspaceController }) {
  const { notice } = controller;
  const status = useRuntime((s) => s.status),
    message = useRuntime((s) => s.message),
    stats = useRuntime((s) => s.stats);
  return (
    <>
      <footer className="status-bar">
        <div className="row">
          <span className={`status-dot ${status}`} />
          <span role="status" aria-live="polite">
            {status === 'error'
              ? message
              : status === 'loading'
                ? 'Loading OpenCV 4.13.0…'
                : status === 'processing'
                  ? 'Updating preview…'
                  : status === 'exporting'
                    ? 'Rendering full-resolution PNG…'
                    : 'OpenCV 4.13.0 · WebAssembly'}
          </span>
          {status === 'error' && (
            <Button icon={<RefreshCw size={12} />} onClick={restartRuntime}>
              Restart engine
            </Button>
          )}
        </div>
        <div className="row status-stats">
          {stats && (
            <>
              <span>{stats.elapsed.toFixed(0)} ms</span>
              <span>
                {stats.computed} computed · {stats.cached} cached
              </span>
            </>
          )}
          <span className="privacy-dot" />
          <span>Processing on your device</span>
          <span className="footer-version">v0.1</span>
        </div>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <Button
            aria-label="Dismiss message"
            icon={<X size={15} />}
            onClick={() => useLab.getState().notify('')}
          />
        </div>
      )}
    </>
  );
}
