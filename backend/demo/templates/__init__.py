"""Generator data for the demo catalog (docs/02-catalog.md, Demo data).

Per category:
- prefix, price: ID prefix and the (min, max) price range in rupees.
- price_by: optional narrower price ranges by attribute value, inside `price`.
- brands, models, title: words and the pattern for product titles.
- names: optional title wording for specific attribute values.
- sentences: description sentences; placeholders are `brand` and attribute names.
- bool_sentences: (true, false) sentence pair for each boolean attribute.
- tags: attribute -> value -> tags added when the product has that value.
- rules: (conditions, constraints) plausibility rules. When every condition
  matches, each constrained attribute takes a value from the list, or from the
  (min, max) tuple range.
"""

TEMPLATES = {
    "jackets": {
        "prefix": "JKT",
        "price": (799, 14999),
        "price_by": {"type": {"down": (2999, 14999), "fleece": (999, 5999), "windcheater": (799, 3999),
                              "rain": (799, 4999), "denim": (1499, 5999), "leather": (4999, 14999)}},
        "brands": ["TrekNorth", "Himfrost", "AltiGear", "Snowline", "UrbanLayer", "Monsoonwear"],
        "models": ["Summit", "Ridge", "Glacier", "Basecamp", "Pamir", "Zanskar"],
        "title": "{brand} {model} {type} Jacket",
        "sentences": [
            "A {type} jacket with {warmth} warmth.",
            "Weighs {weight_g}, so it packs easily into a daypack.",
            "It balances comfort and durability for daily wear.",
            "Built by {brand} for dependable everyday layering.",
        ],
        "bool_sentences": {
            "waterproof": ("The waterproof shell keeps rain and snow out.", "It isn't waterproof, so pair it with a shell in heavy rain."),
        },
        "tags": {
            "type": {"down": ["insulated"], "fleece": ["layering"], "windcheater": ["windproof", "running"],
                     "rain": ["monsoon", "rain"], "denim": ["casual"], "leather": ["biker", "casual"]},
            "warmth": {"extreme": ["winter", "trekking", "high-altitude"], "high": ["winter"], "light": ["summer"]},
            "waterproof": {True: ["waterproof"]},
        },
        "rules": [
            ({"type": "down"}, {"warmth": ["high", "extreme"], "weight_g": (400, 1000)}),
            ({"type": "fleece"}, {"warmth": ["moderate", "high"], "waterproof": [False]}),
            ({"type": "windcheater"}, {"warmth": ["light"], "weight_g": (250, 500)}),
            ({"type": "rain"}, {"warmth": ["light", "moderate"], "waterproof": [True], "weight_g": (250, 600)}),
            ({"type": "denim"}, {"warmth": ["light", "moderate"], "waterproof": [False]}),
            ({"type": "leather"}, {"warmth": ["moderate", "high"], "waterproof": [False]}),
        ],
    },
    "shoes": {
        "prefix": "SHO",
        "price": (499, 12999),
        "price_by": {"type": {"running": (1499, 9999), "trekking": (1999, 12999), "casual": (999, 5999),
                              "formal": (999, 7999), "sandals": (499, 2999)}},
        "brands": ["StrideX", "TrailKing", "UrbanStep", "Footcraft", "MonsoonGrip", "PaceOne"],
        "models": ["Glide", "Apex", "Terra", "Metro", "Classic", "Breeze"],
        "title": "{brand} {model} {type}",
        "names": {"type": {"running": "Running Shoes", "trekking": "Trekking Shoes", "casual": "Casual Sneakers",
                           "formal": "Formal Shoes", "sandals": "Sandals"}},
        "sentences": [
            "Everyday {type} footwear from {brand}.",
            "Its {sole} outsole gives steady grip on everyday surfaces.",
            "The cushioned insole keeps you comfortable all day.",
            "Lightweight build that doesn't tire your feet.",
        ],
        "bool_sentences": {
            "waterproof": ("Waterproof uppers keep your feet dry in puddles.", "It isn't waterproof, so avoid deep puddles."),
        },
        "tags": {
            "type": {"running": ["running", "sports", "gym"], "trekking": ["trekking", "hiking", "outdoor"],
                     "casual": ["casual", "everyday"], "formal": ["office", "formal"], "sandals": ["summer", "casual"]},
            "waterproof": {True: ["waterproof", "monsoon"]},
        },
        "rules": [
            ({"type": "running"}, {"sole": ["eva"], "waterproof": [False]}),
            ({"type": "trekking"}, {"sole": ["rubber"]}),
            ({"type": "formal"}, {"sole": ["rubber", "pu"], "waterproof": [False]}),
            ({"type": "sandals"}, {"sole": ["eva", "rubber"], "waterproof": [True]}),
        ],
    },
    "phones": {
        "prefix": "PHN",
        "price": (6999, 89999),
        "price_by": {"ram_gb": {4: (6999, 12999), 6: (9999, 19999), 8: (14999, 34999), 12: (24999, 59999),
                                16: (39999, 89999)}},
        "brands": ["Novaphone", "Zentrix", "Pixelon", "Aurora", "Kirin", "Vyom"],
        "models": ["Neo", "Spark", "Nova", "Pulse", "Orbit", "Zen"],
        "title": "{brand} {model} ({ram_gb} RAM, {storage_gb})",
        "sentences": [
            "It pairs {ram_gb} of RAM with {storage_gb} of storage.",
            "The {battery_mah} battery comfortably lasts a full day.",
            "The {camera_mp} main camera captures sharp, detailed photos.",
            "Its display measures {screen_in} diagonally.",
        ],
        "bool_sentences": {"has_5g": ("It supports 5G networks.", "It supports 4G networks only.")},
        "tags": {
            "ram_gb": {12: ["gaming", "flagship"], 16: ["gaming", "flagship"]},
            "camera_mp": {108: ["camera", "photography"], 200: ["camera", "photography"]},
            "has_5g": {True: ["5g"]},
        },
        "rules": [
            ({"ram_gb": 4}, {"storage_gb": [64, 128], "has_5g": [False]}),
            ({"ram_gb": 6}, {"storage_gb": [128, 256]}),
            ({"ram_gb": 8}, {"storage_gb": [128, 256], "has_5g": [True]}),
            ({"ram_gb": 12}, {"storage_gb": [256, 512], "has_5g": [True]}),
            ({"ram_gb": 16}, {"storage_gb": [256, 512], "has_5g": [True]}),
        ],
    },
    "laptops": {
        "prefix": "LAP",
        "price": (24999, 189999),
        "price_by": {"use": {"student": (24999, 59999), "business": (39999, 109999), "gaming": (59999, 189999),
                             "creator": (79999, 189999)}},
        "brands": ["Corebook", "Lumen", "Vertex", "Quanta", "Aeon", "Stratos"],
        "models": ["Air", "Pro", "Blade", "Swift", "Studio", "Edge"],
        "title": "{brand} {model} {use} Laptop",
        "sentences": [
            "A {use} laptop with a {cpu_tier}-tier processor.",
            "It has {ram_gb} of RAM and {storage_gb} of SSD storage.",
            "The screen measures {screen_in}, with {gpu} graphics.",
            "It weighs {weight_kg}.",
        ],
        "bool_sentences": {},
        "tags": {
            "use": {"student": ["student", "college"], "business": ["office", "work"], "gaming": ["gaming"],
                    "creator": ["editing", "design"]},
            "gpu": {"dedicated": ["graphics"]},
        },
        "rules": [
            ({"use": "gaming"}, {"cpu_tier": ["mid", "high"], "ram_gb": [16, 32], "gpu": ["dedicated"],
                                 "screen_in": [15.6, 16], "weight_kg": (2.0, 2.8)}),
            ({"use": "creator"}, {"cpu_tier": ["high"], "ram_gb": [16, 32], "storage_gb": [512, 1024]}),
            ({"use": "student"}, {"cpu_tier": ["entry", "mid"], "ram_gb": [8, 16], "storage_gb": [256, 512],
                                  "gpu": ["integrated"]}),
            ({"use": "business"}, {"cpu_tier": ["mid", "high"], "ram_gb": [8, 16], "gpu": ["integrated"],
                                   "screen_in": [13.3, 14], "weight_kg": (1.0, 1.6)}),
        ],
    },
    "backpacks": {
        "prefix": "BAG",
        "price": (399, 7999),
        "brands": ["Packwise", "TrailCarry", "Commuto", "NomadGear", "Himpack", "UrbanSling"],
        "models": ["Voyager", "Ascent", "Metro", "Explorer", "Ridge", "Nova"],
        "title": "{brand} {model} {capacity_l} {use} Backpack",
        "sentences": [
            "A {capacity_l} {use} backpack from {brand}.",
            "Padded shoulder straps spread the load evenly.",
            "Multiple pockets keep small items organised.",
        ],
        "bool_sentences": {
            "waterproof": ("Waterproof fabric protects your things in the rain.", "It isn't waterproof, so use a rain cover in heavy rain."),
            "laptop_compartment": ("A padded compartment holds your laptop.", "It has no dedicated laptop compartment."),
        },
        "tags": {
            "use": {"daily": ["college", "everyday"], "travel": ["travel"], "trekking": ["trekking", "hiking", "outdoor"],
                    "laptop": ["office", "laptop"]},
            "waterproof": {True: ["waterproof", "monsoon"]},
        },
        "rules": [
            ({"use": "daily"}, {"capacity_l": (15, 30)}),
            ({"use": "travel"}, {"capacity_l": (30, 55)}),
            ({"use": "trekking"}, {"capacity_l": (35, 70)}),
            ({"use": "laptop"}, {"capacity_l": (20, 35), "laptop_compartment": [True]}),
        ],
    },
    "watches": {
        "prefix": "WCH",
        "price": (499, 29999),
        "brands": ["Chronex", "Tempo", "Horizon", "Kaal", "Vela", "Meridian"],
        "models": ["Classic", "Pulse", "Orbit", "Heritage", "Active", "Luxe"],
        "title": "{brand} {model} {type}",
        "names": {"type": {"analog": "Analog Watch", "digital": "Digital Watch", "smartwatch": "Smartwatch"}},
        "sentences": [
            "It comes with a comfortable {strap} strap.",
            "Its water resistance is rated at {water_resistance_m}.",
            "The clean dial is easy to read at a glance.",
            "{brand} backs it with dependable everyday build quality.",
        ],
        "bool_sentences": {},
        "tags": {
            "type": {"analog": ["classic", "formal"], "digital": ["sports"], "smartwatch": ["fitness", "smart"]},
            "water_resistance_m": {100: ["swimming"]},
        },
        "rules": [
            ({"type": "analog"}, {"strap": ["leather", "metal", "fabric"]}),
            ({"type": "digital"}, {"strap": ["silicone", "metal"], "water_resistance_m": [30, 50, 100]}),
            ({"type": "smartwatch"}, {"strap": ["silicone", "metal", "fabric"], "water_resistance_m": [30, 50, 100]}),
        ],
    },
    "kurtas": {
        "prefix": "KRT",
        "price": (399, 6999),
        "price_by": {"occasion": {"daily": (399, 1999), "office": (599, 2999), "festive": (999, 4999),
                                  "wedding": (1999, 6999)}},
        "brands": ["Rangsutra", "DesiLoom", "Utsav", "Kalakriti", "Taana", "Mehfil"],
        "models": ["Classic", "Royal", "Heritage", "Aangan", "Saanjh", "Noor"],
        "title": "{brand} {model} {fabric} Kurta for {gender}",
        "sentences": [
            "A {fabric} kurta with {sleeve} sleeves.",
            "It's styled for {occasion} wear.",
            "The relaxed fit stays comfortable through long days.",
            "Finished with neat stitching by {brand}.",
        ],
        "bool_sentences": {},
        "tags": {
            "occasion": {"wedding": ["wedding", "shaadi", "ethnic"], "festive": ["festive", "diwali", "ethnic"],
                         "office": ["office", "ethnic"], "daily": ["everyday", "ethnic"]},
            "fabric": {"cotton": ["summer"], "linen": ["summer"]},
        },
        "rules": [
            ({"occasion": "wedding"}, {"fabric": ["silk"]}),
            ({"occasion": "festive"}, {"fabric": ["silk", "rayon", "cotton"]}),
            ({"occasion": "office"}, {"fabric": ["cotton", "linen", "khadi"], "sleeve": ["full", "three-quarter"]}),
            ({"occasion": "daily"}, {"fabric": ["cotton", "linen", "khadi", "rayon"]}),
        ],
    },
    "kitchen_appliances": {
        "prefix": "KIT",
        "price": (799, 24999),
        "price_by": {"type": {"mixer_grinder": (1999, 7999), "air_fryer": (3999, 12999), "induction_cooktop": (1999, 6999),
                              "electric_kettle": (799, 2999), "microwave": (5999, 24999), "toaster": (999, 3999)}},
        "brands": ["RasoiPro", "Annapurna", "Kitchenmate", "Swaad", "Homeline", "Tava"],
        "models": ["Classic", "Turbo", "Smart", "Neo", "Prime", "Eco"],
        "title": "{brand} {model} {type}",
        "sentences": [
            "This {type} is rated at {power_w}.",
            "It has a capacity of {capacity_l}.",
            "{brand} covers it with a {warranty_years} warranty.",
            "It's easy to clean and simple to use.",
        ],
        "bool_sentences": {},
        "tags": {
            "type": {"mixer_grinder": ["mixer", "grinding"], "air_fryer": ["healthy", "frying"],
                     "induction_cooktop": ["cooking", "induction"], "electric_kettle": ["tea", "coffee"],
                     "microwave": ["baking", "reheating"], "toaster": ["breakfast"]},
        },
        "rules": [
            ({"type": "mixer_grinder"}, {"power_w": (600, 1000), "capacity_l": (0.5, 1.5)}),
            ({"type": "air_fryer"}, {"power_w": (1200, 1800), "capacity_l": (3.0, 6.0)}),
            ({"type": "induction_cooktop"}, {"power_w": (1600, 2200), "capacity_l": [0.5]}),
            ({"type": "electric_kettle"}, {"power_w": (1200, 1800), "capacity_l": (1.0, 2.0)}),
            ({"type": "microwave"}, {"power_w": (700, 1400), "capacity_l": (20.0, 30.0)}),
            ({"type": "toaster"}, {"power_w": (700, 1000), "capacity_l": [0.5]}),
        ],
    },
}
