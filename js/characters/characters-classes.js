export class CharactersClassList {
	static getEmptyEntry () {
		return {
			id: CryptUtil.uid(),
			className: null,
			classSource: null,
			subclassName: null,
			subclassShortName: null,
			subclassSource: null,
			level: 1,
		};
	}

	static _migrateEntry (raw) {
		if (!raw || typeof raw !== "object") return null;
		return {
			id: raw.id || CryptUtil.uid(),
			className: raw.className || null,
			classSource: raw.classSource || null,
			subclassName: raw.subclassName || null,
			subclassShortName: raw.subclassShortName || raw.subclassName || null,
			subclassSource: raw.subclassSource || null,
			level: Math.max(1, Math.min(20, Number(raw.level) || 1)),
		};
	}

	static fromPrimary (state) {
		if (!state?.className) return null;
		return {
			id: CryptUtil.uid(),
			className: state.className,
			classSource: state.classSource,
			subclassName: state.subclassName,
			subclassShortName: state.subclassShortName || state.subclassName,
			subclassSource: state.subclassSource,
			level: Math.max(1, Math.min(20, Number(state.level) || 1)),
		};
	}

	static migrate (state) {
		if (!state || typeof state !== "object") return {classes: [], level: 1};
		let classes = Array.isArray(state.classes)
			? state.classes.map(it => this._migrateEntry(it)).filter(Boolean)
			: [];
		if (!classes.length) {
			const fromPrimary = this.fromPrimary(state);
			if (fromPrimary) classes = [fromPrimary];
		}
		return this.syncPrimary({...state, classes});
	}

	static getTotalLevel (classes) {
		const sum = (classes || []).reduce((n, it) => n + (Number(it.level) || 0), 0);
		return Math.max(1, Math.min(20, sum || 1));
	}

	static getPrimaryLevel (classes) {
		if (!classes?.length) return 1;
		return Math.max(1, Math.min(20, Number(classes[0].level) || 1));
	}

	static syncPrimary (state) {
		const classes = Array.isArray(state.classes) ? state.classes : [];
		const primary = classes[0] || null;
		return {
			...state,
			classes,
			level: classes.length ? this.getTotalLevel(classes) : Math.max(1, Math.min(20, Number(state.level) || 1)),
			className: primary?.className ?? null,
			classSource: primary?.classSource ?? null,
			subclassName: primary?.subclassName ?? null,
			subclassShortName: primary?.subclassShortName ?? null,
			subclassSource: primary?.subclassSource ?? null,
		};
	}
}
