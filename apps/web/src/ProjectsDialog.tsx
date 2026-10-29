import { useState } from 'react';
import { Upload, FlaskConical, Trash2, Copy, Pencil, Download } from 'lucide-react';
import { Button, Modal } from '@opencv-weblab/ui';
import { emptyDocument } from '@opencv-weblab/pipeline';
import { useLab } from './store';
import { readLocal } from './persistence';
import type { WorkspaceController } from './useWorkspaceController';
export function ProjectsDialog({ controller }: { controller: WorkspaceController }) {
  const {
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
    [deleting, setDeleting] = useState<string | null>(null),
    [renaming, setRenaming] = useState<string | null>(null),
    [name, setName] = useState('');
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
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <div className="project-list">
        {localProjects
          .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
          .map((project) => (
            <div className="project-row" key={project.id}>
              {renaming === project.id ? (
                <form
                  className="project-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(renameProject(project.id, name).then(() => setRenaming(null)));
                  }}
                >
                  <input
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
                    onClick={() =>
                      run(
                        readLocal(project.id).then(
                          (document) => document && chooseDocument(document),
                        ),
                      )
                    }
                  >
                    <strong>{project.name}</strong>
                    <span>{new Date(project.updatedAt).toLocaleString()}</span>
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
                    onClick={() => {
                      setDeleting(project.id);
                      setRenaming(null);
                    }}
                  />
                </>
              )}
              {deleting === project.id && (
                <div className="delete-confirm" role="group" aria-label="Confirm project deletion">
                  <p>Delete “{project.name}” from this device?</p>
                  <Button
                    variant="danger"
                    onClick={() => run(removeProject(project.id).then(() => setDeleting(null)))}
                  >
                    Delete experiment
                  </Button>
                  <Button onClick={() => setDeleting(null)}>Keep experiment</Button>
                </div>
              )}
            </div>
          ))}
      </div>
      {!localProjects.length && <p className="empty-small">No saved experiments yet.</p>}
      {localProjects.length > 0 &&
        !localProjects.some((p) => p.name.toLowerCase().includes(search.toLowerCase())) && (
          <p className="empty-small">No experiments match your search.</p>
        )}
    </Modal>
  );
}
