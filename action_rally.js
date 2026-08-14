// Settlement rally points, where you can click to set a location from a build queue and units of the rally type
// produced from that settlement will automatically travel there.
// 4 rally types, Land units, Civilian units, Naval units, Aircraft.
// Rally points show on the map when selecting that settlement.
// hover plot and hotkey press for land, and the others are in the rally buttons on unit tab and
// then click plot. Dont like that toggling on and off loses the rally location but eh, v2 problem
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { PlotCursor } from '/core/ui/input/plot-cursor.js';
import { COMMAND_KIND_RALLY, forgetCommand, getCommands, onCommandsRestored, saveCommand } from './action_store.js';
import { enqueueMapOrder } from './action_queue.js';
import { MASS_REBASE_OPERATION, commanderHoldsAircraft, resolveReinforcePath } from './action_model.js';
import { startReinforce } from './action_modes.js';


const RALLY_HOTKEY_CODE = 'KeyR';       // Set or clear land rally
const RALLY_PLOT_VFX = 'VFX_3dUI_Tut_SelectThis_01';
const NATIVE_REINFORCE_OPERATION = 'UNITOPERATION_REINFORCE_ARMY';          // Do normal reinforcement attempt first

export const RALLY_LAND = 'LAND';
export const RALLY_NAVAL = 'NAVAL';
export const RALLY_AIR = 'AIR';
export const RALLY_CIVILIAN = 'CIVILIAN';
export const RALLY_CATEGORIES = [RALLY_LAND, RALLY_NAVAL, RALLY_AIR, RALLY_CIVILIAN];

// TODO better civilian art?
export const RALLY_CATEGORY_ICONS = {
	[RALLY_LAND]: 'SLTH_ORION_COMMANDER_ASSAULT',
	[RALLY_NAVAL]: 'SLTH_ORION_COMMANDER_ENGAGEMENT',
	[RALLY_AIR]: 'SLTH_ORION_COMMANDER_AIRLIFT',
	[RALLY_CIVILIAN]: 'UNIT_SETTLER',
};
// air last so hidden when not modern.
export const RALLY_CATEGORY_DISPLAY_ORDER = [RALLY_LAND, RALLY_CIVILIAN, RALLY_NAVAL, RALLY_AIR];

export const RALLY_CATEGORY_LABELS = {
	[RALLY_LAND]: 'LOC_BETTER_ACTIONS_RALLY_CATEGORY_LAND',
	[RALLY_NAVAL]: 'LOC_BETTER_ACTIONS_RALLY_CATEGORY_NAVAL',
	[RALLY_AIR]: 'LOC_BETTER_ACTIONS_RALLY_CATEGORY_AIR',
	[RALLY_CIVILIAN]: 'LOC_BETTER_ACTIONS_RALLY_CATEGORY_CIVILIAN',
};

const RALLY_COMMANDER_UNIT_ICON_FALLBACK = {
	[RALLY_LAND]: 'UNIT_ARMY_COMMANDER',
	[RALLY_NAVAL]: 'UNIT_FLEET_COMMANDER',
	[RALLY_AIR]: 'UNIT_SQUADRON_COMMANDER',
	[RALLY_CIVILIAN]: 'UNIT_SETTLER',
};

// rally by FormationClass so air units arent considered land. No commanders at the moment at all, so few it dont make
// sense to do so.
export function getRallyCategory(unit) {
	switch (GameInfo.Units.lookup(unit?.type)?.FormationClass) {
		case 'FORMATION_CLASS_LAND_COMBAT': return RALLY_LAND;
		case 'FORMATION_CLASS_NAVAL': return RALLY_NAVAL;
		case 'FORMATION_CLASS_AIR': return RALLY_AIR;
		case 'FORMATION_CLASS_COMMAND': return null;
		default: return RALLY_CIVILIAN;     // settler, scout, missionary, treasure convoy
	}
}

// Find commander on a plot, to join with instead of standing on it.
export function findRallyCommanderAt(plot, category) {
	if (!plot || category === RALLY_CIVILIAN) {
		return null;
	}
	for (const unitId of MapUnits.getUnits(plot.x, plot.y)) {
		const candidate = Units.get(unitId);
		if (!candidate?.isCommanderUnit || candidate.owner !== GameContext.localPlayerID) {
			continue;
		}
		if (category === RALLY_AIR && commanderHoldsAircraft(candidate)) {
			return candidate;
		}
		if (category === RALLY_LAND && candidate.isArmyCommander) {
			return candidate;
		}
		if (category === RALLY_NAVAL && candidate.isFleetCommander) {
			return candidate;
		}
	}
	return null;
}

// Is this plot a legal destination for rally, like naval cant do land, air has to have air commander
export function checkRallyPlot(plot, category) {
	if (!plot) {
		return { ok: false, reason: 'no plot' };
	}
	if (category === RALLY_NAVAL) {
		const navigable = GameplayMap.isWater(plot.x, plot.y) || GameplayMap.isNavigableRiver(plot.x, plot.y);
		return navigable
			? { ok: true }
			: { ok: false, reason: 'LOC_BETTER_ACTIONS_RALLY_NAVAL_FAIL' };
	}
	if (category === RALLY_AIR) {
		return findRallyCommanderAt(plot, RALLY_AIR)
			? { ok: true }
			: { ok: false, reason: 'LOC_BETTER_ACTIONS_RALLY_AIR_FAIL' };
	}
	return { ok: true };
}

// --- State ----------------------------------------------------------------------------------------

// `cityKey|CATEGORY` -> { cityId, category, x, y, commanderId }.
const rallyPoints = new Map();

function keyFor(city, category) {
	return `${ComponentID.toString(city?.id ?? {})}|${category}`;
}

export function getRallyPoint(city, category) {
	const record = rallyPoints.get(keyFor(city, category));
	return record ? { x: record.x, y: record.y, commanderId: record.commanderId ?? null } : null;
}

export function clearRallyPoint(city, category) {
	const key = keyFor(city, category);
	if (!rallyPoints.has(key)) {
		return false;
	}
	rallyPoints.delete(key);
	forgetCommand(COMMAND_KIND_RALLY, key);
	refreshRallyVfx();
	return true;
}

// existing rallies cancelled by clicking plot again. Changed by clicking other plot
export function toggleRallyPoint(city, category, plot) {
	if (!city || !plot || !RALLY_CATEGORIES.includes(category)) {
		return { ok: false, reason: 'nothing to set' };
	}
	const existing = getRallyPoint(city, category);
	if (existing && existing.x === plot.x && existing.y === plot.y) {
		clearRallyPoint(city, category);
		return { ok: true, rally: null };
	}
	const check = checkRallyPlot(plot, category);
	if (!check.ok) {
		return { ok: false, reason: check.reason };
	}
	// A rally set on a commander follows commander. May need to adjust this for air as limited air range
    // or have it see if it can path a series of air commanders
	const commander = findRallyCommanderAt(plot, category);
	const record = {
		cityId: city.id,
		category,
		x: plot.x,
		y: plot.y,
		commanderId: commander ? commander.id : null,
	};
	rallyPoints.set(keyFor(city, category), record);
	saveCommand(COMMAND_KIND_RALLY, keyFor(city, category), record);
	refreshRallyVfx();
	return { ok: true, rally: record };
}

// --- Choosing a plot ------------------------------------------------------------------------------
// The settlement and category the next map click sets,
let armed = null;

export function armRallyPicking(city, category) {
	armed = city && category ? { city, category } : null;
	refreshRallyVfx();
}

export function getArmedCategory() {
	return armed?.category ?? null;
}

// Called from the map-click hook. Returns true when the click was consumed as a rally pick
export function takeArmedRallyPick(location) {
	if (!armed || !location) {
		return false;
	}
	const { city, category } = armed;
	const result = toggleRallyPoint(city, category, { x: location.x, y: location.y });
	if (!result.ok) {
        // dont zero out the payload for click, so can try a new plot that might work
		// console.error(`action_rally: ${result.reason}.`);
		return true;
	}
	armed = null;
	console.log(
		result.rally
			? `action_rally: ${Locale.compose(city.name)} ${Locale.compose(RALLY_CATEGORY_LABELS[category])} rally set to `
				+ `${result.rally.x},${result.rally.y}`
				+ `${result.rally.commanderId ? ' (following that commander)' : ''}.`
			: `action_rally: ${Locale.compose(city.name)} ${Locale.compose(RALLY_CATEGORY_LABELS[category])} rally cleared.`
	);
	refreshRallyVfx();
	return true;
}

// The settlement the player is acting on. had weirdness where it was showing when had a unit selected, so also check that
function getActingCity() {
	if (ComponentID.isValid(UI.Player.getHeadSelectedUnit?.())) {
		return null;
	}
	const cityId = UI.Player.getHeadSelectedCity?.();
	if (!cityId || !ComponentID.isValid(cityId)) {
		return null;
	}
	return Cities.get(cityId);
}

// Hotkey event
function onRallyHotkey(event) {
	if (event.code !== RALLY_HOTKEY_CODE || event.repeat) {
		return;
	}
	const city = getActingCity();
	const plot = PlotCursor?.plotCursorCoords;
	if (!city || !plot) {
		return;
	}
	const result = toggleRallyPoint(city, RALLY_LAND, { x: plot.x, y: plot.y });
	console.warn(
		result.ok
			? (result.rally
				? `action_rally: ${Locale.compose(city.name)} Land rally set to ${result.rally.x},${result.rally.y}.`
				: `action_rally: ${Locale.compose(city.name)} Land rally cleared.`)
			: `action_rally: ${result.reason}.`
	);
}

// --- Sending new units on their way ---------------------------------------------------------------
// because using unit appearing on map, need to ensure its not a unpacked unit or other weirdness. using time limit
// ahh this is so hacky but theres no UnitTrained hook ahhhh
const RECENTLY_UNPACKED_MS = 1000;

const recentlyUnpacked = new Map();

function markRecentlyUnpacked(unitId) {
	if (unitId) {
		recentlyUnpacked.set(ComponentID.toString(unitId), performance.now());
	}
}

function wasRecentlyUnpacked(unit) {
	const key = ComponentID.toString(unit.id);
	const when = recentlyUnpacked.get(key);
	if (when == null) {
		return false;
	}
	if (performance.now() - when > RECENTLY_UNPACKED_MS) {
		recentlyUnpacked.delete(key);
		return false;
	}
	return true;
}

function onUnitAddedToMap(data) {
	try {
		const unit = Units.get(data?.unit);
		if (!unit || unit.owner !== GameContext.localPlayerID || !unit.location || unit.location.x < 0) {
			return;
		}
        // unit production places it on urban district, military building, then city centre, then some approach
        // of other urban districts. Naval units on water districts.
		const districtId = MapCities.getDistrict(unit.location.x, unit.location.y);
		if (!districtId || !ComponentID.isValid(districtId)) {
			return;
		}
		const district = Districts.get(districtId);
		if (!district
			|| (district.type !== DistrictTypes.CITY_CENTER && district.type !== DistrictTypes.URBAN)) {
			return;
		}
		const city = Cities.get(district.cityId);
		if (!city) {
			return;
		}
		const category = getRallyCategory(unit);
		if (!category) {
			return;
		}
		const rally = rallyPoints.get(keyFor(city, category));
		if (!rally) {
			return;
		}
		// Deferred a frame because the order of UnitRemovedFromArmy and UnitAddedToMap is not
		// guaranteed - waiting means the unpack flag is set either way before it is read.
		requestAnimationFrame(() => {
			if (wasRecentlyUnpacked(unit)) {
				return;
			}
			console.warn(
				`action_rally: ${unit.typeName} built at ${Locale.compose(city.name)} `
				+ `(unitState ${data?.unitState}) heading to its ${Locale.compose(RALLY_CATEGORY_LABELS[category])} rally.`
			);
			dispatchToRally(unit, rally);
		});
	} catch (error) {
		// dont break the whole function if one unit fails
		console.error('action_rally: could not dispatch a new unit to its rally point:', error);
	}
}

// Where the unit should actually walk to, given the rally tile may already be occupied.
//
// Stacking is not modelled here, deliberately. The rules are per-category and not exposed as any one
// flag: two land units cannot share a tile, but a commander shares happily with both a land unit and
// a naval one, and whether two civilians can depends on their core AND formation classes. Getting
// that table wrong is easy and the failure is invisible.
//
// The engine already knows all of it, and getPathTo is where it says so: asked for a route to a tile
// the unit cannot end its move on, it returns an EMPTY path. Nothing else gives that away - canStart
// answers Success for the very same move, and the movement-range overlay paints the tile as
// reachable. Verified against each case: land onto land 0 plots, land onto a commander 4, missionary
// onto missionary 17.
//
// When the target is blocked, the approach is chosen the same way resolveReinforcePath picks a tile
// beside a commander - the best of the target's neighbours - because a blocked destination yields no
// path to walk back along.
export function findRallyApproach(unit, x, y) {
	const target = { x, y };
	if ((Units.getPathTo(unit.id, target)?.plots?.length ?? 0) > 0) {
		return target;
	}
	let best = null;
	for (let direction = 0; direction < 6; direction++) {
		const neighbour = GameplayMap.getAdjacentPlotLocation(target, direction);
		if (!neighbour || neighbour.x < 0) {
			continue;
		}
		const path = Units.getPathTo(unit.id, neighbour);
		const plots = path?.plots ?? [];
		if (plots.length === 0) {
			continue;
		}
		const turns = path.turns?.[path.turns.length - 1] ?? Number.MAX_SAFE_INTEGER;
		if (!best || turns < best.turns || (turns === best.turns && plots.length < best.steps)) {
			best = { turns, steps: plots.length, tile: neighbour };
		}
	}
	return best?.tile ?? null;
}

function dispatchToRally(unit, rally) {
	const commander = rally.commanderId ? Units.get(rally.commanderId) : null;
	if (commander && commander.location && commander.location.x >= 0) {
		if (joinCommander(unit, commander, rally.category)) {
			return;
		}
		// The commander is alive but cannot be joined, walk to its location
		enqueueMapOrder(unit, commander.location.x, commander.location.y);
		return;
	}
	if (rally.category === RALLY_AIR) {
		// if cant reach commander and its air, cancel whole order.
		console.warn('action_rally: air rally target is gone; leaving the new aircraft where it is.');
		return;
	}
	if (unit.location.x === rally.x && unit.location.y === rally.y) {
		return;
	}
	const destination = findRallyApproach(unit, rally.x, rally.y);
	if (!destination) {
		console.warn(
			`action_rally: ${unit.typeName} cannot reach its rally at ${rally.x},${rally.y} `
			+ 'or any tile beside it; leaving it where it was built.'
		);
		return;
	}
	if (destination.x === unit.location.x && destination.y === unit.location.y) {
		return;
	}
	enqueueMapOrder(unit, destination.x, destination.y);
}

// Reinforce, then try walk method
function joinCommander(unit, commander, category) {
	const args = { X: commander.location.x, Y: commander.location.y };
	if (category === RALLY_AIR) {
		if (Game.UnitOperations.canStart(unit.id, MASS_REBASE_OPERATION, args, false)?.Success) {
			Game.UnitOperations.sendRequest(unit.id, MASS_REBASE_OPERATION, args);
			return true;
		}
		return false;
	}
	if (Game.UnitOperations.canStart(unit.id, NATIVE_REINFORCE_OPERATION, args, false)?.Success) {
		Game.UnitOperations.sendRequest(unit.id, NATIVE_REINFORCE_OPERATION, args);
		return true;
	}
	const route = resolveReinforcePath(unit, commander);
	if (route) {
		startReinforce(unit, { commander, turns: route.turns, destination: route.destination });
		return true;
	}
	return false;
}

// --- VFX ------------------------------------------------------------------------------------------
let rallyVfxGroup = null;

function getRallyVfxGroup() {
	if (!rallyVfxGroup) {
		rallyVfxGroup = WorldUI.createModelGroup('ModRallyPointVFX');
	}
	return rallyVfxGroup;
}

let commanderOverlayGroup = null;
let commanderPlotOverlay = null;

function getCommanderPlotOverlay() {
	if (!commanderPlotOverlay) {
		commanderOverlayGroup = WorldUI.createOverlayGroup('ModRallyCommanderOverlay', 1);
		commanderPlotOverlay = commanderOverlayGroup.addPlotOverlay();
	}
	return commanderPlotOverlay;
}


const COMMANDER_SPRITE_OFFSET = { x: 0, y: 0, z: 5 };
const COMMANDER_SPRITE_SCALE = 1.4;

// The marker sitting on each of a settlement's rally plots. Its own grid rather than sharing the
// commander one, so the two can be positioned and sized independently - they mean different things
// and sit on the map at the same time.
const RALLY_SPRITE_OFFSET = { x: 0, y: 0, z: 5 };
const RALLY_SPRITE_SCALE = 1.4;

let commanderSpriteGrid = null;
let rallySpriteGrid = null;

function getCommanderSpriteGrid() {
	if (!commanderSpriteGrid) {
		commanderSpriteGrid = WorldUI.createSpriteGrid('ModRallyCommanderSprites', SpriteMode.Billboard);
	}
	return commanderSpriteGrid;
}

function getRallySpriteGrid() {
	if (!rallySpriteGrid) {
		rallySpriteGrid = WorldUI.createSpriteGrid('ModRallyPointSprites', SpriteMode.Billboard);
	}
	return rallySpriteGrid;
}

// A unit type resolved to a built-in sprite asset, or null if it has none.
//
// Sprite grids take BLP names only - hand them a URL and they draw nothing, silently - so the name is
// checked against the icon URL to confirm it really is a built-in asset.
export function spriteAssetForType(type) {
	if (!type) {
		return null;
	}
	const blp = UI.getIconBLP(type);
	if (!blp) {
		return null;
	}
	const url = UI.getIconURL(type);
	return url === `blp:${blp}` || url === `fs://game/${blp}` ? blp : null;
}

// A modded commander may have no sprite of its own, so the category's vanilla commander stands in.
//
// Both halves were broken before and neither could ever have run: the fallback table is an object
// literal, so calling .get() on it threw, and the verification compared the fallback's BLP against
// the ORIGINAL type's icon URL, which cannot match by definition. Each type is now resolved and
// verified on its own.
function commanderSpriteAsset(unit, rallyType) {
	return spriteAssetForType(unit?.typeName)
		?? spriteAssetForType(RALLY_COMMANDER_UNIT_ICON_FALLBACK[rallyType]);
}

// Mark rally points, and commander plots
export function refreshRallyVfx() {
	const group = getRallyVfxGroup();
	const overlay = getCommanderPlotOverlay();
	const sprites = getCommanderSpriteGrid();
	const rallySprites = getRallySpriteGrid();
	group.clear();
	overlay.clear();
	sprites.clear();
	rallySprites.clear();
	const cityId = UI.Player.getHeadSelectedCity?.();
	if (!cityId || !ComponentID.isValid(cityId)) {
		return;
	}
	const cityKey = ComponentID.toString(cityId);
	const marks = [];
	for (const category of RALLY_CATEGORIES) {
		const record = rallyPoints.get(`${cityKey}|${category}`);
		if (!record) {
			continue;
		}
		const commander = record.commanderId ? Units.get(record.commanderId) : null;
		// The category travels with the plot so each mark can be told apart on the map - four rally
		// points otherwise draw four identical highlights with nothing to say which is which.
		marks.push(commander?.location?.x >= 0
			? { x: commander.location.x, y: commander.location.y, category }
			: { x: record.x, y: record.y, category });
	}
	try {
		for (const plot of marks) {
			group.addVFXAtPlot(RALLY_PLOT_VFX, plot, { x: 0, y: 0, z: 0 }, { placement: PlacementMode.TERRAIN });
			// Same table the commander sprites fall back to, so a category looks the same wherever it
			// is drawn: a commander for the three military categories, a settler for civilians.
			const asset = spriteAssetForType(RALLY_COMMANDER_UNIT_ICON_FALLBACK[plot.category]);
			if (asset) {
				rallySprites.addSprite(
					{ x: plot.x, y: plot.y }, asset, RALLY_SPRITE_OFFSET, { scale: RALLY_SPRITE_SCALE }
				);
			}
		}
		const armedCategory = getArmedCategory();
		if (armedCategory && armedCategory !== RALLY_CIVILIAN) {
			const found = findJoinableCommanderPlots(armedCategory);
			if (found.length) {
				for (const { x, y, commander } of found) {
					const asset = commanderSpriteAsset(commander, armedCategory);
					if (asset) {
						sprites.addSprite({ x, y }, asset, COMMANDER_SPRITE_OFFSET, { scale: COMMANDER_SPRITE_SCALE });
					}
				}
			}
		}
	} catch (error) {
		console.error('action_rally: could not draw the rally markers:', error);
	}
}

function findJoinableCommanderPlots(category) {
	const player = Players.get(GameContext.localPlayerID);
	if (!player?.Units) {
		return [];
	}
	const plots = [];
	for (const unitId of player.Units.getUnitIds()) {
		const commander = Units.get(unitId);
		if (!commander?.isCommanderUnit || !commander.location || commander.location.x < 0) {
			continue;
		}
		const matches = (category === RALLY_LAND && commander.isArmyCommander)
			|| (category === RALLY_NAVAL && commander.isFleetCommander)
			|| (category === RALLY_AIR && commanderHoldsAircraft(commander));
		if (matches) {
			// The commander travels with the plot so the caller can draw its flag, not just fill the tile.
			plots.push({ x: commander.location.x, y: commander.location.y, commander });
		}
	}
	return plots;
}

function refreshForSelection() {
	// Deferred a frame so it lands after the rest of the selection handling has settled.
	requestAnimationFrame(refreshRallyVfx);
}

// --- Wiring ---------------------------------------------------------------------------------------


onCommandsRestored(() => {
	for (const record of getCommands(COMMAND_KIND_RALLY)) {
		if (typeof record.x === 'number' && typeof record.y === 'number' && record.category) {
			rallyPoints.set(record.id, record);
			continue;
		}
		forgetCommand(COMMAND_KIND_RALLY, record.id);       // fallback for if we change the mod and rally kinds mid someones playthrough
	}
	refreshRallyVfx();
});

engine.on('UnitAddedToMap', onUnitAddedToMap);

engine.on('UnitRemovedFromArmy', (data) => {
	markRecentlyUnpacked(data?.initiatingUnit);
	markRecentlyUnpacked(data?.secondaryUnit);
});
engine.on('CitySelectionChanged', refreshForSelection);
engine.on('UnitSelectionChanged', refreshForSelection);

// Deselecting settlement stops the rally pick interface
engine.on('CitySelectionChanged', () => {
	if (!getActingCity()) {
		armRallyPicking(null, null);
	}
});

window.addEventListener('keydown', onRallyHotkey, true);
