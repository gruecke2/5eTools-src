const _TYPES = {
	counter: {
		label: "Counter",
		getDefault: () => ({type: "counter", name: "Uses", current: 0, max: 1}),
		render: (comp) => _renderCounter(comp),
	},
	pips: {
		label: "Pips",
		getDefault: () => ({type: "pips", name: "Uses", count: 3, filled: [0, 0, 0]}),
		render: (comp) => _renderPips(comp),
	},
	number: {
		label: "Number",
		getDefault: () => ({type: "number", name: "", value: 0}),
		render: (comp) => _renderNumber(comp),
	},
	rollable: {
		label: "Rollable",
		getDefault: () => ({type: "rollable", name: "", formula: "1d20"}),
		render: (comp) => _renderRollable(comp),
	},
	reference: {
		label: "Reference",
		getDefault: () => ({type: "reference", name: "", tag: null}),
		render: (comp, opts) => _renderReference(comp, opts),
	},
};

class CharactersFeatureWidgetComp extends BaseComponent {
	constructor ({parentUi, featureKey, widget}) {
		super();
		this._parentUi = parentUi;
		this._featureKey = featureKey;
		this._setState({
			...this._getDefaultState(),
			...MiscUtil.copyFast(widget),
		});
		this._addHookAll("state", () => this._parentUi.updateFeatureWidget(this._featureKey, MiscUtil.copyFast(this.__state)));
	}

	_getDefaultState () {
		return {
			id: null,
			type: "counter",
			name: "",
			current: 0,
			max: 1,
			count: 1,
			filled: [],
			value: 0,
			formula: "1d20",
			tag: null,
		};
	}
}

function _getIptName (comp) {
	return ComponentUiUtil.getIptStr(
		comp,
		"name",
		{
			html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-charsheet__widget-name" type="text" placeholder="Label">`,
		},
	);
}

function _getBtnRemove ({parentUi, featureKey, widgetId, wrpRow}) {
	return veT`<button class="ve-btn ve-btn-xxs ve-btn-danger" title="Remove Widget"><span class="glyphicon glyphicon-trash"></span></button>`
		.vee.onn("click", () => {
			wrpRow.remove();
			parentUi.removeFeatureWidget(featureKey, widgetId);
		});
}

function _renderCounter (comp) {
	const iptName = _getIptName(comp);
	const iptCur = ComponentUiUtil.getIptInt(
		comp,
		"current",
		0,
		{
			html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__widget-num ve-bold" type="number">`,
		},
	);
	const iptMax = ComponentUiUtil.getIptInt(
		comp,
		"max",
		1,
		{
			html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__widget-num ve-muted ve-bold" type="number">`,
		},
	);

	const hkBounds = () => {
		iptCur.vee.removeClass("text-success").vee.removeClass("text-danger");
		if (comp._state.current >= comp._state.max) iptCur.vee.addClass("text-success");
		else if (comp._state.current <= 0) iptCur.vee.addClass("text-danger");
	};
	comp._addHookBase("current", hkBounds);
	comp._addHookBase("max", hkBounds);
	hkBounds();

	const btnDown = veT`<button class="ve-btn ve-btn-danger ve-btn-xxs" title="Decrease"><span class="glyphicon glyphicon-minus"></span></button>`
		.vee.onn("click", () => { comp._state.current--; });
	const btnUp = veT`<button class="ve-btn ve-btn-success ve-btn-xxs" title="Increase"><span class="glyphicon glyphicon-plus"></span></button>`
		.vee.onn("click", () => { comp._state.current++; });

	return {
		iptName,
		body: veT`<div class="ve-flex-v-center ve-no-shrink">
			${iptCur}
			<div class="ve-muted ve-ph-1">/</div>
			${iptMax}
			<div class="ve-btn-group ve-ml-1 ve-no-shrink">${btnDown}${btnUp}</div>
		</div>`,
	};
}

function _renderPips (comp) {
	const iptName = _getIptName(comp);
	const wrpPips = veT`<div class="ve-flex-v-center ve-flex-wrap ve-charsheet__widget-pips"></div>`;

	const renderPips = () => {
		const count = Math.max(1, Number(comp._state.count) || 1);
		let filled = [...(comp._state.filled || [])];
		if (filled.length !== count) {
			if (filled.length > count) filled = filled.slice(0, count);
			else while (filled.length < count) filled.push(0);
			comp._state.filled = filled;
			return;
		}

		wrpPips.vee.empty();
		filled.forEach((isOn, ix) => {
			const btn = veT`<button class="ve-btn ve-btn-xxs ve-charsheet__widget-pip ${isOn ? "ve-btn-primary" : "ve-btn-default"}" title="${isOn ? "Used" : "Unused"}">&nbsp;</button>`
				.vee.onn("click", () => {
					const nxt = [...(comp._state.filled || [])];
					nxt[ix] = nxt[ix] ? 0 : 1;
					comp._state.filled = nxt;
				});
			wrpPips.vee.appends(btn);
		});
	};
	comp._addHookBase("count", renderPips);
	comp._addHookBase("filled", renderPips);
	renderPips();

	const btnDown = veT`<button class="ve-btn ve-btn-xxs ve-btn-default" title="Fewer pips"><span class="glyphicon glyphicon-minus"></span></button>`
		.vee.onn("click", () => { comp._state.count = Math.max(1, (comp._state.count || 1) - 1); });
	const btnUp = veT`<button class="ve-btn ve-btn-xxs ve-btn-default" title="More pips"><span class="glyphicon glyphicon-plus"></span></button>`
		.vee.onn("click", () => { comp._state.count = (comp._state.count || 1) + 1; });

	return {
		iptName,
		body: veT`<div class="ve-flex-v-center ve-min-w-0">
			${wrpPips}
			<div class="ve-btn-group ve-ml-1 ve-no-shrink">${btnDown}${btnUp}</div>
		</div>`,
	};
}

function _renderNumber (comp) {
	const iptName = _getIptName(comp);
	const iptValue = ComponentUiUtil.getIptInt(
		comp,
		"value",
		0,
		{
			html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__widget-num" type="number">`,
		},
	);
	return {
		iptName,
		body: iptValue,
	};
}

function _renderRollable (comp) {
	const iptName = _getIptName(comp);
	const iptFormula = ComponentUiUtil.getIptStr(
		comp,
		"formula",
		{
			html: `<input class="ve-form-control ve-input-xs form-control--minimal ve-text-center ve-charsheet__widget-formula" type="text" placeholder="1d20" spellcheck="false">`,
		},
	);
	const dispRoll = veT`<span class="ve-charsheet__roller ve-ml-1 ve-no-shrink"></span>`;
	const hkRoll = () => {
		const formula = (comp._state.formula || "").trim();
		if (!formula) {
			dispRoll.vee.empty();
			return;
		}
		dispRoll.vee.html(Renderer.get().render(`{@dice ${formula}}`));
	};
	comp._addHookBase("formula", hkRoll);
	hkRoll();

	return {
		iptName,
		body: veT`<div class="ve-flex-v-center">${iptFormula}${dispRoll}</div>`,
	};
}

const _REFERENCE_KINDS = [
	{id: "spell", label: "Spell"},
	{id: "item", label: "Item"},
	{id: "feat", label: "Feat"},
	{id: "optfeature", label: "Optional Feature"},
	{id: "everything", label: "Everything"},
];

let _pInitSearch = null;

async function _pEnsureSearchReady () {
	_pInitSearch ||= (async () => {
		await SearchUiUtil.pDoGlobalInit();
		await SearchWidget.pDoGlobalInit();
	})();
	return _pInitSearch;
}

function _tagFromSearchDoc (doc) {
	if (!doc) return null;
	if (typeof doc.tag === "string" && doc.tag.trim()) return doc.tag.trim();
	if (doc.c == null) return null;
	const prop = Parser.pageCategoryToProp(doc.c);
	if (typeof prop !== "string" || !prop) return null;
	const tagName = Parser.getPropTag(prop);
	if (!tagName) return null;
	const name = doc.n;
	if (!name) return null;
	return doc.s ? `{@${tagName} ${name}|${doc.s}}` : `{@${tagName} ${name}}`;
}

async function _pPickReferenceKind () {
	return InputUiUtil.pGetUserEnum({
		values: _REFERENCE_KINDS,
		fnDisplay: it => it.label,
		isResolveItem: true,
		default: _REFERENCE_KINDS[0],
		title: "Reference Type",
	});
}

async function _pGetUserEverythingSearch () {
	await _pEnsureSearchReady();
	const index = SearchWidget.CONTENT_INDICES.ALL;
	if (!index) {
		JqueryUtil.doToast({content: `Search index was not available.`, type: "danger"});
		return null;
	}

	return new Promise(resolve => {
		const searchWidget = new SearchWidget(
			{ALL: index},
			(docOrTransformed) => {
				doClose(false);
				resolve(docOrTransformed);
			},
			{
				defaultCategory: "ALL",
				fnTransform: doc => {
					const cpy = MiscUtil.copyFast(doc);
					Object.assign(cpy, SearchWidget.docToPageSourceHash(cpy));
					cpy.tag = _tagFromSearchDoc(doc);
					return cpy;
				},
			},
		);
		const {eleModalInner, doClose} = UiUtil.getShowModal({
			title: "Select Reference",
			cbClose: (doResolve) => {
				searchWidget.getWrpSearch().vee.detach();
				if (doResolve) resolve(null);
			},
		});
		eleModalInner.vee.appends(searchWidget.getWrpSearch());
		searchWidget.doFocus();
	});
}

async function _pSearchReference (kind) {
	await _pEnsureSearchReady();
	switch (kind?.id) {
		case "spell": return SearchWidget.pGetUserSpellSearch();
		case "item": return SearchWidget.pGetUserItemSearch();
		case "feat": return SearchWidget.pGetUserFeatSearch();
		case "optfeature": return SearchWidget.pGetUserOptionalFeatureSearch();
		case "everything": return _pGetUserEverythingSearch();
		default: return null;
	}
}

async function _pPickReference (comp) {
	const kind = await _pPickReferenceKind();
	if (kind == null || typeof kind === "symbol") return;
	const doc = await _pSearchReference(kind);
	if (!doc) return;
	const tag = _tagFromSearchDoc(doc);
	if (!tag) {
		JqueryUtil.doToast({content: "Could not create a reference for that result.", type: "warning"});
		return;
	}
	comp._state.tag = tag;
}

function _renderReference (comp, {isPromptPick} = {}) {
	const iptName = _getIptName(comp);
	const dispTag = veT`<div class="ve-charsheet__widget-tag ve-flex-v-center ve-min-w-0 ve-flex-grow-1"></div>`;
	const btnSearch = veT`<button class="ve-btn ve-btn-xxs ve-btn-default" title="Choose Reference"><span class="glyphicon glyphicon-search"></span></button>`
		.vee.onn("click", () => { _pPickReference(comp).then(null); });

	const hkTag = () => {
		const tag = typeof comp._state.tag === "string" ? comp._state.tag.trim() : "";
		btnSearch.title = tag ? "Change Reference" : "Choose Reference";
		if (!tag) {
			dispTag.vee.html(`<span class="ve-muted">No reference</span>`);
			return;
		}
		try {
			dispTag.vee.html(Renderer.get().render(tag));
		} catch (e) {
			dispTag.vee.html(`<span class="ve-muted">No reference</span>`);
		}
	};
	comp._addHookBase("tag", hkTag);
	hkTag();

	if (isPromptPick) _pPickReference(comp).then(null);

	return {
		iptName,
		body: veT`<div class="ve-flex-v-center ve-min-w-0 ve-w-100">
			${dispTag}
			<div class="ve-no-shrink ve-ml-1">${btnSearch}</div>
		</div>`,
	};
}

export class CharactersFeatureWidgets {
	static getTypes () {
		return Object.keys(_TYPES);
	}

	static getDefault (type) {
		const meta = _TYPES[type];
		if (!meta) return {id: CryptUtil.uid(), type, name: type};
		return {id: CryptUtil.uid(), ...meta.getDefault()};
	}

	static getBtnAdd ({parentUi, featureKey, wrpWidgets}) {
		return veT`<button class="ve-btn ve-btn-xxs ve-btn-default" title="Add tracker (counter, pips, number, rollable, reference)"><span class="glyphicon glyphicon-plus"></span></button>`
			.vee.onn("click", evt => {
				ContextUtil.pOpenMenu(evt, this._getMenuAdd(), {userData: {parentUi, featureKey, wrpWidgets}});
			});
	}

	static renderExisting ({parentUi, featureKey, wrpWidgets}) {
		const widgets = (parentUi._state.featureWidgets || {})[featureKey] || [];
		widgets.forEach(widget => wrpWidgets.vee.appends(this.renderRow({parentUi, featureKey, widget})));
	}

	static renderRow ({parentUi, featureKey, widget, isPromptPick}) {
		const wrpRow = veT`<div class="ve-flex-v-center ve-w-100 ve-mb-1 ve-charsheet__widget"></div>`;
		const typeMeta = _TYPES[widget.type];
		const btnRemove = _getBtnRemove({parentUi, featureKey, widgetId: widget.id, wrpRow});

		if (!typeMeta) {
			veT(wrpRow)`
				<div class="ve-muted ve-italic ve-flex-grow-1 ve-min-w-0">${`Unknown widget (${widget.type || "?"})`.qq()}</div>
				<div class="ve-no-shrink">${btnRemove}</div>
			`;
			return wrpRow;
		}

		const comp = new CharactersFeatureWidgetComp({parentUi, featureKey, widget});
		const {iptName, body} = typeMeta.render(comp, {isPromptPick});

		veT(wrpRow)`
			<div class="ve-no-shrink ve-mr-1">${iptName}</div>
			<div class="ve-flex-v-center ve-flex-grow-1 ve-min-w-0">${body}</div>
			<div class="ve-no-shrink ve-ml-1">${btnRemove}</div>
		`;
		return wrpRow;
	}

	static _menuAdd = null;

	static _getMenuAdd () {
		this._menuAdd ||= ContextUtil.getMenu(
			this.getTypes()
				.map(type => new ContextUtil.Action(
					_TYPES[type].label,
					(evt, {userData}) => {
						const {parentUi, featureKey, wrpWidgets} = userData;
						parentUi.addFeatureWidget(featureKey, type, wrpWidgets);
					},
				)),
		);
		return this._menuAdd;
	}
}
