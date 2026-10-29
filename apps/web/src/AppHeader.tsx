import {
  ArrowUpRight,
  FolderOpen,
  Undo2,
  Redo2,
  Check,
  Pencil,
  ImagePlus,
  FlaskConical,
} from 'lucide-react';
import { Button } from '@opencv-weblab/ui';
import { makeExample, lessons, type LessonKind } from '@opencv-weblab/pipeline';
import { useLab } from './store';
import type { WorkspaceController } from './useWorkspaceController';
import { GuidedExperiment } from './GuidedExperiment';
import { useState } from 'react';

function ProjectName({ name }: { name: string }) {
  const [draft, setDraft] = useState({ model: name, text: name });
  const text = draft.model === name ? draft.text : name;
  function rename(next: string) {
    if (next !== useLab.getState().document.name)
      useLab.getState().edit((doc) => ({ ...doc, name: next }), true, 'title');
  }
  return (
    <input
      aria-label="Project name"
      title="Rename experiment"
      maxLength={100}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        const model = next.trim() ? next : name;
        setDraft({ model, text: next });
        if (next.trim()) rename(next);
      }}
      onBlur={() => {
        const next = text.trim() || 'Untitled experiment';
        setDraft({ model: next, text: next });
        rename(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

export function AppHeader({ controller }: { controller: WorkspaceController }) {
  const { doc, past, future, saveStatus, setDialog, chooseDocument, openProjects } = controller;

  return (
    <>
      <header className="app-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="OpenCV WebLab home">
          <span className="brand-mark">
            <FlaskConical size={21} />
          </span>
          OpenCV WebLab
          <span className="brand-divider" />
        </a>
        <div className="project-title">
          <ProjectName key={doc.id} name={doc.name} />
          <Pencil size={12} aria-hidden="true" />
          <span
            className="save-indicator"
            role="status"
            title={
              {
                saved: 'Saved on this device',
                saving: 'Saving locally',
                temporary: 'Temporary session — download a backup',
                failed: 'Save failed — download a backup',
              }[saveStatus]
            }
          >
            <span className="sr-only">
              {
                {
                  saved: 'Saved on this device',
                  saving: 'Saving locally',
                  temporary: 'Temporary session — download a backup',
                  failed: 'Save failed — download a backup',
                }[saveStatus]
              }
            </span>
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
      <GuidedExperiment doc={doc} />
    </>
  );
}
