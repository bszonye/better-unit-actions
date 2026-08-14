/**
 * Ability name and description text. Why is this done. BECAUSE FIRAXIS MADE IT BAD
 * if the tag doesnt localize for name, or is default tag, remove LOC_ABILITY_ and _NAME and convert _ to space
 * and capitilise
 *
 * It might also fail to resolve if not given a argument like amount.
 */

let indexes = null;

function pushInto(map, key, value) {
	const existing = map.get(key);
	if (existing) {
		existing.push(value);
	} else {
		map.set(key, [value]);
	}
}

function indexBy(tableName, keyColumn) {
	const map = new Map();
	for (const row of GameInfo[tableName] ?? []) {
		map.set(row[keyColumn], row);
	}
	return map;
}

function buildIndexes() {
	const modifiersByAbility = new Map();
	const argumentsByModifier = new Map();
	const grantedByModifier = new Map();
	const promotionsByModifier = new Map();
	const traditionsByModifier = new Map();
	const commandsByAbility = new Map();
	const nodesByTarget = new Map();

	for (const row of GameInfo.UnitAbilityModifiers ?? []) {
		pushInto(modifiersByAbility, row.UnitAbilityType, row.ModifierId);
	}
	for (const row of GameInfo.ModifierArguments ?? []) {
		pushInto(argumentsByModifier, row.ModifierId, row);
		// The reverse direction: which modifiers hand out this ability. That is the link to the
		// promotion or tradition whose text describes it.
		if (row.Name === 'AbilityType') {
			pushInto(grantedByModifier, row.Value, row.ModifierId);
		}
	}
	for (const row of GameInfo.UnitPromotionModifiers ?? []) {
		pushInto(promotionsByModifier, row.ModifierId, row.UnitPromotionType);
	}
	for (const row of GameInfo.TraditionModifiers ?? []) {
		pushInto(traditionsByModifier, row.ModifierId, row.TraditionType);
	}
	for (const row of GameInfo.UnitCommands ?? []) {
		if (row.RequiresAbility) {
			pushInto(commandsByAbility, row.RequiresAbility, row);
		}
	}
	for (const row of GameInfo.ProgressionTreeNodeUnlocks ?? []) {
		pushInto(nodesByTarget, row.TargetType, row.ProgressionTreeNodeType);
	}

	return {
		modifiersByAbility, argumentsByModifier, grantedByModifier,
		promotionsByModifier, traditionsByModifier, commandsByAbility, nodesByTarget,
		promotions: indexBy('UnitPromotions', 'UnitPromotionType'),
		units: indexBy('Units', 'UnitType'),
		keywords: indexBy('KeywordAbilities', 'KeywordAbilityType'),
		traditions: indexBy('Traditions', 'TraditionType'),
		nodes: indexBy('ProgressionTreeNodes', 'ProgressionTreeNodeType'),
		// UnitCommands keys on CommandType, not UnitCommandType - the odd one out.
		commands: indexBy('UnitCommands', 'CommandType'),
	};
}

// --- Composition -----------------------------------------------------------------------------
const NUMERIC = /^-?\d+$/;
const BARE_TAG = /^LOC_[A-Z0-9_]*$/;

// An unresolved tag composes to itself, and a parameterised one composes to "". Neither is text.
function readable(text) {
	return text && !BARE_TAG.test(text.trim()) ? text : null;
}

// Every numeric argument on every modifier the ability owns
function valuesForAbility(abilityType, depth = 0) {
	const values = [];
	for (const modifierId of indexes.modifiersByAbility.get(abilityType) ?? []) {
		for (const argument of indexes.argumentsByModifier.get(modifierId) ?? []) {
			if (NUMERIC.test(String(argument.Value))) {
				values.push(argument.Value);
			} else if (argument.Name === 'AbilityType' && depth < 2) {
				values.push(...valuesForAbility(argument.Value, depth + 1));
			}
		}
	}
	return values;
}

// Tags that might carry this ability's text, best first.
function candidateTags(row, field) {
	const suffix = row.UnitAbilityType.replace(/^ABILITY_/, '');
	const tags = [];
	const addEntity = (entity) => {
		if (!entity) {
			return;
		}
		// KeywordAbilities uses FullDescription; everything else uses Description.
		tags.push(field === 'NAME' ? entity.Name : (entity.Description ?? entity.FullDescription));
	};

	tags.push(field === 'NAME' ? row.Name : row.Description);
	addEntity(indexes.keywords.get(row.KeywordAbilityType));
	tags.push(field === 'NAME' ? `LOC_KEYWORD_ABILITY_${suffix}` : `LOC_KEYWORD_ABILITY_${suffix}_DESCRIPTION`);
	for (const modifierId of indexes.grantedByModifier.get(row.UnitAbilityType) ?? []) {
		for (const promotion of indexes.promotionsByModifier.get(modifierId) ?? []) {
			addEntity(indexes.promotions.get(promotion));
		}
		for (const tradition of indexes.traditionsByModifier.get(modifierId) ?? []) {
			addEntity(indexes.traditions.get(tradition));
		}
	}
	for (const command of indexes.commandsByAbility.get(row.UnitAbilityType) ?? []) {
		addEntity(command);
	}
	addEntity(indexes.promotions.get(`PROMOTION_${suffix}`));
	addEntity(indexes.commands.get(`UNITCOMMAND_${suffix}`));
	addEntity(indexes.units.get(`UNIT_${suffix}`));
	for (const modifierId of indexes.modifiersByAbility.get(row.UnitAbilityType) ?? []) {
		for (const tradition of indexes.traditionsByModifier.get(modifierId) ?? []) {
			addEntity(indexes.traditions.get(tradition));
		}
	}
	for (const node of indexes.nodesByTarget.get(row.UnitAbilityType) ?? []) {
		addEntity(indexes.nodes.get(node));
	}
	return tags.filter(Boolean);
}

// have to deal with negative double sign
const DOUBLE_SIGN = /[+-]-/;

function fill(tag, value) {
	const text = readable(Locale.compose(tag, value));
	if (text && !DOUBLE_SIGN.test(text)) {
		return text;
	}
	return readable(Locale.compose(tag, String(value).replace('-', ''))) ?? text;
}

function resolve(row, field) {
	const values = valuesForAbility(row.UnitAbilityType);
	for (const tag of candidateTags(row, field)) {
		const plain = readable(Locale.compose(tag));
		if (plain) {
			return plain;
		}
		for (const value of values) {
			const filled = fill(tag, value);
			if (filled) {
				return filled;
			}
		}
	}
	return '';
}

// name last resort, replace with flat name, also strip out any 'EX_', 'AQ_', 'MO_'
function prettifyAbilityType(abilityType) {
	const words = abilityType.replace(/^ABILITY_/, '').replace(/^AQ_/, '').replace(/^EX_/, '').replace(/^MO_/, '').replace(/_/g, ' ').trim().toLowerCase();
	return words ? words.charAt(0).toUpperCase() + words.slice(1) : abilityType;
}

const cache = new Map();

function resolveRow(row) {
	const text = {
		name: resolve(row, 'NAME') || prettifyAbilityType(row.UnitAbilityType),
		description: resolve(row, 'DESCRIPTION'),
	};
	cache.set(row.UnitAbilityType, text);
	return text;
}

function warmCache() {
	if (cache.size > 0) {
		return;
	}
	indexes = buildIndexes();
	for (const row of GameInfo.UnitAbilities ?? []) {
		resolveRow(row);
	}
}

export function getAbilityText(row) {
	if (!row) {
		return { name: '', description: '' };
	}
	const cached = cache.get(row.UnitAbilityType);
	if (cached) {
		return cached;
	}
	if (!indexes) {
		indexes = buildIndexes();
	}
	return resolveRow(row);
}

engine.whenReady.then(warmCache);
