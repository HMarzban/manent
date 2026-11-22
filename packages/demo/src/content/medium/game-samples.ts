// Game samples: scene 4 of Fog Bell, and The Keeper's Logbook in full.

export const FOG_BELL_SCENE_4 = `
scene_heading INT. CAR DECK - NIGHT
engine LOAD car_deck_fog · PLAYER cal · INPUT walk_only
general #set weather=fog
camera LOW AND SLOW DOWN THE ROW OF CARS. HEADLIGHTS DARK. THE RAMP CHAIN DRIPS.
action Engine noise, close and enormous. The cars sit nose to tail in the dark, ticking as they cool. At the end of the row, a bread van with a loaf painted on its side.
action PIKE comes up the companionway, wiping his hands on a rag.
character PIKE
dialogue You counted them aboard?
character CAL
dialogue Six cars, one van, one bicycle. Eleven on foot.
character PIKE
dialogue Your father counted heads. Vehicles don't fall overboard.
emote PIKE: FLAT · CAL: STUNG
action Inside the bread van, a light comes on. Then goes out.
camera HOLD WIDE ON THE VAN. LET THE PLAYER FIND IT.
general * [Check the van]
action Cal crosses to the van and tries the rear door. Locked.
general ** [Look through the glass]
camera CAL'S POV: BREAD TRAYS STACKED TO THE ROOF. IN THE GAP BETWEEN THEM, A PAIR OF SMALL BARE FEET.
emote CAL: SURPRISE, THEN SOFTEN
character CAL
parenthetical (under his breath)
dialogue Twelve on foot.
general #set finn_found=true
general ** [Knock on the door]
character CAL
dialogue Ferry's full, whoever you are. I'll need to see a ticket.
action Nothing. Then, very quietly, from inside the van: two knocks back.
general #set finn_found=true
general #set finn_trust=1
general * [Leave it for Pike]
character CAL
dialogue There's a light on in that van.
character PIKE
dialogue There's a light on in your head. Go up and read your sister the sounder.
general -
action Above them the ferry sounds her horn: one long blast, swallowed at once by the fog.
engine SFX foghorn_long · DUCK ambient 6 dB for 3 s
general {finn_trust >= 1}
character FINN (O.S.)
parenthetical (a whisper, from inside the van)
dialogue Don't tell her.
emote CAL: DECIDES
character CAL
dialogue Tell who?
`;

export const KEEPERS_LOGBOOK = `
ink_line VAR trust = 0
ink_line VAR you_lit_it = false
ink_line Gull Point Light, the evening before the museum opens. Esme Tull kept this light for twenty-two years, until it learned to keep itself. She still has a key.
ink_line -> stairs
ink_line
ink_line === stairs ===
ink_line You climb the stairs. The lamp is cold.
ink_line * (storm) [Ask about the storm] -> quiz
ink_line * [Ask why it's dark] "Because nobody's lit it in two years," says the keeper. "Tonight somebody might."
ink_line   -> quiz
ink_line
ink_line === quiz ===
ink_line = question_1
ink_line The keeper hands you the logbook.
ink_line * [Read the last entry]
ink_line   ~ trust = trust + 1
ink_line   -> entry
ink_line * [Close it]
ink_line   -> lamp
ink_line
ink_line = entry
ink_line The last page is in pencil, in a hand that leans into the wind.
ink_line "Gale, south-west. Lamp lit 16:52. Motor failed 02:10. Turned the lens by hand till first light. Ardle boat round the Bar 03:40, all well. E.T. R.T."
ink_line {stairs.storm:"That's your storm," says Esme. "Four hours of turning a handle, and my daughter turning it with me."|"That was the last night it was mine to keep," says Esme. "In the morning it learned to turn itself."}
ink_line -> question_2
ink_line
ink_line = question_2
ink_line "Now. A ship out past the Bar sees this light. What does she see?"
ink_line * "Two white flashes[."]," you say, "every fifteen seconds."
ink_line   ~ trust = trust + 1
ink_line   Esme looks at you over her glasses. "You read the board by the door."
ink_line * "A light[."]," you say. "Isn't that enough?"
ink_line   "It's enough to see. It isn't enough to know where you are."
ink_line   ** [Ask her what it says]
ink_line     ~ trust = trust + 1
ink_line     "Two white flashes, every fifteen seconds. No other light on this coast says that. A ship sees it and knows it's us, and knows where the rocks are."
ink_line   ** [Guess]
ink_line     "Three flashes?" you try.
ink_line     "Two," she says, not unkindly. "But you'd have worked it out."
ink_line - She takes the logbook back and buttons it into her coat, where it has always lived.
ink_line -> lamp
ink_line
ink_line === lamp ===
ink_line The lens stands in the middle of the room, taller than you are, a beehive of glass rings with a bulb at its heart no bigger than your fist. Esme rests her palm on the brass.
ink_line {is_trusted():
ink_line   "Go on, then," she says, and steps back from the switch.
ink_line - else:
ink_line   "Stand there," she says. "Where you can see it start."
ink_line }
ink_line * {is_trusted()} [Start the lamp yourself]
ink_line   ~ you_lit_it = true
ink_line   -> lit
ink_line * [Ask Esme to start it]
ink_line   -> lit
ink_line * [Leave it dark until tomorrow]
ink_line   -> dark
ink_line
ink_line === lit ===
ink_line {you_lit_it:The switch is stiffer than you expect. Then something hums under your feet.|Esme's hand finds the switch without looking.}
ink_line Light. Not a glow: a blade of it, swinging out over the water, over the Bar, over the whole of Lannick, and round, and round again.
ink_line One. Two. Then dark, and you find you are counting.
ink_line {you_lit_it:"There," says Esme. "Now it's yours as well. That's how it works."|"There she is," says Esme, and for a moment she isn't talking to you.}
ink_line -> END
ink_line
ink_line === dark ===
ink_line Esme nods, as if that were a right answer too.
ink_line "Tomorrow, then. With everyone watching." She locks the lamp room behind you, and all the way down she tells you which steps creak, and who wore them down.
ink_line -> END
ink_line
ink_line === function is_trusted ===
ink_line ~ return trust >= 2
`;
