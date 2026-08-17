const _WEAPON_TOGGLE_IDS = new Set(["simple", "martial"]);
const _ARMOR_TOGGLE_IDS = new Set(["light", "medium", "heavy", "shield"]);

export class CharactersProficienciesCollector {
	static getEmptyToggles () {
		return {
			simple: false,
			martial: false,
			shield: false,
			light: false,
			medium: false,
			heavy: false,
		};
	}

	static async pCollectAuto ({cls, race, background, feats}) {
		const styleHint = VetoolsConfig.get("styleSwitcher", "style");
		const toggles = this.getEmptyToggles();
		const weaponsExtra = new Set();
		const languages = new Set();
		const tools = new Set();

		this._addClassStarting(toggles, weaponsExtra, tools, cls?.startingProficiencies, {styleHint});

		[
			race,
			background,
			...(feats || []),
		]
			.filter(Boolean)
			.forEach(ent => {
				this._addWeaponProfObjects(toggles, weaponsExtra, ent.weaponProficiencies, {styleHint});
				this._addArmorProfObjects(toggles, weaponsExtra, ent.armorProficiencies, {styleHint});
				this._addEntityLanguageProfs(languages, ent);
				this._addEntityToolProfs(tools, ent);
			});

		return {
			toggles,
			weaponsExtra: [...weaponsExtra],
			languages: [...languages],
			tools: [...tools],
		};
	}

	static _addClassStarting (toggles, weaponsExtra, tools, starting, {styleHint}) {
		if (!starting) return;

		(starting.weapons || []).forEach(w => {
			if (typeof w === "string" && _WEAPON_TOGGLE_IDS.has(w)) {
				toggles[w] = true;
				return;
			}
			this._addHtml(weaponsExtra, this._renderClassWeaponEntry(w));
		});
		this._addWeaponProfObjects(toggles, weaponsExtra, starting.weaponProficiencies, {styleHint});

		(starting.armor || []).forEach(a => {
			if (typeof a === "string" && _ARMOR_TOGGLE_IDS.has(a)) {
				toggles[a] = true;
				return;
			}
			this._addHtml(weaponsExtra, this._renderClassArmorEntry(a));
		});
		this._addArmorProfObjects(toggles, weaponsExtra, starting.armorProficiencies, {styleHint});

		if (starting.tools?.length) {
			this._addHtml(tools, Renderer.class.getRenderedToolProfs(starting.tools, {styleHint}));
		}
	}

	static _renderClassWeaponEntry (w) {
		if (w?.optional) return `<span class="ve-help ve-help--hover" title="Optional Proficiency">${Renderer.get().render(w.proficiency)}</span>`;
		return Renderer.get().render(w);
	}

	static _renderClassArmorEntry (a) {
		if (a?.full) return Renderer.get().render(a.full);
		return Renderer.get().render(a);
	}

	static _addWeaponProfObjects (toggles, extras, weaponProfs, {styleHint}) {
		if (!weaponProfs?.length) return;

		weaponProfs.forEach(group => {
			if (group.all?.fromFilter) {
				this._addHtml(extras, Renderer.get().render(`{@filter ${group.all.fromFilter}|items}`));
			}
			if (group.choose) this._addChooseExtra(extras, group.choose);

			Object.entries(group)
				.filter(([k, v]) => v && !["all", "choose"].includes(k))
				.forEach(([k]) => {
					if (_WEAPON_TOGGLE_IDS.has(k)) {
						toggles[k] = true;
						return;
					}
					this._addNamedProfExtra(extras, k);
				});
		});
	}

	static _addArmorProfObjects (toggles, extras, armorProfs, {styleHint}) {
		if (!armorProfs?.length) return;

		armorProfs.forEach(group => {
			if (group.choose) this._addChooseExtra(extras, group.choose);

			Object.entries(group)
				.filter(([k, v]) => v && k !== "choose")
				.forEach(([k]) => {
					if (_ARMOR_TOGGLE_IDS.has(k)) {
						toggles[k] = true;
						return;
					}
					this._addNamedProfExtra(extras, k);
				});
		});
	}

	static _addChooseExtra (extras, choose) {
		const count = choose.count || 1;
		if (choose.fromFilter) {
			this._addHtml(extras, `Choose ${count} from ${Renderer.get().render(`{@filter ${choose.fromFilter}|items}`)}`);
			return;
		}
		if (!choose.from?.length) return;
		const fromHtml = choose.from
			.map(it => {
				if (typeof it !== "string") return Renderer.get().render(it);
				const [name, source] = it.split("|");
				return source ? Renderer.get().render(`{@item ${name}|${source}}`) : Renderer.get().render(it);
			})
			.join(", ");
		this._addHtml(extras, `Choose ${count} from ${fromHtml}`);
	}

	static _addNamedProfExtra (extras, k) {
		if (k === "firearms") {
			this._addHtml(extras, Renderer.get().render("firearms"));
			return;
		}
		const [name, source] = k.split("|");
		if (source) this._addHtml(extras, Renderer.get().render(`{@item ${name}|${source}}`));
		else this._addHtml(extras, Renderer.get().render(k));
	}

	static _addHtml (set, html) {
		const trimmed = (html || "").trim();
		if (trimmed) set.add(trimmed);
	}

	static _addEntityLanguageProfs (set, ent) {
		const {summary} = Renderer.generic.getLanguageSummary({
			languageProfs: ent.languageProficiencies,
			skillToolLanguageProfs: ent.skillToolLanguageProficiencies,
		});
		if (summary) set.add(summary);
	}

	static _addEntityToolProfs (set, ent) {
		const {summary} = Renderer.generic.getToolSummary({
			toolProfs: ent.toolProficiencies,
			skillToolLanguageProfs: ent.skillToolLanguageProficiencies,
		});
		if (summary) set.add(summary);
	}

	static renderProfListHtml (items, {emptyText = "None"} = {}) {
		if (!items?.length) return `<span class="ve-muted ve-italic">${emptyText.qq()}</span>`;
		return items.join("; ");
	}
}
