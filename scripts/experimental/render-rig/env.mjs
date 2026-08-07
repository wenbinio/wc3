// Shared path resolution for the render rig. Repo-relative: the rig lives at
// <repo>/scripts/experimental/render-rig/ and works out of <repo>/_build/render-rig/
// (gitignored) unless RENDER_RIG_DIR overrides it.
import path from 'path';
import { fileURLToPath } from 'url';

export const RIG_SRC = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(RIG_SRC, '..', '..', '..');
export const WORK = process.env.RENDER_RIG_DIR || path.join(REPO, '_build', 'render-rig');
export const STAGE = path.join(WORK, 'stage');
export const OUT = path.join(WORK, 'out');
export const PORT = Number(process.env.RENDER_RIG_PORT || 8931);
