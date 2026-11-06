import { useRef, useState } from 'react';
import { Upload, FlaskConical, Trash2, Copy, Pencil, Download } from 'lucide-react';
import { Button, Modal, TextInput } from '@opencv-weblab/ui';
import { emptyDocument } from '@opencv-weblab/pipeline';
import { useLab } from './store';
import { readLocal } from './persistence';
import type { WorkspaceController } from './useWorkspaceController';
export function ProjectsDialog({ controller }: { controller: WorkspaceController }) {
  const {
    doc,
    dialog,
    setDialog,
    localProjects,
    chooseDocument,
    removeProject,
    duplicateProject,
    renameProject,
    backup,
  } = controller;
  const [search, setSearch] = useState(''),
    [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null),
    [deletePending, setDeletePending] = useState(false),
    [renaming, setRenaming] = useState<string | null>(null),
    [name, setName] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const query = search.trim().toLowerCase();
  const matchingProjects = localProjects.filter((p) => p.name.toLowerCase().includes(query));
  const run = (action: Promise<unknown>) =>
    void action.catch((error) => useLab.getState().notify(error.message));
  return (
    <Modal
      open={dialog === 'projects'}
      onOpenChange={(open) => {
        if (!open) {
          setDialog(null);
          setDeleting(null);
          setRenaming(null);
        }
      }}
      title="Your experiments"
      className="projects-dialog"
      description="Saved in this browser on this device. Download portable backups before clearing browser data or moving to another device."
    >
      <div className="export-options">
        <Button
          variant="primary"
          icon={<FlaskConical size={15} />}
          onClick={() => run(chooseDocument(emptyDocument()))}
        >
          New experiment
        </Button>
        <Button
          icon={<Upload size={15} />}
          onClick={() => document.getElementById('json-input')?.click()}
        >
          Import project
        </Button>
        <Button icon={<Download size={15} />} onClick={() => void backup()}>
          Back up current
        </Button>
      </div>
      <label className="field">
        Find an experiment
        <TextInput
          ref={searchInput}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="project-list">
        {matchingProjects.map((project) => (
          <div className="project-row" key={project.id}>
            {renaming === project.id ? (
              <form
                className="project-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(renameProject(project.id, name).then(() => setRenaming(null)));
                }}
              >
                <TextInput
                  aria-label="New experiment name"
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                <Button type="submit">Save name</Button>
                <Button type="button" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <button
                  aria-current={project.id === doc.id ? 'true' : undefined}
                  onClick={() =>
                    run(
                      readLocal(project.id).then(
                        (document) => document && chooseDocument(document),
                      ),
                    )
                  }
                >
                  <strong>{project.name}</strong>
                  <span className="project-date">
                    {new Date(project.updatedAt).toLocaleString()}
                  </span>
                  {project.id === doc.id && <span className="current-project">Open now</span>}
                </button>
                <Button
                  aria-label={`Rename ${project.name}`}
                  icon={<Pencil size={14} />}
                  onClick={() => {
                    setName(project.name);
                    setRenaming(project.id);
                    setDeleting(null);
                  }}
                />
                <Button
                  aria-label={`Duplicate ${project.name}`}
                  icon={<Copy size={14} />}
                  onClick={() => run(duplicateProject(project.id))}
                />
                <Button
                  variant="danger"
                  aria-label={`Delete local project ${project.name}`}
                  icon={<Trash2 size={14} />}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    setDeleting(project);
                    setRenaming(null);
                  }}
                />
              </>
            )}
          </div>
        ))}
      </div>
      {!localProjects.length && <p className="empty-small">No saved experiments yet.</p>}
      {localProjects.length > 0 && matchingProjects.length === 0 && (
        <p className="empty-small">No experiments match your search.</p>
      )}
      <Modal
        alert
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleting(null);
        }}
        title="Confirm project deletion"
        description={`Delete “${deleting?.name ?? ''}” from this device?`}
        className="delete-dialog"
        fallbackFocus={searchInput}
      >
        <div className="delete-dialog-actions" aria-busy={deletePending}>
          <Button disabled={deletePending} onClick={() => setDeleting(null)}>
            Keep experiment
          </Button>
          <Button
            variant="danger"
            disabled={deletePending}
            onClick={() => {
              if (!deleting) return;
              setDeletePending(true);
              run(
                removeProject(deleting.id)
                  .then(() => setDeleting(null))
                  .finally(() => setDeletePending(false)),
              );
            }}
          >
            Delete experiment
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}
