// Custom emblems on the player's commander flags.
// only affects local player

import { ComponentID } from "/core/ui/utilities/utilities-component-id.js";
import { GenericUnitFlag } from "/base-standard/ui/unit-flags/unit-flags.js";
import { UnitFlagManager } from "/base-standard/ui/unit-flags/unit-flag-manager.js";
import {
  COMMAND_KIND_FLAG_ICON,
  forgetCommand,
  getCommands,
  onCommandsRestored,
  saveCommand,
} from "./action_store.js";
import { drawPromotionGlyph } from "./action_promotion_glyph.js";
import {AUTO_COLOUR_FALLBACK, EXCLUDED_ICON_CONTEXTS, EXCLUDED_ICON_PREFIXES, ICON_AUTO_COLOURS, whitelist} from "./action_icon_data.js";

const ICON_KEY_SEPARATOR = "|";     // used to separate ID and context in one text.

// unitKey -> iconId. For none-save store.
const flagIcons = new Map();

// Built once on first use rather than at module scope, since the icon catalogue is not necessarily
// populated while this module is still evaluating.
let iconOptions = null;
let iconOptionsByKey = null;

function unitKey(unit) {
  return ComponentID.toString(unit?.id ?? {});
}

export function makeFlagIconKey(context, iconId) {
  return `${context}${ICON_KEY_SEPARATOR}${iconId}`;
}


// WHITELIST or BLACKLIST. Just use BLACKLIST for debug when I want to discover more icons for WHITELIST
const ICON_SELECTION_MODE = "WHITELIST";

function passesIconFilters(id, context) {
  if (EXCLUDED_ICON_CONTEXTS.has(context)) {
    return false;
  }
  return !EXCLUDED_ICON_PREFIXES.some((prefix) => id.startsWith(prefix));
}

// Looks one icon up directly. Returns null if the game has no icon with that ID anc context.
function resolveIcon(context, id) {
  const variants = UI.getIconData(id, context) ?? [];
  if (!variants.some((entry) => entry.context === context)) {
    return null;
  }
  const url = UI.getIconURL(id, context);
  return url ? { id: makeFlagIconKey(context, id), iconId: id, context, url } : null;
}

// When doing testing, to find em, theres tons of duplicates like great people sharing icons. So ensure theres just
// one of each texture. Shortest ID shows. Used only for BLACKLIST
function pickRepresentative(a, b) {
  if (a.iconId.length !== b.iconId.length) {
    return a.iconId.length < b.iconId.length ? a : b;
  }
  return a.iconId.localeCompare(b.iconId) <= 0 ? a : b;
}

let optionKeyByUrl = null;
const resolvedIconCache = new Map();

function buildFromWhitelist() {
  const options = [];
  const seen = new Set();
  const unmatched = [];
  for (const [context, ids] of Object.entries(whitelist)) {
    for (const id of ids) {
      const key = makeFlagIconKey(context, id);
      // The same entry listed twice would otherwise render twice.
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const option = resolveIcon(context, id);
      if (option) {
        options.push(option);
      } else {
        unmatched.push(key);
      }
    }
  }
  if (unmatched.length > 0) {
    console.error(
      `action_flag_icon: ${unmatched.length} whitelisted icon(s) do not exist in this game (wrong id, or right id under the wrong context) and were skipped: ${unmatched.join(", ")}`,
    );
  }
  return options;
}

function buildFromBlacklist() {
  const byKey = new Map();
  for (const { id, context } of UI.getIcons() ?? []) {
    const key = makeFlagIconKey(context, id);
    if (byKey.has(key) || !passesIconFilters(id, context)) {
      continue;
    }
    const url = UI.getIconURL(id, context);
    if (url) {
      byKey.set(key, { id: key, iconId: id, context, url });
    }
  }
  const byUrl = new Map();
  for (const option of byKey.values()) {
    const held = byUrl.get(option.url);
    byUrl.set(option.url, held ? pickRepresentative(held, option) : option);
  }
  return [...byUrl.values()].sort(
    (a, b) =>
      a.iconId.localeCompare(b.iconId) || a.context.localeCompare(b.context),
  );
}

function buildIconIndex() {
  iconOptions =
    ICON_SELECTION_MODE === "WHITELIST"
      ? buildFromWhitelist()
      : buildFromBlacklist();
  iconOptionsByKey = new Map(iconOptions.map((option) => [option.id, option]));
  optionKeyByUrl = new Map();
  for (const option of iconOptions) {
    if (!optionKeyByUrl.has(option.url)) {
      optionKeyByUrl.set(option.url, option.id);
    }
  }
}

function lookupIcon(key) {
  if (!key) {
    return null;
  }
  getFlagIconOptions();
  const listed = iconOptionsByKey.get(key);
  if (listed) {
    return listed;
  }
  if (!resolvedIconCache.has(key)) {
    const separator = key.indexOf(ICON_KEY_SEPARATOR);
    resolvedIconCache.set(
      key,
      separator < 0
        ? null
        : resolveIcon(key.slice(0, separator), key.slice(separator + 1)),
    );
  }
  return resolvedIconCache.get(key);
}

export function getFlagIconOptions() {
  if (!iconOptions) {
    buildIconIndex();
  }
  return iconOptions;
}

export function canonicalFlagIconKey(iconId) {
  if (!iconId) {
    return null;
  }
  getFlagIconOptions();
  if (iconOptionsByKey.has(iconId)) {
    return iconId;
  }
  const legacy = makeFlagIconKey("DEFAULT", iconId);
  if (iconOptionsByKey.has(legacy)) {
    return legacy;
  }
  const resolved = lookupIcon(iconId) ?? lookupIcon(legacy);
  if (!resolved) {
    return null;
  }
  return optionKeyByUrl.get(resolved.url) ?? resolved.id;
}

export function getFlagIconURL(iconId) {
  return lookupIcon(canonicalFlagIconKey(iconId))?.url ?? null;
}

export const PROMOTION_GLYPH_ICON = "PROMOTION_GLYPH";

export function isKnownFlagIcon(iconId) {
  return iconId === PROMOTION_GLYPH_ICON || !!getFlagIconURL(iconId);
}

// ---- Emblem colour treatment ----
// Gotta allow recolour some icons as they are full colour. Desaturation, using the coh-color-matrix.
// R_out = red   x luminance(R,G,B)
// G_out = green x luminance(R,G,B)
// B_out = blue  x luminance(R,G,B)
// A_out = A
// allows desaturation, then regrant the leader colour
// Rows are output channels, columns are input R, G, B, A and a constant offset
// Rec.709 weights, the same ones the standard grayscale() filter uses.
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722];

// 'AUTO'      - whatever ICON_AUTO_COLOURS says suits this particular artwork
// 'TINT'      - desaturate, then recolour to player's secondary colour (vanilla)
// 'GRAYSCALE' - desaturate only
// 'NONE'
//
// AUTO leads because it is the right answer for most icons and the only one that can differ per
// emblem: a flat white civ symbol wants tinting, a finished illustration does not, and asking the
// player to work that out one emblem at a time is work the data can do for them.
export const FLAG_EMBLEM_COLOUR_AUTO = "AUTO";
export const FLAG_EMBLEM_COLOUR_MODES = [FLAG_EMBLEM_COLOUR_AUTO, "TINT", "GRAYSCALE", "NONE"];
export const DEFAULT_FLAG_EMBLEM_COLOUR_MODE = FLAG_EMBLEM_COLOUR_AUTO;

export function isFlagEmblemColourMode(mode) {
  return FLAG_EMBLEM_COLOUR_MODES.includes(mode);
}

// The concrete mode AUTO stands for on a given emblem. Looked up by the full "CONTEXT|ID" first so a
// per-context choice can be made, then by the bare id so one entry can cover an icon wherever it
// appears, then the blanket fallback.
export function resolveAutoColourMode(iconId) {
  if (!iconId) {
    return AUTO_COLOUR_FALLBACK;
  }
  const byKey = ICON_AUTO_COLOURS[iconId];
  if (byKey) {
    return byKey;
  }
  const separator = iconId.indexOf(ICON_KEY_SEPARATOR);
  const bare = separator < 0 ? iconId : iconId.slice(separator + 1);
  return ICON_AUTO_COLOURS[bare] ?? AUTO_COLOUR_FALLBACK;
}

// "rgb(116, 163, 243)" -> [0.455, 0.639, 0.953].
function parseColourChannels(value) {
  const parts = String(value ?? "").match(/-?[\d.]+/g);
  if (!parts || parts.length < 3) {
    return null;
  }
  return parts.slice(0, 3).map((channel) => Number(channel) / 255);
}

function buildLuminanceTintMatrix(channels) {
  const row = (scale) =>
    LUMINANCE_WEIGHTS.map((weight) => scale * weight).concat([0, 0]);
  const matrix = [
    ...row(channels[0]),
    ...row(channels[1]),
    ...row(channels[2]),
    0,
    0,
    0,
    1,
    0,
  ];
  return `coh-color-matrix(${matrix.map((n) => n.toFixed(3)).join(", ")})`;
}

// mode may be AUTO, in which case iconId decides - so callers pass the emblem alongside the mode
// rather than resolving it themselves and getting it subtly different in each place.
export function getFlagEmblemFilter(playerId, mode = DEFAULT_FLAG_EMBLEM_COLOUR_MODE, iconId = null) {
  if (mode === FLAG_EMBLEM_COLOUR_AUTO) {
    mode = resolveAutoColourMode(iconId);
  }
  if (mode === "NONE") {
    return "none";
  }
  if (mode === "GRAYSCALE") {
    return "grayscale(1)";
  }
  const channels = Players.isValid(playerId)
    ? parseColourChannels(UI.Player.getSecondaryColorValueAsString(playerId))
    : null;
  // Without a colour to tint with, drain colour
  return channels ? buildLuminanceTintMatrix(channels) : "grayscale(1)";
}

// Mounts/removes the canvas the promotion glyph is drawn into. Larger size for the zoom and icon increase size.
const GLYPH_CANVAS_CLASS = "ap-mod-promotion-glyph";

// set on flag Root, so CSS can take back the promotion count number, by knowing it has a custom icon.
const GLYPH_FLAG_CLASS = "ap-mod-glyph-flag";

// Commander flag differs for Land Commander it's an upside down elongated pentagon, whereas others are square
const GLYPH_LAND_CLASS = "ap-mod-glyph-land";
const GLYPH_COMPACT_CLASS = "ap-mod-glyph-compact";
const GLYPH_STYLE_ID = "ap-mod-glyph-style";

// Bigger than 34px of enlarged icon, so lines stay clean when the camera zooms in and flag scales up with it.
const GLYPH_CANVAS_RESOLUTION = 96;

function injectGlyphStyle() {
  if (document.getElementById(GLYPH_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = GLYPH_STYLE_ID;
  // as theres no promotion count, to show, no need to shove icon up for that count. done using .unit-flag to
  // outspecify `.unit-flag--has-promotions .unit-flag__icon`
  style.textContent = `
		.unit-flag.${GLYPH_FLAG_CLASS} .unit-flag__level-number {
			display: none;
		}
		.unit-flag.${GLYPH_FLAG_CLASS}.${GLYPH_LAND_CLASS} .unit-flag__icon {
			left: 15%;
			top: 15%;
			width: 70%;
			height: 70%;
		}
		.unit-flag.${GLYPH_FLAG_CLASS}.${GLYPH_COMPACT_CLASS} .unit-flag__icon {
			left: 23%;
			top: 21%;
			width: 54%;
			height: 54%;
		}
	`;
  document.head.appendChild(style);
}

export function realizePromotionGlyph(iconElement, unit) {
  if (!iconElement) {
    return;
  }
  injectGlyphStyle();
  // The flagroot is flag-wide class. Icon two levels down.
  const flagRoot =
    iconElement.closest?.(".unit-flag") ??
    iconElement.parentElement?.parentElement;
  const clear = () => {
    iconElement.querySelector(`.${GLYPH_CANVAS_CLASS}`)?.remove();
    flagRoot?.classList.remove(
      GLYPH_FLAG_CLASS,
      GLYPH_LAND_CLASS,
      GLYPH_COMPACT_CLASS,
    );
  };
  if (getFlagIcon(unit) !== PROMOTION_GLYPH_ICON) {
    clear();
    return;
  }
  let canvas = iconElement.querySelector(`.${GLYPH_CANVAS_CLASS}`);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.classList.add(GLYPH_CANVAS_CLASS);
    canvas.width = GLYPH_CANVAS_RESOLUTION;
    canvas.height = GLYPH_CANVAS_RESOLUTION;
    canvas.style.setProperty("position", "absolute");
    canvas.style.setProperty("left", "0");
    canvas.style.setProperty("top", "0");
    canvas.style.setProperty("width", "100%");
    canvas.style.setProperty("height", "100%");
    iconElement.appendChild(canvas);
  }
  // no promotion commander doesn't draw it all, so fallback to original icon
  if (!drawPromotionGlyph(canvas, unit)) {
    clear();
    return;
  }
  iconElement.style.backgroundImage = "none";
  flagRoot?.classList.add(GLYPH_FLAG_CLASS);
  // need to use Domain to catch the odd shape of Land Commanders
  const isLand = GameInfo.Units.lookup(unit.type)?.Domain === "DOMAIN_LAND";
  flagRoot?.classList.toggle(GLYPH_LAND_CLASS, isLand);
  flagRoot?.classList.toggle(GLYPH_COMPACT_CLASS, !isLand);
}

export function isFlagIconCustomisable(unit) {
  return (
    !!unit && unit.owner === GameContext.localPlayerID && unit.isCommanderUnit
  );
}

export function getFlagIcon(unit) {
  if (!isFlagIconCustomisable(unit)) {
    return null;
  }
  return flagIcons.get(unitKey(unit))?.icon ?? null;
}

// How this particular commander recolours its emblem
export function getFlagColourMode(unit) {
  if (!isFlagIconCustomisable(unit)) {
    return DEFAULT_FLAG_EMBLEM_COLOUR_MODE;
  }
  return (
    flagIcons.get(unitKey(unit))?.colour ?? DEFAULT_FLAG_EMBLEM_COLOUR_MODE
  );
}

// Writes the record of customised icon, or clears it.
function writeFlagRecord(unit, icon, colour) {
  const key = unitKey(unit);
  if (icon) {
    flagIcons.set(key, { icon, colour });
    saveCommand(COMMAND_KIND_FLAG_ICON, key, { icon, colour });
  } else {
    flagIcons.delete(key);
    forgetCommand(COMMAND_KIND_FLAG_ICON, key);
  }
  refreshFlagIcon(unit);
}

// A null iconId defaults to unitflag
export function setFlagIcon(unit, iconId) {
  if (!isFlagIconCustomisable(unit)) {
    return;
  }
  const icon = iconId && isKnownFlagIcon(iconId) ? iconId : null;
  writeFlagRecord(unit, icon, getFlagColourMode(unit));
}

export function setFlagColourMode(unit, mode) {
  if (!isFlagIconCustomisable(unit) || !isFlagEmblemColourMode(mode)) {
    return;
  }
  writeFlagRecord(unit, getFlagIcon(unit), mode);
}

// Redraws a commander's flag in place
export function refreshFlagIcon(unit) {
  if (!unit) {
    return;
  }
  UnitFlagManager.instance?.getFlag(unit.id)?.realizeIcon();
}

// have to override realizeIcon so it survives redraws
const originalRealizeIcon = GenericUnitFlag.prototype.realizeIcon;
GenericUnitFlag.prototype.realizeIcon = function () {
  originalRealizeIcon.call(this);
  const unit = Units.get(this.componentID);
  const url = getFlagIconURL(getFlagIcon(unit));
  if (this.unitFlagIcon) {
    if (url) {
      this.unitFlagIcon.style.backgroundImage = `url('${url}')`;
    }
    this.unitFlagIcon.style.setProperty(
      "filter",
      url
        ? getFlagEmblemFilter(this.componentID.owner, getFlagColourMode(unit), getFlagIcon(unit))
        : "none",
    );
    // White as base if custom icon, original secondary colour if not.
    this.unitFlagIcon.style.fxsBackgroundImageTint = url
      ? "rgb(255, 255, 255)"
      : UI.Player.getSecondaryColorValueAsString(this.componentID.owner);
  }
  realizePromotionGlyph(this.unitFlagIcon, unit);
};

// Redraw when a promotion is taken for the custom icon lines.
engine.on("UnitPromoted", (data) => {
  const flag = UnitFlagManager.instance?.getFlag(data?.unit);
  if (flag) {
    realizePromotionGlyph(flag.unitFlagIcon, Units.get(data.unit));
  }
});

// clean up lost commanders? May not survive with commander respawn, hmmm. TODO
engine.on("UnitRemovedFromMap", (data) => {
  const key = ComponentID.toString(data?.unit ?? {});
  if (!flagIcons.has(key)) {
    return;
  }
  flagIcons.delete(key);
  forgetCommand(COMMAND_KIND_FLAG_ICON, key);
});

onCommandsRestored(() => {
  for (const record of getCommands(COMMAND_KIND_FLAG_ICON)) {
    // if not in set, emblem not used.
    if (!record.icon || !isKnownFlagIcon(record.icon)) {
      forgetCommand(COMMAND_KIND_FLAG_ICON, record.id);
      continue;
    }

    const unit = Units.get(ComponentID.fromString(record.id));
    if (unit && !isFlagIconCustomisable(unit)) {
      forgetCommand(COMMAND_KIND_FLAG_ICON, record.id);
      continue;
    }
    const canonical = canonicalFlagIconKey(record.icon) ?? record.icon;
    const colour = isFlagEmblemColourMode(record.colour)
      ? record.colour
      : DEFAULT_FLAG_EMBLEM_COLOUR_MODE;
    flagIcons.set(record.id, { icon: canonical, colour });
    if (canonical !== record.icon || colour !== record.colour) {
      saveCommand(COMMAND_KIND_FLAG_ICON, record.id, {
        icon: canonical,
        colour,
      });
    }
  }
  UnitFlagManager.instance?.requestFlagsRebuild();
});
