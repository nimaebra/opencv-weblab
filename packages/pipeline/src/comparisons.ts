import { registry, parameterSchema } from './registry';
import type { PipelineNode } from './index';
export function comparisonValues(node: PipelineNode, key: string): number[] {
  const parameter = registry[node.operation]?.parameters.find((p) => p.key === key && !p.options);
  if (!parameter) return [];
  const min = parameter.min ?? 0,
    max = parameter.max ?? 100,
    step = parameter.step ?? 1;
  const quantize = (n: number) =>
    Number(Math.max(min, Math.min(max, min + Math.round((n - min) / step) * step)).toFixed(6));
  const preferred = key === 'kernel' ? [3, 7, 15] : [min, Number(node.parameters[key]), max];
  const candidates = [
    ...preferred,
    ...Array.from({ length: 33 }, (_, i) => min + ((max - min) * i) / 32),
  ].map(quantize);
  const valid = [...new Set(candidates)].filter(
    (value) =>
      parameterSchema(node.operation).safeParse({ ...node.parameters, [key]: value }).success,
  );
  return valid.slice(0, 3).sort((a, b) => a - b);
}
