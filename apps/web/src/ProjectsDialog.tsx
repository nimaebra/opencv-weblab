import { Upload, FlaskConical, Trash2 } from 'lucide-react';
import { Button, Modal } from '@roveran/ui';
import { emptyDocument } from '@roveran/pipeline';
import { useLab } from './store';
import { readLocal, listLocal, deleteLocal } from './persistence';
import { cloud } from './cloud';
import type { WorkspaceController } from './useWorkspaceController';
export function ProjectsDialog({ controller }: { controller: WorkspaceController }) {
  const {
    dialog,
    setDialog,
    localProjects,
    setLocalProjects,
    cloudProjects,
    setCloudProjects,
    user,
    chooseDocument,
  } = controller;

  return (
    <>
      <Modal
        open={dialog === 'projects'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Your experiments"
        description="Projects on this device are saved automatically. Cloud projects are private to your account."
      >
        <div className="export-options">
          <Button
            variant="primary"
            icon={<FlaskConical size={15} />}
            onClick={() => void chooseDocument(emptyDocument())}
          >
            New experiment
          </Button>
          <Button
            icon={<Upload size={15} />}
            onClick={() => document.getElementById('json-input')?.click()}
          >
            Import JSON
          </Button>
        </div>
        <h3 className="list-heading">On this device</h3>
        <div className="project-list">
          {localProjects.map((project) => (
            <div className="project-row" key={project.id}>
              <button
                onClick={() =>
                  void readLocal(project.id)
                    .then((document) => document && chooseDocument(document))
                    .catch((error) => useLab.getState().notify(error.message))
                }
              >
                <strong>{project.name}</strong>
                <span>{new Date(project.updatedAt).toLocaleString()}</span>
              </button>
              <Button
                aria-label={`Delete local project ${project.name}`}
                icon={<Trash2 size={15} />}
                onClick={() =>
                  void deleteLocal(project.id)
                    .then(() => listLocal())
                    .then(setLocalProjects)
                    .catch((error) => useLab.getState().notify(error.message))
                }
              />
            </div>
          ))}
          {!localProjects.length && <p className="empty-small">No saved experiments yet.</p>}
        </div>
        {user && (
          <>
            <h3 className="list-heading">In your cloud library</h3>
            <div className="project-list">
              {cloudProjects.map((project) => (
                <div className="project-row" key={project.id}>
                  <button
                    onClick={() =>
                      void cloud
                        .get(project.id)
                        .then(async (project) => {
                          await cloud.restoreImages(project);
                          await chooseDocument(project.document, project);
                        })
                        .catch((error) => useLab.getState().notify(error.message))
                    }
                  >
                    <strong>{project.document.name}</strong>
                    <span>
                      {project.syncImages
                        ? 'Graph and source images'
                        : 'Graph only · reconnect images on another device'}
                    </span>
                  </button>
                  <Button
                    aria-label={`Delete cloud project ${project.document.name}`}
                    icon={<Trash2 size={15} />}
                    onClick={() =>
                      void cloud
                        .remove(project.id)
                        .then(() => cloud.list())
                        .then(setCloudProjects)
                        .catch((error) => useLab.getState().notify(error.message))
                    }
                  />
                </div>
              ))}
              {!cloudProjects.length && (
                <p className="empty-small">Save an experiment to see it here.</p>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
