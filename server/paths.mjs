import path from 'node:path';

export function dataDirectory(runtimeRoot, configured) {
  if (configured) return path.resolve(configured);
  const storageRoot = path.basename(runtimeRoot) === 'dist' ? path.dirname(runtimeRoot) : runtimeRoot;
  return path.join(storageRoot, 'data');
}
