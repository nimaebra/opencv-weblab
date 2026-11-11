import { ImagePlus } from 'lucide-react';
import { registry, type PipelineNode } from '@opencv-weblab/pipeline';
import { Button, Select } from '@opencv-weblab/ui';
import { useLab, updateParameter } from './store';
import { NumberParameter } from './NumberParameter';
export function OperationControls({ node }: { node: PipelineNode }) {
  const sources = useLab((s) => s.document.sources);
  const def = registry[node.operation]!;
  if (node.operation === 'source')
    return (
      <>
        <label className="field">
          Image source
          <Select
            aria-label="Image source"
            value={node.sourceId ?? ''}
            placeholder="Choose an image"
            options={[
              { value: '', label: 'Choose an image' },
              ...sources.map((source) => ({ value: source.id, label: source.name })),
            ]}
            onValueChange={(value) =>
              useLab.getState().update(node.id, { sourceId: value || undefined })
            }
          />
        </label>
        <Button
          icon={<ImagePlus size={15} />}
          onClick={() =>
            window.dispatchEvent(new CustomEvent('opencv-weblab-reconnect', { detail: node.id }))
          }
        >
          Reconnect image
        </Button>
      </>
    );
  if (!def.parameters.length)
    return <p className="no-parameters">This operation has no adjustable parameters.</p>;
  return (
    <div className="parameters">
      {def.parameters.map((parameter) =>
        parameter.options ? (
          <div className="parameter" key={parameter.key}>
            <label htmlFor={`parameter-${parameter.key}`}>{parameter.label}</label>
            <Select
              id={`parameter-${parameter.key}`}
              aria-describedby={`parameter-${parameter.key}-help`}
              value={String(node.parameters[parameter.key])}
              options={parameter.options.map((option) => ({
                value: option,
                label: option.replaceAll('-', ' '),
              }))}
              onValueChange={(value) => updateParameter(node.id, parameter.key, value)}
            />
            <p id={`parameter-${parameter.key}-help`}>{parameter.description}</p>
          </div>
        ) : (
          <NumberParameter
            key={`${node.id}:${parameter.key}`}
            nodeId={node.id}
            parameter={parameter}
            value={Number(node.parameters[parameter.key])}
          />
        ),
      )}
    </div>
  );
}
