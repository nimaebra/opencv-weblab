import { newNode } from '@roveran/pipeline';
import { putAsset } from './persistence';
import { useLab } from './store';
export async function addColorChart() {
  try {
    const response = await fetch('/samples/calibration.png');
    if (!response.ok) throw new Error('The sample could not load.');
    const blob = await response.blob();
    const id = crypto.randomUUID();
    await putAsset(id, blob);
    const node = {
      ...newNode('source', 0, useLab.getState().document.sources.length * 210),
      sourceId: id,
      label: 'Color chart',
    };
    useLab.getState().edit((doc) => ({
      ...doc,
      sources: [
        ...doc.sources,
        {
          id,
          name: 'Color chart.png',
          mime: 'image/png',
          width: 1024,
          height: 768,
          builtin: '/samples/calibration.png',
        },
      ],
      nodes: [...doc.nodes, node],
      preview: { ...doc.preview, b: node.id },
    }));
    useLab.getState().select(node.id);
  } catch (error) {
    useLab.getState().notify((error as Error).message);
  }
}
