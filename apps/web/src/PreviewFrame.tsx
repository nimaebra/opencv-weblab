import type { Ref, HTMLAttributes } from 'react';
import type { NodeResult } from '@roveran/engine';
import type { PipelineNode } from '@roveran/pipeline';
import { CanvasView } from './CanvasView';
import type { View, Size } from './viewGeometry';
export function PreviewFrame({
  node,
  slot,
  result,
  view,
  pixelated,
  checker,
  inspect,
  clip,
  stageRef,
  events,
  original,
}: {
  node?: PipelineNode;
  slot: 'A' | 'B';
  result?: NodeResult;
  view: View;
  pixelated: boolean;
  checker: boolean;
  inspect: boolean;
  clip?: number;
  stageRef?: Ref<HTMLDivElement>;
  events: HTMLAttributes<HTMLDivElement>;
  original?: Size;
}) {
  return (
    <div
      className={`preview-frame frame-${slot.toLowerCase()}`}
      style={clip === undefined ? undefined : { clipPath: `inset(0 0 0 ${clip}%)` }}
    >
      <div className="frame-heading">
        <span className="slot">{slot}</span>
        <strong>{node?.label ?? 'Choose a node'}</strong>
        <span className="frame-mode">{result?.mode.toUpperCase() ?? 'NO OUTPUT'}</span>
      </div>
      <div
        ref={stageRef}
        className="image-stage"
        data-slot={slot}
        tabIndex={0}
        role="group"
        aria-label={`Preview ${slot}: ${inspect ? 'inspect with pointer or arrow keys' : 'pan with arrow keys, zoom with plus or minus; F fits, 1 shows 100 percent'}`}
        {...events}
      >
        <CanvasView
          nodeId={node?.id ?? null}
          view={view}
          pixelated={pixelated}
          checkerboard={checker}
        />
        {!result && (
          <div className="preview-placeholder">
            {node
              ? 'Connect a valid image to see this step'
              : 'Select a node, or pin an output here.'}
          </div>
        )}
      </div>
      <div className="frame-caption">
        <span>
          {result ? (
            <>
              {result.width} × {result.height} preview px
              {original && (
                <small>
                  Original: {original.width} × {original.height}
                </small>
              )}
            </>
          ) : (
            'Awaiting input'
          )}
        </span>
        <span>
          {slot === 'A' ? 'Input / reference' : `${result?.elapsed.toFixed(1) ?? '—'} ms`}
        </span>
      </div>
    </div>
  );
}
