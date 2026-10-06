// Every word, number, icon name and link on the about page (docs/12-about-page.md, Content file). Edit this file to
// change the page's text; the components hold no wording of their own. It has no runtime imports, so the build's
// config can read the title and description from it too.

/** Icons the page may name, from lucide-react. */
export type IconName = "Cpu" | "ShieldCheck" | "Search" | "Languages" | "Activity" | "Gauge";

/** The diagram's nodes (docs/12-about-page.md, Diagram). Their positions live in layout.ts. */
export type NodeId =
  | "message"
  | "reply"
  | "cards"
  | "api"
  | "model"
  | "memory"
  | "search_products"
  | "get_product_details"
  | "compare_products"
  | "show_products"
  | "gate"
  | "sql"
  | "keyword"
  | "meaning"
  | "merge"
  | "brand"
  | "top"
  | "catalog";

/** The diagram's edges, named "{from}-{to}"; "search" is the search group. */
export type EdgeId =
  | "message-api"
  | "api-model"
  | "model-search_products"
  | "model-get_product_details"
  | "model-compare_products"
  | "model-show_products"
  | "memory-model"
  | "search_products-search"
  | "search-catalog"
  | "get_product_details-catalog"
  | "compare_products-catalog"
  | "show_products-gate"
  | "catalog-gate"
  | "gate-cards"
  | "api-reply";

export type Step = {
  title: string;
  description: string;
  /** Copied from the turn's trace, shortened with "…". A line starting with "+" is new compared with an earlier turn. */
  code: string;
  nodes: NodeId[];
  edges: EdgeId[];
};

export type Turn = { tab: string; message: string; summary: string; traceUrl: string | null; steps: Step[] };

const REPOSITORY = "https://github.com/kumaranupam-personal/ai_shopping_assistant";

export const about = {
  title: "How Saathi works",
  description: "How an AI agent turns a shopping request into a catalog search, step by step.",
  repositoryUrl: REPOSITORY,
  chatUrl: "/saathi/",

  header: { wordmark: "Saathi", howItWorks: "How it works", github: "GitHub", cta: "Try Saathi" },

  hero: {
    heading: "Describe it. Saathi finds it.",
    line: "Say what you need in English or Hinglish. An AI agent understands your intent and turns it into a catalog search. Every product you see comes from the catalog, never from the model's imagination.",
    cta: "Talk to Saathi",
    secondary: "Watch one conversation",
  },

  replay: {
    heading: "One conversation, three turns",
    line: "A recorded conversation. Pick a turn and step through it; the diagram lights up the part doing the work.",
    tabsLabel: "Turns",
    traceLink: "View this turn's trace",
    stepOf: (n: number, m: number) => `Step ${n} of ${m}`,
    back: "Back",
    nextStep: "Next step",
    nextTurn: "Next turn",
    startOver: "Start over",
  },

  diagram: {
    label: "Architecture diagram: the browser, the server with its agent loop and tools, and the search and catalog",
    lanes: { browser: "Browser", server: "Server", data: "Data" },
    groups: { agentLoop: "Agent loop: model and tools take turns", search: "Search" },
    nodes: {
      message: ["Chat message"],
      reply: ["Reply text"],
      cards: ["Product cards"],
      api: ["API"],
      model: ["Model"],
      memory: ["Session memory", "history · shown list"],
      search_products: ["search_products"],
      get_product_details: ["get_product_details"],
      compare_products: ["compare_products"],
      show_products: ["show_products"],
      gate: ["Grounding gate", "IDs checked · cards built from catalog rows"],
      sql: ["SQL filters"],
      keyword: ["Keyword"],
      meaning: ["Meaning"],
      merge: ["Merge the two rankings"],
      brand: ["At most 3 per brand"],
      top: ["Top 10 results"],
      catalog: ["Catalog", "2,400 products"],
    } satisfies Record<NodeId, string[]>,
  },

  // Recorded on 2026-10-05 with gemini-3.8-flash, one session of three turns. Tool inputs, results and replies are
  // copied from the traces; the code blocks reorder JSON keys for reading and cut with "…".
  turns: [
    {
      tab: "Turn 1 · Search",
      message: "I'm going trekking in Ladakh in December, need a jacket under 8k, size L.",
      summary: "2 model calls · 3.8 s · $0.005",
      traceUrl:
        "https://cloud.langfuse.com/project/cmus314rs0f4sad0c0vp141i2/traces/ba067d5db242febe3d8b1f4cd5bb1c12?observation=817947a4c2df934f&timestamp=2026-10-05T10%3A10%3A12.016Z&traceId=ba067d5db242febe3d8b1f4cd5bb1c12&view=graph",
      steps: [
        {
          title: "The message reaches the agent",
          description: "The API adds the message to the session's history and asks the model what to do. The model sees the history and the four tools.",
          code: "I'm going trekking in Ladakh in December, need a jacket under 8k, size L.",
          nodes: ["message", "api", "model", "memory"],
          edges: ["message-api", "api-model", "memory-model"],
        },
        {
          title: "Model call 1: search the catalog",
          description: "\"8k\" becomes a budget of 8000, and Ladakh in December becomes warmth words in the free-text query.",
          code: 'search_products({\n  "query": "Ladakh winter trekking jacket extreme warmth",\n  "category": "jackets",\n  "size": "L",\n  "price_max": 8000\n})',
          nodes: ["model", "search_products"],
          edges: ["model-search_products"],
        },
        {
          title: "Ten results from 163 matches",
          description: "SQL filters apply the limits, keyword and meaning rankings are merged, at most 3 per brand, and the top 10 go back to the model. A down jacket comes first, and most of the rest are fleece.",
          code: '{"total_matches": 163, "results": [\n  {"id": "JKT-00230", "title": "TrekNorth Summit Down Jacket", "price": 7809, … "warmth": "extreme" …},\n  {"id": "JKT-00248", "title": "TrekNorth Glacier Fleece Jacket", "price": 4769, … "warmth": "high" …},\n  {"id": "JKT-00221", "title": "TrekNorth Zanskar Fleece Jacket", "price": 4209, … "warmth": "high" …},\n  …\n]}',
          nodes: ["search_products", "sql", "keyword", "meaning", "merge", "brand", "top", "catalog"],
          edges: ["search_products-search", "search-catalog"],
        },
        {
          title: "Model call 2: show eight products",
          description: "The model only picks IDs. The grounding gate checks each one and builds the cards from catalog rows, so no price or title comes from the model.",
          code: 'show_products({\n  "product_ids": ["JKT-00230", "JKT-00248", "JKT-00221", "JKT-00097", "JKT-00015", "JKT-00004", "JKT-00037", "JKT-00150"],\n  "headline": "Jackets for Ladakh Winter Trekking in Size L",\n  "suggestions": ["Only waterproof", "Only down jackets", "Under ₹5,000"],\n  "reply": "For Ladakh\'s extreme sub-zero winter temperatures, …"\n})',
          nodes: ["model", "show_products", "gate", "catalog"],
          edges: ["model-show_products", "show_products-gate", "catalog-gate"],
        },
        {
          title: "Cards, then the reply",
          description: "Eight cards stream to the browser, then the reply. The numbered list of what was shown is kept in session memory for the next turns.",
          code: "For Ladakh's extreme sub-zero winter temperatures, the TrekNorth Summit Down Jacket offers extreme warmth and waterproofing, while fleece options work well as mid-layers.",
          nodes: ["gate", "cards", "api", "reply", "memory"],
          edges: ["gate-cards", "api-reply"],
        },
      ],
    },
    {
      tab: "Turn 2 · Refine",
      message: "only waterproof ones",
      summary: "2 model calls · 3.8 s · $0.008",
      traceUrl:
        "https://cloud.langfuse.com/project/cmus314rs0f4sad0c0vp141i2/traces/280044e44ff2d2fa57b18f22cc689b01?observation=fbb14bf6c65eb58e&timestamp=2026-10-05T10%3A10%3A15.808Z&traceId=280044e44ff2d2fa57b18f22cc689b01&view=graph",
      steps: [
        {
          title: "Three words, read with the history",
          description: "On its own the message says little. The model reads it against turn 1, which is in the session's history.",
          code: "only waterproof ones",
          nodes: ["message", "api", "model", "memory"],
          edges: ["message-api", "api-model", "memory-model"],
        },
        {
          title: "Model call 1: the same search, plus one filter",
          description: "Everything from turn 1's search is kept. The marked line is new.",
          code: 'search_products({\n  "query": "Ladakh winter trekking jacket extreme warmth",\n  "category": "jackets",\n  "size": "L",\n  "price_max": 8000,\n+ "attributes": [{"name": "waterproof", "any_of": ["true"]}]\n})',
          nodes: ["model", "search_products"],
          edges: ["model-search_products"],
        },
        {
          title: "58 matches, all waterproof",
          description: "The extra filter narrows 163 matches to 58, and down jackets now lead the list.",
          code: '{"total_matches": 58, "results": [\n  {"id": "JKT-00230", "title": "TrekNorth Summit Down Jacket", … "waterproof": true …},\n  {"id": "JKT-00011", "title": "TrekNorth Pamir Down Jacket", … "waterproof": true …},\n  {"id": "JKT-00279", "title": "TrekNorth Basecamp Down Jacket", … "waterproof": true …},\n  …\n]}',
          nodes: ["search_products", "sql", "keyword", "meaning", "merge", "brand", "top", "catalog"],
          edges: ["search_products-search", "search-catalog"],
        },
        {
          title: "Model call 2: show eight products",
          description: "The gate checks the eight IDs against the catalog again before any card is built.",
          code: 'show_products({\n  "product_ids": ["JKT-00230", "JKT-00017", "JKT-00061", "JKT-00279", "JKT-00125", "JKT-00011", "JKT-00014", "JKT-00252"],\n  "headline": "Waterproof Winter Jackets in Size L under ₹8,000",\n  "suggestions": ["Extreme warmth only", "Under ₹5,000", "Show down jackets"],\n  …\n})',
          nodes: ["model", "show_products", "gate", "catalog"],
          edges: ["model-show_products", "show_products-gate", "catalog-gate"],
        },
        {
          title: "Cards, then the reply",
          description: "The new cards replace the old ones, and the shown list in memory is updated.",
          code: "Here are waterproof jackets suitable for harsh cold conditions. The down options with extreme warmth are best suited for winter in Ladakh.",
          nodes: ["gate", "cards", "api", "reply", "memory"],
          edges: ["gate-cards", "api-reply"],
        },
      ],
    },
    {
      tab: "Turn 3 · Compare",
      message: "Compare the first two",
      summary: "2 model calls · 3.0 s · $0.010",
      traceUrl:
        "https://cloud.langfuse.com/project/cmus314rs0f4sad0c0vp141i2/traces/6526219509c37ee5d6c7bc852394f6e2?observation=b3d14b05e4938ccb&timestamp=2026-10-05T10%3A10%3A19.582Z&traceId=6526219509c37ee5d6c7bc852394f6e2",
      steps: [
        {
          title: "\"The first two\" needs memory",
          description: "The numbered list of what turn 2 showed is in the history, so the model knows which products are first and second.",
          code: 'Compare the first two\n\n{"shown": [\n  {"position": 1, "id": "JKT-00230", "title": "TrekNorth Summit Down Jacket"},\n  {"position": 2, "id": "JKT-00017", "title": "UrbanLayer Pamir Down Jacket"},\n  …\n]}',
          nodes: ["message", "api", "model", "memory"],
          edges: ["message-api", "api-model", "memory-model"],
        },
        {
          title: "Model call 1: compare by ID",
          description: "No new search: the model passes the two IDs, and the tool reads both rows from the catalog.",
          code: 'compare_products({"product_ids": ["JKT-00230", "JKT-00017"]})',
          nodes: ["model", "compare_products", "catalog"],
          edges: ["model-compare_products", "compare_products-catalog"],
        },
        {
          title: "Only the weight differs",
          description: "The tool returns both products and names the attributes whose values differ.",
          code: '{"products": [\n  {"id": "JKT-00230", "title": "TrekNorth Summit Down Jacket", "price": 7809, … "weight_g": 962 …},\n  {"id": "JKT-00017", "title": "UrbanLayer Pamir Down Jacket", "price": 4429, … "weight_g": 401 …}\n], "differing_attributes": ["weight_g"], "not_found": []}',
          nodes: ["compare_products", "catalog"],
          edges: ["compare_products-catalog"],
        },
        {
          title: "Model call 2: a text reply",
          description: "Nothing new to show, so there are no cards. The reply uses the prices and weights the tool returned.",
          code: "Both are waterproof down jackets with extreme warmth for men. The TrekNorth Summit Down Jacket weighs 962 g and costs ₹7,809, while the UrbanLayer Pamir Down Jacket is lighter at 401 g and costs less at ₹4,429.",
          nodes: ["model", "api", "reply"],
          edges: ["api-reply"],
        },
      ],
    },
  ] satisfies Turn[],

  features: {
    heading: "What's inside",
    line: null as string | null,
    cards: [
      { icon: "Cpu", title: "Any of three model providers", text: "One tool-calling loop runs on Anthropic, OpenAI or Gemini, chosen by configuration." },
      { icon: "ShieldCheck", title: "Grounded by design", text: "The model picks which products to show. Cards are built on the server from catalog rows, never from model text." },
      { icon: "Search", title: "Hybrid search", text: "SQL filters for hard limits, then keyword and meaning-based rankings merged into one, with at most 3 products per brand." },
      { icon: "Languages", title: "Hinglish", text: "Write Hindi in Latin script. The agent maps it to catalog terms and replies in the same language." },
      { icon: "Activity", title: "Traced end to end", text: "Every turn is an OpenTelemetry trace with each model call, tool call, token count and cost." },
      { icon: "Gauge", title: "Safe as a public demo", text: "Rate limits, a daily budget and a human check keep visitors from running up the bill." },
    ] satisfies { icon: IconName; title: string; text: string }[],
  },

  evidence: {
    heading: "Measured, not claimed",
    line: null as string | null,
    tiles: [
      { label: "Grounding violations", value: "0" },
      { label: "Eval cases passed, 3 providers", value: "59 / 60" },
      { label: "Cost per turn, from", value: "$0.005" },
      { label: "Search time", value: "≈12 ms" },
    ],
    note: {
      title: "Tuned by measurement",
      text: "The first eval run scored 17 of 20 on one provider, with 4 grounding violations. Prompt and tool-description changes alone, one per commit and each rerun on all three providers, brought it to 20 of 20 and zero.",
      link: "Read the evaluation",
      url: `${REPOSITORY}#evaluation`,
    },
  },

  closing: { heading: "Now try it yourself", line: "Ask for anything in the catalog and see how it answers.", cta: "Talk to Saathi" },

  footer: { text: "A demo project. The catalog is synthetic.", github: "GitHub" },
};
