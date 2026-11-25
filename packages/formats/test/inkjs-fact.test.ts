import { expect, test } from "bun:test";
import { Compiler } from "inkjs/full";

const SOURCE = `
VAR trust = 0
VAR you_lit_it = false
Gull Point Light, the evening before the museum opens. Esme Tull kept this light for twenty-two years, until it learned to keep itself. She still has a key.
-> stairs

=== stairs ===
You climb the stairs. The lamp is cold.
* (storm) [Ask about the storm] -> quiz
* [Ask why it's dark] "Because nobody's lit it in two years," says the keeper. "Tonight somebody might."
  -> quiz

=== quiz ===
= question_1
The keeper hands you the logbook.
* [Read the last entry]
  ~ trust = trust + 1
  -> entry
* [Close it]
  -> lamp

= entry
The last page is in pencil, in a hand that leans into the wind.
"Gale, south-west. Lamp lit 16:52. Motor failed 02:10. Turned the lens by hand till first light. Ardle boat round the Bar 03:40, all well. E.T. R.T."
{stairs.storm:"That's your storm," says Esme. "Four hours of turning a handle, and my daughter turning it with me."|"That was the last night it was mine to keep," says Esme. "In the morning it learned to turn itself."}
-> question_2

= question_2
"Now. A ship out past the Bar sees this light. What does she see?"
* "Two white flashes[."]," you say, "every fifteen seconds."
  ~ trust = trust + 1
  Esme looks at you over her glasses. "You read the board by the door."
* "A light[."]," you say. "Isn't that enough?"
  "It's enough to see. It isn't enough to know where you are."
  ** [Ask her what it says]
    ~ trust = trust + 1
    "Two white flashes, every fifteen seconds. No other light on this coast says that. A ship sees it and knows it's us, and knows where the rocks are."
  ** [Guess]
    "Three flashes?" you try.
    "Two," she says, not unkindly. "But you'd have worked it out."
- She takes the logbook back and buttons it into her coat, where it has always lived.
-> lamp

=== lamp ===
The lens stands in the middle of the room, taller than you are, a beehive of glass rings with a bulb at its heart no bigger than your fist. Esme rests her palm on the brass.
{is_trusted():
  "Go on, then," she says, and steps back from the switch.
- else:
  "Stand there," she says. "Where you can see it start."
}
* {is_trusted()} [Start the lamp yourself]
  ~ you_lit_it = true
  -> lit
* [Ask Esme to start it]
  -> lit
* [Leave it dark until tomorrow]
  -> dark

=== lit ===
{you_lit_it:The switch is stiffer than you expect. Then something hums under your feet.|Esme's hand finds the switch without looking.}
Light. Not a glow: a blade of it, swinging out over the water, over the Bar, over the whole of Lannick, and round, and round again.
One. Two. Then dark, and you find you are counting.
{you_lit_it:"There," says Esme. "Now it's yours as well. That's how it works."|"There she is," says Esme, and for a moment she isn't talking to you.}
-> END

=== dark ===
Esme nods, as if that were a right answer too.
"Tomorrow, then. With everyone watching." She locks the lamp room behind you, and all the way down she tells you which steps creak, and who wore them down.
-> END

=== function is_trusted ===
~ return trust >= 2
`;

test("The Keeper's Logbook compiles under Bun and two choices reach the second question", () => {
  const compiler = new Compiler(SOURCE);
  const story = compiler.Compile();
  expect(compiler.errors).toEqual([]);
  story.ContinueMaximally();
  story.ChooseChoiceIndex(0);
  story.ContinueMaximally();
  story.ChooseChoiceIndex(0);
  story.ContinueMaximally();
  expect(story.currentChoices.map((choice) => choice.text)).toEqual([
    '"Two white flashes."',
    '"A light."',
  ]);
  expect(story.variablesState["trust"]).toBe(1);
});
