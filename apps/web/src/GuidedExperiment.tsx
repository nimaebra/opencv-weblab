import { useEffect, useRef, useState } from 'react';
import { BookOpen, Lightbulb, Check, ChevronDown } from 'lucide-react';
import {
  lessons,
  lessonGuidance,
  type LessonKind,
  type PipelineDocument,
} from '@opencv-weblab/pipeline';
import { Button } from '@opencv-weblab/ui';
import { readLearningProgress, writeLearningProgress } from './persistence';
type Progress = { version: 1; prediction: string; reflection: string; completed: number[] };
const empty = (): Progress => ({ version: 1, prediction: '', reflection: '', completed: [] });
const stages = ['Predict', 'Try', 'Compare', 'Reflect'];
function parseProgress(value: unknown): Progress {
  const p = value as Partial<Progress> | undefined;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.prediction !== 'string' ||
    typeof p.reflection !== 'string' ||
    !Array.isArray(p.completed) ||
    !p.completed.every((n) => Number.isInteger(n) && n >= 0 && n < 4)
  )
    return empty();
  return {
    version: 1,
    prediction: p.prediction.slice(0, 2000),
    reflection: p.reflection.slice(0, 2000),
    completed: [...new Set(p.completed)],
  };
}
export function GuidedExperiment({ doc }: { doc: PipelineDocument }) {
  const lesson = lessons.find((l) => (doc.lessonId ? l.id === doc.lessonId : l.title === doc.name));
  return lesson ? (
    <Guide key={`${doc.id}:${lesson.id}`} projectId={doc.id} lessonId={lesson.id} />
  ) : null;
}
function Guide({ projectId, lessonId }: { projectId: string; lessonId: LessonKind }) {
  const lesson = lessons.find((l) => l.id === lessonId)!,
    guidance = lessonGuidance(lessonId);
  const [progress, setProgress] = useState<Progress>(empty),
    [step, setStep] = useState(0);
  const [save, setSave] = useState('Progress stays on this device');
  const edited = useRef(false),
    writeSequence = useRef(0);
  const storageKey = `${projectId}:${lessonId}`;
  useEffect(() => {
    let active = true;
    void readLearningProgress(storageKey)
      .then((data) => {
        if (active && !edited.current) setProgress(parseProgress(data));
      })
      .catch(() => {
        if (active) setSave('Progress is temporary in this session');
      });
    return () => {
      active = false;
      writeSequence.current++;
    };
  }, [storageKey]);
  function change(next: Progress) {
    edited.current = true;
    setProgress(next);
    const sequence = ++writeSequence.current;
    setSave('Saving progress…');
    void writeLearningProgress(storageKey, next)
      .then(() => {
        if (sequence === writeSequence.current) setSave('Progress saved on this device');
      })
      .catch(() => {
        if (sequence === writeSequence.current) setSave('Progress is temporary in this session');
      });
  }
  return (
    <details className="guided-experiment">
      <summary>
        <ChevronDown className="guide-chevron" size={14} />
        <BookOpen size={15} />
        <span>Guided experiment: {lesson.title}</span>
        <span className="guide-count">{progress.completed.length}/4 explored</span>
      </summary>
      <div className="guide-content">
        <nav aria-label="Experiment stages">
          {stages.map((stage, index) => (
            <Button
              key={stage}
              aria-pressed={step === index}
              onClick={() => setStep(index)}
              icon={progress.completed.includes(index) ? <Check size={13} /> : undefined}
            >
              {index + 1}. {stage}
            </Button>
          ))}
        </nav>
        <section aria-label={`${stages[step]} activity`}>
          <p className="guide-objective">{lesson.objective}</p>
          {step === 0 && (
            <label className="field">
              {guidance.prediction}
              <textarea
                aria-label="Your prediction"
                placeholder="Write a prediction, or think it through before trying."
                maxLength={2000}
                value={progress.prediction}
                onChange={(e) => change({ ...progress, prediction: e.target.value })}
              />
            </label>
          )}
          {step === 1 && (
            <ol>
              {lesson.experiments.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ol>
          )}
          {step === 2 && <p>{guidance.compare}</p>}
          {step === 3 && (
            <label className="field">
              {guidance.reflect}
              <textarea
                aria-label="Your reflection"
                placeholder="Describe what you observed and the evidence for it."
                maxLength={2000}
                value={progress.reflection}
                onChange={(e) => change({ ...progress, reflection: e.target.value })}
              />
            </label>
          )}
          <details className="guide-hint">
            <summary>
              <Lightbulb size={13} /> Show a hint
            </summary>
            <p>{guidance.hint}</p>
          </details>
          <div className="guide-footer">
            <Button
              onClick={() => {
                change({ ...progress, completed: [...new Set([...progress.completed, step])] });
                if (step < 3) setStep(step + 1);
              }}
            >
              {progress.completed.includes(step) ? 'Continue exploring' : 'I explored this step'}
            </Button>
            <span role="status">{save}</span>
          </div>
        </section>
      </div>
      <p className="guide-note">
        Optional guidance, no grades. Edit the graph freely. Notes stay in this browser; portable
        backups contain the pipeline and images.
      </p>
    </details>
  );
}
