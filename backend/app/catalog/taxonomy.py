"""Catalog taxonomy and display rules from docs/02-catalog.md."""

from dataclasses import dataclass
from typing import Literal

Kind = Literal["text", "bool", "int", "decimal"]


@dataclass(frozen=True)
class Attribute:
    name: str
    kind: Kind
    values: tuple = ()  # allowed values; empty means any value in [min, max]
    min: float | None = None
    max: float | None = None

    def allows(self, value) -> bool:
        """Whether `value` has this attribute's type and is an allowed value."""
        if self.kind == "bool":
            return isinstance(value, bool)
        if self.kind == "text":
            return isinstance(value, str) and value in self.values
        if isinstance(value, bool) or not isinstance(value, int if self.kind == "int" else (int, float)):
            return False
        if self.kind == "decimal" and round(value, 1) != value:
            return False
        if self.values:
            return value in self.values
        return (self.min is None or value >= self.min) and (self.max is None or value <= self.max)


@dataclass(frozen=True)
class Category:
    name: str
    sizes: tuple[str, ...]
    attributes: tuple[Attribute, ...]
    card_attributes: tuple[str, ...]

    def attribute(self, name: str) -> Attribute | None:
        return next((a for a in self.attributes if a.name == name), None)


def text(name: str, *values: str) -> Attribute:
    return Attribute(name, "text", values)


def boolean(name: str) -> Attribute:
    return Attribute(name, "bool")


def integer(name: str, *values: int, min: int | None = None, max: int | None = None) -> Attribute:
    return Attribute(name, "int", values, min, max)


def decimal(name: str, *values: float, min: float | None = None, max: float | None = None) -> Attribute:
    return Attribute(name, "decimal", values, min, max)


COLORS = (
    "black", "white", "grey", "navy", "blue", "red", "green", "olive",
    "brown", "beige", "pink", "maroon", "yellow", "silver", "gold",
)
APPAREL_SIZES = ("S", "M", "L", "XL", "XXL")
SHOE_SIZES = ("UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11")
GENDERS = ("men", "women", "unisex")

_CATEGORIES = (
    Category(
        "jackets",
        APPAREL_SIZES,
        (
            text("type", "down", "fleece", "windcheater", "rain", "denim", "leather"),
            text("warmth", "light", "moderate", "high", "extreme"),
            boolean("waterproof"),
            integer("weight_g", min=250, max=1500),
            text("gender", *GENDERS),
        ),
        ("type", "warmth", "waterproof"),
    ),
    Category(
        "shoes",
        SHOE_SIZES,
        (
            text("type", "running", "trekking", "casual", "formal", "sandals"),
            text("gender", *GENDERS),
            boolean("waterproof"),
            text("sole", "rubber", "eva", "pu"),
        ),
        ("type", "waterproof", "sole"),
    ),
    Category(
        "phones",
        (),
        (
            integer("ram_gb", 4, 6, 8, 12, 16),
            integer("storage_gb", 64, 128, 256, 512),
            integer("battery_mah", min=4000, max=6500),
            decimal("screen_in", min=6.1, max=6.9),
            integer("camera_mp", 12, 48, 50, 64, 108, 200),
            boolean("has_5g"),
        ),
        ("ram_gb", "storage_gb", "battery_mah"),
    ),
    Category(
        "laptops",
        (),
        (
            text("use", "student", "business", "gaming", "creator"),
            text("cpu_tier", "entry", "mid", "high"),
            integer("ram_gb", 8, 16, 32),
            integer("storage_gb", 256, 512, 1024),
            decimal("screen_in", 13.3, 14, 15.6, 16),
            decimal("weight_kg", min=1.0, max=2.8),
            text("gpu", "integrated", "dedicated"),
        ),
        ("use", "ram_gb", "storage_gb"),
    ),
    Category(
        "backpacks",
        (),
        (
            text("use", "daily", "travel", "trekking", "laptop"),
            integer("capacity_l", min=15, max=70),
            boolean("waterproof"),
            boolean("laptop_compartment"),
        ),
        ("use", "capacity_l", "waterproof"),
    ),
    Category(
        "watches",
        (),
        (
            text("type", "analog", "digital", "smartwatch"),
            text("gender", *GENDERS),
            text("strap", "leather", "metal", "silicone", "fabric"),
            integer("water_resistance_m", 0, 30, 50, 100),
        ),
        ("type", "strap", "water_resistance_m"),
    ),
    Category(
        "kurtas",
        APPAREL_SIZES,
        (
            text("gender", "men", "women"),
            text("fabric", "cotton", "linen", "silk", "rayon", "khadi"),
            text("occasion", "daily", "office", "festive", "wedding"),
            text("sleeve", "full", "three-quarter", "short"),
        ),
        ("fabric", "occasion", "sleeve"),
    ),
    Category(
        "kitchen_appliances",
        (),
        (
            text("type", "mixer_grinder", "air_fryer", "induction_cooktop", "electric_kettle", "microwave", "toaster"),
            integer("power_w", min=600, max=2500),
            decimal("capacity_l", min=0.5, max=30),
            integer("warranty_years", 1, 2, 3, 5),
        ),
        ("type", "power_w", "warranty_years"),
    ),
)

CATEGORIES: dict[str, Category] = {c.name: c for c in _CATEGORIES}

UNIT_SUFFIXES = {
    "_g": "g", "_kg": "kg", "_gb": "GB", "_mah": "mAh", "_in": "inches",
    "_mp": "MP", "_m": "m", "_w": "W", "_l": "L", "_years": "years",
}


def _split_unit(name: str) -> tuple[str, str | None]:
    for suffix, unit in UNIT_SUFFIXES.items():
        if name.endswith(suffix):
            return name.removesuffix(suffix), unit
    return name, None


def attribute_label(name: str) -> str:
    return _split_unit(name)[0].replace("_", " ")


def format_attribute_value(name: str, value: str | bool | int | float) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, str):
        return value.replace("_", " ")
    unit = _split_unit(name)[1]
    number = str(value) if isinstance(value, int) else f"{value:g}"
    return f"{number} {unit}" if unit else number


def format_rupees(amount: float) -> str:
    """Indian digit grouping with the rupee sign and no decimals: 124999 -> "₹1,24,999"."""
    sign, digits = ("-" if amount < 0 else ""), str(abs(round(amount)))
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while head:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return f"{sign}₹" + ",".join([*groups, tail])
