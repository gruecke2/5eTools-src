export class CharactersEquipment {
	static SLOT_ARMOR = "armor";
	static SLOT_SHIELD = "shield";
	static SLOT_WEAPON = "weapon";

	static _ARMOR_ABVS = new Set([
		Parser.ITM_TYP_ABV__LIGHT_ARMOR,
		Parser.ITM_TYP_ABV__MEDIUM_ARMOR,
		Parser.ITM_TYP_ABV__HEAVY_ARMOR,
	]);

	static getTypeAbvs (item) {
		if (!item) return [];
		return [item.type, item.typeAlt]
			.filter(Boolean)
			.map(uid => DataUtil.itemType.unpackUid(uid).abbreviation);
	}

	static getSlot (item) {
		if (!item) return null;
		const abvs = this.getTypeAbvs(item);
		if (abvs.some(abv => this._ARMOR_ABVS.has(abv))) return this.SLOT_ARMOR;
		if (abvs.includes(Parser.ITM_TYP_ABV__SHIELD)) return this.SLOT_SHIELD;
		if (abvs.includes(Parser.ITM_TYP_ABV__MELEE_WEAPON) || abvs.includes(Parser.ITM_TYP_ABV__RANGED_WEAPON)) return this.SLOT_WEAPON;
		return null;
	}

	static isRanged (item) {
		return this.getTypeAbvs(item).includes(Parser.ITM_TYP_ABV__RANGED_WEAPON);
	}

	static isFinesse (item) {
		return (item?.property || []).some(p => DataUtil.itemProperty.unpackUid(p?.uid || p).abbreviation === Parser.ITM_PROP_ABV__FINESSE);
	}

	static parseBonus (val) {
		if (val == null || val === "") return 0;
		const n = Number(String(val).replace(/^\+/, ""));
		return Number.isFinite(n) ? n : 0;
	}

	static getEquippedEntries (inventory, getItem) {
		return (inventory || [])
			.filter(it => it?.entity?.equipped)
			.map(it => {
				const item = getItem(it.entity.itemHash);
				return {
					id: it.id,
					entity: it.entity,
					item,
					slot: this.getSlot(item),
				};
			})
			.filter(it => it.item);
	}

	static toggleEquip (inventory, id, getItem) {
		const nxt = MiscUtil.copyFast(inventory || []);
		const row = nxt.find(it => it.id === id);
		if (!row?.entity) return nxt;

		const item = getItem(row.entity.itemHash);
		const slot = this.getSlot(item);
		if (!slot) return nxt;

		if (row.entity.equipped) {
			row.entity.equipped = false;
			return nxt;
		}

		if (slot === this.SLOT_ARMOR || slot === this.SLOT_SHIELD) {
			nxt.forEach(it => {
				const other = getItem(it.entity?.itemHash);
				if (this.getSlot(other) === slot) it.entity.equipped = false;
			});
		}
		row.entity.equipped = true;
		return nxt;
	}

	static getArmorClass ({items, inventory, dexMod}) {
		const getItem = hash => (items || []).find(it => UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS](it) === hash) || null;
		const equipped = this.getEquippedEntries(inventory, getItem);
		const armor = equipped.find(it => it.slot === this.SLOT_ARMOR);
		const shield = equipped.find(it => it.slot === this.SLOT_SHIELD);
		const dex = Number(dexMod) || 0;

		const parts = [];
		let total = 0;

		if (armor?.item) {
			const {ac, dexAdd, bonusAc} = this._getArmorContribution(armor.item, dex);
			total = ac + dexAdd + bonusAc;
			parts.push(`${armor.item.name} ${ac}`);
			if (dexAdd) parts.push(`DEX ${dexAdd}`);
			if (bonusAc) parts.push(UiUtil.intToBonus(bonusAc));
		} else {
			total = 10 + dex;
			parts.push("Unarmored 10");
			parts.push(`DEX ${dex}`);
		}

		if (shield?.item) {
			const shieldAc = Number(shield.item.ac) || 2;
			const bonusAc = this.parseBonus(shield.item.bonusAc);
			total += shieldAc + bonusAc;
			parts.push(`${shield.item.name} ${shieldAc}`);
			if (bonusAc) parts.push(UiUtil.intToBonus(bonusAc));
		}

		return {
			ac: total,
			breakdown: parts.join(" + "),
		};
	}

	static _getArmorContribution (item, dexMod) {
		const abvs = this.getTypeAbvs(item);
		const abv = abvs.find(it => this._ARMOR_ABVS.has(it) || it === Parser.ITM_TYP_ABV__SHIELD) || abvs[0];
		const ac = Number(item.ac) || 0;
		const dexterityMax = (abv === Parser.ITM_TYP_ABV__MEDIUM_ARMOR && item.dexterityMax === undefined)
			? 2
			: item.dexterityMax;
		const isAddDex = item.dexterityMax !== undefined || ![Parser.ITM_TYP_ABV__HEAVY_ARMOR, Parser.ITM_TYP_ABV__SHIELD].includes(abv);
		let dexAdd = 0;
		if (isAddDex) {
			dexAdd = dexMod;
			if (dexterityMax != null) dexAdd = Math.min(dexAdd, Number(dexterityMax));
		}
		return {
			ac,
			dexAdd,
			bonusAc: this.parseBonus(item.bonusAc),
		};
	}
}
