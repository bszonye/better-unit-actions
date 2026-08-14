// queuing up orders with shift click.

import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { COMMAND_KIND_QUEUE, forgetCommand, getCommands, onCommandsRestored, saveCommand } from './action_store.js';
import { addReinforceStartListener, forgetReinforcementFor } from './action_modes.js';
// is shift held done using Input.isShiftDown or DOM key events
// gotta clear it on alt tabbing too, because it doesnt notice when shift lost while focus is lost
let shiftHeldByKeyboard = false;

window.addEventListener('keydown', (event) => {
	if (event.code === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
		shiftHeldByKeyboard = true;
	}
}, true);

window.addEventListener('keyup', (event) => {
	if (event.code === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
		shiftHeldByKeyboard = false;
	}
}, true);

window.addEventListener('blur', () => {
	shiftHeldByKeyboard = false;
}, true);

export function isQueueModifierDown() {
	return Input?.isShiftDown?.() === true || shiftHeldByKeyboard;
}

// kinds of queue steps. MAP is map clicks, like move, attack.
const STEP_MAP = 'MAP';
const STEP_OPERATION = 'OPERATION';
const STEP_COMMAND = 'COMMAND';

// to get treasure convoy unload cargo working we gotta do DISBAND since its just UI dressing for that
export const QUEUEABLE_IN_PLACE_ACTIONS = new Set([
	'UNITOPERATION_SPREAD_RELIGION',
	'UNITCOMMAND_MAKE_TRADE_ROUTE',
	'UNITCOMMAND_DISBAND',
	'UNITOPERATION_FORTIFY',
	'UNITOPERATION_REST_UNTIL_HEALED',
	'UNITOPERATION_SLEEP',
	'UNITOPERATION_ALERT',
	'UNITOPERATION_PILLAGE',
	'UNITOPERATION_FOUND_CITY',
	'UNITOPERATION_EXCAVATE',
	'UNITOPERATION_RESEARCH_ARTIFACTS',
	'UNITCOMMAND_CLAIM_RESOURCE',
	'UNITCOMMAND_CLAIM_MOUNTAIN',
]);

// Whether a unit could EVER perform an action. Needed because how queue actions if not in right context
// and how not show like make trade route on missionary if we do show all. Use capability columns though im not happy
// about it. MakeTradeRoute, SpreadCharges, FoundCity
// trade units we skip as they are uncontrolled
const TRADE_UNIT_TYPES = new Set(['UNIT_TRADE_CARAVAN', 'UNIT_TRADE_SHIP']);

const isLandCombat = (row) => row.FormationClass === 'FORMATION_CLASS_LAND_COMBAT';
const isNaval = (row) => row.FormationClass === 'FORMATION_CLASS_NAVAL';
const isAircraft = (row) => row.FormationClass === 'FORMATION_CLASS_AIR';
const isLandCommander = (row) => row.FormationClass === 'FORMATION_CLASS_COMMAND'
	&& row.Domain === 'DOMAIN_LAND';

// The Treasure Convoy's "Unload Cargo" button is UNITCOMMAND_DISBAND
const TREASURE_UNIT_TAG = 'UNIT_CLASS_NAVAL_TREASURE';
let treasureUnitTypes = null;

function isTreasureUnit(row) {
	if (!treasureUnitTypes) {
		treasureUnitTypes = new Set();
		for (const entry of GameInfo.TypeTags) {
			if (entry.Tag === TREASURE_UNIT_TAG) {
				treasureUnitTypes.add(entry.Type);
			}
		}
	}
	return treasureUnitTypes.has(row.UnitType);
}

const ACTION_CAPABILITY = {
	UNITCOMMAND_MAKE_TRADE_ROUTE: (row) => !!row.MakeTradeRoute,
	UNITOPERATION_SPREAD_RELIGION: (row) => (row.SpreadCharges ?? 0) > 0,
	UNITCOMMAND_DISBAND: isTreasureUnit,
	UNITOPERATION_FOUND_CITY: (row) => !!row.FoundCity,
	UNITOPERATION_EXCAVATE: (row) => !!row.ExtractsArtifacts,
	UNITOPERATION_RESEARCH_ARTIFACTS: (row) => !!row.ExtractsArtifacts,
	// Land soldiers only. Naval units cannot fortify, and neither can aircraft.
	UNITOPERATION_FORTIFY: isLandCombat,
	// Land commanders can pillage too, which is not obvious from any of their data.
	UNITOPERATION_PILLAGE: (row) => isLandCombat(row) || isNaval(row) || isLandCommander(row),
	// Anything that sits on the map can rest or stand watch - except aircraft, which do neither.
	UNITOPERATION_SLEEP: (row) => !isAircraft(row),
	UNITOPERATION_ALERT: (row) => !isAircraft(row),
};

export function canUnitEverDo(unit, type) {
	const row = GameInfo.Units.lookup(unit?.type);
	if (!row || TRADE_UNIT_TYPES.has(row.UnitType)) {
		return false;
	}
	const capability = ACTION_CAPABILITY[type];
	if (!capability) {
		return false;       // not covered
	}
	return capability(row) === true;
}

// Whether this unit may put this action in its queue
export function isQueueableFor(unit, type) {
	if (!QUEUEABLE_IN_PLACE_ACTIONS.has(type)) {
		return false;
	}
	return ACTION_CAPABILITY[type] ? canUnitEverDo(unit, type) : true;
}

const PILLAGE_OPERATION = 'UNITOPERATION_PILLAGE';
const MOVE_TO_OPERATION = 'UNITOPERATION_MOVE_TO';

// unitKey -> { unitId, steps: [step] }. Authoritative during play; the store is only for reloads.
const queues = new Map();

// map-order resolver of vanilla game, so movement into enemy tile turns into attack
let issueMapOrder = null;

export function setMapOrderIssuer(issuer) {
	issueMapOrder = issuer;
}

function keyFor(unit) {
	return ComponentID.toString(unit?.id ?? {});
}

function persist(key, entry) {
	saveCommand(COMMAND_KIND_QUEUE, key, { unitId: entry.unitId, steps: entry.steps });
}

function dropQueue(key) {
	queues.delete(key);
	forgetCommand(COMMAND_KIND_QUEUE, key);
}

export function clearQueue(unit) {
	const key = keyFor(unit);
	if (!queues.has(key)) {
		return false;
	}
	dropQueue(key);
	return true;
}

export function getQueue(unit) {
	return queues.get(keyFor(unit))?.steps ?? [];
}

export function hasQueue(unit) {
	return getQueue(unit).length > 0;
}

// Appends a step and immediately tries to run the queue
function enqueue(unit, step) {
	if (!unit) {
		return;
	}
	// Ensure custom reinforce doesnt clash with queue. newest wins
	forgetReinforcementFor(unit);
	const key = keyFor(unit);
	const entry = queues.get(key) ?? { unitId: unit.id, steps: [] };
	entry.steps.push(step);
	queues.set(key, entry);
	persist(key, entry);
	runQueues();
	refreshQueueVfx();
}

export function enqueueMapOrder(unit, x, y) {
	enqueue(unit, { kind: STEP_MAP, x, y });
}

// escorted commander destination. mostly for dealing with buggy issues, so dont get stuck
export function setPacedDestination(unit, x, y) {
	const key = keyFor(unit);
	const entry = queues.get(key);
	if (entry) {
		entry.steps = entry.steps.filter((step) => !step.paced);
		if (entry.steps.length === 0) {
			dropQueue(key);
		} else {
			persist(key, entry);
		}
	}
	enqueue(unit, { kind: STEP_MAP, x, y, paced: true });
}

export function enqueueAction(unit, type) {
	const kind = GameInfo.UnitOperations.lookup(type) ? STEP_OPERATION : STEP_COMMAND;
	enqueue(unit, { kind, type });
}

// --- Execution ----------------------------------------------------------------------------------

// pillage is weird because of advanced pillage, need to wrangle it to the plot to unit stands on
function resolvePillageTarget(unit) {
	const plots = Game.UnitOperations.canStart(unit.id, PILLAGE_OPERATION, {}, false)?.Plots ?? [];
	if (plots.length !== 1) {
		return null;
	}
	return GameplayMap.getLocationFromIndex(plots[0]);
}

// need to deal with blocking actions when unit has no movement, as canStart goes false. Deals with when a unit reachs
// a destination and then wants to use an action
function isTemporarilyUnable(unit) {
	return (unit.Movement?.movementMovesRemaining ?? 0) <= 0 || unit.isBusy === true;
}

// 'DONE'    - an order was issued; the unit is now busy, so stop here and resume on the next event.
// 'SKIP'    - the step was already satisfied and nothing was issued; carry straight on to the next.
// 'BUSY'    - not possible yet, but nothing says it will not be later. Try again on the next event.
// 'INVALID' - cannot be done. Cancel the queue.
function executeStep(unit, step) {
	if (step.kind === STEP_MAP) {
		return executeMapStep(unit, step);
	}
	const type = step.type;
	if (type === PILLAGE_OPERATION) {
		const target = resolvePillageTarget(unit);
		if (!target) {
			return isTemporarilyUnable(unit) ? 'BUSY' : 'INVALID';
		}
		Game.UnitOperations.sendRequest(unit.id, type, { X: target.x, Y: target.y });
		return 'DONE';
	}
	const api = step.kind === STEP_OPERATION ? Game.UnitOperations : Game.UnitCommands;
	if (!api?.canStart(unit.id, type, {}, false)?.Success) {
		return isTemporarilyUnable(unit) ? 'BUSY' : 'INVALID';
	}
	api.sendRequest(unit.id, type, {});
	return 'DONE';
}

// ensure being cut short by ZOC doesnt mess things up

function executeMapStep(unit, step) {
	if (unit.location.x === step.x && unit.location.y === step.y) {
		return 'SKIP';
	}
	const parameters = { X: step.x, Y: step.y };
	if (isAttackOrder(unit, parameters)) {
		issueMapOrder?.(unit.id, parameters);
		return 'DONE';
	}

	if (isTemporarilyUnable(unit)) {
		return 'BUSY';
	}
	if (!Game.UnitOperations.canStart(unit.id, MOVE_TO_OPERATION, parameters, false)?.Success) {
		return 'INVALID';
	}
	// deals with recursive issues when a order is invalid but it keeps retrying, like a blocked tile by unit
	if ((Units.getPathTo(unit.id, { x: step.x, y: step.y })?.plots?.length ?? 0) === 0) {
		return 'BUSY';
	}
	issueMapOrder?.(unit.id, parameters);
	return 'BUSY';
}

// Mirrors requestMoveOperation's dispatch order
export function isAttackOrder(unit, parameters) {
	const target = { X: parameters.X, Y: parameters.Y, Modifiers: UnitOperationMoveModifiers.NONE };
	return Game.UnitOperations?.canStart(unit.id, 'UNITOPERATION_NAVAL_ATTACK', target, false).Success
		|| Game.UnitOperations?.canStart(unit.id, 'UNITOPERATION_AIR_ATTACK', target, false).Success
		|| Game.Combat.testAttackInto(unit.id, target) !== CombatTypes.NO_COMBAT
		|| Game.UnitCommands?.canStart(unit.id, 'UNITCOMMAND_ARMY_OVERRUN', target, false).Success;
}

// run as much of unit queue as possible right now, and returns if things changed
function advanceQueue(key, unit, entry) {
	let changed = false;
	while (entry.steps.length) {
		const step = entry.steps[0];
		let outcome;
		try {
			outcome = executeStep(unit, step);
		} catch (error) {
			console.error('action_queue: step threw, cancelling queue:', error);
			outcome = 'INVALID';
		}
		if (outcome === 'BUSY') {
			break;
		}
		if (outcome === 'INVALID') {
			console.log(
				`action_queue: ${unit.typeName} cannot carry out ${describeStep(step)}; `
				+ `cancelling ${entry.steps.length} remaining step(s).`
			);
			dropQueue(key);
			return true;
		}
		entry.steps.shift();
		changed = true;
		if (outcome === 'DONE') {
			break;
		}
	}
	if (changed) {
		if (entry.steps.length === 0) {
			dropQueue(key);
		} else {
			persist(key, entry);
		}
	}
	return changed;
}

// Prevents recursive sendRequest loop
let running = false;

export function runQueues() {
	if (running) {
		return;
	}
	running = true;
	let changed = false;
	try {
		for (const [key, entry] of [...queues]) {
			const unit = Units.get(entry.unitId);
			if (!unit || !entry.steps.length) {
				dropQueue(key);
				changed = true;
				continue;
			}
			// Still carrying out an order so multi-turn move so leave alone
			if ((unit.operationQueueSize ?? 0) > 0) {
				continue;
			}
			if (advanceQueue(key, unit, entry)) {
				changed = true;
			}
		}
	} finally {
		running = false;
	}
	if (changed) {
		refreshQueueVfx();
	}
}

function describeStep(step) {
	return step.kind === STEP_MAP ? `move/attack at ${step.x},${step.y}` : step.type;
}

// --- Queue VFX ----------------------------------------------------------------------------------
// Marks plots where queued actions happen with VFX, and lines between them, only when unit selected.
const ACTION_PLOT_VFX = 'VFX_3dUI_Tut_SelectThis_01';
const ORDER_NUMBER_VFX = 'VFX_3dUI_TurnCount_01';
const PATH_PIP_VFX = 'VFX_3dUI_MovePip_01';
const QUEUED_PATH_COLOR = [0.9, 0.8, 0.7];
const APPROXIMATE_PATH_COLOR = [0.55, 0.5, 0.45];       // dimmer for approx paths as cant simulate move path.

// for path pips
const DIRECTION_NUMBERS = {
	[DirectionTypes.DIRECTION_EAST]: 1,
	[DirectionTypes.DIRECTION_SOUTHEAST]: 2,
	[DirectionTypes.DIRECTION_SOUTHWEST]: 3,
	[DirectionTypes.DIRECTION_WEST]: 4,
	[DirectionTypes.DIRECTION_NORTHWEST]: 5,
	[DirectionTypes.DIRECTION_NORTHEAST]: 6,
};

function directionNumber(fromPlot, toPlot) {
	return DIRECTION_NUMBERS[GameplayMap.getDirectionToPlot(fromPlot, toPlot)] ?? 0;
}

let queueVfxGroup = null;
function getQueueVfxGroup() {
	if (!queueVfxGroup) {
		queueVfxGroup = WorldUI.createModelGroup('ModOrderQueueVFX');
	}
	return queueVfxGroup;
}

export function clearQueueVfx() {
	queueVfxGroup?.clear();
}

function resolveStepPlots(unit) {
	let position = { x: unit.location.x, y: unit.location.y };
	return getQueue(unit).map((step) => {
		if (step.kind === STEP_MAP) {
			position = { x: step.x, y: step.y };
		}
		return { ...position };
	});
}

// A hex line from one plot to another, ignoring terrain because cant draw correct paths as no simulate unit in diff plot to other plot
function buildStraightLine(from, to) {
	const plots = [GameplayMap.getIndexFromLocation(from)];
	let current = { x: from.x, y: from.y };
	let guard = GameplayMap.getPlotDistance(from.x, from.y, to.x, to.y) + 2;        // guard so it cant go forever
	while ((current.x !== to.x || current.y !== to.y) && guard-- > 0) {
		let best = null;
		let bestDistance = Infinity;
		for (const direction of Object.keys(DIRECTION_NUMBERS)) {
			const neighbour = GameplayMap.getAdjacentPlotLocation(current, Number(direction));
			if (!neighbour || neighbour.x < 0) {
				continue;
			}
			const distance = GameplayMap.getPlotDistance(neighbour.x, neighbour.y, to.x, to.y);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = neighbour;
			}
		}
		if (!best) {
			break;
		}
		current = { x: best.x, y: best.y };
		plots.push(GameplayMap.getIndexFromLocation(current));
	}
	return plots;
}

function drawPathPips(group, plotIndices, colour) {
	for (let i = 1; i < plotIndices.length - 1; i++) {
		const here = GameplayMap.getLocationFromIndex(plotIndices[i]);
		const start = directionNumber(here, GameplayMap.getLocationFromIndex(plotIndices[i - 1]));
		const end = directionNumber(here, GameplayMap.getLocationFromIndex(plotIndices[i + 1]));
		group.addVFXAtPlot(
			PATH_PIP_VFX,
			plotIndices[i],
			{ x: 0, y: 0, z: 0 },
			{ constants: { start, end, Color3: colour, height: 0 } }
		);
	}
}

export function refreshQueueVfx() {
	const group = getQueueVfxGroup();
	group.clear();
	const unitId = UI.Player.getHeadSelectedUnit();
	const unit = ComponentID.isValid(unitId) ? Units.get(unitId) : null;
	if (!unit || !unit.location || unit.location.x < 0 || !hasQueue(unit)) {
		return;
	}
	try {
		const steps = resolveStepPlots(unit);
		let previous = { x: unit.location.x, y: unit.location.y };
		steps.forEach((plot, index) => {
			const plotIndex = GameplayMap.getIndexFromLocation(plot);
			if (plot.x !== previous.x || plot.y !== previous.y) {
				const realPath = index === 0 ? (Units.getPathTo(unit.id, plot)?.plots ?? []) : [];
				if (realPath.length > 1) {
					drawPathPips(group, realPath, QUEUED_PATH_COLOR);
				} else {
					drawPathPips(group, buildStraightLine(previous, plot), APPROXIMATE_PATH_COLOR);
				}
			}
			group.addVFXAtPlot(ACTION_PLOT_VFX, plot, { x: 0, y: 0, z: 0 }, { placement: PlacementMode.TERRAIN });
			group.addVFXAtPlot(
				ORDER_NUMBER_VFX,
				plotIndex,
				{ x: 0, y: 0, z: 0.1 },
				{ constants: { turn: index + 1, scale: 1 } }
			);
			previous = plot;
		});
	} catch (error) {
		console.error('action_queue: could not draw queue markers:', error);
	}
}

function refreshForSelection() {
	requestAnimationFrame(refreshQueueVfx);
}


addReinforceStartListener((unit) => clearQueue(unit));

onCommandsRestored(() => {
	for (const { id, unitId, steps } of getCommands(COMMAND_KIND_QUEUE)) {
		if (Array.isArray(steps) && steps.length) {
			queues.set(id, { unitId, steps });
		}
	}
	runQueues();
});

// many events because unit can need updates midturn or at start of turn. Unsure about PlayerTurnActivated....
engine.on('UnitMoveComplete', runQueues);
engine.on('UnitMovementPointsChanged', runQueues);
engine.on('PlayerTurnActivated', runQueues);
engine.on('UnitOperationDeactivated', runQueues);
engine.on('UnitSelectionChanged', refreshForSelection);
