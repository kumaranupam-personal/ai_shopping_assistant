# Overview

## Purpose

A web app where a user describes what they want to buy in natural language, converses with an AI shopping agent, and sees matching products from the catalog as cards. The project ships with a pre-generated synthetic demo catalog, and any catalog that follows the product schema can be ingested instead. The agent understands intent, searches the catalog, shows results, and refines them across turns.

## Goals

- Turn free-form intent ("warm jacket for a Ladakh trek in December, under ₹8k") into a structured catalog search.
- Support multi-turn refinement ("cheaper", "only waterproof", "show the second one", "compare the first two").
- Ask a clarifying question only when a request is too vague to search.
- Show results as product cards rendered from catalog data, never from model-written text.
- Understand and reply in Hinglish as well as English.
- Stay independent of any one LLM provider, with the provider chosen by configuration.
- Be measurable: an eval suite reports pass rate, grounding violations and latency.

## Non-goals

- Real payments, checkout, cart, user accounts or authentication.
- Live product-feed integration, real-world brands or real product imagery.
- Production deployment, horizontal scaling or persistent sessions across server restarts.
- Personalization from user history.
- Switching LLM providers in the middle of a conversation.
- Devanagari script and languages other than English and Hinglish.

## Example conversation

1. User: "I'm going trekking in Ladakh in December, need a jacket under 8k, size L."
2. Agent searches jackets with price at most 8000, size L, and the query "warm jacket for high-altitude winter trekking". It shows 6 cards and replies briefly with refinement suggestions.
3. User: "only waterproof ones"
4. Agent repeats the search with the waterproof attribute added and shows the new cards.
5. User: "compare the first two"
6. Agent compares the first two products from the last shown list and summarizes the differences.
7. User: "aur sasta dikhao" ("show cheaper").
8. Agent lowers the price limit, shows new cards and replies in Hinglish.

## Glossary

- **Intent**: what the user wants, expressed as a category, hard filters, a semantic query and soft preferences.
- **Hard filter**: a constraint every result must satisfy (price range, size, category, attribute value). It is applied in SQL.
- **Soft preference**: a desirable quality that influences ranking but does not exclude items ("lightweight", "stylish"). It goes into the semantic query.
- **Grounding**: the rule that every product fact the user sees comes from the catalog. It's defined in `01-architecture.md`.
- **Refinement**: a follow-up turn that modifies the previous search instead of starting a new one.
- **Relaxation**: dropping or loosening a constraint when a search returns nothing, and telling the user what was loosened.
- **Hinglish**: Hindi written in Latin script, mixed with English ("shaadi ke liye kurta, 3k tak").
- **Shown list**: the ordered products most recently displayed to the user. Ordinal references ("the second one") resolve against it.

## Doc map

Each fact lives in exactly one document. Other documents refer to it by name.

- `01-architecture.md`: components, request flow, grounding principle, tech stack, repo layout, configuration variables and defaults, local commands.
- `02-catalog.md`: product schema, taxonomy and card attributes, ingestion, embedding, database schema, currency format, demo data generation.
- `03-search.md`: search inputs, filter semantics, result shape, ranking pipeline, index loading, performance target.
- `04-agent.md`: turn loop, agent behaviors, tool definitions, conversation state, session rules, error handling.
- `05-api.md`: endpoints, stream events, product card shape, status text, error codes.
- `06-frontend.md`: stack, layout and resizing, visual design, UI states, components, accessibility, client state, session lifecycle, stream handling, quality bar.
- `07-evaluation.md`: automated tests, eval cases, grounding check, metrics and targets.
- `08-roadmap.md`: build order, done criteria, stretch goals.
- `09-llm-providers.md`: provider interface, boundary rules, registry, per-provider adapter details.
