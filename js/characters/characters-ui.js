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
	getSkills,
	migrateSkillProf,
	saveToProp,
	SKILL_PROF_MULT,
	skillToProp,
} from "./characters-const.js";
import {CharactersFeatureCollector} from "./characters-features.js";
import {CharactersCustomFeatureCollection, CharactersInventoryCollection} from "./characters-inventory.js";
import {CharactersFeatureWidgets} from "./characters-widgets.js";

export class CharactersUi extends BaseComponent {
	constructor (
		{
			races,
			backgrounds,
			feats,
			items,
		},
	) {
		super();

		TabUiUtil.decorate(this, {isInitMeta: true});

		this._races = races;
		this._backgrounds = backgrounds;
		this._feats = feats;
		this._items = items;

		this._modalFilterRaces = new ModalFilterRaces({namespace: "characters.races", isRadio: true, allData: races});
		this._modalFilterBackgrounds = new ModalFilterBackgrounds({namespace: "characters.backgrounds", isRadio: true, allData: backgrounds});
		this._modalFilterClasses = new ModalFilterClasses({namespace: "characters.classes"});
		this._modalFilterItems = new ModalFilterItems({namespace: "characters.items", allData: items});

		this._loadedClass = null;
		this._loadedClassIdent = null;
		this._loadedSubclass = null;
		this._loadedSubclassIdent = null;
		this._featureRenderToken = 0;
		this._featureTabMetas = null;

		this._collectionInventory = null;
		this._collectionCustomFeatures = null;
	}

	async pInit () {
		await Promise.all([
			this._modalFilterRaces.pPopulateHiddenWrapper(),
			this._modalFilterBackgrounds.pPopulateHiddenWrapper(),
			this._modalFilterClasses.pPopulateHiddenWrapper(),
			this._modalFilterItems.pPopulateHiddenWrapper(),
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
		const iptHpCurrent = ComponentUiUtil.getIptInt(
			this,
			"hpCurrent",
			null,
			{
				isAllowNull: true,
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center" type="number" placeholder="—" style="width: 52px;" title="Current HP">`,
			},
		);
		const iptHpMax = ComponentUiUtil.getIptInt(
			this,
			"hpMax",
			null,
			{
				isAllowNull: true,
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center" type="number" placeholder="—" style="width: 52px;" title="Max HP">`,
			},
		);
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

		return veT`<div class="ve-charsheet__combat-row">
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
		</div>`;
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

		const tabMetasIn = [
			...FEATURE_SECTIONS.map(section => new TabUiUtil.TabMeta({
				name: FEATURE_SECTION_TAB_TITLES[section],
				hasBorder: true,
				hasBackground: true,
			})),
			new TabUiUtil.TabMeta({
				type: "buttons",
				isSplitStart: true,
				buttons: [
					{
						html: `<span class="glyphicon glyphicon-plus"></span>`,
						title: "Add Custom Feature",
						pFnClick: () => {
							this._addCustomFeature();
							const ixCustom = FEATURE_SECTIONS.indexOf(FEATURE_SECTION_CUSTOM);
							this._setIxActiveTab({ixActiveTab: ixCustom});
						},
					},
				],
			}),
		];

		const tabMetas = this._renderTabs(tabMetasIn, {eleParent: wrp});
		this._featureTabMetas = Object.fromEntries(
			FEATURE_SECTIONS.map((section, ix) => [section, tabMetas[ix]]),
		);

		FEATURE_SECTIONS.forEach(section => {
			this._featureTabMetas[section].wrpTab.vee.addClass("ve-p-2");
		});
		FEATURE_SECTIONS_AUTO.forEach(section => this._featureTabMetas[section].btnTab.vee.hide());

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
		const tabMetas = FEATURE_SECTIONS.map(section => this._featureTabMetas[section]);
		const ixActive = this._getIxActiveTab();
		const active = tabMetas[ixActive];
		if (active && !active.btnTab.classList.contains("ve-hidden")) return;

		const ixVisible = tabMetas.findIndex(it => !it.btnTab.classList.contains("ve-hidden"));
		this._setIxActiveTab({ixActiveTab: ixVisible >= 0 ? ixVisible : FEATURE_SECTIONS.indexOf(FEATURE_SECTION_CUSTOM)});
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
		this._setIxActiveTab({ixActiveTab: FEATURE_SECTIONS.indexOf(sc ? FEATURE_SECTION_SUBCLASS : FEATURE_SECTION_CLASS)});
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
		if (propHash === "raceHash") this._setIxActiveTab({ixActiveTab: FEATURE_SECTIONS.indexOf(FEATURE_SECTION_RACE)});
		else if (propHash === "backgroundHash") this._setIxActiveTab({ixActiveTab: FEATURE_SECTIONS.indexOf(FEATURE_SECTION_BACKGROUND)});
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

			hiddenFeatureKeys: [],
			customFeatures: [],
			inventory: [],
			featureWidgets: {},

			// Forward-compatible stubs
			classes: null,
			spellcasting: null,
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

		return state;
	}
}
