# CLAUDE.md: Leangame handoff notes

Context for a new Claude Code session. The owner is James (GitHub `roboticminstrel`), a data engineer with a game-programming background who is working through Axler's *Linear Algebra Done Right* (4th ed., CC BY-NC 4.0). He works mostly from his phone, so keep reports short and lead with what he needs to do.

## What this is

**The Range** is a mobile-first, drag-and-dock playground for vector-space algebra. Scalars and vectors are physical tiles, and every legal move corresponds to a field or vector-space axiom. Long term, each gesture maps to a Lean/Mathlib rewrite (`add_smul`, `smul_add`, `mul_comm`, `one_smul`, …). A Lean REPL backend would first referee moves and later drive the board, so the board and a real Lean proof state stay in sync. Levels come from the book; solving one unlocks its result as a new move. A planned challenge level is `-v = (-1)v`. The Lean side is starting: `lean/` defines vector spaces Axler's way, and a Lean machine (below) boots when the player presses Play.

The Range started as one tab of a larger design-canvas prototype: a chapter 1–3 concept graph of the book, with a detail sheet showing the formal text. That prototype lives as a claude.ai artifact, not in this repo. This repo is only the Range.

## Visual and interaction spec (agreed with James; keep it)

- **Scalar**: a gold hexagon. The type band (ℝ/ℂ) is on top and the element is below.
- **Vector**: a blue arrow with a type band (𝑉, 𝑈 ⊂ ℝ³) and the element. Its left **field edge** (gold band plus cream body) shows a sunken 𝐅 when abstract, or a raised ℝ/ℂ parallelogram strip. Holding the strip removes it. A docked scalar fully covers the edge.
- **Negative tiles are night tiles**: the top band stays, the face goes dark in its type's tint (scalars `#3B2C12`, vectors `#182654`), and the minus is always written (`−1`, `−𝑣`). A vector's 𝐅 edge stays in day colours. Scalars are negative by value; a vector is `neg: true` (the additive inverse −𝑣, distinct from `(−1)𝑣`). `isNeg`, `look`, `elText`; mockup at `src/mock/tiles.html`.
- **Readout**: the expression as plain text from the tree (`exprText`), literal on purpose: `−1𝑣` and `−𝑣` stay different until the player simplifies. During a drag it keeps showing the expression as it was, with the moving part and its target pulsing (`readGlow`); it updates when the move is done (`readoutOf`, `exprTokens`, `drag.snap`). It sits right under the EXPRESSION heading. The dotted expression box hugs the expression's tiles and grows and shrinks as they move (`zoneBox`), always holding the heading and readout; it can grow left past them but never leaves them out. Rules mode only. The tray is a popup (Tray button, bottom left; `trayVals`) with two tabs: TRAY (`0` in ℝ and `0` in 𝑉, dragged out onto the board; the popup hides during the drag) and LEAN (empty for now). The Lean status pill sits top left. (`props.legacy` keeps the old Sandbox board for tests.)
- **Zeros**: a 0 from the tray, dropped on a term (or a sum's right bracket), adds `+ 0` after it (`addZero`); a 0 already in play, dropped on a term of its own sum, is absorbed, `x + 0 = x` (`absorbZero`), and a bracket left with one term collapses. Where the 0 started decides which. Factoring groups only the terms that really have the factor (`groupIn`); a bare 0 stays out.
- **Level 1 (live board)**: ASSUMPTIONS (`{𝑉 : Type}   [VectorSpace ℝ 𝑉]   (𝑣 : 𝑉)`), GOAL (`0` in 𝑉) and EXPRESSION (starts `0·𝑣`), stacked at `K.AY`, `K.GY`, `K.ZT` (`headVals`, `headHtml`). Tapping ASSUMPTIONS or GOAL switches tiles behind the text on and off: the text slides to make room, then the tile pops up (𝑉 and ℝ as type parallelograms, variables as half-size tiles). Room for tiles is always kept. When the expression is exactly the goal (`canon`), the tiles hop, sparks fly, and the box, heading and readout turn gold (`winHop`, `spark`, `winBox`); what follows comes later. `props.demo` keeps the earlier `(2 + 3)𝑣 + −1𝑣` board for tests.
- **Assumptions tiles**: every 𝑉 gets its blue type parallelogram, ℝ its gold one; `(𝑣 : 𝑉)` in tile mode is just the 𝑣 tile: 𝑣 keeps its size and only slides sideways to the tile's element, 𝑉 rises into the band and shrinks, the brackets and colon fade (`kind: 'decl'` token, `parts`).
- **Tray tabs**: TRAY, LEAN, TOOLS. The panel slides up/down and glides between heights. TOOLS fills the screen in the concept graph's light style (`src/graph/ConceptGraph.js`, data from the claude.ai canvas "Concept Graph — Mobile Mockup" in `src/graph/data.js`): 1.1–1.27 filled in, 1.30 active (a glow running round its edge; tapping it returns to the game), 1.32 on not reached (dashed). Tapping another node opens its sheet with the book's statement and commentary. No hint line at the bottom (explanations come later, without clutter). The Lean pill, when ready, opens the LEAN tab.
- **Levels and progress** (`src/levels.js`): 1.27 (unique −𝑣: `𝑤` → `𝑤′` given `h : 𝑣 + 𝑤 = 0`, `h′ : 𝑣 + 𝑤′ = 0`), 1.30 (`0·𝑣` → `0`) and 1.32 (`(−1)·𝑣` → `−𝑣`). A level may declare vectors (`vars`) and hypotheses (`hyps`: name h1…, label, lhs/rhs as runs); they get their own ASSUMPTIONS lines, which push GOAL and EXPRESSION down (`layoutFor`). Hypothesis cards sit in the tray: dragged onto a run matching either side, it becomes the other (`hypTarget`, `applyHyp`); in Lean they're the theorem's `(h1 : l = r)` and the step's hint is `h1` (`render.theorem(hyps=…)`, `render.step(nhyps=…)`). 1.27 is no longer in START_DONE. Progress (done nodes) and each level's place (its move history and position in it) live in localStorage (`leangame.progress.v1`; tests use `memoryStore`). Winning marks the node done (`checkWin`); a won result becomes a move in later levels (1.30: drop the 0 of `0·𝑣` on its vector → the zero vector, `applyZeroSmul`). TOOLS shows only done nodes, the active level (glow), nodes one step away (grey, all prerequisites done) and partly unlocked nodes (some prerequisites done, the rest on screen; lines solid from done prerequisites, dotted from missing ones; tapping one pulses the dotted lines and missing nodes twice, `nodeState`, `pulse`); a done node leading to a node still hidden (a prerequisite not on screen) gets a line that fades out partway, without revealing the node (`stubsFor`); sheets hide the book's proof until the node is done; buttons: Return to level (active), Start level (grey, when it has a level), Replay level (done). `switchLevel` saves this level's place and resumes the other's.
- **Undo / redo / rewind**: buttons beside the Lean pill (top bar, real px, rendered by Range; the pill is `LeanPlay inline`). Every finished move that changes the expression is a history entry (`noteBoard`, `hist`); a new move after undo drops what was ahead. Restores re-lay the expression in one tidy row (`tidy`) and tiles glide (keyed by id, `histAnim`). Undo/redo replay the move's Lean steps (reversed for undo); rewind restarts the live proof.
- **Trees, inverses, 1**: tapping a tile shows its whole group (its top-level term) as a tree in the tray (`showTree`, `treeVals`, `treeHtml`): operators (`·`, `+`) are circles, tiles are half-size leaves. In the tree (a copy; the board doesn't change): tapping a leaf makes it its night tile; tapping an operator on vectors toggles `−(…)`; on scalars it cycles `−(…)` → `−(…)⁻¹` → `(…)⁻¹` → plain (`treeTap`). The − and x⁻¹ nodes sit on the edge above the operator (one at the middle, two at thirds; keyed so they slide and pop), with a night box (−) or gold outline (⁻¹) round the subtree; removed ones pop out (`treeLeaving`). Drag a leaf, operator or −/x⁻¹ node out: onto a matching 0 it splits it, `0 = x + −x` (`splitZero`, `inverseAdd`); a scalar onto a 1 splits it, `1 = x·x⁻¹`, refused for 0 (`splitOne`, `inverseMul`). On the board a cluster carries `neg`/`inv` (`flagged`; never flattened or collapsed), drawn in a box (night bottom half for −, gold outline and −1 for ⁻¹; drag the frame to move it); in a sum its sign is − instead of +, with a leading − when first; the readout writes `−(…)` and `(…)⁻¹`. Dragging a term onto its additive twin in the same sum, or a factor onto its multiplicative twin in the same product, makes 0 or 1 (`setupCancel`, `cancelTarget`, `applyCancel`; direct match only, over any tile of the matching run; not for 0⁻¹); Lean gets it as a rearranging step then the law (`_leanMid`, `_orderOverride`). A 1 in a product, dropped on another tile of it, is absorbed (`absorbOne`). The tray holds an untyped 0 (scalar), 0 (vector) and 1, with recessed bands until they land (`addOne`: x·1, or 1·𝑣).
- **Lean tab = live proof (watch window)**: when Lean is ready, the client opens `theorem level1 … : start = goal := by` on the machine (REPL tactic mode, via `/check` with `{"session": "start"|"step"}`, so the gate needs no new routes) and replays the moves made so far, then sends each finished move (`noteBoard` → `boardChanged(from, to, hint)`). Each step is `refine Eq.trans (show from = to by first | ac_rfl | rw … | …) ?_` (`render.step`), the hint's law tried first; refused steps leave the proof where it was. The tab shows the theorem, ✓/✗ per step with Lean's error, the goal as Lean prints it, and at the end "No goals" plus whether the whole proof compiled from scratch (`Sessions` in `referee.py`, `leanVals`/`leanHtml`). ½ and 𝑖 can't be written in Lean yet (shown as such). `+` on vectors has `Std.Associative`/`Std.Commutative` instances so `ac_rfl` accepts rearranged sums.
- **Rows are the player's**: a new term (e.g. an added 0) stays in its target's row, even past the board's edge; the board scrolls. No automatic wrapping until James decides on a way to do it.
- **Products**: scalars overlap tip to tip with a · badge. Dragging a vector drags its docked scalars along.
- **Sums** are brackets:
  - gold, thick, for scalar sums, with an ℝ tag on the right at band level
  - blue for vector sums: a notch and field tag on the left (the tag fades when a scalar docks there), and the 𝑉 tag on the right
- **Plus signs** sit at the midpoint between the nearest edges of neighboring terms, placed along the shortest path. Double-tapping a plus lines the terms up in one row.
- **No mixing types in a sum.** Nested sums are always flattened (`(a+b)+c` becomes `a+b+c`); see `normTops`, `normalize`.
- **Rules mode** allows only axiom-justified moves:
  - reorder by dragging sideways (dragging a vector moves its whole block)
  - **distribute**: drag the adjacent scalar into a bracket; ghosts preview the left and right neighbors
  - **factor**: drop a chain's last scalar on a matching scalar, with a glow pulse
  - **vector factor**: drop 𝑣 on 𝑣
  - **expand `(a+b)v`**: pull the scalar bracket off 𝑣. Dragging 𝑣 left isn't available because that gesture moves the block.
- Pan by dragging empty board; pinch to zoom.

## Code

No build step. Preact 10.29.8 and htm 3.1.1 are vendored in `vendor/` as ES modules, with their MIT licenses.

- `index.html`, `styles.css`: page shell (Inter and STIX Two Text from Google Fonts). The board is capped at 560px wide and centered.
- `src/main.js`: mounts `<Range/>`. `src/html.js`: `htm.bind(h)`.
- `src/range/Range.js` (~1080 lines): one class component, mechanically converted from the canvas prototype.
  - **Model**: tiles are `s` (scalar: field, el, val) and `v` (vector: type, el, key, field). `prod` is `{factors, vec}`. `sum` is `{terms}`. `tops` holds the root expressions. Constructors: `mkS`, `mkV`, `mkProd`, `mkSum`. Helpers: `locate`, `setRef`, `walk`, `cloneFresh`.
  - **Typing and evaluation**: `typeOf`; `evalN` uses complex arithmetic (`mulC`, `addC`); formatting via `fmtVal`.
  - **Layout**: `measure` → `layout` → `place`. Plus signs come from `plusesFor`, `gapMid` and `bestPath`. Overlap constants: `ovFF`, `ovFV`.
  - **Gestures**: `begin` / `move` / `end` (tiles) and `pieceDown` / `pmove` / `pend` (field strips). Previews come from `findPreview` and `findVecPreview`, are applied by `applyPreview`, and sandbox drops go through `dropSand`. Also `longPress`, `tapPlus`, `arrange`.
  - **Scaling**: world units are 560 wide. `fitScale() = boardWidth / 560`, and `scaleNow(z)` multiplies that by zoom. Don't name a method `base`: Preact uses `this.base` for the DOM node.
- `tests/range.test.mjs`: 13 `node:test` tests. They drive the component directly with a synchronous `setState` stub (`make()`); `ev(x,y)` scales by 390/560 and `dragTo(c,id,tx,ty,role)` simulates drags. They cover evaluation, multiply, type refusal, reorder, distribute both sides, vector-sum expand, collect, partial collect, leftover becomes 1, collectV then pull-off expandV, short pull doesn't expand, plus position, and flattening.

```sh
npm test            # node --test tests/*.test.mjs (a bare directory arg doesn't work)
npm run serve       # python3 -m http.server 8000
```

For browser checks, headless Chrome through Python Playwright worked (`/usr/bin/google-chrome`). Font and favicon load errors are expected offline.

## Deploy (lean.interlinea.io)

Leangame is hosted the same way as James's other project, Interlinea (`roboticminstrel/Interlinea-proto`): S3 + CloudFront, signed in to AWS with GitHub OIDC and no stored keys.

- **Infra**: Interlinea-proto, `infra/terraform/lean.tf` (PR #18). It creates:
  - bucket `lean-interlinea-io-site`, a us-east-1 ACM cert, a CloudFront distribution and Route53 A/AAAA records
  - role `interlinea-lean-deploy`, which only Leangame's `main` can assume. It carries the `interlinea-workload-boundary`, and its only permissions are writing that bucket, invalidating that distribution and reading one SSM parameter.
  - SSM `/interlinea/lean/distribution-id` in **us-east-1**
- **Applying it**: the Infrastructure workflow in Interlinea-proto. James must start it from main and comment "approve" on the issue it opens. Don't try to bypass that gate.
- **Leangame side**: `.github/workflows/deploy.yml` runs on pushes to main that touch site files, or by hand. It runs the tests, assumes `arn:aws:iam::589305835200:role/interlinea-lean-deploy` (region us-east-2), then runs `scripts/deploy.sh`. The script syncs to S3 (index.html no-cache, everything else max-age 300) and invalidates CloudFront, reading the distribution ID from SSM. No repo variables are needed; `vars.*` can override.
- `test.yml` runs `npm test` on pushes and PRs.

### Status (2026-11-25)

- Leangame PR #1 and Interlinea-proto PR #18 are merged and applied; the site is live.
- Branch `ccr-4920e63a-d6dzmq` in both repos: the Lean project, the referee, the Play button, and the Lean machine's
  infrastructure (Interlinea-proto `infra/terraform/lean_server.tf`). Needs the Infrastructure run (James approves).
- The Lean code has never been compiled here: the session couldn't install Lean. `.github/workflows/lean.yml`
  builds it and runs the referee self-test against the real REPL; check its result first.
- Leftover: the throwaway branch `claude/lean-probe` in Interlinea-proto. James can delete it.

## Lean (`lean/`, `server/`)

- `lean/`: a Lake project on Lean v4.36.0, with Mathlib v4.36.0 and the REPL (v4.36.0).
  `lean/scripts/setup.sh` installs elan and runs `lake exe cache get <files>` for only the Mathlib files our code
  imports (that's the "minimal Mathlib"), then builds. CI and the Lean machine both use it.
- `Leangame/Defs.lean`: the definition (Axler 1.20).
  - The operations are instances on the carrier type (`Add V`, `Zero V`, `Neg V`, `SMul F V`).
  - The laws are two Prop classes: `AddLaws V` (the four that don't mention F) and `VectorSpace F V`.
  - The split is needed because a law without F can't sit in a class indexed by F (Lean couldn't infer F).
  - `-v` is data with `v + -v = 0`. The book's existential form is a theorem.
  - The variables line is `{F V} [Field F] [Add V] [Zero V] [Neg V] [SMul F V] [AddLaws V] [VectorSpace F V]`.
- `Basic.lean`: 1.26–1.32 (unique 0, unique −v, 0v = 0, a0 = 0, (−1)v = −v) plus neg_smul, smul_neg, neg_neg. All
  are `protected`; write them qualified (`VectorSpace.zero_smul`). Names match Mathlib's, which are the board's moves.
- `Examples.lean`: the toy `Vec2 F` (pairs, laws written out by hand) and F over itself.
- `Mathlib.lean`: every Mathlib module over a field is one of ours (low-priority instances), so Fⁿ and similar come free.
- `server/render.py`: board trees (JSON) → a Lean `example` + a `first | rw … | nth_rw …` tactic from an allowlist
  (`RULES`). **The browser never sends Lean text**: Lean can run programs, so only fixed shapes, one-letter names and
  listed lemmas reach it. Tests: `python3 -m unittest discover -s server`.
- `server/referee.py`: HTTP on :8787 in front of `lake exe repl` (env 0 = `import Leangame`). Token in `X-Lean-Token`.
  `/health`, `/touch`, `/check`. It shuts the machine down after `--idle-minutes` (10) with no touch/check.
  `--selftest` runs known moves through the real REPL.
- `src/lean/client.js` + `LeanPlay.js`: the Play button. wake → poll status every 3 s → ready. It touches (at most
  once a minute) on any pointerdown while Lean is ready, and watches every minute for an idle shutdown. Tests in
  `tests/lean-client.test.mjs`.

### The Lean machine (Interlinea-proto `infra/terraform/lean_server.tf`, `lean_boot.sh.tftpl`, `infra/lean_gate/gate.py`)

- `lean.interlinea.io/api/lean/*` goes to CloudFront (header `X-Origin-Verify`), then the HTTP API, then the
  `interlinea-lean-gate` Lambda. Routes: `GET status`, `POST wake`, `POST touch`, `POST check`.
- wake with no machine up: `RunInstances` from launch template `interlinea-lean-server` (t3.medium, Ubuntu 22.04,
  tag Role=interlinea-lean-server). At most 30 launches a day (SSM `/interlinea/lean/launches`).
- Launch and terminate, never start and stop: the workload boundary has no `ec2:StartInstances`, and Terraform may
  not start machines. Lean is kept between boots as a tarball in the private bucket `lean-interlinea-io-server`
  (`cache/lean-<hash of toolchain+lakefile>.tar.zst`). The first boot builds it (~10 min) and saves it. Later boots
  unpack it, so they should be quick (not measured).
- The boot script clones Leangame `main` (public), runs `setup.sh`, then starts the referee with `systemd-run`.
  Phases go to `status/<instance>.json`, which the gate shows while booting. On failure, it shuts down in 3 minutes.
  Idle shutdown uses `/usr/sbin/shutdown` by full path (the boot script's PATH has no /usr/sbin, so before this fix the
  machine never idled out) and retries each minute. Hard limit: 3 h, because `scripts/aws-audit.py` flags machines past 3.5 h; the lean role is on its worker list.
- The Lambda reaches the machine at its public IP over plain HTTP (no VPC permissions in the boundary). Port 8787 is
  open, with the token required. Token: SSM SecureString `/interlinea/lean/server-token`.

## Working conventions

- It's a prototype (James, 2026-11-25): commit as each piece of work is finished, push the branch, and merge it into `main` and push `main` too, which deploys the site. No PRs unless he asks. This applies to Leangame only: Interlinea-proto is the live reader's repo, so changes there stay on a branch until James says otherwise.
- Push with `git -c push.negotiate=true push -u origin BRANCH`.
- Open PRs through REST, not GraphQL: `gh api repos/OWNER/REPO/pulls -f title=… -f head=… -f base=main -F body=@file`.
- From the Claude session proxy, the GitHub Actions API (variables, dispatch) and ref deletes were blocked. Design around that: James can run workflows and click buttons.
- Interlinea-proto's IAM rules: every role or policy is named `interlinea-*` and carries `permissions_boundary = local.workload_boundary`. The boundary allows only listed services; for example, `cloudfront:ListDistributions` isn't allowed, which is why the distribution ID goes through SSM.
- Commit messages end with a `Co-Authored-By:` line naming the model, and PR bodies end with a Claude Code attribution line.

## Ideas discussed but not built

- Lean REPL server, "referee vs engine": start as a referee that checks each move through REPL `proofState`. Candidates were a small EC2 CPU instance or Lambda (cold starts with Mathlib are heavy).
- Lean-style statements for linear independence (Mathlib `LinearIndependent`, `Fintype.linearIndependent_iff`) and concrete vector space examples as future levels.
