// View layer: army-panel decorators, injected styles, the hover-preview controllers that bridge the
// interface modes to the preview panel, and event wiring.

import { InterfaceMode, InterfaceModeChangedEventName } from '/core/ui/interface-modes/interface-modes.js';
import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { Icon } from '/core/ui/utilities/utilities-image.js';
import { Audio } from '/core/ui/audio-base/audio-support.js';
import { InputEngineEventName } from '/core/ui/input/input-support.js';
import CommanderInteract from '/base-standard/ui/commander-interact/model-commander-interact.js';
import { UnitActionCategory } from '/base-standard/ui/unit-actions/unit-actions.js';
import { PlotCursor, PlotCursorUpdatedEventName } from '/core/ui/input/plot-cursor.js';
// Default export, and isOnUI is a getter on it - referencing a bare `Cursor` throws, which inside an
// input handler takes the whole gesture down with it.
import Cursor from '/core/ui/input/cursor.js';
import WorldInput from '/base-standard/ui/world-input/world-input.js';
// The class is not exported, only this singleton, so the movement-range overlay is reached through
// the instance and patched on its prototype.
import { UnitMapDecorationSupport } from '/base-standard/ui/interface-modes/support-unit-map-decoration.js';
import { ADD_TO_ARMY_COMMAND, AIR_ATTACK_OPERATION, AIR_DROP_ABILITY, BOMBER_CLASS, FOCUS_FIRE_CLASSES, FOCUS_FIRE_NAVAL_CLASSES, GROUND_ATTACKER_CLASS, MASS_REBASE_OPERATION, MELEE_ATTACK_COMMAND, NAVAL_ATTACK_OPERATION, RANGED_CLASS, RANGE_ATTACK_OPERATION, SIEGE_CLASS, REINFORCE_CALL_RADIUS, canCommanderAttach, canUnitReinforce, findCautiousMoveDestination, getAttachCandidate, getSharedEscortMovement, findEscortPacedDestination, commanderHoldsAircraft, getBestReinforceTarget, getCommanderFreeCapacity, getReinforceCallCandidates, getFocusedAttackBonus, getReinforceDomainInfo, getReinforceTargets, findArmyCommander, getAircraftPullCandidates, getClassEligibleAttackers, getLandPackCandidates, getPackedUnitsWithMovement, getUnitAbilities, getFocusFireClasses, getFocusFireOperation, getRadiusEligiblePlayerUnits, getRebaseEligibleArmyUnits, getUnitRank, plotHasWorthwhileTarget, sortJoinCandidates } from './action_model.js';
import { buildFocusFireSteps, planMeleeFocusFire, simulateStrikeSequence } from './action_combat.js';
import { hideStrikePreview, showMultiAttackPreview } from './action_preview.js';
import { QUEUEABLE_IN_PLACE_ACTIONS, canUnitEverDo, clearQueue, enqueueAction, enqueueMapOrder, hasQueue, isAttackOrder, isQueueModifierDown, isQueueableFor, setMapOrderIssuer, setPacedDestination } from './action_queue.js';
import {
    RALLY_CATEGORIES,
    RALLY_CATEGORY_DISPLAY_ORDER,
    RALLY_CATEGORY_ICONS,
    RALLY_CATEGORY_LABELS,
    RALLY_LAND,
    armRallyPicking,
    clearRallyPoint,
    getArmedCategory,
    getRallyPoint,
    takeArmedRallyPick,
    toggleRallyPoint,
    RALLY_AIR
} from './action_rally.js';
import { FLAG_EMBLEM_COLOUR_MODES, PROMOTION_GLYPH_ICON, getFlagColourMode, getFlagEmblemFilter, getFlagIcon, getFlagIconOptions, isFlagIconCustomisable, setFlagColourMode, setFlagIcon } from './action_flag_icon.js';
import { drawPromotionGlyph } from './action_promotion_glyph.js';
import { CARPET_BOMB_MODE, FOCUS_FIRE_LAND_MODE, REINFORCE_MODE, FOCUS_FIRE_SEA_MODE, FOCUS_FIRE_VARIANTS, GROUND_ATTACK_MODE, MASS_REBASE_MODE, MELEE_FOCUS_FIRE_MODE, attachEscort, detachEscort, forgetReinforcementFor, getAttachedUnit, getCommanderForEscort, paintFocusFireContributorBorder, startReinforce } from './action_modes.js';
import {
    MOVEMENT_BADGE_STYLE,
    RANK_CHEVRON_STYLE,
    RALLY_BUTTON_STYLE,
    FLAG_ICON_STYLE_OPTION,
    FLAG_ICON_STYLE_COLOUR
} from './action_css.js';
import { ALERT_KIND_RELIGION, ALERT_KIND_TURNS, addAlertTurn, canWatchReligion, cancelAlert, getAlert, getAlertTurnsRemaining, isUnitAlerted, startReligionWatch } from './action_alert.js';

import { ComponentUtilities } from '/core/ui-next/utilities/component-utilities.js';
ComponentUtilities.preloadImages(
    "blp:action_carpetbomb.png",
    "blp:action_closeairsupport.png",
    "blp:game/Action_Defend",
    "fs://game/Action_Attack.png",
    "fs://game/Action_Construct.png",
    "fs://game/Action_Defend.png",
    "fs://game/Action_Ranged.png",
    "fs://game/action_bombard.png",
    "fs://game/action_rangedattack.png",
    "fs://game/action_treasure_fleet.png",
    "fs://game/unit_chevron-01.png",
    "fs://game/unit_chevron-02.png",
    "fs://game/unit_chevron-03.png",
    "fs://game/action-panel-mod/icons/Actions/action_Coordinated Attack_256.dds",
    "fs://game/action-panel-mod/icons/Actions/action_Focus Fire_256.dds",
    "fs://game/action-panel-mod/icons/Actions/action_Fortify_256.dds",
    "fs://game/action-panel-mod/icons/Actions/action_Pillage_256.dds",
    "fs://game/action-panel-mod/icons/Actions/action_Sleep_256.dds",
    "fs://game/action-panel-mod/icons/Actions/action_Timed_Sleep_256.dds",
    "fs://game/action-panel-mod/icons/Generic/generic_Cavalry_256.dds",
    "fs://game/action-panel-mod/icons/Generic/generic_Hex_256.dds",
    "fs://game/action-panel-mod/icons/Generic/generic_Plus_256.dds",
    "fs://game/action-panel-mod/icons/Generic/generic_Star_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Airlift_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Assault_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Bastion_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Bombardment_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Dogfighting_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Engagement_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Leadership_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Logistics_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Maneuver_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Raids_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/promo_Trung Nhi_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/stat_Health_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/stat_Melee_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/stat_Movement_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/stat_Ranged_256.dds",
    "fs://game/action-panel-mod/icons/Promotions/stat_Sight_256.dds",
    "fs://game/action-panel-mod/icons/custom_reinforce.dds",
);

const MOVEMENT_BADGE_CLASS = 'ap-mod-movement-badge';
const MOVEMENT_BADGE_STYLE_ID = 'ap-mod-movement-badge-style';

function injectMovementBadgeStyle() {
	if (document.getElementById(MOVEMENT_BADGE_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = MOVEMENT_BADGE_STYLE_ID;
	style.textContent = `
		.${MOVEMENT_BADGE_CLASS} ${MOVEMENT_BADGE_STYLE}
		.${MOVEMENT_BADGE_CLASS}.ap-mod-no-movement {
			color: #ff7a7a;
		}
	`;
	document.head.appendChild(style);
}

const ARMY_ACTION_INACTIVE_STYLE_ID = 'ap-mod-army-action-inactive-style';

// Define visual style for inactive army buttons on top
function injectArmyActionInactiveStyle() {
	if (document.getElementById(ARMY_ACTION_INACTIVE_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = ARMY_ACTION_INACTIVE_STYLE_ID;
	style.textContent = `
		.army-panel__action-button.inactive {
			opacity: 0.7;
		}
	`;
	document.head.appendChild(style);
}

class ArmyPanelMovementDecorator {
	constructor(component) {
		this.component = component;
		this.onMovementChanged = this.onMovementChanged.bind(this);

		const originalCreateArmyUnitButton = component.createArmyUnitButton.bind(component);
		component.createArmyUnitButton = (unitId) => {
			const button = originalCreateArmyUnitButton(unitId);
			this.addMovementBadge(button);
			return button;
		};

		const originalSetUnitButtonData = component.setUnitButtonData.bind(component);
		component.setUnitButtonData = (button, unit) => {
			originalSetUnitButtonData(button, unit);
			this.updateMovementBadge(button, unit);
		};
	}

	addMovementBadge(button) {
		const portraitContainer = button.querySelector('.army-panel__unit-portrait-container');
		if (!portraitContainer || portraitContainer.querySelector(`.${MOVEMENT_BADGE_CLASS}`)) {
			return;
		}
		const badge = document.createElement('div');
		badge.classList.add(MOVEMENT_BADGE_CLASS);
		portraitContainer.appendChild(badge);
	}

	updateMovementBadge(button, unit) {
		const badge = button.querySelector(`.${MOVEMENT_BADGE_CLASS}`);
		if (!badge) {
			return;
		}
		if (!unit || !unit.Movement || unit.isAerodromeCommander) {
			badge.style.display = 'none';
			return;
		}
		const movesRemaining = Math.round(unit.Movement.movementMovesRemaining ?? 0);
		const maxMoves = Math.round(unit.Movement.maxMoves ?? 0);
		badge.textContent = `${movesRemaining}/${maxMoves}`;
		badge.classList.toggle('ap-mod-no-movement', movesRemaining <= 0);
		badge.style.display = 'flex';
	}

	onMovementChanged(data) {
		if (data?.unit?.owner === GameContext.localPlayerID) {
			this.component.updateGate.call('ap-mod-movement-update');
		}
	}

	beforeAttach() { }

	afterAttach() {
		engine.on('UnitMovementPointsChanged', this.onMovementChanged);
	}

	beforeDetach() {
		engine.off('UnitMovementPointsChanged', this.onMovementChanged);
	}

	afterDetach() { }

	onAttributeChanged(_name, _prev, _next) { }
}

injectMovementBadgeStyle();
injectArmyActionInactiveStyle();

Controls.decorate('army-panel', (component) => new ArmyPanelMovementDecorator(component));

// Rank chevron for unique units of different tiers so can be distinguished while packing, UNIT_MARINE UNIT_MARINE_2
const RANK_CHEVRON_CLASS = 'ap-mod-rank-chevron';
const RANK_CHEVRON_STYLE_ID = 'ap-mod-rank-chevron-style';

function injectRankChevronStyle() {
	if (document.getElementById(RANK_CHEVRON_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = RANK_CHEVRON_STYLE_ID;
	style.textContent = `
		.${RANK_CHEVRON_CLASS} ${RANK_CHEVRON_STYLE}
	`;
	document.head.appendChild(style);
}

class ArmyPanelRankBadgeDecorator {
	constructor(component) {
		this.component = component;

		const originalCreateArmyUnitButton = component.createArmyUnitButton.bind(component);
		component.createArmyUnitButton = (unitId) => {
			const button = originalCreateArmyUnitButton(unitId);
			this.addRankBadge(button);
			return button;
		};

		const originalSetUnitButtonData = component.setUnitButtonData.bind(component);
		component.setUnitButtonData = (button, unit) => {
			originalSetUnitButtonData(button, unit);
			this.updateRankBadge(button, unit);
		};
	}

	addRankBadge(button) {
		const portraitContainer = button.querySelector('.army-panel__unit-portrait-container');
		if (!portraitContainer || portraitContainer.querySelector(`.${RANK_CHEVRON_CLASS}`)) {
			return;
		}
		const badge = document.createElement('div');
		badge.classList.add(RANK_CHEVRON_CLASS);
		portraitContainer.appendChild(badge);
	}

	updateRankBadge(button, unit) {
		const badge = button.querySelector(`.${RANK_CHEVRON_CLASS}`);
		if (!badge) {
			return;
		}
		const rank = getUnitRank(unit);
		if (!rank) {
			badge.style.display = 'none';
			return;
		}
		// Same asset convention the base game's own unit-flags map indicator uses for unit tier.
		badge.style.backgroundImage = `url('fs://game/unit_chevron-0${rank}.png')`;
		badge.style.display = 'block';
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

injectRankChevronStyle();

Controls.decorate('army-panel', (component) => new ArmyPanelRankBadgeDecorator(component));

// After a packed unit finishes an air strike or rebase, jump to the next packed unit that
// still has movement (preferring the same unit type) instead of dropping selection entirely ---

const TRACKED_ACTION_MODES = new Set(['INTERFACEMODE_AIR_ATTACK', 'INTERFACEMODE_REBASE']);
const DEFAULT_MODE = 'INTERFACEMODE_DEFAULT';
let pendingActionUnitId = null;

function syncCommanderInteractToArmy(commanderUnit) {
	// CommanderInteract.setArmyCommander() from vanilla has an update() that would mess with selecting next unit
	if (!commanderUnit) {
		return;
	}
	CommanderInteract.updateArmyData();
	const index = CommanderInteract.armyCommanders.findIndex(
		(c) => ComponentID.isMatch(c.commander.id, commanderUnit.id)
	);
	if (index >= 0) {
		CommanderInteract._index = index;
		CommanderInteract._currentArmyCommander = CommanderInteract.armyCommanders[index];
	}
}

window.addEventListener(InterfaceModeChangedEventName, (event) => {
	const { prevMode, newMode } = event.detail;
	if (TRACKED_ACTION_MODES.has(newMode)) {
		// Capture which unit is performing the action while its context is still current.
		pendingActionUnitId = InterfaceMode.getParameters()?.UnitID ?? null;
		return;
	}
	if (!TRACKED_ACTION_MODES.has(prevMode) || newMode !== DEFAULT_MODE || !pendingActionUnitId) {
		return;
	}
	const actingUnitId = pendingActionUnitId;
	pendingActionUnitId = null;

	const actingUnit = Units.get(actingUnitId);
	if (!actingUnit || !ComponentID.isValid(actingUnit.armyId)) {
		return;
	}
	const army = Armies.get(actingUnit.armyId);
	if (!army) {
		return;
	}
	const candidates = getPackedUnitsWithMovement(army, actingUnitId);
	// The commander is a valid fallback but should only be picked once no packed unit qualifies.
	const commander = findArmyCommander(actingUnit.armyId);
	if (commander && (commander.Movement?.movementMovesRemaining ?? 0) > 0) {
		candidates.push(commander);
	}
	if (candidates.length === 0) {
		return;
	}
	const nextUnit = candidates.find((candidate) => candidate.type === actingUnit.type) ?? candidates[0];

	if (candidates[0]) dumpObject(candidates[0], 'candidate0');
	if (candidates[1]) dumpObject(candidates[1], 'candidate1');
	syncCommanderInteractToArmy(commander);
	UI.Player.selectUnit(nextUnit.id);


	// because of CommanderInteract.update() unconditionally re-selects the commander and it will run when
    // when a air unit coming back from attack rejoins commander, firing UnitAddedToArmy, so need to reselect it
    // if the player hasnt clicked away
	enforceSelectionUntil(nextUnit.id, commander, Date.now() + 8000);
});

function enforceSelectionUntil(unitId, commanderUnit, deadlineMs) {
	if (Date.now() >= deadlineMs) {
		return;
	}
	requestAnimationFrame(() => {
		const headSelected = UI.Player.getHeadSelectedUnit();
		if (ComponentID.isMatch(headSelected, unitId)) {
			enforceSelectionUntil(unitId, commanderUnit, deadlineMs);
			return;
		}
		if (commanderUnit && ComponentID.isMatch(headSelected, commanderUnit.id)) {
			syncCommanderInteractToArmy(commanderUnit);
			UI.Player.selectUnit(unitId);
			enforceSelectionUntil(unitId, commanderUnit, deadlineMs);
			return;
		}
		// if neither, then player selected away
	});
}

// Mass Rebase for squadron/aerodrome/carrier commanders to rebase eligible packed aircraft to a chosen airbase
class ArmyPanelMassRebaseDecorator {
	constructor(component) {
		this.component = component;
		const originalSetupArmyActions = component.setupArmyActions.bind(component);
		component.setupArmyActions = (commanderUnit) => {
			originalSetupArmyActions(commanderUnit);
			this.maybeAddMassRebaseAction(commanderUnit);
		};
	}

	maybeAddMassRebaseAction(commanderUnit) {
		if (!commanderHoldsAircraft(commanderUnit)) {
			return;
		}
		const army = Armies.get(commanderUnit.armyId);
		if (!army) {
			return;
		}
		const hasEligibleUnit = getRebaseEligibleArmyUnits(army).length > 0;
		const massRebaseAction = {
			name: buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_MASS_REBASE_NAME'),
				Locale.compose('LOC_BETTER_ACTIONS_MASS_REBASE_DESCRIPTION'),
				hasEligibleUnit ? null : Locale.compose('LOC_BETTER_ACTIONS_MASS_REBASE_FAIL_NO_ELIGIBLE_REASON'),
			),
			icon: 'blp:action_rebase.png',
			active: hasEligibleUnit,
			callback: () => {
				if (!hasEligibleUnit) {
					return;
				}
				InterfaceMode.switchTo(MASS_REBASE_MODE, { ArmyId: commanderUnit.armyId });
			},
		};
		this.component.armyActions.push(massRebaseAction);
		this.component.createArmyActionButton(massRebaseAction);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('army-panel', (component) => new ArmyPanelMassRebaseDecorator(component));

// Reapply Hex commander frame on new buttons
function applyCommanderButtonFrame(component, count) {
	for (const activatable of component.commandActionElements.slice(-count)) {
		activatable.querySelector('.unit-action-button__button-bg-container')?.classList.add('isCommander');
		activatable.querySelector('.unit-action-button__button-highlight')?.classList.add('isCommander');
	}
}

// Deal with createButtons stripping right margin, meaning bad spacing when adding new one
const ACTION_BUTTON_SPACER = 'mr-3';

function respaceActionRow(container) {
	if (!container) {
		return;
	}
	const buttons = Array.from(container.children)
		.filter((child) => child.tagName === 'UNIT-ACTION-BUTTON');
	buttons.forEach((button, index) => {
		button.classList.toggle(ACTION_BUTTON_SPACER, index < buttons.length - 1);
	});
}

// base markup for actions, cyan title,newline, description,then optional newline for reason for failure in red
function buildActionTooltip(title, description, disabledReason) {
	let tooltip = `[STYLE:unit-action__tooltip-title]${title}[/STYLE]`;
	if (description) {
		tooltip += `[n]${description}`;
	}
	if (disabledReason) {
		tooltip += `[n][STYLE:text-negative]${disabledReason}[/STYLE]`;
	}
	return tooltip;
}

// Mass Rebase in the main unit-actions panel's commander-actions row
class UnitActionsMassRebaseDecorator {
	constructor(component) {
		this.component = component;
		const originalRealizeButtons = component.realizeButtons.bind(component);
		component.realizeButtons = () => {
			originalRealizeButtons();
			this.maybeAddMassRebaseAction();
		};
	}

	maybeAddMassRebaseAction() {
		const unitId = this.component.unitId;
		const unit = unitId && ComponentID.isValid(unitId) ? Units.get(unitId) : null;
		if (!unit || !commanderHoldsAircraft(unit)) {
			return;
		}
		const army = Armies.get(unit.armyId);
		if (!army) {
			return;
		}
		const hasEligibleUnit = getRebaseEligibleArmyUnits(army).length > 0;
		const massRebaseAction = {
			name: buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_MASS_REBASE_NAME'),
				Locale.compose('LOC_BETTER_ACTIONS_MASS_REBASE_DESCRIPTION'),
				hasEligibleUnit
					? null
					: Locale.compose('LOC_BETTER_ACTIONS_MASS_REBASE_FAIL_NO_ELIGIBLE_REASON'),
			),
			icon: 'blp:action_rebase.png',
			type: 'MOD_MASS_REBASE',
			UICategory: UnitActionCategory.COMMAND,
			active: hasEligibleUnit,
			callback: () => {
				if (!hasEligibleUnit) {
					return;
				}
				InterfaceMode.switchTo(MASS_REBASE_MODE, { ArmyId: unit.armyId });
			},
		};
		this.component.commandActions.push(massRebaseAction);
		this.component.createButtons([massRebaseAction]);
		applyCommanderButtonFrame(this.component, 1);
		respaceActionRow(this.component.commanderContainer);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}
Controls.decorate('unit-actions', (component) => new UnitActionsMassRebaseDecorator(component));

// reinforce custom

class UnitActionsReinforceDecorator {
	constructor(component) {
		this.component = component;
		const originalRealizeButtons = component.realizeButtons.bind(component);
		component.realizeButtons = () => {
			originalRealizeButtons();
			this.maybeAddReinforceAction();
		};
	}

	maybeAddReinforceAction() {
		const unitId = this.component.unitId;
		const unit = unitId && ComponentID.isValid(unitId) ? Units.get(unitId) : null;
		if (!unit || !canUnitReinforce(unit)) {
			return;
		}
		const domainInfo = getReinforceDomainInfo(unit);
		// Use pathfinding to tell if units can reinforceto commander
		const targets = getReinforceTargets(unit);
		const soonest = targets.reduce((best, t) => (best === null || t.turns < best ? t.turns : best), null);
		const action = {
			name: buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_MANUAL_REINFORCE_NAME'),
				Locale.compose(
					targets.length === 0
						? 'LOC_BETTER_ACTIONS_MANUAL_REINFORCE_DESCRIPTION_NO_TARGET'
						: soonest === 0
							? 'LOC_BETTER_ACTIONS_MANUAL_REINFORCE_DESCRIPTION_THIS_TURN'
							: 'LOC_BETTER_ACTIONS_MANUAL_REINFORCE_DESCRIPTION',
					Locale.compose(domainInfo.verb),
					soonest,
				),
				targets.length
					? null
					: Locale.compose('LOC_BETTER_ACTIONS_MANUAL_REINFORCE_FAIL_NO_REACHABLE_COMMANDERS_REASON'),
			),
			icon: 'fs://game/action-panel-mod/icons/custom_reinforce.dds',
			type: 'MOD_REINFORCE',
			UICategory: UnitActionCategory.MAIN,
			active: targets.length > 0,
			callback: () => {
				if (targets.length === 0) {
					return;
				}
				InterfaceMode.switchTo(REINFORCE_MODE, { UnitID: unit.id });
			},
		};
		const best = getBestReinforceTarget(unit);
		if (best) {
			const commanderLevel = best.commander.Experience?.getLevel ?? 0;
			const hasRoom = best.freeSlots > 0;
			const arrivesNow = best.turns === 0;
			const descriptionTag = hasRoom
				? (arrivesNow
					? 'LOC_BETTER_ACTIONS_NEAREST_REINFORCE_DESCRIPTION_THIS_TURN'
					: 'LOC_BETTER_ACTIONS_NEAREST_REINFORCE_DESCRIPTION')
				: (arrivesNow
					? 'LOC_BETTER_ACTIONS_NEAREST_REINFORCE_DESCRIPTION_FULL_THIS_TURN'
					: 'LOC_BETTER_ACTIONS_NEAREST_REINFORCE_DESCRIPTION_FULL');
			const descriptionArgs = [Locale.compose(best.commander.name), commanderLevel];
			if (!arrivesNow) {
				descriptionArgs.push(best.turns);
			}
			if (hasRoom) {
				descriptionArgs.push(best.freeSlots);
			}
			// right-click option
			action.name += `[n]${Locale.compose(
				'LOC_BETTER_ACTIONS_REINFORCE_NEAREST_HINT', Locale.compose(descriptionTag, ...descriptionArgs)
			)}`;
			if (!hasRoom) {
				action.name += `[n][STYLE:text-negative]${
					Locale.compose('LOC_BETTER_ACTIONS_NEAREST_REINFORCE_FAIL_NO_FREE_SLOTS_REASON')}[/STYLE]`;
			}
		}
		this.component.standardActions.push(action);
		this.component.createButtons([action]);
		const button = this.component.standardActionElements[this.component.standardActionElements.length - 1];
		setButtonRightClick(button, () => {
			if (!best) {
				return false;
			}
			startReinforce(unit, best);
			return true;
		});
		respaceActionRow(this.component.standardContainer);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('unit-actions', (component) => new UnitActionsReinforceDecorator(component));

// gotta forget reninformcement then cancel command
//  A unit with no movement left should stay selected. Annoying base game polling stops this for some reason
const WAKE_COMMAND = 'UNITCOMMAND_WAKE';
const CANCEL_ORDERS_COMMAND = 'UNITCOMMAND_CANCEL';

// The base panel's deselect is frames after the button is pressed,  promise
const CANCEL_DESELECT_WINDOW_MS = 1000;
const MOD_CANCEL_WRAPPED_FLAG = '__modCancelWrapped';

class UnitActionsCancelDecorator {
	constructor(component) {
		this.component = component;
		this.keepSelectionUntil = 0;

		const originalSwitchToDefault = component.switchToDefault.bind(component);
		component.switchToDefault = () => {
			if (this.shouldKeepSelection()) {
				component.realizeButtons();
				component.updateFocusGate?.call('mod-keep-selection-after-cancel');
				return;
			}
			originalSwitchToDefault();
		};

		const originalGetUnitActions = component.getUnitActions.bind(component);
		component.getUnitActions = (unit) => {
			this.lastActionsUnit = unit;
			const result = originalGetUnitActions(unit);
			this.wrapCancelActions(unit);
			this.addQueueableActions(unit);
			this.addAlertActions(unit);
			return result;
		};

		// The badge can only be attached once the buttons exist, and realizeButtons is what makes them.
		const originalRealizeButtons = component.realizeButtons.bind(component);
		component.realizeButtons = () => {
			originalRealizeButtons();
			this.decorateAlertButtons();
		};

        // need to adjust base panel not acting on inactive button for shift queuing
        // sadly cant do shift queue annoyingly as its on the DOM
		const originalOnButtonActivated = component.onButtonActivated.bind(component);
		component.onButtonActivated = (event) => {
			if (event.target instanceof HTMLElement) {
				const action = component.findSelectedUnitAction(event.target);
				if (action && !action.active && this.shouldQueueAction(action)) {
					component.onActionChosen(action);
					return;
				}
			}
			originalOnButtonActivated(event);
		};
	}

	// A queueable action clicked on a unit that is already mid-plan joins the plan
	shouldQueueAction(action) {
		const unitId = UI.Player.getHeadSelectedUnit();
		const unit = ComponentID.isValid(unitId) ? Units.get(unitId) : null;
		if (!unit || !isQueueableFor(unit, action?.type)) {
			return false;
		}
		return hasQueue(unit);
	}

	// custom alerts
	// Turn alert has count on button, left click increase, right click decrease
	addAlertActions(unit) {
		if (!unit) {
			return;
		}
		const actions = this.component.actions ?? [];
		const alert = getAlert(unit);
		const sleeping = alert?.kind === ALERT_KIND_TURNS;
		actions.push({
			name: sleeping
				? buildActionTooltip(
					Locale.compose('LOC_BETTER_ACTIONS_ALERT_TURNS_NAME'),
					Locale.compose('LOC_BETTER_ACTIONS_ALERT_TURNS_ACTIVE_DESCRIPTION', getAlertTurnsRemaining(unit)))
				: buildActionTooltip(
					Locale.compose('LOC_BETTER_ACTIONS_ALERT_TURNS_NAME'),
					Locale.compose('LOC_BETTER_ACTIONS_ALERT_TURNS_DESCRIPTION')),
			icon: 'fs://game/action-panel-mod/icons/Actions/action_Timed_Sleep_256.dds',
			type: ALERT_TURNS_ACTION,
			active: true,
			UICategory: this.component.getUnitActionCategory('PASSIVE_SECONDARY'),
			priority: 61,
			[MOD_CANCEL_WRAPPED_FLAG]: true,
			callback: () => {
				addAlertTurn(unit, 1);
				this.keepSelectionUntil = performance.now() + CANCEL_DESELECT_WINDOW_MS;
				this.component.realizeButtons();
			},
		});
        // religion watching only on units that can convert, and in settlements currently converted
		if (canWatchReligion(unit) || alert?.kind === ALERT_KIND_RELIGION) {
			const watching = alert?.kind === ALERT_KIND_RELIGION;
			actions.push({
				name: buildActionTooltip(
					Locale.compose('LOC_BETTER_ACTIONS_ALERT_RELIGION_NAME'),
					Locale.compose(watching
						? 'LOC_BETTER_ACTIONS_ALERT_RELIGION_ACTIVE_DESCRIPTION'
						: 'LOC_BETTER_ACTIONS_ALERT_RELIGION_DESCRIPTION')),
				icon: 'blp:action_spreadreligion.png',
				type: ALERT_RELIGION_ACTION,
				active: true,
				UICategory: this.component.getUnitActionCategory('PASSIVE_SECONDARY'),
				priority: 62,
				[MOD_CANCEL_WRAPPED_FLAG]: true,
				callback: () => {
					if (watching) {
						cancelAlert(unit, { wake: true });
					} else {
						startReligionWatch(unit);
					}
					this.keepSelectionUntil = performance.now() + CANCEL_DESELECT_WINDOW_MS;
					this.component.realizeButtons();
				},
			});
		}
	}

	// Finds the live button element for the new synthetic actions. Because panel keeps its actions and
	// its elements in parallel arrays, split by where they were sorted to, so the element is whichever
	// entry shares an index with the action.
	findAlertButton(type) {
		const groups = [
			[this.component.standardActions, this.component.standardActionElements],
			[this.component.commandActions, this.component.commandActionElements],
			[this.component.hiddenActions, this.component.hiddenActionElements],
		];
		for (const [actions, elements] of groups) {
			const index = (actions ?? []).findIndex((action) => action?.type === type);
			if (index >= 0 && elements?.[index]) {
				return elements[index];
			}
		}
		return null;
	}

	// Paints the remaining turn count onto the turn-alert button, and gives it its right-click action.
	decorateAlertButtons() {
		// ensure that slept units still have decorated alerts
		const unit = this.lastActionsUnit;
		const turnsButton = this.findAlertButton(ALERT_TURNS_ACTION);
		if (turnsButton) {
			setAlertBadge(turnsButton, unit ? getAlertTurnsRemaining(unit) : null);
			setButtonRightClick(turnsButton, () => {
				if (!unit || !Units.get(unit.id) || getAlert(unit)?.kind !== ALERT_KIND_TURNS) {
					return false;
				}
				addAlertTurn(unit, -1);
				return true;
			});
		}
	}

    // add buttons for actions that would be possible somewhere, but not here, so can queue. Only show when in queue
	addQueueableActions(unit) {
		if (!unit || !hasQueue(unit)) {
			return;
		}
		const actions = this.component.actions ?? [];
		const present = new Set(actions.map((action) => action.type));
		for (const type of QUEUEABLE_IN_PLACE_ACTIONS) {
			if (present.has(type) || !canUnitEverDo(unit, type)) {
				continue;
			}
			const row = GameInfo.UnitOperations.lookup(type) ?? GameInfo.UnitCommands.lookup(type);
			if (!row) {
				continue;
			}
			actions.push({
				name: buildActionTooltip(
					Locale.compose(row.Name),
					Locale.compose('LOC_BETTER_ACTIONS_QUEUE_HINT_DESCRIPTION'),
				),
				icon: row.Icon,
				type,
				// Inactive on purpose: it genuinely cannot be done from here, and the greyed look says
				// so honestly. onButtonActivated above is what still lets it be queued.
				active: false,
				UICategory: this.component.getUnitActionCategory(row.CategoryInUI),
				priority: row.PriorityInUI ?? 0,
				// Marked as already handled so wrapCancelActions leaves it alone - it queues directly.
				[MOD_CANCEL_WRAPPED_FLAG]: true,
				callback: () => {
					enqueueAction(unit, type);
					this.keepSelectionUntil = performance.now() + CANCEL_DESELECT_WINDOW_MS;
					this.component.realizeButtons();
				},
			});
		}
	}

	shouldKeepSelection() {
        // ensures no deselection when queuing actions
		if (isQueueModifierDown()) {
			return true;
		}
		if (performance.now() > this.keepSelectionUntil) {
			return false;
		}
		const unitId = UI.Player.getHeadSelectedUnit();
		const unit = ComponentID.isValid(unitId) ? Units.get(unitId) : null;
		if (unit && isUnitAlerted(unit)) {
			return true;
		}
		return (unit?.Movement?.movementMovesRemaining ?? 0) <= 0;
	}

	wrapCancelActions(unit) {
		for (const action of this.component.actions ?? []) {
			if (action[MOD_CANCEL_WRAPPED_FLAG]) {
				continue;
			}
			const isCancel = action.type === WAKE_COMMAND || action.type === CANCEL_ORDERS_COMMAND;
			const isQueueable = isQueueableFor(unit, action.type);
			// Ensure that other actions cancel the alert
			const cancelsAlert = isUnitAlerted(unit);
			if (!isCancel && !isQueueable && !cancelsAlert) {
				continue;
			}
			action[MOD_CANCEL_WRAPPED_FLAG] = true;
			const originalCallback = action.callback;
			action.callback = (location) => {
				cancelAlert(unit);
				if (isCancel) {
					// Call off custom stack of queuing
					forgetReinforcementFor(unit);
					clearQueue(unit);
					this.keepSelectionUntil = performance.now() + CANCEL_DESELECT_WINDOW_MS;
					return originalCallback(location);
				}
				if (this.shouldQueueAction(action)) {
					enqueueAction(unit, action.type);
					this.keepSelectionUntil = performance.now() + CANCEL_DESELECT_WINDOW_MS;
					this.component.realizeButtons();
					return;
				}
				return originalCallback(location);
			};
		}
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('unit-actions', (component) => new UnitActionsCancelDecorator(component));

// Stops camera jumping away when giving unit an action and its queue based
class PanelActionQueueCycleDecorator {
	constructor(component) {
		this.component = component;
		const originalTryAutoUnitCycle = component.tryAutoUnitCycle.bind(component);
		component.tryAutoUnitCycle = (delayMS) => {
			if (isQueueModifierDown()) {
				return;
			}
			originalTryAutoUnitCycle(delayMS);
		};
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('panel-action', (component) => new PanelActionQueueCycleDecorator(component));

// --- Rally point button, on the production panel's Units section -----------------------------------
// Click it, then click plot for rally

const RALLY_BUTTON_ID = 'ap-mod-rally-button';
const RALLY_BUTTON_CLASS = 'ap-mod-rally-chip';
const RALLY_BUTTON_STYLE_ID = 'ap-mod-rally-chip-style';

// Three states. idle, has rally, waiting for rally plot select
function injectRallyChipStyle() {
	if (document.getElementById(RALLY_BUTTON_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = RALLY_BUTTON_STYLE_ID;
	style.textContent = `
		.${RALLY_BUTTON_CLASS} ${RALLY_BUTTON_STYLE}
		.${RALLY_BUTTON_CLASS}:hover {
			opacity: 1;
		}
		.${RALLY_BUTTON_CLASS}.rallied {
			opacity: 1;
			border-bottom-color: #e5d2ac;
		}
		.${RALLY_BUTTON_CLASS}.armed {
			opacity: 1;
			color: #7ad07a;
			border-bottom-color: #7ad07a;
		}
	`;
	document.head.appendChild(style);
}

const UNITS_CATEGORY = 'units';
const isModern = Game.age === Database.makeHash('AGE_MODERN')

class ProductionChooserRallyDecorator {
	constructor(component) {
		this.component = component;
		const originalRealizeCategory = component.realizeCategory.bind(component);
		component.realizeCategory = (category, items) => {
			originalRealizeCategory(category, items);
			if (category === UNITS_CATEGORY) {
				this.addRallyButton();
			}
		};
	}

	getSelectedCity() {
		const cityId = UI.Player.getHeadSelectedCity?.();
		return cityId && ComponentID.isValid(cityId) ? Cities.get(cityId) : null;
	}

	// rallies are buttons in the Unit section header.
	// Have to stop the activation of the dropdown they are in
	addRallyButton() {
		const section = this.component.productionCategorySlots?.[UNITS_CATEGORY];
		const header = section?.header;
		if (!header) {
			return;
		}
		injectRallyChipStyle();
		let row = header.querySelector(`#${RALLY_BUTTON_ID}-row`);
		if (!row) {
			row = document.createElement('div');
			row.id = `${RALLY_BUTTON_ID}-row`;
			row.classList.value = 'relative flex flex-row items-center mr-1';
			// Before the arrow, so the fold indicator stays the rightmost thing in the bar.
			header.insertBefore(row, section.arrowIcon ?? null);
		}
		for (const category of RALLY_CATEGORY_DISPLAY_ORDER) {
			const id = `${RALLY_BUTTON_ID}-${category.toLowerCase()}`;
			let button = row.querySelector(`#${id}`);
			// Air exists only in the Modern age. Checked on every render rather than once, because the
			// panel outlives an age transition and a button left behind would be a dead option.
			if (category === RALLY_AIR && !isModern) {
				button?.remove();
				continue;
			}
			if (!button) {
				button = document.createElement('fxs-activatable');
				button.id = id;
				button.classList.value = `${RALLY_BUTTON_CLASS} relative cursor-pointer`;
				button.setAttribute('tabindex', '-1');
				button.style.setProperty('background-image', UI.getIconCSS(RALLY_CATEGORY_ICONS[category]));
				button.addEventListener('action-activate', (event) => this.onActivate(category, event));
				row.appendChild(button);
			}
			this.updateLabel(button, category);
		}
	}

	// Icon
	updateLabel(button, category) {
		const city = this.getSelectedCity();
		const name = Locale.compose(RALLY_CATEGORY_LABELS[category]);
		const armed = getArmedCategory() === category;
		const set = !!(city && getRallyPoint(city, category));
		button.classList.toggle('armed', armed);
		button.classList.toggle('rallied', set && !armed);
		button.setAttribute('data-tooltip-content', Locale.compose(
			armed
				? 'LOC_BETTER_ACTIONS_RALLY_PICKING'
				: set
					? 'LOC_BETTER_ACTIONS_RALLY_CLEAR'
					: 'LOC_BETTER_ACTIONS_RALLY_SET',
			name,
		));
	}
    // supprese collapsing unit list
	onActivate(category, event) {
		event?.stopPropagation?.();
		event?.preventDefault?.();
		const city = this.getSelectedCity();
		if (!city) {
			return;
		}
		// A rally already set is cleared by its button; otherwise the next map click sets one.
		if (getRallyPoint(city, category)) {
			clearRallyPoint(city, category);
		} else {
			armRallyPicking(city, category);
		}
		this.addRallyButton();
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('panel-production-chooser', (component) => new ProductionChooserRallyDecorator(component));

// --- Emblem picker inside the commander's Rename Unit dialogue ---

const FLAG_ICON_PICKER_CLASS = 'ap-mod-flag-icon-picker';
const FLAG_ICON_STYLE_ID = 'ap-mod-flag-icon-style';

function injectFlagIconPickerStyle() {
	if (document.getElementById(FLAG_ICON_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = FLAG_ICON_STYLE_ID;
	style.textContent = `
		.${FLAG_ICON_PICKER_CLASS}__option ${FLAG_ICON_STYLE_OPTION}
		.${FLAG_ICON_PICKER_CLASS}__option:hover {
			opacity: 1;
		}
		.${FLAG_ICON_PICKER_CLASS}__option.selected {
			opacity: 1;
			border-color: #e5d2ac;
		}
		.${FLAG_ICON_PICKER_CLASS}__browse {
			height: 17rem;
			width: 100%;
		}
		.${FLAG_ICON_PICKER_CLASS}__colour ${FLAG_ICON_STYLE_COLOUR}
		.${FLAG_ICON_PICKER_CLASS}__colour:hover {
			opacity: 1;
			border-color: #e5d2ac;
		}
		.${FLAG_ICON_PICKER_CLASS}__colour.selected {
			opacity: 1;
			color: #1a1a14;
			border-color: #e5d2ac;
			background-color: #e5d2ac;
		}
	`;
	document.head.appendChild(style);
}

const PX_SCALE = GlobalScaling.getCurrentScale() / 100;
const PICKER_PANEL_HEIGHT = 640 * PX_SCALE;
const PICKER_PANEL_TOP = -544 * PX_SCALE;

class UnitRenameFlagIconDecorator {
	constructor(component) {
		this.component = component;
		this.optionButtons = [];
		const originalOnAttributeChanged = component.onAttributeChanged.bind(component);
		component.onAttributeChanged = (name, oldValue, newValue) => {
			originalOnAttributeChanged(name, oldValue, newValue);
			// Note the inversion in the base panel: active="true" means HIDDEN.
			if (name === 'active' && newValue !== 'true') {
				this.realizeSelection();
			}
		};
	}

	getCommander() {
		const unitId = UI.Player.getHeadSelectedUnit();
		const unit = unitId && ComponentID.isValid(unitId) ? Units.get(unitId) : null;
		return isFlagIconCustomisable(unit) ? unit : null;
	}

	buildPicker() {
		const root = this.component.Root;
		if (root.querySelector(`.${FLAG_ICON_PICKER_CLASS}`)) {
			return;
		}
		injectFlagIconPickerStyle();
		root.classList.remove('h-60', 'h-96');
		root.style.setProperty('height', `${PICKER_PANEL_HEIGHT}px`);
		root.style.setProperty('top', `${PICKER_PANEL_TOP}px`);

		const picker = document.createElement('div');
		picker.classList.value = `${FLAG_ICON_PICKER_CLASS} flex flex-col items-center w-full`;

		const title = document.createElement('div');
		title.classList.value = 'font-title-sm uppercase text-accent-2';
		title.textContent = Locale.compose('LOC_BETTER_ACTIONS_FLAG_EMBLEM_TITLE');
		picker.appendChild(title);

		this.optionButtons = [];
		this.buildColourModeRow(picker);

		const scrollable = document.createElement('fxs-scrollable');
		scrollable.classList.add(`${FLAG_ICON_PICKER_CLASS}__browse`);
		this.grid = document.createElement('div');
		this.grid.classList.value = 'flex flex-row flex-wrap justify-center w-full';
		scrollable.appendChild(this.grid);
		picker.appendChild(scrollable);

		// Ensure confirm is last
		const confirmButton = root.querySelector('.unit-rename__confirm');
		const confirmRow = confirmButton?.parentElement;
		if (confirmRow?.parentElement) {
			confirmRow.parentElement.insertBefore(picker, confirmRow);
		} else {
			root.firstElementChild?.appendChild(picker);
		}
		this.realizeGrid();
	}

	// Colour mode choices, player colour, greyscale, original
	buildColourModeRow(picker) {
		const heading = document.createElement('div');
		heading.classList.value = 'font-title-sm uppercase text-accent-2 mt-1';
		heading.textContent = Locale.compose('LOC_BETTER_ACTIONS_FLAG_EMBLEM_COLOUR_LABEL');
		picker.appendChild(heading);

		const row = document.createElement('div');
		row.classList.value = 'flex flex-row items-center justify-center mb-1';

		this.colourButtons = [];
		for (const mode of FLAG_EMBLEM_COLOUR_MODES) {
			const button = document.createElement('fxs-activatable');
			button.classList.value = `${FLAG_ICON_PICKER_CLASS}__colour relative cursor-pointer`;
			button.setAttribute('tabindex', '-1');
			button.setAttribute('data-tooltip-content',
				Locale.compose(`LOC_BETTER_ACTIONS_FLAG_EMBLEM_COLOUR_${mode}_TOOLTIP`));
			const caption = document.createElement('div');
			caption.classList.value = 'font-body-sm';
			caption.textContent = Locale.compose(`LOC_BETTER_ACTIONS_FLAG_EMBLEM_COLOUR_${mode}`);
			button.appendChild(caption);
			button.addEventListener('action-activate', () => this.onColourModeChosen(mode));
			row.appendChild(button);
			this.colourButtons.push({ button, mode });
		}
		picker.appendChild(row);
	}
    // retint all icons in grid so clear what it does to each icon type
	onColourModeChosen(mode) {
		const unit = this.getCommander();
		if (!unit) {
			return;
		}
		setFlagColourMode(unit, mode);
		this.realizeGrid();
	}

	addOptionButton(parent, option) {
		const button = document.createElement('fxs-activatable');
		button.classList.value = `${FLAG_ICON_PICKER_CLASS}__option relative cursor-pointer`;
		button.setAttribute('tabindex', '-1');
		if (option?.url) {
			button.style.backgroundImage = `url('${option.url}')`;
			button.style.setProperty('filter', getFlagEmblemFilter(
				GameContext.localPlayerID,
				getFlagColourMode(this.getCommander()),
				option.id,
			));
			button.setAttribute('data-tooltip-content',
				`<div>${option.iconId}</div><div>${option.context}</div>`);
		} else if (option?.id === PROMOTION_GLYPH_ICON) {
			const canvas = document.createElement('canvas');
			canvas.classList.add(`${FLAG_ICON_PICKER_CLASS}__glyph`);
			canvas.width = 64;
			canvas.height = 64;
			canvas.style.setProperty('position', 'absolute');
			canvas.style.setProperty('left', '0');
			canvas.style.setProperty('top', '0');
			canvas.style.setProperty('width', '100%');
			canvas.style.setProperty('height', '100%');
			button.appendChild(canvas);
			button.setAttribute('data-tooltip-content',
				Locale.compose('LOC_BETTER_ACTIONS_FLAG_EMBLEM_PROMOTION_GLYPH'));
		} else {
			button.setAttribute('data-tooltip-content',
				Locale.compose('LOC_BETTER_ACTIONS_FLAG_EMBLEM_DEFAULT'));
		}
		button.addEventListener('action-activate', () => this.onOptionChosen(option?.id ?? null));
		parent.appendChild(button);
		this.optionButtons.push({ button, id: option?.id ?? null });
		return button;
	}

	realizeGrid() {
		if (!this.grid) {
			return;
		}
		this.optionButtons = [];
		while (this.grid.lastChild) {
			this.grid.removeChild(this.grid.lastChild);
		}

		// null is standard unitflag and PROMOTION_GLYPH_ICON the generated one.
		for (const option of [null, { id: PROMOTION_GLYPH_ICON }, ...getFlagIconOptions()]) {
			this.addOptionButton(this.grid, option);
		}
		this.realizeSelection();
	}
    // not done on confirm so no fiddling reopening and checking each time. Dont like that confirm has lost meaning...
	onOptionChosen(iconId) {
		const unit = this.getCommander();
		if (!unit) {
			return;
		}
		setFlagIcon(unit, iconId);
		this.realizeSelection();
	}

	realizeSelection() {
		const unit = this.getCommander();
		const current = unit ? getFlagIcon(unit) : null;
		const colourMode = getFlagColourMode(unit);
		for (const { button, mode } of this.colourButtons ?? []) {
			button.classList.toggle('selected', mode === colourMode);
		}
		for (const { button, id } of this.optionButtons) {
			button.classList.toggle('selected', id === current);
			if (id === null && unit) {
				const definition = GameInfo.Units.lookup(unit.type);
				if (definition) {
					button.style.backgroundImage = `url('${Icon.getUnitIconFromDefinition(definition)}')`;
				}
			}
			if (id === PROMOTION_GLYPH_ICON) {
				const canvas = button.querySelector(`.${FLAG_ICON_PICKER_CLASS}__glyph`);
				// A commander with no promotions yet draws nothing, which is the honest preview: the
				// glyph would be blank on its flag too, and the emblem falls back to the silhouette.
				if (canvas) {
					drawPromotionGlyph(canvas, unit);
				}
			}
		}
	}

	beforeAttach() { }
	afterAttach() {
		this.buildPicker();
		this.realizeSelection();
	}
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('unit-rename', (component) => new UnitRenameFlagIconDecorator(component));

// --- Conditional alerts ---------------------------------------------------------------------------
const ALERT_TURNS_ACTION = 'SLOTH_ALERT_TURNS';
const ALERT_RELIGION_ACTION = 'SLOTH_ALERT_RELIGION';

// The unit a rendered alert button belongs to, on the element.
const ALERT_BADGE_CLASS = 'ap-mod-alert-badge';
const ALERT_BADGE_STYLE_ID = 'ap-mod-alert-badge-style';

function installAlertBadgeStyle() {
	if (document.getElementById(ALERT_BADGE_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = ALERT_BADGE_STYLE_ID;
	// Reuses the movement badge's look so the two read as the same kind of marker.
	style.textContent = `.${ALERT_BADGE_CLASS} ${MOVEMENT_BADGE_STYLE}`;
	document.head.appendChild(style);
}

function setAlertBadge(button, turns) {
	installAlertBadgeStyle();
	let badge = button.querySelector(`.${ALERT_BADGE_CLASS}`);
	if (turns == null) {
		badge?.remove();
		return;
	}
	if (!badge) {
		badge = document.createElement('div');
		badge.classList.add(ALERT_BADGE_CLASS);
		(button.querySelector('.unit-action-button__button-bg-container') ?? button).appendChild(badge);
	}
	badge.textContent = String(turns);
	badge.style.display = 'flex';
}

// Right-click on sleep timer reduces. Done as InputEngineEventName as DOM listener doesnt seem to work on the UI
const RIGHT_CLICK_HANDLER = Symbol('slothButtonRightClick');

function setButtonRightClick(button, handler) {
	if (button) {
		button[RIGHT_CLICK_HANDLER] = handler;
	}
}

window.addEventListener(InputEngineEventName, (inputEvent) => {
	if (inputEvent.detail?.name !== 'mousebutton-right'
		|| inputEvent.detail.status !== InputActionStatuses.FINISH) {
		return;
	}
	const target = inputEvent.target instanceof HTMLElement ? inputEvent.target : null;
	const button = target?.closest?.('.unit-actions__action-button');
	const handler = button?.[RIGHT_CLICK_HANDLER];
	if (typeof handler !== 'function') {
		return;
	}
	let handled = false;
	try {
		handled = handler() !== false;
	} catch (error) {
		console.error('action: right-click handler threw:', error);
	}
	if (!handled) {
		return;
	}
	inputEvent.preventDefault();
	inputEvent.stopPropagation();
	document.querySelector('unit-actions')?.component?.realizeButtons();
}, true);

// --- Unit abilities breakdown -----------------------------------------------------------------------
// hover over promotions icon to see abilities on unit, divided into inherent and transient.
// a lot dont work because no text.
const ABILITIES_ICON_URL = 'blp:Action_Promote.png';
const ABILITIES_MARKER_CLASS = 'ap-mod-abilities-marker';
const ABILITIES_MARKER_STYLE_ID = 'ap-mod-abilities-marker-style';

function installAbilitiesMarkerStyle() {
	if (document.getElementById(ABILITIES_MARKER_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = ABILITIES_MARKER_STYLE_ID;
	// pointer-events must be turned on to do hover.
	style.textContent = `
		.${ABILITIES_MARKER_CLASS} {
			width: 1.1rem;
			height: 1.1rem;
			margin-left: 0.35rem;
			flex-shrink: 0;
			align-self: center;
			background-size: contain;
			background-repeat: no-repeat;
			background-position: center;
			pointer-events: auto;
			opacity: 0.85;
		}
		.${ABILITIES_MARKER_CLASS}:hover { opacity: 1; }
	`;
	document.head.appendChild(style);
}

// line for ability name, then below description
function abilityLine(ability) {
	const name = `[STYLE:unit-action__tooltip-title]${ability.name}[/STYLE]`;
	return ability.description ? `${name}[n]${ability.description}` : name;
}

// split inherent and transient abilities
function buildAbilitiesTooltip(unit) {
	const abilities = getUnitAbilities(unit);
	if (abilities.length === 0) {
		return null;
	}
	const sections = [
		['LOC_BETTER_ACTIONS_ABILITIES_INHERENT', abilities.filter((a) => !a.transient)],
		['LOC_BETTER_ACTIONS_ABILITIES_TRANSIENT', abilities.filter((a) => a.transient)],
	];
	const body = sections
		.filter(([, group]) => group.length > 0)
		.map(([heading, group]) => `[STYLE:unit-action__tooltip-additional-desc]${
			Locale.compose(heading)}[/STYLE][n]${group.map(abilityLine).join('[n][n]')}`)
		.join('[n][n]');
	return `[STYLE:unit-action__tooltip-title]${
		Locale.compose('LOC_BETTER_ACTIONS_ABILITIES_TITLE')}[/STYLE][n]${body}`;
}

class UnitActionsAbilitiesDecorator {
	constructor(component) {
		this.component = component;
		const originalRealizeButtons = component.realizeButtons.bind(component);
		component.realizeButtons = () => {
			originalRealizeButtons();
			this.refreshAbilitiesMarker();
		};
	}

	refreshAbilitiesMarker() {
		try {
			const container = this.component.Root?.querySelector('.unit-actions__unit-identifier-container');
			if (!container) {
				return;
			}
			let marker = container.querySelector(`.${ABILITIES_MARKER_CLASS}`);
			const unitId = this.component.unitId;
			const unit = unitId && ComponentID.isValid(unitId) ? Units.get(unitId) : null;
			const tooltip = unit ? buildAbilitiesTooltip(unit) : null;
			if (!tooltip) {
				marker?.remove();
				return;
			}
			if (!marker) {
				installAbilitiesMarkerStyle();
				marker = document.createElement('div');
				marker.classList.add(ABILITIES_MARKER_CLASS);
				marker.style.backgroundImage = `url("${ABILITIES_ICON_URL}")`;
				const name = container.querySelector('.unit-actions__unit-name');
				name ? name.after(marker) : container.appendChild(marker);
			}
			marker.setAttribute('data-tooltip-content', tooltip);
			marker.setAttribute('data-tooltip-anchor', 'right');
		} catch (error) {
			console.error('action: could not build the unit abilities marker:', error);
		}
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('unit-actions', (component) => new UnitActionsAbilitiesDecorator(component));

// Attach/detach a single escort that travels with Army and fleet commanders.

// action icon when not attached, otherwise shows unitflag of escort
const ESCORT_ACTION_ICON = 'blp:Action_TeleportTo';
const ESCORT_ACTION_SOUND = 'data-audio-unit-action-activated';
const ESCORT_ACTION_SOUND_GROUP = 'interact-unit';

class ArmyPanelEscortDecorator {
	constructor(component) {
		this.component = component;
		const originalSetupArmyActions = component.setupArmyActions.bind(component);
		component.setupArmyActions = (commanderUnit) => {
			originalSetupArmyActions(commanderUnit);
			this.maybeAddEscortAction(commanderUnit);
		};
	}

	maybeAddEscortAction(commanderUnit) {
		if (!canCommanderAttach(commanderUnit)) {
			return;
		}
		const attached = getAttachedUnit(commanderUnit);
		const candidate = attached ? null : getAttachCandidate(commanderUnit);
		const action = {
			name: attached
				? buildActionTooltip(
					Locale.compose('LOC_BETTER_ACTIONS_DETACH_ESCORT_NAME'),
					Locale.compose('LOC_BETTER_ACTIONS_DETACH_ESCORT_DESCRIPTION', Locale.compose(attached.name)))
				: buildActionTooltip(
					Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_NAME'),
					candidate
						? Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_DESCRIPTION', Locale.compose(candidate.name))
						: Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_DESCRIPTION_GENERIC'),
					candidate ? null : Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_FAIL_NO_CANDIDATE_REASON')),
			icon: (attached && Icon.getUnitIconFromDefinition(GameInfo.Units.lookup(attached.type)))    // unitflag icon
				|| ESCORT_ACTION_ICON,
			active: Boolean(attached || candidate),
			[MOD_PACK_ACTION_FLAG]: true,
			callback: () => {
				const current = getAttachedUnit(commanderUnit);
				if (current) {
					detachEscort(commanderUnit);
				} else {
					const pick = getAttachCandidate(commanderUnit);
					if (pick) {
						attachEscort(commanderUnit, pick);
					}
				}
				Audio.playSound(ESCORT_ACTION_SOUND, ESCORT_ACTION_SOUND_GROUP);
				refreshMovementRangeOverlay();
				this.rebuildEscortAction(commanderUnit);
			},
		};
		this.component.armyActions.push(action);
		this.component.createArmyActionButton(action);
		this.escortButton = this.component.armyActionButtons[this.component.armyActionButtons.length - 1];
		this.escortAction = action;
	}

	// Re-derives the button's look from the pairing. Cant rebuild as setupArmyActions appents to armyActions, not clear
    // so would duplidcate
	rebuildEscortAction(commanderUnit) {
		const button = this.escortButton;
		const action = this.escortAction;
		if (!button || !action) {
			return;
		}
		const attached = getAttachedUnit(commanderUnit);
		const candidate = attached ? null : getAttachCandidate(commanderUnit);
		action.name = attached
			? buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_DETACH_ESCORT_NAME'),
				Locale.compose('LOC_BETTER_ACTIONS_DETACH_ESCORT_DESCRIPTION', Locale.compose(attached.name)))
			: buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_NAME'),
				candidate
					? Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_DESCRIPTION', Locale.compose(candidate.name))
					: Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_DESCRIPTION_GENERIC'),
				candidate ? null : Locale.compose('LOC_BETTER_ACTIONS_ATTACH_ESCORT_FAIL_NO_CANDIDATE_REASON'));
		action.icon = (attached && Icon.getUnitIconFromDefinition(GameInfo.Units.lookup(attached.type)))
			|| ESCORT_ACTION_ICON;
		action.active = Boolean(attached || candidate);
		button.setAttribute('data-tooltip-content', action.name);
		button.style.setProperty('--button-icon', `url("${action.icon}")`);
		button.classList.toggle('inactive', !action.active);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('army-panel', (component) => new ArmyPanelEscortDecorator(component));

// Pack army changes to reinforce from nearby unit. Air commander it takes other rebase aircraft, for land and naval,
// gets units within REINFORCE_CALL_RADIUS, sorts them by nearest first/then health/then damage, and broadcasts
// to the top n amount where n is the space left in the commander. Units then manually reinforce, travelling to commander
// and entering.

const PACK_ARMY_ICON = 'blp:Action_Pack.png';
const MOD_PACK_ACTION_FLAG = '__modPackAction';

class ArmyPanelPackArmyOverrideDecorator {
	constructor(component) {
		this.component = component;
		this.currentCommanderUnit = null;

		const originalSetupArmyActions = component.setupArmyActions.bind(component);
		component.setupArmyActions = (commanderUnit) => {
			this.currentCommanderUnit = commanderUnit;
			originalSetupArmyActions(commanderUnit);
		};

		const originalCreateArmyActionButton = component.createArmyActionButton.bind(component);
		component.createArmyActionButton = (action) => {
			this.maybeOverridePackArmyAction(action);
			return originalCreateArmyActionButton(action);
		};
	}

	maybeOverridePackArmyAction(action) {
		const commanderUnit = this.currentCommanderUnit;
		if (action.icon !== PACK_ARMY_ICON || action[MOD_PACK_ACTION_FLAG] || !commanderUnit) {
			return;
		}
		if (commanderHoldsAircraft(commanderUnit)) {
			this.overrideWithAircraftPull(action, commanderUnit);
		} else if (commanderUnit.isCommanderUnit) {
			this.overrideWithReinforceCall(action, commanderUnit);
		}
	}

	// Land and naval commanders broadcast for reinforcements.
	overrideWithReinforceCall(action, commanderUnit) {
		// Already capped at the commander's free slots and already excludes anything with no route
		const candidates = getReinforceCallCandidates(commanderUnit);
		action[MOD_PACK_ACTION_FLAG] = true;
		action.name = buildActionTooltip(
			Locale.compose('LOC_BETTER_ACTIONS_REINFORCE_CALL_NAME'),
			candidates.length === 0
				? Locale.compose('LOC_BETTER_ACTIONS_REINFORCE_CALL_DESCRIPTION_NONE')
				: candidates.length === 1
					? Locale.compose('LOC_BETTER_ACTIONS_REINFORCE_CALL_DESCRIPTION_ONE', REINFORCE_CALL_RADIUS)
					: Locale.compose('LOC_BETTER_ACTIONS_REINFORCE_CALL_DESCRIPTION',
						candidates.length, REINFORCE_CALL_RADIUS),
			candidates.length
				? null
				: Locale.compose('LOC_BETTER_ACTIONS_REINFORCE_CALL_FAIL_NONE_REASON', REINFORCE_CALL_RADIUS),
		);
		action.active = candidates.length > 0;
		action.callback = () => {
			for (const candidate of candidates) {
				startReinforce(candidate.unit, candidate);
			}
		};
	}

	// Air commanders pull in aircraft that could rebase here this turn.
	overrideWithAircraftPull(action, commanderUnit) {
		const army = Armies.get(commanderUnit.armyId);
		if (!army) {
			return;
		}
		// Combat slots only, dont consider 1 packed civilian/scout unit.
		const remainingCapacity = getCommanderFreeCapacity(commanderUnit).combat;
		const candidates = getAircraftPullCandidates(commanderUnit);
		const hasEligible = remainingCapacity > 0 && candidates.length > 0;

		action[MOD_PACK_ACTION_FLAG] = true;
		action.name = buildActionTooltip(
			Locale.compose('LOC_BETTER_ACTIONS_AIRCRAFT_PULL_NAME'),
			Locale.compose('LOC_BETTER_ACTIONS_AIRCRAFT_PULL_DESCRIPTION'),
			hasEligible ? null : Locale.compose('LOC_BETTER_ACTIONS_AIRCRAFT_PULL_FAIL_NONE_REASON'),
		);
		action.active = hasEligible;
		action.callback = () => {
			if (!hasEligible) {
				return;
			}
			const ordered = sortJoinCandidates(candidates, commanderUnit.location);
			const args = { X: commanderUnit.location.x, Y: commanderUnit.location.y };
			let slotsLeft = remainingCapacity;
			for (const unit of ordered) {
				if (slotsLeft <= 0) {
					break;
				}
				Game.UnitOperations.sendRequest(unit.id, MASS_REBASE_OPERATION, args);
				slotsLeft--;
			}
		};
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('army-panel', (component) => new ArmyPanelPackArmyOverrideDecorator(component));

// Pack style for squadron commanders for paratroopers, Infantry, then Cav, with two promotion

class ArmyPanelLandPackDecorator {
	constructor(component) {
		this.component = component;

		const originalSetupArmyActions = component.setupArmyActions.bind(component);
		component.setupArmyActions = (commanderUnit) => {
			originalSetupArmyActions(commanderUnit);
			this.maybeAddLandPackAction(commanderUnit);
		};
	}

	maybeAddLandPackAction(commanderUnit) {
		if (!commanderUnit?.hasAbility?.(AIR_DROP_ABILITY)) {
			return;
		}
		const army = Armies.get(commanderUnit.armyId);
		if (!army) {
			return;
		}
		const remainingCapacity = getCommanderFreeCapacity(commanderUnit).combat;
		const candidates = getLandPackCandidates(commanderUnit);
		const hasEligible = remainingCapacity > 0 && candidates.length > 0;

		const landPackAction = {
			name: buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_LAND_PACK_NAME'),
				Locale.compose('LOC_BETTER_ACTIONS_LAND_PACK_DESCRIPTION'),
				hasEligible ? null : Locale.compose('LOC_BETTER_ACTIONS_LAND_PACK_FAIL_NONE_REASON'),
			),
			icon: PACK_ARMY_ICON,
			active: hasEligible,
			[MOD_PACK_ACTION_FLAG]: true,
			callback: () => {
				if (!hasEligible) {
					return;
				}
				const ordered = sortJoinCandidates(candidates, commanderUnit.location);
				const args = { X: commanderUnit.location.x, Y: commanderUnit.location.y };
				let slotsLeft = remainingCapacity;
				for (const unit of ordered) {
					if (slotsLeft <= 0) {
						break;
					}
					Game.UnitCommands.sendRequest(unit.id, ADD_TO_ARMY_COMMAND, args);
					slotsLeft--;
				}
			},
		};
		this.component.armyActions.push(landPackAction);
		this.component.createArmyActionButton(landPackAction);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('army-panel', (component) => new ArmyPanelLandPackDecorator(component));

// Bulk attacks that are better version of Ground Attack /Carpet Bomb, as they stop once the target is dead.

const GROUND_ATTACK_ICON = 'blp:action_closeairsupport.png';
const CARPET_BOMB_ICON = 'blp:action_carpetbomb.png';

class ArmyPanelSmartStrikeDecorator {
	constructor(component) {
		this.component = component;

		const originalSetupArmyActions = component.setupArmyActions.bind(component);
		component.setupArmyActions = (commanderUnit) => {
			originalSetupArmyActions(commanderUnit);
			this.maybeAddStrikeAction(commanderUnit, GROUND_ATTACKER_CLASS, GROUND_ATTACK_MODE, GROUND_ATTACK_ICON,
				'LOC_BETTER_ACTIONS_SMART_GROUND_ATTACK_NAME');
			this.maybeAddStrikeAction(commanderUnit, BOMBER_CLASS, CARPET_BOMB_MODE, CARPET_BOMB_ICON,
				'LOC_BETTER_ACTIONS_SMART_CARPET_BOMB_NAME');
		};
	}

	maybeAddStrikeAction(commanderUnit, classTag, mode, icon, nameTag) {
		if (!commanderHoldsAircraft(commanderUnit)) {
			return;
		}
		const army = Armies.get(commanderUnit.armyId);
		if (!army) {
			return;
		}
		const hasEligible = getClassEligibleAttackers(army, classTag).length > 0;
		const strikeAction = {
			name: buildActionTooltip(
				Locale.compose(nameTag),
				Locale.compose('LOC_BETTER_ACTIONS_SMART_STRIKE_DESCRIPTION'),
				hasEligible ? null : Locale.compose('LOC_BETTER_ACTIONS_SMART_STRIKE_FAIL_NO_ELIGIBLE_REASON'),
			),
			icon,
			active: hasEligible,
			[MOD_PACK_ACTION_FLAG]: true,
			callback: () => {
				if (!hasEligible) {
					return;
				}
				InterfaceMode.switchTo(mode, { ArmyId: commanderUnit.armyId, ClassTag: classTag });
			},
		};
		this.component.armyActions.push(strikeAction);
		this.component.createArmyActionButton(strikeAction);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('army-panel', (component) => new ArmyPanelSmartStrikeDecorator(component));

// bulk ranged attack. Basically focus Fire but doesnt end unit movement.
// sadly cant simulate attacking unit, then unit underneath or district. So less smart.

class ArmyPanelFocusFireDecorator {
	constructor(component) {
		this.component = component;

		const originalSetupArmyActions = component.setupArmyActions.bind(component);
		component.setupArmyActions = (commanderUnit) => {
			originalSetupArmyActions(commanderUnit);
			for (const [mode, variant] of Object.entries(FOCUS_FIRE_VARIANTS)) {
				this.maybeAddFocusFireAction(commanderUnit, mode, variant);
			}
		};
	}

	maybeAddFocusFireAction(commanderUnit, mode, variant) {
		if (!variant.commanderCheck(commanderUnit)) {
			return;
		}
		const nativeCheck = Game.UnitCommands.canStart(commanderUnit.id, variant.command, {}, true);
		if (!nativeCheck?.Success) {
			return;
		}
		const hasEligible = getRadiusEligiblePlayerUnits(
			commanderUnit, getFocusFireClasses(commanderUnit), getFocusFireOperation(commanderUnit)
		).length > 0;
		const action = {
			name: buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_FOCUS_FIRE_NAME'),
				Locale.compose('LOC_BETTER_ACTIONS_FOCUS_FIRE_DESCRIPTION'),
				hasEligible ? null : Locale.compose('LOC_BETTER_ACTIONS_FOCUS_FIRE_FAIL_NO_ELIGIBLE_REASON'),
			),
			icon: variant.icon,
			active: hasEligible,
			[MOD_PACK_ACTION_FLAG]: true,
			callback: () => {
				if (!hasEligible) {
					return;
				}
				InterfaceMode.switchTo(mode, { UnitID: commanderUnit.id, NativeCommand: variant.command });
			},
		};
		this.component.armyActions.push(action);
		this.component.createArmyActionButton(action);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('army-panel', (component) => new ArmyPanelFocusFireDecorator(component));

const MELEE_FOCUS_FIRE_ICON = 'blp:action_coordinatedattack.png';
// melee focus fire, just for adjacent units to enemy, not dealing with unit movement ahh, leaving commander radius.
class ArmyPanelMeleeFocusFireDecorator {
	constructor(component) {
		this.component = component;
		const originalSetupArmyActions = component.setupArmyActions.bind(component);
		component.setupArmyActions = (commanderUnit) => {
			originalSetupArmyActions(commanderUnit);
			this.maybeAddMeleeFocusFireAction(commanderUnit);
		};
	}

	maybeAddMeleeFocusFireAction(commanderUnit) {
		if (!commanderUnit?.isArmyCommander) {
			return;
		}
		const nativeCheck = Game.UnitCommands.canStart(commanderUnit.id, MELEE_ATTACK_COMMAND, {}, true);
		if (!nativeCheck?.Success) {
			return;
		}
		const action = {
			name: buildActionTooltip(
				Locale.compose('LOC_BETTER_ACTIONS_MELEE_FOCUS_FIRE_NAME'),
				Locale.compose('LOC_BETTER_ACTIONS_MELEE_FOCUS_FIRE_DESCRIPTION'),
			),
			icon: MELEE_FOCUS_FIRE_ICON,
			active: true,
			[MOD_PACK_ACTION_FLAG]: true,
			callback: () => {
				InterfaceMode.switchTo(MELEE_FOCUS_FIRE_MODE, { UnitID: commanderUnit.id });
			},
		};
		this.component.armyActions.push(action);
		this.component.createArmyActionButton(action);
	}

	beforeAttach() { }
	afterAttach() { }
	beforeDetach() { }
	afterDetach() { }
	onAttributeChanged(_name, _prev, _next) { }
}

Controls.decorate('army-panel', (component) => new ArmyPanelMeleeFocusFireDecorator(component));

// hover preview for bulk attacks, showing multiple attacks.
let strikePreviewHoverToken = 0;

async function updateStrikePreview(orderedAttackers, plot, token, getStrengthBonus, combatType = CombatTypes.COMBAT_AIR, overlayGroup = null) {
	const steps = [];
	for await (const step of simulateStrikeSequence(orderedAttackers, plot, getStrengthBonus, combatType)) {
		if (token !== strikePreviewHoverToken) {
			// Cursor moved to a different plot while this chain was still resolving — abandon it.
			return;
		}
		steps.push(step);
	}
	if (token !== strikePreviewHoverToken) {
		return;
	}
	if (steps.length === 0) {
		hideStrikePreview();
		paintFocusFireContributorBorder(overlayGroup, []);
		return;
	}
	paintFocusFireContributorBorder(overlayGroup, steps.map((s) => GameplayMap.getIndexFromLocation(s.attacker.location)));
	showMultiAttackPreview(steps);
}

function onStrikePlotCursorUpdated() {
	const currentMode = InterfaceMode.getCurrent();
	const plotCoords = PlotCursor.plotCursorCoords;
	const handler = InterfaceMode.getInterfaceModeHandler(currentMode);
	if (!plotCoords || !handler) {
		hideStrikePreview();
		return;
	}
	const plotIndex = GameplayMap.getIndexFromLocation(plotCoords);
	if (!handler.validPlots?.has(plotIndex)) {
		hideStrikePreview();
		return;
	}
	const attackers = handler.eligibleEntries
		.filter((entry) => entry.plots.has(plotIndex))
		.map((entry) => entry.unit);
	if (attackers.length === 0) {
		hideStrikePreview();
		return;
	}
	const ordered = sortJoinCandidates(attackers, attackers[0].location);
	const token = ++strikePreviewHoverToken;
	updateStrikePreview(ordered, plotCoords, token);
}

// For the preview for the real Focus Fire, we can approximate it, using flat bonuses for knowing stuff like
// unit affected by barrage or that krone memento, using gameinfo so hopefully it survives modded stuff. Oh and
// always the +2 on focus fire at least.

const FOCUSED_ATTACK_FLAT_LABEL = 'Focused Attack';

export const REAL_FOCUSED_ATTACK_INFO = {
	INTERFACEMODE_FOCUSED_ATTACK_AIR_TO_LAND: {
		classTag: GROUND_ATTACKER_CLASS, operationType: AIR_ATTACK_OPERATION, combatType: CombatTypes.COMBAT_AIR,
		flatBonus: 0, bonusCombatType: 'COMBAT_RANGED', isAirAttack: true,
	},
	INTERFACEMODE_FOCUSED_ATTACK_AIR_BOMB: {
		classTag: BOMBER_CLASS, operationType: AIR_ATTACK_OPERATION, combatType: CombatTypes.COMBAT_AIR,
		flatBonus: 0, bonusCombatType: 'COMBAT_BOMBARD', isAirAttack: true,
	},
	INTERFACEMODE_FOCUSED_ATTACK_LAND_RANGED: {
		classTags: [RANGED_CLASS, SIEGE_CLASS], operationType: RANGE_ATTACK_OPERATION, combatType: CombatTypes.COMBAT_RANGED,
		flatBonus: 2, bonusCombatType: 'COMBAT_RANGED', highlightContributors: true, scope: 'player',
	},
	// heavy naval
	INTERFACEMODE_FOCUSED_ATTACK_SEA_RANGED: {
		classTags: FOCUS_FIRE_NAVAL_CLASSES, operationType: NAVAL_ATTACK_OPERATION, combatType: CombatTypes.COMBAT_RANGED,
		flatBonus: 2, bonusCombatType: 'COMBAT_RANGED', highlightContributors: true, scope: 'player',
	},
};

function onRealFocusedAttackCursorUpdated() {
	const currentMode = InterfaceMode.getCurrent();
	const modeInfo = REAL_FOCUSED_ATTACK_INFO[currentMode];
	const plotCoords = PlotCursor.plotCursorCoords;
	const handler = InterfaceMode.getInterfaceModeHandler(currentMode);
	const contributorOverlayGroup = modeInfo?.highlightContributors ? handler?.placementCursorOverlayGroup : null;
	if (!modeInfo || !plotCoords || !handler?.validPlots) {
		hideStrikePreview();
		paintFocusFireContributorBorder(contributorOverlayGroup, []);
		return;
	}
	const plotIndex = GameplayMap.getIndexFromLocation(plotCoords);
	// The native overlay isn't ours to filter, but our own popup still shouldn't reveal a hidden
	// enemy's presence/identity, so gate it the same way the smart-strike overlay is gated.
	if (!handler.validPlots.has(plotIndex) || !plotHasWorthwhileTarget(plotIndex)) {
		hideStrikePreview();
		paintFocusFireContributorBorder(contributorOverlayGroup, []);
		return;
	}
	const commanderId = InterfaceMode.getParameters()?.UnitID;
	const commander = commanderId ? Units.get(commanderId) : null;
	if (!commander) {
		hideStrikePreview();
		paintFocusFireContributorBorder(contributorOverlayGroup, []);
		return;
	}
	let attackers;
	if (modeInfo.scope === 'player') {
		attackers = getRadiusEligiblePlayerUnits(commander, modeInfo.classTags, modeInfo.operationType)
			.filter((entry) => entry.plots.has(plotIndex))
			.map((entry) => entry.unit);
	} else {
		const army = Armies.get(commander.armyId);
		attackers = army
			? getClassEligibleAttackers(army, modeInfo.classTag, modeInfo.operationType)
				.filter((entry) => entry.plots.has(plotIndex))
				.map((entry) => entry.unit)
			: [];
	}
	if (attackers.length === 0) {
		hideStrikePreview();
		paintFocusFireContributorBorder(contributorOverlayGroup, []);
		return;
	}
	// Resolved per attacker rather than once for the strike: ability-granted bonuses live on the
	// individual units, so two attackers in the same focused attack can legitimately differ.
	const getStrengthBonus = (attacker) => getFocusedAttackBonus(
		commander, attacker, modeInfo.flatBonus, FOCUSED_ATTACK_FLAT_LABEL,
		modeInfo.bonusCombatType, modeInfo.isAirAttack);
	const ordered = sortJoinCandidates(attackers, attackers[0].location);
	const token = ++strikePreviewHoverToken;
	updateStrikePreview(ordered, plotCoords, token, getStrengthBonus, modeInfo.combatType, contributorOverlayGroup);
}

async function updateFocusFirePreview(commander, plot, token, variant, overlayGroup) {
	const steps = await buildFocusFireSteps(commander, plot);
	if (token !== strikePreviewHoverToken) {
		return;
	}
	if (steps.length === 0) {
		hideStrikePreview();
		paintFocusFireContributorBorder(overlayGroup, []);
		return;
	}
	showMultiAttackPreview(steps);
	paintFocusFireContributorBorder(overlayGroup, steps.map((s) => GameplayMap.getIndexFromLocation(s.attacker.location)));
}

function onFocusFirePlotCursorUpdated() {
	// Land and sea Focus Fire share one interface-mode class but are two separate instances (one
	// per mode name), so the handler has to be looked up for whichever one is actually current.
	const handler = InterfaceMode.getInterfaceModeHandler(InterfaceMode.getCurrent());
	const plotCoords = PlotCursor.plotCursorCoords;
	if (!plotCoords || !handler?.validPlots || !handler.commander) {
		hideStrikePreview();
		paintFocusFireContributorBorder(handler?.placementCursorOverlayGroup, []);
		return;
	}
	const plotIndex = GameplayMap.getIndexFromLocation(plotCoords);
	if (!handler.validPlots.has(plotIndex)) {
		hideStrikePreview();
		paintFocusFireContributorBorder(handler.placementCursorOverlayGroup, []);
		return;
	}
	const token = ++strikePreviewHoverToken;
	updateFocusFirePreview(handler.commander, plotCoords, token, handler.variant, handler.placementCursorOverlayGroup);
}

async function updateMeleeFocusFirePreview(commander, plot, token, overlayGroup) {
	const steps = await planMeleeFocusFire(commander, plot);
	if (token !== strikePreviewHoverToken) {
		return;
	}
	if (steps.length === 0) {
		hideStrikePreview();
		paintFocusFireContributorBorder(overlayGroup, []);
		return;
	}
	showMultiAttackPreview(steps);
	paintFocusFireContributorBorder(overlayGroup, steps.map((s) => GameplayMap.getIndexFromLocation(s.attacker.location)));
}

function onMeleeFocusFirePlotCursorUpdated() {
	const handler = InterfaceMode.getInterfaceModeHandler(InterfaceMode.getCurrent());
	const plotCoords = PlotCursor.plotCursorCoords;
	if (!plotCoords || !handler?.validPlots || !handler.commander) {
		hideStrikePreview();
		paintFocusFireContributorBorder(handler?.placementCursorOverlayGroup, []);
		return;
	}
	const plotIndex = GameplayMap.getIndexFromLocation(plotCoords);
	if (!handler.validPlots.has(plotIndex)) {
		hideStrikePreview();
		paintFocusFireContributorBorder(handler.placementCursorOverlayGroup, []);
		return;
	}
	const token = ++strikePreviewHoverToken;
	updateMeleeFocusFirePreview(handler.commander, plotCoords, token, handler.placementCursorOverlayGroup);
}

function onAnyStrikeCursorUpdated() {
	const currentMode = InterfaceMode.getCurrent();
	if (currentMode === GROUND_ATTACK_MODE || currentMode === CARPET_BOMB_MODE) {
		onStrikePlotCursorUpdated();
	} else if (currentMode === FOCUS_FIRE_LAND_MODE || currentMode === FOCUS_FIRE_SEA_MODE) {
		onFocusFirePlotCursorUpdated();
	} else if (currentMode === MELEE_FOCUS_FIRE_MODE) {
		onMeleeFocusFirePlotCursorUpdated();
	} else if (REAL_FOCUSED_ATTACK_INFO[currentMode]) {
		onRealFocusedAttackCursorUpdated();
	} else {
		hideStrikePreview();
	}
}

window.addEventListener(InterfaceModeChangedEventName, (event) => {
	const { newMode } = event.detail;
	if (
		newMode === GROUND_ATTACK_MODE || newMode === CARPET_BOMB_MODE
		|| newMode === FOCUS_FIRE_LAND_MODE || newMode === FOCUS_FIRE_SEA_MODE
		|| newMode === MELEE_FOCUS_FIRE_MODE || REAL_FOCUSED_ATTACK_INFO[newMode]
	) {
		window.addEventListener(PlotCursorUpdatedEventName, onAnyStrikeCursorUpdated);
	} else {
		window.removeEventListener(PlotCursorUpdatedEventName, onAnyStrikeCursorUpdated);
		hideStrikePreview();
	}
});

// --- Escort movement range ----------------------------------------------------------------------
// When a unit is in escort, basically, take both units movement range, and find the intersection and show only that
const UNIT_MOVEMENT_OVERLAY_GROUP = 1;

const unitDecorationManager = UnitMapDecorationSupport.manager;
const unitDecorationPrototype = Object.getPrototypeOf(unitDecorationManager);
const originalUpdateRanges = unitDecorationPrototype.updateRanges;

unitDecorationPrototype.updateRanges = function () {
	originalUpdateRanges.call(this);
	try {
		const selected = ComponentID.isValid(this.unitID) ? Units.get(this.unitID) : null;
		const partner = selected
			? (getAttachedUnit(selected) ?? getCommanderForEscort(selected))
			: null;
		if (!partner) {
			return;
		}
		const shared = getSharedEscortMovement(selected, partner);
		this.unitMovementOverlay.clear();
		if (shared.length > 0) {
			this.unitMovementOverlay.setPlotGroups(shared, UNIT_MOVEMENT_OVERLAY_GROUP);
			this.unitMovementOverlay.setGroupStyle(
				UNIT_MOVEMENT_OVERLAY_GROUP, this.unitSelectedOverlayPossibleMovementStyle
			);
		}
	} catch (error) {
		console.error('escort: could not narrow the movement range overlay:', error);
	}
};

function refreshMovementRangeOverlay() {
	if (ComponentID.isValid(unitDecorationManager.unitID)) {
		unitDecorationManager.updateRanges();
	}
}

// --- Escort pacing --------------------------------------------------------------------------------
// When doing escort, needs to ensure that a move ordered that is too long, outside of one of the units range, is
// shortened to the shorter range unit, and then full destination on the order queue.
// Returns null when nothing to change because no escort, its attacking, or its a safe destination:
function redirectEscortOrderToCommander(unitComponentID, parameters) {
	if (!ComponentID.isValid(unitComponentID) || !parameters) {
		return null;
	}
	const unit = Units.get(unitComponentID);
	const commander = unit ? getCommanderForEscort(unit) : null;
	if (!commander) {
		return null;
	}
	if (isAttackOrder(unit, parameters)) {
		return null;
	}
	return commander.id;
}

function planEscortPacedMove(unitComponentID, parameters) {
	if (!ComponentID.isValid(unitComponentID) || !parameters) {
		return null;
	}
	const commander = Units.get(unitComponentID);
	const escort = commander ? getAttachedUnit(commander) : null;
	if (!escort) {
		return null;
	}
	if (isAttackOrder(commander, parameters)) {
		return null;
	}
	const destination = { x: parameters.X, y: parameters.Y };
	if (escort.location.x !== commander.location.x || escort.location.y !== commander.location.y) {
		return { commander, destination, tile: null };
	}
	const paced = findEscortPacedDestination(commander, escort, destination);
	if (paced.isFinal) {
		return null;
	}
	return { commander, destination, tile: paced.tile };
}

// --- Cautious movement -------------------------------------------------------------------------
// stops getting ZOC locked on commanders when in fog of war, when a crabwalk one tile at a time would reveal it
const CAUTIOUS_MOVE_DRY_RUN = false;

const originalRequestMoveOperation = WorldInput.requestMoveOperation;
WorldInput.requestMoveOperation = function (unitComponentID, parameters) {
	unitComponentID = redirectEscortOrderToCommander(unitComponentID, parameters) ?? unitComponentID;
	if (isQueueModifierDown()) {
		const unit = ComponentID.isValid(unitComponentID) ? Units.get(unitComponentID) : null;
		if (unit && parameters) {
			enqueueMapOrder(unit, parameters.X, parameters.Y);
			return true;
		}
	}
	const paced = planEscortPacedMove(unitComponentID, parameters);
	if (paced && !paced.tile) {
		console.error(
			`escort: ${paced.commander.typeName} is holding for its escort; `
			+ `${paced.destination.x},${paced.destination.y} is queued for when the pair can travel.`
		);
		setPacedDestination(paced.commander, paced.destination.x, paced.destination.y);
		return true;
	}
	if (paced) {
		parameters = { ...parameters, X: paced.tile.x, Y: paced.tile.y };
	}
	const safeDestination = resolveCautiousMove(unitComponentID, parameters);
	if (safeDestination) {
		// A copy, so a caller cant mutate
		parameters = { ...parameters, X: safeDestination.x, Y: safeDestination.y };
	}
	const issued = originalRequestMoveOperation.call(this, unitComponentID, parameters);
	if (paced) {
		setPacedDestination(paced.commander, paced.destination.x, paced.destination.y);
	}
	return issued;
};

const originalSelectPlot = WorldInput.selectPlot;
WorldInput.selectPlot = function (location) {
	// Only when the production panel's button has armed a pick. A plain left-click is the one map
	// gesture that still reaches here with a settlement selected, so arming it beforehand is what
	// distinguishes "choose the rally plot" from "select whatever is on this tile".
	if (location && takeArmedRallyPick(location)) {
		return;
	}
	return originalSelectPlot.call(this, location);
};

// --- Shift+left-click ---
// has a corresponding def in frontend where inputs are registered so it can be detected
const SHIFT_CLICK_ACTION = 'sloth-shift-click';

// The rally a bare shift-click sets, default land, as most common.
const SHIFT_CLICK_RALLY_CATEGORY = RALLY_LAND;

function handleShiftClick() {
	if (Cursor.isOnUI) {
		return true;
	}
	const plot = PlotCursor.plotCursorCoords;
	if (!plot) {
		return true;
	}
	const cityId = UI.Player.getHeadSelectedCity?.();
	const city = cityId && ComponentID.isValid(cityId) ? Cities.get(cityId) : null;
	if (city) {
		const result = toggleRallyPoint(city, SHIFT_CLICK_RALLY_CATEGORY, plot);
		if (!result.ok) {
			console.warn(`action: rally not set - ${result.reason}`);
		}
		return false;
	}
	const unitId = UI.Player.getHeadSelectedUnit();
	const unit = unitId && ComponentID.isValid(unitId) ? Units.get(unitId) : null;
	if (unit) {
		enqueueMapOrder(unit, plot.x, plot.y);
		return false;
	}
	// Nothing selected, so nothing to queue or rally. Fall through rather than eating the click.
	return true;
}

const originalHandleInput = WorldInput.handleInput;
WorldInput.handleInput = function (inputEvent) {
	if (inputEvent?.detail?.name === SHIFT_CLICK_ACTION) {
		if (inputEvent.detail.status !== InputActionStatuses.FINISH) {
			return false;
		}
		return handleShiftClick();
	}
	return originalHandleInput.call(this, inputEvent);
};

// How the queue replays a stored map order.
// Escort pacing is applied here. Crab walk the commander and the escort one tile at a time, so no loss of amphibious
setMapOrderIssuer((unitComponentID, parameters) => {
	const paced = planEscortPacedMove(unitComponentID, parameters);
	if (paced && !paced.tile) {
		return;
	}
	const args = paced ? { ...parameters, X: paced.tile.x, Y: paced.tile.y } : parameters;
	const safeDestination = resolveCautiousMove(unitComponentID, args);
	originalRequestMoveOperation.call(
		WorldInput,
		unitComponentID,
		safeDestination ? { ...args, X: safeDestination.x, Y: safeDestination.y } : args
	);
});

function resolveCautiousMove(unitComponentID, parameters) {
	try {
		const unit = ComponentID.isValid(unitComponentID) ? Units.get(unitComponentID) : null;
		if (!unit || !parameters) {
			return null;
		}
		const target = { X: parameters.X, Y: parameters.Y, Modifiers: UnitOperationMoveModifiers.NONE };
		const isAttackOrder = Game.UnitOperations?.canStart(unit.id, 'UNITOPERATION_NAVAL_ATTACK', target, false).Success
			|| Game.UnitOperations?.canStart(unit.id, 'UNITOPERATION_AIR_ATTACK', target, false).Success
			|| Game.Combat.testAttackInto(unit.id, target) !== CombatTypes.NO_COMBAT
			|| Game.UnitCommands?.canStart(unit.id, 'UNITCOMMAND_ARMY_OVERRUN', target, false).Success
			|| Game.UnitOperations?.canStart(unit.id, 'UNITOPERATION_SWAP_UNITS', target, false).Success;
		if (isAttackOrder) {
			return null;
		}
		const cautious = findCautiousMoveDestination(unit, { x: parameters.X, y: parameters.Y });
		if (!cautious) {
			return null;
		}
		console.error(
			`cautious-move: ${unit.typeName} ordered to ${parameters.X},${parameters.Y} would be stopped `
			+ `by an unseen zone of control at ${cautious.stoppedBefore.x},${cautious.stoppedBefore.y}; `
			+ `${CAUTIOUS_MOVE_DRY_RUN ? 'WOULD shorten' : 'shortening'} to `
			+ `${cautious.destination.x},${cautious.destination.y}.`
		);
		return CAUTIOUS_MOVE_DRY_RUN ? null : cautious.destination;
	} catch (error) {
		console.error('cautious-move: failed to evaluate route, leaving order unchanged:', error);
		return null;
	}
}
