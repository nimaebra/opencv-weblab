import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { execute, executeResult } from '../packages/engine/src/operations';
import { measurementsCsv } from '../packages/engine/src/measurements';
import {
  operations,
  emptyDocument,
  newNode,
  connect,
  generatePython,
  topologicalOrder,
  type PipelineDocument,
} from '../packages/pipeline/src/index';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { cv } = await waitForOpenCv(
  createRequire(import.meta.url)(join(root, 'apps/web/public/runtime/opencv.js')),
);
const folder = await mkdtemp(join(tmpdir(), 'opencv-weblab-parity-'));
const python = process.env.OPENCV_WEBLAB_PYTHON ?? 'python3';
const testCases: any[] = [];
const rgba = cv.Mat.zeros(24, 32, cv.CV_8UC4);
for (let y = 0; y < 24; y++)
  for (let x = 0; x < 32; x++)
    for (let c = 0; c < 4; c++)
      rgba.data[(y * 32 + x) * 4 + c] =
        c === 3 ? (x % 3 === 0 ? 80 : 255) : (x * 7 + y * 11 + c * 43) % 256;
try {
  await writeFile(join(folder, 'fixture.json'), JSON.stringify([...rgba.data]));
  for (const op of operations.filter((o) => o.id !== 'source')) {
    let doc: PipelineDocument = emptyDocument();
    doc.sources = [
      { id: 'fixture', name: 'fixture.png', mime: 'image/png', width: 32, height: 24 },
    ];
    const source = { ...newNode('source'), sourceId: 'fixture' };
    doc.nodes = [source];
    let parent = source;
    const allocated: any[] = [];
    let input = rgba;
    let sourcePixels: number[] | undefined;
    if (
      [
        'components',
        'contours',
        'filter-objects',
        'hough-lines',
        'hough-circles',
        'shi-tomasi',
        'distance-transform',
        'top-hat',
        'black-hat',
        'clahe',
      ].includes(op.id)
    ) {
      input = cv.Mat.zeros(24, 32, cv.CV_8UC4);
      allocated.push(input);
      for (let i = 3; i < input.data.length; i += 4) input.data[i] = 255;
      const rectangle = (x: number, y: number, width: number, height: number, value = 255) => {
        for (let row = y; row < y + height; row++)
          for (let col = x; col < x + width; col++)
            for (let channel = 0; channel < 3; channel++)
              input.data[(row * 32 + col) * 4 + channel] = value;
      };
      rectangle(2, 2, 7, 7);
      rectangle(14, 2, 9, 9);
      rectangle(16, 4, 5, 5, 0);
      rectangle(28, 3, 1, 1);
      rectangle(3, 16, 2, 2);
      rectangle(5, 18, 2, 2);
      if (['hough-lines', 'hough-circles', 'shi-tomasi'].includes(op.id)) {
        input.setTo(new cv.Scalar(0, 0, 0, 255));
        cv.rectangle(
          input,
          new cv.Point(2, 2),
          new cv.Point(9, 8),
          new cv.Scalar(220, 220, 220, 255),
          -1,
        );
        cv.circle(input, new cv.Point(23, 14), 6, new cv.Scalar(255, 255, 255, 255), 2, cv.LINE_8);
        cv.line(
          input,
          new cv.Point(2, 20),
          new cv.Point(14, 20),
          new cv.Scalar(255, 255, 255, 255),
          1,
          cv.LINE_8,
        );
      }
      sourcePixels = [...input.data];
    }
    if (op.accepts === 'gray') {
      parent = newNode('grayscale');
      doc.nodes.push(parent);
      doc = connect(doc, source.id, parent.id);
      input = execute(cv, parent, [input]);
      allocated.push(input);
    }
    const node = newNode(op.id);
    if (op.id === 'hough-lines') node.parameters = { votes: 8, minLength: 8, maxGap: 2 };
    if (op.id === 'hough-circles')
      node.parameters = {
        minDistance: 10,
        edgeThreshold: 100,
        accumulator: 8,
        minRadius: 3,
        maxRadius: 8,
      };
    if (op.id === 'crop') node.parameters = { left: 10.5, top: 12.5, right: 83.3, bottom: 87.5 };
    if (op.id === 'perspective')
      node.parameters = {
        tlX: 10,
        tlY: 10,
        trX: 90,
        trY: 5,
        brX: 95,
        brY: 90,
        blX: 5,
        blY: 95,
        width: 28,
        height: 20,
        interpolation: 'linear',
      };
    if (op.id === 'components') node.parameters.connectivity = '4';
    if (op.id === 'brightness') {
      node.parameters.brightness = -25;
      node.parameters.contrast = 1.2;
    }
    if (op.id === 'hue') {
      node.parameters.hue = 31;
      node.parameters.saturation = 1.2;
    }
    if (op.id === 'gamma') node.parameters.gamma = 0.7;
    if (op.id === 'rotate') node.parameters.angle = 25;
    if (op.id === 'channel') node.parameters.channel = 'alpha';
    if (op.id === 'hsv-mask')
      node.parameters = { hMin: 170, hMax: 25, sMin: 50, sMax: 255, vMin: 30, vMax: 230 };
    if (op.id === 'sharpen') node.parameters.strength = 0.7;
    doc.nodes.push(node);
    doc = connect(doc, parent.id, node.id);
    let second = input;
    if (op.inputs === 2) {
      const inverse = newNode(op.id === 'apply-mask' ? 'grayscale' : 'invert');
      doc.nodes.push(inverse);
      doc = connect(doc, parent.id, inverse.id);
      doc = connect(doc, inverse.id, node.id, 1);
      second = execute(cv, inverse, [input]);
      allocated.push(second);
    }
    doc.preview.b = node.id;
    const result = executeResult(cv, node, [input, second]);
    const output = result.mat;
    allocated.push(output);
    if (
      ['hough-lines', 'hough-circles', 'shi-tomasi'].includes(op.id) &&
      !Array.from(
        { length: output.rows * output.cols },
        (_, i) =>
          output.data[i * 4] === 0 &&
          output.data[i * 4 + 1] === 255 &&
          output.data[i * 4 + 2] === 0,
      ).some(Boolean)
    )
      throw new Error(`${op.id} parity fixture must contain a nonempty detection`);
    await writeFile(join(folder, `${op.id}.py`), generatePython(doc));
    testCases.push({
      id: op.id,
      sourcePixels,
      width: output.cols,
      height: output.rows,
      channels: output.channels(),
      pixels: [...output.data],
      csv: result.measurements ? measurementsCsv(result.measurements) : undefined,
      csvFile: result.measurements
        ? `measurements_${topologicalOrder(doc).findIndex((n) => n.id === node.id)}.csv`
        : undefined,
    });
    for (const mat of allocated) mat.delete();
  }
  await writeFile(join(folder, 'expected.json'), JSON.stringify(testCases));
  const result = spawnSync(python, [join(root, 'tests/python-parity.py'), folder], {
    cwd: folder,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exitCode = 1;
  const report = await readFile(join(folder, 'report.json'), 'utf8').catch(() => null);
  if (report) await writeFile(join(root, 'tests/parity-report.json'), report);
} finally {
  rgba.delete();
  await rm(folder, { recursive: true, force: true });
}
