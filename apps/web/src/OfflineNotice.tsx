import { useState } from 'react';
import { Button } from '@opencv-weblab/ui';
import { useOffline, activateUpdate } from './offline';
import { useLab } from './store';
import { createBackup } from './projectFiles';
import { download } from './persistence';
import type { WorkspaceController } from './useWorkspaceController';
export function OfflineNotice({ controller }: { controller: WorkspaceController }) {
  const update = useOffline((s) => s.updateAvailable);
  const [blocked, setBlocked] = useState(false),
    [backupSnapshot, setBackupSnapshot] = useState(''),
    [busy, setBusy] = useState(false);
  const unsafe = controller.saveStatus === 'temporary' || controller.saveStatus === 'failed';
  async function apply() {
    setBusy(true);
    try {
      if (
        (await controller.flushLocal()) ||
        backupSnapshot === JSON.stringify(useLab.getState().document)
      )
        await activateUpdate();
      else setBlocked(true);
    } catch (error) {
      useLab.getState().notify(`Update could not be applied: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    try {
      const doc = useLab.getState().document,
        snapshot = JSON.stringify(doc);
      download(`${doc.name}.opencv-weblab.zip`, await createBackup(doc));
      setBackupSnapshot(snapshot);
    } catch (error) {
      useLab.getState().notify((error as Error).message);
    }
  }
  if (!unsafe && !update) return null;
  return (
    <aside className="storage-notice" aria-label="Storage and app updates" role="status">
      <div>
        {unsafe ? (
          <>
            <strong>
              {controller.saveStatus === 'temporary'
                ? 'Temporary session'
                : 'Could not save on this device'}
            </strong>
            <span>Keep this tab open and download a portable backup to keep your work.</span>
          </>
        ) : (
          <>
            <strong>An update is ready</strong>
            <span>Your experiment will be saved before reloading.</span>
          </>
        )}
        {blocked && (
          <span>The update is waiting. Download a backup before reloading, or keep editing.</span>
        )}
      </div>
      {(unsafe || blocked) && <Button onClick={() => void backup()}>Download backup</Button>}
      {unsafe && <Button onClick={() => void controller.flushLocal()}>Retry save</Button>}
      {update && (
        <Button variant="primary" disabled={busy} onClick={() => void apply()}>
          {blocked && backupSnapshot ? 'Reload after backup' : 'Save and update'}
        </Button>
      )}
    </aside>
  );
}
