# Civilization VII: Better Action Panel
Adds useful UI features to minimise micromanagement for units. 
- Bulk attack options that dont end your commander turn, with multi attack previews.
- Manual Reinforcement actions to path units to a commander, or gather units near to a commander with a click. Also allows cross ocean reinforcement and naval units reinforcing in doing so.
- Settlements get rally points for units, so produced units can be set to travel to a given point or commander on being produced, including treasure convoys.
- New unit alerts allow sleeping a unit for a set number of turns, or for missionaries, until a settlement changes from your religion.
- Orders can be shift-queued so a missionary can walk somewhere and convert once they arrive.
- Handy little stuff like movement and tier of units of packed units, an ability breakdown, and custom emblems and promotion glyphs on commander flags.

Contributors welcome!
# Changelog
v1.0:

General Commander Changes:
- Adds a movement indicator on units in a commander, so you know which air units can still attack, or which land units can pop out.
- Adds a chevron indicator on units that share portraits, so you know what tier a unique unit in a commander is.
- Amended most commander bulk attack commands so they also show a combat preview of how much damage the unit will take and how many units will fire, and which units will partipate. Coordinated Attack (the Melee Army Commander one) is skipped due to complexity.
- Added Reinforcement actions. These do not quite function the same as regular reinforcement, instead they just path the unit to your commander and will pack it when it arrives. There are two actions, one on the unit, the other on the commanders. 
- The first lets you choose a commander to go move to, the appeal being that it works across oceans where that failed in Exploration even if you had the Shipbuilding Mastery. It also works on naval units, so they can reinforce! Right click to just reinforce to the nearest.
- The second is a pack up on the commander unit itself, where it gathers units that are not adjacent by making them issue commands to path to it. Sorts by distance, health, and combat strength so you get the most fighting ready units.
- Custom Commander icons! Choose from a variety of ingame icons, or custom icons made by the excellent Orion! Or, keep track of your specialised commanders at a glance with an icon that shows your progress through the promotion tree.

-General Unit Changes:
- When pathing into Fog of War, if along your path you would reveal a hostile unit that would stop your movement, from Zone of Control, the unit will stop just before it. This basically mimics what would happen if you moved your unit 1 tile at a time.
- When cancelling a units movement action when it has no movement, it does not deselect the unit, letting you set a different path immediately
- New alert system. Can set a unit to sleep for as many turns as you like, clicking left to increase, right to decrease. Useful for when you have a merchant ready to trade, but need to wait 3 turns for the influence to increase trade route capacity.
- Religious alert. Can set a missionary in a settlement you have converted to sleep, only waking when the settlement is converted.
- Rally point system for built units. Different Rally types for land military, civilian (yes including treasure convoys!), naval and air. Can target commanders too so they auto reinforce to them.
- Ability Hover. Hover over the small chevron next to the units name when selected and see all the abilities it has. Note, some abilities were never given descriptions so this isn't perfect.

Air Commander Changes:
- Attacking or moving an air unit automatically selects the next air unit in the commander
- Added Mass Rebase button to move all aircraft to other airbase
- Added functionality to the Pack button above the Army panel for air commanders. It will do a mass transfer of aircraft that could move to this unit, sorting by health, then combat strength, then distance. For squadron Commanders, it will also let you pack Infantry and Cavalry if you have the requisite promotions, and they are adjacent.
- Added new Bulk Bomb, Bulk Attack commands, that let you attack with multiple aircraft with one click attack, but does not use up any attacks after the unit would die.
- Added a helpful hover for bulk attacks and commander actions, indicating how many attacks it would take to kill a unit, and the range of health it might be left on.

Army Commander Changes:
- Adds new bulk ranged attack that acts like Focus Fire but doesnt end movement
- Adds a new bulk melee attack that acts like Coordinated Attack but doesnt end movement


Beta Features i haven't improved enough yet, but are present, if somewhat experimental:
- Added Commander escort attachement. This makes it so a unit can attach to a commander, and when the commander or unit moves, both move together. Saves micro basically.
- A Shift-Queue System where you can queue up movements and following actions. So for example, move to settlement and convert with missionary. Move to a district and activate great person charge.

Bugfixes:
- Fades the actions above the army panel that are not currently possible.
