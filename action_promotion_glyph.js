// A commander's promotion record, drawn as a tiny glyph for its map flag.
// Each promotion discipline is a graph: promotions are nodes, a prerequisite is an edge, and
// spending a point unlocks other nodes to be spendable. Only draws earned promotions.
// Done with canvas. In future I could bake every possible promotion set into images and then icons? Using previewer and black/white then colouring in gimp.
// Doesnt deal with mods, but eh.
// Shared trees like logistics, since they use the same colour.
const [light_green, red, yellow, orange, light_blue] = ['#249b1c', '#a62424', '#c8c864', '#b47343', '#6496c8']
const DISCIPLINE_COLOURS = [
	['BASTION', light_green],
	['ASSAULT', red],
	['LOGISTICS', yellow],
	['MANEUVER', orange],
	['LEADERSHIP', light_blue],
	['BOMBARDMENT', red],
	['ENGAGEMENT', light_green],
	['DOGFIGHTING', light_green],
	['RAIDS', red],
	['AIRLIFT_OPERATIONS', light_blue],
	['CARRIER_OPERATIONS', light_blue],
	['TRUNG_NHI', light_blue],
];
// trung nhi light blue even though red, because shared red

const FALLBACK_COLOUR = '#e8e8e8';
const OUTLINE_COLOUR = 'rgba(0, 0, 0, 0.75)';       // Drawn under strokes so legible on top of player colour.
const MARGIN = 0.06;            // Keeps glyph clear of the flag's rounded edge.

// This was gonna be lines, but the lines were so thin, i made them so thick to be blobs and its more readable. Lines at 0.1
const LINE_WIDTH = 0.4;
const MIN_LINE_WIDTH = 1.2;
const MIN_NODE_RADIUS = 0.8;
const NODE_RADIUS_RATIO = 0.07 / LINE_WIDTH;     // So dots manage LINE_WIDTH changes.
const ISOLATED_RADIUS_RATIO = 2.0;      // deals with dots being too small to be readable if no lines

export function getDisciplineColour(disciplineType) {
	for (const [fragment, colour] of DISCIPLINE_COLOURS) {
		if (disciplineType.includes(fragment)) {
			return colour;
		}
	}
	return FALLBACK_COLOUR;
}

// disciplineType -> { nodes: Map(promotion -> {x, y}), edges: [[from, to]] }
let layoutCache = null;

function buildLayouts() {
	const graphs = new Map();
	for (const row of GameInfo.UnitPromotionDisciplineDetails) {
		const type = row.UnitPromotionDisciplineType;
		if (!graphs.has(type)) {
			graphs.set(type, { prereqs: new Map(), edges: [], order: [] });
		}
		const graph = graphs.get(type);
		for (const promotion of [row.PrereqUnitPromotion, row.UnitPromotionType]) {
			if (promotion && !graph.prereqs.has(promotion)) {
				graph.prereqs.set(promotion, []);
				graph.order.push(promotion);
			}
		}
		if (row.PrereqUnitPromotion) {
			graph.prereqs.get(row.UnitPromotionType).push(row.PrereqUnitPromotion);
			graph.edges.push([row.PrereqUnitPromotion, row.UnitPromotionType]);
		}
	}

	const depthsByType = new Map();
	let globalMaxDepth = 0;
	for (const [type, graph] of graphs) {
		const depths = assignDepths(graph);
		depthsByType.set(type, depths);
		for (const depth of depths.values()) {
			globalMaxDepth = Math.max(globalMaxDepth, depth);
		}
	}

	const layouts = new Map();
	for (const [type, graph] of graphs) {
		layouts.set(type, layoutGraph(graph, depthsByType.get(type), globalMaxDepth));
	}
	return layouts;
}

// Longest-path layering: Ensures edges point downwards even on diamonds.
function assignDepths(graph) {
	const depths = new Map();
	const visiting = new Set();
	const depthOf = (promotion) => {
		if (depths.has(promotion)) {
			return depths.get(promotion);
		}
		if (visiting.has(promotion)) {
			return 0;
		}
		visiting.add(promotion);
		let depth = 0;
		for (const prereq of graph.prereqs.get(promotion) ?? []) {
			depth = Math.max(depth, depthOf(prereq) + 1);
		}
		visiting.delete(promotion);
		depths.set(promotion, depth);
		return depth;
	};
	for (const promotion of graph.order) {
		depthOf(promotion);
	}
	return depths;
}

function layoutGraph(graph, depths, globalMaxDepth) {
	const rows = [];
	for (const promotion of graph.order) {
		const depth = depths.get(promotion);
		(rows[depth] = rows[depth] ?? []).push(promotion);
	}
	const ownMaxDepth = Math.max(0, rows.length - 1);
	const available = 1 - 2 * MARGIN;
	const span = globalMaxDepth === 0 ? 0 : available * (ownMaxDepth / globalMaxDepth);
	const top = MARGIN + (available - span) / 2;
	const rowHeight = ownMaxDepth === 0 ? 0 : span / ownMaxDepth;

	const nodes = new Map();
	for (let depth = 0; depth < rows.length; depth++) {
		const row = rows[depth] ?? [];
        // ordered by avg x of prereqs, to stop diamond crossing.
		const barycentre = new Map(row.map((promotion) => {
			const placed = (graph.prereqs.get(promotion) ?? [])
				.map((prereq) => nodes.get(prereq)?.x)
				.filter((x) => x !== undefined);
			return [promotion, placed.length
				? placed.reduce((sum, x) => sum + x, 0) / placed.length
				: 0.5];
		}));
		const sorted = [...row].sort((a, b) => (barycentre.get(a) - barycentre.get(b))
			|| (graph.order.indexOf(a) - graph.order.indexOf(b)));

		const y = ownMaxDepth === 0 ? 0.5 : top + rowHeight * depth;
		sorted.forEach((promotion, index) => {
			const x = sorted.length === 1
				? 0.5
				: MARGIN + (1 - 2 * MARGIN) * (index / (sorted.length - 1));
			nodes.set(promotion, { x, y });
		});
	}
	return { nodes, edges: graph.edges };
}

export function getDisciplineLayout(disciplineType) {
	if (!layoutCache) {
		layoutCache = buildLayouts();
	}
	return layoutCache.get(disciplineType) ?? null;
}

// disciplineType -> Set(promotionType)
export function getEarnedByDiscipline(unit) {
	const earned = new Map();
	const entries = unit?.Experience?.getAllPromotions?.() ?? [];
	for (const entry of entries) {
		const discipline = GameInfo.UnitPromotionDisciplines.lookup(entry.disciplineType)
			?.UnitPromotionDisciplineType;
		const promotion = GameInfo.UnitPromotions.lookup(entry.promotionType)?.UnitPromotionType;
		if (!discipline || !promotion) {
			continue;
		}
		if (!earned.has(discipline)) {
			earned.set(discipline, new Set());
		}
		earned.get(discipline).add(promotion);
	}
	return earned;
}

// layout of disciplines within graphic
const ROW_PLANS = {
	1: [1],
	2: [2],
	3: [2, 1],
	4: [2, 2],
	5: [3, 2],
};

function getRowPlan(count) {
	return ROW_PLANS[count] ?? [Math.ceil(count / 2), Math.floor(count / 2)].filter((n) => n > 0);
}

function getCells(count, size) {
	const rows = getRowPlan(count);
	const columns = Math.max(...rows);
	const cellWidth = size / columns;
	const cellHeight = size / rows.length;
	const cells = [];
	rows.forEach((rowCount, row) => {
		const inset = (size - rowCount * cellWidth) / 2;
		for (let column = 0; column < rowCount; column++) {
			cells.push({
				x: inset + column * cellWidth,
				y: row * cellHeight,
				width: cellWidth,
				height: cellHeight,
			});
		}
	});
	return cells;
}

export function drawPromotionGlyph(canvas, unit) {
	const context = canvas?.getContext?.('2d');
	if (!context) {
		return false;
	}
	const size = canvas.width;
	context.clearRect(0, 0, size, canvas.height);

	const earned = getEarnedByDiscipline(unit);
	if (earned.size === 0) {
		return false;
	}

	const disciplines = [...earned.keys()].sort();
	const cells = getCells(disciplines.length, size);
	context.lineCap = 'round';
	context.lineJoin = 'round';

	disciplines.forEach((discipline, index) => {
		const layout = getDisciplineLayout(discipline);
		const cell = cells[index];
		if (!layout || !cell) {
			return;
		}
		const held = earned.get(discipline);

		// single promotion with no edges gets to be bigger.
		const heldEdges = layout.edges.filter(([from, to]) => held.has(from) && held.has(to));
		const connected = new Set();
		for (const [from, to] of heldEdges) {
			connected.add(from);
			connected.add(to);
		}
		const isolated = [...held].filter((promotion) => !connected.has(promotion));

		// Sized off the cell not whole canvas.
		const extent = Math.min(cell.width, cell.height);
		const width = Math.max(MIN_LINE_WIDTH, extent * LINE_WIDTH);
		const nodeRadius = Math.max(MIN_NODE_RADIUS, width * NODE_RADIUS_RATIO);
		const isolatedRadius = nodeRadius * ISOLATED_RADIUS_RATIO;

		// Measure the bounding box of what to be drawn, and centre it in cell.
		const inked = [];
		for (const promotion of held) {
			const node = layout.nodes.get(promotion);
			if (!node) {
				continue;
			}
			// how far this node's ink reaches past its centre, including edges.
			const reach = (isolated.includes(promotion) ? isolatedRadius : nodeRadius)
				+ Math.max(0.8, width * 0.55) + width / 2;
			inked.push({
				promotion,
				x: cell.x + node.x * cell.width,
				y: cell.y + node.y * cell.height,
				reach,
			});
		}
		if (inked.length === 0) {
			return;
		}
		const minX = Math.min(...inked.map((n) => n.x - n.reach));
		const maxX = Math.max(...inked.map((n) => n.x + n.reach));
		const minY = Math.min(...inked.map((n) => n.y - n.reach));
		const maxY = Math.max(...inked.map((n) => n.y + n.reach));

		// shrink cells that are too large.
		const fit = Math.min(1, cell.width / (maxX - minX), cell.height / (maxY - minY));
		const boxCentreX = (minX + maxX) / 2;
		const boxCentreY = (minY + maxY) / 2;
		const cellCentreX = cell.x + cell.width / 2;
		const cellCentreY = cell.y + cell.height / 2;
		const positions = new Map(inked.map((n) => [n.promotion, [
			cellCentreX + (n.x - boxCentreX) * fit,
			cellCentreY + (n.y - boxCentreY) * fit,
		]]));
		const place = (promotion) => positions.get(promotion) ?? null;

		const scaledWidth = width * fit;
		const scaledNodeRadius = nodeRadius * fit;
		const scaledIsolatedRadius = isolatedRadius * fit;
		const colour = getDisciplineColour(discipline);
		// 2nd pass so backing done early, so no cutting across edges
		for (const pass of [0, 1]) {
			context.strokeStyle = pass === 0 ? OUTLINE_COLOUR : colour;
			context.fillStyle = pass === 0 ? OUTLINE_COLOUR : colour;
			context.lineWidth = pass === 0
				? scaledWidth + Math.max(0.8, width * 0.55) * fit
				: scaledWidth;
			for (const [from, to] of heldEdges) {
				const a = place(from);
				const b = place(to);
				if (!a || !b) {
					continue;
				}
				context.beginPath();
				context.moveTo(a[0], a[1]);
				context.lineTo(b[0], b[1]);
				context.stroke();
			}
			const backing = pass === 0 ? Math.max(0.5, width * 0.3) * fit : 0;
			for (const promotion of connected) {
				const point = place(promotion);
				if (!point) {
					continue;
				}
				context.beginPath();
				context.arc(point[0], point[1], scaledNodeRadius + backing, 0, Math.PI * 2);
				context.fill();
			}
			for (const promotion of isolated) {
				const point = place(promotion);
				if (!point) {
					continue;
				}
				context.beginPath();
				context.arc(point[0], point[1], scaledIsolatedRadius + backing, 0, Math.PI * 2);
				context.fill();
			}
		}
	});
	return true;
}
