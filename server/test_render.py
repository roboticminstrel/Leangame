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
        self.assertTrue(tac.startswith("refine Eq.trans (show (u + (0 : V)) = u by first | ac_rfl | (rw [Axler.AddLaws.add_zero]; done)"))
        self.assertTrue(tac.endswith(") ?_ <;> try with_reducible rfl"))
        self.assertIn("(nth_rw 2 [← Axler.VectorSpace.add_smul]; ac_rfl)", tac)  # every rule, after the hint
        self.assertNotIn("#", tac)
        with self.assertRaises(render.BadInput):
            render.step(a, v)
        self.assertNotIn("sorry", render.step(u, u, ["sorry"]))  # unknown hints are dropped

    def test_hypotheses(self):
        z = {"zero": True}
        t = render.theorem(v, {"v": "w2"}, hyps=[[{"add": [u, v]}, z]])
        self.assertIn("(u v w2 : V) (h1 : (u + v) = (0 : V)) :", t)
        tac = render.step({"add": [u, v]}, z, ["h1"], nhyps=1)
        self.assertIn("(rw [h1]; done)", tac)
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
