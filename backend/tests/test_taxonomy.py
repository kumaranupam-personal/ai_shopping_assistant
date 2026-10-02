import pytest

from app.catalog.taxonomy import CATEGORIES, UNIT_SUFFIXES, attribute_label, format_attribute_value

EXPECTED_CATEGORIES = {
    "jackets", "shoes", "phones", "laptops", "backpacks", "watches", "kurtas", "kitchen_appliances",
}


def test_all_categories_present():
    assert set(CATEGORIES) == EXPECTED_CATEGORIES


@pytest.mark.parametrize("category", CATEGORIES.values(), ids=lambda c: c.name)
def test_card_attributes_are_category_attributes(category):
    names = [a.name for a in category.attributes]
    assert len(names) == len(set(names))
    assert len(category.card_attributes) == 3
    assert set(category.card_attributes) <= set(names)


@pytest.mark.parametrize("category", CATEGORIES.values(), ids=lambda c: c.name)
def test_numeric_attributes_carry_a_unit(category):
    for attr in category.attributes:
        if attr.kind in ("int", "decimal"):
            assert any(attr.name.endswith(s) for s in UNIT_SUFFIXES), attr.name


CASES = [
    ("weight_g", 650, "weight", "650 g"),
    ("weight_kg", 1.4, "weight", "1.4 kg"),
    ("ram_gb", 8, "ram", "8 GB"),
    ("battery_mah", 5000, "battery", "5000 mAh"),
    ("screen_in", 15.6, "screen", "15.6 inches"),
    ("camera_mp", 50, "camera", "50 MP"),
    ("water_resistance_m", 0, "water resistance", "0 m"),
    ("power_w", 1200, "power", "1200 W"),
    ("capacity_l", 0.5, "capacity", "0.5 L"),
    ("warranty_years", 2, "warranty", "2 years"),
    ("type", "air_fryer", "type", "air fryer"),
    ("sleeve", "three-quarter", "sleeve", "three-quarter"),
    ("waterproof", True, "waterproof", "yes"),
    ("has_5g", False, "has 5g", "no"),
]


@pytest.mark.parametrize(("name", "value", "label", "formatted"), CASES)
def test_display_rules(name, value, label, formatted):
    assert attribute_label(name) == label
    assert format_attribute_value(name, value) == formatted


def test_display_cases_cover_every_unit_suffix():
    covered = {s for name, *_ in CASES for s in UNIT_SUFFIXES if name.endswith(s)}
    assert covered == set(UNIT_SUFFIXES)
