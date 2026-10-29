/// <reference lib="webworker" />
import { OPENCV_VERSION, parseDocument } from '@roveran/pipeline';
import { Evaluator } from './evaluator';
import { waitForOpenCv } from './loader';
import type { WorkerRequest, WorkerResponse } from './index';
import { explainPixel } from './learning';
import { compareVariants } from './comparison';
import type { CV } from './operations';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let evaluator: Evaluator | undefined;
let loading: Promise<void> | undefined;
let revision = 0;
let pending: Extract<WorkerRequest, { type: 'evaluate' }> | undefined;
let running = false;
let cv: CV;
let studyGeneration = 0;
let measurementGeneration = 0;
let analysis:
  | { revision: number; requestId: number; nodeId: string; pixels: ImageData; gray: boolean }
  | undefined;
function send(message: WorkerResponse, transfers: Transferable[] = []) {
  scope.postMessage(message, transfers);
}
async function init() {
  if (loading) return loading;
  loading = (async () => {
    scope.importScripts(new URL('runtime/opencv.js', scope.location.href).href);
    ({ cv } = await waitForOpenCv((scope as any).cv));
    if (!cv?.Mat) throw new Error('OpenCV could not initialize.');
    evaluator = new Evaluator(cv);
    send({ type: 'ready', version: OPENCV_VERSION });
  })();
  return loading;
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending) {
      const request = pending;
      pending = undefined;
      const output = await evaluator!.evaluate(
        parseDocument(request.document),
        () => revision !== request.revision,
      );
      if (output && revision === request.revision)
        send(
          {
            type: 'result',
            revision: request.revision,
            nodes: output.nodes,
            errors: output.errors,
            stats: output.stats,
            frames: output.frames,
          },
          output.frames.map((f) => f.bitmap),
        );
      else if (output) for (const f of output.frames) f.bitmap.close();
    }
  } catch (error) {
    send({
      type: 'error',
      revision,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
    if (pending) void drain();
  }
}
scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'cancel-measure') {
      measurementGeneration++;
      return;
    }
    if (message.type === 'measure') {
      const generation = ++measurementGeneration;
      try {
        await init();
        while (running && generation === measurementGeneration && revision === message.revision)
          await new Promise((resolve) => setTimeout(resolve, 5));
        if (generation !== measurementGeneration || revision !== message.revision) return;
        running = true;
        try {
          const doc = parseDocument(message.document);
          const node = doc.nodes.find((n) => n.id === message.nodeId);
          if (!node?.enabled || !['components', 'contours'].includes(node.operation))
            throw new Error('Choose an enabled object-analysis node.');
          const output = await evaluator!.evaluate(
            doc,
            () => generation !== measurementGeneration || revision !== message.revision,
            true,
            message.nodeId,
            true,
          );
          if (!output) return;
          const result = output.nodes.find((n) => n.nodeId === message.nodeId);
          const frame = output.frames.find((f) => f.nodeId === message.nodeId);
          if (generation !== measurementGeneration || revision !== message.revision) {
            for (const f of output.frames) f.bitmap.close();
          } else if (result?.measurements && frame) {
            send(
              {
                type: 'measured',
                revision: message.revision,
                requestId: message.requestId,
                nodeId: message.nodeId,
                measurements: result.measurements,
                bitmap: frame.bitmap,
              },
              [frame.bitmap],
            );
          } else {
            for (const f of output.frames) f.bitmap.close();
            throw new Error(output.errors[message.nodeId] ?? 'No measurements are available.');
          }
        } finally {
          running = false;
          if (pending) void drain();
        }
      } catch (error) {
        if (generation === measurementGeneration)
          send({
            type: 'measure-error',
            revision: message.revision,
            requestId: message.requestId,
            nodeId: message.nodeId,
            message: error instanceof Error ? error.message : String(error),
          });
      }
      return;
    }
    if (message.type === 'cancel-study') {
      studyGeneration++;
      return;
    }
    if (message.type === 'explain') {
      try {
        if (
          !analysis ||
          !analysis.gray ||
          analysis.requestId !== message.analysisId ||
          analysis.revision !== message.revision ||
          analysis.nodeId !== message.node.id
        )
          return;
        if (
          !Number.isInteger(message.x) ||
          !Number.isInteger(message.y) ||
          message.x < 0 ||
          message.y < 0 ||
          message.x >= analysis.pixels.width ||
          message.y >= analysis.pixels.height
        )
          return;
        if (message.bitmap.width > 7 || message.bitmap.height > 7)
          throw new Error('Pixel neighborhood is too large.');
        const canvas = new OffscreenCanvas(message.bitmap.width, message.bitmap.height),
          ctx = canvas.getContext('2d')!;
        ctx.drawImage(message.bitmap, 0, 0);
        const patch = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const explanation = explainPixel(
          cv,
          message.node,
          message.scale,
          message.x,
          message.y,
          { width: message.width, height: message.height },
          { data: patch.data, width: patch.width, left: message.left, top: message.top },
          analysis.pixels.data[(message.y * analysis.pixels.width + message.x) * 4]!,
        );
        send({
          type: 'explanation',
          revision: message.revision,
          requestId: message.requestId,
          explanation,
        });
      } catch (error) {
        send({
          type: 'study-error',
          kind: 'explain',
          revision: message.revision,
          requestId: message.requestId,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        message.bitmap.close();
      }
      return;
    }
    if (message.type === 'compare') {
      const generation = ++studyGeneration;
      try {
        await init();
        const output = await compareVariants(
          cv,
          message,
          () => generation !== studyGeneration || revision !== message.revision,
        );
        if (output)
          send(
            {
              type: 'comparison',
              revision: message.revision,
              requestId: message.requestId,
              nodeId: message.node.id,
              parameter: message.parameter,
              ...output,
            },
            output.frames.map((f) => f.bitmap),
          );
      } catch (error) {
        if (generation === studyGeneration)
          send({
            type: 'study-error',
            kind: 'compare',
            revision: message.revision,
            requestId: message.requestId,
            message: error instanceof Error ? error.message : String(error),
          });
      } finally {
        message.bitmap.close();
      }
      return;
    }
    if (message.type === 'clear-analysis') {
      analysis = undefined;
      return;
    }
    if (message.type === 'analyze') {
      try {
        if (message.bitmap.width * message.bitmap.height > 4096 * 4096)
          throw new Error('Analysis image is too large.');
        const canvas = new OffscreenCanvas(message.bitmap.width, message.bitmap.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(message.bitmap, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        analysis = {
          revision: message.revision,
          requestId: message.requestId,
          nodeId: message.nodeId,
          pixels,
          gray: message.mode === 'gray',
        };
        const histograms = Array.from({ length: analysis.gray ? 1 : 4 }, () =>
          Array<number>(256).fill(0),
        );
        for (let i = 0; i < pixels.data.length; i += 4)
          for (let channel = 0; channel < histograms.length; channel++)
            histograms[channel]![pixels.data[i + channel]!]!++;
        send({
          type: 'analysis',
          revision: message.revision,
          requestId: message.requestId,
          nodeId: message.nodeId,
          histograms,
        });
      } finally {
        message.bitmap.close();
      }
      return;
    }
    if (message.type === 'sample') {
      if (
        !analysis ||
        analysis.requestId !== message.analysisId ||
        analysis.revision !== message.revision ||
        analysis.nodeId !== message.nodeId
      )
        return;
      const { pixels } = analysis,
        x = Math.floor(message.x),
        y = Math.floor(message.y);
      if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return;
      const offset = (y * pixels.width + x) * 4;
      send({
        type: 'pixel',
        revision: message.revision,
        requestId: message.requestId,
        nodeId: message.nodeId,
        x,
        y,
        values: Array.from(pixels.data.slice(offset, offset + (analysis.gray ? 1 : 4))),
      });
      return;
    }
    if (message.type === 'dispose') {
      measurementGeneration++;
      studyGeneration++;
      analysis = undefined;
      revision++;
      pending = undefined;
      evaluator?.dispose();
      scope.close();
      return;
    }
    await init();
    switch (message.type) {
      case 'init':
        break;
      case 'sources':
        measurementGeneration++;
        studyGeneration++;
        revision++;
        evaluator!.setSources(message.sources);
        break;
      case 'evaluate':
        measurementGeneration++;
        studyGeneration++;
        revision = message.revision;
        pending = message;
        void drain();
        break;
      case 'export': {
        measurementGeneration++;
        studyGeneration++;
        revision = message.revision;
        pending = undefined;
        while (running) await new Promise((resolve) => setTimeout(resolve, 5));
        running = true;
        try {
          const output = await evaluator!.evaluate(
            parseDocument(message.document),
            () => revision !== message.revision,
            true,
            message.target,
          );
          if (output?.blob)
            send({ type: 'exported', revision: message.revision, blob: output.blob });
          else
            send({
              type: 'error',
              revision: message.revision,
              message: output ? Object.values(output.errors).join(' ') : 'Export superseded.',
            });
        } finally {
          running = false;
          if (pending) void drain();
        }
        break;
      }
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
