# CLAUDE.md: Leangame handoff notes

Context for a new Claude Code session. The owner is James (GitHub `roboticminstrel`), a data engineer with a game-programming background who is working through Axler's *Linear Algebra Done Right* (4th ed., CC BY-NC 4.0). He works mostly from his phone, so keep reports short and lead with what he needs to do.

## What this is

**The Range** is a mobile-first, drag-and-dock playground for vector-space algebra. Scalars and vectors are physical tiles, and every legal move corresponds to a field or vector-space axiom. Long term, each gesture maps to a Lean/Mathlib rewrite (`add_smul`, `smul_add`, `mul_comm`, `one_smul`, …). A Lean REPL backend would first referee moves and later drive the board, so the board and a real Lean proof state stay in sync. Levels come from the book; solving one unlocks its result as a new move. A planned challenge level is `-v = (-1)v`. The Lean side is starting: `lean/` defines vector spaces Axler's way, and a Lean machine (below) boots when the player presses Play.

The Range started as one tab of a larger design-canvas prototype: a chapter 1–3 concept graph of the book, with a detail sheet showing the formal text. That prototype lives as a claude.ai artifact, not in this repo. This repo is only the Range.

## Visual and interaction spec (agreed with James; keep it)

- **Scalar**: a gold hexagon. The type band (ℝ/ℂ) is on top and the element is below.
- **Vector**: a blue arrow with a type band (𝑉, 𝑈 ⊂ ℝ³) and the element. Its left **field edge** (gold band plus cream body) shows a sunken 𝐅 when abstract, or a raised ℝ/ℂ parallelogram strip. Holding the strip removes it. A docked scalar fully covers the edge.
- **Negative tiles are night tiles**: the top band stays, the face goes dark in its type's tint (scalars `#3B2C12`, vectors `#182654`), and the minus is always written (`−1`, `−𝑣`). A vector's 𝐅 edge stays in day colours. Scalars are negative by value; a vector is `neg: true` (the additive inverse −𝑣, distinct from `(−1)𝑣`). `isNeg`, `look`, `elText`; mockup at `src/mock/tiles.html`.
- **Readout**: the expression as plain text from the tree (`exprText`), literal on purpose: `−1𝑣` and `−𝑣` stay different until the player simplifies. During a drag it keeps showing the expression as it was, with the moving part and its target pulsing (`readGlow`); it updates when the move is done (`readoutOf`, `exprTokens`, `drag.snap`). Rules mode only. The tray is a popup (Tray button, bottom left; `trayVals`) with two tabs: TRAY (`0` in ℝ and `0` in 𝑉, dragged out onto the board; the popup hides during the drag) and LEAN (empty for now). The Lean status pill sits top left. (`props.legacy` keeps the old Sandbox board for tests.)
- **Zeros**: a 0 from the tray, dropped on a term (or a sum's right bracket), adds `+ 0` after it (`addZero`); a 0 already in play, dropped on a term of its own sum, is absorbed, `x + 0 = x` (`absorbZero`), and a bracket left with one term collapses. Where the 0 started decides which. Factoring groups only the terms that really have the factor (`groupIn`); a bare 0 stays out.
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
- The readout always shows the evaluated value (the start position evaluates to `= 4𝑣`).

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
  Hard limit: 3 h, because `scripts/aws-audit.py` flags machines past 3.5 h; the lean role is on its worker list.
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
