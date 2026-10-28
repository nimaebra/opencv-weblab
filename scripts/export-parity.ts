import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { waitForOpenCv } from '../packages/engine/src/loader';
import { execute } from '../packages/engine/src/operations';
import {
  operations,
  emptyDocument,
  newNode,
  connect,
  generatePython,
  type PipelineDocument,
} from '../packages/pipeline/src/index';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { cv } = await waitForOpenCv(
  createRequire(import.meta.url)(join(root, 'apps/web/public/runtime/opencv.js')),
);
const folder = await mkdtemp(join(tmpdir(), 'roveran-parity-'));
const python = process.env.ROVERAN_PYTHON ?? 'python3';
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
    if (op.accepts === 'gray') {
      parent = newNode('grayscale');
      doc.nodes.push(parent);
      doc = connect(doc, source.id, parent.id);
      input = execute(cv, parent, [rgba]);
      allocated.push(input);
    }
    const node = newNode(op.id);
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
      const inverse = newNode('invert');
      doc.nodes.push(inverse);
      doc = connect(doc, parent.id, inverse.id);
      doc = connect(doc, inverse.id, node.id, 1);
      second = execute(cv, inverse, [input]);
      allocated.push(second);
    }
    doc.preview.b = node.id;
    const output = execute(cv, node, [input, second]);
    allocated.push(output);
    await writeFile(join(folder, `${op.id}.py`), generatePython(doc));
    testCases.push({
      id: op.id,
      width: output.cols,
      height: output.rows,
      channels: output.channels(),
      pixels: [...output.data],
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
