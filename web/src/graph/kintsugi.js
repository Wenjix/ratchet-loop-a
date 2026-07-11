// One fixed, hand-drawn fracture. The crack that appears at the revocation and the gold
// seam that fills it at re-crystallization are THE SAME PATH — the repair traces the
// break, which is the whole point of kintsugi. Fixed seed: identical in every run.
import { jitter, toPath } from './roughen.js';

// Drawn in the policy chip's local 132×40 box, entering left edge, exiting right —
// riding the chip's lower band so the policy id above stays legible.
const CRACK_POINTS = [
  [2, 30],
  [22, 26],
  [38, 33],
  [52, 24],
  [58, 31],
  [78, 26],
  [96, 34],
  [114, 27],
  [130, 31],
];

export const CRACK_PATH = toPath(jitter(CRACK_POINTS, { seed: 'kintsugi', amplitude: 2.2 }));
export const CRACK_BOX = { width: 132, height: 40 };
