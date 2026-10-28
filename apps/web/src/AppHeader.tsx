import {
  ArrowUpRight,
  FolderOpen,
  Undo2,
  Redo2,
  Cloud,
  Check,
  ChevronDown,
  ImagePlus,
  FlaskConical,
} from 'lucide-react';
import { Button } from '@roveran/ui';
import { makeExample } from '@roveran/pipeline';
import { useLab } from './store';
import { saveLocal } from './persistence';
import type { WorkspaceController } from './useWorkspaceController';
export function AppHeader({ controller }: { controller: WorkspaceController }) {
  const { doc, past, future, saved, setDialog, user, chooseDocument, openProjects } = controller;

  return (
    <>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Roveran home">
          <span className="brand-mark">
            <FlaskConical size={21} />
          </span>
          roveran
          <span className="brand-divider" />
        </a>
        <div className="project-title">
          <input
            aria-label="Project name"
            maxLength={100}
            value={doc.name}
            onChange={(e) =>
              useLab
                .getState()
                .edit(
                  (doc) => ({ ...doc, name: e.target.value || 'Untitled experiment' }),
                  true,
                  'title',
                )
            }
          />
          <ChevronDown size={13} />
          <span
            className="save-indicator"
            title={saved ? 'Saved on this device' : 'Saving locally'}
          >
            {saved ? <Check size={12} /> : <span className="saving-dot" />}
          </span>
        </div>
        <div className="history-actions">
          <Button
            aria-label="Undo"
            title="Undo (⌘/Ctrl Z)"
            disabled={!past}
            icon={<Undo2 size={16} />}
            onClick={() => useLab.getState().undo()}
          />
          <Button
            aria-label="Redo"
            title="Redo (⌘/Ctrl Shift Z)"
            disabled={!future}
            icon={<Redo2 size={16} />}
            onClick={() => useLab.getState().redo()}
          />
        </div>
        <div className="header-actions">
          <Button
            aria-label="Projects"
            icon={<FolderOpen size={16} />}
            onClick={() => void openProjects()}
          >
            <span>Projects</span>
          </Button>
          <Button
            aria-label={user ? 'Cloud save' : 'Sign in'}
            className="cloud-button"
            icon={<Cloud size={16} />}
            onClick={() => setDialog('cloud')}
          >
            <span>{user ? 'Cloud save' : 'Sign in'}</span>
          </Button>
          <Button
            variant="primary"
            icon={<ArrowUpRight size={16} />}
            onClick={() => setDialog('export')}
          >
            Export
          </Button>
        </div>
      </header>
      <div className="experiment-bar">
        <div className="row">
          <span className="lab-badge">OpenCV lab</span>
          <span className="experiment-copy">A little curiosity. A different perspective.</span>
        </div>
        <div className="row">
          <label className="examples-label" htmlFor="examples">
            Try an experiment
          </label>
          <select
            id="examples"
            aria-label="Example pipeline"
            value=""
            onChange={(e) => {
              if (e.target.value)
                void saveLocal(doc)
                  .catch(() => {})
                  .then(() =>
                    chooseDocument(
                      makeExample(e.target.value as 'edges' | 'morphology' | 'branches'),
                    ),
                  )
                  .catch((error) => useLab.getState().notify(error.message));
            }}
          >
            <option value="">Choose an example</option>
            <option value="edges">Finding the edges</option>
            <option value="morphology">Shapes from light</option>
            <option value="branches">Two ways to see</option>
          </select>
          <Button
            icon={<ImagePlus size={15} />}
            onClick={() => document.getElementById('image-input')?.click()}
          >
            Add image
          </Button>
        </div>
      </div>
    </>
  );
}
