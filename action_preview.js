// Multi-attack combat preview panel. Just UI and rendering with DOM.
// Pure rendering: it takes an array of plan steps and emits

import { SetIsPlotTooltipVisible } from '/base-standard/ui-next/tooltips/plot-tooltip/plot-tooltip.js';
import ViewManager from '/core/ui/views/view-manager.js';

const STRIKE_PREVIEW_ELEMENT_ID = 'ap-mod-strike-preview';

function ensureStrikePreviewElement() {
	if (ViewManager.current.getName() == "Unit") SetIsPlotTooltipVisible(false);
	let el = document.getElementById(STRIKE_PREVIEW_ELEMENT_ID);
	if (el) {
		return el;
	}
	el = document.createElement('div');
	el.id = STRIKE_PREVIEW_ELEMENT_ID;
    // backing panel so ui elements dont have distracting background.
	el.style.cssText = `
		position: fixed;
		pointer-events: none;
		z-index: 1000;
		display: none;
		padding: 1.3rem 1.5rem;
		color: #fff;
		font-size: 0.85rem;
		background-color: rgb(21, 19, 17);
		border: 0.06rem solid rgba(255, 255, 255, 0.28);
		border-radius: 0.9rem 0 0 0.9rem;
	`;
	document.body.appendChild(el);
	return el;
}

export function hideStrikePreview() {
	if (ViewManager.current.getName() == "Unit") SetIsPlotTooltipVisible(true);
	const el = document.getElementById(STRIKE_PREVIEW_ELEMENT_ID);
	if (el) {
		el.style.display = 'none';
	}
}

// Anchored above the army-panel action row the pack unpack buttons are. G
function positionStrikePreview(el) {
    // pinned to right edge of screen growing left. TODO: At some point will do a slide out?
	el.style.left = 'auto';
	el.style.right = '0';
	// Still clamped, so a large attacker stack runs out of room rather than off the left edge.
	el.style.maxWidth = `${Math.max(320, window.innerWidth)}px`;
	const actionsRow = document.querySelector('army-panel .army-panel__standard-actions');
	if (!actionsRow) {
		el.style.top = '';
		el.style.bottom = '8rem';
		el.style.transform = 'none';
		return;
	}
	const rect = actionsRow.getBoundingClientRect();
	el.style.bottom = '';
	el.style.top = `${rect.top - 8}px`;
	el.style.transform = 'translateY(-100%)';
}

// --- Multi-attack combat preview ------------------------------------------------------------
// Every PreviewText* bucket the engine populates, same as base
const PREVIEW_TEXT_FIELDS = [
	'PreviewTextHealth', 'PreviewTextInterceptor', 'PreviewTextAntiAir', 'PreviewTextTerrain',
	'PreviewTextOpponent', 'PreviewTextModifier', 'PreviewTextAssist', 'PreviewTextPromotion',
	'PreviewTextDefenses', 'PreviewTextResources',
];

// PANEL_FRAME: ornate filigree border and opaque middle with fill.
const PANEL_FRAME = 'fs://game/hud_unit-panel_box-bg';
const SECTION_LINE = 'fs://game/hud_section-line';

// slices are 30px top/bottom, 20 px sides, pushed out, so 13px vert, 7 px horiz. Wanted a bit of intrusion into box
const CARD_STYLE = `border-image-source:url("${PANEL_FRAME}"); border-image-slice:30 20 30 20 fill;
	border-image-width:auto; border-image-outset:17 13 17 13;`;

const DIVIDER_STYLE = `height:0.9rem; width:100%; margin:0.35rem 0; border-image-source:url("${SECTION_LINE}");
	border-image-slice:12 32 2 32; border-image-width:auto;`;

const ACCENT_COLOR = '#ffbadd';
const METER_SKEW_DEG = 30;      // healthbars lean, skewing opposite way. done by sign. Attacker left-high
const ATTACKER_METER_SKEW = `transform-origin:0% 100%; transform:skewY(${METER_SKEW_DEG}deg);`;
const DEFENDER_METER_SKEW = `transform-origin:100% 100%; transform:skewY(${-METER_SKEW_DEG}deg);`;
const DEFENDER_MARKER_UNSKEW = `skewY(${METER_SKEW_DEG}deg)`;       // need inverse for icons inside to offset
const HEALTH_FLASH_STYLE_ID = 'ap-mod-health-flash-style';
const HEALTH_FLASH_CLASS = 'ap-mod-health-flash';

// pulse of lost health
function injectHealthFlashStyle() {
	if (document.getElementById(HEALTH_FLASH_STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = HEALTH_FLASH_STYLE_ID;
	style.textContent = `
		@keyframes ap-mod-health-flash {
			0% { opacity: 1; }
			100% { opacity: 0.375; }
		}
		.${HEALTH_FLASH_CLASS} {
			animation-name: ap-mod-health-flash;
			animation-duration: 0.5s;
			animation-direction: alternate;
			animation-iteration-count: infinite;
			animation-timing-function: ease-in;
		}
	`;
	document.head.appendChild(style);
}
// cycle 3 colours, R, O, Y so consecutive attacks are distinct.
// splits into 2 rows past 3 attacks TODO how deal with more than 6?
const MANY_ATTACKERS_THRESHOLD = 3;
const ATTACKER_METER_HEIGHT_REM = 11;
const ATTACKER_METER_HEIGHT_COMPACT_REM = 5.5;

const DAMAGE_BAND_COLORS = ['rgb(178, 44, 44)', 'rgb(216, 118, 32)', 'rgb(226, 194, 52)'];

const REMAINING_HEALTH_COLOR = 'rgb(74, 160, 66)';

// The base preview's health red, used for the slice an attacker is about to lose.
const HEALTH_CURRENT = 'rgb(136, 41, 47)';

function collectPreviewLines(side) {
	const lines = [];
	for (const field of PREVIEW_TEXT_FIELDS) {
		for (const line of side?.[field] ?? []) {
			if (typeof line === 'string' && line.length > 0) {
				lines.push(line);
			}
		}
	}
	return lines;
}

function makeDiv(cssText, html) {
	const div = document.createElement('div');
	div.style.cssText = cssText;
	if (html !== undefined) {
		div.innerHTML = html;
	}
	return div;
}

// show initial base strength, and type, like melee or ranged or bombard.
function combatStrengthLabel(side) {
	const strengthType = side?.CombatStrengthType;
	if (strengthType === CombatStrengthTypes.STRENGTH_RANGED) {
		return Locale.compose('LOC_COMBAT_PREVIEW_RANGED_STRENGTH');
	}
	if (strengthType === CombatStrengthTypes.STRENGTH_BOMBARD) {
		return Locale.compose('LOC_COMBAT_PREVIEW_BOMBARD_STRENGTH');
	}
	return Locale.compose('LOC_COMBAT_PREVIEW_MELEE_STRENGTH');
}

function baseStrengthEntry(side) {
	return { text: `${side?.CombatStrength ?? 0}: ${combatStrengthLabel(side)}` };
}

function makeIconImg(src, sizeRem) {
	const img = document.createElement('img');
	img.src = src;
	img.style.cssText = `width:${sizeRem}rem; height:${sizeRem}rem; flex-shrink:0;`;
	return img;
}

function unitIconMarkup(unit) {
	return Locale.stylize(`[icon:${unit.typeName}]`);
}

// Attacker card title. Colour swatch matching the attack on healthbar. Unit icon, total combat strength.
// Swatch is a div because font could affect it then.
function buildAttackerTitleNode(step, color) {
	const title = makeDiv(`display:flex; flex-direction:row; align-items:center;
		justify-content:flex-end; flex-wrap:wrap;`);
	title.appendChild(makeDiv(
		`width:0.55rem; height:0.55rem; flex-shrink:0; background-color:${color}; margin-right:0.3rem;`
	));
	title.appendChild(makeDiv(
		'display:flex; flex-direction:row; align-items:center; font-size:1rem; margin-right:0.25rem;',
		unitIconMarkup(step.attacker)
	));
	title.appendChild(makeIconImg('blp:Action_Attack.png', 0.9));
    // Focused attack bonus added here.
	const strength = (step.result?.Attacker?.CombatStrength ?? 0)
		+ (step.result?.Attacker?.StrengthModifier ?? 0) + (step.strengthBonus ?? 0);
	title.appendChild(makeDiv('font-size:0.9rem; color:#fff; margin-left:0.15rem;', String(strength)));
	return title;
}
// Attackers health. No need for stacking. For ranged, no health change.
function buildAttackerHealthMeter(step, heightRem = ATTACKER_METER_HEIGHT_REM) {
	injectHealthFlashStyle();
	const health = step.attacker?.Health;
	const maxHP = Math.max(1, health?.maxDamage ?? step.result?.Attacker?.MaxHitPoints ?? 100);
	const currentHP = health ? health.maxDamage - health.damage : maxHP;
	const worstRemaining = step.returnDamage ? Math.max(0, currentHP - step.returnDamage.max) : currentHP;
	const wrap = makeDiv(`position:relative; width:1.6rem; height:${heightRem}rem; flex-shrink:0; margin:1rem -0.8rem;`);
	const bar = makeDiv(`position:absolute; right:0; top:0; width:1.6rem; height:100%;
		background-color:transparent; border:0.06rem solid rgba(255,255,255,0.75);
		${ATTACKER_METER_SKEW}`);
	wrap.appendChild(bar);
	if (worstRemaining < currentHP) {
		const lost = makeDiv(`position:absolute; left:0; width:100%;
			bottom:${(worstRemaining / maxHP) * 100}%; height:${((currentHP - worstRemaining) / maxHP) * 100}%;
			background-color:${HEALTH_CURRENT};`);
		lost.classList.add(HEALTH_FLASH_CLASS);
		bar.appendChild(lost);
	}
	bar.appendChild(makeDiv(`position:absolute; left:0; bottom:0; width:100%;
		height:${(worstRemaining / maxHP) * 100}%; background-color:${REMAINING_HEALTH_COLOR};`));
	return wrap;
}

// Header as portrait, unit icon,name, strength, current health.
function buildStatStack(iconTag, valueText) {
	const box = makeDiv('display:flex; flex-direction:column; align-items:center; margin-right:0.45rem;');
	box.appendChild(makeDiv(
		'display:flex; flex-direction:row; align-items:center; font-size:0.9rem; line-height:1;',
		Locale.stylize(iconTag)
	));
	box.appendChild(makeDiv('font-size:0.85rem; color:#fff; line-height:1.2;', valueText));
	return box;
}

function buildTargetTitleNode(defenderInfo, defenderSide) {
	const title = makeDiv('display:flex; flex-direction:row; align-items:center;');
	const iconUrl = defenderInfo.leaderType ? UI.getIconURL(defenderInfo.leaderType, 'LEADER') : null;
	if (iconUrl) {
		title.appendChild(makeDiv(`width:1.7rem; height:1.7rem; flex-shrink:0; border-radius:50%;
			border:0.05rem solid rgba(255,255,255,0.5); background-size:cover; background-position:center;
			background-image:url('${iconUrl}'); margin-right:0.3rem;`));
	}
	if (defenderInfo.typeName) {
		title.appendChild(makeDiv(
			'display:flex; flex-direction:row; align-items:center; font-size:1rem; margin-right:0.25rem;',
			unitIconMarkup(defenderInfo)
		));
	}
	const nameNode = makeDiv(`font-size:0.8rem; color:${ACCENT_COLOR}; margin-right:0.4rem;`, defenderInfo.name);
	nameNode.classList.add('font-title');
	title.appendChild(nameNode);
	const strength = (defenderSide?.CombatStrength ?? 0) + (defenderSide?.StrengthModifier ?? 0);
	title.appendChild(buildStatStack('[icon:SLTH_DEFEND]', String(strength)));
    // assume 100 as max
	const currentHP = Math.round(defenderInfo.currentHP);
	const maxHP = Math.round(defenderInfo.maxHP);
	if (maxHP !== 100) {
		title.appendChild(buildStatStack('[icon:DAMAGED]', `${currentHP}/${maxHP}`));
	} else if (currentHP < maxHP) {
		title.appendChild(buildStatStack('[icon:DAMAGED]', String(currentHP)));
	}
	return title;
}


function buildModifierCard(titleNode, lineEntries, alignRight) {
	const card = makeDiv(`position:relative; z-index:1; display:flex; flex-direction:column; ${alignRight ? 'align-items:flex-end;' : ''}
		min-width:10rem; max-width:16rem; padding:1.1rem 1.3rem; ${CARD_STYLE}`);
	card.appendChild(titleNode);
	card.appendChild(makeDiv(DIVIDER_STYLE));
	for (const entry of lineEntries) {
		if (entry.divider) {
			card.appendChild(makeDiv(DIVIDER_STYLE));
			continue;
		}
		const row = makeDiv(`display:flex; flex-direction:row; align-items:center; flex-wrap:wrap;
			width:100%; ${alignRight ? 'justify-content:flex-end;' : ''} font-size:0.8rem; line-height:1.5;
			margin:0.1rem 0;`);
		row.classList.add('font-body');
		if (entry.iconsHtml) {
			row.appendChild(makeDiv('display:flex; flex-direction:row; align-items:center; margin-right:0.25rem;', entry.iconsHtml));
		}
		row.appendChild(makeDiv(
			`white-space:normal; overflow-wrap:anywhere; ${alignRight ? 'text-align:right;' : ''}`,
			Locale.stylize(entry.text)
		));
		card.appendChild(row);
	}
	return card;
}

// The defender's health meter, split into one band per attacker. Each band spans from the health
// left after that attack up to the health it started at, so they read bottom-up in attack order,
// with the attacker's own icon pinned at the band's top edge.
function buildDamageMeter(steps, defenderInfo) {
	const maxHP = Math.max(1, defenderInfo.maxHP || 1);
	const totalExpected = steps.reduce((sum, step) => sum + step.damage.base, 0);
	const afterAll = Math.max(0, defenderInfo.currentHP - totalExpected);

	const wrap = makeDiv('position:relative; width:1.6rem; height:11rem; flex-shrink:0; margin:1rem -0.8rem 1rem 1rem;');
	injectHealthFlashStyle();
	const bar = makeDiv(`position:absolute; right:0; top:0; width:1.6rem; height:100%;
		background-color:transparent; border:0.06rem solid rgba(255,255,255,0.75);
		${DEFENDER_METER_SKEW}`);
	wrap.appendChild(bar);

	bar.appendChild(makeDiv(`position:absolute; left:0; bottom:0; width:100%;
		height:${(afterAll / maxHP) * 100}%; background-color:${REMAINING_HEALTH_COLOR};`));

	let remaining = defenderInfo.currentHP;
	steps.forEach((step, index) => {
		if (remaining <= 0) {
			return;
		}
		const before = remaining;
		const after = Math.max(0, before - step.damage.base);
		remaining = after;
		const band = makeDiv(`position:absolute; left:0; width:100%;
			bottom:${(after / maxHP) * 100}%; height:${((before - after) / maxHP) * 100}%;
			background-color:${DAMAGE_BAND_COLORS[index % DAMAGE_BAND_COLORS.length]};
			border-top:0.05rem solid rgba(0,0,0,0.55);`);
		band.classList.add(HEALTH_FLASH_CLASS);
		bar.appendChild(band);
		// Overlaid directly on its own band, at the band's midpoint. Uses offset skew to fix icon skew from inheritance.
		const marker = makeDiv(`position:absolute; left:50%; bottom:${((before + after) / 2 / maxHP) * 100}%;
			transform:translate(-50%, 50%) ${DEFENDER_MARKER_UNSKEW};
			display:flex; flex-direction:row; align-items:center; font-size:1rem; line-height:1;`,
			unitIconMarkup(step.attacker));
		bar.appendChild(marker);
	});

	// Two unlabelled notches bounding min range and max over all attacks.
	const lastStep = steps[steps.length - 1];
	const notchLevels = [
		defenderInfo.currentHP - (lastStep?.cumulativeMin ?? 0),
		defenderInfo.currentHP - (lastStep?.cumulativeMax ?? 0),
	];
	for (const level of notchLevels) {
		const clamped = Math.min(defenderInfo.currentHP, Math.max(0, level));
		bar.appendChild(makeDiv(`position:absolute; left:0; width:100%; height:0.12rem;
			bottom:${(clamped / maxHP) * 100}%; transform:translateY(50%); background-color:#ffffff;
			border-top:0.04rem solid rgba(0,0,0,0.85); border-bottom:0.04rem solid rgba(0,0,0,0.85);`));
	}

	return wrap;
}

// Overall chance the sequence kills the unit
function buildKillChanceNode(steps) {
	if (!steps || steps.length === 0) {
		return null;
	}
	const killPercent = Math.round((steps[steps.length - 1]?.chanceToKill ?? 0) * 100);
	const box = makeDiv(`display:flex; flex-direction:row; align-items:center; margin-top:0.2rem;`);
	box.appendChild(makeIconImg('blp:Action_Delete.png', 1.1));
	box.appendChild(makeDiv('font-size:1.05rem; color:#fff; margin-left:0.3rem;', `${killPercent}%`));
	return box;
}

// Gathers defender side modifiers so all those that are like are not duplicated. Those attacks that only apply
// to some units, like say +5 vs Infantry would have a little icon of the unit flags involved.
function partitionTargetModifiers(steps) {
	const perStepLines = steps.map((step) => collectPreviewLines(step.result?.Defender));
	const ownersByLine = new Map();
	perStepLines.forEach((lines, index) => {
		for (const line of new Set(lines)) {
			if (!ownersByLine.has(line)) {
				ownersByLine.set(line, []);
			}
			ownersByLine.get(line).push(steps[index].attacker);
		}
	});
	const common = [];
	const specific = [];
	for (const [line, owners] of ownersByLine) {
		if (owners.length === steps.length) {
			common.push({ text: line });
		} else {
			specific.push({ text: line, iconsHtml: owners.map(unitIconMarkup).join('') });
		}
	}
	return { common, specific };
}

export function showMultiAttackPreview(steps) {
	if (!steps || steps.length === 0) {
		hideStrikePreview();
		return;
	}
	const el = ensureStrikePreviewElement();
	el.innerHTML = '';

	const defenderInfo = steps[0].defender;
	const defenderSide = steps[0].result?.Defender;

	const useTwoRows = steps.length > MANY_ATTACKERS_THRESHOLD;
	const row = makeDiv(`display:flex; flex-direction:row; align-items:${useTwoRows ? 'center' : 'flex-start'};`);

	// Each attacker is one group of [breakdown, meter], so meter always sits on the side facing
	// the defender. Groups are laid out in reverse, putting attacker 1 nearest the defender and later
	// attackers further out.
	const meterHeight = useTwoRows ? ATTACKER_METER_HEIGHT_COMPACT_REM : ATTACKER_METER_HEIGHT_REM;
	const groups = steps.map((step, index) => {
		const color = DAMAGE_BAND_COLORS[index % DAMAGE_BAND_COLORS.length];
		const lines = [baseStrengthEntry(step.result?.Attacker),
			...collectPreviewLines(step.result?.Attacker).map((text) => ({ text }))];
		// One line per contributing source, we gotta do this since its manual, as focus fire type effects are.
		for (const part of step.bonusParts ?? []) {
			lines.push({ text: `+${part.amount} ${part.label}` });
		}
		const group = makeDiv('display:flex; flex-direction:row; align-items:flex-start;');
		group.appendChild(buildModifierCard(buildAttackerTitleNode(step, color), lines, true));
		group.appendChild(buildAttackerHealthMeter(step, meterHeight));
		return group;
	});

	const makeAttackerRow = () => makeDiv(`display:flex; flex-direction:row-reverse; align-items:flex-start;
		flex-wrap:wrap; justify-content:flex-end; min-width:0;`);
	let attackers;
	if (useTwoRows) {
		attackers = makeDiv('display:flex; flex-direction:column; align-items:flex-end; min-width:0;');
		const perRow = Math.ceil(groups.length / 2);
		for (const slice of [groups.slice(0, perRow), groups.slice(perRow)]) {
			const attackerRow = makeAttackerRow();
			slice.forEach((group) => attackerRow.appendChild(group));
			attackers.appendChild(attackerRow);
		}
	} else {
		attackers = makeAttackerRow();
		groups.forEach((group) => attackers.appendChild(group));
	}
	row.appendChild(attackers);

	row.appendChild(buildDamageMeter(steps, defenderInfo));

	const { common, specific } = partitionTargetModifiers(steps);
	const targetLines = [baseStrengthEntry(defenderSide), ...common];
	if (specific.length > 0) {
		// Everything below the rule applies to only some of the attacks, tagged with whose.
		targetLines.push({ divider: true });
		targetLines.push(...specific);
	}
	const targetColumn = makeDiv('display:flex; flex-direction:column; align-items:stretch;');
	const targetCard = buildModifierCard(buildTargetTitleNode(defenderInfo, defenderSide), targetLines, false);
	const killNode = buildKillChanceNode(steps);
	if (killNode) {
		// Below a rule at the foot of the defender's own breakdown
		targetCard.appendChild(makeDiv(DIVIDER_STYLE));
		targetCard.appendChild(killNode);
	}
	targetColumn.appendChild(targetCard);
	row.appendChild(targetColumn);

	el.appendChild(row);
	positionStrikePreview(el);
	el.style.display = 'block';
}
