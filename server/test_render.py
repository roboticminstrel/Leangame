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


if __name__ == "__main__":
    unittest.main()
