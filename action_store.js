// save load persistence using catalog. Async writes, cant trust immediate read. So only use it for that
// have other data structures for live use

import { Catalog } from '/core/ui/utilities/utility-serialize.js';
const CATALOG_NAME = 'SlothActionPanelMod';
const CATALOG_VERSION = 1;          // in case we need an update with breaking changes
export const COMMAND_KIND_REINFORCE = 'REINFORCE';
export const COMMAND_KIND_ATTACH = 'ATTACH';
export const COMMAND_KIND_QUEUE = 'QUEUE';
export const COMMAND_KIND_RALLY = 'RALLY';
export const COMMAND_KIND_FLAG_ICON = 'FLAG_ICON';
export const COMMAND_KIND_ALERT = 'ALERT';

// Every kind restored at load.
const COMMAND_KINDS = [
	COMMAND_KIND_REINFORCE, COMMAND_KIND_ATTACH, COMMAND_KIND_QUEUE, COMMAND_KIND_RALLY,
	COMMAND_KIND_FLAG_ICON, COMMAND_KIND_ALERT,
];

// kind -> Map(id -> data). what gets used while playing
const commandCache = new Map(COMMAND_KINDS.map((kind) => [kind, new Map()]));

const restoreListeners = [];
let restored = false;
let catalog = null;

// Lazy as worry the player might not be available at this point. Oh god hotseat
function getCatalog() {
	if (!catalog) {
		catalog = new Catalog({
			name: CATALOG_NAME,
			version: CATALOG_VERSION,
			player: Players.get(GameContext.localPlayerID),
		});
	}
	return catalog;
}

function cacheFor(kind) {
	if (!commandCache.has(kind)) {
		commandCache.set(kind, new Map());
	}
	return commandCache.get(kind);
}

export function saveCommand(kind, id, data) {
	cacheFor(kind).set(id, data);
	try {
		getCatalog().getObject(kind).write(id, JSON.stringify({ version: CATALOG_VERSION, ...data }));
	} catch (error) {
		console.error(`action_store: could not persist '${kind}' command '${id}':`, error);
	}
}

export function forgetCommand(kind, id) {
	cacheFor(kind).delete(id);
	try {
		const store = getCatalog().getObject(kind);     // clear the value and drop the key from the objects id list
		store.write(id, null);
		store.childrenIDs?.delete(id);
	} catch (error) {
		console.error(`action_store: could not clear '${kind}' command '${id}':`, error);
	}
}

export function getCommands(kind) {
	return [...cacheFor(kind)].map(([id, data]) => ({ id, ...data }));
}

export function onCommandsRestored(callback) {
    // helps late load listeners registered after the action store is restored from save, so no race
	if (restored) {
		callback();
		return;
	}
	restoreListeners.push(callback);
}


export function refreshFromStore() {
	restoreFromStore();
}

function restoreFromStore() {
	for (const kind of COMMAND_KINDS) {
		const cache = cacheFor(kind);
		cache.clear();
		try {
			const store = getCatalog().getObject(kind);
			for (const id of store.getKeys()) {
				const raw = store.read(id);
				if (!raw) {
					continue;
				}
				const data = JSON.parse(raw);
				if (data?.version !== CATALOG_VERSION) {
					continue;
				}
				cache.set(id, data);
			}
		} catch (error) {
			console.error(`action_store: could not restore '${kind}' commands:`, error);
		}
	}
	if (restored) {
		return;
	}
	restored = true;
	for (const callback of restoreListeners) {
		callback();
	}
	restoreListeners.length = 0;
}

engine.whenReady.then(() => {
	restoreFromStore();
	Loading.runWhenLoaded(restoreFromStore);
});
