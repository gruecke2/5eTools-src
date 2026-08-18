import {
	FEATURE_SECTION_BACKGROUND,
	FEATURE_SECTION_CLASS,
	FEATURE_SECTION_FEAT,
	FEATURE_SECTION_RACE,
	FEATURE_SECTION_SUBCLASS,
} from "./characters-const.js";

export class CharactersFeatureCollector {
	static getClassFeatureKey (feature) {
		return [
			"classFeature",
			feature.name,
			feature.className,
			feature.classSource,
			feature.level,
			feature.source,
		].join("|");
	}

	static getSubclassFeatureKey (feature) {
		return [
			"subclassFeature",
			feature.name,
			feature.className,
			feature.classSource,
			feature.subclassShortName,
			feature.subclassSource,
			feature.level,
			feature.source,
		].join("|");
	}

	static getNamedEntryKey (prefix, hash, name, ix) {
		return `${prefix}|${hash}|${name || ix}`;
	}

	static getFeatKey (id) {
		return `feat|${id}`;
	}

	static getFeatGrantType (name) {
		if (name === "Ability Score Improvement") return "asi";
		if (name === "Epic Boon") return "epicBoon";
		return null;
	}

	static getFeatGrantFilterExpression (grantType) {
		if (grantType === "epicBoon") return "category=EB";
		return null;
	}

	static collectClassFeatures (cls, level) {
		if (!cls?.classFeatures) return [];

		const out = [];
		cls.classFeatures.forEach((lvlFeatures, ix) => {
			const featureLevel = ix + 1;
			if (featureLevel > level) return;

			(lvlFeatures || []).forEach(feature => {
				if (!feature || (!feature.name && !feature.entries)) return;
				out.push({
					key: this.getClassFeatureKey(feature),
					section: FEATURE_SECTION_CLASS,
					level: feature.level || featureLevel,
					name: feature._displayName || feature.name || "(Unnamed Feature)",
					source: feature.source,
					entries: feature.entries || [],
					featGrant: this.getFeatGrantType(feature.name),
				});
			});
		});
		return out;
	}

	static collectSubclassFeatures (sc, level) {
		if (!sc?.subclassFeatures) return [];

		const out = [];
		sc.subclassFeatures.forEach(lvlFeatures => {
			(lvlFeatures || []).forEach(feature => {
				const featureLevel = feature.level || lvlFeatures[0]?.level;
				if (featureLevel == null || featureLevel > level) return;
				if (!feature.name && !feature.entries) return;

				out.push({
					key: this.getSubclassFeatureKey(feature),
					section: FEATURE_SECTION_SUBCLASS,
					level: featureLevel,
					name: feature._displayName || feature.name || "(Unnamed Feature)",
					source: feature.source,
					entries: feature.entries || [],
				});
			});
		});
		return out;
	}

	static collectEntityEntries (ent, hash, section) {
		if (!ent) return [];
		return this._collectNamedEntries(ent, ent.entries || [], hash, section);
	}

	static collectRace (race, hash) {
		if (!race) return [];

		const meta = Renderer.race.getRaceRenderableEntriesMeta(race);
		const out = [];

		if (meta.entryAttributes) {
			out.push({
				key: this.getNamedEntryKey(FEATURE_SECTION_RACE, hash, "attributes", 0),
				section: FEATURE_SECTION_RACE,
				level: null,
				name: race.name,
				source: race.source,
				entries: [meta.entryAttributes],
			});
		}

		out.push(...this._collectNamedEntries(race, meta.entryMain?.entries || [], hash, FEATURE_SECTION_RACE));
		return out;
	}

	static collectFeat (feat, id) {
		if (!feat || !id) return [];
		const meta = Renderer.feat.getFeatRendereableEntriesMeta(feat);
		return [{
			key: this.getFeatKey(id),
			section: FEATURE_SECTION_FEAT,
			level: null,
			name: feat.name,
			source: feat.source,
			entries: meta.entryMain?.entries || feat.entries || [],
			featId: id,
		}];
	}

	static _collectNamedEntries (ent, entries, hash, section) {
		const out = [];
		const leftover = [];

		(entries || []).forEach((entry, ix) => {
			if (entry && typeof entry === "object" && (entry.name || entry.type === "entries")) {
				out.push({
					key: this.getNamedEntryKey(section, hash, entry.name, ix),
					section,
					level: null,
					name: entry.name || ent.name,
					source: entry.source || ent.source,
					entries: entry.entries || (entry.name ? [] : [entry]),
				});
				return;
			}
			leftover.push(entry);
		});

		if (leftover.length) {
			out.unshift({
				key: this.getNamedEntryKey(section, hash, ent.name, "root"),
				section,
				level: null,
				name: ent.name,
				source: ent.source,
				entries: leftover,
			});
		}

		return out;
	}

	static getHitDiceText (cls) {
		if (!cls?.hd) return null;
		const entry = Renderer.class.getHitDiceEntry(cls.hd);
		return entry ? Renderer.get().render(entry) : null;
	}
}
