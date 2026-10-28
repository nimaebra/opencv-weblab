import {
  ArrowUpRight,
  FolderOpen,
  Undo2,
  Redo2,
  Check,
  ChevronDown,
  ImagePlus,
  FlaskConical,
} from 'lucide-react';
import { Button } from '@roveran/ui';
import { makeExample, lessons, type LessonKind } from '@roveran/pipeline';
import { useLab } from './store';
import type { WorkspaceController } from './useWorkspaceController';
export function AppHeader({ controller }: { controller: WorkspaceController }) {
  const { doc, past, future, saveStatus, setDialog, chooseDocument, openProjects } = controller;

  const lesson = lessons.find((lesson) => lesson.title === doc.name);
  return (
    <>
      <header className="app-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Roveran home">
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
            title={
              {
                saved: 'Saved on this device',
                saving: 'Saving locally',
                temporary: 'Temporary session — download a backup',
                failed: 'Save failed — download a backup',
              }[saveStatus]
            }
          >
            {saveStatus === 'saved' ? (
              <Check size={12} />
            ) : (
              <span className={`saving-dot ${saveStatus}`} />
            )}
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
          <span className="experiment-copy">Explore images. Understand each step.</span>
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
                void chooseDocument(makeExample(e.target.value as LessonKind)).catch((error) =>
                  useLab.getState().notify(error.message),
                );
            }}
          >
            <option value="">Choose an example</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title}
              </option>
            ))}
          </select>
          <Button
            icon={<ImagePlus size={15} />}
            onClick={() => document.getElementById('image-input')?.click()}
          >
            Add image
          </Button>
        </div>
      </div>
      {lesson && (
        <details className="lesson-guide">
          <summary>{lesson.objective}</summary>
          <ol>
            {lesson.experiments.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
