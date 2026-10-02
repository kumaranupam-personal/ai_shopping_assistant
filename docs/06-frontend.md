# Frontend

## Stack

React 19, TypeScript, Vite and Tailwind CSS v4, which includes container queries. Small helper libraries only: `lucide-react` for icons, `@fontsource-variable/inter` for the self-hosted font, and `clsx`. No component library. Playwright runs the browser tests in `07-evaluation.md`.

## Layout

### App shell

- The shell fills the viewport using `100dvh`, which accounts for mobile browser toolbars, and is centered with a maximum width of 1680 px. Beyond that width, the page background extends and the shell stays centered.
- The shell has two rows: the header (56 px) and the main area, which takes the remaining height. The document body never scrolls. Each panel scrolls on its own.
- Every flex and grid child that contains a scroll area has `min-height: 0` and `min-width: 0`, so content can never push a panel past the viewport.
- The header holds the app name on the left, and on the right a theme switch (system, light, dark) and a "New chat" button. Below 480 px, the button shows only its icon, with an accessible label.

### Wide layout (1024 px and above)

- Two columns: the chat panel on the left, with width `clamp(340px, 32vw, 460px)`, and the results panel taking the rest. A 1 px divider separates them.
- The chat panel stacks the message list (scrolls) above the status line and composer (pinned to the bottom).
- The results panel stacks the headline and suggestion chips (sticky at the top while the grid scrolls) above the product grid.

### Narrow layout (below 1024 px)

- One column: header, then a results strip, then the message list, then the status line and composer pinned to the bottom.
- The results strip appears once a result set exists. It's a horizontally scrolling row of compact cards with scroll snapping: a 64 px image, a one-line title and the price. At its end, a "View all ({n})" button opens the results sheet.
- The results sheet is a full-screen panel with the headline, chips and full product grid, plus a close button. It closes on Esc, the close button, or the browser back gesture.
- Composer padding respects `env(safe-area-inset-bottom)` on phones.

### Product grid

- The grid sizes from the results panel's own width using a container query, not the viewport: `repeat(auto-fill, minmax(208px, 1fr))` with a 16 px gap, or a 12 px gap when the panel is under 640 px wide. That's 1 to 6 columns depending on the space.
- Images use a fixed 1:1 aspect ratio with `object-fit: cover`, so cards never change height while images load.
- Titles clamp to 2 lines and brands to 1 line, with an ellipsis. Highlights wrap onto a second line rather than overflowing.

### Drawer

- On screens 640 px and wider, the product drawer slides in from the right with width `min(480px, 100vw)`. Below 640 px, it's a bottom sheet with full width and a maximum height of `90dvh`.
- The drawer is a modal dialog: it traps focus, closes on Esc or a backdrop click, returns focus to the card that opened it, and locks background scrolling.

### Resize rules

- Layout uses only CSS (grid, flexbox and container queries). No JavaScript measures widths, so drag-resizing a window never causes flicker or broken frames.
- Crossing a breakpoint keeps all state: the selected result set, an open drawer, the scroll position of the message list and any unsent composer text.
- Supported widths run from 320 px to 3840 px. No width in that range produces a horizontal page scrollbar or clipped or overlapping elements.
- Long unbroken text in messages, such as pasted URLs, wraps using `overflow-wrap: anywhere`.
- The layout stays usable at 200% browser zoom.

## Visual design

- **Theme:** design tokens are CSS variables exposed as Tailwind theme values. Neutral colors come from the zinc scale, with one accent (indigo). Semantic colors: green for discounts, red for out-of-stock and errors, amber for rating stars. Light and dark themes follow the system setting by default, and the header switch overrides it.
- **Typography:** Inter variable. The text scale is 12, 14, 16, 18 and 24 px, using weights 400, 500 and 600. Prices use tabular numbers so they line up across cards.
- **Spacing and shape:** a 4 px spacing grid. Cards have 12 px corners, controls 8 px, and chips are fully rounded.
- **Surfaces:** 1 px borders in light neutral tones (dark neutral tones in dark mode). Cards gain a soft shadow and slightly stronger border on hover. No gradients.
- **Motion:** 150 to 200 ms ease-out transitions for hover states, message entry, chip presses and the drawer. All motion is disabled under `prefers-reduced-motion`.
- **Messages:** user messages are right-aligned accent-tinted bubbles. Assistant messages are left-aligned plain text with no bubble. Result markers are compact bordered rows with a grid icon.
- **Cards:** the brand in small muted text above the title, then the price row (price, crossed-out MRP, green discount text), the rating row (amber star, rating, review count in parentheses), and up to 3 highlight pills. Out-of-stock cards show a muted overlay with a red "Out of stock" label and stay clickable.

## Loading, empty and error states

- **Before the first message:** the heading "What are you shopping for?" and the line "Describe what you need in your own words, in English or Hinglish." appear in the results panel in the wide layout, and at the top of the message list in the narrow layout. The composer shows 4 example prompts as clickable chips: "Warm jacket for a Ladakh trek under ₹8,000", "Gaming laptop with 16 GB RAM", "Waterproof trekking shoes in UK 9" and "Shaadi ke liye silk kurta, 5k tak".
- **While a turn runs:** the status line shows the latest `status` text with a spinner, and it's hidden otherwise. After the first search status in a turn, 6 skeleton cards appear in the grid, or 4 compact ones in the strip in the narrow layout, until the `products` event arrives or the turn ends.
- **Unavailable product:** if the drawer's fetch returns `product_not_found`, the drawer shows "This product is no longer available."
- **Images:** load lazily, show a neutral skeleton block while loading, and fall back to a generic product icon on error, since cards carry no category.
- **Errors:** apart from the cases handled in "Session lifecycle", an `error` event or a non-200 response shows an inline error row in the chat with a "Retry" button. Retry removes the error row and resends the same text without adding a second user message. A lost network connection shows a non-blocking banner under the header until the browser reports it's back online.

## Components

- `App`: owns the client state and lays out the shell.
- `Header`: the app name, `ThemeSwitch` and the "New chat" button.
- `ChatPanel`: holds `MessageList`, `StatusLine` and `Composer`.
- `MessageList`: user and assistant messages, plus a result marker for each `products` event. A marker reads "Showed {n} products: {headline}", and clicking it restores that result set. The list auto-scrolls to new messages unless the user has scrolled up, in which case a "Jump to latest" button appears.
- `StatusLine`: described under "Loading, empty and error states".
- `Composer`: a multiline input that grows from 1 to 6 lines and then scrolls. Enter sends and Shift+Enter adds a new line. While a turn is running, typing still works, but the send button and Enter are inactive until the turn ends. Nothing is queued.
- `ResultsPanel`: the headline, `SuggestionChips` and `ProductGrid` for the selected result set. It's used in the wide layout and inside the results sheet.
- `ResultsStrip`: the compact horizontal strip for the narrow layout.
- `SuggestionChips`: clicking a chip sends its text as the next user message. Chips are inactive while a turn is running.
- `ProductGrid` and `ProductCard`: described under Layout and Visual design. A card shows the fields of the card shape in `05-api.md`, and clicking it opens `ProductDrawer`.
- `ProductDrawer`: fetches `GET /api/products/{id}` and shows the image, title, prices, rating, description, every attribute, the sizes and the colors as swatches.

## Accessibility

- Landmarks: `header`, `main`, and the chat and results regions, each with a label.
- Everything works by keyboard, with visible focus rings in the accent color.
- The status line and newly arrived assistant messages are announced through an `aria-live="polite"` region.
- Each card is a button whose accessible name includes the title and price.
- Text and controls meet WCAG AA contrast in both themes.

## Client state

- `sessionId`: kept in `sessionStorage`, so it survives a reload and the browser's "reopen closed tab" but isn't shared with other tabs. A new tab starts a new conversation.
- `pendingMessage`: the text of the message being sent, kept in `sessionStorage` from send until `done` or `error`.
- `messages`: an ordered list of user messages, assistant texts, result markers and error rows.
- `resultSets`: every `products` payload in this session, in order.
- `selectedResultSet`: an index into `resultSets`. Each new `products` event selects itself.
- `turnRunning`: true from send until `done` or `error`.
- `status`: the latest `status` text in the current turn.
- `theme`: `system`, `light` or `dark`, saved in `localStorage`.

## Session lifecycle

- **Page load:** if `sessionStorage` has a `sessionId`, the client calls `GET /api/sessions/{id}`. On success, it rebuilds `messages` and `resultSets` from the entries, selects the latest result set, and scrolls the message list to the latest message. If there's no stored ID, it creates a session through `POST /api/sessions`.
- **Restore failure:** on `session_not_found`, the client creates a new session and shows a dismissible notice: "Your previous chat expired. Starting a new one."
- **Expiry while chatting:** if sending returns `session_not_found`, the client does the same as for a restore failure and keeps the unsent text in the composer.
- **Reload during a turn:** the interrupted turn isn't in the restored transcript, because the server cancels it. If `pendingMessage` is set, the client puts that text back in the composer, so the user can resend it with one keypress, and clears `pendingMessage`.
- **Busy after reload:** if sending returns `turn_in_progress`, as a 409 or as an `error` event, because the cancelled turn hasn't finished rolling back, the client retries automatically after 1 second, up to 3 times, before showing the error.
- **New chat:** creates a new session, replaces the stored ID and clears the conversation, with no notice.

## Stream handling

- The chat request uses `fetch` with a POST and reads the body as a stream, parsing the SSE frames by hand. `EventSource` can't be used because it only supports GET.
- `status` sets the status line. `products` adds a result set and a marker. `text` adds an assistant message. `done` and `error` end the turn.

## Formatting

Amounts follow the currency format in `02-catalog.md`, using `Intl.NumberFormat('en-IN')`.

## Quality bar

The frontend is done only when all of these hold:

- At widths 320, 375, 768, 1024, 1280, 1440, 1920 and 2560 px, in both themes, there is no horizontal page scroll, no clipped or overlapping element, and the layout matches this doc.
- Continuously drag-resizing the window from 320 to 1920 px and back keeps the layout intact and loses no state.
- Cumulative layout shift stays below 0.1 during a full turn, including image loading.
- Lighthouse scores in a desktop production build: accessibility at least 95, performance at least 90 and best practices at least 95.
- No console errors or warnings during the example conversation in `00-overview.md`.
