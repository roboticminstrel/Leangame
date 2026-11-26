"""Board expressions -> Lean source, for the referee (referee.py). Pure Python, no Lean needed.

The browser never sends Lean. It sends an expression tree and the name of a move, and this module writes the Lean
itself, from a fixed set of shapes, variable names that match one pattern, and rules from RULES. Lean can run
programs (`#eval`), so the Lean machine must never see text a visitor wrote.

Expression trees (JSON):
    {"s": "a"}            a scalar variable          -> a
    {"n": 2}              a scalar numeral           -> (2 : F)
    {"v": "v"}            a vector variable          -> v
    {"zero": true}        the zero vector            -> (0 : V)
    {"neg": e}            additive inverse           -> (-e)
    {"inv": e}            multiplicative inverse (scalars) -> (e)⁻¹
    {"add": [e1, e2, ...]} a sum (same sort), nested to the left: ((e1 + e2) + e3)
    {"mul": [e1, e2, ...]} a product of scalars, nested to the left
    {"smul": [s, w]}      a scalar times a vector    -> (s • w)

Scalars live in an arbitrary field F and vectors in an arbitrary vector space V over F (Leangame.Defs). A move that
checks there holds in every vector space, ℝ³ and ℂⁿ included.
"""

import re

NAME = re.compile(r"^[a-z][0-9]?$")
MAX_NODES = 200
MAX_DEPTH = 32
MAX_NUM = 10**6

# A board move -> the Lean lemmas that justify it. A lemma is tried left to right and right to left, and at the
# first few places it fits; the move checks if one of those turns one side into the other exactly.
RULES = {
    # the eight laws of Axler 1.20 (vectors)
    "add_comm": ["Axler.AddLaws.add_comm", "add_comm"],          # vectors, then scalars
    "add_assoc": ["Axler.AddLaws.add_assoc", "add_assoc"],
    "add_zero": ["Axler.AddLaws.add_zero", "add_zero"],
    "add_neg_cancel": ["Axler.AddLaws.add_neg_cancel", "add_neg_cancel"],
    "mul_smul": ["Axler.VectorSpace.mul_smul"],
    "one_smul": ["Axler.VectorSpace.one_smul"],
    "smul_add": ["Axler.VectorSpace.smul_add"],
    "add_smul": ["Axler.VectorSpace.add_smul"],
    # field laws (scalars; Mathlib's)
    "mul_comm": ["mul_comm"],
    "mul_assoc": ["mul_assoc"],
    "mul_one": ["mul_one", "one_mul"],
    "mul_add": ["mul_add", "add_mul"],
    # results the player proves first (Leangame.Basic): unlocked moves
    "zero_add": ["Axler.AddLaws.zero_add", "zero_add"],
    "neg_add_cancel": ["Axler.AddLaws.neg_add_cancel", "neg_add_cancel"],
    "neg_neg": ["Axler.AddLaws.neg_neg", "neg_neg"],
    "zero_smul": ["Axler.VectorSpace.zero_smul"],
    "smul_zero": ["Axler.VectorSpace.smul_zero"],
    "neg_one_smul": ["Axler.VectorSpace.neg_one_smul"],
    "neg_smul": ["Axler.VectorSpace.neg_smul"],
    "smul_neg": ["Axler.VectorSpace.smul_neg"],
}
# Arithmetic on numerals (2 · 3 = 6, 2 + 2 = 4), not a law: norm_num.
ARITH = "arith"

OCCURRENCES = 3  # try a lemma at its 1st, 2nd and 3rd match

BINDERS = ("{F V : Type} [Field F] [CharZero F] [Add V] [Zero V] [Neg V] [SMul F V] [Axler.AddLaws V] "
           "[Axler.VectorSpace F V]")
HEADER = "example " + BINDERS
AUTO = "auto"  # any rule in RULES (the board's hint, if it sends one, is tried first)


class BadInput(ValueError):
    pass


class _Walk:
    def __init__(self):
        self.nodes = 0
        self.scalars = set()
        self.vectors = set()

    def sort(self, e, depth=0):
        """Check the tree and return its sort, "F" (scalar) or "V" (vector)."""
        self.nodes += 1
        if self.nodes > MAX_NODES:
            raise BadInput("expression too large")
        if depth > MAX_DEPTH:
            raise BadInput("expression too deep")
        if not isinstance(e, dict) or len(e) != 1:
            raise BadInput("each node is an object with one key")
        (k, x), = e.items()
        if k in ("s", "v"):
            if not isinstance(x, str) or not NAME.match(x):
                raise BadInput("variable names are one lowercase letter, optionally followed by a digit")
            (self.scalars if k == "s" else self.vectors).add(x)
            return "F" if k == "s" else "V"
        if k == "n":
            if not isinstance(x, int) or isinstance(x, bool) or abs(x) > MAX_NUM:
                raise BadInput("numerals are whole numbers up to a million")
            return "F"
        if k == "zero":
            if x is not True:
                raise BadInput('the zero vector is {"zero": true}')
            return "V"
        if k == "neg":
            return self.sort(x, depth + 1)
        if k == "inv":
            if self.sort(x, depth + 1) != "F":
                raise BadInput("only scalars have multiplicative inverses")
            return "F"
        if k in ("add", "mul"):
            if not isinstance(x, list) or len(x) < 2:
                raise BadInput(f"{k} takes a list of at least two terms")
            sorts = {self.sort(t, depth + 1) for t in x}
            if len(sorts) != 1:
                raise BadInput("a sum's terms are all scalars or all vectors")
            s = sorts.pop()
            if k == "mul" and s != "F":
                raise BadInput("only scalars multiply each other; use smul for a scalar times a vector")
            return s
        if k == "smul":
            if not isinstance(x, list) or len(x) != 2:
                raise BadInput("smul takes [scalar, vector]")
            if self.sort(x[0], depth + 1) != "F" or self.sort(x[1], depth + 1) != "V":
                raise BadInput("smul takes [scalar, vector]")
            return "V"
        raise BadInput(f"unknown node {k!r}")


def term(e):
    """Lean text for a checked tree."""
    (k, x), = e.items()
    if k in ("s", "v"):
        return x
    if k == "n":
        return f"({x} : F)"
    if k == "zero":
        return "(0 : V)"
    if k == "neg":
        return f"(-{term(x)})"
    if k == "inv":
        t = term(x)
        return f"({t}⁻¹)" if t.startswith("(") else f"(({t})⁻¹)"
    if k in ("add", "mul"):
        op = " + " if k == "add" else " * "
        out = term(x[0])
        for t in x[1:]:
            out = f"({out}{op}{term(t)})"
        return out
    if k == "smul":
        return f"({term(x[0])} • {term(x[1])})"
    raise BadInput(f"unknown node {k!r}")


def tactic(rule):
    if rule == ARITH:
        return "norm_num"
    if rule == AUTO:
        return "first\n    " + "\n    ".join("| " + t for t in alternatives(list(RULES)))
    if rule not in RULES:
        raise BadInput(f"unknown move {rule!r}")
    tries = []
    for lemma in RULES[rule]:
        for arrow in ("", "← "):
            tries.append(f"(rw [{arrow}{lemma}]; done)")
            for n in range(2, OCCURRENCES + 1):
                tries.append(f"(nth_rw {n} [{arrow}{lemma}]; done)")
    return "first\n    " + "\n    ".join("| " + t for t in tries)


HYP = re.compile(r"^h[1-9]$")


def _check(lhs, rhs, more=()):
    """Check both trees (same sort, names used one way; and any further pairs, a level's hypotheses) and return the
    variable binders they all need."""
    w = _Walk()
    a, b = w.sort(lhs), w.sort(rhs)
    if a != b:
        raise BadInput("one side is a scalar and the other a vector")
    used = set(w.vectors)  # the start and goal's own vectors: a ∀-bound name can't be one of them
    bound = set()
    for h in more:
        l, r = h[0], h[1]
        if w.sort(l) != w.sort(r):
            raise BadInput("a hypothesis has a scalar on one side and a vector on the other")
        if len(h) > 2:
            if not isinstance(h[2], str) or not NAME.match(h[2]) or h[2] in used:
                raise BadInput("a hypothesis binds one fresh vector name")
            bound.add(h[2])
    clash = w.scalars & w.vectors
    if clash:
        raise BadInput(f"{sorted(clash)[0]} is used as both a scalar and a vector")
    vectors = w.vectors - bound
    binders = ""
    if w.scalars:
        binders += f" ({' '.join(sorted(w.scalars))} : F)"
    if vectors:
        binders += f" ({' '.join(sorted(vectors))} : V)"
    return binders


def statement(lhs, rhs):
    """`example … : lhs = rhs` (without the proof). Raises BadInput for a malformed or ill-typed pair."""
    return f"{HEADER}{_check(lhs, rhs)} :\n    {term(lhs)} = {term(rhs)}"


# ---------- a live proof (the Lean tab): the level as a theorem, one board move per step ----------

def theorem(start, goal, name="level1", hyps=None):
    """`theorem level1 … (h1 : l = r) … : start = goal := by` (the steps follow, one per line). hyps: a level's
    hypotheses, as [lhs, rhs] pairs, or [lhs, rhs, x] for `∀ x : V, lhs = rhs`; in the proof they're h1, h2, …"""
    if not re.match(r"^[a-z][a-z0-9_]{0,30}$", name):
        raise BadInput("bad theorem name")
    hyps = hyps or []
    if not isinstance(hyps, list) or len(hyps) > 9 or any(not isinstance(h, list) or len(h) not in (2, 3) for h in hyps):
        raise BadInput("hypotheses are up to nine [lhs, rhs] pairs (or [lhs, rhs, bound name])")
    binders = _check(start, goal, hyps)
    hs = "".join(f" (h{i + 1} : {'∀ ' + h[2] + ' : V, ' if len(h) > 2 else ''}{term(h[0])} = {term(h[1])})" for i, h in enumerate(hyps))
    return f"theorem {name} {BINDERS}{binders}{hs} :\n    {term(start)} = {term(goal)} := by"


def alternatives(rules, lemmas=None):
    """Tactics that might prove one board move, in order: rearranging alone (ac_rfl), then each rule's lemmas both
    ways, at their first few matches, finishing with ac_rfl when the rewrite leaves the terms in another order."""
    tries = ["ac_rfl"]
    for rule in rules:
        if rule == ARITH:
            tries.append("norm_num")
            continue
        for lemma in (lemmas or RULES).get(rule, []):
            for arrow in ("", "← "):
                for n in range(1, OCCURRENCES + 1):
                    rw = f"rw [{arrow}{lemma}]" if n == 1 else f"nth_rw {n} [{arrow}{lemma}]"
                    tries.append(f"({rw}; done)")
                    tries.append(f"({rw}; ac_rfl)")
    return tries


WITNESS = re.compile(r"^y[1-9]$")


def witness(x, name, hyp):
    """`obtain ⟨y1, h3⟩ := Axler.AddLaws.exists_add_eq_zero x`: the inverse axiom (1.20) as it stands, some y with
    x + y = 0, without the notation −x (which needs 1.27). name: the witness (y1…), hyp: its hypothesis (h1…)."""
    if not isinstance(name, str) or not WITNESS.match(name) or not isinstance(hyp, str) or not HYP.match(hyp):
        raise BadInput("a witness is named y1…y9, its hypothesis h1…h9")
    w = _Walk()
    if w.sort(x) != "V":
        raise BadInput("the inverse axiom is about vectors")
    return f"obtain ⟨{name}, {hyp}⟩ := Axler.AddLaws.exists_add_eq_zero {term(x)}"


def step(frm, to, hint=None, nhyps=0):
    """The tactic for one move in the live proof. The goal is `current = goal`; this proves `current = next` with the
    move's rule (hint) or any rule, and leaves `next = goal`, closed at once when next is the goal itself. A hint h1…
    names one of the level's hypotheses (only those the theorem has: nhyps)."""
    _check(frm, to)
    lemmas = dict(RULES)
    for i in range(1, min(int(nhyps or 0), 9) + 1):
        lemmas[f"h{i}"] = [f"h{i}"]
    hints = [h for h in (hint or []) if h in lemmas or h == ARITH]
    rules = hints + [r for r in lemmas if r not in hints] + ([] if ARITH in hints else [ARITH])  # arithmetic last
    alts = " | ".join(alternatives(rules, lemmas))
    return f"refine Eq.trans (show {term(frm)} = {term(to)} by first | {alts}) ?_ <;> try with_reducible rfl"


def _lemmas(nhyps):
    lemmas = dict(RULES)
    for i in range(1, min(int(nhyps or 0), 9) + 1):
        lemmas[f"h{i}"] = [f"h{i}"]
    return lemmas


def _alts(hint, nhyps):
    lemmas = _lemmas(nhyps)
    hints = [h for h in (hint or []) if h in lemmas or h == ARITH]
    rules = hints + [r for r in lemmas if r not in hints] + ([] if ARITH in hints else [ARITH])
    return " | ".join(alternatives(rules, lemmas))


def goal_step(frm, to, hint=None, nhyps=0):
    """A move made on the goal (working backward): the goal `current = frm` becomes `current = to`, by proving
    `to = frm` with the move's rule; closed at once when the goal now matches the current expression."""
    _check(frm, to)
    return f"refine Eq.trans ?_ (show {term(to)} = {term(frm)} by first | {_alts(hint, nhyps)}) <;> try with_reducible rfl"


def hyp_step(name, frm, to, bind=None, hint=None, nhyps=0):
    """A move made on a hypothesis: `name : l = r` becomes `name : l' = r'` (one side changed), proved from the old
    one: l' = l, then the old hypothesis, then r = r'. bind: the vector name of a `∀ x : V,` hypothesis."""
    if not isinstance(name, str) or not HYP.match(name):
        raise BadInput("a hypothesis is h1 … h9")
    if not (isinstance(frm, list) and isinstance(to, list) and len(frm) == 2 and len(to) == 2):
        raise BadInput("a hypothesis move takes [lhs, rhs] before and after")
    if bind is not None and (not isinstance(bind, str) or not NAME.match(bind)):
        raise BadInput("a bound name is one letter, optionally followed by a digit")
    (l1, r1), (l2, r2) = frm, to
    _check(l1, l2)
    _check(r1, r2)
    _check(l1, r1)
    alts = _alts(hint, nhyps)
    side = lambda a, b: "rfl" if a == b else f"(show {term(a)} = {term(b)} by first | {alts})"
    old = f"({name} {bind})" if bind else name
    proof = f"Eq.trans {side(l2, l1)} (Eq.trans {old} {side(r1, r2)})"
    if bind:
        return f"replace {name} : ∀ {bind} : V, {term(l2)} = {term(r2)} := fun {bind} => {proof}"
    return f"replace {name} : {term(l2)} = {term(r2)} := {proof}"


def move(lhs, rhs, rule):
    """The Lean command that checks one move: `lhs` becomes `rhs` by `rule`."""
    return f"{statement(lhs, rhs)} := by\n  {tactic(rule)}"
