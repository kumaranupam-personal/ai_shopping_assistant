# Frontend

## Stack

React 19, TypeScript, Vite and Tailwind CSS v4, which includes container queries. Small helper libraries only: `lucide-react` for icons, `@fontsource-variable/inter` for the self-hosted font, and `clsx`. No component library. Playwright runs the browser tests in `07-evaluation.md`.

## Layout

### App shell

- The shell fills the viewport using `100dvh`, which accounts for mobile browser toolbars, and is centered with a maximum width of 1680 px. Beyond that width, the page background extends and the shell stays centered.
- The shell has three rows: the header (56 px), a banner row for the offline banner, the human check and notices, which takes no space when empty, and the main area, which takes the remaining height. The document body never scrolls. Each panel scrolls on its own.
- Every flex and grid child that contains a scroll area has `min-height: 0` and `min-width: 0`, so content can never push a panel past the viewport.
- The header holds the app name on the left, after the `ShoppingBag` icon in a 30 px accent-filled tile with 8 px corners, and on the right a theme switch (system, light, dark) and a "New chat" button. Below 480 px, the button shows only its icon, with an accessible label.

### Wide layout (1024 px and above)

- Two columns: the chat panel on the left, with width `clamp(340px, 32vw, 460px)`, and the results panel taking the rest. A 1 px divider separates them.
- The chat panel stacks the message list (scrolls) above the status line and composer (pinned to the bottom).
- The results panel stacks the headline and suggestion chips (sticky at the top while the grid scrolls) above the product grid.

### Narrow layout (below 1024 px)

- One column: header, then a results strip, then the message list, then the status line and composer pinned to the bottom.
- The results strip appears once a result set exists, or before that with the featured products. It's a horizontally scrolling row of compact cards with scroll snapping: a 64 px image, a one-line title and the price. At its end, a "View all ({n})" button opens the results sheet.
- The results sheet is a full-screen panel with the headline, chips and full product grid, plus a close button. It closes on Esc, the close button, the browser back gesture, or picking a suggestion chip in it.
- Composer padding respects `env(safe-area-inset-bottom)` on phones.

### Product grid

- The grid sizes from the results panel's own width using a container query, not the viewport: `repeat(auto-fill, minmax(208px, 1fr))` with a 16 px gap, or a 12 px gap when the grid area is under 640 px wide. That's 1 to 5 columns depending on the space.
- Images and product tiles use a fixed 1:1 aspect ratio, images with `object-fit: cover`, so cards never change height while images load.
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
- The welcome prompt cards fill the chat column's width, one per row. Their title and subtitle wrap instead of truncating or overflowing, and the arrow stays at the right edge.
- The hero heading, a headline with its tag, and a card's price row each wrap onto a second line when there isn't room, so nothing overflows or overlaps at any supported width.

## Visual design

- **Theme:** design tokens are CSS variables exposed as Tailwind theme values. Neutral colors come from the zinc scale, with one accent (indigo). The accent marks what can be acted on or is selected: the header's logo tile and "New chat" button, the selected theme, the focused composer, the active send button, the hovered prompt card and the featured list's tag. The only decorative use is the hero's faint glow. Semantic colors: green for discounts, red for out-of-stock and errors, amber for rating stars. Light and dark themes follow the system setting by default, and the header switch overrides it.
- **Typography:** Inter variable. The text scale is 12, 14, 16, 18, 24 and 30 px, using weights 400, 500 and 600, plus 700 for the hero heading and the card price. Prices use tabular numbers so they line up across cards.
- **Spacing and shape:** a 4 px spacing grid. Cards have 12 px corners, controls 8 px, and chips are fully rounded.
- **Surfaces:** 1 px borders in light neutral tones (dark neutral tones in dark mode). Cards gain a soft shadow and slightly stronger border on hover. No gradients, except the hero's glow: a radial wash of the accent centered at the top of the hero block, 40% of the accent in the dark theme and 25% in the light theme, fading to transparent within the hero, so it scrolls away with it and never meets the sticky headline bar.
- **Motion:** 150 to 200 ms ease-out transitions for hover states, message entry, chip presses and the drawer, plus two motions with a purpose:
  - **Typing indicator:** while a turn runs and the latest message is the user's, the message list ends with the assistant's `Sparkles` avatar beside a muted bubble of three dots that rise and fade in turn (a 1.2 s loop, each dot 150 ms after the previous). It goes as soon as the turn's first assistant text, cards or error arrives, or the turn ends. It's hidden from screen readers, which hear the status line instead.
  - **Card entrance:** when a result set first appears, from a `products` event or the featured list loading, its cards fade in while rising 14 px over 420 ms with ease-out, each starting 60 ms after the previous and none later than 480 ms. Strip cards in the narrow layout do the same. Selecting an earlier result set, restoring a session or crossing a breakpoint shows cards at once, without replaying it. It animates only opacity and transform, so it causes no layout shift.

  All motion is disabled under `prefers-reduced-motion`: the typing dots stay still and cards appear at once.
- **Messages:** user messages are right-aligned accent-tinted bubbles. Assistant messages are left-aligned plain text with no bubble. Result markers are compact bordered rows with a grid icon.
- **Product tiles:** stand in for a product image. The tile color is the product's first color that isn't neutral (black, white, grey, silver or beige), or its first color when all are neutral. The background is a wash of that color (26% over the surface in the light theme, 34% in the dark theme), and the category's `lucide-react` icon sits large and centered in a shade of it mixed halfway toward the text color: `Shirt` for jackets and kurtas (lucide has no jacket icon), `SportShoe` for shoes, `Smartphone` for phones, `Laptop` for laptops, `Backpack` for backpacks, `Watch` for watches and `CookingPot` for kitchen appliances. Below the icon is the tile color's name, capitalized, followed by "· {n} colours" when the product has more than one, and small dots in the top-right corner show every color. Each of the 15 colors in `02-catalog.md` has its own wash and shade in both themes, and the pale ones (white, beige, silver, gold, yellow) get a hairline inner border so the tile stays visible on the card. The 64 px strip image shows only the icon on the wash.
- **Cards:** the brand in small muted text above the title, then the price row (the price at 18 px in weight 700, the crossed-out MRP, and the discount as a green pill reading "{n}% off" on a soft green background), the rating row (amber star, the rating in the text color at weight 600, review count in parentheses), and up to 3 highlight pills. Out-of-stock cards show a muted overlay with a red "Out of stock" label and stay clickable.

## Loading, empty and error states

- **Before the first message:** in both layouts, the top of the message list shows the welcome:
  - A greeting: a round accent-tinted avatar with the `Sparkles` icon beside "Hi! I'm your shopping assistant. Tell me what you need and your budget, and I'll find the best matches." and, muted, "English or Hinglish both work. Try one of these:".
  - Below it, 4 example prompt cards. Each shows an icon on an 18% wash of its own color (Tailwind's 500 shade), a title, a muted subtitle and an `ArrowRight` icon. Hovering gives a card the accent border and an accent-tinted background. Clicking sends the card's message:

    | Icon | Color | Title | Subtitle | Message sent |
    |---|---|---|---|---|
    | `Shirt` | indigo | Warm jacket for a Ladakh trek | Under ₹8,000, size L | Warm jacket for a Ladakh trek under ₹8,000, size L |
    | `Laptop` | sky | Gaming laptop | 16 GB RAM, dedicated graphics | Gaming laptop with 16 GB RAM and dedicated graphics |
    | `SportShoe` | emerald | Waterproof trekking shoes | Size UK 9 | Waterproof trekking shoes in UK 9 |
    | `Sparkles` | pink | Shaadi ke liye silk kurta | 5k tak | Shaadi ke liye silk kurta, 5k tak |

  - The welcome is an empty state, not a message: it never enters the transcript, it stays hidden while a restore is loading, the first message replaces it, and it returns after a new chat. The cards are inactive while no session exists.
- **Before the first result set:** in the wide layout, the results panel shows the hero on the glow described under Surfaces: the heading "What are you shopping for?" at 30 px in weight 700 and, muted at 16 px, the line "Describe what you need in your own words, in English or Hinglish.", with the featured products from `GET /api/featured` below them under their headline. The featured headline carries a "Top rated" tag: a `Flame` icon and text on an accent-tinted, fully rounded background, in the text color made for that tint so it meets WCAG AA in both themes. In the narrow layout, the featured products fill the results strip. The skeleton cards described below hold their place while they load. If the request fails, the wide panel shows only the heading and line, and the narrow strip stays hidden. Clicking a featured card opens the drawer. The first `products` event replaces them, and they return after a new chat.
- **While a turn runs:** the status line shows the latest `status` text with a spinner ("Thinking" until the first one arrives), and it's hidden otherwise. After the first search status in a turn, 6 skeleton cards appear in the grid, or 4 compact ones in the strip in the narrow layout, until the `products` event arrives or the turn ends.
- **Unavailable product:** if the drawer's fetch returns `product_not_found`, the drawer shows "This product is no longer available." Any other failure shows "Couldn't load this product. Try again."
- **Images:** a product with an `image_url` loads it lazily, showing a neutral skeleton block while loading. A product without one, or whose image fails to load, shows its product tile.
- **Errors:** apart from the cases handled in "Session lifecycle", an `error` event or a non-200 response shows an inline error row in the chat with a "Retry" button. Retry removes the error row and resends the same text without adding a second user message. A stream that ends before `done` or `error` shows "The connection closed before the reply finished." A lost network connection shows a non-blocking banner under the header until the browser reports it's back online.

## Components

- `App`: owns the client state and lays out the shell.
- `Header`: the app name, `ThemeSwitch` and the "New chat" button.
- `ChatPanel`: holds `ChatWelcome`, `MessageList`, `StatusLine` and `Composer`.
- `ChatWelcome`: the greeting and example prompt cards described under "Loading, empty and error states".
- `MessageList`: user and assistant messages, plus a result marker for each `products` event. It ends with the typing indicator while a turn waits for its first reply. A marker reads "Showed {n} products: {headline}", and clicking it restores that result set. The list auto-scrolls to new messages unless the user has scrolled up, in which case a "Jump to latest" button appears.
- `StatusLine`: described under "Loading, empty and error states".
- `Composer`: a multiline input that grows from 1 to 6 lines and then scrolls. Enter sends and Shift+Enter adds a new line. While a turn is running, typing still works, but the send button and Enter are inactive until the turn ends. Nothing is queued. When focused, the input box gets the accent border and a 4 px accent-tinted ring. The send button is accent-filled when it can send and muted otherwise.
- `ResultsPanel`: the headline, `SuggestionChips` and `ProductGrid` for the selected result set, or for the featured products before the first one. It's used in the wide layout and inside the results sheet.
- `ResultsStrip`: the compact horizontal strip for the narrow layout.
- `SuggestionChips`: clicking a chip sends its text as the next user message. Chips are inactive while a turn is running.
- `ProductGrid` and `ProductCard`: described under Layout and Visual design. A card shows the fields of the card shape in `05-api.md`, and clicking it opens `ProductDrawer`.
- `ProductDrawer`: fetches `GET /api/products/{id}` and shows the image, title, prices, rating, description, every attribute, the sizes and the colors as swatches.

## Accessibility

- Landmarks: `header`, `main`, and the chat and results regions, which are labelled "Chat" and "Results".
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
- `featured`: the featured products, loaded once per page load and held by `App`. They never join `resultSets`.
- `turnRunning`: true from send until `done` or `error`.
- `status`: the latest `status` text in the current turn.
- `draft`: the composer text, which a restore or an expired session can fill.
- `notice`: the dismissible notice in the banner row, if any.
- `theme`: `system`, `light` or `dark`, saved in `localStorage`.

## Session lifecycle

- **Page load:** if `sessionStorage` has a `sessionId`, the client calls `GET /api/sessions/{id}`. On success, it rebuilds `messages` and `resultSets` from the entries, selects the latest result set, and scrolls the message list to the latest message. If there's no stored ID, it creates a session through `POST /api/sessions`.
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

- At widths 320, 375, 768, 1024, 1280, 1440, 1920 and 2560 px, in both themes, there is no horizontal page scroll, no clipped or overlapping element, and the layout matches this doc. This holds both before the first message (the welcome, the hero heading and the featured products) and after a turn (messages, result set and cards).
- Continuously drag-resizing the window from 320 to 1920 px and back keeps the layout intact and loses no state, both with the welcome showing and after a turn.
- Cumulative layout shift stays below 0.1 during a full turn, including image loading and the card entrance.
- Lighthouse scores in a desktop production build: accessibility at least 95, performance at least 90 and best practices at least 95.
- No console errors or warnings during the example conversation in `00-overview.md`.
