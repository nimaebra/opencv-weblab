import type { useRuntime } from './runtime';
type Runtime = ReturnType<typeof useRuntime.getState>;
export function OutputAnalysis({
  inspect,
  histogram,
  shownPixel,
  analysis,
  nodeId,
  revision,
  mode,
}: {
  inspect: boolean;
  histogram: boolean;
  shownPixel: Runtime['pixel'];
  analysis: Runtime['analysis'];
  nodeId?: string;
  revision: number;
  mode?: string;
}) {
  return (
    <>
      {inspect && (
        <div className="pixel-readout" aria-live="polite">
          {shownPixel ? (
            <>
              <code>
                x {shownPixel.x} · y {shownPixel.y}
              </code>
              <code>
                {shownPixel.values.length === 1 ? 'GRAY' : 'RGBA'} {shownPixel.values.join(' / ')}
              </code>
            </>
          ) : (
            <span>
              Point at output B, or focus it and use arrow keys. Values describe displayed preview
              pixels.
            </span>
          )}
        </div>
      )}
      {histogram && (
        <div className="histogram">
          <div className="row">
            <strong>Output B histogram</strong>
            <span>
              {mode === 'gray' ? 'Grayscale' : 'Red · Green · Blue · Alpha'} · displayed preview
            </span>
          </div>
          {analysis && analysis.nodeId === nodeId && analysis.revision === revision ? (
            <svg
              viewBox="0 0 256 64"
              role="img"
              aria-label="Output B pixel intensity histogram"
              preserveAspectRatio="none"
            >
              {analysis.histograms.map((bins, index) => {
                const max = Math.max(1, ...bins);
                return (
                  <polyline
                    key={index}
                    fill="none"
                    stroke={
                      mode === 'gray'
                        ? '#809d75'
                        : ['#ce7067', '#80a56c', '#719dc4', '#c5c5b7'][index]
                    }
                    strokeDasharray={index === 3 ? '3 2' : undefined}
                    strokeWidth="1"
                    points={bins.map((value, x) => `${x},${62 - (value / max) * 60}`).join(' ')}
                  />
                );
              })}
            </svg>
          ) : (
            <p className="empty-small">
              {mode ? 'Analyzing preview…' : 'Choose a valid output for B.'}
            </p>
          )}
          <div className="histogram-axis">
            <span>0 · dark</span>
            <span>255 · light</span>
          </div>
        </div>
      )}
    </>
  );
}
