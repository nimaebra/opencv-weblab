import { memo, useState } from 'react';
import type { Parameter } from '@opencv-weblab/pipeline';
import { Range } from '@opencv-weblab/ui';
import { updateParameter } from './store';
export const NumberParameter = memo(function NumberParameter({
  nodeId,
  parameter,
  value,
}: {
  nodeId: string;
  parameter: Parameter;
  value: number;
}) {
  const [draft, setDraft] = useState({ model: value, text: String(value) });
  const [feedback, setFeedback] = useState('');
  const helpId = `parameter-${parameter.key}-help`;
  const text = draft.model === value ? draft.text : String(value);
  function apply(next: number) {
    setFeedback('');
    if (!updateParameter(nodeId, parameter.key, next)) {
      setDraft({ model: value, text: String(value) });
      return false;
    }
    setDraft({ model: next, text: String(next) });
    return true;
  }
  function commit() {
    let next = Number(text);
    if (!Number.isFinite(next) || text === '') next = value;
    next = Math.max(parameter.min!, Math.min(parameter.max!, next));
    if (parameter.odd) next = Math.max(parameter.min!, Math.round((next - 1) / 2) * 2 + 1);
    else if (parameter.step === 1) next = Math.round(next);
    if (apply(next) && String(next) !== text) {
      setFeedback(
        `Adjusted to ${next}. ${parameter.odd ? 'Use an odd number' : 'Choose a value'} between ${parameter.min} and ${parameter.max}.`,
      );
    }
  }
  function type(text: string) {
    setFeedback('');
    setDraft({ model: value, text });
    const next = Number(text);
    if (
      text !== '' &&
      Number.isFinite(next) &&
      next >= parameter.min! &&
      next <= parameter.max! &&
      (!parameter.odd || next % 2 === 1) &&
      (parameter.step !== 1 || Number.isInteger(next))
    )
      updateParameter(nodeId, parameter.key, next);
  }
  return (
    <div className="parameter">
      <label htmlFor={`parameter-${parameter.key}`}>
        {parameter.label}
        <input
          id={`parameter-${parameter.key}`}
          aria-label={`${parameter.label} value`}
          aria-describedby={`${helpId} parameter-${parameter.key}-feedback`}
          type="number"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={text}
          onChange={(e) => type(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      </label>
      <Range
        label={parameter.label}
        value={value}
        min={parameter.min!}
        max={parameter.max!}
        step={parameter.step}
        onChange={apply}
        describedBy={helpId}
      />
      <p id={helpId}>
        {parameter.description}{' '}
        <span className="parameter-limits">
          {parameter.odd ? 'Odd values' : 'Range'}: {parameter.min}–{parameter.max}.
        </span>
      </p>
      <p id={`parameter-${parameter.key}-feedback`} className="parameter-feedback" role="status">
        {feedback}
      </p>
    </div>
  );
});
