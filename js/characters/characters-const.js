export const CHARACTERS_FILE_TYPE = "charsheet";
export const CHARACTERS_STORAGE_KEY_STATE = "state";
export const CHARACTERS_STORAGE_KEY_PENDING_IMPORT = "characters.pendingImport";

export const FEATURE_SECTION_CLASS = "class";
export const FEATURE_SECTION_SUBCLASS = "subclass";
export const FEATURE_SECTION_RACE = "race";
export const FEATURE_SECTION_BACKGROUND = "background";
export const FEATURE_SECTION_FEAT = "feat";
export const FEATURE_SECTION_CUSTOM = "custom";

export const FEATURE_SECTION_TAB_TITLES = {
	[FEATURE_SECTION_CLASS]: "Class",
	[FEATURE_SECTION_SUBCLASS]: "Subclass",
	[FEATURE_SECTION_RACE]: "Species",
	[FEATURE_SECTION_BACKGROUND]: "Background",
	[FEATURE_SECTION_FEAT]: "Feats",
	[FEATURE_SECTION_CUSTOM]: "Custom",
};

export const FEATURE_SECTIONS_AUTO = [
	FEATURE_SECTION_CLASS,
	FEATURE_SECTION_SUBCLASS,
	FEATURE_SECTION_RACE,
	FEATURE_SECTION_BACKGROUND,
	FEATURE_SECTION_FEAT,
];

export const FEATURE_SECTIONS = [
	...FEATURE_SECTIONS_AUTO,
	FEATURE_SECTION_CUSTOM,
];

export const TAB_SPELLCASTING_TITLE = "Spellcasting";

/** 0 none / 1 proficient / 2 expertise / 3 half — matches ProfUiUtil.getProfCycler */
export const SKILL_PROF_MULT = {
	0: 0,
	1: 1,
	2: 2,
	3: 0.5,
};

export function skillToProp (skill) {
	return `skill_${skill.replace(/ /g, "_")}`;
}

export function saveToProp (ab) {
	return `save_${ab}`;
}

export const ARMOR_WEAPON_PROF_DEFS = [
	{id: "simple", label: "Simple Weapons"},
	{id: "martial", label: "Martial Weapons"},
	{id: "shield", label: "Shields"},
	{id: "light", label: "Light Armor"},
	{id: "medium", label: "Medium Armor"},
	{id: "heavy", label: "Heavy Armor"},
];

export function awpToProp (id) {
	return `awp_${id}`;
}

/** Display label + Font Awesome Light icon for each `Parser.DMG_TYPES` value. */
export const DAMAGE_TYPE_UI = {
	acid: {label: "Acid", icon: "fa-vial"},
	bludgeoning: {label: "Bludgeon", icon: "fa-mace"},
	cold: {label: "Cold", icon: "fa-snowflake"},
	fire: {label: "Fire", icon: "fa-fire"},
	force: {label: "Force", icon: "fa-burst"},
	lightning: {label: "Lightning", icon: "fa-bolt"},
	necrotic: {label: "Necrotic", icon: "fa-skull"},
	piercing: {label: "Pierce", icon: "fa-bow-arrow"},
	poison: {label: "Poison", icon: "fa-flask-poison"},
	psychic: {label: "Psychic", icon: "fa-brain"},
	radiant: {label: "Radiant", icon: "fa-sun-bright"},
	slashing: {label: "Slash", icon: "fa-sword"},
	thunder: {label: "Thunder", icon: "fa-cloud-bolt"},
};

export function getSkills () {
	return Object.keys(Parser.SKILL_TO_ATB_ABV);
}

export function migrateSkillProf (value) {
	if (value === true) return 1;
	if (value === false || value == null) return 0;
	const num = Number(value);
	if (!Number.isFinite(num) || num < 0) return 0;
	if (num > 3) return 3;
	return num;
}
