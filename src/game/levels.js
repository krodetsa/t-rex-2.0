// Hand-authored levels as ASCII plans. Legend:
//   '#' solid   '=' one-way platform   '~' lava
//   '@' player spawn   'o' bone   'G' goal portal
//   'h' horizontal fireball   'v' vertical fireball
//   'E' enemy dino (patrols)  'S' enemy dino (shoots fireballs)
//   '-' crumbling platform (breaks ~2s after you step on it)
//
// Design rules (derived from the tuned physics):
//   - max jump ≈ 3.3 tiles high / ≈4 tiles across, so step-ups are ≤3 tiles above a
//     surface the player can already reach and lava bands are ≤3 tiles wide;
//   - the bottom row is always solid (no bottomless pits — you die only in lava or to
//     fireballs);
//   - horizontal fireballs are boxed in by solid pillars so they patrol a short slot;
//   - every bone lies on the traversal path or one jump above a reachable platform
//     (all bones must be collected to open the goal).

export const LEVELS = [
  // --- Level 1: movement warm-up (run, jump gaps, jump lava, collect) ---------
  [
    "                                        ",
    "                                        ",
    "                                        ",
    "                                        ",
    "                                        ",
    "                                        ",
    "                                        ",
    "                                        ",
    "                                        ",
    "              o           o             ",
    "           ======      ------     o     ",
    "        o        o                      ",
    " @  o               E     S    o    G   ",
    "#######~~#############~~################",
    "########################################",
  ],

  // --- Level 2: one-way stairs + boxed fireballs + lava jumps ------------------
  [
    "                                          ",
    "                                          ",
    "                                          ",
    "                                          ",
    "                                          ",
    "                                          ",
    "                                          ",
    "                                          ",
    "          o                               ",
    "         ====                             ",
    "      o                                   ",
    "     ====     o   v   #  #      o        ",
    " @ o               o  #h #           o  G ",
    "##############~~##############~~~#########",
    "##########################################",
  ],

  // --- Level 3: "The Climb" — a tall vertical staircase over a lava lake -------
  [
    "                              ",
    "                              ",
    "       G                      ",
    "     #####                    ",
    "            o                 ",
    "            -==      S        ",
    " #     ho            #        ",
    "    =====                     ",
    "         v o                  ",
    "         =====                ",
    "     o            S           ",
    "   --===          =           ",
    "          o                   ",
    "        =--==                 ",
    "      o                       ",
    "    =====                     ",
    " @   o                        ",
    "##########~~~~~~~~~~~~~~~#####",
  ],

  // --- Level 4: "Fire Gauntlet" — boxed fireballs, a vertical gate, lava -------
  [
    "                                              ",
    "                                              ",
    "                                              ",
    "                                              ",
    "                                              ",
    "                                              ",
    "                                              ",
    "                     o                        ",
    "                                              ",
    "              o  ###                          ",
    "             ----                             ",
    "        #  #      v    o    #  #  o           ",
    " @ o    #h #                #h #      o     G ",
    "######################~~~#########~~##########",
    "##############################################",
  ],

  // --- Level 5: "The Tower" — a tall switchback climb over a lava floor. Miss a
  //     jump and you fall: onto a platform far below (lost progress) or, from the
  //     outer ledges, straight into the lava. No checkpoints. -------------------
  [
    "                      ",
    "                      ",
    "                      ",
    "              o       ",
    "                      ",
    "           =--=       ",
    "                  ====",
    "    G       o         ",
    "    =           =-    ",
    "                      ",
    "        ====          ",
    "               o      ",
    "                ====  ",
    "        o             ",
    "        ====          ",
    "               =      ",
    "     =              = ",
    "       o              ",
    "      ----            ",
    "                 =    ",
    "             =        ",
    "               o      ",
    "              ====    ",
    "            o         ",
    "          ====        ",
    "                      ",
    " @     =              ",
    "   o                  ",
    "  ====                ",
    "                     ",
    "#####~~~~~~~~~~~~~~~~~",
    "#####~~~~~~~~~~~~~~~~~",
  ],

  // --- Level 6: "The Apex" — BOSS ARENA. A walled box (no goal, no bones): defeat the
  //     giant boss dino ('B') to win the game. Two vertical fireballs sweep the arena as
  //     roaming hazards; one-way ledges give the player footing to line up shots and
  //     dodge. Every side is solid so the boss and fireballs stay boxed in. ------------
  [
    "##################################",
    "#                                #",
    "#                                #",
    "#        v              v        #",
    "#                                #",
    "#     ===                        #",
    "#                              B #",
    "#                     =          #",
    "#   ====                  ====   #",
    "#                                #",
    "#         ====      ====         #",
    "#                                #",
    "# @                              #",
    "##################################",
    "##################################",
  ],
];
