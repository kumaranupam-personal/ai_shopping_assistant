# Catalog

The app serves any catalog that follows the product schema and taxonomy below. Products enter through ingestion, which reads a JSONL file. The demo data generator, described at the end of this doc, is one producer of that file.

## Product schema

```json
{
  "id": "JKT-00012",
  "title": "TrekNorth Summit 800 Down Jacket",
  "brand": "TrekNorth",
  "category": "jackets",
  "price": 7499,
  "mrp": 11999,
  "rating": 4.4,
  "review_count": 1832,
  "stock": 42,
  "sizes": ["S", "M", "L", "XL"],
  "colors": ["black", "navy"],
  "attributes": {"type": "down", "warmth": "extreme", "waterproof": true, "weight_g": 650, "gender": "men"},
  "tags": ["winter", "trekking", "high-altitude"],
  "description": "Rated for sub-zero temperatures...",
  "image_url": "https://example.com/images/JKT-00012.jpg"
}
```

Field rules (ingestion enforces all of them):

- `id`: unique, 1 to 32 characters from letters, digits, hyphen and underscore.
- `title` and `brand`: non-blank, at most 120 and 60 characters.
- `category`: a category from the taxonomy.
- `price` and `mrp`: positive integer rupees, with `mrp` greater than or equal to `price`.
- `rating`: 0.0 to 5.0 with one decimal place.
- `review_count` and `stock`: non-negative integers. A `stock` of 0 means out of stock.
- `sizes`: one or more distinct values from the category's sizes, or an empty list when the category has none.
- `colors`: 1 to 4 distinct values from the taxonomy's color list.
- `attributes`: exactly the category's attributes, each with an allowed value.
- `tags`: 0 to 10 non-empty lowercase strings.
- `description`: non-blank, at most 1000 characters.
- `image_url`: optional. When present, an `http` or `https` URL.
- Any other field rejects the line.

## Taxonomy

`app/catalog/taxonomy.py` encodes this taxonomy. Ingestion, search warnings, card highlights and the agent's category list all read it from there.

Colors: black, white, grey, navy, blue, red, green, olive, brown, beige, pink, maroon, yellow, silver, gold.

Each category lists its sizes, its attributes with allowed values, and the attributes shown on product cards.

Value rules:

- Sizes are exact strings. Apparel uses `S`, `M`, `L`, `XL` and `XXL`. Shoes use `UK 6`, `UK 7`, `UK 8`, `UK 9`, `UK 10` and `UK 11`.
- Text attributes take one of the listed lowercase values. Boolean attributes take JSON `true` or `false`. Integer attributes take whole numbers. Decimal attributes take numbers with at most one decimal place.
- An attribute name ending in a unit suffix carries that unit: `_g` (g), `_kg` (kg), `_gb` (GB), `_mah` (mAh), `_in` (inches), `_mp` (MP), `_m` (m), `_w` (W), `_l` (L) and `_years` (years).

Display rules, which format every attribute label and value the API returns. Product cards shorten the result further, as `06-frontend.md` describes:

- The label is the attribute name without its unit suffix, with underscores replaced by spaces. For example, `water_resistance_m` becomes "water resistance".
- Text values have underscores replaced by spaces, so `air_fryer` becomes "air fryer". Booleans become "yes" or "no". Numbers are followed by a space and the unit, as in "8 GB", "5000 mAh" and "2 years".

### jackets

- Sizes S, M, L, XL, XXL.
- `type`: down, fleece, windcheater, rain, denim, leather.
- `warmth`: light, moderate, high, extreme.
- `waterproof`: boolean.
- `weight_g`: integer, 250 to 1500.
- `gender`: men, women, unisex.
- Card attributes: type, warmth, waterproof.

### shoes

- Sizes UK 6 to UK 11, as listed in the value rules.
- `type`: running, trekking, casual, formal, sandals.
- `gender`: men, women, unisex.
- `waterproof`: boolean.
- `sole`: rubber, eva, pu.
- Card attributes: type, waterproof, sole.

### phones

- No sizes.
- `ram_gb`: 4, 6, 8, 12, 16.
- `storage_gb`: 64, 128, 256, 512.
- `battery_mah`: integer, 4000 to 6500.
- `screen_in`: decimal, 6.1 to 6.9.
- `camera_mp`: 12, 48, 50, 64, 108, 200.
- `has_5g`: boolean.
- Card attributes: ram_gb, storage_gb, battery_mah.

### laptops

- No sizes.
- `use`: student, business, gaming, creator.
- `cpu_tier`: entry, mid, high.
- `ram_gb`: 8, 16, 32.
- `storage_gb`: 256, 512, 1024.
- `screen_in`: 13.3, 14, 15.6, 16.
- `weight_kg`: decimal, 1.0 to 2.8.
- `gpu`: integrated, dedicated.
- Card attributes: use, ram_gb, storage_gb.

### backpacks

- No sizes.
- `use`: daily, travel, trekking, laptop.
- `capacity_l`: integer, 15 to 70.
- `waterproof`: boolean.
- `laptop_compartment`: boolean.
- Card attributes: use, capacity_l, waterproof.

### watches

- No sizes.
- `type`: analog, digital, smartwatch.
- `gender`: men, women, unisex.
- `strap`: leather, metal, silicone, fabric.
- `water_resistance_m`: 0, 30, 50, 100.
- Card attributes: type, strap, water_resistance_m.

### kurtas

- Sizes S, M, L, XL, XXL.
- `gender`: men, women.
- `fabric`: cotton, linen, silk, rayon, khadi.
- `occasion`: daily, office, festive, wedding.
- `sleeve`: full, three-quarter, short.
- Card attributes: fabric, occasion, sleeve.

### kitchen_appliances

- No sizes.
- `type`: mixer_grinder, air_fryer, induction_cooktop, electric_kettle, microwave, toaster.
- `power_w`: integer, 600 to 2500.
- `capacity_l`: decimal, 0.5 to 30.
- `warranty_years`: 1, 2, 3, 5.
- Card attributes: type, power_w, warranty_years.

## Ingestion

`app.catalog.ingest <path>` loads a product file into the catalog store.

- Input is UTF-8 JSONL with one product per line.
- Every line is checked against the field rules and the taxonomy. Lines that fail are written to `ingest_rejects.jsonl` in `DATA_DIR`, which is replaced on every run, each with its line number and the reasons.
- If any line is rejected and `--allow-rejects` isn't passed, the command exits with an error and leaves the existing `catalog.db` untouched. With `--allow-rejects`, the valid lines are loaded and the rejected ones skipped.
- The new `catalog.db` is built in a temporary file and then renamed into `DATA_DIR`, so a failed run never leaves a half-written catalog.
- It prints a summary with loaded and rejected counts per category.
- Ingestion replaces the whole catalog. `app.catalog.embed` must run after it.

## Embedding

`app.catalog.embed` embeds each product's text with the embedding model named in `01-architecture.md`. The text is the title, then the description, then the tags joined by spaces. It writes `embeddings.npy`, a float32 array of L2-normalized vectors with one row per product in `id` order, and `embedding_ids.json`, the matching list of IDs.

## Database schema

- Table `products` has one column per schema field. `id` is the primary key. `sizes`, `colors`, `attributes` and `tags` are stored as JSON text.
- There are indexes on `category` and on `price`.
- The virtual table `products_fts` uses FTS5 over `title`, `brand`, `tags` and `description`. It is an external-content table backed by `products`, and its rowid is the `products` rowid.

## Currency format

All rupee amounts shown to the user, both in agent prose and in the UI, use the `₹` symbol, Indian digit grouping and no decimals. For example, ₹7,499 and ₹1,24,999.

## Demo data

`backend/demo/` generates the demo catalog. It isn't part of the runtime app and nothing in `app/` imports it.

- `demo.generate` uses only Python code, with no LLM calls. It seeds its random number generator with 42, so every run produces the same file, and it writes `demo/products.jsonl`. The output must pass ingestion with zero rejects.
- It produces 300 products per category, 2400 in total, with 6 synthetic brands per category. Brand lists, title patterns, description templates and tag rules live in `demo/templates/`.
- IDs are a category prefix, a hyphen and a 5-digit sequence number starting at 00001 within each category. The prefixes are JKT for jackets, SHO for shoes, PHN for phones, LAP for laptops, BAG for backpacks, WCH for watches, KRT for kurtas and KIT for kitchen_appliances.
- Price ranges in rupees: jackets 799 to 14999, shoes 499 to 12999, phones 6999 to 89999, laptops 24999 to 189999, backpacks 399 to 7999, watches 499 to 29999, kurtas 399 to 6999, kitchen_appliances 799 to 24999. Within those ranges, narrower price bands by spec (RAM for phones, use for laptops, type for jackets, shoes and kitchen appliances, occasion for kurtas) keep prices consistent with what each product is. Prices end in 9.
- About 70% of products are discounted, by 5% to 60%.
- Ratings follow a normal curve centered at 4.1, kept between 1.0 and 5.0, so most fall between 3.5 and 4.7. `review_count` ranges from 0 to 25000 and is positively correlated with rating.
- About 8% of products have `stock` 0.
- Tags are derived from attributes by fixed rules. For example, jackets with `warmth` set to `extreme` get `winter`, `trekking` and `high-altitude`.
- Descriptions are 2 to 4 sentences built from category templates filled with attribute values, and they never contradict `attributes`.
- Products have no `image_url`, because the demo has no real product imagery.
- Attribute values within a product are plausible. For example, smartwatches never have a 0 m water rating, gaming laptops always have a dedicated GPU, and a down jacket's warmth is high or extreme.
