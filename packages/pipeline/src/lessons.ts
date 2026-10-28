export const lessons = [
  {
    id: 'edges',
    title: 'Finding the edges',
    objective: 'See how smoothing changes which edges Canny finds.',
    experiments: [
      'Increase Gaussian kernel size from 5 to 15. Which details disappear?',
      'Raise Canny’s low and high thresholds. Which edges remain?',
    ],
  },
  {
    id: 'morphology',
    title: 'Shapes from light',
    objective: 'Turn intensity into a binary mask and repair its small gaps.',
    experiments: [
      'Bypass Closing to see the unmodified Otsu mask.',
      'Change the closing kernel from 3 to 9. Which gaps close?',
    ],
  },
  {
    id: 'branches',
    title: 'Two ways to see',
    objective: 'Compare Gaussian and median smoothing from the same grayscale source.',
    experiments: [
      'Pin Gaussian blur to A and Median blur to B.',
      'Give both filters a kernel size of 9 and compare boundaries with the wipe.',
    ],
  },
  {
    id: 'color-mask',
    title: 'Finding a color',
    objective: 'Separate color from brightness with an HSV range mask.',
    experiments: [
      'Move the hue bounds to isolate a different fruit.',
      'Increase saturation minimum to exclude gray and pale regions.',
    ],
  },
  {
    id: 'contrast',
    title: 'Reading the histogram',
    objective: 'Compare intensity stretching with histogram equalization.',
    experiments: [
      'Pin Grayscale to A and Equalization to B; open B’s histogram.',
      'Select Normalization. How does its histogram differ from Equalization?',
    ],
  },
  {
    id: 'sharpen',
    title: 'What sharpening changes',
    objective: 'Use an absolute difference to reveal pixels affected by sharpening.',
    experiments: [
      'Increase Sharpen strength from 0 to 2. Which details change most?',
      'Pin the original to A and Sharpen to B, then inspect a pixel near an edge.',
    ],
  },
] as const;
export type LessonKind = (typeof lessons)[number]['id'];
