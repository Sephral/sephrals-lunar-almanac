# Sephral’s Lunar Almanac: Manual

## The window

Open the almanac with the moon button next to the cosmos button of Ember's calendar, or with the moon tool in the token controls. From top to bottom it shows:

* **The date** of the sky you are looking at, with the day control next to it (see below).
* **Weather:** the weather where the party is and the wind.
* **Moons:** every moon with its phase, how long the phase lasts and when the next full moon comes. Hover the date line for the exact day. The thin bar is the influence of the moon. Hover it to read what the number means: how strongly the moon acts on the world, from 0 while it rests up to 100 at the height of the full moon, and from which value on it counts as full.
* **Timeline:** a strip per moon for the coming days. Hover a stretch for its phase and when it starts.
* **Inner realms:** their phase and the time until each of them becomes dominant.
* **Timeline of the inner realms:** the realms change slowly, so their strip looks half a year ahead.
* **Other attunements:** heroes whose attunement has no moon or realm.

Every moon and realm lists the heroes attuned to it, with their rank. Blessed heroes glow golden, the tooltip tells how long the blessing lasts. Click a hero to open the sheet.

## Looking at another day

The arrows next to the date step one day back or ahead, the number field jumps to any day up to two years ahead or one year back. Every click counts, so a few quick clicks jump a few days at once. The almanac then shows the sky of that day: phases, times, timelines and which gear lights up. *Today* left of the arrows returns to the world time. It only shows while you look at another day, and its place stays reserved, so the arrows never move. Nothing changes in the world, the day control only changes your view. The weather shows only for today.

## Which heroes are listed

By default the almanac lists the members of the party: the party group of Crucible or the primary party of D&D 5e. Without a party it lists every player character. The GM can switch to all player characters in the settings. Players only see the heroes they are allowed to see.

## Moon sensitive gear

A small moon next to a hero means that some of the hero's items react to the moons. The tooltip of the hero lists them with their moons. While one of those moons is full, the hero lights up in the color of that moon.

* **Found on its own (Crucible):** Ember ties some items, talents and enchantments to the moons. The almanac recognizes them in the running game. Gear counts while it is equipped (and invested, if it needs that).
* **Marked by the GM:** open the sheet of any item you can edit (items in a locked compendium cannot be marked), then *Depends on moons* in the menu of its title bar, and tick the moons. The mark stays on the item, also when it changes hands. Untick all moons to remove it.

## Recovery at the full moon (D&D 5e)

In Ember's D&D 5e mode (D&D 5e 6) items and activities with limited uses can recover at the peak of a moon or realm. The almanac adds one choice per moon and realm to the recovery periods of D&D 5e, next to Dawn and Dusk: one for the full moon of each moon and one for each realm at its peak. Pick it in the uses of the item or activity like any other period, with a formula if only part of the uses comes back.

When the world time moves past the start of that full moon, D&D 5e recovers the uses together with its own dawn and dusk recovery and lists the changes in its time passed message. The message also names the moons that became full. A jump over several full moons counts each of them, a step back in time recovers nothing. The GM's client does the counting, so a GM has to be online.

## Weather

The almanac shows Ember's weather where the party is: rain, fog and the like, and the wind with its strength and speed. Ember measures the wind in mph. In German the almanac shows km/h and German names for the wind strengths (Windstill, Brise, Windig, Stürmisch, Sturmböen), in English it shows Ember's names and mph. The GM also sees how the wind will turn in the coming hours. Ember plans the wind up to two days ahead. Rain, fog and other weather drift with the wind, so where they go cannot be foreseen and the almanac does not guess. Each user can hide the weather in the settings.

## The almanac in the journal

The book button (GM only) writes the coming full moons and dominant realms into a journal entry named *Lunar Almanac*, one table with start, end, duration and the attuned heroes. Choose how many days ahead and whether the inner realms belong in it. It starts at the day shown in the window, so you can also look ahead first. Only the GM can see the entry. A second export updates the same entry instead of creating a new one, so links to it keep working. Feel free to rename it or move it into a folder.

## Notifications

When the world time moves on, everybody learns about the phase changes they asked for in the settings. After a long rest or a journey one message sums up the phases that came and went in between. If the GM turns it on, full moons and dominant realms are also posted to the chat. The chat names only the attuned heroes every player may see.

## Settings

All options are in *Game Settings → Configure Settings → Sephral’s Lunar Almanac*. The gear in the title bar of the almanac opens them directly.

| Setting | What it does |
| --- | --- |
| Module language | Follow Foundry, German or English, for you |
| Phase notifications | Full moons and dominant realms, every change a hero is attuned to, every change, or none (for you) |
| Full moons in the chat | The GM's client posts full moons and dominant realms for everyone (GM) |
| Heroes in the almanac | Members of the party, or all player characters (GM) |
| Timeline length | Days of the moon timeline, 0 hides it (for you) |
| Timeline of the inner realms | Days of the realm timeline, 0 hides it (for you) |
| Weather | Show the weather (for you) |
| Button in Ember's calendar | The moon button next to the cosmos button (for you) |
| Button in the token controls | The moon tool on the left (for you) |
| Self test | Checks the parts of Ember the almanac reads (GM) |

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For the Lunar Almanac it holds:

* on how many of the last 30 days the module was used
* how often the almanac is opened from the calendar or the token controls, it looks ahead to another day, an actor or the cosmos scene is opened from it, the almanac is written to the journal and gear is marked as moon sensitive
* the settings *Phase notifications*, *Full moons in the chat* and *Timeline length* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No names, chat messages, notes, dice results or other content of the world are sent.

## Self test

After an update of Ember or Foundry the GM gets a short notice. The self test in the settings checks that the moons, realms, attunements, the weather and, in Crucible, the moon sensitive gear can still be read, and posts the result as a chat message only the GM sees.

## API

`game.modules.get("sephrals-lunar-almanac").api` offers:

| Function | What it does |
| --- | --- |
| `open()` | Opens the almanac |
| `refresh()` | Redraws the almanac if it is open |
| `lookAhead(days)` | Opens the almanac on a day relative to the world time, `0` is today |
| `sky(time)` | Phase, influence, end of the phase and next peak of every moon and realm, now or at a world time |
| `attunement(actor)` | The Ember attunement of a hero with its rank and blessing |
| `heroesByAttunement()` | The listed heroes, grouped by attunement |
| `heroes()` | The heroes the almanac lists |
| `moonGear(actor)` | The items of a hero which react to the moons, with their moons |
| `markedMoons(item)` | The moons the GM marked on an item |
| `markItem(item)` | Asks which moons an item depends on (GM) |
| `weather()` | The weather where the party is, the wind and the coming wind changes, with the wind speed in mph (`speed`) and km/h (`kmh`) |
| `exportJournal({days, realms})` | Writes the journal entry without asking (GM) |
| `ready()` | Whether Ember's calendar is ready |
| `runSelfTest()` | Runs the self test (GM) |

## Limits

* The almanac needs Ember with its adventure scenes in the world. Without them Ember has no calendar.
* Recognizing moon sensitive gear on its own works in Crucible. In other systems mark the items yourself.
* Weather names come from Ember and appear in the language Ember shows them in. Only the wind strengths have German names of their own. A wind strength Ember adds in a later version keeps Ember's name.
