import re

CATEGORY_RULES: list[tuple[str, str]] = [
    # ── Groceries & Dining ──────────────────────────────────────────────────
    (r"migros|coop(?! card)|lidl|aldi|denner|volg|carrefour|leclerc|intermarche|monoprix|franprix|casino super|simply market|super u|leader price|bio c bon|manor food", "Groceries & Dining"),
    (r"restaurant|brasserie|pizza|burger|mcdonald|kfc|five guys|sushi|kebab|bistrot|cantine|cafeteria|royal court|maharaja|big fernand|joe & the juice|pizza hut|kahve|barbie green|sophisticats|leicester arms|la fucina|tinned fish", "Groceries & Dining"),
    (r"patisserie|boulangerie|boucher|boucherie|epicerie|traiteur|charcuterie|fromagerie|cremerie|poissonerie|caviste|oak berry", "Groceries & Dining"),
    (r"uber eats|deliveroo|just eat|smood", "Groceries & Dining"),

    # ── Travel (transport + hotels + flights) ───────────────────────────────
    (r"sbb cff|sbb mobile|tfl|transport for london|uber(?! eats)|lyft|taxi|parking|autoroute|aprr|cofiroute|vinci autoroute|flixbus|blablacar|effia|parkingpay|twint.*park", "Travel"),
    (r"hotel|airbnb|booking\.com|expedia|easyjet|ryanair|british airways|air france|swiss(?:air| international)|airport|aeroport|eurostar|thalys|sainsbury|heathrow", "Travel"),
    (r"paybyphone|twint.*parking|twint.*park|parkingpay", "Travel"),

    # ── Fixed Costs — healthcare ─────────────────────────────────────────────
    (r"pharmacie|pharmacy|medecin|docteur|hopital|clinique|dentiste|assurance maladie|lamal|mutuelle sante", "Fixed Costs"),
    (r"sanitas|swica|css assurance|helsana|visana|concordia|assura|atupri|groupe mutuel", "Fixed Costs"),

    # ── Fixed Costs — phone & internet (must come before fun-money subs) ────
    (r"free mobile|salt mobile|swisscom|sunrise|sfr|bouygues|orange mobile|sfr box|free (?:haut|fibre)", "Fixed Costs"),

    # ── Fixed Costs — housing, utilities, loan ───────────────────────────────
    (r"loyer|rent|charges|syndic|pret immobilier|emprunt|hypotheque|assurance hab|assurance maison|echeance pret", "Fixed Costs"),
    (r"edf|engie|ewz|cfe|eau de|sew|romande energie|ckw|swisscom internet|frais tenue|balance closing", "Fixed Costs"),
    (r"publica|pension|lpp|prevoyance|pilier", "Fixed Costs"),

    # ── Fun Money — entertainment subscriptions ──────────────────────────────
    (r"apple\.com|apple subscription|claude\.ai|netflix|spotify|amazon prime|disney\+|youtube premium|microsoft 365|adobe|github|kobo", "Fun Money"),

    # ── Fun Money — shopping & entertainment ─────────────────────────────────
    (r"amazon(?! prime)|fnac|darty|h&m|zara|uniqlo|decathlon|ikea|zalando|asos|whsmith|manor(?! food)|galaxus|digitec", "Fun Money"),
    (r"cinema|theatre|musee|museum|concert|eventbrite|stubhub|fnac spectacles|speakers corner", "Fun Money"),

    # ── Income ───────────────────────────────────────────────────────────────
    (r"salary|salaire|virement entrant|credit salaire|epiq systems|remuneration|paie ", "Income"),
    (r"d\.g\.f\.i\.p|dgfip|impot.*remb|remb.*impot|avoir\s", "Income"),

    # ── Internal Transfer ────────────────────────────────────────────────────
    (r"wise payments|top.?up|virement entre comptes|virement.*jeremie gros|vir inst m jeremie", "Internal Transfer"),

    # ── Miscellaneous ────────────────────────────────────────────────────────
    (r"retrait|cash withdrawal|atmc|bancomat|distributeur", "Miscellaneous"),
    (r"transfer (?:to|from)|virement instantane emis|katja|oslic|anouk|emmert|kulchytska", "Miscellaneous"),
    (r"frais bancaires|commission|cotisation carte|agios|interets debiteurs|frais tenue|balance closing of service", "Miscellaneous"),
]

BOURSOBANK_CAT_MAP: dict[str, str] = {
    "Alimentation": "Groceries & Dining",
    "Vie quotidienne": "Groceries & Dining",
    "Restaurants, bars, discothèques": "Groceries & Dining",
    "Loisirs et sorties": "Fun Money",
    "Auto & Moto": "Travel",
    "Parking": "Travel",
    "Transports en commun": "Travel",
    "Voyages et vacances": "Travel",
    "Logement": "Fixed Costs",
    "Services à la personne": "Fixed Costs",
    "Abonnements et téléphonie": "Fixed Costs",
    "Abonnements et Telephonie": "Fixed Costs",
    "Santé": "Fixed Costs",
    "Banque": "Miscellaneous",
    "Virements": "Internal Transfer",
    "Virements reçus": "Internal Transfer",
    "Revenus": "Income",
    "Shopping": "Fun Money",
    "Habillement": "Fun Money",
    "Cadeaux et dons": "Miscellaneous",
    "Éducation et formation": "Miscellaneous",
}

BNP_CAT_MAP: dict[str, str] = {
    "Alimentation et Restauration": "Groceries & Dining",
    "Loisirs et Sorties": "Fun Money",
    "Auto et Transports": "Travel",
    "Voyages et Vacances": "Travel",
    "Logement": "Fixed Costs",
    "Abonnements et Telephonie": "Fixed Costs",
    "Abonnements et Téléphonie": "Fixed Costs",
    "Santé": "Fixed Costs",
    "Banque": "Miscellaneous",
    "Revenus": "Income",
    "Shopping": "Fun Money",
    "Services": "Miscellaneous",
}


def categorize(description: str, original_category: str | None = None) -> str:
    desc_lower = description.lower()
    for pattern, category in CATEGORY_RULES:
        if re.search(pattern, desc_lower):
            return category

    if original_category:
        mapped = BOURSOBANK_CAT_MAP.get(original_category) or BNP_CAT_MAP.get(original_category)
        if mapped:
            return mapped

    return "Miscellaneous"


def is_cash_withdrawal(description: str) -> bool:
    return bool(re.search(r"retrait|cash withdrawal|atmc|bancomat|distributeur", description.lower()))
