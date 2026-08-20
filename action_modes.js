// Custom ChoosePlotInterfaceMode handlers and issueing the attacks once a plot is committed.

import { InterfaceMode } from '/core/ui/interface-modes/interface-modes.js';
import ChoosePlotInterfaceMode from '/base-standard/ui/interface-modes/interface-mode-choose-plot.js';
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { Audio } from '/core/ui/audio-base/audio-support.js';
import { HighlightColors } from '/core/ui/utilities/utilities-color.js';
import { ADD_TO_ARMY_COMMAND, AIR_ATTACK_OPERATION, MASS_REBASE_OPERATION, MELEE_ATTACK_COMMAND, MOVE_TO_OPERATION, canMeleeAttackTargetNow, getAdjacentMeleeCandidates, getClassEligibleAttackers, getDestinationRemainingCapacity, getFocusFireOperation, getReinforceTargets, getRebaseEligibleArmyUnits, resolveReinforcePath, plotHasWorthwhileTarget, sortJoinCandidates } from './action_model.js';
import { buildFocusFireSteps, planMeleeFocusFire, simulateStrikeSequence } from './action_combat.js';
import { COMMAND_KIND_ATTACH, COMMAND_KIND_REINFORCE, forgetCommand, getCommands, onCommandsRestored, saveCommand } from './action_store.js';

export const MASS_REBASE_MODE = 'INTERFACEMODE_MASS_REBASE';

class MassRebaseInterfaceMode extends ChoosePlotInterfaceMode {
	eligibleUnits = [];
	validPlots = new Set();

	initialize() {
		const context = this.Context;
		const army = Armies.get(context?.ArmyId);
		if (!army) {
			return false;
		}
		this.eligibleUnits = getRebaseEligibleArmyUnits(army);
		this.validPlots = new Set();
		for (const entry of this.eligibleUnits) {
			for (const plotIndex of entry.plots) {
				this.validPlots.add(plotIndex);
			}
		}
		return this.validPlots.size > 0;
	}

	reset() {
		this.eligibleUnits = [];
		this.validPlots.clear();
	}

	decorate(overlay) {
		if (this.validPlots.size === 0) {
			return;
		}
		const GREEN_TRANSPARENT_LINEAR = { x: 0, y: 1, z: 0, w: 0.5 };
		const plotOverlay = overlay.addPlotOverlay();
		plotOverlay?.addPlots([...this.validPlots], { fillColor: GREEN_TRANSPARENT_LINEAR });
		Audio.playSound('data-audio-plot-select-overlay', 'interact-unit');
	}

	proposePlot(plot, accept, reject) {
		const plotIndex = GameplayMap.getIndexFromLocation(plot);
		if (this.validPlots.has(plotIndex)) {
			accept();
		} else {
			reject();
		}
	}

	commitPlot(plot) {
		const plotIndex = GameplayMap.getIndexFromLocation(plot);
		const args = { X: plot.x, Y: plot.y };
		const health = (unit) => (unit.Health?.maxDamage ?? 0) - (unit.Health?.damage ?? 0);
		const strength = (unit) => unit.Combat?.rangedStrength ?? 0;
		const ordered = [...this.eligibleUnits].sort((a, b) => {
			const healthDelta = health(b.unit) - health(a.unit);
			if (healthDelta !== 0) {
				return healthDelta;
			}
			return strength(b.unit) - strength(a.unit);
		}).filter((entry) => entry.plots.has(plotIndex));

        // gotta check that the commander is over capacity for reinforce
		let remainingSlots = getDestinationRemainingCapacity(plot);
		for (const entry of ordered) {
			if (remainingSlots <= 0) {
				break;
			}
			Game.UnitOperations.sendRequest(entry.unit.id, MASS_REBASE_OPERATION, args);
			remainingSlots--;
		}
	}
}

InterfaceMode.addHandler(MASS_REBASE_MODE, new MassRebaseInterfaceMode());

export const GROUND_ATTACK_MODE = 'INTERFACEMODE_MOD_GROUND_ATTACK';

export const CARPET_BOMB_MODE = 'INTERFACEMODE_MOD_CARPET_BOMB';

// Attacks with each unit in the simulated sequence, stopping as soon as the worst-case cumulative
// damage would already be lethal
async function runSmartFocusedStrike(orderedAttackers, plot) {
	for await (const step of simulateStrikeSequence(orderedAttackers, plot)) {
		console.error(
			`smart-strike: unit ${JSON.stringify(step.attacker.id)} vs ${step.defender.name} (isDistrict=${step.defender.isDistrict})`,
			`damage ${step.damage.min.toFixed(1)}-${step.damage.max.toFixed(1)},`,
			`cumulative worst-case ${step.cumulativeMin.toFixed(1)} of ${step.remainingHP} HP,`,
			`chance to kill ${Math.round(step.chanceToKill * 100)}%`
		);
		if (!Game.UnitOperations.canStart(step.attacker.id, AIR_ATTACK_OPERATION, { X: plot.x, Y: plot.y }, false)?.Success) {
			continue;
		}
		Game.UnitOperations.sendRequest(step.attacker.id, AIR_ATTACK_OPERATION, { X: plot.x, Y: plot.y });
	}
}

class SmartFocusedStrikeInterfaceMode extends ChoosePlotInterfaceMode {
	classTag = '';
	eligibleEntries = [];
	validPlots = new Set();

	initialize() {
		const context = this.Context;
		this.classTag = context?.ClassTag ?? '';
		const army = this.classTag ? Armies.get(context?.ArmyId) : null;
		if (!army) {
			return false;
		}
		this.eligibleEntries = getClassEligibleAttackers(army, this.classTag);
		this.validPlots = new Set();
		for (const entry of this.eligibleEntries) {
			for (const plotIndex of entry.plots) {
				if (plotHasWorthwhileTarget(plotIndex)) {
					this.validPlots.add(plotIndex);
				}
			}
		}
		return this.validPlots.size > 0;
	}

	reset() {
		this.classTag = '';
		this.eligibleEntries = [];
		this.validPlots.clear();
	}

	decorate(overlay) {
		if (this.validPlots.size === 0) {
			return;
		}
		const GREEN_TRANSPARENT_LINEAR = { x: 0, y: 1, z: 0, w: 0.5 };
		const plotOverlay = overlay.addPlotOverlay();
		plotOverlay?.addPlots([...this.validPlots], { fillColor: GREEN_TRANSPARENT_LINEAR });
		Audio.playSound('data-audio-plot-select-overlay', 'interact-unit');
	}

	proposePlot(plot, accept, reject) {
		const plotIndex = GameplayMap.getIndexFromLocation(plot);
		if (this.validPlots.has(plotIndex)) {
			accept();
		} else {
			reject();
		}
	}

	commitPlot(plot) {
		const plotIndex = GameplayMap.getIndexFromLocation(plot);
		const attackers = this.eligibleEntries
			.filter((entry) => entry.plots.has(plotIndex))
			.map((entry) => entry.unit);
		if (attackers.length === 0) {
			return;
		}
		const ordered = sortJoinCandidates(attackers, attackers[0].location);
		runSmartFocusedStrike(ordered, plot);
	}
}

InterfaceMode.addHandler(GROUND_ATTACK_MODE, new SmartFocusedStrikeInterfaceMode());
InterfaceMode.addHandler(CARPET_BOMB_MODE, new SmartFocusedStrikeInterfaceMode());

// Land and sea Focus Fire are mechanically identical
// NO flatBonus/bonusSources here as it just does plain range attacks
export const FOCUS_FIRE_LAND_MODE = 'INTERFACEMODE_MOD_FOCUS_FIRE';
export const FOCUS_FIRE_SEA_MODE = 'INTERFACEMODE_MOD_FOCUS_FIRE_SEA';

export const FOCUS_FIRE_VARIANTS = {
	[FOCUS_FIRE_LAND_MODE]: {
		command: 'UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED', icon: 'blp:action_focusfire.png',
		commanderCheck: (commander) => commander?.isArmyCommander,
	},
	[FOCUS_FIRE_SEA_MODE]: {
		command: 'UNITCOMMAND_FOCUSED_ATTACK_SEA_RANGED', icon: 'blp:action_navalattack.png',
		commanderCheck: (commander) => commander?.isFleetCommander,
	},
};

async function runSmartFocusFire(commander, plot, variant) {
	const steps = await buildFocusFireSteps(commander, plot);
	const operation = getFocusFireOperation(commander);
	for (const step of steps) {
		console.error(
			`focus-fire: unit ${JSON.stringify(step.attacker.id)} effective damage ${step.damage.min.toFixed(1)}-${step.damage.max.toFixed(1)},`,
			`remaining HP ${step.remainingHP}`
		);
		if (!Game.UnitOperations.canStart(step.attacker.id, operation, { X: plot.x, Y: plot.y }, false)?.Success) {
			console.error(`focus-fire: ${operation} refused for ${JSON.stringify(step.attacker.id)}; skipped`);
			continue;
		}
		Game.UnitOperations.sendRequest(step.attacker.id, operation, { X: plot.x, Y: plot.y });
	}
}

class SmartFocusFireInterfaceMode extends ChoosePlotInterfaceMode {
	commander = null;
	validPlots = new Set();
	variant = null;

	initialize() {
		const context = this.Context;
		const commanderId = context?.UnitID;
		this.commander = commanderId ? Units.get(commanderId) : null;
		if (!this.commander) {
			return false;
		}
        // only works on units in command radius
		this.variant = Object.values(FOCUS_FIRE_VARIANTS).find((v) => v.command === context.NativeCommand) ?? null;
		const result = Game.UnitCommands.canStart(commanderId, context.NativeCommand, {}, false);
		this.validPlots = new Set((result?.Plots ?? []).filter((plotIndex) => plotHasWorthwhileTarget(plotIndex)));
		return this.validPlots.size > 0;
	}

	reset() {
		this.commander = null;
		this.validPlots.clear();
		this.variant = null;
	}

	decorate(overlay) {
		if (this.validPlots.size === 0) {
			return;
		}
		const GREEN_TRANSPARENT_LINEAR = { x: 0, y: 1, z: 0, w: 0.5 };
		const plotOverlay = overlay.addPlotOverlay();
		plotOverlay?.addPlots([...this.validPlots], { fillColor: GREEN_TRANSPARENT_LINEAR });
		Audio.playSound('data-audio-plot-select-overlay', 'interact-unit');
	}

	proposePlot(plot, accept, reject) {
		const plotIndex = GameplayMap.getIndexFromLocation(plot);
		if (this.validPlots.has(plotIndex)) {
			accept();
		} else {
			reject();
		}
	}

	commitPlot(plot) {
		runSmartFocusFire(this.commander, plot, this.variant);
	}
}

InterfaceMode.addHandler(FOCUS_FIRE_LAND_MODE, new SmartFocusFireInterfaceMode());
InterfaceMode.addHandler(FOCUS_FIRE_SEA_MODE, new SmartFocusFireInterfaceMode());
export const MELEE_FOCUS_FIRE_MODE = 'INTERFACEMODE_MOD_MELEE_FOCUS_FIRE';

async function runSmartMeleeFocusFire(commander, targetPlot) {
	const steps = await planMeleeFocusFire(commander, targetPlot);
	const targetPlotIndex = GameplayMap.getIndexFromLocation(targetPlot);
	for (const step of steps) {
		console.error(
			`melee-focus-fire: unit ${JSON.stringify(step.attacker.id)}`,
			`damage ${step.damage.min.toFixed(1)}-${step.damage.max.toFixed(1)},`,
			`own losses ${step.returnDamage.min.toFixed(1)}-${step.returnDamage.max.toFixed(1)},`,
			`remaining HP ${step.remainingHP}`
		);
		// Ensure target is still alive as earlier attack could kill
		if (!canMeleeAttackTargetNow(step.attacker, targetPlotIndex)) {
			continue;
		}
		// Attacking an adjacent enemy is a MOVE_TO on enemy plot.
		Game.UnitOperations.sendRequest(step.attacker.id, MOVE_TO_OPERATION, {
			X: targetPlot.x, Y: targetPlot.y,
			Modifiers: UnitOperationMoveModifiers.ATTACK + UnitOperationMoveModifiers.MOVE_IGNORE_UNEXPLORED_DESTINATION,
		});
	}
}

class SmartMeleeFocusFireInterfaceMode extends ChoosePlotInterfaceMode {
	commander = null;
	validPlots = new Set();

	initialize() {
		const context = this.Context;
		const commanderId = context?.UnitID;
		this.commander = commanderId ? Units.get(commanderId) : null;
		if (!this.commander) {
			return false;
		}
		const result = Game.UnitCommands.canStart(commanderId, MELEE_ATTACK_COMMAND, {}, false);
		// Only offer targets that something adjacent can actually hit without moving
		this.validPlots = new Set((result?.Plots ?? []).filter((plotIndex) => {
			if (!plotHasWorthwhileTarget(plotIndex)) {
				return false;
			}
			const location = GameplayMap.getLocationFromIndex(plotIndex);
			return getAdjacentMeleeCandidates(this.commander, location).length > 0;
		}));
		return this.validPlots.size > 0;
	}

	reset() {
		this.commander = null;
		this.validPlots.clear();
	}

	decorate(overlay) {
		if (this.validPlots.size === 0) {
			return;
		}
		const GREEN_TRANSPARENT_LINEAR = { x: 0, y: 1, z: 0, w: 0.5 };
		const plotOverlay = overlay.addPlotOverlay();
		plotOverlay?.addPlots([...this.validPlots], { fillColor: GREEN_TRANSPARENT_LINEAR });
		Audio.playSound('data-audio-plot-select-overlay', 'interact-unit');
	}

	proposePlot(plot, accept, reject) {
		const plotIndex = GameplayMap.getIndexFromLocation(plot);
		if (this.validPlots.has(plotIndex)) {
			accept();
		} else {
			reject();
		}
	}

	commitPlot(plot) {
		runSmartMeleeFocusFire(this.commander, plot);
	}
}

InterfaceMode.addHandler(MELEE_FOCUS_FIRE_MODE, new SmartMeleeFocusFireInterfaceMode());

// --- Reinforce manual move to a commander -----------------------------------------------------

export const REINFORCE_MODE = 'INTERFACEMODE_MOD_REINFORCE';

// unitId -> { commanderId, plannedTurns }
const pendingReinforcements = new Map();

class ReinforceInterfaceMode extends ChoosePlotInterfaceMode {
	unit = null;
	targetsByPlot = new Map();

	initialize() {
		const unitId = this.Context?.UnitID;
		this.unit = unitId ? Units.get(unitId) : null;
		if (!this.unit) {
			return false;
		}
		this.targetsByPlot = new Map(
			getReinforceTargets(this.unit).map((target) => [target.plotIndex, target])
		);
		return this.targetsByPlot.size > 0;
	}

	reset() {
		this.unit = null;
		this.targetsByPlot.clear();
	}

	decorate(overlay) {
		if (this.targetsByPlot.size === 0) {
			return;
		}
		const GREEN_TRANSPARENT_LINEAR = { x: 0, y: 1, z: 0, w: 0.5 };
		const plotOverlay = overlay.addPlotOverlay();
		plotOverlay?.addPlots([...this.targetsByPlot.keys()], { fillColor: GREEN_TRANSPARENT_LINEAR });
		Audio.playSound('data-audio-plot-select-overlay', 'interact-unit');
	}

	proposePlot(plot, accept, reject) {
		if (this.targetsByPlot.has(GameplayMap.getIndexFromLocation(plot))) {
			accept();
		} else {
			reject();
		}
	}

	commitPlot(plot) {
		const target = this.targetsByPlot.get(GameplayMap.getIndexFromLocation(plot));
		if (target) {
			startReinforce(this.unit, target);
		}
	}
}

// used both by the pick a commander reinforce and send to nearest. Aimed at commanders own tile just for ease
// of navigation, travels as close as it can and then packs when in range.

// A listener  because the only current subscriber is the order queue, and cyclical import pains.
const reinforceStartListeners = [];

export function addReinforceStartListener(callback) {
	reinforceStartListeners.push(callback);
}

export function startReinforce(unit, target) {
	for (const callback of reinforceStartListeners) {
		callback(unit);
	}
	const key = ComponentID.toString(unit.id);
	const order = {
		unitId: unit.id,
		commanderId: target.commander.id,
		plannedTurns: target.turns,
	};
	pendingReinforcements.set(key, order);

	saveCommand(COMMAND_KIND_REINFORCE, key, order);        // Persisted so the order survives a save/reload
	const destination = target.destination ?? target.commander.location;
	if (destination.x === unit.location.x && destination.y === unit.location.y) {
		tryCompleteReinforcements();
		return;
	}
	Game.UnitOperations.sendRequest(unit.id, MOVE_TO_OPERATION, {
		X: destination.x, Y: destination.y,
	});
}

InterfaceMode.addHandler(REINFORCE_MODE, new ReinforceInterfaceMode());

// Forgetting an order clears the live map and the persisted copy, so completed or
// cancelled reinforcement don't come back from the store on the next load.
function dropReinforcement(key) {
	pendingReinforcements.delete(key);
	forgetCommand(COMMAND_KIND_REINFORCE, key);
}

// The player calling off a unit's orders has to call off its reinforcement as well. because of our rerouting,
// this cancelling is not enough, it will then retry it, so gotta kill the reninforcement order.
export function forgetReinforcementFor(unit) {
	const key = ComponentID.toString(unit?.id ?? {});
	if (!pendingReinforcements.has(key)) {
		return false;
	}
	dropReinforcement(key);
	return true;
}

// Packs arrived reinforcements.
function tryCompleteReinforcements() {
	for (const [key, pending] of [...pendingReinforcements]) {
		const unit = Units.get(pending.unitId);
		const commander = Units.get(pending.commanderId);
        // if either unit dies, cancel it.
		if (!unit || !commander?.isCommanderUnit) {
			dropReinforcement(key);
			continue;
		}
		if (ComponentID.isValid(unit.armyId)) {
			dropReinforcement(key);
			continue;
		}
		const commanderPlot = GameplayMap.getIndexFromLocation(commander.location);
		const result = Game.UnitCommands.canStart(unit.id, ADD_TO_ARMY_COMMAND, {}, false);
		if (!result?.Plots?.includes(commanderPlot)) {
			resumeReinforcementTravel(unit, commander);
			continue;
		}
		Game.UnitCommands.sendRequest(unit.id, ADD_TO_ARMY_COMMAND, {
			X: commander.location.x, Y: commander.location.y,
		});
		dropReinforcement(key);
	}
}

// Keeps a journey going. because order can be cut short by enemies, or player units. and commander can move.
function resumeReinforcementTravel(unit, commander) {
	if ((unit.operationQueueSize ?? 0) > 0) {
		return;
	}
	if ((unit.Movement?.movementMovesRemaining ?? 0) <= 0) {
		return;
	}
	const route = resolveReinforcePath(unit, commander);
	// if blocked, try wait a turn and try again.
	if (!route) {
		return;
	}
	const { destination } = route;
	if (destination.x === unit.location.x && destination.y === unit.location.y) {
		return;
	}
	Game.UnitOperations.sendRequest(unit.id, MOVE_TO_OPERATION, {
		X: destination.x, Y: destination.y,
	});
}
// deals with pain of unit being able to get to commander to pack, but commander tile itself occupied.
onCommandsRestored(() => {
	for (const { id, unitId, commanderId, plannedTurns } of getCommands(COMMAND_KIND_REINFORCE)) {
		pendingReinforcements.set(id, { unitId, commanderId, plannedTurns });
	}
	tryCompleteReinforcements();
});

engine.on('UnitMoveComplete', tryCompleteReinforcements);
engine.on('UnitMovementPointsChanged', tryCompleteReinforcements);
engine.on('PlayerTurnActivated', tryCompleteReinforcements);

// Red hex highlight for contributors to focus fire attack TODO, change this colour.
const FOCUS_FIRE_CONTRIBUTOR_BORDER_STYLE = { style: 'MovementRange', primaryColor: HighlightColors.unitAttack };

export function paintFocusFireContributorBorder(overlayGroup, plotIndexes) {
	overlayGroup?.reset();
	if (!overlayGroup || plotIndexes.length === 0) {
		return;
	}
	const overlay = overlayGroup.addBorderOverlay(FOCUS_FIRE_CONTRIBUTOR_BORDER_STYLE);
	plotIndexes.forEach((plotIndex, i) => overlay.setPlotGroups(plotIndex, i));
}

// --- Escort attachment -------------------------------------------------------------------------
// Needs work, but cant seem to veto movement to adjust the commander moves to just the values that the attached unit
// can go. If it does, it just detaches the unit. Why not fix this by just changing the eligible tiles, like before
// the movement command is even issued?

// commanderKey -> { commanderId, unitId }. Mirrored into the store so a pairing survives a reload.
const attachments = new Map();

export function isCommanderAttached(commander) {
	return attachments.has(ComponentID.toString(commander.id));
}

export function getAttachedUnit(commander) {
	const record = attachments.get(ComponentID.toString(commander.id));
	return record ? Units.get(record.unitId) : null;
}

// The other direction: the commander this unit is escorting, if it is escorting one.
//
// Needed because a pairing can be acted on from either end. The player picks a tile with two units
// stacked on it and gets whichever the game decides to select, which is very often the escort rather
// than the commander - so every question the pairing answers has to be answerable from both halves.
export function getCommanderForEscort(unit) {
	if (!unit) {
		return null;
	}
	for (const record of attachments.values()) {
		if (ComponentID.isMatch(record.unitId, unit.id)) {
			return Units.get(record.commanderId);
		}
	}
	return null;
}

export function attachEscort(commander, unit) {
	const key = ComponentID.toString(commander.id);
	const record = { commanderId: commander.id, unitId: unit.id };
	attachments.set(key, record);
	saveCommand(COMMAND_KIND_ATTACH, key, record);
	// Bring it in immediately if it started adjacent rather than stacked, so attaching visibly does
	// something rather than waiting for the commander's next move.
	followCommander(commander, unit);
}

export function detachEscort(commander) {
	const key = ComponentID.toString(commander.id);
	attachments.delete(key);
	forgetCommand(COMMAND_KIND_ATTACH, key);
}

// Orders the escort onto the commander's tile.
// 4 cases, ARRIVED, MOVING, WAITING, BLOCKED. WAITING is for temporary blocks, BLOCKED is for permanent
// Waiting could happen due to like, a ZOC blocking a unit from following? This might not even matter with
// the new crabwalking actually TODO
function followCommander(commander, unit) {
	// Plain coordinate compare - these are {x,y} plots, not ComponentIDs, so isMatch does not apply.
	if (unit.location.x === commander.location.x && unit.location.y === commander.location.y) {
		return 'ARRIVED';
	}
	if ((unit.Movement?.movementMovesRemaining ?? 0) <= 0 || unit.isBusy === true) {
		return 'WAITING';
	}
	const target = { X: commander.location.x, Y: commander.location.y };
	if (!Game.UnitOperations.canStart(unit.id, MOVE_TO_OPERATION, target, false)?.Success) {
		return 'BLOCKED';
	}
	Game.UnitOperations.sendRequest(unit.id, MOVE_TO_OPERATION, target);
	return 'MOVING';
}

// Walks every pairing and closes any gap that has opened.
// TODO still needed given crabwalking?
// Sweeping them all, on any move and at the start of every turn, rather than reacting only to the
// commander's own move. A follow can be cut short - a zone of control, or simply running out of
// movement partway - and reacting solely to the commander left nothing to retry that, so one
// interrupted follow separated the pair permanently.
function syncAttachedEscorts() {
	for (const [key, record] of [...attachments]) {
		const commander = Units.get(record.commanderId);
		const unit = Units.get(record.unitId);
		// Either half of the pair being gone ends the arrangement.
		if (!commander || !unit) {
			attachments.delete(key);
			forgetCommand(COMMAND_KIND_ATTACH, key);
			continue;
		}
		if (followCommander(commander, unit) === 'BLOCKED') {
			console.warn(
				`escort: ${unit.typeName} has no route to its commander at `
				+ `${commander.location.x},${commander.location.y} - detaching.`
			);
			detachEscort(commander);
		}
	}
}

engine.on('UnitMoveComplete', syncAttachedEscorts);
engine.on('PlayerTurnActivated', syncAttachedEscorts);

onCommandsRestored(() => {
	for (const { id, commanderId, unitId } of getCommands(COMMAND_KIND_ATTACH)) {
		attachments.set(id, { commanderId, unitId });
	}
});
