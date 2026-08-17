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
