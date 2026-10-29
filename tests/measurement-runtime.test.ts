import { it, expect, vi } from 'vitest';
it('owns full-result frames, closes stale replies and releases snapshots on invalidation', async () => {
  vi.stubGlobal('window', new EventTarget());
  try {
    const { handleMeasurementMessage, useMeasurements, measurementFrames, closeMeasurements } =
      await import('../apps/web/src/measurementRuntime');
    const measurements = { kind: 'components' as const, width: 1, height: 1, rows: [] };
    const first = { close: vi.fn() } as unknown as ImageBitmap;
    useMeasurements.setState({ nodeId: 'target' });
    expect(
      handleMeasurementMessage({
        type: 'measured',
        revision: 0,
        requestId: 0,
        nodeId: 'target',
        measurements,
        bitmap: first,
      }),
    ).toBe(true);
    expect(measurementFrames.get('target')).toBe(first);
    expect(useMeasurements.getState().status).toBe('ready');
    closeMeasurements();
    expect(first.close).toHaveBeenCalledOnce();
    expect(measurementFrames.get('target')).toBeUndefined();
    expect(useMeasurements.getState().result).toBeNull();
    const stale = { close: vi.fn() } as unknown as ImageBitmap;
    handleMeasurementMessage({
      type: 'measured',
      revision: 0,
      requestId: 0,
      nodeId: 'target',
      measurements,
      bitmap: stale,
    });
    expect(stale.close).toHaveBeenCalledOnce();
    expect(useMeasurements.getState().status).toBe('idle');
  } finally {
    vi.unstubAllGlobals();
  }
});
