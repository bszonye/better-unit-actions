// Conditional alerts: sleep a unit until something specific happens
// turn based one
// and religion alert, if the religion changes in a settle it wakes
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { COMMAND_KIND_ALERT, forgetCommand, getCommands, onCommandsRestored, saveCommand } from './action_store.js';

export const ALERT_KIND_TURNS = 'TURNS';
export const ALERT_KIND_RELIGION = 'RELIGION';

const SLEEP_OPERATION = 'UNITOPERATION_SLEEP';
const WAKE_COMMAND = 'UNITCOMMAND_WAKE';

// Turn counter start and max value
export const MIN_ALERT_TURNS = 1;
export const MAX_ALERT_TURNS = 99;

// unitKey -> { unitId, kind, turns?, religion?, cityId? }. Authoritative during play; the store only
// carries it across a reload.
const alerts = new Map();

function keyFor(unit) {
	return ComponentID.toString(unit?.id ?? {});
}

function persist(key, entry) {
	saveCommand(COMMAND_KIND_ALERT, key, entry);
}

function drop(key) {
	alerts.delete(key);
	forgetCommand(COMMAND_KIND_ALERT, key);
}

export function getAlert(unit) {
	return alerts.get(keyFor(unit)) ?? null;
}

export function isUnitAlerted(unit) {
	return alerts.has(keyFor(unit));
}

// --- Religion -------------------------------------------------------------------------------------

export function getPlayerReligion(playerId = GameContext.localPlayerID) {
	return Players.get(playerId)?.Religion?.getReligionType?.() ?? -1;
}

export function getSettlementAt(location) {
	if (!location || location.x < 0) {
		return null;
	}
	const cityId = GameplayMap.getOwningCityFromXY(location.x, location.y);
	return cityId && ComponentID.isValid(cityId) ? Cities.get(cityId) : null;
}

// -1 is when the religion is split urban /rural
export function settlementFollowsPlayerReligion(city, playerId = GameContext.localPlayerID) {
	const religion = city?.Religion?.majorityReligion ?? -1;
	return religion !== -1 && religion === getPlayerReligion(playerId);
}

// Only wanna show the religion alert if the settlement already follows player religion
export function canWatchReligion(unit) {
	if (!unit || (unit.Religion?.spreadCharges ?? 0) <= 0) {
		return false;
	}
	return settlementFollowsPlayerReligion(getSettlementAt(unit.location));
}

// --- Starting and stopping ------------------------------------------------------------------------
function putToSleep(unit) {
	if (isAsleep(unit)) {
		return true;
	}
	if (!Game.UnitOperations.canStart(unit.id, SLEEP_OPERATION, {}, false)?.Success) {
		return false;
	}
	Game.UnitOperations.sendRequest(unit.id, SLEEP_OPERATION, {});
	return true;
}

const SLEEP_ACTIVITY = Database.makeHash('ACTIVITY_SLEEP');

function isAsleep(unit) {
	return unit?.activityType === SLEEP_ACTIVITY;
}

function wakeUp(unit) {
	const can = Game.UnitCommands.canStart(unit.id, WAKE_COMMAND, {}, false)?.Success === true;
	const key = keyFor(unit);
	if (!can) {
		return false;
	}
	Game.UnitCommands.sendRequest(unit.id, WAKE_COMMAND, {});
	return true;
}

export function getAlertTurnsRemaining(unit) {
	const entry = alerts.get(keyFor(unit));
	if (entry?.kind !== ALERT_KIND_TURNS || !Number.isFinite(entry.wakeOnTurn)) {
		return null;
	}
	return Math.max(0, entry.wakeOnTurn - Game.turn);
}

// Left-click on the turn alert. Multiple clicks increase counter
export function addAlertTurn(unit, delta = 1) {
	const key = keyFor(unit);
	const entry = alerts.get(key);
	if (!entry || entry.kind !== ALERT_KIND_TURNS) {
		alerts.set(key, {
			unitId: unit.id,
			kind: ALERT_KIND_TURNS,
			wakeOnTurn: Game.turn + MIN_ALERT_TURNS,
		});
		persist(key, alerts.get(key));
		putToSleep(unit);
		return MIN_ALERT_TURNS;
	}
	const turns = (entry.wakeOnTurn - Game.turn) + delta;
	if (turns < MIN_ALERT_TURNS) {
		cancelAlert(unit, { wake: true });
		return 0;
	}
	entry.wakeOnTurn = Game.turn + Math.min(turns, MAX_ALERT_TURNS);
	persist(key, entry);
	return entry.wakeOnTurn - Game.turn;
}

export function startReligionWatch(unit) {
	const city = getSettlementAt(unit.location);
	if (!settlementFollowsPlayerReligion(city)) {
		return false;
	}
	const key = keyFor(unit);
	alerts.set(key, {
		unitId: unit.id,
		kind: ALERT_KIND_RELIGION,
		cityId: city.id,
		religion: getPlayerReligion(),
	});
	persist(key, alerts.get(key));
	putToSleep(unit);
	return true;
}


export function cancelAlert(unit, { wake = false } = {}) {
	const key = keyFor(unit);
	if (!alerts.has(key)) {
		return false;
	}
	drop(key);
	if (wake) {
		wakeUp(unit);
	}
	return true;
}

export function evaluateAlerts() {
    console.error(`evalling alerts. ${alerts}`)
	for (const [key, entry] of [...alerts]) {
		const unit = Units.get(entry.unitId);
		if (!unit) {
			drop(key);
			continue;
		}
		if (entry.wakePending) {
			if (!isAsleep(unit)) {
				drop(key);
			} else {
				wakeUp(unit);
			}
			continue;
		}
        // TODO remove this?
		if (!isAsleep(unit)) {
			putToSleep(unit);
		}
		if (entry.kind === ALERT_KIND_TURNS) {
			// tidies up wakeOnTurn if the number somehow got lost
			if (!Number.isFinite(entry.wakeOnTurn) || Game.turn >= entry.wakeOnTurn) {
				drop(key);
				wakeUp(unit);
			}
			continue;
		}
		if (entry.kind === ALERT_KIND_RELIGION) {
			// hmmm, we do need to cover if the settlement is gone by raze. it being stuck forever is kinda fine
            // as player can stop it.
			if (!Cities.get(entry.cityId)) {
				beginWake(key, entry, unit);
			}
		}
	}
}

// Set it so on the players turn start it wakes this unit.
function beginWake(key, entry, unit) {
    console.error(`was wake pending ${entry.wakePending}`, )
	if (entry.wakePending) {
		return;
	}
	entry.wakePending = true;
	persist(key, entry);
	if (Players.get(GameContext.localPlayerID)?.isTurnActive && wakeUp(unit) && !isAsleep(unit)) {
		drop(key);
	}
}

function sameCity(a, b) {return !!a && !!b && a.owner === b.owner && a.id === b.id;}

function onReligionEvent(eventName, data) {
	const cityId = data?.cityID ?? data?.cityId;
	const newReligion = data?.newReligion;
	const religionWatches = [...alerts].filter(([, entry]) => entry.kind === ALERT_KIND_RELIGION);
	if (!cityId) {
		return;
	}
	for (const [key, entry] of religionWatches) {
		const unit = Units.get(entry.unitId);
		const standingIn = unit ? getSettlementAt(unit.location) : null;
		const matched = sameCity(entry.cityId, cityId) || sameCity(standingIn?.id, cityId);
		if (!matched) {
			continue;
		}
		if (newReligion !== undefined && newReligion === entry.religion) {
			continue;
		}
		if (!unit) {
			drop(key);
			continue;
		}
        console.error('all passed, begin wake')
		beginWake(key, entry, unit);
	}
}
engine.on('CityReligionChanged', (data) => onReligionEvent('CityReligionChanged', data));       // flag that we mi
engine.on('LocalPlayerTurnBegin', evaluateAlerts);

engine.on('UnitRemovedFromMap', () => {
	for (const [key, entry] of [...alerts]) {
		if (!Units.get(entry.unitId)) {
			drop(key);
		}
	}
});

onCommandsRestored(() => {
	for (const record of getCommands(COMMAND_KIND_ALERT)) {
		const { id, unitId, kind, turns, wakeOnTurn, religion, cityId } = record;
		if (!unitId || (kind !== ALERT_KIND_TURNS && kind !== ALERT_KIND_RELIGION)) {
			continue;
		}
		// `turns` is the earlier countdown field. Records written before the switch to a due-turn are
		// carried over rather than discarded, so a unit already asleep when the change landed still
		// wakes instead of being stranded.
		const due = Number.isFinite(wakeOnTurn)
			? wakeOnTurn
			: (Number.isFinite(turns) ? Game.turn + turns : undefined);
		alerts.set(id, { unitId, kind, wakeOnTurn: due, religion, cityId, wakePending: record.wakePending });
	}
});
