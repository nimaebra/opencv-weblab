import type { CV } from './operations';
/** Older OpenCV builds expose a self-resolving thenable, not a native Promise.
 * Awaiting it directly loops forever. Resolve a wrapper instead of the module. */
export function waitForOpenCv(value: CV): Promise<{ cv: CV }> {
  const instance = typeof value === 'function' ? value() : value;
  return new Promise((resolve, reject) => {
    if (instance?.Mat) {
      resolve({ cv: instance });
      return;
    }
    if (typeof instance?.then === 'function') {
      instance.then((cv: CV) => resolve({ cv }));
      return;
    }
    if (instance) {
      const old = instance.onRuntimeInitialized;
      instance.onRuntimeInitialized = () => {
        old?.();
        resolve({ cv: instance });
      };
      instance.onAbort = (reason: unknown) => reject(new Error(String(reason)));
    } else reject(new Error('OpenCV did not load.'));
  });
}
