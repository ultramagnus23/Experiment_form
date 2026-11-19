import path from 'node:path';
import { audioDir } from './env';

export function audioPath(stored: string): string {
  // stored_filename is generated server-side; still guard against traversal.
  return path.join(audioDir(), path.basename(stored));
}
