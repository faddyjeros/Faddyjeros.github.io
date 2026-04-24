import os
import json
import yaml
import requests
from datetime import datetime, timezone

# --- Config ---
CONFIG_PATH = "src/data/wow_characters.yaml"
OUTPUT_PATH = "src/data/wow.json"

# --- Auth ---
CLIENT_ID = os.environ["BLIZZARD_CLIENT_ID"]
CLIENT_SECRET = os.environ["BLIZZARD_CLIENT_SECRET"]

def get_token(region):
    response = requests.post(
        f"https://{region}.battle.net/oauth/token",
        data={"grant_type": "client_credentials"},
        auth=(CLIENT_ID, CLIENT_SECRET),
    )
    response.raise_for_status()
    return response.json()["access_token"]

def get_character(region, realm, name, token):
    slug = name.lower()
    realm_slug = realm.lower()
    base = f"https://{region}.api.blizzard.com/profile/wow/character/{realm_slug}/{slug}"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"namespace": f"profile-{region}", "locale": "en_GB"}

    profile = requests.get(base, headers=headers, params=params).json()
    achievements = requests.get(f"{base}/achievements/statistics", headers=headers, params=params).json()
    pvp_summary = requests.get(f"{base}/pvp-summary", headers=headers, params=params).json()

    return {
        "profile": profile,
        "achievements": achievements,
        "pvp_summary": pvp_summary,
    }

def extract_pvp_bracket(pvp_summary, bracket_type):
    brackets = pvp_summary.get("brackets", [])
    for b in brackets:
        href = b.get("href", "")
        if bracket_type in href:
            bracket_data = requests.get(href, params={"namespace": "profile-eu", "locale": "en_GB"}).json()
            return {
                "rating": bracket_data.get("rating", 0),
                "season_played": bracket_data.get("season_match_statistics", {}).get("played", 0),
                "season_won": bracket_data.get("season_match_statistics", {}).get("won", 0),
            }
    return {"rating": 0, "season_played": 0, "season_won": 0}

def build_character_data(char, region, realm, token):
    raw = get_character(region, realm, char["name"], token)
    profile = raw["profile"]
    pvp = raw["pvp_summary"]

    result = {
        "name": char["display_name"],
        "slug": char["slug"],
        "role": char["role"],
        "focus": char["focus"],
        "class": profile.get("character_class", {}).get("name", "Unknown"),
        "spec": profile.get("active_spec", {}).get("name", "Unknown"),
        "level": profile.get("level", 0),
        "item_level": profile.get("average_item_level", 0),
        "equipped_item_level": profile.get("equipped_item_level", 0),
        "achievement_points": profile.get("achievement_points", 0),
        "faction": profile.get("faction", {}).get("name", "Unknown"),
        "realm": profile.get("realm", {}).get("name", "Unknown"),
    }

    if char["focus"] == "pvp":
        result["pvp"] = {
            "solo_shuffle": extract_pvp_bracket(pvp, "solo-shuffle"),
            "blitz": extract_pvp_bracket(pvp, "battleground-blitz"),
        }

    return result

def main():
    with open(CONFIG_PATH, "r") as f:
        config = yaml.safe_load(f)

    region = config["region"]
    realm = config["realm"]
    token = get_token(region)

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "characters": []
    }

    for char in config["characters"]:
        print(f"Fetching {char['name']}...")
        data = build_character_data(char, region, realm, token)
        output["characters"].append(data)
        print(f"  Done: {data['class']} {data['spec']}, ilvl {data['equipped_item_level']}")

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\nWrote {OUTPUT_PATH}")

if __name__ == "__main__":
    main()