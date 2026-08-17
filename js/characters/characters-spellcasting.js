export const SPELL_SOURCES = {
	class: "Class",
	subclass: "Subclass",
	feat: "Feat",
	custom: "Custom",
};

export class CharactersSpellcasting {
	static getEmptyState () {
		return {
			blocks: [],
			spells: [],
			slots: this._getEmptySlots(),
			slotsPact: null,
		};
	}

	static migrate (raw) {
		const empty = this.getEmptyState();
		if (!raw || typeof raw !== "object") return empty;
		return {
			blocks: Array.isArray(raw.blocks) ? raw.blocks.map(it => this._migrateBlock(it)).filter(Boolean) : [],
			spells: Array.isArray(raw.spells) ? raw.spells.map(it => this._migrateSpell(it)).filter(Boolean) : [],
			slots: this._migrateSlots(raw.slots),
			slotsPact: this._migratePact(raw.slotsPact),
		};
	}

	static _migrateBlock (block) {
		if (!block || typeof block !== "object") return null;
		return {
			id: block.id || CryptUtil.uid(),
			origin: ["class", "subclass", "custom"].includes(block.origin) ? block.origin : "custom",
			name: block.name || "Spellcasting",
			ability: Parser.ABIL_ABVS.includes(block.ability) ? block.ability : "int",
			bonus: Number(block.bonus) || 0,
		};
	}

	static _migrateSpell (sp) {
		if (!sp || typeof sp !== "object" || !sp.tag) return null;
		return {
			id: sp.id || CryptUtil.uid(),
			tag: sp.tag,
			level: Number.isFinite(Number(sp.level)) ? Number(sp.level) : 0,
			blockId: sp.blockId || null,
			source: SPELL_SOURCES[sp.source] ? sp.source : "custom",
			prepared: !!sp.prepared,
			inBook: !!sp.inBook,
		};
	}

	static _getEmptySlots () {
		const slots = {};
		for (let lvl = 1; lvl <= 9; ++lvl) slots[lvl] = {max: 0, current: 0, maxOverride: null};
		return slots;
	}

	static _migrateSlots (raw) {
		const slots = this._getEmptySlots();
		if (!raw || typeof raw !== "object") return slots;
		for (let lvl = 1; lvl <= 9; ++lvl) {
			const it = raw[lvl] || raw[String(lvl)];
			if (!it || typeof it !== "object") continue;
			slots[lvl] = {
				max: Math.max(0, Number(it.max) || 0),
				current: Math.max(0, Number(it.current) || 0),
				maxOverride: it.maxOverride == null ? null : Math.max(0, Number(it.maxOverride) || 0),
			};
		}
		return slots;
	}

	static _migratePact (raw) {
		if (!raw || typeof raw !== "object") return null;
		return {
			max: Math.max(0, Number(raw.max) || 0),
			level: Math.max(1, Number(raw.level) || 1),
			current: Math.max(0, Number(raw.current) || 0),
			maxOverride: raw.maxOverride == null ? null : Math.max(0, Number(raw.maxOverride) || 0),
		};
	}

	static getListMode (ent) {
		if (!ent) return null;
		if (ent.preparedSpellsProgression) return "prepared";
		if (ent.spellsKnownProgression) return "known";
		if (ent.spellsKnownProgressionFixed) return "book";
		if (typeof ent.preparedSpells === "string") return "prepared";
		return null;
	}

	static getCasterMeta ({cls, sc, level, getAbilityMod}) {
		const lvl = Math.max(1, Math.min(20, Number(level) || 1));
		const origin = sc?.casterProgression ? "subclass" : cls?.casterProgression ? "class" : null;
		const isPact = (sc?.casterProgression || cls?.casterProgression) === "pact";
		const mode = this.getListMode(sc) || this.getListMode(cls) || (origin ? "known" : null);
		const ability = sc?.spellcastingAbility || cls?.spellcastingAbility || null;
		const name = origin === "subclass" ? (sc?.name || "Subclass") : (cls?.name || "Class");

		const autoSlots = this._extractSlotMaxes(cls, sc, lvl);
		const pact = isPact ? this._extractPact(cls, sc, lvl) : null;

		return {
			isCaster: !!(origin || isPact || autoSlots.some(Boolean) || pact),
			origin,
			name,
			ability,
			mode,
			hint: this._getHint({cls, sc, level: lvl, getAbilityMod, mode}),
			slotMaxes: autoSlots,
			pact,
			spellListClass: this._getSpellListClass(cls, sc),
			maxSlotLevel: this.getMaxSlotLevel({slotMaxes: autoSlots, pact}),
		};
	}

	static _getSpellListClass (cls, sc) {
		const found = new Set();
		const walk = (v) => {
			if (typeof v === "string") {
				const m = /(?:^|[|&])class=([^|&]+)/i.exec(v);
				if (m) found.add(m[1].trim());
				return;
			}
			if (Array.isArray(v)) {
				v.forEach(walk);
				return;
			}
			if (v && typeof v === "object") Object.values(v).forEach(walk);
		};
		walk(sc?.additionalSpells);
		walk(cls?.additionalSpells);
		if (found.size === 1) return [...found][0];
		if (found.has("Wizard") && sc?.casterProgression) return "Wizard";
		if (found.size) return [...found][0];
		if (sc?.casterProgression && !cls?.casterProgression) return "Wizard";
		return cls?.name || null;
	}

	static getMaxSlotLevel ({slotMaxes, pact}) {
		if (pact?.level) return pact.level;
		let max = 0;
		(slotMaxes || []).forEach((n, i) => {
			if (n > 0) max = i + 1;
		});
		return max;
	}

	static getMaxSlotLevelFromState (sc) {
		const cur = this.migrate(sc);
		if (cur.slotsPact && (cur.slotsPact.max > 0 || cur.slotsPact.maxOverride != null)) {
			return cur.slotsPact.level || 1;
		}
		let max = 0;
		for (let lvl = 1; lvl <= 9; ++lvl) {
			if (cur.slots[lvl]?.max > 0) max = lvl;
		}
		return max;
	}

	static getSpellFilterExpression ({spellListClass, maxSlotLevel}) {
		const pts = [];
		const hasCasterList = !!spellListClass || (maxSlotLevel != null && maxSlotLevel > 0);
		if (hasCasterList && maxSlotLevel != null && maxSlotLevel >= 0) {
			const lvls = [];
			for (let i = 0; i <= maxSlotLevel; ++i) lvls.push(i);
			pts.push(`level=${lvls.join(";")}`);
		}
		if (spellListClass) pts.push(`class=${spellListClass}`);
		return pts.length ? pts.join("|") : null;
	}

	static parseSpellTag (tag) {
		const inner = `${tag || ""}`.replace(/^\{@spell\s+/i, "").replace(/\}$/, "");
		const [name, source] = Renderer.splitTagByPipe(inner);
		if (!name) return null;
		return {name, source: source || Parser.SRC_PHB};
	}

	static isReadySpell (sp, mode) {
		if (!sp) return false;
		if (sp.level === 0) return true;
		if (mode === "known") return true;
		return !!sp.prepared;
	}

	static getSpellPlayMeta (ent) {
		if (!ent) return null;
		const comps = ent.components || {};
		return {
			school: Parser.spSchoolAndSubschoolsAbvsShort(ent.school, ent.subschools),
			schoolClass: Parser.spSchoolAbvToStyleClass(ent.school),
			time: Parser.spTimeToShort(ent.time?.[0], false) || "",
			range: Renderer.stripTags(Parser.spRangeToFull(ent.range) || ""),
			comps: [comps.v && "V", comps.s && "S", comps.m && "M", comps.r && "R"].filter(Boolean).join(","),
			isConc: !!(ent.duration || []).some(d => d.concentration),
			isRitual: !!ent.meta?.ritual,
		};
	}

	static _getHint ({cls, sc, level, getAbilityMod, mode}) {
		const ent = sc?.casterProgression || sc?.preparedSpellsProgression || sc?.spellsKnownProgression || sc?.preparedSpells
			? sc
			: cls;
		if (!ent || !mode) return "";
		const ix = level - 1;
		const pts = [];
		const cantrips = ent.cantripProgression?.[ix];
		if (cantrips) pts.push(`Cantrips ${cantrips}`);
		if (mode === "known") {
			const known = ent.spellsKnownProgression?.[ix];
			if (known) pts.push(`Known ${known}`);
		} else {
			const prepared = ent.preparedSpellsProgression?.[ix] ?? this._evalPreparedFormula(ent.preparedSpells, {level, getAbilityMod});
			if (prepared) pts.push(`Prepare ${prepared}`);
		}
		return pts.join(" · ");
	}

	static _evalPreparedFormula (str, {level, getAbilityMod}) {
		if (!str || typeof str !== "string") return null;
		const m = /^<\$level\$>(\s*\/\s*2)?\s*\+\s*<\$([a-z]+)_mod\$>$/.exec(str.trim());
		if (!m) return null;
		const lvlPart = m[1] ? level / 2 : level;
		const mod = getAbilityMod?.(m[2]) ?? 0;
		return Math.floor(lvlPart + mod);
	}

	static _extractSlotMaxes (cls, sc, level) {
		const ix = level - 1;
		const scRow = this._findSpellProgressionRow(this._subclassTableGroups(sc), ix);
		const clsRow = this._findSpellProgressionRow(cls?.classTableGroups, ix);
		const row = scRow || clsRow || [];
		const maxes = [];
		for (let i = 0; i < 9; ++i) maxes[i] = Math.max(0, Number(row[i]) || 0);
		return maxes;
	}

	static _subclassTableGroups (sc) {
		if (!sc?.subclassTableGroups?.length) return [];
		return sc.subclassTableGroups.filter(g => {
			if (!g.subclasses?.length) return true;
			return g.subclasses.some(it => it.name === sc.name && it.source === sc.source);
		});
	}

	static _findSpellProgressionRow (groups, ix) {
		if (!groups?.length) return null;
		const group = groups.find(g => g.rowsSpellProgression);
		if (!group) return null;
		return group.rowsSpellProgression[ix] || null;
	}

	static _extractPact (cls, sc, level) {
		const ix = level - 1;
		const fromCls = this._pactFromGroups(cls?.classTableGroups, ix);
		if (fromCls) return fromCls;
		return this._pactFromGroups(this._subclassTableGroups(sc), ix);
	}

	static _pactFromGroups (groups, ix) {
		if (!groups?.length) return null;
		for (const g of groups) {
			const labels = g.colLabels || [];
			const ixSlots = labels.findIndex(l => /spell slots/i.test(this._plainLabel(l)));
			const ixLevel = labels.findIndex(l => /slot level/i.test(this._plainLabel(l)));
			if (!~ixSlots || !~ixLevel) continue;
			const row = (g.rows || [])[ix];
			if (!row) continue;
			const max = Math.max(0, Number(row[ixSlots]) || 0);
			const slotLevel = this._parseSlotLevel(row[ixLevel]);
			if (!max || !slotLevel) continue;
			return {max, level: slotLevel};
		}
		return null;
	}

	static _plainLabel (lbl) {
		return `${lbl || ""}`.replace(/\{@[^}]+\}/g, " ").replace(/\s+/g, " ").trim();
	}

	static _parseSlotLevel (cell) {
		if (typeof cell === "number") return cell;
		if (typeof cell !== "string") return null;
		const mLevel = /level=(\d+)/i.exec(cell);
		if (mLevel) return Number(mLevel[1]);
		const mOrd = /(\d+)/.exec(cell);
		return mOrd ? Number(mOrd[1]) : null;
	}

	static applyAuto ({existing, meta, identityChanged}) {
		const cur = this.migrate(existing);
		const blocks = [...cur.blocks];

		if (!meta?.origin) {
			cur.blocks = blocks.filter(b => b.origin === "custom");
		} else {
			const ixAuto = blocks.findIndex(b => b.origin === "class" || b.origin === "subclass");
			const nxtAuto = {
				id: CryptUtil.uid(),
				origin: meta.origin,
				name: meta.name,
				ability: meta.ability || "int",
				bonus: 0,
			};
			if (ixAuto >= 0) {
				if (!identityChanged) {
					nxtAuto.id = blocks[ixAuto].id;
					nxtAuto.ability = blocks[ixAuto].ability;
					nxtAuto.bonus = blocks[ixAuto].bonus;
				}
				blocks[ixAuto] = nxtAuto;
			} else blocks.unshift(nxtAuto);
			cur.blocks = blocks;
		}

		cur.slots = this._applySlotMaxes(cur.slots, meta?.slotMaxes || []);
		cur.slotsPact = this._applyPact(cur.slotsPact, meta?.pact || null);

		const validIds = new Set(cur.blocks.map(b => b.id));
		const fallbackId = cur.blocks[0]?.id || null;
		cur.spells = cur.spells.map(sp => {
			if (sp.blockId && validIds.has(sp.blockId)) return sp;
			return {...sp, blockId: fallbackId};
		});
		return cur;
	}

	static _applySlotMaxes (slots, autoMaxes) {
		const out = this._migrateSlots(slots);
		for (let lvl = 1; lvl <= 9; ++lvl) {
			const autoMax = autoMaxes[lvl - 1] || 0;
			const prev = out[lvl];
			const prevMax = prev.maxOverride != null ? prev.maxOverride : prev.max;
			const wasFull = prev.current >= prevMax;
			const max = prev.maxOverride != null ? prev.maxOverride : autoMax;
			out[lvl] = {
				max,
				current: wasFull ? max : Math.max(0, Math.min(prev.current, max)),
				maxOverride: prev.maxOverride,
			};
		}
		return out;
	}

	static _applyPact (existing, autoPact) {
		if (!autoPact) return null;
		const prev = existing || {max: 0, current: 0, level: autoPact.level, maxOverride: null};
		const prevMax = prev.maxOverride != null ? prev.maxOverride : prev.max;
		const wasFull = prev.current >= prevMax;
		const max = prev.maxOverride != null ? prev.maxOverride : autoPact.max;
		return {
			max,
			level: autoPact.level,
			current: wasFull ? max : Math.max(0, Math.min(prev.current || 0, max)),
			maxOverride: prev.maxOverride ?? null,
		};
	}

	static getSaveDc ({abilityMod, pb, bonus}) {
		return 8 + (pb || 0) + (abilityMod || 0) + (bonus || 0);
	}

	static getSpellAttack ({abilityMod, pb, bonus}) {
		return (pb || 0) + (abilityMod || 0) + (bonus || 0);
	}
}

class _SpellBlockComp extends BaseComponent {
	constructor ({parentUi, block}) {
		super();
		this._parentUi = parentUi;
		this._setState({
			id: null,
			origin: "custom",
			name: "",
			ability: "int",
			bonus: 0,
			...MiscUtil.copyFast(block),
		});
		this._addHookAll("state", () => this._parentUi.updateSpellBlock(MiscUtil.copyFast(this.__state)));
	}
}

export class CharactersSpellcastingPanel {
	static render ({parentUi, wrpTab}) {
		wrpTab.vee.addClass("ve-flex-col")
			.vee.addClass("ve-h-100")
			.vee.addClass("ve-min-h-0")
			.vee.addClass("ve-flex-grow-1")
			.vee.addClass("ve-p-2")
			.vee.addClass("ve-charsheet__spell-tab")
			.vee.addClass("ve-overflow-hidden");

		if (parentUi._isSpellLibraryOpen == null) parentUi._isSpellLibraryOpen = false;

		const wrpBlocks = veT`<div class="ve-flex-col ve-w-100 ve-mb-1"></div>`;
		const wrpSlots = veT`<div class="ve-flex-col ve-w-100 ve-mb-1"></div>`;
		const dispHint = veT`<div class="ve-muted ve-small ve-mb-1"></div>`;
		const wrpReadyList = veT`<div class="ve-flex-col ve-w-100"></div>`;
		const wrpLibList = veT`<div class="ve-flex-col ve-w-100 ve-flex-grow-1 ve-min-h-0 ve-overflow-y-auto"></div>`;

		const btnAddBlock = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Add a spellcasting source (feat, item, etc.)"><span class="glyphicon glyphicon-plus"></span> Source</button>`
			.vee.onn("click", () => parentUi.addSpellBlock());
		const btnAddSpell = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Add spell"><span class="glyphicon glyphicon-plus"></span> Spell</button>`
			.vee.onn("click", () => parentUi.pAddSpells().then(null));
		const btnReset = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Refill all spell slots">Reset Slots</button>`
			.vee.onn("click", () => parentUi.resetSpellSlots());
		const btnLibraryTab = veT`<button class="ve-btn ve-btn-xs ve-charsheet__spell-library-tab" title="Show or hide the spell library"><span class="fal fa-book-open"></span><span class="ve-charsheet__spell-library-tab-label">Library</span></button>`;

		const wrpSpellContent = veT`<div class="ve-charsheet__spell-content ve-relative ve-flex-col ve-flex-grow-1 ve-min-h-0 ve-w-100 ve-overflow-hidden"></div>`;
		const wrpDrawer = veT`<div class="ve-charsheet__spell-library-drawer"></div>`;
		const wrpLibrary = veT`<div class="ve-charsheet__spell-library ve-charsheet__panel ve-flex-col ve-min-h-0"></div>`;
		const iptLibSearch = veT`<input class="ve-form-control ve-input-xs form-control--minimal ve-mb-1" type="text" placeholder="Filter library">`;

		const hkLibraryOpen = () => {
			const isOpen = !!parentUi._isSpellLibraryOpen;
			wrpDrawer.vee.toggleClass("ve-charsheet__spell-library-drawer--open", isOpen);
			btnLibraryTab.vee.toggleClass("ve-charsheet__spell-library-tab--open", isOpen);
		};
		btnLibraryTab.vee.onn("click", () => {
			parentUi._isSpellLibraryOpen = !parentUi._isSpellLibraryOpen;
			hkLibraryOpen();
		});
		parentUi._spellLibraryOpenSync = hkLibraryOpen;

		const renderedBlocks = new Map();
		const hkBlocks = () => {
			const {blocks} = CharactersSpellcasting.migrate(parentUi._state.spellcasting);
			const seen = new Set();
			blocks.forEach(block => {
				seen.add(block.id);
				if (renderedBlocks.has(block.id)) return;
				const rendered = this._renderBlock({parentUi, block});
				renderedBlocks.set(block.id, rendered);
				wrpBlocks.vee.appends(rendered.row);
			});
			[...renderedBlocks.entries()].forEach(([id, rendered]) => {
				if (seen.has(id)) return;
				rendered.cleanup();
				rendered.row.remove();
				renderedBlocks.delete(id);
			});
		};

		const hkSlots = () => this._renderSlots({parentUi, wrpSlots, btnReset});
		const hkLists = () => {
			this._renderReady({parentUi, wrpReadyList, dispHint});
			this._renderLibrary({parentUi, wrpLibList, query: iptLibSearch.vee.val()});
		};
		iptLibSearch.vee.onn("input", () => this._renderLibrary({parentUi, wrpLibList, query: iptLibSearch.vee.val()}));

		parentUi._addHookBase("spellcasting", hkBlocks);
		parentUi._addHookBase("spellcasting", hkSlots);
		parentUi._addHookBase("spellcasting", hkLists);
		hkBlocks();
		hkSlots();
		hkLists();
		hkLibraryOpen();

		veT(wrpLibrary)`
			<div class="ve-flex-v-center ve-mb-1">
				<div class="ve-bold ve-flex-grow-1">Library</div>
				${btnAddSpell}
			</div>
			${iptLibSearch}
			${wrpLibList}
		`;
		veT(wrpDrawer)`
			${btnLibraryTab}
			${wrpLibrary}
		`;

		veT(wrpTab)`
			<div class="ve-flex-v-center ve-w-100 ve-mb-1">
				<div class="ve-flex-grow-1"></div>
				<div class="ve-btn-group ve-no-shrink">${btnAddBlock}${btnReset}</div>
			</div>
			${wrpSpellContent}
		`;

		veT(wrpSpellContent)`
			${wrpBlocks}
			${wrpSlots}
			${dispHint}
			<div class="ve-charsheet__spell-body ve-flex-col ve-w-100 ve-flex-grow-1 ve-min-h-0">
				<div class="ve-charsheet__spell-ready ve-flex-col ve-flex-grow-1 ve-min-w-0 ve-min-h-0 ve-overflow-y-auto">
					<div class="ve-bold ve-mb-1">Ready</div>
					${wrpReadyList}
				</div>
			</div>
			${wrpDrawer}
		`;
	}

	static _renderBlock ({parentUi, block}) {
		const comp = new _SpellBlockComp({parentUi, block});
		const isCustom = comp._state.origin === "custom";

		const dispName = veT`<div class="ve-bold ve-mr-2 ve-no-shrink"></div>`;
		const iptName = ComponentUiUtil.getIptStr(
			comp,
			"name",
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-mr-2" type="text" placeholder="Source" style="width: 110px;">`,
			},
		);
		const hkName = () => {
			dispName.vee.txt(comp._state.name || "Spellcasting").vee.toggle(!isCustom);
			iptName.vee.toggle(isCustom);
		};
		comp._addHookBase("name", hkName);
		hkName();

		const selAbil = ComponentUiUtil.getSelEnum(
			comp,
			"ability",
			{
				values: Parser.ABIL_ABVS,
				fnDisplay: ab => ab.toUpperCase(),
				html: `<select class="ve-form-control ve-input-xs ve-charsheet__spell-abil" title="Spellcasting ability"></select>`,
			},
		);

		const iptBonus = ComponentUiUtil.getIptInt(
			comp,
			"bonus",
			0,
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center" type="number" style="width: 36px;" title="Manual bonus">`,
			},
		);

		const dispDc = veT`<span class="ve-charsheet__roller ve-mr-2"></span>`;
		const dispAtk = veT`<span class="ve-charsheet__roller"></span>`;
		const hkRolls = () => {
			const ab = comp._state.ability;
			const abilityMod = parentUi.getAbilityMod(ab);
			const pb = parentUi.getPb();
			const bonus = Number(comp._state.bonus) || 0;
			const dc = CharactersSpellcasting.getSaveDc({abilityMod, pb, bonus});
			const atk = CharactersSpellcasting.getSpellAttack({abilityMod, pb, bonus});
			dispDc.vee.html(Renderer.get().render(`{@dc ${dc}}`));
			dispAtk.vee.html(Renderer.get().render(`{@hit ${atk}}`));
		};
		comp._addHookBase("ability", hkRolls);
		comp._addHookBase("bonus", hkRolls);
		const unhooks = [];
		Parser.ABIL_ABVS.forEach(ab => {
			parentUi._addHookBase(ab, hkRolls);
			unhooks.push(() => parentUi._removeHookBase(ab, hkRolls));
		});
		parentUi._addHookBase("level", hkRolls);
		unhooks.push(() => parentUi._removeHookBase("level", hkRolls));
		hkRolls();

		const btnRemove = veT`<button class="ve-btn ve-btn-xxs ve-btn-danger" title="Remove"><span class="glyphicon glyphicon-trash"></span></button>`
			.vee.toggle(isCustom)
			.vee.onn("click", () => parentUi.removeSpellBlock(comp._state.id));

		return {
			row: veT`<div class="ve-flex-v-center ve-mb-1 ve-charsheet__spell-block">
				${dispName}${iptName}
				<div class="ve-mr-1">${selAbil}</div>
				<div class="ve-muted ve-small ve-mr-1">+</div>
				<div class="ve-mr-2">${iptBonus}</div>
				${dispDc}${dispAtk}
				<div class="ve-ml-auto ve-no-shrink">${btnRemove}</div>
			</div>`,
			cleanup: () => unhooks.forEach(fn => fn()),
		};
	}

	static _renderSlots ({parentUi, wrpSlots, btnReset}) {
		const sc = CharactersSpellcasting.migrate(parentUi._state.spellcasting);
		wrpSlots.vee.empty();

		const hasPact = !!(sc.slotsPact && (sc.slotsPact.max > 0 || sc.slotsPact.maxOverride != null));
		const hasSlots = hasPact || Object.values(sc.slots).some(it => it.max > 0 || it.maxOverride != null);
		btnReset.vee.toggle(hasSlots);
		if (!hasSlots) return;

		if (hasPact) {
			wrpSlots.vee.appends(this._renderSlotRow({
				label: `Pact (${Parser.spLevelToFull(sc.slotsPact.level)})`,
				slot: sc.slotsPact,
				onToggle: (ix) => parentUi.togglePactPip(ix),
				onOverride: (val) => parentUi.setPactMaxOverride(val),
			}));
			return;
		}

		const wrp = veT`<div class="ve-flex ve-flex-wrap ve-charsheet__spell-slots"></div>`;
		for (let lvl = 1; lvl <= 9; ++lvl) {
			const slot = sc.slots[lvl];
			if (!slot.max && slot.maxOverride == null) continue;
			wrp.vee.appends(this._renderSlotRow({
				label: Parser.spLevelToFull(lvl),
				slot,
				onToggle: (ix) => parentUi.toggleSpellPip(lvl, ix),
				onOverride: (val) => parentUi.setSpellSlotMaxOverride(lvl, val),
			}));
		}
		wrpSlots.vee.appends(wrp);
	}

	static _renderSlotRow ({label, slot, onToggle, onOverride}) {
		const max = slot.max;
		const wrpPips = veT`<div class="ve-flex-v-center"></div>`;
		for (let i = 0; i < max; ++i) {
			const isOn = i < slot.current;
			const btn = veT`<button class="ve-btn ve-btn-xxs ve-charsheet__widget-pip ${isOn ? "ve-btn-primary" : "ve-btn-default"}" title="${isOn ? "Remaining" : "Spent"}">&nbsp;</button>`
				.vee.onn("click", () => onToggle(i));
			wrpPips.vee.appends(btn);
		}

		const iptMax = veT`<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__spell-slot-max" type="number" min="0" title="Override max slots; clear to use class table">`
			.vee.val(`${max}`)
			.vee.onn("change", () => {
				const raw = `${iptMax.vee.val()}`.trim();
				if (raw === "") {
					onOverride(null);
					return;
				}
				const n = Number(raw);
				if (!Number.isFinite(n)) return;
				onOverride(Math.max(0, n));
			});

		return veT`<div class="ve-flex-v-center ve-mr-3 ve-mb-1">
			<div class="ve-small ve-bold ve-mr-1 ve-no-shrink">${label.qq()}</div>
			${wrpPips}
			<div class="ve-ml-1">${iptMax}</div>
		</div>`;
	}

	static _spellsByLevel (spells) {
		const byLevel = {};
		spells.forEach(sp => (byLevel[sp.level] ||= []).push(sp));
		return Object.keys(byLevel)
			.map(Number)
			.sort((a, b) => a - b)
			.map(level => ({
				level,
				heading: level === 0 ? "Cantrips" : Parser.spLevelToFullLevelText(level, {isPluralCantrips: false}),
				spells: byLevel[level],
			}));
	}

	static _renderReady ({parentUi, wrpReadyList, dispHint}) {
		const sc = CharactersSpellcasting.migrate(parentUi._state.spellcasting);
		const mode = parentUi._spellcastingMode || "known";
		dispHint.vee.txt(parentUi._spellcastingHint || "").vee.toggle(!!parentUi._spellcastingHint);

		const ready = sc.spells.filter(sp => CharactersSpellcasting.isReadySpell(sp, mode));
		wrpReadyList.vee.empty();
		if (!ready.length) {
			const empty = mode === "known"
				? "No spells. Add some in the library."
				: "None prepared. Toggle spells in the library.";
			wrpReadyList.vee.html(`<div class="ve-muted ve-italic">${empty}</div>`);
			return;
		}

		this._spellsByLevel(ready).forEach(({heading, spells}) => {
			wrpReadyList.vee.appends(`<div class="ve-bold ve-small ve-mt-2 ve-mb-1">${heading.qq()}</div>`);
			spells.forEach(sp => wrpReadyList.vee.appends(this._renderReadyRow({parentUi, sp, blocks: sc.blocks})));
		});
	}

	static _renderLibrary ({parentUi, wrpLibList, query}) {
		const sc = CharactersSpellcasting.migrate(parentUi._state.spellcasting);
		const mode = parentUi._spellcastingMode || "known";
		const q = `${query || ""}`.trim().toLowerCase();
		const list = q
			? sc.spells.filter(sp => `${sp.tag}`.toLowerCase().includes(q))
			: sc.spells;

		wrpLibList.vee.empty();
		if (!sc.spells.length) {
			wrpLibList.vee.html(`<div class="ve-muted ve-italic">No spells in the library.</div>`);
			return;
		}
		if (!list.length) {
			wrpLibList.vee.html(`<div class="ve-muted ve-italic">No matches.</div>`);
			return;
		}

		this._spellsByLevel(list).forEach(({heading, spells}) => {
			wrpLibList.vee.appends(`<div class="ve-muted ve-small ve-mt-1 ve-mb-1">${heading.qq()}</div>`);
			spells.forEach(sp => wrpLibList.vee.appends(this._renderLibraryRow({parentUi, sp, blocks: sc.blocks, mode})));
		});
	}

	static _renderSpellName (tag) {
		const disp = veT`<div class="ve-charsheet__spell-name ve-min-w-0 ve-flex-grow-1"></div>`;
		try {
			disp.vee.html(Renderer.get().render(tag));
		} catch {
			disp.vee.html(`<span class="ve-muted">${`${tag}`.qq()}</span>`);
		}
		return disp;
	}

	static _renderReadyRow ({parentUi, sp, blocks}) {
		const ent = parentUi.getSpellEntity(sp.tag);
		const meta = CharactersSpellcasting.getSpellPlayMeta(ent);
		const dispName = this._renderSpellName(sp.tag);

		const wrpBadges = veT`<span class="ve-charsheet__spell-badges ve-no-shrink"></span>`;
		if (meta?.isConc) wrpBadges.vee.appends(veT`<span class="ve-charsheet__spell-badge" title="Concentration">C</span>`);
		if (meta?.isRitual) wrpBadges.vee.appends(veT`<span class="ve-charsheet__spell-badge" title="Ritual">R</span>`);
		wrpBadges.vee.toggle(!!(meta?.isConc || meta?.isRitual));

		const school = meta
			? veT`<span class="ve-charsheet__spell-meta ${meta.schoolClass || ""}" title="School">${meta.school.qq()}</span>`
			: "";
		const time = meta ? veT`<span class="ve-charsheet__spell-meta ve-muted" title="Casting time">${meta.time.qq()}</span>` : "";
		const range = meta ? veT`<span class="ve-charsheet__spell-meta ve-muted" title="Range">${meta.range.qq()}</span>` : "";
		const comps = meta ? veT`<span class="ve-charsheet__spell-meta ve-muted" title="Components">${meta.comps.qq()}</span>` : "";

		let dispRolls = null;
		if (blocks.length > 1) {
			const block = blocks.find(b => b.id === sp.blockId) || blocks[0];
			if (block) {
				const abilityMod = parentUi.getAbilityMod(block.ability);
				const pb = parentUi.getPb();
				const bonus = Number(block.bonus) || 0;
				const dc = CharactersSpellcasting.getSaveDc({abilityMod, pb, bonus});
				const atk = CharactersSpellcasting.getSpellAttack({abilityMod, pb, bonus});
				dispRolls = veT`<span class="ve-charsheet__spell-meta ve-no-shrink">
					<span class="ve-charsheet__roller ve-mr-1">${Renderer.get().render(`{@hit ${atk}}`)}</span>
					<span class="ve-charsheet__roller">${Renderer.get().render(`{@dc ${dc}}`)}</span>
				</span>`;
			}
		}

		return veT`<div class="ve-charsheet__spell-ready-row">
			${dispName}
			${school}
			${time}
			${range}
			${comps}
			${wrpBadges}
			${dispRolls || ""}
		</div>`;
	}

	static _renderLibraryRow ({parentUi, sp, blocks, mode}) {
		const dispName = this._renderSpellName(sp.tag);
		const isCantrip = sp.level === 0;
		const showPrepared = !isCantrip && (mode === "prepared" || mode === "book");
		const showBook = !isCantrip && mode === "book";

		const cbPrepared = veT`<input type="checkbox" title="Prepared">`
			.vee.prop("checked", !!sp.prepared)
			.vee.onn("change", () => parentUi.setSpellFlag(sp.id, "prepared", cbPrepared.vee.prop("checked")));
		const wrpPrepared = veT`<label class="ve-flex-v-center ve-no-select ve-small ve-mr-1" title="Prepared">${cbPrepared}</label>`
			.vee.toggle(showPrepared);

		const cbBook = veT`<input type="checkbox" title="In spellbook">`
			.vee.prop("checked", !!sp.inBook)
			.vee.onn("change", () => parentUi.setSpellFlag(sp.id, "inBook", cbBook.vee.prop("checked")));
		const wrpBook = veT`<label class="ve-flex-v-center ve-no-select ve-small ve-mr-1" title="In spellbook">${cbBook}</label>`
			.vee.toggle(showBook);

		let selBlock = null;
		if (blocks.length > 1) {
			selBlock = veT`<select class="ve-form-control ve-input-xs ve-mr-1 ve-charsheet__spell-block-sel" title="Spellcasting source"></select>`;
			blocks.forEach(b => {
				veT`<option value="${b.id.qq()}" ${b.id === sp.blockId ? "selected" : ""}></option>`
					.vee.txt(b.name || "Block")
					.vee.appendTo(selBlock);
			});
			selBlock.vee.onn("change", () => parentUi.setSpellBlockId(sp.id, selBlock.vee.val()));
		}

		const btnRemove = veT`<button class="ve-btn ve-btn-xxs ve-btn-danger" title="Remove"><span class="glyphicon glyphicon-trash"></span></button>`
			.vee.onn("click", () => parentUi.removeSpell(sp.id));

		return veT`<div class="ve-flex-v-center ve-mb-1 ve-charsheet__spell-lib-row">
			${wrpBook}${wrpPrepared}
			${dispName}
			${selBlock || ""}
			<div class="ve-no-shrink">${btnRemove}</div>
		</div>`;
	}
}
