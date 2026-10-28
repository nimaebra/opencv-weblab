import { ImagePlus } from 'lucide-react';
import { registry, type PipelineNode } from '@roveran/pipeline';
import { Button } from '@roveran/ui';
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
          <select
            aria-label="Image source"
            value={node.sourceId ?? ''}
            onChange={(e) =>
              useLab.getState().update(node.id, { sourceId: e.target.value || undefined })
            }
          >
            <option value="">Choose an image</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          icon={<ImagePlus size={15} />}
          onClick={() =>
            window.dispatchEvent(new CustomEvent('roveran-reconnect', { detail: node.id }))
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
            <select
              id={`parameter-${parameter.key}`}
              value={node.parameters[parameter.key]}
              onChange={(e) => updateParameter(node.id, parameter.key, e.target.value)}
            >
              {parameter.options.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll('-', ' ')}
                </option>
              ))}
            </select>
            <p>{parameter.description}</p>
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
