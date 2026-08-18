import {CHARACTERS_STORAGE_KEY_STATE} from "./characters-const.js";

export const CHARACTERS_STORAGE_KEY_ROSTER = "roster";

export class CharactersRoster {
	constructor () {
		this.activeId = null;
		this.entries = [];
	}

	async pLoad () {
		const rawRoster = await StorageUtil.pGetForPage(CHARACTERS_STORAGE_KEY_ROSTER);
		if (rawRoster && Array.isArray(rawRoster.entries) && rawRoster.entries.length) {
			this.entries = rawRoster.entries.map(it => this._migrateEntry(it)).filter(Boolean);
			this.activeId = rawRoster.activeId && this.entries.some(it => it.id === rawRoster.activeId)
				? rawRoster.activeId
				: this.entries[0].id;
			return;
		}

		const legacy = await StorageUtil.pGetForPage(CHARACTERS_STORAGE_KEY_STATE);
		const first = this._newEntry(legacy || null);
		this.entries = [first];
		this.activeId = first.id;
	}

	_migrateEntry (raw) {
		if (!raw || typeof raw !== "object") return null;
		return {
			id: raw.id || CryptUtil.uid(),
			name: `${raw.name || ""}`.trim(),
			data: raw.data && typeof raw.data === "object" ? raw.data : null,
		};
	}

	_newEntry (data) {
		return {
			id: CryptUtil.uid(),
			name: this._nameFromData(data),
			data: data ? MiscUtil.copyFast(data) : null,
		};
	}

	_nameFromData (data) {
		return `${data?.state?.name || ""}`.trim();
	}

	listMeta () {
		return this.entries.map(it => ({
			id: it.id,
			name: it.name || "Unnamed",
		}));
	}

	getActive () {
		return this.entries.find(it => it.id === this.activeId) || this.entries[0] || null;
	}

	getActiveState () {
		return this.getActive()?.data || null;
	}

	upsertActive (data) {
		const cur = this.getActive();
		if (!cur) {
			const created = this._newEntry(data);
			this.entries.push(created);
			this.activeId = created.id;
			return;
		}
		cur.data = MiscUtil.copyFast(data);
		cur.name = this._nameFromData(data);
	}

	setActive (id) {
		if (!this.entries.some(it => it.id === id)) return;
		this.activeId = id;
	}

	addNew () {
		const created = this._newEntry(null);
		this.entries.push(created);
		this.activeId = created.id;
		return created.id;
	}

	duplicateActive () {
		const cur = this.getActive();
		const copy = this._newEntry(cur?.data || null);
		if (copy.name) copy.name = `${copy.name} (copy)`;
		if (copy.data?.state) {
			copy.data.state = {
				...copy.data.state,
				name: copy.name,
			};
		}
		this.entries.push(copy);
		this.activeId = copy.id;
		return copy.id;
	}

	removeActive () {
		if (this.entries.length <= 1) {
			const only = this.entries[0] || this._newEntry(null);
			only.data = null;
			only.name = "";
			this.entries = [only];
			this.activeId = only.id;
			return {cleared: true, id: only.id};
		}
		this.entries = this.entries.filter(it => it.id !== this.activeId);
		this.activeId = this.entries[0].id;
		return {cleared: false, id: this.activeId};
	}

	toSaveable () {
		return {
			activeId: this.activeId,
			entries: MiscUtil.copyFast(this.entries),
		};
	}

	async pSave () {
		await StorageUtil.pSetForPage(CHARACTERS_STORAGE_KEY_ROSTER, this.toSaveable());
		const active = this.getActiveState();
		if (active) await StorageUtil.pSetForPage(CHARACTERS_STORAGE_KEY_STATE, active);
	}
}
