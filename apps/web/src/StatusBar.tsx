import { useOffline } from './offline';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@roveran/ui';
import { useLab } from './store';
import { useRuntime, restartRuntime } from './runtime';
import type { WorkspaceController } from './useWorkspaceController';
function runtimeLabel(status: string, message: string) {
  switch (status) {
    case 'error':
      return message;
    case 'loading':
      return 'Loading OpenCV 4.13.0…';
    case 'processing':
      return 'Updating preview…';
    case 'exporting':
      return 'Rendering full-resolution PNG…';
    default:
      return 'OpenCV 4.13.0 · WebAssembly';
  }
}
const offlineLabels = {
  ready: 'Ready offline',
  preparing: 'Preparing offline access…',
  unavailable: 'Offline cache unavailable',
  development: 'Local development',
};
export function StatusBar({ controller }: { controller: WorkspaceController }) {
  const { notice } = controller;
  const offline = useOffline((s) => s.status);
  const status = useRuntime((s) => s.status),
    message = useRuntime((s) => s.message),
    stats = useRuntime((s) => s.stats);
  return (
    <>
      <footer className="status-bar">
        <div className="row">
          <span className={`status-dot ${status}`} />
          <span role="status" aria-live="polite">
            {runtimeLabel(status, message)}
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
          <span>{offlineLabels[offline]}</span>
          <span className="footer-version">v0.2</span>
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
