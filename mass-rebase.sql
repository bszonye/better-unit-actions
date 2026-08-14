-- Registers custom interface modes used by action.js's army-panel actions.
INSERT OR IGNORE INTO InterfaceModes (InterfaceModeType, ViewName)
VALUES ('INTERFACEMODE_MASS_REBASE', 'Unit');

INSERT OR IGNORE INTO InterfaceModes (InterfaceModeType, ViewName)
VALUES ('INTERFACEMODE_MOD_GROUND_ATTACK', 'Unit');
INSERT OR IGNORE INTO InterfaceModes (InterfaceModeType, ViewName)
VALUES ('INTERFACEMODE_MOD_CARPET_BOMB', 'Unit');

INSERT OR IGNORE INTO InterfaceModes (InterfaceModeType, ViewName)
VALUES ('INTERFACEMODE_MOD_FOCUS_FIRE', 'Unit');
INSERT OR IGNORE INTO InterfaceModes (InterfaceModeType, ViewName)
VALUES ('INTERFACEMODE_MOD_FOCUS_FIRE_SEA', 'Unit');

INSERT OR IGNORE INTO InterfaceModes (InterfaceModeType, ViewName)
VALUES ('INTERFACEMODE_MOD_MELEE_FOCUS_FIRE', 'Unit');

INSERT OR IGNORE INTO InterfaceModes (InterfaceModeType, ViewName)
VALUES ('INTERFACEMODE_MOD_REINFORCE', 'Unit');
