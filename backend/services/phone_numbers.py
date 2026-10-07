"""Canonical phone identity, including legacy South African account formats."""
import re


def normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"[\s()\-]", "", phone)
    if cleaned.startswith("0027"):
        cleaned = "+" + cleaned[2:]
    elif re.fullmatch(r"0[1-9][0-9]{8}", cleaned):
        cleaned = "+27" + cleaned[1:]
    elif re.fullmatch(r"27[1-9][0-9]{8}", cleaned):
        cleaned = "+" + cleaned
    elif re.fullmatch(r"[1-9][0-9]{8}", cleaned):
        cleaned = "+27" + cleaned
    if cleaned.startswith("+27"):
        valid = re.fullmatch(r"\+27[1-9][0-9]{8}", cleaned)
    else:
        valid = re.fullmatch(r"\+[1-9][0-9]{7,14}", cleaned)
    if not valid:
        raise ValueError("Enter a valid phone number, for example 0821234567 or +27821234567.")
    return cleaned


def phone_aliases(phone: str) -> list[str]:
    canonical = normalize_phone(phone)
    aliases = {canonical}
    if canonical.startswith("+27"):
        aliases.update({"0" + canonical[3:], canonical[1:], canonical[3:], "00" + canonical[1:]})
    return sorted(aliases)


def phone_identity_query(phone: str) -> dict:
    canonical = normalize_phone(phone)
    # Anchored, escaped variants also recognise spaces, hyphens and parentheses
    # in legacy records, without rewriting or merging those records.
    separator = r"[\s()\-]*"
    alternatives = [separator.join(re.escape(c) for c in alias) for alias in phone_aliases(canonical)]
    pattern = "^" + separator + "(?:" + "|".join(alternatives) + ")" + separator + "$"
    return {"$or": [{"phone_e164": canonical}, {"phone_number": {"$regex": pattern}}]}
