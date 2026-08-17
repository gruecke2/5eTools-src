import {ModalFilterClasses} from "../filter-classes-raw.js";
import {
	CHARACTERS_FILE_TYPE,
	FEATURE_SECTION_BACKGROUND,
	FEATURE_SECTION_CLASS,
	FEATURE_SECTION_CUSTOM,
	FEATURE_SECTION_RACE,
	FEATURE_SECTION_SUBCLASS,
	FEATURE_SECTION_TAB_TITLES,
	FEATURE_SECTIONS,
	FEATURE_SECTIONS_AUTO,
	ARMOR_WEAPON_PROF_DEFS,
	awpToProp,
	DAMAGE_TYPE_UI,
	getSkills,
	migrateSkillProf,
	saveToProp,
	SKILL_PROF_MULT,
	skillToProp,
	TAB_SPELLCASTING_TITLE,
} from "./characters-const.js";
import {CharactersFeatureCollector} from "./characters-features.js";
import {CharactersCustomFeatureCollection, CharactersInventoryCollection} from "./characters-inventory.js";
import {CharactersProficienciesCollector} from "./characters-proficiencies.js";
import {CharactersSpellcasting, CharactersSpellcastingPanel} from "./characters-spellcasting.js";
import {CharactersFeatureWidgets} from "./characters-widgets.js";
import {InitiativeTrackerUtil} from "../initiativetracker/initiativetracker-utils.js";

export class CharactersUi extends BaseComponent {
	constructor (
		{
			races,
			backgrounds,
			feats,
			items,
			spells,
		},
	) {
		super();

		TabUiUtil.decorate(this, {isInitMeta: true});

		this._races = races;
		this._backgrounds = backgrounds;
		this._feats = feats;
		this._items = items;
		this._spellsByUid = new Map(
			(spells || []).map(sp => [`${sp.name}|${sp.source}`.toLowerCase(), sp]),
		);

		this._modalFilterRaces = new ModalFilterRaces({namespace: "characters.races", isRadio: true, allData: races});
		this._modalFilterBackgrounds = new ModalFilterBackgrounds({namespace: "characters.backgrounds", isRadio: true, allData: backgrounds});
		this._modalFilterClasses = new ModalFilterClasses({namespace: "characters.classes"});
		this._modalFilterItems = new ModalFilterItems({namespace: "characters.items", allData: items});
		this._modalFilterSpells = new ModalFilterSpells({namespace: "characters.spells", allData: spells});

		this._loadedClass = null;
		this._loadedClassIdent = null;
		this._loadedSubclass = null;
		this._loadedSubclassIdent = null;
		this._featureRenderToken = 0;
		this._featureTabMetas = null;
		this._tabMetaSpellcasting = null;
		this._ixTabSpellcasting = null;
		this._ixTabCustom = null;
		this._spellcastingIdent = null;
		this._spellcastingMode = "known";
		this._spellcastingHint = "";
		this._spellcastingIsCaster = false;
		this._spellcastingSpellListClass = null;
		this._isSpellLibraryOpen = false;

		this._collectionInventory = null;
		this._collectionCustomFeatures = null;
	}

	async pInit () {
		await Promise.all([
			this._modalFilterRaces.pPopulateHiddenWrapper(),
			this._modalFilterBackgrounds.pPopulateHiddenWrapper(),
			this._modalFilterClasses.pPopulateHiddenWrapper(),
			this._modalFilterItems.pPopulateHiddenWrapper(),
			this._modalFilterSpells.pPopulateHiddenWrapper(),
		]);
	}

	addHookAll (hookProp, hook) { return this._addHookAll(hookProp, hook); }

	getSaveableState () {
		return {
			...this.getBaseSaveableState(),
			meta: MiscUtil.copyFast(this.__meta),
		};
	}

	setStateFrom (toLoad, isOverwrite = false) {
		if (!toLoad) return;
		toLoad = MiscUtil.copyFast(toLoad);
		if (toLoad.state) {
			getSkills().forEach(skill => {
				const prop = skillToProp(skill);
				if (prop in toLoad.state || isOverwrite) toLoad.state[prop] = migrateSkillProf(toLoad.state[prop]);
			});
			if (!toLoad.state.otherProficienciesExtra) {
				toLoad.state.otherProficienciesExtra = {
					weapons: [],
					languages: [],
					tools: [],
				};
			}
			ARMOR_WEAPON_PROF_DEFS.forEach(({id}) => {
				const prop = awpToProp(id);
				if (!(prop in toLoad.state)) toLoad.state[prop] = false;
			});
			toLoad.state.spellcasting = CharactersSpellcasting.migrate(toLoad.state.spellcasting);
			if (!Array.isArray(toLoad.state.resistances)) toLoad.state.resistances = [];
		}
		super.setStateFrom(toLoad, isOverwrite);
		if (toLoad.meta) this._proxyAssignSimple("meta", toLoad.meta, true);
	}

	isSheetStarted () {
		if ((this._state.name || "").trim()) return true;
		if (this._state.className) return true;
		if (Parser.ABIL_ABVS.some(ab => this._state[ab] !== 10)) return true;
		if (this._state.raceHash || this._state.backgroundHash) return true;
		if (this._state.featHashes?.length) return true;
		if (this._state.inventory?.length) return true;
		if (this._state.customFeatures?.length) return true;
		const sc = CharactersSpellcasting.migrate(this._state.spellcasting);
		if (sc.blocks.length || sc.spells.length) return true;
		return false;
	}

	applyStatgenImport (snapshot) {
		if (!snapshot) return;

		const nxt = {};
		if (snapshot.abilities) {
			Parser.ABIL_ABVS.forEach(ab => {
				if (snapshot.abilities[ab] != null) nxt[ab] = snapshot.abilities[ab];
			});
		}
		if (snapshot.raceHash !== undefined) nxt.raceHash = snapshot.raceHash;
		if (snapshot.backgroundHash !== undefined) nxt.backgroundHash = snapshot.backgroundHash;
		if (snapshot.featHashes !== undefined) nxt.featHashes = MiscUtil.copyFast(snapshot.featHashes || []);
		this._proxyAssignSimple("state", nxt);
		this._pApplyAutoArmorWeaponProfs().then(null);
	}

	async doResetAll () {
		if (
			!await InputUiUtil.pGetUserBoolean({
				title: "Reset Sheet",
				htmlDescription: `<div>This will clear the current character sheet.<br>Are you sure?</div>`,
			})
		) return;

		this._setState(this._getDefaultState());
		this._loadedClass = null;
		this._loadedClassIdent = null;
		this._loadedSubclass = null;
		this._loadedSubclassIdent = null;
		this._spellcastingIdent = null;
		this._spellcastingIsCaster = false;
	}

	getPb () {
		return Parser.levelToPb(this._state.level);
	}

	getAbilityMod (ab) {
		return Parser.getAbilityModNumber(this._state[ab] ?? 10);
	}

	getSaveBonus (ab) {
		return this.getAbilityMod(ab) + (this._state[saveToProp(ab)] ? this.getPb() : 0);
	}

	getSkillBonus (skill) {
		const ab = Parser.skillToAbilityAbv(skill);
		const mult = SKILL_PROF_MULT[this._state[skillToProp(skill)]] ?? 0;
		return this.getAbilityMod(ab) + Math.floor(this.getPb() * mult);
	}

	addFeatureWidget (featureKey, type, wrpWidgets) {
		const widget = CharactersFeatureWidgets.getDefault(type);
		const nxt = MiscUtil.copyFast(this._state.featureWidgets || {});
		nxt[featureKey] = [...(nxt[featureKey] || []), widget];
		this._state.featureWidgets = nxt;
		if (wrpWidgets) wrpWidgets.vee.appends(CharactersFeatureWidgets.renderRow({parentUi: this, featureKey, widget, isPromptPick: type === "reference"}));
	}

	updateFeatureWidget (featureKey, widgetState) {
		const nxt = MiscUtil.copyFast(this._state.featureWidgets || {});
		const list = [...(nxt[featureKey] || [])];
		const ix = list.findIndex(it => it.id === widgetState.id);
		if (!~ix) return;
		list[ix] = widgetState;
		nxt[featureKey] = list;
		this._state.featureWidgets = nxt;
	}

	removeFeatureWidget (featureKey, widgetId) {
		const nxt = MiscUtil.copyFast(this._state.featureWidgets || {});
		nxt[featureKey] = (nxt[featureKey] || []).filter(it => it.id !== widgetId);
		if (!nxt[featureKey].length) delete nxt[featureKey];
		this._state.featureWidgets = nxt;
	}

	removeFeatureWidgetsForKey (featureKey) {
		const nxt = MiscUtil.copyFast(this._state.featureWidgets || {});
		if (!(featureKey in nxt)) return;
		delete nxt[featureKey];
		this._state.featureWidgets = nxt;
	}

	_getRace () {
		return this._findByHash(this._races, UrlUtil.PG_RACES, this._state.raceHash);
	}

	_getBackground () {
		return this._findByHash(this._backgrounds, UrlUtil.PG_BACKGROUNDS, this._state.backgroundHash);
	}

	_getFeats () {
		return (this._state.featHashes || [])
			.map(hash => ({hash, feat: this._findByHash(this._feats, UrlUtil.PG_FEATS, hash)}))
			.filter(it => it.feat);
	}

	_findByHash (arr, page, hash) {
		if (!hash) return null;
		return (arr || []).find(it => UrlUtil.URL_TO_HASH_BUILDER[page](it) === hash) || null;
	}

	async _pGetClass () {
		if (!this._state.className || !this._state.classSource) {
			this._loadedClass = null;
			this._loadedClassIdent = null;
			return null;
		}

		const ident = `${this._state.className}|${this._state.classSource}`;
		if (this._loadedClassIdent === ident) return this._loadedClass;

		const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CLASSES]({
			name: this._state.className,
			source: this._state.classSource,
		});
		this._loadedClass = await DataLoader.pCacheAndGet(UrlUtil.PG_CLASSES, this._state.classSource, hash, {isSilent: true});
		this._loadedClassIdent = ident;
		return this._loadedClass;
	}

	async _pGetSubclass () {
		if (!this._state.subclassName || !this._state.subclassSource || !this._state.className) {
			this._loadedSubclass = null;
			this._loadedSubclassIdent = null;
			return null;
		}

		const ident = [
			this._state.className,
			this._state.classSource,
			this._state.subclassName,
			this._state.subclassShortName,
			this._state.subclassSource,
		].join("|");
		if (this._loadedSubclassIdent === ident) return this._loadedSubclass;

		const scMeta = {
			name: this._state.subclassName,
			shortName: this._state.subclassShortName || this._state.subclassName,
			source: this._state.subclassSource,
			className: this._state.className,
			classSource: this._state.classSource,
		};
		const hash = UrlUtil.URL_TO_HASH_BUILDER["subclass"](scMeta);
		this._loadedSubclass = await DataLoader.pCacheAndGet("subclass", this._state.subclassSource, hash, {isSilent: true});
		this._loadedSubclassIdent = ident;
		return this._loadedSubclass;
	}

	render (parent) {
		parent.vee.empty();

		const wrpToolbar = this._render_toolbar();
		const wrpLhs = this._render_lhs();
		const wrpRhs = this._render_rhs();

		veT(parent)`
			<div class="ve-flex-col ve-w-100 ve-h-100 ve-min-h-0 ve-charsheet__wrp">
				${wrpToolbar}
				<div class="ve-flex ve-w-100 ve-flex-grow-1 ve-min-h-0 ve-charsheet">
					${wrpLhs}
					${wrpRhs}
				</div>
			</div>
		`;
	}

	_render_toolbar () {
		const btnSave = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Save to File"><span class="glyphicon glyphicon-download"></span></button>`
			.vee.onn("click", () => {
				const namePart = (this._state.name || "character").toLowerCase().replace(/[^\w]+/g, "-");
				DataUtil.userDownload(namePart || "character", this.getSaveableState(), {fileType: CHARACTERS_FILE_TYPE});
			});

		const btnLoad = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Load from File"><span class="glyphicon glyphicon-upload"></span></button>`
			.vee.onn("click", async () => {
				const {jsons, errors} = await InputUiUtil.pGetUserUploadJson({expectedFileTypes: [CHARACTERS_FILE_TYPE]});
				DataUtil.doHandleFileLoadErrorsGeneric(errors);
				if (!jsons?.length) return;
				this.setStateFrom(jsons[0], true);
			});

		const btnReset = veT`<button class="ve-btn ve-btn-xs ve-btn-danger" title="Reset All"><span class="glyphicon glyphicon-refresh"></span></button>`
			.vee.onn("click", () => this.doResetAll());

		return veT`<div class="ve-flex-v-center ve-mb-2">
			<div class="ve-btn-group ve-mr-2">${btnSave}${btnLoad}</div>
			<div class="ve-btn-group">${btnReset}</div>
		</div>`;
	}

	_render_lhs () {
		return veT`<div class="ve-flex-col ve-flex-4 ve-charsheet__col ve-charsheet__wrp-scroll ve-pr-1">
			${this._render_identity()}
			${this._render_abilities()}
			${this._render_skills()}
			${this._render_otherProficiencies()}
			${this._render_inventory()}
		</div>`;
	}

	_render_rhs () {
		return veT`<div class="ve-flex-col ve-flex-6 ve-charsheet__col ve-pl-1 ve-min-h-0">
			${this._render_features()}
		</div>`;
	}

	_render_identity () {
		const iptName = ComponentUiUtil.getIptStr(
			this,
			"name",
			{
				html: `<input class="ve-form-control form-control--minimal" type="text" placeholder="Character name">`,
			},
		);

		const iptLevel = ComponentUiUtil.getIptInt(
			this,
			"level",
			1,
			{
				min: 1,
				max: 20,
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center" type="number" style="width: 52px;" title="Level">`,
			},
		);

		const dispPb = veT`<span class="ve-bold"></span>`;
		const hkPb = () => dispPb.vee.txt(UiUtil.intToBonus(this.getPb()));
		this._addHookBase("level", hkPb);
		hkPb();

		const dispClass = veT`<div class="ve-flex-v-center ve-min-w-0"></div>`;
		const hkClass = () => {
			if (!this._state.className) {
				dispClass.vee.html(`<i class="ve-muted">No class selected</i>`);
				return;
			}
			const classTag = `{@class ${this._state.className}|${this._state.classSource}}`;
			if (this._state.subclassShortName || this._state.subclassName) {
				const scName = this._state.subclassShortName || this._state.subclassName;
				const scTag = `{@subclass ${scName}|${this._state.className}|${this._state.classSource}|${this._state.subclassSource}}`;
				dispClass.vee.html(Renderer.get().render(`${classTag} (${scTag})`));
				return;
			}
			dispClass.vee.html(Renderer.get().render(classTag));
		};
		this._addHookBase("className", hkClass);
		this._addHookBase("classSource", hkClass);
		this._addHookBase("subclassName", hkClass);
		this._addHookBase("subclassShortName", hkClass);
		this._addHookBase("subclassSource", hkClass);
		hkClass();

		const btnClass = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Choose Class and Subclass"><span class="glyphicon glyphicon-search"></span></button>`
			.vee.onn("click", () => this._pSelectClass());

		const btnClearClass = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Clear Class"><span class="glyphicon glyphicon-remove"></span></button>`
			.vee.onn("click", () => {
				this._proxyAssignSimple(
					"state",
					{
						className: null,
						classSource: null,
						subclassName: null,
						subclassShortName: null,
						subclassSource: null,
					},
				);
				this._pApplyAutoArmorWeaponProfs().then(null);
			});
		const hkHasClass = () => btnClearClass.vee.toggle(!!this._state.className);
		this._addHookBase("className", hkHasClass);
		hkHasClass();

		const btnClearSubclass = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Clear Subclass">Sc</button>`
			.vee.onn("click", () => {
				this._proxyAssignSimple(
					"state",
					{
						subclassName: null,
						subclassShortName: null,
						subclassSource: null,
					},
				);
			});
		const hkHasSubclass = () => btnClearSubclass.vee.toggle(!!this._state.subclassName);
		this._addHookBase("subclassName", hkHasSubclass);
		hkHasSubclass();

		const dispRace = veT`<div class="ve-flex-v-center ve-min-w-0"></div>`;
		const hkRace = () => {
			const race = this._getRace();
			dispRace.vee.html(race ? Renderer.get().render(`{@race ${race.name}|${race.source}}`) : `<i class="ve-muted">None</i>`);
		};
		this._addHookBase("raceHash", hkRace);
		hkRace();

		const btnRace = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Choose Species"><span class="glyphicon glyphicon-search"></span></button>`
			.vee.onn("click", () => this._pSelectHashEntity({
				modal: this._modalFilterRaces,
				propHash: "raceHash",
				page: UrlUtil.PG_RACES,
				arr: this._races,
			}));
		const btnClearRace = this._getBtnClearHash("raceHash", "Clear Species");

		const dispBackground = veT`<div class="ve-flex-v-center ve-min-w-0"></div>`;
		const hkBackground = () => {
			const background = this._getBackground();
			dispBackground.vee.html(background ? Renderer.get().render(`{@background ${background.name}|${background.source}}`) : `<i class="ve-muted">None</i>`);
		};
		this._addHookBase("backgroundHash", hkBackground);
		hkBackground();

		const btnBackground = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Choose Background"><span class="glyphicon glyphicon-search"></span></button>`
			.vee.onn("click", () => this._pSelectHashEntity({
				modal: this._modalFilterBackgrounds,
				propHash: "backgroundHash",
				page: UrlUtil.PG_BACKGROUNDS,
				arr: this._backgrounds,
			}));
		const btnClearBackground = this._getBtnClearHash("backgroundHash", "Clear Background");

		return veT`<div class="ve-charsheet__panel ve-p-2 ve-mb-2">
			<div class="ve-flex-v-center ve-mb-2">${iptName}</div>
			<div class="ve-flex-v-center ve-mb-1">
				<div class="ve-mr-2 ve-no-shrink ve-w-80p">Level</div>
				${iptLevel}
				<div class="ve-ml-3 ve-mr-1 ve-no-shrink">PB</div>
				${dispPb}
			</div>
			<div class="ve-flex-v-center ve-mb-1">
				<div class="ve-mr-2 ve-no-shrink ve-w-80p">Class</div>
				<div class="ve-btn-group ve-mr-2 ve-no-shrink">${btnClass}${btnClearClass}${btnClearSubclass}</div>
				${dispClass}
			</div>
			<div class="ve-flex-v-center ve-mb-1">
				<div class="ve-mr-2 ve-no-shrink ve-w-80p">Species</div>
				<div class="ve-btn-group ve-mr-2 ve-no-shrink">${btnRace}${btnClearRace}</div>
				${dispRace}
			</div>
			<div class="ve-flex-v-center">
				<div class="ve-mr-2 ve-no-shrink ve-w-80p">Background</div>
				<div class="ve-btn-group ve-mr-2 ve-no-shrink">${btnBackground}${btnClearBackground}</div>
				${dispBackground}
			</div>
		</div>`;
	}

	_render_abilities () {
		const abilityBlocks = Parser.ABIL_ABVS.map(ab => {
			const ipt = ComponentUiUtil.getIptInt(
				this,
				ab,
				10,
				{
					min: 1,
					max: 30,
					html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__ipt-score" type="number">`,
				},
			);

			const dispRoll = veT`<span class="ve-charsheet__roller ve-text-center"></span>`;
			const hkRoll = () => {
				const score = this._state[ab] ?? 10;
				dispRoll.vee.html(Renderer.get().render(`{@ability ${ab} ${score}|${Parser.getAbilityModifier(score)}}`));
			};
			this._addHookBase(ab, hkRoll);
			hkRoll();

			return veT`<div class="ve-charsheet__ability-block">
				<div class="ve-bold ve-small">${ab.toUpperCase()}</div>
				<div class="ve-my-1">${ipt}</div>
				${dispRoll}
			</div>`;
		});

		return veT`<div class="ve-charsheet__panel ve-p-2 ve-mb-2">
			<div class="ve-bold ve-mb-2">Ability Scores</div>
			<div class="ve-charsheet__abilities-row">${abilityBlocks}</div>
			<div class="ve-charsheet__stats-sub">
				<div class="ve-charsheet__stats-sub-block ve-charsheet__stats-sub-saves">
					<div class="ve-charsheet__stats-sub-label">Saving Throws</div>
					${this._render_savesInner()}
				</div>
				<div class="ve-charsheet__stats-sub-block ve-charsheet__stats-sub-combat">
					<div class="ve-charsheet__stats-sub-label">Combat</div>
					${this._render_combatInner()}
				</div>
			</div>
		</div>`;
	}

	_render_savesInner () {
		const saveRows = Parser.ABIL_ABVS.map(ab => {
			const cb = ComponentUiUtil.getCbBool(this, saveToProp(ab));
			const dispRoll = veT`<span class="ve-charsheet__roller ve-text-center"></span>`;
			const hkRoll = () => {
				const bonus = this.getSaveBonus(ab);
				dispRoll.vee.html(Renderer.get().render(`{@savingThrow ${ab} ${bonus}}`));
			};
			this._addHookBase(ab, hkRoll);
			this._addHookBase(saveToProp(ab), hkRoll);
			this._addHookBase("level", hkRoll);
			hkRoll();

			return veT`<div class="ve-flex-v-center ve-no-select ve-charsheet__save-chip">
				<label class="ve-flex-v-center ve-min-w-0">
					<div class="ve-mr-1">${cb}</div>
					<div class="ve-bold ve-small ve-mr-1">${ab.toUpperCase()}</div>
				</label>
				${dispRoll}
			</div>`;
		});

		return veT`<div class="ve-charsheet__saves-row">${saveRows}</div>`;
	}

	_render_combatInner () {
		const hpOpts = {
			isAllowNull: true,
			fallbackOnNaN: null,
		};
		const iptHpCurrent = ComponentUiUtil.getIptNumber(
			this,
			"hpCurrent",
			null,
			{
				...hpOpts,
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__ipt-hp" type="text" inputmode="decimal" placeholder="—" title="Current HP. Type +5 / -10 / =20 to adjust.">`,
			},
		)
			.vee.onn("click", () => iptHpCurrent.select());
		const iptHpMax = ComponentUiUtil.getIptNumber(
			this,
			"hpMax",
			null,
			{
				...hpOpts,
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__ipt-hp" type="text" inputmode="decimal" placeholder="—" title="Max HP. Type +5 / -10 / =20 to adjust.">`,
			},
		)
			.vee.onn("click", () => iptHpMax.select());

		const hkHpColors = () => {
			const cur = this._state.hpCurrent;
			const max = this._state.hpMax;
			if (cur == null || max == null || !max) {
				iptHpCurrent.vee.css({"color": ""});
				iptHpMax.vee.css({"color": ""});
				return;
			}
			const woundLevel = InitiativeTrackerUtil.getWoundLevel(100 * cur / max);
			if (~woundLevel) {
				const {color} = InitiativeTrackerUtil.getWoundMeta(woundLevel);
				iptHpCurrent.vee.css({"color": color});
				iptHpMax.vee.css({"color": color});
			} else {
				iptHpCurrent.vee.css({"color": ""});
				iptHpMax.vee.css({"color": ""});
			}
		};
		this._addHookBase("hpCurrent", hkHpColors);
		this._addHookBase("hpMax", hkHpColors);
		hkHpColors();

		const iptAc = ComponentUiUtil.getIptStr(
			this,
			"ac",
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center" type="text" placeholder="AC" style="width: 52px;">`,
			},
		);
		const iptSpeed = ComponentUiUtil.getIptStr(
			this,
			"speed",
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal" type="text" placeholder="30 ft." style="width: 72px;">`,
			},
		);

		const dispHitDice = veT`<span class="ve-muted ve-small"></span>`;
		const hkHitDice = async () => {
			const cls = await this._pGetClass();
			const html = CharactersFeatureCollector.getHitDiceText(cls);
			dispHitDice.vee.html(html ? `HD ${html}` : "");
		};
		this._addHookBase("className", hkHitDice);
		this._addHookBase("classSource", hkHitDice);
		hkHitDice().then(null);

		const wrpResist = veT`<div class="ve-charsheet__resist-toggles"></div>`;
		const resistBtns = Parser.DMG_TYPES.map(typ => {
			const meta = DAMAGE_TYPE_UI[typ] || {label: typ.toTitleCase(), icon: "fa-shield"};
			const btn = veT`<button class="ve-btn ve-btn-xxs ve-btn-default ve-charsheet__resist-toggle" title="${typ.toTitleCase()}">
				<span class="fal ${meta.icon.qq()} ve-charsheet__resist-icon"></span>
				<span class="ve-charsheet__resist-label">${meta.label.qq()}</span>
			</button>`
				.vee.onn("click", () => this._toggleResistance(typ));
			wrpResist.vee.appends(btn);
			return {typ, btn};
		});
		const hkResist = () => {
			const selected = new Set(this._state.resistances || []);
			resistBtns.forEach(({typ, btn}) => {
				const isOn = selected.has(typ);
				btn.vee.toggleClass("ve-btn-primary", isOn).vee.toggleClass("ve-btn-default", !isOn);
			});
		};
		this._addHookBase("resistances", hkResist);
		hkResist();

		return veT`<div class="ve-flex-col ve-w-100">
			<div class="ve-charsheet__combat-row">
				<div class="ve-flex-v-center ve-charsheet__combat-field">
					<div class="ve-mr-1 ve-small ve-no-shrink">HP</div>
					${iptHpCurrent}
					<div class="ve-mx-1 ve-muted">/</div>
					${iptHpMax}
				</div>
				<div class="ve-flex-v-center ve-charsheet__combat-field">
					<div class="ve-mr-1 ve-small ve-no-shrink">AC</div>
					${iptAc}
				</div>
				<div class="ve-flex-v-center ve-charsheet__combat-field">
					<div class="ve-mr-1 ve-small ve-no-shrink">Spd</div>
					${iptSpeed}
				</div>
				${dispHitDice}
			</div>
			<div class="ve-flex-v-top ve-charsheet__combat-row ve-mt-1">
				<div class="ve-mr-1 ve-small ve-no-shrink ve-pt-1" title="Damage resistances">Resist</div>
				${wrpResist}
			</div>
		</div>`;
	}

	_toggleResistance (typ) {
		const cur = [...(this._state.resistances || [])];
		const ix = cur.indexOf(typ);
		if (~ix) cur.splice(ix, 1);
		else cur.push(typ);
		this._state.resistances = cur;
	}

	_render_skills () {
		const skillRows = getSkills().map(skill => {
			const prop = skillToProp(skill);
			const ab = Parser.skillToAbilityAbv(skill);
			const cycler = ProfUiUtil.getProfCycler(migrateSkillProf(this._state[prop]));
			cycler.setState(migrateSkillProf(this._state[prop]));
			cycler.ele.vee.onn("change", () => {
				this._state[prop] = cycler.getState();
			});
			this._addHookBase(prop, () => cycler.setState(migrateSkillProf(this._state[prop])));

			const dispRoll = veT`<span class="ve-charsheet__roller ve-text-center"></span>`;
			const hkRoll = () => {
				const bonus = this.getSkillBonus(skill);
				dispRoll.vee.html(Renderer.get().render(`{@skillCheck ${skill.replace(/ /g, "_")} ${bonus}}`));
			};
			this._addHookBase(ab, hkRoll);
			this._addHookBase(prop, hkRoll);
			this._addHookBase("level", hkRoll);
			hkRoll();

			return veT`<div class="ve-flex-v-center ve-mb-1 ve-no-select">
				<div class="ve-flex-v-center ve-flex-grow-1 ve-min-w-0">
					<div class="ve-mr-1">${cycler.ele}</div>
					<div class="ve-flex-grow-1 ve-min-w-0">${skill.toTitleCase()} <span class="ve-muted ve-small">(${ab.toUpperCase()})</span></div>
				</div>
				${dispRoll}
			</div>`;
		});

		return veT`<div class="ve-charsheet__panel ve-p-2 ve-mb-2">
			<div class="ve-bold ve-mb-1">Skills</div>
			<div class="ve-charsheet__skills-grid">${skillRows}</div>
		</div>`;
	}

	_render_otherProficiencies () {
		const wrpAutoWeapons = veT`<div class="ve-charsheet__prof-auto ve-min-w-0"></div>`;
		const wrpAutoLanguages = veT`<div class="ve-charsheet__prof-auto ve-min-w-0"></div>`;
		const wrpAutoTools = veT`<div class="ve-charsheet__prof-auto ve-min-w-0"></div>`;
		const wrpExtraWeapons = veT`<div class="ve-flex-col ve-charsheet__prof-extra"></div>`;
		const wrpExtraLanguages = veT`<div class="ve-flex-col ve-charsheet__prof-extra"></div>`;
		const wrpExtraTools = veT`<div class="ve-flex-col ve-charsheet__prof-extra"></div>`;

		const wrpToggles = veT`<div class="ve-charsheet__prof-toggles ve-mb-2"></div>`;
		ARMOR_WEAPON_PROF_DEFS.forEach(({id, label}) => {
			const cb = ComponentUiUtil.getCbBool(this, awpToProp(id));
			wrpToggles.vee.appends(veT`<label class="ve-flex-v-center ve-no-select ve-charsheet__prof-toggle">
				<div class="ve-mr-1">${cb}</div>
				<div class="ve-small">${label}</div>
			</label>`);
		});

		const hkAuto = async () => {
			const auto = await CharactersProficienciesCollector.pCollectAuto({
				cls: await this._pGetClass(),
				race: this._getRace(),
				background: this._getBackground(),
				feats: this._getFeats().map(it => it.feat),
			});
			wrpAutoWeapons.vee.html(CharactersProficienciesCollector.renderProfListHtml(auto.weaponsExtra, {emptyText: "No additional weapon or armor proficiencies"}));
			wrpAutoLanguages.vee.html(CharactersProficienciesCollector.renderProfListHtml(auto.languages, {emptyText: "None from class, species, background, or feats"}));
			wrpAutoTools.vee.html(CharactersProficienciesCollector.renderProfListHtml(auto.tools, {emptyText: "None from class, species, background, or feats"}));
		};

		const profHooks = [
			"className",
			"classSource",
			"subclassName",
			"subclassShortName",
			"subclassSource",
			"raceHash",
			"backgroundHash",
			"featHashes",
		];
		profHooks.forEach(prop => this._addHookBase(prop, () => hkAuto().then(null)));
		hkAuto().then(null);

		const renderExtra = (wrp, prop) => {
			wrp.vee.empty();
			const entries = this._state.otherProficienciesExtra?.[prop] || [];
			if (!entries.length) {
				wrp.vee.html(`<span class="ve-muted ve-italic">None</span>`);
				return;
			}
			entries.forEach(entry => {
				const disp = veT`<div class="ve-flex-grow-1 ve-min-w-0"></div>`;
				const text = entry.text || "";
				if (text.startsWith("{@")) disp.vee.html(Renderer.get().render(text));
				else disp.vee.txt(text);

				const btnRemove = veT`<button class="ve-btn ve-btn-xxs ve-btn-danger" title="Remove"><span class="glyphicon glyphicon-trash"></span></button>`
					.vee.onn("click", () => {
						const nxt = MiscUtil.copyFast(this._state.otherProficienciesExtra || {});
						nxt[prop] = (nxt[prop] || []).filter(it => it.id !== entry.id);
						this._state.otherProficienciesExtra = nxt;
					});

				wrp.vee.appends(veT`<div class="ve-flex-v-center ve-mb-1 ve-charsheet__prof-extra-row">${disp}${btnRemove}</div>`);
			});
		};

		const hkExtra = () => {
			renderExtra(wrpExtraWeapons, "weapons");
			renderExtra(wrpExtraLanguages, "languages");
			renderExtra(wrpExtraTools, "tools");
		};
		this._addHookBase("otherProficienciesExtra", hkExtra);
		hkExtra();

		const getBtnAdd = prop => veT`<button class="ve-btn ve-btn-xxs ve-btn-default" title="Add custom entry"><span class="glyphicon glyphicon-plus"></span></button>`
			.vee.onn("click", () => this._pAddOtherProficiency(prop));

		const getSection = ({label, wrpAuto, wrpExtra, prop, extraTop}) => veT`<div class="ve-charsheet__prof-section">
			<div class="ve-flex-v-center ve-mb-1">
				<div class="ve-bold ve-flex-grow-1">${label}</div>
				${getBtnAdd(prop)}
			</div>
			${extraTop || ""}
			<div class="ve-charsheet__prof-sub-label ve-muted ve-small ve-mb-1">From class, species, background, and feats</div>
			${wrpAuto}
			<div class="ve-charsheet__prof-sub-label ve-muted ve-small ve-mt-2 ve-mb-1">Custom</div>
			${wrpExtra}
		</div>`;

		return veT`<div class="ve-charsheet__panel ve-p-2 ve-mb-2">
			<div class="ve-bold ve-mb-2">Other Proficiencies</div>
			${getSection({label: "Weapons & Armor", wrpAuto: wrpAutoWeapons, wrpExtra: wrpExtraWeapons, prop: "weapons", extraTop: wrpToggles})}
			${getSection({label: "Languages", wrpAuto: wrpAutoLanguages, wrpExtra: wrpExtraLanguages, prop: "languages"})}
			${getSection({label: "Tools", wrpAuto: wrpAutoTools, wrpExtra: wrpExtraTools, prop: "tools"})}
		</div>`;
	}

	async _pApplyAutoArmorWeaponProfs () {
		const auto = await CharactersProficienciesCollector.pCollectAuto({
			cls: await this._pGetClass(),
			race: this._getRace(),
			background: this._getBackground(),
			feats: this._getFeats().map(it => it.feat),
		});
		const nxt = {};
		ARMOR_WEAPON_PROF_DEFS.forEach(({id}) => {
			nxt[awpToProp(id)] = !!auto.toggles[id];
		});
		this._proxyAssignSimple("state", nxt);
	}

	async _pAddOtherProficiency (prop) {
		const text = await InputUiUtil.pGetUserString({
			title: "Add Proficiency",
			placeholder: "e.g. Martial weapons",
		});
		if (text == null || typeof text === "symbol" || !`${text}`.trim()) return;

		const nxt = MiscUtil.copyFast(this._state.otherProficienciesExtra || {weapons: [], languages: [], tools: []});
		nxt[prop] = [...(nxt[prop] || []), {id: CryptUtil.uid(), text: `${text}`.trim()}];
		this._state.otherProficienciesExtra = nxt;
	}

	_render_inventory () {
		const wrpRows = veT`<div class="ve-flex-col ve-w-100"></div>`;
		this._collectionInventory = new CharactersInventoryCollection(this, wrpRows, this._items);
		const hk = () => this._collectionInventory.render();
		this._addHookBase("inventory", hk);
		hk();

		const btnAdd = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Add items; carried, not equipped"><span class="glyphicon glyphicon-plus"></span> Add Item</button>`
			.vee.onn("click", () => this._pAddInventoryItems());

		return veT`<div class="ve-charsheet__panel ve-p-2 ve-mb-2">
			<div class="ve-flex-v-center ve-mb-1">
				<div class="ve-bold ve-flex-grow-1">Inventory</div>
				${btnAdd}
			</div>
			${wrpRows}
		</div>`;
	}

	_render_features () {
		const wrp = veT`<div class="ve-flex-col ve-w-100 ve-h-100 ve-min-h-0 ve-charsheet__wrp-features"></div>`;

		this._ixTabSpellcasting = FEATURE_SECTIONS_AUTO.length;
		this._ixTabCustom = FEATURE_SECTIONS_AUTO.length + 1;

		const tabMetasIn = [
			...FEATURE_SECTIONS_AUTO.map(section => new TabUiUtil.TabMeta({
				name: FEATURE_SECTION_TAB_TITLES[section],
				hasBorder: true,
				hasBackground: true,
			})),
			new TabUiUtil.TabMeta({
				name: TAB_SPELLCASTING_TITLE,
				hasBorder: true,
				hasBackground: true,
			}),
			new TabUiUtil.TabMeta({
				name: FEATURE_SECTION_TAB_TITLES[FEATURE_SECTION_CUSTOM],
				hasBorder: true,
				hasBackground: true,
			}),
			new TabUiUtil.TabMeta({
				type: "buttons",
				isSplitStart: true,
				buttons: [
					{
						html: `<span class="glyphicon glyphicon-plus"></span>`,
						title: "Add Custom Feature",
						pFnClick: () => {
							this._addCustomFeature();
							this._setIxActiveTab({ixActiveTab: this._ixTabCustom});
						},
					},
					{
						html: `<span class="fal fa-book-open"></span>`,
						title: "Open Spell Library",
						pFnClick: () => this.openSpellcastingLibrary(),
					},
				],
			}),
		];

		const tabMetas = this._renderTabs(tabMetasIn, {eleParent: wrp});
		this._featureTabMetas = Object.fromEntries(
			FEATURE_SECTIONS_AUTO.map((section, ix) => [section, tabMetas[ix]]),
		);
		this._tabMetaSpellcasting = tabMetas[this._ixTabSpellcasting];
		this._featureTabMetas[FEATURE_SECTION_CUSTOM] = tabMetas[this._ixTabCustom];

		FEATURE_SECTIONS.forEach(section => {
			this._featureTabMetas[section].wrpTab.vee.addClass("ve-p-2");
		});
		FEATURE_SECTIONS_AUTO.forEach(section => this._featureTabMetas[section].btnTab.vee.hide());
		this._tabMetaSpellcasting.btnTab.vee.hide();

		const wrpCustom = veT`<div class="ve-flex-col ve-w-100"></div>`;
		this._collectionCustomFeatures = new CharactersCustomFeatureCollection(this, wrpCustom);
		const hkCustom = () => this._collectionCustomFeatures.render();
		this._addHookBase("customFeatures", hkCustom);
		hkCustom();

		const btnAddCustom = veT`<button class="ve-btn ve-btn-xs ve-btn-default ve-mb-2"><span class="glyphicon glyphicon-plus"></span> Add Custom</button>`
			.vee.onn("click", () => this._addCustomFeature());

		veT(this._featureTabMetas[FEATURE_SECTION_CUSTOM].wrpTab)`
			${btnAddCustom}
			${wrpCustom}
		`;

		CharactersSpellcastingPanel.render({
			parentUi: this,
			wrpTab: this._tabMetaSpellcasting.wrpTab,
		});

		const pRenderAuto = MiscUtil.debounce(() => this._pRenderAutoFeatures(), 50);
		[
			"className",
			"classSource",
			"subclassName",
			"subclassShortName",
			"subclassSource",
			"level",
			"raceHash",
			"backgroundHash",
			"featHashes",
			"hiddenFeatureKeys",
		]
			.forEach(prop => this._addHookBase(prop, pRenderAuto));
		pRenderAuto();

		const pSyncSpells = MiscUtil.debounce(() => this._pSyncSpellcasting(), 50);
		[
			"className",
			"classSource",
			"subclassName",
			"subclassShortName",
			"subclassSource",
			"level",
			...Parser.ABIL_ABVS,
		]
			.forEach(prop => this._addHookBase(prop, pSyncSpells));
		this._addHookBase("spellcasting", () => this._syncSpellcastingTabVisible());
		pSyncSpells();

		return wrp;
	}

	async _pRenderAutoFeatures () {
		const token = ++this._featureRenderToken;
		const cls = await this._pGetClass();
		const sc = await this._pGetSubclass();
		if (token !== this._featureRenderToken) return;

		const race = this._getRace();
		const background = this._getBackground();
		const feats = this._getFeats();
		const hidden = new Set(this._state.hiddenFeatureKeys || []);

		const features = [
			...CharactersFeatureCollector.collectClassFeatures(cls, this._state.level),
			...CharactersFeatureCollector.collectSubclassFeatures(sc, this._state.level),
			...CharactersFeatureCollector.collectRace(race, this._state.raceHash),
			...CharactersFeatureCollector.collectEntityEntries(background, this._state.backgroundHash, FEATURE_SECTION_BACKGROUND),
			...feats.flatMap(({feat, hash}) => CharactersFeatureCollector.collectFeat(feat, hash)),
		];

		const bySection = {};
		features.forEach(feature => (bySection[feature.section] ||= []).push(feature));

		FEATURE_SECTIONS_AUTO.forEach(section => {
			const tabMeta = this._featureTabMetas[section];
			const list = bySection[section] || [];
			tabMeta.wrpTab.vee.empty();

			list.forEach(feature => {
				tabMeta.wrpTab.vee.appends(this._render_featureRow(feature, hidden.has(feature.key)));
			});

			tabMeta.btnTab.vee.toggle(!!list.length);
		});

		this._syncFeatureTabActive();
	}

	_syncFeatureTabActive () {
		const tabMetas = [
			...FEATURE_SECTIONS_AUTO.map(section => this._featureTabMetas[section]),
			this._tabMetaSpellcasting,
			this._featureTabMetas[FEATURE_SECTION_CUSTOM],
		];
		const ixActive = this._getIxActiveTab();
		const active = tabMetas[ixActive];
		if (active && !active.btnTab.classList.contains("ve-hidden")) return;

		const ixVisible = tabMetas.findIndex(it => it && !it.btnTab.classList.contains("ve-hidden"));
		this._setIxActiveTab({ixActiveTab: ixVisible >= 0 ? ixVisible : this._ixTabCustom});
	}

	_getIxFeatureTab (section) {
		if (section === FEATURE_SECTION_CUSTOM) return this._ixTabCustom;
		return FEATURE_SECTIONS_AUTO.indexOf(section);
	}

	_render_featureRow (feature, isHidden) {
		const wrpWidgets = veT`<div class="ve-flex-col ve-w-100"></div>`;
		const btnAddWidget = CharactersFeatureWidgets.getBtnAdd({
			parentUi: this,
			featureKey: feature.key,
			wrpWidgets,
		});
		const btnHide = veT`<button class="ve-btn ve-btn-xxs ve-btn-default" title="${isHidden ? "Show Feature" : "Hide Feature"}"><span class="glyphicon glyphicon-${isHidden ? "eye-open" : "eye-close"}"></span></button>`
			.vee.onn("click", () => this._toggleHiddenFeature(feature.key));

		const title = feature.level != null
			? `Level ${feature.level}: ${feature.name}`
			: feature.name;

		if (isHidden) {
			return veT`<div class="ve-flex-v-center ve-charsheet__feature ve-py-1">
				<div class="ve-muted ve-italic ve-flex-grow-1">${title.qq()}</div>
				<div class="ve-no-shrink">${btnHide}</div>
			</div>`;
		}

		CharactersFeatureWidgets.renderExisting({
			parentUi: this,
			featureKey: feature.key,
			wrpWidgets,
		});

		const rendered = Renderer.get().setFirstSection(true).render({
			type: "entries",
			name: title,
			source: feature.source,
			entries: feature.entries || [],
		});

		return veT`<div class="ve-charsheet__feature ve-py-1">
			<div class="ve-flex-v-top">
				<div class="ve-flex-grow-1 ve-min-w-0">${rendered}</div>
				<div class="ve-btn-group ve-no-shrink ve-ml-2">${btnAddWidget}${btnHide}</div>
			</div>
			${wrpWidgets}
		</div>`;
	}

	_toggleHiddenFeature (key) {
		const set = new Set(this._state.hiddenFeatureKeys || []);
		if (set.has(key)) set.delete(key);
		else set.add(key);
		this._state.hiddenFeatureKeys = [...set];
	}

	_addCustomFeature () {
		this._state.customFeatures = [
			...this._state.customFeatures || [],
			{
				id: CryptUtil.uid(),
				entity: {
					name: "",
					entries: [],
				},
			},
		];
	}

	_getBtnClearHash (prop, title) {
		const btn = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="${title}"><span class="glyphicon glyphicon-remove"></span></button>`
			.vee.onn("click", () => {
				this._state[prop] = null;
				if (prop === "raceHash" || prop === "backgroundHash") this._pApplyAutoArmorWeaponProfs().then(null);
			});
		const hk = () => btn.vee.toggle(!!this._state[prop]);
		this._addHookBase(prop, hk);
		hk();
		return btn;
	}

	async _pSelectClass () {
		const selected = await this._modalFilterClasses.pGetUserSelection({
			selectedClass: this._state.className
				? {name: this._state.className, source: this._state.classSource}
				: null,
			selectedSubclass: this._state.subclassName
				? {name: this._state.subclassName, source: this._state.subclassSource}
				: null,
		});

		if (!selected || selected instanceof Array || !selected.class) return;

		const cls = selected.class;
		const sc = selected.subclass || null;
		const isClassChange = this._state.className !== cls.name || this._state.classSource !== cls.source;

		const nxt = {
			className: cls.name,
			classSource: cls.source,
			subclassName: sc?.name ?? null,
			subclassShortName: sc?.shortName ?? sc?.name ?? null,
			subclassSource: sc?.source ?? null,
		};

		if (isClassChange) {
			Parser.ABIL_ABVS.forEach(ab => {
				nxt[saveToProp(ab)] = (cls.proficiency || []).includes(ab);
			});
		}

		this._loadedClass = null;
		this._loadedClassIdent = null;
		this._loadedSubclass = null;
		this._loadedSubclassIdent = null;

		this._proxyAssignSimple("state", nxt);
		if (isClassChange) this._pApplyAutoArmorWeaponProfs().then(null);
		this._setIxActiveTab({ixActiveTab: this._getIxFeatureTab(sc ? FEATURE_SECTION_SUBCLASS : FEATURE_SECTION_CLASS)});
	}

	async _pSelectHashEntity ({modal, propHash, page, arr}) {
		const selected = await modal.pGetUserSelection();
		if (!selected?.length) return;

		const li = selected[0];
		const hash = li.data.hash
			|| UrlUtil.URL_TO_HASH_BUILDER[page]({name: li.name, source: li.values.sourceJson});
		if (!this._findByHash(arr, page, hash)) {
			throw new Error(`Could not find selected entity: ${JSON.stringify(li)}`);
		}
		this._state[propHash] = hash;
		if (propHash === "raceHash") {
			this._setIxActiveTab({ixActiveTab: this._getIxFeatureTab(FEATURE_SECTION_RACE)});
			this._pApplyAutoArmorWeaponProfs().then(null);
		} else if (propHash === "backgroundHash") {
			this._setIxActiveTab({ixActiveTab: this._getIxFeatureTab(FEATURE_SECTION_BACKGROUND)});
			this._pApplyAutoArmorWeaponProfs().then(null);
		}
	}

	async _pAddInventoryItems () {
		const selected = await this._modalFilterItems.pGetUserSelection();
		if (!selected?.length) return;

		const nxt = [...this._state.inventory || []];
		selected.forEach(li => {
			const hash = li.data.hash
				|| UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS]({name: li.name, source: li.values.sourceJson});
			nxt.push({
				id: CryptUtil.uid(),
				entity: {
					itemHash: hash,
					quantity: 1,
					notes: "",
					equipped: null,
				},
			});
		});
		this._state.inventory = nxt;
	}

	async _pSyncSpellcasting () {
		const cls = await this._pGetClass();
		const sc = await this._pGetSubclass();
		const ident = [
			this._state.className,
			this._state.classSource,
			this._state.subclassName,
			this._state.subclassSource,
		].join("|");
		const identityChanged = this._spellcastingIdent != null && ident !== this._spellcastingIdent;
		this._spellcastingIdent = ident;

		const meta = CharactersSpellcasting.getCasterMeta({
			cls,
			sc,
			level: this._state.level,
			getAbilityMod: ab => this.getAbilityMod(ab),
		});
		this._spellcastingMode = meta.mode || "known";
		this._spellcastingHint = meta.hint || "";
		this._spellcastingIsCaster = !!meta.isCaster;
		this._spellcastingSpellListClass = meta.spellListClass || null;

		const nxt = CharactersSpellcasting.applyAuto({
			existing: this._state.spellcasting,
			meta,
			identityChanged,
		});
		this._state.spellcasting = nxt;
	}

	_syncSpellcastingTabVisible () {
		if (!this._tabMetaSpellcasting) return;
		const sc = this._getSpellcastingState();
		const show = !!(this._spellcastingIsCaster || sc.blocks.length || sc.spells.length);
		this._tabMetaSpellcasting.btnTab.vee.toggle(show);
		this._syncFeatureTabActive();
	}

	_getSpellcastingState () {
		return CharactersSpellcasting.migrate(this._state.spellcasting);
	}

	_setSpellcastingState (nxt) {
		this._state.spellcasting = CharactersSpellcasting.migrate(nxt);
	}

	updateSpellBlock (blockState) {
		const sc = this._getSpellcastingState();
		const ix = sc.blocks.findIndex(it => it.id === blockState.id);
		if (!~ix) return;
		sc.blocks[ix] = blockState;
		this._setSpellcastingState(sc);
	}

	addSpellBlock () {
		const sc = this._getSpellcastingState();
		sc.blocks.push({
			id: CryptUtil.uid(),
			origin: "custom",
			name: "Extra",
			ability: "int",
			bonus: 0,
		});
		this._setSpellcastingState(sc);
		if (this._tabMetaSpellcasting) {
			this._tabMetaSpellcasting.btnTab.vee.show();
			this._setIxActiveTab({ixActiveTab: this._ixTabSpellcasting});
		}
	}

	openSpellcastingLibrary () {
		if (!this._tabMetaSpellcasting) return;
		const sc = this._getSpellcastingState();
		const show = !!(this._spellcastingIsCaster || sc.blocks.length || sc.spells.length);
		if (!show) this.addSpellBlock();
		else {
			this._tabMetaSpellcasting.btnTab.vee.show();
			this._setIxActiveTab({ixActiveTab: this._ixTabSpellcasting});
		}
		this._isSpellLibraryOpen = true;
		this._spellLibraryOpenSync?.();
	}

	removeSpellBlock (blockId) {
		const sc = this._getSpellcastingState();
		sc.blocks = sc.blocks.filter(it => it.id !== blockId);
		const fallback = sc.blocks[0]?.id || null;
		sc.spells = sc.spells.map(sp => sp.blockId === blockId ? {...sp, blockId: fallback} : sp);
		this._setSpellcastingState(sc);
	}

	getSpellEntity (tag) {
		const parsed = CharactersSpellcasting.parseSpellTag(tag);
		if (!parsed) return null;
		return this._spellsByUid.get(`${parsed.name}|${parsed.source}`.toLowerCase())
			|| this._spellsByUid.get(`${parsed.name}|${Parser.SRC_PHB}`.toLowerCase())
			|| null;
	}

	getSpellFilterExpression () {
		const sc = this._getSpellcastingState();
		return CharactersSpellcasting.getSpellFilterExpression({
			spellListClass: this._spellcastingSpellListClass,
			maxSlotLevel: CharactersSpellcasting.getMaxSlotLevelFromState(sc),
		});
	}

	async pAddSpells () {
		const expr = this.getSpellFilterExpression();
		if (!expr) this._modalFilterSpells.pageFilter?.filterBox?.reset();
		const selected = await this._modalFilterSpells.pGetUserSelection({filterExpression: expr});
		if (!selected?.length) return;

		const sc = this._getSpellcastingState();
		if (!sc.blocks.length) {
			sc.blocks.push({
				id: CryptUtil.uid(),
				origin: "custom",
				name: "Extra",
				ability: "int",
				bonus: 0,
			});
		}
		const defaultBlock = sc.blocks.find(b => b.origin !== "custom") || sc.blocks.at(-1);
		const defaultSource = defaultBlock.origin === "class" || defaultBlock.origin === "subclass"
			? defaultBlock.origin
			: "custom";
		const have = new Set(sc.spells.map(sp => `${sp.tag}`.toLowerCase()));

		selected.forEach(li => {
			const name = li.name;
			const source = li.values?.sourceJson || li.values?.source;
			if (!name || !source) return;
			const tag = `{@spell ${name}|${source}}`;
			if (have.has(tag.toLowerCase())) return;
			have.add(tag.toLowerCase());
			const level = Number(li.values?.level);
			sc.spells.push({
				id: CryptUtil.uid(),
				tag,
				level: Number.isFinite(level) ? level : 0,
				blockId: defaultBlock.id,
				source: defaultSource,
				prepared: false,
				inBook: false,
			});
		});
		this._setSpellcastingState(sc);
	}

	removeSpell (spellId) {
		const sc = this._getSpellcastingState();
		sc.spells = sc.spells.filter(it => it.id !== spellId);
		this._setSpellcastingState(sc);
	}

	setSpellFlag (spellId, flag, value) {
		const sc = this._getSpellcastingState();
		const ix = sc.spells.findIndex(it => it.id === spellId);
		if (!~ix) return;
		sc.spells[ix] = {...sc.spells[ix], [flag]: !!value};
		this._setSpellcastingState(sc);
	}

	setSpellBlockId (spellId, blockId) {
		const sc = this._getSpellcastingState();
		const ix = sc.spells.findIndex(it => it.id === spellId);
		if (!~ix) return;
		sc.spells[ix] = {...sc.spells[ix], blockId};
		this._setSpellcastingState(sc);
	}

	toggleSpellPip (level, ixPip) {
		const sc = this._getSpellcastingState();
		const slot = sc.slots[level];
		if (!slot) return;
		if (ixPip < slot.current) slot.current = ixPip;
		else slot.current = Math.min(slot.max, ixPip + 1);
		this._setSpellcastingState(sc);
	}

	togglePactPip (ixPip) {
		const sc = this._getSpellcastingState();
		if (!sc.slotsPact) return;
		if (ixPip < sc.slotsPact.current) sc.slotsPact.current = ixPip;
		else sc.slotsPact.current = Math.min(sc.slotsPact.max, ixPip + 1);
		this._setSpellcastingState(sc);
	}

	setSpellSlotMaxOverride (level, val) {
		const sc = this._getSpellcastingState();
		const slot = sc.slots[level];
		if (!slot) return;
		if (val == null) {
			slot.maxOverride = null;
			this._setSpellcastingState(sc);
			this._pSyncSpellcasting().then(null);
			return;
		}
		slot.maxOverride = val;
		slot.max = val;
		slot.current = Math.min(slot.current, slot.max);
		this._setSpellcastingState(sc);
	}

	setPactMaxOverride (val) {
		const sc = this._getSpellcastingState();
		if (!sc.slotsPact) return;
		if (val == null) {
			sc.slotsPact.maxOverride = null;
			this._setSpellcastingState(sc);
			this._pSyncSpellcasting().then(null);
			return;
		}
		sc.slotsPact.maxOverride = val;
		sc.slotsPact.max = val;
		sc.slotsPact.current = Math.min(sc.slotsPact.current, sc.slotsPact.max);
		this._setSpellcastingState(sc);
	}

	resetSpellSlots () {
		const sc = this._getSpellcastingState();
		Object.values(sc.slots).forEach(slot => { slot.current = slot.max; });
		if (sc.slotsPact) sc.slotsPact.current = sc.slotsPact.max;
		this._setSpellcastingState(sc);
	}

	_getDefaultState () {
		const state = {
			name: "",
			level: 1,

			className: null,
			classSource: null,
			subclassName: null,
			subclassShortName: null,
			subclassSource: null,

			raceHash: null,
			backgroundHash: null,
			featHashes: [],

			hpCurrent: null,
			hpMax: null,
			ac: "",
			speed: "",
			resistances: [],

			hiddenFeatureKeys: [],
			customFeatures: [],
			inventory: [],
			featureWidgets: {},
			otherProficienciesExtra: {
				weapons: [],
				languages: [],
				tools: [],
			},

			// Forward-compatible stubs
			classes: null,
			spellcasting: CharactersSpellcasting.getEmptyState(),
			hpFormula: null,
			optionalFeatureUids: [],
		};

		Parser.ABIL_ABVS.forEach(ab => {
			state[ab] = 10;
			state[saveToProp(ab)] = false;
		});
		getSkills().forEach(skill => {
			state[skillToProp(skill)] = 0;
		});
		ARMOR_WEAPON_PROF_DEFS.forEach(({id}) => {
			state[awpToProp(id)] = false;
		});

		return state;
	}
}
