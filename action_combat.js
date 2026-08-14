// Needed for the multi attack commander actions as the regular preview only thinks about the current enemy health
// it also doesn't think about the damage range. Using this, makes plans for ordered attacks. Also, cant see Focus
// Fire or other commander attack bonuses.

import { ComponentID } from '/core/ui/utilities/utilities-component-id.js';
import { FOCUS_FIRE_CLASSES, RANGE_ATTACK_OPERATION, getAdjacentMeleeCandidates, getFocusFireClasses, getFocusFireOperation, getRadiusEligiblePlayerUnits, getUnitCurrentHP } from './action_model.js';

// Wraps combat-simulation API used by combat-preview panel in a Promise, listening async via SimulateCombatResult
// event.
function simulateCombatAttack(attackerUnitId, plot, combatType = CombatTypes.COMBAT_AIR) {
	return new Promise((resolve) => {
		const queryToken = Game.Combat.simulateAttackAsync(attackerUnitId, {
			Location: { x: plot.x, y: plot.y },
			X: plot.x,
			Y: plot.y,
			CombatType: combatType,
		});
		const listener = (results) => {
			if (!ComponentID.isMatch(results?.QueryToken, queryToken)) {
				return;
			}
			engine.off('SimulateCombatResult', listener);
			resolve(results);
		};
		engine.on('SimulateCombatResult', listener);
	});
}

// gets a defenders hp and name and leader etc, if unit or district.
function resolveDefenderInfo(result) {
	const defenderID = result?.Defender?.ID;
	if (!ComponentID.isValid(defenderID)) {
		return null;
	}
	const maxHP = result.Defender.MaxHitPoints ?? 0;
	// leaderType/typeName feed the combat-preview panel's target header and icon; resolved here so
	// every caller gets them consistently for units and districts alike.
	const leaderTypeOf = (owner) => {
		const player = Players.get(owner);
		return player ? GameInfo.Leaders.lookup(player.leaderType)?.LeaderType : undefined;
	};
	const district = Districts.get(defenderID);
	if (district) {
		const currentHP = Players.get(district.owner)?.Districts?.getDistrictHealth(result.Location);
		return {
			defenderID, isDistrict: true, maxHP, currentHP: currentHP ?? maxHP,
			name: Locale.compose('LOC_UI_CITY_DISTRICT_NAME'), owner: district.owner,
			leaderType: leaderTypeOf(district.owner), typeName: 'UNIT_CITY_DISTRICT',
		};
	}
	const unit = Units.get(defenderID);
	if (unit) {
		const currentHP = unit.Health ? unit.Health.maxDamage - unit.Health.damage : maxHP;
		return {
			defenderID, isDistrict: false, maxHP, currentHP, name: unit.name, owner: unit.owner,
			leaderType: leaderTypeOf(unit.owner), typeName: unit.typeName,
		};
	}
	return { defenderID, isDistrict: false, maxHP, currentHP: maxHP, name: 'the target' };
}

// because of the 0.7-1.3 range of damage, multiple attacks made errors wider. So manually calculating formula.
const COMBAT_DAMAGE_EXP_COEFFICIENT = Math.log(100 / 30) / 30;
const [COMBAT_DAMAGE_BASE, COMBAT_RANDOM_MIN_MULT, COMBAT_RANDOM_MAX_MULT, ] = [30, 0.7, 1.3];
const COMBAT_RANDOM_STEPS = 61;     // As the range is seemingly 0.70, 0.71... 1.30, thats 61 steps.

function getStrengthDifference(result, strengthBonus = 0) {
	const attackerStrength = (result?.Attacker?.CombatStrength ?? 0) + (result?.Attacker?.StrengthModifier ?? 0) + strengthBonus;
	const defenderStrength = (result?.Defender?.CombatStrength ?? 0) + (result?.Defender?.StrengthModifier ?? 0);
	return attackerStrength - defenderStrength;
}

function computeDamageRange(strengthDifference) {
	const baseDamage = COMBAT_DAMAGE_BASE * Math.exp(COMBAT_DAMAGE_EXP_COEFFICIENT * strengthDifference);
	return { base: baseDamage, min: baseDamage * COMBAT_RANDOM_MIN_MULT, max: baseDamage * COMBAT_RANDOM_MAX_MULT };
}

// one attack damage as probability distribution. Used for chance to kill.
function buildDamageDistribution(baseDamage) {
	const dist = new Map();
	const p = 1 / COMBAT_RANDOM_STEPS;
	for (let i = 0; i < COMBAT_RANDOM_STEPS; i++) {
		const mult = COMBAT_RANDOM_MIN_MULT + i * 0.01;
		const damage = Math.round(baseDamage * mult);
		dist.set(damage, (dist.get(damage) ?? 0) + p);
	}
	return dist;
}

function convolveDamageDistributions(distA, distB) {
	const result = new Map();
	for (const [dmgA, probA] of distA) {
		for (const [dmgB, probB] of distB) {
			const total = dmgA + dmgB;
			result.set(total, (result.get(total) ?? 0) + probA * probB);
		}
	}
	return result;
}

function chanceOfAtLeast(dist, threshold) {
	let chance = 0;
	for (const [damage, prob] of dist) {
		if (damage >= threshold) {
			chance += prob;
		}
	}
	return chance;
}

// used with all the built new bulk attacks and the existing aircraft bulk attacks and the focus fire.
// simulates attacks in order, showing range of damage from min to max, and chance to kill. Also adds the commander
// specific attack bonuses like +2 on Focus Fire, done with getStrengthBonus. Sadly manual. as no API for it.
// Stops simulating when lowest range of damage kills all the units.
export async function* simulateStrikeSequence(orderedAttackers, plot, getStrengthBonus = () => ({ total: 0, parts: [] }), combatType = CombatTypes.COMBAT_AIR) {
	let defender = null;
	let remainingHP = null;
	let cumulativeMin = 0;
	let cumulativeMax = 0;
	let cumulativeDistribution = new Map([[0, 1]]);
	for (const attacker of orderedAttackers) {
		const result = await simulateCombatAttack(attacker.id, plot, combatType);
		if (defender === null) {
			defender = resolveDefenderInfo(result);
			if (!defender) {
				return;
			}
			remainingHP = defender.currentHP;
		}
		// The itemised parts included so the preview can attribute bonuses like memento
		const bonus = getStrengthBonus(attacker) ?? { total: 0, parts: [] };
		const damage = computeDamageRange(getStrengthDifference(result, bonus.total));
		cumulativeMin += damage.min;
		cumulativeMax += damage.max;
		cumulativeDistribution = convolveDamageDistributions(cumulativeDistribution, buildDamageDistribution(damage.base));
		const chanceToKill = chanceOfAtLeast(cumulativeDistribution, remainingHP);
		yield {
			attacker, defender, remainingHP, damage, cumulativeMin, cumulativeMax, chanceToKill, result,
			strengthBonus: bonus.total, bonusParts: bonus.parts,
		};
		if (remainingHP - cumulativeMin <= 0) {
			return;
		}
	}
}

// Simulates every candidate once for effective strength, sort by descending, drop any with almost no dmg.
// i.e. sepoy ranged attacking a unit, with its like 5 ranged attack.
async function simulateFocusFireCandidates(units, plot, strengthBonus) {
	const results = [];
	for (const unit of units) {
		const result = await simulateCombatAttack(unit.id, plot, CombatTypes.COMBAT_RANGED);
		const defender = resolveDefenderInfo(result);
		if (!defender) {
			continue;
		}
		const effectiveStrength = (result?.Attacker?.CombatStrength ?? 0)
			+ (result?.Attacker?.StrengthModifier ?? 0) + strengthBonus;
		const damage = computeDamageRange(getStrengthDifference(result, strengthBonus));
		if (Math.round(damage.max) <= 1) {
			continue;
		}
		results.push({ unit, defender, effectiveStrength, damage, result });
	}
	results.sort((a, b) => b.effectiveStrength - a.effectiveStrength);
	return results;
}


// The dummy focus fire, doesnt get any focus fire bonuses.
//
// deal with naval attack being diff by checking commander type
export async function buildFocusFireSteps(commander, plot) {
	const plotIndex = GameplayMap.getIndexFromLocation(plot);
	const candidateUnits = getRadiusEligiblePlayerUnits(commander, getFocusFireClasses(commander), getFocusFireOperation(commander))
		.filter((entry) => entry.plots.has(plotIndex))
		.map((entry) => entry.unit);

	const simulatedCandidates = await simulateFocusFireCandidates(candidateUnits, plot, 0);
	if (simulatedCandidates.length === 0) {
		return [];
	}
	const defender = simulatedCandidates[0].defender;
	const remainingHP = defender.currentHP;
	let cumulativeMin = 0;
	let cumulativeMax = 0;
	let cumulativeDistribution = new Map([[0, 1]]);
	const steps = [];
	for (const candidate of simulatedCandidates) {
		cumulativeMin += candidate.damage.min;
		cumulativeMax += candidate.damage.max;
		cumulativeDistribution = convolveDamageDistributions(cumulativeDistribution, buildDamageDistribution(candidate.damage.base));
		const chanceToKill = chanceOfAtLeast(cumulativeDistribution, remainingHP);
		steps.push({
			attacker: candidate.unit, defender, remainingHP, damage: candidate.damage,
			cumulativeMin, cumulativeMax, chanceToKill, result: candidate.result,
		});
		if (remainingHP - cumulativeMin <= 0) {
			break;
		}
	}
	return steps;
}

// This next one is for the limited multiple melee strikes. Needs to do flanking.
const FLANK_ANGLE_BONUS = [0, 2, 3, 5];

function hexAngularStep(directionA, directionB) {
	const diff = Math.abs(directionA - directionB) % 6;
	return Math.min(diff, 6 - diff);
}

// sometimes a unit being attacked might already be flanked, so need to detect that if trying to simulate
// flanking, so dont double dip.
let flankingBonusLiteral;

function getFlankingBonusLiteral() {
	if (flankingBonusLiteral === undefined) {
		const SENTINEL = '\u0001';
		const composed = Locale.compose('LOC_COMBAT_PREVIEW_FLANKING_BONUS_DESC', SENTINEL) ?? '';
		flankingBonusLiteral = composed.split(SENTINEL)
			.reduce((longest, part) => (part.length > longest.length ? part : longest), '');
	}
	return flankingBonusLiteral;
}

function resultShowsFlankingBonus(result) {
	const literal = getFlankingBonusLiteral();
	if (!literal) {
		return false;
	}
	return (result?.Attacker?.PreviewTextAssist ?? [])
		.some((line) => typeof line === 'string' && line.includes(literal));
}

// Melee attack multiple. Different, needs to deal with return damage. Each simulated attack will not show the flank
// before an enemy is locked. SO gotta do manage that.

export async function planMeleeFocusFire(commander, targetPlot) {
	const candidates = getAdjacentMeleeCandidates(commander, targetPlot);
	if (candidates.length === 0) {
		return [];
	}
	const simulated = [];
	for (const unit of candidates) {
		const result = await simulateCombatAttack(unit.id, targetPlot, CombatTypes.NO_COMBAT);
		const defender = resolveDefenderInfo(result);
		if (!defender) {
			continue;
		}
		simulated.push({
			unit,
			result,
			defender,
			baseDamage: computeDamageRange(getStrengthDifference(result, 0)),
			hasEngineFlanking: resultShowsFlankingBonus(result),
			currentHP: getUnitCurrentHP(unit),
		});
	}
	if (simulated.length === 0) {return [];}
    // Healthiest units attack first, then hardest hitting. Order decided by pre-flanking figures.
	simulated.sort((a, b) => {
		if (a.currentHP !== b.currentHP) {
			return b.currentHP - a.currentHP;
		}
		return b.baseDamage.base - a.baseDamage.base;
	});

	const defenderAlreadyEngaged = simulated.some((candidate) => candidate.hasEngineFlanking);
	// The defender turns to face whoever hits it first, so that attacker's side of the target
	// becomes the front everyone else's angle is measured against.
	const frontDirection = GameplayMap.getDirectionToPlot(targetPlot, simulated[0].unit.location);

	const defender = simulated[0].defender;
	const remainingHP = defender.currentHP;
	let cumulativeMin = 0;
	let cumulativeMax = 0;
	let cumulativeDistribution = new Map([[0, 1]]);
	const steps = [];
	for (let index = 0; index < simulated.length; index++) {
		const candidate = simulated[index];
		let predictedFlankBonus = 0;
		if (!defenderAlreadyEngaged && index > 0) {
			const direction = GameplayMap.getDirectionToPlot(targetPlot, candidate.unit.location);
			predictedFlankBonus = FLANK_ANGLE_BONUS[hexAngularStep(direction, frontDirection)];
		}
		const strengthDifference = getStrengthDifference(candidate.result, predictedFlankBonus);
		const damage = computeDamageRange(strengthDifference);
		const returnDamage = computeDamageRange(-strengthDifference);   // Flanking also reduces damage taken
		cumulativeMin += damage.min;
		cumulativeMax += damage.max;
		cumulativeDistribution = convolveDamageDistributions(
			cumulativeDistribution, buildDamageDistribution(damage.base)
		);
		steps.push({
			attacker: candidate.unit, defender, remainingHP, result: candidate.result,
			damage, returnDamage, predictedFlankBonus,
			currentHP: candidate.currentHP,
			cumulativeMin, cumulativeMax,
			chanceToKill: chanceOfAtLeast(cumulativeDistribution, remainingHP),
		});
		if (remainingHP - cumulativeMin <= 0) {
			break;
		}
	}
	return steps;
}
