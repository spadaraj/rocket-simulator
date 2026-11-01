// Web Worker: runs the many-flight searches (auto-size, fix suggestions) off the UI thread.

import { catalog } from '../data/catalog';
import { autoSize } from '../physics/autosize';
import { findFixes } from '../physics/fixes';
import type { WorkerRequest } from './whatIf';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const result = req.kind === 'autosize' ? autoSize(req.spec, catalog) : findFixes(req.spec, catalog, req.failureType);
  self.postMessage({ id: req.id, result });
};
