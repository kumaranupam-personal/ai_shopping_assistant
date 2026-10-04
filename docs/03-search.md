# Search

## Interface

`search_products(index, query, filters, sort, limit) -> dict`, returning the result shape below, defined in `app/search/engine.py`. It is synchronous, deterministic and has no LLM calls. Invalid `sort` or `limit` values raise an error.

- `index`: the search index loaded at startup (see Index loading).
- `query`: a natural-language description of the need. It may be empty.
- `filters`: an object whose fields are all optional:
  - `category`: one category name from the taxonomy in `02-catalog.md`.
  - `price_min` and `price_max`: integer rupees, inclusive.
  - `brand`: a list of brands. A product matches if its brand is in the list, compared case-insensitively.
  - `size`: one size string from the category's sizes, or from any category's sizes when no category is given. A product matches if the value is in its `sizes`.
  - `color`: one color. A product matches if the value is in its `colors`.
  - `min_rating`: a decimal. A product matches if its `rating` is at least this value.
  - `in_stock_only`: boolean. Default true. If true, `stock` must be greater than 0.
  - `attributes`: a map from attribute name to a condition. For text and boolean attributes, the condition is a single value (exact match) or a list of values (match any). For numeric attributes, it's a single number (exact match) or an object with optional `min` and `max`, both inclusive. Attribute names are checked against the category's attributes, so attribute filters need `category`. Without it, they're ignored with a warning.
- `sort`: `relevance` (the default), `price_asc`, `price_desc` or `rating` (highest first). With any sort other than `relevance`, `query` is ignored and the results are the filter matches in that order.
- `limit`: 1 to 20. Default 10.

Unknown categories, sizes, colors, attribute names or attribute values do not raise an exception. They are reported in `warnings` and that condition is ignored. This lets the agent recover from a bad guess. Brands aren't part of the taxonomy, so an unknown brand isn't a warning; it simply matches nothing.

## Result shape

```json
{
  "total_matches": 37,
  "results": [
    {
      "id": "JKT-00012", "title": "...", "brand": "...", "price": 7499, "mrp": 11999,
      "rating": 4.4, "review_count": 1832, "in_stock": true,
      "sizes": ["S", "M", "L"], "colors": ["black"], "attributes": {"type": "down"}
    }
  ],
  "warnings": ["unknown attribute 'insulation' for category 'jackets' ignored"]
}
```

`total_matches` counts every product that passes the filters, before `limit` is applied. `warnings` is always present and may be empty. `category`, `stock`, `description`, `tags` and `image_url` are left out to keep tool results small, and `in_stock` replaces `stock`.

## Pipeline

1. **Filter.** Build one SQL query from `filters` and collect the matching product IDs as the candidate set. If the set is empty, return `total_matches` 0 and no results.
2. **Rank without a query.** If `sort` is not `relevance`, or `query` is empty or only whitespace, sort the candidates by the chosen order, using `rating` highest first for `relevance` with an empty query. Ties are broken by `review_count` descending and then by `id`. Skip to step 6.
3. **Keyword list.** Turn the query into an FTS5 expression. Lowercase it, keep only alphanumeric tokens, drop a fixed English stopword list, wrap each remaining token in double quotes so FTS5 never reads it as an operator, and join them with OR. Take the top 50 candidates by FTS5 `bm25()`. If no tokens remain, the keyword list is empty.
4. **Vector list.** Embed the query with the same model used to build the index, normalize it, and score the candidates by dot product. Take the top 50.
5. **Fuse.** Combine the two lists with reciprocal rank fusion: each product's score is the sum of `1 / (60 + rank)` over the lists it appears in, where `rank` starts at 1. Sort by score descending, breaking ties by `rating` highest first and then `id`. Only products from the two lists take part.
6. **Diversify.** When `sort` is `relevance`, including the empty-query case, allow at most 3 products per brand, compared case-insensitively, in the returned page. Walk the ranked list in order, taking a product unless its brand already has 3, and append the skipped products after the rest in their original order.
7. **Truncate** to `limit`.

## Index loading

`app/search/index.py` loads everything once at server startup: it opens the database, loads the embedding matrix and ID list into memory, and loads the embedding model. Startup fails with a message naming the commands in `01-architecture.md` that fix the problem if any catalog file in `DATA_DIR` is missing, or if the IDs in `embedding_ids.json` don't exactly match the product IDs in `catalog.db`, which means embedding wasn't rerun after an ingestion.

## Performance target

Without the network, a search takes under 50 ms at p95 on a laptop for the demo catalog size in `02-catalog.md`. Embedding the query takes most of that time.
