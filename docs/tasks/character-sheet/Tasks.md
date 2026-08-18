# Character Sheet

## Goal

A playable in-site sheet that snapshot-imports Stat Generator output, then lets a player pick class(es) + optional subclass + level so 5etools features fill in, with native click-to-roll and hide/custom notes.

## Done (summary for agents)

Shipped and working. Do not re-implement unless fixing a bug.

**Page & persistence**

- `characters.html` (Player nav + homepage); autosave to page localStorage; file save/load (`.charsheet`)
- Named character roster: toolbar dropdown + new / duplicate / delete; migrates legacy single-sheet save
- Statgen “Send to Character Sheet” is a **one-time snapshot** import (abilities, species, background, feats)

**Identity & core stats**

- Name, species, background, feats (Feats tab always visible: Add Feat + per-row remove). `featHashes` is `[{id, hash}]`; legacy string hashes migrate on load. `featChoices[classFeatureKey]` binds ASI/Epic Boon picks.
- Multiclass: `classes[]` rows (+ Class), per-row level; total level → PB; Class/Subclass tabs show **grouped** features per class
- Ability scores + `{@ability}` rolls; saving throws and skills with 4-state proficiency (none / proficient / expertise / half) and native rolls
- Combat: HP current/max (encounter-tracker-style math input + wound colors), AC, speed, resistances (damage-type toggles)
- Dynamic HP: Avg / roll max from hit dice + CON; HD pips, spend-and-roll healing, reset

**Features column (right)**

- Top tabs: Class / Subclass / Feats / Actions / Spellcasting / Origin / Custom (empty auto tabs hidden except Feats and Actions). Species + Background share **Origin** (headings “Species” then “Background”); Origin hides if both lists are empty.
- Auto features from class data by level; hide/unhide; custom notes/entries
- Class **Ability Score Improvement** and **Epic Boon** rows: Choose / Change / Clear Feat (stores `featChoices[featureKey]` + `featHashes`). ASI is picking the Ability Score Improvement feat (or any other feat); no separate +2 UI. Epic Boon picker defaults to Category=EB. Dropping below the grant level leaves the feat until the player removes it.
- User-attached widgets on any feature: counter, pips, number, rollable, reference
- Spellcasting tab: attack/DC blocks (primary class), slot pips or pact, Ready + Library drawer, spell picker with class/level pre-filter; **no combined multiclass slot math** — primary class table + manual max overrides
- Actions tab (always visible): auto rows from equipped weapons (to-hit = PB if Simple/Martial toggle matches + ability + `bonusWeapon`/`bonusWeaponAttack` + row `+hit`; damage = `dmg1`/`dmg2` + ability + weapon damage bonus + row `+dmg`); custom rows; group by Action / Bonus / Reaction / Free; Add Action / Add Unarmed (1 + STR stub, not 2024 1d6). Finesse/ranged use an ability select (ranged defaults DEX, else STR). Scores stay manual.

**Left column**

- Other Proficiencies: weapon/armor toggles + auto lists (structured grants) + custom lines for languages/tools
- Inventory via item picker (quantity + notes + Equip). Equip is weapons (many) / one armor / one shield (XOR). Other items hide Equip. Equipping armor or a shield writes computed AC into Combat (unarmored `10 + DEX` + shield; item `ac` / `dexterityMax` / `bonusAc` only). AC tooltip shows the breakdown. Player can still type Mage Armor / Unarmored Defense by hand.

**Key files**

- `js/characters.js` — page init, roster, save
- `js/characters/characters-ui.js` — main UI/state
- `js/characters/characters-spellcasting.js`, `characters-classes.js`, `characters-hp.js`, `characters-roster.js`, `characters-features.js`, `characters-equipment.js`, `characters-actions.js`
- `scss/includes/characters.scss`

---

## Auto-seeding & structured choices (hardest — defer)

These require parsing or resolving **player choices** and **named content** from 5etools data (often `choose` blocks, entry text, or cross-entity lookups). Do not half-implement; expect the most design and edge-case work here.

- [ ] **Skill choices** — auto-assign class/background skill picks from structured `choose` / starting proficiency data
- [ ] **Other proficiencies choices** — resolve background language/tool picks, class tool picks, text-only grants in feature entries, subclass grants not on `startingProficiencies`
- [ ] **Optional feature pickers** — fighting styles, invocations, maneuvers, etc. (`optionalFeatureUids`); pick + attach to sheet
- [ ] **Feature widget auto-seed** — detect named features (Second Wind, Ki, etc.) and attach appropriate widgets automatically
- [ ] **Spell list auto-seed** — feat `additionalSpells` → spell library; ritual / always-prepared enforcement where data supports it
- [ ] **Feat ability bonuses → scores** — when picking / changing / removing a feat, apply structured `feat.ability` into the six scores (cap 20; revert on change). Statgen already has this UI (`statgen-ui-comp-asi.js`: ASI +2 or +1/+1 checkboxes, plus feat ability choose). Reverse-engineer that; include Ability Score Improvement and other feats with bonuses (Skill Expert, Actor, etc.). Sheet currently leaves scores as manual edits.
- [ ] **Fighting Style math** — Defense (+1 AC in armor), Archery (+2 ranged attack), Dueling (+2 damage one-handed). Needs optional-feature pickers first; do not bake into Actions/AC until the style is on the sheet.
- [ ] **Unarmored Defense / Mage Armor** — Monk/Barbarian UD and Mage Armor into AC. Combat AC is a typed field; equip writes PHB default `10 + DEX` (plus armor/shield). Leave UD/Mage Armor as a manual AC edit until seeded.
- [ ] **Extra Attack count** — extra attack rows / annotations from class features.
- [ ] **Two-weapon / Light bonus action** — auto Bonus Action row when a Light weapon is equipped.
- [ ] **Spell attacks on Actions** — cantrips / spell attacks on the Actions tab (Spellcasting tab remains the source of attack/DC today).
- [ ] **Attunement / worn slots** — attunement limit and worn slots beyond armor / shield / weapon.

Related spellcasting polish (easier than full auto-seed, but still deferred): Warlock short-rest pact refill; spell-points variant; auto-spend slots on Cast.

---

## Deferred (other — do not fake)

Smaller scope or explicit non-goals for now. State stubs / manual UI only until a dedicated pass.

- [ ] **Combined multiclass spell slots** — full caster table merge; today primary class + overrides only
- [ ] **Live Statgen sync** — ongoing link to Stat Generator (import stays snapshot)
- [ ] **`hpFormula` string field** — optional display/storage; HP math uses HD pools in Combat today

---

## Minor bugs / improvements

Easy fixes; batch as needed.

- [ ] Other Proficiencies panel: trim redundant copy; surface actual skill/tool/language entries where data exists
- [ ] Death Saves on Combat Panel/section
