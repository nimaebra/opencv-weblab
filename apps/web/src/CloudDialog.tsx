import { ArrowUpRight, Cloud, Check, LogOut } from 'lucide-react';
import { Button, Modal } from '@roveran/ui';
import type { WorkspaceController } from './useWorkspaceController';
export function CloudDialog({ controller }: { controller: WorkspaceController }) {
  const {
    dialog,
    setDialog,
    cloudProject,
    includeImages,
    setIncludeImages,
    cloudBusy,
    cloudError,
    conflict,
    user,
    providers,
    cloudAvailable,
    saveCloud,
    signIn,
    signOut,
  } = controller;

  return (
    <>
      <Modal
        open={dialog === 'cloud'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={user ? 'Save beyond this device' : 'Keep your experiments close'}
        description={
          user
            ? `Signed in as ${user.email}`
            : 'Sign in to save private cloud projects. You can always keep working as a guest.'
        }
      >
        {user ? (
          <>
            <label className="sync-option">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
              />
              <span>
                <strong>Include original images</strong>
                <small>
                  Upload source images for this project so it opens on another device. Turning this
                  off removes its cloud image copies.
                </small>
              </span>
            </label>
            <p className="muted cloud-explainer">
              {includeImages
                ? 'Your graph and original source images will be uploaded.'
                : 'Only your graph is uploaded. Original images stay on this device.'}
            </p>
            {cloudProject && <p className="muted">Cloud revision {cloudProject.revision}</p>}
            {cloudError && (
              <p className="inline-error" role="alert">
                {cloudError}
              </p>
            )}
            <div className="export-options">
              <Button
                variant="primary"
                disabled={cloudBusy}
                icon={<Cloud size={15} />}
                onClick={() => void saveCloud(conflict)}
              >
                {cloudBusy ? 'Saving…' : conflict ? 'Save as a new copy' : 'Save to cloud'}
              </Button>
              <Button icon={<LogOut size={15} />} onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-buttons">
              {(['google', 'github'] as const).map((provider) => (
                <Button
                  key={provider}
                  disabled={!providers.includes(provider)}
                  onClick={() => void signIn(provider)}
                >
                  Continue with {provider === 'google' ? 'Google' : 'GitHub'}
                  <ArrowUpRight size={15} />
                </Button>
              ))}
            </div>
            {!cloudAvailable && (
              <p className="cloud-unavailable">
                Cloud accounts are unavailable on this deployment. Your projects are saved on this
                device.
              </p>
            )}
            {cloudError && (
              <p role="alert" className="inline-error">
                {cloudError}
              </p>
            )}
            <div className="privacy-note">
              <Check size={16} />
              <p>
                Images stay on your device until you choose to include them. Image processing always
                happens in your browser.
              </p>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
