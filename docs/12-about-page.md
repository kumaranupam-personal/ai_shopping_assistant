# About page

A page that explains the project to engineers and recruiters: what it does, how one conversation moves through the system, and the evidence that it works. Its main action sends the visitor to the chat.

## Serving and isolation

- The page is a second entry in the frontend build: `frontend/about/index.html` loads `frontend/src/about/main.tsx`, and the build writes it to `dist/about/index.html`. It's served at `/saathi/about/`, and in development at `http://localhost:5173/saathi/about/`. Its old addresses `/about` and `/about/`, and `/saathi/about`, redirect there (`13-deployment.md`, Paths). The chat is at `/saathi/`.
- The page is static. Loading it, and using everything on it, sends no request other than for its own files from the same origin: nothing to the API, to Cloudflare Turnstile or to Langfuse. It creates no session.
- Its code imports none of the chat's modules for the API client, the chat state, Turnstile or the cart. It shares only the design tokens, the fonts, the theme and `ThemeSwitch` from `06-frontend.md`.
- It uses the favicon from `06-frontend.md`. Its document title and meta description come from the content file.
- The theme is the one saved for the chat, applied before the first paint in the same way, and the page's header has the theme switch.

## Content file

- `frontend/src/about/content.ts` holds every word, number and link on the page: the document title and description, the header's links, the hero, each section's heading and line, the diagram's labels, the turns and their steps, the feature cards, the evidence figures and note, the closing call to action and the footer. The components hold no wording of their own, so editing this one file changes any text on the page.
- This doc fixes the page's structure and behavior, and repeats none of the file's wording.
- The evidence figures are copied from the Evaluation section of `README.md`, and change with it.
- The file also holds the repository's URL, the LinkedIn profile's URL and each turn's trace URL.

## Structure

The page is one column on `surface-muted` that scrolls as a whole. Because the shared base styles stop the document body from scrolling, the page scrolls inside its own root, which fills the viewport. Sections are centered, at most 1040 px wide, with 24 px at their sides (16 px below 640 px) and 64 px between them (40 px below 640 px). From top to bottom:

1. **Header:** 56 px tall, as in the chat, with the wordmark on the left. On the right: a link that scrolls to the replay, a link to the repository, a link to the author's LinkedIn profile, the theme switch and the call to action as a 32 px tall button. Below 640 px the three links are hidden.
2. **Hero:** centered. The heading is the page's `h1`, in Fraunces at 48 px (36 px below 640 px). Under it, a muted line at most 560 px wide, then the call to action, 44 px tall, beside a secondary button on `surface` with a `line-strong` border, which scrolls to the replay.
3. **Replay:** the section described under Replay and Diagram.
4. **Features:** a heading and a grid of cards, 3 columns from 900 px, 2 from 600 px and 1 below that, with a 16 px gap. Each card, on `surface` with a `line` border and 12 px corners, shows a `lucide-react` icon in `accent-soft-fg` on a 36 px `accent-soft` tile, a title at 16 px in weight 600 and a muted line at 14 px. The content file names each card's icon.
5. **Evidence:** a heading, then a grid of figure tiles, 4 columns from 768 px and 2 below that. Each tile, on `tile` with 8 px corners, shows a muted 12 px label above a figure at 24 px in weight 600 with tabular numbers. Under the grid, one note card in the feature cards' style holds a title in weight 600, a muted text and a link.
6. **Closing band:** full width on `panel`, centered: a Fraunces heading at 30 px in `panel-accent`, a line in `panel-muted`, and the call to action, 44 px tall, as `panel-accent-fg` on `panel-accent`.
7. **Footer:** one muted, centered 12 px line, the repository link and the LinkedIn link.

Section headings other than the hero's and the closing band's are Fraunces at 30 px (24 px below 640 px), each with an optional muted line under it.

## Links

- **Call to action:** in the header, the hero and the closing band. Each opens `/saathi/`, the chat, in a new tab.
- **Repository, LinkedIn and trace links:** open in a new tab.
- Every link that opens a new tab has `rel="noopener"` and shows the `ArrowUpRight` icon after its text.
- **In-page links:** scroll the replay section to the top of the view, smoothly, or at once under `prefers-reduced-motion`.

## Replay

The replay plays back one recorded conversation of three turns: a search, a refinement of it and a comparison of two shown products.

- **Recorded content:** each turn's message, tool names, tool inputs, results and replies are copied from that turn's real trace. They may be shortened, with an ellipsis where text is cut, but never invented or reworded. A turn's steps follow what its trace shows, so their number and order come from the recording.
- **Turn tabs:** a tab list with one tab per turn, as fully rounded chips at 14 px: `surface` with a `line-strong` border, or `accent-fg` on `accent` when selected. Selecting a tab shows that turn's first step. The arrow keys move between tabs.
- **Turn row:** under the tabs, the turn's message as a bubble in `accent-soft-fg` on `accent-soft`, and at the right a muted 12 px summary of the turn (such as its model calls, time and cost) followed by the turn's trace link. A turn whose trace URL is null shows no link.
- **Diagram:** described below. It shows the current step.
- **Step panel:** a card on `surface` with a `line` border, at least 168 px tall so stepping doesn't move the controls. It shows the step's title in weight 600, "Step {n} of {m}" at the right, muted at 12 px, a muted 14 px description, and a code block.
- **Code block:** `panel-fg` on `panel` with 8 px corners, in the system monospace font at 13 px, keeping its line breaks and wrapping long lines. A line that starts with "+" is shown as `panel-accent-fg` on `panel-accent`, which marks what a turn added to an earlier tool input.
- **Controls:** under the panel, "Back" at the left, on `surface` with a `line-strong` border, and at the right the advance button, `accent-fg` on `accent`. Both are 36 px tall.
  - The advance button reads "Next step". On a turn's last step it reads "Next turn" and goes to the next turn's first step, and on the last turn's last step it reads "Start over" and goes to the first turn's first step.
  - "Back" goes to the previous step, and is hidden on a turn's first step.
- **Autoplay:** the first time at least half of the section is in view, the replay advances through the first turn's steps, one every 2.5 seconds, and stops on its last step. Any click or key press inside the section stops it for good. It never runs under `prefers-reduced-motion`.
- **Announcements:** the step's title and description are in an `aria-live="polite"` region, so each step is read out.

## Diagram

An inline SVG drawn in a 680 by 330 coordinate space and scaled to the section's width. Every label comes from the content file.

- **Lanes:** three columns separated by dashed vertical lines, each with a small muted label at its top.

  | Lane | Nodes, top to bottom |
  |---|---|
  | Browser | chat message, reply text, product cards |
  | Server | API, then the agent loop group, then the grounding gate |
  | Data | the search group, then the catalog |

- **Agent loop group:** a dashed outline with a label, holding the model node at the left, the four tool chips stacked at the right in this order: `search_products`, `get_product_details`, `compare_products`, `show_products`, and the session memory node under the model. The session memory node has a second, smaller line.
- **Grounding gate:** one wide node under the agent loop group, spanning the server lane, level with the product cards and the catalog. It has a second, smaller line.
- **Search group:** a dashed outline with a label, holding five rows: SQL filters, then keyword and meaning side by side, then the merge of the two rankings, then the limit per brand, then the top results.
- **Catalog:** one node under the search group, with a second, smaller line.
- **Edges:** straight lines with an open arrowhead, in the direction named:

  | From | To |
  |---|---|
  | chat message | API |
  | API | model |
  | model | the tool chips |
  | session memory | model |
  | `search_products` | the search group |
  | the search group | catalog |
  | `get_product_details` | catalog |
  | `compare_products` | catalog |
  | `show_products` | grounding gate |
  | catalog | grounding gate |
  | grounding gate | product cards |
  | API | reply text |

- **States:** a node is `surface` with a `line-strong` border and `fg` text, and its second line is `fg-muted`. An active node is `accent` with `accent-fg` text. An edge is `line-strong` at 1.5 px, and an active edge is `accent` at 2.5 px, drawn dashed with the dashes moving along its direction. Under `prefers-reduced-motion` an active edge is solid and still. Fills and strokes change over 200 ms.
- **Steps:** each step in the content file lists the nodes and edges it activates. Everything else is idle.
- **Text size:** node labels are 12 units, tool chips and second lines 11.
- **Narrow widths:** below 768 px the diagram keeps a width of 680 px inside a horizontally scrolling container, so its text stays readable. When the step changes, the container scrolls so the step's first active node is in view. The page itself never scrolls sideways.
- **For screen readers:** the SVG has `role="img"` and a label from the content file. The step panel carries the same information as text.

## Accessibility

- Landmarks: `header`, `main` and `footer`.
- Everything works by keyboard, with the focus rings from `06-frontend.md`.
- Text and controls meet WCAG AA contrast in both themes.

## Quality bar

The page is done only when all of these hold:

- At the widths listed in the quality bar of `06-frontend.md`, in both themes, there is no horizontal page scroll and no clipped or overlapping element, on every step of every turn.
- Resizing from 320 to 1024 px, including across 640 px where the header's links appear, never causes horizontal page scroll or a clipped or overlapping element.
- Lighthouse scores for `/saathi/about/` in a desktop production build meet the minimums in `06-frontend.md`.
- No console errors or warnings while loading the page and stepping through every turn.
- Loading the page, stepping through every turn and switching the theme send no request outside the page's own origin.
