# Art direction & animation rig — the minimal shrimp

The pet is a **cute minimal shrimp**: flat vector shapes, three colours, one dot for an eye,
**no face**. Not a cartoon character with big eyes and a mouth — a small, elegant creature that
reads as alive through *posture and movement*.

This document is the contract between the art, the rig (`src/anim/`) and the renderer
(`src/render/`). It exists because the animation architecture (§2b of SPEC.md) makes the art a
*dependency of the rig*: whatever a bone draws must be valid at every angle, and whatever the
dynamic solver does must be worth looking at.

Companion: [`../SPEC.md`](../SPEC.md) §2b (why a rig and not a baked sprite sheet),
[`m0-windows-report.md`](./m0-windows-report.md) §Findings (the CPU budget this has to fit in).

---

## 1. Animation technique: cut-out, not mesh

Two families exist for articulating a 2D character.

### Cut-out (chosen)

Rigid parts, each with a pivot, parented into a hierarchy. A bone rotation rotates its part
rigidly around the pivot. There is **no deformation of the artwork** — ever.

Continuity comes from overlap, not stretching:

- every part is authored **past** its joint, so its proximal end sits under the parent;
- overlap ≥ **half the joint width**, so no gap opens at the joint's angle limits;
- draw order is fixed, so the overlap always hides correctly;
- where a joint swings past ~100°, add a **joint disc**: a circle centred exactly on the pivot,
  painted in the limb colour, plugged underneath to cover any remaining wedge;
- optionally a **membrane**: a slightly darker shape behind the joint, so a visible seam reads as
  a shadowed crease rather than a hole.

`T(child) = T(parent) · Translate(pivot) · Rotate(angle)` — that is the entire mechanism.

**This is anatomically correct for a shrimp.** The body *is* rigid armoured plates with soft
joints between them. Visible interior seams are not a compromise, they *are* the design — the
reference image already shows them as pale separators between segments.

### Mesh deform (rejected)

Live2D / Spine mesh mode: one continuous drawing, triangle mesh, bones move vertices so the skin
bends and stretches. Organic and seamless, but it needs weight painting, its canvas story is
usually WebGL (a risk we have deliberately removed — see SPEC.md §Risk 1), and for a segmented
exoskeleton it fights the anatomy.

### Consequence: the vector path *is* the final art

Family choice only produces **bone transforms**. What a bone draws is a renderer decision: an
image region, or a **path generated in code**. Because the design language is flat fills, thin
strokes and no texture, a minimal shrimp can be drawn entirely as paths — which means:

> The procedural rig is not a placeholder. For this aesthetic it is the product.

Rotation-invariance is why this works: there is no baked-in shading to break when a segment turns
15°, because every shape is defined in its own bone's local space and is valid at any angle by
construction. No art pipeline, no licensing, no editor lock-in, and the whole thing is diffable.

Image layers stay possible later (§7) — `anim/` emits transforms, `render/` decides appearance.

---

## 2. Anatomy: the rig

Side view, facing **right**. Ground contact at the feet. All lengths in units of `S` = body
length (rostrum tip → tail fan root). Target `S` = 132 px in a 200×200 window; the rig must read
at 64 px too.

| Id | Bones | Parent | Driver | Draw |
|---|---|---|---|---|
| `carapace` | 1 | — | rigid; slow sway + "breathing" scale from a sine | shell with rostrum notch |
| `rostrum` | 1 | carapace | small lag spring | thin spike, 0.10·S |
| `abdomen.0..5` | 6 | chain from carapace | spine spring: curvature from velocity, turn rate, and pose target | tapered segment + pale distal cap |
| `tailroot` | 1 | abdomen.5 | spring | fan base |
| `tailflap.0..4` | 5 | tailroot | spread/flick; damped spring | 5 tapered blades |
| `eye` | 1 | carapace | gaze drift (±2 px) | **single dot**, 2.5 px, no white |
| `antenna.0..3` ×2 | 8 | carapace | 4-bone damped spring chain, gravity + body acceleration | tapered stroke, drawn behind everything |
| `leg.hip/thigh/shin` ×3 near | 9 | carapace | 2-bone IK to planted foot targets | tapered stroke |
| `leg.*` ×3 far | 9 | carapace | same gait, **+0.08 phase lag**, 35 % darker, drawn behind carapace | depth cue |
| `swimmeret.0..2` | 3 | abdomen.1..3 | metachronal flick, small amplitude | short paddle strokes |
| `mouth` | — | — | **none** | there is no mouth |

≈40 bones, ~30 of them drawing. That is a trivial load for Canvas2D (see §8).

### First-pass rest pose

These are the numbers that actually rendered correctly in
[`../spikes/shrimp-rig/index.html`](../spikes/shrimp-rig/index.html) — that page is the executable
reference implementation of this table. `S` = body length.

Angles in degrees: `0° = pointing right (+x)`, **positive = curving downward** (screen `y+`, because
Y is down). The whole animal is tilted **−16°** at the root, which is what produces the reference's
comma silhouette: carapace up-right, abdomen hanging.

| Bone | Length | Rest angle | Notes |
|---|---|---|---|
| `carapace` | 0.27·S | 0 (root tilt −16°) | posterior edge = the abdomen hinge |
| `abdomen.0` | 0.094·S | 168 | points left-down |
| `abdomen.1..5` | 0.094·S | −9 each | local, so the chain curls to ~107° world |
| `tailroot` | 0.055·S | −6 | |
| `flap.0..4` | 0.155·S | (i−2)·16 | fan spreads ±32°; blades taper 0.010→0.036·S |
| `antenna.0..3` | 0.135·S | −22, then −14 | two antennae offset by 13° so they never overlap exactly |
| legs | 0.100·S thigh, 0.092·S shin | IK | hips at x = 0.215 / 0.125 / 0.035·S, y = 0.10·S |

Body widths taper per segment: `w0 = (0.090 − 0.006·i)·S`, `w1 = (0.084 − 0.006·i)·S`.

**Chain rule, learned the hard way:** a child in a chain attaches at the parent's **tail**, not its
origin. Attaching all six abdomen segments to the carapace's origin stacks them on one point and
the animal renders as a single lobe — it looks like a shape bug, not a rig bug, which is why the
skeleton overlay (§9.1) is mandatory.


---

## 3. The look

### Palette — three colours, no more

| Role | Value | Use |
|---|---|---|
| `body` | `#FF6A45` | carapace, abdomen, tail, legs (near) |
| `shade` | `#C93B22` | far-side legs, antenna strokes, seam creases, swimmerets |
| `highlight` | `#FFF1E8` @ 70 % | pale distal cap on each segment, the reference's "streak" |

Optional only if it earns it: a single subtle `body → body*0.93` linear fill on the carapace.
**No gradients anywhere else. No outlines. No shadows except the ground contact ellipse.**

### Seams

Pale full-width bands are a trap: adjacent bands merge into one stripe and the abdomen reads as a
pearl necklace. What works, in the spike:

- a **thin dark crease** at each joint (`shade`, ~0.07 of the segment at the base, mostly hidden by
the next plate) — this is what separates the plates;
- one **quiet pale streak** per plate, off-centre on the dorsal edge (t 0.30→0.74, width
0.020→0.012·S, offset −0.32 of the segment width);
- the **scalloped silhouette** that comes free from drawing segments tail→head with rounded caps.

Total pale coverage should stay well under 10 % of the body area.

### Hard rules (these are what keep it from becoming cartoon-ey)

1. **No mouth, ever.** No eyebrows, no blush, no sweat drops, no `^^` eyes, no sparkles.
2. **The eye is one dot.** No white, no pupil, no highlight. It may drift ±2 px with the gaze —
   that is the only facial mechanism in the character.
3. **No silhouette outline.** Shapes read by colour contrast against the desktop. (An outline would
   also have to be drawn per-bone and would double every seam.)
4. **Seams are the design.** Each abdomen segment ends in a pale cap; overlapping segments produce
   the segmented read for free. Do not try to hide them.
5. **Antennae and legs are strokes, not shapes** — 2–3 px tapered, round caps, drawn behind the body.
6. **Flat shading only.** Depth comes from the `shade` colour on far-side parts, never from light.
7. **Silhouette first.** If it does not read at 64 px, the shape is wrong, not the detail.

### Expression is posture

Since the face is gone, every emotion has to be carried by the body. This is the mapping the rig
implements — it replaces the old `happy` mouth/eyes entirely:

| Emotion | Pose |
|---|---|
| rested / neutral | rest spine, occasional antenna sway, slow breathing sway |
| content | abdomen softly lifted, antennae trailing, tail fan half-spread |
| curious / alert | carapace lifted, spine extended (straighter), antennae raised, eye drift toward cursor |
| asleep | spine curled tight (each angle +12°), antennae folded along the body, tail fan closed, breathing 0.4 Hz |
| startled | spine snapped straight, antennae whipped forward, one-frame squash |
| happy / petted | quick arch (each angle −10°) + tail fan flick + antennae bounce |
| dragged | spine hangs (gravity on the chain), tail flipped up, antennae streaming |
| falling | spine extended, tail fan spread for drag, antennae up |
| landed | spine compressed 4 %, tail fan closed, antennae overshoot forward |

---

## 4. Locomotion

Shrimps are not quadrupeds and must not walk like quadrupeds.

- **Gait**: metachronal wave — the legs tread front→back in a ripple, not in alternating pairs.
  Implement as `phase_i = gaitPhase + i · 0.12`, `i` = pair index. This one line is what makes it
  read *shrimp* rather than *dog*.
- **Duty factor** ≈ 0.55: slightly more than half the cycle each foot is planted. Feet plant in
  **body space** (the world moves under them), which is what sells traction.
- **Speed**: near-side and far-side legs share one gait clock; the far side lags by 0.08.
- **Swimmerets**: same wave, amplitude ~25 % of a leg, continuous and slower while walking, fast
  flick when startled or hopping.
- **Walk vs. scoot**: shrimps also move by tail-flipping (caridoid escape reaction). Reserve that
  for a rare, high-energy reaction (startle, or being poked twice quickly) — it is the pet's
  "zoomies" moment.
- **Idle**: the abdomen spine breathes at ~0.25 Hz; antennae are pure passive secondaries.

---

## 5. Secondary motion (the reason for the whole rig)

Every one of these is a damped spring, never a keyframe:

| Part | Input | Feel |
|---|---|---|
| abdomen chain | body acceleration, turn rate, plus a pose target | tail lags on direction changes |
| antennae | body acceleration + gravity, slightly under-damped | the signature of the character |
| tail fan | impulse on hop / land / drag-release | flick |
| carapace | velocity → tilt, 2° max | weight |

Gains are per-bone and live in `pet.json`, so they can be tuned without touching code. Guard rails,
learned from every procedural-animation project ever: **under-damp the antennae, over-damp
everything else**. Bouncy legs look cheap; bouncy antennae look alive.

---

## 6. What the rig must not do

- Never let a limb rotate through the body (angle limits on every joint).
- Never draw a segment longer than its bone (no scale-hacks to fake reach; use IK).
- Never accumulate spring energy at rest: all springs must be critically damped near neutral, or
  the pet will vibrate forever while asleep. Verify by leaving it alone for 5 minutes.
- Never depend on frame rate: springs integrate on the same fixed 120 Hz step as the sim.

---

## 7. If we ever want image layers

Not planned, but the door stays open: the rig emits bone transforms, so a part can draw a PNG
region instead of a path. Requirements for art to be riggable that way:

1. One layer per bone, named exactly as the bone id, in a layered `.svg`/`.krita`/`.psd` source.
2. Each layer drawn **past** its pivot by ≥ half the joint width (overlap rule, §1).
3. Pivot marked as a named guide/circle in the source, exported into `pet.json`.
4. Export at 4× (HiDPI), one PNG per bone, plus the layer list as the z-order.
5. Flat fills and no cast shadows — anything baked into the image is baked into every pose.

That is the same authoring cost regardless of runtime (Spine, Rive, custom), which is why it is
deferred rather than decided: geometry first, texture later if the flat look ever feels thin.

---

## 8. Cost model

From [`m0-windows-report.md`](./m0-windows-report.md): the M0 blob costs **65 % of one core**
steady-state — but that is *DWM recompositing a transparent 200×200 surface every frame*, not
drawing. The blob is one ellipse and a few arcs.

Implications for this rig:

- Drawing ~30 paths is noise compared to compositing. **Optimise frames, not draw calls.**
- Target: render at **60 Hz while moving, 24 Hz while asleep/idle**, and skip the frame entirely
  when nothing changed (no window move, no animation phase advance).
- The springs must therefore tolerate variable *render* rate while integrating at a fixed 120 Hz.
  This is why §6 says springs integrate on the sim step.
- Budget to hold M1 to: **< 15 % of one core** idle, < 35 % walking. Measure with the same method
  as the M0 report.

---

## 9. Validation loop

The playground (`npm run dev`) is the art tool:

1. **Rig editor** — `spikes/shrimp-rig/index.html?mode=edit` (see §11). Place pivots, rotate bones,
   set lengths and widths, cycle poses, scrub the gait. Non-negotiable — you cannot debug a rig you
   cannot see.
2. **Tuning panel**: live sliders for spring stiffness/damping, gait speed/duty/phase lag, antenna
   gravity, pose blend rates. Write values back to `pet.json` with a button. *(Not built yet: the
   editor covers geometry; springs arrive with `src/anim/`.)*
3. **Pose gallery**: force any pose state side by side, at 1× and at 64 px, to check the silhouette.
   `?mode=sheet` and `?mode=small` cover this today.
4. **Idle soak**: 5 minutes untouched, then assert the rig is motionless (no spring drift).

Success is not "the animation plays". It is: **you leave it on screen for an hour and it still
feels alive, and you never catch the loop.**

---

## 10. Open art questions

1. Does the tail fan read as 5 blades at 64 px, or does it mush into one shape? (Probably ≤3 blades
   at small sizes — decide with the silhouette test, §9.3.)
2. Is the rostrum spike worth it, or does it read as a bug antenna at small sizes?
3. Eye: one dot on the carapace, or on a 2 px stalk? The reference has it flush; the stalk gives
   more gaze range but is one more thing to break at low res.
4. Do the far-side legs help (depth) or clutter? Decide from a 64 px screenshot, not by argument.

---

## 11. Spike: what was actually built

[`../spikes/shrimp-rig/index.html`](../spikes/shrimp-rig/index.html) — a dependency-free,
build-free spike that renders this rig from the tables above. Not shipping code; the reference
implementation of the numbers, and the thing to point at when arguing about proportions.

Open it directly (`file://` works) or via `npm run dev` → `/spikes/shrimp-rig/index.html`:

| URL | Shows |
|---|---|
| `?mode=edit` | **the placement editor** (default) — drag bones and pivots |
| `?mode=compare` | bones only → shapes only → bones over shapes, same pose |
| `?mode=sheet` | bones, rest, gait, curious, sleep, dangle |
| `?mode=small` | rendered at 64×64 then upscaled nearest — the silhouette test |
| `?mode=skeleton` | bones with IK foot targets and the ground line |

### Editor controls

| Input | Action |
|---|---|
| drag a bone | rotate it around its pivot |
| drag a pivot dot | move the pivot (origin-attached bones: leg hips, antenna bases) |
| shift + drag | set bone length (distance from pivot) |
| `[` `]` | widen / narrow the selected bone (`shift` = tip width only) |
| arrows | nudge angle 0.5° (`shift` = 5°) |
| `R` | reset the selected bone |
| `1`–`5` | pose: rest, curious, sleep, happy, drag |
| hold `space` | animate the gait |
| `V` | cycle view: shapes / bones / overlay |
| `C` | dump the rig JSON (also to the clipboard) |

What it established:

- **The cut-out approach works for this character.** 40 bones, ~30 drawing, forward kinematics
  plus 2-bone IK, no deformation anywhere. Shapes land exactly on the bones (`mode=compare`).
- **The silhouette survives 64 px.** The segmented tail, fan, antennae and legs all still read —
  the design language holds at pet scale.
- The reference's comma pose is a **root tilt of −16°** plus a 6-link chain curling to ~107°; the
  anatomy is not horizontal.
- Two mistakes that cost the most time, both now rules in §2/§3: children must attach to the
  parent's **tail** (not its origin), and pale seam bands must be **thin and offset**, never
  full-width.
- Drag-rotate must normalise the angle to the **shortest equivalent** (±180°), or dragging near the
  wrap point snaps the bone by a full turn.

### Not in the editor (yet)

- **Leg segment lengths** (thigh/shin) are constants, not per-leg bones — the IK solver takes them
  as inputs. Make them editable when the legs need per-pair tuning.
- **No springs, no gravity, no secondary motion.** The drag/dangle pose is a hand-authored angle
  offset, not simulated. That is `src/anim/`'s job, and it is where the character will actually
  come alive.
- **No undo.** `R` resets one bone, `reset all` reverts everything.
