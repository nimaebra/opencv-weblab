import type { Ref, HTMLAttributes } from 'react';
import type { NodeResult, Bounds } from '@opencv-weblab/engine';
import type { PipelineNode } from '@opencv-weblab/pipeline';
import { CanvasView } from './CanvasView';
import type { useRuntime } from './runtime';
import type { View, Size } from './viewGeometry';

type RuntimeStatus = ReturnType<typeof useRuntime.getState>['status'];

function emptyPreview(node: PipelineNode | undefined, status: RuntimeStatus, error?: string) {
  if (!node) return ['Pin a node here from the inspector.', 'No node pinned'];
  switch (status) {
    case 'loading':
      return ['Loading the image engine…', 'Preview pending'];
    case 'processing':
      return ['Rendering this step…', 'Preview pending'];
    case 'error':
      return error
        ? [error, 'No output']
        : ['Restart the image engine to continue.', 'Engine unavailable'];
    default:
      return [error ?? 'Connect a valid image to see this step.', 'No output'];
  }
}

export function PreviewFrame({
  node,
  slot,
  result,
  status,
  error,
  view,
  pixelated,
  checker,
  inspect,
  clip,
  stageRef,
  events,
  original,
  highlight,
  bounds,
}: {
  node?: PipelineNode;
  slot: 'A' | 'B';
  result?: NodeResult;
  status: RuntimeStatus;
  error?: string;
  view: View;
  pixelated: boolean;
  checker: boolean;
  inspect: boolean;
  clip?: number;
  stageRef?: Ref<HTMLDivElement>;
  events: HTMLAttributes<HTMLDivElement>;
  original?: Size;
  highlight?: { x: number; y: number; radius: number };
  bounds?: Bounds;
}) {
  const [placeholder, emptyCaption] = emptyPreview(node, status, error);
  return (
    <div
      className={`preview-frame frame-${slot.toLowerCase()}`}
      style={clip === undefined ? undefined : { clipPath: `inset(0 0 0 ${clip}%)` }}
    >
      <div className="frame-heading">
        <span className="slot">{slot}</span>
        <strong title={node?.label}>{node?.label ?? 'Choose a node'}</strong>
        <span className="frame-mode">{result?.mode.toUpperCase()}</span>
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
          highlight={highlight}
          bounds={bounds}
        />
        {!result && <div className="preview-placeholder">{placeholder}</div>}
      </div>
      <div className="frame-caption">
        <span>
          {result ? (
            <>
              {result.width} × {result.height} px
              {original &&
                (original.width !== result.width || original.height !== result.height) && (
                  <small>
                    Original: {original.width} × {original.height}
                  </small>
                )}
            </>
          ) : (
            emptyCaption
          )}
        </span>
        <span>
          {slot === 'A' ? 'Reference' : result ? `${result.elapsed.toFixed(1)} ms` : null}
        </span>
      </div>
    </div>
  );
}
