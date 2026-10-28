---
name: Roveran
description: A calm contact-sheet workbench for learning image processing.
colors:
  accent: '#3f694c'
  accent-hover: '#31573d'
  subtle: '#edf1e9'
  focus: '#4d7654'
  danger: '#a23c32'
  app-background: '#f4f5f1'
  surface: '#f9faf6'
  paper: '#fff'
  text: '#28382d'
  muted: '#5e6c57'
  line: '#e0e5dc'
  canvas: '#f1f3ed'
  viewer: '#242a26'
  viewer-heading: '#bfc8bc'
  viewer-measurement: '#99a590'
  node-border: '#cdd7c6'
  node-selected: '#6a8c59'
  graph-connection: '#90a39a'
  smoothing-surface: '#e5e9ef'
  smoothing-text: '#4f627c'
  thresholding-surface: '#f2eada'
  thresholding-text: '#796134'
  edges-surface: '#e8e5ef'
  edges-text: '#6e5d84'
  morphology-surface: '#f1e5df'
  morphology-text: '#805944'
  geometry-surface: '#dfece9'
  geometry-text: '#41675c'
  combining-surface: '#ece5e9'
  combining-text: '#79566c'
typography:
  brand:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '25px'
    fontWeight: 600
    letterSpacing: '-1px'
  headline:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '22px'
    fontWeight: 550
    letterSpacing: '-0.5px'
  title:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '19px'
    fontWeight: 550
    letterSpacing: '-0.4px'
  panel-title:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '13px'
    fontWeight: 650
  body:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '13px'
  explanation:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '12px'
    lineHeight: 1.75
  label:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '12px'
    fontWeight: 550
  measurement:
    fontFamily: 'IBM Plex Mono, monospace'
    fontSize: '11px'
    lineHeight: 1.55
  code:
    fontFamily: 'IBM Plex Mono, monospace'
    fontSize: '11px'
rounded:
  compact: '3px'
  field: '4px'
  list-item: '5px'
  control: '6px'
  node: '7px'
  surface: '8px'
  modal: '14px'
spacing:
  '4': '4px'
  '6': '6px'
  '8': '8px'
  '10': '10px'
  '12': '12px'
  '16': '16px'
  '20': '20px'
  '24': '24px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.paper}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '6px 10px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '6px 10px'
  button-danger:
    backgroundColor: 'transparent'
    textColor: '{colors.danger}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '6px 10px'
  search-field:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: '0 9px'
    height: '34px'
  panel-navigation:
    backgroundColor: '{colors.surface}'
    height: '40px'
    padding: '3px 16px'
  category-chip:
    backgroundColor: '{colors.smoothing-surface}'
    textColor: '{colors.smoothing-text}'
    rounded: '{rounded.compact}'
    padding: '3px 6px'
  operation-node:
    backgroundColor: '{colors.paper}'
    rounded: '{rounded.node}'
    width: '180px'
  numeric-field:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.text}'
    rounded: '{rounded.field}'
    padding: '5px 3px'
    width: '59px'
  preview-frame:
    backgroundColor: '{colors.viewer}'
    rounded: '{rounded.surface}'
  dialog:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.modal}'
    padding: '26px'
    width: 'min(660px, 94vw)'
---

# Design System: Roveran

## Overview

**Creative North Star: "The Calm Contact-Sheet Workbench"**

Roveran uses warm paper chrome, botanical green controls, and deep gray image stages to make pixel changes easy to compare. The interface feels like a compact teaching lab: precise controls and measured outputs sit beside plain explanations.

The implemented world is dense, with quiet separators and small changes in surface tone. Images carry the visual weight. Interface typography remains restrained; code and measurements have a distinct monospaced voice. Motion is limited to short control feedback.

This system is extracted from the shipped code and desktop/mobile review captures. The approved direction is recorded in `.impeccable/direction.md` with successful service seed `fe876f05`; no generated comp was approved or used. The preview-first topology is a confirmed product constraint in `PRODUCT.md`.

**Key Characteristics:**

- Warm paper surfaces around dark image stages.
- Botanical green actions with small semantic category tints.
- Compact sans-serif controls and monospaced code and measurements.
- Comparison above the graph, with tools and explanations close at hand.
- Responsive panel navigation and visible keyboard focus.

## Colors

The palette is pale, warm, and low in saturation around the content; the primary action and selected graph state use botanical greens.

### Primary

- **Botanical Green** (`accent`): primary actions, the brand mark, saving feedback, and native checkbox/caret accents. `accent-hover` deepens the same action on hover.
- **Leaf Wash** (`subtle`): the image-source action and supporting green surfaces.
- **Focus Green** (`focus`): the shared visible keyboard outline.

### Secondary

Category colors encode operation families in small chips and numbered library markers. They are supporting semantic colors, not competing primary actions: **Slate Blue** for smoothing, **Oat Gold** for thresholding, **Dusty Violet** for edges, **Clay** for morphology, **Eucalyptus** for geometry, and **Mauve** for combining. Each has a paired surface and text token; color operations retain the native green treatment.

**Brick Red** (`danger`) identifies the danger button variant. Runtime errors and requirements also use warm ochre surfaces, paired with written recovery or requirement text.

### Neutral

- **Warm Ground** (`app-background`): the application backdrop.
- **Paper Surface** (`surface`): headers, side panels, and dialogs.
- **White Paper** (`paper`): fields, graph nodes, and selected comparison controls.
- **Ink** (`text`) and **Muted Olive** (`muted`): primary and secondary interface text.
- **Paper Seam** (`line`): panel boundaries and internal separators.
- **Workbench Ground** (`canvas`): the central workspace.
- **Charcoal Stage** (`viewer`): image frames and the visual reference for graph thumbnails. `viewer-heading` and `viewer-measurement` keep their text visible on the dark stage.
- **Node Seam** (`node-border`), **Selected Leaf** (`node-selected`), and **Connection Sage** (`graph-connection`): graph structure and selection.

### Named Rules

**The Image Stage Rule.** Keep image content on dark stages and editing chrome on paper surfaces so outputs remain easy to compare.

**The Action and Category Rule.** Green carries the main action; category tints stay with the operation family they identify. Pair status and category color with words or an explicit state.

## Typography

**Interface Font:** DM Sans Variable, with DM Sans and sans-serif fallbacks, self-hosted through Fontsource.
**Code and Measurement Font:** IBM Plex Mono, with a monospace fallback, self-hosted at regular weight.

**Character:** DM Sans supplies a compact, approachable interface with modest weight changes. IBM Plex Mono separates functions, dimensions, timing, and zoom from instructional prose; data numerals are tabular.

### Hierarchy

- **Brand:** the lowercase wordmark; it is the largest persistent interface text. Narrow screens reduce its size to (21px).
- **Headline:** dialog titles. On narrow screens they reduce to (19px).
- **Title:** the selected operation name. Its category sits beside it in the same wrapping row.
- **Panel title:** tools, inspector, and preview headings; compact preview and graph contexts use smaller local variants.
- **Body:** the root interface size.
- **Explanation:** parameter descriptions, explanations, and instructional empty-state copy. Preserve this readable role when adding controls.
- **Label:** buttons and parameter labels, with medium weight rather than all-capital emphasis.
- **Measurement:** preview dimensions and timings. Graph metadata uses its own (1.4) line height and compensates for graph zoom.
- **Code:** the selected OpenCV function. Numeric fields use a smaller local monospaced size (10px).

### Named Rules

**The Measurement Voice Rule.** Use the monospaced family for code, numeric values, dimensions, timings, and zoom. Keep explanations and action labels in the interface family.

**The Readable Instruction Rule.** Parameter help and teaching text use the explanation role. Graph titles compensate for zoom; metadata disappears below a graph zoom of (0.6) instead of shrinking into unreadable marks.

## Layout

The desktop editor uses a five-column grid: tool library (224px), resize seam (4px), a flexible central workbench, resize seam (4px), and inspector (284px). The center stacks comparison over graph; the preview starts at `clamp(300px, 47vh, 510px)`. Desktop workspace height is `calc(100dvh - 150px)` with a minimum of (500px). Side panels scroll independently.

The application header is (64px), the experiment strip (56px), and the status bar (30px). Major padding follows the recorded spacing scale; control groups use the smaller steps, panel sections use the larger ones. Preview frames share two equal columns with a (12px) gap. Inspector section boundaries use rules and vertical separation instead of nested containers.

At widths of at least (1600px), side panels widen to (248px) and (310px). At widths of at most (1150px), they tighten to (195px) and (252px), with secondary hints and some header detail hidden.

At widths of at most (950px), Tools / Workspace / Inspector navigation replaces the persistent sidebars. Tools opens a left overlay up to (320px); Inspector opens a right overlay up to (340px). The graph retains compact Undo / Redo controls. Preview height becomes (43vh), and workspace minimum height becomes (550px).

At widths of at most (600px), the header becomes (58px), the experiment strip (48px), and panel navigation (39px). The preview uses (340px) height and a (7px) frame gap; captions stack vertically. The workspace minimum height is (560px). Project and cloud actions use icons with explicit accessible labels, while Export and panel navigation retain visible words. Dialog padding becomes (20px), and dialog footers stack.

**The Preview-First Rule.** In the editor, comparison remains above the graph. Narrow layouts expose the supporting panels through named navigation without moving them into the image stage.

## Elevation & Depth

Most chrome is flat, separated by surface tone and thin seams. Small soft shadows support graph nodes and the selected comparison segment; larger offset shadows identify temporary drawers, toasts, and dialogs. The graph's dotted background belongs to the editable canvas.

### Shadow Vocabulary

- **Graph node:** `0 3px 8px #293d2510`; selected nodes use `0 3px 12px #38532d20` with a stronger border.
- **Selected comparison segment:** `0 1px 3px #26312515`.
- **Range thumb:** `0 1px 3px #29402330`.
- **Panel drawer:** `6px 0 24px #293a2820` from the left, reversed horizontally for the inspector.
- **Toast:** `0 6px 24px #18271626`.
- **Dialog:** `0 20px 70px #172b2130` over a translucent botanical overlay.

**The Temporary Layer Rule.** Keep persistent panel chrome flat. Reserve broad shadows for temporary foreground surfaces; graph nodes and compact controls use only their small local depth treatments.

## Shapes

The form language is softly squared. Use the control radius for buttons and search, the field radius for numeric inputs, the node radius for operation cards, and the surface radius for image frames. Dialogs carry the larger modal radius. Small category chips use the compact radius; they remain short rectangles.

Thin, solid seams organize paper surfaces. The image-source action uses a dashed border to distinguish adding content. Circular geometry is functional: status dots, graph ports, and slider thumbs. Images clip cleanly inside their stages; the comparison wipe uses a straight vertical divider.

## Components

### Buttons

Compact and direct. The primary variant uses Botanical Green and White Paper; ghost controls sit transparently in the surrounding chrome, with a pale green hover surface. Danger uses Brick Red text. The shared control has a minimum height of (32px), icon gap of (7px), and the recorded label typography.

Primary hover deepens the green. Button color/background feedback lasts (150ms) with `ease`. Keyboard focus uses a (2px) outline offset by (3px). Disabled buttons use (0.45) opacity and a blocked cursor. The base danger variant has no separate hover fill. Reduced-motion preferences remove transitions.

### Chips

Small category rectangles identify operation families through paired text and surface colors. In the inspector, the category sits beside the operation title and may wrap with it. The library uses matching category tints in numbered markers. Chips are informational, not selectable filters.

### Cards / Containers

Paper panels are flat structural regions. The signature operation card is a fixed-width graph node with a compact title row, dark thumbnail stage, and monospaced output metadata. A stronger leaf border and a small local shadow identify selection. Bypassed nodes dim to (0.65) opacity; errors add an alert icon and warm border. Actual image content remains visible inside the thumbnail.

### Inputs / Fields

Fields use white paper, thin pale borders, and softly squared corners. Search combines an SVG magnifier, editable text, and a small shortcut keycap in one row. Numeric parameters pair a labeled centered numeric field with a slim green range track and a circular thumb. Selects fill the inspector width.

Focus shares the green outline; the caret uses the action accent. Disabled inputs/selects use (0.5) opacity. Parameter explanations remain below the range or select in the explanation role. Errors include specific text and a recovery action where available.

### Navigation

Desktop navigation lives in the header and permanent side panels. Narrow-screen panel navigation uses three text buttons; the selected panel has a pale green fill and darker green text. It exposes the selected state through `aria-pressed`. Header actions may collapse to icons, retaining accessible names such as Projects, Sign in, and Cloud save.

### Image Comparison

Two dark frames provide a shared reference system, each with an A/B slot, node name, image, and readable measurement caption. Panning and zoom stay synchronized. A compact segmented control switches between split and wipe; wipe requires matching dimensions. The wipe overlays frames behind a straight movable divider. Quality text explains the relationship between preview and full-resolution export.

### Dialogs and Feedback

Dialogs use a paper surface, the larger modal radius, centered constrained width, and a dark translucent overlay. Their title and description precede controls; a drawn close icon stays visible. Cloud provider actions retain full visible labels within the dialog. Toasts sit above the status bar as compact dark notices with an optional action.

## Do's and Don'ts

### Do:

- **Do** preserve the dark-stage and paper-chrome relationship when adding image tools.
- **Do** keep readable help beside parameter controls and use the recorded explanation role.
- **Do** use category colors consistently in library markers and the category beside the operation title.
- **Do** preserve named panel navigation, explicit input labels, and visible keyboard focus at narrow widths.
- **Do** show measurements and code in IBM Plex Mono with tabular numeric treatment.
- **Do** use Lucide or authored SVG for icons, matching the incumbent thin-stroke icon language.

### Don't:

- **Don't** introduce a decorative hero or brand animation into the operating workspace.
- **Don't** use category tints as competing primary action colors.
- **Don't** shrink teaching copy or graph measurements to imitate density.
- **Don't** rely on color alone for category, runtime, error, or selection meaning.
- **Don't** place a category eyebrow above the selected operation title; keep the implemented adjacent label.
- **Don't** turn the paper panels into stacks of decorative cards or apply modal shadows to persistent chrome.
