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


def _check(lhs, rhs):
    """Check both trees (same sort, names used one way) and return the variable binders they need."""
    w = _Walk()
    a, b = w.sort(lhs), w.sort(rhs)
    if a != b:
        raise BadInput("one side is a scalar and the other a vector")
    clash = w.scalars & w.vectors
    if clash:
        raise BadInput(f"{sorted(clash)[0]} is used as both a scalar and a vector")
    binders = ""
    if w.scalars:
        binders += f" ({' '.join(sorted(w.scalars))} : F)"
    if w.vectors:
        binders += f" ({' '.join(sorted(w.vectors))} : V)"
    return binders


def statement(lhs, rhs):
    """`example … : lhs = rhs` (without the proof). Raises BadInput for a malformed or ill-typed pair."""
    return f"{HEADER}{_check(lhs, rhs)} :\n    {term(lhs)} = {term(rhs)}"


# ---------- a live proof (the Lean tab): the level as a theorem, one board move per step ----------

def theorem(start, goal, name="level1"):
    """`theorem level1 … : start = goal := by` (the steps follow, one per line)."""
    if not re.match(r"^[a-z][a-z0-9_]{0,30}$", name):
        raise BadInput("bad theorem name")
    return f"theorem {name} {BINDERS}{_check(start, goal)} :\n    {term(start)} = {term(goal)} := by"


def alternatives(rules):
    """Tactics that might prove one board move, in order: rearranging alone (ac_rfl), then each rule's lemmas both
    ways, at their first few matches, finishing with ac_rfl when the rewrite leaves the terms in another order."""
    tries = ["ac_rfl"]
    for rule in rules:
        if rule == ARITH:
            tries.append("norm_num")
            continue
        for lemma in RULES[rule]:
            for arrow in ("", "← "):
                for n in range(1, OCCURRENCES + 1):
                    rw = f"rw [{arrow}{lemma}]" if n == 1 else f"nth_rw {n} [{arrow}{lemma}]"
                    tries.append(f"({rw}; done)")
                    tries.append(f"({rw}; ac_rfl)")
    return tries


def step(frm, to, hint=None):
    """The tactic for one move in the live proof. The goal is `current = goal`; this proves `current = next` with the
    move's rule (hint) or any rule, and leaves `next = goal`, closed at once when next is the goal itself."""
    _check(frm, to)
    hints = [h for h in (hint or []) if h in RULES or h == ARITH]
    rules = hints + [r for r in RULES if r not in hints] + ([] if ARITH in hints else [ARITH])  # arithmetic last
    alts = " | ".join(alternatives(rules))
    return f"refine Eq.trans (show {term(frm)} = {term(to)} by first | {alts}) ?_ <;> try with_reducible rfl"


def move(lhs, rhs, rule):
    """The Lean command that checks one move: `lhs` becomes `rhs` by `rule`."""
    return f"{statement(lhs, rhs)} := by\n  {tactic(rule)}"
