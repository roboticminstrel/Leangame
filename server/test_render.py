"""Tests for render.py (no Lean needed): python3 -m unittest discover -s server"""
import unittest

import render

a, b, v, u = {"s": "a"}, {"s": "b"}, {"v": "v"}, {"v": "u"}


class Render(unittest.TestCase):
    def test_distribute(self):
        cmd = render.move({"smul": [{"add": [a, b]}, v]}, {"add": [{"smul": [a, v]}, {"smul": [b, v]}]}, "add_smul")
        self.assertIn("(a b : F) (v : V) :", cmd)
        self.assertIn("((a + b) • v) = ((a • v) + (b • v)) := by", cmd)
        self.assertIn("| (rw [Axler.VectorSpace.add_smul]; done)", cmd)
        self.assertIn("| (nth_rw 2 [← Axler.VectorSpace.add_smul]; done)", cmd)

    def test_sums_nest_left_and_numerals_are_typed(self):
        self.assertEqual(render.term({"add": [u, v, {"zero": True}]}), "((u + v) + (0 : V))")
        self.assertEqual(render.term({"mul": [{"n": -1}, a]}), "((-1 : F) * a)")
        self.assertEqual(render.term({"neg": v}), "(-v)")

    def test_arith(self):
        self.assertTrue(render.move({"mul": [{"n": 2}, {"n": 3}]}, {"n": 6}, "arith").endswith("norm_num"))

    def test_rejects(self):
        bad = [
            ({"add": [a, v]}, a, "add_comm"),                       # scalar + vector
            ({"smul": [v, a]}, v, "add_comm"),                      # vector • scalar
            ({"mul": [u, v]}, u, "mul_comm"),                       # vectors don't multiply
            (a, v, "add_comm"),                                     # scalar = vector
            ({"s": "#eval"}, a, "add_comm"),                        # names are letters only
            ({"s": "ab"}, a, "add_comm"),
            ({"v": "a"}, a, "add_comm"),                            # a both scalar and vector
            ({"n": 10**9}, a, "add_comm"),
            ({"n": True}, a, "add_comm"),
            ({"add": [a]}, a, "add_comm"),
            ({"zero": 1}, v, "add_comm"),
            ({"x": 1}, a, "add_comm"),
            (a, b, "sorry"),                                        # unknown move
            (a, b, "simp"),
        ]
        for lhs, rhs, rule in bad:
            with self.assertRaises(render.BadInput, msg=(lhs, rhs, rule)):
                render.move(lhs, rhs, rule)

    def test_limits(self):
        deep = a
        for _ in range(40):
            deep = {"neg": deep}
        with self.assertRaises(render.BadInput):
            render.statement(deep, a)
        wide = {"add": [a] * 300}
        with self.assertRaises(render.BadInput):
            render.statement(wide, a)

    def test_only_known_text_reaches_lean(self):
        # everything in the output comes from the header, the rule table, or a checked name/numeral
        cmd = render.move({"smul": [{"n": 2}, {"add": [u, v]}]}, {"add": [{"smul": [{"n": 2}, u]}, {"smul": [{"n": 2}, v]}]}, "smul_add")
        self.assertNotIn("#", cmd)
        self.assertNotIn("eval", cmd)


class Live(unittest.TestCase):
    def test_theorem(self):
        t = render.theorem({"smul": [{"n": 0}, v]}, {"zero": True})
        self.assertTrue(t.startswith("theorem level1 {F V : Type}"))
        self.assertIn("(v : V) :\n    ((0 : F) • v) = (0 : V) := by", t)
        with self.assertRaises(render.BadInput):
            render.theorem(a, v)
        with self.assertRaises(render.BadInput):
            render.theorem(a, b, name="x; #eval")

    def test_step(self):
        tac = render.step({"add": [u, {"zero": True}]}, u, ["add_zero"])
        self.assertTrue(tac.startswith("refine Eq.trans (show (u + (0 : V)) = u by first | ac_rfl | " + render.REARRANGE + " | (rw [Axler.AddLaws.add_zero] <;> ac_rfl)"))
        self.assertTrue(tac.endswith(") ?_ <;> try with_reducible rfl"))
        self.assertIn("(nth_rw 2 [← Axler.AddLaws.add_comm] <;> ac_rfl)", tac)  # a companion law, after the hint
        self.assertNotIn("add_smul", tac)  # not every law: a refusal has to come back quickly
        self.assertIn("add_smul", render.step(u, u, ["add_smul"]))
        self.assertNotIn("#", tac)
        with self.assertRaises(render.BadInput):
            render.step(a, v)
        self.assertNotIn("sorry", render.step(u, u, ["sorry"]))  # unknown hints are dropped

    def test_forall_hypothesis(self):
        o, x = {"v": "o"}, {"v": "x"}
        t = render.theorem(o, {"zero": True}, hyps=[[{"add": [x, o]}, x, "x"]])
        self.assertIn("(o : V) (h1 : ∀ x : V, (x + o) = x) :", t)
        self.assertNotIn("(o x : V)", t)
        with self.assertRaises(render.BadInput):
            render.theorem(o, {"zero": True}, hyps=[[{"add": [x, o]}, x, "o"]])  # bound name must be fresh
        with self.assertRaises(render.BadInput):
            render.theorem(o, {"zero": True}, hyps=[[{"add": [x, o]}, x, "x; #eval"]])

    def test_goal_and_hypothesis_steps(self):
        o, x, z = {"v": "o"}, {"v": "x"}, {"zero": True}
        g = render.goal_step(z, {"add": [o, z]}, ["h1"], nhyps=1)
        self.assertTrue(g.startswith("refine Eq.trans ?_ (show (o + (0 : V)) = (0 : V) by first | "))
        self.assertIn("rw [h1]", g)
        h = render.hyp_step("h1", [{"add": [x, o]}, x], [{"add": [o, x]}, x], bind="x", nhyps=1)
        self.assertTrue(h.startswith("replace h1 : ∀ x : V, (o + x) = x := fun x => Eq.trans (show (o + x) = (x + o) by first | "))
        self.assertIn("(Eq.trans (h1 x) rfl)", h)
        h2 = render.hyp_step("h2", [{"add": [x, o]}, z], [{"add": [o, x]}, z], nhyps=2)
        self.assertIn("(Eq.trans h2 rfl)", h2)
        for bad in [("h0", None), ("h1; #eval", None), ("h1", "x y")]:
            with self.assertRaises(render.BadInput):
                render.hyp_step(bad[0], [o, z], [o, z], bind=bad[1])

    def test_membership(self):
        u = {"v": "u"}
        t = render.mem_theorem({"neg": u}, "closed", ["u"])
        self.assertIn("(U : Set V) (h0 : (0 : V) ∈ U)", t)
        self.assertTrue(t.endswith("(u : V) (hu : u ∈ U) :\n    (-u) ∈ U := by"))
        self.assertEqual(render.mem_step(0, "closed", "hs"), "refine hs _ _ ?_")
        self.assertEqual(render.mem_step(1, "closed", "hu"), "(rotate_left 1; exact hu; rotate_right 1)")
        r = render.mem_step(0, "closed", None, {"neg": u}, {"smul": [{"n": -1}, u]}, ["neg_one_smul"])
        self.assertTrue(r.startswith("refine (congrArg (· ∈ U) (show (-u) = ((-1 : F) • u) by first | "))
        self.assertIn("Axler.VectorSpace.neg_one_smul", r)
        self.assertEqual(render.mem_step(0, "subspace", "h.add"), "refine h.add_mem _ _ ?_ ?_")
        for bad in [(0, "closed", "h.add"), (0, "nope", "h0"), (-1, "closed", "h0"), (0, "closed", "hs; #eval")]:
            with self.assertRaises(render.BadInput):
                render.mem_step(*bad)
        with self.assertRaises(render.BadInput):
            render.mem_theorem(u, "closed; #eval", [])

    def test_hypotheses(self):
        z = {"zero": True}
        t = render.theorem(v, {"v": "w2"}, hyps=[[{"add": [u, v]}, z]])
        self.assertIn("(u v w2 : V) (h1 : (u + v) = (0 : V)) :", t)
        tac = render.step({"add": [u, v]}, z, ["h1"], nhyps=1)
        self.assertIn("(rw [h1] <;> ac_rfl)", tac)
        self.assertNotIn("h1", render.step({"add": [u, v]}, z, ["h1"], nhyps=0))  # not a hypothesis of this theorem
        with self.assertRaises(render.BadInput):
            render.theorem(v, u, hyps=[[a, v]])

    def test_witness(self):
        t = render.witness({"smul": [{"n": 0}, v]}, "y1", "h1")
        self.assertEqual(t, "obtain ⟨y1, h1⟩ := Axler.AddLaws.exists_add_eq_zero ((0 : F) • v)")
        for bad in [("x", "h1"), ("y1", "hh"), ("y1; #eval", "h1")]:
            with self.assertRaises(render.BadInput):
                render.witness(v, *bad)
        with self.assertRaises(render.BadInput):
            render.witness(a, "y1", "h1")  # scalars: not this axiom

    def test_auto(self):
        self.assertIn("| ac_rfl", render.move({"add": [u, v]}, {"add": [v, u]}, "auto"))


if __name__ == "__main__":
    unittest.main()
