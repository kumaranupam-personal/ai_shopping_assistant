# Frontend

## Stack

React 19, TypeScript, Vite and Tailwind CSS v4, which includes container queries. Small helper libraries only: `lucide-react` for icons, `@fontsource-variable/manrope` and `@fontsource/instrument-serif` for the self-hosted fonts, and `clsx`. No component library. Playwright runs the browser tests in `07-evaluation.md`.

## Brand

- The app's name in the UI is "Saathi". The repository and project keep the name "AI Shopping Assistant".
- The document title is "Saathi: AI shopping assistant" and the meta description is "Tell Saathi what you need and your budget, and get matching products."
- The favicon is `frontend/public/favicon.svg`, linked from `index.html`: lucide's `ShoppingBag` outline in #F3EAD3 on a #163A2F square with rounded corners. It's the same in both themes.

## Layout

### App shell

- The shell fills the viewport using `100dvh`, which accounts for mobile browser toolbars, and is centered with a maximum width of 1680 px. Beyond that width, the page background extends and the shell stays centered.
- The shell has three rows: the header (56 px), a banner row for the offline banner, the human check and notices, which takes no space when empty, and the main area, which takes the remaining height. The document body never scrolls.
- The main area shows the landing until the conversation has a message, and the wide or narrow layout from then on.
- Every flex and grid child that contains a scroll area has `min-height: 0` and `min-width: 0`, so content can never push a panel past the viewport.
- The header, on `surface-muted` with a 1 px `line` border below it, holds the wordmark "Saathi" in `fg` on the left, and on the right a theme switch (system, light, dark) and a "New chat" button. Below 480 px, the button shows only its icon, with an accessible label.

### Landing

- One column that scrolls as a whole, the same structure at every width. It has no chat panel and no results panel.
- A centered block, at most 720 px wide, with 64 px above it and 24 px at its sides (32 px and 16 px below 640 px), stacks these with 24 px between them: the heading, the line under it (8 px below the heading), the composer, the example prompt cards and the category row.
- The prompt cards form a grid of 2 columns, or 1 column below 640 px, with an 8 px gap. Their title and subtitle wrap instead of truncating or overflowing, and the arrow stays at the right edge.
- The category row is a centered row of chips that wraps onto more lines, with an 8 px gap.
- Below the block, 48 px lower, the featured section spans the shell's width with 16 px padding: its headline, then the product grid at 1024 px and above, or the results strip below that.
- What each part contains, and when the landing shows, is under "Loading, empty and error states".

### Wide layout (1024 px and above)

- Two columns: the chat panel on the left, with width `clamp(340px, 32vw, 460px)`, and the results panel taking the rest. The chat panel's own color separates them, with no divider.
- The chat panel stacks the message list (scrolls) above the status line and composer (pinned to the bottom).
- The results panel stacks the headline and suggestion chips (sticky at the top while the grid scrolls) above the product grid.
- Each panel scrolls on its own.

### Narrow layout (below 1024 px)

- One column: header, then a results strip, then the message list, then the status line and composer pinned to the bottom.
- The results strip appears once a result set exists, or before that with the featured products. It's a horizontally scrolling row of compact cards with scroll snapping: a 64 px image, a one-line title and the price. At its end, a "View all ({n})" button opens the results sheet.
- The results sheet is a full-screen panel with the headline, chips and full product grid, plus a close button. It closes on Esc, the close button, the browser back gesture, or picking a suggestion chip in it.
- The message list, status line and composer are the chat panel, in the same colors as in the wide layout.
- Composer padding respects `env(safe-area-inset-bottom)` on phones.

### Product grid

- The grid sizes from its container's own width using a container query, not the viewport: `repeat(auto-fill, minmax(208px, 1fr))` with a 16 px gap, or a 12 px gap when the grid area is under 640 px wide. That's 1 to 5 columns depending on the space.
- Images and product tiles use a fixed 1:1 aspect ratio, images with `object-fit: cover`, so cards never change height while images load.
- Titles clamp to 2 lines and brands to 1 line, with an ellipsis. Highlight pills wrap onto a second line rather than overflowing.

### Drawer

- On screens 640 px and wider, the product drawer slides in from the right with width `min(480px, 100vw)`. Below 640 px, it's a bottom sheet with full width and a maximum height of `90dvh`.
- The drawer is a modal dialog: it traps focus, closes on Esc or a backdrop click, returns focus to the card that opened it, and locks background scrolling.

### Resize rules

- Layout uses only CSS (grid, flexbox and container queries). No JavaScript measures widths, so drag-resizing a window never causes flicker or broken frames.
- Crossing a breakpoint keeps all state: the selected result set, an open drawer, the scroll position of the message list and any unsent composer text.
- Supported widths run from 320 px to 3840 px. No width in that range produces a horizontal page scrollbar or clipped or overlapping elements.
- Long unbroken text in messages, such as pasted URLs, wraps using `overflow-wrap: anywhere`.
- The layout stays usable at 200% browser zoom.
- The landing heading, a results headline and a card's price row each wrap onto a second line when there isn't room, so nothing overflows or overlaps at any supported width.

## Visual design

- **Theme:** design tokens are CSS variables exposed as Tailwind theme values, and components use only these tokens for color. Light and dark themes follow the system setting by default, and the header switch overrides it.

  | Token | Light | Dark | Used for |
  |---|---|---|---|
  | `page` | #EFEAE0 | #0A100D | the background beyond the shell |
  | `surface-muted` | #FAF8F3 | #111815 | the header, the landing, the results panel, strip and sheet |
  | `surface` | #FFFFFF | #18211D | cards, the drawer, prompt cards, chips and the landing's composer |
  | `tile` | #EFEBE1 | #212C27 | product tiles, highlight pills and skeleton blocks |
  | `line` | #E4DFD3 | #26322C | 1 px borders |
  | `line-strong` | #CFC8B8 | #3A4A42 | hovered borders, the landing composer's border and color-dot borders |
  | `fg` | #14261F | #ECF1EC | text |
  | `fg-muted` | #58675F | #9DB0A6 | secondary text and tile icons |
  | `accent` | #163A2F | #E6D9B8 | the accent outside the chat panel |
  | `accent-fg` | #F3EAD3 | #14261F | text and icons on `accent` |
  | `accent-soft` | #E3ECE6 | #24332C | accent-tinted backgrounds |
  | `accent-soft-fg` | #163A2F | #E6D9B8 | text on `accent-soft` |
  | `panel` | #163A2F | #1B2B24 | the chat panel's background |
  | `panel-raised` | #1F4A3C | #23362E | the chat composer, the typing bubble and the assistant avatar |
  | `panel-line` | #6A917F | #6C8579 | borders inside the chat panel |
  | `panel-fg` | #EAF1EC | #ECF1EC | text in the chat panel |
  | `panel-muted` | #A9C2B6 | #9DB0A6 | secondary text in the chat panel |
  | `panel-accent` | #F3EAD3 | #E6D9B8 | the accent inside the chat panel |
  | `panel-accent-fg` | #163A2F | #14261F | text and icons on `panel-accent` |
  | `success` | #17692F | #7FD69A | discounts |
  | `success-fg` | #FFFFFF | #0E1E14 | text on `success` |
  | `success-soft` | #E4F1E6 | #1E3527 | the drawer's discount pill |
  | `danger` | #B3261E | #F2A099 | out-of-stock labels and errors |
  | `danger-soft` | #FBEAE8 | #3A1F1D | the background behind `danger` text |
  | `star` | #B7791F | #E5B454 | rating stars |

- **Accent:** the accent marks what can be acted on or is selected, and is never decorative. Outside the chat panel it's `accent`: the "New chat" button (filled, with `accent-fg` text and icon), the selected theme (`accent-soft-fg` on `accent-soft`), the landing composer when focused and its send button when active, a hovered prompt card, category chip or suggestion chip, and focus rings. Inside the chat panel it's `panel-accent`: user messages, the selected result marker, the composer when focused and its send button when active, and focus rings.
- **Typography:** Manrope variable for all text, except Instrument Serif at weight 400 for the wordmark (24 px), the landing heading (48 px, or 36 px below 640 px), results headlines (24 px), the drawer's product title (24 px) and the letter in the assistant avatar (18 px). The Manrope text scale is 12, 14, 16 and 18 px, plus 24 px for the drawer's price, using weights 400, 500 and 600, plus 700 for the card price. Prices use tabular numbers so they line up across cards.
- **Spacing and shape:** a 4 px spacing grid. Cards have 12 px corners, controls 8 px, the landing's composer 16 px, and chips, pills and badges are fully rounded.
- **Surfaces:** flat colors and 1 px borders. No gradients. The only shadows are on a hovered card, the landing's composer and the "Jump to latest" button.
- **Motion:** 150 to 200 ms ease-out transitions for hover states, message entry, chip presses and the drawer, plus three motions with a purpose:
  - **Card hover:** a hovered card rises 2 px and gains a soft shadow and a `line-strong` border.
  - **Typing indicator:** while a turn runs and the latest message is the user's, the message list ends with the assistant avatar beside a `panel-raised` bubble of three `panel-muted` dots that rise and fade in turn (a 1.2 s loop, each dot 150 ms after the previous). It goes as soon as the turn's first assistant text, cards or error arrives, or the turn ends. It's hidden from screen readers, which hear the status line instead.
  - **Card entrance:** when a result set first appears, from a `products` event or the featured list loading, its cards fade in while rising 14 px over 420 ms with ease-out, each starting 60 ms after the previous and none later than 480 ms. Strip cards do the same. Selecting an earlier result set, restoring a session, crossing a breakpoint or leaving the landing shows cards at once, without replaying it. It animates only opacity and transform, so it causes no layout shift.

  All motion is disabled under `prefers-reduced-motion`: a hovered card doesn't rise, the typing dots stay still and cards appear at once.
- **Messages:** user messages are right-aligned bubbles in `panel-accent` with `panel-accent-fg` text. Assistant messages are left-aligned plain `panel-fg` text with no bubble, each after the assistant avatar: a 28 px `panel-raised` circle holding the letter "S", aligned with the message's first line and hidden from screen readers. Result markers and error rows have no avatar and are indented 40 px, so they line up with assistant text. A result marker is a compact row with a `panel-line` border and `panel-muted` text, or a `panel-accent` border and `panel-fg` text when selected, holding a grid icon and two lines: 14 px, then 12 px.
- **Product tiles:** stand in for a product image. The tile is a flat `tile` background with the category's `lucide-react` icon large and centered in `fg-muted`: `Shirt` for jackets and kurtas (lucide has no jacket icon), `SportShoe` for shoes, `Smartphone` for phones, `Laptop` for laptops, `Backpack` for backpacks, `Watch` for watches and `CookingPot` for kitchen appliances. Small dots in the top-right corner show every color of the product, in the order of its `colors`, each filled with that color and given a 1 px `line-strong` border so pale colors stay visible. The 64 px strip image shows only the icon.
- **Cards:** below the image or tile, the brand in small muted text above the title, then the price row (the price at 18 px in weight 700 and, when discounted, the crossed-out MRP at 12 px, muted), the rating row (the star in `star`, the rating in the text color at weight 600, review count in parentheses), and the highlight pills. A discounted card also shows a badge in the image's top-left corner, 8 px in from each edge: "{n}% off" at 12 px in weight 600, `success-fg` on `success`. Out-of-stock cards show a muted overlay with an "Out of stock" label, `danger` on `danger-soft`, and stay clickable. Strip cards show neither the badge nor pills.
- **Highlight pills:** a card shows one pill, 12 px `fg-muted` text on `tile`, for each of its `highlights` from `05-api.md`, in order, shortened by these rules:
  1. A value of "no" or "0 m" gives no pill.
  2. A value of "yes" gives the label alone.
  3. Any other value gives the value alone, or the value, a space and the label when the label is one of: ram, storage, warmth, sole, strap, sleeve, water resistance, warranty.
  4. "1024 GB" is written "1 TB".
  5. The words "ram", "pu" and "eva" are written in capitals, and then the pill's first letter is capitalized.

  | Highlight | Pill |
  |---|---|
  | type: windcheater | Windcheater |
  | warmth: light | Light warmth |
  | waterproof: no | (none) |
  | waterproof: yes | Waterproof |
  | sole: pu | PU sole |
  | ram: 16 GB | 16 GB RAM |
  | storage: 1024 GB | 1 TB storage |
  | battery: 5186 mAh | 5186 mAh |
  | water resistance: 30 m | 30 m water resistance |
  | type: induction cooktop | Induction cooktop |
  | warranty: 5 years | 5 years warranty |

## Loading, empty and error states

- **Before the first message:** the main area shows the landing, laid out as described under Layout:
  - The heading "What are you shopping for?" and, muted at 16 px and centered, the line "Tell Saathi what you need and your budget, in English or Hinglish."
  - The `Composer` in its landing style.
  - 4 example prompt cards in a list labelled "Example requests". Each shows an icon in `accent-soft-fg` on a 36 px `accent-soft` tile with 8 px corners, a title, a muted subtitle and an `ArrowRight` icon, on `surface` with a `line` border. Hovering gives a card the `accent` border. Clicking sends the card's message:

    | Icon | Title | Subtitle | Message sent |
    |---|---|---|---|
    | `Shirt` | Warm jacket for a Ladakh trek | Under ₹8,000, size L | Warm jacket for a Ladakh trek under ₹8,000, size L |
    | `Laptop` | Gaming laptop | 16 GB RAM, dedicated graphics | Gaming laptop with 16 GB RAM and dedicated graphics |
    | `SportShoe` | Waterproof trekking shoes | Size UK 9 | Waterproof trekking shoes in UK 9 |
    | `PartyPopper` | Shaadi ke liye silk kurta | 5k tak | Shaadi ke liye silk kurta, 5k tak |

  - 8 category chips in a list labelled "Categories", one per category in the order of `02-catalog.md`. Each shows the category's icon from "Product tiles" and its name with underscores replaced by spaces and the first letter capitalized ("Kitchen appliances"), at 14 px on `surface` with a `line` border. Hovering gives a chip the `accent` border. Clicking sends "Show me {name in lowercase}", as in "Show me kitchen appliances".
  - The featured products from `GET /api/featured`, under their headline. The skeleton cards described below hold their place while they load: 6 in the grid, or 4 compact ones in the strip. If the request fails, the featured section is left out. Clicking a featured card opens the drawer.
  - The composer's send button, the prompt cards and the category chips are inactive while no session exists.
  - Sending a message, from the composer, a prompt card or a category chip, replaces the landing with the wide or narrow layout at once, with no transition. Focus moves to the chat panel's composer when the message came from the landing's composer, and to the message list otherwise, so a phone's keyboard doesn't open after a tap on a card or chip.
  - The landing is an empty state, not a message: it never enters the transcript, and it returns after a new chat. While a stored session is being restored on page load, the main area stays empty, so neither the landing nor a layout flashes first.
- **Before the first result set:** once the conversation has a message, the featured products show in the results panel under their headline, or in the results strip in the narrow layout, as they do for a result set. The first `products` event replaces them. If the featured request failed, the results panel shows only the muted, centered line "Products Saathi finds will show here.", and the narrow strip stays hidden.
- **While a turn runs:** the status line shows the latest `status` text with a spinner ("Thinking" until the first one arrives), and it's hidden otherwise. After the first search status in a turn, 6 skeleton cards appear in the grid, or 4 compact ones in the strip in the narrow layout, until the `products` event arrives or the turn ends.
- **Unavailable product:** if the drawer's fetch returns `product_not_found`, the drawer shows "This product is no longer available." Any other failure shows "Couldn't load this product. Try again."
- **Images:** a product with an `image_url` loads it lazily, showing a skeleton block while loading. A product without one, or whose image fails to load, shows its product tile.
- **Errors:** apart from the cases handled in "Session lifecycle", an `error` event or a non-200 response shows an inline error row in the chat with a "Retry" button. Retry removes the error row and resends the same text without adding a second user message. A stream that ends before `done` or `error` shows "The connection closed before the reply finished." A lost network connection shows a non-blocking banner under the header until the browser reports it's back online.

## Components

- `App`: owns the client state and lays out the shell.
- `Header`: the wordmark, `ThemeSwitch` and the "New chat" button.
- `Landing`: the landing described under Layout and "Loading, empty and error states". It holds the heading, `Composer`, the prompt cards, the category chips and the featured products.
- `ChatPanel`: holds `MessageList`, `StatusLine` and `Composer`.
- `MessageList`: user and assistant messages, plus a result marker for each `products` event. It ends with the typing indicator while a turn waits for its first reply. A marker shows its result set's headline on one line, cut with an ellipsis, above "{n} products" ("1 product" for one). Its accessible name is "Show {n} products: {headline}", and clicking it restores that result set. The list auto-scrolls to new messages unless the user has scrolled up, in which case a "Jump to latest" button appears.
- `StatusLine`: described under "Loading, empty and error states".
- `Composer`: a multiline input with the placeholder "Describe what you're looking for". Empty, it's one 24 px line tall with 8 px of padding above and below. It grows with its text up to 6 lines and then scrolls. Enter sends and Shift+Enter adds a new line. While a turn is running, typing still works, but the send button and Enter are inactive until the turn ends. Nothing is queued. The same draft text shows in both styles:
  - **Chat style**, in the chat panel: a `panel-raised` box with a `panel-line` border, `panel-fg` text and a `panel-muted` placeholder. Focused, it gets a `panel-accent` border and a 4 px ring of `panel-accent` at 25% opacity. The send button is `panel-accent` with a `panel-accent-fg` icon when it can send, and `panel-muted` on the box's own background otherwise.
  - **Landing style**, on the landing: a `surface` box with a `line-strong` border, a soft shadow and 16 px text. Focused, it gets an `accent` border and a 4 px `accent-soft` ring. The send button is `accent` with an `accent-fg` icon when it can send, and `fg-muted` on `tile` otherwise.
- `ResultsPanel`: the headline, `SuggestionChips` and `ProductGrid` for the selected result set, or for the featured products before the first one. It's used in the wide layout and inside the results sheet.
- `ResultsStrip`: the compact horizontal strip for the narrow layout and the landing below 1024 px.
- `SuggestionChips`: chips at 14 px on `surface` with a `line` border. Clicking a chip sends its text as the next user message. Chips are inactive while a turn is running.
- `ProductGrid` and `ProductCard`: described under Layout and Visual design. A card shows the fields of the card shape in `05-api.md`, and clicking it opens `ProductDrawer`.
- `ProductDrawer`: fetches `GET /api/products/{id}` and shows the image or tile, the brand, the title, the price row (the price at 24 px in weight 600, the crossed-out MRP and, when discounted, "{n}% off" as a `success` on `success-soft` pill), the rating, the description, every attribute, the sizes and the colors as swatches.

## Accessibility

- Landmarks: `header`, `main`, and, once the conversation has a message, the chat and results regions, which are labelled "Chat" and "Results". The landing's heading is the page's `h1`.
- Everything works by keyboard, with visible focus rings in the accent color for where they are (see Accent).
- The status line and newly arrived assistant messages are announced through an `aria-live="polite"` region.
- Each card is a button whose accessible name includes the title and price.
- Text and controls meet WCAG AA contrast in both themes. The token values under Theme are chosen so that every pairing this doc names does.

## Client state

- `sessionId`: kept in `sessionStorage`, so it survives a reload and the browser's "reopen closed tab" but isn't shared with other tabs. A new tab starts a new conversation.
- `pendingMessage`: the text of the message being sent, kept in `sessionStorage` from send until `done` or `error`.
- `messages`: an ordered list of user messages, assistant texts, result markers and error rows.
- `resultSets`: every `products` payload in this session, in order.
- `selectedResultSet`: an index into `resultSets`. Each new `products` event selects itself.
- `featured`: the featured products, loaded once per page load and held by `App`. They never join `resultSets`.
- `turnRunning`: true from send until `done` or `error`.
- `status`: the latest `status` text in the current turn.
- `draft`: the composer text, shared by the landing's composer and the chat panel's, which a restore or an expired session can fill.
- `notice`: the dismissible notice in the banner row, if any.
- `theme`: `system`, `light` or `dark`, saved in `localStorage`.

## Session lifecycle

- **Page load:** if `sessionStorage` has a `sessionId`, the client calls `GET /api/sessions/{id}`. On success, it rebuilds `messages` and `resultSets` from the entries, selects the latest result set, and scrolls the message list to the latest message. If there's no stored ID, it creates a session through `POST /api/sessions`, and the landing shows meanwhile, keeping anything typed in its composer.
- **Restore failure:** on `session_not_found`, the client creates a new session and shows a dismissible notice: "Your previous chat expired. Starting a new one."
- **Expiry while chatting:** if sending returns `session_not_found`, the client does the same as for a restore failure and keeps the unsent text in the composer.
- **Reload during a turn:** the interrupted turn isn't in the restored transcript, because the server cancels it. If `pendingMessage` is set, the client puts that text back in the composer, so the user can resend it with one keypress, and clears `pendingMessage`.
- **Busy after reload:** if sending returns `turn_in_progress`, as a 409 or as an `error` event, because the cancelled turn hasn't finished rolling back, the client retries automatically after 1 second, up to 3 times, before showing the error.
- **Message limit:** if sending returns `session_full`, the error row shows the server's message with a "New chat" button instead of "Retry", because resending can't succeed.
- **Chat unavailable:** if sending returns `chat_unavailable`, the error row shows the server's message with no button, because neither resending nor a new chat can succeed until the server allows chat again.
- **Human check:** the Turnstile widget described in `11-abuse-protection.md` sits in the banner row under the header.
- **Session creation failure:** if creating a session fails on page load or for New chat, the client shows a dismissible notice. It carries the server's message when the response has an error body, such as `rate_limited` or `verification_failed`. Otherwise it reads "Can't reach the store right now. Reload the page to try again." on page load, and "Can't reach the store right now. Try again in a moment." for New chat, which keeps the current conversation and any running turn. When creating a session fails while replacing an expired one during a send, the error row from "Errors" shows instead.
- **New chat:** creates a new session, then cancels a running turn, replaces the stored ID and clears the conversation and any unsent composer text, with no notice.

## Stream handling

- The chat request uses `fetch` with a POST and reads the body as a stream, parsing the SSE frames by hand. `EventSource` can't be used because it only supports GET.
- `status` sets the status line. `products` adds a result set and a marker. `text` adds an assistant message. `done` and `error` end the turn.

## Formatting

Amounts follow the currency format in `02-catalog.md`, using `Intl.NumberFormat('en-IN')`.

## Quality bar

The frontend is done only when all of these hold:

- At widths 320, 375, 768, 1024, 1280, 1440, 1920 and 2560 px, in both themes, there is no horizontal page scroll, no clipped or overlapping element, and the layout matches this doc. This holds both on the landing and after a turn (messages, result set and cards).
- Continuously drag-resizing the window from 320 to 1920 px and back keeps the layout intact and loses no state, both on the landing and after a turn.
- Cumulative layout shift stays below 0.1 during a full turn, including image loading and the card entrance.
- Lighthouse scores in a desktop production build: accessibility at least 95, performance at least 90 and best practices at least 95.
- No console errors or warnings during the example conversation in `00-overview.md`.
