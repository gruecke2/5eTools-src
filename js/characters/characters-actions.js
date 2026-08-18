import {awpToProp} from "./characters-const.js";
import {CharactersEquipment} from "./characters-equipment.js";

export const ACTION_ECONOMIES = [
	{id: "action", label: "Action"},
	{id: "bonus", label: "Bonus Action"},
	{id: "reaction", label: "Reaction"},
	{id: "free", label: "Free"},
];

const ECONOMY_IDS = ACTION_ECONOMIES.map(it => it.id);
const ECONOMY_LABELS = Object.fromEntries(ACTION_ECONOMIES.map(it => [it.id, it.label]));

export class CharactersActions {
	static getEmptyCustom (partial = {}) {
		return {
			id: partial.id || CryptUtil.uid(),
			name: partial.name || "",
			ability: Parser.ABIL_ABVS.includes(partial.ability) ? partial.ability : "str",
			bonusHit: Number(partial.bonusHit) || 0,
			bonusDmg: Number(partial.bonusDmg) || 0,
			economy: ECONOMY_IDS.includes(partial.economy) ? partial.economy : "action",
			dmg: partial.dmg || "",
			dmgType: partial.dmgType || "",
		};
	}

	static getUnarmedStub () {
		return this.getEmptyCustom({
			name: "Unarmed Strike",
			ability: "str",
			economy: "action",
			dmg: "1",
			dmgType: "B",
		});
	}

	static migrateCustom (raw) {
		if (!Array.isArray(raw)) return [];
		return raw.map(it => this._migrateCustomOne(it)).filter(Boolean);
	}

	static _migrateCustomOne (raw) {
		if (!raw || typeof raw !== "object") return null;
		return this.getEmptyCustom(raw);
	}

	static migrateOverrides (raw) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		const out = {};
		Object.entries(raw).forEach(([id, ov]) => {
			if (!ov || typeof ov !== "object") return;
			out[id] = {
				ability: Parser.ABIL_ABVS.includes(ov.ability) ? ov.ability : null,
				bonusHit: Number(ov.bonusHit) || 0,
				bonusDmg: Number(ov.bonusDmg) || 0,
				economy: ECONOMY_IDS.includes(ov.economy) ? ov.economy : "action",
			};
		});
		return out;
	}

	static getDefaultAbility (item) {
		if (CharactersEquipment.isRanged(item)) return "dex";
		return "str";
	}

	static isWeaponProficient (item, state) {
		const cat = item?.weaponCategory;
		if (cat === "simple") return !!state[awpToProp("simple")];
		if (cat === "martial") return !!state[awpToProp("martial")];
		return false;
	}

	static getHitMod ({parentUi, ability, bonusHit, item, isCustom}) {
		const pb = parentUi.getPb();
		const abilityMod = parentUi.getAbilityMod(ability);
		const proficient = isCustom || (item && this.isWeaponProficient(item, parentUi._state));
		const weaponBonus = item
			? CharactersEquipment.parseBonus(item.bonusWeapon) + CharactersEquipment.parseBonus(item.bonusWeaponAttack)
			: 0;
		return (proficient ? pb : 0) + abilityMod + weaponBonus + (Number(bonusHit) || 0);
	}

	static getDamageExtra ({parentUi, ability, bonusDmg, item}) {
		const abilityMod = parentUi.getAbilityMod(ability);
		const weaponBonus = item
			? CharactersEquipment.parseBonus(item.bonusWeapon) + CharactersEquipment.parseBonus(item.bonusWeaponDamage)
			: 0;
		return abilityMod + weaponBonus + (Number(bonusDmg) || 0);
	}

	static renderDamage (dice, extra, dmgType) {
		const extraNum = Number(extra) || 0;
		let inner = null;
		if (dice) inner = extraNum ? `${dice}${UiUtil.intToBonus(extraNum)}` : `${dice}`;
		else if (extraNum) inner = `${extraNum}`;
		if (!inner) return `<span class="ve-muted">—</span>`;
		const type = dmgType ? ` ${Parser.dmgTypeToFull(dmgType)}` : "";
		return `${Renderer.get().render(`{@damage ${inner}}`)}${type}`;
	}

	static getWeaponRows (parentUi) {
		const overrides = parentUi._state.actionOverrides || {};
		return CharactersEquipment.getEquippedEntries(
			parentUi._state.inventory,
			hash => parentUi.getItemByHash(hash),
		)
			.filter(it => it.slot === CharactersEquipment.SLOT_WEAPON)
			.map(it => ({
				key: `inv-${it.id}`,
				kind: "weapon",
				invId: it.id,
				item: it.item,
				override: overrides[it.id] || {},
			}));
	}

	static getCustomRows (parentUi) {
		return this.migrateCustom(parentUi._state.customActions)
			.map(action => ({
				key: `custom-${action.id}`,
				kind: "custom",
				action,
			}));
	}
}

class _ActionWeaponComp extends BaseComponent {
	constructor ({parentUi, invId, override, item}) {
		super();
		this._parentUi = parentUi;
		this._invId = invId;
		this._ready = false;
		this._setState({
			ability: Parser.ABIL_ABVS.includes(override.ability) ? override.ability : CharactersActions.getDefaultAbility(item),
			bonusHit: Number(override.bonusHit) || 0,
			bonusDmg: Number(override.bonusDmg) || 0,
			economy: ECONOMY_IDS.includes(override.economy) ? override.economy : "action",
		});
		this._addHookAll("state", () => {
			if (!this._ready) return;
			this._parentUi.setActionOverride(this._invId, MiscUtil.copyFast(this.__state));
		});
	}

	markReady () { this._ready = true; }
}

class _ActionCustomComp extends BaseComponent {
	constructor ({parentUi, action}) {
		super();
		this._parentUi = parentUi;
		this._ready = false;
		this._setState(CharactersActions.getEmptyCustom(action));
		this._addHookAll("state", () => {
			if (!this._ready) return;
			this._parentUi.updateCustomAction(this._state.id, MiscUtil.copyFast(this.__state));
		});
	}

	markReady () { this._ready = true; }
}

export class CharactersActionsPanel {
	static render ({parentUi, wrpTab}) {
		wrpTab.vee.addClass("ve-flex-col")
			.vee.addClass("ve-p-2");

		const btnAdd = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Add a custom action"><span class="glyphicon glyphicon-plus"></span> Add Action</button>`
			.vee.onn("click", () => parentUi.addCustomAction());
		const btnUnarmed = veT`<button class="ve-btn ve-btn-xs ve-btn-default" title="Add Unarmed Strike (1 + STR)">Add Unarmed</button>`
			.vee.onn("click", () => parentUi.addCustomAction(CharactersActions.getUnarmedStub()));
		const dispEmpty = veT`<div class="ve-muted ve-italic ve-small ve-mb-2">Equip a weapon or add an action.</div>`;

		const sections = {};
		ACTION_ECONOMIES.forEach(({id, label}) => {
			const wrpRows = veT`<div class="ve-flex-col ve-w-100"></div>`;
			const wrpSection = veT`<div class="ve-flex-col ve-w-100 ve-mb-2 ve-hidden">
				<div class="ve-bold ve-small ve-mb-1">${label.qq()}</div>
				${wrpRows}
			</div>`;
			sections[id] = {wrpSection, wrpRows};
		});

		const rendered = new Map();

		const placeRow = (meta) => {
			const economy = ECONOMY_IDS.includes(meta.getEconomy()) ? meta.getEconomy() : "action";
			sections[economy].wrpRows.vee.appends(meta.row);
		};

		const syncSectionVisibility = () => {
			let hasRows = false;
			ACTION_ECONOMIES.forEach(({id}) => {
				const n = sections[id].wrpRows.children.length;
				hasRows = hasRows || !!n;
				sections[id].wrpSection.vee.toggle(!!n);
			});
			dispEmpty.vee.toggle(!hasRows);
		};

		const hkList = () => {
			const rows = [
				...CharactersActions.getWeaponRows(parentUi),
				...CharactersActions.getCustomRows(parentUi),
			];
			const seen = new Set();
			rows.forEach(rowData => {
				seen.add(rowData.key);
				if (rendered.has(rowData.key)) return;
				rendered.set(rowData.key, null);
				const meta = rowData.kind === "weapon"
					? this._renderWeaponRow({parentUi, rowData, placeRow, syncSectionVisibility})
					: this._renderCustomRow({parentUi, rowData, placeRow, syncSectionVisibility});
				rendered.set(rowData.key, meta);
				placeRow(meta);
			});
			[...rendered.entries()].forEach(([key, meta]) => {
				if (seen.has(key)) return;
				meta?.cleanup?.();
				meta?.row?.remove?.();
				rendered.delete(key);
			});
			syncSectionVisibility();
		};

		parentUi._addHookBase("inventory", hkList);
		parentUi._addHookBase("customActions", hkList);
		hkList();

		veT(wrpTab)`
			<div class="ve-flex-v-center ve-w-100 ve-mb-2">
				<div class="ve-flex-grow-1"></div>
				<div class="ve-btn-group ve-no-shrink">${btnAdd}${btnUnarmed}</div>
			</div>
			${dispEmpty}
			${ACTION_ECONOMIES.map(({id}) => sections[id].wrpSection)}
		`;
	}

	static _renderWeaponRow ({parentUi, rowData, placeRow, syncSectionVisibility}) {
		const {item, override, invId} = rowData;
		const comp = new _ActionWeaponComp({parentUi, invId, item, override});
		return this._populateRow({
			parentUi,
			comp,
			dispNameHtml: Renderer.get().render(`{@item ${item.name}|${item.source}}`),
			item,
			isCustom: false,
			canDelete: false,
			placeRow,
			syncSectionVisibility,
			onDelete: null,
		});
	}

	static _renderCustomRow ({parentUi, rowData, placeRow, syncSectionVisibility}) {
		const {action} = rowData;
		const comp = new _ActionCustomComp({parentUi, action});
		const iptName = ComponentUiUtil.getIptStr(
			comp,
			"name",
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-bold" type="text" placeholder="Custom Action">`,
			},
		);
		const iptDmg = ComponentUiUtil.getIptStr(
			comp,
			"dmg",
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__action-dmg-ipt" type="text" placeholder="dice" title="Damage dice">`,
			},
		);
		return this._populateRow({
			parentUi,
			comp,
			dispNameHtml: null,
			iptName,
			iptDmg,
			item: null,
			isCustom: true,
			canDelete: true,
			placeRow,
			syncSectionVisibility,
			onDelete: () => parentUi.removeCustomAction(comp._state.id),
		});
	}

	static _populateRow (
		{
			parentUi,
			comp,
			dispNameHtml,
			iptName,
			iptDmg,
			item,
			isCustom,
			canDelete,
			placeRow,
			syncSectionVisibility,
			onDelete,
		},
	) {
		const selAbil = ComponentUiUtil.getSelEnum(
			comp,
			"ability",
			{
				values: Parser.ABIL_ABVS,
				fnDisplay: ab => ab.toUpperCase(),
				html: `<select class="ve-form-control ve-input-xs ve-charsheet__action-abil" title="Ability"></select>`,
			},
		);

		const iptHit = ComponentUiUtil.getIptInt(
			comp,
			"bonusHit",
			0,
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__action-bonus" type="number" title="+hit">`,
			},
		);

		const iptDmgBonus = ComponentUiUtil.getIptInt(
			comp,
			"bonusDmg",
			0,
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__action-bonus" type="number" title="+damage">`,
			},
		);

		const selEconomy = ComponentUiUtil.getSelEnum(
			comp,
			"economy",
			{
				values: ECONOMY_IDS,
				fnDisplay: id => ECONOMY_LABELS[id] || id,
				html: `<select class="ve-form-control ve-input-xs ve-charsheet__action-economy" title="Action economy"></select>`,
			},
		);

		const dispHit = veT`<span class="ve-charsheet__roller ve-mr-2"></span>`;
		const dispDmg = veT`<span class="ve-charsheet__roller ve-mr-2"></span>`;
		const dispDmg2 = veT`<span class="ve-charsheet__roller" title="Versatile (two-handed)"></span>`;

		const hkRolls = () => {
			const hit = CharactersActions.getHitMod({
				parentUi,
				ability: comp._state.ability,
				bonusHit: comp._state.bonusHit,
				item,
				isCustom,
			});
			const extra = CharactersActions.getDamageExtra({
				parentUi,
				ability: comp._state.ability,
				bonusDmg: comp._state.bonusDmg,
				item,
			});
			dispHit.vee.html(Renderer.get().render(`{@hit ${hit}}`));
			const dice = item ? item.dmg1 : comp._state.dmg;
			const dmgType = item ? item.dmgType : comp._state.dmgType;
			dispDmg.vee.html(CharactersActions.renderDamage(dice, extra, dmgType));
			if (item?.dmg2) {
				dispDmg2.vee.html(CharactersActions.renderDamage(item.dmg2, extra, dmgType)).vee.show();
			} else {
				dispDmg2.vee.empty().vee.hide();
			}
		};

		comp._addHookBase("ability", hkRolls);
		comp._addHookBase("bonusHit", hkRolls);
		comp._addHookBase("bonusDmg", hkRolls);
		if (isCustom) comp._addHookBase("dmg", hkRolls);

		const unhooks = [];
		Parser.ABIL_ABVS.forEach(ab => {
			parentUi._addHookBase(ab, hkRolls);
			unhooks.push(() => parentUi._removeHookBase(ab, hkRolls));
		});
		parentUi._addHookBase("level", hkRolls);
		unhooks.push(() => parentUi._removeHookBase("level", hkRolls));
		["simple", "martial"].forEach(id => {
			const prop = awpToProp(id);
			parentUi._addHookBase(prop, hkRolls);
			unhooks.push(() => parentUi._removeHookBase(prop, hkRolls));
		});
		hkRolls();

		const btnDelete = canDelete
			? veT`<button class="ve-btn ve-btn-xxs ve-btn-danger" title="Remove Action"><span class="glyphicon glyphicon-trash"></span></button>`
				.vee.onn("click", () => onDelete?.())
			: "";

		const dispName = dispNameHtml
			? veT`<div class="ve-flex-v-center ve-min-w-0 ve-flex-grow-1 ve-mr-2">${dispNameHtml}</div>`
			: veT`<div class="ve-flex-grow-1 ve-min-w-0 ve-mr-2">${iptName}</div>`;

		const row = veT`<div class="ve-flex-col ve-w-100 ve-mb-2 ve-charsheet__action-row">
			<div class="ve-flex-v-center ve-w-100">
				${dispName}
				<div class="ve-btn-group ve-no-shrink">${btnDelete}</div>
			</div>
			<div class="ve-flex-v-center ve-flex-wrap ve-w-100 ve-mt-1 ve-charsheet__action-controls">
				<div class="ve-mr-1">${selEconomy}</div>
				<div class="ve-mr-1">${selAbil}</div>
				<div class="ve-muted ve-small ve-mr-1">+hit</div>
				<div class="ve-mr-1">${iptHit}</div>
				<div class="ve-muted ve-small ve-mr-1">+dmg</div>
				<div class="ve-mr-1">${iptDmgBonus}</div>
				${iptDmg ? veT`<div class="ve-mr-1">${iptDmg}</div>` : ""}
			</div>
			<div class="ve-flex-v-center ve-w-100 ve-mt-1">
				${dispHit}${dispDmg}${dispDmg2}
			</div>
		</div>`;

		comp._addHookBase("economy", () => {
			placeRow({row, getEconomy: () => comp._state.economy});
			syncSectionVisibility();
		});
		comp.markReady();

		return {
			row,
			getEconomy: () => comp._state.economy,
			cleanup: () => unhooks.forEach(fn => fn()),
		};
	}
}
