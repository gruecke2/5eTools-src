export class CharactersHitDice {
	static migrate (raw) {
		const out = {};
		if (!raw || typeof raw !== "object") return out;
		Object.entries(raw).forEach(([face, it]) => {
			const faces = Number(face);
			if (!faces || !it || typeof it !== "object") return;
			out[faces] = {
				max: Math.max(0, Number(it.max) || 0),
				current: Math.max(0, Number(it.current) || 0),
			};
		});
		return out;
	}

	static poolsFromClasses (classMetas) {
		const byFace = {};
		(classMetas || []).forEach(({hd, level}) => {
			if (!hd?.faces) return;
			const faces = Number(hd.faces);
			const perLevel = Math.max(1, Number(hd.number) || 1);
			const count = Math.max(0, Number(level) || 0) * perLevel;
			if (!faces || !count) return;
			byFace[faces] = (byFace[faces] || 0) + count;
		});
		return Object.keys(byFace)
			.map(Number)
			.sort((a, b) => a - b)
			.map(faces => ({faces, count: byFace[faces]}));
	}

	static applyAuto (existing, pools) {
		const prev = this.migrate(existing);
		const out = {};
		(pools || []).forEach(({faces, count}) => {
			const max = Math.max(0, Number(count) || 0);
			const prevRow = prev[faces] || {max: 0, current: 0};
			const wasFull = prevRow.current >= prevRow.max;
			out[faces] = {
				max,
				current: wasFull ? max : Math.max(0, Math.min(prevRow.current, max)),
			};
		});
		return out;
	}

	static avgPerDie (faces) {
		return Math.floor(Number(faces) / 2) + 1;
	}

	static computeAverageMax ({pools, conMod}) {
		let total = 0;
		let isFirst = true;
		(pools || []).forEach(({faces, count}) => {
			for (let i = 0; i < count; ++i) {
				total += (isFirst ? faces : this.avgPerDie(faces)) + conMod;
				isFirst = false;
			}
		});
		return Math.max(1, total);
	}

	static computeRolledMax ({pools, conMod}) {
		let total = 0;
		let isFirst = true;
		(pools || []).forEach(({faces, count}) => {
			for (let i = 0; i < count; ++i) {
				total += (isFirst ? faces : RollerUtil.randomise(faces)) + conMod;
				isFirst = false;
			}
		});
		return Math.max(1, total);
	}

	static laterLevelsExpression ({pools, conMod}) {
		const later = [];
		let skip = 1;
		let laterCount = 0;
		(pools || []).forEach(({faces, count}) => {
			let n = count;
			if (skip && n) {
				const take = Math.min(skip, n);
				skip -= take;
				n -= take;
			}
			if (n) {
				later.push(`${n}d${faces}`);
				laterCount += n;
			}
		});
		if (!later.length) return null;
		const dice = later.join("+");
		const conTotal = laterCount * (conMod || 0);
		if (!conTotal) return dice;
		return `${dice}${conTotal >= 0 ? "+" : ""}${conTotal}`;
	}
}
