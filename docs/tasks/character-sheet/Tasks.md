# Character Sheet

## Goal

A playable in-site sheet that snapshot-imports Stat Generator output, then lets a player pick one class + optional subclass + level so 5etools features fill in, with native click-to-roll and hide/custom notes.

## MVP

- [x] New `characters.html` page (Player nav + homepage)
- [x] Statgen “Send to Character Sheet” snapshot import
- [x] Identity: name, class/subclass, level, species, background
- [x] Ability scores + modifiers with `{@ability}` rolls
- [x] Proficiency bonus from level
- [x] Saving throws and skills with proficiency toggles and native rolls
- [x] Manual HP / AC / speed; hit dice shown as informational text
- [x] Class/subclass/species/background/feat features by level, in sections
- [x] Hide/unhide auto features; custom notes/entries
- [x] Inventory via item picker (quantity + notes; not equipped)
- [x] Autosave + file save/load

## This pass

- [x] Features column as top `TabUiUtil` tabs (Class / Subclass / Species / Background / Feats / Custom); empty auto tabs hidden
- [x] Skill proficiency 4-state cycler (none / proficient / expertise / half)
- [x] User-attached feature widgets: counter, pips, number, rollable, reference (auto and custom features)

## Deferred (do not fake)

Keep these as state stubs / UI notes until a later pass:

- [ ] Multiclass (`classes` array; MVP uses single `className` / `classSource`)
- [ ] Spellcasting (`spellcasting`)
- [ ] Dynamic HP (`hpFormula`)
- [ ] Equipped items (`inventory[].equipped`)
- [ ] Optional feature pickers: fighting styles, invocations, maneuvers (`optionalFeatureUids`)
- [ ] Auto-assigning skill choices from class/background
- [ ] Auto-seeding widgets onto named features (Second Wind, Ki, etc.)
- [ ] Live Statgen sync (import is a snapshot)
- [ ] Multiple named characters
