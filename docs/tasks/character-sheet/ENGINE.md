# Character sheet engine

Agent contract for the in-site sheet (`characters.html`) and for any consumer
that should speak the same language — notably the sibling **beyondDnD** app
(`dndbeyond-clone`). Code is truth; this document is the identity + JSON map.

**Related**

- This repo: `docs/tasks/character-sheet/Tasks.md` (what is shipped vs deferred)
- Clone: `docs/5ETOOLS-SHEET.md` (import adapter, ContentStore hashes, self-host load)

---

## What this engine is

The 5etools sheet is a **hash-first, live-computed** character:

1. **Content** lives in 5etools JSON (site + prerelease + homebrew). Never copy
   class/feat/item text into the save.
2. **The save** stores *references* (hashes, tags, name+source) plus *play state*
   (HP, slots used, equipped flags, manual offsets).
3. **The UI** resolves those refs against whatever content is loaded in this
   session, then computes PB, saves, skills, AC, attacks, and feature lists.

The clone is the inverse persistence model (derive at save → SQLite snapshot)
but it already consumes the **same vendor JSON**. The bridge is identity, not
a second rules corpus.

```
5etools JSON (official + brew)
        │
        ├── 5etools sheet: resolve hashes live → render / roll
        └── clone:        ContentStore → engine derive → SQLite
```

---

## Golden rules (do not violate)

1. **Persist references, not entity bodies.** A `.charsheet` with
   `raceHash: "dragonborn_phb"` is valid even if Dragonborn JSON is 4 KB.
2. **Never key mechanics on display names** (`if (name === "Fighter")`).
   Look up the loaded entity; read `hd`, `spellcastingAbility`, `type`, `dmg1`.
3. **Instance ids ≠ content hashes.** Inventory row `id` is a uid. `itemHash`
   is the content. Two longswords are two rows, one hash. `actionOverrides`
   key on row `id`.
4. **Resolution is session-dependent.** Homebrew hashes only resolve if that
   brew JSON is loaded. Missing content → show the hash, do not invent stats.
5. **Stubs in state are not behavior.** `optionalFeatureUids` and `hpFormula`
   exist for forward-compat. Do not assume they do anything until Tasks.md
   says they do.

---

## Identity encodings

Three encodings appear in 5etools. Use the one the field already uses.

### A. URL hash (sheet persisted refs)

Built by `UrlUtil.URL_TO_HASH_BUILDER[page](entity)`.

Generic (races, backgrounds, feats, classes, spells as URLs):

```
encodeArrayForHash(name, source)
  → urlify(name) + "_" + urlify(source)
```

`urlify` lowercases. Examples:

| Entity | `{name, source}` | Hash |
|--------|------------------|------|
| Dragonborn | Dragonborn / PHB | `dragonborn_phb` |
| Alert | Alert / XPHB | `alert_xphb` |
| Longsword | Longsword / PHB | `longsword_phb` |

Items use `SourceUtil.getEntitySource(it)` (handles `inherits.source`).

Lookup on the sheet:

```javascript
arr.find(it => UrlUtil.URL_TO_HASH_BUILDER[page](it) === storedHash)
```

Pages used here: `races.html`, `backgrounds.html`, `feats.html`, `items.html`,
`classes.html`, `spells.html`.

### B. UID (inside content JSON)

Pipe form, parsed by `DataUtil.*.unpackUid`:

```
<token>|<source>          e.g. M|XPHB, F|XPHB, longsword|phb
```

Used for item `type`, `typeAlt`, `property[]`, `reprintedAs`, optional-feature
uids. Abbreviation when source omitted defaults to PHB.

Equipment slot is **type abbreviation**, not name:

| Abv | Slot |
|-----|------|
| `LA` `MA` `HA` | armor (XOR one) |
| `S` | shield (XOR one) |
| `M` `R` | weapon (many) |

Finesse: property abbreviation `F`.

### C. Renderer tag (spells, inline refs)

```
{@spell Fire Bolt|PHB}
{@item Longsword|PHB}
{@feat Alert|XPHB}
```

Spell rows on the sheet store **`tag`**, not a URL hash. Parse to `{name, source}`,
lookup `"${name}|${source}".toLowerCase()`.

### D. Name + source fields (classes)

`classes[]` stores `className` / `classSource` / `subclassName` /
`subclassShortName` / `subclassSource` / `level`. Lazy-loaded via
`DataLoader.pCacheAndGet`. Do not invent a class hash field unless you also
teach the clone the same builder.

Subclass URL hashes are composite (`classHash,state:sub:short_source`) and are
**not** stored on the sheet today.

---

## `.charsheet` envelope

```json
{
  "fileType": "charsheet",
  "siteVersion": "<VERSION_NUMBER>",
  "state": { },
  "meta": { }
}
```

- `fileType` must be `"charsheet"` (`CHARACTERS_FILE_TYPE`).
- `state` is the character. `meta` is UI (active tab). Clone import should
  ignore `meta`.
- Local roster stores the same envelope per entry (`js/characters/characters-roster.js`).

Load always runs migrations in `CharactersUi.setStateFrom` (skill ints, feat
`{id,hash}`, `classes[]` from legacy top-level class fields, spellcasting,
actions).

---

## `state` contract

Canonical defaults: `CharactersUi._getDefaultState()`.

### Identity

| Field | Type | Resolve with |
|-------|------|----------------|
| `name` | string | — |
| `level` | number | Sum of `classes[].level` (synced) |
| `raceHash` | string \| null | `URL_TO_HASH_BUILDER[races.html]` |
| `backgroundHash` | string \| null | `URL_TO_HASH_BUILDER[backgrounds.html]` |
| `featHashes` | `{ id, hash }[]` | feat page hash; `id` is instance uid |
| `featChoices` | `{ [featureKey]: hash }` | ASI / Epic Boon grant → feat hash |
| `classes` | `ClassEntry[]` | name+source → DataLoader |
| `className` … `subclassSource` | mirrors | **`classes[0]` + total level** via `CharactersClassList.syncPrimary` |

```typescript
type ClassEntry = {
  id: string;
  className: string | null;
  classSource: string | null;
  subclassName: string | null;
  subclassShortName: string | null;
  subclassSource: string | null;
  level: number; // 1–20 this row
};
```

### Scores, proficiencies, combat (play + extras)

| Field | Meaning |
|-------|---------|
| `str`…`cha` | Scores (default 10). **Manual.** Feat `ability` blocks are not auto-applied. |
| `save_str`… | Boolean save proficiency |
| `skill_<name>` | 0 none / 1 prof / 2 expertise / 3 half. Spaces → `_` (`skill_sleight_of_hand`) |
| `awp_simple` `awp_martial` `awp_shield` `awp_light` `awp_medium` `awp_heavy` | Armor/weapon toggles (auto-seeded from structured grants when class/species/bg/feat changes) |
| `hpCurrent` `hpMax` | Numbers or null |
| `hitDice` | `{ [faces]: { max, current } }` |
| `ac` | String/number field. **Written** when armor/shield equip changes |
| `speed` | Display string |
| `resistances` | `Parser.DMG_TYPES` strings |

Live math (5etools, not stored):

- PB = `Parser.levelToPb(level)`
- Ability mod = `Parser.getAbilityModNumber(score)`
- Save = mod + (proficient ? PB : 0)
- Skill = mod + floor(PB × multiplier)

### Inventory & equipment

```typescript
inventory: {
  id: string; // CryptUtil.uid — instance
  entity: {
    itemHash: string;
    quantity: number;
    notes: string;
    equipped: boolean;
  };
}[]
```

Equip rules (`js/characters/characters-equipment.js`):

- Hide Equip unless slot is armor / shield / weapon.
- Armor XOR, shield XOR, weapons many.
- AC (PHB default, not Monk/Barb UD):
  - Unarmored: `10 + DEX` (+ shield `ac` + `bonusAc`)
  - Armor: item `ac` + DEX (medium cap 2 unless `dexterityMax` set; heavy no DEX) + `Number(bonusAc)`
- Tooltip breakdown on the AC input.

### Actions

```typescript
customActions: {
  id, name, ability, bonusHit, bonusDmg,
  economy: "action" | "bonus" | "reaction" | "free",
  dmg, dmgType
}[]

actionOverrides: {
  [inventoryId: string]: {
    ability: string | null;
    bonusHit: number;
    bonusDmg: number;
    economy: "action" | "bonus" | "reaction" | "free";
  };
}
```

Weapon rows are **derived** from equipped `M`/`R` items, not stored.

To-hit = (proficient ? PB : 0) + ability mod + `bonusWeapon`/`bonusWeaponAttack` + row `bonusHit`.

- Proficient iff `weaponCategory` matches `awp_simple` / `awp_martial`.
- Default ability: DEX if ranged type, else STR. Ability select always shown (finesse).
- Damage = `dmg1` (+ `dmg2` versatile) + ability + weapon damage bonuses + row `bonusDmg`.

Custom rows are stored. Add Unarmed is a custom stub (`1` + STR, bludgeoning) — not 2024 1d6.

### Spellcasting

```typescript
spellcasting: {
  blocks: { id, origin: "class"|"subclass"|"custom", name, ability, bonus }[];
  spells: { id, tag, level, blockId, source, prepared, inBook }[];
  slots: { [1-9]: { max, current, maxOverride } };
  slotsPact: { max, level, current, maxOverride } | null;
}
```

Primary class table + manual max overrides. **No combined multiclass slot math.**

### Features

Runtime only (except hide/widgets/choices):

| Kind | `key` format |
|------|----------------|
| Class feature | `classFeature\|name\|className\|classSource\|level\|source` |
| Subclass feature | `subclassFeature\|name\|className\|classSource\|subclassShortName\|subclassSource\|level\|source` |
| Species/bg named entry | `{race\|background}\|{hash}\|{entryName or ix}` |
| Feat instance | `feat\|{featHashes[].id}` |
| Custom feature | collection row `id` |

`hiddenFeatureKeys: string[]` — those keys.

`featureWidgets: { [featureKey]: Widget[] }` — counter, pips, number, rollable, reference.

`featChoices[classFeatureKey] = featHash` binds ASI / Epic Boon rows. Picking a feat
also upserts `featHashes`.

UI tabs (not the same as data sections): Class | Subclass | Feats | Actions |
Spellcasting | Origin | Custom. Origin renders species then background. Empty
auto tabs hide except Feats and Actions.

### Stubs

`optionalFeatureUids: string[]`, `hpFormula` — present, unwired. Clone may store
optional-feature hashes here later; 5etools does not read them yet.

---

## Content load (5etools page)

`js/characters.js` merges three loadspaces per type:

```
DataLoader.pCacheAndGetAllSite(page)
DataLoader.pCacheAndGetAllPrerelease(page)
DataLoader.pCacheAndGetAllBrew(page)
```

then `ExcludeUtil.isExcluded(hash, prop, source)`.

Items: `Renderer.item.pBuildList()` + prerelease + brew.

Homebrew on 5etools: Brew manager / drag-drop (`BrewUtil2`). A `.charsheet`
that points at brew hashes needs that brew loaded in the same browser.

---

## What we compute vs what we store

| Domain | Stored | Computed on the sheet |
|--------|--------|------------------------|
| Species / bg / feats / items | hashes | entity lookup → entries, AC pieces, dmg1 |
| Class | name+source+level | class JSON → features, hit die, spellcasting block |
| Ability scores | the six numbers | mods, rolls |
| Proficiencies | booleans / 0–3 | bonuses + rollers |
| HP | current/max, hit-dice pips | Avg/Roll from HD + CON (buttons) |
| AC | field (often overwritten on equip) | formula from equipped armor/shield + DEX |
| Attacks | custom rows + per-weapon overrides | auto rows from equipped weapons |
| Spells | tags, prepared, slot current/max | DC / attack from block ability + PB + bonus |
| Features | hide keys, widgets, featChoices | collected from loaded entities by level |

Clone difference: clone **persists derived numbers** (AC, attacks_json, skill
mods) and hydrates text on read. Import from this sheet should **re-derive**
in the clone engine after mapping hashes → draft, not copy 5etools AC blindly
if the clone can compute it. Play state (HP current, slot used, prepared,
equipped, `actionOverrides`) **must** copy.

---

## Bridge intent (5etools → clone)

Author in 5etools (MVP ~complete). Export `.charsheet`. Clone imports to
`CharacterDraft` → `deriveCharacterFromDraft` → SQLite, then uses clone UI
for richer interactions.

Do **not** translate Fighter → a hardcoded gear table. Resolve
`className`+`classSource` in ContentStore; read vendor fields.

Minimum import map:

| `.charsheet` `state` | Clone |
|----------------------|--------|
| `raceHash` | resolve race → `draft.species` + persist hash |
| `backgroundHash` | resolve → `draft.background` |
| `classes[]` | `classInfo` (v1: primary row; multiclass later) |
| `featHashes` | `draft.feats[]` with hash + resolved name/source |
| `featChoices` | grant key → feat hash (do not flatten to `"Fighting Style_0"` until optional features exist) |
| `str`…`cha` | `abilityScores` (manual; skip clone ASI auto-apply on import) |
| `skill_*` `save_*` `awp_*` | skill/save/armor-weapon state |
| `inventory[].entity` | items with `itemHash` + quantity + equipped + notes |
| `customActions` `actionOverrides` | keep as play-state JSON until clone schema matches |
| `spellcasting` | blocks + spell tags + slot current/max |
| `hpCurrent` `resistances` `speed` | play/display |

Missing hash in the clone ContentStore → import warning, skip that ref, do not
guess a same-name PHB entity (2014 vs 2024 collisions).

---

## Deferred (do not fake in either app)

See Tasks.md. Highest-impact for a shared engine, in order:

1. Optional feature UIDs / hashes (fighting styles, invocations) — unlocks Defense / Archery / Dueling without name matching
2. Vendor-driven spell slots (`casterProgression`) instead of class-name tables (clone)
3. Unarmored Defense / Mage Armor
4. Combined multiclass slots
5. Feat `ability` → scores

Until (1), clone FeatureSpecs may still match **names** for mechanics overlays.
New specs should carry a content hash or optionalfeature UID as soon as that
field exists.

---

## Key files (this repo)

| Path | Role |
|------|------|
| `js/characters.js` | Page init, roster, brew/site load, `.charsheet` save |
| `js/characters/characters-ui.js` | State, migrations, hash lookup, UI |
| `js/characters/characters-const.js` | `fileType`, feature sections, skill/awp props |
| `js/characters/characters-classes.js` | `classes[]` |
| `js/characters/characters-features.js` | Feature keys |
| `js/characters/characters-equipment.js` | Slots + AC |
| `js/characters/characters-actions.js` | Weapon/custom rows |
| `js/characters/characters-spellcasting.js` | Spell state |
| `js/utils.js` | `UrlUtil.URL_TO_HASH_BUILDER`, `DataUtil.unpackUid` |

---

## Agent checklist

- [ ] New persisted field is a hash, tag, uid, or instance id — not a copied entity blob
- [ ] Lookup uses the same builder the writer used
- [ ] Overrides/equip key on inventory `id`, not `itemHash`
- [ ] Feature hide/widgets/featChoices use collector `key` strings
- [ ] Homebrew-only hashes documented as requiring brew load
- [ ] Tasks.md stubs left stubby
