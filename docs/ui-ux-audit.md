# UI and UX audit — 29 October 2026

Reviewed the React/Vite workbench using UI/UX Pro Max's accessibility, interaction, responsive layout and form guidance. Preserved the established paper surfaces, green accents, dark image stages and preview-first layout in `DESIGN.md`.

## Implemented fixes

| Priority | Finding                                                                                                                   | Result                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Narrow-screen panels covered controls that remained keyboard accessible. Opening and closing panels did not manage focus. | Added close buttons, a dismissible backdrop, inert covered content, focus on opening and focus restoration. Escape works while editing fields. Navigation exposes its controlled panel and expanded state. |
| P1       | The expanded viewer allowed keyboard navigation behind its overlay.                                                       | Added dialog semantics, inert background content, a keyboard focus loop, Escape dismissal, trigger restoration and scrolling for long explanations. Included Safari's pointer-focus behavior.              |
| P1       | Many mobile controls were only 24–34px high.                                                                              | Added 44px control targets on narrow screens and for coarse-pointer desktop controls. Enlarged sliders, search, disclosures and numeric inputs.                                                            |
| P1       | Focus visibility and some field labels/control boundaries were too faint or incomplete.                                   | Added summary/compound-search focus indicators, a first-focusable skip link, darker semantic labels and a separate control-border token.                                                                   |
| P2       | Keyboard resizing jumped between two hard-coded sizes without reporting the resulting size.                               | Added measured separator values, 10px steps, 40px steps with Shift, Home/End limits and matching pointer constraints.                                                                                      |
| P2       | Clearing a project name immediately inserted a fallback, disrupting replacement text.                                     | Empty drafts are editable; blur/Enter trims the name or applies the fallback. Autosaving continues for nonempty edits. Replaced the misleading dropdown chevron with a pencil.                             |
| P2       | Numeric corrections happened without an explanation, and help was not programmatically connected to controls.             | Inputs and sliders reference their description and valid range; automatic corrections produce local status feedback. Select help is also associated.                                                       |
| P2       | Search whitespace prevented expected matches, and collapsed groups could hide results.                                    | Trimmed the query, revealed matching groups, added a clear action and announced the matching tool count.                                                                                                   |
| P2       | Long project names and rename controls could crowd narrow dialogs.                                                        | Allowed long names to wrap and stacked project actions/rename fields on phones. Destructive actions have distinct color and hover feedback.                                                                |
| P2       | A flexible mobile canvas could lose its rendering height.                                                                 | Reserved a definite, scrollable workbench height and added regression checks that the graph retains a usable rendering area.                                                                               |

Shared buttons now default to `type="button"` and hide decorative button icons from assistive technology. Reduced-motion settings disable animation as well as transitions. Saving status includes readable status text.

## Verification

- `pnpm check`: lint, workspace type checks, all 128 unit tests and production/PWA build.
- **64 browser tests passed** covering accessibility, core editor, guided learning, local projects/backups, object analysis, export, undo/redo and graph interactions in Chromium and WebKit.
- Added six browser regressions covering mobile focus/dismissal/search, keyboard resizing, editable names/dialog focus return, numeric help/correction, expanded-viewer focus, and responsive layout.
- Responsive checks include 320px and 375px phones, 812px landscape and a 1440px desktop, long user-entered names and reduced motion.
- Contrast spot checks: secondary text against the paper surface **5.33:1**; field borders against white **3.22:1**; primary action text/background **6.29:1**. These are specific pairs, not a whole-app conformance claim.
- React Doctor changed-file scan: **no issues reported**; overall score **84/100**, unchanged between scans.
- Impeccable detector reviewed the changed surfaces. Its design-system advisories include existing compact type sizes and palette literals; the new interaction tokens and responsive rules are recorded in `DESIGN.md`.

## Validation limits

Firefox's test executable fails before opening the app with “Could not find profile folder”, including a retry with a separate temporary directory. Chromium and WebKit provide the verified browser results. Responsive emulation and browser automation do not replace physical-device touch testing or a manual assistive-technology audit.
