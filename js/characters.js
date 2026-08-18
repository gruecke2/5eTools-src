import {CharactersUi} from "./characters/characters-ui.js";
import {CHARACTERS_STORAGE_KEY_PENDING_IMPORT} from "./characters/characters-const.js";
import {CharactersRoster} from "./characters/characters-roster.js";
import {VetoolsConfig} from "./utils-config/utils-config-config.js";
import {UtilsEntityBackground} from "./utils/utils-entity-background.js";
import {UtilsEntityRace} from "./utils/utils-entity-race.js";

class CharactersPage {
	constructor () {
		this._ui = null;
		this._roster = new CharactersRoster();
	}

	async pInit () {
		await Promise.all([
			PrereleaseUtil.pInit(),
			BrewUtil2.pInit(),
		]);
		await ExcludeUtil.pInitialise();

		const [races, backgrounds, feats, items, spells] = await Promise.all([
			this._pLoadRaces(),
			this._pLoadBackgrounds(),
			this._pLoadFeats(),
			this._pLoadItems(),
			this._pLoadSpells(),
		]);

		this._ui = new CharactersUi({
			races,
			backgrounds,
			feats,
			items,
			spells,
		});
		await this._ui.pInit();

		await this._roster.pLoad();
		const savedState = this._roster.getActiveState();
		if (savedState != null) this._ui.setStateFrom(savedState);

		await this._pApplyPendingImport();

		const savedStateDebounced = MiscUtil.throttle(() => this._pDoSaveState(), 100);
		this._ui.addHookAll("state", () => savedStateDebounced());

		this._ui.render(veEs(`#characters-main`));
		this._ui.setRosterHooks({
			getEntries: () => this._roster.listMeta(),
			getActiveId: () => this._roster.activeId,
			pSwitch: (id) => this._pSwitchCharacter(id),
			pNew: () => this._pNewCharacter(),
			pDuplicate: () => this._pDuplicateCharacter(),
			pDelete: () => this._pDeleteCharacter(),
		});

		window.dispatchEvent(new Event("toolsLoaded"));
	}

	async _pApplyPendingImport () {
		const pending = await StorageUtil.pGet(CHARACTERS_STORAGE_KEY_PENDING_IMPORT);
		if (!pending) return;

		await StorageUtil.pRemove(CHARACTERS_STORAGE_KEY_PENDING_IMPORT);

		if (this._ui.isSheetStarted()) {
			const isImport = await InputUiUtil.pGetUserBoolean({
				title: "Import from Stat Generator",
				htmlDescription: `<div>This will overwrite ability scores, species, background, and feats on the current sheet.<br>Continue?</div>`,
				textYes: "Import",
				textNo: "Keep Current",
			});
			if (!isImport) return;
		}

		this._ui.applyStatgenImport(pending);
	}

	async _pLoadRaces () {
		const cpyRaces = MiscUtil.copyFast(
			[
				...(await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_RACES)),
				...(await DataLoader.pCacheAndGetAllPrerelease(UrlUtil.PG_RACES)),
				...(await DataLoader.pCacheAndGetAllBrew(UrlUtil.PG_RACES)),
			]
				.filter(it => {
					const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_RACES](it);
					return !ExcludeUtil.isExcluded(hash, "race", it.source);
				}),
		);

		const styleHint = VetoolsConfig.get("styleSwitcher", "style");
		cpyRaces.forEach(ent => UtilsEntityRace.mutMigrateForVersion(ent, {styleHint}));

		return cpyRaces;
	}

	async _pLoadBackgrounds () {
		const cpyBackgrounds = MiscUtil.copyFast(
			[
				...(await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_BACKGROUNDS)),
				...(await DataLoader.pCacheAndGetAllPrerelease(UrlUtil.PG_BACKGROUNDS)),
				...(await DataLoader.pCacheAndGetAllBrew(UrlUtil.PG_BACKGROUNDS)),
			]
				.filter(it => {
					const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_BACKGROUNDS](it);
					return !ExcludeUtil.isExcluded(hash, "background", it.source);
				}),
		);

		const styleHint = VetoolsConfig.get("styleSwitcher", "style");
		cpyBackgrounds.forEach(ent => UtilsEntityBackground.mutMigrateForVersion(ent, {styleHint}));

		return cpyBackgrounds;
	}

	async _pLoadFeats () {
		return [
			...(await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_FEATS)),
			...(await DataLoader.pCacheAndGetAllPrerelease(UrlUtil.PG_FEATS)),
			...(await DataLoader.pCacheAndGetAllBrew(UrlUtil.PG_FEATS)),
		]
			.filter(it => {
				const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_FEATS](it);
				return !ExcludeUtil.isExcluded(hash, "feat", it.source);
			});
	}

	async _pLoadItems () {
		const stockItems = (await Renderer.item.pBuildList()).filter(it => !it._isItemGroup);
		return stockItems
			.concat(await Renderer.item.pGetItemsFromPrerelease())
			.concat(await Renderer.item.pGetItemsFromBrew())
			.filter(it => {
				return !ExcludeUtil.isExcluded(
					UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS](it),
					"item",
					it.source,
					{isNoCount: true},
				);
			});
	}

	async _pLoadSpells () {
		return [
			...(await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_SPELLS)),
			...(await DataLoader.pCacheAndGetAllPrerelease(UrlUtil.PG_SPELLS)),
			...(await DataLoader.pCacheAndGetAllBrew(UrlUtil.PG_SPELLS)),
		]
			.filter(it => {
				const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_SPELLS](it);
				return !ExcludeUtil.isExcluded(hash, "spell", it.source);
			});
	}

	async _pDoSaveState () {
		this._roster.upsertActive(this._ui.getSaveableState());
		await this._roster.pSave();
	}

	async _pSwitchCharacter (id) {
		if (!id || id === this._roster.activeId) return;
		this._roster.upsertActive(this._ui.getSaveableState());
		this._roster.setActive(id);
		this._ui.loadCharacterState(this._roster.getActiveState());
		await this._roster.pSave();
	}

	async _pNewCharacter () {
		this._roster.upsertActive(this._ui.getSaveableState());
		this._roster.addNew();
		this._ui.loadCharacterState(null);
		await this._roster.pSave();
	}

	async _pDuplicateCharacter () {
		this._roster.upsertActive(this._ui.getSaveableState());
		this._roster.duplicateActive();
		this._ui.loadCharacterState(this._roster.getActiveState());
		await this._roster.pSave();
	}

	async _pDeleteCharacter () {
		const ok = await InputUiUtil.pGetUserBoolean({
			title: "Delete Character",
			htmlDescription: `<div>Remove this character from the local list?<br>File exports are unaffected.</div>`,
			textYes: "Delete",
			textNo: "Cancel",
		});
		if (!ok) return;
		this._roster.upsertActive(this._ui.getSaveableState());
		const {cleared} = this._roster.removeActive();
		this._ui.loadCharacterState(cleared ? null : this._roster.getActiveState());
		await this._roster.pSave();
	}
}

const charactersPage = new CharactersPage();
window.addEventListener("load", () => charactersPage.pInit());
globalThis.dbg_charactersPage = charactersPage;
