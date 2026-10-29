import { usePreviewMeasurements, FullMeasurements } from './Measurements';
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewFrame } from './PreviewFrame';
import { OutputAnalysis } from './OutputAnalysis';
import { PixelExplanation } from './PixelExplanation';
import { usePreviewController } from './usePreviewController';
import { ViewerOptions, PreviewFooter } from './ViewerOptions';
export function Preview() {
  const controller = usePreviewController();
  const {
    doc,
    status,
    revision,
    analysis,
    view,
    setMode,
    wipe,
    setWipe,
    expanded,
    setExpanded,
    pixelated,
    checker,
    inspect,
    explain,
    inputHighlight,
    outputHighlight,
    histogram,
    container,
    stageB,
    a,
    b,
    ra,
    rb,
    same,
    wiping,
    originalSizes,
    shownPixel,
    stageHandlers,
  } = controller;

  const measurements = usePreviewMeasurements(doc, rb?.measurements, revision, status === 'ready');
  return (
    <>
      <section
        id="image-comparison"
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded ? true : undefined}
        className={`preview-section ${expanded ? 'preview-expanded' : ''}`}
        aria-label="Image comparison"
      >
        <PreviewToolbar
          same={same}
          wiping={wiping}
          expanded={expanded}
          canExport={status === 'ready' && !!rb}
          onCompareChange={setMode}
          onExpand={() => setExpanded(!expanded)}
        />
        <ViewerOptions controller={controller} />
        <div
          ref={container}
          className={`preview-images ${wiping ? 'wipe' : ''} ${checker ? 'checkerboard' : ''} ${inspect ? 'inspecting' : ''}`}
        >
          <PreviewFrame
            node={a}
            slot="A"
            result={ra}
            view={view}
            pixelated={pixelated}
            checker={checker}
            inspect={inspect}
            events={stageHandlers('A', ra)}
            original={a ? originalSizes.get(a.id) : undefined}
            highlight={inputHighlight}
          />
          <PreviewFrame
            node={b}
            slot="B"
            result={rb}
            view={view}
            pixelated={pixelated}
            checker={checker}
            inspect={inspect}
            events={stageHandlers('B', rb)}
            original={b ? originalSizes.get(b.id) : undefined}
            stageRef={stageB}
            clip={wiping ? wipe : undefined}
            highlight={outputHighlight}
            bounds={measurements.bounds}
          />
          {wiping && (
            <>
              <div className="wipe-line" style={{ left: `${wipe}%` }} />
              <input
                className="wipe-slider"
                type="range"
                aria-label="Comparison wipe position"
                min={0}
                max={100}
                value={wipe}
                onChange={(e) => setWipe(Number(e.target.value))}
              />
            </>
          )}
        </div>
        <PreviewFooter controller={controller} />
        <OutputAnalysis
          inspect={inspect}
          histogram={histogram}
          shownPixel={shownPixel}
          analysis={analysis}
          nodeId={b?.id}
          revision={revision}
          mode={rb?.mode}
        />
        {measurements.panel}
        {explain && <PixelExplanation doc={doc} point={shownPixel} />}
      </section>
      <FullMeasurements doc={doc} />
    </>
  );
}
