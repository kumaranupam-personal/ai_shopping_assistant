CREATE TABLE products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    mrp INTEGER NOT NULL,
    rating REAL NOT NULL,
    review_count INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    sizes TEXT NOT NULL,       -- JSON list
    colors TEXT NOT NULL,      -- JSON list
    attributes TEXT NOT NULL,  -- JSON object
    tags TEXT NOT NULL,        -- JSON list
    description TEXT NOT NULL,
    image_url TEXT NOT NULL
);

CREATE INDEX products_category ON products (category);
CREATE INDEX products_price ON products (price);

CREATE VIRTUAL TABLE products_fts USING fts5 (
    title, brand, tags, description,
    content = 'products',
    content_rowid = 'rowid'
);
