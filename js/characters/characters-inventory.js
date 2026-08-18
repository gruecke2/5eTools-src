import {CharactersEquipment} from "./characters-equipment.js";
import {CharactersFeatureWidgets} from "./characters-widgets.js";

export class CharactersInventoryCollection extends RenderableCollectionGenericRows {
	constructor (comp, wrpRows, items) {
		super(comp, "inventory", wrpRows);
		this._items = items;
	}

	_getWrpRow () {
		return veT`<div class="ve-flex-v-center ve-mb-1 ve-w-100"></div>`;
	}

	_populateRow ({comp, wrpRow, entity}) {
		const dispName = veT`<div class="ve-flex-v-center ve-min-w-0 ve-mr-2"></div>`;
		const hkName = () => {
			const item = this._items.find(it => UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS](it) === comp._state.itemHash);
			if (!item) {
				dispName.vee.html(`<span class="ve-muted">${(comp._state.itemHash || "Unknown item").qq()}</span>`);
				return;
			}
			dispName.vee.html(Renderer.get().render(`{@item ${item.name}|${item.source}}`));
		};
		comp._addHookBase("itemHash", hkName);
		hkName();

		const iptQty = ComponentUiUtil.getIptInt(
			comp,
			"quantity",
			1,
			{
				min: 0,
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center" type="number" style="width: 52px;" title="Quantity">`,
			},
		);

		const iptNotes = ComponentUiUtil.getIptStr(
			comp,
			"notes",
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal" type="text" placeholder="Notes">`,
			},
		);

		const btnEquip = veT`<button class="ve-btn ve-btn-xxs ve-btn-default ve-mr-2 ve-no-shrink ve-hidden" title="Equip">Equip</button>`
			.vee.onn("click", () => this._comp.toggleInventoryEquip(entity.id));
		const hkEquip = () => {
			const item = this._items.find(it => UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS](it) === comp._state.itemHash);
			const slot = CharactersEquipment.getSlot(item);
			btnEquip.vee.toggleClass("ve-hidden", !slot)
				.vee.toggleClass("ve-btn-primary", !!comp._state.equipped)
				.vee.toggleClass("ve-btn-default", !comp._state.equipped);
		};
		comp._addHookBase("itemHash", hkEquip);
		comp._addHookBase("equipped", hkEquip);
		hkEquip();

		const btnDelete = this._utils.getBtnDelete({entity, title: "Remove Item"});

		veT(wrpRow)`
			${btnEquip}
			<div class="ve-flex-col ve-flex-grow-1 ve-min-w-0 ve-mr-2">${dispName}</div>
			<div class="ve-no-shrink ve-mr-2">${iptQty}</div>
			<div class="ve-flex-grow-1 ve-mr-2">${iptNotes}</div>
			<div class="ve-no-shrink">${btnDelete}</div>
		`;
	}
}

export class CharactersCustomFeatureCollection extends RenderableCollectionGenericRows {
	constructor (comp, wrpRows) {
		super(comp, "customFeatures", wrpRows);
	}

	_getWrpRow () {
		return veT`<div class="ve-flex-col ve-w-100 ve-mb-2 ve-charsheet__feature ve-pb-2"></div>`;
	}

	_populateRow ({comp, wrpRow, entity}) {
		const iptName = ComponentUiUtil.getIptStr(
			comp,
			"name",
			{
				html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-bold" type="text" placeholder="Name">`,
			},
		);

		const iptEntries = ComponentUiUtil.getIptEntries(comp, "entries");

		const btnDelete = this._utils.getBtnDelete({entity, title: "Remove Custom Feature"});
		const wrpWidgets = veT`<div class="ve-flex-col ve-w-100"></div>`;
		const btnAddWidget = CharactersFeatureWidgets.getBtnAdd({
			parentUi: this._comp,
			featureKey: entity.id,
			wrpWidgets,
		});
		CharactersFeatureWidgets.renderExisting({
			parentUi: this._comp,
			featureKey: entity.id,
			wrpWidgets,
		});

		veT(wrpRow)`
			<div class="ve-flex-v-center ve-mb-1">
				<div class="ve-flex-grow-1 ve-mr-2">${iptName}</div>
				<div class="ve-btn-group ve-no-shrink">${btnAddWidget}${btnDelete}</div>
			</div>
			${iptEntries}
			${wrpWidgets}
		`;
	}

	doDeleteExistingRender (renderedMeta) {
		this._comp.removeFeatureWidgetsForKey(renderedMeta.id);
	}
}
