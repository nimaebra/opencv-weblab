export const lessons = [
  {
    id: 'local-contrast',
    title: 'Contrast close to home',
    objective: 'Compare local CLAHE with global histogram equalization under uneven lighting.',
    experiments: [
      'Pin Equalization to A and CLAHE to B. Where does local detail become clearer?',
      'Change the clip limit and tile counts. When does noise become stronger?',
    ],
  },
  {
    id: 'details',
    title: 'Bright and dark details',
    objective: 'Separate small bright and dark features from a changing background.',
    experiments: [
      'Compare Top-hat and Black-hat. Which spots does each retain?',
      'Increase the kernel from 3 to 15 and compare the retained detail sizes.',
    ],
  },
  {
    id: 'rectify',
    title: 'Straightening a skewed grid',
    objective: 'Compare cropping a region with correcting its perspective.',
    experiments: [
      'Compare Crop with Perspective correction. Which changes the sloping lines?',
      'Change one corner coordinate, then restore it with Undo.',
    ],
  },
  {
    id: 'geometry',
    title: 'Finding image geometry',
    objective: 'Distinguish edge segments, circles and local corners.',
    experiments: [
      'Pin each detector to B and compare its green annotations with its input.',
      'Change the line gap, circle accumulator threshold or corner quality. Which detections survive?',
    ],
  },
  {
    id: 'distances',
    title: 'Inside an object',
    objective: 'Visualize foreground distance to background and compare distance metrics.',
    experiments: [
      'Compare the mask with Distance transform. Where are the brightest pixels?',
      'Try Manhattan and chessboard distances, then compare the Color map output.',
    ],
  },
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
  {
    id: 'noise',
    title: 'A noisy neighborhood',
    objective: 'Find out why median and Gaussian blur treat isolated noise differently.',
    experiments: [
      'Compare Gaussian and Median at kernel size 3, then 7.',
      'Inspect a bright noise pixel in Gaussian blur with Explain a pixel.',
    ],
  },
  {
    id: 'illumination',
    title: 'Light is not even',
    objective: 'Compare one global threshold with local thresholds under changing illumination.',
    experiments: [
      'Move the Global threshold until the dark side loses detail.',
      'Compare Adaptive threshold and change its neighborhood size.',
    ],
  },
  {
    id: 'gaps',
    title: 'Closing the gaps',
    objective: 'Explore how a structuring element changes holes and boundaries.',
    experiments: [
      'Bypass Closing and find the thin split and two holes.',
      'Try kernels 3, 7 and 15. Do the outer boundaries stay the same?',
    ],
  },
  {
    id: 'low-contrast',
    title: 'A narrow range of light',
    objective: 'See how normalization and equalization redistribute a narrow intensity range.',
    experiments: [
      'Open the histogram of the grayscale input, then each processed output.',
      'Compare the smooth ramp and circular patch after each operation.',
    ],
  },
  {
    id: 'counting',
    title: 'When pixels belong together',
    objective: 'Discover how connectivity changes the number of objects.',
    experiments: [
      'Change connectivity from 8 to 4. What happens at the diagonal contact?',
      'Open Measurements, then measure full resolution and compare counts.',
    ],
  },
  {
    id: 'shape-area',
    title: 'Two meanings of area',
    objective: 'Distinguish foreground pixel counts from outer contour geometry.',
    experiments: [
      'Compare the 7×7 square in Connected components and Contour analysis.',
      'Compare the ring. Does its hole count toward each kind of area?',
    ],
  },
  {
    id: 'isolate-objects',
    title: 'Keep the useful objects',
    objective: 'Remove small regions, then isolate original pixels with the cleaned mask.',
    experiments: [
      'Increase Minimum area until the isolated specks disappear.',
      'Pin Filter objects by area to A and Apply mask to B. Inspect transparency outside the objects.',
    ],
  },
] as const;
export type LessonKind = (typeof lessons)[number]['id'];

const guidance: Record<
  LessonKind,
  { prediction: string; compare: string; hint: string; reflect: string }
> = {
  'local-contrast': {
    prediction: 'Will local and global contrast changes reveal the same details?',
    compare: 'Pin Equalization to A and CLAHE to B, then inspect their histograms.',
    hint: 'CLAHE builds separate histograms in tiles. Clip limit restricts amplification; tile controls count regions rather than pixels.',
    reflect: 'Which settings reveal detail without making noise distracting?',
  },
  details: {
    prediction: 'Will a bright-detail filter also preserve dark spots?',
    compare: 'Compare Top-hat with Black-hat on the same grayscale input.',
    hint: 'Top-hat subtracts opening; Black-hat subtracts input from closing. The kernel controls the detail scale.',
    reflect: 'Which kernel retained the spots you wanted, and what else appeared?',
  },
  rectify: {
    prediction: 'Can cropping alone make converging grid lines parallel?',
    compare: 'Compare Crop with Perspective correction and inspect the grid spacing.',
    hint: 'Crop selects pixels. Perspective maps four source corners to a rectangular output; coordinates refer to the incoming image.',
    reflect: 'What changed in the geometry, and how did interpolation affect the grid?',
  },
  geometry: {
    prediction: 'Will lines, circles and corners describe the same parts of this image?',
    compare: 'Pin the three detector outputs to B in turn and compare their green marks.',
    hint: 'Hough lines need edges. Hough circles take grayscale intensities and run Canny internally. Corners measure local changes along two directions.',
    reflect: 'Which detector best describes each shape? Which settings create false detections?',
  },
  distances: {
    prediction: 'Will every foreground pixel be equally far from the background?',
    compare: 'Compare the mask, normalized distance image and color map.',
    hint: 'Black is background. Brightness is normalized separately for each distance image, so it is not a raw distance readout.',
    reflect: 'How do the metric and object shape change the bright interior?',
  },
  counting: {
    prediction: 'Do squares touching at one corner count as one object or two?',
    compare: 'Compare 4 and 8 connectivity and focus object IDs in Measurements.',
    hint: 'Four connectivity needs a shared side. Eight connectivity accepts a shared corner.',
    reflect: 'Which connectivity matches what you consider a separate object?',
  },
  'shape-area': {
    prediction: 'Will counting foreground pixels give the same area as tracing their boundary?',
    compare:
      'Pin Connected components to A, Contour analysis to B; select each for its measurement table.',
    hint: 'The 7×7 square contains 49 pixels, but its outer contour spans 6×6 coordinate units. Outer contour area includes the ring’s enclosed hole.',
    reflect: 'Which kind of area would you use for occupied pixels? For the outer silhouette?',
  },
  'isolate-objects': {
    prediction: 'Can an area filter remove specks without changing the larger regions?',
    compare: 'Compare the threshold mask with Filter objects by area, then view Apply mask.',
    hint: 'Area filtering keeps entire connected regions within the range. Apply mask copies original pixels where that mask is nonzero.',
    reflect: 'Which objects were retained, and what happens if two objects touch?',
  },
  edges: {
    prediction: 'Which edges will disappear first if smoothing gets stronger?',
    compare: 'Pin Grayscale to A and Canny to B. Compare fine texture with larger boundaries.',
    hint: 'A blur mixes nearby intensities before Canny measures changes. Fine texture often changes first.',
    reflect: 'What information did smoothing remove? When might that be helpful?',
  },
  morphology: {
    prediction: 'Will Closing change small holes, outer boundaries, or both?',
    compare: 'Compare the Otsu mask with Closing, then bypass Closing.',
    hint: 'Closing dilates and then erodes. The kernel decides which gaps can be bridged.',
    reflect: 'Which gap sizes were repaired? What detail was lost?',
  },
  branches: {
    prediction: 'Will an average and a median preserve the same boundaries?',
    compare: 'Pin Gaussian to A and Median to B with matching kernel sizes.',
    hint: 'Gaussian uses a weighted average. Median selects a middle intensity rather than averaging.',
    reflect: 'Which output would you choose for this image, and why?',
  },
  'color-mask': {
    prediction: 'Can the same hue appear in bright and dark parts of the fruit?',
    compare: 'Compare the original with the HSV range mask. White pixels match your bounds.',
    hint: 'Hue wraps around red. Saturation excludes pale colors; value excludes shadows.',
    reflect: 'Which bound removed unwanted pixels? Which useful pixels did it remove too?',
  },
  contrast: {
    prediction: 'Will normalization and equalization make the same histogram?',
    compare: 'Compare both branches and inspect their output histograms.',
    hint: 'Normalization stretches the intensity range. Equalization redistributes it using the cumulative histogram.',
    reflect: 'Where did each method improve contrast or exaggerate texture?',
  },
  sharpen: {
    prediction: 'Will sharpening change flat areas as much as boundaries?',
    compare: 'Compare the original with Sharpen, then inspect Absolute difference.',
    hint: 'The cross kernel adds the center and subtracts its neighbors. Large changes can clip at 0 or 255.',
    reflect: 'Which details improved? Did new halos or noise appear?',
  },
  noise: {
    prediction: 'What will one white pixel do to an average? What will it do to a median?',
    compare:
      'Pin Gaussian to A and Median to B. Use the same kernel. Look at isolated dots and the square boundary.',
    hint: 'A single extreme value contributes to an average. It may not change the middle value of a sorted neighborhood.',
    reflect: 'Which filter removed the dots while preserving the square? Why?',
  },
  illumination: {
    prediction: 'Can one intensity threshold recover the pattern across both sides?',
    compare: 'Compare Global and Adaptive threshold on the same grayscale input.',
    hint: 'The background gets brighter from left to right. Adaptive threshold compares a pixel with its local neighborhood.',
    reflect: 'When did local thresholding help, and where did it introduce artifacts?',
  },
  gaps: {
    prediction: 'Which hole or split will close with a small kernel? What about a large one?',
    compare: 'Pin the threshold mask to A and Closing to B. Check both holes and the outer square.',
    hint: 'Try different structuring-element shapes too. Closing can join nearby bright regions.',
    reflect: 'What is the smallest kernel that repairs the gap you care about?',
  },
  'low-contrast': {
    prediction: 'Which transformation will preserve a smooth intensity ramp?',
    compare: 'Compare Normalization and Equalization, using the pixel inspector and histogram.',
    hint: 'The input deliberately uses only a narrow band of intensities. Equalization depends on how often each intensity occurs.',
    reflect:
      'How do the ramp and circular patch look different? Which evidence supports your choice?',
  },
};
export function lessonGuidance(id: LessonKind) {
  return guidance[id];
}
