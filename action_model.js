// Game-state and rules model stuff

import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { COMMAND_KIND_REINFORCE, getCommands } from './action_store.js';
import { getAbilityText } from './action_ability_text.js';

// get unitranks from tier
const leveledUniqueUnitTypes = new Set();
GameInfo.UnitReplaces.forEach((row) => leveledUniqueUnitTypes.add(row.CivUniqueUnitType));

export function getUnitRank(unit) {
	if (!unit || !leveledUniqueUnitTypes.has(unit.typeName)) {
		return null;
	}
	return GameInfo.Units.lookup(unit.type)?.Tier ?? null;
}

export function getPackedUnitsWithMovement(army, excludingUnitId) {
	return army.getUnitIds()
		.filter((memberId) => !ComponentID.isMatch(memberId, excludingUnitId))
		.map((memberId) => Units.get(memberId))
		.filter((member) => (member?.Movement?.movementMovesRemaining ?? 0) > 0 && !member?.isCommanderUnit);
}

export function findArmyCommander(armyId) {
	const player = Players.get(GameContext.localPlayerID);
	if (!player?.Units) {
		return null;
	}
	const unitIds = player.Units.getUnitIds();
	for (const id of unitIds) {
		const candidate = Units.get(id);
		if (candidate?.isCommanderUnit && ComponentID.isMatch(candidate.armyId, armyId)) {
			return candidate;
		}
	}
	return null;
}

export const MASS_REBASE_OPERATION = 'UNITOPERATION_REBASE';

export function commanderHoldsAircraft(unit) {
	if (!unit?.isCommanderUnit) {
		return false;
	}
	if (unit.isSquadronCommander || unit.isAerodromeCommander) {
		return true;
	}
	// Carrier Commander has no isCarrierCommander flag :(, so use promotion for that i guess.
	return GameInfo.Units.lookup(unit.type)?.PromotionClass === 'PROMOTION_CLASS_CARRIER_COMMANDER';
}

export function getRebaseEligibleArmyUnits(army) {
	return army.getUnitIds()
		.map((memberId) => Units.get(memberId))
		.filter((member) => (member?.Movement?.movementMovesRemaining ?? 0) > 0)
		.map((unit) => {
			const result = Game.UnitOperations.canStart(unit.id, MASS_REBASE_OPERATION, {}, false);
			return { unit, plots: new Set(result?.Plots ?? []) };
		})
		.filter((entry) => entry.plots.size > 0);
}

// rebase targets, air commander plots, with capacity
export function getDestinationRemainingCapacity(plot) {
	const unitsAtPlot = MapUnits.getUnits(plot.x, plot.y);
	const destCommander = unitsAtPlot
		.map((unitId) => Units.get(unitId))
		.find((candidate) => candidate?.isCommanderUnit);
	if (!destCommander) {
		return 1;
	}
	const destArmy = Armies.get(destCommander.armyId);
	if (!destArmy) {
		return 1;
	}
	const capacity = destArmy.combatUnitCapacity ?? 0;
	const occupied = destArmy.getUnitIds().length;
	return Math.max(0, capacity - occupied);
}

// get candidates for pulling in nearby units into commander
function getJoinCandidates(commanderUnit, api, actionType) {
	const player = Players.get(GameContext.localPlayerID);
	if (!player?.Units) {
		return [];
	}
	const destinationPlotIndex = GameplayMap.getIndexFromLocation(commanderUnit.location);
	const candidates = [];
	for (const unitId of player.Units.getUnitIds()) {
		const unit = Units.get(unitId);
		if (!unit || unit.isCommanderUnit) {
			continue;
		}
		if (ComponentID.isMatch(unit.armyId, commanderUnit.armyId)) {
			continue;
		}
		if ((unit.Movement?.movementMovesRemaining ?? 0) <= 0) {
			continue;
		}
		const result = api.canStart(unit.id, actionType, {}, false);
		if (!result?.Plots?.includes(destinationPlotIndex)) {
			continue;
		}
		candidates.push(unit);
	}
	return candidates;
}

// Health desc, then ranged strength desc, then distance to the gathering commander ascending.
export function sortJoinCandidates(units, referenceLocation) {
	const health = (unit) => (unit.Health?.maxDamage ?? 0) - (unit.Health?.damage ?? 0);
	const strength = (unit) => unit.Combat?.rangedStrength ?? 0;
	const distance = (unit) => GameplayMap.getPlotDistance(
		unit.location.x, unit.location.y, referenceLocation.x, referenceLocation.y
	);
	return [...units].sort((a, b) => {
		const healthDelta = health(b) - health(a);
		if (healthDelta !== 0) {
			return healthDelta;
		}
		const strengthDelta = strength(b) - strength(a);
		if (strengthDelta !== 0) {
			return strengthDelta;
		}
		return distance(a) - distance(b);
	});
}

export function getAircraftPullCandidates(commanderUnit) {
	return getJoinCandidates(commanderUnit, Game.UnitOperations, MASS_REBASE_OPERATION);
}

export const AIR_DROP_ABILITY = 'ABILITY_UNIT_AIR_DROP';
export const ADD_TO_ARMY_COMMAND = 'UNITCOMMAND_ADD_TO_ARMY';

export function getLandPackCandidates(commanderUnit) {
	return getJoinCandidates(commanderUnit, Game.UnitCommands, ADD_TO_ARMY_COMMAND);
}

export const GROUND_ATTACKER_CLASS = 'UNIT_CLASS_GROUND_ATTACKER'
export const BOMBER_CLASS = 'UNIT_CLASS_BOMBER';
export const RANGED_CLASS = 'UNIT_CLASS_RANGED';
export const SIEGE_CLASS = 'UNIT_CLASS_SIEGE';
export const AIR_ATTACK_OPERATION = 'UNITOPERATION_AIR_ATTACK';
export const RANGE_ATTACK_OPERATION = 'UNITOPERATION_RANGE_ATTACK';
export const NAVAL_ATTACK_OPERATION = 'UNITOPERATION_NAVAL_ATTACK';
export const HEAVY_NAVAL_CLASS = 'UNIT_CLASS_HEAVY';
export const FOCUS_FIRE_NAVAL_CLASSES = [HEAVY_NAVAL_CLASS];

export function getFocusFireOperation(commander) {
	return commander?.isFleetCommander ? NAVAL_ATTACK_OPERATION : RANGE_ATTACK_OPERATION;
}
export const FOCUS_FIRE_CLASSES = [RANGED_CLASS, SIEGE_CLASS];

export function getFocusFireClasses(commander) {
	return commander?.isFleetCommander ? FOCUS_FIRE_NAVAL_CLASSES : FOCUS_FIRE_CLASSES;
}

const unitClassSets = new Map();
function unitHasClass(unit, classTag) {
	let set = unitClassSets.get(classTag);
	if (!set) {
		set = new Set();
		GameInfo.TypeTags.forEach((tag) => {
			if (tag.Tag === classTag) {
				set.add(tag.Type);
			}
		});
		unitClassSets.set(classTag, set);
	}
	return set.has(unit.typeName);
}

function buildEligibleAttackerEntries(unitIds, classTag, operationType) {
	return unitIds
		.map((unitId) => Units.get(unitId))
		.filter((unit) => unit && (unit.Combat?.attacksRemaining ?? 0) > 0 && unitHasClass(unit, classTag))
		.map((unit) => {
			const result = Game.UnitOperations.canStart(unit.id, operationType, {}, false);
			return { unit, plots: new Set(result?.Plots ?? []) };
		})
		.filter((entry) => entry.plots.size > 0);
}

export function getClassEligibleAttackers(army, classTag, operationType = AIR_ATTACK_OPERATION) {
	return buildEligibleAttackerEntries(army.getUnitIds(), classTag, operationType);
}

// For bulk attack (focus fire)
export function getRadiusEligiblePlayerUnits(commander, classTags, operationType) {
	const player = Players.get(GameContext.localPlayerID);
	if (!player?.Units) {
		return [];
	}
	const radius = new Set(Units.getCommandRadiusPlots(commander.id) ?? []);
	if (radius.size === 0) {
		return [];
	}
	radius.add(GameplayMap.getIndexFromLocation(commander.location));
	const commanderDomain = GameInfo.Units.lookup(commander.type)?.Domain;
	return player.Units.getUnitIds()
		.map((unitId) => Units.get(unitId))
		.filter((unit) => {
			if (!unit || (unit.Combat?.attacksRemaining ?? 0) <= 0) {
				return false;
			}
			if (!unit.location || unit.location.x < 0
				|| !radius.has(GameplayMap.getIndexFromLocation(unit.location))) {
				return false;
			}
			if (GameInfo.Units.lookup(unit.type)?.Domain !== commanderDomain) {
				return false;
			}
			return classTags.some((tag) => unitHasClass(unit, tag));
		})
		.map((unit) => {
			const result = Game.UnitOperations.canStart(unit.id, operationType, {}, false);
			return { unit, plots: new Set(result?.Plots ?? []) };
		})
		.filter((entry) => entry.plots.size > 0);
}

// hide plots that are single hit, like for aircraft attacking an improvement/builting. Only show enemy plots we can see.
export function plotHasWorthwhileTarget(plotIndex) {
	const location = GameplayMap.getLocationFromIndex(plotIndex);
	const districtId = Game.Combat.getDefensibleDistrict(location);
	if (ComponentID.isValid(districtId)) {
		return true;
	}
	const revealedState = GameplayMap.getRevealedState(GameContext.localPlayerID, location.x, location.y);
	if (revealedState !== RevealedStates.VISIBLE) {
		return false;
	}
	return MapUnits.getUnits(location.x, location.y).some((unitId) => {
		const unit = Units.get(unitId);
		return unit && unit.owner !== GameContext.localPlayerID;
	});
}

function commanderHasPromotion(commander, disciplineType, promotionType) {
	return commander?.Experience?.hasPromotion?.(disciplineType, promotionType) ?? false;
}

// --- Focused-attack bonus discovery ---------------------------------------------------------
// Source of bonus damage on a commander's focused-attack commands,  from GameInfo
const FOCUSED_ATTACK_EFFECT = 'EFFECT_ADJUST_UNIT_FOCUSED_ATTACK_DAMAGE';
const MEMENTO_SLOT_KEYS = ['MajorMemento', 'MinorMemento1', 'MinorMemento2'];

const isTruthyArg = (value) => {
	const text = String(value ?? '').trim().toLowerCase();
	return text === '1' || text === 'true';
};

let focusedAttackSourceCache = null;
function getFocusedAttackSources() {
	if (focusedAttackSourceCache) {
		return focusedAttackSourceCache;
	}
	const collectionByType = new Map();
	for (const row of GameInfo.DynamicModifiers) {
		if (row.EffectType === FOCUSED_ATTACK_EFFECT) {
			collectionByType.set(row.ModifierType, row.CollectionType);
		}
	}
	const sources = new Map();
	for (const row of GameInfo.Modifiers) {
		if (collectionByType.has(row.ModifierType)) {
			sources.set(row.ModifierId, { id: row.ModifierId, collection: collectionByType.get(row.ModifierType), amount: 0 });
		}
	}
	for (const row of GameInfo.ModifierArguments) {
		const source = sources.get(row.ModifierId);
		if (!source) {
			continue;
		}
		if (row.Name === 'Amount') {
			source.amount = Number(row.Value) || 0;
		} else if (row.Name === 'CombatType') {
			source.combatType = row.Value;
		} else if (row.Name === 'AirAttack') {
			source.airOnly = isTruthyArg(row.Value);
		} else if (row.Name === 'IsAllTypes') {
			source.allCombatTypes = isTruthyArg(row.Value);
		}
	}
	for (const row of GameInfo.UnitAbilityModifiers) {
		const source = sources.get(row.ModifierId);
		if (source) {
			source.ability = row.UnitAbilityType;
		}
	}
	for (const row of GameInfo.UnitPromotionModifiers) {
		const source = sources.get(row.ModifierId);
		if (source) {
			source.promotion = row.UnitPromotionType;
		}
	}
	for (const row of GameInfo.MementoModifiers) {
		const source = sources.get(row.ModifierId);
		if (source) {
			source.memento = row.MementoType;
		}
	}
	const disciplineByPromotion = new Map();
	for (const row of GameInfo.UnitPromotionDisciplineDetails) {
		disciplineByPromotion.set(row.UnitPromotionType, row.UnitPromotionDisciplineType);
	}
	for (const source of sources.values()) {
		if (source.promotion) {
			source.discipline = disciplineByPromotion.get(source.promotion);
		}
	}
	// Each source's own display name, so the preview can attribute bonuses
	const nameByType = new Map();
	for (const row of GameInfo.UnitAbilities) {
		nameByType.set(row.UnitAbilityType, row.Name);
	}
	for (const row of GameInfo.UnitPromotions) {
		nameByType.set(row.UnitPromotionType, row.Name);
	}
	for (const row of GameInfo.Mementos) {
		nameByType.set(row.MementoType, row.Name);
	}
	for (const source of sources.values()) {
		source.nameTag = nameByType.get(source.ability ?? source.promotion ?? source.memento);
	}
	focusedAttackSourceCache = [...sources.values()].filter((source) => source.amount !== 0);
	return focusedAttackSourceCache;
}

function localPlayerHasMemento(mementoType) {
	const playerConfig = Configuration.getPlayer(GameContext.localPlayerID);
	return MEMENTO_SLOT_KEYS.some((key) => playerConfig?.getValue?.(key) === mementoType);
}

// air has a weird case where the promotions are on the commander, not the unit. Other than that, its on unit.
function sourceApplies(commander, attacker, source) {
	if (source.ability) {
		return attacker?.hasAbility?.(source.ability) ?? false;
	}
	if (source.promotion) {
		return commanderHasPromotion(commander, source.discipline, source.promotion);
	}
	if (source.memento) {
		return localPlayerHasMemento(source.memento);
	}
	return false;
}

// flatBonus is the command's unconditional bonus +2
export function getFocusedAttackBonus(commander, attacker, flatBonus, flatLabel, combatType, isAirAttack = false) {
	const parts = [];
	if (flatBonus) {
		parts.push({ amount: flatBonus, label: flatLabel });
	}
	for (const source of getFocusedAttackSources()) {
		// An air-only source is exactly that - it does not apply to ground or naval focused attacks.
		if (source.airOnly && !isAirAttack) {
			continue;
		}
		if (!source.allCombatTypes && source.combatType && combatType && source.combatType !== combatType) {
			continue;
		}
		if (!sourceApplies(commander, attacker, source)) {
			continue;
		}
		parts.push({
			amount: source.amount,
			label: source.nameTag ? Locale.compose(source.nameTag) : source.id,
		});
	}
	return { total: parts.reduce((sum, part) => sum + part.amount, 0), parts };
}


// --- Reinforce (move manually to a commander) -----------------------------------------------------
const SEA_DOMAIN = 'DOMAIN_SEA';
const LAND_DOMAIN = 'DOMAIN_LAND';

// not dealing with the fleet commander promo to hold land units ahh.
const REINFORCE_DOMAINS = {
	[SEA_DOMAIN]: { isTarget: (commander) => commander.isFleetCommander, verb: 'LOC_BETTER_ACTIONS_TRAVEL_VERB_SEA' },
	[LAND_DOMAIN]: { isTarget: (commander) => commander.isArmyCommander, verb: 'LOC_BETTER_ACTIONS_TRAVEL_VERB_LAND' },
};

export function getReinforceDomainInfo(unit) {
	return REINFORCE_DOMAINS[GameInfo.Units.lookup(unit?.type)?.Domain] ?? null;
}

const CIVILIAN_CORE_CLASS = 'CORE_CLASS_CIVILIAN';
const SUPPORT_CORE_CLASS = 'CORE_CLASS_SUPPORT';

const cachedUnitCoreClasses = new Map()
for (const row of GameInfo.Units) {
    cachedUnitCoreClasses.set(row.UnitType, row.CoreClass);
}

// The cache is keyed by unit TYPE NAME, so that is what has to be looked up. Both of these were
// passing the unit object, which is never a key, so both returned undefined for every unit and every
// caller silently got false: civilians were never excluded from reinforcement, and no unit was ever
// treated as taking a support slot.
function coreClassOf(unit) {
	return cachedUnitCoreClasses.get(unit?.typeName);
}

// --- Unit abilities --------------------------------------------------------------------------------
// unit.getAbilities() hands back hashes, so the ability table is indexed by hash to turn them into
// rows. Built once at load, the same shape as the core-class cache above.
const cachedAbilitiesByHash = new Map();
for (const row of GameInfo.UnitAbilities) {
	cachedAbilitiesByHash.set(row.$hash, row);
}

// Every ability a unit currently has, resolved for display.
//
// The text itself comes from action_ability_text.js, which digs it out of the database at runtime:
// Name and Description are both nullable, many tags have no translation, and many more hold text
// that needs a parameter and composes to nothing without one. None of that is treated as an error,
// so the list shows everything the unit really has rather than only the well-described part.
export function getUnitAbilities(unit) {
	return (unit?.getAbilities?.() ?? [])
		.map((hash) => cachedAbilitiesByHash.get(hash))
		.filter(Boolean)
		.map((row) => ({
			type: row.UnitAbilityType,
			name: getAbilityText(row).name,
			description: getAbilityText(row).description,
			// UnitAbilities.Inactive does not mean "dormant". It marks an ability that only exists
			// once something switches it on - a commander promotion, a tradition, a tech - which is
			// exactly the set that can be taken away again. A row without it, like ABILITY_PRIVATEER,
			// belongs to the unit itself and cannot be lost. So the flag reads as transient/inherent.
			transient: !!row.Inactive,
		}));
}

// technically not true for that fleet commander promo, but its buggy and weird
export function isSupportUnit(unit) {
	return !unit?.isCommanderUnit && coreClassOf(unit) === SUPPORT_CORE_CLASS;
}

export function isCivilianUnit(unit) {
	return coreClassOf(unit) === CIVILIAN_CORE_CLASS;
}

// full civilians can stack, and cant go into commander.
export function isFullyCivilianUnit(unit) {
	return coreClassOf(unit) === CIVILIAN_CORE_CLASS
		&& GameInfo.Units.lookup(unit?.type)?.FormationClass === 'FORMATION_CLASS_CIVILIAN';
}

export function canUnitReinforce(unit) {
	if (!unit || unit.isCommanderUnit || !getReinforceDomainInfo(unit)) {
		return false;
	}
	if (isFullyCivilianUnit(unit)) {
		return false;
	}
	if (ComponentID.isValid(unit.armyId) || !unit.location || unit.location.x < 0) {
		return false;
	}
	return true;
}

// when ranking unit on strength, ensure it chooses highest value
export function getUnitCombatStrength(unit) {
	const combat = unit?.Combat;
	if (!combat) {
		return 0;
	}
	return Math.max(
		combat.getMeleeStrength?.(false) ?? 0,
		combat.rangedStrength ?? 0,
		combat.bombardStrength ?? 0
	);
}

export const REINFORCE_CALL_RADIUS = 6;     // How far a commander's call for reinforcements carries.

// The units to summon, units within the radius, with right domain, best first, until full. Sort by distance/health/combat strength.
export function getReinforceCallCandidates(commander) {
	const player = Players.get(GameContext.localPlayerID);
	if (!player?.Units || !commander?.isCommanderUnit || !commander.location || commander.location.x < 0) {
		return [];
	}
	const freeCapacity = getCommanderFreeCapacity(commander);
	if (freeCapacity.combat <= 0 && freeCapacity.support <= 0) {
		return [];
	}
	const health = (unit) => (unit.Health?.maxDamage ?? 0) - (unit.Health?.damage ?? 0);
	const candidates = [];
	for (const unitId of player.Units.getUnitIds()) {
		const unit = Units.get(unitId);
		if (!unit || !canUnitReinforce(unit) || !unit.Movement?.movementMovesRemaining) {
			continue;
		}
		if (getReinforceDomainInfo(unit)?.isTarget(commander) !== true) {
			continue;
		}
		const distance = GameplayMap.getPlotDistance(
			unit.location.x, unit.location.y, commander.location.x, commander.location.y);
		if (distance > REINFORCE_CALL_RADIUS) {
			continue;
		}
		// ensure unit can reach commander
		if (!resolveReinforcePath(unit, commander)) {
			continue;
		}
		candidates.push({ unit, distance, commander });
	}
	candidates.sort((a, b) => {
		// Nearest first, then the healthiest, then the strongest.
		const distanceDelta = a.distance - b.distance;
		if (distanceDelta !== 0) {
			return distanceDelta;
		}
		const healthDelta = health(b.unit) - health(a.unit);
		if (healthDelta !== 0) {
			return healthDelta;
		}
		return getUnitCombatStrength(b.unit) - getUnitCombatStrength(a.unit);
	});
	// Plan out end destinations for units so they dont block eachothers paths.
	const claimedPlots = new Set();
	const called = [];
	let combatLeft = freeCapacity.combat;
	let supportLeft = freeCapacity.support;
	for (const candidate of candidates) {
		if (combatLeft <= 0 && supportLeft <= 0) {
			break;
		}
		const wantsSupport = isSupportUnit(candidate.unit);
		if (wantsSupport ? supportLeft <= 0 : combatLeft <= 0) {
			continue;
		}
		const route = resolveReinforcePath(candidate.unit, commander, claimedPlots);
		if (!route) {
			continue;
		}
		if (wantsSupport) {
			supportLeft--;
		} else {
			combatLeft--;
		}
		claimedPlots.add(GameplayMap.getIndexFromLocation(route.destination));
		called.push({ ...candidate, turns: route.turns, destination: route.destination });
	}
	return called;
}

// Checks commander space, including walking units mid fake reninforce
export function getCommanderFreeCapacity(commander) {
	const army = Armies.get(commander?.armyId);
	if (!army) {
		return { combat: 0, support: 0 };
	}
	const members = army.getUnitIds().map((memberId) => Units.get(memberId));
	const inbound = getCommands(COMMAND_KIND_REINFORCE)
		.filter((order) => ComponentID.isMatch(order.commanderId, commander.id))
		.map((order) => Units.get(order.unitId));
	const countSupport = (units) => units.filter((unit) => unit && isSupportUnit(unit)).length;
	const present = (units) => units.filter(Boolean).length;
	const supportTaken = countSupport(members) + countSupport(inbound);
	const combatTaken = (present(members) - countSupport(members))
		+ (present(inbound) - countSupport(inbound));
	return {
		combat: Math.max(0, (army.combatUnitCapacity ?? 0) - combatTaken),
		support: Math.max(0, (army.nonCombatUnitCapacity ?? 0) - supportTaken),
	};
}

export function getCommanderFreeSlots(commander, forUnit = null) {
	const capacity = getCommanderFreeCapacity(commander);
	return isSupportUnit(forUnit) ? capacity.support : capacity.combat;
}

// choose a commander to send, by capacity/distance/experience
// TODO should probably have a weighted sum, since a commander 40 tiles wins over a commander 2 tiles if one has more room

// --- Cautious movement -------------------------------------------------------------------------
// Stops a long move short of a ZOC unit the player had no way to see.

// Adjust orders using hidden info to shorten the destination to the tile pre ZOC unit.
function isHiddenZoneOfControl(tile) {
	const playerId = GameContext.localPlayerID;
	const player = Players.get(playerId);
	const sources = [tile];
	for (let direction = 0; direction < 6; direction++) {
		const neighbour = GameplayMap.getAdjacentPlotLocation(tile, direction);
		if (neighbour) {
			sources.push(neighbour);
		}
	}
	for (const source of sources) {
		// A zone of control the player can already see is not a surprise, so it does not count.
		if (GameplayMap.getRevealedState(playerId, source.x, source.y) === RevealedStates.VISIBLE) {
			continue;
		}
		for (const otherId of MapUnits.getUnits(source.x, source.y)) {
			const other = Units.get(otherId);
			if (!other || other.owner === playerId || !other.Combat?.exertsZOC) {
				continue;
			}
			if (player?.Diplomacy?.isAtWarWith?.(other.owner)) {
				return true;
			}
		}
	}
	return false;
}

// Returns the tile the move should actually target, or null when the original is already fine.
export function findCautiousMoveDestination(unit, destination) {
	// Units that ignore zones of control are never stopped by one, so nothing to guard against.
	if (!unit || unit.Combat?.ignoresZOC) {
		return null;
	}
	const path = Units.getPathTo(unit.id, destination);
	const plots = path?.plots ?? [];
	if (plots.length === 0) {
		return null;
	}
	let lastSafe = null;
	for (let step = 0; step < plots.length; step++) {
		const tile = GameplayMap.getLocationFromIndex(plots[step]);
		// The tile the unit is already standing on is not a step.
		if (tile.x === unit.location.x && tile.y === unit.location.y) {
			continue;
		}
		if (isHiddenZoneOfControl(tile)) {
			return lastSafe ? { destination: lastSafe, stoppedBefore: tile } : null;
		}
		lastSafe = tile;
	}
	return null;
}

// --- Escort movement constraint ----------------------------------------------------------------
// What an attached pair can actually do, as opposed to what the commander alone could do.
export function getSharedEscortMovement(selected, partner) {
	if (!selected || !partner) {
		return [];
	}
	const partnerReach = new Set(Units.getReachableMovement(partner.id) ?? []);
	const attackPlots = new Set(Units.getReachableTargets(selected.id) ?? []);
	return (Units.getReachableMovement(selected.id) ?? [])
		.filter((plot) => partnerReach.has(plot) && !attackPlots.has(plot));
}

// crabwalking while escorting, such that theres no loss of commander radius ignore obstacles
// TODO suppress multiple move sounds? Feels too base game plumbing to do
export function findEscortPacedDestination(commander, escort, destination) {
	const path = Units.getPathTo(escort.id, destination);
	const plots = path?.plots ?? [];
	const turns = path?.turns ?? [];
	if (plots.length === 0 || turns.length !== plots.length) {
		return { tile: null, isFinal: false };
	}
	let step = 0;
	while (step < plots.length) {
		const tile = GameplayMap.getLocationFromIndex(plots[step]);
		if (tile.x !== escort.location.x || tile.y !== escort.location.y) {
			break;
		}
		step++;
	}
	if (step >= plots.length) {
		return { tile: null, isFinal: false };
	}
	// turns[0] rather than a literal 1: the first entry is numbered however the path chooses to.
	if (turns[step] !== turns[0]) {
		return { tile: null, isFinal: false };
	}
	if (!new Set(Units.getReachableMovement(commander.id) ?? []).has(plots[step])) {
		return { tile: null, isFinal: false };
	}
	return {
		tile: GameplayMap.getLocationFromIndex(plots[step]),
		isFinal: step === plots.length - 1,
	};
}

// --- Escort attachment -------------------------------------------------------------------------
// Ties one unit to a commander so it travels with it: when the commander moves, the escort is
// ordered to the same tile.
// Constraining the order using requestMoveOperation, see getSharedEscortMovement for the tiles a pair may reach
// in one turn,
//  findEscortPacedDestination for how far a longer journey gets this turn
// Detaching is left as safety feature that shouldnt trigger
export function canCommanderAttach(commander) {
	return commander?.isArmyCommander === true || commander?.isFleetCommander === true;
}

// The unit that would be attached: one sharing the commander's tile, or an adjacent one
// that could move in. same domain for now TODO LATER ONE WAY NAVAL FOR EMBARK?
export function getAttachCandidate(commander) {
	if (!canCommanderAttach(commander) || !commander.location || commander.location.x < 0) {
		return null;
	}
	const player = Players.get(GameContext.localPlayerID);
	if (!player?.Units) {
		return null;
	}
	const eligible = (unit) => unit
		&& !unit.isCommanderUnit
		&& !ComponentID.isValid(unit.armyId)
		&& unit.location && unit.location.x >= 0
		&& getReinforceDomainInfo(unit)?.isTarget(commander) === true;

	const sameTile = MapUnits.getUnits(commander.location.x, commander.location.y)
		.map((unitId) => Units.get(unitId))
		.find(eligible);
	if (sameTile) {
		return sameTile;
	}
	// best unit ranked by health then strength.
	const health = (unit) => (unit.Health?.maxDamage ?? 0) - (unit.Health?.damage ?? 0);
	const adjacent = [];
	for (let direction = 0; direction < 6; direction++) {
		const neighbour = GameplayMap.getAdjacentPlotLocation(commander.location, direction);
		if (!neighbour) {
			continue;
		}
		for (const unitId of MapUnits.getUnits(neighbour.x, neighbour.y)) {
			const unit = Units.get(unitId);
			if (eligible(unit)) {
				adjacent.push(unit);
			}
		}
	}
	adjacent.sort((a, b) => (health(b) - health(a)) || (getUnitCombatStrength(b) - getUnitCombatStrength(a)));
	return adjacent[0] ?? null;
}

// Where a unit should move to reach a commander, and how long it takes.
// Deals with pathing when a commander tile has another combat unit on it. So need to have fallbacks of adjacent tiles.
export function resolveReinforcePath(unit, commander, claimedPlots = null) {
	// Already close enough to join outright - no journey needed.
	const commanderPlot = GameplayMap.getIndexFromLocation(commander.location);
	const joinNow = Game.UnitCommands.canStart(unit.id, ADD_TO_ARMY_COMMAND, {}, false);
	if (joinNow?.Plots?.includes(commanderPlot)) {
		return { turns: 0, destination: commander.location };
	}
    // next to commander, but no legal join as no movement left
	if (GameplayMap.getPlotDistance(
		unit.location.x, unit.location.y, commander.location.x, commander.location.y) <= 1) {
		return { turns: 1, destination: unit.location };
	}
	const turnsFor = (path) => (path?.turns?.length ? path.turns[path.turns.length - 1] : null);

	const reachableThisTurn = new Set(Units.getReachableMovement(unit.id) ?? []);
	const approach = Units.getPathTo(unit.id, commander.location);
	const approachPlots = approach?.plots ?? [];
	if (approachPlots.length >= 2 && reachableThisTurn.has(approachPlots[approachPlots.length - 1])) {
		const finalStep = approachPlots[approachPlots.length - 2];
		// Passing through a tile is not the same as being able to stop on it - the tile before the
		// commander is often the one crowded against it - so confirm it is somewhere this unit can
		// actually end up.
		if (!claimedPlots?.has(finalStep)) {
			const finalStepLocation = GameplayMap.getLocationFromIndex(finalStep);
			if (turnsFor(Units.getPathTo(unit.id, finalStepLocation)) === 1) {
				return { turns: 1, destination: finalStepLocation };
			}
		}
	}
	const scoreFor = (path) => {
		const turns = turnsFor(path);
		if (!turns) {
			return null;
		}
		return { turns, steps: Math.max(0, (path.plots?.length ?? 1) - 1) };
	};
	const isBetter = (score, best) => {
		if (!best) {
			return true;
		}
		if (score.turns !== best.turns) {
			return score.turns < best.turns;
		}
		return score.steps < best.steps;
	};
	const findBest = (skipClaimed) => {
		let best = null;
		for (let direction = 0; direction < 6; direction++) {
			const neighbour = GameplayMap.getAdjacentPlotLocation(commander.location, direction);
			if (!neighbour) {
				continue;
			}
			if (skipClaimed && claimedPlots?.has(GameplayMap.getIndexFromLocation(neighbour))) {
				continue;
			}
			const score = scoreFor(Units.getPathTo(unit.id, neighbour));
			if (!score) {
				continue;
			}
			if (isBetter(score, best)) {
				best = { ...score, destination: neighbour };
			}
		}
		return best;
	};
	const best = findBest(true) ?? findBest(false);
	if (best) {
		return best;
	}
	const direct = turnsFor(Units.getPathTo(unit.id, commander.location));
	return direct ? { turns: direct, destination: commander.location } : null;
}

// Commanders of the matching kind this unit could travel to, and turns.
export function hasReinforceTarget(unit) {
	const player = Players.get(GameContext.localPlayerID);
	const domainInfo = getReinforceDomainInfo(unit);
	if (!player?.Units || !domainInfo || !canUnitReinforce(unit)) {
		return false;
	}
	for (const otherId of player.Units.getUnitIds()) {
		const commander = Units.get(otherId);
		if (!commander || !domainInfo.isTarget(commander)) {
			continue;
		}
		if (!commander.location || commander.location.x < 0) {
			continue;
		}
		if (getCommanderFreeSlots(commander, unit) <= 0) {
			continue;
		}
		return true;
	}
	return false;
}

export function getReinforceTargets(unit) {
	const player = Players.get(GameContext.localPlayerID);
	const domainInfo = getReinforceDomainInfo(unit);
	if (!player?.Units || !domainInfo || !canUnitReinforce(unit)) {
		return [];
	}
	const targets = [];
	for (const otherId of player.Units.getUnitIds()) {
		const commander = Units.get(otherId);
		if (!commander || !domainInfo.isTarget(commander) || !commander.location || commander.location.x < 0) {
			continue;
		}
		const route = resolveReinforcePath(unit, commander);
		if (!route) {
			continue;
		}
		targets.push({
			commander,
			plotIndex: GameplayMap.getIndexFromLocation(commander.location),
			turns: route.turns,
			destination: route.destination,
			freeSlots: getCommanderFreeSlots(commander, unit),
		});
	}
	return targets;
}

// --- Melee Focus Fire dummy for adjacent units because of the pain of moving out of commander radius for obstacles
// differs from ranged as needs to take into account defensive attacks back. Also needs to deal with flank
const INFANTRY_CLASS = 'UNIT_CLASS_INFANTRY';
const CAVALRY_CLASS = 'UNIT_CLASS_CAVALRY';
const MELEE_FOCUS_FIRE_CLASSES = [INFANTRY_CLASS, CAVALRY_CLASS];
export const MELEE_ATTACK_COMMAND = 'UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE';
export const MOVE_TO_OPERATION = 'UNITOPERATION_MOVE_TO';

export function getUnitCurrentHP(unit) {
	return unit?.Health ? unit.Health.maxDamage - unit.Health.damage : 0;
}

export function canMeleeAttackTargetNow(unit, targetPlotIndex) {
	return (Units.getReachableTargets(unit.id) ?? []).includes(targetPlotIndex);
}

export function getAdjacentMeleeCandidates(commander, targetPlot) {
	const targetPlotIndex = GameplayMap.getIndexFromLocation(targetPlot);
	const player = Players.get(GameContext.localPlayerID);
	if (!player?.Units) {
		return [];
	}
	const commanderDomain = GameInfo.Units.lookup(commander.type)?.Domain;
	return player.Units.getUnitIds()
		.map((unitId) => Units.get(unitId))
		.filter((unit) => {
			if (!unit || (unit.Combat?.attacksRemaining ?? 0) <= 0) {
				return false;
			}
			// Packed-into-army units report a sentinel off-map location; they aren't standing
			// anywhere adjacent to anything.
			if (!unit.location || unit.location.x < 0) {
				return false;
			}
			if (GameInfo.Units.lookup(unit.type)?.Domain !== commanderDomain) {
				return false;
			}
			if (!MELEE_FOCUS_FIRE_CLASSES.some((tag) => unitHasClass(unit, tag))) {
				return false;
			}
			const distance = GameplayMap.getPlotDistance(
				unit.location.x, unit.location.y, targetPlot.x, targetPlot.y
			);
			if (distance !== 1) {
				return false;
			}
			return canMeleeAttackTargetNow(unit, targetPlotIndex);
		});
}
