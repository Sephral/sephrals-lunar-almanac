# Sephral’s Lunar Almanac

Six moons and three inner realms circle above Ember, and the heroes are bound to them by their attunements. Ember's calendar shows where the moons stand right now. Sephral’s Lunar Almanac adds the view ahead: how long a phase lasts, when the next full moon rises, and which hero is waiting for it.

## Discord

[![Join Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/7BjCgDYaBP)

Questions, feedback, and module support are welcome on [Discord](https://discord.gg/7BjCgDYaBP).

## Demo

![SLA demo](media/demo.gif)

The demo uses an invented sky with its own names, colors and moon images and heroes of Crucible's playtest adventure instead of Ember's moons and artwork. In your world the almanac shows Ember's own sky. If the embedded preview is not available in your GitHub view, please check the media folder.

## Features

* **Every moon at a glance:** phase, influence, how long the phase lasts and when the next full moon comes, with the date in the tooltip. Full moons glow.
* **Timeline:** the coming 30 days (adjustable) as a strip per moon, so you see at once when two moons are full together.
* **Inner realms:** the slow realms with their phase and the time until they become dominant.
* **Attuned heroes:** each moon and realm lists the player characters attuned to it, with their attunement rank. A blessed hero glows golden and the tooltip shows the blessed rank and how long the blessing lasts. Click a hero to open the sheet.
* **Phase notifications:** when the world time moves on, everyone learns which moon became full, or about every phase change, or only about the moons of their heroes. After a long rest or a journey a single notification lists the phases that came and went in between, such as a full moon, with their dates. The GM can also post full moons to the chat.
* **Always the true sky:** the almanac computes every phase for the current world time with Ember's own orbit, so the moving calendar animation never confuses it.
* **English and German:** the module language follows Foundry or can be set per user.

## Usage

1. Enable the module in your Ember world.
2. Open the almanac with the moon button next to the cosmos button of Ember's calendar, or with the moon tool in the token controls on the left.

Players and the GM see the same sky. Players see the heroes they are allowed to see.

The almanac only reads. It never changes the time, the moons, the attunements or any actor. Names, colors and images of the moons come from the installed Ember module at runtime. The module itself contains no Ember content.

## Settings

All options are in *Game Settings → Configure Settings → Sephral’s Lunar Almanac*:

* Module language (follow Foundry, German or English)
* Phase notifications (full moons, the moons of attuned heroes, every change, none)
* Full moons in the chat (GM)
* Length of the timeline
* The buttons in Ember's calendar and in the token controls
* A self test for the GM

## Requirements

* Foundry VTT 14 and the Ember module 0.6.3 with its adventure scenes (Ember creates its calendar only then)
* Verified with Foundry 14.369, Ember 0.6.3 and Crucible 0.11.1. Ember's D&D 5e mode should work as well but has not been tested.
* Ember has no public interface for its sky, so the almanac reads Ember's calendar directly. After an update of Ember or Foundry the GM gets a short notice, and the self test in the module settings checks that the moons, realms, images and attunements can still be read.

Install the module with its manifest URL `https://github.com/Sephral/sephrals-lunar-almanac/releases/latest/download/module.json`.

## License

See [LICENSE.md](LICENSE.md).
